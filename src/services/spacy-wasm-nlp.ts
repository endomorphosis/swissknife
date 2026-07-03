/**
 * spacy-wasm-nlp.ts
 *
 * TypeScript bridge to spaCy 3.4 running inside Pyodide (CPython→WASM).
 *
 * Approach (matching sedbytes/spacy-wasm):
 *   1. Load Pyodide from the npm package (pyodide@0.21.x).
 *   2. Use micropip to install spaCy + its C-extension dependencies, which were
 *      pre-compiled for `emscripten_3_1_14_wasm32` (same target Pyodide 0.21 uses).
 *   3. Load `en_core_web_sm` (pure-Python model, no compilation needed).
 *   4. Expose `extract(text)` which runs the full spaCy NER + POS + dep pipeline
 *      and returns structured predicates.
 *
 * Fallback: when Pyodide cannot be loaded (offline, test env, Node without WASM
 * support) the service falls back to a lightweight regex-based extractor that
 * provides a subset of the same fields.
 *
 * Environment variables:
 *   SPACY_WASM_PACKAGES_BASE_URL  — base URL for the pre-compiled .whl files
 *                                   (default: GitHub raw sedbytes/spacy-wasm)
 *   SPACY_WASM_DISABLE            — set to "1" to always use the regex fallback
 *   SPACY_WASM_PYODIDE_INDEX_URL  — override the Pyodide indexURL (rare)
 */

/* -------------------------------------------------------------------------
 * Public types
 * ---------------------------------------------------------------------- */

export interface SpacyEntity {
  text:  string;
  label: string; // e.g. PERSON, ORG, GPE, DATE, LAW …
  start: number; // token index
  end:   number; // token index (exclusive)
}

export interface SpacyPredicates {
  nouns:      string[];
  verbs:      string[];
  adjectives: string[];
  relations:  string[];
  entities:   SpacyEntity[];
}

/* -------------------------------------------------------------------------
 * Python extraction script (injected into Pyodide)
 * ---------------------------------------------------------------------- */

const SPACY_EXTRACT_PY = `
import json

def _extract(text, nlp):
    doc = nlp(text)
    nouns = set()
    for token in doc:
        if token.pos_ in ("NOUN", "PROPN"):
            if token.dep_ == "compound":
                nouns.add(f"{token.text}_{token.head.text}")
            else:
                nouns.add(token.text)
    verbs = {t.lemma_ for t in doc if t.pos_ == "VERB" and t.dep_ in ("ROOT","xcomp","ccomp")}
    adjs  = {t.lemma_ for t in doc if t.pos_ == "ADJ"}
    ents  = [{"text": e.text, "label": e.label_, "start": e.start, "end": e.end} for e in doc.ents]

    # Dependency-based semantic relations: subject-verb-object triples
    relations = []
    for token in doc:
        if token.dep_ in ("nsubj","nsubjpass") and token.head.pos_ == "VERB":
            subj = token.text
            verb = token.head.lemma_
            objs = [c.text for c in token.head.children if c.dep_ in ("dobj","attr","pobj","oprd")]
            for obj in objs:
                relations.append(f"{subj}_{verb}_{obj}")
    return json.dumps({
        "nouns": list(nouns),
        "verbs": list(verbs),
        "adjectives": list(adjs),
        "entities": ents,
        "relations": relations,
    })

_extract
`;

/* -------------------------------------------------------------------------
 * SpacyWasmNlp service
 * ---------------------------------------------------------------------- */

export class SpacyWasmNlp {
  private pyodide:      unknown = null;
  private extractFn:    unknown = null;
  private spacyNlp:     unknown = null;
  private loadingPromise: Promise<boolean> | null = null;
  private initialized = false;

  private readonly packagesBaseUrl: string;
  private readonly pyodideIndexUrl: string | undefined;
  private readonly disabled: boolean;

  constructor(options?: {
    packagesBaseUrl?:  string;
    pyodideIndexUrl?:  string;
    disabled?:         boolean;
  }) {
    const env = typeof process !== 'undefined' ? process.env : {};
    this.packagesBaseUrl  = options?.packagesBaseUrl
      ?? env['SPACY_WASM_PACKAGES_BASE_URL']
      ?? 'https://raw.githubusercontent.com/sedbytes/spacy-wasm/master/packages';
    this.pyodideIndexUrl  = options?.pyodideIndexUrl ?? env['SPACY_WASM_PYODIDE_INDEX_URL'];
    this.disabled         = options?.disabled ?? env['SPACY_WASM_DISABLE'] === '1';
  }

  /** Whether spaCy-WASM is ready to process text. */
  isAvailable(): boolean { return this.initialized && this.extractFn !== null; }

  /**
   * Load Pyodide, install spaCy via micropip, and warm up the en_core_web_sm
   * model.  Safe to call multiple times — subsequent calls reuse the cached
   * instance.
   *
   * Returns true on success, false when falling back to regex mode.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return this.isAvailable();
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this._doInitialize();
    return this.loadingPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    if (this.disabled) {
      console.log('[SpacyWasmNlp] Disabled via config — using regex fallback.');
      this.initialized = true;
      return false;
    }

    try {
      // Dynamic import so the service works even when pyodide is not installed
      // (optional peer dependency)
      const pyodideModule = await import('pyodide') as { loadPyodide(opts?: { indexURL?: string }): Promise<unknown> };

      console.log('[SpacyWasmNlp] Loading Pyodide runtime…');
      const opts: { indexURL?: string } = {};
      if (this.pyodideIndexUrl) opts.indexURL = this.pyodideIndexUrl;
      // For the npm package, indexURL defaults to the embedded data files
      const py = await pyodideModule.loadPyodide(opts);
      this.pyodide = py;

      const pyAny = py as Record<string, (code: string) => unknown> & {
        loadPackage(pkg: string[]): Promise<void>;
        runPythonAsync(code: string): Promise<unknown>;
      };

      console.log('[SpacyWasmNlp] Installing micropip and numpy/pydantic…');
      await pyAny.loadPackage(['micropip', 'numpy', 'pydantic']);

      // Build the micropip install list
      const EMSC = 'cp310-cp310-emscripten_3_1_14_wasm32';
      const basePackages = [
        `blis-0.7.8-${EMSC}.whl`,
        `cymem-2.0.6-${EMSC}.whl`,
        `murmurhash-1.0.7-${EMSC}.whl`,
        `preshed-3.0.6-${EMSC}.whl`,
        `srsly-2.4.3-${EMSC}.whl`,
        `thinc-8.1.0-${EMSC}.whl`,
        `spacy-3.4.0-${EMSC}.whl`,
      ];
      const modelPackage = `en_core_web_sm-3.4.0-py3-none-any.whl`;
      const allUrls = [
        ...basePackages.map(p => `${this.packagesBaseUrl}/${p}`),
        `${this.packagesBaseUrl}/${modelPackage}`,
      ];

      console.log('[SpacyWasmNlp] Installing spaCy WASM packages via micropip…');
      await pyAny.runPythonAsync(
        `import micropip; await micropip.install(${JSON.stringify(allUrls)})`
      );

      console.log('[SpacyWasmNlp] Loading spaCy en_core_web_sm model…');
      await pyAny.runPythonAsync(`import spacy; _spacy_nlp = spacy.load("en_core_web_sm")`);

      // Compile the extraction function and hand off a reference
      const extract = await pyAny.runPythonAsync(SPACY_EXTRACT_PY);
      this.extractFn = extract;
      this.spacyNlp  = await pyAny.runPythonAsync('_spacy_nlp');

      this.initialized = true;
      console.log('[SpacyWasmNlp] Ready — spaCy NER active.');
      return true;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[SpacyWasmNlp] Initialization failed (${msg}). Using regex fallback.`);
      this.initialized = true;
      return false;
    }
  }

  /**
   * Extract linguistic predicates from text using spaCy (or regex fallback).
   *
   * @param text — Input text to analyse.
   * @returns SpacyPredicates with nouns, verbs, adjectives, entities, relations.
   */
  async extract(text: string): Promise<SpacyPredicates> {
    if (!this.initialized) await this.initialize();

    if (this.isAvailable()) {
      try {
        return await this._spacyExtract(text);
      } catch (err: unknown) {
        console.warn('[SpacyWasmNlp] spaCy extraction error; falling back to regex:', err);
      }
    }
    return regexFallbackExtract(text);
  }

  private async _spacyExtract(text: string): Promise<SpacyPredicates> {
    // Call the Python function: _extract(text, nlp) → JSON string
    const pyFn  = this.extractFn  as (text: string, nlp: unknown) => unknown;
    const raw   = pyFn(text, this.spacyNlp);
    const jsStr = typeof (raw as { toString(): string }).toString === 'function'
      ? (raw as { toString(): string }).toString()
      : String(raw);
    return JSON.parse(jsStr) as SpacyPredicates;
  }
}

/* -------------------------------------------------------------------------
 * Regex-based fallback (no external deps, runs in all environments)
 * Matches the field structure that spaCy returns so callers need no branching.
 * ---------------------------------------------------------------------- */

const ENTITY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/g, label: 'DATE' },
  { re: /\b[12]\d{3}\b/g,                                                                                  label: 'DATE' },
  { re: /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g,                                                     label: 'PERSON' },
  { re: /\b(?:Inc|LLC|Ltd|Corp|Company|Association|University|Institute)\b/g,                              label: 'ORG' },
  { re: /\b(?:must|shall|may|required|permitted|obligated|prohibited|forbidden)\b/g,                       label: 'LAW' },
];

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can','could',
  'in','on','at','to','for','of','with','by','from','as','up','out','not','but','and','or',
]);

export function regexFallbackExtract(text: string): SpacyPredicates {
  const lower = text.toLowerCase();
  const words  = text.match(/\b[a-zA-Z]{3,}\b/g) ?? [];

  // Nouns: capitalised words not at sentence start, or title-case multi-word
  const nouns = [...new Set(
    (text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).filter(w => !STOPWORDS.has(w.toLowerCase()))
  )];

  // Verbs: common action words via simple lookup patterns
  const verbPat = /\b(?:is|are|was|were|has|have|had|do|does|did|will|can|should|may|might|must|shall|provide|require|permit|prohibit|ensure|establish|create|define|use|include|apply|implement|support|enable|allow|prevent|protect|maintain|monitor|review|assess|evaluate)\b/gi;
  const verbs = [...new Set((text.match(verbPat) ?? []).map(v => v.toLowerCase()))];

  // Adjectives: very basic — words immediately before nouns
  const adjPat = /\b(legal|public|private|federal|state|local|national|international|official|formal|general|specific|mandatory|optional|required|permitted|prohibited)\b/gi;
  const adjectives = [...new Set((text.match(adjPat) ?? []).map(a => a.toLowerCase()))];

  // Entities from pattern list
  const entities: SpacyEntity[] = [];
  const seen = new Set<string>();
  for (const { re, label } of ENTITY_PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      const t = m[0];
      if (!seen.has(t)) { seen.add(t); entities.push({ text: t, label, start: 0, end: 0 }); }
    }
  }

  return { nouns, verbs, adjectives, entities, relations: [] };
}

/* -------------------------------------------------------------------------
 * Module-level singleton (lazy)
 * ---------------------------------------------------------------------- */

let _globalSpacy: SpacyWasmNlp | null = null;

export function getSpacyWasmNlp(options?: ConstructorParameters<typeof SpacyWasmNlp>[0]): SpacyWasmNlp {
  if (!_globalSpacy) _globalSpacy = new SpacyWasmNlp(options);
  return _globalSpacy;
}

/** Convenience wrapper — initialises the singleton and runs extraction. */
export async function extractPredicatesNlp(text: string): Promise<SpacyPredicates> {
  const nlp = getSpacyWasmNlp();
  return nlp.extract(text);
}

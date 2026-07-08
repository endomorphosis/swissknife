/**
 * Browser-safe spaCy-style predicate extraction.
 *
 * The default runtime is the local regex extractor. Loading an in-browser
 * Python runtime is an explicit sandbox capability that callers must opt into
 * with `enablePythonSandbox` or `sandbox.enabled`.
 */

export interface SpacyEntity {
  text: string;
  label: string;
  start: number;
  end: number;
}

export interface SpacyPredicates {
  nouns: string[];
  verbs: string[];
  adjectives: string[];
  relations: string[];
  entities: SpacyEntity[];
}

export interface PyodideRuntime {
  loadPackage(pkg: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
}

export interface PyodideModule {
  loadPyodide(opts?: { indexURL?: string }): Promise<PyodideRuntime>;
}

export type PyodideModuleLoader = () => Promise<PyodideModule>;

export interface BrowserPythonSandboxOptions {
  enabled?: boolean;
  loadPyodide?: PyodideModuleLoader;
  pyodideIndexUrl?: string;
  packagesBaseUrl?: string;
  requireSecureContext?: boolean;
  allowNetworkPackageInstall?: boolean;
  maxInputChars?: number;
}

export interface SpacyWasmNlpOptions {
  packagesBaseUrl?: string;
  pyodideIndexUrl?: string;
  disabled?: boolean;
  enablePythonSandbox?: boolean;
  pyodideLoader?: PyodideModuleLoader;
  sandbox?: BrowserPythonSandboxOptions;
}

export interface BrowserPythonSandboxStatus {
  capability: 'browser-python-sandbox';
  enabled: boolean;
  active: boolean;
  reason: string;
  requireSecureContext: boolean;
  allowNetworkPackageInstall: boolean;
  maxInputChars: number;
  packagesBaseUrl: string;
}

const DEFAULT_PACKAGES_BASE_URL = 'https://raw.githubusercontent.com/sedbytes/spacy-wasm/master/packages';
const DEFAULT_MAX_INPUT_CHARS = 20_000;
const DEFAULT_PY_RUNTIME_PACKAGE = ['pyo', 'dide'].join('');

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

function envValue(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env?.[name];
}

function envFlag(name: string): boolean {
  return envValue(name) === '1' || envValue(name) === 'true';
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isSecureBrowserContext(): boolean {
  return !isBrowserRuntime() || globalThis.isSecureContext === true;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function packageBaseUrlIsNetworked(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function packageUrl(baseUrl: string, fileName: string): string {
  return `${normalizeBaseUrl(baseUrl)}/${fileName}`;
}

export function createPyodideSandboxLoader(specifier = DEFAULT_PY_RUNTIME_PACKAGE): PyodideModuleLoader {
  return async () => import(/* @vite-ignore */ specifier) as Promise<PyodideModule>;
}

export class SpacyWasmNlp {
  private runtime: PyodideRuntime | null = null;
  private extractFn: unknown = null;
  private spacyNlp: unknown = null;
  private loadingPromise: Promise<boolean> | null = null;
  private initialized = false;
  private readonly packagesBaseUrl: string;
  private readonly pyodideIndexUrl: string | undefined;
  private readonly disabled: boolean;
  private readonly sandboxEnabled: boolean;
  private readonly pyodideLoader: PyodideModuleLoader;
  private readonly requireSecureContext: boolean;
  private readonly allowNetworkPackageInstall: boolean;
  private readonly maxInputChars: number;
  private unavailableReason = 'not initialized';

  constructor(options: SpacyWasmNlpOptions = {}) {
    const sandbox = options.sandbox ?? {};
    this.packagesBaseUrl = sandbox.packagesBaseUrl
      ?? options.packagesBaseUrl
      ?? envValue('SPACY_WASM_PACKAGES_BASE_URL')
      ?? DEFAULT_PACKAGES_BASE_URL;
    this.pyodideIndexUrl = sandbox.pyodideIndexUrl
      ?? options.pyodideIndexUrl
      ?? envValue('SPACY_WASM_PYODIDE_INDEX_URL');
    this.disabled = options.disabled ?? envFlag('SPACY_WASM_DISABLE');
    this.sandboxEnabled = sandbox.enabled
      ?? options.enablePythonSandbox
      ?? envFlag('SPACY_WASM_ENABLE_PYTHON_SANDBOX');
    this.pyodideLoader = sandbox.loadPyodide
      ?? options.pyodideLoader
      ?? createPyodideSandboxLoader();
    this.requireSecureContext = sandbox.requireSecureContext ?? true;
    this.allowNetworkPackageInstall = sandbox.allowNetworkPackageInstall ?? this.sandboxEnabled;
    this.maxInputChars = sandbox.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  }

  isAvailable(): boolean {
    return this.initialized && this.extractFn !== null;
  }

  sandboxStatus(): BrowserPythonSandboxStatus {
    return {
      capability: 'browser-python-sandbox',
      enabled: this.sandboxEnabled && !this.disabled,
      active: this.isAvailable(),
      reason: this.isAvailable() ? 'spaCy runtime active' : this.unavailableReason,
      requireSecureContext: this.requireSecureContext,
      allowNetworkPackageInstall: this.allowNetworkPackageInstall,
      maxInputChars: this.maxInputChars,
      packagesBaseUrl: this.packagesBaseUrl,
    };
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return this.isAvailable();
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.doInitialize();
    return this.loadingPromise;
  }

  private async doInitialize(): Promise<boolean> {
    if (this.disabled) {
      this.unavailableReason = 'disabled by configuration';
      this.initialized = true;
      return false;
    }

    if (!this.sandboxEnabled) {
      this.unavailableReason = 'browser Python sandbox was not explicitly enabled';
      this.initialized = true;
      return false;
    }

    if (this.requireSecureContext && !isSecureBrowserContext()) {
      this.unavailableReason = 'secure browser context required';
      this.initialized = true;
      return false;
    }

    if (packageBaseUrlIsNetworked(this.packagesBaseUrl) && !this.allowNetworkPackageInstall) {
      this.unavailableReason = 'network package installation is not allowed';
      this.initialized = true;
      return false;
    }

    try {
      const pyodideModule = await this.pyodideLoader();
      const opts: { indexURL?: string } = {};
      if (this.pyodideIndexUrl) opts.indexURL = this.pyodideIndexUrl;
      const runtime = await pyodideModule.loadPyodide(opts);
      this.runtime = runtime;

      await runtime.loadPackage(['micropip', 'numpy', 'pydantic']);

      const emscriptenTarget = 'cp310-cp310-emscripten_3_1_14_wasm32';
      const basePackages = [
        `blis-0.7.8-${emscriptenTarget}.whl`,
        `cymem-2.0.6-${emscriptenTarget}.whl`,
        `murmurhash-1.0.7-${emscriptenTarget}.whl`,
        `preshed-3.0.6-${emscriptenTarget}.whl`,
        `srsly-2.4.3-${emscriptenTarget}.whl`,
        `thinc-8.1.0-${emscriptenTarget}.whl`,
        `spacy-3.4.0-${emscriptenTarget}.whl`,
      ];
      const modelPackage = 'en_core_web_sm-3.4.0-py3-none-any.whl';
      const allUrls = [
        ...basePackages.map(fileName => packageUrl(this.packagesBaseUrl, fileName)),
        packageUrl(this.packagesBaseUrl, modelPackage),
      ];

      await runtime.runPythonAsync(
        `import micropip; await micropip.install(${JSON.stringify(allUrls)})`,
      );
      await runtime.runPythonAsync('import spacy; _spacy_nlp = spacy.load("en_core_web_sm")');

      this.extractFn = await runtime.runPythonAsync(SPACY_EXTRACT_PY);
      this.spacyNlp = await runtime.runPythonAsync('_spacy_nlp');
      this.unavailableReason = 'spaCy runtime active';
      this.initialized = true;
      return true;
    } catch (error: unknown) {
      this.unavailableReason = error instanceof Error ? error.message : String(error);
      this.initialized = true;
      return false;
    }
  }

  async extract(text: string): Promise<SpacyPredicates> {
    if (!this.initialized) await this.initialize();

    if (this.isAvailable()) {
      try {
        return await this.spacyExtract(text);
      } catch {
        return regexFallbackExtract(text);
      }
    }

    return regexFallbackExtract(text);
  }

  private async spacyExtract(text: string): Promise<SpacyPredicates> {
    if (text.length > this.maxInputChars) {
      throw new Error(`Input exceeds browser Python sandbox limit (${this.maxInputChars} characters).`);
    }

    const pyFn = this.extractFn as (text: string, nlp: unknown) => unknown;
    const raw = pyFn(text, this.spacyNlp);
    const jsStr = typeof (raw as { toString?: () => string }).toString === 'function'
      ? (raw as { toString: () => string }).toString()
      : String(raw);
    return JSON.parse(jsStr) as SpacyPredicates;
  }
}

const ENTITY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/g, label: 'DATE' },
  { re: /\b[12]\d{3}\b/g, label: 'DATE' },
  { re: /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g, label: 'PERSON' },
  { re: /\b(?:Inc|LLC|Ltd|Corp|Company|Association|University|Institute)\b/g, label: 'ORG' },
  { re: /\b(?:must|shall|may|required|permitted|obligated|prohibited|forbidden)\b/g, label: 'LAW' },
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'up', 'out', 'not', 'but', 'and', 'or',
]);

export function regexFallbackExtract(text: string): SpacyPredicates {
  const nouns = [...new Set(
    (text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).filter(word => !STOPWORDS.has(word.toLowerCase())),
  )];

  const verbPat = /\b(?:is|are|was|were|has|have|had|do|does|did|will|can|should|may|might|must|shall|provide|require|permit|prohibit|ensure|establish|create|define|use|include|apply|implement|support|enable|allow|prevent|protect|maintain|monitor|review|assess|evaluate)\b/gi;
  const verbs = [...new Set((text.match(verbPat) ?? []).map(verb => verb.toLowerCase()))];

  const adjPat = /\b(legal|public|private|federal|state|local|national|international|official|formal|general|specific|mandatory|optional|required|permitted|prohibited)\b/gi;
  const adjectives = [...new Set((text.match(adjPat) ?? []).map(adjective => adjective.toLowerCase()))];

  const entities: SpacyEntity[] = [];
  const seen = new Set<string>();
  for (const { re, label } of ENTITY_PATTERNS) {
    for (const match of text.matchAll(new RegExp(re.source, 'g'))) {
      const entityText = match[0];
      if (!seen.has(entityText)) {
        seen.add(entityText);
        entities.push({ text: entityText, label, start: 0, end: 0 });
      }
    }
  }

  return { nouns, verbs, adjectives, entities, relations: [] };
}

let globalSpacy: SpacyWasmNlp | null = null;

export function getSpacyWasmNlp(options?: SpacyWasmNlpOptions): SpacyWasmNlp {
  if (!globalSpacy) globalSpacy = new SpacyWasmNlp(options);
  return globalSpacy;
}

export async function extractPredicatesNlp(text: string): Promise<SpacyPredicates> {
  return getSpacyWasmNlp().extract(text);
}

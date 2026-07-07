/**
 * modal-ir-decompiler.ts
 *
 * Modal IR decompiler — convert modal IR documents back to natural text.
 * TypeScript port of key public API from:
 *   ipfs_datasets_py/logic/modal/decompiler.py
 *
 * Provides (deterministic, no ML deps):
 *   DecodedModalPhrase        — one phrase from a modal IR slot
 *   DecodedModalText          — full decompiled text + provenance
 *   decodeModalIRDocument()   — ModalIRDocument → DecodedModalText
 *   modalFormulaToText()      — formula string → natural language
 *   modalTextTokenSimilarity() — token-level similarity between two texts
 */

// ---------------------------------------------------------------------------
// DecodedModalPhrase
// ---------------------------------------------------------------------------

export class DecodedModalPhrase {
  readonly text: string;
  readonly slot: string;
  readonly spans: number[][];
  readonly fixed: boolean;
  readonly provenanceOnly: boolean;

  constructor(opts: {
    text: string;
    slot: string;
    spans?: number[][];
    fixed?: boolean;
    provenanceOnly?: boolean;
  }) {
    this.text = opts.text;
    this.slot = opts.slot;
    this.spans = opts.spans ?? [];
    this.fixed = opts.fixed ?? false;
    this.provenanceOnly = opts.provenanceOnly ?? false;
  }

  toDict(): Record<string, unknown> {
    return {
      text: this.text,
      slot: this.slot,
      spans: this.spans,
      fixed: this.fixed,
      provenance_only: this.provenanceOnly,
    };
  }
}

// ---------------------------------------------------------------------------
// DecodedModalText
// ---------------------------------------------------------------------------

export class DecodedModalText {
  readonly sourceId: string;
  readonly text: string;
  readonly phrases: DecodedModalPhrase[];
  readonly supportSpan: number[];
  readonly reconstructionSimilarity: number;
  readonly modalSpanCoverage: number;
  readonly reconstructionStrategy: string;
  readonly parserWarnings: string[];
  readonly missingSlots: string[];
  readonly formulas: string[];

  constructor(opts: {
    sourceId: string;
    text: string;
    phrases: DecodedModalPhrase[];
    supportSpan?: number[];
    reconstructionSimilarity?: number;
    modalSpanCoverage?: number;
    reconstructionStrategy?: string;
    parserWarnings?: string[];
    missingSlots?: string[];
    formulas?: string[];
  }) {
    this.sourceId = opts.sourceId;
    this.text = opts.text;
    this.phrases = opts.phrases;
    this.supportSpan = opts.supportSpan ?? [0, opts.text.length];
    this.reconstructionSimilarity = opts.reconstructionSimilarity ?? 0;
    this.modalSpanCoverage = opts.modalSpanCoverage ?? 0;
    this.reconstructionStrategy = opts.reconstructionStrategy ?? 'provenance_span_reconstruction_v1';
    this.parserWarnings = opts.parserWarnings ?? [];
    this.missingSlots = opts.missingSlots ?? [];
    this.formulas = opts.formulas ?? [];
  }

  toDict(): Record<string, unknown> {
    return {
      source_id: this.sourceId,
      text: this.text,
      phrases: this.phrases.map(p => p.toDict()),
      support_span: this.supportSpan,
      reconstruction_similarity: this.reconstructionSimilarity,
      modal_span_coverage: this.modalSpanCoverage,
      reconstruction_strategy: this.reconstructionStrategy,
      parser_warnings: this.parserWarnings,
      missing_slots: this.missingSlots,
      formulas: this.formulas,
    };
  }
}

export function decodedModalPhraseSlotTextMap(
  decoded: DecodedModalText,
  options?: {
    includeFixed?: boolean;
    includeProvenanceOnly?: boolean;
  },
): Record<string, string[]> {
  const includeFixed = options?.includeFixed ?? false;
  const includeProvenanceOnly = options?.includeProvenanceOnly ?? true;

  const slotTexts: Record<string, string[]> = {};
  for (const phrase of decoded.phrases) {
    if (phrase.fixed && !includeFixed) continue;
    if (phrase.provenanceOnly && !includeProvenanceOnly) continue;

    const slot = cleanText(phrase.slot);
    const text = cleanText(phrase.text);
    if (!slot || !text) continue;

    const values = slotTexts[slot] ?? [];
    if (!values.includes(text)) values.push(text);
    slotTexts[slot] = values;
  }

  return slotTexts;
}

// ---------------------------------------------------------------------------
// ModalIRDocument minimal interface for decoding
// ---------------------------------------------------------------------------

export interface ModalIRFormula {
  formulaType: string;
  formulaId?: string;
  operator?: string | {
    family?: string;
    system?: string;
    symbol?: string;
    label?: string;
  };
  predicate?: {
    name?: string;
    arguments?: string[];
    role?: string | null;
  };
  actor?: string;
  action?: string;
  conditions?: string[];
  exceptions?: string[];
  provenance?: {
    sourceId?: string;
    startChar?: number;
    endChar?: number;
    citation?: string | null;
  };
  metadata?: Record<string, unknown>;
  sourceText?: string;
}

export interface ModalIRDocument {
  documentId: string;
  sourceText?: string;
  normalizedText?: string;
  formulas?: ModalIRFormula[];
  metadata?: Record<string, unknown>;
}

const TRAILING_SECTION_PUNCT_RE = /[.;:]+$/;
const CITATION_SECTION_DELIMITER_RE = /[.-]+/g;
const USCODE_SOURCE_ID_RE = /^\s*(?<scheme>us-code)-(?<title>[^-]+)-(?<section>.+)-(?<digest>[0-9a-f]{16})\s*$/i;
const MODAL_CUE_TOKEN_RE = /[a-z0-9]+/g;
const TEMPORAL_BRIDGE_YEAR_RE = /(?<!\d)(?:18|19|20)\d{2}(?!\d)/;
const MODAL_OPERATOR_SYMBOL_FEATURE_KEYS: Record<string, string> = {
  'O|': 'o_pipe',
  '[a]': 'a_box',
  '□': 'box',
  '◇': 'diamond',
};
const DECOMPILER_TEMPORAL_CLAUSE_PREFIX_RELATIONS: Record<string, string> = {
  when: 'when',
  until: 'until',
  after: 'after',
  only_after: 'after',
  before: 'before',
  by: 'deadline',
  no_later_than: 'deadline',
  not_later_than: 'deadline',
  within: 'deadline',
  upon: 'after',
};
const DECOMPILER_TEMPORAL_BRIDGE_CONTEXT_TOKENS = new Set([
  'year',
  'day',
  'month',
  'deadline',
  'effective',
  'edition',
  'fiscal',
  'calendar',
  'immediately',
  'promptly',
  'timely',
  'period',
  'date',
]);
const TEMPORAL_BRIDGE_CONTEXT_PHRASES: Array<[string, string]> = [
  ['on and after', 'on_and_after'],
  ['on or after', 'on_or_after'],
  ['no later than', 'no_later_than'],
  ['not later than', 'not_later_than'],
  ['effective date', 'effective_date'],
  ['effective dates', 'effective_date'],
  ['fiscal year', 'fiscal_year'],
  ['fiscal years', 'fiscal_year'],
  ['calendar year', 'calendar_year'],
  ['calendar years', 'calendar_year'],
];

// ---------------------------------------------------------------------------
// modalFormulaToText
// ---------------------------------------------------------------------------

const OPERATOR_DESCRIPTIONS: Record<string, string> = {
  'O': 'is obligated to',
  'P': 'is permitted to',
  'F': 'is forbidden to',
  '□': 'it is necessarily the case that',
  '◊': 'it is possibly the case that',
  'X': 'at the next time point',
  'G': 'it is always the case that',
};

const OPERATOR_PHRASES: Record<string, string> = {
  O: 'obligatory',
  P: 'permitted',
  F: 'forbidden',
  G: 'always',
  X: 'next',
  K: 'known',
  'O|': 'conditionally obligatory',
  '[a]': 'after action',
  Frame: 'framed as',
  '□': 'necessary',
  '◇': 'possible',
};

/**
 * Convert a modal formula string to natural language.
 */
export function modalFormulaToText(formula: string): string {
  const f = formula.trim();

  // Handle deontic O/P/F with actor pattern: O[actor](action)
  const deonticMatch = f.match(/^([OPF])\[([^\]]+)\]\(([^)]+)\)$/);
  if (deonticMatch) {
    const [, op, actor, action] = deonticMatch;
    const verb = OPERATOR_DESCRIPTIONS[op] ?? op;
    return `${actor} ${verb} ${action}`;
  }

  // Handle simple O/P/F(content)
  const simpleMatch = f.match(/^([OPF])\(([^)]+)\)$/);
  if (simpleMatch) {
    const [, op, content] = simpleMatch;
    const verb = OPERATOR_DESCRIPTIONS[op] ?? op;
    return `It is the case that someone ${verb} ${content}`;
  }

  // Handle temporal □/◊/G/X(content)
  const temporalMatch = f.match(/^([□◊GX])\(([^)]+)\)$/);
  if (temporalMatch) {
    const [, op, content] = temporalMatch;
    const desc = OPERATOR_DESCRIPTIONS[op] ?? op;
    return `${desc}: ${content}`;
  }

  // Fallback: return formula as-is
  return f;
}

/**
 * Python parity for `modal/decompiler.py::modal_formula_to_text`.
 *
 * This renders a structured ModalIRFormula, not the legacy string pretty-printer
 * above that remains for older Sprint 44 tests.
 */
export function modalIrFormulaToText(formula: ModalIRFormula): string {
  const operator = typeof formula.operator === 'object' && formula.operator !== null
    ? formula.operator
    : {};
  const predicate = formula.predicate ?? {};
  const symbol = String(operator.symbol ?? formula.operator ?? '');
  const family = String(operator.family ?? '');
  const system = String(operator.system ?? '');
  const name = String(predicate.name ?? '');
  const args = Array.isArray(predicate.arguments) ? predicate.arguments : [];
  const predicateText = args.length ? `${name}(${args.join(', ')})` : name;
  return `${symbol}[${family}:${system}](${predicateText})`;
}

// ---------------------------------------------------------------------------
// decodeModalIRDocument
// ---------------------------------------------------------------------------

/**
 * Decode a ModalIRDocument into a DecodedModalText.
 * Deterministic compact port — no ML inference required.
 */
export function decodeModalIRDocument(doc: ModalIRDocument): DecodedModalText {
  const sourceId = doc.documentId;
  const sourceText = doc.normalizedText ?? doc.sourceText ?? '';
  const formulas = (doc.formulas ?? []);
  const sortedFormulas = [...formulas].sort((left, right) =>
    String(left.formulaId ?? '').localeCompare(String(right.formulaId ?? ''))
  );

  const phrases: DecodedModalPhrase[] = [];
  if (sourceText) {
    if (sortedFormulas.length > 0) {
      const spans = sortedFormulas
        .map(formula => formulaSpan(formula))
        .filter((span): span is [number, number] => Boolean(span));
      const merged = mergeSpans(spans, sourceText.length);
      let cursor = 0;
      for (const [start, end] of merged) {
        if (start > cursor) {
          phrases.push(new DecodedModalPhrase({
            text: sourceText.slice(cursor, start),
            slot: 'source_context_span',
            spans: [[cursor, start]],
          }));
        }
        phrases.push(new DecodedModalPhrase({
          text: sourceText.slice(start, end),
          slot: 'modal_source_span',
          spans: [[start, end]],
        }));
        cursor = end;
      }
      if (cursor < sourceText.length) {
        phrases.push(new DecodedModalPhrase({
          text: sourceText.slice(cursor),
          slot: 'source_context_span',
          spans: [[cursor, sourceText.length]],
        }));
      }
    } else {
      phrases.push(new DecodedModalPhrase({
        text: sourceText,
        slot: 'source_context_span',
        spans: [[0, sourceText.length]],
      }));
    }
  }

  const formulaTexts: string[] = [];
  for (const [index, f] of sortedFormulas.entries()) {
    if (index > 0) {
      phrases.push(new DecodedModalPhrase({ text: ';', slot: 'formula_separator', fixed: true }));
    }

    const span = formulaSpan(f);
    const spans = span ? [span] : [[index * 20, index * 20 + modalIrFormulaToText(f).length]];
    const text = f.predicate && typeof f.operator === 'object'
      ? modalIrFormulaToText(f)
      : modalFormulaToText(f.sourceText ?? `${f.formulaType}(${f.actor ?? 'Agent'},${f.action ?? 'Act'})`);
    formulaTexts.push(text);
    phrases.push(new DecodedModalPhrase({ text, slot: 'formula', spans, provenanceOnly: true }));

    if (typeof f.operator === 'object' && f.operator !== null) {
      const cueSpans = cueSpan(f) ? [cueSpan(f) as [number, number]] : spans;
      const operatorPhrase = modalOperatorPhrase(f);
      const symbol = cleanText(String(f.operator.symbol ?? ''));
      const family = cleanText(String(f.operator.family ?? ''));
      const system = cleanText(String(f.operator.system ?? ''));
      if (operatorPhrase) phrases.push(new DecodedModalPhrase({ text: operatorPhrase, slot: 'operator', spans: cueSpans, provenanceOnly: true }));
      if (symbol) phrases.push(new DecodedModalPhrase({ text: symbol, slot: 'modal_operator', spans: cueSpans, provenanceOnly: true }));
      if (family) phrases.push(new DecodedModalPhrase({ text: family, slot: 'modal_family', spans: cueSpans, provenanceOnly: true }));
      if (system) phrases.push(new DecodedModalPhrase({ text: system, slot: 'modal_system', spans: cueSpans, provenanceOnly: true }));
    }

    if (f.predicate) {
      const predicateText = predicatePhrase(f);
      if (predicateText) phrases.push(new DecodedModalPhrase({ text: predicateText, slot: 'predicate', spans, provenanceOnly: true }));
      const args = Array.isArray(f.predicate.arguments) ? f.predicate.arguments.filter(Boolean) : [];
      if (args.length > 0) phrases.push(new DecodedModalPhrase({ text: args.join(', '), slot: 'arguments', spans, provenanceOnly: true }));
    }
    for (const condition of f.conditions ?? []) {
      const text = cleanText(String(condition));
      if (text) phrases.push(new DecodedModalPhrase({ text, slot: 'condition', spans, provenanceOnly: true }));
    }
    for (const exception of f.exceptions ?? []) {
      const text = cleanText(String(exception));
      if (text) phrases.push(new DecodedModalPhrase({ text, slot: 'exception', spans, provenanceOnly: true }));
    }
  }

  // Reconstruct text from phrases
  const reconstructed = sourceText || (phrases.length > 0
    ? phrases.filter(phrase => !phrase.provenanceOnly && !phrase.fixed).map(p => p.text).join('. ') + '.'
    : sourceText);

  const fallbackReconstructed = !sourceText && phrases.length > 0
    ? phrases.map(p => p.text).join('. ') + '.'
    : sourceText;

  // Compute simple token similarity
  const similarity = sourceText ? modalTextTokenSimilarity(sourceText, reconstructed) : 0;

  const coverage = sourceText && sortedFormulas.length > 0
    ? modalSpanCoverage(sortedFormulas, sourceText.length)
    : formulas.length > 0
      ? Math.min(1.0, phrases.length / Math.max(1, formulas.length))
      : 0;

  const parserWarnings = Array.isArray(doc.metadata?.parser_warnings)
    ? doc.metadata.parser_warnings.map(String)
    : formulas.length === 0 ? ['No formulas in document'] : [];

  const missingSlots: string[] = [];
  if (formulas.length === 0) missingSlots.push('formulas');
  if (!sourceText) missingSlots.push('source_text');

  return new DecodedModalText({
    sourceId,
    text: sourceText ? reconstructed : fallbackReconstructed,
    phrases,
    supportSpan: supportSpan(sortedFormulas),
    reconstructionSimilarity: similarity,
    modalSpanCoverage: coverage,
    formulas: formulaTexts,
    parserWarnings,
    missingSlots,
  });
}

function formulaSpan(formula: ModalIRFormula): [number, number] | null {
  const start = Number(formula.provenance?.startChar);
  const end = Number(formula.provenance?.endChar);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return [Math.max(0, start), Math.max(0, end)];
}

function cueSpan(formula: ModalIRFormula): [number, number] | null {
  const start = Number(formula.metadata?.cue_start_char);
  const end = Number(formula.metadata?.cue_end_char);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return [Math.max(0, start), Math.max(0, end)];
}

function mergeSpans(spans: Array<[number, number]>, textLength: number): Array<[number, number]> {
  const sorted = spans
    .map(([start, end]) => [Math.max(0, Math.min(textLength, start)), Math.max(0, Math.min(textLength, end))] as [number, number])
    .filter(([start, end]) => end > start)
    .sort(([leftStart, leftEnd], [rightStart, rightEnd]) => leftStart - rightStart || leftEnd - rightEnd);
  const merged: Array<[number, number]> = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (!last || span[0] > last[1]) {
      merged.push([...span]);
    } else {
      last[1] = Math.max(last[1], span[1]);
    }
  }
  return merged;
}

function supportSpan(formulas: ModalIRFormula[]): number[] {
  const spans = formulas.map(formulaSpan).filter((span): span is [number, number] => Boolean(span));
  if (spans.length === 0) return [0, 0];
  return [Math.min(...spans.map(([start]) => start)), Math.max(...spans.map(([, end]) => end))];
}

function modalSpanCoverage(formulas: ModalIRFormula[], textLength: number): number {
  if (textLength <= 0) return 0;
  const covered = mergeSpans(
    formulas.map(formulaSpan).filter((span): span is [number, number] => Boolean(span)),
    textLength,
  ).reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
  return Math.round(Math.min(1, Math.max(0, covered / textLength)) * 1_000_000) / 1_000_000;
}

function predicatePhrase(formula: ModalIRFormula): string {
  const predicate = formula.predicate ?? {};
  const name = cleanText(String(predicate.name ?? '').replace(/_/g, ' '));
  const args = Array.isArray(predicate.arguments) ? predicate.arguments.map(String).filter(Boolean) : [];
  if (!name) return args.join(', ');
  return name;
}

function modalOperatorPhrase(formula: ModalIRFormula): string {
  if (typeof formula.operator !== 'object' || formula.operator === null) {
    return cleanText(String(formula.operator ?? ''));
  }
  const symbol = cleanText(String(formula.operator.symbol ?? ''));
  const label = cleanText(String(formula.operator.label ?? symbol));
  return OPERATOR_PHRASES[symbol] ?? label;
}

// ---------------------------------------------------------------------------
// modalTextTokenSimilarity
// ---------------------------------------------------------------------------

/**
 * Compute a token-level Jaccard similarity between two texts.
 */
export function modalTextTokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenizeForSimilarity(left));
  const rightTokens = new Set(tokenizeForSimilarity(right));
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1.0;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0.0;

  const overlap = [...leftTokens].filter(token => rightTokens.has(token)).length;
  if (overlap === 0) return 0.0;

  const precision = overlap / rightTokens.size;
  const recall = overlap / leftTokens.size;
  const f1 = (2 * precision * recall) / (precision + recall);
  return Math.round(f1 * 1_000_000) / 1_000_000;
}

function cleanText(text: string): string {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).join(' ');
}

function tokenizeForSimilarity(text: string): string[] {
  const matches = String(text ?? '').match(/[A-Za-z0-9][A-Za-z0-9_'-]*/g);
  return (matches ?? []).map(token => token.toLowerCase());
}

function uniquePreserveOrder(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decompilerCueTokens(value: string): string[] {
  return value.toLowerCase().match(MODAL_CUE_TOKEN_RE) ?? [];
}

function hasTemporalContextPhrase(normalizedText: string, phrase: string): boolean {
  const phraseRe = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(phrase)}($|[^A-Za-z0-9_])`);
  return phraseRe.test(normalizedText);
}

export function decompilerModalOperatorFeatureKey(symbol: string): string {
  const normalizedSymbol = cleanText(symbol);
  if (!normalizedSymbol) return '';
  const mappedSymbol = MODAL_OPERATOR_SYMBOL_FEATURE_KEYS[normalizedSymbol];
  if (mappedSymbol) return mappedSymbol;
  const tokens = decompilerCueTokens(normalizedSymbol);
  return tokens.length ? tokens.join('_') : '';
}

export function decompilerModalOperatorPairFeatureKey(sourceSymbol: string, targetSymbol: string): string {
  const sourceKey = decompilerModalOperatorFeatureKey(sourceSymbol);
  const targetKey = decompilerModalOperatorFeatureKey(targetSymbol);
  if (!sourceKey || !targetKey) return '';
  return `${sourceKey}_to_${targetKey}`;
}

export function decompilerTemporalClausePrefixRelation(prefixKey: string): string {
  const normalizedKey = cleanText(prefixKey).toLowerCase();
  if (!normalizedKey) return '';
  return DECOMPILER_TEMPORAL_CLAUSE_PREFIX_RELATIONS[normalizedKey] ?? '';
}

export function decompilerTemporalTransitionContextCuesFromText(text: string): string[] {
  const normalizedText = cleanText(text).replace(/_/g, ' ').toLowerCase();
  if (!normalizedText) return [];

  const cues: string[] = [];
  for (const [phrase, cue] of TEMPORAL_BRIDGE_CONTEXT_PHRASES) {
    if (hasTemporalContextPhrase(normalizedText, phrase) && !cues.includes(cue)) {
      cues.push(cue);
    }
  }

  const tokens = decompilerCueTokens(normalizedText);
  const tokenSet = new Set(tokens);
  for (const token of tokens) {
    const normalizedToken = token.endsWith('s') ? token.slice(0, -1) : token;
    if (DECOMPILER_TEMPORAL_BRIDGE_CONTEXT_TOKENS.has(normalizedToken) && !cues.includes(normalizedToken)) {
      cues.push(normalizedToken);
    }
  }

  if (TEMPORAL_BRIDGE_YEAR_RE.test(normalizedText)) {
    if (!cues.includes('year')) cues.push('year');
    if (tokenSet.has('edition') && !cues.includes('edition_year')) cues.push('edition_year');
  }
  return cues;
}

export function decompilerCanonicalUscCitation(title: string, section: string): string {
  const normalizedTitle = cleanText(title);
  const normalizedSection = cleanText(String(section ?? '').replace(TRAILING_SECTION_PUNCT_RE, ''));
  if (!normalizedTitle || !normalizedSection) return '';
  return `${normalizedTitle} U.S.C. ${normalizedSection}`;
}

export function decompilerTitleSectionCoordinate(title: string, section: string): string {
  const normalizedTitle = cleanText(title);
  const normalizedSection = cleanText(String(section ?? '').replace(TRAILING_SECTION_PUNCT_RE, ''));
  if (!normalizedTitle || !normalizedSection) return '';
  return `${normalizedTitle}:${normalizedSection}`;
}

export function decompilerCitationSectionDelimiterTokens(section: string): string[] {
  const tokens = String(section ?? '').match(CITATION_SECTION_DELIMITER_RE) ?? [];
  return tokens.map(cleanText).filter(Boolean);
}

export function decompilerCitationSectionDelimiterKind(delimiter: string): string {
  const cleaned = cleanText(delimiter);
  if (!cleaned) return '';
  if ([...cleaned].every(character => character === '.')) return 'dot';
  if ([...cleaned].every(character => character === '-')) return 'hyphen';
  if ([...cleaned].every(character => character === '.' || character === '-')) return 'mixed';
  return 'other';
}

export function decompilerCitationSectionComponentSignature(opts: {
  number: string;
  suffix?: string;
  suffixKind?: string;
}): string {
  const numberText = cleanText(opts.number);
  const suffixText = cleanText(opts.suffix ?? '');
  const numberWidth = numberText ? String(numberText.length) : '0';
  if (!suffixText) return `N${numberWidth}`;
  const kindKey = cleanText(opts.suffixKind ?? '').toLowerCase();
  const kindSymbol = kindKey === 'roman' ? 'R' : kindKey === 'alpha' ? 'A' : 'O';
  return `N${numberWidth}${kindSymbol}${suffixText.length}`;
}

export function decompilerCitationSectionComponentProfile(opts: {
  componentCount: number;
  suffixComponentCount: number;
  isRange: boolean;
}): string {
  const componentCount = Math.trunc(Number(opts.componentCount));
  const suffixComponentCount = Math.trunc(Number(opts.suffixComponentCount));
  if (componentCount <= 0) return '';
  if (Boolean(opts.isRange)) return 'range';
  if (componentCount === 1) return suffixComponentCount ? 'single_alphanumeric' : 'single_numeric';
  if (suffixComponentCount === 0) return 'compound_numeric';
  if (suffixComponentCount === componentCount) return 'compound_alphanumeric';
  return 'compound_mixed';
}

export function decompilerSourceIdInferredCitation(sourceId: string): string {
  const normalizedSourceId = cleanText(sourceId);
  if (!normalizedSourceId) return '';
  const match = USCODE_SOURCE_ID_RE.exec(normalizedSourceId);
  if (!match?.groups) return '';
  const title = cleanText(match.groups.title);
  const section = cleanText(match.groups.section);
  if (!title || !section) return '';
  return `${title} U.S.C. ${section}`;
}

export function decompilerInferredCitationsFromSourceIds(sourceIds: string[]): string[] {
  return uniquePreserveOrder(sourceIds.map(decompilerSourceIdInferredCitation).filter(Boolean));
}

export const decoded_modal_phrase_slot_text_map = decodedModalPhraseSlotTextMap;
export const modal_text_token_similarity = modalTextTokenSimilarity;
export const canonical_usc_citation = decompilerCanonicalUscCitation;
export const title_section_coordinate = decompilerTitleSectionCoordinate;
export const citation_section_delimiter_tokens = decompilerCitationSectionDelimiterTokens;
export const citation_section_delimiter_kind = decompilerCitationSectionDelimiterKind;
export const citation_section_component_signature = decompilerCitationSectionComponentSignature;
export const citation_section_component_profile = decompilerCitationSectionComponentProfile;
export const source_id_inferred_citation = decompilerSourceIdInferredCitation;
export const inferred_citations_from_source_ids = decompilerInferredCitationsFromSourceIds;
export const modal_operator_feature_key = decompilerModalOperatorFeatureKey;
export const modal_operator_pair_feature_key = decompilerModalOperatorPairFeatureKey;
export const temporal_clause_prefix_relation = decompilerTemporalClausePrefixRelation;
export const temporal_transition_context_cues_from_text = decompilerTemporalTransitionContextCuesFromText;

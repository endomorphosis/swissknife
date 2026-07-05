/**
 * modal-ir-decompiler.ts
 *
 * Modal IR decompiler — convert modal IR documents back to natural text.
 * TypeScript port of key public API from:
 *   ipfs_datasets_py/logic/modal/decompiler.py
 *
 * Provides (simulated, no ML deps):
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
// ModalIRDocument stub (minimal interface for decoding)
// ---------------------------------------------------------------------------

export interface ModalIRFormula {
  formulaType: string;
  operator?: string;
  actor?: string;
  action?: string;
  conditions?: string[];
  sourceText?: string;
}

export interface ModalIRDocument {
  documentId: string;
  sourceText?: string;
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

// ---------------------------------------------------------------------------
// decodeModalIRDocument
// ---------------------------------------------------------------------------

/**
 * Decode a ModalIRDocument into a DecodedModalText.
 * Simulated — no ML inference required.
 */
export function decodeModalIRDocument(doc: ModalIRDocument): DecodedModalText {
  const sourceId = doc.documentId;
  const sourceText = doc.sourceText ?? '';
  const formulas = (doc.formulas ?? []);

  // Convert formulas to phrases
  const phrases: DecodedModalPhrase[] = formulas.map((f, i) => {
    const text = modalFormulaToText(f.sourceText ?? `${f.formulaType}(${f.actor ?? 'Agent'},${f.action ?? 'Act'})`);
    return new DecodedModalPhrase({
      text,
      slot: f.formulaType ?? 'unknown',
      spans: [[i * 20, i * 20 + text.length]],
    });
  });

  // Reconstruct text from phrases
  const reconstructed = phrases.length > 0
    ? phrases.map(p => p.text).join('. ') + '.'
    : sourceText;

  // Compute simple token similarity
  const similarity = sourceText ? modalTextTokenSimilarity(sourceText, reconstructed) : 0;

  const coverage = formulas.length > 0
    ? Math.min(1.0, phrases.length / Math.max(1, formulas.length))
    : 0;

  return new DecodedModalText({
    sourceId,
    text: reconstructed,
    phrases,
    supportSpan: [0, reconstructed.length],
    reconstructionSimilarity: similarity,
    modalSpanCoverage: coverage,
    formulas: formulas.map(f => f.sourceText ?? '').filter(Boolean),
    parserWarnings: formulas.length === 0 ? ['No formulas in document'] : [],
  });
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

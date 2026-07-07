/**
 * modal-logic-codec.ts
 *
 * Deterministic modal logic codec — encode legal text into modal IR.
 * TypeScript port of key public API from:
 *   ipfs_datasets_py/logic/modal/codec.py
 *
 * Provides (deterministic, no ML deps):
 *   ModalLogicCodecConfig     — configuration
 *   ModalLogicCodecResult     — one encode/decode pass result
 *   DeterministicModalLogicCodec — encode(text) → ModalLogicCodecResult
 */

import { sha256Hex } from '../../shared/browser-crypto.js';

// ---------------------------------------------------------------------------
// ModalLogicCodecConfig
// ---------------------------------------------------------------------------

export interface ModalLogicCodecConfig {
  parserBackend: string;
  spaCyModelName: string;
  embeddingDimensions: number;
  topKFrames: number;
  frameDomain: string | null;
  useFlogic: boolean;
  flogicSimilarityThreshold: number;
  ontologyName: string;
}

export function makeCodecConfig(overrides: Partial<ModalLogicCodecConfig> = {}): ModalLogicCodecConfig {
  if ((overrides.embeddingDimensions ?? 8) < 1) {
    throw new Error('embeddingDimensions must be >= 1');
  }
  return {
    parserBackend: 'spacy',
    spaCyModelName: 'en_core_web_sm',
    embeddingDimensions: 8,
    topKFrames: 3,
    frameDomain: null,
    useFlogic: true,
    flogicSimilarityThreshold: 0.0,
    ontologyName: 'modal_legal_ontology',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ModalLogicCodecResult
// ---------------------------------------------------------------------------

export type ModalFamily = 'deontic' | 'temporal' | 'epistemic' | 'alethic' | 'unknown';

export class ModalLogicCodecResult {
  readonly sourceText: string;
  readonly normalizedText: string;
  readonly parserName: string;
  readonly sourceEmbedding: number[];
  readonly decodedEmbedding: number[];
  readonly familyProbabilities: Record<ModalFamily, number>;
  readonly targetFamily: ModalFamily;
  readonly targetFamilyDistribution: Record<string, number>;
  readonly frameCandidates: Array<Record<string, unknown>>;
  readonly selectedFrame: string | null;
  readonly kgTriples: Array<Record<string, string>>;
  readonly decodedText: string;
  readonly losses: Record<string, number>;
  readonly metadata: Record<string, unknown>;

  constructor(opts: {
    sourceText: string;
    normalizedText: string;
    parserName?: string;
    sourceEmbedding?: number[];
    decodedEmbedding?: number[];
    familyProbabilities?: Record<ModalFamily, number>;
    targetFamily?: ModalFamily;
    targetFamilyDistribution?: Record<string, number>;
    frameCandidates?: Array<Record<string, unknown>>;
    selectedFrame?: string | null;
    kgTriples?: Array<Record<string, string>>;
    decodedText?: string;
    losses?: Record<string, number>;
    metadata?: Record<string, unknown>;
  }) {
    this.sourceText = opts.sourceText;
    this.normalizedText = opts.normalizedText;
    this.parserName = opts.parserName ?? 'spacy';
    this.sourceEmbedding = opts.sourceEmbedding ?? [];
    this.decodedEmbedding = opts.decodedEmbedding ?? [];
    this.familyProbabilities = opts.familyProbabilities ?? { deontic: 0, temporal: 0, epistemic: 0, alethic: 0, unknown: 1 };
    this.targetFamily = opts.targetFamily ?? 'unknown';
    this.targetFamilyDistribution = opts.targetFamilyDistribution ?? {};
    this.frameCandidates = opts.frameCandidates ?? [];
    this.selectedFrame = opts.selectedFrame ?? null;
    this.kgTriples = opts.kgTriples ?? [];
    this.decodedText = opts.decodedText ?? opts.normalizedText;
    this.losses = opts.losses ?? {};
    this.metadata = opts.metadata ?? {};
  }

  get totalLoss(): number {
    return Object.values(this.losses).reduce((s, v) => s + v, 0);
  }

  toDict(): Record<string, unknown> {
    return {
      source_text: this.sourceText.slice(0, 80),
      normalized_text: this.normalizedText.slice(0, 80),
      parser_name: this.parserName,
      target_family: this.targetFamily,
      selected_frame: this.selectedFrame,
      kg_triple_count: this.kgTriples.length,
      decoded_text: this.decodedText.slice(0, 80),
      losses: this.losses,
      total_loss: this.totalLoss,
      metadata: this.metadata,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers (deterministic, no ML deps)
// ---------------------------------------------------------------------------

const DEONTIC_INDICATORS  = /\b(shall|must|may|obligat|permit|prohibit|forbidden|duty)\b/i;
const TEMPORAL_INDICATORS = /\b(always|eventually|until|since|next|before|after|□|◊)\b/i;
const EPISTEMIC_INDICATORS= /\b(know|believe|assert|think|assume)\b/i;

function detectModalFamily(text: string): ModalFamily {
  if (DEONTIC_INDICATORS.test(text))   return 'deontic';
  if (TEMPORAL_INDICATORS.test(text))  return 'temporal';
  if (EPISTEMIC_INDICATORS.test(text)) return 'epistemic';
  if (/necessarily|possibly/i.test(text)) return 'alethic';
  return 'unknown';
}

const MT19937_N = 624;
const MT19937_M = 397;
const MT19937_MATRIX_A = 0x9908b0df;
const MT19937_UPPER_MASK = 0x80000000;
const MT19937_LOWER_MASK = 0x7fffffff;

class PythonRandom {
  private mt = new Uint32Array(MT19937_N);
  private index = MT19937_N + 1;

  constructor(seed: bigint) {
    this.initByArray(seedToUint32Words(seed));
  }

  random(): number {
    const a = this.genrandUint32() >>> 5;
    const b = this.genrandUint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  private initGenrand(seed: number): void {
    this.mt[0] = seed >>> 0;
    for (let i = 1; i < MT19937_N; i++) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.index = MT19937_N;
  }

  private initByArray(initKey: number[]): void {
    const key = initKey.length > 0 ? initKey : [0];
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = Math.max(MT19937_N, key.length);
    for (; k > 0; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = ((this.mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= MT19937_N) {
        this.mt[0] = this.mt[MT19937_N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (k = MT19937_N - 1; k > 0; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = ((this.mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= MT19937_N) {
        this.mt[0] = this.mt[MT19937_N - 1];
        i = 1;
      }
    }
    this.mt[0] = MT19937_UPPER_MASK;
  }

  private genrandUint32(): number {
    const mag01 = [0, MT19937_MATRIX_A];
    if (this.index >= MT19937_N) {
      let kk = 0;
      for (; kk < MT19937_N - MT19937_M; kk++) {
        const y = (this.mt[kk] & MT19937_UPPER_MASK) | (this.mt[kk + 1] & MT19937_LOWER_MASK);
        this.mt[kk] = (this.mt[kk + MT19937_M] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
      }
      for (; kk < MT19937_N - 1; kk++) {
        const y = (this.mt[kk] & MT19937_UPPER_MASK) | (this.mt[kk + 1] & MT19937_LOWER_MASK);
        this.mt[kk] = (this.mt[kk + (MT19937_M - MT19937_N)] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
      }
      const y = (this.mt[MT19937_N - 1] & MT19937_UPPER_MASK) | (this.mt[0] & MT19937_LOWER_MASK);
      this.mt[MT19937_N - 1] = (this.mt[MT19937_M - 1] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
      this.index = 0;
    }

    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
}

function seedToUint32Words(seed: bigint): number[] {
  let value = seed < 0n ? -seed : seed;
  if (value === 0n) return [0];
  const words: number[] = [];
  const mask = 0xffffffffn;
  while (value > 0n) {
    words.push(Number(value & mask));
    value >>= 32n;
  }
  return words;
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

export function stableMockEmbedding(text: string, dimensions = 8): number[] {
  const digest = sha256Hex(String(text ?? '')).slice(0, 16);
  const rng = new PythonRandom(BigInt(`0x${digest}`));
  return Array.from({ length: dimensions }, () => round6(rng.uniform(-1.0, 1.0)));
}

function buildFamilyProbs(family: ModalFamily): Record<ModalFamily, number> {
  const probs: Record<ModalFamily, number> = { deontic: 0.05, temporal: 0.05, epistemic: 0.05, alethic: 0.05, unknown: 0.05 };
  probs[family] = 0.80;
  return probs;
}

function buildKGTriples(text: string, family: ModalFamily): Array<Record<string, string>> {
  return [
    { subject: 'document', predicate: 'has_modal_family', object: family },
    { subject: 'document', predicate: 'source_text', object: text.slice(0, 40) },
  ];
}

const GRAPH_PROJECTION_GUIDANCE_ROUTE = 'repair_multiview_legal_ir_graph_projection';
const NEO4J_COMPAT_TARGET_COMPONENT = 'knowledge_graphs.neo4j_compat';
const MODAL_FRAME_LOGIC_TARGET_COMPONENT = 'modal.frame_logic';
const COMPILER_GUIDANCE_MAX_FEATURES = 32;
const COMPILER_GUIDANCE_MAX_GROUP_FEATURES = 16;
const COMPILER_GUIDANCE_MAX_EMBEDDING_VALUES = 32;
const COMPILER_GUIDANCE_FRAME_AUDIT_FEATURE_KEYS = [
  'frame_feature',
  'frame_feature_key',
  'frame_feature_keys',
  'frame_features',
  'top_embedding_features',
  'top_family_features',
  'top_predicted_views',
  'top_target_views',
] as const;
const COMPILER_GUIDANCE_FRAME_AUDIT_STAGE_KEYS = [
  'pipeline_stage',
  'pipeline_stage_focus',
  'primary_pipeline_stage',
] as const;
const TRAILING_SECTION_PUNCT_RE = /[.;:]+$/;
const CITATION_SECTION_DELIMITER_RE = /[.-]+/g;
const USCODE_SOURCE_ID_RE = /^\s*(?<scheme>us-code)-(?<title>[^-]+)-(?<section>.+)-(?<digest>[0-9a-f]{16})\s*$/i;
const SLOT_FEATURE_TOKEN_RE = /[A-Za-z0-9]+/g;
const MODAL_CUE_TOKEN_RE = /[a-z0-9]+/g;
const TEMPORAL_BRIDGE_YEAR_RE = /(?<!\d)(?:18|19|20)\d{2}(?!\d)/;
const MODAL_OPERATOR_SYMBOL_FEATURE_KEYS: Record<string, string> = {
  'O|': 'o_pipe',
  '[a]': 'a_box',
  '□': 'box',
  '◇': 'diamond',
};
const CODEC_TEMPORAL_CLAUSE_PREFIX_RELATIONS: Record<string, string> = {
  when: 'when',
  until: 'until',
  after: 'after',
  only_after: 'after',
  before: 'before',
  by: 'deadline',
  no_later_than: 'deadline',
  not_later_than: 'deadline',
  upon: 'after',
};
const CODEC_TEMPORAL_BRIDGE_CONTEXT_TOKENS = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
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
const FLOGIC_ONTOLOGY_GUIDANCE_ROUTES = new Set([
  'audit_frame_logic_terms',
  'improve_flogic_frame_alignment',
  'repair_flogic_ontology_constraints',
]);
const GUIDANCE_SURFACE_FORCE_LEXEMES = new Set([
  'authorized',
  'may',
  'must',
  'permitted',
  'prohibited',
  'required',
  'requires',
  'shall',
]);
const GUIDANCE_SURFACE_SCOPE_TERMS: Record<string, string> = {
  'condition-prefix': 'if',
  'exception-suffix': 'except',
  'temporal-suffix': 'when',
};
const GUIDANCE_SURFACE_SCOPE_SIGNATURE_TERMS: Record<string, string> = {
  conditioned: 'if',
  excepted: 'except',
  temporal: 'when',
};
const GUIDANCE_SURFACE_CUE_TERMS: Record<string, string> = {
  authority: 'authority',
  condition: 'if',
  conditional: 'if',
  definition: 'definition',
  enforcement: 'enforce',
  exception: 'except',
  obligation: 'shall',
  permission: 'may',
  prohibition: 'not',
  temporal: 'when',
};
const GUIDANCE_SURFACE_NEGATING_FORCE_TERMS = new Set(['prohibited']);
const GUIDANCE_SURFACE_SOURCE_ALIASES: Record<string, Set<string>> = {
  authority: new Set(['authority', 'authorized', 'authorizes', 'authorize']),
  definition: new Set(['definition', 'defined', 'means', 'includes']),
  enforce: new Set(['enforce', 'enforced', 'enforcement']),
  except: new Set(['except', 'exception', 'unless', 'notwithstanding']),
  if: new Set(['if', 'provided', 'condition', 'conditions', 'where']),
  may: new Set(['authorized', 'may', 'permitted']),
  not: new Set(['no', 'nor', 'not', 'without']),
  prohibited: new Set(['forbidden', 'prohibit', 'prohibited', 'prohibits']),
  shall: new Set(['must', 'required', 'requires', 'shall']),
  when: new Set(['after', 'before', 'during', 'until', 'when', 'whenever', 'within']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanNonEmptyString(value: unknown): string {
  const cleaned = String(value ?? '').trim();
  return cleaned || '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cueTokens(value: string): string[] {
  return value.toLowerCase().match(MODAL_CUE_TOKEN_RE) ?? [];
}

function uniquePreserveOrder(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = String(value ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function safeFloat(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round12(value: number): number {
  return Number(value.toFixed(12));
}

export function numericDistribution(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const weights: Record<string, number> = {};
  for (const [key, rawWeight] of Object.entries(value)) {
    const weight = Math.max(0, safeFloat(rawWeight));
    if (weight > 0) weights[String(key)] = weight;
  }
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return {};
  return Object.fromEntries(
    Object.entries(weights)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, weight]) => [key, round12(weight / total)])
  );
}

export function numericSignedMapping(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, rawWeight]) => [String(key), safeFloat(rawWeight)] as const)
      .filter(([, weight]) => Math.abs(weight) > 1.0e-12)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, weight]) => [key, round12(weight)])
  );
}

function guidanceFeatureValue(value: unknown): string {
  if (isRecord(value)) {
    return cleanNonEmptyString(value.feature ?? value.name);
  }
  return cleanNonEmptyString(value);
}

function guidanceFeatureList(value: unknown, limit: number): string[] {
  if (value === null || value === undefined) return [];
  const iterable = isRecord(value)
    ? Object.values(value)
    : typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value
        : [value];
  const features: string[] = [];
  for (const item of iterable) {
    const feature = guidanceFeatureValue(item);
    if (feature) features.push(feature);
    if (limit > 0 && features.length >= limit) break;
  }
  return uniquePreserveOrder(features);
}

function compilerGuidanceBundleMapping(compilerGuidance: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['bundle', 'semantic_bundle', 'vector_bundle']) {
    const rawBundle = compilerGuidance[key];
    if (isRecord(rawBundle)) return rawBundle;
    if (typeof rawBundle === 'string' && rawBundle.trim()) {
      try {
        const decoded = JSON.parse(rawBundle) as unknown;
        if (isRecord(decoded)) return decoded;
      } catch {
        continue;
      }
    }
  }
  return {};
}

function compilerGuidanceGapWeight(value: unknown): number {
  if (isRecord(value)) {
    return safeFloat(value.count ?? value.support ?? value.weight ?? value.score);
  }
  return safeFloat(value);
}

function compilerGuidanceGapQualityPasses(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const qualityGate = cleanNonEmptyString(value.quality_gate).toLowerCase();
  return !qualityGate || qualityGate === 'pass';
}

export function canonicalUscCitation(title: string, section: string): string {
  const normalizedTitle = cleanNonEmptyString(title);
  const normalizedSection = cleanNonEmptyString(String(section ?? '').replace(TRAILING_SECTION_PUNCT_RE, ''));
  if (!normalizedTitle || !normalizedSection) return '';
  return `${normalizedTitle} U.S.C. ${normalizedSection}`;
}

export function titleSectionCoordinate(title: string, section: string): string {
  const normalizedTitle = cleanNonEmptyString(title);
  const normalizedSection = cleanNonEmptyString(String(section ?? '').replace(TRAILING_SECTION_PUNCT_RE, ''));
  if (!normalizedTitle || !normalizedSection) return '';
  return `${normalizedTitle}:${normalizedSection}`;
}

export function citationSectionDelimiterTokens(section: string): string[] {
  const tokens = String(section ?? '').match(CITATION_SECTION_DELIMITER_RE) ?? [];
  return tokens.map(cleanNonEmptyString).filter(Boolean);
}

export function citationSectionDelimiterKind(delimiter: string): string {
  const cleaned = cleanNonEmptyString(delimiter);
  if (!cleaned) return '';
  if ([...cleaned].every(character => character === '.')) return 'dot';
  if ([...cleaned].every(character => character === '-')) return 'hyphen';
  if ([...cleaned].every(character => character === '.' || character === '-')) return 'mixed';
  return 'other';
}

export function citationSectionComponentSignature(opts: {
  number: string;
  suffix?: string;
  suffixKind?: string;
}): string {
  const numberText = cleanNonEmptyString(opts.number);
  const suffixText = cleanNonEmptyString(opts.suffix);
  const numberWidth = numberText ? String(numberText.length) : '0';
  if (!suffixText) return `N${numberWidth}`;
  const kindKey = cleanNonEmptyString(opts.suffixKind).toLowerCase();
  const kindSymbol = kindKey === 'roman' ? 'R' : kindKey === 'alpha' ? 'A' : 'O';
  return `N${numberWidth}${kindSymbol}${suffixText.length}`;
}

export function citationSectionComponentProfile(opts: {
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

export function sourceIdInferredCitation(sourceId: string): string {
  const normalizedSourceId = cleanNonEmptyString(sourceId);
  if (!normalizedSourceId) return '';
  const match = USCODE_SOURCE_ID_RE.exec(normalizedSourceId);
  if (!match?.groups) return '';
  const title = cleanNonEmptyString(match.groups.title);
  const section = cleanNonEmptyString(match.groups.section);
  if (!title || !section) return '';
  return `${title} U.S.C. ${section}`;
}

export function inferredCitationsFromSourceIds(sourceIds: string[]): string[] {
  return uniquePreserveOrder(sourceIds.map(sourceIdInferredCitation).filter(Boolean));
}

export function modalOperatorFeatureKey(symbol: string): string {
  const normalizedSymbol = cleanNonEmptyString(symbol);
  if (!normalizedSymbol) return '';
  const mappedSymbol = MODAL_OPERATOR_SYMBOL_FEATURE_KEYS[normalizedSymbol];
  if (mappedSymbol) return mappedSymbol;
  const tokens = cueTokens(normalizedSymbol);
  return tokens.length ? tokens.join('_') : '';
}

export function modalOperatorPairFeatureKey(sourceSymbol: string, targetSymbol: string): string {
  const sourceKey = modalOperatorFeatureKey(sourceSymbol);
  const targetKey = modalOperatorFeatureKey(targetSymbol);
  if (!sourceKey || !targetKey) return '';
  return `${sourceKey}_to_${targetKey}`;
}

export function temporalClausePrefixRelation(prefixKey: string): string {
  const normalizedKey = cleanNonEmptyString(prefixKey).toLowerCase();
  if (!normalizedKey) return '';
  return CODEC_TEMPORAL_CLAUSE_PREFIX_RELATIONS[normalizedKey] ?? '';
}

function hasTemporalContextPhrase(normalizedText: string, phrase: string): boolean {
  const phraseRe = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(phrase)}($|[^A-Za-z0-9_])`);
  return phraseRe.test(normalizedText);
}

export function temporalTransitionContextCuesFromText(text: string): string[] {
  const normalizedText = cleanNonEmptyString(text).replace(/_/g, ' ').toLowerCase();
  if (!normalizedText) return [];

  const cues: string[] = [];
  for (const [phrase, cue] of TEMPORAL_BRIDGE_CONTEXT_PHRASES) {
    if (hasTemporalContextPhrase(normalizedText, phrase) && !cues.includes(cue)) {
      cues.push(cue);
    }
  }

  const tokens = cueTokens(normalizedText);
  const tokenSet = new Set(tokens);
  for (const token of tokens) {
    const normalizedToken = token.endsWith('s') ? token.slice(0, -1) : token;
    if (CODEC_TEMPORAL_BRIDGE_CONTEXT_TOKENS.has(normalizedToken) && !cues.includes(normalizedToken)) {
      cues.push(normalizedToken);
    }
  }

  if (TEMPORAL_BRIDGE_YEAR_RE.test(normalizedText)) {
    if (!cues.includes('year')) cues.push('year');
    if (tokenSet.has('edition') && !cues.includes('edition_year')) cues.push('edition_year');
  }
  return cues;
}

export function compilerGuidanceRouteFromViewGap(gapName: string): string {
  const normalized = cleanNonEmptyString(gapName).toLowerCase().replace(/[.-]/g, '_');
  if (normalized.includes('deontic')) return 'repair_deontic_bridge_quality_gate';
  if (normalized.includes('frame') || normalized.includes('flogic')) return 'repair_flogic_ontology_constraints';
  if (normalized.includes('knowledge_graph') || normalized.startsWith('kg_')) return GRAPH_PROJECTION_GUIDANCE_ROUTE;
  if (normalized.includes('tdfol') || normalized.includes('first_order')) return 'repair_tdfol_bridge_parse';
  if (normalized.includes('cec') || normalized.includes('event_calculus')) return 'repair_cec_dcec_bridge';
  if (normalized.includes('prover')) return 'repair_external_prover_router';
  if (normalized.includes('zkp') || normalized.includes('zero_knowledge')) return 'repair_zkp_attestation_bridge';
  return '';
}

export function compilerGuidanceRoutesFromViewGaps(compilerGuidance: Record<string, unknown>): string[] {
  const routes: string[] = [];
  for (const gapKey of [
    'compiler_guidance_legal_ir_view_gaps',
    'compiler_guidance_legal_ir_view_family_gaps',
    'legal_ir_view_gaps',
    'legal_ir_view_family_gaps',
  ]) {
    const rawGaps = compilerGuidance[gapKey];
    if (!isRecord(rawGaps)) continue;
    for (const [gapName, rawWeight] of Object.entries(rawGaps).sort(([a], [b]) => a.localeCompare(b))) {
      if (compilerGuidanceGapWeight(rawWeight) <= 0 || !compilerGuidanceGapQualityPasses(rawWeight)) continue;
      const route = compilerGuidanceRouteFromViewGap(gapName);
      if (route) routes.push(route);
    }
  }
  return uniquePreserveOrder(routes);
}

export function compilerGuidanceViewGapFeatures(compilerGuidance: Record<string, unknown>): string[] {
  const features: string[] = [];
  for (const gapKey of [
    'compiler_guidance_legal_ir_view_gaps',
    'compiler_guidance_legal_ir_view_family_gaps',
    'legal_ir_view_gaps',
    'legal_ir_view_family_gaps',
  ]) {
    const rawGaps = compilerGuidance[gapKey];
    if (!isRecord(rawGaps)) continue;
    for (const [gapName, rawWeight] of Object.entries(rawGaps).sort(([a], [b]) => a.localeCompare(b))) {
      if (compilerGuidanceGapWeight(rawWeight) <= 0 || !compilerGuidanceGapQualityPasses(rawWeight)) continue;
      const safeGap = cleanNonEmptyString(gapName).replace(/\./g, '_');
      if (safeGap) features.push(`legal-ir-view-gap:${safeGap}`);
    }
  }
  return uniquePreserveOrder(features);
}

export function compilerGuidanceSelectedFrameEvidence(compilerGuidance: Record<string, unknown>): string[] {
  const frames: string[] = [];
  for (const key of ['selected_frame', 'selected_frame_after', 'compiler_guidance_selected_frame_after']) {
    const frame = cleanNonEmptyString(compilerGuidance[key]);
    if (frame) frames.push(frame);
  }
  const rawEvidence = compilerGuidance.evidence ?? compilerGuidance.evidences;
  const evidenceItems = isRecord(rawEvidence) ? [rawEvidence] : Array.isArray(rawEvidence) ? rawEvidence : [];
  for (const item of evidenceItems) {
    if (!isRecord(item)) continue;
    for (const key of ['selected_frame_after', 'selected_frame', 'selected_frame_before']) {
      const frame = cleanNonEmptyString(item[key]);
      if (frame) frames.push(frame);
    }
  }
  return uniquePreserveOrder(frames);
}

function compilerGuidanceRouteName(value: unknown): string {
  let normalized = cleanNonEmptyString(value).toLowerCase();
  for (const prefix of ['compiler-guidance-route:', 'compiler-guidance:']) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      break;
    }
  }
  return normalized;
}

export function compilerGuidanceRouteFeatures(compilerGuidance: Record<string, unknown>): string[] {
  const routes: string[] = [];
  for (const routesKey of ['compiler_guidance_todo_routes', 'todo_routes', 'routes']) {
    const rawRoutes = compilerGuidance[routesKey];
    if (isRecord(rawRoutes)) {
      routes.push(...Object.keys(rawRoutes).filter(route => cleanNonEmptyString(route)));
    } else {
      routes.push(...guidanceFeatureList(rawRoutes, 0));
    }
  }
  for (const routeKey of [
    'compiler_guidance_route',
    'route',
    'compiler_guidance_action',
    'action',
    'original_action',
    'failed_action',
    'failed_todo_action',
  ]) {
    const route = cleanNonEmptyString(compilerGuidance[routeKey]);
    if (route) routes.push(route);
  }
  for (const sampleKey of ['sample', 'samples', 'sample_id', 'sample_ids']) {
    for (const sample of guidanceFeatureList(compilerGuidance[sampleKey], 0)) {
      const route = compilerGuidanceRouteName(sample);
      if (route) routes.push(route);
    }
  }
  routes.push(...compilerGuidanceRoutesFromViewGaps(compilerGuidance));

  const features = routes.map(route => `compiler-guidance-route:${route}`);
  let targetComponent = cleanNonEmptyString(compilerGuidance.target_component ?? compilerGuidance.target);
  const rawBundle = compilerGuidanceBundleMapping(compilerGuidance);
  if (Object.keys(rawBundle).length) {
    const bundleRoute = cleanNonEmptyString(
      rawBundle.route
        ?? rawBundle.action
        ?? rawBundle.original_action
        ?? rawBundle.failed_action
        ?? rawBundle.failed_todo_action,
    );
    if (bundleRoute) features.push(`compiler-guidance-route:${bundleRoute}`);
    if (!targetComponent) targetComponent = cleanNonEmptyString(rawBundle.target_component ?? rawBundle.target);
  }
  if (targetComponent) features.push(`target-component:${targetComponent}`);

  for (const frame of compilerGuidanceSelectedFrameEvidence(compilerGuidance)) {
    features.push(`selected_ontology_frame:${frame}`);
  }
  const rawEvidence = compilerGuidance.evidence ?? compilerGuidance.evidences;
  const evidenceItems = isRecord(rawEvidence) ? [rawEvidence] : Array.isArray(rawEvidence) ? rawEvidence : [];
  for (const item of evidenceItems) {
    if (!isRecord(item)) continue;
    const route = cleanNonEmptyString(
      item.compiler_guidance_route
        ?? item.route
        ?? item.action
        ?? item.original_action
        ?? item.failed_action
        ?? item.failed_todo_action,
    );
    if (route) features.push(`compiler-guidance-route:${route}`);
  }
  return uniquePreserveOrder(features);
}

function compilerGuidanceNestedFeatureStrings(values: unknown, depth = 0, features: string[] = []): string[] {
  if (values === null || values === undefined || depth >= 6) return uniquePreserveOrder(features);
  if (isRecord(values)) {
    const feature = guidanceFeatureValue(values);
    if (feature) features.push(feature);
    for (const nested of Object.values(values)) compilerGuidanceNestedFeatureStrings(nested, depth + 1, features);
  } else if (typeof values === 'string') {
    const feature = guidanceFeatureValue(values);
    if (feature) features.push(feature);
  } else if (Array.isArray(values)) {
    for (const nested of values) compilerGuidanceNestedFeatureStrings(nested, depth + 1, features);
  } else {
    const feature = guidanceFeatureValue(values);
    if (feature) features.push(feature);
  }
  return uniquePreserveOrder(features);
}

function compilerGuidanceHasFrameLogicViewSignal(compilerGuidance: Record<string, unknown>): boolean {
  let targetComponent = cleanNonEmptyString(compilerGuidance.target_component);
  const rawBundle = isRecord(compilerGuidance.bundle)
    ? compilerGuidance.bundle
    : isRecord(compilerGuidance.semantic_bundle)
      ? compilerGuidance.semantic_bundle
      : {};
  if (!targetComponent && isRecord(rawBundle)) targetComponent = cleanNonEmptyString(rawBundle.target_component);
  if (targetComponent === MODAL_FRAME_LOGIC_TARGET_COMPONENT) return true;
  for (const distributionKey of [
    'compiler_guidance_legal_ir_target_view_distribution',
    'compiler_guidance_legal_ir_view_gap_distribution',
    'legal_ir_target_view_distribution',
    'legal_ir_view_gap_distribution',
  ]) {
    const rawDistribution = compilerGuidance[distributionKey];
    if (!isRecord(rawDistribution)) continue;
    if (Object.keys(rawDistribution).some(key => cleanNonEmptyString(key) === MODAL_FRAME_LOGIC_TARGET_COMPONENT)) return true;
  }
  const nested = compilerGuidanceNestedFeatureStrings([
    compilerGuidance.compiler_guidance_feature_groups,
    compilerGuidance.compiler_guidance_ranked_features,
    compilerGuidance.evidence,
    compilerGuidance.evidences,
    compilerGuidance.feature_groups,
    compilerGuidance.frame_features,
    compilerGuidance.top_family_features,
  ]);
  const frameSignals = new Set([
    MODAL_FRAME_LOGIC_TARGET_COMPONENT,
    `legal-ir-view:${MODAL_FRAME_LOGIC_TARGET_COMPONENT}`,
    `legal_ir_view:${MODAL_FRAME_LOGIC_TARGET_COMPONENT}`,
    `target-component:${MODAL_FRAME_LOGIC_TARGET_COMPONENT}`,
  ]);
  return nested.some(feature => frameSignals.has(cleanNonEmptyString(feature).toLowerCase()));
}

export function compilerGuidanceFrameLogicTargetRoutes(compilerGuidance: Record<string, unknown>): string[] {
  const routes: string[] = [];
  for (const feature of compilerGuidanceRouteFeatures(compilerGuidance)) {
    let normalized = cleanNonEmptyString(feature).toLowerCase();
    if (normalized.startsWith('compiler-guidance-route:')) normalized = normalized.split(':', 2)[1].trim();
    if (FLOGIC_ONTOLOGY_GUIDANCE_ROUTES.has(normalized)) routes.push(normalized);
  }
  if (!routes.length && compilerGuidanceHasFrameLogicViewSignal(compilerGuidance)) {
    routes.push('audit_frame_logic_terms');
  }
  return uniquePreserveOrder(routes);
}

export function compilerGuidanceImpliesFrameLogicTarget(compilerGuidance: Record<string, unknown>): boolean {
  if (compilerGuidanceFrameLogicTargetRoutes(compilerGuidance).length > 0) return true;
  let targetComponent = cleanNonEmptyString(compilerGuidance.target_component ?? compilerGuidance.target);
  const rawBundle = compilerGuidanceBundleMapping(compilerGuidance);
  if (!targetComponent && Object.keys(rawBundle).length) {
    targetComponent = cleanNonEmptyString(rawBundle.target_component ?? rawBundle.target);
  }
  return targetComponent === MODAL_FRAME_LOGIC_TARGET_COMPONENT;
}

export function compilerGuidanceImpliesNeo4jProjectionTarget(compilerGuidance: Record<string, unknown>): boolean {
  const hasGraphProjectionRoute = compilerGuidanceRouteFeatures(compilerGuidance)
    .some(value => value.includes(GRAPH_PROJECTION_GUIDANCE_ROUTE));
  if (!hasGraphProjectionRoute) return false;
  let targetComponent = cleanNonEmptyString(compilerGuidance.target_component ?? compilerGuidance.target);
  const rawBundle = compilerGuidanceBundleMapping(compilerGuidance);
  if (!targetComponent && Object.keys(rawBundle).length) {
    targetComponent = cleanNonEmptyString(rawBundle.target_component ?? rawBundle.target);
  }
  return !targetComponent || targetComponent === NEO4J_COMPAT_TARGET_COMPONENT;
}

function frameOntologyFeatureKeys(featureKeys: Iterable<string>, maxKeys: number): string[] {
  const out: string[] = [];
  for (const featureKey of featureKeys) {
    const feature = cleanNonEmptyString(featureKey);
    if (!feature) continue;
    if (!feature.includes(':')) continue;
    out.push(feature);
    if (out.length >= maxKeys) break;
  }
  return uniquePreserveOrder(out);
}

export function compilerGuidanceFrameAuditFeatures(compilerGuidance: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const addFeatureValues = (value: unknown): void => {
    candidates.push(...guidanceFeatureList(value, 0));
  };
  const addStageValues = (value: unknown): void => {
    for (const stage of guidanceFeatureList(value, 0)) {
      candidates.push(`flogic:statement_hint:${stage}`);
    }
  };
  const collect = (mapping: Record<string, unknown>): void => {
    for (const key of COMPILER_GUIDANCE_FRAME_AUDIT_FEATURE_KEYS) addFeatureValues(mapping[key]);
    for (const key of COMPILER_GUIDANCE_FRAME_AUDIT_STAGE_KEYS) addStageValues(mapping[key]);
  };
  collect(compilerGuidance);
  const rawEvidence = compilerGuidance.evidence ?? compilerGuidance.evidences;
  const evidenceItems = isRecord(rawEvidence) ? [rawEvidence] : Array.isArray(rawEvidence) ? rawEvidence : [];
  for (const item of evidenceItems) {
    if (isRecord(item)) collect(item);
  }
  return frameOntologyFeatureKeys(uniquePreserveOrder(candidates), COMPILER_GUIDANCE_MAX_FEATURES);
}

/**
 * Python parity for `modal/codec.py::_compiler_guidance_feature_strings`.
 */
export function compilerGuidanceFeatureStrings(guidanceSummary: Record<string, unknown>): string[] {
  const features: string[] = [];
  features.push(...guidanceFeatureList(guidanceSummary.ranked_guidance_features, 0));

  const rawGroups = guidanceSummary.feature_groups;
  if (isRecord(rawGroups)) {
    for (const groupFeatures of Object.values(rawGroups)) {
      features.push(...guidanceFeatureList(groupFeatures, 0));
    }
  }

  features.push(...guidanceFeatureList(guidanceSummary.synthesis_focus, 0));

  for (const [prefix, distributionKey] of [
    ['family-distribution', 'family_distribution'],
    ['legal-ir-predicted-view', 'legal_ir_predicted_view_distribution'],
    ['legal-ir-target-view', 'legal_ir_target_view_distribution'],
  ] as const) {
    const distribution = guidanceSummary[distributionKey];
    if (!isRecord(distribution)) continue;
    for (const key of Object.keys(distribution)) {
      features.push(`${prefix}:${key}`);
    }
  }

  const gapDistribution = guidanceSummary.legal_ir_view_gap_distribution;
  if (isRecord(gapDistribution)) {
    for (const [key, value] of Object.entries(gapDistribution)) {
      const direction = safeFloat(value) > 0.0 ? 'underrepresented' : 'overrepresented';
      features.push(`legal-ir-view-gap:${direction}:${key}`);
    }
  }

  return uniquePreserveOrder(features);
}

/**
 * Python parity for `modal/codec.py::_compiler_guidance_summary`.
 */
export function compilerGuidanceSummary(compilerGuidance: unknown): Record<string, unknown> {
  if (!isRecord(compilerGuidance)) return {};
  const featureGroups: Record<string, string[]> = {};
  const rawGroups = compilerGuidance.feature_groups;
  if (isRecord(rawGroups)) {
    for (const [groupName, rawFeatures] of Object.entries(rawGroups).sort(([a], [b]) => a.localeCompare(b))) {
      const features = guidanceFeatureList(rawFeatures, COMPILER_GUIDANCE_MAX_GROUP_FEATURES);
      if (features.length) featureGroups[String(groupName)] = features;
    }
  }

  const frameAuditFeatures = compilerGuidanceFrameAuditFeatures(compilerGuidance);
  if (frameAuditFeatures.length) {
    featureGroups.frame_logic_evidence = frameAuditFeatures.slice(0, COMPILER_GUIDANCE_MAX_GROUP_FEATURES);
  }
  const viewGapFeatures = compilerGuidanceViewGapFeatures(compilerGuidance);
  if (viewGapFeatures.length) {
    featureGroups.legal_ir_view_gap_evidence = viewGapFeatures.slice(0, COMPILER_GUIDANCE_MAX_GROUP_FEATURES);
  }

  const rankedGuidanceFeatures: Array<Record<string, unknown>> = [];
  const rawRanked = compilerGuidance.ranked_guidance_features;
  if (Array.isArray(rawRanked)) {
    for (const item of rawRanked.slice(0, COMPILER_GUIDANCE_MAX_FEATURES)) {
      if (!isRecord(item)) continue;
      const feature = guidanceFeatureValue(item);
      if (!feature) continue;
      rankedGuidanceFeatures.push({
        embedding_weight_norm: round12(safeFloat(item.embedding_weight_norm)),
        family_logit_magnitude: round12(safeFloat(item.family_logit_magnitude)),
        feature,
        legal_ir_view_logit_magnitude: round12(safeFloat(item.legal_ir_view_logit_magnitude)),
        score: round12(safeFloat(item.score)),
      });
    }
  }
  for (const feature of compilerGuidanceRouteFeatures(compilerGuidance)) {
    if (rankedGuidanceFeatures.length >= COMPILER_GUIDANCE_MAX_FEATURES) break;
    rankedGuidanceFeatures.push({
      embedding_weight_norm: 0,
      family_logit_magnitude: 0,
      feature,
      legal_ir_view_logit_magnitude: 0,
      score: 1,
    });
  }

  const decodedEmbedding: number[] = [];
  const rawDecodedEmbedding = compilerGuidance.decoded_embedding;
  if (Array.isArray(rawDecodedEmbedding)) {
    for (const value of rawDecodedEmbedding.slice(0, COMPILER_GUIDANCE_MAX_EMBEDDING_VALUES)) {
      decodedEmbedding.push(round12(safeFloat(value)));
    }
  }
  const decodedEmbeddingNorm = decodedEmbedding.length
    ? Math.sqrt(decodedEmbedding.reduce((sum, value) => sum + value * value, 0))
    : 0;

  const legalIrViewMetrics: Record<string, number> = {};
  if (isRecord(compilerGuidance.legal_ir_view_metrics)) {
    for (const [key, value] of Object.entries(compilerGuidance.legal_ir_view_metrics).sort(([a], [b]) => a.localeCompare(b))) {
      const number = safeFloat(value);
      if (Number.isFinite(number)) legalIrViewMetrics[String(key)] = round12(number);
    }
  }

  const legalIrPredictedViewDistribution = numericDistribution(compilerGuidance.legal_ir_predicted_view_distribution);
  let legalIrTargetViewDistribution = numericDistribution(compilerGuidance.legal_ir_target_view_distribution);
  if (
    compilerGuidanceImpliesFrameLogicTarget(compilerGuidance) &&
    !(MODAL_FRAME_LOGIC_TARGET_COMPONENT in legalIrTargetViewDistribution)
  ) {
    legalIrTargetViewDistribution = {
      ...legalIrTargetViewDistribution,
      [MODAL_FRAME_LOGIC_TARGET_COMPONENT]: 1.0,
    };
  }
  if (
    compilerGuidanceImpliesNeo4jProjectionTarget(compilerGuidance) &&
    !(NEO4J_COMPAT_TARGET_COMPONENT in legalIrTargetViewDistribution)
  ) {
    legalIrTargetViewDistribution = {
      ...legalIrTargetViewDistribution,
      [NEO4J_COMPAT_TARGET_COMPONENT]: 1.0,
    };
  }

  let legalIrViewGapDistribution = numericSignedMapping(compilerGuidance.legal_ir_view_gap_distribution);
  if (
    !Object.keys(legalIrViewGapDistribution).length &&
    (Object.keys(legalIrPredictedViewDistribution).length || Object.keys(legalIrTargetViewDistribution).length)
  ) {
    const gapEntries: Array<[string, number]> = [];
    const keys = new Set([...Object.keys(legalIrPredictedViewDistribution), ...Object.keys(legalIrTargetViewDistribution)]);
    for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
      const gap = round12((legalIrTargetViewDistribution[key] ?? 0) - (legalIrPredictedViewDistribution[key] ?? 0));
      if (Math.abs(gap) > 1.0e-12) gapEntries.push([key, gap]);
    }
    legalIrViewGapDistribution = Object.fromEntries(gapEntries);
  }

  let synthesisFocus = guidanceFeatureList(compilerGuidance.synthesis_focus, COMPILER_GUIDANCE_MAX_FEATURES);
  const frameLogicRoutes = compilerGuidanceFrameLogicTargetRoutes(compilerGuidance);
  if (frameLogicRoutes.length) {
    synthesisFocus = uniquePreserveOrder([...synthesisFocus, ...frameLogicRoutes]).slice(0, COMPILER_GUIDANCE_MAX_FEATURES);
  }
  if (compilerGuidanceImpliesNeo4jProjectionTarget(compilerGuidance)) {
    synthesisFocus = uniquePreserveOrder([...synthesisFocus, GRAPH_PROJECTION_GUIDANCE_ROUTE]).slice(0, COMPILER_GUIDANCE_MAX_FEATURES);
  }

  const summary: Record<string, unknown> = {
    decoded_embedding: decodedEmbedding,
    decoded_embedding_norm: round12(decodedEmbeddingNorm),
    family_distribution: numericDistribution(compilerGuidance.family_distribution),
    feature_groups: featureGroups,
    legal_ir_predicted_view_distribution: legalIrPredictedViewDistribution,
    legal_ir_target_view_distribution: legalIrTargetViewDistribution,
    legal_ir_view_gap_distribution: legalIrViewGapDistribution,
    legal_ir_view_metrics: legalIrViewMetrics,
    ranked_guidance_features: rankedGuidanceFeatures,
    sample_id: String(compilerGuidance.sample_id ?? ''),
    sample_memory_used: Boolean(compilerGuidance.sample_memory_used),
    synthesis_focus: synthesisFocus,
  };
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => {
      if (value === null || value === undefined || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (isRecord(value) && Object.keys(value).length === 0) return false;
      return true;
    })
  );
}

function normalizeGuidanceSurfaceOverlayTerms(terms: readonly string[]): string[] {
  let uniqueTerms = uniquePreserveOrder(terms.map(term => cleanNonEmptyString(term).toLowerCase()));
  if (uniqueTerms.includes('not') && uniqueTerms.some(term => GUIDANCE_SURFACE_NEGATING_FORCE_TERMS.has(term))) {
    uniqueTerms = uniqueTerms.filter(term => term !== 'not');
  }
  return uniqueTerms;
}

function guidanceSurfaceTermSourceGrounded(
  term: string,
  opts: { sourceTokens: Set<string>; sourceText: string },
): boolean {
  const aliases = GUIDANCE_SURFACE_SOURCE_ALIASES[term] ?? new Set([term]);
  for (const alias of aliases) {
    if (opts.sourceTokens.has(alias)) return true;
  }
  if (
    term === 'prohibited' &&
    ['may not', 'shall not', 'must not', 'is not authorized'].some(phrase => opts.sourceText.includes(phrase))
  ) {
    return true;
  }
  return false;
}

export function sourceGroundedGuidanceSurfaceOverlayTerms(
  terms: readonly string[],
  sourceText: string,
): string[] {
  const sourceRendered = cleanNonEmptyString(sourceText).toLowerCase();
  const sourceTokens = new Set(
    (sourceRendered.match(SLOT_FEATURE_TOKEN_RE) ?? [])
      .map(token => token.toLowerCase())
      .filter(token => /[a-z]/i.test(token))
  );
  if (sourceTokens.size === 0) return [...terms];
  return terms.filter(term => guidanceSurfaceTermSourceGrounded(String(term), {
    sourceTokens,
    sourceText: sourceRendered,
  }));
}

/**
 * Python parity for `modal/codec.py::_compiler_guidance_surface_overlay_terms`.
 */
export function compilerGuidanceSurfaceOverlayTerms(
  guidanceSummary: Record<string, unknown>,
  limit = 8,
): string[] {
  if (!Object.keys(guidanceSummary).length) return [];
  const terms: string[] = [];
  const add = (term: string): void => {
    const cleaned = cleanNonEmptyString(term).toLowerCase();
    if (cleaned) terms.push(cleaned);
  };
  for (const feature of compilerGuidanceFeatureStrings(guidanceSummary)) {
    const normalized = cleanNonEmptyString(feature).toLowerCase();
    if (!normalized.startsWith('decompiler-surface:')) continue;
    const parts = normalized.split(':').filter(Boolean);
    if (parts.length < 2) continue;
    const kind = parts[1];
    if (kind === 'force-lexeme' && parts.length >= 4) {
      const lexeme = parts[3];
      if (GUIDANCE_SURFACE_FORCE_LEXEMES.has(lexeme)) add(lexeme);
    } else if (kind === 'negation-placement') {
      add('not');
    } else if (kind === 'scope-realizer' && parts.length >= 3) {
      const term = GUIDANCE_SURFACE_SCOPE_TERMS[parts[2]];
      if (term) add(term);
    } else if (kind === 'force-polarity-template' && parts.length >= 5) {
      const polarity = parts[3];
      const scopeSignature = parts[4];
      if (polarity === 'negative_scope') add('not');
      for (const [marker, term] of Object.entries(GUIDANCE_SURFACE_SCOPE_SIGNATURE_TERMS)) {
        if (scopeSignature.includes(marker)) add(term);
      }
    } else if (kind === 'cue-surface-ir' && parts.length >= 3) {
      const term = GUIDANCE_SURFACE_CUE_TERMS[parts[2]];
      if (term) add(term);
    }
  }
  return normalizeGuidanceSurfaceOverlayTerms(terms).slice(0, Math.max(0, Math.trunc(limit)));
}

/**
 * Python parity for `modal/codec.py::_apply_compiler_guidance_surface_overlay`.
 */
export function applyCompilerGuidanceSurfaceOverlay(
  structuralDecodedText: string,
  overlayTerms: readonly string[],
  sourceText = '',
): string {
  const rendered = cleanNonEmptyString(structuralDecodedText);
  if (!rendered) return rendered;
  const existingTokens = new Set(
    (rendered.match(SLOT_FEATURE_TOKEN_RE) ?? [])
      .map(token => token.toLowerCase())
      .filter(token => /[a-z]/i.test(token))
  );
  const sourceRendered = cleanNonEmptyString(sourceText).toLowerCase();
  const sourceTokens = new Set(
    (sourceRendered.match(SLOT_FEATURE_TOKEN_RE) ?? [])
      .map(token => token.toLowerCase())
      .filter(token => /[a-z]/i.test(token))
  );
  const additions = uniquePreserveOrder(overlayTerms.map(value => cleanNonEmptyString(value).toLowerCase()))
    .filter(term => term && !existingTokens.has(term))
    .filter(term => (
      sourceTokens.size === 0 ||
      guidanceSurfaceTermSourceGrounded(term, { sourceTokens, sourceText: sourceRendered })
    ));
  if (!additions.length) return rendered;
  return cleanNonEmptyString(`${rendered} ${additions.join(' ')}`);
}

export function sourceCopyRewardHackPenalty(opts: {
  sourceSpanCopyRatio: number;
  textReconstructionSimilarity: number;
  structuralTextSimilarity: number;
}): number {
  const copiedSimilarityGap = Math.max(
    0,
    Number(opts.textReconstructionSimilarity) - Number(opts.structuralTextSimilarity),
  );
  return Number(opts.sourceSpanCopyRatio) * copiedSimilarityGap;
}

// ---------------------------------------------------------------------------
// DeterministicModalLogicCodec
// ---------------------------------------------------------------------------

export class DeterministicModalLogicCodec {
  private config: ModalLogicCodecConfig;

  constructor(config?: Partial<ModalLogicCodecConfig>) {
    this.config = makeCodecConfig(config ?? {});
  }

  /**
   * Encode legal text into a modal IR result.
   * This is a deterministic compact port without ML dependencies.
   */
  encode(text: string): ModalLogicCodecResult {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const family = detectModalFamily(normalizedText);
    const srcEmb = stableMockEmbedding(normalizedText, this.config.embeddingDimensions);
    const decEmb = stableMockEmbedding(`${normalizedText}_decoded`, this.config.embeddingDimensions);
    const familyProbs = buildFamilyProbs(family);
    const kgTriples = buildKGTriples(normalizedText, family);

    // Deterministic proxy losses for the compact no-ML encode path.
    const cosSim = srcEmb.reduce((s, x, i) => s + x * decEmb[i], 0);
    const cosLoss = Math.max(0, 1 - cosSim);

    return new ModalLogicCodecResult({
      sourceText: text,
      normalizedText,
      parserName: this.config.parserBackend,
      sourceEmbedding: srcEmb,
      decodedEmbedding: decEmb,
      familyProbabilities: familyProbs,
      targetFamily: family,
      targetFamilyDistribution: { [family]: 1.0 },
      frameCandidates: [],
      selectedFrame: this.config.frameDomain ?? null,
      kgTriples,
      decodedText: normalizedText,
      losses: {
        cosine_loss: cosLoss,
        reconstruction_loss: cosLoss * 0.5,
        flogic_similarity_loss: this.config.useFlogic ? 0.1 : 0,
      },
      metadata: {
        embedding_dimensions: this.config.embeddingDimensions,
        embedding_model: 'stable_mock_embedding',
        ontology_name: this.config.ontologyName,
      },
    });
  }

  /** Encode a batch of texts. */
  encodeBatch(texts: string[]): ModalLogicCodecResult[] {
    return texts.map(t => this.encode(t));
  }
}

// PORT-125: FLogicOptimizer integration hook; full optimizer lives in flogic-semantic-optimizer.ts.
export function withFLogicOptimizer<T extends { confidence: number; score?: number }>(
  result: T,
  optimizerScore?: number,
): T & { flogicOptimized: boolean; flogicScore: number } {
  return {
    ...result,
    flogicOptimized: optimizerScore !== undefined,
    flogicScore:     optimizerScore ?? result.score ?? result.confidence,
  };
}

export interface ModalIRPredicate {
  name: string;
  arguments?: string[];
}

export interface ModalIROperator {
  symbol: string;
  family: string;
  system: string;
}

export interface ModalIRFormula {
  operator: ModalIROperator;
  predicate: ModalIRPredicate;
}

export interface ModalIRDocument {
  formulas: ModalIRFormula[];
}

export function decodeModalIrText(modalIr: ModalIRDocument): string {
  return modalIr.formulas.map(modalFormulaToText).join('; ');
}

export function modalFormulaToText(formula: ModalIRFormula): string {
  const args = formula.predicate.arguments ?? [];
  const predicate = args.length
    ? `${formula.predicate.name}(${args.join(', ')})`
    : formula.predicate.name;
  return `${formula.operator.symbol}[${formula.operator.family}:${formula.operator.system}](${predicate})`;
}

export function targetFamilyForModalIr(modalIr: ModalIRDocument): string {
  return modalIr.formulas.length ? modalIr.formulas[0].operator.family : 'hybrid';
}

export function targetFamilyDistributionForModalIr(modalIr: ModalIRDocument): Record<string, number> {
  if (!modalIr.formulas.length) return { hybrid: 1.0 };
  const counts = new Map<string, number>();
  for (const formula of modalIr.formulas) {
    counts.set(formula.operator.family, (counts.get(formula.operator.family) ?? 0) + 1);
  }
  const total = modalIr.formulas.length;
  return Object.fromEntries([...counts.entries()].sort().map(([family, count]) => [family, count / total]));
}

export const decode_modal_ir_text = decodeModalIrText;
export const modal_formula_to_text = modalFormulaToText;
export const target_family_for_modal_ir = targetFamilyForModalIr;
export const target_family_distribution_for_modal_ir = targetFamilyDistributionForModalIr;
export const canonical_usc_citation = canonicalUscCitation;
export const title_section_coordinate = titleSectionCoordinate;
export const citation_section_delimiter_tokens = citationSectionDelimiterTokens;
export const citation_section_delimiter_kind = citationSectionDelimiterKind;
export const citation_section_component_signature = citationSectionComponentSignature;
export const citation_section_component_profile = citationSectionComponentProfile;
export const source_id_inferred_citation = sourceIdInferredCitation;
export const inferred_citations_from_source_ids = inferredCitationsFromSourceIds;
export const modal_operator_feature_key = modalOperatorFeatureKey;
export const modal_operator_pair_feature_key = modalOperatorPairFeatureKey;
export const temporal_clause_prefix_relation = temporalClausePrefixRelation;
export const temporal_transition_context_cues_from_text = temporalTransitionContextCuesFromText;

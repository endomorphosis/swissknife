/**
 * modal-logic-codec.ts
 *
 * Deterministic modal logic codec — encode legal text into modal IR.
 * TypeScript port of key public API from:
 *   ipfs_datasets_py/logic/modal/codec.py
 *
 * Provides (simulated, no ML deps):
 *   ModalLogicCodecConfig     — configuration
 *   ModalLogicCodecResult     — one encode/decode pass result
 *   DeterministicModalLogicCodec — encode(text) → ModalLogicCodecResult
 */

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
// Helpers (simulated, no ML deps)
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

function buildSimulatedEmbedding(text: string, dims: number): number[] {
  const v: number[] = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dims] = (v[i % dims] + text.charCodeAt(i) / 256) % 1.0;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm);
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
   * This is a simplified simulation without ML dependencies.
   */
  encode(text: string): ModalLogicCodecResult {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const family = detectModalFamily(normalizedText);
    const srcEmb = buildSimulatedEmbedding(normalizedText, this.config.embeddingDimensions);
    const decEmb = buildSimulatedEmbedding(normalizedText + '_decoded', this.config.embeddingDimensions);
    const familyProbs = buildFamilyProbs(family);
    const kgTriples = buildKGTriples(normalizedText, family);

    // Simulated losses
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
        ontology_name: this.config.ontologyName,
        simulated: true,
      },
    });
  }

  /** Encode a batch of texts. */
  encodeBatch(texts: string[]): ModalLogicCodecResult[] {
    return texts.map(t => this.encode(t));
  }
}

// PORT-125: FLogicOptimizer integration hook (stub — real optimizer in flogic-semantic-optimizer.ts)
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

/**
 * Modal Compiler — T-252 (Sprint 56)
 *
 * Port of ipfs_datasets_py/logic/modal/compiler.py (3221L — key API only)
 *
 * Deterministic legal-text → modal IR compiler.
 *
 * The Python original uses spaCy (NLP pipeline), BM25 frame selection,
 * and a full ModalRegistry.  This TypeScript port implements the same
 * public interface using the PatternMatcher + FormulaAnalyzer infrastructure
 * already available in the swissknife runtime.
 */

import { PatternMatcher, PatternType } from '../../tdfol-nl-patterns';
import { FormulaAnalyzer, FormulaType } from '../../formula-analyzer';
import { extractNormativeElements, segmentLegalText } from '../../deontic-legal-text-engine';
import { parserElementToFormula } from '../../deontic-formula-builder';

// ---------------------------------------------------------------------------
// ModalCompilerConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for deterministic modal compilation.
 *
 * TypeScript port of `ModalCompilerConfig` from `modal/compiler.py`.
 */
export interface ModalCompilerConfig {
  parserBackend: 'regex' | 'spacy' | 'legal';
  spacyModelName: string;
  topKFrames: number;
  frameDomain: string | null;
  frameScoreMargin: number;
  modalFamilyShareMargin: number;
  modalFamilySecondaryShareFloor: number;
  modalPrimaryFamilyMargin: number;
  modalAdaptiveFamilyMargin: number;
  modalPrimaryFamilyOutvoteMargin: number;
  modalConditionalTargetFamilyOutvoteMargin: number;
  modalDeonticTargetFamilyOutvoteMargin: number;
  modalDynamicTargetFamilyOutvoteMargin: number;
  modalAlethicTargetFamilyOutvoteMargin: number;
  modalTemporalTargetFamilyOutvoteMargin: number;
  modalFrameTargetFamilyOutvoteMargin: number;
}

export function defaultModalCompilerConfig(): ModalCompilerConfig {
  return {
    parserBackend:                    'regex',
    spacyModelName:                   'en_core_web_sm',
    topKFrames:                       3,
    frameDomain:                      null,
    frameScoreMargin:                 0.05,
    modalFamilyShareMargin:           0.34,
    modalFamilySecondaryShareFloor:   0.20,
    modalPrimaryFamilyMargin:         0.15,
    modalAdaptiveFamilyMargin:        0.15,
    modalPrimaryFamilyOutvoteMargin:  0.0,
    modalConditionalTargetFamilyOutvoteMargin: 0.0,
    modalDeonticTargetFamilyOutvoteMargin: 0.0,
    modalDynamicTargetFamilyOutvoteMargin: 0.0,
    modalAlethicTargetFamilyOutvoteMargin: 0.0,
    modalTemporalTargetFamilyOutvoteMargin: 0.0,
    modalFrameTargetFamilyOutvoteMargin: 0.0,
  };
}

export function pythonDefaultModalCompilerConfig(): ModalCompilerConfig {
  return {
    ...defaultModalCompilerConfig(),
    parserBackend: 'spacy',
  };
}

export function modalCompilerConfigToPythonDict(config: ModalCompilerConfig): Record<string, unknown> {
  return {
    parser_backend: config.parserBackend,
    spacy_model_name: config.spacyModelName,
    top_k_frames: config.topKFrames,
    frame_domain: config.frameDomain,
    frame_score_margin: config.frameScoreMargin,
    modal_family_share_margin: config.modalFamilyShareMargin,
    modal_family_secondary_share_floor: config.modalFamilySecondaryShareFloor,
    modal_primary_family_margin: config.modalPrimaryFamilyMargin,
    modal_adaptive_family_margin: config.modalAdaptiveFamilyMargin,
    modal_primary_family_outvote_margin: config.modalPrimaryFamilyOutvoteMargin,
    modal_conditional_target_family_outvote_margin: config.modalConditionalTargetFamilyOutvoteMargin,
    modal_deontic_target_family_outvote_margin: config.modalDeonticTargetFamilyOutvoteMargin,
    modal_dynamic_target_family_outvote_margin: config.modalDynamicTargetFamilyOutvoteMargin,
    modal_alethic_target_family_outvote_margin: config.modalAlethicTargetFamilyOutvoteMargin,
    modal_temporal_target_family_outvote_margin: config.modalTemporalTargetFamilyOutvoteMargin,
    modal_frame_target_family_outvote_margin: config.modalFrameTargetFamilyOutvoteMargin,
  };
}

// ---------------------------------------------------------------------------
// ModalCompilationAmbiguity
// ---------------------------------------------------------------------------

/** A compiler-detected ambiguity requiring review or advisor help. */
export interface ModalCompilationAmbiguity {
  ambiguityType: string;
  message: string;
  candidateIds: string[];
  severity: 'review' | 'error' | 'warning' | 'requires_rule';
  metadata: Record<string, unknown>;
}

export function makeAmbiguity(
  ambiguityType: string,
  message: string,
  opts: { candidateIds?: string[]; severity?: ModalCompilationAmbiguity['severity']; metadata?: Record<string, unknown> } = {},
): ModalCompilationAmbiguity {
  return {
    ambiguityType,
    message,
    candidateIds: opts.candidateIds ?? [],
    severity:     opts.severity    ?? 'review',
    metadata:     opts.metadata    ?? {},
  };
}

export function ambiguityToDict(a: ModalCompilationAmbiguity): Record<string, unknown> {
  return { ambiguityType: a.ambiguityType, message: a.message, candidateIds: a.candidateIds, severity: a.severity, metadata: a.metadata };
}

export function ambiguityToPythonDict(a: ModalCompilationAmbiguity): Record<string, unknown> {
  return {
    ambiguity_type: a.ambiguityType,
    message: a.message,
    candidate_ids: a.candidateIds,
    severity: a.severity,
    metadata: a.metadata,
  };
}

export interface ModalCompilerFormulaLike {
  formulaId?: string;
  formula_id?: string;
  operator?: {
    family?: string;
    system?: string;
    symbol?: string;
  };
  provenance?: {
    startChar?: number;
    start_char?: number;
    endChar?: number;
    end_char?: number;
  };
}

export function modalCompilerRankingShare(candidate: Record<string, unknown>): number {
  const rawShare = Object.prototype.hasOwnProperty.call(candidate, 'share_raw')
    ? candidate.share_raw
    : Object.prototype.hasOwnProperty.call(candidate, 'share')
      ? candidate.share
      : 0;
  const resolved = typeof rawShare === 'number' ? rawShare : Number(rawShare);
  return Number.isNaN(resolved) ? 0 : resolved;
}

function formulaStringValue(value: unknown): string {
  return String(value ?? '');
}

function formulaSpanValue(value: unknown): number {
  const resolved = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
}

export function modalCompilerFormulaAmbiguities(
  formulasOrDocument: ModalCompilerFormulaLike[] | { formulas?: ModalCompilerFormulaLike[] },
): ModalCompilationAmbiguity[] {
  const formulas = Array.isArray(formulasOrDocument)
    ? formulasOrDocument
    : formulasOrDocument.formulas ?? [];
  const bySpan = new Map<string, { span: [number, number]; candidates: string[] }>();

  for (const formula of formulas) {
    const provenance = formula.provenance ?? {};
    const startChar = formulaSpanValue(provenance.start_char ?? provenance.startChar);
    const endChar = formulaSpanValue(provenance.end_char ?? provenance.endChar);
    const span: [number, number] = [startChar, endChar];
    const key = `${startChar}:${endChar}`;
    const operator = formula.operator ?? {};
    const candidate = [
      formulaStringValue(formula.formula_id ?? formula.formulaId),
      formulaStringValue(operator.family),
      formulaStringValue(operator.system),
      formulaStringValue(operator.symbol),
    ].join(':');
    const bucket = bySpan.get(key) ?? { span, candidates: [] };
    bucket.candidates.push(candidate);
    bySpan.set(key, bucket);
  }

  const ambiguities: ModalCompilationAmbiguity[] = [];
  const orderedBuckets = [...bySpan.values()].sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
  for (const { span, candidates } of orderedBuckets) {
    const families = new Set(candidates.map(candidate => candidate.split(':')[1] ?? ''));
    if (candidates.length > 1 && families.size > 1) {
      ambiguities.push(makeAmbiguity(
        'multi_family_same_span',
        'Multiple modal families were compiled from the same text span.',
        {
          candidateIds: [...candidates].sort(),
          metadata: { span },
        },
      ));
    }
  }
  return ambiguities;
}

// ---------------------------------------------------------------------------
// ModalIR (lightweight representation)
// ---------------------------------------------------------------------------

/** Lightweight modal IR document — simplified from the Python ModalIRDocument. */
export interface SimpleModalIR {
  documentId: string;
  text: string;
  normalizedText: string;
  modalFamily: string;      // e.g. 'deontic', 'temporal', 'alethic'
  confidence: number;
  operators: string[];
  slots: Record<string, string>;
  formulas: string[];
  formulaFamilies: string[];
  formulaCount: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ModalCompilationResult
// ---------------------------------------------------------------------------

/** Result of deterministic legal text compilation. */
export interface ModalCompilationResult {
  modalIr: SimpleModalIR;
  parserName: string;
  normalizedText: string;
  frameCandidates: Array<{ frameId: string; score: number }>;
  selectedFrame: string | null;
  ambiguities: ModalCompilationAmbiguity[];
  metadata: Record<string, unknown>;
}

export function compilationResultToDict(r: ModalCompilationResult): Record<string, unknown> {
  return {
    modalIr:        r.modalIr,
    parserName:     r.parserName,
    normalizedText: r.normalizedText,
    frameCandidates: r.frameCandidates,
    selectedFrame:  r.selectedFrame,
    ambiguities:    r.ambiguities.map(ambiguityToDict),
    metadata:       r.metadata,
  };
}

// ---------------------------------------------------------------------------
// Frame detection helpers
// ---------------------------------------------------------------------------

const FRAME_KEYWORDS: Record<string, string[]> = {
  deontic:   ['must', 'shall', 'may', 'obligated', 'permitted', 'forbidden', 'prohibited'],
  temporal:  ['always', 'eventually', 'until', 'after', 'before', 'while', 'within'],
  alethic:   ['necessarily', 'possibly', 'certainly', 'inevitably'],
  epistemic: ['knows', 'believes', 'is aware', 'is certain'],
  conditional: ['if', 'when', 'provided that', 'unless'],
};

const CANONICAL_MODAL_FAMILIES = new Set([
  'deontic',
  'temporal',
  'alethic',
  'epistemic',
  'conditional',
  'conditional_normative',
  'dynamic',
  'frame',
  'doxastic',
]);

const COMPILER_PRIORITY_SIGNAL_FREE_TARGETS: Record<string, string[]> = {
  deontic: ['conditional_normative', 'epistemic', 'frame', 'temporal', 'dynamic', 'doxastic', 'deontic'],
  temporal: ['conditional_normative', 'deontic', 'alethic', 'epistemic', 'frame', 'dynamic', 'temporal', 'doxastic'],
  alethic: ['deontic', 'conditional_normative', 'epistemic', 'temporal', 'frame'],
  epistemic: ['deontic', 'conditional_normative', 'frame', 'temporal'],
  dynamic: ['temporal', 'dynamic'],
  frame: ['conditional_normative', 'deontic', 'epistemic', 'temporal', 'doxastic', 'frame', 'alethic'],
  doxastic: ['epistemic', 'doxastic', 'conditional_normative'],
};

const COMPILER_REQUIRED_ADAPTIVE_TARGETS: Record<string, string[]> = {
  deontic: ['conditional_normative', 'dynamic', 'epistemic', 'deontic', 'temporal', 'frame', 'doxastic', 'alethic'],
  temporal: ['deontic', 'alethic', 'epistemic', 'doxastic', 'conditional_normative', 'frame', 'dynamic', 'temporal'],
  alethic: ['deontic', 'conditional_normative', 'epistemic', 'temporal', 'frame'],
  epistemic: ['deontic', 'conditional_normative', 'epistemic', 'temporal', 'frame'],
  dynamic: ['dynamic', 'temporal'],
  frame: ['conditional_normative', 'deontic', 'alethic', 'epistemic', 'temporal', 'frame', 'doxastic', 'dynamic'],
  doxastic: ['epistemic', 'doxastic', 'conditional_normative'],
};

const COMPILER_SIGNAL_FREE_TARGETS: Record<string, string[]> = {
  deontic: ['alethic', 'deontic', 'conditional_normative', 'frame', 'temporal', 'epistemic', 'dynamic', 'doxastic'],
  temporal: ['conditional_normative', 'deontic', 'alethic', 'epistemic', 'doxastic', 'frame', 'dynamic', 'temporal'],
  alethic: ['epistemic', 'dynamic', 'deontic', 'conditional_normative', 'frame', 'temporal'],
  epistemic: ['deontic', 'conditional_normative', 'epistemic', 'frame', 'temporal'],
  dynamic: ['temporal', 'dynamic'],
  frame: ['conditional_normative', 'deontic', 'frame', 'alethic', 'epistemic', 'dynamic', 'temporal', 'doxastic'],
  doxastic: ['epistemic', 'doxastic', 'conditional_normative'],
};

const COMPILER_AMBIGUITY_POLICY_TARGETS: Record<string, string[]> = {
  deontic: ['conditional_normative', 'dynamic', 'epistemic', 'alethic', 'deontic', 'temporal', 'frame', 'doxastic'],
  temporal: ['deontic', 'alethic', 'epistemic', 'conditional_normative', 'frame', 'dynamic', 'temporal', 'doxastic'],
  alethic: ['deontic', 'conditional_normative', 'epistemic', 'frame'],
  epistemic: ['conditional_normative', 'deontic', 'temporal', 'frame'],
  dynamic: ['temporal', 'dynamic'],
  frame: ['conditional_normative', 'deontic', 'frame', 'alethic', 'epistemic', 'dynamic', 'temporal', 'doxastic'],
  doxastic: ['epistemic', 'doxastic', 'conditional_normative'],
};

const COMPILER_REFINED_MARGIN_BY_PAIR: Record<string, number> = {
  'deontic->deontic': 0.086,
  'deontic->temporal': 0.006,
  'deontic->alethic': 0.0015,
  'deontic->epistemic': 0.0015,
  'deontic->dynamic': 0.0015,
  'deontic->frame': 0.0015,
  'deontic->doxastic': 0.006,
  'temporal->deontic': 0.0015,
  'temporal->temporal': 0.0015,
  'temporal->alethic': 0.0015,
  'temporal->epistemic': 0.0015,
  'temporal->dynamic': 0.0015,
  'temporal->frame': 0.0015,
  'temporal->doxastic': 0.0015,
  'alethic->deontic': 0.0015,
  'epistemic->deontic': 0.0015,
  'dynamic->dynamic': 0.02,
  'frame->deontic': 0.006,
  'frame->temporal': 0.006,
  'frame->alethic': 0.0015,
  'frame->epistemic': 0.02,
  'frame->dynamic': 0.0015,
  'frame->frame': 0.135,
  'frame->doxastic': 0.0015,
};

const COMPILER_WEAK_TYPED_SELF_MARGIN_BY_PAIR: Record<string, number> = {
  'deontic->deontic': 0.155,
  'temporal->temporal': 0.155,
  'dynamic->dynamic': 0.195,
  'frame->frame': 0.19,
};

const COMPILER_ZERO_MARGIN_CONTESTED_PAIRS = new Set([
  'epistemic->epistemic',
]);

/**
 * Normalize modal-family tokens for deterministic policy table lookups.
 *
 * Mirrors the Python helper `_canonical_modal_family_token` by stripping
 * routing prefixes/suffixes and trying a conservative candidate sequence.
 */
export function canonicalModalFamilyToken(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  let resolved = raw;
  if (resolved.includes('->')) {
    const target = resolved.split('->', 2)[1]?.trim();
    if (target) resolved = target;
  }

  const remember = (token: string, seen: Set<string>, out: string[]): void => {
    const normalized = String(token ?? '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  const leafDot = resolved.includes('.') ? resolved.split('.').at(-1) ?? resolved : resolved;
  const leafColon = leafDot.includes(':') ? leafDot.split(':').at(-1) ?? leafDot : leafDot;
  const leafSlash = leafColon.includes('/') ? leafColon.split('/').at(-1) ?? leafColon : leafColon;
  const leafPipe = leafSlash.includes('|') ? leafSlash.split('|').at(-1) ?? leafSlash : leafSlash;

  const splitTokens: string[] = [];
  for (const delimiter of ['.', ':', '/', '|']) {
    if (!resolved.includes(delimiter)) continue;
    for (const part of resolved.split(delimiter)) {
      const cleaned = part.trim();
      if (cleaned) splitTokens.push(cleaned);
    }
  }

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const token of [resolved, leafDot, leafColon, leafSlash, leafPipe, ...splitTokens]) {
    remember(token, seen, candidates);
    const lowered = token.toLowerCase();
    remember(lowered, seen, candidates);
    remember(lowered.replace(/[- ]/g, '_'), seen, candidates);
  }

  for (const candidate of candidates) {
    if (CANONICAL_MODAL_FAMILIES.has(candidate)) return candidate;
  }
  return leafPipe.toLowerCase().replace(/[- ]/g, '_');
}

function resolveCompilerModalFamilyName(value: unknown, preferTargetSide = false): string {
  let resolved = String(value ?? '').trim();
  if (!resolved) return '';
  if (resolved.includes('->')) {
    const [sourceFamily, targetFamily] = resolved.split('->', 2);
    const directionalSide = (preferTargetSide ? targetFamily : sourceFamily)?.trim();
    if (directionalSide) resolved = directionalSide;
  }

  const remember = (token: string, seen: Set<string>, out: string[]): void => {
    const normalized = String(token ?? '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  const leafDot = resolved.includes('.') ? resolved.split('.').at(-1) ?? resolved : resolved;
  const leafColon = leafDot.includes(':') ? leafDot.split(':').at(-1) ?? leafDot : leafDot;
  const leafSlash = leafColon.includes('/') ? leafColon.split('/').at(-1) ?? leafColon : leafColon;
  const leafPipe = leafSlash.includes('|') ? leafSlash.split('|').at(-1) ?? leafSlash : leafSlash;
  const splitTokens: string[] = [];
  for (const delimiter of ['->', '.', ':', '/', '|']) {
    if (!resolved.includes(delimiter)) continue;
    for (const part of resolved.split(delimiter)) {
      const cleaned = part.trim();
      if (cleaned) splitTokens.push(cleaned);
    }
  }

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const token of [resolved, leafDot, leafColon, leafSlash, leafPipe, ...splitTokens]) {
    remember(token, seen, candidates);
    const lowered = token.toLowerCase();
    remember(lowered, seen, candidates);
    remember(lowered.replace(/[- ]/g, '_'), seen, candidates);
  }
  for (const candidate of candidates) {
    if (CANONICAL_MODAL_FAMILIES.has(candidate)) return candidate;
  }
  return resolved.toLowerCase();
}

function compilerPairKey(predictedFamily: string, targetFamily: string): string {
  return `${resolveCompilerModalFamilyName(predictedFamily)}->${resolveCompilerModalFamilyName(targetFamily, true)}`;
}

export function prioritySignalFreeAdaptiveAmbiguityTargets(family: string): string[] {
  return [...(COMPILER_PRIORITY_SIGNAL_FREE_TARGETS[resolveCompilerModalFamilyName(family)] ?? [])];
}

export function compilerRequiredAdaptiveAmbiguityTargets(family: string): string[] {
  return [...(COMPILER_REQUIRED_ADAPTIVE_TARGETS[resolveCompilerModalFamilyName(family)] ?? [])];
}

export function signalFreeAdaptiveAmbiguityTargets(family: string): string[] {
  return [...(COMPILER_SIGNAL_FREE_TARGETS[resolveCompilerModalFamilyName(family)] ?? [])];
}

export function compilerAmbiguityPolicyTargets(family: string): string[] {
  return [...(COMPILER_AMBIGUITY_POLICY_TARGETS[resolveCompilerModalFamilyName(family)] ?? [])];
}

export function compilerRefinedModalFamilyCueMarginBuffer(predictedFamily: string, targetFamily: string): number {
  return Math.max(0, COMPILER_REFINED_MARGIN_BY_PAIR[compilerPairKey(predictedFamily, targetFamily)] ?? 0);
}

export function compilerWeakTypedSelfFamilyCueMarginBuffer(predictedFamily: string, targetFamily: string): number {
  return Math.max(0, COMPILER_WEAK_TYPED_SELF_MARGIN_BY_PAIR[compilerPairKey(predictedFamily, targetFamily)] ?? 0);
}

export function isPrioritySignalFreeAdaptiveAmbiguityPair(predictedFamily: string, targetFamily: string): boolean {
  return prioritySignalFreeAdaptiveAmbiguityTargets(predictedFamily)
    .includes(canonicalModalFamilyToken(targetFamily));
}

export function isCompilerRequiredAdaptiveAmbiguityPair(predictedFamily: string, targetFamily: string): boolean {
  return compilerRequiredAdaptiveAmbiguityTargets(predictedFamily)
    .includes(canonicalModalFamilyToken(targetFamily));
}

export function isCompilerAmbiguityPolicyPair(predictedFamily: string, targetFamily: string): boolean {
  const key = compilerPairKey(predictedFamily, targetFamily);
  const [source, target] = key.split('->', 2);
  return compilerAmbiguityPolicyTargets(source).includes(target);
}

export function isSignalFreeAdaptiveAmbiguityPair(predictedFamily: string, targetFamily: string): boolean {
  const key = compilerPairKey(predictedFamily, targetFamily);
  const [source, target] = key.split('->', 2);
  return signalFreeAdaptiveAmbiguityTargets(source).includes(target);
}

export function prefersContestedZeroMarginAdaptiveAmbiguityPair(predictedFamily: string, targetFamily: string): boolean {
  return COMPILER_ZERO_MARGIN_CONTESTED_PAIRS.has(compilerPairKey(predictedFamily, targetFamily));
}

export function supportsSignalFreeAdaptiveAmbiguityPair(predictedFamily: string, targetFamily: string): boolean {
  const resolvedTargetFamily = canonicalModalFamilyToken(targetFamily);
  return (
    isPrioritySignalFreeAdaptiveAmbiguityPair(predictedFamily, resolvedTargetFamily) ||
    isCompilerRequiredAdaptiveAmbiguityPair(predictedFamily, resolvedTargetFamily) ||
    signalFreeAdaptiveAmbiguityTargets(predictedFamily).includes(resolvedTargetFamily) ||
    isSignalFreeAdaptiveAmbiguityPair(predictedFamily, resolvedTargetFamily)
  );
}

function detectModalFamily(text: string): { family: string; score: number }[] {
  const lower = text.toLowerCase();
  const scores: { family: string; score: number }[] = [];
  for (const [family, keywords] of Object.entries(FRAME_KEYWORDS)) {
    const hits = keywords.filter(k => lower.includes(k)).length;
    if (hits > 0) scores.push({ family, score: hits / keywords.length });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[""'']/g, '"').trim();
}

function isLegalParserBackend(parserBackend: string): boolean {
  return ['regex', 'legal', 'legal_modal_parser', 'deontic', 'deontic:d']
    .includes(String(parserBackend ?? '').trim().toLowerCase());
}

function nonEmptyStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(value => String(value ?? '').trim()).filter(Boolean)
    : [];
}

function modalFamilyCounts(families: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const family of families) {
    const key = String(family ?? '').trim();
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function compiledFormulaFamiliesFromElement(element: Record<string, unknown>): string[] {
  const families: string[] = [];
  const conditions = nonEmptyStrings(element.conditions);
  const temporalConstraints = [
    ...nonEmptyStrings(element.temporal_constraints),
    ...nonEmptyStrings(
      Array.isArray(element.temporal_constraint_details)
        ? element.temporal_constraint_details.map(detail => (
          detail && typeof detail === 'object' && 'normalized_text' in detail
            ? (detail as Record<string, unknown>).normalized_text
            : ''
        ))
        : []
    ),
  ].filter(Boolean);
  const exceptions = nonEmptyStrings(element.exceptions);
  const normType = String(element.norm_type ?? '').trim().toLowerCase();
  const operator = String(element.deontic_operator ?? '').trim().toUpperCase();

  if (conditions.length > 0) families.push('conditional_normative');

  const baseFamily = (
    operator === 'O' ||
    operator === 'P' ||
    operator === 'F' ||
    ['obligation', 'permission', 'prohibition', 'applicability', 'exemption', 'instrument_lifecycle', 'purpose']
      .includes(normType)
  )
    ? 'deontic'
    : normType === 'definition'
      ? 'frame'
      : 'deontic';
  families.push(baseFamily);

  if (temporalConstraints.length > 0) families.push('temporal');
  if (exceptions.length > 0 && !families.includes('conditional_normative')) families.push('conditional_normative');

  return families;
}

// ---------------------------------------------------------------------------
// DeterministicModalCompiler
// ---------------------------------------------------------------------------

export interface CompilerStats {
  totalCompiled: number;
  withAmbiguities: number;
  avgConfidence: number;
}

/**
 * Compile legal text into modal IR with explainable frame selection.
 *
 * TypeScript port of `DeterministicModalCompiler` from
 * `ipfs_datasets_py/logic/modal/compiler.py`.
 *
 * Replaces spaCy/BM25 internals with PatternMatcher + FormulaAnalyzer.
 */
export class DeterministicModalCompiler {
  private readonly config: ModalCompilerConfig;
  private readonly matcher = new PatternMatcher();
  private readonly analyzer = new FormulaAnalyzer();
  private readonly stats: CompilerStats = { totalCompiled: 0, withAmbiguities: 0, avgConfidence: 0 };

  constructor(config?: Partial<ModalCompilerConfig>) {
    this.config = { ...defaultModalCompilerConfig(), ...config };
  }

  /**
   * Compile a single text string into a `ModalCompilationResult`.
   */
  compile(
    text: string,
    opts: { documentId?: string; citation?: string; source?: string } = {},
  ): ModalCompilationResult {
    this.stats.totalCompiled++;
    const normalized = normalizeText(text);
    const ambiguities: ModalCompilationAmbiguity[] = [];
    const legalParserBackend = isLegalParserBackend(this.config.parserBackend);

    // Detect modal family via keyword scoring
    const familyScores = detectModalFamily(normalized);
    const topFrames = familyScores.slice(0, this.config.topKFrames).map(fs => ({
      frameId: fs.family,
      score: fs.score,
    }));

    // Handle ambiguity: two top frames within score margin
    let selectedFrame: string | null = topFrames[0]?.frameId ?? null;
    if (topFrames.length >= 2) {
      const margin = topFrames[0].score - topFrames[1].score;
      if (margin < this.config.frameScoreMargin) {
        ambiguities.push(makeAmbiguity(
          'ambiguous_modal_family',
          `Frames '${topFrames[0].frameId}' and '${topFrames[1].frameId}' are within margin (${margin.toFixed(3)} < ${this.config.frameScoreMargin})`,
          { candidateIds: [topFrames[0].frameId, topFrames[1].frameId], severity: 'review' },
        ));
      }
    }

    // Extract operators and entities via PatternMatcher
    const matches = this.matcher.match(text);
    const operators: string[] = [...new Set(matches.map(m => m.pattern.type))];
    const slots: Record<string, string> = {};
    for (const m of matches.slice(0, 3)) {
      if (m.entities['agent'])  slots['agent']  = m.entities['agent'];
      if (m.entities['action']) slots['action'] = m.entities['action'];
    }

    const parserElements = legalParserBackend ? extractNormativeElements(text) : [];
    const formulas = parserElements.map(element => parserElementToFormula(element));
    const formulaFamilies = parserElements.flatMap(element => compiledFormulaFamiliesFromElement(element));
    if (parserElements[0]?.subject && !slots['agent']) slots['agent'] = String(parserElements[0].subject);
    if (parserElements[0]?.action && !slots['action']) slots['action'] = String(parserElements[0].action);

    // Confidence: average of top frame score + pattern match density
    const patternDensity = Math.min(1, matches.length / 5);
    const confidence = familyScores.length > 0
      ? (familyScores[0].score + patternDensity) / 2
      : patternDensity * 0.5;

    if (normalized && formulaFamilies.length === 0) {
      ambiguities.push(makeAmbiguity(
        'missing_modal_formula',
        'No deterministic modal formula was produced for non-empty text.',
        { severity: 'requires_rule' },
      ));
    }

    if (ambiguities.length > 0) this.stats.withAmbiguities++;
    this.stats.avgConfidence =
      ((this.stats.totalCompiled - 1) * this.stats.avgConfidence + confidence) / this.stats.totalCompiled;

    const parserName = legalParserBackend ? 'legal_modal_parser_v1' : 'spacy_modal_codec_v1';
    const modalFamilyCountMap = modalFamilyCounts(formulaFamilies);
    const segmentCount = segmentLegalText(text).length;
    const metadata: Record<string, unknown> = {
      documentId: opts.documentId,
      citation: opts.citation,
      source: opts.source ?? 'legal_text',
      matchCount: matches.length,
      ambiguity_count: ambiguities.length,
      deterministic_compiler: 'modal_compiler_v1',
      deterministic_parser: parserName,
      frame_selector: 'keyword_v1',
      llm_call_count: 0,
      modal_family_counts: modalFamilyCountMap,
      parser_backend: this.config.parserBackend,
      segment_count: segmentCount,
    };

    const modalIr: SimpleModalIR = {
      documentId:    opts.documentId ?? `doc-${Date.now()}`,
      text:          text,
      normalizedText: normalized,
      modalFamily:   formulaFamilies[0] ?? selectedFrame ?? 'unknown',
      confidence,
      operators,
      slots,
      formulas,
      formulaFamilies,
      formulaCount: formulaFamilies.length,
      metadata,
    };

    return {
      modalIr,
      parserName,
      normalizedText: normalized,
      frameCandidates: topFrames,
      selectedFrame,
      ambiguities,
      metadata,
    };
  }

  /** Compile multiple texts. */
  compileAll(texts: string[]): ModalCompilationResult[] {
    return texts.map(t => this.compile(t));
  }

  getStats(): Readonly<CompilerStats> { return { ...this.stats }; }
}

// PORT-124: Extended ModalIRDocument fields (matching Python ModalIRDocument)
export interface ModalIRDocumentFull {
  /** Core fields (already in ModalIRDocument) */
  documentId:    string;
  text:          string;
  formulas:      string[];
  /** PORT-124: Additional Python-aligned fields */
  rankingScore?: number;      // BM25/TF-IDF relevance score
  family:        string;      // modal logic family classification
  evidenceKeys:  string[];    // evidence keys from frame extraction
  editorialStatus: string;    // 'draft' | 'approved' | 'published'
  jurisdiction?: string;
  legalDomain?:  string;
}

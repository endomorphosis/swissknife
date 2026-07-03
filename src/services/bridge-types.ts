/**
 * bridge-types.ts
 *
 * Shared types for legal IR bridge adapters.
 * TypeScript port of ipfs_datasets_py/logic/bridge/types.py
 *
 * Provides:
 *   LogicIRView           — one formal view within a LegalIRDocument
 *   LegalIRDocument       — canonical envelope for legal text + formal views
 *   RoundTripMetrics      — loss/similarity metrics shared by bridge adapters
 *   ProofGateResult       — prover health summary for a bridge evaluation
 *   GraphProjectionResult — Neo4j-compatible graph projection summary
 *   BridgeEvaluationReport — aggregated report from a bridge adapter run
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stableJson(data: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(sorted);
}

// ---------------------------------------------------------------------------
// LogicIRView
// ---------------------------------------------------------------------------

export interface LogicIRViewInit {
  name: string;
  payload?: Record<string, unknown>;
  format?: string;
  sourceComponent?: string;
  metadata?: Record<string, unknown>;
}

export class LogicIRView {
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly format: string;
  readonly sourceComponent: string;
  readonly metadata: Record<string, unknown>;

  constructor(init: LogicIRViewInit) {
    this.name = init.name;
    this.payload = init.payload ?? {};
    this.format = init.format ?? '';
    this.sourceComponent = init.sourceComponent ?? '';
    this.metadata = init.metadata ?? {};
  }

  toDict(): Record<string, unknown> {
    return {
      format: this.format,
      metadata: Object.fromEntries(Object.entries(this.metadata).sort()),
      name: this.name,
      payload: this.payload,
      source_component: this.sourceComponent,
    };
  }
}

// ---------------------------------------------------------------------------
// LegalIRDocument
// ---------------------------------------------------------------------------

export interface LegalIRDocumentInit {
  documentId: string;
  sourceText: string;
  normalizedText: string;
  source?: string;
  citation?: string;
  views?: Record<string, LogicIRView>;
  frameLogicTriples?: Array<Record<string, string>>;
  metadata?: Record<string, unknown>;
  version?: string;
}

export class LegalIRDocument {
  readonly documentId: string;
  readonly sourceText: string;
  readonly normalizedText: string;
  readonly source: string;
  readonly citation: string | undefined;
  readonly views: Record<string, LogicIRView>;
  readonly frameLogicTriples: Array<Record<string, string>>;
  readonly metadata: Record<string, unknown>;
  readonly version: string;

  constructor(init: LegalIRDocumentInit) {
    this.documentId = init.documentId;
    this.sourceText = init.sourceText;
    this.normalizedText = init.normalizedText;
    this.source = init.source ?? 'us_code';
    this.citation = init.citation;
    this.views = init.views ?? {};
    this.frameLogicTriples = init.frameLogicTriples ?? [];
    this.metadata = init.metadata ?? {};
    this.version = init.version ?? 'legal-ir-bridge-v1';
  }

  get hasFrameLogic(): boolean {
    return this.frameLogicTriples.length > 0;
  }

  toDict(): Record<string, unknown> {
    return {
      citation: this.citation ?? null,
      document_id: this.documentId,
      frame_logic_triples: this.frameLogicTriples,
      has_frame_logic: this.hasFrameLogic,
      metadata: Object.fromEntries(Object.entries(this.metadata).sort()),
      normalized_text: this.normalizedText,
      source: this.source,
      source_text: this.sourceText,
      version: this.version,
      views: Object.fromEntries(
        Object.entries(this.views)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, v.toDict()])
      ),
    };
  }

  toJson(): string {
    return stableJson(this.toDict() as Record<string, unknown>);
  }

  canonicalHash(): string {
    return createHash('sha256').update(this.toJson(), 'utf8').digest('hex');
  }
}

// ---------------------------------------------------------------------------
// RoundTripMetrics
// ---------------------------------------------------------------------------

export interface RoundTripMetricsInit {
  cosineSimilarity?: number;
  cosineLoss?: number;
  crossEntropyLoss?: number;
  reconstructionLoss?: number;
  textReconstructionLoss?: number;
  frameRankingLoss?: number;
  flogicSimilarityScore?: number;
  flogicSimilarityLoss?: number;
  ontologyViolationCount?: number;
  symbolicValidityPenalty?: number;
  extraLosses?: Record<string, number>;
}

function _floatLoss(losses: Record<string, unknown>, key: string): number {
  const v = losses[key];
  if (typeof v === 'number' && isFinite(v)) return v;
  return 0;
}

export class RoundTripMetrics {
  readonly cosineSimilarity: number;
  readonly cosineLoss: number;
  readonly crossEntropyLoss: number;
  readonly reconstructionLoss: number;
  readonly textReconstructionLoss: number;
  readonly frameRankingLoss: number;
  readonly flogicSimilarityScore: number;
  readonly flogicSimilarityLoss: number;
  readonly ontologyViolationCount: number;
  readonly symbolicValidityPenalty: number;
  readonly extraLosses: Record<string, number>;

  constructor(init: RoundTripMetricsInit = {}) {
    this.cosineSimilarity = init.cosineSimilarity ?? 0;
    this.cosineLoss = init.cosineLoss ?? 0;
    this.crossEntropyLoss = init.crossEntropyLoss ?? 0;
    this.reconstructionLoss = init.reconstructionLoss ?? 0;
    this.textReconstructionLoss = init.textReconstructionLoss ?? 0;
    this.frameRankingLoss = init.frameRankingLoss ?? 0;
    this.flogicSimilarityScore = init.flogicSimilarityScore ?? 0;
    this.flogicSimilarityLoss = init.flogicSimilarityLoss ?? 0;
    this.ontologyViolationCount = init.ontologyViolationCount ?? 0;
    this.symbolicValidityPenalty = init.symbolicValidityPenalty ?? 0;
    this.extraLosses = init.extraLosses ?? {};
  }

  static fromLossMapping(losses: Record<string, unknown>): RoundTripMetrics {
    const extra: Record<string, number> = {};
    const known = new Set([
      'cosine_similarity', 'cosine_loss', 'cross_entropy_loss', 'reconstruction_loss',
      'text_reconstruction_loss', 'frame_ranking_loss', 'flogic_similarity_score',
      'flogic_similarity_loss', 'ontology_violation_count', 'symbolic_validity_penalty',
    ]);
    for (const [k, v] of Object.entries(losses)) {
      if (!known.has(k) && typeof v === 'number') extra[k] = v;
    }
    return new RoundTripMetrics({
      cosineSimilarity: _floatLoss(losses, 'cosine_similarity'),
      cosineLoss: _floatLoss(losses, 'cosine_loss'),
      crossEntropyLoss: _floatLoss(losses, 'cross_entropy_loss'),
      reconstructionLoss: _floatLoss(losses, 'reconstruction_loss'),
      textReconstructionLoss: _floatLoss(losses, 'text_reconstruction_loss'),
      frameRankingLoss: _floatLoss(losses, 'frame_ranking_loss'),
      flogicSimilarityScore: _floatLoss(losses, 'flogic_similarity_score'),
      flogicSimilarityLoss: _floatLoss(losses, 'flogic_similarity_loss'),
      ontologyViolationCount: _floatLoss(losses, 'ontology_violation_count'),
      symbolicValidityPenalty: _floatLoss(losses, 'symbolic_validity_penalty'),
      extraLosses: extra,
    });
  }

  /** Sum of all loss terms (excluding similarity scores and extra bonuses). */
  totalLoss(): number {
    return (
      this.cosineLoss +
      this.crossEntropyLoss +
      this.reconstructionLoss +
      this.textReconstructionLoss +
      this.frameRankingLoss +
      this.flogicSimilarityLoss +
      this.ontologyViolationCount +
      this.symbolicValidityPenalty +
      Object.values(this.extraLosses).reduce((s, v) => s + v, 0)
    );
  }

  toDict(): Record<string, unknown> {
    return {
      cosine_similarity: this.cosineSimilarity,
      cosine_loss: this.cosineLoss,
      cross_entropy_loss: this.crossEntropyLoss,
      extra_losses: this.extraLosses,
      flogic_similarity_loss: this.flogicSimilarityLoss,
      flogic_similarity_score: this.flogicSimilarityScore,
      frame_ranking_loss: this.frameRankingLoss,
      ontology_violation_count: this.ontologyViolationCount,
      reconstruction_loss: this.reconstructionLoss,
      symbolic_validity_penalty: this.symbolicValidityPenalty,
      text_reconstruction_loss: this.textReconstructionLoss,
      total_loss: this.totalLoss(),
    };
  }
}

// ---------------------------------------------------------------------------
// ProofGateResult
// ---------------------------------------------------------------------------

export interface ProofGateResultInit {
  attemptedCount?: number;
  validCount?: number;
  unavailableCount?: number;
  errorCount?: number;
  failedCount?: number;
  verifiedBy?: string[];
  details?: Array<Record<string, unknown>>;
}

export class ProofGateResult {
  readonly attemptedCount: number;
  readonly validCount: number;
  readonly unavailableCount: number;
  readonly errorCount: number;
  readonly failedCount: number;
  readonly verifiedBy: string[];
  readonly details: Array<Record<string, unknown>>;

  constructor(init: ProofGateResultInit = {}) {
    this.attemptedCount = init.attemptedCount ?? 0;
    this.validCount = init.validCount ?? 0;
    this.unavailableCount = init.unavailableCount ?? 0;
    this.errorCount = init.errorCount ?? 0;
    this.failedCount = init.failedCount ?? 0;
    this.verifiedBy = init.verifiedBy ?? [];
    this.details = init.details ?? [];
  }

  get compiles(): boolean {
    return this.attemptedCount > 0 && this.validCount === this.attemptedCount;
  }

  get failureRatio(): number {
    if (this.attemptedCount <= 0) return 1;
    return Math.min(1, (this.unavailableCount + this.errorCount + this.failedCount) / this.attemptedCount);
  }

  static disabled(reason = 'proof gate disabled'): ProofGateResult {
    return new ProofGateResult({
      attemptedCount: 1, validCount: 1,
      verifiedBy: ['proof-gate:disabled'],
      details: [{ reason, skipped: true }],
    });
  }

  toDict(): Record<string, unknown> {
    return {
      attempted_count: this.attemptedCount,
      compiles: this.compiles,
      details: this.details,
      error_count: this.errorCount,
      failed_count: this.failedCount,
      failure_ratio: this.failureRatio,
      unavailable_count: this.unavailableCount,
      valid_count: this.validCount,
      verified_by: this.verifiedBy,
    };
  }
}

// ---------------------------------------------------------------------------
// GraphProjectionResult
// ---------------------------------------------------------------------------

export interface GraphProjectionResultInit {
  graphId?: string;
  neo4jCompatible?: boolean;
  nodeCount?: number;
  relationshipCount?: number;
  nodeLabels?: string[];
  graphData?: Record<string, unknown>;
}

export class GraphProjectionResult {
  readonly graphId: string;
  readonly neo4jCompatible: boolean;
  readonly nodeCount: number;
  readonly relationshipCount: number;
  readonly nodeLabels: string[];
  readonly graphData: Record<string, unknown>;

  constructor(init: GraphProjectionResultInit = {}) {
    this.graphId = init.graphId ?? '';
    this.neo4jCompatible = init.neo4jCompatible ?? false;
    this.nodeCount = init.nodeCount ?? 0;
    this.relationshipCount = init.relationshipCount ?? 0;
    this.nodeLabels = init.nodeLabels ?? [];
    this.graphData = init.graphData ?? {};
  }

  toDict(): Record<string, unknown> {
    return {
      graph_id: this.graphId,
      graph_data: this.graphData,
      neo4j_compatible: this.neo4jCompatible,
      node_count: this.nodeCount,
      node_labels: this.nodeLabels,
      relationship_count: this.relationshipCount,
    };
  }
}

// ---------------------------------------------------------------------------
// BridgeEvaluationReport
// ---------------------------------------------------------------------------

export interface BridgeEvaluationReportInit {
  bridgeName: string;
  documentId: string;
  metrics?: RoundTripMetrics;
  proofGate?: ProofGateResult;
  graphProjection?: GraphProjectionResult;
  viewNames?: string[];
  durationMs?: number;
  error?: string;
}

export class BridgeEvaluationReport {
  readonly bridgeName: string;
  readonly documentId: string;
  readonly metrics: RoundTripMetrics;
  readonly proofGate: ProofGateResult;
  readonly graphProjection: GraphProjectionResult;
  readonly viewNames: string[];
  readonly durationMs: number;
  readonly error: string | undefined;

  constructor(init: BridgeEvaluationReportInit) {
    this.bridgeName = init.bridgeName;
    this.documentId = init.documentId;
    this.metrics = init.metrics ?? new RoundTripMetrics();
    this.proofGate = init.proofGate ?? new ProofGateResult();
    this.graphProjection = init.graphProjection ?? new GraphProjectionResult();
    this.viewNames = init.viewNames ?? [];
    this.durationMs = init.durationMs ?? 0;
    this.error = init.error;
  }

  get success(): boolean {
    return !this.error;
  }

  toDict(): Record<string, unknown> {
    return {
      bridge_name: this.bridgeName,
      document_id: this.documentId,
      duration_ms: this.durationMs,
      error: this.error ?? null,
      graph_projection: this.graphProjection.toDict(),
      metrics: this.metrics.toDict(),
      proof_gate: this.proofGate.toDict(),
      success: this.success,
      view_names: this.viewNames,
    };
  }
}

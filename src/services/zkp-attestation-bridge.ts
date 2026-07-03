/**
 * zkp-attestation-bridge.ts
 *
 * Bridge adapter that converts formal proof obligations to ZKP attestation
 * views and graph records using a simulated backend.
 *
 * TypeScript port of ipfs_datasets_py/logic/bridge/zkp_attestation.py
 *
 * Provides:
 *   ZkpAttestationRecord    — single per-formula ZKP proof attestation
 *   ZkpAttestationBridgeAdapter — encode(text) → {doc, context}
 */

import { createHash } from 'node:crypto';
import {
  LegalIRDocument, LegalIRDocumentInit,
  LogicIRView,
  RoundTripMetrics,
  ProofGateResult,
  GraphProjectionResult,
  BridgeEvaluationReport,
} from './bridge-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function documentId(prefix: string, text: string): string {
  const hash = createHash('sha256').update(text.slice(0, 512), 'utf8').digest('hex').slice(0, 16);
  return `${prefix}:${hash}`;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function proofHash(formula: string): string {
  return createHash('sha256').update(formula, 'utf8').digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// ZkpAttestationRecord
// ---------------------------------------------------------------------------

export interface ZkpAttestationRecord {
  /** The formula that was attested. */
  formula: string;
  /** Simulated proof hash (SHA-256 prefix). */
  proofHash: string;
  /** Whether the simulated verification passed. */
  verified: boolean;
  /** Backend used (always 'simulated' for this adapter). */
  backend: string;
  /** Simulated public inputs for the proof circuit. */
  publicInputs: Record<string, unknown>;
  /** Predicates extracted from the formula. */
  predicates: string[];
  /** Source identifier for the formula. */
  sourceId: string;
}

// ---------------------------------------------------------------------------
// Internal: produce attestation records from formula strings
// ---------------------------------------------------------------------------

function makeAttestationRecord(
  formula: string,
  sourceId: string,
  predicates: string[],
  proverBackend: string,
): ZkpAttestationRecord {
  const hash = proofHash(formula);
  return {
    formula,
    proofHash: hash,
    verified: true,
    backend: proverBackend,
    publicInputs: {
      formula_hash: hash,
      source_id: sourceId,
      predicate_count: predicates.length,
    },
    predicates,
    sourceId,
  };
}

// ---------------------------------------------------------------------------
// ZkpAttestationBridgeAdapter
// ---------------------------------------------------------------------------

export interface ZkpAttestationBridgeAdapterOpts {
  /** Backend to simulate (default: 'simulated'). */
  backend?: string;
  enableCaching?: boolean;
  name?: string;
  targetComponent?: string;
}

export interface EncodeOpts {
  documentId?: string;
  citation?: string;
  source?: string;
  /** Optional source text embedding (unused in simulated mode). */
  sourceEmbedding?: number[];
}

export interface ZkpEncodeContext {
  attestations: ZkpAttestationRecord[];
  formula_records: Array<{ formula: string; predicates: string[]; source_id: string }>;
  proof_gate: ReturnType<ProofGateResult['toDict']>;
  graph_data: Record<string, unknown>;
  metrics: ReturnType<RoundTripMetrics['toDict']>;
  bridge_name: string;
  document_id: string;
}

export class ZkpAttestationBridgeAdapter {
  readonly name: string;
  readonly targetComponent: string;
  private readonly backend: string;

  constructor(opts: ZkpAttestationBridgeAdapterOpts = {}) {
    this.name = opts.name ?? 'zkp_attestation';
    this.targetComponent = opts.targetComponent ?? 'zkp.circuits';
    this.backend = opts.backend ?? 'simulated';
  }

  /**
   * Encode `text` into a `LegalIRDocument` with ZKP attestation views.
   *
   * Produces the following views:
   *   - `zkp_attestations`   — per-formula attestation records
   *   - `zkp_public_inputs`  — aggregated public inputs
   *   - `frame_logic`        — F-logic triples for graph analysis
   *   - `neo4j_graph_data`   — graph-ready node/rel structure
   *
   * @param text   Source legal / formal text to encode.
   * @param opts   Optional metadata (documentId, citation, source).
   */
  encode(text: string, opts: EncodeOpts = {}): { doc: LegalIRDocument; context: ZkpEncodeContext } {
    const normalizedText = normalizeText(text);
    const resolvedDocId = opts.documentId ?? documentId('zkp', text);
    const sentences = normalizedText
      ? normalizedText.split(/[.;]/).map(s => s.trim()).filter(Boolean)
      : [];

    // Produce formula records (one per sentence, or a fallback)
    const formulaRecords: Array<{ formula: string; predicates: string[]; source_id: string }> =
      sentences.length > 0
        ? sentences.map((s, i) => ({
            formula: s,
            predicates: s
              .split(/\s+/)
              .filter(w => /^[A-Z][a-zA-Z]+$/.test(w))
              .slice(0, 5),
            source_id: `${resolvedDocId}:s${i}`,
          }))
        : normalizedText
          ? [{ formula: normalizedText, predicates: [], source_id: `${resolvedDocId}:fallback:0` }]
          : [];

    // Generate attestation records
    const attestations: ZkpAttestationRecord[] = formulaRecords.map(fr =>
      makeAttestationRecord(fr.formula, fr.source_id, fr.predicates, this.backend)
    );

    // Build frame-logic triples
    const triples: Array<Record<string, string>> = attestations.map(a => ({
      subject: a.sourceId,
      predicate: 'hasProofHash',
      object: a.proofHash,
    }));
    triples.push(
      ...attestations.map(a => ({
        subject: resolvedDocId,
        predicate: 'hasAttestation',
        object: a.sourceId,
      }))
    );

    // Build graph data
    const nodes = [
      { id: resolvedDocId, label: 'Document', properties: { text: normalizedText.slice(0, 100) } },
      ...attestations.map(a => ({
        id: a.sourceId,
        label: 'Attestation',
        properties: { formula: a.formula.slice(0, 80), proof_hash: a.proofHash, verified: a.verified },
      })),
    ];
    const relationships = attestations.map(a => ({
      source: resolvedDocId,
      target: a.sourceId,
      type: 'HAS_ATTESTATION',
    }));
    const graphData = { nodes, relationships };

    // Proof gate
    const proofGate = new ProofGateResult({
      attemptedCount: attestations.length,
      validCount: attestations.filter(a => a.verified).length,
      verifiedBy: attestations.length > 0 ? [`${this.backend}-prover`] : [],
      details: attestations.map(a => ({ source_id: a.sourceId, verified: a.verified, backend: a.backend })),
    });

    // Metrics (simulated — all losses zero, similarity 1.0)
    const metrics = new RoundTripMetrics({ cosineSimilarity: 1.0 });

    // Aggregate public inputs
    const publicInputs = {
      document_id: resolvedDocId,
      attestation_count: attestations.length,
      verified_count: attestations.filter(a => a.verified).length,
      backend: this.backend,
      formula_hashes: attestations.map(a => a.proofHash),
    };

    // Build views
    const views: Record<string, LogicIRView> = {
      zkp_attestations: new LogicIRView({
        name: 'zkp_attestations',
        payload: { attestations: attestations.map(a => ({
          formula: a.formula,
          proof_hash: a.proofHash,
          verified: a.verified,
          backend: a.backend,
          public_inputs: a.publicInputs,
          predicates: a.predicates,
          source_id: a.sourceId,
        })) },
        format: 'zkp_attestation_list',
        sourceComponent: this.targetComponent,
      }),
      zkp_public_inputs: new LogicIRView({
        name: 'zkp_public_inputs',
        payload: publicInputs,
        format: 'zkp_public_inputs',
        sourceComponent: this.targetComponent,
      }),
      frame_logic: new LogicIRView({
        name: 'frame_logic',
        payload: { triples },
        format: 'frame_logic_triples',
        sourceComponent: this.targetComponent,
      }),
      neo4j_graph_data: new LogicIRView({
        name: 'neo4j_graph_data',
        payload: graphData,
        format: 'neo4j_graph',
        sourceComponent: this.targetComponent,
      }),
    };

    const docInit: LegalIRDocumentInit = {
      documentId: resolvedDocId,
      sourceText: text,
      normalizedText,
      source: opts.source ?? 'us_code',
      citation: opts.citation,
      views,
      frameLogicTriples: triples,
      metadata: {
        bridge: this.name,
        backend: this.backend,
        attestation_count: attestations.length,
      },
    };
    const doc = new LegalIRDocument(docInit);

    const context: ZkpEncodeContext = {
      attestations,
      formula_records: formulaRecords,
      proof_gate: proofGate.toDict(),
      graph_data: graphData,
      metrics: metrics.toDict(),
      bridge_name: this.name,
      document_id: resolvedDocId,
    };

    return { doc, context };
  }

  /** Build a BridgeEvaluationReport for an encode() call. */
  evaluate(text: string, opts: EncodeOpts = {}): BridgeEvaluationReport {
    const t0 = Date.now();
    const { doc, context } = this.encode(text, opts);
    return new BridgeEvaluationReport({
      bridgeName: this.name,
      documentId: doc.documentId,
      metrics: RoundTripMetrics.fromLossMapping(context.metrics as Record<string, unknown>),
      proofGate: ProofGateResult.disabled(),
      graphProjection: new GraphProjectionResult({
        graphId: doc.documentId,
        neo4jCompatible: true,
        nodeCount: (context.graph_data.nodes as unknown[]).length,
        relationshipCount: (context.graph_data.relationships as unknown[]).length,
      }),
      viewNames: Object.keys(doc.views),
      durationMs: Date.now() - t0,
    });
  }
}

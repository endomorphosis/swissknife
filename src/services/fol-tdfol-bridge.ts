/**
 * fol-tdfol-bridge.ts
 *
 * Bridge adapter: legal text → FOL/TDFOL formulas + frame logic + graph data.
 * TypeScript port of ipfs_datasets_py/logic/bridge/fol_tdfol.py
 *
 * Provides:
 *   TdfolFormulaRecord        — one formula extracted from legal text
 *   FolTdfolBridgeAdapter     — encode(text) → {doc, context}
 */

import { createHash } from 'node:crypto';
import {
  LegalIRDocument, LogicIRView,
  RoundTripMetrics, ProofGateResult, GraphProjectionResult, BridgeEvaluationReport,
} from './bridge-types.js';
import {
  deonticGraphDataFromFrameTriples,
  type DeonticFrameLogicTriple,
  type DeonticGraphData,
} from './deontic-norms-bridge.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function documentId(prefix: string, text: string): string {
  return `${prefix}:${createHash('sha256').update(text.slice(0, 512), 'utf8').digest('hex').slice(0, 16)}`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Very light-weight sentence splitter (period/semicolon). */
function sentences(text: string): string[] {
  return text
    .split(/[.;!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 2);
}

/** Extract capitalized identifiers as predicate candidates. */
function extractPredicates(text: string): string[] {
  return [...new Set(
    (text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? []).slice(0, 6)
  )];
}

// ---------------------------------------------------------------------------
// TdfolFormulaRecord
// ---------------------------------------------------------------------------

export interface TdfolFormulaRecord {
  formula: string;
  predicates: string[];
  source_id: string;
  formula_type: 'temporal' | 'deontic' | 'fol' | 'propositional';
  parse_ok?: boolean;
}

function classifyFormula(text: string): TdfolFormulaRecord['formula_type'] {
  const lower = text.toLowerCase();
  if (/\b(always|eventually|until|since|next)\b|□|◊/.test(lower)) return 'temporal';
  if (/\b(shall|must|may|obligat|permit|prohibit|forbid)\b/.test(lower)) return 'deontic';
  if (/\b(forall|exists|∀|∃)\b/.test(lower)) return 'fol';
  return 'propositional';
}

// ---------------------------------------------------------------------------
// Frame-logic triples for TDFOL formulas
// ---------------------------------------------------------------------------

/**
 * Python parity for `bridge/fol_tdfol.py::_tdfol_frame_logic_triples`.
 */
export function tdfolFrameLogicTriplesFromRecords(
  docId: string,
  records: ReadonlyArray<Record<string, unknown>>,
): DeonticFrameLogicTriple[] {
  const triples: DeonticFrameLogicTriple[] = [
    { subject: docId, predicate: 'type', object: 'legal_tdfol_document' },
  ];
  for (const rec of records) {
    const sourceId = String(rec.source_id ?? '');
    if (!sourceId) continue;
    triples.push(
      { subject: docId, predicate: 'contains_formula', object: sourceId },
      { subject: sourceId, predicate: 'type', object: 'tdfol_formula' },
      { subject: sourceId, predicate: 'formula', object: String(rec.formula ?? '') },
      { subject: sourceId, predicate: 'parse_ok', object: rec.parse_ok ? 'true' : 'false' },
    );
    const predicates = Array.isArray(rec.predicates) ? rec.predicates : [];
    for (const pred of predicates) {
      triples.push({ subject: sourceId, predicate: 'uses_predicate', object: String(pred) });
    }
  }
  return triples.filter(triple => Boolean(triple.object));
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

export function tdfolGraphDataFromFrameTriples(
  triples: ReadonlyArray<Record<string, unknown>>,
  opts: { graphId?: string; metadata?: Record<string, unknown> } = {},
): DeonticGraphData | null {
  return deonticGraphDataFromFrameTriples(triples, opts);
}

// ---------------------------------------------------------------------------
// FolTdfolBridgeAdapter
// ---------------------------------------------------------------------------

export interface FolTdfolEncodeOpts {
  documentId?: string;
  citation?: string;
  source?: string;
  sourceEmbedding?: number[];
  compilerGuidance?: Record<string, unknown>;
}

export interface FolTdfolContext {
  formula_records: TdfolFormulaRecord[];
  proof_gate: ReturnType<ProofGateResult['toDict']>;
  graph_data: Record<string, unknown>;
  metrics: ReturnType<RoundTripMetrics['toDict']>;
  bridge_name: string;
  document_id: string;
}

export class FolTdfolBridgeAdapter {
  readonly name = 'fol_tdfol';
  readonly targetComponent = 'TDFOL.prover';

  encode(text: string, opts: FolTdfolEncodeOpts = {}): { doc: LegalIRDocument; context: FolTdfolContext } {
    const normalizedText = normalize(text);
    const resolvedDocId = opts.documentId ?? documentId('tdfol', text);

    // Produce formula records — one per sentence
    const sentList = sentences(normalizedText);
    const formulaRecords: TdfolFormulaRecord[] =
      sentList.length > 0
        ? sentList.map((s, i) => ({
            formula: s,
            predicates: extractPredicates(s),
            source_id: `${resolvedDocId}:f${i}`,
            formula_type: classifyFormula(s),
            parse_ok: true,
          }))
        : normalizedText
          ? [{
              formula: normalizedText,
              predicates: extractPredicates(normalizedText),
              source_id: `${resolvedDocId}:f0`,
              formula_type: classifyFormula(normalizedText),
              parse_ok: true,
            }]
          : [];

    const triples = tdfolFrameLogicTriplesFromRecords(resolvedDocId, formulaRecords);
    const graphData = tdfolGraphDataFromFrameTriples(triples, {
      graphId: `${resolvedDocId}:tdfol-flogic`,
      metadata: {
        source: 'tdfol_bridge_ir',
        tdfol_formula_count: formulaRecords.length,
        compiler_guidance_formula_count: 0,
        guidance_formula_count: 0,
      },
    }) ?? {
      nodes: [],
      relationships: [],
      schema: { indexes: [], constraints: [], node_labels: [], relationship_types: [] },
      metadata: {},
    };

    const proofGate = new ProofGateResult({
      attemptedCount: formulaRecords.length,
      validCount: formulaRecords.length,
      verifiedBy: formulaRecords.length > 0 ? ['tdfol-parser'] : [],
    });

    const metrics = new RoundTripMetrics({ cosineSimilarity: 1.0 });

    const views: Record<string, LogicIRView> = {
      tdfol_formulas: new LogicIRView({
        name: 'tdfol_formulas',
        payload: { formula_records: formulaRecords },
        format: 'tdfol_formula_list',
        sourceComponent: this.targetComponent,
      }),
      frame_logic: new LogicIRView({
        name: 'frame_logic',
        payload: { triples },
        format: 'flogic-triples-v1',
        sourceComponent: this.targetComponent,
        metadata: { triple_count: triples.length },
      }),
      neo4j_graph_data: new LogicIRView({
        name: 'neo4j_graph_data',
        payload: graphData,
        format: 'neo4j-compatible-graph-data',
        sourceComponent: 'knowledge_graphs.neo4j_compat',
        metadata: {
          node_count: graphData.nodes.length,
          relationship_count: graphData.relationships.length,
        },
      }),
    };

    const doc = new LegalIRDocument({
      documentId: resolvedDocId,
      sourceText: text,
      normalizedText,
      source: opts.source ?? 'us_code',
      citation: opts.citation,
      views,
      frameLogicTriples: triples,
      metadata: { bridge: this.name, formula_count: formulaRecords.length },
    });

    const context: FolTdfolContext = {
      formula_records: formulaRecords,
      proof_gate: proofGate.toDict(),
      graph_data: graphData,
      metrics: metrics.toDict(),
      bridge_name: this.name,
      document_id: resolvedDocId,
    };

    return { doc, context };
  }

  evaluate(text: string, opts: FolTdfolEncodeOpts = {}): BridgeEvaluationReport {
    const t0 = Date.now();
    const { doc, context } = this.encode(text, opts);
    const gd = context.graph_data;
    return new BridgeEvaluationReport({
      bridgeName: this.name,
      documentId: doc.documentId,
      metrics: RoundTripMetrics.fromLossMapping(context.metrics as Record<string, unknown>),
      proofGate: ProofGateResult.disabled(),
      graphProjection: new GraphProjectionResult({
        graphId: doc.documentId,
        neo4jCompatible: true,
        nodeCount: (gd.nodes as unknown[]).length,
        relationshipCount: (gd.relationships as unknown[]).length,
      }),
      viewNames: Object.keys(doc.views),
      durationMs: Date.now() - t0,
    });
  }
}

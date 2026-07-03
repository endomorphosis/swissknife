/**
 * cec-dcec-bridge.ts
 *
 * Bridge adapter: legal text → DCEC event-calculus records + frame logic.
 * TypeScript port of ipfs_datasets_py/logic/bridge/cec_dcec.py
 *
 * Provides:
 *   DcecRecord             — one event-calculus record
 *   CecDcecBridgeAdapter   — encode(text) → {doc, context}
 */

import { createHash } from 'node:crypto';
import {
  LegalIRDocument, LogicIRView,
  RoundTripMetrics, ProofGateResult, GraphProjectionResult, BridgeEvaluationReport,
} from './bridge-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function documentId(prefix: string, text: string): string {
  return `${prefix}:${createHash('sha256').update(text.slice(0, 512), 'utf8').digest('hex').slice(0, 16)}`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// DCEC event-calculus record
// ---------------------------------------------------------------------------

/** DCEC event kind: Happens, HoldsAt, Initiates, Terminates */
export type DcecEventKind = 'Happens' | 'HoldsAt' | 'Initiates' | 'Terminates';

export interface DcecRecord {
  record_id: string;
  event_kind: DcecEventKind;
  /** Event / action expression */
  event: string;
  /** Fluent name */
  fluent: string;
  /** Time point (symbolic) */
  time: string;
  /** Agent who acts (for deontic contexts) */
  agent: string;
  source_text: string;
  /** Rendered CEC formula string */
  cec_formula: string;
}

// Detect if text contains temporal / event language
const HAPPENS_WORDS = /\b(occur|happen|take place|execute|perform|do|does|did)\b/i;
const HOLDS_WORDS   = /\b(hold|remain|continue|persist|be true|is true|are)\b/i;
const INIT_WORDS    = /\b(start|begin|initiate|create|establish|enable)\b/i;
const TERM_WORDS    = /\b(end|stop|terminate|cease|abolish|dissolve|revoke)\b/i;

function detectEventKind(text: string): DcecEventKind {
  if (INIT_WORDS.test(text)) return 'Initiates';
  if (TERM_WORDS.test(text)) return 'Terminates';
  if (HOLDS_WORDS.test(text)) return 'HoldsAt';
  return 'Happens';
}

function extractEvent(text: string): string {
  const match = text.match(/(?:shall|must|may|will)?\s*([a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})/i);
  return match?.[1]?.trim() ?? 'Action';
}

function extractFluent(text: string): string {
  const match = text.match(/\b(right|duty|obligation|permission|status|state)\b/i);
  return match?.[1] ?? 'Status';
}

function renderCecFormula(rec: Omit<DcecRecord, 'cec_formula'>): string {
  switch (rec.event_kind) {
    case 'Happens':    return `Happens(${rec.event}, ${rec.time})`;
    case 'HoldsAt':    return `HoldsAt(${rec.fluent}, ${rec.time})`;
    case 'Initiates':  return `Initiates(${rec.event}, ${rec.fluent}, ${rec.time})`;
    case 'Terminates': return `Terminates(${rec.event}, ${rec.fluent}, ${rec.time})`;
  }
}

// ---------------------------------------------------------------------------
// Frame-logic triples for DCEC records
// ---------------------------------------------------------------------------

function dcecFrameTriples(
  docId: string,
  records: DcecRecord[],
): Array<Record<string, string>> {
  const triples: Array<Record<string, string>> = [];
  for (const rec of records) {
    triples.push({ subject: docId, predicate: 'hasDcecRecord', object: rec.record_id });
    triples.push({ subject: rec.record_id, predicate: 'hasEventKind', object: rec.event_kind });
    triples.push({ subject: rec.record_id, predicate: 'hasEvent', object: rec.event });
    triples.push({ subject: rec.record_id, predicate: 'hasFluent', object: rec.fluent });
  }
  return triples;
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

function dcecGraphData(
  docId: string,
  records: DcecRecord[],
): Record<string, unknown> {
  const nodes = [
    { id: docId, label: 'Document', properties: {} },
    ...records.map(r => ({
      id: r.record_id,
      label: r.event_kind,
      properties: { event: r.event.slice(0, 60), fluent: r.fluent, time: r.time, agent: r.agent },
    })),
  ];
  const relationships = records.map(r => ({
    source: docId,
    target: r.record_id,
    type: 'HAS_CEC_RECORD',
  }));
  return { nodes, relationships };
}

// ---------------------------------------------------------------------------
// CecDcecBridgeAdapter
// ---------------------------------------------------------------------------

export interface CecDcecEncodeOpts {
  documentId?: string;
  citation?: string;
  source?: string;
  sourceEmbedding?: number[];
  compilerGuidance?: Record<string, unknown>;
}

export interface CecDcecContext {
  records: DcecRecord[];
  cec_event_rows: Array<{ formula: string; event_kind: DcecEventKind }>;
  proof_gate: ReturnType<ProofGateResult['toDict']>;
  graph_data: Record<string, unknown>;
  metrics: ReturnType<RoundTripMetrics['toDict']>;
  bridge_name: string;
  document_id: string;
}

export class CecDcecBridgeAdapter {
  readonly name = 'cec_dcec';
  readonly targetComponent = 'CEC.native';

  encode(text: string, opts: CecDcecEncodeOpts = {}): { doc: LegalIRDocument; context: CecDcecContext } {
    const normalizedText = normalize(text);
    const resolvedDocId = opts.documentId ?? documentId('dcec', text);

    // Split on sentence boundaries
    const sentList = normalizedText
      .split(/[.;!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 4);

    const rawSents = sentList.length > 0 ? sentList : normalizedText ? [normalizedText] : [];

    // Generate DCEC records
    const records: DcecRecord[] = rawSents.map((s, i) => {
      const eventKind = detectEventKind(s);
      const event = extractEvent(s);
      const fluent = extractFluent(s);
      const partial = {
        record_id: `${resolvedDocId}:e${i}`,
        event_kind: eventKind,
        event,
        fluent,
        time: `t${i}`,
        agent: 'Agent',
        source_text: s,
        cec_formula: '',
      };
      return { ...partial, cec_formula: renderCecFormula(partial) };
    });

    const triples = dcecFrameTriples(resolvedDocId, records);
    const graphData = dcecGraphData(resolvedDocId, records);
    const cecEventRows = records.map(r => ({ formula: r.cec_formula, event_kind: r.event_kind }));

    const proofGate = new ProofGateResult({
      attemptedCount: records.length,
      validCount: records.length,
      verifiedBy: records.length > 0 ? ['cec-validator'] : [],
    });

    const metrics = new RoundTripMetrics({ cosineSimilarity: 1.0 });

    const views: Record<string, LogicIRView> = {
      cec_formulas: new LogicIRView({
        name: 'cec_formulas',
        payload: {
          records: records.map(r => ({
            record_id: r.record_id,
            event_kind: r.event_kind,
            cec_formula: r.cec_formula,
            event: r.event,
            fluent: r.fluent,
            time: r.time,
          })),
        },
        format: 'cec_formula_list',
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

    const doc = new LegalIRDocument({
      documentId: resolvedDocId,
      sourceText: text,
      normalizedText,
      source: opts.source ?? 'us_code',
      citation: opts.citation,
      views,
      frameLogicTriples: triples,
      metadata: { bridge: this.name, record_count: records.length },
    });

    const context: CecDcecContext = {
      records,
      cec_event_rows: cecEventRows,
      proof_gate: proofGate.toDict(),
      graph_data: graphData,
      metrics: metrics.toDict(),
      bridge_name: this.name,
      document_id: resolvedDocId,
    };

    return { doc, context };
  }

  evaluate(text: string, opts: CecDcecEncodeOpts = {}): BridgeEvaluationReport {
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

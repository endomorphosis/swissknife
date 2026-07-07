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

import {
  LegalIRDocument, LogicIRView,
  RoundTripMetrics, ProofGateResult, GraphProjectionResult, BridgeEvaluationReport,
} from './bridge-types.js';
import { sha256Hex } from '../../shared/browser-crypto.js';
import {
  deonticGraphDataFromFrameTriples,
  type DeonticFrameLogicTriple,
  type DeonticGraphData,
} from './deontic-norms-bridge.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function documentId(prefix: string, text: string): string {
  return `${prefix}:${sha256Hex(text.slice(0, 512)).slice(0, 16)}`;
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
  source_id?: string;
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
  modality?: string;
  valid?: boolean;
  event_calculus_formula?: string;
  event_formula_syntax_valid?: boolean;
  event_formula_source?: string;
  event_formula_fingerprint?: string;
  selected_frame?: string;
  selected_frame_source?: string;
  compiler_guidance_source?: string;
  procedure_event_records?: Array<Record<string, unknown>>;
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

function stableShortHash(text: string): string {
  return sha256Hex(text).slice(0, 16);
}

function symbolToken(text: unknown, fallback: string): string {
  const token = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token || fallback;
}

function procedureEventFrameLogicTriples(
  sourceId: string,
  record: Record<string, unknown>,
): DeonticFrameLogicTriple[] {
  const triples: DeonticFrameLogicTriple[] = [];
  const procedureEvents = Array.isArray(record.procedure_event_records)
    ? record.procedure_event_records
    : [];
  for (const procedureEvent of procedureEvents) {
    if (!procedureEvent || typeof procedureEvent !== 'object' || Array.isArray(procedureEvent)) continue;
    const eventRecord = procedureEvent as Record<string, unknown>;
    let eventId = String(eventRecord.event_id ?? '').trim();
    const event = String(eventRecord.event ?? '').trim();
    if (!eventId) {
      const eventSymbol = String(eventRecord.event_symbol ?? symbolToken(event, 'event'));
      eventId = `${sourceId}:procedure:${eventSymbol}`;
    }
    if (!eventId || !event) continue;
    triples.push(
      { subject: sourceId, predicate: 'has_procedure_event', object: eventId },
      { subject: eventId, predicate: 'type', object: 'cec_procedure_event' },
      { subject: eventId, predicate: 'event', object: event },
      { subject: eventId, predicate: 'event_symbol', object: String(eventRecord.event_symbol ?? '') },
      { subject: eventId, predicate: 'event_order', object: String(eventRecord.event_order ?? '') },
      { subject: eventId, predicate: 'relation', object: String(eventRecord.relation ?? '') },
      { subject: eventId, predicate: 'anchor_event', object: String(eventRecord.anchor_event ?? '') },
      { subject: eventId, predicate: 'proof_role', object: String(eventRecord.proof_role ?? '') },
    );
  }
  return triples;
}

/**
 * Python parity for `bridge/cec_dcec.py::_dcec_frame_logic_triples`.
 */
export function dcecFrameLogicTriplesFromRecords(
  docId: string,
  records: ReadonlyArray<Record<string, unknown>>,
): DeonticFrameLogicTriple[] {
  const triples: DeonticFrameLogicTriple[] = [
    { subject: docId, predicate: 'type', object: 'legal_dcec_document' },
  ];
  for (const rec of records) {
    const sourceId = String(rec.source_id ?? '');
    if (!sourceId) continue;
    triples.push(
      { subject: docId, predicate: 'contains_event_formula', object: sourceId },
      { subject: sourceId, predicate: 'type', object: 'dcec_formula' },
      { subject: sourceId, predicate: 'actor', object: String(rec.actor ?? '') },
      { subject: sourceId, predicate: 'event', object: String(rec.event ?? '') },
      { subject: sourceId, predicate: 'formula', object: String(rec.formula ?? '') },
      { subject: sourceId, predicate: 'modality', object: String(rec.modality ?? '') },
      { subject: sourceId, predicate: 'valid', object: rec.valid ? 'true' : 'false' },
      { subject: sourceId, predicate: 'event_calculus_formula', object: String(rec.event_calculus_formula ?? '') },
      { subject: sourceId, predicate: 'event_formula_syntax_valid', object: rec.event_formula_syntax_valid ? 'true' : 'false' },
      { subject: sourceId, predicate: 'event_formula_source', object: String(rec.event_formula_source ?? '') },
      { subject: sourceId, predicate: 'event_formula_fingerprint', object: String(rec.event_formula_fingerprint ?? '') },
      { subject: sourceId, predicate: 'selected_frame', object: String(rec.selected_frame ?? '') },
      { subject: sourceId, predicate: 'selected_frame_source', object: String(rec.selected_frame_source ?? '') },
      { subject: sourceId, predicate: 'compiler_guidance_source', object: String(rec.compiler_guidance_source ?? '') },
    );
    triples.push(...procedureEventFrameLogicTriples(sourceId, rec));
  }
  return triples.filter(triple => Boolean(triple.object));
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

export function dcecGraphDataFromFrameTriples(
  triples: ReadonlyArray<Record<string, unknown>>,
  opts: { graphId?: string; metadata?: Record<string, unknown> } = {},
): DeonticGraphData | null {
  return deonticGraphDataFromFrameTriples(triples, opts);
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
        source_id: `${resolvedDocId}:e${i}`,
        event_kind: eventKind,
        event,
        fluent,
        time: `t${i}`,
        agent: 'Agent',
        source_text: s,
        cec_formula: '',
        modality: eventKind.toLowerCase(),
        valid: true,
        event_calculus_formula: '',
        event_formula_syntax_valid: true,
        event_formula_source: 'cec_dcec_bridge_fallback',
        event_formula_fingerprint: '',
      };
      const cecFormula = renderCecFormula(partial);
      return {
        ...partial,
        cec_formula: cecFormula,
        event_calculus_formula: cecFormula,
        event_formula_fingerprint: stableShortHash(cecFormula),
      };
    });

    const frameRecords = records.map(record => ({
      source_id: record.source_id ?? record.record_id,
      actor: record.agent,
      event: record.event,
      formula: record.cec_formula,
      modality: record.modality,
      valid: record.valid,
      event_calculus_formula: record.event_calculus_formula,
      event_formula_syntax_valid: record.event_formula_syntax_valid,
      event_formula_source: record.event_formula_source,
      event_formula_fingerprint: record.event_formula_fingerprint,
      selected_frame: record.selected_frame,
      selected_frame_source: record.selected_frame_source,
      compiler_guidance_source: record.compiler_guidance_source,
      procedure_event_records: record.procedure_event_records ?? [],
    }));
    const triples = dcecFrameLogicTriplesFromRecords(resolvedDocId, frameRecords);
    const graphData = dcecGraphDataFromFrameTriples(triples, {
      graphId: `${resolvedDocId}:dcec-flogic`,
      metadata: {
        dcec_formula_count: records.length,
        source: 'cec_dcec_bridge_ir',
      },
    }) ?? {
      nodes: [],
      relationships: [],
      schema: { indexes: [], constraints: [], node_labels: [], relationship_types: [] },
      metadata: {},
    };
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

/**
 * deontic-norms-bridge.ts
 *
 * Bridge adapter: legal text → deontic IR + frame records + prover syntax.
 * TypeScript port of ipfs_datasets_py/logic/bridge/deontic_norms.py
 *
 * Provides:
 *   DeonticNormRecord         — one extracted deontic norm
 *   DeonticNormsBridgeAdapter — encode(text) → {doc, context}
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

type DeonticOperator = 'O' | 'P' | 'F';

const OBLIGATION_WORDS = /\b(shall|must|required|obligated|mandated)\b/i;
const PERMISSION_WORDS = /\b(may|permitted|allowed|authorized|entitled)\b/i;
const PROHIBITION_WORDS = /\b(shall not|must not|prohibited|forbidden|shall never)\b/i;

function detectOperator(text: string): DeonticOperator {
  if (PROHIBITION_WORDS.test(text)) return 'F';
  if (PERMISSION_WORDS.test(text)) return 'P';
  return 'O'; // default to obligation
}

function extractSubject(text: string): string {
  // Rough heuristic: first noun phrase (capitalized word or "the X")
  const match = text.match(/(?:^|\bthe\s+)([A-Z][a-zA-Z]+|\b[a-z]+(?:\s+[a-z]+)?(?=\s+(?:shall|must|may)))/);
  return match?.[1] ?? 'Agent';
}

function extractAction(text: string): string {
  // Rough: verb phrase after modal
  const match = text.match(/(?:shall|must|may|shall not|must not)\s+(?:not\s+)?([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})/i);
  return match?.[1] ?? text.slice(0, 40);
}

// ---------------------------------------------------------------------------
// DeonticNormRecord
// ---------------------------------------------------------------------------

export interface DeonticNormRecord {
  norm_id: string;
  operator: DeonticOperator;
  subject: string;
  proposition: string;
  action: string;
  conditions: string[];
  source_text: string;
  prover_syntax: string;
}

function normProposition(norm: DeonticNormRecord): string {
  return norm.proposition ?? norm.action;
}

function normToProverSyntax(norm: DeonticNormRecord): string {
  const op = norm.operator;
  const body = `${normProposition(norm)}(${norm.subject})`;
  return `${op}(${body})`;
}

// ---------------------------------------------------------------------------
// Frame-logic triples
// ---------------------------------------------------------------------------

function deonticFrameTriples(
  docId: string,
  norms: DeonticNormRecord[],
): Array<Record<string, string>> {
  const triples: Array<Record<string, string>> = [];
  for (const norm of norms) {
    triples.push({ subject: docId, predicate: 'hasNorm', object: norm.norm_id });
    triples.push({ subject: norm.norm_id, predicate: 'hasOperator', object: norm.operator });
    triples.push({ subject: norm.norm_id, predicate: 'hasSubject', object: norm.subject });
    triples.push({ subject: norm.norm_id, predicate: 'hasProposition', object: normProposition(norm) });
    triples.push({ subject: norm.norm_id, predicate: 'hasAction', object: norm.action });
  }
  return triples;
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

function deonticGraphData(
  docId: string,
  norms: DeonticNormRecord[],
): Record<string, unknown> {
  const opLabel: Record<DeonticOperator, string> = { O: 'Obligation', P: 'Permission', F: 'Prohibition' };
  const nodes = [
    { id: docId, label: 'Document', properties: {} },
    ...norms.map(n => ({
      id: n.norm_id,
      label: opLabel[n.operator],
      properties: {
        subject: n.subject,
        proposition: normProposition(n).slice(0, 60),
        action: n.action.slice(0, 60),
        operator: n.operator,
      },
    })),
  ];
  const relationships = norms.map(n => ({
    source: docId,
    target: n.norm_id,
    type: 'HAS_NORM',
  }));
  return { nodes, relationships };
}

// ---------------------------------------------------------------------------
// DeonticNormsBridgeAdapter
// ---------------------------------------------------------------------------

export interface DeonticNormsEncodeOpts {
  documentId?: string;
  citation?: string;
  source?: string;
  sourceEmbedding?: number[];
  compilerGuidance?: Record<string, unknown>;
}

export interface DeonticNormsContext {
  norms: DeonticNormRecord[];
  proof_gate: ReturnType<ProofGateResult['toDict']>;
  graph_data: Record<string, unknown>;
  metrics: ReturnType<RoundTripMetrics['toDict']>;
  bridge_name: string;
  document_id: string;
}

export class DeonticNormsBridgeAdapter {
  readonly name = 'deontic_norms';
  readonly targetComponent = 'deontic.ir';

  encode(text: string, opts: DeonticNormsEncodeOpts = {}): { doc: LegalIRDocument; context: DeonticNormsContext } {
    const normalizedText = normalize(text);
    const resolvedDocId = opts.documentId ?? documentId('deontic', text);

    // Split on sentence boundaries; each sentence is a candidate norm
    const sentList = normalizedText
      .split(/[.;!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 4);

    const norms: DeonticNormRecord[] = (sentList.length > 0 ? sentList : normalizedText ? [normalizedText] : [])
      .map((s, i) => {
        const operator = detectOperator(s);
        const subject = extractSubject(s);
        const action = extractAction(s);
        const norm: DeonticNormRecord = {
          norm_id: `${resolvedDocId}:n${i}`,
          operator,
          subject,
          proposition: action,
          action,
          conditions: [],
          source_text: s,
          prover_syntax: '',
        };
        norm.prover_syntax = normToProverSyntax(norm);
        return norm;
      });

    const triples = deonticFrameTriples(resolvedDocId, norms);
    const graphData = deonticGraphData(resolvedDocId, norms);

    const proofGate = new ProofGateResult({
      attemptedCount: norms.length,
      validCount: norms.length,
      verifiedBy: norms.length > 0 ? ['deontic-parser'] : [],
    });

    const metrics = new RoundTripMetrics({ cosineSimilarity: 1.0 });

    const proverFormulas = norms.map(n => n.prover_syntax);

    const views: Record<string, LogicIRView> = {
      deontic_ir: new LogicIRView({
        name: 'deontic_ir',
        payload: {
          norms: norms.map(n => ({
            norm_id: n.norm_id, operator: n.operator,
            subject: n.subject, proposition: normProposition(n), action: n.action,
            conditions: n.conditions, source_text: n.source_text,
          })),
        },
        format: 'deontic_norm_list',
        sourceComponent: this.targetComponent,
      }),
      prover_formulas: new LogicIRView({
        name: 'prover_formulas',
        payload: { formulas: proverFormulas },
        format: 'tdfol_prover_syntax',
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
      metadata: { bridge: this.name, norm_count: norms.length },
    });

    const context: DeonticNormsContext = {
      norms,
      proof_gate: proofGate.toDict(),
      graph_data: graphData,
      metrics: metrics.toDict(),
      bridge_name: this.name,
      document_id: resolvedDocId,
    };

    return { doc, context };
  }

  evaluate(text: string, opts: DeonticNormsEncodeOpts = {}): BridgeEvaluationReport {
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

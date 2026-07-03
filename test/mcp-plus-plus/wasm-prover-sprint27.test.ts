/**
 * wasm-prover-sprint27.test.ts
 *
 * Sprint 27: FOL/TDFOL Bridge + Deontic Norms Bridge + CEC/DCEC Bridge
 */

import { FolTdfolBridgeAdapter } from '../../src/services/fol-tdfol-bridge.js';
import { DeonticNormsBridgeAdapter } from '../../src/services/deontic-norms-bridge.js';
import { CecDcecBridgeAdapter } from '../../src/services/cec-dcec-bridge.js';
import { LegalIRDocument, BridgeEvaluationReport } from '../../src/services/bridge-types.js';

const LEGAL_TEXT =
  'No person shall be deprived of liberty without due process. ' +
  'The authority may suspend the regulation under exceptional circumstances. ' +
  'All contracts must be executed in writing and signed by both parties.';

// ---------------------------------------------------------------------------
// FolTdfolBridgeAdapter
// ---------------------------------------------------------------------------

describe('FolTdfolBridgeAdapter', () => {
  const adapter = new FolTdfolBridgeAdapter();

  test('encode returns doc and context', () => {
    const { doc, context } = adapter.encode(LEGAL_TEXT);
    expect(doc).toBeInstanceOf(LegalIRDocument);
    expect(context).toHaveProperty('formula_records');
    expect(context.bridge_name).toBe('fol_tdfol');
  });

  test('doc has tdfol_formulas, frame_logic, neo4j_graph_data views', () => {
    const { doc } = adapter.encode(LEGAL_TEXT);
    expect(doc.views).toHaveProperty('tdfol_formulas');
    expect(doc.views).toHaveProperty('frame_logic');
    expect(doc.views).toHaveProperty('neo4j_graph_data');
  });

  test('formula_records are non-empty for multi-sentence text', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    expect(context.formula_records.length).toBeGreaterThan(0);
  });

  test('each formula_record has formula, predicates, source_id, formula_type', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    for (const rec of context.formula_records) {
      expect(typeof rec.formula).toBe('string');
      expect(Array.isArray(rec.predicates)).toBe(true);
      expect(typeof rec.source_id).toBe('string');
      expect(['temporal', 'deontic', 'fol', 'propositional']).toContain(rec.formula_type);
    }
  });

  test('classifies obligation sentences as deontic', () => {
    const { context } = adapter.encode('All persons must register their vehicles.');
    const types = context.formula_records.map(r => r.formula_type);
    expect(types).toContain('deontic');
  });

  test('canonicalHash is stable for same documentId', () => {
    const { doc: d1 } = adapter.encode(LEGAL_TEXT, { documentId: 'test-stable' });
    const { doc: d2 } = adapter.encode(LEGAL_TEXT, { documentId: 'test-stable' });
    expect(d1.canonicalHash()).toBe(d2.canonicalHash());
  });

  test('frame_logic view has triples', () => {
    const { doc } = adapter.encode(LEGAL_TEXT);
    const fl = doc.views['frame_logic'];
    const triples = (fl.payload as { triples: unknown[] }).triples;
    expect(triples.length).toBeGreaterThan(0);
  });

  test('evaluate returns BridgeEvaluationReport', () => {
    const report = adapter.evaluate(LEGAL_TEXT);
    expect(report).toBeInstanceOf(BridgeEvaluationReport);
    expect(report.success).toBe(true);
    expect(report.bridgeName).toBe('fol_tdfol');
    expect(report.viewNames).toContain('tdfol_formulas');
  });
});

// ---------------------------------------------------------------------------
// DeonticNormsBridgeAdapter
// ---------------------------------------------------------------------------

describe('DeonticNormsBridgeAdapter', () => {
  const adapter = new DeonticNormsBridgeAdapter();

  test('encode returns doc and context', () => {
    const { doc, context } = adapter.encode(LEGAL_TEXT);
    expect(doc).toBeInstanceOf(LegalIRDocument);
    expect(context).toHaveProperty('norms');
    expect(context.bridge_name).toBe('deontic_norms');
  });

  test('doc has deontic_ir, prover_formulas, frame_logic, neo4j_graph_data views', () => {
    const { doc } = adapter.encode(LEGAL_TEXT);
    expect(doc.views).toHaveProperty('deontic_ir');
    expect(doc.views).toHaveProperty('prover_formulas');
    expect(doc.views).toHaveProperty('frame_logic');
    expect(doc.views).toHaveProperty('neo4j_graph_data');
  });

  test('norms are non-empty for multi-sentence text', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    expect(context.norms.length).toBeGreaterThan(0);
  });

  test('each norm has operator, subject, action, prover_syntax', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    for (const norm of context.norms) {
      expect(['O', 'P', 'F']).toContain(norm.operator);
      expect(typeof norm.subject).toBe('string');
      expect(typeof norm.action).toBe('string');
      expect(typeof norm.prover_syntax).toBe('string');
      expect(norm.prover_syntax.length).toBeGreaterThan(0);
    }
  });

  test('detects prohibition for "shall not" sentences', () => {
    const { context } = adapter.encode('No person shall not disclose confidential information.');
    const ops = context.norms.map(n => n.operator);
    expect(ops).toContain('F');
  });

  test('detects permission for "may" sentences', () => {
    const { context } = adapter.encode('The court may extend the deadline upon request.');
    const ops = context.norms.map(n => n.operator);
    expect(ops).toContain('P');
  });

  test('prover_formulas view contains formula strings', () => {
    const { doc } = adapter.encode(LEGAL_TEXT);
    const pf = doc.views['prover_formulas'];
    const formulas = (pf.payload as { formulas: string[] }).formulas;
    expect(Array.isArray(formulas)).toBe(true);
    expect(formulas.length).toBeGreaterThan(0);
  });

  test('evaluate returns BridgeEvaluationReport', () => {
    const report = adapter.evaluate(LEGAL_TEXT);
    expect(report).toBeInstanceOf(BridgeEvaluationReport);
    expect(report.success).toBe(true);
    expect(report.bridgeName).toBe('deontic_norms');
  });
});

// ---------------------------------------------------------------------------
// CecDcecBridgeAdapter
// ---------------------------------------------------------------------------

describe('CecDcecBridgeAdapter', () => {
  const adapter = new CecDcecBridgeAdapter();

  test('encode returns doc and context', () => {
    const { doc, context } = adapter.encode(LEGAL_TEXT);
    expect(doc).toBeInstanceOf(LegalIRDocument);
    expect(context).toHaveProperty('records');
    expect(context.bridge_name).toBe('cec_dcec');
  });

  test('doc has cec_formulas, frame_logic, neo4j_graph_data views', () => {
    const { doc } = adapter.encode(LEGAL_TEXT);
    expect(doc.views).toHaveProperty('cec_formulas');
    expect(doc.views).toHaveProperty('frame_logic');
    expect(doc.views).toHaveProperty('neo4j_graph_data');
  });

  test('records are non-empty for multi-sentence text', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    expect(context.records.length).toBeGreaterThan(0);
  });

  test('each record has cec_formula with valid event kind prefix', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    const validPrefixes = ['Happens(', 'HoldsAt(', 'Initiates(', 'Terminates('];
    for (const rec of context.records) {
      expect(validPrefixes.some(p => rec.cec_formula.startsWith(p))).toBe(true);
    }
  });

  test('cec_event_rows have formula and event_kind', () => {
    const { context } = adapter.encode(LEGAL_TEXT);
    for (const row of context.cec_event_rows) {
      expect(typeof row.formula).toBe('string');
      expect(['Happens', 'HoldsAt', 'Initiates', 'Terminates']).toContain(row.event_kind);
    }
  });

  test('detects Initiates for "establish" language', () => {
    const { context } = adapter.encode('The agreement shall establish the right to appeal.');
    const kinds = context.records.map(r => r.event_kind);
    expect(kinds).toContain('Initiates');
  });

  test('detects Terminates for "revoke" language', () => {
    const { context } = adapter.encode('The court may revoke the license upon conviction.');
    const kinds = context.records.map(r => r.event_kind);
    expect(kinds).toContain('Terminates');
  });

  test('canonicalHash is deterministic', () => {
    const { doc: d1 } = adapter.encode(LEGAL_TEXT, { documentId: 'cec-stable' });
    const { doc: d2 } = adapter.encode(LEGAL_TEXT, { documentId: 'cec-stable' });
    expect(d1.canonicalHash()).toBe(d2.canonicalHash());
  });

  test('evaluate returns BridgeEvaluationReport', () => {
    const report = adapter.evaluate(LEGAL_TEXT);
    expect(report).toBeInstanceOf(BridgeEvaluationReport);
    expect(report.success).toBe(true);
    expect(report.bridgeName).toBe('cec_dcec');
  });
});

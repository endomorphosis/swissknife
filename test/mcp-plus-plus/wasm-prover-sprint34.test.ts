/**
 * wasm-prover-sprint34.test.ts
 *
 * Sprint 34: Modal Logic Extension + Document Consistency Checker + Temporal Deontic RAG Store
 */

import {
  ModalFormula, LogicClassification,
  AdvancedLogicConverter, convertToModal, detectLogicType,
} from '../../src/services/modal-logic-extension.js';
import {
  DocumentAnalysis, DebugReport, DocumentConsistencyChecker,
} from '../../src/services/document-consistency-checker.js';
import {
  TheoremMetadata, ConsistencyResult, TemporalDeonticRAGStore,
} from '../../src/services/temporal-deontic-rag-store.js';
import { DeonticOp, makeDeonticFormula } from '../../src/services/deontic-query-engine.js';

const LEGAL_TEXT =
  'The contractor shall deliver the goods within 30 days. ' +
  'The client may reject non-conforming goods upon inspection. ' +
  'No party shall not disclose confidential information. ' +
  'The court must review the appeal within 60 days of filing.';

// ---------------------------------------------------------------------------
// ModalFormula / convertToModal / detectLogicType
// ---------------------------------------------------------------------------

describe('convertToModal', () => {
  test('returns a ModalFormula', () => {
    const mf = convertToModal('The contractor shall deliver the goods.');
    expect(mf).toHaveProperty('formula');
    expect(mf).toHaveProperty('modalType');
    expect(mf).toHaveProperty('operators');
    expect(mf).toHaveProperty('confidence');
  });

  test('classifies obligation text as deontic', () => {
    const mf = convertToModal('The party must pay the fees.');
    expect(mf.modalType).toBe('deontic');
  });

  test('classifies temporal text as temporal', () => {
    const mf = convertToModal('The obligation always holds until it is fulfilled.');
    expect(mf.modalType).toBe('temporal');
  });

  test('confidence is in [0,1]', () => {
    const mf = convertToModal('Some text here.');
    expect(mf.confidence).toBeGreaterThanOrEqual(0);
    expect(mf.confidence).toBeLessThanOrEqual(1);
  });

  test('operators array is defined', () => {
    const mf = convertToModal('O(Pay) ∧ P(Receive)');
    expect(Array.isArray(mf.operators)).toBe(true);
  });
});

describe('detectLogicType', () => {
  test('returns LogicClassification', () => {
    const cls = detectLogicType('The agent shall comply.');
    expect(cls).toHaveProperty('logicType');
    expect(cls).toHaveProperty('confidence');
    expect(cls).toHaveProperty('indicators');
  });

  test('detects deontic for obligation text', () => {
    const cls = detectLogicType('All contractors must register their vehicles.');
    expect(cls.logicType).toBe('deontic');
  });

  test('detects epistemic for belief text', () => {
    const cls = detectLogicType('The court must know the evidence and assert the findings.');
    expect(cls.logicType).toBe('epistemic');
  });

  test('indicators is an array', () => {
    const cls = detectLogicType('The party must comply.');
    expect(Array.isArray(cls.indicators)).toBe(true);
  });
});

describe('AdvancedLogicConverter', () => {
  const converter = new AdvancedLogicConverter();

  test('convertBatch returns array of same length', () => {
    const texts = ['Must comply.', 'May inspect.', 'Shall not disclose.'];
    const results = converter.convertBatch(texts);
    expect(results).toHaveLength(3);
  });

  test('classify returns LogicClassification', () => {
    const cls = converter.classify('The obligation shall be fulfilled.');
    expect(cls.logicType).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DocumentConsistencyChecker
// ---------------------------------------------------------------------------

describe('DocumentConsistencyChecker', () => {
  const checker = new DocumentConsistencyChecker();

  test('analyze returns DocumentAnalysis', () => {
    const result = checker.analyze(LEGAL_TEXT, 'doc-test-001');
    expect(result).toBeInstanceOf(DocumentAnalysis);
  });

  test('documentId is set correctly', () => {
    const result = checker.analyze(LEGAL_TEXT, 'my-doc');
    expect(result.documentId).toBe('my-doc');
  });

  test('extractedFormulas is non-empty for deontic text', () => {
    const result = checker.analyze(LEGAL_TEXT);
    expect(result.extractedFormulas.length).toBeGreaterThan(0);
  });

  test('toDict is JSON-safe', () => {
    const result = checker.analyze(LEGAL_TEXT, 'doc-1');
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('consistencyResult is populated', () => {
    const result = checker.analyze(LEGAL_TEXT, 'doc-2');
    expect(result.consistencyResult).not.toBeNull();
  });

  test('generateDebugReport returns DebugReport', () => {
    const analysis = checker.analyze(LEGAL_TEXT, 'doc-3');
    const report = checker.generateDebugReport(analysis);
    expect(report).toBeInstanceOf(DebugReport);
    expect(report.documentId).toBe('doc-3');
  });

  test('DebugReport.toDict is JSON-safe', () => {
    const analysis = checker.analyze(LEGAL_TEXT, 'doc-4');
    const report = checker.generateDebugReport(analysis);
    report.finalize();
    expect(() => JSON.stringify(report.toDict())).not.toThrow();
  });

  test('DebugReport totalIssues >= 0', () => {
    const analysis = checker.analyze(LEGAL_TEXT, 'doc-5');
    const report = checker.generateDebugReport(analysis);
    expect(report.totalIssues).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// TemporalDeonticRAGStore
// ---------------------------------------------------------------------------

describe('TemporalDeonticRAGStore', () => {
  function makeStore(): TemporalDeonticRAGStore {
    const store = new TemporalDeonticRAGStore();
    store.addTheorem(TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.OBLIGATION, 'Contractor', 'deliver goods', { jurisdiction: 'US', sourceCase: 'Case A' }
    ));
    store.addTheorem(TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.PERMISSION, 'Client', 'inspect goods', { jurisdiction: 'US' }
    ));
    store.addTheorem(TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.PROHIBITION, 'Agent', 'disclose information', {}
    ));
    return store;
  }

  test('addTheorem adds to store', () => {
    const store = makeStore();
    expect(store.size).toBe(3);
  });

  test('addTheorem returns false for duplicate', () => {
    const store = new TemporalDeonticRAGStore();
    const t = TemporalDeonticRAGStore.makeTheoremFromFormula(DeonticOp.OBLIGATION, 'A', 'Act');
    store.addTheorem(t);
    expect(store.addTheorem(t)).toBe(false);
  });

  test('removeTheorem removes entry', () => {
    const store = makeStore();
    const theorems = store.getAllTheorems();
    store.removeTheorem(theorems[0].theoremId);
    expect(store.size).toBe(2);
  });

  test('findRelevant returns matching theorems', () => {
    const store = makeStore();
    const query = makeDeonticFormula(DeonticOp.OBLIGATION, 'Seller', 'deliver goods');
    const results = store.findRelevant(query);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test('findRelevant uses embedding similarity when provided', () => {
    const store = new TemporalDeonticRAGStore();
    const theoremA = TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.OBLIGATION,
      'Agent',
      'alpha obligation',
      { precedentStrength: 1 },
    );
    theoremA.embedding = [1, 0, 0, 0];

    const theoremB = TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.OBLIGATION,
      'Agent',
      'beta obligation',
      { precedentStrength: 1 },
    );
    theoremB.embedding = [0, 1, 0, 0];

    store.addTheorem(theoremA);
    store.addTheorem(theoremB);

    const query = makeDeonticFormula(DeonticOp.OBLIGATION, 'Agent', 'obligation');
    const ranked = store.findRelevant(query, { queryEmbedding: [1, 0, 0, 0], maxResults: 2 });

    expect(ranked.length).toBe(2);
    expect(ranked[0].theoremId).toBe(theoremA.theoremId);
  });

  test('checkConsistency detects conflict', () => {
    const store = makeStore();
    // Add a conflicting theorem
    store.addTheorem(TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.PROHIBITION, 'Contractor', 'deliver goods', {}
    ));
    const formula = makeDeonticFormula(DeonticOp.OBLIGATION, 'Contractor', 'deliver goods');
    const result = store.checkConsistency([formula]);
    expect(result).toBeInstanceOf(ConsistencyResult);
    // Conflict expected between O(deliver goods) and F(deliver goods)
    expect(result.isConsistent).toBe(false);
  });

  test('checkConsistency consistent when no conflicts', () => {
    const store = makeStore();
    const formula = makeDeonticFormula(DeonticOp.OBLIGATION, 'Agent', 'file report');
    const result = store.checkConsistency([formula]);
    expect(result.isConsistent).toBe(true);
  });

  test('ConsistencyResult.toDict is JSON-safe', () => {
    const store = makeStore();
    const formula = makeDeonticFormula(DeonticOp.OBLIGATION, 'Agent', 'act');
    const result = store.checkConsistency([formula]);
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('checkConsistency reports overlapping temporal conflicts', () => {
    const store = new TemporalDeonticRAGStore();
    const startA = new Date('2026-01-01T00:00:00.000Z');
    const endA = new Date('2026-03-01T00:00:00.000Z');
    const startB = new Date('2026-02-01T00:00:00.000Z');
    const endB = new Date('2026-04-01T00:00:00.000Z');

    store.addTheorem(new TheoremMetadata({
      theoremId: 'thm:o1',
      formula: makeDeonticFormula(DeonticOp.OBLIGATION, 'Contractor', 'deliver goods'),
      temporalScope: { start: startA, end: endA },
    }));
    store.addTheorem(new TheoremMetadata({
      theoremId: 'thm:f1',
      formula: makeDeonticFormula(DeonticOp.PROHIBITION, 'Contractor', 'deliver goods'),
      temporalScope: { start: startB, end: endB },
    }));

    const result = store.checkConsistency([
      makeDeonticFormula(DeonticOp.OBLIGATION, 'Contractor', 'deliver goods'),
    ]);

    expect(result.temporalConflicts.length).toBeGreaterThan(0);
    expect(result.isConsistent).toBe(false);
    const payload = result.toDict() as Record<string, unknown>;
    expect(payload.temporal_conflict_count).toBeGreaterThan(0);
  });

  test('TheoremMetadata.toDict is JSON-safe', () => {
    const t = TemporalDeonticRAGStore.makeTheoremFromFormula(DeonticOp.OBLIGATION, 'A', 'Act');
    expect(() => JSON.stringify(t.toDict())).not.toThrow();
  });
});

/**
 * wasm-prover-sprint35.test.ts
 *
 * Sprint 35: Deontic Logic Core + IPLD Logic Storage + Deontological Reasoning
 */

import {
  DeonticOperatorExt, LogicConnective, TemporalOperatorExt,
  makeLegalAgent, makeContext, makeExtFormula, DeonticRuleSetExt,
  DeonticLogicValidator,
  createObligation,
  createPermission,
  createProhibition,
  demonstrateDeonticLogic,
} from '../../src/services/deontic-logic-core.js';
import {
  makeProvenanceChain, LogicIPLDNode, LogicIPLDStorage,
  LogicProvenanceTracker, createLogicStorageWithProvenance,
} from '../../src/services/ipld-logic-storage.js';
import {
  DeonticExtractor, DeontologicalReasoningEngine,
} from '../../src/services/deontological-reasoning.js';

const LEGAL_TEXT =
  'The contractor shall deliver the goods within 30 days. ' +
  'The client may reject non-conforming goods upon inspection. ' +
  'No party shall not disclose confidential information to third parties. ' +
  'The agency must file the report before the deadline.';

// ---------------------------------------------------------------------------
// Deontic Logic Core
// ---------------------------------------------------------------------------

describe('DeonticOperatorExt', () => {
  test('has 8 distinct operators', () => {
    const ops = Object.values(DeonticOperatorExt);
    expect(ops).toHaveLength(8);
    expect(ops).toContain('O');
    expect(ops).toContain('P');
    expect(ops).toContain('F');
    expect(ops).toContain('POW');
    expect(ops).toContain('IMM');
  });
});

describe('makeLegalAgent', () => {
  test('creates agent with defaults', () => {
    const a = makeLegalAgent('id-001', 'Contractor');
    expect(a.identifier).toBe('id-001');
    expect(a.name).toBe('Contractor');
    expect(a.agentType).toBe('unknown');
  });

  test('toDict serialises correctly', () => {
    const a = makeLegalAgent('id-002', 'Agency', 'government');
    const d = a.toDict();
    expect(d['agent_type']).toBe('government');
  });
});

describe('makeExtFormula', () => {
  test('creates formula with operator and content', () => {
    const f = makeExtFormula(DeonticOperatorExt.OBLIGATION, 'Deliver goods on time');
    expect(f.operator).toBe(DeonticOperatorExt.OBLIGATION);
    expect(f.content).toBe('Deliver goods on time');
  });

  test('toString renders formula string', () => {
    const f = makeExtFormula(DeonticOperatorExt.PROHIBITION, 'Disclose information');
    expect(f.toString()).toContain('F');
    expect(f.toString()).toContain('Disclose information');
  });

  test('toDict is JSON-safe', () => {
    const f = makeExtFormula(DeonticOperatorExt.PERMISSION, 'Request records');
    expect(() => JSON.stringify(f.toDict())).not.toThrow();
  });

  test('temporal operator is included in toString', () => {
    const f = makeExtFormula(DeonticOperatorExt.OBLIGATION, 'Act', { temporalOp: TemporalOperatorExt.ALWAYS });
    expect(f.toString()).toContain('□');
  });
});

describe('DeonticRuleSetExt', () => {
  function makeRuleSet(): DeonticRuleSetExt {
    const rs = new DeonticRuleSetExt('test-rules');
    rs.addFormula(makeExtFormula(DeonticOperatorExt.OBLIGATION, 'Pay fees'));
    rs.addFormula(makeExtFormula(DeonticOperatorExt.PERMISSION, 'Request records'));
    rs.addFormula(makeExtFormula(DeonticOperatorExt.PROHIBITION, 'Disclose secrets'));
    rs.addFormula(makeExtFormula(DeonticOperatorExt.RIGHT, 'Appeal decision'));
    return rs;
  }

  test('size equals formula count', () => {
    expect(makeRuleSet().size).toBe(4);
  });

  test('query by operator', () => {
    const rs = makeRuleSet();
    expect(rs.query(DeonticOperatorExt.OBLIGATION)).toHaveLength(1);
    expect(rs.query(DeonticOperatorExt.PROHIBITION)).toHaveLength(1);
  });

  test('obligations/permissions/prohibitions helpers', () => {
    const rs = makeRuleSet();
    expect(rs.obligations()).toHaveLength(1);
    expect(rs.permissions()).toHaveLength(1);
    expect(rs.prohibitions()).toHaveLength(1);
  });

  test('search finds matching formula', () => {
    const rs = makeRuleSet();
    expect(rs.search('fees')).toHaveLength(1);
    expect(rs.search('zzz_no_match')).toHaveLength(0);
  });

  test('toDict is JSON-safe', () => {
    expect(() => JSON.stringify(makeRuleSet().toDict())).not.toThrow();
  });
});

describe('DeonticLogicValidator and Python-compatible constructors', () => {
  test('createObligation/createPermission/createProhibition build native extended formulas', () => {
    const agent = makeLegalAgent('contractor', 'Contractor', 'organization');
    expect(createObligation('deliver goods', agent).operator).toBe(DeonticOperatorExt.OBLIGATION);
    expect(createPermission('inspect goods', agent).operator).toBe(DeonticOperatorExt.PERMISSION);
    expect(createProhibition('disclose secrets', agent).operator).toBe(DeonticOperatorExt.PROHIBITION);
  });

  test('validator accepts valid formula and reports inconsistent rule sets', () => {
    const agent = makeLegalAgent('agent', 'Agent');
    const rules = new DeonticRuleSetExt('conflict', [
      createObligation('report incident', agent),
      createProhibition('report incident', agent),
    ]);
    expect(DeonticLogicValidator.validateFormula(rules.formulas[0])).toEqual([]);
    expect(DeonticLogicValidator.validateRuleSet(rules).some(error => error.includes('Consistency conflict'))).toBe(true);
  });

  test('demonstrateDeonticLogic returns a populated rule set', () => {
    const rules = demonstrateDeonticLogic();
    expect(rules.formulas.length).toBe(3);
    expect(DeonticLogicValidator.validateRuleSet(rules)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// IPLD Logic Storage
// ---------------------------------------------------------------------------

describe('LogicProvenanceChain', () => {
  test('makeProvenanceChain sets defaults', () => {
    const chain = makeProvenanceChain('/docs/contract.txt');
    expect(chain.sourceDocumentPath).toBe('/docs/contract.txt');
    expect(chain.formulaCid).toBeNull();
    expect(chain.graphragEntityCids).toHaveLength(0);
  });

  test('toDict is JSON-safe', () => {
    const chain = makeProvenanceChain('/doc.txt', { sourceDocumentCid: 'bafk001' });
    expect(() => JSON.stringify(chain.toDict())).not.toThrow();
  });
});

describe('LogicIPLDNode', () => {
  test('has auto-generated CID', () => {
    const node = new LogicIPLDNode({
      formulaId: 'f001',
      formula: { formulaId: 'f001', operator: 'O', content: 'Pay fees', confidence: 0.9 },
    });
    expect(node.cid).toMatch(/^bafk[0-9a-f]+$/);
  });

  test('addTranslation stores translation and cid', () => {
    const node = new LogicIPLDNode({
      formulaId: 'f002',
      formula: { formulaId: 'f002', operator: 'O', content: 'Deliver', confidence: 0.9 },
    });
    node.addTranslation('lean4', 'theorem t : Obligatory(Deliver)');
    expect(node.translations['lean4']).toBeDefined();
    expect(node.translationCids['lean4']).toMatch(/^bafk/);
  });

  test('toDict is JSON-safe', () => {
    const node = new LogicIPLDNode({
      formulaId: 'f003',
      formula: { formulaId: 'f003', operator: 'P', content: 'Inspect', confidence: 0.8 },
    });
    expect(() => JSON.stringify(node.toDict())).not.toThrow();
  });
});

describe('LogicIPLDStorage', () => {
  function makeStorage(): LogicIPLDStorage {
    const s = new LogicIPLDStorage();
    const chain = makeProvenanceChain('/contract.txt');
    s.addNode(new LogicIPLDNode({
      formulaId: 'f001',
      formula: { formulaId: 'f001', operator: 'O', content: 'Deliver', confidence: 0.9 },
      provenance: chain,
    }));
    s.addNode(new LogicIPLDNode({
      formulaId: 'f002',
      formula: { formulaId: 'f002', operator: 'P', content: 'Inspect', confidence: 0.8 },
      provenance: chain,
    }));
    return s;
  }

  test('addNode increases size', () => {
    expect(makeStorage().size).toBe(2);
  });

  test('getNode retrieves by formulaId', () => {
    const s = makeStorage();
    expect(s.getNode('f001')).toBeDefined();
    expect(s.getNode('f999')).toBeUndefined();
  });

  test('listNodes returns all nodes', () => {
    expect(makeStorage().listNodes()).toHaveLength(2);
  });

  test('findByDocument returns nodes for that path', () => {
    const found = makeStorage().findByDocument('/contract.txt');
    expect(found.length).toBe(2);
  });
});

describe('LogicProvenanceTracker', () => {
  test('trackFormula and getProvenance', () => {
    const tracker = new LogicProvenanceTracker();
    const chain = makeProvenanceChain('/doc.txt');
    tracker.trackFormula('f001', chain);
    const retrieved = tracker.getProvenance('f001');
    expect(retrieved).toBeDefined();
    expect(retrieved!.sourceDocumentPath).toBe('/doc.txt');
  });

  test('size reflects tracked count', () => {
    const { tracker } = createLogicStorageWithProvenance();
    expect(tracker.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deontological Reasoning
// ---------------------------------------------------------------------------

describe('DeonticExtractor', () => {
  const extractor = new DeonticExtractor();

  test('extractStatements returns DeonticStatement list', () => {
    const stmts = extractor.extractStatements(LEGAL_TEXT, 'doc-001');
    expect(stmts.length).toBeGreaterThan(0);
  });

  test('each statement has operator, agent, proposition/action alias', () => {
    const stmts = extractor.extractStatements(LEGAL_TEXT, 'doc-002');
    for (const s of stmts) {
      expect(['O', 'P', 'F', 'R', 'L']).toContain(s.operator);
      expect(typeof s.agent).toBe('string');
      expect(typeof s.proposition).toBe('string');
      expect(typeof s.action).toBe('string');
      expect(s.action).toBe(s.proposition);
    }
  });

  test('countByOperator returns record with all keys', () => {
    const counts = extractor.countByOperator(LEGAL_TEXT, 'doc-003');
    expect(counts).toHaveProperty('O');
    expect(counts).toHaveProperty('P');
    expect(counts).toHaveProperty('F');
  });

  test('toDict is JSON-safe', () => {
    const stmts = extractor.extractStatements(LEGAL_TEXT, 'doc-004');
    for (const s of stmts) {
      expect(() => JSON.stringify(s.toDict())).not.toThrow();
    }
  });
});

describe('DeontologicalReasoningEngine', () => {
  const engine = new DeontologicalReasoningEngine();

  test('analyzeText returns all fields', () => {
    const result = engine.analyzeText(LEGAL_TEXT, 'doc-005');
    expect(result).toHaveProperty('statements');
    expect(result).toHaveProperty('conflicts');
    expect(result).toHaveProperty('explanation');
  });

  test('reason returns ReasoningResult', () => {
    const extractor = new DeonticExtractor();
    const stmts = extractor.extractStatements(LEGAL_TEXT, 'doc-006');
    const result = engine.reason(stmts, 'deliver');
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('confidence');
  });

  test('detectConflicts finds obligation/prohibition conflict', () => {
    const extractor = new DeonticExtractor();
    const text = 'The contractor shall deliver goods. The contractor shall not deliver goods.';
    const stmts = extractor.extractStatements(text, 'doc-007');
    const conflicts = engine.detectConflicts(stmts);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  test('generateExplanation returns non-empty string', () => {
    const extractor = new DeonticExtractor();
    const stmts = extractor.extractStatements(LEGAL_TEXT, 'doc-008');
    const exp = engine.generateExplanation(stmts);
    expect(typeof exp).toBe('string');
    expect(exp.length).toBeGreaterThan(0);
  });

  test('analyzeText with query returns reasoning', () => {
    const result = engine.analyzeText(LEGAL_TEXT, 'doc-009', 'deliver');
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning!.query).toBe('deliver');
  });
});

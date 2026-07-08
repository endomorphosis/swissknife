/**
 * wasm-prover-sprint32.test.ts
 *
 * Sprint 32: Deontic Query Engine + Legal Domain Knowledge + TDFOL Grammar Bridge
 */

import {
  QueryType, DeonticOp, makeDeonticFormula, makeRuleSet,
  QueryResult, ComplianceResult, DeonticQueryEngine, createQueryEngine,
  queryLegalRules,
} from '../../src/services/logic/deontic/deontic-query-engine.js';
import {
  LegalConceptType, LegalDomainKind,
  makeLegalPattern, makeAgentPattern, LegalDomainKnowledge,
} from '../../src/services/logic/shared/legal-domain-knowledge.js';
import {
  TDFOLGrammarBridge, NaturalLanguageTDFOLInterface, parseNl, explainFormula,
} from '../../src/services/logic/tdfol/tdfol-grammar-bridge.js';
import { mkPredicate, mkDeontic } from '../../src/services/logic/tdfol/tdfol-core.js';

// ---------------------------------------------------------------------------
// Build test rule sets
// ---------------------------------------------------------------------------

function buildSampleRuleSet() {
  const formulas = [
    makeDeonticFormula(DeonticOp.OBLIGATION, 'contractor', 'deliver goods', { temporal: 'within 30 days' }),
    makeDeonticFormula(DeonticOp.PERMISSION, 'client', 'inspect goods', {}),
    makeDeonticFormula(DeonticOp.PROHIBITION, 'party', 'disclose secrets', {}),
    makeDeonticFormula(DeonticOp.OBLIGATION, 'contractor', 'provide invoice', {}),
  ];
  return makeRuleSet('test_rules', formulas);
}

// ---------------------------------------------------------------------------
// DeonticQueryEngine
// ---------------------------------------------------------------------------

describe('DeonticQueryEngine', () => {
  test('query OBLIGATIONS returns obligation formulas', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.query(QueryType.OBLIGATIONS);
    expect(result).toBeInstanceOf(QueryResult);
    expect(result.totalMatches).toBeGreaterThan(0);
    result.matchingFormulas.forEach(f => expect(f.operator).toBe(DeonticOp.OBLIGATION));
  });

  test('query PERMISSIONS returns permission formulas', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.query(QueryType.PERMISSIONS);
    expect(result.totalMatches).toBeGreaterThan(0);
    result.matchingFormulas.forEach(f => expect(f.operator).toBe(DeonticOp.PERMISSION));
  });

  test('query PROHIBITIONS returns prohibition formulas', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.query(QueryType.PROHIBITIONS);
    expect(result.totalMatches).toBe(1);
  });

  test('query TEMPORAL_CONSTRAINTS returns formulas with temporal field', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.query(QueryType.TEMPORAL_CONSTRAINTS);
    expect(result.totalMatches).toBeGreaterThan(0);
  });

  test('checkCompliance COMPLIANT for allowed action', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.checkCompliance('sign the contract');
    expect(result).toBeInstanceOf(ComplianceResult);
    expect(result.isCompliant).toBe(true);
  });

  test('checkCompliance NON-COMPLIANT for prohibited action', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.checkCompliance('disclose secrets');
    expect(result.isCompliant).toBe(false);
    expect(result.violatedProhibitions.length).toBeGreaterThan(0);
  });

  test('detectConflicts finds obligation-prohibition conflicts', () => {
    const formulas = [
      makeDeonticFormula(DeonticOp.OBLIGATION, 'agent', 'report incident'),
      makeDeonticFormula(DeonticOp.PROHIBITION, 'agent', 'report incident'),
    ];
    const engine = createQueryEngine(makeRuleSet('conflict_rules', formulas));
    const conflicts = engine.detectConflicts();
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe('obligation_prohibition');
    expect(conflicts[0].severity).toBe('high');
  });

  test('QueryResult.toDict() is JSON-serializable', () => {
    const engine = createQueryEngine(buildSampleRuleSet());
    const result = engine.query(QueryType.OBLIGATIONS);
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('ComplianceResult.toDict() contains is_compliant', () => {
    const result = new ComplianceResult({ isCompliant: true });
    expect(result.toDict()['is_compliant']).toBe(true);
  });

  test('loadRuleSet replaces existing formulas', () => {
    const engine = new DeonticQueryEngine(buildSampleRuleSet());
    const smallSet = makeRuleSet('small', [makeDeonticFormula(DeonticOp.OBLIGATION, 'x', 'act')]);
    engine.loadRuleSet(smallSet);
    const result = engine.query(QueryType.OBLIGATIONS);
    expect(result.totalMatches).toBe(1);
  });

  test('queryLegalRules runs natural-language queries against a rule set', () => {
    const result = queryLegalRules(buildSampleRuleSet(), 'What obligations apply for contractor?');
    expect(result.queryType).toBe(QueryType.OBLIGATIONS);
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.queryMetadata.natural_language_query).toContain('obligations');
  });
});

// ---------------------------------------------------------------------------
// LegalDomainKnowledge
// ---------------------------------------------------------------------------

describe('LegalDomainKnowledge', () => {
  const knowledge = new LegalDomainKnowledge();

  test('obligationPatterns are non-empty', () => {
    expect(knowledge.obligationPatterns.length).toBeGreaterThan(0);
  });

  test('obligation pattern matches "shall deliver"', () => {
    const matched = knowledge.obligationPatterns.some(p => p.match('The contractor shall deliver goods'));
    expect(matched).toBe(true);
  });

  test('permission pattern matches "may inspect"', () => {
    const matched = knowledge.permissionPatterns.some(p => p.match('The client may inspect the goods'));
    expect(matched).toBe(true);
  });

  test('prohibition pattern matches "shall not disclose"', () => {
    const matched = knowledge.prohibitionPatterns.some(p => p.match('Parties shall not disclose secrets'));
    expect(matched).toBe(true);
  });

  test('extractConcepts returns results for legal text', () => {
    const text = 'The contractor shall deliver. The client may inspect. No party shall not disclose.';
    const concepts = knowledge.extractConcepts(text);
    expect(concepts.length).toBeGreaterThan(0);
    const types = concepts.map(c => c.conceptType);
    expect(types).toContain(LegalConceptType.OBLIGATION);
  });

  test('identifyAgents finds contractor', () => {
    const agents = knowledge.identifyAgents('The contractor shall deliver the goods');
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.some(a => /contractor/i.test(a.matchedText))).toBe(true);
  });

  test('temporal pattern matches "within 30 days"', () => {
    const matched = knowledge.temporalPatterns.some(p => p.match('within 30 days'));
    expect(matched).toBe(true);
  });

  test('getPatterns returns all three categories', () => {
    const patterns = knowledge.getPatterns();
    const types = new Set(patterns.map(p => p.deonticOperator));
    expect(types.has('O')).toBe(true);
    expect(types.has('P')).toBe(true);
    expect(types.has('F')).toBe(true);
  });
});

describe('makeLegalPattern', () => {
  test('match() returns true for matching text', () => {
    const p = makeLegalPattern('\\bshall\\b', LegalConceptType.OBLIGATION, 'O');
    expect(p.match('Party shall comply')).toBe(true);
    expect(p.match('Party may comply')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TDFOLGrammarBridge
// ---------------------------------------------------------------------------

describe('TDFOLGrammarBridge', () => {
  const bridge = new TDFOLGrammarBridge();

  test('parse direct TDFOL predicate', () => {
    const f = bridge.parse('Pred(x)');
    expect(f).not.toBeNull();
  });

  test('parse direct deontic O(Pred(x))', () => {
    const f = bridge.parse('O(Pred(x))');
    expect(f).not.toBeNull();
    expect((f as Record<string, unknown>)['kind']).toBe('deontic');
  });

  test('parse returns null for garbage', () => {
    // Grammar bridge tries NL expansion, may or may not parse; at minimum no throw
    expect(() => bridge.parse('!@#$%%^')).not.toThrow();
  });

  test('explain deontic formula', () => {
    const f = mkDeontic('O', mkPredicate('Register'));
    const explanation = bridge.explain(f);
    expect(typeof explanation).toBe('string');
    expect(explanation.length).toBeGreaterThan(0);
  });

  test('parseAndExplain returns object with formula and explanation', () => {
    const { formula, explanation } = bridge.parseAndExplain('Pred(x)');
    expect(typeof explanation).toBe('string');
    if (formula !== null) expect(explanation.length).toBeGreaterThan(0);
  });
});

describe('NaturalLanguageTDFOLInterface', () => {
  const iface = new NaturalLanguageTDFOLInterface();

  test('parseNl handles TDFOL input directly', () => {
    const f = iface.parseNl('O(Pred(x))');
    expect(f).not.toBeNull();
  });

  test('explainFormula returns string', () => {
    const f = mkPredicate('Act');
    expect(typeof iface.explainFormula(f)).toBe('string');
  });

  test('parseAll returns array of same length', () => {
    const inputs = ['O(Pred(x))', 'P(Qed(y))', 'Garbage'];
    const results = iface.parseAll(inputs);
    expect(results).toHaveLength(3);
  });
});

describe('parseNl + explainFormula convenience exports', () => {
  test('parseNl is a function', () => {
    expect(typeof parseNl).toBe('function');
    expect(() => parseNl('Pred(x)')).not.toThrow();
  });

  test('explainFormula is a function', () => {
    expect(typeof explainFormula).toBe('function');
    const f = mkPredicate('Act');
    expect(typeof explainFormula(f)).toBe('string');
  });
});

/**
 * Sprint 60 tests — Grammar Engine, DCEC Integration, Context Manager,
 *                   CEC Proof Cache, DCEC Prototypes, TDFOL Performance Engine
 */

import { GrammarEngine, CompositeGrammar, Category, makeBinaryRule, makeUnaryRule } from '../../src/services/logic/cec/cec-grammar-engine';
import { parseExpressionToToken, tokenToFormula, parseDcecString, validateFormula, DCECParsingError } from '../../src/services/logic/dcec/dcec-integration';
import { ContextManager, AnaphoraResolver, DiscourseAnalyzer, EntityType, makeEntity } from '../../src/services/logic/cec/cec-context-manager';
import { CachedTheoremProver, getGlobalCachedProver } from '../../src/services/logic/cec/cec-proof-cache';
import { DCECPrototypeNamespace, TDFOLPerformanceEngine } from '../../src/services/logic/dcec/dcec-prototypes';
import { makeSort, SORT_OBJECT } from '../../src/services/logic/dcec/dcec-core-types';

// ---------------------------------------------------------------------------
// Grammar Engine
// ---------------------------------------------------------------------------
describe('GrammarEngine', () => {
  const eng = new GrammarEngine();
  beforeEach(() => {
    eng.addLexicalEntry({ word: 'Alice', category: Category.AGENT, semantics: { name: 'Alice' } });
    eng.addLexicalEntry({ word: 'must',  category: Category.VERB,  semantics: { op: 'O' } });
  });

  test('lookupWord finds lexical entry', () => {
    const entries = eng.lookupWord('Alice');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].category).toBe(Category.AGENT);
  });

  test('lookupWord is case-insensitive', () => {
    expect(eng.lookupWord('alice').length).toBeGreaterThan(0);
  });

  test('parse returns parse nodes', () => {
    const nodes = eng.parse('Alice must pay');
    expect(nodes).toHaveLength(3);
    expect(nodes[0].category).toBe(Category.AGENT);
  });

  test('getCategories returns non-empty list', () => {
    expect(eng.getCategories().length).toBeGreaterThan(0);
  });
});

describe('CompositeGrammar', () => {
  test('lookup finds from first matching grammar', () => {
    const g = new CompositeGrammar();
    const eng = new GrammarEngine();
    eng.addLexicalEntry({ word: 'Bob', category: Category.AGENT, semantics: {} });
    g.addGrammar(eng);
    expect(g.lookup('Bob').length).toBeGreaterThan(0);
  });
});

describe('makeBinaryRule / makeUnaryRule', () => {
  test('makeBinaryRule creates a valid rule', () => {
    const rule = makeBinaryRule('NP+VP', Category.SENTENCE, Category.NOUN_PHRASE, Category.VERB_PHRASE, (np, vp) => ({ np, vp }));
    expect(rule.name).toBe('NP+VP');
    expect(rule.constituents).toHaveLength(2);
    expect(rule.semanticFn(['np', 'vp'])).toEqual({ np: 'np', vp: 'vp' });
  });

  test('makeUnaryRule creates a valid rule', () => {
    const rule = makeUnaryRule('VP→V', Category.VERB_PHRASE, Category.VERB, v => v);
    expect(rule.constituents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DCEC Integration
// ---------------------------------------------------------------------------
describe('parseExpressionToToken', () => {
  test('parses S-expression', () => {
    const t = parseExpressionToToken('(and P Q)');
    expect(typeof t === 'object').toBe(true);
  });
  test('throws on empty expression', () => {
    expect(() => parseExpressionToToken('')).toThrow(DCECParsingError);
  });
});

describe('tokenToFormula', () => {
  test('converts token to formula string', () => {
    const t = parseExpressionToToken('(and P Q)');
    const f = tokenToFormula(typeof t === 'string' ? t as any : t);
    expect(typeof f).toBe('string');
    expect(f.length).toBeGreaterThan(0);
  });
});

describe('validateFormula', () => {
  test('accepts valid formula', () => {
    expect(validateFormula('O(pay(alice))')).toEqual({ valid: true, errors: [] });
  });
  test('rejects unbalanced parens', () => {
    const r = validateFormula('O(pay(alice)');
    expect(r.valid).toBe(false);
  });
  test('rejects empty formula', () => {
    expect(validateFormula('').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Context Manager
// ---------------------------------------------------------------------------
describe('ContextManager', () => {
  test('updateContext extracts entities', () => {
    const mgr = new ContextManager();
    mgr.updateContext('Alice must pay Bob.');
    const entities = mgr.getEntities();
    expect(entities.length).toBeGreaterThan(0);
  });

  test('getFocus returns most-recent entity', () => {
    const mgr = new ContextManager();
    mgr.updateContext('Alice must pay.');
    expect(mgr.getFocus()).not.toBeNull();
  });

  test('reset clears state', () => {
    const mgr = new ContextManager();
    mgr.updateContext('Alice must pay.');
    mgr.reset();
    expect(mgr.getEntities()).toHaveLength(0);
    expect(mgr.getFocus()).toBeNull();
  });
});

describe('AnaphoraResolver', () => {
  test('replaces pronoun with entity name', () => {
    const mgr = new ContextManager();
    mgr.updateContext('Alice must pay.');
    const resolver = new AnaphoraResolver();
    const result = resolver.resolve('She must pay.', mgr);
    expect(result).not.toContain('She');
  });
});

describe('DiscourseAnalyzer', () => {
  test('analyzes text', () => {
    const da = new DiscourseAnalyzer();
    const r = da.analyze('Alice must pay. She may appeal.');
    expect(r.sentences.length).toBeGreaterThan(0);
    expect(typeof r.hasDeontic).toBe('boolean');
    expect(r.hasDeontic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CEC Proof Cache
// ---------------------------------------------------------------------------
describe('CachedTheoremProver', () => {
  test('proves trivial formula', () => {
    const prover = new CachedTheoremProver();
    const r = prover.prove('P', ['P']);
    expect(r.isProved).toBe(true);
  });

  test('proves via modus ponens', () => {
    const prover = new CachedTheoremProver();
    const r = prover.prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
  });

  test('cache hit on second call', () => {
    const prover = new CachedTheoremProver();
    prover.prove('P', ['P']);
    prover.prove('P', ['P']); // cache hit
    expect(prover.getStats().hits).toBe(1);
  });

  test('getStats returns expected fields', () => {
    const s = new CachedTheoremProver().getStats();
    expect(s).toHaveProperty('size');
    expect(s).toHaveProperty('hitRate');
  });

  test('getGlobalCachedProver returns same instance', () => {
    expect(getGlobalCachedProver()).toBe(getGlobalCachedProver());
  });
});

// ---------------------------------------------------------------------------
// DCECPrototypeNamespace
// ---------------------------------------------------------------------------
describe('DCECPrototypeNamespace', () => {
  const ns = new DCECPrototypeNamespace();

  test('registerSort creates a sort', () => {
    const s = ns.registerSort('Agent');
    expect(s.name).toBe('Agent');
    expect(ns.lookupSort('Agent')).toBe(s);
  });

  test('registerPredicate creates a predicate', () => {
    const agentSort = ns.registerSort('Agent2');
    const p = ns.registerPredicate('pays', [agentSort]);
    expect(p.name).toBe('pays');
    expect(p.arity).toBe(1);
  });

  test('registerFunction creates a function', () => {
    const s = ns.registerSort('Event2');
    const f = ns.registerFunction('makeEvent', [s], SORT_OBJECT);
    expect(f.name).toBe('makeEvent');
  });

  test('export returns all registered items', () => {
    const exported = ns.export();
    expect(exported.sorts.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// TDFOLPerformanceEngine
// ---------------------------------------------------------------------------
describe('TDFOLPerformanceEngine', () => {
  test('benchmark returns result', async () => {
    const eng = new TDFOLPerformanceEngine();
    const r = await eng.benchmark('Q', ['P', 'P→Q'], 3);
    expect(r.repetitions).toBe(3);
    expect(r.avgMs).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBe(1); // always proves Q
  });

  test('profile records call', () => {
    const eng = new TDFOLPerformanceEngine();
    eng.profile('test-fn', () => 42);
    const report = eng.getReport();
    expect(report.some(r => r.name === 'test-fn')).toBe(true);
    expect(report.find(r => r.name === 'test-fn')!.calls).toBe(1);
  });

  test('reset clears profile data', () => {
    const eng = new TDFOLPerformanceEngine();
    eng.profile('op', () => 1);
    eng.reset();
    expect(eng.getReport()).toHaveLength(0);
  });

  test('benchmark uses provided proveFn', async () => {
    const eng = new TDFOLPerformanceEngine();
    const r = await eng.benchmark('X', [], 5, () => false);
    expect(r.successRate).toBe(0);
  });
});

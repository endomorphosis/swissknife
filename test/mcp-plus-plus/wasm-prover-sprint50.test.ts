/**
 * Sprint 50 tests — CEC Modal Tableaux, Formula Cache, Z3 Adapter, CEC Framework
 *
 * Covers T-223 (cec-modal-tableaux.ts),
 *         T-224 (formula-cache.ts),
 *         T-225 (z3-adapter.ts),
 *         T-226 (cec-framework.ts).
 */

import {
  NodeStatus,
  TableauNode,
  ModalTableau,
  TableauProver,
  ResolutionProver,
  createTableauProver,
  createResolutionProver,
} from '../../src/services/cec-modal-tableaux';
import { ModalLogic } from '../../src/services/shadow-prover';

import {
  CacheEntry,
  FormulaInterningCache,
  LRUCache,
  ProofResultCache,
  ParseResultCache,
  MemoizationCache,
  CacheManager,
} from '../../src/services/formula-cache';

import {
  ProofStatus,
  Z3Adapter,
  toSmtLib2,
  checkZ3Installation,
  getZ3Version,
} from '../../src/services/z3-adapter';

import {
  CECFramework,
  ReasoningMode,
  defaultFrameworkConfig,
} from '../../src/services/cec-framework';

// ---------------------------------------------------------------------------
// TableauNode tests
// ---------------------------------------------------------------------------

describe('TableauNode', () => {
  test('addFormula returns true for new formula', () => {
    const node = new TableauNode(['P'], 0);
    expect(node.addFormula('Q')).toBe(true);
  });

  test('addFormula returns false for duplicate', () => {
    const node = new TableauNode(['P'], 0);
    expect(node.addFormula('P')).toBe(false);
  });

  test('isContradictory detects P and ¬P', () => {
    const node = new TableauNode(['P', '¬P'], 0);
    expect(node.isContradictory()).toBe(true);
  });

  test('isContradictory false for consistent set', () => {
    const node = new TableauNode(['P', 'Q'], 0);
    expect(node.isContradictory()).toBe(false);
  });

  test('close() sets status to CLOSED', () => {
    const node = new TableauNode(['P'], 0);
    node.close();
    expect(node.isClosed()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ModalTableau tests
// ---------------------------------------------------------------------------

describe('ModalTableau', () => {
  test('isClosed false for open root with no children', () => {
    const root = new TableauNode(['P'], 0);
    const tableau = new ModalTableau(root, ModalLogic.K);
    expect(tableau.isClosed()).toBe(false);
  });

  test('isClosed true when root is closed', () => {
    const root = new TableauNode(['P', '¬P'], 0);
    root.close();
    const tableau = new ModalTableau(root, ModalLogic.K);
    expect(tableau.isClosed()).toBe(true);
  });

  test('newWorld increments counter', () => {
    const root = new TableauNode([], 0);
    const tableau = new ModalTableau(root, ModalLogic.K);
    expect(tableau.newWorld()).toBe(1);
    expect(tableau.newWorld()).toBe(2);
  });

  test('addStep appends to proofSteps', () => {
    const root = new TableauNode([], 0);
    const tableau = new ModalTableau(root, ModalLogic.K);
    tableau.addStep({ ruleName: 'Test', world: 0, formula: 'P', description: 'test' });
    expect(tableau.proofSteps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TableauProver tests
// ---------------------------------------------------------------------------

describe('TableauProver', () => {
  test('proves trivially true formula (included in assumptions)', () => {
    const prover = createTableauProver(ModalLogic.K);
    const { proved } = prover.prove('P', ['P']);
    expect(proved).toBe(true);
  });

  test('refutes contradictory negation (¬P when P is assumed)', () => {
    const prover = createTableauProver(ModalLogic.T);
    // goal = P, negation = ¬P, but assumption = P → contradiction → proved
    const { proved } = prover.prove('P', ['P']);
    expect(proved).toBe(true);
  });

  test('statistics update after prove', () => {
    const prover = createTableauProver(ModalLogic.K);
    prover.prove('P', ['P']);
    const s = prover.getStats();
    expect(s.proofsAttempted).toBe(1);
    expect(s.proofsSucceeded).toBe(1);
  });

  test('createTableauProver factory returns TableauProver', () => {
    const p = createTableauProver(ModalLogic.S4);
    expect(typeof p.prove).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// ResolutionProver tests
// ---------------------------------------------------------------------------

describe('ResolutionProver', () => {
  const rp = createResolutionProver();

  test('proves P from assumptions P and P→Q for Q', () => {
    const { proved } = rp.prove('Q', ['P', 'P→Q']);
    expect(proved).toBe(true);
  });

  test('fails when formula not derivable', () => {
    const rp2 = createResolutionProver();
    const { proved } = rp2.prove('R', ['P']);
    expect(proved).toBe(false);
  });

  test('resolveWith returns null when no complementary literal', () => {
    const rp2 = createResolutionProver();
    const r = rp2.resolveWith(new Set(['P', 'Q']), new Set(['R']));
    expect(r).toBeNull();
  });

  test('resolveWith resolves P with ¬P', () => {
    const rp2 = createResolutionProver();
    const r = rp2.resolveWith(new Set(['P', 'Q']), new Set(['¬P', 'R']));
    expect(r).not.toBeNull();
    expect(r!.has('P')).toBe(false);
    expect(r!.has('¬P')).toBe(false);
  });

  test('stats increment', () => {
    const rp2 = createResolutionProver();
    rp2.prove('P', ['P']);
    expect(rp2.getStats().proofsAttempted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Formula Cache tests
// ---------------------------------------------------------------------------

describe('FormulaInterningCache', () => {
  test('intern returns same reference for same formula', () => {
    const cache = new FormulaInterningCache<string>();
    const f = 'P ∧ Q';
    const a = cache.intern(f);
    const b = cache.intern(f);
    expect(a).toBe(b);
  });

  test('stats track hits/misses', () => {
    const cache = new FormulaInterningCache<string>();
    cache.intern('P');
    cache.intern('P'); // hit
    cache.intern('Q'); // miss
    const s = cache.getStats();
    expect(s['hits']).toBe(1);
    expect(s['misses']).toBe(2);
  });

  test('clear resets size', () => {
    const cache = new FormulaInterningCache<string>();
    cache.intern('P');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('LRUCache', () => {
  test('set and get', () => {
    const c = new LRUCache<string, number>(10);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
  });

  test('evicts LRU when full', () => {
    const c = new LRUCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // evicts 'a'
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });

  test('get returns undefined for missing key', () => {
    const c = new LRUCache<string, number>(5);
    expect(c.get('missing')).toBeUndefined();
  });

  test('size tracks entries', () => {
    const c = new LRUCache<string, number>(5);
    c.set('x', 10);
    expect(c.size).toBe(1);
  });

  test('delete removes entry', () => {
    const c = new LRUCache<string, number>(5);
    c.set('a', 1);
    c.delete('a');
    expect(c.has('a')).toBe(false);
  });

  test('getStats reports hitRate', () => {
    const c = new LRUCache<string, number>(5);
    c.set('a', 1);
    c.get('a'); // hit
    c.get('b'); // miss
    expect(c.getStats()['hitRate']).toBe(0.5);
  });
});

describe('ProofResultCache', () => {
  test('get returns undefined for empty cache', () => {
    const c = new ProofResultCache();
    expect(c.get('P')).toBeUndefined();
  });

  test('set/get round-trip', () => {
    const c = new ProofResultCache();
    const entry = { isProved: true, method: 'tableaux', proofTimeMs: 5 };
    c.set('P', ['Q'], entry);
    expect(c.get('P', ['Q'])?.isProved).toBe(true);
  });
});

describe('ParseResultCache', () => {
  test('get/set/clear round-trip', () => {
    const c = new ParseResultCache();
    const entry = { formula: 'O(pay)', parseTimeMs: 1, confidence: 0.9, errors: [] };
    c.set('pay taxes', entry);
    expect(c.get('pay taxes')?.formula).toBe('O(pay)');
    c.clear();
    expect(c.get('pay taxes')).toBeUndefined();
  });
});

describe('MemoizationCache', () => {
  test('memoize caches result', () => {
    const cache = new MemoizationCache<[], number>();
    let callCount = 0;
    const result1 = cache.memoize('key', () => { callCount++; return 42; });
    const result2 = cache.memoize('key', () => { callCount++; return 99; });
    expect(result1).toBe(42);
    expect(result2).toBe(42); // cached
    expect(callCount).toBe(1);
  });
});

describe('CacheManager', () => {
  test('getCache creates new cache on first call', () => {
    const mgr = new CacheManager();
    const c = mgr.getCache('proofs');
    expect(c).toBeDefined();
  });

  test('getCache returns same cache on repeat call', () => {
    const mgr = new CacheManager();
    const a = mgr.getCache('proofs');
    const b = mgr.getCache('proofs');
    expect(a).toBe(b);
  });

  test('clearAll clears all caches', () => {
    const mgr = new CacheManager();
    const c = mgr.getCache('test');
    c.set('k', 'v');
    mgr.clearAll();
    expect(c.size).toBe(0);
  });

  test('getStats returns stats for each cache', () => {
    const mgr = new CacheManager();
    mgr.getCache('a');
    const stats = mgr.getStats();
    expect(stats['a']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Z3Adapter tests
// ---------------------------------------------------------------------------

describe('toSmtLib2', () => {
  test('wraps formula in assert not', () => {
    const smt = toSmtLib2('P ∧ Q');
    expect(smt).toContain('assert');
    expect(smt).toContain('not');
  });

  test('replaces ∧ with and', () => {
    expect(toSmtLib2('P ∧ Q')).toContain(' and ');
  });

  test('replaces ¬ with not', () => {
    expect(toSmtLib2('¬P')).toContain('not ');
  });
});

describe('Z3Adapter', () => {
  test('prove() returns a Z3ProofResult', async () => {
    const adapter = new Z3Adapter({ enableCache: false });
    const result = await adapter.prove('P ∧ Q');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('isValid');
    expect(result).toHaveProperty('proofTime');
  });

  test('status is in known set', async () => {
    const adapter = new Z3Adapter();
    const r = await adapter.prove('P');
    const validStatuses = Object.values(ProofStatus);
    expect(validStatuses).toContain(r.status);
  });

  test('cache hit on second identical call', async () => {
    const adapter = new Z3Adapter({ enableCache: true });
    await adapter.prove('P ∧ Q');
    await adapter.prove('P ∧ Q');
    expect(adapter.getStats().cacheHits).toBe(1);
  });

  test('check() returns ProofStatus', async () => {
    const adapter = new Z3Adapter();
    const s = await adapter.check('P');
    expect(Object.values(ProofStatus)).toContain(s);
  });

  test('getStats total >= 1 after one query', async () => {
    const adapter = new Z3Adapter({ enableCache: false });
    await adapter.prove('Q');
    expect(adapter.getStats().queriesTotal).toBe(1);
  });
});

describe('checkZ3Installation / getZ3Version', () => {
  test('checkZ3Installation returns boolean', () => {
    expect(typeof checkZ3Installation()).toBe('boolean');
  });

  test('getZ3Version returns string or null', () => {
    const v = getZ3Version();
    expect(v === null || typeof v === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CECFramework tests
// ---------------------------------------------------------------------------

describe('CECFramework', () => {
  test('initialize() returns component status map', async () => {
    const fw = new CECFramework();
    const result = await fw.initialize();
    expect(typeof result['deonticConverter']).toBe('boolean');
  });

  test('convertNaturalLanguage returns ConversionResult', () => {
    const fw = new CECFramework();
    const r = fw.convertNaturalLanguage('Alice must pay taxes');
    expect(r.output.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0);
  });

  test('reason() returns a ReasoningTask', async () => {
    const fw = new CECFramework();
    const task = await fw.reason('Alice must pay taxes');
    expect(task).toHaveProperty('naturalLanguage');
    expect(task).toHaveProperty('dcecFormula');
    expect(task).toHaveProperty('confidence');
    expect(task).toHaveProperty('elapsedMs');
  });

  test('reason() records task in history', async () => {
    const fw = new CECFramework();
    await fw.reason('Bob may leave early');
    expect(fw.getTaskHistory()).toHaveLength(1);
  });

  test('stats update after reason()', async () => {
    const fw = new CECFramework();
    await fw.reason('Eve must not disclose secrets');
    const s = fw.getStats();
    expect(s.totalTasks).toBe(1);
    expect(s.avgConfidence).toBeGreaterThan(0);
  });

  test('reasonBatch processes multiple texts', async () => {
    const fw = new CECFramework();
    const tasks = await fw.reasonBatch(['Must pay', 'May leave', 'Must not disclose']);
    expect(tasks).toHaveLength(3);
  });

  test('defaultFrameworkConfig has expected fields', () => {
    const cfg = defaultFrameworkConfig();
    expect(cfg.reasoningMode).toBe(ReasoningMode.SIMULTANEOUS);
    expect(typeof cfg.proofTimeoutMs).toBe('number');
    expect(cfg.enableCaching).toBe(true);
  });
});

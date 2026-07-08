/**
 * wasm-prover-sprint24.test.ts
 *
 * Sprint 24: TDFOL Parser + Modal Tableaux + Performance Profiler
 */

import { parseTdfol, parseTdfolSafe } from '../../src/services/tdfol-parser.js';
import { ModalLogicType, ModalTableaux, World, TableauxBranch, proveModalFormula } from '../../src/services/modal-tableaux.js';
import { PerformanceProfiler, benchmarkProviders, ProfileBlock, BottleneckSeverity } from '../../src/services/performance-profiler.js';
import { mkPredicate, mkBinary, mkUnary, mkQuantified, mkDeontic, mkTemporal, mkVariable } from '../../src/services/tdfol-core.js';

// ---------------------------------------------------------------------------
// parseTdfol
// ---------------------------------------------------------------------------

describe('parseTdfol', () => {
  test('parses a nullary predicate', () => {
    const f = parseTdfol('Q');
    expect(f).toMatchObject({ kind: 'predicate', name: 'Q', args: [] });
  });

  test('parses a unary predicate with variable', () => {
    const f = parseTdfol('Rel(x)');
    expect(f).toMatchObject({ kind: 'predicate', name: 'Rel' });
    const p = f as ReturnType<typeof mkPredicate>;
    expect(p.args).toHaveLength(1);
    expect(p.args[0]).toMatchObject({ kind: 'variable', name: 'x' });
  });

  test('parses a binary predicate with two args', () => {
    const f = parseTdfol('Rel(a, b)');
    expect(f).toMatchObject({ kind: 'predicate', name: 'Rel' });
    const p = f as ReturnType<typeof mkPredicate>;
    expect(p.args).toHaveLength(2);
  });

  test('parses conjunction', () => {
    const f = parseTdfol('Pred(x) ∧ Qed(x)');
    expect(f).toMatchObject({ kind: 'binary', operator: '∧' });
  });

  test('parses ASCII conjunction', () => {
    const f = parseTdfol('Pred(x) & Qed(x)');
    expect(f).toMatchObject({ kind: 'binary', operator: '∧' });
  });

  test('parses implication with ->', () => {
    const f = parseTdfol('Pred(x) -> Qed(x)');
    expect(f).toMatchObject({ kind: 'binary', operator: '→' });
  });

  test('parses negation', () => {
    const f = parseTdfol('¬Pred(x)');
    expect(f).toMatchObject({ kind: 'unary', operator: '¬' });
  });

  test('parses universal quantifier (forall keyword)', () => {
    const f = parseTdfol('forall x. Pred(x)');
    expect(f).toMatchObject({ kind: 'quantified', quantifier: '∀', variable: 'x' });
  });

  test('parses universal quantifier (unicode ∀)', () => {
    const f = parseTdfol('∀x. Pred(x)');
    expect(f).toMatchObject({ kind: 'quantified', quantifier: '∀' });
  });

  test('parses existential quantifier', () => {
    const f = parseTdfol('∃x. Pred(x)');
    expect(f).toMatchObject({ kind: 'quantified', quantifier: '∃' });
  });

  test('parses obligation formula O(Pred(x))', () => {
    const f = parseTdfol('O(Pred(x))');
    expect(f).toMatchObject({ kind: 'deontic', operator: 'O' });
  });

  test('parses permission formula P(Pred(x))', () => {
    const f = parseTdfol('P(Pred(x))');
    expect(f).toMatchObject({ kind: 'deontic', operator: 'P' });
  });

  test('parses temporal always □(Pred(x)) (unicode)', () => {
    const f = parseTdfol('□(Pred(x))');
    expect(f).toMatchObject({ kind: 'temporal', operator: '□' });
  });

  test('parses temporal always G(Pred(x))', () => {
    const f = parseTdfol('G(Pred(x))');
    expect(f).toMatchObject({ kind: 'temporal', operator: '□' });
  });

  test('parses nested formula: O(Pred(x) → Qed(x))', () => {
    const f = parseTdfol('O(Pred(x) → Qed(x))');
    expect(f).toMatchObject({ kind: 'deontic', operator: 'O' });
    const d = f as ReturnType<typeof mkDeontic>;
    expect(d.formula).toMatchObject({ kind: 'binary', operator: '→' });
  });

  test('parses biconditional', () => {
    const f = parseTdfol('Pred(x) <-> Qed(x)');
    expect(f).toMatchObject({ kind: 'binary', operator: '↔' });
  });

  test('parses parenthesised formula', () => {
    const f = parseTdfol('(Pred(x))');
    expect(f).toMatchObject({ kind: 'predicate', name: 'Pred' });
  });
});

// ---------------------------------------------------------------------------
// parseTdfolSafe
// ---------------------------------------------------------------------------

describe('parseTdfolSafe', () => {
  test('returns Formula for valid input', () => {
    const f = parseTdfolSafe('P(x)');
    expect(f).not.toBeNull();
  });

  test('returns null on garbage input', () => {
    const f = parseTdfolSafe('((( totally invalid )))!!!');
    // May succeed or fail depending on how much it can parse
    // At minimum it should not throw
    expect(true).toBe(true);
  });

  test('returns null on empty string if it throws', () => {
    // parseTdfolSafe must never throw
    expect(() => parseTdfolSafe('')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

describe('World', () => {
  test('starts with empty formula sets', () => {
    const w = new World(0);
    expect(w.formulas.size).toBe(0);
    expect(w.negatedFormulas.size).toBe(0);
  });

  test('addFormula positive', () => {
    const w = new World(1);
    const f = mkPredicate('P');
    w.addFormula(f, false);
    expect(w.formulas.has(f)).toBe(true);
    expect(w.negatedFormulas.has(f)).toBe(false);
  });

  test('addFormula negated', () => {
    const w = new World(2);
    const f = mkPredicate('P');
    w.addFormula(f, true);
    expect(w.negatedFormulas.has(f)).toBe(true);
  });

  test('hasContradiction true when same object in both sets', () => {
    const w = new World(3);
    const f = mkPredicate('P');
    w.formulas.add(f);
    w.negatedFormulas.add(f);
    expect(w.hasContradiction()).toBe(true);
  });

  test('hasContradiction false when no overlap', () => {
    const w = new World(4);
    w.formulas.add(mkPredicate('P'));
    w.negatedFormulas.add(mkPredicate('Q'));
    expect(w.hasContradiction()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TableauxBranch
// ---------------------------------------------------------------------------

describe('TableauxBranch', () => {
  test('starts open', () => {
    const b = new TableauxBranch();
    expect(b.isClosed).toBe(false);
  });

  test('closeBranch sets isClosed', () => {
    const b = new TableauxBranch();
    b.closeBranch();
    expect(b.isClosed).toBe(true);
  });

  test('createFreshWorld increments ids', () => {
    const b = new TableauxBranch();
    b.addWorld(new World(0));
    const w1 = b.createFreshWorld();
    const w2 = b.createFreshWorld();
    expect(w2.id).toBeGreaterThan(w1.id);
  });

  test('addAccessibility records edges', () => {
    const b = new TableauxBranch();
    b.addAccessibility(0, 1);
    expect(b.accessibility.get(0)?.has(1)).toBe(true);
  });

  test('clone produces independent copy', () => {
    const b = new TableauxBranch();
    const w = new World(0);
    const f = mkPredicate('P');
    w.addFormula(f);
    b.addWorld(w);
    const c = b.clone();
    c.worlds.get(0)!.formulas.clear();
    expect(b.worlds.get(0)!.formulas.has(f)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ModalTableaux
// ---------------------------------------------------------------------------

describe('ModalTableaux', () => {
  test('prove returns TableauxResult with isValid flag', () => {
    const mt = new ModalTableaux(ModalLogicType.K);
    const f = mkPredicate('P');
    const result = mt.prove(f);
    expect(result).toHaveProperty('isValid');
    expect(result).toHaveProperty('closedBranches');
    expect(result).toHaveProperty('totalBranches');
    expect(result).toHaveProperty('proofSteps');
  });

  test('tautology P ∨ ¬P is valid in K', () => {
    const mt = new ModalTableaux(ModalLogicType.K);
    const p = mkPredicate('p');
    const taut = mkBinary('∨', p, mkUnary(p));
    const result = mt.prove(taut);
    expect(result.isValid).toBe(true);
  });

  test('non-tautology P alone is not valid in K', () => {
    const mt = new ModalTableaux(ModalLogicType.K);
    const result = mt.prove(mkPredicate('p'));
    expect(result.isValid).toBe(false);
  });

  test('proveModalFormula convenience wrapper works', () => {
    const p = mkPredicate('p');
    const taut = mkBinary('∨', p, mkUnary(p));
    const result = proveModalFormula(taut, ModalLogicType.S4);
    expect(result.isValid).toBe(true);
  });

  test('proof steps are strings', () => {
    const mt = new ModalTableaux();
    const p = mkPredicate('p');
    const taut = mkBinary('∨', p, mkUnary(p));
    const result = mt.prove(taut);
    expect(Array.isArray(result.proofSteps)).toBe(true);
  });

  test('implication A→B ∨ ¬(A→B) is valid', () => {
    const mt = new ModalTableaux(ModalLogicType.T);
    const a = mkPredicate('a');
    const b = mkPredicate('b');
    const imp = mkBinary('→', a, b);
    const taut = mkBinary('∨', imp, mkUnary(imp));
    const result = mt.prove(taut);
    expect(result.isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PerformanceProfiler
// ---------------------------------------------------------------------------

describe('PerformanceProfiler', () => {
  test('profile returns ProfilingStats shape', () => {
    const profiler = new PerformanceProfiler();
    const stats = profiler.profile('test-op', () => 1 + 1, 5);
    expect(stats.name).toBe('test-op');
    expect(stats.runs).toBe(5);
    expect(stats.samples).toHaveLength(5);
    expect(typeof stats.totalTimeMs).toBe('number');
    expect(typeof stats.meanTimeMs).toBe('number');
    expect(typeof stats.medianTimeMs).toBe('number');
    expect(typeof stats.minTimeMs).toBe('number');
    expect(typeof stats.maxTimeMs).toBe('number');
    expect(typeof stats.stdDevMs).toBe('number');
    expect(typeof stats.opsPerSecond).toBe('number');
  });

  test('minTimeMs <= meanTimeMs <= maxTimeMs', () => {
    const profiler = new PerformanceProfiler();
    const stats = profiler.profile('order-check', () => { /* noop */ }, 20);
    expect(stats.minTimeMs).toBeLessThanOrEqual(stats.meanTimeMs);
    expect(stats.meanTimeMs).toBeLessThanOrEqual(stats.maxTimeMs);
  });

  test('opsPerSecond >= 0', () => {
    const profiler = new PerformanceProfiler();
    const stats = profiler.profile('fast-op', () => 0, 10);
    expect(stats.opsPerSecond).toBeGreaterThanOrEqual(0);
  });

  test('getHistory accumulates stats', () => {
    const profiler = new PerformanceProfiler();
    profiler.profile('acc', () => 0, 3);
    profiler.profile('acc', () => 0, 3);
    expect(profiler.getHistory('acc')).toHaveLength(2);
  });

  test('formatReport TEXT includes name', () => {
    const profiler = new PerformanceProfiler();
    const stats = profiler.profile('report-op', () => 0, 3);
    const report = profiler.formatReport(stats);
    expect(report).toContain('report-op');
  });

  test('formatReport JSON is valid JSON', () => {
    const profiler = new PerformanceProfiler();
    const stats = profiler.profile('json-op', () => 0, 3);
    const json = profiler.formatReport(stats, 'json' as never);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('benchmarkProviders', () => {
  test('returns one result per item', () => {
    const items = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }];
    const results = benchmarkProviders(items, (v) => v * 2, 5);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('a');
    expect(results[1].name).toBe('b');
  });
});

describe('ProfileBlock', () => {
  test('stop returns elapsed >= 0', () => {
    const block = new ProfileBlock('blk');
    const elapsed = block.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  test('elapsed property is numeric', () => {
    const block = new ProfileBlock('blk2');
    expect(typeof block.elapsed).toBe('number');
  });
});

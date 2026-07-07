/**
 * wasm-prover-sprint25.test.ts
 *
 * Sprint 25: Kripke Structure + Countermodel Visualizer + TDFOL Prover + Performance Dashboard
 */

import { KripkeStructure, CountermodelVisualizer, createVisualizer } from '../../src/services/logic/modal/kripke-structure.js';
import { ModalLogicType } from '../../src/services/logic/modal/modal-tableaux.js';
import { TDFOLProver, ProofStatus, defaultTdfolRules } from '../../src/services/logic/tdfol/tdfol-prover.js';
import {
  PerformanceDashboard, MetricType, makeProofMetrics,
  getGlobalDashboard, resetGlobalDashboard,
} from '../../src/services/logic/tdfol/performance-dashboard.js';
import { TDFOLKnowledgeBase, mkPredicate, mkDeontic, mkTemporal, mkBinary, mkUnary } from '../../src/services/logic/tdfol/tdfol-core.js';

// ---------------------------------------------------------------------------
// KripkeStructure
// ---------------------------------------------------------------------------

describe('KripkeStructure', () => {
  test('addWorld registers world and initializes empty sets', () => {
    const k = new KripkeStructure();
    k.addWorld(0);
    expect(k.worlds.has(0)).toBe(true);
    expect(k.accessibility.get(0)?.size).toBe(0);
    expect(k.valuation.get(0)?.size).toBe(0);
  });

  test('addAccessibility records directed edge', () => {
    const k = new KripkeStructure();
    k.addWorld(0);
    k.addWorld(1);
    k.addAccessibility(0, 1);
    expect(k.getAccessibleWorlds(0).has(1)).toBe(true);
    expect(k.getAccessibleWorlds(1).has(0)).toBe(false);
  });

  test('setAtomTrue / isAtomTrue', () => {
    const k = new KripkeStructure();
    k.addWorld(0);
    expect(k.isAtomTrue(0, 'p')).toBe(false);
    k.setAtomTrue(0, 'p');
    expect(k.isAtomTrue(0, 'p')).toBe(true);
    expect(k.isAtomTrue(0, 'q')).toBe(false);
  });

  test('totalRelations counts all accessibility edges', () => {
    const k = new KripkeStructure();
    k.addWorld(0); k.addWorld(1); k.addWorld(2);
    k.addAccessibility(0, 1);
    k.addAccessibility(0, 2);
    k.addAccessibility(1, 2);
    expect(k.totalRelations()).toBe(3);
  });

  test('toDict serializes worlds and accessibility', () => {
    const k = new KripkeStructure(ModalLogicType.S4);
    k.addWorld(0); k.addWorld(1);
    k.addAccessibility(0, 1);
    k.setAtomTrue(0, 'p');
    const d = k.toDict();
    expect(d.worlds).toEqual([0, 1]);
    expect((d.accessibility as Record<string, number[]>)['0']).toContain(1);
    expect(d.logic_type).toBe(ModalLogicType.S4);
  });

  test('toJson produces valid JSON', () => {
    const k = new KripkeStructure();
    k.addWorld(0);
    expect(() => JSON.parse(k.toJson())).not.toThrow();
  });

  test('getAccessibleWorlds returns empty set for unknown world', () => {
    const k = new KripkeStructure();
    expect(k.getAccessibleWorlds(99).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CountermodelVisualizer
// ---------------------------------------------------------------------------

describe('CountermodelVisualizer', () => {
  function makeKripke(): KripkeStructure {
    const k = new KripkeStructure(ModalLogicType.K);
    k.addWorld(0); k.addWorld(1);
    k.addAccessibility(0, 1);
    k.setAtomTrue(0, 'p');
    k.setAtomTrue(1, 'q');
    return k;
  }

  test('renderAscii expanded contains logic type', () => {
    const vis = new CountermodelVisualizer(makeKripke());
    const out = vis.renderAscii('expanded');
    expect(out).toContain('K');
  });

  test('renderAscii expanded contains world ids', () => {
    const vis = new CountermodelVisualizer(makeKripke());
    const out = vis.renderAscii('expanded');
    expect(out).toContain('w0');
    expect(out).toContain('w1');
  });

  test('renderAscii expanded lists accessibility', () => {
    const vis = new CountermodelVisualizer(makeKripke());
    const out = vis.renderAscii('expanded');
    expect(out).toContain('→');
  });

  test('renderAscii compact contains world count', () => {
    const vis = new CountermodelVisualizer(makeKripke());
    const out = vis.renderAscii('compact');
    expect(out).toContain('2 worlds');
  });

  test('renderAscii compact marks initial world with *', () => {
    const vis = new CountermodelVisualizer(makeKripke());
    const out = vis.renderAscii('compact');
    expect(out).toContain('*w0');
  });

  test('createVisualizer factory returns CountermodelVisualizer', () => {
    const k = makeKripke();
    const vis = createVisualizer(k);
    expect(vis).toBeInstanceOf(CountermodelVisualizer);
    expect(typeof vis.renderAscii()).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// TDFOLProver
// ---------------------------------------------------------------------------

describe('TDFOLProver', () => {
  test('prove returns ProofResult shape', () => {
    const prover = new TDFOLProver();
    const p = mkPredicate('p');
    const result = prover.prove(p);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('formula');
    expect(result).toHaveProperty('proofSteps');
    expect(result).toHaveProperty('timeMs');
    expect(result).toHaveProperty('method');
  });

  test('prove axiom returns PROVED via axiom_lookup', () => {
    const kb = new TDFOLKnowledgeBase();
    const p = mkPredicate('myAxiom');
    kb.addAxiom(p, 'myAxiom');
    const prover = new TDFOLProver(kb);
    const result = prover.prove(p);
    expect(result.status).toBe(ProofStatus.PROVED);
    expect(result.method).toBe('axiom_lookup');
  });

  test('prove theorem returns PROVED via theorem_lookup', () => {
    const kb = new TDFOLKnowledgeBase();
    const p = mkPredicate('myThm');
    kb.addTheorem(p, 'myThm');
    const prover = new TDFOLProver(kb);
    const result = prover.prove(p);
    expect(result.status).toBe(ProofStatus.PROVED);
    expect(result.method).toBe('theorem_lookup');
  });

  test('DeonticDRule derives P(φ) from O(φ)', () => {
    const kb = new TDFOLKnowledgeBase();
    const p = mkPredicate('ActWell');
    const obligation = mkDeontic('O', p);
    kb.addAxiom(obligation);
    const prover = new TDFOLProver(kb);
    // Goal: P(ActWell) — should be derivable via DeonticDRule
    const goal = mkDeontic('P', p);
    const result = prover.prove(goal);
    expect(result.status).toBe(ProofStatus.PROVED);
  });

  test('prove tautology via modal_tableaux fallback', () => {
    const prover = new TDFOLProver();
    // p ∨ ¬p is a tautology
    const p = mkPredicate('p');
    const taut = mkBinary('∨', p, mkUnary(p));
    const result = prover.prove(taut);
    expect(result.status).toBe(ProofStatus.PROVED);
    expect(result.method).toBe('modal_tableaux');
  });

  test('prove non-theorem returns FAILED', () => {
    const prover = new TDFOLProver();
    const goal = mkPredicate('UnknownPred');
    const result = prover.prove(goal);
    expect(result.status).toBe(ProofStatus.FAILED);
  });

  test('timeMs is a number', () => {
    const prover = new TDFOLProver();
    const result = prover.prove(mkPredicate('x'));
    expect(typeof result.timeMs).toBe('number');
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  test('defaultTdfolRules returns non-empty array', () => {
    const rules = defaultTdfolRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(typeof r.name).toBe('string');
      expect(typeof r.apply).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// PerformanceDashboard
// ---------------------------------------------------------------------------

describe('PerformanceDashboard', () => {
  test('record then getAggregatedStats reflects one proof', () => {
    const dash = new PerformanceDashboard();
    dash.record(makeProofMetrics({
      formulaStr: 'P(x)',
      proofTimeMs: 5,
      success: true,
      method: 'axiom_lookup',
      strategy: 'direct',
      formulaType: 'propositional',
    }));
    const stats = dash.getAggregatedStats();
    expect(stats.totalProofs).toBe(1);
    expect(stats.successfulProofs).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  test('aggregated cache stats', () => {
    const dash = new PerformanceDashboard();
    dash.record(makeProofMetrics({ formulaStr: 'A', cacheHit: true }));
    dash.record(makeProofMetrics({ formulaStr: 'B', cacheHit: false }));
    const stats = dash.getAggregatedStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHitRate).toBe(0.5);
  });

  test('minProofTimeMs <= avgProofTimeMs <= maxProofTimeMs', () => {
    const dash = new PerformanceDashboard();
    for (const ms of [10, 20, 30]) {
      dash.record(makeProofMetrics({ formulaStr: 'f', proofTimeMs: ms }));
    }
    const s = dash.getAggregatedStats();
    expect(s.minProofTimeMs).toBeLessThanOrEqual(s.avgProofTimeMs);
    expect(s.avgProofTimeMs).toBeLessThanOrEqual(s.maxProofTimeMs);
  });

  test('strategyCounts tracks strategy frequency', () => {
    const dash = new PerformanceDashboard();
    dash.record(makeProofMetrics({ formulaStr: 'a', strategy: 'tableaux' }));
    dash.record(makeProofMetrics({ formulaStr: 'b', strategy: 'tableaux' }));
    dash.record(makeProofMetrics({ formulaStr: 'c', strategy: 'forward' }));
    const s = dash.getAggregatedStats();
    expect(s.strategyCounts['tableaux']).toBe(2);
    expect(s.strategyCounts['forward']).toBe(1);
  });

  test('getTimeSeries returns all time-series points', () => {
    const dash = new PerformanceDashboard();
    dash.record(makeProofMetrics({ formulaStr: 'f', proofTimeMs: 5 }));
    const ts = dash.getTimeSeries(MetricType.PROOF_TIME);
    expect(ts.length).toBeGreaterThanOrEqual(1);
  });

  test('exportJson is valid JSON', () => {
    const dash = new PerformanceDashboard();
    dash.record(makeProofMetrics({ formulaStr: 'P(x)', success: true }));
    expect(() => JSON.parse(dash.exportJson())).not.toThrow();
  });

  test('reset clears metrics', () => {
    const dash = new PerformanceDashboard();
    dash.record(makeProofMetrics({ formulaStr: 'f' }));
    dash.reset();
    expect(dash.getAggregatedStats().totalProofs).toBe(0);
  });

  test('getGlobalDashboard returns singleton', () => {
    resetGlobalDashboard();
    const d1 = getGlobalDashboard();
    const d2 = getGlobalDashboard();
    expect(d1).toBe(d2);
    resetGlobalDashboard();
  });

  test('empty dashboard stats have zero totalProofs', () => {
    const dash = new PerformanceDashboard();
    expect(dash.getAggregatedStats().totalProofs).toBe(0);
  });
});

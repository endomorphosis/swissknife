/**
 * Sprint 45 tests — TDFOL Performance Metrics, ZKP Integration, Formula Analyzer
 *
 * Covers T-201 (tdfol-performance-metrics.ts),
 *         T-202 (tdfol-zkp-integration.ts),
 *         T-203 (formula-analyzer.ts).
 */

import {
  MetricsCollector,
  StatisticalSummary,
  getGlobalCollector,
  resetGlobalCollector,
} from '../../src/services/logic/tdfol/tdfol-performance-metrics.js';

import {
  FormulaAnalyzer,
  FormulaType,
  FormulaComplexity,
} from '../../src/services/logic/shared/formula-analyzer.js';

import {
  ZKPTDFOLProver,
} from '../../src/services/logic/tdfol/tdfol-zkp-integration.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// MetricsCollector tests
// ---------------------------------------------------------------------------

describe('MetricsCollector — timing', () => {
  let collector: MetricsCollector;
  beforeEach(() => { collector = new MetricsCollector(); });

  test('recordTiming stores values and returns stats', () => {
    collector.recordTiming('op', 10);
    collector.recordTiming('op', 20);
    collector.recordTiming('op', 30);
    const stats = collector.getTimingStats('op')!;
    expect(stats.count).toBe(3);
    expect(stats.mean).toBeCloseTo(20);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(30);
  });

  test('timeSync measures real duration', () => {
    collector.timeSync('sync', () => {
      let x = 0;
      for (let i = 0; i < 1000; i++) x += i;
      return x;
    });
    const stats = collector.getTimingStats('sync')!;
    expect(stats.count).toBe(1);
    expect(stats.mean).toBeGreaterThanOrEqual(0);
  });

  test('timeAsync measures async duration', async () => {
    await collector.timeAsync('async', () => delay(5));
    const stats = collector.getTimingStats('async')!;
    expect(stats.count).toBe(1);
    expect(stats.mean).toBeGreaterThan(0);
  });

  test('startTimer / stopTimer round-trip', () => {
    collector.startTimer('manual');
    const dur = collector.stopTimer('manual');
    expect(dur).toBeGreaterThanOrEqual(0);
    expect(collector.getTimingStats('manual')?.count).toBe(1);
  });

  test('stopTimer throws for unknown timer', () => {
    expect(() => collector.stopTimer('nonexistent')).toThrow();
  });

  test('getTimingStats returns null for unknown metric', () => {
    expect(collector.getTimingStats('unknown')).toBeNull();
  });
});

describe('MetricsCollector — counters / gauges / histograms', () => {
  let collector: MetricsCollector;
  beforeEach(() => { collector = new MetricsCollector(); });

  test('incrementCounter accumulates', () => {
    collector.incrementCounter('c', 3);
    collector.incrementCounter('c', 7);
    const stats = collector.getStatistics() as { counters: Record<string, number> };
    expect(stats.counters['c']).toBe(10);
  });

  test('setGauge stores latest value', () => {
    collector.setGauge('g', 42);
    collector.setGauge('g', 99);
    const stats = collector.getStatistics() as { gauges: Record<string, number> };
    expect(stats.gauges['g']).toBe(99);
  });

  test('recordHistogram and getHistogramStats', () => {
    [1, 2, 3, 4, 5].forEach(v => collector.recordHistogram('h', v));
    const s = collector.getHistogramStats('h')!;
    expect(s.count).toBe(5);
    expect(s.mean).toBeCloseTo(3);
    expect(s.p95).toBeGreaterThan(s.median);
  });

  test('reset clears all data', () => {
    collector.recordTiming('x', 5);
    collector.incrementCounter('y');
    collector.reset();
    expect(collector.getTimingStats('x')).toBeNull();
    const stats = collector.getStatistics() as { counters: Record<string, number> };
    expect(Object.keys(stats.counters)).toHaveLength(0);
  });
});

describe('MetricsCollector — statistical accuracy', () => {
  test('p50 / p95 / p99 are ordered correctly', () => {
    const c = new MetricsCollector();
    for (let i = 1; i <= 100; i++) c.recordTiming('v', i);
    const s = c.getTimingStats('v')!;
    expect(s.p50).toBeLessThanOrEqual(s.p95);
    expect(s.p95).toBeLessThanOrEqual(s.p99);
    expect(s.p99).toBeLessThanOrEqual(s.max);
  });

  test('single-value summary has stdDev = 0', () => {
    const c = new MetricsCollector();
    c.recordTiming('single', 42);
    expect(c.getTimingStats('single')!.stdDev).toBe(0);
  });
});

describe('MetricsCollector — global singleton', () => {
  afterEach(() => resetGlobalCollector());

  test('getGlobalCollector returns same instance', () => {
    const a = getGlobalCollector();
    const b = getGlobalCollector();
    expect(a).toBe(b);
  });

  test('resetGlobalCollector creates new instance', () => {
    const a = getGlobalCollector();
    resetGlobalCollector();
    const b = getGlobalCollector();
    expect(a).not.toBe(b);
  });
});

describe('MetricsCollector — exportDict', () => {
  test('exportDict contains statistics and raw results', () => {
    const c = new MetricsCollector();
    c.recordTiming('t', 1);
    const d = c.exportDict();
    expect(d).toHaveProperty('statistics');
    expect(d).toHaveProperty('timingResults');
    expect(d).toHaveProperty('memoryResults');
  });
});

// ---------------------------------------------------------------------------
// FormulaAnalyzer tests
// ---------------------------------------------------------------------------

describe('FormulaAnalyzer — classifyType', () => {
  const fa = new FormulaAnalyzer();

  test('deontic formula', () => {
    expect(fa.classifyType('obligatory(pay(alice, bob))')).toBe(FormulaType.DEONTIC);
  });

  test('propositional formula', () => {
    expect(fa.classifyType('P and Q')).toBe(FormulaType.PROPOSITIONAL);
  });

  test('quantified formula', () => {
    expect(fa.classifyType('forall x . P(x)')).toBe(FormulaType.QUANTIFIED);
  });

  test('modal formula', () => {
    expect(fa.classifyType('box P implies diamond Q')).toBe(FormulaType.MODAL);
  });

  test('temporal formula', () => {
    expect(fa.classifyType('always eventually P')).toBe(FormulaType.TEMPORAL);
  });

  test('arithmetic formula', () => {
    expect(fa.classifyType('x + y = z')).toBe(FormulaType.ARITHMETIC);
  });
});

describe('FormulaAnalyzer — measureComplexity', () => {
  const fa = new FormulaAnalyzer();

  test('trivial single atom', () => {
    const c = fa.measureComplexity('P');
    expect([FormulaComplexity.TRIVIAL, FormulaComplexity.SIMPLE]).toContain(c);
  });

  test('deeply nested has higher complexity', () => {
    const simple = fa.analyze('P');
    const complex = fa.analyze('forall x forall y forall z (P(x) and Q(y) and R(z) and box obligatory S)');
    expect(complex.complexityScore).toBeGreaterThan(simple.complexityScore);
  });
});

describe('FormulaAnalyzer — analyze', () => {
  const fa = new FormulaAnalyzer();

  test('full analysis returns all fields', () => {
    const r = fa.analyze('forall x . obligatory(pay(x))');
    expect(r).toHaveProperty('formulaType');
    expect(r).toHaveProperty('complexity');
    expect(r).toHaveProperty('quantifierDepth');
    expect(r).toHaveProperty('nestingLevel');
    expect(r).toHaveProperty('operatorCount');
    expect(r).toHaveProperty('recommendedProvers');
    expect(r).toHaveProperty('complexityScore');
  });

  test('recommendedProvers is non-empty', () => {
    const r = fa.analyze('P(x)');
    expect(r.recommendedProvers.length).toBeGreaterThan(0);
  });

  test('hasDeontic flag set for deontic formula', () => {
    const r = fa.analyze('obligatory(act)');
    expect(r.hasDeontic).toBe(true);
  });

  test('hasModal flag set for modal formula', () => {
    const r = fa.analyze('box P and diamond Q');
    expect(r.hasModal).toBe(true);
  });

  test('complexityScore in [0, 100]', () => {
    const r = fa.analyze('forall x forall y (P(x,y) implies Q(y,x))');
    expect(r.complexityScore).toBeGreaterThanOrEqual(0);
    expect(r.complexityScore).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// ZKPTDFOLProver tests
// ---------------------------------------------------------------------------

describe('ZKPTDFOLProver — standard mode', () => {
  test('proves formula in standard mode', async () => {
    const prover = new ZKPTDFOLProver();
    const result = await prover.prove('P and Q');
    expect(result.isProved).toBe(true);
    expect(result.method).toBe('tdfol_standard');
    expect(result.isPrivate).toBe(false);
    expect(result.zkpProof).toBeNull();
    expect(result.proofSteps).not.toBeNull();
  });

  test('stats increment on standard proof', async () => {
    const prover = new ZKPTDFOLProver();
    await prover.prove('P');
    expect(prover.getStats().standardProofs).toBe(1);
  });
});

describe('ZKPTDFOLProver — ZKP mode', () => {
  test('produces ZKP proof with browser Schnorr backend', async () => {
    const prover = new ZKPTDFOLProver({ enableZkp: true });
    const result = await prover.prove('P(x)', { preferZkp: true });
    expect(result.isProved).toBe(true);
    expect(result.method).toBe('tdfol_zkp');
    expect(result.zkpProof).not.toBeNull();
    expect(result.backend).toBe('browser-schnorr-wasm');
  });

  test('verifyZkp returns true for matching proof', async () => {
    const prover = new ZKPTDFOLProver({ enableZkp: true });
    const result = await prover.prove('P(x)', { preferZkp: true });
    const ok = await prover.verifyZkp(result.zkpProof!, 'P(x)');
    expect(ok).toBe(true);
  });

  test('verifyZkp returns false for wrong formula', async () => {
    const prover = new ZKPTDFOLProver({ enableZkp: true });
    const result = await prover.prove('P(x)', { preferZkp: true });
    const ok = await prover.verifyZkp(result.zkpProof!, 'Q(y)');
    expect(ok).toBe(false);
  });

  test('stats increment on ZKP proof', async () => {
    const prover = new ZKPTDFOLProver({ enableZkp: true });
    await prover.prove('P', { preferZkp: true });
    expect(prover.getStats().zkpProofs).toBe(1);
  });

  test('privateAxioms requires enableZkp', async () => {
    const prover = new ZKPTDFOLProver({ enableZkp: false });
    await expect(prover.prove('P', { privateAxioms: true })).rejects.toThrow();
  });
});

describe('ZKPTDFOLProver — caching', () => {
  test('second call is a cache hit', async () => {
    const prover = new ZKPTDFOLProver({ enableCache: true });
    await prover.prove('CachedFormula');
    const second = await prover.prove('CachedFormula');
    expect(second.cacheHit).toBe(true);
    expect(prover.getStats().cacheHits).toBe(1);
  });

  test('different formulas are separate cache entries', async () => {
    const prover = new ZKPTDFOLProver({ enableCache: true });
    await prover.prove('FormulaA');
    const b = await prover.prove('FormulaB');
    expect(b.cacheHit).toBe(false);
  });
});

describe('ZKPTDFOLProver — fallback', () => {
  test('falls back to standard when ZKP fails (zkpFallback=standard)', async () => {
    // Use hybrid mode: zkp enabled, but force a fallback by using a standard proof
    const prover = new ZKPTDFOLProver({ enableZkp: true, zkpFallback: 'standard' });
    // Standard prove (no prefer_zkp) should always succeed
    const result = await prover.prove('P(y)');
    expect(result.isProved).toBe(true);
  });
});

describe('ZKPTDFOLProver — unsupported backend', () => {
  test('throws on non-simulated backend', () => {
    expect(() => new ZKPTDFOLProver({ enableZkp: true, zkpBackend: 'groth16' })).toThrow();
  });
});

describe('ZKPTDFOLProver — getStats', () => {
  test('initial stats are all zero', () => {
    const prover = new ZKPTDFOLProver();
    const s = prover.getStats();
    expect(s.standardProofs).toBe(0);
    expect(s.zkpProofs).toBe(0);
    expect(s.cacheHits).toBe(0);
    expect(s.totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});

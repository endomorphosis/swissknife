/**
 * wasm-prover-sprint88.test.ts
 * Tests for §12.20 TDFOL performance engine residual closure.
 */

import { TDFOLPerformanceEngine } from '../../src/services/logic/tdfol/tdfol-performance-engine.js';

describe('PORT-184 TDFOLPerformanceEngine', () => {
  it('aggregates per-strategy timings, success rates, and percentiles', () => {
    const engine = new TDFOLPerformanceEngine();
    engine.recordRun({ strategy: 'modal-tableaux', formula: '□P', durationMs: 10, proved: true, steps: 3 });
    engine.recordRun({ strategy: 'modal-tableaux', formula: '□Q', durationMs: 20, proved: false, steps: 5 });
    engine.recordRun({ strategy: 'forward-chain', formula: 'P', durationMs: 5, proved: true, steps: 1 });

    const modal = engine.getStrategyStats('modal-tableaux')!;
    expect(modal.attempts).toBe(2);
    expect(modal.successRate).toBe(0.5);
    expect(modal.avgMs).toBe(15);
    expect(modal.avgSteps).toBe(4);
    expect(modal.p95Ms).toBeGreaterThan(10);
  });

  it('generates dashboard-ready reports with fastest and most reliable strategies', () => {
    const engine = new TDFOLPerformanceEngine();
    engine.recordRun({ strategy: 'slow-reliable', formula: 'P', durationMs: 30, proved: true });
    engine.recordRun({ strategy: 'fast-flaky', formula: 'P', durationMs: 5, proved: false });
    engine.recordRun({ strategy: 'fast-flaky', formula: 'Q', durationMs: 6, proved: true });

    const report = engine.getReport();
    expect(report.totalAttempts).toBe(3);
    expect(report.fastestStrategy).toBe('fast-flaky');
    expect(report.mostReliableStrategy).toBe('slow-reliable');
    expect(report.strategies.map(s => s.strategy)).toEqual(expect.arrayContaining(['slow-reliable', 'fast-flaky']));
  });

  it('times strategy functions and compares successful results', async () => {
    const engine = new TDFOLPerformanceEngine();
    const comparison = await engine.compareStrategies('P', {
      fail: () => false,
      success: () => true,
    });

    expect(comparison.results).toHaveLength(2);
    expect(comparison.bestBySuccess!.strategy).toBe('success');
    expect(engine.exportMetrics()).toHaveProperty('statistics');
  });

  it('records errors as failed strategy runs and supports reset', async () => {
    const engine = new TDFOLPerformanceEngine();
    const run = await engine.timeStrategy('throwing', 'P', () => {
      throw new Error('boom');
    });
    expect(run.proved).toBe(false);
    expect(run.error).toBe('boom');
    expect(engine.getReport().totalAttempts).toBe(1);
    engine.reset();
    expect(engine.getReport().totalAttempts).toBe(0);
  });
});

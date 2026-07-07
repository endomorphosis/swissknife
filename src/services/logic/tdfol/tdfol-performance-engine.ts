/**
 * TDFOL Performance Engine — PORT-184 (Sprint 88)
 *
 * Aggregates per-strategy proof timings over MetricsCollector and produces
 * strategy-level summaries, comparisons, and dashboard-ready reports.
 */

import { MetricsCollector, StatisticalSummary } from './tdfol-performance-metrics.js';

export interface StrategyRunRecord {
  strategy: string;
  formula: string;
  durationMs: number;
  proved: boolean;
  steps?: number;
  error?: string;
  timestamp?: number;
}

export interface StrategyAggregate {
  strategy: string;
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgSteps: number;
}

export interface PerformanceReport {
  generatedAt: string;
  totalAttempts: number;
  totalSuccesses: number;
  strategies: StrategyAggregate[];
  fastestStrategy: string | null;
  mostReliableStrategy: string | null;
}

export interface StrategyComparisonResult {
  formula: string;
  results: StrategyRunRecord[];
  bestByTime: StrategyRunRecord | null;
  bestBySuccess: StrategyRunRecord | null;
}

export class TDFOLPerformanceEngine {
  private readonly records: StrategyRunRecord[] = [];

  constructor(private readonly collector = new MetricsCollector()) {}

  recordRun(record: StrategyRunRecord): StrategyRunRecord {
    const normalized: StrategyRunRecord = {
      ...record,
      timestamp: record.timestamp ?? Date.now(),
    };
    this.records.push(normalized);
    this.collector.recordTiming(metricName(record.strategy), record.durationMs, {
      formula: record.formula,
      proved: record.proved,
      error: record.error ?? '',
    });
    this.collector.recordHistogram(`${metricName(record.strategy)}.steps`, record.steps ?? 0);
    this.collector.incrementCounter(record.proved ? 'tdfol.strategy.successes' : 'tdfol.strategy.failures');
    return normalized;
  }

  async timeStrategy(
    strategy: string,
    formula: string,
    fn: () => boolean | Promise<boolean>,
    steps = 0,
  ): Promise<StrategyRunRecord> {
    const start = performance.now();
    try {
      const proved = await Promise.resolve(fn());
      return this.recordRun({ strategy, formula, durationMs: performance.now() - start, proved, steps });
    } catch (err) {
      return this.recordRun({
        strategy,
        formula,
        durationMs: performance.now() - start,
        proved: false,
        steps,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async compareStrategies(
    formula: string,
    strategies: Record<string, () => boolean | Promise<boolean>>,
  ): Promise<StrategyComparisonResult> {
    const results: StrategyRunRecord[] = [];
    for (const [strategy, fn] of Object.entries(strategies)) {
      results.push(await this.timeStrategy(strategy, formula, fn));
    }
    const successful = results.filter(result => result.proved);
    return {
      formula,
      results,
      bestByTime: successful.length ? [...successful].sort((a, b) => a.durationMs - b.durationMs)[0]! : null,
      bestBySuccess: successful[0] ?? null,
    };
  }

  getStrategyStats(strategy: string): StrategyAggregate | null {
    const matching = this.records.filter(record => record.strategy === strategy);
    if (!matching.length) return null;
    const timing = summarize(matching.map(record => record.durationMs));
    const successes = matching.filter(record => record.proved).length;
    const steps = matching.map(record => record.steps ?? 0);
    return {
      strategy,
      attempts: matching.length,
      successes,
      failures: matching.length - successes,
      successRate: successes / matching.length,
      avgMs: timing.mean,
      minMs: timing.min,
      maxMs: timing.max,
      p50Ms: timing.p50,
      p95Ms: timing.p95,
      p99Ms: timing.p99,
      avgSteps: steps.reduce((sum, value) => sum + value, 0) / steps.length,
    };
  }

  getReport(): PerformanceReport {
    const strategies = [...new Set(this.records.map(record => record.strategy))]
      .map(strategy => this.getStrategyStats(strategy))
      .filter((stats): stats is StrategyAggregate => stats !== null);
    const totalAttempts = strategies.reduce((sum, stats) => sum + stats.attempts, 0);
    const totalSuccesses = strategies.reduce((sum, stats) => sum + stats.successes, 0);
    const successful = strategies.filter(stats => stats.successes > 0);
    return {
      generatedAt: new Date().toISOString(),
      totalAttempts,
      totalSuccesses,
      strategies,
      fastestStrategy: successful.length ? [...successful].sort((a, b) => a.avgMs - b.avgMs)[0]!.strategy : null,
      mostReliableStrategy: strategies.length ? [...strategies].sort((a, b) => b.successRate - a.successRate || a.avgMs - b.avgMs)[0]!.strategy : null,
    };
  }

  exportMetrics(): Record<string, unknown> {
    return this.collector.exportDict();
  }

  reset(): void {
    this.records.length = 0;
    this.collector.reset();
  }

  getRuns(): StrategyRunRecord[] {
    return [...this.records];
  }
}

function metricName(strategy: string): string {
  return `tdfol.strategy.${strategy.replace(/[^A-Za-z0-9_]/g, '_')}.duration_ms`;
}

function summarize(values: number[]): StatisticalSummary {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) {
    return { count: 0, sum: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, p999: 0 };
  }
  const count = sorted.length;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / count;
  const variance = count > 1 ? sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (count - 1) : 0;
  return {
    count,
    sum,
    mean,
    median: percentile(sorted, 50),
    stdDev: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[count - 1]!,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    p999: percentile(sorted, 99.9),
  };
}

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * pct / 100;
  const lower = Math.floor(position);
  const upper = lower + 1;
  if (upper >= sorted.length) return sorted[sorted.length - 1]!;
  return sorted[lower]! * (upper - position) + sorted[upper]! * (position - lower);
}

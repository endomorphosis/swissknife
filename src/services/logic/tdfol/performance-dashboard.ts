/**
 * performance-dashboard.ts
 *
 * Performance dashboard for proof attempts — records ProofMetrics events,
 * aggregates statistics, and exports JSON reports.
 *
 * TypeScript port of ipfs_datasets_py/logic/TDFOL/performance_dashboard.py
 *
 * Provides:
 *   MetricType          — enum of recordable metric categories
 *   ProofMetrics        — a single proof-attempt record
 *   TimeSeriesMetric    — a timestamped numeric data point
 *   AggregatedStats     — aggregate statistics over many proofs
 *   PerformanceDashboard — records, aggregates, exports
 */

// ---------------------------------------------------------------------------
// MetricType
// ---------------------------------------------------------------------------

export enum MetricType {
  PROOF_TIME         = 'proof_time',
  CACHE_HIT          = 'cache_hit',
  CACHE_MISS         = 'cache_miss',
  MEMORY_USAGE       = 'memory_usage',
  FORMULA_COMPLEXITY = 'formula_complexity',
  STRATEGY_SELECTION = 'strategy_selection',
  SUCCESS            = 'success',
  FAILURE            = 'failure',
  ZKP_VERIFICATION   = 'zkp_verification',
}

// ---------------------------------------------------------------------------
// ProofMetrics
// ---------------------------------------------------------------------------

export interface ProofMetrics {
  /** Unix epoch seconds */
  timestamp: number;
  formulaStr: string;
  formulaComplexity: number;
  proofTimeMs: number;
  success: boolean;
  method: string;
  strategy: string;
  cacheHit: boolean;
  memoryUsageMb: number;
  numSteps: number;
  /** 'temporal' | 'deontic' | 'modal' | 'propositional' */
  formulaType: string;
  metadata: Record<string, unknown>;
}

export function makeProofMetrics(partial: Partial<ProofMetrics> & { formulaStr: string }): ProofMetrics {
  return {
    timestamp: Date.now() / 1000,
    formulaComplexity: 0,
    proofTimeMs: 0,
    success: false,
    method: 'unknown',
    strategy: 'unknown',
    cacheHit: false,
    memoryUsageMb: 0,
    numSteps: 0,
    formulaType: 'propositional',
    metadata: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// TimeSeriesMetric
// ---------------------------------------------------------------------------

export interface TimeSeriesMetric {
  timestamp: number;
  metricName: string;
  value: number;
  tags: Record<string, string>;
}

// ---------------------------------------------------------------------------
// AggregatedStats
// ---------------------------------------------------------------------------

export interface AggregatedStats {
  totalProofs: number;
  successfulProofs: number;
  failedProofs: number;
  cacheHits: number;
  cacheMisses: number;
  /** Proof times in ms */
  totalProofTimeMs: number;
  minProofTimeMs: number;
  maxProofTimeMs: number;
  avgProofTimeMs: number;
  medianProofTimeMs: number;
  p95ProofTimeMs: number;
  p99ProofTimeMs: number;
  /** Rates */
  successRate: number;
  cacheHitRate: number;
  /** Formula stats */
  avgFormulaComplexity: number;
  avgProofSteps: number;
  avgMemoryUsageMb: number;
  maxMemoryUsageMb: number;
  /** Strategy breakdown: strategy → count */
  strategyCounts: Record<string, number>;
  /** Formula type breakdown: type → count */
  formulaTypeCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// PerformanceDashboard
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export class PerformanceDashboard {
  private metrics: ProofMetrics[] = [];
  private timeSeries: TimeSeriesMetric[] = [];

  /** Record a single proof attempt. */
  record(m: ProofMetrics): void {
    this.metrics.push(m);
    // Emit proof_time time-series point
    this.timeSeries.push({
      timestamp: m.timestamp,
      metricName: MetricType.PROOF_TIME,
      value: m.proofTimeMs,
      tags: { strategy: m.strategy, formulaType: m.formulaType },
    });
  }

  /** Record a named time-series metric directly. */
  recordMetric(name: MetricType | string, value: number, tags: Record<string, string> = {}): void {
    this.timeSeries.push({ timestamp: Date.now() / 1000, metricName: name, value, tags });
  }

  /** Compute aggregate statistics over all recorded proof attempts. */
  getAggregatedStats(): AggregatedStats {
    const n = this.metrics.length;
    if (n === 0) {
      return {
        totalProofs: 0, successfulProofs: 0, failedProofs: 0,
        cacheHits: 0, cacheMisses: 0,
        totalProofTimeMs: 0, minProofTimeMs: 0, maxProofTimeMs: 0,
        avgProofTimeMs: 0, medianProofTimeMs: 0, p95ProofTimeMs: 0, p99ProofTimeMs: 0,
        successRate: 0, cacheHitRate: 0,
        avgFormulaComplexity: 0, avgProofSteps: 0, avgMemoryUsageMb: 0, maxMemoryUsageMb: 0,
        strategyCounts: {}, formulaTypeCounts: {},
      };
    }

    const successful = this.metrics.filter(m => m.success).length;
    const cacheHits = this.metrics.filter(m => m.cacheHit).length;
    const times = this.metrics.map(m => m.proofTimeMs).sort((a, b) => a - b);
    const totalTime = times.reduce((s, v) => s + v, 0);
    const strategyCounts: Record<string, number> = {};
    const formulaTypeCounts: Record<string, number> = {};
    let sumComplexity = 0, sumSteps = 0, sumMem = 0, maxMem = 0;

    for (const m of this.metrics) {
      strategyCounts[m.strategy] = (strategyCounts[m.strategy] ?? 0) + 1;
      formulaTypeCounts[m.formulaType] = (formulaTypeCounts[m.formulaType] ?? 0) + 1;
      sumComplexity += m.formulaComplexity;
      sumSteps += m.numSteps;
      sumMem += m.memoryUsageMb;
      if (m.memoryUsageMb > maxMem) maxMem = m.memoryUsageMb;
    }

    return {
      totalProofs: n,
      successfulProofs: successful,
      failedProofs: n - successful,
      cacheHits,
      cacheMisses: n - cacheHits,
      totalProofTimeMs: totalTime,
      minProofTimeMs: times[0],
      maxProofTimeMs: times[times.length - 1],
      avgProofTimeMs: totalTime / n,
      medianProofTimeMs: percentile(times, 50),
      p95ProofTimeMs: percentile(times, 95),
      p99ProofTimeMs: percentile(times, 99),
      successRate: successful / n,
      cacheHitRate: cacheHits / n,
      avgFormulaComplexity: sumComplexity / n,
      avgProofSteps: sumSteps / n,
      avgMemoryUsageMb: sumMem / n,
      maxMemoryUsageMb: maxMem,
      strategyCounts,
      formulaTypeCounts,
    };
  }

  /** Return all time-series data points, optionally filtered by metric name. */
  getTimeSeries(metricName?: string): TimeSeriesMetric[] {
    if (!metricName) return [...this.timeSeries];
    return this.timeSeries.filter(t => t.metricName === metricName);
  }

  /** Return all raw ProofMetrics records. */
  getMetrics(): ProofMetrics[] {
    return [...this.metrics];
  }

  /** Export the dashboard as a JSON string. */
  exportJson(indent = 2): string {
    return JSON.stringify({
      aggregated: this.getAggregatedStats(),
      metrics: this.metrics,
      time_series: this.timeSeries,
    }, null, indent);
  }

  /** Reset all recorded data. */
  reset(): void {
    this.metrics = [];
    this.timeSeries = [];
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _globalDashboard: PerformanceDashboard | null = null;

export function getGlobalDashboard(): PerformanceDashboard {
  if (!_globalDashboard) _globalDashboard = new PerformanceDashboard();
  return _globalDashboard;
}

export function resetGlobalDashboard(): void {
  _globalDashboard = null;
}

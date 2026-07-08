/**
 * performance-profiler.ts
 *
 * Performance profiling utilities.
 * TypeScript port of ipfs_datasets_py/logic/TDFOL/performance_profiler.py
 *
 * Provides:
 *   ProfilingStats     — timing statistics for a series of runs
 *   BenchmarkResult    — named benchmark outcome with bottlenecks
 *   PerformanceProfiler — run a function N times and collect stats
 *   ProfileBlock       — synchronous context-like profiler
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum ReportFormat { TEXT = 'text', JSON = 'json' }

export enum BottleneckSeverity {
  CRITICAL = 'critical',  // > 1 000 ms
  HIGH     = 'high',      // > 100 ms
  MEDIUM   = 'medium',    // > 10 ms
  LOW      = 'low',       // > 1 ms
}

// ---------------------------------------------------------------------------
// ProfilingStats
// ---------------------------------------------------------------------------

export interface ProfilingStats {
  /** Name / label for the profiled operation. */
  name: string;
  /** Total elapsed time across all runs (ms). */
  totalTimeMs: number;
  /** Mean elapsed time per run (ms). */
  meanTimeMs: number;
  /** Median elapsed time (ms). */
  medianTimeMs: number;
  /** Minimum single-run time (ms). */
  minTimeMs: number;
  /** Maximum single-run time (ms). */
  maxTimeMs: number;
  /** Population standard deviation (ms). */
  stdDevMs: number;
  /** Number of runs. */
  runs: number;
  /** Estimated operations per second (1 / mean_s), or 0 when mean is 0. */
  opsPerSecond: number;
  /** Raw per-run elapsed times in ms. */
  samples: number[];
}

// ---------------------------------------------------------------------------
// Bottleneck
// ---------------------------------------------------------------------------

export interface Bottleneck {
  name: string;
  meanTimeMs: number;
  severity: BottleneckSeverity;
  description: string;
}

// ---------------------------------------------------------------------------
// BenchmarkResult
// ---------------------------------------------------------------------------

export interface BenchmarkResult {
  name: string;
  stats: ProfilingStats;
  bottlenecks: Bottleneck[];
}

// ---------------------------------------------------------------------------
// PerformanceProfiler
// ---------------------------------------------------------------------------

function computeStats(name: string, samples: number[]): ProfilingStats {
  if (samples.length === 0) {
    return { name, totalTimeMs: 0, meanTimeMs: 0, medianTimeMs: 0, minTimeMs: 0, maxTimeMs: 0, stdDevMs: 0, runs: 0, opsPerSecond: 0, samples: [] };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((s, v) => s + v, 0);
  const mean = total / samples.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);
  const opsPerSecond = mean > 0 ? 1000 / mean : 0;

  return {
    name,
    totalTimeMs: total,
    meanTimeMs: mean,
    medianTimeMs: median,
    minTimeMs: sorted[0],
    maxTimeMs: sorted[sorted.length - 1],
    stdDevMs: stdDev,
    runs: samples.length,
    opsPerSecond,
    samples,
  };
}

function detectBottleneck(stats: ProfilingStats): Bottleneck | null {
  const { meanTimeMs, name } = stats;
  if (meanTimeMs > 1000) {
    return { name, meanTimeMs, severity: BottleneckSeverity.CRITICAL, description: `Mean ${meanTimeMs.toFixed(1)} ms exceeds 1 s` };
  }
  if (meanTimeMs > 100) {
    return { name, meanTimeMs, severity: BottleneckSeverity.HIGH, description: `Mean ${meanTimeMs.toFixed(1)} ms exceeds 100 ms` };
  }
  if (meanTimeMs > 10) {
    return { name, meanTimeMs, severity: BottleneckSeverity.MEDIUM, description: `Mean ${meanTimeMs.toFixed(1)} ms exceeds 10 ms` };
  }
  if (meanTimeMs > 1) {
    return { name, meanTimeMs, severity: BottleneckSeverity.LOW, description: `Mean ${meanTimeMs.toFixed(1)} ms exceeds 1 ms` };
  }
  return null;
}

export class PerformanceProfiler {
  private history: Map<string, ProfilingStats[]> = new Map();

  /**
   * Run `fn` `runs` times synchronously and return timing statistics.
   *
   * @param name  Label for this operation.
   * @param fn    The function to benchmark (sync only).
   * @param runs  Number of repetitions (default 10).
   */
  profile(name: string, fn: () => unknown, runs = 10): ProfilingStats {
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      fn();
      samples.push(performance.now() - start);
    }
    const stats = computeStats(name, samples);
    if (!this.history.has(name)) this.history.set(name, []);
    this.history.get(name)!.push(stats);
    return stats;
  }

  /**
   * Run `fn` `runs` times asynchronously and return timing statistics.
   */
  async profileAsync(name: string, fn: () => Promise<unknown>, runs = 10): Promise<ProfilingStats> {
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await fn();
      samples.push(performance.now() - start);
    }
    const stats = computeStats(name, samples);
    if (!this.history.has(name)) this.history.set(name, []);
    this.history.get(name)!.push(stats);
    return stats;
  }

  /** Return all previously collected stats for `name`. */
  getHistory(name: string): ProfilingStats[] {
    return this.history.get(name) ?? [];
  }

  /** Format a ProfilingStats as a human-readable string. */
  formatReport(stats: ProfilingStats, format: ReportFormat = ReportFormat.TEXT): string {
    if (format === ReportFormat.JSON) {
      return JSON.stringify({ ...stats, samples: undefined }, null, 2);
    }
    return [
      `=== ${stats.name} ===`,
      `  Runs:       ${stats.runs}`,
      `  Total:      ${stats.totalTimeMs.toFixed(3)} ms`,
      `  Mean:       ${stats.meanTimeMs.toFixed(3)} ms`,
      `  Median:     ${stats.medianTimeMs.toFixed(3)} ms`,
      `  Min:        ${stats.minTimeMs.toFixed(3)} ms`,
      `  Max:        ${stats.maxTimeMs.toFixed(3)} ms`,
      `  Std Dev:    ${stats.stdDevMs.toFixed(3)} ms`,
      `  Ops/sec:    ${stats.opsPerSecond.toFixed(1)}`,
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// benchmarkProviders
// ---------------------------------------------------------------------------

/**
 * Benchmark a function against a list of named items.
 * Returns one BenchmarkResult per item.
 */
export function benchmarkProviders<T>(
  items: Array<{ name: string; value: T }>,
  fn: (item: T) => unknown,
  runs = 10,
): BenchmarkResult[] {
  const profiler = new PerformanceProfiler();
  return items.map(({ name, value }) => {
    const stats = profiler.profile(name, () => fn(value), runs);
    const b = detectBottleneck(stats);
    return { name, stats, bottlenecks: b ? [b] : [] };
  });
}

// ---------------------------------------------------------------------------
// ProfileBlock — synchronous "with" context replacement
// ---------------------------------------------------------------------------

/**
 * A lightweight synchronous profiler block.
 *
 * @example
 *   const block = new ProfileBlock('my-op');
 *   doWork();
 *   const elapsed = block.stop();  // ms
 */
export class ProfileBlock {
  private startMs: number;
  private stopped = false;
  private elapsedMs = 0;

  constructor(readonly name: string) {
    this.startMs = performance.now();
  }

  /** Stop the timer and return elapsed ms. Idempotent. */
  stop(): number {
    if (!this.stopped) {
      this.elapsedMs = performance.now() - this.startMs;
      this.stopped = true;
    }
    return this.elapsedMs;
  }

  get elapsed(): number {
    return this.stopped ? this.elapsedMs : performance.now() - this.startMs;
  }
}

// PORT-083: @profile_this decorator equivalent (TypeScript method decorator)
export function profileThis(label?: string) {
  return function(target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    descriptor.value = function(...args: unknown[]) {
      const start = performance.now();
      const result = original.apply(this, args);
      const elapsed = performance.now() - start;
      console.debug(`[ProfileThis] ${label ?? propertyKey}: ${elapsed.toFixed(2)}ms`);
      return result;
    };
    return descriptor;
  };
}

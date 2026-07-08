/**
 * TDFOL Performance Metrics — T-201
 *
 * Port of ipfs_datasets_py/logic/TDFOL/performance_metrics.py
 *
 * Unified metrics collection for timing, memory, and statistical aggregation.
 * Consolidates previously-duplicated logic from performance_profiler.ts and
 * performance_dashboard.ts into a single well-tested implementation.
 */

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/** Result of a single timing operation. */
export interface TimingResult {
  readonly name: string;
  readonly durationMs: number;
  readonly timestamp: number; // Unix epoch seconds
  readonly metadata: Record<string, unknown>;
}

/** Result of a memory snapshot operation. */
export interface MemoryResult {
  readonly name: string;
  readonly currentMb: number;
  readonly peakMb: number;
  readonly deltaMb: number;
  readonly timestamp: number;
  readonly metadata: Record<string, unknown>;
}

/** Statistical summary of a numeric sample. */
export interface StatisticalSummary {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly median: number;
  readonly stdDev: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly p999: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Linear interpolation percentile on a pre-sorted array. */
function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const k = (sorted.length - 1) * pct / 100;
  const f = Math.floor(k);
  const c = f + 1;
  if (c >= sorted.length) return sorted[sorted.length - 1];
  return sorted[f] * (c - k) + sorted[c] * (k - f);
}

/** Build a StatisticalSummary from an array of numbers. */
function calculateStats(values: number[]): StatisticalSummary {
  if (values.length === 0) {
    return { count: 0, sum: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, p999: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median = percentile(sorted, 50);
  const variance = count > 1
    ? sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (count - 1)
    : 0;
  return {
    count,
    sum,
    mean,
    median,
    stdDev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[count - 1],
    p50: median,
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    p999: percentile(sorted, 99.9),
  };
}

/** Bounded circular buffer (mimics Python deque(maxlen=…)). */
class BoundedBuffer<T> {
  private buf: T[] = [];
  constructor(private readonly maxLen: number) {}

  push(item: T): void {
    if (this.buf.length >= this.maxLen) this.buf.shift();
    this.buf.push(item);
  }

  toArray(): T[] {
    return this.buf.slice();
  }

  get length(): number {
    return this.buf.length;
  }
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

/**
 * Unified metrics collector for timing, memory, counters, gauges, and histograms.
 *
 * This is the TypeScript port of `MetricsCollector` from
 * `ipfs_datasets_py/logic/TDFOL/performance_metrics.py`.
 */
export class MetricsCollector {
  private readonly maxLen: number;

  // Timing
  private readonly timings = new Map<string, BoundedBuffer<number>>();
  private readonly timingResults: TimingResult[] = [];

  // Memory snapshots  { name → BoundedBuffer<{currentMb, peakMb, deltaMb}> }
  private readonly memorySnapshots = new Map<string, BoundedBuffer<{ currentMb: number; peakMb: number; deltaMb: number }>>();
  private readonly memoryResults: MemoryResult[] = [];

  // Counters / gauges
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  // Histograms
  private readonly histograms = new Map<string, BoundedBuffer<number>>();

  // Manual timer start times
  private readonly timerStarts = new Map<string, number>();

  constructor(maxLen = 10_000) {
    this.maxLen = maxLen;
  }

  // -------------------------------------------------------------------------
  // Timing
  // -------------------------------------------------------------------------

  /** Time a synchronous callback and record the duration under `name`. */
  timeSync<T>(name: string, fn: () => T, metadata: Record<string, unknown> = {}): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.recordTiming(name, performance.now() - start, metadata);
    }
  }

  /** Time an async callback and record the duration under `name`. */
  async timeAsync<T>(name: string, fn: () => Promise<T>, metadata: Record<string, unknown> = {}): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.recordTiming(name, performance.now() - start, metadata);
    }
  }

  startTimer(name: string): void {
    this.timerStarts.set(name, performance.now());
  }

  stopTimer(name: string, metadata: Record<string, unknown> = {}): number {
    const start = this.timerStarts.get(name);
    if (start === undefined) throw new Error(`Timer '${name}' was not started`);
    this.timerStarts.delete(name);
    const durationMs = performance.now() - start;
    this.recordTiming(name, durationMs, metadata);
    return durationMs;
  }

  recordTiming(name: string, durationMs: number, metadata: Record<string, unknown> = {}): void {
    if (!this.timings.has(name)) this.timings.set(name, new BoundedBuffer(this.maxLen));
    this.timings.get(name)!.push(durationMs);
    this.timingResults.push({ name, durationMs, timestamp: Date.now() / 1000, metadata });
  }

  // -------------------------------------------------------------------------
  // Memory (process.memoryUsage where available)
  // -------------------------------------------------------------------------

  /** Record a memory snapshot for an async callback. Approximates Python tracemalloc. */
  async trackMemoryAsync<T>(name: string, fn: () => Promise<T>, metadata: Record<string, unknown> = {}): Promise<T> {
    const startHeap = this._heapUsedMb();
    let peakMb = startHeap;
    const interval = setInterval(() => {
      const current = this._heapUsedMb();
      if (current > peakMb) peakMb = current;
    }, 50);
    try {
      return await fn();
    } finally {
      clearInterval(interval);
      const endHeap = this._heapUsedMb();
      this.recordMemory(name, endHeap, Math.max(peakMb, endHeap), endHeap - startHeap, metadata);
    }
  }

  recordMemory(name: string, currentMb: number, peakMb: number, deltaMb: number, metadata: Record<string, unknown> = {}): void {
    if (!this.memorySnapshots.has(name)) {
      this.memorySnapshots.set(name, new BoundedBuffer(this.maxLen));
    }
    this.memorySnapshots.get(name)!.push({ currentMb, peakMb, deltaMb });
    this.memoryResults.push({ name, currentMb, peakMb, deltaMb, timestamp: Date.now() / 1000, metadata });
  }

  private _heapUsedMb(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024;
    }
    return 0;
  }

  // -------------------------------------------------------------------------
  // Counters / Gauges / Histograms
  // -------------------------------------------------------------------------

  incrementCounter(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) this.histograms.set(name, new BoundedBuffer(this.maxLen));
    this.histograms.get(name)!.push(value);
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  getTimingStats(name: string): StatisticalSummary | null {
    const buf = this.timings.get(name);
    if (!buf || buf.length === 0) return null;
    return calculateStats(buf.toArray());
  }

  getMemoryStats(name: string, field: 'deltaMb' | 'peakMb' | 'currentMb' = 'deltaMb'): StatisticalSummary | null {
    const buf = this.memorySnapshots.get(name);
    if (!buf || buf.length === 0) return null;
    return calculateStats(buf.toArray().map(s => s[field]));
  }

  getHistogramStats(name: string): StatisticalSummary | null {
    const buf = this.histograms.get(name);
    if (!buf || buf.length === 0) return null;
    return calculateStats(buf.toArray());
  }

  /** Comprehensive statistics export. */
  getStatistics(): Record<string, unknown> {
    const timing: Record<string, unknown> = {};
    for (const [name] of this.timings) {
      const s = this.getTimingStats(name);
      if (s) timing[name] = s;
    }

    const memory: Record<string, unknown> = {};
    for (const [name] of this.memorySnapshots) {
      memory[name] = {
        deltaMb: this.getMemoryStats(name, 'deltaMb'),
        peakMb: this.getMemoryStats(name, 'peakMb'),
        currentMb: this.getMemoryStats(name, 'currentMb'),
      };
    }

    const histogramsOut: Record<string, unknown> = {};
    for (const [name] of this.histograms) {
      const s = this.getHistogramStats(name);
      if (s) histogramsOut[name] = s;
    }

    return {
      timing,
      memory,
      histograms: histogramsOut,
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      metadata: {
        collectorMaxLen: this.maxLen,
        totalTimingSamples: [...this.timings.values()].reduce((a, b) => a + b.length, 0),
        totalMemorySamples: [...this.memorySnapshots.values()].reduce((a, b) => a + b.length, 0),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /** Export last 1 000 raw results plus statistics (for MCP dashboard). */
  exportDict(): Record<string, unknown> {
    return {
      statistics: this.getStatistics(),
      timingResults: this.timingResults.slice(-1000),
      memoryResults: this.memoryResults.slice(-1000),
    };
  }

  reset(): void {
    this.timings.clear();
    this.timingResults.length = 0;
    this.memorySnapshots.clear();
    this.memoryResults.length = 0;
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timerStarts.clear();
  }
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

let _globalCollector: MetricsCollector | null = null;

export function getGlobalCollector(): MetricsCollector {
  if (!_globalCollector) _globalCollector = new MetricsCollector();
  return _globalCollector;
}

export function resetGlobalCollector(): void {
  _globalCollector = null;
}

/**
 * LogicMonitor — operation tracking and metrics for the logic/prover stack.
 *
 * Mirrors ipfs_datasets_py/logic/monitoring.py (452 lines):
 *   class MetricType
 *   class OperationMetrics
 *   class LogicMonitor
 *   def get_global_monitor()
 *
 * T-100.
 * Reference: ipfs_datasets_py/logic/monitoring.py §LogicMonitor
 */

// ---------------------------------------------------------------------------
// Metric types
// ---------------------------------------------------------------------------

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/** Metrics for a specific operation type. */
export interface OperationMetrics {
  readonly total_count:    number;
  readonly success_count:  number;
  readonly failure_count:  number;
  readonly total_time_ms:  number;
  readonly min_time_ms:    number;
  readonly max_time_ms:    number;
  readonly success_rate:   number;
  readonly avg_time_ms:    number;
  /** Moving average over last `windowSize` operations. */
  readonly recent_avg_ms:  number;
}

export interface HealthStatus {
  readonly status:      'healthy' | 'degraded' | 'unhealthy';
  readonly operations:  Record<string, { success_rate: number; avg_time_ms: number }>;
  readonly error_count: number;
  readonly uptime_ms:   number;
}

export interface MetricsSnapshot {
  readonly operations:   Record<string, OperationMetrics>;
  readonly errors:       Array<{ category: string; message: string; timestamp: number }>;
  readonly total_calls:  number;
  readonly uptime_ms:    number;
}

// ---------------------------------------------------------------------------
// Internal mutable metrics accumulator
// ---------------------------------------------------------------------------

class MutableMetrics {
  total_count    = 0;
  success_count  = 0;
  failure_count  = 0;
  total_time_ms  = 0;
  min_time_ms    = Infinity;
  max_time_ms    = 0;
  readonly recent_times: number[] = [];
  readonly window_size   = 100;

  record(success: boolean, durationMs: number): void {
    this.total_count++;
    if (success) this.success_count++; else this.failure_count++;
    this.total_time_ms += durationMs;
    this.min_time_ms    = Math.min(this.min_time_ms, durationMs);
    this.max_time_ms    = Math.max(this.max_time_ms, durationMs);
    this.recent_times.push(durationMs);
    if (this.recent_times.length > this.window_size) this.recent_times.shift();
  }

  snapshot(): OperationMetrics {
    const avg  = this.total_count > 0 ? this.total_time_ms / this.total_count : 0;
    const rAvg = this.recent_times.length > 0
      ? this.recent_times.reduce((a, b) => a + b, 0) / this.recent_times.length
      : 0;
    return {
      total_count:   this.total_count,
      success_count: this.success_count,
      failure_count: this.failure_count,
      total_time_ms: this.total_time_ms,
      min_time_ms:   this.min_time_ms === Infinity ? 0 : this.min_time_ms,
      max_time_ms:   this.max_time_ms,
      success_rate:  this.total_count > 0 ? this.success_count / this.total_count : 0,
      avg_time_ms:   avg,
      recent_avg_ms: rAvg,
    };
  }

  reset(): void {
    this.total_count = this.success_count = this.failure_count = 0;
    this.total_time_ms = this.max_time_ms = 0;
    this.min_time_ms = Infinity;
    this.recent_times.length = 0;
  }
}

// ---------------------------------------------------------------------------
// LogicMonitor
// ---------------------------------------------------------------------------

/**
 * LogicMonitor — tracks operations and collects metrics across the logic stack.
 *
 * Usage:
 * ```ts
 * const monitor = LogicMonitor.getInstance();
 * const result = await monitor.trackOperation('fol_conversion', async () => {
 *   return converter.convert(text);
 * });
 * const metrics = monitor.getMetrics();
 * console.log(metrics.operations['fol_conversion']?.success_rate);
 * ```
 */
export class LogicMonitor {
  private readonly _ops    = new Map<string, MutableMetrics>();
  private readonly _errors: Array<{ category: string; message: string; timestamp: number }> = [];
  private readonly _start  = Date.now();

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Track an async operation.  Records duration and success/failure.
   *
   * Python ref: `LogicMonitor.track_operation(operation)` context manager.
   */
  async trackOperation<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    let success = false;
    try {
      const result = await fn();
      success = true;
      return result;
    } catch (err) {
      this.recordError(operation, err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      const elapsed = Date.now() - start;
      if (!this._ops.has(operation)) this._ops.set(operation, new MutableMetrics());
      this._ops.get(operation)!.record(success, elapsed);
    }
  }

  /**
   * Synchronous variant of `trackOperation` for non-async code paths.
   */
  trackSync<T>(operation: string, fn: () => T): T {
    const start = Date.now();
    let success = false;
    try {
      const result = fn();
      success = true;
      return result;
    } catch (err) {
      this.recordError(operation, err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      const elapsed = Date.now() - start;
      if (!this._ops.has(operation)) this._ops.set(operation, new MutableMetrics());
      this._ops.get(operation)!.record(success, elapsed);
    }
  }

  /** Manually record an error.  Python ref: `LogicMonitor.record_error()`. */
  recordError(category: string, message: string): void {
    this._errors.push({ category, message, timestamp: Date.now() });
    // Keep last 500 errors
    if (this._errors.length > 500) this._errors.shift();
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  /** Return a snapshot of all collected metrics.  Python ref: `get_metrics()`. */
  getMetrics(): MetricsSnapshot {
    const operations: Record<string, OperationMetrics> = {};
    for (const [name, m] of this._ops) operations[name] = m.snapshot();
    return {
      operations,
      errors:      [...this._errors],
      total_calls: [...this._ops.values()].reduce((s, m) => s + m.total_count, 0),
      uptime_ms:   Date.now() - this._start,
    };
  }

  /** Return health status (healthy / degraded / unhealthy). */
  getHealthStatus(): HealthStatus {
    const ops: Record<string, { success_rate: number; avg_time_ms: number }> = {};
    let minRate = 1;

    for (const [name, m] of this._ops) {
      const snap = m.snapshot();
      ops[name] = { success_rate: snap.success_rate, avg_time_ms: snap.avg_time_ms };
      if (snap.total_count > 0) minRate = Math.min(minRate, snap.success_rate);
    }

    const status: HealthStatus['status'] =
      minRate >= 0.95 ? 'healthy' : minRate >= 0.7 ? 'degraded' : 'unhealthy';

    return {
      status,
      operations:  ops,
      error_count: this._errors.length,
      uptime_ms:   Date.now() - this._start,
    };
  }

  /** Reset all collected metrics. */
  resetMetrics(): void {
    for (const m of this._ops.values()) m.reset();
    this._errors.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static _instance: LogicMonitor | null = null;

  /** Return the process-global monitor instance. */
  static getInstance(): LogicMonitor {
    if (!LogicMonitor._instance) LogicMonitor._instance = new LogicMonitor();
    return LogicMonitor._instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    LogicMonitor._instance = null;
  }
}

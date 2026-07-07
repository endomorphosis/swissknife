/**
 * Utility Monitor — PORT-204
 *
 * Port of ipfs_datasets_py/logic/common/utility_monitor.py.
 *
 * Dedicated common-module performance monitor for lightweight operation timing,
 * cached calls, and process-wide utility statistics.
 */

export interface CallRecord {
  name: string;
  durationMs: number;
  timestamp: number;
  cached: boolean;
  success: boolean;
  error?: string;
}

export interface OperationStats {
  name: string;
  calls: number;
  failures: number;
  cacheHits: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

export interface GlobalStats {
  totalCalls: number;
  totalMs: number;
  cacheHits: number;
  cacheSize: number;
  failures: number;
}

const globalRecords: CallRecord[] = [];
const globalCache = new Map<string, unknown>();

export class UtilityMonitor {
  private readonly records: CallRecord[] = [];
  private readonly cache = new Map<string, unknown>();

  track<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    try {
      const result = fn();
      this.record(name, performance.now() - t0, false, true);
      return result;
    } catch (err) {
      this.record(name, performance.now() - t0, false, false, err);
      throw err;
    }
  }

  async trackAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      const result = await fn();
      this.record(name, performance.now() - t0, false, true);
      return result;
    } catch (err) {
      this.record(name, performance.now() - t0, false, false, err);
      throw err;
    }
  }

  cachedCall<T>(key: string, fn: () => T): T {
    if (this.cache.has(key)) {
      this.record(key, 0, true, true);
      return this.cache.get(key) as T;
    }
    const result = this.track(key, fn);
    this.cache.set(key, result);
    return result;
  }

  async cachedCallAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) {
      this.record(key, 0, true, true);
      return this.cache.get(key) as T;
    }
    const result = await this.trackAsync(key, fn);
    this.cache.set(key, result);
    return result;
  }

  getRecords(): CallRecord[] {
    return [...this.records];
  }

  getStats(name?: string): OperationStats[] | OperationStats | null {
    const records = name ? this.records.filter(r => r.name === name) : this.records;
    if (name && records.length === 0) return null;
    const stats = summarizeRecords(records);
    return name ? stats[0] ?? null : stats;
  }

  getSummary(): GlobalStats {
    return summarizeGlobal(this.records, this.cache.size);
  }

  clearCache(): void {
    this.cache.clear();
  }

  reset(): void {
    this.records.length = 0;
    this.cache.clear();
  }

  private record(name: string, durationMs: number, cached: boolean, success: boolean, err?: unknown): void {
    const record: CallRecord = {
      name,
      durationMs,
      timestamp: Date.now(),
      cached,
      success,
      error: err instanceof Error ? err.message : err === undefined ? undefined : String(err),
    };
    this.records.push(record);
  }
}

export function trackPerformance<T extends (...args: unknown[]) => unknown>(fn: T, name = fn.name || 'anonymous'): T {
  return ((...args: unknown[]) => {
    const t0 = performance.now();
    try {
      const result = fn(...args);
      globalRecords.push(makeRecord(name, performance.now() - t0, false, true));
      return result;
    } catch (err) {
      globalRecords.push(makeRecord(name, performance.now() - t0, false, false, err));
      throw err;
    }
  }) as T;
}

export function withCaching<T>(key: string, fn: () => T): T {
  if (globalCache.has(key)) {
    globalRecords.push(makeRecord(key, 0, true, true));
    return globalCache.get(key) as T;
  }
  const t0 = performance.now();
  try {
    const result = fn();
    globalCache.set(key, result);
    globalRecords.push(makeRecord(key, performance.now() - t0, false, true));
    return result;
  } catch (err) {
    globalRecords.push(makeRecord(key, performance.now() - t0, false, false, err));
    throw err;
  }
}

export function getGlobalStats(): GlobalStats {
  return summarizeGlobal(globalRecords, globalCache.size);
}

export function getGlobalRecords(): CallRecord[] {
  return [...globalRecords];
}

export function clearGlobalCache(): void {
  globalCache.clear();
}

export function resetGlobalStats(): void {
  globalRecords.length = 0;
}

function summarizeRecords(records: CallRecord[]): OperationStats[] {
  const grouped = new Map<string, CallRecord[]>();
  for (const record of records) {
    const group = grouped.get(record.name) ?? [];
    group.push(record);
    grouped.set(record.name, group);
  }

  return Array.from(grouped, ([name, group]) => {
    const durations = group.map(r => r.durationMs);
    const totalMs = durations.reduce((sum, value) => sum + value, 0);
    return {
      name,
      calls: group.length,
      failures: group.filter(r => !r.success).length,
      cacheHits: group.filter(r => r.cached).length,
      totalMs,
      minMs: durations.length ? Math.min(...durations) : 0,
      maxMs: durations.length ? Math.max(...durations) : 0,
      avgMs: group.length ? totalMs / group.length : 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeGlobal(records: CallRecord[], cacheSize: number): GlobalStats {
  return {
    totalCalls: records.length,
    totalMs: records.reduce((sum, record) => sum + record.durationMs, 0),
    cacheHits: records.filter(record => record.cached).length,
    cacheSize,
    failures: records.filter(record => !record.success).length,
  };
}

function makeRecord(name: string, durationMs: number, cached: boolean, success: boolean, err?: unknown): CallRecord {
  return {
    name,
    durationMs,
    timestamp: Date.now(),
    cached,
    success,
    error: err instanceof Error ? err.message : err === undefined ? undefined : String(err),
  };
}

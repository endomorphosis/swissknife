/**
 * Sprint 66 — Prover Utils: Strategy Selector + Vampire Adapter + Utility Monitor + Lazy Installer
 * Ports of: TDFOL/strategies/strategy_selector.py (256L),
 *           CEC/provers/vampire_adapter.py (239L),
 *           common/utility_monitor.py (231L),
 *           external_provers/lazy_installer.py (229L)
 */

// ---------------------------------------------------------------------------
// T-308a — Strategy Selector (strategy_selector.py)
// ---------------------------------------------------------------------------

export type ProverStrategy = 'resolution' | 'tableaux' | 'forward_chaining' | 'backward_chaining' | 'model_checking';

export interface FormulaFeatures {
  hasQuantifiers: boolean;
  hasDeonticOps: boolean;
  hasTemporalOps: boolean;
  numClauses: number;
  depth: number;
}

export class StrategySelector {
  select(formula: string, features?: FormulaFeatures): ProverStrategy {
    const f: FormulaFeatures = features ?? this._analyzeFormula(formula);
    if (f.hasTemporalOps) return 'model_checking';
    if (f.hasDeonticOps)  return 'tableaux';
    if (f.hasQuantifiers) return 'resolution';
    if (f.numClauses > 10) return 'forward_chaining';
    return 'resolution';
  }

  selectForBatch(formulas: string[]): ProverStrategy {
    const strategies = formulas.map(f => this.select(f));
    // Most frequent
    const counts = new Map<ProverStrategy, number>();
    for (const s of strategies) counts.set(s, (counts.get(s) ?? 0) + 1);
    let best: ProverStrategy = 'resolution';
    let max = 0;
    for (const [s, c] of counts) { if (c > max) { max = c; best = s; } }
    return best;
  }

  private _analyzeFormula(formula: string): FormulaFeatures {
    return {
      hasQuantifiers: /∀|∃|\bforall\b|\bexists\b/.test(formula),
      hasDeonticOps:  /\bO\(|\bP\(|\bF\(/.test(formula),
      hasTemporalOps: /\bG\b|\bF\b|\bX\b|\bU\b|\bS\b/.test(formula),
      numClauses:     (formula.match(/∧|∨|&|\|/g) ?? []).length + 1,
      depth:          Math.max(0, ...([...formula].map((c, i, a) =>
                        a.slice(0, i + 1).reduce((d, ch) => d + (ch === '(' ? 1 : ch === ')' ? -1 : 0), 0)
                      ))),
    };
  }
}

// ---------------------------------------------------------------------------
// T-308b — Vampire Adapter (vampire_adapter.py)
// ---------------------------------------------------------------------------

export interface VampireProofResult {
  isProved: boolean;
  status:   string;   // SZS_Theorem | SZS_Unsatisfiable | SZS_GaveUp | ...
  proof:    string;
  cpuTime:  number;
  error?:   string;
}

export interface VampireStats { totalProofs: number; succeeded: number; failed: number; avgCpuTime: number }

export class VampireAdapter {
  private readonly stats: VampireStats = { totalProofs: 0, succeeded: 0, failed: 0, avgCpuTime: 0 };

  isAvailable(): boolean {
    try {
      const { execSync } = require('child_process') as { execSync: (cmd: string) => string };
      execSync('vampire --version 2>/dev/null');
      return true;
    } catch { return false; }
  }

  async prove(tptpInput: string, timeoutSec = 30): Promise<VampireProofResult> {
    const t0 = performance.now();
    this.stats.totalProofs++;

    if (!this.isAvailable()) {
      this.stats.failed++;
      return { isProved: false, status: 'SZS_GaveUp', proof: '', cpuTime: 0, error: 'Vampire binary not found' };
    }

    this.stats.failed++;
    const cpuTime = (performance.now() - t0) / 1000;
    this._updateAvg(cpuTime);
    return { isProved: false, status: 'SZS_GaveUp', proof: '', cpuTime, error: 'Vampire FFI not bound' };
  }

  getStats(): Readonly<VampireStats> { return { ...this.stats }; }

  private _updateAvg(t: number): void {
    const n = this.stats.totalProofs;
    this.stats.avgCpuTime = ((n - 1) * this.stats.avgCpuTime + t) / n;
  }
}

export function checkVampireInstallation(): boolean { return new VampireAdapter().isAvailable(); }

// ---------------------------------------------------------------------------
// T-308c — Utility Monitor (utility_monitor.py)
// ---------------------------------------------------------------------------

export interface CallRecord { name: string; durationMs: number; timestamp: number; cached: boolean }
export interface GlobalStats { totalCalls: number; totalMs: number; cacheHits: number; cacheSize: number }

const _globalRecords: CallRecord[] = [];
const _globalCache   = new Map<string, unknown>();

export class UtilityMonitor {
  private readonly records: CallRecord[] = [];
  private readonly cache   = new Map<string, unknown>();

  track<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    const result = fn();
    this.records.push({ name, durationMs: performance.now() - t0, timestamp: Date.now(), cached: false });
    return result;
  }

  cachedCall<T>(key: string, fn: () => T): T {
    if (this.cache.has(key)) {
      this.records.push({ name: key, durationMs: 0, timestamp: Date.now(), cached: true });
      return this.cache.get(key) as T;
    }
    const result = this.track(key, fn);
    this.cache.set(key, result);
    return result;
  }

  getRecords(): CallRecord[] { return [...this.records]; }
  clearCache(): void { this.cache.clear(); }
  reset(): void { this.records.length = 0; this.cache.clear(); }
}

export function trackPerformance<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ((...args: unknown[]) => {
    const t0 = performance.now();
    const result = fn(...args);
    _globalRecords.push({ name: fn.name, durationMs: performance.now() - t0, timestamp: Date.now(), cached: false });
    return result;
  }) as T;
}

export function withCaching<T>(key: string, fn: () => T): T {
  if (_globalCache.has(key)) return _globalCache.get(key) as T;
  const result = fn();
  _globalCache.set(key, result);
  return result;
}

export function getGlobalStats(): GlobalStats {
  const totalMs = _globalRecords.reduce((s, r) => s + r.durationMs, 0);
  const cacheHits = _globalRecords.filter(r => r.cached).length;
  return { totalCalls: _globalRecords.length, totalMs, cacheHits, cacheSize: _globalCache.size };
}

export function clearGlobalCache(): void { _globalCache.clear(); }
export function resetGlobalStats(): void { _globalRecords.length = 0; }

// ---------------------------------------------------------------------------
// T-308d — Lazy Installer (lazy_installer.py)
// ---------------------------------------------------------------------------

export interface LazyInstallResult { installed: boolean; path?: string; error?: string }

export function normalizeProverName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]+/g, '_');
}

export function findExecutable(command: string): string | null {
  try {
    const { execSync } = require('child_process') as { execSync: (cmd: string) => string };
    const path = execSync(`which ${command} 2>/dev/null`).trim();
    return path || null;
  } catch { return null; }
}

export function isLazyInstallEnabled(): boolean {
  const v = (typeof process !== 'undefined' ? process.env['LAZY_INSTALL'] : undefined) ?? '';
  return ['1', 'true', 'yes'].includes(v.toLowerCase());
}

export function isProverLazyInstallEnabled(proverName: string): boolean {
  const key = `LAZY_INSTALL_${normalizeProverName(proverName).toUpperCase()}`;
  const v   = (typeof process !== 'undefined' ? process.env[key] : undefined) ?? '';
  return isLazyInstallEnabled() || ['1', 'true', 'yes'].includes(v.toLowerCase());
}

export async function lazyInstallProver(proverName: string): Promise<LazyInstallResult> {
  const normalized = normalizeProverName(proverName);
  if (!isProverLazyInstallEnabled(normalized)) {
    return { installed: false, error: `Lazy install disabled for ${normalized}` };
  }
  // In a real system, this would invoke a package manager or conda
  const existing = findExecutable(normalized);
  if (existing) return { installed: true, path: existing };
  return { installed: false, error: `${normalized} not found and auto-install not implemented` };
}

const _installAttempts = new Map<string, number>();
export function resetLazyInstallAttempts(): void { _installAttempts.clear(); }

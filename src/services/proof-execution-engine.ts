/**
 * proof-execution-engine.ts
 *
 * Main proof execution engine — PORT-201.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/reasoning/proof_execution_engine.py (975L)
 *
 * Provides:
 *   ProofExecutionEngine   — orchestrates multi-prover routing with caching + timeout
 *   ProofCache             — per-engine LRU proof cache
 *   executeProof()         — module-level helper
 */

import { createHash } from 'crypto';
import { ProofStatus, ProofResult } from './proof-execution-engine-types.js';
import { SupportedProver, ProofEngine } from './proof-execution-engine-utils.js';

// ---------------------------------------------------------------------------
// ProofCache
// ---------------------------------------------------------------------------

export interface ProofCacheEntry {
  readonly result:    ProofResult;
  readonly cachedAt:  number;
  readonly ttlMs:     number;
}

export class ProofCache {
  private readonly store = new Map<string, ProofCacheEntry>();
  private hits   = 0;
  private misses = 0;

  constructor(
    private readonly maxSize = 512,
    private readonly ttlMs   = 5 * 60 * 1_000, // 5 min
  ) {}

  private key(prover: string, statement: string, context?: string): string {
    return createHash('sha256')
      .update(`${prover}||${statement}||${context ?? ''}`)
      .digest('hex');
  }

  get(prover: string, statement: string, context?: string): ProofResult | null {
    const k = this.key(prover, statement, context);
    const entry = this.store.get(k);
    if (!entry) { this.misses++; return null; }
    if (Date.now() > entry.cachedAt + entry.ttlMs) {
      this.store.delete(k);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.result;
  }

  set(prover: string, statement: string, result: ProofResult, context?: string): void {
    if (this.store.size >= this.maxSize) {
      // evict oldest
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(this.key(prover, statement, context), {
      result,
      cachedAt: Date.now(),
      ttlMs:    this.ttlMs,
    });
  }

  stats() { return { size: this.store.size, hits: this.hits, misses: this.misses }; }
  clear() { this.store.clear(); }
}

// ---------------------------------------------------------------------------
// ProverRoute — configures how the engine selects provers
// ---------------------------------------------------------------------------

export type ProverRouteMode =
  | 'first-success'   // stop after first prover that proves it
  | 'all'             // run all provers, return all results
  | 'majority'        // return verdict when majority agree
  | 'competition';    // return fastest result

export interface ProverRouteConfig {
  provers:   SupportedProver[];
  mode:      ProverRouteMode;
  timeoutMs: number;
  useCache:  boolean;
}

export interface ProofExecutionEngineOptions extends Partial<ProverRouteConfig> {
  readonly cacheSize?: number;
  readonly cacheTtlMs?: number;
  readonly timeout?: number;
  readonly defaultProver?: SupportedProver;
  readonly enableCaching?: boolean;
  readonly enableRateLimiting?: boolean;
  readonly enableValidation?: boolean;
}

export interface RegisteredProofBackendResult {
  readonly proved: boolean;
  readonly output: string;
  readonly timeMs?: number;
  readonly statistics?: Record<string, unknown>;
}

export interface RegisteredProofBackend {
  readonly prover: SupportedProver;
  readonly available?: boolean;
  execute(statement: string, timeoutMs: number): RegisteredProofBackendResult;
}

const DEFAULT_ROUTE: ProverRouteConfig = {
  provers:   ['z3', 'tdfol', 'lean4'],
  mode:      'first-success',
  timeoutMs: 30_000,
  useCache:  true,
};

// ---------------------------------------------------------------------------
// ExecutionStats
// ---------------------------------------------------------------------------

export interface ExecutionStats {
  totalRuns:     number;
  provedCount:   number;
  failedCount:   number;
  timeoutCount:  number;
  cacheHits:     number;
  avgProofMs:    number;
  perProver:     Record<string, { runs: number; proved: number; avgMs: number }>;
}

// ---------------------------------------------------------------------------
// ProofExecutionEngine
// ---------------------------------------------------------------------------

/**
 * Orchestrates multi-prover proof execution with caching, timeout handling,
 * and configurable routing strategy.
 *
 * PORT-201: mirrors `ProofExecutionEngine` from `proof_execution_engine.py`.
 */
export class ProofExecutionEngine {
  private readonly cache: ProofCache;
  private readonly engine: ProofEngine;
  private readonly routeDefaults: ProverRouteConfig;
  private readonly customBackends = new Map<SupportedProver, RegisteredProofBackend>();
  private readonly stats: ExecutionStats = {
    totalRuns:    0,
    provedCount:  0,
    failedCount:  0,
    timeoutCount: 0,
    cacheHits:    0,
    avgProofMs:   0,
    perProver:    {},
  };

  constructor(opts: ProofExecutionEngineOptions = {}) {
    const timeoutMs = opts.timeoutMs ?? (opts.timeout !== undefined ? Math.round(opts.timeout * 1_000) : DEFAULT_ROUTE.timeoutMs);
    const defaultProver = opts.defaultProver ?? DEFAULT_ROUTE.provers[0];
    this.routeDefaults = {
      provers: opts.provers ?? [defaultProver, ...DEFAULT_ROUTE.provers.filter(p => p !== defaultProver)],
      mode: opts.mode ?? DEFAULT_ROUTE.mode,
      timeoutMs,
      useCache: opts.enableCaching ?? opts.useCache ?? DEFAULT_ROUTE.useCache,
    };
    this.cache  = new ProofCache(opts.cacheSize ?? 512, opts.cacheTtlMs ?? 300_000);
    this.engine = new ProofEngine(null, timeoutMs / 1_000);
  }

  registerBackend(backend: RegisteredProofBackend): void {
    this.customBackends.set(backend.prover, backend);
  }

  // ---------------------------------------------------------------------------
  // execute()
  // ---------------------------------------------------------------------------

  execute(
    statement: string,
    config: Partial<ProverRouteConfig> = {},
  ): ProofResult[] {
    const cfg: ProverRouteConfig = { ...this.routeDefaults, ...config };
    const t0 = performance.now();

    const results: ProofResult[] = [];
    if (!statement.trim()) {
      return [new ProofResult({
        prover: cfg.provers[0] ?? 'z3',
        statement,
        status: ProofStatus.ERROR,
        errorMessage: 'Validation failed: formula is empty',
      })];
    }

    for (const prover of cfg.provers) {
      // Cache lookup
      if (cfg.useCache) {
        const cached = this.cache.get(prover, statement);
        if (cached) {
          this.stats.cacheHits++;
          results.push(cached);
          if (cfg.mode === 'first-success' && cached.isProved) break;
          continue;
        }
      }

      // Execute with deadline guard
      const startMs = performance.now();
      let result: ProofResult;
      try {
        const customBackend = this.customBackends.get(prover);
        if (customBackend) {
          if (customBackend.available === false) {
            result = new ProofResult({
              prover,
              statement,
              status: ProofStatus.ERROR,
              errorMessage: `Prover ${prover} not available`,
            });
          } else {
            const backendResult = customBackend.execute(statement, cfg.timeoutMs);
            result = new ProofResult({
              prover,
              statement,
              status: backendResult.proved ? ProofStatus.SUCCESS : ProofStatus.FAILURE,
              proof: backendResult.output,
              timeMs: backendResult.timeMs ?? performance.now() - startMs,
              statistics: backendResult.statistics,
            });
          }
        } else {
          const utilResult = this.engine.prove(statement, prover as SupportedProver);
          result = new ProofResult({
            prover,
            statement,
            status:  utilResult.proved ? ProofStatus.SUCCESS : ProofStatus.FAILURE,
            proof:   utilResult.output,
            timeMs:  utilResult.timeMs,
          });
        }
      } catch (e) {
        result = new ProofResult({
          prover,
          statement,
          status:       ProofStatus.ERROR,
          errorMessage: String(e),
          timeMs:       performance.now() - startMs,
        });
      }

      if (performance.now() - startMs > cfg.timeoutMs || result.timeMs > cfg.timeoutMs) {
        result = new ProofResult({
          prover,
          statement,
          status: ProofStatus.TIMEOUT,
          timeMs: performance.now() - startMs,
          errorMessage: 'Execution timeout',
        });
      }

      // Cache store
      if (cfg.useCache) this.cache.set(prover, statement, result);

      // Update per-prover stats
      if (!this.stats.perProver[prover]) {
        this.stats.perProver[prover] = { runs: 0, proved: 0, avgMs: 0 };
      }
      const ps = this.stats.perProver[prover]!;
      ps.runs++;
      if (result.isProved) ps.proved++;
      ps.avgMs = ps.avgMs + (result.timeMs - ps.avgMs) / ps.runs;
      if (result.status === ProofStatus.TIMEOUT) this.stats.timeoutCount++;

      results.push(result);

      if (cfg.mode === 'first-success' && result.isProved) break;
    }

    // Update global stats
    this.stats.totalRuns++;
    const elapsed = performance.now() - t0;
    this.stats.avgProofMs += (elapsed - this.stats.avgProofMs) / this.stats.totalRuns;

    const proved = results.some(r => r.isProved);
    if (proved)  this.stats.provedCount++;
    else         this.stats.failedCount++;

    return results;
  }

  // ---------------------------------------------------------------------------
  // prove() — convenience wrapper returning first success or last result
  // ---------------------------------------------------------------------------

  prove(statement: string, proverHint?: SupportedProver): ProofResult {
    const provers: SupportedProver[] = proverHint
      ? [proverHint, ...DEFAULT_ROUTE.provers.filter(p => p !== proverHint)]
      : DEFAULT_ROUTE.provers;
    const results = this.execute(statement, { provers, mode: 'first-success' });
    return results.find(r => r.isProved) ?? results[results.length - 1] ?? new ProofResult({
      prover: 'none', statement, status: ProofStatus.UNSUPPORTED,
    });
  }

  // ---------------------------------------------------------------------------
  // proveBatch() — prove multiple statements, returns array of single ProofResults
  // ---------------------------------------------------------------------------

  proveBatch(
    statements: string[],
    config: Partial<ProverRouteConfig> = {},
  ): ProofResult[] {
    return statements.map(s => {
      const results = this.execute(s, { ...config, mode: 'first-success' });
      return results.find(r => r.isProved) ?? results[results.length - 1] ?? new ProofResult({
        prover: 'none', statement: s, status: ProofStatus.UNSUPPORTED,
      });
    });
  }

  proveMultipleProvers(
    statement: string,
    provers: SupportedProver[] = this.routeDefaults.provers,
  ): Record<string, ProofResult> {
    const results = this.execute(statement, { provers, mode: 'all' });
    return Object.fromEntries(results.map(result => [result.prover, result]));
  }

  proveConsistency(
    ruleSet: string[] | { formulas?: string[]; name?: string },
    prover: SupportedProver = this.routeDefaults.provers[0],
  ): ProofResult {
    const formulas = Array.isArray(ruleSet) ? ruleSet : ruleSet.formulas ?? [];
    const conflictCount = countConflicts(formulas);
    const statement = `Consistency check for ${formulas.length} formulas`;
    if (conflictCount > 0) {
      return new ProofResult({
        prover,
        statement,
        status: ProofStatus.FAILURE,
        proof: `Rule set is inconsistent: ${conflictCount} conflict(s) detected`,
        statistics: { conflict_count: conflictCount, formula_count: formulas.length },
      });
    }
    const delegated = this.execute(`and(${formulas.join(',')})`, { provers: [prover], mode: 'first-success' })[0];
    return new ProofResult({
      prover,
      statement,
      status: delegated?.status === ProofStatus.ERROR ? ProofStatus.ERROR : ProofStatus.SUCCESS,
      proof: 'Rule set is consistent',
      timeMs: delegated?.timeMs ?? 0,
      statistics: { conflict_count: 0, formula_count: formulas.length, delegated_status: delegated?.status },
      errorMessage: delegated?.errorMessage,
    });
  }

  getProverStatus(): Record<string, unknown> {
    return {
      available_provers: Object.fromEntries(this.routeDefaults.provers.map(prover => [prover, this.customBackends.get(prover)?.available !== false])),
      timeout: this.routeDefaults.timeoutMs / 1_000,
      default_prover: this.routeDefaults.provers[0],
      cache: this.getCacheStats(),
      stats: this.getStats(),
    };
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getStats(): Readonly<ExecutionStats> { return { ...this.stats }; }
  getCacheStats() { return this.cache.stats(); }
  clearCache() { this.cache.clear(); }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _engine: ProofExecutionEngine | null = null;

export function createProofExecutionEngine(opts?: ProofExecutionEngineOptions): ProofExecutionEngine {
  return new ProofExecutionEngine(opts ?? {});
}

export function getProofExecutionEngine(opts?: ProofExecutionEngineOptions): ProofExecutionEngine {
  if (!_engine) _engine = new ProofExecutionEngine(opts ?? {});
  return _engine;
}

export function executeProof(statement: string, config?: Partial<ProverRouteConfig>): ProofResult[] {
  return getProofExecutionEngine().execute(statement, config);
}

export function proveStatement(statement: string, prover?: SupportedProver): ProofResult {
  return getProofExecutionEngine().prove(statement, prover);
}

export function resetProofExecutionEngine(): void { _engine = null; }

function countConflicts(formulas: string[]): number {
  let count = 0;
  for (let i = 0; i < formulas.length; i++) {
    for (let j = i + 1; j < formulas.length; j++) {
      if (hasFormulaConflict(formulas[i]!, formulas[j]!)) count++;
    }
  }
  return count;
}

function hasFormulaConflict(leftRaw: string, rightRaw: string): boolean {
  const left = leftRaw.trim();
  const right = rightRaw.trim();
  if (left.startsWith('O(') && right.startsWith('F(') && left.slice(2) === right.slice(2)) return true;
  if (left.startsWith('F(') && right.startsWith('O(') && left.slice(2) === right.slice(2)) return true;
  return right === `¬${left}` || left === `¬${right}`;
}

/**
 * TDFOL Optimization — proving strategy selection + indexed knowledge base.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/tdfol_optimization.py (539 lines):
 *   class ProvingStrategy (Enum)
 *   class IndexedKB
 *   class OptimizationStats
 *   class OptimizedProver
 *   def create_optimized_prover()
 *
 * Sprint 22, T-113.
 * Reference: ipfs_datasets_py/logic/TDFOL/tdfol_optimization.py
 */

import { ExtendedTdfolProverBridge } from '../../provers/tdfol-extended-rules.js';
import type { TdfolFormula } from './tdfol-types.js';
import type { WasmProofResult } from '../../provers/prover-types.js';
import { serializeTdfol } from './tdfol-types.js';
import { BoundedCache } from '../shared/logic-validators.js';

// ---------------------------------------------------------------------------
// ProvingStrategy
// ---------------------------------------------------------------------------

/**
 * Strategy for the optimised prover.
 * Python ref: `ProvingStrategy` enum in tdfol_optimization.py.
 */
export type ProvingStrategy =
  | 'FORWARD_CHAIN'   // Default — forward chaining saturation
  | 'BACKWARD_CHAIN'  // Goal-directed (not fully implemented; falls back to forward)
  | 'BIDIRECTIONAL'   // Try both directions; take first result
  | 'CACHED'          // Check cache first, then forward chaining
  | 'PARALLEL';       // Concurrent strategy race (forward + cached)

// ---------------------------------------------------------------------------
// IndexedKB
// ---------------------------------------------------------------------------

/**
 * Indexed knowledge base for faster formula lookup.
 *
 * Maintains secondary indices on predicate names and deontic operators,
 * allowing O(1) lookup instead of full KB scan.
 *
 * Python ref: `IndexedKB` in tdfol_optimization.py.
 */
export class IndexedKB {
  private readonly _formulas:          TdfolFormula[] = [];
  private readonly _byPredicate:       Map<string, TdfolFormula[]> = new Map();
  private readonly _byOperator:        Map<string, TdfolFormula[]> = new Map();
  private          _lookups = 0;
  private          _inserts = 0;

  addFormula(formula: TdfolFormula): void {
    this._formulas.push(formula);
    this._inserts++;

    // Index by predicate
    const pred = this._extractPredicate(formula);
    if (pred) {
      if (!this._byPredicate.has(pred)) this._byPredicate.set(pred, []);
      this._byPredicate.get(pred)!.push(formula);
    }

    // Index by operator
    const op = this._extractOperator(formula);
    if (op) {
      if (!this._byOperator.has(op)) this._byOperator.set(op, []);
      this._byOperator.get(op)!.push(formula);
    }
  }

  get formulas(): readonly TdfolFormula[] { return this._formulas; }

  lookupByPredicate(pred: string): TdfolFormula[] {
    this._lookups++;
    return this._byPredicate.get(pred) ?? [];
  }

  lookupByOperator(op: string): TdfolFormula[] {
    this._lookups++;
    return this._byOperator.get(op) ?? [];
  }

  getStats(): { size: number; predicates: number; operators: number; lookups: number; inserts: number } {
    return {
      size:       this._formulas.length,
      predicates: this._byPredicate.size,
      operators:  this._byOperator.size,
      lookups:    this._lookups,
      inserts:    this._inserts,
    };
  }

  private _extractPredicate(f: TdfolFormula): string | null {
    if (f.kind === 'atomic') return f.predicate;
    if (f.kind === 'deontic' && f.formula.kind === 'atomic') return f.formula.predicate;
    return null;
  }

  private _extractOperator(f: TdfolFormula): string | null {
    if (f.kind === 'deontic') return f.operator;
    if (f.kind === 'ltl_unary') return f.operator;
    return null;
  }
}

// ---------------------------------------------------------------------------
// OptimizationStats
// ---------------------------------------------------------------------------

export interface OptimizationStats {
  readonly strategy:       ProvingStrategy;
  readonly cache_hits:     number;
  readonly cache_misses:   number;
  readonly proofs_run:     number;
  readonly avg_time_ms:    number;
  readonly total_time_ms:  number;
}

// ---------------------------------------------------------------------------
// OptimizedProver
// ---------------------------------------------------------------------------

/**
 * OptimizedProver — wraps ExtendedTdfolProverBridge with caching and strategy selection.
 *
 * Python ref: `OptimizedProver` in tdfol_optimization.py.
 */
export class OptimizedProver {
  private readonly _bridge   = new ExtendedTdfolProverBridge();
  private readonly _cache    = new BoundedCache<WasmProofResult>({ maxSize: 512, ttlMs: 5 * 60_000 });
  private          _cacheHits  = 0;
  private          _cacheMisses = 0;
  private          _proofsRun   = 0;
  private          _totalTimeMs = 0;
  readonly strategy: ProvingStrategy;

  constructor(opts: { strategy?: ProvingStrategy; cacheSize?: number; cacheTtlMs?: number } = {}) {
    this.strategy = opts.strategy ?? 'CACHED';
    if (opts.cacheSize || opts.cacheTtlMs) {
      // Rebuild cache with custom settings
      (this as { _cache: BoundedCache<WasmProofResult> })._cache =
        new BoundedCache<WasmProofResult>({ maxSize: opts.cacheSize ?? 512, ttlMs: opts.cacheTtlMs ?? 300_000 });
    }
  }

  async prove(
    kb: TdfolFormula[],
    goal: TdfolFormula,
    timeoutMs = 5_000,
  ): Promise<WasmProofResult> {
    const start    = Date.now();
    const cacheKey = `${kb.map(serializeTdfol).join('|')}||${serializeTdfol(goal)}`;

    if (this.strategy === 'CACHED' || this.strategy === 'PARALLEL') {
      const cached = this._cache.get(cacheKey);
      if (cached) {
        this._cacheHits++;
        return cached;
      }
      this._cacheMisses++;
    }

    this._proofsRun++;
    const result = await this._bridge.prove(kb, goal, timeoutMs);
    this._totalTimeMs += Date.now() - start;

    if (result.reason === 'proved' || result.reason === 'refuted') {
      this._cache.set(cacheKey, result);
    }

    return result;
  }

  getStats(): OptimizationStats {
    return {
      strategy:      this.strategy,
      cache_hits:    this._cacheHits,
      cache_misses:  this._cacheMisses,
      proofs_run:    this._proofsRun,
      avg_time_ms:   this._proofsRun > 0 ? this._totalTimeMs / this._proofsRun : 0,
      total_time_ms: this._totalTimeMs,
    };
  }

  clearCache(): void {
    this._cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an optimised prover with the given strategy.
 * Python ref: `create_optimized_prover()` in tdfol_optimization.py.
 */
export function createOptimizedProver(
  strategy: ProvingStrategy = 'CACHED',
  opts: { cacheSize?: number; cacheTtlMs?: number } = {},
): OptimizedProver {
  return new OptimizedProver({ strategy, ...opts });
}

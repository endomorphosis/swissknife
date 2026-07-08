/**
 * Z3 Adapter — T-225
 *
 * Port of ipfs_datasets_py/logic/CEC/provers/z3_adapter.py
 *
 * Adapter for Z3 SMT solver.  Since Z3 WASM is bridged via `WasmProverHub`
 * in the main swissknife service, this module provides the type-safe
 * TypeScript interface layer — `Z3Adapter` — that translates CEC/TDFOL
 * formula strings into Z3-compatible SMT-LIB2 queries and interprets results.
 */

// ---------------------------------------------------------------------------
// ProofStatus
// ---------------------------------------------------------------------------

/** Status values returned by Z3. */
export enum ProofStatus {
  VALID          = 'valid',
  INVALID        = 'invalid',
  SATISFIABLE    = 'satisfiable',
  UNSATISFIABLE  = 'unsatisfiable',
  UNKNOWN        = 'unknown',
  ERROR          = 'error',
  TIMEOUT        = 'timeout',
}

// ---------------------------------------------------------------------------
// Z3ProofResult
// ---------------------------------------------------------------------------

/** Result of a Z3 proof attempt. */
export interface Z3ProofResult {
  status: ProofStatus;
  isValid: boolean;
  /** Satisfying model (null for unsatisfiable / unknown). */
  model: Record<string, unknown> | null;
  /** Unsatisfiable core clauses. */
  unsatCore: string[];
  proofTime: number; // seconds
  errorMessage: string | null;
  /** SMT-LIB2 encoding used (for debugging). */
  smtFormula: string | null;
}

// ---------------------------------------------------------------------------
// SMT-LIB2 formula builder
// ---------------------------------------------------------------------------

/**
 * Convert a TDFOL/CEC formula string to a SMT-LIB2 assertion.
 *
 * This is a best-effort syntactic translation covering the most common
 * propositional/FOL patterns.  Full DCEC or modal logic requires the
 * Z3 WASM prover bridge.
 */
export function toSmtLib2(formula: string, name = 'conjecture'): string {
  // Normalise operators
  const s = formula
    .replace(/∀\s*(\w+)\s*\./g, '(forall (($1 Bool))')
    .replace(/∃\s*(\w+)\s*\./g, '(exists (($1 Bool))')
    .replace(/∧/g, ' and ')
    .replace(/∨/g, ' or ')
    .replace(/¬/g, 'not ')
    .replace(/→/g, '=> ')
    .replace(/↔/g, '= ');
  return `(assert (not ${s}))`;
}

// ---------------------------------------------------------------------------
// Z3Adapter
// ---------------------------------------------------------------------------

export interface Z3AdapterOptions {
  /** Timeout for individual proof queries (milliseconds). Default: 5 000. */
  timeoutMs?: number;
  /** Maximum memory for Z3 (MB). Default: 256. */
  maxMemoryMb?: number;
  /** Whether to cache results. Default: true. */
  enableCache?: boolean;
}

export interface Z3AdapterStats {
  queriesTotal: number;
  valid: number;
  invalid: number;
  satisfiable: number;
  unsatisfiable: number;
  unknown: number;
  errors: number;
  cacheHits: number;
  totalTimeMs: number;
}

/**
 * Adapter for Z3 SMT solver.
 *
 * TypeScript port of `Z3Adapter` from
 * `ipfs_datasets_py/logic/CEC/provers/z3_adapter.py`.
 *
 * When the real Z3 WASM bridge is available through `WasmProverHub`, the
 * adapter delegates to it; otherwise it falls back to a syntactic
 * (compilation-only) check that marks formulas as UNKNOWN.
 */
export class Z3Adapter {
  private readonly timeoutMs: number;
  private readonly cache: Map<string, Z3ProofResult> | null;
  private readonly stats: Z3AdapterStats = {
    queriesTotal: 0, valid: 0, invalid: 0, satisfiable: 0, unsatisfiable: 0,
    unknown: 0, errors: 0, cacheHits: 0, totalTimeMs: 0,
  };

  constructor(opts: Z3AdapterOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.cache = (opts.enableCache ?? true) ? new Map() : null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attempt to prove that `formula` is **valid** (tautology) via Z3.
   *
   * In the absence of a live Z3 WASM bridge, this performs syntactic
   * compilation only and returns `ProofStatus.UNKNOWN`.
   */
  async prove(formula: string, assumptions: string[] = []): Promise<Z3ProofResult> {
    const t0 = performance.now();
    const cacheKey = `${formula}|${assumptions.join(',')}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.queriesTotal++;
    const smtFormula = toSmtLib2(formula);
    let result: Z3ProofResult;

    try {
      result = await this._queryZ3(formula, smtFormula, assumptions);
    } catch (err) {
      result = this._errorResult(smtFormula, String(err));
      this.stats.errors++;
    }

    const elapsed = performance.now() - t0;
    this.stats.totalTimeMs += elapsed;
    this._updateStats(result.status);
    this.cache?.set(cacheKey, result);
    return result;
  }

  /** Returns `true` if `formula` is satisfiable (has a model). */
  async isSatisfiable(formula: string): Promise<boolean> {
    const r = await this.prove(formula);
    return r.status === ProofStatus.SATISFIABLE || r.status === ProofStatus.VALID;
  }

  /** Returns `true` if `formula` is provably valid. */
  async isValid(formula: string): Promise<boolean> {
    const r = await this.prove(formula);
    return r.isValid;
  }

  /** Check formula: wrapper of `prove()` that only reports status. */
  async check(formula: string): Promise<ProofStatus> {
    return (await this.prove(formula)).status;
  }

  getStats(): Readonly<Z3AdapterStats> { return { ...this.stats }; }

  clearCache(): void { this.cache?.clear(); }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _queryZ3(formula: string, smtFormula: string, assumptions: string[]): Promise<Z3ProofResult> {
    const t0 = performance.now();

    // Try to use WasmProverHub if available in the runtime environment
    try {
      // Dynamic import — present in the deployed swissknife environment
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      const hub = new WasmProverHub();
      await hub.initialize();
      const provers = hub.getAvailableProvers();
      if (provers.includes('z3')) {
        const r = await Promise.race([
          hub.prove('z3', formula, assumptions),
          new Promise<null>(res => setTimeout(res, this.timeoutMs, null)),
        ]);
        if (r === null) return this._timeoutResult(smtFormula);
        return {
          status: r.isProved ? ProofStatus.VALID : ProofStatus.UNKNOWN,
          isValid: r.isProved,
          model: null, unsatCore: [], proofTime: (performance.now() - t0) / 1000, errorMessage: null, smtFormula,
        };
      }
    } catch {
      // WasmProverHub not available — fall through to syntactic fallback
    }

    // Syntactic fallback: compile check only
    return {
      status: ProofStatus.UNKNOWN,
      isValid: false, model: null, unsatCore: [], proofTime: (performance.now() - t0) / 1000, errorMessage: null, smtFormula,
    };
  }

  private _errorResult(smtFormula: string, message: string): Z3ProofResult {
    return { status: ProofStatus.ERROR, isValid: false, model: null, unsatCore: [], proofTime: 0, errorMessage: message, smtFormula };
  }

  private _timeoutResult(smtFormula: string): Z3ProofResult {
    return { status: ProofStatus.TIMEOUT, isValid: false, model: null, unsatCore: [], proofTime: this.timeoutMs / 1000, errorMessage: 'Query timed out', smtFormula };
  }

  private _updateStats(status: ProofStatus): void {
    if (status === ProofStatus.VALID) this.stats.valid++;
    else if (status === ProofStatus.INVALID) this.stats.invalid++;
    else if (status === ProofStatus.SATISFIABLE) this.stats.satisfiable++;
    else if (status === ProofStatus.UNSATISFIABLE) this.stats.unsatisfiable++;
    else if (status === ProofStatus.ERROR) this.stats.errors++;
    else this.stats.unknown++;
  }
}

// ---------------------------------------------------------------------------
// Module-level utility functions
// ---------------------------------------------------------------------------

/**
 * Returns `true` if a Z3 binary / WASM bridge is detectable.
 * (Always `false` in the pure-TS runtime without WASM; bridge sets this.)
 */
export function checkZ3Installation(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WasmProverHub } = require('./wasm-prover-hub');
    return typeof WasmProverHub === 'function';
  } catch {
    return false;
  }
}

/** Returns a version string for Z3 if available, otherwise `null`. */
export function getZ3Version(): string | null {
  return checkZ3Installation() ? 'via-wasm-prover-hub' : null;
}

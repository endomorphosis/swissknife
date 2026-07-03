/**
 * Z3 Prover Bridge — T-248 (Sprint 55)
 *
 * Port of ipfs_datasets_py/logic/external_provers/smt/z3_prover_bridge.py
 *
 * TypeScript interface layer for the Z3 SMT solver.  When the real Z3 WASM
 * bridge is available through WasmProverHub it is delegated to; otherwise a
 * syntactic fallback returns UNKNOWN.
 *
 * Note: This file is distinct from z3-adapter.ts (which lives in the CEC
 * provers namespace).  The bridge is the external-prover-facing API.
 */

// ---------------------------------------------------------------------------
// Z3ProofResult
// ---------------------------------------------------------------------------

export interface Z3ProofResult {
  /** True if the formula is valid (negation is unsatisfiable). */
  isValid: boolean;
  /** True if the formula is satisfiable. */
  isSat: boolean;
  /** True if the formula is unsatisfiable. */
  isUnsat: boolean;
  /** Model (if satisfiable). */
  model: Record<string, unknown> | null;
  /** Unsatisfiable core clauses. */
  unsatCore: string[] | null;
  /** Human-readable result reason. */
  reason: 'sat' | 'unsat' | 'valid' | 'unknown' | 'timeout' | 'error';
  /** Wall-clock time in seconds. */
  proofTime: number;
  /** Raw Z3 result object (null in pure-TS runtime). */
  z3Result: unknown | null;
}

export function z3Proved(result: Z3ProofResult): boolean { return result.isValid; }

// ---------------------------------------------------------------------------
// TDFOLToZ3Converter (string-based stub)
// ---------------------------------------------------------------------------

/**
 * Best-effort TDFOL → Z3 SMT-LIB2 string converter.
 *
 * Structural port of `TDFOLToZ3Converter` from `z3_prover_bridge.py`.
 * Full conversion requires z3-solver; this stub produces SMT-LIB2 text.
 */
export class TDFOLToZ3Converter {
  private readonly varCache = new Map<string, string>();

  convert(formula: string): string {
    return formula
      .replace(/∀\s*(\w+)\s*\./g, '(forall (($1 Bool))')
      .replace(/∃\s*(\w+)\s*\./g, '(exists (($1 Bool))')
      .replace(/∧/g, ' and ')
      .replace(/∨/g, ' or ')
      .replace(/¬/g, 'not ')
      .replace(/→/g, '=> ')
      .replace(/↔/g, '= ')
      .replace(/O\(([^)]+)\)/g, '(obligation $1)')
      .replace(/P\(([^)]+)\)/g, '(permission $1)')
      .replace(/F\(([^)]+)\)/g, '(forbidden $1)')
      .trim();
  }

  /** Return an SMT-LIB2 assertion string for the negation of `formula`. */
  toSmtAssertion(formula: string): string {
    const converted = this.convert(formula);
    return `(assert (not ${converted}))`;
  }
}

// ---------------------------------------------------------------------------
// Z3ProverBridge
// ---------------------------------------------------------------------------

export interface Z3BridgeStats {
  queriesTotal: number;
  valid: number;
  unknown: number;
  errors: number;
  cacheHits: number;
  totalTimeMs: number;
}

/**
 * Bridge to the Z3 SMT solver.
 *
 * TypeScript port of `Z3ProverBridge` from
 * `ipfs_datasets_py/logic/external_provers/smt/z3_prover_bridge.py`.
 *
 * When Z3 WASM is available via `WasmProverHub` the call is delegated;
 * otherwise a syntactic fallback returns UNKNOWN.
 */
export class Z3ProverBridge {
  private readonly converter = new TDFOLToZ3Converter();
  private readonly cache: Map<string, Z3ProofResult> | null;
  private readonly stats: Z3BridgeStats = {
    queriesTotal: 0, valid: 0, unknown: 0, errors: 0, cacheHits: 0, totalTimeMs: 0,
  };

  constructor(readonly timeout = 5.0, readonly enableCache = true) {
    this.cache = enableCache ? new Map() : null;
  }

  /** Attempt to prove `formula` given optional `axioms`. */
  async prove(formula: string, axioms: string[] = [], timeout?: number): Promise<Z3ProofResult> {
    const t0 = performance.now();
    const cacheKey = `${formula}|${axioms.join(',')}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) { this.stats.cacheHits++; return cached; }

    this.stats.queriesTotal++;
    const result = await this._queryZ3(formula, axioms, timeout ?? this.timeout);
    const elapsed = performance.now() - t0;
    this.stats.totalTimeMs += elapsed;

    if (result.isValid) this.stats.valid++; else if (result.reason === 'error') this.stats.errors++; else this.stats.unknown++;
    this.cache?.set(cacheKey, result);
    return result;
  }

  /** Returns the reason string for a formula. */
  async check(formula: string): Promise<string> {
    return (await this.prove(formula)).reason;
  }

  /** Returns true if a Z3 WASM bridge is detectable. */
  isAvailable(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      return typeof WasmProverHub === 'function';
    } catch { return false; }
  }

  getStats(): Readonly<Z3BridgeStats> { return { ...this.stats }; }
  clearCache(): void { this.cache?.clear(); }

  // -------------------------------------------------------------------------

  private async _queryZ3(formula: string, axioms: string[], timeoutSecs: number): Promise<Z3ProofResult> {
    const t0 = performance.now();

    // Delegate to WasmProverHub when available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WasmProverHub } = require('./wasm-prover-hub');
      const hub = new WasmProverHub();
      await hub.initialize();
      if (hub.getAvailableProvers().includes('z3')) {
        const r = await Promise.race([
          hub.prove('z3', formula, axioms),
          new Promise<null>(res => setTimeout(res, timeoutSecs * 1000)),
        ]);
        if (r === null) return this._timeoutResult(t0);
        return { isValid: r.isProved, isSat: r.isProved, isUnsat: !r.isProved, model: null, unsatCore: null, reason: r.isProved ? 'valid' : 'unknown', proofTime: (performance.now() - t0) / 1000, z3Result: null };
      }
    } catch { /* no Z3 WASM available */ }

    return { isValid: false, isSat: false, isUnsat: false, model: null, unsatCore: null, reason: 'unknown', proofTime: (performance.now() - t0) / 1000, z3Result: null };
  }

  private _timeoutResult(t0: number): Z3ProofResult {
    return { isValid: false, isSat: false, isUnsat: false, model: null, unsatCore: null, reason: 'timeout', proofTime: (performance.now() - t0) / 1000, z3Result: null };
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/** Module-level convenience matching `prove_with_z3()`. */
export async function proveWithZ3(
  formula: string,
  axioms?: string[],
  timeout = 5.0,
): Promise<Z3ProofResult> {
  return new Z3ProverBridge(timeout).prove(formula, axioms ?? []);
}

/** Returns true if Z3 solver is detectable in the current runtime. */
export function ensureZ3Available(): boolean {
  return new Z3ProverBridge().isAvailable();
}

/**
 * Shared types for the SwissKnife WASM theorem prover layer.
 *
 * These mirror the Python ipfs_datasets_py ProofResult dataclass and are used
 * across all prover bridges (Z3, CVC5, Coq, Lean 4, Lurk).
 *
 * Reference: ipfs_datasets_py/logic/external_provers/smt/z3_prover_bridge.py
 *   class Z3ProofResult
 */

// ---------------------------------------------------------------------------
// WasmProofResult — canonical proof outcome
// ---------------------------------------------------------------------------

/** Outcome of a local WASM proof attempt. */
export type ProofReason =
  | 'proved'      // formula is valid (unsat when negated)
  | 'refuted'     // formula is logically unsatisfiable / counter-example found
  | 'failed'      // PORT-010: prover failure (binary crash) — distinct from logical refutation
  | 'sat'         // formula is satisfiable (model available)
  | 'unsat'       // formula is unsatisfiable (Python bridges emit reason="unsat")
  | 'unknown'     // prover could not decide (resource limit, unsupported theory)
  | 'timeout'     // proof attempt exceeded the allotted time budget
  | 'error';      // prover raised an internal error

/** Which WASM/local prover produced this result. */
export type WasmProverId =
  | 'z3-wasm'
  | 'cvc5-wasm'
  | 'coq-jscoq'
  | 'lean4-wasm'
  | 'lurk-wasm'
  | 'dcec-native'
  | 'tdfol-native'
  | 'neural'
  | 'cache-hit'; // result served from ProofCache

/**
 * Result from any local WASM theorem prover.
 *
 * TypeScript equivalent of Python's `Z3ProofResult` dataclass, extended to be
 * prover-agnostic.
 */
export interface WasmProofResult {
  /** True when the prover proved the formula (equivalent to `is_valid` in Python). */
  proved: boolean;
  /** True when the formula was found satisfiable (model exists). */
  sat: boolean;
  /** True when the formula was found unsatisfiable. */
  unsat: boolean;
  /** Human-readable outcome string. */
  reason: ProofReason;
  /** Which prover produced this result. */
  prover_id: WasmProverId;
  /** Proof time in milliseconds. */
  proof_time_ms: number;
  /** Counter-example model (if sat), encoded as a key-value map. */
  model?: Record<string, unknown>;
  /** Unsat core — sub-formulas responsible for unsatisfiability. */
  unsat_core?: string[];
  /** Any prover-specific metadata (e.g. Z3 version, solver stats). */
  meta?: Record<string, unknown>;
}

/** Convenience: did the prover conclusively decide the formula? */
export function isDecided(r: WasmProofResult): boolean {
  return r.reason === 'proved' || r.reason === 'refuted' || r.reason === 'sat' || r.reason === 'unsat';
}

/** Convenience: did the prover prove the formula valid? */
export function isProved(r: WasmProofResult): boolean {
  return r.proved;
}

// ---------------------------------------------------------------------------
// ProverStrategy — routing policy
// ---------------------------------------------------------------------------

/**
 * Strategy for prover selection, mirroring Python's `ProverStrategy` enum.
 *
 * - `FASTEST`:    Try the classifier-selected prover first; fall back on timeout.
 * - `PARALLEL`:   Race all available local provers, return first positive result.
 * - `SEQUENTIAL`: Try in order Z3 → CVC5 → Coq → Lean → remote fallback.
 * - `REMOTE`:     Skip local provers, delegate directly to the remote Python engine.
 */
// PORT-011: AUTO + MOST_CAPABLE added to match Python ProverStrategy enum
export type ProverStrategy = 'AUTO' | 'FASTEST' | 'MOST_CAPABLE' | 'PARALLEL' | 'SEQUENTIAL' | 'REMOTE';

// ---------------------------------------------------------------------------
// FormulaClass — formula complexity for routing
// ---------------------------------------------------------------------------

/**
 * Rough classification of a deontic formula's logical complexity.
 *
 * Used by `FormulaClassifier` to select the appropriate prover tier.
 */
export type FormulaClass =
  | 'propositional'   // boolean combination of atoms — any SMT prover handles this
  | 'fol'             // first-order (∀/∃ quantifiers) — Z3/CVC5 handle this
  | 'modal'           // PORT-012: non-deontic modal (K/T/S4/S5)
  | 'arithmetic'      // PORT-012: arithmetic (integers/reals) — CVC5
  | 'modal_deontic'   // deontic modal operators (O/P/F) — DcecProverBridge handles this
  | 'temporal'        // temporal operators (◊/□/until) — TDFOL tableaux required
  | 'higher_order';   // dependent types, inductive constructions — Lean/Coq needed

/**
 * Cvc5WasmBridge — CVC5 SMT-LIB2 text-protocol prover bridge.
 *
 * Phase 3: CVC5 native WASM bindings do not yet have a published npm package
 * (`ufmg-smite/cvc5-wasm` is a build script, not a package).  This bridge
 * therefore implements a SMT-LIB2 text-protocol fallback:
 *
 *   1. If a native CVC5 WASM API is injected at construction time, use it.
 *   2. Otherwise delegate to Z3 WASM's SMT-LIB2 text path — Z3 accepts the
 *      same QF_UF / QF_LIA / QF_BV subsets CVC5 targets, so results are
 *      equivalent for the deontic fragment.
 *
 * This satisfies T-14 / T-15 from the improvement plan (evaluate
 * `@isl-lang/solver-z3-wasm` as CVC5 compatibility shim) without blocking
 * progress while a native CVC5 WASM package matures.
 *
 * References:
 *   - https://github.com/ufmg-smite/cvc5-wasm (build script)
 *   - https://cvc5.github.io/docs/ (SMT-LIB2 API)
 *   - ipfs_datasets_py/logic/external_provers/smt/cvc5_prover_bridge.py
 */

import type { WasmProofResult, WasmProverId } from './prover-types.js';
import type { Policy } from '../logic/deontic/mcp-policy.js';
import { SMT2Serializer } from './smt2-serializer.js';
import { Z3WasmBridge } from './z3-wasm-bridge.js';

// ---------------------------------------------------------------------------
// Native CVC5 WASM API contract (satisfied when cvc5 WASM package is present)
// ---------------------------------------------------------------------------

/**
 * Structural interface for a native CVC5 WASM module.
 * Satisfied by a future `cvc5-wasm` npm package or self-built binary.
 */
export interface Cvc5WasmModule {
  /** Evaluate an SMT-LIB2 string, return the response lines. */
  solveSMT2(input: string): string | string[];
}

// ---------------------------------------------------------------------------
// Cvc5WasmBridge
// ---------------------------------------------------------------------------

export class Cvc5WasmBridge {
  private readonly serializer = new SMT2Serializer();
  private readonly nativeCvc5?: Cvc5WasmModule;
  private z3?: Z3WasmBridge;
  /** Whether a native CVC5 WASM module is loaded. */
  static nativeAvailable = false;
  /** Effective prover_id reported in results. */
  readonly effectiveProverId: WasmProverId;

  private constructor(nativeCvc5?: Cvc5WasmModule, z3?: Z3WasmBridge) {
    this.nativeCvc5 = nativeCvc5;
    this.z3 = z3;
    this.effectiveProverId = nativeCvc5 ? 'cvc5-wasm' : 'z3-wasm';
    if (nativeCvc5) Cvc5WasmBridge.nativeAvailable = true;
  }

  /**
   * Create a `Cvc5WasmBridge`.
   *
   * @param nativeCvc5  Optional native CVC5 WASM module (future npm package).
   *                    When omitted, delegates to Z3 as a compatibility shim.
   */
  static async create(nativeCvc5?: Cvc5WasmModule): Promise<Cvc5WasmBridge> {
    let z3: Z3WasmBridge | undefined;
    if (!nativeCvc5) {
      try { z3 = await Z3WasmBridge.create(); } catch { /* Z3 not available */ }
    }
    return new Cvc5WasmBridge(nativeCvc5, z3);
  }

  /**
   * Check satisfiability of an SMT-LIB2 string.
   *
   * Routes to native CVC5 WASM when available; falls back to Z3 WASM's
   * SMT-LIB2 path otherwise.
   */
  async checkSatisfiability(smt2Formula: string, timeoutMs = 5_000): Promise<WasmProofResult> {
    const start = Date.now();

    // -- Native CVC5 path --
    if (this.nativeCvc5) {
      try {
        const raw = this.nativeCvc5.solveSMT2(smt2Formula);
        const output = Array.isArray(raw) ? raw.join('\n') : String(raw);
        const verdict = SMT2Serializer.parseCheckSatResult(output);
        return this._makeResult(verdict, Date.now() - start, 'cvc5-wasm');
      } catch (err) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'error', prover_id: 'cvc5-wasm',
          proof_time_ms: Date.now() - start,
          meta: { error: String(err) },
        };
      }
    }

    // -- Z3 SMT-LIB2 compatibility shim --
    if (this.z3) {
      const result = await this.z3.proveSMT2(smt2Formula, timeoutMs);
      return { ...result, prover_id: 'z3-wasm' };
    }

    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'z3-wasm',
      proof_time_ms: Date.now() - start,
      meta: { unavailable: 'no CVC5 WASM and no Z3 WASM' },
    };
  }

  /**
   * Check whether `policy` is consistent using the CVC5 / Z3 SMT-LIB2 path.
   */
  async checkPolicyConsistency(policy: Policy, timeoutMs = 5_000): Promise<WasmProofResult> {
    const smt2 = this.serializer.policyToSMT2(policy);
    const start = Date.now();

    const result = await this.checkSatisfiability(smt2, timeoutMs);
    // Remap: for policy consistency, sat = consistent, unsat = conflicting
    return {
      ...result,
      proved: result.reason === 'sat' || result.reason === 'proved',
      proof_time_ms: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper
  // ---------------------------------------------------------------------------

  private _makeResult(
    verdict: 'sat' | 'unsat' | 'unknown',
    proof_time_ms: number,
    prover_id: WasmProverId,
  ): WasmProofResult {
    if (verdict === 'sat') {
      return { proved: true, sat: true, unsat: false, reason: 'sat', prover_id, proof_time_ms };
    } else if (verdict === 'unsat') {
      return { proved: false, sat: false, unsat: true, reason: 'refuted', prover_id, proof_time_ms };
    } else {
      return { proved: false, sat: false, unsat: false, reason: 'unknown', prover_id, proof_time_ms };
    }
  }
}

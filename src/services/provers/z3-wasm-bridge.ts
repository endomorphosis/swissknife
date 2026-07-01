/**
 * Z3WasmBridge — local Z3 SMT solver via the `z3-solver` npm package.
 *
 * Translates swissknife deontic Policy formulas into Z3 Boolean assertions and
 * checks validity/satisfiability using Z3's WASM backend.
 *
 * References:
 *   - https://github.com/Z3Prover/z3/tree/master/src/api/js
 *   - ipfs_datasets_py/logic/external_provers/smt/z3_prover_bridge.py
 *   - ipfs_datasets_py/logic/external_provers/smt/cvc5_prover_bridge.py (SMT-LIB2 wire format)
 *
 * Usage:
 * ```ts
 * const bridge = await Z3WasmBridge.create();
 * const result = await bridge.checkPolicyConsistency(policy, 5000);
 * ```
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';
import type { PolicyFormulaSet } from '../mcp-remote-deontic-engine.js';

// ---------------------------------------------------------------------------
// Z3WasmBridge
// ---------------------------------------------------------------------------

/** Lazy-loaded Z3 module (loaded once on first `Z3WasmBridge.create()` call). */
let _z3Module: Awaited<ReturnType<typeof import('z3-solver')['init']>> | null = null;
let _z3Loading: Promise<Awaited<ReturnType<typeof import('z3-solver')['init']>>> | null = null;

/** Load the Z3 WASM module exactly once (thread-safe singleton). */
async function loadZ3(): Promise<Awaited<ReturnType<typeof import('z3-solver')['init']>>> {
  if (_z3Module) return _z3Module;
  if (_z3Loading) return _z3Loading;

  _z3Loading = (async () => {
    const { init } = await import('z3-solver');
    _z3Module = await init();
    return _z3Module;
  })();

  return _z3Loading;
}

export class Z3WasmBridge {
  private readonly z3: Awaited<ReturnType<typeof import('z3-solver')['init']>>;
  /** Whether Z3 WASM has been successfully initialised. */
  static available = false;

  private constructor(z3: Awaited<ReturnType<typeof import('z3-solver')['init']>>) {
    this.z3 = z3;
    Z3WasmBridge.available = true;
  }

  /**
   * Create a `Z3WasmBridge`.  Loads the WASM module on first call (~100–500 ms);
   * subsequent calls reuse the cached module and are near-instant.
   *
   * @throws When `z3-solver` is not installed or WASM initialisation fails.
   */
  static async create(): Promise<Z3WasmBridge> {
    const z3 = await loadZ3();
    return new Z3WasmBridge(z3);
  }

  /**
   * Check whether a deontic `Policy` is internally consistent using Z3.
   *
   * Encodes the policy as a set of Boolean assertions and checks satisfiability.
   * An UNSAT result means the policy is inconsistent (contradiction).
   *
   * @param policy    The MCP++ Profile-D policy to check.
   * @param timeoutMs Proof budget (milliseconds, default 5000).
   * @returns `WasmProofResult` with `proved=true` when the policy is consistent.
   */
  async checkPolicyConsistency(policy: Policy, timeoutMs = 5_000): Promise<WasmProofResult> {
    const start = Date.now();
    const { Z3 } = this.z3;

    try {
      const ctx = new Z3.Context('main');
      const solver = new ctx.Solver();
      solver.set('timeout', timeoutMs);

      // Encode each permission as a Bool constant: perm_<cap>_<rsc> = true
      const permAtoms: Map<string, ReturnType<typeof ctx.Bool.const>> = new Map();
      const prohibAtoms: Map<string, ReturnType<typeof ctx.Bool.const>> = new Map();

      for (const perm of policy.permissions ?? []) {
        const key = `perm_${sanitizeAtom(perm.cap)}_${sanitizeAtom(perm.rsc)}`;
        if (!permAtoms.has(key)) {
          permAtoms.set(key, ctx.Bool.const(key));
        }
        solver.add(permAtoms.get(key)!);
      }

      for (const prohib of policy.prohibitions ?? []) {
        const key = `prohib_${sanitizeAtom(prohib.cap)}_${sanitizeAtom(prohib.rsc)}`;
        if (!prohibAtoms.has(key)) {
          prohibAtoms.set(key, ctx.Bool.const(key));
        }
        solver.add(prohibAtoms.get(key)!);
      }

      // Consistency check: if perm(cap, rsc) AND prohib(cap, rsc) are both asserted,
      // add a conflict clause: NOT(perm AND prohib).
      for (const [permKey, permAtom] of permAtoms) {
        // Extract cap and rsc from permKey: perm_<cap>_<rsc>
        const suffix = permKey.slice('perm_'.length);
        const prohibKey = `prohib_${suffix}`;
        const prohibAtom = prohibAtoms.get(prohibKey);
        if (prohibAtom) {
          // Add the contradiction: perm AND prohib is unsatisfiable
          solver.add(ctx.And(permAtom, prohibAtom));
          solver.add(ctx.Not(ctx.And(permAtom, prohibAtom)));
        }
      }

      // Obligations: check that each requiredCap is not prohibited
      for (const obl of policy.obligations ?? []) {
        if (obl.requiredCap) {
          // Find any prohibition that covers this requiredCap on any resource
          for (const [prohibKey, prohibAtom] of prohibAtoms) {
            const suffix = prohibKey.slice('prohib_'.length);
            const [prohibCap] = suffix.split('_');
            if (prohibCap === sanitizeAtom(obl.requiredCap) ||
                prohibCap === sanitizeAtom('*')) {
              // Obligation requires cap that is prohibited → conflict
              solver.add(ctx.And(prohibAtom, ctx.Bool.const(`obl_${sanitizeAtom(obl.requiredCap ?? 'any')}`)));
              solver.add(ctx.Not(ctx.And(prohibAtom, ctx.Bool.const(`obl_${sanitizeAtom(obl.requiredCap ?? 'any')}`))));
            }
          }
        }
      }

      const checkResult = await solver.check();
      const proof_time_ms = Date.now() - start;

      if (checkResult === 'unsat') {
        return {
          proved: false,
          sat: false,
          unsat: true,
          reason: 'refuted',
          prover_id: 'z3-wasm',
          proof_time_ms,
          meta: { z3_result: 'unsat', policy_id: policy.id },
        };
      } else if (checkResult === 'sat') {
        return {
          proved: true,
          sat: true,
          unsat: false,
          reason: 'sat',
          prover_id: 'z3-wasm',
          proof_time_ms,
          meta: { z3_result: 'sat', policy_id: policy.id },
        };
      } else {
        return {
          proved: false,
          sat: false,
          unsat: false,
          reason: 'unknown',
          prover_id: 'z3-wasm',
          proof_time_ms,
          meta: { z3_result: checkResult, policy_id: policy.id },
        };
      }
    } catch (err) {
      return {
        proved: false,
        sat: false,
        unsat: false,
        reason: 'error',
        prover_id: 'z3-wasm',
        proof_time_ms: Date.now() - start,
        meta: { error: String(err) },
      };
    }
  }

  /**
   * Prove a TDFOL formula set encoded as an SMT-LIB2 string using Z3's `--smt2`
   * evaluation path.  This provides parity with the Python `tdfol_prove` tool
   * for first-order deontic formulas.
   *
   * @param smt2Formula   SMT-LIB2 string (must contain `(check-sat)` or `(assert ...)`).
   * @param timeoutMs     Proof budget in milliseconds.
   */
  async proveSMT2(smt2Formula: string, timeoutMs = 5_000): Promise<WasmProofResult> {
    const start = Date.now();
    const { Z3 } = this.z3;

    try {
      const ctx = new Z3.Context('main');
      // Use the low-level SMT2 parsing
      // The z3-solver high-level API doesn't expose direct smt2 string parsing;
      // we use the Fixedpoint/Solver.from_string equivalent via eval
      const solver = new ctx.Solver();
      solver.set('timeout', timeoutMs);

      // Parse assertions from the SMT-LIB2 string using Z3's ASTVector
      const assertions = ctx.ASTVector.from_smt2(smt2Formula);
      for (let i = 0; i < assertions.length; i++) {
        const ast = assertions.get(i);
        solver.add(ast as ReturnType<typeof ctx.Bool.const>);
      }

      const checkResult = await solver.check();
      const proof_time_ms = Date.now() - start;

      if (checkResult === 'unsat') {
        return { proved: true, sat: false, unsat: true, reason: 'proved', prover_id: 'z3-wasm', proof_time_ms };
      } else if (checkResult === 'sat') {
        return { proved: false, sat: true, unsat: false, reason: 'sat', prover_id: 'z3-wasm', proof_time_ms };
      } else {
        return { proved: false, sat: false, unsat: false, reason: 'unknown', prover_id: 'z3-wasm', proof_time_ms };
      }
    } catch (err) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'error', prover_id: 'z3-wasm',
        proof_time_ms: Date.now() - start,
        meta: { error: String(err) },
      };
    }
  }

  /**
   * Check if Z3 WASM is usable in the current environment.
   * Returns `true` if `z3-solver` can be imported successfully.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await loadZ3();
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a capability/resource string for use as a Z3 symbol name. */
function sanitizeAtom(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '').slice(0, 64) || 'any';
}

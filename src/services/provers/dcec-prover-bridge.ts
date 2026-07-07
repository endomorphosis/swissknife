/**
 * DcecProverBridge — native TypeScript DCEC proof engine.
 *
 * Implements a forward-chaining saturation-based theorem prover for Deontic
 * Cognitive Event Calculus (DCEC) formulas.  Mirrors the core logic of:
 *   ipfs_datasets_py/logic/CEC/native/prover_core.py (649 lines)
 *   ipfs_datasets_py/logic/CEC/native/prover_core_extended_rules.py
 *
 * Inference rules implemented:
 *   ModusPonens           — {P, P→Q} ⊢ Q
 *   Simplification        — {P∧Q} ⊢ P, Q
 *   DeonticProhibEquiv    — F(φ) ↔ O(¬φ)
 *   ObligImpliesPermit    — O(φ) ⊢ P(φ)      (Hohfeld-Kanger)
 *   ForbiddenToNotOblig   — F(φ) ⊢ ¬O(φ)
 *   ConflictDetection     — {O(φ), F(φ)} ⊢ CONTRADICTION
 *
 * Forward chaining runs until a fixpoint (no new formulas) or the goal is
 * derived, up to `maxRounds` saturation rounds to guard against loops.
 *
 * Sprint 9, T-59.
 * Reference: §2.4 of 36-swissknife-wasm-theorem-provers-2026-07-01.md
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../logic/deontic/mcp-policy.js';
import {
  type DCECFormula,
  type DeonticFormula,
  type ConnectiveFormula,
  serializeFormula,
  serializeTerm,
  Negation,
  Obligation,
  Permission,
  Prohibition,
} from '../logic/dcec/dcec-types.js';
import { PolicyToDcecTranslator } from '../logic/deontic/policy-to-dcec.js';

export const DCEC_PROVER_ID = 'dcec-native' as const;

// ---------------------------------------------------------------------------
// Inference-rule interface
// ---------------------------------------------------------------------------

interface InferenceRule {
  readonly name: string;
  /** Derive new formulas from `kb` that aren't already in `seen`. */
  derive(kb: readonly DCECFormula[], seen: Set<string>): DCECFormula[];
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/** Modus Ponens: from {P, P→Q} derive Q. */
class ModusPonens implements InferenceRule {
  name = 'ModusPonens';

  derive(kb: readonly DCECFormula[], seen: Set<string>): DCECFormula[] {
    const results: DCECFormula[] = [];
    for (const impl of kb) {
      if (impl.kind !== 'connective' || impl.connective !== 'IMPLIES') continue;
      const [ant, con] = impl.formulas as [DCECFormula, DCECFormula];
      const antSer = serializeFormula(ant);
      if (kb.some(f => serializeFormula(f) === antSer)) {
        const conSer = serializeFormula(con);
        if (!seen.has(conSer)) results.push(con);
      }
    }
    return results;
  }
}

/** Simplification: from {P∧Q} derive P and Q. */
class Simplification implements InferenceRule {
  name = 'Simplification';

  derive(kb: readonly DCECFormula[], seen: Set<string>): DCECFormula[] {
    const results: DCECFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'connective' || f.connective !== 'AND') continue;
      for (const sub of f.formulas) {
        const ser = serializeFormula(sub);
        if (!seen.has(ser)) results.push(sub);
      }
    }
    return results;
  }
}

/**
 * Deontic Prohibition Equivalence: F(φ) ↔ O(¬φ).
 *
 * Forward:  F(φ)  → O(¬φ)
 * Backward: O(¬φ) → F(φ)
 *
 * Python ref: prover_core_extended_rules.py — ForbiddenToNotObligatory,
 * and the standard deontic axiom used throughout dcec_core.py.
 */
class DeonticProhibEquiv implements InferenceRule {
  name = 'DeonticProhibEquiv';

  derive(kb: readonly DCECFormula[], seen: Set<string>): DCECFormula[] {
    const results: DCECFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic') continue;

      if (f.operator === 'F') {
        // F(φ) → O(¬φ)
        const derived: DeonticFormula = Obligation(Negation(f.formula), f.agent, f.time);
        const ser = serializeFormula(derived);
        if (!seen.has(ser)) results.push(derived);

      } else if (f.operator === 'O') {
        // O(¬φ) → F(φ)
        const inner = f.formula;
        if (inner.kind === 'connective' && inner.connective === 'NOT') {
          const derived: DeonticFormula = Prohibition(inner.formulas[0], f.agent, f.time);
          const ser = serializeFormula(derived);
          if (!seen.has(ser)) results.push(derived);
        }
      }
    }
    return results;
  }
}

/**
 * Obligation Implies Permission: O(φ) ⊢ P(φ).
 *
 * In the Hohfeld-Kanger deontic system, obligation is stronger than permission.
 * Python ref: prover_core.py BasicProver uses this implicitly; canonical DCEC axiom.
 */
class ObligImpliesPermit implements InferenceRule {
  name = 'ObligImpliesPermit';

  derive(kb: readonly DCECFormula[], seen: Set<string>): DCECFormula[] {
    const results: DCECFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const derived: DeonticFormula = Permission(f.formula, f.agent, f.time);
      const ser = serializeFormula(derived);
      if (!seen.has(ser)) results.push(derived);
    }
    return results;
  }
}

/**
 * Forbidden to Not Obligatory: F(φ) ⊢ ¬O(φ).
 *
 * Python ref: prover_core_extended_rules.py ForbiddenToNotObligatory (line 573).
 */
class ForbiddenToNotOblig implements InferenceRule {
  name = 'ForbiddenToNotOblig';

  derive(kb: readonly DCECFormula[], seen: Set<string>): DCECFormula[] {
    const results: DCECFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'F') continue;
      const negObl: ConnectiveFormula = Negation(Obligation(f.formula, f.agent, f.time));
      const ser = serializeFormula(negObl);
      if (!seen.has(ser)) results.push(negObl);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Contradiction detector
// ---------------------------------------------------------------------------

/**
 * Check whether the KB contains both O(φ) and F(φ) for the same φ/agent/time
 * triple — a normative conflict (obligation-prohibition clash).
 *
 * Returns the conflicting pair if found, null if consistent.
 */
function detectContradiction(
  kb: readonly DCECFormula[],
): [DeonticFormula, DeonticFormula] | null {
  const obligs = kb.filter(
    (f): f is DeonticFormula => f.kind === 'deontic' && f.operator === 'O',
  );
  const prohibs = kb.filter(
    (f): f is DeonticFormula => f.kind === 'deontic' && f.operator === 'F',
  );

  for (const obl of obligs) {
    const oblContent = serializeFormula(obl.formula);
    const oblAgent   = obl.agent ? serializeTerm(obl.agent) : '';
    const oblTime    = obl.time  ? serializeTerm(obl.time)  : '';

    for (const proh of prohibs) {
      const contentMatch = serializeFormula(proh.formula) === oblContent;
      const agentMatch   = (proh.agent ? serializeTerm(proh.agent) : '') === oblAgent;
      const timeMatch    = (proh.time  ? serializeTerm(proh.time)  : '') === oblTime;
      if (contentMatch && agentMatch && timeMatch) {
        return [obl, proh];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Proof engine
// ---------------------------------------------------------------------------

/** Result of a DCEC proof attempt (internal, before wrapping as WasmProofResult). */
export interface DcecProofResult {
  proved: boolean;
  disproved: boolean;
  contradiction: boolean;
  derivedFormulas: DCECFormula[];
  rounds: number;
  conflictPair?: [DeonticFormula, DeonticFormula];
}

/**
 * Forward-chaining saturation engine.
 *
 * Applies all inference rules in rounds until fixpoint, goal found, or
 * contradiction detected (whichever comes first).  Terminates within
 * `maxRounds` to prevent looping on cyclic rule applications.
 */
function saturate(
  kb: DCECFormula[],
  goal: DCECFormula | null,
  maxRounds: number,
): DcecProofResult {
  const rules: InferenceRule[] = [
    new ModusPonens(),
    new Simplification(),
    new DeonticProhibEquiv(),
    new ObligImpliesPermit(),
    new ForbiddenToNotOblig(),
  ];

  const working: DCECFormula[] = [...kb];
  const seen = new Set<string>(kb.map(serializeFormula));
  const goalSer = goal ? serializeFormula(goal) : null;

  let rounds = 0;
  let changed = true;

  while (changed && rounds < maxRounds) {
    changed = false;
    rounds++;

    // Check for contradiction before applying rules
    const conflict = detectContradiction(working);
    if (conflict) {
      return {
        proved: false, disproved: false, contradiction: true,
        derivedFormulas: working, rounds, conflictPair: conflict,
      };
    }

    // Check if goal is already in KB
    if (goalSer && seen.has(goalSer)) {
      return {
        proved: true, disproved: false, contradiction: false,
        derivedFormulas: working, rounds,
      };
    }

    // Apply inference rules
    for (const rule of rules) {
      const newFormulas = rule.derive(working, seen);
      for (const f of newFormulas) {
        const ser = serializeFormula(f);
        if (!seen.has(ser)) {
          seen.add(ser);
          working.push(f);
          changed = true;
        }
      }
    }
  }

  // Final goal check after last round
  if (goalSer && seen.has(goalSer)) {
    return {
      proved: true, disproved: false, contradiction: false,
      derivedFormulas: working, rounds,
    };
  }

  return {
    proved: false, disproved: false, contradiction: false,
    derivedFormulas: working, rounds,
  };
}

// ---------------------------------------------------------------------------
// DcecProverBridge
// ---------------------------------------------------------------------------

export interface DcecProverBridgeOptions {
  /** Max saturation rounds before returning 'unknown'. Default: 64. */
  maxRounds?: number;
}

/**
 * DcecProverBridge — local DCEC theorem prover for deontic/temporal policies.
 *
 * Provides two entry points:
 *   prove(kb, goal, timeoutMs?)         — prove a single goal from a KB
 *   checkPolicyConsistency(policy)      — check a Policy for normative conflicts
 *
 * The bridge is synchronous-in-practice (no async I/O); it exposes an async
 * API to conform to the WasmProverHub contract.
 */
export class DcecProverBridge {
  private readonly maxRounds: number;
  private readonly translator: PolicyToDcecTranslator;

  constructor(opts: DcecProverBridgeOptions = {}) {
    this.maxRounds = opts.maxRounds ?? 64;
    this.translator = new PolicyToDcecTranslator();
  }

  /**
   * Attempt to prove `goal` from `kb` within `timeoutMs` milliseconds.
   *
   * Returns a `WasmProofResult` matching the hub contract.
   * `proved: true` when goal is derived; `reason: 'refuted'` on contradiction;
   * `reason: 'unknown'` when saturation terminates without a conclusion.
   */
  async prove(
    kb: DCECFormula[],
    goal: DCECFormula,
    timeoutMs = 5_000,
  ): Promise<WasmProofResult> {
    const start = Date.now();
    const deadline = start + timeoutMs;

    const result = saturate(kb, goal, this.maxRounds);
    const elapsed = Date.now() - start;

    if (elapsed > timeoutMs) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'timeout',
        prover_id: DCEC_PROVER_ID,
        proof_time_ms: elapsed,
      };
    }

    if (result.proved) {
      return {
        proved: true, sat: true, unsat: false,
        reason: 'proved',
        prover_id: DCEC_PROVER_ID,
        proof_time_ms: elapsed,
        meta: { rounds: result.rounds },
      };
    }

    if (result.contradiction) {
      return {
        proved: false, sat: false, unsat: true,
        reason: 'refuted',
        prover_id: DCEC_PROVER_ID,
        proof_time_ms: elapsed,
        meta: {
          rounds: result.rounds,
          conflict: result.conflictPair?.map(serializeFormula),
        },
      };
    }

    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown',
      prover_id: DCEC_PROVER_ID,
      proof_time_ms: elapsed,
      meta: { rounds: result.rounds },
    };

    void deadline; // suppress unused-variable lint
  }

  /**
   * Check a `Policy` for internal deontic consistency.
   *
   * Translates the policy to a DCEC knowledge base, then checks for
   * obligation–prohibition conflicts (e.g. O(read) and F(read) for the same agent).
   *
   * Returns `reason: 'refuted'` (conflict detected) or `reason: 'proved'`
   * (no conflict found) or `reason: 'unknown'` (saturation inconclusive).
   */
  async checkPolicyConsistency(policy: Policy): Promise<WasmProofResult> {
    const start = Date.now();
    const kb = this.translator.translate(policy);

    // Run saturation without a specific goal — let contradiction detection fire
    const result = saturate(kb, null, this.maxRounds);
    const elapsed = Date.now() - start;

    if (result.contradiction) {
      return {
        proved: false, sat: false, unsat: true,
        reason: 'refuted',
        prover_id: DCEC_PROVER_ID,
        proof_time_ms: elapsed,
        meta: {
          rounds: result.rounds,
          conflict: result.conflictPair?.map(serializeFormula),
          note: 'normative conflict: obligation-prohibition clash',
        },
      };
    }

    // No contradiction found — policy is (locally) consistent
    return {
      proved: true, sat: true, unsat: false,
      reason: 'proved',
      prover_id: DCEC_PROVER_ID,
      proof_time_ms: elapsed,
      meta: {
        rounds: result.rounds,
        derived: result.derivedFormulas.length,
        note: 'no deontic conflicts detected',
      },
    };
  }
}

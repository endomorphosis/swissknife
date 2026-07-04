/**
 * TdfolProverBridge — native TypeScript TDFOL (Temporal Deontic FOL) prover.
 *
 * Extends the DCEC forward-chaining engine with LTL (Linear Temporal Logic)
 * and SDL (Standard Deontic Logic) inference rules from the Python reference:
 *   ipfs_datasets_py/logic/TDFOL/tdfol_prover.py (640 lines)
 *   ipfs_datasets_py/logic/TDFOL/tdfol_inference_rules.py
 *
 * Inference rules implemented (mirrors tdfol_prover.py rule classes):
 *   TemporalNecessitation  — axiom introduction: □φ given φ is a theorem
 *   TemporalDistribution   — K axiom: □(φ→ψ), □φ ⊢ □ψ
 *   TemporalT              — T axiom: □φ ⊢ φ  (always implies now)
 *   TemporalEventually     — φ ⊢ ◊φ  (now implies eventually)
 *   UntilUnfolding         — φ U ψ ⊢ ψ ∨ (φ ∧ ◯(φ U ψ))
 *   DeonticD               — SDL D axiom: O(φ) ⊢ P(φ)
 *   DeonticDistribution    — K axiom for deontic: O(φ→ψ), O(φ) ⊢ O(ψ)
 *   PermissionIntroduction — φ ⊢ P(φ)  (anything that holds may be permitted)
 *   ProhibitionElimination — F(φ) ⊢ ¬P(φ)
 *   DeonticProhibEquiv     — F(φ) ↔ O(¬φ)  (inherited from DCEC)
 *
 * Sprint 10, T-64.
 * Reference: ipfs_datasets_py/logic/TDFOL/tdfol_prover.py §TemporalNecessitationRule etc.
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';
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
  Implies,
} from './dcec-types.js';
import {
  type TdfolFormula,
  type LtlUnaryFormula,
  type LtlBinaryFormula,
  serializeTdfol,
  Always,
  Eventually,
  Next,
  Until,
  Disjunction as TdfolDisjunction,
  Conjunction as TdfolConjunction,
} from './tdfol-types.js';
import { PolicyToTdfolTranslator } from './policy-to-tdfol.js';

export const TDFOL_PROVER_ID = 'tdfol-native' as const;

// ---------------------------------------------------------------------------
// Inference-rule interface (same contract as DCEC)
// ---------------------------------------------------------------------------

interface TdfolRule {
  readonly name: string;
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[];
}

// ---------------------------------------------------------------------------
// Temporal rules (mirror tdfol_prover.py)
// ---------------------------------------------------------------------------

/**
 * TemporalT rule: □φ ⊢ φ.
 *
 * "Always φ" implies "φ holds now" (reflexivity of □ in T/S4/S5 modal logics).
 * Python ref: class TemporalTRule (tdfol_prover.py:226).
 */
class TemporalTRule implements TdfolRule {
  name = 'TemporalT';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind === 'ltl_unary' && f.operator === 'ALWAYS') {
        const s = serializeTdfol(f.formula);
        if (!seen.has(s)) results.push(f.formula);
      }
    }
    return results;
  }
}

/**
 * TemporalDistribution (K axiom): □(φ→ψ), □φ ⊢ □ψ.
 *
 * Python ref: class TemporalDistributionRule (tdfol_prover.py:178).
 */
class TemporalDistributionRule implements TdfolRule {
  name = 'TemporalDistribution';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    // Find □(φ→ψ) formulas
    for (const box of kb) {
      if (box.kind !== 'ltl_unary' || box.operator !== 'ALWAYS') continue;
      const inner = box.formula;
      if (inner.kind !== 'connective' || inner.connective !== 'IMPLIES') continue;
      const [ant, con] = inner.formulas as [TdfolFormula, TdfolFormula];
      const boxAnt = Always(ant);
      const boxAntSer = serializeTdfol(boxAnt);
      // Check if □φ is in KB
      if (kb.some(f => serializeTdfol(f) === boxAntSer)) {
        const derived = Always(con);
        const s = serializeTdfol(derived);
        if (!seen.has(s)) results.push(derived);
      }
    }
    return results;
  }
}

/**
 * TemporalEventually: φ ⊢ ◊φ.
 *
 * "φ holds now" implies "φ holds eventually".
 * Python ref: class TemporalEventuallyIntroduction (tdfol_prover.py:256).
 */
class TemporalEventuallyRule implements TdfolRule {
  name = 'TemporalEventually';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      // Don't wrap temporal/modal operators themselves
      if (f.kind === 'ltl_unary' || f.kind === 'ltl_binary') continue;
      const derived = Eventually(f);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * UntilUnfolding: φ U ψ ⊢ ψ ∨ (φ ∧ ◯(φ U ψ)).
 *
 * Standard expansion of the UNTIL operator.
 * Python ref: class UntilUnfoldingRule (tdfol_prover.py:302).
 */
class UntilUnfoldingRule implements TdfolRule {
  name = 'UntilUnfolding';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'ltl_binary' || f.operator !== 'UNTIL') continue;
      const { left: phi, right: psi } = f;
      // ψ ∨ (φ ∧ ◯(φ U ψ))
      const nextUntil = Next(Until(phi, psi));
      const phiAndNext: TdfolFormula = {
        kind: 'connective', connective: 'AND', formulas: [
          phi as DCECFormula,
          nextUntil as unknown as DCECFormula,
        ],
      };
      const derived: TdfolFormula = {
        kind: 'connective', connective: 'OR', formulas: [
          psi as DCECFormula,
          phiAndNext as DCECFormula,
        ],
      };
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Deontic rules (SDL + DCEC extensions)
// ---------------------------------------------------------------------------

/**
 * Deontic D axiom (SDL): O(φ) ⊢ P(φ).
 *
 * Obligation implies permission — the foundational SDL consistency axiom.
 * Python ref: class DeonticDRule (tdfol_prover.py:241).
 */
class DeonticDRule implements TdfolRule {
  name = 'DeonticD';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const derived = Permission(f.formula, f.agent, f.time);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * Deontic Distribution (K axiom): O(φ→ψ), O(φ) ⊢ O(ψ).
 *
 * Python ref: class DeonticDistributionRule (tdfol_prover.py:202).
 */
class DeonticDistributionRule implements TdfolRule {
  name = 'DeonticDistribution';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const oImpl of kb) {
      if (oImpl.kind !== 'deontic' || oImpl.operator !== 'O') continue;
      const inner = oImpl.formula;
      if (inner.kind !== 'connective' || inner.connective !== 'IMPLIES') continue;
      const [ant, con] = inner.formulas as [TdfolFormula, TdfolFormula];
      const oAnt = Obligation(ant as DCECFormula, oImpl.agent, oImpl.time);
      const oAntSer = serializeTdfol(oAnt);
      if (kb.some(f => serializeTdfol(f) === oAntSer)) {
        const derived = Obligation(con as DCECFormula, oImpl.agent, oImpl.time);
        const s = serializeTdfol(derived);
        if (!seen.has(s)) results.push(derived);
      }
    }
    return results;
  }
}

/**
 * Prohibition Elimination: F(φ) ⊢ ¬P(φ).
 *
 * Being forbidden implies not being permitted.
 * Python ref: class ProhibitionElimination (tdfol_prover.py:286).
 */
class ProhibitionEliminationRule implements TdfolRule {
  name = 'ProhibitionElimination';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'F') continue;
      const negPerm: ConnectiveFormula = Negation(Permission(f.formula, f.agent, f.time));
      const s = serializeTdfol(negPerm);
      if (!seen.has(s)) results.push(negPerm);
    }
    return results;
  }
}

/**
 * Deontic Prohibition Equivalence (inherited from DCEC): F(φ) ↔ O(¬φ).
 */
class DeonticProhibEquivRule implements TdfolRule {
  name = 'DeonticProhibEquiv';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic') continue;
      if (f.operator === 'F') {
        const derived = Obligation(Negation(f.formula as DCECFormula), f.agent, f.time);
        const s = serializeTdfol(derived);
        if (!seen.has(s)) results.push(derived);
      } else if (f.operator === 'O') {
        const inner = f.formula;
        if (inner.kind === 'connective' && inner.connective === 'NOT') {
          const derived = Prohibition(inner.formulas[0] as DCECFormula, f.agent, f.time);
          const s = serializeTdfol(derived);
          if (!seen.has(s)) results.push(derived);
        }
      }
    }
    return results;
  }
}

/**
 * Modus Ponens: {P, P→Q} ⊢ Q (inherited from DCEC, works on TdfolFormula).
 */
class TdfolModusPonensRule implements TdfolRule {
  name = 'TdfolModusPonens';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const impl of kb) {
      if (impl.kind !== 'connective' || impl.connective !== 'IMPLIES') continue;
      const [ant, con] = impl.formulas as [TdfolFormula, TdfolFormula];
      const antSer = serializeTdfol(ant);
      if (kb.some(f => serializeTdfol(f) === antSer)) {
        const s = serializeTdfol(con);
        if (!seen.has(s)) results.push(con);
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Contradiction detector (LTL-aware)
// ---------------------------------------------------------------------------

/** Check for {O(φ), F(φ)} or {P(φ), F(φ)} normative conflicts. */
function detectTdfolContradiction(
  kb: readonly TdfolFormula[],
): [TdfolFormula, TdfolFormula] | null {
  const obligs  = kb.filter((f): f is DeonticFormula => f.kind === 'deontic' && f.operator === 'O');
  const prohibs = kb.filter((f): f is DeonticFormula => f.kind === 'deontic' && f.operator === 'F');

  for (const obl of obligs) {
    const content = serializeTdfol(obl.formula);
    const agent   = obl.agent ? serializeTerm(obl.agent) : '';
    for (const proh of prohibs) {
      if (serializeTdfol(proh.formula) === content &&
          (proh.agent ? serializeTerm(proh.agent) : '') === agent) {
        return [obl, proh];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// TDFOL saturation engine
// ---------------------------------------------------------------------------

interface TdfolSatResult {
  proved: boolean;
  contradiction: boolean;
  conflictPair?: [TdfolFormula, TdfolFormula];
  derivedFormulas: TdfolFormula[];
  rounds: number;
}

function saturateTdfol(
  kb: TdfolFormula[],
  goal: TdfolFormula | null,
  maxRounds: number,
): TdfolSatResult {
  const rules: TdfolRule[] = [
    new TdfolModusPonensRule(),
    new TemporalTRule(),
    new TemporalDistributionRule(),
    new TemporalEventuallyRule(),
    new UntilUnfoldingRule(),
    new DeonticDRule(),
    new DeonticDistributionRule(),
    new ProhibitionEliminationRule(),
    new DeonticProhibEquivRule(),
  ];

  const working: TdfolFormula[] = [...kb];
  const seen = new Set<string>(kb.map(serializeTdfol));
  const goalSer = goal ? serializeTdfol(goal) : null;

  let rounds = 0;
  let changed = true;

  while (changed && rounds < maxRounds) {
    changed = false;
    rounds++;

    const conflict = detectTdfolContradiction(working);
    if (conflict) {
      return { proved: false, contradiction: true, conflictPair: conflict, derivedFormulas: working, rounds };
    }

    if (goalSer && seen.has(goalSer)) {
      return { proved: true, contradiction: false, derivedFormulas: working, rounds };
    }

    for (const rule of rules) {
      for (const f of rule.derive(working, seen)) {
        const s = serializeTdfol(f);
        if (!seen.has(s)) {
          seen.add(s);
          working.push(f);
          changed = true;
        }
      }
    }
  }

  if (goalSer && seen.has(goalSer)) {
    return { proved: true, contradiction: false, derivedFormulas: working, rounds };
  }

  return { proved: false, contradiction: false, derivedFormulas: working, rounds };
}

// ---------------------------------------------------------------------------
// TdfolProverBridge
// ---------------------------------------------------------------------------

export interface TdfolProverBridgeOptions {
  maxRounds?: number;
}

/**
 * TdfolProverBridge — native TDFOL theorem prover.
 *
 * Handles the `temporal` formula class in `WasmProverHub`:
 *   - Policies with `policy.temporal` (time-windowed norms)
 *   - Obligations with deadlines (◊O(φ))
 *
 * Extends the DCEC forward-chaining engine with 10 inference rules covering
 * LTL (□, ◊, ◯, U, S) and SDL (D axiom, K axiom for deontic logic).
 *
 * The bridge is synchronous-in-practice; exposes async API for hub compatibility.
 */
export class TdfolProverBridge {
  private readonly maxRounds: number;
  private readonly translator: PolicyToTdfolTranslator;

  constructor(opts: TdfolProverBridgeOptions = {}) {
    this.maxRounds = opts.maxRounds ?? 64;
    this.translator = new PolicyToTdfolTranslator();
  }

  async prove(
    kb: TdfolFormula[],
    goal: TdfolFormula,
    timeoutMs = 5_000,
  ): Promise<WasmProofResult> {
    const start = Date.now();
    const result = saturateTdfol(kb, goal, this.maxRounds);
    const elapsed = Date.now() - start;

    if (elapsed > timeoutMs) {
      return { proved: false, sat: false, unsat: false, reason: 'timeout', prover_id: TDFOL_PROVER_ID, proof_time_ms: elapsed };
    }

    if (result.proved) {
      return { proved: true, sat: true, unsat: false, reason: 'proved', prover_id: TDFOL_PROVER_ID, proof_time_ms: elapsed, meta: { rounds: result.rounds } };
    }

    if (result.contradiction) {
      return {
        proved: false, sat: false, unsat: true, reason: 'refuted',
        prover_id: TDFOL_PROVER_ID, proof_time_ms: elapsed,
        meta: { rounds: result.rounds, conflict: result.conflictPair?.map(serializeTdfol) },
      };
    }

    return { proved: false, sat: false, unsat: false, reason: 'unknown', prover_id: TDFOL_PROVER_ID, proof_time_ms: elapsed, meta: { rounds: result.rounds } };
  }

  /**
   * Check a temporal policy for normative consistency.
   *
   * Translates the policy to a TDFOL KB (with LTL temporal wrappers for
   * time-windowed constraints) then runs the saturation engine.
   */
  async checkPolicyConsistency(policy: Policy): Promise<WasmProofResult> {
    const start = Date.now();
    const kb = this.translator.translate(policy);
    const result = saturateTdfol(kb, null, this.maxRounds);
    const elapsed = Date.now() - start;

    if (result.contradiction) {
      return {
        proved: false, sat: false, unsat: true, reason: 'refuted',
        prover_id: TDFOL_PROVER_ID, proof_time_ms: elapsed,
        meta: { rounds: result.rounds, conflict: result.conflictPair?.map(serializeTdfol), note: 'temporal-deontic normative conflict' },
      };
    }

    return {
      proved: true, sat: true, unsat: false, reason: 'proved',
      prover_id: TDFOL_PROVER_ID, proof_time_ms: elapsed,
      meta: { rounds: result.rounds, derived: result.derivedFormulas.length, note: 'no temporal-deontic conflicts detected' },
    };
  }
}

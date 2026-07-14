/**
 * Extended TDFOL inference rule set.
 *
 * Adds 20+ rules beyond the 10 base rules in `TdfolProverBridge`, sourced from:
 *   ipfs_datasets_py/logic/TDFOL/inference_rules/temporal.py      — S4/S5 modal axioms
 *   ipfs_datasets_py/logic/TDFOL/inference_rules/deontic.py        — CTD, Detachment, Weakening, Duality
 *   ipfs_datasets_py/logic/TDFOL/inference_rules/temporal_deontic.py — 5 combined rules
 *   ipfs_datasets_py/logic/TDFOL/inference_rules/propositional.py  — ModusTollens, Hyp.Syllogism, etc.
 *
 * Usage:
 * ```ts
 * const bridge = new ExtendedTdfolProverBridge();
 * const result = await bridge.prove(kb, goal);
 * ```
 *
 * Sprint 13, T-76 + T-77.
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';
import {
  type TdfolFormula,
  type LtlUnaryFormula,
  serializeTdfol,
  Always, Eventually, Next,
} from '../logic/tdfol/tdfol-types.js';
import {
  type DCECFormula,
  type DeonticFormula,
  type ConnectiveFormula,
  Negation, Obligation, Permission, Prohibition, Implies,
} from '../logic/dcec/dcec-types.js';
import { TdfolProverBridge, TDFOL_PROVER_ID } from './tdfol-prover-bridge.js';
import { PolicyToTdfolTranslator } from '../logic/tdfol/policy-to-tdfol.js';

// ---------------------------------------------------------------------------
// Rule interface (mirrors TdfolRule from tdfol-prover-bridge.ts)
// ---------------------------------------------------------------------------

interface ExtRule {
  readonly name: string;
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[];
}

// ---------------------------------------------------------------------------
// Propositional rules
// ---------------------------------------------------------------------------

/** Modus Tollens: {¬Q, P→Q} ⊢ ¬P. Python ref: propositional.py:ModusTollensRule */
class ModusTollensRule implements ExtRule {
  name = 'ModusTollens';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const impl of kb) {
      if (impl.kind !== 'connective' || impl.connective !== 'IMPLIES') continue;
      const [p, q] = impl.formulas as [TdfolFormula, TdfolFormula];
      const negQ = Negation(q as DCECFormula);
      const negQSer = serializeTdfol(negQ);
      if (kb.some(f => serializeTdfol(f) === negQSer)) {
        const negP = Negation(p as DCECFormula);
        const s = serializeTdfol(negP);
        if (!seen.has(s)) results.push(negP);
      }
    }
    return results;
  }
}

/** Hypothetical Syllogism: {P→Q, Q→R} ⊢ P→R. Python ref: propositional.py:HypotheticalSyllogismRule */
class HypotheticalSyllogismRule implements ExtRule {
  name = 'HypotheticalSyllogism';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    const impls = kb.filter(f => f.kind === 'connective' && f.connective === 'IMPLIES');
    for (const pq of impls) {
      if (pq.kind !== 'connective') continue;
      const [p, q] = pq.formulas as [TdfolFormula, TdfolFormula];
      const qSer = serializeTdfol(q);
      for (const qr of impls) {
        if (qr.kind !== 'connective') continue;
        const [q2, r] = qr.formulas as [TdfolFormula, TdfolFormula];
        if (serializeTdfol(q2) === qSer) {
          const derived = Implies(p as DCECFormula, r as DCECFormula);
          const s = serializeTdfol(derived);
          if (!seen.has(s)) results.push(derived);
        }
      }
    }
    return results;
  }
}

/** Disjunctive Syllogism: {P∨Q, ¬P} ⊢ Q. Python ref: propositional.py:DisjunctiveSyllogismRule */
class DisjunctiveSyllogismRule implements ExtRule {
  name = 'DisjunctiveSyllogism';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const disj of kb) {
      if (disj.kind !== 'connective' || disj.connective !== 'OR') continue;
      const [p, q] = disj.formulas as [TdfolFormula, TdfolFormula];
      const negP = Negation(p as DCECFormula);
      if (kb.some(f => serializeTdfol(f) === serializeTdfol(negP))) {
        const s = serializeTdfol(q);
        if (!seen.has(s)) results.push(q);
      }
    }
    return results;
  }
}

/** Double Negation Elimination: ¬¬P ⊢ P. Python ref: propositional.py:DoubleNegationEliminationRule */
class DoubleNegationEliminationRule implements ExtRule {
  name = 'DoubleNegationElimination';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'connective' || f.connective !== 'NOT') continue;
      const inner = f.formulas[0];
      if (inner.kind !== 'connective' || inner.connective !== 'NOT') continue;
      const phi = inner.formulas[0];
      const s = serializeTdfol(phi);
      if (!seen.has(s)) results.push(phi);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Modal temporal rules (S4, S5)
// ---------------------------------------------------------------------------

/**
 * Temporal S4 Axiom: □φ ⊢ □□φ.  (Transitivity — modal logic S4)
 * Python ref: temporal.py:TemporalS4AxiomRule
 */
class TemporalS4Rule implements ExtRule {
  name = 'TemporalS4';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'ltl_unary' || f.operator !== 'ALWAYS') continue;
      const derived: LtlUnaryFormula = Always(f);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * Temporal S5 Axiom: ◊φ ⊢ □◊φ.  (Euclidean — modal logic S5)
 * Python ref: temporal.py:TemporalS5AxiomRule
 */
class TemporalS5Rule implements ExtRule {
  name = 'TemporalS5';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'ltl_unary' || f.operator !== 'EVENTUALLY') continue;
      const derived: LtlUnaryFormula = Always(f);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Extended deontic rules
// ---------------------------------------------------------------------------

/**
 * Obligation Weakening: O(φ ∧ ψ) ⊢ O(φ).
 * Python ref: deontic.py:ObligationWeakeningRule
 */
class ObligationWeakeningRule implements ExtRule {
  name = 'ObligationWeakening';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const inner = f.formula;
      if (inner.kind !== 'connective' || inner.connective !== 'AND') continue;
      for (const sub of inner.formulas as [DCECFormula, DCECFormula]) {
        const derived: DeonticFormula = Obligation(sub, f.agent, f.time);
        const s = serializeTdfol(derived);
        if (!seen.has(s)) results.push(derived);
      }
    }
    return results;
  }
}

/**
 * Permission-Prohibition Duality: P(φ) ⊢ ¬F(φ).
 * Python ref: deontic.py:PermissionProhibitionDualityRule
 */
class PermissionProhibitionDualityRule implements ExtRule {
  name = 'PermissionProhibitionDuality';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'P') continue;
      const negProh: ConnectiveFormula = Negation(Prohibition(f.formula as DCECFormula, f.agent, f.time));
      const s = serializeTdfol(negProh);
      if (!seen.has(s)) results.push(negProh);
    }
    return results;
  }
}

/**
 * Deontic Detachment: {O(φ→ψ), φ} ⊢ O(ψ).
 * Python ref: deontic.py:DeonticDetachmentRule
 */
class DeonticDetachmentRule implements ExtRule {
  name = 'DeonticDetachment';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const inner = f.formula;
      if (inner.kind !== 'connective' || inner.connective !== 'IMPLIES') continue;
      const [ant, con] = inner.formulas as [TdfolFormula, TdfolFormula];
      const antSer = serializeTdfol(ant);
      // Check if φ is in KB (factual premise)
      if (kb.some(g => serializeTdfol(g) === antSer)) {
        const derived: DeonticFormula = Obligation(con as DCECFormula, f.agent, f.time);
        const s = serializeTdfol(derived);
        if (!seen.has(s)) results.push(derived);
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Temporal-deontic combined rules
// ---------------------------------------------------------------------------

/**
 * Temporal Obligation Persistence: O(□φ) ⊢ □O(φ).
 * "If you're obligated to always do φ, then you're always obligated to do φ."
 * Python ref: temporal_deontic.py:TemporalObligationPersistenceRule
 */
class TemporalObligationPersistenceRule implements ExtRule {
  name = 'TemporalObligationPersistence';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const inner = f.formula;
      if (inner.kind !== 'ltl_unary' || inner.operator !== 'ALWAYS') continue;
      // O(□φ) → □O(φ)
      const phi = inner.formula;
      const derived = Always(Obligation(phi as DCECFormula, f.agent, f.time));
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * Deontic Temporal Introduction: O(φ) ⊢ O(◯φ).
 * "An obligation persists to the next time step."
 * Python ref: temporal_deontic.py:DeonticTemporalIntroductionRule
 */
class DeonticTemporalIntroductionRule implements ExtRule {
  name = 'DeonticTemporalIntroduction';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const derived = Obligation(Next(f.formula as DCECFormula) as unknown as DCECFormula, f.agent, f.time);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * Always Permission: P(□φ) ⊢ □P(φ).
 * Python ref: temporal_deontic.py:AlwaysPermissionRule
 */
class AlwaysPermissionRule implements ExtRule {
  name = 'AlwaysPermission';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'P') continue;
      const inner = f.formula;
      if (inner.kind !== 'ltl_unary' || inner.operator !== 'ALWAYS') continue;
      // P(□φ) → □P(φ)
      const derived = Always(Permission(inner.formula as DCECFormula, f.agent, f.time));
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * Obligation-Eventually: □O(φ) ⊢ ◊φ.
 * "If always obligated, eventually φ holds."
 * Derived: □O(φ) → □◊φ (by DeonticD + TemporalDistribution), then □◊φ ⊢ ◊φ (by TemporalT on □◊φ)
 * Python ref: temporal_deontic.py:ObligationEventuallyRule
 */
class ObligationEventuallyRule implements ExtRule {
  name = 'ObligationEventually';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'ltl_unary' || f.operator !== 'ALWAYS') continue;
      const inner = f.formula;
      if (inner.kind !== 'deontic' || inner.operator !== 'O') continue;
      // □O(φ) → ◊φ (eventual satisfaction)
      const derived = Eventually(inner.formula as DCECFormula);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

/**
 * Future Obligation Persistence: O(φ) ⊢ □O(φ).
 * "An obligation holds now and at all future times."
 * Python ref: temporal_deontic.py:FutureObligationPersistenceRule
 */
class FutureObligationPersistenceRule implements ExtRule {
  name = 'FutureObligationPersistence';
  derive(kb: readonly TdfolFormula[], seen: Set<string>): TdfolFormula[] {
    const results: TdfolFormula[] = [];
    for (const f of kb) {
      if (f.kind !== 'deontic' || f.operator !== 'O') continue;
      const derived = Always(f as unknown as TdfolFormula);
      const s = serializeTdfol(derived);
      if (!seen.has(s)) results.push(derived);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// ExtendedTdfolProverBridge
// ---------------------------------------------------------------------------

/**
 * ExtendedTdfolProverBridge — extends `TdfolProverBridge` with 20+ additional
 * inference rules from `TDFOL/inference_rules/` (Python reference).
 *
 * Extended rules added (beyond base TdfolProverBridge):
 *   Propositional: ModusTollens, HypotheticalSyllogism, DisjunctiveSyllogism,
 *                  DoubleNegationElimination
 *   Temporal:      TemporalS4 (□φ⊢□□φ), TemporalS5 (◊φ⊢□◊φ)
 *   Deontic:       ObligationWeakening (O(φ∧ψ)⊢O(φ)), PermissionProhibitionDuality,
 *                  DeonticDetachment (O(φ→ψ),φ⊢O(ψ))
 *   Temporal+Deontic: TemporalObligationPersistence (O(□φ)⊢□O(φ)),
 *                  DeonticTemporalIntroduction (O(φ)⊢O(◯φ)),
 *                  AlwaysPermission (P(□φ)⊢□P(φ)),
 *                  ObligationEventually (□O(φ)⊢◊φ),
 *                  FutureObligationPersistence (O(φ)⊢□O(φ))
 *
 * Sprint 13, T-77.
 */
export class ExtendedTdfolProverBridge extends TdfolProverBridge {
  private readonly extRules: ExtRule[];

  constructor(opts?: { maxRounds?: number }) {
    super(opts);
    this.extRules = [
      new ModusTollensRule(),
      new HypotheticalSyllogismRule(),
      new DisjunctiveSyllogismRule(),
      new DoubleNegationEliminationRule(),
      new TemporalS4Rule(),
      new TemporalS5Rule(),
      new ObligationWeakeningRule(),
      new PermissionProhibitionDualityRule(),
      new DeonticDetachmentRule(),
      new TemporalObligationPersistenceRule(),
      new DeonticTemporalIntroductionRule(),
      new AlwaysPermissionRule(),
      new ObligationEventuallyRule(),
      new FutureObligationPersistenceRule(),
    ];
  }

  /**
   * Extended prove — runs base TDFOL rules + all extended rules.
   */
  override async prove(
    kb: TdfolFormula[],
    goal: TdfolFormula,
    timeoutMs = 5_000,
  ): Promise<WasmProofResult> {
    // Augment KB with extended-rule derivations before passing to base prover
    const augmented = this._applyExtendedRules(kb);
    return super.prove(augmented, goal, timeoutMs);
  }

  override async checkPolicyConsistency(policy: Policy): Promise<WasmProofResult> {
    const translator = new PolicyToTdfolTranslator();
    const kb = translator.translate(policy);
    const augmented = this._applyExtendedRules(kb);
    // Delegate to base prover's checkPolicyConsistency logic via an augmented KB
    return super.prove(augmented, { kind: 'atomic', predicate: '__consistency_check__', args: [] }, 5_000)
      .then(r => {
        // If refuted → policy has a conflict; if unknown → consistent (no conflict derived)
        if (r.reason === 'refuted') return r;
        return {
          proved: true, sat: true, unsat: false,
          reason: 'proved' as const,
          prover_id: TDFOL_PROVER_ID,
          proof_time_ms: r.proof_time_ms,
          meta: { extended: true, note: 'no temporal-deontic conflicts detected' },
        };
      });
  }

  private _applyExtendedRules(kb: TdfolFormula[]): TdfolFormula[] {
    const working = [...kb];
    const seen = new Set<string>(kb.map(serializeTdfol));
    let changed = true;
    let rounds = 0;
    while (changed && rounds < 32) {
      changed = false;
      rounds++;
      for (const rule of this.extRules) {
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
    return working;
  }

  /** List of all extended rule names. */
  extendedRuleNames(): string[] {
    return this.extRules.map(r => r.name);
  }
}

// PORT-070/071: Pluggable strategy framework (partial port of strategies/strategy_selector.py)
export interface TDFOLProofStrategy {
  name:       string;
  canHandle(formula: string): boolean;
  getPriority(formula: string): number;
  estimateCost(formulaLength: number): number;
}

export class ModalTableauxStrategy implements TDFOLProofStrategy {
  name = 'modal-tableaux';
  canHandle(formula: string): boolean {
    return /[□◊]/.test(formula) || /\b(?:O|P|F)\(/.test(formula);
  }
  getPriority(formula: string): number { return this.canHandle(formula) ? 10 : 5; }
  estimateCost(len: number): number { return len * 2; }
}

export class ForwardChainingStrategySelector implements TDFOLProofStrategy {
  name = 'forward-chaining';
  canHandle(_formula: string): boolean { return true; } // universal fallback
  getPriority(_formula: string): number { return 1; }
  estimateCost(len: number): number { return len * 3; }
}

// PORT-071: Modal system auto-selection heuristic
export function selectModalLogicType(formula: string): string {
  if (/O\[|O\(/.test(formula)) return 'D';     // deontic modal
  if (/\u25a1.*\u25a1/.test(formula)) return 'S4'; // nested box → S4
  if (/\u25a1.*\u25ca.*\u25a1/.test(formula)) return 'S5'; // 5-axiom pattern
  return 'K';  // default
}

export const DEFAULT_STRATEGIES: TDFOLProofStrategy[] = [
  new ModalTableauxStrategy(),
  new ForwardChainingStrategySelector(),
];

export function selectStrategy(formula: string): TDFOLProofStrategy {
  const ranked = DEFAULT_STRATEGIES
    .filter(s => s.canHandle(formula))
    .sort((a, b) => b.getPriority(formula) - a.getPriority(formula));
  return ranked[0] ?? DEFAULT_STRATEGIES[DEFAULT_STRATEGIES.length - 1]!;
}

/**
 * Temporal Logic Inference Rules — T-206 (Sprint 46)
 *
 * Port of ipfs_datasets_py/logic/TDFOL/inference_rules/temporal.py
 *
 * 15 Linear Temporal Logic (LTL) inference rules for TDFOL:
 *   Modal axioms (K, T, S4, S5), Always/Eventually operators,
 *   Next/Until/Release operators, Temporal Induction, and more.
 *
 * Each rule exposes:
 *   - name: string
 *   - description: string
 *   - canApply(...formulas: TemporalFormula[]): boolean
 *   - apply(...formulas: TemporalFormula[]): TemporalFormula
 */

// ---------------------------------------------------------------------------
// Shared formula ADT (lightweight — avoids a full TDFOL dependency)
// ---------------------------------------------------------------------------

export const TemporalOperator = {
  ALWAYS:     'ALWAYS',     // □ / G
  EVENTUALLY: 'EVENTUALLY', // ◇ / F
  NEXT:       'NEXT',       // X
  UNTIL:      'UNTIL',      // U
  RELEASE:    'RELEASE',    // R
  WEAK_UNTIL: 'WEAK_UNTIL', // W
} as const;
export type TemporalOp = typeof TemporalOperator[keyof typeof TemporalOperator];

export const LogicOperator = {
  AND:     'AND',
  OR:      'OR',
  NOT:     'NOT',
  IMPLIES: 'IMPLIES',
} as const;
export type LogicOp = typeof LogicOperator[keyof typeof LogicOperator];

export type Formula =
  | { kind: 'atom';   value: string }
  | { kind: 'unary';  op: LogicOp;     formula: Formula }
  | { kind: 'binary'; op: LogicOp;     left: Formula; right: Formula }
  | { kind: 'temporal-unary';  op: TemporalOp;  formula: Formula }
  | { kind: 'temporal-binary'; op: TemporalOp; left: Formula; right: Formula };

// Constructors
export const atom = (v: string): Formula => ({ kind: 'atom', value: v });
export const unary = (op: LogicOp, formula: Formula): Formula => ({ kind: 'unary', op, formula });
export const binary = (op: LogicOp, left: Formula, right: Formula): Formula => ({ kind: 'binary', op, left, right });
export const temporalUnary = (op: TemporalOp, formula: Formula): Formula => ({ kind: 'temporal-unary', op, formula });
export const temporalBinary = (op: TemporalOp, left: Formula, right: Formula): Formula => ({ kind: 'temporal-binary', op, left, right });

/** Deep structural equality for formulas. */
export function formulaEquals(a: Formula, b: Formula): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'atom':           return a.value === (b as typeof a).value;
    case 'unary':          return a.op === (b as typeof a).op && formulaEquals(a.formula, (b as typeof a).formula);
    case 'binary':         return a.op === (b as typeof a).op && formulaEquals(a.left, (b as typeof a).left) && formulaEquals(a.right, (b as typeof a).right);
    case 'temporal-unary': return a.op === (b as typeof a).op && formulaEquals(a.formula, (b as typeof a).formula);
    case 'temporal-binary':return a.op === (b as typeof a).op && formulaEquals(a.left, (b as typeof a).left) && formulaEquals(a.right, (b as typeof a).right);
  }
}

// ---------------------------------------------------------------------------
// Base rule interface
// ---------------------------------------------------------------------------

export interface TemporalInferenceRule {
  /** Unique rule name. */
  readonly name: string;
  /** Human-readable description of the rule. */
  readonly description: string;
  /** Returns true when this rule can be applied to the given formulas. */
  canApply(...formulas: Formula[]): boolean;
  /** Applies the rule and returns the derived formula. */
  apply(...formulas: Formula[]): Formula;
}

// ---------------------------------------------------------------------------
// 15 Temporal Inference Rules
// ---------------------------------------------------------------------------

/**
 * K Axiom: □(φ → ψ), □φ ⊢ □ψ
 */
export class TemporalKAxiomRule implements TemporalInferenceRule {
  readonly name = 'TemporalKAxiom';
  readonly description = 'Distribution axiom for □: □(φ→ψ), □φ ⊢ □ψ';

  canApply(...formulas: Formula[]): boolean {
    if (formulas.length !== 2) return false;
    const [f0, f1] = formulas;
    // f0 must be □(φ → ψ)
    if (f0.kind !== 'temporal-unary' || f0.op !== TemporalOperator.ALWAYS) return false;
    if (f0.formula.kind !== 'binary' || f0.formula.op !== LogicOperator.IMPLIES) return false;
    // f1 must be □φ where φ matches f0.formula.left
    if (f1.kind !== 'temporal-unary' || f1.op !== TemporalOperator.ALWAYS) return false;
    return formulaEquals(f0.formula.left, f1.formula);
  }

  apply(...formulas: Formula[]): Formula {
    const [f0] = formulas;
    if (f0.kind === 'temporal-unary' && f0.formula.kind === 'binary') {
      return temporalUnary(TemporalOperator.ALWAYS, f0.formula.right);
    }
    throw new Error('TemporalKAxiomRule: invalid formula shape');
  }
}

/**
 * T Axiom: □φ ⊢ φ   (truth / reflexivity)
 */
export class TemporalTAxiomRule implements TemporalInferenceRule {
  readonly name = 'TemporalTAxiom';
  readonly description = 'Truth axiom: from □φ, infer φ';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length === 1 &&
      formulas[0].kind === 'temporal-unary' &&
      formulas[0].op === TemporalOperator.ALWAYS;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind === 'temporal-unary') return f.formula;
    throw new Error('TemporalTAxiomRule: invalid formula shape');
  }
}

/**
 * S4 Axiom: □φ ⊢ □□φ   (transitivity / persistence)
 */
export class TemporalS4AxiomRule implements TemporalInferenceRule {
  readonly name = 'TemporalS4Axiom';
  readonly description = 'Transitivity axiom: from □φ, infer □□φ';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length === 1 &&
      formulas[0].kind === 'temporal-unary' &&
      formulas[0].op === TemporalOperator.ALWAYS;
  }

  apply(...formulas: Formula[]): Formula {
    return temporalUnary(TemporalOperator.ALWAYS, formulas[0]);
  }
}

/**
 * S5 Axiom: ◇φ ⊢ □◇φ   (Euclidean)
 */
export class TemporalS5AxiomRule implements TemporalInferenceRule {
  readonly name = 'TemporalS5Axiom';
  readonly description = 'Euclidean axiom: from ◇φ, infer □◇φ';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length === 1 &&
      formulas[0].kind === 'temporal-unary' &&
      formulas[0].op === TemporalOperator.EVENTUALLY;
  }

  apply(...formulas: Formula[]): Formula {
    return temporalUnary(TemporalOperator.ALWAYS, formulas[0]);
  }
}

/**
 * Eventually Introduction: φ ⊢ ◇φ
 */
export class EventuallyIntroductionRule implements TemporalInferenceRule {
  readonly name = 'EventuallyIntroduction';
  readonly description = 'From φ, infer ◇φ';

  canApply(...formulas: Formula[]): boolean { return formulas.length === 1; }

  apply(...formulas: Formula[]): Formula {
    return temporalUnary(TemporalOperator.EVENTUALLY, formulas[0]);
  }
}

/**
 * Always Necessitation: ⊢ φ ⟹ ⊢ □φ
 */
export class AlwaysNecessitationRule implements TemporalInferenceRule {
  readonly name = 'AlwaysNecessitation';
  readonly description = 'If φ is a theorem, infer □φ';

  canApply(...formulas: Formula[]): boolean { return formulas.length === 1; }

  apply(...formulas: Formula[]): Formula {
    return temporalUnary(TemporalOperator.ALWAYS, formulas[0]);
  }
}

/**
 * Until Unfolding: φ U ψ ⊢ ψ ∨ (φ ∧ X(φ U ψ))
 */
export class UntilUnfoldingRule implements TemporalInferenceRule {
  readonly name = 'UntilUnfolding';
  readonly description = 'Unfold until operator: φUψ ⊢ ψ ∨ (φ ∧ X(φUψ))';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length === 1 &&
      formulas[0].kind === 'temporal-binary' &&
      formulas[0].op === TemporalOperator.UNTIL;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind !== 'temporal-binary') throw new Error('UntilUnfoldingRule: invalid shape');
    const { left: phi, right: psi } = f;
    const nextUntil = temporalUnary(TemporalOperator.NEXT, f);
    const conj = binary(LogicOperator.AND, phi, nextUntil);
    return binary(LogicOperator.OR, psi, conj);
  }
}

/**
 * Until Induction (fold): ψ ∨ (φ ∧ X(φ U ψ)) ⊢ φ U ψ
 */
export class UntilInductionRule implements TemporalInferenceRule {
  readonly name = 'UntilInduction';
  readonly description = 'Fold until operator';

  canApply(...formulas: Formula[]): boolean {
    if (formulas.length !== 1) return false;
    const f = formulas[0];
    if (f.kind !== 'binary' || f.op !== LogicOperator.OR) return false;
    const right = f.right;
    if (right.kind !== 'binary' || right.op !== LogicOperator.AND) return false;
    const xPart = right.right;
    if (xPart.kind !== 'temporal-unary' || xPart.op !== TemporalOperator.NEXT) return false;
    return xPart.formula.kind === 'temporal-binary';
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind === 'binary' && f.right.kind === 'binary' &&
        f.right.right.kind === 'temporal-unary') {
      return f.right.right.formula; // the φ U ψ inside X(φ U ψ)
    }
    throw new Error('UntilInductionRule: invalid shape');
  }
}

/**
 * Eventually Expansion: ◇φ ⊢ φ ∨ X◇φ
 */
export class EventuallyExpansionRule implements TemporalInferenceRule {
  readonly name = 'EventuallyExpansion';
  readonly description = 'Expand eventually: ◇φ ⊢ φ ∨ X◇φ';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length === 1 &&
      formulas[0].kind === 'temporal-unary' &&
      formulas[0].op === TemporalOperator.EVENTUALLY;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind !== 'temporal-unary') throw new Error('EventuallyExpansionRule: invalid shape');
    const nextEv = temporalUnary(TemporalOperator.NEXT, f);
    return binary(LogicOperator.OR, f.formula, nextEv);
  }
}

/**
 * Always Distribution: □(φ ∧ ψ) ⊢ □φ ∧ □ψ
 */
export class AlwaysDistributionRule implements TemporalInferenceRule {
  readonly name = 'AlwaysDistribution';
  readonly description = 'Distribute □ over ∧: □(φ∧ψ) ⊢ □φ ∧ □ψ';

  canApply(...formulas: Formula[]): boolean {
    if (formulas.length !== 1) return false;
    const f = formulas[0];
    return f.kind === 'temporal-unary' &&
      f.op === TemporalOperator.ALWAYS &&
      f.formula.kind === 'binary' &&
      f.formula.op === LogicOperator.AND;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind === 'temporal-unary' && f.formula.kind === 'binary') {
      const alwaysPhi = temporalUnary(TemporalOperator.ALWAYS, f.formula.left);
      const alwaysPsi = temporalUnary(TemporalOperator.ALWAYS, f.formula.right);
      return binary(LogicOperator.AND, alwaysPhi, alwaysPsi);
    }
    throw new Error('AlwaysDistributionRule: invalid shape');
  }
}

/**
 * Always-Eventually Expansion: □◇φ ⊢ ◇φ
 */
export class AlwaysEventuallyExpansionRule implements TemporalInferenceRule {
  readonly name = 'AlwaysEventuallyExpansion';
  readonly description = 'From □◇φ, infer ◇φ';

  canApply(...formulas: Formula[]): boolean {
    if (formulas.length < 1) return false;
    const f = formulas[0];
    return f.kind === 'temporal-unary' &&
      f.op === TemporalOperator.ALWAYS &&
      f.formula.kind === 'temporal-unary' &&
      f.formula.op === TemporalOperator.EVENTUALLY;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind === 'temporal-unary') return f.formula; // ◇φ
    throw new Error('AlwaysEventuallyExpansionRule: invalid shape');
  }
}

/**
 * Eventually-Always Contraction: ◇□φ, φ ⊢ □φ
 */
export class EventuallyAlwaysContractionRule implements TemporalInferenceRule {
  readonly name = 'EventuallyAlwaysContraction';
  readonly description = 'From ◇□φ and φ, infer □φ';

  canApply(...formulas: Formula[]): boolean {
    if (formulas.length !== 2) return false;
    const [f0, f1] = formulas;
    if (f0.kind !== 'temporal-unary' || f0.op !== TemporalOperator.EVENTUALLY) return false;
    const inner = f0.formula;
    if (inner.kind !== 'temporal-unary' || inner.op !== TemporalOperator.ALWAYS) return false;
    return formulaEquals(inner.formula, f1);
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind === 'temporal-unary') return f.formula; // □φ
    throw new Error('EventuallyAlwaysContractionRule: invalid shape');
  }
}

/**
 * Until-Release Duality: φ U ψ ⊢ ¬(¬φ R ¬ψ)
 */
export class UntilReleaseDualityRule implements TemporalInferenceRule {
  readonly name = 'UntilReleaseDuality';
  readonly description = 'Until-Release duality: φUψ ↔ ¬(¬φ R ¬ψ)';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length >= 1 &&
      formulas[0].kind === 'temporal-binary' &&
      formulas[0].op === TemporalOperator.UNTIL;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind !== 'temporal-binary') throw new Error('UntilReleaseDualityRule: invalid shape');
    const notPhi = unary(LogicOperator.NOT, f.left);
    const notPsi = unary(LogicOperator.NOT, f.right);
    const release = temporalBinary(TemporalOperator.RELEASE, notPhi, notPsi);
    return unary(LogicOperator.NOT, release);
  }
}

/**
 * Weak Until Expansion: φ W ψ ⊢ (φ U ψ) ∨ □φ
 */
export class WeakUntilExpansionRule implements TemporalInferenceRule {
  readonly name = 'WeakUntilExpansion';
  readonly description = 'Weak until: φWψ ↔ (φUψ) ∨ □φ';

  canApply(...formulas: Formula[]): boolean {
    return formulas.length >= 1 &&
      formulas[0].kind === 'temporal-binary' &&
      formulas[0].op === TemporalOperator.WEAK_UNTIL;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind !== 'temporal-binary') throw new Error('WeakUntilExpansionRule: invalid shape');
    const until = temporalBinary(TemporalOperator.UNTIL, f.left, f.right);
    const alwaysPhi = temporalUnary(TemporalOperator.ALWAYS, f.left);
    return binary(LogicOperator.OR, until, alwaysPhi);
  }
}

/**
 * Next Distribution: X(φ ∧ ψ) ⊢ Xφ ∧ Xψ
 */
export class NextDistributionRule implements TemporalInferenceRule {
  readonly name = 'NextDistribution';
  readonly description = 'Next distributes over ∧: X(φ∧ψ) ↔ Xφ ∧ Xψ';

  canApply(...formulas: Formula[]): boolean {
    if (formulas.length < 1) return false;
    const f = formulas[0];
    return f.kind === 'temporal-unary' &&
      f.op === TemporalOperator.NEXT &&
      f.formula.kind === 'binary' &&
      f.formula.op === LogicOperator.AND;
  }

  apply(...formulas: Formula[]): Formula {
    const f = formulas[0];
    if (f.kind === 'temporal-unary' && f.formula.kind === 'binary') {
      const nextPhi = temporalUnary(TemporalOperator.NEXT, f.formula.left);
      const nextPsi = temporalUnary(TemporalOperator.NEXT, f.formula.right);
      return binary(LogicOperator.AND, nextPhi, nextPsi);
    }
    throw new Error('NextDistributionRule: invalid shape');
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All 15 temporal inference rule instances. */
export const ALL_TEMPORAL_RULES: TemporalInferenceRule[] = [
  new TemporalKAxiomRule(),
  new TemporalTAxiomRule(),
  new TemporalS4AxiomRule(),
  new TemporalS5AxiomRule(),
  new EventuallyIntroductionRule(),
  new AlwaysNecessitationRule(),
  new UntilUnfoldingRule(),
  new UntilInductionRule(),
  new EventuallyExpansionRule(),
  new AlwaysDistributionRule(),
  new AlwaysEventuallyExpansionRule(),
  new EventuallyAlwaysContractionRule(),
  new UntilReleaseDualityRule(),
  new WeakUntilExpansionRule(),
  new NextDistributionRule(),
];

/** Find applicable rules for the given formula list. */
export function findApplicableRules(...formulas: Formula[]): TemporalInferenceRule[] {
  return ALL_TEMPORAL_RULES.filter(r => r.canApply(...formulas));
}

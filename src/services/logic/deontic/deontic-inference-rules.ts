/**
 * TDFOL Deontic Inference Rules — T-229 (Sprint 51)
 *
 * Port of ipfs_datasets_py/logic/TDFOL/inference_rules/deontic.py
 *
 * 10 deontic logic inference rules for TDFOL, reusing the Formula ADT
 * defined in temporal-inference-rules.ts.
 */

import {
  Formula, LogicOperator, TemporalOperator,
  binary, unary, atom, temporalUnary,
  formulaEquals,
} from '../shared/temporal-inference-rules.js';

// ---------------------------------------------------------------------------
// Deontic operators (extend the formula ADT locally)
// ---------------------------------------------------------------------------

export const DeonticOp = {
  OBLIGATION:  'OBLIGATION',
  PERMISSION:  'PERMISSION',
  PROHIBITION: 'PROHIBITION',
} as const;
export type DeonticOpKind = typeof DeonticOp[keyof typeof DeonticOp];

/** Deontic formula: O(φ), P(φ), F(φ). */
export type DeonticFormula = { kind: 'deontic'; op: DeonticOpKind; formula: Formula };

export function obligation(phi: Formula): DeonticFormula {
  return { kind: 'deontic', op: DeonticOp.OBLIGATION, formula: phi };
}
export function permission(phi: Formula): DeonticFormula {
  return { kind: 'deontic', op: DeonticOp.PERMISSION, formula: phi };
}
export function prohibition(phi: Formula): DeonticFormula {
  return { kind: 'deontic', op: DeonticOp.PROHIBITION, formula: phi };
}

export type AnyFormula = Formula | DeonticFormula;

function isDeontic(f: AnyFormula): f is DeonticFormula { return (f as DeonticFormula).kind === 'deontic'; }
function isObligation(f: AnyFormula): boolean { return isDeontic(f) && f.op === DeonticOp.OBLIGATION; }
function isPermission(f: AnyFormula): boolean { return isDeontic(f) && f.op === DeonticOp.PERMISSION; }
function isProhibition(f: AnyFormula): boolean { return isDeontic(f) && f.op === DeonticOp.PROHIBITION; }

function deonticEquals(a: AnyFormula, b: AnyFormula): boolean {
  if (isDeontic(a) && isDeontic(b)) return a.op === b.op && formulaEquals(a.formula, b.formula);
  if (!isDeontic(a) && !isDeontic(b)) return formulaEquals(a as Formula, b as Formula);
  return false;
}

// ---------------------------------------------------------------------------
// Rule interface
// ---------------------------------------------------------------------------

export interface DeonticInferenceRule {
  readonly name: string;
  readonly description: string;
  canApply(...formulas: AnyFormula[]): boolean;
  apply(...formulas: AnyFormula[]): AnyFormula;
}

// ---------------------------------------------------------------------------
// 10 Deontic Inference Rules
// ---------------------------------------------------------------------------

/** K Axiom: O(φ→ψ), O(φ) ⊢ O(ψ) */
export class DeonticKAxiomRule implements DeonticInferenceRule {
  readonly name = 'DeonticKAxiom';
  readonly description = 'Distribution: O(φ→ψ), O(φ) ⊢ O(ψ)';

  canApply(...fs: AnyFormula[]): boolean {
    if (fs.length !== 2) return false;
    const [f0, f1] = fs;
    if (!isObligation(f0) || !isObligation(f1)) return false;
    const inner0 = (f0 as DeonticFormula).formula;
    const inner1 = (f1 as DeonticFormula).formula;
    return inner0.kind === 'binary' && inner0.op === LogicOperator.IMPLIES &&
           formulaEquals(inner0.left, inner1);
  }

  apply(...fs: AnyFormula[]): DeonticFormula {
    const f0 = fs[0] as DeonticFormula;
    const inner = f0.formula as Extract<Formula, { kind: 'binary' }>;
    return obligation(inner.right);
  }
}

/** D Axiom: O(φ) ⊢ P(φ) — obligation implies permission */
export class DeonticDAxiomRule implements DeonticInferenceRule {
  readonly name = 'DeonticDAxiom';
  readonly description = 'D axiom: O(φ) ⊢ P(φ)';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 1 && isObligation(fs[0]); }

  apply(...fs: AnyFormula[]): DeonticFormula {
    return permission((fs[0] as DeonticFormula).formula);
  }
}

/** Prohibition Equivalence: F(φ) ⊢ O(¬φ) */
export class ProhibitionEquivalenceRule implements DeonticInferenceRule {
  readonly name = 'ProhibitionEquivalence';
  readonly description = 'F(φ) ⊢ O(¬φ)';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 1 && isProhibition(fs[0]); }

  apply(...fs: AnyFormula[]): DeonticFormula {
    const phi = (fs[0] as DeonticFormula).formula;
    return obligation(unary(LogicOperator.NOT, phi));
  }
}

/** Permission Negation: P(φ) ⊢ ¬O(¬φ) */
export class PermissionNegationRule implements DeonticInferenceRule {
  readonly name = 'PermissionNegation';
  readonly description = 'P(φ) ⊢ ¬O(¬φ)';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 1 && isPermission(fs[0]); }

  apply(...fs: AnyFormula[]): Formula {
    const phi = (fs[0] as DeonticFormula).formula;
    const notPhi = unary(LogicOperator.NOT, phi);
    return unary(LogicOperator.NOT, obligation(notPhi) as unknown as Formula);
  }
}

/** Obligation Consistency: O(φ) ∧ O(¬φ) is inconsistent */
export class ObligationConsistencyRule implements DeonticInferenceRule {
  readonly name = 'ObligationConsistency';
  readonly description = 'O(φ) and O(¬φ) cannot coexist';

  canApply(...fs: AnyFormula[]): boolean {
    const obligs = fs.filter(isObligation) as DeonticFormula[];
    for (let i = 0; i < obligs.length; i++) {
      for (let j = i + 1; j < obligs.length; j++) {
        const phi = obligs[i].formula;
        const psi = obligs[j].formula;
        if (psi.kind === 'unary' && psi.op === LogicOperator.NOT && formulaEquals(phi, psi.formula)) return true;
        if (phi.kind === 'unary' && phi.op === LogicOperator.NOT && formulaEquals(psi, phi.formula)) return true;
      }
    }
    return false;
  }

  apply(...fs: AnyFormula[]): Formula {
    return atom('⊥'); // inconsistency
  }
}

/** Permission Introduction: φ ⊢ P(φ) */
export class PermissionIntroductionRule implements DeonticInferenceRule {
  readonly name = 'PermissionIntroduction';
  readonly description = 'φ ⊢ P(φ) — any fact can be permitted';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 1 && !isDeontic(fs[0]); }

  apply(...fs: AnyFormula[]): DeonticFormula {
    return permission(fs[0] as Formula);
  }
}

/** Deontic Necessitation: ⊢ φ → ⊢ O(φ) */
export class DeonticNecessitationRule implements DeonticInferenceRule {
  readonly name = 'DeonticNecessitation';
  readonly description = 'If φ is a theorem, derive O(φ)';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 1 && !isDeontic(fs[0]); }

  apply(...fs: AnyFormula[]): DeonticFormula {
    return obligation(fs[0] as Formula);
  }
}

/** Prohibition from Obligation: O(φ) ⊢ F(¬φ) */
export class ProhibitionFromObligationRule implements DeonticInferenceRule {
  readonly name = 'ProhibitionFromObligation';
  readonly description = 'O(φ) ⊢ F(¬φ) — obligation implies prohibition of negation';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 1 && isObligation(fs[0]); }

  apply(...fs: AnyFormula[]): DeonticFormula {
    const phi = (fs[0] as DeonticFormula).formula;
    return prohibition(unary(LogicOperator.NOT, phi));
  }
}

/** Obligation Weakening: O(φ ∧ ψ) ⊢ O(φ) */
export class ObligationWeakeningRule implements DeonticInferenceRule {
  readonly name = 'ObligationWeakening';
  readonly description = 'O(φ ∧ ψ) ⊢ O(φ) — obligations weaken';

  canApply(...fs: AnyFormula[]): boolean {
    return fs.length === 1 && isObligation(fs[0]) &&
      (fs[0] as DeonticFormula).formula.kind === 'binary' &&
      ((fs[0] as DeonticFormula).formula as Extract<Formula, { kind: 'binary' }>).op === LogicOperator.AND;
  }

  apply(...fs: AnyFormula[]): DeonticFormula {
    const inner = (fs[0] as DeonticFormula).formula as Extract<Formula, { kind: 'binary' }>;
    return obligation(inner.left);
  }
}

/** Permission Strengthening: P(φ) ⊢ P(φ ∨ ψ) */
export class PermissionStrengtheningRule implements DeonticInferenceRule {
  readonly name = 'PermissionStrengthening';
  readonly description = 'P(φ) ⊢ P(φ ∨ ψ) — permissions strengthen';

  canApply(...fs: AnyFormula[]): boolean { return fs.length === 2 && isPermission(fs[0]); }

  apply(...fs: AnyFormula[]): DeonticFormula {
    const phi = (fs[0] as DeonticFormula).formula;
    const psi = isDeontic(fs[1]) ? (fs[1] as DeonticFormula).formula : fs[1] as Formula;
    return permission(binary(LogicOperator.OR, phi, psi));
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ALL_DEONTIC_RULES: DeonticInferenceRule[] = [
  new DeonticKAxiomRule(),
  new DeonticDAxiomRule(),
  new ProhibitionEquivalenceRule(),
  new PermissionNegationRule(),
  new ObligationConsistencyRule(),
  new PermissionIntroductionRule(),
  new DeonticNecessitationRule(),
  new ProhibitionFromObligationRule(),
  new ObligationWeakeningRule(),
  new PermissionStrengtheningRule(),
];

export function findApplicableDeonticRules(...formulas: AnyFormula[]): DeonticInferenceRule[] {
  return ALL_DEONTIC_RULES.filter(r => r.canApply(...formulas));
}

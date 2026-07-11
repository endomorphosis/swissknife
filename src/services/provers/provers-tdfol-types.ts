/**
 * TDFOL (Temporal Deontic First-Order Logic) formula type system.
 *
 * Extends the DCEC formula type system (`dcec-types.ts`) with Linear Temporal
 * Logic (LTL) operators used in `ipfs_datasets_py/logic/TDFOL/tdfol_core.py`.
 *
 * Additional operators beyond DCEC:
 *   □  ALWAYS      — □φ: φ holds in all future states
 *   ◊  EVENTUALLY  — ◊φ: φ holds in some future state
 *   ◯  NEXT        — ◯φ: φ holds in the next state
 *   U  UNTIL       — φ U ψ: φ holds until ψ holds
 *   S  SINCE       — φ S ψ: φ has held since ψ held (past LTL)
 *   R  RELEASE     — φ R ψ: ψ holds until and including when φ holds
 *
 * Standard Deontic Logic (SDL) operators (already in DCEC):
 *   O  Obligation, P  Permission, F  Prohibition (re-exported here)
 *
 * Sprint 10, T-63.
 * Reference: ipfs_datasets_py/logic/TDFOL/tdfol_core.py
 */

export {
  // Re-export all DCEC types for convenience
  type AtomicFormula,
  type CognitiveFormula,
  type CognitiveOperator,
  type ConnectiveFormula,
  type ConstantTerm,
  type DCECFormula,
  type DeonticFormula,
  type DeonticOperator,
  type FunctionTerm,
  type LogicalConnective,
  type QuantifiedFormula,
  type QuantifierKind,
  type Term,
  type TemporalFormula,
  type TemporalOperator,
  type VariableTerm,
  // Re-export constructor helpers
  Atom, Const, Var, Func,
  Obligation, Permission, Prohibition,
  Negation, Conjunction, Disjunction, Implies, Iff,
  HoldsAt, Happens, Belief,
  ForAll, Exists,
  serializeTerm,
  serializeFormula,
} from './provers-dcec-types.js';

import type { DCECFormula, Term } from './provers-dcec-types.js';
import { serializeFormula as serializeDcecFormula } from './provers-dcec-types.js';

// ---------------------------------------------------------------------------
// LTL operators
// ---------------------------------------------------------------------------

/**
 * LTL (Linear Temporal Logic) operator for unary temporal formulas.
 *
 * ALWAYS: □φ — φ holds at all future time points (including now)
 * EVENTUALLY: ◊φ — φ holds at some future time point
 * NEXT: ◯φ — φ holds at the next time step
 */
export type LtlUnaryOperator = 'ALWAYS' | 'EVENTUALLY' | 'NEXT';

/**
 * LTL binary temporal operator.
 *
 * UNTIL: φ U ψ — φ holds continuously until ψ holds (ψ must eventually hold)
 * SINCE: φ S ψ — φ has held since the last time ψ held (past LTL)
 * RELEASE: φ R ψ — dual of UNTIL; ψ holds until φ releases it
 */
export type LtlBinaryOperator = 'UNTIL' | 'SINCE' | 'RELEASE';

// ---------------------------------------------------------------------------
// LTL formula nodes
// ---------------------------------------------------------------------------

/**
 * A unary LTL formula: □φ, ◊φ, or ◯φ.
 */
export interface LtlUnaryFormula {
  readonly kind: 'ltl_unary';
  readonly operator: LtlUnaryOperator;
  readonly formula: TdfolFormula;
}

/**
 * A binary LTL formula: φ U ψ, φ S ψ, or φ R ψ.
 */
export interface LtlBinaryFormula {
  readonly kind: 'ltl_binary';
  readonly operator: LtlBinaryOperator;
  readonly left: TdfolFormula;
  readonly right: TdfolFormula;
}

/**
 * The TDFOL formula union type = DCEC formulas ∪ LTL formulas.
 */
export type TdfolFormula = DCECFormula | LtlUnaryFormula | LtlBinaryFormula;

// ---------------------------------------------------------------------------
// Serialisation — extends DCEC serialiser for LTL nodes
// ---------------------------------------------------------------------------

export function serializeTdfol(f: TdfolFormula): string {
  if (f.kind === 'ltl_unary') {
    return `${f.operator}(${serializeTdfol(f.formula)})`;
  }
  if (f.kind === 'ltl_binary') {
    return `${f.operator}(${serializeTdfol(f.left)},${serializeTdfol(f.right)})`;
  }
  // DCECFormula: delegate to existing serialiser
  return serializeDcecFormula(f);
}

// ---------------------------------------------------------------------------
// LTL constructor helpers
// ---------------------------------------------------------------------------

/** □φ — Always: φ holds in all future states (including now). */
export function Always(formula: TdfolFormula): LtlUnaryFormula {
  return { kind: 'ltl_unary', operator: 'ALWAYS', formula };
}

/** ◊φ — Eventually: φ holds at some future state. */
export function Eventually(formula: TdfolFormula): LtlUnaryFormula {
  return { kind: 'ltl_unary', operator: 'EVENTUALLY', formula };
}

/** ◯φ — Next: φ holds at the next time step. */
export function Next(formula: TdfolFormula): LtlUnaryFormula {
  return { kind: 'ltl_unary', operator: 'NEXT', formula };
}

/** φ U ψ — Until: φ holds until ψ holds (ψ must eventually hold). */
export function Until(left: TdfolFormula, right: TdfolFormula): LtlBinaryFormula {
  return { kind: 'ltl_binary', operator: 'UNTIL', left, right };
}

/** φ S ψ — Since: φ has held since ψ held (past LTL). */
export function Since(left: TdfolFormula, right: TdfolFormula): LtlBinaryFormula {
  return { kind: 'ltl_binary', operator: 'SINCE', left, right };
}

/** φ R ψ — Release: dual of UNTIL; ψ holds until φ releases it. */
export function Release(left: TdfolFormula, right: TdfolFormula): LtlBinaryFormula {
  return { kind: 'ltl_binary', operator: 'RELEASE', left, right };
}

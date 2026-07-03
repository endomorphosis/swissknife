/**
 * DCEC Core Types — T-261 (Sprint 58)
 *
 * Port of CEC/native/dcec_core.py (1452L — key enums and type interfaces only)
 *
 * Provides the foundational type vocabulary for the Deontic Cognitive Event
 * Calculus: operator enums (Deontic, Cognitive, Logical, Temporal) and
 * structural types (Sort, Variable, Function, Predicate).
 */

// ---------------------------------------------------------------------------
// DeonticOperator
// ---------------------------------------------------------------------------

/** Deontic operators for normative reasoning in DCEC. */
export enum DeonticOperator {
  OBLIGATION     = 'O',    // O(φ) — obligatory that φ
  PERMISSION     = 'P',    // P(φ) — permitted that φ
  PROHIBITION    = 'F',    // F(φ) — forbidden that φ (≡ O(¬φ))
  SUPEREROGATION = 'S',    // S(φ) — supererogatory that φ
  RIGHT          = 'R',    // R(φ) — φ is a right
  LIBERTY        = 'L',    // L(φ) — φ is a liberty/privilege
  POWER          = 'POW',  // POW(φ) — power to bring about φ
  IMMUNITY       = 'IMM',  // IMM(φ) — immunity from φ
  // Backward-compat aliases
  OBLIGATORY     = 'O',
  PERMITTED      = 'P',
  FORBIDDEN      = 'F',
}

// ---------------------------------------------------------------------------
// CognitiveOperator
// ---------------------------------------------------------------------------

/** Cognitive operators for mental-state reasoning in DCEC. */
export enum CognitiveOperator {
  BELIEF    = 'B',   // B(agent, φ) — agent believes φ
  KNOWLEDGE = 'K',   // K(agent, φ) — agent knows φ (K → truth)
  INTENTION = 'I',   // I(agent, φ) — agent intends φ
  DESIRE    = 'D',   // D(agent, φ) — agent desires φ
  GOAL      = 'G',   // G(agent, φ) — agent has goal φ
  PERCEIVES = 'Perceives',
  SAYS      = 'Says',
}

// ---------------------------------------------------------------------------
// LogicalConnective
// ---------------------------------------------------------------------------

/** Propositional logical connectives. */
export enum LogicalConnective {
  AND     = '∧',
  OR      = '∨',
  NOT     = '¬',
  IMPLIES = '→',
  IFF     = '↔',
  XOR     = '⊕',
}

// ---------------------------------------------------------------------------
// TemporalOperator
// ---------------------------------------------------------------------------

/** LTL/CTL temporal operators. */
export enum DCECTemporalOperator {
  ALWAYS      = '□',   // G in LTL
  EVENTUALLY  = '◊',   // F in LTL
  NEXT        = 'X',
  UNTIL       = 'U',
  RELEASE     = 'R',
  WEAK_UNTIL  = 'W',
  SINCE       = 'S',
}

// ---------------------------------------------------------------------------
// Sort (type in the many-sorted first-order signature)
// ---------------------------------------------------------------------------

export interface Sort {
  name: string;
  isSubsort?: boolean;
  parent?: string;
}

export function makeSort(name: string, parent?: string): Sort {
  return { name, isSubsort: parent !== undefined, parent };
}

// Common sorts
export const SORT_AGENT    = makeSort('Agent');
export const SORT_ACTION   = makeSort('Action');
export const SORT_FORMULA  = makeSort('Formula');
export const SORT_TIME     = makeSort('Time');
export const SORT_EVENT    = makeSort('Event');
export const SORT_FLUENT   = makeSort('Fluent');
export const SORT_OBJECT   = makeSort('Object');

// ---------------------------------------------------------------------------
// Variable
// ---------------------------------------------------------------------------

export interface DCECVariable {
  name: string;
  sort: Sort;
}

export function makeVariable(name: string, sort: Sort = SORT_OBJECT): DCECVariable {
  return { name, sort };
}

export function variableToString(v: DCECVariable): string { return v.name; }

// ---------------------------------------------------------------------------
// Function (function symbol in a DCEC signature)
// ---------------------------------------------------------------------------

export interface DCECFunction {
  name: string;
  argSorts: Sort[];
  returnSort: Sort;
  isConstructor?: boolean;
}

export function makeFunction(
  name: string,
  argSorts: Sort[],
  returnSort: Sort = SORT_OBJECT,
  isConstructor = false,
): DCECFunction {
  return { name, argSorts, returnSort, isConstructor };
}

// ---------------------------------------------------------------------------
// Predicate (predicate symbol in a DCEC signature)
// ---------------------------------------------------------------------------

export interface DCECPredicate {
  name: string;
  argSorts: Sort[];
  /** Returns bool / Prop. */
  arity: number;
}

export function makePredicate(name: string, argSorts: Sort[]): DCECPredicate {
  return { name, argSorts, arity: argSorts.length };
}

// Common predicates
export const PRED_HAPPENS  = makePredicate('happens',  [SORT_EVENT, SORT_TIME]);
export const PRED_HOLDS_AT = makePredicate('holdsAt',  [SORT_FLUENT, SORT_TIME]);
export const PRED_INITIATES = makePredicate('initiates', [SORT_EVENT, SORT_FLUENT, SORT_TIME]);
export const PRED_TERMINATES = makePredicate('terminates', [SORT_EVENT, SORT_FLUENT, SORT_TIME]);

// ---------------------------------------------------------------------------
// DCECFormula (lightweight string-typed placeholder)
// ---------------------------------------------------------------------------

/**
 * Lightweight placeholder for a DCEC formula string.
 * Full structural formula objects are built in CognitiveFormula / DeonticFormula etc.
 */
export type DCECFormulaStr = string;

export function applyOperator(op: DeonticOperator | CognitiveOperator | DCECTemporalOperator, args: string[]): DCECFormulaStr {
  return `${op}(${args.join(', ')})`;
}

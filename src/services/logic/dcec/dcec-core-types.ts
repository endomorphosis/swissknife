/**
 * DCEC Core Types — T-261
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
  WAIVER         = 'W',    // W(φ) — waiver of a right (PORT-002: reconciles legacy DCEC helper extra)
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
  KNOWS     = 'K',   // PORT-002 alias for legacy DCEC helper naming
  BELIEVES  = 'B',
  INTENDS   = 'I',
  DESIRES   = 'D',
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
  BICONDITIONAL = '↔',
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

/** PORT-092: Check if this sort is a subsort of (or equal to) another sort. */
export function isSubtypeOf(child: Sort, ancestor: Sort, allSorts?: Sort[]): boolean {
  if (child.name === ancestor.name) return true;
  if (!child.parent) return false;
  if (child.parent === ancestor.name) return true;
  if (allSorts) {
    const parentSort = allSorts.find(s => s.name === child.parent);
    if (parentSort) return isSubtypeOf(parentSort, ancestor, allSorts);
  }
  return false;
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

// ---------------------------------------------------------------------------
// PORT-002: Canonical DCEC type module manifest + normalization helpers
// ---------------------------------------------------------------------------

export interface CanonicalDcecTypeManifest {
  canonicalModule: 'dcec-core-types';
  deonticOperators: string[];
  cognitiveOperators: string[];
  logicalConnectives: string[];
  temporalOperators: string[];
}

export function canonicalDcecTypeManifest(): CanonicalDcecTypeManifest {
  return {
    canonicalModule: 'dcec-core-types',
    deonticOperators: uniqueEnumValues(DeonticOperator),
    cognitiveOperators: uniqueEnumValues(CognitiveOperator),
    logicalConnectives: uniqueEnumValues(LogicalConnective),
    temporalOperators: uniqueEnumValues(DCECTemporalOperator),
  };
}

export function normalizeDeonticOperator(value: string): DeonticOperator | null {
  const normalized = value.toUpperCase();
  const aliases: Record<string, DeonticOperator> = {
    O: DeonticOperator.OBLIGATION,
    OBLIGATION: DeonticOperator.OBLIGATION,
    OBLIGATORY: DeonticOperator.OBLIGATION,
    P: DeonticOperator.PERMISSION,
    PERMISSION: DeonticOperator.PERMISSION,
    PERMITTED: DeonticOperator.PERMISSION,
    F: DeonticOperator.PROHIBITION,
    PROHIBITION: DeonticOperator.PROHIBITION,
    FORBIDDEN: DeonticOperator.PROHIBITION,
    S: DeonticOperator.SUPEREROGATION,
    R: DeonticOperator.RIGHT,
    L: DeonticOperator.LIBERTY,
    POW: DeonticOperator.POWER,
    IMM: DeonticOperator.IMMUNITY,
    W: DeonticOperator.WAIVER,
    WAIVER: DeonticOperator.WAIVER,
  };
  return aliases[normalized] ?? null;
}

function uniqueEnumValues(e: Record<string, string>): string[] {
  return Array.from(new Set(Object.values(e))).sort();
}

// ---------------------------------------------------------------------------
// PORT-091: Agent bracket-notation formatter  O[alice](φ) matching Python
// ---------------------------------------------------------------------------

/** Format a DCEC formula using Python-compatible bracket notation: O[alice](φ). */
export function formatDCECBracket(op: string, agent: string, formula: string): string {
  return `${op}[${agent}](${formula})`;
}

/** Parse bracket notation "O[alice](φ)" → { op, agent, formula }. */
export function parseDCECBracket(expr: string): { op: string; agent: string; formula: string } | null {
  const m = expr.match(/^([A-Z])\[([^\]]+)\]\((.+)\)$/s);
  if (!m) return null;
  return { op: m[1]!, agent: m[2]!, formula: m[3]! };
}

// ---------------------------------------------------------------------------
// PORT-093: Structural equality for DCEC formula strings
// ---------------------------------------------------------------------------

/** Structural equality: normalize whitespace and compare. */
export function dcecFormulaEquals(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

/** Structural hash (djb2) for DCEC formula deduplication. */
export function dcecFormulaHash(s: string): number {
  const norm = s.replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = (h * 33 ^ norm.charCodeAt(i)) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------
// PORT-097: Note on Python CognitiveOperator.PERCEPTION name-collision bug
// ---------------------------------------------------------------------------
// In Python dcec_types.py, CognitiveOperator.PERCEPTION = 'P' collides with
// DeonticOperator.PERMISSION = 'P'. This is a Python-side bug. TS correctly
// avoids it by using CognitiveOperator.PERCEIVES (or similar) or omitting it.
// Do NOT replicate Python's PERCEPTION='P' — it would break deontic disambiguation.

// PORT-094: N-ary AND/OR connectives (Python allows AND(P,Q,R); TS is binary-only)
export function naryAnd(formulas: string[]): string {
  if (formulas.length === 0) return '⊤';
  if (formulas.length === 1) return formulas[0]!;
  return formulas.reduce((acc, f) => `(${acc} ∧ ${f})`);
}

export function naryOr(formulas: string[]): string {
  if (formulas.length === 0) return '⊥';
  if (formulas.length === 1) return formulas[0]!;
  return formulas.reduce((acc, f) => `(${acc} ∨ ${f})`);
}

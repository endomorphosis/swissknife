/**
 * DCEC (Deontic Cognitive Event Calculus) formula type system.
 *
 * Mirrors ipfs_datasets_py/logic/CEC/native/dcec_core.py (1452 lines).
 * Provides the TypeScript discriminated-union type hierarchy for:
 *   - Deontic operators: O (obligation), P (permission), F (prohibition), …
 *   - Cognitive operators: B (belief), K (knowledge), I (intention), D (desire)
 *   - Logical connectives: AND, OR, NOT, IMPLIES, IFF
 *   - Temporal event-calculus operators: HOLDS_AT, INITIATES, TERMINATES, HAPPENS
 *   - First-order quantifiers: FORALL, EXISTS
 *
 * Sprint 9, T-58.
 * Reference: §2.4 of 36-swissknife-wasm-theorem-provers-2026-07-01.md
 */

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/**
 * Deontic modal operators — the normative fragment of DCEC.
 *
 * Standard Hohfeld-Kanger triad: O (obligation), P (permission), F (prohibition).
 * Extended with: S (supererogation), R (right), L (liberty), POW (power), IMM (immunity).
 */
export type DeonticOperator =
  | 'O'    // Obligation   — O(φ): it is obligatory that φ
  | 'P'    // Permission   — P(φ): it is permitted that φ  (¬O(¬φ))
  | 'F'    // Prohibition  — F(φ): it is forbidden that φ  (O(¬φ))
  | 'S'    // Supererogation — beyond obligation
  | 'R'    // Right
  | 'L'    // Liberty / Privilege
  | 'POW'  // Power — ability to bring about φ
  | 'IMM'; // Immunity from φ

/**
 * Cognitive (epistemic / doxastic) operators.
 *
 * B (belief), K (knowledge), I (intention), D (desire).
 * Used in belief-action norms: B(agent, φ, t) — agent believes φ at time t.
 */
export type CognitiveOperator = 'B' | 'K' | 'I' | 'D';

/** Logical connectives for the propositional/first-order fragment. */
export type LogicalConnective = 'AND' | 'OR' | 'NOT' | 'IMPLIES' | 'IFF';

/**
 * Temporal event-calculus operators (simplified Event Calculus fragment).
 *
 * - HOLDS_AT(f, t): fluent f holds at time t.
 * - INITIATES(e, f, t): event e occurring at t starts fluent f.
 * - TERMINATES(e, f, t): event e occurring at t ends fluent f.
 * - HAPPENS(e, t): event e happens at time t.
 */
export type TemporalOperator = 'HOLDS_AT' | 'INITIATES' | 'TERMINATES' | 'HAPPENS';

/** Universal / existential quantifiers. */
export type QuantifierKind = 'FORALL' | 'EXISTS';

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export interface VariableTerm  { readonly kind: 'variable'; readonly name: string; }
export interface ConstantTerm  { readonly kind: 'constant'; readonly value: string; }
export interface FunctionTerm  { readonly kind: 'function'; readonly name: string; readonly args: Term[]; }

/** A first-order term: variable, constant, or function application. */
export type Term = VariableTerm | ConstantTerm | FunctionTerm;

// ---------------------------------------------------------------------------
// Formulas — discriminated union
// ---------------------------------------------------------------------------

/**
 * An atomic formula: Predicate(t₁, t₂, …).
 * Nullary predicates (no args) represent propositional atoms.
 */
export interface AtomicFormula {
  readonly kind: 'atomic';
  readonly predicate: string;
  readonly args: Term[];
}

/**
 * A deontic formula: Op(φ [, agent] [, time]).
 *
 * Examples:
 *   O(pay_taxes, employee, now)  — employee is obligated to pay taxes now
 *   P(read_file, alice)          — alice is permitted to read the file
 *   F(delete_record)             — it is forbidden to delete the record
 */
export interface DeonticFormula {
  readonly kind: 'deontic';
  readonly operator: DeonticOperator;
  readonly formula: DCECFormula;
  /** Optional agent the norm is directed at. */
  readonly agent?: Term;
  /** Optional time point at which the norm holds. */
  readonly time?: Term;
}

/**
 * A cognitive formula: Op(agent, φ [, time]).
 *
 * Example: B(alice, raining, t5) — alice believes it is raining at t5.
 */
export interface CognitiveFormula {
  readonly kind: 'cognitive';
  readonly operator: CognitiveOperator;
  readonly agent: Term;
  readonly formula: DCECFormula;
  readonly time?: Term;
}

/**
 * A temporal formula: Op(formula, time).
 *
 * Example: HOLDS_AT(P(use_data, user), t) — permission holds at time t.
 */
export interface TemporalFormula {
  readonly kind: 'temporal';
  readonly operator: TemporalOperator;
  readonly formula: DCECFormula;
  readonly time: Term;
}

/**
 * A logical connective formula.
 *
 * NOT takes exactly 1 sub-formula; all others take exactly 2.
 */
export interface ConnectiveFormula {
  readonly kind: 'connective';
  readonly connective: LogicalConnective;
  readonly formulas: [DCECFormula] | [DCECFormula, DCECFormula];
}

/**
 * A quantified formula: ∀variable.body or ∃variable.body.
 */
export interface QuantifiedFormula {
  readonly kind: 'quantified';
  readonly quantifier: QuantifierKind;
  readonly variable: string;
  readonly body: DCECFormula;
}

/**
 * The DCEC formula union type — a discriminated union over all formula kinds.
 */
export type DCECFormula =
  | AtomicFormula
  | DeonticFormula
  | CognitiveFormula
  | TemporalFormula
  | ConnectiveFormula
  | QuantifiedFormula;

// ---------------------------------------------------------------------------
// Serialisation — deterministic string for equality / cache keying
// ---------------------------------------------------------------------------

/** Serialise a Term to a canonical string. */
export function serializeTerm(t: Term): string {
  switch (t.kind) {
    case 'variable': return `?${t.name}`;
    case 'constant': return t.value;
    case 'function': return `${t.name}(${t.args.map(serializeTerm).join(',')})`;
  }
}

/** Serialise a DCECFormula to a canonical string (used for equality and hashing). */
export function serializeFormula(f: DCECFormula): string {
  switch (f.kind) {
    case 'atomic':
      return f.args.length === 0
        ? f.predicate
        : `${f.predicate}(${f.args.map(serializeTerm).join(',')})`;

    case 'deontic': {
      const inner = serializeFormula(f.formula);
      const agent = f.agent ? `,${serializeTerm(f.agent)}` : '';
      const time  = f.time  ? `,${serializeTerm(f.time)}`  : '';
      return `${f.operator}(${inner}${agent}${time})`;
    }

    case 'cognitive': {
      const time = f.time ? `,${serializeTerm(f.time)}` : '';
      return `${f.operator}(${serializeTerm(f.agent)},${serializeFormula(f.formula)}${time})`;
    }

    case 'temporal':
      return `${f.operator}(${serializeFormula(f.formula)},${serializeTerm(f.time)})`;

    case 'connective': {
      const [a, b] = f.formulas;
      if (f.connective === 'NOT') return `NOT(${serializeFormula(a)})`;
      return `${f.connective}(${serializeFormula(a)},${serializeFormula(b!)})`;
    }

    case 'quantified':
      return `${f.quantifier}(${f.variable},${serializeFormula(f.body)})`;
  }
}

// ---------------------------------------------------------------------------
// Constructor helpers (mirrors Python `Atom`, `Conjunction`, etc. in dcec_core.py)
// ---------------------------------------------------------------------------

/** Create a nullary or n-ary atomic formula. */
export function Atom(predicate: string, ...args: Term[]): AtomicFormula {
  return { kind: 'atomic', predicate, args };
}

/** Create a constant term. */
export function Const(value: string): ConstantTerm {
  return { kind: 'constant', value };
}

/** Create a variable term. */
export function Var(name: string): VariableTerm {
  return { kind: 'variable', name };
}

/** Create a function application term. */
export function Func(name: string, ...args: Term[]): FunctionTerm {
  return { kind: 'function', name, args };
}

/** O(φ [, agent] [, time]) — obligation. */
export function Obligation(formula: DCECFormula, agent?: Term, time?: Term): DeonticFormula {
  return { kind: 'deontic', operator: 'O', formula, agent, time };
}

/** P(φ [, agent] [, time]) — permission. */
export function Permission(formula: DCECFormula, agent?: Term, time?: Term): DeonticFormula {
  return { kind: 'deontic', operator: 'P', formula, agent, time };
}

/** F(φ [, agent] [, time]) — prohibition / forbidden. */
export function Prohibition(formula: DCECFormula, agent?: Term, time?: Term): DeonticFormula {
  return { kind: 'deontic', operator: 'F', formula, agent, time };
}

/** NOT(φ) — negation. */
export function Negation(formula: DCECFormula): ConnectiveFormula {
  return { kind: 'connective', connective: 'NOT', formulas: [formula] };
}

/** AND(a, b) — conjunction. */
export function Conjunction(a: DCECFormula, b: DCECFormula): ConnectiveFormula {
  return { kind: 'connective', connective: 'AND', formulas: [a, b] };
}

/** OR(a, b) — disjunction. */
export function Disjunction(a: DCECFormula, b: DCECFormula): ConnectiveFormula {
  return { kind: 'connective', connective: 'OR', formulas: [a, b] };
}

/** IMPLIES(ant, con) — material implication. */
export function Implies(antecedent: DCECFormula, consequent: DCECFormula): ConnectiveFormula {
  return { kind: 'connective', connective: 'IMPLIES', formulas: [antecedent, consequent] };
}

/** IFF(a, b) — biconditional. */
export function Iff(a: DCECFormula, b: DCECFormula): ConnectiveFormula {
  return { kind: 'connective', connective: 'IFF', formulas: [a, b] };
}

/** HOLDS_AT(f, t) — fluent f holds at time t. */
export function HoldsAt(formula: DCECFormula, time: Term): TemporalFormula {
  return { kind: 'temporal', operator: 'HOLDS_AT', formula, time };
}

/** HAPPENS(event, time) — event atom holds at time. */
export function Happens(event: DCECFormula, time: Term): TemporalFormula {
  return { kind: 'temporal', operator: 'HAPPENS', formula: event, time };
}

/** B(agent, formula [, time]) — belief. */
export function Belief(agent: Term, formula: DCECFormula, time?: Term): CognitiveFormula {
  return { kind: 'cognitive', operator: 'B', agent, formula, time };
}

/** ∀variable.body. */
export function ForAll(variable: string, body: DCECFormula): QuantifiedFormula {
  return { kind: 'quantified', quantifier: 'FORALL', variable, body };
}

/** ∃variable.body. */
export function Exists(variable: string, body: DCECFormula): QuantifiedFormula {
  return { kind: 'quantified', quantifier: 'EXISTS', variable, body };
}

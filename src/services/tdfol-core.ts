/**
 * TDFOL Core Types — rich type hierarchy for Temporal Deontic First-Order Logic.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/tdfol_core.py (826 lines):
 *   LogicOperator / Quantifier / DeonticOperator / TemporalOperator / Sort (enums)
 *   TDFOLNode (abstract base)
 *   Term / Variable / Constant / FunctionApplication
 *   Formula / Predicate / BinaryFormula / UnaryFormula / QuantifiedFormula
 *   DeonticFormulaTDFOL / TemporalFormulaTDFOL
 *   TDFOLKnowledgeBase
 *
 * Sprint 23, T-116.
 * Reference: ipfs_datasets_py/logic/TDFOL/tdfol_core.py
 */

// ---------------------------------------------------------------------------
// Operator enumerations
// ---------------------------------------------------------------------------

export type LogicOperator = '∧' | '∨' | '¬' | '→' | '↔' | '⊕';
export type QuantifierKind = '∀' | '∃';
export type TDFOLDeonticOp = 'O' | 'P' | 'F';
export type TDFOLTemporalOp = '□' | '◊' | 'X' | 'U' | 'S' | 'W' | 'R';
export type SortKind = 'Agent' | 'Action' | 'Event' | 'Time' | 'Proposition' | 'Object' | 'State' | 'Condition';

// ---------------------------------------------------------------------------
// TDFOLNode — abstract base
// ---------------------------------------------------------------------------

export interface TDFOLNode {
  readonly kind: string;
  /** Human-readable string representation. */
  toStr(pretty?: boolean): string;
  toDict(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Term hierarchy
// ---------------------------------------------------------------------------

export interface Variable extends TDFOLNode {
  readonly kind: 'variable';
  readonly name: string;
  readonly sort?: SortKind;
}

export interface Constant extends TDFOLNode {
  readonly kind: 'constant';
  readonly name:  string;
  readonly value: unknown;
  readonly sort?: SortKind;
}

export interface FunctionApplication extends TDFOLNode {
  readonly kind:      'function_app';
  readonly funcName:  string;
  readonly args:      Term[];
  readonly returnSort?: SortKind;
}

export type Term = Variable | Constant | FunctionApplication;

// ---------------------------------------------------------------------------
// Formula hierarchy
// ---------------------------------------------------------------------------

export interface Predicate extends TDFOLNode {
  readonly kind:      'predicate';
  readonly name:      string;
  readonly args:      Term[];
  readonly negated:   boolean;
}

export interface BinaryFormula extends TDFOLNode {
  readonly kind:      'binary';
  readonly operator:  LogicOperator;
  readonly left:      Formula;
  readonly right:     Formula;
}

export interface UnaryFormula extends TDFOLNode {
  readonly kind:      'unary';
  readonly operator:  '¬';
  readonly operand:   Formula;
}

export interface QuantifiedFormula extends TDFOLNode {
  readonly kind:       'quantified';
  readonly quantifier: QuantifierKind;
  readonly variable:   string;
  readonly sort?:      SortKind;
  readonly body:       Formula;
}

export interface DeonticFormulaTDFOL extends TDFOLNode {
  readonly kind:      'deontic';
  readonly operator:  TDFOLDeonticOp;
  readonly formula:   Formula;
  readonly agent?:    string;
  readonly time?:     string;
}

export interface TemporalFormulaTDFOL extends TDFOLNode {
  readonly kind:      'temporal';
  readonly operator:  TDFOLTemporalOp;
  readonly formula:   Formula;
  readonly until?:    Formula;  // for UNTIL / RELEASE
}

export type Formula =
  | Predicate
  | BinaryFormula
  | UnaryFormula
  | QuantifiedFormula
  | DeonticFormulaTDFOL
  | TemporalFormulaTDFOL;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function mkVariable(name: string, sort?: SortKind): Variable {
  return {
    kind: 'variable', name, sort,
    toStr() { return sort ? `${name}:${sort}` : name; },
    toDict() { return { kind: 'variable', name, sort: sort ?? null }; },
  };
}

export function mkConstant(name: string, value?: unknown, sort?: SortKind): Constant {
  return {
    kind: 'constant', name, value: value ?? name, sort,
    toStr() { return name; },
    toDict() { return { kind: 'constant', name, value: value ?? name, sort: sort ?? null }; },
  };
}

export function mkFuncApp(funcName: string, args: Term[], returnSort?: SortKind): FunctionApplication {
  return {
    kind: 'function_app', funcName, args, returnSort,
    toStr(pretty) { return `${funcName}(${args.map(a => a.toStr(pretty)).join(', ')})`; },
    toDict() { return { kind: 'function_app', funcName, args: args.map(a => a.toDict()), returnSort: returnSort ?? null }; },
  };
}

export function mkPredicate(name: string, args: Term[] = [], negated = false): Predicate {
  return {
    kind: 'predicate', name, args, negated,
    toStr(pretty) {
      const argsStr = args.length ? `(${args.map(a => a.toStr(pretty)).join(', ')})` : '';
      return negated ? `¬${name}${argsStr}` : `${name}${argsStr}`;
    },
    toDict() { return { kind: 'predicate', name, args: args.map(a => a.toDict()), negated }; },
    getFreeVariables() { return new Set(args.flatMap(a => a.kind === 'variable' ? [a.name] : [])); },
  } as Predicate & { getFreeVariables(): Set<string> };
}

export function mkBinary(operator: LogicOperator, left: Formula, right: Formula): BinaryFormula {
  return {
    kind: 'binary', operator, left, right,
    toStr(p) { return p ? `(${left.toStr(p)} ${operator} ${right.toStr(p)})` : `${left.toStr()} ${operator} ${right.toStr()}`; },
    toDict() { return { kind: 'binary', operator, left: left.toDict(), right: right.toDict() }; },
  };
}

export function mkUnary(operand: Formula): UnaryFormula {
  return {
    kind: 'unary', operator: '¬', operand,
    toStr(p) { return `¬${operand.toStr(p)}`; },
    toDict() { return { kind: 'unary', operator: '¬', operand: operand.toDict() }; },
  };
}

export function mkQuantified(quantifier: QuantifierKind, variable: string, body: Formula, sort?: SortKind): QuantifiedFormula {
  return {
    kind: 'quantified', quantifier, variable, sort, body,
    toStr(p) { const v = sort ? `${variable}:${sort}` : variable; return `${quantifier}${v}.(${body.toStr(p)})`; },
    toDict() { return { kind: 'quantified', quantifier, variable, sort: sort ?? null, body: body.toDict() }; },
  };
}

export function mkDeontic(operator: TDFOLDeonticOp, formula: Formula, agent?: string, time?: string): DeonticFormulaTDFOL {
  return {
    kind: 'deontic', operator, formula, agent, time,
    toStr(p) {
      const inner = formula.toStr(p);
      const a = agent ? `[${agent}]` : '';
      const t = time  ? `@${time}` : '';
      return `${operator}${a}(${inner})${t}`;
    },
    toDict() { return { kind: 'deontic', operator, formula: formula.toDict(), agent: agent ?? null, time: time ?? null }; },
  };
}

export function mkTemporal(operator: TDFOLTemporalOp, formula: Formula, until?: Formula): TemporalFormulaTDFOL {
  return {
    kind: 'temporal', operator, formula, until,
    toStr(p) {
      const inner = formula.toStr(p);
      if (until) return `${inner} ${operator} ${until.toStr(p)}`;
      return `${operator}(${inner})`;
    },
    toDict() { return { kind: 'temporal', operator, formula: formula.toDict(), until: until?.toDict() ?? null }; },
  };
}

// ---------------------------------------------------------------------------
// TDFOLKnowledgeBase
// ---------------------------------------------------------------------------

export interface KnowledgeBaseEntry {
  readonly formula: Formula;
  readonly name?:   string;
  readonly role:    'axiom' | 'theorem' | 'definition' | 'goal';
}

/**
 * A TDFOL knowledge base — stores axioms, theorems, definitions, and goals.
 * Python ref: `TDFOLKnowledgeBase` in tdfol_core.py.
 */
export class TDFOLKnowledgeBase {
  private readonly _entries: KnowledgeBaseEntry[] = [];
  private readonly _definitions: Map<string, Formula> = new Map();

  addAxiom(formula: Formula, name?: string): void {
    this._entries.push({ formula, name, role: 'axiom' });
  }

  addTheorem(formula: Formula, name?: string): void {
    this._entries.push({ formula, name, role: 'theorem' });
  }

  addDefinition(name: string, formula: Formula): void {
    this._definitions.set(name, formula);
    this._entries.push({ formula, name, role: 'definition' });
  }

  addGoal(formula: Formula, name?: string): void {
    this._entries.push({ formula, name, role: 'goal' });
  }

  getFormulas(): Formula[] {
    return this._entries.map(e => e.formula);
  }

  getByRole(role: KnowledgeBaseEntry['role']): Formula[] {
    return this._entries.filter(e => e.role === role).map(e => e.formula);
  }

  getDefinition(name: string): Formula | undefined {
    return this._definitions.get(name);
  }

  get size(): number { return this._entries.length; }

  toDict(): Record<string, unknown> {
    return {
      entries: this._entries.map(e => ({ ...e.toDict?.() ?? {}, formula: e.formula.toDict(), name: e.name ?? null, role: e.role })),
      definitions: Object.fromEntries([...this._definitions.entries()].map(([k, v]) => [k, v.toDict()])),
    };
  }
}

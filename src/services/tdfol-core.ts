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
  /** @deprecated PORT-054: use UnaryFormula(NOT, pred) instead of negated flag */
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
  readonly variableTerm?: Variable;
  readonly sort?:      SortKind;
  readonly body:       Formula;
}

export interface DeonticFormulaTDFOL extends TDFOLNode {
  readonly kind:      'deontic';
  readonly operator:  TDFOLDeonticOp;
  readonly formula:   Formula;
  readonly agent?:    string;
  readonly agentTerm?: Term;   // PORT-052: structured agent term e.g. f(x,y); prefer this for FOL agents
  readonly time?:     string;
  readonly context?:  string;  // PORT-052: Python-compatible context alias for temporal/legal scope
}

export interface TemporalFormulaTDFOL extends TDFOLNode {
  readonly kind:      'temporal';
  readonly operator:  TDFOLTemporalOp;
  readonly formula:   Formula;
  readonly until?:    Formula;  // for UNTIL / RELEASE
  readonly timeBound?: number; // PORT-051: bounded ops □[n]φ — bound in steps
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
  const node = {
    kind: 'variable', name, sort,
    toStr() { return sort ? `${name}:${sort}` : name; },
    toDict() { return { kind: 'variable', name, sort: sort ?? null }; },
    getFreeVariables() { return new Set([name]); },
    substitute(varName: string, replacement: Term) { return name === varName ? replacement : node; },
  };
  return node as Variable;
}

export function mkConstant(name: string, value?: unknown, sort?: SortKind): Constant {
  const node = {
    kind: 'constant', name, value: value ?? name, sort,
    toStr() { return name; },
    toDict() { return { kind: 'constant', name, value: value ?? name, sort: sort ?? null }; },
    getFreeVariables() { return new Set<string>(); },
    substitute() { return node; },
  };
  return node as Constant;
}

export function mkFuncApp(funcName: string, args: Term[], returnSort?: SortKind): FunctionApplication {
  const node = {
    kind: 'function_app', funcName, args, returnSort,
    toStr(pretty) { return `${funcName}(${args.map(a => a.toStr(pretty)).join(', ')})`; },
    toDict() { return { kind: 'function_app', funcName, args: args.map(a => a.toDict()), returnSort: returnSort ?? null }; },
    getFreeVariables() { return unionSets(args.map(getFreeVariablesOfTerm)); },
    substitute(varName: string, replacement: Term) {
      return mkFuncApp(funcName, args.map(a => substituteTerm(a, varName, replacement)), returnSort);
    },
  };
  return node as FunctionApplication;
}

export function mkPredicate(name: string, args: Term[] = [], negated = false): Predicate {
  const node = {
    kind: 'predicate', name, args, negated,
    toStr(pretty) {
      const argsStr = args.length ? `(${args.map(a => a.toStr(pretty)).join(', ')})` : '';
      return negated ? `¬${name}${argsStr}` : `${name}${argsStr}`;
    },
    toDict() { return { kind: 'predicate', name, args: args.map(a => a.toDict()), negated }; },
    getFreeVariables() { return unionSets(args.map(getFreeVariablesOfTerm)); },
    substitute(varName: string, replacement: Term) {
      return mkPredicate(name, args.map(a => substituteTerm(a, varName, replacement)), negated);
    },
  };
  return node as Predicate;
}

export function mkBinary(operator: LogicOperator, left: Formula, right: Formula): BinaryFormula {
  const node = {
    kind: 'binary', operator, left, right,
    toStr(p) { return p ? `(${left.toStr(p)} ${operator} ${right.toStr(p)})` : `${left.toStr()} ${operator} ${right.toStr()}`; },
    toDict() { return { kind: 'binary', operator, left: left.toDict(), right: right.toDict() }; },
    getFreeVariables() { return unionSets([getFreeVariables(left), getFreeVariables(right)]); },
    substitute(varName: string, replacement: Term) {
      return mkBinary(operator, substitute(left, varName, replacement), substitute(right, varName, replacement));
    },
  };
  return node as BinaryFormula;
}

export function mkUnary(operand: Formula): UnaryFormula {
  const node = {
    kind: 'unary', operator: '¬', operand,
    toStr(p) { return `¬${operand.toStr(p)}`; },
    toDict() { return { kind: 'unary', operator: '¬', operand: operand.toDict() }; },
    getFreeVariables() { return getFreeVariables(operand); },
    substitute(varName: string, replacement: Term) {
      return mkUnary(substitute(operand, varName, replacement));
    },
  };
  return node as UnaryFormula;
}

export function mkQuantified(quantifier: QuantifierKind, variable: string | Variable, body: Formula, sort?: SortKind): QuantifiedFormula {
  const variableTerm = typeof variable === 'string' ? mkVariable(variable, sort) : variable;
  const variableName = variableTerm.name;
  const variableSort = variableTerm.sort ?? sort;
  const node = {
    kind: 'quantified', quantifier, variable: variableName, variableTerm, sort: variableSort, body,
    toStr(p) {
      const v = variableSort ? `${variableName}:${variableSort}` : variableName;
      return `${quantifier}${v}.(${body.toStr(p)})`;
    },
    toDict() {
      return { kind: 'quantified', quantifier, variable: variableName, variableTerm: variableTerm.toDict(), sort: variableSort ?? null, body: body.toDict() };
    },
    getFreeVariables() {
      const free = getFreeVariables(body);
      free.delete(variableName);
      return free;
    },
    substitute(varName: string, replacement: Term) {
      if (varName === variableName) return node;
      return mkQuantified(quantifier, variableTerm, substitute(body, varName, replacement), variableSort);
    },
  };
  return node as QuantifiedFormula;
}

export function mkDeontic(operator: TDFOLDeonticOp, formula: Formula, agent?: string | Term, context?: string): DeonticFormulaTDFOL {
  const agentTerm = typeof agent === 'object' ? agent : undefined;
  const agentName = typeof agent === 'string' ? agent : agentTerm?.toStr();
  const node = {
    kind: 'deontic', operator, formula, agent: agentName, agentTerm, time: context, context,
    toStr(p) {
      const inner = formula.toStr(p);
      const a = agentName ? `[${agentName}]` : '';
      const t = context  ? `@${context}` : '';
      return `${operator}${a}(${inner})${t}`;
    },
    toDict() {
      return {
        kind: 'deontic',
        operator,
        formula: formula.toDict(),
        agent: agentName ?? null,
        agentTerm: agentTerm?.toDict() ?? null,
        time: context ?? null,
        context: context ?? null,
      };
    },
    getFreeVariables() {
      return unionSets([
        getFreeVariables(formula),
        agentTerm ? getFreeVariablesOfTerm(agentTerm) : new Set<string>(),
      ]);
    },
    substitute(varName: string, replacement: Term) {
      return mkDeontic(
        operator,
        substitute(formula, varName, replacement),
        agentTerm ? substituteTerm(agentTerm, varName, replacement) : agentName,
        context,
      );
    },
  };
  return node as DeonticFormulaTDFOL;
}

export function mkTemporal(operator: TDFOLTemporalOp, formula: Formula, until?: Formula, timeBound?: number): TemporalFormulaTDFOL {
  const node = {
    kind: 'temporal', operator, formula, until, timeBound,
    toStr(p) {
      const inner = formula.toStr(p);
      if (until) return `${inner} ${operator} ${until.toStr(p)}`;
      const bound = timeBound !== undefined ? `[${timeBound}]` : '';
      return `${operator}${bound}(${inner})`;
    },
    toDict() {
      return { kind: 'temporal', operator, formula: formula.toDict(), until: until?.toDict() ?? null, timeBound: timeBound ?? null };
    },
    getFreeVariables() {
      return unionSets([
        getFreeVariables(formula),
        until ? getFreeVariables(until) : new Set<string>(),
      ]);
    },
    substitute(varName: string, replacement: Term) {
      return mkTemporal(
        operator,
        substitute(formula, varName, replacement),
        until ? substitute(until, varName, replacement) : undefined,
        timeBound,
      );
    },
  };
  return node as TemporalFormulaTDFOL;
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
      entries: this._entries.map(e => ({ formula: e.formula.toDict(), name: e.name ?? null, role: e.role })),
      definitions: Object.fromEntries([...this._definitions.entries()].map(([k, v]) => [k, v.toDict()])),
    };
  }
}

// PORT-003: Term substitution and free variable collection.
// Python tdfol_core.py:111, dcec_core.py:700-709,1380-1394

function unionSets(sets: Iterable<Set<string>>): Set<string> {
  const out = new Set<string>();
  for (const set of sets) {
    for (const value of set) out.add(value);
  }
  return out;
}

export function getFreeVariablesOfTerm(term: Term): Set<string> {
  switch (term.kind) {
    case 'variable':
      return new Set([term.name]);
    case 'constant':
      return new Set();
    case 'function_app':
      return unionSets(term.args.map(getFreeVariablesOfTerm));
  }
}

export function substituteTerm(term: Term, varName: string, replacement: Term | string): Term {
  const replacementTerm = typeof replacement === 'string' ? mkConstant(replacement) : replacement;
  switch (term.kind) {
    case 'variable':
      return term.name === varName ? replacementTerm : term;
    case 'constant':
      return term;
    case 'function_app':
      return mkFuncApp(term.funcName, term.args.map(a => substituteTerm(a, varName, replacementTerm)), term.returnSort);
  }
}

export function getFreeVariables(formula: Formula): Set<string> {
  switch (formula.kind) {
    case 'predicate':
      return unionSets(formula.args.map(getFreeVariablesOfTerm));
    case 'binary':
      return unionSets([getFreeVariables(formula.left), getFreeVariables(formula.right)]);
    case 'unary':
      return getFreeVariables(formula.operand);
    case 'quantified': {
      const free = getFreeVariables(formula.body);
      free.delete(formula.variable);
      return free;
    }
    case 'deontic':
      return unionSets([
        getFreeVariables(formula.formula),
        formula.agentTerm ? getFreeVariablesOfTerm(formula.agentTerm) : new Set<string>(),
      ]);
    case 'temporal':
      return unionSets([
        getFreeVariables(formula.formula),
        formula.until ? getFreeVariables(formula.until) : new Set<string>(),
      ]);
  }
}

/** Substitute a free variable with a term. Bound quantifier variables shadow replacements. */
export function substitute(formula: Formula, varName: string, replacement: Term | string): Formula {
  const replacementTerm = typeof replacement === 'string' ? mkConstant(replacement) : replacement;
  switch (formula.kind) {
    case 'predicate':
      return mkPredicate(formula.name, formula.args.map(a => substituteTerm(a, varName, replacementTerm)), Boolean(formula.negated));
    case 'binary':
      return mkBinary(formula.operator, substitute(formula.left, varName, replacementTerm), substitute(formula.right, varName, replacementTerm));
    case 'unary':
      return mkUnary(substitute(formula.operand, varName, replacementTerm));
    case 'quantified':
      if (formula.variable === varName) return formula;
      return mkQuantified(formula.quantifier, formula.variableTerm ?? mkVariable(formula.variable, formula.sort), substitute(formula.body, varName, replacementTerm), formula.sort);
    case 'deontic':
      return mkDeontic(
        formula.operator,
        substitute(formula.formula, varName, replacementTerm),
        formula.agentTerm ? substituteTerm(formula.agentTerm, varName, replacementTerm) : formula.agent,
        formula.context ?? formula.time,
      );
    case 'temporal':
      return mkTemporal(
        formula.operator,
        substitute(formula.formula, varName, replacementTerm),
        formula.until ? substitute(formula.until, varName, replacementTerm) : undefined,
        formula.timeBound,
      );
  }
}

/**
 * DCEC Namespace + NL Policy Compiler — T-280 + T-281
 * Ports of CEC/native/dcec_namespace.py (388L) and CEC/nl/nl_to_policy_compiler.py (420L)
 */

import { Sort, DCECPredicate, DCECFunction, makeSort, makePredicate, makeFunction, SORT_OBJECT } from '../dcec/dcec-core-types';

// ---------------------------------------------------------------------------
// DCECNamespace (T-280)
// ---------------------------------------------------------------------------

export interface NamespaceExportData {
  sorts:      Sort[];
  predicates: DCECPredicate[];
  functions:  DCECFunction[];
  constants:  Record<string, string>;
}

/**
 * DCEC semantic namespace — registry for sorts, predicates, functions, constants.
 * TypeScript port of `DCECNamespace` from `CEC/native/dcec_namespace.py`.
 */
export class DCECNamespace {
  private readonly sorts      = new Map<string, Sort>();
  private readonly predicates = new Map<string, DCECPredicate>();
  private readonly functions  = new Map<string, DCECFunction>();
  private readonly constants  = new Map<string, string>();

  constructor(readonly name: string = 'default') {}

  addSort(name: string, parent?: string): Sort {
    const s = makeSort(name, parent);
    this.sorts.set(name, s);
    return s;
  }

  addPredicate(name: string, argSorts: Sort[]): DCECPredicate {
    const p = makePredicate(name, argSorts);
    this.predicates.set(name, p);
    return p;
  }

  addFunction(name: string, argSorts: Sort[], returnSort: Sort = SORT_OBJECT): DCECFunction {
    const f = makeFunction(name, argSorts, returnSort);
    this.functions.set(name, f);
    return f;
  }

  addConstant(name: string, type: string): void { this.constants.set(name, type); }

  lookup(name: string): Sort | DCECPredicate | DCECFunction | string | null {
    return this.sorts.get(name) ?? this.predicates.get(name) ?? this.functions.get(name) ?? this.constants.get(name) ?? null;
  }

  export(): NamespaceExportData {
    return {
      sorts:      [...this.sorts.values()],
      predicates: [...this.predicates.values()],
      functions:  [...this.functions.values()],
      constants:  Object.fromEntries(this.constants),
    };
  }
}

export class DCECContainer {
  private readonly namespaces = new Map<string, DCECNamespace>();
  private readonly _default: DCECNamespace;

  constructor() {
    this._default = new DCECNamespace('default');
    this.namespaces.set('default', this._default);
  }

  getNamespace(name = 'default'): DCECNamespace {
    if (!this.namespaces.has(name)) this.namespaces.set(name, new DCECNamespace(name));
    return this.namespaces.get(name)!;
  }

  merge(other: DCECNamespace): void {
    const exp = other.export();
    const ns = this.getNamespace(other.name);
    for (const s of exp.sorts) ns.addSort(s.name, s.parent);
    for (const p of exp.predicates) ns.addPredicate(p.name, p.argSorts);
    for (const f of exp.functions) ns.addFunction(f.name, f.argSorts, f.returnSort);
    for (const [k, v] of Object.entries(exp.constants)) ns.addConstant(k, v);
  }

  toDict(): Record<string, NamespaceExportData> {
    const out: Record<string, NamespaceExportData> = {};
    for (const [name, ns] of this.namespaces) out[name] = ns.export();
    return out;
  }
}

// ---------------------------------------------------------------------------
// NLToPolicyCompiler (T-281)
// ---------------------------------------------------------------------------

import { PatternMatcher, PatternType } from '../shared/tdfol-nl-patterns.js';

export interface PolicyClauseFromNL {
  clause_type: 'permission' | 'prohibition' | 'obligation' | 'unknown';
  action: string;
  actor: string | null;
  resource: string | null;
  confidence: number;
  raw: string;
}

export interface NLCompilationResult {
  text:       string;
  clauses:    PolicyClauseFromNL[];
  formula:    string;
  confidence: number;
  errors:     string[];
}

export interface NLPolicyCompilerStats {
  totalCompiled: number; succeeded: number; failed: number; totalClauses: number;
}

export function compileDcecToClause(formula: string): PolicyClauseFromNL {
  if (/^O\(/.test(formula)) {
    const action = formula.replace(/^O\(/, '').replace(/\)$/, '').trim();
    return { clause_type: 'obligation', action, actor: null, resource: null, confidence: 0.9, raw: formula };
  }
  if (/^P\(/.test(formula)) {
    const action = formula.replace(/^P\(/, '').replace(/\)$/, '').trim();
    return { clause_type: 'permission', action, actor: null, resource: null, confidence: 0.85, raw: formula };
  }
  if (/^F\(/.test(formula)) {
    const action = formula.replace(/^F\(/, '').replace(/\)$/, '').trim();
    return { clause_type: 'prohibition', action, actor: null, resource: null, confidence: 0.9, raw: formula };
  }
  return { clause_type: 'unknown', action: formula, actor: null, resource: null, confidence: 0.3, raw: formula };
}

export class NLToPolicyCompiler {
  private readonly matcher = new PatternMatcher();
  private readonly stats: NLPolicyCompilerStats = { totalCompiled: 0, succeeded: 0, failed: 0, totalClauses: 0 };

  compile(text: string): NLCompilationResult {
    this.stats.totalCompiled++;
    const matches = this.matcher.match(text);
    const clauses: PolicyClauseFromNL[] = [];
    const errors: string[] = [];

    for (const m of matches) {
      let clause_type: PolicyClauseFromNL['clause_type'] = 'unknown';
      if (m.pattern.type === PatternType.OBLIGATION)   clause_type = 'obligation';
      else if (m.pattern.type === PatternType.PERMISSION)  clause_type = 'permission';
      else if (m.pattern.type === PatternType.PROHIBITION) clause_type = 'prohibition';
      else continue;

      clauses.push({
        clause_type,
        action:     m.entities['action'] ?? m.text,
        actor:      m.entities['agent'] ?? null,
        resource:   m.entities['resource'] ?? null,
        confidence: m.confidence,
        raw:        m.text,
      });
    }

    if (clauses.length === 0) errors.push('No policy clauses extracted');

    const formula = clauses.length > 0
      ? clauses.map(c => {
          const op = c.clause_type === 'obligation' ? 'O' : c.clause_type === 'permission' ? 'P' : 'F';
          return `${op}(${c.action.replace(/\s+/g, '_')})`;
        }).join(' ∧ ')
      : '';

    const confidence = clauses.length > 0
      ? clauses.reduce((s, c) => s + c.confidence, 0) / clauses.length
      : 0;

    if (clauses.length > 0) this.stats.succeeded++; else this.stats.failed++;
    this.stats.totalClauses += clauses.length;

    return { text, clauses, formula, confidence, errors };
  }

  compileBatch(texts: string[]): NLCompilationResult[] { return texts.map(t => this.compile(t)); }
  getStats(): Readonly<NLPolicyCompilerStats> { return { ...this.stats }; }
}

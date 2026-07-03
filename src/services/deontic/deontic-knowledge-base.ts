/**
 * DeonticKnowledgeBase — temporal deontic knowledge base with rule inference.
 *
 * Mirrors ipfs_datasets_py/logic/deontic/knowledge_base.py (245 lines).
 *
 * Provides:
 *   - Typed domain entities: `TimeInterval`, `Party`, `Action`, `Proposition`
 *   - `DeonticStatement` with modality (O/P/F/OPT), actor, action, time window, condition
 *   - `DeonticKnowledgeBase`: add statements/rules/facts, infer via forward-chaining,
 *     check compliance for a given actor+action+time
 *
 * Sprint 12, T-73.
 * Reference: ipfs_datasets_py/logic/deontic/knowledge_base.py §DeonticKnowledgeBase
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type KBDeonticModality = 'O' | 'P' | 'F' | 'OPT';

/**
 * A closed time interval.  Either `end` or `durationDays` may be used to
 * express the end point; `durationDays` is resolved against `start` when
 * `end` is absent.
 */
export interface TimeInterval {
  readonly start?: Date;
  readonly end?: Date;
  readonly durationDays?: number;
}

/** A named party in a deontic norm (actor or recipient). */
export interface Party {
  readonly name: string;
  readonly role: string;
  readonly entityId: string;
}

/** A typed action (verb + object). */
export interface DeonticAction {
  readonly verb: string;
  readonly objectNoun: string;
  readonly actionId: string;
}

// ---------------------------------------------------------------------------
// Proposition hierarchy (mirrors Python ABC)
// ---------------------------------------------------------------------------

export interface Proposition {
  readonly kind: string;
  /** Evaluate the proposition against a fact model. */
  evaluate(model: Record<string, boolean>): boolean;
  /** Human-readable string representation. */
  toString(): string;
}

export interface PredicateProposition extends Proposition {
  readonly kind: 'predicate';
  readonly name: string;
  readonly args: readonly string[];
}

export interface ConjunctionProposition extends Proposition {
  readonly kind: 'conjunction';
  readonly left: Proposition;
  readonly right: Proposition;
}

export interface DisjunctionProposition extends Proposition {
  readonly kind: 'disjunction';
  readonly left: Proposition;
  readonly right: Proposition;
}

export interface NegationProposition extends Proposition {
  readonly kind: 'negation';
  readonly prop: Proposition;
}

export interface ImplicationProposition extends Proposition {
  readonly kind: 'implication';
  readonly antecedent: Proposition;
  readonly consequent: Proposition;
}

// ---------------------------------------------------------------------------
// Proposition constructors
// ---------------------------------------------------------------------------

function resolveEnd(interval: TimeInterval): Date | undefined {
  if (interval.end) return interval.end;
  if (interval.start !== undefined && interval.durationDays !== undefined) {
    const d = new Date(interval.start);
    d.setDate(d.getDate() + interval.durationDays);
    return d;
  }
  return undefined;
}

/** True when `atTime` falls within the interval. */
export function intervalContains(interval: TimeInterval, atTime: Date): boolean {
  if (interval.start !== undefined && atTime < interval.start) return false;
  const end = resolveEnd(interval);
  if (end !== undefined && atTime > end) return false;
  return true;
}

/** Create a predicate proposition: `name(arg1, arg2, …)`. */
export function Pred(name: string, ...args: string[]): PredicateProposition {
  return {
    kind: 'predicate',
    name,
    args,
    evaluate(model) { return Boolean(model[`${name}(${args.join(',')})`] ?? model[name]); },
    toString() { return args.length === 0 ? name : `${name}(${args.join(',')})`; },
  };
}

/** P ∧ Q */
export function And(left: Proposition, right: Proposition): ConjunctionProposition {
  return {
    kind: 'conjunction', left, right,
    evaluate(m) { return left.evaluate(m) && right.evaluate(m); },
    toString() { return `(${left} and ${right})`; },
  };
}

/** P ∨ Q */
export function Or(left: Proposition, right: Proposition): DisjunctionProposition {
  return {
    kind: 'disjunction', left, right,
    evaluate(m) { return left.evaluate(m) || right.evaluate(m); },
    toString() { return `(${left} or ${right})`; },
  };
}

/** ¬P */
export function Not(prop: Proposition): NegationProposition {
  return {
    kind: 'negation', prop,
    evaluate(m) { return !prop.evaluate(m); },
    toString() { return `not (${prop})`; },
  };
}

/** P → Q */
export function Implies(antecedent: Proposition, consequent: Proposition): ImplicationProposition {
  return {
    kind: 'implication', antecedent, consequent,
    evaluate(m) { return !antecedent.evaluate(m) || consequent.evaluate(m); },
    toString() { return `(${antecedent} -> ${consequent})`; },
  };
}

// ---------------------------------------------------------------------------
// DeonticStatement
// ---------------------------------------------------------------------------

/**
 * A typed deontic statement in the KB.
 *
 * Mirrors Python `DeonticStatement` dataclass in `knowledge_base.py`.
 */
export interface KBDeonticStatement {
  readonly modality: KBDeonticModality;
  readonly actor: Party;
  readonly action: DeonticAction;
  readonly recipient?: Party;
  readonly timeInterval?: TimeInterval;
  readonly condition?: Proposition;
}

// ---------------------------------------------------------------------------
// DeonticKnowledgeBase
// ---------------------------------------------------------------------------

/**
 * DeonticKnowledgeBase — stores deontic norms, rules, and ground facts;
 * supports forward-chaining rule inference and compliance checking.
 *
 * Usage:
 * ```ts
 * const kb = new DeonticKnowledgeBase();
 * const actor: Party = { name: 'Alice', role: 'user', entityId: 'alice' };
 * const action: DeonticAction = { verb: 'read', objectNoun: 'file', actionId: 'read_file' };
 * kb.addStatement({ modality: 'O', actor, action });
 * kb.addFact('logged_in');
 * const { compliant, reason } = kb.checkCompliance(actor, action, new Date());
 * ```
 */
export class DeonticKnowledgeBase {
  private readonly statements: KBDeonticStatement[] = [];
  private readonly rules: Array<{ condition: Proposition; statement: KBDeonticStatement }> = [];
  private facts: Record<string, boolean> = {};
  private derivedStatements: KBDeonticStatement[] = [];

  // ---------------------------------------------------------------------------
  // Mutation API
  // ---------------------------------------------------------------------------

  addStatement(statement: KBDeonticStatement): void {
    this.statements.push(statement);
    // Invalidate derived cache
    this.derivedStatements = [];
  }

  addRule(condition: Proposition, statement: KBDeonticStatement): void {
    this.rules.push({ condition, statement });
    this.derivedStatements = [];
  }

  addFact(factName: string, value = true): void {
    this.facts[factName] = value;
    this.derivedStatements = [];
  }

  // ---------------------------------------------------------------------------
  // Forward-chaining inference
  // ---------------------------------------------------------------------------

  /**
   * Derive all statements reachable from current rules + facts via forward chaining.
   * Returns the full set of base + derived statements.
   */
  inferStatements(): KBDeonticStatement[] {
    const derived = [...this.statements];
    let changed = true;

    while (changed) {
      changed = false;
      for (const { condition, statement } of this.rules) {
        if (condition.evaluate(this.facts)) {
          const key = this._statementKey(statement);
          if (!derived.some(s => this._statementKey(s) === key)) {
            derived.push(statement);
            changed = true;
          }
        }
      }
    }

    this.derivedStatements = derived;
    return derived;
  }

  // ---------------------------------------------------------------------------
  // Compliance checking
  // ---------------------------------------------------------------------------

  /**
   * Check whether `actor` performing `action` at `atTime` is compliant with
   * the KB's deontic norms.
   *
   * Returns `{ compliant, reason }`.
   */
  checkCompliance(actor: Party, action: DeonticAction, atTime: Date): { compliant: boolean; reason: string } {
    const all = this.derivedStatements.length > 0 ? this.derivedStatements : [...this.statements];

    const matching = all.filter(
      s => s.actor.entityId === actor.entityId && s.action.actionId === action.actionId,
    );

    for (const stmt of matching) {
      if (stmt.modality === 'F') {
        return { compliant: false, reason: `${actor.name} violates prohibition against ${action.verb} ${action.objectNoun}` };
      }
      if (stmt.modality === 'O') {
        if (stmt.timeInterval && !intervalContains(stmt.timeInterval, atTime)) {
          return { compliant: false, reason: `${actor.name} is outside the obligation window for ${action.verb} ${action.objectNoun}` };
        }
        // Check condition if any
        if (stmt.condition && !stmt.condition.evaluate(this.facts)) {
          continue; // Condition not met — norm not active
        }
        return { compliant: true, reason: `${actor.name} complies with obligation to ${action.verb} ${action.objectNoun}` };
      }
    }

    return { compliant: true, reason: `No active contrary deontic rule found for ${actor.name} and ${action.verb} ${action.objectNoun}` };
  }

  /** Return all base statements. */
  getStatements(): readonly KBDeonticStatement[] { return this.statements; }

  /** Return current fact model. */
  getFacts(): Readonly<Record<string, boolean>> { return this.facts; }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _statementKey(s: KBDeonticStatement): string {
    return `${s.modality}|${s.actor.entityId}|${s.action.actionId}`;
  }
}

// PORT-114: Allen's interval algebra for temporal reasoning
export type AllenRelation =
  | 'BEFORE' | 'AFTER' | 'MEETS' | 'MET_BY'
  | 'OVERLAPS' | 'OVERLAPPED_BY'
  | 'STARTS' | 'STARTED_BY'
  | 'DURING' | 'CONTAINS'
  | 'FINISHES' | 'FINISHED_BY'
  | 'EQUALS';

export interface TimeInterval { start: number; end: number }

export function allenRelation(a: TimeInterval, b: TimeInterval): AllenRelation {
  if (a.end < b.start)  return 'BEFORE';
  if (a.start > b.end)  return 'AFTER';
  if (a.end === b.start) return 'MEETS';
  if (a.start === b.end) return 'MET_BY';
  if (a.start < b.start && a.end < b.end && a.end > b.start) return 'OVERLAPS';
  if (a.start > b.start && a.end > b.end && a.start < b.end) return 'OVERLAPPED_BY';
  if (a.start === b.start && a.end < b.end) return 'STARTS';
  if (a.start === b.start && a.end > b.end) return 'STARTED_BY';
  if (a.start > b.start && a.end < b.end) return 'DURING';
  if (a.start < b.start && a.end > b.end) return 'CONTAINS';
  if (a.start < b.start && a.end === b.end) return 'FINISHES';
  if (a.start > b.start && a.end === b.end) return 'FINISHED_BY';
  return 'EQUALS';
}

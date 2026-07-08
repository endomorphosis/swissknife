/**
 * NL Policy Conflict Detector — T-210
 *
 * Port of ipfs_datasets_py/logic/CEC/nl/nl_policy_conflict_detector.py
 *
 * Detects conflicts within a compiled list of policy clauses:
 *  - Simultaneous permission + prohibition for the same action/resource
 *  - Duplicate obligation clauses for the same action/resource/actor
 */

// ---------------------------------------------------------------------------
// PolicyConflict
// ---------------------------------------------------------------------------

/** A detected conflict between policy clauses. */
export interface PolicyConflict {
  /** `'simultaneous_perm_prohib'` | `'multiple_obligations'` */
  conflictType: string;
  /** The conflicting action (e.g. `'read'`, `'pay'`). */
  action: string;
  /** The resource involved (defaults to wildcard `'*'`). */
  resource: string;
  /** Actors affected by the conflict. */
  actors: Set<string>;
  /** Set of clause types involved. */
  clauseTypes: Set<string>;
  /** Human-readable description. */
  description: string;

  /** Serialise to a plain object. */
  toDict(): Record<string, unknown>;
}

function makeConflict(
  conflictType: string,
  action: string,
  resource: string,
  actors: Set<string>,
  clauseTypes: Set<string>,
  description: string,
): PolicyConflict {
  return {
    conflictType,
    action,
    resource,
    actors,
    clauseTypes,
    description,
    toDict() {
      return {
        conflictType: this.conflictType,
        action: this.action,
        resource: this.resource,
        actors: [...this.actors].sort(),
        clauseTypes: [...this.clauseTypes].sort(),
        description: this.description,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// PolicyClause duck-type
// ---------------------------------------------------------------------------

/** Minimal interface for a policy clause. */
export interface PolicyClause {
  clause_type: 'permission' | 'prohibition' | 'obligation' | string;
  action: string;
  actor?: string | null;
  resource?: string | null;
}

// ---------------------------------------------------------------------------
// NLPolicyConflictDetector
// ---------------------------------------------------------------------------

/**
 * Detects conflicts in a list of compiled policy clauses.
 *
 * TypeScript port of `NLPolicyConflictDetector` from
 * `ipfs_datasets_py/logic/CEC/nl/nl_policy_conflict_detector.py`.
 */
export class NLPolicyConflictDetector {
  private readonly wildcard: string;

  constructor(wildcard = '*') {
    this.wildcard = wildcard;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Detect conflicts in `clauses`.
   *
   * @returns List of detected conflicts (empty when none).
   */
  detect(clauses: PolicyClause[]): PolicyConflict[] {
    return [...this._checkPermProhib(clauses), ...this._checkMultipleObligations(clauses)];
  }

  /**
   * Detect conflicts and emit console warnings for each one.
   * Also accepts an optional `auditLog` object; if provided, each conflict
   * is recorded via `auditLog.record(…)` if that method exists.
   */
  detectAndWarn(
    clauses: PolicyClause[],
    options: { auditLog?: { record?: (entry: Record<string, unknown>) => void }; policyCid?: string } = {},
  ): PolicyConflict[] {
    const conflicts = this.detect(clauses);
    const policyCid = options.policyCid ?? 'nl_policy';
    for (const conflict of conflicts) {
      const msg =
        `Policy conflict detected [${conflict.conflictType}]: ${conflict.description}`;
      console.warn(msg);
      if (options.auditLog?.record) {
        try {
          options.auditLog.record({
            policyCid,
            intentCid: `conflict:${conflict.conflictType}`,
            decision: 'deny',
            tool: conflict.action,
            actor: 'conflict_detector',
          });
        } catch {
          // Ignore audit failures
        }
      }
    }
    return conflicts;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _key(clause: PolicyClause): string {
    const action   = clause.action || this.wildcard;
    const resource = clause.resource || this.wildcard;
    return `${action}::${resource}`;
  }

  private _actor(clause: PolicyClause): string {
    return clause.actor || this.wildcard;
  }

  private _checkPermProhib(clauses: PolicyClause[]): PolicyConflict[] {
    const permissions  = new Map<string, PolicyClause[]>();
    const prohibitions = new Map<string, PolicyClause[]>();

    for (const c of clauses) {
      const k = this._key(c);
      if (c.clause_type === 'permission')  { appendToMap(permissions,  k, c); }
      else if (c.clause_type === 'prohibition') { appendToMap(prohibitions, k, c); }
    }

    const conflicts: PolicyConflict[] = [];
    for (const k of permissions.keys()) {
      if (!prohibitions.has(k)) continue;
      const permClauses   = permissions.get(k)!;
      const prohibClauses = prohibitions.get(k)!;

      const [action, resource] = k.split('::', 2);
      const permActors   = new Set(permClauses.map(c => this._actor(c)));
      const prohibActors = new Set(prohibClauses.map(c => this._actor(c)));
      const wildcard     = this.wildcard;

      const hasOverlap = setIntersects(permActors, prohibActors) ||
                         permActors.has(wildcard) || prohibActors.has(wildcard);

      if (hasOverlap) {
        const overlapping = permActors.has(wildcard) || prohibActors.has(wildcard)
          ? setUnion(permActors, prohibActors)
          : setIntersect(permActors, prohibActors);

        conflicts.push(makeConflict(
          'simultaneous_perm_prohib',
          action, resource,
          overlapping.size ? overlapping : setUnion(permActors, prohibActors),
          new Set(['permission', 'prohibition']),
          `Action '${action}' on '${resource}' is both permitted and prohibited for actor(s) ${[...overlapping].sort()}.`,
        ));
      }
    }
    return conflicts;
  }

  private _checkMultipleObligations(clauses: PolicyClause[]): PolicyConflict[] {
    const obligations = new Map<string, PolicyClause[]>();

    for (const c of clauses) {
      if (c.clause_type !== 'obligation') continue;
      const key = `${this._key(c)}::${this._actor(c)}`;
      appendToMap(obligations, key, c);
    }

    const conflicts: PolicyConflict[] = [];
    for (const [key, cs] of obligations.entries()) {
      if (cs.length <= 1) continue;
      const parts    = key.split('::', 3);
      const action   = parts[0];
      const resource = parts[1] ?? this.wildcard;
      const actor    = parts[2] ?? this.wildcard;
      conflicts.push(makeConflict(
        'multiple_obligations',
        action, resource,
        new Set([actor]),
        new Set(['obligation']),
        `Action '${action}' on '${resource}' has ${cs.length} obligation clauses for actor '${actor}' — possible duplicate.`,
      ));
    }
    return conflicts;
  }
}

// ---------------------------------------------------------------------------
// Module-level convenience
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper: create a detector and run `detect()`.
 *
 * @param clauses - Policy clause list.
 * @param wildcard - Wildcard actor/resource string (default `'*'`).
 */
export function detectConflicts(clauses: PolicyClause[], wildcard = '*'): PolicyConflict[] {
  return new NLPolicyConflictDetector(wildcard).detect(clauses);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function appendToMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function setIntersects<T>(a: Set<T>, b: Set<T>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

function setIntersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

function setUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
  return new Set([...a, ...b]);
}

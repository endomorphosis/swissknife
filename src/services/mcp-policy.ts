/**
 * Temporal Deontic Policy Evaluation (MCP++ Profile D)
 *
 * Implements:
 *  - `Policy` type with permissions, prohibitions, obligations, temporal constraints
 *  - `PolicyEngine.registerPolicy()` / `evaluatePolicy()` / obligation tracking
 *  - `computePolicyCID()` — content-address a policy for inclusion in envelopes
 *
 * References: docs/spec/temporal-deontic-policy.md in endomorphosis/Mcp-Plus-Plus
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemporalConstraint {
  /** Unix epoch seconds — policy is not active before this */
  notBefore?: number;
  /** Unix epoch seconds — policy expires after this */
  notAfter?: number;
  /** Rate limit: max invocations per windowSeconds */
  maxInvocations?: number;
  windowSeconds?: number;
}

export interface Permission {
  /** MCP++ capability (e.g. `mcp++/invoke`, `mcp++/read-cid`) */
  cap: string;
  /** Resource pattern (e.g. `mcp++/tools/*`, `sha256:<hex>`) */
  rsc: string;
  temporal?: TemporalConstraint;
}

export interface Prohibition {
  cap: string;
  rsc: string;
  temporal?: TemporalConstraint;
}

export interface Obligation {
  /** Human-readable description of the obligation */
  description: string;
  /** Unix epoch seconds deadline for fulfilling the obligation */
  deadline?: number;
  /** Capability that must be exercised to fulfil the obligation */
  requiredCap?: string;
  /** Resource the obligation applies to */
  rsc?: string;
}

export interface Policy {
  id: string;
  version: string;
  permissions: Permission[];
  prohibitions: Prohibition[];
  obligations: Obligation[];
  temporal?: TemporalConstraint;
}

export type PolicyDecisionOutcome = 'PERMIT' | 'DENY' | 'OBLIGATION_SPAWNED';

export interface PolicyDecision {
  outcome: PolicyDecisionOutcome;
  reasons: string[];
  obligations: ActiveObligation[];
  /** Content identifier of this decision */
  decision_cid: string;
}

export interface ActiveObligation extends Obligation {
  /** When the obligation was spawned (ISO-8601) */
  spawnedAt: string;
  /** The policy that spawned this obligation */
  policyId: string;
  /** True once the obligation deadline has passed without fulfilment */
  overdue: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalJSON).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .filter(k => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        k =>
          `${JSON.stringify(k)}:${canonicalJSON((value as Record<string, unknown>)[k])}`,
      )
      .join(',') +
    '}'
  );
}

function computeCID(data: string | Buffer): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

function resourceMatches(pattern: string, actual: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) return actual.startsWith(pattern.slice(0, -2));
  return pattern === actual;
}

function temporalActive(tc: TemporalConstraint | undefined, nowSecs: number): boolean {
  if (!tc) return true;
  if (tc.notBefore !== undefined && nowSecs < tc.notBefore) return false;
  if (tc.notAfter !== undefined && nowSecs > tc.notAfter) return false;
  return true;
}

// ---------------------------------------------------------------------------
// PolicyEngine
// ---------------------------------------------------------------------------

export interface InvocationContext {
  cap: string;
  rsc: string;
  /** ISO-8601 or undefined (defaults to now) */
  timestamp?: string;
}

export class PolicyEngine extends EventEmitter {
  private policies: Map<string, Policy> = new Map();
  /** Policy CID → Policy (reverse lookup) */
  private byCid: Map<string, Policy> = new Map();
  /** Active obligations being tracked */
  private activeObligations: ActiveObligation[] = [];
  /** Per-policy-per-resource invocation counters for rate limiting */
  private invocationCounters: Map<string, { count: number; windowStart: number }> = new Map();

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a policy. Returns its content-addressed CID.
   */
  registerPolicy(policy: Policy): string {
    const cid = computePolicyCIDInternal(policy);
    this.policies.set(policy.id, policy);
    this.byCid.set(cid, policy);
    return cid;
  }

  /**
   * Compute the `policy_cid` for a policy without registering it.
   */
  static computePolicyCID(policy: Policy): string {
    return computePolicyCIDInternal(policy);
  }

  // -------------------------------------------------------------------------
  // Evaluation (MCP++ Profile D §7.2)
  // -------------------------------------------------------------------------

  /**
   * Evaluate an invocation against a registered policy CID.
   *
   * Validation sequence:
   * 1. Check temporal constraints on the policy itself
   * 2. Check prohibitions (deny takes precedence over permit)
   * 3. Check permissions
   * 4. Spawn any obligations
   * 5. Return a signed `PolicyDecision` with a `decision_cid`
   */
  evaluatePolicy(
    policyCid: string,
    invocation: InvocationContext,
  ): PolicyDecision {
    const policy = this.byCid.get(policyCid);
    if (!policy) {
      const decision: PolicyDecision = {
        outcome: 'DENY',
        reasons: [`Policy not found: ${policyCid}`],
        obligations: [],
        decision_cid: '',
      };
      decision.decision_cid = computeCID(canonicalJSON(decision));
      return decision;
    }

    const now = invocation.timestamp
      ? Math.floor(new Date(invocation.timestamp).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const reasons: string[] = [];

    // 1. Check top-level temporal constraint on the policy
    if (!temporalActive(policy.temporal, now)) {
      const decision: PolicyDecision = {
        outcome: 'DENY',
        reasons: ['Policy is not temporally active'],
        obligations: [],
        decision_cid: '',
      };
      decision.decision_cid = computeCID(canonicalJSON(decision));
      return decision;
    }

    // 2. Prohibitions — deny immediately if matched
    for (const prohibition of policy.prohibitions) {
      if (
        resourceMatches(prohibition.rsc, invocation.rsc) &&
        resourceMatches(prohibition.cap, invocation.cap) &&
        temporalActive(prohibition.temporal, now)
      ) {
        reasons.push(`Prohibited: ${prohibition.cap} on ${prohibition.rsc}`);
      }
    }
    if (reasons.length > 0) {
      const decision: PolicyDecision = {
        outcome: 'DENY',
        reasons,
        obligations: [],
        decision_cid: '',
      };
      decision.decision_cid = computeCID(canonicalJSON(decision));
      return decision;
    }

    // 3. Permissions — must find at least one match
    let permitted = false;
    for (const permission of policy.permissions) {
      if (
        resourceMatches(permission.rsc, invocation.rsc) &&
        resourceMatches(permission.cap, invocation.cap) &&
        temporalActive(permission.temporal, now)
      ) {
        // Rate-limit check
        if (permission.temporal?.maxInvocations !== undefined) {
          const windowSecs = permission.temporal.windowSeconds ?? 60;
          const key = `${policy.id}:${permission.rsc}:${permission.cap}`;
          const counter = this.invocationCounters.get(key);
          if (!counter || now - counter.windowStart >= windowSecs) {
            this.invocationCounters.set(key, { count: 1, windowStart: now });
            permitted = true;
          } else if (counter.count < permission.temporal.maxInvocations) {
            counter.count++;
            permitted = true;
          } else {
            reasons.push(`Rate limit exceeded for ${permission.cap} on ${permission.rsc}`);
          }
        } else {
          permitted = true;
        }
      }
    }

    if (!permitted) {
      reasons.push(`No matching permission for ${invocation.cap} on ${invocation.rsc}`);
      const decision: PolicyDecision = {
        outcome: 'DENY',
        reasons,
        obligations: [],
        decision_cid: '',
      };
      decision.decision_cid = computeCID(canonicalJSON(decision));
      return decision;
    }

    // 4. Spawn obligations
    const spawnedObligations: ActiveObligation[] = [];
    for (const obligation of policy.obligations) {
      const active: ActiveObligation = {
        ...obligation,
        spawnedAt: new Date(now * 1000).toISOString(),
        policyId: policy.id,
        overdue: false,
      };
      spawnedObligations.push(active);
      this.activeObligations.push(active);
      this.emit('obligation:spawned', active);
    }

    const outcome: PolicyDecisionOutcome =
      spawnedObligations.length > 0 ? 'OBLIGATION_SPAWNED' : 'PERMIT';

    const decision: PolicyDecision = {
      outcome,
      reasons,
      obligations: spawnedObligations,
      decision_cid: '',
    };
    decision.decision_cid = computeCID(canonicalJSON({
      outcome: decision.outcome,
      reasons: decision.reasons,
      obligations: spawnedObligations,
    }));
    return decision;
  }

  // -------------------------------------------------------------------------
  // Obligation tracking
  // -------------------------------------------------------------------------

  /** Mark an obligation as fulfilled (removes it from the active list). */
  fulfillObligation(description: string): boolean {
    const idx = this.activeObligations.findIndex(
      o => o.description === description && !o.overdue,
    );
    if (idx < 0) return false;
    this.activeObligations.splice(idx, 1);
    this.emit('obligation:fulfilled', description);
    return true;
  }

  /**
   * Check all active obligations for expiry and mark overdue ones.
   * Returns the list of newly-overdue obligations.
   */
  checkObligationDeadlines(): ActiveObligation[] {
    const now = Date.now() / 1000;
    const overdue: ActiveObligation[] = [];
    for (const ob of this.activeObligations) {
      if (!ob.overdue && ob.deadline !== undefined && now > ob.deadline) {
        ob.overdue = true;
        overdue.push(ob);
        this.emit('obligation:overdue', ob);
      }
    }
    return overdue;
  }

  getActiveObligations(): ActiveObligation[] {
    return [...this.activeObligations];
  }

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  private static _instance: PolicyEngine | null = null;
  static getInstance(): PolicyEngine {
    if (!PolicyEngine._instance) {
      PolicyEngine._instance = new PolicyEngine();
    }
    return PolicyEngine._instance;
  }
}

// ---------------------------------------------------------------------------
// Module-level helper (used by both the class and its static method)
// ---------------------------------------------------------------------------

function computePolicyCIDInternal(policy: Policy): string {
  const { id: _id, ...withoutId } = policy;
  return computeCID(canonicalJSON(withoutId));
}

export { computePolicyCIDInternal as computePolicyCID };

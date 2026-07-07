import type { Obligation, Permission, Policy, Prohibition } from './mcp-policy.js';

export interface PolicyFormulaSet {
  permissions: string[];
  prohibitions: string[];
  obligations: string[];
  /** All clauses, conjunction of which is the policy's deontic theory. */
  all: string[];
}

/**
 * Canonical TDFOL atom for a capability/resource pair. Sanitized to a valid
 * identifier so the same cap+resource always yields the same predicate.
 */
export function deonticAtom(capability: string, resource: string): string {
  const norm = (s: string): string =>
    (s || '')
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'any';
  return `act_${norm(capability)}_on_${norm(resource)}`;
}

/** True when any part of the policy carries temporal semantics. */
export function isTemporalPolicy(policy: Policy): boolean {
  if (policy.temporal) return true;
  const hasTemporal = (c: { temporal?: unknown }): boolean => Boolean(c.temporal);
  if (policy.permissions.some(hasTemporal)) return true;
  if (policy.prohibitions.some(hasTemporal)) return true;
  if (policy.obligations.some(o => o.deadline !== undefined)) return true;
  return false;
}

/**
 * Map a Profile-D policy to TDFOL clauses. Permissions become `P(a)`,
 * prohibitions `F(a)`, obligations `O(a)`, and deadline obligations are wrapped
 * in `◊O(a)` to preserve temporal intent for local/remote provers.
 */
export function policyToDeonticFormulas(policy: Policy): PolicyFormulaSet {
  const permissions = policy.permissions.map(
    (p: Permission) => `P(${deonticAtom(p.cap, p.rsc)})`,
  );
  const prohibitions = policy.prohibitions.map(
    (p: Prohibition) => `F(${deonticAtom(p.cap, p.rsc)})`,
  );
  const obligations = policy.obligations.map((o: Obligation) => {
    const atom = deonticAtom(o.requiredCap ?? o.description, o.rsc ?? '*');
    const core = `O(${atom})`;
    return o.deadline !== undefined ? `◊${core}` : core;
  });
  return {
    permissions,
    prohibitions,
    obligations,
    all: [...permissions, ...prohibitions, ...obligations],
  };
}

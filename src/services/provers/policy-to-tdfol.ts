/**
 * PolicyToTdfolTranslator — translates a MCP++ `Policy` to a TDFOL knowledge base.
 *
 * Extends `PolicyToDcecTranslator` with LTL wrappers for temporal constraints:
 *   - `policy.temporal` present → wrap permissions/prohibitions in □(…) (ALWAYS)
 *   - obligation with deadline → wrap in ◊(O(…)) (EVENTUALLY O)
 *
 * Mirrors encoding conventions from:
 *   ipfs_datasets_py/logic/TDFOL/tdfol_prover.py
 *   ipfs_datasets_py/logic/TDFOL/tdfol_dcec_parser.py
 *
 * Sprint 10, T-65.
 */

import type { Policy } from '../mcp-policy.js';
import type { TdfolFormula } from './tdfol-types.js';
import { Atom, Const, Obligation, Permission, Prohibition, Negation } from './dcec-types.js';
import { Always, Eventually, Until } from './tdfol-types.js';

function normalizeAtomPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'any';
}

function normAtom(capability: string, resource?: string): string {
  const cap = normalizeAtomPart(capability);
  return resource === undefined ? cap : `${cap}_${normalizeAtomPart(resource)}`;
}

export class PolicyToTdfolTranslator {
  /**
   * Translate `policy` to a TDFOL KB.
   *
   * When `policy.temporal` is set the norms are wrapped in □ (ALWAYS) to
   * encode "the norm holds throughout the policy window".  Obligation deadlines
   * produce ◊O(description) (obligation must eventually be fulfilled).
   */
  translate(policy: Policy): TdfolFormula[] {
    const kb: TdfolFormula[] = [];
    const hasTemporalWindow = policy.temporal !== undefined;

    for (const perm of policy.permissions ?? []) {
      const inner = Permission(Atom(normAtom(perm.cap, perm.rsc)));
      kb.push(hasTemporalWindow ? Always(inner) : inner);
    }

    for (const proh of policy.prohibitions ?? []) {
      const inner = Prohibition(Atom(normAtom(proh.cap, proh.rsc)));
      kb.push(hasTemporalWindow ? Always(inner) : inner);
    }

    for (const obl of policy.obligations ?? []) {
      const obligationAtom = obl.requiredCap
        ? normAtom(obl.requiredCap, obl.rsc ?? '*')
        : normAtom(
          typeof obl.description === 'string'
            ? obl.description
            : `obligation_${kb.length}`,
        );
      const inner = Obligation(
        Atom(obligationAtom),
      );
      // If the obligation has a deadline, encode as ◊O(φ) — eventually obligatory
      const hasDeadline = 'deadline' in obl && obl.deadline !== undefined;
      const f: TdfolFormula = hasDeadline ? Eventually(inner) : inner;
      kb.push(hasTemporalWindow ? Always(f) : f);
    }

    return kb;
  }
}

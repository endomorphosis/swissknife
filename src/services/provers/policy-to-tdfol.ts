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
      const inner = Permission(Atom(`${perm.cap}_${perm.rsc}`));
      kb.push(hasTemporalWindow ? Always(inner) : inner);
    }

    for (const proh of policy.prohibitions ?? []) {
      const inner = Prohibition(Atom(`${proh.cap}_${proh.rsc}`));
      kb.push(hasTemporalWindow ? Always(inner) : inner);
    }

    for (const obl of policy.obligations ?? []) {
      const inner = Obligation(
        Atom(
          typeof obl.description === 'string'
            ? obl.description.replace(/\s+/g, '_').toLowerCase()
            : `obligation_${kb.length}`,
        ),
      );
      // If the obligation has a deadline, encode as ◊O(φ) — eventually obligatory
      const hasDeadline = 'deadline' in obl && obl.deadline !== undefined;
      const f: TdfolFormula = hasDeadline ? Eventually(inner) : inner;
      kb.push(hasTemporalWindow ? Always(f) : f);
    }

    return kb;
  }
}

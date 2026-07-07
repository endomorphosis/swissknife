/**
 * PolicyToDcecTranslator — translates a MCP++ `Policy` to a DCEC knowledge base.
 *
 * Mirrors the encoding conventions used in:
 *   ipfs_datasets_py/logic/CEC/native/dcec_core.py
 *   ipfs_datasets_py/logic/CEC/cec_framework.py
 *
 * Encoding:
 *   policy.permissions[]   → P(cap_rsc [, agent]) deontic atom
 *   policy.prohibitions[]  → F(cap_rsc [, agent]) deontic atom
 *   policy.obligations[]   → O(description) deontic atom
 *   policy.temporal        → HOLDS_AT(P(…), now) wrapper when temporal window present
 *
 * Sprint 9, T-60.
 */

import type { Policy } from './mcp-policy.js';
import {
  type DCECFormula,
  Atom, Const, Obligation, Permission, Prohibition, HoldsAt,
} from '../dcec/dcec-types.js';

export class PolicyToDcecTranslator {
  /**
   * Translate `policy` to an array of DCEC formulas serving as the knowledge base
   * for `DcecProverBridge.prove()` or `DcecProverBridge.checkPolicyConsistency()`.
   */
  translate(policy: Policy): DCECFormula[] {
    const kb: DCECFormula[] = [];
    const now = Const('now');

    for (const perm of policy.permissions ?? []) {
      const inner = Atom(`${perm.cap}_${perm.rsc}`);
      const f = Permission(inner);
      // Wrap in HOLDS_AT when policy has a temporal window
      kb.push(policy.temporal ? HoldsAt(f, now) : f);
    }

    for (const proh of policy.prohibitions ?? []) {
      const inner = Atom(`${proh.cap}_${proh.rsc}`);
      const f = Prohibition(inner);
      kb.push(policy.temporal ? HoldsAt(f, now) : f);
    }

    for (const obl of policy.obligations ?? []) {
      const inner = Atom(
        typeof obl.description === 'string'
          ? obl.description.replace(/\s+/g, '_').toLowerCase()
          : `obligation_${kb.length}`,
      );
      const f = Obligation(inner);
      kb.push(policy.temporal ? HoldsAt(f, now) : f);
    }

    return kb;
  }
}

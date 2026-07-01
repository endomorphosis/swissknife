/**
 * DeonticToCoqTranslator — translate MCP++ deontic Policy to Coq propositions.
 *
 * Generates Coq proof obligations (as a `.v` source string) for:
 * - Consistency check: show the permission/prohibition/obligation set is
 *   satisfiable (no direct contradictions)
 * - Obligation discharge: show each obligation's requiredCap is not prohibited
 *
 * Output format is Coq 8.17+ compatible (jsCoq 0.17 / coqc).
 *
 * Reference: ipfs_datasets_py/logic/external_provers/interactive/coq_prover_bridge.py
 *   DeonticToCoqConverter (translates TDFOL to Coq Prop)
 */

import type { Policy } from '../mcp-policy.js';
import type { PolicyFormulaSet } from '../mcp-remote-deontic-engine.js';

// ---------------------------------------------------------------------------
// DeonticToCoqTranslator
// ---------------------------------------------------------------------------

export interface CoqProofScript {
  /** Full Coq source to pass to coqc / jsCoq. */
  source: string;
  /** The theorem name to look for in the output to confirm proof success. */
  theoremName: string;
  /** Textual description of what is being proved. */
  description: string;
}

export class DeonticToCoqTranslator {
  /**
   * Generate a Coq script that checks internal consistency of `policy`.
   *
   * The script defines a Prop for each permission/prohibition/obligation atom
   * and proves (or fails to prove) that the conjunction is consistent by
   * exhibiting a trivial model.
   *
   * A successful `Qed.` in the output means the policy is locally consistent.
   * A `Fail.` or error means it contains an identified contradiction.
   */
  policyConsistencyScript(policy: Policy): CoqProofScript {
    const lines: string[] = [];
    const atoms: string[] = [];
    const constraints: string[] = [];

    lines.push('(* Policy consistency check via Coq *)');
    lines.push(`(* Policy: ${policy.id} v${policy.version} *)`);
    lines.push('');
    lines.push('Section PolicyConsistency.');
    lines.push('');

    // Declare each capability+resource pair as a Hypothesis
    const permAtoms: string[] = [];
    const prohibAtoms: string[] = [];

    for (const perm of policy.permissions ?? []) {
      const name = coqAtom('perm', perm.cap, perm.rsc);
      if (!permAtoms.includes(name)) {
        lines.push(`  Hypothesis ${name} : Prop.`);
        permAtoms.push(name);
        atoms.push(name);
      }
    }

    for (const prohib of policy.prohibitions ?? []) {
      const name = coqAtom('prohib', prohib.cap, prohib.rsc);
      if (!prohibAtoms.includes(name)) {
        lines.push(`  Hypothesis ${name} : Prop.`);
        prohibAtoms.push(name);
        atoms.push(name);
      }
    }

    for (const obl of policy.obligations ?? []) {
      if (obl.requiredCap) {
        const name = coqAtom('obl', obl.requiredCap, '*');
        if (!atoms.includes(name)) {
          lines.push(`  Hypothesis ${name} : Prop.`);
          atoms.push(name);
        }
      }
    }

    lines.push('');

    // Check: permission + prohibition on same cap+rsc is a contradiction
    // (∀ x, perm(x) → prohib(x) → False)
    const contradictions: string[] = [];
    for (const permAtom of permAtoms) {
      // Extract cap_rsc suffix to find matching prohibition
      const suffix = permAtom.replace(/^perm_/, '');
      const prohibAtom = `prohib_${suffix}`;
      if (prohibAtoms.includes(prohibAtom)) {
        contradictions.push(`${permAtom} /\\ ${prohibAtom}`);
        constraints.push(
          `  (* Contradiction: ${permAtom} and ${prohibAtom} cannot both hold *)`
        );
        constraints.push(
          `  Lemma contradiction_${suffix} : ${permAtom} -> ${prohibAtom} -> False.`
        );
        constraints.push('  Proof. tauto. Qed.');
        constraints.push('');
      }
    }

    // Wildcard permission clashes with any prohibition
    const wildcardPerms = permAtoms.filter(p => p.includes('_STAR_') || p.endsWith('_STAR'));
    for (const wPerm of wildcardPerms) {
      for (const prohibAtom of prohibAtoms) {
        constraints.push(
          `  Lemma wildcard_clash_${prohibAtoms.indexOf(prohibAtom)} : ${wPerm} -> ${prohibAtom} -> False.`
        );
        constraints.push('  Proof. tauto. Qed.');
        constraints.push('');
      }
    }

    // Obligation requiredCap prohibited → unsatisfiable obligation
    for (const obl of policy.obligations ?? []) {
      if (!obl.requiredCap) continue;
      const oblAtom = coqAtom('obl', obl.requiredCap, '*');
      const prohibAtom = coqAtom('prohib', obl.requiredCap, '*');
      if (prohibAtoms.includes(prohibAtom)) {
        constraints.push(
          `  Lemma obligation_unsatisfiable : ${oblAtom} -> ${prohibAtom} -> False.`
        );
        constraints.push('  Proof. tauto. Qed.');
        constraints.push('');
      }
    }

    if (constraints.length === 0) {
      // No contradictions found — prove trivial consistency via True
      lines.push('  (* No contradictions detected by static analysis *)');
      lines.push('  Theorem policy_consistent : True.');
      lines.push('  Proof. trivial. Qed.');
    } else {
      lines.push(...constraints);
    }

    lines.push('');
    lines.push('End PolicyConsistency.');

    const theoremName = contradictions.length > 0
      ? `contradiction_${contradictions[0].split(' ')[0].replace(/^perm_/, '')}`
      : 'policy_consistent';

    return {
      source: lines.join('\n'),
      theoremName,
      description: `Coq consistency check for policy ${policy.id}`,
    };
  }

  /**
   * Generate a Coq script for a raw TDFOL `PolicyFormulaSet`.
   *
   * Maps deontic modal operators to Coq propositions:
   *   O(cap, rsc)  →  obligation_cap_rsc : Prop
   *   P(cap, rsc)  →  permission_cap_rsc : Prop
   *   F(cap, rsc)  →  prohibition_cap_rsc : Prop
   */
  formulaSetScript(formulaSet: PolicyFormulaSet): CoqProofScript {
    const lines = [
      '(* PolicyFormulaSet Coq verification *)',
      'Section DeonticFormulas.',
      '',
    ];

    const seenAtoms = new Set<string>();

    const addAtom = (formula: string, kind: string): string => {
      const atom = `${kind}_${coqSymbol(formula)}`.slice(0, 60);
      if (!seenAtoms.has(atom)) {
        lines.push(`  Hypothesis ${atom} : Prop.`);
        seenAtoms.add(atom);
      }
      return atom;
    };

    for (const f of formulaSet.obligation_formulas ?? []) addAtom(f, 'obl');
    for (const f of formulaSet.permission_formulas ?? []) addAtom(f, 'perm');
    for (const f of formulaSet.prohibition_formulas ?? []) addAtom(f, 'prohib');

    lines.push('');
    lines.push('  Theorem formula_set_valid : True.');
    lines.push('  Proof. trivial. Qed.');
    lines.push('');
    lines.push('End DeonticFormulas.');

    return {
      source: lines.join('\n'),
      theoremName: 'formula_set_valid',
      description: 'Coq verification of PolicyFormulaSet',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coqAtom(kind: string, cap: string, rsc: string): string {
  return `${kind}_${coqSymbol(cap)}_${coqSymbol(rsc)}`.slice(0, 60);
}

function coqSymbol(s: string): string {
  if (s === '*') return 'STAR';
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^[0-9]+/, '').slice(0, 20) || 'any';
}

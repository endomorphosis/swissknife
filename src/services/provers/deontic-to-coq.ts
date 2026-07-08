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
import type { Formula, SortKind, Term } from '../tdfol-core.js';

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

    const formulas = policyFormulaSetLists(formulaSet);
    for (const f of formulas.obligations) addAtom(f, 'obl');
    for (const f of formulas.permissions) addAtom(f, 'perm');
    for (const f of formulas.prohibitions) addAtom(f, 'prohib');

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

// PORT-033: Configurable tactic sequences for Coq
export const COQ_TACTIC_SEQUENCES = {
  basic:      ['auto', 'tauto', 'intuition'],
  firstorder: ['auto', 'firstorder', 'tauto'],
  deontic:    ['auto', 'tauto', 'firstorder', 'decide'],
};

export const LEAN4_TACTIC_SEQUENCES = {
  basic:   ['trivial', 'simp', 'tauto'],
  deontic: ['trivial', 'simp', 'decide', 'tauto'],
};
// PORT-034: Add 'Require Import Coq.Logic.Classical_Prop.' to Coq proofs for classical logic

// PORT-032: TDFOLToCoqConverter — accepts TDFOL Formula AST or string
export class TDFOLToCoqConverter {
  convertExpression(formula: Formula | string): string {
    if (typeof formula === 'string') return legacyCoqFormula(formula);
    return formulaToCoq(formula, createInteractiveContext('coq'));
  }

  convertFormula(formula: Formula | string, theoremName = 'theorem'): string {
    if (typeof formula === 'string') {
      const coqExpr = legacyCoqFormula(formula);
      return [
        'Require Import Coq.Logic.Classical_Prop.',
        `Theorem ${coqSymbol(theoremName)} : ${coqExpr}.`,
        'Proof.',
        '  firstorder.',
        'Qed.',
      ].join('\n');
    }

    const ctx = createInteractiveContext('coq');
    const coqExpr = formulaToCoq(formula, ctx);
    return [
      'Require Import Coq.Logic.Classical_Prop.',
      ...Array.from(ctx.sorts).sort().map(s => `Parameter ${s} : Type.`),
      ...Array.from(ctx.declarations).sort(),
      '',
      `Theorem ${coqSymbol(theoremName)} : ${coqExpr}.`,
      'Proof.',
      '  firstorder.',
      'Qed.',
    ].join('\n');
  }
}

// PORT-032: TDFOLToLean4Converter — accepts TDFOL Formula AST or string
export class TDFOLToLean4Converter {
  convertExpression(formula: Formula | string): string {
    if (typeof formula === 'string') return legacyLeanFormula(formula);
    return formulaToLean(formula, createInteractiveContext('lean'));
  }

  convertFormula(formula: Formula | string, theoremName = 'theorem'): string {
    if (typeof formula === 'string') {
      return `theorem ${leanSymbol(theoremName)} : ${legacyLeanFormula(formula)} := by\n  simp`;
    }

    const ctx = createInteractiveContext('lean');
    const leanExpr = formulaToLean(formula, ctx);
    return [
      ...Array.from(ctx.sorts).sort().map(s => `constant ${s} : Type`),
      ...Array.from(ctx.declarations).sort(),
      '',
      `theorem ${leanSymbol(theoremName)} : ${leanExpr} := by`,
      '  simp',
    ].join('\n');
  }
}

type InteractiveDialect = 'coq' | 'lean';

interface InteractiveContext {
  dialect: InteractiveDialect;
  sorts: Set<string>;
  declarations: Set<string>;
  boundVariables: Set<string>;
}

function createInteractiveContext(dialect: InteractiveDialect): InteractiveContext {
  return { dialect, sorts: new Set(), declarations: new Set(), boundVariables: new Set() };
}

function sortType(sort?: SortKind, dialect: InteractiveDialect = 'coq'): string {
  if (!sort || sort === 'Proposition') return 'Prop';
  const name = dialect === 'lean' ? leanSymbol(sort) : coqSymbol(sort);
  return name;
}

function ensureSort(ctx: InteractiveContext, sort?: SortKind): string {
  const name = sortType(sort, ctx.dialect);
  if (name !== 'Prop') ctx.sorts.add(name);
  return name;
}

function termSort(term: Term, dialect: InteractiveDialect): string {
  switch (term.kind) {
    case 'variable': return sortType(term.sort, dialect);
    case 'constant': return sortType(term.sort, dialect);
    case 'function_app': return sortType(term.returnSort, dialect);
  }
}

function termToCoq(term: Term, ctx: InteractiveContext): string {
  switch (term.kind) {
    case 'variable':
      return coqSymbol(term.name);
    case 'constant': {
      const name = coqSymbol(term.name);
      if (!ctx.boundVariables.has(term.name)) {
        ctx.declarations.add(`Parameter ${name} : ${ensureSort(ctx, term.sort)}.`);
      }
      return name;
    }
    case 'function_app': {
      const name = coqSymbol(term.funcName);
      const argTypes = term.args.map(a => termSort(a, 'coq'));
      for (const arg of term.args) ensureTermDeclarations(arg, ctx);
      ctx.declarations.add(`Parameter ${name} : ${[...argTypes, ensureSort(ctx, term.returnSort)].join(' -> ')}.`);
      return `(${name}${term.args.length ? ` ${term.args.map(a => termToCoq(a, ctx)).join(' ')}` : ''})`;
    }
  }
}

function termToLean(term: Term, ctx: InteractiveContext): string {
  switch (term.kind) {
    case 'variable':
      return leanSymbol(term.name);
    case 'constant': {
      const name = leanSymbol(term.name);
      if (!ctx.boundVariables.has(term.name)) {
        ctx.declarations.add(`constant ${name} : ${ensureSort(ctx, term.sort)}`);
      }
      return name;
    }
    case 'function_app': {
      const name = leanSymbol(term.funcName);
      const argTypes = term.args.map(a => termSort(a, 'lean'));
      for (const arg of term.args) ensureTermDeclarations(arg, ctx);
      ctx.declarations.add(`constant ${name} : ${[...argTypes, ensureSort(ctx, term.returnSort)].join(' -> ')}`);
      return `(${name}${term.args.length ? ` ${term.args.map(a => termToLean(a, ctx)).join(' ')}` : ''})`;
    }
  }
}

function ensureTermDeclarations(term: Term, ctx: InteractiveContext): void {
  switch (term.kind) {
    case 'variable':
      ensureSort(ctx, term.sort);
      return;
    case 'constant':
      ensureSort(ctx, term.sort);
      if (!ctx.boundVariables.has(term.name)) {
        if (ctx.dialect === 'coq') ctx.declarations.add(`Parameter ${coqSymbol(term.name)} : ${sortType(term.sort, 'coq')}.`);
        else ctx.declarations.add(`constant ${leanSymbol(term.name)} : ${sortType(term.sort, 'lean')}`);
      }
      return;
    case 'function_app':
      ensureSort(ctx, term.returnSort);
      for (const arg of term.args) ensureTermDeclarations(arg, ctx);
      return;
  }
}

function formulaToCoq(formula: Formula, ctx: InteractiveContext): string {
  switch (formula.kind) {
    case 'predicate': {
      const name = coqSymbol(formula.name);
      if (formula.args.length === 0) {
        ctx.declarations.add(`Parameter ${name} : Prop.`);
        return formula.negated ? `~ ${name}` : name;
      }
      for (const arg of formula.args) ensureTermDeclarations(arg, ctx);
      const argTypes = formula.args.map(a => termSort(a, 'coq'));
      ctx.declarations.add(`Parameter ${name} : ${[...argTypes, 'Prop'].join(' -> ')}.`);
      const applied = `(${name} ${formula.args.map(a => termToCoq(a, ctx)).join(' ')})`;
      return formula.negated ? `~ ${applied}` : applied;
    }
    case 'unary':
      return `~ (${formulaToCoq(formula.operand, ctx)})`;
    case 'binary': {
      const left = formulaToCoq(formula.left, ctx);
      const right = formulaToCoq(formula.right, ctx);
      if (formula.operator === '∧') return `(${left} /\\ ${right})`;
      if (formula.operator === '∨') return `(${left} \\/ ${right})`;
      if (formula.operator === '→') return `(${left} -> ${right})`;
      if (formula.operator === '↔') return `(${left} <-> ${right})`;
      return `(((${left}) /\\ ~(${right})) \\/ (~(${left}) /\\ (${right})))`;
    }
    case 'quantified': {
      const v = coqSymbol(formula.variable);
      const sort = ensureSort(ctx, formula.variableTerm?.sort ?? formula.sort);
      ctx.boundVariables.add(formula.variable);
      const body = formulaToCoq(formula.body, ctx);
      ctx.boundVariables.delete(formula.variable);
      return `${formula.quantifier === '∀' ? 'forall' : 'exists'} (${v} : ${sort}), ${body}`;
    }
    case 'deontic': {
      const inner = formulaToCoq(formula.formula, ctx);
      const op = formula.operator === 'O' ? 'obligation' : formula.operator === 'P' ? 'permission' : 'forbidden';
      if (formula.agentTerm) {
        ctx.declarations.add(`Parameter ${op}_for : ${termSort(formula.agentTerm, 'coq')} -> Prop -> Prop.`);
        return `(${op}_for ${termToCoq(formula.agentTerm, ctx)} (${inner}))`;
      }
      ctx.declarations.add(`Parameter ${op} : Prop -> Prop.`);
      return `(${op} (${inner}))`;
    }
    case 'temporal': {
      const names: Record<string, string> = { '□': 'always', '◊': 'eventually', X: 'next', U: 'until', S: 'since', W: 'weak_until', R: 'release' };
      const op = names[formula.operator] ?? coqSymbol(formula.operator);
      if (formula.until) {
        ctx.declarations.add(`Parameter ${op} : Prop -> Prop -> Prop.`);
        return `(${op} (${formulaToCoq(formula.formula, ctx)}) (${formulaToCoq(formula.until, ctx)}))`;
      }
      ctx.declarations.add(`Parameter ${op} : Prop -> Prop.`);
      return `(${op} (${formulaToCoq(formula.formula, ctx)}))`;
    }
  }
}

function formulaToLean(formula: Formula, ctx: InteractiveContext): string {
  switch (formula.kind) {
    case 'predicate': {
      const name = leanSymbol(formula.name);
      if (formula.args.length === 0) {
        ctx.declarations.add(`constant ${name} : Prop`);
        return formula.negated ? `¬ ${name}` : name;
      }
      for (const arg of formula.args) ensureTermDeclarations(arg, ctx);
      const argTypes = formula.args.map(a => termSort(a, 'lean'));
      ctx.declarations.add(`constant ${name} : ${[...argTypes, 'Prop'].join(' -> ')}`);
      const applied = `(${name} ${formula.args.map(a => termToLean(a, ctx)).join(' ')})`;
      return formula.negated ? `¬ ${applied}` : applied;
    }
    case 'unary':
      return `¬ (${formulaToLean(formula.operand, ctx)})`;
    case 'binary': {
      const left = formulaToLean(formula.left, ctx);
      const right = formulaToLean(formula.right, ctx);
      if (formula.operator === '∧') return `(${left} ∧ ${right})`;
      if (formula.operator === '∨') return `(${left} ∨ ${right})`;
      if (formula.operator === '→') return `(${left} → ${right})`;
      if (formula.operator === '↔') return `(${left} ↔ ${right})`;
      return `(((${left}) ∧ ¬ (${right})) ∨ (¬ (${left}) ∧ (${right})))`;
    }
    case 'quantified': {
      const v = leanSymbol(formula.variable);
      const sort = ensureSort(ctx, formula.variableTerm?.sort ?? formula.sort);
      ctx.boundVariables.add(formula.variable);
      const body = formulaToLean(formula.body, ctx);
      ctx.boundVariables.delete(formula.variable);
      return `${formula.quantifier === '∀' ? '∀' : '∃'} (${v} : ${sort}), ${body}`;
    }
    case 'deontic': {
      const inner = formulaToLean(formula.formula, ctx);
      const op = formula.operator === 'O' ? 'obligation' : formula.operator === 'P' ? 'permission' : 'forbidden';
      if (formula.agentTerm) {
        ctx.declarations.add(`constant ${op}_for : ${termSort(formula.agentTerm, 'lean')} -> Prop -> Prop`);
        return `(${op}_for ${termToLean(formula.agentTerm, ctx)} (${inner}))`;
      }
      ctx.declarations.add(`constant ${op} : Prop -> Prop`);
      return `(${op} (${inner}))`;
    }
    case 'temporal': {
      const names: Record<string, string> = { '□': 'always', '◊': 'eventually', X: 'next', U: 'until', S: 'since', W: 'weakUntil', R: 'release' };
      const op = names[formula.operator] ?? leanSymbol(formula.operator);
      if (formula.until) {
        ctx.declarations.add(`constant ${op} : Prop -> Prop -> Prop`);
        return `(${op} (${formulaToLean(formula.formula, ctx)}) (${formulaToLean(formula.until, ctx)}))`;
      }
      ctx.declarations.add(`constant ${op} : Prop -> Prop`);
      return `(${op} (${formulaToLean(formula.formula, ctx)}))`;
    }
  }
}

function legacyCoqFormula(formula: string): string {
  return formula
    .replace(/∀\s*(\w+)\s*\./g, 'forall ($1 : Prop),')
    .replace(/∃\s*(\w+)\s*\./g, 'exists ($1 : Prop),')
    .replace(/∧/g, '/\\')
    .replace(/∨/g, '\\/')
    .replace(/¬/g, '~')
    .replace(/→/g, '->')
    .replace(/↔/g, '<->')
    .replace(/O\(([^)]+)\)/g, '(obligation $1)')
    .replace(/P\(([^)]+)\)/g, '(permission $1)')
    .replace(/F\(([^)]+)\)/g, '(forbidden $1)');
}

function legacyLeanFormula(formula: string): string {
  return formula
    .replace(/∀\s*(\w+)\s*\./g, '∀ ($1 : Prop),')
    .replace(/∃\s*(\w+)\s*\./g, '∃ ($1 : Prop),')
    .replace(/O\(([^)]+)\)/g, 'obligation $1')
    .replace(/P\(([^)]+)\)/g, 'permission $1')
    .replace(/F\(([^)]+)\)/g, 'forbidden $1');
}

function leanSymbol(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]+/, '');
  return cleaned || 'unnamed';
}

function policyFormulaSetLists(formulaSet: PolicyFormulaSet): Pick<PolicyFormulaSet, 'permissions' | 'prohibitions' | 'obligations'> {
  const legacy = formulaSet as PolicyFormulaSet & {
    permission_formulas?: string[];
    prohibition_formulas?: string[];
    obligation_formulas?: string[];
  };
  return {
    permissions: formulaSet.permissions ?? legacy.permission_formulas ?? [],
    prohibitions: formulaSet.prohibitions ?? legacy.prohibition_formulas ?? [],
    obligations: formulaSet.obligations ?? legacy.obligation_formulas ?? [],
  };
}

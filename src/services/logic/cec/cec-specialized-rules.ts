/**
 * CEC Specialized Inference Rules — T-256
 *
 * Port of CEC/native/inference_rules/specialized.py (456L)
 *
 * 5 specialized propositional logic rules not covered by core rules.
 */

import { CECInferenceRule } from './cec-prover-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topArrow(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '→') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

function topBicond(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '↔') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

function topDisj(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '∨') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

const isImpl   = (f: string) => f.includes('→');
const isBicond = (f: string) => f.includes('↔');
const isDisj   = (f: string) => f.includes('∨');
const isConj   = (f: string) => f.includes('∧');

// ---------------------------------------------------------------------------
// 5 Specialized Rules
// ---------------------------------------------------------------------------

/**
 * Biconditional Introduction: P→Q, Q→P ⊢ P↔Q
 */
export class BiconditionalIntroduction implements CECInferenceRule {
  readonly name = 'BiconditionalIntroduction';
  readonly description = 'P→Q, Q→P ⊢ P↔Q';

  canApply(fs: string[]): boolean {
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    return impls.some(([p, q]) => impls.some(([q2, p2]) => q === q2 && p === p2));
  }

  apply(fs: string[]): string[] {
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    const out: string[] = [];
    for (const [p, q] of impls) {
      if (impls.some(([q2, p2]) => q === q2 && p === p2)) {
        const bic = `${p} ↔ ${q}`;
        if (!fs.includes(bic)) out.push(bic);
      }
    }
    return out;
  }
}

/**
 * Biconditional Elimination: P↔Q ⊢ P→Q and Q→P
 */
export class BiconditionalElimination implements CECInferenceRule {
  readonly name = 'BiconditionalElimination';
  readonly description = 'P↔Q ⊢ P→Q, Q→P';

  canApply(fs: string[]): boolean { return fs.some(isBicond); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isBicond(f)) continue;
      const p = topBicond(f);
      if (!p) continue;
      const fwd = `${p[0]} → ${p[1]}`;
      const bwd = `${p[1]} → ${p[0]}`;
      if (!fs.includes(fwd)) out.push(fwd);
      if (!fs.includes(bwd)) out.push(bwd);
    }
    return out;
  }
}

/**
 * Constructive Dilemma: P→Q, R→S, P∨R ⊢ Q∨S
 */
export class ConstructiveDilemma implements CECInferenceRule {
  readonly name = 'ConstructiveDilemma';
  readonly description = 'P→Q, R→S, P∨R ⊢ Q∨S';

  canApply(fs: string[]): boolean {
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    if (impls.length < 2) return false;
    const disjs = fs.filter(isDisj).map(f => topDisj(f)).filter(Boolean) as [string, string][];
    return impls.some(([p]) => impls.some(([r]) => r !== p && disjs.some(([a, b]) => (a === p && b === r) || (a === r && b === p))));
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    const disjs = fs.filter(isDisj).map(f => topDisj(f)).filter(Boolean) as [string, string][];
    for (const [p, q] of impls) {
      for (const [r, s] of impls) {
        if (p === r) continue;
        if (disjs.some(([a, b]) => (a === p && b === r) || (a === r && b === p))) {
          const qors = `${q} ∨ ${s}`;
          if (!fs.includes(qors)) out.push(qors);
        }
      }
    }
    return out;
  }
}

/**
 * Destructive Dilemma: P→Q, R→S, ¬Q∨¬S ⊢ ¬P∨¬R
 */
export class DestructiveDilemma implements CECInferenceRule {
  readonly name = 'DestructiveDilemma';
  readonly description = 'P→Q, R→S, ¬Q∨¬S ⊢ ¬P∨¬R';

  canApply(fs: string[]): boolean {
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    if (impls.length < 2) return false;
    const disjs = fs.filter(isDisj).map(f => topDisj(f)).filter(Boolean) as [string, string][];
    return impls.some(([, q]) => impls.some(([, s]) => s !== q && disjs.some(([a, b]) =>
      (a === `¬${q}` && b === `¬${s}`) || (a === `¬${s}` && b === `¬${q}`))));
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    const disjs = fs.filter(isDisj).map(f => topDisj(f)).filter(Boolean) as [string, string][];
    for (const [p, q] of impls) {
      for (const [r, s] of impls) {
        if (p === r) continue;
        if (disjs.some(([a, b]) => (a === `¬${q}` && b === `¬${s}`) || (a === `¬${s}` && b === `¬${q}`))) {
          const negpnegr = `¬${p} ∨ ¬${r}`;
          if (!fs.includes(negpnegr)) out.push(negpnegr);
        }
      }
    }
    return out;
  }
}

/**
 * Exportation Rule: P→(Q→R) ↔ (P∧Q)→R
 */
export class ExportationRule implements CECInferenceRule {
  readonly name = 'ExportationRule';
  readonly description = 'P→(Q→R) ↔ (P∧Q)→R';

  canApply(fs: string[]): boolean {
    return fs.some(f => {
      const p = topArrow(f);
      return p ? isImpl(p[1]) : false;
    });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const p = topArrow(f);
      if (!p || !isImpl(p[1])) continue;
      const q = topArrow(p[1]);
      if (!q) continue;
      const exp = `(${p[0]} ∧ ${q[0]}) → ${q[1]}`;
      if (!fs.includes(exp)) out.push(exp);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ALL_SPECIALIZED_RULES: CECInferenceRule[] = [
  new BiconditionalIntroduction(),
  new BiconditionalElimination(),
  new ConstructiveDilemma(),
  new DestructiveDilemma(),
  new ExportationRule(),
];

export function findApplicableSpecializedRules(formulas: string[]): CECInferenceRule[] {
  return ALL_SPECIALIZED_RULES.filter(r => r.canApply(formulas));
}

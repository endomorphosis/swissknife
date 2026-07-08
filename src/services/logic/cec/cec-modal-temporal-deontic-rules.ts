/**
 * CEC native modal, temporal, and deontic inference rules.
 *
 * TypeScript port of CEC/native/inference_rules/{modal,temporal,deontic}.py.
 */

import { CECInferenceRule } from './cec-prover-core.js';

abstract class StringRule implements CECInferenceRule {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract derive(formulas: string[]): string[];

  canApply(formulas: string[]): boolean {
    return this.apply(formulas).length > 0;
  }

  apply(formulas: string[]): string[] {
    return uniqueNew(this.derive(formulas), formulas);
  }
}

export class NecessityElimination extends StringRule {
  readonly name = 'NecessityElimination';
  readonly description = '□P ⊢ P';
  derive(fs: string[]): string[] { return fs.map(boxInner).filter(isString); }
}

export class PossibilityIntroduction extends StringRule {
  readonly name = 'PossibilityIntroduction';
  readonly description = 'P ⊢ ◇P';
  derive(fs: string[]): string[] { return fs.filter(f => f.trim()).map(f => `◇${parenthesizeIfNeeded(f)}`); }
}

export class NecessityDistribution extends StringRule {
  readonly name: string = 'NecessityDistribution';
  readonly description: string = '□(P→Q), □P ⊢ □Q';
  derive(fs: string[]): string[] {
    const boxes = fs.map(boxInner).filter(isString);
    const out: string[] = [];
    for (const boxed of boxes) {
      const implication = topSplit(boxed, '→');
      if (implication && boxes.includes(implication[0])) out.push(`□${parenthesizeIfNeeded(implication[1])}`);
    }
    return out;
  }
}

export class PossibilityDuality extends StringRule {
  readonly name = 'PossibilityDuality';
  readonly description = '¬□¬P ⊢ ◇P';
  derive(fs: string[]): string[] {
    return fs.map(formula => {
      const trimmed = stripOuter(formula.trim());
      if (!trimmed.startsWith('¬')) return null;
      const inner = boxInner(trimmed.slice(1).trim());
      if (!inner?.startsWith('¬')) return null;
      return `◇${parenthesizeIfNeeded(inner.slice(1).trim())}`;
    }).filter(isString);
  }
}

export class NecessityConjunction extends StringRule {
  readonly name = 'NecessityConjunction';
  readonly description = '□P, □Q ⊢ □(P∧Q)';
  derive(fs: string[]): string[] {
    const boxes = fs.map(boxInner).filter(isString);
    if (boxes.length < 2) return [];
    return [`□(${boxes[0]} ∧ ${boxes[1]})`];
  }
}

export class AlwaysDistribution extends StringRule {
  readonly name = 'AlwaysDistribution';
  readonly description = '□(P∧Q) ⊢ □P ∧ □Q';
  derive(fs: string[]): string[] {
    return fs.flatMap(formula => {
      const inner = boxInner(formula);
      const parts = inner ? topSplit(inner, '∧') : null;
      return parts ? [`□${parenthesizeIfNeeded(parts[0])} ∧ □${parenthesizeIfNeeded(parts[1])}`] : [];
    });
  }
}

export class AlwaysImplication extends NecessityDistribution {
  override readonly name = 'AlwaysImplication';
  override readonly description = '□P, □(P→Q) ⊢ □Q';
}

export class AlwaysTransitive extends StringRule {
  readonly name = 'AlwaysTransitive';
  readonly description = '□□P ⊢ □P';
  derive(fs: string[]): string[] {
    return fs.map(formula => {
      const inner = boxInner(formula);
      return inner ? boxInner(inner) : null;
    }).filter(isString).map(inner => `□${parenthesizeIfNeeded(inner)}`);
  }
}

export class AlwaysImpliesNext extends StringRule {
  readonly name = 'AlwaysImpliesNext';
  readonly description = '□P ⊢ X(P)';
  derive(fs: string[]): string[] {
    return fs.map(boxInner).filter(isString).map(inner => `X(${inner})`);
  }
}

export class AlwaysInduction extends StringRule {
  readonly name = 'AlwaysInduction';
  readonly description = 'P, □(P→X(P)) ⊢ □P';
  derive(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      const inner = boxInner(formula);
      const implication = inner ? topSplit(inner, '→') : null;
      if (!implication) continue;
      if (fs.includes(implication[0]) && nextInner(implication[1]) === implication[0]) {
        out.push(`□${parenthesizeIfNeeded(implication[0])}`);
      }
    }
    return out;
  }
}

export class EventuallyFromAlways extends StringRule {
  readonly name = 'EventuallyFromAlways';
  readonly description = '□P ⊢ ◇P';
  derive(fs: string[]): string[] {
    return fs.map(boxInner).filter(isString).map(inner => `◇${parenthesizeIfNeeded(inner)}`);
  }
}

export class EventuallyDistribution extends StringRule {
  readonly name = 'EventuallyDistribution';
  readonly description = '◇(P∨Q) ⊢ ◇P ∨ ◇Q';
  derive(fs: string[]): string[] {
    return fs.flatMap(formula => {
      const inner = diamondInner(formula);
      const parts = inner ? topSplit(inner, '∨') : null;
      return parts ? [`◇${parenthesizeIfNeeded(parts[0])} ∨ ◇${parenthesizeIfNeeded(parts[1])}`] : [];
    });
  }
}

export class EventuallyTransitive extends StringRule {
  readonly name = 'EventuallyTransitive';
  readonly description = '◇◇P ⊢ ◇P';
  derive(fs: string[]): string[] {
    return fs.map(formula => {
      const inner = diamondInner(formula);
      return inner ? diamondInner(inner) : null;
    }).filter(isString).map(inner => `◇${parenthesizeIfNeeded(inner)}`);
  }
}

export class EventuallyImplication extends StringRule {
  readonly name = 'EventuallyImplication';
  readonly description = '◇P, □(P→Q) ⊢ ◇Q';
  derive(fs: string[]): string[] {
    const eventually = fs.map(diamondInner).filter(isString);
    const out: string[] = [];
    for (const formula of fs) {
      const inner = boxInner(formula);
      const implication = inner ? topSplit(inner, '→') : null;
      if (implication && eventually.includes(implication[0])) out.push(`◇${parenthesizeIfNeeded(implication[1])}`);
    }
    return out;
  }
}

export class NextDistribution extends StringRule {
  readonly name = 'NextDistribution';
  readonly description = 'X(P∧Q) ⊢ X(P) ∧ X(Q)';
  derive(fs: string[]): string[] {
    return fs.flatMap(formula => {
      const inner = nextInner(formula);
      const parts = inner ? topSplit(inner, '∧') : null;
      return parts ? [`X(${parts[0]}) ∧ X(${parts[1]})`] : [];
    });
  }
}

export class NextImplication extends StringRule {
  readonly name = 'NextImplication';
  readonly description = 'X(P), X(P→Q) ⊢ X(Q)';
  derive(fs: string[]): string[] {
    const nexts = fs.map(nextInner).filter(isString);
    const out: string[] = [];
    for (const inner of nexts) {
      const implication = topSplit(inner, '→');
      if (implication && nexts.includes(implication[0])) out.push(`X(${implication[1]})`);
    }
    return out;
  }
}

export class UntilWeakening extends StringRule {
  readonly name = 'UntilWeakening';
  readonly description = 'U(P,Q) ⊢ ◇Q';
  derive(fs: string[]): string[] {
    return fs.map(formula => binaryTemporalArgs(formula, 'U')?.[1]).filter(isString)
      .map(q => `◇${parenthesizeIfNeeded(q)}`);
  }
}

export class SinceWeakening extends StringRule {
  readonly name = 'SinceWeakening';
  readonly description = 'S(P,Q) ⊢ Q';
  derive(fs: string[]): string[] {
    return fs.map(formula => binaryTemporalArgs(formula, 'S')?.[1]).filter(isString);
  }
}

export class TemporalUntilElimination extends StringRule {
  readonly name = 'TemporalUntilElimination';
  readonly description = 'U(P,Q), Q ⊢ Q';
  derive(fs: string[]): string[] {
    return fs.map(formula => binaryTemporalArgs(formula, 'U')?.[1]).filter(isString)
      .filter(q => fs.includes(q));
  }
}

export class TemporalNegation extends StringRule {
  readonly name = 'TemporalNegation';
  readonly description = '¬□P ⊢ ◇¬P';
  derive(fs: string[]): string[] {
    return fs.map(formula => {
      const trimmed = formula.trim();
      if (!trimmed.startsWith('¬')) return null;
      const inner = boxInner(trimmed.slice(1).trim());
      return inner ? `◇¬${parenthesizeIfNeeded(inner)}` : null;
    }).filter(isString);
  }
}

export class ObligationDistribution extends StringRule {
  readonly name = 'ObligationDistribution';
  readonly description = 'O(P∧Q) ⊢ O(P) ∧ O(Q)';
  derive(fs: string[]): string[] {
    return fs.flatMap(formula => {
      const inner = deonticInner(formula, 'O');
      const parts = inner ? topSplit(inner, '∧') : null;
      return parts ? [`O(${parts[0]}) ∧ O(${parts[1]})`] : [];
    });
  }
}

export class ObligationImplication extends StringRule {
  readonly name = 'ObligationImplication';
  readonly description = 'O(P), P→Q ⊢ O(Q)';
  derive(fs: string[]): string[] {
    const obligations = fs.map(formula => deonticInner(formula, 'O')).filter(isString);
    const out: string[] = [];
    for (const formula of fs) {
      const implication = topSplit(formula, '→');
      if (implication && obligations.includes(implication[0])) out.push(`O(${implication[1]})`);
    }
    return out;
  }
}

export class PermissionFromNonObligation extends StringRule {
  readonly name = 'PermissionFromNonObligation';
  readonly description = '¬O(¬P) ⊢ P(P)';
  derive(fs: string[]): string[] {
    return fs.map(formula => {
      const trimmed = formula.trim();
      if (!trimmed.startsWith('¬')) return null;
      const inner = deonticInner(trimmed.slice(1).trim(), 'O');
      if (!inner?.startsWith('¬')) return null;
      return `P(${stripOuter(inner.slice(1).trim())})`;
    }).filter(isString);
  }
}

export class ObligationConjunction extends StringRule {
  readonly name = 'ObligationConjunction';
  readonly description = 'O(P), O(Q) ⊢ O(P∧Q)';
  derive(fs: string[]): string[] {
    const obligations = fs.map(formula => deonticInner(formula, 'O')).filter(isString);
    if (obligations.length < 2) return [];
    return [`O(${obligations[0]} ∧ ${obligations[1]})`];
  }
}

export class PermissionDistribution extends StringRule {
  readonly name = 'PermissionDistribution';
  readonly description = 'P(P∨Q) ⊢ P(P) ∨ P(Q)';
  derive(fs: string[]): string[] {
    return fs.flatMap(formula => {
      const inner = deonticInner(formula, 'P');
      const parts = inner ? topSplit(inner, '∨') : null;
      return parts ? [`P(${parts[0]}) ∨ P(${parts[1]})`] : [];
    });
  }
}

export class ObligationConsistency extends StringRule {
  readonly name = 'ObligationConsistency';
  readonly description = 'O(P), O(¬P) ⊢ ⊥';
  derive(fs: string[]): string[] {
    const obligations = fs.map(formula => deonticInner(formula, 'O')).filter(isString);
    return obligations.some(p => obligations.includes(`¬${p}`) || obligations.map(stripOuter).includes(`¬${stripOuter(p)}`))
      ? ['⊥']
      : [];
  }
}

export class ProhibitionEquivalence extends StringRule {
  readonly name = 'ProhibitionEquivalence';
  readonly description = 'F(P) ⊣⊢ O(¬P)';
  derive(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      const prohibition = deonticInner(formula, 'F');
      if (prohibition) out.push(`O(¬${parenthesizeIfNeeded(prohibition)})`);
      const obligation = deonticInner(formula, 'O');
      if (obligation?.startsWith('¬')) out.push(`F(${stripOuter(obligation.slice(1).trim())})`);
    }
    return out;
  }
}

export const ALL_CEC_NATIVE_MODAL_RULES: CECInferenceRule[] = [
  new NecessityElimination(),
  new PossibilityIntroduction(),
  new NecessityDistribution(),
  new PossibilityDuality(),
  new NecessityConjunction(),
];

export const ALL_CEC_NATIVE_TEMPORAL_RULES: CECInferenceRule[] = [
  new AlwaysDistribution(),
  new AlwaysImplication(),
  new AlwaysTransitive(),
  new AlwaysImpliesNext(),
  new AlwaysInduction(),
  new EventuallyFromAlways(),
  new EventuallyDistribution(),
  new EventuallyTransitive(),
  new EventuallyImplication(),
  new NextDistribution(),
  new NextImplication(),
  new UntilWeakening(),
  new SinceWeakening(),
  new TemporalUntilElimination(),
  new TemporalNegation(),
];

export const ALL_CEC_NATIVE_DEONTIC_RULES: CECInferenceRule[] = [
  new ObligationDistribution(),
  new ObligationImplication(),
  new PermissionFromNonObligation(),
  new ObligationConjunction(),
  new PermissionDistribution(),
  new ObligationConsistency(),
  new ProhibitionEquivalence(),
];

export const ALL_CEC_NATIVE_MODAL_TEMPORAL_DEONTIC_RULES: CECInferenceRule[] = [
  ...ALL_CEC_NATIVE_MODAL_RULES,
  ...ALL_CEC_NATIVE_TEMPORAL_RULES,
  ...ALL_CEC_NATIVE_DEONTIC_RULES,
];

export function findApplicableCecNativeRules(formulas: string[]): CECInferenceRule[] {
  return ALL_CEC_NATIVE_MODAL_TEMPORAL_DEONTIC_RULES.filter(rule => rule.canApply(formulas));
}

function boxInner(formula: string): string | null {
  return unaryInner(formula, '□');
}

function diamondInner(formula: string): string | null {
  return unaryInner(formula, '◇');
}

function nextInner(formula: string): string | null {
  return callInner(formula, 'X');
}

function unaryInner(formula: string, op: string): string | null {
  const trimmed = stripOuter(formula.trim());
  if (!trimmed.startsWith(op)) return null;
  return stripOuter(trimmed.slice(op.length).trim());
}

function deonticInner(formula: string, op: 'O' | 'P' | 'F'): string | null {
  return callInner(formula, op);
}

function callInner(formula: string, name: string): string | null {
  const trimmed = formula.trim();
  const prefix = `${name}(`;
  return trimmed.startsWith(prefix) && trimmed.endsWith(')')
    ? stripOuter(trimmed.slice(prefix.length, -1).trim())
    : null;
}

function binaryTemporalArgs(formula: string, op: 'U' | 'S'): [string, string] | null {
  const inner = callInner(formula, op);
  if (!inner) return null;
  return topSplit(inner, ',');
}

function topSplit(formula: string, delimiter: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < formula.length; i += 1) {
    const char = formula[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (depth === 0 && char === delimiter) {
      return [stripOuter(formula.slice(0, i).trim()), stripOuter(formula.slice(i + 1).trim())];
    }
  }
  return null;
}

function stripOuter(formula: string): string {
  let out = formula.trim();
  while (out.startsWith('(') && out.endsWith(')') && balanced(out.slice(1, -1))) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function parenthesizeIfNeeded(formula: string): string {
  const stripped = stripOuter(formula);
  return /[∧∨→,]/.test(stripped) ? `(${stripped})` : stripped;
}

function balanced(value: string): boolean {
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function uniqueNew(values: string[], existing: string[]): string[] {
  const seen = new Set(existing.map(value => value.trim()));
  const out: string[] = [];
  for (const value of values.map(v => v.trim()).filter(Boolean)) {
    if (!seen.has(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

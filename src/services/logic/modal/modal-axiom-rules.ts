/**
 * Named Modal Axiom Rules — PORT-178 (Sprint 84)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/inference_rules/modal.py.
 *
 * Exposes K/T/4/5/B/D as individually named rule classes so routers and
 * conformance tests can select modal frame rules explicitly.
 */

import { ModalLogic } from '../../shadow-prover.js';

export interface ModalAxiomApplication {
  ruleName: string;
  premises: string[];
  conclusion: string;
  logic: ModalLogic[];
}

export abstract class ModalAxiomRule {
  abstract readonly name: string;
  abstract readonly supportedLogics: ModalLogic[];
  abstract apply(formulas: string[]): ModalAxiomApplication[];

  supports(logic: ModalLogic): boolean {
    return this.supportedLogics.includes(logic);
  }
}

export class KModalAxiomRule extends ModalAxiomRule {
  readonly name = 'K';
  readonly supportedLogics = [ModalLogic.K, ModalLogic.T, ModalLogic.D, ModalLogic.S4, ModalLogic.S5];

  apply(formulas: string[]): ModalAxiomApplication[] {
    const apps: ModalAxiomApplication[] = [];
    for (const boxedImplication of formulas) {
      const implication = parseBoxedImplication(boxedImplication);
      if (!implication) continue;
      const [antecedent, consequent] = implication;
      const boxedAntecedent = `□${antecedent}`;
      if (formulas.includes(boxedAntecedent)) {
        apps.push(this.application([boxedImplication, boxedAntecedent], `□${consequent}`));
      }
    }
    return apps;
  }

  private application(premises: string[], conclusion: string): ModalAxiomApplication {
    return { ruleName: this.name, premises, conclusion, logic: this.supportedLogics };
  }
}

export class TModalAxiomRule extends ModalAxiomRule {
  readonly name = 'T';
  readonly supportedLogics = [ModalLogic.T, ModalLogic.S4, ModalLogic.S5];

  apply(formulas: string[]): ModalAxiomApplication[] {
    return formulas
      .filter(isBoxFormula)
      .map(formula => ({ ruleName: this.name, premises: [formula], conclusion: stripBox(formula), logic: this.supportedLogics }));
  }
}

export class FourModalAxiomRule extends ModalAxiomRule {
  readonly name = '4';
  readonly supportedLogics = [ModalLogic.S4, ModalLogic.S5];

  apply(formulas: string[]): ModalAxiomApplication[] {
    return formulas
      .filter(isBoxFormula)
      .map(formula => ({ ruleName: this.name, premises: [formula], conclusion: `□□${stripBox(formula)}`, logic: this.supportedLogics }));
  }
}

export class FiveModalAxiomRule extends ModalAxiomRule {
  readonly name = '5';
  readonly supportedLogics = [ModalLogic.S5];

  apply(formulas: string[]): ModalAxiomApplication[] {
    return formulas
      .filter(isDiamondFormula)
      .map(formula => ({ ruleName: this.name, premises: [formula], conclusion: `□${formula}`, logic: this.supportedLogics }));
  }
}

export class BModalAxiomRule extends ModalAxiomRule {
  readonly name = 'B';
  readonly supportedLogics = [ModalLogic.S5];

  apply(formulas: string[]): ModalAxiomApplication[] {
    return formulas
      .filter(formula => !isBoxFormula(formula) && !isDiamondFormula(formula))
      .map(formula => ({ ruleName: this.name, premises: [formula], conclusion: `□◊${formula}`, logic: this.supportedLogics }));
  }
}

export class DModalAxiomRule extends ModalAxiomRule {
  readonly name = 'D';
  readonly supportedLogics = [ModalLogic.D, ModalLogic.S4, ModalLogic.S5];

  apply(formulas: string[]): ModalAxiomApplication[] {
    return formulas
      .filter(isBoxFormula)
      .map(formula => ({ ruleName: this.name, premises: [formula], conclusion: `◊${stripBox(formula)}`, logic: this.supportedLogics }));
  }
}

const ALL_RULES: ModalAxiomRule[] = [
  new KModalAxiomRule(),
  new TModalAxiomRule(),
  new FourModalAxiomRule(),
  new FiveModalAxiomRule(),
  new BModalAxiomRule(),
  new DModalAxiomRule(),
];

export function getModalAxiomRules(logic?: ModalLogic): ModalAxiomRule[] {
  return logic ? ALL_RULES.filter(rule => rule.supports(logic)) : [...ALL_RULES];
}

export function applyModalAxiomRules(formulas: string[], logic: ModalLogic): ModalAxiomApplication[] {
  const seen = new Set<string>(formulas);
  const apps: ModalAxiomApplication[] = [];
  for (const rule of getModalAxiomRules(logic)) {
    for (const app of rule.apply(formulas)) {
      if (!seen.has(app.conclusion)) {
        seen.add(app.conclusion);
        apps.push(app);
      }
    }
  }
  return apps;
}

function isBoxFormula(formula: string): boolean {
  return formula.trim().startsWith('□');
}

function isDiamondFormula(formula: string): boolean {
  return formula.trim().startsWith('◊');
}

function stripBox(formula: string): string {
  return stripOuterParens(formula.trim().slice(1).trim());
}

function parseBoxedImplication(formula: string): [string, string] | null {
  if (!isBoxFormula(formula)) return null;
  const inner = stripBox(formula);
  const parts = splitTopLevelImplication(inner);
  return parts ? [stripOuterParens(parts[0]), stripOuterParens(parts[1])] : null;
}

function splitTopLevelImplication(formula: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && formula.slice(i, i + 1) === '→') {
      const left = formula.slice(0, i).trim();
      const right = formula.slice(i + 1).trim();
      if (left && right) return [left, right];
    }
  }
  return null;
}

function stripOuterParens(text: string): string {
  if (!text.startsWith('(') || !text.endsWith(')')) return text;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0 && i < text.length - 1) return text;
    }
  }
  return text.slice(1, -1).trim();
}

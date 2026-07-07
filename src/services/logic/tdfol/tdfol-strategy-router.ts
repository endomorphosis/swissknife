/**
 * TDFOL Strategy Router — PORT-182/183 (Sprint 89)
 *
 * Adds a delegating CEC/external-prover router plus modal-tableaux and
 * cost-based strategy selection for TDFOL proof attempts.
 */

import { ExternalProver, ProverStatus } from '../../provers/external-provers.js';
import { createTptpProblem } from '../../provers/tptp-problem.js';
import { ModalLogic } from '../../shadow-prover.js';
import { TableauProver } from '../../cec-modal-tableaux.js';

export interface TDFOLStrategyResult {
  proved: boolean;
  strategy: string;
  status: string;
  proof?: string;
  error?: string;
  cost: number;
  steps: string[];
}

export interface TDFOLStrategy {
  readonly name: string;
  canHandle(formula: string): boolean;
  can_handle(formula: string): boolean;
  estimateCost(formula: string, axioms?: string[]): number;
  estimate_cost(formula: string, axioms?: string[]): number;
  getPriority(formula: string, axioms?: string[]): number;
  get_priority(formula: string, axioms?: string[]): number;
  prove(formula: string, axioms?: string[], timeoutMs?: number): Promise<TDFOLStrategyResult> | TDFOLStrategyResult;
}

export interface FormulaCostEstimate {
  length: number;
  modalOperators: number;
  quantifiers: number;
  connectives: number;
  equalityAtoms: number;
  estimatedCost: number;
}

export class ModalTableauxStrategy implements TDFOLStrategy {
  readonly name = 'modal-tableaux';

  constructor(private readonly logic: ModalLogic = ModalLogic.K) {}

  canHandle(formula: string): boolean {
    return /[□◊]/.test(formula) || /\b[OPF]\s*\(/.test(formula);
  }
  can_handle(formula: string): boolean { return this.canHandle(formula); }

  estimateCost(formula: string, axioms: string[] = []): number {
    const estimate = estimateFormulaCost(formula, axioms);
    return estimate.length + estimate.modalOperators * 5 + estimate.connectives * 2;
  }
  estimate_cost(formula: string, axioms: string[] = []): number { return this.estimateCost(formula, axioms); }

  getPriority(formula: string): number {
    return this.canHandle(formula) ? 30 : 0;
  }
  get_priority(formula: string, axioms: string[] = []): number { return this.getPriority(formula, axioms); }

  prove(formula: string, axioms: string[] = []): TDFOLStrategyResult {
    const result = new TableauProver(this.logic).prove(formula, axioms);
    return {
      proved: result.proved,
      strategy: this.name,
      status: result.proved ? 'proved' : 'open',
      proof: result.tableau.proofSteps.map(step => step.description).join('\n'),
      cost: this.estimateCost(formula, axioms),
      steps: result.tableau.proofSteps.map(step => `${step.ruleName}: ${step.formula}`),
    };
  }
}

export class ForwardFallbackStrategy implements TDFOLStrategy {
  readonly name = 'forward-fallback';

  canHandle(_formula: string): boolean {
    return true;
  }
  can_handle(formula: string): boolean { return this.canHandle(formula); }

  estimateCost(formula: string, axioms: string[] = []): number {
    return estimateFormulaCost(formula, axioms).estimatedCost + 25;
  }
  estimate_cost(formula: string, axioms: string[] = []): number { return this.estimateCost(formula, axioms); }

  getPriority(_formula: string): number {
    return 1;
  }
  get_priority(formula: string, axioms: string[] = []): number { return this.getPriority(formula, axioms); }

  prove(formula: string, axioms: string[] = []): TDFOLStrategyResult {
    const known = new Set(axioms);
    const steps: string[] = [];
    let changed = true;
    while (changed && !known.has(formula)) {
      changed = false;
      for (const axiom of [...known]) {
        const idx = axiom.indexOf('→');
        if (idx < 0) continue;
        const antecedent = axiom.slice(0, idx).trim();
        const consequent = axiom.slice(idx + 1).trim();
        if (known.has(antecedent) && !known.has(consequent)) {
          known.add(consequent);
          steps.push(`${antecedent}, ${axiom} => ${consequent}`);
          changed = true;
        }
      }
    }
    return {
      proved: known.has(formula),
      strategy: this.name,
      status: known.has(formula) ? 'proved' : 'unknown',
      cost: this.estimateCost(formula, axioms),
      steps,
    };
  }
}

export class CECProverRouter {
  constructor(private readonly provers: ExternalProver[] = []) {}

  route(formula: string): ExternalProver | null {
    const available = this.provers.filter(prover => prover.isAvailable());
    if (!available.length) return null;
    const estimate = estimateFormulaCost(formula);
    if (estimate.equalityAtoms > 0) {
      return available.find(prover => prover.supportsEquality) ?? available[0]!;
    }
    return available[0]!;
  }

  prove(formula: string, axioms: string[] = [], timeoutMs = 30_000): TDFOLStrategyResult {
    const prover = this.route(formula);
    if (!prover) {
      return { proved: false, strategy: 'cec-router', status: 'unavailable', error: 'No external CEC prover available', cost: estimateFormulaCost(formula, axioms).estimatedCost, steps: [] };
    }
    const tptp = createTptpProblem({ name: 'tdfol_delegate', axioms, conjectures: [formula] });
    const result = prover.prove(tptp, timeoutMs);
    const proved = result.status === ProverStatus.THEOREM || result.status === ProverStatus.UNSATISFIABLE;
    return {
      proved,
      strategy: `cec-router:${prover.name}`,
      status: result.status,
      proof: result.proof ?? undefined,
      error: result.error ?? undefined,
      cost: estimateFormulaCost(formula, axioms).estimatedCost,
      steps: result.proof ? result.proof.split(/\r?\n/).filter(Boolean) : [],
    };
  }
}

export class CECDelegateStrategy implements TDFOLStrategy {
  readonly name = 'cec-delegate';

  constructor(private readonly router: CECProverRouter) {}

  canHandle(formula: string): boolean {
    const estimate = estimateFormulaCost(formula);
    return estimate.quantifiers > 0 || estimate.equalityAtoms > 0 || formula.length > 80;
  }
  can_handle(formula: string): boolean { return this.canHandle(formula); }

  estimateCost(formula: string, axioms: string[] = []): number {
    const estimate = estimateFormulaCost(formula, axioms);
    return estimate.estimatedCost + 10;
  }
  estimate_cost(formula: string, axioms: string[] = []): number { return this.estimateCost(formula, axioms); }

  getPriority(formula: string): number {
    return this.canHandle(formula) ? 20 : 0;
  }
  get_priority(formula: string, axioms: string[] = []): number { return this.getPriority(formula, axioms); }

  prove(formula: string, axioms: string[] = [], timeoutMs = 30_000): TDFOLStrategyResult {
    return this.router.prove(formula, axioms, timeoutMs);
  }
}

export class CostBasedStrategySelector {
  constructor(private readonly strategies: TDFOLStrategy[]) {}

  select(formula: string, axioms: string[] = []): TDFOLStrategy {
    const candidates = this.rank(formula, axioms);
    if (!candidates.length) throw new Error('No TDFOL strategies registered');
    return candidates[0]!.strategy;
  }
  select_strategy(formula: string, axioms: string[] = []): TDFOLStrategy { return this.select(formula, axioms); }

  rank(formula: string, axioms: string[] = []): Array<{ strategy: TDFOLStrategy; cost: number }> {
    return this.strategies
      .filter(strategy => strategy.canHandle(formula))
      .map(strategy => ({ strategy, cost: strategy.estimateCost(formula, axioms) }))
      .sort((a, b) => {
        if (a.cost !== b.cost) return a.cost - b.cost;
        return b.strategy.getPriority(formula, axioms) - a.strategy.getPriority(formula, axioms);
      });
  }
  select_multiple(formula: string, axioms: string[] = [], limit = this.strategies.length): TDFOLStrategy[] {
    return this.rank(formula, axioms).slice(0, Math.max(0, limit)).map(entry => entry.strategy);
  }
}

export function estimateFormulaCost(formula: string, axioms: string[] = []): FormulaCostEstimate {
  const text = [formula, ...axioms].join(' ');
  const length = text.length;
  const modalOperators = countMatches(text, /[□◊]|(?<![□◊])\b[OPF]\s*\(/g);
  const quantifiers = countMatches(text, /[∀∃]|\b(?:forall|exists)\b/gi);
  const connectives = countMatches(text, /[∧∨¬→↔]|->|=>|<=>|\b(?:and|or|not)\b/gi);
  const equalityAtoms = countMatches(text, /(^|[^=!<>])=($|[^=>])/g);
  return {
    length,
    modalOperators,
    quantifiers,
    connectives,
    equalityAtoms,
    estimatedCost: length + modalOperators * 10 + quantifiers * 12 + connectives * 4 + equalityAtoms * 6,
  };
}

export function createDefaultStrategySelector(provers: ExternalProver[] = []): CostBasedStrategySelector {
  const router = new CECProverRouter(provers);
  return new CostBasedStrategySelector([
    new ModalTableauxStrategy(),
    new CECDelegateStrategy(router),
    new ForwardFallbackStrategy(),
  ]);
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

/**
 * CEC Modal Tableaux — T-223 (Sprint 50)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/modal_tableaux.py
 *
 * Tableau-based automated theorem prover for modal logics.
 * Uses refutation: try to construct a model for ¬goal;
 * if the tableau closes (every branch is contradictory), the goal is proved.
 */

import { ModalLogic } from '../modal/shadow-prover.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Status of a tableau node. */
export enum NodeStatus {
  OPEN      = 'open',
  CLOSED    = 'closed',
  SATURATED = 'saturated',
}

// ---------------------------------------------------------------------------
// TableauNode
// ---------------------------------------------------------------------------

/**
 * A node in a modal tableau (a labelled world with a set of formulas).
 *
 * TypeScript port of `TableauNode` from
 * `ipfs_datasets_py/logic/CEC/native/modal_tableaux.py`.
 */
export class TableauNode {
  readonly formulas    = new Set<string>();
  readonly accessibleWorlds = new Set<number>();
  readonly expandedFormulas = new Set<string>();
  readonly children: TableauNode[] = [];
  parent: TableauNode | null = null;
  status: NodeStatus = NodeStatus.OPEN;

  constructor(
    formulas: Iterable<string>,
    public readonly world: number,
  ) {
    for (const f of formulas) this.formulas.add(f);
  }

  /**
   * Add a formula.
   * @returns `true` if the formula was new, `false` if already present.
   */
  addFormula(formula: string): boolean {
    if (this.formulas.has(formula)) return false;
    this.formulas.add(formula);
    return true;
  }

  /**
   * Check for a contradiction: both P and ¬P are present.
   */
  isContradictory(): boolean {
    for (const f of this.formulas) {
      const negated = f.startsWith('¬') ? f.slice(1) : `¬${f}`;
      if (this.formulas.has(negated)) return true;
    }
    return false;
  }

  close(): void {
    this.status = NodeStatus.CLOSED;
  }

  isClosed(): boolean { return this.status === NodeStatus.CLOSED; }
  isSaturated(): boolean { return this.status === NodeStatus.SATURATED; }
}

// ---------------------------------------------------------------------------
// ModalTableau
// ---------------------------------------------------------------------------

export interface TableauProofStep {
  ruleName: string;
  world: number;
  formula: string;
  description: string;
}

/**
 * A modal tableau structure (rooted tree of `TableauNode`s).
 */
export class ModalTableau {
  readonly proofSteps: TableauProofStep[] = [];
  private worldCounter = 0;

  constructor(
    public readonly root: TableauNode,
    public readonly logic: ModalLogic,
  ) {}

  /**
   * Returns `true` when every branch of the tableau is closed.
   */
  isClosed(): boolean {
    return this._isBranchClosed(this.root);
  }

  private _isBranchClosed(node: TableauNode): boolean {
    if (node.status === NodeStatus.CLOSED) return true;
    if (node.children.length === 0) return false;
    return node.children.every(c => this._isBranchClosed(c));
  }

  /** Generate a fresh world identifier. */
  newWorld(): number {
    return ++this.worldCounter;
  }

  addStep(step: TableauProofStep): void {
    this.proofSteps.push(step);
  }
}

// ---------------------------------------------------------------------------
// Axiom schemata for expansion
// ---------------------------------------------------------------------------

/**
 * Expand modal axiom schemata into the node.
 * Returns new formulas added (for bookkeeping).
 */
function applyModalAxioms(node: TableauNode, logic: ModalLogic): string[] {
  const added: string[] = [];
  const boxFormulas = [...node.formulas].filter(f => f.startsWith('□'));

  for (const bf of boxFormulas) {
    if (node.expandedFormulas.has(bf)) continue;
    const inner = bf.slice(1); // strip □

    // T axiom: □φ → φ  (for T, S4, S5)
    if ([ModalLogic.T, ModalLogic.S4, ModalLogic.S5].includes(logic)) {
      if (node.addFormula(inner)) added.push(inner);
    }
    // S4 axiom: □φ → □□φ
    if ([ModalLogic.S4, ModalLogic.S5].includes(logic)) {
      const doublebox = `□□${inner}`;
      if (node.addFormula(doublebox)) added.push(doublebox);
    }
    node.expandedFormulas.add(bf);
  }
  return added;
}

// ---------------------------------------------------------------------------
// TableauProver
// ---------------------------------------------------------------------------

export interface TableauProverStats {
  proofsAttempted: number;
  proofsSucceeded: number;
  proofsFailed: number;
  totalSteps: number;
}

/**
 * Tableau-based prover for modal logics.
 *
 * TypeScript port of `TableauProver` from
 * `ipfs_datasets_py/logic/CEC/native/modal_tableaux.py`.
 */
export class TableauProver {
  private readonly stats: TableauProverStats = {
    proofsAttempted: 0, proofsSucceeded: 0, proofsFailed: 0, totalSteps: 0,
  };

  constructor(private readonly logic: ModalLogic) {}

  /**
   * Prove `goal` by refuting its negation (tableaux = refutation method).
   *
   * @param goal         Formula string to prove.
   * @param assumptions  Additional assumed formulas (axioms).
   * @returns            `{ proved, tableau }`.
   */
  prove(goal: string, assumptions: string[] = []): { proved: boolean; tableau: ModalTableau } {
    this.stats.proofsAttempted++;

    // Seed root with assumptions + ¬goal (refutation)
    const rootFormulas = [...assumptions, goal.startsWith('¬') ? goal.slice(1) : `¬${goal}`];
    const root = new TableauNode(rootFormulas, 0);
    const tableau = new ModalTableau(root, this.logic);

    this._expand(root, tableau);

    // If tableau is closed, goal is proved
    const proved = tableau.isClosed() || root.isContradictory();
    if (proved) this.stats.proofsSucceeded++; else this.stats.proofsFailed++;
    this.stats.totalSteps += tableau.proofSteps.length;

    return { proved, tableau };
  }

  getStats(): Readonly<TableauProverStats> { return { ...this.stats }; }

  // -------------------------------------------------------------------------

  private _expand(node: TableauNode, tableau: ModalTableau): void {
    // Check contradiction first
    if (node.isContradictory()) {
      node.close();
      tableau.addStep({ ruleName: 'Close', world: node.world, formula: '⊥', description: 'Branch closed: contradiction' });
      return;
    }

    // Apply modal axioms
    const added = applyModalAxioms(node, this.logic);
    for (const f of added) {
      tableau.addStep({ ruleName: 'ModalAxiom', world: node.world, formula: f, description: `Applied ${this.logic} axiom` });
    }

    // Re-check after axiom expansion
    if (node.isContradictory()) {
      node.close();
      tableau.addStep({ ruleName: 'Close', world: node.world, formula: '⊥', description: 'Branch closed after axiom expansion' });
    }
  }
}

// ---------------------------------------------------------------------------
// ResolutionProver (simple propositional resolution)
// ---------------------------------------------------------------------------

/**
 * Simple propositional resolution prover.
 *
 * TypeScript port of `ResolutionProver` from `modal_tableaux.py`.
 */
export class ResolutionProver {
  private readonly stats: TableauProverStats = {
    proofsAttempted: 0, proofsSucceeded: 0, proofsFailed: 0, totalSteps: 0,
  };

  prove(goal: string, assumptions: string[] = []): { proved: boolean; steps: string[] } {
    this.stats.proofsAttempted++;
    const known = new Set<string>(assumptions);
    const steps: string[] = [];

    // Forward-chain modus ponens
    let changed = true;
    while (changed) {
      changed = false;
      for (const a of [...known]) {
        const arrowIdx = a.indexOf('→');
        if (arrowIdx < 0) continue;
        const ant = a.slice(0, arrowIdx).trim();
        const cons = a.slice(arrowIdx + 1).trim();
        if (known.has(ant) && !known.has(cons)) {
          known.add(cons);
          steps.push(`MP: ${ant}, ${a} ⊢ ${cons}`);
          changed = true;
        }
      }
    }

    const proved = known.has(goal);
    if (proved) { this.stats.proofsSucceeded++; } else { this.stats.proofsFailed++; }
    this.stats.totalSteps += steps.length;
    return { proved, steps };
  }

  /** Resolve two clauses: returns resolvent if resolution is possible, else null. */
  resolveWith(c1: Set<string>, c2: Set<string>): Set<string> | null {
    for (const lit of c1) {
      const neg = lit.startsWith('¬') ? lit.slice(1) : `¬${lit}`;
      if (c2.has(neg)) {
        const resolvent = new Set([...c1, ...c2]);
        resolvent.delete(lit);
        resolvent.delete(neg);
        return resolvent;
      }
    }
    return null;
  }

  getStats(): Readonly<TableauProverStats> { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// Factory functions (matching Python API)
// ---------------------------------------------------------------------------

export function createTableauProver(logic: ModalLogic): TableauProver {
  return new TableauProver(logic);
}

export function createResolutionProver(): ResolutionProver {
  return new ResolutionProver();
}

// PORT-100: Propositional α/β tableaux expansion rules
// α-rules (linear): ¬¬φ, φ∧ψ, ¬(φ∨ψ), ¬(φ→ψ), φ↔ψ-left
// β-rules (branching): φ∨ψ, ¬(φ∧ψ), φ→ψ, ¬(φ↔ψ)

export type AlphaComponents = [string, string] | [string];  // 1 or 2 formulas
export type BetaComponents  = [string[], string[]];           // two branches

function stripOuterParens(formula: string): string {
  let text = formula.trim();
  while (text.startsWith('(') && text.endsWith(')')) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && i < text.length - 1) {
        wraps = false;
        break;
      }
      if (depth < 0) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function splitTopLevelBinary(formula: string, operators: string[]): { left: string; op: string; right: string } | null {
  const text = stripOuterParens(formula);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth--;
      continue;
    }
    if (depth === 0 && operators.includes(ch)) {
      return {
        left: text.slice(0, i).trim(),
        op: ch,
        right: text.slice(i + 1).trim(),
      };
    }
  }
  return null;
}

function neg(formula: string): string {
  const text = stripOuterParens(formula);
  return text.startsWith('¬') ? text.slice(1).trim() : `¬${text}`;
}

function normalizedFormula(formula: string): string {
  return stripOuterParens(formula).replace(/\s+/g, ' ').trim();
}

function hasContradiction(formulas: Iterable<string>): boolean {
  const normalized = new Set(Array.from(formulas, normalizedFormula));
  for (const formula of normalized) {
    if (formula.startsWith('¬')) {
      if (normalized.has(formula.slice(1).trim())) return true;
    } else if (normalized.has(`¬${formula}`)) {
      return true;
    }
  }
  return false;
}

export function applyAlphaRule(formula: string): AlphaComponents | null {
  const text = stripOuterParens(formula);

  // ¬¬φ → φ
  if (text.startsWith('¬¬')) return [normalizedFormula(text.slice(2))];

  // φ ∧ ψ → φ, ψ
  const and = splitTopLevelBinary(text, ['∧']);
  if (and) return [normalizedFormula(and.left), normalizedFormula(and.right)];

  // ¬(φ ∨ ψ) → ¬φ, ¬ψ
  if (text.startsWith('¬')) {
    const innerOr = splitTopLevelBinary(text.slice(1), ['∨']);
    if (innerOr) return [neg(innerOr.left), neg(innerOr.right)];
  }

  // ¬(φ → ψ) → φ, ¬ψ
  if (text.startsWith('¬')) {
    const innerImp = splitTopLevelBinary(text.slice(1), ['→']);
    if (innerImp) return [normalizedFormula(innerImp.left), neg(innerImp.right)];
  }

  return null;
}

export function applyBetaRule(formula: string): BetaComponents | null {
  const text = stripOuterParens(formula);

  // φ ∨ ψ → {φ} | {ψ}
  const or = splitTopLevelBinary(text, ['∨']);
  if (or) return [[normalizedFormula(or.left)], [normalizedFormula(or.right)]];

  // ¬(φ ∧ ψ) → {¬φ} | {¬ψ}
  if (text.startsWith('¬')) {
    const innerAnd = splitTopLevelBinary(text.slice(1), ['∧']);
    if (innerAnd) return [[neg(innerAnd.left)], [neg(innerAnd.right)]];
  }

  // φ → ψ → {¬φ} | {ψ}
  const imp = splitTopLevelBinary(text, ['→']);
  if (imp) return [[neg(imp.left)], [normalizedFormula(imp.right)]];

  // φ ↔ ψ → {φ,ψ} | {¬φ,¬ψ}
  const iff = splitTopLevelBinary(text, ['↔']);
  if (iff) return [[normalizedFormula(iff.left), normalizedFormula(iff.right)], [neg(iff.left), neg(iff.right)]];

  // ¬(φ ↔ ψ) → {φ,¬ψ} | {¬φ,ψ}
  if (text.startsWith('¬')) {
    const innerIff = splitTopLevelBinary(text.slice(1), ['↔']);
    if (innerIff) return [[normalizedFormula(innerIff.left), neg(innerIff.right)], [neg(innerIff.left), normalizedFormula(innerIff.right)]];
  }

  return null;
}

/** Check if a formula is an α (linear) rule target. */
export function isAlphaFormula(f: string): boolean { return applyAlphaRule(f) !== null; }
/** Check if a formula is a β (branching) rule target. */
export function isBetaFormula(f: string): boolean  { return applyBetaRule(f)  !== null; }

/** Expand a signed formula until no more α/β rules apply.
 *  Returns { open: string[][], closed: boolean } for one initial branch. */
export function propositionalTableauxExpand(formulas: string[]): { open: string[][]; closed: boolean } {
  type BranchState = { formulas: Set<string>; expanded: Set<string> };
  const pending: BranchState[] = [{
    formulas: new Set(formulas.map(normalizedFormula).filter(Boolean)),
    expanded: new Set(),
  }];
  const open: string[][] = [];

  while (pending.length > 0) {
    const branch = pending.pop()!;
    let branched = false;

    while (true) {
      if (hasContradiction(branch.formulas)) {
        branched = true;
        break;
      }

      const alphaTarget = Array.from(branch.formulas).find(f => !branch.expanded.has(f) && isAlphaFormula(f));
      if (alphaTarget) {
        branch.expanded.add(alphaTarget);
        for (const component of applyAlphaRule(alphaTarget) ?? []) {
          branch.formulas.add(normalizedFormula(component));
        }
        continue;
      }

      const betaTarget = Array.from(branch.formulas).find(f => !branch.expanded.has(f) && isBetaFormula(f));
      if (betaTarget) {
        const beta = applyBetaRule(betaTarget);
        branch.expanded.add(betaTarget);
        if (beta) {
          for (const branchComponents of beta) {
            const nextFormulas = new Set(branch.formulas);
            const nextExpanded = new Set(branch.expanded);
            for (const component of branchComponents) {
              nextFormulas.add(normalizedFormula(component));
            }
            pending.push({ formulas: nextFormulas, expanded: nextExpanded });
          }
          branched = true;
          break;
        }
      }

      break;
    }

    if (!branched && !hasContradiction(branch.formulas)) {
      open.push(Array.from(branch.formulas).sort());
    }
  }

  return { open, closed: open.length === 0 };
}

// PORT-101: Python-compatible ProofStep schema (shadow_prover.py ProofStep)
export interface PythonCompatProofStep {
  ruleName:    string;
  world?:      number;
  formula:     string;
  description: string;
  rule?:       string;
  premises?:   string[];
  conclusion?: string;
}

export function toProofStepWire(step: { rule: string; premises: string[]; conclusion: string }): PythonCompatProofStep {
  return {
    ruleName:    step.rule,
    formula:     step.conclusion,
    description: `${step.rule}: [${step.premises.join(', ')}] ⊢ ${step.conclusion}`,
    rule:        step.rule,
    premises:    step.premises,
    conclusion:  step.conclusion,
  };
}

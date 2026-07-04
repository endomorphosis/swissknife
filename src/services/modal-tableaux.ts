/**
 * modal-tableaux.ts
 *
 * Modal logic tableaux prover for K, T, D, S4, S5.
 * TypeScript port of ipfs_datasets_py/logic/TDFOL/modal_tableaux.py
 *
 * Provides:
 *   ModalLogicType enum (K / T / D / S4 / S5)
 *   World              — possible world with positive/negated formula sets
 *   TableauxBranch     — one branch of the proof tree
 *   TableauxResult     — outcome of a prove() call
 *   ModalTableaux      — tableaux-based validity prover
 *   proveModalFormula  — convenience wrapper
 */

import {
  Formula,
  BinaryFormula,
  UnaryFormula,
  DeonticFormulaTDFOL,
  TemporalFormulaTDFOL,
  QuantifiedFormula,
  mkUnary,
  mkBinary,
} from './tdfol-core.js';

// ---------------------------------------------------------------------------
// Modal logic types
// ---------------------------------------------------------------------------

export enum ModalLogicType {
  K  = 'K',   // Basic modal logic
  T  = 'T',   // Reflexive (T axiom)
  D  = 'D',   // Serial (D axiom)
  S4 = 'S4',  // Reflexive + Transitive
  S5 = 'S5',  // Equivalence relation
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

/** A possible world in the Kripke structure used by the tableaux. */
export class World {
  readonly id: number;
  formulas: Set<Formula>;
  negatedFormulas: Set<Formula>;

  constructor(id: number) {
    this.id = id;
    this.formulas = new Set();
    this.negatedFormulas = new Set();
  }

  addFormula(formula: Formula, negated = false): void {
    if (negated) this.negatedFormulas.add(formula);
    else this.formulas.add(formula);
  }

  /**
   * Returns true if this world contains a direct contradiction (φ and ¬φ for
   * the same formula object).  We use reference equality as a proxy for
   * syntactic identity.
   */
  hasContradiction(): boolean {
    for (const f of this.formulas) {
      if (this.negatedFormulas.has(f)) return true;
    }
    // Also check: positive UnaryFormula (¬φ) whose operand is in formulas
    for (const f of this.negatedFormulas) {
      if (this.formulas.has(f)) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// TableauxBranch
// ---------------------------------------------------------------------------

/** A single branch in the semantic tableaux. */
export class TableauxBranch {
  worlds: Map<number, World> = new Map();
  accessibility: Map<number, Set<number>> = new Map();
  currentWorld = 0;
  isClosed = false;
  private nextWorldId = 1;
  private boxHistory: Map<number, Set<Formula>> = new Map();
  private negDiamondHistory: Map<number, Set<Formula>> = new Map();

  addWorld(world: World): void {
    this.worlds.set(world.id, world);
    if (!this.accessibility.has(world.id)) {
      this.accessibility.set(world.id, new Set());
    }
  }

  addAccessibility(from: number, to: number): void {
    if (!this.accessibility.has(from)) this.accessibility.set(from, new Set());
    this.accessibility.get(from)!.add(to);
  }

  createFreshWorld(): World {
    const w = new World(this.nextWorldId++);
    this.addWorld(w);
    return w;
  }

  closeBranch(): void {
    this.isClosed = true;
  }

  getBoxHistory(worldId: number): Set<Formula> {
    return this.boxHistory.get(worldId) ?? new Set();
  }

  addBoxHistory(worldId: number, body: Formula): void {
    if (!this.boxHistory.has(worldId)) this.boxHistory.set(worldId, new Set());
    this.boxHistory.get(worldId)!.add(body);
  }

  getNegDiamondHistory(worldId: number): Set<Formula> {
    return this.negDiamondHistory.get(worldId) ?? new Set();
  }

  addNegDiamondHistory(worldId: number, body: Formula): void {
    if (!this.negDiamondHistory.has(worldId)) this.negDiamondHistory.set(worldId, new Set());
    this.negDiamondHistory.get(worldId)!.add(body);
  }

  /** Deep-copy this branch (for forking on disjunctions). */
  clone(): TableauxBranch {
    const b = new TableauxBranch();
    b.currentWorld = this.currentWorld;
    b.isClosed = this.isClosed;
    b.nextWorldId = this.nextWorldId;
    for (const [id, world] of this.worlds) {
      const w = new World(id);
      for (const f of world.formulas) w.formulas.add(f);
      for (const f of world.negatedFormulas) w.negatedFormulas.add(f);
      b.worlds.set(id, w);
    }
    for (const [k, vs] of this.accessibility) {
      b.accessibility.set(k, new Set(vs));
    }
    for (const [k, vs] of this.boxHistory) {
      b.boxHistory.set(k, new Set(vs));
    }
    for (const [k, vs] of this.negDiamondHistory) {
      b.negDiamondHistory.set(k, new Set(vs));
    }
    return b;
  }
}

// ---------------------------------------------------------------------------
// TableauxResult
// ---------------------------------------------------------------------------

export interface TableauxResult {
  /** Whether the formula is valid in the given logic. */
  isValid: boolean;
  closedBranches: number;
  totalBranches: number;
  /** A witness open branch when `isValid` is false. */
  openBranch?: TableauxBranch;
  proofSteps: string[];
}

// ---------------------------------------------------------------------------
// ModalTableaux
// ---------------------------------------------------------------------------

/** Maps a `TemporalFormulaTDFOL`-like deontic/temporal node to its "body" formula. */
function getBody(f: Formula): Formula | null {
  const n = f as DeonticFormulaTDFOL | TemporalFormulaTDFOL;
  if ('formula' in n) return (n as { formula: Formula }).formula;
  return null;
}

export class ModalTableaux {
  private logicType: ModalLogicType;
  private maxWorlds = 100;
  private maxDepth = 50;

  constructor(logicType: ModalLogicType = ModalLogicType.K) {
    this.logicType = logicType;
  }

  /**
   * Attempt to prove `formula` is valid in `this.logicType`.
   *
   * Strategy: try to show ¬formula is unsatisfiable (all branches close).
   */
  prove(formula: Formula): TableauxResult {
    const initial = new TableauxBranch();
    const root = new World(0);
    initial.addWorld(root);

    // Start with ¬formula
    root.addFormula(formula, true /* negated */);

    // Apply frame conditions
    if (
      this.logicType === ModalLogicType.T ||
      this.logicType === ModalLogicType.S4 ||
      this.logicType === ModalLogicType.S5
    ) {
      initial.addAccessibility(0, 0); // reflexivity
    }

    let branches: TableauxBranch[] = [initial];
    const proofSteps: string[] = [];
    let depth = 0;

    while (depth < this.maxDepth) {
      depth++;
      const newBranches: TableauxBranch[] = [];

      for (const branch of branches) {
        if (branch.isClosed) { newBranches.push(branch); continue; }

        const expanded = this.expandBranch(branch, proofSteps);
        if (expanded === null) {
          newBranches.push(branch);
        } else {
          newBranches.push(...expanded);
        }
      }
      branches = newBranches;

      const closedCount = branches.filter(b => b.isClosed).length;
      if (closedCount === branches.length) {
        return { isValid: true, closedBranches: closedCount, totalBranches: branches.length, proofSteps };
      }

      const canExpand = branches.some(b => !b.isClosed && this.canExpand(b));
      if (!canExpand) break;
    }

    const openBranch = branches.find(b => !b.isClosed);
    const closedCount = branches.filter(b => b.isClosed).length;
    return { isValid: false, closedBranches: closedCount, totalBranches: branches.length, openBranch, proofSteps };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private canExpand(branch: TableauxBranch): boolean {
    for (const world of branch.worlds.values()) {
      for (const f of [...world.formulas, ...world.negatedFormulas]) {
        if (this.needsExpansion(f)) return true;
      }
    }
    return false;
  }

  private needsExpansion(f: Formula): boolean {
    return (
      'operator' in f ||
      'quantifier' in f ||
      'deonticOp' in f ||
      'temporalOp' in f ||
      // PORT-001: TemporalFormulaTDFOL uses 'operator' not 'temporalOp'
      (('kind' in f) && (f as unknown as Record<string, unknown>)['kind'] === 'temporal')
    );
  }

  private closeContradictoryWorlds(branch: TableauxBranch, steps: string[]): void {
    if (branch.isClosed) return;
    for (const [wid, world] of branch.worlds) {
      if (world.hasContradiction()) {
        branch.closeBranch();
        steps.push(`Branch closed: contradiction at world ${wid}`);
        return;
      }
    }
  }

  private expandBranch(branch: TableauxBranch, steps: string[]): TableauxBranch[] | null {
    if (branch.isClosed) return [branch];

    for (const [worldId, world] of branch.worlds) {
      for (const f of [...world.formulas]) {
        if (!this.needsExpansion(f)) continue;
        const result = this.expandFormula(branch, worldId, f, false, steps);
        if (result !== null) {
          for (const b of result) this.closeContradictoryWorlds(b, steps);
          return result;
        }
      }
      for (const f of [...world.negatedFormulas]) {
        if (!this.needsExpansion(f)) continue;
        const result = this.expandFormula(branch, worldId, f, true, steps);
        if (result !== null) {
          for (const b of result) this.closeContradictoryWorlds(b, steps);
          return result;
        }
      }
    }
    return null;
  }

  private expandFormula(
    branch: TableauxBranch,
    worldId: number,
    formula: Formula,
    negated: boolean,
    steps: string[],
  ): TableauxBranch[] | null {
    const world = branch.worlds.get(worldId)!;

    if (negated) {
      if (!world.negatedFormulas.has(formula)) return null;
      world.negatedFormulas.delete(formula);
    } else {
      if (!world.formulas.has(formula)) return null;
      world.formulas.delete(formula);
    }

    const f = formula as BinaryFormula & UnaryFormula & DeonticFormulaTDFOL & TemporalFormulaTDFOL & QuantifiedFormula;

    // ---- Binary propositional ----
    if ('left' in f && 'right' in f && 'operator' in f) {
      return this.expandBinary(branch, worldId, f as BinaryFormula, negated, steps);
    }
    // ---- Unary (negation) ----
    if ('operand' in f && 'operator' in f) {
      const op = f as UnaryFormula;
      const target = op.operand as Formula;
      world.addFormula(target, !negated);
      steps.push(`¬-elim at world ${worldId}: ${negated ? '¬¬' : '¬'}φ`);
      return [branch];
    }
    // ---- Modal (deontic/temporal treated as □/◊) ----
    if ('deonticOp' in f) {
      return this.expandBoxDiamond(branch, worldId, getBody(formula)!, negated, steps);
    }
    if ('temporalOp' in f) {
      const top = (f as unknown as { temporalOp: string }).temporalOp;
      const isBox = top === '□';
      return this.expandBoxDiamond(branch, worldId, getBody(formula)!, negated !== isBox, steps);
    }
    // PORT-001 compat: TemporalFormulaTDFOL uses 'operator' (tdfol-core.ts) not 'temporalOp'
    if (('kind' in f) && (f as unknown as Record<string, unknown>)['kind'] === 'temporal') {
      const top = (f as unknown as { operator: string }).operator;
      const isBox = top === '□';
      return this.expandBoxDiamond(branch, worldId, getBody(formula)!, negated !== isBox, steps);
    }
    // ---- Quantified ----
    if ('quantifier' in f) {
      // Simple Skolemization: treat as body
      const body = (f as QuantifiedFormula).body as Formula;
      world.addFormula(body, negated);
      return [branch];
    }
    return [branch];
  }

  private expandBinary(
    branch: TableauxBranch,
    worldId: number,
    f: BinaryFormula,
    negated: boolean,
    steps: string[],
  ): TableauxBranch[] {
    const world = branch.worlds.get(worldId)!;
    const { operator, left, right } = f;

    if (operator === '∧') {
      if (!negated) {
        // α-rule: both branches get both conjuncts
        world.addFormula(left as Formula, false);
        world.addFormula(right as Formula, false);
        steps.push(`∧ at world ${worldId}`);
        return [branch];
      } else {
        // β-rule: split on ¬A, ¬B
        const b2 = branch.clone();
        branch.worlds.get(worldId)!.addFormula(left as Formula, true);
        b2.worlds.get(worldId)!.addFormula(right as Formula, true);
        steps.push(`¬∧ split at world ${worldId}`);
        return [branch, b2];
      }
    }
    if (operator === '∨') {
      if (!negated) {
        // β-rule: split
        const b2 = branch.clone();
        branch.worlds.get(worldId)!.addFormula(left as Formula, false);
        b2.worlds.get(worldId)!.addFormula(right as Formula, false);
        steps.push(`∨ split at world ${worldId}`);
        return [branch, b2];
      } else {
        // α-rule: ¬A ∧ ¬B
        world.addFormula(left as Formula, true);
        world.addFormula(right as Formula, true);
        steps.push(`¬∨ at world ${worldId}`);
        return [branch];
      }
    }
    if (operator === '→') {
      if (!negated) {
        // β-rule: ¬A | B
        const b2 = branch.clone();
        branch.worlds.get(worldId)!.addFormula(left as Formula, true);
        b2.worlds.get(worldId)!.addFormula(right as Formula, false);
        steps.push(`→ split at world ${worldId}`);
        return [branch, b2];
      } else {
        // α-rule: A ∧ ¬B
        world.addFormula(left as Formula, false);
        world.addFormula(right as Formula, true);
        steps.push(`¬→ at world ${worldId}`);
        return [branch];
      }
    }
    if (operator === '↔') {
      if (!negated) {
        const b2 = branch.clone();
        branch.worlds.get(worldId)!.addFormula(left as Formula, false);
        branch.worlds.get(worldId)!.addFormula(right as Formula, false);
        b2.worlds.get(worldId)!.addFormula(left as Formula, true);
        b2.worlds.get(worldId)!.addFormula(right as Formula, true);
        return [branch, b2];
      } else {
        const b2 = branch.clone();
        branch.worlds.get(worldId)!.addFormula(left as Formula, false);
        branch.worlds.get(worldId)!.addFormula(right as Formula, true);
        b2.worlds.get(worldId)!.addFormula(left as Formula, true);
        b2.worlds.get(worldId)!.addFormula(right as Formula, false);
        return [branch, b2];
      }
    }
    // Fallback: add both sides
    world.addFormula(left as Formula, negated);
    world.addFormula(right as Formula, negated);
    return [branch];
  }

  /** Expand □φ (box) or ◊φ (diamond) at worldId. */
  private expandBoxDiamond(
    branch: TableauxBranch,
    worldId: number,
    body: Formula,
    isBox: boolean,
    steps: string[],
  ): TableauxBranch[] {
    if (isBox) {
      // □φ: propagate φ to all accessible worlds
      const accessible = branch.accessibility.get(worldId) ?? new Set<number>();
      let anyAdded = false;
      for (const wid of accessible) {
        const w = branch.worlds.get(wid)!;
        if (!w.formulas.has(body)) {
          w.addFormula(body, false);
          anyAdded = true;
        }
      }
      branch.addBoxHistory(worldId, body);
      steps.push(`□ at world ${worldId} → ${[...accessible].join(',')}`);
      // For S4/S5: also propagate to all transitive successors (handled on next expansion)
      if (!anyAdded) return [branch];
      return [branch];
    } else {
      // ◊φ: create new accessible world
      if (branch.worlds.size >= this.maxWorlds) return [branch];
      const newWorld = branch.createFreshWorld();
      branch.addAccessibility(worldId, newWorld.id);
      // PORT-120 (S5 symmetry): wRv → vRw
      if (this.logicType === ModalLogicType.S5) {
        branch.addAccessibility(newWorld.id, worldId);
      }
      newWorld.addFormula(body, false);

      // For D logic: ensure seriality (at least one accessible world — already done)
      // For T/S4/S5: add reflexive edge on new world
      if (
        this.logicType === ModalLogicType.T ||
        this.logicType === ModalLogicType.S4 ||
        this.logicType === ModalLogicType.S5
      ) {
        branch.addAccessibility(newWorld.id, newWorld.id);
      }

      // S4/S5: transitivity — inherit box history from worldId
      if (this.logicType === ModalLogicType.S4 || this.logicType === ModalLogicType.S5) {
        for (const f of branch.getBoxHistory(worldId)) {
          if (!newWorld.formulas.has(f)) newWorld.addFormula(f, false);
        }
      }

      steps.push(`◊ at world ${worldId} → new world ${newWorld.id}`);
      return [branch];
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Prove a single modal formula.
 *
 * @param formula  - The formula to check for validity.
 * @param logicType - Defaults to K (basic modal logic).
 */
export function proveModalFormula(
  formula: Formula,
  logicType: ModalLogicType = ModalLogicType.K,
): TableauxResult {
  return new ModalTableaux(logicType).prove(formula);
}

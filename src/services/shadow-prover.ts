/**
 * ShadowProver — T-205 (Sprint 46)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/shadow_prover.py
 *
 * A pure TypeScript implementation of ShadowProver: an automated theorem
 * prover for modal logics (K, T, S4, S5, D) and cognitive calculus.
 * Replicates the Java ShadowProver's inference strategy using resolution
 * and modal axiom schemata.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Supported modal logic systems. */
export enum ModalLogic {
  K   = 'K',    // Basic modal logic (no additional axioms)
  T   = 'T',    // Reflexive (□φ → φ)
  S4  = 'S4',   // Reflexive + Transitive (□φ → □□φ)
  S5  = 'S5',   // Reflexive + Transitive + Symmetric (◇φ → □◇φ)
  D   = 'D',    // Serial (□φ → ◇φ)
  LP  = 'LP',   // Linear logic (propositional)
  LP1 = 'LP1',  // Linear logic level 1
  LP2 = 'LP2',  // Linear logic level 2
}

/** Status of a proof attempt. */
export enum ProofStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
  ERROR   = 'error',
}

/** Modal operators. */
export enum ModalOperator {
  NECESSARY = '□',   // Box — necessarily
  POSSIBLE  = '◇',   // Diamond — possibly
  BELIEF    = 'B',   // Belief
  KNOWLEDGE = 'K',   // Knowledge
  SAYS      = 'says',
  PERCEIVES = 'P',   // Perception
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** A single inference step within a proof. */
export interface ProofStep {
  /** Name of the inference rule applied. */
  ruleName: string;
  /** Premises as formula strings. */
  premises: string[];
  /** Derived conclusion formula string. */
  conclusion: string;
  /** Human-readable justification. */
  justification: string;
}

/** A complete proof tree (or failed proof attempt). */
export class ProofTree {
  constructor(
    public readonly goal: string,
    public readonly steps: ProofStep[],
    public readonly status: ProofStatus,
    public readonly logic: ModalLogic,
    public readonly metadata: Record<string, unknown> = {},
  ) {}

  isSuccessful(): boolean {
    return this.status === ProofStatus.SUCCESS;
  }

  /** Number of proof steps (depth). */
  getDepth(): number {
    return this.steps.length;
  }
}

/** Represents a theorem-proving problem. */
export interface ProblemFile {
  /** Problem identifier. */
  name: string;
  /** Modal logic system to apply. */
  logic: ModalLogic;
  /** List of assumption (axiom) strings. */
  assumptions: string[];
  /** Goals to prove. */
  goals: string[];
  /** Additional problem metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Abstract ShadowProver base
// ---------------------------------------------------------------------------

export interface ProverStatistics {
  proofsAttempted: number;
  proofsSucceeded: number;
  proofsFailed: number;
  averageSteps: number;
}

/**
 * Abstract base class for ShadowProver implementations.
 *
 * Different modal logic systems (K, T, S4, S5) require different sets of
 * axiom schemata.  Subclasses implement the actual proving logic.
 */
export abstract class ShadowProver {
  protected readonly logic: ModalLogic;
  protected readonly proofCache = new Map<string, ProofTree>();
  protected stats: ProverStatistics = {
    proofsAttempted: 0,
    proofsSucceeded: 0,
    proofsFailed: 0,
    averageSteps: 0,
  };

  constructor(logic: ModalLogic) {
    this.logic = logic;
  }

  abstract prove(goal: string, assumptions?: string[], timeoutMs?: number): ProofTree;
  abstract proveProblem(problem: ProblemFile): ProofTree[];

  getStatistics(): Readonly<ProverStatistics> {
    return { ...this.stats };
  }

  clearCache(): void {
    this.proofCache.clear();
  }

  protected recordOutcome(tree: ProofTree): void {
    this.stats.proofsAttempted++;
    if (tree.isSuccessful()) {
      this.stats.proofsSucceeded++;
    } else {
      this.stats.proofsFailed++;
    }
    // Running average of steps
    const n = this.stats.proofsAttempted;
    this.stats.averageSteps = ((n - 1) * this.stats.averageSteps + tree.getDepth()) / n;
  }
}

// ---------------------------------------------------------------------------
// Axiom schemata helpers
// ---------------------------------------------------------------------------

/** Returns the axiom schemata that hold for a given modal logic. */
function axiomsFor(logic: ModalLogic): string[] {
  const axioms: string[] = [
    // K axiom (all normal modal logics)
    '□(φ→ψ) → (□φ→□ψ)',
  ];
  if ([ModalLogic.T, ModalLogic.S4, ModalLogic.S5].includes(logic)) {
    axioms.push('□φ → φ');           // T axiom (reflexivity)
  }
  if ([ModalLogic.S4, ModalLogic.S5].includes(logic)) {
    axioms.push('□φ → □□φ');         // 4 axiom (transitivity)
  }
  if (logic === ModalLogic.S5) {
    axioms.push('◇φ → □◇φ');         // 5 axiom (Euclidean)
  }
  if (logic === ModalLogic.D) {
    axioms.push('□φ → ◇φ');          // D axiom (seriality)
  }
  return axioms;
}

// ---------------------------------------------------------------------------
// KProver — basic modal logic K
// ---------------------------------------------------------------------------

/**
 * Concrete prover for modal logic K (and extensions T / S4 / S5 / D).
 *
 * Uses a forward-chaining strategy:
 *  1. Apply modus ponens over the assumption closure.
 *  2. Apply modal axiom schemata relevant to the chosen logic.
 *  3. Declare success if the goal is derived, failure otherwise.
 */
export class KProver extends ShadowProver {
  constructor(logic: ModalLogic = ModalLogic.K) {
    super(logic);
  }

  /**
   * Attempt to prove `goal` given `assumptions`.
   *
   * @param goal       Formula string to prove.
   * @param assumptions Additional axioms/premises.
   * @param timeoutMs  Hard wall-clock limit (default 5 000 ms).
   */
  prove(goal: string, assumptions: string[] = [], timeoutMs = 5_000): ProofTree {
    const cacheKey = `${goal}|${assumptions.join(',')}|${this.logic}`;
    const cached = this.proofCache.get(cacheKey);
    if (cached) return cached;

    const deadline = Date.now() + timeoutMs;
    const steps: ProofStep[] = [];
    const known = new Set<string>(assumptions);

    // Seed with axiom schemata
    for (const axiom of axiomsFor(this.logic)) {
      if (!known.has(axiom)) {
        known.add(axiom);
        steps.push({ ruleName: 'AxiomIntroduction', premises: [], conclusion: axiom, justification: `${this.logic} axiom schema` });
      }
    }

    // Forward-chaining modus ponens (bounded)
    let changed = true;
    while (changed) {
      if (Date.now() > deadline) {
        const tree = new ProofTree(goal, steps, ProofStatus.TIMEOUT, this.logic);
        this.recordOutcome(tree);
        this.proofCache.set(cacheKey, tree);
        return tree;
      }
      changed = false;
      for (const a of known) {
        // Pattern: if we have "X → Y" and "X", derive "Y"
        const arrowIdx = this._arrowIndex(a);
        if (arrowIdx < 0) continue;
        const antecedent = a.slice(0, arrowIdx).trim().replace(/^[( ]+|[) ]+$/g, '');
        const consequent = a.slice(arrowIdx + 1).trim().replace(/^[( ]+|[) ]+$/g, '');
        if (known.has(antecedent) && !known.has(consequent)) {
          known.add(consequent);
          steps.push({
            ruleName: 'ModusPonens',
            premises: [antecedent, a],
            conclusion: consequent,
            justification: `MP: ${antecedent}, ${a} ⊢ ${consequent}`,
          });
          changed = true;
          if (consequent === goal) break;
        }
      }
    }

    const proved = known.has(goal);
    const status = proved ? ProofStatus.SUCCESS : ProofStatus.FAILURE;
    const tree = new ProofTree(goal, steps, status, this.logic);
    this.recordOutcome(tree);
    this.proofCache.set(cacheKey, tree);
    return tree;
  }

  proveProblem(problem: ProblemFile): ProofTree[] {
    return problem.goals.map(goal => this.prove(goal, problem.assumptions));
  }

  /** Find the main implication arrow in a formula string (skips nested parens). */
  private _arrowIndex(formula: string): number {
    let depth = 0;
    for (let i = 0; i < formula.length - 1; i++) {
      if (formula[i] === '(') depth++;
      else if (formula[i] === ')') depth--;
      else if (depth === 0 && formula[i] === '→') return i;
      else if (depth === 0 && formula.slice(i, i + 2) === '->') return i;
    }
    return -1;
  }
}

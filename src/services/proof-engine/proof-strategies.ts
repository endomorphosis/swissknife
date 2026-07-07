/**
 * Proof Strategies — T-240
 *
 * Port of ipfs_datasets_py/logic/CEC/native/proof_strategies.py
 *
 * Four proof strategies for forward/backward/bidirectional/hybrid chaining.
 * All work on string-encoded formulas (no typed formula objects needed).
 */

// ---------------------------------------------------------------------------
// StrategyType enum
// ---------------------------------------------------------------------------

export enum StrategyType {
  FORWARD_CHAINING  = 'forward_chaining',
  BACKWARD_CHAINING = 'backward_chaining',
  BIDIRECTIONAL     = 'bidirectional',
  HYBRID            = 'hybrid',
}

// ---------------------------------------------------------------------------
// Shared proof result type
// ---------------------------------------------------------------------------

export interface StrategyProofResult {
  isProved: boolean;
  goal: string;
  strategy: string;
  steps: Array<{ from: string[]; conclusion: string; rule: string }>;
  stepCount: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

export interface ProofStrategy {
  readonly name: string;
  readonly maxSteps: number;
  prove(goal: string, axioms: string[], timeoutMs?: number): StrategyProofResult;
  getStats(): { proofsAttempted: number; proofsSucceeded: number; totalSteps: number };
}

// ---------------------------------------------------------------------------
// Shared forward-chaining engine (used by multiple strategies)
// ---------------------------------------------------------------------------

function forwardChain(
  known: Set<string>,
  maxSteps: number,
  deadline: number,
): Array<{ from: string[]; conclusion: string; rule: string }> {
  const steps: Array<{ from: string[]; conclusion: string; rule: string }> = [];
  let changed = true;
  let stepCount = 0;

  while (changed && stepCount < maxSteps && Date.now() < deadline) {
    changed = false;
    stepCount++;
    for (const a of [...known]) {
      const idx = a.indexOf('→');
      if (idx < 0) continue;
      const ant = a.slice(0, idx).trim();
      const cons = a.slice(idx + 1).trim();
      if (known.has(ant) && !known.has(cons)) {
        known.add(cons);
        steps.push({ from: [ant, a], conclusion: cons, rule: 'modus_ponens' });
        changed = true;
      }
    }
  }
  return steps;
}

/** Backward: collect sub-goals needed to prove `goal`. */
function backwardChain(
  goal: string,
  known: Set<string>,
  axioms: string[],
  maxSteps: number,
  deadline: number,
): { proved: boolean; steps: Array<{ from: string[]; conclusion: string; rule: string }> } {
  if (known.has(goal)) return { proved: true, steps: [] };

  const steps: Array<{ from: string[]; conclusion: string; rule: string }> = [];
  const agenda = [goal];
  const visited = new Set<string>();

  for (let i = 0; i < maxSteps && Date.now() < deadline && agenda.length > 0; i++) {
    const current = agenda.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (known.has(current)) continue;

    // Look for an implication A → current among axioms
    const rule = axioms.find(a => {
      const idx = a.indexOf('→');
      return idx >= 0 && a.slice(idx + 1).trim() === current;
    });

    if (rule) {
      const ant = rule.slice(0, rule.indexOf('→')).trim();
      known.add(current);
      steps.push({ from: [ant, rule], conclusion: current, rule: 'backward_mp' });
      if (!known.has(ant)) agenda.push(ant);
    }
  }

  return { proved: known.has(goal), steps };
}

// ---------------------------------------------------------------------------
// ForwardChainingStrategy
// ---------------------------------------------------------------------------

export class ForwardChainingStrategy implements ProofStrategy {
  readonly name = 'ForwardChaining';
  readonly maxSteps: number;
  private stats = { proofsAttempted: 0, proofsSucceeded: 0, totalSteps: 0 };

  constructor(maxSteps = 100) { this.maxSteps = maxSteps; }

  prove(goal: string, axioms: string[], timeoutMs = 5_000): StrategyProofResult {
    const t0 = performance.now();
    this.stats.proofsAttempted++;
    const known = new Set<string>(axioms);
    const deadline = Date.now() + timeoutMs;

    const steps = forwardChain(known, this.maxSteps, deadline);
    const isProved = known.has(goal);
    if (isProved) this.stats.proofsSucceeded++;
    this.stats.totalSteps += steps.length;
    return { isProved, goal, strategy: this.name, steps, stepCount: steps.length, elapsedMs: performance.now() - t0 };
  }

  getStats() { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// BackwardChainingStrategy
// ---------------------------------------------------------------------------

export class BackwardChainingStrategy implements ProofStrategy {
  readonly name = 'BackwardChaining';
  readonly maxSteps: number;
  private stats = { proofsAttempted: 0, proofsSucceeded: 0, totalSteps: 0 };

  constructor(maxSteps = 100) { this.maxSteps = maxSteps; }

  prove(goal: string, axioms: string[], timeoutMs = 5_000): StrategyProofResult {
    const t0 = performance.now();
    this.stats.proofsAttempted++;
    const known = new Set<string>(axioms);
    const deadline = Date.now() + timeoutMs;

    const { proved, steps } = backwardChain(goal, known, axioms, this.maxSteps, deadline);
    if (proved) this.stats.proofsSucceeded++;
    this.stats.totalSteps += steps.length;
    return { isProved: proved, goal, strategy: this.name, steps, stepCount: steps.length, elapsedMs: performance.now() - t0 };
  }

  getStats() { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// BidirectionalStrategy
// ---------------------------------------------------------------------------

export class BidirectionalStrategy implements ProofStrategy {
  readonly name = 'Bidirectional';
  readonly maxSteps: number;
  private stats = { proofsAttempted: 0, proofsSucceeded: 0, totalSteps: 0 };

  constructor(maxSteps = 100) { this.maxSteps = maxSteps; }

  prove(goal: string, axioms: string[], timeoutMs = 5_000): StrategyProofResult {
    const t0 = performance.now();
    this.stats.proofsAttempted++;
    const known = new Set<string>(axioms);
    const deadline = Date.now() + timeoutMs;
    const halfSteps = Math.floor(this.maxSteps / 2);

    // Forward phase
    const fwdSteps = forwardChain(known, halfSteps, deadline);
    // Backward phase
    const { proved: bwdProved, steps: bwdSteps } = backwardChain(goal, known, axioms, halfSteps, deadline);

    const allSteps = [...fwdSteps, ...bwdSteps];
    const isProved = known.has(goal) || bwdProved;
    if (isProved) this.stats.proofsSucceeded++;
    this.stats.totalSteps += allSteps.length;
    return { isProved, goal, strategy: this.name, steps: allSteps, stepCount: allSteps.length, elapsedMs: performance.now() - t0 };
  }

  getStats() { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// HybridStrategy  (forward first, backward if not found)
// ---------------------------------------------------------------------------

export class HybridStrategy implements ProofStrategy {
  readonly name = 'Hybrid';
  readonly maxSteps: number;
  private stats = { proofsAttempted: 0, proofsSucceeded: 0, totalSteps: 0 };

  constructor(maxSteps = 100) { this.maxSteps = maxSteps; }

  prove(goal: string, axioms: string[], timeoutMs = 5_000): StrategyProofResult {
    const t0 = performance.now();
    this.stats.proofsAttempted++;
    const deadline = Date.now() + timeoutMs;

    // Forward chaining first
    const known = new Set<string>(axioms);
    const fwdSteps = forwardChain(known, this.maxSteps, deadline);
    if (known.has(goal)) {
      this.stats.proofsSucceeded++;
      this.stats.totalSteps += fwdSteps.length;
      return { isProved: true, goal, strategy: this.name, steps: fwdSteps, stepCount: fwdSteps.length, elapsedMs: performance.now() - t0 };
    }

    // Backward chaining fallback
    const { proved, steps: bwdSteps } = backwardChain(goal, known, axioms, this.maxSteps, deadline);
    const allSteps = [...fwdSteps, ...bwdSteps];
    if (proved) this.stats.proofsSucceeded++;
    this.stats.totalSteps += allSteps.length;
    return { isProved: proved, goal, strategy: this.name, steps: allSteps, stepCount: allSteps.length, elapsedMs: performance.now() - t0 };
  }

  getStats() { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getStrategy(type: StrategyType, maxSteps = 100): ProofStrategy {
  switch (type) {
    case StrategyType.FORWARD_CHAINING:  return new ForwardChainingStrategy(maxSteps);
    case StrategyType.BACKWARD_CHAINING: return new BackwardChainingStrategy(maxSteps);
    case StrategyType.BIDIRECTIONAL:     return new BidirectionalStrategy(maxSteps);
    case StrategyType.HYBRID:            return new HybridStrategy(maxSteps);
    default: throw new Error(`Unknown strategy type: ${type}`);
  }
}

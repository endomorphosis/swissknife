/**
 * reasoning-coordinator.ts
 *
 * Neural-symbolic reasoning coordinator.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/symbolic/neurosymbolic/reasoning_coordinator.py
 *
 * Provides:
 *   ReasoningStrategy      — SYMBOLIC_ONLY | NEURAL_ONLY | HYBRID | AUTO
 *   CoordinatedResult      — outcome of coordinated reasoning
 *   NeuralSymbolicCoordinator — coordinate() with strategy selection
 */

// ---------------------------------------------------------------------------
// ReasoningStrategy
// ---------------------------------------------------------------------------

export enum ReasoningStrategy {
  SYMBOLIC_ONLY = 'symbolic',
  NEURAL_ONLY   = 'neural',
  HYBRID        = 'hybrid',
  AUTO          = 'auto',
}

// ---------------------------------------------------------------------------
// CoordinatedResult
// ---------------------------------------------------------------------------

export class CoordinatedResult {
  readonly isProved: boolean;
  readonly confidence: number;
  readonly symbolicConfidence: number | null;
  readonly neuralConfidence: number | null;
  readonly strategyUsed: ReasoningStrategy;
  readonly reasoningPath: string;
  readonly proofSteps: string[];
  readonly metadata: Record<string, unknown>;

  constructor(opts: {
    isProved: boolean;
    confidence: number;
    symbolicConfidence?: number | null;
    neuralConfidence?: number | null;
    strategyUsed?: ReasoningStrategy;
    reasoningPath?: string;
    proofSteps?: string[];
    metadata?: Record<string, unknown>;
  }) {
    if (opts.confidence < 0 || opts.confidence > 1) {
      throw new Error(`Confidence must be in [0, 1], got ${opts.confidence}`);
    }
    this.isProved = opts.isProved;
    this.confidence = opts.confidence;
    this.symbolicConfidence = opts.symbolicConfidence ?? null;
    this.neuralConfidence = opts.neuralConfidence ?? null;
    this.strategyUsed = opts.strategyUsed ?? ReasoningStrategy.AUTO;
    this.reasoningPath = opts.reasoningPath ?? '';
    this.proofSteps = opts.proofSteps ?? [];
    this.metadata = opts.metadata ?? {};
  }

  toDict(): Record<string, unknown> {
    return {
      is_proved: this.isProved,
      confidence: this.confidence,
      symbolic_confidence: this.symbolicConfidence,
      neural_confidence: this.neuralConfidence,
      strategy_used: this.strategyUsed,
      reasoning_path: this.reasoningPath,
      proof_steps: this.proofSteps,
      metadata: this.metadata,
    };
  }
}

// ---------------------------------------------------------------------------
// Simple symbolic + neural helpers (heuristic, no external deps)
// ---------------------------------------------------------------------------

const DEONTIC_RE  = /^[OPF]\(/;
const EVENT_RE    = /^(Happens|HoldsAt|Initiates|Terminates)\(/;
const TAUTOLOGY_RE = /∨.*¬|¬.*∨/;

function symbolicProve(formula: string): { proved: boolean; confidence: number; steps: string[] } {
  const f = formula.trim();
  if (TAUTOLOGY_RE.test(f)) {
    return { proved: true, confidence: 0.95, steps: ['Tautology detected'] };
  }
  if (DEONTIC_RE.test(f) || EVENT_RE.test(f)) {
    return { proved: true, confidence: 0.8, steps: [`Symbolic rule match: ${f.slice(0, 30)}`] };
  }
  return { proved: false, confidence: 0, steps: [] };
}

function neuralConfidence(formula: string): number {
  // Simulate embedding similarity based on formula structure
  const complexity = formula.split(/[()∧∨¬→↔∀∃]/).length;
  return Math.max(0.1, Math.min(0.85, 1 - complexity * 0.05));
}

function selectStrategy(formula: string): ReasoningStrategy {
  if (DEONTIC_RE.test(formula) || EVENT_RE.test(formula)) return ReasoningStrategy.SYMBOLIC_ONLY;
  if (TAUTOLOGY_RE.test(formula)) return ReasoningStrategy.SYMBOLIC_ONLY;
  return ReasoningStrategy.HYBRID;
}

// ---------------------------------------------------------------------------
// NeuralSymbolicCoordinator
// ---------------------------------------------------------------------------

export class NeuralSymbolicCoordinator {
  private stats = { coordinations: 0, proved: 0, symbolic: 0, neural: 0, hybrid: 0 };

  /**
   * Coordinate symbolic and neural reasoning to prove `formula`.
   */
  coordinate(formula: string, strategy: ReasoningStrategy = ReasoningStrategy.AUTO): CoordinatedResult {
    const t0 = performance.now();
    this.stats.coordinations++;

    const effectiveStrategy = strategy === ReasoningStrategy.AUTO ? selectStrategy(formula) : strategy;

    let symbolicConf: number | null = null;
    let neuralConf: number | null = null;
    let isProved = false;
    let confidence = 0;
    const steps: string[] = [];

    if (effectiveStrategy === ReasoningStrategy.SYMBOLIC_ONLY || effectiveStrategy === ReasoningStrategy.HYBRID) {
      const sym = symbolicProve(formula);
      symbolicConf = sym.confidence;
      isProved = sym.proved;
      steps.push(...sym.steps);
      this.stats.symbolic++;
    }

    if (effectiveStrategy === ReasoningStrategy.NEURAL_ONLY || effectiveStrategy === ReasoningStrategy.HYBRID) {
      neuralConf = neuralConfidence(formula);
      this.stats.neural++;
    }

    if (effectiveStrategy === ReasoningStrategy.HYBRID) {
      this.stats.hybrid++;
      confidence = Math.min(1, (symbolicConf ?? 0) * 0.6 + (neuralConf ?? 0) * 0.4);
      isProved = isProved || confidence > 0.7;
    } else if (effectiveStrategy === ReasoningStrategy.SYMBOLIC_ONLY) {
      confidence = symbolicConf ?? 0;
    } else {
      confidence = neuralConf ?? 0;
      isProved = confidence > 0.7;
    }

    if (isProved) this.stats.proved++;

    const path = `${effectiveStrategy} strategy in ${(performance.now() - t0).toFixed(1)} ms`;

    return new CoordinatedResult({
      isProved, confidence,
      symbolicConfidence: symbolicConf,
      neuralConfidence: neuralConf,
      strategyUsed: effectiveStrategy,
      reasoningPath: path,
      proofSteps: steps,
      metadata: { formula, elapsed_ms: performance.now() - t0 },
    });
  }

  getStats(): Record<string, unknown> {
    return { ...this.stats };
  }
}

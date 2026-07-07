/**
 * CEC Framework — T-226
 *
 * Port of ipfs_datasets_py/logic/CEC/cec_framework.py
 *
 * Unified Cognitive Event Calculus Framework: high-level orchestrator
 * that combines NL conversion, deontic reasoning, and automated proving.
 */

import { DeonticConverter } from '../shared/logic-converters';

// ---------------------------------------------------------------------------
// Enumerations / configuration
// ---------------------------------------------------------------------------

/** Reasoning modes available in the CEC framework. */
export enum ReasoningMode {
  SIMULTANEOUS = 'simultaneous',
  TEMPORAL     = 'temporal',
  HYBRID       = 'hybrid',
}

/** Configuration for the CEC framework. */
export interface FrameworkConfig {
  useDcec:           boolean;
  useShadowProver:   boolean;
  reasoningMode:     ReasoningMode;
  confidenceThreshold: number;
  enableCaching:     boolean;
  /** Timeout for individual proof attempts (ms). */
  proofTimeoutMs:    number;
}

export function defaultFrameworkConfig(): FrameworkConfig {
  return {
    useDcec:           true,
    useShadowProver:   false,
    reasoningMode:     ReasoningMode.SIMULTANEOUS,
    confidenceThreshold: 0.7,
    enableCaching:     true,
    proofTimeoutMs:    5_000,
  };
}

// ---------------------------------------------------------------------------
// ReasoningTask
// ---------------------------------------------------------------------------

/** Represents a complete NL→DCEC→Prove reasoning task. */
export interface ReasoningTask {
  /** Original natural-language input. */
  naturalLanguage: string;
  /** DCEC/deontic formula string derived from NL (null = not yet converted). */
  dcecFormula: string | null;
  /** Whether the formula was proved. */
  isProved: boolean | null;
  /** Confidence in the conversion result. */
  confidence: number;
  /** Wall-clock time for the full task (ms). */
  elapsedMs: number;
  /** Error message on failure. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// ConversionResult / ProofResult (lean re-exports for caller convenience)
// ---------------------------------------------------------------------------

export interface ConversionResult {
  output: string;
  confidence: number;
  errors: string[];
}

export interface ProofResult {
  formula: string;
  isProved: boolean;
  method: string;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// FrameworkStats
// ---------------------------------------------------------------------------

export interface FrameworkStats {
  totalTasks:       number;
  succeeded:        number;
  failed:           number;
  avgConfidence:    number;
  avgElapsedMs:     number;
  isInitialized:    boolean;
}

// ---------------------------------------------------------------------------
// CECFramework
// ---------------------------------------------------------------------------

/**
 * Unified Cognitive Event Calculus Framework.
 *
 * TypeScript port of `CECFramework` from
 * `ipfs_datasets_py/logic/CEC/cec_framework.py`.
 *
 * @example
 * ```ts
 * const fw = new CECFramework();
 * await fw.initialize();
 * const result = await fw.reason('All contractors must pay taxes');
 * ```
 */
export class CECFramework {
  private readonly config: FrameworkConfig;
  private readonly deonticConverter: DeonticConverter;
  private readonly taskHistory: ReasoningTask[] = [];
  private initialized = false;

  private stats: FrameworkStats = {
    totalTasks: 0, succeeded: 0, failed: 0,
    avgConfidence: 0, avgElapsedMs: 0, isInitialized: false,
  };

  constructor(config?: Partial<FrameworkConfig>) {
    this.config = { ...defaultFrameworkConfig(), ...config };
    this.deonticConverter = new DeonticConverter({
      useCache: this.config.enableCaching,
      confidenceThreshold: this.config.confidenceThreshold,
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize framework components.
   *
   * @returns Map of component name → initialization success.
   */
  async initialize(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {
      deonticConverter: true,       // always available
      shadowProver: false,          // not yet wired in TS runtime
    };

    this.initialized = true;
    this.stats.isInitialized = true;
    return results;
  }

  // -------------------------------------------------------------------------
  // Core API
  // -------------------------------------------------------------------------

  /**
   * Convert natural language to a deontic formula.
   */
  convertNaturalLanguage(text: string): ConversionResult {
    return this.deonticConverter.convert(text);
  }

  /**
   * Full pipeline: NL → deontic formula → (simulated) proof.
   */
  async reason(text: string): Promise<ReasoningTask> {
    const t0 = performance.now();
    const task: ReasoningTask = {
      naturalLanguage: text,
      dcecFormula: null,
      isProved: null,
      confidence: 0,
      elapsedMs: 0,
      error: null,
    };

    try {
      // Step 1: NL → formula
      const conversion = this.convertNaturalLanguage(text);
      task.dcecFormula = conversion.output;
      task.confidence = conversion.confidence;

      if (conversion.errors.length > 0) {
        task.error = conversion.errors.join('; ');
        task.isProved = false;
      } else {
        // Step 2: Simulated proof (real bridge not yet wired in pure TS)
        task.isProved = conversion.confidence >= this.config.confidenceThreshold;
      }
    } catch (err) {
      task.error = String(err);
      task.isProved = false;
    }

    task.elapsedMs = performance.now() - t0;
    this.taskHistory.push(task);
    this._updateStats(task);
    return task;
  }

  /** Perform a batch of reasoning tasks. */
  async reasonBatch(texts: string[]): Promise<ReasoningTask[]> {
    return Promise.all(texts.map(t => this.reason(t)));
  }

  // -------------------------------------------------------------------------
  // History / stats
  // -------------------------------------------------------------------------

  getTaskHistory(): ReadonlyArray<ReasoningTask> { return this.taskHistory; }
  getStats(): Readonly<FrameworkStats> { return { ...this.stats }; }

  private _updateStats(task: ReasoningTask): void {
    this.stats.totalTasks++;
    if (task.isProved) this.stats.succeeded++;
    else this.stats.failed++;

    const n = this.stats.totalTasks;
    this.stats.avgConfidence = ((n - 1) * this.stats.avgConfidence + task.confidence) / n;
    this.stats.avgElapsedMs  = ((n - 1) * this.stats.avgElapsedMs  + task.elapsedMs)  / n;
  }
}

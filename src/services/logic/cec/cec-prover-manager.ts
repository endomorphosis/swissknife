/**
 * CEC Prover Manager — T-257 (Sprint 57)
 *
 * Port of CEC/provers/prover_manager.py (444L)
 *
 * Unified manager that coordinates multiple theorem provers with
 * intelligent selection and parallel / sequential execution strategies.
 */

import { FormulaAnalyzer } from '../../formula-analyzer';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export enum ProverType {
  Z3       = 'z3',
  VAMPIRE  = 'vampire',
  E_PROVER = 'eprover',
  LEAN     = 'lean',
  COQ      = 'coq',
  NATIVE   = 'native',
}

export enum ProverStrategyKind {
  AUTO       = 'auto',
  PARALLEL   = 'parallel',
  SEQUENTIAL = 'sequential',
  BEST       = 'best',
}

// ---------------------------------------------------------------------------
// ProverConfig
// ---------------------------------------------------------------------------

export interface ProverConfig {
  enabledProvers:      Set<ProverType>;
  defaultTimeoutMs:    number;
  maxParallel:         number;
  preferZ3ForModal:    boolean;
  enableCache:         boolean;
}

export function defaultProverConfig(): ProverConfig {
  return {
    enabledProvers:   new Set([ProverType.Z3, ProverType.NATIVE]),
    defaultTimeoutMs: 5_000,
    maxParallel:      3,
    preferZ3ForModal: true,
    enableCache:      true,
  };
}

// ---------------------------------------------------------------------------
// ProofStatus (separate from ProofResult enum in cec-prover-core)
// ---------------------------------------------------------------------------

export enum ProofStatus {
  VALID      = 'valid',
  INVALID    = 'invalid',
  UNKNOWN    = 'unknown',
  TIMEOUT    = 'timeout',
  ERROR      = 'error',
}

// ---------------------------------------------------------------------------
// UnifiedProofResult
// ---------------------------------------------------------------------------

export interface SingleProverOutcome {
  isValid:   boolean;
  status:    ProofStatus;
  proofTimeMs: number;
  error?:    string;
}

export interface UnifiedProofResult {
  status:        ProofStatus;
  isValid:       boolean;
  proverResults: Record<string, SingleProverOutcome>;
  bestProver:    string | null;
  totalTimeMs:   number;
  confidence:    number;
  errorMessages: string[];
}

// ---------------------------------------------------------------------------
// Registered prover interface
// ---------------------------------------------------------------------------

export interface ManagedProver {
  readonly type: ProverType;
  prove(formula: string, axioms?: string[], timeoutMs?: number): Promise<SingleProverOutcome>;
}

// ---------------------------------------------------------------------------
// Built-in native syntactic prover
// ---------------------------------------------------------------------------

class NativeSyntacticProver implements ManagedProver {
  readonly type = ProverType.NATIVE;

  async prove(formula: string, axioms: string[] = [], timeoutMs = 5_000): Promise<SingleProverOutcome> {
    const t0 = performance.now();
    const known = new Set<string>(axioms);
    let proved = known.has(formula);

    if (!proved) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of [...known]) {
          const idx = a.indexOf('→');
          if (idx < 0) continue;
          const ant = a.slice(0, idx).trim();
          const cons = a.slice(idx + 1).trim();
          if (known.has(ant) && !known.has(cons)) {
            known.add(cons);
            changed = true;
            if (cons === formula) { proved = true; break; }
          }
        }
        if (proved) break;
      }
    }

    return {
      isValid:     proved,
      status:      proved ? ProofStatus.VALID : ProofStatus.UNKNOWN,
      proofTimeMs: performance.now() - t0,
    };
  }
}

// ---------------------------------------------------------------------------
// ProverManager
// ---------------------------------------------------------------------------

export interface ProverManagerStats {
  totalProofs:     number;
  succeeded:       number;
  failed:          number;
  avgConfidence:   number;
  avgTotalTimeMs:  number;
}

/**
 * Unified manager for multiple theorem provers.
 *
 * TypeScript port of `ProverManager` from
 * `ipfs_datasets_py/logic/CEC/provers/prover_manager.py`.
 */
export class ProverManager {
  private readonly provers = new Map<string, ManagedProver>();
  private readonly analyzer = new FormulaAnalyzer();
  private readonly cache: Map<string, UnifiedProofResult> | null;
  private readonly stats: ProverManagerStats = {
    totalProofs: 0, succeeded: 0, failed: 0, avgConfidence: 0, avgTotalTimeMs: 0,
  };

  constructor(private readonly config: ProverConfig = defaultProverConfig()) {
    this.cache = config.enableCache ? new Map() : null;
    // Always register the native prover
    this.register(new NativeSyntacticProver());
  }

  // -------------------------------------------------------------------------
  // Registry
  // -------------------------------------------------------------------------

  register(prover: ManagedProver): void {
    this.provers.set(prover.type, prover);
  }

  getAvailableProvers(): ProverType[] {
    return [...this.provers.keys()] as ProverType[];
  }

  // -------------------------------------------------------------------------
  // Core prove API
  // -------------------------------------------------------------------------

  async prove(
    formula: string,
    axioms: string[] = [],
    strategy: ProverStrategyKind = ProverStrategyKind.AUTO,
    timeoutMs?: number,
  ): Promise<UnifiedProofResult> {
    const t0 = performance.now();
    const cacheKey = `${formula}|${axioms.join(',')}|${strategy}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) return cached;

    this.stats.totalProofs++;
    const timeout = timeoutMs ?? this.config.defaultTimeoutMs;

    let result: UnifiedProofResult;
    switch (strategy) {
      case ProverStrategyKind.PARALLEL:
        result = await this._proveParallel(formula, axioms, timeout);
        break;
      case ProverStrategyKind.AUTO: {
        const ordered = this._selectProversForFormula(formula);
        result = await this._proveSequential(formula, axioms, timeout, ordered);
        break;
      }
      default:
        result = await this._proveSequential(formula, axioms, timeout, this.getAvailableProvers());
    }

    const elapsed = performance.now() - t0;
    this._updateStats(result, elapsed);
    this.cache?.set(cacheKey, result);
    return result;
  }

  /**
   * Run all configured provers in parallel and return first success.
   */
  async proveParallel(formula: string, axioms: string[] = [], timeoutMs?: number): Promise<UnifiedProofResult> {
    return this._proveParallel(formula, axioms, timeoutMs ?? this.config.defaultTimeoutMs);
  }

  /**
   * Select the best result from a list of outcomes.
   */
  selectBest(results: Record<string, SingleProverOutcome>): string | null {
    let best: string | null = null;
    let bestTime = Infinity;
    for (const [name, r] of Object.entries(results)) {
      if (r.isValid && r.proofTimeMs < bestTime) {
        best = name;
        bestTime = r.proofTimeMs;
      }
    }
    return best;
  }

  getStats(): Readonly<ProverManagerStats> { return { ...this.stats }; }

  // -------------------------------------------------------------------------

  private async _proveSequential(formula: string, axioms: string[], timeoutMs: number, ordered: ProverType[]): Promise<UnifiedProofResult> {
    const proverResults: Record<string, SingleProverOutcome> = {};
    let totalTimeMs = 0;

    for (const type of ordered) {
      const prover = this.provers.get(type);
      if (!prover) continue;
      const r = await this._callProver(prover, formula, axioms, timeoutMs);
      proverResults[type] = r;
      totalTimeMs += r.proofTimeMs;
      if (r.isValid) {
        return {
          status: ProofStatus.VALID, isValid: true,
          proverResults, bestProver: type, totalTimeMs,
          confidence: 0.9, errorMessages: [],
        };
      }
    }

    return {
      status: ProofStatus.UNKNOWN, isValid: false,
      proverResults, bestProver: null, totalTimeMs,
      confidence: 0, errorMessages: [],
    };
  }

  private async _proveParallel(formula: string, axioms: string[], timeoutMs: number): Promise<UnifiedProofResult> {
    const types = this.getAvailableProvers();
    const settled = await Promise.allSettled(
      types.map(t => this._callProver(this.provers.get(t)!, formula, axioms, timeoutMs)),
    );

    const proverResults: Record<string, SingleProverOutcome> = {};
    let totalTimeMs = 0;
    for (let i = 0; i < types.length; i++) {
      const s = settled[i];
      const r: SingleProverOutcome = s.status === 'fulfilled'
        ? s.value
        : { isValid: false, status: ProofStatus.ERROR, proofTimeMs: 0, error: String((s as PromiseRejectedResult).reason) };
      proverResults[types[i]] = r;
      totalTimeMs += r.proofTimeMs;
    }

    const best = this.selectBest(proverResults);
    return {
      status: best ? ProofStatus.VALID : ProofStatus.UNKNOWN,
      isValid: !!best,
      proverResults, bestProver: best, totalTimeMs,
      confidence: best ? 0.95 : 0,
      errorMessages: [],
    };
  }

  private async _callProver(prover: ManagedProver, formula: string, axioms: string[], timeoutMs: number): Promise<SingleProverOutcome> {
    const timeoutResult: SingleProverOutcome = { isValid: false, status: ProofStatus.TIMEOUT, proofTimeMs: timeoutMs };
    try {
      return await Promise.race([
        prover.prove(formula, axioms, timeoutMs),
        new Promise<SingleProverOutcome>(res => {
          const t = setTimeout(() => res(timeoutResult), timeoutMs);
          if (typeof t === 'object' && (t as NodeJS.Timeout).unref) (t as NodeJS.Timeout).unref();
        }),
      ]);
    } catch (err) {
      return { isValid: false, status: ProofStatus.ERROR, proofTimeMs: 0, error: String(err) };
    }
  }

  private _selectProversForFormula(formula: string): ProverType[] {
    try {
      const analysis = this.analyzer.analyze(formula);
      const available = new Set(this.getAvailableProvers());
      if (analysis.hasModal || analysis.hasTemporal || analysis.hasDeontic) {
        return [ProverType.LEAN, ProverType.COQ, ProverType.Z3, ProverType.NATIVE].filter(t => available.has(t));
      }
      return [ProverType.Z3, ProverType.VAMPIRE, ProverType.NATIVE].filter(t => available.has(t));
    } catch {
      return this.getAvailableProvers();
    }
  }

  private _updateStats(result: UnifiedProofResult, elapsedMs: number): void {
    if (result.isValid) this.stats.succeeded++; else this.stats.failed++;
    const n = this.stats.totalProofs;
    this.stats.avgConfidence  = ((n - 1) * this.stats.avgConfidence  + result.confidence) / n;
    this.stats.avgTotalTimeMs = ((n - 1) * this.stats.avgTotalTimeMs + elapsedMs)          / n;
  }
}

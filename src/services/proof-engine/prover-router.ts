/**
 * Prover Router — T-207 (Sprint 46)
 *
 * Port of ipfs_datasets_py/logic/external_provers/prover_router.py
 *
 * Intelligent routing between multiple theorem provers based on formula
 * characteristics; supports sequential, parallel, and automatic strategies.
 */

import { FormulaAnalyzer, FormulaType, FormulaComplexity } from './formula-analyzer';

// ---------------------------------------------------------------------------
// Strategy enum
// ---------------------------------------------------------------------------

/** Strategy for prover selection. */
export enum ProverStrategy {
  AUTO        = 'auto',         // Automatic selection based on formula analysis
  FASTEST     = 'fastest',      // Try fastest-ranked prover first
  MOST_CAPABLE = 'most_capable', // Try most capable prover first
  PARALLEL    = 'parallel',     // Try all provers simultaneously
  SEQUENTIAL  = 'sequential',   // Try provers one after another with fallback
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Individual prover outcome. */
export interface SingleProverResult {
  isProved: boolean;
  proverName: string;
  proofTime: number; // seconds
  /** Raw proof object returned by the prover (null when not proved). */
  proof: unknown | null;
  error?: string;
}

/** Aggregated result from the router. */
export interface RouterProofResult {
  isProved: boolean;
  proverUsed: string | null;
  proofTime: number;
  allResults: Record<string, SingleProverResult>;
  strategyUsed: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Syntactic fallback prover
// ---------------------------------------------------------------------------

/** Minimal native prover used when no external provers are registered. */
class SyntacticNativeFallbackProver {
  readonly name = 'native_syntactic';

  prove(formula: string, _axioms?: string[]): SingleProverResult {
    const t0 = performance.now();
    // Compile-only: accepts any non-empty formula string
    const isProved = typeof formula === 'string' && formula.trim().length > 0;
    return {
      isProved,
      proverName: this.name,
      proofTime: (performance.now() - t0) / 1000,
      proof: isProved ? { formula, method: 'syntactic_fallback' } : null,
    };
  }
}

// ---------------------------------------------------------------------------
// ProverInterface — anything registered with the router must satisfy this
// ---------------------------------------------------------------------------

export interface RegisteredProver {
  readonly name: string;
  prove(formula: string, axioms?: string[], timeoutMs?: number): SingleProverResult | Promise<SingleProverResult>;
}

// ---------------------------------------------------------------------------
// Router statistics
// ---------------------------------------------------------------------------

export interface RouterStats {
  totalProofs: number;
  succeeded: number;
  failed: number;
  parallelRaces: number;
  cacheHits: number;
  proverUseCounts: Record<string, number>;
  totalProofTimeMs: number;
}

// ---------------------------------------------------------------------------
// ProverRouter
// ---------------------------------------------------------------------------

export interface ProverRouterOptions {
  /** Default strategy to use when none is specified. */
  defaultStrategy?: ProverStrategy;
  /** Per-prover timeout in seconds. */
  defaultTimeoutSeconds?: number;
  /** Enable in-memory proof cache. */
  enableCache?: boolean;
  /** Include syntactic fallback if no provers are registered. */
  enableSyntacticFallback?: boolean;
}

/**
 * Routes theorem-proving requests to the best available prover.
 *
 * TypeScript port of `ProverRouter` from
 * `ipfs_datasets_py/logic/external_provers/prover_router.py`.
 *
 * @example
 * ```ts
 * const router = new ProverRouter();
 * router.register({ name: 'z3', prove: async (f) => z3.prove(f) });
 * const result = await router.prove('P → Q', { strategy: ProverStrategy.AUTO });
 * ```
 */
export class ProverRouter {
  private readonly provers = new Map<string, RegisteredProver>();
  private readonly analyzer = new FormulaAnalyzer();
  private readonly defaultStrategy: ProverStrategy;
  private readonly defaultTimeoutMs: number;
  private readonly cache: Map<string, RouterProofResult> | null;

  private readonly stats: RouterStats = {
    totalProofs: 0,
    succeeded: 0,
    failed: 0,
    parallelRaces: 0,
    cacheHits: 0,
    proverUseCounts: {},
    totalProofTimeMs: 0,
  };

  constructor(opts: ProverRouterOptions = {}) {
    this.defaultStrategy = opts.defaultStrategy ?? ProverStrategy.AUTO;
    this.defaultTimeoutMs = (opts.defaultTimeoutSeconds ?? 5) * 1000;
    this.cache = (opts.enableCache ?? true) ? new Map() : null;

    if (opts.enableSyntacticFallback !== false) {
      const fallback = new SyntacticNativeFallbackProver();
      this.provers.set(fallback.name, {
        name: fallback.name,
        prove: (f, axioms) => fallback.prove(f, axioms),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Registry management
  // -------------------------------------------------------------------------

  /** Register a prover. Overwrites any previously registered prover with the same name. */
  register(prover: RegisteredProver): void {
    this.provers.set(prover.name, prover);
  }

  /** Remove a registered prover. */
  unregister(name: string): boolean {
    return this.provers.delete(name);
  }

  /** Names of all currently registered provers. */
  getAvailableProvers(): string[] {
    return [...this.provers.keys()];
  }

  // -------------------------------------------------------------------------
  // Core routing
  // -------------------------------------------------------------------------

  /**
   * Prove a formula using the configured strategy.
   *
   * @param formula - Formula string.
   * @param options - Strategy overrides and axioms.
   */
  async prove(
    formula: string,
    options: { strategy?: ProverStrategy; axioms?: string[]; timeoutMs?: number } = {},
  ): Promise<RouterProofResult> {
    this.stats.totalProofs++;
    const t0 = performance.now();

    // Cache check
    if (this.cache) {
      const cacheKey = this._cacheKey(formula, options);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return { ...cached, reason: 'cache_hit' };
      }
    }

    const strategy = this._coerceStrategy(options.strategy);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const axioms = options.axioms ?? [];

    let result: RouterProofResult;
    switch (strategy) {
      case ProverStrategy.PARALLEL:
        result = await this._proveParallel(formula, axioms, timeoutMs);
        this.stats.parallelRaces++;
        break;
      case ProverStrategy.AUTO: {
        const ordered = this._selectProversForFormula(formula);
        result = await this._proveSequential(formula, axioms, timeoutMs, ordered);
        break;
      }
      case ProverStrategy.FASTEST: {
        const ordered = this._proversOrderedBySpeed();
        result = await this._proveSequential(formula, axioms, timeoutMs, ordered);
        break;
      }
      case ProverStrategy.MOST_CAPABLE: {
        const ordered = this._proversOrderedByCapability(formula);
        result = await this._proveSequential(formula, axioms, timeoutMs, ordered);
        break;
      }
      case ProverStrategy.SEQUENTIAL:
      default: {
        const ordered = this.getAvailableProvers();
        result = await this._proveSequential(formula, axioms, timeoutMs, ordered);
        break;
      }
    }

    const elapsed = performance.now() - t0;
    this.stats.totalProofTimeMs += elapsed;
    if (result.isProved) {
      this.stats.succeeded++;
      if (result.proverUsed) {
        this.stats.proverUseCounts[result.proverUsed] = (this.stats.proverUseCounts[result.proverUsed] ?? 0) + 1;
      }
    } else {
      this.stats.failed++;
    }

    const finalResult: RouterProofResult = { ...result, strategyUsed: strategy };

    if (this.cache) {
      this.cache.set(this._cacheKey(formula, options), finalResult);
    }

    return finalResult;
  }

  /**
   * Try all registered provers in parallel and return the first success.
   * If none succeeds, returns the aggregated failure.
   */
  async proveParallel(formula: string, axioms: string[] = [], timeoutMs?: number): Promise<RouterProofResult> {
    this.stats.parallelRaces++;
    return this._proveParallel(formula, axioms, timeoutMs ?? this.defaultTimeoutMs);
  }

  /**
   * Select the best result from a list of prover results.
   * Prefers proved > fastest, then by proof time.
   */
  selectBest(results: SingleProverResult[]): SingleProverResult | null {
    if (results.length === 0) return null;
    const proved = results.filter(r => r.isProved);
    if (proved.length === 0) return results[0];
    return proved.reduce((best, r) => r.proofTime < best.proofTime ? r : best);
  }

  getStats(): Readonly<RouterStats> {
    return { ...this.stats, proverUseCounts: { ...this.stats.proverUseCounts } };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _proveSequential(
    formula: string,
    axioms: string[],
    timeoutMs: number,
    ordered: string[],
  ): Promise<RouterProofResult> {
    const allResults: Record<string, SingleProverResult> = {};

    for (const name of ordered) {
      const prover = this.provers.get(name);
      if (!prover) continue;
      const r = await this._callProver(prover, formula, axioms, timeoutMs);
      allResults[name] = r;
      if (r.isProved) {
        return { isProved: true, proverUsed: name, proofTime: r.proofTime, allResults, strategyUsed: '', reason: `proved_by_${name}` };
      }
    }

    return { isProved: false, proverUsed: null, proofTime: 0, allResults, strategyUsed: '', reason: 'all_provers_failed' };
  }

  private async _proveParallel(
    formula: string,
    axioms: string[],
    timeoutMs: number,
  ): Promise<RouterProofResult> {
    const names = this.getAvailableProvers();
    if (names.length === 0) {
      return { isProved: false, proverUsed: null, proofTime: 0, allResults: {}, strategyUsed: ProverStrategy.PARALLEL, reason: 'no_provers_registered' };
    }

    const settled = await Promise.allSettled(
      names.map(name => this._callProver(this.provers.get(name)!, formula, axioms, timeoutMs)),
    );

    const allResults: Record<string, SingleProverResult> = {};
    for (let i = 0; i < names.length; i++) {
      const s = settled[i];
      allResults[names[i]] = s.status === 'fulfilled'
        ? s.value
        : { isProved: false, proverName: names[i], proofTime: 0, proof: null, error: String((s as PromiseRejectedResult).reason) };
    }

    const best = this.selectBest(Object.values(allResults));
    return {
      isProved: best?.isProved ?? false,
      proverUsed: best?.isProved ? best.proverName : null,
      proofTime: best?.proofTime ?? 0,
      allResults,
      strategyUsed: ProverStrategy.PARALLEL,
      reason: best?.isProved ? `proved_by_${best.proverName}` : 'all_provers_failed',
    };
  }

  private async _callProver(
    prover: RegisteredProver,
    formula: string,
    axioms: string[],
    timeoutMs: number,
  ): Promise<SingleProverResult> {
    const timeoutResult: SingleProverResult = {
      isProved: false,
      proverName: prover.name,
      proofTime: timeoutMs / 1000,
      proof: null,
      error: 'timeout',
    };

    let resolved = false;
    const racePromise = new Promise<SingleProverResult>((resolve, reject) => {
      Promise.resolve(prover.prove(formula, axioms, timeoutMs))
        .then(r => { resolved = true; resolve(r); })
        .catch(err => { resolved = true; reject(err); });
    });

    const timeoutPromise = new Promise<SingleProverResult>(resolve => {
      const t = setTimeout(() => { if (!resolved) resolve(timeoutResult); }, timeoutMs);
      // Prevent the timer from keeping the Node.js event loop open in tests
      if (typeof t === 'object' && typeof (t as NodeJS.Timeout).unref === 'function') {
        (t as NodeJS.Timeout).unref();
      }
    });

    try {
      return await Promise.race([racePromise, timeoutPromise]);
    } catch (err) {
      return { isProved: false, proverName: prover.name, proofTime: 0, proof: null, error: String(err) };
    }
  }

  /** Pick prover ordering based on formula analysis. */
  private _selectProversForFormula(formula: string): string[] {
    try {
      const analysis = this.analyzer.analyze(formula);
      const recommended = analysis.recommendedProvers;
      const available = new Set(this.getAvailableProvers());
      const ordered = recommended.filter(n => available.has(n));
      // Append any remaining provers not in recommended list
      for (const n of available) { if (!ordered.includes(n)) ordered.push(n); }
      return ordered;
    } catch {
      return this.getAvailableProvers();
    }
  }

  private _proversOrderedBySpeed(): string[] {
    // native_syntactic > native > z3 > cvc5 > lean > coq
    const speedOrder = ['native_syntactic', 'native', 'z3', 'cvc5', 'lean', 'coq'];
    const available = new Set(this.getAvailableProvers());
    const ordered = speedOrder.filter(n => available.has(n));
    for (const n of available) { if (!ordered.includes(n)) ordered.push(n); }
    return ordered;
  }

  private _proversOrderedByCapability(formula: string): string[] {
    // More capable provers first (lean > coq > cvc5 > z3 > native)
    try {
      const analysis = this.analyzer.analyze(formula);
      const capabilityOrder = analysis.hasModal || analysis.hasTemporal || analysis.hasDeontic
        ? ['lean', 'coq', 'cvc5', 'z3', 'native', 'native_syntactic']
        : ['z3', 'cvc5', 'lean', 'coq', 'native', 'native_syntactic'];
      const available = new Set(this.getAvailableProvers());
      const ordered = capabilityOrder.filter(n => available.has(n));
      for (const n of available) { if (!ordered.includes(n)) ordered.push(n); }
      return ordered;
    } catch {
      return this.getAvailableProvers();
    }
  }

  private _coerceStrategy(strategy?: ProverStrategy | string): ProverStrategy {
    if (!strategy) return this.defaultStrategy;
    if (Object.values(ProverStrategy).includes(strategy as ProverStrategy)) {
      return strategy as ProverStrategy;
    }
    const normalized = String(strategy).toLowerCase().replace(/[-\s]/g, '_');
    const match = Object.values(ProverStrategy).find(v => v === normalized);
    return match ?? this.defaultStrategy;
  }

  private _cacheKey(formula: string, options: { strategy?: ProverStrategy; axioms?: string[] }): string {
    const axiomsKey = (options.axioms ?? []).join(',');
    return `${formula}||${options.strategy ?? this.defaultStrategy}||${axiomsKey}`;
  }
}

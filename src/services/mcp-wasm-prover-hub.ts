/**
 * WasmProverHub — local-first prover router with proof cache.
 *
 * Coordinates between available WASM provers (Z3, CVC5, Coq, Lean 4) with
 * configurable routing strategies (FASTEST, PARALLEL, SEQUENTIAL) and an
 * in-memory proof cache.
 *
 * When local provers cannot decide a formula (unknown/timeout), the hub signals
 * the caller to fall back to the remote Python TDFOL engine.
 *
 * References:
 *   - ipfs_datasets_py/logic/external_provers/prover_router.py (ProverRouter)
 *   - ipfs_datasets_py/logic/external_provers/proof_cache.py   (ProofCache)
 *
 * Usage:
 * ```ts
 * const hub = await WasmProverHub.create();
 * const result = await hub.checkPolicyConsistency(policy);
 * if (result.reason === 'unknown') {
 *   // fall back to remote Python engine
 * }
 * ```
 */

import type { Policy } from './mcp-policy.js';
import type { WasmProofResult, ProverStrategy } from './provers/prover-types.js';
import { ProofCache } from './provers/mcp-proof-cache.js';
import { Z3WasmBridge } from './provers/z3-wasm-bridge.js';
import { Cvc5WasmBridge } from './provers/cvc5-wasm-bridge.js';
import { CoqJsCoqBridge } from './provers/coq-jscoq-bridge.js';
import { Lean4WasmBridge } from './provers/lean4-wasm-bridge.js';
import { NeuralProverBridge } from './provers/neural-prover-bridge.js';
import type { NeuralProverConnector } from './provers/neural-prover-bridge.js';
import { DcecProverBridge } from './provers/dcec-prover-bridge.js';
import { TdfolProverBridge } from './provers/tdfol-prover-bridge.js';
import { classifyPolicy } from './provers/formula-classifier.js';

// ---------------------------------------------------------------------------
// WasmProverHub
// ---------------------------------------------------------------------------

export interface WasmProverHubOptions {
  strategy?: ProverStrategy;
  /** Proof budget per prover attempt in milliseconds. Default 5000. */
  timeoutMs?: number;
  /** Maximum entries in the proof cache. Default 1000. */
  cacheMaxEntries?: number;
  /** Cache TTL in milliseconds. Default: 5 minutes. */
  cacheTtlMs?: number;
  /** Optional JSONL path for proof-cache logging. */
  cacheLogPath?: string;
  /** Optional MCP++ connector for the NeuralProverBridge. */
  neuralConnector?: NeuralProverConnector;
}

/** Summary of which provers are currently available. */
export interface HubProverStatus {
  z3_wasm: boolean;
  cvc5_wasm: boolean;
  coq_jscoq: boolean;
  lean4_wasm: boolean;
  lurk_wasm: boolean;
  neural: boolean;
  dcec_native: boolean;
  tdfol_native: boolean;
}

export class WasmProverHub {
  private readonly strategy: ProverStrategy;
  private readonly timeoutMs: number;
  private readonly cache: ProofCache;
  private z3?: Z3WasmBridge;
  private cvc5?: Cvc5WasmBridge;
  private coq?: CoqJsCoqBridge;
  private lean4?: Lean4WasmBridge;
  private neural?: NeuralProverBridge;
  private dcec: DcecProverBridge;
  private tdfol: TdfolProverBridge;

  private constructor(opts: WasmProverHubOptions, z3?: Z3WasmBridge, cvc5?: Cvc5WasmBridge, coq?: CoqJsCoqBridge, lean4?: Lean4WasmBridge, neural?: NeuralProverBridge) {
    this.strategy = opts.strategy ?? 'FASTEST';
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.cache = new ProofCache({
      maxEntries: opts.cacheMaxEntries ?? 1_000,
      ttlMs: opts.cacheTtlMs ?? 5 * 60_000,
      logPath: opts.cacheLogPath,
    });
    this.z3 = z3;
    this.cvc5 = cvc5;
    this.coq = coq;
    this.lean4 = lean4;
    this.neural = neural;
    this.dcec = new DcecProverBridge();
    this.tdfol = new TdfolProverBridge();
  }

  /**
   * Create a `WasmProverHub`.  Attempts to load Z3 WASM; other provers will be
   * added in later phases.
   *
   * Construction never throws — unavailable provers are silently skipped.
   */
  static async create(opts: WasmProverHubOptions = {}): Promise<WasmProverHub> {
    let z3: Z3WasmBridge | undefined;
    let cvc5: Cvc5WasmBridge | undefined;
    let coq: CoqJsCoqBridge | undefined;
    let lean4: Lean4WasmBridge | undefined;
    let neural: NeuralProverBridge | undefined;
    // T-43 lazy-load: create a deferred Z3 bridge so the ~34 MB WASM binary
    // loads only on the first actual proof request, not at hub construction time.
    try { z3 = Z3WasmBridge.createDeferred(); } catch { /* z3-solver not available */ }
    try { cvc5 = await Cvc5WasmBridge.create(); } catch { /* CVC5 bridge not available */ }
    try { coq = await CoqJsCoqBridge.create(); } catch { /* Coq not available */ }
    try { lean4 = await Lean4WasmBridge.create(); } catch { /* Lean 4 not available */ }
    if (opts.neuralConnector) {
      neural = new NeuralProverBridge({ connector: opts.neuralConnector });
    }
    return new WasmProverHub(opts, z3, cvc5, coq, lean4, neural);
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Check whether `policy` is internally consistent using available local provers.
   *
   * Consults the proof cache first, then dispatches to the appropriate prover
   * based on the configured routing strategy.
   *
   * Returns `{ reason: 'unknown' }` when no local prover can decide — the caller
   * should fall back to the remote Python TDFOL engine.
   */
  async checkPolicyConsistency(policy: Policy): Promise<WasmProofResult> {
    const cacheKey = ProofCache.formulaHash(canonicalPolicyKey(policy));
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const formulaClass = classifyPolicy(policy);

    // Temporal formulas: TDFOL prover handles LTL + SDL deontic constraints
    if (formulaClass === 'temporal') {
      const tdfolResult = await this.tdfol.checkPolicyConsistency(policy);
      if (isLocallyDecided(tdfolResult)) {
        this.cache.put(cacheKey, tdfolResult);
        return tdfolResult;
      }
      // Fall through to remote if TDFOL couldn't decide
      return tdfolResult;
    }

    // higher_order: try Coq/Lean4 locally before falling back to remote
    if (formulaClass === 'higher_order') {
      const higherResult = await this._tryCoqOrLean4(policy);
      if (isLocallyDecided(higherResult)) {
        this.cache.put(cacheKey, higherResult);
        return higherResult;
      }
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'z3-wasm', proof_time_ms: 0,
        meta: { formula_class: formulaClass, skipped: 'remote-only' },
      };
    }

    // modal_deontic: DCEC prover handles O/P/F conflict detection
    if (formulaClass === 'modal_deontic') {
      const dcecResult = await this.dcec.checkPolicyConsistency(policy);
      if (isLocallyDecided(dcecResult)) {
        this.cache.put(cacheKey, dcecResult);
        return dcecResult;
      }
      // Fall through to Z3 if DCEC couldn't decide (shouldn't happen in practice)
    }

    // propositional / fol → try Z3 WASM
    const result = await this._tryZ3(policy);

    // For higher_order (static fast-path from Coq/Lean4), try interactive provers
    // only when Z3/CVC5 couldn't decide
    if ((result.reason === 'unknown' || result.reason === 'error') &&
        (formulaClass === 'fol' || formulaClass === 'propositional')) {
      const coqResult = await this._tryCoqOrLean4(policy);
      if (isLocallyDecided(coqResult)) {
        if (isLocallyDecided(coqResult)) this.cache.put(cacheKey, coqResult);
        return coqResult;
      }
    }

    // Cache if decided
    if (isLocallyDecided(result)) {
      this.cache.put(cacheKey, result);
    }
    return result;
  }

  /**
   * Prove an SMT-LIB2 formula string directly.
   *
   * Falls through to `{ reason: 'unknown' }` when Z3 WASM is unavailable.
   */
  async proveSMT2(smt2Formula: string, timeoutMs?: number): Promise<WasmProofResult> {
    if (!this.z3) {
      return { proved: false, sat: false, unsat: false, reason: 'unknown', prover_id: 'z3-wasm', proof_time_ms: 0 };
    }
    const cacheKey = ProofCache.formulaHash(smt2Formula);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.z3.proveSMT2(smt2Formula, timeoutMs ?? this.timeoutMs);
    if (result.reason !== 'unknown' && result.reason !== 'error') {
      this.cache.put(cacheKey, result);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Status / Metrics
  // ---------------------------------------------------------------------------

  /** Returns which prover backends are currently loaded. */
  proverStatus(): HubProverStatus {
    return {
      z3_wasm: Z3WasmBridge.available,
      cvc5_wasm: this.cvc5 !== undefined,
      coq_jscoq: this.coq !== undefined,
      lean4_wasm: this.lean4 !== undefined,
      lurk_wasm: false,                     // Phase 6 — adapter exists; hub has no owned lurk-wasm instance by default
      neural: this.neural !== undefined,
      dcec_native: true,                    // Sprint 9 — always available (pure TS)
      tdfol_native: true,                   // Sprint 10 — always available (pure TS)
    };
  }

  /** Proof cache statistics. */
  cacheStats() {
    return this.cache.stats();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async _tryZ3(policy: Policy): Promise<WasmProofResult> {
    if (!this.z3) {
      // Try CVC5 as fallback when Z3 is unavailable
      return this._tryCvc5(policy);
    }
    return this.z3.checkPolicyConsistency(policy, this.timeoutMs);
  }

  private async _tryCvc5(policy: Policy): Promise<WasmProofResult> {
    if (!this.cvc5) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'z3-wasm', proof_time_ms: 0,
        meta: { unavailable: 'no CVC5 WASM and no Z3 WASM' },
      };
    }
    return this.cvc5.checkPolicyConsistency(policy, this.timeoutMs);
  }

  private async _tryCoqOrLean4(policy: Policy): Promise<WasmProofResult> {
    // Try Coq first (fast static analysis path when no coqc)
    if (this.coq) {
      const coqResult = await this.coq.checkPolicyConsistency(policy, this.timeoutMs);
      if (isLocallyDecided(coqResult)) return coqResult;
    }
    // Fall back to Lean 4 (fast static analysis path when no lean binary)
    if (this.lean4) {
      const lean4Result = await this.lean4.checkPolicyConsistency(policy, this.timeoutMs);
      if (isLocallyDecided(lean4Result)) return lean4Result;
    }
    // Last-resort: neural prover (LLM sketch + local verification)
    if (this.neural) {
      return this.neural.checkPolicyConsistency(policy);
    }
    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'coq-jscoq', proof_time_ms: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static _instance: WasmProverHub | null = null;

  static async getInstance(): Promise<WasmProverHub> {
    if (!WasmProverHub._instance) {
      WasmProverHub._instance = await WasmProverHub.create();
    }
    return WasmProverHub._instance;
  }

  static resetInstance(): void {
    WasmProverHub._instance = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the prover gave a conclusive answer (not unknown/timeout/error). */
function isLocallyDecided(r: WasmProofResult): boolean {
  return r.reason !== 'unknown' && r.reason !== 'timeout' && r.reason !== 'error';
}

/** Canonical string representation of a Policy for cache keying. */
function canonicalPolicyKey(policy: Policy): string {
  return JSON.stringify({
    id: policy.id,
    version: policy.version,
    permissions: [...(policy.permissions ?? [])].sort((a, b) =>
      `${a.cap}|${a.rsc}`.localeCompare(`${b.cap}|${b.rsc}`)),
    prohibitions: [...(policy.prohibitions ?? [])].sort((a, b) =>
      `${a.cap}|${a.rsc}`.localeCompare(`${b.cap}|${b.rsc}`)),
    obligations: [...(policy.obligations ?? [])].map(o => o.description),
    temporal: policy.temporal,
  });
}

// PORT-042: Strategy-aware prover selection
// Previously the hub ignored this.strategy; now it maps to the right prover tier.
export function selectProversByStrategy(
  strategy: import('./provers/prover-types.js').ProverStrategy,
  availableProvers: string[],
): string[] {
  switch (strategy) {
    case 'AUTO':          // PORT-011: analyzer-driven — let hub classify and pick
    case 'FASTEST':       return availableProvers.slice(0, 1);
    case 'MOST_CAPABLE':  return availableProvers.includes('lean4-wasm')
                            ? ['lean4-wasm']
                            : availableProvers.includes('coq-jscoq')
                              ? ['coq-jscoq']
                              : ['cvc5-wasm'];
    case 'PARALLEL':      return [...availableProvers];
    case 'SEQUENTIAL':    return [...availableProvers];
    case 'REMOTE':        return ['remote'];
    default:              return availableProvers.slice(0, 1);
  }
}

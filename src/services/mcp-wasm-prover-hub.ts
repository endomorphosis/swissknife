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

import type { Policy } from '../mcp-policy.js';
import type { WasmProofResult, ProverStrategy } from './provers/prover-types.js';
import { ProofCache } from './provers/mcp-proof-cache.js';
import { Z3WasmBridge } from './provers/z3-wasm-bridge.js';

// ---------------------------------------------------------------------------
// FormulaClassifier — complexity heuristic
// ---------------------------------------------------------------------------

import type { FormulaClass } from './provers/prover-types.js';

/**
 * Classify a policy's logical complexity to route to the appropriate prover tier.
 *
 * Mirrors ipfs_datasets_py/logic/external_provers/formula_analyzer.py.
 */
function classifyPolicy(policy: Policy): FormulaClass {
  // Temporal policy: has a top-level temporal window
  if (policy.temporal) return 'temporal';

  // Check for temporal operators in obligation deadlines
  for (const obl of policy.obligations ?? []) {
    if ('deadline' in obl && obl.deadline !== undefined) return 'temporal';
  }

  // Higher-order: obligations that reference complex capability chains
  // (heuristic: more than 5 obligations suggests complex reasoning)
  const totalRules =
    (policy.permissions?.length ?? 0) +
    (policy.prohibitions?.length ?? 0) +
    (policy.obligations?.length ?? 0);
  if (totalRules > 20) return 'higher_order';

  // First-order: has wildcard permissions/prohibitions with ∀-style semantics
  const hasWildcard = (policy.permissions ?? []).some(p => p.cap === '*' || p.rsc === '*') ||
                      (policy.prohibitions ?? []).some(p => p.cap === '*' || p.rsc === '*');
  if (hasWildcard) return 'fol';

  // Default: propositional
  return 'propositional';
}

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
}

/** Summary of which provers are currently available. */
export interface HubProverStatus {
  z3_wasm: boolean;
  cvc5_wasm: boolean;
  coq_jscoq: boolean;
  lean4_wasm: boolean;
  lurk_wasm: boolean;
}

export class WasmProverHub {
  private readonly strategy: ProverStrategy;
  private readonly timeoutMs: number;
  private readonly cache: ProofCache;
  private z3?: Z3WasmBridge;

  private constructor(opts: WasmProverHubOptions, z3?: Z3WasmBridge) {
    this.strategy = opts.strategy ?? 'FASTEST';
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.cache = new ProofCache({
      maxEntries: opts.cacheMaxEntries ?? 1_000,
      ttlMs: opts.cacheTtlMs ?? 5 * 60_000,
      logPath: opts.cacheLogPath,
    });
    this.z3 = z3;
  }

  /**
   * Create a `WasmProverHub`.  Attempts to load Z3 WASM; other provers will be
   * added in later phases.
   *
   * Construction never throws — unavailable provers are silently skipped.
   */
  static async create(opts: WasmProverHubOptions = {}): Promise<WasmProverHub> {
    let z3: Z3WasmBridge | undefined;
    try {
      z3 = await Z3WasmBridge.create();
    } catch {
      // Z3 WASM not available (missing dep or WASM load failure)
    }
    return new WasmProverHub(opts, z3);
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

    // Temporal / higher-order formulas: local provers cannot currently decide
    if (formulaClass === 'temporal' || formulaClass === 'higher_order') {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown',
        prover_id: 'z3-wasm',
        proof_time_ms: 0,
        meta: { formula_class: formulaClass, skipped: 'remote-only' },
      };
    }

    // propositional / fol → try Z3 WASM
    const result = await this._tryZ3(policy);

    // Cache if decided
    if (result.reason !== 'unknown' && result.reason !== 'error' && result.reason !== 'timeout') {
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
      cvc5_wasm: false,  // Phase 3
      coq_jscoq: false,  // Phase 4
      lean4_wasm: false, // Phase 5
      lurk_wasm: false,  // Phase 6
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
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'z3-wasm', proof_time_ms: 0,
        meta: { unavailable: 'z3-solver not loaded' },
      };
    }
    return this.z3.checkPolicyConsistency(policy, this.timeoutMs);
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

/**
 * ProverRouterBridgeAdapter — routes TDFOL/DCEC formulas through WasmProverHub
 * and returns an aggregated ProofGateResult.
 *
 * Simplified TypeScript equivalent of:
 *   ipfs_datasets_py/logic/bridge/external_prover_router.py §ExternalProverRouterBridgeAdapter
 *
 * The full Python adapter converts legal text → TDFOL formulas via NLP before
 * routing.  This TypeScript port accepts pre-parsed `TdfolFormula[]` objects
 * (e.g., from `DeonticTextAnalyzer` + `PolicyToTdfolTranslator`) and routes
 * them directly through the local `WasmProverHub` (or `ExtendedTdfolProverBridge`).
 *
 * Pipeline:
 *   TdfolFormula[]
 *     → batch through WasmProverHub (one formula per policy-consistency check)
 *     → aggregate ProofGateResult {compiles, valid_count, failure_ratio, details}
 *
 * Sprint 13, T-78.
 * Reference: ipfs_datasets_py/logic/bridge/external_prover_router.py §ExternalProverRouterBridgeAdapter.evaluate()
 */

import type { TdfolFormula } from '../../provers/tdfol-types.js';
import type { DCECFormula } from '../../provers/dcec-types.js';
import { serializeTdfol } from '../../provers/tdfol-types.js';
import { ExtendedTdfolProverBridge } from '../../provers/tdfol-extended-rules.js';
import type { ProofReason } from '../../provers/prover-types.js';

// ---------------------------------------------------------------------------
// ProofGateResult type (mirrors Python bridge types.py)
// ---------------------------------------------------------------------------

export interface ProofGateDetail {
  /** Serialised formula that was checked. */
  readonly formula: string;
  /** Proof result reason. */
  readonly result: ProofReason;
  /** Prover that handled this formula. */
  readonly prover_id: string;
  /** Time in milliseconds. */
  readonly proof_time_ms: number;
}

/**
 * Aggregated result of routing a batch of formulas through the prover router.
 *
 * Mirrors `ProofGateResult` in `ipfs_datasets_py/logic/bridge/types.py`.
 */
export interface ProofGateResult {
  /** True when at least half the formulas were proved / decided. */
  readonly compiles: boolean;
  /** Number of formulas that were proved. */
  readonly valid_count: number;
  /** Total formulas attempted. */
  readonly attempted_count: number;
  /** `(attempted − valid) / attempted`; 0.0 = all proved, 1.0 = none proved. */
  readonly failure_ratio: number;
  /** Per-formula details. */
  readonly details: ProofGateDetail[];
  /** 'ok' | 'partial' | 'failed' */
  readonly status: 'ok' | 'partial' | 'failed';
  /** Names of provers that were available and used. */
  readonly available_provers: string[];
}

// ---------------------------------------------------------------------------
// ProverRouterBridgeAdapter
// ---------------------------------------------------------------------------

export interface ProverRouterBridgeAdapterOptions {
  /** Maximum saturation rounds per formula. Default: 64. */
  maxRounds?: number;
  /** Timeout per formula in ms. Default: 5000. */
  timeoutMs?: number;
}

/**
 * ProverRouterBridgeAdapter — batch TDFOL formula prover.
 *
 * For each formula, attempts to prove it from an empty KB using the extended
 * TDFOL rule set.  Aggregates results into a `ProofGateResult`.
 *
 * Usage:
 * ```ts
 * const adapter = new ProverRouterBridgeAdapter();
 * const result = await adapter.evaluate(formulas);
 * if (result.compiles) { ... }
 * ```
 */
export class ProverRouterBridgeAdapter {
  private readonly bridge: ExtendedTdfolProverBridge;
  private readonly timeoutMs: number;

  constructor(opts: ProverRouterBridgeAdapterOptions = {}) {
    this.bridge = new ExtendedTdfolProverBridge({ maxRounds: opts.maxRounds ?? 64 });
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Route `formulas` through the extended TDFOL prover and return a
   * `ProofGateResult` with per-formula details.
   *
   * Each formula is checked individually:
   *   - Tautologies (provable from empty KB via extended rules) → 'proved'
   *   - Contradictions → 'refuted'
   *   - Undecidable → 'unknown'
   *
   * @param formulas Pre-parsed TDFOL/DCEC formula objects.
   */
  async evaluate(formulas: TdfolFormula[]): Promise<ProofGateResult> {
    const details: ProofGateDetail[] = [];
    let validCount = 0;

    for (const formula of formulas) {
      const result = await this.bridge.prove([], formula, this.timeoutMs);
      details.push({
        formula: serializeTdfol(formula),
        result: result.reason,
        prover_id: result.prover_id,
        proof_time_ms: result.proof_time_ms,
      });
      if (result.reason === 'proved') validCount++;
    }

    const attempted = formulas.length;
    const failureRatio = attempted > 0 ? (attempted - validCount) / attempted : 0;

    return {
      compiles:         failureRatio < 0.5,
      valid_count:      validCount,
      attempted_count:  attempted,
      failure_ratio:    failureRatio,
      details,
      status:           failureRatio === 0 ? 'ok' : failureRatio < 0.5 ? 'partial' : 'failed',
      available_provers: this.bridge.extendedRuleNames().slice(0, 3).concat(['tdfol-native']),
    };
  }

  /**
   * Check a set of deontic norms for mutual consistency.
   *
   * Unlike `evaluate()` which tests each formula independently, `checkConsistency()`
   * loads all formulas into a single KB and checks for normative conflicts
   * (obligation-prohibition clashes, etc.).
   *
   * Returns `status: 'ok'` if consistent, `'failed'` if a conflict is found.
   */
  async checkConsistency(formulas: TdfolFormula[]): Promise<ProofGateResult> {
    if (formulas.length === 0) {
      return {
        compiles: true, valid_count: 0, attempted_count: 0,
        failure_ratio: 0, details: [], status: 'ok', available_provers: ['tdfol-native'],
      };
    }

    // Use a dummy goal — if the KB is inconsistent, saturation will hit a contradiction
    const dummyGoal: DCECFormula = { kind: 'atomic', predicate: '__consistency__', args: [] };
    const result = await this.bridge.prove(formulas, dummyGoal, this.timeoutMs);

    const isConflict = result.reason === 'refuted';
    const detail: ProofGateDetail = {
      formula: formulas.map(serializeTdfol).join('; '),
      result: result.reason,
      prover_id: result.prover_id,
      proof_time_ms: result.proof_time_ms,
    };

    return {
      compiles:        !isConflict,
      valid_count:     isConflict ? 0 : 1,
      attempted_count: 1,
      failure_ratio:   isConflict ? 1.0 : 0.0,
      details:         [detail],
      status:          isConflict ? 'failed' : 'ok',
      available_provers: ['tdfol-native'],
    };
  }
}

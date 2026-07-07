/**
 * CoqJsCoqBridge — Coq theorem prover integration for swissknife.
 *
 * Phase 4.  Two execution paths:
 *
 * 1. **Injected native runner** (Node/host-only opt-in): callers that need
 *    `coqc` can provide a runner. This module does not import child_process or
 *    fs, so browser bundles remain clean.
 *
 * 2. **Script generator** (always available): returns the Coq `.v` source
 *    and marks result as `unknown` so the caller can fall back to remote.
 *    Also generates a cached result for trivially-consistent policies
 *    (no contradictions found by the static translator).
 *
 * jsCoq browser embedding can be layered behind the same runner contract.
 *
 * Reference: ipfs_datasets_py/logic/external_provers/interactive/coq_prover_bridge.py
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../logic/deontic/mcp-policy.js';
import { DeonticToCoqTranslator } from './deontic-to-coq.js';

// ---------------------------------------------------------------------------
// CoqJsCoqBridge
// ---------------------------------------------------------------------------

export interface CoqProcessRunResult {
  readonly exitCode?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly timedOut?: boolean;
}

export interface CoqProcessRunner {
  isAvailable?(coqcPath: string): boolean;
  runCoq(source: string, options: { coqcPath: string; timeoutMs: number }): CoqProcessRunResult;
}

export class CoqJsCoqBridge {
  private readonly translator = new DeonticToCoqTranslator();
  private readonly coqcPath: string | null;
  private readonly runner?: CoqProcessRunner;
  /** Whether an injected `coqc` runner is available. */
  static subprocessAvailable = false;

  private constructor(coqcPath: string | null, runner?: CoqProcessRunner) {
    const requestedPath = coqcPath ?? 'coqc';
    const available = Boolean(runner && (runner.isAvailable?.(requestedPath) ?? true));
    this.coqcPath = available ? requestedPath : null;
    this.runner = available ? runner : undefined;
    CoqJsCoqBridge.subprocessAvailable = available;
  }

  /**
   * Create a `CoqJsCoqBridge`.
   *
   * @param coqcPath Override path to coqc binary (default: auto-detect).
   * @param runner Host/native runner. Omit this in browser builds.
   */
  static async create(coqcPath?: string, runner?: CoqProcessRunner): Promise<CoqJsCoqBridge> {
    return new CoqJsCoqBridge(coqcPath ?? null, runner);
  }

  /**
   * Check policy consistency using Coq.
   *
   * Static analysis first: if the `DeonticToCoqTranslator` produces a
   * contradiction-free script (theorem = `policy_consistent`), the policy
   * is declared consistent without running an injected host runner.
   *
   * When a `coqc` runner is explicitly injected, delegates the generated
   * source to that runner for a ground-truth verdict on contradiction lemmas.
   */
  async checkPolicyConsistency(policy: Policy, timeoutMs = 30_000): Promise<WasmProofResult> {
    const start = Date.now();
    const script = this.translator.policyConsistencyScript(policy);

    // Fast path: no contradiction lemmas → trivially consistent
    if (script.theoremName === 'policy_consistent' && !this.coqcPath) {
      return {
        proved: true, sat: true, unsat: false,
        reason: 'proved', prover_id: 'coq-jscoq',
        proof_time_ms: Date.now() - start,
        meta: { path: 'static-analysis', theorem: script.theoremName },
      };
    }

    // Injected native path
    if (this.coqcPath && this.runner) {
      return this._runCoqc(script.source, script.theoremName, timeoutMs, start);
    }

    // No runner and non-trivial script → unknown for explicit caller routing.
    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'coq-jscoq',
      proof_time_ms: Date.now() - start,
      meta: { unavailable: 'coqc runner not configured; browser-safe mode', script: script.source },
    };
  }

  /**
   * Run an arbitrary Coq script string.
   *
   * @param coqSource  Full `.v` source.
   * @param timeoutMs  Proof budget.
   * @returns Proof result; `unknown` when coqc is unavailable.
   */
  async prove(coqSource: string, timeoutMs = 30_000): Promise<WasmProofResult> {
    const start = Date.now();
    if (!this.coqcPath || !this.runner) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'coq-jscoq',
        proof_time_ms: 0,
        meta: { unavailable: 'coqc runner not configured', script: coqSource.slice(0, 200) },
      };
    }
    return this._runCoqc(coqSource, undefined, timeoutMs, start);
  }

  /** Check whether an injected `coqc` runner is available. */
  static isAvailable(runner?: CoqProcessRunner, coqcPath = 'coqc'): boolean {
    return Boolean(runner && (runner.isAvailable?.(coqcPath) ?? true));
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _runCoqc(
    source: string,
    theoremName: string | undefined,
    timeoutMs: number,
    start: number,
  ): WasmProofResult {
    try {
      const run = this.runner!.runCoq(source, { coqcPath: this.coqcPath!, timeoutMs });
      const coqOutput = [run.stdout, run.stderr].filter(Boolean).join('\n');
      if (run.timedOut) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'timeout',
          prover_id: 'coq-jscoq',
          proof_time_ms: Date.now() - start,
          meta: { output: coqOutput.slice(0, 500) },
        };
      }
      if (run.exitCode !== undefined && run.exitCode !== null && run.exitCode !== 0) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'refuted', prover_id: 'coq-jscoq',
          proof_time_ms: Date.now() - start,
          meta: { error: coqOutput.slice(0, 500) },
        };
      }

      // PORT-031: coqc sometimes exits 0 but emits "Error" or "Anomaly" in output
      if (/\bError\b/i.test(coqOutput) || /\bAnomaly\b/i.test(coqOutput)) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'refuted', prover_id: 'coq-jscoq',
          proof_time_ms: Date.now() - start,
          meta: { error: 'Coq output contains Error/Anomaly', output: coqOutput.slice(0, 500) },
        };
      }

      // coqc exits 0 and no error/anomaly in output — proof accepted
      return {
        proved: true, sat: true, unsat: false,
        reason: 'proved', prover_id: 'coq-jscoq',
        proof_time_ms: Date.now() - start,
        meta: { theorem: theoremName },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('ETIMEDOUT') || msg.includes('timeout');
      return {
        proved: false, sat: false, unsat: false,
        reason: isTimeout ? 'timeout' : 'refuted',
        prover_id: 'coq-jscoq',
        proof_time_ms: Date.now() - start,
        meta: { error: msg.slice(0, 500) },
      };
    }
  }
}

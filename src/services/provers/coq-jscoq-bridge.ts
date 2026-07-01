/**
 * CoqJsCoqBridge — Coq theorem prover integration for swissknife.
 *
 * Sprint 3 / Phase 4.  Two execution paths:
 *
 * 1. **Subprocess `coqc`** (when the binary is available): mirrors
 *    ipfs_datasets_py CoqProverBridge — writes a temp .v file and checks it.
 *    Works in CI environments that have Coq installed.
 *
 * 2. **Script generator** (always available): returns the Coq `.v` source
 *    and marks result as `unknown` so the caller can fall back to remote.
 *    Also generates a cached result for trivially-consistent policies
 *    (no contradictions found by the static translator).
 *
 * jsCoq browser embedding is intentionally NOT implemented here — the browser
 * runtime is separate (hallucinate_app UI) and this bridge targets Node.js.
 *
 * Reference: ipfs_datasets_py/logic/external_provers/interactive/coq_prover_bridge.py
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';
import { DeonticToCoqTranslator } from './deontic-to-coq.js';

// ---------------------------------------------------------------------------
// CoqJsCoqBridge
// ---------------------------------------------------------------------------

export class CoqJsCoqBridge {
  private readonly translator = new DeonticToCoqTranslator();
  private readonly coqcPath: string | null;
  /** Whether `coqc` subprocess is available. */
  static subprocessAvailable = false;

  private constructor(coqcPath: string | null) {
    this.coqcPath = coqcPath;
    if (coqcPath) CoqJsCoqBridge.subprocessAvailable = true;
  }

  /**
   * Create a `CoqJsCoqBridge`.
   * Probes for `coqc` availability without blocking startup.
   *
   * @param coqcPath Override path to coqc binary (default: auto-detect).
   */
  static async create(coqcPath?: string): Promise<CoqJsCoqBridge> {
    const path = coqcPath ?? findCoqc();
    return new CoqJsCoqBridge(path);
  }

  /**
   * Check policy consistency using Coq.
   *
   * Static analysis first: if the `DeonticToCoqTranslator` produces a
   * contradiction-free script (theorem = `policy_consistent`), the policy
   * is declared consistent without running the subprocess.
   *
   * When `coqc` is available, actually compiles the `.v` file for a ground
   * truth verdict on contradiction lemmas.
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

    // Subprocess path
    if (this.coqcPath) {
      return this._runCoqc(script.source, script.theoremName, timeoutMs, start);
    }

    // No coqc and non-trivial script → unknown (fall through to remote)
    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'coq-jscoq',
      proof_time_ms: Date.now() - start,
      meta: { unavailable: 'coqc not found; jsCoq browser-only', script: script.source },
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
    if (!this.coqcPath) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'coq-jscoq',
        proof_time_ms: 0,
        meta: { unavailable: 'coqc not found', script: coqSource.slice(0, 200) },
      };
    }
    return this._runCoqc(coqSource, undefined, timeoutMs, start);
  }

  /** Check whether `coqc` subprocess is available in this environment. */
  static isAvailable(): boolean {
    return findCoqc() !== null;
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
    let tmpDir: string | undefined;
    let tmpFile: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), 'coq-bridge-'));
      tmpFile = join(tmpDir, 'policy.v');
      writeFileSync(tmpFile, source, 'utf8');

      execFileSync(this.coqcPath!, [tmpFile], {
        timeout: timeoutMs,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      // coqc exits 0 on success
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
    } finally {
      if (tmpFile) { try { unlinkSync(tmpFile); } catch { /* best effort */ } }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCoqc(): string | null {
  for (const name of ['coqc', 'coqtop']) {
    try {
      execFileSync('which', [name], { stdio: 'pipe', encoding: 'utf8' });
      return name;
    } catch {
      // not found
    }
  }
  return null;
}

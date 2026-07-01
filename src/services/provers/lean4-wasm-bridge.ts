/**
 * Lean4WasmBridge — Lean 4 theorem prover integration for swissknife.
 *
 * Sprint 4 / Phase 5.  Two execution paths:
 *
 * 1. **Subprocess `lean`** (when the binary is available): mirrors
 *    ipfs_datasets_py LeanProverBridge — writes a temp .lean file and evaluates.
 *    Works in CI environments that have Lean 4 / Lake installed.
 *
 * 2. **Static analysis fast path**: for policies with no detected contradictions,
 *    the translator produces `theorem policy_consistent : True := trivial` which
 *    we treat as proved without running the binary.
 *
 * lean4web WebSocket embedding is intentionally not implemented here — the
 * lean4web server is a separate infrastructure concern for the browser UI.
 *
 * Reference: ipfs_datasets_py/logic/external_provers/interactive/lean_prover_bridge.py
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';
import { DeonticToLean4Translator } from './deontic-to-lean4.js';

// ---------------------------------------------------------------------------
// Lean4WasmBridge
// ---------------------------------------------------------------------------

export class Lean4WasmBridge {
  private readonly translator = new DeonticToLean4Translator();
  private readonly leanPath: string | null;
  /** Whether a `lean` / `lake` subprocess is available. */
  static subprocessAvailable = false;

  private constructor(leanPath: string | null) {
    this.leanPath = leanPath;
    if (leanPath) Lean4WasmBridge.subprocessAvailable = true;
  }

  /**
   * Create a `Lean4WasmBridge`.
   * Probes for `lean` / `lake` without blocking.
   */
  static async create(leanPath?: string): Promise<Lean4WasmBridge> {
    const path = leanPath ?? findLean();
    return new Lean4WasmBridge(path);
  }

  /**
   * Check policy consistency using Lean 4.
   *
   * Static fast path: trivially-consistent policy → `proved` immediately.
   * Subprocess path: compiles the `.lean` file with `lean --run` / `lean`.
   */
  async checkPolicyConsistency(policy: Policy, timeoutMs = 30_000): Promise<WasmProofResult> {
    const start = Date.now();
    const script = this.translator.policyConsistencyScript(policy);

    // Fast path: no contradiction lemmas
    if (script.theoremName === 'policy_consistent' && !this.leanPath) {
      return {
        proved: true, sat: true, unsat: false,
        reason: 'proved', prover_id: 'lean4-wasm',
        proof_time_ms: Date.now() - start,
        meta: { path: 'static-analysis', theorem: script.theoremName },
      };
    }

    // Subprocess path
    if (this.leanPath) {
      return this._runLean(script.source, script.theoremName, timeoutMs, start);
    }

    // No lean binary → unknown, provide the script for external use
    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'lean4-wasm',
      proof_time_ms: Date.now() - start,
      meta: {
        unavailable: 'lean binary not found; lean4web browser-only',
        script: script.source,
      },
    };
  }

  /**
   * Evaluate an arbitrary Lean 4 source string.
   */
  async prove(leanSource: string, timeoutMs = 30_000): Promise<WasmProofResult> {
    const start = Date.now();
    if (!this.leanPath) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'lean4-wasm',
        proof_time_ms: 0,
        meta: { unavailable: 'lean not found', script: leanSource.slice(0, 200) },
      };
    }
    return this._runLean(leanSource, undefined, timeoutMs, start);
  }

  /** Check whether `lean` subprocess is available. */
  static isAvailable(): boolean {
    return findLean() !== null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _runLean(
    source: string,
    theoremName: string | undefined,
    timeoutMs: number,
    start: number,
  ): WasmProofResult {
    let tmpDir: string | undefined;
    let tmpFile: string | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), 'lean4-bridge-'));
      tmpFile = join(tmpDir, 'policy.lean');
      writeFileSync(tmpFile, source, 'utf8');

      // Try `lean --run` for simple scripts first
      try {
        execFileSync(this.leanPath!, ['--run', tmpFile], {
          timeout: timeoutMs,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch {
        // Try plain `lean` (older invocation style)
        execFileSync(this.leanPath!, [tmpFile], {
          timeout: timeoutMs,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      }

      return {
        proved: true, sat: true, unsat: false,
        reason: 'proved', prover_id: 'lean4-wasm',
        proof_time_ms: Date.now() - start,
        meta: { theorem: theoremName },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('ETIMEDOUT') || msg.includes('timeout');
      return {
        proved: false, sat: false, unsat: false,
        reason: isTimeout ? 'timeout' : 'refuted',
        prover_id: 'lean4-wasm',
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

function findLean(): string | null {
  for (const name of ['lean', 'lake']) {
    try {
      execFileSync('which', [name], { stdio: 'pipe', encoding: 'utf8' });
      return name;
    } catch {
      // not found
    }
  }
  return null;
}

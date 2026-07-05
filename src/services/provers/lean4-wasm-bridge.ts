/**
 * Lean4WasmBridge — Lean 4 theorem prover integration for swissknife.
 *
 * Sprint 4 / Phase 5.  Two execution paths:
 *
 * 1. **Injected native runner** (Node/host-only opt-in): callers that need
 *    `lean`, `lake`, or ix can provide a runner. This module does not import
 *    child_process, fs, path, os, crypto, or Buffer.
 *
 * 2. **Static analysis fast path**: for policies with no detected contradictions,
 *    the translator produces `theorem policy_consistent : True := trivial` which
 *    we treat as proved without running the binary.
 *
 * 3. **ix ZK-attested path** (Sprint 7b, T-52): when an ix proof runner is
 *    explicitly injected, callers can generate a ZK proof of Lean 4 typecheck via:
 *      `lake exe ix compile <file.lean> --out <file.ixe>`  (ix compiler)
 *      `cargo run --release -- --execute --ixe <file.ixe>` (SP1 host)
 *    Returns a `ZKProofArtifact` with `backend: 'sphinx'` alongside the
 *    standard WasmProofResult.
 *
 * lean4web/Lean WASM embedding can be layered behind the same runner contract.
 *
 * ix CLI reference: https://github.com/argumentcomputer/ix
 * Reference: ipfs_datasets_py/logic/external_provers/interactive/lean_prover_bridge.py
 */

import type { WasmProofResult } from './prover-types.js';
import type { ZKProofArtifact } from './lurk-wasm-bridge.js';
import type { Policy } from '../mcp-policy.js';
import { DeonticToLean4Translator } from './deontic-to-lean4.js';

// ---------------------------------------------------------------------------
// Lean4WasmBridge
// ---------------------------------------------------------------------------

export interface LeanProcessRunResult {
  readonly exitCode?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly timedOut?: boolean;
}

export interface LeanProcessRunner {
  isAvailable?(leanPath: string): boolean;
  runLean(source: string, options: { leanPath: string; timeoutMs: number }): LeanProcessRunResult;
}

export interface IxProofRunner {
  isAvailable?(ixPath?: string): boolean;
  proveWithIx(
    leanSource: string,
    options: { ixPath?: string; timeoutMs: number },
  ): Promise<ZKProofArtifact | null> | ZKProofArtifact | null;
}

export class Lean4WasmBridge {
  private readonly translator = new DeonticToLean4Translator();
  private readonly leanPath: string | null;
  private readonly runner?: LeanProcessRunner;
  /** Whether an injected `lean` runner is available. */
  static subprocessAvailable = false;

  private constructor(leanPath: string | null, runner?: LeanProcessRunner) {
    const requestedPath = leanPath ?? 'lean';
    const available = Boolean(runner && (runner.isAvailable?.(requestedPath) ?? true));
    this.leanPath = available ? requestedPath : null;
    this.runner = available ? runner : undefined;
    Lean4WasmBridge.subprocessAvailable = available;
  }

  /**
   * Create a `Lean4WasmBridge`.
   *
   * @param leanPath Override path to the Lean binary.
   * @param runner Host/native runner. Omit this in browser builds.
   */
  static async create(leanPath?: string, runner?: LeanProcessRunner): Promise<Lean4WasmBridge> {
    return new Lean4WasmBridge(leanPath ?? null, runner);
  }

  /**
   * Check policy consistency using Lean 4.
   *
   * Static fast path: trivially-consistent policy → `proved` immediately.
   * Injected native path: asks the runner to compile/check the Lean source.
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

    // Injected native path
    if (this.leanPath && this.runner) {
      return this._runLean(script.source, script.theoremName, timeoutMs, start);
    }

    // No lean binary → unknown, provide the script for external use
    return {
      proved: false, sat: false, unsat: false,
      reason: 'unknown', prover_id: 'lean4-wasm',
      proof_time_ms: Date.now() - start,
      meta: {
        unavailable: 'lean runner not configured; browser-safe mode',
        script: script.source,
      },
    };
  }

  /**
   * Evaluate an arbitrary Lean 4 source string.
   */
  async prove(leanSource: string, timeoutMs = 30_000): Promise<WasmProofResult> {
    const start = Date.now();
    if (!this.leanPath || !this.runner) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'lean4-wasm',
        proof_time_ms: 0,
        meta: { unavailable: 'lean runner not configured', script: leanSource.slice(0, 200) },
      };
    }
    return this._runLean(leanSource, undefined, timeoutMs, start);
  }

  /** Check whether an injected `lean` runner is available. */
  static isAvailable(runner?: LeanProcessRunner, leanPath = 'lean'): boolean {
    return Boolean(runner && (runner.isAvailable?.(leanPath) ?? true));
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
    try {
      const run = this.runner!.runLean(source, { leanPath: this.leanPath!, timeoutMs });
      const output = [run.stdout, run.stderr].filter(Boolean).join('\n');
      if (run.timedOut) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'timeout', prover_id: 'lean4-wasm',
          proof_time_ms: Date.now() - start,
          meta: { output: output.slice(0, 500) },
        };
      }
      if (run.exitCode !== undefined && run.exitCode !== null && run.exitCode !== 0) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'refuted', prover_id: 'lean4-wasm',
          proof_time_ms: Date.now() - start,
          meta: { error: output.slice(0, 500) },
        };
      }

      // PORT-030: Lean can exit 0 even when `sorry` is used (unsound proof)
      // or when `error:` appears in output. Treat these as failures.
      if (/\bsorry\b/i.test(output) || /error:/i.test(output)) {
        return {
          proved: false, sat: false, unsat: false,
          reason: 'refuted', prover_id: 'lean4-wasm',
          proof_time_ms: Date.now() - start,
          meta: { error: 'Lean output contains `sorry` or `error:` — proof is incomplete', output: output.slice(0, 500) },
        };
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
    }
  }
}

// ---------------------------------------------------------------------------
// ix ZK-attested path (T-52) — Sprint 7b
// ---------------------------------------------------------------------------

/**
 * Check whether the `ix` CLI is available (requires `lake` + `ix` in PATH).
 *
 * ix reference: https://github.com/argumentcomputer/ix
 *   Install: `lake run install` inside the ix repo, or `lake exe ix` to run.
 */
export function findIxCli(runner?: IxProofRunner, ixPath = 'ix'): string | null {
  return runner && (runner.isAvailable?.(ixPath) ?? true) ? ixPath : null;
}

/**
 * Attempt to generate a ZK proof of a Lean 4 source file using the ix CLI +
 * SP1 backend.  Returns `null` when ix is not installed or the proof fails.
 *
 * Workflow (mirrors ix README):
 *   1. Write `leanSource` to a temp `.lean` file.
 *   2. `lake exe ix compile <file.lean> --out <file.ixe>`
 *   3. Execute in SP1 VM: `cargo run --release -- --execute --ixe <file.ixe>`
 *      (inside `sp1/host/` of the ix checkout, or the installed `ix` binary)
 *
 * @param leanSource  Lean 4 source to compile and prove.
 * @param ixPath      Path to ix binary (default: auto-detect).
 * @param timeoutMs   Compile + execute timeout.
 * @returns ZKProofArtifact with backend='sphinx', or null on failure.
 */
export async function proveWithIx(
  leanSource: string,
  ixPath?: string,
  timeoutMs = 120_000,
  runner?: IxProofRunner,
): Promise<ZKProofArtifact | null> {
  if (!runner) return null;
  if (!(runner.isAvailable?.(ixPath) ?? true)) return null;
  try {
    return await runner.proveWithIx(leanSource, { ixPath, timeoutMs });
  } catch {
    return null;
  }
}

/**
 * Return build instructions for the ix CLI (T-52).
 */
export function ixBuildInstructions(): string {
  return [
    '# Sprint 7b — Build and install ix CLI:',
    '',
    '# 1. Prerequisites: install Lean 4, Rust, and Lake',
    '# See https://leanprover.github.io/lean4/doc/setup.html',
    '',
    '# 2. Clone and build ix',
    'git clone https://github.com/argumentcomputer/ix',
    'cd ix',
    '',
    '# 3. Install the ix binary (requires 32 GB RAM minimum)',
    'lake run install',
    '# Or run without installing:',
    'lake exe ix compile Tests/MinimalDefs.lean --out minimal.ixe',
    '',
    '# 4. Generate a ZK proof of a Lean 4 typecheck (SP1 backend):',
    'lake exe ix compile theorem.lean --out theorem.ixe',
    'cd sp1/host && cargo run --release -- --execute --ixe ../../theorem.ixe',
    '',
    '# 5. Use in swissknife:',
    "import { proveWithIx } from '@swissknife/mcp-wasm-prover';",
    "const artifact = await proveWithIx('theorem x : True := trivial');",
  ].join('\n');
}

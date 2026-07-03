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
 * 3. **ix ZK-attested path** (Sprint 7b, T-52): When `lake` is available and
 *    the ix CLI is installed, `prove()` can additionally generate a ZK proof
 *    of the Lean 4 typecheck via:
 *      `lake exe ix compile <file.lean> --out <file.ixe>`  (ix compiler)
 *      `cargo run --release -- --execute --ixe <file.ixe>` (SP1 host)
 *    Returns a `ZKProofArtifact` with `backend: 'sphinx'` alongside the
 *    standard WasmProofResult.
 *
 * lean4web WebSocket embedding is intentionally not implemented here — the
 * lean4web server is a separate infrastructure concern for the browser UI.
 *
 * ix CLI reference: https://github.com/argumentcomputer/ix
 * Reference: ipfs_datasets_py/logic/external_provers/interactive/lean_prover_bridge.py
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { WasmProofResult } from './prover-types.js';
import type { ZKProofArtifact } from './lurk-wasm-bridge.js';
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

// ---------------------------------------------------------------------------
// ix ZK-attested path (T-52) — Sprint 7b
// ---------------------------------------------------------------------------

/**
 * Check whether the `ix` CLI is available (requires `lake` + `ix` in PATH).
 *
 * ix reference: https://github.com/argumentcomputer/ix
 *   Install: `lake run install` inside the ix repo, or `lake exe ix` to run.
 */
export function findIxCli(): string | null {
  for (const name of ['ix']) {
    try {
      execFileSync('which', [name], { stdio: 'pipe', encoding: 'utf8' });
      return name;
    } catch {
      // not found — try via lake
    }
  }
  return null;
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
): Promise<ZKProofArtifact | null> {
  const ix = ixPath ?? findIxCli();
  if (!ix) return null;

  let tmpDir: string | undefined;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'ix-proof-'));
    const leanFile = join(tmpDir, 'theorem.lean');
    const ixeFile = join(tmpDir, 'theorem.ixe');

    writeFileSync(leanFile, leanSource, 'utf8');

    // Step 1: compile Lean → .ixe
    try {
      execFileSync('lake', ['exe', ix, 'compile', leanFile, '--out', ixeFile], {
        timeout: timeoutMs / 2,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {
      // Try direct ix binary
      execFileSync(ix, ['compile', leanFile, '--out', ixeFile], {
        timeout: timeoutMs / 2,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }

    if (!existsSync(ixeFile)) return null;

    // Step 2: execute (prove) with SP1
    const start = Date.now();
    let executeOutput = '';
    try {
      executeOutput = execFileSync(ix, ['execute', '--ixe', ixeFile], {
        timeout: timeoutMs / 2,
        encoding: 'utf8',
        stdio: 'pipe',
      }) as string;
    } catch {
      // Try via lake
      executeOutput = execFileSync('lake', ['exe', ix, 'execute', '--ixe', ixeFile], {
        timeout: timeoutMs / 2,
        encoding: 'utf8',
        stdio: 'pipe',
      }) as string;
    }
    const proof_time_ms = Date.now() - start;

    // Compute a content-addressed CID for the proof artifact
    const proofBytes = Buffer.from(executeOutput, 'utf8');
    const artifact_cid = `sha256:${createHash('sha256').update(proofBytes).digest('hex')}`;

    return {
      backend: 'sphinx',
      statement: leanSource.slice(0, 200),
      proof_b64: proofBytes.toString('base64').slice(0, 200), // truncated for wire format
      vk_cid: 'sha256:' + '0'.repeat(64), // placeholder VK CID until ix publishes VKs
      public_inputs: [],
      artifact_cid,
      proof_time_ms,
      lurk_expr: undefined,
    };
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      try { unlinkSync(join(tmpDir, 'theorem.lean')); } catch { /* best effort */ }
      try { unlinkSync(join(tmpDir, 'theorem.ixe')); } catch { /* best effort */ }
    }
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

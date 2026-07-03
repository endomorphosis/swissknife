/**
 * LurkWasmBridge — ZK proof-carrying code stub for swissknife.
 *
 * Sprint 4 / Phase 6 (P2 research-track).  The Lurk ZK WASM integration is
 * pending upstream API stability (`lurk-beta` has preliminary WASM support but
 * no stable npm package as of 2026-07-01).  This file:
 *
 *   1. Defines the `ZKProofArtifact` type (MCP++ spec conformance vector).
 *   2. Provides `DeonticToLurkTranslator` — encodes obligation-discharge goals
 *      as Lurk s-expressions for when the API matures.
 *   3. Provides `LurkWasmBridge` — a stub that compiles and returns
 *      `{ reason: 'unknown', prover_id: 'lurk-wasm' }` until a real Lurk
 *      WASM module is injected (T-35 acceptance criterion).
 *   4. Provides `loadLurkFromFile(wasmPath)` — load a locally-built lurk-beta
 *      WASM binary (Sprint 6a, T-46).
 *
 * Sprint 6a build instructions (T-46):
 *   # Install Rust WASM target
 *   rustup target add wasm32-unknown-unknown
 *   # Clone lurk-beta
 *   git clone https://github.com/argumentcomputer/lurk-beta && cd lurk-beta
 *   # Build WASM (produces target/wasm32-unknown-unknown/release/lurk.wasm)
 *   cargo build --target wasm32-unknown-unknown --release
 *   # Generate JS bindings via wasm-bindgen
 *   wasm-bindgen target/wasm32-unknown-unknown/release/lurk.wasm \
 *     --out-dir lurk-wasm-pkg --target nodejs
 *   # The resulting lurk-wasm-pkg/ can be pointed to via loadLurkFromFile()
 *
 * References:
 *   - https://github.com/argumentcomputer/lurk-beta (preliminary WASM support)
 *   - https://github.com/argumentcomputer/ix (ZK PCC for Lean 4 via Sphinx)
 *   - ipfs_datasets_py/logic/zkp/ (Circom/Plonky3 circuit definitions)
 *   - implementation_plan/docs/36-swissknife-wasm-theorem-provers-2026-07-01.md §3.5, Phase 6
 */

import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';

// ---------------------------------------------------------------------------
// ZKProofArtifact — MCP++ canonical ZK proof type (T-36)
// ---------------------------------------------------------------------------

/**
 * A zero-knowledge proof artifact produced by a STARK/SNARK backend.
 *
 * Conformance vector: Mcp-Plus-Plus/conformance/vectors/zkp_proof_artifact.json
 */
export interface ZKProofArtifact {
  /** ZK proof system backend. */
  backend: 'lurk' | 'nova' | 'sphinx' | 'plonky3' | 'circom';
  /** The proposition that was proved (human-readable). */
  statement: string;
  /** Serialised proof bytes as a base64url string. */
  proof_b64: string;
  /** Verification key CID (content-addressed). */
  vk_cid: string;
  /** Public inputs to the proof circuit. */
  public_inputs: unknown[];
  /** CID of this artifact (`sha256:<hex>`). */
  artifact_cid: string;
  /** Milliseconds taken to generate the proof. */
  proof_time_ms: number;
  /** Lurk expression that was evaluated, if applicable. */
  lurk_expr?: string;
}

// ---------------------------------------------------------------------------
// DeonticToLurkTranslator (T-34)
// ---------------------------------------------------------------------------

/**
 * Translates MCP++ deontic obligation discharge goals to Lurk s-expressions.
 *
 * The obligation discharge problem is: given an obligation O(cap, rsc),
 * is it the case that the required capability is not prohibited and
 * can be executed?  In Lurk notation: `(⊢ (dischargeable cap rsc ctx))`.
 */
export class DeonticToLurkTranslator {
  /**
   * Encode an obligation discharge goal as a Lurk s-expression.
   *
   * @param cap       Capability being obligated.
   * @param rsc       Resource the obligation applies to.
   * @param context   Optional context atoms (e.g. actor DID, timestamp).
   * @returns A Lurk s-expression string.
   */
  obligationToLurk(cap: string, rsc: string, context?: Record<string, unknown>): string {
    const ctxPairs = Object.entries(context ?? {})
      .map(([k, v]) => `(${lurkAtom(k)} . ${JSON.stringify(v)})`)
      .join(' ');
    const ctxExpr = ctxPairs ? `(list ${ctxPairs})` : 'nil';
    return `(dischargeable '${lurkAtom(cap)} '${lurkAtom(rsc)} ${ctxExpr})`;
  }

  /**
   * Encode a full policy's obligations as a Lurk conjunction.
   *
   * Returns `t` (true) when there are no obligations.
   */
  policyObligationsToLurk(policy: Policy): string {
    const obligations = policy.obligations ?? [];
    if (obligations.length === 0) return 't';

    const goals = obligations.map(obl =>
      this.obligationToLurk(obl.requiredCap ?? obl.description, '*'),
    );
    if (goals.length === 1) return goals[0];
    return `(and ${goals.join(' ')})`;
  }
}

// ---------------------------------------------------------------------------
// LurkWasmBridge (T-35) — stub
// ---------------------------------------------------------------------------

/**
 * Structural interface for a native Lurk WASM module.
 * Satisfied by a future `lurk-beta` npm WASM export.
 */
export interface LurkWasmModule {
  /** Evaluate a Lurk s-expression and return a proof artifact. */
  evaluate(expr: string): Promise<{ result: unknown; proof: string }> | { result: unknown; proof: string };
  /** Verify a previously-generated proof. */
  verify(proof: string, vk: string): boolean;
}

export class LurkWasmBridge {
  private readonly translator = new DeonticToLurkTranslator();
  private readonly nativeLurk?: LurkWasmModule;

  /** True when a native Lurk WASM module has been injected. */
  static nativeAvailable = false;

  private constructor(nativeLurk?: LurkWasmModule) {
    this.nativeLurk = nativeLurk;
    if (nativeLurk) LurkWasmBridge.nativeAvailable = true;
  }

  /**
   * Create a `LurkWasmBridge`.
   *
   * @param nativeLurk  Optional native Lurk WASM module.  When omitted the
   *                    bridge compiles and operates in stub mode (returns
   *                    `unknown` for all proofs — safe fallback).
   */
  static async create(nativeLurk?: LurkWasmModule): Promise<LurkWasmBridge> {
    if (!nativeLurk) {
      // Try dynamic import of lurk-wasm (will fail until the package exists)
      try {
        // @ts-expect-error — lurk-wasm is not yet published
        const mod = await import('lurk-wasm');
        return new LurkWasmBridge(mod as LurkWasmModule);
      } catch {
        // Package not available — operate in stub mode
      }
    }
    return new LurkWasmBridge(nativeLurk);
  }

  /**
   * Generate a ZK proof of obligation discharge for `policy`.
   *
   * In stub mode (no native Lurk), returns `{ reason: 'unknown' }` so the
   * caller falls back to the remote Python TDFOL engine.
   */
  async proveObligationDischarge(
    policy: Policy,
    _timeoutMs = 60_000,
  ): Promise<WasmProofResult & { artifact?: ZKProofArtifact }> {
    const start = Date.now();
    const lurkExpr = this.translator.policyObligationsToLurk(policy);

    if (!this.nativeLurk) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'lurk-wasm',
        proof_time_ms: Date.now() - start,
        meta: {
          unavailable: 'lurk-wasm npm package not yet published; Phase 6 pending',
          lurk_expr: lurkExpr,
          note: 'Inject a LurkWasmModule via LurkWasmBridge.create(module) when available.',
        },
      };
    }

    // Native path
    try {
      const { result, proof } = await this.nativeLurk.evaluate(lurkExpr);
      const proved = result === true || result === 't';
      const artifact: ZKProofArtifact = {
        backend: 'lurk',
        statement: `Obligation discharge for policy ${policy.id}`,
        proof_b64: Buffer.from(proof, 'utf8').toString('base64'),
        vk_cid: 'sha256:' + '0'.repeat(64), // placeholder until real VK CID
        public_inputs: [policy.id, policy.version],
        artifact_cid: 'sha256:' + '0'.repeat(64), // placeholder
        proof_time_ms: Date.now() - start,
        lurk_expr: lurkExpr,
      };
      return {
        proved, sat: proved, unsat: !proved,
        reason: proved ? 'proved' : 'refuted',
        prover_id: 'lurk-wasm',
        proof_time_ms: Date.now() - start,
        artifact,
      };
    } catch (err) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'error', prover_id: 'lurk-wasm',
        proof_time_ms: Date.now() - start,
        meta: { error: String(err) },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lurkAtom(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-]/g, '-').toLowerCase().slice(0, 40) || 'any';
}

// ---------------------------------------------------------------------------
// Sprint 6a helpers — loading locally-built lurk-beta WASM (T-46, T-47)
// ---------------------------------------------------------------------------

/**
 * Load a locally-built lurk-beta WASM module from a file path.
 *
 * Use this when you have followed the Sprint 6a build instructions and have
 * a `lurk-wasm-pkg/` directory produced by `wasm-bindgen --target nodejs`.
 *
 * ```ts
 * const module = await loadLurkFromFile('./lurk-wasm-pkg/lurk.js');
 * const bridge = await LurkWasmBridge.create(module);
 * ```
 *
 * @param lurkJsBindingPath  Absolute or relative path to the `lurk.js` glue file
 *                           produced by wasm-bindgen.
 * @returns A `LurkWasmModule` ready for `LurkWasmBridge.create()`.
 */
export async function loadLurkFromFile(lurkJsBindingPath: string): Promise<LurkWasmModule> {
  // Dynamic import of a local path (Node.js only).
  // The generated wasm-bindgen module must export `evaluate` and `verify`.
  const mod = await import(/* webpackIgnore: true */ lurkJsBindingPath) as LurkWasmModule;
  if (typeof mod.evaluate !== 'function') {
    throw new Error(
      `loadLurkFromFile: '${lurkJsBindingPath}' does not export an 'evaluate' function. ` +
      'Ensure it was built with `wasm-bindgen --target nodejs` and exports the Lurk REPL API.',
    );
  }
  return mod;
}

/**
 * Return the console instructions for building lurk-beta WASM locally (T-46).
 * Useful for displaying in `mcp++ provers` or error messages.
 */
export function lurkBetaBuildInstructions(): string {
  return [
    '# Sprint 6a — Build lurk-beta WASM locally:',
    '',
    '# 1. Install Rust WASM target',
    'rustup target add wasm32-unknown-unknown',
    '',
    '# 2. Install wasm-bindgen',
    'cargo install wasm-bindgen-cli',
    '',
    '# 3. Clone lurk-beta',
    'git clone https://github.com/argumentcomputer/lurk-beta',
    'cd lurk-beta',
    '',
    '# 4. Build WASM release',
    'cargo build --target wasm32-unknown-unknown --release',
    '',
    '# 5. Generate Node.js bindings',
    'wasm-bindgen target/wasm32-unknown-unknown/release/lurk.wasm \\',
    '  --out-dir lurk-wasm-pkg --target nodejs',
    '',
    '# 6. Use in swissknife:',
    "import { loadLurkFromFile, LurkWasmBridge } from '@swissknife/mcp-wasm-prover';",
    "const module = await loadLurkFromFile('./lurk-wasm-pkg/lurk.js');",
    'const bridge = await LurkWasmBridge.create(module);',
  ].join('\n');
}

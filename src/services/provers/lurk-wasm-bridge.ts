/**
 * LurkWasmBridge — ZK proof-carrying code adapter for swissknife.
 *
 * Sprint 4 / Phase 6 (P2 research-track).  The Lurk ZK WASM integration is
 * pending upstream API stability (`lurk-beta` has preliminary WASM support but
 * no stable npm package as of 2026-07-01).  This file:
 *
 *   1. Defines the `ZKProofArtifact` type (MCP++ spec conformance vector).
 *   2. Provides `DeonticToLurkTranslator` — encodes obligation-discharge goals
 *      as Lurk s-expressions for when the API matures.
 *   3. Provides `LurkWasmBridge` — a host-safe adapter that returns
 *      `{ reason: 'unknown', prover_id: 'lurk-wasm' }` until a real Lurk
 *      WASM module is injected or importable.
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

import { createHash } from 'crypto';
import type { WasmProofResult } from './prover-types.js';
import type { Policy } from '../mcp-policy.js';

const DEFAULT_LURK_WASM_PACKAGE = 'lurk-wasm';

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
// LurkWasmBridge (T-35/T-46..T-50) — host-safe adapter
// ---------------------------------------------------------------------------

/**
 * Structural interface for a native Lurk WASM module.
 * Satisfied by a future `lurk-beta` npm WASM export.
 */
export interface LurkEvaluationResult {
  readonly result?: unknown;
  readonly proof?: unknown;
  readonly proof_b64?: string;
  readonly proof_bytes?: unknown;
  readonly public_inputs?: unknown[];
  readonly vk?: unknown;
  readonly verifying_key?: unknown;
  readonly vk_cid?: string;
  readonly backend?: ZKProofArtifact['backend'];
}

export type LurkNativeProofFunction = (
  expr: string,
  options?: { policy: Policy; timeoutMs: number; lurkExpr: string },
) => Promise<LurkEvaluationResult> | LurkEvaluationResult;

export type LurkNativeVerifyFunction = (
  proofB64: string,
  vkCid: string,
  publicInputs: unknown[],
  artifact: ZKProofArtifact,
) => Promise<boolean> | boolean;

export interface LurkWasmModule {
  /** Evaluate a Lurk s-expression and return a proof artifact. */
  evaluate?: LurkNativeProofFunction;
  /** Common alternate export name for proof-generation bindings. */
  prove?: LurkNativeProofFunction;
  /** Policy-oriented binding some local wrappers expose. */
  proveObligationDischarge?: LurkNativeProofFunction;
  /** Verify a previously-generated proof artifact directly. */
  verifyProof?: (artifact: ZKProofArtifact) => Promise<boolean> | boolean;
  /** Verify a previously-generated proof. */
  verify?: LurkNativeVerifyFunction;
  /** Optional verifying key material exported by the binding. */
  vk?: unknown;
  verificationKey?: unknown;
}

export type LurkWasmModuleImporter = (specifier: string) => Promise<unknown>;

export interface LurkWasmBridgeCreateOptions {
  readonly nativeLurk?: unknown;
  readonly packageName?: string;
  readonly importer?: LurkWasmModuleImporter;
  readonly strict?: boolean;
}

export class LurkWasmBridge {
  private readonly translator = new DeonticToLurkTranslator();
  private readonly nativeLurk?: LurkWasmModule;

  /** True when a native Lurk WASM module has been injected. */
  static nativeAvailable = false;

  private constructor(nativeLurk?: LurkWasmModule) {
    this.nativeLurk = nativeLurk;
    LurkWasmBridge.nativeAvailable = Boolean(nativeLurk);
  }

  /**
   * Create a `LurkWasmBridge`.
   *
   * @param nativeLurk  Optional native Lurk WASM module or create options.
   *                    When omitted the bridge tries `import('lurk-wasm')`
   *                    and then operates in stub mode if absent.
   */
  static async create(nativeLurk?: unknown): Promise<LurkWasmBridge> {
    const options: LurkWasmBridgeCreateOptions = isCreateOptions(nativeLurk)
      ? nativeLurk
      : { nativeLurk };

    const injected = normalizeLurkWasmModule(options.nativeLurk);
    if (injected) return new LurkWasmBridge(injected);

    try {
      return new LurkWasmBridge(await loadLurkPackage(
        options.packageName ?? DEFAULT_LURK_WASM_PACKAGE,
        options.importer,
      ));
    } catch (err) {
      if (options.strict) throw err;
      // Package not available — operate in stub mode.
    }
    return new LurkWasmBridge(undefined);
  }

  /** True when this bridge has a native Lurk WASM binding. */
  isAvailable(): boolean { return Boolean(this.nativeLurk); }

  /**
   * Generate a ZK proof of obligation discharge for `policy`.
   *
   * In stub mode (no native Lurk), returns `{ reason: 'unknown' }` so the
   * caller falls back to the remote Python TDFOL engine.
   */
  async proveObligationDischarge(
    policy: Policy,
    timeoutMs = 60_000,
  ): Promise<WasmProofResult & { artifact?: ZKProofArtifact }> {
    const start = Date.now();
    const lurkExpr = this.translator.policyObligationsToLurk(policy);

    if (!this.nativeLurk) {
      return {
        proved: false, sat: false, unsat: false,
        reason: 'unknown', prover_id: 'lurk-wasm',
        proof_time_ms: Date.now() - start,
        meta: {
          unavailable: 'lurk-wasm package is not installed or configured',
          lurk_expr: lurkExpr,
          note: 'Inject a LurkWasmModule via LurkWasmBridge.create(module) when available.',
        },
      };
    }

    // Native path.
    try {
      const evaluation = await this.invokeNativeProver(lurkExpr, policy, timeoutMs);
      const status = interpretLurkResult(evaluation.result);
      const proofB64 = typeof evaluation.proof_b64 === 'string'
        ? normalizeBase64Url(evaluation.proof_b64)
        : proofToBase64Url(evaluation.proof ?? evaluation.proof_bytes ?? evaluation);
      const publicInputs = Array.isArray(evaluation.public_inputs)
        ? evaluation.public_inputs
        : [policy.id, policy.version ?? ''];
      const artifactBase: Omit<ZKProofArtifact, 'artifact_cid'> = {
        backend: evaluation.backend ?? 'lurk',
        statement: `Obligation discharge for policy ${policy.id}`,
        proof_b64: proofB64,
        vk_cid: normalizeCid(evaluation.vk_cid) ??
          cidFor(evaluation.vk ?? evaluation.verifying_key ?? this.nativeLurk.vk ?? this.nativeLurk.verificationKey ?? 'lurk-default-vk'),
        public_inputs: publicInputs,
        proof_time_ms: Date.now() - start,
        lurk_expr: lurkExpr,
      };
      const artifact: ZKProofArtifact = {
        ...artifactBase,
        artifact_cid: computeZKProofArtifactCid(artifactBase),
      };
      return {
        proved: status === 'proved',
        sat: status === 'proved',
        unsat: status === 'refuted',
        reason: status,
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

  /** Verify a `ZKProofArtifact` with the native Lurk verifier when available. */
  async verifyProof(artifact: ZKProofArtifact): Promise<boolean> {
    if (!this.nativeLurk) return false;
    if (artifact.artifact_cid !== computeZKProofArtifactCid(artifact)) return false;

    try {
      if (typeof this.nativeLurk.verifyProof === 'function') {
        return Boolean(await this.nativeLurk.verifyProof(artifact));
      }
      if (typeof this.nativeLurk.verify === 'function') {
        return Boolean(await this.nativeLurk.verify(
          artifact.proof_b64,
          artifact.vk_cid,
          artifact.public_inputs,
          artifact,
        ));
      }
    } catch {
      return false;
    }
    return false;
  }

  private async invokeNativeProver(
    lurkExpr: string,
    policy: Policy,
    timeoutMs: number,
  ): Promise<LurkEvaluationResult> {
    const options = { policy, timeoutMs, lurkExpr };
    const prover =
      this.nativeLurk?.proveObligationDischarge ??
      this.nativeLurk?.prove ??
      this.nativeLurk?.evaluate;
    if (!prover) throw new Error('Lurk WASM module does not expose evaluate(), prove(), or proveObligationDischarge()');
    return normalizeEvaluationResult(await prover(lurkExpr, options));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lurkAtom(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-]/g, '-').toLowerCase().slice(0, 40) || 'any';
}

export function computeZKProofArtifactCid(artifact: Omit<ZKProofArtifact, 'artifact_cid'> | ZKProofArtifact): string {
  const { artifact_cid: _artifactCid, ...payload } = artifact as ZKProofArtifact;
  return cidFor(payload);
}

export async function loadLurkPackage(
  packageName = DEFAULT_LURK_WASM_PACKAGE,
  importer: LurkWasmModuleImporter = defaultLurkWasmImporter,
): Promise<LurkWasmModule> {
  const mod = await importer(packageName);
  const normalized = normalizeLurkWasmModule(mod);
  if (!normalized) {
    throw new Error(
      `loadLurkPackage: '${packageName}' does not expose evaluate(), prove(), or proveObligationDischarge().`,
    );
  }
  return normalized;
}

export async function defaultLurkWasmImporter(specifier: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ specifier);
}

export function normalizeLurkWasmModule(mod: unknown): LurkWasmModule | null {
  const record = unwrapDefaultExport(mod);
  if (!record) return null;
  const candidate = record as LurkWasmModule;
  if (
    typeof candidate.evaluate === 'function' ||
    typeof candidate.prove === 'function' ||
    typeof candidate.proveObligationDischarge === 'function'
  ) {
    return candidate;
  }
  return null;
}

function unwrapDefaultExport(mod: unknown): Record<string, unknown> | null {
  if (!mod || typeof mod !== 'object') return null;
  const record = mod as Record<string, unknown>;
  if (record['default'] && typeof record['default'] === 'object') {
    return record['default'] as Record<string, unknown>;
  }
  return record;
}

function normalizeEvaluationResult(result: unknown): LurkEvaluationResult {
  if (Array.isArray(result)) {
    return { result: result[0], proof: result[1], public_inputs: result.slice(2) };
  }
  if (result && typeof result === 'object') return result as LurkEvaluationResult;
  return { result, proof: String(result ?? '') };
}

function interpretLurkResult(result: unknown): 'proved' | 'refuted' | 'unknown' {
  if (result === true || result === 1) return 'proved';
  const text = String(result ?? '').trim().toLowerCase();
  if (['t', 'true', 'proved', 'ok', 'success'].includes(text)) return 'proved';
  if (result === false || result === 0 || ['nil', 'false', 'refuted', 'failed'].includes(text)) return 'refuted';
  return 'unknown';
}

function proofToBase64Url(proof: unknown): string {
  if (typeof proof === 'string') return bufferToBase64Url(Buffer.from(proof, 'utf8'));
  if (proof instanceof Uint8Array) return bufferToBase64Url(Buffer.from(proof));
  if (proof instanceof ArrayBuffer) return bufferToBase64Url(Buffer.from(proof));
  if (Array.isArray(proof) && proof.every(item => typeof item === 'number')) {
    return bufferToBase64Url(Buffer.from(proof as number[]));
  }
  return bufferToBase64Url(Buffer.from(stableJson(proof), 'utf8'));
}

function bufferToBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeBase64Url(value: string): string {
  return value.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeCid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^sha256:[0-9a-f]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

function cidFor(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortForStableJson((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  return value;
}

function isCreateOptions(value: unknown): value is LurkWasmBridgeCreateOptions {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (
      'nativeLurk' in value ||
      'packageName' in value ||
      'importer' in value ||
      'strict' in value
    ),
  );
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
  // The generated module must expose evaluate(), prove(), or proveObligationDischarge().
  const { isAbsolute, resolve } = require('node:path') as typeof import('node:path');
  const specifier = isAbsolute(lurkJsBindingPath) ? lurkJsBindingPath : resolve(process.cwd(), lurkJsBindingPath);
  return loadLurkPackage(specifier, defaultLurkWasmImporter);
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

/**
 * MultiStarkBridge — host-safe adapter for multi-circuit STARK proof packages.
 *
 * The upstream `argumentcomputer/multi-stark` project is still a Rust crate, so
 * this bridge keeps SwissKnife ready for a local/registry WASM binding without
 * vendoring that toolchain. In stub mode it returns no artifacts. With an
 * injected native module it proves each policy obligation as part of a
 * multi-circuit batch and emits content-addressed `ZKProofArtifact` records.
 */

import type { Policy, Obligation } from '../mcp-policy.js';
import {
  computeZKProofArtifactCid,
  type ZKProofArtifact,
} from './lurk-wasm-bridge.js';
import { base64UrlEncode, sha256Hex } from './browser-crypto.js';

const DEFAULT_MULTI_STARK_PACKAGE = 'multi-stark-wasm';

export interface MultiStarkCircuitInput {
  readonly circuit_id: string;
  readonly policy_id: string;
  readonly policy_version: string;
  readonly obligation_index: number;
  readonly statement: string;
  readonly required_cap: string;
  readonly resource: string;
}

export interface MultiStarkNativeProof {
  readonly proof?: unknown;
  readonly proof_b64?: string;
  readonly proof_bytes?: unknown;
  readonly public_inputs?: unknown[];
  readonly vk?: unknown;
  readonly vk_cid?: string;
  readonly backend?: ZKProofArtifact['backend'];
}

export type MultiStarkProofBatch =
  | MultiStarkNativeProof
  | MultiStarkNativeProof[]
  | { proofs?: MultiStarkNativeProof[]; proof?: unknown; proof_b64?: string; public_inputs?: unknown[] };

export type MultiStarkNativeProveFunction = (
  inputs: MultiStarkCircuitInput[],
  options?: { policy: Policy; timeoutMs: number },
) => Promise<MultiStarkProofBatch> | MultiStarkProofBatch;

export type MultiStarkNativeVerifyFunction = (
  proofB64: string,
  vkCid: string,
  publicInputs: unknown[],
  artifact: ZKProofArtifact,
) => Promise<boolean> | boolean;

export interface MultiStarkWasmModule {
  proveMultipleObligations?: MultiStarkNativeProveFunction;
  proveMultiple?: MultiStarkNativeProveFunction;
  prove?: MultiStarkNativeProveFunction;
  verifyProof?: (artifact: ZKProofArtifact) => Promise<boolean> | boolean;
  verifyBatch?: (artifacts: ZKProofArtifact[]) => Promise<boolean> | boolean;
  verify?: MultiStarkNativeVerifyFunction;
  vk?: unknown;
  verificationKey?: unknown;
}

export type MultiStarkModuleImporter = (specifier: string) => Promise<unknown>;

export interface MultiStarkBridgeCreateOptions {
  readonly nativeModule?: unknown;
  readonly packageName?: string;
  readonly importer?: MultiStarkModuleImporter;
  readonly strict?: boolean;
}

export class MultiStarkBridge {
  static nativeAvailable = false;

  private constructor(private readonly nativeModule?: MultiStarkWasmModule) {
    MultiStarkBridge.nativeAvailable = Boolean(nativeModule);
  }

  static async create(nativeOrOptions?: unknown): Promise<MultiStarkBridge> {
    const options: MultiStarkBridgeCreateOptions = isCreateOptions(nativeOrOptions)
      ? nativeOrOptions
      : { nativeModule: nativeOrOptions };

    const injected = normalizeMultiStarkModule(options.nativeModule);
    if (injected) return new MultiStarkBridge(injected);

    try {
      return new MultiStarkBridge(await loadMultiStarkPackage(
        options.packageName ?? DEFAULT_MULTI_STARK_PACKAGE,
        options.importer,
      ));
    } catch (err) {
      if (options.strict) throw err;
    }
    return new MultiStarkBridge(undefined);
  }

  isAvailable(): boolean { return Boolean(this.nativeModule); }

  async proveMultipleObligations(policy: Policy, timeoutMs = 120_000): Promise<ZKProofArtifact[]> {
    const inputs = policyObligationsToMultiStarkInputs(policy);
    if (inputs.length === 0 || !this.nativeModule) return [];

    const started = Date.now();
    const prover =
      this.nativeModule.proveMultipleObligations ??
      this.nativeModule.proveMultiple ??
      this.nativeModule.prove;
    if (!prover) return [];

    const batch = normalizeProofBatch(await prover(inputs, { policy, timeoutMs }), inputs.length);
    const elapsed = Date.now() - started;

    return inputs.map((input, index) => this.artifactFromProof(
      batch[index] ?? batch[0] ?? {},
      input,
      elapsed,
    ));
  }

  async verifyProof(artifact: ZKProofArtifact): Promise<boolean> {
    if (!this.nativeModule) return false;
    if (artifact.artifact_cid !== computeZKProofArtifactCid(artifact)) return false;

    try {
      if (typeof this.nativeModule.verifyProof === 'function') {
        return Boolean(await this.nativeModule.verifyProof(artifact));
      }
      if (typeof this.nativeModule.verify === 'function') {
        return Boolean(await this.nativeModule.verify(
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

  async verifyProofs(artifacts: ZKProofArtifact[]): Promise<boolean> {
    if (!this.nativeModule) return false;
    if (artifacts.some(artifact => artifact.artifact_cid !== computeZKProofArtifactCid(artifact))) return false;

    try {
      if (typeof this.nativeModule.verifyBatch === 'function') {
        return Boolean(await this.nativeModule.verifyBatch(artifacts));
      }
      const checks = await Promise.all(artifacts.map(artifact => this.verifyProof(artifact)));
      return checks.every(Boolean);
    } catch {
      return false;
    }
  }

  private artifactFromProof(
    proof: MultiStarkNativeProof,
    input: MultiStarkCircuitInput,
    proofTimeMs: number,
  ): ZKProofArtifact {
    const base: Omit<ZKProofArtifact, 'artifact_cid'> = {
      backend: proof.backend ?? 'plonky3',
      statement: input.statement,
      proof_b64: typeof proof.proof_b64 === 'string'
        ? normalizeBase64Url(proof.proof_b64)
        : proofToBase64Url(proof.proof ?? proof.proof_bytes ?? proof),
      vk_cid: normalizeCid(proof.vk_cid) ??
        cidFor(proof.vk ?? this.nativeModule?.vk ?? this.nativeModule?.verificationKey ?? 'multi-stark-default-vk'),
      public_inputs: Array.isArray(proof.public_inputs)
        ? proof.public_inputs
        : [input.policy_id, input.policy_version, input.obligation_index, input.required_cap, input.resource],
      proof_time_ms: proofTimeMs,
      lurk_expr: input.circuit_id,
    };
    return { ...base, artifact_cid: computeZKProofArtifactCid(base) };
  }
}

export function policyObligationsToMultiStarkInputs(policy: Policy): MultiStarkCircuitInput[] {
  return (policy.obligations ?? []).map((obligation, index) =>
    obligationToCircuitInput(policy, obligation, index),
  );
}

export function obligationToCircuitInput(
  policy: Policy,
  obligation: Obligation,
  index: number,
): MultiStarkCircuitInput {
  const requiredCap = obligation.requiredCap ?? obligation.description;
  const resource = obligation.rsc ?? '*';
  return {
    circuit_id: `mcp-obligation-${index}`,
    policy_id: policy.id,
    policy_version: policy.version,
    obligation_index: index,
    statement: `Multi-STARK obligation ${index + 1} for policy ${policy.id}: ${obligation.description}`,
    required_cap: requiredCap,
    resource,
  };
}

export async function loadMultiStarkPackage(
  packageName = DEFAULT_MULTI_STARK_PACKAGE,
  importer: MultiStarkModuleImporter = defaultMultiStarkImporter,
): Promise<MultiStarkWasmModule> {
  const mod = await importer(packageName);
  const normalized = normalizeMultiStarkModule(mod);
  if (!normalized) {
    throw new Error(
      `loadMultiStarkPackage: '${packageName}' does not expose proveMultipleObligations(), proveMultiple(), or prove().`,
    );
  }
  return normalized;
}

export async function defaultMultiStarkImporter(specifier: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ specifier);
}

export function normalizeMultiStarkModule(mod: unknown): MultiStarkWasmModule | null {
  const record = unwrapDefaultExport(mod);
  if (!record) return null;
  const candidate = record as MultiStarkWasmModule;
  if (
    typeof candidate.proveMultipleObligations === 'function' ||
    typeof candidate.proveMultiple === 'function' ||
    typeof candidate.prove === 'function'
  ) {
    return candidate;
  }
  return null;
}

export function multiStarkBuildInstructions(): string {
  return [
    '# Build argumentcomputer/multi-stark locally and expose a Node binding:',
    'git clone https://github.com/argumentcomputer/multi-stark',
    'cd multi-stark',
    'cargo build --release',
    '# When a WASM binding is available, export proveMultiple()/verifyBatch()',
    '# and load it with MultiStarkBridge.create({ packageName: "multi-stark-wasm" }).',
  ].join('\n');
}

function normalizeProofBatch(batch: MultiStarkProofBatch, expected: number): MultiStarkNativeProof[] {
  if (Array.isArray(batch)) return batch;
  if ('proofs' in batch && Array.isArray(batch.proofs)) return batch.proofs;
  return Array.from({ length: expected }, () => batch as MultiStarkNativeProof);
}

function unwrapDefaultExport(mod: unknown): Record<string, unknown> | null {
  if (!mod || typeof mod !== 'object') return null;
  const record = mod as Record<string, unknown>;
  if (record['default'] && typeof record['default'] === 'object') {
    return record['default'] as Record<string, unknown>;
  }
  return record;
}

function proofToBase64Url(proof: unknown): string {
  if (typeof proof === 'string') return base64UrlEncode(proof);
  if (proof instanceof Uint8Array) return base64UrlEncode(proof);
  if (proof instanceof ArrayBuffer) return base64UrlEncode(proof);
  if (Array.isArray(proof) && proof.every(item => typeof item === 'number')) {
    return base64UrlEncode(proof as number[]);
  }
  return base64UrlEncode(stableJson(proof));
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
  return `sha256:${sha256Hex(stableJson(value))}`;
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

function isCreateOptions(value: unknown): value is MultiStarkBridgeCreateOptions {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (
      'nativeModule' in value ||
      'packageName' in value ||
      'importer' in value ||
      'strict' in value
    ),
  );
}

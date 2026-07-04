/**
 * Proof cache keys and public IPFS payloads for ProveKit proofs.
 *
 * TypeScript port of ipfs_datasets_py/logic/zkp/provekit/cache.py.
 */

import { createHash } from 'node:crypto';

export const PROVEKIT_CACHE_KEY_SCHEMA = 'provekit-cache-key-v1';
export const PROVEKIT_IPFS_PAYLOAD_SCHEMA = 'provekit-ipfs-payload-v1';

const PRIVATE_ARTIFACT_KEYS = new Set([
  'prover_key_path',
  'pkp_path',
  'input_path',
  'prover_toml_path',
  'cwd',
  'package_dir',
]);

export interface BuildProveKitProofCacheKeyOptions {
  backendId: string;
  circuitRef: string;
  hashBackend: string;
  verifierKeySha256: string;
  provekitCommit: string;
  rulesetId: string;
}

export interface BuildProveKitIpfsPayloadOptions {
  verifierKeyRef?: string;
  manifestSha256?: string;
  proofSystem?: string;
}

export function buildProveKitProofCacheKey(options: BuildProveKitProofCacheKeyOptions): string {
  validateNonEmpty('backend_id', options.backendId);
  validateNonEmpty('circuit_ref', options.circuitRef);
  validateNonEmpty('hash_backend', options.hashBackend);
  validateSha256Hex('verifier_key_sha256', options.verifierKeySha256);
  validateNonEmpty('provekit_commit', options.provekitCommit);
  validateNonEmpty('ruleset_id', options.rulesetId);

  return sha256Hex(canonicalJson({
    schema: PROVEKIT_CACHE_KEY_SCHEMA,
    backend_id: options.backendId,
    circuit_ref: options.circuitRef,
    hash_backend: options.hashBackend,
    verifier_key_sha256: options.verifierKeySha256,
    provekit_commit: options.provekitCommit,
    ruleset_id: options.rulesetId,
  }));
}

export function buildProveKitProofCacheKeyFromProof(
  proofPublicInputs: Record<string, unknown>,
  proofMetadata: Record<string, unknown>,
  options: { verifierKeySha256: string; provekitCommit?: string | null },
): string {
  const provekit = isRecord(proofMetadata.provekit) ? proofMetadata.provekit : {};
  const backendId = String(proofMetadata.backend ?? 'provekit');
  const circuitRef = String(proofPublicInputs.circuit_ref ?? proofPublicInputs.circuitRef ?? '');
  const hashBackend = String(
    proofMetadata.hash_backend ??
    provekit.hash_backend ??
    'sha256',
  );
  const rulesetId = String(proofPublicInputs.ruleset_id ?? proofPublicInputs.rulesetId ?? '');
  const provekitCommit = String(
    options.provekitCommit ??
    provekit.provekit_commit ??
    proofMetadata.provekit_commit ??
    '',
  );

  return buildProveKitProofCacheKey({
    backendId,
    circuitRef,
    hashBackend,
    verifierKeySha256: options.verifierKeySha256,
    provekitCommit,
    rulesetId,
  });
}

export function buildProveKitIpfsPayload(
  proofPublicInputs: Record<string, unknown>,
  proofMetadata: Record<string, unknown>,
  proofData: Buffer | Uint8Array | string,
  options: BuildProveKitIpfsPayloadOptions = {},
): Record<string, unknown> {
  const provekit = isRecord(proofMetadata.provekit) ? proofMetadata.provekit : {};
  const attestationView = isRecord(proofMetadata.attestation_view) ? proofMetadata.attestation_view : {};
  const artifacts = isRecord(provekit.artifacts) ? provekit.artifacts : {};
  const provekitArtifacts = isRecord(proofMetadata.provekit_artifacts) ? proofMetadata.provekit_artifacts : {};
  const publicArtifactRefs: Record<string, string> = {};

  for (const key of ['verifier_key_path', 'pkv_path', 'proof_path', 'proof_output_path', 'program_dir']) {
    const value = artifacts[key] ?? provekitArtifacts[key];
    if (value) publicArtifactRefs[key] = String(value);
  }
  if (options.verifierKeyRef) {
    publicArtifactRefs.verifier_key_ref = options.verifierKeyRef;
  }

  const bytes = proofDataToBuffer(proofData);
  const payload: Record<string, unknown> = {
    schema: PROVEKIT_IPFS_PAYLOAD_SCHEMA,
    backend_id: String(proofMetadata.backend ?? 'provekit'),
    proof_system: options.proofSystem ?? 'ProveKit-WHIR',
    proof_data_b64: bytes.toString('base64'),
    proof_size_bytes: bytes.length,
    public_inputs: { ...(proofPublicInputs ?? {}) },
    attestation_view: { ...attestationView },
    public_artifact_refs: publicArtifactRefs,
  };
  if (options.manifestSha256) payload.manifest_sha256 = options.manifestSha256;
  if (provekit.public_input_schema) payload.public_input_schema = provekit.public_input_schema;
  if (provekit.public_input_hash) payload.public_input_hash = provekit.public_input_hash;
  return payload;
}

export function provekitIpfsPayloadIsPublicOnly(payload: Record<string, unknown>): boolean {
  return !containsPrivateArtifactKey(payload);
}

export const build_provekit_proof_cache_key = buildProveKitProofCacheKey;
export const build_provekit_proof_cache_key_from_proof = buildProveKitProofCacheKeyFromProof;
export const build_provekit_ipfs_payload = buildProveKitIpfsPayload;
export const provekit_ipfs_payload_is_public_only = provekitIpfsPayloadIsPublicOnly;

function validateNonEmpty(name: string, value: unknown): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string, got ${String(value)}`);
  }
}

function validateSha256Hex(name: string, value: unknown): void {
  if (typeof value !== 'string' || value.length !== 64) {
    throw new Error(`${name} must be a 64-character lowercase hex string`);
  }
  if (value.toLowerCase() !== value || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be valid lowercase hex`);
  }
}

function proofDataToBuffer(value: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), 'utf8');
}

function containsPrivateArtifactKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsPrivateArtifactKey);
  const record = value as Record<string, unknown>;
  return Object.entries(record).some(([key, nested]) => (
    PRIVATE_ARTIFACT_KEYS.has(key) || containsPrivateArtifactKey(nested)
  ));
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

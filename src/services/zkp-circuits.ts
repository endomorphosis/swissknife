/**
 * zkp-circuits.ts
 *
 * ZKP circuit utilities for proof attestation views.
 * TypeScript port of ipfs_datasets_py/logic/zkp/circuits.py
 *
 * Provides:
 *   ProofLayout               — decoded proof byte layout
 *   AttestationView           — deterministic proof attestation view
 *   decodeSimulatedProofLayout() — decode SIMZKP/1 byte layout
 *   buildProofAttestationView()  — build attestation view from proof + inputs
 *   attestationViewMatchesProof() — verify attestation matches proof bytes
 *   compilerGuidanceRefFromMetadata() — extract compiler guidance ref
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// SIMZKP/1 layout constants (mirrors Python)
// ---------------------------------------------------------------------------

const SIMZKP_MAGIC = Buffer.from('SIMZKP/1', 'ascii');
const SIMZKP_PROOF_LENGTH = 256; // bytes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesFromProofData(proofData: unknown): Buffer {
  if (Buffer.isBuffer(proofData)) return proofData;
  if (proofData instanceof Uint8Array) return Buffer.from(proofData);
  if (typeof proofData === 'string') {
    const stripped = proofData.trim();
    const hex = stripped.startsWith('0x') || stripped.startsWith('0X')
      ? stripped.slice(2) : stripped;
    if (hex && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      try { return Buffer.from(hex, 'hex'); } catch { /* fallthrough */ }
    }
    return Buffer.from(stripped, 'utf8');
  }
  if (proofData == null) return Buffer.alloc(0);
  return Buffer.from(String(proofData), 'utf8');
}

function mappingDict(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function nonNegativeInt(value: unknown): number {
  const n = Number(value);
  return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function formatCircuitRef(circuitId: string, version: number): string {
  return version > 0 ? `${circuitId}:v${version}` : circuitId;
}

function resolveCircuitIdentity(publicInputs: Record<string, unknown>): [string, number] {
  const circuitId = String(publicInputs['circuit_id'] ?? publicInputs['circuit'] ?? 'simulated').trim();
  const version = nonNegativeInt(publicInputs['circuit_version'] ?? publicInputs['version'] ?? 0);
  return [circuitId || 'simulated', version];
}

function canonicalPublicInputs(publicInputs: Record<string, unknown>): [Record<string, unknown>, string] {
  const canonical: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(publicInputs).sort()) {
    if (v !== undefined && v !== null) canonical[k] = v;
  }
  const commitment = createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');
  return [canonical, commitment];
}

// ---------------------------------------------------------------------------
// ProofLayout
// ---------------------------------------------------------------------------

export interface ProofLayout {
  byteLength: number;
  format: 'simzkp1' | 'opaque';
  valid: boolean;
  proofDigest?: string;
  proofType?: string;
  circuitVersion?: number;
}

// ---------------------------------------------------------------------------
// AttestationView
// ---------------------------------------------------------------------------

export interface AttestationView {
  attestationRef: string;
  proofDigest: string;
  circuitRef: string;
  theoremHash: string;
  axiomsCommitment: string;
  rulesetId: string;
  publicInputsCommitment: string;
  compilerGuidanceRef?: string;
  compilerGuidanceVersion?: number;
  layout: ProofLayout;
  canonicalPublicInputs: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// decodeSimulatedProofLayout
// ---------------------------------------------------------------------------

/**
 * Decode the fixed SIMZKP/1 byte layout when present.
 * Returns `{ valid: false }` for unknown or non-simulated proofs.
 */
export function decodeSimulatedProofLayout(proofData: unknown): ProofLayout {
  const raw = bytesFromProofData(proofData);
  const base: ProofLayout = { byteLength: raw.length, format: 'opaque', valid: false };

  if (raw.length !== SIMZKP_PROOF_LENGTH) return base;
  if (!raw.slice(0, 8).equals(SIMZKP_MAGIC)) return base;

  const proofHash = raw.slice(8, 40);
  const circuitVersion = raw.readUInt32BE(40);

  return {
    byteLength: raw.length,
    format: 'simzkp1',
    valid: true,
    proofDigest: proofHash.toString('hex'),
    proofType: 'simulated',
    circuitVersion,
  };
}

// ---------------------------------------------------------------------------
// compilerGuidanceRefFromMetadata
// ---------------------------------------------------------------------------

export function compilerGuidanceRefFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return '';
  const ref = metadata['compiler_guidance_ref'];
  if (ref) return String(ref);
  const cid = metadata['cid'] ?? metadata['document_cid'] ?? metadata['source_cid'];
  if (cid) return String(cid);
  return '';
}

// ---------------------------------------------------------------------------
// buildProofAttestationView
// ---------------------------------------------------------------------------

/**
 * Build a deterministic proof-attestation view from proof components.
 */
export function buildProofAttestationView(opts: {
  proofData: unknown;
  publicInputs: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}): AttestationView {
  const { proofData, publicInputs, metadata } = opts;
  const metaDict = mappingDict(metadata);
  const proofBytes = bytesFromProofData(proofData);
  const layout = decodeSimulatedProofLayout(proofBytes);

  const [circuitId, circuitVersion] = resolveCircuitIdentity(publicInputs);
  const circuitRef = formatCircuitRef(circuitId, circuitVersion);

  const theoremHash = String(publicInputs['theorem_hash'] ?? '');
  const axiomsCommitment = String(publicInputs['axioms_commitment'] ?? '');
  const rulesetId = String(publicInputs['ruleset_id'] ?? '');

  const cgRef = String(
    publicInputs['compiler_guidance_ref'] ??
    metaDict['compiler_guidance_ref'] ??
    compilerGuidanceRefFromMetadata(metaDict) ??
    ''
  );
  const cgVersion = nonNegativeInt(
    publicInputs['compiler_guidance_version'] ?? metaDict['compiler_guidance_version'] ?? 0
  );

  const proofDigest = createHash('sha256').update(proofBytes).digest('hex');
  const [canonical, publicInputsCommitment] = canonicalPublicInputs(publicInputs);

  const attestationBasis: Record<string, unknown> = {
    axioms_commitment: axiomsCommitment,
    circuit_ref: circuitRef,
    proof_digest: proofDigest,
    ruleset_id: rulesetId,
    theorem_hash: theoremHash,
  };
  if (cgRef) {
    attestationBasis['compiler_guidance_ref'] = cgRef;
    attestationBasis['compiler_guidance_version'] = cgVersion;
  }

  const attestationRef = createHash('sha256')
    .update(JSON.stringify(attestationBasis, Object.keys(attestationBasis).sort()), 'utf8')
    .digest('hex');

  const view: AttestationView = {
    attestationRef,
    proofDigest,
    circuitRef,
    theoremHash,
    axiomsCommitment,
    rulesetId,
    publicInputsCommitment,
    layout,
    canonicalPublicInputs: canonical,
  };
  if (cgRef) {
    view.compilerGuidanceRef = cgRef;
    view.compilerGuidanceVersion = cgVersion;
  }
  return view;
}

// ---------------------------------------------------------------------------
// attestationViewMatchesProof
// ---------------------------------------------------------------------------

/**
 * Return true when the attestation view's public fields match the given proof bytes.
 */
export function attestationViewMatchesProof(opts: {
  proofData: unknown;
  publicInputs: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  attestationView?: Record<string, unknown> | null;
}): boolean {
  try {
    const { proofData, publicInputs, metadata, attestationView } = opts;
    const pubDict = mappingDict(publicInputs);
    if (Object.keys(pubDict).length === 0) return false;

    const embedded = mappingDict(attestationView);
    const fresh = buildProofAttestationView({ proofData, publicInputs: pubDict, metadata });

    const refMatch = !embedded['attestation_ref'] ||
      embedded['attestation_ref'] === fresh.attestationRef;
    const digestMatch = !embedded['proof_digest'] ||
      embedded['proof_digest'] === fresh.proofDigest;

    return refMatch && digestMatch;
  } catch {
    return false;
  }
}

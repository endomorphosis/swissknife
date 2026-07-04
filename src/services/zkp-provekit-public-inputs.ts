/**
 * Public-input mapping for ProveKit-backed ZKP circuits.
 *
 * TypeScript port of ipfs_datasets_py/logic/zkp/provekit/public_inputs.py.
 */

import { createHash } from 'node:crypto';

import {
  buildProofAttestationView,
  compilerGuidanceRefFromMetadata,
} from './zkp-circuits.js';
import {
  formatCircuitRef,
  parseCircuitRefLenient,
} from './zkp-statement.js';

export const PROVEKIT_PUBLIC_INPUT_SCHEMA_VERSION = 'provekit-public-inputs-v1';
export const DEFAULT_PROVEKIT_CIRCUIT_ID = 'provekit_knowledge_of_axioms';
export const DEFAULT_PROVEKIT_CIRCUIT_VERSION = 1;
export const DEFAULT_PROVEKIT_RULESET_ID = 'TDFOL_v1';
export const DEFAULT_PROVEKIT_HASH_BACKEND = 'sha256';

const P_BN254 = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const HEX_32_BYTES_LENGTH = 64;
const U64_MAX = (1n << 64n) - 1n;

export interface ProveKitPublicInputRecordInput {
  theorem: string;
  theoremHash: string;
  axiomsCommitment: string;
  circuitRef: string;
  circuitVersion: number;
  rulesetId: string;
  hashBackend?: string;
  compilerGuidanceRef?: string;
  compilerGuidanceVersion?: number;
  attestationRef?: string;
  attestationViewVersion?: number;
  schemaVersion?: string;
}

export interface BuildProveKitPublicInputRecordOptions {
  theorem: string;
  privateAxioms?: string[];
  axiomsCommitment?: string;
  circuitId?: string;
  circuitRef?: string;
  circuitVersion?: number;
  rulesetId?: string;
  metadata?: Record<string, unknown> | null;
  hashBackend?: string;
}

export class ProveKitPublicInputRecord {
  readonly theorem: string;
  readonly theoremHash: string;
  readonly axiomsCommitment: string;
  readonly circuitRef: string;
  readonly circuitVersion: number;
  readonly rulesetId: string;
  readonly hashBackend: string;
  readonly compilerGuidanceRef: string;
  readonly compilerGuidanceVersion: number;
  readonly attestationRef: string;
  readonly attestationViewVersion: number;
  readonly schemaVersion: string;

  constructor(input: ProveKitPublicInputRecordInput) {
    this.theorem = input.theorem;
    this.theoremHash = input.theoremHash;
    this.axiomsCommitment = input.axiomsCommitment;
    this.circuitVersion = input.circuitVersion;
    this.rulesetId = input.rulesetId;
    this.hashBackend = input.hashBackend ?? DEFAULT_PROVEKIT_HASH_BACKEND;
    this.compilerGuidanceRef = input.compilerGuidanceRef ?? '';
    this.compilerGuidanceVersion = input.compilerGuidanceVersion ?? 0;
    this.attestationRef = input.attestationRef ?? '';
    this.attestationViewVersion = input.attestationViewVersion ?? 0;
    this.schemaVersion = input.schemaVersion ?? PROVEKIT_PUBLIC_INPUT_SCHEMA_VERSION;

    if (!this.theorem) throw new Error('theorem must be a non-empty string');
    validateHex32Bytes('theorem_hash', this.theoremHash);
    validateHex32Bytes('axioms_commitment', this.axiomsCommitment);
    validateNonNegativeU64('circuit_version', this.circuitVersion);
    if (!this.rulesetId) throw new Error('ruleset_id must be a non-empty string');
    if (!this.hashBackend.trim()) throw new Error('hash_backend must be a non-empty string');

    const parsed = parseCircuitRefLenient(input.circuitRef, this.circuitVersion);
    if (parsed.version !== this.circuitVersion) {
      throw new Error('circuit_ref version must match circuit_version');
    }
    this.circuitRef = formatCircuitRef(parsed.circuitId, this.circuitVersion);

    if (this.compilerGuidanceRef) {
      validateHex32Bytes('compiler_guidance_ref', this.compilerGuidanceRef);
      validateNonNegativeU64('compiler_guidance_version', this.compilerGuidanceVersion);
    } else if (this.compilerGuidanceVersion) {
      throw new Error('compiler_guidance_version requires compiler_guidance_ref');
    }

    if (this.attestationRef) {
      validateHex32Bytes('attestation_ref', this.attestationRef);
      validateNonNegativeU64('attestation_view_version', this.attestationViewVersion);
    } else if (this.attestationViewVersion) {
      throw new Error('attestation_view_version requires attestation_ref');
    }
  }

  static fromZkpPublicInputs(
    publicInputs: Record<string, unknown>,
    options: { metadata?: Record<string, unknown> | null; hashBackend?: string } = {},
  ): ProveKitPublicInputRecord {
    const metadata = options.metadata ?? {};
    const theorem = String(publicInputs.theorem ?? '');
    const circuitVersion = coerceNonNegativeInt(
      publicInputs.circuit_version ?? publicInputs.circuitVersion,
      DEFAULT_PROVEKIT_CIRCUIT_VERSION,
    );
    const circuitRef = canonicalCircuitRef({
      circuitRef: String(publicInputs.circuit_ref ?? publicInputs.circuitRef ?? DEFAULT_PROVEKIT_CIRCUIT_ID),
      circuitId: DEFAULT_PROVEKIT_CIRCUIT_ID,
      circuitVersion,
    });
    const guidanceRef = String(
      publicInputs.compiler_guidance_ref ??
      publicInputs.compilerGuidanceRef ??
      metadata.compiler_guidance_ref ??
      compilerGuidanceRefFromMetadata(metadata) ??
      '',
    );
    const guidanceVersion = coerceNonNegativeInt(
      publicInputs.compiler_guidance_version ?? metadata.compiler_guidance_version,
      guidanceRef ? 1 : 0,
    );
    return new ProveKitPublicInputRecord({
      theorem,
      theoremHash: String(publicInputs.theorem_hash ?? publicInputs.theoremHash ?? ''),
      axiomsCommitment: String(publicInputs.axioms_commitment ?? publicInputs.axiomsCommitment ?? ''),
      circuitRef,
      circuitVersion,
      rulesetId: String(publicInputs.ruleset_id ?? publicInputs.rulesetId ?? DEFAULT_PROVEKIT_RULESET_ID),
      hashBackend: options.hashBackend ?? String(metadata.hash_backend ?? DEFAULT_PROVEKIT_HASH_BACKEND),
      compilerGuidanceRef: guidanceRef,
      compilerGuidanceVersion: guidanceVersion,
      attestationRef: String(publicInputs.attestation_ref ?? ''),
      attestationViewVersion: coerceNonNegativeInt(publicInputs.attestation_view_version, 0),
    });
  }

  toZkpPublicInputs(options: { includeAttestation?: boolean } = {}): Record<string, unknown> {
    const includeAttestation = options.includeAttestation ?? true;
    const publicInputs: Record<string, unknown> = {
      theorem: this.theorem,
      theorem_hash: this.theoremHash,
      axioms_commitment: this.axiomsCommitment,
      circuit_ref: this.circuitRef,
      circuit_version: this.circuitVersion,
      ruleset_id: this.rulesetId,
    };
    if (this.compilerGuidanceRef) {
      publicInputs.compiler_guidance_ref = this.compilerGuidanceRef;
      publicInputs.compiler_guidance_version = this.compilerGuidanceVersion;
    }
    if (includeAttestation && this.attestationRef) {
      publicInputs.attestation_ref = this.attestationRef;
      publicInputs.attestation_view_version = this.attestationViewVersion;
    }
    return publicInputs;
  }

  toNoirFieldInputs(): Record<string, string | number> {
    return {
      theorem_hash_field: fieldElementFromHexDigest(this.theoremHash),
      axioms_commitment_field: fieldElementFromHexDigest(this.axiomsCommitment),
      circuit_version: this.circuitVersion,
      ruleset_id_field: fieldElementFromText(this.rulesetId),
      circuit_ref_field: fieldElementFromText(this.circuitRef),
      compiler_guidance_ref_field: this.compilerGuidanceRef
        ? fieldElementFromHexDigest(this.compilerGuidanceRef)
        : '0',
      compiler_guidance_version: this.compilerGuidanceVersion,
      hash_backend_field: fieldElementFromText(this.hashBackend),
    };
  }

  toProvekitInputs(): Record<string, unknown> {
    return {
      schema_version: this.schemaVersion,
      hash_backend: this.hashBackend,
      zkp_public_inputs: this.toZkpPublicInputs(),
      noir_field_inputs: this.toNoirFieldInputs(),
    };
  }

  toDict(): Record<string, unknown> {
    return {
      theorem: this.theorem,
      theorem_hash: this.theoremHash,
      axioms_commitment: this.axiomsCommitment,
      circuit_ref: this.circuitRef,
      circuit_version: this.circuitVersion,
      ruleset_id: this.rulesetId,
      hash_backend: this.hashBackend,
      compiler_guidance_ref: this.compilerGuidanceRef,
      compiler_guidance_version: this.compilerGuidanceVersion,
      attestation_ref: this.attestationRef,
      attestation_view_version: this.attestationViewVersion,
      schema_version: this.schemaVersion,
    };
  }

  canonicalJson(): string {
    return canonicalJson(this.toProvekitInputs());
  }

  canonicalHash(): string {
    return sha256Hex(this.canonicalJson());
  }

  withAttestation(options: {
    proofData: unknown;
    metadata?: Record<string, unknown> | null;
  }): ProveKitPublicInputRecord {
    const attestation = buildProofAttestationView({
      proofData: options.proofData,
      publicInputs: this.toZkpPublicInputs({ includeAttestation: false }),
      metadata: {
        ...(options.metadata ?? {}),
        hash_backend: this.hashBackend,
      },
    });
    return new ProveKitPublicInputRecord({
      ...this.toCamelInput(),
      attestationRef: attestation.attestationRef,
      attestationViewVersion: Number(attestation.layout.circuitVersion ?? 1),
    });
  }

  private toCamelInput(): ProveKitPublicInputRecordInput {
    return {
      theorem: this.theorem,
      theoremHash: this.theoremHash,
      axiomsCommitment: this.axiomsCommitment,
      circuitRef: this.circuitRef,
      circuitVersion: this.circuitVersion,
      rulesetId: this.rulesetId,
      hashBackend: this.hashBackend,
      compilerGuidanceRef: this.compilerGuidanceRef,
      compilerGuidanceVersion: this.compilerGuidanceVersion,
      attestationRef: this.attestationRef,
      attestationViewVersion: this.attestationViewVersion,
      schemaVersion: this.schemaVersion,
    };
  }
}

export function buildProveKitPublicInputRecord(
  options: BuildProveKitPublicInputRecordOptions,
): ProveKitPublicInputRecord {
  const circuitVersion = options.circuitVersion ?? DEFAULT_PROVEKIT_CIRCUIT_VERSION;
  const metadata = options.metadata ?? {};
  const guidanceRef = compilerGuidanceRefFromMetadata(metadata);
  const guidanceVersion = coerceNonNegativeInt(
    metadata.compiler_guidance_version,
    guidanceRef ? 1 : 0,
  );
  return new ProveKitPublicInputRecord({
    theorem: String(options.theorem),
    theoremHash: theoremHashHex(options.theorem),
    axiomsCommitment: options.axiomsCommitment ?? axiomsCommitmentHex(options.privateAxioms ?? []),
    circuitRef: canonicalCircuitRef({
      circuitRef: options.circuitRef,
      circuitId: options.circuitId ?? DEFAULT_PROVEKIT_CIRCUIT_ID,
      circuitVersion,
    }),
    circuitVersion,
    rulesetId: options.rulesetId ?? DEFAULT_PROVEKIT_RULESET_ID,
    hashBackend: options.hashBackend ?? DEFAULT_PROVEKIT_HASH_BACKEND,
    compilerGuidanceRef: guidanceRef,
    compilerGuidanceVersion: guidanceVersion,
  });
}

export function fieldElementFromHexDigest(value: string): string {
  validateHex32Bytes('hex_digest', value);
  return (BigInt(`0x${value}`) % P_BN254).toString();
}

export function fieldElementFromText(value: string): string {
  if (typeof value !== 'string') throw new TypeError('value must be a string');
  return (BigInt(`0x${sha256Hex(value)}`) % P_BN254).toString();
}

export const build_provekit_public_input_record = buildProveKitPublicInputRecord;
export const field_element_from_hex_digest = fieldElementFromHexDigest;
export const field_element_from_text = fieldElementFromText;

function canonicalCircuitRef(options: {
  circuitRef?: string;
  circuitId: string;
  circuitVersion: number;
}): string {
  validateNonNegativeU64('circuit_version', options.circuitVersion);
  const candidate = String(options.circuitRef ?? '').trim();
  const fallbackId = String(options.circuitId || DEFAULT_PROVEKIT_CIRCUIT_ID).trim();
  if (candidate) {
    const parsed = parseCircuitRefLenient(candidate, options.circuitVersion);
    return formatCircuitRef(parsed.circuitId, options.circuitVersion);
  }
  return formatCircuitRef(fallbackId, options.circuitVersion);
}

function theoremHashHex(theorem: string): string {
  return sha256Hex(normalizeText(theorem));
}

function axiomsCommitmentHex(axioms: string[]): string {
  const canonical = [...new Set(axioms.map(normalizeText))].sort();
  return sha256Hex(canonicalJson({ axioms: canonical, axiom_count: canonical.length }));
}

function normalizeText(text: string): string {
  return String(text).normalize('NFD').split(/\s+/).filter(Boolean).join(' ');
}

function validateHex32Bytes(name: string, value: unknown): void {
  if (typeof value !== 'string' || value.length !== HEX_32_BYTES_LENGTH) {
    throw new Error(`${name} must be a 32-byte lowercase hex string`);
  }
  if (!/^[0-9a-f]+$/.test(value)) throw new Error(`${name} must be a valid lowercase hex string`);
}

function validateNonNegativeU64(name: string, value: unknown): void {
  if (!Number.isInteger(value)) throw new TypeError(`${name} must be an int`);
  const asBigInt = BigInt(value as number);
  if (asBigInt < 0n || asBigInt > U64_MAX) throw new Error(`${name} must be in uint64 range`);
}

function coerceNonNegativeInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || typeof value === 'boolean') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
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

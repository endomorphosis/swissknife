/**
 * Profile D policy-evaluation ZKP public statement and verification boundary.
 *
 * This module intentionally contains no policy text, request context, or
 * witness material.  A certificate is only called zero knowledge after a
 * production-admitted circuit, setup, verification key, and cryptographic
 * verifier have all accepted it.  Everything else is a statement-only
 * commitment and must never be treated as a proof of policy evaluation.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';

export const PROFILE_D_POLICY_ZKP_CERTIFICATE_SCHEMA = 'mcp++/profile-d-policy-zkp-certificate@1' as const;
export const PROFILE_D_POLICY_ZKP_STATEMENT_SCHEMA = 'mcp++/profile-d-policy-zkp-statement@1' as const;
export const PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF = 'profile_d_policy_evaluation@v1' as const;

export type ProfileDPolicyVerdict = 'allow' | 'deny' | 'allow_with_obligations';

export interface ProfileDPolicyPublicStatement {
  readonly schema: typeof PROFILE_D_POLICY_ZKP_STATEMENT_SCHEMA;
  readonly circuit_ref: string;
  readonly policy_commitment: string;
  readonly context_commitment: string;
  readonly decision_commitment: string;
  readonly verdict: ProfileDPolicyVerdict;
  readonly obligations_commitment: string;
}

export interface ProfileDPolicyProof {
  readonly system: 'groth16';
  readonly circuit_id: string;
  readonly circuit_version: number;
  readonly proof: unknown;
  readonly vk_hash: string;
}

export interface ProfileDPolicyZkpAdmission {
  readonly production_admitted: boolean;
  readonly status: 'statement-only' | 'production-admitted';
  readonly reason: string;
  /** Each admission gate is independently required for a verified certificate. */
  readonly circuit_admitted: boolean;
  readonly trusted_setup_admitted: boolean;
  readonly verification_key_admitted: boolean;
}

export interface ProfileDPolicyZkpCertificate {
  readonly schema: typeof PROFILE_D_POLICY_ZKP_CERTIFICATE_SCHEMA;
  readonly certificate_version: 1;
  readonly status: 'statement_only' | 'verified';
  readonly circuit_ref: string;
  readonly public_statement: ProfileDPolicyPublicStatement;
  /** Wire compatibility alias. It must be byte-for-byte the same statement. */
  readonly public_inputs: ProfileDPolicyPublicStatement;
  readonly proof: ProfileDPolicyProof | null;
  readonly zero_knowledge: boolean;
  readonly verified: boolean;
  readonly admission: ProfileDPolicyZkpAdmission;
}

export interface CreateProfileDPolicyStatementOptions {
  readonly policy: unknown;
  readonly context: unknown;
  readonly verdict: ProfileDPolicyVerdict;
  readonly obligations: unknown;
  readonly circuitRef?: string;
  readonly reason?: string;
}

export interface ProfileDPolicyProofBackend {
  verifyProfileDPolicyProof(
    proof: ProfileDPolicyProof,
    publicStatement: ProfileDPolicyPublicStatement,
  ): boolean | Promise<boolean>;
}

export interface ProfileDPolicyCertificateVerification {
  readonly verified: boolean;
  readonly status: 'verified' | 'statement_only' | 'rejected';
  readonly zero_knowledge: boolean;
  readonly reason: string | null;
  readonly public_statement: ProfileDPolicyPublicStatement | null;
}

export interface ProfileDPolicyCertificateVerifierOptions {
  /** A native verifier which is trusted to verify the specified Groth16 key. */
  readonly backend?: ProfileDPolicyProofBackend;
  /** Explicit production admission allowlist for circuit references. */
  readonly admittedCircuitRefs?: readonly string[];
  /** Explicit production admission allowlist for verification-key hashes. */
  readonly admittedVerificationKeyHashes?: readonly string[];
}

/** Return the SHA-256 hexadecimal commitment of canonical compact JSON. */
export function profileDPolicyCommitment(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** Build the only safe default: a statement-only certificate. */
export function createProfileDPolicyStatementOnlyCertificate(
  options: CreateProfileDPolicyStatementOptions,
): ProfileDPolicyZkpCertificate {
  const circuitRef = options.circuitRef ?? PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF;
  const publicStatement: ProfileDPolicyPublicStatement = Object.freeze({
    schema: PROFILE_D_POLICY_ZKP_STATEMENT_SCHEMA,
    circuit_ref: circuitRef,
    policy_commitment: profileDPolicyCommitment(options.policy),
    context_commitment: profileDPolicyCommitment(options.context),
    decision_commitment: profileDPolicyCommitment({ verdict: options.verdict, obligations: options.obligations }),
    verdict: options.verdict,
    obligations_commitment: profileDPolicyCommitment(options.obligations),
  });
  return Object.freeze({
    schema: PROFILE_D_POLICY_ZKP_CERTIFICATE_SCHEMA,
    certificate_version: 1,
    status: 'statement_only',
    circuit_ref: circuitRef,
    public_statement: publicStatement,
    public_inputs: publicStatement,
    proof: null,
    zero_knowledge: false,
    verified: false,
    admission: Object.freeze({
      production_admitted: false,
      status: 'statement-only',
      reason: options.reason ?? 'Profile D circuit, trusted setup, and verification key are not production-admitted.',
      circuit_admitted: false,
      trusted_setup_admitted: false,
      verification_key_admitted: false,
    }),
  });
}

/**
 * Fail-closed verifier for Profile D certificates.
 *
 * An injected verifier is deliberately required for an admitted certificate;
 * this module never performs a structural or simulated check and labels it as
 * cryptographic verification.
 */
export class ProfileDPolicyCertificateVerifier {
  constructor(private readonly options: ProfileDPolicyCertificateVerifierOptions = {}) {}

  async verify(certificate: unknown): Promise<ProfileDPolicyCertificateVerification> {
    const parsed = parseCertificate(certificate);
    if (!parsed.ok) return rejected(parsed.reason);
    const value = parsed.certificate;

    if (value.status === 'statement_only') {
      if (value.proof !== null || value.zero_knowledge || value.verified || value.admission.production_admitted
        || value.admission.status !== 'statement-only') {
        return rejected('invalid_statement_only_certificate');
      }
      return {
        verified: false,
        status: 'statement_only',
        zero_knowledge: false,
        reason: value.admission.reason,
        public_statement: value.public_statement,
      };
    }

    if (!value.zero_knowledge || !value.verified || !value.proof || !value.admission.production_admitted
      || value.admission.status !== 'production-admitted' || !value.admission.circuit_admitted
      || !value.admission.trusted_setup_admitted || !value.admission.verification_key_admitted) {
      return rejected('certificate_claims_verification_without_full_production_admission');
    }
    if (!this.options.admittedCircuitRefs?.includes(value.circuit_ref)) return rejected('circuit_not_production_admitted');
    if (!this.options.admittedVerificationKeyHashes?.includes(value.proof.vk_hash)) return rejected('verification_key_not_production_admitted');
    if (!this.options.backend) return rejected('cryptographic_verifier_not_configured');

    try {
      const verified = await this.options.backend.verifyProfileDPolicyProof(value.proof, value.public_statement);
      if (!verified) return rejected('cryptographic_verification_failed');
    } catch {
      return rejected('cryptographic_verification_failed');
    }
    return {
      verified: true,
      status: 'verified',
      zero_knowledge: true,
      reason: null,
      public_statement: value.public_statement,
    };
  }
}

export async function verifyProfileDPolicyCertificate(
  certificate: unknown,
  options: ProfileDPolicyCertificateVerifierOptions = {},
): Promise<ProfileDPolicyCertificateVerification> {
  return new ProfileDPolicyCertificateVerifier(options).verify(certificate);
}

function rejected(reason: string): ProfileDPolicyCertificateVerification {
  return { verified: false, status: 'rejected', zero_knowledge: false, reason, public_statement: null };
}

function parseCertificate(value: unknown): { ok: true; certificate: ProfileDPolicyZkpCertificate } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'certificate_must_be_an_object' };
  if (value.schema !== PROFILE_D_POLICY_ZKP_CERTIFICATE_SCHEMA || value.certificate_version !== 1) {
    return { ok: false, reason: 'unsupported_certificate_schema' };
  }
  if (value.status !== 'statement_only' && value.status !== 'verified') return { ok: false, reason: 'invalid_certificate_status' };
  if (typeof value.circuit_ref !== 'string' || !value.circuit_ref) return { ok: false, reason: 'invalid_circuit_ref' };
  const publicStatement = parsePublicStatement(value.public_statement, value.circuit_ref);
  if (!publicStatement) return { ok: false, reason: 'invalid_public_statement' };
  const publicInputs = parsePublicStatement(value.public_inputs, value.circuit_ref);
  if (!publicInputs || canonicalJson(publicInputs) !== canonicalJson(publicStatement)) {
    return { ok: false, reason: 'public_inputs_do_not_match_public_statement' };
  }
  const admission = parseAdmission(value.admission);
  if (!admission) return { ok: false, reason: 'invalid_admission' };
  if (typeof value.zero_knowledge !== 'boolean' || typeof value.verified !== 'boolean') {
    return { ok: false, reason: 'invalid_verification_flags' };
  }
  const proof = value.proof === null ? null : parseProof(value.proof, value.circuit_ref);
  if (value.proof !== null && !proof) return { ok: false, reason: 'invalid_proof' };
  return {
    ok: true,
    certificate: {
      schema: PROFILE_D_POLICY_ZKP_CERTIFICATE_SCHEMA,
      certificate_version: 1,
      status: value.status,
      circuit_ref: value.circuit_ref,
      public_statement: publicStatement,
      public_inputs: publicInputs,
      proof,
      zero_knowledge: value.zero_knowledge,
      verified: value.verified,
      admission,
    },
  };
}

function parsePublicStatement(value: unknown, circuitRef: string): ProfileDPolicyPublicStatement | null {
  if (!isRecord(value)) return null;
  const required = ['schema', 'circuit_ref', 'policy_commitment', 'context_commitment', 'decision_commitment', 'verdict', 'obligations_commitment'];
  if (Object.keys(value).length !== required.length || required.some(key => !(key in value))) return null;
  if (value.schema !== PROFILE_D_POLICY_ZKP_STATEMENT_SCHEMA || value.circuit_ref !== circuitRef || !isProfileDPolicyVerdict(value.verdict)) return null;
  if (![value.policy_commitment, value.context_commitment, value.decision_commitment, value.obligations_commitment].every(isSha256Hex)) return null;
  return value as unknown as ProfileDPolicyPublicStatement;
}

function parseAdmission(value: unknown): ProfileDPolicyZkpAdmission | null {
  if (!isRecord(value) || typeof value.production_admitted !== 'boolean' || typeof value.reason !== 'string'
    || typeof value.circuit_admitted !== 'boolean' || typeof value.trusted_setup_admitted !== 'boolean'
    || typeof value.verification_key_admitted !== 'boolean'
    || (value.status !== 'statement-only' && value.status !== 'production-admitted')) return null;
  const productionAdmitted = value.production_admitted;
  const status = value.status;
  const circuitAdmitted = value.circuit_admitted;
  const trustedSetupAdmitted = value.trusted_setup_admitted;
  const verificationKeyAdmitted = value.verification_key_admitted;
  const fullyAdmitted = circuitAdmitted && trustedSetupAdmitted && verificationKeyAdmitted;
  if (productionAdmitted !== fullyAdmitted
    || (status === 'production-admitted') !== fullyAdmitted) return null;
  return {
    production_admitted: productionAdmitted,
    status,
    reason: value.reason,
    circuit_admitted: circuitAdmitted,
    trusted_setup_admitted: trustedSetupAdmitted,
    verification_key_admitted: verificationKeyAdmitted,
  };
}

function parseProof(value: unknown, circuitRef: string): ProfileDPolicyProof | null {
  if (!isRecord(value) || value.system !== 'groth16' || typeof value.circuit_id !== 'string'
    || typeof value.circuit_version !== 'number' || !Number.isSafeInteger(value.circuit_version)
    || value.circuit_version < 1 || !isSha256Hex(value.vk_hash)
    || !('proof' in value)) return null;
  if (`${value.circuit_id}@v${value.circuit_version}` !== circuitRef) return null;
  return value as unknown as ProfileDPolicyProof;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProfileDPolicyVerdict(value: unknown): value is ProfileDPolicyVerdict {
  return value === 'allow' || value === 'deny' || value === 'allow_with_obligations';
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/** Python-compatible JSON.stringify(value recursively key-sorted), UTF-8 input. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError('Profile D commitments require JSON values');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`Profile D commitments cannot encode ${typeof value}`);
}

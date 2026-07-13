/**
 * Verifier for the MCP++ Groth16 multi-party ceremony manifest.
 *
 * This module validates ceremony governance and artifact continuity. It does
 * not replace `snarkjs zkey verify` or an equivalent cryptographic transcript
 * verifier, which must be recorded in the manifest before production keys are
 * admitted.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';

export const MCPPP_GROTH16_MPC_CEREMONY_SCHEMA = 'mcp++/groth16-mpc-ceremony@1' as const;
export const MCPPP_PROFILE_F_NAME = 'Profile F: Event DAG Provenance, Archival, and Compaction' as const;

export interface CeremonyAttestation {
  readonly algorithm: string;
  readonly signature: string;
  readonly signedAt: string;
  readonly statementCid: string;
}

export interface CeremonyContribution {
  readonly sequence: number;
  readonly participantDid: string;
  readonly inputArtifactSha256: string;
  readonly outputArtifactSha256: string;
  readonly attestation: CeremonyAttestation;
  readonly transcriptVerifier: 'snarkjs-zkey-verify' | 'arkworks-mpc-verifier';
  readonly transcriptVerifiedAt: string;
}

export interface CeremonyArtifact {
  readonly sha256: string;
  readonly cid: string;
  readonly sizeBytes: number;
}

export interface Groth16MpcCeremonyManifest {
  readonly schema: typeof MCPPP_GROTH16_MPC_CEREMONY_SCHEMA;
  readonly profile: {
    readonly capability: 'mcp++/event-dag';
    readonly name: typeof MCPPP_PROFILE_F_NAME;
  };
  readonly ceremonyId: string;
  readonly circuitId: string;
  /** Key encoding used by an implementation-specific production admission gate. */
  readonly keyFormat?: 'snarkjs-zkey' | 'arkworks-canonical';
  readonly circuitR1cs: CeremonyArtifact;
  readonly phase1Powers: CeremonyArtifact;
  /** The zero-contribution zkey emitted by `snarkjs groth16 setup`. */
  readonly initialZkey?: CeremonyArtifact;
  readonly curve: 'bn128';
  readonly minimumIndependentContributors: number;
  readonly contributions: readonly CeremonyContribution[];
  readonly finalZkey?: CeremonyArtifact;
  /** Required by Arkworks production admission to bind the actual local prover. */
  readonly provingKey?: CeremonyArtifact;
  readonly verificationKey?: CeremonyArtifact;
  readonly status: 'collecting' | 'complete' | 'revoked';
  readonly finalizedAt?: string;
}

export interface CeremonyValidation {
  readonly valid: boolean;
  readonly productionEligible: boolean;
  readonly ceremonyCid: string;
  readonly independentContributors: readonly string[];
  readonly reasons: readonly string[];
}

/** Deterministic identifier that can be persisted in IPFS or a UCAN caveat. */
export function ceremonyCid(manifest: Groth16MpcCeremonyManifest): string {
  return `sha256:${sha256Hex(canonicalJson(manifest))}`;
}

/**
 * Validate the evidence required before a Groth16 key is used in production.
 * A two-party quorum is a minimum; deployments may require more contributors.
 */
export function validateGroth16MpcCeremony(manifest: Groth16MpcCeremonyManifest): CeremonyValidation {
  const reasons: string[] = [];
  if (manifest.schema !== MCPPP_GROTH16_MPC_CEREMONY_SCHEMA) reasons.push('unsupported_schema');
  if (manifest.profile?.capability !== 'mcp++/event-dag' || manifest.profile?.name !== MCPPP_PROFILE_F_NAME) {
    reasons.push('invalid_profile_f_identity');
  }
  if (!manifest.ceremonyId) reasons.push('missing_ceremony_id');
  if (!manifest.circuitId) reasons.push('missing_circuit_id');
  if (manifest.keyFormat !== undefined && manifest.keyFormat !== 'snarkjs-zkey' && manifest.keyFormat !== 'arkworks-canonical') {
    reasons.push('invalid_key_format');
  }
  if (!validArtifact(manifest.circuitR1cs)) reasons.push('invalid_circuit_r1cs');
  if (!validArtifact(manifest.phase1Powers)) reasons.push('invalid_phase1_powers');
  if (!Number.isInteger(manifest.minimumIndependentContributors) || manifest.minimumIndependentContributors < 2) {
    reasons.push('minimum_independent_contributors_must_be_at_least_two');
  }

  if (manifest.initialZkey && !validArtifact(manifest.initialZkey)) reasons.push('invalid_initial_zkey');
  if (manifest.provingKey && !validArtifact(manifest.provingKey)) reasons.push('invalid_proving_key');
  if (manifest.contributions.length > 0 && !manifest.initialZkey) reasons.push('missing_initial_zkey');

  let previousOutput: string | undefined = manifest.initialZkey?.sha256;
  const participants = new Set<string>();
  for (let index = 0; index < manifest.contributions.length; index += 1) {
    const contribution = manifest.contributions[index];
    if (contribution.sequence !== index + 1) reasons.push(`invalid_sequence_${index + 1}`);
    if (!validDid(contribution.participantDid)) reasons.push(`invalid_participant_did_${index + 1}`);
    else participants.add(contribution.participantDid);
    if (!validSha256(contribution.inputArtifactSha256) || !validSha256(contribution.outputArtifactSha256)) {
      reasons.push(`invalid_contribution_hash_${index + 1}`);
    }
    if (previousOutput && contribution.inputArtifactSha256 !== previousOutput) reasons.push(`broken_artifact_chain_${index + 1}`);
    previousOutput = contribution.outputArtifactSha256;
    if (!contribution.attestation?.algorithm || !contribution.attestation.signature || !contribution.attestation.signedAt || !contribution.attestation.statementCid) {
      reasons.push(`missing_signed_attestation_${index + 1}`);
    }
    if ((contribution.transcriptVerifier !== 'snarkjs-zkey-verify' && contribution.transcriptVerifier !== 'arkworks-mpc-verifier')
      || !contribution.transcriptVerifiedAt) {
      reasons.push(`missing_transcript_verification_${index + 1}`);
    }
  }

  const independentContributors = Array.from(participants).sort();
  const valid = reasons.length === 0;
  const complete = manifest.status === 'complete'
    && manifest.contributions.length > 0
    && validArtifact(manifest.initialZkey)
    && validArtifact(manifest.finalZkey)
    && validArtifact(manifest.verificationKey)
    && Boolean(manifest.finalizedAt)
    && previousOutput === manifest.finalZkey?.sha256;
  if (manifest.status === 'complete' && !complete) reasons.push('incomplete_finalization');
  const productionEligible = reasons.length === 0
    && complete
    && independentContributors.length >= manifest.minimumIndependentContributors;
  if (reasons.length === 0 && !productionEligible) reasons.push('independent_contributor_quorum_not_met');

  return Object.freeze({
    valid: reasons.length === 0 || (reasons.length === 1 && reasons[0] === 'independent_contributor_quorum_not_met'),
    productionEligible,
    ceremonyCid: ceremonyCid(manifest),
    independentContributors: Object.freeze(independentContributors),
    reasons: Object.freeze(reasons),
  });
}

export function assertProductionEligibleGroth16Ceremony(manifest: Groth16MpcCeremonyManifest): CeremonyValidation {
  const result = validateGroth16MpcCeremony(manifest);
  if (!result.productionEligible) {
    throw new Error(`Groth16 ceremony is not production eligible: ${result.reasons.join(', ') || 'unknown'}`);
  }
  return result;
}

function validArtifact(value: CeremonyArtifact | undefined): value is CeremonyArtifact {
  return Boolean(
    value
    && validSha256(value.sha256)
    && value.cid === `sha256:${value.sha256}`
    && Number.isInteger(value.sizeBytes)
    && value.sizeBytes > 0,
  );
}

function validSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function validDid(value: string): boolean {
  return /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

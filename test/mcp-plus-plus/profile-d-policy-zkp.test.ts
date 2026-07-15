import {
  PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF,
  ProfileDPolicyCertificateVerifier,
  createProfileDPolicyStatementOnlyCertificate,
  profileDPolicyCommitment,
} from '../../src/services/zkp/profile-d-policy-zkp';
import { evaluateProfileDExecution } from '../../src/services/mcp/profile-d-policy';

const ADMITTED_VK_HASH = 'a'.repeat(64);

describe('Profile D policy-evaluation ZKP certificate boundary', () => {
  it('publishes commitments and a statement-only certificate without private policy or context', async () => {
    const privatePolicy = {
      clauses: [{ clause_type: 'permission', actor: 'did:key:private-alice', action: 'tools.call', resource: 'vault/secret' }],
      description: 'PRIVATE POLICY TEXT: never disclose',
    };
    const privateContext = { actor: 'did:key:private-alice', action: 'tools.call', resource: 'vault/secret', session_token: 'private-token' };
    const certificate = createProfileDPolicyStatementOnlyCertificate({
      policy: privatePolicy,
      context: privateContext,
      verdict: 'allow',
      obligations: [{ type: 'obligation', action: 'audit' }],
    });

    expect(certificate).toMatchObject({
      circuit_ref: PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF,
      status: 'statement_only', zero_knowledge: false, verified: false, proof: null,
      admission: { production_admitted: false, status: 'statement-only' },
    });
    expect(certificate.public_statement.policy_commitment).toBe(profileDPolicyCommitment(privatePolicy));
    expect(certificate.public_statement.context_commitment).toBe(profileDPolicyCommitment(privateContext));
    expect(JSON.stringify(certificate)).not.toContain('PRIVATE POLICY TEXT');
    expect(JSON.stringify(certificate)).not.toContain('private-token');

    await expect(new ProfileDPolicyCertificateVerifier().verify(certificate)).resolves.toMatchObject({
      verified: false, status: 'statement_only', zero_knowledge: false,
    });
  });

  it('does not upgrade a statement-only certificate when its flags are forged', async () => {
    const certificate = createProfileDPolicyStatementOnlyCertificate({
      policy: { clauses: ['private'] }, context: { private: true }, verdict: 'deny', obligations: [],
    });
    const forged = { ...certificate, zero_knowledge: true, verified: true };

    await expect(new ProfileDPolicyCertificateVerifier().verify(forged)).resolves.toMatchObject({
      verified: false, status: 'rejected', reason: 'invalid_statement_only_certificate',
    });
  });

  it('requires explicit circuit/key admission and a cryptographic backend before accepting a proof', async () => {
    const statementOnly = createProfileDPolicyStatementOnlyCertificate({
      policy: { clauses: ['private'] }, context: { private: true }, verdict: 'allow_with_obligations', obligations: [{ id: 'audit' }],
    });
    const certificate = {
      ...statementOnly,
      status: 'verified' as const,
      proof: {
        system: 'groth16' as const,
        circuit_id: 'profile_d_policy_evaluation',
        circuit_version: 1,
        proof: { pi_a: ['1', '2', '3'] },
        vk_hash: ADMITTED_VK_HASH,
      },
      zero_knowledge: true,
      verified: true,
      admission: {
        production_admitted: true as const,
        status: 'production-admitted' as const,
        reason: 'admitted by release gate',
        circuit_admitted: true,
        trusted_setup_admitted: true,
        verification_key_admitted: true,
      },
    };

    await expect(new ProfileDPolicyCertificateVerifier({
      admittedCircuitRefs: [PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF],
      admittedVerificationKeyHashes: [ADMITTED_VK_HASH],
    }).verify(certificate)).resolves.toMatchObject({ reason: 'cryptographic_verifier_not_configured', status: 'rejected' });

    const verifier = new ProfileDPolicyCertificateVerifier({
      admittedCircuitRefs: [PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF],
      admittedVerificationKeyHashes: [ADMITTED_VK_HASH],
      backend: { verifyProfileDPolicyProof: (proof, statement) => proof.vk_hash === ADMITTED_VK_HASH && statement.verdict === 'allow_with_obligations' },
    });
    await expect(verifier.verify(certificate)).resolves.toMatchObject({
      verified: true, status: 'verified', zero_knowledge: true,
    });
  });

  it('fails closed when any individual production-admission gate is absent', async () => {
    const statementOnly = createProfileDPolicyStatementOnlyCertificate({
      policy: { clauses: ['private'] }, context: { private: true }, verdict: 'allow', obligations: [],
    });
    const incompleteAdmission = {
      ...statementOnly,
      status: 'verified' as const,
      proof: {
        system: 'groth16' as const,
        circuit_id: 'profile_d_policy_evaluation',
        circuit_version: 1,
        proof: { pi_a: ['1', '2', '3'] },
        vk_hash: ADMITTED_VK_HASH,
      },
      zero_knowledge: true,
      verified: true,
      admission: {
        production_admitted: true as const,
        status: 'production-admitted' as const,
        reason: 'forged incomplete admission',
        circuit_admitted: true,
        trusted_setup_admitted: false,
        verification_key_admitted: true,
      },
    };

    await expect(new ProfileDPolicyCertificateVerifier({
      admittedCircuitRefs: [PROFILE_D_POLICY_EVALUATION_CIRCUIT_REF],
      admittedVerificationKeyHashes: [ADMITTED_VK_HASH],
      backend: { verifyProfileDPolicyProof: () => true },
    }).verify(incompleteAdmission)).resolves.toMatchObject({
      verified: false, status: 'rejected', reason: 'invalid_admission', zero_knowledge: false,
    });
  });

  it('binds the evaluator decision to private policy/context commitments and stays statement-only locally', () => {
    const result = evaluateProfileDExecution({
      actor: 'did:key:alice', action: 'tools.call', resource: 'dataset/private', evaluated_at: '2026-07-14T00:00:00Z',
      policy: {
        description: 'private policy text',
        clauses: [{ clause_type: 'permission', actor: 'did:key:alice', action: 'tools.call', resource: 'dataset/private' }],
      },
      request_zkp_certificate: true,
    });
    const certificate = result.zkp_certificate!;

    expect(certificate.public_statement.verdict).toBe('allow');
    expect(certificate.public_statement.decision_commitment).toBe(profileDPolicyCommitment({ verdict: 'allow', obligations: [] }));
    expect(JSON.stringify(certificate)).not.toContain('private policy text');
    expect(certificate).toMatchObject({ status: 'statement_only', zero_knowledge: false, verified: false });
  });
});

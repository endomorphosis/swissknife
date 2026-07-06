/**
 * WASM Prover Sprint 11 — UCAN-ZKP Bridge tests.
 *
 * Tasks covered:
 *   T-68: ZkpCapabilityEvidence + ZkpBridgeResult types (zkp-types.ts)
 *   T-69: ZkpSimulatedProver — deterministic hash-based proof + verify
 *   T-70: ZkpUcanBridge — proofToCaveat(), proveAndDelegate(), simulation fallback
 *   T-71: ≥10 tests
 *
 * Sprint 11 (Phase 11 — UCAN-ZKP Bridge, P2).
 * Reference: ipfs_datasets_py/logic/zkp/ucan_zkp_bridge.py (592 lines)
 */

import { ZkpSimulatedProver, computeStatementCid } from '../../src/services/zkp/zkp-simulated-prover.js';
import { ZkpUcanBridge } from '../../src/services/zkp/zkp-ucan-bridge.js';
import type { ZkpCapabilityEvidence } from '../../src/services/zkp/zkp-types.js';
import type { ZKProofArtifact } from '../../src/services/provers/lurk-wasm-bridge.js';

// ---------------------------------------------------------------------------
// T-68: ZkpCapabilityEvidence type shape
// ---------------------------------------------------------------------------

describe('T-68 zkp-types — ZkpCapabilityEvidence type shape', () => {
  it('has the required UCAN caveat fields', () => {
    const evidence: ZkpCapabilityEvidence = {
      type: 'zkp_evidence',
      proof_hash: 'abc123',
      theorem_cid: 'sha256:def456',
      verifier_id: 'simulated-zkp-v0.1',
      public_inputs: { theorem: 'P → Q' },
      is_simulation: true,
    };
    expect(evidence.type).toBe('zkp_evidence');
    expect(evidence.is_simulation).toBe(true);
    expect(typeof evidence.proof_hash).toBe('string');
    expect(evidence.theorem_cid.startsWith('sha256:')).toBe(true);
  });

  it('computeStatementCid produces sha256: prefix', () => {
    const cid = computeStatementCid('test theorem');
    expect(cid.startsWith('sha256:')).toBe(true);
    expect(cid.length).toBe(7 + 64); // 'sha256:' + 64 hex chars
  });

  it('computeStatementCid is deterministic', () => {
    const a = computeStatementCid('All agents must log access');
    const b = computeStatementCid('All agents must log access');
    expect(a).toBe(b);
  });

  it('computeStatementCid differs for different statements', () => {
    const a = computeStatementCid('statement A');
    const b = computeStatementCid('statement B');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// T-69: ZkpSimulatedProver
// ---------------------------------------------------------------------------

describe('T-69 ZkpSimulatedProver', () => {
  let prover: ZkpSimulatedProver;
  beforeEach(() => { prover = new ZkpSimulatedProver(); });

  it('generates a proof with the correct structure', async () => {
    const proof = await prover.prove('All humans are mortal');
    expect(proof.statement).toBe('All humans are mortal');
    expect(proof.verifier_id).toBe('simulated-zkp-v0.1');
    expect(typeof proof.proof_b64).toBe('string');
    expect(proof.proof_b64.length).toBeGreaterThan(0);
    expect(proof.proof_hash).toHaveLength(64);
    expect(proof.statement_cid.startsWith('sha256:')).toBe(true);
    expect(proof.axiom_hashes).toEqual([]);
    expect(proof.proof_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('hashes private axioms without revealing them', async () => {
    const proof = await prover.prove('Socrates is mortal', ['Socrates is human', 'All humans are mortal']);
    expect(proof.axiom_hashes).toHaveLength(2);
    // Axiom content should not appear in proof_b64
    expect(atob ? proof.proof_b64 : Buffer.from(proof.proof_b64, 'base64url').toString())
      .not.toContain('Socrates is human');
  });

  it('proof is deterministic for same inputs', async () => {
    const a = await prover.prove('theorem X', ['axiom A']);
    const b = await prover.prove('theorem X', ['axiom A']);
    expect(a.proof_hash).toBe(b.proof_hash);
    expect(a.proof_b64).toBe(b.proof_b64);
  });

  it('proof differs for different theorems', async () => {
    const a = await prover.prove('theorem A');
    const b = await prover.prove('theorem B');
    expect(a.proof_hash).not.toBe(b.proof_hash);
  });

  it('proof_b64 is < 500 bytes decoded', async () => {
    const proof = await prover.prove('A long theorem about temporal deontic logic constraints');
    const bytes = Buffer.from(proof.proof_b64, 'base64url');
    expect(bytes.length).toBeLessThan(500);
  });

  it('verify() returns true for a fresh proof', async () => {
    const proof = await prover.prove('verified theorem');
    expect(prover.verify(proof)).toBe(true);
  });

  it('verify() returns false for tampered proof_hash', async () => {
    const proof = await prover.prove('theorem');
    const tampered = { ...proof, proof_hash: 'a'.repeat(64) };
    expect(prover.verify(tampered)).toBe(false);
  });

  it('verify() returns false for tampered statement_cid', async () => {
    const proof = await prover.prove('theorem');
    const tampered = { ...proof, statement_cid: 'sha256:' + 'b'.repeat(64) };
    expect(prover.verify(tampered)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-70: ZkpUcanBridge
// ---------------------------------------------------------------------------

describe('T-70 ZkpUcanBridge', () => {
  let bridge: ZkpUcanBridge;
  beforeEach(() => { bridge = new ZkpUcanBridge(); });

  it('proofToCaveat() converts a real ZKProofArtifact to ZkpCapabilityEvidence', () => {
    const artifact: ZKProofArtifact = {
      backend: 'sphinx',
      statement: 'obligation_discharge: read_file',
      proof_b64: 'c3BoaW54LXByb29m',  // base64url of 'sphinx-proof'
      vk_cid: 'sha256:' + 'a'.repeat(64),
      public_inputs: ['obligation_discharge'],
      artifact_cid: 'sha256:' + 'b'.repeat(64),
      proof_time_ms: 1234,
    };

    const caveat = bridge.proofToCaveat(artifact);

    expect(caveat.type).toBe('zkp_evidence');
    expect(caveat.is_simulation).toBe(false);
    expect(caveat.verifier_id).toBe('sphinx-zkp-v0.1');
    expect(caveat.theorem_cid.startsWith('sha256:')).toBe(true);
    expect(typeof caveat.proof_hash).toBe('string');
    expect(caveat.proof_hash).toHaveLength(64);
    expect(caveat.public_inputs.theorem).toBe('obligation_discharge: read_file');
  });

  it('proofToCaveat() maps nova backend to lurk-nova-v0.1 verifier', () => {
    const artifact: ZKProofArtifact = {
      backend: 'nova',
      statement: 'test',
      proof_b64: 'dGVzdA',
      vk_cid: 'sha256:' + 'a'.repeat(64),
      public_inputs: [],
      artifact_cid: 'sha256:' + 'c'.repeat(64),
      proof_time_ms: 10,
    };
    const caveat = bridge.proofToCaveat(artifact);
    expect(caveat.verifier_id).toBe('lurk-nova-v0.1');
  });

  it('fails closed by default when no real prover is available', async () => {
    const strictBridge = new ZkpUcanBridge();
    await expect(
      strictBridge.proveAndDelegate(
        'All agents must log access',
        'did:key:alice',
        'mcp++/audit',
        'proof/invoke',
      ),
    ).rejects.toThrow('Real ZK prover unavailable and simulated fallback is disabled');
  });

  it('proveAndDelegate() uses real prover when provided and it succeeds', async () => {
    const fakeArtifact: ZKProofArtifact = {
      backend: 'sphinx',
      statement: 'policy is consistent',
      proof_b64: 'cmVhbC1zcGhpbngtcHJvb2Y',
      vk_cid: 'sha256:' + 'd'.repeat(64),
      public_inputs: ['policy'],
      artifact_cid: 'sha256:' + 'e'.repeat(64),
      proof_time_ms: 500,
    };

    const result = await bridge.proveAndDelegate(
      'policy is consistent',
      'did:key:bob',
      'logic/proof',
      'proof/verify',
      { realProver: async () => fakeArtifact },
    );

    expect(result.success).toBe(true);
    expect(result.zkp_caveat?.is_simulation).toBe(false);
    expect(result.zkp_caveat?.verifier_id).toBe('sphinx-zkp-v0.1');
    expect(result.proof_artifact?.backend).toBe('sphinx');
    expect(result.warnings).toHaveLength(0);
  });

  it('proveAndDelegate() fails closed when real prover returns null', async () => {
    await expect(
      bridge.proveAndDelegate(
        'theorem',
        'did:key:carol',
        'resource',
        'ability',
        { realProver: async () => null },
      ),
    ).rejects.toThrow('Real ZK prover returned null');
  });

  it('proveAndDelegate() propagates real prover failures', async () => {
    await expect(
      bridge.proveAndDelegate(
        'theorem',
        'did:key:dave',
        'resource',
        'ability',
        { realProver: async () => { throw new Error('ix binary not found'); } },
      ),
    ).rejects.toThrow('ix binary not found');
  });

  it('ZkpCapabilityEvidence can be serialised to JSON and round-tripped', async () => {
    const result = await bridge.proveAndDelegate(
      'theorem',
      'did:key:x',
      'r',
      'a',
      {
        realProver: async () => ({
          backend: 'circom',
          statement: 'theorem',
          proof_b64: 'dGhlb3JlbQ',
          vk_cid: 'sha256:' + 'f'.repeat(64),
          public_inputs: ['theorem'],
          artifact_cid: 'sha256:' + '1'.repeat(64),
          proof_time_ms: 10,
        }),
      },
    );
    const json = JSON.stringify(result.zkp_caveat);
    const parsed = JSON.parse(json) as ZkpCapabilityEvidence;
    expect(parsed.type).toBe('zkp_evidence');
    expect(parsed.theorem_cid.startsWith('sha256:')).toBe(true);
    expect(typeof parsed.proof_hash).toBe('string');
  });
});

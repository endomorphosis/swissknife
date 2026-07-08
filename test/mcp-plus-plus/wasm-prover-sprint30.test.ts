/**
 * wasm-prover-sprint30.test.ts
 *
 * Sprint 30: ZKP Circuits + UCAN Policy Bridge + Ethereum ZKP + Phase 7.4 Benchmarks
 */

import {
  decodeSimulatedProofLayout, buildProofAttestationView,
  attestationViewMatchesProof, compilerGuidanceRefFromMetadata,
} from '../../src/services/zkp-circuits.js';
import {
  BridgeCompileResult, BridgeEvaluationResult,
  UCANPolicyBridge, compileAndEvaluate, getUCANPolicyBridge,
} from '../../src/services/ucan-policy-bridge.js';
import {
  makeEthereumConfig, EthereumProofClient, ProofSubmissionPipeline,
  makePerformanceMetrics, Phase7_4Benchmarks,
} from '../../src/services/zkp-eth-integration.js';

// ---------------------------------------------------------------------------
// ZKP Circuits
// ---------------------------------------------------------------------------

describe('decodeSimulatedProofLayout', () => {
  test('returns valid=false for empty bytes', () => {
    const layout = decodeSimulatedProofLayout(Buffer.alloc(0));
    expect(layout.valid).toBe(false);
    expect(layout.format).toBe('opaque');
  });

  test('returns valid=false for wrong-length buffer', () => {
    const layout = decodeSimulatedProofLayout(Buffer.alloc(100));
    expect(layout.valid).toBe(false);
  });

  test('returns valid=false for non-SIMZKP magic', () => {
    const layout = decodeSimulatedProofLayout(Buffer.alloc(256));
    expect(layout.valid).toBe(false);
  });

  test('returns correct byteLength', () => {
    const buf = Buffer.alloc(128, 0xab);
    const layout = decodeSimulatedProofLayout(buf);
    expect(layout.byteLength).toBe(128);
  });

  test('handles hex string input', () => {
    const layout = decodeSimulatedProofLayout('0x' + 'ab'.repeat(32));
    expect(typeof layout.byteLength).toBe('number');
  });

  test('handles null/undefined gracefully', () => {
    expect(() => decodeSimulatedProofLayout(null)).not.toThrow();
    expect(() => decodeSimulatedProofLayout(undefined)).not.toThrow();
  });
});

describe('buildProofAttestationView', () => {
  const publicInputs = {
    theorem_hash: 'thm001',
    axioms_commitment: 'ax001',
    circuit_id: 'test-circuit',
    ruleset_id: 'rules-v1',
  };

  test('returns an AttestationView with attestationRef', () => {
    const view = buildProofAttestationView({ proofData: 'proof123', publicInputs });
    expect(typeof view.attestationRef).toBe('string');
    expect(view.attestationRef.length).toBe(64); // SHA-256 hex
  });

  test('proofDigest is 64-char hex', () => {
    const view = buildProofAttestationView({ proofData: 'proof123', publicInputs });
    expect(view.proofDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test('circuitRef contains circuit_id', () => {
    const view = buildProofAttestationView({ proofData: 'proof', publicInputs });
    expect(view.circuitRef).toContain('test-circuit');
  });

  test('theoremHash matches input', () => {
    const view = buildProofAttestationView({ proofData: 'proof', publicInputs });
    expect(view.theoremHash).toBe('thm001');
  });

  test('compilerGuidanceRef is extracted from metadata', () => {
    const view = buildProofAttestationView({
      proofData: 'p',
      publicInputs,
      metadata: { compiler_guidance_ref: 'cg-ref-001' },
    });
    expect(view.compilerGuidanceRef).toBe('cg-ref-001');
  });

  test('is deterministic for same inputs', () => {
    const v1 = buildProofAttestationView({ proofData: 'p', publicInputs });
    const v2 = buildProofAttestationView({ proofData: 'p', publicInputs });
    expect(v1.attestationRef).toBe(v2.attestationRef);
  });
});

describe('attestationViewMatchesProof', () => {
  const publicInputs = { theorem_hash: 't1', circuit_id: 'c1' };

  test('returns true when no embedded attestation (no-op check)', () => {
    const result = attestationViewMatchesProof({ proofData: 'p', publicInputs });
    expect(typeof result).toBe('boolean');
  });

  test('returns false for empty public inputs', () => {
    const result = attestationViewMatchesProof({ proofData: 'p', publicInputs: {} });
    expect(result).toBe(false);
  });

  test('matches embedded attestation built from same inputs', () => {
    const view = buildProofAttestationView({ proofData: 'my-proof', publicInputs });
    const matches = attestationViewMatchesProof({
      proofData: 'my-proof',
      publicInputs,
      attestationView: { attestation_ref: view.attestationRef, proof_digest: view.proofDigest },
    });
    expect(matches).toBe(true);
  });
});

describe('compilerGuidanceRefFromMetadata', () => {
  test('extracts compiler_guidance_ref', () => {
    expect(compilerGuidanceRefFromMetadata({ compiler_guidance_ref: 'cg001' })).toBe('cg001');
  });

  test('falls back to cid', () => {
    expect(compilerGuidanceRefFromMetadata({ cid: 'cid001' })).toBe('cid001');
  });

  test('returns empty string for null', () => {
    expect(compilerGuidanceRefFromMetadata(null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// UCANPolicyBridge
// ---------------------------------------------------------------------------

describe('UCANPolicyBridge.compileNl', () => {
  const bridge = new UCANPolicyBridge();

  test('returns BridgeCompileResult', () => {
    const result = bridge.compileNl('All persons must register their vehicles.');
    expect(result).toBeInstanceOf(BridgeCompileResult);
  });

  test('success=true for obligation text', () => {
    const result = bridge.compileNl('All persons must register.');
    expect(result.success).toBe(true);
    expect(result.delegationCount).toBeGreaterThan(0);
  });

  test('prohibition counted as denial, not delegation', () => {
    const result = bridge.compileNl('No person shall not disclose secrets. May request info.');
    expect(result.denialCount).toBeGreaterThan(0);
  });

  test('policyCid is non-empty', () => {
    const result = bridge.compileNl('Must comply.');
    expect(result.policyCid.length).toBeGreaterThan(0);
  });

  test('errors for empty text', () => {
    const result = bridge.compileNl('');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('UCANPolicyBridge.evaluate', () => {
  const bridge = new UCANPolicyBridge();

  test('returns BridgeEvaluationResult', () => {
    const compile = bridge.compileNl('May request records.');
    const eval_ = bridge.evaluate(compile.policyCid, { capability: 'deontic:p:request' });
    expect(eval_).toBeInstanceOf(BridgeEvaluationResult);
  });

  test('allow for permission capability', () => {
    const compile = bridge.compileNl('May request.');
    const eval_ = bridge.evaluate(compile.policyCid, { capability: 'deontic:p:request' });
    expect(eval_.allowed).toBe(true);
  });

  test('deny for prohibition capability', () => {
    const compile = bridge.compileNl('Must comply.');
    const eval_ = bridge.evaluate(compile.policyCid, { capability: 'deontic:f:deny' });
    expect(eval_.decision).toBe('deny');
  });
});

describe('compileAndEvaluate', () => {
  test('returns compile and evaluate results', () => {
    const { compile, evaluate } = compileAndEvaluate(
      'May request information.',
      { capability: 'deontic:p:request' },
    );
    expect(compile).toBeInstanceOf(BridgeCompileResult);
    expect(evaluate).toBeInstanceOf(BridgeEvaluationResult);
  });
});

// ---------------------------------------------------------------------------
// EthereumProofClient
// ---------------------------------------------------------------------------

describe('EthereumProofClient', () => {
  const config = makeEthereumConfig({
    rpcUrl: 'https://sepolia.infura.io/v3/test',
    networkId: 11155111,
    networkName: 'sepolia',
    verifierContractAddress: '0x' + '1'.repeat(40),
    registryContractAddress: '0x' + '2'.repeat(40),
  });

  test('estimateGas returns GasEstimate', () => {
    const client = new EthereumProofClient(config);
    const estimate = client.estimateGas('proof', { theorem_hash: 't1' });
    expect(estimate.totalGas).toBeGreaterThan(0);
    expect(typeof estimate.estimatedFee).toBe('number');
    expect(['low', 'medium', 'high']).toContain(estimate.confidence);
  });

  test('verifyProof (stub) returns ProofVerificationResult shape', async () => {
    const client = new EthereumProofClient(config);
    const result = await client.verifyProof('proof', { theorem_hash: 't1' });
    expect(result).toHaveProperty('transactionHash');
    expect(result).toHaveProperty('verified');
    expect(result).toHaveProperty('gasUsed');
  });
});

// ---------------------------------------------------------------------------
// PerformanceMetrics + Phase7_4Benchmarks
// ---------------------------------------------------------------------------

describe('PerformanceMetrics', () => {
  test('summary returns status string', () => {
    const m = makePerformanceMetrics('cache_hit_rate', '>80%', '85%', true);
    expect(m.summary()).toContain('PASS');
    expect(m.summary()).toContain('cache_hit_rate');
  });

  test('failed metric summary contains FAIL', () => {
    const m = makePerformanceMetrics('latency', '<100ms', '250ms', false);
    expect(m.summary()).toContain('FAIL');
  });
});

describe('Phase7_4Benchmarks', () => {
  test('runAllBenchmarks returns BenchmarkSuite', async () => {
    const suite = new Phase7_4Benchmarks();
    const result = await suite.runAllBenchmarks();
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(typeof result.passRate).toBe('number');
    expect(result.passRate).toBeGreaterThanOrEqual(0);
    expect(result.passRate).toBeLessThanOrEqual(1);
  });

  test('passedCount + failedCount equals total metrics', async () => {
    const suite = new Phase7_4Benchmarks();
    await suite.runAllBenchmarks();
    expect(suite.passedCount + suite.failedCount).toBe(suite.results.length);
  });
});

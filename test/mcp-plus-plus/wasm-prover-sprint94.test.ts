/**
 * wasm-prover-sprint94.test.ts
 * Tests for PORT-192 Groth16 real spawn, PORT-194 circuit_v2 canonicalization,
 * PORT-195 witness/verifier/setup/VK registry, PORT-201 ProofExecutionEngine.
 */

// ---------------------------------------------------------------------------
// PORT-192 Groth16Backend real spawn path (availability guard)
// ---------------------------------------------------------------------------

import { Groth16Backend, Groth16BackendFallback, ProveKitFFI, ProveKitFFIError } from '../../src/services/zkp-backends';

describe('PORT-192 Groth16Backend real spawn path', () => {
  it('falls back to simulated when binary is absent only with explicit opt-in', async () => {
    const backend = new Groth16Backend(null, 5_000, undefined, { allowSimulatedFallback: true });
    expect(backend.isAvailable()).toBe(false);
    const proof = await backend.generateProof('{"a":1}');
    expect(proof).toBeDefined();
    // Groth16Proof.toDict() exports proofData/publicInputs/metadata/timestamp/sizeBytes
    const dict = proof.toDict();
    expect(dict).toHaveProperty('proofData');
    expect(dict).toHaveProperty('metadata');
  });

  it('fails closed when no binary path is provided and simulation is not enabled', async () => {
    const backend = new Groth16Backend(null, 5_000);
    // null binary always unavailable
    expect(backend.isAvailable()).toBe(false);
    await expect(backend.generateProof('{"b":2}')).rejects.toThrow(/allowSimulatedFallback:true/);
    await expect(backend.verifyProof('{}')).resolves.toBe(false);
  });
});

describe('PORT-193 ProveKitFFI availability detection', () => {
  it('reports unavailable when no lib path given', () => {
    const ffi = new ProveKitFFI(null);
    expect(ffi.isAvailable()).toBe(false);
  });

  it('throws ProveKitFFIError when lib absent', async () => {
    const ffi = new ProveKitFFI(null);
    await expect(ffi.generateProof('{}', 0)).rejects.toBeInstanceOf(ProveKitFFIError);
  });

  it('discovers existing paths via ProveKitFFI.discover() without crashing', () => {
    const ffi = ProveKitFFI.discover();
    // on CI the lib won't be found; isAvailable() should simply be false
    expect(typeof ffi.isAvailable()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// PORT-194 circuit_v2 canonicalization & accumulator commitment
// ---------------------------------------------------------------------------

import {
  canonicalizeAxiomSet,
  axiomSetAccumulatorCommitment,
  deriveCircuitV2Inputs,
} from '../../src/services/canonicalization';

describe('PORT-194 canonicalization & circuit_v2 inputs', () => {
  it('canonicalizes axioms: deduplicates, trims, and sorts', () => {
    const raw = ['  B → C  ', 'A → B', 'A → B', 'A'];
    const canon = canonicalizeAxiomSet(raw);
    expect(canon).toEqual(['A', 'A → B', 'B → C']);
  });

  it('produces a deterministic Merkle-style accumulator commitment', () => {
    const axioms = ['A → B', 'B → C'];
    const c1 = axiomSetAccumulatorCommitment(axioms);
    const c2 = axiomSetAccumulatorCommitment(['B → C', 'A → B']); // order-independent
    expect(c1).toBe(c2);
    expect(c1).toHaveLength(64); // sha256 hex
  });

  it('derives circuit_v2 inputs including accumulator and trace root when derivable', () => {
    const result = deriveCircuitV2Inputs('C', ['A', 'A → B', 'B → C']);
    expect(result.derivable).toBe(true);
    expect(result.publicInputs.circuit_id).toBe('circuit_v2');
    expect(result.publicInputs.circuit_version).toBe(2);
    expect(result.publicInputs.accumulator_commitment).toHaveLength(64);
    expect(result.publicInputs.theorem_hash).toHaveLength(64);
    expect(result.error).toBeNull();
  });

  it('marks non-derivable theorems with error and still emits accumulator', () => {
    const result = deriveCircuitV2Inputs('Z', ['A', 'A → B']);
    expect(result.derivable).toBe(false);
    expect(result.error).toMatch(/not derivable/i);
    expect(result.publicInputs.accumulator_commitment).toHaveLength(64);
  });
});

import { deriveTdfolV1Trace, legalTheoremToCircuit } from '../../src/services/legal-theorem-semantics';

describe('PORT-194 legal theorem semantics', () => {
  it('derives TDFOL_v1 trace with semantic metadata', () => {
    const derivation = deriveTdfolV1Trace('O(Alice, LogAccess)', [
      'Contractor(Alice)',
      'Contractor(Alice) → O(Alice, LogAccess)',
    ]);
    expect(derivation.semantic.tdfolV1Derivable).toBe(true);
    expect(derivation.semantic.normModality).toBe('O');
    expect(derivation.semantic.semanticLabel).toContain('obligation');
    expect(derivation.circuit.publicInputs.circuit_id).toBe('circuit_v2');
  });

  it('handles non-derivable theorems gracefully', () => {
    const derivation = deriveTdfolV1Trace('P(Bob, ShareData)', ['A → B']);
    expect(derivation.semantic.tdfolV1Derivable).toBe(false);
    expect(derivation.circuit.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PORT-195 Witness Manager, ZKP Verifier, Setup Artifacts, VK Registry
// ---------------------------------------------------------------------------

import { WitnessManager, computeWitness, validateWitness, derivePublicInputs } from '../../src/services/witness-manager';

describe('PORT-195 WitnessManager', () => {
  it('computes a deterministic witness with public/private inputs', () => {
    const manager = new WitnessManager();
    const w = manager.computeWitness({
      statement:  'O(Alice, LogAccess)',
      axiomSet:   ['Contractor(Alice)', 'Contractor(Alice) → O(Alice, LogAccess)'],
      proofTrace: [{ step: 0, atom: 'Contractor(Alice)' }],
      context:    { jurisdiction: 'EU' },
    });
    expect(w.publicInputs['statement_hash']).toHaveLength(16);
    expect(w.publicInputs['axiom_commitment']).toHaveLength(64);
    expect(w.witnessHash).toHaveLength(64);
    expect(w.witness.length).toBeGreaterThan(3);
  });

  it('validates a well-formed witness', () => {
    const w = computeWitness({
      statement: 'P → Q',
      axiomSet: ['P'],
      proofTrace: [],
      context: {},
    });
    const { valid } = validateWitness(w);
    expect(valid).toBe(true);
  });

  it('rejects tampered witnesses', () => {
    const w = computeWitness({ statement: 'A', axiomSet: ['A'], proofTrace: [], context: {} });
    const tampered = { ...w, witnessHash: 'deadbeef'.repeat(8) };
    const { valid, errors } = validateWitness(tampered);
    expect(valid).toBe(false);
    expect(errors).toContain('witnessHash mismatch');
  });

  it('derives public inputs without full witness computation', () => {
    const pub = derivePublicInputs('O(Alice, LogAccess)', ['Contractor(Alice)']);
    expect(pub['statement_hash']).toHaveLength(16);
    expect(pub['axiom_commitment']).toHaveLength(64);
  });
});

import { ZKPVerifier, verifyProof, makeSimulatedVK } from '../../src/services/zkp-verifier';

describe('PORT-195 ZKPVerifier', () => {
  it('verifies a structurally valid proof JSON', () => {
    const verifier = new ZKPVerifier();
    const result = verifier.verify(
      JSON.stringify({ algorithm: 'simulated', proof_hash: 'abc123', proof_id: 'p1' }),
      { statement_hash: 'deadbeef', axiom_commitment: 'cafe1234' },
    );
    expect(result.verified).toBe(true);
    expect(result.algorithm).toBe('simulated');
  });

  it('rejects invalid JSON as an error result', () => {
    const result = verifyProof('not-json', {});
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/invalid JSON/i);
  });

  it('creates a simulated VK and loads it', () => {
    const verifier = new ZKPVerifier();
    const vk = makeSimulatedVK('circuit-test-1');
    verifier.loadVerificationKey(vk);
    expect(verifier.getVK()?.keyId).toBe('circuit-test-1');
  });
});

import { SetupArtifactStore, runTrustedSetup, getOrCreateArtifact } from '../../src/services/setup-artifacts';

describe('PORT-195 SetupArtifacts', () => {
  it('runs a simulated trusted setup and produces PK+VK', () => {
    const artifact = runTrustedSetup('test-circuit', 'simulated', '1.0.0');
    expect(artifact.circuitId).toBe('test-circuit');
    expect(artifact.provingKey.keyId).toMatch(/^pk-/);
    expect(artifact.verifyingKey.keyId).toMatch(/^vk-/);
    expect(artifact.algorithm).toBe('simulated');
  });

  it('stores and retrieves artifacts', () => {
    const store = new SetupArtifactStore();
    const artifact = runTrustedSetup('circuit-2', 'simulated');
    store.put(artifact);
    expect(store.get('circuit-2')).toBe(artifact);
    expect(store.getProvingKey('circuit-2')?.circuitId).toBe('circuit-2');
  });

  it('getOrCreateArtifact is idempotent', () => {
    const a1 = getOrCreateArtifact('circuit-x');
    const a2 = getOrCreateArtifact('circuit-x');
    expect(a1).toBe(a2);
  });
});

import { VKRegistry, registerVK, lookupVK, getVKRegistry } from '../../src/services/vk-registry';

describe('PORT-195 VKRegistry', () => {
  it('registers and retrieves a VK', () => {
    const reg = new VKRegistry();
    const vk = makeSimulatedVK('vk-1');
    reg.register('circuit-a', vk, { tags: ['test'], description: 'test circuit' });
    expect(reg.has('circuit-a')).toBe(true);
    expect(reg.getVK('circuit-a')?.keyId).toBe('vk-1');
  });

  it('exports and re-imports a registry payload', () => {
    const reg = new VKRegistry();
    reg.register('c1', makeSimulatedVK('vk-c1'));
    reg.register('c2', makeSimulatedVK('vk-c2'));
    const payload = reg.exportPayload();
    expect(payload['payloadHash']).toBeDefined();

    const reg2 = new VKRegistry();
    const imported = reg2.importPayload(payload);
    expect(imported).toBe(2);
    expect(reg2.getVK('c1')?.keyId).toBe('vk-c1');
  });

  it('reports stats by algorithm', () => {
    const reg = new VKRegistry();
    reg.register('c1', makeSimulatedVK('vk-1'));
    const stats = reg.stats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.byAlgorithm['simulated']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PORT-201 ProofExecutionEngine
// ---------------------------------------------------------------------------

import {
  ProofExecutionEngine,
  ProofCache,
  executeProof,
  proveStatement,
  resetProofExecutionEngine,
} from '../../src/services/proof-execution-engine';
import { ProofStatus } from '../../src/services/proof-execution-engine-types';

describe('PORT-201 ProofCache', () => {
  it('caches and retrieves results', () => {
    const cache = new ProofCache(10, 60_000);
    const result = proveStatement('O(Alice, LogAccess)');
    cache.set('z3', 'O(Alice, LogAccess)', result);
    expect(cache.get('z3', 'O(Alice, LogAccess)')).toBe(result);
    expect(cache.stats().hits).toBe(1);
  });

  it('returns null for missing entries', () => {
    const cache = new ProofCache();
    expect(cache.get('z3', 'nonexistent')).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });
});

describe('PORT-201 ProofExecutionEngine', () => {
  beforeEach(() => resetProofExecutionEngine());

  it('executes a proof returning an array of ProofResults', () => {
    const engine = new ProofExecutionEngine();
    const results = engine.execute('O(Alice, LogAccess)', {
      provers: ['z3', 'tdfol'],
      mode: 'all',
    });
    expect(results.length).toBe(2);
    expect(results.every(r => ['z3', 'tdfol'].includes(r.prover))).toBe(true);
  });

  it('stops after first success in first-success mode', () => {
    const engine = new ProofExecutionEngine();
    const results = engine.execute('O(Alice, LogAccess)', {
      provers: ['z3', 'lean4', 'coq'],
      mode: 'first-success',
    });
    // At least one result, stop when first success found
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.isProved)).toBe(true);
  });

  it('accumulates per-prover stats', () => {
    const engine = new ProofExecutionEngine();
    engine.execute('O(Alice, LogAccess)', { provers: ['z3', 'tdfol'], mode: 'all' });
    const stats = engine.getStats();
    expect(stats.totalRuns).toBe(1);
    expect(Object.keys(stats.perProver)).toContain('z3');
  });

  it('caches results and hits on re-run', () => {
    const engine = new ProofExecutionEngine();
    engine.execute('O(X, Y)', { provers: ['z3'], mode: 'first-success', useCache: true });
    engine.execute('O(X, Y)', { provers: ['z3'], mode: 'first-success', useCache: true });
    const cStats = engine.getCacheStats();
    expect(cStats.hits).toBe(1);
  });

  it('proveStatement convenience wrapper returns a single result', () => {
    resetProofExecutionEngine();
    const result = proveStatement('O(Alice, Notify)');
    expect(result).toBeDefined();
    expect(result.prover).toBeTruthy();
  });

  it('proveBatch proves multiple statements', () => {
    const engine = new ProofExecutionEngine();
    const results = engine.proveBatch(['O(Alice, LogAccess)', 'P → Q', 'F(Bob, Share)']);
    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.statement).toBeTruthy());
  });
});

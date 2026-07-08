/**
 * wasm-prover-sprint96.test.ts
 * Tests for §12.20 ZKP real-backend adapters, circuit_v2 inputs, witness/VK
 * orchestration, and on-chain payloads.
 */

import {
  Groth16Backend,
  ProveKitFFI,
  ProveKitFFIError,
  type ZKPProcessRunner,
} from '../../src/services/zkp-backends';
import {
  axiomSetAccumulatorCommitment,
  canonicalizeAxiomSet,
  deriveCircuitV2Inputs,
} from '../../src/services/canonicalization';
import {
  LegalTheoremSemantics,
  deriveTdfolV1Trace,
  legalTheoremToCircuit,
} from '../../src/services/legal-theorem-semantics';
import {
  WitnessManager,
  computeWitness,
  validateWitness,
} from '../../src/services/witness-manager';
import {
  ZKPVerifier,
  makeSimulatedVK,
  verifyProof,
} from '../../src/services/zkp-verifier';
import {
  SetupArtifactStore,
  getOrCreateArtifact,
  runTrustedSetup,
} from '../../src/services/setup-artifacts';
import {
  VKRegistry,
  registerVK,
} from '../../src/services/vk-registry';
import {
  encodeZkpOnchainPayload,
  estimateZkpOnchainGas,
  submitZkpProofOnchain,
} from '../../src/services/zkp-onchain-pipeline';

describe('PORT-192 Groth16 native runner adapter', () => {
  it('passes witness JSON to the configured native runner and parses proof output', async () => {
    const calls: Array<{ command: string; args: string[]; input: string; timeoutMs: number }> = [];
    const runner: ZKPProcessRunner = (command, args, input, timeoutMs) => {
      calls.push({ command, args, input, timeoutMs });
      return { status: 0, stdout: JSON.stringify({ pi_a: 'aabbcc', public_inputs: { signal: '7' } }) };
    };

    const backend = new Groth16Backend('/bin/echo', 1234, runner);
    const proof = await backend.generateProof('{"witness":["7"]}');

    expect(calls[0]).toMatchObject({ command: '/bin/echo', args: ['prove', '--witness', '-'], input: '{"witness":["7"]}', timeoutMs: 1234 });
    expect(proof.metadata.backend).toBe('groth16-native');
    expect(proof.publicInputs.signal).toBe('7');
    await expect(backend.verifyProof('{"proof":true}')).resolves.toBe(true);
  });
});

describe('PORT-193 ProveKit runner adapter', () => {
  it('invokes the configured ProveKit CLI path for prove and verify', async () => {
    const calls: string[] = [];
    const runner: ZKPProcessRunner = (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      return { status: 0, stdout: JSON.stringify({ proof: '010203', public_inputs: { out: '1' } }) };
    };

    const ffi = new ProveKitFFI('/tmp/libprovekit.so', '/tmp/provekit', runner);
    const proof = await ffi.generateProof('{"x":1}', 9);
    const verified = await ffi.verifyProof(JSON.stringify(proof.toDict()));

    expect(proof.metadata.backend).toBe('provekit');
    expect(verified).toBe(true);
    expect(calls[0]).toContain('/tmp/provekit prove --lib /tmp/libprovekit.so --witness -');
    expect(calls[1]).toContain('/tmp/provekit verify --lib /tmp/libprovekit.so --proof -');
  });

  it('keeps unavailable ProveKit failures explicit', async () => {
    await expect(new ProveKitFFI(null).generateProof('{}')).rejects.toThrow(ProveKitFFIError);
  });
});

describe('PORT-194 circuit_v2 canonical inputs', () => {
  it('canonicalizes axioms and derives deterministic accumulator commitments', () => {
    const axioms = [' B ', 'A', 'A'];
    expect(canonicalizeAxiomSet(axioms)).toEqual(['A', 'B']);
    expect(axiomSetAccumulatorCommitment(axioms)).toBe(axiomSetAccumulatorCommitment(['B', 'A']));
  });

  it('derives circuit_v2 public inputs with a TDFOL_v1 trace root fallback or witness', () => {
    const result = deriveCircuitV2Inputs('P', ['P']);
    expect(result.publicInputs).toMatchObject({
      circuit_id: 'circuit_v2',
      circuit_version: 2,
      ruleset_id: 'TDFOL_v1',
    });
    expect(result.publicInputs.theorem_hash).toHaveLength(64);
    expect(result.publicInputs.accumulator_commitment).toHaveLength(64);
    expect(result.publicInputs.tdfol_v1_trace_root).toBeTruthy();
  });

  it('enriches legal theorem semantics and exposes circuit-ready helpers', () => {
    const derivation = deriveTdfolV1Trace('O(Alice,Pay)', ['O(Alice,Pay)']);
    const batch = new LegalTheoremSemantics().deriveBatch(['O(Alice,Pay)', 'P(Bob,Inspect)'], ['O(Alice,Pay)']);
    const circuit = legalTheoremToCircuit('O(Alice,Pay)', ['O(Alice,Pay)']);

    expect(derivation.semantic.normModality).toBe('O');
    expect(derivation.semantic.actor).toBe('Alice');
    expect(derivation.semantic.semanticLabel).toContain('obligation');
    expect(batch).toHaveLength(2);
    expect(circuit.publicInputs.circuit_id).toBe('circuit_v2');
  });
});

describe('PORT-195 witness, verifier, setup, and VK registry', () => {
  it('computes and validates witnesses with stable public inputs', () => {
    const witness = computeWitness({
      statement: 'O(Pay)',
      axiomSet: ['D: O(x)->P(x)'],
      proofTrace: [{ rule: 'axiom', formula: 'O(Pay)' }],
      context: { jurisdiction: 'test' },
    });

    expect(witness.publicInputs.statement_hash).toBeDefined();
    expect(validateWitness(witness).valid).toBe(true);

    const manager = new WitnessManager();
    expect(manager.derivePublicInputs('O(Pay)', ['D: O(x)->P(x)']).axiom_commitment).toBe(witness.publicInputs.axiom_commitment);
  });

  it('verifies proof JSON structurally and rejects invalid JSON', () => {
    const verifier = new ZKPVerifier();
    verifier.loadVerificationKey(makeSimulatedVK('vk-test'));
    const proofJson = JSON.stringify({ proof_hash: 'abc123', algorithm: 'simulated' });

    expect(verifier.verify(proofJson, { statement_hash: 'abc' }).verified).toBe(true);
    expect(verifyProof('{bad', {}).verified).toBe(false);
  });

  it('manages setup artifacts and VK registry payload import/export', () => {
    const artifact = runTrustedSetup('circuit-v2', 'simulated', '2.0.0');
    const store = new SetupArtifactStore();
    store.put(artifact);
    expect(store.getVerifyingKey('circuit-v2')?.keyId).toBe(artifact.verifyingKey.keyId);

    const globalArtifact = getOrCreateArtifact('global-circuit');
    expect(globalArtifact.circuitId).toBe('global-circuit');

    const registry = new VKRegistry();
    const entry = registry.register('circuit-v2', artifact.verifyingKey, { tags: ['test'] });
    expect(entry.tags).toEqual(['test']);
    const imported = new VKRegistry();
    expect(imported.importPayload(registry.exportPayload())).toBe(1);
    expect(imported.getVK('circuit-v2')?.keyId).toBe(artifact.verifyingKey.keyId);

    expect(registerVK('module-circuit', artifact.verifyingKey).circuitId).toBe('module-circuit');
  });
});

describe('PORT-196 on-chain ZKP payloads and submission pipeline', () => {
  const submission = {
    circuitId: 'circuit-v2',
    proofJson: JSON.stringify({ pi_a: '0x01', pi_b: '0x02' }),
    publicInputs: { theorem: 'abcd', axioms: '0x1234' },
    verifyingKey: { alpha: '1', beta: '2' },
    verifierAddress: '0xverifier',
    registryAddress: '0xregistry',
  };

  it('encodes verifier calldata, VK payloads, and gas estimates deterministically', () => {
    const payload = encodeZkpOnchainPayload(submission);
    const estimate = estimateZkpOnchainGas(payload);

    expect(payload.proofHash).toHaveLength(64);
    expect(payload.vkHash.startsWith('0x')).toBe(true);
    expect(payload.packedPublicInputs.every(value => value.startsWith('0x'))).toBe(true);
    expect(payload.verifierCalldata.startsWith('0x')).toBe(true);
    expect(payload.registryCalldata.startsWith('0x')).toBe(true);
    expect(estimate.gasLimit > BigInt(300_000)).toBe(true);
  });

  it('submits through an injectable EVM client and returns receipt metadata', async () => {
    const submitted: string[] = [];
    const result = await submitZkpProofOnchain(submission, {
      async submitTransaction(calldata) {
        submitted.push(calldata);
        return '0xtx';
      },
      async waitForConfirmation(txHash) {
        return { confirmed: txHash === '0xtx', blockNumber: 42, gasUsed: BigInt(321000) };
      },
    });

    expect(submitted[0]).toBe(result.payload.verifierCalldata);
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('0xtx');
    expect(result.blockNumber).toBe(42);
  });
});

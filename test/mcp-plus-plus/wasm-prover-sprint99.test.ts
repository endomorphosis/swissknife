/**
 * wasm-prover-sprint99.test.ts
 * Residual operational gap closure for PORT-209..213.
 */

import {
  Groth16Backend,
  Groth16BackendFallback,
  Groth16Proof,
} from '../../src/services/zkp-backends';
import {
  ZKPVerifier,
  makeSimulatedVK,
} from '../../src/services/zkp-verifier';
import {
  runTrustedSetup,
} from '../../src/services/setup-artifacts';
import {
  EProver,
  ProverStatus,
  VampireProver,
} from '../../src/services/external-provers';
import {
  createEvmSubmissionClient,
  encodeVerifierCalldata,
  encodeVerifyProofSolidityCalldata,
  submitZkpProofOnchain,
} from '../../src/services/zkp-onchain-pipeline';

describe('PORT-209 Groth16 strict native default', () => {
  it('fails closed when no native binary is configured', async () => {
    const backend = new Groth16Backend(null);
    await expect(backend.generateProof('{"witness":1}')).rejects.toThrow(/allowSimulatedFallback:true/);
    await expect(backend.verifyProof('{"proof":true}')).resolves.toBe(false);
    expect(backend.getStats().failures).toBe(1);
  });

  it('still supports explicit deterministic simulation for offline tests', async () => {
    const backend = new Groth16Backend(null, 30_000, undefined, {
      allowSimulatedFallback: true,
      fallbackBackend: new Groth16BackendFallback(),
    });
    const proof = await backend.generateProof('{"witness":1}', 7);
    expect(proof).toBeInstanceOf(Groth16Proof);
    await expect(backend.verifyProof(JSON.stringify(proof.toDict()))).resolves.toBe(true);
  });
});

describe('PORT-211 verifier/setup strict native behavior', () => {
  it('rejects non-simulated proofs unless a native verifier backend is injected', () => {
    const verifier = new ZKPVerifier();
    verifier.loadVerificationKey({
      keyId: 'vk-groth',
      algorithm: 'groth16',
      parameters: {},
      loadedAt: 1,
    });

    const result = verifier.verify(JSON.stringify({ algorithm: 'groth16', proof_hash: 'abc123' }), { signal: '1' });
    expect(result.verified).toBe(false);
    expect(result.error).toContain('native groth16 verifier not configured');
    expect(verifier.isReady()).toBe(false);
  });

  it('delegates non-simulated verification to an injected backend', () => {
    const verifier = new ZKPVerifier({
      groth16Backend: {
        verifyProof(proofJson, publicInputs, vk) {
          return proofJson.includes('abc123') && publicInputs.signal === '1' && vk?.keyId === 'vk-groth';
        },
      },
    });
    verifier.loadVerificationKey({
      keyId: 'vk-groth',
      algorithm: 'groth16',
      parameters: {},
      loadedAt: 1,
    });

    const result = verifier.verify(JSON.stringify({ algorithm: 'groth16', proof_hash: 'abc123' }), { signal: '1' });
    expect(result.verified).toBe(true);
    expect(result.error).toBeNull();
    expect(verifier.isReady()).toBe(true);
  });

  it('requires an explicit simulated setup or native trusted setup runner', () => {
    expect(() => runTrustedSetup('native-circuit', 'groth16')).toThrow(/trusted setup runner not configured/);

    const simulated = runTrustedSetup('sim-circuit', 'simulated');
    expect(simulated.algorithm).toBe('simulated');

    const native = runTrustedSetup('native-circuit', 'groth16', '1.0.0', {
      runner: ({ circuitId, algorithm, version }) => {
        const base = runTrustedSetup(`${circuitId}-material`, 'simulated', version);
        return { ...base, circuitId, algorithm };
      },
    });
    expect(native.algorithm).toBe('groth16');
    expect(native.circuitId).toBe('native-circuit');
  });

  it('still accepts explicitly simulated VKs for test-only proofs', () => {
    const verifier = new ZKPVerifier();
    verifier.loadVerificationKey(makeSimulatedVK('vk-sim'));
    const result = verifier.verify(JSON.stringify({ algorithm: 'simulated', proof_hash: 'abc123' }), { signal: '1' });
    expect(result.verified).toBe(true);
  });
});

describe('PORT-212 external ATP strict defaults', () => {
  it('defaults E and Vampire to unavailable errors when binaries are missing', () => {
    const eprover = new EProver({ availabilityCheck: () => false });
    const vampire = new VampireProver({ availabilityCheck: () => false });

    expect(eprover.prove('forall x. P(x)').status).toBe(ProverStatus.ERROR);
    expect(vampire.prove('forall x. x = x').status).toBe(ProverStatus.ERROR);
  });

  it('keeps simulation available only as explicit compatibility mode', () => {
    const eprover = new EProver({ availabilityCheck: () => false, allowSimulatedFallback: true });
    const vampire = new VampireProver({ availabilityCheck: () => false, allowSimulatedFallback: true });

    expect(eprover.prove('forall x. P(x)').status).toBe(ProverStatus.THEOREM);
    expect(vampire.prove('forall x. x = x').status).toBe(ProverStatus.THEOREM);
  });
});

describe('PORT-213 ABI calldata and EVM client adapter', () => {
  const proofJson = JSON.stringify({ proof: '0x010203' });
  const publicInputs = { theorem: '0x01', axioms: '0x02' };

  it('ABI-encodes verifyProof(bytes,uint256[]) calldata instead of JSON-hex payloads', () => {
    const calldata = encodeVerifierCalldata(proofJson, publicInputs);
    expect(calldata).toBe(encodeVerifyProofSolidityCalldata(proofJson, publicInputs));
    expect(calldata.startsWith('0x43753b4d')).toBe(true);
    expect(calldata).toContain('0000000000000000000000000000000000000000000000000000000000000002');
  });

  it('adapts viem/ethers-like wallet clients to EvmSubmissionClient', async () => {
    const sent: Array<{ to?: string; data: string; gas?: bigint; gasLimit?: bigint }> = [];
    const client = createEvmSubmissionClient({
      async sendTransaction(args) {
        sent.push(args);
        return { hash: '0xtxhash' };
      },
      async waitForTransactionReceipt({ hash }) {
        return { status: hash === '0xtxhash' ? 'success' : 'reverted', blockNumber: BigInt(9), gasUsed: BigInt(123456) };
      },
    });

    const result = await submitZkpProofOnchain({
      circuitId: 'circuit',
      proofJson,
      publicInputs,
      verifyingKey: { alpha: '1' },
      verifierAddress: '0x0000000000000000000000000000000000000001',
    }, client);

    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('0xtxhash');
    expect(result.blockNumber).toBe(9);
    expect(sent[0].data.startsWith('0x43753b4d')).toBe(true);
    expect(sent[0].gasLimit).toBeGreaterThan(BigInt(300000));
  });
});

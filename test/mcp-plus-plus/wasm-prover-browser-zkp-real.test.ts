import {
  BrowserSchnorrZkpBackend,
  BROWSER_SCHNORR_BACKEND_ID,
  instantiateSchnorrWasmHelper,
} from '../../src/services/zkp-browser-schnorr';

describe('browser real ZKP backend', () => {
  test('instantiates the committed WASM helper', async () => {
    const wasm = await instantiateSchnorrWasmHelper();
    expect(wasm.add_mod(7, 8, 10)).toBe(5);
  });

  test('generates and verifies a Schnorr Fiat-Shamir proof', async () => {
    const backend = new BrowserSchnorrZkpBackend();
    const proof = await backend.generateProof(JSON.stringify({
      statement: 'O(log_access)',
      publicInputs: { policy: 'audit' },
      privateWitness: { derivation: ['axiom:audit', 'rule:obligation'] },
    }));

    expect(proof.metadata.backend).toBe(BROWSER_SCHNORR_BACKEND_ID);
    await expect(backend.verifyProof(JSON.stringify(proof.toDict()))).resolves.toBe(true);
  });

  test('rejects a tampered transcript', async () => {
    const backend = new BrowserSchnorrZkpBackend();
    const proof = await backend.generateProof(JSON.stringify({
      statement: 'P(read)',
      publicInputs: { policy: 'read' },
      secret: 'reader-witness',
    }));
    const payload = proof.payload();
    const tampered = { ...payload, statement: 'P(write)' };

    await expect(backend.verifyProof(JSON.stringify(tampered))).resolves.toBe(false);
  });
});

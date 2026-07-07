import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { BrowserSnarkjsGroth16Backend } from '../../src/services/zkp/browser-snarkjs-backend';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  readFileSync: (path: string, encoding?: BufferEncoding) => Buffer | string;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for Groth16 artifact fixture tests');
}

const ROOT = resolve(__dirname, '../..');
const ARTIFACT_DIR = resolve(ROOT, 'src/services/zkp/artifacts/groth16/deontic_discharge_v1');

interface ArtifactManifest {
  circuitId: string;
  proofSystem: string;
  publicInputs: string[];
  privateInputs: string[];
  artifacts: Record<string, { bytes: number; sha256: string }>;
}

function manifest(): ArtifactManifest {
  return JSON.parse(nodeFs.readFileSync(resolve(ARTIFACT_DIR, 'manifest.json'), 'utf8') as string) as ArtifactManifest;
}

function sha256File(path: string): string {
  return createHash('sha256').update(nodeFs.readFileSync(path) as Buffer).digest('hex');
}

describe('browser Groth16 semantic circuit corpus', () => {
  test('committed artifacts match the manifest', () => {
    const m = manifest();
    expect(m.circuitId).toBe('deontic_discharge_v1');
    expect(m.proofSystem).toBe('groth16');
    expect(m.publicInputs).toEqual(['obligation', 'expected_discharge']);
    expect(m.privateInputs).toEqual(['permitted', 'not_prohibited']);

    for (const [file, expected] of Object.entries(m.artifacts)) {
      const path = resolve(ARTIFACT_DIR, file);
      expect((nodeFs.readFileSync(path) as Buffer).byteLength).toBe(expected.bytes);
      expect(sha256File(path)).toBe(expected.sha256);
    }
  });

  test('generates and verifies a valid deontic-discharge Groth16 proof', async () => {
    const backend = new BrowserSnarkjsGroth16Backend({
      wasmPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1.wasm'),
      zkeyPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1_final.zkey'),
      verificationKey: JSON.parse(nodeFs.readFileSync(resolve(ARTIFACT_DIR, 'verification_key.json'), 'utf8') as string),
    });

    const proof = await backend.generateProof(JSON.stringify({
      obligation: 1,
      expected_discharge: 1,
      permitted: 1,
      not_prohibited: 1,
    }));

    const dict = proof.toDict();
    expect(dict.metadata).toMatchObject({ backend: 'snarkjs-browser' });
    expect((dict.publicSignals as unknown[]).map(String)).toEqual(['1', '1']);
    await expect(backend.verifyProof(JSON.stringify(dict))).resolves.toBe(true);
  });

  test('rejects a witness that violates the deontic-discharge constraint', async () => {
    const backend = new BrowserSnarkjsGroth16Backend({
      wasmPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1.wasm'),
      zkeyPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1_final.zkey'),
      verificationKey: JSON.parse(nodeFs.readFileSync(resolve(ARTIFACT_DIR, 'verification_key.json'), 'utf8') as string),
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(backend.generateProof(JSON.stringify({
        obligation: 1,
        expected_discharge: 1,
        permitted: 0,
        not_prohibited: 1,
      }))).rejects.toThrow();
    } finally {
      consoleError.mockRestore();
    }
  });

  test('rejects tampered public signals', async () => {
    const backend = new BrowserSnarkjsGroth16Backend({
      wasmPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1.wasm'),
      zkeyPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1_final.zkey'),
      verificationKey: JSON.parse(nodeFs.readFileSync(resolve(ARTIFACT_DIR, 'verification_key.json'), 'utf8') as string),
    });

    const proof = await backend.generateProof(JSON.stringify({
      obligation: 1,
      expected_discharge: 1,
      permitted: 1,
      not_prohibited: 1,
    }));
    const tampered = { ...proof.toDict(), publicSignals: ['1', '0'] };

    await expect(backend.verifyProof(JSON.stringify(tampered))).resolves.toBe(false);
  });
});

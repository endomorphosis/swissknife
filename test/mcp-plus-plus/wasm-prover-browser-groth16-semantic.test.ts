import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { vi } from 'vitest';
import {
  BROWSER_SNARKJS_GROTH16_BACKEND_ID,
  BrowserSnarkjsGroth16Backend,
  createBrowserZkpProductionBackend,
} from '../../src/services/zkp/browser-snarkjs-backend';
import {
  BrowserZkpArtifactIntegrityError,
  BrowserZkpArtifactUnavailableError,
  resolveBrowserGroth16Artifacts,
} from '../../src/services/zkp/artifacts';

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
  return JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'manifest.json'), 'utf8')) as ArtifactManifest;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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
      expect(readFileSync(path).byteLength).toBe(expected.bytes);
      expect(sha256File(path)).toBe(expected.sha256);
    }
  });

  test('resolves the default browser artifact set deterministically with integrity metadata', async () => {
    const artifacts = resolveBrowserGroth16Artifacts();
    expect(artifacts.circuitId).toBe('deontic_discharge_v1');
    expect(artifacts.wasm.fileName).toBe('deontic_discharge_v1.wasm');
    expect(artifacts.zkey.fileName).toBe('deontic_discharge_v1_final.zkey');
    expect(artifacts.verificationKey.fileName).toBe('verification_key.json');
    expect(artifacts.wasm.sha256).toBe(manifest().artifacts['deontic_discharge_v1.wasm'].sha256);
    expect(artifacts.zkey.sri).toMatch(/^sha256-/);

    const snarkjs = {
      groth16: {
        fullProve: vi.fn(async () => ({
          proof: { pi_a: ['1', '2', '1'] },
          publicSignals: ['1', '1'],
        })),
        verify: vi.fn(async () => true),
      },
    };
    const fetchArtifact = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const file = basename(new URL(url).pathname);
      return new Response(readFileSync(resolve(ARTIFACT_DIR, file)), { status: 200 });
    });
    const backend = new BrowserSnarkjsGroth16Backend({ fetch: fetchArtifact, snarkjs });

    const proof = await backend.generateProof(JSON.stringify({
      obligation: 1,
      expected_discharge: 1,
      permitted: 1,
      not_prohibited: 1,
    }));

    expect(snarkjs.groth16.fullProve).toHaveBeenCalledWith(
      expect.any(Object),
      artifacts.wasm.url,
      artifacts.zkey.url,
    );
    expect(fetchArtifact).toHaveBeenCalledTimes(2);
    expect(proof.metadata).toMatchObject({
      backend_id: BROWSER_SNARKJS_GROTH16_BACKEND_ID,
      circuitId: 'deontic_discharge_v1',
      artifactDigest: artifacts.artifactDigest,
    });
    expect((proof.metadata.artifactIntegrity as Record<string, unknown>).mode).toBe('strict');
  });

  test('fails closed on artifact integrity mismatch', async () => {
    const snarkjs = {
      groth16: {
        fullProve: vi.fn(async () => ({ proof: {}, publicSignals: [] })),
        verify: vi.fn(async () => true),
      },
    };
    const backend = new BrowserSnarkjsGroth16Backend({
      snarkjs,
      fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    });

    await expect(backend.generateProof(JSON.stringify({
      obligation: 1,
      expected_discharge: 1,
      permitted: 1,
      not_prohibited: 1,
    }))).rejects.toBeInstanceOf(BrowserZkpArtifactIntegrityError);
    expect(snarkjs.groth16.fullProve).not.toHaveBeenCalled();
  });

  test('refuses simulated proof helpers as production browser backends', () => {
    expect(() => createBrowserZkpProductionBackend('simulated')).toThrow(BrowserZkpArtifactUnavailableError);
  });

  test('generates and verifies a valid deontic-discharge Groth16 proof', async () => {
    const backend = new BrowserSnarkjsGroth16Backend({
      wasmPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1.wasm'),
      zkeyPath: resolve(ARTIFACT_DIR, 'deontic_discharge_v1_final.zkey'),
      verificationKey: JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'verification_key.json'), 'utf8')),
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
      verificationKey: JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'verification_key.json'), 'utf8')),
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
      verificationKey: JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'verification_key.json'), 'utf8')),
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

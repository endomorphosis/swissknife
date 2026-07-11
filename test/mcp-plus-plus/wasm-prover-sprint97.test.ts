/**
 * wasm-prover-sprint97.test.ts
 * Tests for Sprint 6a / T-46..T-50 Lurk WASM package adapter closure.
 */

import {
  LurkWasmBridge,
  computeZKProofArtifactCid,
  loadLurkPackage,
  normalizeLurkWasmModule,
  type LurkWasmModule,
  type ZKProofArtifact,
} from '../../src/services/provers/lurk-wasm-bridge';
import type { Policy } from '../../src/services/mcp/mcp-mcp-policy.js';

function obligationPolicy(): Policy {
  return {
    id: 'lurk-policy-1',
    version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [],
    obligations: [{ description: 'audit access', requiredCap: 'mcp++/audit' }],
  };
}

describe('Sprint97 Lurk WASM package loading', () => {
  it('normalizes default-exported lurk-wasm modules', () => {
    const mod = normalizeLurkWasmModule({
      default: {
        evaluate: jest.fn().mockReturnValue({ result: 't', proof: 'proof' }),
        verify: jest.fn().mockReturnValue(true),
      },
    });

    expect(mod).not.toBeNull();
    expect(typeof mod?.evaluate).toBe('function');
  });

  it('rejects modules without a proving entry point', async () => {
    await expect(loadLurkPackage('fake-lurk', async () => ({ nope: true }))).rejects.toThrow(/does not expose/);
  });

  it('loads an injected package by package name', async () => {
    const importer = jest.fn().mockResolvedValue({
      prove: jest.fn().mockReturnValue({ result: 't', proof: 'bytes' }),
      verify: jest.fn().mockReturnValue(true),
    });

    const mod = await loadLurkPackage('@local/lurk-wasm', importer);

    expect(importer).toHaveBeenCalledWith('@local/lurk-wasm');
    expect(typeof mod.prove).toBe('function');
  });

  it('create() can use a package importer instead of a direct module', async () => {
    const importer = jest.fn().mockResolvedValue({
      evaluate: jest.fn().mockReturnValue({ result: true, proof: 'native-proof' }),
      verify: jest.fn().mockReturnValue(true),
    });

    const bridge = await LurkWasmBridge.create({ packageName: '@local/lurk-wasm', importer });
    const result = await bridge.proveObligationDischarge(obligationPolicy());

    expect(bridge.isAvailable()).toBe(true);
    expect(importer).toHaveBeenCalledWith('@local/lurk-wasm');
    expect(result.reason).toBe('proved');
    expect(result.artifact?.artifact_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('strict create() surfaces package loading errors', async () => {
    await expect(LurkWasmBridge.create({
      packageName: '@missing/lurk-wasm',
      importer: async () => ({ nope: true }),
      strict: true,
    })).rejects.toThrow(/does not expose/);
  });
});

describe('Sprint97 Lurk native proof and verification adapter', () => {
  it('uses prove() when evaluate() is not exported and preserves proof_b64 payloads', async () => {
    const prove = jest.fn().mockReturnValue({
      result: 't',
      proof_b64: 'YWJjZA==',
      backend: 'nova',
      public_inputs: ['pub-1'],
      vk: { circuit: 'lurk-beta' },
    });
    const module: LurkWasmModule = { prove };
    const bridge = await LurkWasmBridge.create(module);

    const result = await bridge.proveObligationDischarge(obligationPolicy(), 1234);

    expect(prove.mock.calls[0][0]).toContain('dischargeable');
    expect(prove.mock.calls[0][1]).toMatchObject({ timeoutMs: 1234, policy: obligationPolicy() });
    expect(result.artifact?.backend).toBe('nova');
    expect(result.artifact?.proof_b64).toBe('YWJjZA');
    expect(result.artifact?.public_inputs).toEqual(['pub-1']);
  });

  it('computes artifact CIDs deterministically and ignores the existing artifact_cid field', async () => {
    const bridge = await LurkWasmBridge.create({
      evaluate: jest.fn().mockReturnValue({ result: true, proof: Uint8Array.from([1, 2, 3]) }),
      verify: jest.fn().mockReturnValue(true),
    });
    const result = await bridge.proveObligationDischarge(obligationPolicy());
    const artifact = result.artifact as ZKProofArtifact;

    expect(artifact.artifact_cid).toBe(computeZKProofArtifactCid(artifact));
    expect(computeZKProofArtifactCid({ ...artifact, artifact_cid: 'sha256:' + '0'.repeat(64) })).toBe(artifact.artifact_cid);
  });

  it('verifies a fresh artifact through native verify()', async () => {
    const verify = jest.fn().mockReturnValue(true);
    const bridge = await LurkWasmBridge.create({
      evaluate: jest.fn().mockReturnValue({ result: 't', proof: 'proof-bytes', vk_cid: 'sha256:' + 'a'.repeat(64) }),
      verify,
    });

    const result = await bridge.proveObligationDischarge(obligationPolicy());
    const verified = await bridge.verifyProof(result.artifact as ZKProofArtifact);

    expect(verified).toBe(true);
    expect(verify).toHaveBeenCalledWith(
      result.artifact?.proof_b64,
      result.artifact?.vk_cid,
      result.artifact?.public_inputs,
      result.artifact,
    );
  });

  it('rejects tampered artifacts before calling native verify()', async () => {
    const verify = jest.fn().mockReturnValue(true);
    const bridge = await LurkWasmBridge.create({
      evaluate: jest.fn().mockReturnValue({ result: 't', proof: 'proof-bytes' }),
      verify,
    });

    const result = await bridge.proveObligationDischarge(obligationPolicy());
    const tampered = { ...(result.artifact as ZKProofArtifact), public_inputs: ['changed'] };

    await expect(bridge.verifyProof(tampered)).resolves.toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });

  it('supports native verifyProof(artifact) exports', async () => {
    const verifyProof = jest.fn().mockReturnValue(true);
    const bridge = await LurkWasmBridge.create({
      proveObligationDischarge: jest.fn().mockReturnValue({ result: true, proof: [7, 8, 9] }),
      verifyProof,
    });

    const result = await bridge.proveObligationDischarge(obligationPolicy());
    await expect(bridge.verifyProof(result.artifact as ZKProofArtifact)).resolves.toBe(true);
    expect(verifyProof).toHaveBeenCalledWith(result.artifact);
  });
});

const liveIt = process.env.LURK_WASM_LIVE === '1' ? it : it.skip;

describe('Sprint97 live lurk-wasm package gate', () => {
  liveIt('loads the configured live lurk-wasm package when LURK_WASM_LIVE=1', async () => {
    const mod = await loadLurkPackage(process.env.LURK_WASM_PACKAGE ?? 'lurk-wasm');
    expect(mod).toBeDefined();
  });
});

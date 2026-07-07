/**
 * wasm-prover-sprint98.test.ts
 * Tests for Sprint 8 / T-55..T-56 multi-stark adapter closure.
 */

import {
  MultiStarkBridge,
  loadMultiStarkPackage,
  multiStarkBuildInstructions,
  normalizeMultiStarkModule,
  policyObligationsToMultiStarkInputs,
} from '../../src/services/provers/multi-stark-bridge';
import { computeZKProofArtifactCid, type ZKProofArtifact } from '../../src/services/provers/lurk-wasm-bridge';
import type { Policy } from '../../src/services/logic/deontic/mcp-policy';

function multiObligationPolicy(): Policy {
  return {
    id: 'multi-stark-policy',
    version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [],
    obligations: [
      { description: 'audit access', requiredCap: 'mcp++/audit', rsc: 'tool:a' },
      { description: 'record provenance', requiredCap: 'mcp++/provenance', rsc: 'tool:b' },
    ],
  };
}

describe('Sprint98 multi-stark package evaluation and loading', () => {
  it('normalizes default-exported multi-stark modules', () => {
    const mod = normalizeMultiStarkModule({
      default: {
        proveMultiple: jest.fn().mockReturnValue({ proof: 'proof' }),
        verifyBatch: jest.fn().mockReturnValue(true),
      },
    });

    expect(mod).not.toBeNull();
    expect(typeof mod?.proveMultiple).toBe('function');
  });

  it('rejects modules without a multi-proof entry point', async () => {
    await expect(loadMultiStarkPackage('fake-multi-stark', async () => ({ nope: true }))).rejects.toThrow(/does not expose/);
  });

  it('loads an injected package by package name', async () => {
    const importer = jest.fn().mockResolvedValue({
      proveMultipleObligations: jest.fn().mockReturnValue({ proof: 'batch' }),
      verifyBatch: jest.fn().mockReturnValue(true),
    });

    const mod = await loadMultiStarkPackage('@local/multi-stark-wasm', importer);

    expect(importer).toHaveBeenCalledWith('@local/multi-stark-wasm');
    expect(typeof mod.proveMultipleObligations).toBe('function');
  });

  it('returns useful local build instructions', () => {
    const instructions = multiStarkBuildInstructions();
    expect(instructions).toContain('argumentcomputer/multi-stark');
    expect(instructions).toContain('proveMultiple');
  });
});

describe('Sprint98 MultiStarkBridge proof adapter', () => {
  it('converts policy obligations into deterministic circuit inputs', () => {
    const inputs = policyObligationsToMultiStarkInputs(multiObligationPolicy());

    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      circuit_id: 'mcp-obligation-0',
      policy_id: 'multi-stark-policy',
      required_cap: 'mcp++/audit',
      resource: 'tool:a',
    });
  });

  it('returns no artifacts in stub mode or with no obligations', async () => {
    const bridge = await MultiStarkBridge.create();
    expect(bridge.isAvailable()).toBe(false);
    await expect(bridge.proveMultipleObligations(multiObligationPolicy())).resolves.toEqual([]);
    await expect(bridge.proveMultipleObligations({ ...multiObligationPolicy(), obligations: [] })).resolves.toEqual([]);
  });

  it('uses a package importer and maps a bundled proof to all obligations', async () => {
    const proveMultiple = jest.fn().mockReturnValue({
      proof_b64: 'YnVuZGxlZA==',
      backend: 'plonky3',
      public_inputs: ['shared'],
      vk: { key: 'vk' },
    });
    const bridge = await MultiStarkBridge.create({
      packageName: '@local/multi-stark-wasm',
      importer: jest.fn().mockResolvedValue({ proveMultiple, verifyBatch: jest.fn().mockReturnValue(true) }),
    });

    const artifacts = await bridge.proveMultipleObligations(multiObligationPolicy(), 4321);

    expect(proveMultiple.mock.calls[0][0]).toHaveLength(2);
    expect(proveMultiple.mock.calls[0][1]).toMatchObject({ timeoutMs: 4321 });
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].proof_b64).toBe('YnVuZGxlZA');
    expect(artifacts[0].artifact_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('maps per-circuit proofs into per-obligation artifacts', async () => {
    const bridge = await MultiStarkBridge.create({
      proveMultiple: jest.fn().mockReturnValue({
        proofs: [
          { proof: 'p1', public_inputs: ['i1'] },
          { proof: 'p2', public_inputs: ['i2'] },
        ],
      }),
      verify: jest.fn().mockReturnValue(true),
    });

    const artifacts = await bridge.proveMultipleObligations(multiObligationPolicy());

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].public_inputs).toEqual(['i1']);
    expect(artifacts[1].public_inputs).toEqual(['i2']);
    expect(artifacts[0].statement).toContain('audit access');
    expect(artifacts[1].statement).toContain('record provenance');
  });

  it('verifies a fresh batch through native verifyBatch()', async () => {
    const verifyBatch = jest.fn().mockReturnValue(true);
    const bridge = await MultiStarkBridge.create({
      proveMultiple: jest.fn().mockReturnValue({ proof: 'batch-proof', vk_cid: 'sha256:' + 'b'.repeat(64) }),
      verifyBatch,
    });

    const artifacts = await bridge.proveMultipleObligations(multiObligationPolicy());
    const verified = await bridge.verifyProofs(artifacts);

    expect(verified).toBe(true);
    expect(verifyBatch).toHaveBeenCalledWith(artifacts);
  });

  it('rejects tampered artifacts before native verification', async () => {
    const verify = jest.fn().mockReturnValue(true);
    const bridge = await MultiStarkBridge.create({
      proveMultiple: jest.fn().mockReturnValue({ proof: 'batch-proof' }),
      verify,
    });

    const artifacts = await bridge.proveMultipleObligations(multiObligationPolicy());
    const tampered: ZKProofArtifact = { ...artifacts[0], public_inputs: ['changed'] };

    await expect(bridge.verifyProof(tampered)).resolves.toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(artifacts[0].artifact_cid).toBe(computeZKProofArtifactCid(artifacts[0]));
  });
});

const liveIt = process.env.MULTI_STARK_LIVE === '1' ? it : it.skip;

describe('Sprint98 live multi-stark package gate', () => {
  liveIt('loads the configured live multi-stark package when MULTI_STARK_LIVE=1', async () => {
    const mod = await loadMultiStarkPackage(process.env.MULTI_STARK_PACKAGE ?? 'multi-stark-wasm');
    expect(mod).toBeDefined();
  });
});

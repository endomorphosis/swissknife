import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ceremonyCid,
  type Groth16MpcCeremonyManifest,
  validateGroth16MpcCeremony,
} from '../../src/services/zkp/multi-party-ceremony';

const fixturePath = resolve(__dirname, '../../../Mcp-Plus-Plus/tests-py/fixtures/valid/profile_f_groth16_mpc_ceremony.json');

function fixture(): Groth16MpcCeremonyManifest {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Groth16MpcCeremonyManifest;
}

describe('MCP++ Profile F Groth16 multi-party ceremony', () => {
  it('accepts the shared complete transcript as production eligible', () => {
    const result = validateGroth16MpcCeremony(fixture());

    expect(result).toMatchObject({
      valid: true,
      productionEligible: true,
      independentContributors: ['did:key:z6MkhAlice', 'did:key:z6MkhBob'],
      reasons: [],
    });
    expect(ceremonyCid(fixture())).toBe(result.ceremonyCid);
    expect(result.ceremonyCid).toBe('sha256:645338f97ee9f1d17529c4be2b88f928b8bc4c19d906172f0ba0d269780f04b8');
  });

  it('rejects a contribution that is not anchored to the initial zkey', () => {
    const manifest = fixture();
    const contributions = manifest.contributions.map(contribution => ({ ...contribution }));
    contributions[0].inputArtifactSha256 = '0'.repeat(64);
    const result = validateGroth16MpcCeremony({ ...manifest, contributions });

    expect(result.valid).toBe(false);
    expect(result.productionEligible).toBe(false);
    expect(result.reasons).toContain('broken_artifact_chain_1');
  });

  it('does not admit a collecting or single-party transcript to production', () => {
    const manifest = fixture();
    const result = validateGroth16MpcCeremony({
      ...manifest,
      contributions: [manifest.contributions[0]],
      finalZkey: undefined,
      verificationKey: undefined,
      status: 'collecting',
      finalizedAt: undefined,
    });

    expect(result.valid).toBe(true);
    expect(result.productionEligible).toBe(false);
    expect(result.reasons).toEqual(['independent_contributor_quorum_not_met']);
  });

  it('rejects an artifact CID that does not commit to the stated hash', () => {
    const manifest = fixture();
    const result = validateGroth16MpcCeremony({
      ...manifest,
      verificationKey: { ...manifest.verificationKey!, cid: `sha256:${'0'.repeat(64)}` },
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('incomplete_finalization');
  });

  it('rejects an unrecognized implementation-specific key format', () => {
    const manifest = fixture();
    const result = validateGroth16MpcCeremony({
      ...manifest,
      keyFormat: 'unknown-key-format' as never,
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('invalid_key_format');
  });
});

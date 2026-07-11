import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import * as ucans from '@ucans/ucans';
import { verifyMCPPPeerIdentity } from '../../src/services/mcp/mcp-plus-plus-profile-c';

function base32Lower(bytes: Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let accumulator = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(accumulator >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

function proofCid(token: string): string {
  const digest = createHash('sha256').update(token, 'utf8').digest();
  return `b${base32Lower(Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]))}`;
}

describe('MCP++ Profile C peer identity verification', () => {
  it('accepts a signed UCAN identity bound to its audience, nonce, service, and transport', async () => {
    const issuer = await ucans.EdKeypair.create({ exportable: true });
    const audience = await ucans.EdKeypair.create({ exportable: true });
    const nonce = 'profile-c-test-nonce-0123456789';
    const token = await ucans.build({
      issuer,
      audience: audience.did(),
      capabilities: [{
        with: { scheme: 'mcp++', hierPart: '//ipfs_kit_py/peer' },
        can: { namespace: 'mcp++', segments: ['IDENTIFY'] },
      }],
      lifetimeInSeconds: 60,
      facts: [{
        mcpplusplus: {
          schema: 'mcp++/profile-c-peer-identity@1',
          service: 'ipfs_kit_py',
          nonce,
          transport: 'libp2p',
        },
      }],
      addNonce: true,
    });
    const encoded = ucans.encode(token);
    const identity = {
      did: issuer.did(),
      service: 'ipfs_kit_py',
      transport: 'libp2p',
      nonce,
      ucan: encoded,
      proof_cid: proofCid(encoded),
      peer_id: '12D3KooWProfileCTest',
      multiaddr: '/ip4/127.0.0.1/tcp/9114/p2p/12D3KooWProfileCTest',
    };

    await expect(verifyMCPPPeerIdentity(identity, {
      audience: audience.did(),
      nonce,
      service: 'ipfs_kit_py',
      transport: 'libp2p',
    })).resolves.toMatchObject({
      valid: true,
      did: issuer.did(),
      peerId: identity.peer_id,
      multiaddr: identity.multiaddr,
    });
  });

  it('rejects a valid signature replayed with a different nonce', async () => {
    const issuer = await ucans.EdKeypair.create({ exportable: true });
    const audience = await ucans.EdKeypair.create({ exportable: true });
    const signedNonce = 'profile-c-signed-nonce-0123456789';
    const token = await ucans.build({
      issuer,
      audience: audience.did(),
      capabilities: [{
        with: { scheme: 'mcp++', hierPart: '//ipfs_datasets_py/peer' },
        can: { namespace: 'mcp++', segments: ['IDENTIFY'] },
      }],
      lifetimeInSeconds: 60,
      facts: [{
        mcpplusplus: {
          schema: 'mcp++/profile-c-peer-identity@1',
          service: 'ipfs_datasets_py',
          nonce: signedNonce,
          transport: 'http',
        },
      }],
      addNonce: true,
    });
    const encoded = ucans.encode(token);
    const result = await verifyMCPPPeerIdentity({
      did: issuer.did(),
      service: 'ipfs_datasets_py',
      transport: 'http',
      nonce: signedNonce,
      ucan: encoded,
      proof_cid: proofCid(encoded),
    }, {
      audience: audience.did(),
      nonce: 'profile-c-replayed-nonce-0123456789',
      service: 'ipfs_datasets_py',
      transport: 'http',
    });

    expect(result).toMatchObject({ valid: false, did: null, proofCid: null });
    expect(result.reason).toMatch(/bound to this request/i);
  });
});

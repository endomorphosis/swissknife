import { createHash } from 'node:crypto';
import * as ucans from '@ucans/ucans';

export interface MCPPPPeerIdentity {
  valid: boolean;
  did: string | null;
  proofCid: string | null;
  peerId: string | null;
  multiaddr: string | null;
  reason?: string;
}

const DID_KEY_PATTERN = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;

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

function proofCid(ucan: string): string {
  const digest = createHash('sha256').update(ucan, 'utf8').digest();
  return `b${base32Lower(Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]))}`;
}

function identityCapability(service: string) {
  return {
    with: { scheme: 'mcp++', hierPart: `//${service}/peer` },
    can: { namespace: 'mcp++', segments: ['IDENTIFY'] },
  };
}

/**
 * Verify the signed Profile C identity response before treating its DID as a
 * peer identity. The nonce and transport check prevents cross-connection
 * replay, while the capability pins the proof to this MCP++ service.
 */
export async function verifyMCPPPeerIdentity(
  response: unknown,
  expected: { audience: string; nonce: string; service: string; transport: 'http' | 'libp2p' },
): Promise<MCPPPPeerIdentity> {
  try {
    if (!response || typeof response !== 'object') throw new Error('Profile C peer identity response is missing.');
    const identity = response as Record<string, unknown>;
    const did = typeof identity.did === 'string' ? identity.did : '';
    if (!DID_KEY_PATTERN.test(did)) throw new Error('Profile C peer DID is not an Ed25519 did:key DID.');
    if (!DID_KEY_PATTERN.test(expected.audience)) throw new Error('Local UCAN audience is not an Ed25519 did:key DID.');
    if (identity.service !== expected.service || identity.transport !== expected.transport || identity.nonce !== expected.nonce) {
      throw new Error('Profile C peer identity response is not bound to this request.');
    }
    const token = typeof identity.ucan === 'string' ? identity.ucan : '';
    if (!token) throw new Error('Profile C peer identity response does not contain a UCAN.');
    const verification = await ucans.verify(token, {
      audience: expected.audience,
      requiredCapabilities: [{ capability: identityCapability(expected.service), rootIssuer: did }],
      isRevoked: async () => false,
      checkFacts: facts => facts.some(fact => {
        const profile = fact && typeof fact === 'object'
          ? (fact as { mcpplusplus?: Record<string, unknown> }).mcpplusplus
          : undefined;
        return profile?.schema === 'mcp++/profile-c-peer-identity@1'
          && profile.service === expected.service
          && profile.nonce === expected.nonce
          && profile.transport === expected.transport;
      }),
    });
    if (!verification.ok) throw new Error('Profile C peer identity UCAN verification failed.');
    const cid = proofCid(token);
    if (identity.proof_cid !== cid) throw new Error('Profile C identity proof CID does not match the UCAN bytes.');
    return {
      valid: true,
      did,
      proofCid: cid,
      peerId: typeof identity.peer_id === 'string' ? identity.peer_id : null,
      multiaddr: typeof identity.multiaddr === 'string' ? identity.multiaddr : null,
    };
  } catch (error) {
    return {
      valid: false,
      did: null,
      proofCid: null,
      peerId: null,
      multiaddr: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

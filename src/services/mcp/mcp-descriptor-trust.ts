import {
  createPublicKey,
  verify as cryptoVerify,
} from 'crypto';
import {
  canonicalize,
  computeInterfaceCID,
  type InterfaceDescriptor,
} from './mcp-idl.js';
import type {
  MCPUIDescriptorTrustMetadata,
  MCPUIProfileDescriptor,
} from './mcp-ui-profile.js';

export interface MCPUIDescriptorTrustPolicy {
  require_signature?: boolean;
  allowed_publishers?: string[];
  allowed_signers?: string[];
}

export interface MCPUIDescriptorTrustKeystore {
  sign(data: Uint8Array, did: string): Uint8Array;
  verify(data: Uint8Array, signature: Uint8Array, did: string): boolean;
}

export type MCPUIDescriptorTrustStatus =
  | 'trusted'
  | 'unsigned'
  | 'invalid'
  | 'rejected';

export interface MCPUIDescriptorTrustResult {
  status: MCPUIDescriptorTrustStatus;
  launch_allowed: boolean;
  reasons: string[];
  publisher?: string;
  signed_by?: string;
  canonical_cid?: string;
}

export function signMCPUIProfileDescriptor(
  descriptor: MCPUIProfileDescriptor,
  signerDid: string,
  keystore: MCPUIDescriptorTrustKeystore,
  signedAt: string = new Date().toISOString(),
): MCPUIProfileDescriptor {
  const unsigned = stripDescriptorTrust(descriptor);
  const canonicalBytes = canonicalize(unsigned);
  const signature = keystore.sign(new Uint8Array(canonicalBytes), signerDid);
  const trust: MCPUIDescriptorTrustMetadata = {
    signed_by: signerDid,
    signature_algorithm: 'Ed25519',
    signature: base64urlEncode(signature),
    signed_at: signedAt,
    canonical_cid: computeInterfaceCID(unsigned),
  };
  return {
    ...unsigned,
    trust,
  };
}

export function verifyMCPUIProfileDescriptorTrust(
  descriptor: Partial<MCPUIProfileDescriptor>,
  policy: MCPUIDescriptorTrustPolicy = {},
  keystore: MCPUIDescriptorTrustKeystore = didKeyVerifier,
): MCPUIDescriptorTrustResult {
  const reasons: string[] = [];
  const publisher = descriptor.meta?.publisher;
  const trust = descriptor.trust;

  if (policy.allowed_publishers?.length) {
    if (!publisher || !policy.allowed_publishers.includes(publisher)) {
      reasons.push(`Publisher ${publisher ?? '<missing>'} is not allowlisted.`);
      return {
        status: 'rejected',
        launch_allowed: false,
        reasons,
        publisher,
        signed_by: trust?.signed_by,
        canonical_cid: trust?.canonical_cid,
      };
    }
  }

  if (!trust) {
    if (policy.require_signature) {
      reasons.push('Descriptor signature is required for this launch path.');
    }
    return {
      status: 'unsigned',
      launch_allowed: !policy.require_signature,
      reasons: reasons.length > 0 ? reasons : ['Descriptor is unsigned.'],
      publisher,
    };
  }

  if (policy.allowed_signers?.length && !policy.allowed_signers.includes(trust.signed_by)) {
    reasons.push(`Signer ${trust.signed_by} is not allowlisted.`);
    return {
      status: 'rejected',
      launch_allowed: false,
      reasons,
      publisher,
      signed_by: trust.signed_by,
      canonical_cid: trust.canonical_cid,
    };
  }

  if (trust.signature_algorithm !== 'Ed25519') {
    reasons.push(`Unsupported descriptor signature algorithm: ${trust.signature_algorithm}.`);
  }

  const unsigned = stripDescriptorTrust(descriptor);
  const canonicalCid = computeInterfaceCID(unsigned as InterfaceDescriptor);
  if (trust.canonical_cid !== canonicalCid) {
    reasons.push('Descriptor canonical CID does not match the signed payload.');
  }

  let signatureValid = false;
  try {
    signatureValid = keystore.verify(
      new Uint8Array(canonicalize(unsigned as InterfaceDescriptor)),
      base64urlDecode(trust.signature),
      trust.signed_by,
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    reasons.push('Descriptor signature verification failed.');
  }

  if (reasons.length > 0) {
    return {
      status: 'invalid',
      launch_allowed: false,
      reasons,
      publisher,
      signed_by: trust.signed_by,
      canonical_cid: canonicalCid,
    };
  }

  return {
    status: 'trusted',
    launch_allowed: true,
    reasons: ['Descriptor signature verified.'],
    publisher,
    signed_by: trust.signed_by,
    canonical_cid: canonicalCid,
  };
}

export function assertMCPUIProfileDescriptorTrusted(
  descriptor: Partial<MCPUIProfileDescriptor>,
  policy: MCPUIDescriptorTrustPolicy = {},
  keystore?: MCPUIDescriptorTrustKeystore,
): asserts descriptor is MCPUIProfileDescriptor {
  const result = verifyMCPUIProfileDescriptorTrust(descriptor, policy, keystore);
  if (!result.launch_allowed) {
    throw new Error(`MCP++ descriptor trust verification failed: ${result.reasons.join('; ')}`);
  }
}

export function stripDescriptorTrust<TDescriptor extends Partial<MCPUIProfileDescriptor>>(
  descriptor: TDescriptor,
): TDescriptor {
  const clone = JSON.parse(JSON.stringify(descriptor)) as TDescriptor & { trust?: unknown };
  delete clone.trust;
  return clone;
}

function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(value: string): Uint8Array {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return new Uint8Array(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

const didKeyVerifier: MCPUIDescriptorTrustKeystore = {
  sign(): Uint8Array {
    throw new Error('Descriptor signing requires an explicit keystore.');
  },
  verify(data: Uint8Array, signature: Uint8Array, did: string): boolean {
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(buildEd25519SpkiDer(didToEd25519PublicKeyBytes(did))),
        format: 'der',
        type: 'spki',
      });
      return cryptoVerify(null, data, publicKey, signature);
    } catch {
      return false;
    }
  },
};

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

function didToEd25519PublicKeyBytes(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error(`Not a did:key DID: ${did}`);
  }
  const prefixed = base58Decode(did.slice('did:key:z'.length));
  if (
    prefixed[0] !== ED25519_MULTICODEC_PREFIX[0]
    || prefixed[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('DID is not an Ed25519 did:key.');
  }
  return prefixed.slice(2);
}

function base58Decode(value: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) {
      throw new Error(`Invalid base58 character: ${char}`);
    }
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length && value[index] === '1'; index += 1) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function buildEd25519SpkiDer(rawPublicKey: Uint8Array): Uint8Array {
  return new Uint8Array([
    0x30,
    0x2a,
    0x30,
    0x05,
    0x06,
    0x03,
    0x2b,
    0x65,
    0x70,
    0x03,
    0x21,
    0x00,
    ...rawPublicKey,
  ]);
}

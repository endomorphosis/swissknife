/**
 * Phase 1 — UCAN Auth tests
 * Tests for DIDKeystore + UCANAuth real Ed25519 implementations.
 */

import { DIDKeystore, didToPublicKeyBytes } from '../../src/auth/did-keystore';
import { UCANAuth } from '../../src/auth/ucan-auth';

describe('DIDKeystore', () => {
  let keystore: DIDKeystore;

  beforeEach(() => {
    // Fresh in-memory keystore (no persistence)
    keystore = new DIDKeystore();
  });

  it('generates a did:key DID', () => {
    const did = keystore.generateKey();
    expect(did).toMatch(/^did:key:z/);
  });

  it('generated DIDs are unique', () => {
    const did1 = keystore.generateKey();
    const did2 = keystore.generateKey();
    expect(did1).not.toBe(did2);
  });

  it('lists generated DIDs', () => {
    const did1 = keystore.generateKey();
    const did2 = keystore.generateKey();
    const list = keystore.listDIDs();
    expect(list).toContain(did1);
    expect(list).toContain(did2);
  });

  it('can retrieve public key bytes for a DID', () => {
    const did = keystore.generateKey();
    const bytes = keystore.getPublicKeyBytes(did);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32); // Ed25519 public key = 32 bytes
  });

  it('decodes the same DID back to the same public key', () => {
    const did = keystore.generateKey();
    const fromKeystore = keystore.getPublicKeyBytes(did);
    const fromDid = didToPublicKeyBytes(did);
    expect(Buffer.from(fromKeystore).toString('hex')).toBe(
      Buffer.from(fromDid).toString('hex'),
    );
  });

  it('signs and verifies data', () => {
    const did = keystore.generateKey();
    const data = Buffer.from('hello world', 'utf8');
    const sig = keystore.sign(data, did);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64); // Ed25519 signature = 64 bytes

    const valid = keystore.verify(data, sig, did);
    expect(valid).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const did = keystore.generateKey();
    const data = Buffer.from('hello world', 'utf8');
    const sig = keystore.sign(data, did);
    sig[0] ^= 0xff; // flip a byte
    const valid = keystore.verify(data, sig, did);
    expect(valid).toBe(false);
  });

  it('throws for unknown DID', () => {
    expect(() => keystore.sign(Buffer.from('x'), 'did:key:zunknown')).toThrow();
  });
});

describe('UCANAuth', () => {
  let keystore: DIDKeystore;
  let auth: UCANAuth;
  let issuerDID: string;
  let audienceDID: string;

  beforeEach(() => {
    keystore = new DIDKeystore();
    auth = new UCANAuth(keystore);
    issuerDID = keystore.generateKey();
    audienceDID = keystore.generateKey();
  });

  // -------------------------------------------------------------------------
  // issueToken
  // -------------------------------------------------------------------------

  it('issues a 3-part UCAN token', () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: 'mcp++/tools/*', cap: 'mcp++/invoke' },
    ]);
    expect(token.split('.').length).toBe(3);
  });

  it('encodes issuer DID in payload', () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: '*', cap: 'mcp++/invoke' },
    ]);
    const parsed = UCANAuth.decode(token);
    expect(parsed.payload.iss).toBe(issuerDID);
    expect(parsed.payload.aud).toBe(audienceDID);
  });

  it('encodes capabilities in payload', () => {
    const caps = [{ rsc: 'sha256:abc', cap: 'mcp++/read-cid' }];
    const token = auth.issueToken(issuerDID, audienceDID, caps);
    const parsed = UCANAuth.decode(token);
    expect(parsed.payload.att).toEqual(caps);
  });

  // -------------------------------------------------------------------------
  // validateToken
  // -------------------------------------------------------------------------

  it('validates a freshly issued token', async () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: '*', cap: 'mcp++/invoke' },
    ]);
    expect(await auth.validateToken(token)).toBe(true);
  });

  it('rejects a token with a tampered signature', async () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: '*', cap: 'mcp++/invoke' },
    ]);
    const parts = token.split('.');
    // Flip the last byte of the signature
    const sigBytes = Buffer.from(
      parts[2].padEnd(parts[2].length + ((4 - (parts[2].length % 4)) % 4), '=')
        .replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );
    sigBytes[0] ^= 0xff;
    const badSig = sigBytes.toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const tampered = `${parts[0]}.${parts[1]}.${badSig}`;
    expect(await auth.validateToken(tampered)).toBe(false);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Manually build a token with exp in the past
    const token = auth.issueToken(
      issuerDID,
      audienceDID,
      [{ rsc: '*', cap: 'mcp++/invoke' }],
      -10, // lifetime = -10s → already expired
    );
    expect(await auth.validateToken(token)).toBe(false);
  });

  it('rejects a malformed token', async () => {
    expect(await auth.validateToken('not.a.ucan')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Proof chain
  // -------------------------------------------------------------------------

  it('validates a delegated proof chain', async () => {
    const rootDID = keystore.generateKey();
    const delegateDID = keystore.generateKey();
    const leafDID = keystore.generateKey();

    // Root issues to delegate
    const rootToken = auth.issueToken(rootDID, delegateDID, [
      { rsc: '*', cap: 'mcp++/invoke' },
    ]);
    // Delegate issues to leaf with rootToken as proof
    const delegatedToken = auth.issueToken(
      delegateDID,
      leafDID,
      [{ rsc: 'mcp++/tools/*', cap: 'mcp++/invoke' }],
      3600,
      [rootToken],
    );
    expect(await auth.validateToken(delegatedToken)).toBe(true);
  });

  it('rejects a proof chain with broken delegation linkage', async () => {
    const rootDID = keystore.generateKey();
    const otherDID = keystore.generateKey();
    const leafDID = keystore.generateKey();

    // Root issues to rootDID (not to leafDID!)
    const rootToken = auth.issueToken(rootDID, rootDID, [
      { rsc: '*', cap: 'mcp++/invoke' },
    ]);
    // leafDID tries to use rootToken as proof but it wasn't issued to leafDID
    const badToken = auth.issueToken(
      leafDID,
      otherDID,
      [{ rsc: '*', cap: 'mcp++/invoke' }],
      3600,
      [rootToken],
    );
    // Proof aud (rootDID) !== badToken iss (leafDID) → invalid
    expect(await auth.validateToken(badToken)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // can()
  // -------------------------------------------------------------------------

  it('grants capability when directly in att[]', async () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: 'mcp++/tools/*', cap: 'mcp++/invoke' },
    ]);
    expect(await auth.can(token, 'mcp++/tools/search', 'mcp++/invoke')).toBe(true);
  });

  it('denies capability not in att[]', async () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: 'mcp++/tools/*', cap: 'mcp++/invoke' },
    ]);
    expect(await auth.can(token, 'mcp++/tools/search', 'mcp++/write')).toBe(false);
  });

  it('grants wildcard resource', async () => {
    const token = auth.issueToken(issuerDID, audienceDID, [
      { rsc: '*', cap: 'mcp++/invoke' },
    ]);
    expect(await auth.can(token, 'anything', 'mcp++/invoke')).toBe(true);
  });
});

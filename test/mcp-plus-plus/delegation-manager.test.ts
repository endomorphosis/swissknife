/**
 * DelegationManager tests — MCP++ Profile C lifecycle parity.
 *
 * Covers: add/get/remove, revocation, canInvoke chain walk,
 * active token queries, merge, save/load persistence, IPFS reload stub,
 * metrics, and singleton.
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { DIDKeystore } from '../../src/auth/did-keystore';
import { UCANAuth, UCANRevocationRegistry } from '../../src/auth/ucan-auth';
import {
  DelegationManager,
  type StoredDelegation,
} from '../../src/auth/delegation-manager';

// ---------------------------------------------------------------------------
// Helpers: issue real signed UCAN tokens
// ---------------------------------------------------------------------------

function makeAuth(): { auth: UCANAuth; ks: DIDKeystore; issuer: string; delegate: string; root: string } {
  const ks = new DIDKeystore();
  const reg = new UCANRevocationRegistry();
  const auth = new UCANAuth(ks, reg);
  const issuer = ks.generateKey();
  const delegate = ks.generateKey();
  const root = ks.generateKey();
  return { auth, ks, issuer, delegate, root };
}

// Issue a token granting `capability` on `resource` from `iss` to `aud`.
async function issueToken(
  auth: UCANAuth,
  iss: string,
  aud: string,
  resource: string,
  capability: string,
  proofs: string[] = [],
  lifetime = 3600,
): Promise<string> {
  return auth.issueToken(iss, aud, [{ rsc: resource, cap: capability }], lifetime, proofs);
}

// ---------------------------------------------------------------------------
// Basic add / get / remove
// ---------------------------------------------------------------------------

describe('DelegationManager — storage', () => {
  it('adds a token and returns its CID', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const cid = mgr.add(raw);

    expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    const record = mgr.get(cid);
    expect(record).toBeDefined();
    expect(record!.iss).toBe(issuer);
    expect(record!.aud).toBe(delegate);
  });

  it('is idempotent: adding the same token twice returns the same CID', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'ipfs://*', 'READ');
    const cid1 = mgr.add(raw);
    const cid2 = mgr.add(raw);
    expect(cid1).toBe(cid2);
    expect(mgr.listCids()).toHaveLength(1);
  });

  it('remove() deletes a stored delegation by CID', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'READ');
    const cid = mgr.add(raw);
    expect(mgr.remove(cid)).toBe(true);
    expect(mgr.get(cid)).toBeUndefined();
    expect(mgr.remove(cid)).toBe(false); // already gone
  });

  it('listCids() returns all stored CIDs', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw1 = await issueToken(auth, issuer, delegate, 'a://*', 'READ');
    const raw2 = await issueToken(auth, issuer, delegate, 'b://*', 'READ');
    const cid1 = mgr.add(raw1);
    const cid2 = mgr.add(raw2);
    const cids = mgr.listCids();
    expect(cids).toContain(cid1);
    expect(cids).toContain(cid2);
    expect(cids).toHaveLength(2);
  });

  it('decodes proof CIDs from the token proof chain', async () => {
    const { auth, issuer, delegate, root } = makeAuth();
    const mgr = new DelegationManager();
    const parentToken = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const parentCid = mgr.add(parentToken);
    const childToken = await issueToken(auth, delegate, root, 'storage://*', 'WRITE', [parentToken]);
    const childCid = mgr.add(childToken);
    const child = mgr.get(childCid);
    expect(child!.proofCids).toContain(parentCid);
  });
});

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

describe('DelegationManager — revocation', () => {
  it('revoke() marks a CID as revoked', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const cid = mgr.add(raw);
    expect(mgr.isRevoked(cid)).toBe(false);
    mgr.revoke(cid);
    expect(mgr.isRevoked(cid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canInvoke
// ---------------------------------------------------------------------------

describe('DelegationManager — canInvoke', () => {
  it('allows invocation when delegation covers resource + capability', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const cid = mgr.add(raw);
    const result = mgr.canInvoke({ leafCid: cid, actor: delegate, resource: 'storage://', capability: 'WRITE' });
    expect(result.allowed).toBe(true);
    expect(result.grantCid).toBe(cid);
  });

  it('denies when the actor does not match the audience', async () => {
    const { auth, issuer, delegate, root } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const cid = mgr.add(raw);
    const result = mgr.canInvoke({ leafCid: cid, actor: root, resource: 'storage://', capability: 'WRITE' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/audience mismatch/);
  });

  it('denies when the capability does not match', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'READ');
    const cid = mgr.add(raw);
    const result = mgr.canInvoke({ leafCid: cid, actor: delegate, resource: 'storage://', capability: 'WRITE' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/WRITE.*not in delegation/);
  });

  it('denies when the delegation has been revoked', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const cid = mgr.add(raw);
    mgr.revoke(cid);
    const result = mgr.canInvoke({ leafCid: cid, actor: delegate, resource: 'storage://', capability: 'WRITE' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/revoked/);
  });

  it('denies when the delegation has expired', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    // Issue with 1-second lifetime, then check at t+2.
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE', [], 1);
    const cid = mgr.add(raw);
    const pastNow = Date.now() / 1000 + 10;
    const result = mgr.canInvoke({ leafCid: cid, actor: delegate, resource: 'storage://', capability: 'WRITE', now: pastNow });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/expired/);
  });

  it('denies for an unknown CID', () => {
    const mgr = new DelegationManager();
    const result = mgr.canInvoke({ leafCid: 'sha256:cafebabe', actor: 'did:key:z1', resource: '*', capability: '*' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });

  it('allows wildcard capability grants', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await auth.issueToken(issuer, delegate, [{ rsc: '*', cap: '*' }], 3600);
    const cid = mgr.add(raw);
    const result = mgr.canInvoke({ leafCid: cid, actor: delegate, resource: 'any://resource', capability: 'DELETE' });
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Active token queries
// ---------------------------------------------------------------------------

describe('DelegationManager — active token queries', () => {
  it('activeByActor() returns only non-revoked, non-expired delegations for actor', async () => {
    const { auth, issuer, delegate, root } = makeAuth();
    const mgr = new DelegationManager();
    const rawA = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const rawB = await issueToken(auth, issuer, root, 'storage://*', 'READ');
    const cidA = mgr.add(rawA);
    mgr.add(rawB);
    mgr.revoke(cidA);

    const active = mgr.activeByActor(delegate);
    expect(active).toHaveLength(0); // revoked

    const activeRoot = mgr.activeByActor(root);
    expect(activeRoot).toHaveLength(1);
    expect(activeRoot[0].aud).toBe(root);
  });

  it('activeByResource() returns delegations that cover the resource', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const rawA = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const rawB = await issueToken(auth, issuer, delegate, 'compute://*', 'RUN');
    mgr.add(rawA);
    mgr.add(rawB);

    const storageActive = mgr.activeByResource('storage://bucket');
    expect(storageActive.some(d => d.capabilities.some(c => c.rsc === 'storage://*'))).toBe(true);
    expect(storageActive.some(d => d.capabilities.some(c => c.rsc === 'compute://*'))).toBe(false);
  });

  it('activeAll() excludes revoked and expired tokens', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw1 = await issueToken(auth, issuer, delegate, 'a://*', 'READ');
    const raw2 = await issueToken(auth, issuer, delegate, 'b://*', 'READ', [], 1);
    const cid1 = mgr.add(raw1);
    mgr.add(raw2);

    const now = Date.now() / 1000 + 10; // 10 seconds in the future → raw2 expired
    const active = mgr.activeAll(now);
    expect(active.map(d => d.cid)).toContain(cid1);
    // raw2's cid should be excluded (expired)
    expect(active.filter(d => d.capabilities.some(c => c.rsc === 'b://*'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

describe('DelegationManager — merge', () => {
  it('merges delegations from another manager without duplicates', async () => {
    const { auth, issuer, delegate, root } = makeAuth();
    const mgrA = new DelegationManager();
    const mgrB = new DelegationManager();
    const raw1 = await issueToken(auth, issuer, delegate, 'a://*', 'READ');
    const raw2 = await issueToken(auth, issuer, root, 'b://*', 'WRITE');
    const sharedRaw = await issueToken(auth, issuer, delegate, 'shared://*', 'READ');

    const cid1 = mgrA.add(raw1);
    const sharedCid = mgrA.add(sharedRaw);
    mgrB.add(raw2);
    mgrB.add(sharedRaw); // shared

    const result = mgrA.merge(mgrB);
    expect(result.added).toBe(1); // raw2 only
    expect(result.skipped).toBe(1); // sharedRaw already present
    expect(mgrA.listCids()).toHaveLength(3);
    expect(mgrA.get(cid1)).toBeDefined();
    expect(mgrA.get(sharedCid)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('DelegationManager — metrics', () => {
  it('getMetrics() counts total, active, revoked, and expired', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const rawActive = await issueToken(auth, issuer, delegate, 'a://*', 'READ');
    const rawRevoked = await issueToken(auth, issuer, delegate, 'b://*', 'READ');
    const rawExpired = await issueToken(auth, issuer, delegate, 'c://*', 'READ', [], 1);
    mgr.add(rawActive);
    const revokedCid = mgr.add(rawRevoked);
    mgr.add(rawExpired);
    mgr.revoke(revokedCid);

    const metrics = mgr.getMetrics(Date.now() / 1000 + 10);
    expect(metrics.total).toBe(3);
    expect(metrics.revoked).toBe(1);
    expect(metrics.expired).toBe(1);
    expect(metrics.active).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('DelegationManager — save and loadFrom', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dm-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips delegations through save/loadFrom', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'WRITE');
    const cid = mgr.add(raw);

    const filePath = join(tmpDir, 'delegations.json');
    mgr.save(filePath);

    const mgr2 = new DelegationManager();
    const result = mgr2.loadFrom(filePath);
    expect(result.added).toBe(1);
    const record = mgr2.get(cid);
    expect(record).toBeDefined();
    expect(record!.iss).toBe(issuer);
    expect(record!.aud).toBe(delegate);
  });

  it('loadFrom is idempotent when called twice on the same file', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'storage://*', 'READ');
    mgr.add(raw);

    const filePath = join(tmpDir, 'delegations.json');
    mgr.save(filePath);

    const mgr2 = new DelegationManager();
    mgr2.loadFrom(filePath);
    const result2 = mgr2.loadFrom(filePath);
    expect(mgr2.listCids()).toHaveLength(1);
    expect(result2.added).toBe(0); // all skipped on second load
  });

  it('throws on a missing file', () => {
    const mgr = new DelegationManager();
    expect(() => mgr.loadFrom(join(tmpDir, 'nonexistent.json'))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// IPFS reload stub
// ---------------------------------------------------------------------------

describe('DelegationManager — reloadFromIPFS', () => {
  it('loads delegations from a storage client that returns saved JSON', async () => {
    const { auth, issuer, delegate } = makeAuth();
    const mgr = new DelegationManager();
    const raw = await issueToken(auth, issuer, delegate, 'ipfs://*', 'PIN');
    const cid = mgr.add(raw);

    // Capture the JSON as if it had been stored in IPFS.
    const serialized = JSON.stringify({
      version: '1',
      savedAt: new Date().toISOString(),
      delegations: mgr.list(),
    });

    const fakeStorageClient = {
      retrieve: (_c: string) => serialized,
    };

    const mgr2 = new DelegationManager();
    const result = await mgr2.reloadFromIPFS('sha256:fakecid', fakeStorageClient);
    expect(result.added).toBe(1);
    expect(mgr2.get(cid)).toBeDefined();
  });

  it('throws when storage client returns null', async () => {
    const mgr = new DelegationManager();
    const fakeStorage = { retrieve: () => null };
    await expect(mgr.reloadFromIPFS('sha256:missing', fakeStorage)).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('DelegationManager — singleton', () => {
  afterEach(() => {
    DelegationManager.resetInstance();
  });

  it('getInstance() returns the same instance on repeated calls', () => {
    const a = DelegationManager.getInstance();
    const b = DelegationManager.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance() allows a fresh singleton', () => {
    const a = DelegationManager.getInstance();
    DelegationManager.resetInstance();
    const b = DelegationManager.getInstance();
    expect(a).not.toBe(b);
  });
});

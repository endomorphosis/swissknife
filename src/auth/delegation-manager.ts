/**
 * DelegationManager — UCAN delegation lifecycle management for MCP++ Profile C.
 *
 * Provides parity with the `ipfs_datasets_py` `DelegationManager` (Session 58):
 * - Persisting and querying delegation chains by CID
 * - Revocation (integrated with UCANRevocationRegistry)
 * - Chain-walk capability evaluation (`canInvoke`)
 * - Active token queries by actor / resource
 * - Merge (incorporate delegations from a peer manager)
 * - JSON-file persistence (`save` / `loadFrom`)
 * - Optional IPFS-backed reload via a pluggable storage client
 * - Process-global singleton via `DelegationManager.getInstance()`
 *
 * References: MCP++ Profile C — Capability Delegation (UCAN), Section 7-9
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'crypto';
import { UCANAuth, UCANRevocationRegistry, type ParsedUCAN } from './ucan-auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compact, serialisable delegation record stored in the manager. */
export interface StoredDelegation {
  /** Content-addressed CID of the raw token (`sha256:<hex>`). */
  cid: string;
  /** Raw base64url-encoded UCAN token string. */
  raw: string;
  /** Issuer DID. */
  iss: string;
  /** Audience (delegate) DID. */
  aud: string;
  /** Expiry (Unix seconds), or `undefined` for non-expiring delegations. */
  exp?: number;
  /** Capabilities granted: `[{ rsc, cap }]`. */
  capabilities: Array<{ rsc: string; cap: string }>;
  /** Proof chain — CIDs of parent delegations (already stored). */
  proofCids: string[];
  /** ISO-8601 timestamp of when this delegation was added. */
  addedAt: string;
}

/** Result of a `canInvoke` check. */
export interface DelegationCheckResult {
  allowed: boolean;
  reason: string;
  /** CID of the delegation that granted the capability (if allowed). */
  grantCid?: string;
}

/** Metrics snapshot returned by `getMetrics()`. */
export interface DelegationMetrics {
  total: number;
  active: number;
  revoked: number;
  expired: number;
}

/** Result returned by `merge()`. */
export interface MergeResult {
  added: number;
  skipped: number;
  /** CIDs that were newly added. */
  addedCids: string[];
}

// ---------------------------------------------------------------------------
// DelegationManager
// ---------------------------------------------------------------------------

/**
 * Bundled UCAN delegation lifecycle manager.
 *
 * Usage:
 * ```ts
 * const mgr = DelegationManager.getInstance();
 * const cid = mgr.add(rawToken);
 * const { allowed } = mgr.canInvoke({ leafCid: cid, actor: 'did:key:z...', resource: 'storage://*', capability: 'WRITE' });
 * mgr.revoke(cid);
 * mgr.save('/tmp/delegations.json');
 * ```
 */
export class DelegationManager {
  private readonly store = new Map<string, StoredDelegation>();
  private readonly revocationRegistry: UCANRevocationRegistry;
  private readonly maxChainDepth: number;

  constructor(opts?: {
    revocationRegistry?: UCANRevocationRegistry;
    maxChainDepth?: number;
  }) {
    this.revocationRegistry = opts?.revocationRegistry ?? UCANRevocationRegistry.getInstance();
    this.maxChainDepth = opts?.maxChainDepth ?? 10;
  }

  // ---------------------------------------------------------------------------
  // Delegation storage
  // ---------------------------------------------------------------------------

  /**
   * Add a raw UCAN token to the store.
   *
   * @returns The CID of the stored delegation.
   * @throws If the token cannot be decoded.
   */
  add(rawToken: string): string {
    const cid = computeTokenCid(rawToken);
    if (this.store.has(cid)) {
      return cid; // idempotent
    }
    const parsed = UCANAuth.decode(rawToken);
    const record: StoredDelegation = {
      cid,
      raw: rawToken,
      iss: parsed.payload.iss,
      aud: parsed.payload.aud,
      exp: parsed.payload.exp,
      capabilities: (parsed.payload.att ?? []).map(a => ({ rsc: a.rsc, cap: a.cap })),
      proofCids: (parsed.payload.prf ?? []).map(p => computeTokenCid(p)),
      addedAt: new Date().toISOString(),
    };
    this.store.set(cid, record);
    return cid;
  }

  /** Return the stored delegation record for `cid`, or `undefined`. */
  get(cid: string): StoredDelegation | undefined {
    return this.store.get(cid);
  }

  /**
   * Remove a delegation by CID.
   *
   * @returns `true` if the record existed and was removed.
   */
  remove(cid: string): boolean {
    return this.store.delete(cid);
  }

  /** Return all stored delegation CIDs. */
  listCids(): string[] {
    return [...this.store.keys()];
  }

  /** Return all stored delegation records. */
  list(): StoredDelegation[] {
    return [...this.store.values()];
  }

  // ---------------------------------------------------------------------------
  // Revocation
  // ---------------------------------------------------------------------------

  /** Revoke a delegation by CID. */
  revoke(cid: string, revokedBy?: string, reason?: string): void {
    this.revocationRegistry.revoke(cid, revokedBy, reason);
  }

  /** Return `true` if `cid` has been revoked. */
  isRevoked(cid: string): boolean {
    return this.revocationRegistry.isRevoked(cid);
  }

  // ---------------------------------------------------------------------------
  // Capability evaluation
  // ---------------------------------------------------------------------------

  /**
   * Check whether `actor` can invoke `capability` on `resource`, walking the
   * delegation chain rooted at `leafCid`.
   *
   * Walk rules (matching reference semantics):
   * 1. The leaf delegation must exist in the store.
   * 2. Neither the leaf nor any proof in the chain may be revoked.
   * 3. The leaf audience must equal `actor` (or `*` for broadcast delegations).
   * 4. At least one `att` entry must cover `resource` and `capability`
   *    (exact match or wildcard `*`).
   * 5. The delegation must not be expired.
   * 6. Chain depth is capped at `maxChainDepth` to prevent cycles.
   */
  canInvoke(opts: {
    leafCid: string;
    actor: string;
    resource: string;
    capability: string;
    /** Current Unix seconds (defaults to `Date.now()/1000`). */
    now?: number;
  }): DelegationCheckResult {
    const { leafCid, actor, resource, capability, now = Date.now() / 1000 } = opts;

    const leaf = this.store.get(leafCid);
    if (!leaf) {
      return { allowed: false, reason: `delegation not found: ${leafCid}` };
    }
    if (this.isRevoked(leafCid)) {
      return { allowed: false, reason: `delegation revoked: ${leafCid}` };
    }
    if (leaf.exp !== undefined && leaf.exp < now) {
      return { allowed: false, reason: `delegation expired: ${leafCid}` };
    }
    if (leaf.aud !== actor && leaf.aud !== '*') {
      return {
        allowed: false,
        reason: `delegation audience mismatch: expected ${actor}, got ${leaf.aud}`,
      };
    }

    // Check capabilities on the leaf.
    const capGranted = leaf.capabilities.some(
      c => capMatches(c.rsc, resource) && capMatches(c.cap, capability),
    );
    if (!capGranted) {
      return {
        allowed: false,
        reason: `capability '${capability}' on '${resource}' not in delegation ${leafCid}`,
      };
    }

    // Walk the proof chain to verify the issuer chain is intact and unrevoked.
    const chainOk = this._verifyChain(leafCid, leaf.iss, new Set(), now, 0);
    if (!chainOk.ok) {
      return { allowed: false, reason: chainOk.reason };
    }

    return { allowed: true, reason: 'allowed', grantCid: leafCid };
  }

  private _verifyChain(
    cid: string,
    issuer: string,
    visited: Set<string>,
    now: number,
    depth: number,
  ): { ok: boolean; reason: string } {
    if (depth > this.maxChainDepth) {
      return { ok: false, reason: `chain depth exceeded (max ${this.maxChainDepth})` };
    }
    if (visited.has(cid)) {
      return { ok: false, reason: `cycle detected at ${cid}` };
    }
    visited.add(cid);

    const record = this.store.get(cid);
    if (!record) {
      // Root authority — no proof needed.
      return { ok: true, reason: 'root' };
    }

    if (this.isRevoked(cid)) {
      return { ok: false, reason: `proof revoked: ${cid}` };
    }
    if (record.exp !== undefined && record.exp < now) {
      return { ok: false, reason: `proof expired: ${cid}` };
    }

    // Recurse into the proof chain.
    for (const proofCid of record.proofCids) {
      const result = this._verifyChain(proofCid, record.iss, visited, now, depth + 1);
      if (!result.ok) {
        return result;
      }
    }

    return { ok: true, reason: 'chain intact' };
  }

  // ---------------------------------------------------------------------------
  // Active token queries
  // ---------------------------------------------------------------------------

  /**
   * Return all active (non-revoked, non-expired) delegations where the
   * audience is `actor`.
   */
  activeByActor(actor: string, now = Date.now() / 1000): StoredDelegation[] {
    return this._activeFiltered(d => d.aud === actor || d.aud === '*', now);
  }

  /**
   * Return all active delegations that cover at least one capability on
   * `resource` (exact or wildcard).
   */
  activeByResource(resource: string, now = Date.now() / 1000): StoredDelegation[] {
    return this._activeFiltered(
      d => d.capabilities.some(c => capMatches(c.rsc, resource)),
      now,
    );
  }

  /** Return all active (non-revoked, non-expired) delegations. */
  activeAll(now = Date.now() / 1000): StoredDelegation[] {
    return this._activeFiltered(() => true, now);
  }

  private _activeFiltered(
    predicate: (d: StoredDelegation) => boolean,
    now: number,
  ): StoredDelegation[] {
    const result: StoredDelegation[] = [];
    for (const d of this.store.values()) {
      if (this.isRevoked(d.cid)) continue;
      if (d.exp !== undefined && d.exp < now) continue;
      if (predicate(d)) result.push(d);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Merge
  // ---------------------------------------------------------------------------

  /**
   * Merge all delegations from `other` into this manager.
   *
   * Delegations that already exist (by CID) are skipped.
   */
  merge(other: DelegationManager): MergeResult {
    let added = 0;
    let skipped = 0;
    const addedCids: string[] = [];

    for (const record of other.list()) {
      if (this.store.has(record.cid)) {
        skipped++;
      } else {
        this.store.set(record.cid, { ...record });
        addedCids.push(record.cid);
        added++;
      }
    }
    return { added, skipped, addedCids };
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  getMetrics(now = Date.now() / 1000): DelegationMetrics {
    let active = 0;
    let revoked = 0;
    let expired = 0;

    for (const d of this.store.values()) {
      const isRev = this.isRevoked(d.cid);
      const isExp = d.exp !== undefined && d.exp < now;
      if (isRev) {
        revoked++;
      } else if (isExp) {
        expired++;
      } else {
        active++;
      }
    }

    return { total: this.store.size, active, revoked, expired };
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Persist the delegation store to a JSON file.
   */
  save(filePath: string): void {
    const data = {
      version: '1',
      savedAt: new Date().toISOString(),
      delegations: [...this.store.values()],
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Load delegations from a previously-saved JSON file.
   *
   * Existing records are preserved (merge semantics: newer file wins for
   * overlapping CIDs because the file is considered authoritative).
   */
  loadFrom(filePath: string): MergeResult {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw new Error(`DelegationManager.loadFrom: cannot read ${filePath}: ${(err as Error).message}`);
    }
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { delegations?: unknown }).delegations)) {
      throw new Error(`DelegationManager.loadFrom: invalid format in ${filePath}`);
    }
    const delegations = (raw as { delegations: StoredDelegation[] }).delegations;

    let added = 0;
    let skipped = 0;
    const addedCids: string[] = [];

    for (const record of delegations) {
      if (!record.cid || !record.raw) continue;
      if (this.store.has(record.cid)) {
        // Overwrite with file copy — file is the authoritative source on reload.
        this.store.set(record.cid, record);
        skipped++;
      } else {
        this.store.set(record.cid, record);
        addedCids.push(record.cid);
        added++;
      }
    }
    return { added, skipped, addedCids };
  }

  /**
   * Reload delegations from an IPFS-backed store.
   *
   * The `storageClient` is duck-typed: any object with a `retrieve(cid: string)`
   * method that returns `Buffer | Uint8Array | string | null`.  This matches
   * the storage interface used across the project (ipfs_kit_integration).
   *
   * The `rootCid` must point to a JSON blob with the same shape as `save()` writes.
   */
  async reloadFromIPFS(
    rootCid: string,
    storageClient: { retrieve: (cid: string) => Buffer | Uint8Array | string | null | Promise<Buffer | Uint8Array | string | null> },
  ): Promise<MergeResult> {
    const rawBytes = await storageClient.retrieve(rootCid);
    if (rawBytes == null) {
      throw new Error(`DelegationManager.reloadFromIPFS: CID not found: ${rootCid}`);
    }
    const json = typeof rawBytes === 'string'
      ? rawBytes
      : Buffer.from(rawBytes).toString('utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(`DelegationManager.reloadFromIPFS: invalid JSON at ${rootCid}: ${(err as Error).message}`);
    }

    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { delegations?: unknown }).delegations)) {
      throw new Error(`DelegationManager.reloadFromIPFS: unexpected structure at ${rootCid}`);
    }

    const delegations = (parsed as { delegations: StoredDelegation[] }).delegations;
    let added = 0;
    let skipped = 0;
    const addedCids: string[] = [];

    for (const record of delegations) {
      if (!record.cid || !record.raw) continue;
      if (this.store.has(record.cid)) {
        this.store.set(record.cid, record);
        skipped++;
      } else {
        this.store.set(record.cid, record);
        addedCids.push(record.cid);
        added++;
      }
    }
    return { added, skipped, addedCids };
  }

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static _instance: DelegationManager | null = null;

  /** Return the process-global singleton `DelegationManager`. */
  static getInstance(): DelegationManager {
    if (!DelegationManager._instance) {
      DelegationManager._instance = new DelegationManager();
    }
    return DelegationManager._instance;
  }

  /** Reset the singleton (for testing). */
  static resetInstance(): void {
    DelegationManager._instance = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the content-addressed CID for a raw UCAN token string.
 * Format: `sha256:<hex>` — matches `UCANAuth.computeCID` convention.
 */
function computeTokenCid(rawToken: string): string {
  return `sha256:${createHash('sha256').update(rawToken, 'utf8').digest('hex')}`;
}

/**
 * Check whether `value` matches `pattern`.
 * A pattern of `'*'` matches everything.
 * A pattern ending with `'/*'` is a prefix wildcard: `'storage://*'` matches
 * `'storage://'`, `'storage://bucket'`, etc.
 */
function capMatches(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (pattern === value) return true;
  // Prefix wildcard: strip trailing '*' and check prefix
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1); // e.g. 'storage://'
    return value.startsWith(prefix);
  }
  return false;
}

/**
 * ipfs-proof-cache.ts
 *
 * IPFS-backed distributed proof cache.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/caching/ipfs_proof_cache.py
 *
 * Provides:
 *   IPFSCachedProof  — a cached proof enriched with an IPFS CID
 *   IPFSProofCache   — distributed proof cache (local + IPFS-simulated)
 *   getGlobalIPFSCache() — module-level singleton
 */

import { createHash } from 'node:crypto';
import { ProofCacheBase } from './proof-cache-base.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCid(content: string): string {
  return `bafk${createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 32)}`;
}

// ---------------------------------------------------------------------------
// IPFSCachedProof
// ---------------------------------------------------------------------------

export interface CachedProofResult {
  proved: boolean;
  method: string;
  steps?: string[];
}

export class IPFSCachedProof {
  readonly formula: string;
  readonly result: CachedProofResult;
  readonly timestamp: number;
  readonly ttl: number;
  ipfsCid: string | null;
  pinned: boolean;

  constructor(opts: {
    formula: string;
    result: CachedProofResult;
    ttl?: number;
    ipfsCid?: string | null;
    pinned?: boolean;
  }) {
    this.formula = opts.formula;
    this.result = opts.result;
    this.timestamp = Date.now() / 1000;
    this.ttl = opts.ttl ?? 3600;
    this.ipfsCid = opts.ipfsCid ?? null;
    this.pinned = opts.pinned ?? false;
  }

  get isExpired(): boolean {
    if (this.pinned) return false;
    return (Date.now() / 1000) - this.timestamp > this.ttl;
  }

  /** Generate an IPFS CID from this proof's content. */
  computeCid(): string {
    return makeCid(JSON.stringify({ formula: this.formula, result: this.result }));
  }

  toDict(): Record<string, unknown> {
    return {
      formula: this.formula,
      result: this.result,
      timestamp: this.timestamp,
      ttl: this.ttl,
      ipfs_cid: this.ipfsCid,
      pinned: this.pinned,
      is_expired: this.isExpired,
    };
  }
}

// ---------------------------------------------------------------------------
// IPFSProofCacheStats
// ---------------------------------------------------------------------------

export interface IPFSProofCacheStats {
  totalEntries: number;
  pinnedEntries: number;
  expiredEntries: number;
  ipfsUploads: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

// ---------------------------------------------------------------------------
// IPFSProofCache
// ---------------------------------------------------------------------------

export class IPFSProofCache extends ProofCacheBase<IPFSCachedProof> {
  readonly cacheKind = 'ipfs-proof';
  private cache: Map<string, IPFSCachedProof> = new Map();
  private pinSet: Set<string> = new Set();
  private stats = { ipfsUploads: 0, hits: 0, misses: 0 };

  /** Store a proof in the cache. Automatically computes and assigns an IPFS CID. */
  set(formula: string, result: CachedProofResult, opts: { ttl?: number; pin?: boolean } = {}): IPFSCachedProof {
    const proof = new IPFSCachedProof({ formula, result, ttl: opts.ttl });
    proof.ipfsCid = proof.computeCid();
    if (opts.pin) { proof.pinned = true; this.pinSet.add(formula); }
    this.cache.set(formula, proof);
    this.stats.ipfsUploads++;
    return proof;
  }

  /** Retrieve a proof. Returns null if not found or expired (unless pinned). */
  get(formula: string): IPFSCachedProof | null {
    const proof = this.cache.get(formula);
    if (!proof) { this.stats.misses++; return null; }
    if (proof.isExpired && !proof.pinned) {
      this.cache.delete(formula);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return proof;
  }

  has(formula: string): boolean {
    return this.get(formula) !== null;
  }

  /** Pin a proof so it never expires. */
  pin(formula: string): boolean {
    const proof = this.cache.get(formula);
    if (!proof) return false;
    proof.pinned = true;
    this.pinSet.add(formula);
    return true;
  }

  /** Unpin a proof (it will expire normally again). */
  unpin(formula: string): boolean {
    const proof = this.cache.get(formula);
    if (!proof) return false;
    proof.pinned = false;
    this.pinSet.delete(formula);
    return true;
  }

  /** Remove all expired (non-pinned) entries. */
  clearExpired(): number {
    let count = 0;
    for (const [key, proof] of this.cache) {
      if (proof.isExpired && !proof.pinned) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  get size(): number { return this.cache.size; }

  getStats(): IPFSProofCacheStats {
    let expired = 0;
    for (const p of this.cache.values()) { if (p.isExpired && !p.pinned) expired++; }
    const total = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.cache.size,
      pinnedEntries: this.pinSet.size,
      expiredEntries: expired,
      ipfsUploads: this.stats.ipfsUploads,
      cacheHits: this.stats.hits,
      cacheMisses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  clear(): void {
    this.cache.clear();
    this.pinSet.clear();
    this.stats = { ipfsUploads: 0, hits: 0, misses: 0 };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _globalCache: IPFSProofCache | null = null;

export function getGlobalIPFSCache(): IPFSProofCache {
  if (!_globalCache) _globalCache = new IPFSProofCache();
  return _globalCache;
}

export function resetGlobalIPFSCache(): void {
  _globalCache = null;
}

/**
 * proof-cache-base.ts
 *
 * Base (non-IPFS) proof cache with LRU-like eviction and TTL.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/proof_cache.py
 *
 * Provides:
 *   CachedProof     — single cached proof result
 *   ProofCache      — in-memory cache with TTL, size cap, hit tracking
 *   getGlobalCache() — module-level singleton
 */

// ---------------------------------------------------------------------------
// CachedProof
// ---------------------------------------------------------------------------

export class CachedProof {
  readonly formulaHash: string;
  readonly prover: string;
  readonly resultData: Record<string, unknown>;
  readonly timestamp: number;
  readonly ttl: number;   // 0 = never expires
  hitCount: number;
  readonly metadata: Record<string, unknown> | null;

  constructor(opts: {
    formulaHash: string;
    prover: string;
    resultData: Record<string, unknown>;
    ttl?: number;
    metadata?: Record<string, unknown> | null;
  }) {
    this.formulaHash = opts.formulaHash;
    this.prover = opts.prover;
    this.resultData = opts.resultData;
    this.timestamp = Date.now() / 1000;
    this.ttl = opts.ttl ?? 3600;
    this.hitCount = 0;
    this.metadata = opts.metadata ?? null;
  }

  isExpired(): boolean {
    if (this.ttl === 0) return false;
    return (Date.now() / 1000) - this.timestamp > this.ttl;
  }

  toDict(): Record<string, unknown> {
    return {
      formula_hash: this.formulaHash,
      prover: this.prover,
      result_data: this.resultData,
      timestamp: this.timestamp,
      ttl: this.ttl,
      hit_count: this.hitCount,
      metadata: this.metadata,
      is_expired: this.isExpired(),
    };
  }
}

// ---------------------------------------------------------------------------
// ProofCacheStats
// ---------------------------------------------------------------------------

export interface ProofCacheStats {
  totalEntries: number;
  expiredEntries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  maxSize: number;
}

// ---------------------------------------------------------------------------
// ProofCache
// ---------------------------------------------------------------------------

export class ProofCache {
  private cache: Map<string, CachedProof> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 1000, ttl = 3600) {
    this.maxSize = maxSize;
    this.defaultTtl = ttl;
  }

  /** Store a proof. Evicts the oldest entry if at capacity. */
  set(formulaHash: string, prover: string, resultData: Record<string, unknown>, opts: { ttl?: number; metadata?: Record<string, unknown> } = {}): CachedProof {
    // Evict if at cap
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    const proof = new CachedProof({
      formulaHash, prover, resultData,
      ttl: opts.ttl ?? this.defaultTtl,
      metadata: opts.metadata,
    });
    this.cache.set(formulaHash, proof);
    return proof;
  }

  /** Retrieve a proof. Returns null if not found or expired. */
  get(formulaHash: string): CachedProof | null {
    const proof = this.cache.get(formulaHash);
    if (!proof) { this.misses++; return null; }
    if (proof.isExpired()) {
      this.cache.delete(formulaHash);
      this.misses++;
      return null;
    }
    proof.hitCount++;
    this.hits++;
    return proof;
  }

  has(formulaHash: string): boolean {
    return this.get(formulaHash) !== null;
  }

  /** Remove a specific entry. Returns true if it existed. */
  invalidate(formulaHash: string): boolean {
    return this.cache.delete(formulaHash);
  }

  /** Remove all expired entries. Returns count removed. */
  clearExpired(): number {
    let count = 0;
    for (const [key, proof] of this.cache) {
      if (proof.isExpired()) { this.cache.delete(key); count++; }
    }
    return count;
  }

  /** Remove all entries. */
  flush(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number { return this.cache.size; }

  getStats(): ProofCacheStats {
    let expired = 0;
    for (const p of this.cache.values()) { if (p.isExpired()) expired++; }
    const total = this.hits + this.misses;
    return {
      totalEntries: this.cache.size,
      expiredEntries: expired,
      cacheHits: this.hits,
      cacheMisses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      maxSize: this.maxSize,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _globalCache: ProofCache | null = null;

export function getGlobalCache(maxSize = 1000, ttl = 3600): ProofCache {
  if (!_globalCache) _globalCache = new ProofCache(maxSize, ttl);
  return _globalCache;
}

export function resetGlobalCache(): void {
  _globalCache = null;
}

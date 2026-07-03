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
// PORT-205 — Unified cache base
// ---------------------------------------------------------------------------

export interface UnifiedProofCacheStats {
  kind: string;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export interface BoundedCacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export class BoundedCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number | null }>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly opts: { maxSize?: number; ttlMs?: number | null } = {}) {}

  set(key: string, value: T): void {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
        this.evictions++;
      }
    }
    this.store.set(key, {
      value,
      expiresAt: this.ttlMs === null ? null : Date.now() + this.ttlMs,
    });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get size(): number {
    return this.store.size;
  }

  stats(): BoundedCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  private get maxSize(): number {
    return this.opts.maxSize ?? 1000;
  }

  private get ttlMs(): number | null {
    return this.opts.ttlMs ?? null;
  }
}

export abstract class ProofCacheBase<TEntry = unknown> {
  abstract readonly cacheKind: string;
  abstract get size(): number;
  abstract clear(): void;
  abstract getStats(): unknown;

  toUnifiedStats(): UnifiedProofCacheStats {
    const stats = this.getStats() as Record<string, unknown>;
    const hits = numberStat(stats, 'hits', 'cacheHits');
    const misses = numberStat(stats, 'misses', 'cacheMisses');
    const size = numberStat(stats, 'size', 'totalEntries');
    return {
      kind: this.cacheKind,
      size,
      hits,
      misses,
      hitRate: numberStat(stats, 'hitRate', 'hit_rate') || (hits + misses > 0 ? hits / (hits + misses) : 0),
    };
  }

  protected isCacheEntry(value: unknown): value is TEntry {
    return value !== null && value !== undefined;
  }
}

export function getUnifiedCacheStats(caches: ProofCacheBase[]): UnifiedProofCacheStats[] {
  return caches.map(cache => cache.toUnifiedStats());
}

function numberStat(stats: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// ProofCache
// ---------------------------------------------------------------------------

export class ProofCache extends ProofCacheBase<CachedProof> {
  readonly cacheKind = 'memory-proof';
  private cache: Map<string, CachedProof> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 1000, ttl = 3600) {
    super();
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

  clear(): void {
    this.flush();
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

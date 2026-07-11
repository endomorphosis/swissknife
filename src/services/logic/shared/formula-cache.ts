/**
 * Formula Cache System — T-224
 *
 * Port of ipfs_datasets_py/logic/CEC/optimization/formula_cache.py
 *
 * Advanced caching for CEC formulas, proofs, and parse results:
 *   FormulaInterningCache, LRUCache, ProofResultCache,
 *   ParseResultCache, MemoizationCache, CacheManager.
 */

import { md5Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// CacheEntry
// ---------------------------------------------------------------------------

export class CacheEntry<T = unknown> {
  readonly key: string;
  value: T;
  readonly createdAt: number;
  accessedAt: number;
  accessCount = 0;
  sizeBytes: number;

  constructor(key: string, value: T, sizeBytes = 0) {
    this.key = key;
    this.value = value;
    this.createdAt = Date.now();
    this.accessedAt = Date.now();
    this.sizeBytes = sizeBytes;
  }

  access(): void {
    this.accessedAt = Date.now();
    this.accessCount++;
  }
}

// ---------------------------------------------------------------------------
// FormulaInterningCache
// ---------------------------------------------------------------------------

/** Ensures identical formula strings share the same reference. */
export class FormulaInterningCache<T = unknown> {
  private readonly store = new Map<string, T>();
  private hits = 0;
  private misses = 0;

  intern(formula: T): T {
    const key = this._key(formula);
    const cached = this.store.get(key);
    if (cached !== undefined) { this.hits++; return cached; }
    this.misses++;
    this.store.set(key, formula);
    return formula;
  }

  private _key(formula: T): string {
    const s = typeof formula === 'string' ? formula : JSON.stringify(formula);
    try { return md5Hex(s); } catch {
      let h = 0x811c9dc5;
      for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16);
    }
  }

  getStats(): Record<string, number> {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, internedCount: this.store.size, hitRate: total > 0 ? this.hits / total : 0 };
  }

  clear(): void { this.store.clear(); this.hits = 0; this.misses = 0; }
  get size(): number { return this.store.size; }
}

// ---------------------------------------------------------------------------
// LRUCache
// ---------------------------------------------------------------------------

/**
 * Generic LRU (Least-Recently-Used) cache.
 *
 * TypeScript port of `LRUCache` from `formula_cache.py`.
 */
export class LRUCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return undefined; }
    entry.access();
    // Move to end (MRU)
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxSize) {
      // Evict LRU (first entry)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, new CacheEntry(String(key), value));
  }

  delete(key: K): boolean { return this.store.delete(key); }
  clear(): void { this.store.clear(); this.hits = 0; this.misses = 0; }
  has(key: K): boolean { return this.store.has(key); }
  get size(): number { return this.store.size; }

  getStats(): Record<string, number> {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, size: this.store.size, maxSize: this.maxSize, hitRate: total > 0 ? this.hits / total : 0 };
  }
}

// ---------------------------------------------------------------------------
// ProofResultCache
// ---------------------------------------------------------------------------

export interface ProofResultCacheEntry {
  isProved: boolean;
  method: string;
  proofTimeMs: number;
  steps?: string[];
}

/**
 * Specialised cache for proof results keyed by (formula + assumptions hash).
 */
export class ProofResultCache {
  private readonly lru: LRUCache<string, ProofResultCacheEntry>;

  constructor(maxSize = 1_000) {
    this.lru = new LRUCache(maxSize);
  }

  private _key(formula: string, assumptions: string[]): string {
    const raw = formula + '|' + assumptions.sort().join(',');
    try { return md5Hex(raw); } catch {
      return raw.slice(0, 64);
    }
  }

  get(formula: string, assumptions: string[] = []): ProofResultCacheEntry | undefined {
    return this.lru.get(this._key(formula, assumptions));
  }

  set(formula: string, assumptions: string[], result: ProofResultCacheEntry): void {
    this.lru.set(this._key(formula, assumptions), result);
  }

  clear(): void { this.lru.clear(); }
  get size(): number { return this.lru.size; }
  getStats(): Record<string, number> { return this.lru.getStats(); }
}

// ---------------------------------------------------------------------------
// ParseResultCache
// ---------------------------------------------------------------------------

export interface ParseResultCacheEntry {
  formula: string;
  parseTimeMs: number;
  confidence: number;
  errors: string[];
}

/** Cache for NL parse results. */
export class ParseResultCache {
  private readonly lru: LRUCache<string, ParseResultCacheEntry>;

  constructor(maxSize = 500) {
    this.lru = new LRUCache(maxSize);
  }

  get(text: string): ParseResultCacheEntry | undefined { return this.lru.get(text); }
  set(text: string, result: ParseResultCacheEntry): void { this.lru.set(text, result); }
  clear(): void { this.lru.clear(); }
  get size(): number { return this.lru.size; }
  getStats(): Record<string, number> { return this.lru.getStats(); }
}

// ---------------------------------------------------------------------------
// MemoizationCache
// ---------------------------------------------------------------------------

/** Generic function memoization cache. */
export class MemoizationCache<Args extends unknown[], R> {
  private readonly lru: LRUCache<string, R>;

  constructor(maxSize = 1_000) {
    this.lru = new LRUCache(maxSize);
  }

  /** Memoize a synchronous function call. */
  memoize(key: string, fn: () => R): R {
    const cached = this.lru.get(key);
    if (cached !== undefined) return cached;
    const result = fn();
    this.lru.set(key, result);
    return result;
  }

  clear(): void { this.lru.clear(); }
  get size(): number { return this.lru.size; }
  getStats(): Record<string, number> { return this.lru.getStats(); }
}

// ---------------------------------------------------------------------------
// CacheManager
// ---------------------------------------------------------------------------

/**
 * Central registry for all CEC caches.
 *
 * TypeScript port of `CacheManager` from `formula_cache.py`.
 */
export class CacheManager {
  private readonly namedCaches = new Map<string, LRUCache<string, unknown>>();
  private readonly interningCaches = new Map<string, FormulaInterningCache>();

  /** Get (or lazily create) a named LRU cache. */
  getCache(name: string, maxSize = 1_000): LRUCache<string, unknown> {
    if (!this.namedCaches.has(name)) this.namedCaches.set(name, new LRUCache(maxSize));
    return this.namedCaches.get(name)!;
  }

  /** Get (or lazily create) a named interning cache. */
  getInterningCache(name: string): FormulaInterningCache {
    if (!this.interningCaches.has(name)) this.interningCaches.set(name, new FormulaInterningCache());
    return this.interningCaches.get(name)!;
  }

  clearAll(): void {
    for (const c of this.namedCaches.values()) c.clear();
    for (const c of this.interningCaches.values()) c.clear();
  }

  getStats(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [name, c] of this.namedCaches) out[name] = c.getStats();
    for (const [name, c] of this.interningCaches) out[`intern:${name}`] = c.getStats();
    return out;
  }
}

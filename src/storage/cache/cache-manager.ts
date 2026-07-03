import { logger } from '../../utils/logger.js';

interface CacheManagerOptions {
  maxSize?: number;      // Max number of items (LRU eviction when exceeded)
  defaultTtl?: number;  // Default time-to-live in milliseconds
  cleanupIntervalMs?: number; // How often to sweep for expired entries (default: 60 s)
}

interface CacheEntry<T> {
  value: T;
  expiresAt?: number; // Timestamp in ms
  lastAccessed: number; // For LRU ordering
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private options: Required<CacheManagerOptions>;
  private hits = 0;
  private misses = 0;

  constructor(options: CacheManagerOptions = {}) {
    this.options = {
      maxSize:           options.maxSize           ?? Infinity,
      defaultTtl:        options.defaultTtl        ?? 0,
      cleanupIntervalMs: options.cleanupIntervalMs ?? 60_000,
    };
    logger.info('CacheManager initialized.');

    // Periodic TTL cleanup — unref so the timer doesn't block process exit
    if (isFinite(this.options.cleanupIntervalMs) && this.options.cleanupIntervalMs > 0) {
      const timer = setInterval(() => this.sweepExpired(), this.options.cleanupIntervalMs);
      if (typeof timer === 'object' && timer !== null && typeof (timer as NodeJS.Timeout).unref === 'function') {
        (timer as NodeJS.Timeout).unref();
      }
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) { this.misses++; logger.debug(`[Cache] Miss: ${key}`); return undefined; }
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      logger.debug(`[Cache] Expired: ${key}`);
      return undefined;
    }
    entry.lastAccessed = Date.now();
    this.hits++;
    logger.debug(`[Cache] Hit: ${key}`);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    // LRU eviction when at capacity
    if (isFinite(this.options.maxSize) && this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    const effectiveTtl = ttl ?? this.options.defaultTtl;
    const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : undefined;
    this.cache.set(key, { value, expiresAt, lastAccessed: Date.now() });
    logger.debug(`[Cache] Set: ${key}` + (expiresAt ? ` (TTL ${effectiveTtl}ms)` : ''));
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) logger.debug(`[Cache] Deleted: ${key}`);
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    logger.info('[Cache] Cache cleared.');
  }

  getSize(): number { return this.cache.size; }

  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return { size: this.cache.size, hits: this.hits, misses: this.misses, hitRate: total > 0 ? this.hits / total : 0 };
  }

  /** Remove the least-recently-used entry. */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of this.cache) {
      if (v.lastAccessed < oldestTime) { oldestTime = v.lastAccessed; oldestKey = k; }
    }
    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`[Cache] LRU evicted: ${oldestKey}`);
    }
  }

  /** Remove all entries whose TTL has expired. */
  private sweepExpired(): void {
    const now = Date.now();
    let swept = 0;
    for (const [k, v] of this.cache) {
      if (v.expiresAt && now > v.expiresAt) { this.cache.delete(k); swept++; }
    }
    if (swept > 0) logger.debug(`[Cache] TTL sweep removed ${swept} expired entries.`);
  }
}

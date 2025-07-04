import { logger } from '../utils/logger';

// TODO: Add options for TTL, max size, eviction policies
interface CacheManagerOptions {
  maxSize?: number; // Max number of items
  defaultTtl?: number; // Default time-to-live in milliseconds
}

interface CacheEntry<T> {
  value: T;
  expiresAt?: number; // Timestamp in ms
}

/**
 * Manages in-memory caching for frequently accessed data.
 * Currently a basic implementation using a Map.
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private options: CacheManagerOptions;

  constructor(options: CacheManagerOptions = {}) {
    this.options = options;
    logger.info('CacheManager initialized.');
    // TODO: Implement eviction logic if maxSize is set
    // TODO: Implement periodic cleanup for expired TTL entries
  }

  /**
   * Retrieves an item from the cache.
   * Returns undefined if the item is not found or has expired.
   * @param key The cache key.
   * @returns The cached value or undefined.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      logger.debug(`[Cache] Miss for key: ${key}`);
      return undefined;
    }

    // Check TTL
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      logger.debug(`[Cache] Expired entry found for key: ${key}. Deleting.`);
      this.delete(key); // Remove expired entry
      return undefined;
    }

    logger.debug(`[Cache] Hit for key: ${key}`);
    return entry.value as T;
  }

  /**
   * Adds or updates an item in the cache.
   * @param key The cache key.
   * @param value The value to cache.
   * @param ttl Optional time-to-live in milliseconds for this specific entry.
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // TODO: Check maxSize before adding
    // if (this.options.maxSize && this.cache.size >= this.options.maxSize) {
    //   this.evict(); // Implement eviction strategy (e.g., LRU)
    // }

    const effectiveTtl = ttl ?? this.options.defaultTtl;
    const expiresAt = effectiveTtl ? Date.now() + effectiveTtl : undefined;

    const entry: CacheEntry<T> = { value, expiresAt };
    this.cache.set(key, entry);
    logger.debug(`[Cache] Set value for key: ${key}` + (expiresAt ? ` (expires at ${new Date(expiresAt).toISOString()})` : ''));
  }

  /**
   * Deletes an item from the cache.
   * @param key The cache key to delete.
   * @returns True if an item was deleted, false otherwise.
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug(`[Cache] Deleted key: ${key}`);
    }
    return deleted;
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
    logger.info('[Cache] Cache cleared.');
  }

  /**
   * Returns the current number of items in the cache.
   */
  getSize(): number {
    return this.cache.size;
  }

  // TODO: Implement eviction logic (e.g., Least Recently Used)
  // private evict(): void { ... }

  // TODO: Implement periodic cleanup for TTL
  // private startTtlCleanup(): void { ... }
}

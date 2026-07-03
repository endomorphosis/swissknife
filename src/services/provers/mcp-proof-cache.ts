/**
 * ProofCache — in-memory ring-buffer proof cache with optional JSONL file sink.
 *
 * Keyed by sha256 of the canonical formula representation.
 * Mirrors ipfs_datasets_py/logic/external_provers/proof_cache.py.
 *
 * Usage:
 * ```ts
 * const cache = new ProofCache({ maxEntries: 1000, ttlMs: 5 * 60_000 });
 * const hit = cache.get(formulaHash);
 * if (!hit) {
 *   const result = await prover.prove(formula);
 *   cache.put(formulaHash, result);
 * }
 * ```
 */

import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { WasmProofResult } from './prover-types.js';

// ---------------------------------------------------------------------------
// ProofCache
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: WasmProofResult;
  cachedAt: number;
  expiresAt?: number;
  /** How many times this entry has been served as a cache hit. */
  hitCount: number;
}

export interface ProofCacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  /** Total time saved by cache hits (sum of proof_time_ms of served entries). */
  time_saved_ms: number;
}

/**
 * Sha256-keyed proof result cache with ring-buffer eviction.
 *
 * - `maxEntries`: maximum number of entries before oldest are evicted.
 * - `ttlMs`: time-to-live per entry in milliseconds (undefined = no expiry).
 * - `logPath`: optional path to a JSONL file; each cache miss (put) appends a line.
 */
export class ProofCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly insertionOrder: string[] = [];
  private readonly maxEntries: number;
  private readonly ttlMs?: number;
  private readonly logPath?: string;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private timeSavedMs = 0;

  constructor(opts?: {
    maxEntries?: number;
    ttlMs?: number;
    logPath?: string;
  }) {
    this.maxEntries = opts?.maxEntries ?? 2_000;
    this.ttlMs = opts?.ttlMs;
    this.logPath = opts?.logPath;
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Look up a cached proof result.
   *
   * @param key  sha256 formula hash (from `ProofCache.formulaHash(formula)`)
   * @returns The cached result (with `prover_id: 'cache-hit'`) or `null`.
   */
  get(key: string): WasmProofResult | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (this.isExpired(entry)) {
      this.store.delete(key);
      this.removeFromOrder(key);
      this.misses++;
      return null;
    }
    entry.hitCount++;
    this.hits++;
    this.timeSavedMs += entry.result.proof_time_ms;
    return { ...entry.result, prover_id: 'cache-hit' };
  }

  /**
   * Store a proof result.
   *
   * @param key      sha256 formula hash
   * @param result   the proof result to cache
   * @param ttlMs    per-entry TTL override (defaults to constructor ttlMs)
   */
  put(key: string, result: WasmProofResult, ttlMs?: number): void {
    // Evict if over capacity before adding new entry.
    while (this.store.size >= this.maxEntries && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift()!;
      this.store.delete(oldest);
      this.evictions++;
    }

    const effectiveTtl = ttlMs ?? this.ttlMs;
    const entry: CacheEntry = {
      result,
      cachedAt: Date.now(),
      expiresAt: effectiveTtl !== undefined ? Date.now() + effectiveTtl : undefined,
      hitCount: 0,
    };
    this.store.set(key, entry);
    this.insertionOrder.push(key);

    if (this.logPath) {
      try {
        appendFileSync(
          this.logPath,
          JSON.stringify({ key, result, cachedAt: entry.cachedAt }) + '\n',
          'utf8',
        );
      } catch { /* file logging is best-effort */ }
    }
  }

  /** Remove an entry by key. */
  invalidate(key: string): boolean {
    if (this.store.delete(key)) {
      this.removeFromOrder(key);
      return true;
    }
    return false;
  }

  /** Clear the entire cache and reset counters. */
  clear(): void {
    this.store.clear();
    this.insertionOrder.length = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.timeSavedMs = 0;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  stats(): ProofCacheStats {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      time_saved_ms: this.timeSavedMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute the canonical cache key for a formula string.
   * PORT-161: Include axioms + prover identity to match Python's cache key:
   *   sha256{formula, axioms, prover_name, prover_config}
   * This prevents cross-prover or cross-axiom-set cache collisions.
   */
  static formulaHash(
    formula: string,
    options?: { axioms?: string[]; proverName?: string; proverConfig?: Record<string, unknown> },
  ): string {
    const parts: string[] = [formula];
    if (options?.axioms?.length) parts.push(JSON.stringify([...options.axioms].sort()));
    if (options?.proverName)     parts.push(options.proverName);
    if (options?.proverConfig)   parts.push(JSON.stringify(options.proverConfig));
    return createHash('sha256').update(parts.join('\x00'), 'utf8').digest('hex');
  }

  /**
   * PORT-160: Convert TS proof_time_ms (ms) → wire-format proof_time (seconds)
   * for Python interoperability. Use when serializing to a shared IPFS proof cache.
   */
  static toWireFormat(result: unknown): unknown {
    if (typeof result !== 'object' || result === null) return result;
    const r = result as Record<string, unknown>;
    if (typeof r['proof_time_ms'] === 'number') {
      return { ...r, proof_time: r['proof_time_ms'] / 1000 };
    }
    return r;
  }

  /** Inverse of toWireFormat — convert Python seconds → TS ms. */
  static fromWireFormat(result: unknown): unknown {
    if (typeof result !== 'object' || result === null) return result;
    const r = result as Record<string, unknown>;
    if (typeof r['proof_time'] === 'number' && typeof r['proof_time_ms'] !== 'number') {
      return { ...r, proof_time_ms: Math.round((r['proof_time'] as number) * 1000) };
    }
    return r;
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
  }

  private removeFromOrder(key: string): void {
    const idx = this.insertionOrder.indexOf(key);
    if (idx >= 0) this.insertionOrder.splice(idx, 1);
  }
}

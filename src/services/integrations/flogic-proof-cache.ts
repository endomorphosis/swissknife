/**
 * FLogic Proof Cache — T-263
 * Port of flogic/flogic_proof_cache.py (447L)
 */

import { ProofCacheBase } from '../proof-engine/proof-cache-base.js';
import { sha256Hex } from '../shared/shared-browser-crypto.js';

export interface FLogicCachedQueryResult {
  query:     string;
  result:    unknown;
  cacheKey:  string;
  timestamp: number;
  hitCount:  number;
}

export interface FLogicCacheStats {
  size: number; hits: number; misses: number; hitRate: number;
}

class LRUStore {
  private readonly store = new Map<string, FLogicCachedQueryResult>();
  hits = 0; misses = 0;
  constructor(private readonly maxSize: number) {}

  get(key: string): FLogicCachedQueryResult | null {
    const v = this.store.get(key);
    if (!v) { this.misses++; return null; }
    this.hits++;
    v.hitCount++;
    this.store.delete(key); this.store.set(key, v);
    return v;
  }

  set(key: string, val: FLogicCachedQueryResult): void {
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, val);
  }

  clear(): void { this.store.clear(); this.hits = 0; this.misses = 0; }
  get size(): number { return this.store.size; }
}

export class FLogicProofCache extends ProofCacheBase<FLogicCachedQueryResult> {
  readonly cacheKind = 'flogic-proof';
  private readonly store: LRUStore;
  constructor(maxSize = 500) { super(); this.store = new LRUStore(maxSize); }

  private _key(query: string, context?: Record<string, unknown>): string {
    const raw = JSON.stringify({ query, context: context ?? {} });
    try { return sha256Hex(raw).slice(0, 16); }
    catch { return query.slice(0, 32); }
  }

  get(query: string, context?: Record<string, unknown>): FLogicCachedQueryResult | null {
    return this.store.get(this._key(query, context));
  }

  set(query: string, result: unknown, context?: Record<string, unknown>): void {
    const key = this._key(query, context);
    this.store.set(key, { query, result, cacheKey: key, timestamp: Date.now(), hitCount: 0 });
  }

  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }

  getStats(): FLogicCacheStats {
    const total = this.store.hits + this.store.misses;
    return { size: this.store.size, hits: this.store.hits, misses: this.store.misses, hitRate: total > 0 ? this.store.hits / total : 0 };
  }
}

let _globalCache: FLogicProofCache | null = null;

export function getGlobalCachedWrapper(maxSize = 500): FLogicProofCache {
  if (!_globalCache) _globalCache = new FLogicProofCache(maxSize);
  return _globalCache;
}

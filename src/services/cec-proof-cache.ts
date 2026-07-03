/**
 * CEC Proof Cache — T-273 (Sprint 60)
 * Port of CEC/native/cec_proof_cache.py (422L)
 */

import { createHash } from 'crypto';

export interface CECCachedProofResult {
  formula:  string;
  axioms:   string[];
  isProved: boolean;
  proof:    string[] | null;
  cachedAt: number;
  hitCount: number;
  elapsedMs: number;
}

export interface CECProofCacheStats {
  size: number; hits: number; misses: number; hitRate: number; totalSavedMs: number;
}

class LRUCache {
  private readonly store = new Map<string, CECCachedProofResult>();
  hits = 0; misses = 0; savedMs = 0;
  constructor(private readonly maxSize: number) {}

  get(key: string): CECCachedProofResult | null {
    const v = this.store.get(key);
    if (!v) { this.misses++; return null; }
    this.hits++; v.hitCount++; this.savedMs += v.elapsedMs;
    this.store.delete(key); this.store.set(key, v);
    return v;
  }

  set(key: string, val: CECCachedProofResult): void {
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, val);
  }

  clear(): void { this.store.clear(); this.hits = 0; this.misses = 0; this.savedMs = 0; }
  get size(): number { return this.store.size; }
}

export class CachedTheoremProver {
  private readonly cache: LRUCache;

  constructor(maxSize = 1000) { this.cache = new LRUCache(maxSize); }

  private _key(formula: string, axioms: string[]): string {
    const raw = `${formula}|${[...axioms].sort().join(',')}`;
    try { return createHash('sha256').update(raw).digest('hex').slice(0, 16); }
    catch { return raw.slice(0, 32); }
  }

  prove(formula: string, axioms: string[] = []): CECCachedProofResult {
    const key = this._key(formula, axioms);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const t0 = performance.now();
    const known = new Set<string>(axioms);
    let proved = known.has(formula);
    const proof: string[] = [];

    if (!proved) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of [...known]) {
          const idx = a.indexOf('→');
          if (idx < 0) continue;
          const ant = a.slice(0, idx).trim(), cons = a.slice(idx + 1).trim();
          if (known.has(ant) && !known.has(cons)) {
            known.add(cons); proof.push(`MP: ${ant}, ${a} ⊢ ${cons}`);
            changed = true; if (cons === formula) { proved = true; break; }
          }
        }
        if (proved) break;
      }
    }

    const result: CECCachedProofResult = {
      formula, axioms, isProved: proved,
      proof: proved ? proof : null,
      cachedAt: Date.now(), hitCount: 0,
      elapsedMs: performance.now() - t0,
    };
    this.cache.set(key, result);
    return result;
  }

  invalidate(formula?: string): void {
    if (!formula) { this.cache.clear(); return; }
    // Cannot selectively remove from LRU — just clear all
    this.cache.clear();
  }

  getStats(): CECProofCacheStats {
    const total = this.cache.hits + this.cache.misses;
    return { size: this.cache.size, hits: this.cache.hits, misses: this.cache.misses,
      hitRate: total > 0 ? this.cache.hits / total : 0, totalSavedMs: this.cache.savedMs };
  }
}

let _globalProver: CachedTheoremProver | null = null;
export function getGlobalCachedProver(maxSize = 1000): CachedTheoremProver {
  if (!_globalProver) _globalProver = new CachedTheoremProver(maxSize);
  return _globalProver;
}

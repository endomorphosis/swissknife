/**
 * Lemma Generation — T-239
 *
 * Port of ipfs_datasets_py/logic/CEC/native/lemma_generation.py
 *
 * Caches and generates reusable intermediate proof results (lemmas)
 * to speed up repeated proving tasks.
 */

import { sha256Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export enum LemmaType {
  DERIVED   = 'derived',   // Derived during a proof
  REUSABLE  = 'reusable',  // Applicable in multiple contexts
  PATTERN   = 'pattern',   // Matches a common pattern
}

// ---------------------------------------------------------------------------
// Lemma
// ---------------------------------------------------------------------------

/** An intermediate proof result that can be reused. */
export interface Lemma {
  /** Formula string that was proved. */
  formula: string;
  /** Premise formulas used to derive this lemma. */
  premises: string[];
  /** Inference rule that produced this lemma. */
  rule: string;
  lemmaType: LemmaType;
  usageCount: number;
  /** Short hex hash of the formula (for indexing). */
  patternHash: string;
}

function makePatternHash(formula: string): string {
  try {
    return sha256Hex(formula.trim()).slice(0, 16);
  } catch {
    let h = 0x811c9dc5;
    for (const ch of formula) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

export function makeLemma(
  formula: string,
  premises: string[],
  rule: string,
  lemmaType = LemmaType.DERIVED,
): Lemma {
  return { formula, premises, rule, lemmaType, usageCount: 0, patternHash: makePatternHash(formula) };
}

// ---------------------------------------------------------------------------
// LemmaCache (LRU)
// ---------------------------------------------------------------------------

/**
 * LRU cache for lemmas with pattern-based lookup.
 *
 * TypeScript port of `LemmaCache` from
 * `ipfs_datasets_py/logic/CEC/native/lemma_generation.py`.
 */
export class LemmaCache {
  private readonly store = new Map<string, Lemma>();
  hits = 0;
  misses = 0;

  constructor(private readonly maxSize: number = 100) {}

  add(lemma: Lemma): void {
    const key = lemma.patternHash;
    if (this.store.has(key)) {
      // Move to end (MRU)
      const existing = this.store.get(key)!;
      this.store.delete(key);
      this.store.set(key, existing);
      return;
    }
    if (this.store.size >= this.maxSize) {
      // Evict LRU
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { ...lemma });
  }

  get(formula: string): Lemma | null {
    const key = makePatternHash(formula);
    const lemma = this.store.get(key);
    if (lemma) {
      this.hits++;
      lemma.usageCount++;
      // Move to end
      this.store.delete(key);
      this.store.set(key, lemma);
      return lemma;
    }
    this.misses++;
    return null;
  }

  contains(formula: string): boolean {
    return this.store.has(makePatternHash(formula));
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number { return this.store.size; }

  getStats(): Record<string, number> {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, size: this.store.size, maxSize: this.maxSize, hitRate: total > 0 ? this.hits / total : 0 };
  }

  getAllLemmas(): Lemma[] { return [...this.store.values()]; }
}

// ---------------------------------------------------------------------------
// LemmaGenerator
// ---------------------------------------------------------------------------

export interface LemmaGeneratorStats {
  totalGenerated: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Generates reusable lemmas from a knowledge base using forward chaining.
 *
 * TypeScript port of `LemmaGenerator` from
 * `ipfs_datasets_py/logic/CEC/native/lemma_generation.py`.
 */
export class LemmaGenerator {
  private readonly cache: LemmaCache;
  private readonly stats: LemmaGeneratorStats = { totalGenerated: 0, cacheHits: 0, cacheMisses: 0 };

  constructor(maxLemmas = 100) {
    this.cache = new LemmaCache(maxLemmas);
  }

  /**
   * Generate lemmas for a set of formulas via forward-chaining modus ponens.
   *
   * @param formulas   Starting knowledge base (axioms + assertions).
   * @param maxSteps   Maximum derivation steps.
   */
  generateFormulaLemmas(formulas: string[], maxSteps = 20): Lemma[] {
    const derived: Lemma[] = [];
    const known = new Set<string>(formulas);

    for (let step = 0; step < maxSteps; step++) {
      let changed = false;
      for (const a of [...known]) {
        const arrowIdx = a.indexOf('→');
        if (arrowIdx < 0) continue;
        const ant = a.slice(0, arrowIdx).trim();
        const cons = a.slice(arrowIdx + 1).trim();
        if (known.has(ant) && !known.has(cons)) {
          if (this.cache.contains(cons)) {
            this.stats.cacheHits++;
          } else {
            const lemma = makeLemma(cons, [ant, a], 'modus_ponens');
            this.cache.add(lemma);
            derived.push(lemma);
            this.stats.totalGenerated++;
          }
          known.add(cons);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return derived;
  }

  /**
   * Generate lemmas for an entire knowledge base (all formulas).
   */
  generateKBLemmas(kb: string[]): Lemma[] {
    return this.generateFormulaLemmas(kb, 50);
  }

  getCache(): LemmaCache { return this.cache; }

  getStats(): Readonly<LemmaGeneratorStats> { return { ...this.stats }; }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLemmaGenerator(maxLemmas = 100): LemmaGenerator {
  return new LemmaGenerator(maxLemmas);
}

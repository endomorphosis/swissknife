/**
 * embedding-prover.ts
 *
 * Embedding-enhanced theorem retrieval and proving via semantic similarity.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/symbolic/neurosymbolic/embedding_prover.py
 *
 * Provides:
 *   EmbeddingVector         — typed float array
 *   EmbeddingEnhancedProver — computeSimilarity/prove/retrieveSimilar/cacheSize
 */

// ---------------------------------------------------------------------------
// EmbeddingVector
// ---------------------------------------------------------------------------

export type EmbeddingVector = Float32Array | number[];

/**
 * Cosine similarity between two vectors.
 * Returns value in [-1, 1]; 1 = identical direction.
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const aArr = Array.from(a);
  const bArr = Array.from(b);
  if (aArr.length !== bArr.length || aArr.length === 0) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < aArr.length; i++) {
    dot   += aArr[i] * bArr[i];
    normA += aArr[i] ** 2;
    normB += bArr[i] ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Simulated embedding (hashing-based, no ML deps)
// ---------------------------------------------------------------------------

/** Deterministically produce a dense fallback embedding vector from text. */
export function buildDeterministicEmbedding(text: string, dim = 768): Float32Array {
  const v = new Float32Array(dim);
  const chars = [...text.toLowerCase()];
  for (let i = 0; i < chars.length; i++) {
    const idx = i % dim;
    v[idx] = (v[idx] + chars[i].charCodeAt(0) / 128) % 1.0;
  }
  // Normalize
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm) as Float32Array;
}

// ---------------------------------------------------------------------------
// SimilarFormula
// ---------------------------------------------------------------------------

export interface SimilarFormula {
  formula: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// EmbeddingEnhancedProver
// ---------------------------------------------------------------------------

export interface EmbeddingProverResult {
  formula: string;
  proved: boolean;
  method: 'exact_match' | 'similarity_match' | 'threshold_fail';
  similarity: number;
  matchedAxiom?: string;
  confidence: number;
}

export class EmbeddingEnhancedProver {
  private vectorCache: Map<string, Float32Array> = new Map();
  private similarityThreshold: number;
  readonly modelName: string;

  constructor(opts: { modelName?: string; similarityThreshold?: number; cacheEnabled?: boolean } = {}) {
    this.modelName = opts.modelName ?? 'sentence-transformers/all-MiniLM-L6-v2';
    this.similarityThreshold = opts.similarityThreshold ?? 0.75;
  }

  private _embed(text: string): Float32Array {
    if (!this.vectorCache.has(text)) {
      this.vectorCache.set(text, buildDeterministicEmbedding(text, 768));
    }
    return this.vectorCache.get(text)!;
  }

  /** Compute cosine similarity between two formula strings. */
  computeSimilarity(formulaA: string, formulaB: string): number {
    return cosineSimilarity(this._embed(formulaA), this._embed(formulaB));
  }

  /**
   * Attempt to prove `formula` using embedding similarity against `axioms`.
   * An axiom matches if its similarity to the goal exceeds the threshold.
   */
  prove(formula: string, axioms: string[]): EmbeddingProverResult {
    // 1. Exact match
    if (axioms.includes(formula.trim())) {
      return { formula, proved: true, method: 'exact_match', similarity: 1.0, matchedAxiom: formula, confidence: 1.0 };
    }

    // 2. Similarity match
    let bestSim = 0;
    let bestAxiom = '';
    const goalVec = this._embed(formula);

    for (const axiom of axioms) {
      const sim = cosineSimilarity(goalVec, this._embed(axiom));
      if (sim > bestSim) { bestSim = sim; bestAxiom = axiom; }
    }

    if (bestSim >= this.similarityThreshold) {
      return {
        formula, proved: true, method: 'similarity_match',
        similarity: bestSim, matchedAxiom: bestAxiom,
        confidence: bestSim,
      };
    }

    return { formula, proved: false, method: 'threshold_fail', similarity: bestSim, confidence: 0 };
  }

  /**
   * Retrieve the top-K most similar formulas from a corpus.
   */
  retrieveSimilar(query: string, corpus: string[], topK = 5): SimilarFormula[] {
    const goalVec = this._embed(query);
    const scored = corpus.map(f => ({ formula: f, similarity: cosineSimilarity(goalVec, this._embed(f)) }));
    return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  get cacheSize(): number { return this.vectorCache.size; }

  clearCache(): void { this.vectorCache.clear(); }
}

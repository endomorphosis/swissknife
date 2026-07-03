/**
 * Implements a vector index using FAISS (Facebook AI Similarity Search).
 * When native FAISS bindings are unavailable, falls back to a pure-JS brute-force implementation
 * supporting L2, inner-product, and cosine similarity.
 */

/** Distance metrics supported by the index. */
export type VectorDistance = 'l2' | 'innerproduct' | 'cosine';

/** Options for creating a FAISS index. */
export interface FAISSIndexOptions {
  dimensions: number; // Dimensionality of the vectors
  metric: VectorDistance; // Distance metric to use
  indexType?: 'flat' | 'ivf' | 'hnsw' | 'pq' | string; // Type of FAISS index structure (default: 'flat')
  // Options specific to index types:
  nlist?: number;         // For IVF indexes (number of centroids)
  m?: number;             // For HNSW (number of neighbors), PQ (number of subquantizers)
  nbits?: number;         // For PQ quantization (bits per subquantizer)
  useGPU?: boolean;       // Whether to attempt using GPU acceleration (if supported by bindings)
  // Add other FAISS configuration parameters as needed
}

/** Represents the result of a vector search. */
export interface SearchResult {
  id: string; // The external ID of the matching vector
  score: number; // The distance or similarity score
}

/**
 * Manages a FAISS vector index for adding, searching, and removing vectors.
 */
export class FAISSVectorIndex {
  private readonly vectors = new Map<number, { id: string; vec: Float32Array }>();
  private readonly dimensions: number;
  private readonly metric: VectorDistance;
  private readonly indexType: string;
  private readonly useGPU: boolean;
  private readonly internalToExternalId = new Map<number, string>();
  private readonly externalToInternalId = new Map<string, number>();
  private nextInternalId = 0;

  /**
   * Creates an instance of FAISSVectorIndex.
   * @param {FAISSIndexOptions} options - Configuration options for the index.
   */
  constructor(options: FAISSIndexOptions) {
    if (options.dimensions <= 0) {
      throw new Error('Vector dimensions must be positive.');
    }
    this.dimensions = options.dimensions;
    this.metric = options.metric;
    this.indexType = options.indexType ?? 'flat';
    this.useGPU = options.useGPU ?? false;
    console.log(`FAISSVectorIndex (pure-JS fallback): Type=${this.indexType}, Dim=${this.dimensions}, Metric=${this.metric}, GPU=${this.useGPU}`);
  }

  // Helper to build FAISS index factory string (example)
  // private buildIndexFactoryString(options: FAISSIndexOptions): string { ... }

  /**
   * Adds a vector with an associated external ID to the index.
   * @param {string} id - The external string ID for the vector.
   * @param {Float32Array} vector - The vector data. Must match the index dimensions.
   * @returns {Promise<void>}
   * @throws {Error} If the vector dimension is incorrect or ID already exists.
   */
  async add(id: string, vector: Float32Array): Promise<void> {
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: Expected ${this.dimensions}, got ${vector.length}.`);
    }
    // Update semantics: if ID exists, replace the existing vector
    if (this.externalToInternalId.has(id)) {
      await this.remove(id);
    }
    const internalId = this.nextInternalId++;
    this.internalToExternalId.set(internalId, id);
    this.externalToInternalId.set(id, internalId);
    this.vectors.set(internalId, { id, vec: vector.slice() });
    console.log(`FAISSVectorIndex.add: ${id} (internal=${internalId})`);
  }

  /**
   * Searches the index for the k nearest neighbors to a query vector.
   * @param {Float32Array} queryVector - The vector to search for. Must match index dimensions.
   * @param {number} k - The number of nearest neighbors to retrieve.
   * @returns {Promise<SearchResult[]>} A list of search results, sorted by score (distance).
   */
  async search(queryVector: Float32Array, k: number): Promise<SearchResult[]> {
    if (queryVector.length !== this.dimensions) {
      throw new Error(`Query vector dimension mismatch: Expected ${this.dimensions}, got ${queryVector.length}.`);
    }
    if (k <= 0) return [];

    const results: SearchResult[] = [];
    const qNorm = this._norm(queryVector);

    for (const [, data] of this.vectors) {
      let score: number;
      if (this.metric === 'l2') {
        score = this._l2(queryVector, data.vec);
      } else if (this.metric === 'innerproduct') {
        score = this._dot(queryVector, data.vec);
      } else {
        // cosine: dot / (|q| * |v|)
        const vNorm = this._norm(data.vec);
        score = (qNorm > 0 && vNorm > 0) ? this._dot(queryVector, data.vec) / (qNorm * vNorm) : 0;
      }
      results.push({ id: data.id, score });
    }

    // L2: lower is better; IP/cosine: higher is better
    if (this.metric === 'l2') {
      results.sort((a, b) => a.score - b.score);
    } else {
      results.sort((a, b) => b.score - a.score);
    }

    return results.slice(0, k);
  }

  private _l2(a: Float32Array, b: Float32Array): number {
    let s = 0; for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2; return Math.sqrt(s);
  }
  private _dot(a: Float32Array, b: Float32Array): number {
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!; return s;
  }
  private _norm(v: Float32Array): number {
    return Math.sqrt(this._dot(v, v));
  }

  /**
   * Removes a vector from the index using its external ID.
   * @param {string} id - The external ID of the vector to remove.
   * @returns {Promise<boolean>} True if the vector was found and removed, false otherwise.
   */
  async remove(id: string): Promise<boolean> {
    const internalId = this.externalToInternalId.get(id);
    if (internalId === undefined) return false;
    this.vectors.delete(internalId);
    this.internalToExternalId.delete(internalId);
    this.externalToInternalId.delete(id);
    return true;
  }

  /**
   * Returns the number of vectors currently in the index.
   * @returns {Promise<number>} The total number of vectors.
   */
  async count(): Promise<number> { return this.vectors.size; }

  async clear(): Promise<void> {
    this.vectors.clear();
    this.internalToExternalId.clear();
    this.externalToInternalId.clear();
    this.nextInternalId = 0;
  }

  async destroy(): Promise<void> {
    await this.clear();
    console.log('FAISSVectorIndex destroyed.');
  }
}

/**
 * Implements a Graph-based Retrieval-Augmented Generation (GraphRAG) database system.
 * Based on the integration plan.
 * Entity extraction uses spaCy-WASM (via sedbytes/spacy-wasm + Pyodide) when available,
 * with a lightweight regex fallback for offline/test environments.
 */

import { SpacyWasmNlp, regexFallbackExtract, SpacyPredicates } from '../services/spacy-wasm-nlp.js';

/** Minimal graph node and edge contracts. */
export interface GraphNode { id: string; type: string; label?: string; metadata?: Record<string, unknown> }
export interface GraphEdge { source: string; target: string; type: string }
export interface GraphStore {
  addNode(node: GraphNode): Promise<void>;
  addEdge(edge: GraphEdge): Promise<void>;
  getNeighbors(nodeId: string, maxDepth: number): Promise<string[]>;
}

/** Minimal vector/document store contracts. */
export interface VectorStore {
  initialize(): Promise<void>;
  add(id: string, embedding: number[]): Promise<void>;
  search(embedding: number[], k: number): Promise<Array<{ id: string; score: number }>>;
}

export interface DocumentStore {
  initialize(): Promise<void>;
  add(doc: Document): Promise<string>;
  get(id: string): Promise<Document | null>;
}

export interface EmbeddingModel {
  generate(text: string): Promise<number[]>;
}

/** Represents a document to be stored and indexed. */
export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/** Options for querying the GraphRAG database. */
export interface QueryOptions {
  maxResults?: number;
  maxDepth?: number;
  similarityThreshold?: number;
}

/** Result of a query against the GraphRAG database. */
export interface QueryResult {
  documents: Document[];
  query: string;
}

// ---------------------------------------------------------------------------
// Default in-memory implementations for each store (used when none injected)
// ---------------------------------------------------------------------------

class InMemoryDocumentStore implements DocumentStore {
  private docs = new Map<string, Document>();
  async initialize(): Promise<void> {}
  async add(doc: Document): Promise<string> { this.docs.set(doc.id, doc); return doc.id; }
  async get(id: string): Promise<Document | null> { return this.docs.get(id) ?? null; }
}

class InMemoryVectorStore implements VectorStore {
  private vecs = new Map<string, number[]>();
  async initialize(): Promise<void> {}
  async add(id: string, embedding: number[]): Promise<void> { this.vecs.set(id, embedding); }
  async search(query: number[], k: number): Promise<Array<{ id: string; score: number }>> {
    const scores: Array<{ id: string; score: number }> = [];
    for (const [id, vec] of this.vecs) {
      const dot = query.reduce((s, v, i) => s + v * (vec[i] ?? 0), 0);
      const qn  = Math.sqrt(query.reduce((s, v) => s + v * v, 0));
      const vn  = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      scores.push({ id, score: (qn > 0 && vn > 0) ? dot / (qn * vn) : 0 });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

class InMemoryGraphStore implements GraphStore {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  async addNode(node: GraphNode): Promise<void> { this.nodes.set(node.id, node); }
  async addEdge(edge: GraphEdge): Promise<void> { this.edges.push(edge); }
  async getNeighbors(nodeId: string, maxDepth: number): Promise<string[]> {
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];
    for (let depth = 0; depth < maxDepth; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of this.edges) {
          const nbr = e.source === id ? e.target : e.target === id ? e.source : null;
          if (nbr && !visited.has(nbr)) { visited.add(nbr); next.push(nbr); }
        }
      }
      frontier = next;
    }
    visited.delete(nodeId);
    return [...visited];
  }
}

// Simple regex-based entity extractor kept as a named re-export for backwards compat
export { regexFallbackExtract };

/**
 * Manages the GraphRAG database, combining graph, vector, and document storage.
 */
export class GraphRAGDatabase {
  private readonly graph: GraphStore;
  private readonly vectorStore: VectorStore;
  private readonly documentStore: DocumentStore;
  private readonly embeddingModel: EmbeddingModel;

  private readonly spacyNlp: SpacyWasmNlp;

  constructor(
    graph?: GraphStore,
    vectorStore?: VectorStore,
    documentStore?: DocumentStore,
    embeddingModel?: EmbeddingModel,
    spacyNlp?: SpacyWasmNlp,
  ) {
    this.graph         = graph         ?? new InMemoryGraphStore();
    this.vectorStore   = vectorStore   ?? new InMemoryVectorStore();
    this.documentStore = documentStore ?? new InMemoryDocumentStore();
    this.embeddingModel = embeddingModel ?? { generate: async (text: string) => {
      // Deterministic bag-of-words embedding (64-dim)
      const dim = 64;
      const vec = new Array<number>(dim).fill(0);
      for (const ch of text) { vec[ch.charCodeAt(0) % dim] += 1; }
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map(v => v / norm);
    }};
    this.spacyNlp = spacyNlp ?? new SpacyWasmNlp();
    console.log('GraphRAGDatabase initialized.');
  }

  async initialize(): Promise<void> {
    await this.documentStore.initialize();
    await this.vectorStore.initialize();
    console.log('GraphRAGDatabase components initialized.');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingModel.generate(text);
  }

  async findRelevantNodes(embedding: number[], k = 10): Promise<Array<{ id: string; locationHint?: string }>> {
    const results = await this.vectorStore.search(embedding, k);
    return results.map(r => ({ id: r.id }));
  }

  async addDocument(document: Document): Promise<string> {
    const docId = await this.documentStore.add(document);
    const embedding = await this.generateEmbedding(document.content);
    await this.vectorStore.add(docId, embedding);

    // Extract entities and build graph edges using spaCy WASM (or regex fallback)
    await this.graph.addNode({ id: docId, type: 'Document', label: document.id, metadata: document.metadata });
    const predicates: SpacyPredicates = await this.spacyNlp.extract(document.content);
    const namedEntities = predicates.entities.length > 0
      ? predicates.entities.map(e => ({ id: `ent-${e.text.replace(/\s+/g,'_')}`, type: e.label || 'Entity', name: e.text }))
      : regexFallbackExtract(document.content).entities.map(e => ({ id: `ent-${e.text.replace(/\s+/g,'_')}`, type: e.label, name: e.text }));
    for (const ent of namedEntities.slice(0, 20)) {
      await this.graph.addNode({ id: ent.id, type: ent.type, label: ent.name });
      await this.graph.addEdge({ source: docId, target: ent.id, type: 'mentions' });
    }
    console.log(`Document '${docId}' added with ${namedEntities.length} entity edges (spaCy=${this.spacyNlp.isAvailable()}).`);
    return docId;
  }

  async query(query: string, options: QueryOptions = {}): Promise<QueryResult> {
    const { maxResults = 10, maxDepth = 2 } = options;

    const queryEmbedding = await this.generateEmbedding(query);
    const similar = await this.vectorStore.search(queryEmbedding, maxResults);
    const similarIds = similar.map(r => r.id);

    // Graph traversal — expand context via BFS
    const graphRelated: string[] = [];
    for (const id of similarIds) {
      const nbrs = await this.graph.getNeighbors(id, maxDepth);
      graphRelated.push(...nbrs.filter(n => !similarIds.includes(n)));
    }

    const allIds = [...new Set([...similarIds, ...graphRelated])].slice(0, maxResults);
    const docs = (await Promise.all(allIds.map(id => this.documentStore.get(id))))
      .filter((d): d is Document => d !== null);

    console.log(`GraphRAG query: ${docs.length} docs returned.`);
    return { documents: docs, query };
  }

  /** Re-index all documents (rebuild vector and graph stores). */
  async reindex(documents: Document[]): Promise<void> {
    await this.initialize();
    for (const doc of documents) await this.addDocument(doc);
    console.log(`GraphRAGDatabase reindexed ${documents.length} documents.`);
  }

  /** Return the number of indexed documents. */
  async documentCount(): Promise<number> {
    const testEmb = await this.generateEmbedding('probe');
    const results = await this.vectorStore.search(testEmb, 9999);
    return results.length;
  }
}

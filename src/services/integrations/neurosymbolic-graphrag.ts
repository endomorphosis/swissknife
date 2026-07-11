/**
 * neurosymbolic-graphrag.ts
 *
 * Unified neurosymbolic GraphRAG pipeline.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/symbolic/neurosymbolic_graphrag.py
 *
 * Provides:
 *   PipelineResult         — result from the complete pipeline
 *   RAGEntry               — a knowledge graph entry with formula + embedding
 *   NeurosymbolicGraphRAG  — ingest/query/prove/getStats
 */

import { buildDeterministicEmbedding, cosineSimilarity } from '../logic/shared/embedding-prover.js';
import { sha256Hex } from '../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// RAGEntry — stored knowledge graph entry
// ---------------------------------------------------------------------------

export interface RAGEntry {
  docId: string;
  text: string;
  formula: string;
  operator: string;
  embedding: number[];
  confidence: number;
  addedAt: number;
}

// ---------------------------------------------------------------------------
// PipelineResult
// ---------------------------------------------------------------------------

export class PipelineResult {
  readonly docId: string;
  readonly text: string;
  readonly entities: string[];
  readonly formulas: string[];
  readonly provenTheorems: Array<{ formula: string; method: string }>;
  readonly knowledgeGraphStats: Record<string, number>;
  readonly reasoningChain: string[];
  readonly confidence: number;

  constructor(opts: {
    docId: string;
    text: string;
    entities?: string[];
    formulas?: string[];
    provenTheorems?: Array<{ formula: string; method: string }>;
    knowledgeGraphStats?: Record<string, number>;
    reasoningChain?: string[];
    confidence?: number;
  }) {
    this.docId = opts.docId;
    this.text = opts.text;
    this.entities = opts.entities ?? [];
    this.formulas = opts.formulas ?? [];
    this.provenTheorems = opts.provenTheorems ?? [];
    this.knowledgeGraphStats = opts.knowledgeGraphStats ?? {};
    this.reasoningChain = opts.reasoningChain ?? [];
    this.confidence = opts.confidence ?? 0;
  }

  toDict(): Record<string, unknown> {
    return {
      doc_id: this.docId,
      text_length: this.text.length,
      entity_count: this.entities.length,
      formula_count: this.formulas.length,
      proven_count: this.provenTheorems.length,
      knowledge_graph_stats: this.knowledgeGraphStats,
      reasoning_chain: this.reasoningChain,
      confidence: this.confidence,
    };
  }
}

// ---------------------------------------------------------------------------
// Pattern helpers
// ---------------------------------------------------------------------------

const OBLIGATION_RE  = /\b(shall|must|required to|obligated to)\b/i;
const PERMISSION_RE  = /\b(may|permitted to|allowed to)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|prohibited|forbidden)\b/i;

function textToFormula(text: string): { formula: string; operator: string } {
  if (PROHIBITION_RE.test(text)) return { formula: `F(${text.slice(0, 40)})`, operator: 'F' };
  if (PERMISSION_RE.test(text))  return { formula: `P(${text.slice(0, 40)})`, operator: 'P' };
  if (OBLIGATION_RE.test(text))  return { formula: `O(${text.slice(0, 40)})`, operator: 'O' };
  return { formula: text.slice(0, 60), operator: '' };
}

function extractEntities(text: string): string[] {
  const matches = text.match(/\b(the\s+)?([A-Z][a-zA-Z]{2,20})\b/g) ?? [];
  return [...new Set(matches.map(m => m.trim()))].slice(0, 8);
}

function docHash(text: string): string {
  return sha256Hex(text.slice(0, 256)).slice(0, 12);
}

// ---------------------------------------------------------------------------
// NeurosymbolicGraphRAG
// ---------------------------------------------------------------------------

export interface QueryResult {
  query: string;
  relevantEntries: RAGEntry[];
  answer: string;
  confidence: number;
}

export class NeurosymbolicGraphRAG {
  private entries: RAGEntry[] = [];
  private stats = { ingested: 0, queries: 0, proved: 0 };

  /**
   * Ingest a text document into the knowledge graph.
   */
  ingest(text: string, docId?: string): PipelineResult {
    const id = docId ?? `doc:${docHash(text)}`;
    const sentences = text.split(/[.;!?]/).map(s => s.trim()).filter(s => s.length > 5);
    const formulas: string[] = [];
    const provenTheorems: Array<{ formula: string; method: string }> = [];

    for (const sent of sentences) {
      const { formula, operator } = textToFormula(sent);
      if (operator) {
        formulas.push(formula);
        this.entries.push({
          docId: id,
          text: sent,
          formula,
          operator,
          embedding: Array.from(buildDeterministicEmbedding(formula, 768)),
          confidence: 0.8,
          addedAt: Date.now(),
        });
        if (['O', 'P', 'F'].includes(operator)) {
          provenTheorems.push({ formula, method: 'kb_assert' });
        }
      }
    }

    this.stats.ingested++;
    const entities = extractEntities(text);

    return new PipelineResult({
      docId: id,
      text,
      entities,
      formulas,
      provenTheorems,
      knowledgeGraphStats: { total_entries: this.entries.length, new_formulas: formulas.length },
      reasoningChain: formulas.map(f => `Assert: ${f}`),
      confidence: formulas.length > 0 ? 0.75 : 0.2,
    });
  }

  /**
   * Query the knowledge graph.
   */
  query(q: string): QueryResult {
    this.stats.queries++;
    const qLower = q.toLowerCase();
    const queryEmbedding = buildDeterministicEmbedding(q, 768);
    const scored = this.entries.map(entry => {
      const lexical =
        (entry.text.toLowerCase().includes(qLower.slice(0, 20)) ? 1 : 0) +
        (entry.formula.toLowerCase().includes(qLower.slice(0, 15)) ? 1 : 0);
      const semantic = Math.max(0, cosineSimilarity(queryEmbedding, entry.embedding));
      const score = lexical * 1.0 + semantic * 1.5;
      return { entry, score };
    });

    const relevant = scored
      .filter(item => item.score > 0.25)
      .sort((a, b) => b.score - a.score)
      .map(item => item.entry)
      .slice(0, 10);

    const answer = relevant.length > 0
      ? `Found ${relevant.length} relevant formula(s): ${relevant.map(e => e.formula.slice(0, 30)).join(', ')}`
      : `No relevant knowledge found for: "${q}"`;

    return {
      query: q,
      relevantEntries: relevant,
      answer,
      confidence: relevant.length > 0 ? 0.75 : 0.1,
    };
  }

  /**
   * Prove a formula against the knowledge graph.
   */
  prove(formula: string): { proved: boolean; method: string; confidence: number } {
    const found = this.entries.find(e => e.formula === formula.trim());
    if (found) {
      this.stats.proved++;
      return { proved: true, method: 'graph_lookup', confidence: found.confidence };
    }
    return { proved: false, method: 'exhausted', confidence: 0 };
  }

  get size(): number { return this.entries.length; }

  getStats(): Record<string, unknown> {
    return { ...this.stats, graph_size: this.entries.length };
  }
}

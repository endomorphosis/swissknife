/**
 * ipld-logic-storage.ts
 *
 * IPLD-based logic formula storage with provenance tracking.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/caching/ipld_logic_storage.py
 *
 * Provides:
 *   LogicProvenanceChain — tracks source → formula lineage
 *   LogicIPLDNode        — IPLD node wrapping a formula with metadata
 *   LogicIPLDStorage     — add/get/list/findByDocument
 *   LogicProvenanceTracker — track and retrieve provenance
 *   createLogicStorageWithProvenance() — convenience factory
 */

import { sha256Hex } from '../shared/browser-crypto.js';

// ---------------------------------------------------------------------------
// LogicProvenanceChain
// ---------------------------------------------------------------------------

export interface LogicProvenanceChain {
  sourceDocumentPath: string;
  sourceDocumentCid: string | null;
  graphragEntityCids: string[];
  knowledgeGraphCid: string | null;
  conversionContext: Record<string, unknown>;
  formulaCid: string | null;
  translationCids: Record<string, string>;
  creationTimestamp: string;
  toDict(): Record<string, unknown>;
}

export function makeProvenanceChain(
  sourceDocumentPath: string,
  opts: Partial<Omit<LogicProvenanceChain, 'sourceDocumentPath' | 'toDict'>> = {},
): LogicProvenanceChain {
  const chain: LogicProvenanceChain = {
    sourceDocumentPath,
    sourceDocumentCid: opts.sourceDocumentCid ?? null,
    graphragEntityCids: opts.graphragEntityCids ?? [],
    knowledgeGraphCid: opts.knowledgeGraphCid ?? null,
    conversionContext: opts.conversionContext ?? {},
    formulaCid: opts.formulaCid ?? null,
    translationCids: opts.translationCids ?? {},
    creationTimestamp: opts.creationTimestamp ?? new Date().toISOString(),
    toDict() {
      return {
        source_document_path: sourceDocumentPath,
        source_document_cid: chain.sourceDocumentCid,
        graphrag_entity_cids: chain.graphragEntityCids,
        knowledge_graph_cid: chain.knowledgeGraphCid,
        conversion_context: chain.conversionContext,
        formula_cid: chain.formulaCid,
        translation_cids: chain.translationCids,
        creation_timestamp: chain.creationTimestamp,
      };
    },
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Formula stub (minimal — avoids cross-dep with full deontic types)
// ---------------------------------------------------------------------------

export interface StoredFormula {
  formulaId: string;
  operator: string;
  content: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// LogicIPLDNode
// ---------------------------------------------------------------------------

/** CID-like hash from formula content. */
function makeCid(content: string): string {
  return `bafk${sha256Hex(content).slice(0, 32)}`;
}

export class LogicIPLDNode {
  readonly formulaId: string;
  readonly formula: StoredFormula;
  readonly sourceCid: string | null;
  readonly sourceTextExcerpt: string;
  readonly extractionMetadata: Record<string, unknown>;
  readonly translations: Record<string, string>;
  readonly translationCids: Record<string, string>;
  readonly provenance: LogicProvenanceChain | null;
  readonly cid: string;

  constructor(opts: {
    formulaId: string;
    formula: StoredFormula;
    sourceCid?: string | null;
    sourceTextExcerpt?: string;
    extractionMetadata?: Record<string, unknown>;
    translations?: Record<string, string>;
    translationCids?: Record<string, string>;
    provenance?: LogicProvenanceChain | null;
  }) {
    this.formulaId = opts.formulaId;
    this.formula = opts.formula;
    this.sourceCid = opts.sourceCid ?? null;
    this.sourceTextExcerpt = opts.sourceTextExcerpt ?? '';
    this.extractionMetadata = opts.extractionMetadata ?? {};
    this.translations = opts.translations ?? {};
    this.translationCids = opts.translationCids ?? {};
    this.provenance = opts.provenance ?? null;
    // Derive a stable CID from formula content
    this.cid = makeCid(`${opts.formulaId}:${opts.formula.content}`);
  }

  addTranslation(target: string, translatedFormula: string): void {
    (this.translations as Record<string, string>)[target] = translatedFormula;
    (this.translationCids as Record<string, string>)[target] = makeCid(translatedFormula);
  }

  toDict(): Record<string, unknown> {
    return {
      formula_id: this.formulaId,
      cid: this.cid,
      formula: this.formula,
      source_cid: this.sourceCid,
      source_text_excerpt: this.sourceTextExcerpt.slice(0, 120),
      extraction_metadata: this.extractionMetadata,
      translations: this.translations,
      translation_cids: this.translationCids,
      provenance: this.provenance?.toDict() ?? null,
    };
  }
}

// ---------------------------------------------------------------------------
// LogicIPLDStorage
// ---------------------------------------------------------------------------

export class LogicIPLDStorage {
  private nodes: Map<string, LogicIPLDNode> = new Map();
  private documentIndex: Map<string, string[]> = new Map(); // docPath → formulaIds

  /** Add a node. Returns the node's CID. */
  addNode(node: LogicIPLDNode): string {
    this.nodes.set(node.formulaId, node);
    const docPath = node.provenance?.sourceDocumentPath ?? '(unknown)';
    if (!this.documentIndex.has(docPath)) this.documentIndex.set(docPath, []);
    this.documentIndex.get(docPath)!.push(node.formulaId);
    return node.cid;
  }

  getNode(formulaId: string): LogicIPLDNode | undefined {
    return this.nodes.get(formulaId);
  }

  listNodes(): LogicIPLDNode[] {
    return [...this.nodes.values()];
  }

  findByDocument(sourceDocumentPath: string): LogicIPLDNode[] {
    const ids = this.documentIndex.get(sourceDocumentPath) ?? [];
    return ids.map(id => this.nodes.get(id)).filter(Boolean) as LogicIPLDNode[];
  }

  get size(): number { return this.nodes.size; }

  removeNode(formulaId: string): boolean {
    return this.nodes.delete(formulaId);
  }
}

// ---------------------------------------------------------------------------
// LogicProvenanceTracker
// ---------------------------------------------------------------------------

export class LogicProvenanceTracker {
  private chains: Map<string, LogicProvenanceChain> = new Map();

  /** Associate a formula with a provenance chain. */
  trackFormula(formulaId: string, chain: LogicProvenanceChain): void {
    this.chains.set(formulaId, chain);
  }

  /** Get the provenance chain for a formula. */
  getProvenance(formulaId: string): LogicProvenanceChain | undefined {
    return this.chains.get(formulaId);
  }

  /** Return all tracked chains as a flat list. */
  getAllChains(): LogicProvenanceChain[] {
    return [...this.chains.values()];
  }

  get size(): number { return this.chains.size; }
}

// ---------------------------------------------------------------------------
// createLogicStorageWithProvenance
// ---------------------------------------------------------------------------

/** Create a linked LogicIPLDStorage + LogicProvenanceTracker pair. */
export function createLogicStorageWithProvenance(): {
  storage: LogicIPLDStorage;
  tracker: LogicProvenanceTracker;
} {
  return { storage: new LogicIPLDStorage(), tracker: new LogicProvenanceTracker() };
}

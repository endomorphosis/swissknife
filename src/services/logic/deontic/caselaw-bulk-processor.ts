/**
 * caselaw-bulk-processor.ts
 *
 * Bulk processor for caselaw documents → deontic theorems.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/caselaw_bulk_processor.py
 *
 * Provides:
 *   CaselawDocument    — one caselaw document
 *   ProcessingStats    — aggregated processing statistics
 *   BulkProcessingConfig — configuration for batch processing
 *   CaselawBulkProcessor — process/processBatch/getStats/reset
 */

// ---------------------------------------------------------------------------
// CaselawDocument
// ---------------------------------------------------------------------------

export interface CaselawDocument {
  documentId: string;
  title: string;
  text: string;
  date: Date;
  jurisdiction: string;
  court: string;
  citation: string;
  legalDomains: string[];
  precedentStrength: number;
  filePath: string | null;
  metadata: Record<string, unknown>;
}

export function makeCaselawDocument(
  documentId: string,
  title: string,
  text: string,
  opts: Partial<Omit<CaselawDocument, 'documentId' | 'title' | 'text'>> = {},
): CaselawDocument {
  return {
    documentId,
    title,
    text,
    date: opts.date ?? new Date(),
    jurisdiction: opts.jurisdiction ?? 'US',
    court: opts.court ?? 'Unknown Court',
    citation: opts.citation ?? '',
    legalDomains: opts.legalDomains ?? [],
    precedentStrength: opts.precedentStrength ?? 1.0,
    filePath: opts.filePath ?? null,
    metadata: opts.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// ProcessingStats
// ---------------------------------------------------------------------------

export class ProcessingStats {
  totalDocuments = 0;
  processedDocuments = 0;
  extractedTheorems = 0;
  processingErrors = 0;
  startTime: Date | null = null;
  endTime: Date | null = null;
  jurisdictionsProcessed: Set<string> = new Set();
  legalDomainsProcessed: Set<string> = new Set();

  get processingTimeMs(): number {
    if (!this.startTime) return 0;
    return (this.endTime ?? new Date()).getTime() - this.startTime.getTime();
  }

  get successRate(): number {
    return this.processedDocuments > 0 ? (this.processedDocuments - this.processingErrors) / this.processedDocuments : 0;
  }

  toDict(): Record<string, unknown> {
    return {
      total_documents: this.totalDocuments,
      processed_documents: this.processedDocuments,
      extracted_theorems: this.extractedTheorems,
      processing_errors: this.processingErrors,
      processing_time_ms: this.processingTimeMs,
      success_rate: this.successRate,
      jurisdictions: [...this.jurisdictionsProcessed],
      legal_domains: [...this.legalDomainsProcessed],
    };
  }

  reset(): void {
    this.totalDocuments = 0;
    this.processedDocuments = 0;
    this.extractedTheorems = 0;
    this.processingErrors = 0;
    this.startTime = null;
    this.endTime = null;
    this.jurisdictionsProcessed = new Set();
    this.legalDomainsProcessed = new Set();
  }
}

// ---------------------------------------------------------------------------
// BulkProcessingConfig
// ---------------------------------------------------------------------------

export interface BulkProcessingConfig {
  batchSize: number;
  maxDocuments: number | null;
  confidenceThreshold: number;
  enableTemporalExtraction: boolean;
  jurisdictionFilter: string[];
  legalDomainFilter: string[];
  outputFormat: 'theorems' | 'json' | 'both';
}

export function makeDefaultConfig(overrides: Partial<BulkProcessingConfig> = {}): BulkProcessingConfig {
  return {
    batchSize: 50,
    maxDocuments: null,
    confidenceThreshold: 0.6,
    enableTemporalExtraction: true,
    jurisdictionFilter: [],
    legalDomainFilter: [],
    outputFormat: 'theorems',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ProcessedDocument
// ---------------------------------------------------------------------------

export interface ExtractedTheorem {
  formula: string;
  operator: 'O' | 'P' | 'F';
  sourceText: string;
  confidence: number;
}

export interface ProcessedDocument {
  document: CaselawDocument;
  theorems: ExtractedTheorem[];
  processingTimeMs: number;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBLIGATION_RE  = /\b(shall|must|required to|is obligated)\b/i;
const PERMISSION_RE  = /\b(may|is permitted|is allowed)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|is prohibited|is forbidden)\b/i;
const ACTION_RE      = /(?:shall|must|may|shall not|must not)\s+(?:not\s+)?([a-zA-Z][a-zA-Z\s]{3,40}?)(?:[.,;]|$)/i;

function extractTheorems(text: string, threshold: number): ExtractedTheorem[] {
  const sentences = text.split(/[.;!?]/).map(s => s.trim()).filter(s => s.length > 5);
  const theorems: ExtractedTheorem[] = [];

  for (const sent of sentences) {
    let operator: ExtractedTheorem['operator'];
    if (PROHIBITION_RE.test(sent)) operator = 'F';
    else if (PERMISSION_RE.test(sent)) operator = 'P';
    else if (OBLIGATION_RE.test(sent)) operator = 'O';
    else continue;

    const match = sent.match(ACTION_RE);
    const action = match ? match[1].trim().slice(0, 50) : sent.slice(0, 40).trim();
    const confidence = Math.min(0.95, 0.5 + sent.split(/\s+/).length * 0.03);

    if (confidence >= threshold) {
      theorems.push({ formula: `${operator}(${action})`, operator, sourceText: sent, confidence });
    }
  }

  return theorems;
}

// ---------------------------------------------------------------------------
// CaselawBulkProcessor
// ---------------------------------------------------------------------------

export class CaselawBulkProcessor {
  private config: BulkProcessingConfig;
  private stats: ProcessingStats;

  constructor(config: BulkProcessingConfig = makeDefaultConfig()) {
    this.config = config;
    this.stats = new ProcessingStats();
  }

  /**
   * Process a single caselaw document.
   */
  process(doc: CaselawDocument): ProcessedDocument {
    const t0 = performance.now();
    this.stats.totalDocuments++;

    try {
      const theorems = extractTheorems(doc.text, this.config.confidenceThreshold);

      this.stats.processedDocuments++;
      this.stats.extractedTheorems += theorems.length;
      this.stats.jurisdictionsProcessed.add(doc.jurisdiction);
      for (const domain of doc.legalDomains) this.stats.legalDomainsProcessed.add(domain);

      return { document: doc, theorems, processingTimeMs: performance.now() - t0, success: true };
    } catch (err) {
      this.stats.processingErrors++;
      return { document: doc, theorems: [], processingTimeMs: performance.now() - t0, success: false, error: String(err) };
    }
  }

  /**
   * Process a batch of documents.
   */
  processBatch(docs: CaselawDocument[]): ProcessedDocument[] {
    if (!this.stats.startTime) this.stats.startTime = new Date();
    const slice = this.config.maxDocuments ? docs.slice(0, this.config.maxDocuments) : docs;
    const results = slice.map(doc => this.process(doc));
    this.stats.endTime = new Date();
    return results;
  }

  getStats(): ProcessingStats { return this.stats; }

  reset(): void { this.stats.reset(); }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBulkProcessor(config?: Partial<BulkProcessingConfig>): CaselawBulkProcessor {
  return new CaselawBulkProcessor(makeDefaultConfig(config));
}

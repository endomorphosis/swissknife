/**
 * modal-ir-decompiler.ts
 *
 * Modal IR decompiler — convert modal IR documents back to natural text.
 * TypeScript port of key public API from:
 *   ipfs_datasets_py/logic/modal/decompiler.py
 *
 * Provides (simulated, no ML deps):
 *   DecodedModalPhrase        — one phrase from a modal IR slot
 *   DecodedModalText          — full decompiled text + provenance
 *   decodeModalIRDocument()   — ModalIRDocument → DecodedModalText
 *   modalFormulaToText()      — formula string → natural language
 *   modalTextTokenSimilarity() — token-level similarity between two texts
 */

// ---------------------------------------------------------------------------
// DecodedModalPhrase
// ---------------------------------------------------------------------------

export class DecodedModalPhrase {
  readonly text: string;
  readonly slot: string;
  readonly spans: number[][];
  readonly fixed: boolean;
  readonly provenanceOnly: boolean;

  constructor(opts: {
    text: string;
    slot: string;
    spans?: number[][];
    fixed?: boolean;
    provenanceOnly?: boolean;
  }) {
    this.text = opts.text;
    this.slot = opts.slot;
    this.spans = opts.spans ?? [];
    this.fixed = opts.fixed ?? false;
    this.provenanceOnly = opts.provenanceOnly ?? false;
  }

  toDict(): Record<string, unknown> {
    return {
      text: this.text,
      slot: this.slot,
      spans: this.spans,
      fixed: this.fixed,
      provenance_only: this.provenanceOnly,
    };
  }
}

// ---------------------------------------------------------------------------
// DecodedModalText
// ---------------------------------------------------------------------------

export class DecodedModalText {
  readonly sourceId: string;
  readonly text: string;
  readonly phrases: DecodedModalPhrase[];
  readonly supportSpan: number[];
  readonly reconstructionSimilarity: number;
  readonly modalSpanCoverage: number;
  readonly reconstructionStrategy: string;
  readonly parserWarnings: string[];
  readonly missingSlots: string[];
  readonly formulas: string[];

  constructor(opts: {
    sourceId: string;
    text: string;
    phrases: DecodedModalPhrase[];
    supportSpan?: number[];
    reconstructionSimilarity?: number;
    modalSpanCoverage?: number;
    reconstructionStrategy?: string;
    parserWarnings?: string[];
    missingSlots?: string[];
    formulas?: string[];
  }) {
    this.sourceId = opts.sourceId;
    this.text = opts.text;
    this.phrases = opts.phrases;
    this.supportSpan = opts.supportSpan ?? [0, opts.text.length];
    this.reconstructionSimilarity = opts.reconstructionSimilarity ?? 0;
    this.modalSpanCoverage = opts.modalSpanCoverage ?? 0;
    this.reconstructionStrategy = opts.reconstructionStrategy ?? 'provenance_span_reconstruction_v1';
    this.parserWarnings = opts.parserWarnings ?? [];
    this.missingSlots = opts.missingSlots ?? [];
    this.formulas = opts.formulas ?? [];
  }

  toDict(): Record<string, unknown> {
    return {
      source_id: this.sourceId,
      text: this.text,
      phrases: this.phrases.map(p => p.toDict()),
      support_span: this.supportSpan,
      reconstruction_similarity: this.reconstructionSimilarity,
      modal_span_coverage: this.modalSpanCoverage,
      reconstruction_strategy: this.reconstructionStrategy,
      parser_warnings: this.parserWarnings,
      missing_slots: this.missingSlots,
      formulas: this.formulas,
    };
  }
}

// ---------------------------------------------------------------------------
// ModalIRDocument stub (minimal interface for decoding)
// ---------------------------------------------------------------------------

export interface ModalIRFormula {
  formulaType: string;
  operator?: string;
  actor?: string;
  action?: string;
  conditions?: string[];
  sourceText?: string;
}

export interface ModalIRDocument {
  documentId: string;
  sourceText?: string;
  formulas?: ModalIRFormula[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// modalFormulaToText
// ---------------------------------------------------------------------------

const OPERATOR_DESCRIPTIONS: Record<string, string> = {
  'O': 'is obligated to',
  'P': 'is permitted to',
  'F': 'is forbidden to',
  '□': 'it is necessarily the case that',
  '◊': 'it is possibly the case that',
  'X': 'at the next time point',
  'G': 'it is always the case that',
};

/**
 * Convert a modal formula string to natural language.
 */
export function modalFormulaToText(formula: string): string {
  const f = formula.trim();

  // Handle deontic O/P/F with actor pattern: O[actor](action)
  const deonticMatch = f.match(/^([OPF])\[([^\]]+)\]\(([^)]+)\)$/);
  if (deonticMatch) {
    const [, op, actor, action] = deonticMatch;
    const verb = OPERATOR_DESCRIPTIONS[op] ?? op;
    return `${actor} ${verb} ${action}`;
  }

  // Handle simple O/P/F(content)
  const simpleMatch = f.match(/^([OPF])\(([^)]+)\)$/);
  if (simpleMatch) {
    const [, op, content] = simpleMatch;
    const verb = OPERATOR_DESCRIPTIONS[op] ?? op;
    return `It is the case that someone ${verb} ${content}`;
  }

  // Handle temporal □/◊/G/X(content)
  const temporalMatch = f.match(/^([□◊GX])\(([^)]+)\)$/);
  if (temporalMatch) {
    const [, op, content] = temporalMatch;
    const desc = OPERATOR_DESCRIPTIONS[op] ?? op;
    return `${desc}: ${content}`;
  }

  // Fallback: return formula as-is
  return f;
}

// ---------------------------------------------------------------------------
// decodeModalIRDocument
// ---------------------------------------------------------------------------

/**
 * Decode a ModalIRDocument into a DecodedModalText.
 * Simulated — no ML inference required.
 */
export function decodeModalIRDocument(doc: ModalIRDocument): DecodedModalText {
  const sourceId = doc.documentId;
  const sourceText = doc.sourceText ?? '';
  const formulas = (doc.formulas ?? []);

  // Convert formulas to phrases
  const phrases: DecodedModalPhrase[] = formulas.map((f, i) => {
    const text = modalFormulaToText(f.sourceText ?? `${f.formulaType}(${f.actor ?? 'Agent'},${f.action ?? 'Act'})`);
    return new DecodedModalPhrase({
      text,
      slot: f.formulaType ?? 'unknown',
      spans: [[i * 20, i * 20 + text.length]],
    });
  });

  // Reconstruct text from phrases
  const reconstructed = phrases.length > 0
    ? phrases.map(p => p.text).join('. ') + '.'
    : sourceText;

  // Compute simple token similarity
  const similarity = sourceText ? modalTextTokenSimilarity(sourceText, reconstructed) : 0;

  const coverage = formulas.length > 0
    ? Math.min(1.0, phrases.length / Math.max(1, formulas.length))
    : 0;

  return new DecodedModalText({
    sourceId,
    text: reconstructed,
    phrases,
    supportSpan: [0, reconstructed.length],
    reconstructionSimilarity: similarity,
    modalSpanCoverage: coverage,
    formulas: formulas.map(f => f.sourceText ?? '').filter(Boolean),
    parserWarnings: formulas.length === 0 ? ['No formulas in document'] : [],
  });
}

// ---------------------------------------------------------------------------
// modalTextTokenSimilarity
// ---------------------------------------------------------------------------

/**
 * Compute a token-level Jaccard similarity between two texts.
 */
export function modalTextTokenSimilarity(left: string, right: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  const a = tokenize(left);
  const b = tokenize(right);
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;
  const intersection = new Set([...a].filter(t => b.has(t)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

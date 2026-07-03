/**
 * temporal-deontic-rag-store.ts
 *
 * Temporal deontic logic RAG (Retrieval-Augmented Generation) store.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/temporal_deontic_rag_store.py
 *
 * Provides:
 *   TheoremMetadata        — metadata for a stored deontic theorem
 *   ConsistencyResult      — result of checking consistency against the store
 *   TemporalDeonticRAGStore — add/remove/findRelevant/checkConsistency
 */

import { createHash } from 'node:crypto';
import { DeonticFormula, DeonticOp, makeDeonticFormula } from './deontic-query-engine.js';

// ---------------------------------------------------------------------------
// TemporalScope
// ---------------------------------------------------------------------------

export interface TemporalScope {
  start: Date | null;
  end: Date | null;
}

export function makeTemporalScope(start?: Date | null, end?: Date | null): TemporalScope {
  return { start: start ?? null, end: end ?? null };
}

// ---------------------------------------------------------------------------
// TheoremMetadata
// ---------------------------------------------------------------------------

export class TheoremMetadata {
  readonly theoremId: string;
  readonly formula: DeonticFormula;
  readonly temporalScope: TemporalScope;
  readonly jurisdiction: string | null;
  readonly legalDomain: string | null;
  readonly confidence: number;
  readonly sourceCase: string | null;
  readonly precedentStrength: number;
  readonly createdAt: Date;
  /** PORT-142: dense embedding vector (768-dim) for cosine-similarity retrieval */
  embedding?: number[];

  constructor(opts: {
    theoremId: string;
    formula: DeonticFormula;
    temporalScope?: TemporalScope;
    jurisdiction?: string | null;
    legalDomain?: string | null;
    confidence?: number;
    sourceCase?: string | null;
    precedentStrength?: number;
  }) {
    this.theoremId = opts.theoremId;
    this.formula = opts.formula;
    this.temporalScope = opts.temporalScope ?? makeTemporalScope();
    this.jurisdiction = opts.jurisdiction ?? null;
    this.legalDomain = opts.legalDomain ?? null;
    this.confidence = opts.confidence ?? 1.0;
    this.sourceCase = opts.sourceCase ?? null;
    this.precedentStrength = opts.precedentStrength ?? 1.0;
    this.createdAt = new Date();
  }

  /** Stable hash for deduplication. */
  hash(): string {
    return createHash('sha256')
      .update(`${this.theoremId}:${this.formula.action}:${this.formula.operator}`)
      .digest('hex')
      .slice(0, 16);
  }

  toDict(): Record<string, unknown> {
    return {
      theorem_id: this.theoremId,
      formula_id: this.formula.formulaId,
      formula_operator: this.formula.operator,
      formula_action: this.formula.action,
      jurisdiction: this.jurisdiction,
      legal_domain: this.legalDomain,
      confidence: this.confidence,
      source_case: this.sourceCase,
      precedent_strength: this.precedentStrength,
      created_at: this.createdAt.toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// ConsistencyResult
// ---------------------------------------------------------------------------

export class ConsistencyResult {
  readonly isConsistent: boolean;
  readonly conflicts: Array<Record<string, unknown>>;
  /** PORT-143: temporal conflicts (e.g. overlapping obligation windows) */
  readonly temporalConflicts: string[];
  readonly relevantTheorems: TheoremMetadata[];
  readonly confidenceScore: number;
  readonly reasoning: string;

  constructor(opts: {
    isConsistent: boolean;
    conflicts?: Array<Record<string, unknown>>;
    temporalConflicts?: string[];
    relevantTheorems?: TheoremMetadata[];
    confidenceScore?: number;
    reasoning?: string;
  }) {
    this.isConsistent       = opts.isConsistent;
    this.conflicts          = opts.conflicts ?? [];
    this.temporalConflicts  = opts.temporalConflicts ?? [];
    this.relevantTheorems   = opts.relevantTheorems ?? [];
    this.confidenceScore    = opts.confidenceScore ?? 0;
    this.reasoning          = opts.reasoning ?? '';
  }

  toDict(): Record<string, unknown> {
    return {
      is_consistent: this.isConsistent,
      conflict_count: this.conflicts.length,
      relevant_theorem_count: this.relevantTheorems.length,
      confidence_score: this.confidenceScore,
      reasoning: this.reasoning,
    };
  }
}

// ---------------------------------------------------------------------------
// TemporalDeonticRAGStore
// ---------------------------------------------------------------------------

export class TemporalDeonticRAGStore {
  private theorems: Map<string, TheoremMetadata> = new Map();

  /** Add a theorem to the store. Returns false if a theorem with the same id already exists. */
  addTheorem(theorem: TheoremMetadata): boolean {
    if (this.theorems.has(theorem.theoremId)) return false;
    this.theorems.set(theorem.theoremId, theorem);
    return true;
  }

  /** Remove a theorem by id. Returns false if not found. */
  removeTheorem(theoremId: string): boolean {
    return this.theorems.delete(theoremId);
  }

  get size(): number { return this.theorems.size; }

  getTheorem(theoremId: string): TheoremMetadata | undefined {
    return this.theorems.get(theoremId);
  }

  getAllTheorems(): TheoremMetadata[] {
    return [...this.theorems.values()];
  }

  /**
   * Find theorems whose formula is relevant to the given query formula.
   * Relevance: same operator or overlapping action keywords.
   */
  findRelevant(
    formula: DeonticFormula,
    opts: { maxResults?: number; jurisdictionFilter?: string } = {},
  ): TheoremMetadata[] {
    const maxResults = opts.maxResults ?? 10;
    const actionWords = new Set(formula.action.toLowerCase().split(/\s+/));

    const scored: Array<[TheoremMetadata, number]> = [];
    for (const theorem of this.theorems.values()) {
      if (opts.jurisdictionFilter && theorem.jurisdiction &&
          theorem.jurisdiction !== opts.jurisdictionFilter) continue;

      let score = 0;
      if (theorem.formula.operator === formula.operator) score += 2;
      const theWords = new Set(theorem.formula.action.toLowerCase().split(/\s+/));
      for (const w of actionWords) {
        if (theWords.has(w) && w.length > 3) score++;
      }
      if (score > 0) scored.push([theorem, score * theorem.precedentStrength]);
    }

    return scored
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxResults)
      .map(([t]) => t);
  }

  /**
   * Check whether a list of formulas is consistent with stored theorems.
   */
  checkConsistency(formulas: DeonticFormula[]): ConsistencyResult {
    if (formulas.length === 0 || this.theorems.size === 0) {
      return new ConsistencyResult({
        isConsistent: true,
        reasoning: 'Nothing to check',
        confidenceScore: 0.5,
      });
    }

    const conflicts: Array<Record<string, unknown>> = [];
    const relevantTheorems: TheoremMetadata[] = [];

    for (const formula of formulas) {
      const relevant = this.findRelevant(formula);
      relevantTheorems.push(...relevant);

      for (const theorem of relevant) {
        // Conflict: same action, opposite O/F
        const sameAction = formula.action.toLowerCase().slice(0, 20) ===
          theorem.formula.action.toLowerCase().slice(0, 20);
        if (sameAction) {
          const oppositeOF =
            (formula.operator === DeonticOp.OBLIGATION && theorem.formula.operator === DeonticOp.PROHIBITION) ||
            (formula.operator === DeonticOp.PROHIBITION && theorem.formula.operator === DeonticOp.OBLIGATION);
          if (oppositeOF) {
            conflicts.push({
              input_formula: formula.formulaId,
              theorem_id: theorem.theoremId,
              reason: `Input ${formula.operator}(${formula.action}) conflicts with stored ${theorem.formula.operator}(${theorem.formula.action})`,
              precedent_strength: theorem.precedentStrength,
            });
          }
        }
      }
    }

    const uniqueRelevant = [...new Map(relevantTheorems.map(t => [t.theoremId, t])).values()];

    return new ConsistencyResult({
      isConsistent: conflicts.length === 0,
      conflicts,
      relevantTheorems: uniqueRelevant,
      confidenceScore: uniqueRelevant.length > 0 ? 0.85 : 0.4,
      reasoning: conflicts.length === 0
        ? `No conflicts found with ${uniqueRelevant.length} relevant theorem(s)`
        : `Found ${conflicts.length} conflict(s) with stored precedents`,
    });
  }

  /**
   * Build a TheoremMetadata from a formula string and optional metadata.
   */
  static makeTheoremFromFormula(
    operator: DeonticOp,
    agent: string,
    action: string,
    opts: { jurisdiction?: string; legalDomain?: string; sourceCase?: string; precedentStrength?: number } = {},
  ): TheoremMetadata {
    const formulaId = `thm:${createHash('sha256').update(`${operator}:${agent}:${action}`).digest('hex').slice(0, 8)}`;
    const formula = makeDeonticFormula(operator, agent, action, { formulaId });
    return new TheoremMetadata({
      theoremId: formulaId,
      formula,
      jurisdiction: opts.jurisdiction ?? null,
      legalDomain: opts.legalDomain ?? null,
      sourceCase: opts.sourceCase ?? null,
      precedentStrength: opts.precedentStrength ?? 1.0,
    });
  }
}

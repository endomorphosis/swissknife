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

import { DeonticFormula, DeonticOp, makeDeonticFormula } from '../../deontic-query-engine.js';
import { buildDeterministicEmbedding } from '../../embedding-prover.js';
import { sha256Hex } from '../../provers/browser-crypto.js';

function formulaProposition(formula: DeonticFormula): string {
  return formula.proposition ?? formula.action;
}

function hasBoundedTemporalScope(scope: TemporalScope): boolean {
  return Boolean(scope.start && scope.end);
}

function temporalScopesOverlap(a: TemporalScope, b: TemporalScope): boolean {
  if (!hasBoundedTemporalScope(a) || !hasBoundedTemporalScope(b)) return false;
  const aStart = a.start!.getTime();
  const aEnd = a.end!.getTime();
  const bStart = b.start!.getTime();
  const bEnd = b.end!.getTime();
  return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}

function scopeLabel(scope: TemporalScope): string {
  if (scope.start && scope.end) return `${scope.start.toISOString()}..${scope.end.toISOString()}`;
  if (scope.start) return `${scope.start.toISOString()}..open`;
  if (scope.end) return `open..${scope.end.toISOString()}`;
  return 'unbounded';
}

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
    embedding?: number[];
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
    this.embedding = opts.embedding ?? Array.from(buildDeterministicEmbedding(formulaProposition(this.formula), 768));
  }

  /** Stable hash for deduplication. */
  hash(): string {
    const proposition = formulaProposition(this.formula);
    return sha256Hex(`${this.theoremId}:${proposition}:${this.formula.operator}`).slice(0, 16);
  }

  toDict(): Record<string, unknown> {
    return {
      theorem_id: this.theoremId,
      formula_id: this.formula.formulaId,
      formula_operator: this.formula.operator,
      formula_proposition: formulaProposition(this.formula),
      formula_action: formulaProposition(this.formula),
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
      temporal_conflicts: this.temporalConflicts,
      temporal_conflict_count: this.temporalConflicts.length,
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
   * Relevance: same operator or overlapping proposition keywords.
   */
  findRelevant(
    formula: DeonticFormula,
    opts: { maxResults?: number; jurisdictionFilter?: string; queryEmbedding?: number[] } = {},
  ): TheoremMetadata[] {
    const maxResults = opts.maxResults ?? 10;
    const queryText = formulaProposition(formula).toLowerCase();
    const propositionWords = new Set(queryText.split(/\s+/));
    const effectiveQueryEmbedding = opts.queryEmbedding ?? Array.from(buildDeterministicEmbedding(formulaProposition(formula), 768));

    const scored: Array<[TheoremMetadata, number]> = [];
    for (const theorem of this.theorems.values()) {
      if (opts.jurisdictionFilter && theorem.jurisdiction &&
          theorem.jurisdiction !== opts.jurisdictionFilter) continue;

      let score = 0;
      if (theorem.formula.operator === formula.operator) score += 2;
      const theoremText = formulaProposition(theorem.formula).toLowerCase();
      const theWords = new Set(theoremText.split(/\s+/));
      for (const w of propositionWords) {
        if (theWords.has(w) && w.length > 3) score++;
      }

      if (theorem.embedding && effectiveQueryEmbedding.length === theorem.embedding.length) {
        const similarity = Math.max(0, cosineSimilarity(effectiveQueryEmbedding, theorem.embedding));
        // Keep embeddings additive so lexical/operator relevance remains explainable.
        score += similarity * 5;
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
        // Conflict: same proposition, opposite O/F
        const formulaText = formulaProposition(formula).toLowerCase();
        const theoremText = formulaProposition(theorem.formula).toLowerCase();
        const sameProposition = formulaText.slice(0, 20) === theoremText.slice(0, 20);
        if (sameProposition) {
          const oppositeOF =
            (formula.operator === DeonticOp.OBLIGATION && theorem.formula.operator === DeonticOp.PROHIBITION) ||
            (formula.operator === DeonticOp.PROHIBITION && theorem.formula.operator === DeonticOp.OBLIGATION);
          if (oppositeOF) {
            conflicts.push({
              input_formula: formula.formulaId,
              theorem_id: theorem.theoremId,
              reason: `Input ${formula.operator}(${formulaProposition(formula)}) conflicts with stored ${theorem.formula.operator}(${formulaProposition(theorem.formula)})`,
              precedent_strength: theorem.precedentStrength,
            });
          }
        }
      }
    }

    const uniqueRelevant = [...new Map(relevantTheorems.map(t => [t.theoremId, t])).values()];
    const temporalConflicts: string[] = [];

    for (let i = 0; i < uniqueRelevant.length; i++) {
      for (let j = i + 1; j < uniqueRelevant.length; j++) {
        const lhs = uniqueRelevant[i];
        const rhs = uniqueRelevant[j];
        const sameProposition =
          formulaProposition(lhs.formula).toLowerCase().slice(0, 20) ===
          formulaProposition(rhs.formula).toLowerCase().slice(0, 20);
        if (!sameProposition) continue;

        const oppositeOF =
          (lhs.formula.operator === DeonticOp.OBLIGATION && rhs.formula.operator === DeonticOp.PROHIBITION) ||
          (lhs.formula.operator === DeonticOp.PROHIBITION && rhs.formula.operator === DeonticOp.OBLIGATION);
        if (!oppositeOF) continue;

        if (temporalScopesOverlap(lhs.temporalScope, rhs.temporalScope)) {
          temporalConflicts.push(
            `Overlapping temporal windows for conflicting precedents ${lhs.theoremId} (${scopeLabel(lhs.temporalScope)}) and ${rhs.theoremId} (${scopeLabel(rhs.temporalScope)})`,
          );
        }
      }
    }

    return new ConsistencyResult({
      isConsistent: conflicts.length === 0 && temporalConflicts.length === 0,
      conflicts,
      temporalConflicts: [...new Set(temporalConflicts)],
      relevantTheorems: uniqueRelevant,
      confidenceScore: uniqueRelevant.length > 0 ? 0.85 : 0.4,
      reasoning: (conflicts.length === 0 && temporalConflicts.length === 0)
        ? `No conflicts found with ${uniqueRelevant.length} relevant theorem(s)`
        : `Found ${conflicts.length} logical conflict(s) and ${temporalConflicts.length} temporal conflict(s) with stored precedents`,
    });
  }

  /**
   * Build a TheoremMetadata from a formula string and optional metadata.
   */
  static makeTheoremFromFormula(
    operator: DeonticOp,
    agent: string,
    proposition: string,
    opts: { jurisdiction?: string; legalDomain?: string; sourceCase?: string; precedentStrength?: number } = {},
  ): TheoremMetadata {
    const formulaId = `thm:${sha256Hex(`${operator}:${agent}:${proposition}`).slice(0, 8)}`;
    const formula = makeDeonticFormula(operator, agent, proposition, { formulaId });
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

// PORT-150: Embedding backend decision (neurosymbolic / semantic retrieval)
// The TS store now includes a bundled deterministic 768-d embedding fallback and
// still accepts caller-supplied embeddings for host-native/remote backends.
// Use TheoremMetadata.embedding for external vectors when available.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const na  = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb  = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return (na > 0 && nb > 0) ? dot / (na * nb) : 0;
}

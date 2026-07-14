/**
 * DeonticTextAnalyzer — extracts deontic statements and detects conflicts
 * from natural-language text using regular-expression patterns.
 *
 * Mirrors ipfs_datasets_py/logic/deontic/analyzer.py (503 lines).
 *
 * Features:
 *   - Extract obligations, permissions, and prohibitions from NL text
 *   - Detect four conflict types: direct, conditional, jurisdictional, temporal
 *   - Jaccard word-similarity for action matching
 *   - Entity-based statement organization
 *   - Confidence scoring heuristics
 *
 * T-72.
 * Reference: ipfs_datasets_py/logic/deontic/analyzer.py §DeonticAnalyzer
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeonticModality = 'obligation' | 'permission' | 'prohibition';
export type ConflictType = 'direct' | 'conditional' | 'jurisdictional' | 'temporal' | 'hierarchical'; // PORT-111: hierarchical added
export type ConflictSeverity = 'high' | 'medium' | 'low';

/** A single deontic statement extracted from NL text. */
export interface DeonticStatement {
  readonly id: string;
  readonly entity: string;
  readonly modality: DeonticModality;
  readonly proposition?: string;
  readonly action: string;
  /** Source identifier (document title, URL, etc.). */
  readonly source: string;
  /** ISO date string of the source document, if known. */
  readonly date: string;
  /** Surrounding text window (±100 chars). */
  readonly context: string;
  /** Conditions extracted from the surrounding sentence (if any). */
  readonly conditions: string[];
  /** Exceptions extracted from the surrounding sentence (if any). */
  readonly exceptions: string[];
  /** 0–1 confidence score (heuristic). */
  readonly confidence: number;
}

/** A conflict between two deontic statements. */
export interface DeonticConflict {
  readonly id: string;
  readonly type: ConflictType;
  readonly severity: ConflictSeverity;
  readonly entities: string[];
  readonly statement1: DeonticStatement;
  readonly statement2: DeonticStatement;
  readonly description: string;
  readonly resolution: string;
}

/** A corpus document for statement extraction. */
export interface DeonticCorpusDocument {
  readonly content: string;
  readonly title?: string;
  readonly source?: string;
  readonly date?: string;
}

export interface DeonticCorpus {
  readonly documents: DeonticCorpusDocument[];
}

export interface EntitySummary {
  readonly name: string;
  readonly statements: DeonticStatement[];
  readonly conflicts: DeonticConflict[];
  readonly modality_counts: Record<DeonticModality, number>;
  readonly conflict_severity: Record<ConflictSeverity, number>;
}

export interface DeonticStatistics {
  readonly total_statements: number;
  readonly total_conflicts: number;
  readonly modality_distribution: Record<DeonticModality, number>;
  readonly conflict_type_distribution: Record<string, number>;
  readonly severity_distribution: Record<ConflictSeverity, number>;
  readonly entities_with_conflicts: number;
  readonly conflict_rate: number;
}

// ---------------------------------------------------------------------------
// Regex patterns (mirrors Python DEONTIC_PATTERNS)
// ---------------------------------------------------------------------------

const OBLIGATION_PATTERNS: RegExp[] = [
  /(\w+(?:\s+\w+)*)\s+(?:must|shall|should|is required to|has to|ought to)\s+([^.!?]+)/gi,
  /(\w+(?:\s+\w+)*)\s+(?:has an obligation to|is obligated to)\s+([^.!?]+)/gi,
  /it is (?:mandatory|required|necessary) (?:for\s+)?(\w+(?:\s+\w+)*)\s+to\s+([^.!?]+)/gi,
];

const PERMISSION_PATTERNS: RegExp[] = [
  /(\w+(?:\s+\w+)*)\s+(?:may|can|might|is allowed to|is permitted to)\s+([^.!?]+)/gi,
  /(\w+(?:\s+\w+)*)\s+(?:has the right to|is entitled to)\s+([^.!?]+)/gi,
  /it is (?:permissible|acceptable) (?:for\s+)?(\w+(?:\s+\w+)*)\s+to\s+([^.!?]+)/gi,
];

const PROHIBITION_PATTERNS: RegExp[] = [
  /(\w+(?:\s+\w+)*)\s+(?:must not|shall not|should not|cannot|may not|is not allowed to|is prohibited from)\s+([^.!?]+)/gi,
  /(\w+(?:\s+\w+)*)\s+(?:is forbidden to|is banned from)\s+([^.!?]+)/gi,
  /it is (?:forbidden|prohibited|illegal) (?:for\s+)?(\w+(?:\s+\w+)*)\s+to\s+([^.!?]+)/gi,
];

const CONDITION_PATTERN = /\b(?:if|when|where|unless|provided that|subject to|in the event)\s+([^.!?,]+)/gi;
const EXCEPTION_PATTERN = /\b(?:except|unless|notwithstanding|save|other than)\s+([^.!?,]+)/gi;

// ---------------------------------------------------------------------------
// DeonticTextAnalyzer
// ---------------------------------------------------------------------------

/**
 * DeonticTextAnalyzer — extracts and analyzes deontic statements from NL text.
 *
 * Usage:
 * ```ts
 * const analyzer = new DeonticTextAnalyzer();
 * const stmts = analyzer.extractStatements('Users must log all access.');
 * const conflicts = analyzer.detectConflicts(stmts);
 * ```
 */
export class DeonticTextAnalyzer {
  // ---------------------------------------------------------------------------
  // Extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract deontic statements from a plain text string.
   *
   * @param text Natural-language text (legal document, policy, etc.)
   * @param entityFilter If provided, only return statements whose entity matches one of these strings.
   * @param source Optional source identifier to tag statements with.
   * @param date Optional ISO date string for the source.
   */
  extractStatements(
    text: string,
    entityFilter?: string[],
    source = 'unknown',
    date = new Date().toISOString(),
  ): DeonticStatement[] {
    const statements: DeonticStatement[] = [];
    const patternMap: Array<[DeonticModality, RegExp[]]> = [
      ['obligation',   OBLIGATION_PATTERNS],
      ['permission',   PERMISSION_PATTERNS],
      ['prohibition',  PROHIBITION_PATTERNS],
    ];

    for (const [modality, patterns] of patternMap) {
      for (const pattern of patterns) {
        // Reset lastIndex for global regex reuse
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const entity = match[1].trim();
          const action = match[2].trim();

          if (entityFilter && !entityFilter.some(f => entity.toLowerCase().includes(f.toLowerCase()))) {
            continue;
          }

          const id = `stmt_${statements.length}`;
          statements.push({
            id,
            entity,
            modality,
            proposition: action,
            action,
            source,
            date,
            context: this._sentenceContext(text, match.index, match.index + match[0].length),
            conditions: this._extractConditions(text, match.index),
            exceptions: this._extractExceptions(text, match.index),
            confidence: this._calculateConfidence(entity, action, modality),
          });
        }
      }
    }

    return statements;
  }

  /**
   * Extract statements from a corpus of documents.
   *
   * @param corpus Documents to analyze.
   * @param entityFilter Optional entity filter.
   */
  extractFromCorpus(corpus: DeonticCorpus, entityFilter?: string[]): DeonticStatement[] {
    const all: DeonticStatement[] = [];
    for (const doc of corpus.documents) {
      const text = (doc.content ?? '') + ' ' + (doc.title ?? '');
      const stmts = this.extractStatements(text, entityFilter, doc.source, doc.date);
      all.push(...stmts.map(s => ({ ...s, id: `stmt_d${corpus.documents.indexOf(doc)}_${all.length + stmts.indexOf(s)}` })));
    }
    return all;
  }

  // ---------------------------------------------------------------------------
  // Conflict detection
  // ---------------------------------------------------------------------------

  /**
   * Detect conflicts between a set of deontic statements.
   *
   * @param statements Statements extracted by `extractStatements()`.
   * @param conflictTypes Conflict types to check for. Defaults to all four.
   */
  detectConflicts(
    statements: DeonticStatement[],
    conflictTypes: ConflictType[] = ['direct', 'conditional', 'jurisdictional', 'temporal'],
  ): DeonticConflict[] {
    const conflicts: DeonticConflict[] = [];
    for (let i = 0; i < statements.length; i++) {
      for (let j = i + 1; j < statements.length; j++) {
        const conflict = this.checkStatementConflict(statements[i], statements[j], conflictTypes);
        if (conflict) conflicts.push(conflict);
      }
    }
    return conflicts;
  }

  /**
   * Check if two statements conflict.
   *
   * Returns a `DeonticConflict` if they conflict, `null` otherwise.
   */
  checkStatementConflict(
    s1: DeonticStatement,
    s2: DeonticStatement,
    types: ConflictType[] = ['direct', 'conditional', 'jurisdictional', 'temporal'],
  ): DeonticConflict | null {
    const proposition1 = this.statementProposition(s1);
    const proposition2 = this.statementProposition(s2);
    const entity1 = s1.entity.toLowerCase();
    const entity2 = s2.entity.toLowerCase();
    if (entity1 !== entity2) return null;

    const entity = s1.entity;
    const similar = this.actionsAreSimilar(proposition1, proposition2);

    // Direct: same entity, similar action, opposing modalities
    if (types.includes('direct') && similar) {
      if (this._opposingModalities(s1.modality, s2.modality)) {
        return this._makeConflict('direct', 'high', s1, s2, entity,
          `Direct conflict: ${entity} ${s1.modality} vs ${s2.modality} "${proposition1}"`,
          `Resolve by precedence rule or by limiting scope of one norm.`);
      }
    }

    // Conditional: overlapping conditions, opposing modalities, similar actions
    if (types.includes('conditional') && s1.conditions.length > 0 && s2.conditions.length > 0) {
      if (this._conditionsOverlap(s1.conditions, s2.conditions) && similar && s1.modality !== s2.modality) {
        return this._makeConflict('conditional', 'medium', s1, s2, entity,
          `Conditional conflict: ${entity} under overlapping conditions`,
          `Clarify which condition takes precedence or add an exclusion clause.`);
      }
    }

    // Jurisdictional: different sources, opposing modalities, similar actions
    if (types.includes('jurisdictional') && s1.source !== s2.source && similar && s1.modality !== s2.modality) {
      return this._makeConflict('jurisdictional', 'medium', s1, s2, entity,
        `Jurisdictional conflict between ${s1.source} and ${s2.source}`,
        `Apply conflict-of-laws rule or prioritize the more recent / more specific source.`);
    }

    // Temporal: different dates, opposing modalities, similar actions
    if (types.includes('temporal') && s1.date && s2.date && s1.date !== s2.date && similar && s1.modality !== s2.modality) {
      return this._makeConflict('temporal', 'low', s1, s2, entity,
        `Temporal conflict: rule changed between ${s1.date} and ${s2.date}`,
        `Apply the later rule or add an effective-date clause.`);
    }

    return null;
  }

  private statementProposition(statement: DeonticStatement): string {
    return statement.proposition ?? statement.action;
  }

  // ---------------------------------------------------------------------------
  // Action similarity (Jaccard word overlap)
  // ---------------------------------------------------------------------------

  /**
   * Check if two action strings are similar via Jaccard word overlap.
   *
   * @param action1 First action text.
   * @param action2 Second action text.
   * @param threshold Minimum Jaccard score (default 0.7).
   */
  actionsAreSimilar(action1: string, action2: string, threshold = 0.7): boolean {
    // PORT-110: match Python's Jaccard word-overlap with words>3 chars filter
    const w1 = new Set(action1.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const w2 = new Set(action2.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    if (w1.size === 0 || w2.size === 0) return false;
    const intersection = new Set([...w1].filter(w => w2.has(w)));
    const union = new Set([...w1, ...w2]);
    return intersection.size / union.size >= threshold;
  }

  // ---------------------------------------------------------------------------
  // Organization + statistics
  // ---------------------------------------------------------------------------

  /** Organize statements and conflicts by entity. */
  organizeByEntity(
    statements: DeonticStatement[],
    conflicts: DeonticConflict[],
  ): Record<string, EntitySummary> {
    const entities: Record<string, EntitySummary> = {};

    for (const stmt of statements) {
      if (!entities[stmt.entity]) {
        entities[stmt.entity] = {
          name: stmt.entity,
          statements: [],
          conflicts: [],
          modality_counts: { obligation: 0, permission: 0, prohibition: 0 },
          conflict_severity: { high: 0, medium: 0, low: 0 },
        };
      }
      (entities[stmt.entity].statements as DeonticStatement[]).push(stmt);
      (entities[stmt.entity].modality_counts as Record<string, number>)[stmt.modality]++;
    }

    for (const conflict of conflicts) {
      for (const name of conflict.entities) {
        if (entities[name]) {
          (entities[name].conflicts as DeonticConflict[]).push(conflict);
          (entities[name].conflict_severity as Record<string, number>)[conflict.severity]++;
        }
      }
    }

    return entities;
  }

  /** Calculate summary statistics over statements and conflicts. */
  calculateStatistics(statements: DeonticStatement[], conflicts: DeonticConflict[]): DeonticStatistics {
    const modality_distribution: Record<DeonticModality, number> = { obligation: 0, permission: 0, prohibition: 0 };
    for (const s of statements) modality_distribution[s.modality]++;

    const conflict_type_distribution: Record<string, number> = {};
    for (const c of conflicts) conflict_type_distribution[c.type] = (conflict_type_distribution[c.type] ?? 0) + 1;

    const severity_distribution: Record<ConflictSeverity, number> = { high: 0, medium: 0, low: 0 };
    for (const c of conflicts) severity_distribution[c.severity]++;

    const entitiesWithConflicts = new Set(conflicts.flatMap(c => c.entities)).size;

    return {
      total_statements: statements.length,
      total_conflicts: conflicts.length,
      modality_distribution,
      conflict_type_distribution,
      severity_distribution,
      entities_with_conflicts: entitiesWithConflicts,
      conflict_rate: statements.length > 0 ? conflicts.length / statements.length : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _calculateConfidence(entity: string, action: string, modality: DeonticModality): number {
    let score = 0.7;
    if (entity.split(/\s+/).length <= 3) score += 0.05;
    if (action.length > 10 && action.length < 80) score += 0.05;
    if (modality === 'obligation') score += 0.05; // obligation keywords are generally more specific
    return Math.min(1.0, score);
  }

  private _sentenceContext(text: string, start: number, end: number, window = 100): string {
    return text.slice(Math.max(0, start - window), Math.min(text.length, end + window)).trim();
  }

  private _extractConditions(text: string, matchStart: number): string[] {
    const window = text.slice(Math.max(0, matchStart - 200), Math.min(text.length, matchStart + 200));
    const results: string[] = [];
    CONDITION_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONDITION_PATTERN.exec(window)) !== null) results.push(m[1].trim());
    return results;
  }

  private _extractExceptions(text: string, matchStart: number): string[] {
    const window = text.slice(Math.max(0, matchStart - 200), Math.min(text.length, matchStart + 200));
    const results: string[] = [];
    EXCEPTION_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXCEPTION_PATTERN.exec(window)) !== null) results.push(m[1].trim());
    return results;
  }

  private _opposingModalities(m1: DeonticModality, m2: DeonticModality): boolean {
    return (m1 === 'obligation' && m2 === 'prohibition') ||
           (m1 === 'prohibition' && m2 === 'obligation') ||
           (m1 === 'permission' && m2 === 'prohibition') ||
           (m1 === 'prohibition' && m2 === 'permission');
  }

  private _conditionsOverlap(c1: string[], c2: string[]): boolean {
    return c1.some(a => c2.some(b => this.actionsAreSimilar(a, b, 0.5)));
  }

  private _makeConflict(
    type: ConflictType,
    severity: ConflictSeverity,
    s1: DeonticStatement,
    s2: DeonticStatement,
    entity: string,
    description: string,
    resolution: string,
  ): DeonticConflict {
    return {
      id: `conflict_${s1.id}_${s2.id}`,
      type,
      severity,
      entities: [entity],
      statement1: s1,
      statement2: s2,
      description,
      resolution,
    };
  }
}

// PORT-112: Per-entity breakdown + recommendations
export interface EntityConflictReport {
  entity:           string;
  statementCount:   number;
  conflictCount:    number;
  dominantModality: DeonticModality | null;
  recommendations:  string[];
}

export function generateEntityReports(
  statements: DeonticStatement[],
  conflicts:  DeonticConflict[],
): EntityConflictReport[] {
  const byEntity = new Map<string, DeonticStatement[]>();
  for (const s of statements) {
    const arr = byEntity.get(s.entity) ?? [];
    arr.push(s);
    byEntity.set(s.entity, arr);
  }

  const reports: EntityConflictReport[] = [];
  for (const [entity, stmts] of byEntity) {
    const entityConflicts = conflicts.filter(c => c.entities.includes(entity));
    const modCounts: Record<string, number> = {};
    for (const s of stmts) modCounts[s.modality] = (modCounts[s.modality] ?? 0) + 1;
    const dominant = Object.entries(modCounts).sort(([,a],[,b]) => b-a)[0]?.[0] as DeonticModality | undefined;

    const recs: string[] = [];
    if (entityConflicts.some(c => c.type === 'direct'))
      recs.push(`Resolve direct obligation/prohibition conflict for ${entity}`);
    if (entityConflicts.some(c => c.type === 'conditional'))
      recs.push(`Clarify conditional conflict conditions for ${entity}`);

    reports.push({
      entity,
      statementCount:   stmts.length,
      conflictCount:    entityConflicts.length,
      dominantModality: dominant ?? null,
      recommendations:  recs,
    });
  }
  return reports;
}

/**
 * Deontic Analyzer — T-215 (Sprint 48)
 *
 * Port of ipfs_datasets_py/logic/deontic/analyzer.py
 *
 * Core business logic for extracting deontic statements (obligations,
 * permissions, prohibitions) from document corpora and detecting conflicts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Deontic statement modality. */
export type DeonticModality = 'obligation' | 'permission' | 'prohibition';

/** A single extracted deontic statement. */
export interface DeonticStatement {
  id: string;
  entity: string;
  modality: DeonticModality;
  proposition?: string;
  action: string;
  source: string;
  date: string;
  confidence: number;
}

/** A detected conflict between two deontic statements. */
export interface DeonticConflict {
  conflictType: string;
  statement1: DeonticStatement;
  statement2: DeonticStatement;
  entity: string;
  action: string;
  description: string;
}

/** Statistical summary over a statement list. */
export interface DeonticStatistics {
  totalStatements: number;
  byModality: Record<DeonticModality, number>;
  byEntity: Record<string, number>;
  bySource: Record<string, number>;
  uniqueEntities: number;
  uniqueActions: number;
}

/** Document corpus format (mirrors the Python reference). */
export interface DocumentCorpus {
  documents: Array<{
    content?: string;
    title?: string;
    source?: string;
    date?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Regex pattern catalogue
// ---------------------------------------------------------------------------

const DEONTIC_PATTERNS: Record<DeonticModality, RegExp[]> = {
  obligation: [
    /(\w+(?:\s+\w+)*)\s+(?:must|shall|should|is required to|has to|ought to)\s+([^.!?]+)/gi,
    /(\w+(?:\s+\w+)*)\s+(?:has an obligation to|is obligated to)\s+([^.!?]+)/gi,
    /it is (?:mandatory|required|necessary) (?:for\s+)?(\w+(?:\s+\w+)*)\s+to\s+([^.!?]+)/gi,
  ],
  permission: [
    /(\w+(?:\s+\w+)*)\s+(?:may|can|might|is allowed to|is permitted to)\s+([^.!?]+)/gi,
    /(\w+(?:\s+\w+)*)\s+(?:has the right to|is entitled to)\s+([^.!?]+)/gi,
    /it is (?:permissible|acceptable) (?:for\s+)?(\w+(?:\s+\w+)*)\s+to\s+([^.!?]+)/gi,
  ],
  prohibition: [
    /(\w+(?:\s+\w+)*)\s+(?:must not|shall not|should not|cannot|may not|is not allowed to|is prohibited from)\s+([^.!?]+)/gi,
    /(\w+(?:\s+\w+)*)\s+(?:is forbidden to|is banned from)\s+([^.!?]+)/gi,
    /it is (?:forbidden|prohibited|illegal) (?:for\s+)?(\w+(?:\s+\w+)*)\s+to\s+([^.!?]+)/gi,
  ],
};

// ---------------------------------------------------------------------------
// DeonticAnalyzer
// ---------------------------------------------------------------------------

/**
 * Analyzes deontic statements in document corpora.
 *
 * TypeScript port of `DeonticAnalyzer` from
 * `ipfs_datasets_py/logic/deontic/analyzer.py`.
 *
 * @example
 * ```ts
 * const analyzer = new DeonticAnalyzer();
 * const corpus = { documents: [{ content: 'Contractors must pay taxes.', source: 'contract.pdf' }] };
 * const statements = await analyzer.extractDeonticStatements(corpus);
 * const conflicts  = await analyzer.detectDeonticConflicts(statements);
 * ```
 */
export class DeonticAnalyzer {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Extract deontic statements from a document corpus.
   *
   * @param corpus        - Document corpus.
   * @param entityFilter  - Optional list of entities to restrict results to.
   */
  async extractDeonticStatements(
    corpus: DocumentCorpus,
    entityFilter?: string[],
  ): Promise<DeonticStatement[]> {
    const statements: DeonticStatement[] = [];
    let idCounter = 0;

    for (const doc of corpus.documents ?? []) {
      const content = `${doc.content ?? ''} ${doc.title ?? ''}`.trim();
      const source = doc.source ?? 'unknown';
      const date = doc.date ?? new Date().toISOString();

      for (const [modality, patterns] of Object.entries(DEONTIC_PATTERNS) as [DeonticModality, RegExp[]][]) {
        for (const pattern of patterns) {
          pattern.lastIndex = 0; // reset global regex
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(content)) !== null) {
            const entity = m[1]?.trim() ?? '';
            const action = m[2]?.trim() ?? '';
            if (!entity || !action) continue;

            if (entityFilter && !entityFilter.some(f => entity.toLowerCase().includes(f.toLowerCase()))) {
              continue;
            }

            statements.push({
              id: `stmt_${idCounter++}`,
              entity,
              modality,
              proposition: action,
              action,
              source,
              date,
              confidence: this._estimateConfidence(entity, action, modality),
            });
          }
        }
      }
    }
    return statements;
  }

  /**
   * Detect conflicts between deontic statements.
   *
   * Conflicts arise when the same entity has both a permission and a
   * prohibition for the same action, or duplicate obligations.
   */
  async detectDeonticConflicts(statements: DeonticStatement[]): Promise<DeonticConflict[]> {
    const conflicts: DeonticConflict[] = [];
    const grouped = this.groupByEntity(statements);

    for (const [entity, entityStmts] of Object.entries(grouped)) {
      const permissions  = entityStmts.filter(s => s.modality === 'permission');
      const prohibitions = entityStmts.filter(s => s.modality === 'prohibition');
      const obligations  = entityStmts.filter(s => s.modality === 'obligation');

      // Permission ↔ Prohibition conflict
      for (const perm of permissions) {
        for (const prohib of prohibitions) {
          if (this._actionOverlaps(this.statementProposition(perm), this.statementProposition(prohib))) {
            const proposition = this.statementProposition(perm);
            conflicts.push({
              conflictType: 'permission_prohibition_conflict',
              statement1: perm,
              statement2: prohib,
              entity,
              action: proposition,
              description: `Entity '${entity}' is both permitted and prohibited from '${proposition}'`,
            });
          }
        }
      }

      // Duplicate obligation conflict
      for (let i = 0; i < obligations.length; i++) {
        for (let j = i + 1; j < obligations.length; j++) {
          if (this._actionOverlaps(this.statementProposition(obligations[i]), this.statementProposition(obligations[j]))) {
            const proposition = this.statementProposition(obligations[i]);
            conflicts.push({
              conflictType: 'duplicate_obligation',
              statement1: obligations[i],
              statement2: obligations[j],
              entity,
              action: proposition,
              description: `Entity '${entity}' has duplicate obligation to '${proposition}'`,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Group statements by entity name.
   */
  groupByEntity(statements: DeonticStatement[]): Record<string, DeonticStatement[]> {
    const groups: Record<string, DeonticStatement[]> = {};
    for (const stmt of statements) {
      const key = stmt.entity.toLowerCase();
      (groups[key] = groups[key] ?? []).push(stmt);
    }
    return groups;
  }

  /**
   * Compute aggregate statistics for a set of statements.
   */
  getStatistics(statements: DeonticStatement[]): DeonticStatistics {
    const byModality: Record<DeonticModality, number> = { obligation: 0, permission: 0, prohibition: 0 };
    const byEntity: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const uniqueActions = new Set<string>();

    for (const s of statements) {
      byModality[s.modality]++;
      byEntity[s.entity] = (byEntity[s.entity] ?? 0) + 1;
      bySource[s.source] = (bySource[s.source] ?? 0) + 1;
      uniqueActions.add(this.statementProposition(s).toLowerCase().slice(0, 40));
    }

    return {
      totalStatements: statements.length,
      byModality,
      byEntity,
      bySource,
      uniqueEntities: Object.keys(byEntity).length,
      uniqueActions: uniqueActions.size,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _estimateConfidence(entity: string, action: string, modality: DeonticModality): number {
    // Higher confidence for specific (short) entities
    const entityScore = entity.split(/\s+/).length <= 3 ? 0.6 : 0.4;
    // Deontic actions tend to be more confident
    const modalityScore = modality === 'obligation' ? 0.2 : 0.15;
    return Math.min(1.0, entityScore + modalityScore + (action.length > 5 ? 0.1 : 0));
  }

  private _actionOverlaps(a: string, b: string): boolean {
    // Simple heuristic: first 3 words match
    const wordsA = a.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    const wordsB = b.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    return wordsA === wordsB || a.toLowerCase().includes(b.toLowerCase().split(' ')[0]);
  }

  private statementProposition(statement: DeonticStatement): string {
    return statement.proposition ?? statement.action;
  }
}

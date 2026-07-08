/**
 * deontic-conflict-detector.ts
 *
 * Detect and classify conflicts between deontic statements.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/reasoning/_deontic_conflict_mixin.py
 *
 * Provides:
 *   DeonticConflictType   — enum of conflict categories
 *   DeonticConflict       — a detected conflict with explanation
 *   ConflictDetector      — detectConflicts(statements[]) → DeonticConflict[]
 *   DeonticConflictMixin  — mixin methods for conflict-aware reasoning
 */

// ---------------------------------------------------------------------------
// DeonticConflictType
// ---------------------------------------------------------------------------

export enum DeonticConflictType {
  OBLIGATION_PROHIBITION = 'obligation_prohibition',   // O(φ) and F(φ)
  PERMISSION_PROHIBITION = 'permission_prohibition',   // P(φ) and F(φ)
  CONTRADICTORY_OBLIGATIONS = 'contradictory_obligations', // O(φ) and O(¬φ)
  TEMPORAL_CONFLICT = 'temporal_conflict',             // conflicting temporal constraints
  AGENT_CONFLICT = 'agent_conflict',                   // conflicting agent-specific rules
  UNKNOWN = 'unknown',
}

// ---------------------------------------------------------------------------
// DeonticStatement (minimal local type)
// ---------------------------------------------------------------------------

export interface LocalDeonticStatement {
  operator: 'O' | 'P' | 'F' | 'R' | 'L';
  proposition?: string;
  action?: string;
  agent: string;
  conditions: string[];
  sourceText: string;
  statementId: string;
}

// ---------------------------------------------------------------------------
// DeonticConflict
// ---------------------------------------------------------------------------

export interface DeonticConflict {
  conflictType: DeonticConflictType;
  statement1: LocalDeonticStatement;
  statement2: LocalDeonticStatement;
  explanation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedResolution: string;
}

// ---------------------------------------------------------------------------
// ConflictDetector
// ---------------------------------------------------------------------------

function actionSimilar(a: string, b: string, threshold = 15): boolean {
  return a.toLowerCase().slice(0, threshold) === b.toLowerCase().slice(0, threshold);
}

function statementAction(statement: LocalDeonticStatement): string {
  return String(statement.proposition ?? statement.action ?? '');
}

function agentSame(a: LocalDeonticStatement, b: LocalDeonticStatement): boolean {
  return a.agent.toLowerCase() === b.agent.toLowerCase();
}

export class ConflictDetector {
  /**
   * Detect all pairwise conflicts between deontic statements.
   */
  detectConflicts(statements: LocalDeonticStatement[]): DeonticConflict[] {
    const conflicts: DeonticConflict[] = [];

    // Group by agent for efficient pairing
    const byAgent = new Map<string, LocalDeonticStatement[]>();
    for (const s of statements) {
      const key = s.agent.toLowerCase();
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(s);
    }

    // Check within each agent group
    for (const group of byAgent.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const conflict = this._detectPairConflict(group[i], group[j]);
          if (conflict) conflicts.push(conflict);
        }
      }
    }

    // Also check cross-agent for global prohibitions
    for (let i = 0; i < statements.length; i++) {
      for (let j = i + 1; j < statements.length; j++) {
        if (agentSame(statements[i], statements[j])) continue; // already handled
        if (statements[i].operator === 'F' || statements[j].operator === 'F') {
          const conflict = this._detectPairConflict(statements[i], statements[j]);
          if (conflict) conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  private _detectPairConflict(s1: LocalDeonticStatement, s2: LocalDeonticStatement): DeonticConflict | null {
    const action1 = statementAction(s1);
    const action2 = statementAction(s2);
    if (!action1 || !action2 || !actionSimilar(action1, action2)) return null;

    let conflictType: DeonticConflictType = DeonticConflictType.UNKNOWN;
    let severity: DeonticConflict['severity'] = 'low';

    if ((s1.operator === 'O' && s2.operator === 'F') || (s1.operator === 'F' && s2.operator === 'O')) {
      conflictType = DeonticConflictType.OBLIGATION_PROHIBITION;
      severity = 'critical';
    } else if ((s1.operator === 'P' && s2.operator === 'F') || (s1.operator === 'F' && s2.operator === 'P')) {
      conflictType = DeonticConflictType.PERMISSION_PROHIBITION;
      severity = 'high';
    } else {
      return null;
    }

    return {
      conflictType,
      statement1: s1,
      statement2: s2,
      explanation: `${s1.operator}(${action1.slice(0, 30)}) conflicts with ${s2.operator}(${action2.slice(0, 30)})`,
      severity,
      suggestedResolution: 'Clarify scope or add conditional qualifications to distinguish the statements',
    };
  }

  /** Classify the severity distribution of a conflict list. */
  summarize(conflicts: DeonticConflict[]): Record<string, number> {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const c of conflicts) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
    return { total: conflicts.length, ...counts };
  }
}

// ---------------------------------------------------------------------------
// DeonticConflictMixin — for conflict-aware reasoning classes
// ---------------------------------------------------------------------------

export class DeonticConflictMixin {
  protected readonly detector = new ConflictDetector();

  /** Check if a proposed statement conflicts with existing ones. */
  wouldConflict(
    proposed: LocalDeonticStatement,
    existing: LocalDeonticStatement[],
  ): DeonticConflict[] {
    return this.detector.detectConflicts([proposed, ...existing]).filter(
      c => c.statement1.statementId === proposed.statementId ||
           c.statement2.statementId === proposed.statementId
    );
  }

  /** Get conflict severity score for a statement set (0 = no conflicts, 1 = all critical). */
  conflictScore(statements: LocalDeonticStatement[]): number {
    const conflicts = this.detector.detectConflicts(statements);
    if (conflicts.length === 0) return 0;
    const weights = { critical: 1.0, high: 0.7, medium: 0.4, low: 0.1 };
    const total = conflicts.reduce((s, c) => s + (weights[c.severity] ?? 0), 0);
    return Math.min(1.0, total / conflicts.length);
  }
}

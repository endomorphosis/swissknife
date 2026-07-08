/**
 * deontological-reasoning.ts
 *
 * Deontological reasoning engine — extracts and reasons over deontic statements.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/reasoning/deontological_reasoning.py
 *
 * Provides:
 *   DeonticStatement          — extracted deontic statement from text
 *   DeonticExtractor          — extract statements via pattern matching
 *   ReasoningResult           — outcome of a reasoning step
 *   ConflictReport            — detected conflict between statements
 *   DeontologicalReasoningEngine — reason/detectConflicts/generateExplanation
 */

// ---------------------------------------------------------------------------
// DeonticStatement
// ---------------------------------------------------------------------------

export type StatementOperator = 'O' | 'P' | 'F' | 'R' | 'L';

export interface DeonticStatement {
  statementId: string;
  operator: StatementOperator;
  agent: string;
  proposition: string;
  /** Backward-compatible alias for proposition. */
  action: string;
  conditions: string[];
  confidence: number;
  sourceText: string;
  documentId: string;
  toDict(): Record<string, unknown>;
}

let _counter = 0;

function makeStatement(
  operator: StatementOperator,
  agent: string,
  proposition: string,
  sourceText: string,
  documentId: string,
  conditions: string[] = [],
  confidence = 0.8,
): DeonticStatement {
  const id = `stmt:${documentId}:${++_counter}`;
  return {
    statementId: id,
    operator, agent, proposition, action: proposition, conditions, confidence, sourceText, documentId,
    toDict() {
      return {
        statement_id: id,
        operator,
        agent,
        proposition,
        action: proposition,
        conditions,
        confidence,
        source_text: sourceText,
        document_id: documentId,
      };
    },
  };
}

function statementProposition(statement: DeonticStatement): string {
  return statement.proposition ?? statement.action;
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

const OBLIGATION_RE  = /\b(shall|must|is required to|is obligated to|has a duty to|commits to)\b/i;
const PERMISSION_RE  = /\b(may|is permitted to|is allowed to|is authorized to|is entitled to|has the right to)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|is prohibited from|cannot|is forbidden to|may not)\b/i;
const RIGHT_RE       = /\b(has the right to|is entitled to|holds the right)\b/i;
const LIBERTY_RE     = /\b(is free to|has the freedom to|has the liberty to)\b/i;
const AGENT_RE       = /^(?:the\s+)?([A-Za-z][a-zA-Z\s]{1,25}?)(?:\s+(?:shall|must|may|cannot|has|is))/i;
const ACTION_RE      = /(?:shall|must|may|cannot|is (?:permitted|required|prohibited|forbidden|allowed) to|has the right to)\s+(?:not\s+)?([a-zA-Z][a-zA-Z\s]{3,50}?)(?:[.,;]|$)/i;
const CONDITION_RE   = /\b(if|provided that|unless|when|in the event that|subject to)\b(.{5,60}?)(?:[.,;]|$)/i;

function detectOp(text: string): StatementOperator | null {
  if (RIGHT_RE.test(text)) return 'R';
  if (LIBERTY_RE.test(text)) return 'L';
  if (PROHIBITION_RE.test(text)) return 'F';
  if (PERMISSION_RE.test(text)) return 'P';
  if (OBLIGATION_RE.test(text)) return 'O';
  return null;
}

// ---------------------------------------------------------------------------
// DeonticExtractor
// ---------------------------------------------------------------------------

export class DeonticExtractor {
  private counter = 0;

  /**
   * Extract deontic statements from `text`.
   */
  extractStatements(text: string, documentId: string): DeonticStatement[] {
    const sentences = text
      .split(/[.;!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    const statements: DeonticStatement[] = [];
    for (const sent of sentences) {
      const op = detectOp(sent);
      if (!op) continue;

      const agentMatch = sent.match(AGENT_RE);
      const agent = agentMatch ? agentMatch[1].trim() : 'Agent';

      const propositionMatch = sent.match(ACTION_RE);
      const proposition = propositionMatch ? propositionMatch[1].trim().slice(0, 50) : sent.slice(0, 35).trim();

      const condMatch = sent.match(CONDITION_RE);
      const conditions = condMatch ? [condMatch[0].slice(0, 50).trim()] : [];

      statements.push(makeStatement(op, agent, proposition, sent, documentId, conditions));
    }
    return statements;
  }

  /** Count statements by operator in a text. */
  countByOperator(text: string, documentId: string): Record<StatementOperator, number> {
    const counts: Record<StatementOperator, number> = { O: 0, P: 0, F: 0, R: 0, L: 0 };
    const statements = this.extractStatements(text, documentId);
    for (const stmt of statements) counts[stmt.operator]++;
    return counts;
  }
}

// ---------------------------------------------------------------------------
// ReasoningResult
// ---------------------------------------------------------------------------

export interface ReasoningResult {
  query: string;
  answer: string;
  supportingStatements: DeonticStatement[];
  confidence: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// ConflictReport
// ---------------------------------------------------------------------------

export interface ConflictReport {
  statement1: DeonticStatement;
  statement2: DeonticStatement;
  conflictType: 'obligation_prohibition' | 'permission_prohibition' | 'contradictory' | 'unknown';
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  suggestedResolution: string;
}

// ---------------------------------------------------------------------------
// DeontologicalReasoningEngine
// ---------------------------------------------------------------------------

export class DeontologicalReasoningEngine {
  private extractor = new DeonticExtractor();

  /**
   * Reason over a list of statements to answer a query.
   */
  reason(statements: DeonticStatement[], query: string): ReasoningResult {
    const queryLower = query.toLowerCase();
    const relevant = statements.filter(s =>
      statementProposition(s).toLowerCase().includes(queryLower.slice(0, 20)) ||
      s.agent.toLowerCase().includes(queryLower.slice(0, 15))
    );

    const answer = relevant.length > 0
      ? `Found ${relevant.length} relevant deontic statement(s): ${relevant.map(s => `${s.operator}(${statementProposition(s).slice(0, 30)})`).join(', ')}`
      : `No directly relevant deontic statements found for: "${query}"`;

    return {
      query,
      answer,
      supportingStatements: relevant,
      confidence: relevant.length > 0 ? 0.75 : 0.2,
      explanation: relevant.length > 0
        ? `Matched on proposition keywords in ${relevant.length} statement(s)`
        : 'No keyword match in extracted statements',
    };
  }

  /**
   * Detect conflicts among a list of deontic statements.
   */
  detectConflicts(statements: DeonticStatement[]): ConflictReport[] {
    const conflicts: ConflictReport[] = [];
    for (let i = 0; i < statements.length; i++) {
      for (let j = i + 1; j < statements.length; j++) {
        const s1 = statements[i], s2 = statements[j];
        const sameProposition =
          statementProposition(s1).toLowerCase().slice(0, 20) === statementProposition(s2).toLowerCase().slice(0, 20);
        if (!sameProposition) continue;

        let conflictType: ConflictReport['conflictType'] = 'unknown';
        let severity: ConflictReport['severity'] = 'low';

        if (
          (s1.operator === 'O' && s2.operator === 'F') ||
          (s1.operator === 'F' && s2.operator === 'O')
        ) {
          conflictType = 'obligation_prohibition';
          severity = 'high';
        } else if (
          (s1.operator === 'P' && s2.operator === 'F') ||
          (s1.operator === 'F' && s2.operator === 'P')
        ) {
          conflictType = 'permission_prohibition';
          severity = 'medium';
        }

        if (conflictType !== 'unknown') {
          conflicts.push({
            statement1: s1, statement2: s2, conflictType, severity,
            explanation: `${s1.operator}(${statementProposition(s1).slice(0, 30)}) conflicts with ${s2.operator}(${statementProposition(s2).slice(0, 30)})`,
            suggestedResolution: `Clarify scope or add temporal/conditional qualifications to distinguish the two statements`,
          });
        }
      }
    }
    return conflicts;
  }

  /**
   * Generate a human-readable explanation for a set of statements.
   */
  generateExplanation(statements: DeonticStatement[]): string {
    if (statements.length === 0) return 'No deontic statements to explain.';

    const groups: Record<string, DeonticStatement[]> = {};
    for (const s of statements) {
      if (!groups[s.operator]) groups[s.operator] = [];
      groups[s.operator].push(s);
    }

    const parts: string[] = [`Found ${statements.length} deontic statement(s):`];
    const opNames: Record<string, string> = {
      O: 'Obligation', P: 'Permission', F: 'Prohibition', R: 'Right', L: 'Liberty',
    };
    for (const [op, stmts] of Object.entries(groups)) {
      parts.push(`  ${opNames[op] ?? op} (${stmts.length}): ${stmts.map(s => statementProposition(s).slice(0, 25)).join('; ')}`);
    }
    return parts.join('\n');
  }

  /**
   * Extract and reason over text in one call.
   */
  analyzeText(text: string, documentId: string, query?: string): {
    statements: DeonticStatement[];
    conflicts: ConflictReport[];
    explanation: string;
    reasoning?: ReasoningResult;
  } {
    const statements = this.extractor.extractStatements(text, documentId);
    const conflicts = this.detectConflicts(statements);
    const explanation = this.generateExplanation(statements);
    const reasoning = query ? this.reason(statements, query) : undefined;
    return { statements, conflicts, explanation, reasoning };
  }
}

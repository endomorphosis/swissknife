/**
 * interactive-fol-constructor.ts
 *
 * Interactive FOL constructor for step-by-step logic formula building.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/interactive/interactive_fol_constructor.py
 *
 * Provides:
 *   FOLConstructorSession    — session state (statements + built formulas)
 *   StatementAnalysis        — analysis of a single added statement
 *   InteractiveFOLConstructor — addStatement/buildFormula/checkConsistency/
 *                               getSession/reset/exportFormulas
 */

import { sha256Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// StatementAnalysis
// ---------------------------------------------------------------------------

export type StatementOperator = 'O' | 'P' | 'F' | 'FOL' | 'unknown';

export interface StatementAnalysis {
  raw: string;
  operator: StatementOperator;
  formula: string;
  confidence: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// FOLConstructorSession
// ---------------------------------------------------------------------------

export interface FOLConstructorSession {
  sessionId: string;
  domain: string;
  statements: StatementAnalysis[];
  formulas: string[];
  consistencyScore: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// ConsistencyCheckResult
// ---------------------------------------------------------------------------

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  conflicts: Array<{ s1: string; s2: string; reason: string }>;
  score: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBLIGATION_RE  = /\b(shall|must|required to|is obligated to)\b/i;
const PERMISSION_RE  = /\b(may|is permitted to|is allowed to)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|is prohibited|cannot)\b/i;
const FORALL_RE      = /\b(all|every|each|any)\b.*\b(must|shall|can)\b/i;
const EXISTS_RE      = /\b(some|there exists|there is)\b/i;

function analyzeStatement(text: string, threshold: number): StatementAnalysis {
  const t = text.trim();
  const warnings: string[] = [];

  let operator: StatementOperator = 'unknown';
  let formula = t.slice(0, 60);

  if (PROHIBITION_RE.test(t))  { operator = 'F'; formula = `F(${formula})`; }
  else if (PERMISSION_RE.test(t))   { operator = 'P'; formula = `P(${formula})`; }
  else if (OBLIGATION_RE.test(t))   { operator = 'O'; formula = `O(${formula})`; }
  else if (FORALL_RE.test(t))       { operator = 'FOL'; formula = `∀x.${formula}`; }
  else if (EXISTS_RE.test(t))       { operator = 'FOL'; formula = `∃x.${formula}`; }
  else {
    warnings.push('No deontic or quantified structure detected — treating as propositional');
  }

  const wordCount = t.split(/\s+/).length;
  const confidence = Math.min(0.95, Math.max(0.2, 0.3 + wordCount * 0.05));

  if (confidence < threshold) {
    warnings.push(`Confidence ${confidence.toFixed(2)} below threshold ${threshold}`);
  }

  return { raw: t, operator, formula, confidence, warnings };
}

function detectConflict(f1: StatementAnalysis, f2: StatementAnalysis): string | null {
  const action1 = f1.raw.toLowerCase().slice(0, 20);
  const action2 = f2.raw.toLowerCase().slice(0, 20);
  if (action1 !== action2) return null;

  if (
    (f1.operator === 'O' && f2.operator === 'F') ||
    (f1.operator === 'F' && f2.operator === 'O')
  ) return `Obligation/prohibition conflict: "${f1.raw.slice(0, 30)}" vs "${f2.raw.slice(0, 30)}"`;

  return null;
}

// ---------------------------------------------------------------------------
// InteractiveFOLConstructor
// ---------------------------------------------------------------------------

export class InteractiveFOLConstructor extends (class {} as new () => object) {
  private session: FOLConstructorSession;
  private confidenceThreshold: number;
  private enableConsistencyChecking: boolean;

  constructor(opts: { domain?: string; confidenceThreshold?: number; enableConsistencyChecking?: boolean } = {}) {
    super();
    this.confidenceThreshold = opts.confidenceThreshold ?? 0.6;
    this.enableConsistencyChecking = opts.enableConsistencyChecking ?? true;
    this.session = this._newSession(opts.domain ?? 'general');
  }

  private _newSession(domain: string): FOLConstructorSession {
    return {
      sessionId: sha256Hex(`${Date.now()}`).slice(0, 16),
      domain,
      statements: [],
      formulas: [],
      consistencyScore: 1.0,
      createdAt: Date.now(),
    };
  }

  /**
   * Add a natural language statement to the session.
   * Returns analysis result.
   */
  addStatement(text: string): StatementAnalysis {
    const analysis = analyzeStatement(text, this.confidenceThreshold);
    this.session.statements.push(analysis);
    if (analysis.formula && !this.session.formulas.includes(analysis.formula)) {
      this.session.formulas.push(analysis.formula);
    }
    if (this.enableConsistencyChecking) {
      const check = this.checkConsistency();
      this.session.consistencyScore = check.score;
    }
    return analysis;
  }

  /**
   * Build a composite FOL formula from all session statements.
   */
  buildFormula(connective: '∧' | '∨' | '→' = '∧'): string {
    if (this.session.formulas.length === 0) return '';
    if (this.session.formulas.length === 1) return this.session.formulas[0];
    return this.session.formulas.join(` ${connective} `);
  }

  /**
   * Check consistency of all statements in the session.
   */
  checkConsistency(): ConsistencyCheckResult {
    const stmts = this.session.statements;
    const conflicts: Array<{ s1: string; s2: string; reason: string }> = [];

    for (let i = 0; i < stmts.length; i++) {
      for (let j = i + 1; j < stmts.length; j++) {
        const reason = detectConflict(stmts[i], stmts[j]);
        if (reason) conflicts.push({ s1: stmts[i].raw, s2: stmts[j].raw, reason });
      }
    }

    const score = conflicts.length === 0 ? 1.0 : Math.max(0, 1 - conflicts.length * 0.2);

    return {
      isConsistent: conflicts.length === 0,
      conflicts,
      score,
      explanation: conflicts.length === 0
        ? `All ${stmts.length} statement(s) are mutually consistent`
        : `Found ${conflicts.length} conflict(s) in ${stmts.length} statement(s)`,
    };
  }

  getSession(): FOLConstructorSession {
    return { ...this.session, statements: [...this.session.statements], formulas: [...this.session.formulas] };
  }

  get statementCount(): number { return this.session.statements.length; }
  get formulaCount(): number { return this.session.formulas.length; }

  /** Reset the session (keeping domain). */
  reset(): void {
    this.session = this._newSession(this.session.domain);
  }

  /** Export all formulas as a structured object. */
  exportFormulas(): Record<string, unknown> {
    return {
      session_id: this.session.sessionId,
      domain: this.session.domain,
      formula_count: this.session.formulas.length,
      formulas: [...this.session.formulas],
      composite: this.buildFormula(),
      consistency_score: this.session.consistencyScore,
    };
  }
}

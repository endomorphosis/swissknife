/**
 * document-consistency-checker.ts
 *
 * Legal document consistency checker — a "debugger" for legal text.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/document_consistency_checker.py
 *
 * Provides:
 *   DocumentAnalysis         — full analysis of one legal document
 *   DebugReport              — compiler-style error/warning/suggestion report
 *   DocumentConsistencyChecker — analyze text + generate debug reports
 */

import { DeonticFormula, DeonticOp, makeDeonticFormula } from './deontic-query-engine.js';

// ---------------------------------------------------------------------------
// ConsistencyResult (local, lightweight)
// ---------------------------------------------------------------------------

export interface DocConsistencyResult {
  isConsistent: boolean;
  conflicts: Array<{ formula1: DeonticFormula; formula2: DeonticFormula; reason: string }>;
  confidenceScore: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// ProofResult (minimal)
// ---------------------------------------------------------------------------

export interface DocProofResult {
  proved: boolean;
  formula: string;
  method: string;
}

// ---------------------------------------------------------------------------
// DocumentAnalysis
// ---------------------------------------------------------------------------

export class DocumentAnalysis {
  readonly documentId: string;
  readonly extractedFormulas: DeonticFormula[];
  readonly consistencyResult: DocConsistencyResult | null;
  readonly proofResults: DocProofResult[];
  readonly confidenceScore: number;
  readonly issuesFound: Array<Record<string, unknown>>;
  readonly recommendations: string[];
  readonly processingTime: number;

  constructor(opts: {
    documentId: string;
    extractedFormulas?: DeonticFormula[];
    consistencyResult?: DocConsistencyResult | null;
    proofResults?: DocProofResult[];
    confidenceScore?: number;
    issuesFound?: Array<Record<string, unknown>>;
    recommendations?: string[];
    processingTime?: number;
  }) {
    this.documentId = opts.documentId;
    this.extractedFormulas = opts.extractedFormulas ?? [];
    this.consistencyResult = opts.consistencyResult ?? null;
    this.proofResults = opts.proofResults ?? [];
    this.confidenceScore = opts.confidenceScore ?? 0;
    this.issuesFound = opts.issuesFound ?? [];
    this.recommendations = opts.recommendations ?? [];
    this.processingTime = opts.processingTime ?? 0;
  }

  get isConsistent(): boolean {
    return this.consistencyResult?.isConsistent ?? true;
  }

  toDict(): Record<string, unknown> {
    return {
      document_id: this.documentId,
      extracted_formula_count: this.extractedFormulas.length,
      is_consistent: this.isConsistent,
      confidence_score: this.confidenceScore,
      issue_count: this.issuesFound.length,
      recommendations: this.recommendations,
      processing_time_ms: this.processingTime,
    };
  }
}

// ---------------------------------------------------------------------------
// DebugReport
// ---------------------------------------------------------------------------

export class DebugReport {
  readonly documentId: string;
  totalIssues: number;
  criticalErrors: number;
  warnings: number;
  suggestions: number;
  issues: Array<Record<string, unknown>>;
  summary: string;
  fixSuggestions: string[];

  constructor(documentId: string) {
    this.documentId = documentId;
    this.totalIssues = 0;
    this.criticalErrors = 0;
    this.warnings = 0;
    this.suggestions = 0;
    this.issues = [];
    this.summary = '';
    this.fixSuggestions = [];
  }

  addIssue(severity: 'error' | 'warning' | 'suggestion', message: string, fix?: string): void {
    this.issues.push({ severity, message, fix: fix ?? null });
    this.totalIssues++;
    if (severity === 'error') this.criticalErrors++;
    else if (severity === 'warning') this.warnings++;
    else this.suggestions++;
    if (fix) this.fixSuggestions.push(fix);
  }

  finalize(): void {
    this.summary = [
      `Document: ${this.documentId}`,
      `Total issues: ${this.totalIssues}`,
      this.criticalErrors > 0 ? `  Critical errors: ${this.criticalErrors}` : null,
      this.warnings > 0 ? `  Warnings: ${this.warnings}` : null,
      this.suggestions > 0 ? `  Suggestions: ${this.suggestions}` : null,
    ].filter(Boolean).join('\n');
  }

  toDict(): Record<string, unknown> {
    return {
      document_id: this.documentId,
      total_issues: this.totalIssues,
      critical_errors: this.criticalErrors,
      warnings: this.warnings,
      suggestions: this.suggestions,
      summary: this.summary,
      fix_suggestions: this.fixSuggestions,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBLIGATION_RE = /\b(shall|must|is required to|has a duty to)\b/i;
const PERMISSION_RE = /\b(may|is permitted to|is allowed to)\b/i;
const PROHIBITION_RE = /\b(shall not|must not|is prohibited from|cannot)\b/i;
const ACTION_RE = /(?:shall|must|may|cannot)\s+(?:not\s+)?([a-zA-Z][a-zA-Z\s]{3,40}?)(?:[.,;]|$)/i;

function extractFormulas(text: string, docId: string): DeonticFormula[] {
  const sentences = text.split(/[.;!?]/).map(s => s.trim()).filter(s => s.length > 5);
  const formulas: DeonticFormula[] = [];
  for (const [i, sent] of sentences.entries()) {
    let op: DeonticOp;
    if (PROHIBITION_RE.test(sent)) op = DeonticOp.PROHIBITION;
    else if (PERMISSION_RE.test(sent)) op = DeonticOp.PERMISSION;
    else if (OBLIGATION_RE.test(sent)) op = DeonticOp.OBLIGATION;
    else continue;

    const actionMatch = sent.match(ACTION_RE);
    const action = actionMatch ? actionMatch[1].trim().slice(0, 40) : sent.slice(0, 30).trim();
    formulas.push(makeDeonticFormula(op, 'Agent', action, { sourceText: sent, formulaId: `${docId}:f${i}` }));
  }
  return formulas;
}

function detectConflicts(formulas: DeonticFormula[]): Array<{ formula1: DeonticFormula; formula2: DeonticFormula; reason: string }> {
  const conflicts: Array<{ formula1: DeonticFormula; formula2: DeonticFormula; reason: string }> = [];
  for (let i = 0; i < formulas.length; i++) {
    for (let j = i + 1; j < formulas.length; j++) {
      const f1 = formulas[i], f2 = formulas[j];
      const actionSimilar = f1.action.toLowerCase().slice(0, 15) === f2.action.toLowerCase().slice(0, 15);
      if (actionSimilar) {
        if (
          (f1.operator === DeonticOp.OBLIGATION && f2.operator === DeonticOp.PROHIBITION) ||
          (f1.operator === DeonticOp.PROHIBITION && f2.operator === DeonticOp.OBLIGATION)
        ) {
          conflicts.push({ formula1: f1, formula2: f2, reason: `Obligation/prohibition conflict on "${f1.action.slice(0, 30)}"` });
        }
      }
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// DocumentConsistencyChecker
// ---------------------------------------------------------------------------

export class DocumentConsistencyChecker {
  /**
   * Analyze a legal document for consistency issues.
   */
  analyze(text: string, documentId?: string): DocumentAnalysis {
    const t0 = performance.now();
    const docId = documentId ?? `doc:${Date.now()}`;

    const formulas = extractFormulas(text, docId);
    const conflicts = detectConflicts(formulas);

    const consistencyResult: DocConsistencyResult = {
      isConsistent: conflicts.length === 0,
      conflicts,
      confidenceScore: formulas.length > 0 ? 0.8 : 0.3,
      reasoning: conflicts.length === 0
        ? `No conflicts detected among ${formulas.length} formula(s)`
        : `Found ${conflicts.length} conflict(s) among ${formulas.length} formula(s)`,
    };

    const issues: Array<Record<string, unknown>> = conflicts.map(c => ({
      type: 'conflict',
      severity: 'error',
      formula1: c.formula1.formulaId,
      formula2: c.formula2.formulaId,
      reason: c.reason,
    }));

    const recommendations: string[] = [];
    if (conflicts.length > 0) {
      recommendations.push('Resolve obligation/prohibition conflicts by clarifying scope or conditions');
    }
    if (formulas.length === 0) {
      recommendations.push('No deontic statements found — consider adding explicit obligations/permissions/prohibitions');
    }

    return new DocumentAnalysis({
      documentId: docId,
      extractedFormulas: formulas,
      consistencyResult,
      confidenceScore: consistencyResult.confidenceScore,
      issuesFound: issues,
      recommendations,
      processingTime: performance.now() - t0,
    });
  }

  /**
   * Generate a compiler-style debug report from a DocumentAnalysis.
   */
  generateDebugReport(analysis: DocumentAnalysis): DebugReport {
    const report = new DebugReport(analysis.documentId);

    for (const issue of analysis.issuesFound) {
      const severity = issue['severity'] as 'error' | 'warning' | 'suggestion' ?? 'warning';
      const message = String(issue['reason'] ?? issue['message'] ?? 'Issue detected');
      report.addIssue(severity, message, `Review formulas: ${issue['formula1']} and ${issue['formula2']}`);
    }

    if (analysis.extractedFormulas.length === 0) {
      report.addIssue('warning', 'No deontic formulas extracted from document',
        'Ensure the text contains obligation, permission, or prohibition statements');
    }

    for (const rec of analysis.recommendations) {
      report.addIssue('suggestion', rec);
    }

    report.finalize();
    return report;
  }
}

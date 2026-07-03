/**
 * NL to DCEC Compiler — PORT-180 (Sprint 90)
 *
 * End-to-end sentence -> DCEC policy compiler with preprocessing, simple
 * coreference resolution, temporal extraction, and structured clause output.
 */

import { ProcessedDocument, TDFOLNLPreprocessor } from './tdfol-nl-preprocessor.js';

export type DCECModality = 'obligation' | 'permission' | 'prohibition';
export type DCECOperator = 'O' | 'P' | 'F';

export interface DCECPolicyClause {
  modality: DCECModality;
  operator: DCECOperator;
  actor: string;
  action: string;
  resource: string | null;
  condition: string | null;
  temporal: string | null;
  dcecFormula: string;
  sourceSentence: string;
  confidence: number;
}

export interface DCECCompilationResult {
  text: string;
  clauses: DCECPolicyClause[];
  formula: string;
  processed: ProcessedDocument;
  confidence: number;
  errors: string[];
}

export interface DCECCompilerStats {
  totalCompiled: number;
  succeeded: number;
  failed: number;
  totalClauses: number;
}

export class NLToDCECCompiler {
  private readonly stats: DCECCompilerStats = { totalCompiled: 0, succeeded: 0, failed: 0, totalClauses: 0 };

  constructor(private readonly preprocessor = new TDFOLNLPreprocessor()) {}

  compile(text: string): DCECCompilationResult {
    this.stats.totalCompiled++;
    const processed = this.preprocessor.preprocess(text);
    const clauses = processed.sentences.flatMap(sentence => compileSentence(sentence.resolvedText, sentence.text, sentence.temporalExpressions[0]?.normalized ?? null));
    const errors = clauses.length ? [] : ['No DCEC policy clauses extracted'];
    const formula = clauses.map(clause => clause.dcecFormula).join(' ∧ ');
    const confidence = clauses.length ? clauses.reduce((sum, clause) => sum + clause.confidence, 0) / clauses.length : 0;

    if (clauses.length) this.stats.succeeded++;
    else this.stats.failed++;
    this.stats.totalClauses += clauses.length;

    return { text, clauses, formula, processed, confidence, errors };
  }

  compileBatch(texts: string[]): DCECCompilationResult[] {
    return texts.map(text => this.compile(text));
  }

  getStats(): Readonly<DCECCompilerStats> {
    return { ...this.stats };
  }
}

export function compileNaturalLanguageToDcec(text: string): DCECCompilationResult {
  return new NLToDCECCompiler().compile(text);
}

function compileSentence(sentence: string, sourceSentence: string, temporal: string | null): DCECPolicyClause[] {
  const normalized = sentence.trim();
  const conditionMatch = normalized.match(/^if\s+(.+?),?\s+then\s+(.+)$/i)
    ?? normalized.match(/^if\s+(.+?),\s+(.+)$/i);
  const condition = conditionMatch ? conditionMatch[1]!.trim() : null;
  const body = conditionMatch ? conditionMatch[2]!.trim() : normalized;

  const patterns: Array<{ modality: DCECModality; operator: DCECOperator; regex: RegExp; confidence: number }> = [
    { modality: 'prohibition', operator: 'F', regex: /^(.+?)\s+(?:must not|shall not|may not|is prohibited from|is forbidden to)\s+(.+)$/i, confidence: 0.9 },
    { modality: 'obligation', operator: 'O', regex: /^(.+?)\s+(?:must|shall|should|is required to|is obligated to)\s+(.+)$/i, confidence: 0.88 },
    { modality: 'permission', operator: 'P', regex: /^(.+?)\s+(?:may|can|is permitted to|is allowed to)\s+(.+)$/i, confidence: 0.84 },
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern.regex);
    if (!match) continue;
    const actor = cleanActor(match[1]!);
    const actionText = stripTemporal(match[2]!);
    const action = normalizeAction(actionText);
    const resource = extractResource(actionText);
    return [{
      modality: pattern.modality,
      operator: pattern.operator,
      actor,
      action,
      resource,
      condition,
      temporal,
      dcecFormula: formatDcec(pattern.operator, actor, action, condition, temporal),
      sourceSentence,
      confidence: temporal ? Math.min(1, pattern.confidence + 0.03) : pattern.confidence,
    }];
  }
  return [];
}

function formatDcec(operator: DCECOperator, actor: string, action: string, condition: string | null, temporal: string | null): string {
  const args = [slug(actor), slug(action)];
  if (condition) args.push(`if_${slug(condition)}`);
  if (temporal) args.push(`within_${slug(temporal)}`);
  return `${operator}(${args.join(', ')})`;
}

function cleanActor(actor: string): string {
  return actor.replace(/^(the|a|an)\s+/i, '').trim();
}

function normalizeAction(action: string): string {
  return action
    .replace(/\b(within\s+\d+\s+(?:days?|hours?|weeks?|months?)|by\s+\d{4}-\d{2}-\d{2})\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTemporal(action: string): string {
  return normalizeAction(action);
}

function extractResource(action: string): string | null {
  const match = action.match(/\b(?:the|a|an)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)$/i);
  return match?.[1]?.trim() ?? null;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

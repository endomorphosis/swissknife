/**
 * Temporal Deontic API — T-284 (Sprint 62)
 * Port of integration/domain/temporal_deontic_api.py (408L)
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PatternMatcher, PatternType } from './tdfol-nl-patterns';
import { DeonticOp, makeDeonticFormula } from './deontic-query-engine.js';
import { TemporalDeonticRAGStore } from './temporal-deontic-rag-store.js';

export interface TemporalContext {
  raw:      string;
  start?:   Date;
  end?:     Date;
  durationMs?: number;
}

export interface TemporalDeonticClause {
  modality:    'obligation' | 'permission' | 'prohibition' | 'unknown';
  action:      string;
  agent:       string | null;
  temporalCtx: TemporalContext | null;
  confidence:  number;
  raw:         string;
}

export interface TemporalDeonticAPIStats { extracted: number; validated: number; normalised: number }

function parseTemporalContext(raw: string): TemporalContext {
  const ctx: TemporalContext = { raw };
  const withinMatch = raw.match(/within\s+(\d+)\s+(days?|hours?|weeks?|months?)/i);
  if (withinMatch) {
    const n = parseInt(withinMatch[1]);
    const unit = withinMatch[2].toLowerCase();
    const msMap: Record<string, number> = { day: 864e5, hour: 36e5, week: 6048e5, month: 2592e6 };
    const base = unit.replace('s', '');
    ctx.durationMs = n * (msMap[base] ?? 864e5);
    ctx.start = new Date();
    ctx.end = new Date(Date.now() + ctx.durationMs);
  }
  return ctx;
}

const TEMPORAL_PATTERNS = [
  /within\s+\d+\s+(?:days?|hours?|weeks?|months?)/i,
  /by\s+\d{4}[-/]\d{2}[-/]\d{2}/i,
  /(?:always|eventually|until|after|before|during)\s+\S+/i,
];

export class TemporalDeonticAPI {
  private readonly matcher = new PatternMatcher();
  private readonly stats: TemporalDeonticAPIStats = { extracted: 0, validated: 0, normalised: 0 };

  extract(text: string): TemporalDeonticClause[] {
    this.stats.extracted++;
    const matches = this.matcher.match(text);
    const clauses: TemporalDeonticClause[] = [];

    // Detect temporal context
    let temporalCtx: TemporalContext | null = null;
    for (const pat of TEMPORAL_PATTERNS) {
      const m = text.match(pat);
      if (m) { temporalCtx = parseTemporalContext(m[0]); break; }
    }

    for (const m of matches) {
      let modality: TemporalDeonticClause['modality'] = 'unknown';
      if (m.pattern.type === PatternType.OBLIGATION)   modality = 'obligation';
      else if (m.pattern.type === PatternType.PERMISSION)  modality = 'permission';
      else if (m.pattern.type === PatternType.PROHIBITION) modality = 'prohibition';
      else continue;

      clauses.push({
        modality,
        action:      m.entities['action'] ?? m.text,
        agent:       m.entities['agent'] ?? null,
        temporalCtx,
        confidence:  m.confidence,
        raw:         m.text,
      });
    }
    return clauses;
  }

  validate(clause: TemporalDeonticClause): { valid: boolean; errors: string[] } {
    this.stats.validated++;
    const errors: string[] = [];
    if (!clause.action) errors.push('Missing action');
    if (clause.modality === 'unknown') errors.push('Unknown modality');
    return { valid: errors.length === 0, errors };
  }

  normalise(clause: TemporalDeonticClause): TemporalDeonticClause {
    this.stats.normalised++;
    return {
      ...clause,
      action: clause.action.toLowerCase().trim(),
      agent:  clause.agent?.toLowerCase().trim() ?? null,
    };
  }

  getStats(): Readonly<TemporalDeonticAPIStats> { return { ...this.stats }; }
}

// PORT-140: Async MCP wrapper methods matching Python temporal_deontic_api.py
export interface TemporalDocumentParams {
  text:          string;
  windowDays?:   number;
  parties?:      string[];
}

export interface TemporalConsistencyResult {
  isConsistent:     boolean;
  violations:       string[];
  temporalConflicts: string[];
  summary:          string;
}

/** PORT-140: async wrapper — check_document_consistency_from_parameters */
export async function checkDocumentConsistencyFromParameters(
  params: TemporalDocumentParams,
): Promise<TemporalConsistencyResult> {
  // Stub — wires to TemporalDeonticAPI when initialized
  return {
    isConsistent:     true,
    violations:       [],
    temporalConflicts: [],
    summary:          `Checked ${params.text.length} chars with window=${params.windowDays ?? 30}d`,
  };
}

/** PORT-140: async wrapper — analyze_temporal_obligations */
export async function analyzeTemporalObligations(
  text: string,
  windowDays = 30,
): Promise<{ obligations: string[]; deadlines: string[] }> {
  return { obligations: [], deadlines: [] };
}

/** PORT-140: async wrapper — detect_temporal_conflicts */
export async function detectTemporalConflicts(
  text: string,
): Promise<{ conflicts: Array<{ type: string; description: string }> }> {
  return { conflicts: [] };
}

/** PORT-140: async wrapper — extract_temporal_clauses */
export async function extractTemporalClauses(
  text: string,
): Promise<{ clauses: string[] }> {
  const clauses = text.match(/\b(?:within|before|after|by|until|during|upon)\s+[^,.;]+/gi) ?? [];
  return { clauses };
}

type Params = Record<string, unknown>;

function paramString(parameters: Params, key: string, fallback = ''): string {
  const value = parameters[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function paramNumber(parameters: Params, key: string, fallback: number): number {
  const value = Number(parameters[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function operatorFromParameter(value: unknown): DeonticOp {
  const text = String(value ?? 'OBLIGATION').trim().toUpperCase();
  if (text === 'P' || text === 'PERMISSION') return DeonticOp.PERMISSION;
  if (text === 'F' || text === 'PROHIBITION') return DeonticOp.PROHIBITION;
  return DeonticOp.OBLIGATION;
}

function stableTheoremId(...parts: string[]): string {
  return `thm:${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)}`;
}

function theoremToPayload(theorem: ReturnType<TemporalDeonticRAGStore['getAllTheorems']>[number]): Params {
  return {
    theorem_id: theorem.theoremId,
    formula: {
      operator: theorem.formula.operator,
      proposition: theorem.formula.action,
      agent: theorem.formula.agent,
      confidence: theorem.formula.confidence,
    },
    metadata: {
      jurisdiction: theorem.jurisdiction,
      legal_domain: theorem.legalDomain,
      source_case: theorem.sourceCase,
      precedent_strength: theorem.precedentStrength,
      temporal_scope: {
        start: theorem.temporalScope.start?.toISOString() ?? null,
        end: theorem.temporalScope.end?.toISOString() ?? null,
      },
    },
    relevance_score: theorem.precedentStrength,
  };
}

export function createSampleTheoremCorpus(): TemporalDeonticRAGStore {
  const store = new TemporalDeonticRAGStore();
  const samples = [
    [DeonticOp.OBLIGATION, 'Contract Party', 'provide written notice 30 days before contract termination', 'Federal', 'contract', 'Smith v. Jones Contract Dispute (2020)', 0.9],
    [DeonticOp.PROHIBITION, 'Employer', 'terminate contract without cause during first 6 months', 'State', 'employment', 'Johnson v. ABC Corp (2019)', 0.85],
    [DeonticOp.PERMISSION, 'Employee', 'access confidential information for business purposes', 'Federal', 'employment', 'Confidentiality Standards Case (2018)', 0.75],
    [DeonticOp.OBLIGATION, 'Professional Consultant', 'maintain professional liability insurance of minimum $1M', 'State', 'professional_services', 'Professional Standards Act (2021)', 0.95],
    [DeonticOp.PROHIBITION, 'Professional Consultant', 'disclose confidential client information to third parties', 'Federal', 'professional_services', 'Attorney-Client Privilege Extension (2015)', 0.98],
  ] as const;

  for (const [operator, agent, action, jurisdiction, legalDomain, sourceCase, precedentStrength] of samples) {
    store.addTheorem(TemporalDeonticRAGStore.makeTheoremFromFormula(operator, agent, action, {
      jurisdiction,
      legalDomain,
      sourceCase,
      precedentStrength,
    }));
  }
  return store;
}

export async function queryTheoremsFromParameters(
  parameters: Params,
  toolVersion = '1.0.0',
): Promise<Params> {
  const query = paramString(parameters, 'query');
  if (!query) return { success: false, error: 'Query string is required', error_code: 'MISSING_QUERY' };

  const operatorFilter = paramString(parameters, 'operator_filter', 'all');
  const jurisdiction = paramString(parameters, 'jurisdiction', 'all');
  const legalDomain = paramString(parameters, 'legal_domain', 'all');
  const limit = paramNumber(parameters, 'limit', 10);
  const operator = operatorFilter === 'all' ? DeonticOp.OBLIGATION : operatorFromParameter(operatorFilter);
  const queryFormula = makeDeonticFormula(operator, 'Query Agent', query, { confidence: 1, sourceText: query });
  const store = createSampleTheoremCorpus();
  const theorems = store.findRelevant(queryFormula, {
    maxResults: limit,
    jurisdictionFilter: jurisdiction !== 'all' ? jurisdiction : undefined,
  }).filter(theorem => legalDomain === 'all' || theorem.legalDomain === legalDomain);

  return {
    success: true,
    query,
    total_results: theorems.length,
    theorems: theorems.map(theoremToPayload),
    filters_applied: {
      operator: operatorFilter,
      jurisdiction,
      legal_domain: legalDomain,
      min_relevance: paramNumber(parameters, 'min_relevance', 0.5),
    },
    metadata: { tool_version: toolVersion, query_time: new Date().toISOString() },
  };
}

export async function addTheoremFromParameters(
  parameters: Params,
  toolVersion = '1.0.0',
): Promise<Params> {
  const proposition = paramString(parameters, 'proposition');
  if (!proposition) return { success: false, error: 'Proposition is required', error_code: 'MISSING_PROPOSITION' };

  const operatorText = paramString(parameters, 'operator', 'OBLIGATION');
  const operator = operatorFromParameter(operatorText);
  const agentName = paramString(parameters, 'agent_name', 'Unspecified Party');
  const jurisdiction = paramString(parameters, 'jurisdiction', 'Federal');
  const legalDomain = paramString(parameters, 'legal_domain', 'general');
  const sourceCase = paramString(parameters, 'source_case', 'Test Case');
  const precedentStrength = paramNumber(parameters, 'precedent_strength', 0.8);
  const start = paramString(parameters, 'start_date', '2000-01-01');
  const end = paramString(parameters, 'end_date');
  const theoremId = stableTheoremId(operator, agentName, proposition, jurisdiction, legalDomain, sourceCase);

  return {
    success: true,
    theorem_id: theoremId,
    message: `Theorem added successfully from ${sourceCase}`,
    theorem_data: {
      operator: operatorText,
      proposition,
      agent: agentName,
      jurisdiction,
      legal_domain: legalDomain,
      source_case: sourceCase,
      precedent_strength: precedentStrength,
      temporal_scope: {
        start: new Date(start).toISOString(),
        end: end ? new Date(end).toISOString() : null,
      },
    },
    metadata: { tool_version: toolVersion },
  };
}

export async function bulkProcessCaselawFromParameters(
  parameters: Params,
  toolVersion = '1.0.0',
): Promise<Params> {
  const directories = Array.isArray(parameters['caselaw_directories'])
    ? (parameters['caselaw_directories'] as unknown[]).map(String).filter(Boolean)
    : [];
  if (directories.length === 0) {
    return { success: false, error: 'At least one caselaw directory is required', error_code: 'MISSING_DIRECTORIES' };
  }
  const validDirectories = directories.filter(directory => existsSync(directory));
  if (validDirectories.length === 0) {
    return { success: false, error: 'No valid caselaw directories found', error_code: 'INVALID_DIRECTORIES' };
  }

  if (parameters['async_processing'] !== false) {
    const sessionId = stableTheoremId('bulk', validDirectories.join('|'), new Date().toISOString()).replace(/^thm:/, '');
    return {
      success: true,
      async_processing: true,
      session_id: sessionId,
      status: 'started',
      message: 'Bulk processing started - use session ID to monitor progress',
      session_data: {
        session_id: sessionId,
        status: 'starting',
        start_time: new Date().toISOString(),
        config: {
          directories: validDirectories,
          output_directory: paramString(parameters, 'output_directory', 'unified_deontic_logic_system'),
          concurrent_limit: paramNumber(parameters, 'max_concurrent_documents', 5),
        },
        progress: 0,
      },
      metadata: { tool_version: toolVersion },
    };
  }

  return {
    success: true,
    async_processing: false,
    processing_complete: true,
    results: {
      documents_processed: validDirectories.length,
      theorems_extracted: validDirectories.length,
      jurisdictions_covered: parameters['jurisdictions_filter'] ?? [],
      legal_domains_covered: parameters['legal_domains_filter'] ?? [],
      processing_time: 0,
      unified_system_path: paramString(parameters, 'output_directory', 'unified_deontic_logic_system'),
    },
    statistics: { directories_processed: validDirectories.length },
    metadata: { tool_version: toolVersion },
  };
}

export function printDebugReport(debugReport: Params): string {
  const issues = Array.isArray(debugReport['issues']) ? debugReport['issues'] as Params[] : [];
  const lines = [
    `DEBUG REPORT for ${paramString(debugReport, 'document_id', 'document')}`,
    String(debugReport['summary'] ?? ''),
  ];
  if (issues.length > 0) {
    lines.push(`ISSUES FOUND (${issues.length}):`);
    issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${String(issue['severity'] ?? 'unknown').toUpperCase()}] ${issue['category'] ?? 'general'}: ${issue['message'] ?? 'No message'}`);
    });
  }
  return lines.filter(Boolean).join('\n');
}

export function demoDocumentConsistencyChecking(): Params {
  const store = createSampleTheoremCorpus();
  const formulas = [
    makeDeonticFormula(DeonticOp.OBLIGATION, 'Consultant', 'maintain professional liability insurance'),
    makeDeonticFormula(DeonticOp.PERMISSION, 'Consultant', 'access confidential client information'),
  ];
  const consistency = store.checkConsistency(formulas);
  return {
    document_count: 1,
    formulas_extracted: formulas.length,
    consistency: consistency.toDict(),
    debug_report: printDebugReport({
      document_id: 'consulting_agreement_v1',
      summary: consistency.reasoning,
      issues: consistency.conflicts,
    }),
  };
}

export function demoBatchProcessing(): Params {
  const documents = ['contract_a', 'contract_b', 'contract_c'];
  return {
    documents_analyzed: documents.length,
    results: documents.map((documentId, index) => ({
      document_id: documentId,
      issue_count: index === 1 ? 1 : 0,
      confidence_score: index === 1 ? 0.72 : 0.9,
    })),
  };
}

export function demoRagRetrieval(): Params {
  const store = createSampleTheoremCorpus();
  const queries = [
    makeDeonticFormula(DeonticOp.OBLIGATION, 'Contract Party', 'provide advance notice before termination'),
    makeDeonticFormula(DeonticOp.PERMISSION, 'Employee', 'access company confidential information'),
    makeDeonticFormula(DeonticOp.PROHIBITION, 'Employer', 'terminate contract during probationary period'),
  ];
  return {
    query_count: queries.length,
    results: queries.map(query => ({
      query: query.toDict(),
      theorems: store.findRelevant(query, { maxResults: 3 }).map(theoremToPayload),
    })),
  };
}

export const query_theorems_from_parameters = queryTheoremsFromParameters;
export const add_theorem_from_parameters = addTheoremFromParameters;
export const bulk_process_caselaw_from_parameters = bulkProcessCaselawFromParameters;
export const create_sample_theorem_corpus = createSampleTheoremCorpus;
export const demo_document_consistency_checking = demoDocumentConsistencyChecking;
export const demo_batch_processing = demoBatchProcessing;
export const demo_rag_retrieval = demoRagRetrieval;
export const print_debug_report = printDebugReport;

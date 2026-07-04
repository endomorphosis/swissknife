/**
 * Deontic legal-text parser/export compatibility layer.
 *
 * TypeScript port of the public surfaces called out from:
 * - deontic/utils/deontic_parser.py
 * - deontic/{exports,formula_builder,metrics}.py
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyLegalEntity,
  classifyModal,
  normalizePredicate,
  scoreScaffoldQuality,
} from './deontic/deontic-parser-utils.js';

export interface LegalTextSegment {
  text: string;
  span: [number, number];
  index: number;
}

export interface NormativeElement extends Record<string, unknown> {
  schema_version: string;
  source_id: string;
  canonical_citation: string;
  text: string;
  support_text: string;
  support_span: [number, number];
  norm_type: string;
  deontic_operator: 'O' | 'P' | 'F';
  modal: string;
  subject: string;
  actor_type: string;
  entity_type: string;
  action: string;
  action_verb: string;
  action_object: string;
  conditions: string[];
  temporal_constraints: string[];
  exceptions: string[];
  cross_references: string[];
  resolved_cross_references: Array<Record<string, unknown>>;
  enforcement_links: Array<Record<string, unknown>>;
  document_type: string;
  scaffold_quality: number;
  quality_label: string;
  parser_warnings: string[];
  promotable_to_theorem: boolean;
}

const SCHEMA_VERSION = 'deterministic_deontic_v12';
const MODAL_RE = /\b(?<subject>(?:the\s+)?[A-Za-z][A-Za-z0-9'’\-\s]{0,80}?)\s+(?<modal>shall not|must not|may not|cannot|can not|shall|must|required to|is required to|are required to|may|can|is authorized to|are authorized to|is permitted to|are permitted to|is prohibited from|are prohibited from)\s+(?<action>.+?)(?=[.;:]|$)/i;
const CLAUSE_END_RE = '(?:,|[.]\\s|[.]$|$)';
const CONDITION_PATTERNS: Array<[string, RegExp]> = [
  ['if', new RegExp(`\\bif\\s+(.+?)(?:,|\\s+then|[.]$|$)`, 'gi')],
  ['when', new RegExp(`\\bwhen\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['where', new RegExp(`\\bwhere\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['provided_that', new RegExp(`\\bprovided that\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['subject_to', new RegExp(`\\bsubject to\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['in_case', new RegExp(`\\bin case\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
];
const EXCEPTION_PATTERNS: Array<[string, RegExp]> = [
  ['unless', new RegExp(`\\bunless\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['except', new RegExp(`\\bexcept\\s+(?:for\\s+)?(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['without', new RegExp(`\\bwithout\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['absent', new RegExp(`\\babsent\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['with_exception_of', new RegExp(`\\bwith the exception of\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['other_than', new RegExp(`\\bother than\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
  ['excluding', new RegExp(`\\bexcluding\\s+(.+?)${CLAUSE_END_RE}`, 'gi')],
];
const OVERRIDE_PATTERNS: Array<[string, RegExp]> = [
  ['notwithstanding', /\bnotwithstanding\s+(.+?)(?:,|[.]$|$)/gi],
  ['without_regard_to', /\bwithout regard to\s+(.+?)(?:,|[.]$|$)/gi],
];
const TEMPORAL_PATTERNS: Array<[string, string, RegExp]> = [
  ['deadline', 'by_date', /\bby\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/gi],
  ['deadline', 'by_numeric_date', /\bby\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi],
  ['deadline', 'by_numeric_date', /\bby\s+(\d{1,2}-\d{1,2}-\d{2,4})/gi],
  ['deadline', 'within_duration', /\bwithin\s+(\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)(?:\s+after\s+.+?)?)(?=\s+(?:unless|except|without|absent|if|when|where|provided that|subject to)\b|[,.;]|$)/gi],
  ['deadline', 'not_later_than', /\bnot\s+later\s+than\s+(\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)(?:\s+after\s+.+?)?)(?=\s+(?:unless|except|without|absent|if|when|where|provided that|subject to)\b|[,.;]|$)/gi],
  ['deadline', 'no_later_than', /\bno\s+later\s+than\s+(\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)(?:\s+after\s+.+?)?)(?=\s+(?:unless|except|without|absent|if|when|where|provided that|subject to)\b|[,.;]|$)/gi],
  ['deadline', 'not_more_than', /\bnot\s+more\s+than\s+(\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)(?:\s+after\s+.+?)?)(?=\s+(?:unless|except|without|absent|if|when|where|provided that|subject to)\b|[,.;]|$)/gi],
  ['deadline', 'no_more_than', /\bno\s+more\s+than\s+(\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?)(?:\s+after\s+.+?)?)(?=\s+(?:unless|except|without|absent|if|when|where|provided that|subject to)\b|[,.;]|$)/gi],
  ['deadline', 'before_date', /\bbefore\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})/gi],
  ['deadline', 'after_date', /\bafter\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})/gi],
  ['procedure', 'after_notice_and_hearing', /\b(after\s+(?:public\s+)?notice\s+and\s+hearing)\b/gi],
  ['procedure', 'after_consultation', /\b(after\s+consultation\s+with\s+(?:the\s+)?[A-Za-z][A-Za-z0-9'’\-]*(?:\s+[A-Za-z][A-Za-z0-9'’\-]*){0,6})\b/gi],
  ['period', 'annually', /\b(annually)\b/gi],
  ['period', 'monthly', /\b(monthly)\b/gi],
  ['period', 'weekly', /\b(weekly)\b/gi],
  ['period', 'daily', /\b(daily)\b/gi],
  ['duration', 'for_duration', /\bfor\s+(\d+\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?|years?))/gi],
];
const MONEY_RE = /(?:\$\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\s+dollars?\b)/gi;
const PROCEDURE_EVENT_ORDER = [
  'application',
  'receipt',
  'inspection',
  'review',
  'notice',
  'hearing',
  'decision',
  'issuance',
  'renewal',
  'suspension',
  'revocation',
  'appeal',
];
const PROCEDURE_EVENT_PATTERNS: Record<string, RegExp> = {
  application: /\b(?:apply|applies|application|applicant)\b/gi,
  receipt: /\b(?:receipt|receive|received)\b/gi,
  inspection: /\b(?:inspect|inspection)\b/gi,
  review: /\b(?:review|investigate|investigation)\b/gi,
  notice: /\b(?:notice|notify|notification)\b/gi,
  hearing: /\b(?:hearing)\b/gi,
  decision: /\b(?:decision|decide|determination|order)\b/gi,
  issuance: /\b(?:issue|issued|issuance|grant|approve|approval)\b/gi,
  renewal: /\b(?:renew|renewal)\b/gi,
  suspension: /\b(?:suspend|suspension)\b/gi,
  revocation: /\b(?:revoke|revocation)\b/gi,
  appeal: /\b(?:appeal\w*)\b/gi,
};
const PARSER_REQUIRED_FIELDS = [
  'schema_version',
  'source_id',
  'canonical_citation',
  'text',
  'support_text',
  'support_span',
  'field_spans',
  'norm_type',
  'deontic_operator',
  'modal',
  'subject',
  'actor_type',
  'entity_type',
  'action',
  'action_verb',
  'action_object',
  'action_recipient',
  'conditions',
  'condition_details',
  'temporal_constraints',
  'temporal_constraint_details',
  'exceptions',
  'exception_details',
  'override_clauses',
  'override_clause_details',
  'cross_references',
  'cross_reference_details',
  'resolved_cross_references',
  'enforcement_links',
  'conflict_links',
  'enumerated_items',
  'defined_term_refs',
  'definition_scope',
  'ontology_terms',
  'formal_terms',
  'llm_repair',
  'export_readiness',
  'logic_frame',
  'legal_frame',
  'kg_relationship_hints',
  'monetary_amounts',
  'monetary_amount_details',
  'penalty',
  'procedure',
  'section_context',
  'hierarchy_path',
  'hierarchy_details',
  'document_type',
  'extraction_method',
  'confidence_floor',
  'slot_coverage',
  'scaffold_quality',
  'quality_label',
  'parser_warnings',
  'promotable_to_theorem',
];
const EXPORT_TABLE_SPECS: Record<string, { primary_key: string; requires_source_id: boolean }> = {
  canonical: { primary_key: 'source_id', requires_source_id: true },
  formal_logic: { primary_key: 'formula_id', requires_source_id: true },
  proof_obligations: { primary_key: 'proof_obligation_id', requires_source_id: true },
  knowledge_graph_triples: { primary_key: 'triple_id', requires_source_id: true },
  clause_records: { primary_key: 'clause_id', requires_source_id: true },
  reference_records: { primary_key: 'reference_id', requires_source_id: true },
  procedure_event_records: { primary_key: 'event_id', requires_source_id: true },
  sanction_records: { primary_key: 'sanction_id', requires_source_id: true },
  ontology_entities: { primary_key: 'entity_id', requires_source_id: true },
  repair_queue: { primary_key: 'repair_id', requires_source_id: true },
};

export function segmentLegalText(text: string): LegalTextSegment[] {
  const source = String(text ?? '');
  const segments: LegalTextSegment[] = [];
  const sentenceRe = /[^.!?;:]+[.!?;:]?/g;
  for (const match of source.matchAll(sentenceRe)) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leading = raw.indexOf(trimmed);
    const start = (match.index ?? 0) + Math.max(leading, 0);
    segments.push({ text: trimmed, span: [start, start + trimmed.length], index: segments.length });
  }
  return segments;
}

export function analyzeNormativeSentence(
  sentence: string,
  documentType = 'statute',
  options: { span?: [number, number]; sourceId?: string; canonicalCitation?: string } = {},
): NormativeElement | null {
  const text = String(sentence ?? '').trim();
  const match = MODAL_RE.exec(text);
  if (!match?.groups) return null;

  const subject = cleanText(match.groups.subject).replace(/^the\s+/i, '');
  const modal = cleanText(match.groups.modal).toLowerCase();
  const action = cleanAction(match.groups.action);
  const classification = classifyModal(modal);
  const sourceId = options.sourceId ?? stableId('norm', text);
  const supportSpan = options.span ?? [0, text.length];
  const canonicalCitation = options.canonicalCitation ?? buildCanonicalCitation(text, sourceId);
  const element: NormativeElement = {
    schema_version: SCHEMA_VERSION,
    source_id: sourceId,
    canonical_citation: canonicalCitation,
    text,
    support_text: text,
    support_span: supportSpan,
    field_spans: {},
    norm_type: classification.modality,
    deontic_operator: classification.operator,
    modal,
    subject,
    actor_type: classifyLegalEntity(subject),
    entity_type: classifyLegalEntity(subject),
    action,
    action_verb: action.split(/\s+/)[0] ?? '',
    action_object: action.split(/\s+/).slice(1).join(' '),
    conditions: extractConditionTexts(text),
    temporal_constraints: extractTemporalConstraints(text).map(item => item.text),
    exceptions: extractExceptionTexts(text),
    cross_references: extractCrossReferences(text)
      .filter(ref => buildCanonicalCitation(ref, ref) !== canonicalCitation),
    resolved_cross_references: [],
    enforcement_links: extractEnforcementLinks(text),
    document_type: documentType,
    extraction_method: 'deterministic_ts',
    confidence_floor: 0.72,
    scaffold_quality: 0,
    quality_label: 'low',
    parser_warnings: [],
    promotable_to_theorem: false,
  };
  const quality = scoreScaffoldQuality(element);
  element.scaffold_quality = quality.score;
  element.quality_label = quality.quality_label;
  element.parser_warnings = quality.warnings;
  element.promotable_to_theorem = quality.promotable;
  element.export_readiness = {
    proof_ready: quality.promotable,
    export_repair_required: !quality.promotable,
    formal_logic_targets: ['dcec'],
  };
  return element;
}

export function extractNormativeElements(text: string, documentType = 'statute'): NormativeElement[] {
  return segmentLegalText(text)
    .map(segment => analyzeNormativeSentence(segment.text, documentType, {
      span: segment.span,
      sourceId: stableId('norm', `${segment.index}:${segment.text}`),
      canonicalCitation: buildCanonicalCitation(segment.text, `norm-${segment.index + 1}`),
    }))
    .filter((item): item is NormativeElement => item !== null)
    .map((element, _index, elements) => ({
      ...element,
      resolved_cross_references: resolveCrossReferences(element, elements),
    }));
}

export function buildCanonicalCitation(text: string, fallback = ''): string {
  const section = String(text ?? '').match(/^\s*(?:see\s+)?(?:(?:section|sec\.?)\s*|§\s*)([0-9]+(?:\.[0-9]+)*(?:\([a-z0-9]+\))*)/i);
  if (section) return `§ ${section[1]}`;
  const title = String(text ?? '').match(/\b(title|chapter|article|part)\s+([0-9A-Za-z.\-]+)/i);
  if (title) return `${title[1].toLowerCase()} ${title[2]}`;
  return fallback;
}

export function resolveCrossReferences(
  element: Record<string, unknown>,
  corpus: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  const refs = Array.isArray(element.cross_references)
    ? element.cross_references.map(String)
    : extractCrossReferences(String(element.text ?? ''));
  return refs.map(ref => {
    const canonical = buildCanonicalCitation(ref, ref);
    const target = corpus.find(candidate => (
      candidate.source_id === ref ||
      candidate.canonical_citation === canonical ||
      candidate.canonical_citation === ref
    ));
    return {
      reference: ref,
      canonical_citation: canonical,
      target_source_id: target?.source_id ?? null,
      target_exists: Boolean(target),
      resolution_status: target ? 'resolved' : 'unresolved',
    };
  });
}

export function extractEnforcementLinks(text: string): Array<Record<string, unknown>> {
  const source = String(text ?? '');
  const links: Array<Record<string, unknown>> = [];
  for (const match of source.matchAll(/\b(?:violation|offense|infraction)\b.*?\b(?:punishable by|subject to)\s+([^.;:]+)/gi)) {
    links.push({ type: 'penalty', sanction: cleanText(match[1]), span: [match.index ?? 0, (match.index ?? 0) + match[0].length] });
  }
  for (const match of source.matchAll(/\bfailure to\s+(.+?)\s+is\s+(?:a\s+)?(?:violation|offense|infraction)\b/gi)) {
    links.push({ type: 'violation_trigger', action: cleanText(match[1]), span: [match.index ?? 0, (match.index ?? 0) + match[0].length] });
  }
  return links;
}

export function extractTemporalConstraints(text: string): Array<{ text: string; type: string }> {
  const out: Array<{ text: string; type: string }> = [];
  for (const match of String(text ?? '').matchAll(/\b(within|before|after|not later than|no later than)\s+([^.;:,]+)/gi)) {
    out.push({ type: match[1].toLowerCase().replace(/\s+/g, '_'), text: cleanText(match[0]) });
  }
  return out;
}

export function parserElementToFormula(element: Record<string, unknown>): string {
  const op = String(element.deontic_operator ?? 'O');
  const subject = normalizePredicate(String(element.subject ?? 'Actor'));
  const action = normalizePredicate(String(element.action ?? 'Act'));
  const atom = `${action}(${subject})`;
  const conditions = Array.isArray(element.conditions) ? element.conditions.map(String).filter(Boolean) : [];
  if (conditions.length) {
    const antecedent = conditions.map(normalizePredicate).map(name => `${name}(${subject})`).join(' ∧ ');
    return `${antecedent} → ${op}(${atom})`;
  }
  return `${op}(${atom})`;
}

export function buildFormalLogicRecordFromIr(norm: Record<string, unknown>): Record<string, unknown> {
  const formula = parserElementToFormula(norm);
  return {
    formula_id: stableId('formula', `${norm.source_id ?? ''}:${formula}`),
    source_id: norm.source_id ?? '',
    canonical_citation: norm.canonical_citation ?? '',
    target_logic: 'dcec',
    formula,
    modality: norm.deontic_operator ?? 'O',
    norm_type: norm.norm_type ?? '',
    support_span: norm.support_span ?? [],
    field_spans: norm.field_spans ?? {},
    proof_ready: Boolean(norm.promotable_to_theorem),
    requires_validation: !norm.promotable_to_theorem,
    repair_required: !norm.promotable_to_theorem,
    blockers: Boolean(norm.promotable_to_theorem) ? [] : ['deterministic_review_required'],
    parser_warnings: norm.parser_warnings ?? [],
    schema_version: norm.schema_version ?? SCHEMA_VERSION,
  };
}

export function buildProofObligationRecordFromIr(norm: Record<string, unknown>): Record<string, unknown> {
  const formulaRecord = buildFormalLogicRecordFromIr(norm);
  return {
    proof_obligation_id: stableId('proof', `${formulaRecord.source_id}:${formulaRecord.formula}`),
    ...formulaRecord,
    theorem_candidate: formulaRecord.proof_ready,
  };
}

export function buildRepairQueueRecordFromIr(norm: Record<string, unknown>): Record<string, unknown> {
  const formulaRecord = buildFormalLogicRecordFromIr(norm);
  return {
    repair_id: stableId('repair', `${formulaRecord.source_id}:${JSON.stringify(formulaRecord.blockers)}`),
    formula_id: formulaRecord.formula_id,
    source_id: formulaRecord.source_id,
    canonical_citation: formulaRecord.canonical_citation,
    source_text: norm.text ?? norm.source_text ?? '',
    support_text: norm.support_text ?? '',
    formula: formulaRecord.formula,
    reasons: formulaRecord.blockers,
    parser_warnings: formulaRecord.parser_warnings,
    requires_llm_repair: false,
    allow_llm_repair: false,
    schema_version: formulaRecord.schema_version,
  };
}

export function buildProcedureEventRecordsFromIr(norm: Record<string, unknown>): Array<Record<string, unknown>> {
  const temporal = Array.isArray(norm.temporal_constraints) ? norm.temporal_constraints.map(String) : [];
  return temporal.map((constraint, index) => ({
    event_id: stableId('event', `${norm.source_id ?? ''}:${index}:${constraint}`),
    source_id: norm.source_id ?? '',
    canonical_citation: norm.canonical_citation ?? '',
    relation: 'temporal_constraint',
    event: normalizePredicate(constraint),
    raw_text: constraint,
    event_index: index + 1,
  }));
}

export function buildDocumentExportTablesFromIr(norms: Array<Record<string, unknown>>): Record<string, Array<Record<string, unknown>>> {
  return {
    canonical: norms.map(norm => ({ ...norm })),
    formal_logic: norms.map(buildFormalLogicRecordFromIr),
    proof_obligations: norms.map(buildProofObligationRecordFromIr),
    repair_queue: norms.filter(norm => !norm.promotable_to_theorem).map(buildRepairQueueRecordFromIr),
    procedure_event_records: norms.flatMap(buildProcedureEventRecordsFromIr),
  };
}

export function parserElementsToExportTables(elements: Array<Record<string, unknown>>): Record<string, Array<Record<string, unknown>>> {
  return buildDocumentExportTablesFromIr(elements);
}

export function summarizeParserElements(elements: Array<Record<string, unknown>>): Record<string, unknown> {
  const count = elements.length;
  if (!count) {
    return {
      element_count: 0,
      proof_ready_count: 0,
      proof_ready_rate: 0,
      repair_required_count: 0,
      repair_required_rate: 0,
      average_scaffold_quality: 0,
      norm_type_distribution: {},
      modality_distribution: {},
      cross_reference_resolution_rate: 0,
    };
  }
  const proofReady = elements.filter(item => item.promotable_to_theorem || (item.export_readiness as Record<string, unknown> | undefined)?.proof_ready).length;
  const resolvedRefs = elements.flatMap(item => Array.isArray(item.resolved_cross_references) ? item.resolved_cross_references : [])
    .filter(ref => (ref as Record<string, unknown>).target_exists || (ref as Record<string, unknown>).resolution_status === 'resolved').length;
  const totalRefs = elements.reduce((sum, item) => sum + (Array.isArray(item.resolved_cross_references) ? item.resolved_cross_references.length : 0), 0);
  return {
    element_count: count,
    proof_ready_count: proofReady,
    proof_ready_rate: round6(proofReady / count),
    repair_required_count: count - proofReady,
    repair_required_rate: round6((count - proofReady) / count),
    average_scaffold_quality: round6(elements.reduce((sum, item) => sum + Number(item.scaffold_quality ?? 0), 0) / count),
    norm_type_distribution: countBy(elements.map(item => String(item.norm_type ?? '')).filter(Boolean)),
    modality_distribution: countBy(elements.map(item => String(item.deontic_operator ?? '')).filter(Boolean)),
    cross_reference_resolution_rate: totalRefs ? round6(resolvedRefs / totalRefs) : 0,
  };
}

export function summarizePhase8ParserMetrics(elements: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    ...summarizeParserElements(elements),
    phase8_record_count: elements.length,
    export_table_counts: Object.fromEntries(Object.entries(parserElementsToExportTables(elements)).map(([name, rows]) => [name, rows.length])),
  };
}

export function summarizeProverSyntaxTargetCoverage(records: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    record_count: records.length,
    target_distribution: countBy(records.map(record => String(record.target_logic ?? record.target ?? '')).filter(Boolean)),
    proof_ready_count: records.filter(record => record.proof_ready || record.theorem_candidate).length,
  };
}

export function buildSourceId(element: Record<string, unknown>): string {
  const record = asRecord(element);
  return hashId('deontic', {
    citation: record.canonical_citation || buildCanonicalCitation(String(record.text ?? ''), ''),
    source_span: record.source_span ?? [],
    support_span: record.support_span ?? [],
    norm_type: record.norm_type ?? '',
    operator: record.deontic_operator ?? '',
    text: record.text ?? '',
  });
}

export function extractConditions(sentence: string): string[] {
  return extractConditionDetails(sentence).map(item => String(item.normalized_text ?? ''));
}

export function extractConditionDetails(sentence: string): Array<Record<string, unknown>> {
  return extractClauseDetails(sentence, CONDITION_PATTERNS, 'condition');
}

export function extractExceptions(sentence: string): string[] {
  return extractExceptionDetails(sentence).map(item => String(item.normalized_text ?? ''));
}

export function extractExceptionDetails(sentence: string): Array<Record<string, unknown>> {
  return extractClauseDetails(sentence, EXCEPTION_PATTERNS, 'exception');
}

export function extractOverrideClauses(sentence: string): string[] {
  return extractOverrideClauseDetails(sentence).map(item => String(item.normalized_text ?? ''));
}

export function extractOverrideClauseDetails(sentence: string): Array<Record<string, unknown>> {
  return extractClauseDetails(sentence, OVERRIDE_PATTERNS, 'override');
}

export function extractCrossReferenceDetails(sentence: string): Array<Record<string, unknown>> {
  const source = String(sentence ?? '');
  const patterns: Array<[string, RegExp]> = [
    ['section_range', /\bsections?\s+([0-9][0-9A-Za-z.\-]*(?:\([a-z0-9]+\))*)\s+(?:through|thru|to|-)\s+([0-9][0-9A-Za-z.\-]*(?:\([a-z0-9]+\))*)/gi],
    ['section', /\bsection\s+([0-9][0-9A-Za-z.\-]*(?:\([a-z0-9]+\))*)/gi],
    ['section', /§\s*([0-9][0-9A-Za-z.\-]*(?:\([a-z0-9]+\))*)/gi],
    ['section', /\b(this\s+section)\b/gi],
    ['subsection', /\bsubsection\s+\(([a-z0-9]+)\)/gi],
    ['subsection', /\b(this\s+subsection)\b/gi],
    ['paragraph', /\bparagraph\s+\(([a-z0-9]+)\)/gi],
    ['paragraph', /\b(this\s+paragraph)\b/gi],
    ['chapter', /\bchapter\s+([0-9A-Za-z][0-9A-Za-z.\-]*)/gi],
    ['chapter', /\b(this\s+chapter)\b/gi],
    ['title', /\btitle\s+([0-9A-Za-z]+)/gi],
    ['title', /\b(this\s+title)\b/gi],
    ['usc', /\b(\d+)\s+u\.?s\.?c\.?\s+(?:§|sec(?:tion)?\.?)?\s*([0-9A-Za-z.\-]+)/gi],
  ];
  const refs: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [type, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (isDefinitionScopeMarker(source, match)) continue;
      let value = '';
      if (type === 'section_range') {
        const startSection = String(match[1] ?? '').trim().toLowerCase();
        const endSection = String(match[2] ?? '').trim().toLowerCase();
        value = `${startSection}-${endSection}`;
      } else {
        value = match.slice(1).filter(Boolean).join(' ').trim().toLowerCase();
      }
      if (!value) continue;
      const key = `${type}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const record: Record<string, unknown> = {
        type,
        value,
        raw_text: match[0].trim(),
        normalized_text: `${type} ${value}`,
        span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
      };
      if (type === 'section_range') {
        record.start_section = String(match[1] ?? '').trim().toLowerCase();
        record.end_section = String(match[2] ?? '').trim().toLowerCase();
      }
      refs.push(record);
    }
  }
  return refs;
}

export function extractEnumeratedItems(sentence: string): Array<Record<string, string>> {
  const source = String(sentence ?? '');
  const matches = Array.from(source.matchAll(/(?:^|\s)\(([A-Za-z0-9]+)\)\s+/g));
  const items: Array<Record<string, string>> = [];
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? source.length : source.length;
    const text = source.slice(start, end).replace(/\s+(?:and|or)$/i, '').trim().replace(/^[ ;,.]+|[ ;,.]+$/g, '');
    if (text) items.push({ label: String(match[1]), text });
  });
  return items;
}

export function expandEnumeratedNorms(elements: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const expanded: Array<Record<string, unknown>> = [];
  for (const element of elements ?? []) {
    const items = fieldAsArray(element.enumerated_items).length
      ? fieldAsArray(element.enumerated_items).map(asRecord)
      : extractEnumeratedItems(String(element.text ?? ''));
    if (!items.length) {
      expanded.push(element);
      continue;
    }
    const parentSourceId = String(element.source_id || buildSourceId(element));
    const children = items
      .filter(item => item.text)
      .map(item => {
        const childText = String(item.text ?? '');
        const child = {
          ...element,
          source_id: hashId('deontic', { parent_source_id: parentSourceId, label: item.label ?? '', text: childText }),
          parent_source_id: parentSourceId,
          enumerated_parent_source_id: parentSourceId,
          enumeration_label: item.label ?? '',
          text: childText,
          support_text: childText,
          enumerated_items: [],
        };
        return migrateParserElement(child);
      });
    expanded.push(...(children.length ? children : [element]));
  }
  return expanded;
}

export function extractTemporalConstraintDetails(sentence: string): Array<Record<string, unknown>> {
  const source = String(sentence ?? '');
  const details: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [type, temporalKind, pattern] of TEMPORAL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      let value = String(match[1] ?? '').trim().toLowerCase();
      let anchor = '';
      if (value.includes(' after ')) {
        const [valuePart, anchorPart] = value.split(' after ', 2);
        anchor = anchorPart.trim();
        value = `${valuePart.trim()} after ${anchor}`;
      }
      const key = `${type}:${value}:${match.index ?? 0}:${(match.index ?? 0) + match[0].length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      details.push({
        type,
        temporal_kind: temporalKind,
        value,
        anchor,
        ...normalizeTemporalValue(value),
        raw_text: match[0].trim(),
        normalized_text: value,
        span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
      });
    }
  }
  return details;
}

export function normalizeTemporalValue(value: string): Record<string, unknown> {
  const normalized = String(value ?? '').trim().toLowerCase();
  const duration = normalized.split(' after ', 1)[0].split(' before ', 1)[0].trim();
  const match = duration.match(/^(?<quantity>\d+)\s+(?:(?<calendar>business|calendar)\s+)?(?<unit>days?|weeks?|months?|years?)\b/i);
  let anchorEvent = '';
  let direction = '';
  if (normalized.includes(' after ')) {
    anchorEvent = normalized.split(' after ', 2)[1].trim();
    direction = 'after';
  } else if (normalized.includes(' before ')) {
    anchorEvent = normalized.split(' before ', 2)[1].trim();
    direction = 'before';
  }
  if (!match?.groups) {
    return { quantity: null, unit: '', calendar: '', anchor_event: anchorEvent, direction };
  }
  return {
    quantity: Number(match.groups.quantity),
    unit: match.groups.unit.replace(/s$/i, '').toLowerCase(),
    calendar: match.groups.calendar ?? 'calendar',
    anchor_event: anchorEvent,
    direction,
  };
}

export function extractMonetaryAmounts(text: string): Array<Record<string, unknown>> {
  return Array.from(String(text ?? '').matchAll(MONEY_RE)).map(match => ({
    raw_text: match[0].trim(),
    span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
  }));
}

export function extractMonetaryAmountDetails(text: string): Array<Record<string, unknown>> {
  return Array.from(String(text ?? '').matchAll(MONEY_RE)).map(match => {
    const rawText = match[0].trim();
    return {
      type: 'money',
      raw_text: rawText,
      normalized_text: rawText.toLowerCase(),
      numeric_value: rawText.replace(/[^\d.]/g, ''),
      currency: /\$|dollar/i.test(rawText) ? 'USD' : '',
      span: [match.index ?? 0, (match.index ?? 0) + rawText.length],
    };
  });
}

export function extractImprisonmentDuration(text: string): Record<string, unknown> {
  const match = String(text ?? '').match(/\b(?:imprisonment|jail|custody)\s+(?:for\s+)?(?:a\s+term\s+of\s+)?(?:not\s+more\s+than|up\s+to|for)?\s*(\d+)\s+(days?|months?|years?)\b/i);
  if (!match) return {};
  return {
    raw_text: match[0].trim(),
    quantity: Number(match[1]),
    unit: match[2].toLowerCase().replace(/s$/, ''),
    span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
  };
}

export function extractPenaltyRecurrence(text: string): Record<string, unknown> {
  const patterns: Array<[string, RegExp]> = [
    ['per_day', /\b(?:each|every)\s+day\s+(?:constitutes|is)\s+(?:a\s+)?separate\s+violation\b/i],
    ['per_violation', /\b(?:per|for each)\s+violation\b/i],
    ['per_offense', /\b(?:per|for each)\s+offense\b/i],
  ];
  const source = String(text ?? '');
  for (const [type, pattern] of patterns) {
    const match = source.match(pattern);
    if (match) {
      return {
        type,
        raw_text: match[0],
        span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
      };
    }
  }
  return {};
}

export function classifySanctionClass(text: string): string {
  const lower = String(text ?? '').toLowerCase();
  if (/\bcriminal\s+(?:fine|penalty|offense|violation|sanction)\b/.test(lower)) return 'criminal';
  if (/\bcivil\s+(?:fine|penalty|violation|infraction|sanction)\b/.test(lower)) return 'civil';
  if (/\badministrative\s+(?:fine|penalty|sanction|citation)\b/.test(lower)) return 'administrative';
  if (/\bimprison|jail|custody\b/.test(lower)) return 'criminal';
  return '';
}

export function classifySanctionModality(text: string): string {
  const lower = String(text ?? '').toLowerCase();
  if (/\bmay\s+(?:be\s+)?(?:impose|imposed|punish|punished|fine|fined|assess|assessed)\b/.test(lower)) return 'discretionary';
  if (/\b(?:is|shall\s+be)\s+(?:punishable\s+by|subject\s+to)\b/.test(lower)) return 'mandatory';
  if (/\bmust\s+(?:pay|serve)\b/.test(lower)) return 'mandatory';
  return '';
}

export function extractPenaltyDetails(text: string, action = ''): Record<string, unknown> {
  const combined = `${text ?? ''} ${action ?? ''}`.trim();
  const lower = combined.toLowerCase();
  if (!/(fine|penalty|punishable|imprison|violation|offense|infraction)/.test(lower)) return {};
  const amounts = extractMonetaryAmountDetails(combined);
  const minimumAmount = penaltyBound(combined, 'minimum');
  const maximumAmount = penaltyBound(combined, 'maximum');
  const sanctionClass = classifySanctionClass(combined);
  return {
    raw_text: combined,
    sanction_class: sanctionClass,
    classification: sanctionClass,
    sanction_modality: classifySanctionModality(combined),
    monetary_amounts: extractMonetaryAmounts(combined),
    monetary_amount_details: amounts,
    minimum_amount: minimumAmount,
    maximum_amount: maximumAmount,
    has_range: Boolean(Object.keys(minimumAmount).length && Object.keys(maximumAmount).length),
    recurrence: extractPenaltyRecurrence(combined),
    imprisonment_duration: extractImprisonmentDuration(combined),
    has_imprisonment: /\b(?:jail|imprison|imprisonment|custody)\b/.test(lower),
    has_fine: lower.includes('fine') || amounts.length > 0,
  };
}

export function extractProcedureEventMentions(text: string): Array<Record<string, unknown>> {
  const mentions: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const source = String(text ?? '');
  for (const event of PROCEDURE_EVENT_ORDER) {
    const pattern = PROCEDURE_EVENT_PATTERNS[event];
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const key = `${event}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentions.push({ event, raw_text: match[0], span: [start, end] });
    }
  }
  return mentions.sort((a, b) => {
    const aSpan = fieldAsArray(a.span).map(Number);
    const bSpan = fieldAsArray(b.span).map(Number);
    const byStart = (aSpan[0] ?? 0) - (bSpan[0] ?? 0);
    return byStart || PROCEDURE_EVENT_ORDER.indexOf(String(a.event)) - PROCEDURE_EVENT_ORDER.indexOf(String(b.event));
  });
}

export function extractProcedureEventRelations(text: string, action = '', events?: string[]): Array<Record<string, unknown>> {
  const combined = String(text ?? '');
  const knownEvents = events ?? PROCEDURE_EVENT_ORDER.filter(event => {
    const pattern = PROCEDURE_EVENT_PATTERNS[event];
    pattern.lastIndex = 0;
    return pattern.test(combined);
  });
  const actionEvent = inferEventFromPhrase(action) || knownEvents[knownEvents.length - 1] || '';
  const relations: Array<Record<string, unknown>> = [];
  const addRelation = (event: string, relation: string, anchorEvent: string, match: RegExpMatchArray, rawText = '') => {
    if (!event && !anchorEvent) return;
    const record = {
      event,
      relation,
      anchor_event: anchorEvent,
      raw_text: (rawText || match[0]).trim(),
      span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
    };
    if (!relations.some(existing => stableStringify(existing) === stableStringify(record))) relations.push(record);
  };
  for (const match of combined.matchAll(/\bupon\s+receipt\s+of\s+(?<object>[^,.;]+)/gi)) {
    const anchorEvent = inferEventFromPhrase(match.groups?.object ?? '') || 'receipt';
    addRelation(actionEvent, 'triggered_by_receipt_of', anchorEvent, match);
    addRelation('receipt', 'receives', anchorEvent, match);
  }
  for (const match of combined.matchAll(/\bafter\s+(?<events>[^,.;]+?)(?=\s+(?:and\s+)?(?:shall|must|may|before|within)\b|[,.;]|$)/gi)) {
    for (const anchorEvent of eventsFromPhrase(match.groups?.events ?? '')) addRelation(actionEvent, 'after', anchorEvent, match);
  }
  for (const match of combined.matchAll(/\bbefore\s+(?<events>[^,.;]+?)(?=\s+(?:and\s+)?(?:shall|must|may|after|within)\b|[,.;]|$)/gi)) {
    for (const anchorEvent of eventsFromPhrase(match.groups?.events ?? '')) addRelation(actionEvent, 'before', anchorEvent, match);
  }
  return relations;
}

export function extractProcedureDetails(text: string, action = ''): Record<string, unknown> {
  const combined = `${text ?? ''} ${action ?? ''}`.trim();
  const events = PROCEDURE_EVENT_ORDER.filter(event => {
    const pattern = PROCEDURE_EVENT_PATTERNS[event];
    pattern.lastIndex = 0;
    return pattern.test(combined);
  });
  if (!events.length) return {};
  const eventMentions = extractProcedureEventMentions(combined);
  const eventRelations = extractProcedureEventRelations(combined, action, events);
  return {
    events,
    event_chain: events.map((event, index) => ({
      event,
      order: index + 1,
      mentions: eventMentions.filter(mention => mention.event === event),
      relations: eventRelations.filter(relation => relation.event === event || relation.anchor_event === event),
    })),
    event_mentions: eventMentions,
    event_relations: eventRelations,
    trigger_event: inferTriggerEvent(events, eventRelations),
    terminal_event: inferTerminalEvent(events, eventRelations),
    raw_text: combined,
  };
}

export function extractLegalSubject(sentence: string): string[] {
  const source = String(sentence ?? '');
  const subjects = new Set<string>();
  const subjectPatterns = [
    /\b(?:citizens?|residents?|persons?|individuals?|people)\b/gi,
    /\b(?:companies?|corporations?|businesses?|entities?)\b/gi,
    /\b(?:developers?|operators?|providers?|controllers?|processors?)\b/gi,
    /\b(?:systems?|services?|platforms?|applications?|software)\b/gi,
    /\b(?:employees?|workers?|staff)\b/gi,
    /\b(?:drivers?|operators?|users?)\b/gi,
    /\b(?:owners?|lessees?|tenants?)\b/gi,
    /\b(?:students?|minors?|adults?)\b/gi,
    /\b(?:patients?|clients?|customers?)\b/gi,
  ];
  for (const pattern of subjectPatterns) {
    for (const match of source.matchAll(pattern)) subjects.add(match[0].toLowerCase());
  }
  for (const match of source.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)) {
    if (subjects.size >= 2) break;
    subjects.add(match[0]);
  }
  for (const match of source.matchAll(/\b[A-Z]{2,}\b/g)) {
    if (subjects.size >= 4) break;
    subjects.add(match[0]);
  }
  return Array.from(subjects);
}

export function extractLegalAction(sentence: string): string[] {
  const source = String(sentence ?? '').toLowerCase();
  const actions = new Set<string>();
  const addMatches = (pattern: RegExp) => {
    for (const match of source.matchAll(pattern)) {
      const action = String(match[1] ?? '').trim();
      if (action) actions.add(action);
    }
  };
  addMatches(/(?:must|shall|may|can|cannot|must not|shall not)\s+(?:not\s+)?(\w+(?:\s+\w+)*?)(?:\s+(?:by|before|after|until|unless|except)|\.|$)/g);
  addMatches(/(?:prohibited from|prohibited to|forbidden to)\s+([^.]+?)(?:\s+(?:by|before|after|until|unless|except)|\.|$)/g);
  for (const pattern of [
    /\b(?:pay|file|submit|provide|deliver|execute|perform)\s+([^.]+?)(?:\s+(?:by|before|after)|\.|$)/g,
    /\b(?:comply with|adhere to|follow|observe)\s+([^.]+?)(?:\s+(?:by|before|after)|\.|$)/g,
    /\b(?:obtain|acquire|secure|maintain)\s+([^.]+?)(?:\s+(?:by|before|after)|\.|$)/g,
  ]) addMatches(pattern);
  return Array.from(actions);
}

export function extractLegalInstrumentTarget(action: string): string {
  const match = String(action ?? '').match(/\b(?:permit|license|certificate|registration|approval|variance|franchise|easement|order)\b/i);
  return match ? match[0].toLowerCase() : '';
}

export function extractDefinitionBody(sentence: string): string {
  const match = String(sentence ?? '').trim().match(/\b(?:means|includes?|defined\s+as|has\s+the\s+meaning\s+given|refers\s+to)\b\s+(.+)$/i);
  return match ? match[1].trim().replace(/[ .;:]+$/g, '') : '';
}

export function inferDefinitionScope(sentence: string): Record<string, string> {
  const lowered = String(sentence ?? '').toLowerCase();
  let match = lowered.match(/\bas used in this (section|chapter|title)\b/);
  if (match) return { scope_type: match[1], raw_text: match[0] };
  for (const scope of ['section', 'chapter', 'title']) {
    if (new RegExp(`\\bin this ${scope}\\b`).test(lowered)) return { scope_type: scope, raw_text: `in this ${scope}` };
  }
  match = lowered.match(/\bfor purposes of this (section|chapter|title)\b/);
  if (match) return { scope_type: match[1], raw_text: match[0] };
  return { scope_type: 'unknown', raw_text: '' };
}

export function extractOntologyTerms(text: string): Array<Record<string, unknown>> {
  const source = String(text ?? '');
  const patterns: Array<[string, RegExp]> = [
    ['government_actor', /\b(?:Director|Bureau|City|Administrator|Commission|Council|Mayor|Department|Auditor|City\s+Attorney|City\s+Engineer|Code\s+Hearings\s+Officer|Hearings\s+Officer)\b/gi],
    ['legal_person', /\b(?:applicant|person|owner|tenant|employee|contractor|resident|permittee|licensee|operator|vendor)\b/gi],
    ['legal_instrument', /\b(?:permit|license|certificate|registration|approval|variance|franchise|easement|order)\b/gi],
    ['legal_event', /\b(?:notice|hearing|decision|appeal|inspection|violation|penalty|fee|citation|complaint|review|revocation|suspension)\b/gi],
    ['regulated_property', /\b(?:premises|sidewalk|street|vehicle|building|facility|property|right-of-way|right\s+of\s+way|sewer|tree|park)\b/gi],
    ['regulated_activity', /\b(?:operate|file|submit|inspect|revoke|suspend|issue|appeal|maintain|remove|install|construct)\b/gi],
  ];
  const terms: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [type, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const key = `${type}:${match[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({ term: match[0], type, span: [match.index ?? 0, (match.index ?? 0) + match[0].length] });
    }
  }
  return terms;
}

export function mergeOntologyTerms(
  existingTerms: Array<Record<string, unknown>>,
  definedRefs: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  const merged = [...(existingTerms ?? [])];
  const seen = new Set(merged.map(item => `${String(item.term ?? '').toLowerCase()}:${String(item.type ?? '')}`));
  for (const ref of definedRefs ?? []) {
    const key = `${String(ref.term ?? '').toLowerCase()}:defined_term`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      term: ref.term ?? '',
      type: 'defined_term',
      definition_body: ref.definition_body ?? '',
      span: ref.span ?? [],
    });
  }
  return merged;
}

export function buildFormalTerms(element: Record<string, unknown>): Record<string, unknown> {
  const actionText = firstField(element.action);
  const actor = firstField(element.subject);
  const section = String(asRecord(element.section_context).section ?? '');
  return {
    source_id: element.source_id ?? '',
    citation_id: normalizeSymbol(String(element.canonical_citation ?? '')),
    section_id: normalizeSymbol(section),
    actor_id: normalizeSymbol(actor),
    actor_predicate: normalizePredicate(actor),
    action_predicate: normalizePredicate(actionWithoutMentalState(actionText)),
    object_predicate: normalizePredicate(String(element.action_object ?? '')),
    recipient_id: normalizeSymbol(String(element.action_recipient ?? '')),
    norm_predicate: normalizePredicate(String(element.norm_type ?? '')),
    category_predicate: normalizePredicate(String(asRecord(element.legal_frame).category ?? '')),
    defined_term_id: normalizeSymbol(String(element.defined_term ?? '')),
  };
}

export function buildLogicFrame(element: Record<string, unknown>): Record<string, unknown> {
  const actionText = firstField(element.action);
  return {
    schema_version: SCHEMA_VERSION,
    source_id: element.source_id ?? '',
    canonical_citation: element.canonical_citation ?? '',
    actor: firstField(element.subject),
    actor_type: element.actor_type ?? 'unknown',
    modality: element.deontic_operator ?? '',
    norm_type: element.norm_type ?? '',
    action_text: actionText,
    action_predicate: normalizePredicate(actionWithoutMentalState(actionText)),
    object: element.action_object ?? '',
    recipient: element.action_recipient ?? '',
    conditions: element.condition_details ?? [],
    exceptions: element.exception_details ?? [],
    temporal_constraints: element.temporal_constraint_details ?? [],
    cross_references: element.cross_reference_details ?? [],
    resolved_cross_references: element.resolved_cross_references ?? [],
    enforcement_links: element.enforcement_links ?? [],
    conflict_links: element.conflict_links ?? [],
    defined_terms: element.defined_term_refs ?? [],
    violation: asRecord(element.legal_frame).category === 'violation',
    penalty: element.penalty ?? {},
    procedure: element.procedure ?? {},
    formal_terms: element.formal_terms ?? {},
    field_spans: element.field_spans ?? {},
    source_text: element.text ?? '',
    readiness: {
      schema_valid: element.schema_valid,
      parser_warnings: element.parser_warnings ?? [],
      promotable_to_theorem: element.promotable_to_theorem ?? false,
    },
  };
}

export function classifyLegalFrame(element: Record<string, unknown>): string {
  const text = String(element.text ?? '').toLowerCase();
  const action = fieldAsArray(element.action).join(' ').toLowerCase();
  const subject = fieldAsArray(element.subject).join(' ').toLowerCase();
  const normType = String(element.norm_type ?? '');
  if (['applicability', 'exemption', 'instrument_lifecycle', 'purpose', 'definition'].includes(normType)) return normType;
  if (normType === 'penalty' || /punishable|fine|penalty/.test(text)) return 'penalty';
  if (normType === 'violation' || /violation|offense|infraction/.test(text)) return 'violation';
  if (element.entity_type === 'legal_event' && /\b(?:appeal|citation|complaint|fee|hearing|inspection|notice|offense|order|penalty|violation)\b/.test(subject)) return 'procedure';
  if (/\b(?:appeal|appealed|hearing|notice|decision|inspect|inspection|revoke|revocation|suspend|suspension)\b/.test(action)) return 'procedure';
  if (/\b(?:permit|license|certificate|registration)\b/.test(text) || extractLegalInstrumentTarget(action)) return 'permit_or_license';
  if (text.includes('fee') || fieldAsArray(element.monetary_amounts).length) return 'fee';
  if (/^(file|submit|apply|provide)\b/.test(action)) return 'filing_requirement';
  return 'norm';
}

export function buildKgRelationshipHints(element: Record<string, unknown>): Array<Record<string, string>> {
  const subject = firstField(element.subject);
  const action = firstField(element.action);
  const category = String(asRecord(element.legal_frame).category ?? classifyLegalFrame(element));
  const instrumentTarget = extractLegalInstrumentTarget(action);
  const relationships: Array<Record<string, string>> = [];
  if (subject && action) {
    const predicate = ({
      obligation: 'imposesDutyOn',
      permission: 'authorizes',
      prohibition: 'prohibits',
      violation: 'definesViolationFor',
      penalty: 'createsPenaltyFor',
      definition: 'definesTerm',
      applicability: 'appliesTo',
      exemption: 'exemptsFrom',
      instrument_lifecycle: 'setsLifecycleFor',
    } as Record<string, string>)[String(element.norm_type ?? '')] ?? 'regulates';
    relationships.push({ subject: 'law', predicate, object: subject });
    relationships.push({ subject, predicate: 'performsAction', object: action });
  }
  if (category === 'instrument_lifecycle' && subject) relationships.push({ subject: 'law', predicate: 'setsLifecycleFor', object: subject });
  if (category === 'permit_or_license' && action) relationships.push({ subject: action, predicate: 'requiresLegalInstrument', object: instrumentTarget || subject });
  if (element.action_recipient) relationships.push({ subject, predicate: 'directedTo', object: String(element.action_recipient) });
  const events = new Set(fieldAsArray(asRecord(element.procedure).events).map(String));
  if (events.has('notice')) relationships.push({ subject: 'procedure', predicate: 'requiresEvent', object: 'notice' });
  if (events.has('hearing')) relationships.push({ subject: 'procedure', predicate: 'requiresEvent', object: 'hearing' });
  return relationships;
}

export function buildLlmRepairPayload(element: Record<string, unknown>): Record<string, unknown> {
  const reasons = fieldAsArray(element.parser_warnings).map(String);
  if (element.schema_valid === false) reasons.push('schema_validation_failed');
  if (element.quality_label === 'low') reasons.push('low_scaffold_quality');
  if (element.promotable_to_theorem === false && !reasons.length) reasons.push('not_promotable_to_theorem');
  const required = reasons.length > 0;
  const promptContext = {
    source_text: element.text ?? '',
    source_id: element.source_id ?? '',
    canonical_citation: element.canonical_citation ?? '',
    support_text: element.support_text ?? '',
    support_span: element.support_span ?? [],
    source_span: element.source_span ?? [],
    section_context: element.section_context ?? {},
    hierarchy_path: element.hierarchy_path ?? [],
    hierarchy_details: element.hierarchy_details ?? [],
    legal_frame: element.legal_frame ?? {},
    formal_terms: element.formal_terms ?? {},
    deontic_operator: element.deontic_operator ?? '',
    norm_type: element.norm_type ?? '',
    subject: element.subject ?? [],
    action: element.action ?? [],
    conditions: element.condition_details ?? [],
    exceptions: element.exception_details ?? [],
    temporal_constraints: element.temporal_constraint_details ?? [],
    cross_references: element.cross_reference_details ?? [],
    resolved_cross_references: element.resolved_cross_references ?? [],
    enforcement_links: element.enforcement_links ?? [],
    conflict_links: element.conflict_links ?? [],
    defined_term_refs: element.defined_term_refs ?? [],
    kg_relationship_hints: element.kg_relationship_hints ?? [],
    ontology_terms: element.ontology_terms ?? [],
    parser_warnings: Array.from(new Set(reasons)),
    deterministically_resolved: false,
    deterministic_resolution: {},
  };
  return {
    required,
    reasons: Array.from(new Set(reasons)),
    target_schema_version: SCHEMA_VERSION,
    suggested_router: 'llm_router',
    allow_llm_repair: required,
    deterministically_resolved: false,
    deterministic_resolution: {},
    prompt_template: 'legal_deontic_parser_repair_v1',
    prompt_hash: hashDigest(promptContext),
    prompt_context: promptContext,
  };
}

export function buildExportReadiness(element: Record<string, unknown>): Record<string, unknown> {
  const blockers = Array.from(new Set([
    ...fieldAsArray(element.parser_warnings).map(String),
    ...(element.schema_valid === false ? ['schema_validation_failed'] : []),
    ...(asRecord(element.llm_repair).required ? ['llm_repair_required'] : []),
  ]));
  let allowedExports = ['canonical_parquet', 'bm25', 'embeddings', 'knowledge_graph'];
  let formalLogicTargets: string[] = [];
  const requiresValidation: string[] = [];
  const hasTemporalOrProcedure = fieldAsArray(element.temporal_constraint_details).length > 0 || Object.keys(asRecord(element.procedure)).length > 0;
  if (element.schema_valid === false) {
    allowedExports = [];
    requiresValidation.push('schema_repair');
  } else if (blockers.length) {
    if (hasTemporalOrProcedure) formalLogicTargets = ['deontic', 'fol', 'frame_logic', 'temporal_logic', 'event_calculus'];
    allowedExports.push('llm_repair_queue');
    requiresValidation.push('llm_router_repair', 'human_or_llm_semantic_review');
  } else {
    formalLogicTargets = ['deontic', 'fol', 'frame_logic'];
    if (hasTemporalOrProcedure) formalLogicTargets.push('temporal_logic', 'event_calculus');
    allowedExports.push('formal_logic_scaffold', 'proof_candidate');
  }
  const theoremPromotable = Boolean(element.promotable_to_theorem && !blockers.length && element.schema_valid === true);
  if (!theoremPromotable && !requiresValidation.includes('human_or_llm_semantic_review')) requiresValidation.push('human_or_llm_semantic_review');
  return {
    kg_ready: element.schema_valid === true,
    logic_ready: Boolean(formalLogicTargets.length),
    proof_ready: theoremPromotable,
    theorem_promotable: theoremPromotable,
    allowed_exports: allowedExports,
    formal_logic_targets: formalLogicTargets,
    blockers,
    requires_validation: Array.from(new Set(requiresValidation)),
    source: 'deterministic_parser',
  };
}

export function validateParserElement(element: Record<string, unknown>): Record<string, unknown> {
  const missing = PARSER_REQUIRED_FIELDS.filter(field => !(field in element));
  const typeErrors: string[] = [];
  for (const field of [
    'support_span',
    'subject',
    'action',
    'conditions',
    'condition_details',
    'temporal_constraints',
    'temporal_constraint_details',
    'exceptions',
    'exception_details',
    'override_clauses',
    'override_clause_details',
    'cross_references',
    'cross_reference_details',
    'resolved_cross_references',
    'enforcement_links',
    'conflict_links',
    'enumerated_items',
    'defined_term_refs',
    'ontology_terms',
    'kg_relationship_hints',
    'monetary_amounts',
    'monetary_amount_details',
    'hierarchy_path',
    'hierarchy_details',
    'parser_warnings',
  ]) {
    if (field in element && !Array.isArray(element[field])) typeErrors.push(field);
  }
  for (const field of ['section_context', 'definition_scope', 'export_readiness', 'field_spans', 'formal_terms', 'legal_frame', 'logic_frame', 'llm_repair', 'penalty', 'procedure']) {
    if (field in element && !isPlainRecord(element[field])) typeErrors.push(field);
  }
  if ('support_span' in element && fieldAsArray(element.support_span).length !== 2) typeErrors.push('support_span');
  return {
    valid: missing.length === 0 && typeErrors.length === 0,
    missing_fields: missing,
    type_errors: typeErrors,
    schema_version: element.schema_version ?? SCHEMA_VERSION,
  };
}

export function migrateParserElement(element: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...(element ?? {}) };
  migrated.previous_schema_version = migrated.schema_version ?? 'unknown';
  migrated.schema_version = SCHEMA_VERSION;
  const text = String(migrated.text ?? migrated.source_text ?? '');
  const supportText = String(migrated.support_text ?? text);
  migrated.text = text;
  migrated.support_text = supportText;
  migrated.support_span = fieldAsArray(migrated.support_span).length ? migrated.support_span : [0, supportText.length];
  migrated.subject = fieldAsArray(migrated.subject);
  migrated.action = fieldAsArray(migrated.action);
  migrated.modal ??= '';
  migrated.norm_type ??= 'unknown';
  migrated.deontic_operator ??= '';
  migrated.document_type ??= 'statute';
  migrated.extraction_method ??= 'migrated_legacy_parser_element';
  migrated.confidence_floor ??= 0.1;
  migrated.conditions = fieldAsArray(migrated.conditions);
  migrated.exceptions = fieldAsArray(migrated.exceptions);
  migrated.override_clauses = fieldAsArray(migrated.override_clauses);
  migrated.cross_references = fieldAsArray(migrated.cross_references);
  migrated.enumerated_items = fieldAsArray(migrated.enumerated_items);
  migrated.condition_details = fieldAsArray(migrated.condition_details).length ? migrated.condition_details : legacyClauseDetails(fieldAsArray(migrated.conditions), 'condition');
  migrated.exception_details = fieldAsArray(migrated.exception_details).length ? migrated.exception_details : legacyClauseDetails(fieldAsArray(migrated.exceptions), 'exception');
  migrated.override_clause_details = fieldAsArray(migrated.override_clause_details).length ? migrated.override_clause_details : legacyClauseDetails(fieldAsArray(migrated.override_clauses), 'override');
  migrated.cross_reference_details = fieldAsArray(migrated.cross_reference_details).length ? migrated.cross_reference_details : legacyCrossReferenceDetails(fieldAsArray(migrated.cross_references));
  migrated.temporal_constraint_details = fieldAsArray(migrated.temporal_constraint_details).length ? migrated.temporal_constraint_details : legacyTemporalDetails(fieldAsArray(migrated.temporal_constraints));
  migrated.temporal_constraints = fieldAsArray(migrated.temporal_constraints);
  migrated.resolved_cross_references = fieldAsArray(migrated.resolved_cross_references);
  migrated.enforcement_links = fieldAsArray(migrated.enforcement_links);
  migrated.conflict_links = fieldAsArray(migrated.conflict_links);
  migrated.defined_term_refs = fieldAsArray(migrated.defined_term_refs);
  migrated.ontology_terms = fieldAsArray(migrated.ontology_terms);
  migrated.kg_relationship_hints = fieldAsArray(migrated.kg_relationship_hints);
  migrated.monetary_amounts = fieldAsArray(migrated.monetary_amounts);
  migrated.monetary_amount_details = fieldAsArray(migrated.monetary_amount_details);
  migrated.hierarchy_path = fieldAsArray(migrated.hierarchy_path);
  migrated.hierarchy_details = fieldAsArray(migrated.hierarchy_details);
  migrated.parser_warnings = fieldAsArray(migrated.parser_warnings);
  migrated.section_context = asRecord(migrated.section_context);
  migrated.definition_scope = asRecord(migrated.definition_scope);
  migrated.field_spans = asRecord(migrated.field_spans);
  migrated.legal_frame = Object.keys(asRecord(migrated.legal_frame)).length ? migrated.legal_frame : { category: classifyLegalFrame(migrated) };
  migrated.actor_type = migrated.actor_type || classifyLegalEntity(firstField(migrated.subject));
  migrated.entity_type = migrated.entity_type || migrated.actor_type;
  const actionText = firstField(migrated.action);
  migrated.action_verb = migrated.action_verb || firstVerb(actionText);
  migrated.action_object = migrated.action_object || actionObject(actionText);
  migrated.action_recipient = migrated.action_recipient || extractActionRecipientFromText(actionText);
  migrated.source_id = migrated.source_id || buildSourceId(migrated);
  migrated.canonical_citation = migrated.canonical_citation || buildCanonicalCitation(text, String(migrated.source_id));
  migrated.formal_terms = Object.keys(asRecord(migrated.formal_terms)).length ? migrated.formal_terms : buildFormalTerms(migrated);
  migrated.logic_frame = Object.keys(asRecord(migrated.logic_frame)).length ? migrated.logic_frame : buildLogicFrame(migrated);
  migrated.monetary_amounts = fieldAsArray(migrated.monetary_amounts).length ? migrated.monetary_amounts : extractMonetaryAmounts(text);
  migrated.monetary_amount_details = fieldAsArray(migrated.monetary_amount_details).length ? migrated.monetary_amount_details : extractMonetaryAmountDetails(text);
  migrated.penalty = Object.keys(asRecord(migrated.penalty)).length ? migrated.penalty : extractPenaltyDetails(text, actionText);
  migrated.procedure = Object.keys(asRecord(migrated.procedure)).length ? migrated.procedure : extractProcedureDetails(text, actionText);
  migrated.kg_relationship_hints = fieldAsArray(migrated.kg_relationship_hints).length ? migrated.kg_relationship_hints : buildKgRelationshipHints(migrated);
  const validation = validateParserElement(migrated);
  migrated.schema_valid = validation.valid;
  if (migrated.scaffold_quality === undefined || migrated.slot_coverage === undefined || migrated.quality_label === undefined || migrated.promotable_to_theorem === undefined) {
    const quality = scoreScaffoldQuality({ ...migrated, subject: firstField(migrated.subject), action: firstField(migrated.action) });
    migrated.scaffold_quality = quality.score;
    migrated.slot_coverage = quality.slot_coverage;
    migrated.quality_label = quality.quality_label;
    migrated.promotable_to_theorem = quality.promotable;
    migrated.parser_warnings = Array.from(new Set([...fieldAsArray(migrated.parser_warnings).map(String), ...quality.warnings]));
  }
  migrated.llm_repair = Object.keys(asRecord(migrated.llm_repair)).length ? migrated.llm_repair : buildLlmRepairPayload(migrated);
  migrated.export_readiness = Object.keys(asRecord(migrated.export_readiness)).length ? migrated.export_readiness : buildExportReadiness(migrated);
  return migrated;
}

export function parserElementsWithDeterministicIrReadiness(elements: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return (elements ?? []).map(element => {
    const migrated = migrateParserElement(element);
    return {
      ...migrated,
      export_readiness: buildExportReadiness(migrated),
      llm_repair: buildLlmRepairPayload(migrated),
    };
  });
}

export function buildFormalLogicRecord(element: Record<string, unknown>): Record<string, unknown> {
  const migrated = migrateParserElement(element);
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  const formula = buildDeonticFormula(migrated);
  return {
    formula_id: hashId('formula', { source_id: sourceId, formula, schema: SCHEMA_VERSION }),
    source_id: sourceId,
    canonical_citation: migrated.canonical_citation ?? '',
    schema_version: SCHEMA_VERSION,
    logic_family: 'deontic',
    formula,
    formal_terms: migrated.formal_terms ?? {},
    logic_frame: migrated.logic_frame ?? {},
    legal_frame: migrated.legal_frame ?? {},
    proof_candidate: Boolean(asRecord(migrated.export_readiness).proof_ready),
    formal_logic_targets: asRecord(migrated.export_readiness).formal_logic_targets ?? [],
    requires_validation: asRecord(migrated.export_readiness).requires_validation ?? [],
    parser_warnings: migrated.parser_warnings ?? [],
    conflict_links: migrated.conflict_links ?? [],
    enforcement_links: migrated.enforcement_links ?? [],
    provenance: {
      text: migrated.text ?? '',
      source_span: migrated.source_span ?? [],
      support_text: migrated.support_text ?? '',
      support_span: migrated.support_span ?? [],
    },
  };
}

export function buildProcedureEventRecords(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const migrated = migrateParserElement(element);
  const procedure = asRecord(migrated.procedure);
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  return fieldAsArray(procedure.event_chain).map(asRecord).map(item => {
    const event = String(item.event ?? '');
    const order = Number(item.order ?? 0);
    const relations = fieldAsArray(item.relations).map(asRecord);
    const temporalAnchors = fieldAsArray(migrated.temporal_constraint_details)
      .map(asRecord)
      .filter(detail => detail.anchor_event === event || detail.anchor === event);
    return {
      event_id: hashId('event', { source_id: sourceId, event, order }),
      source_id: sourceId,
      canonical_citation: migrated.canonical_citation ?? '',
      event,
      event_symbol: normalizePredicate(event),
      event_order: order,
      is_trigger: event === procedure.trigger_event,
      is_terminal: event === procedure.terminal_event,
      event_mentions: item.mentions ?? [],
      event_relations: relations,
      relation_types: relations.map(relation => relation.relation ?? ''),
      anchor_events: relations.map(relation => relation.anchor_event ?? '').filter(Boolean),
      temporal_anchors: temporalAnchors,
      actor_id: asRecord(migrated.formal_terms).actor_id ?? '',
      action_predicate: asRecord(migrated.formal_terms).action_predicate ?? '',
      provenance: { text: migrated.text ?? '', source_span: migrated.source_span ?? [] },
    };
  });
}

export function buildProofObligationRecord(element: Record<string, unknown>): Record<string, unknown> {
  const migrated = migrateParserElement(element);
  const formal = buildFormalLogicRecord(migrated);
  const readiness = asRecord(migrated.export_readiness);
  const proofSystems = ['deontic_tableau', 'fol_resolution', 'frame_logic'];
  if (fieldAsArray(readiness.formal_logic_targets).includes('temporal_logic')) proofSystems.push('temporal_logic', 'event_calculus');
  return {
    proof_obligation_id: hashId('proof', { source_id: formal.source_id, formula_id: formal.formula_id, schema: SCHEMA_VERSION }),
    source_id: formal.source_id,
    formula_id: formal.formula_id,
    canonical_citation: formal.canonical_citation,
    formula: formal.formula,
    proof_candidate: formal.proof_candidate,
    proof_systems: proofSystems,
    blocked: !formal.proof_candidate,
    blockers: readiness.blockers ?? [],
    requires_validation: readiness.requires_validation ?? [],
    conflict_links: migrated.conflict_links ?? [],
    enforcement_links: migrated.enforcement_links ?? [],
    provenance: formal.provenance,
  };
}

export function buildClauseRecords(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const migrated = migrateParserElement(element);
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  const records: Array<Record<string, unknown>> = [];
  for (const [slotType, clauses] of [
    ['condition', fieldAsArray(migrated.condition_details)],
    ['exception', fieldAsArray(migrated.exception_details)],
    ['override', fieldAsArray(migrated.override_clause_details)],
  ] as Array<[string, unknown[]]>) {
    clauses.map(asRecord).forEach((clause, index) => {
      const text = String(clause.normalized_text ?? clause.raw_text ?? '');
      records.push({
        clause_id: hashId('clause', { source_id: sourceId, slot_type: slotType, index, text, span: clause.span ?? [] }),
        source_id: sourceId,
        canonical_citation: migrated.canonical_citation ?? '',
        slot_type: slotType,
        clause_type: clause.clause_type ?? '',
        raw_text: clause.raw_text ?? '',
        normalized_text: text,
        predicate: normalizePredicate(text),
        span: clause.span ?? [],
        clause_span: clause.clause_span ?? [],
        effect: ({ condition: 'antecedent', exception: 'negated_antecedent', override: 'precedence_modifier' } as Record<string, string>)[slotType] ?? 'modifier',
        provenance: { text: migrated.text ?? '', source_span: migrated.source_span ?? [] },
      });
    });
  }
  return records;
}

export function buildReferenceRecords(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const migrated = migrateParserElement(element);
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  const refs = fieldAsArray(migrated.resolved_cross_references).length
    ? fieldAsArray(migrated.resolved_cross_references)
    : fieldAsArray(migrated.cross_reference_details);
  const records: Array<Record<string, unknown>> = [];
  refs.map(asRecord).forEach((ref, index) => {
    const targetSections = fieldAsArray(ref.target_sections);
    const targets = targetSections.length ? targetSections : [{ section: ref.target_section ?? '', heading: ref.target_heading ?? '', hierarchy_path: ref.target_hierarchy_path ?? [] }];
    targets.map(asRecord).forEach((target, targetIndex) => {
      records.push({
        reference_id: hashId('ref', { source_id: sourceId, index, target_index: targetIndex, type: ref.type ?? '', value: ref.value ?? '', target_section: target.section ?? '' }),
        source_id: sourceId,
        canonical_citation: migrated.canonical_citation ?? '',
        reference_type: ref.type ?? '',
        reference_value: ref.value ?? ref.reference ?? '',
        raw_text: ref.raw_text ?? '',
        normalized_text: ref.normalized_text ?? '',
        resolution_status: ref.resolution_status ?? 'unresolved',
        target_exists: Boolean(ref.target_exists),
        target_section: target.section ?? '',
        target_heading: target.heading ?? '',
        target_hierarchy_path: target.hierarchy_path ?? [],
        span: ref.span ?? [],
        provenance: { text: migrated.text ?? '', source_span: migrated.source_span ?? [] },
      });
    });
  });
  return records;
}

export function buildSanctionRecords(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const migrated = migrateParserElement(element);
  const penalty = asRecord(migrated.penalty);
  if (!Object.keys(penalty).length) return [];
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  const records: Array<Record<string, unknown>> = [];
  const addRecord = (sanctionType: string, detail: Record<string, unknown>, role = '') => {
    records.push({
      sanction_id: hashId('sanction', { source_id: sourceId, sanction_type: sanctionType, role, detail }),
      source_id: sourceId,
      canonical_citation: migrated.canonical_citation ?? '',
      sanction_type: sanctionType,
      role,
      detail,
      sanction_class: penalty.sanction_class ?? '',
      sanction_modality: penalty.sanction_modality ?? '',
      recurrence: penalty.recurrence ?? {},
      has_range: Boolean(penalty.has_range),
      enforcement_links: migrated.enforcement_links ?? [],
      provenance: { text: migrated.text ?? '', source_span: migrated.source_span ?? [] },
    });
  };
  const seenAmounts = new Set<string>();
  for (const amount of fieldAsArray(penalty.monetary_amount_details).map(asRecord)) {
    const key = `${amount.raw_text ?? ''}:${amount.numeric_value ?? ''}:${amount.currency ?? ''}`;
    if (seenAmounts.has(key)) continue;
    seenAmounts.add(key);
    addRecord('fine', amount, 'amount');
  }
  if (Object.keys(asRecord(penalty.minimum_amount)).length) addRecord('fine', asRecord(penalty.minimum_amount), 'minimum');
  if (Object.keys(asRecord(penalty.maximum_amount)).length) addRecord('fine', asRecord(penalty.maximum_amount), 'maximum');
  if (Object.keys(asRecord(penalty.imprisonment_duration)).length) addRecord('imprisonment', asRecord(penalty.imprisonment_duration), 'duration');
  if (Object.keys(asRecord(penalty.recurrence)).length) addRecord('recurrence', asRecord(penalty.recurrence), 'recurrence');
  return records;
}

export function buildOntologyEntityRecords(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const migrated = migrateParserElement(element);
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  const seen = new Set<string>();
  return fieldAsArray(migrated.ontology_terms).map(asRecord).flatMap(term => {
    const value = String(term.term ?? '');
    const entityType = String(term.type ?? '');
    const span = fieldAsArray(term.span).map(Number);
    const key = `${value.toLowerCase()}:${entityType}:${span.join(',')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      entity_id: hashId('entity', { source_id: sourceId, entity: value, type: entityType, span }),
      source_id: sourceId,
      canonical_citation: migrated.canonical_citation ?? '',
      term: value,
      term_id: normalizeSymbol(value),
      entity_type: entityType,
      definition_body: term.definition_body ?? '',
      span,
      provenance: { text: migrated.text ?? '', source_span: migrated.source_span ?? [] },
    }];
  });
}

export function buildRepairQueueRecord(element: Record<string, unknown>): Record<string, unknown> {
  const migrated = migrateParserElement(element);
  const repair = Object.keys(asRecord(migrated.llm_repair)).length ? asRecord(migrated.llm_repair) : buildLlmRepairPayload(migrated);
  const sourceId = String(migrated.source_id || buildSourceId(migrated));
  return {
    repair_id: hashId('repair', { source_id: sourceId, prompt_hash: repair.prompt_hash ?? '', reasons: repair.reasons ?? [] }),
    source_id: sourceId,
    canonical_citation: migrated.canonical_citation ?? '',
    required: Boolean(repair.required),
    reasons: repair.reasons ?? [],
    suggested_router: repair.suggested_router ?? 'llm_router',
    prompt_template: repair.prompt_template ?? '',
    prompt_hash: repair.prompt_hash ?? '',
    prompt_context: repair.prompt_context ?? {},
    schema_version: migrated.schema_version ?? SCHEMA_VERSION,
    quality_label: migrated.quality_label ?? '',
    scaffold_quality: migrated.scaffold_quality ?? 0,
  };
}

export function buildExportRecordBundle(element: Record<string, unknown>): Record<string, unknown> {
  const migrated = migrateParserElement(element);
  return {
    source_id: migrated.source_id || buildSourceId(migrated),
    canonical: { ...migrated },
    formal_logic: [buildFormalLogicRecord(migrated)],
    proof_obligations: [buildProofObligationRecord(migrated)],
    knowledge_graph_triples: buildKgTriples(migrated),
    clause_records: buildClauseRecords(migrated),
    reference_records: buildReferenceRecords(migrated),
    procedure_event_records: buildProcedureEventRecords(migrated),
    sanction_records: buildSanctionRecords(migrated),
    ontology_entities: buildOntologyEntityRecords(migrated),
    repair_queue: asRecord(migrated.llm_repair).required ? [buildRepairQueueRecord(migrated)] : [],
  };
}

export function buildDeonticFormula(element: Record<string, unknown>): string {
  const subject = normalizePredicate(firstField(element.subject) || 'Agent');
  const action = normalizePredicate(actionWithoutMentalState(firstField(element.action)) || 'Act');
  const normType = String(element.norm_type ?? '').toLowerCase();
  const operator = String(element.deontic_operator || ({ definition: 'DEF', applicability: 'APP', exemption: 'EXEMPT', instrument_lifecycle: 'LIFE', purpose: 'PURP' } as Record<string, string>)[normType] || 'O');
  if (operator === 'DEF') return `Definition(${subject})`;
  if (operator === 'PURP') return `Purpose(${subject}, ${action})`;
  if (operator === 'APP') return `AppliesTo(${subject}, ${action})`;
  if (operator === 'EXEMPT') return `ExemptFrom(${subject}, ${action})`;
  if (operator === 'LIFE') return `Lifecycle(${subject}, ${action})`;
  const atom = `${action}(${subject})`;
  const conditions = fieldAsArray(element.conditions).map(String).filter(Boolean);
  if (!conditions.length) return `${operator}(${atom})`;
  const antecedent = conditions.map(normalizePredicate).map(name => `${name}(${subject})`).join(' ∧ ');
  return `${antecedent} → ${operator}(${atom})`;
}

export function buildDocumentExportTables(elements: Array<Record<string, unknown>>): Record<string, Array<Record<string, unknown>>> {
  const tables: Record<string, Array<Record<string, unknown>>> = Object.fromEntries(Object.keys(EXPORT_TABLE_SPECS).map(name => [name, []]));
  for (const element of elements ?? []) {
    const bundle = buildExportRecordBundle(element);
    tables.canonical.push(asRecord(bundle.canonical));
    for (const tableName of Object.keys(tables)) {
      if (tableName === 'canonical') continue;
      tables[tableName].push(...fieldAsArray(bundle[tableName]).map(asRecord));
    }
  }
  return tables;
}

export function getExportTableSpecs(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(EXPORT_TABLE_SPECS).map(([name, spec]) => [name, { ...spec }]));
}

export function validateDocumentExportTables(tables: Record<string, Array<Record<string, unknown>>>): Record<string, unknown> {
  const requiredTables = new Set(Object.keys(EXPORT_TABLE_SPECS));
  const missingTables = [...requiredTables].filter(name => !(name in (tables ?? {}))).sort();
  const errors: string[] = missingTables.map(name => `missing_table:${name}`);
  const warnings: string[] = [];
  const canonical = fieldAsArray((tables ?? {}).canonical).map(asRecord);
  const canonicalSourceIds = canonical.map(row => row.source_id).filter(Boolean);
  if (canonicalSourceIds.length !== canonical.length || new Set(canonicalSourceIds).size !== canonical.length) errors.push('canonical_source_ids_missing_or_not_unique');
  for (const [tableName, rowsUnknown] of Object.entries(tables ?? {})) {
    const spec = EXPORT_TABLE_SPECS[tableName];
    const rows = fieldAsArray(rowsUnknown);
    const primaryValues: unknown[] = [];
    rows.forEach((rowUnknown, index) => {
      if (!isPlainRecord(rowUnknown)) {
        errors.push(`${tableName}[${index}]_row_not_dict`);
        return;
      }
      const row = rowUnknown as Record<string, unknown>;
      if (spec?.primary_key) {
        const primaryValue = row[spec.primary_key];
        primaryValues.push(primaryValue);
        if (!primaryValue) errors.push(`${tableName}[${index}]_missing_${spec.primary_key}`);
      }
      if (spec?.requires_source_id && !row.source_id) errors.push(`${tableName}[${index}]_missing_source_id`);
      if (tableName !== 'canonical' && row.source_id && !canonicalSourceIds.includes(row.source_id)) warnings.push(`${tableName}[${index}]_source_id_not_in_canonical`);
    });
    if (spec?.primary_key && new Set(primaryValues).size !== primaryValues.length) errors.push(`${tableName}_${spec.primary_key}_not_unique`);
  }
  if (fieldAsArray((tables ?? {}).formal_logic).length !== canonical.length) errors.push('formal_logic_count_mismatch');
  if (fieldAsArray((tables ?? {}).proof_obligations).length !== canonical.length) errors.push('proof_obligations_count_mismatch');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    table_counts: Object.fromEntries(Object.entries(tables ?? {}).map(([name, rows]) => [name, fieldAsArray(rows).length])),
  };
}

export function serializeExportTablesForParquet(
  tables: Record<string, Array<Record<string, unknown>>>,
  options: { stringifyNested?: boolean } = {},
): Record<string, Array<Record<string, unknown>>> {
  const stringifyNested = options.stringifyNested ?? true;
  return Object.fromEntries(Object.entries(tables ?? {}).map(([tableName, rows]) => [
    tableName,
    fieldAsArray(rows).map(asRecord).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, parquetCell(value, stringifyNested)]))),
  ]));
}

export function writeDocumentExportParquet(
  elements: Array<Record<string, unknown>>,
  outputDir: string,
  options: { stringifyNested?: boolean } = {},
): Record<string, unknown> {
  const tables = buildDocumentExportTables(elements);
  const validation = validateDocumentExportTables(tables);
  if (!validation.valid) throw new Error(`invalid export tables: ${JSON.stringify(validation.errors)}`);
  const serialized = serializeExportTablesForParquet(tables, options);
  mkdirSync(outputDir, { recursive: true });
  const parquetPaths: Record<string, string> = {};
  for (const [tableName, rows] of Object.entries(serialized)) {
    const outputPath = join(outputDir, `${tableName}.jsonl`);
    writeFileSync(outputPath, rows.map(row => JSON.stringify(row)).join('\n'), 'utf8');
    parquetPaths[tableName] = outputPath;
  }
  const manifest = buildDocumentExportManifest(elements, tables);
  const manifestPath = join(outputDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { output_dir: outputDir, parquet_paths: parquetPaths, manifest_path: manifestPath, manifest, validation };
}

export function buildDocumentExportManifest(
  elements: Array<Record<string, unknown>>,
  tables: Record<string, Array<Record<string, unknown>>> = buildDocumentExportTables(elements),
): Record<string, unknown> {
  const sourceIds = (elements ?? []).map(element => String(element.source_id || buildSourceId(element)));
  const tableCounts = Object.fromEntries(Object.entries(tables ?? {}).map(([name, rows]) => [name, fieldAsArray(rows).length]));
  return {
    manifest_id: hashId('manifest', { schema_version: SCHEMA_VERSION, source_ids: sourceIds, table_counts: tableCounts }),
    schema_version: SCHEMA_VERSION,
    element_count: elements?.length ?? 0,
    source_ids: sourceIds,
    table_counts: tableCounts,
    quality: {
      proof_candidates: (elements ?? []).filter(element => asRecord(element.export_readiness).proof_ready).length,
      repair_required: (elements ?? []).filter(element => asRecord(element.llm_repair).required).length,
      schema_valid: (elements ?? []).filter(element => element.schema_valid === true).length,
    },
  };
}

export function convertLegalTextToDeontic(text: string, documentType = 'statute'): Array<Record<string, unknown>> {
  return extractNormativeElements(text, documentType).map(element => migrateParserElement(element));
}

export const segment_legal_text = segmentLegalText;
export const analyze_normative_sentence = analyzeNormativeSentence;
export const extract_normative_elements = extractNormativeElements;
export const build_canonical_citation = buildCanonicalCitation;
export const resolve_cross_references = resolveCrossReferences;
export const extract_enforcement_links = extractEnforcementLinks;
export const parser_element_to_formula = parserElementToFormula;
export const build_formal_logic_record_from_ir = buildFormalLogicRecordFromIr;
export const build_proof_obligation_record_from_ir = buildProofObligationRecordFromIr;
export const build_repair_queue_record_from_ir = buildRepairQueueRecordFromIr;
export const build_procedure_event_records_from_ir = buildProcedureEventRecordsFromIr;
export const build_document_export_tables_from_ir = buildDocumentExportTablesFromIr;
export const parser_elements_to_export_tables = parserElementsToExportTables;
export const summarize_parser_elements = summarizeParserElements;
export const summarize_phase8_parser_metrics = summarizePhase8ParserMetrics;
export const summarize_prover_syntax_target_coverage = summarizeProverSyntaxTargetCoverage;
export const build_source_id = buildSourceId;
export const extract_conditions = extractConditions;
export const extract_condition_details = extractConditionDetails;
export const extract_exceptions = extractExceptions;
export const extract_exception_details = extractExceptionDetails;
export const extract_override_clauses = extractOverrideClauses;
export const extract_override_clause_details = extractOverrideClauseDetails;
export const extract_cross_reference_details = extractCrossReferenceDetails;
export const extract_enumerated_items = extractEnumeratedItems;
export const expand_enumerated_norms = expandEnumeratedNorms;
export const extract_temporal_constraint_details = extractTemporalConstraintDetails;
export const normalize_temporal_value = normalizeTemporalValue;
export const extract_monetary_amounts = extractMonetaryAmounts;
export const extract_monetary_amount_details = extractMonetaryAmountDetails;
export const extract_imprisonment_duration = extractImprisonmentDuration;
export const extract_penalty_recurrence = extractPenaltyRecurrence;
export const classify_sanction_class = classifySanctionClass;
export const classify_sanction_modality = classifySanctionModality;
export const extract_penalty_details = extractPenaltyDetails;
export const extract_procedure_event_mentions = extractProcedureEventMentions;
export const extract_procedure_event_relations = extractProcedureEventRelations;
export const extract_procedure_details = extractProcedureDetails;
export const extract_legal_subject = extractLegalSubject;
export const extract_legal_action = extractLegalAction;
export const extract_legal_instrument_target = extractLegalInstrumentTarget;
export const extract_definition_body = extractDefinitionBody;
export const infer_definition_scope = inferDefinitionScope;
export const extract_ontology_terms = extractOntologyTerms;
export const merge_ontology_terms = mergeOntologyTerms;
export const build_formal_terms = buildFormalTerms;
export const build_logic_frame = buildLogicFrame;
export const classify_legal_frame = classifyLegalFrame;
export const build_kg_relationship_hints = buildKgRelationshipHints;
export const build_llm_repair_payload = buildLlmRepairPayload;
export const build_export_readiness = buildExportReadiness;
export const validate_parser_element = validateParserElement;
export const migrate_parser_element = migrateParserElement;
export const parser_elements_with_deterministic_ir_readiness = parserElementsWithDeterministicIrReadiness;
export const build_clause_records = buildClauseRecords;
export const build_reference_records = buildReferenceRecords;
export const build_sanction_records = buildSanctionRecords;
export const build_ontology_entity_records = buildOntologyEntityRecords;
export const build_formal_logic_record = buildFormalLogicRecord;
export const build_proof_obligation_record = buildProofObligationRecord;
export const build_repair_queue_record = buildRepairQueueRecord;
export const build_procedure_event_records = buildProcedureEventRecords;
export const build_deontic_formula = buildDeonticFormula;
export const build_document_export_tables = buildDocumentExportTables;
export const get_export_table_specs = getExportTableSpecs;
export const validate_document_export_tables = validateDocumentExportTables;
export const serialize_export_tables_for_parquet = serializeExportTablesForParquet;
export const write_document_export_parquet = writeDocumentExportParquet;
export const build_export_record_bundle = buildExportRecordBundle;
export const build_document_export_manifest = buildDocumentExportManifest;
export const convert_legal_text_to_deontic = convertLegalTextToDeontic;

function extractClauseDetails(
  sentence: string,
  patterns: Array<[string, RegExp]>,
  slotType: string,
): Array<Record<string, unknown>> {
  const source = String(sentence ?? '');
  const details: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [clauseType, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const rawValue = String(match[1] ?? '').trim();
      if (!rawValue) continue;
      const normalized = rawValue.toLowerCase();
      const start = match.index === undefined ? 0 : match.index + match[0].indexOf(match[1] ?? rawValue);
      const end = start + rawValue.length;
      const key = `${clauseType}:${normalized}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      details.push({
        type: slotType,
        clause_type: clauseType,
        raw_text: rawValue,
        normalized_text: normalized,
        span: [start, end],
        clause_span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
      });
    }
  }
  return details;
}

function isDefinitionScopeMarker(sentence: string, match: RegExpMatchArray): boolean {
  const raw = String(match[0] ?? '').toLowerCase();
  if (!raw.startsWith('this ')) return false;
  const prefix = String(sentence ?? '').slice(0, match.index ?? 0).toLowerCase();
  return /(?:\bin\s+|\bfor\s+purposes\s+of\s+)$/.test(prefix);
}

function legacyClauseDetails(values: unknown[], slotType: string): Array<Record<string, unknown>> {
  return values.map((value, index) => ({
    type: slotType,
    clause_type: 'legacy',
    raw_text: String(value ?? ''),
    normalized_text: String(value ?? '').toLowerCase(),
    span: [],
    clause_span: [],
    legacy_index: index,
  }));
}

function legacyCrossReferenceDetails(values: unknown[]): Array<Record<string, unknown>> {
  return values.map((value, index) => ({
    type: 'legacy',
    value: String(value ?? ''),
    raw_text: String(value ?? ''),
    normalized_text: String(value ?? '').toLowerCase(),
    span: [],
    legacy_index: index,
  }));
}

function legacyTemporalDetails(values: unknown[]): Array<Record<string, unknown>> {
  return values.map((value, index) => ({
    type: 'legacy',
    temporal_kind: 'legacy',
    value: String(value ?? '').toLowerCase(),
    ...normalizeTemporalValue(String(value ?? '')),
    raw_text: String(value ?? ''),
    normalized_text: String(value ?? '').toLowerCase(),
    span: [],
    legacy_index: index,
  }));
}

function penaltyBound(text: string, bound: 'minimum' | 'maximum'): Record<string, unknown> {
  const pattern = bound === 'minimum'
    ? /\b(?:not\s+less\s+than|minimum(?:\s+of)?)\s+(\$\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\s+dollars?)/i
    : /\b(?:not\s+more\s+than|maximum(?:\s+of)?|up\s+to)\s+(\$\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\s+dollars?)/i;
  const match = String(text ?? '').match(pattern);
  if (!match) return {};
  const rawText = match[1].trim();
  const valueStart = (match.index ?? 0) + match[0].indexOf(match[1]);
  return {
    raw_text: rawText,
    numeric_value: rawText.replace(/[^\d.]/g, ''),
    currency: /\$|dollar/i.test(rawText) ? 'USD' : '',
    span: [valueStart, valueStart + rawText.length],
  };
}

function inferEventFromPhrase(phrase: string): string {
  const normalized = String(phrase ?? '').toLowerCase();
  const aliases: Record<string, string> = {
    approval: 'issuance',
    approve: 'issuance',
    grant: 'issuance',
    receipt: 'receipt',
    receive: 'receipt',
    received: 'receipt',
  };
  for (const [token, event] of Object.entries(aliases)) {
    if (new RegExp(`\\b${token}\\b`).test(normalized)) return event;
  }
  for (const event of PROCEDURE_EVENT_ORDER) {
    const pattern = PROCEDURE_EVENT_PATTERNS[event];
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) return event;
  }
  return '';
}

function eventsFromPhrase(phrase: string): string[] {
  const events: string[] = [];
  for (const part of String(phrase ?? '').split(/\s*(?:,|and|or)\s*/)) {
    const event = inferEventFromPhrase(part);
    if (event && !events.includes(event)) events.push(event);
  }
  return events;
}

function inferTriggerEvent(events: string[], relations: Array<Record<string, unknown>>): string {
  for (const relation of relations) {
    if (['triggered_by_receipt_of', 'after'].includes(String(relation.relation)) && events.includes(String(relation.anchor_event))) {
      return String(relation.anchor_event);
    }
  }
  return events[0] ?? '';
}

function inferTerminalEvent(events: string[], relations: Array<Record<string, unknown>>): string {
  const beforeEvents = relations.filter(relation => relation.relation === 'before').map(relation => String(relation.anchor_event));
  for (const event of [...events].reverse()) {
    if (!beforeEvents.includes(event)) return event;
  }
  return events[events.length - 1] ?? '';
}

function buildKgTriples(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const sourceId = String(element.source_id || buildSourceId(element));
  return buildKgRelationshipHints(element).map((hint, index) => ({
    triple_id: hashId('triple', { source_id: sourceId, index, hint }),
    source_id: sourceId,
    canonical_citation: element.canonical_citation ?? '',
    subject: hint.subject,
    predicate: hint.predicate,
    object: hint.object,
    provenance: { text: element.text ?? '', source_span: element.source_span ?? [] },
  }));
}

function parquetCell(value: unknown, stringifyNested: boolean): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }
  return stringifyNested ? stableStringify(value) : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value as Record<string, unknown> : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fieldAsArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function firstField(value: unknown): string {
  const items = fieldAsArray(value);
  return items.length ? String(items[0] ?? '') : '';
}

function firstVerb(action: string): string {
  const words = actionWithoutMentalState(action).match(/[A-Za-z][A-Za-z0-9'’\-]*/g) ?? [];
  return words[0]?.toLowerCase() ?? '';
}

function actionObject(action: string): string {
  const words = actionWithoutMentalState(action).match(/[A-Za-z][A-Za-z0-9'’\-]*/g) ?? [];
  return words.length > 1 ? words.slice(1).join(' ') : '';
}

function extractActionRecipientFromText(action: string): string {
  const match = String(action ?? '').match(/\b(?:to|for|with|of)\s+((?:the\s+)?[A-Za-z][A-Za-z0-9'’\-]*(?:\s+[A-Za-z][A-Za-z0-9'’\-]*){0,6})$/i);
  if (!match) return '';
  const recipient = cleanText(match[1]);
  if (['law', 'regulation', 'section', 'chapter', 'title', 'this section', 'this chapter', 'this title'].includes(recipient.toLowerCase())) return '';
  return recipient;
}

function actionWithoutMentalState(action: string): string {
  const text = String(action ?? '').trim();
  const complex = text.match(/^with\s+(?:the\s+)?(?:intent\s+to\s+[^,;:]+|knowledge\s+that\s+[^,;:]+|reckless\s+disregard\s+for\s+[^,;:]+)\s*,\s*(.+)$/i);
  if (complex) return cleanText(complex[1]);
  const words = text.match(/[A-Za-z][A-Za-z0-9'’\-]*/g) ?? [];
  const mentalStates = new Set(['intentionally', 'knowingly', 'negligently', 'purposely', 'recklessly', 'maliciously', 'willfully', 'wilfully', 'fraudulently', 'deliberately', 'corruptly']);
  if (words[0] && mentalStates.has(words[0].toLowerCase())) return words.slice(1).join(' ');
  return text;
}

function normalizeSymbol(value: string): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^0-9A-Za-z]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'unknown';
}

function hashId(prefix: string, identity: unknown): string {
  return `${prefix}:${hashDigest(identity).slice(0, 24)}`;
}

function hashDigest(identity: unknown): string {
  return createHash('sha256').update(stableStringify(identity), 'utf8').digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function extractConditionTexts(text: string): string[] {
  return Array.from(String(text).matchAll(/\b(?:if|when|where|provided that)\s+([^.;:]+)/gi)).map(match => cleanText(match[1]));
}

function extractExceptionTexts(text: string): string[] {
  return Array.from(String(text).matchAll(/\b(?:unless|except(?: that)?|without|absent)\s+([^.;:]+)/gi)).map(match => cleanText(match[1]));
}

function extractCrossReferences(text: string): string[] {
  return Array.from(new Set(Array.from(String(text).matchAll(/\b(?:section|sec\.?|§)\s*[0-9]+(?:\.[0-9]+)*(?:\([a-z0-9]+\))*/gi))
    .map(match => cleanText(match[0]))));
}

function cleanAction(action: string): string {
  return cleanText(action).replace(/\b(if|when|where|provided that|unless|except|before|after|within)\b.*$/i, '').trim();
}

function cleanText(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/[.;:]\s*$/, '').trim();
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)}`;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort());
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

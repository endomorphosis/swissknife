/**
 * Deontic legal-text parser/export compatibility layer.
 *
 * TypeScript port of the public surfaces called out from:
 * - deontic/utils/deontic_parser.py
 * - deontic/{exports,formula_builder,metrics}.py
 */

import { createHash } from 'node:crypto';

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

const SCHEMA_VERSION = 'deterministic_deontic_ts_v1';
const MODAL_RE = /\b(?<subject>(?:the\s+)?[A-Za-z][A-Za-z0-9'’\-\s]{0,80}?)\s+(?<modal>shall not|must not|may not|cannot|can not|shall|must|required to|is required to|are required to|may|can|is authorized to|are authorized to|is permitted to|are permitted to|is prohibited from|are prohibited from)\s+(?<action>.+?)(?=[.;:]|$)/i;

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

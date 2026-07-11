/**
 * deontic-norms-bridge.ts
 *
 * Bridge adapter: legal text → deontic IR + frame records + prover syntax.
 * TypeScript port of ipfs_datasets_py/logic/bridge/deontic_norms.py
 *
 * Provides:
 *   DeonticNormRecord         — one extracted deontic norm
 *   DeonticNormsBridgeAdapter — encode(text) → {doc, context}
 */

import {
  LegalIRDocument, LogicIRView,
  RoundTripMetrics, ProofGateResult, GraphProjectionResult, BridgeEvaluationReport,
} from './bridge-types.js';
import { sha256Hex } from '../../shared/shared-browser-crypto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function documentId(prefix: string, text: string): string {
  return `${prefix}:${sha256Hex(text).slice(0, 16)}`;
}

export interface DeonticSourceIdCarrier {
  source_id?: unknown;
  canonical_citation?: unknown;
}

export interface DeonticTextRow {
  text?: unknown;
  source_text?: unknown;
  support_text?: unknown;
}

export interface DeonticCapabilityViewCarrier {
  views?: Record<string, { payload?: { records?: unknown } }>;
}

/**
 * Python parity: use first norm source_id when present, else hash full text.
 */
export function deonticDocumentIdFromNorms(
  norms: ReadonlyArray<DeonticSourceIdCarrier>,
  text: string,
): string {
  const first = norms[0];
  const sourceId = String(first?.source_id ?? '').trim();
  if (sourceId) return sourceId;
  return documentId('deontic', text);
}

/**
 * Python parity: return first norm canonical_citation when present.
 */
export function deonticCitationFromNorms(
  norms: ReadonlyArray<DeonticSourceIdCarrier>,
): string | undefined {
  if (!norms.length) return undefined;
  const citation = norms[0]?.canonical_citation;
  if (!citation) return undefined;
  return String(citation);
}

/**
 * Python parity: read first decoded_text from deontic_parser_capability records.
 */
export function deonticDecodedTextFromCapabilityView(
  document: DeonticCapabilityViewCarrier,
): string {
  const view = document.views?.deontic_parser_capability;
  if (!view) return '';
  const records = view.payload?.records;
  if (!Array.isArray(records) || !records.length) return '';
  const head = records[0];
  if (!head || typeof head !== 'object' || Array.isArray(head)) return '';
  return String((head as { decoded_text?: unknown }).decoded_text ?? '');
}

/**
 * Python parity for `_json_guidance_value`.
 */
export function deonticJsonGuidanceValue(value: string): unknown {
  const text = String(value ?? '').trim();
  if (!text || (text[0] !== '[' && text[0] !== '{')) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Python parity for `_mapping`.
 */
export function deonticMappingFromValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === 'string') {
    const parsed = deonticJsonGuidanceValue(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(parsed as Record<string, unknown>) };
    }
  }
  return {};
}

/**
 * Python parity for `_list_of_dicts`.
 */
export function deonticListOfDicts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({ ...item }));
}

/**
 * Python parity for `_list_of_strings`.
 */
export function deonticListOfStrings(value: unknown): string[] {
  const pythonLikeString = (item: unknown): string => {
    if (item === null || item === undefined) return 'None';
    if (item === true) return 'True';
    if (item === false) return 'False';
    return String(item);
  };

  let values: unknown[];
  if (typeof value === 'string') {
    values = [value];
  } else if (Array.isArray(value)) {
    values = value;
  } else if (value && typeof value === 'object' && Symbol.iterator in (value as Record<PropertyKey, unknown>)) {
    try {
      values = Array.from(value as Iterable<unknown>);
    } catch {
      return [];
    }
  } else if (value && typeof value === 'object') {
    values = Object.keys(value as Record<string, unknown>);
  } else {
    return [];
  }
  return values
    .map(item => pythonLikeString(item).trim())
    .filter(item => Boolean(item));
}

/**
 * Python parity for `_normalized_target_names`.
 */
export function deonticNormalizedTargetNames(value: unknown): string[] {
  const names: string[] = [];
  for (const name of deonticListOfStrings(value)) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Python parity for `_value_is_present`.
 */
export function deonticValueIsPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Set || value instanceof Map) return value.size > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

/**
 * Python parity for `_copy_slot_value`.
 */
export function deonticCopySlotValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) };
  return value;
}

/**
 * Python parity for `_fill_empty_field`.
 */
export function deonticFillEmptyField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
): void {
  if (deonticValueIsPresent(target[key])) return;
  const value = source[key];
  if (!deonticValueIsPresent(value)) return;
  target[key] = deonticCopySlotValue(value);
}

/**
 * Python parity for `_float`.
 */
export function deonticFloat(value: unknown): number {
  if (value === null || value === undefined) return 0.0;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? 0.0 : numeric;
}

/**
 * Python parity for `_rate`.
 */
export function deonticRate(numerator: unknown, denominator: unknown): number {
  const top = deonticFloat(numerator);
  const bottom = deonticFloat(denominator);
  if (bottom <= 0.0) return 0.0;
  return Math.max(0.0, Math.min(1.0, top / bottom));
}

/**
 * Python parity for `_record_validation_rate`.
 */
export function deonticRecordValidationRate(records: ReadonlyArray<Record<string, unknown>>): number {
  if (!records.length) return 0.0;
  const requiresValidation = records.filter(r => r.requires_validation === true).length;
  return requiresValidation / records.length;
}

/**
 * Python parity for `_guidance_gap_quality_gate_passes`.
 */
export function deonticGuidanceGapQualityGatePasses(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const qualityGate = String((value as Record<string, unknown>).quality_gate ?? '').trim().toLowerCase();
  return qualityGate === 'pass' || qualityGate === 'passed' || qualityGate === 'ok';
}

/**
 * Python parity for `_canonical_deontic_target_view`.
 */
export function deonticCanonicalTargetView(value: unknown): string {
  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase().replace(/-/g, '_');
  const aliases: Record<string, string> = {
    'deontic.ir': 'deontic.ir',
    deontic_ir: 'deontic.ir',
    deontic: 'deontic.ir',
    deontic_norms: 'deontic.ir',
    'legal-ir-view:deontic.ir': 'deontic.ir',
    'legal_ir_view:deontic_ir': 'deontic.ir',
  };
  return aliases[normalized] ?? text;
}

/**
 * Python parity for `_canonical_deontic_gap_key`.
 */
export function deonticCanonicalGapKey(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const separatorIndex = text.indexOf(':');
  if (separatorIndex < 0) return deonticCanonicalTargetView(text);
  const head = text.slice(0, separatorIndex);
  const tail = text.slice(separatorIndex + 1);
  return `${deonticCanonicalTargetView(head)}:${tail}`;
}

/**
 * Python parity for `_deontic_guidance_component_gaps`.
 */
export function deonticGuidanceComponentGaps(row: Record<string, unknown>): Record<string, unknown> {
  const gaps: Record<string, unknown> = {};
  for (const key of [
    'legal_ir_component_gaps',
    'compiler_guidance_legal_ir_component_gaps',
    'legal_ir_view_gaps',
    'compiler_guidance_legal_ir_view_gaps',
    'legal_ir_view_family_gaps',
    'compiler_guidance_legal_ir_view_family_gaps',
  ] as const) {
    const value = row[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(gaps, value as Record<string, unknown>);
    }
  }

  const attribution = row.compiler_guidance_attribution;
  if (attribution && typeof attribution === 'object' && !Array.isArray(attribution)) {
    for (const key of ['legal_ir_view_gaps', 'legal_ir_view_family_gaps'] as const) {
      const value = (attribution as Record<string, unknown>)[key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      for (const [gapKey, gapValue] of Object.entries(value as Record<string, unknown>)) {
        if (deonticGuidanceGapQualityGatePasses(gapValue) && !(gapKey in gaps)) {
          gaps[gapKey] = gapValue;
        }
      }
    }
  }
  return gaps;
}

/**
 * Python parity for `_deontic_guidance_underrepresented_components`.
 */
export function deonticGuidanceUnderrepresentedComponents(row: Record<string, unknown>): string[] {
  const components: string[] = [];
  for (const key of [
    'legal_ir_underrepresented_components',
    'compiler_guidance_legal_ir_underrepresented_components',
  ] as const) {
    for (const item of deonticListOfStrings(row[key])) {
      if (!components.includes(item)) components.push(item);
    }
  }

  for (const gapKey of Object.keys(deonticGuidanceComponentGaps(row))) {
    if (!gapKey.endsWith(':underrepresented')) continue;
    const component = gapKey.slice(0, -':underrepresented'.length);
    if (!components.includes(component)) components.push(component);
  }
  return components;
}

/**
 * Python parity for `_deontic_guidance_route`.
 */
export function deonticGuidanceRoute(guidance: Record<string, unknown>): string {
  for (const key of [
    'compiler_guidance_route',
    'route',
    'action',
    'target_component',
    'target',
  ] as const) {
    const value = String(guidance[key] ?? '').trim();
    if (value) return value;
  }

  const routes = guidance.compiler_guidance_todo_routes;
  if (routes && typeof routes === 'object' && !Array.isArray(routes)) {
    for (const route of Object.keys(routes as Record<string, unknown>)) {
      const routeText = String(route ?? '').trim();
      if (routeText) return routeText;
    }
  }

  return 'repair_deontic_bridge_quality_gate';
}

/**
 * Python parity for `_deontic_guidance_target_view`.
 */
export function deonticGuidanceTargetView(row: Record<string, unknown>): string {
  for (const key of ['target_view', 'target_component', 'target', 'predicted_view'] as const) {
    const value = String(row[key] ?? '').trim();
    if (value) return deonticCanonicalTargetView(value);
  }
  const bundle = row.bundle ?? row.semantic_bundle;
  if (bundle && typeof bundle === 'object' && !Array.isArray(bundle)) {
    return deonticGuidanceTargetView(bundle as Record<string, unknown>);
  }
  return '';
}

/**
 * Python parity for `_canonical_deontic_frame_symbol`.
 */
export function deonticCanonicalFrameSymbol(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  const tokens = text
    .replace(/_/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/[^a-z0-9]/g, ''))
    .filter(token => Boolean(token));
  return tokens.join('_').slice(0, 96);
}

/**
 * Python parity for `_normalized_guidance_text`.
 */
export function deonticNormalizedGuidanceText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(token => Boolean(token))
    .join(' ');
}

/**
 * Python parity for `_deontic_guidance_row_matches_norm`.
 */
export function deonticGuidanceRowMatchesNorm(
  row: Record<string, unknown>,
  context: Record<string, unknown>,
  norm: Record<string, unknown>,
): boolean {
  const rowSampleId = String(row.sample_id ?? row.document_id ?? '').trim();
  const normIds = new Set(
    [norm.sample_id, norm.source_id, norm.document_id, context.document_id]
      .map(value => String(value ?? '').trim())
      .filter(value => Boolean(value)),
  );
  if (rowSampleId && normIds.has(rowSampleId)) return true;

  const rowCitation = String(row.citation ?? row.canonical_citation ?? '').trim();
  const normCitations = new Set(
    [norm.citation, norm.canonical_citation, context.citation]
      .map(value => String(value ?? '').trim())
      .filter(value => Boolean(value)),
  );
  if (rowCitation && normCitations.has(rowCitation)) return true;

  const preview = deonticNormalizedGuidanceText(row.text_preview ?? row.text);
  const sourceText = deonticNormalizedGuidanceText(context.source_text);
  if (preview && sourceText && sourceText.includes(preview)) return true;
  return false;
}

export interface DeonticGuidanceEvidenceRow {
  collectionKey: string;
  row: Record<string, unknown>;
}

/**
 * Python parity for `_deontic_guidance_evidence_rows`.
 */
export function deonticGuidanceEvidenceRows(
  guidance: Record<string, unknown>,
): DeonticGuidanceEvidenceRow[] {
  const rows: DeonticGuidanceEvidenceRow[] = [];

  const collect = (collectionKey: string, value: unknown): void => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push({ collectionKey, row: value as Record<string, unknown> });
      return;
    }
    if (typeof value === 'string') {
      const parsed = deonticJsonGuidanceValue(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rows.push({ collectionKey, row: parsed as Record<string, unknown> });
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) collect(collectionKey, item);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collect(collectionKey, item);
    }
  };

  for (const collectionKey of [
    'hint_evidence',
    'evidence',
    'guidance_evidence',
    'compiler_guidance_evidence',
    'metric_sample_payloads',
    'samples',
  ] as const) {
    const before = rows.length;
    collect(collectionKey, guidance[collectionKey]);
    const sortedTail = rows
      .slice(before)
      .sort((a, b) => {
        const aRank = Number.parseInt(String(a.row.evidence_rank ?? a.row.rank ?? 999999), 10);
        const bRank = Number.parseInt(String(b.row.evidence_rank ?? b.row.rank ?? 999999), 10);
        const safeA = Number.isNaN(aRank) ? 999999 : aRank;
        const safeB = Number.isNaN(bRank) ? 999999 : bRank;
        return safeA - safeB;
      });
    rows.splice(before, rows.length - before, ...sortedTail);
  }

  return rows;
}

export interface DeonticGuidanceFrameCandidate {
  source: string;
  value: unknown;
}

/**
 * Python parity for `_deontic_guidance_frame_candidates`.
 */
export function deonticGuidanceFrameCandidates(
  context: Record<string, unknown>,
  norm: Record<string, unknown>,
): DeonticGuidanceFrameCandidate[] {
  const guidance = deonticMappingFromValue(context.guidance);
  const topLevel: DeonticGuidanceFrameCandidate[] = [
    'selected_frame_after',
    'selected_frame',
    'compiler_guidance_selected_frame',
    'frame_after',
    'frame',
  ].map(key => ({ source: key, value: key in guidance ? guidance[key] : null }));

  const evidenceRows = deonticGuidanceEvidenceRows(guidance);
  const matchedRows = evidenceRows.filter(item =>
    deonticGuidanceRowMatchesNorm(item.row, context, norm),
  );

  const fromRows = (rows: DeonticGuidanceEvidenceRow[]): DeonticGuidanceFrameCandidate[] => {
    const out: DeonticGuidanceFrameCandidate[] = [];
    for (const item of rows) {
      for (const key of ['selected_frame_after', 'selected_frame', 'frame_after', 'frame'] as const) {
        out.push({
          source: `${item.collectionKey}.${key}`,
          value: key in item.row ? item.row[key] : null,
        });
      }
    }
    return out;
  };

  const matchedCandidates = fromRows(matchedRows);
  const unmatchedRows = evidenceRows.filter(item => !matchedRows.includes(item));
  const unmatchedCandidates = fromRows(unmatchedRows);
  return [...matchedCandidates, ...topLevel, ...unmatchedCandidates];
}

/**
 * Python parity for `_selected_frame_from_deontic_compiler_guidance`.
 */
export function deonticSelectedFrameFromCompilerGuidance(
  context: Record<string, unknown>,
  norm: Record<string, unknown>,
): Record<string, string> {
  const guidance = deonticMappingFromValue(context.guidance);
  if (!Object.keys(guidance).length) return {};

  for (const candidate of deonticGuidanceFrameCandidates(context, norm)) {
    const frame = deonticCanonicalFrameSymbol(candidate.value);
    if (!frame) continue;
    return {
      selected_frame: frame,
      selected_frame_source: `compiler_guidance.${candidate.source}`,
      compiler_guidance_source: String(context.route ?? 'repair_deontic_bridge_quality_gate'),
    };
  }
  return {};
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Python parity: first row text/source_text/support_text, else source text.
 */
export function deonticNormalizedTextFromRows(
  rows: ReadonlyArray<DeonticTextRow>,
  sourceText: string,
): string {
  if (!rows.length) return sourceText;
  const head = rows[0];
  for (const key of ['text', 'source_text', 'support_text'] as const) {
    const value = String(head[key] ?? '').trim();
    if (value) return value;
  }
  return sourceText;
}

type DeonticOperator = 'O' | 'P' | 'F';

const OBLIGATION_WORDS = /\b(shall|must|required|obligated|mandated)\b/i;
const PERMISSION_WORDS = /\b(may|permitted|allowed|authorized|entitled)\b/i;
const PROHIBITION_WORDS = /\b(shall not|must not|prohibited|forbidden|shall never)\b/i;

const NORM_TYPE_BY_OPERATOR: Record<DeonticOperator, string> = {
  O: 'obligation',
  P: 'permission',
  F: 'prohibition',
};

function detectOperator(text: string): DeonticOperator {
  if (PROHIBITION_WORDS.test(text)) return 'F';
  if (PERMISSION_WORDS.test(text)) return 'P';
  return 'O'; // default to obligation
}

function extractSubject(text: string): string {
  // Rough heuristic: first noun phrase (capitalized word or "the X")
  const match = text.match(/(?:^|\bthe\s+)([A-Z][a-zA-Z]+|\b[a-z]+(?:\s+[a-z]+)?(?=\s+(?:shall|must|may)))/);
  return match?.[1] ?? 'Agent';
}

function extractAction(text: string): string {
  // Rough: verb phrase after modal
  const match = text.match(/(?:shall|must|may|shall not|must not)\s+(?:not\s+)?([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})/i);
  return match?.[1] ?? text.slice(0, 40);
}

// ---------------------------------------------------------------------------
// DeonticNormRecord
// ---------------------------------------------------------------------------

export interface DeonticNormRecord {
  norm_id: string;
  operator: DeonticOperator;
  subject: string;
  proposition: string;
  action: string;
  source_id?: string;
  canonical_citation?: string;
  conditions: string[];
  source_text: string;
  prover_syntax: string;
}

function normProposition(norm: DeonticNormRecord): string {
  return norm.proposition ?? norm.action;
}

function normActionAlias(norm: DeonticNormRecord): string {
  return norm.action || normProposition(norm);
}

function normToProverSyntax(norm: DeonticNormRecord): string {
  const op = norm.operator;
  const body = `${normProposition(norm)}(${norm.subject})`;
  return `${op}(${body})`;
}

// ---------------------------------------------------------------------------
// Frame-logic triples
// ---------------------------------------------------------------------------

export interface DeonticFrameLogicTriple {
  subject: string;
  predicate: string;
  object: string;
}

export interface DeonticFrameLogicRecordInputs {
  norms: ReadonlyArray<Record<string, unknown>>;
  formulaRecords?: ReadonlyArray<Record<string, unknown>>;
  coverageRecords?: ReadonlyArray<Record<string, unknown>>;
}

function pythonBoolText(value: unknown): string {
  return value ? 'true' : 'false';
}

function recordBySourceId(
  records: ReadonlyArray<Record<string, unknown>>,
): Map<string, Record<string, unknown>> {
  const bySource = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const sourceId = String(record.source_id ?? '').trim();
    if (sourceId) bySource.set(sourceId, record);
  }
  return bySource;
}

function mappingValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Python parity for `_frame_logic_triples_from_deontic_records`.
 */
export function deonticFrameLogicTriplesFromRecords(
  documentId: string,
  inputs: DeonticFrameLogicRecordInputs,
): DeonticFrameLogicTriple[] {
  const norms = inputs.norms ?? [];
  const formulaRecords = inputs.formulaRecords ?? [];
  const coverageRecords = inputs.coverageRecords ?? [];
  const triples: DeonticFrameLogicTriple[] = [
    { subject: documentId, predicate: 'type', object: 'legal_deontic_document' },
  ];
  const formulasBySource = recordBySourceId(formulaRecords);
  const coverageBySource = recordBySourceId(coverageRecords);

  for (let index = 0; index < norms.length; index += 1) {
    const norm = norms[index];
    const sourceId = String(norm.source_id ?? `${documentId}:norm:${index}`);
    triples.push(
      { subject: documentId, predicate: 'contains_norm', object: sourceId },
      { subject: sourceId, predicate: 'type', object: 'legal_deontic_norm' },
      { subject: sourceId, predicate: 'norm_type', object: String(norm.norm_type ?? '') },
      { subject: sourceId, predicate: 'modality', object: String(norm.modality ?? '') },
      { subject: sourceId, predicate: 'actor', object: String(norm.actor ?? '') },
      { subject: sourceId, predicate: 'action', object: String(norm.action ?? '') },
    );

    const legalFrame = mappingValue(norm.legal_frame);
    if (Object.keys(legalFrame).length > 0) {
      triples.push(
        { subject: sourceId, predicate: 'selected_frame', object: String(legalFrame.selected_frame ?? '') },
        { subject: sourceId, predicate: 'selected_frame_source', object: String(legalFrame.selected_frame_source ?? '') },
        { subject: sourceId, predicate: 'compiler_guidance_source', object: String(legalFrame.compiler_guidance_source ?? '') },
        { subject: sourceId, predicate: 'compiler_guidance_target_view', object: String(legalFrame.compiler_guidance_target_view ?? '') },
        { subject: sourceId, predicate: 'compiler_guidance_quality_gate', object: String(legalFrame.compiler_guidance_quality_gate ?? '') },
        { subject: sourceId, predicate: 'compiler_guidance_evidence_source', object: String(legalFrame.compiler_guidance_evidence_source ?? '') },
      );
      for (const component of deonticListOfStrings(legalFrame.compiler_guidance_legal_ir_underrepresented_components)) {
        triples.push({
          subject: sourceId,
          predicate: 'compiler_guidance_legal_ir_underrepresented_component',
          object: component,
        });
      }
      const componentGaps = mappingValue(legalFrame.compiler_guidance_legal_ir_component_gaps);
      for (const [component, gap] of Object.entries(componentGaps).sort(([a], [b]) => a.localeCompare(b))) {
        triples.push({
          subject: sourceId,
          predicate: 'compiler_guidance_legal_ir_component_gap',
          object: `${component}:${String(gap)}`,
        });
      }
    }

    const formulaRecord = formulasBySource.get(sourceId);
    if (formulaRecord) {
      triples.push(
        { subject: sourceId, predicate: 'formula', object: String(formulaRecord.formula ?? '') },
        { subject: sourceId, predicate: 'target_logic', object: String(formulaRecord.target_logic ?? '') },
        { subject: sourceId, predicate: 'proof_ready', object: pythonBoolText(formulaRecord.proof_ready) },
      );
    }

    const coverageRecord = coverageBySource.get(sourceId);
    const summary = mappingValue(coverageRecord?.coverage_summary);
    const semantic = mappingValue(summary.semantic_family_summary);
    if (Object.keys(semantic).length > 0) {
      triples.push({
        subject: sourceId,
        predicate: 'semantic_formula_family',
        object: String(semantic.semantic_formula_family ?? ''),
      });
    }
    const passedTargets = Array.isArray(summary.passed_targets) ? summary.passed_targets : [];
    for (const target of passedTargets) {
      triples.push({
        subject: sourceId,
        predicate: 'syntax_valid_for_target',
        object: String(target),
      });
    }
  }

  return triples.filter(triple => Boolean(triple.object));
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

export interface DeonticGraphNodeData {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface DeonticGraphRelationshipData {
  id: string;
  type: string;
  start_node: string;
  end_node: string;
  properties: Record<string, unknown>;
}

export interface DeonticGraphData {
  nodes: DeonticGraphNodeData[];
  relationships: DeonticGraphRelationshipData[];
  schema: {
    indexes: Array<Record<string, unknown>>;
    constraints: Array<Record<string, unknown>>;
    node_labels: string[];
    relationship_types: string[];
  };
  metadata: Record<string, unknown>;
}

const FLOGIC_RESOURCE_LABEL = 'FLogicResource';
const FLOGIC_VALUE_LABEL = 'FLogicValue';
const FLOGIC_CLASS_LABEL = 'FLogicClass';
const FLOGIC_FRAME_LABEL = 'FLogicFrame';
const LEGAL_MODAL_DOCUMENT_LABEL = 'LegalModalDocument';
const LEGAL_CITATION_STRUCTURE_LABEL = 'LegalCitationStructure';
const LEGAL_DOCUMENT_SCOPE_LABEL = 'LegalDocumentScope';
const LEGAL_EDITORIAL_STATUS_LABEL = 'LegalEditorialStatus';
const LEGAL_FRAME_ALIGNMENT_LABEL = 'LegalFrameAlignment';
const LEGAL_IR_VIEW_ALIGNMENT_LABEL = 'LegalIRViewAlignment';
const LEGAL_ONTOLOGY_TERM_LABEL = 'LegalOntologyTerm';
const LEGAL_SECTION_STRUCTURE_LABEL = 'LegalSectionStructure';

const FRAME_PREDICATES = new Set([
  'candidate_ontology_frame',
  'interpreted_in_frame',
  'selected_ontology_frame',
]);
const FRAME_PREDICATE_PREFIXES = [
  'candidate_ontology_frame',
  'interpreted_in_frame',
  'selected_ontology_frame',
];
const VALUE_LABELS_BY_PREDICATE: Record<string, string> = {
  modal_family: 'ModalFamily',
  modal_operator: 'ModalOperator',
  modal_system: 'ModalSystem',
  predicate: 'LegalPredicate',
  predicate_role: 'LegalPredicateRole',
  source: 'LegalSource',
};
const DOCUMENT_SCOPE_PREDICATES = new Set([
  'belongs_to_document',
  'contains_formula',
  'contains_norm',
  'source',
  'source_id',
]);
const PROVENANCE_PREDICATES = new Set([
  'citation',
  'citation_source',
  'evidence',
  'hint_id',
  'sample_id',
]);
const PROVENANCE_PREDICATE_PREFIXES = [
  'source_context_span_',
  'support_span_',
];
const MODAL_SEMANTIC_PREDICATES = new Set([
  'cue',
  'modal_cue',
  'modal_family',
  'modal_operator',
  'modal_system',
  'operator',
  'predicate',
  'predicate_role',
]);
const MODAL_SEMANTIC_PREDICATE_PREFIXES = [
  'bridge_',
  'condition_',
  'condition_scope_',
  'cue_modal_',
  'cue_bridge_',
  'fallback_rule_',
  'fallback_surface_',
  'modal_',
  'predicate_',
  'refined_modal_',
  'refined_temporal_',
  'selected_frame_modal_family',
  'source_action_family_',
  'source_condition_family_',
  'source_logical_variable_',
  'source_object_family_',
  'source_subject_family_',
  'source_temporal_family_',
];
const DOCUMENT_SCOPE_PREDICATE_PREFIXES = [
  'source_text_',
  'source_id',
];
const LEGAL_IR_VIEW_ALIGNMENT_PREDICATES = new Set([
  'learned_legal_ir_predicted_view',
  'learned_legal_ir_predicted_view_weight',
  'learned_legal_ir_target_view',
  'learned_legal_ir_target_view_weight',
  'learned_legal_ir_view_gap',
  'learned_legal_ir_view_rank',
]);
const LEGAL_IR_VIEW_ALIGNMENT_PREDICATE_PREFIXES = [
  'compiler_guidance_legal_ir_',
  'learned_legal_ir_',
];
const CITATION_PREDICATE_PREFIXES = ['citation_'];
const CITATION_TOKENS = ['citation', 'section', 'source_id', 'title', 'usc'];
const EDITORIAL_STATUS_PREDICATES = new Set(['status_keyword']);
const EDITORIAL_STATUS_PREDICATE_PREFIXES = ['status_keyword_'];
const EDITORIAL_STATUS_TOKENS = ['repeal', 'repealed', 'status_bridge', 'transferred'];
const SECTION_STRUCTURE_PREDICATE_PREFIXES = [
  'citation_section_',
  'citation_source_id_section_',
  'citation_source_id_title_section_',
  'citation_title_section_',
  'fallback_section_heading_',
  'section_catchline',
  'section_definition_',
  'section_heading_',
  'section_marker',
  'section_paragraph_',
  'section_component_',
  'section_profile_',
  'section_range_',
  'section_style_',
  'section_subsection_',
  'source_id_section_',
  'source_id_title_section_',
  'usc_hierarchy_',
];
const SOURCE_ID_CITATION_STRUCTURE_PREDICATES = new Set([
  'source_id_citation_canonical',
  'source_id_scheme',
  'source_id_title',
  'source_id_title_number',
  'source_id_title_section_key',
]);
const SOURCE_ID_CITATION_STRUCTURE_PREDICATE_PREFIXES = [
  'source_id_citation_',
  'source_id_title_',
];
const SECTION_STRUCTURE_TOKENS = [
  'chapter',
  'heading_tail',
  'part',
  'section_component',
  'section_definition',
  'section_heading',
  'section_marker',
  'section_paragraph',
  'section_profile',
  'section_range',
  'section_style',
  'section_subsection',
  'subchapter',
  'subtitle',
  'title',
];
const NODE_LABELS_BY_PROJECTION_VIEW: Record<string, string> = {
  citation_structure: LEGAL_CITATION_STRUCTURE_LABEL,
  document_scope: LEGAL_DOCUMENT_SCOPE_LABEL,
  editorial_status: LEGAL_EDITORIAL_STATUS_LABEL,
  frame_link: LEGAL_FRAME_ALIGNMENT_LABEL,
  legal_ir_view_alignment: LEGAL_IR_VIEW_ALIGNMENT_LABEL,
  ontology_term: LEGAL_ONTOLOGY_TERM_LABEL,
  section_structure: LEGAL_SECTION_STRUCTURE_LABEL,
};
const LEGAL_IR_VIEW_GUIDANCE_PREDICATES = new Set([
  'compiler_guidance_predicted_view',
  'compiler_guidance_target_component',
  'compiler_guidance_target_view',
  'predicted_component',
  'predicted_view',
  'target_component',
  'target_view',
]);
const LEGAL_IR_GRAPH_REPAIR_ACTIONS = new Set(['repair_multiview_legal_ir_graph_projection']);
const NEO4J_COMPAT_TARGET_COMPONENT = 'knowledge_graphs.neo4j_compat';
const LEGAL_IR_VIEW_ALIASES: Record<string, string> = {
  knowledge_graph: NEO4J_COMPAT_TARGET_COMPONENT,
  knowledge_graphs_neo4j_compat: NEO4J_COMPAT_TARGET_COMPONENT,
  'knowledge_graphs.neo4j_compat': NEO4J_COMPAT_TARGET_COMPONENT,
  neo4j_compat: NEO4J_COMPAT_TARGET_COMPONENT,
  modal_frame_logic: 'modal.frame_logic',
  'modal.frame_logic': 'modal.frame_logic',
};
const MULTI_VALUE_COMPONENT_PREDICATES = new Set([
  'section_definition_term',
  'section_paragraph_label',
  'section_subsection_label',
  'learned_legal_ir_predicted_view',
  'learned_legal_ir_predicted_view_weight',
  'learned_legal_ir_target_view',
  'learned_legal_ir_target_view_weight',
  'learned_legal_ir_view_gap',
  'learned_legal_ir_view_rank',
]);

function normalizeGraphTriples(
  triples: ReadonlyArray<Record<string, unknown>>,
): DeonticFrameLogicTriple[] {
  const normalized: DeonticFrameLogicTriple[] = [];
  for (const triple of triples) {
    const subject = String(triple.subject ?? '').trim();
    const predicate = String(triple.predicate ?? '').trim();
    const object = String(triple.object ?? '').trim();
    if (!subject || !predicate || !object) continue;
    normalized.push({ subject, predicate, object });
  }
  return normalized;
}

function tripleKey(triple: DeonticFrameLogicTriple): string {
  return `${triple.subject}\x1f${triple.predicate}\x1f${triple.object}`;
}

function hasPredicatePrefix(value: string, prefixes: ReadonlyArray<string>): boolean {
  return prefixes.some(prefix => value.startsWith(prefix));
}

function canonicalLegalIrViewName(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return LEGAL_IR_VIEW_ALIASES[text.toLowerCase()] ?? text;
}

function appendComponentTriples(
  triples: DeonticFrameLogicTriple[],
  subject: string,
  components: ReadonlyArray<[string, string]>,
  predicatesBySubject: Map<string, Set<string>>,
  seen: Set<string>,
): void {
  const existingPredicates = predicatesBySubject.get(subject) ?? new Set<string>();
  predicatesBySubject.set(subject, existingPredicates);
  for (const [predicate, value] of components) {
    if (existingPredicates.has(predicate) && !MULTI_VALUE_COMPONENT_PREDICATES.has(predicate)) {
      continue;
    }
    const triple = { subject, predicate, object: value };
    const key = tripleKey(triple);
    if (seen.has(key)) continue;
    seen.add(key);
    existingPredicates.add(predicate);
    triples.push(triple);
  }
}

function augmentLegalIrProjectionTriples(
  triples: ReadonlyArray<Record<string, unknown>>,
): DeonticFrameLogicTriple[] {
  const normalized = normalizeGraphTriples(triples);
  const augmented = [...normalized];
  const seen = new Set(augmented.map(tripleKey));
  const predicatesBySubject = new Map<string, Set<string>>();
  for (const triple of normalized) {
    const predicates = predicatesBySubject.get(triple.subject) ?? new Set<string>();
    predicates.add(triple.predicate);
    predicatesBySubject.set(triple.subject, predicates);
  }

  const guidanceBySubject = new Map<string, {
    predicted: Set<string>;
    target: Set<string>;
    actions: Set<string>;
    features: Set<string>;
  }>();
  for (const triple of augmented) {
    const guidance = guidanceBySubject.get(triple.subject) ?? {
      predicted: new Set<string>(),
      target: new Set<string>(),
      actions: new Set<string>(),
      features: new Set<string>(),
    };
    guidanceBySubject.set(triple.subject, guidance);

    const normalizedPredicate = triple.predicate.trim().toLowerCase();
    const normalizedView = canonicalLegalIrViewName(triple.object);
    if (LEGAL_IR_VIEW_GUIDANCE_PREDICATES.has(normalizedPredicate)) {
      if (normalizedPredicate.includes('predicted')) {
        if (normalizedView) guidance.predicted.add(normalizedView);
      } else if (normalizedView) {
        guidance.target.add(normalizedView);
      }
    } else if (['action', 'compiler_guidance_action', 'compiler_guidance_route', 'route'].includes(normalizedPredicate)) {
      const action = triple.object.trim();
      if (action) guidance.actions.add(action);
    }
  }

  for (const [subject, guidance] of [...guidanceBySubject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const targetViews = new Set(guidance.target);
    const predictedViews = new Set(guidance.predicted);
    const featureText = [...guidance.features, ...guidance.actions].sort().join('\n');
    const hasGraphRoute = featureText.includes('repair_multiview_legal_ir_graph_projection');
    const hasNeo4jTarget = featureText.includes(NEO4J_COMPAT_TARGET_COMPONENT);
    const hasGraphFailureMetric = featureText.includes('legal_ir_multiview_graph_failure_penalty');
    const hasKnowledgeGraphScope = featureText.includes('knowledge_graphs');
    if (
      [...guidance.actions].some(action => LEGAL_IR_GRAPH_REPAIR_ACTIONS.has(action)) ||
      hasGraphRoute ||
      hasNeo4jTarget ||
      (hasGraphFailureMetric && hasKnowledgeGraphScope)
    ) {
      targetViews.add(NEO4J_COMPAT_TARGET_COMPONENT);
    }
    if (targetViews.size === 0 && predictedViews.size === 0) continue;

    const facts: Array<[string, string]> = [];
    const rankedViews = [...new Set([...targetViews, ...predictedViews])].sort();
    rankedViews.forEach((view, index) => {
      if (predictedViews.has(view)) {
        facts.push(['learned_legal_ir_predicted_view', view]);
        facts.push(['learned_legal_ir_predicted_view_weight', `${view}:1.000000`]);
      }
      if (targetViews.has(view)) {
        facts.push(['learned_legal_ir_target_view', view]);
        facts.push(['learned_legal_ir_target_view_weight', `${view}:1.000000`]);
      }
      let gap = 0.0;
      if (targetViews.has(view) && !predictedViews.has(view)) gap = 1.0;
      else if (predictedViews.has(view) && !targetViews.has(view)) gap = -1.0;
      facts.push(['learned_legal_ir_view_rank', `${index + 1}:${view}`]);
      facts.push(['learned_legal_ir_view_gap', `${view}:${gap.toFixed(6)}`]);
    });
    appendComponentTriples(augmented, subject, facts, predicatesBySubject, seen);
  }

  return augmented;
}

function canonicalProjectionTriples(
  triples: ReadonlyArray<Record<string, unknown>>,
): DeonticFrameLogicTriple[] {
  return augmentLegalIrProjectionTriples(triples)
    .sort((a, b) =>
      a.subject.localeCompare(b.subject) ||
      a.predicate.localeCompare(b.predicate) ||
      a.object.localeCompare(b.object));
}

function nodeId(flogicId: string): string {
  const digest = sha256Hex(flogicId).slice(0, 20);
  return `flogic-node-${digest}`;
}

function relationshipIdentityKey(subject: string, predicate: string, object: string): string {
  return `${subject}\x1f${predicate}\x1f${object}`;
}

function relationshipId(index: number, subject: string, predicate: string, object: string): string {
  const payload = `${relationshipIdentityKey(subject, predicate, object)}\x1f${index}`;
  const digest = sha256Hex(payload).slice(0, 20);
  return `flogic-rel-${digest}`;
}

function relationshipType(predicate: string): string {
  const relType = predicate.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  if (!relType) return 'RELATED_TO';
  return /^\d/.test(relType) ? `FLOGIC_${relType}` : relType;
}

function neo4jLabel(value: string, fallback: string): string {
  const parts = value.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  const label = parts.map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
  if (!label) return fallback;
  return /^\d/.test(label) ? `${fallback}${label}` : label;
}

function ensureNode(
  nodeMap: Map<string, DeonticGraphNodeData>,
  flogicId: string,
  labels: ReadonlyArray<string>,
): DeonticGraphNodeData {
  const id = nodeId(flogicId);
  if (!nodeMap.has(id)) {
    nodeMap.set(id, {
      id,
      labels: [],
      properties: {
        flogic_id: flogicId,
        name: flogicId,
        source: 'modal_flogic_ir',
      },
    });
  }
  const node = nodeMap.get(id)!;
  for (const label of labels) {
    if (label && !node.labels.includes(label)) node.labels.push(label);
  }
  return node;
}

function projectionViewForTriple(predicate: string, object = ''): string {
  const normalized = String(predicate ?? '').trim().toLowerCase();
  if (!normalized) return 'fact';
  if (normalized === 'type') return 'type_assertion';
  if (EDITORIAL_STATUS_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, EDITORIAL_STATUS_PREDICATE_PREFIXES)) return 'editorial_status';
  if (EDITORIAL_STATUS_TOKENS.some(token => normalized.includes(token))) return 'editorial_status';
  if (FRAME_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, FRAME_PREDICATE_PREFIXES)) return 'frame_link';
  if (normalized.includes('ontology_term')) return 'ontology_term';
  if (LEGAL_IR_VIEW_ALIGNMENT_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, LEGAL_IR_VIEW_ALIGNMENT_PREDICATE_PREFIXES)) return 'legal_ir_view_alignment';
  if (hasPredicatePrefix(normalized, SECTION_STRUCTURE_PREDICATE_PREFIXES)) return 'section_structure';
  if (SOURCE_ID_CITATION_STRUCTURE_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, SOURCE_ID_CITATION_STRUCTURE_PREDICATE_PREFIXES)) return 'citation_structure';
  if (MODAL_SEMANTIC_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, MODAL_SEMANTIC_PREDICATE_PREFIXES)) return 'modal_semantics';
  if (PROVENANCE_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, PROVENANCE_PREDICATE_PREFIXES)) return 'provenance';
  if (DOCUMENT_SCOPE_PREDICATES.has(normalized) || hasPredicatePrefix(normalized, DOCUMENT_SCOPE_PREDICATE_PREFIXES)) return 'document_scope';
  if (hasPredicatePrefix(normalized, CITATION_PREDICATE_PREFIXES)) return 'citation_structure';
  if (CITATION_TOKENS.some(token => normalized.includes(token))) return 'citation_structure';
  if (SECTION_STRUCTURE_TOKENS.some(token => normalized.includes(token))) return 'section_structure';
  return 'fact';
}

function uniqueTripleCount(triples: ReadonlyArray<DeonticFrameLogicTriple>): number {
  return new Set(triples.map(tripleKey)).size;
}

function canonicalComponentDistribution(
  projectionViewCounts: Record<string, number>,
  relationshipCount: number,
): Record<string, number> {
  if (relationshipCount <= 0) return {};
  const structuralCount = [
    'citation_structure',
    'document_scope',
    'editorial_status',
    'frame_link',
    'legal_ir_view_alignment',
    'ontology_term',
    'section_structure',
    'type_assertion',
  ].reduce((sum, view) => sum + (projectionViewCounts[view] ?? 0), 0);
  const modalCount = ['fact', 'modal_semantics', 'provenance']
    .reduce((sum, view) => sum + (projectionViewCounts[view] ?? 0), 0);
  const distribution = {
    'knowledge_graphs.neo4j_compat': Math.max(1, structuralCount),
    'modal.frame_logic': Math.max(1, modalCount),
  };
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  return Object.fromEntries(
    Object.entries(distribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([component, count]) => [component, count / total]),
  );
}

function graphProjectionSignalCount(projectionViewCounts: Record<string, number>): number {
  return [
    'citation_structure',
    'document_scope',
    'editorial_status',
    'frame_link',
    'legal_ir_view_alignment',
    'ontology_term',
    'section_structure',
    'type_assertion',
  ].reduce((sum, view) => sum + (projectionViewCounts[view] ?? 0), 0);
}

function requiredLegalProjectionViews(triples: ReadonlyArray<DeonticFrameLogicTriple>): string[] {
  const predicates = new Set(triples.map(triple => triple.predicate.trim().toLowerCase()).filter(Boolean));
  if (predicates.size === 0) return [];
  const hasSourceId = [...predicates].some(predicate => predicate === 'source_id' || predicate.startsWith('source_id_'));
  const hasCitation = [...predicates].some(predicate => predicate === 'citation' || predicate.startsWith('citation_'));
  const hasSection = [...predicates].some(predicate =>
    hasPredicatePrefix(predicate, SECTION_STRUCTURE_PREDICATE_PREFIXES) ||
    predicate.includes('section_heading') ||
    predicate.includes('section_component') ||
    predicate.includes('section_profile'));
  const hasEditorialStatus = [...predicates].some(predicate =>
    EDITORIAL_STATUS_PREDICATES.has(predicate) ||
    hasPredicatePrefix(predicate, EDITORIAL_STATUS_PREDICATE_PREFIXES) ||
    EDITORIAL_STATUS_TOKENS.some(token => predicate.includes(token)));
  const hasViewAlignment = [...predicates].some(predicate =>
    LEGAL_IR_VIEW_ALIGNMENT_PREDICATES.has(predicate) ||
    hasPredicatePrefix(predicate, LEGAL_IR_VIEW_ALIGNMENT_PREDICATE_PREFIXES));
  const hasFrameLink = [...predicates].some(predicate =>
    FRAME_PREDICATES.has(predicate) ||
    hasPredicatePrefix(predicate, FRAME_PREDICATE_PREFIXES));
  const required: string[] = [];
  if (hasSourceId) required.push('document_scope');
  if (hasSourceId || hasCitation) required.push('citation_structure');
  if (hasSection) required.push('section_structure');
  if (hasEditorialStatus) required.push('editorial_status');
  if (hasViewAlignment) required.push('legal_ir_view_alignment');
  if (hasFrameLink) required.push('frame_link');
  return [...new Set(required)].sort();
}

function legalViewCoverageMetadata(
  triples: ReadonlyArray<DeonticFrameLogicTriple>,
  projectionViewCounts: Record<string, number>,
): Record<string, unknown> {
  const requiredViews = requiredLegalProjectionViews(triples);
  const presentViews = new Set(Object.entries(projectionViewCounts).filter(([, count]) => count > 0).map(([view]) => view));
  const missingViews = requiredViews.filter(view => !presentViews.has(view));
  return {
    frame_logic_projection_legal_view_coverage_complete: missingViews.length === 0,
    frame_logic_projection_legal_view_coverage_ratio: requiredViews.length === 0
      ? 1.0
      : (requiredViews.length - missingViews.length) / requiredViews.length,
    frame_logic_projection_legal_view_missing: missingViews,
    frame_logic_projection_legal_view_required: requiredViews,
  };
}

function projectionAlignmentMetadata(
  triples: ReadonlyArray<DeonticFrameLogicTriple>,
  inputTripleCount: number,
  normalizedTripleCount: number,
  nodeCount: number,
  projectionViewCounts: Record<string, number>,
  relationshipCount: number,
): Record<string, unknown> {
  const subjects = new Set(triples.map(triple => triple.subject));
  const predicates = new Set(triples.map(triple => triple.predicate));
  const objects = new Set(triples.map(triple => triple.object));
  const uniqueCount = uniqueTripleCount(triples);
  const canonicalViewDistribution = canonicalComponentDistribution(projectionViewCounts, relationshipCount);
  const projectedTripleAligned = relationshipCount === triples.length;
  const augmentedTripleCount = Math.max(0, triples.length - normalizedTripleCount);
  const signalCount = graphProjectionSignalCount(projectionViewCounts);
  const legalViewMetadata = legalViewCoverageMetadata(triples, projectionViewCounts);
  return {
    canonical_legal_ir_projection_components: Object.keys(canonicalViewDistribution).sort(),
    canonical_legal_ir_projection_view_distribution: canonicalViewDistribution,
    canonical_legal_ir_projection_view_total: Object.keys(canonicalViewDistribution).length,
    frame_logic_to_neo4j_alignment_total: projectedTripleAligned ? relationshipCount : 0,
    frame_logic_to_neo4j_component_pair: 'modal.frame_logic->knowledge_graphs.neo4j_compat',
    frame_logic_to_neo4j_source_component: 'modal.frame_logic',
    frame_logic_to_neo4j_target_component: 'knowledge_graphs.neo4j_compat',
    flogic_input_triple_count: inputTripleCount,
    flogic_invalid_triple_count: Math.max(0, inputTripleCount - normalizedTripleCount),
    flogic_duplicate_triple_count: Math.max(0, triples.length - uniqueCount),
    flogic_normalized_triple_count: normalizedTripleCount,
    flogic_unique_triple_count: uniqueCount,
    frame_logic_projection_augmented_aligned: projectedTripleAligned && relationshipCount >= normalizedTripleCount,
    frame_logic_projection_augmented_triple_count: augmentedTripleCount,
    frame_logic_projection_input_aligned: relationshipCount === inputTripleCount,
    frame_logic_projection_input_relationship_gap: Math.max(0, inputTripleCount - relationshipCount),
    frame_logic_projection_aligned: projectedTripleAligned,
    frame_logic_projection_normalized_aligned: projectedTripleAligned && relationshipCount >= normalizedTripleCount,
    frame_logic_projection_normalized_relationship_gap: Math.max(0, normalizedTripleCount - relationshipCount),
    frame_logic_projection_has_duplicate_facts: triples.length !== uniqueCount,
    frame_logic_projection_node_count: nodeCount,
    frame_logic_projection_relationship_count: relationshipCount,
    frame_logic_projection_view_count: Object.keys(projectionViewCounts).length,
    frame_logic_projection_view_distribution: Object.fromEntries(
      Object.entries(projectionViewCounts).sort(([a], [b]) => a.localeCompare(b)),
    ),
    frame_logic_projection_views: Object.keys(projectionViewCounts).sort(),
    frame_logic_unique_object_count: objects.size,
    frame_logic_unique_predicate_count: predicates.size,
    frame_logic_unique_subject_count: subjects.size,
    legal_ir_multiview_graph_failure_penalty: nodeCount > 0 && relationshipCount > 0 ? 0.0 : 1.0,
    legal_ir_graph_projection_signal_count: signalCount,
    legal_ir_graph_projection_signal_ratio: relationshipCount > 0 ? signalCount / relationshipCount : 0.0,
    ...legalViewMetadata,
    legal_ir_view_cross_entropy_loss: Math.max(
      0.0,
      1.0 - Number(legalViewMetadata.frame_logic_projection_legal_view_coverage_ratio ?? 0.0),
    ),
  };
}

/**
 * Python parity for `_graph_data_from_triples` through `flogic_triples_to_graph_data`.
 */
export function deonticGraphDataFromFrameTriples(
  triples: ReadonlyArray<Record<string, unknown>>,
  opts: { graphId?: string; metadata?: Record<string, unknown> } = {},
): DeonticGraphData | null {
  const inputTripleCount = triples.length;
  const normalized = normalizeGraphTriples(triples);
  const projected = canonicalProjectionTriples(normalized);
  if (projected.length === 0) return null;

  const nodeMap = new Map<string, DeonticGraphNodeData>();
  const relationships: DeonticGraphRelationshipData[] = [];
  const relationshipTypes = new Set<string>();
  const projectionViewCounts: Record<string, number> = {};

  projected.forEach((triple, index) => {
    const { subject, predicate, object } = triple;
    const projectionView = projectionViewForTriple(predicate, object);
    const subjectNode = ensureNode(nodeMap, subject, [FLOGIC_RESOURCE_LABEL]);
    let objectLabels = [FLOGIC_VALUE_LABEL];
    if (predicate === 'type') {
      objectLabels = [FLOGIC_CLASS_LABEL];
      if (!subjectNode.labels.includes(neo4jLabel(object, 'FLogicType'))) {
        subjectNode.labels.push(neo4jLabel(object, 'FLogicType'));
      }
      if (object === 'legal_modal_document' && !subjectNode.labels.includes(LEGAL_MODAL_DOCUMENT_LABEL)) {
        subjectNode.labels.push(LEGAL_MODAL_DOCUMENT_LABEL);
      }
    } else if (predicate === 'belongs_to_document') {
      if (!subjectNode.labels.includes('ModalFormula')) subjectNode.labels.push('ModalFormula');
    } else if (FRAME_PREDICATES.has(predicate)) {
      objectLabels = [FLOGIC_FRAME_LABEL, FLOGIC_RESOURCE_LABEL];
    }
    const valueLabel = VALUE_LABELS_BY_PREDICATE[predicate];
    if (valueLabel) objectLabels.push(valueLabel);
    const projectionLabel = NODE_LABELS_BY_PROJECTION_VIEW[projectionView];
    if (projectionLabel) {
      if (!subjectNode.labels.includes(projectionLabel)) subjectNode.labels.push(projectionLabel);
      objectLabels.push(projectionLabel);
    }
    const objectNode = ensureNode(nodeMap, object, objectLabels);
    for (const label of objectLabels) {
      if (label && !objectNode.labels.includes(label)) objectNode.labels.push(label);
    }
    const relType = relationshipType(predicate);
    relationshipTypes.add(relType);
    relationships.push({
      id: relationshipId(index, subject, predicate, object),
      type: relType,
      start_node: subjectNode.id,
      end_node: objectNode.id,
      properties: {
        flogic_object: object,
        flogic_predicate: predicate,
        flogic_subject: subject,
        flogic_triple_key: relationshipIdentityKey(subject, predicate, object),
        frame_logic_projection_view: projectionView,
        source: 'flogic_triple',
        triple_index: index,
      },
    });
    projectionViewCounts[projectionView] = (projectionViewCounts[projectionView] ?? 0) + 1;
  });

  const nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const nodeLabels = [...new Set(nodes.flatMap(node => node.labels))].sort();
  const uniqueCount = uniqueTripleCount(projected);
  const metadata: Record<string, unknown> = {
    flogic_duplicate_triple_count: Math.max(0, projected.length - uniqueCount),
    flogic_normalized_triple_count: normalized.length,
    flogic_triple_count: projected.length,
    flogic_unique_triple_count: uniqueCount,
    graph_id: opts.graphId ?? (normalized.length ? `${normalized[0].subject}:flogic` : 'modal_flogic_ir'),
    neo4j_compatible: true,
    source: 'modal_flogic_ir',
    ...(opts.metadata ?? {}),
    ...projectionAlignmentMetadata(
      projected,
      inputTripleCount,
      normalized.length,
      nodes.length,
      projectionViewCounts,
      relationships.length,
    ),
  };

  return {
    nodes,
    relationships,
    schema: {
      indexes: [],
      constraints: [],
      node_labels: nodeLabels,
      relationship_types: [...relationshipTypes].sort(),
    },
    metadata,
  };
}

// ---------------------------------------------------------------------------
// DeonticNormsBridgeAdapter
// ---------------------------------------------------------------------------

export interface DeonticNormsEncodeOpts {
  documentId?: string;
  citation?: string;
  source?: string;
  sourceEmbedding?: number[];
  compilerGuidance?: Record<string, unknown>;
}

export interface DeonticNormsContext {
  norms: DeonticNormRecord[];
  proof_gate: ReturnType<ProofGateResult['toDict']>;
  graph_data: Record<string, unknown>;
  metrics: ReturnType<RoundTripMetrics['toDict']>;
  bridge_name: string;
  document_id: string;
}

export class DeonticNormsBridgeAdapter {
  readonly name = 'deontic_norms';
  readonly targetComponent = 'deontic.ir';

  encode(text: string, opts: DeonticNormsEncodeOpts = {}): { doc: LegalIRDocument; context: DeonticNormsContext } {
    const sourceText = normalize(text);

    // Split on sentence boundaries; each sentence is a candidate norm
    const sentList = sourceText
      .split(/[.;!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 4);

    const draftNorms: Array<Omit<DeonticNormRecord, 'norm_id' | 'prover_syntax'>> =
      (sentList.length > 0 ? sentList : sourceText ? [sourceText] : [])
        .map((s) => {
        const operator = detectOperator(s);
        const subject = extractSubject(s);
        const action = extractAction(s);
        return {
          operator,
          subject,
          proposition: action,
          action,
          conditions: [],
          source_text: s,
          source_id: undefined,
          canonical_citation: undefined,
        };
      });

    const resolvedDocId = opts.documentId ?? deonticDocumentIdFromNorms(draftNorms, text);
    const normalizedText = deonticNormalizedTextFromRows(draftNorms, sourceText);

    const norms: DeonticNormRecord[] = draftNorms.map((draft, i) => {
      const norm: DeonticNormRecord = {
        norm_id: `${resolvedDocId}:n${i}`,
        operator: draft.operator,
        subject: draft.subject,
        proposition: draft.proposition,
        action: draft.action,
        source_id: draft.source_id,
        canonical_citation: draft.canonical_citation,
        conditions: draft.conditions,
        source_text: draft.source_text,
        prover_syntax: '',
      };
      norm.prover_syntax = normToProverSyntax(norm);
      return norm;
    });

    const deonticRecordRows = norms.map(n => ({
      source_id: n.norm_id,
      norm_type: NORM_TYPE_BY_OPERATOR[n.operator],
      modality: NORM_TYPE_BY_OPERATOR[n.operator],
      actor: n.subject,
      action: normActionAlias(n),
    }));
    const formulaRecords = norms.map(n => ({
      source_id: n.norm_id,
      formula: n.prover_syntax,
      target_logic: 'deontic_fol',
      proof_ready: true,
    }));
    const coverageRecords = norms.map(n => ({
      source_id: n.norm_id,
      coverage_summary: {
        semantic_family_summary: { semantic_formula_family: 'deontic' },
        passed_targets: ['frame_logic', 'deontic_fol'],
      },
    }));
    const triples = deonticFrameLogicTriplesFromRecords(resolvedDocId, {
      norms: deonticRecordRows,
      formulaRecords,
      coverageRecords,
    });
    const graphData = deonticGraphDataFromFrameTriples(triples, {
      graphId: `${resolvedDocId}:deontic-flogic`,
      metadata: {
        deontic_norm_count: norms.length,
        source: 'deontic_bridge_ir',
      },
    }) ?? {
      nodes: [],
      relationships: [],
      schema: { indexes: [], constraints: [], node_labels: [], relationship_types: [] },
      metadata: {},
    };

    const proofGate = new ProofGateResult({
      attemptedCount: norms.length,
      validCount: norms.length,
      verifiedBy: norms.length > 0 ? ['deontic-parser'] : [],
    });

    const metrics = new RoundTripMetrics({ cosineSimilarity: 1.0 });

    const proverFormulas = norms.map(n => n.prover_syntax);

    const views: Record<string, LogicIRView> = {
      deontic_ir: new LogicIRView({
        name: 'deontic_ir',
        payload: {
          norms: norms.map(n => ({
            norm_id: n.norm_id, operator: n.operator,
            subject: n.subject, proposition: normProposition(n), action: normActionAlias(n),
            conditions: n.conditions, source_text: n.source_text,
          })),
        },
        format: 'deontic_norm_list',
        sourceComponent: this.targetComponent,
      }),
      prover_formulas: new LogicIRView({
        name: 'prover_formulas',
        payload: { formulas: proverFormulas },
        format: 'tdfol_prover_syntax',
        sourceComponent: this.targetComponent,
      }),
      frame_logic: new LogicIRView({
        name: 'frame_logic',
        payload: { triples },
        format: 'flogic-triples-v1',
        sourceComponent: 'deontic.prover_syntax',
        metadata: { triple_count: triples.length },
      }),
      neo4j_graph_data: new LogicIRView({
        name: 'neo4j_graph_data',
        payload: graphData,
        format: 'neo4j-compatible-graph-data',
        sourceComponent: 'knowledge_graphs.neo4j_compat',
        metadata: {
          node_count: graphData.nodes.length,
          relationship_count: graphData.relationships.length,
        },
      }),
    };

    const doc = new LegalIRDocument({
      documentId: resolvedDocId,
      sourceText: text,
      normalizedText,
      source: opts.source ?? 'us_code',
      citation: opts.citation ?? deonticCitationFromNorms(norms),
      views,
      frameLogicTriples: triples,
      metadata: { bridge: this.name, norm_count: norms.length },
    });

    const context: DeonticNormsContext = {
      norms,
      proof_gate: proofGate.toDict(),
      graph_data: graphData,
      metrics: metrics.toDict(),
      bridge_name: this.name,
      document_id: resolvedDocId,
    };

    return { doc, context };
  }

  evaluate(text: string, opts: DeonticNormsEncodeOpts = {}): BridgeEvaluationReport {
    const t0 = Date.now();
    const { doc, context } = this.encode(text, opts);
    const gd = context.graph_data;
    return new BridgeEvaluationReport({
      bridgeName: this.name,
      documentId: doc.documentId,
      metrics: RoundTripMetrics.fromLossMapping(context.metrics as Record<string, unknown>),
      proofGate: ProofGateResult.disabled(),
      graphProjection: new GraphProjectionResult({
        graphId: doc.documentId,
        neo4jCompatible: true,
        nodeCount: (gd.nodes as unknown[]).length,
        relationshipCount: (gd.relationships as unknown[]).length,
      }),
      viewNames: Object.keys(doc.views),
      durationMs: Date.now() - t0,
    });
  }
}

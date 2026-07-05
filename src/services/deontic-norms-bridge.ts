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

import { createHash } from 'node:crypto';
import {
  LegalIRDocument, LogicIRView,
  RoundTripMetrics, ProofGateResult, GraphProjectionResult, BridgeEvaluationReport,
} from './bridge-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function documentId(prefix: string, text: string): string {
  return `${prefix}:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)}`;
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
  ].map(key => ({ source: key, value: guidance[key] }));

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

function deonticFrameTriples(
  docId: string,
  norms: DeonticNormRecord[],
): Array<Record<string, string>> {
  const triples: Array<Record<string, string>> = [];
  for (const norm of norms) {
    triples.push({ subject: docId, predicate: 'hasNorm', object: norm.norm_id });
    triples.push({ subject: norm.norm_id, predicate: 'hasOperator', object: norm.operator });
    triples.push({ subject: norm.norm_id, predicate: 'hasSubject', object: norm.subject });
    triples.push({ subject: norm.norm_id, predicate: 'hasProposition', object: normProposition(norm) });
    triples.push({ subject: norm.norm_id, predicate: 'hasAction', object: normActionAlias(norm) });
  }
  return triples;
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

function deonticGraphData(
  docId: string,
  norms: DeonticNormRecord[],
): Record<string, unknown> {
  const opLabel: Record<DeonticOperator, string> = { O: 'Obligation', P: 'Permission', F: 'Prohibition' };
  const nodes = [
    { id: docId, label: 'Document', properties: {} },
    ...norms.map(n => ({
      id: n.norm_id,
      label: opLabel[n.operator],
      properties: {
        subject: n.subject,
        proposition: normProposition(n).slice(0, 60),
        action: normActionAlias(n).slice(0, 60),
        operator: n.operator,
      },
    })),
  ];
  const relationships = norms.map(n => ({
    source: docId,
    target: n.norm_id,
    type: 'HAS_NORM',
  }));
  return { nodes, relationships };
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

    const triples = deonticFrameTriples(resolvedDocId, norms);
    const graphData = deonticGraphData(resolvedDocId, norms);

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
        format: 'frame_logic_triples',
        sourceComponent: this.targetComponent,
      }),
      neo4j_graph_data: new LogicIRView({
        name: 'neo4j_graph_data',
        payload: graphData,
        format: 'neo4j_graph',
        sourceComponent: this.targetComponent,
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

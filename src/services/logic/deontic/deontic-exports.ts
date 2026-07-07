/**
 * Deontic Exports — T-253 (Sprint 56)
 *
 * Port of ipfs_datasets_py/logic/deontic/exports.py (5134L — key API only)
 *
 * Summary and reporting functions for deontic norm IR quality diagnostics.
 * The Python original works with typed `LegalNormIR` objects.  This port
 * accepts generic record/dict inputs where older callers have not migrated to
 * the typed IR yet.
 */

import { buildDeonticFormulaRecordFromIR } from './deontic-formula-builder.js';
import {
  buildDecodedPhraseAuditRecords,
  buildDecoderSlotSupportMap,
} from '../../deontic/decoder-provenance.js';
import {
  decodeLegalNormIR,
  decodedPhraseSlotTextMap,
} from '../../deontic/legal-norm-decoder.js';
import {
  DEFAULT_IR_PROVENANCE_SLOTS,
  legalNormIRBlockers,
  legalNormIRDecoderRequiresValidation,
  legalNormIRProofReady,
  legalNormIRSlotProvenance,
  legalNormIRToDict,
  parserElementToIR,
  type LegalNormIR,
} from '../../deontic/legal-norm-ir.js';
import {
  ALL_PROVER_TARGETS,
  ProverSyntaxBuilder,
  ProverSyntaxValidator,
  type ProverTarget,
  type ProverTargetSyntaxRecord,
} from '../../deontic/prover-syntax-builder.js';

// ---------------------------------------------------------------------------
// Shared record types
// ---------------------------------------------------------------------------

/** Generic LegalNormIR-like record (duck-typed). */
export interface NormRecord {
  sourceId?: string;
  normType?: string;
  modality?: string;
  formula?: string;
  proofReady?: boolean;
  requiresValidation?: boolean;
  repairRequired?: boolean;
  blockers?: string[];
  [key: string]: unknown;
}

/** A parser capability profile row. */
export interface ParserCapabilityProfileRecord {
  parserCapabilityProfileId: string;
  sourceId: string;
  targetLogic: string;
  capabilityFamily: string;
  normType: string;
  modality: string;
  formula: string;
  formulaProofReady: boolean;
  requiresValidation: boolean;
  repairRequired: boolean;
  blockers: string[];
  checkedSlots: string[];
  groundedSlots: string[];
  missingSlots: string[];
  sourceGroundedSlotRate: number;
}

/** A phase-8 quality summary row. */
export interface Phase8QualityRecord {
  family: string;
  total: number;
  proofReady: number;
  repairRequired: number;
  proofReadyRate: number;
  coverageRate: number;
}

/** Prover syntax target coverage row. */
export interface ProverSyntaxTargetCoverageRecord {
  proverbTarget: string;
  totalNorms: number;
  proofReadyNorms: number;
  coverageRate: number;
  status: 'covered' | 'partial' | 'missing';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stableId(...parts: string[]): string {
  const combined = parts.filter(Boolean).join('::');
  // Simple deterministic hash
  let h = 0x811c9dc5;
  for (const ch of combined) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function capabilityFamily(norm: NormRecord): string {
  const modality = (norm.modality ?? '').toLowerCase();
  if (/oblig|must|shall/.test(modality)) return 'obligation';
  if (/permit|may|allow/.test(modality))  return 'permission';
  if (/prohib|forbid/.test(modality))     return 'prohibition';
  return norm.normType ?? 'unknown';
}

function defaultSlots(): string[] {
  return ['actor', 'action', 'condition', 'resource', 'modality'];
}

function slotAliasNames(slot: string): string[] {
  if (slot === 'action') return ['action', 'proposition'];
  if (slot === 'proposition') return ['proposition', 'action'];
  return [slot];
}

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

function slotValueWithAlias(norm: NormRecord, slot: string): unknown {
  for (const alias of slotAliasNames(slot)) {
    const value = norm[alias];
    if (hasValue(value)) return value;
  }
  return undefined;
}

function hasSlotWithAlias(slotSet: Set<string>, slot: string): boolean {
  return slotAliasNames(slot).some(alias => slotSet.has(alias));
}

function slotsAliasMatch(left: string, right: string): boolean {
  return slotAliasNames(left).some(alias => slotAliasNames(right).includes(alias));
}

function groundedSlots(norm: NormRecord, slots: string[]): string[] {
  return slots.filter(slot => hasValue(slotValueWithAlias(norm, slot)));
}

// ---------------------------------------------------------------------------
// buildDeterministicParserCapabilityProfileRecord
// ---------------------------------------------------------------------------

/**
 * Build a source-grounded parser capability profile row for one norm.
 *
 * TypeScript port of `build_deterministic_parser_capability_profile_record()`
 * from `ipfs_datasets_py/logic/deontic/exports.py`.
 */
export function buildDeterministicParserCapabilityProfileRecord(
  norm: NormRecord,
  slots: string[] = defaultSlots(),
): ParserCapabilityProfileRecord {
  const family   = capabilityFamily(norm);
  const formula  = String(norm['formula'] ?? '');
  const sourceId = String(norm['sourceId'] ?? '');
  const checked  = slots;
  const grounded = groundedSlots(norm, slots);
  const missing  = slots.filter(s => !grounded.includes(s));
  const rate     = checked.length > 0 ? grounded.length / checked.length : 0;

  return {
    parserCapabilityProfileId: stableId('parser-capability-profile', sourceId, family, formula),
    sourceId,
    targetLogic:          'deterministic_parser_capability',
    capabilityFamily:     family,
    normType:             String(norm['normType']  ?? ''),
    modality:             String(norm['modality']  ?? ''),
    formula,
    formulaProofReady:    Boolean(norm['proofReady']),
    requiresValidation:   Boolean(norm['requiresValidation']),
    repairRequired:       Boolean(norm['repairRequired']),
    blockers:             Array.isArray(norm['blockers']) ? norm['blockers'] as string[] : [],
    checkedSlots:         checked,
    groundedSlots:        grounded,
    missingSlots:         missing,
    sourceGroundedSlotRate: Math.round(rate * 1_000_000) / 1_000_000,
  };
}

// ---------------------------------------------------------------------------
// buildDeterministicParserCapabilityProfileRecords
// ---------------------------------------------------------------------------

/** Build profile records for all norms in a collection. */
export function buildDeterministicParserCapabilityProfileRecords(
  norms: NormRecord[],
  slots: string[] = defaultSlots(),
): ParserCapabilityProfileRecord[] {
  return norms.map(n => buildDeterministicParserCapabilityProfileRecord(n, slots));
}

// ---------------------------------------------------------------------------
// summarizeDeterministicParserCapabilityProfileRecords
// ---------------------------------------------------------------------------

/** Aggregate summary of parser capability profile records. */
export function summarizeDeterministicParserCapabilityProfileRecords(
  records: ParserCapabilityProfileRecord[],
): Record<string, unknown> {
  if (records.length === 0) return { total: 0 };

  const families = new Map<string, { total: number; grounded: number; proofReady: number }>();
  for (const r of records) {
    const f = families.get(r.capabilityFamily) ?? { total: 0, grounded: 0, proofReady: 0 };
    f.total++;
    f.grounded += r.sourceGroundedSlotRate;
    if (r.formulaProofReady) f.proofReady++;
    families.set(r.capabilityFamily, f);
  }

  const byFamily: Record<string, unknown> = {};
  for (const [family, stats] of families) {
    byFamily[family] = {
      total:         stats.total,
      avgSlotGroundingRate: Math.round(stats.grounded / stats.total * 1_000_000) / 1_000_000,
      proofReadyCount: stats.proofReady,
      proofReadyRate:  Math.round(stats.proofReady / stats.total * 1_000_000) / 1_000_000,
    };
  }

  return {
    total:    records.length,
    byFamily,
    avgSlotGroundingRate: records.reduce((s, r) => s + r.sourceGroundedSlotRate, 0) / records.length,
  };
}

// ---------------------------------------------------------------------------
// summarizeIrSlotProvenanceAuditRecords
// ---------------------------------------------------------------------------

/** Summarise IR slot provenance audit records. */
export function summarizeIrSlotProvenanceAuditRecords(
  records: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const total = records.length;
  const grounded = records.filter(r => r['sourceGroundedSlotRate'] as number > 0).length;
  const fullyGrounded = records.filter(r => r['sourceGroundedSlotRate'] as number >= 1).length;
  return {
    total,
    groundedCount:      grounded,
    fullyGroundedCount: fullyGrounded,
    groundingRate:      total > 0 ? Math.round(grounded      / total * 1000) / 1000 : 0,
    fullGroundingRate:  total > 0 ? Math.round(fullyGrounded / total * 1000) / 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// summarizePhase8QualityRecords
// ---------------------------------------------------------------------------

/** Summarise phase-8 quality records by capability family. */
export function summarizePhase8QualityRecords(
  records: Array<Record<string, unknown>>,
): Record<string, Phase8QualityRecord> {
  const families = new Map<string, { total: number; proofReady: number; repairRequired: number }>();

  for (const r of records) {
    const family = String(r['capabilityFamily'] ?? r['family'] ?? 'unknown');
    const f = families.get(family) ?? { total: 0, proofReady: 0, repairRequired: 0 };
    f.total++;
    if (r['formulaProofReady'] || r['proofReady']) f.proofReady++;
    if (r['repairRequired']) f.repairRequired++;
    families.set(family, f);
  }

  const out: Record<string, Phase8QualityRecord> = {};
  for (const [family, stats] of families) {
    out[family] = {
      family,
      total:         stats.total,
      proofReady:    stats.proofReady,
      repairRequired: stats.repairRequired,
      proofReadyRate: stats.total > 0 ? Math.round(stats.proofReady / stats.total * 1000) / 1000 : 0,
      coverageRate:   stats.total > 0 ? Math.round((stats.total - stats.repairRequired) / stats.total * 1000) / 1000 : 0,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildPhase8QualitySummaryRecord
// ---------------------------------------------------------------------------

/** Build a single phase-8 quality summary row for a set of norm records. */
export function buildPhase8QualitySummaryRecord(
  records: Array<Record<string, unknown>>,
  label = 'all',
): Record<string, unknown> {
  const total        = records.length;
  const proofReady   = records.filter(r => r['formulaProofReady'] || r['proofReady']).length;
  const repairRequired = records.filter(r => r['repairRequired']).length;
  const needsValidation = records.filter(r => r['requiresValidation']).length;
  return {
    label,
    total,
    proofReady,
    repairRequired,
    needsValidation,
    proofReadyRate:        total > 0 ? Math.round(proofReady / total * 1000) / 1000 : 0,
    repairRequiredRate:    total > 0 ? Math.round(repairRequired / total * 1000) / 1000 : 0,
    needsValidationRate:   total > 0 ? Math.round(needsValidation / total * 1000) / 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// buildPhase8QualitySummaryRecords
// ---------------------------------------------------------------------------

/** Build phase-8 quality summary rows grouped by capability family. */
export function buildPhase8QualitySummaryRecords(
  records: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byFamily = new Map<string, Array<Record<string, unknown>>>();
  for (const r of records) {
    const family = String(r['capabilityFamily'] ?? r['family'] ?? 'unknown');
    const arr = byFamily.get(family) ?? [];
    arr.push(r);
    byFamily.set(family, arr);
  }
  return [...byFamily.entries()].map(([family, recs]) => buildPhase8QualitySummaryRecord(recs, family));
}

// ---------------------------------------------------------------------------
// summarizeProverSyntaxTargetCoverage
// ---------------------------------------------------------------------------

/** Summarise prover syntax target coverage. */
export function summarizeProverSyntaxTargetCoverage(
  records: Array<Record<string, unknown>>,
): Record<string, ProverSyntaxTargetCoverageRecord> {
  const byTarget = new Map<string, { total: number; proofReady: number }>();
  for (const r of records) {
    const target = String(r['proverbTarget'] ?? r['target'] ?? 'unknown');
    const f = byTarget.get(target) ?? { total: 0, proofReady: 0 };
    f.total++;
    if (r['formulaProofReady'] || r['proofReady']) f.proofReady++;
    byTarget.set(target, f);
  }

  const out: Record<string, ProverSyntaxTargetCoverageRecord> = {};
  for (const [target, stats] of byTarget) {
    const rate = stats.total > 0 ? stats.proofReady / stats.total : 0;
    out[target] = {
      proverbTarget:  target,
      totalNorms:     stats.total,
      proofReadyNorms: stats.proofReady,
      coverageRate:   Math.round(rate * 1000) / 1000,
      status:         rate >= 1 ? 'covered' : rate > 0 ? 'partial' : 'missing',
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Direct Phase-8 export helpers
// ---------------------------------------------------------------------------

type Dict = Record<string, unknown>;

export const EXPORT_TABLE_SPECS = {
  canonical: { primary_key: 'source_id', requires_source_id: true },
  formal_logic: { primary_key: 'formula_id', requires_source_id: true },
  proof_obligations: { primary_key: 'proof_obligation_id', requires_source_id: true },
  repair_queue: { primary_key: 'repair_id', requires_source_id: true },
  decoder_reconstructions: { primary_key: 'reconstruction_id', requires_source_id: true },
  prover_syntax_summaries: { primary_key: 'prover_syntax_summary_id', requires_source_id: true },
  reconstruction_slot_loss: { primary_key: 'reconstruction_slot_loss_id', requires_source_id: true },
  ir_slot_provenance_audits: { primary_key: 'ir_slot_provenance_audit_id', requires_source_id: true },
  phase8_quality_summaries: { primary_key: 'phase8_quality_summary_id', requires_source_id: false },
} as const;

const DEFAULT_DECODER_REQUIRED_SLOTS = ['actor', 'action'];
const DEFAULT_RECONSTRUCTION_LEGAL_SLOTS = [
  'actor',
  'modality',
  'action',
  'conditions',
  'exceptions',
  'temporal_constraints',
  'cross_references',
];
const DEFAULT_PY_PROVER_TARGETS = ['frame_logic', 'deontic_cec', 'fol', 'deontic_fol', 'deontic_temporal_fol'];
const PY_TO_TS_PROVER_TARGET: Record<string, ProverTarget> = {
  frame_logic: 'json-ir',
  deontic_cec: 'dcec',
  fol: 'tptp',
  deontic_fol: 'dcec',
  deontic_temporal_fol: 'tdfol',
  z3: 'z3-smt2',
  z3_smt2: 'z3-smt2',
  smt_lib2: 'smt-lib2',
  smtlib2: 'smt-lib2',
  dcec: 'dcec',
  tdfol: 'tdfol',
  lean4: 'lean4',
  coq: 'coq',
  tptp: 'tptp',
  prolog: 'prolog',
  json_ir: 'json-ir',
};

function toLegalNormIR(value: LegalNormIR | Dict): LegalNormIR {
  return isLegalNormIR(value) ? value : parserElementToIR(value);
}

function isLegalNormIR(value: LegalNormIR | Dict): value is LegalNormIR {
  const record = value as Dict;
  const span = record['support_span'];
  return Boolean(
    record['source_id'] &&
    record['schema_version'] &&
    typeof record['quality'] === 'object' &&
    span &&
    typeof span === 'object' &&
    !Array.isArray(span) &&
    'start' in (span as Dict) &&
    'end' in (span as Dict),
  );
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(item => stringValue(item)).filter(Boolean))];
  const text = stringValue(value);
  return text ? [text] : [];
}

function dictValue(value: unknown): Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...(value as Dict) } : {};
}

function dictArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item)).map(item => ({ ...(item as Dict) }))
    : [];
}

function slotNamesFromRecord(record: Dict, key: string): string[] {
  const value = record[key];
  if (typeof value === 'string') return stringArray(value);
  if (Array.isArray(value)) return stringArray(value);
  if (typeof value === 'object' && value !== null) return Object.keys(value);
  return [];
}

function phraseSlotNames(phrase: Dict): string[] {
  const names = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text) names.add(text);
    } else if (Array.isArray(value)) {
      for (const item of value) add(item);
    } else if (typeof value === 'object' && value !== null) {
      const record = value as Dict;
      for (const key of ['slot', 'slots', 'source_slot', 'source_slots', 'field', 'fields', 'source_field', 'source_fields', 'ir_slot', 'slot_name']) {
        add(record[key]);
      }
    }
  };

  for (const key of ['slot', 'slots', 'source_slot', 'source_slots', 'field', 'fields', 'source_field', 'source_fields', 'ir_slot', 'slot_name', 'provenance', 'sources']) {
    add(phrase[key]);
  }
  if (names.has('definition_body')) names.add('action');
  return [...names];
}

function spanLike(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function phraseHasSourceSpan(phrase: Dict): boolean {
  if (phrase['fixed'] === true || phrase['fixed_connective'] === true) return false;
  for (const key of ['spans', 'source_spans', 'field_spans']) {
    const spans = phrase[key];
    if (Array.isArray(spans) && spans.some(spanLike)) return true;
  }
  return ['span', 'source_span', 'support_span', 'field_span'].some(key => spanLike(phrase[key]));
}

function supportSpan(norm: LegalNormIR): [number, number] {
  return [norm.support_span.start, norm.support_span.end];
}

function supportSpanFromRecord(record: Dict): [number, number] {
  const span = record['support_span'];
  if (spanLike(span)) return span;
  if (typeof span === 'object' && span !== null) {
    const raw = span as Dict;
    if (typeof raw['start'] === 'number' && typeof raw['end'] === 'number') return [raw['start'], raw['end']];
  }
  return [0, 0];
}

function normalizeProverTargets(targets: Iterable<string> | undefined | null): Array<{ requested: string; target: ProverTarget }> {
  const requested = Array.from(targets ?? DEFAULT_PY_PROVER_TARGETS).map(stringValue).filter(Boolean);
  return (requested.length > 0 ? requested : DEFAULT_PY_PROVER_TARGETS).map(name => ({
    requested: name,
    target: PY_TO_TS_PROVER_TARGET[name] ?? (ALL_PROVER_TARGETS.includes(name as ProverTarget) ? name as ProverTarget : 'json-ir'),
  }));
}

function validationResolution(norm: LegalNormIR, missingSlots: string[]): [boolean, Dict] {
  if (missingSlots.length > 0) return [true, {}];
  if (!legalNormIRDecoderRequiresValidation(norm)) return [false, {}];

  const readiness = dictValue(norm.quality.export_readiness);
  if (readiness['formula_proof_ready'] !== true) return [true, {}];
  if (readiness['formula_requires_validation'] === true || readiness['formula_repair_required'] === true) return [true, {}];

  const resolution = dictValue(readiness['deterministic_resolution']);
  const resolutionType = stringValue(resolution['type']);
  if (!resolutionType) return [true, {}];
  return [false, {
    type: 'formula_deterministic_readiness',
    formula_resolution_type: resolutionType,
    resolved_parser_warnings: [...norm.quality.parser_warnings],
  }];
}

function decoderPhraseRows(norm: LegalNormIR): Dict[] {
  const decoded = decodeLegalNormIR(norm);
  const audit = buildDecodedPhraseAuditRecords(norm, decoded);
  return audit.map(phrase => ({
    phrase_index: phrase.phraseIndex,
    slot: phrase.slot,
    slots: [phrase.slot],
    text: phrase.text,
    rendered_span: [phrase.renderedStart, phrase.renderedEnd],
    spans: phrase.sourceSpans,
    source_spans: phrase.sourceSpans,
    source_texts: phrase.sourceTexts,
    fixed: phrase.fixed,
    fixed_connective: phrase.fixed,
    provenance_only: phrase.provenanceOnly,
    grounded: phrase.grounded,
  }));
}

// ---------------------------------------------------------------------------
// Decoder reconstruction records
// ---------------------------------------------------------------------------

export function buildDecoderRecordFromIR(normInput: LegalNormIR | Dict): Dict {
  const norm = toLegalNormIR(normInput);
  const decoded = decodeLegalNormIR(norm);
  const phraseRows = decoderPhraseRows(norm);
  const groundedPhraseSlots = new Set(
    phraseRows.flatMap(phrase => phraseHasSourceSpan(phrase) ? phraseSlotNames(phrase) : []),
  );
  const missingSlots = decoded.missing_slots.filter(slot => !groundedPhraseSlots.has(slot));
  const fixedPhraseCount = phraseRows.filter(phrase => phrase['fixed'] === true).length;
  const provenanceOnlyPhraseCount = phraseRows.filter(phrase => phrase['provenance_only'] === true).length;
  const legalPhraseCount = phraseRows.length - fixedPhraseCount;
  const ungroundedPhraseCount = phraseRows.filter(phrase => phrase['fixed'] !== true && !phraseHasSourceSpan(phrase)).length;
  const groundedPhraseCount = Math.max(0, legalPhraseCount - ungroundedPhraseCount);
  const [requiresValidation, decoderValidationResolution] = validationResolution(norm, missingSlots);

  return {
    reconstruction_id: stableId('reconstruction', norm.source_id, decoded.text),
    source_id: norm.source_id,
    canonical_citation: norm.canonical_citation,
    source_text: norm.source_text,
    support_text: norm.support_text,
    decoded_text: decoded.text,
    decoded_slot_text: decodedPhraseSlotTextMap(decoded, { includeFixed: false, includeProvenanceOnly: true }),
    support_span: decoded.support_span,
    phrase_count: phraseRows.length,
    fixed_phrase_count: fixedPhraseCount,
    legal_phrase_count: legalPhraseCount,
    provenance_only_phrase_count: provenanceOnlyPhraseCount,
    grounded_phrase_count: groundedPhraseCount,
    ungrounded_decoded_phrase_count: ungroundedPhraseCount,
    grounded_decoded_phrase_rate: legalPhraseCount ? round6(groundedPhraseCount / legalPhraseCount) : 1,
    ungrounded_decoded_phrase_rate: legalPhraseCount ? round6(ungroundedPhraseCount / legalPhraseCount) : 0,
    missing_slot_count: missingSlots.length,
    missing_slots: missingSlots,
    parser_warnings: [...decoded.parser_warnings],
    phrase_provenance: phraseRows,
    proof_ready: legalNormIRProofReady(norm),
    requires_validation: requiresValidation,
    decoder_validation_resolution: decoderValidationResolution,
    schema_version: norm.schema_version,
  };
}

export function buildDecoderRecordsFromIRs(norms: Iterable<LegalNormIR | Dict>): Dict[] {
  return Array.from(norms ?? []).map(buildDecoderRecordFromIR);
}

export function summarizeDecoderReconstructionRecords(records: Iterable<Dict>): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const warnings: Record<string, number> = {};
  for (const row of rows) {
    for (const warning of stringArray(row['parser_warnings'])) {
      warnings[warning] = (warnings[warning] ?? 0) + 1;
    }
  }
  const groundedRates = rows.map(row => Number(row['grounded_decoded_phrase_rate'] ?? 0));
  const ungroundedRates = rows.map(row => Number(row['ungrounded_decoded_phrase_rate'] ?? 0));
  const worst = [...rows]
    .map(row => ({
      source_id: stringValue(row['source_id']),
      grounded_decoded_phrase_rate: Number(row['grounded_decoded_phrase_rate'] ?? 0),
      missing_slot_count: Number(row['missing_slot_count'] ?? 0),
    }))
    .sort((a, b) => a.grounded_decoded_phrase_rate - b.grounded_decoded_phrase_rate || b.missing_slot_count - a.missing_slot_count)
    .slice(0, 5);

  return {
    record_count: rows.length,
    proof_ready_count: rows.filter(row => row['proof_ready'] === true).length,
    requires_validation_count: rows.filter(row => row['requires_validation'] === true).length,
    mean_grounded_decoded_phrase_rate: groundedRates.length ? round6(groundedRates.reduce((sum, rate) => sum + rate, 0) / groundedRates.length) : 0,
    mean_ungrounded_decoded_phrase_rate: ungroundedRates.length ? round6(ungroundedRates.reduce((sum, rate) => sum + rate, 0) / ungroundedRates.length) : 0,
    total_missing_slot_count: rows.reduce((sum, row) => sum + Number(row['missing_slot_count'] ?? 0), 0),
    records_with_missing_slots: rows.filter(row => Number(row['missing_slot_count'] ?? 0) > 0).length,
    parser_warning_distribution: warnings,
    worst_grounded_reconstructions: worst,
  };
}

// ---------------------------------------------------------------------------
// IR and decoder slot grounding audits
// ---------------------------------------------------------------------------

export function buildIrSlotProvenanceAuditRecord(
  normInput: LegalNormIR | Dict,
  slots: string[] = DEFAULT_IR_PROVENANCE_SLOTS,
): Dict {
  const norm = toLegalNormIR(normInput);
  const audit = legalNormIRSlotProvenance(norm, slots);
  const blockers = [
    ...audit.missing_slots.map(slot => `missing_ir_slot_provenance:${slot}`),
    ...audit.ungrounded_slots.map(slot => `ungrounded_ir_slot_provenance:${slot}`),
  ];
  const checkedCount = audit.checked_slots.length;
  const groundedCount = audit.grounded_slots.length;
  const ungroundedCount = audit.ungrounded_slots.length;

  return {
    ir_slot_provenance_audit_id: stableId('ir-slot-provenance-audit', norm.source_id, audit.checked_slots.join('|')),
    source_id: norm.source_id,
    target_logic: 'legal_norm_ir',
    support_span: supportSpan(norm),
    checked_slots: audit.checked_slots,
    grounded_slots: audit.grounded_slots,
    missing_slots: audit.missing_slots,
    ungrounded_slots: audit.ungrounded_slots,
    checked_slot_count: checkedCount,
    grounded_slot_count: groundedCount,
    missing_slot_count: audit.missing_slots.length,
    ungrounded_slot_count: ungroundedCount,
    all_checked_slots_grounded: checkedCount > 0 && groundedCount === checkedCount && ungroundedCount === 0,
    grounded_slot_rate: checkedCount ? round6(groundedCount / checkedCount) : 0,
    ungrounded_slot_rate: checkedCount ? round6(ungroundedCount / checkedCount) : 0,
    requires_validation: blockers.length > 0,
    coverage_blockers: blockers,
    slot_grounding: audit.slot_grounding,
  };
}

export function buildIrSlotProvenanceAuditRecords(
  norms: Iterable<LegalNormIR | Dict>,
  slots: string[] = DEFAULT_IR_PROVENANCE_SLOTS,
): Dict[] {
  return Array.from(norms ?? []).map(norm => buildIrSlotProvenanceAuditRecord(norm, slots));
}

export function buildDecoderSlotGroundingAuditRecord(
  decoderRecord: Dict,
  requiredSlots: string[] = DEFAULT_DECODER_REQUIRED_SLOTS,
): Dict {
  const required = [...new Set(requiredSlots.map(stringValue).filter(Boolean))];
  const phraseRows = dictArray(decoderRecord['phrase_provenance']);
  const missingSlots: string[] = [];
  const ungroundedSlots: string[] = [];
  const groundedSlots: string[] = [];
  const slotStatus: Dict = {};

  for (const slot of required) {
    const slotPhrases = phraseRows.filter(phrase => phraseSlotNames(phrase).includes(slot));
    const groundedPhrases = slotPhrases.filter(phraseHasSourceSpan);
    const present = slotPhrases.length > 0;
    const grounded = groundedPhrases.length > 0;
    if (!present) missingSlots.push(slot);
    else if (!grounded) ungroundedSlots.push(slot);
    else groundedSlots.push(slot);
    slotStatus[slot] = {
      present,
      grounded,
      phrase_count: slotPhrases.length,
      grounded_phrase_count: groundedPhrases.length,
    };
  }

  const sourceId = stringValue(decoderRecord['source_id']);
  const blockers = [
    ...missingSlots.map(slot => `missing_decoded_slot:${slot}`),
    ...ungroundedSlots.map(slot => `ungrounded_decoded_slot:${slot}`),
  ];

  return {
    decoder_slot_grounding_audit_id: stableId('decoder-slot-grounding', sourceId, required.join('|'), stringValue(decoderRecord['reconstruction_id'])),
    source_id: sourceId,
    reconstruction_id: stringValue(decoderRecord['reconstruction_id']),
    decoded_text: stringValue(decoderRecord['decoded_text']),
    required_slots: required,
    grounded_slots: groundedSlots,
    missing_slots: missingSlots,
    ungrounded_slots: ungroundedSlots,
    slot_status: slotStatus,
    slot_grounding_complete: missingSlots.length === 0 && ungroundedSlots.length === 0,
    requires_validation: decoderRecord['requires_validation'] === true || missingSlots.length > 0 || ungroundedSlots.length > 0,
    grounding_blockers: blockers,
    proof_ready: decoderRecord['proof_ready'] === true,
    parser_warnings: stringArray(decoderRecord['parser_warnings']),
    schema_version: stringValue(decoderRecord['schema_version']),
  };
}

export function buildDecoderSlotGroundingAuditRecordFromIR(
  norm: LegalNormIR | Dict,
  requiredSlots: string[] = DEFAULT_DECODER_REQUIRED_SLOTS,
): Dict {
  return buildDecoderSlotGroundingAuditRecord(buildDecoderRecordFromIR(norm), requiredSlots);
}

export function buildDecoderSlotGroundingAuditRecordsFromIRs(
  norms: Iterable<LegalNormIR | Dict>,
  requiredSlots: string[] = DEFAULT_DECODER_REQUIRED_SLOTS,
): Dict[] {
  return Array.from(norms ?? []).map(norm => buildDecoderSlotGroundingAuditRecordFromIR(norm, requiredSlots));
}

export function summarizeDecoderSlotGroundingAuditRecords(records: Iterable<Dict>): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const requiredSlots: string[] = [];
  const grounded: Record<string, number> = {};
  const missing: Record<string, number> = {};
  const ungrounded: Record<string, number> = {};
  const blockers: Record<string, number> = {};
  let requiredMentions = 0;
  let groundedMentions = 0;

  for (const row of rows) {
    for (const slot of stringArray(row['required_slots'])) {
      if (!requiredSlots.includes(slot)) requiredSlots.push(slot);
      requiredMentions++;
    }
    for (const slot of stringArray(row['grounded_slots'])) {
      grounded[slot] = (grounded[slot] ?? 0) + 1;
      groundedMentions++;
    }
    for (const slot of stringArray(row['missing_slots'])) missing[slot] = (missing[slot] ?? 0) + 1;
    for (const slot of stringArray(row['ungrounded_slots'])) ungrounded[slot] = (ungrounded[slot] ?? 0) + 1;
    for (const blocker of stringArray(row['grounding_blockers'])) blockers[blocker] = (blockers[blocker] ?? 0) + 1;
  }

  return {
    record_count: rows.length,
    proof_ready_count: rows.filter(row => row['proof_ready'] === true).length,
    slot_grounding_complete_count: rows.filter(row => row['slot_grounding_complete'] === true).length,
    requires_validation_count: rows.filter(row => row['requires_validation'] === true).length,
    required_slots: requiredSlots,
    grounded_slot_distribution: grounded,
    missing_slot_distribution: missing,
    ungrounded_slot_distribution: ungrounded,
    grounding_blocker_distribution: blockers,
    slot_grounding_complete_rate: rows.length ? round6(rows.filter(row => row['slot_grounding_complete'] === true).length / rows.length) : 0,
    grounded_required_slot_rate: requiredMentions ? round6(groundedMentions / requiredMentions) : 1,
  };
}

// ---------------------------------------------------------------------------
// Prover syntax summaries and target coverage
// ---------------------------------------------------------------------------

export function buildProverSyntaxSummaryRecordFromIR(
  normInput: LegalNormIR | Dict,
  targets?: Iterable<string>,
): Dict {
  const norm = toLegalNormIR(normInput);
  const normalizedTargets = normalizeProverTargets(targets);
  const uniqueTsTargets = [...new Set(normalizedTargets.map(target => target.target))];
  const report = ProverSyntaxBuilder.buildSyntaxReport(norm, uniqueTsTargets);
  const validator = new ProverSyntaxValidator(uniqueTsTargets);
  const validation = validator.validateReport(report);
  const recordByTarget = new Map(report.records.map(record => [record.target_id, record]));
  const proverSyntaxRecords = normalizedTargets.map(({ requested, target }) => {
    const record = recordByTarget.get(target) as ProverTargetSyntaxRecord;
    const diagnostics = validator.validateRecord(record).map(issue => issue.message);
    return {
      prover_syntax_record_id: stableId('prover-syntax-record', norm.source_id, requested, record.formula),
      source_id: norm.source_id,
      target: requested,
      target_logic: requested,
      adapter_target: target,
      formula: record.formula,
      syntax_type: record.syntax_type,
      syntax_valid: record.valid && diagnostics.length === 0,
      status: record.valid && diagnostics.length === 0 ? 'passed' : 'requires_validation',
      diagnostics,
      warnings: [...record.warnings],
      skipped: false,
      schema_version: norm.schema_version,
    };
  });
  const checkedRecords = proverSyntaxRecords.filter(record => record.skipped !== true);
  const validCount = checkedRecords.filter(record => record.syntax_valid === true).length;
  const invalidRecords = checkedRecords.filter(record => record.syntax_valid !== true);
  const diagnostics: Record<string, number> = {};
  for (const record of invalidRecords) {
    for (const diagnostic of stringArray(record.diagnostics)) {
      diagnostics[diagnostic] = (diagnostics[diagnostic] ?? 0) + 1;
    }
  }
  const targetNames = proverSyntaxRecords.map(record => record.target);
  const requiredTargetsPassed = checkedRecords.length > 0 && validCount === checkedRecords.length && validation.allValid;

  return {
    prover_syntax_summary_id: stableId('prover_syntax', norm.source_id, targetNames.join('|'), String(validCount), String(checkedRecords.length)),
    source_id: norm.source_id,
    canonical_citation: norm.canonical_citation,
    target_count: proverSyntaxRecords.length,
    checked_target_count: checkedRecords.length,
    syntax_valid_count: validCount,
    syntax_invalid_count: invalidRecords.length,
    syntax_valid_rate: checkedRecords.length ? round6(validCount / checkedRecords.length) : 0,
    required_targets_passed: requiredTargetsPassed,
    proof_ready: legalNormIRProofReady(norm),
    requires_validation: legalNormIRBlockers(norm).length > 0 || !requiredTargetsPassed,
    parser_warnings: [...norm.quality.parser_warnings],
    targets: targetNames,
    diagnostic_distribution: diagnostics,
    prover_syntax_records: proverSyntaxRecords,
    schema_version: norm.schema_version,
  };
}

export function buildProverSyntaxTargetCoverageRecord(
  record: Dict,
  requiredTargets: string[] = DEFAULT_PY_PROVER_TARGETS,
): Dict {
  const sourceId = stringValue(record['source_id']);
  const target = stringValue(record['target'] ?? record['target_logic'] ?? record['proverbTarget']);
  const syntaxValid = record['syntax_valid'] === true || record['formulaProofReady'] === true || record['proofReady'] === true;
  const missing = requiredTargets.length > 0 && target ? !requiredTargets.includes(target) : false;
  return {
    prover_syntax_target_coverage_id: stableId('prover-syntax-target-coverage', sourceId, target),
    source_id: sourceId,
    prover_target: target,
    target,
    required: !missing,
    present: Boolean(target),
    syntax_valid: syntaxValid,
    proof_ready: syntaxValid,
    coverage_rate: target && syntaxValid ? 1 : 0,
    status: !target || missing ? 'missing' : syntaxValid ? 'covered' : 'partial',
    diagnostics: stringArray(record['diagnostics']),
    schema_version: stringValue(record['schema_version']),
  };
}

export function buildProverSyntaxTargetCoverageRecordsFromIRs(
  norms: Iterable<LegalNormIR | Dict>,
  requiredTargets: string[] = DEFAULT_PY_PROVER_TARGETS,
): Dict[] {
  return Array.from(norms ?? []).flatMap(norm => {
    const summary = buildProverSyntaxSummaryRecordFromIR(norm, requiredTargets);
    const records = dictArray(summary['prover_syntax_records']);
    return records.map(record => buildProverSyntaxTargetCoverageRecord(record, requiredTargets));
  });
}

export function summarizeProverSyntaxTargetCorpusCoverage(
  records: Iterable<Dict>,
  requiredTargets: string[] = DEFAULT_PY_PROVER_TARGETS,
): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const bySource: Record<string, Dict> = {};
  const byTarget: Record<string, { total: number; covered: number }> = {};
  for (const row of rows) {
    const sourceId = stringValue(row['source_id']);
    const target = stringValue(row['target'] ?? row['prover_target']);
    if (!target) continue;
    const targetStats = byTarget[target] ?? { total: 0, covered: 0 };
    targetStats.total++;
    if (row['status'] === 'covered' || row['syntax_valid'] === true) targetStats.covered++;
    byTarget[target] = targetStats;

    const source = bySource[sourceId] ?? { source_id: sourceId, present_targets: [], covered_targets: [], missing_targets: [] };
    (source['present_targets'] as string[]).push(target);
    if (row['status'] === 'covered' || row['syntax_valid'] === true) (source['covered_targets'] as string[]).push(target);
    bySource[sourceId] = source;
  }
  for (const source of Object.values(bySource)) {
    const covered = new Set(source['covered_targets'] as string[]);
    source['missing_targets'] = requiredTargets.filter(target => !covered.has(target));
    source['coverage_rate'] = requiredTargets.length ? round6(covered.size / requiredTargets.length) : 1;
    source['all_required_targets_covered'] = (source['missing_targets'] as string[]).length === 0;
  }

  return {
    record_count: rows.length,
    source_count: Object.keys(bySource).length,
    required_targets: requiredTargets,
    covered_source_count: Object.values(bySource).filter(source => source['all_required_targets_covered'] === true).length,
    by_source_id: bySource,
    target_coverage: Object.fromEntries(Object.entries(byTarget).map(([target, stats]) => [target, {
      total: stats.total,
      covered: stats.covered,
      coverage_rate: stats.total ? round6(stats.covered / stats.total) : 0,
      status: stats.covered === stats.total ? 'covered' : stats.covered > 0 ? 'partial' : 'missing',
    }])),
  };
}

export function summarizeProverTargetQualityGates(
  records: Iterable<Dict>,
  requiredTargets: string[] = DEFAULT_PY_PROVER_TARGETS,
): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const failed = rows.filter(row => row['status'] !== 'covered' && row['syntax_valid'] !== true);
  return {
    record_count: rows.length,
    required_targets: requiredTargets,
    passed_count: rows.length - failed.length,
    failed_count: failed.length,
    all_quality_gates_passed: failed.length === 0 && rows.length > 0,
    failed_quality_gates: failed.map(row => ({
      source_id: stringValue(row['source_id']),
      target: stringValue(row['target'] ?? row['prover_target']),
      diagnostics: stringArray(row['diagnostics']),
    })),
  };
}

export function summarizeProverTargetRoleMatrix(
  records: Iterable<Dict>,
  requiredTargets: string[] = DEFAULT_PY_PROVER_TARGETS,
): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const matrix: Record<string, Dict> = {};
  for (const target of requiredTargets) {
    const targetRows = rows.filter(row => stringValue(row['target'] ?? row['prover_target']) === target);
    matrix[target] = {
      target,
      present_count: targetRows.length,
      covered_count: targetRows.filter(row => row['status'] === 'covered' || row['syntax_valid'] === true).length,
      role: target.includes('temporal') ? 'temporal' : target.includes('cec') || target.includes('deontic') ? 'deontic' : target.includes('frame') ? 'frame' : 'first_order',
    };
  }
  return {
    required_targets: requiredTargets,
    target_roles: matrix,
  };
}

export function summarizeProverTargetSemanticFamilies(records: Iterable<Dict>): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const families: Record<string, number> = {};
  for (const row of rows) {
    const target = stringValue(row['target'] ?? row['prover_target']);
    const family = target.includes('temporal') || target === 'tdfol'
      ? 'temporal'
      : target.includes('cec') || target === 'dcec'
        ? 'deontic'
        : target.includes('frame') || target === 'json-ir'
          ? 'frame'
          : 'first_order';
    families[family] = (families[family] ?? 0) + 1;
  }
  return {
    record_count: rows.length,
    semantic_family_distribution: families,
  };
}

// ---------------------------------------------------------------------------
// Reconstruction slot-loss records
// ---------------------------------------------------------------------------

function slotGroundingRecords(record: Dict): Dict[] {
  return [
    ...dictArray(record['slot_grounding']),
    ...dictArray(record['slot_status']).map((status, index) => ({ slot: String(index), ...status })),
  ];
}

export function summarizeReconstructionSlotLoss(
  records: Iterable<Dict>,
  requiredSlots: string[] = DEFAULT_RECONSTRUCTION_LEGAL_SLOTS,
): Dict {
  const rows = Array.from(records ?? []).map(dictValue);
  const required = [...new Set(requiredSlots.map(stringValue).filter(Boolean))];
  const sourceIds = new Set<string>();
  const groundedSlots = new Set<string>();
  const missingSlots = new Set<string>();
  const ungroundedSlots = new Set<string>();

  for (const row of rows) {
    const sourceId = stringValue(row['source_id']);
    if (sourceId) sourceIds.add(sourceId);
    for (const slot of slotNamesFromRecord(row, 'grounded_slots')) groundedSlots.add(slot);
    for (const slot of slotNamesFromRecord(row, 'missing_slots')) missingSlots.add(slot);
    for (const slot of slotNamesFromRecord(row, 'ungrounded_slots')) ungroundedSlots.add(slot);

    for (const slotRecord of slotGroundingRecords(row)) {
      const slot = stringValue(slotRecord['slot'] ?? slotRecord['slot_name'] ?? slotRecord['field']);
      if (!slot) continue;
      const status = stringValue(slotRecord['status'] ?? slotRecord['grounding_status']).toLowerCase();
      if (slotRecord['grounded'] === true || status === 'grounded' || status === 'present') groundedSlots.add(slot);
      else if (slotRecord['ungrounded'] === true || status === 'ungrounded' || status === 'unprovenanced') ungroundedSlots.add(slot);
      else if (slotRecord['missing'] === true || status === 'missing' || status === 'omitted') missingSlots.add(slot);
    }

    for (const phrase of dictArray(row['decoded_phrase_provenance'] ?? row['phrase_provenance'])) {
      for (const slot of phraseSlotNames(phrase)) {
        if (phraseHasSourceSpan(phrase)) groundedSlots.add(slot);
        else if (phrase['fixed_connective'] !== true && phrase['fixed'] !== true) ungroundedSlots.add(slot);
      }
    }
  }

  const groundedRequired = required.filter(slot => hasSlotWithAlias(groundedSlots, slot)).sort();
  const missingRequired = required.filter(slot => !hasSlotWithAlias(groundedSlots, slot) || hasSlotWithAlias(missingSlots, slot)).sort();
  const ungroundedRequired = required.filter(slot => hasSlotWithAlias(ungroundedSlots, slot)).sort();
  const extraUngrounded = [...ungroundedSlots].filter(slot => !required.some(requiredSlot => slotsAliasMatch(requiredSlot, slot))).sort();
  const blockers = [
    ...missingRequired.map(slot => `missing_reconstruction_slot:${slot}`),
    ...ungroundedRequired.map(slot => `ungrounded_reconstruction_slot:${slot}`),
    ...extraUngrounded.map(slot => `ungrounded_decoded_slot:${slot}`),
  ];
  const ungroundedCount = ungroundedRequired.length + extraUngrounded.length;

  return {
    source_ids: [...sourceIds].sort(),
    record_count: rows.length,
    required_slots: required,
    grounded_required_slots: groundedRequired,
    missing_required_slots: missingRequired,
    ungrounded_required_slots: ungroundedRequired,
    extra_ungrounded_slots: extraUngrounded,
    required_slot_count: required.length,
    grounded_required_slot_count: groundedRequired.length,
    missing_required_slot_count: missingRequired.length,
    ungrounded_slot_count: ungroundedCount,
    slot_reconstruction_complete: required.length > 0 && groundedRequired.length === required.length && ungroundedCount === 0,
    grounded_required_slot_rate: required.length ? round6(groundedRequired.length / required.length) : 0,
    ungrounded_decoded_slot_rate: groundedRequired.length + ungroundedCount ? round6(ungroundedCount / (groundedRequired.length + ungroundedCount)) : 0,
    coverage_blockers: blockers,
  };
}

export function buildReconstructionSlotLossRecord(
  sourceIdOrRecords: string | Iterable<Dict>,
  recordsOrRequiredSlots?: Iterable<Dict> | string[],
  requiredSlots: string[] = DEFAULT_RECONSTRUCTION_LEGAL_SLOTS,
): Dict {
  const explicitSourceId = typeof sourceIdOrRecords === 'string' ? stringValue(sourceIdOrRecords) : '';
  const records = typeof sourceIdOrRecords === 'string'
    ? Array.from((recordsOrRequiredSlots as Iterable<Dict>) ?? [])
    : Array.from(sourceIdOrRecords ?? []);
  const slots = typeof sourceIdOrRecords === 'string'
    ? requiredSlots
    : Array.isArray(recordsOrRequiredSlots) ? recordsOrRequiredSlots : requiredSlots;
  const summary = summarizeReconstructionSlotLoss(records, slots);
  const normalizedSourceId = explicitSourceId || ((summary['source_ids'] as string[]).length === 1 ? (summary['source_ids'] as string[])[0] : '');
  return {
    reconstruction_slot_loss_id: stableId('reconstruction-slot-loss', normalizedSourceId, (summary['required_slots'] as string[]).join('|')),
    source_id: normalizedSourceId,
    target_logic: 'decoder_reconstruction',
    record_count: summary['record_count'],
    required_slots: summary['required_slots'],
    grounded_required_slot_rate: summary['grounded_required_slot_rate'],
    ungrounded_decoded_slot_rate: summary['ungrounded_decoded_slot_rate'],
    slot_reconstruction_complete: summary['slot_reconstruction_complete'],
    requires_validation: summary['slot_reconstruction_complete'] !== true,
    coverage_blockers: summary['coverage_blockers'],
    coverage_summary: summary,
  };
}

export function buildReconstructionSlotLossRecords(
  records: Iterable<Dict>,
  requiredSlots: string[] = DEFAULT_RECONSTRUCTION_LEGAL_SLOTS,
): Dict[] {
  const grouped = new Map<string, Dict[]>();
  for (const record of Array.from(records ?? []).map(dictValue)) {
    const sourceId = stringValue(record['source_id']);
    if (!sourceId) continue;
    const rows = grouped.get(sourceId) ?? [];
    rows.push(record);
    grouped.set(sourceId, rows);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceId, rows]) => buildReconstructionSlotLossRecord(sourceId, rows, requiredSlots));
}

// ---------------------------------------------------------------------------
// Parser repair/readiness normalization and export table validation
// ---------------------------------------------------------------------------

export function parserElementsForMetrics(elements: Iterable<Dict>): Dict[] {
  return Array.from(elements ?? []).map(element => {
    const norm = parserElementToIR(element);
    const formula = buildDeonticFormulaRecordFromIR(norm);
    const exportReadiness = {
      ...dictValue(element['export_readiness']),
      formula_proof_ready: formula['proof_ready'] === true,
      formula_requires_validation: formula['requires_validation'] === true,
      formula_repair_required: formula['repair_required'] === true,
      deterministic_resolution: dictValue(formula['deterministic_resolution']),
    };
    const resolved = exportReadiness.formula_proof_ready && !exportReadiness.formula_requires_validation && !exportReadiness.formula_repair_required;
    return {
      ...element,
      source_id: norm.source_id,
      canonical_citation: norm.canonical_citation,
      norm_type: norm.norm_type,
      modality: norm.modality,
      actor: norm.actor,
      proposition: norm.action,
      action: norm.action,
      export_readiness: exportReadiness,
      active_repair_required: resolved ? false : Boolean(element['active_repair_required'] ?? element['repair_required']),
      repair_required: resolved ? false : Boolean(element['repair_required'] ?? exportReadiness.formula_repair_required),
      active_repair_warnings: resolved ? [] : stringArray(element['active_repair_warnings'] ?? element['repair_required_warnings'] ?? element['parser_warnings']),
      repair_required_warnings: resolved ? [] : stringArray(element['repair_required_warnings'] ?? element['parser_warnings']),
      llm_repair: resolved ? { ...dictValue(element['llm_repair']), required: false } : dictValue(element['llm_repair']),
    };
  });
}

export function parserElementHasActiveRepair(element: Dict): boolean {
  const [row] = parserElementsForMetrics([element]);
  const readiness = dictValue(row?.['export_readiness']);
  return Boolean(
    row &&
    (
      row['active_repair_required'] === true ||
      row['repair_required'] === true ||
      dictValue(row['llm_repair'])['required'] === true ||
      readiness['metric_repair_required'] === true ||
      readiness['formula_repair_required'] === true ||
      stringArray(row['active_repair_warnings']).length > 0
    ),
  );
}

export function activeRepairDetailsFromParserElements(elements: Iterable<Dict>): Dict[] {
  return parserElementsForMetrics(elements)
    .filter(parserElementHasActiveRepair)
    .map(element => {
      const llmRepair = dictValue(element['llm_repair']);
      const warnings = stringArray(element['active_repair_warnings'] ?? llmRepair['reasons'] ?? element['repair_required_warnings'] ?? element['parser_warnings']);
      return {
        sample_id: element['sample_id'] ?? element['_probe_sample_id'] ?? '',
        source_id: element['source_id'] ?? '',
        canonical_citation: element['canonical_citation'] ?? '',
        text: element['text'] ?? element['source_text'] ?? '',
        support_text: element['support_text'] ?? '',
        support_span: element['support_span'] ?? [],
        norm_type: element['norm_type'] ?? '',
        modality: element['deontic_operator'] ?? element['modality'] ?? '',
        subject: stringArray(element['subject'] ?? element['actor']),
        proposition: stringArray(element['proposition'] ?? element['action']),
        action: stringArray(element['action'] ?? element['proposition']),
        object: element['object'] ?? element['action_object'] ?? '',
        parser_warnings: stringArray(element['parser_warnings']),
        active_repair_warnings: warnings,
        llm_repair: llmRepair,
        deterministic_resolution: dictValue(dictValue(element['export_readiness'])['deterministic_resolution']),
      };
    });
}

export function summarizeActiveRepairFromParserElements(elements: Iterable<Dict>): Dict {
  const rows = parserElementsForMetrics(elements);
  const details = activeRepairDetailsFromParserElements(rows);
  const activeSourceIds = new Set(details.map(detail => stringValue(detail['source_id'])));
  return {
    element_count: rows.length,
    repair_required_count: details.length,
    repair_required_rate: rows.length ? round6(details.length / rows.length) : 0,
    repair_required: details.map(detail => detail['source_id']),
    repair_required_details: details,
    active_repair_required_by_source_id: Object.fromEntries(rows.map(row => {
      const sourceId = stringValue(row['source_id']);
      return [sourceId, activeSourceIds.has(sourceId)];
    })),
  };
}

export function normalizeRepairRequiredDetailsFromParserElements(
  elements: Iterable<Dict>,
  rawDetails: Iterable<Dict> = [],
): Dict[] {
  const summary = summarizeActiveRepairFromParserElements(elements);
  const activeBySource = dictValue(summary['active_repair_required_by_source_id']);
  const projectedBySource = new Map(
    dictArray(summary['repair_required_details']).map(detail => [stringValue(detail['source_id']), detail]),
  );
  const normalized: Dict[] = [];
  const seen = new Set<string>();
  for (const raw of Array.from(rawDetails ?? []).map(dictValue)) {
    const sourceId = stringValue(raw['source_id']);
    if (!sourceId || activeBySource[sourceId] !== true) continue;
    normalized.push({ ...raw, ...(projectedBySource.get(sourceId) ?? {}) });
    seen.add(sourceId);
  }
  for (const [sourceId, projected] of projectedBySource) {
    if (!seen.has(sourceId)) normalized.push({ ...projected });
  }
  return normalized;
}

export function normalizeRepairRequiredEvaluation(
  elements: Iterable<Dict>,
  evaluation: Dict,
): Dict {
  const summary = summarizeActiveRepairFromParserElements(elements);
  const normalizedDetails = normalizeRepairRequiredDetailsFromParserElements(elements, dictArray(evaluation['repair_required_details']));
  const normalizedSourceIds = normalizedDetails.map(detail => stringValue(detail['source_id'])).filter(Boolean);
  const normalized: Dict = {
    ...evaluation,
    repair_required_details: normalizedDetails,
    repair_required: normalizedSourceIds,
    repair_required_count: normalizedDetails.length,
    repair_required_rate: Number(summary['element_count']) ? round6(normalizedDetails.length / Number(summary['element_count'])) : 0,
    active_repair_required_by_source_id: summary['active_repair_required_by_source_id'],
  };
  const metrics = dictValue(evaluation['metrics']);
  if (Object.keys(metrics).length > 0) {
    normalized['metrics'] = {
      ...metrics,
      repair_required_count: normalized['repair_required_count'],
      repair_required_rate: normalized['repair_required_rate'],
      repair_required: normalizedSourceIds,
      repair_required_details: normalizedDetails,
      active_repair_required_by_source_id: summary['active_repair_required_by_source_id'],
      coverage_gaps: Array.isArray(metrics['coverage_gaps'])
        ? metrics['coverage_gaps'].filter(gap => !stringValue(gap).startsWith('repair_required_count:'))
        : metrics['coverage_gaps'],
    };
  }
  return normalized;
}

export function parserElementsWithIrExportReadiness(elements: Iterable<Dict>): Dict[] {
  return parserElementsForMetrics(elements).map(element => {
    const norm = parserElementToIR(element);
    const formula = buildDeonticFormulaRecordFromIR(norm);
    const decoder = buildDecoderRecordFromIR(norm);
    const syntax = buildProverSyntaxSummaryRecordFromIR(norm);
    return {
      ...element,
      ir_export_readiness: {
        formula_proof_ready: formula['proof_ready'] === true,
        decoder_requires_validation: decoder['requires_validation'] === true,
        prover_required_targets_passed: syntax['required_targets_passed'] === true,
        export_requires_validation: formula['requires_validation'] === true || decoder['requires_validation'] === true || syntax['requires_validation'] === true,
        blockers: [
          ...stringArray(formula['blockers']),
          ...stringArray(decoder['missing_slots']).map(slot => `missing_decoder_slot:${slot}`),
          ...stringArray(syntax['parser_warnings']),
        ],
      },
    };
  });
}

export function parserElementsToIrAlignedExportTables(
  elements: Iterable<Dict>,
  legacyTables: Record<string, Dict[]> = {},
): Record<string, Dict[]> {
  const readinessRows = parserElementsWithIrExportReadiness(elements);
  const norms = readinessRows.map(parserElementToIR);
  const decoderRecords = buildDecoderRecordsFromIRs(norms);
  const syntaxSummaries = norms.map(norm => buildProverSyntaxSummaryRecordFromIR(norm));
  const formulaRecords = norms.map(norm => buildDeonticFormulaRecordFromIR(norm));
  const provenanceAudits = buildIrSlotProvenanceAuditRecords(norms);
  const reconstructionLoss = buildReconstructionSlotLossRecords(decoderRecords);
  const capabilityRecords = buildDeterministicParserCapabilityProfileRecords(norms.map(normToCapabilityRecord));
  const phase8Summaries = buildPhase8QualitySummaryRecords(capabilityRecords.map(record => ({ ...record }))).map(row => ({
    phase8_quality_summary_id: stableId('phase8-quality-summary', stringValue(row['label']), String(row['total'])),
    ...row,
  }));

  const repairDetails = activeRepairDetailsFromParserElements(readinessRows);
  const tables: Record<string, Dict[]> = {
    canonical: norms.map(norm => ({
      ...legalNormIRToDict(norm),
      text: norm.source_text,
      source_span: supportSpanFromRecord({ support_span: norm.source_span }),
    })),
    formal_logic: formulaRecords,
    proof_obligations: formulaRecords.map(record => ({
      proof_obligation_id: stableId('proof-obligation', stringValue(record['source_id']), stringValue(record['formula_id'])),
      source_id: record['source_id'],
      formula_id: record['formula_id'],
      target_logic: record['target_logic'],
      proof_ready: record['proof_ready'],
      requires_validation: record['requires_validation'],
      blockers: record['blockers'],
      schema_version: record['schema_version'],
    })),
    repair_queue: repairDetails.map(detail => ({
      repair_id: stableId('repair', stringValue(detail['source_id']), stringArray(detail['active_repair_warnings']).join('|')),
      ...detail,
    })),
    decoder_reconstructions: decoderRecords,
    prover_syntax_summaries: syntaxSummaries,
    reconstruction_slot_loss: reconstructionLoss,
    ir_slot_provenance_audits: provenanceAudits,
    phase8_quality_summaries: phase8Summaries,
  };

  for (const [tableName, rows] of Object.entries(legacyTables ?? {})) {
    if (!(tableName in EXPORT_TABLE_SPECS)) tables[tableName] = rows.map(dictValue);
  }
  return tables;
}

function normToCapabilityRecord(norm: LegalNormIR): NormRecord {
  return {
    sourceId: norm.source_id,
    normType: norm.norm_type,
    modality: norm.modality,
    formula: stringValue(buildDeonticFormulaRecordFromIR(norm)['formula']),
    proofReady: legalNormIRProofReady(norm),
    requiresValidation: legalNormIRDecoderRequiresValidation(norm),
    repairRequired: !legalNormIRProofReady(norm),
    blockers: legalNormIRBlockers(norm),
    actor: norm.actor,
    proposition: norm.action,
    action: norm.action,
    condition: norm.conditions.length > 0 ? norm.conditions : undefined,
    resource: norm.action_object || norm.recipient,
  };
}

export function validateExportTables(tables: Record<string, Iterable<Dict>>): Dict {
  const errors: Dict[] = [];
  for (const [tableName, spec] of Object.entries(EXPORT_TABLE_SPECS)) {
    const rows = Array.from(tables[tableName] ?? []).map(dictValue);
    const seen = new Set<unknown>();
    for (const [rowIndex, row] of rows.entries()) {
      const keyValue = row[spec.primary_key];
      if (!keyValue) {
        errors.push({ table: tableName, row_index: rowIndex, field: spec.primary_key, message: 'missing primary key' });
      } else if (seen.has(keyValue)) {
        errors.push({ table: tableName, row_index: rowIndex, field: spec.primary_key, message: 'duplicate primary key' });
      } else {
        seen.add(keyValue);
      }
      if (spec.requires_source_id && !row['source_id']) {
        errors.push({ table: tableName, row_index: rowIndex, field: 'source_id', message: 'missing source_id' });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export const build_decoder_record_from_ir = buildDecoderRecordFromIR;
export const build_decoder_records_from_irs = buildDecoderRecordsFromIRs;
export const build_ir_slot_provenance_audit_record = buildIrSlotProvenanceAuditRecord;
export const build_ir_slot_provenance_audit_records = buildIrSlotProvenanceAuditRecords;
export const build_decoder_slot_grounding_audit_record = buildDecoderSlotGroundingAuditRecord;
export const build_decoder_slot_grounding_audit_record_from_ir = buildDecoderSlotGroundingAuditRecordFromIR;
export const build_decoder_slot_grounding_audit_records_from_irs = buildDecoderSlotGroundingAuditRecordsFromIRs;
export const summarize_decoder_slot_grounding_audit_records = summarizeDecoderSlotGroundingAuditRecords;
export const summarize_decoder_reconstruction_records = summarizeDecoderReconstructionRecords;
export const build_prover_syntax_summary_record_from_ir = buildProverSyntaxSummaryRecordFromIR;
export const build_prover_syntax_target_coverage_record = buildProverSyntaxTargetCoverageRecord;
export const build_prover_syntax_target_coverage_records_from_irs = buildProverSyntaxTargetCoverageRecordsFromIRs;
export const summarize_prover_syntax_target_corpus_coverage = summarizeProverSyntaxTargetCorpusCoverage;
export const summarize_prover_target_quality_gates = summarizeProverTargetQualityGates;
export const summarize_prover_target_role_matrix = summarizeProverTargetRoleMatrix;
export const summarize_prover_target_semantic_families = summarizeProverTargetSemanticFamilies;
export const summarize_reconstruction_slot_loss = summarizeReconstructionSlotLoss;
export const build_reconstruction_slot_loss_record = buildReconstructionSlotLossRecord;
export const build_reconstruction_slot_loss_records = buildReconstructionSlotLossRecords;
export const parser_elements_for_metrics = parserElementsForMetrics;
export const parser_element_has_active_repair = parserElementHasActiveRepair;
export const active_repair_details_from_parser_elements = activeRepairDetailsFromParserElements;
export const summarize_active_repair_from_parser_elements = summarizeActiveRepairFromParserElements;
export const normalize_repair_required_details_from_parser_elements = normalizeRepairRequiredDetailsFromParserElements;
export const normalize_repair_required_evaluation = normalizeRepairRequiredEvaluation;
export const parser_elements_with_ir_export_readiness = parserElementsWithIrExportReadiness;
export const parser_elements_to_ir_aligned_export_tables = parserElementsToIrAlignedExportTables;
export const validate_export_tables = validateExportTables;

/**
 * deontic-formula-builder.ts
 *
 * Build deterministic deontic/frame-logic formula strings from LegalNormIR.
 * TypeScript port of ipfs_datasets_py/logic/deontic/formula_builder.py
 *   (focused on the public API: buildDeonticFormulaFromIR + helpers)
 *
 * Provides:
 *   normalizePredicateName()     — legal phrase → stable predicate symbol
 *   canonicalModalityOperator()  — modality string → O | P | F | DEF | … | ""
 *   buildDeonticFormulaFromIR()  — LegalNormIR → deontic formula string
 *   buildDeonticFormulasFromIRList() — LegalNormIR[] → string[]
 */

import type { LegalNormIR } from './deontic/legal-norm-ir.js';

// ---------------------------------------------------------------------------
// normalizePredicateName
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
]);

/**
 * Normalize a legal phrase to a stable PascalCase predicate symbol.
 *
 * @example
 *   normalizePredicateName('the right to privacy') → 'RightPrivacy'
 *   normalizePredicateName('apply for benefits')    → 'ApplyForBenefits'
 */
export function normalizePredicateName(name: string): string {
  if (!name?.trim()) return 'P';

  // Replace underscores/hyphens with spaces, strip non-alphanumeric
  let clean = String(name)
    .replace(/[_\-]+/g, ' ')
    .replace(/[^0-9A-Za-z\s]/g, '');

  const words = clean.trim().split(/\s+/);
  if (words.length === 0) return 'P';

  // Preserve "for" when preceded by apply/applies/applied/applying (see Python)
  const protectedIndices = new Set<number>();
  if (
    words.length >= 2 &&
    /^appli(y|es|ed|ying)$/i.test(words[0]) &&
    words[1].toLowerCase() === 'for'
  ) {
    protectedIndices.add(1);
  }

  const filtered = words.filter(
    (w, i) => protectedIndices.has(i) || !STOP_WORDS.has(w.toLowerCase())
  );

  if (filtered.length === 0) return 'P';

  const predicate = filtered.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  // Must start with alpha
  return /^[A-Za-z]/.test(predicate) ? predicate : `N${predicate}`;
}

// ---------------------------------------------------------------------------
// canonicalModalityOperator
// ---------------------------------------------------------------------------

const CANONICAL_MODALITY_OPS = new Set(['O', 'P', 'F', 'DEF', 'APP', 'EXEMPT', 'LIFE', 'PURP']);

const NORM_TYPE_MAP: Record<string, string> = {
  obligation: 'O',
  mandatory_obligation: 'O',
  duty: 'O',
  requirement: 'O',
  penalty: 'O',
  sanction: 'O',
  permission: 'P',
  entitlement: 'P',
  authorization: 'P',
  prohibition: 'F',
  violation: 'F',
  offense: 'F',
  infraction: 'F',
  definition: 'DEF',
  applicability: 'APP',
  exemption: 'EXEMPT',
  instrument_lifecycle: 'LIFE',
  purpose: 'PURP',
};

const TEXTUAL_MAP: Record<string, string> = {
  obligation: 'O', obligatory: 'O', duty: 'O', must: 'O', shall: 'O',
  required: 'O', requirement: 'O', mandatory: 'O',
  permission: 'P', permitted: 'P', may: 'P', authorized: 'P', allowed: 'P',
  entitled: 'P', entitlement: 'P',
  prohibition: 'F', prohibited: 'F', forbidden: 'F', 'must not': 'F',
  'shall not': 'F', 'may not': 'F', cannot: 'F', 'can not': 'F',
  'not permitted': 'F', 'not allowed': 'F', violation: 'F', offense: 'F',
  infraction: 'F',
  definition: 'DEF', defined: 'DEF', means: 'DEF',
  applicability: 'APP', applies: 'APP', applies_to: 'APP',
  exemption: 'EXEMPT', exempt: 'EXEMPT', exempted: 'EXEMPT',
  lifecycle: 'LIFE', instrument_lifecycle: 'LIFE', expires: 'LIFE',
  purpose: 'PURP', 'in order to': 'PURP', 'for the purpose': 'PURP',
};

function modalityFromText(text: string): string {
  const lower = text.trim().toLowerCase();
  // Try direct lookup
  if (TEXTUAL_MAP[lower]) return TEXTUAL_MAP[lower];
  // Try prefix matching for longer phrases
  for (const [key, op] of Object.entries(TEXTUAL_MAP)) {
    if (lower.includes(key)) return op;
  }
  return '';
}

/**
 * Return the canonical deontic operator for a modality/norm_type pair.
 * Returns '' when the operator cannot be determined.
 */
export function canonicalModalityOperator(modality: string, normType = ''): string {
  const rawModality = String(modality ?? '').trim();
  if (rawModality) {
    const upper = rawModality.toUpperCase();
    if (CANONICAL_MODALITY_OPS.has(upper)) return upper;
    const inferred = modalityFromText(rawModality);
    if (inferred) return inferred;
  }
  const normTypeLower = String(normType ?? '').trim().toLowerCase();
  if (normTypeLower) {
    const mapped = NORM_TYPE_MAP[normTypeLower];
    if (mapped) return mapped;
    const inferred = modalityFromText(normTypeLower);
    if (inferred) return inferred;
  }
  return '';
}

// ---------------------------------------------------------------------------
// buildDeonticFormulaFromIR
// ---------------------------------------------------------------------------

function normModality(norm: LegalNormIR): string {
  const canonical = canonicalModalityOperator(norm.modality, norm.norm_type);
  return canonical || String(norm.modality ?? '').trim().toUpperCase();
}

function applicabilityTarget(action: string): string {
  const lower = action.toLowerCase();
  if (lower.startsWith('apply to ')) return action.slice('apply to '.length);
  if (lower.startsWith('applies to ')) return action.slice('applies to '.length);
  if (lower.startsWith('applicable to ')) return action.slice('applicable to '.length);
  return action;
}

function normFormula(operator: string, subject: string, action: string): string {
  const sub = normalizePredicateName(subject);
  const act = normalizePredicateName(action);
  return `${operator}(${sub}, ${act})`;
}

/**
 * Build a deterministic deontic/frame-logic formula string from a LegalNormIR.
 *
 * @example
 *   buildDeonticFormulaFromIR({ modality: 'O', actor: 'Person', action: 'Register' })
 *   // → 'O(Person, Register)'
 *   buildDeonticFormulaFromIR({ modality: 'DEF', actor: 'Agency' })
 *   // → 'Definition(Agency)'
 */
export function buildDeonticFormulaFromIR(norm: LegalNormIR): string {
  const operator = normModality(norm);

  if (operator === 'DEF') {
    const subject = normalizePredicateName(norm.actor || 'DefinedTerm');
    return `Definition(${subject})`;
  }

  if (operator === 'PURP' || norm.norm_type === 'purpose') {
    const subject = normalizePredicateName(norm.actor || 'Entity');
    const action = normalizePredicateName(norm.action || 'Purpose');
    return `Purpose(${subject}, ${action})`;
  }

  if (operator === 'APP') {
    const subject = normalizePredicateName(norm.actor || 'Scope');
    const target = normalizePredicateName(applicabilityTarget(norm.action || 'Apply'));
    return `AppliesTo(${subject}, ${target})`;
  }

  if (operator === 'EXEMPT') {
    const subject = normalizePredicateName(norm.actor || 'Entity');
    let actionText = norm.action || 'Requirement';
    if (actionText.toLowerCase().startsWith('exempt from ')) {
      actionText = actionText.slice('exempt from '.length);
    }
    return `ExemptFrom(${subject}, ${normalizePredicateName(actionText)})`;
  }

  if (operator === 'LIFE' || norm.norm_type === 'instrument_lifecycle') {
    const subject = normalizePredicateName(norm.actor || 'Instrument');
    const actionText = norm.action || 'lifecycle';
    const lower = actionText.toLowerCase();
    if (lower.startsWith('valid for ')) {
      return `ValidFor(${subject}, ${normalizePredicateName(actionText.slice('valid for '.length))})`;
    }
    if (lower.startsWith('expires ')) {
      return `ExpiresAfter(${subject}, ${normalizePredicateName(actionText.slice('expires '.length))})`;
    }
    if (lower.startsWith('repealed')) return `Repealed(${subject})`;
    if (lower.startsWith('omitted')) return `Omitted(${subject})`;
    if (lower.startsWith('reserved')) return `Reserved(${subject})`;
    if (lower.startsWith('transferred')) return `Transferred(${subject})`;
    return `Lifecycle(${subject}, ${normalizePredicateName(actionText)})`;
  }

  // Default: O / P / F (or unknown → treat as O)
  const op = operator || 'O';
  const subject = norm.actor || 'Agent';
  const action = norm.action || 'Act';
  return normFormula(op, subject, action);
}

/**
 * Build formula strings for a list of norms.
 */
export function buildDeonticFormulasFromIRList(norms: LegalNormIR[]): string[] {
  return norms.map(n => buildDeonticFormulaFromIR(n));
}

export function buildDeonticFormulaRecordFromIR(norm: LegalNormIR): Record<string, unknown> {
  const formula = buildDeonticFormulaFromIR(norm);
  const blockers = arrayField((norm as unknown as Record<string, unknown>).blockers).map(String);
  const parserWarnings = arrayField(norm.quality?.parser_warnings).map(String);
  const proofReady = Boolean((norm as unknown as Record<string, unknown>).proof_ready ?? norm.quality?.promotable_to_theorem);
  return {
    formula_id: stableFormulaId(norm.source_id, formula),
    source_id: norm.source_id,
    canonical_citation: norm.canonical_citation,
    parent_source_id: norm.parent_source_id,
    enumeration_label: norm.enumeration_label,
    enumeration_index: norm.enumeration_index,
    is_enumerated_child: norm.is_enumerated_child,
    target_logic: targetLogicForNorm(norm),
    formula,
    modality: normModality(norm),
    norm_type: norm.norm_type,
    support_span: spanToList(norm.support_span),
    field_spans: norm.field_spans ?? {},
    proof_ready: proofReady,
    requires_validation: !proofReady,
    repair_required: !proofReady,
    blockers,
    parser_warnings: parserWarnings,
    included_formula_slots: includedFormulaSlots(norm),
    omitted_formula_slots: omittedFormulaSlots(norm),
    deterministic_resolution: {},
    schema_version: norm.schema_version,
  };
}

export function buildDeonticFormulaRecordsFromIRs(norms: Iterable<LegalNormIR>): Array<Record<string, unknown>> {
  return Array.from(norms ?? []).map(buildDeonticFormulaRecordFromIR);
}

export function buildProverSyntaxRecordsFromIR(
  norm: LegalNormIR,
  targets: Iterable<string> = ['frame_logic', 'deontic_cec', 'fol', 'deontic_fol', 'deontic_temporal_fol'],
): Array<Record<string, unknown>> {
  const formulaRecord = buildDeonticFormulaRecordFromIR(norm);
  return Array.from(targets ?? []).map(target => ({
    prover_syntax_record_id: stableFormulaId(norm.source_id, `${target}:${formulaRecord.formula}`),
    source_id: norm.source_id,
    formula_id: formulaRecord.formula_id,
    target_logic: target,
    formula: formulaRecord.formula,
    syntax_valid: Boolean(formulaRecord.proof_ready),
    status: formulaRecord.proof_ready ? 'passed' : 'requires_validation',
    target_quality_gate: {
      formal_validation_complete: Boolean(formulaRecord.proof_ready),
      failed_quality_checks: formulaRecord.proof_ready ? [] : formulaRecord.blockers,
    },
    schema_version: norm.schema_version,
  }));
}

export function parserElementToFormulaRecord(element: Record<string, unknown>): Record<string, unknown> {
  return buildDeonticFormulaRecordFromIR(parserElementToNorm(element));
}

export const build_deontic_formula_record_from_ir = buildDeonticFormulaRecordFromIR;
export const build_deontic_formula_records_from_irs = buildDeonticFormulaRecordsFromIRs;
export const build_prover_syntax_records_from_ir = buildProverSyntaxRecordsFromIR;
export const parser_element_to_formula_record = parserElementToFormulaRecord;

function targetLogicForNorm(norm: LegalNormIR): string {
  if (norm.norm_type === 'definition') return 'definition';
  if (norm.norm_type === 'purpose') return 'purpose';
  if (norm.norm_type === 'applicability') return 'applicability';
  if (norm.norm_type === 'exemption') return 'exemption';
  if (norm.norm_type === 'instrument_lifecycle') return 'instrument_lifecycle';
  return 'deontic';
}

function includedFormulaSlots(norm: LegalNormIR): string[] {
  return ['actor', 'modality', 'action', 'conditions', 'exceptions', 'temporal_constraints']
    .filter(slot => {
      const value = (norm as unknown as Record<string, unknown>)[slot];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    });
}

function omittedFormulaSlots(norm: LegalNormIR): string[] {
  const included = new Set(includedFormulaSlots(norm));
  return ['actor', 'modality', 'action', 'conditions', 'exceptions', 'temporal_constraints']
    .filter(slot => !included.has(slot));
}

function parserElementToNorm(element: Record<string, unknown>): LegalNormIR {
  const sourceText = String(element.text ?? element.source_text ?? '');
  const supportText = String(element.support_text ?? sourceText);
  const action = firstValue(element.action) || 'Act';
  const actor = firstValue(element.subject) || 'Agent';
  return {
    schema_version: String(element.schema_version ?? 'deterministic_deontic_v12'),
    source_id: String(element.source_id ?? stableFormulaId(sourceText, action)),
    canonical_citation: String(element.canonical_citation ?? ''),
    parent_source_id: String(element.parent_source_id ?? ''),
    enumeration_label: String(element.enumeration_label ?? ''),
    enumeration_index: element.enumeration_index === undefined || element.enumeration_index === null ? null : Number(element.enumeration_index),
    is_enumerated_child: Boolean(element.is_enumerated_child),
    source_text: sourceText,
    support_text: supportText,
    source_span: spanFromValue(element.source_span, sourceText.length),
    support_span: spanFromValue(element.support_span, supportText.length),
    modality: String(element.deontic_operator ?? element.modality ?? 'O'),
    norm_type: String(element.norm_type ?? 'obligation'),
    actor,
    action,
    action_verb: String(element.action_verb ?? action.split(/\s+/)[0] ?? ''),
    action_object: String(element.action_object ?? action.split(/\s+/).slice(1).join(' ')),
    recipient: String(element.action_recipient ?? element.recipient ?? ''),
    mental_state: String(element.mental_state ?? ''),
    conditions: arrayField(element.conditions).map(String),
    exceptions: arrayField(element.exceptions).map(String),
    overrides: arrayField(element.override_clauses).map(String),
    temporal_constraints: arrayField(element.temporal_constraints).map(String),
    cross_references: arrayField(element.cross_references).map(String),
    resolved_cross_references: arrayField(element.resolved_cross_references) as never[],
    defined_terms: arrayField(element.defined_term_refs).map(String),
    penalty: (element.penalty ?? {}) as never,
    procedure: (element.procedure ?? {}) as never,
    ontology_terms: arrayField(element.ontology_terms) as never[],
    field_spans: (element.field_spans ?? {}) as never,
    quality: {
      schema_valid: element.schema_valid === true,
      slot_coverage: Number(element.slot_coverage ?? 0),
      scaffold_quality: Number(element.scaffold_quality ?? 0),
      quality_label: String(element.quality_label ?? ''),
      parser_warnings: arrayField(element.parser_warnings).map(String),
      promotable_to_theorem: element.promotable_to_theorem === true,
      export_readiness: (element.export_readiness ?? {}) as never,
    },
  } as unknown as LegalNormIR;
}

function spanToList(span: unknown): [number, number] {
  if (Array.isArray(span)) return [Number(span[0] ?? 0), Number(span[1] ?? 0)];
  if (span && typeof span === 'object') {
    const record = span as Record<string, unknown>;
    return [Number(record.start ?? 0), Number(record.end ?? 0)];
  }
  return [0, 0];
}

function spanFromValue(value: unknown, fallbackEnd: number): { start: number; end: number } {
  const span = spanToList(value);
  return { start: span[0], end: span[1] || fallbackEnd };
}

function firstValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? String(value[0] ?? '') : '';
  return value === undefined || value === null ? '' : String(value);
}

function arrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function stableFormulaId(sourceId: string, formula: string): string {
  return `formula:${fnv1a(`${sourceId}::${formula}`).padStart(8, '0')}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

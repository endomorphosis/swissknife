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
import { sha256Hex } from './provers/browser-crypto.js';

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
  if (lower.startsWith('apply ')) return action.slice('apply '.length);
  return action;
}

function normFormula(operator: string, subject: string, action: string): string {
  const sub = normalizePredicateName(subject);
  const act = normalizePredicateName(action);
  return `${operator}(${sub}, ${act})`;
}

const FORMULA_CONDITION_LIMIT = 3;
const FORMULA_EXCEPTION_LIMIT = 3;
const MENTAL_STATE_TERMS = new Set([
  'knowingly',
  'intentionally',
  'willfully',
  'recklessly',
  'negligently',
  'purposely',
  'maliciously',
  'fraudulently',
]);

function formulaActionText(norm: LegalNormIR): string {
  const action = String(norm.action ?? '').trim();
  if (action) return action;

  const verb = String(norm.action_verb ?? '').trim();
  const actionObject = String(norm.action_object ?? '').trim();
  if (verb && actionObject) {
    return actionObject.toLowerCase().startsWith(`${verb.toLowerCase()} `)
      ? actionObject
      : `${verb} ${actionObject}`;
  }
  if (verb) {
    const recipient = String(norm.recipient ?? '').trim();
    return recipient ? `${verb} ${recipient}` : verb;
  }
  if (actionObject) return actionObject;
  return 'Action';
}

function formulaOperator(norm: LegalNormIR, actionText: string): string {
  if (isFailureProhibition(norm, actionText)) return 'O';
  if (
    isRefrainObligation(norm, actionText) ||
    isPreventionObligation(norm, actionText) ||
    isConfidentialityObligation(norm, actionText)
  ) {
    return 'F';
  }
  return normModality(norm) || 'O';
}

function actionWithoutMentalState(action: string): string {
  const words = String(action ?? '').match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? [];
  if (words.length > 0 && MENTAL_STATE_TERMS.has(words[0].toLowerCase())) {
    return words.slice(1).join(' ').trim();
  }
  return action;
}

function mentalStatePredicate(norm: LegalNormIR): string {
  const explicit = normalizePredicateName(String(norm.mental_state ?? ''));
  if (explicit && explicit !== 'P') return explicit;

  const words = String(norm.action ?? '').match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? [];
  if (words.length > 0 && MENTAL_STATE_TERMS.has(words[0].toLowerCase())) {
    return normalizePredicateName(words[0]);
  }
  return '';
}

function isFailureProhibition(norm: LegalNormIR, actionText: string): boolean {
  if (normModality(norm) !== 'F') return false;
  return /^(?:fail(?:ure)?|refus(?:e|al)|neglect(?:s|ed|ing)?|omit(?:s|ted|ting)?)(?:\s+or\s+(?:fail(?:ure)?|refus(?:e|al)|neglect(?:s|ed|ing)?|omit(?:s|ted|ting)?))*\s+to\s+\S/i
    .test(String(actionText ?? '').trim());
}

function stripFailureAction(actionText: string): string {
  return String(actionText ?? '')
    .trim()
    .replace(/^(?:fail(?:ure)?|refus(?:e|al)|neglect(?:s|ed|ing)?|omit(?:s|ted|ting)?)(?:\s+or\s+(?:fail(?:ure)?|refus(?:e|al)|neglect(?:s|ed|ing)?|omit(?:s|ted|ting)?))*\s+to\s+/i, '')
    .trim();
}

function isRefrainObligation(norm: LegalNormIR, actionText: string): boolean {
  return normModality(norm) === 'O' && /^(?:refrain|abstain|forbear)\s+from\s+\S/i.test(String(actionText ?? '').trim());
}

function stripRefrainAction(actionText: string): string {
  return normalizeRefrainActionHead(
    String(actionText ?? '').trim().replace(/^(?:refrain|abstain|forbear)\s+from\s+/i, '')
  );
}

function normalizeRefrainActionHead(actionText: string): string {
  const parts = String(actionText ?? '').trim().split(/\s+/, 2);
  if (parts.length === 0 || !parts[0]) return '';
  const legalGerunds: Record<string, string> = {
    accessing: 'access',
    disclosing: 'disclose',
    removing: 'remove',
    altering: 'alter',
    destroying: 'destroy',
    interfering: 'interfere',
    impeding: 'impede',
  };
  const replacement = legalGerunds[parts[0].toLowerCase()];
  if (replacement) {
    const rest = String(actionText ?? '').trim().split(/\s+/).slice(1).join(' ');
    return `${replacement}${rest ? ` ${rest}` : ''}`;
  }
  return actionText;
}

function isPreventionObligation(norm: LegalNormIR, actionText: string): boolean {
  return normModality(norm) === 'O' && /^(?:prevent|avoid|prohibit)\s+\S/i.test(String(actionText ?? '').trim());
}

function stripPreventionAction(actionText: string): string {
  const stripped = String(actionText ?? '').trim().replace(/^(?:prevent|avoid|prohibit)\s+/i, '');
  return normalizePreventionActionHead(stripped);
}

function normalizePreventionActionHead(actionText: string): string {
  const words = String(actionText ?? '').trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return '';
  const legalActions: Record<string, string> = {
    entry: 'enter',
    access: 'access',
    discharge: 'discharge',
    disclosure: 'disclose',
    removal: 'remove',
    alteration: 'alter',
    destruction: 'destroy',
  };
  const replacement = legalActions[words[0].toLowerCase()];
  if (replacement) words[0] = replacement;
  return words.join(' ');
}

function isConfidentialityObligation(norm: LegalNormIR, actionText: string): boolean {
  return normModality(norm) === 'O' && /^(?:keep|maintain|preserve)\s+\S+\s+confidential\b/i.test(String(actionText ?? '').trim());
}

function stripConfidentialityAction(actionText: string): string {
  return String(actionText ?? '')
    .trim()
    .replace(/^(?:keep|maintain|preserve)\s+/i, 'disclose ')
    .replace(/\s+confidential\b/i, '')
    .trim();
}

function subjectPredicateExpr(norm: LegalNormIR): string {
  const actors = arrayField((norm as unknown as Record<string, unknown>).actor_entities)
    .map(String)
    .filter(value => value.trim());
  if (actors.length === 0) actors.push(norm.actor || 'Agent');

  const predicates = uniquePredicates(actors);
  if (predicates.length === 0) predicates.push(normalizePredicateName(norm.actor || 'Agent'));
  if (predicates.length === 1) return `${predicates[0]}(x)`;
  return `(${predicates.map(predicate => `${predicate}(x)`).join(' ∨ ')})`;
}

function uniquePredicates(texts: Iterable<unknown>): string[] {
  const predicates: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const predicate = normalizePredicateName(String(text ?? ''));
    if (!predicate || predicate === 'P' || seen.has(predicate)) continue;
    predicates.push(predicate);
    seen.add(predicate);
  }
  return predicates;
}

function uniqueAntecedentPredicates(predicates: Iterable<string>): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const predicate of predicates) {
    if (!predicate || predicate === 'P' || seen.has(predicate)) continue;
    unique.push(predicate);
    seen.add(predicate);
  }
  return unique;
}

function slotPrimaryText(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const record = item as Record<string, unknown>;
  for (const key of [
    'value',
    'normalized_text',
    'raw_text',
    'text',
    'condition_text',
    'exception_text',
    'clause_text',
    'predicate_text',
    'description',
    'canonical_citation',
    'citation',
  ]) {
    const value = record[key];
    if (value) return String(value).trim();
  }
  return '';
}

function formulaConditionTexts(norm: LegalNormIR): string[] {
  return arrayField(norm.conditions)
    .map(slotPrimaryText)
    .filter(Boolean);
}

function formulaExceptionTexts(norm: LegalNormIR): string[] {
  return arrayField(norm.exceptions)
    .map(slotPrimaryText)
    .filter(Boolean);
}

function temporalPredicateText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const record = item as Record<string, unknown>;
  const type = String(record.type ?? record.constraint_type ?? '').trim();
  const value = slotPrimaryText(record);
  return type && value ? `${type} ${value}` : value;
}

function formulaTemporalPredicates(items: unknown): string[] {
  return uniquePredicates(arrayField(items).map(temporalPredicateText)).slice(0, 3);
}

function formulaProcedurePredicates(procedure: unknown): string[] {
  if (!procedure || typeof procedure !== 'object' || Array.isArray(procedure)) return [];
  const record = procedure as Record<string, unknown>;
  const predicates: string[] = [];
  const seen = new Set<string>();
  for (const relation of arrayField(record.event_relations)) {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
    const rel = relation as Record<string, unknown>;
    const prefix = procedureTriggerFormulaPrefix(String(rel.relation ?? ''));
    const anchor = String(rel.anchor_event ?? record.trigger_event ?? '').trim();
    if (!prefix || !anchor) continue;
    const predicate = normalizePredicateName(`${prefix} ${anchor}`);
    if (predicate && predicate !== 'P' && !seen.has(predicate)) {
      predicates.push(predicate);
      seen.add(predicate);
    }
  }
  return predicates.slice(0, 3);
}

function procedureTriggerFormulaPrefix(relation: string): string {
  const normalized = relation.trim().toLowerCase().replace(/[-\s]+/g, '_');
  const map: Record<string, string> = {
    triggered_by: 'triggered by',
    triggered_by_receipt_of: 'receipt of',
    after: 'after',
    before: 'before',
    upon: 'upon',
    upon_receipt_of: 'receipt of',
  };
  return map[normalized] ?? '';
}

/**
 * Build a deterministic deontic/frame-logic formula string from a LegalNormIR.
 *
 * @example
 *   buildDeonticFormulaFromIR({ modality: 'O', actor: 'Person', action: 'Register' })
 *   // → 'O(∀x (Person(x) → Register(x)))'
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

  let actionText = actionWithoutMentalState(formulaActionText(norm));
  const op = formulaOperator(norm, actionText);
  if (isFailureProhibition(norm, actionText)) {
    actionText = stripFailureAction(actionText);
  } else if (isRefrainObligation(norm, actionText)) {
    actionText = stripRefrainAction(actionText);
  } else if (isPreventionObligation(norm, actionText)) {
    actionText = stripPreventionAction(actionText);
  } else if (isConfidentialityObligation(norm, actionText)) {
    actionText = stripConfidentialityAction(actionText);
  }

  const actionPred = actionText ? normalizePredicateName(actionText) : 'Action';
  const conditionPreds = uniquePredicates(formulaConditionTexts(norm));
  const exceptionPreds = uniquePredicates(formulaExceptionTexts(norm));
  const temporalPreds = formulaTemporalPredicates(norm.temporal_constraints);
  const procedurePreds = formulaProcedurePredicates(norm.procedure);
  const mentalPred = mentalStatePredicate(norm);
  const modifiers = [...temporalPreds, ...procedurePreds];
  if (mentalPred && mentalPred !== 'P') modifiers.push(mentalPred);

  const antecedentPreds = uniqueAntecedentPredicates([
    ...conditionPreds.slice(0, FORMULA_CONDITION_LIMIT),
    ...modifiers,
  ]);
  const innerParts = [subjectPredicateExpr(norm)];
  innerParts.push(...antecedentPreds.map(predicate => `${predicate}(x)`));
  innerParts.push(...exceptionPreds.slice(0, FORMULA_EXCEPTION_LIMIT).map(predicate => `¬${predicate}(x)`));
  const inner = innerParts.join(' ∧ ');
  return `${op}(∀x (${inner} → ${actionPred}(x)))`;
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
  const readinessBlockers = blockers.length > 0
    ? blockers
    : arrayField(norm.quality?.export_readiness?.['blockers']).map(String);
  const effectiveBlockers = readinessBlockers.length > 0 ? readinessBlockers : parserWarnings;
  const deterministicResolution = deterministicFormulaResolution(norm, effectiveBlockers);
  const explicitProofReady = (norm as unknown as Record<string, unknown>).proof_ready;
  const proofReady = explicitProofReady === true ||
    norm.quality?.promotable_to_theorem === true ||
    Object.keys(deterministicResolution).length > 0;
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
    proposition: norm.action,
    action: norm.action,
    support_span: spanToList(norm.support_span),
    field_spans: norm.field_spans ?? {},
    proof_ready: proofReady,
    requires_validation: !proofReady,
    repair_required: !proofReady,
    blockers: effectiveBlockers,
    parser_warnings: parserWarnings,
    included_formula_slots: includedFormulaSlots(norm),
    omitted_formula_slots: omittedFormulaSlots(norm),
    deterministic_resolution: deterministicResolution,
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
    proposition: formulaRecord.proposition,
    action: formulaRecord.action,
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

export function parserElementToFormula(element: Record<string, unknown>): string {
  return buildDeonticFormulaFromIR(parserElementToNorm(element));
}

export const build_deontic_formula_record_from_ir = buildDeonticFormulaRecordFromIR;
export const build_deontic_formula_records_from_irs = buildDeonticFormulaRecordsFromIRs;
export const build_prover_syntax_records_from_ir = buildProverSyntaxRecordsFromIR;
export const parser_element_to_formula_record = parserElementToFormulaRecord;
export const parser_element_to_formula = parserElementToFormula;

function targetLogicForNorm(norm: LegalNormIR): string {
  const modality = normModality(norm);
  if (
    ['APP', 'EXEMPT', 'LIFE'].includes(modality) ||
    ['applicability', 'exemption', 'instrument_lifecycle'].includes(norm.norm_type)
  ) {
    return 'frame_logic';
  }
  return 'deontic';
}

function includedFormulaSlots(norm: LegalNormIR): string[] {
  const included = ['actor', 'modality'];
  if (String(norm.mental_state ?? '').trim()) included.push('mental_state');
  if (arrayField(norm.conditions).length > 0) included.push('conditions');
  if (arrayField(norm.temporal_constraints).length > 0) included.push('temporal_constraints');
  if (formulaProcedurePredicates(norm.procedure).length > 0) included.push('procedure');
  included.push('action');
  if (arrayField(norm.exceptions).length > 0) included.push('exceptions');
  return included;
}

function omittedFormulaSlots(norm: LegalNormIR): Record<string, unknown[]> {
  const omitted: Record<string, unknown[]> = {};
  const conditions = arrayField(norm.conditions);
  const exceptions = arrayField(norm.exceptions);
  if (conditions.length > FORMULA_CONDITION_LIMIT) {
    omitted.conditions = cappedOmissionRecords(conditions, FORMULA_CONDITION_LIMIT, 'condition');
  }
  if (exceptions.length > FORMULA_EXCEPTION_LIMIT) {
    omitted.exceptions = cappedOmissionRecords(exceptions, FORMULA_EXCEPTION_LIMIT, 'exception');
  }
  if (arrayField(norm.overrides).length > 0) omitted.overrides = arrayField(norm.overrides);
  return omitted;
}

function cappedOmissionRecords(items: unknown[], limit: number, field: string): Array<Record<string, unknown>> {
  return items.slice(limit).flatMap(item => {
    const value = slotPrimaryText(item);
    const predicate = normalizePredicateName(value);
    if (!value || !predicate || predicate === 'P') return [];
    return [{
      value,
      field,
      predicate,
      reason: `${field} is preserved in IR but omitted from capped deontic formula antecedents`,
    }];
  });
}

function deterministicFormulaResolution(norm: LegalNormIR, blockers: string[]): Record<string, unknown> {
  const blockerSet = new Set(blockers);
  const exceptionTexts = formulaExceptionTexts(norm);
  if (
    blockerSet.size === 1 &&
    blockerSet.has('exception_requires_scope_review') &&
    exceptionTexts.length === 1
  ) {
    return {
      type: 'standard_substantive_exception',
      resolved_blockers: ['exception_requires_scope_review'],
      exception: exceptionTexts[0],
      exception_span: [],
      reason: 'single substantive exception is represented as a negated formula antecedent',
    };
  }
  const readiness = norm.quality?.export_readiness ?? {};
  if (
    readiness['formula_proof_ready'] === true &&
    readiness['formula_requires_validation'] !== true &&
    readiness['formula_repair_required'] !== true &&
    readiness['deterministic_resolution'] &&
    typeof readiness['deterministic_resolution'] === 'object' &&
    !Array.isArray(readiness['deterministic_resolution'])
  ) {
    return { ...(readiness['deterministic_resolution'] as Record<string, unknown>) };
  }
  return {};
}

function parserElementToNorm(element: Record<string, unknown>): LegalNormIR {
  const sourceText = String(element.text ?? element.source_text ?? '');
  const supportText = String(element.support_text ?? '');
  const action = firstValue(element.action) || firstValue(element.action_text) || firstValue(element.predicate);
  const actor = firstValue(element.subject) || 'Agent';
  const normType = String(element.norm_type ?? '');
  const modality = canonicalModalityOperator(
    String(element.deontic_operator ?? element.modality ?? ''),
    normType,
  ) || String(element.deontic_operator ?? element.modality ?? '');
  const conditions = slotArray(element.conditions);
  if (conditions.length === 0) conditions.push(...conditionRecordsFromSourceText(sourceText || supportText));
  const exceptions = slotArray(element.exceptions);
  const parserWarnings = arrayField(
    (element.quality && typeof element.quality === 'object' && !Array.isArray(element.quality)
      ? (element.quality as Record<string, unknown>).parser_warnings
      : undefined) ?? element.parser_warnings
  ).map(String);
  const exportReadiness = (element.export_readiness && typeof element.export_readiness === 'object' && !Array.isArray(element.export_readiness))
    ? element.export_readiness as Record<string, unknown>
    : {};
  return {
    schema_version: String(element.schema_version ?? ''),
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
    modality,
    norm_type: normType,
    actor,
    action,
    action_verb: String(element.action_verb ?? action.split(/\s+/)[0] ?? ''),
    action_object: String(element.action_object ?? action.split(/\s+/).slice(1).join(' ')),
    recipient: String(element.action_recipient ?? element.recipient ?? ''),
    mental_state: String(element.mental_state ?? ''),
    conditions: conditions as never[],
    exceptions: exceptions as never[],
    overrides: slotArray(element.override_clauses ?? element.overrides) as never[],
    temporal_constraints: slotArray(element.temporal_constraints) as never[],
    cross_references: slotArray(element.cross_references) as never[],
    resolved_cross_references: arrayField(element.resolved_cross_references) as never[],
    defined_terms: arrayField(element.defined_term_refs).map(String),
    penalty: (element.penalty ?? {}) as never,
    procedure: (element.procedure ?? {}) as never,
    ontology_terms: arrayField(element.ontology_terms) as never[],
    field_spans: (element.field_spans ?? {}) as never,
    quality: {
      schema_valid: nestedBoolean(element, 'schema_valid'),
      slot_coverage: Number(element.slot_coverage ?? 0),
      scaffold_quality: Number(element.scaffold_quality ?? 0),
      quality_label: String(element.quality_label ?? ''),
      parser_warnings: parserWarnings,
      promotable_to_theorem: nestedBoolean(element, 'promotable_to_theorem') ||
        exportReadiness['proof_ready'] === true ||
        exportReadiness['theorem_promotable'] === true,
      export_readiness: exportReadiness as never,
    },
  } as unknown as LegalNormIR;
}

function slotArray(value: unknown): Array<Record<string, unknown> | string> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (item && typeof item === 'object' && !Array.isArray(item)) return [{ ...(item as Record<string, unknown>) }];
    return [];
  });
}

function conditionRecordsFromSourceText(text: string): Array<Record<string, unknown>> {
  const source = String(text ?? '').trim();
  if (!source) return [];
  const match = source.match(/\bunless\s+(.+?)(?:[.;]|$)/i);
  if (!match) return [];
  const value = String(match[1] ?? '').trim();
  return value ? [{ value }] : [];
}

function nestedBoolean(element: Record<string, unknown>, key: string): boolean {
  const quality = element.quality && typeof element.quality === 'object' && !Array.isArray(element.quality)
    ? element.quality as Record<string, unknown>
    : {};
  return quality[key] === true || element[key] === true;
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
  return `formula:${sha256Hex(`${sourceId}|${formula}`).slice(0, 24)}`;
}

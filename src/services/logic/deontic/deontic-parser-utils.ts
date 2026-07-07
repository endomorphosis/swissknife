/**
 * DeonticParserUtils — pure-function utilities extracted from deontic_parser.py.
 *
 * Mirrors selected functions from
 * ipfs_datasets_py/logic/deontic/utils/deontic_parser.py (5589 lines):
 *   classify_modal()         — maps modal verbs to deontic operators
 *   classify_legal_entity()  — coarse actor/entity type classification
 *   normalize_predicate_name() — normalise predicate names for formal logic
 *   extract_action_recipient() — extract beneficiary from action phrase
 *   score_scaffold_quality()  — assess deterministic parse quality
 *
 * Sprint 18, T-96.
 * Reference: ipfs_datasets_py/logic/deontic/utils/deontic_parser.py
 */

// ---------------------------------------------------------------------------
// classify_modal
// ---------------------------------------------------------------------------

export type DeonticOperatorCode = 'O' | 'P' | 'F';
export type DeonticModalityName = 'obligation' | 'permission' | 'prohibition';

export interface ModalClassification {
  readonly modality:  DeonticModalityName;
  readonly operator:  DeonticOperatorCode;
}

const PROHIBITION_MODALS = new Set([
  'shall not', 'must not', 'may not', 'cannot', 'can not',
  'is prohibited from', 'are prohibited from',
  'is forbidden to', 'are forbidden to',
  'is not allowed to', 'are not allowed to',
]);

const PERMISSION_MODALS = new Set([
  'may', 'can',
  'is authorized to', 'are authorized to',
  'is permitted to', 'are permitted to',
  'is entitled to', 'are entitled to',
  'is allowed to', 'are allowed to',
]);

/**
 * Classify a modal word or phrase to a deontic operator.
 *
 * Prohibitions are checked first (before bare 'shall'/'must' which are obligation).
 *
 * Python ref: `classify_modal(modal)` in deontic_parser.py.
 */
export function classifyModal(modal: string): ModalClassification {
  const m = modal.replace(/\s+/g, ' ').toLowerCase().trim();
  if (PROHIBITION_MODALS.has(m)) return { modality: 'prohibition', operator: 'F' };
  if (PERMISSION_MODALS.has(m))  return { modality: 'permission',  operator: 'P' };
  return { modality: 'obligation', operator: 'O' };
}

// ---------------------------------------------------------------------------
// classify_legal_entity
// ---------------------------------------------------------------------------

export type LegalEntityType =
  | 'government_actor'
  | 'organization'
  | 'legal_person'
  | 'legal_instrument'
  | 'legal_event'
  | 'regulated_property'
  | 'legal_entity'
  | 'unknown';

const GOVERNMENT_ACTORS = new Set([
  'administrator', 'agency', 'bureau', 'city', 'commission', 'commissioner',
  'council', 'department', 'director', 'engineer', 'examiner', 'hearings',
  'mayor', 'officer', 'secretary', 'state', 'auditor',
]);

const ORGANIZATION_ACTORS = new Set([
  'business', 'company', 'corporation', 'entity', 'institution',
  'organization', 'provider',
]);

const LEGAL_PERSON_ACTORS = new Set([
  'applicant', 'borrower', 'contractor', 'defendant', 'employee', 'employer',
  'individual', 'landlord', 'lessee', 'licensee', 'owner', 'party',
  'permittee', 'person', 'plaintiff', 'resident', 'tenant', 'worker',
]);

const LEGAL_INSTRUMENT_ENTITIES = new Set([
  'approval', 'certificate', 'easement', 'franchise', 'license',
  'permit', 'registration', 'variance',
]);

const LEGAL_EVENT_ENTITIES = new Set([
  'appeal', 'citation', 'complaint', 'fee', 'hearing', 'inspection',
  'notice', 'offense', 'order', 'penalty', 'violation',
]);

const PROPERTY_ENTITIES = new Set([
  'facility', 'land', 'parcel', 'premises', 'property', 'site', 'structure',
]);

/**
 * Return a coarse actor/entity type for KG and frame-logic scaffolds.
 *
 * Python ref: `classify_legal_entity(text)` in deontic_parser.py.
 */
export function classifyLegalEntity(text: string): LegalEntityType {
  const normalized = (text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  if (!tokens.size) return 'unknown';

  if ([...tokens].some(t => GOVERNMENT_ACTORS.has(t)))  return 'government_actor';
  if ([...tokens].some(t => ORGANIZATION_ACTORS.has(t))) return 'organization';
  if ([...tokens].some(t => LEGAL_PERSON_ACTORS.has(t))) return 'legal_person';
  if ([...tokens].some(t => LEGAL_INSTRUMENT_ENTITIES.has(t))) return 'legal_instrument';
  if ([...tokens].some(t => LEGAL_EVENT_ENTITIES.has(t)))      return 'legal_event';
  if ([...tokens].some(t => PROPERTY_ENTITIES.has(t)))         return 'regulated_property';
  if ([...tokens].some(t => t.endsWith('office') || t.endsWith('board'))) return 'government_actor';

  return 'legal_entity';
}

// ---------------------------------------------------------------------------
// normalize_predicate_name
// ---------------------------------------------------------------------------

const STOP_WORDS_PRED = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);

/**
 * Normalise a raw predicate name for use in formal logic.
 *
 * Python ref: `normalize_predicate_name(name)` in deontic_parser.py.
 */
export function normalizePredicate(name: string): string {
  if (!name) return 'P';
  const cleaned = name.replace(/[_\-]+/g, ' ').replace(/[^0-9A-Za-z\s]/g, '');
  const words = cleaned.trim().split(/\s+/)
    .filter(w => !STOP_WORDS_PRED.has(w.toLowerCase()));
  if (!words.length) return 'P';
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// ---------------------------------------------------------------------------
// extract_action_recipient
// ---------------------------------------------------------------------------

const RECIPIENT_RE = /\b(?:to|for)\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/i;
const SKIP_RECIPIENTS = new Set([
  'law', 'regulation', 'section', 'chapter', 'title',
  'this section', 'this chapter', 'this title',
]);

/**
 * Extract a likely beneficiary/recipient from an action phrase.
 *
 * Python ref: `extract_action_recipient(action)` in deontic_parser.py.
 */
export function extractActionRecipient(action: string): string {
  const m = RECIPIENT_RE.exec(action ?? '');
  if (!m) return '';
  const r = m[1].trim().replace(/\s+,|,\s*$/g, '').trim();
  if (SKIP_RECIPIENTS.has(r.toLowerCase())) return '';
  return r;
}

// ---------------------------------------------------------------------------
// score_scaffold_quality
// ---------------------------------------------------------------------------

export interface ScaffoldQualityResult {
  readonly score:        number;  // 0–1
  readonly warnings:     string[];
  readonly promotable:   boolean;
  readonly quality_label: 'high' | 'medium' | 'low';
  readonly slot_coverage: number;
}

/**
 * Score whether a parsed norm element is ready to promote to a theorem.
 *
 * Accepts a generic Record with the standard deontic element fields:
 * norm_type, deontic_operator, subject, action, defined_term, etc.
 *
 * Python ref: `score_scaffold_quality(element)` in deontic_parser.py.
 */
export function scoreScaffoldQuality(
  element: Record<string, unknown>,
): ScaffoldQualityResult {
  const slotValue = (slot: string): unknown => {
    if (slot === 'action') return element['action'] ?? element['proposition'];
    return element[slot];
  };

  const warnings: string[] = [];
  const normType = element['norm_type'] as string | undefined;

  let requiredSlots: string[];
  if (normType === 'definition') {
    requiredSlots = ['defined_term', 'definition_body'];
  } else if (normType === 'purpose') {
    requiredSlots = ['subject', 'action'];
  } else {
    requiredSlots = ['deontic_operator', 'subject', 'action'];
  }

  let filled = 0;
  for (const slot of requiredSlots) {
    const val = slotValue(slot);
    const present = Array.isArray(val) ? (val as unknown[]).some(Boolean) : Boolean(val);
    if (present) {
      filled++;
    } else {
      warnings.push(`Missing required slot: ${slot}`);
    }
  }

  const slotCoverage = requiredSlots.length > 0 ? filled / requiredSlots.length : 0;
  let score = slotCoverage;

  // Bonus: promotable_to_theorem flag from parser
  if (element['promotable_to_theorem']) score = Math.min(1.0, score + 0.1);

  // Penalty: repair warnings
  const repairWarnings = element['repair_required_warnings'] as unknown[];
  if (Array.isArray(repairWarnings) && repairWarnings.length > 0) {
    score = Math.max(0, score - 0.2);
    warnings.push(`${repairWarnings.length} repair warning(s)`);
  }

  const promotable = score >= 0.8 && warnings.filter(w => !w.startsWith('Missing')).length === 0;

  return {
    score,
    warnings,
    promotable,
    quality_label: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    slot_coverage: slotCoverage,
  };
}

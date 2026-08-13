/**
 * Live-DOM accessibility evaluation (VGO-031).
 *
 * Wire models:
 *   - UiAccessibilityEvaluator@1 / ui-accessibility-evaluator/v1
 *   - AccessibilityReceipt@1 / accessibility-receipt/v1
 *   - KeyboardEvaluation@1 / keyboard-evaluation/v1
 *
 * Evaluates a live (or fixture-serialized) DOM without executing repository
 * source and without importing axe-core, Lighthouse, or any other audit
 * package. First-party rules cover labels, keyboard reachability/order/traps,
 * duplicate IDs, contrast, images, headings, and forms. Receipts separate
 * automated passes, violations, unsupported WCAG criteria, and manual checks.
 * Automated success is never WCAG certification. Critical findings are
 * machine-readable automatic-acceptance blockers.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  GUI_EXTRACTION_CONFIDENCE,
  GUI_VERIFICATION_STATUS,
  type GuiExtractionConfidence,
  type GuiVerificationStatus,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_ACCESSIBILITY_EVALUATOR_INTERFACE =
  'UiAccessibilityEvaluator@1' as const;
export const UI_ACCESSIBILITY_EVALUATOR_SCHEMA =
  'ui-accessibility-evaluator/v1' as const;

export const ACCESSIBILITY_RECEIPT_INTERFACE =
  'AccessibilityReceipt@1' as const;
export const ACCESSIBILITY_RECEIPT_SCHEMA =
  'accessibility-receipt/v1' as const;

export const KEYBOARD_EVALUATION_INTERFACE = 'KeyboardEvaluation@1' as const;
export const KEYBOARD_EVALUATION_SCHEMA = 'keyboard-evaluation/v1' as const;

export const UI_ACCESSIBILITY_CONTRACT_INTERFACE =
  'UiAccessibilityContract@1' as const;
export const UI_ACCESSIBILITY_CONTRACT_SCHEMA =
  'ui-accessibility-contract/v1' as const;

export const LIVE_DOM_SNAPSHOT_INTERFACE = 'LiveDomSnapshot@1' as const;
export const LIVE_DOM_SNAPSHOT_SCHEMA = 'live-dom-snapshot/v1' as const;

export const ACCESSIBILITY_FINDING_INTERFACE =
  'AccessibilityFinding@1' as const;
export const ACCESSIBILITY_FINDING_SCHEMA = 'accessibility-finding/v1' as const;

export const ACCESSIBILITY_ACCEPTANCE_BLOCKER_INTERFACE =
  'AccessibilityAcceptanceBlocker@1' as const;
export const ACCESSIBILITY_ACCEPTANCE_BLOCKER_SCHEMA =
  'accessibility-acceptance-blocker/v1' as const;

export const ACCESSIBILITY_TOOL_IDENTITY_INTERFACE =
  'AccessibilityToolIdentity@1' as const;
export const ACCESSIBILITY_TOOL_IDENTITY_SCHEMA =
  'accessibility-tool-identity/v1' as const;

export const UI_ACCESSIBILITY_EVALUATOR_VERSION =
  'gui-accessibility-evaluator@1.0.0' as const;

export const ACCESSIBILITY_ENGINE_ID = 'first-party-live-dom-rules' as const;
export const ACCESSIBILITY_ENGINE_VERSION = '1.0.0' as const;

/**
 * Exact axe-core version the plan would permit as the sole direct audit
 * dependency. This evaluator does not import it.
 */
export const AXE_CORE_PERMITTED_PIN = '4.6.3' as const;
export const AXE_CORE_DIRECT_DEPENDENCY_ADDED = false as const;

/** Automated tooling must never claim WCAG certification or full compliance. */
export const WCAG_COMPLIANCE_CLAIMED = false as const;
export const WCAG_CERTIFICATION_CLAIMED = false as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

export const EVIDENCE_LEVELS = Object.freeze([
  'automated',
  'structural',
  'integrity',
  'heuristic',
  'human_reviewed',
  'simulated',
] as const);
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const CONSTRAINT_CHECK_STATUSES = Object.freeze([
  'satisfied',
  'violated',
  'inconclusive',
  'unsupported',
  'skipped',
  'error',
] as const);
export type ConstraintCheckStatus = (typeof CONSTRAINT_CHECK_STATUSES)[number];

export const ACCESSIBILITY_SEVERITIES = Object.freeze([
  'critical',
  'serious',
  'moderate',
  'minor',
] as const);
export type AccessibilitySeverity = (typeof ACCESSIBILITY_SEVERITIES)[number];

export const ACCESSIBILITY_FINDING_DISPOSITIONS = Object.freeze([
  'pass',
  'violation',
  'unsupported',
  'manual_review',
] as const);
export type AccessibilityFindingDisposition =
  (typeof ACCESSIBILITY_FINDING_DISPOSITIONS)[number];

export const ACCESSIBILITY_REQUIREMENT_KINDS = Object.freeze([
  'accessible_name',
  'role',
  'keyboard_activation',
  'focus_order',
  'focus_trap',
  'focus_restore',
  'error_association',
  'required_state',
  'alt_text',
  'decorative_hidden',
  'heading_structure',
  'contrast',
  'unique_id',
  'other',
] as const);
export type AccessibilityRequirementKind =
  (typeof ACCESSIBILITY_REQUIREMENT_KINDS)[number];

export const ACCESSIBILITY_RULE_IDS = Object.freeze([
  'duplicate-id',
  'accessible-name',
  'keyboard-reachability',
  'keyboard-order',
  'focus-trap',
  'keyboard-activation',
  'contrast',
  'image-alt',
  'decorative-image',
  'heading-structure',
  'form-label',
  'required-state',
  'error-association',
  'document-lang',
  'contract-role',
  'contract-name',
] as const);
export type AccessibilityRuleId = (typeof ACCESSIBILITY_RULE_IDS)[number];

export const ACCESSIBILITY_ACCEPTANCE_BLOCKER_CODES = Object.freeze([
  'critical_violation',
  'critical_regression',
  'keyboard_trap',
  'keyboard_unreachable',
  'duplicate_id',
  'unlabeled_interactive',
  'missing_form_label',
] as const);
export type AccessibilityAcceptanceBlockerCode =
  (typeof ACCESSIBILITY_ACCEPTANCE_BLOCKER_CODES)[number];

/**
 * WCAG 2.2 criteria this live-DOM engine cannot fully evaluate. Presence
 * here is an honest unsupported record, not a pass.
 */
export const UNSUPPORTED_WCAG_CRITERIA = Object.freeze([
  'WCAG2.2:1.2.1',
  'WCAG2.2:1.2.2',
  'WCAG2.2:1.2.3',
  'WCAG2.2:1.2.4',
  'WCAG2.2:1.2.5',
  'WCAG2.2:1.3.3',
  'WCAG2.2:1.4.1',
  'WCAG2.2:1.4.2',
  'WCAG2.2:1.4.10',
  'WCAG2.2:1.4.12',
  'WCAG2.2:1.4.13',
  'WCAG2.2:2.3.1',
  'WCAG2.2:2.4.1',
  'WCAG2.2:2.4.4',
  'WCAG2.2:2.4.5',
  'WCAG2.2:2.4.6',
  'WCAG2.2:2.5.3',
  'WCAG2.2:3.1.2',
  'WCAG2.2:3.2.3',
  'WCAG2.2:3.2.4',
  'WCAG2.2:3.3.3',
  'WCAG2.2:3.3.4',
  'WCAG2.2:4.1.3',
] as const);

export const MANUAL_CHECK_IDS = Object.freeze([
  'manual:screen-reader-review',
  'manual:alt-text-quality',
  'manual:heading-label-quality',
  'manual:use-of-color',
  'manual:consistent-navigation',
  'manual:error-suggestion',
] as const);

export const EXISTING_A11Y_FACILITIES = Object.freeze([
  'swissknife/test/e2e/all-app-ui-ux-accessibility.spec.ts',
  'swissknife/src/services/gui-optimizer/scanner.ts',
  'swissknife/src/services/gui-optimizer/ui-capsule.ts',
  'lighthouse@10.1.0 (dev; transitive axe-core@4.6.3)',
] as const);

// ---------------------------------------------------------------------------
// Wire / runtime record types
// ---------------------------------------------------------------------------

/** AccessibilityReceipt@1 — mirrors Python AccessibilityReceipt wire fields. */
export interface AccessibilityReceipt {
  readonly interface: typeof ACCESSIBILITY_RECEIPT_INTERFACE;
  readonly schema_version: typeof ACCESSIBILITY_RECEIPT_SCHEMA;
  readonly receipt_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly automated_pass_count: number;
  readonly violation_count: number;
  readonly violation_ids: readonly string[];
  readonly manual_check_ids: readonly string[];
  readonly unsupported_criteria: readonly string[];
  readonly keyboard_result: ConstraintCheckStatus;
  readonly screen_reader_reviewed: boolean;
  readonly evidence_level: EvidenceLevel;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

export interface UiAccessibilityContract {
  readonly interface: typeof UI_ACCESSIBILITY_CONTRACT_INTERFACE;
  readonly schema_version: typeof UI_ACCESSIBILITY_CONTRACT_SCHEMA;
  readonly contract_id: string;
  readonly requirement_kinds: readonly AccessibilityRequirementKind[];
  readonly required_roles: readonly string[];
  readonly required_names: readonly string[];
  readonly component_id: string;
  readonly notes: string;
}

export interface LiveDomComputedStyle {
  readonly display?: string;
  readonly visibility?: string;
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly fontSize?: string;
  readonly fontWeight?: string;
  readonly opacity?: string;
}

export interface LiveDomNode {
  readonly node_id?: string;
  readonly tag: string;
  readonly id?: string;
  readonly role?: string;
  readonly name?: string;
  readonly type?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly visible?: boolean;
  readonly enabled?: boolean;
  readonly focusable?: boolean;
  readonly tabindex?: number;
  readonly computed_style?: LiveDomComputedStyle;
  readonly children?: readonly LiveDomNode[];
}

export interface LiveDomSnapshot {
  readonly interface?: typeof LIVE_DOM_SNAPSHOT_INTERFACE;
  readonly schema_version?: typeof LIVE_DOM_SNAPSHOT_SCHEMA;
  readonly html?: string;
  readonly lang?: string;
  readonly title?: string;
  readonly root?: LiveDomNode;
}

/** Minimal document surface accepted from a live browser/jsdom host. */
export interface LiveDocumentLike {
  readonly title?: string;
  readonly documentElement?: unknown;
}

export interface KeyboardEvaluation {
  readonly interface: typeof KEYBOARD_EVALUATION_INTERFACE;
  readonly schema_version: typeof KEYBOARD_EVALUATION_SCHEMA;
  readonly evaluation_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly reachable_control_ids: readonly string[];
  readonly unreachable_control_ids: readonly string[];
  readonly tab_order: readonly string[];
  readonly expected_tab_order: readonly string[];
  readonly tab_order_matches: boolean;
  readonly positive_tabindex_ids: readonly string[];
  readonly trap_container_ids: readonly string[];
  readonly trap_contained: boolean;
  readonly focus_leak_ids: readonly string[];
  readonly keyboard_activation_ids: readonly string[];
  readonly missing_keyboard_activation_ids: readonly string[];
  readonly result: ConstraintCheckStatus;
}

export interface AccessibilityFinding {
  readonly interface: typeof ACCESSIBILITY_FINDING_INTERFACE;
  readonly schema_version: typeof ACCESSIBILITY_FINDING_SCHEMA;
  readonly finding_id: string;
  readonly rule_id: string;
  readonly disposition: AccessibilityFindingDisposition;
  readonly severity: AccessibilitySeverity | '';
  readonly wcag_criteria: readonly string[];
  readonly target_id: string;
  readonly message: string;
  readonly evidence_level: EvidenceLevel;
  readonly blocks_acceptance: boolean;
}

export interface AccessibilityAcceptanceBlocker {
  readonly interface: typeof ACCESSIBILITY_ACCEPTANCE_BLOCKER_INTERFACE;
  readonly schema_version: typeof ACCESSIBILITY_ACCEPTANCE_BLOCKER_SCHEMA;
  readonly code: AccessibilityAcceptanceBlockerCode;
  readonly violation_id: string;
  readonly severity: AccessibilitySeverity;
  readonly criterion: string;
  readonly target_id: string;
  readonly message: string;
}

export interface AccessibilityToolIdentity {
  readonly interface: typeof ACCESSIBILITY_TOOL_IDENTITY_INTERFACE;
  readonly schema_version: typeof ACCESSIBILITY_TOOL_IDENTITY_SCHEMA;
  readonly tool_id: string;
  readonly tool_version: typeof UI_ACCESSIBILITY_EVALUATOR_VERSION;
  readonly engine: typeof ACCESSIBILITY_ENGINE_ID;
  readonly engine_version: typeof ACCESSIBILITY_ENGINE_VERSION;
  readonly axe_core_imported: false;
  readonly axe_core_direct_dependency_added: false;
  readonly axe_core_permitted_pin: typeof AXE_CORE_PERMITTED_PIN;
  readonly lighthouse_imported: false;
  readonly wcag_compliance_claimed: false;
  readonly wcag_certification_claimed: false;
}

export interface UiAccessibilityEvaluateRequest {
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly receipt_id?: string;
  readonly html?: string;
  readonly snapshot?: LiveDomSnapshot;
  readonly document?: LiveDocumentLike;
  readonly contract?: UiAccessibilityContract;
  readonly expected_tab_order?: readonly string[];
  readonly screen_reader_reviewed?: boolean;
  readonly evidence_level?: EvidenceLevel;
  readonly analysis_classification?: GuiExtractionConfidence;
  readonly baseline_violation_ids?: readonly string[];
}

export interface AccessibilityEvaluationResult {
  readonly evaluator_interface: typeof UI_ACCESSIBILITY_EVALUATOR_INTERFACE;
  readonly evaluator_schema_version: typeof UI_ACCESSIBILITY_EVALUATOR_SCHEMA;
  readonly evaluator_version: typeof UI_ACCESSIBILITY_EVALUATOR_VERSION;
  readonly receipt: AccessibilityReceipt;
  readonly keyboard: KeyboardEvaluation;
  readonly findings: readonly AccessibilityFinding[];
  readonly acceptance_blockers: readonly AccessibilityAcceptanceBlocker[];
  readonly blocks_automatic_acceptance: boolean;
  readonly wcag_compliance_claimed: false;
  readonly wcag_certification_claimed: false;
  readonly tool: AccessibilityToolIdentity;
  readonly receipt_identity: string;
  readonly keyboard_identity: string;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
}

export interface UiAccessibilityEvaluator {
  readonly interface: typeof UI_ACCESSIBILITY_EVALUATOR_INTERFACE;
  readonly schema_version: typeof UI_ACCESSIBILITY_EVALUATOR_SCHEMA;
  readonly evaluatorVersion: typeof UI_ACCESSIBILITY_EVALUATOR_VERSION;
  evaluate(request: UiAccessibilityEvaluateRequest): AccessibilityEvaluationResult;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiAccessibilityEvaluatorError extends Error {
  readonly name = 'UiAccessibilityEvaluatorError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiAccessibilityEvaluatorDecodeError extends UiAccessibilityEvaluatorError {
  readonly name = 'UiAccessibilityEvaluatorDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const EVIDENCE_SET = new Set<string>(EVIDENCE_LEVELS);
const CONSTRAINT_SET = new Set<string>(CONSTRAINT_CHECK_STATUSES);
const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const VERIFICATION_SET = new Set<string>(GUI_VERIFICATION_STATUS);
const REQUIREMENT_SET = new Set<string>(ACCESSIBILITY_REQUIREMENT_KINDS);
const SEVERITY_SET = new Set<string>(ACCESSIBILITY_SEVERITIES);
const DISPOSITION_SET = new Set<string>(ACCESSIBILITY_FINDING_DISPOSITIONS);
const BLOCKER_CODE_SET = new Set<string>(ACCESSIBILITY_ACCEPTANCE_BLOCKER_CODES);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

const RECEIPT_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'receipt_id',
  'application_id',
  'screen_id',
  'scenario_id',
  'repository_revision',
  'automated_pass_count',
  'violation_count',
  'violation_ids',
  'manual_check_ids',
  'unsupported_criteria',
  'keyboard_result',
  'screen_reader_reviewed',
  'evidence_level',
  'analysis_classification',
  'verification_status',
] as const);

const CONTRACT_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'contract_id',
  'requirement_kinds',
  'required_roles',
  'required_names',
  'component_id',
  'notes',
] as const);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  payload: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(payload)
    .filter(key => !allowedSet.has(key))
    .sort();
  if (unknown.length > 0) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `unknown ${label} field(s): ${unknown.join(', ')}`,
    );
  }
}

function requireKeys(
  payload: Record<string, unknown>,
  required: readonly string[],
  label: string,
): void {
  const missing = required.filter(key => !(key in payload)).sort();
  if (missing.length > 0) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new UiAccessibilityEvaluatorDecodeError(`${field} must be a string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `${field} is not a valid identifier`,
    );
  }
  return text;
}

function requireOptionalIdentifier(value: unknown, field: string): string {
  if (value === null || value === undefined || value === '') return '';
  return requireIdentifier(value, field);
}

function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T {
  const text = requireString(value, field);
  if (!allowed.has(text)) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireBool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UiAccessibilityEvaluatorDecodeError(`${field} must be a boolean`);
  }
  return value;
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `${field} must be a non-negative integer`,
    );
  }
  return value;
}

function requireStringArray(
  value: unknown,
  field: string,
  identifier = true,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiAccessibilityEvaluatorDecodeError(`${field} must be an array`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = identifier
      ? requireIdentifier(value[i], `${field}[${i}]`)
      : requireString(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiAccessibilityEvaluatorDecodeError(
        `${field} must not contain duplicate values`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new UiAccessibilityEvaluatorError(
        'canonical JSON rejects non-finite numbers',
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new UiAccessibilityEvaluatorError(
    `canonical JSON cannot encode ${typeof value}`,
  );
}

export function digestOf(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

export function serializeAccessibilityReceipt(
  receipt: AccessibilityReceipt,
): string {
  return canonicalJson(receipt);
}

export function accessibilityReceiptDigest(
  receipt: AccessibilityReceipt,
): string {
  return digestOf(receipt);
}

export function serializeKeyboardEvaluation(
  evaluation: KeyboardEvaluation,
): string {
  return canonicalJson(evaluation);
}

export function keyboardEvaluationDigest(
  evaluation: KeyboardEvaluation,
): string {
  return digestOf(evaluation);
}

// ---------------------------------------------------------------------------
// Builders / decoders
// ---------------------------------------------------------------------------

export function decodeAccessibilityReceipt(raw: unknown): AccessibilityReceipt {
  if (!isPlainObject(raw)) {
    throw new UiAccessibilityEvaluatorDecodeError(
      'AccessibilityReceipt must be an object',
    );
  }
  rejectUnknownKeys(raw, RECEIPT_FIELDS, 'AccessibilityReceipt');
  requireKeys(raw, RECEIPT_FIELDS, 'AccessibilityReceipt');
  if (raw.interface !== ACCESSIBILITY_RECEIPT_INTERFACE) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `unsupported AccessibilityReceipt interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== ACCESSIBILITY_RECEIPT_SCHEMA) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `unsupported AccessibilityReceipt schema_version: ${String(raw.schema_version)}`,
    );
  }
  const violationIds = requireStringArray(raw.violation_ids, 'violation_ids');
  const violationCount = requireNonNegativeInt(
    raw.violation_count,
    'violation_count',
  );
  if (violationCount !== violationIds.length) {
    throw new UiAccessibilityEvaluatorDecodeError(
      'violation_count must equal len(violation_ids)',
    );
  }
  return Object.freeze({
    interface: ACCESSIBILITY_RECEIPT_INTERFACE,
    schema_version: ACCESSIBILITY_RECEIPT_SCHEMA,
    receipt_id: requireIdentifier(raw.receipt_id, 'receipt_id'),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    scenario_id: requireIdentifier(raw.scenario_id, 'scenario_id'),
    repository_revision: requireString(
      raw.repository_revision,
      'repository_revision',
    ),
    automated_pass_count: requireNonNegativeInt(
      raw.automated_pass_count,
      'automated_pass_count',
    ),
    violation_count: violationCount,
    violation_ids: violationIds,
    manual_check_ids: requireStringArray(raw.manual_check_ids, 'manual_check_ids'),
    unsupported_criteria: requireStringArray(
      raw.unsupported_criteria,
      'unsupported_criteria',
      false,
    ),
    keyboard_result: requireEnum<ConstraintCheckStatus>(
      raw.keyboard_result,
      'keyboard_result',
      CONSTRAINT_SET,
    ),
    screen_reader_reviewed: requireBool(
      raw.screen_reader_reviewed,
      'screen_reader_reviewed',
    ),
    evidence_level: requireEnum<EvidenceLevel>(
      raw.evidence_level,
      'evidence_level',
      EVIDENCE_SET,
    ),
    analysis_classification: requireEnum<GuiExtractionConfidence>(
      raw.analysis_classification,
      'analysis_classification',
      CONFIDENCE_SET,
    ),
    verification_status: requireEnum<GuiVerificationStatus>(
      raw.verification_status,
      'verification_status',
      VERIFICATION_SET,
    ),
  });
}

export function makeAccessibilityReceipt(partial: {
  receipt_id: string;
  application_id: string;
  screen_id: string;
  scenario_id: string;
  repository_revision: string;
  automated_pass_count?: number;
  violation_ids?: readonly string[];
  manual_check_ids?: readonly string[];
  unsupported_criteria?: readonly string[];
  keyboard_result?: ConstraintCheckStatus;
  screen_reader_reviewed?: boolean;
  evidence_level?: EvidenceLevel;
  analysis_classification?: GuiExtractionConfidence;
  verification_status?: GuiVerificationStatus;
}): AccessibilityReceipt {
  const violationIds = partial.violation_ids ?? [];
  return decodeAccessibilityReceipt({
    interface: ACCESSIBILITY_RECEIPT_INTERFACE,
    schema_version: ACCESSIBILITY_RECEIPT_SCHEMA,
    receipt_id: partial.receipt_id,
    application_id: partial.application_id,
    screen_id: partial.screen_id,
    scenario_id: partial.scenario_id,
    repository_revision: partial.repository_revision,
    automated_pass_count: partial.automated_pass_count ?? 0,
    violation_count: violationIds.length,
    violation_ids: violationIds,
    manual_check_ids: partial.manual_check_ids ?? [...MANUAL_CHECK_IDS],
    unsupported_criteria:
      partial.unsupported_criteria ?? [...UNSUPPORTED_WCAG_CRITERIA],
    keyboard_result: partial.keyboard_result ?? 'satisfied',
    screen_reader_reviewed: partial.screen_reader_reviewed ?? false,
    evidence_level: partial.evidence_level ?? 'automated',
    analysis_classification: partial.analysis_classification ?? 'exact',
    verification_status: partial.verification_status ?? 'structurally_valid',
  });
}

export function decodeUiAccessibilityContract(
  raw: unknown,
): UiAccessibilityContract {
  if (!isPlainObject(raw)) {
    throw new UiAccessibilityEvaluatorDecodeError(
      'UiAccessibilityContract must be an object',
    );
  }
  rejectUnknownKeys(raw, CONTRACT_FIELDS, 'UiAccessibilityContract');
  requireKeys(raw, CONTRACT_FIELDS, 'UiAccessibilityContract');
  if (raw.interface !== UI_ACCESSIBILITY_CONTRACT_INTERFACE) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `unsupported UiAccessibilityContract interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_ACCESSIBILITY_CONTRACT_SCHEMA) {
    throw new UiAccessibilityEvaluatorDecodeError(
      `unsupported UiAccessibilityContract schema_version: ${String(raw.schema_version)}`,
    );
  }
  const kinds = requireStringArray(raw.requirement_kinds, 'requirement_kinds', false);
  if (kinds.length === 0) {
    throw new UiAccessibilityEvaluatorDecodeError(
      'requirement_kinds must contain at least one requirement',
    );
  }
  for (const kind of kinds) {
    if (!REQUIREMENT_SET.has(kind)) {
      throw new UiAccessibilityEvaluatorDecodeError(
        `requirement_kinds contains unsupported value: ${kind}`,
      );
    }
  }
  return Object.freeze({
    interface: UI_ACCESSIBILITY_CONTRACT_INTERFACE,
    schema_version: UI_ACCESSIBILITY_CONTRACT_SCHEMA,
    contract_id: requireIdentifier(raw.contract_id, 'contract_id'),
    requirement_kinds: Object.freeze(
      kinds as AccessibilityRequirementKind[],
    ),
    required_roles: requireStringArray(raw.required_roles, 'required_roles', false),
    required_names: requireStringArray(raw.required_names, 'required_names', false),
    component_id: requireOptionalIdentifier(raw.component_id, 'component_id'),
    notes: requireOptionalString(raw.notes, 'notes'),
  });
}

export function makeUiAccessibilityContract(partial: {
  contract_id: string;
  requirement_kinds: readonly AccessibilityRequirementKind[];
  required_roles?: readonly string[];
  required_names?: readonly string[];
  component_id?: string;
  notes?: string;
}): UiAccessibilityContract {
  return decodeUiAccessibilityContract({
    interface: UI_ACCESSIBILITY_CONTRACT_INTERFACE,
    schema_version: UI_ACCESSIBILITY_CONTRACT_SCHEMA,
    contract_id: partial.contract_id,
    requirement_kinds: partial.requirement_kinds,
    required_roles: partial.required_roles ?? [],
    required_names: partial.required_names ?? [],
    component_id: partial.component_id ?? '',
    notes: partial.notes ?? '',
  });
}

export function makeLiveDomNode(partial: LiveDomNode): LiveDomNode {
  if (!partial.tag || typeof partial.tag !== 'string') {
    throw new UiAccessibilityEvaluatorError('LiveDomNode.tag is required');
  }
  return Object.freeze({
    node_id: partial.node_id,
    tag: partial.tag.toLowerCase(),
    id: partial.id,
    role: partial.role,
    name: partial.name,
    type: partial.type,
    attributes: Object.freeze({ ...(partial.attributes ?? {}) }),
    text: partial.text,
    visible: partial.visible,
    enabled: partial.enabled,
    focusable: partial.focusable,
    tabindex: partial.tabindex,
    computed_style: partial.computed_style
      ? Object.freeze({ ...partial.computed_style })
      : undefined,
    children: Object.freeze((partial.children ?? []).map(makeLiveDomNode)),
  });
}

export function accessibilityToolIdentity(): AccessibilityToolIdentity {
  return Object.freeze({
    interface: ACCESSIBILITY_TOOL_IDENTITY_INTERFACE,
    schema_version: ACCESSIBILITY_TOOL_IDENTITY_SCHEMA,
    tool_id: 'gui-live-dom-accessibility-evaluator',
    tool_version: UI_ACCESSIBILITY_EVALUATOR_VERSION,
    engine: ACCESSIBILITY_ENGINE_ID,
    engine_version: ACCESSIBILITY_ENGINE_VERSION,
    axe_core_imported: false,
    axe_core_direct_dependency_added: false,
    axe_core_permitted_pin: AXE_CORE_PERMITTED_PIN,
    lighthouse_imported: false,
    wcag_compliance_claimed: false,
    wcag_certification_claimed: false,
  });
}

// ---------------------------------------------------------------------------
// HTML parser and live-DOM flattening
// ---------------------------------------------------------------------------

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_TAGS = new Set(['script', 'style', 'noscript', 'textarea']);

interface MutableNode {
  tag: string;
  attributes: Record<string, string>;
  children: MutableNode[];
  textParts: string[];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );
}

function parseAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re =
    /([^\s"'>=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null = re.exec(text);
  while (match) {
    const name = match[1].toLowerCase();
    const value =
      match[2] !== undefined
        ? match[2]
        : match[3] !== undefined
          ? match[3]
          : match[4] !== undefined
            ? match[4]
            : '';
    attrs[name] = decodeEntities(value);
    match = re.exec(text);
  }
  return attrs;
}

export function parseHtmlToLiveDom(html: string): LiveDomNode {
  const source = html.replace(/^\uFEFF/, '');
  const root: MutableNode = { tag: '#document', attributes: {}, children: [], textParts: [] };
  const stack: MutableNode[] = [root];
  let i = 0;

  const pushText = (text: string): void => {
    if (!text) return;
    const current = stack[stack.length - 1];
    current.textParts.push(decodeEntities(text));
  };

  while (i < source.length) {
    const current = stack[stack.length - 1];
    if (current.tag !== '#document' && RAW_TEXT_TAGS.has(current.tag)) {
      const close = source.toLowerCase().indexOf(`</${current.tag}`, i);
      const raw = close === -1 ? source.slice(i) : source.slice(i, close);
      current.textParts.push(raw);
      if (close === -1) break;
      const end = source.indexOf('>', close);
      i = end === -1 ? source.length : end + 1;
      stack.pop();
      continue;
    }

    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (/^<!doctype/i.test(source.slice(i, i + 10))) {
      const end = source.indexOf('>', i);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source[i] !== '<') {
      const next = source.indexOf('<', i);
      pushText(source.slice(i, next === -1 ? source.length : next));
      i = next === -1 ? source.length : next;
      continue;
    }
    if (source.startsWith('</', i)) {
      const end = source.indexOf('>', i);
      const name = source
        .slice(i + 2, end === -1 ? source.length : end)
        .trim()
        .toLowerCase()
        .split(/\s/)[0];
      for (let s = stack.length - 1; s > 0; s -= 1) {
        if (stack[s].tag === name) {
          stack.length = s;
          break;
        }
      }
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const end = source.indexOf('>', i);
    if (end === -1) break;
    const rawTag = source.slice(i + 1, end);
    const selfClosing = rawTag.endsWith('/');
    const body = selfClosing ? rawTag.slice(0, -1) : rawTag;
    const match = /^([^\s/]+)([\s\S]*)$/.exec(body.trim());
    if (!match) {
      i = end + 1;
      continue;
    }
    const tag = match[1].toLowerCase();
    const attrs = parseAttributes(match[2] ?? '');
    const node: MutableNode = { tag, attributes: attrs, children: [], textParts: [] };
    current.children.push(node);
    i = end + 1;
    if (!selfClosing && !VOID_TAGS.has(tag)) {
      stack.push(node);
    }
  }

  const htmlNode =
    root.children.find(child => child.tag === 'html') ??
    (root.children.length === 1 ? root.children[0] : root);
  return mutableToLive(htmlNode);
}

function mutableToLive(node: MutableNode): LiveDomNode {
  const ownText = node.textParts.join('');
  const children = node.children.map(mutableToLive);
  const descendant = children
    .map(child => child.text ?? '')
    .filter(Boolean)
    .join(' ');
  const text = [ownText, descendant].filter(part => part.trim()).join(' ').replace(/\s+/g, ' ').trim();
  return Object.freeze({
    tag: node.tag,
    id: node.attributes.id,
    role: node.attributes.role,
    name: node.attributes.name,
    type: node.attributes.type,
    attributes: Object.freeze({ ...node.attributes }),
    text,
    children: Object.freeze(children),
  });
}

interface FlattenedNode {
  nodeId: string;
  tag: string;
  id: string;
  role: string;
  type: string;
  attributes: Record<string, string>;
  ownText: string;
  text: string;
  visible: boolean;
  enabled: boolean;
  tabindex: number | null;
  style: ResolvedStyle;
  parentId: string;
  childIds: string[];
  documentOrder: number;
  depth: number;
}

interface ResolvedStyle {
  display: string;
  visibility: string;
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  opacity: string;
}

interface FlatDom {
  nodes: FlattenedNode[];
  byId: Map<string, FlattenedNode>;
  byNodeId: Map<string, FlattenedNode>;
  lang: string;
  title: string;
  usedComputedStyles: boolean;
}

function sanitizeToken(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._:/#@-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return 'anon';
  if (!/^[A-Za-z0-9]/.test(cleaned)) return `n-${cleaned}`;
  return cleaned.slice(0, 180);
}

function parseStyleAttribute(styleText: string): LiveDomComputedStyle {
  const out: Record<string, string> = {};
  for (const part of styleText.split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === 'color') out.color = value;
    else if (key === 'background-color' || key === 'background') {
      out.backgroundColor = value;
    } else if (key === 'font-size') out.fontSize = value;
    else if (key === 'font-weight') out.fontWeight = value;
    else if (key === 'display') out.display = value;
    else if (key === 'visibility') out.visibility = value;
    else if (key === 'opacity') out.opacity = value;
  }
  return out;
}

function mergeStyle(
  ...parts: Array<LiveDomComputedStyle | undefined>
): ResolvedStyle {
  const merged: ResolvedStyle = {
    display: '',
    visibility: '',
    color: '',
    backgroundColor: '',
    fontSize: '',
    fontWeight: '',
    opacity: '',
  };
  for (const part of parts) {
    if (!part) continue;
    if (part.display) merged.display = part.display;
    if (part.visibility) merged.visibility = part.visibility;
    if (part.color) merged.color = part.color;
    if (part.backgroundColor) merged.backgroundColor = part.backgroundColor;
    if (part.fontSize) merged.fontSize = part.fontSize;
    if (part.fontWeight) merged.fontWeight = part.fontWeight;
    if (part.opacity) merged.opacity = part.opacity;
  }
  return merged;
}

function attrMap(node: LiveDomNode): Record<string, string> {
  const attrs: Record<string, string> = { ...(node.attributes ?? {}) };
  if (node.id && !attrs.id) attrs.id = node.id;
  if (node.role && !attrs.role) attrs.role = node.role;
  if (node.name && !attrs.name) attrs.name = node.name;
  if (node.type && !attrs.type) attrs.type = node.type;
  return attrs;
}

function ownTextOf(node: LiveDomNode): string {
  if (typeof node.text === 'string' && (!node.children || node.children.length === 0)) {
    return node.text;
  }
  const childText = (node.children ?? [])
    .map(child => (child.text ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (typeof node.text === 'string' && childText && node.text.startsWith(childText)) {
    return node.text.slice(0, node.text.length - childText.length).trim();
  }
  if (typeof node.text === 'string') {
    const remainder = childText
      ? node.text.replace(childText, '').trim()
      : node.text.trim();
    return remainder;
  }
  return '';
}

function flattenLiveDom(
  root: LiveDomNode,
  extras: { lang?: string; title?: string },
): FlatDom {
  const nodes: FlattenedNode[] = [];
  const byId = new Map<string, FlattenedNode>();
  const byNodeId = new Map<string, FlattenedNode>();
  let usedComputedStyles = false;
  let order = 0;

  const walk = (
    node: LiveDomNode,
    parentId: string,
    parentStyle: ResolvedStyle,
    parentVisible: boolean,
    depth: number,
  ): FlattenedNode => {
    const attrs = attrMap(node);
    const tag = (node.tag || 'div').toLowerCase();
    const styleAttr = attrs.style ? parseStyleAttribute(attrs.style) : undefined;
    if (node.computed_style) usedComputedStyles = true;
    const style = mergeStyle(parentStyle, styleAttr, node.computed_style);
    const hidden =
      attrs.hidden !== undefined ||
      attrs['aria-hidden'] === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0';
    const visible =
      node.visible !== undefined ? node.visible : parentVisible && !hidden;
    const enabled =
      node.enabled !== undefined
        ? node.enabled
        : attrs.disabled === undefined && attrs['aria-disabled'] !== 'true';
    let tabindex: number | null = null;
    if (node.tabindex !== undefined) {
      tabindex = node.tabindex;
    } else if (attrs.tabindex !== undefined) {
      const parsed = Number.parseInt(attrs.tabindex, 10);
      tabindex = Number.isFinite(parsed) ? parsed : null;
    }
    const assignedId =
      node.node_id ||
      attrs['data-testid'] ||
      attrs.id ||
      `node:${sanitizeToken(tag)}:${order}`;
    let nodeId = sanitizeToken(assignedId);
    if (byNodeId.has(nodeId)) {
      nodeId = sanitizeToken(`${nodeId}:${order}`);
    }
    const flattened: FlattenedNode = {
      nodeId,
      tag,
      id: attrs.id ?? '',
      role: (attrs.role || node.role || '').toLowerCase(),
      type: (attrs.type || node.type || '').toLowerCase(),
      attributes: attrs,
      ownText: ownTextOf(node),
      text: (node.text ?? '').replace(/\s+/g, ' ').trim(),
      visible,
      enabled,
      tabindex,
      style,
      parentId,
      childIds: [],
      documentOrder: order,
      depth,
    };
    order += 1;
    nodes.push(flattened);
    byNodeId.set(nodeId, flattened);
    if (flattened.id) {
      if (!byId.has(flattened.id)) byId.set(flattened.id, flattened);
    }
    for (const child of node.children ?? []) {
      const childNode = walk(child, nodeId, style, visible, depth + 1);
      flattened.childIds.push(childNode.nodeId);
    }
    if (!flattened.text) {
      flattened.text = [
        flattened.ownText,
        ...flattened.childIds.map(id => byNodeId.get(id)?.text ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return flattened;
  };

  walk(
    root,
    '',
    {
      display: '',
      visibility: '',
      color: '',
      backgroundColor: '',
      fontSize: '',
      fontWeight: '',
      opacity: '',
    },
    true,
    0,
  );

  let lang = extras.lang ?? '';
  let title = extras.title ?? '';
  if (!lang) {
    const htmlEl = nodes.find(n => n.tag === 'html' && n.attributes.lang);
    lang = htmlEl?.attributes.lang ?? '';
  }
  if (!title) {
    const titleEl = nodes.find(n => n.tag === 'title');
    title = titleEl?.text ?? '';
  }

  return { nodes, byId, byNodeId, lang, title, usedComputedStyles };
}

function elementToLiveNode(element: unknown): LiveDomNode {
  if (!element || typeof element !== 'object') {
    throw new UiAccessibilityEvaluatorError('documentElement is required');
  }
  const el = element as {
    tagName?: string;
    nodeType?: number;
    id?: string;
    textContent?: string;
    getAttribute?: (name: string) => string | null;
    attributes?: { length: number; [index: number]: { name: string; value: string } };
    children?: ArrayLike<unknown>;
    childNodes?: ArrayLike<{ nodeType?: number; textContent?: string }>;
  };
  const tag = (el.tagName || 'div').toLowerCase();
  const attributes: Record<string, string> = {};
  if (el.attributes && typeof el.attributes.length === 'number') {
    for (let i = 0; i < el.attributes.length; i += 1) {
      const item = el.attributes[i];
      if (item?.name) attributes[item.name.toLowerCase()] = item.value ?? '';
    }
  }
  const children: LiveDomNode[] = [];
  const collection = el.children;
  if (collection) {
    for (let i = 0; i < collection.length; i += 1) {
      children.push(elementToLiveNode(collection[i]));
    }
  }
  let own = '';
  if (el.childNodes) {
    for (let i = 0; i < el.childNodes.length; i += 1) {
      const child = el.childNodes[i];
      if (child && child.nodeType === 3) own += child.textContent ?? '';
    }
  }
  return makeLiveDomNode({
    tag,
    id: el.id || attributes.id,
    role: attributes.role,
    name: attributes.name,
    type: attributes.type,
    attributes,
    text: (own + ' ' + (el.textContent ?? '')).trim() || el.textContent || '',
    children,
  });
}

export function liveDocumentToSnapshot(document: LiveDocumentLike): LiveDomSnapshot {
  if (!document.documentElement) {
    throw new UiAccessibilityEvaluatorError(
      'live document is missing documentElement',
    );
  }
  return Object.freeze({
    interface: LIVE_DOM_SNAPSHOT_INTERFACE,
    schema_version: LIVE_DOM_SNAPSHOT_SCHEMA,
    title: document.title ?? '',
    root: elementToLiveNode(document.documentElement),
  });
}

function resolveSnapshot(request: UiAccessibilityEvaluateRequest): {
  root: LiveDomNode;
  lang: string;
  title: string;
} {
  if (request.document) {
    const snapshot = liveDocumentToSnapshot(request.document);
    return {
      root: snapshot.root as LiveDomNode,
      lang: snapshot.lang ?? '',
      title: snapshot.title ?? '',
    };
  }
  const snapshot = request.snapshot;
  if (snapshot?.root) {
    return {
      root: makeLiveDomNode(snapshot.root),
      lang: snapshot.lang ?? '',
      title: snapshot.title ?? '',
    };
  }
  const html = request.html ?? snapshot?.html;
  if (typeof html === 'string' && html.trim().length > 0) {
    return {
      root: parseHtmlToLiveDom(html),
      lang: snapshot?.lang ?? '',
      title: snapshot?.title ?? '',
    };
  }
  throw new UiAccessibilityEvaluatorError(
    'evaluate request requires html, snapshot.root, or document',
  );
}

// ---------------------------------------------------------------------------
// Accessible name, roles, contrast
// ---------------------------------------------------------------------------

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'spinbutton',
  'treeitem',
]);

const NAMED_COLORS: Readonly<Record<string, [number, number, number]>> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  aqua: [0, 255, 255],
  lime: [0, 255, 0],
  olive: [128, 128, 0],
  purple: [128, 0, 128],
  fuchsia: [255, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
};

function parseColor(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const raw = value.trim().toLowerCase();
  if (!raw || raw === 'transparent' || raw === 'inherit' || raw === 'currentcolor') {
    return raw === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null;
  }
  const named = NAMED_COLORS[raw];
  if (named) return { r: named[0], g: named[1], b: named[2], a: 1 };
  if (raw[0] === '#') {
    const hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }
  const rgb = raw.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/,
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

function channelToLinear(channel: number): number {
  const s = Math.max(0, Math.min(255, channel)) / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
): number {
  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

function parsePx(value: string): number {
  const match = value.trim().match(/^([0-9.]+)(px|pt|em|rem)?$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  if (unit === 'pt') return n * (96 / 72);
  if (unit === 'em' || unit === 'rem') return n * 16;
  return n;
}

function isLargeText(style: ResolvedStyle): boolean {
  const px = parsePx(style.fontSize || '16px');
  const weight = Number.parseInt(style.fontWeight || '400', 10);
  const bold = Number.isFinite(weight) ? weight >= 700 : /bold/i.test(style.fontWeight);
  return px >= 24 || (bold && px >= 18.66);
}

function compositeBackground(
  node: FlattenedNode,
  flat: FlatDom,
): { r: number; g: number; b: number } | null {
  let current: FlattenedNode | undefined = node;
  while (current) {
    const color = parseColor(current.style.backgroundColor || '');
    if (color && color.a > 0) return { r: color.r, g: color.g, b: color.b };
    current = current.parentId ? flat.byNodeId.get(current.parentId) : undefined;
  }
  return { r: 255, g: 255, b: 255 };
}

function isNativeInteractive(node: FlattenedNode): boolean {
  if (node.tag === 'button' || node.tag === 'select' || node.tag === 'textarea') {
    return true;
  }
  if (node.tag === 'a' && node.attributes.href !== undefined) return true;
  if (node.tag === 'input' && node.type !== 'hidden') return true;
  if (node.attributes.contenteditable === 'true') return true;
  return false;
}

function isCustomInteractive(node: FlattenedNode): boolean {
  return INTERACTIVE_ROLES.has(node.role) && !isNativeInteractive(node);
}

function isInteractive(node: FlattenedNode): boolean {
  return isNativeInteractive(node) || isCustomInteractive(node);
}

function isFormControl(node: FlattenedNode): boolean {
  if (node.tag === 'select' || node.tag === 'textarea') return true;
  if (node.tag !== 'input') return false;
  return !['hidden', 'submit', 'reset', 'button', 'image'].includes(node.type);
}

function naturallyFocusable(node: FlattenedNode): boolean {
  if (!node.visible || !node.enabled) return false;
  if (node.tabindex !== null && node.tabindex < 0) return false;
  if (node.tag === 'a' && node.attributes.href !== undefined) return true;
  if (node.tag === 'button' || node.tag === 'select' || node.tag === 'textarea') {
    return true;
  }
  if (node.tag === 'input' && node.type !== 'hidden') return true;
  if (node.attributes.contenteditable === 'true') return true;
  if (node.tabindex !== null && node.tabindex >= 0) return true;
  return false;
}

function labelledByText(node: FlattenedNode, flat: FlatDom): string {
  const ref = node.attributes['aria-labelledby'];
  if (!ref) return '';
  return ref
    .split(/\s+/)
    .map(id => flat.byId.get(id)?.text ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();
}

function wrappingLabelText(node: FlattenedNode, flat: FlatDom): string {
  let current = node.parentId ? flat.byNodeId.get(node.parentId) : undefined;
  while (current) {
    if (current.tag === 'label') return current.text;
    current = current.parentId ? flat.byNodeId.get(current.parentId) : undefined;
  }
  return '';
}

function explicitLabelText(node: FlattenedNode, flat: FlatDom): string {
  if (!node.id) return '';
  const label = flat.nodes.find(
    candidate =>
      candidate.tag === 'label' && candidate.attributes.for === node.id,
  );
  return label?.text ?? '';
}

function accessibleName(node: FlattenedNode, flat: FlatDom): string {
  const labelledBy = labelledByText(node, flat);
  if (labelledBy) return labelledBy;
  if (node.attributes['aria-label']) return node.attributes['aria-label'].trim();
  const explicit = explicitLabelText(node, flat);
  if (explicit) return explicit;
  const wrapped = wrappingLabelText(node, flat);
  if (wrapped) return wrapped;
  if (node.tag === 'img' || node.tag === 'area' || node.type === 'image') {
    if (node.attributes.alt !== undefined) return node.attributes.alt.trim();
  }
  if (node.tag === 'input' && ['submit', 'reset', 'button'].includes(node.type)) {
    if (node.attributes.value) return node.attributes.value.trim();
  }
  if (node.tag === 'button' || node.tag === 'a' || node.tag === 'summary') {
    if (node.text) return node.text;
  }
  if (node.attributes.title) return node.attributes.title.trim();
  return '';
}

function headingLevel(node: FlattenedNode): number {
  const match = /^h([1-6])$/.exec(node.tag);
  if (match) return Number(match[1]);
  if (node.role === 'heading') {
    const aria = Number.parseInt(node.attributes['aria-level'] || '0', 10);
    if (aria >= 1 && aria <= 6) return aria;
    return 2;
  }
  return 0;
}

function isModal(node: FlattenedNode): boolean {
  return (
    node.role === 'dialog' ||
    node.role === 'alertdialog' ||
    node.attributes['aria-modal'] === 'true'
  );
}

function ancestors(node: FlattenedNode, flat: FlatDom): FlattenedNode[] {
  const out: FlattenedNode[] = [];
  let current = node.parentId ? flat.byNodeId.get(node.parentId) : undefined;
  while (current) {
    out.push(current);
    current = current.parentId ? flat.byNodeId.get(current.parentId) : undefined;
  }
  return out;
}

function isDescendantOf(
  node: FlattenedNode,
  ancestorId: string,
  flat: FlatDom,
): boolean {
  if (node.nodeId === ancestorId) return true;
  return ancestors(node, flat).some(item => item.nodeId === ancestorId);
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

interface FindingAcc {
  findings: AccessibilityFinding[];
  passCount: number;
}

function findingId(prefix: string, rule: string, target: string): string {
  return sanitizeToken(`${prefix}:${rule}:${target}`);
}

function recordPass(
  acc: FindingAcc,
  rule: AccessibilityRuleId,
  target: string,
  message: string,
  criteria: readonly string[],
): void {
  acc.passCount += 1;
  acc.findings.push(
    Object.freeze({
      interface: ACCESSIBILITY_FINDING_INTERFACE,
      schema_version: ACCESSIBILITY_FINDING_SCHEMA,
      finding_id: findingId('pass', rule, target),
      rule_id: rule,
      disposition: 'pass',
      severity: '',
      wcag_criteria: Object.freeze([...criteria]),
      target_id: target,
      message,
      evidence_level: 'automated',
      blocks_acceptance: false,
    }),
  );
}

function recordViolation(
  acc: FindingAcc,
  rule: AccessibilityRuleId,
  target: string,
  severity: AccessibilitySeverity,
  message: string,
  criteria: readonly string[],
  blocks: boolean,
): AccessibilityFinding {
  const finding: AccessibilityFinding = Object.freeze({
    interface: ACCESSIBILITY_FINDING_INTERFACE,
    schema_version: ACCESSIBILITY_FINDING_SCHEMA,
    finding_id: findingId('violation', rule, target),
    rule_id: rule,
    disposition: 'violation',
    severity,
    wcag_criteria: Object.freeze([...criteria]),
    target_id: target,
    message,
    evidence_level: 'automated',
    blocks_acceptance: blocks || severity === 'critical',
  });
  acc.findings.push(finding);
  return finding;
}

function evaluateDuplicateIds(flat: FlatDom, acc: FindingAcc): void {
  const seen = new Map<string, FlattenedNode[]>();
  for (const node of flat.nodes) {
    if (!node.id) continue;
    const list = seen.get(node.id) ?? [];
    list.push(node);
    seen.set(node.id, list);
  }
  let unique = 0;
  for (const [id, list] of seen) {
    if (list.length > 1) {
      recordViolation(
        acc,
        'duplicate-id',
        id,
        'critical',
        `duplicate id "${id}" rendered ${list.length} times`,
        ['WCAG2.2:4.1.1', 'WCAG2.2:1.3.1'],
        true,
      );
    } else {
      unique += 1;
    }
  }
  if (unique > 0) {
    recordPass(
      acc,
      'duplicate-id',
      'document',
      `${unique} unique element id(s)`,
      ['WCAG2.2:4.1.1'],
    );
  }
}

function evaluateAccessibleNames(flat: FlatDom, acc: FindingAcc): void {
  for (const node of flat.nodes) {
    if (!node.visible || !isInteractive(node)) continue;
    if (node.tag === 'input' && node.type === 'hidden') continue;
    const name = accessibleName(node, flat);
    if (!name) {
      recordViolation(
        acc,
        'accessible-name',
        node.nodeId,
        'critical',
        `interactive ${node.tag} control has no accessible name`,
        ['WCAG2.2:4.1.2', 'WCAG2.2:1.3.1'],
        true,
      );
    } else {
      recordPass(
        acc,
        'accessible-name',
        node.nodeId,
        `accessible name "${name}"`,
        ['WCAG2.2:4.1.2'],
      );
    }
  }
}

function evaluateImages(flat: FlatDom, acc: FindingAcc): void {
  for (const node of flat.nodes) {
    if (node.tag !== 'img' && node.type !== 'image') continue;
    const altPresent = node.attributes.alt !== undefined;
    const alt = node.attributes.alt ?? '';
    const decorative =
      alt === '' ||
      node.role === 'presentation' ||
      node.role === 'none' ||
      node.attributes['aria-hidden'] === 'true';
    if (!altPresent) {
      recordViolation(
        acc,
        'image-alt',
        node.nodeId,
        'critical',
        'image is missing an alt attribute',
        ['WCAG2.2:1.1.1'],
        true,
      );
      continue;
    }
    if (decorative) {
      recordPass(
        acc,
        'decorative-image',
        node.nodeId,
        'decorative image is hidden from the accessible name',
        ['WCAG2.2:1.1.1'],
      );
    } else {
      recordPass(
        acc,
        'image-alt',
        node.nodeId,
        'image exposes an alternative; meaning remains a manual check',
        ['WCAG2.2:1.1.1'],
      );
    }
  }
}

function evaluateHeadings(flat: FlatDom, acc: FindingAcc): void {
  const headings = flat.nodes
    .filter(node => headingLevel(node) > 0 && node.visible)
    .sort((a, b) => a.documentOrder - b.documentOrder);
  if (headings.length === 0) {
    recordViolation(
      acc,
      'heading-structure',
      'document',
      'moderate',
      'no visible heading structure',
      ['WCAG2.2:1.3.1', 'WCAG2.2:2.4.6'],
      false,
    );
    return;
  }
  let previous = 0;
  let skipped = false;
  for (const heading of headings) {
    const level = headingLevel(heading);
    if (previous > 0 && level > previous + 1) {
      skipped = true;
      recordViolation(
        acc,
        'heading-structure',
        heading.nodeId,
        'serious',
        `heading level jumps from h${previous} to h${level}`,
        ['WCAG2.2:1.3.1'],
        false,
      );
    }
    previous = level;
  }
  if (!skipped) {
    recordPass(
      acc,
      'heading-structure',
      'document',
      'heading outline does not skip levels',
      ['WCAG2.2:1.3.1'],
    );
  }
}

function evaluateForms(flat: FlatDom, acc: FindingAcc): void {
  for (const node of flat.nodes) {
    if (!node.visible || !isFormControl(node)) continue;
    const name = accessibleName(node, flat);
    if (!name) {
      recordViolation(
        acc,
        'form-label',
        node.nodeId,
        'critical',
        `form control ${node.tag} has no associated label`,
        ['WCAG2.2:1.3.1', 'WCAG2.2:4.1.2', 'WCAG2.2:3.3.2'],
        true,
      );
    } else {
      recordPass(
        acc,
        'form-label',
        node.nodeId,
        `form control labeled "${name}"`,
        ['WCAG2.2:1.3.1'],
      );
    }

    const required =
      node.attributes.required !== undefined ||
      node.attributes['aria-required'] === 'true';
    if (required) {
      recordPass(
        acc,
        'required-state',
        node.nodeId,
        'required state is exposed',
        ['WCAG2.2:3.3.2'],
      );
    }

    const invalid = node.attributes['aria-invalid'] === 'true';
    if (invalid) {
      const described =
        Boolean(node.attributes['aria-describedby']) ||
        Boolean(node.attributes['aria-errormessage']);
      const describedExists = [node.attributes['aria-describedby'], node.attributes['aria-errormessage']]
        .filter(Boolean)
        .every(id => (id as string).split(/\s+/).every(token => flat.byId.has(token)));
      if (!described || !describedExists) {
        recordViolation(
          acc,
          'error-association',
          node.nodeId,
          'serious',
          'invalid field is not associated with an error message',
          ['WCAG2.2:3.3.1'],
          false,
        );
      } else {
        recordPass(
          acc,
          'error-association',
          node.nodeId,
          'invalid field is associated with an error message',
          ['WCAG2.2:3.3.1'],
        );
      }
    }
  }
}

function evaluateContrast(flat: FlatDom, acc: FindingAcc): void {
  for (const node of flat.nodes) {
    if (!node.visible) continue;
    const hasText =
      Boolean(node.ownText.trim()) &&
      !['script', 'style', 'noscript', 'meta', 'link', 'head'].includes(node.tag);
    if (!hasText) continue;
    const fg = parseColor(node.style.color || '');
    if (!fg || fg.a === 0) continue;
    const bg = compositeBackground(node, flat);
    if (!bg) continue;
    const ratio = contrastRatio(fg, bg);
    const large = isLargeText(node.style);
    const minimum = large ? 3 : 4.5;
    if (ratio + 1e-9 < minimum) {
      recordViolation(
        acc,
        'contrast',
        node.nodeId,
        'serious',
        `contrast ratio ${ratio.toFixed(2)}:1 is below ${minimum}:1`,
        ['WCAG2.2:1.4.3'],
        false,
      );
    } else {
      recordPass(
        acc,
        'contrast',
        node.nodeId,
        `contrast ratio ${ratio.toFixed(2)}:1 meets ${minimum}:1`,
        ['WCAG2.2:1.4.3'],
      );
    }
  }
}

function evaluateDocumentLang(flat: FlatDom, acc: FindingAcc): void {
  if (!flat.lang.trim()) {
    recordViolation(
      acc,
      'document-lang',
      'document',
      'serious',
      'document language is not specified',
      ['WCAG2.2:3.1.1'],
      false,
    );
    return;
  }
  recordPass(
    acc,
    'document-lang',
    'document',
    `document language is ${flat.lang}`,
    ['WCAG2.2:3.1.1'],
  );
}

function evaluateContract(
  flat: FlatDom,
  contract: UiAccessibilityContract | undefined,
  acc: FindingAcc,
): void {
  if (!contract) return;
  const kinds = new Set(contract.requirement_kinds);
  if (kinds.has('role')) {
    const roles = new Set(
      flat.nodes.map(node => node.role || implicitRole(node)).filter(Boolean),
    );
    for (const required of contract.required_roles) {
      if (!roles.has(required)) {
        recordViolation(
          acc,
          'contract-role',
          required,
          'serious',
          `required role "${required}" is not present`,
          ['WCAG2.2:4.1.2'],
          false,
        );
      } else {
        recordPass(
          acc,
          'contract-role',
          required,
          `required role "${required}" is present`,
          ['WCAG2.2:4.1.2'],
        );
      }
    }
  }
  if (kinds.has('accessible_name')) {
    const names = new Set(
      flat.nodes
        .filter(node => node.visible)
        .map(node => accessibleName(node, flat).toLowerCase())
        .filter(Boolean),
    );
    for (const required of contract.required_names) {
      if (!names.has(required.toLowerCase())) {
        recordViolation(
          acc,
          'contract-name',
          sanitizeToken(required),
          'serious',
          `required accessible name "${required}" is not present`,
          ['WCAG2.2:4.1.2'],
          false,
        );
      } else {
        recordPass(
          acc,
          'contract-name',
          sanitizeToken(required),
          `required accessible name "${required}" is present`,
          ['WCAG2.2:4.1.2'],
        );
      }
    }
  }
}

function implicitRole(node: FlattenedNode): string {
  if (node.role) return node.role;
  if (node.tag === 'button') return 'button';
  if (node.tag === 'a' && node.attributes.href !== undefined) return 'link';
  if (node.tag === 'input') {
    if (node.type === 'checkbox') return 'checkbox';
    if (node.type === 'radio') return 'radio';
    if (node.type === 'submit' || node.type === 'reset' || node.type === 'button') {
      return 'button';
    }
    return 'textbox';
  }
  if (node.tag === 'textarea') return 'textbox';
  if (node.tag === 'select') return 'combobox';
  if (node.tag === 'img') return 'img';
  const level = headingLevel(node);
  if (level > 0) return 'heading';
  return '';
}

function tabbableNodes(flat: FlatDom): FlattenedNode[] {
  const candidates = flat.nodes.filter(naturallyFocusable);
  const positive = candidates
    .filter(node => (node.tabindex ?? 0) > 0)
    .sort((a, b) => {
      const delta = (a.tabindex ?? 0) - (b.tabindex ?? 0);
      return delta !== 0 ? delta : a.documentOrder - b.documentOrder;
    });
  const natural = candidates
    .filter(node => (node.tabindex ?? 0) === 0 || node.tabindex === null)
    .sort((a, b) => a.documentOrder - b.documentOrder);
  return [...positive, ...natural];
}

function evaluateKeyboard(
  flat: FlatDom,
  expectedTabOrder: readonly string[],
  acc: FindingAcc,
  ids: {
    applicationId: string;
    screenId: string;
    scenarioId: string;
  },
): KeyboardEvaluation {
  const interactive = flat.nodes.filter(
    node => node.visible && isInteractive(node),
  );
  const tabbable = tabbableNodes(flat);
  const tabOrder = tabbable.map(node => node.nodeId);
  const tabSet = new Set(tabOrder);
  const reachable: string[] = [];
  const unreachable: string[] = [];
  const missingActivation: string[] = [];
  const activation: string[] = [];
  const positiveTab = tabbable
    .filter(node => (node.tabindex ?? 0) > 0)
    .map(node => node.nodeId);

  for (const node of interactive) {
    const custom = isCustomInteractive(node);
    const hasActivation =
      isNativeInteractive(node) || (node.tabindex !== null && node.tabindex >= 0);
    if (custom && !hasActivation) {
      missingActivation.push(node.nodeId);
      recordViolation(
        acc,
        'keyboard-activation',
        node.nodeId,
        'critical',
        `custom ${node.role || node.tag} control is not keyboard activatable`,
        ['WCAG2.2:2.1.1'],
        true,
      );
    } else if (isInteractive(node)) {
      activation.push(node.nodeId);
      recordPass(
        acc,
        'keyboard-activation',
        node.nodeId,
        'control exposes keyboard activation',
        ['WCAG2.2:2.1.1'],
      );
    }

    if (tabSet.has(node.nodeId) || (node.tabindex === -1 && hasActivation && !custom)) {
      reachable.push(node.nodeId);
      recordPass(
        acc,
        'keyboard-reachability',
        node.nodeId,
        'interactive control is keyboard reachable',
        ['WCAG2.2:2.1.1'],
      );
    } else if (!tabSet.has(node.nodeId)) {
      unreachable.push(node.nodeId);
      recordViolation(
        acc,
        'keyboard-reachability',
        node.nodeId,
        'critical',
        'interactive control is not in the tab order',
        ['WCAG2.2:2.1.1'],
        true,
      );
    }
  }

  const expected = [...expectedTabOrder];
  const matches =
    expected.length === 0 ||
    (expected.length === tabOrder.length &&
      expected.every((id, index) => id === tabOrder[index]));
  if (expected.length > 0) {
    if (matches) {
      recordPass(
        acc,
        'keyboard-order',
        'document',
        'tab order matches the declared sequence',
        ['WCAG2.2:2.4.3'],
      );
    } else {
      recordViolation(
        acc,
        'keyboard-order',
        'document',
        'serious',
        'tab order does not match the declared sequence',
        ['WCAG2.2:2.4.3'],
        false,
      );
    }
  } else if (positiveTab.length > 0) {
    recordViolation(
      acc,
      'keyboard-order',
      'document',
      'moderate',
      'positive tabindex values reorder the natural focus sequence',
      ['WCAG2.2:2.4.3'],
      false,
    );
  } else if (tabOrder.length > 0) {
    recordPass(
      acc,
      'keyboard-order',
      'document',
      'tab order follows document order',
      ['WCAG2.2:2.4.3'],
    );
  }

  const modals = flat.nodes.filter(node => node.visible && isModal(node));
  const trapContainers = modals.map(node => node.nodeId);
  const leakIds: string[] = [];
  let trapContained = true;
  if (modals.length > 0) {
    const modal = modals[modals.length - 1];
    const inside = tabbable.filter(node =>
      isDescendantOf(node, modal.nodeId, flat),
    );
    const outside = tabbable.filter(
      node => !isDescendantOf(node, modal.nodeId, flat),
    );
    if (inside.length === 0) {
      trapContained = false;
      recordViolation(
        acc,
        'focus-trap',
        modal.nodeId,
        'critical',
        'modal has no keyboard-reachable control',
        ['WCAG2.2:2.1.2', 'WCAG2.2:2.4.3'],
        true,
      );
    } else if (outside.length > 0) {
      trapContained = false;
      for (const node of outside) leakIds.push(node.nodeId);
      recordViolation(
        acc,
        'focus-trap',
        modal.nodeId,
        'critical',
        'open modal does not contain the tab order',
        ['WCAG2.2:2.4.3'],
        true,
      );
    } else {
      recordPass(
        acc,
        'focus-trap',
        modal.nodeId,
        'open modal contains the tab order',
        ['WCAG2.2:2.4.3'],
      );
    }
  }

  let result: ConstraintCheckStatus = 'satisfied';
  if (
    unreachable.length > 0 ||
    missingActivation.length > 0 ||
    !trapContained
  ) {
    result = 'violated';
  } else if (!matches && expected.length > 0) {
    result = 'violated';
  }

  return Object.freeze({
    interface: KEYBOARD_EVALUATION_INTERFACE,
    schema_version: KEYBOARD_EVALUATION_SCHEMA,
    evaluation_id: `keyboard:${sanitizeToken(ids.scenarioId)}`,
    application_id: ids.applicationId,
    screen_id: ids.screenId,
    scenario_id: ids.scenarioId,
    reachable_control_ids: Object.freeze([...reachable]),
    unreachable_control_ids: Object.freeze([...unreachable]),
    tab_order: Object.freeze([...tabOrder]),
    expected_tab_order: Object.freeze(expected),
    tab_order_matches: matches,
    positive_tabindex_ids: Object.freeze([...positiveTab]),
    trap_container_ids: Object.freeze([...trapContainers]),
    trap_contained: trapContained,
    focus_leak_ids: Object.freeze([...leakIds]),
    keyboard_activation_ids: Object.freeze([...activation]),
    missing_keyboard_activation_ids: Object.freeze([...missingActivation]),
    result,
  });
}

function recordManualAndUnsupported(acc: FindingAcc): void {
  for (const criterion of UNSUPPORTED_WCAG_CRITERIA) {
    acc.findings.push(
      Object.freeze({
        interface: ACCESSIBILITY_FINDING_INTERFACE,
        schema_version: ACCESSIBILITY_FINDING_SCHEMA,
        finding_id: findingId('unsupported', 'wcag', criterion),
        rule_id: 'unsupported',
        disposition: 'unsupported',
        severity: '',
        wcag_criteria: Object.freeze([criterion]),
        target_id: 'document',
        message: `${criterion} is not fully evaluable by automated live-DOM rules`,
        evidence_level: 'automated',
        blocks_acceptance: false,
      }),
    );
  }
  for (const checkId of MANUAL_CHECK_IDS) {
    acc.findings.push(
      Object.freeze({
        interface: ACCESSIBILITY_FINDING_INTERFACE,
        schema_version: ACCESSIBILITY_FINDING_SCHEMA,
        finding_id: checkId,
        rule_id: 'manual-review',
        disposition: 'manual_review',
        severity: '',
        wcag_criteria: Object.freeze([]),
        target_id: 'document',
        message: `${checkId} requires human review and is not an automated pass`,
        evidence_level: 'heuristic',
        blocks_acceptance: false,
      }),
    );
  }
}

function blockerCodeFor(
  finding: AccessibilityFinding,
): AccessibilityAcceptanceBlockerCode {
  if (finding.rule_id === 'duplicate-id') return 'duplicate_id';
  if (finding.rule_id === 'keyboard-reachability') return 'keyboard_unreachable';
  if (finding.rule_id === 'focus-trap') return 'keyboard_trap';
  if (finding.rule_id === 'form-label') return 'missing_form_label';
  if (finding.rule_id === 'accessible-name' || finding.rule_id === 'keyboard-activation') {
    return 'unlabeled_interactive';
  }
  return 'critical_violation';
}

function collectBlockers(
  findings: readonly AccessibilityFinding[],
  baselineViolationIds: readonly string[] | undefined,
): AccessibilityAcceptanceBlocker[] {
  const blockers: AccessibilityAcceptanceBlocker[] = [];
  const hasBaseline = baselineViolationIds !== undefined;
  const baseline = new Set(baselineViolationIds ?? []);
  for (const finding of findings) {
    if (finding.disposition !== 'violation') continue;
    if (!finding.blocks_acceptance && finding.severity !== 'critical') continue;
    const regression =
      hasBaseline &&
      finding.severity === 'critical' &&
      !baseline.has(finding.finding_id);
    blockers.push(
      Object.freeze({
        interface: ACCESSIBILITY_ACCEPTANCE_BLOCKER_INTERFACE,
        schema_version: ACCESSIBILITY_ACCEPTANCE_BLOCKER_SCHEMA,
        code: regression ? 'critical_regression' : blockerCodeFor(finding),
        violation_id: finding.finding_id,
        severity: (finding.severity || 'critical') as AccessibilitySeverity,
        criterion: finding.wcag_criteria[0] ?? '',
        target_id: finding.target_id,
        message: finding.message,
      }),
    );
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export function createUiAccessibilityEvaluator(): UiAccessibilityEvaluator {
  return Object.freeze({
    interface: UI_ACCESSIBILITY_EVALUATOR_INTERFACE,
    schema_version: UI_ACCESSIBILITY_EVALUATOR_SCHEMA,
    evaluatorVersion: UI_ACCESSIBILITY_EVALUATOR_VERSION,
    evaluate(request: UiAccessibilityEvaluateRequest): AccessibilityEvaluationResult {
      return evaluateLiveDomAccessibility(request);
    },
  });
}

export function evaluateLiveDomAccessibility(
  request: UiAccessibilityEvaluateRequest,
): AccessibilityEvaluationResult {
  if (!request || typeof request !== 'object') {
    throw new UiAccessibilityEvaluatorError('request must be an object');
  }
  const applicationId = requireIdentifier(
    request.application_id,
    'application_id',
  );
  const screenId = requireIdentifier(request.screen_id, 'screen_id');
  const scenarioId = requireIdentifier(request.scenario_id, 'scenario_id');
  const repositoryRevision = requireString(
    request.repository_revision,
    'repository_revision',
  );
  const evidenceLevel = request.evidence_level
    ? requireEnum<EvidenceLevel>(
        request.evidence_level,
        'evidence_level',
        EVIDENCE_SET,
      )
    : ('automated' as const);
  const contract = request.contract
    ? request.contract.interface
      ? decodeUiAccessibilityContract(request.contract)
      : makeUiAccessibilityContract(request.contract)
    : undefined;

  const resolved = resolveSnapshot(request);
  const flat = flattenLiveDom(resolved.root, {
    lang: resolved.lang,
    title: resolved.title,
  });
  const acc: FindingAcc = { findings: [], passCount: 0 };

  evaluateDuplicateIds(flat, acc);
  evaluateAccessibleNames(flat, acc);
  evaluateImages(flat, acc);
  evaluateHeadings(flat, acc);
  evaluateForms(flat, acc);
  evaluateContrast(flat, acc);
  evaluateDocumentLang(flat, acc);
  evaluateContract(flat, contract, acc);
  const keyboard = evaluateKeyboard(
    flat,
    request.expected_tab_order ?? [],
    acc,
    { applicationId, screenId, scenarioId },
  );
  recordManualAndUnsupported(acc);

  const findings = Object.freeze(acc.findings);
  const violationFindings = findings.filter(
    finding => finding.disposition === 'violation',
  );
  const violationIds = Object.freeze(
    uniqueSorted(violationFindings.map(finding => finding.finding_id)),
  );
  const blockers = Object.freeze(
    collectBlockers(findings, request.baseline_violation_ids),
  );

  const classification: GuiExtractionConfidence =
    request.analysis_classification
      ? requireEnum<GuiExtractionConfidence>(
          request.analysis_classification,
          'analysis_classification',
          CONFIDENCE_SET,
        )
      : flat.usedComputedStyles
        ? 'exact'
        : 'conservative';

  const receiptId =
    request.receipt_id && request.receipt_id.length > 0
      ? requireIdentifier(request.receipt_id, 'receipt_id')
      : `receipt:a11y:${sanitizeToken(scenarioId)}`;

  const receipt = decodeAccessibilityReceipt({
    interface: ACCESSIBILITY_RECEIPT_INTERFACE,
    schema_version: ACCESSIBILITY_RECEIPT_SCHEMA,
    receipt_id: receiptId,
    application_id: applicationId,
    screen_id: screenId,
    scenario_id: scenarioId,
    repository_revision: repositoryRevision,
    automated_pass_count: acc.passCount,
    violation_count: violationIds.length,
    violation_ids: violationIds,
    manual_check_ids: [...MANUAL_CHECK_IDS],
    unsupported_criteria: [...UNSUPPORTED_WCAG_CRITERIA],
    keyboard_result: keyboard.result,
    screen_reader_reviewed: request.screen_reader_reviewed === true,
    evidence_level: evidenceLevel,
    analysis_classification: classification,
    verification_status: 'structurally_valid',
  });

  return Object.freeze({
    evaluator_interface: UI_ACCESSIBILITY_EVALUATOR_INTERFACE,
    evaluator_schema_version: UI_ACCESSIBILITY_EVALUATOR_SCHEMA,
    evaluator_version: UI_ACCESSIBILITY_EVALUATOR_VERSION,
    receipt,
    keyboard,
    findings,
    acceptance_blockers: blockers,
    blocks_automatic_acceptance: blockers.length > 0,
    wcag_compliance_claimed: false,
    wcag_certification_claimed: false,
    tool: accessibilityToolIdentity(),
    receipt_identity: accessibilityReceiptDigest(receipt),
    keyboard_identity: keyboardEvaluationDigest(keyboard),
    canonical_json_profile: CANONICAL_JSON_PROFILE,
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function findingsByDisposition(
  result: AccessibilityEvaluationResult,
  disposition: AccessibilityFindingDisposition,
): readonly AccessibilityFinding[] {
  if (!DISPOSITION_SET.has(disposition)) {
    throw new UiAccessibilityEvaluatorError(
      `unsupported finding disposition: ${disposition}`,
    );
  }
  return result.findings.filter(finding => finding.disposition === disposition);
}

export function listAcceptanceBlockers(
  result: AccessibilityEvaluationResult,
): readonly AccessibilityAcceptanceBlocker[] {
  return result.acceptance_blockers;
}

export function blocksAutomaticAcceptance(
  result: AccessibilityEvaluationResult,
): boolean {
  return result.blocks_automatic_acceptance;
}

export function claimsWcagCompliance(
  result: AccessibilityEvaluationResult,
): false {
  void SEVERITY_SET;
  void BLOCKER_CODE_SET;
  return result.wcag_compliance_claimed;
}

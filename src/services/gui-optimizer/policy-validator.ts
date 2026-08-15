/**
 * Policy and action-binding validation at the UI boundary (VGO-023).
 *
 * Wire models:
 *   - UiActionBinding@1 / ui-action-binding/v1
 *   - UiConfirmationBinding@1 / ui-confirmation-binding/v1
 *   - UiPolicyBindingValidator@1 / ui-policy-binding-validator/v1
 *
 * Fail-closed doctrine (does not authorize; only validates bindings):
 *   - displayed actions resolve to exactly one intended method and schema;
 *   - ambiguous/dynamic bindings are unresolved or review-required;
 *   - UI visibility / enabled state never proves permission;
 *   - current action and arguments are re-evaluated at runtime;
 *   - confirmation is bound to the exact action and argument digest;
 *   - prohibited/disabled actions have no executable hidden dispatch path;
 *   - a stale policy decision cannot authorize the current action;
 *   - browser-host boundary use is required for host-crossing actions;
 *   - any dispatchable prohibited/disabled action or stale/exact-confirmation
 *     failure blocks automatic acceptance.
 *
 * This module never executes repository source and never elevates browser
 * policy output or UI presentation into host authorization.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  type GuiSourceSpan,
  SOURCE_SPAN_INTERFACE,
  SOURCE_SPAN_SCHEMA,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_ACTION_BINDING_INTERFACE = 'UiActionBinding@1' as const;
export const UI_ACTION_BINDING_SCHEMA = 'ui-action-binding/v1' as const;

export const UI_CONFIRMATION_BINDING_INTERFACE =
  'UiConfirmationBinding@1' as const;
export const UI_CONFIRMATION_BINDING_SCHEMA =
  'ui-confirmation-binding/v1' as const;

export const UI_POLICY_BINDING_VALIDATOR_INTERFACE =
  'UiPolicyBindingValidator@1' as const;
export const UI_POLICY_BINDING_VALIDATOR_SCHEMA =
  'ui-policy-binding-validator/v1' as const;

export const UI_POLICY_BINDING_VALIDATOR_VERSION =
  'gui-policy-binding-validator@1.0.0' as const;

export const UI_POLICY_BINDING_REPORT_INTERFACE =
  'UiPolicyBindingReport@1' as const;
export const UI_POLICY_BINDING_REPORT_SCHEMA =
  'ui-policy-binding-report/v1' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** How a displayed action resolved to a method/schema target. */
export const UI_BINDING_RESOLUTION_STATUSES = Object.freeze([
  'exact',
  'ambiguous',
  'dynamic',
  'unresolved',
] as const);
export type UiBindingResolutionStatus =
  (typeof UI_BINDING_RESOLUTION_STATUSES)[number];

/** Presentation visibility never authorizes. */
export const UI_PRESENTATION_VISIBILITIES = Object.freeze([
  'enabled',
  'disabled',
  'hidden',
] as const);
export type UiPresentationVisibility =
  (typeof UI_PRESENTATION_VISIBILITIES)[number];

/** Host-side deontic status used for dispatch-path checks. */
export const UI_DEONTIC_STATUSES = Object.freeze([
  'permitted',
  'obligated',
  'prohibited',
  'unavailable',
] as const);
export type UiDeonticStatus = (typeof UI_DEONTIC_STATUSES)[number];

/** Automatic-acceptance gate outcome for a binding validation report. */
export const UI_POLICY_ACCEPTANCE_OUTCOMES = Object.freeze([
  'allow_automatic',
  'block_automatic',
  'review_required',
] as const);
export type UiPolicyAcceptanceOutcome =
  (typeof UI_POLICY_ACCEPTANCE_OUTCOMES)[number];

/**
 * Closed reason codes for binding/policy failures. Codes that block automatic
 * acceptance are listed in BLOCKING_REASON_CODES below.
 */
export const UI_POLICY_BINDING_REASON_CODES = Object.freeze([
  'allowed',
  'ambiguous_binding',
  'dynamic_binding_unresolved',
  'multiple_method_schema_targets',
  'missing_method_or_schema',
  'method_schema_mismatch',
  'missing_canonical_contract',
  'missing_source_span',
  'ui_visibility_not_permission',
  'ui_enabled_not_permission',
  'browser_policy_not_authoritative',
  'stale_policy_decision',
  'missing_runtime_reevaluation',
  'runtime_action_mismatch',
  'runtime_argument_mismatch',
  'confirmation_required',
  'confirmation_binding_mismatch',
  'destructive_without_confirmation',
  'dispatchable_prohibited_action',
  'dispatchable_disabled_action',
  'hidden_dispatch_path',
  'host_boundary_missing',
  'review_required',
] as const);
export type UiPolicyBindingReasonCode =
  (typeof UI_POLICY_BINDING_REASON_CODES)[number];

/** Any of these reason codes blocks automatic acceptance. */
export const BLOCKING_REASON_CODES = Object.freeze([
  'ambiguous_binding',
  'dynamic_binding_unresolved',
  'multiple_method_schema_targets',
  'missing_method_or_schema',
  'method_schema_mismatch',
  'missing_canonical_contract',
  'ui_visibility_not_permission',
  'ui_enabled_not_permission',
  'browser_policy_not_authoritative',
  'stale_policy_decision',
  'missing_runtime_reevaluation',
  'runtime_action_mismatch',
  'runtime_argument_mismatch',
  'confirmation_required',
  'confirmation_binding_mismatch',
  'destructive_without_confirmation',
  'dispatchable_prohibited_action',
  'dispatchable_disabled_action',
  'hidden_dispatch_path',
  'host_boundary_missing',
  'review_required',
] as const);

/** Codes that force human review rather than pure rejection. */
export const REVIEW_REQUIRED_REASON_CODES = Object.freeze([
  'ambiguous_binding',
  'dynamic_binding_unresolved',
  'multiple_method_schema_targets',
  'review_required',
] as const);

// ---------------------------------------------------------------------------
// Wire record types
// ---------------------------------------------------------------------------

/** UiActionBinding@1 — mirrors Python UiActionBinding wire fields. */
export interface UiActionBinding {
  readonly interface: typeof UI_ACTION_BINDING_INTERFACE;
  readonly schema_version: typeof UI_ACTION_BINDING_SCHEMA;
  readonly action_id: string;
  readonly method: string;
  readonly schema_id: string;
  readonly requires_confirmation: boolean;
  readonly confirmation_id: string;
  readonly policy_id: string;
  readonly depends_on_schema: boolean;
  readonly is_destructive: boolean;
  readonly component_id: string;
}

/**
 * UiConfirmationBinding@1 — exact action + argument-digest confirmation.
 * Confirmation must bind the intended action and a canonical nonempty digest.
 */
export interface UiConfirmationBinding {
  readonly interface: typeof UI_CONFIRMATION_BINDING_INTERFACE;
  readonly schema_version: typeof UI_CONFIRMATION_BINDING_SCHEMA;
  readonly confirmation_id: string;
  readonly action_id: string;
  readonly argument_digest: string;
  readonly granted: boolean;
  readonly policy_decision_id: string;
  readonly notes: string;
}

/** Binding-source span + optional contract identity for evidence. */
export interface UiActionBindingEvidence {
  readonly action_id: string;
  readonly contract_reference: string;
  readonly source_span: GuiSourceSpan | null;
  readonly resolution: UiBindingResolutionStatus;
  /** Candidate method/schema pairs observed for the displayed action. */
  readonly candidate_targets: readonly UiActionTarget[];
}

export interface UiActionTarget {
  readonly method: string;
  readonly schema_id: string;
}

/**
 * Runtime re-evaluation observation for a displayed action. The host must
 * re-evaluate action, arguments, policy freshness, and confirmation; UI
 * presentation fields never authorize.
 */
export interface UiActionRuntimeObservation {
  readonly action_id: string;
  readonly current_method: string;
  readonly current_schema_id: string;
  readonly current_argument_digest: string;
  readonly policy_decision_id: string;
  readonly policy_fresh: boolean;
  readonly ui_visible: boolean;
  readonly ui_enabled: boolean;
  readonly presentation_visibility: UiPresentationVisibility;
  readonly deontic_status: UiDeonticStatus;
  /** True when an executable dispatch path exists (including hidden handlers). */
  readonly is_dispatchable: boolean;
  /** True when a non-visible handler can still dispatch the action. */
  readonly has_hidden_dispatch_path: boolean;
  /** Host re-evaluation has been performed for this observation. */
  readonly runtime_reevaluated: boolean;
  /** True when the action crosses the browser→host boundary. */
  readonly requires_host_boundary: boolean;
  readonly host_boundary_used: boolean;
  /**
   * Caller claim that browser policy output is authoritative. Always rejected.
   */
  readonly browser_policy_authoritative_claim: boolean;
  readonly confirmation: UiConfirmationBinding | null;
}

export interface UiPolicyBindingViolation {
  readonly code: UiPolicyBindingReasonCode;
  readonly message: string;
  readonly subject_id: string;
  readonly blocks_automatic_acceptance: boolean;
  readonly requires_review: boolean;
}

export interface UiPolicyBindingReport {
  readonly interface: typeof UI_POLICY_BINDING_REPORT_INTERFACE;
  readonly schema_version: typeof UI_POLICY_BINDING_REPORT_SCHEMA;
  readonly validator_interface: typeof UI_POLICY_BINDING_VALIDATOR_INTERFACE;
  readonly validator_schema_version: typeof UI_POLICY_BINDING_VALIDATOR_SCHEMA;
  readonly validator_version: typeof UI_POLICY_BINDING_VALIDATOR_VERSION;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
  readonly application_id: string;
  readonly screen_id: string;
  readonly action_bindings: readonly UiActionBinding[];
  readonly confirmation_bindings: readonly UiConfirmationBinding[];
  readonly unresolved_action_ids: readonly string[];
  readonly review_required_action_ids: readonly string[];
  readonly violations: readonly UiPolicyBindingViolation[];
  readonly reason_codes: readonly UiPolicyBindingReasonCode[];
  readonly acceptance_outcome: UiPolicyAcceptanceOutcome;
  readonly automatic_acceptance_blocked: boolean;
  /** Always false: UI visibility never proves permission. */
  readonly ui_visibility_authorizes: false;
  /** Always false: browser policy output is never authoritative. */
  readonly browser_policy_authoritative: false;
}

export interface UiPolicyBindingValidationRequest {
  readonly application_id: string;
  readonly screen_id: string;
  readonly action_bindings: readonly unknown[];
  readonly confirmation_bindings?: readonly unknown[];
  readonly binding_evidence?: readonly UiActionBindingEvidence[];
  readonly runtime_observations?: readonly UiActionRuntimeObservation[];
}

export interface UiPolicyBindingValidator {
  readonly interface: typeof UI_POLICY_BINDING_VALIDATOR_INTERFACE;
  readonly schema_version: typeof UI_POLICY_BINDING_VALIDATOR_SCHEMA;
  readonly validatorVersion: typeof UI_POLICY_BINDING_VALIDATOR_VERSION;
  validate(request: UiPolicyBindingValidationRequest): UiPolicyBindingReport;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiPolicyBindingError extends Error {
  readonly name = 'UiPolicyBindingError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiPolicyBindingDecodeError extends UiPolicyBindingError {
  readonly name = 'UiPolicyBindingDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const RESOLUTION_SET = new Set<string>(UI_BINDING_RESOLUTION_STATUSES);
const VISIBILITY_SET = new Set<string>(UI_PRESENTATION_VISIBILITIES);
const DEONTIC_SET = new Set<string>(UI_DEONTIC_STATUSES);
const REASON_SET = new Set<string>(UI_POLICY_BINDING_REASON_CODES);
const BLOCKING_SET = new Set<string>(BLOCKING_REASON_CODES);
const REVIEW_SET = new Set<string>(REVIEW_REQUIRED_REASON_CODES);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

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
    throw new UiPolicyBindingDecodeError(
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
    throw new UiPolicyBindingDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiPolicyBindingDecodeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new UiPolicyBindingDecodeError(`${field} must be a string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new UiPolicyBindingDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requireOptionalIdentifier(value: unknown, field: string): string {
  if (value === null || value === undefined || value === '') return '';
  return requireIdentifier(value, field);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UiPolicyBindingDecodeError(`${field} must be a boolean`);
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T {
  const text = requireString(value, field);
  if (!allowed.has(text)) {
    throw new UiPolicyBindingDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireCanonicalDigest(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!DIGEST_RE.test(text)) {
    throw new UiPolicyBindingDecodeError(
      `${field} must be a canonical sha256:[0-9a-f]{64} digest`,
    );
  }
  return text;
}

function requireOptionalCanonicalDigest(
  value: unknown,
  field: string,
): string {
  if (value === null || value === undefined || value === '') return '';
  return requireCanonicalDigest(value, field);
}

const ACTION_BINDING_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'action_id',
  'method',
  'schema_id',
  'requires_confirmation',
  'confirmation_id',
  'policy_id',
  'depends_on_schema',
  'is_destructive',
  'component_id',
] as const);

const CONFIRMATION_BINDING_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'confirmation_id',
  'action_id',
  'argument_digest',
  'granted',
  'policy_decision_id',
  'notes',
] as const);

const SOURCE_SPAN_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'path',
  'start_line',
  'start_column',
  'end_line',
  'end_column',
] as const);

function decodeSourceSpan(raw: unknown, field: string): GuiSourceSpan {
  if (!isPlainObject(raw)) {
    throw new UiPolicyBindingDecodeError(`${field} must be an object`);
  }
  rejectUnknownKeys(raw, SOURCE_SPAN_FIELDS, field);
  requireKeys(
    raw,
    [
      'interface',
      'schema_version',
      'path',
      'start_line',
      'start_column',
      'end_line',
      'end_column',
    ],
    field,
  );
  if (raw.interface !== SOURCE_SPAN_INTERFACE) {
    throw new UiPolicyBindingDecodeError(
      `unsupported ${field} interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== SOURCE_SPAN_SCHEMA) {
    throw new UiPolicyBindingDecodeError(
      `unsupported ${field} schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (typeof raw.start_line !== 'number' || !Number.isInteger(raw.start_line)) {
    throw new UiPolicyBindingDecodeError(`${field}.start_line must be an integer`);
  }
  if (
    typeof raw.start_column !== 'number' ||
    !Number.isInteger(raw.start_column)
  ) {
    throw new UiPolicyBindingDecodeError(
      `${field}.start_column must be an integer`,
    );
  }
  const endLine =
    raw.end_line === null
      ? null
      : typeof raw.end_line === 'number' && Number.isInteger(raw.end_line)
        ? raw.end_line
        : (() => {
            throw new UiPolicyBindingDecodeError(
              `${field}.end_line must be an integer or null`,
            );
          })();
  const endColumn =
    raw.end_column === null
      ? null
      : typeof raw.end_column === 'number' && Number.isInteger(raw.end_column)
        ? raw.end_column
        : (() => {
            throw new UiPolicyBindingDecodeError(
              `${field}.end_column must be an integer or null`,
            );
          })();
  return Object.freeze({
    interface: SOURCE_SPAN_INTERFACE,
    schema_version: SOURCE_SPAN_SCHEMA,
    path: requireString(raw.path, `${field}.path`),
    start_line: raw.start_line,
    start_column: raw.start_column,
    end_line: endLine,
    end_column: endColumn,
  });
}

// ---------------------------------------------------------------------------
// Public decoders / builders
// ---------------------------------------------------------------------------

export function decodeUiActionBinding(raw: unknown): UiActionBinding {
  if (!isPlainObject(raw)) {
    throw new UiPolicyBindingDecodeError('UiActionBinding must be an object');
  }
  rejectUnknownKeys(raw, ACTION_BINDING_FIELDS, 'UiActionBinding');
  requireKeys(raw, ACTION_BINDING_FIELDS, 'UiActionBinding');
  if (raw.interface !== UI_ACTION_BINDING_INTERFACE) {
    throw new UiPolicyBindingDecodeError(
      `unsupported UiActionBinding interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_ACTION_BINDING_SCHEMA) {
    throw new UiPolicyBindingDecodeError(
      `unsupported UiActionBinding schema_version: ${String(raw.schema_version)}`,
    );
  }
  const requiresConfirmation = requireBoolean(
    raw.requires_confirmation,
    'requires_confirmation',
  );
  const confirmationId = requireOptionalIdentifier(
    raw.confirmation_id,
    'confirmation_id',
  );
  if (requiresConfirmation && !confirmationId) {
    throw new UiPolicyBindingDecodeError(
      'confirmation_id is required when requires_confirmation is true',
    );
  }
  return Object.freeze({
    interface: UI_ACTION_BINDING_INTERFACE,
    schema_version: UI_ACTION_BINDING_SCHEMA,
    action_id: requireIdentifier(raw.action_id, 'action_id'),
    method: requireIdentifier(raw.method, 'method'),
    schema_id: requireIdentifier(raw.schema_id, 'schema_id'),
    requires_confirmation: requiresConfirmation,
    confirmation_id: confirmationId,
    policy_id: requireOptionalIdentifier(raw.policy_id, 'policy_id'),
    depends_on_schema: requireBoolean(raw.depends_on_schema, 'depends_on_schema'),
    is_destructive: requireBoolean(raw.is_destructive, 'is_destructive'),
    component_id: requireOptionalIdentifier(raw.component_id, 'component_id'),
  });
}

export function makeUiActionBinding(partial: {
  action_id: string;
  method: string;
  schema_id: string;
  requires_confirmation?: boolean;
  confirmation_id?: string;
  policy_id?: string;
  depends_on_schema?: boolean;
  is_destructive?: boolean;
  component_id?: string;
}): UiActionBinding {
  const requires =
    partial.requires_confirmation ??
    (Boolean(partial.is_destructive) || Boolean(partial.confirmation_id));
  return decodeUiActionBinding({
    interface: UI_ACTION_BINDING_INTERFACE,
    schema_version: UI_ACTION_BINDING_SCHEMA,
    action_id: partial.action_id,
    method: partial.method,
    schema_id: partial.schema_id,
    requires_confirmation: requires,
    confirmation_id: partial.confirmation_id ?? '',
    policy_id: partial.policy_id ?? '',
    depends_on_schema: partial.depends_on_schema ?? true,
    is_destructive: partial.is_destructive ?? false,
    component_id: partial.component_id ?? '',
  });
}

export function decodeUiConfirmationBinding(
  raw: unknown,
): UiConfirmationBinding {
  if (!isPlainObject(raw)) {
    throw new UiPolicyBindingDecodeError(
      'UiConfirmationBinding must be an object',
    );
  }
  rejectUnknownKeys(raw, CONFIRMATION_BINDING_FIELDS, 'UiConfirmationBinding');
  requireKeys(raw, CONFIRMATION_BINDING_FIELDS, 'UiConfirmationBinding');
  if (raw.interface !== UI_CONFIRMATION_BINDING_INTERFACE) {
    throw new UiPolicyBindingDecodeError(
      `unsupported UiConfirmationBinding interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONFIRMATION_BINDING_SCHEMA) {
    throw new UiPolicyBindingDecodeError(
      `unsupported UiConfirmationBinding schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONFIRMATION_BINDING_INTERFACE,
    schema_version: UI_CONFIRMATION_BINDING_SCHEMA,
    confirmation_id: requireIdentifier(raw.confirmation_id, 'confirmation_id'),
    action_id: requireIdentifier(raw.action_id, 'action_id'),
    argument_digest: requireCanonicalDigest(
      raw.argument_digest,
      'argument_digest',
    ),
    granted: requireBoolean(raw.granted, 'granted'),
    policy_decision_id: requireOptionalIdentifier(
      raw.policy_decision_id,
      'policy_decision_id',
    ),
    notes: requireOptionalString(raw.notes, 'notes'),
  });
}

export function makeUiConfirmationBinding(partial: {
  confirmation_id: string;
  action_id: string;
  argument_digest: string;
  granted?: boolean;
  policy_decision_id?: string;
  notes?: string;
}): UiConfirmationBinding {
  return decodeUiConfirmationBinding({
    interface: UI_CONFIRMATION_BINDING_INTERFACE,
    schema_version: UI_CONFIRMATION_BINDING_SCHEMA,
    confirmation_id: partial.confirmation_id,
    action_id: partial.action_id,
    argument_digest: partial.argument_digest,
    granted: partial.granted ?? false,
    policy_decision_id: partial.policy_decision_id ?? '',
    notes: partial.notes ?? '',
  });
}

export function argumentDigestFromPayload(payload: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(payload))}`;
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
      throw new UiPolicyBindingError('canonical JSON rejects non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new UiPolicyBindingError(
    `canonical JSON cannot encode ${typeof value}`,
  );
}

export function serializeUiPolicyBindingReport(
  report: UiPolicyBindingReport,
): string {
  return canonicalJson(report);
}

export function policyBindingReportDigest(
  report: UiPolicyBindingReport,
): string {
  return `sha256:${sha256Hex(serializeUiPolicyBindingReport(report))}`;
}

// ---------------------------------------------------------------------------
// Exact confirmation check (shared with acceptance doctrine)
// ---------------------------------------------------------------------------

/**
 * Exact confirmation must bind the intended action and the same nonempty
 * canonical argument digest. Visibility of a confirm dialog is irrelevant.
 */
export function exactConfirmationBinding(
  intendedActionId: string,
  intendedArgumentDigest: string,
  confirmation: UiConfirmationBinding | null | undefined,
): boolean {
  if (!intendedActionId || !intendedArgumentDigest) return false;
  if (!DIGEST_RE.test(intendedArgumentDigest)) return false;
  if (!confirmation) return false;
  if (!confirmation.granted) return false;
  if (confirmation.action_id !== intendedActionId) return false;
  if (confirmation.argument_digest !== intendedArgumentDigest) return false;
  return true;
}

/**
 * UI presentation is advisory only. Visibility/enabled never authorizes.
 */
export function presentationDoesNotAuthorize(
  observation: Pick<
    UiActionRuntimeObservation,
    'ui_visible' | 'ui_enabled' | 'presentation_visibility'
  >,
): {
  readonly authorized: false;
  readonly reasons: readonly string[];
} {
  const reasons: string[] = [
    'UI visibility never proves permission',
    'UI enabled state never authorizes',
    'presentation is advisory and never authorizes',
  ];
  if (observation.ui_visible || observation.ui_enabled) {
    reasons.push(
      `presentation_visibility=${observation.presentation_visibility} is not authorization`,
    );
  }
  return Object.freeze({
    authorized: false as const,
    reasons: Object.freeze(reasons),
  });
}

// ---------------------------------------------------------------------------
// Validator implementation
// ---------------------------------------------------------------------------

function freezeViolation(
  code: UiPolicyBindingReasonCode,
  message: string,
  subjectId: string,
): UiPolicyBindingViolation {
  if (!REASON_SET.has(code)) {
    throw new UiPolicyBindingError(`unknown reason code: ${code}`);
  }
  return Object.freeze({
    code,
    message,
    subject_id: subjectId,
    blocks_automatic_acceptance: BLOCKING_SET.has(code),
    requires_review: REVIEW_SET.has(code),
  });
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function decodeEvidence(
  raw: UiActionBindingEvidence,
): UiActionBindingEvidence {
  if (!raw || typeof raw !== 'object') {
    throw new UiPolicyBindingDecodeError(
      'binding evidence must be an object',
    );
  }
  const resolution = requireEnum<UiBindingResolutionStatus>(
    raw.resolution,
    'resolution',
    RESOLUTION_SET,
  );
  const candidates = Array.isArray(raw.candidate_targets)
    ? raw.candidate_targets.map((target, index) => {
        if (!isPlainObject(target)) {
          throw new UiPolicyBindingDecodeError(
            `candidate_targets[${index}] must be an object`,
          );
        }
        return Object.freeze({
          method: requireIdentifier(target.method, `candidate_targets[${index}].method`),
          schema_id: requireIdentifier(
            target.schema_id,
            `candidate_targets[${index}].schema_id`,
          ),
        });
      })
    : [];
  const span =
    raw.source_span === null || raw.source_span === undefined
      ? null
      : decodeSourceSpan(raw.source_span, 'source_span');
  return Object.freeze({
    action_id: requireIdentifier(raw.action_id, 'action_id'),
    contract_reference: requireOptionalString(
      raw.contract_reference,
      'contract_reference',
    ),
    source_span: span,
    resolution,
    candidate_targets: Object.freeze(candidates),
  });
}

function decodeRuntimeObservation(
  raw: UiActionRuntimeObservation,
): UiActionRuntimeObservation {
  if (!raw || typeof raw !== 'object') {
    throw new UiPolicyBindingDecodeError(
      'runtime observation must be an object',
    );
  }
  const confirmation =
    raw.confirmation === null || raw.confirmation === undefined
      ? null
      : decodeUiConfirmationBinding(raw.confirmation);
  return Object.freeze({
    action_id: requireIdentifier(raw.action_id, 'action_id'),
    current_method: requireIdentifier(raw.current_method, 'current_method'),
    current_schema_id: requireIdentifier(
      raw.current_schema_id,
      'current_schema_id',
    ),
    current_argument_digest: requireCanonicalDigest(
      raw.current_argument_digest,
      'current_argument_digest',
    ),
    policy_decision_id: requireOptionalIdentifier(
      raw.policy_decision_id,
      'policy_decision_id',
    ),
    policy_fresh: requireBoolean(raw.policy_fresh, 'policy_fresh'),
    ui_visible: requireBoolean(raw.ui_visible, 'ui_visible'),
    ui_enabled: requireBoolean(raw.ui_enabled, 'ui_enabled'),
    presentation_visibility: requireEnum<UiPresentationVisibility>(
      raw.presentation_visibility,
      'presentation_visibility',
      VISIBILITY_SET,
    ),
    deontic_status: requireEnum<UiDeonticStatus>(
      raw.deontic_status,
      'deontic_status',
      DEONTIC_SET,
    ),
    is_dispatchable: requireBoolean(raw.is_dispatchable, 'is_dispatchable'),
    has_hidden_dispatch_path: requireBoolean(
      raw.has_hidden_dispatch_path,
      'has_hidden_dispatch_path',
    ),
    runtime_reevaluated: requireBoolean(
      raw.runtime_reevaluated,
      'runtime_reevaluated',
    ),
    requires_host_boundary: requireBoolean(
      raw.requires_host_boundary,
      'requires_host_boundary',
    ),
    host_boundary_used: requireBoolean(
      raw.host_boundary_used,
      'host_boundary_used',
    ),
    browser_policy_authoritative_claim: requireBoolean(
      raw.browser_policy_authoritative_claim,
      'browser_policy_authoritative_claim',
    ),
    confirmation,
  });
}

function validateSingleBinding(
  binding: UiActionBinding,
  evidence: UiActionBindingEvidence | undefined,
  observation: UiActionRuntimeObservation | undefined,
  confirmationsById: Map<string, UiConfirmationBinding>,
): {
  violations: UiPolicyBindingViolation[];
  unresolved: boolean;
  reviewRequired: boolean;
} {
  const violations: UiPolicyBindingViolation[] = [];
  let unresolved = false;
  let reviewRequired = false;
  const subject = binding.action_id;

  // --- Binding resolution: one intended method/schema per displayed action ---
  if (evidence) {
    if (evidence.resolution === 'ambiguous') {
      violations.push(
        freezeViolation(
          'ambiguous_binding',
          'ambiguous action binding requires human review and cannot auto-accept',
          subject,
        ),
      );
      unresolved = true;
      reviewRequired = true;
    } else if (evidence.resolution === 'dynamic') {
      violations.push(
        freezeViolation(
          'dynamic_binding_unresolved',
          'dynamic action binding is unresolved and requires review',
          subject,
        ),
      );
      unresolved = true;
      reviewRequired = true;
    } else if (evidence.resolution === 'unresolved') {
      violations.push(
        freezeViolation(
          'dynamic_binding_unresolved',
          'action binding is unresolved at the UI boundary',
          subject,
        ),
      );
      unresolved = true;
      reviewRequired = true;
    }

    if (evidence.candidate_targets.length > 1) {
      const unique = new Set(
        evidence.candidate_targets.map(t => `${t.method}::${t.schema_id}`),
      );
      if (unique.size > 1) {
        violations.push(
          freezeViolation(
            'multiple_method_schema_targets',
            'displayed action resolves to more than one method/schema target',
            subject,
          ),
        );
        // Multi-target is a form of ambiguity: unresolved + review-required.
        unresolved = true;
        reviewRequired = true;
      }
    }

    if (!evidence.contract_reference) {
      violations.push(
        freezeViolation(
          'missing_canonical_contract',
          'action binding lacks a canonical contract reference',
          subject,
        ),
      );
    }

    if (evidence.source_span === null && evidence.resolution === 'exact') {
      // Source span is evidence for exact bindings; missing span is advisory
      // but recorded so audit trails can surface it without inventing spans.
      violations.push(
        freezeViolation(
          'missing_source_span',
          'exact binding is missing a binding-source span',
          subject,
        ),
      );
    }
  }

  if (!binding.method || !binding.schema_id) {
    violations.push(
      freezeViolation(
        'missing_method_or_schema',
        'action binding must declare method and schema_id',
        subject,
      ),
    );
  }

  // Destructive actions require confirmation identity on the binding.
  if (binding.is_destructive && !binding.requires_confirmation) {
    violations.push(
      freezeViolation(
        'destructive_without_confirmation',
        'destructive action must require confirmation bound to exact action/arguments',
        subject,
      ),
    );
  }
  if (binding.requires_confirmation && !binding.confirmation_id) {
    violations.push(
      freezeViolation(
        'confirmation_required',
        'requires_confirmation is true but confirmation_id is empty',
        subject,
      ),
    );
  }

  // --- Runtime re-evaluation and dispatch-path doctrine ---
  if (!observation) {
    // Without runtime facts we cannot prove dispatch absence or freshness;
    // do not invent observations. Missing re-evaluation blocks auto-accept
    // for dispatch-sensitive or confirmation-required actions.
    if (
      binding.is_destructive ||
      binding.requires_confirmation ||
      binding.policy_id
    ) {
      violations.push(
        freezeViolation(
          'missing_runtime_reevaluation',
          'current action/arguments/policy were not re-evaluated at runtime',
          subject,
        ),
      );
    }
    return { violations, unresolved, reviewRequired };
  }

  if (!observation.runtime_reevaluated) {
    violations.push(
      freezeViolation(
        'missing_runtime_reevaluation',
        'current action and arguments must be re-evaluated at runtime',
        subject,
      ),
    );
  }

  // UI visibility / enabled never prove permission. The report always carries
  // ui_visibility_authorizes=false; presentation is advisory only and is never
  // elevated into a permit here.

  if (observation.browser_policy_authoritative_claim) {
    violations.push(
      freezeViolation(
        'browser_policy_not_authoritative',
        'browser policy output is never authoritative',
        subject,
      ),
    );
  }

  // Method/schema must match the intended binding under re-evaluation.
  if (
    observation.current_method !== binding.method ||
    observation.current_schema_id !== binding.schema_id
  ) {
    violations.push(
      freezeViolation(
        'method_schema_mismatch',
        'runtime method/schema does not match the intended action binding',
        subject,
      ),
    );
  }

  if (observation.action_id !== binding.action_id) {
    violations.push(
      freezeViolation(
        'runtime_action_mismatch',
        'runtime action_id does not match the intended binding',
        subject,
      ),
    );
  }

  // Stale policy decisions cannot authorize.
  if (observation.policy_decision_id && !observation.policy_fresh) {
    violations.push(
      freezeViolation(
        'stale_policy_decision',
        'a stale policy decision cannot authorize the current action',
        subject,
      ),
    );
  }
  if (binding.policy_id && observation.policy_decision_id === '' && observation.runtime_reevaluated) {
    // Policy-shaped actions without a fresh decision id are not auto-accepted.
    if (!observation.policy_fresh) {
      violations.push(
        freezeViolation(
          'stale_policy_decision',
          'policy-shaped action lacks a fresh policy decision at re-evaluation',
          subject,
        ),
      );
    }
  }

  // Prohibited / disabled actions must not be dispatchable.
  const prohibited =
    observation.deontic_status === 'prohibited' ||
    observation.deontic_status === 'unavailable';
  const presentationDisabled =
    observation.presentation_visibility === 'disabled' ||
    observation.presentation_visibility === 'hidden' ||
    observation.ui_enabled === false;

  if (prohibited && observation.is_dispatchable) {
    violations.push(
      freezeViolation(
        'dispatchable_prohibited_action',
        'prohibited/unavailable action has an executable dispatch path',
        subject,
      ),
    );
  }

  if (presentationDisabled && observation.is_dispatchable) {
    violations.push(
      freezeViolation(
        'dispatchable_disabled_action',
        'disabled action remains dispatchable',
        subject,
      ),
    );
  }

  // Hidden dispatch path for prohibited/disabled actions is always a block.
  if (
    observation.has_hidden_dispatch_path &&
    (prohibited || presentationDisabled)
  ) {
    violations.push(
      freezeViolation(
        'hidden_dispatch_path',
        'prohibited/disabled action has an executable hidden dispatch path',
        subject,
      ),
    );
  }

  // Any hidden dispatch path is recorded even when presentation is enabled —
  // the host must still re-evaluate; hidden handlers for non-permitted
  // actions already block above.

  // Host-boundary use for host-crossing actions.
  if (observation.requires_host_boundary && !observation.host_boundary_used) {
    violations.push(
      freezeViolation(
        'host_boundary_missing',
        'host-crossing action must use the browser-host boundary',
        subject,
      ),
    );
  }

  // Exact argument-bound confirmation.
  const needsConfirmation =
    binding.requires_confirmation || binding.is_destructive;
  if (needsConfirmation) {
    const confirmation =
      observation.confirmation ??
      (binding.confirmation_id
        ? confirmationsById.get(binding.confirmation_id) ?? null
        : null);

    if (!confirmation || !confirmation.granted) {
      violations.push(
        freezeViolation(
          'confirmation_required',
          'destructive/sensitive action requires exact confirmation',
          subject,
        ),
      );
    } else if (
      !exactConfirmationBinding(
        binding.action_id,
        observation.current_argument_digest,
        confirmation,
      )
    ) {
      violations.push(
        freezeViolation(
          'confirmation_binding_mismatch',
          'confirmation must bind the exact action and argument digest',
          subject,
        ),
      );
    } else if (
      binding.confirmation_id &&
      confirmation.confirmation_id !== binding.confirmation_id
    ) {
      violations.push(
        freezeViolation(
          'confirmation_binding_mismatch',
          'confirmation_id does not match the action binding',
          subject,
        ),
      );
    }
  }

  // Visibility never authorizes: if the only "permission" signal is UI
  // presentation for a non-permitted deontic status, record the doctrine.
  if (
    prohibited &&
    (observation.ui_visible || observation.ui_enabled) &&
    !observation.runtime_reevaluated
  ) {
    violations.push(
      freezeViolation(
        'ui_visibility_not_permission',
        'UI visibility never proves permission',
        subject,
      ),
    );
  }

  return { violations, unresolved, reviewRequired };
}

export function validatePolicyBindings(
  request: UiPolicyBindingValidationRequest,
): UiPolicyBindingReport {
  if (!request || typeof request !== 'object') {
    throw new UiPolicyBindingError('request must be an object');
  }

  const applicationId = requireIdentifier(
    request.application_id,
    'application_id',
  );
  const screenId = requireIdentifier(request.screen_id, 'screen_id');

  const actionBindings = (request.action_bindings ?? []).map(raw =>
    decodeUiActionBinding(raw),
  );
  const confirmationBindings = (request.confirmation_bindings ?? []).map(raw =>
    decodeUiConfirmationBinding(raw),
  );

  // Detect duplicate action_ids.
  const seenActionIds = new Set<string>();
  for (const binding of actionBindings) {
    if (seenActionIds.has(binding.action_id)) {
      throw new UiPolicyBindingError(
        `duplicate action_id: ${binding.action_id}`,
      );
    }
    seenActionIds.add(binding.action_id);
  }

  const confirmationsById = new Map<string, UiConfirmationBinding>();
  for (const conf of confirmationBindings) {
    if (confirmationsById.has(conf.confirmation_id)) {
      throw new UiPolicyBindingError(
        `duplicate confirmation_id: ${conf.confirmation_id}`,
      );
    }
    confirmationsById.set(conf.confirmation_id, conf);
  }

  const evidenceByAction = new Map<string, UiActionBindingEvidence>();
  for (const raw of request.binding_evidence ?? []) {
    const evidence = decodeEvidence(raw);
    if (evidenceByAction.has(evidence.action_id)) {
      throw new UiPolicyBindingError(
        `duplicate binding evidence for action_id: ${evidence.action_id}`,
      );
    }
    evidenceByAction.set(evidence.action_id, evidence);
  }

  const observationsByAction = new Map<string, UiActionRuntimeObservation>();
  for (const raw of request.runtime_observations ?? []) {
    const observation = decodeRuntimeObservation(raw);
    if (observationsByAction.has(observation.action_id)) {
      throw new UiPolicyBindingError(
        `duplicate runtime observation for action_id: ${observation.action_id}`,
      );
    }
    observationsByAction.set(observation.action_id, observation);
  }

  const allViolations: UiPolicyBindingViolation[] = [];
  const unresolvedIds: string[] = [];
  const reviewIds: string[] = [];

  for (const binding of actionBindings) {
    const result = validateSingleBinding(
      binding,
      evidenceByAction.get(binding.action_id),
      observationsByAction.get(binding.action_id),
      confirmationsById,
    );
    allViolations.push(...result.violations);
    if (result.unresolved) unresolvedIds.push(binding.action_id);
    if (result.reviewRequired) reviewIds.push(binding.action_id);
  }

  // Observations for unknown actions are unresolved.
  for (const actionId of observationsByAction.keys()) {
    if (!seenActionIds.has(actionId)) {
      unresolvedIds.push(actionId);
      allViolations.push(
        freezeViolation(
          'dynamic_binding_unresolved',
          'runtime observation references an unknown action binding',
          actionId,
        ),
      );
      reviewIds.push(actionId);
    }
  }

  // Sort violations deterministically by (code, subject_id, message).
  allViolations.sort((a, b) => {
    const codeCmp = a.code.localeCompare(b.code);
    if (codeCmp !== 0) return codeCmp;
    const subjectCmp = a.subject_id.localeCompare(b.subject_id);
    if (subjectCmp !== 0) return subjectCmp;
    return a.message.localeCompare(b.message);
  });

  const reasonCodes = uniqueSorted(allViolations.map(v => v.code));

  // Acceptance doctrine:
  // 1. Hard security/dispatch/confirmation/stale failures always block.
  // 2. Ambiguous/dynamic alone → review_required (still blocks auto).
  // 3. Advisory-only codes (e.g. missing_source_span) do not block.
  // 4. Clean → allow_automatic.
  // Hard blocks: security, dispatch, confirmation, freshness, host boundary.
  // Ambiguous/dynamic multi-target cases prefer review_required (still
  // automatic_acceptance_blocked) rather than a pure hard block.
  const hardBlockCodes = new Set<UiPolicyBindingReasonCode>([
    'dispatchable_prohibited_action',
    'dispatchable_disabled_action',
    'hidden_dispatch_path',
    'stale_policy_decision',
    'confirmation_required',
    'confirmation_binding_mismatch',
    'destructive_without_confirmation',
    'browser_policy_not_authoritative',
    'host_boundary_missing',
    'method_schema_mismatch',
    'runtime_action_mismatch',
    'runtime_argument_mismatch',
    'missing_runtime_reevaluation',
    'ui_visibility_not_permission',
    'ui_enabled_not_permission',
    'missing_method_or_schema',
    'missing_canonical_contract',
  ]);

  const hasHardBlock = allViolations.some(v => hardBlockCodes.has(v.code));
  const hasReviewCode = allViolations.some(v => REVIEW_SET.has(v.code));
  const hasBlocking = allViolations.some(v => v.blocks_automatic_acceptance);

  let acceptanceOutcome: UiPolicyAcceptanceOutcome;
  if (hasHardBlock) {
    acceptanceOutcome = 'block_automatic';
  } else if (hasReviewCode) {
    acceptanceOutcome = 'review_required';
  } else if (hasBlocking) {
    acceptanceOutcome = 'block_automatic';
  } else {
    acceptanceOutcome = 'allow_automatic';
  }

  const automaticBlocked = acceptanceOutcome !== 'allow_automatic';

  return Object.freeze({
    interface: UI_POLICY_BINDING_REPORT_INTERFACE,
    schema_version: UI_POLICY_BINDING_REPORT_SCHEMA,
    validator_interface: UI_POLICY_BINDING_VALIDATOR_INTERFACE,
    validator_schema_version: UI_POLICY_BINDING_VALIDATOR_SCHEMA,
    validator_version: UI_POLICY_BINDING_VALIDATOR_VERSION,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    application_id: applicationId,
    screen_id: screenId,
    action_bindings: Object.freeze([...actionBindings]),
    confirmation_bindings: Object.freeze([...confirmationBindings]),
    unresolved_action_ids: uniqueSorted(unresolvedIds),
    review_required_action_ids: uniqueSorted(reviewIds),
    violations: Object.freeze(allViolations),
    reason_codes: reasonCodes,
    acceptance_outcome: acceptanceOutcome,
    automatic_acceptance_blocked: automaticBlocked,
    ui_visibility_authorizes: false as const,
    browser_policy_authoritative: false as const,
  });
}

export function createUiPolicyBindingValidator(): UiPolicyBindingValidator {
  return Object.freeze({
    interface: UI_POLICY_BINDING_VALIDATOR_INTERFACE,
    schema_version: UI_POLICY_BINDING_VALIDATOR_SCHEMA,
    validatorVersion: UI_POLICY_BINDING_VALIDATOR_VERSION,
    validate(request: UiPolicyBindingValidationRequest): UiPolicyBindingReport {
      return validatePolicyBindings(request);
    },
  });
}

/**
 * Convenience: whether a report permits automatic acceptance.
 * Ambiguous/dynamic, dispatchable prohibited/disabled, stale policy, and
 * exact-confirmation failures all return false.
 */
export function allowsAutomaticAcceptance(
  report: UiPolicyBindingReport,
): boolean {
  return (
    report.acceptance_outcome === 'allow_automatic' &&
    !report.automatic_acceptance_blocked &&
    report.ui_visibility_authorizes === false &&
    report.browser_policy_authoritative === false
  );
}

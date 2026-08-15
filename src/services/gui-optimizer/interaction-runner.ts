/**
 * Deterministic interaction and focus tracing (VGO-034).
 *
 * Wire models:
 *   - UiInteractionRunner@1 / ui-interaction-runner/v1
 *   - InteractionReceipt@1 / interaction-receipt/v1
 *   - UiFocusTrace@1 / ui-focus-trace/v1
 *
 * Drives fixture scenarios through browser-visible interfaces only. Never
 * bypasses policy, confirmation, or service boundaries to manufacture success.
 * Captures state/event transitions, user and keyboard steps, reachability,
 * focus moves/restoration/trapping, action dispatches, service outcomes and
 * terminal results. Reruns with identical fixture inputs yield the same
 * timestamp-normalized trace identity.
 *
 * This module never executes repository source and never elevates browser
 * content into privileged host operations.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  GUI_EXTRACTION_CONFIDENCE,
  GUI_VERIFICATION_STATUS,
  type GuiExtractionConfidence,
  type GuiVerificationStatus,
} from './models.js';
import {
  lookupTransitionOutcomes,
  type UiStateMachine,
} from './state-machine.js';
import type { UiActionBinding } from './policy-validator.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_INTERACTION_RUNNER_INTERFACE = 'UiInteractionRunner@1' as const;
export const UI_INTERACTION_RUNNER_SCHEMA = 'ui-interaction-runner/v1' as const;

export const INTERACTION_RECEIPT_INTERFACE = 'InteractionReceipt@1' as const;
export const INTERACTION_RECEIPT_SCHEMA = 'interaction-receipt/v1' as const;

export const UI_FOCUS_TRACE_INTERFACE = 'UiFocusTrace@1' as const;
export const UI_FOCUS_TRACE_SCHEMA = 'ui-focus-trace/v1' as const;

export const UI_INTERACTION_TRACE_INTERFACE = 'UiInteractionTrace@1' as const;
export const UI_INTERACTION_TRACE_SCHEMA = 'ui-interaction-trace/v1' as const;

export const UI_INTERACTION_RUNNER_VERSION =
  'gui-interaction-runner@1.0.0' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** Authority label for an observation or claim (mirrors Python EvidenceLevel). */
export const EVIDENCE_LEVELS = Object.freeze([
  'automated',
  'structural',
  'integrity',
  'heuristic',
  'human_reviewed',
  'simulated',
] as const);
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/** Closed interaction step kinds driven through browser-visible interfaces. */
export const UI_INTERACTION_STEP_KINDS = Object.freeze([
  'focus',
  'blur',
  'click',
  'keyboard_activation',
  'tab',
  'shift_tab',
  'escape',
  'submit',
  'cancel',
  'confirmation_grant',
  'confirmation_denial',
  'service_outcome',
  'wait',
] as const);
export type UiInteractionStepKind = (typeof UI_INTERACTION_STEP_KINDS)[number];

/** Focus observations recorded in the focus trace. */
export const UI_FOCUS_OBSERVATION_KINDS = Object.freeze([
  'move',
  'restore',
  'trap',
  'loss',
  'enter_modal',
  'leave_modal',
  'unchanged',
] as const);
export type UiFocusObservationKind =
  (typeof UI_FOCUS_OBSERVATION_KINDS)[number];

/** Service outcome labels kept distinct from confirmation outcomes. */
export const UI_SERVICE_OUTCOMES = Object.freeze([
  'success',
  'empty',
  'loading',
  'recoverable_error',
  'unrecoverable_error',
  'service_unavailable',
  'validation_failure',
] as const);
export type UiServiceOutcome = (typeof UI_SERVICE_OUTCOMES)[number];

/** Transition application outcomes (undefined stays visible, not invented). */
export const UI_TRANSITION_APPLICATION_STATUSES = Object.freeze([
  'applied',
  'noop',
  'undefined',
  'blocked_confirmation',
  'blocked_policy',
  'blocked_not_visible',
  'blocked_service_boundary',
] as const);
export type UiTransitionApplicationStatus =
  (typeof UI_TRANSITION_APPLICATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Wire / runtime record types
// ---------------------------------------------------------------------------

/** InteractionReceipt@1 — mirrors Python InteractionReceipt wire fields. */
export interface InteractionReceipt {
  readonly interface: typeof INTERACTION_RECEIPT_INTERFACE;
  readonly schema_version: typeof INTERACTION_RECEIPT_SCHEMA;
  readonly receipt_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly step_ids: readonly string[];
  readonly focus_sequence: readonly string[];
  readonly event_ids: readonly string[];
  readonly action_invocation_ids: readonly string[];
  readonly confirmation_id: string;
  readonly recovery_ids: readonly string[];
  readonly unresolved_observation_ids: readonly string[];
  readonly evidence_level: EvidenceLevel;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

/** One focus snapshot at a normalized ordinal (timestamp-normalized). */
export interface UiFocusSnapshot {
  readonly ordinal: number;
  readonly step_id: string;
  readonly focused_control_id: string;
  readonly previous_control_id: string;
  readonly observation: UiFocusObservationKind;
  readonly trapped: boolean;
  readonly modal_id: string;
  readonly visible: boolean;
}

/** UiFocusTrace@1 — ordered focus observations for a scenario run. */
export interface UiFocusTrace {
  readonly interface: typeof UI_FOCUS_TRACE_INTERFACE;
  readonly schema_version: typeof UI_FOCUS_TRACE_SCHEMA;
  readonly trace_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly initial_focus_id: string;
  readonly final_focus_id: string;
  readonly focus_sequence: readonly string[];
  readonly snapshots: readonly UiFocusSnapshot[];
  readonly focus_loss_step_ids: readonly string[];
  readonly trap_step_ids: readonly string[];
  readonly restoration_step_ids: readonly string[];
  readonly has_focus_loss: boolean;
  readonly has_focus_trap: boolean;
}

/** Declared fixture step input (browser-visible interface only). */
export interface UiInteractionStepInput {
  readonly step_id: string;
  readonly kind: UiInteractionStepKind;
  /** Target control id; empty only for wait / service_outcome without target. */
  readonly target_control_id?: string;
  /** State-machine event id applied by this step, if any. */
  readonly event_id?: string;
  /** Action binding id for click/submit/keyboard activation. */
  readonly action_id?: string;
  /** Confirmation identity for grant/deny steps. */
  readonly confirmation_id?: string;
  /** Expected focus after step (optional; empty means "no focus claim"). */
  readonly expected_focus_id?: string;
  /** True when step is keyboard-only. */
  readonly keyboard?: boolean;
  /** Service outcome for service_outcome steps. */
  readonly service_outcome?: UiServiceOutcome;
  /**
   * Absolute wall-clock timestamp from the fixture harness (ms). Normalized
   * away so reruns with different clocks share the same identity.
   */
  readonly wall_timestamp_ms?: number;
  /** Optional modal container id for trap/restore checks. */
  readonly modal_id?: string;
  /** Notes retained for unresolved observations. */
  readonly notes?: string;
}

/** Action invocation observation with method/schema references. */
export interface UiActionInvocationObservation {
  readonly invocation_id: string;
  readonly step_id: string;
  readonly action_id: string;
  readonly method: string;
  readonly schema_id: string;
  readonly confirmation_id: string;
  readonly allowed: boolean;
  readonly blocked_reason: string;
}

/** One normalized step record after timestamp normalization. */
export interface UiNormalizedInteractionStep {
  readonly step_id: string;
  readonly ordinal: number;
  /** Relative ms from first step (always 0 for the first step). */
  readonly relative_timestamp_ms: number;
  readonly kind: UiInteractionStepKind;
  readonly target_control_id: string;
  readonly event_id: string;
  readonly action_id: string;
  readonly confirmation_id: string;
  readonly keyboard: boolean;
  readonly from_state_id: string;
  readonly to_state_id: string;
  readonly transition_status: UiTransitionApplicationStatus;
  readonly transition_id: string;
  readonly service_outcome: string;
  readonly focus_observation: UiFocusObservationKind;
  readonly focused_control_id: string;
  readonly notes: string;
}

/** Full timestamp-normalized interaction trace. */
export interface UiInteractionTrace {
  readonly interface: typeof UI_INTERACTION_TRACE_INTERFACE;
  readonly schema_version: typeof UI_INTERACTION_TRACE_SCHEMA;
  readonly trace_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly initial_state_id: string;
  readonly terminal_state_id: string;
  readonly expected_terminal_states: readonly string[];
  readonly terminal_matched: boolean;
  readonly steps: readonly UiNormalizedInteractionStep[];
  readonly focus_sequence: readonly string[];
  readonly event_ids: readonly string[];
  readonly action_invocation_ids: readonly string[];
  readonly recovery_ids: readonly string[];
  readonly unresolved_observation_ids: readonly string[];
  readonly confirmation_id: string;
  readonly path_kind: string;
  readonly undefined_transition_step_ids: readonly string[];
  readonly focus_loss_step_ids: readonly string[];
  readonly bypass_attempt_ids: readonly string[];
  readonly privileged_host_invocation: false;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
  readonly runner_version: typeof UI_INTERACTION_RUNNER_VERSION;
}

/** Browser-visible control declared for the fixture surface. */
export interface UiVisibleControl {
  readonly control_id: string;
  readonly role: string;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly focusable: boolean;
  readonly action_id: string;
  readonly modal_id: string;
}

/** Run request for UiInteractionRunner@1. */
export interface UiInteractionRunRequest {
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly steps: readonly UiInteractionStepInput[];
  readonly state_machine: UiStateMachine;
  readonly action_bindings?: readonly UiActionBinding[];
  readonly visible_controls?: readonly UiVisibleControl[];
  readonly expected_terminal_states?: readonly string[];
  readonly initial_focus_id?: string;
  readonly initial_state_id?: string;
  readonly evidence_level?: EvidenceLevel;
  /**
   * When true, the caller claims success by bypassing confirmation/policy.
   * Always rejected and recorded; never manufactures success.
   */
  readonly attempt_boundary_bypass?: boolean;
}

/** Complete run result: receipt, focus trace, normalized trace, digests. */
export interface UiInteractionRunResult {
  readonly runner_interface: typeof UI_INTERACTION_RUNNER_INTERFACE;
  readonly runner_schema_version: typeof UI_INTERACTION_RUNNER_SCHEMA;
  readonly runner_version: typeof UI_INTERACTION_RUNNER_VERSION;
  readonly receipt: InteractionReceipt;
  readonly focus_trace: UiFocusTrace;
  readonly trace: UiInteractionTrace;
  readonly action_invocations: readonly UiActionInvocationObservation[];
  readonly normalized_trace_identity: string;
  readonly receipt_identity: string;
  readonly focus_trace_identity: string;
}

export interface UiInteractionRunner {
  readonly interface: typeof UI_INTERACTION_RUNNER_INTERFACE;
  readonly schema_version: typeof UI_INTERACTION_RUNNER_SCHEMA;
  readonly runnerVersion: typeof UI_INTERACTION_RUNNER_VERSION;
  run(request: UiInteractionRunRequest): UiInteractionRunResult;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiInteractionRunnerError extends Error {
  readonly name = 'UiInteractionRunnerError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiInteractionRunnerDecodeError extends UiInteractionRunnerError {
  readonly name = 'UiInteractionRunnerDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const EVIDENCE_SET = new Set<string>(EVIDENCE_LEVELS);
const STEP_KIND_SET = new Set<string>(UI_INTERACTION_STEP_KINDS);
const FOCUS_OBS_SET = new Set<string>(UI_FOCUS_OBSERVATION_KINDS);
const SERVICE_OUTCOME_SET = new Set<string>(UI_SERVICE_OUTCOMES);
const TRANSITION_STATUS_SET = new Set<string>(UI_TRANSITION_APPLICATION_STATUSES);
const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const VERIFICATION_SET = new Set<string>(GUI_VERIFICATION_STATUS);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

const RECEIPT_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'receipt_id',
  'application_id',
  'screen_id',
  'scenario_id',
  'repository_revision',
  'step_ids',
  'focus_sequence',
  'event_ids',
  'action_invocation_ids',
  'confirmation_id',
  'recovery_ids',
  'unresolved_observation_ids',
  'evidence_level',
  'analysis_classification',
  'verification_status',
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
    throw new UiInteractionRunnerDecodeError(
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
    throw new UiInteractionRunnerDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiInteractionRunnerDecodeError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new UiInteractionRunnerDecodeError(`${field} must be a string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new UiInteractionRunnerDecodeError(
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
    throw new UiInteractionRunnerDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireStringArray(
  value: unknown,
  field: string,
  identifier = true,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiInteractionRunnerDecodeError(`${field} must be an array`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = identifier
      ? requireIdentifier(value[i], `${field}[${i}]`)
      : requireString(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiInteractionRunnerDecodeError(
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

/**
 * Canonical JSON (gui-optimizer-canonical-json/v1): sorted object keys,
 * no whitespace, reject non-finite numbers, omit undefined.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new UiInteractionRunnerError(
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
  throw new UiInteractionRunnerError(
    `canonical JSON cannot encode ${typeof value}`,
  );
}

export function digestOf(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

export function serializeInteractionReceipt(
  receipt: InteractionReceipt,
): string {
  return canonicalJson(receipt);
}

export function interactionReceiptDigest(receipt: InteractionReceipt): string {
  return digestOf(receipt);
}

export function serializeUiFocusTrace(trace: UiFocusTrace): string {
  return canonicalJson(trace);
}

export function focusTraceDigest(trace: UiFocusTrace): string {
  return digestOf(trace);
}

export function serializeUiInteractionTrace(trace: UiInteractionTrace): string {
  return canonicalJson(trace);
}

export function interactionTraceDigest(trace: UiInteractionTrace): string {
  return digestOf(trace);
}

// ---------------------------------------------------------------------------
// Builders / decoders
// ---------------------------------------------------------------------------

export function decodeInteractionReceipt(raw: unknown): InteractionReceipt {
  if (!isPlainObject(raw)) {
    throw new UiInteractionRunnerDecodeError(
      'InteractionReceipt must be an object',
    );
  }
  rejectUnknownKeys(raw, RECEIPT_FIELDS, 'InteractionReceipt');
  requireKeys(raw, RECEIPT_FIELDS, 'InteractionReceipt');
  if (raw.interface !== INTERACTION_RECEIPT_INTERFACE) {
    throw new UiInteractionRunnerDecodeError(
      `unsupported InteractionReceipt interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== INTERACTION_RECEIPT_SCHEMA) {
    throw new UiInteractionRunnerDecodeError(
      `unsupported InteractionReceipt schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: INTERACTION_RECEIPT_INTERFACE,
    schema_version: INTERACTION_RECEIPT_SCHEMA,
    receipt_id: requireIdentifier(raw.receipt_id, 'receipt_id'),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    scenario_id: requireIdentifier(raw.scenario_id, 'scenario_id'),
    repository_revision: requireString(
      raw.repository_revision,
      'repository_revision',
    ),
    step_ids: requireStringArray(raw.step_ids, 'step_ids'),
    focus_sequence: requireStringArray(
      raw.focus_sequence,
      'focus_sequence',
      false,
    ),
    event_ids: requireStringArray(raw.event_ids, 'event_ids'),
    action_invocation_ids: requireStringArray(
      raw.action_invocation_ids,
      'action_invocation_ids',
    ),
    confirmation_id: requireOptionalIdentifier(
      raw.confirmation_id,
      'confirmation_id',
    ),
    recovery_ids: requireStringArray(raw.recovery_ids, 'recovery_ids'),
    unresolved_observation_ids: requireStringArray(
      raw.unresolved_observation_ids,
      'unresolved_observation_ids',
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

export function makeInteractionReceipt(partial: {
  receipt_id: string;
  application_id: string;
  screen_id: string;
  scenario_id: string;
  repository_revision: string;
  step_ids?: readonly string[];
  focus_sequence?: readonly string[];
  event_ids?: readonly string[];
  action_invocation_ids?: readonly string[];
  confirmation_id?: string;
  recovery_ids?: readonly string[];
  unresolved_observation_ids?: readonly string[];
  evidence_level?: EvidenceLevel;
  analysis_classification?: GuiExtractionConfidence;
  verification_status?: GuiVerificationStatus;
}): InteractionReceipt {
  return decodeInteractionReceipt({
    interface: INTERACTION_RECEIPT_INTERFACE,
    schema_version: INTERACTION_RECEIPT_SCHEMA,
    receipt_id: partial.receipt_id,
    application_id: partial.application_id,
    screen_id: partial.screen_id,
    scenario_id: partial.scenario_id,
    repository_revision: partial.repository_revision,
    step_ids: partial.step_ids ?? [],
    focus_sequence: partial.focus_sequence ?? [],
    event_ids: partial.event_ids ?? [],
    action_invocation_ids: partial.action_invocation_ids ?? [],
    confirmation_id: partial.confirmation_id ?? '',
    recovery_ids: partial.recovery_ids ?? [],
    unresolved_observation_ids: partial.unresolved_observation_ids ?? [],
    evidence_level: partial.evidence_level ?? 'simulated',
    analysis_classification: partial.analysis_classification ?? 'exact',
    verification_status: partial.verification_status ?? 'simulated',
  });
}

export function makeUiVisibleControl(partial: {
  control_id: string;
  role?: string;
  visible?: boolean;
  enabled?: boolean;
  focusable?: boolean;
  action_id?: string;
  modal_id?: string;
}): UiVisibleControl {
  return Object.freeze({
    control_id: requireIdentifier(partial.control_id, 'control_id'),
    role: partial.role ?? 'button',
    visible: partial.visible ?? true,
    enabled: partial.enabled ?? true,
    focusable: partial.focusable ?? true,
    action_id: partial.action_id ?? '',
    modal_id: partial.modal_id ?? '',
  });
}

export function makeUiInteractionStepInput(
  partial: UiInteractionStepInput,
): UiInteractionStepInput {
  if (!STEP_KIND_SET.has(partial.kind)) {
    throw new UiInteractionRunnerError(
      `unsupported interaction step kind: ${partial.kind}`,
    );
  }
  return Object.freeze({
    step_id: requireIdentifier(partial.step_id, 'step_id'),
    kind: partial.kind,
    target_control_id: partial.target_control_id ?? '',
    event_id: partial.event_id ?? '',
    action_id: partial.action_id ?? '',
    confirmation_id: partial.confirmation_id ?? '',
    expected_focus_id: partial.expected_focus_id ?? '',
    keyboard: partial.keyboard ?? isKeyboardKind(partial.kind),
    service_outcome: partial.service_outcome,
    wall_timestamp_ms: partial.wall_timestamp_ms,
    modal_id: partial.modal_id ?? '',
    notes: partial.notes ?? '',
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function createUiInteractionRunner(): UiInteractionRunner {
  return Object.freeze({
    interface: UI_INTERACTION_RUNNER_INTERFACE,
    schema_version: UI_INTERACTION_RUNNER_SCHEMA,
    runnerVersion: UI_INTERACTION_RUNNER_VERSION,
    run(request: UiInteractionRunRequest): UiInteractionRunResult {
      return runInteractionScenario(request);
    },
  });
}

/**
 * Drive fixture steps through browser-visible interfaces, applying only
 * source-supported state-machine transitions and recording focus/action
 * evidence. Identical inputs always produce the same normalized identity.
 */
export function runInteractionScenario(
  request: UiInteractionRunRequest,
): UiInteractionRunResult {
  if (!request || typeof request !== 'object') {
    throw new UiInteractionRunnerError('request must be an object');
  }
  if (!request.state_machine) {
    throw new UiInteractionRunnerError('state_machine is required');
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
  const machine = request.state_machine;
  const expectedTerminals = Object.freeze([
    ...(request.expected_terminal_states ?? []),
  ]);
  const evidenceLevel = request.evidence_level
    ? requireEnum<EvidenceLevel>(
        request.evidence_level,
        'evidence_level',
        EVIDENCE_SET,
      )
    : ('simulated' as const);

  const bindingsById = new Map<string, UiActionBinding>();
  for (const binding of request.action_bindings ?? []) {
    bindingsById.set(binding.action_id, binding);
  }

  const controlsById = new Map<string, UiVisibleControl>();
  for (const control of request.visible_controls ?? []) {
    controlsById.set(control.control_id, control);
  }

  const steps = (request.steps ?? []).map(makeUiInteractionStepInput);
  const stepIdsSeen = new Set<string>();
  for (const step of steps) {
    if (stepIdsSeen.has(step.step_id)) {
      throw new UiInteractionRunnerError(
        `duplicate step_id: ${step.step_id}`,
      );
    }
    stepIdsSeen.add(step.step_id);
  }

  // Timestamp normalization: relative offsets from the first wall clock, else
  // ordinal * 1 (stable when clocks are absent).
  const firstWall = steps.find(
    s => typeof s.wall_timestamp_ms === 'number' && Number.isFinite(s.wall_timestamp_ms),
  )?.wall_timestamp_ms;

  let currentStateId =
    request.initial_state_id && request.initial_state_id.length > 0
      ? requireIdentifier(request.initial_state_id, 'initial_state_id')
      : machine.initial_state_id;
  if (!currentStateId) {
    throw new UiInteractionRunnerError('initial state is undefined');
  }

  let currentFocus =
    request.initial_focus_id && request.initial_focus_id.length > 0
      ? request.initial_focus_id
      : '';
  let activeModalId = '';
  let restoringFocusId = '';
  let confirmationId = '';
  let confirmationGranted: boolean | null = null;
  let serviceOutcome = '';
  let pathKind = 'neutral';

  const normalizedSteps: UiNormalizedInteractionStep[] = [];
  const focusSnapshots: UiFocusSnapshot[] = [];
  const focusSequence: string[] = [];
  const eventIds: string[] = [];
  const actionInvocationIds: string[] = [];
  const recoveryIds: string[] = [];
  const unresolved: string[] = [];
  const undefinedTransitionStepIds: string[] = [];
  const focusLossStepIds: string[] = [];
  const trapStepIds: string[] = [];
  const restorationStepIds: string[] = [];
  const bypassAttemptIds: string[] = [];
  const actionInvocations: UiActionInvocationObservation[] = [];

  if (request.attempt_boundary_bypass) {
    bypassAttemptIds.push('bypass:attempted');
    unresolved.push('obs:boundary-bypass-rejected');
  }

  if (currentFocus) {
    focusSequence.push(currentFocus);
  }

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const relative =
      typeof step.wall_timestamp_ms === 'number' &&
      Number.isFinite(step.wall_timestamp_ms) &&
      typeof firstWall === 'number'
        ? Math.max(0, Math.trunc(step.wall_timestamp_ms - firstWall))
        : i;

    const previousFocus = currentFocus;
    let focusObservation: UiFocusObservationKind = 'unchanged';
    let transitionStatus: UiTransitionApplicationStatus = 'noop';
    let transitionId = '';
    let toStateId = currentStateId;
    let notes = step.notes ?? '';
    let serviceLabel = '';

    // Browser-visible interface gate: non-wait steps targeting a declared
    // control must address a visible control. Hidden targets cannot be used
    // to manufacture success.
    const targetId = step.target_control_id ?? '';
    if (targetId && controlsById.size > 0) {
      const control = controlsById.get(targetId);
      if (!control) {
        transitionStatus = 'blocked_not_visible';
        unresolved.push(`obs:unknown-control:${step.step_id}`);
        notes = appendNote(notes, 'target control not on visible surface');
      } else if (!control.visible) {
        transitionStatus = 'blocked_not_visible';
        unresolved.push(`obs:hidden-control:${step.step_id}`);
        notes = appendNote(notes, 'target control is not visible');
      }
    }

    // Focus updates for focus/tab/keyboard steps.
    if (
      transitionStatus !== 'blocked_not_visible' &&
      (step.kind === 'focus' ||
        step.kind === 'tab' ||
        step.kind === 'shift_tab' ||
        step.kind === 'keyboard_activation' ||
        step.kind === 'click')
    ) {
      const nextFocus =
        step.expected_focus_id ||
        step.target_control_id ||
        previousFocus;
      if (!nextFocus) {
        focusObservation = 'loss';
        currentFocus = '';
        focusLossStepIds.push(step.step_id);
        unresolved.push(`obs:focus-loss:${step.step_id}`);
      } else if (activeModalId && !isInsideModal(nextFocus, activeModalId, controlsById)) {
        // Tab contained inside modal: trap attempt stays on previous focus.
        focusObservation = 'trap';
        trapStepIds.push(step.step_id);
        // Keep current focus inside the modal; do not escape.
      } else {
        if (previousFocus && nextFocus !== previousFocus) {
          focusObservation = 'move';
        } else if (!previousFocus && nextFocus) {
          focusObservation = 'move';
        }
        currentFocus = nextFocus;
        if (step.kind === 'focus' && step.modal_id) {
          activeModalId = step.modal_id;
          restoringFocusId = previousFocus;
          focusObservation = 'enter_modal';
        }
      }
    }

    if (step.kind === 'blur') {
      if (step.expected_focus_id === '' || step.notes === 'focus_loss') {
        focusObservation = 'loss';
        currentFocus = '';
        focusLossStepIds.push(step.step_id);
        unresolved.push(`obs:focus-loss:${step.step_id}`);
      } else if (step.expected_focus_id) {
        currentFocus = step.expected_focus_id;
        focusObservation = 'move';
      }
    }

    if (step.kind === 'escape' || step.kind === 'cancel') {
      if (activeModalId) {
        focusObservation = 'leave_modal';
        if (restoringFocusId) {
          currentFocus = restoringFocusId;
          focusObservation = 'restore';
          restorationStepIds.push(step.step_id);
        }
        activeModalId = '';
        restoringFocusId = '';
      }
    }

    // Confirmation grant/deny stay distinct path kinds.
    if (step.kind === 'confirmation_grant') {
      confirmationId = step.confirmation_id || confirmationId || 'confirm:unspecified';
      confirmationGranted = true;
      pathKind = 'confirmation_grant';
    } else if (step.kind === 'confirmation_denial') {
      confirmationId = step.confirmation_id || confirmationId || 'confirm:unspecified';
      confirmationGranted = false;
      pathKind = 'confirmation_deny';
    }

    // Service outcomes: unavailable and recovery remain distinct.
    if (step.kind === 'service_outcome') {
      const outcome = step.service_outcome
        ? requireEnum<UiServiceOutcome>(
            step.service_outcome,
            'service_outcome',
            SERVICE_OUTCOME_SET,
          )
        : 'success';
      serviceOutcome = outcome;
      serviceLabel = outcome;
      if (outcome === 'service_unavailable') {
        pathKind = 'unavailable';
      } else if (outcome === 'recoverable_error') {
        pathKind = 'recovery';
        recoveryIds.push(`recovery:${step.step_id}`);
      } else if (outcome === 'unrecoverable_error') {
        pathKind = 'failure';
      } else if (pathKind === 'neutral') {
        pathKind = outcome;
      }
    }

    // Action dispatch observations: never bypass confirmation or policy
    // boundaries to manufacture a successful privileged invocation. UI state
    // transitions (for example ready -> confirmation) still apply when
    // source-supported; only the action invocation is blocked until grant.
    let actionDispatchBlocked = false;
    if (
      transitionStatus !== 'blocked_not_visible' &&
      (step.kind === 'click' ||
        step.kind === 'submit' ||
        step.kind === 'keyboard_activation' ||
        step.kind === 'confirmation_grant') &&
      step.action_id
    ) {
      const binding = bindingsById.get(step.action_id);
      const invocationId = `invoke:${step.step_id}:${step.action_id}`;
      let allowed = true;
      let blockedReason = '';

      if (!binding) {
        allowed = false;
        blockedReason = 'missing_action_binding';
        actionDispatchBlocked = true;
        unresolved.push(`obs:missing-binding:${step.step_id}`);
      } else if (binding.requires_confirmation) {
        confirmationId = confirmationId || binding.confirmation_id;
        if (confirmationGranted !== true) {
          allowed = false;
          blockedReason =
            confirmationGranted === false
              ? 'confirmation_denied'
              : 'confirmation_required';
          actionDispatchBlocked = true;
          unresolved.push(`obs:confirmation-blocked:${step.step_id}`);
          // Do not manufacture success by skipping confirmation.
        }
      }

      if (request.attempt_boundary_bypass && !allowed) {
        // Explicitly refuse manufacture of success.
        bypassAttemptIds.push(`bypass:${step.step_id}`);
        unresolved.push(`obs:bypass-rejected:${step.step_id}`);
        notes = appendNote(notes, 'boundary bypass rejected');
      }

      actionInvocationIds.push(invocationId);
      actionInvocations.push(
        Object.freeze({
          invocation_id: invocationId,
          step_id: step.step_id,
          action_id: step.action_id,
          method: binding?.method ?? '',
          schema_id: binding?.schema_id ?? '',
          confirmation_id: confirmationId || binding?.confirmation_id || '',
          allowed,
          blocked_reason: blockedReason,
        }),
      );
    }

    // State-machine transition application (source-supported only).
    // Hidden controls block transitions. Confirmation-required actions block
    // only the privileged invocation above; opening a confirmation dialog
    // remains a visible UI transition.
    if (transitionStatus !== 'blocked_not_visible' && step.event_id) {
      if (actionDispatchBlocked && step.kind === 'confirmation_grant') {
        // Grant step without a valid granted confirmation cannot advance.
        transitionStatus = 'blocked_confirmation';
        notes = appendNote(notes, 'confirmation grant blocked');
      } else {
        const outcomes = lookupTransitionOutcomes(
          machine,
          currentStateId,
          step.event_id,
        );
        if (outcomes.status === 'absent') {
          transitionStatus = 'undefined';
          undefinedTransitionStepIds.push(step.step_id);
          unresolved.push(
            `obs:undefined-transition:${currentStateId}:${step.event_id}`,
          );
          notes = appendNote(
            notes,
            `undefined transition from ${currentStateId} on ${step.event_id}`,
          );
          toStateId = currentStateId;
        } else if (outcomes.status === 'noop') {
          transitionStatus = 'noop';
          transitionId = outcomes.transitions[0]?.transition_id ?? '';
          toStateId = currentStateId;
        } else {
          // Prefer the first non-noop transition in stable transition order.
          const chosen =
            outcomes.transitions.find(t => !t.is_noop) ??
            outcomes.transitions[0];
          transitionStatus = 'applied';
          transitionId = chosen.transition_id;
          toStateId = chosen.to_state_id;
          currentStateId = toStateId;
        }
      }
      if (!eventIds.includes(step.event_id)) {
        eventIds.push(step.event_id);
      }
    }

    // Recovery path via recovery-kind states.
    const toState = machine.states.find(s => s.state_id === toStateId);
    if (toState?.kind === 'recovery' && !recoveryIds.includes(`recovery:${toStateId}`)) {
      recoveryIds.push(`recovery:${toStateId}`);
      if (pathKind === 'neutral' || pathKind === 'recoverable_error') {
        pathKind = 'recovery';
      }
    }
    if (toState?.kind === 'unavailable') {
      pathKind = 'unavailable';
    }
    if (toState?.kind === 'failure' && pathKind !== 'unavailable') {
      pathKind = 'failure';
    }
    if (toState?.kind === 'success' && pathKind === 'confirmation_grant') {
      pathKind = 'confirmation_grant';
    }

    // Receipt focus_sequence is unique ordered first-seen targets (wire rule).
    if (currentFocus && !focusSequence.includes(currentFocus)) {
      focusSequence.push(currentFocus);
    }

    focusSnapshots.push(
      Object.freeze({
        ordinal: i,
        step_id: step.step_id,
        focused_control_id: currentFocus,
        previous_control_id: previousFocus,
        observation: focusObservation,
        trapped: focusObservation === 'trap',
        modal_id: activeModalId,
        visible:
          !currentFocus ||
          controlsById.size === 0 ||
          (controlsById.get(currentFocus)?.visible ?? true),
      }),
    );

    normalizedSteps.push(
      Object.freeze({
        step_id: step.step_id,
        ordinal: i,
        relative_timestamp_ms: relative,
        kind: step.kind,
        target_control_id: targetId,
        event_id: step.event_id ?? '',
        action_id: step.action_id ?? '',
        confirmation_id: step.confirmation_id || confirmationId || '',
        keyboard: Boolean(step.keyboard),
        from_state_id:
          transitionStatus === 'applied'
            ? machine.transitions.find(t => t.transition_id === transitionId)
                ?.from_state_id ?? currentStateId
            : currentStateId === toStateId
              ? currentStateId
              : // after apply current already advanced; recover from transition
                machine.transitions.find(t => t.transition_id === transitionId)
                  ?.from_state_id ?? currentStateId,
        to_state_id: toStateId,
        transition_status: transitionStatus,
        transition_id: transitionId,
        service_outcome: serviceLabel,
        focus_observation: focusObservation,
        focused_control_id: currentFocus,
        notes,
      }),
    );
  }

  // Fix from_state_id for applied steps: recompute sequentially for accuracy.
  let replayState =
    request.initial_state_id && request.initial_state_id.length > 0
      ? request.initial_state_id
      : machine.initial_state_id;
  const correctedSteps = normalizedSteps.map(step => {
    const fromStateId = replayState;
    let toStateId = fromStateId;
    if (step.transition_status === 'applied' && step.transition_id) {
      const transition = machine.transitions.find(
        t => t.transition_id === step.transition_id,
      );
      if (transition) {
        toStateId = transition.to_state_id;
        replayState = toStateId;
      }
    }
    return Object.freeze({
      ...step,
      from_state_id: fromStateId,
      to_state_id: toStateId,
    });
  });

  const terminalStateId = replayState;
  const terminalMatched =
    expectedTerminals.length === 0 ||
    expectedTerminals.includes(terminalStateId);

  if (!terminalMatched) {
    // Observation IDs must remain closed identifiers (no '=' or '|').
    const expectedToken =
      expectedTerminals.length > 0
        ? expectedTerminals.join('/')
        : 'none';
    unresolved.push(
      `obs:terminal-mismatch:expected:${expectedToken}:actual:${terminalStateId}`,
    );
  }

  // Finalize path kind with explicit precedence so grant/deny remain distinct
  // from each other and from unavailable/recovery, even when terminals overlap.
  // Precedence: service terminal labels > confirmation decision > prior path.
  if (serviceOutcome === 'service_unavailable') {
    pathKind = 'unavailable';
  } else if (serviceOutcome === 'recoverable_error') {
    pathKind = 'recovery';
  } else if (serviceOutcome === 'unrecoverable_error') {
    pathKind = 'failure';
  } else if (confirmationGranted === true) {
    pathKind = 'confirmation_grant';
  } else if (confirmationGranted === false) {
    pathKind = 'confirmation_deny';
  } else if (pathKind === 'neutral' && serviceOutcome) {
    pathKind = serviceOutcome;
  }

  const sortedUnresolved = uniqueSorted(unresolved.map(asObservationId));
  const sortedEvents = uniqueSorted(eventIds);
  const sortedInvocations = uniqueSorted(actionInvocationIds);
  const sortedRecoveries = uniqueSorted(recoveryIds);
  const stepIds = Object.freeze(correctedSteps.map(s => s.step_id));

  // Stable identities from canonical content (no wall clocks).
  const identityBody = {
    application_id: applicationId,
    screen_id: screenId,
    scenario_id: scenarioId,
    repository_revision: repositoryRevision,
    steps: correctedSteps.map(s => ({
      step_id: s.step_id,
      ordinal: s.ordinal,
      relative_timestamp_ms: s.relative_timestamp_ms,
      kind: s.kind,
      target_control_id: s.target_control_id,
      event_id: s.event_id,
      action_id: s.action_id,
      confirmation_id: s.confirmation_id,
      keyboard: s.keyboard,
      from_state_id: s.from_state_id,
      to_state_id: s.to_state_id,
      transition_status: s.transition_status,
      transition_id: s.transition_id,
      service_outcome: s.service_outcome,
      focus_observation: s.focus_observation,
      focused_control_id: s.focused_control_id,
      notes: s.notes,
    })),
    focus_sequence: focusSequence,
    path_kind: pathKind,
    terminal_state_id: terminalStateId,
    expected_terminal_states: expectedTerminals,
  };
  const normalizedIdentity = digestOf(identityBody);
  const receiptId = `receipt:interaction:${normalizedIdentity.slice(7, 23)}`;
  const traceId = `trace:interaction:${normalizedIdentity.slice(7, 23)}`;
  const focusTraceId = `trace:focus:${normalizedIdentity.slice(7, 23)}`;

  const analysisClassification: GuiExtractionConfidence =
    sortedUnresolved.length === 0 ? 'exact' : 'conservative';
  const verificationStatus: GuiVerificationStatus =
    undefinedTransitionStepIds.length > 0 || focusLossStepIds.length > 0
      ? 'unverified'
      : evidenceLevel === 'simulated'
        ? 'simulated'
        : terminalMatched
          ? 'structurally_valid'
          : 'invalid';

  const receipt = makeInteractionReceipt({
    receipt_id: receiptId,
    application_id: applicationId,
    screen_id: screenId,
    scenario_id: scenarioId,
    repository_revision: repositoryRevision,
    step_ids: stepIds,
    focus_sequence: focusSequence,
    event_ids: sortedEvents,
    action_invocation_ids: sortedInvocations,
    confirmation_id: confirmationId,
    recovery_ids: sortedRecoveries,
    unresolved_observation_ids: sortedUnresolved,
    evidence_level: evidenceLevel,
    analysis_classification: analysisClassification,
    verification_status: verificationStatus,
  });

  const focusTrace: UiFocusTrace = Object.freeze({
    interface: UI_FOCUS_TRACE_INTERFACE,
    schema_version: UI_FOCUS_TRACE_SCHEMA,
    trace_id: focusTraceId,
    application_id: applicationId,
    screen_id: screenId,
    scenario_id: scenarioId,
    initial_focus_id: request.initial_focus_id ?? '',
    final_focus_id: currentFocus,
    focus_sequence: Object.freeze([...focusSequence]),
    snapshots: Object.freeze(focusSnapshots),
    focus_loss_step_ids: Object.freeze([...focusLossStepIds]),
    trap_step_ids: Object.freeze([...trapStepIds]),
    restoration_step_ids: Object.freeze([...restorationStepIds]),
    has_focus_loss: focusLossStepIds.length > 0,
    has_focus_trap: trapStepIds.length > 0,
  });

  const trace: UiInteractionTrace = Object.freeze({
    interface: UI_INTERACTION_TRACE_INTERFACE,
    schema_version: UI_INTERACTION_TRACE_SCHEMA,
    trace_id: traceId,
    application_id: applicationId,
    screen_id: screenId,
    scenario_id: scenarioId,
    repository_revision: repositoryRevision,
    initial_state_id:
      request.initial_state_id && request.initial_state_id.length > 0
        ? request.initial_state_id
        : machine.initial_state_id,
    terminal_state_id: terminalStateId,
    expected_terminal_states: expectedTerminals,
    terminal_matched: terminalMatched,
    steps: Object.freeze(correctedSteps),
    focus_sequence: Object.freeze([...focusSequence]),
    event_ids: sortedEvents,
    action_invocation_ids: sortedInvocations,
    recovery_ids: sortedRecoveries,
    unresolved_observation_ids: sortedUnresolved,
    confirmation_id: confirmationId,
    path_kind: pathKind,
    undefined_transition_step_ids: Object.freeze([
      ...undefinedTransitionStepIds,
    ]),
    focus_loss_step_ids: Object.freeze([...focusLossStepIds]),
    bypass_attempt_ids: Object.freeze([...bypassAttemptIds]),
    privileged_host_invocation: false as const,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    runner_version: UI_INTERACTION_RUNNER_VERSION,
  });

  // Silence unused enum sets referenced only for closed-vocabulary exports.
  void TRANSITION_STATUS_SET;
  void FOCUS_OBS_SET;

  return Object.freeze({
    runner_interface: UI_INTERACTION_RUNNER_INTERFACE,
    runner_schema_version: UI_INTERACTION_RUNNER_SCHEMA,
    runner_version: UI_INTERACTION_RUNNER_VERSION,
    receipt,
    focus_trace: focusTrace,
    trace,
    action_invocations: Object.freeze(actionInvocations),
    normalized_trace_identity: normalizedIdentity,
    receipt_identity: interactionReceiptDigest(receipt),
    focus_trace_identity: focusTraceDigest(focusTrace),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isKeyboardKind(kind: UiInteractionStepKind): boolean {
  return (
    kind === 'keyboard_activation' ||
    kind === 'tab' ||
    kind === 'shift_tab' ||
    kind === 'escape'
  );
}

function appendNote(existing: string, extra: string): string {
  if (!existing) return extra;
  if (!extra) return existing;
  return `${existing}; ${extra}`;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

/**
 * Coerce free-form tokens into closed identifier form so receipt arrays that
 * require identifiers never admit '=', '|', spaces, or other open characters.
 */
function asObservationId(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._:/#@-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!cleaned || !IDENTIFIER_RE.test(cleaned)) {
    return `obs:unresolved:${sha256Hex(value).slice(0, 16)}`;
  }
  return cleaned.slice(0, 256);
}

function isInsideModal(
  controlId: string,
  modalId: string,
  controls: ReadonlyMap<string, UiVisibleControl>,
): boolean {
  if (!modalId) return true;
  if (controlId === modalId) return true;
  const control = controls.get(controlId);
  if (!control) return false;
  return control.modal_id === modalId;
}

/**
 * Compare two run results for path-kind distinctness (grant vs deny,
 * unavailable vs recovery).
 */
export function pathKindsDistinct(
  left: UiInteractionRunResult,
  right: UiInteractionRunResult,
): boolean {
  return left.trace.path_kind !== right.trace.path_kind;
}

/**
 * True when a run recorded an undefined transition observation.
 */
export function hasVisibleUndefinedTransition(
  result: UiInteractionRunResult,
): boolean {
  return result.trace.undefined_transition_step_ids.length > 0;
}

/**
 * True when a run recorded focus loss.
 */
export function hasVisibleFocusLoss(result: UiInteractionRunResult): boolean {
  return result.focus_trace.has_focus_loss;
}

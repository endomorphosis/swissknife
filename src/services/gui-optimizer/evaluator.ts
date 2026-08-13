/**
 * Bounded GUI objective evaluator (VGO-040).
 *
 * Wire models:
 *   - GuiObjectiveEvaluator@1 / gui-objective-evaluator/v1
 *   - UiMetricDelta@1 / ui-metric-delta/v1
 *   - UiAcceptanceDecision@1 / ui-acceptance-decision/v1
 *
 * Aggregates typed evaluator evidence, compares exactly one declared
 * objective, and returns accept / reject / human-review. Hard invariants,
 * accessibility, policy, security, confirmation, and functional gates
 * outrank heuristic and human aesthetic scores. Pixel change is a
 * neutral observation. Unknown critical evidence cannot auto-accept.
 *
 * Never executes repository source and never imports semantic-index,
 * proof-cache, or model-routing code.
 */

import {
  HARD_GATE_FAMILIES,
  OBJECTIVE_METRIC_IDS,
  UI_BASELINE_INTERFACE,
  UI_METRIC_SNAPSHOT_INTERFACE,
  compileUiBaseline,
  decodeUiBaseline,
  decodeUiMetricSnapshot,
  describeMetric,
  emptyMetricValues,
  isHeuristicScoreAxis,
  isObjectiveMetricId,
  makeUiMetricSnapshot,
  metricPolarity,
  uiBaselineIdentity,
  type HardGateFamily,
  type HeuristicScore,
  type MetricClassification,
  type MetricPolarity,
  type ObjectiveMetricId,
  type UiBaseline,
  type UiMetricSnapshot,
} from './baseline.js';
import {
  canonicalIdentity,
  type GuiCanonicalIdentity,
} from './identity.js';
import {
  GUI_EXTRACTION_CONFIDENCE,
  GUI_VERIFICATION_STATUS,
  type GuiExtractionConfidence,
  type GuiVerificationStatus,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const GUI_OBJECTIVE_EVALUATOR_INTERFACE =
  'GuiObjectiveEvaluator@1' as const;
export const GUI_OBJECTIVE_EVALUATOR_SCHEMA =
  'gui-objective-evaluator/v1' as const;
export const GUI_OBJECTIVE_EVALUATOR_VERSION =
  'gui-objective-evaluator@1.0.0' as const;

export const UI_METRIC_DELTA_INTERFACE = 'UiMetricDelta@1' as const;
export const UI_METRIC_DELTA_SCHEMA = 'ui-metric-delta/v1' as const;

export const UI_ACCEPTANCE_DECISION_INTERFACE =
  'UiAcceptanceDecision@1' as const;
export const UI_ACCEPTANCE_DECISION_SCHEMA = 'ui-acceptance-decision/v1' as const;

export const DOMAIN_UI_METRIC_DELTA = 'gui.ui-metric-delta' as const;
export const DOMAIN_UI_ACCEPTANCE_DECISION = 'gui.ui-acceptance-decision' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

export const ACCEPTANCE_DECISIONS = Object.freeze([
  'accept',
  'reject',
  'human-review',
] as const);
export type AcceptanceDecision = (typeof ACCEPTANCE_DECISIONS)[number];

export const METRIC_DIRECTIONS = Object.freeze([
  'improved',
  'regressed',
  'unchanged',
  'neutral',
] as const);
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

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

export const CRITICAL_EVIDENCE_CLASSES = Object.freeze([
  'accessibility',
  'interaction',
  'constraint',
  'policy',
] as const);
export type CriticalEvidenceClass = (typeof CRITICAL_EVIDENCE_CLASSES)[number];

export const ACCEPTANCE_REASON_CODES = Object.freeze([
  'accepted',
  'invariants_preserved',
  'measurable_improvement',
  'invariants_violated',
  'hard_gate_regression',
  'accessibility_regression',
  'policy_regression',
  'security_regression',
  'functional_regression',
  'confirmation_regression',
  'no_measurable_improvement',
  'pixel_change_only',
  'pixel_change_neutral',
  'unknown_critical_evidence',
  'missing_accessibility_receipt',
  'missing_interaction_receipt',
  'missing_constraint_receipt',
  'missing_policy_report',
  'simulated_critical_evidence',
  'unverified_critical_evidence',
  'stale_critical_evidence',
  'invalid_critical_evidence',
  'heuristic_cannot_override',
  'aesthetic_gain_ignored',
  'review_required',
  'unsupported_check_increased',
] as const);
export type AcceptanceReasonCode = (typeof ACCEPTANCE_REASON_CODES)[number];

const AUTO_ACCEPT_STATUSES = Object.freeze(
  new Set<GuiVerificationStatus>(['verified', 'integrity_valid']),
);
const UNKNOWN_STATUSES = Object.freeze(
  new Set<GuiVerificationStatus>(['unverified', 'stale', 'invalid', 'simulated']),
);

const EVIDENCE_SET = new Set<string>(EVIDENCE_LEVELS);
const VERIFICATION_SET = new Set<string>(GUI_VERIFICATION_STATUS);
const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const CONSTRAINT_SET = new Set<string>(CONSTRAINT_CHECK_STATUSES);
const DECISION_SET = new Set<string>(ACCEPTANCE_DECISIONS);
const DIRECTION_SET = new Set<string>(METRIC_DIRECTIONS);
const REASON_SET = new Set<string>(ACCEPTANCE_REASON_CODES);
const FAMILY_SET = new Set<string>(HARD_GATE_FAMILIES);

// ---------------------------------------------------------------------------
// Evidence / request types
// ---------------------------------------------------------------------------

export interface AccessibilityEvidence {
  readonly scenario_id?: string;
  readonly violation_count: number;
  readonly violation_ids?: readonly string[];
  readonly automated_pass_count: number;
  readonly keyboard_result: ConstraintCheckStatus;
  readonly evidence_level: EvidenceLevel;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

export interface VisualEvidence {
  readonly scenario_id?: string;
  readonly decision?: string;
  readonly pixel_diff_percent: number;
  readonly structural_diff_percent: number;
  readonly unexpected_layout_shift_count: number;
  readonly missing_control_count: number;
  readonly extra_control_count: number;
  readonly screenshot_width: number;
  readonly screenshot_height: number;
  readonly requires_human_review?: boolean;
  readonly evidence_level: EvidenceLevel;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

export interface InteractionEvidence {
  readonly scenario_id?: string;
  readonly step_ids: readonly string[];
  readonly unresolved_observation_ids: readonly string[];
  readonly confirmation_id?: string;
  readonly evidence_level: EvidenceLevel;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

export interface ConstraintEvidence {
  readonly check_ids: readonly string[];
  readonly statuses: readonly ConstraintCheckStatus[];
  readonly violated_check_ids: readonly string[];
  readonly unsupported_check_ids: readonly string[];
  readonly evidence_level: EvidenceLevel;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

export interface PolicyEvidence {
  readonly acceptance_outcome: 'allow_automatic' | 'block_automatic' | 'review_required';
  readonly automatic_acceptance_blocked: boolean;
  readonly reason_codes?: readonly string[];
  readonly violations?: readonly {
    readonly code: string;
    readonly blocks_automatic_acceptance?: boolean;
  }[];
}

export interface CollectMetricsRequest {
  readonly accessibility_receipts?: readonly unknown[];
  readonly visual_receipts?: readonly unknown[];
  readonly interaction_receipts?: readonly unknown[];
  readonly constraint_receipts?: readonly unknown[];
  readonly policy_reports?: readonly unknown[];
  readonly metric_overrides?: Partial<Record<ObjectiveMetricId, number>>;
}

export interface ObjectiveEvaluationRequest {
  readonly application_id: string;
  readonly screen_id: string;
  readonly repository_revision: string;
  readonly objective_id: ObjectiveMetricId;
  readonly scenario_ids: readonly string[];
  readonly baseline?: UiBaseline | unknown;
  readonly baseline_metrics: UiMetricSnapshot | unknown;
  readonly candidate_metrics?: UiMetricSnapshot | unknown;
  readonly artifact_digests?: readonly string[];
  readonly accessibility_receipts?: readonly unknown[];
  readonly visual_receipts?: readonly unknown[];
  readonly interaction_receipts?: readonly unknown[];
  readonly constraint_receipts?: readonly unknown[];
  readonly policy_reports?: readonly unknown[];
  readonly heuristic_scores?: readonly unknown[];
  readonly metric_overrides?: Partial<Record<ObjectiveMetricId, number>>;
}

/** UiMetricDelta@1 */
export interface UiMetricDelta {
  readonly interface: typeof UI_METRIC_DELTA_INTERFACE;
  readonly schema_version: typeof UI_METRIC_DELTA_SCHEMA;
  readonly metric_id: ObjectiveMetricId;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
  readonly polarity: MetricPolarity;
  readonly classification: MetricClassification;
  readonly hard_gate_family: HardGateFamily | null;
  readonly direction: MetricDirection;
}

/** UiAcceptanceDecision@1 */
export interface UiAcceptanceDecision {
  readonly interface: typeof UI_ACCEPTANCE_DECISION_INTERFACE;
  readonly schema_version: typeof UI_ACCEPTANCE_DECISION_SCHEMA;
  readonly decision: AcceptanceDecision;
  readonly objective_id: ObjectiveMetricId;
  readonly invariants_preserved: boolean;
  readonly measurable_improvement: boolean;
  readonly hard_gate_regression: boolean;
  readonly unknown_critical_evidence: boolean;
  readonly pixel_change_alone: boolean;
  readonly heuristic_override_attempted: boolean;
  readonly reasons: readonly string[];
  readonly blocking_reason_codes: readonly AcceptanceReasonCode[];
}

export interface GuiObjectiveEvaluationResult {
  readonly evaluator_interface: typeof GUI_OBJECTIVE_EVALUATOR_INTERFACE;
  readonly evaluator_schema_version: typeof GUI_OBJECTIVE_EVALUATOR_SCHEMA;
  readonly evaluator_version: typeof GUI_OBJECTIVE_EVALUATOR_VERSION;
  readonly baseline: UiBaseline;
  readonly baseline_identity: GuiCanonicalIdentity;
  readonly baseline_metrics: UiMetricSnapshot;
  readonly candidate_metrics: UiMetricSnapshot;
  readonly objective_delta: UiMetricDelta;
  readonly metric_deltas: readonly UiMetricDelta[];
  readonly decision: UiAcceptanceDecision;
  readonly decision_identity: GuiCanonicalIdentity;
  readonly heuristic_scores: readonly HeuristicScore[];
}

export interface GuiObjectiveEvaluator {
  readonly interface: typeof GUI_OBJECTIVE_EVALUATOR_INTERFACE;
  readonly schema_version: typeof GUI_OBJECTIVE_EVALUATOR_SCHEMA;
  readonly evaluatorVersion: typeof GUI_OBJECTIVE_EVALUATOR_VERSION;
  evaluate(request: ObjectiveEvaluationRequest): GuiObjectiveEvaluationResult;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GuiObjectiveEvaluatorError extends Error {
  readonly name = 'GuiObjectiveEvaluatorError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GuiObjectiveEvaluatorDecodeError extends GuiObjectiveEvaluatorError {
  readonly name = 'GuiObjectiveEvaluatorDecodeError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

const DELTA_FIELDS = Object.freeze([
  'after',
  'before',
  'classification',
  'delta',
  'direction',
  'hard_gate_family',
  'interface',
  'metric_id',
  'polarity',
  'schema_version',
] as const);

const DECISION_FIELDS = Object.freeze([
  'blocking_reason_codes',
  'decision',
  'hard_gate_regression',
  'heuristic_override_attempted',
  'interface',
  'invariants_preserved',
  'measurable_improvement',
  'objective_id',
  'pixel_change_alone',
  'reasons',
  'schema_version',
  'unknown_critical_evidence',
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
    throw new GuiObjectiveEvaluatorDecodeError(
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
    throw new GuiObjectiveEvaluatorDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `${field} is not a valid identifier`,
    );
  }
  return text;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GuiObjectiveEvaluatorDecodeError(`${field} must be a finite number`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  const number = requireFiniteNumber(value, field);
  if (number < 0) {
    throw new GuiObjectiveEvaluatorDecodeError(`${field} must be nonnegative`);
  }
  return number;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new GuiObjectiveEvaluatorDecodeError(`${field} must be a boolean`);
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
    throw new GuiObjectiveEvaluatorDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new GuiObjectiveEvaluatorDecodeError(`${field} must be an array`);
  }
  return Object.freeze(
    value.map((entry, index) => requireString(entry, `${field}[${index}]`)),
  );
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalArray(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new GuiObjectiveEvaluatorDecodeError('evidence list must be an array');
  }
  return value;
}

// ---------------------------------------------------------------------------
// Metric collection
// ---------------------------------------------------------------------------

function classifyReceiptAuthority(raw: Record<string, unknown>): {
  unknown: boolean;
  review: boolean;
  codes: AcceptanceReasonCode[];
} {
  const evidence = requireEnum<EvidenceLevel>(
    raw.evidence_level,
    'evidence_level',
    EVIDENCE_SET,
  );
  const status = requireEnum<GuiVerificationStatus>(
    raw.verification_status,
    'verification_status',
    VERIFICATION_SET,
  );
  requireEnum<GuiExtractionConfidence>(
    raw.analysis_classification,
    'analysis_classification',
    CONFIDENCE_SET,
  );
  const codes: AcceptanceReasonCode[] = [];
  if (evidence === 'simulated' || status === 'simulated') {
    codes.push('simulated_critical_evidence');
  }
  if (status === 'unverified') codes.push('unverified_critical_evidence');
  if (status === 'stale') codes.push('stale_critical_evidence');
  if (status === 'invalid') codes.push('invalid_critical_evidence');
  const unknown =
    evidence === 'simulated' || UNKNOWN_STATUSES.has(status);
  const review = !unknown && !AUTO_ACCEPT_STATUSES.has(status);
  return { unknown, review, codes };
}

function decodeAccessibilityEvidence(raw: unknown): AccessibilityEvidence {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'accessibility receipt must be an object',
    );
  }
  const keyboard = requireEnum<ConstraintCheckStatus>(
    raw.keyboard_result,
    'keyboard_result',
    CONSTRAINT_SET,
  );
  const violationCount = requireNonNegativeNumber(
    raw.violation_count,
    'violation_count',
  );
  const violationIds = Array.isArray(raw.violation_ids)
    ? requireStringArray(raw.violation_ids, 'violation_ids')
    : undefined;
  if (violationIds !== undefined && violationIds.length !== violationCount) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'violation_count must equal len(violation_ids)',
    );
  }
  return Object.freeze({
    scenario_id: optionalString(raw.scenario_id) || undefined,
    violation_count: violationCount,
    violation_ids: violationIds,
    automated_pass_count: requireNonNegativeNumber(
      raw.automated_pass_count,
      'automated_pass_count',
    ),
    keyboard_result: keyboard,
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

function decodeVisualEvidence(raw: unknown): VisualEvidence {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError('visual receipt must be an object');
  }
  return Object.freeze({
    scenario_id: optionalString(raw.scenario_id) || undefined,
    decision: optionalString(raw.decision) || undefined,
    pixel_diff_percent: requireNonNegativeNumber(
      raw.pixel_diff_percent,
      'pixel_diff_percent',
    ),
    structural_diff_percent: requireNonNegativeNumber(
      raw.structural_diff_percent,
      'structural_diff_percent',
    ),
    unexpected_layout_shift_count: requireNonNegativeNumber(
      raw.unexpected_layout_shift_count,
      'unexpected_layout_shift_count',
    ),
    missing_control_count: requireNonNegativeNumber(
      raw.missing_control_count,
      'missing_control_count',
    ),
    extra_control_count: requireNonNegativeNumber(
      raw.extra_control_count,
      'extra_control_count',
    ),
    screenshot_width: requireNonNegativeNumber(
      raw.screenshot_width,
      'screenshot_width',
    ),
    screenshot_height: requireNonNegativeNumber(
      raw.screenshot_height,
      'screenshot_height',
    ),
    requires_human_review:
      raw.requires_human_review === undefined
        ? undefined
        : requireBoolean(raw.requires_human_review, 'requires_human_review'),
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

function decodeInteractionEvidence(raw: unknown): InteractionEvidence {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'interaction receipt must be an object',
    );
  }
  return Object.freeze({
    scenario_id: optionalString(raw.scenario_id) || undefined,
    step_ids: requireStringArray(raw.step_ids, 'step_ids'),
    unresolved_observation_ids: requireStringArray(
      raw.unresolved_observation_ids,
      'unresolved_observation_ids',
    ),
    confirmation_id: optionalString(raw.confirmation_id),
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

function decodeConstraintEvidence(raw: unknown): ConstraintEvidence {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'constraint receipt must be an object',
    );
  }
  const checkIds = requireStringArray(raw.check_ids, 'check_ids');
  if (!Array.isArray(raw.statuses)) {
    throw new GuiObjectiveEvaluatorDecodeError('statuses must be an array');
  }
  const statuses = raw.statuses.map((entry, index) =>
    requireEnum<ConstraintCheckStatus>(
      entry,
      `statuses[${index}]`,
      CONSTRAINT_SET,
    ),
  );
  if (checkIds.length !== statuses.length) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'check_ids and statuses lengths must agree',
    );
  }
  const expectedViolated = checkIds.filter(
    (_, index) => statuses[index] === 'violated',
  );
  const expectedUnsupported = checkIds.filter(
    (_, index) => statuses[index] === 'unsupported',
  );
  const violated = requireStringArray(raw.violated_check_ids, 'violated_check_ids');
  const unsupported = requireStringArray(
    raw.unsupported_check_ids,
    'unsupported_check_ids',
  );
  if (violated.join('\0') !== expectedViolated.join('\0')) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'violated_check_ids must exactly match statuses',
    );
  }
  if (unsupported.join('\0') !== expectedUnsupported.join('\0')) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'unsupported_check_ids must exactly match statuses',
    );
  }
  return Object.freeze({
    check_ids: checkIds,
    statuses: Object.freeze(statuses),
    violated_check_ids: violated,
    unsupported_check_ids: unsupported,
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

function decodePolicyEvidence(raw: unknown): PolicyEvidence {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError('policy report must be an object');
  }
  const outcome = requireEnum<'allow_automatic' | 'block_automatic' | 'review_required'>(
    raw.acceptance_outcome,
    'acceptance_outcome',
    new Set(['allow_automatic', 'block_automatic', 'review_required']),
  );
  return Object.freeze({
    acceptance_outcome: outcome,
    automatic_acceptance_blocked: requireBoolean(
      raw.automatic_acceptance_blocked,
      'automatic_acceptance_blocked',
    ),
    reason_codes: Array.isArray(raw.reason_codes)
      ? requireStringArray(raw.reason_codes, 'reason_codes')
      : undefined,
    violations: Array.isArray(raw.violations)
      ? Object.freeze(
          raw.violations.map((item, index) => {
            if (!isPlainObject(item)) {
              throw new GuiObjectiveEvaluatorDecodeError(
                `violations[${index}] must be an object`,
              );
            }
            return Object.freeze({
              code: requireString(item.code, `violations[${index}].code`),
              blocks_automatic_acceptance:
                item.blocks_automatic_acceptance === undefined
                  ? undefined
                  : requireBoolean(
                      item.blocks_automatic_acceptance,
                      `violations[${index}].blocks_automatic_acceptance`,
                    ),
            });
          }),
        )
      : undefined,
  });
}

export function decodeHeuristicScore(raw: unknown): HeuristicScore {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError('heuristic score must be an object');
  }
  const axis = requireString(raw.axis, 'axis');
  if (!isHeuristicScoreAxis(axis)) {
    throw new GuiObjectiveEvaluatorDecodeError(`unknown heuristic axis: ${axis}`);
  }
  const value = requireFiniteNumber(raw.value, 'value');
  if (value < 0 || value > 1) {
    throw new GuiObjectiveEvaluatorDecodeError('heuristic score must be in 0..1');
  }
  return Object.freeze({
    axis,
    value,
    evidence_level: requireEnum<'heuristic' | 'human_reviewed'>(
      raw.evidence_level,
      'evidence_level',
      new Set(['heuristic', 'human_reviewed']),
    ),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  });
}

export function collectObjectiveMetrics(
  request: CollectMetricsRequest,
): UiMetricSnapshot {
  const values = emptyMetricValues();
  const accessibility = readOptionalArray(request.accessibility_receipts).map(
    decodeAccessibilityEvidence,
  );
  const visual = readOptionalArray(request.visual_receipts).map(decodeVisualEvidence);
  const interaction = readOptionalArray(request.interaction_receipts).map(
    decodeInteractionEvidence,
  );
  const constraints = readOptionalArray(request.constraint_receipts).map(
    decodeConstraintEvidence,
  );
  const policies = readOptionalArray(request.policy_reports).map(decodePolicyEvidence);

  for (const receipt of accessibility) {
    values.accessibility_violation_count += receipt.violation_count;
    values.automated_pass_count += receipt.automated_pass_count;
    if (receipt.keyboard_result === 'violated') {
      values.keyboard_unreachable_count += 1;
      values.focus_order_failure_count += 1;
    }
  }
  for (const receipt of visual) {
    values.pixel_diff_percent = Math.max(
      values.pixel_diff_percent,
      receipt.pixel_diff_percent,
    );
    values.structural_diff_percent = Math.max(
      values.structural_diff_percent,
      receipt.structural_diff_percent,
    );
    values.unexpected_layout_shift_count += receipt.unexpected_layout_shift_count;
    values.missing_control_count += receipt.missing_control_count;
    values.extra_control_count += receipt.extra_control_count;
    values.screenshot_width = Math.max(values.screenshot_width, receipt.screenshot_width);
    values.screenshot_height = Math.max(
      values.screenshot_height,
      receipt.screenshot_height,
    );
  }
  for (const receipt of interaction) {
    values.interaction_step_count += receipt.step_ids.length;
    values.unresolved_observation_count += receipt.unresolved_observation_ids.length;
    if (receipt.unresolved_observation_ids.length > 0) {
      values.required_action_unreachable_count += 1;
    }
  }
  for (const receipt of constraints) {
    values.invariant_violation_count += receipt.violated_check_ids.length;
    values.unsupported_check_count += receipt.unsupported_check_ids.length;
  }
  for (const report of policies) {
    const blocking = (report.violations ?? []).filter(
      item => item.blocks_automatic_acceptance !== false,
    );
    if (report.automatic_acceptance_blocked) {
      values.policy_violation_count += Math.max(1, blocking.length);
    }
    const codes = report.reason_codes ?? [];
    if (
      codes.includes('confirmation_required') ||
      codes.includes('confirmation_binding_mismatch') ||
      codes.includes('destructive_without_confirmation')
    ) {
      values.confirmation_failure_count += 1;
    }
    if (
      codes.includes('dispatchable_prohibited_action') ||
      codes.includes('hidden_dispatch_path')
    ) {
      values.security_violation_count += 1;
    }
    if (
      codes.includes('ambiguous_binding') ||
      codes.includes('missing_method_or_schema') ||
      codes.includes('method_schema_mismatch')
    ) {
      values.action_binding_invalid_count += 1;
    }
  }

  if (request.metric_overrides) {
    for (const [key, value] of Object.entries(request.metric_overrides)) {
      if (!isObjectiveMetricId(key)) {
        throw new GuiObjectiveEvaluatorDecodeError(
          `unknown objective metric override: ${key}`,
        );
      }
      values[key] = requireNonNegativeNumber(value, key);
    }
  }
  return makeUiMetricSnapshot(values);
}

// ---------------------------------------------------------------------------
// Deltas and decisions
// ---------------------------------------------------------------------------

export function metricDirection(
  metricId: ObjectiveMetricId,
  before: number,
  after: number,
): MetricDirection {
  const polarity = metricPolarity(metricId);
  if (polarity === 'neutral') return 'neutral';
  if (before === after) return 'unchanged';
  if (polarity === 'lower_is_better') {
    return after < before ? 'improved' : 'regressed';
  }
  return after > before ? 'improved' : 'regressed';
}

export function makeUiMetricDelta(
  metricId: ObjectiveMetricId,
  before: number,
  after: number,
): UiMetricDelta {
  const descriptor = describeMetric(metricId);
  return decodeUiMetricDelta({
    after,
    before,
    classification: descriptor.classification,
    delta: after - before,
    direction: metricDirection(metricId, before, after),
    hard_gate_family: descriptor.hard_gate_family,
    interface: UI_METRIC_DELTA_INTERFACE,
    metric_id: metricId,
    polarity: descriptor.polarity,
    schema_version: UI_METRIC_DELTA_SCHEMA,
  });
}

export function decodeUiMetricDelta(raw: unknown): UiMetricDelta {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError('UiMetricDelta must be an object');
  }
  rejectUnknownKeys(raw, DELTA_FIELDS, 'UiMetricDelta');
  requireKeys(raw, DELTA_FIELDS, 'UiMetricDelta');
  if (raw.interface !== UI_METRIC_DELTA_INTERFACE) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `unsupported UiMetricDelta interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_METRIC_DELTA_SCHEMA) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `unsupported UiMetricDelta schema_version: ${String(raw.schema_version)}`,
    );
  }
  const metricId = requireString(raw.metric_id, 'metric_id');
  if (!isObjectiveMetricId(metricId)) {
    throw new GuiObjectiveEvaluatorDecodeError(`unknown metric_id: ${metricId}`);
  }
  const hardFamily =
    raw.hard_gate_family === null
      ? null
      : requireEnum<HardGateFamily>(
          raw.hard_gate_family,
          'hard_gate_family',
          FAMILY_SET,
        );
  return Object.freeze({
    interface: UI_METRIC_DELTA_INTERFACE,
    schema_version: UI_METRIC_DELTA_SCHEMA,
    metric_id: metricId,
    before: requireFiniteNumber(raw.before, 'before'),
    after: requireFiniteNumber(raw.after, 'after'),
    delta: requireFiniteNumber(raw.delta, 'delta'),
    polarity: requireEnum<MetricPolarity>(
      raw.polarity,
      'polarity',
      new Set(['lower_is_better', 'higher_is_better', 'neutral']),
    ),
    classification: requireEnum<MetricClassification>(
      raw.classification,
      'classification',
      new Set(['hard', 'heuristic', 'neutral', 'review']),
    ),
    hard_gate_family: hardFamily,
    direction: requireEnum<MetricDirection>(raw.direction, 'direction', DIRECTION_SET),
  });
}

export function uiMetricDeltaToDict(delta: UiMetricDelta): Record<string, unknown> {
  return {
    after: delta.after,
    before: delta.before,
    classification: delta.classification,
    delta: delta.delta,
    direction: delta.direction,
    hard_gate_family: delta.hard_gate_family,
    interface: delta.interface,
    metric_id: delta.metric_id,
    polarity: delta.polarity,
    schema_version: delta.schema_version,
  };
}

export function decodeUiAcceptanceDecision(raw: unknown): UiAcceptanceDecision {
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      'UiAcceptanceDecision must be an object',
    );
  }
  rejectUnknownKeys(raw, DECISION_FIELDS, 'UiAcceptanceDecision');
  requireKeys(raw, DECISION_FIELDS, 'UiAcceptanceDecision');
  if (raw.interface !== UI_ACCEPTANCE_DECISION_INTERFACE) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `unsupported UiAcceptanceDecision interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_ACCEPTANCE_DECISION_SCHEMA) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `unsupported UiAcceptanceDecision schema_version: ${String(raw.schema_version)}`,
    );
  }
  const objectiveId = requireString(raw.objective_id, 'objective_id');
  if (!isObjectiveMetricId(objectiveId)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `unknown objective_id: ${objectiveId}`,
    );
  }
  const codes = requireStringArray(
    raw.blocking_reason_codes,
    'blocking_reason_codes',
  ).map((code, index) =>
    requireEnum<AcceptanceReasonCode>(
      code,
      `blocking_reason_codes[${index}]`,
      REASON_SET,
    ),
  );
  return Object.freeze({
    interface: UI_ACCEPTANCE_DECISION_INTERFACE,
    schema_version: UI_ACCEPTANCE_DECISION_SCHEMA,
    decision: requireEnum<AcceptanceDecision>(raw.decision, 'decision', DECISION_SET),
    objective_id: objectiveId,
    invariants_preserved: requireBoolean(
      raw.invariants_preserved,
      'invariants_preserved',
    ),
    measurable_improvement: requireBoolean(
      raw.measurable_improvement,
      'measurable_improvement',
    ),
    hard_gate_regression: requireBoolean(
      raw.hard_gate_regression,
      'hard_gate_regression',
    ),
    unknown_critical_evidence: requireBoolean(
      raw.unknown_critical_evidence,
      'unknown_critical_evidence',
    ),
    pixel_change_alone: requireBoolean(raw.pixel_change_alone, 'pixel_change_alone'),
    heuristic_override_attempted: requireBoolean(
      raw.heuristic_override_attempted,
      'heuristic_override_attempted',
    ),
    reasons: requireStringArray(raw.reasons, 'reasons'),
    blocking_reason_codes: Object.freeze(codes),
  });
}

export function uiAcceptanceDecisionToDict(
  decision: UiAcceptanceDecision,
): Record<string, unknown> {
  return {
    blocking_reason_codes: [...decision.blocking_reason_codes],
    decision: decision.decision,
    hard_gate_regression: decision.hard_gate_regression,
    heuristic_override_attempted: decision.heuristic_override_attempted,
    interface: decision.interface,
    invariants_preserved: decision.invariants_preserved,
    measurable_improvement: decision.measurable_improvement,
    objective_id: decision.objective_id,
    pixel_change_alone: decision.pixel_change_alone,
    reasons: [...decision.reasons],
    schema_version: decision.schema_version,
    unknown_critical_evidence: decision.unknown_critical_evidence,
  };
}

export function uiAcceptanceDecisionIdentity(
  decision: UiAcceptanceDecision,
): GuiCanonicalIdentity {
  const decoded = decodeUiAcceptanceDecision(uiAcceptanceDecisionToDict(decision));
  return canonicalIdentity(uiAcceptanceDecisionToDict(decoded), {
    domain: DOMAIN_UI_ACCEPTANCE_DECISION,
    schemaVersion: UI_ACCEPTANCE_DECISION_SCHEMA,
  });
}

function familyRegressionCode(family: HardGateFamily): AcceptanceReasonCode {
  switch (family) {
    case 'accessibility':
      return 'accessibility_regression';
    case 'policy':
      return 'policy_regression';
    case 'security':
      return 'security_regression';
    case 'functional':
      return 'functional_regression';
    case 'confirmation':
      return 'confirmation_regression';
    case 'invariant':
      return 'invariants_violated';
    default:
      return 'hard_gate_regression';
  }
}

function inspectCriticalEvidence(request: ObjectiveEvaluationRequest): {
  unknown: boolean;
  review: boolean;
  codes: AcceptanceReasonCode[];
} {
  const codes: AcceptanceReasonCode[] = [];
  let unknown = false;
  let review = false;

  const classes: Array<{
    name: CriticalEvidenceClass;
    items: readonly unknown[];
    missing: AcceptanceReasonCode;
  }> = [
    {
      name: 'accessibility',
      items: readOptionalArray(request.accessibility_receipts),
      missing: 'missing_accessibility_receipt',
    },
    {
      name: 'interaction',
      items: readOptionalArray(request.interaction_receipts),
      missing: 'missing_interaction_receipt',
    },
    {
      name: 'constraint',
      items: readOptionalArray(request.constraint_receipts),
      missing: 'missing_constraint_receipt',
    },
    {
      name: 'policy',
      items: readOptionalArray(request.policy_reports),
      missing: 'missing_policy_report',
    },
  ];

  for (const entry of classes) {
    if (entry.items.length === 0) {
      unknown = true;
      codes.push(entry.missing);
      continue;
    }
    for (const item of entry.items) {
      if (!isPlainObject(item)) {
        unknown = true;
        codes.push(entry.missing);
        continue;
      }
      if (entry.name === 'policy') {
        const policy = decodePolicyEvidence(item);
        if (policy.acceptance_outcome === 'review_required') {
          review = true;
          codes.push('review_required');
        }
        continue;
      }
      const authority = classifyReceiptAuthority(item);
      if (authority.unknown) {
        unknown = true;
        codes.push(...authority.codes);
      } else if (authority.review) {
        review = true;
        codes.push('review_required');
      }
    }
  }

  for (const item of readOptionalArray(request.visual_receipts)) {
    if (!isPlainObject(item)) continue;
    const visual = decodeVisualEvidence(item);
    if (visual.requires_human_review === true) {
      review = true;
      codes.push('review_required');
    }
    const authority = classifyReceiptAuthority(item);
    if (authority.unknown) {
      unknown = true;
      codes.push(...authority.codes);
    }
  }

  return {
    unknown,
    review,
    codes: Object.freeze([...new Set(codes)]),
  };
}

function compareSnapshots(
  before: UiMetricSnapshot,
  after: UiMetricSnapshot,
): readonly UiMetricDelta[] {
  return Object.freeze(
    OBJECTIVE_METRIC_IDS.map(metricId =>
      makeUiMetricDelta(metricId, before.metrics[metricId], after.metrics[metricId]),
    ),
  );
}

function decideAcceptance(input: {
  objectiveId: ObjectiveMetricId;
  deltas: readonly UiMetricDelta[];
  heuristicScores: readonly HeuristicScore[];
  evidence: ReturnType<typeof inspectCriticalEvidence>;
}): UiAcceptanceDecision {
  const objectiveDelta = input.deltas.find(
    item => item.metric_id === input.objectiveId,
  );
  if (objectiveDelta === undefined) {
    throw new GuiObjectiveEvaluatorError(
      `missing objective delta for ${input.objectiveId}`,
    );
  }

  const hardRegressions = input.deltas.filter(
    item => item.classification === 'hard' && item.direction === 'regressed',
  );
  const invariantRegression = hardRegressions.some(
    item => item.hard_gate_family === 'invariant',
  );
  const invariantsPreserved =
    !invariantRegression &&
    input.deltas.find(item => item.metric_id === 'invariant_violation_count')
      ?.after === 0;
  const measurableImprovement = objectiveDelta.direction === 'improved';
  const hardGateRegression = hardRegressions.length > 0;

  const changed = input.deltas.filter(item => item.direction !== 'unchanged');
  const onlyPixelChanged =
    changed.length > 0 &&
    changed.every(item => item.direction === 'neutral' && item.metric_id === 'pixel_diff_percent');
  const pixelChanged = objectiveDelta.metric_id === 'pixel_diff_percent'
    ? objectiveDelta.delta !== 0
    : input.deltas.some(
        item => item.metric_id === 'pixel_diff_percent' && item.delta !== 0,
      );
  const pixelChangeAlone =
    onlyPixelChanged ||
    (pixelChanged &&
      !measurableImprovement &&
      !hardGateRegression &&
      changed.every(
        item =>
          item.direction === 'neutral' ||
          item.metric_id === 'pixel_diff_percent' ||
          item.direction === 'unchanged',
      ));

  const heuristicImproved = input.heuristicScores.some(score => score.value > 0);
  const heuristicOverrideAttempted =
    heuristicImproved && (hardGateRegression || !measurableImprovement);

  const reviewMetricIncreased = input.deltas.some(
    item => item.classification === 'review' && item.direction === 'regressed',
  );

  const reasons: string[] = [];
  const codes: AcceptanceReasonCode[] = [];

  if (hardGateRegression) {
    codes.push('hard_gate_regression');
    for (const item of hardRegressions) {
      if (item.hard_gate_family) {
        codes.push(familyRegressionCode(item.hard_gate_family));
      }
      reasons.push(
        `hard gate ${item.metric_id} ${item.before} -> ${item.after}`,
      );
    }
  }
  if (!invariantsPreserved) {
    codes.push('invariants_violated');
    reasons.push('invariants were not preserved');
  } else {
    codes.push('invariants_preserved');
  }
  if (measurableImprovement) {
    codes.push('measurable_improvement');
    reasons.push(
      `declared objective ${input.objectiveId} improved ${objectiveDelta.before} -> ${objectiveDelta.after}`,
    );
  } else {
    codes.push('no_measurable_improvement');
    reasons.push(
      `declared objective ${input.objectiveId} did not improve (${objectiveDelta.direction})`,
    );
  }
  if (objectiveDelta.polarity === 'neutral' || pixelChangeAlone) {
    codes.push('pixel_change_neutral');
    if (pixelChangeAlone) {
      codes.push('pixel_change_only');
      reasons.push('pixel change alone is a neutral observation');
    }
  }
  if (input.evidence.unknown) {
    codes.push('unknown_critical_evidence');
    codes.push(...input.evidence.codes);
    reasons.push('unknown critical evidence prevents automatic acceptance');
  } else if (input.evidence.review) {
    codes.push('review_required');
    codes.push(...input.evidence.codes);
    reasons.push('critical evidence requires human review');
  }
  if (reviewMetricIncreased) {
    codes.push('unsupported_check_increased');
    codes.push('review_required');
    reasons.push('unsupported invariant checks increased');
  }
  if (heuristicOverrideAttempted) {
    codes.push('heuristic_cannot_override');
    codes.push('aesthetic_gain_ignored');
    reasons.push(
      'heuristic or human aesthetic scores cannot offset hard gates or missing improvement',
    );
  }

  let decision: AcceptanceDecision = 'reject';
  if (hardGateRegression || !invariantsPreserved) {
    decision = 'reject';
  } else if (input.evidence.unknown || input.evidence.review || reviewMetricIncreased) {
    decision = 'human-review';
  } else if (!measurableImprovement) {
    decision = 'reject';
  } else {
    decision = 'accept';
    codes.push('accepted');
    reasons.push('invariants preserved and declared objective improved');
  }

  const uniqueCodes = [...new Set(codes)];
  return decodeUiAcceptanceDecision({
    blocking_reason_codes: uniqueCodes,
    decision,
    hard_gate_regression: hardGateRegression,
    heuristic_override_attempted: heuristicOverrideAttempted,
    interface: UI_ACCEPTANCE_DECISION_INTERFACE,
    invariants_preserved: invariantsPreserved,
    measurable_improvement: measurableImprovement,
    objective_id: input.objectiveId,
    pixel_change_alone: pixelChangeAlone,
    reasons,
    schema_version: UI_ACCEPTANCE_DECISION_SCHEMA,
    unknown_critical_evidence: input.evidence.unknown,
  });
}

function decodeMetricsInput(raw: unknown, label: string): UiMetricSnapshot {
  if (
    isPlainObject(raw) &&
    raw.interface === UI_METRIC_SNAPSHOT_INTERFACE
  ) {
    return decodeUiMetricSnapshot(raw);
  }
  if (!isPlainObject(raw)) {
    throw new GuiObjectiveEvaluatorDecodeError(`${label} must be an object`);
  }
  return makeUiMetricSnapshot(raw as Partial<Record<ObjectiveMetricId, number>>);
}

export function evaluateObjective(
  request: ObjectiveEvaluationRequest,
): GuiObjectiveEvaluationResult {
  const objectiveId = request.objective_id;
  if (!isObjectiveMetricId(objectiveId)) {
    throw new GuiObjectiveEvaluatorDecodeError(
      `objective_id must be a declared objective metric`,
    );
  }
  const baselineMetrics = decodeMetricsInput(
    request.baseline_metrics,
    'baseline_metrics',
  );
  const candidateMetrics = request.candidate_metrics
    ? decodeMetricsInput(request.candidate_metrics, 'candidate_metrics')
    : collectObjectiveMetrics({
        accessibility_receipts: request.accessibility_receipts,
        visual_receipts: request.visual_receipts,
        interaction_receipts: request.interaction_receipts,
        constraint_receipts: request.constraint_receipts,
        policy_reports: request.policy_reports,
        metric_overrides: request.metric_overrides,
      });

  const compiled = compileUiBaseline({
    application_id: request.application_id,
    screen_id: request.screen_id,
    repository_revision: request.repository_revision,
    scenario_ids: request.scenario_ids,
    metrics: baselineMetrics,
    artifact_digests: request.artifact_digests,
    baseline_id:
      isPlainObject(request.baseline) &&
      typeof request.baseline.baseline_id === 'string'
        ? request.baseline.baseline_id
        : undefined,
  });
  const suppliedBaseline =
    isPlainObject(request.baseline) &&
    request.baseline.interface === UI_BASELINE_INTERFACE
      ? decodeUiBaseline(request.baseline)
      : undefined;
  if (
    suppliedBaseline !== undefined &&
    suppliedBaseline.metric_digest !== compiled.baseline.metric_digest
  ) {
    throw new GuiObjectiveEvaluatorError(
      'baseline.metric_digest does not match baseline_metrics',
    );
  }
  const baseline = suppliedBaseline ?? compiled.baseline;

  const heuristicScores = readOptionalArray(request.heuristic_scores).map(
    decodeHeuristicScore,
  );
  const deltas = compareSnapshots(baselineMetrics, candidateMetrics);
  const objectiveDelta = deltas.find(item => item.metric_id === objectiveId);
  if (objectiveDelta === undefined) {
    throw new GuiObjectiveEvaluatorError(
      `missing objective delta for ${objectiveId}`,
    );
  }
  const decision = decideAcceptance({
    objectiveId,
    deltas,
    heuristicScores,
    evidence: inspectCriticalEvidence(request),
  });

  return Object.freeze({
    evaluator_interface: GUI_OBJECTIVE_EVALUATOR_INTERFACE,
    evaluator_schema_version: GUI_OBJECTIVE_EVALUATOR_SCHEMA,
    evaluator_version: GUI_OBJECTIVE_EVALUATOR_VERSION,
    baseline,
    baseline_identity: uiBaselineIdentity(baseline),
    baseline_metrics: baselineMetrics,
    candidate_metrics: candidateMetrics,
    objective_delta: objectiveDelta,
    metric_deltas: deltas,
    decision,
    decision_identity: uiAcceptanceDecisionIdentity(decision),
    heuristic_scores: Object.freeze(heuristicScores),
  });
}

export function createGuiObjectiveEvaluator(): GuiObjectiveEvaluator {
  return Object.freeze({
    interface: GUI_OBJECTIVE_EVALUATOR_INTERFACE,
    schema_version: GUI_OBJECTIVE_EVALUATOR_SCHEMA,
    evaluatorVersion: GUI_OBJECTIVE_EVALUATOR_VERSION,
    evaluate(request: ObjectiveEvaluationRequest) {
      return evaluateObjective(request);
    },
  });
}

export {
  HARD_GATE_FAMILIES,
  HEURISTIC_SCORE_AXES,
  OBJECTIVE_METRIC_IDS,
  compileUiBaseline,
  createUiBaselineCompiler,
  decodeUiBaseline,
  makeUiMetricSnapshot,
  uiBaselineIdentity,
  uiBaselineToDict,
  type HeuristicScore,
  type ObjectiveMetricId,
  type UiBaseline,
  type UiMetricSnapshot,
} from './baseline.js';

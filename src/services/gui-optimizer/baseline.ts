/**
 * Deterministic GUI baseline compiler (VGO-040).
 *
 * Wire models:
 *   - UiBaseline@1 / ui-baseline/v1
 *   - UiMetricSnapshot@1 / ui-metric-snapshot/v1
 *
 * A baseline binds application, screen, repository revision, scenario set,
 * objective-metric digest, and artifact digests. Identical inputs produce
 * the same baseline identity. Metric polarity and hard/heuristic/neutral
 * classification live with the snapshot so the evaluator can compare one
 * bounded objective without treating pixel change as a regression.
 *
 * Never executes repository source and never imports semantic-index,
 * proof-cache, or model-routing code.
 */

import {
  canonicalIdentity,
  rehashIdentity,
  type GuiCanonicalIdentity,
} from './identity.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_BASELINE_INTERFACE = 'UiBaseline@1' as const;
export const UI_BASELINE_SCHEMA = 'ui-baseline/v1' as const;

export const UI_BASELINE_COMPILER_INTERFACE = 'UiBaselineCompiler@1' as const;
export const UI_BASELINE_COMPILER_SCHEMA = 'ui-baseline-compiler/v1' as const;
export const UI_BASELINE_COMPILER_VERSION = 'gui-baseline-compiler@1.0.0' as const;

export const UI_METRIC_SNAPSHOT_INTERFACE = 'UiMetricSnapshot@1' as const;
export const UI_METRIC_SNAPSHOT_SCHEMA = 'ui-metric-snapshot/v1' as const;

export const DOMAIN_UI_BASELINE = 'gui.ui-baseline' as const;
export const DOMAIN_UI_METRIC_SNAPSHOT = 'gui.ui-metric-snapshot' as const;

/** Wire extractor_version token. Must match the Python compact-token regex. */
export const UI_BASELINE_EXTRACTOR_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/**
 * Objective metrics declared by the plan. Pixel and screenshot dimensions
 * are observations. Aesthetic axes are not in this catalog.
 */
export const OBJECTIVE_METRIC_IDS = Object.freeze([
  'accessibility_violation_count',
  'accessibility_critical_count',
  'accessibility_serious_count',
  'unlabeled_control_count',
  'keyboard_unreachable_count',
  'focus_order_failure_count',
  'focus_trap_failure_count',
  'duplicate_id_count',
  'contrast_failure_count',
  'horizontal_overflow_count',
  'clipping_count',
  'viewport_overflow_count',
  'missing_loading_error_behavior_count',
  'interaction_step_count',
  'keyboard_step_count',
  'required_action_unreachable_count',
  'confirmation_failure_count',
  'action_binding_invalid_count',
  'policy_violation_count',
  'security_violation_count',
  'invariant_violation_count',
  'unsupported_check_count',
  'test_failure_count',
  'pixel_diff_percent',
  'structural_diff_percent',
  'unexpected_layout_shift_count',
  'screenshot_width',
  'screenshot_height',
  'missing_control_count',
  'extra_control_count',
  'unresolved_observation_count',
  'automated_pass_count',
] as const);
export type ObjectiveMetricId = (typeof OBJECTIVE_METRIC_IDS)[number];

export const METRIC_POLARITIES = Object.freeze([
  'lower_is_better',
  'higher_is_better',
  'neutral',
] as const);
export type MetricPolarity = (typeof METRIC_POLARITIES)[number];

export const METRIC_CLASSIFICATIONS = Object.freeze([
  'hard',
  'heuristic',
  'neutral',
  'review',
] as const);
export type MetricClassification = (typeof METRIC_CLASSIFICATIONS)[number];

export const HARD_GATE_FAMILIES = Object.freeze([
  'accessibility',
  'policy',
  'security',
  'functional',
  'confirmation',
  'invariant',
] as const);
export type HardGateFamily = (typeof HARD_GATE_FAMILIES)[number];

export const HEURISTIC_SCORE_AXES = Object.freeze([
  'hierarchy',
  'density',
  'consistency',
  'clarity',
  'whitespace',
  'polish',
  'primary_action_prominence',
] as const);
export type HeuristicScoreAxis = (typeof HEURISTIC_SCORE_AXES)[number];

const LOWER_IS_BETTER = Object.freeze(
  new Set<ObjectiveMetricId>([
    'accessibility_violation_count',
    'accessibility_critical_count',
    'accessibility_serious_count',
    'unlabeled_control_count',
    'keyboard_unreachable_count',
    'focus_order_failure_count',
    'focus_trap_failure_count',
    'duplicate_id_count',
    'contrast_failure_count',
    'horizontal_overflow_count',
    'clipping_count',
    'viewport_overflow_count',
    'missing_loading_error_behavior_count',
    'required_action_unreachable_count',
    'confirmation_failure_count',
    'action_binding_invalid_count',
    'policy_violation_count',
    'security_violation_count',
    'invariant_violation_count',
    'unsupported_check_count',
    'test_failure_count',
    'structural_diff_percent',
    'unexpected_layout_shift_count',
    'missing_control_count',
    'extra_control_count',
    'unresolved_observation_count',
  ]),
);

const HIGHER_IS_BETTER = Object.freeze(
  new Set<ObjectiveMetricId>([
    'automated_pass_count',
    'interaction_step_count',
    'keyboard_step_count',
  ]),
);

const NEUTRAL_METRICS = Object.freeze(
  new Set<ObjectiveMetricId>([
    'pixel_diff_percent',
    'screenshot_width',
    'screenshot_height',
  ]),
);

const HARD_FAMILY_BY_METRIC: Readonly<Record<ObjectiveMetricId, HardGateFamily | null>> =
  Object.freeze({
    accessibility_violation_count: 'accessibility',
    accessibility_critical_count: 'accessibility',
    accessibility_serious_count: 'accessibility',
    unlabeled_control_count: 'accessibility',
    keyboard_unreachable_count: 'accessibility',
    focus_order_failure_count: 'accessibility',
    focus_trap_failure_count: 'accessibility',
    duplicate_id_count: 'accessibility',
    contrast_failure_count: 'accessibility',
    horizontal_overflow_count: 'functional',
    clipping_count: 'functional',
    viewport_overflow_count: 'functional',
    missing_loading_error_behavior_count: 'functional',
    interaction_step_count: 'functional',
    keyboard_step_count: 'functional',
    required_action_unreachable_count: 'functional',
    confirmation_failure_count: 'confirmation',
    action_binding_invalid_count: 'policy',
    policy_violation_count: 'policy',
    security_violation_count: 'security',
    invariant_violation_count: 'invariant',
    unsupported_check_count: 'invariant',
    test_failure_count: 'functional',
    pixel_diff_percent: null,
    structural_diff_percent: 'functional',
    unexpected_layout_shift_count: 'functional',
    screenshot_width: null,
    screenshot_height: null,
    missing_control_count: 'functional',
    extra_control_count: 'functional',
    unresolved_observation_count: 'functional',
    automated_pass_count: 'accessibility',
  });

const REVIEW_METRICS = Object.freeze(
  new Set<ObjectiveMetricId>(['unsupported_check_count']),
);

const PERCENT_METRICS = Object.freeze(
  new Set<ObjectiveMetricId>(['pixel_diff_percent', 'structural_diff_percent']),
);

const METRIC_ID_SET = new Set<string>(OBJECTIVE_METRIC_IDS);
const HEURISTIC_AXIS_SET = new Set<string>(HEURISTIC_SCORE_AXES);

// ---------------------------------------------------------------------------
// Wire / runtime record types
// ---------------------------------------------------------------------------

/** UiBaseline@1 — mirrors the Python closed wire record. */
export interface UiBaseline {
  readonly interface: typeof UI_BASELINE_INTERFACE;
  readonly schema_version: typeof UI_BASELINE_SCHEMA;
  readonly baseline_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly repository_revision: string;
  readonly scenario_ids: readonly string[];
  readonly metric_digest: string;
  readonly artifact_digests: readonly string[];
  readonly extractor_version: string;
}

/** Closed objective-metric snapshot hashed into UiBaseline.metric_digest. */
export interface UiMetricSnapshot {
  readonly interface: typeof UI_METRIC_SNAPSHOT_INTERFACE;
  readonly schema_version: typeof UI_METRIC_SNAPSHOT_SCHEMA;
  readonly metrics: Readonly<Record<ObjectiveMetricId, number>>;
}

export interface UiMetricDescriptor {
  readonly metric_id: ObjectiveMetricId;
  readonly polarity: MetricPolarity;
  readonly classification: MetricClassification;
  readonly hard_gate_family: HardGateFamily | null;
}

export interface HeuristicScore {
  readonly axis: HeuristicScoreAxis;
  readonly value: number;
  readonly evidence_level: 'heuristic' | 'human_reviewed';
  readonly notes: string;
}

export interface CompileUiBaselineRequest {
  readonly application_id: string;
  readonly screen_id: string;
  readonly repository_revision: string;
  readonly scenario_ids: readonly string[];
  readonly metrics: UiMetricSnapshot | unknown;
  readonly artifact_digests?: readonly string[];
  readonly baseline_id?: string;
  readonly extractor_version?: string;
}

export interface UiBaselineCompileResult {
  readonly compiler_interface: typeof UI_BASELINE_COMPILER_INTERFACE;
  readonly compiler_schema_version: typeof UI_BASELINE_COMPILER_SCHEMA;
  readonly compiler_version: typeof UI_BASELINE_COMPILER_VERSION;
  readonly baseline: UiBaseline;
  readonly metrics: UiMetricSnapshot;
  readonly baseline_identity: GuiCanonicalIdentity;
  readonly metric_identity: GuiCanonicalIdentity;
}

export interface UiBaselineCompiler {
  readonly interface: typeof UI_BASELINE_COMPILER_INTERFACE;
  readonly schema_version: typeof UI_BASELINE_COMPILER_SCHEMA;
  readonly compilerVersion: typeof UI_BASELINE_COMPILER_VERSION;
  compile(request: CompileUiBaselineRequest): UiBaselineCompileResult;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiBaselineError extends Error {
  readonly name = 'UiBaselineError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiBaselineDecodeError extends UiBaselineError {
  readonly name = 'UiBaselineDecodeError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const EXTRACTOR_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

const BASELINE_FIELDS = Object.freeze([
  'application_id',
  'artifact_digests',
  'baseline_id',
  'extractor_version',
  'interface',
  'metric_digest',
  'repository_revision',
  'scenario_ids',
  'schema_version',
  'screen_id',
] as const);

const SNAPSHOT_FIELDS = Object.freeze([
  'interface',
  'metrics',
  'schema_version',
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
    throw new UiBaselineDecodeError(
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
    throw new UiBaselineDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiBaselineDecodeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new UiBaselineDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requireDigest(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!DIGEST_RE.test(text)) {
    throw new UiBaselineDecodeError(`${field} must be a sha256: digest`);
  }
  return text;
}

function requireExtractorVersion(
  value: unknown,
  field = 'extractor_version',
): string {
  const text = requireString(value, field);
  if (!EXTRACTOR_VERSION_RE.test(text)) {
    throw new UiBaselineDecodeError(`${field} is not a valid extractor version`);
  }
  return text;
}

function requireUniqueIdentifiers(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiBaselineDecodeError(`${field} must be an array`);
  }
  const items = value.map((entry, index) =>
    requireIdentifier(entry, `${field}[${index}]`),
  );
  if (new Set(items).size !== items.length) {
    throw new UiBaselineDecodeError(`${field} must not contain duplicates`);
  }
  return Object.freeze(items);
}

function requireUniqueDigests(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiBaselineDecodeError(`${field} must be an array`);
  }
  const items = value.map((entry, index) =>
    requireDigest(entry, `${field}[${index}]`),
  );
  if (new Set(items).size !== items.length) {
    throw new UiBaselineDecodeError(`${field} must not contain duplicates`);
  }
  return Object.freeze(items);
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UiBaselineDecodeError(`${field} must be a finite number`);
  }
  return value;
}

function requireMetricValue(
  value: unknown,
  metricId: ObjectiveMetricId,
): number {
  const number = requireFiniteNumber(value, metricId);
  if (PERCENT_METRICS.has(metricId)) {
    if (number < 0 || number > 100) {
      throw new UiBaselineDecodeError(`${metricId} must be in the closed range 0..100`);
    }
    return number;
  }
  if (number < 0) {
    throw new UiBaselineDecodeError(`${metricId} must be nonnegative`);
  }
  return number;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function metricPolarity(metricId: ObjectiveMetricId): MetricPolarity {
  if (NEUTRAL_METRICS.has(metricId)) return 'neutral';
  if (HIGHER_IS_BETTER.has(metricId)) return 'higher_is_better';
  if (LOWER_IS_BETTER.has(metricId)) return 'lower_is_better';
  throw new UiBaselineError(`unknown metric polarity for ${metricId}`);
}

export function metricClassification(
  metricId: ObjectiveMetricId,
): MetricClassification {
  if (NEUTRAL_METRICS.has(metricId)) return 'neutral';
  if (REVIEW_METRICS.has(metricId)) return 'review';
  if (HARD_FAMILY_BY_METRIC[metricId] !== null) return 'hard';
  return 'neutral';
}

export function metricHardGateFamily(
  metricId: ObjectiveMetricId,
): HardGateFamily | null {
  return HARD_FAMILY_BY_METRIC[metricId];
}

export function describeMetric(metricId: ObjectiveMetricId): UiMetricDescriptor {
  if (!METRIC_ID_SET.has(metricId)) {
    throw new UiBaselineError(`unknown objective metric: ${metricId}`);
  }
  return Object.freeze({
    metric_id: metricId,
    polarity: metricPolarity(metricId),
    classification: metricClassification(metricId),
    hard_gate_family: metricHardGateFamily(metricId),
  });
}

export function isObjectiveMetricId(value: string): value is ObjectiveMetricId {
  return METRIC_ID_SET.has(value);
}

export function isHeuristicScoreAxis(value: string): value is HeuristicScoreAxis {
  return HEURISTIC_AXIS_SET.has(value);
}

export function emptyMetricValues(): Record<ObjectiveMetricId, number> {
  const metrics = {} as Record<ObjectiveMetricId, number>;
  for (const metricId of OBJECTIVE_METRIC_IDS) {
    metrics[metricId] = 0;
  }
  return metrics;
}

export function emptyMetricSnapshot(): UiMetricSnapshot {
  return Object.freeze({
    interface: UI_METRIC_SNAPSHOT_INTERFACE,
    schema_version: UI_METRIC_SNAPSHOT_SCHEMA,
    metrics: Object.freeze(emptyMetricValues()),
  });
}

// ---------------------------------------------------------------------------
// Decoders / serializers
// ---------------------------------------------------------------------------

export function decodeUiMetricSnapshot(raw: unknown): UiMetricSnapshot {
  if (!isPlainObject(raw)) {
    throw new UiBaselineDecodeError('UiMetricSnapshot must be an object');
  }
  rejectUnknownKeys(raw, SNAPSHOT_FIELDS, 'UiMetricSnapshot');
  requireKeys(raw, SNAPSHOT_FIELDS, 'UiMetricSnapshot');
  if (raw.interface !== UI_METRIC_SNAPSHOT_INTERFACE) {
    throw new UiBaselineDecodeError(
      `unsupported UiMetricSnapshot interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_METRIC_SNAPSHOT_SCHEMA) {
    throw new UiBaselineDecodeError(
      `unsupported UiMetricSnapshot schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (!isPlainObject(raw.metrics)) {
    throw new UiBaselineDecodeError('metrics must be an object');
  }
  rejectUnknownKeys(raw.metrics, OBJECTIVE_METRIC_IDS, 'UiMetricSnapshot.metrics');
  const metrics = emptyMetricValues();
  for (const metricId of OBJECTIVE_METRIC_IDS) {
    if (!(metricId in raw.metrics)) {
      throw new UiBaselineDecodeError(`metrics missing ${metricId}`);
    }
    metrics[metricId] = requireMetricValue(raw.metrics[metricId], metricId);
  }
  return Object.freeze({
    interface: UI_METRIC_SNAPSHOT_INTERFACE,
    schema_version: UI_METRIC_SNAPSHOT_SCHEMA,
    metrics: Object.freeze(metrics),
  });
}

export function makeUiMetricSnapshot(
  values: Partial<Record<ObjectiveMetricId, number>> = {},
): UiMetricSnapshot {
  const metrics = emptyMetricValues();
  for (const [key, value] of Object.entries(values)) {
    if (!isObjectiveMetricId(key)) {
      throw new UiBaselineDecodeError(`unknown objective metric: ${key}`);
    }
    metrics[key] = requireMetricValue(value, key);
  }
  return decodeUiMetricSnapshot({
    interface: UI_METRIC_SNAPSHOT_INTERFACE,
    schema_version: UI_METRIC_SNAPSHOT_SCHEMA,
    metrics,
  });
}

export function uiMetricSnapshotToDict(
  snapshot: UiMetricSnapshot,
): Record<string, unknown> {
  const metrics: Record<string, number> = {};
  for (const metricId of OBJECTIVE_METRIC_IDS) {
    metrics[metricId] = snapshot.metrics[metricId];
  }
  return {
    interface: snapshot.interface,
    metrics,
    schema_version: snapshot.schema_version,
  };
}

export function decodeUiBaseline(raw: unknown): UiBaseline {
  if (!isPlainObject(raw)) {
    throw new UiBaselineDecodeError('UiBaseline must be an object');
  }
  rejectUnknownKeys(raw, BASELINE_FIELDS, 'UiBaseline');
  requireKeys(raw, BASELINE_FIELDS, 'UiBaseline');
  if (raw.interface !== UI_BASELINE_INTERFACE) {
    throw new UiBaselineDecodeError(
      `unsupported UiBaseline interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_BASELINE_SCHEMA) {
    throw new UiBaselineDecodeError(
      `unsupported UiBaseline schema_version: ${String(raw.schema_version)}`,
    );
  }
  const scenarioIds = requireUniqueIdentifiers(raw.scenario_ids, 'scenario_ids');
  if (scenarioIds.length === 0) {
    throw new UiBaselineDecodeError('scenario_ids must not be empty');
  }
  return Object.freeze({
    interface: UI_BASELINE_INTERFACE,
    schema_version: UI_BASELINE_SCHEMA,
    baseline_id: requireIdentifier(raw.baseline_id, 'baseline_id'),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    repository_revision: requireString(
      raw.repository_revision,
      'repository_revision',
    ),
    scenario_ids: scenarioIds,
    metric_digest: requireDigest(raw.metric_digest, 'metric_digest'),
    artifact_digests: requireUniqueDigests(raw.artifact_digests, 'artifact_digests'),
    extractor_version: requireExtractorVersion(raw.extractor_version),
  });
}

export function uiBaselineToDict(baseline: UiBaseline): Record<string, unknown> {
  return {
    application_id: baseline.application_id,
    artifact_digests: [...baseline.artifact_digests],
    baseline_id: baseline.baseline_id,
    extractor_version: baseline.extractor_version,
    interface: baseline.interface,
    metric_digest: baseline.metric_digest,
    repository_revision: baseline.repository_revision,
    scenario_ids: [...baseline.scenario_ids],
    schema_version: baseline.schema_version,
    screen_id: baseline.screen_id,
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function uiMetricSnapshotIdentity(
  snapshot: UiMetricSnapshot,
): GuiCanonicalIdentity {
  const decoded = decodeUiMetricSnapshot(uiMetricSnapshotToDict(snapshot));
  return canonicalIdentity(uiMetricSnapshotToDict(decoded), {
    domain: DOMAIN_UI_METRIC_SNAPSHOT,
    schemaVersion: UI_METRIC_SNAPSHOT_SCHEMA,
  });
}

export function uiBaselineIdentity(baseline: UiBaseline): GuiCanonicalIdentity {
  const decoded = decodeUiBaseline(uiBaselineToDict(baseline));
  return canonicalIdentity(uiBaselineToDict(decoded), {
    domain: DOMAIN_UI_BASELINE,
    schemaVersion: UI_BASELINE_SCHEMA,
  });
}

export function rehashUiBaselineIdentity(
  identity: GuiCanonicalIdentity,
): GuiCanonicalIdentity {
  if (identity.domain !== DOMAIN_UI_BASELINE) {
    throw new UiBaselineError('baseline identity domain must be gui.ui-baseline');
  }
  return rehashIdentity(identity);
}

export function uiBaselineDigest(baseline: UiBaseline): string {
  return uiBaselineIdentity(baseline).digest;
}

export function uiMetricSnapshotDigest(snapshot: UiMetricSnapshot): string {
  return uiMetricSnapshotIdentity(snapshot).digest;
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export function compileUiBaseline(
  request: CompileUiBaselineRequest,
): UiBaselineCompileResult {
  const metrics = decodeUiMetricSnapshot(
    isPlainObject(request.metrics) &&
      request.metrics.interface === UI_METRIC_SNAPSHOT_INTERFACE
      ? request.metrics
      : makeUiMetricSnapshot(
          (request.metrics ?? {}) as Partial<Record<ObjectiveMetricId, number>>,
        ),
  );
  const metricIdentity = uiMetricSnapshotIdentity(metrics);
  const scenarioIds = requireUniqueIdentifiers(
    request.scenario_ids,
    'scenario_ids',
  );
  if (scenarioIds.length === 0) {
    throw new UiBaselineDecodeError('scenario_ids must not be empty');
  }
  const artifactDigests = requireUniqueDigests(
    request.artifact_digests ?? [],
    'artifact_digests',
  );
  const extractorVersion = requireExtractorVersion(
    request.extractor_version ?? UI_BASELINE_EXTRACTOR_VERSION,
  );
  const applicationId = requireIdentifier(request.application_id, 'application_id');
  const screenId = requireIdentifier(request.screen_id, 'screen_id');
  const repositoryRevision = requireString(
    request.repository_revision,
    'repository_revision',
  );

  const seed = {
    application_id: applicationId,
    artifact_digests: [...artifactDigests],
    extractor_version: extractorVersion,
    interface: UI_BASELINE_INTERFACE,
    metric_digest: metricIdentity.digest,
    repository_revision: repositoryRevision,
    scenario_ids: [...scenarioIds],
    schema_version: UI_BASELINE_SCHEMA,
    screen_id: screenId,
  };
  const seedIdentity = canonicalIdentity(seed, {
    domain: DOMAIN_UI_BASELINE,
    schemaVersion: UI_BASELINE_SCHEMA,
  });
  const baselineId =
    request.baseline_id === undefined
      ? `baseline:${seedIdentity.digest.slice(7, 23)}`
      : requireIdentifier(request.baseline_id, 'baseline_id');

  const baseline = decodeUiBaseline({
    ...seed,
    baseline_id: baselineId,
  });
  return Object.freeze({
    compiler_interface: UI_BASELINE_COMPILER_INTERFACE,
    compiler_schema_version: UI_BASELINE_COMPILER_SCHEMA,
    compiler_version: UI_BASELINE_COMPILER_VERSION,
    baseline,
    metrics,
    baseline_identity: uiBaselineIdentity(baseline),
    metric_identity: metricIdentity,
  });
}

export function createUiBaselineCompiler(): UiBaselineCompiler {
  return Object.freeze({
    interface: UI_BASELINE_COMPILER_INTERFACE,
    schema_version: UI_BASELINE_COMPILER_SCHEMA,
    compilerVersion: UI_BASELINE_COMPILER_VERSION,
    compile(request: CompileUiBaselineRequest) {
      return compileUiBaseline(request);
    },
  });
}

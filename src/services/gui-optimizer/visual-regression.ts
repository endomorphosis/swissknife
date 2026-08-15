/**
 * Deterministic visual-regression receipts (VGO-032).
 *
 * Wire models:
 *   - VisualRegressionEvaluator@1 / visual-regression-evaluator/v1
 *   - VisualRegressionReceipt@1 / visual-regression-receipt/v1
 *   - VisualDiffPolicy@1 / visual-diff-policy/v1
 *   - VisualChangeRegion@1 / visual-change-region/v1
 *
 * Compares ImageData-like RGBA buffers without a pixel library. Pixel
 * differences are observations: expected-region changes are not regressions,
 * forbidden-region and unexplained changes enforce configured gates, and
 * subjective appeal stays heuristic or human-reviewed. Screenshot identities
 * hash measured pixel bytes; synthetic placeholders are rejected. Browser
 * captures cannot be labeled as simulations.
 *
 * Never executes repository source and never imports semantic-index,
 * proof-cache, or model-routing code.
 */

import {
  artifactDigest,
  canonicalIdentity,
  rehashArtifactDigest,
  rehashIdentity,
  sha256Digest,
  type GuiArtifactDigest,
  type GuiCanonicalIdentity,
} from './identity.js';
import {
  GUI_EXTRACTION_CONFIDENCE,
  GUI_VERIFICATION_STATUS,
  type GuiExtractionConfidence,
  type GuiVerificationStatus,
} from './models.js';
import {
  VIEWPORT_DESKTOP,
  decodeViewportSpec,
  type ViewportSpec,
} from './scenario-catalog.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const VISUAL_REGRESSION_EVALUATOR_INTERFACE =
  'VisualRegressionEvaluator@1' as const;
export const VISUAL_REGRESSION_EVALUATOR_SCHEMA =
  'visual-regression-evaluator/v1' as const;

export const VISUAL_REGRESSION_RECEIPT_INTERFACE =
  'VisualRegressionReceipt@1' as const;
export const VISUAL_REGRESSION_RECEIPT_SCHEMA =
  'visual-regression-receipt/v1' as const;

export const VISUAL_DIFF_POLICY_INTERFACE = 'VisualDiffPolicy@1' as const;
export const VISUAL_DIFF_POLICY_SCHEMA = 'visual-diff-policy/v1' as const;

export const VISUAL_CHANGE_REGION_INTERFACE = 'VisualChangeRegion@1' as const;
export const VISUAL_CHANGE_REGION_SCHEMA = 'visual-change-region/v1' as const;

export const VISUAL_APPEAL_ASSESSMENT_INTERFACE =
  'VisualAppealAssessment@1' as const;
export const VISUAL_APPEAL_ASSESSMENT_SCHEMA =
  'visual-appeal-assessment/v1' as const;

export const VISUAL_DIFF_MEASUREMENT_INTERFACE =
  'VisualDiffMeasurement@1' as const;
export const VISUAL_DIFF_MEASUREMENT_SCHEMA =
  'visual-diff-measurement/v1' as const;

export const VISUAL_REGRESSION_EVALUATOR_VERSION =
  'gui-visual-regression-evaluator@1.0.0' as const;

export const DOMAIN_SCREENSHOT = 'gui.screenshot' as const;
export const DOMAIN_VISUAL_REGRESSION_RECEIPT =
  'gui.visual-regression-receipt' as const;

export const SCREENSHOT_ENCODING = 'rgba8' as const;
export const SCREENSHOT_CHANNELS = 4 as const;
export const STRUCTURAL_GRID_MAX = 16 as const;

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

export const VISUAL_DECISIONS = Object.freeze([
  'pass',
  'fail',
  'review',
  'skipped',
  'baseline_missing',
] as const);
export type VisualDecision = (typeof VISUAL_DECISIONS)[number];

export const VISUAL_CAPTURE_SOURCES = Object.freeze([
  'browser',
  'simulation',
] as const);
export type VisualCaptureSource = (typeof VISUAL_CAPTURE_SOURCES)[number];

export const VISUAL_GATE_REASONS = Object.freeze([
  'forbidden_region_change',
  'unexplained_diff_exceeds_max',
  'dimension_mismatch',
  'baseline_missing',
  'skipped',
  'manual_review_threshold',
] as const);
export type VisualGateReason = (typeof VISUAL_GATE_REASONS)[number];

export const SUBJECTIVE_APPEAL_AXES = Object.freeze([
  'hierarchy',
  'density',
  'consistency',
  'clarity',
  'whitespace',
  'polish',
  'primary_action_prominence',
] as const);
export type SubjectiveAppealAxis = (typeof SUBJECTIVE_APPEAL_AXES)[number];

// ---------------------------------------------------------------------------
// Wire / runtime record types
// ---------------------------------------------------------------------------

/** VisualChangeRegion@1 — normalized 0..1 rectangle. */
export interface VisualChangeRegion {
  readonly interface: typeof VISUAL_CHANGE_REGION_INTERFACE;
  readonly schema_version: typeof VISUAL_CHANGE_REGION_SCHEMA;
  readonly region_id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly evidence_reason: string;
}

/** VisualDiffPolicy@1 — configured comparison gates. */
export interface VisualDiffPolicy {
  readonly interface: typeof VISUAL_DIFF_POLICY_INTERFACE;
  readonly schema_version: typeof VISUAL_DIFF_POLICY_SCHEMA;
  readonly expected_change_regions: readonly VisualChangeRegion[];
  readonly forbidden_change_regions: readonly VisualChangeRegion[];
  readonly max_unexplained_diff_percent: number;
  readonly manual_review_threshold_percent: number;
}

/** VisualRegressionReceipt@1 — mirrors the Python closed wire record. */
export interface VisualRegressionReceipt {
  readonly interface: typeof VISUAL_REGRESSION_RECEIPT_INTERFACE;
  readonly schema_version: typeof VISUAL_REGRESSION_RECEIPT_SCHEMA;
  readonly receipt_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly component_version_ids: readonly string[];
  readonly viewport: ViewportSpec;
  readonly screenshot_digest: string;
  readonly baseline_digest: string;
  readonly decision: VisualDecision;
  readonly evidence_level: EvidenceLevel;
  readonly pixel_diff_percent: number;
  readonly structural_diff_percent: number;
  readonly unexpected_layout_shift_count: number;
  readonly missing_control_count: number;
  readonly extra_control_count: number;
  readonly screenshot_width: number;
  readonly screenshot_height: number;
  readonly expected_change_regions: readonly VisualChangeRegion[];
  readonly forbidden_change_regions: readonly VisualChangeRegion[];
  readonly max_unexplained_diff_percent: number;
  readonly manual_review_threshold_percent: number;
  readonly requires_human_review: boolean;
  readonly color_scheme: string;
  readonly locale: string;
  readonly text_scale_percent: number;
  readonly browser: string;
  readonly browser_version: string;
  readonly analysis_classification: GuiExtractionConfidence;
  readonly verification_status: GuiVerificationStatus;
}

/** ImageData-like RGBA capture. Pixels must be measured, never a digest stub. */
export interface VisualCapture {
  readonly source: VisualCaptureSource;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly browser?: string;
  readonly browser_version?: string;
}

export interface StructuralControlObservation {
  readonly control_id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VisualAppealScores {
  readonly hierarchy?: number;
  readonly density?: number;
  readonly consistency?: number;
  readonly clarity?: number;
  readonly whitespace?: number;
  readonly polish?: number;
  readonly primary_action_prominence?: number;
}

/** Subjective appeal never participates in pass/fail gates. */
export interface VisualAppealAssessment {
  readonly interface: typeof VISUAL_APPEAL_ASSESSMENT_INTERFACE;
  readonly schema_version: typeof VISUAL_APPEAL_ASSESSMENT_SCHEMA;
  readonly evidence_level: 'heuristic' | 'human_reviewed';
  readonly scores: VisualAppealScores;
  readonly notes: string;
  readonly overrides_objective_gates: false;
}

export interface VisualDiffMeasurement {
  readonly interface: typeof VISUAL_DIFF_MEASUREMENT_INTERFACE;
  readonly schema_version: typeof VISUAL_DIFF_MEASUREMENT_SCHEMA;
  readonly total_pixels: number;
  readonly changed_pixels: number;
  readonly expected_region_changed_pixels: number;
  readonly forbidden_region_changed_pixels: number;
  readonly unexplained_changed_pixels: number;
  readonly total_pixel_diff_percent: number;
  readonly expected_region_diff_percent: number;
  readonly forbidden_region_diff_percent: number;
  readonly unexplained_pixel_diff_percent: number;
  readonly structural_cell_count: number;
  readonly structural_changed_cells: number;
  readonly unexplained_structural_changed_cells: number;
  readonly structural_diff_percent: number;
  readonly unexpected_layout_shift_count: number;
  readonly missing_control_count: number;
  readonly extra_control_count: number;
  readonly dimension_mismatch: boolean;
}

export interface VisualRegressionEvaluateRequest {
  readonly application_id: string;
  readonly screen_id: string;
  readonly scenario_id: string;
  readonly repository_revision: string;
  readonly component_version_ids?: readonly string[];
  readonly viewport?: ViewportSpec;
  readonly color_scheme?: string;
  readonly locale?: string;
  readonly text_scale_percent?: number;
  readonly browser?: string;
  readonly browser_version?: string;
  readonly capture: VisualCapture;
  readonly baseline?: VisualCapture | null;
  readonly policy?: Partial<VisualDiffPolicy> | VisualDiffPolicy;
  readonly structural_baseline?: readonly StructuralControlObservation[];
  readonly structural_after?: readonly StructuralControlObservation[];
  readonly appeal?: {
    readonly evidence_level?: 'heuristic' | 'human_reviewed';
    readonly scores?: VisualAppealScores;
    readonly notes?: string;
  };
  readonly skip?: boolean;
}

export interface VisualRegressionEvaluationResult {
  readonly evaluator_interface: typeof VISUAL_REGRESSION_EVALUATOR_INTERFACE;
  readonly evaluator_schema_version: typeof VISUAL_REGRESSION_EVALUATOR_SCHEMA;
  readonly evaluator_version: typeof VISUAL_REGRESSION_EVALUATOR_VERSION;
  readonly receipt: VisualRegressionReceipt;
  readonly receipt_identity: GuiCanonicalIdentity;
  readonly screenshot_artifact: GuiArtifactDigest;
  readonly baseline_artifact: GuiArtifactDigest;
  readonly measurement: VisualDiffMeasurement;
  readonly appeal: VisualAppealAssessment;
  readonly capture_source: VisualCaptureSource;
  readonly baseline_capture_source: VisualCaptureSource | 'absent';
  readonly gate_reasons: readonly VisualGateReason[];
  readonly compared: boolean;
}

export interface VisualRegressionEvaluator {
  readonly interface: typeof VISUAL_REGRESSION_EVALUATOR_INTERFACE;
  readonly schema_version: typeof VISUAL_REGRESSION_EVALUATOR_SCHEMA;
  readonly evaluatorVersion: typeof VISUAL_REGRESSION_EVALUATOR_VERSION;
  evaluate(
    request: VisualRegressionEvaluateRequest,
  ): VisualRegressionEvaluationResult;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VisualRegressionError extends Error {
  readonly name = 'VisualRegressionError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VisualRegressionDecodeError extends VisualRegressionError {
  readonly name = 'VisualRegressionDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const EVIDENCE_SET = new Set<string>(EVIDENCE_LEVELS);
const DECISION_SET = new Set<string>(VISUAL_DECISIONS);
const CAPTURE_SOURCE_SET = new Set<string>(VISUAL_CAPTURE_SOURCES);
const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const VERIFICATION_SET = new Set<string>(GUI_VERIFICATION_STATUS);
const APPEAL_EVIDENCE_SET = new Set<string>(['heuristic', 'human_reviewed']);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

const REGION_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'region_id',
  'x',
  'y',
  'width',
  'height',
  'evidence_reason',
] as const);

const POLICY_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'expected_change_regions',
  'forbidden_change_regions',
  'max_unexplained_diff_percent',
  'manual_review_threshold_percent',
] as const);

const RECEIPT_FIELDS = Object.freeze([
  'analysis_classification',
  'application_id',
  'baseline_digest',
  'browser',
  'browser_version',
  'color_scheme',
  'component_version_ids',
  'decision',
  'evidence_level',
  'expected_change_regions',
  'extra_control_count',
  'forbidden_change_regions',
  'interface',
  'locale',
  'manual_review_threshold_percent',
  'max_unexplained_diff_percent',
  'missing_control_count',
  'pixel_diff_percent',
  'receipt_id',
  'repository_revision',
  'requires_human_review',
  'scenario_id',
  'schema_version',
  'screen_id',
  'screenshot_digest',
  'screenshot_height',
  'screenshot_width',
  'structural_diff_percent',
  'text_scale_percent',
  'unexpected_layout_shift_count',
  'verification_status',
  'viewport',
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
    throw new VisualRegressionDecodeError(
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
    throw new VisualRegressionDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new VisualRegressionDecodeError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new VisualRegressionDecodeError(
      `${field} is not a valid identifier`,
    );
  }
  return text;
}

function requireDigest(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!DIGEST_RE.test(text)) {
    throw new VisualRegressionDecodeError(
      `${field} must be a sha256: digest`,
    );
  }
  return text;
}

function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T {
  const text = requireString(value, field);
  if (!allowed.has(text)) {
    throw new VisualRegressionDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new VisualRegressionDecodeError(`${field} must be a boolean`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new VisualRegressionDecodeError(
      `${field} must be a finite number`,
    );
  }
  return value;
}

function requireIntInRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const number = requireFiniteNumber(value, field);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new VisualRegressionDecodeError(
      `${field} must be an integer in ${minimum}..${maximum}`,
    );
  }
  return number;
}

function requirePercent(value: unknown, field: string): number {
  const number = requireFiniteNumber(value, field);
  if (number < 0 || number > 100) {
    throw new VisualRegressionDecodeError(
      `${field} must be in the closed range 0..100`,
    );
  }
  return number;
}

function requireUniqueIdentifiers(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new VisualRegressionDecodeError(`${field} must be an array`);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = requireIdentifier(value[index], `${field}[${index}]`);
    if (seen.has(item)) {
      throw new VisualRegressionDecodeError(
        `${field} must not contain duplicates`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

function regionsOverlap(
  left: VisualChangeRegion,
  right: VisualChangeRegion,
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function assertDisjointRegions(
  expected: readonly VisualChangeRegion[],
  forbidden: readonly VisualChangeRegion[],
): void {
  const expectedIds = expected.map(region => region.region_id);
  const forbiddenIds = forbidden.map(region => region.region_id);
  if (expectedIds.length !== new Set(expectedIds).size) {
    throw new VisualRegressionDecodeError(
      'expected_change_regions region_ids must be unique',
    );
  }
  if (forbiddenIds.length !== new Set(forbiddenIds).size) {
    throw new VisualRegressionDecodeError(
      'forbidden_change_regions region_ids must be unique',
    );
  }
  const overlapIds = expectedIds.filter(id => forbiddenIds.includes(id));
  if (overlapIds.length > 0) {
    throw new VisualRegressionDecodeError(
      'expected and forbidden region IDs must be disjoint',
    );
  }
  for (const left of expected) {
    for (const right of forbidden) {
      if (regionsOverlap(left, right)) {
        throw new VisualRegressionDecodeError(
          'expected and forbidden regions geometrically overlap',
        );
      }
    }
  }
}

function assertReceiptDecisionInvariants(
  decision: VisualDecision,
  requiresReview: boolean,
  pixelDiff: number,
  maxUnexplained: number,
  manualThreshold: number,
): void {
  if (decision === 'pass' && requiresReview) {
    throw new VisualRegressionDecodeError(
      'PASS visual receipt cannot require human review',
    );
  }
  if (decision === 'review' && !requiresReview) {
    throw new VisualRegressionDecodeError(
      'REVIEW visual receipt requires human review',
    );
  }
  if (decision === 'pass' && pixelDiff > maxUnexplained) {
    throw new VisualRegressionDecodeError(
      'pixel_diff_percent exceeds max_unexplained_diff_percent but decision is pass',
    );
  }
  if (pixelDiff >= manualThreshold && !requiresReview) {
    throw new VisualRegressionDecodeError(
      'pixel_diff_percent at/above manual_review_threshold_percent requires human review',
    );
  }
}

// ---------------------------------------------------------------------------
// Region / policy / receipt codecs
// ---------------------------------------------------------------------------

export function decodeVisualChangeRegion(raw: unknown): VisualChangeRegion {
  if (!isPlainObject(raw)) {
    throw new VisualRegressionDecodeError('VisualChangeRegion must be an object');
  }
  rejectUnknownKeys(raw, REGION_FIELDS, 'VisualChangeRegion');
  requireKeys(raw, REGION_FIELDS, 'VisualChangeRegion');
  if (raw.interface !== VISUAL_CHANGE_REGION_INTERFACE) {
    throw new VisualRegressionDecodeError(
      `unsupported VisualChangeRegion interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== VISUAL_CHANGE_REGION_SCHEMA) {
    throw new VisualRegressionDecodeError(
      `unsupported VisualChangeRegion schema_version: ${String(raw.schema_version)}`,
    );
  }
  const x = requireFiniteNumber(raw.x, 'x');
  const y = requireFiniteNumber(raw.y, 'y');
  const width = requireFiniteNumber(raw.width, 'width');
  const height = requireFiniteNumber(raw.height, 'height');
  if (x < 0) throw new VisualRegressionDecodeError('x must be >= 0');
  if (y < 0) throw new VisualRegressionDecodeError('y must be >= 0');
  if (width <= 0) throw new VisualRegressionDecodeError('width must be > 0');
  if (height <= 0) throw new VisualRegressionDecodeError('height must be > 0');
  if (x + width > 1) {
    throw new VisualRegressionDecodeError('x + width must be <= 1');
  }
  if (y + height > 1) {
    throw new VisualRegressionDecodeError('y + height must be <= 1');
  }
  return Object.freeze({
    interface: VISUAL_CHANGE_REGION_INTERFACE,
    schema_version: VISUAL_CHANGE_REGION_SCHEMA,
    region_id: requireIdentifier(raw.region_id, 'region_id'),
    x,
    y,
    width,
    height,
    evidence_reason: requireString(raw.evidence_reason, 'evidence_reason'),
  });
}

export function makeVisualChangeRegion(partial: {
  region_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  evidence_reason?: string;
}): VisualChangeRegion {
  return decodeVisualChangeRegion({
    interface: VISUAL_CHANGE_REGION_INTERFACE,
    schema_version: VISUAL_CHANGE_REGION_SCHEMA,
    region_id: partial.region_id,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    evidence_reason: partial.evidence_reason ?? 'declared-region',
  });
}

function decodeRegionList(
  value: unknown,
  field: string,
): readonly VisualChangeRegion[] {
  if (!Array.isArray(value)) {
    throw new VisualRegressionDecodeError(`${field} must be an array`);
  }
  return Object.freeze(value.map(item => decodeVisualChangeRegion(item)));
}

export function decodeVisualDiffPolicy(raw: unknown): VisualDiffPolicy {
  if (!isPlainObject(raw)) {
    throw new VisualRegressionDecodeError('VisualDiffPolicy must be an object');
  }
  rejectUnknownKeys(raw, POLICY_FIELDS, 'VisualDiffPolicy');
  requireKeys(raw, POLICY_FIELDS, 'VisualDiffPolicy');
  if (raw.interface !== VISUAL_DIFF_POLICY_INTERFACE) {
    throw new VisualRegressionDecodeError(
      `unsupported VisualDiffPolicy interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== VISUAL_DIFF_POLICY_SCHEMA) {
    throw new VisualRegressionDecodeError(
      `unsupported VisualDiffPolicy schema_version: ${String(raw.schema_version)}`,
    );
  }
  const expected = decodeRegionList(
    raw.expected_change_regions,
    'expected_change_regions',
  );
  const forbidden = decodeRegionList(
    raw.forbidden_change_regions,
    'forbidden_change_regions',
  );
  assertDisjointRegions(expected, forbidden);
  return Object.freeze({
    interface: VISUAL_DIFF_POLICY_INTERFACE,
    schema_version: VISUAL_DIFF_POLICY_SCHEMA,
    expected_change_regions: expected,
    forbidden_change_regions: forbidden,
    max_unexplained_diff_percent: requirePercent(
      raw.max_unexplained_diff_percent,
      'max_unexplained_diff_percent',
    ),
    manual_review_threshold_percent: requirePercent(
      raw.manual_review_threshold_percent,
      'manual_review_threshold_percent',
    ),
  });
}

export const DEFAULT_VISUAL_DIFF_POLICY: VisualDiffPolicy = Object.freeze({
  interface: VISUAL_DIFF_POLICY_INTERFACE,
  schema_version: VISUAL_DIFF_POLICY_SCHEMA,
  expected_change_regions: Object.freeze([] as VisualChangeRegion[]),
  forbidden_change_regions: Object.freeze([] as VisualChangeRegion[]),
  max_unexplained_diff_percent: 1,
  manual_review_threshold_percent: 2,
});

export function makeVisualDiffPolicy(
  partial: Partial<VisualDiffPolicy> = {},
): VisualDiffPolicy {
  const expected = Array.isArray(partial.expected_change_regions)
    ? partial.expected_change_regions.map(region =>
        decodeVisualChangeRegion(region),
      )
    : [];
  const forbidden = Array.isArray(partial.forbidden_change_regions)
    ? partial.forbidden_change_regions.map(region =>
        decodeVisualChangeRegion(region),
      )
    : [];
  return decodeVisualDiffPolicy({
    interface: VISUAL_DIFF_POLICY_INTERFACE,
    schema_version: VISUAL_DIFF_POLICY_SCHEMA,
    expected_change_regions: expected,
    forbidden_change_regions: forbidden,
    max_unexplained_diff_percent:
      partial.max_unexplained_diff_percent ??
      DEFAULT_VISUAL_DIFF_POLICY.max_unexplained_diff_percent,
    manual_review_threshold_percent:
      partial.manual_review_threshold_percent ??
      DEFAULT_VISUAL_DIFF_POLICY.manual_review_threshold_percent,
  });
}

export function visualChangeRegionToDict(
  region: VisualChangeRegion,
): Record<string, unknown> {
  return {
    evidence_reason: region.evidence_reason,
    height: region.height,
    interface: region.interface,
    region_id: region.region_id,
    schema_version: region.schema_version,
    width: region.width,
    x: region.x,
    y: region.y,
  };
}

export function viewportToDict(viewport: ViewportSpec): Record<string, unknown> {
  return {
    device_scale_factor: viewport.device_scale_factor,
    height: viewport.height,
    interface: viewport.interface,
    schema_version: viewport.schema_version,
    width: viewport.width,
  };
}

export function visualRegressionReceiptToDict(
  receipt: VisualRegressionReceipt,
): Record<string, unknown> {
  return {
    analysis_classification: receipt.analysis_classification,
    application_id: receipt.application_id,
    baseline_digest: receipt.baseline_digest,
    browser: receipt.browser,
    browser_version: receipt.browser_version,
    color_scheme: receipt.color_scheme,
    component_version_ids: [...receipt.component_version_ids],
    decision: receipt.decision,
    evidence_level: receipt.evidence_level,
    expected_change_regions: receipt.expected_change_regions.map(
      visualChangeRegionToDict,
    ),
    extra_control_count: receipt.extra_control_count,
    forbidden_change_regions: receipt.forbidden_change_regions.map(
      visualChangeRegionToDict,
    ),
    interface: receipt.interface,
    locale: receipt.locale,
    manual_review_threshold_percent: receipt.manual_review_threshold_percent,
    max_unexplained_diff_percent: receipt.max_unexplained_diff_percent,
    missing_control_count: receipt.missing_control_count,
    pixel_diff_percent: receipt.pixel_diff_percent,
    receipt_id: receipt.receipt_id,
    repository_revision: receipt.repository_revision,
    requires_human_review: receipt.requires_human_review,
    scenario_id: receipt.scenario_id,
    schema_version: receipt.schema_version,
    screen_id: receipt.screen_id,
    screenshot_digest: receipt.screenshot_digest,
    screenshot_height: receipt.screenshot_height,
    screenshot_width: receipt.screenshot_width,
    structural_diff_percent: receipt.structural_diff_percent,
    text_scale_percent: receipt.text_scale_percent,
    unexpected_layout_shift_count: receipt.unexpected_layout_shift_count,
    verification_status: receipt.verification_status,
    viewport: viewportToDict(receipt.viewport),
  };
}

export function decodeVisualRegressionReceipt(
  raw: unknown,
): VisualRegressionReceipt {
  if (!isPlainObject(raw)) {
    throw new VisualRegressionDecodeError(
      'VisualRegressionReceipt must be an object',
    );
  }
  rejectUnknownKeys(raw, RECEIPT_FIELDS, 'VisualRegressionReceipt');
  requireKeys(raw, RECEIPT_FIELDS, 'VisualRegressionReceipt');
  if (raw.interface !== VISUAL_REGRESSION_RECEIPT_INTERFACE) {
    throw new VisualRegressionDecodeError(
      `unsupported VisualRegressionReceipt interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== VISUAL_REGRESSION_RECEIPT_SCHEMA) {
    throw new VisualRegressionDecodeError(
      `unsupported VisualRegressionReceipt schema_version: ${String(raw.schema_version)}`,
    );
  }
  const decision = requireEnum<VisualDecision>(
    raw.decision,
    'decision',
    DECISION_SET,
  );
  const requiresReview = requireBoolean(
    raw.requires_human_review,
    'requires_human_review',
  );
  const browser = requireString(raw.browser, 'browser');
  const browserVersion = requireString(raw.browser_version, 'browser_version');
  const pixel = requirePercent(raw.pixel_diff_percent, 'pixel_diff_percent');
  const structural = requirePercent(
    raw.structural_diff_percent,
    'structural_diff_percent',
  );
  const maxUnexplained = requirePercent(
    raw.max_unexplained_diff_percent,
    'max_unexplained_diff_percent',
  );
  const manualThreshold = requirePercent(
    raw.manual_review_threshold_percent,
    'manual_review_threshold_percent',
  );
  assertReceiptDecisionInvariants(
    decision,
    requiresReview,
    pixel,
    maxUnexplained,
    manualThreshold,
  );
  const expected = decodeRegionList(
    raw.expected_change_regions,
    'expected_change_regions',
  );
  const forbidden = decodeRegionList(
    raw.forbidden_change_regions,
    'forbidden_change_regions',
  );
  assertDisjointRegions(expected, forbidden);
  return Object.freeze({
    interface: VISUAL_REGRESSION_RECEIPT_INTERFACE,
    schema_version: VISUAL_REGRESSION_RECEIPT_SCHEMA,
    receipt_id: requireIdentifier(raw.receipt_id, 'receipt_id'),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    scenario_id: requireIdentifier(raw.scenario_id, 'scenario_id'),
    repository_revision: requireString(
      raw.repository_revision,
      'repository_revision',
    ),
    component_version_ids: requireUniqueIdentifiers(
      raw.component_version_ids,
      'component_version_ids',
    ),
    viewport: decodeViewportSpec(raw.viewport),
    screenshot_digest: requireDigest(raw.screenshot_digest, 'screenshot_digest'),
    baseline_digest: requireDigest(raw.baseline_digest, 'baseline_digest'),
    decision,
    evidence_level: requireEnum<EvidenceLevel>(
      raw.evidence_level,
      'evidence_level',
      EVIDENCE_SET,
    ),
    pixel_diff_percent: pixel,
    structural_diff_percent: structural,
    unexpected_layout_shift_count: requireIntInRange(
      raw.unexpected_layout_shift_count,
      'unexpected_layout_shift_count',
      0,
    ),
    missing_control_count: requireIntInRange(
      raw.missing_control_count,
      'missing_control_count',
      0,
    ),
    extra_control_count: requireIntInRange(
      raw.extra_control_count,
      'extra_control_count',
      0,
    ),
    screenshot_width: requireIntInRange(
      raw.screenshot_width,
      'screenshot_width',
      1,
    ),
    screenshot_height: requireIntInRange(
      raw.screenshot_height,
      'screenshot_height',
      1,
    ),
    expected_change_regions: expected,
    forbidden_change_regions: forbidden,
    max_unexplained_diff_percent: maxUnexplained,
    manual_review_threshold_percent: manualThreshold,
    requires_human_review: requiresReview,
    color_scheme: requireString(raw.color_scheme, 'color_scheme'),
    locale: requireString(raw.locale, 'locale'),
    text_scale_percent: requireIntInRange(
      raw.text_scale_percent,
      'text_scale_percent',
      25,
      500,
    ),
    browser,
    browser_version: browserVersion,
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

export function makeVisualRegressionReceipt(
  partial: Omit<
    VisualRegressionReceipt,
    'interface' | 'schema_version'
  >,
): VisualRegressionReceipt {
  return decodeVisualRegressionReceipt({
    ...visualRegressionReceiptToDict({
      interface: VISUAL_REGRESSION_RECEIPT_INTERFACE,
      schema_version: VISUAL_REGRESSION_RECEIPT_SCHEMA,
      ...partial,
    }),
    interface: VISUAL_REGRESSION_RECEIPT_INTERFACE,
    schema_version: VISUAL_REGRESSION_RECEIPT_SCHEMA,
  });
}

// ---------------------------------------------------------------------------
// Capture / artifact identity
// ---------------------------------------------------------------------------

function isTypedPixelData(
  value: unknown,
): value is Uint8Array | Uint8ClampedArray {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

function copyPixelBytes(data: Uint8Array | Uint8ClampedArray): Uint8Array {
  return Uint8Array.from(data);
}

function rejectPlaceholderCapture(value: unknown, field: string): void {
  if (typeof value === 'string' || typeof value === 'number') {
    throw new VisualRegressionError(
      `${field} must be measured ImageData, not a synthetic placeholder`,
    );
  }
  if (!isPlainObject(value)) {
    throw new VisualRegressionError(`${field} must be an object`);
  }
  if (value.placeholder === true || value.synthetic === true) {
    throw new VisualRegressionError(
      `${field} rejects synthetic placeholder captures`,
    );
  }
  if (typeof value.data === 'string' || Array.isArray(value.data)) {
    throw new VisualRegressionError(
      `${field} pixels must be a typed RGBA buffer, not a placeholder`,
    );
  }
  if (
    value.data == null &&
    (typeof value.screenshot_digest === 'string' ||
      typeof value.digest === 'string')
  ) {
    throw new VisualRegressionError(
      `${field} cannot substitute a digest for measured pixels`,
    );
  }
}

export function decodeVisualCapture(
  raw: unknown,
  field = 'capture',
): VisualCapture {
  rejectPlaceholderCapture(raw, field);
  const record = raw as Record<string, unknown>;
  const source = requireEnum<VisualCaptureSource>(
    record.source,
    `${field}.source`,
    CAPTURE_SOURCE_SET,
  );
  const width = requireIntInRange(record.width, `${field}.width`, 1, 100_000);
  const height = requireIntInRange(record.height, `${field}.height`, 1, 100_000);
  if (!isTypedPixelData(record.data)) {
    throw new VisualRegressionError(
      `${field}.data must be Uint8Array or Uint8ClampedArray RGBA pixels`,
    );
  }
  const expected = width * height * SCREENSHOT_CHANNELS;
  if (record.data.length !== expected) {
    throw new VisualRegressionError(
      `${field}.data length must be width*height*4 (${expected})`,
    );
  }
  const browser =
    record.browser === undefined || record.browser === ''
      ? undefined
      : requireString(record.browser, `${field}.browser`);
  const browserVersion =
    record.browser_version === undefined || record.browser_version === ''
      ? undefined
      : requireString(record.browser_version, `${field}.browser_version`);
  return Object.freeze({
    source,
    width,
    height,
    data: record.data,
    ...(browser === undefined ? {} : { browser }),
    ...(browserVersion === undefined ? {} : { browser_version: browserVersion }),
  });
}

export function makeVisualCapture(partial: VisualCapture): VisualCapture {
  return decodeVisualCapture(partial, 'capture');
}

function screenshotMaterial(
  capture: VisualCapture,
): Record<string, unknown> {
  const pixels = copyPixelBytes(capture.data);
  return {
    byte_length: pixels.length,
    capture_source: capture.source,
    channels: SCREENSHOT_CHANNELS,
    encoding: SCREENSHOT_ENCODING,
    height: capture.height,
    pixels_digest: sha256Digest(pixels),
    width: capture.width,
  };
}

export function screenshotArtifact(capture: VisualCapture): GuiArtifactDigest {
  const decoded = decodeVisualCapture(capture, 'capture');
  return artifactDigest(screenshotMaterial(decoded), {
    domain: DOMAIN_SCREENSHOT,
  });
}

export function absentBaselineArtifact(): GuiArtifactDigest {
  return artifactDigest(
    {
      absent: true,
      reason: 'baseline_missing',
    },
    { domain: DOMAIN_SCREENSHOT },
  );
}

export function rehashScreenshotArtifact(
  artifact: GuiArtifactDigest,
): GuiArtifactDigest {
  if (artifact.domain !== DOMAIN_SCREENSHOT) {
    throw new VisualRegressionError(
      'screenshot artifact domain must be gui.screenshot',
    );
  }
  return rehashArtifactDigest(artifact);
}

export function visualRegressionReceiptIdentity(
  receipt: VisualRegressionReceipt,
): GuiCanonicalIdentity {
  const decoded = decodeVisualRegressionReceipt(
    visualRegressionReceiptToDict(receipt),
  );
  return canonicalIdentity(visualRegressionReceiptToDict(decoded), {
    domain: DOMAIN_VISUAL_REGRESSION_RECEIPT,
    schemaVersion: VISUAL_REGRESSION_RECEIPT_SCHEMA,
  });
}

export function rehashVisualRegressionReceiptIdentity(
  identity: GuiCanonicalIdentity,
): GuiCanonicalIdentity {
  if (identity.domain !== DOMAIN_VISUAL_REGRESSION_RECEIPT) {
    throw new VisualRegressionError(
      'receipt identity domain must be gui.visual-regression-receipt',
    );
  }
  return rehashIdentity(identity);
}

export function isBrowserCapture(
  capture: Pick<VisualCapture, 'source'> | VisualRegressionEvaluationResult,
): boolean {
  if ('capture_source' in capture) {
    return capture.capture_source === 'browser';
  }
  return capture.source === 'browser';
}

export function isSimulatedCapture(
  capture: Pick<VisualCapture, 'source'> | VisualRegressionEvaluationResult,
): boolean {
  if ('capture_source' in capture) {
    return capture.capture_source === 'simulation';
  }
  return capture.source === 'simulation';
}

// ---------------------------------------------------------------------------
// Pixel / structural comparison
// ---------------------------------------------------------------------------

function quantizePercent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new VisualRegressionError('percent must be finite');
  }
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value * 10000) / 10000;
}

function percentOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return quantizePercent((count * 100) / total);
}

function pixelInRegion(
  nx: number,
  ny: number,
  region: VisualChangeRegion,
): boolean {
  return (
    nx >= region.x &&
    nx < region.x + region.width &&
    ny >= region.y &&
    ny < region.y + region.height
  );
}

function classifyPixel(
  nx: number,
  ny: number,
  expected: readonly VisualChangeRegion[],
  forbidden: readonly VisualChangeRegion[],
): 'expected' | 'forbidden' | 'unexplained' {
  for (const region of forbidden) {
    if (pixelInRegion(nx, ny, region)) return 'forbidden';
  }
  for (const region of expected) {
    if (pixelInRegion(nx, ny, region)) return 'expected';
  }
  return 'unexplained';
}

function pixelsDiffer(
  left: Uint8Array,
  right: Uint8Array,
  offset: number,
): boolean {
  return (
    left[offset] !== right[offset] ||
    left[offset + 1] !== right[offset + 1] ||
    left[offset + 2] !== right[offset + 2] ||
    left[offset + 3] !== right[offset + 3]
  );
}

function emptyMeasurement(width: number, height: number): VisualDiffMeasurement {
  return Object.freeze({
    interface: VISUAL_DIFF_MEASUREMENT_INTERFACE,
    schema_version: VISUAL_DIFF_MEASUREMENT_SCHEMA,
    total_pixels: width * height,
    changed_pixels: 0,
    expected_region_changed_pixels: 0,
    forbidden_region_changed_pixels: 0,
    unexplained_changed_pixels: 0,
    total_pixel_diff_percent: 0,
    expected_region_diff_percent: 0,
    forbidden_region_diff_percent: 0,
    unexplained_pixel_diff_percent: 0,
    structural_cell_count: 0,
    structural_changed_cells: 0,
    unexplained_structural_changed_cells: 0,
    structural_diff_percent: 0,
    unexpected_layout_shift_count: 0,
    missing_control_count: 0,
    extra_control_count: 0,
    dimension_mismatch: false,
  });
}

function cellMean(
  pixels: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * SCREENSHOT_CHANNELS;
      r += pixels[offset];
      g += pixels[offset + 1];
      b += pixels[offset + 2];
      a += pixels[offset + 3];
      count += 1;
    }
  }
  if (count === 0) return [0, 0, 0, 0];
  return [r / count, g / count, b / count, a / count];
}

function cellOccupied(mean: readonly [number, number, number, number]): boolean {
  const luminance = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
  return mean[3] > 8 && luminance < 250;
}

function meansDiffer(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
): boolean {
  return (
    Math.abs(left[0] - right[0]) >= 1 ||
    Math.abs(left[1] - right[1]) >= 1 ||
    Math.abs(left[2] - right[2]) >= 1 ||
    Math.abs(left[3] - right[3]) >= 1
  );
}

function decodeControlObservation(
  raw: unknown,
  field: string,
): StructuralControlObservation {
  if (!isPlainObject(raw)) {
    throw new VisualRegressionDecodeError(`${field} must be an object`);
  }
  const x = requireFiniteNumber(raw.x, `${field}.x`);
  const y = requireFiniteNumber(raw.y, `${field}.y`);
  const width = requireFiniteNumber(raw.width, `${field}.width`);
  const height = requireFiniteNumber(raw.height, `${field}.height`);
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new VisualRegressionDecodeError(
      `${field} geometry must be a positive normalized rectangle`,
    );
  }
  if (x + width > 1 || y + height > 1) {
    throw new VisualRegressionDecodeError(
      `${field} geometry must stay inside the unit square`,
    );
  }
  return Object.freeze({
    control_id: requireIdentifier(raw.control_id, `${field}.control_id`),
    x,
    y,
    width,
    height,
  });
}

function controlCounts(
  baseline: readonly StructuralControlObservation[],
  after: readonly StructuralControlObservation[],
): { missing: number; extra: number } {
  const beforeIds = new Set(baseline.map(item => item.control_id));
  const afterIds = new Set(after.map(item => item.control_id));
  let missing = 0;
  let extra = 0;
  for (const id of beforeIds) {
    if (!afterIds.has(id)) missing += 1;
  }
  for (const id of afterIds) {
    if (!beforeIds.has(id)) extra += 1;
  }
  return { missing, extra };
}

export function compareImageData(
  baseline: VisualCapture,
  after: VisualCapture,
  policy: VisualDiffPolicy,
  structural?: {
    readonly baseline?: readonly StructuralControlObservation[];
    readonly after?: readonly StructuralControlObservation[];
  },
): VisualDiffMeasurement {
  const left = decodeVisualCapture(baseline, 'baseline');
  const right = decodeVisualCapture(after, 'capture');
  const baselinePixels = copyPixelBytes(left.data);
  const afterPixels = copyPixelBytes(right.data);
  const width = right.width;
  const height = right.height;
  const total = width * height;
  const structuralBaseline = (structural?.baseline ?? []).map((item, index) =>
    decodeControlObservation(item, `structural_baseline[${index}]`),
  );
  const structuralAfter = (structural?.after ?? []).map((item, index) =>
    decodeControlObservation(item, `structural_after[${index}]`),
  );
  const controls = controlCounts(structuralBaseline, structuralAfter);

  if (left.width !== right.width || left.height !== right.height) {
    return Object.freeze({
      ...emptyMeasurement(width, height),
      changed_pixels: total,
      unexplained_changed_pixels: total,
      total_pixel_diff_percent: 100,
      unexplained_pixel_diff_percent: 100,
      structural_diff_percent: 100,
      unexplained_structural_changed_cells: 1,
      structural_cell_count: 1,
      structural_changed_cells: 1,
      unexpected_layout_shift_count: 1,
      missing_control_count: controls.missing,
      extra_control_count: controls.extra,
      dimension_mismatch: true,
    });
  }

  let changed = 0;
  let expectedChanged = 0;
  let forbiddenChanged = 0;
  let unexplainedChanged = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * SCREENSHOT_CHANNELS;
      if (!pixelsDiffer(baselinePixels, afterPixels, offset)) continue;
      changed += 1;
      const kind = classifyPixel(
        x / width,
        y / height,
        policy.expected_change_regions,
        policy.forbidden_change_regions,
      );
      if (kind === 'forbidden') forbiddenChanged += 1;
      else if (kind === 'expected') expectedChanged += 1;
      else unexplainedChanged += 1;
    }
  }

  const cols = Math.min(STRUCTURAL_GRID_MAX, width);
  const rows = Math.min(STRUCTURAL_GRID_MAX, height);
  const cellCount = cols * rows;
  let structuralChanged = 0;
  let unexplainedStructural = 0;
  let layoutShifts = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.floor((col * width) / cols);
      const x1 = Math.floor(((col + 1) * width) / cols);
      const y0 = Math.floor((row * height) / rows);
      const y1 = Math.floor(((row + 1) * height) / rows);
      const leftMean = cellMean(baselinePixels, width, x0, y0, x1, y1);
      const rightMean = cellMean(afterPixels, width, x0, y0, x1, y1);
      const nx = (x0 + x1) / 2 / width;
      const ny = (y0 + y1) / 2 / height;
      const kind = classifyPixel(
        nx,
        ny,
        policy.expected_change_regions,
        policy.forbidden_change_regions,
      );
      if (meansDiffer(leftMean, rightMean)) {
        structuralChanged += 1;
        if (kind !== 'expected') unexplainedStructural += 1;
      }
      if (cellOccupied(leftMean) !== cellOccupied(rightMean) && kind !== 'expected') {
        layoutShifts += 1;
      }
    }
  }

  return Object.freeze({
    interface: VISUAL_DIFF_MEASUREMENT_INTERFACE,
    schema_version: VISUAL_DIFF_MEASUREMENT_SCHEMA,
    total_pixels: total,
    changed_pixels: changed,
    expected_region_changed_pixels: expectedChanged,
    forbidden_region_changed_pixels: forbiddenChanged,
    unexplained_changed_pixels: unexplainedChanged,
    total_pixel_diff_percent: percentOf(changed, total),
    expected_region_diff_percent: percentOf(expectedChanged, total),
    forbidden_region_diff_percent: percentOf(forbiddenChanged, total),
    unexplained_pixel_diff_percent: percentOf(unexplainedChanged, total),
    structural_cell_count: cellCount,
    structural_changed_cells: structuralChanged,
    unexplained_structural_changed_cells: unexplainedStructural,
    structural_diff_percent: percentOf(unexplainedStructural, cellCount),
    unexpected_layout_shift_count: layoutShifts,
    missing_control_count: controls.missing,
    extra_control_count: controls.extra,
    dimension_mismatch: false,
  });
}

function decodeAppeal(
  appeal: VisualRegressionEvaluateRequest['appeal'],
): VisualAppealAssessment {
  const evidenceLevel = appeal?.evidence_level
    ? requireEnum<'heuristic' | 'human_reviewed'>(
        appeal.evidence_level,
        'appeal.evidence_level',
        APPEAL_EVIDENCE_SET,
      )
    : 'heuristic';
  const scoresIn = appeal?.scores ?? {};
  const scores: Record<string, number> = {};
  for (const axis of SUBJECTIVE_APPEAL_AXES) {
    if (!Object.prototype.hasOwnProperty.call(scoresIn, axis)) continue;
    scores[axis] = requirePercent(
      scoresIn[axis],
      `appeal.scores.${axis}`,
    );
  }
  return Object.freeze({
    interface: VISUAL_APPEAL_ASSESSMENT_INTERFACE,
    schema_version: VISUAL_APPEAL_ASSESSMENT_SCHEMA,
    evidence_level: evidenceLevel,
    scores: Object.freeze(scores) as VisualAppealScores,
    notes:
      appeal?.notes ??
      'subjective appeal remains heuristic or human-reviewed and cannot override gates',
    overrides_objective_gates: false as const,
  });
}

function decideVisualOutcome(input: {
  skip: boolean;
  baselineMissing: boolean;
  measurement: VisualDiffMeasurement;
  policy: VisualDiffPolicy;
}): {
  decision: VisualDecision;
  requiresHumanReview: boolean;
  reasons: readonly VisualGateReason[];
} {
  if (input.skip) {
    return {
      decision: 'skipped',
      requiresHumanReview: false,
      reasons: Object.freeze(['skipped'] as VisualGateReason[]),
    };
  }
  if (input.baselineMissing) {
    return {
      decision: 'baseline_missing',
      requiresHumanReview: false,
      reasons: Object.freeze(['baseline_missing'] as VisualGateReason[]),
    };
  }

  const reasons: VisualGateReason[] = [];
  if (input.measurement.dimension_mismatch) {
    reasons.push('dimension_mismatch');
  }
  if (input.measurement.forbidden_region_changed_pixels > 0) {
    reasons.push('forbidden_region_change');
  }
  if (
    input.measurement.unexplained_pixel_diff_percent >
    input.policy.max_unexplained_diff_percent
  ) {
    reasons.push('unexplained_diff_exceeds_max');
  }
  const atManualThreshold =
    input.measurement.unexplained_pixel_diff_percent >=
    input.policy.manual_review_threshold_percent;
  if (reasons.length > 0) {
    return {
      decision: 'fail',
      requiresHumanReview: atManualThreshold,
      reasons: Object.freeze(reasons),
    };
  }
  if (atManualThreshold) {
    return {
      decision: 'review',
      requiresHumanReview: true,
      reasons: Object.freeze(['manual_review_threshold'] as VisualGateReason[]),
    };
  }
  return {
    decision: 'pass',
    requiresHumanReview: false,
    reasons: Object.freeze([] as VisualGateReason[]),
  };
}

function captureAuthority(source: VisualCaptureSource): {
  evidence_level: EvidenceLevel;
  verification_status: GuiVerificationStatus;
  analysis_classification: GuiExtractionConfidence;
} {
  if (source === 'simulation') {
    return {
      evidence_level: 'simulated',
      verification_status: 'simulated',
      analysis_classification: 'heuristic',
    };
  }
  return {
    evidence_level: 'automated',
    verification_status: 'integrity_valid',
    analysis_classification: 'exact',
  };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export function evaluateVisualRegression(
  request: VisualRegressionEvaluateRequest,
): VisualRegressionEvaluationResult {
  if (!isPlainObject(request)) {
    throw new VisualRegressionError('request must be an object');
  }
  const capture = decodeVisualCapture(request.capture, 'capture');
  const baseline =
    request.baseline === undefined || request.baseline === null
      ? null
      : decodeVisualCapture(request.baseline, 'baseline');
  const policy = makeVisualDiffPolicy(request.policy ?? {});
  const viewport = decodeViewportSpec(request.viewport ?? VIEWPORT_DESKTOP);
  const browser = requireString(
    capture.browser ?? request.browser,
    'browser',
  );
  const browserVersion = requireString(
    capture.browser_version ?? request.browser_version,
    'browser_version',
  );
  const screenshot = screenshotArtifact(capture);
  const baselineArt = baseline
    ? screenshotArtifact(baseline)
    : absentBaselineArtifact();
  const compared = baseline !== null && request.skip !== true;
  const measurement = compared
    ? compareImageData(baseline as VisualCapture, capture, policy, {
        baseline: request.structural_baseline,
        after: request.structural_after,
      })
    : emptyMeasurement(capture.width, capture.height);
  const outcome = decideVisualOutcome({
    skip: request.skip === true,
    baselineMissing: baseline === null,
    measurement,
    policy,
  });
  const authority = captureAuthority(capture.source);
  const verificationStatus: GuiVerificationStatus =
    outcome.decision === 'baseline_missing' && capture.source === 'browser'
      ? 'unverified'
      : authority.verification_status;
  const analysisClassification: GuiExtractionConfidence =
    measurement.dimension_mismatch || outcome.decision === 'baseline_missing'
      ? 'conservative'
      : authority.analysis_classification;

  // Receipt pixel_diff_percent is the gated unexplained observation so PASS
  // remains decoder-valid when expected-region changes are large.
  const identitySeed = {
    application_id: requireIdentifier(request.application_id, 'application_id'),
    baseline_digest: baselineArt.digest,
    browser,
    browser_version: browserVersion,
    capture_source: capture.source,
    color_scheme: requireString(request.color_scheme ?? 'light', 'color_scheme'),
    component_version_ids: requireUniqueIdentifiers(
      request.component_version_ids ?? [],
      'component_version_ids',
    ),
    locale: requireString(request.locale ?? 'en-US', 'locale'),
    policy: {
      expected_change_regions: policy.expected_change_regions.map(
        visualChangeRegionToDict,
      ),
      forbidden_change_regions: policy.forbidden_change_regions.map(
        visualChangeRegionToDict,
      ),
      manual_review_threshold_percent: policy.manual_review_threshold_percent,
      max_unexplained_diff_percent: policy.max_unexplained_diff_percent,
    },
    repository_revision: requireString(
      request.repository_revision,
      'repository_revision',
    ),
    scenario_id: requireIdentifier(request.scenario_id, 'scenario_id'),
    screen_id: requireIdentifier(request.screen_id, 'screen_id'),
    screenshot_digest: screenshot.digest,
    text_scale_percent: requireIntInRange(
      request.text_scale_percent ?? 100,
      'text_scale_percent',
      25,
      500,
    ),
    viewport: viewportToDict(viewport),
  };
  const seedIdentity = canonicalIdentity(identitySeed, {
    domain: DOMAIN_VISUAL_REGRESSION_RECEIPT,
    schemaVersion: VISUAL_REGRESSION_RECEIPT_SCHEMA,
  });
  const receiptId = `receipt:visual:${seedIdentity.digest.slice(7, 23)}`;

  const receipt = decodeVisualRegressionReceipt({
    analysis_classification: analysisClassification,
    application_id: identitySeed.application_id,
    baseline_digest: baselineArt.digest,
    browser,
    browser_version: browserVersion,
    color_scheme: identitySeed.color_scheme,
    component_version_ids: [...identitySeed.component_version_ids],
    decision: outcome.decision,
    evidence_level: authority.evidence_level,
    expected_change_regions: policy.expected_change_regions.map(
      visualChangeRegionToDict,
    ),
    extra_control_count: measurement.extra_control_count,
    forbidden_change_regions: policy.forbidden_change_regions.map(
      visualChangeRegionToDict,
    ),
    interface: VISUAL_REGRESSION_RECEIPT_INTERFACE,
    locale: identitySeed.locale,
    manual_review_threshold_percent: policy.manual_review_threshold_percent,
    max_unexplained_diff_percent: policy.max_unexplained_diff_percent,
    missing_control_count: measurement.missing_control_count,
    pixel_diff_percent: measurement.unexplained_pixel_diff_percent,
    receipt_id: receiptId,
    repository_revision: identitySeed.repository_revision,
    requires_human_review: outcome.requiresHumanReview,
    scenario_id: identitySeed.scenario_id,
    schema_version: VISUAL_REGRESSION_RECEIPT_SCHEMA,
    screen_id: identitySeed.screen_id,
    screenshot_digest: screenshot.digest,
    screenshot_height: capture.height,
    screenshot_width: capture.width,
    structural_diff_percent: measurement.structural_diff_percent,
    text_scale_percent: identitySeed.text_scale_percent,
    unexpected_layout_shift_count: measurement.unexpected_layout_shift_count,
    verification_status: verificationStatus,
    viewport: viewportToDict(viewport),
  });

  return Object.freeze({
    evaluator_interface: VISUAL_REGRESSION_EVALUATOR_INTERFACE,
    evaluator_schema_version: VISUAL_REGRESSION_EVALUATOR_SCHEMA,
    evaluator_version: VISUAL_REGRESSION_EVALUATOR_VERSION,
    receipt,
    receipt_identity: visualRegressionReceiptIdentity(receipt),
    screenshot_artifact: screenshot,
    baseline_artifact: baselineArt,
    measurement,
    appeal: decodeAppeal(request.appeal),
    capture_source: capture.source,
    baseline_capture_source: baseline ? baseline.source : 'absent',
    gate_reasons: outcome.reasons,
    compared,
  });
}

export function createVisualRegressionEvaluator(): VisualRegressionEvaluator {
  return Object.freeze({
    interface: VISUAL_REGRESSION_EVALUATOR_INTERFACE,
    schema_version: VISUAL_REGRESSION_EVALUATOR_SCHEMA,
    evaluatorVersion: VISUAL_REGRESSION_EVALUATOR_VERSION,
    evaluate(request: VisualRegressionEvaluateRequest) {
      return evaluateVisualRegression(request);
    },
  });
}

export function visualRegressionReceiptDigest(
  receipt: VisualRegressionReceipt,
): string {
  return visualRegressionReceiptIdentity(receipt).digest;
}

/**
 * Compact, evidence-bounded GUI context packs (VGO-030).
 *
 * Wire models:
 *   - build_gui_context_pack@1
 *   - UiContextPack@1 / ui-context-pack/v1
 *   - UiContextTokenAccounting@1 / ui-context-token-accounting/v1
 *   - nested UiContext* records matching the Python closed registry
 *
 * Packs the objective, exact editable source/styles/tests, unchanged
 * parent/child capsules, state machine, failures, artifact references,
 * routes/bindings, baseline, acceptance criteria, exclusions, token
 * estimates and escalation conditions. Editable, opaque, stale,
 * unresolved or failure-point source is always raw. Stale capsules are
 * rejected and cannot substitute for source. Token estimation is
 * deterministic and conservative. Omitted context is explained without
 * dropping affected acceptance evidence.
 *
 * This module never executes repository source and never consults a
 * semantic index, model router, or unrelated raw repository dump.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  GUI_EXTRACTION_CONFIDENCE,
  GUI_VERIFICATION_STATUS,
  type GuiAnalysisClassification,
  type GuiExtractionConfidence,
  type GuiVerificationStatus,
  worstGuiExtractionConfidence,
} from './models.js';
import {
  decodeUiActionBinding,
  type UiActionBinding,
} from './policy-validator.js';
import {
  decodeUiEventDefinition,
  decodeUiStateDefinition,
  decodeUiTransitionDefinition,
  type UiEventDefinition,
  type UiStateDefinition,
  type UiStateMachine,
  type UiTransitionDefinition,
} from './state-machine.js';
import {
  decodeUiSemanticCapsule,
  serializeUiSemanticCapsule,
  uiSemanticCapsuleToDict,
  type UiSemanticCapsule,
} from './ui-capsule.js';
import type {
  UiChangeSet,
  UiInvalidationEdge,
  UiInvalidationPlan,
} from './invalidation.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const BUILD_GUI_CONTEXT_PACK_INTERFACE =
  'build_gui_context_pack@1' as const;

export const UI_CONTEXT_PACK_INTERFACE = 'UiContextPack@1' as const;
export const UI_CONTEXT_PACK_SCHEMA = 'ui-context-pack/v1' as const;

export const UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE =
  'UiContextTokenAccounting@1' as const;
export const UI_CONTEXT_TOKEN_ACCOUNTING_SCHEMA =
  'ui-context-token-accounting/v1' as const;

export const UI_CONTEXT_SOURCE_INTERFACE = 'UiContextSource@1' as const;
export const UI_CONTEXT_SOURCE_SCHEMA = 'ui-context-source/v1' as const;

export const UI_CONTEXT_STYLE_INTERFACE = 'UiContextStyle@1' as const;
export const UI_CONTEXT_STYLE_SCHEMA = 'ui-context-style/v1' as const;

export const UI_CONTEXT_TEST_INTERFACE = 'UiContextTest@1' as const;
export const UI_CONTEXT_TEST_SCHEMA = 'ui-context-test/v1' as const;

export const UI_CONTEXT_STATE_MACHINE_INTERFACE =
  'UiContextStateMachine@1' as const;
export const UI_CONTEXT_STATE_MACHINE_SCHEMA =
  'ui-context-state-machine/v1' as const;

export const UI_CONTEXT_FORMAL_FAILURE_INTERFACE =
  'UiContextFormalFailure@1' as const;
export const UI_CONTEXT_FORMAL_FAILURE_SCHEMA =
  'ui-context-formal-failure/v1' as const;

export const UI_CONTEXT_ACCESSIBILITY_VIOLATION_INTERFACE =
  'UiContextAccessibilityViolation@1' as const;
export const UI_CONTEXT_ACCESSIBILITY_VIOLATION_SCHEMA =
  'ui-context-accessibility-violation/v1' as const;

export const UI_CONTEXT_VISUAL_REFERENCE_INTERFACE =
  'UiContextVisualReference@1' as const;
export const UI_CONTEXT_VISUAL_REFERENCE_SCHEMA =
  'ui-context-visual-reference/v1' as const;

export const UI_CONTEXT_SCREENSHOT_DESCRIPTION_INTERFACE =
  'UiContextScreenshotDescription@1' as const;
export const UI_CONTEXT_SCREENSHOT_DESCRIPTION_SCHEMA =
  'ui-context-screenshot-description/v1' as const;

export const UI_CONTEXT_ROUTE_INTERFACE = 'UiContextRoute@1' as const;
export const UI_CONTEXT_ROUTE_SCHEMA = 'ui-context-route/v1' as const;

export const UI_CONTEXT_METRIC_BASELINE_INTERFACE =
  'UiContextMetricBaseline@1' as const;
export const UI_CONTEXT_METRIC_BASELINE_SCHEMA =
  'ui-context-metric-baseline/v1' as const;

export const UI_CONTEXT_PACK_BUILDER_INTERFACE =
  'UiContextPackBuilder@1' as const;
export const UI_CONTEXT_PACK_BUILDER_SCHEMA =
  'ui-context-pack-builder/v1' as const;
export const UI_CONTEXT_PACK_BUILDER_VERSION =
  'gui-context-pack-builder@1.0.0' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies / bounds
// ---------------------------------------------------------------------------

export const UI_CONTEXT_STYLE_KINDS = Object.freeze([
  'design-token',
  'css',
  'stylesheet',
  'inline',
  'other',
] as const);
export type UiContextStyleKind = (typeof UI_CONTEXT_STYLE_KINDS)[number];

export const UI_CONSTRAINT_CHECK_STATUSES = Object.freeze([
  'satisfied',
  'violated',
  'inconclusive',
  'unsupported',
  'skipped',
  'error',
] as const);
export type UiConstraintCheckStatus =
  (typeof UI_CONSTRAINT_CHECK_STATUSES)[number];

export const UI_ACCESSIBILITY_SEVERITIES = Object.freeze([
  'critical',
  'serious',
  'moderate',
  'minor',
] as const);
export type UiAccessibilitySeverity =
  (typeof UI_ACCESSIBILITY_SEVERITIES)[number];

export const UI_CONTEXT_SOURCE_INCLUSION_REASONS = Object.freeze([
  'editable_target',
  'opaque_component',
  'stale_component',
  'unresolved_binding',
  'failure_point',
  'implementation_visual_failure',
] as const);
export type UiContextSourceInclusionReason =
  (typeof UI_CONTEXT_SOURCE_INCLUSION_REASONS)[number];

export const UI_CONTEXT_CAPSULE_REJECTION_REASONS = Object.freeze([
  'stale_capsule',
  'invalid_capsule',
  'missing_raw_source_for_stale_capsule',
] as const);
export type UiContextCapsuleRejectionReason =
  (typeof UI_CONTEXT_CAPSULE_REJECTION_REASONS)[number];

/** Conservative deterministic estimator: 1 token per 3 code units, rounded up. */
export const CONTEXT_TOKEN_CHARS_PER_TOKEN = 3 as const;

export const MAX_IDENTIFIER_CHARS = 256 as const;
export const MAX_STRING_CHARS = 4096 as const;
export const MAX_CONTENT_CHARS = 262144 as const;
export const MAX_COLLECTION_ITEMS = 1024 as const;
export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const CONSUMER_RELATIONS = Object.freeze(
  new Set(['renders', 'contains', 'routes_to', 'opens_dialog', 'closes_dialog']),
);
const STYLE_RELATIONS = Object.freeze(
  new Set(['styled_by', 'uses_design_token', 'responsive_variant_of']),
);
const TEST_RELATIONS = Object.freeze(new Set(['tested_by']));

// ---------------------------------------------------------------------------
// Wire records
// ---------------------------------------------------------------------------

export interface UiContextSource {
  readonly interface: typeof UI_CONTEXT_SOURCE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_SOURCE_SCHEMA;
  readonly path: string;
  readonly content: string;
  readonly component_id: string;
  readonly editable: boolean;
}

export interface UiContextStyle {
  readonly interface: typeof UI_CONTEXT_STYLE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_STYLE_SCHEMA;
  readonly path: string;
  readonly content: string;
  readonly style_kind: UiContextStyleKind;
}

export interface UiContextTest {
  readonly interface: typeof UI_CONTEXT_TEST_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_TEST_SCHEMA;
  readonly path: string;
  readonly content: string;
  readonly test_id: string;
}

export interface UiContextStateMachine {
  readonly interface: typeof UI_CONTEXT_STATE_MACHINE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_STATE_MACHINE_SCHEMA;
  readonly machine_id: string;
  readonly initial_state_id: string;
  readonly states: readonly UiStateDefinition[];
  readonly events: readonly UiEventDefinition[];
  readonly transitions: readonly UiTransitionDefinition[];
}

export interface UiContextFormalFailure {
  readonly interface: typeof UI_CONTEXT_FORMAL_FAILURE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_FORMAL_FAILURE_SCHEMA;
  readonly invariant_id: string;
  readonly status: UiConstraintCheckStatus;
  readonly description: string;
}

export interface UiContextAccessibilityViolation {
  readonly interface: typeof UI_CONTEXT_ACCESSIBILITY_VIOLATION_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_ACCESSIBILITY_VIOLATION_SCHEMA;
  readonly violation_id: string;
  readonly severity: UiAccessibilitySeverity;
  readonly description: string;
}

export interface UiContextVisualReference {
  readonly interface: typeof UI_CONTEXT_VISUAL_REFERENCE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_VISUAL_REFERENCE_SCHEMA;
  readonly artifact_digest: string;
  readonly description: string;
}

export interface UiContextScreenshotDescription {
  readonly interface: typeof UI_CONTEXT_SCREENSHOT_DESCRIPTION_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_SCREENSHOT_DESCRIPTION_SCHEMA;
  readonly scenario_id: string;
  readonly artifact_digest: string;
  readonly description: string;
}

export interface UiContextRoute {
  readonly interface: typeof UI_CONTEXT_ROUTE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_ROUTE_SCHEMA;
  readonly route_id: string;
  readonly path: string;
}

export interface UiContextMetricBaseline {
  readonly interface: typeof UI_CONTEXT_METRIC_BASELINE_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_METRIC_BASELINE_SCHEMA;
  readonly metric_id: string;
  readonly metrics: Readonly<Record<string, unknown>>;
}

/** UiContextTokenAccounting@1 — derived, reproducible compression ledger. */
export interface UiContextTokenAccounting {
  readonly interface: typeof UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_TOKEN_ACCOUNTING_SCHEMA;
  readonly raw_source_tokens: number;
  readonly capsule_tokens: number;
  readonly screenshot_analysis_tokens: number;
  readonly other_context_tokens: number;
  readonly source_tokens_replaced_by_capsules: number;
  readonly ordinary_raw_dependency_tokens: number;
  readonly total_estimated_prompt_tokens: number;
  readonly token_budget: number;
  readonly compression_ratio: number;
}

/** UiContextPack@1 — mirrors the Python closed wire fields exactly. */
export interface UiContextPack {
  readonly interface: typeof UI_CONTEXT_PACK_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_PACK_SCHEMA;
  readonly pack_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly objective: string;
  readonly baseline_id: string;
  readonly raw_sources: readonly UiContextSource[];
  readonly styles: readonly UiContextStyle[];
  readonly affected_tests: readonly UiContextTest[];
  readonly parent_capsules: readonly UiSemanticCapsule[];
  readonly child_capsules: readonly UiSemanticCapsule[];
  readonly state_machine: UiContextStateMachine;
  readonly formal_invariant_failures: readonly UiContextFormalFailure[];
  readonly accessibility_violations: readonly UiContextAccessibilityViolation[];
  readonly visual_references: readonly UiContextVisualReference[];
  readonly screenshot_descriptions: readonly UiContextScreenshotDescription[];
  readonly artifact_digests: readonly string[];
  readonly affected_routes: readonly UiContextRoute[];
  readonly action_bindings: readonly UiActionBinding[];
  readonly metric_baseline: UiContextMetricBaseline;
  readonly acceptance_criteria: readonly string[];
  readonly excluded_context_explanation: string;
  readonly escalation_conditions: readonly string[];
  readonly raw_source_tokens: number;
  readonly capsule_tokens: number;
  readonly screenshot_analysis_tokens: number;
  readonly other_context_tokens: number;
  readonly source_tokens_replaced_by_capsules: number;
  readonly ordinary_raw_dependency_tokens: number;
  readonly total_estimated_prompt_tokens: number;
  readonly token_budget: number;
  readonly compression_ratio: number;
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
}

// ---------------------------------------------------------------------------
// Builder inputs
// ---------------------------------------------------------------------------

export interface GuiContextSourceInput {
  readonly path: string;
  readonly content: string;
  readonly component_id?: string;
  readonly editable?: boolean;
  readonly opaque?: boolean;
  readonly stale?: boolean;
  readonly unresolved?: boolean;
  readonly failure_point?: boolean;
  readonly application_id?: string;
  readonly screen_id?: string;
}

export interface GuiContextStyleInput {
  readonly path: string;
  readonly content: string;
  readonly style_kind?: UiContextStyleKind | string;
  readonly component_id?: string;
  readonly application_id?: string;
  readonly screen_id?: string;
  readonly relevant?: boolean;
}

export interface GuiContextTestInput {
  readonly path: string;
  readonly content: string;
  readonly test_id: string;
  readonly component_id?: string;
  readonly application_id?: string;
  readonly screen_id?: string;
}

export interface GuiContextRouteInput {
  readonly route_id: string;
  readonly path: string;
}

export interface GuiContextScreenshotInput {
  readonly scenario_id: string;
  readonly artifact_digest: string;
  readonly description: string;
  readonly component_id?: string;
  readonly required?: boolean;
}

export interface GuiContextVisualReferenceInput {
  readonly artifact_digest: string;
  readonly description: string;
  readonly component_id?: string;
  readonly path?: string;
  readonly implementation_dependent?: boolean;
  readonly required?: boolean;
}

export interface GuiContextBindingResolution {
  readonly action_id: string;
  readonly component_id?: string;
  readonly path?: string;
  readonly resolution: 'exact' | 'ambiguous' | 'dynamic' | 'unresolved';
}

export interface GuiContextFormalFailureInput {
  readonly invariant_id: string;
  readonly status: UiConstraintCheckStatus | string;
  readonly description: string;
  readonly component_id?: string;
  readonly path?: string;
}

export interface GuiContextAccessibilityViolationInput {
  readonly violation_id: string;
  readonly severity: UiAccessibilitySeverity | string;
  readonly description: string;
  readonly component_id?: string;
  readonly path?: string;
}

export interface GuiContextBaselineInput {
  readonly baseline_id?: string;
  readonly metric_id?: string;
  readonly metrics?: Readonly<Record<string, unknown>>;
  readonly visual_references?: readonly GuiContextVisualReferenceInput[];
  readonly screenshot_descriptions?: readonly GuiContextScreenshotInput[];
  readonly artifact_digests?: readonly string[];
  readonly routes?: readonly GuiContextRouteInput[];
}

export interface GuiContextViolationsInput {
  readonly formal_invariant_failures?: readonly GuiContextFormalFailureInput[];
  readonly accessibility_violations?: readonly GuiContextAccessibilityViolationInput[];
  readonly visual_failures?: readonly GuiContextVisualReferenceInput[];
  readonly unresolved_bindings?: readonly GuiContextBindingResolution[];
}

export interface GuiContextRepositoryState {
  readonly revision?: string;
  readonly application_id?: string;
  readonly screen_id?: string;
  readonly sources: readonly GuiContextSourceInput[];
  readonly styles?: readonly GuiContextStyleInput[];
  readonly tests?: readonly GuiContextTestInput[];
  readonly capsules?: readonly UiSemanticCapsule[];
  readonly edges?: readonly UiInvalidationEdge[];
  readonly state_machine?: UiContextStateMachine | UiStateMachine | unknown;
  readonly action_bindings?: readonly UiActionBinding[];
  readonly routes?: readonly GuiContextRouteInput[];
  readonly screenshots?: readonly GuiContextScreenshotInput[];
  readonly visual_references?: readonly GuiContextVisualReferenceInput[];
  readonly invalidation_plan?: UiInvalidationPlan;
  readonly change_set?: UiChangeSet;
  readonly binding_resolutions?: readonly GuiContextBindingResolution[];
  readonly unresolved?: readonly string[];
}

export interface GuiContextPackRequest {
  readonly repository_state: GuiContextRepositoryState;
  readonly application_id: string;
  readonly screen_id: string;
  readonly objective: string;
  readonly token_budget: number;
  readonly baseline?: GuiContextBaselineInput | null;
  readonly violations?: GuiContextViolationsInput | null;
  readonly invalidation_plan?: UiInvalidationPlan;
  readonly change_set?: UiChangeSet;
  readonly acceptance_criteria?: readonly string[];
  readonly escalation_conditions?: readonly string[];
  readonly pack_id?: string;
  readonly analysis_classification?: GuiAnalysisClassification;
  readonly verification_status?: GuiVerificationStatus;
}

export interface UiContextInclusionRecord {
  readonly subject_id: string;
  readonly reason: UiContextSourceInclusionReason | 'unchanged_capsule';
  readonly detail: string;
}

export interface UiContextExclusionRecord {
  readonly subject_id: string;
  readonly reason: string;
}

export interface UiContextPackBuildTrace {
  readonly pack: UiContextPack;
  readonly accounting: UiContextTokenAccounting;
  readonly inclusion_reasons: readonly UiContextInclusionRecord[];
  readonly exclusion_reasons: readonly UiContextExclusionRecord[];
  readonly rejected_capsules: readonly {
    readonly capsule_id: string;
    readonly reason: UiContextCapsuleRejectionReason;
  }[];
}

export interface UiContextPackBuilder {
  readonly interface: typeof UI_CONTEXT_PACK_BUILDER_INTERFACE;
  readonly schema_version: typeof UI_CONTEXT_PACK_BUILDER_SCHEMA;
  readonly extractorVersion: typeof UI_CONTEXT_PACK_BUILDER_VERSION;
  build(
    repositoryState: GuiContextRepositoryState | GuiContextPackRequest,
    applicationId?: string,
    screenId?: string,
    objective?: string,
    tokenBudget?: number,
    baseline?: GuiContextBaselineInput | null,
    violations?: GuiContextViolationsInput | null,
  ): UiContextPack;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiContextPackError extends Error {
  readonly name = 'UiContextPackError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiContextPackDecodeError extends UiContextPackError {
  readonly name = 'UiContextPackDecodeError';
}

export class UiContextPackBudgetError extends UiContextPackError {
  readonly name = 'UiContextPackBudgetError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const STYLE_KIND_SET = new Set<string>(UI_CONTEXT_STYLE_KINDS);
const CONSTRAINT_STATUS_SET = new Set<string>(UI_CONSTRAINT_CHECK_STATUSES);
const SEVERITY_SET = new Set<string>(UI_ACCESSIBILITY_SEVERITIES);
const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const VERIFICATION_SET = new Set<string>(GUI_VERIFICATION_STATUS);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const PATH_RE =
  /^(?!\/)(?!\.\.(?:\/|$))(?!.*\/\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._+/-]{0,511}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

const SOURCE_FIELDS = Object.freeze([
  'component_id',
  'content',
  'editable',
  'interface',
  'path',
  'schema_version',
] as const);

const STYLE_FIELDS = Object.freeze([
  'content',
  'interface',
  'path',
  'schema_version',
  'style_kind',
] as const);

const TEST_FIELDS = Object.freeze([
  'content',
  'interface',
  'path',
  'schema_version',
  'test_id',
] as const);

const STATE_MACHINE_FIELDS = Object.freeze([
  'events',
  'initial_state_id',
  'interface',
  'machine_id',
  'schema_version',
  'states',
  'transitions',
] as const);

const FORMAL_FAILURE_FIELDS = Object.freeze([
  'description',
  'interface',
  'invariant_id',
  'schema_version',
  'status',
] as const);

const A11Y_VIOLATION_FIELDS = Object.freeze([
  'description',
  'interface',
  'schema_version',
  'severity',
  'violation_id',
] as const);

const VISUAL_REFERENCE_FIELDS = Object.freeze([
  'artifact_digest',
  'description',
  'interface',
  'schema_version',
] as const);

const SCREENSHOT_DESCRIPTION_FIELDS = Object.freeze([
  'artifact_digest',
  'description',
  'interface',
  'scenario_id',
  'schema_version',
] as const);

const ROUTE_FIELDS = Object.freeze([
  'interface',
  'path',
  'route_id',
  'schema_version',
] as const);

const METRIC_BASELINE_FIELDS = Object.freeze([
  'interface',
  'metric_id',
  'metrics',
  'schema_version',
] as const);

const ACCOUNTING_FIELDS = Object.freeze([
  'capsule_tokens',
  'compression_ratio',
  'interface',
  'ordinary_raw_dependency_tokens',
  'other_context_tokens',
  'raw_source_tokens',
  'schema_version',
  'screenshot_analysis_tokens',
  'source_tokens_replaced_by_capsules',
  'token_budget',
  'total_estimated_prompt_tokens',
] as const);

const PACK_FIELDS = Object.freeze([
  'acceptance_criteria',
  'accessibility_violations',
  'action_bindings',
  'affected_routes',
  'affected_tests',
  'analysis_classification',
  'application_id',
  'artifact_digests',
  'baseline_id',
  'capsule_tokens',
  'child_capsules',
  'compression_ratio',
  'escalation_conditions',
  'excluded_context_explanation',
  'formal_invariant_failures',
  'interface',
  'metric_baseline',
  'objective',
  'ordinary_raw_dependency_tokens',
  'other_context_tokens',
  'pack_id',
  'parent_capsules',
  'raw_source_tokens',
  'raw_sources',
  'schema_version',
  'screen_id',
  'screenshot_analysis_tokens',
  'screenshot_descriptions',
  'source_tokens_replaced_by_capsules',
  'state_machine',
  'styles',
  'token_budget',
  'total_estimated_prompt_tokens',
  'verification_status',
  'visual_references',
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
    throw new UiContextPackDecodeError(
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
    throw new UiContextPackDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiContextPackDecodeError(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_STRING_CHARS) {
    throw new UiContextPackDecodeError(
      `${field} exceeds maximum length of ${MAX_STRING_CHARS}`,
    );
  }
  if (value !== value.trim()) {
    throw new UiContextPackDecodeError(
      `${field} must not have surrounding whitespace`,
    );
  }
  if (value.includes('\0')) {
    throw new UiContextPackDecodeError(`${field} must not contain NUL bytes`);
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null) {
    throw new UiContextPackDecodeError(`${field} must be a string`);
  }
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new UiContextPackDecodeError(`${field} must be a string`);
  }
  if (value === '') return '';
  return requireString(value, field);
}

function requireContentString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new UiContextPackDecodeError(`${field} must be a string`);
  }
  if (value.length > MAX_CONTENT_CHARS) {
    throw new UiContextPackDecodeError(
      `${field} exceeds maximum length of ${MAX_CONTENT_CHARS}`,
    );
  }
  if (value.includes('\0')) {
    throw new UiContextPackDecodeError(`${field} must not contain NUL bytes`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.length > MAX_IDENTIFIER_CHARS || !IDENTIFIER_RE.test(text)) {
    throw new UiContextPackDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requireOptionalIdentifier(value: unknown, field: string): string {
  if (value === null) {
    throw new UiContextPackDecodeError(`${field} must be a string`);
  }
  if (value === undefined || value === '') return '';
  return requireIdentifier(value, field);
}

function requirePath(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!PATH_RE.test(text)) {
    throw new UiContextPackDecodeError(
      `${field} is not a valid repository-relative path`,
    );
  }
  return text;
}

function requireDigest(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!DIGEST_RE.test(text)) {
    throw new UiContextPackDecodeError(`${field} must be a sha256: digest`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UiContextPackDecodeError(`${field} must be a boolean`);
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
    throw new UiContextPackDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_SAFE_INTEGER
  ) {
    throw new UiContextPackDecodeError(
      `${field} must be a non-negative finite integer`,
    );
  }
  return value;
}

function requirePositiveInt(value: unknown, field: string): number {
  const n = requireNonNegativeInt(value, field);
  if (n < 1) {
    throw new UiContextPackDecodeError(`${field} must be >= 1`);
  }
  return n;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UiContextPackDecodeError(`${field} must be a finite number`);
  }
  return value;
}

function requireUniqueTexts(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiContextPackDecodeError(`${field} must be an array`);
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    throw new UiContextPackDecodeError(
      `${field} exceeds maximum of ${MAX_COLLECTION_ITEMS} items`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireString(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiContextPackDecodeError(`${field} must not contain duplicates`);
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

function requireUniqueDigests(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiContextPackDecodeError(`${field} must be an array`);
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    throw new UiContextPackDecodeError(
      `${field} exceeds maximum of ${MAX_COLLECTION_ITEMS} items`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireDigest(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiContextPackDecodeError(`${field} must not contain duplicates`);
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

function requireRecordList<T>(
  value: unknown,
  field: string,
  decode: (raw: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value)) {
    throw new UiContextPackDecodeError(`${field} must be an array`);
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    throw new UiContextPackDecodeError(
      `${field} exceeds maximum of ${MAX_COLLECTION_ITEMS} items`,
    );
  }
  return Object.freeze(value.map((item, index) => {
    try {
      return decode(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new UiContextPackDecodeError(`${field}[${index}]: ${message}`);
    }
  }));
}

function requireClosedJsonValue(value: unknown, field: string): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new UiContextPackDecodeError(`${field} must be a finite number`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      requireClosedJsonValue(item, `${field}[${index}]`),
    );
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof key !== 'string') {
        throw new UiContextPackDecodeError(`${field} keys must be strings`);
      }
      out[key] = requireClosedJsonValue(entry, `${field}.${key}`);
    }
    return out;
  }
  throw new UiContextPackDecodeError(`${field} is not a closed JSON value`);
}

function requireMetricMapping(
  value: unknown,
  field: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    throw new UiContextPackDecodeError(`${field} must be an object`);
  }
  const closed = requireClosedJsonValue(value, field) as Record<string, unknown>;
  for (const name of ['interaction_steps', 'unlabeled_controls'] as const) {
    if (name in closed) {
      const entry = closed[name];
      if (typeof entry !== 'number' || !Number.isInteger(entry)) {
        throw new UiContextPackDecodeError(`${field}.${name} must be an integer`);
      }
    }
  }
  return Object.freeze({ ...closed });
}

// ---------------------------------------------------------------------------
// Nested decoders / makers
// ---------------------------------------------------------------------------

export function decodeUiContextSource(raw: unknown): UiContextSource {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError('UiContextSource must be an object');
  }
  rejectUnknownKeys(raw, SOURCE_FIELDS, 'UiContextSource');
  requireKeys(raw, SOURCE_FIELDS, 'UiContextSource');
  if (raw.interface !== UI_CONTEXT_SOURCE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextSource interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_SOURCE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextSource schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_SOURCE_INTERFACE,
    schema_version: UI_CONTEXT_SOURCE_SCHEMA,
    path: requirePath(raw.path, 'path'),
    content: requireContentString(raw.content, 'content'),
    component_id: requireOptionalIdentifier(raw.component_id, 'component_id'),
    editable: requireBoolean(raw.editable, 'editable'),
  });
}

export function decodeUiContextStyle(raw: unknown): UiContextStyle {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError('UiContextStyle must be an object');
  }
  rejectUnknownKeys(raw, STYLE_FIELDS, 'UiContextStyle');
  requireKeys(raw, STYLE_FIELDS, 'UiContextStyle');
  if (raw.interface !== UI_CONTEXT_STYLE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextStyle interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_STYLE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextStyle schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_STYLE_INTERFACE,
    schema_version: UI_CONTEXT_STYLE_SCHEMA,
    path: requirePath(raw.path, 'path'),
    content: requireContentString(raw.content, 'content'),
    style_kind: requireEnum<UiContextStyleKind>(
      raw.style_kind,
      'style_kind',
      STYLE_KIND_SET,
    ),
  });
}

export function decodeUiContextTest(raw: unknown): UiContextTest {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError('UiContextTest must be an object');
  }
  rejectUnknownKeys(raw, TEST_FIELDS, 'UiContextTest');
  requireKeys(raw, TEST_FIELDS, 'UiContextTest');
  if (raw.interface !== UI_CONTEXT_TEST_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextTest interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_TEST_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextTest schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_TEST_INTERFACE,
    schema_version: UI_CONTEXT_TEST_SCHEMA,
    path: requirePath(raw.path, 'path'),
    content: requireContentString(raw.content, 'content'),
    test_id: requireIdentifier(raw.test_id, 'test_id'),
  });
}

export function decodeUiContextStateMachine(raw: unknown): UiContextStateMachine {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextStateMachine must be an object',
    );
  }
  rejectUnknownKeys(raw, STATE_MACHINE_FIELDS, 'UiContextStateMachine');
  requireKeys(raw, STATE_MACHINE_FIELDS, 'UiContextStateMachine');
  if (raw.interface !== UI_CONTEXT_STATE_MACHINE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextStateMachine interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_STATE_MACHINE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextStateMachine schema_version: ${String(raw.schema_version)}`,
    );
  }
  const states = requireRecordList(raw.states, 'states', decodeUiStateDefinition);
  const events = requireRecordList(raw.events, 'events', decodeUiEventDefinition);
  const transitions = requireRecordList(
    raw.transitions,
    'transitions',
    decodeUiTransitionDefinition,
  );
  if (states.length < 1) {
    throw new UiContextPackDecodeError('states must not be empty');
  }
  if (events.length < 1) {
    throw new UiContextPackDecodeError('events must not be empty');
  }
  if (transitions.length < 1) {
    throw new UiContextPackDecodeError('transitions must not be empty');
  }
  return Object.freeze({
    interface: UI_CONTEXT_STATE_MACHINE_INTERFACE,
    schema_version: UI_CONTEXT_STATE_MACHINE_SCHEMA,
    machine_id: requireIdentifier(raw.machine_id, 'machine_id'),
    initial_state_id: requireIdentifier(raw.initial_state_id, 'initial_state_id'),
    states,
    events,
    transitions,
  });
}

export function decodeUiContextFormalFailure(
  raw: unknown,
): UiContextFormalFailure {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextFormalFailure must be an object',
    );
  }
  rejectUnknownKeys(raw, FORMAL_FAILURE_FIELDS, 'UiContextFormalFailure');
  requireKeys(raw, FORMAL_FAILURE_FIELDS, 'UiContextFormalFailure');
  if (raw.interface !== UI_CONTEXT_FORMAL_FAILURE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextFormalFailure interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_FORMAL_FAILURE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextFormalFailure schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_FORMAL_FAILURE_INTERFACE,
    schema_version: UI_CONTEXT_FORMAL_FAILURE_SCHEMA,
    invariant_id: requireIdentifier(raw.invariant_id, 'invariant_id'),
    status: requireEnum<UiConstraintCheckStatus>(
      raw.status,
      'status',
      CONSTRAINT_STATUS_SET,
    ),
    description: requireString(raw.description, 'description'),
  });
}

export function decodeUiContextAccessibilityViolation(
  raw: unknown,
): UiContextAccessibilityViolation {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextAccessibilityViolation must be an object',
    );
  }
  rejectUnknownKeys(
    raw,
    A11Y_VIOLATION_FIELDS,
    'UiContextAccessibilityViolation',
  );
  requireKeys(raw, A11Y_VIOLATION_FIELDS, 'UiContextAccessibilityViolation');
  if (raw.interface !== UI_CONTEXT_ACCESSIBILITY_VIOLATION_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextAccessibilityViolation interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_ACCESSIBILITY_VIOLATION_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextAccessibilityViolation schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_ACCESSIBILITY_VIOLATION_INTERFACE,
    schema_version: UI_CONTEXT_ACCESSIBILITY_VIOLATION_SCHEMA,
    violation_id: requireIdentifier(raw.violation_id, 'violation_id'),
    severity: requireEnum<UiAccessibilitySeverity>(
      raw.severity,
      'severity',
      SEVERITY_SET,
    ),
    description: requireString(raw.description, 'description'),
  });
}

export function decodeUiContextVisualReference(
  raw: unknown,
): UiContextVisualReference {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextVisualReference must be an object',
    );
  }
  rejectUnknownKeys(raw, VISUAL_REFERENCE_FIELDS, 'UiContextVisualReference');
  requireKeys(raw, VISUAL_REFERENCE_FIELDS, 'UiContextVisualReference');
  if (raw.interface !== UI_CONTEXT_VISUAL_REFERENCE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextVisualReference interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_VISUAL_REFERENCE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextVisualReference schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_VISUAL_REFERENCE_INTERFACE,
    schema_version: UI_CONTEXT_VISUAL_REFERENCE_SCHEMA,
    artifact_digest: requireDigest(raw.artifact_digest, 'artifact_digest'),
    description: requireString(raw.description, 'description'),
  });
}

export function decodeUiContextScreenshotDescription(
  raw: unknown,
): UiContextScreenshotDescription {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextScreenshotDescription must be an object',
    );
  }
  rejectUnknownKeys(
    raw,
    SCREENSHOT_DESCRIPTION_FIELDS,
    'UiContextScreenshotDescription',
  );
  requireKeys(
    raw,
    SCREENSHOT_DESCRIPTION_FIELDS,
    'UiContextScreenshotDescription',
  );
  if (raw.interface !== UI_CONTEXT_SCREENSHOT_DESCRIPTION_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextScreenshotDescription interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_SCREENSHOT_DESCRIPTION_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextScreenshotDescription schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_SCREENSHOT_DESCRIPTION_INTERFACE,
    schema_version: UI_CONTEXT_SCREENSHOT_DESCRIPTION_SCHEMA,
    scenario_id: requireIdentifier(raw.scenario_id, 'scenario_id'),
    artifact_digest: requireDigest(raw.artifact_digest, 'artifact_digest'),
    description: requireString(raw.description, 'description'),
  });
}

export function decodeUiContextRoute(raw: unknown): UiContextRoute {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError('UiContextRoute must be an object');
  }
  rejectUnknownKeys(raw, ROUTE_FIELDS, 'UiContextRoute');
  requireKeys(raw, ROUTE_FIELDS, 'UiContextRoute');
  if (raw.interface !== UI_CONTEXT_ROUTE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextRoute interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_ROUTE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextRoute schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_ROUTE_INTERFACE,
    schema_version: UI_CONTEXT_ROUTE_SCHEMA,
    route_id: requireIdentifier(raw.route_id, 'route_id'),
    path: requireString(raw.path, 'path'),
  });
}

export function decodeUiContextMetricBaseline(
  raw: unknown,
): UiContextMetricBaseline {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextMetricBaseline must be an object',
    );
  }
  rejectUnknownKeys(raw, METRIC_BASELINE_FIELDS, 'UiContextMetricBaseline');
  requireKeys(raw, METRIC_BASELINE_FIELDS, 'UiContextMetricBaseline');
  if (raw.interface !== UI_CONTEXT_METRIC_BASELINE_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextMetricBaseline interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_METRIC_BASELINE_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextMetricBaseline schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_METRIC_BASELINE_INTERFACE,
    schema_version: UI_CONTEXT_METRIC_BASELINE_SCHEMA,
    metric_id: requireIdentifier(raw.metric_id, 'metric_id'),
    metrics: requireMetricMapping(raw.metrics, 'metrics'),
  });
}

export function computeUiContextTokenAccounting(input: {
  raw_source_tokens: number;
  capsule_tokens: number;
  screenshot_analysis_tokens: number;
  other_context_tokens: number;
  source_tokens_replaced_by_capsules: number;
  token_budget: number;
  compression_ratio?: number;
}): UiContextTokenAccounting {
  const raw = requireNonNegativeInt(input.raw_source_tokens, 'raw_source_tokens');
  const cap = requireNonNegativeInt(input.capsule_tokens, 'capsule_tokens');
  const shot = requireNonNegativeInt(
    input.screenshot_analysis_tokens,
    'screenshot_analysis_tokens',
  );
  const other = requireNonNegativeInt(
    input.other_context_tokens,
    'other_context_tokens',
  );
  const replaced = requireNonNegativeInt(
    input.source_tokens_replaced_by_capsules,
    'source_tokens_replaced_by_capsules',
  );
  const budget = requirePositiveInt(input.token_budget, 'token_budget');
  const total = raw + cap + shot + other;
  const ordinary = raw + replaced + shot + other;
  if (ordinary <= 0) {
    throw new UiContextPackDecodeError(
      'ordinary_raw_dependency_tokens must be positive',
    );
  }
  if (total > budget) {
    throw new UiContextPackBudgetError(
      'total_estimated_prompt_tokens cannot exceed token_budget',
    );
  }
  const derived = (ordinary - total) / ordinary;
  if (input.compression_ratio !== undefined) {
    const supplied = requireFiniteNumber(
      input.compression_ratio,
      'compression_ratio',
    );
    if (supplied !== derived) {
      throw new UiContextPackDecodeError(
        'compression_ratio must equal the derived equation exactly',
      );
    }
  }
  return Object.freeze({
    interface: UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE,
    schema_version: UI_CONTEXT_TOKEN_ACCOUNTING_SCHEMA,
    raw_source_tokens: raw,
    capsule_tokens: cap,
    screenshot_analysis_tokens: shot,
    other_context_tokens: other,
    source_tokens_replaced_by_capsules: replaced,
    ordinary_raw_dependency_tokens: ordinary,
    total_estimated_prompt_tokens: total,
    token_budget: budget,
    compression_ratio: derived,
  });
}

export function decodeUiContextTokenAccounting(
  raw: unknown,
): UiContextTokenAccounting {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError(
      'UiContextTokenAccounting must be an object',
    );
  }
  rejectUnknownKeys(raw, ACCOUNTING_FIELDS, 'UiContextTokenAccounting');
  requireKeys(raw, ACCOUNTING_FIELDS, 'UiContextTokenAccounting');
  if (raw.interface !== UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextTokenAccounting interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_TOKEN_ACCOUNTING_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextTokenAccounting schema_version: ${String(raw.schema_version)}`,
    );
  }
  const accounting = computeUiContextTokenAccounting({
    raw_source_tokens: requireNonNegativeInt(
      raw.raw_source_tokens,
      'raw_source_tokens',
    ),
    capsule_tokens: requireNonNegativeInt(raw.capsule_tokens, 'capsule_tokens'),
    screenshot_analysis_tokens: requireNonNegativeInt(
      raw.screenshot_analysis_tokens,
      'screenshot_analysis_tokens',
    ),
    other_context_tokens: requireNonNegativeInt(
      raw.other_context_tokens,
      'other_context_tokens',
    ),
    source_tokens_replaced_by_capsules: requireNonNegativeInt(
      raw.source_tokens_replaced_by_capsules,
      'source_tokens_replaced_by_capsules',
    ),
    token_budget: requirePositiveInt(raw.token_budget, 'token_budget'),
    compression_ratio: requireFiniteNumber(
      raw.compression_ratio,
      'compression_ratio',
    ),
  });
  const ordinary = requirePositiveInt(
    raw.ordinary_raw_dependency_tokens,
    'ordinary_raw_dependency_tokens',
  );
  const total = requireNonNegativeInt(
    raw.total_estimated_prompt_tokens,
    'total_estimated_prompt_tokens',
  );
  if (ordinary !== accounting.ordinary_raw_dependency_tokens) {
    throw new UiContextPackDecodeError(
      'ordinary_raw_dependency_tokens equation mismatch',
    );
  }
  if (total !== accounting.total_estimated_prompt_tokens) {
    throw new UiContextPackDecodeError(
      'total_estimated_prompt_tokens must equal raw+capsule+screenshot+other',
    );
  }
  return accounting;
}

const PACK_REQUIRED_FIELDS = Object.freeze(
  PACK_FIELDS.filter(field => field !== 'compression_ratio'),
);

export function decodeUiContextPack(raw: unknown): UiContextPack {
  if (!isPlainObject(raw)) {
    throw new UiContextPackDecodeError('UiContextPack must be an object');
  }
  rejectUnknownKeys(raw, PACK_FIELDS, 'UiContextPack');
  requireKeys(raw, PACK_REQUIRED_FIELDS, 'UiContextPack');
  if (raw.interface !== UI_CONTEXT_PACK_INTERFACE) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextPack interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CONTEXT_PACK_SCHEMA) {
    throw new UiContextPackDecodeError(
      `unsupported UiContextPack schema_version: ${String(raw.schema_version)}`,
    );
  }
  const accounting = computeUiContextTokenAccounting({
    raw_source_tokens: raw.raw_source_tokens as number,
    capsule_tokens: raw.capsule_tokens as number,
    screenshot_analysis_tokens: raw.screenshot_analysis_tokens as number,
    other_context_tokens: raw.other_context_tokens as number,
    source_tokens_replaced_by_capsules:
      raw.source_tokens_replaced_by_capsules as number,
    token_budget: raw.token_budget as number,
    compression_ratio:
      raw.compression_ratio === undefined
        ? undefined
        : (raw.compression_ratio as number),
  });
  const ordinary = requirePositiveInt(
    raw.ordinary_raw_dependency_tokens,
    'ordinary_raw_dependency_tokens',
  );
  const total = requireNonNegativeInt(
    raw.total_estimated_prompt_tokens,
    'total_estimated_prompt_tokens',
  );
  if (ordinary !== accounting.ordinary_raw_dependency_tokens) {
    throw new UiContextPackDecodeError(
      'ordinary_raw_dependency_tokens equation mismatch',
    );
  }
  if (total !== accounting.total_estimated_prompt_tokens) {
    throw new UiContextPackDecodeError(
      'total_estimated_prompt_tokens must equal raw+capsule+screenshot+other',
    );
  }
  return Object.freeze({
    interface: UI_CONTEXT_PACK_INTERFACE,
    schema_version: UI_CONTEXT_PACK_SCHEMA,
    pack_id: requireIdentifier(raw.pack_id, 'pack_id'),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    objective: requireString(raw.objective, 'objective'),
    baseline_id: requireOptionalIdentifier(raw.baseline_id, 'baseline_id'),
    raw_sources: requireRecordList(
      raw.raw_sources,
      'raw_sources',
      decodeUiContextSource,
    ),
    styles: requireRecordList(raw.styles, 'styles', decodeUiContextStyle),
    affected_tests: requireRecordList(
      raw.affected_tests,
      'affected_tests',
      decodeUiContextTest,
    ),
    parent_capsules: requireRecordList(
      raw.parent_capsules,
      'parent_capsules',
      decodeUiSemanticCapsule,
    ),
    child_capsules: requireRecordList(
      raw.child_capsules,
      'child_capsules',
      decodeUiSemanticCapsule,
    ),
    state_machine: decodeUiContextStateMachine(raw.state_machine),
    formal_invariant_failures: requireRecordList(
      raw.formal_invariant_failures,
      'formal_invariant_failures',
      decodeUiContextFormalFailure,
    ),
    accessibility_violations: requireRecordList(
      raw.accessibility_violations,
      'accessibility_violations',
      decodeUiContextAccessibilityViolation,
    ),
    visual_references: requireRecordList(
      raw.visual_references,
      'visual_references',
      decodeUiContextVisualReference,
    ),
    screenshot_descriptions: requireRecordList(
      raw.screenshot_descriptions,
      'screenshot_descriptions',
      decodeUiContextScreenshotDescription,
    ),
    artifact_digests: requireUniqueDigests(
      raw.artifact_digests,
      'artifact_digests',
    ),
    affected_routes: requireRecordList(
      raw.affected_routes,
      'affected_routes',
      decodeUiContextRoute,
    ),
    action_bindings: requireRecordList(
      raw.action_bindings,
      'action_bindings',
      decodeUiActionBinding,
    ),
    metric_baseline: decodeUiContextMetricBaseline(raw.metric_baseline),
    acceptance_criteria: requireUniqueTexts(
      raw.acceptance_criteria,
      'acceptance_criteria',
    ),
    excluded_context_explanation: requireOptionalString(
      raw.excluded_context_explanation,
      'excluded_context_explanation',
    ),
    escalation_conditions: requireUniqueTexts(
      raw.escalation_conditions,
      'escalation_conditions',
    ),
    raw_source_tokens: accounting.raw_source_tokens,
    capsule_tokens: accounting.capsule_tokens,
    screenshot_analysis_tokens: accounting.screenshot_analysis_tokens,
    other_context_tokens: accounting.other_context_tokens,
    source_tokens_replaced_by_capsules:
      accounting.source_tokens_replaced_by_capsules,
    ordinary_raw_dependency_tokens: accounting.ordinary_raw_dependency_tokens,
    total_estimated_prompt_tokens: accounting.total_estimated_prompt_tokens,
    token_budget: accounting.token_budget,
    compression_ratio: accounting.compression_ratio,
    analysis_classification: requireEnum<GuiAnalysisClassification>(
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

export function makeUiContextSource(partial: {
  path: string;
  content: string;
  component_id?: string;
  editable?: boolean;
}): UiContextSource {
  return decodeUiContextSource({
    interface: UI_CONTEXT_SOURCE_INTERFACE,
    schema_version: UI_CONTEXT_SOURCE_SCHEMA,
    path: partial.path,
    content: partial.content,
    component_id: partial.component_id ?? '',
    editable: partial.editable ?? false,
  });
}

export function makeUiContextStyle(partial: {
  path: string;
  content: string;
  style_kind?: UiContextStyleKind;
}): UiContextStyle {
  return decodeUiContextStyle({
    interface: UI_CONTEXT_STYLE_INTERFACE,
    schema_version: UI_CONTEXT_STYLE_SCHEMA,
    path: partial.path,
    content: partial.content,
    style_kind: partial.style_kind ?? 'css',
  });
}

export function makeUiContextTest(partial: {
  path: string;
  content: string;
  test_id: string;
}): UiContextTest {
  return decodeUiContextTest({
    interface: UI_CONTEXT_TEST_INTERFACE,
    schema_version: UI_CONTEXT_TEST_SCHEMA,
    path: partial.path,
    content: partial.content,
    test_id: partial.test_id,
  });
}

export function makeUiContextStateMachine(partial: {
  machine_id: string;
  initial_state_id: string;
  states: readonly UiStateDefinition[];
  events: readonly UiEventDefinition[];
  transitions: readonly UiTransitionDefinition[];
}): UiContextStateMachine {
  return decodeUiContextStateMachine({
    interface: UI_CONTEXT_STATE_MACHINE_INTERFACE,
    schema_version: UI_CONTEXT_STATE_MACHINE_SCHEMA,
    machine_id: partial.machine_id,
    initial_state_id: partial.initial_state_id,
    states: [...partial.states],
    events: [...partial.events],
    transitions: [...partial.transitions],
  });
}

export function makeUiContextFormalFailure(partial: {
  invariant_id: string;
  status: UiConstraintCheckStatus;
  description: string;
}): UiContextFormalFailure {
  return decodeUiContextFormalFailure({
    interface: UI_CONTEXT_FORMAL_FAILURE_INTERFACE,
    schema_version: UI_CONTEXT_FORMAL_FAILURE_SCHEMA,
    invariant_id: partial.invariant_id,
    status: partial.status,
    description: partial.description,
  });
}

export function makeUiContextAccessibilityViolation(partial: {
  violation_id: string;
  severity: UiAccessibilitySeverity;
  description: string;
}): UiContextAccessibilityViolation {
  return decodeUiContextAccessibilityViolation({
    interface: UI_CONTEXT_ACCESSIBILITY_VIOLATION_INTERFACE,
    schema_version: UI_CONTEXT_ACCESSIBILITY_VIOLATION_SCHEMA,
    violation_id: partial.violation_id,
    severity: partial.severity,
    description: partial.description,
  });
}

export function makeUiContextVisualReference(partial: {
  artifact_digest: string;
  description: string;
}): UiContextVisualReference {
  return decodeUiContextVisualReference({
    interface: UI_CONTEXT_VISUAL_REFERENCE_INTERFACE,
    schema_version: UI_CONTEXT_VISUAL_REFERENCE_SCHEMA,
    artifact_digest: partial.artifact_digest,
    description: partial.description,
  });
}

export function makeUiContextScreenshotDescription(partial: {
  scenario_id: string;
  artifact_digest: string;
  description: string;
}): UiContextScreenshotDescription {
  return decodeUiContextScreenshotDescription({
    interface: UI_CONTEXT_SCREENSHOT_DESCRIPTION_INTERFACE,
    schema_version: UI_CONTEXT_SCREENSHOT_DESCRIPTION_SCHEMA,
    scenario_id: partial.scenario_id,
    artifact_digest: partial.artifact_digest,
    description: partial.description,
  });
}

export function makeUiContextRoute(partial: {
  route_id: string;
  path: string;
}): UiContextRoute {
  return decodeUiContextRoute({
    interface: UI_CONTEXT_ROUTE_INTERFACE,
    schema_version: UI_CONTEXT_ROUTE_SCHEMA,
    route_id: partial.route_id,
    path: partial.path,
  });
}

export function makeUiContextMetricBaseline(partial: {
  metric_id: string;
  metrics?: Readonly<Record<string, unknown>>;
}): UiContextMetricBaseline {
  return decodeUiContextMetricBaseline({
    interface: UI_CONTEXT_METRIC_BASELINE_INTERFACE,
    schema_version: UI_CONTEXT_METRIC_BASELINE_SCHEMA,
    metric_id: partial.metric_id,
    metrics: { ...(partial.metrics ?? {}) },
  });
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
      throw new UiContextPackError('canonical JSON rejects non-finite numbers');
    }
    if (Object.is(value, -0) || value === 0) return '0';
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
  throw new UiContextPackError(`canonical JSON cannot encode ${typeof value}`);
}

function uiStateDefinitionToDict(
  state: UiStateDefinition,
): Record<string, unknown> {
  return {
    description: state.description,
    interface: state.interface,
    is_initial: state.is_initial,
    is_terminal: state.is_terminal,
    kind: state.kind,
    label: state.label,
    schema_version: state.schema_version,
    screen_id: state.screen_id,
    state_id: state.state_id,
  };
}

function uiEventDefinitionToDict(
  event: UiEventDefinition,
): Record<string, unknown> {
  return {
    description: event.description,
    event_id: event.event_id,
    interface: event.interface,
    kind: event.kind,
    name: event.name,
    schema_version: event.schema_version,
  };
}

function uiTransitionDefinitionToDict(
  transition: UiTransitionDefinition,
): Record<string, unknown> {
  return {
    effect_ids: [...transition.effect_ids],
    event_id: transition.event_id,
    from_state_id: transition.from_state_id,
    guard: transition.guard,
    interface: transition.interface,
    is_noop: transition.is_noop,
    schema_version: transition.schema_version,
    to_state_id: transition.to_state_id,
    transition_id: transition.transition_id,
  };
}

export function uiContextStateMachineToDict(
  machine: UiContextStateMachine,
): Record<string, unknown> {
  return {
    events: machine.events.map(uiEventDefinitionToDict),
    initial_state_id: machine.initial_state_id,
    interface: machine.interface,
    machine_id: machine.machine_id,
    schema_version: machine.schema_version,
    states: machine.states.map(uiStateDefinitionToDict),
    transitions: machine.transitions.map(uiTransitionDefinitionToDict),
  };
}

export function uiActionBindingToDict(
  binding: UiActionBinding,
): Record<string, unknown> {
  return {
    action_id: binding.action_id,
    component_id: binding.component_id,
    confirmation_id: binding.confirmation_id,
    depends_on_schema: binding.depends_on_schema,
    interface: binding.interface,
    is_destructive: binding.is_destructive,
    method: binding.method,
    policy_id: binding.policy_id,
    requires_confirmation: binding.requires_confirmation,
    schema_id: binding.schema_id,
    schema_version: binding.schema_version,
  };
}

export function uiContextPackToDict(
  pack: UiContextPack,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    acceptance_criteria: [...pack.acceptance_criteria],
    accessibility_violations: pack.accessibility_violations.map(item => ({
      description: item.description,
      interface: item.interface,
      schema_version: item.schema_version,
      severity: item.severity,
      violation_id: item.violation_id,
    })),
    action_bindings: pack.action_bindings.map(uiActionBindingToDict),
    affected_routes: pack.affected_routes.map(item => ({
      interface: item.interface,
      path: item.path,
      route_id: item.route_id,
      schema_version: item.schema_version,
    })),
    affected_tests: pack.affected_tests.map(item => ({
      content: item.content,
      interface: item.interface,
      path: item.path,
      schema_version: item.schema_version,
      test_id: item.test_id,
    })),
    analysis_classification: pack.analysis_classification,
    application_id: pack.application_id,
    artifact_digests: [...pack.artifact_digests],
    baseline_id: pack.baseline_id,
    capsule_tokens: pack.capsule_tokens,
    child_capsules: pack.child_capsules.map(uiSemanticCapsuleToDict),
    compression_ratio: pack.compression_ratio,
    escalation_conditions: [...pack.escalation_conditions],
    excluded_context_explanation: pack.excluded_context_explanation,
    formal_invariant_failures: pack.formal_invariant_failures.map(item => ({
      description: item.description,
      interface: item.interface,
      invariant_id: item.invariant_id,
      schema_version: item.schema_version,
      status: item.status,
    })),
    interface: pack.interface,
    metric_baseline: {
      interface: pack.metric_baseline.interface,
      metric_id: pack.metric_baseline.metric_id,
      metrics: { ...pack.metric_baseline.metrics },
      schema_version: pack.metric_baseline.schema_version,
    },
    objective: pack.objective,
    ordinary_raw_dependency_tokens: pack.ordinary_raw_dependency_tokens,
    other_context_tokens: pack.other_context_tokens,
    pack_id: pack.pack_id,
    parent_capsules: pack.parent_capsules.map(uiSemanticCapsuleToDict),
    raw_source_tokens: pack.raw_source_tokens,
    raw_sources: pack.raw_sources.map(item => ({
      component_id: item.component_id,
      content: item.content,
      editable: item.editable,
      interface: item.interface,
      path: item.path,
      schema_version: item.schema_version,
    })),
    schema_version: pack.schema_version,
    screen_id: pack.screen_id,
    screenshot_analysis_tokens: pack.screenshot_analysis_tokens,
    screenshot_descriptions: pack.screenshot_descriptions.map(item => ({
      artifact_digest: item.artifact_digest,
      description: item.description,
      interface: item.interface,
      scenario_id: item.scenario_id,
      schema_version: item.schema_version,
    })),
    source_tokens_replaced_by_capsules: pack.source_tokens_replaced_by_capsules,
    state_machine: uiContextStateMachineToDict(pack.state_machine),
    styles: pack.styles.map(item => ({
      content: item.content,
      interface: item.interface,
      path: item.path,
      schema_version: item.schema_version,
      style_kind: item.style_kind,
    })),
    token_budget: pack.token_budget,
    total_estimated_prompt_tokens: pack.total_estimated_prompt_tokens,
    verification_status: pack.verification_status,
    visual_references: pack.visual_references.map(item => ({
      artifact_digest: item.artifact_digest,
      description: item.description,
      interface: item.interface,
      schema_version: item.schema_version,
    })),
  });
}

export function serializeUiContextPack(pack: UiContextPack): string {
  return canonicalJson(uiContextPackToDict(pack));
}

export function contextPackDigest(pack: UiContextPack): string {
  return `sha256:${sha256Hex(serializeUiContextPack(pack))}`;
}

export function uiContextTokenAccountingToDict(
  accounting: UiContextTokenAccounting,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    capsule_tokens: accounting.capsule_tokens,
    compression_ratio: accounting.compression_ratio,
    interface: accounting.interface,
    ordinary_raw_dependency_tokens: accounting.ordinary_raw_dependency_tokens,
    other_context_tokens: accounting.other_context_tokens,
    raw_source_tokens: accounting.raw_source_tokens,
    schema_version: accounting.schema_version,
    screenshot_analysis_tokens: accounting.screenshot_analysis_tokens,
    source_tokens_replaced_by_capsules:
      accounting.source_tokens_replaced_by_capsules,
    token_budget: accounting.token_budget,
    total_estimated_prompt_tokens: accounting.total_estimated_prompt_tokens,
  });
}

export function uiContextTokenAccountingFromPack(
  pack: UiContextPack,
): UiContextTokenAccounting {
  return computeUiContextTokenAccounting({
    raw_source_tokens: pack.raw_source_tokens,
    capsule_tokens: pack.capsule_tokens,
    screenshot_analysis_tokens: pack.screenshot_analysis_tokens,
    other_context_tokens: pack.other_context_tokens,
    source_tokens_replaced_by_capsules: pack.source_tokens_replaced_by_capsules,
    token_budget: pack.token_budget,
    compression_ratio: pack.compression_ratio,
  });
}

export function serializeUiContextTokenAccounting(
  accounting: UiContextTokenAccounting,
): string {
  return canonicalJson(uiContextTokenAccountingToDict(accounting));
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

export function estimateContextTokens(text: string): number {
  if (typeof text !== 'string') {
    throw new UiContextPackError('estimateContextTokens requires a string');
  }
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CONTEXT_TOKEN_CHARS_PER_TOKEN);
}

export function estimateCanonicalTokens(value: unknown): number {
  return estimateContextTokens(canonicalJson(value));
}

function estimateSourceTokens(source: Pick<UiContextSource, 'content'>): number {
  return estimateContextTokens(source.content);
}

function estimateCapsuleTokens(capsule: UiSemanticCapsule): number {
  return estimateContextTokens(serializeUiSemanticCapsule(capsule));
}

function estimateScreenshotTokens(
  visualReferences: readonly UiContextVisualReference[],
  screenshotDescriptions: readonly UiContextScreenshotDescription[],
): number {
  let total = 0;
  for (const ref of visualReferences) {
    total += estimateContextTokens(ref.description);
    total += estimateContextTokens(ref.artifact_digest);
  }
  for (const shot of screenshotDescriptions) {
    total += estimateContextTokens(shot.description);
    total += estimateContextTokens(shot.artifact_digest);
    total += estimateContextTokens(shot.scenario_id);
  }
  return total;
}

function estimateOtherTokens(input: {
  objective: string;
  styles: readonly UiContextStyle[];
  tests: readonly UiContextTest[];
  stateMachine: UiContextStateMachine;
  failures: readonly UiContextFormalFailure[];
  violations: readonly UiContextAccessibilityViolation[];
  routes: readonly UiContextRoute[];
  bindings: readonly UiActionBinding[];
  metricBaseline: UiContextMetricBaseline;
  acceptance: readonly string[];
  exclusion: string;
  escalation: readonly string[];
  artifactDigests: readonly string[];
}): number {
  let total = estimateContextTokens(input.objective);
  for (const style of input.styles) {
    total += estimateContextTokens(style.content);
    total += estimateContextTokens(style.path);
  }
  for (const test of input.tests) {
    total += estimateContextTokens(test.content);
    total += estimateContextTokens(test.path);
    total += estimateContextTokens(test.test_id);
  }
  total += estimateCanonicalTokens(uiContextStateMachineToDict(input.stateMachine));
  for (const failure of input.failures) {
    total += estimateContextTokens(failure.invariant_id);
    total += estimateContextTokens(failure.description);
  }
  for (const violation of input.violations) {
    total += estimateContextTokens(violation.violation_id);
    total += estimateContextTokens(violation.description);
  }
  for (const route of input.routes) {
    total += estimateContextTokens(route.route_id);
    total += estimateContextTokens(route.path);
  }
  for (const binding of input.bindings) {
    total += estimateCanonicalTokens(uiActionBindingToDict(binding));
  }
  total += estimateCanonicalTokens({
    interface: input.metricBaseline.interface,
    metric_id: input.metricBaseline.metric_id,
    metrics: input.metricBaseline.metrics,
    schema_version: input.metricBaseline.schema_version,
  });
  for (const item of input.acceptance) total += estimateContextTokens(item);
  total += estimateContextTokens(input.exclusion);
  for (const item of input.escalation) total += estimateContextTokens(item);
  for (const digest of input.artifactDigests) {
    total += estimateContextTokens(digest);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function compareId(a: string, b: string): number {
  return a.localeCompare(b);
}

function capsuleComponentIds(capsule: UiSemanticCapsule): string[] {
  return sortedUnique([
    capsule.capsule_id,
    capsule.stable_identity.qualified_name,
  ]);
}

function capsuleMatches(capsule: UiSemanticCapsule, componentId: string): boolean {
  if (!componentId) return false;
  return (
    capsule.capsule_id === componentId ||
    capsule.stable_identity.qualified_name === componentId
  );
}

function isStaleCapsule(capsule: UiSemanticCapsule): boolean {
  return (
    capsule.verification_status === 'stale' ||
    capsule.verification_status === 'invalid'
  );
}

function isOpaqueCapsule(capsule: UiSemanticCapsule): boolean {
  return (
    capsule.analysis_classification === 'opaque' ||
    capsule.analysis_classification === 'heuristic'
  );
}

function isUnresolvedResolution(
  resolution: GuiContextBindingResolution['resolution'] | undefined,
): boolean {
  return (
    resolution === 'unresolved' ||
    resolution === 'ambiguous' ||
    resolution === 'dynamic'
  );
}

function inferStyleKind(path: string, fallback?: string): UiContextStyleKind {
  if (fallback && STYLE_KIND_SET.has(fallback)) {
    return fallback as UiContextStyleKind;
  }
  if (/(^|\/)tokens?\//i.test(path) || /token/i.test(path)) return 'design-token';
  if (path.endsWith('.css')) return 'css';
  if (/\.(scss|sass|less)$/i.test(path)) return 'stylesheet';
  return 'other';
}

function asContextStateMachine(
  raw: UiContextStateMachine | UiStateMachine | unknown,
): UiContextStateMachine {
  if (!raw || typeof raw !== 'object') {
    throw new UiContextPackError('state_machine is required');
  }
  const record = raw as Record<string, unknown>;
  if (record.interface === UI_CONTEXT_STATE_MACHINE_INTERFACE) {
    return decodeUiContextStateMachine(raw);
  }
  const states = Array.isArray(record.states) ? record.states : [];
  const events = Array.isArray(record.events) ? record.events : [];
  const transitions = Array.isArray(record.transitions)
    ? record.transitions
    : [];
  const machineId =
    typeof record.machine_id === 'string' && record.machine_id
      ? record.machine_id
      : 'sm:context';
  const initial =
    typeof record.initial_state_id === 'string' && record.initial_state_id
      ? record.initial_state_id
      : '';
  return decodeUiContextStateMachine({
    interface: UI_CONTEXT_STATE_MACHINE_INTERFACE,
    schema_version: UI_CONTEXT_STATE_MACHINE_SCHEMA,
    machine_id: machineId,
    initial_state_id: initial,
    states,
    events,
    transitions,
  });
}

function neighbors(
  edges: readonly UiInvalidationEdge[],
  seeds: ReadonlySet<string>,
  direction: 'outgoing' | 'incoming',
  relationFilter?: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (relationFilter && !relationFilter.has(String(edge.relation))) continue;
    const from =
      direction === 'outgoing'
        ? edge.source_component_id
        : edge.target_component_id;
    const to =
      direction === 'outgoing'
        ? edge.target_component_id
        : edge.source_component_id;
    if (!from || !to || !seeds.has(from)) continue;
    ids.add(to);
  }
  return ids;
}

function belongsToTargetScreen(
  item: {
    application_id?: string;
    screen_id?: string;
  },
  applicationId: string,
  screenId: string,
): boolean {
  if (item.application_id && item.application_id !== applicationId) return false;
  if (item.screen_id && item.screen_id !== screenId) return false;
  return true;
}

function resolveRequest(
  repositoryState: GuiContextRepositoryState | GuiContextPackRequest,
  applicationId?: string,
  screenId?: string,
  objective?: string,
  tokenBudget?: number,
  baseline?: GuiContextBaselineInput | null,
  violations?: GuiContextViolationsInput | null,
): GuiContextPackRequest {
  if (
    repositoryState &&
    typeof repositoryState === 'object' &&
    'repository_state' in repositoryState &&
    (repositoryState as GuiContextPackRequest).repository_state &&
    typeof (repositoryState as GuiContextPackRequest).application_id ===
      'string'
  ) {
    const request = repositoryState as GuiContextPackRequest;
    return {
      ...request,
      application_id: applicationId ?? request.application_id,
      screen_id: screenId ?? request.screen_id,
      objective: objective ?? request.objective,
      token_budget: tokenBudget ?? request.token_budget,
      baseline: baseline === undefined ? request.baseline : baseline,
      violations: violations === undefined ? request.violations : violations,
    };
  }
  if (
    applicationId === undefined ||
    screenId === undefined ||
    objective === undefined ||
    tokenBudget === undefined
  ) {
    throw new UiContextPackError(
      'build_gui_context_pack requires application_id, screen_id, objective, and token_budget',
    );
  }
  return {
    repository_state: repositoryState as GuiContextRepositoryState,
    application_id: applicationId,
    screen_id: screenId,
    objective,
    token_budget: tokenBudget,
    baseline: baseline ?? null,
    violations: violations ?? null,
  };
}

function derivePackId(request: GuiContextPackRequest): string {
  if (request.pack_id) return requireIdentifier(request.pack_id, 'pack_id');
  const revision = request.repository_state.revision ?? '';
  const digest = sha256Hex(
    canonicalJson({
      application_id: request.application_id,
      objective: request.objective,
      revision,
      screen_id: request.screen_id,
      token_budget: request.token_budget,
    }),
  );
  return `pack:${digest.slice(0, 32)}`;
}

function resolveVerificationStatus(input: {
  requested?: GuiVerificationStatus;
  opaque: boolean;
  stale: boolean;
}): GuiVerificationStatus {
  const requested = input.requested ?? 'unverified';
  if (requested === 'stale' || input.stale) return 'stale';
  if (requested === 'invalid') return 'invalid';
  if (requested === 'simulated') return 'simulated';
  if (input.opaque && requested === 'verified') return 'unverified';
  if (requested === 'verified' && input.opaque) return 'unverified';
  return requested;
}

// ---------------------------------------------------------------------------
// Pack construction
// ---------------------------------------------------------------------------

interface SourceNeed {
  reasons: Set<UiContextSourceInclusionReason>;
}

interface WorkingPack {
  rawSources: UiContextSource[];
  styles: UiContextStyle[];
  tests: UiContextTest[];
  parentCapsules: UiSemanticCapsule[];
  childCapsules: UiSemanticCapsule[];
  visualReferences: UiContextVisualReference[];
  screenshotDescriptions: UiContextScreenshotDescription[];
  artifactDigests: string[];
  exclusion: UiContextExclusionRecord[];
  inclusion: UiContextInclusionRecord[];
  rejected: { capsule_id: string; reason: UiContextCapsuleRejectionReason }[];
}

function locateSource(
  sources: readonly GuiContextSourceInput[],
  componentId: string,
  path?: string,
): GuiContextSourceInput | undefined {
  if (path) {
    const byPath = sources.find(source => source.path === path);
    if (byPath) return byPath;
  }
  if (componentId) {
    return sources.find(source => source.component_id === componentId);
  }
  return undefined;
}

export function sourceRequiresRawInclusion(
  reasons: Iterable<UiContextSourceInclusionReason>,
): boolean {
  for (const reason of reasons) {
    if (
      (UI_CONTEXT_SOURCE_INCLUSION_REASONS as readonly string[]).includes(reason)
    ) {
      return true;
    }
  }
  return false;
}

function buildWorkingPack(request: GuiContextPackRequest): {
  working: WorkingPack;
  stateMachine: UiContextStateMachine;
  failures: UiContextFormalFailure[];
  violations: UiContextAccessibilityViolation[];
  routes: UiContextRoute[];
  bindings: UiActionBinding[];
  metricBaseline: UiContextMetricBaseline;
  acceptance: string[];
  escalation: string[];
  analysis: GuiAnalysisClassification;
  verification: GuiVerificationStatus;
  baselineId: string;
  replacedByComponent: Map<string, number>;
  requiredVisualDigests: Set<string>;
  requiredScreenshotKeys: Set<string>;
} {
  const state = request.repository_state;
  const applicationId = requireIdentifier(
    request.application_id,
    'application_id',
  );
  const screenId = requireIdentifier(request.screen_id, 'screen_id');
  const objective = requireString(request.objective, 'objective');
  requirePositiveInt(request.token_budget, 'token_budget');

  if (!Array.isArray(state.sources)) {
    throw new UiContextPackError('repository_state.sources must be an array');
  }

  const plan = request.invalidation_plan ?? state.invalidation_plan;
  const changeSet = request.change_set ?? state.change_set;
  const baseline = request.baseline ?? null;
  const violationInput = request.violations ?? null;
  const edges = state.edges ?? [];
  const capsules = [...(state.capsules ?? [])];

  const editablePaths = new Set<string>(changeSet?.file_paths ?? []);
  const affectedComponents = new Set<string>([
    ...(changeSet?.component_ids ?? []),
    ...(plan?.affected_component_ids ?? []),
  ]);
  const affectedTests = new Set<string>(plan?.affected_check_ids ?? []);

  const sourceNeeds = new Map<string, SourceNeed>();
  const markNeed = (
    key: string,
    reason: UiContextSourceInclusionReason,
  ): void => {
    if (!key) return;
    const existing = sourceNeeds.get(key) ?? { reasons: new Set() };
    existing.reasons.add(reason);
    sourceNeeds.set(key, existing);
  };

  for (const source of state.sources) {
    if (source.editable || editablePaths.has(source.path)) {
      markNeed(source.path, 'editable_target');
      if (source.component_id) {
        affectedComponents.add(source.component_id);
        markNeed(source.component_id, 'editable_target');
      }
    }
    if (source.opaque) {
      markNeed(source.path, 'opaque_component');
      if (source.component_id) markNeed(source.component_id, 'opaque_component');
    }
    if (source.stale) {
      markNeed(source.path, 'stale_component');
      if (source.component_id) markNeed(source.component_id, 'stale_component');
    }
    if (source.unresolved) {
      markNeed(source.path, 'unresolved_binding');
      if (source.component_id) markNeed(source.component_id, 'unresolved_binding');
    }
    if (source.failure_point) {
      markNeed(source.path, 'failure_point');
      if (source.component_id) markNeed(source.component_id, 'failure_point');
    }
    if (source.component_id && affectedComponents.has(source.component_id)) {
      markNeed(source.path, 'editable_target');
      markNeed(source.component_id, 'editable_target');
    }
  }

  const resolutions = [
    ...(state.binding_resolutions ?? []),
    ...(violationInput?.unresolved_bindings ?? []),
  ];
  for (const binding of resolutions) {
    if (!isUnresolvedResolution(binding.resolution)) continue;
    if (binding.component_id) {
      affectedComponents.add(binding.component_id);
      markNeed(binding.component_id, 'unresolved_binding');
    }
    if (binding.path) markNeed(binding.path, 'unresolved_binding');
  }

  const failureInputs = [
    ...(violationInput?.formal_invariant_failures ?? []),
  ];
  const a11yInputs = [...(violationInput?.accessibility_violations ?? [])];
  const visualInputs = [
    ...(violationInput?.visual_failures ?? []),
    ...(baseline?.visual_references ?? []),
    ...(state.visual_references ?? []),
  ];
  const screenshotInputs = [
    ...(baseline?.screenshot_descriptions ?? []),
    ...(state.screenshots ?? []),
  ];

  for (const failure of failureInputs) {
    if (failure.component_id) {
      affectedComponents.add(failure.component_id);
      markNeed(failure.component_id, 'failure_point');
    }
    if (failure.path) markNeed(failure.path, 'failure_point');
  }
  for (const violation of a11yInputs) {
    if (violation.component_id) {
      affectedComponents.add(violation.component_id);
      markNeed(violation.component_id, 'failure_point');
    }
    if (violation.path) markNeed(violation.path, 'failure_point');
  }
  for (const visual of visualInputs) {
    if (visual.implementation_dependent) {
      if (visual.component_id) {
        affectedComponents.add(visual.component_id);
        markNeed(visual.component_id, 'implementation_visual_failure');
      }
      if (visual.path) markNeed(visual.path, 'implementation_visual_failure');
    }
  }

  const working: WorkingPack = {
    rawSources: [],
    styles: [],
    tests: [],
    parentCapsules: [],
    childCapsules: [],
    visualReferences: [],
    screenshotDescriptions: [],
    artifactDigests: [],
    exclusion: [],
    inclusion: [],
    rejected: [],
  };

  let sawOpaque = false;
  let sawStale = false;
  const confidences: GuiExtractionConfidence[] = [];
  if (plan?.confidence) confidences.push(plan.confidence);

  const rejectedCapsuleIds = new Set<string>();
  const usableCapsules: UiSemanticCapsule[] = [];
  for (const capsule of capsules) {
    const decoded =
      capsule.interface === 'UiSemanticCapsule@1'
        ? capsule
        : decodeUiSemanticCapsule(capsule);
    if (
      decoded.application_id &&
      decoded.application_id !== applicationId
    ) {
      working.exclusion.push({
        subject_id: decoded.capsule_id,
        reason: `Unrelated application capsule ${decoded.capsule_id} is excluded.`,
      });
      continue;
    }
    if (decoded.screen_id && decoded.screen_id !== screenId) {
      working.exclusion.push({
        subject_id: decoded.capsule_id,
        reason: `Unrelated screen capsule ${decoded.capsule_id} is excluded.`,
      });
      continue;
    }
    confidences.push(decoded.analysis_classification);
    if (isOpaqueCapsule(decoded)) {
      sawOpaque = true;
      for (const id of capsuleComponentIds(decoded)) {
        markNeed(id, 'opaque_component');
      }
    }
    if (decoded.unresolved_dynamic_behavior.length > 0) {
      for (const id of capsuleComponentIds(decoded)) {
        markNeed(id, 'unresolved_binding');
      }
    }
    if (decoded.known_violation_ids.length > 0) {
      for (const id of capsuleComponentIds(decoded)) {
        markNeed(id, 'failure_point');
      }
    }
    if (isStaleCapsule(decoded)) {
      sawStale = true;
      rejectedCapsuleIds.add(decoded.capsule_id);
      working.rejected.push({
        capsule_id: decoded.capsule_id,
        reason: decoded.verification_status === 'invalid'
          ? 'invalid_capsule'
          : 'stale_capsule',
      });
      working.exclusion.push({
        subject_id: decoded.capsule_id,
        reason: `Stale capsule ${decoded.capsule_id} is rejected and cannot substitute for source.`,
      });
      for (const id of capsuleComponentIds(decoded)) {
        markNeed(id, 'stale_component');
      }
      continue;
    }
    usableCapsules.push(decoded);
  }

  const mandatoryRaw = new Map<string, GuiContextSourceInput>();
  const addMandatoryRaw = (
    source: GuiContextSourceInput,
    reasons: Iterable<UiContextSourceInclusionReason>,
  ): void => {
    if (
      !belongsToTargetScreen(source, applicationId, screenId)
    ) {
      working.exclusion.push({
        subject_id: source.path,
        reason: `Unrelated application or screen source ${source.path} is excluded.`,
      });
      return;
    }
    mandatoryRaw.set(source.path, source);
    for (const reason of reasons) {
      working.inclusion.push({
        subject_id: source.component_id || source.path,
        reason,
        detail: `Raw source ${source.path} included because ${reason.replace(/_/g, ' ')}.`,
      });
    }
  };

  for (const [key, need] of sourceNeeds) {
    if (!sourceRequiresRawInclusion(need.reasons)) continue;
    const found = locateSource(
      state.sources,
      key,
      key.includes('/') ? key : undefined,
    );
    if (found) addMandatoryRaw(found, need.reasons);
  }

  for (const source of state.sources) {
    const need =
      sourceNeeds.get(source.path) ??
      (source.component_id ? sourceNeeds.get(source.component_id) : undefined);
    if (need && sourceRequiresRawInclusion(need.reasons)) {
      if (!mandatoryRaw.has(source.path)) addMandatoryRaw(source, need.reasons);
    }
  }

  const missingNeedKeys = [...sourceNeeds.entries()]
    .filter(([key, need]) => {
      if (!sourceRequiresRawInclusion(need.reasons)) return false;
      return ![...mandatoryRaw.values()].some(
        item => item.path === key || item.component_id === key,
      );
    })
    .map(([key, need]) => ({ key, need }));
  const criticalMissing = missingNeedKeys.filter(item => {
    if (item.key.startsWith('capsule:')) return false;
    return true;
  });
  if (criticalMissing.length > 0) {
    const first = criticalMissing[0];
    throw new UiContextPackError(
      `raw source required for ${[...first.need.reasons].sort().join(',')} ${first.key} but no source was provided`,
    );
  }

  working.rawSources = [...mandatoryRaw.values()]
    .sort((a, b) => compareId(a.path, b.path))
    .map(source =>
      makeUiContextSource({
        path: source.path,
        content: source.content,
        component_id: source.component_id ?? '',
        editable:
          source.editable === true ||
          editablePaths.has(source.path) ||
          (source.component_id
            ? affectedComponents.has(source.component_id)
            : false),
      }),
    );

  const rawComponentIds = new Set(
    working.rawSources.map(source => source.component_id).filter(Boolean),
  );
  const rawPaths = new Set(working.rawSources.map(source => source.path));

  const seedIds = new Set<string>([
    ...affectedComponents,
    ...[...rawComponentIds],
  ]);
  const parentIds = neighbors(edges, seedIds, 'incoming', CONSUMER_RELATIONS);
  const childIds = neighbors(edges, seedIds, 'outgoing', CONSUMER_RELATIONS);
  for (const capsule of usableCapsules) {
    for (const child of capsule.child_component_ids) {
      if (seedIds.has(capsule.stable_identity.qualified_name) || seedIds.has(capsule.capsule_id)) {
        childIds.add(child);
      }
      if (seedIds.has(child)) {
        parentIds.add(capsule.stable_identity.qualified_name);
        parentIds.add(capsule.capsule_id);
      }
    }
  }

  const replacedByComponent = new Map<string, number>();
  const usedCapsuleIds = new Set<string>();

  const considerCapsule = (
    capsule: UiSemanticCapsule,
    role: 'parent' | 'child',
  ): void => {
    if (usedCapsuleIds.has(capsule.capsule_id)) return;
    if (rejectedCapsuleIds.has(capsule.capsule_id)) return;
    const ids = capsuleComponentIds(capsule);
    const requiresRaw = ids.some(id => {
      const need = sourceNeeds.get(id);
      return need ? sourceRequiresRawInclusion(need.reasons) : false;
    });
    if (requiresRaw) {
      // Capsule may accompany raw source for opaque components, but never
      // replaces it. Keep it only as optional compact context.
      if (role === 'parent') working.parentCapsules.push(capsule);
      else working.childCapsules.push(capsule);
      usedCapsuleIds.add(capsule.capsule_id);
      working.inclusion.push({
        subject_id: capsule.capsule_id,
        reason: 'unchanged_capsule',
        detail: `${role} capsule ${capsule.capsule_id} accompanies mandatory raw source.`,
      });
      return;
    }
    if (role === 'parent') working.parentCapsules.push(capsule);
    else working.childCapsules.push(capsule);
    usedCapsuleIds.add(capsule.capsule_id);
    working.inclusion.push({
      subject_id: capsule.capsule_id,
      reason: 'unchanged_capsule',
      detail: `Unchanged ${role} capsule ${capsule.capsule_id} substitutes for raw dependency source.`,
    });
    const source = ids
      .map(id => locateSource(state.sources, id))
      .find((item): item is GuiContextSourceInput => Boolean(item));
    if (source && !rawPaths.has(source.path)) {
      replacedByComponent.set(
        capsule.capsule_id,
        estimateContextTokens(source.content),
      );
    }
  };

  for (const capsule of usableCapsules.sort((a, b) =>
    compareId(a.capsule_id, b.capsule_id),
  )) {
    const ids = capsuleComponentIds(capsule);
    const isParent =
      ids.some(id => parentIds.has(id)) ||
      capsule.child_component_ids.some(id => seedIds.has(id));
    const isChild =
      ids.some(id => childIds.has(id)) ||
      [...seedIds].some(seed => {
        const host = usableCapsules.find(item => capsuleMatches(item, seed));
        return host?.child_component_ids.some(id => ids.includes(id)) ?? false;
      });
    if (isParent) considerCapsule(capsule, 'parent');
    else if (isChild) considerCapsule(capsule, 'child');
    else {
      working.exclusion.push({
        subject_id: capsule.capsule_id,
        reason: `Capsule ${capsule.capsule_id} is outside the parent/child closure and is omitted.`,
      });
    }
  }

  const styleTargets = new Set<string>([
    ...seedIds,
    ...neighbors(edges, seedIds, 'outgoing', STYLE_RELATIONS),
    ...neighbors(edges, seedIds, 'incoming', STYLE_RELATIONS),
  ]);
  for (const style of state.styles ?? []) {
    if (!belongsToTargetScreen(style, applicationId, screenId)) {
      working.exclusion.push({
        subject_id: style.path,
        reason: `Unrelated style ${style.path} belongs to another application or screen and is omitted.`,
      });
      continue;
    }
    const relevant =
      style.relevant === true ||
      editablePaths.has(style.path) ||
      (style.component_id ? styleTargets.has(style.component_id) : seedIds.size === 0);
    if (!relevant && style.component_id && !styleTargets.has(style.component_id)) {
      working.exclusion.push({
        subject_id: style.path,
        reason: `Style ${style.path} is outside the affected style/token closure and is omitted.`,
      });
      continue;
    }
    working.styles.push(
      makeUiContextStyle({
        path: style.path,
        content: style.content,
        style_kind: inferStyleKind(style.path, style.style_kind),
      }),
    );
  }
  working.styles.sort((a, b) => compareId(a.path, b.path));

  const testTargets = new Set<string>([
    ...affectedTests,
    ...neighbors(edges, seedIds, 'outgoing', TEST_RELATIONS),
  ]);
  for (const capsule of usableCapsules) {
    if (
      seedIds.has(capsule.capsule_id) ||
      seedIds.has(capsule.stable_identity.qualified_name)
    ) {
      for (const testId of capsule.test_ids) testTargets.add(testId);
    }
  }
  for (const test of state.tests ?? []) {
    if (!belongsToTargetScreen(test, applicationId, screenId)) {
      working.exclusion.push({
        subject_id: test.test_id,
        reason: `Unrelated test ${test.test_id} belongs to another application or screen and is omitted.`,
      });
      continue;
    }
    const relevant =
      testTargets.has(test.test_id) ||
      (test.component_id ? seedIds.has(test.component_id) : testTargets.size === 0) ||
      editablePaths.has(test.path);
    if (!relevant) {
      working.exclusion.push({
        subject_id: test.test_id,
        reason: `Test ${test.test_id} is outside the affected test closure and is omitted.`,
      });
      continue;
    }
    working.tests.push(
      makeUiContextTest({
        path: test.path,
        content: test.content,
        test_id: test.test_id,
      }),
    );
  }
  working.tests.sort((a, b) => compareId(a.test_id, b.test_id));

  const requiredVisualDigests = new Set<string>();
  for (const visual of visualInputs) {
    const required =
      visual.required === true || visual.implementation_dependent === true;
    if (visual.description.length > MAX_STRING_CHARS) {
      if (required) {
        throw new UiContextPackError(
          `required visual reference ${visual.artifact_digest} description exceeds maximum length of ${MAX_STRING_CHARS}`,
        );
      }
      working.exclusion.push({
        subject_id: visual.artifact_digest,
        reason: `Visual reference ${visual.artifact_digest} was omitted because it exceeds the closed description bound; affected acceptance evidence was retained.`,
      });
      continue;
    }
    const record = makeUiContextVisualReference({
      artifact_digest: visual.artifact_digest,
      description: visual.description,
    });
    if (required) requiredVisualDigests.add(visual.artifact_digest);
    working.visualReferences.push(record);
    working.artifactDigests.push(visual.artifact_digest);
  }
  working.visualReferences.sort((a, b) =>
    compareId(a.artifact_digest, b.artifact_digest),
  );

  const requiredScreenshotKeys = new Set<string>();
  for (const shot of screenshotInputs) {
    const required =
      shot.required === true ||
      Boolean(shot.component_id && seedIds.has(shot.component_id));
    if (shot.description.length > MAX_STRING_CHARS) {
      if (required) {
        throw new UiContextPackError(
          `required screenshot ${shot.scenario_id} description exceeds maximum length of ${MAX_STRING_CHARS}`,
        );
      }
      working.exclusion.push({
        subject_id: shot.scenario_id,
        reason: `Screenshot description ${shot.scenario_id} was omitted because it exceeds the closed description bound; affected acceptance evidence was retained.`,
      });
      continue;
    }
    const record = makeUiContextScreenshotDescription({
      scenario_id: shot.scenario_id,
      artifact_digest: shot.artifact_digest,
      description: shot.description,
    });
    if (required) {
      requiredScreenshotKeys.add(`${shot.scenario_id}:${shot.artifact_digest}`);
    }
    working.screenshotDescriptions.push(record);
    working.artifactDigests.push(shot.artifact_digest);
  }
  working.screenshotDescriptions.sort((a, b) =>
    compareId(a.scenario_id, b.scenario_id),
  );

  for (const digest of baseline?.artifact_digests ?? []) {
    working.artifactDigests.push(digest);
  }
  working.artifactDigests = sortedUnique(working.artifactDigests);

  const failures = failureInputs
    .map(item =>
      makeUiContextFormalFailure({
        invariant_id: item.invariant_id,
        status: item.status as UiConstraintCheckStatus,
        description: item.description,
      }),
    )
    .sort((a, b) => compareId(a.invariant_id, b.invariant_id));
  const violations = a11yInputs
    .map(item =>
      makeUiContextAccessibilityViolation({
        violation_id: item.violation_id,
        severity: item.severity as UiAccessibilitySeverity,
        description: item.description,
      }),
    )
    .sort((a, b) => compareId(a.violation_id, b.violation_id));

  const routeInputs = [
    ...(baseline?.routes ?? []),
    ...(state.routes ?? []),
  ];
  const routes = routeInputs
    .map(item => makeUiContextRoute({ route_id: item.route_id, path: item.path }))
    .sort((a, b) => compareId(a.route_id, b.route_id));

  const bindings = [...(state.action_bindings ?? [])].sort((a, b) =>
    compareId(a.action_id, b.action_id),
  );

  const metricBaseline = makeUiContextMetricBaseline({
    metric_id: baseline?.metric_id || 'metric:unspecified',
    metrics: baseline?.metrics ?? {},
  });
  const baselineId = baseline?.baseline_id ?? '';

  const acceptance = sortedUnique([
    ...(request.acceptance_criteria ?? []),
    `${objective} is satisfied without regressing required interaction, accessibility, or policy invariants.`,
    ...failures.map(
      item => `Formal invariant ${item.invariant_id} must not remain ${item.status}.`,
    ),
    ...violations.map(
      item => `Accessibility violation ${item.violation_id} must be resolved.`,
    ),
  ]);

  const escalation = sortedUnique([
    ...(request.escalation_conditions ?? []),
    'Escalate if required acceptance evidence cannot fit the token budget.',
    'Escalate if action binding changes.',
    ...(resolutions.some(item => isUnresolvedResolution(item.resolution)) ||
    (state.unresolved ?? []).length > 0
      ? ['Escalate if unresolved state or action bindings remain.']
      : []),
    ...(sawOpaque || sawStale
      ? ['Escalate if opaque or stale source intersects a required invariant.']
      : []),
    ...(visualInputs.some(item => item.implementation_dependent)
      ? ['Escalate if visual failure is implementation-dependent.']
      : []),
    ...(plan?.fallback_triggered
      ? ['Escalate if invalidation fallback remains open.']
      : []),
  ]);

  if (plan?.confidence) confidences.push(plan.confidence);
  const analysis =
    request.analysis_classification ??
    worstGuiExtractionConfidence(confidences);
  const verification = resolveVerificationStatus({
    requested: request.verification_status,
    opaque: sawOpaque || analysis === 'opaque' || analysis === 'heuristic',
    stale: sawStale,
  });

  return {
    working,
    requiredVisualDigests,
    requiredScreenshotKeys,
    stateMachine: asContextStateMachine(state.state_machine),
    failures,
    violations,
    routes,
    bindings,
    metricBaseline,
    acceptance,
    escalation,
    analysis,
    verification,
    baselineId,
    replacedByComponent,
  };
}

function explainExclusions(records: readonly UiContextExclusionRecord[]): string {
  if (records.length === 0) {
    return 'No unrelated application or out-of-closure context was omitted.';
  }
  const unique = new Map<string, string>();
  for (const record of records) {
    if (!unique.has(record.reason)) unique.set(record.reason, record.reason);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b)).join(' ');
}

function assemblePack(
  request: GuiContextPackRequest,
  built: ReturnType<typeof buildWorkingPack>,
  working: WorkingPack,
): UiContextPack {
  const exclusion = explainExclusions(working.exclusion);
  const rawTokens = working.rawSources.reduce(
    (sum, source) => sum + estimateSourceTokens(source),
    0,
  );
  const capsules = [...working.parentCapsules, ...working.childCapsules];
  const capsuleTokens = capsules.reduce(
    (sum, capsule) => sum + estimateCapsuleTokens(capsule),
    0,
  );
  const replaced = [...built.replacedByComponent.entries()].reduce(
    (sum, [capsuleId, tokens]) => {
      if (capsules.some(capsule => capsule.capsule_id === capsuleId)) {
        return sum + tokens;
      }
      return sum;
    },
    0,
  );
  const screenshotTokens = estimateScreenshotTokens(
    working.visualReferences,
    working.screenshotDescriptions,
  );
  const otherTokens = estimateOtherTokens({
    objective: request.objective,
    styles: working.styles,
    tests: working.tests,
    stateMachine: built.stateMachine,
    failures: built.failures,
    violations: built.violations,
    routes: built.routes,
    bindings: built.bindings,
    metricBaseline: built.metricBaseline,
    acceptance: built.acceptance,
    exclusion,
    escalation: built.escalation,
    artifactDigests: working.artifactDigests,
  });
  const accounting = computeUiContextTokenAccounting({
    raw_source_tokens: rawTokens,
    capsule_tokens: capsuleTokens,
    screenshot_analysis_tokens: screenshotTokens,
    other_context_tokens: otherTokens,
    source_tokens_replaced_by_capsules: replaced,
    token_budget: request.token_budget,
  });
  return decodeUiContextPack({
    interface: UI_CONTEXT_PACK_INTERFACE,
    schema_version: UI_CONTEXT_PACK_SCHEMA,
    pack_id: derivePackId(request),
    application_id: request.application_id,
    screen_id: request.screen_id,
    objective: request.objective,
    baseline_id: built.baselineId,
    raw_sources: working.rawSources,
    styles: working.styles,
    affected_tests: working.tests,
    parent_capsules: working.parentCapsules,
    child_capsules: working.childCapsules,
    state_machine: built.stateMachine,
    formal_invariant_failures: built.failures,
    accessibility_violations: built.violations,
    visual_references: working.visualReferences,
    screenshot_descriptions: working.screenshotDescriptions,
    artifact_digests: working.artifactDigests,
    affected_routes: built.routes,
    action_bindings: built.bindings,
    metric_baseline: built.metricBaseline,
    acceptance_criteria: built.acceptance,
    excluded_context_explanation: exclusion,
    escalation_conditions: built.escalation,
    raw_source_tokens: accounting.raw_source_tokens,
    capsule_tokens: accounting.capsule_tokens,
    screenshot_analysis_tokens: accounting.screenshot_analysis_tokens,
    other_context_tokens: accounting.other_context_tokens,
    source_tokens_replaced_by_capsules:
      accounting.source_tokens_replaced_by_capsules,
    ordinary_raw_dependency_tokens: accounting.ordinary_raw_dependency_tokens,
    total_estimated_prompt_tokens: accounting.total_estimated_prompt_tokens,
    token_budget: accounting.token_budget,
    compression_ratio: accounting.compression_ratio,
    analysis_classification: built.analysis,
    verification_status: built.verification,
  });
}

function dropOptionalForBudget(
  request: GuiContextPackRequest,
  built: ReturnType<typeof buildWorkingPack>,
): { pack: UiContextPack; working: WorkingPack } {
  const working = built.working;
  const tryAssemble = (): UiContextPack | UiContextPackBudgetError => {
    try {
      return assemblePack(request, built, working);
    } catch (error) {
      if (error instanceof UiContextPackBudgetError) return error;
      throw error;
    }
  };

  let result = tryAssemble();
  if (!(result instanceof UiContextPackBudgetError)) {
    return { pack: result, working };
  }

  const optionalCapsules: { role: 'parent' | 'child'; capsule: UiSemanticCapsule }[] =
    [
      ...working.childCapsules.map(capsule => ({
        role: 'child' as const,
        capsule,
      })),
      ...working.parentCapsules.map(capsule => ({
        role: 'parent' as const,
        capsule,
      })),
    ];

  while (result instanceof UiContextPackBudgetError) {
    const optionalShotIndex = [...working.screenshotDescriptions]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) =>
        !built.requiredScreenshotKeys.has(
          `${item.scenario_id}:${item.artifact_digest}`,
        ),
      )?.index;
    if (optionalShotIndex !== undefined) {
      const dropped = working.screenshotDescriptions.splice(
        optionalShotIndex,
        1,
      )[0];
      working.exclusion.push({
        subject_id: dropped.scenario_id,
        reason: `Screenshot description ${dropped.scenario_id} was omitted to stay within the token budget; affected acceptance evidence was retained.`,
      });
      working.artifactDigests = sortedUnique([
        ...working.visualReferences.map(item => item.artifact_digest),
        ...working.screenshotDescriptions.map(item => item.artifact_digest),
        ...(request.baseline?.artifact_digests ?? []),
      ]);
      result = tryAssemble();
      continue;
    }
    const optionalVisualIndex = [...working.visualReferences]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => !built.requiredVisualDigests.has(item.artifact_digest))
      ?.index;
    if (optionalVisualIndex !== undefined) {
      const dropped = working.visualReferences.splice(optionalVisualIndex, 1)[0];
      working.exclusion.push({
        subject_id: dropped.artifact_digest,
        reason: `Visual reference ${dropped.artifact_digest} was omitted to stay within the token budget; affected acceptance evidence was retained.`,
      });
      working.artifactDigests = sortedUnique([
        ...working.visualReferences.map(item => item.artifact_digest),
        ...working.screenshotDescriptions.map(item => item.artifact_digest),
        ...(request.baseline?.artifact_digests ?? []),
      ]);
      result = tryAssemble();
      continue;
    }
    const optional = optionalCapsules.pop();
    if (!optional) break;
    if (optional.role === 'parent') {
      working.parentCapsules = working.parentCapsules.filter(
        item => item.capsule_id !== optional.capsule.capsule_id,
      );
    } else {
      working.childCapsules = working.childCapsules.filter(
        item => item.capsule_id !== optional.capsule.capsule_id,
      );
    }
    working.exclusion.push({
      subject_id: optional.capsule.capsule_id,
      reason: `Unchanged ${optional.role} capsule ${optional.capsule.capsule_id} was omitted to stay within the token budget; affected acceptance evidence was retained.`,
    });
    result = tryAssemble();
  }

  if (result instanceof UiContextPackBudgetError) {
    throw new UiContextPackBudgetError(
      `token budget ${request.token_budget} cannot retain required acceptance evidence (raw sources, affected tests, failures, criteria)`,
    );
  }
  return { pack: result, working };
}

export function buildGuiContextPackWithTrace(
  repositoryState: GuiContextRepositoryState | GuiContextPackRequest,
  applicationId?: string,
  screenId?: string,
  objective?: string,
  tokenBudget?: number,
  baseline?: GuiContextBaselineInput | null,
  violations?: GuiContextViolationsInput | null,
): UiContextPackBuildTrace {
  const request = resolveRequest(
    repositoryState,
    applicationId,
    screenId,
    objective,
    tokenBudget,
    baseline,
    violations,
  );
  const built = buildWorkingPack(request);
  const { pack, working } = dropOptionalForBudget(request, built);
  return Object.freeze({
    pack,
    accounting: uiContextTokenAccountingFromPack(pack),
    inclusion_reasons: Object.freeze([...working.inclusion]),
    exclusion_reasons: Object.freeze([...working.exclusion]),
    rejected_capsules: Object.freeze([...working.rejected]),
  });
}

export function buildGuiContextPack(
  repositoryState: GuiContextRepositoryState | GuiContextPackRequest,
  applicationId?: string,
  screenId?: string,
  objective?: string,
  tokenBudget?: number,
  baseline?: GuiContextBaselineInput | null,
  violations?: GuiContextViolationsInput | null,
): UiContextPack {
  return buildGuiContextPackWithTrace(
    repositoryState,
    applicationId,
    screenId,
    objective,
    tokenBudget,
    baseline,
    violations,
  ).pack;
}

/** Board interface build_gui_context_pack@1. */
export function build_gui_context_pack(
  repository_state: GuiContextRepositoryState | GuiContextPackRequest,
  application_id?: string,
  screen_id?: string,
  objective?: string,
  token_budget?: number,
  baseline?: GuiContextBaselineInput | null,
  violations?: GuiContextViolationsInput | null,
): UiContextPack {
  return buildGuiContextPack(
    repository_state,
    application_id,
    screen_id,
    objective,
    token_budget,
    baseline,
    violations,
  );
}

export function createUiContextPackBuilder(): UiContextPackBuilder {
  return Object.freeze({
    interface: UI_CONTEXT_PACK_BUILDER_INTERFACE,
    schema_version: UI_CONTEXT_PACK_BUILDER_SCHEMA,
    extractorVersion: UI_CONTEXT_PACK_BUILDER_VERSION,
    build: buildGuiContextPack,
  });
}

export function collectContextPackInclusionReasons(
  pack: UiContextPack,
): readonly string[] {
  const reasons: string[] = [];
  for (const source of pack.raw_sources) {
    if (source.editable) {
      reasons.push(`raw:editable_target:${source.path}`);
    } else {
      reasons.push(`raw:required:${source.path}`);
    }
  }
  for (const capsule of pack.parent_capsules) {
    reasons.push(`capsule:parent:${capsule.capsule_id}`);
  }
  for (const capsule of pack.child_capsules) {
    reasons.push(`capsule:child:${capsule.capsule_id}`);
  }
  return Object.freeze(reasons);
}

export {
  CANONICAL_JSON_PROFILE,
};

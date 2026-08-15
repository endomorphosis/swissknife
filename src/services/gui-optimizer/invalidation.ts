/**
 * Incremental GUI invalidation planning (VGO-027).
 *
 * Wire models:
 *   - UiChangeSet@1 / ui-change-set/v1
 *   - UiInvalidationPlan@1 / ui-invalidation-plan/v1
 *   - UiInvalidationPlanner@1 / ui-invalidation-planner/v1
 *
 * Maps implementation, props/events, state, CSS/token, action-binding and
 * localization changes to a precise, bounded invalidation plan. Graph
 * closure stops at typed dependency boundaries: an unrelated style change
 * never invalidates every application screenshot. Missing, stale,
 * conservative, or opaque edges expand to a documented broader fallback
 * rather than pretending precision.
 *
 * This module never executes repository source and never rewrites or
 * invalidates every application by default.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  GUI_DEPENDENCY_RELATIONS,
  GUI_EXTRACTION_CONFIDENCE,
  type GuiDependencyRelation,
  type GuiExtractionConfidence,
  worstGuiExtractionConfidence,
} from './models.js';
import {
  STABLE_SCENARIO_IDS,
  type ScenarioKind,
} from './scenario-catalog.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_CHANGE_SET_INTERFACE = 'UiChangeSet@1' as const;
export const UI_CHANGE_SET_SCHEMA = 'ui-change-set/v1' as const;

export const UI_INVALIDATION_PLAN_INTERFACE = 'UiInvalidationPlan@1' as const;
export const UI_INVALIDATION_PLAN_SCHEMA = 'ui-invalidation-plan/v1' as const;

export const UI_INVALIDATION_PLANNER_INTERFACE =
  'UiInvalidationPlanner@1' as const;
export const UI_INVALIDATION_PLANNER_SCHEMA =
  'ui-invalidation-planner/v1' as const;

export const UI_INVALIDATION_PLANNER_VERSION =
  'gui-invalidation-planner@1.0.0' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** Normalized change categories feeding invalidation (ChangeKind). */
export const UI_CHANGE_KINDS = Object.freeze([
  'component_implementation',
  'props_event_contract',
  'state_machine',
  'css_design_token',
  'action_binding',
  'localization',
  'accessibility',
  'test',
  'screenshot',
  'other',
] as const);
export type UiChangeKind = (typeof UI_CHANGE_KINDS)[number];

/** Why an identity, scenario, or check is invalidated (InvalidationReason). */
export const UI_INVALIDATION_REASONS = Object.freeze([
  'component_changed',
  'props_changed',
  'state_changed',
  'style_changed',
  'action_changed',
  'localization_changed',
  'dependency_changed',
  'extractor_changed',
  'schema_changed',
  'stale_edge',
  'opaque_edge',
  'missing_edge',
  'fallback_expansion',
] as const);
export type UiInvalidationReason = (typeof UI_INVALIDATION_REASONS)[number];

/** Closed check identities emitted by the planner. */
export const UI_INVALIDATION_CHECK_IDS = Object.freeze({
  // component implementation
  capsule: 'check:capsule',
  directTests: 'check:direct-tests',
  containingScreenshots: 'check:containing-screenshots',
  accessibilityScenarios: 'check:accessibility-scenarios',
  // props/event contract
  parentsConsumers: 'check:parents-consumers',
  actionBindings: 'check:action-bindings',
  interfaceDescriptors: 'check:interface-descriptors',
  contractTests: 'check:contract-tests',
  // state machine
  reachability: 'check:reachability',
  outcome: 'check:outcome',
  formal: 'check:formal',
  interactionScenarios: 'check:interaction-scenarios',
  // css / design token
  dependentScreenshots: 'check:dependent-screenshots',
  responsive: 'check:responsive',
  contrast: 'check:contrast',
  clipping: 'check:clipping',
  overflow: 'check:overflow',
  // action binding
  policy: 'check:policy',
  confirmation: 'check:confirmation',
  hostBoundary: 'check:host-boundary',
  interaction: 'check:interaction',
  invocationTests: 'check:invocation-tests',
  // localization
  textLayoutScreenshots: 'check:text-layout-screenshots',
  accessibleName: 'check:accessible-name',
  localeScenarios: 'check:locale-scenarios',
  // accessibility / test / screenshot
  accessibilityContracts: 'check:accessibility-contracts',
  testArtifacts: 'check:test-artifacts',
  screenshotArtifacts: 'check:screenshot-artifacts',
  // fallback
  broaderScreenFallback: 'check:broader-screen-fallback',
} as const);

export type UiInvalidationCheckId =
  (typeof UI_INVALIDATION_CHECK_IDS)[keyof typeof UI_INVALIDATION_CHECK_IDS];

// ---------------------------------------------------------------------------
// Wire record types
// ---------------------------------------------------------------------------

/** UiChangeSet@1 — mirrors Python UiChangeSet wire fields. */
export interface UiChangeSet {
  readonly interface: typeof UI_CHANGE_SET_INTERFACE;
  readonly schema_version: typeof UI_CHANGE_SET_SCHEMA;
  readonly change_set_id: string;
  readonly change_kinds: readonly UiChangeKind[];
  readonly file_paths: readonly string[];
  readonly component_ids: readonly string[];
  readonly state_ids: readonly string[];
  readonly action_ids: readonly string[];
  readonly summary: string;
}

/** UiInvalidationPlan@1 — mirrors Python UiInvalidationPlan wire fields. */
export interface UiInvalidationPlan {
  readonly interface: typeof UI_INVALIDATION_PLAN_INTERFACE;
  readonly schema_version: typeof UI_INVALIDATION_PLAN_SCHEMA;
  readonly plan_id: string;
  readonly change_set_id: string;
  readonly reasons: readonly UiInvalidationReason[];
  readonly affected_component_ids: readonly string[];
  readonly affected_scenario_ids: readonly string[];
  readonly affected_check_ids: readonly string[];
  readonly confidence: GuiExtractionConfidence;
  readonly fallback_triggered: boolean;
  readonly fallback_explanation: string;
}

/**
 * Lightweight component capsule surface used for impact closure.
 * Distinct from UiSemanticCapsule@1 so the planner stays source-addressed
 * without requiring a full capsule recompile.
 */
export interface UiInvalidationCapsuleRef {
  readonly component_id: string;
  readonly screenshot_ids?: readonly string[];
  readonly test_ids?: readonly string[];
  readonly action_binding_ids?: readonly string[];
  readonly localization_keys?: readonly string[];
  readonly child_component_ids?: readonly string[];
  readonly dependency_component_ids?: readonly string[];
}

/** Typed dependency edge fact used for bounded graph closure. */
export interface UiInvalidationEdge {
  readonly source_component_id: string;
  readonly target_component_id: string;
  readonly relation: GuiDependencyRelation | string;
  readonly confidence?: GuiExtractionConfidence;
  readonly stale?: boolean;
}

/** Explicit screenshot ownership used to keep style changes local. */
export interface UiInvalidationScreenshotRef {
  readonly screenshot_id: string;
  readonly component_id: string;
  readonly scenario_id?: string;
}

/**
 * Planner input context. All collections are optional; missing edges or
 * capsules reduce precision and may trigger documented fallback expansion.
 */
export interface UiInvalidationContext {
  readonly application_id?: string;
  readonly screen_id?: string;
  readonly edges?: readonly UiInvalidationEdge[];
  readonly capsules?: readonly UiInvalidationCapsuleRef[];
  readonly screenshots?: readonly UiInvalidationScreenshotRef[];
  readonly known_component_ids?: readonly string[];
  readonly known_scenario_ids?: readonly string[];
  readonly known_screenshot_ids?: readonly string[];
  readonly unresolved?: readonly string[];
  readonly graph_confidence?: GuiExtractionConfidence;
  /** Explicit signal that required edges are missing from the graph. */
  readonly missing_edges?: boolean;
  /** Explicit signal that retained edges are stale relative to source. */
  readonly stale_edges?: boolean;
  /** Caller-forced broader fallback (still documented, never silent). */
  readonly force_fallback?: boolean;
  readonly fallback_reason?: string;
}

export interface UiInvalidationPlanOptions {
  readonly planId?: string;
  readonly context?: UiInvalidationContext;
}

export interface UiInvalidationPlanner {
  readonly interface: typeof UI_INVALIDATION_PLANNER_INTERFACE;
  readonly schema_version: typeof UI_INVALIDATION_PLANNER_SCHEMA;
  readonly extractorVersion: typeof UI_INVALIDATION_PLANNER_VERSION;
  plan(
    changeSet: UiChangeSet,
    options?: UiInvalidationPlanOptions,
  ): UiInvalidationPlan;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiInvalidationError extends Error {
  readonly name = 'UiInvalidationError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiInvalidationDecodeError extends UiInvalidationError {
  readonly name = 'UiInvalidationDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const CHANGE_KIND_SET = new Set<string>(UI_CHANGE_KINDS);
const REASON_SET = new Set<string>(UI_INVALIDATION_REASONS);
const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const RELATION_SET = new Set<string>(GUI_DEPENDENCY_RELATIONS);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const PATH_RE =
  /^(?!\/)(?!\.\.(?:\/|$))(?!.*\/\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._+/-]{0,511}$/;

const CHANGE_SET_FIELDS = Object.freeze([
  'action_ids',
  'change_kinds',
  'change_set_id',
  'component_ids',
  'file_paths',
  'interface',
  'schema_version',
  'state_ids',
  'summary',
] as const);

const PLAN_FIELDS = Object.freeze([
  'affected_check_ids',
  'affected_component_ids',
  'affected_scenario_ids',
  'change_set_id',
  'confidence',
  'fallback_explanation',
  'fallback_triggered',
  'interface',
  'plan_id',
  'reasons',
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
    throw new UiInvalidationDecodeError(
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
    throw new UiInvalidationDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiInvalidationDecodeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) {
    if (value === null) {
      throw new UiInvalidationDecodeError(`${field} must be a string`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new UiInvalidationDecodeError(`${field} must be a string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new UiInvalidationDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requirePath(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!PATH_RE.test(text)) {
    throw new UiInvalidationDecodeError(
      `${field} is not a valid repository-relative path`,
    );
  }
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UiInvalidationDecodeError(`${field} must be a boolean`);
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
    throw new UiInvalidationDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireUniqueIdentifiers(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiInvalidationDecodeError(`${field} must be an array`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireIdentifier(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiInvalidationDecodeError(
        `${field} must not contain duplicates`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

function requireUniquePaths(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiInvalidationDecodeError(`${field} must be an array`);
  }
  if (value.length === 0) {
    throw new UiInvalidationDecodeError(`${field} must not be empty`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requirePath(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiInvalidationDecodeError(
        `${field} must not contain duplicates`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

function requireUniqueEnums<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): readonly T[] {
  if (!Array.isArray(value)) {
    throw new UiInvalidationDecodeError(`${field} must be an array`);
  }
  if (value.length === 0) {
    throw new UiInvalidationDecodeError(`${field} must not be empty`);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireEnum<T>(value[i], `${field}[${i}]`, allowed);
    if (seen.has(item)) {
      throw new UiInvalidationDecodeError(
        `${field} must not contain duplicates`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Decode / make / serialize
// ---------------------------------------------------------------------------

export function decodeUiChangeSet(raw: unknown): UiChangeSet {
  if (!isPlainObject(raw)) {
    throw new UiInvalidationDecodeError('UiChangeSet must be an object');
  }
  rejectUnknownKeys(raw, CHANGE_SET_FIELDS, 'UiChangeSet');
  requireKeys(raw, CHANGE_SET_FIELDS, 'UiChangeSet');
  if (raw.interface !== UI_CHANGE_SET_INTERFACE) {
    throw new UiInvalidationDecodeError(
      `unsupported UiChangeSet interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_CHANGE_SET_SCHEMA) {
    throw new UiInvalidationDecodeError(
      `unsupported UiChangeSet schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_CHANGE_SET_INTERFACE,
    schema_version: UI_CHANGE_SET_SCHEMA,
    change_set_id: requireIdentifier(raw.change_set_id, 'change_set_id'),
    change_kinds: requireUniqueEnums<UiChangeKind>(
      raw.change_kinds,
      'change_kinds',
      CHANGE_KIND_SET,
    ),
    file_paths: requireUniquePaths(raw.file_paths, 'file_paths'),
    component_ids: requireUniqueIdentifiers(raw.component_ids, 'component_ids'),
    state_ids: requireUniqueIdentifiers(raw.state_ids, 'state_ids'),
    action_ids: requireUniqueIdentifiers(raw.action_ids, 'action_ids'),
    summary: requireOptionalString(raw.summary, 'summary'),
  });
}

export function decodeUiInvalidationPlan(raw: unknown): UiInvalidationPlan {
  if (!isPlainObject(raw)) {
    throw new UiInvalidationDecodeError('UiInvalidationPlan must be an object');
  }
  rejectUnknownKeys(raw, PLAN_FIELDS, 'UiInvalidationPlan');
  requireKeys(raw, PLAN_FIELDS, 'UiInvalidationPlan');
  if (raw.interface !== UI_INVALIDATION_PLAN_INTERFACE) {
    throw new UiInvalidationDecodeError(
      `unsupported UiInvalidationPlan interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_INVALIDATION_PLAN_SCHEMA) {
    throw new UiInvalidationDecodeError(
      `unsupported UiInvalidationPlan schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_INVALIDATION_PLAN_INTERFACE,
    schema_version: UI_INVALIDATION_PLAN_SCHEMA,
    plan_id: requireIdentifier(raw.plan_id, 'plan_id'),
    change_set_id: requireIdentifier(raw.change_set_id, 'change_set_id'),
    reasons: requireUniqueEnums<UiInvalidationReason>(
      raw.reasons,
      'reasons',
      REASON_SET,
    ),
    affected_component_ids: requireUniqueIdentifiers(
      raw.affected_component_ids,
      'affected_component_ids',
    ),
    affected_scenario_ids: requireUniqueIdentifiers(
      raw.affected_scenario_ids,
      'affected_scenario_ids',
    ),
    affected_check_ids: requireUniqueIdentifiers(
      raw.affected_check_ids,
      'affected_check_ids',
    ),
    confidence: requireEnum<GuiExtractionConfidence>(
      raw.confidence,
      'confidence',
      CONFIDENCE_SET,
    ),
    fallback_triggered: requireBoolean(
      raw.fallback_triggered,
      'fallback_triggered',
    ),
    fallback_explanation: requireOptionalString(
      raw.fallback_explanation,
      'fallback_explanation',
    ),
  });
}

export function makeUiChangeSet(partial: {
  change_set_id: string;
  change_kinds: readonly UiChangeKind[];
  file_paths: readonly string[];
  component_ids?: readonly string[];
  state_ids?: readonly string[];
  action_ids?: readonly string[];
  summary?: string;
}): UiChangeSet {
  return decodeUiChangeSet({
    interface: UI_CHANGE_SET_INTERFACE,
    schema_version: UI_CHANGE_SET_SCHEMA,
    change_set_id: partial.change_set_id,
    change_kinds: [...partial.change_kinds],
    file_paths: [...partial.file_paths],
    component_ids: [...(partial.component_ids ?? [])],
    state_ids: [...(partial.state_ids ?? [])],
    action_ids: [...(partial.action_ids ?? [])],
    summary: partial.summary ?? '',
  });
}

export function makeUiInvalidationPlan(partial: {
  plan_id: string;
  change_set_id: string;
  reasons: readonly UiInvalidationReason[];
  affected_component_ids?: readonly string[];
  affected_scenario_ids?: readonly string[];
  affected_check_ids?: readonly string[];
  confidence?: GuiExtractionConfidence;
  fallback_triggered?: boolean;
  fallback_explanation?: string;
}): UiInvalidationPlan {
  return decodeUiInvalidationPlan({
    interface: UI_INVALIDATION_PLAN_INTERFACE,
    schema_version: UI_INVALIDATION_PLAN_SCHEMA,
    plan_id: partial.plan_id,
    change_set_id: partial.change_set_id,
    reasons: [...partial.reasons],
    affected_component_ids: [...(partial.affected_component_ids ?? [])],
    affected_scenario_ids: [...(partial.affected_scenario_ids ?? [])],
    affected_check_ids: [...(partial.affected_check_ids ?? [])],
    confidence: partial.confidence ?? 'exact',
    fallback_triggered: partial.fallback_triggered ?? false,
    fallback_explanation: partial.fallback_explanation ?? '',
  });
}

/**
 * Canonical JSON (gui-optimizer-canonical-json/v1): sorted object keys,
 * no whitespace, reject non-finite numbers, omit undefined.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new UiInvalidationError('canonical JSON rejects non-finite numbers');
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
  throw new UiInvalidationError(`canonical JSON cannot encode ${typeof value}`);
}

export function serializeUiChangeSet(changeSet: UiChangeSet): string {
  return canonicalJson(uiChangeSetToDict(changeSet));
}

export function serializeUiInvalidationPlan(plan: UiInvalidationPlan): string {
  return canonicalJson(uiInvalidationPlanToDict(plan));
}

export function uiChangeSetToDict(
  changeSet: UiChangeSet,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    action_ids: [...changeSet.action_ids],
    change_kinds: [...changeSet.change_kinds],
    change_set_id: changeSet.change_set_id,
    component_ids: [...changeSet.component_ids],
    file_paths: [...changeSet.file_paths],
    interface: changeSet.interface,
    schema_version: changeSet.schema_version,
    state_ids: [...changeSet.state_ids],
    summary: changeSet.summary,
  });
}

export function uiInvalidationPlanToDict(
  plan: UiInvalidationPlan,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    affected_check_ids: [...plan.affected_check_ids],
    affected_component_ids: [...plan.affected_component_ids],
    affected_scenario_ids: [...plan.affected_scenario_ids],
    change_set_id: plan.change_set_id,
    confidence: plan.confidence,
    fallback_explanation: plan.fallback_explanation,
    fallback_triggered: plan.fallback_triggered,
    interface: plan.interface,
    plan_id: plan.plan_id,
    reasons: [...plan.reasons],
    schema_version: plan.schema_version,
  });
}

export function invalidationPlanDigest(plan: UiInvalidationPlan): string {
  return `sha256:${sha256Hex(serializeUiInvalidationPlan(plan))}`;
}

// ---------------------------------------------------------------------------
// Impact mapping tables (plan table + acceptance criteria)
// ---------------------------------------------------------------------------

const COMPONENT_IMPL_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'initial_load',
  'keyboard_only',
  'success',
]);

const STATE_MACHINE_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'initial_load',
  'loading',
  'success',
  'empty',
  'recoverable_failure',
  'unrecoverable_failure',
  'valid_submission',
  'invalid_submission',
]);

const STYLE_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'viewport_mobile',
  'viewport_desktop',
  'viewport_wide',
  'text_scale_200',
  'dark_mode',
  'reduced_motion',
]);

const BINDING_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'confirmation_grant',
  'confirmation_deny',
  'valid_submission',
  'keyboard_only',
  'service_unavailable',
]);

const LOCALIZATION_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'initial_load',
  'text_scale_200',
  'viewport_mobile',
  'keyboard_only',
]);

const ACCESSIBILITY_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'keyboard_only',
  'initial_load',
  'text_scale_200',
]);

const FALLBACK_SCREEN_SCENARIOS: readonly ScenarioKind[] = Object.freeze([
  'initial_load',
  'loading',
  'success',
  'empty',
  'recoverable_failure',
  'unrecoverable_failure',
  'keyboard_only',
  'viewport_mobile',
  'viewport_desktop',
  'confirmation_grant',
  'confirmation_deny',
]);

const CONSUMER_RELATIONS = Object.freeze(
  new Set<string>([
    'renders',
    'contains',
    'routes_to',
    'opens_dialog',
    'closes_dialog',
  ]),
);

const STYLE_RELATIONS = Object.freeze(
  new Set<string>(['styled_by', 'uses_design_token', 'responsive_variant_of']),
);

const SCREENSHOT_RELATIONS = Object.freeze(new Set<string>(['screenshot_by']));
const TEST_RELATIONS = Object.freeze(new Set<string>(['tested_by']));
const ACTION_RELATIONS = Object.freeze(
  new Set<string>([
    'invokes_action',
    'requires_confirmation',
    'depends_on_policy',
    'submits',
  ]),
);
const LOCALIZATION_RELATIONS = Object.freeze(
  new Set<string>(['localized_by']),
);
const STATE_RELATIONS = Object.freeze(
  new Set<string>(['updates_state', 'reads_state']),
);

function scenarioIdsForKinds(
  kinds: readonly ScenarioKind[],
  known?: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const kind of kinds) {
    const id = STABLE_SCENARIO_IDS[kind];
    if (!known || known.has(id)) out.push(id);
  }
  return out;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function isUncertaintyConfidence(
  confidence: GuiExtractionConfidence | undefined,
): boolean {
  return (
    confidence === 'opaque' ||
    confidence === 'heuristic' ||
    confidence === 'conservative'
  );
}

// ---------------------------------------------------------------------------
// Planner core
// ---------------------------------------------------------------------------

interface ImpactAccumulator {
  components: Set<string>;
  scenarios: Set<string>;
  checks: Set<string>;
  reasons: Set<UiInvalidationReason>;
  confidences: GuiExtractionConfidence[];
  fallbackTriggers: string[];
  /** Screenshots explicitly invalidated (for precision assertions). */
  screenshots: Set<string>;
}

function createAccumulator(): ImpactAccumulator {
  return {
    components: new Set<string>(),
    scenarios: new Set<string>(),
    checks: new Set<string>(),
    reasons: new Set<UiInvalidationReason>(),
    confidences: [],
    fallbackTriggers: [],
    screenshots: new Set<string>(),
  };
}

function indexCapsules(
  capsules: readonly UiInvalidationCapsuleRef[] | undefined,
): Map<string, UiInvalidationCapsuleRef> {
  const map = new Map<string, UiInvalidationCapsuleRef>();
  for (const capsule of capsules ?? []) {
    if (capsule?.component_id) map.set(capsule.component_id, capsule);
  }
  return map;
}

function indexScreenshotsByComponent(
  screenshots: readonly UiInvalidationScreenshotRef[] | undefined,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const shot of screenshots ?? []) {
    if (!shot?.screenshot_id || !shot.component_id) continue;
    const list = map.get(shot.component_id) ?? [];
    list.push(shot.screenshot_id);
    map.set(shot.component_id, list);
  }
  return map;
}

function neighbors(
  edges: readonly UiInvalidationEdge[],
  seeds: ReadonlySet<string>,
  direction: 'outgoing' | 'incoming',
  relationFilter?: ReadonlySet<string>,
): {
  ids: Set<string>;
  confidences: GuiExtractionConfidence[];
  uncertain: string[];
} {
  const ids = new Set<string>();
  const confidences: GuiExtractionConfidence[] = [];
  const uncertain: string[] = [];
  for (const edge of edges) {
    if (relationFilter && !relationFilter.has(edge.relation)) continue;
    const from =
      direction === 'outgoing'
        ? edge.source_component_id
        : edge.target_component_id;
    const to =
      direction === 'outgoing'
        ? edge.target_component_id
        : edge.source_component_id;
    if (!seeds.has(from)) continue;
    if (!to) {
      uncertain.push(`missing_target:${from}:${edge.relation}`);
      continue;
    }
    ids.add(to);
    const confidence = edge.confidence ?? 'exact';
    confidences.push(confidence);
    if (edge.stale) uncertain.push(`stale_edge:${from}->${to}:${edge.relation}`);
    if (isUncertaintyConfidence(confidence)) {
      uncertain.push(`${confidence}_edge:${from}->${to}:${edge.relation}`);
    }
    if (!RELATION_SET.has(edge.relation)) {
      uncertain.push(`unknown_relation:${from}->${to}:${edge.relation}`);
    }
  }
  return { ids, confidences, uncertain };
}

function addScenarios(
  acc: ImpactAccumulator,
  kinds: readonly ScenarioKind[],
  known?: ReadonlySet<string>,
): void {
  for (const id of scenarioIdsForKinds(kinds, known)) acc.scenarios.add(id);
}

function addScreenshotsForComponents(
  acc: ImpactAccumulator,
  componentIds: Iterable<string>,
  byComponent: Map<string, string[]>,
  capsules: Map<string, UiInvalidationCapsuleRef>,
  edges: readonly UiInvalidationEdge[],
): void {
  for (const componentId of componentIds) {
    for (const shot of byComponent.get(componentId) ?? []) {
      acc.screenshots.add(shot);
    }
    const capsule = capsules.get(componentId);
    for (const shot of capsule?.screenshot_ids ?? []) {
      acc.screenshots.add(shot);
    }
  }
  // screenshot_by edges: component -> screenshot identity
  for (const edge of edges) {
    if (!SCREENSHOT_RELATIONS.has(edge.relation)) continue;
    if (acc.components.has(edge.source_component_id)) {
      acc.screenshots.add(edge.target_component_id);
    }
  }
}

function applyComponentImplementation(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  edges: readonly UiInvalidationEdge[],
  capsules: Map<string, UiInvalidationCapsuleRef>,
  screenshotsByComponent: Map<string, string[]>,
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('component_changed');
  for (const id of seeds) acc.components.add(id);

  // Direct children only (contains/renders outgoing) — not whole-app closure.
  const children = neighbors(edges, seeds, 'outgoing', CONSUMER_RELATIONS);
  for (const id of children.ids) acc.components.add(id);
  acc.confidences.push(...children.confidences);
  acc.fallbackTriggers.push(...children.uncertain);

  for (const id of seeds) {
    const capsule = capsules.get(id);
    for (const child of capsule?.child_component_ids ?? []) {
      acc.components.add(child);
    }
    for (const testId of capsule?.test_ids ?? []) {
      // Tests are checks, not components.
      void testId;
    }
  }

  // Direct tests via tested_by edges.
  const tests = neighbors(edges, seeds, 'outgoing', TEST_RELATIONS);
  acc.confidences.push(...tests.confidences);
  acc.fallbackTriggers.push(...tests.uncertain);

  addScreenshotsForComponents(
    acc,
    acc.components,
    screenshotsByComponent,
    capsules,
    edges,
  );
  addScenarios(acc, COMPONENT_IMPL_SCENARIOS, knownScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.capsule);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.directTests);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.containingScreenshots);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.accessibilityScenarios);
}

function applyPropsEventContract(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  edges: readonly UiInvalidationEdge[],
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('props_changed');
  for (const id of seeds) acc.components.add(id);

  // Parents/consumers: reverse contains/renders edges.
  const parents = neighbors(edges, seeds, 'incoming', CONSUMER_RELATIONS);
  for (const id of parents.ids) acc.components.add(id);
  acc.confidences.push(...parents.confidences);
  acc.fallbackTriggers.push(...parents.uncertain);

  const actions = neighbors(edges, seeds, 'outgoing', ACTION_RELATIONS);
  acc.confidences.push(...actions.confidences);
  acc.fallbackTriggers.push(...actions.uncertain);

  const tests = neighbors(edges, seeds, 'outgoing', TEST_RELATIONS);
  acc.confidences.push(...tests.confidences);
  acc.fallbackTriggers.push(...tests.uncertain);

  addScenarios(acc, ['initial_load', 'valid_submission', 'keyboard_only'], knownScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.parentsConsumers);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.actionBindings);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.interfaceDescriptors);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.contractTests);
}

function applyStateMachine(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  stateIds: readonly string[],
  edges: readonly UiInvalidationEdge[],
  capsules: Map<string, UiInvalidationCapsuleRef>,
  screenshotsByComponent: Map<string, string[]>,
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('state_changed');
  for (const id of seeds) acc.components.add(id);
  for (const stateId of stateIds) {
    // State identities are not components; they select interaction scenarios.
    void stateId;
  }

  const stateNeighbors = neighbors(edges, seeds, 'outgoing', STATE_RELATIONS);
  for (const id of stateNeighbors.ids) {
    // Keep state targets as checks/context, not automatic component expansion
    // unless they look like component identities.
    if (id.startsWith('comp:') || id.startsWith('component:')) {
      acc.components.add(id);
    }
  }
  acc.confidences.push(...stateNeighbors.confidences);
  acc.fallbackTriggers.push(...stateNeighbors.uncertain);

  addScreenshotsForComponents(
    acc,
    acc.components,
    screenshotsByComponent,
    capsules,
    edges,
  );
  // Loading/error/success screenshots for state changes.
  addScenarios(acc, STATE_MACHINE_SCENARIOS, knownScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.reachability);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.outcome);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.formal);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.interactionScenarios);
}

function applyCssDesignToken(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  edges: readonly UiInvalidationEdge[],
  capsules: Map<string, UiInvalidationCapsuleRef>,
  screenshotsByComponent: Map<string, string[]>,
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('style_changed');
  for (const id of seeds) acc.components.add(id);

  // Dependents of the token/style only — never every application screenshot.
  const styledDependents = neighbors(edges, seeds, 'incoming', STYLE_RELATIONS);
  for (const id of styledDependents.ids) acc.components.add(id);
  acc.confidences.push(...styledDependents.confidences);
  acc.fallbackTriggers.push(...styledDependents.uncertain);

  const styleTargets = neighbors(edges, seeds, 'outgoing', STYLE_RELATIONS);
  for (const id of styleTargets.ids) acc.components.add(id);
  acc.confidences.push(...styleTargets.confidences);
  acc.fallbackTriggers.push(...styleTargets.uncertain);

  // Only screenshots owned by the style-affected component closure.
  addScreenshotsForComponents(
    acc,
    acc.components,
    screenshotsByComponent,
    capsules,
    edges,
  );
  addScenarios(acc, STYLE_SCENARIOS, knownScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.dependentScreenshots);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.responsive);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.contrast);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.clipping);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.overflow);
}

function applyActionBinding(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  actionIds: readonly string[],
  edges: readonly UiInvalidationEdge[],
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('action_changed');
  for (const id of seeds) acc.components.add(id);
  for (const actionId of actionIds) {
    // Action identities select policy/confirmation checks.
    void actionId;
  }

  const actionNeighbors = neighbors(edges, seeds, 'outgoing', ACTION_RELATIONS);
  acc.confidences.push(...actionNeighbors.confidences);
  acc.fallbackTriggers.push(...actionNeighbors.uncertain);

  const tests = neighbors(edges, seeds, 'outgoing', TEST_RELATIONS);
  acc.confidences.push(...tests.confidences);
  acc.fallbackTriggers.push(...tests.uncertain);

  addScenarios(acc, BINDING_SCENARIOS, knownScenarios);
  // Acceptance: binding changes include policy/confirmation/host/interaction.
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.policy);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.confirmation);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.hostBoundary);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.interaction);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.invocationTests);
}

function applyLocalization(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  edges: readonly UiInvalidationEdge[],
  capsules: Map<string, UiInvalidationCapsuleRef>,
  screenshotsByComponent: Map<string, string[]>,
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('localization_changed');
  for (const id of seeds) acc.components.add(id);

  const localized = neighbors(edges, seeds, 'incoming', LOCALIZATION_RELATIONS);
  for (const id of localized.ids) acc.components.add(id);
  acc.confidences.push(...localized.confidences);
  acc.fallbackTriggers.push(...localized.uncertain);

  const localeTargets = neighbors(
    edges,
    seeds,
    'outgoing',
    LOCALIZATION_RELATIONS,
  );
  for (const id of localeTargets.ids) acc.components.add(id);
  acc.confidences.push(...localeTargets.confidences);
  acc.fallbackTriggers.push(...localeTargets.uncertain);

  addScreenshotsForComponents(
    acc,
    acc.components,
    screenshotsByComponent,
    capsules,
    edges,
  );
  addScenarios(acc, LOCALIZATION_SCENARIOS, knownScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.textLayoutScreenshots);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.accessibleName);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.localeScenarios);
}

function applyAccessibility(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  knownScenarios?: ReadonlySet<string>,
): void {
  acc.reasons.add('component_changed');
  for (const id of seeds) acc.components.add(id);
  addScenarios(acc, ACCESSIBILITY_SCENARIOS, knownScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.accessibilityContracts);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.accessibilityScenarios);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.accessibleName);
}

function applyTestChange(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
): void {
  acc.reasons.add('dependency_changed');
  for (const id of seeds) acc.components.add(id);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.testArtifacts);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.directTests);
}

function applyScreenshotChange(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
  screenshotsByComponent: Map<string, string[]>,
  capsules: Map<string, UiInvalidationCapsuleRef>,
  edges: readonly UiInvalidationEdge[],
): void {
  acc.reasons.add('dependency_changed');
  for (const id of seeds) acc.components.add(id);
  addScreenshotsForComponents(
    acc,
    seeds,
    screenshotsByComponent,
    capsules,
    edges,
  );
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.screenshotArtifacts);
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.containingScreenshots);
}

function applyOther(
  acc: ImpactAccumulator,
  seeds: ReadonlySet<string>,
): void {
  acc.reasons.add('dependency_changed');
  for (const id of seeds) acc.components.add(id);
  // Conservative but still bounded: only seed components, escalate via fallback
  // when precision is unavailable.
  acc.fallbackTriggers.push(
    'other_change_kind:precision_unavailable_requires_broader_fallback',
  );
}

function detectContextUncertainty(
  context: UiInvalidationContext,
  edges: readonly UiInvalidationEdge[],
  seeds: ReadonlySet<string>,
): {
  reasons: UiInvalidationReason[];
  confidences: GuiExtractionConfidence[];
  explanations: string[];
} {
  const reasons: UiInvalidationReason[] = [];
  const confidences: GuiExtractionConfidence[] = [];
  const explanations: string[] = [];

  if (context.graph_confidence) {
    confidences.push(context.graph_confidence);
    if (isUncertaintyConfidence(context.graph_confidence)) {
      explanations.push(
        `graph_confidence=${context.graph_confidence}: typed closure is not exact`,
      );
    }
  }

  if (context.missing_edges) {
    reasons.push('missing_edge');
    confidences.push('conservative');
    explanations.push(
      'required dependency edges are missing; broader fallback requested',
    );
  }

  if (context.stale_edges) {
    reasons.push('stale_edge');
    confidences.push('conservative');
    explanations.push(
      'retained dependency edges are stale relative to source; broader fallback requested',
    );
  }

  if ((context.unresolved?.length ?? 0) > 0) {
    reasons.push('opaque_edge');
    confidences.push('opaque');
    explanations.push(
      `unresolved dynamic edges present (${context.unresolved!.length}); broader fallback requested`,
    );
  }

  if (context.force_fallback) {
    reasons.push('fallback_expansion');
    confidences.push('conservative');
    explanations.push(
      context.fallback_reason?.trim() ||
        'caller requested broader fallback due to planning uncertainty',
    );
  }

  // Empty seed with no graph facts is uncertain.
  if (seeds.size === 0 && edges.length === 0) {
    reasons.push('missing_edge');
    confidences.push('conservative');
    explanations.push(
      'change set has no component seeds and no typed edges; broader fallback requested',
    );
  }

  // Opaque/stale edges incident to seeds.
  for (const edge of edges) {
    const incident =
      seeds.has(edge.source_component_id) || seeds.has(edge.target_component_id);
    if (!incident) continue;
    if (edge.stale) {
      reasons.push('stale_edge');
      confidences.push('conservative');
      explanations.push(
        `stale edge ${edge.source_component_id}->${edge.target_component_id}`,
      );
    }
    if (edge.confidence === 'opaque') {
      reasons.push('opaque_edge');
      confidences.push('opaque');
      explanations.push(
        `opaque edge ${edge.source_component_id}->${edge.target_component_id}`,
      );
    } else if (edge.confidence === 'heuristic') {
      confidences.push('heuristic');
      explanations.push(
        `heuristic edge ${edge.source_component_id}->${edge.target_component_id}`,
      );
    }
  }

  return { reasons, confidences, explanations };
}

function expandFallback(
  acc: ImpactAccumulator,
  context: UiInvalidationContext,
  explanations: readonly string[],
): void {
  acc.reasons.add('fallback_expansion');
  acc.checks.add(UI_INVALIDATION_CHECK_IDS.broaderScreenFallback);

  // Broader fallback expands to the selected screen's controlled scenarios,
  // never every application in the repository.
  const known = context.known_scenario_ids
    ? new Set(context.known_scenario_ids)
    : undefined;
  addScenarios(acc, FALLBACK_SCREEN_SCENARIOS, known);

  // When known screen components are provided, expand to them (still one screen).
  for (const id of context.known_component_ids ?? []) {
    acc.components.add(id);
  }

  // Do NOT add every known screenshot automatically — only those belonging to
  // the expanded component set remain in scope. Callers that only know global
  // screenshot inventories without ownership still get scenario/check expansion
  // without claiming screenshot-level precision for unrelated surfaces.
  if (
    (context.known_screenshot_ids?.length ?? 0) > 0 &&
    (context.screenshots?.length ?? 0) === 0 &&
    (context.capsules?.length ?? 0) === 0
  ) {
    explanations;
    // Ownership unknown: leave screenshots empty rather than invalidate all.
  }
}

function deterministicPlanId(
  changeSetId: string,
  reasons: readonly string[],
  components: readonly string[],
  scenarios: readonly string[],
  checks: readonly string[],
  fallback: boolean,
): string {
  const body = canonicalJson({
    change_set_id: changeSetId,
    reasons,
    affected_component_ids: components,
    affected_scenario_ids: scenarios,
    affected_check_ids: checks,
    fallback_triggered: fallback,
    planner: UI_INVALIDATION_PLANNER_VERSION,
    profile: CANONICAL_JSON_PROFILE,
  });
  // Keep within identifier bounds: prefix + 32 hex chars.
  const digest = sha256Hex(body).slice(0, 32);
  const slug = changeSetId.replace(/^change:/, '').replace(/[^A-Za-z0-9._-]/g, '-');
  const truncated = slug.slice(0, 48) || 'plan';
  return `invalidate:${truncated}:${digest}`;
}

/**
 * Plan incremental invalidation for a normalized UiChangeSet against an
 * optional typed impact context. Returns a closed UiInvalidationPlan@1.
 */
export function planUiInvalidation(
  changeSetInput: UiChangeSet | unknown,
  options: UiInvalidationPlanOptions = {},
): UiInvalidationPlan {
  const normalized = decodeUiChangeSet(
    isPlainObject(changeSetInput)
      ? changeSetInput
      : uiChangeSetToDict(changeSetInput as UiChangeSet),
  );

  const context: UiInvalidationContext = options.context ?? {};
  const edges = [...(context.edges ?? [])];
  const capsules = indexCapsules(context.capsules);
  const screenshotsByComponent = indexScreenshotsByComponent(context.screenshots);
  const knownScenarios = context.known_scenario_ids
    ? new Set(context.known_scenario_ids)
    : undefined;

  const seeds = new Set<string>(normalized.component_ids);
  // When component seeds are omitted, recover them from action-binding capsules.
  if (seeds.size === 0 && normalized.action_ids.length > 0) {
    const actionSet = new Set(normalized.action_ids);
    for (const capsule of capsules.values()) {
      if ((capsule.action_binding_ids ?? []).some(id => actionSet.has(id))) {
        seeds.add(capsule.component_id);
      }
    }
  }

  const acc = createAccumulator();

  for (const kind of normalized.change_kinds) {
    switch (kind) {
      case 'component_implementation':
        applyComponentImplementation(
          acc,
          seeds,
          edges,
          capsules,
          screenshotsByComponent,
          knownScenarios,
        );
        break;
      case 'props_event_contract':
        applyPropsEventContract(acc, seeds, edges, knownScenarios);
        break;
      case 'state_machine':
        applyStateMachine(
          acc,
          seeds,
          normalized.state_ids,
          edges,
          capsules,
          screenshotsByComponent,
          knownScenarios,
        );
        break;
      case 'css_design_token':
        applyCssDesignToken(
          acc,
          seeds,
          edges,
          capsules,
          screenshotsByComponent,
          knownScenarios,
        );
        break;
      case 'action_binding':
        applyActionBinding(
          acc,
          seeds,
          normalized.action_ids,
          edges,
          knownScenarios,
        );
        break;
      case 'localization':
        applyLocalization(
          acc,
          seeds,
          edges,
          capsules,
          screenshotsByComponent,
          knownScenarios,
        );
        break;
      case 'accessibility':
        applyAccessibility(acc, seeds, knownScenarios);
        break;
      case 'test':
        applyTestChange(acc, seeds);
        break;
      case 'screenshot':
        applyScreenshotChange(
          acc,
          seeds,
          screenshotsByComponent,
          capsules,
          edges,
        );
        break;
      case 'other':
        applyOther(acc, seeds);
        break;
      default: {
        const _exhaustive: never = kind;
        throw new UiInvalidationError(
          `unsupported change kind: ${String(_exhaustive)}`,
        );
      }
    }
  }

  const uncertainty = detectContextUncertainty(context, edges, seeds);
  for (const reason of uncertainty.reasons) acc.reasons.add(reason);
  acc.confidences.push(...uncertainty.confidences);
  acc.fallbackTriggers.push(...uncertainty.explanations);

  // Edge-traversal uncertainty collected during kind application.
  for (const trigger of acc.fallbackTriggers) {
    if (trigger.startsWith('stale_edge:')) acc.reasons.add('stale_edge');
    if (trigger.startsWith('opaque_edge:') || trigger.startsWith('opaque_')) {
      acc.reasons.add('opaque_edge');
    }
    if (trigger.startsWith('missing_target:') || trigger.startsWith('missing_edge:')) {
      acc.reasons.add('missing_edge');
    }
    if (trigger.startsWith('heuristic_edge:') || trigger.startsWith('conservative_edge:')) {
      // Degrade confidence without always forcing full fallback reasons until
      // aggregated below.
      acc.confidences.push(
        trigger.startsWith('heuristic_edge:') ? 'heuristic' : 'conservative',
      );
    }
  }

  // Missing, stale, conservative, heuristic, or opaque evidence expands to a
  // documented broader fallback rather than pretending precision.
  let fallbackTriggered =
    Boolean(context.force_fallback) ||
    Boolean(context.missing_edges) ||
    Boolean(context.stale_edges) ||
    (context.unresolved?.length ?? 0) > 0 ||
    acc.reasons.has('missing_edge') ||
    acc.reasons.has('stale_edge') ||
    acc.reasons.has('opaque_edge') ||
    acc.fallbackTriggers.some(t => t.startsWith('other_change_kind:')) ||
    acc.confidences.some(c => c !== 'exact') ||
    context.graph_confidence === 'conservative' ||
    context.graph_confidence === 'heuristic' ||
    context.graph_confidence === 'opaque';

  const fallbackExplanations = sortedUnique([
    ...uncertainty.explanations,
    ...acc.fallbackTriggers.filter(
      t =>
        t.startsWith('stale_edge:') ||
        t.startsWith('opaque_edge:') ||
        t.startsWith('opaque_') ||
        t.startsWith('missing_') ||
        t.startsWith('heuristic_edge:') ||
        t.startsWith('conservative_edge:') ||
        t.startsWith('other_change_kind:') ||
        t.startsWith('unknown_relation:') ||
        t.includes('broader fallback'),
    ),
  ]);

  if (fallbackTriggered) {
    expandFallback(acc, context, fallbackExplanations);
    // Fallback always degrades confidence: precision was not available.
    acc.confidences.push('conservative');
  }

  if (acc.reasons.size === 0) {
    // Every admitted change kind maps to at least one reason.
    acc.reasons.add('dependency_changed');
  }

  const confidence = worstGuiExtractionConfidence(
    acc.confidences.length > 0 ? acc.confidences : (['exact'] as const),
  );

  const affectedComponents = sortedUnique(acc.components);
  const affectedScenarios = sortedUnique(acc.scenarios);
  const affectedChecks = sortedUnique(acc.checks);
  const reasons = sortedUnique(acc.reasons) as UiInvalidationReason[];

  const fallbackExplanation = fallbackTriggered
    ? fallbackExplanations.length > 0
      ? fallbackExplanations.join('; ')
      : 'Uncertainty in typed dependency closure requires broader screen-scoped fallback'
    : 'No uncertainty requires broad fallback.';

  const planId =
    options.planId ??
    deterministicPlanId(
      normalized.change_set_id,
      reasons,
      affectedComponents,
      affectedScenarios,
      affectedChecks,
      fallbackTriggered,
    );

  // Ensure plan_id is a valid identifier (digest may include only hex).
  const safePlanId = planId.length > 256 ? planId.slice(0, 256) : planId;

  return makeUiInvalidationPlan({
    plan_id: safePlanId,
    change_set_id: normalized.change_set_id,
    reasons,
    affected_component_ids: affectedComponents,
    affected_scenario_ids: affectedScenarios,
    affected_check_ids: affectedChecks,
    confidence,
    fallback_triggered: fallbackTriggered,
    fallback_explanation: fallbackExplanation,
  });
}

/**
 * Return screenshot IDs that a plan would invalidate for a given context.
 * Pure helper used by tests and callers that need precision metrics without
 * embedding screenshot IDs into the closed UiInvalidationPlan wire model.
 */
export function affectedScreenshotIds(
  changeSet: UiChangeSet | unknown,
  options: UiInvalidationPlanOptions = {},
): readonly string[] {
  const normalized = decodeUiChangeSet(
    isPlainObject(changeSet) ? changeSet : uiChangeSetToDict(changeSet as UiChangeSet),
  );
  const context: UiInvalidationContext = options.context ?? {};
  const edges = [...(context.edges ?? [])];
  const capsules = indexCapsules(context.capsules);
  const screenshotsByComponent = indexScreenshotsByComponent(context.screenshots);
  const seeds = new Set<string>(normalized.component_ids);
  const acc = createAccumulator();

  for (const kind of normalized.change_kinds) {
    switch (kind) {
      case 'component_implementation':
        applyComponentImplementation(
          acc,
          seeds,
          edges,
          capsules,
          screenshotsByComponent,
        );
        break;
      case 'css_design_token':
        applyCssDesignToken(
          acc,
          seeds,
          edges,
          capsules,
          screenshotsByComponent,
        );
        break;
      case 'localization':
        applyLocalization(
          acc,
          seeds,
          edges,
          capsules,
          screenshotsByComponent,
        );
        break;
      case 'state_machine':
        applyStateMachine(
          acc,
          seeds,
          normalized.state_ids,
          edges,
          capsules,
          screenshotsByComponent,
        );
        break;
      case 'screenshot':
        applyScreenshotChange(
          acc,
          seeds,
          screenshotsByComponent,
          capsules,
          edges,
        );
        break;
      default:
        for (const id of seeds) acc.components.add(id);
        addScreenshotsForComponents(
          acc,
          acc.components,
          screenshotsByComponent,
          capsules,
          edges,
        );
        break;
    }
  }

  return Object.freeze(sortedUnique(acc.screenshots));
}

export function createUiInvalidationPlanner(): UiInvalidationPlanner {
  return {
    interface: UI_INVALIDATION_PLANNER_INTERFACE,
    schema_version: UI_INVALIDATION_PLANNER_SCHEMA,
    extractorVersion: UI_INVALIDATION_PLANNER_VERSION,
    plan(changeSet, options) {
      return planUiInvalidation(changeSet, options);
    },
  };
}

export function normalizeUiChangeSet(raw: unknown): UiChangeSet {
  return decodeUiChangeSet(raw);
}

/**
 * VerifiedGuiOptimizer closed wire models (VGO-001 / VGO-002).
 *
 * Shared schema versions, enums, source spans, and dependency-edge fields
 * mirror the authoritative Python registry in
 * ipfs_datasets_py.logic.gui_optimizer. Scanner-local finding and scan-result
 * surfaces sit on top of those shared types. Decoders reject unknown keys,
 * invalid enums, non-finite numbers, and unsupported schema versions.
 * This module never executes repository source.
 */

// ---------------------------------------------------------------------------
// Package / interface identity (VGO-001)
// ---------------------------------------------------------------------------

export const PACKAGE_ID = 'ipfs-datasets.logic.gui-optimizer' as const;
export const CANONICAL_JSON_PROFILE = 'gui-optimizer-canonical-json/v1' as const;

/** Package-level label retained for scanner consumers; not a wire schema. */
export const GUI_OPTIMIZER_SCHEMA_VERSION = CANONICAL_JSON_PROFILE;

export const GUI_STATIC_EXTRACTOR_VERSION = 'gui-static-scanner@1.0.0' as const;
export const GUI_STATIC_SCANNER_INTERFACE = 'GuiStaticScanner@1' as const;
export const GUI_SOURCE_FINDING_INTERFACE = 'GuiSourceFinding@1' as const;
export const GUI_EXTRACTION_CONFIDENCE_INTERFACE =
  'GuiExtractionConfidence@1' as const;
export const GUI_STATIC_SCAN_RESULT_SCHEMA = 'gui-static-scan-result/v1' as const;
export const GUI_SOURCE_FINDING_SCHEMA = 'gui-source-finding/v1' as const;

export const GUI_APPLICATION_IDENTITY_INTERFACE =
  'GuiApplicationIdentity@1' as const;
export const GUI_SCREEN_IDENTITY_INTERFACE = 'GuiScreenIdentity@1' as const;
export const UI_COMPONENT_IDENTITY_INTERFACE = 'UiComponentIdentity@1' as const;
export const UI_COMPONENT_VERSION_INTERFACE = 'UiComponentVersion@1' as const;
export const UI_DEPENDENCY_EDGE_INTERFACE = 'UiDependencyEdge@1' as const;
export const SOURCE_SPAN_INTERFACE = 'SourceSpan@1' as const;

export const GUI_APPLICATION_IDENTITY_SCHEMA =
  'gui-application-identity/v1' as const;
export const GUI_SCREEN_IDENTITY_SCHEMA = 'gui-screen-identity/v1' as const;
export const UI_COMPONENT_IDENTITY_SCHEMA = 'ui-component-identity/v1' as const;
export const UI_COMPONENT_VERSION_SCHEMA = 'ui-component-version/v1' as const;
export const UI_DEPENDENCY_EDGE_SCHEMA = 'ui-dependency-edge/v1' as const;
export const SOURCE_SPAN_SCHEMA = 'gui-source-span/v1' as const;

/** Authoritative closed vocabulary of registered optimizer schema versions. */
export const REGISTERED_OPTIMIZER_SCHEMA_VERSIONS = Object.freeze([
  'gui-application-identity/v1',
  'gui-screen-identity/v1',
  'ui-component-identity/v1',
  'ui-component-version/v1',
  'ui-dependency-edge/v1',
  'ui-state-definition/v1',
  'ui-event-definition/v1',
  'ui-transition-definition/v1',
  'ui-action-binding/v1',
  'ui-layout-constraint/v1',
  'ui-accessibility-contract/v1',
  'ui-semantic-capsule/v1',
  'ui-change-set/v1',
  'ui-invalidation-plan/v1',
  'ui-evaluation-scenario/v1',
  'ui-baseline/v1',
  'ui-context-pack/v1',
  'gui-improvement-proposal/v1',
  'visual-regression-receipt/v1',
  'accessibility-receipt/v1',
  'interaction-receipt/v1',
  'ui-constraint-receipt/v1',
  'gui-improvement-receipt/v1',
  'gui-source-span/v1',
  'gui-viewport-spec/v1',
  'visual-change-region/v1',
  'ui-context-source/v1',
  'ui-context-style/v1',
  'ui-context-test/v1',
  'ui-context-state-machine/v1',
  'ui-context-formal-failure/v1',
  'ui-context-accessibility-violation/v1',
  'ui-context-visual-reference/v1',
  'ui-context-screenshot-description/v1',
  'ui-context-route/v1',
  'ui-context-metric-baseline/v1',
] as const);

export const SCHEMA_VERSION_BY_INTERFACE = Object.freeze({
  [GUI_APPLICATION_IDENTITY_INTERFACE]: GUI_APPLICATION_IDENTITY_SCHEMA,
  [GUI_SCREEN_IDENTITY_INTERFACE]: GUI_SCREEN_IDENTITY_SCHEMA,
  [UI_COMPONENT_IDENTITY_INTERFACE]: UI_COMPONENT_IDENTITY_SCHEMA,
  [UI_COMPONENT_VERSION_INTERFACE]: UI_COMPONENT_VERSION_SCHEMA,
  [UI_DEPENDENCY_EDGE_INTERFACE]: UI_DEPENDENCY_EDGE_SCHEMA,
  [SOURCE_SPAN_INTERFACE]: SOURCE_SPAN_SCHEMA,
} as const);

// ---------------------------------------------------------------------------
// Closed enums (VGO-001)
// ---------------------------------------------------------------------------

/** Analysis classification / extraction confidence (interchangeable labels). */
export const GUI_EXTRACTION_CONFIDENCE = Object.freeze([
  'exact',
  'conservative',
  'heuristic',
  'opaque',
] as const);
export type GuiExtractionConfidence = (typeof GUI_EXTRACTION_CONFIDENCE)[number];
export type GuiAnalysisClassification = GuiExtractionConfidence;
export type ExtractionConfidence = GuiExtractionConfidence;

export const GUI_VERIFICATION_STATUS = Object.freeze([
  'verified',
  'structurally_valid',
  'integrity_valid',
  'unverified',
  'stale',
  'invalid',
  'simulated',
] as const);
export type GuiVerificationStatus = (typeof GUI_VERIFICATION_STATUS)[number];

export const GUI_DEPENDENCY_RELATIONS = Object.freeze([
  'renders',
  'contains',
  'routes_to',
  'opens_dialog',
  'closes_dialog',
  'updates_state',
  'reads_state',
  'submits',
  'validates',
  'invokes_action',
  'requires_confirmation',
  'depends_on_policy',
  'depends_on_schema',
  'styled_by',
  'uses_design_token',
  'localized_by',
  'tested_by',
  'screenshot_by',
  'responsive_variant_of',
  'device_projection_of',
] as const);
export type GuiDependencyRelation = (typeof GUI_DEPENDENCY_RELATIONS)[number];

/** Scanner finding kinds (GuiSourceFinding@1 surface; not a Python enum). */
export const GUI_FINDING_KINDS = Object.freeze([
  'component',
  'element',
  'route',
  'dialog',
  'menu',
  'form',
  'button',
  'link',
  'input',
  'label',
  'validation',
  'prop',
  'state',
  'reducer',
  'event_handler',
  'async_operation',
  'keyboard',
  'focus',
  'accessibility',
  'style',
  'design_token',
  'media_query',
  'localization',
  'action_binding',
  'confirmation',
  'destructive_action',
  'external_navigation',
  'host_boundary',
  'template_html',
  'dynamic_uncertainty',
  'import',
  'script',
  'widget',
  'policy',
  'parent',
  'child',
] as const);
export type GuiFindingKind = (typeof GUI_FINDING_KINDS)[number];

/** ExtractionMethod (VGO-001). */
export const GUI_EXTRACTION_METHODS = Object.freeze([
  'typescript_compiler_api',
  'jsx_parser',
  'html_parser',
  'css_parser',
  'template_literal_scan',
  'manifest_read',
  'registry_read',
  'heuristic_inference',
  'manual_annotation',
] as const);
export type GuiExtractionMethod = (typeof GUI_EXTRACTION_METHODS)[number];

export const GUI_SOURCE_LANGUAGES = Object.freeze([
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'html',
  'css',
] as const);
export type GuiSourceLanguage = (typeof GUI_SOURCE_LANGUAGES)[number];

/** UiComponentKind (VGO-001). */
export const GUI_COMPONENT_KINDS = Object.freeze([
  'screen',
  'dialog',
  'form',
  'button',
  'link',
  'input',
  'label',
  'menu',
  'list',
  'table',
  'panel',
  'tab',
  'nav',
  'icon',
  'image',
  'text',
  'composite',
  'host_boundary',
  'unknown',
] as const);
export type GuiComponentKind = (typeof GUI_COMPONENT_KINDS)[number];

/** CompletenessBoundary (VGO-001). */
export const GUI_COMPLETENESS_BOUNDARIES = Object.freeze([
  'complete_within_boundary',
  'partial',
  'best_effort',
  'unknown',
] as const);
export type GuiCompletenessBoundary =
  (typeof GUI_COMPLETENESS_BOUNDARIES)[number];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GuiModelValidationError extends Error {
  readonly name = 'GuiModelValidationError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GuiModelDecodeError extends GuiModelValidationError {
  readonly name = 'GuiModelDecodeError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Wire record types
// ---------------------------------------------------------------------------

/** SourceSpan@1 — mirrors Python SourceSpan (no byte offsets on wire). */
export interface GuiSourceSpan {
  readonly interface: typeof SOURCE_SPAN_INTERFACE;
  readonly schema_version: typeof SOURCE_SPAN_SCHEMA;
  readonly path: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number | null;
  readonly end_column: number | null;
}

export interface GuiApplicationIdentity {
  readonly interface: typeof GUI_APPLICATION_IDENTITY_INTERFACE;
  readonly schema_version: typeof GUI_APPLICATION_IDENTITY_SCHEMA;
  readonly application_id: string;
  readonly package_namespace: string;
  readonly display_name: string;
  readonly repository_root: string;
}

export interface GuiScreenIdentity {
  readonly interface: typeof GUI_SCREEN_IDENTITY_INTERFACE;
  readonly schema_version: typeof GUI_SCREEN_IDENTITY_SCHEMA;
  readonly application_id: string;
  readonly screen_id: string;
  readonly route_id: string;
}

export interface UiComponentIdentity {
  readonly interface: typeof UI_COMPONENT_IDENTITY_INTERFACE;
  readonly schema_version: typeof UI_COMPONENT_IDENTITY_SCHEMA;
  readonly application_id: string;
  readonly screen_id: string;
  readonly qualified_name: string;
  readonly component_kind: GuiComponentKind;
  readonly package_namespace: string;
}

export interface UiComponentVersion {
  readonly interface: typeof UI_COMPONENT_VERSION_INTERFACE;
  readonly schema_version: typeof UI_COMPONENT_VERSION_SCHEMA;
  readonly stable_identity: UiComponentIdentity;
  readonly structure_digest: string;
  readonly props_digest: string;
  readonly state_digest: string;
  readonly handlers_digest: string;
  readonly accessibility_digest: string;
  readonly styles_digest: string;
  readonly actions_digest: string;
  readonly localization_digest: string;
  readonly extractor_version: string;
  readonly optimizer_schema_version: string;
}

/** UiDependencyEdge@1 — mirrors Python wire keys exactly. */
export interface UiDependencyEdge {
  readonly interface: typeof UI_DEPENDENCY_EDGE_INTERFACE;
  readonly schema_version: typeof UI_DEPENDENCY_EDGE_SCHEMA;
  readonly source_component_id: string;
  readonly target_component_id: string;
  readonly relation: GuiDependencyRelation;
  readonly extraction_method: GuiExtractionMethod;
  readonly extractor_version: string;
  readonly confidence: GuiExtractionConfidence;
  readonly source_span: GuiSourceSpan | null;
  readonly notes: string;
}

/** GuiSourceFinding@1 — scanner-local finding record. */
export interface GuiSourceFinding {
  readonly interface: typeof GUI_SOURCE_FINDING_INTERFACE;
  readonly schema_version: typeof GUI_SOURCE_FINDING_SCHEMA;
  readonly finding_id: string;
  readonly kind: GuiFindingKind;
  readonly name: string;
  readonly stable_identity: string;
  readonly path: string;
  readonly span: GuiSourceSpan;
  readonly confidence: GuiExtractionConfidence;
  readonly extraction_method: GuiExtractionMethod;
  readonly extractor_version: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly evidence: string;
  readonly requires_raw_source: boolean;
  readonly language: GuiSourceLanguage;
  /** Document-order ordinal used for identity disambiguation (not a line number). */
  readonly occurrence: number;
}

export interface GuiStaticScanResult {
  readonly interface: typeof GUI_STATIC_SCANNER_INTERFACE;
  readonly schema_version: typeof GUI_STATIC_SCAN_RESULT_SCHEMA;
  readonly extractor_version: string;
  readonly sources: readonly string[];
  readonly findings: readonly GuiSourceFinding[];
  readonly edges: readonly UiDependencyEdge[];
  readonly analysis_classification: GuiAnalysisClassification;
  readonly verification_status: GuiVerificationStatus;
  readonly completeness_boundary: GuiCompletenessBoundary;
  readonly unresolved: readonly string[];
  readonly executed_code: false;
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const CONFIDENCE_SET = new Set<string>(GUI_EXTRACTION_CONFIDENCE);
const VERIFICATION_SET = new Set<string>(GUI_VERIFICATION_STATUS);
const RELATION_SET = new Set<string>(GUI_DEPENDENCY_RELATIONS);
const FINDING_KIND_SET = new Set<string>(GUI_FINDING_KINDS);
const METHOD_SET = new Set<string>(GUI_EXTRACTION_METHODS);
const LANGUAGE_SET = new Set<string>(GUI_SOURCE_LANGUAGES);
const COMPONENT_KIND_SET = new Set<string>(GUI_COMPONENT_KINDS);
const COMPLETENESS_SET = new Set<string>(GUI_COMPLETENESS_BOUNDARIES);
const REGISTERED_SCHEMA_SET = new Set<string>(REGISTERED_OPTIMIZER_SCHEMA_VERSIONS);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const PATH_RE =
  /^(?!\/)(?!\.\.(?:\/|$))(?!.*\/\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._+/-]{0,511}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
// Allow package@version tokens used by GuiStaticScanner@1 (e.g. gui-static-scanner@1.0.0).
const EXTRACTOR_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,63}$/;

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
    throw new GuiModelDecodeError(
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
    throw new GuiModelDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GuiModelDecodeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new GuiModelDecodeError(`${field} must be a string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new GuiModelDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requirePath(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!PATH_RE.test(text)) {
    throw new GuiModelDecodeError(`${field} is not a valid repository-relative path`);
  }
  return text;
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new GuiModelDecodeError(
      `${field} must be a non-negative finite integer`,
    );
  }
  return value;
}

function requirePositiveInt(value: unknown, field: string): number {
  const n = requireNonNegativeInt(value, field);
  if (n < 1) {
    throw new GuiModelDecodeError(`${field} must be >= 1`);
  }
  return n;
}

function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T {
  const text = requireString(value, field);
  if (!allowed.has(text)) {
    throw new GuiModelDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new GuiModelDecodeError(`${field} must be a boolean`);
  }
  return value;
}

function requireStringRecord(
  value: unknown,
  field: string,
): Readonly<Record<string, string>> {
  if (!isPlainObject(value)) {
    throw new GuiModelDecodeError(`${field} must be an object`);
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      throw new GuiModelDecodeError(`${field}.${key} must be a string`);
    }
    out[key] = entry;
  }
  return Object.freeze(out);
}

function requireStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new GuiModelDecodeError(`${field} must be an array`);
  }
  return Object.freeze(
    value.map((entry, index) => requireString(entry, `${field}[${index}]`)),
  );
}

function requireExtractorVersion(value: unknown, field = 'extractor_version'): string {
  const text = requireString(value, field);
  if (!EXTRACTOR_VERSION_RE.test(text)) {
    throw new GuiModelDecodeError(`${field} is not a valid extractor version`);
  }
  return text;
}

function requireDigest(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!DIGEST_RE.test(text)) {
    throw new GuiModelDecodeError(`${field} must be a sha256: digest`);
  }
  return text;
}

function requireOptionalDigest(value: unknown, field: string): string {
  if (value === null || value === undefined || value === '') return '';
  return requireDigest(value, field);
}

// ---------------------------------------------------------------------------
// Field sets
// ---------------------------------------------------------------------------

const SOURCE_SPAN_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'path',
  'start_line',
  'start_column',
  'end_line',
  'end_column',
] as const);

const APPLICATION_IDENTITY_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'application_id',
  'package_namespace',
  'display_name',
  'repository_root',
] as const);

const SCREEN_IDENTITY_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'application_id',
  'screen_id',
  'route_id',
] as const);

const COMPONENT_IDENTITY_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'application_id',
  'screen_id',
  'qualified_name',
  'component_kind',
  'package_namespace',
] as const);

const COMPONENT_VERSION_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'stable_identity',
  'structure_digest',
  'props_digest',
  'state_digest',
  'handlers_digest',
  'accessibility_digest',
  'styles_digest',
  'actions_digest',
  'localization_digest',
  'extractor_version',
  'optimizer_schema_version',
] as const);

const DEPENDENCY_EDGE_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'source_component_id',
  'target_component_id',
  'relation',
  'extraction_method',
  'extractor_version',
  'confidence',
  'source_span',
  'notes',
] as const);

const SOURCE_FINDING_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'finding_id',
  'kind',
  'name',
  'stable_identity',
  'path',
  'span',
  'confidence',
  'extraction_method',
  'extractor_version',
  'attributes',
  'evidence',
  'requires_raw_source',
  'language',
  'occurrence',
] as const);

const SCAN_RESULT_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'extractor_version',
  'sources',
  'findings',
  'edges',
  'analysis_classification',
  'verification_status',
  'completeness_boundary',
  'unresolved',
  'executed_code',
] as const);

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

export function decodeGuiSourceSpan(raw: unknown): GuiSourceSpan {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('SourceSpan must be an object');
  }
  rejectUnknownKeys(raw, SOURCE_SPAN_FIELDS, 'SourceSpan');
  requireKeys(raw, SOURCE_SPAN_FIELDS, 'SourceSpan');
  if (raw.interface !== SOURCE_SPAN_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported SourceSpan interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== SOURCE_SPAN_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported SourceSpan schema_version: ${String(raw.schema_version)}`,
    );
  }
  const startLine = requirePositiveInt(raw.start_line, 'start_line');
  const startColumn = requireNonNegativeInt(raw.start_column, 'start_column');
  const endLine =
    raw.end_line === null
      ? null
      : requirePositiveInt(raw.end_line, 'end_line');
  const endColumn =
    raw.end_column === null
      ? null
      : requireNonNegativeInt(raw.end_column, 'end_column');
  if (endLine !== null && endLine < startLine) {
    throw new GuiModelDecodeError('end_line must be >= start_line');
  }
  return Object.freeze({
    interface: SOURCE_SPAN_INTERFACE,
    schema_version: SOURCE_SPAN_SCHEMA,
    path: requirePath(raw.path, 'path'),
    start_line: startLine,
    start_column: startColumn,
    end_line: endLine,
    end_column: endColumn,
  });
}

export function decodeGuiExtractionConfidence(
  raw: unknown,
): GuiExtractionConfidence {
  return requireEnum<GuiExtractionConfidence>(
    raw,
    'confidence',
    CONFIDENCE_SET,
  );
}

export function decodeGuiApplicationIdentity(
  raw: unknown,
): GuiApplicationIdentity {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiApplicationIdentity must be an object');
  }
  rejectUnknownKeys(raw, APPLICATION_IDENTITY_FIELDS, 'GuiApplicationIdentity');
  requireKeys(raw, APPLICATION_IDENTITY_FIELDS, 'GuiApplicationIdentity');
  if (raw.interface !== GUI_APPLICATION_IDENTITY_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== GUI_APPLICATION_IDENTITY_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: GUI_APPLICATION_IDENTITY_INTERFACE,
    schema_version: GUI_APPLICATION_IDENTITY_SCHEMA,
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    package_namespace: requireIdentifier(
      raw.package_namespace,
      'package_namespace',
    ),
    display_name: requireOptionalString(raw.display_name, 'display_name'),
    repository_root: requireOptionalString(raw.repository_root, 'repository_root'),
  });
}

export function decodeGuiScreenIdentity(raw: unknown): GuiScreenIdentity {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiScreenIdentity must be an object');
  }
  rejectUnknownKeys(raw, SCREEN_IDENTITY_FIELDS, 'GuiScreenIdentity');
  requireKeys(raw, SCREEN_IDENTITY_FIELDS, 'GuiScreenIdentity');
  if (raw.interface !== GUI_SCREEN_IDENTITY_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== GUI_SCREEN_IDENTITY_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: GUI_SCREEN_IDENTITY_INTERFACE,
    schema_version: GUI_SCREEN_IDENTITY_SCHEMA,
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    route_id: requireOptionalString(raw.route_id, 'route_id'),
  });
}

export function decodeUiComponentIdentity(raw: unknown): UiComponentIdentity {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('UiComponentIdentity must be an object');
  }
  rejectUnknownKeys(raw, COMPONENT_IDENTITY_FIELDS, 'UiComponentIdentity');
  requireKeys(raw, COMPONENT_IDENTITY_FIELDS, 'UiComponentIdentity');
  if (raw.interface !== UI_COMPONENT_IDENTITY_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_COMPONENT_IDENTITY_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_COMPONENT_IDENTITY_INTERFACE,
    schema_version: UI_COMPONENT_IDENTITY_SCHEMA,
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireOptionalString(raw.screen_id, 'screen_id'),
    qualified_name: requireIdentifier(raw.qualified_name, 'qualified_name'),
    component_kind: requireEnum<GuiComponentKind>(
      raw.component_kind,
      'component_kind',
      COMPONENT_KIND_SET,
    ),
    package_namespace: requireIdentifier(
      raw.package_namespace,
      'package_namespace',
    ),
  });
}

export function decodeUiComponentVersion(raw: unknown): UiComponentVersion {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('UiComponentVersion must be an object');
  }
  rejectUnknownKeys(raw, COMPONENT_VERSION_FIELDS, 'UiComponentVersion');
  requireKeys(raw, COMPONENT_VERSION_FIELDS, 'UiComponentVersion');
  if (raw.interface !== UI_COMPONENT_VERSION_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_COMPONENT_VERSION_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  const optimizerSchema = requireString(
    raw.optimizer_schema_version,
    'optimizer_schema_version',
  );
  if (!REGISTERED_SCHEMA_SET.has(optimizerSchema)) {
    throw new GuiModelDecodeError(
      `unregistered optimizer_schema_version: ${optimizerSchema}`,
    );
  }
  return Object.freeze({
    interface: UI_COMPONENT_VERSION_INTERFACE,
    schema_version: UI_COMPONENT_VERSION_SCHEMA,
    stable_identity: decodeUiComponentIdentity(raw.stable_identity),
    structure_digest: requireDigest(raw.structure_digest, 'structure_digest'),
    props_digest: requireDigest(raw.props_digest, 'props_digest'),
    state_digest: requireDigest(raw.state_digest, 'state_digest'),
    handlers_digest: requireDigest(raw.handlers_digest, 'handlers_digest'),
    accessibility_digest: requireDigest(
      raw.accessibility_digest,
      'accessibility_digest',
    ),
    styles_digest: requireDigest(raw.styles_digest, 'styles_digest'),
    actions_digest: requireDigest(raw.actions_digest, 'actions_digest'),
    localization_digest: requireOptionalDigest(
      raw.localization_digest,
      'localization_digest',
    ),
    extractor_version: requireExtractorVersion(raw.extractor_version),
    optimizer_schema_version: optimizerSchema,
  });
}

export function decodeUiDependencyEdge(raw: unknown): UiDependencyEdge {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('UiDependencyEdge must be an object');
  }
  rejectUnknownKeys(raw, DEPENDENCY_EDGE_FIELDS, 'UiDependencyEdge');
  requireKeys(raw, DEPENDENCY_EDGE_FIELDS, 'UiDependencyEdge');
  if (raw.interface !== UI_DEPENDENCY_EDGE_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_DEPENDENCY_EDGE_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  const sourceSpan =
    raw.source_span === null || raw.source_span === undefined
      ? null
      : decodeGuiSourceSpan(raw.source_span);
  return Object.freeze({
    interface: UI_DEPENDENCY_EDGE_INTERFACE,
    schema_version: UI_DEPENDENCY_EDGE_SCHEMA,
    source_component_id: requireIdentifier(
      raw.source_component_id,
      'source_component_id',
    ),
    target_component_id: requireIdentifier(
      raw.target_component_id,
      'target_component_id',
    ),
    relation: requireEnum<GuiDependencyRelation>(
      raw.relation,
      'relation',
      RELATION_SET,
    ),
    extraction_method: requireEnum<GuiExtractionMethod>(
      raw.extraction_method,
      'extraction_method',
      METHOD_SET,
    ),
    extractor_version: requireExtractorVersion(raw.extractor_version),
    confidence: decodeGuiExtractionConfidence(raw.confidence),
    source_span: sourceSpan,
    notes: requireOptionalString(raw.notes, 'notes'),
  });
}

export function decodeGuiSourceFinding(raw: unknown): GuiSourceFinding {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiSourceFinding must be an object');
  }
  rejectUnknownKeys(raw, SOURCE_FINDING_FIELDS, 'GuiSourceFinding');
  requireKeys(raw, SOURCE_FINDING_FIELDS, 'GuiSourceFinding');
  if (raw.interface !== GUI_SOURCE_FINDING_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== GUI_SOURCE_FINDING_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: GUI_SOURCE_FINDING_INTERFACE,
    schema_version: GUI_SOURCE_FINDING_SCHEMA,
    finding_id: requireIdentifier(raw.finding_id, 'finding_id'),
    kind: requireEnum<GuiFindingKind>(raw.kind, 'kind', FINDING_KIND_SET),
    name: requireString(raw.name, 'name'),
    stable_identity: requireIdentifier(raw.stable_identity, 'stable_identity'),
    path: requirePath(raw.path, 'path'),
    span: decodeGuiSourceSpan(raw.span),
    confidence: decodeGuiExtractionConfidence(raw.confidence),
    extraction_method: requireEnum<GuiExtractionMethod>(
      raw.extraction_method,
      'extraction_method',
      METHOD_SET,
    ),
    extractor_version: requireExtractorVersion(raw.extractor_version),
    attributes: requireStringRecord(raw.attributes, 'attributes'),
    evidence: requireString(raw.evidence, 'evidence'),
    requires_raw_source: requireBoolean(
      raw.requires_raw_source,
      'requires_raw_source',
    ),
    language: requireEnum<GuiSourceLanguage>(
      raw.language,
      'language',
      LANGUAGE_SET,
    ),
    occurrence: requirePositiveInt(raw.occurrence, 'occurrence'),
  });
}

export function decodeGuiStaticScanResult(raw: unknown): GuiStaticScanResult {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiStaticScanResult must be an object');
  }
  rejectUnknownKeys(raw, SCAN_RESULT_FIELDS, 'GuiStaticScanResult');
  requireKeys(raw, SCAN_RESULT_FIELDS, 'GuiStaticScanResult');
  if (raw.interface !== GUI_STATIC_SCANNER_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== GUI_STATIC_SCAN_RESULT_SCHEMA) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (raw.executed_code !== false) {
    throw new GuiModelDecodeError('executed_code must be false');
  }
  if (!Array.isArray(raw.findings)) {
    throw new GuiModelDecodeError('findings must be an array');
  }
  if (!Array.isArray(raw.edges)) {
    throw new GuiModelDecodeError('edges must be an array');
  }
  return Object.freeze({
    interface: GUI_STATIC_SCANNER_INTERFACE,
    schema_version: GUI_STATIC_SCAN_RESULT_SCHEMA,
    extractor_version: requireExtractorVersion(raw.extractor_version),
    sources: requireStringArray(raw.sources, 'sources'),
    findings: Object.freeze(raw.findings.map(decodeGuiSourceFinding)),
    edges: Object.freeze(raw.edges.map(decodeUiDependencyEdge)),
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
    completeness_boundary: requireEnum<GuiCompletenessBoundary>(
      raw.completeness_boundary,
      'completeness_boundary',
      COMPLETENESS_SET,
    ),
    unresolved: requireStringArray(raw.unresolved, 'unresolved'),
    executed_code: false,
  });
}

// ---------------------------------------------------------------------------
// Builders / ranking helpers
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Readonly<Record<GuiExtractionConfidence, number>> =
  Object.freeze({
    exact: 0,
    conservative: 1,
    heuristic: 2,
    opaque: 3,
  });

export function rankGuiExtractionConfidence(
  value: GuiExtractionConfidence,
): number {
  return CONFIDENCE_RANK[value];
}

export function worstGuiExtractionConfidence(
  values: readonly GuiExtractionConfidence[],
): GuiExtractionConfidence {
  if (values.length === 0) return 'exact';
  let worst: GuiExtractionConfidence = 'exact';
  for (const value of values) {
    if (rankGuiExtractionConfidence(value) > rankGuiExtractionConfidence(worst)) {
      worst = value;
    }
  }
  return worst;
}

export function isOpaqueConfidence(
  value: GuiExtractionConfidence,
): boolean {
  return value === 'opaque';
}

export function requiresRawSourceForConfidence(
  value: GuiExtractionConfidence,
): boolean {
  return value === 'opaque' || value === 'heuristic';
}

export function makeSourceSpan(partial: {
  path: string;
  start_line: number;
  start_column: number;
  end_line?: number | null;
  end_column?: number | null;
}): GuiSourceSpan {
  return Object.freeze({
    interface: SOURCE_SPAN_INTERFACE,
    schema_version: SOURCE_SPAN_SCHEMA,
    path: partial.path,
    start_line: partial.start_line,
    start_column: partial.start_column,
    end_line: partial.end_line ?? null,
    end_column: partial.end_column ?? null,
  });
}

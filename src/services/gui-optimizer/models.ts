/**
 * VerifiedGuiOptimizer closed wire models (GuiStaticScanner@1 surface).
 *
 * Strict TypeScript types and decoders for GUI static analysis. Analysis
 * classification is independent of verification status. Decoders reject
 * unknown keys, invalid enums, non-finite numbers, and unsupported schema
 * versions. This module never executes repository source.
 */

// ---------------------------------------------------------------------------
// Schema / extractor identity
// ---------------------------------------------------------------------------

export const GUI_OPTIMIZER_SCHEMA_VERSION = 'gui-optimizer/v1' as const;
export const GUI_STATIC_EXTRACTOR_VERSION = 'gui-static-scanner@1.0.0' as const;
export const GUI_STATIC_SCANNER_INTERFACE = 'GuiStaticScanner@1' as const;
export const GUI_SOURCE_FINDING_INTERFACE = 'GuiSourceFinding@1' as const;
export const GUI_EXTRACTION_CONFIDENCE_INTERFACE =
  'GuiExtractionConfidence@1' as const;

// ---------------------------------------------------------------------------
// Closed enums
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
] as const);
export type GuiFindingKind = (typeof GUI_FINDING_KINDS)[number];

export const GUI_EXTRACTION_METHODS = Object.freeze([
  'typescript_compiler_api',
  'jsx_ast',
  'template_literal_html',
  'html_tokenizer',
  'css_tokenizer',
  'pattern_match',
  'conservative_inference',
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

export const GUI_COMPONENT_KINDS = Object.freeze([
  'react_function',
  'react_class',
  'html_template',
  'web_component',
  'screen',
  'fragment',
  'unknown',
] as const);
export type GuiComponentKind = (typeof GUI_COMPONENT_KINDS)[number];

export const GUI_COMPLETENESS_BOUNDARIES = Object.freeze([
  'file',
  'component',
  'screen',
  'application',
  'partial',
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

export interface GuiSourceSpan {
  readonly path: string;
  readonly start_offset: number;
  readonly end_offset: number;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
}

export interface GuiApplicationIdentity {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly application_id: string;
  readonly package_namespace: string;
  readonly route_ids: readonly string[];
}

export interface GuiScreenIdentity {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly application_id: string;
  readonly screen_id: string;
  readonly route_id: string;
}

export interface UiComponentIdentity {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly application_id: string;
  readonly screen_id: string;
  readonly qualified_name: string;
  readonly component_kind: GuiComponentKind;
  readonly package_namespace: string;
}

export interface UiComponentVersion {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly component_identity: UiComponentIdentity;
  readonly structure_digest: string;
  readonly props_digest: string;
  readonly state_digest: string;
  readonly handlers_digest: string;
  readonly accessibility_digest: string;
  readonly style_digest: string;
  readonly action_digest: string;
  readonly extractor_version: string;
  readonly optimizer_schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
}

export interface UiDependencyEdge {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly edge_id: string;
  readonly source_identity: string;
  readonly target_identity: string;
  readonly relation: GuiDependencyRelation;
  readonly span: GuiSourceSpan | null;
  readonly extraction_method: GuiExtractionMethod;
  readonly confidence: GuiExtractionConfidence;
  readonly extractor_version: string;
}

export interface GuiSourceFinding {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
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
}

export interface GuiStaticScanResult {
  readonly schema_version: typeof GUI_OPTIMIZER_SCHEMA_VERSION;
  readonly extractor_version: string;
  readonly interface_id: typeof GUI_STATIC_SCANNER_INTERFACE;
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

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const PATH_RE = /^(?!\/)(?!.*\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._+/-]{0,1023}$/;
const DIGEST_RE = /^(sha256:)?[0-9a-f]{64}$/;

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

// ---------------------------------------------------------------------------
// Field sets
// ---------------------------------------------------------------------------

const SOURCE_SPAN_FIELDS = Object.freeze([
  'path',
  'start_offset',
  'end_offset',
  'start_line',
  'start_column',
  'end_line',
  'end_column',
] as const);

const APPLICATION_IDENTITY_FIELDS = Object.freeze([
  'schema_version',
  'application_id',
  'package_namespace',
  'route_ids',
] as const);

const SCREEN_IDENTITY_FIELDS = Object.freeze([
  'schema_version',
  'application_id',
  'screen_id',
  'route_id',
] as const);

const COMPONENT_IDENTITY_FIELDS = Object.freeze([
  'schema_version',
  'application_id',
  'screen_id',
  'qualified_name',
  'component_kind',
  'package_namespace',
] as const);

const COMPONENT_VERSION_FIELDS = Object.freeze([
  'schema_version',
  'component_identity',
  'structure_digest',
  'props_digest',
  'state_digest',
  'handlers_digest',
  'accessibility_digest',
  'style_digest',
  'action_digest',
  'extractor_version',
  'optimizer_schema_version',
] as const);

const DEPENDENCY_EDGE_FIELDS = Object.freeze([
  'schema_version',
  'edge_id',
  'source_identity',
  'target_identity',
  'relation',
  'span',
  'extraction_method',
  'confidence',
  'extractor_version',
] as const);

const SOURCE_FINDING_FIELDS = Object.freeze([
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
] as const);

const SCAN_RESULT_FIELDS = Object.freeze([
  'schema_version',
  'extractor_version',
  'interface_id',
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
    throw new GuiModelDecodeError('GuiSourceSpan must be an object');
  }
  rejectUnknownKeys(raw, SOURCE_SPAN_FIELDS, 'GuiSourceSpan');
  requireKeys(raw, SOURCE_SPAN_FIELDS, 'GuiSourceSpan');
  const start = requireNonNegativeInt(raw.start_offset, 'start_offset');
  const end = requireNonNegativeInt(raw.end_offset, 'end_offset');
  if (end < start) {
    throw new GuiModelDecodeError('end_offset must be >= start_offset');
  }
  const startLine = requireNonNegativeInt(raw.start_line, 'start_line');
  const endLine = requireNonNegativeInt(raw.end_line, 'end_line');
  if (startLine < 1 || endLine < 1) {
    throw new GuiModelDecodeError('line numbers are 1-based and must be >= 1');
  }
  return Object.freeze({
    path: requirePath(raw.path, 'path'),
    start_offset: start,
    end_offset: end,
    start_line: startLine,
    start_column: requireNonNegativeInt(raw.start_column, 'start_column'),
    end_line: endLine,
    end_column: requireNonNegativeInt(raw.end_column, 'end_column'),
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
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    package_namespace: requireIdentifier(
      raw.package_namespace,
      'package_namespace',
    ),
    route_ids: requireStringArray(raw.route_ids, 'route_ids'),
  });
}

export function decodeGuiScreenIdentity(raw: unknown): GuiScreenIdentity {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiScreenIdentity must be an object');
  }
  rejectUnknownKeys(raw, SCREEN_IDENTITY_FIELDS, 'GuiScreenIdentity');
  requireKeys(raw, SCREEN_IDENTITY_FIELDS, 'GuiScreenIdentity');
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    route_id: requireIdentifier(raw.route_id, 'route_id'),
  });
}

export function decodeUiComponentIdentity(raw: unknown): UiComponentIdentity {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('UiComponentIdentity must be an object');
  }
  rejectUnknownKeys(raw, COMPONENT_IDENTITY_FIELDS, 'UiComponentIdentity');
  requireKeys(raw, COMPONENT_IDENTITY_FIELDS, 'UiComponentIdentity');
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
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
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (raw.optimizer_schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported optimizer_schema_version: ${String(raw.optimizer_schema_version)}`,
    );
  }
  const digestFields = [
    'structure_digest',
    'props_digest',
    'state_digest',
    'handlers_digest',
    'accessibility_digest',
    'style_digest',
    'action_digest',
  ] as const;
  const digests: Record<(typeof digestFields)[number], string> = {
    structure_digest: '',
    props_digest: '',
    state_digest: '',
    handlers_digest: '',
    accessibility_digest: '',
    style_digest: '',
    action_digest: '',
  };
  for (const field of digestFields) {
    const value = requireString(raw[field], field);
    if (!DIGEST_RE.test(value)) {
      throw new GuiModelDecodeError(`${field} must be a sha256 digest`);
    }
    digests[field] = value;
  }
  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    component_identity: decodeUiComponentIdentity(raw.component_identity),
    ...digests,
    extractor_version: requireString(raw.extractor_version, 'extractor_version'),
    optimizer_schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
  });
}

export function decodeUiDependencyEdge(raw: unknown): UiDependencyEdge {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('UiDependencyEdge must be an object');
  }
  rejectUnknownKeys(raw, DEPENDENCY_EDGE_FIELDS, 'UiDependencyEdge');
  requireKeys(raw, DEPENDENCY_EDGE_FIELDS, 'UiDependencyEdge');
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  const span =
    raw.span === null || raw.span === undefined
      ? null
      : decodeGuiSourceSpan(raw.span);
  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    edge_id: requireIdentifier(raw.edge_id, 'edge_id'),
    source_identity: requireIdentifier(raw.source_identity, 'source_identity'),
    target_identity: requireIdentifier(raw.target_identity, 'target_identity'),
    relation: requireEnum<GuiDependencyRelation>(
      raw.relation,
      'relation',
      RELATION_SET,
    ),
    span,
    extraction_method: requireEnum<GuiExtractionMethod>(
      raw.extraction_method,
      'extraction_method',
      METHOD_SET,
    ),
    confidence: decodeGuiExtractionConfidence(raw.confidence),
    extractor_version: requireString(raw.extractor_version, 'extractor_version'),
  });
}

export function decodeGuiSourceFinding(raw: unknown): GuiSourceFinding {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiSourceFinding must be an object');
  }
  rejectUnknownKeys(raw, SOURCE_FINDING_FIELDS, 'GuiSourceFinding');
  requireKeys(raw, SOURCE_FINDING_FIELDS, 'GuiSourceFinding');
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
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
    extractor_version: requireString(raw.extractor_version, 'extractor_version'),
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
  });
}

export function decodeGuiStaticScanResult(raw: unknown): GuiStaticScanResult {
  if (!isPlainObject(raw)) {
    throw new GuiModelDecodeError('GuiStaticScanResult must be an object');
  }
  rejectUnknownKeys(raw, SCAN_RESULT_FIELDS, 'GuiStaticScanResult');
  requireKeys(raw, SCAN_RESULT_FIELDS, 'GuiStaticScanResult');
  if (raw.schema_version !== GUI_OPTIMIZER_SCHEMA_VERSION) {
    throw new GuiModelDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (raw.interface_id !== GUI_STATIC_SCANNER_INTERFACE) {
    throw new GuiModelDecodeError(
      `unsupported interface_id: ${String(raw.interface_id)}`,
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
    schema_version: GUI_OPTIMIZER_SCHEMA_VERSION,
    extractor_version: requireString(raw.extractor_version, 'extractor_version'),
    interface_id: GUI_STATIC_SCANNER_INTERFACE,
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

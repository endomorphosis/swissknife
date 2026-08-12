/**
 * Standalone GUI semantic capsules (VGO-012).
 *
 * Wire models:
 *   - UiSemanticCapsule@1 / ui-semantic-capsule/v1
 *   - UiCapsuleCompiler@1 / ui-capsule-compiler/v1
 *   - UiCompletenessBoundary@1 (closed completeness vocabulary)
 *
 * Compiles compact component/screen capsules from non-executing scanner
 * findings. Analysis classification stays independent from verification
 * status: content identity can prove integrity, never truth. Opaque or
 * stale inputs cannot be reported verified. Capsule bytes are deterministic
 * for identical findings. Never imports prior semantic-index/capsule
 * subsystems and never executes repository source.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  buildStableIdentity,
  compileComponentVersion,
  type ComponentMaterial,
} from './identity.js';
import {
  CANONICAL_JSON_PROFILE,
  GUI_COMPLETENESS_BOUNDARIES,
  GUI_COMPONENT_KINDS,
  GUI_EXTRACTION_CONFIDENCE,
  GUI_STATIC_EXTRACTOR_VERSION,
  GUI_STATIC_SCANNER_INTERFACE,
  GUI_STATIC_SCAN_RESULT_SCHEMA,
  GUI_VERIFICATION_STATUS,
  UI_COMPONENT_IDENTITY_INTERFACE,
  UI_COMPONENT_IDENTITY_SCHEMA,
  UI_COMPONENT_VERSION_INTERFACE,
  UI_COMPONENT_VERSION_SCHEMA,
  decodeUiComponentIdentity,
  decodeUiComponentVersion,
  type GuiAnalysisClassification,
  type GuiCompletenessBoundary,
  type GuiComponentKind,
  type GuiExtractionConfidence,
  type GuiFindingKind,
  type GuiSourceFinding,
  type GuiStaticScanResult,
  type GuiVerificationStatus,
  type UiComponentIdentity,
  type UiComponentVersion,
  worstGuiExtractionConfidence,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_SEMANTIC_CAPSULE_INTERFACE = 'UiSemanticCapsule@1' as const;
export const UI_SEMANTIC_CAPSULE_SCHEMA = 'ui-semantic-capsule/v1' as const;

export const UI_CAPSULE_COMPILER_INTERFACE = 'UiCapsuleCompiler@1' as const;
export const UI_CAPSULE_COMPILER_SCHEMA = 'ui-capsule-compiler/v1' as const;

export const UI_COMPLETENESS_BOUNDARY_INTERFACE =
  'UiCompletenessBoundary@1' as const;

/** Version token without '@' so UiComponentVersionCompiler@1 accepts it. */
export const UI_CAPSULE_COMPILER_VERSION =
  'gui-ui-capsule-compiler-1.0.0' as const;

/** Closed completeness vocabulary (UiCompletenessBoundary@1). */
export const UI_COMPLETENESS_BOUNDARIES = GUI_COMPLETENESS_BOUNDARIES;
export type UiCompletenessBoundary = GuiCompletenessBoundary;

export const UI_ANALYSIS_CLASSIFICATIONS = GUI_EXTRACTION_CONFIDENCE;
export type UiAnalysisClassification = GuiAnalysisClassification;

export const UI_VERIFICATION_STATUSES = GUI_VERIFICATION_STATUS;
export type UiVerificationStatus = GuiVerificationStatus;

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const MAX_IDENTIFIER_CHARS = 256 as const;
export const MAX_STRING_CHARS = 4096 as const;
export const MAX_COLLECTION_ITEMS = 1024 as const;

// ---------------------------------------------------------------------------
// Wire record
// ---------------------------------------------------------------------------

/**
 * UiSemanticCapsule@1 — closed GUI-specific semantic capsule.
 *
 * Distinct list fields (never combined legacy bags):
 * layout_role (string), responsive_behavior, keyboard_interactions,
 * focus_behavior, action_side_effects.
 */
export interface UiSemanticCapsule {
  readonly interface: typeof UI_SEMANTIC_CAPSULE_INTERFACE;
  readonly schema_version: typeof UI_SEMANTIC_CAPSULE_SCHEMA;
  readonly capsule_id: string;
  readonly stable_identity: UiComponentIdentity;
  readonly version_identity: UiComponentVersion;
  readonly application_id: string;
  readonly screen_id: string;
  readonly purpose: string;
  readonly component_type: string;
  readonly analysis_classification: UiAnalysisClassification;
  readonly verification_status: UiVerificationStatus;
  readonly completeness_boundary: UiCompletenessBoundary;
  readonly prop_names: readonly string[];
  readonly emitted_event_ids: readonly string[];
  readonly state_variable_ids: readonly string[];
  readonly visible_state_ids: readonly string[];
  readonly transition_ids: readonly string[];
  readonly action_binding_ids: readonly string[];
  readonly action_side_effects: readonly string[];
  readonly layout_role: string;
  readonly responsive_behavior: readonly string[];
  readonly keyboard_interactions: readonly string[];
  readonly focus_behavior: readonly string[];
  readonly child_component_ids: readonly string[];
  readonly dependency_edge_ids: readonly string[];
  readonly test_ids: readonly string[];
  readonly screenshot_ids: readonly string[];
  readonly known_violation_ids: readonly string[];
  readonly unresolved_dynamic_behavior: readonly string[];
  readonly localization_keys: readonly string[];
  readonly accessibility_contract_id: string;
  readonly confirmation_required: boolean;
  readonly loading_behavior: string;
  readonly empty_behavior: string;
  readonly success_behavior: string;
  readonly error_behavior: string;
  readonly source_revision: string;
}

/** Source-to-capsule traceability retained alongside the closed capsule wire. */
export interface UiCapsuleCompilationTrace {
  readonly capsule_id: string;
  readonly source_finding_ids: readonly string[];
  readonly source_paths: readonly string[];
  readonly primary_stable_identity: string;
  readonly extractor_version: typeof UI_CAPSULE_COMPILER_VERSION;
  readonly scanner_extractor_version: string;
  readonly executed_code: false;
}

export interface UiCapsuleCompileOptions {
  readonly applicationId?: string;
  readonly screenId?: string;
  readonly packageNamespace?: string;
  readonly capsuleId?: string;
  readonly purpose?: string;
  readonly sourceRevision?: string;
  /**
   * Caller-requested verification status. Opaque/stale/heuristic inputs force
   * a non-verified status; content identity never upgrades evidence.
   */
  readonly verificationStatus?: UiVerificationStatus;
  readonly completenessBoundary?: UiCompletenessBoundary;
}

export interface UiCapsuleFacts {
  readonly findings: readonly GuiSourceFinding[];
  readonly edges?: readonly {
    readonly source_component_id: string;
    readonly target_component_id: string;
    readonly relation: string;
  }[];
  readonly unresolved?: readonly string[];
  readonly sources?: readonly string[];
  readonly application_id?: string;
  readonly screen_id?: string;
  readonly package_namespace?: string;
  readonly analysis_classification?: UiAnalysisClassification;
  readonly verification_status?: UiVerificationStatus;
  readonly completeness_boundary?: UiCompletenessBoundary;
  readonly scanner_extractor_version?: string;
  readonly source_revision?: string;
  readonly purpose?: string;
  readonly capsule_id?: string;
  /** Optional explicit version material facets; otherwise derived from findings. */
  readonly version_material?: ComponentMaterial;
}

export interface UiCapsuleCompiler {
  readonly interface: typeof UI_CAPSULE_COMPILER_INTERFACE;
  readonly schema_version: typeof UI_CAPSULE_COMPILER_SCHEMA;
  readonly extractorVersion: typeof UI_CAPSULE_COMPILER_VERSION;
  compileFromScan(
    scan: GuiStaticScanResult,
    options?: UiCapsuleCompileOptions,
  ): UiSemanticCapsule;
  compileFromFacts(
    facts: UiCapsuleFacts,
    options?: UiCapsuleCompileOptions,
  ): UiSemanticCapsule;
  compileWithTrace(
    facts: UiCapsuleFacts,
    options?: UiCapsuleCompileOptions,
  ): {
    readonly capsule: UiSemanticCapsule;
    readonly trace: UiCapsuleCompilationTrace;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiCapsuleError extends Error {
  readonly name = 'UiCapsuleError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiCapsuleDecodeError extends UiCapsuleError {
  readonly name = 'UiCapsuleDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const ANALYSIS_SET = new Set<string>(UI_ANALYSIS_CLASSIFICATIONS);
const VERIFICATION_SET = new Set<string>(UI_VERIFICATION_STATUSES);
const COMPLETENESS_SET = new Set<string>(UI_COMPLETENESS_BOUNDARIES);
const COMPONENT_KIND_SET = new Set<string>(GUI_COMPONENT_KINDS);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

const CAPSULE_FIELDS = Object.freeze([
  'accessibility_contract_id',
  'action_binding_ids',
  'action_side_effects',
  'analysis_classification',
  'application_id',
  'capsule_id',
  'child_component_ids',
  'completeness_boundary',
  'component_type',
  'confirmation_required',
  'dependency_edge_ids',
  'emitted_event_ids',
  'empty_behavior',
  'error_behavior',
  'focus_behavior',
  'interface',
  'keyboard_interactions',
  'known_violation_ids',
  'layout_role',
  'loading_behavior',
  'localization_keys',
  'prop_names',
  'purpose',
  'responsive_behavior',
  'schema_version',
  'screen_id',
  'screenshot_ids',
  'source_revision',
  'stable_identity',
  'state_variable_ids',
  'success_behavior',
  'test_ids',
  'transition_ids',
  'unresolved_dynamic_behavior',
  'verification_status',
  'version_identity',
  'visible_state_ids',
] as const);

/** Removed combined fields that must never be accepted on wire. */
export const LEGACY_CAPSULE_FIELDS = Object.freeze([
  'keyboard_focus_behavior',
  'layout_responsive_behavior',
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
    throw new UiCapsuleDecodeError(
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
    throw new UiCapsuleDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiCapsuleDecodeError(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_STRING_CHARS) {
    throw new UiCapsuleDecodeError(
      `${field} exceeds maximum length of ${MAX_STRING_CHARS}`,
    );
  }
  if (value !== value.trim()) {
    throw new UiCapsuleDecodeError(
      `${field} must not have surrounding whitespace`,
    );
  }
  if (value.includes('\0')) {
    throw new UiCapsuleDecodeError(`${field} must not contain NUL bytes`);
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) {
    if (value === null) {
      throw new UiCapsuleDecodeError(`${field} must be a string`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new UiCapsuleDecodeError(`${field} must be a string`);
  }
  if (value === '') return '';
  return requireString(value, field);
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.length > MAX_IDENTIFIER_CHARS || !IDENTIFIER_RE.test(text)) {
    throw new UiCapsuleDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requireOptionalIdentifier(value: unknown, field: string): string {
  if (value === null || value === undefined) {
    if (value === null) {
      throw new UiCapsuleDecodeError(`${field} must be a string`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new UiCapsuleDecodeError(`${field} must be a string`);
  }
  if (value === '') return '';
  return requireIdentifier(value, field);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UiCapsuleDecodeError(`${field} must be a boolean`);
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
    throw new UiCapsuleDecodeError(
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
    throw new UiCapsuleDecodeError(`${field} must be an array`);
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    throw new UiCapsuleDecodeError(
      `${field} exceeds maximum of ${MAX_COLLECTION_ITEMS} items`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireIdentifier(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiCapsuleDecodeError(
        `${field} must not contain duplicate identifiers`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

function requireUniqueTexts(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiCapsuleDecodeError(`${field} must be an array`);
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    throw new UiCapsuleDecodeError(
      `${field} exceeds maximum of ${MAX_COLLECTION_ITEMS} items`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireString(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiCapsuleDecodeError(
        `${field} must not contain duplicate values`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Evidence independence / fail-closed verification
// ---------------------------------------------------------------------------

/**
 * Analysis classification and verification status are independent dimensions.
 * Content identity (integrity) never upgrades a claim to verified. Opaque or
 * stale inputs cannot be reported verified.
 */
export function resolveCapsuleVerificationStatus(input: {
  analysis_classification: UiAnalysisClassification;
  requested_status?: UiVerificationStatus | null;
  has_stale_input?: boolean;
  has_opaque_input?: boolean;
  has_integrity_only?: boolean;
}): UiVerificationStatus {
  const classification = requireEnum<UiAnalysisClassification>(
    input.analysis_classification,
    'analysis_classification',
    ANALYSIS_SET,
  );
  const requested = input.requested_status
    ? requireEnum<UiVerificationStatus>(
        input.requested_status,
        'verification_status',
        VERIFICATION_SET,
      )
    : 'unverified';

  // Stale / invalid / simulated outcomes are sticky and never promoted.
  if (requested === 'stale') return 'stale';
  if (requested === 'invalid') return 'invalid';
  if (requested === 'simulated') return 'simulated';

  const opaque =
    input.has_opaque_input === true ||
    classification === 'opaque' ||
    classification === 'heuristic';
  const stale = input.has_stale_input === true;

  if (opaque || stale) {
    if (requested === 'verified') {
      // Fail closed: never report opaque/stale data as verified.
      return stale ? 'stale' : 'unverified';
    }
    if (requested === 'integrity_valid' && opaque) {
      // Integrity can still bind bytes, but not under stale inputs.
      return stale ? 'stale' : 'integrity_valid';
    }
    return requested === 'structurally_valid' || requested === 'integrity_valid'
      ? requested
      : stale
        ? 'stale'
        : 'unverified';
  }

  if (input.has_integrity_only === true && requested === 'verified') {
    return 'integrity_valid';
  }

  // Exact/conservative analysis may keep a non-verified requested status.
  if (requested === 'verified' && classification !== 'exact') {
    return 'structurally_valid';
  }
  return requested;
}

export function assertCapsuleEvidenceDistinct(capsule: UiSemanticCapsule): void {
  // Dimensions must remain independently addressable.
  if (!ANALYSIS_SET.has(capsule.analysis_classification)) {
    throw new UiCapsuleError('analysis_classification is not a closed value');
  }
  if (!VERIFICATION_SET.has(capsule.verification_status)) {
    throw new UiCapsuleError('verification_status is not a closed value');
  }
  if (!COMPLETENESS_SET.has(capsule.completeness_boundary)) {
    throw new UiCapsuleError('completeness_boundary is not a closed value');
  }

  const opaque =
    capsule.analysis_classification === 'opaque' ||
    capsule.analysis_classification === 'heuristic';
  if (
    (opaque || capsule.verification_status === 'stale') &&
    capsule.verification_status === 'verified'
  ) {
    throw new UiCapsuleError(
      'opaque/stale capsule cannot be reported verified',
    );
  }
}

export function isVerifiedAllowed(input: {
  analysis_classification: UiAnalysisClassification;
  verification_status: UiVerificationStatus;
}): boolean {
  if (
    input.analysis_classification === 'opaque' ||
    input.analysis_classification === 'heuristic'
  ) {
    return false;
  }
  if (input.verification_status === 'stale') return false;
  return (
    input.analysis_classification === 'exact' &&
    input.verification_status === 'verified'
  );
}

// ---------------------------------------------------------------------------
// Decode / encode
// ---------------------------------------------------------------------------

export function decodeUiSemanticCapsule(raw: unknown): UiSemanticCapsule {
  if (!isPlainObject(raw)) {
    throw new UiCapsuleDecodeError('UiSemanticCapsule must be an object');
  }
  rejectUnknownKeys(raw, CAPSULE_FIELDS, 'UiSemanticCapsule');
  requireKeys(raw, CAPSULE_FIELDS, 'UiSemanticCapsule');

  if (raw.interface !== UI_SEMANTIC_CAPSULE_INTERFACE) {
    throw new UiCapsuleDecodeError(
      `unsupported interface: ${String(raw.interface)}; expected ${UI_SEMANTIC_CAPSULE_INTERFACE}`,
    );
  }
  if (raw.schema_version !== UI_SEMANTIC_CAPSULE_SCHEMA) {
    throw new UiCapsuleDecodeError(
      `unsupported schema_version: ${String(raw.schema_version)}; expected ${UI_SEMANTIC_CAPSULE_SCHEMA}`,
    );
  }

  for (const legacy of LEGACY_CAPSULE_FIELDS) {
    if (legacy in raw) {
      throw new UiCapsuleDecodeError(
        `UiSemanticCapsule rejected removed combined field ${legacy}`,
      );
    }
  }

  const analysis = requireEnum<UiAnalysisClassification>(
    raw.analysis_classification,
    'analysis_classification',
    ANALYSIS_SET,
  );
  const verification = requireEnum<UiVerificationStatus>(
    raw.verification_status,
    'verification_status',
    VERIFICATION_SET,
  );
  const completeness = requireEnum<UiCompletenessBoundary>(
    raw.completeness_boundary,
    'completeness_boundary',
    COMPLETENESS_SET,
  );

  // Fail closed on illegal evidence combinations at decode time.
  if (
    (analysis === 'opaque' ||
      analysis === 'heuristic' ||
      verification === 'stale') &&
    verification === 'verified'
  ) {
    throw new UiCapsuleDecodeError(
      'opaque/stale data cannot be reported verified',
    );
  }

  const capsule = Object.freeze({
    interface: UI_SEMANTIC_CAPSULE_INTERFACE,
    schema_version: UI_SEMANTIC_CAPSULE_SCHEMA,
    capsule_id: requireIdentifier(raw.capsule_id, 'capsule_id'),
    stable_identity: decodeUiComponentIdentity(raw.stable_identity),
    version_identity: decodeUiComponentVersion(raw.version_identity),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    purpose: requireString(raw.purpose, 'purpose'),
    component_type: requireString(raw.component_type, 'component_type'),
    analysis_classification: analysis,
    verification_status: verification,
    completeness_boundary: completeness,
    prop_names: requireUniqueTexts(raw.prop_names, 'prop_names'),
    emitted_event_ids: requireUniqueIdentifiers(
      raw.emitted_event_ids,
      'emitted_event_ids',
    ),
    state_variable_ids: requireUniqueIdentifiers(
      raw.state_variable_ids,
      'state_variable_ids',
    ),
    visible_state_ids: requireUniqueIdentifiers(
      raw.visible_state_ids,
      'visible_state_ids',
    ),
    transition_ids: requireUniqueIdentifiers(
      raw.transition_ids,
      'transition_ids',
    ),
    action_binding_ids: requireUniqueIdentifiers(
      raw.action_binding_ids,
      'action_binding_ids',
    ),
    action_side_effects: requireUniqueTexts(
      raw.action_side_effects,
      'action_side_effects',
    ),
    layout_role: requireString(raw.layout_role, 'layout_role'),
    responsive_behavior: requireUniqueTexts(
      raw.responsive_behavior,
      'responsive_behavior',
    ),
    keyboard_interactions: requireUniqueTexts(
      raw.keyboard_interactions,
      'keyboard_interactions',
    ),
    focus_behavior: requireUniqueTexts(raw.focus_behavior, 'focus_behavior'),
    child_component_ids: requireUniqueIdentifiers(
      raw.child_component_ids,
      'child_component_ids',
    ),
    dependency_edge_ids: requireUniqueIdentifiers(
      raw.dependency_edge_ids,
      'dependency_edge_ids',
    ),
    test_ids: requireUniqueIdentifiers(raw.test_ids, 'test_ids'),
    screenshot_ids: requireUniqueIdentifiers(
      raw.screenshot_ids,
      'screenshot_ids',
    ),
    known_violation_ids: requireUniqueIdentifiers(
      raw.known_violation_ids,
      'known_violation_ids',
    ),
    unresolved_dynamic_behavior: requireUniqueTexts(
      raw.unresolved_dynamic_behavior,
      'unresolved_dynamic_behavior',
    ),
    localization_keys: requireUniqueTexts(
      raw.localization_keys,
      'localization_keys',
    ),
    accessibility_contract_id: requireOptionalIdentifier(
      raw.accessibility_contract_id,
      'accessibility_contract_id',
    ),
    confirmation_required: requireBoolean(
      raw.confirmation_required,
      'confirmation_required',
    ),
    loading_behavior: requireOptionalString(
      raw.loading_behavior,
      'loading_behavior',
    ),
    empty_behavior: requireOptionalString(raw.empty_behavior, 'empty_behavior'),
    success_behavior: requireOptionalString(
      raw.success_behavior,
      'success_behavior',
    ),
    error_behavior: requireOptionalString(raw.error_behavior, 'error_behavior'),
    source_revision: requireOptionalString(
      raw.source_revision,
      'source_revision',
    ),
  }) as UiSemanticCapsule;

  assertCapsuleEvidenceDistinct(capsule);
  return capsule;
}

export function uiSemanticCapsuleToDict(
  capsule: UiSemanticCapsule,
): Record<string, unknown> {
  return {
    accessibility_contract_id: capsule.accessibility_contract_id,
    action_binding_ids: [...capsule.action_binding_ids],
    action_side_effects: [...capsule.action_side_effects],
    analysis_classification: capsule.analysis_classification,
    application_id: capsule.application_id,
    capsule_id: capsule.capsule_id,
    child_component_ids: [...capsule.child_component_ids],
    completeness_boundary: capsule.completeness_boundary,
    component_type: capsule.component_type,
    confirmation_required: capsule.confirmation_required,
    dependency_edge_ids: [...capsule.dependency_edge_ids],
    emitted_event_ids: [...capsule.emitted_event_ids],
    empty_behavior: capsule.empty_behavior,
    error_behavior: capsule.error_behavior,
    focus_behavior: [...capsule.focus_behavior],
    interface: capsule.interface,
    keyboard_interactions: [...capsule.keyboard_interactions],
    known_violation_ids: [...capsule.known_violation_ids],
    layout_role: capsule.layout_role,
    loading_behavior: capsule.loading_behavior,
    localization_keys: [...capsule.localization_keys],
    prop_names: [...capsule.prop_names],
    purpose: capsule.purpose,
    responsive_behavior: [...capsule.responsive_behavior],
    schema_version: capsule.schema_version,
    screen_id: capsule.screen_id,
    screenshot_ids: [...capsule.screenshot_ids],
    source_revision: capsule.source_revision,
    stable_identity: {
      application_id: capsule.stable_identity.application_id,
      component_kind: capsule.stable_identity.component_kind,
      interface: capsule.stable_identity.interface,
      package_namespace: capsule.stable_identity.package_namespace,
      qualified_name: capsule.stable_identity.qualified_name,
      schema_version: capsule.stable_identity.schema_version,
      screen_id: capsule.stable_identity.screen_id,
    },
    state_variable_ids: [...capsule.state_variable_ids],
    success_behavior: capsule.success_behavior,
    test_ids: [...capsule.test_ids],
    transition_ids: [...capsule.transition_ids],
    unresolved_dynamic_behavior: [...capsule.unresolved_dynamic_behavior],
    verification_status: capsule.verification_status,
    version_identity: {
      accessibility_digest: capsule.version_identity.accessibility_digest,
      actions_digest: capsule.version_identity.actions_digest,
      extractor_version: capsule.version_identity.extractor_version,
      handlers_digest: capsule.version_identity.handlers_digest,
      interface: capsule.version_identity.interface,
      localization_digest: capsule.version_identity.localization_digest,
      optimizer_schema_version:
        capsule.version_identity.optimizer_schema_version,
      props_digest: capsule.version_identity.props_digest,
      schema_version: capsule.version_identity.schema_version,
      stable_identity: {
        application_id: capsule.version_identity.stable_identity.application_id,
        component_kind: capsule.version_identity.stable_identity.component_kind,
        interface: capsule.version_identity.stable_identity.interface,
        package_namespace:
          capsule.version_identity.stable_identity.package_namespace,
        qualified_name: capsule.version_identity.stable_identity.qualified_name,
        schema_version: capsule.version_identity.stable_identity.schema_version,
        screen_id: capsule.version_identity.stable_identity.screen_id,
      },
      state_digest: capsule.version_identity.state_digest,
      structure_digest: capsule.version_identity.structure_digest,
      styles_digest: capsule.version_identity.styles_digest,
    },
    visible_state_ids: [...capsule.visible_state_ids],
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new UiCapsuleError('canonical JSON rejects non-finite numbers');
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
  throw new UiCapsuleError(`canonical JSON cannot encode ${typeof value}`);
}

export function serializeUiSemanticCapsule(capsule: UiSemanticCapsule): string {
  return canonicalJson(uiSemanticCapsuleToDict(capsule));
}

export function capsuleBytes(capsule: UiSemanticCapsule): Uint8Array {
  return new TextEncoder().encode(serializeUiSemanticCapsule(capsule));
}

export function capsuleDigest(capsule: UiSemanticCapsule): string {
  return `sha256:${sha256Hex(serializeUiSemanticCapsule(capsule))}`;
}

// ---------------------------------------------------------------------------
// Finding classification helpers
// ---------------------------------------------------------------------------

const COMPONENT_HOST_KINDS = new Set<GuiFindingKind>([
  'component',
  'element',
  'form',
  'dialog',
  'menu',
  'widget',
  'template_html',
]);

const PROP_KINDS = new Set<GuiFindingKind>(['prop']);
const EVENT_KINDS = new Set<GuiFindingKind>([
  'event_handler',
  'button',
  'link',
  'keyboard',
]);
const STATE_KINDS = new Set<GuiFindingKind>(['state', 'reducer']);
const ACTION_KINDS = new Set<GuiFindingKind>([
  'action_binding',
  'destructive_action',
  'confirmation',
]);
const LAYOUT_KINDS = new Set<GuiFindingKind>(['style', 'media_query']);
const A11Y_KINDS = new Set<GuiFindingKind>(['accessibility', 'label', 'focus']);
const LOCALIZATION_KINDS = new Set<GuiFindingKind>(['localization']);
const VIOLATION_KINDS = new Set<GuiFindingKind>([
  'dynamic_uncertainty',
  'host_boundary',
]);

function findingKindToComponentKind(kind: GuiFindingKind): GuiComponentKind {
  if (COMPONENT_KIND_SET.has(kind)) {
    return kind as GuiComponentKind;
  }
  switch (kind) {
    case 'component':
      return 'composite';
    case 'element':
      return 'composite';
    case 'template_html':
      return 'composite';
    case 'widget':
      return 'composite';
    case 'host_boundary':
      return 'host_boundary';
    default:
      return 'unknown';
  }
}

function sanitizeToken(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._:/#@-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return 'unknown';
  return cleaned.slice(0, 128);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function asIdentifierList(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (!raw || !IDENTIFIER_RE.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function asTextList(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const text = raw.trim();
    if (!text || text.length > MAX_STRING_CHARS) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function inferOutcomeBehavior(
  findings: readonly GuiSourceFinding[],
  kind: 'loading' | 'empty' | 'success' | 'error',
): string {
  const patterns: Record<typeof kind, RegExp> = {
    loading: /load|pending|spinner|progress/i,
    empty: /empty|no[-_ ]?data|zero[-_ ]?state/i,
    success: /success|complete|done|confirmed/i,
    error: /error|fail|invalid|reject/i,
  };
  const match = findings.find(
    f =>
      patterns[kind].test(f.name) ||
      patterns[kind].test(f.evidence) ||
      (f.kind === 'state' && patterns[kind].test(f.name)),
  );
  if (!match) return '';
  return `Observed ${kind} outcome from ${match.kind}:${match.name}`;
}

function deriveLayoutRole(
  primary: GuiSourceFinding | null,
  findings: readonly GuiSourceFinding[],
): string {
  if (primary?.attributes.layout_role) {
    return sanitizeToken(primary.attributes.layout_role);
  }
  if (primary?.kind === 'dialog') return 'modal-surface';
  if (primary?.kind === 'form') return 'form-surface';
  if (primary?.kind === 'menu') return 'menu-surface';
  if (findings.some(f => f.kind === 'dialog')) return 'dialog-host';
  return 'primary-surface';
}

function selectPrimaryFinding(
  findings: readonly GuiSourceFinding[],
): GuiSourceFinding | null {
  const ranked = [...findings].sort((a, b) => {
    const rank = (f: GuiSourceFinding): number => {
      if (f.kind === 'component') return 0;
      if (f.kind === 'form') return 1;
      if (f.kind === 'dialog') return 2;
      if (COMPONENT_HOST_KINDS.has(f.kind)) return 3;
      return 10;
    };
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.stable_identity.localeCompare(b.stable_identity);
  });
  return ranked[0] ?? null;
}

function resolveIdentityContext(
  findings: readonly GuiSourceFinding[],
  options: UiCapsuleCompileOptions,
  facts: UiCapsuleFacts,
): {
  applicationId: string;
  screenId: string;
  packageNamespace: string;
} {
  const primary = selectPrimaryFinding(findings);
  const attrs = primary?.attributes ?? {};
  return {
    applicationId:
      options.applicationId ??
      facts.application_id ??
      attrs.application_id ??
      'app:unknown',
    screenId:
      options.screenId ??
      facts.screen_id ??
      attrs.screen_id ??
      'screen:unknown',
    packageNamespace:
      options.packageNamespace ??
      facts.package_namespace ??
      attrs.package_namespace ??
      'org.hallucinate.swissknife.gui-optimizer',
  };
}

function deriveVersionMaterial(
  findings: readonly GuiSourceFinding[],
  buckets: CapsuleBuckets,
): ComponentMaterial {
  return {
    structure: {
      kinds: uniqueSorted(findings.map(f => f.kind)),
      names: uniqueSorted(findings.map(f => f.name)),
      identities: uniqueSorted(findings.map(f => f.stable_identity)),
    },
    props: { names: buckets.prop_names },
    state: {
      variables: buckets.state_variable_ids,
      visible: buckets.visible_state_ids,
      transitions: buckets.transition_ids,
    },
    handlers: {
      events: buckets.emitted_event_ids,
      keyboard: buckets.keyboard_interactions,
      focus: buckets.focus_behavior,
    },
    accessibility: {
      contract: buckets.accessibility_contract_id,
      violations: buckets.known_violation_ids,
    },
    styles: {
      layout_role: buckets.layout_role,
      responsive: buckets.responsive_behavior,
    },
    actions: {
      bindings: buckets.action_binding_ids,
      effects: buckets.action_side_effects,
      confirmation_required: buckets.confirmation_required,
    },
    localization: { keys: buckets.localization_keys },
  };
}

interface CapsuleBuckets {
  prop_names: string[];
  emitted_event_ids: string[];
  state_variable_ids: string[];
  visible_state_ids: string[];
  transition_ids: string[];
  action_binding_ids: string[];
  action_side_effects: string[];
  layout_role: string;
  responsive_behavior: string[];
  keyboard_interactions: string[];
  focus_behavior: string[];
  child_component_ids: string[];
  dependency_edge_ids: string[];
  test_ids: string[];
  screenshot_ids: string[];
  known_violation_ids: string[];
  unresolved_dynamic_behavior: string[];
  localization_keys: string[];
  accessibility_contract_id: string;
  confirmation_required: boolean;
  loading_behavior: string;
  empty_behavior: string;
  success_behavior: string;
  error_behavior: string;
  component_type: string;
  purpose: string;
}

function collectBuckets(
  findings: readonly GuiSourceFinding[],
  edges: readonly {
    readonly source_component_id: string;
    readonly target_component_id: string;
    readonly relation: string;
  }[],
  unresolved: readonly string[],
  primary: GuiSourceFinding | null,
  options: UiCapsuleCompileOptions,
  facts: UiCapsuleFacts,
): CapsuleBuckets {
  const propNames: string[] = [];
  const eventIds: string[] = [];
  const stateVars: string[] = [];
  const visibleStates: string[] = [];
  const transitionIds: string[] = [];
  const actionBindings: string[] = [];
  const actionEffects: string[] = [];
  const responsive: string[] = [];
  const keyboard: string[] = [];
  const focus: string[] = [];
  const children: string[] = [];
  const edgeIds: string[] = [];
  const tests: string[] = [];
  const screenshots: string[] = [];
  const violations: string[] = [];
  const unresolvedDynamic: string[] = [...unresolved];
  const localization: string[] = [];
  let accessibilityContract = '';
  let confirmationRequired = false;

  for (const finding of findings) {
    const attrs = finding.attributes ?? {};

    if (PROP_KINDS.has(finding.kind)) {
      propNames.push(finding.name);
    } else if (attrs.prop || attrs.prop_name) {
      propNames.push(attrs.prop || attrs.prop_name);
    }

    if (EVENT_KINDS.has(finding.kind)) {
      eventIds.push(finding.stable_identity);
      if (finding.kind === 'keyboard' || /key|enter|escape|tab/i.test(finding.name)) {
        keyboard.push(finding.name || finding.evidence);
      }
    }
    if (finding.kind === 'focus' || A11Y_KINDS.has(finding.kind)) {
      if (finding.kind === 'focus' || /focus/i.test(finding.name)) {
        focus.push(finding.name || finding.evidence);
      }
    }
    if (finding.kind === 'accessibility') {
      accessibilityContract =
        attrs.contract_id ||
        attrs.accessibility_contract_id ||
        finding.stable_identity;
    }

    if (STATE_KINDS.has(finding.kind)) {
      stateVars.push(finding.stable_identity);
      visibleStates.push(finding.stable_identity);
      if (attrs.transition_id) transitionIds.push(attrs.transition_id);
    }

    if (ACTION_KINDS.has(finding.kind)) {
      actionBindings.push(finding.stable_identity);
      if (attrs.effect || attrs.side_effect) {
        actionEffects.push(attrs.effect || attrs.side_effect);
      } else {
        actionEffects.push(finding.name);
      }
      if (
        finding.kind === 'confirmation' ||
        finding.kind === 'destructive_action' ||
        attrs.requires_confirmation === 'true'
      ) {
        confirmationRequired = true;
      }
    }

    if (LAYOUT_KINDS.has(finding.kind)) {
      if (finding.kind === 'media_query') {
        responsive.push(finding.name || finding.evidence);
      }
    }
    if (attrs.responsive || attrs.breakpoint) {
      responsive.push(attrs.responsive || attrs.breakpoint);
    }

    if (LOCALIZATION_KINDS.has(finding.kind)) {
      localization.push(attrs.key || finding.name);
    }

    if (
      finding.kind === 'component' ||
      finding.kind === 'element' ||
      finding.kind === 'form' ||
      finding.kind === 'dialog' ||
      finding.kind === 'menu' ||
      finding.kind === 'button' ||
      finding.kind === 'input' ||
      finding.kind === 'label' ||
      finding.kind === 'widget'
    ) {
      if (primary && finding.stable_identity !== primary.stable_identity) {
        children.push(finding.stable_identity);
      }
    }

    if (attrs.tested_by) tests.push(attrs.tested_by);
    if (attrs.test_id && IDENTIFIER_RE.test(attrs.test_id)) {
      // Bare test handles are not test artifact IDs unless already identifier-shaped.
      if (attrs.test_id.startsWith('test:')) tests.push(attrs.test_id);
    }
    if (attrs.screenshot_id) screenshots.push(attrs.screenshot_id);
    if (attrs.screenshot_by) screenshots.push(attrs.screenshot_by);

    if (
      VIOLATION_KINDS.has(finding.kind) ||
      finding.confidence === 'opaque' ||
      finding.requires_raw_source
    ) {
      unresolvedDynamic.push(
        `${finding.stable_identity}:${finding.confidence}`,
      );
    }
    if (attrs.violation_id) violations.push(attrs.violation_id);
    if (finding.kind === 'accessibility' && attrs.violation === 'true') {
      violations.push(finding.stable_identity);
    }
  }

  for (const edge of edges) {
    const edgeId = `edge:${sanitizeToken(edge.source_component_id)}:${sanitizeToken(edge.relation)}:${sanitizeToken(edge.target_component_id)}`;
    if (IDENTIFIER_RE.test(edgeId)) {
      edgeIds.push(edgeId);
    }
    if (
      edge.relation === 'contains' ||
      edge.relation === 'renders' ||
      edge.relation === 'opens_dialog'
    ) {
      if (
        primary &&
        edge.source_component_id === primary.stable_identity &&
        edge.target_component_id !== primary.stable_identity
      ) {
        children.push(edge.target_component_id);
      }
    }
    if (edge.relation === 'tested_by') {
      tests.push(edge.target_component_id);
    }
    if (edge.relation === 'screenshot_by') {
      screenshots.push(edge.target_component_id);
    }
    if (edge.relation === 'invokes_action') {
      actionBindings.push(edge.target_component_id);
    }
    if (edge.relation === 'requires_confirmation') {
      confirmationRequired = true;
    }
    if (edge.relation === 'localized_by') {
      localization.push(edge.target_component_id);
    }
    if (edge.relation === 'responsive_variant_of') {
      responsive.push(edge.target_component_id);
    }
  }

  const componentType =
    primary?.attributes.component_type ||
    primary?.kind ||
    (findings.length > 0 ? 'composite' : 'unknown');

  const purpose =
    options.purpose ??
    facts.purpose ??
    primary?.attributes.purpose ??
    (primary
      ? `Semantic capsule for ${primary.name}`
      : 'Semantic capsule with no primary component finding');

  return {
    prop_names: asTextList(propNames),
    emitted_event_ids: asIdentifierList(eventIds),
    state_variable_ids: asIdentifierList(stateVars),
    visible_state_ids: asIdentifierList(visibleStates),
    transition_ids: asIdentifierList(transitionIds),
    action_binding_ids: asIdentifierList(actionBindings),
    action_side_effects: asTextList(actionEffects),
    layout_role: deriveLayoutRole(primary, findings),
    responsive_behavior: asTextList(responsive),
    keyboard_interactions: asTextList(keyboard),
    focus_behavior: asTextList(focus),
    child_component_ids: asIdentifierList(children),
    dependency_edge_ids: asIdentifierList(edgeIds),
    test_ids: asIdentifierList(tests),
    screenshot_ids: asIdentifierList(screenshots),
    known_violation_ids: asIdentifierList(violations),
    unresolved_dynamic_behavior: asTextList(unresolvedDynamic),
    localization_keys: asTextList(localization),
    accessibility_contract_id: accessibilityContract,
    confirmation_required: confirmationRequired,
    loading_behavior: inferOutcomeBehavior(findings, 'loading'),
    empty_behavior: inferOutcomeBehavior(findings, 'empty'),
    success_behavior: inferOutcomeBehavior(findings, 'success'),
    error_behavior: inferOutcomeBehavior(findings, 'error'),
    component_type: sanitizeToken(componentType),
    purpose: purpose.slice(0, MAX_STRING_CHARS),
  };
}

function deriveCompleteness(
  classification: UiAnalysisClassification,
  unresolved: readonly string[],
  buckets: CapsuleBuckets,
  explicit?: UiCompletenessBoundary,
): UiCompletenessBoundary {
  if (explicit) {
    return requireEnum<UiCompletenessBoundary>(
      explicit,
      'completeness_boundary',
      COMPLETENESS_SET,
    );
  }
  if (classification === 'opaque') return 'unknown';
  if (classification === 'heuristic') return 'best_effort';
  if (
    unresolved.length > 0 ||
    buckets.unresolved_dynamic_behavior.length > 0 ||
    classification === 'conservative'
  ) {
    return 'partial';
  }
  return 'complete_within_boundary';
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export function compileUiSemanticCapsuleFromFacts(
  facts: UiCapsuleFacts,
  options: UiCapsuleCompileOptions = {},
): UiSemanticCapsule {
  const { capsule } = compileUiSemanticCapsuleWithTrace(facts, options);
  return capsule;
}

export function compileUiSemanticCapsuleWithTrace(
  facts: UiCapsuleFacts,
  options: UiCapsuleCompileOptions = {},
): {
  capsule: UiSemanticCapsule;
  trace: UiCapsuleCompilationTrace;
} {
  const findings = [...(facts.findings ?? [])];
  const edges = [...(facts.edges ?? [])];
  const unresolved = [...(facts.unresolved ?? [])];
  const sources = uniqueSorted(
    facts.sources ?? findings.map(f => f.path).filter(Boolean),
  );

  const identity = resolveIdentityContext(findings, options, facts);
  const primary = selectPrimaryFinding(findings);
  const buckets = collectBuckets(
    findings,
    edges,
    unresolved,
    primary,
    options,
    facts,
  );

  const confidences: GuiExtractionConfidence[] = findings.map(f => f.confidence);
  if (facts.analysis_classification) {
    confidences.push(facts.analysis_classification);
  }
  // Always fold caller classification with finding confidences so a stronger
  // label cannot hide opaque/heuristic evidence present in the fact set.
  const analysis = worstGuiExtractionConfidence(
    confidences.length > 0 ? confidences : ['exact'],
  );

  const hasOpaque =
    analysis === 'opaque' ||
    analysis === 'heuristic' ||
    findings.some(
      f =>
        f.confidence === 'opaque' ||
        f.confidence === 'heuristic' ||
        f.requires_raw_source,
    );
  // Stale inputs are sticky: a caller cannot upgrade facts/options marked stale
  // to verified by supplying a stronger requested status.
  const hasStaleInput =
    facts.verification_status === 'stale' ||
    options.verificationStatus === 'stale';
  const requestedStatus = hasStaleInput
    ? 'stale'
    : (options.verificationStatus ??
      facts.verification_status ??
      'unverified');

  const verification = resolveCapsuleVerificationStatus({
    analysis_classification: analysis,
    requested_status: requestedStatus,
    has_opaque_input: hasOpaque,
    has_stale_input: hasStaleInput,
  });

  const completeness = deriveCompleteness(
    analysis,
    unresolved,
    buckets,
    options.completenessBoundary ?? facts.completeness_boundary,
  );

  const qualifiedName =
    primary?.attributes.qualified_name ||
    primary?.stable_identity ||
    `${identity.applicationId}.${identity.screenId}.root`;

  const componentKind = findingKindToComponentKind(
    primary?.kind ?? 'component',
  );

  const stableIdentity = buildStableIdentity({
    applicationId: identity.applicationId,
    screenId: identity.screenId,
    qualifiedName: sanitizeToken(qualifiedName).replace(/^-+/, '') || 'root',
    componentKind,
    packageNamespace: identity.packageNamespace,
  });

  // Ensure qualified_name is a valid identifier for wire decode.
  const stableForWire: UiComponentIdentity = decodeUiComponentIdentity({
    interface: UI_COMPONENT_IDENTITY_INTERFACE,
    schema_version: UI_COMPONENT_IDENTITY_SCHEMA,
    application_id: stableIdentity.application_id,
    screen_id: stableIdentity.screen_id,
    qualified_name: IDENTIFIER_RE.test(stableIdentity.qualified_name)
      ? stableIdentity.qualified_name
      : sanitizeToken(stableIdentity.qualified_name),
    component_kind: stableIdentity.component_kind,
    package_namespace: stableIdentity.package_namespace,
  });

  const material =
    facts.version_material ?? deriveVersionMaterial(findings, buckets);
  const versionIdentity = compileComponentVersion(stableForWire, material, {
    extractorVersion: UI_CAPSULE_COMPILER_VERSION,
    optimizerSchemaVersion: UI_COMPONENT_VERSION_SCHEMA,
  });

  const capsuleId =
    options.capsuleId ??
    facts.capsule_id ??
    `capsule:${sanitizeToken(stableForWire.qualified_name)}`;

  const sourceRevision =
    options.sourceRevision ?? facts.source_revision ?? '';

  const capsule = decodeUiSemanticCapsule({
    interface: UI_SEMANTIC_CAPSULE_INTERFACE,
    schema_version: UI_SEMANTIC_CAPSULE_SCHEMA,
    capsule_id: capsuleId,
    stable_identity: {
      interface: stableForWire.interface,
      schema_version: stableForWire.schema_version,
      application_id: stableForWire.application_id,
      screen_id: stableForWire.screen_id,
      qualified_name: stableForWire.qualified_name,
      component_kind: stableForWire.component_kind,
      package_namespace: stableForWire.package_namespace,
    },
    version_identity: {
      interface: versionIdentity.interface,
      schema_version: versionIdentity.schema_version,
      stable_identity: {
        interface: versionIdentity.stable_identity.interface,
        schema_version: versionIdentity.stable_identity.schema_version,
        application_id: versionIdentity.stable_identity.application_id,
        screen_id: versionIdentity.stable_identity.screen_id,
        qualified_name: versionIdentity.stable_identity.qualified_name,
        component_kind: versionIdentity.stable_identity.component_kind,
        package_namespace: versionIdentity.stable_identity.package_namespace,
      },
      structure_digest: versionIdentity.structure_digest,
      props_digest: versionIdentity.props_digest,
      state_digest: versionIdentity.state_digest,
      handlers_digest: versionIdentity.handlers_digest,
      accessibility_digest: versionIdentity.accessibility_digest,
      styles_digest: versionIdentity.styles_digest,
      actions_digest: versionIdentity.actions_digest,
      localization_digest: versionIdentity.localization_digest,
      extractor_version: versionIdentity.extractor_version,
      optimizer_schema_version: versionIdentity.optimizer_schema_version,
    },
    application_id: identity.applicationId,
    screen_id: identity.screenId,
    purpose: buckets.purpose,
    component_type: buckets.component_type,
    analysis_classification: analysis,
    verification_status: verification,
    completeness_boundary: completeness,
    prop_names: buckets.prop_names,
    emitted_event_ids: buckets.emitted_event_ids,
    state_variable_ids: buckets.state_variable_ids,
    visible_state_ids: buckets.visible_state_ids,
    transition_ids: buckets.transition_ids,
    action_binding_ids: buckets.action_binding_ids,
    action_side_effects: buckets.action_side_effects,
    layout_role: buckets.layout_role,
    responsive_behavior: buckets.responsive_behavior,
    keyboard_interactions: buckets.keyboard_interactions,
    focus_behavior: buckets.focus_behavior,
    child_component_ids: buckets.child_component_ids,
    dependency_edge_ids: buckets.dependency_edge_ids,
    test_ids: buckets.test_ids,
    screenshot_ids: buckets.screenshot_ids,
    known_violation_ids: buckets.known_violation_ids,
    unresolved_dynamic_behavior: buckets.unresolved_dynamic_behavior,
    localization_keys: buckets.localization_keys,
    accessibility_contract_id: buckets.accessibility_contract_id,
    confirmation_required: buckets.confirmation_required,
    loading_behavior: buckets.loading_behavior,
    empty_behavior: buckets.empty_behavior,
    success_behavior: buckets.success_behavior,
    error_behavior: buckets.error_behavior,
    source_revision: sourceRevision,
  });

  const trace: UiCapsuleCompilationTrace = Object.freeze({
    capsule_id: capsule.capsule_id,
    source_finding_ids: Object.freeze(
      uniqueSorted(findings.map(f => f.finding_id)),
    ),
    source_paths: Object.freeze(sources),
    primary_stable_identity: primary?.stable_identity ?? capsule.stable_identity.qualified_name,
    extractor_version: UI_CAPSULE_COMPILER_VERSION,
    scanner_extractor_version:
      facts.scanner_extractor_version ?? GUI_STATIC_EXTRACTOR_VERSION,
    executed_code: false as const,
  });

  return { capsule, trace };
}

export function compileUiSemanticCapsuleFromScan(
  scan: GuiStaticScanResult,
  options: UiCapsuleCompileOptions = {},
): UiSemanticCapsule {
  if (scan.executed_code !== false) {
    throw new UiCapsuleError(
      'UiCapsuleCompiler refuses scans that executed repository code',
    );
  }
  if (scan.interface !== GUI_STATIC_SCANNER_INTERFACE) {
    throw new UiCapsuleError(
      `UiCapsuleCompiler refuses scan interface ${String(scan.interface)}`,
    );
  }
  if (scan.schema_version !== GUI_STATIC_SCAN_RESULT_SCHEMA) {
    throw new UiCapsuleError(
      `UiCapsuleCompiler refuses scan schema ${String(scan.schema_version)}`,
    );
  }
  return compileUiSemanticCapsuleFromFacts(
    {
      findings: scan.findings,
      edges: scan.edges,
      unresolved: scan.unresolved,
      sources: scan.sources,
      analysis_classification: scan.analysis_classification,
      verification_status: scan.verification_status,
      completeness_boundary: scan.completeness_boundary,
      scanner_extractor_version: scan.extractor_version,
    },
    options,
  );
}

export function createUiCapsuleCompiler(): UiCapsuleCompiler {
  return Object.freeze({
    interface: UI_CAPSULE_COMPILER_INTERFACE,
    schema_version: UI_CAPSULE_COMPILER_SCHEMA,
    extractorVersion: UI_CAPSULE_COMPILER_VERSION,
    compileFromScan(scan, options) {
      return compileUiSemanticCapsuleFromScan(scan, options);
    },
    compileFromFacts(facts, options) {
      return compileUiSemanticCapsuleFromFacts(facts, options);
    },
    compileWithTrace(facts, options) {
      return compileUiSemanticCapsuleWithTrace(facts, options);
    },
  });
}

/**
 * Build a closed UiSemanticCapsule from an already-materialized partial.
 * Useful for fixtures; still enforces evidence fail-closed rules.
 */
export function makeUiSemanticCapsule(
  partial: Partial<UiSemanticCapsule> &
    Pick<
      UiSemanticCapsule,
      'capsule_id' | 'stable_identity' | 'version_identity'
    >,
): UiSemanticCapsule {
  const analysis =
    partial.analysis_classification ??
    ('exact' as UiAnalysisClassification);
  const verification = resolveCapsuleVerificationStatus({
    analysis_classification: analysis,
    requested_status: partial.verification_status ?? 'unverified',
    has_opaque_input:
      analysis === 'opaque' || analysis === 'heuristic',
    has_stale_input: partial.verification_status === 'stale',
  });

  return decodeUiSemanticCapsule({
    interface: UI_SEMANTIC_CAPSULE_INTERFACE,
    schema_version: UI_SEMANTIC_CAPSULE_SCHEMA,
    capsule_id: partial.capsule_id,
    stable_identity: partial.stable_identity,
    version_identity: partial.version_identity,
    application_id:
      partial.application_id ?? partial.stable_identity.application_id,
    screen_id: partial.screen_id || partial.stable_identity.screen_id || 'screen:unknown',
    purpose: partial.purpose ?? 'Bounded GUI semantic capsule',
    component_type: partial.component_type ?? 'composite',
    analysis_classification: analysis,
    verification_status: verification,
    completeness_boundary:
      partial.completeness_boundary ?? 'complete_within_boundary',
    prop_names: partial.prop_names ?? [],
    emitted_event_ids: partial.emitted_event_ids ?? [],
    state_variable_ids: partial.state_variable_ids ?? [],
    visible_state_ids: partial.visible_state_ids ?? [],
    transition_ids: partial.transition_ids ?? [],
    action_binding_ids: partial.action_binding_ids ?? [],
    action_side_effects: partial.action_side_effects ?? [],
    layout_role: partial.layout_role ?? 'primary-surface',
    responsive_behavior: partial.responsive_behavior ?? [],
    keyboard_interactions: partial.keyboard_interactions ?? [],
    focus_behavior: partial.focus_behavior ?? [],
    child_component_ids: partial.child_component_ids ?? [],
    dependency_edge_ids: partial.dependency_edge_ids ?? [],
    test_ids: partial.test_ids ?? [],
    screenshot_ids: partial.screenshot_ids ?? [],
    known_violation_ids: partial.known_violation_ids ?? [],
    unresolved_dynamic_behavior: partial.unresolved_dynamic_behavior ?? [],
    localization_keys: partial.localization_keys ?? [],
    accessibility_contract_id: partial.accessibility_contract_id ?? '',
    confirmation_required: partial.confirmation_required ?? false,
    loading_behavior: partial.loading_behavior ?? '',
    empty_behavior: partial.empty_behavior ?? '',
    success_behavior: partial.success_behavior ?? '',
    error_behavior: partial.error_behavior ?? '',
    source_revision: partial.source_revision ?? '',
  });
}

export {
  CANONICAL_JSON_PROFILE,
  UI_COMPONENT_IDENTITY_INTERFACE,
  UI_COMPONENT_IDENTITY_SCHEMA,
  UI_COMPONENT_VERSION_INTERFACE,
  UI_COMPONENT_VERSION_SCHEMA,
};

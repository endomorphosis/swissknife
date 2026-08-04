/**
 * SwissKnife TypeScript UI/UX IR codec (UIR-032 / UIIRTypeScriptCodec@1).
 *
 * Exact-version decoding, closed field validation, set/ordered collection
 * semantics, and canonical bytes aligned with the Python authority in
 * `ipfs_datasets_py.logic.ui_ux_ir` (schema / decoder / canonicalize).
 *
 * This module does **not** invent TypeScript-only canonical fields. Wire
 * identity is produced only from the closed `ui-ux-ir/v1` envelope.
 */

import { sha256Hex, utf8Bytes } from '../shared/shared-browser-crypto.js';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  type MCPUIProfileDescriptor,
  type MCPUISection,
  type MCPUITemplateMapping,
} from './mcp-ui-profile.js';

// ---------------------------------------------------------------------------
// Schema constants (mirror Python schema.py)
// ---------------------------------------------------------------------------

export const UI_UX_IR_SCHEMA_VERSION = 'ui-ux-ir/v1' as const;
export const LEGACY_UI_UX_IR_SCHEMA_VERSION = 'ui-ux-ir/v0.1' as const;
export const UI_UX_IR_INTERFACE = 'UIUXIR@1' as const;

/** Closed top-level wire keys for ui-ux-ir/v1. */
export const UIIR_DOCUMENT_FIELDS = Object.freeze([
  'schema_version',
  'document_id',
  'title',
  'locale_defaults',
  'tags',
  'sources',
  'producer',
  'configuration',
  'review',
  'trust_bindings',
  'components',
  'composition_edges',
  'layout_regions',
  'layout_constraints',
  'design_token_refs',
  'state_variables',
  'states',
  'events',
  'transitions',
  'guards',
  'effects',
  'ux_tasks',
  'journeys',
  'success_failure_recovery',
  'feedback_contracts',
  'accessibility',
  'localization',
  'input_modality_requirements',
  'output_modality_requirements',
  'modality_alternatives',
  'device_capability_requirements',
  'adaptive_variants',
  'data_bindings',
  'content_references',
  'program_bindings',
  'intent_ir_bindings',
  'invocation_bindings',
  'mcp_idl_bindings',
  'formal_constraint_refs',
  'proof_obligation_refs',
  'entry_components',
  'initial_states',
  'terminal_outcomes',
  'extensions',
] as const);

export const UIIR_REQUIRED_PATHS = Object.freeze([
  'schema_version',
  'document_id',
  'title',
  'sources',
  'components',
  'entry_components',
  'terminal_outcomes',
] as const);

const UIIR_DOCUMENT_FIELD_SET = new Set<string>(UIIR_DOCUMENT_FIELDS);
const UIIR_REQUIRED_PATH_SET = new Set<string>(UIIR_REQUIRED_PATHS);

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const NAMESPACE_RE =
  /^[A-Za-z][A-Za-z0-9_-]{0,63}(\.[A-Za-z][A-Za-z0-9_-]{0,63}){0,7}$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

const FORBIDDEN_EXECUTABLE_KEYS = new Set([
  'callback',
  'callbacks',
  'code',
  'eval',
  'exec',
  'executable',
  'fn',
  'function',
  'handler',
  'handlers',
  'javascript',
  'jsx',
  'lambda',
  'listener',
  'listeners',
  'on_blur',
  'on_change',
  'on_click',
  'on_focus',
  'on_input',
  'on_submit',
  'onchange',
  'onclick',
  'onsubmit',
  'script',
  'scripts',
  'tsx',
]);

const FORBIDDEN_EXECUTABLE_KEY_PREFIXES = ['on_', 'handle_'] as const;

export const ReviewStatus = {
  UNREVIEWED: 'unreviewed',
  MACHINE_EXTRACTED: 'machine_extracted',
  HUMAN_REVIEWED: 'human_reviewed',
  TRUSTED_FIXTURE: 'trusted_fixture',
  QUARANTINED: 'quarantined',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const TerminalOutcomeKind = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
  DEGRADED: 'degraded',
} as const;
export type TerminalOutcomeKind =
  (typeof TerminalOutcomeKind)[keyof typeof TerminalOutcomeKind];

export const ProgramBindingTargetKind = {
  MCP_IDL: 'mcp_idl_interface_method_schema',
  INTENT_IR: 'intent_ir_document_action',
  INVOCATION_TEMPLATE: 'invocation_intent_template',
  LOCAL_STATE: 'local_state_only_transition',
  COMPOSITE_WORKFLOW: 'versioned_composite_workflow',
} as const;
export type ProgramBindingTargetKind =
  (typeof ProgramBindingTargetKind)[keyof typeof ProgramBindingTargetKind];

export const LayoutRegionKind = {
  FLOW: 'flow',
  GRID: 'grid',
  STACK: 'stack',
  OVERLAY: 'overlay',
  SPATIAL_ANCHOR: 'spatial_anchor',
  AUDIO_SEQUENCE: 'audio_sequence',
} as const;
export type LayoutRegionKind =
  (typeof LayoutRegionKind)[keyof typeof LayoutRegionKind];

export const AuthorityKind = {
  DECLARATION: 'declaration',
  INTERFACE: 'interface',
  LEGACY_ALIAS: 'legacy_alias',
  PROJECTION: 'projection',
  OBSERVATION: 'observation',
  MEDIATION: 'mediation',
  INVOCATION: 'invocation',
  SATISFIABILITY: 'satisfiability',
  MONITOR: 'monitor',
  PROOF: 'proof',
  ACCESSIBILITY: 'accessibility',
  POLICY: 'policy',
  SYNTHESIS_CANDIDATE: 'synthesis_candidate',
  CONFORMANCE: 'conformance',
} as const;
export type AuthorityKind = (typeof AuthorityKind)[keyof typeof AuthorityKind];

// ---------------------------------------------------------------------------
// Error classes (mirror Python UIIRValidationError / UIIRDecodeError)
// ---------------------------------------------------------------------------

export class UIIRValidationError extends Error {
  readonly name = 'UIIRValidationError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UIIRDecodeError extends UIIRValidationError {
  readonly name = 'UIIRDecodeError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Wire record types (JSON-ready; match Python *.to_dict() shapes)
// ---------------------------------------------------------------------------

export interface SourceSpan {
  start_char: number;
  end_char: number;
}

export interface UISourceRef {
  ref_id: string;
  source_uri: string;
  source_id: string;
  source_revision: string;
  content_sha256: string;
  container_uri?: string;
  container_sha256?: string;
  content_cid?: string;
  license_expression?: string;
  review_status?: ReviewStatus | string;
  span?: SourceSpan | null;
}

export interface UILocaleDefaults {
  default_locale: string;
  fallback_locales: string[];
  text_direction: string;
}

export interface UIProducer {
  producer_id: string;
  name: string;
  version?: string;
}

export interface UIConfiguration {
  configuration_id: string;
  profile?: string;
  settings?: Record<string, unknown>;
}

export interface UIReviewBinding {
  review_status: ReviewStatus | string;
  reviewer?: string;
  notes?: string;
}

export interface UITrustBinding {
  trust_id: string;
  authority_kind: AuthorityKind | string;
  subject_ref: string;
  source_ref_ids?: string[];
}

export interface UIComponent {
  component_id: string;
  role: string;
  purpose?: string;
  accessible_name_ref?: string;
  accessible_description_ref?: string;
  parent_id?: string;
  child_ids?: string[];
  modality_binding_ids?: string[];
  data_binding_ids?: string[];
  program_binding_ids?: string[];
  feedback_ids?: string[];
  privacy_sensitivity?: string;
  presentation_classification?: string;
  source_ref_ids?: string[];
}

export interface UILayoutRegion {
  region_id: string;
  kind: LayoutRegionKind | string;
  component_ids?: string[];
  source_ref_ids?: string[];
}

export interface UIProgramBinding {
  binding_id: string;
  target_kind: ProgramBindingTargetKind | string;
  target_ref: string;
  risk_class?: string;
  confirmation_class?: string;
  precondition_ids?: string[];
  effect_ids?: string[];
  verification_ids?: string[];
  source_ref_ids?: string[];
}

export interface UIMCPIDLBinding {
  binding_id: string;
  interface_cid: string;
  method_name: string;
  argument_schema_ref?: string;
  result_schema_ref?: string;
  source_ref_ids?: string[];
}

export interface UIFeedbackContract {
  feedback_id: string;
  channel: string;
  component_id?: string;
  source_ref_ids?: string[];
}

export interface UITerminalOutcome {
  outcome_id: string;
  kind: TerminalOutcomeKind | string;
  description?: string;
  source_ref_ids?: string[];
}

export interface UIStateVariable {
  variable_id: string;
  value_type: string;
  derived?: boolean;
  source_ref_ids?: string[];
}

export interface UIEvent {
  event_id: string;
  kind: string;
  source_ref_ids?: string[];
}

export interface UIUXTask {
  task_id: string;
  name: string;
  step_component_ids?: string[];
  source_ref_ids?: string[];
}

export interface UIJourney {
  journey_id: string;
  name: string;
  task_ids?: string[];
  source_ref_ids?: string[];
}

export interface UINamespacedExtension {
  extension_id: string;
  namespace: string;
  version: string;
  payload?: Record<string, unknown>;
  required?: boolean;
  source_ref_ids?: string[];
}

/**
 * Closed ui-ux-ir/v1 document envelope (JSON-ready).
 * Optional collections default to empty when omitted from input; toDict always
 * emits the full closed field set so canonical bytes match Python.
 */
export interface UIIRDocument {
  schema_version: string;
  document_id: string;
  title: string;
  sources: UISourceRef[];
  components: UIComponent[];
  entry_components: string[];
  terminal_outcomes: UITerminalOutcome[];
  locale_defaults?: UILocaleDefaults;
  tags?: string[];
  producer?: UIProducer | null;
  configuration?: UIConfiguration | null;
  review?: UIReviewBinding;
  trust_bindings?: UITrustBinding[];
  composition_edges?: unknown[];
  layout_regions?: UILayoutRegion[];
  layout_constraints?: unknown[];
  design_token_refs?: unknown[];
  state_variables?: UIStateVariable[];
  states?: unknown[];
  events?: UIEvent[];
  transitions?: unknown[];
  guards?: unknown[];
  effects?: unknown[];
  ux_tasks?: UIUXTask[];
  journeys?: UIJourney[];
  success_failure_recovery?: unknown[];
  feedback_contracts?: UIFeedbackContract[];
  accessibility?: unknown[];
  localization?: unknown[];
  input_modality_requirements?: unknown[];
  output_modality_requirements?: unknown[];
  modality_alternatives?: unknown[];
  device_capability_requirements?: unknown[];
  adaptive_variants?: unknown[];
  data_bindings?: unknown[];
  content_references?: unknown[];
  program_bindings?: UIProgramBinding[];
  intent_ir_bindings?: unknown[];
  invocation_bindings?: unknown[];
  mcp_idl_bindings?: UIMCPIDLBinding[];
  formal_constraint_refs?: unknown[];
  proof_obligation_refs?: unknown[];
  initial_states?: string[];
  extensions?: UINamespacedExtension[];
}

export interface UIIRConversionLoss {
  path: string;
  reason: string;
  source_value?: unknown;
}

export interface UIIRProfileConversionResult {
  document: UIIRDocument;
  losses: UIIRConversionLoss[];
  lossy: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isForbiddenExecutableKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (FORBIDDEN_EXECUTABLE_KEYS.has(lowered)) return true;
  return FORBIDDEN_EXECUTABLE_KEY_PREFIXES.some(prefix =>
    lowered.startsWith(prefix),
  );
}

function rejectExecutablePayload(
  value: unknown,
  label: string,
  path = '',
): void {
  if (typeof value === 'function') {
    throw new UIIRValidationError(
      `${label}${path} contains an executable callback`,
    );
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (isForbiddenExecutableKey(key)) {
        throw new UIIRValidationError(
          `${label}${path}/${key} is an executable callback field`,
        );
      }
      rejectExecutablePayload(item, label, `${path}/${key}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectExecutablePayload(item, label, `${path}[${index}]`),
    );
  }
}

function validateIdentifier(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
    throw new UIIRValidationError(`${name} is not a stable identifier`);
  }
}

function validateNonEmptyString(
  name: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new UIIRValidationError(`${name} must be a string`);
  }
  if (!value.trim()) {
    throw new UIIRValidationError(`${name} must not be empty`);
  }
}

function validateString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new UIIRValidationError(`${name} must be a string`);
  }
}

function validateSha256(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new UIIRValidationError(
      `${name} must be a lowercase 64-character SHA-256`,
    );
  }
}

function requireUnique(values: Iterable<string>, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new UIIRValidationError(`Duplicate ${label} id: ${value}`);
    }
    seen.add(value);
  }
}

function requireKnownRefs(
  values: Iterable<string>,
  known: Set<string>,
  label: string,
): void {
  const missing = [...new Set([...values].filter(v => !known.has(v)))].sort();
  if (missing.length > 0) {
    throw new UIIRValidationError(
      `${label} references unknown ids: ${missing.join(', ')}`,
    );
  }
}

function sortedUniqueStrings(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function asStringArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new UIIRDecodeError(`${label} must be an array`);
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new UIIRDecodeError(`${label} members must be non-empty strings`);
    }
    out.push(item);
  }
  return out;
}

function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new UIIRDecodeError(`${label} must be an object`);
  }
  return value;
}

function stableId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned && IDENTIFIER_RE.test(cleaned)) return cleaned;
  const digest = sha256Hex(raw).slice(0, 16);
  return `${fallbackPrefix}:${digest}`;
}

// ---------------------------------------------------------------------------
// Record normalization (mirror Python to_dict set/order semantics)
// ---------------------------------------------------------------------------

function normalizeSource(raw: UISourceRef): Record<string, unknown> {
  return {
    container_sha256: raw.container_sha256 ?? '',
    container_uri: raw.container_uri ?? '',
    content_cid: raw.content_cid ?? '',
    content_sha256: raw.content_sha256,
    license_expression: raw.license_expression ?? '',
    ref_id: raw.ref_id,
    review_status: raw.review_status ?? ReviewStatus.UNREVIEWED,
    source_id: raw.source_id,
    source_revision: raw.source_revision,
    source_uri: raw.source_uri,
    span: raw.span
      ? {
          end_char: raw.span.end_char,
          start_char: raw.span.start_char,
        }
      : null,
  };
}

function normalizeComponent(raw: UIComponent): Record<string, unknown> {
  return {
    accessible_description_ref: raw.accessible_description_ref ?? '',
    accessible_name_ref: raw.accessible_name_ref ?? '',
    child_ids: [...(raw.child_ids ?? [])],
    component_id: raw.component_id,
    data_binding_ids: sortedUniqueStrings(raw.data_binding_ids),
    feedback_ids: sortedUniqueStrings(raw.feedback_ids),
    modality_binding_ids: sortedUniqueStrings(raw.modality_binding_ids),
    parent_id: raw.parent_id ?? '',
    presentation_classification:
      raw.presentation_classification ?? 'interactive',
    privacy_sensitivity: raw.privacy_sensitivity ?? 'none',
    program_binding_ids: sortedUniqueStrings(raw.program_binding_ids),
    purpose: raw.purpose ?? '',
    role: raw.role,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
  };
}

function normalizeTerminal(raw: UITerminalOutcome): Record<string, unknown> {
  return {
    description: raw.description ?? '',
    kind: raw.kind,
    outcome_id: raw.outcome_id,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
  };
}

function normalizeLocale(
  raw: UILocaleDefaults | undefined,
): Record<string, unknown> {
  return {
    default_locale: raw?.default_locale ?? 'en',
    fallback_locales: [...(raw?.fallback_locales ?? [])],
    text_direction: raw?.text_direction ?? 'ltr',
  };
}

function normalizeReview(
  raw: UIReviewBinding | undefined,
): Record<string, unknown> {
  return {
    notes: raw?.notes ?? '',
    review_status: raw?.review_status ?? ReviewStatus.UNREVIEWED,
    reviewer: raw?.reviewer ?? '',
  };
}

function normalizeProducer(
  raw: UIProducer | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  return {
    name: raw.name,
    producer_id: raw.producer_id,
    version: raw.version ?? '',
  };
}

function normalizeConfiguration(
  raw: UIConfiguration | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  return {
    configuration_id: raw.configuration_id,
    profile: raw.profile ?? 'default',
    settings: { ...(raw.settings ?? {}) },
  };
}

function normalizeProgramBinding(
  raw: UIProgramBinding,
): Record<string, unknown> {
  return {
    binding_id: raw.binding_id,
    confirmation_class: raw.confirmation_class ?? 'none',
    effect_ids: sortedUniqueStrings(raw.effect_ids),
    precondition_ids: sortedUniqueStrings(raw.precondition_ids),
    risk_class: raw.risk_class ?? 'low',
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
    target_kind: raw.target_kind,
    target_ref: raw.target_ref,
    verification_ids: sortedUniqueStrings(raw.verification_ids),
  };
}

function normalizeMcpIdlBinding(
  raw: UIMCPIDLBinding,
): Record<string, unknown> {
  return {
    argument_schema_ref: raw.argument_schema_ref ?? '',
    binding_id: raw.binding_id,
    interface_cid: raw.interface_cid,
    method_name: raw.method_name,
    result_schema_ref: raw.result_schema_ref ?? '',
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
  };
}

function normalizeFeedback(raw: UIFeedbackContract): Record<string, unknown> {
  return {
    channel: raw.channel,
    component_id: raw.component_id ?? '',
    feedback_id: raw.feedback_id,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
  };
}

function normalizeLayoutRegion(raw: UILayoutRegion): Record<string, unknown> {
  return {
    component_ids: [...(raw.component_ids ?? [])],
    kind: raw.kind,
    region_id: raw.region_id,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
  };
}

function normalizeStateVariable(raw: UIStateVariable): Record<string, unknown> {
  return {
    derived: raw.derived ?? false,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
    value_type: raw.value_type,
    variable_id: raw.variable_id,
  };
}

function normalizeEvent(raw: UIEvent): Record<string, unknown> {
  return {
    event_id: raw.event_id,
    kind: raw.kind,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
  };
}

function normalizeTask(raw: UIUXTask): Record<string, unknown> {
  return {
    name: raw.name,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
    step_component_ids: [...(raw.step_component_ids ?? [])],
    task_id: raw.task_id,
  };
}

function normalizeJourney(raw: UIJourney): Record<string, unknown> {
  return {
    journey_id: raw.journey_id,
    name: raw.name,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
    task_ids: [...(raw.task_ids ?? [])],
  };
}

function normalizeTrust(raw: UITrustBinding): Record<string, unknown> {
  return {
    authority_kind: raw.authority_kind,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
    subject_ref: raw.subject_ref,
    trust_id: raw.trust_id,
  };
}

function normalizeExtension(
  raw: UINamespacedExtension,
): Record<string, unknown> {
  return {
    extension_id: raw.extension_id,
    namespace: raw.namespace,
    payload: { ...(raw.payload ?? {}) },
    required: raw.required ?? false,
    source_ref_ids: sortedUniqueStrings(raw.source_ref_ids),
    version: raw.version,
  };
}

function sortByKey<T>(
  items: readonly T[] | undefined,
  keyFn: (item: T) => string,
): T[] {
  return [...(items ?? [])].sort((a, b) =>
    keyFn(a).localeCompare(keyFn(b), 'en'),
  );
}

/**
 * Emit the full closed envelope payload (Python UIIRDocument.to_dict parity).
 * Never adds TypeScript-only fields.
 */
export function uiIrToDict(
  document: UIIRDocument | Record<string, unknown>,
): Record<string, unknown> {
  const doc = document as UIIRDocument;
  return {
    accessibility: sortByKey(
      (doc.accessibility as Array<{ accessibility_id?: string }> | undefined) ??
        [],
      item => String(item.accessibility_id ?? ''),
    ),
    adaptive_variants: sortByKey(
      (doc.adaptive_variants as Array<{ variant_id?: string }> | undefined) ??
        [],
      item => String(item.variant_id ?? ''),
    ),
    components: sortByKey(doc.components ?? [], item => item.component_id).map(
      normalizeComponent,
    ),
    composition_edges: sortByKey(
      (doc.composition_edges as Array<{ edge_id?: string }> | undefined) ?? [],
      item => String(item.edge_id ?? ''),
    ),
    configuration: normalizeConfiguration(doc.configuration),
    content_references: sortByKey(
      (doc.content_references as Array<{ content_id?: string }> | undefined) ??
        [],
      item => String(item.content_id ?? ''),
    ),
    data_bindings: sortByKey(
      (doc.data_bindings as Array<{ binding_id?: string }> | undefined) ?? [],
      item => String(item.binding_id ?? ''),
    ),
    design_token_refs: sortByKey(
      (doc.design_token_refs as Array<{ token_id?: string }> | undefined) ?? [],
      item => String(item.token_id ?? ''),
    ),
    device_capability_requirements: sortByKey(
      (doc.device_capability_requirements as
        | Array<{ requirement_id?: string }>
        | undefined) ?? [],
      item => String(item.requirement_id ?? ''),
    ),
    document_id: doc.document_id,
    effects: sortByKey(
      (doc.effects as Array<{ effect_id?: string }> | undefined) ?? [],
      item => String(item.effect_id ?? ''),
    ),
    entry_components: sortedUniqueStrings(doc.entry_components),
    events: sortByKey(doc.events ?? [], item => item.event_id).map(
      normalizeEvent,
    ),
    extensions: sortByKey(doc.extensions ?? [], item => item.extension_id).map(
      normalizeExtension,
    ),
    feedback_contracts: sortByKey(
      doc.feedback_contracts ?? [],
      item => item.feedback_id,
    ).map(normalizeFeedback),
    formal_constraint_refs: sortByKey(
      (doc.formal_constraint_refs as
        | Array<{ constraint_id?: string }>
        | undefined) ?? [],
      item => String(item.constraint_id ?? ''),
    ),
    guards: sortByKey(
      (doc.guards as Array<{ guard_id?: string }> | undefined) ?? [],
      item => String(item.guard_id ?? ''),
    ),
    initial_states: sortedUniqueStrings(doc.initial_states),
    input_modality_requirements: sortByKey(
      (doc.input_modality_requirements as
        | Array<{ requirement_id?: string }>
        | undefined) ?? [],
      item => String(item.requirement_id ?? ''),
    ),
    intent_ir_bindings: sortByKey(
      (doc.intent_ir_bindings as Array<{ binding_id?: string }> | undefined) ??
        [],
      item => String(item.binding_id ?? ''),
    ),
    invocation_bindings: sortByKey(
      (doc.invocation_bindings as Array<{ binding_id?: string }> | undefined) ??
        [],
      item => String(item.binding_id ?? ''),
    ),
    journeys: sortByKey(doc.journeys ?? [], item => item.journey_id).map(
      normalizeJourney,
    ),
    layout_constraints: sortByKey(
      (doc.layout_constraints as Array<{ constraint_id?: string }> | undefined) ??
        [],
      item => String(item.constraint_id ?? ''),
    ),
    layout_regions: sortByKey(
      doc.layout_regions ?? [],
      item => item.region_id,
    ).map(normalizeLayoutRegion),
    locale_defaults: normalizeLocale(doc.locale_defaults),
    localization: sortByKey(
      (doc.localization as Array<{ localization_id?: string }> | undefined) ??
        [],
      item => String(item.localization_id ?? ''),
    ),
    mcp_idl_bindings: sortByKey(
      doc.mcp_idl_bindings ?? [],
      item => item.binding_id,
    ).map(normalizeMcpIdlBinding),
    modality_alternatives: sortByKey(
      (doc.modality_alternatives as
        | Array<{ alternative_id?: string }>
        | undefined) ?? [],
      item => String(item.alternative_id ?? ''),
    ),
    output_modality_requirements: sortByKey(
      (doc.output_modality_requirements as
        | Array<{ requirement_id?: string }>
        | undefined) ?? [],
      item => String(item.requirement_id ?? ''),
    ),
    producer: normalizeProducer(doc.producer),
    program_bindings: sortByKey(
      doc.program_bindings ?? [],
      item => item.binding_id,
    ).map(normalizeProgramBinding),
    proof_obligation_refs: sortByKey(
      (doc.proof_obligation_refs as
        | Array<{ obligation_id?: string }>
        | undefined) ?? [],
      item => String(item.obligation_id ?? ''),
    ),
    review: normalizeReview(doc.review),
    schema_version: doc.schema_version || UI_UX_IR_SCHEMA_VERSION,
    sources: sortByKey(doc.sources ?? [], item => item.ref_id).map(
      normalizeSource,
    ),
    state_variables: sortByKey(
      doc.state_variables ?? [],
      item => item.variable_id,
    ).map(normalizeStateVariable),
    states: sortByKey(
      (doc.states as Array<{ state_id?: string }> | undefined) ?? [],
      item => String(item.state_id ?? ''),
    ),
    success_failure_recovery: sortByKey(
      (doc.success_failure_recovery as Array<{ path_id?: string }> | undefined) ??
        [],
      item => String(item.path_id ?? ''),
    ),
    tags: sortedUniqueStrings(doc.tags),
    terminal_outcomes: sortByKey(
      doc.terminal_outcomes ?? [],
      item => item.outcome_id,
    ).map(normalizeTerminal),
    title: doc.title,
    transitions: sortByKey(
      (doc.transitions as Array<{ transition_id?: string }> | undefined) ?? [],
      item => String(item.transition_id ?? ''),
    ),
    trust_bindings: sortByKey(
      doc.trust_bindings ?? [],
      item => item.trust_id,
    ).map(normalizeTrust),
    ux_tasks: sortByKey(doc.ux_tasks ?? [], item => item.task_id).map(
      normalizeTask,
    ),
  };
}

// ---------------------------------------------------------------------------
// Canonicalization (mirror Python canonicalize.py)
// ---------------------------------------------------------------------------

function normalizeCanonical(value: unknown): unknown {
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalizeCanonical(value[key]);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeCanonical(item));
  }
  return value;
}

/**
 * Ensure ASCII-only JSON text (Python json.dumps ensure_ascii=True parity).
 */
function ensureAsciiJson(text: string): string {
  return text.replace(/[\u007f-\uffff]/g, ch => {
    const code = ch.charCodeAt(0);
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

/**
 * Return deterministic UTF-8 JSON bytes for a validated declaration.
 * Canonical identity is independent of optional CID availability.
 */
export function canonicalizeUiIr(
  document: UIIRDocument | Record<string, unknown>,
): Uint8Array {
  const payload = uiIrToDict(document);
  const version = String(payload.schema_version ?? '');
  if (version && version !== UI_UX_IR_SCHEMA_VERSION) {
    throw new UIIRValidationError(
      `Cannot canonicalize unsupported schema_version ${JSON.stringify(version)}; expected ${JSON.stringify(UI_UX_IR_SCHEMA_VERSION)}`,
    );
  }
  const text = ensureAsciiJson(JSON.stringify(normalizeCanonical(payload)));
  return utf8Bytes(text);
}

/** Alias matching Python/public API naming. */
export const canonicalizeUIIR = canonicalizeUiIr;
export const canonicalize_ui_ir = canonicalizeUiIr;

/** Return `sha256:<hex>` for the canonical declaration bytes. */
export function uiIrSha256(
  document: UIIRDocument | Record<string, unknown>,
): string {
  return `sha256:${sha256Hex(canonicalizeUiIr(document))}`;
}

export const ui_ir_sha256 = uiIrSha256;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function rejectUnknownDocumentFields(
  payload: Record<string, unknown>,
): void {
  if (!isPlainObject(payload)) {
    throw new UIIRValidationError('document payload must be a mapping');
  }
  const unknown = Object.keys(payload)
    .filter(key => !UIIR_DOCUMENT_FIELD_SET.has(key))
    .sort();
  if (unknown.length > 0) {
    throw new UIIRValidationError(
      `unknown UIIRDocument field(s): ${unknown.join(', ')}`,
    );
  }
  const missing = [...UIIR_REQUIRED_PATH_SET]
    .filter(name => !(name in payload))
    .sort();
  if (missing.length > 0) {
    throw new UIIRValidationError(
      `missing required UIIRDocument path(s): ${missing.join(', ')}`,
    );
  }
}

function validateSource(source: UISourceRef): void {
  validateIdentifier('UISourceRef.ref_id', source.ref_id);
  validateNonEmptyString('UISourceRef.source_uri', source.source_uri);
  validateNonEmptyString('UISourceRef.source_id', source.source_id);
  validateNonEmptyString('UISourceRef.source_revision', source.source_revision);
  validateSha256('UISourceRef.content_sha256', source.content_sha256);
  if (source.container_sha256) {
    validateSha256('UISourceRef.container_sha256', source.container_sha256);
  }
  if (source.span) {
    const { start_char, end_char } = source.span;
    if (
      !Number.isInteger(start_char) ||
      !Number.isInteger(end_char) ||
      start_char < 0 ||
      end_char < start_char
    ) {
      throw new UIIRValidationError(
        'SourceSpan must satisfy 0 <= start_char <= end_char',
      );
    }
  }
  rejectExecutablePayload(normalizeSource(source), 'UISourceRef');
}

function validateComponent(component: UIComponent): void {
  validateIdentifier('UIComponent.component_id', component.component_id);
  validateNonEmptyString('UIComponent.role', component.role);
  if (component.parent_id) {
    validateIdentifier('UIComponent.parent_id', component.parent_id);
  }
  for (const id of component.child_ids ?? []) {
    validateIdentifier('UIComponent.child_ids', id);
  }
  for (const field of [
    'modality_binding_ids',
    'data_binding_ids',
    'program_binding_ids',
    'feedback_ids',
    'source_ref_ids',
  ] as const) {
    const values = component[field] ?? [];
    requireUnique(values, `UIComponent.${field} member`);
    for (const id of values) {
      validateIdentifier(`UIComponent.${field}`, id);
    }
  }
  rejectExecutablePayload(
    normalizeComponent(component),
    `UIComponent ${component.component_id}`,
  );
}

function validateTerminal(outcome: UITerminalOutcome): void {
  validateIdentifier('UITerminalOutcome.outcome_id', outcome.outcome_id);
  const kinds = new Set(Object.values(TerminalOutcomeKind));
  if (!kinds.has(outcome.kind as TerminalOutcomeKind)) {
    throw new UIIRValidationError(
      `UITerminalOutcome.kind must be a TerminalOutcomeKind value`,
    );
  }
  requireUnique(
    outcome.source_ref_ids ?? [],
    'UITerminalOutcome.source_ref_ids member',
  );
  for (const id of outcome.source_ref_ids ?? []) {
    validateIdentifier('UITerminalOutcome.source_ref_ids', id);
  }
}

function validateLocale(locale: UILocaleDefaults): void {
  validateNonEmptyString(
    'UILocaleDefaults.default_locale',
    locale.default_locale,
  );
  for (const item of locale.fallback_locales) {
    validateNonEmptyString('UILocaleDefaults.fallback_locales', item);
  }
  validateNonEmptyString(
    'UILocaleDefaults.text_direction',
    locale.text_direction,
  );
  if (!['ltr', 'rtl', 'auto'].includes(locale.text_direction)) {
    throw new UIIRValidationError(
      'UILocaleDefaults.text_direction must be ltr, rtl, or auto',
    );
  }
}

/**
 * Validate a decoded document (cross-reference closure for mapped fields).
 */
export function validateUiIr(document: UIIRDocument): UIIRDocument {
  if (document.schema_version !== UI_UX_IR_SCHEMA_VERSION) {
    throw new UIIRValidationError(
      `Unsupported UI/UX IR schema_version: ${JSON.stringify(document.schema_version)}`,
    );
  }
  validateIdentifier('UIIRDocument.document_id', document.document_id);
  validateNonEmptyString('UIIRDocument.title', document.title);

  if (!document.sources?.length) {
    throw new UIIRValidationError('UIIRDocument.sources must not be empty');
  }
  if (!document.components?.length) {
    throw new UIIRValidationError('UIIRDocument.components must not be empty');
  }
  if (!document.entry_components?.length) {
    throw new UIIRValidationError(
      'UIIRDocument.entry_components must not be empty',
    );
  }
  if (!document.terminal_outcomes?.length) {
    throw new UIIRValidationError(
      'UIIRDocument.terminal_outcomes must not be empty',
    );
  }

  const locale = {
    default_locale: document.locale_defaults?.default_locale ?? 'en',
    fallback_locales: [...(document.locale_defaults?.fallback_locales ?? [])],
    text_direction: document.locale_defaults?.text_direction ?? 'ltr',
  };
  validateLocale(locale);

  for (const source of document.sources) validateSource(source);
  for (const component of document.components) validateComponent(component);
  for (const outcome of document.terminal_outcomes) validateTerminal(outcome);

  requireUnique(
    document.sources.map(s => s.ref_id),
    'source ref',
  );
  requireUnique(
    document.components.map(c => c.component_id),
    'component',
  );
  requireUnique(
    document.terminal_outcomes.map(o => o.outcome_id),
    'terminal outcome',
  );
  requireUnique(document.entry_components, 'entry_components member');
  requireUnique(document.tags ?? [], 'tags member');
  requireUnique(document.initial_states ?? [], 'initial_states member');

  if (document.program_bindings) {
    requireUnique(
      document.program_bindings.map(b => b.binding_id),
      'program binding',
    );
  }
  if (document.mcp_idl_bindings) {
    requireUnique(
      document.mcp_idl_bindings.map(b => b.binding_id),
      'mcp idl binding',
    );
  }
  if (document.feedback_contracts) {
    requireUnique(
      document.feedback_contracts.map(b => b.feedback_id),
      'feedback',
    );
  }
  if (document.layout_regions) {
    requireUnique(
      document.layout_regions.map(r => r.region_id),
      'layout region',
    );
  }
  if (document.extensions) {
    requireUnique(
      document.extensions.map(e => e.extension_id),
      'extension',
    );
    for (const ext of document.extensions) {
      validateIdentifier('UINamespacedExtension.extension_id', ext.extension_id);
      if (typeof ext.namespace !== 'string' || !NAMESPACE_RE.test(ext.namespace)) {
        throw new UIIRValidationError(
          'UINamespacedExtension.namespace must be a dotted namespace',
        );
      }
      if (typeof ext.version !== 'string' || !VERSION_RE.test(ext.version)) {
        throw new UIIRValidationError(
          'UINamespacedExtension.version must be a stable version token',
        );
      }
      const root = ext.namespace.split('.', 1)[0];
      const banned = new Set([
        'observation',
        'telemetry',
        'projection',
        'proof',
        'policy_result',
        'runtime',
      ]);
      if (banned.has(root)) {
        throw new UIIRValidationError(
          `UINamespacedExtension.namespace ${JSON.stringify(ext.namespace)} is not declaration content`,
        );
      }
      rejectExecutablePayload(
        ext.payload ?? {},
        `UINamespacedExtension ${ext.extension_id}.payload`,
      );
    }
  }

  const sourceIds = new Set(document.sources.map(s => s.ref_id));
  const componentIds = new Set(document.components.map(c => c.component_id));
  const programIds = new Set(
    (document.program_bindings ?? []).map(b => b.binding_id),
  );
  const feedbackIds = new Set(
    (document.feedback_contracts ?? []).map(b => b.feedback_id),
  );
  const dataBindingIds = new Set(
    ((document.data_bindings as Array<{ binding_id?: string }>) ?? []).map(b =>
      String(b.binding_id ?? ''),
    ),
  );
  const modalityIds = new Set<string>([
    ...((document.input_modality_requirements as
      | Array<{ requirement_id?: string }>
      | undefined) ?? []).map(r => String(r.requirement_id ?? '')),
    ...((document.output_modality_requirements as
      | Array<{ requirement_id?: string }>
      | undefined) ?? []).map(r => String(r.requirement_id ?? '')),
  ]);

  for (const component of document.components) {
    requireKnownRefs(
      component.source_ref_ids ?? [],
      sourceIds,
      `UIComponent ${JSON.stringify(component.component_id)}.source_ref_ids`,
    );
    if (component.parent_id) {
      requireKnownRefs(
        [component.parent_id],
        componentIds,
        `UIComponent ${JSON.stringify(component.component_id)}.parent_id`,
      );
    }
    requireKnownRefs(
      component.child_ids ?? [],
      componentIds,
      `UIComponent ${JSON.stringify(component.component_id)}.child_ids`,
    );
    if ((component.feedback_ids ?? []).length > 0) {
      requireKnownRefs(
        component.feedback_ids ?? [],
        feedbackIds,
        `UIComponent ${JSON.stringify(component.component_id)}.feedback_ids`,
      );
    }
    if ((component.program_binding_ids ?? []).length > 0) {
      requireKnownRefs(
        component.program_binding_ids ?? [],
        programIds,
        `UIComponent ${JSON.stringify(component.component_id)}.program_binding_ids`,
      );
    }
    if ((component.data_binding_ids ?? []).length > 0) {
      requireKnownRefs(
        component.data_binding_ids ?? [],
        dataBindingIds,
        `UIComponent ${JSON.stringify(component.component_id)}.data_binding_ids`,
      );
    }
    if ((component.modality_binding_ids ?? []).length > 0) {
      requireKnownRefs(
        component.modality_binding_ids ?? [],
        modalityIds,
        `UIComponent ${JSON.stringify(component.component_id)}.modality_binding_ids`,
      );
    }
  }

  requireKnownRefs(
    document.entry_components,
    componentIds,
    'UIIRDocument.entry_components',
  );

  for (const outcome of document.terminal_outcomes) {
    requireKnownRefs(
      outcome.source_ref_ids ?? [],
      sourceIds,
      `UITerminalOutcome ${JSON.stringify(outcome.outcome_id)}.source_ref_ids`,
    );
  }

  for (const binding of document.program_bindings ?? []) {
    requireKnownRefs(
      binding.source_ref_ids ?? [],
      sourceIds,
      `UIProgramBinding ${JSON.stringify(binding.binding_id)}.source_ref_ids`,
    );
  }

  for (const binding of document.mcp_idl_bindings ?? []) {
    requireKnownRefs(
      binding.source_ref_ids ?? [],
      sourceIds,
      `UIMCPIDLBinding ${JSON.stringify(binding.binding_id)}.source_ref_ids`,
    );
  }

  for (const feedback of document.feedback_contracts ?? []) {
    requireKnownRefs(
      feedback.source_ref_ids ?? [],
      sourceIds,
      `UIFeedbackContract ${JSON.stringify(feedback.feedback_id)}.source_ref_ids`,
    );
    if (feedback.component_id) {
      requireKnownRefs(
        [feedback.component_id],
        componentIds,
        `UIFeedbackContract ${JSON.stringify(feedback.feedback_id)}.component_id`,
      );
    }
  }

  for (const region of document.layout_regions ?? []) {
    requireKnownRefs(
      region.source_ref_ids ?? [],
      sourceIds,
      `UILayoutRegion ${JSON.stringify(region.region_id)}.source_ref_ids`,
    );
    requireKnownRefs(
      region.component_ids ?? [],
      componentIds,
      `UILayoutRegion ${JSON.stringify(region.region_id)}.component_ids`,
    );
  }

  if ((document.states ?? []).length > 0 && !(document.initial_states ?? []).length) {
    throw new UIIRValidationError(
      'UIIRDocument.initial_states must not be empty when states are declared',
    );
  }

  rejectExecutablePayload(uiIrToDict(document), 'UIIRDocument');
  return document;
}

export const validateUIIR = validateUiIr;
export const validate_ui_ir = validateUiIr;

// ---------------------------------------------------------------------------
// Decode (mirror Python decoder.py + optional closed collections)
// ---------------------------------------------------------------------------

function decodeSource(payload: Record<string, unknown>): UISourceRef {
  const spanRaw = payload.span;
  let span: SourceSpan | null = null;
  if (spanRaw !== undefined && spanRaw !== null) {
    const spanMap = requireObject(spanRaw, 'UISourceRef.span');
    span = {
      start_char: Number(spanMap.start_char ?? 0),
      end_char: Number(spanMap.end_char ?? 0),
    };
  }
  return {
    ref_id: String(payload.ref_id ?? ''),
    source_uri: String(payload.source_uri ?? ''),
    source_id: String(payload.source_id ?? ''),
    source_revision: String(payload.source_revision ?? ''),
    content_sha256: String(payload.content_sha256 ?? ''),
    container_uri: String(payload.container_uri ?? ''),
    container_sha256: String(payload.container_sha256 ?? ''),
    content_cid: String(payload.content_cid ?? ''),
    license_expression: String(payload.license_expression ?? ''),
    review_status: String(
      payload.review_status ?? ReviewStatus.UNREVIEWED,
    ) as ReviewStatus,
    span,
  };
}

function decodeComponent(payload: Record<string, unknown>): UIComponent {
  // Fail closed on executable callback keys before stripping unknown fields.
  rejectExecutablePayload(payload, 'UIComponent');
  // Set-like id collections are unique (order of first appearance preserved for
  // child_ids which are ordered; other id lists are normalized unique).
  const childIds = asStringArray(payload.child_ids, 'UIComponent.child_ids');
  return {
    component_id: String(payload.component_id ?? ''),
    role: String(payload.role ?? ''),
    purpose: String(payload.purpose ?? ''),
    accessible_name_ref: String(payload.accessible_name_ref ?? ''),
    accessible_description_ref: String(
      payload.accessible_description_ref ?? '',
    ),
    parent_id: String(payload.parent_id ?? ''),
    child_ids: childIds,
    modality_binding_ids: sortedUniqueStrings(
      asStringArray(
        payload.modality_binding_ids,
        'UIComponent.modality_binding_ids',
      ),
    ),
    data_binding_ids: sortedUniqueStrings(
      asStringArray(payload.data_binding_ids, 'UIComponent.data_binding_ids'),
    ),
    program_binding_ids: sortedUniqueStrings(
      asStringArray(
        payload.program_binding_ids,
        'UIComponent.program_binding_ids',
      ),
    ),
    feedback_ids: sortedUniqueStrings(
      asStringArray(payload.feedback_ids, 'UIComponent.feedback_ids'),
    ),
    privacy_sensitivity: String(payload.privacy_sensitivity ?? 'none'),
    presentation_classification: String(
      payload.presentation_classification ?? 'interactive',
    ),
    source_ref_ids: sortedUniqueStrings(
      asStringArray(payload.source_ref_ids, 'UIComponent.source_ref_ids'),
    ),
  };
}

function decodeTerminal(payload: Record<string, unknown>): UITerminalOutcome {
  return {
    outcome_id: String(payload.outcome_id ?? ''),
    kind: String(payload.kind ?? TerminalOutcomeKind.SUCCESS),
    description: String(payload.description ?? ''),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UITerminalOutcome.source_ref_ids',
    ),
  };
}

function decodeLocale(payload: unknown): UILocaleDefaults {
  if (!payload) {
    return { default_locale: 'en', fallback_locales: [], text_direction: 'ltr' };
  }
  const data = requireObject(payload, 'locale_defaults');
  return {
    default_locale: String(data.default_locale ?? 'en'),
    fallback_locales: asStringArray(
      data.fallback_locales,
      'locale_defaults.fallback_locales',
    ),
    text_direction: String(data.text_direction ?? 'ltr'),
  };
}

function decodeRecordArray<T>(
  value: unknown,
  label: string,
  decodeOne: (item: Record<string, unknown>) => T,
): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new UIIRDecodeError(`${label} must be an array`);
  }
  return value.map((item, index) =>
    decodeOne(requireObject(item, `${label}[${index}]`)),
  );
}

function decodeProgramBinding(
  payload: Record<string, unknown>,
): UIProgramBinding {
  return {
    binding_id: String(payload.binding_id ?? ''),
    target_kind: String(payload.target_kind ?? ''),
    target_ref: String(payload.target_ref ?? ''),
    risk_class: String(payload.risk_class ?? 'low'),
    confirmation_class: String(payload.confirmation_class ?? 'none'),
    precondition_ids: asStringArray(
      payload.precondition_ids,
      'UIProgramBinding.precondition_ids',
    ),
    effect_ids: asStringArray(
      payload.effect_ids,
      'UIProgramBinding.effect_ids',
    ),
    verification_ids: asStringArray(
      payload.verification_ids,
      'UIProgramBinding.verification_ids',
    ),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIProgramBinding.source_ref_ids',
    ),
  };
}

function decodeMcpIdlBinding(
  payload: Record<string, unknown>,
): UIMCPIDLBinding {
  return {
    binding_id: String(payload.binding_id ?? ''),
    interface_cid: String(payload.interface_cid ?? ''),
    method_name: String(payload.method_name ?? ''),
    argument_schema_ref: String(payload.argument_schema_ref ?? ''),
    result_schema_ref: String(payload.result_schema_ref ?? ''),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIMCPIDLBinding.source_ref_ids',
    ),
  };
}

function decodeFeedback(payload: Record<string, unknown>): UIFeedbackContract {
  return {
    feedback_id: String(payload.feedback_id ?? ''),
    channel: String(payload.channel ?? ''),
    component_id: String(payload.component_id ?? ''),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIFeedbackContract.source_ref_ids',
    ),
  };
}

function decodeLayoutRegion(payload: Record<string, unknown>): UILayoutRegion {
  return {
    region_id: String(payload.region_id ?? ''),
    kind: String(payload.kind ?? LayoutRegionKind.FLOW),
    component_ids: asStringArray(
      payload.component_ids,
      'UILayoutRegion.component_ids',
    ),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UILayoutRegion.source_ref_ids',
    ),
  };
}

function decodeStateVariable(
  payload: Record<string, unknown>,
): UIStateVariable {
  return {
    variable_id: String(payload.variable_id ?? ''),
    value_type: String(payload.value_type ?? ''),
    derived: Boolean(payload.derived ?? false),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIStateVariable.source_ref_ids',
    ),
  };
}

function decodeEvent(payload: Record<string, unknown>): UIEvent {
  return {
    event_id: String(payload.event_id ?? ''),
    kind: String(payload.kind ?? 'domain'),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIEvent.source_ref_ids',
    ),
  };
}

function decodeTask(payload: Record<string, unknown>): UIUXTask {
  return {
    task_id: String(payload.task_id ?? ''),
    name: String(payload.name ?? ''),
    step_component_ids: asStringArray(
      payload.step_component_ids,
      'UIUXTask.step_component_ids',
    ),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIUXTask.source_ref_ids',
    ),
  };
}

function decodeJourney(payload: Record<string, unknown>): UIJourney {
  return {
    journey_id: String(payload.journey_id ?? ''),
    name: String(payload.name ?? ''),
    task_ids: asStringArray(payload.task_ids, 'UIJourney.task_ids'),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UIJourney.source_ref_ids',
    ),
  };
}

function decodeTrust(payload: Record<string, unknown>): UITrustBinding {
  return {
    trust_id: String(payload.trust_id ?? ''),
    authority_kind: String(payload.authority_kind ?? AuthorityKind.INTERFACE),
    subject_ref: String(payload.subject_ref ?? ''),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UITrustBinding.source_ref_ids',
    ),
  };
}

function decodeExtension(
  payload: Record<string, unknown>,
): UINamespacedExtension {
  const rawPayload = payload.payload;
  if (
    rawPayload !== undefined &&
    rawPayload !== null &&
    !isPlainObject(rawPayload)
  ) {
    throw new UIIRDecodeError('UINamespacedExtension.payload must be an object');
  }
  return {
    extension_id: String(payload.extension_id ?? ''),
    namespace: String(payload.namespace ?? ''),
    version: String(payload.version ?? ''),
    payload: isPlainObject(rawPayload)
      ? { ...(rawPayload as Record<string, unknown>) }
      : {},
    required: Boolean(payload.required ?? false),
    source_ref_ids: asStringArray(
      payload.source_ref_ids,
      'UINamespacedExtension.source_ref_ids',
    ),
  };
}

function parsePayload(
  payload: unknown,
): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (exc) {
      throw new UIIRDecodeError(
        `UI/UX IR payload is not valid JSON: ${String(exc)}`,
      );
    }
  } else if (payload instanceof Uint8Array) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      payload = JSON.parse(text);
    } catch (exc) {
      throw new UIIRDecodeError(
        `UI/UX IR payload is not valid UTF-8 JSON: ${String(exc)}`,
      );
    }
  }
  if (!isPlainObject(payload)) {
    throw new UIIRDecodeError('UI/UX IR payload must decode to an object');
  }
  return payload;
}

/**
 * Decode a wire payload into a validated UIIRDocument.
 * Unknown versions and unknown top-level fields fail closed.
 * Legacy versions require explicit migration before decode.
 */
export function decodeUiIr(
  payload: unknown,
): UIIRDocument {
  const raw = parsePayload(payload);
  const version = String(raw.schema_version ?? '');
  if (!version) {
    throw new UIIRDecodeError('UI/UX IR payload missing schema_version');
  }
  if (version === LEGACY_UI_UX_IR_SCHEMA_VERSION) {
    throw new UIIRDecodeError(
      `Legacy schema_version ${JSON.stringify(version)} requires explicit migration before decode`,
    );
  }
  if (version !== UI_UX_IR_SCHEMA_VERSION) {
    throw new UIIRDecodeError(
      `Unsupported schema_version ${JSON.stringify(version)}; expected ${JSON.stringify(UI_UX_IR_SCHEMA_VERSION)}`,
    );
  }

  try {
    rejectUnknownDocumentFields(raw);
  } catch (exc) {
    if (exc instanceof UIIRValidationError) {
      throw new UIIRDecodeError(exc.message);
    }
    throw exc;
  }

  const sourcesRaw = raw.sources ?? [];
  const componentsRaw = raw.components ?? [];
  const terminalsRaw = raw.terminal_outcomes ?? [];
  if (!Array.isArray(sourcesRaw)) {
    throw new UIIRDecodeError('sources must be an array');
  }
  if (!Array.isArray(componentsRaw)) {
    throw new UIIRDecodeError('components must be an array');
  }
  if (!Array.isArray(terminalsRaw)) {
    throw new UIIRDecodeError('terminal_outcomes must be an array');
  }

  let document: UIIRDocument;
  try {
    const producerRaw = raw.producer;
    const configurationRaw = raw.configuration;
    const reviewRaw = raw.review;

    document = {
      schema_version: version,
      document_id: String(raw.document_id ?? ''),
      title: String(raw.title ?? ''),
      sources: sourcesRaw.map((item, index) =>
        decodeSource(requireObject(item, `sources[${index}]`)),
      ),
      components: componentsRaw.map((item, index) =>
        decodeComponent(requireObject(item, `components[${index}]`)),
      ),
      entry_components: sortedUniqueStrings(
        asStringArray(raw.entry_components, 'entry_components'),
      ),
      terminal_outcomes: terminalsRaw.map((item, index) =>
        decodeTerminal(requireObject(item, `terminal_outcomes[${index}]`)),
      ),
      locale_defaults: decodeLocale(raw.locale_defaults),
      tags: asStringArray(raw.tags, 'tags'),
      producer:
        producerRaw === undefined || producerRaw === null
          ? null
          : {
              producer_id: String(
                requireObject(producerRaw, 'producer').producer_id ?? '',
              ),
              name: String(requireObject(producerRaw, 'producer').name ?? ''),
              version: String(
                requireObject(producerRaw, 'producer').version ?? '',
              ),
            },
      configuration:
        configurationRaw === undefined || configurationRaw === null
          ? null
          : {
              configuration_id: String(
                requireObject(configurationRaw, 'configuration')
                  .configuration_id ?? '',
              ),
              profile: String(
                requireObject(configurationRaw, 'configuration').profile ??
                  'default',
              ),
              settings: isPlainObject(
                requireObject(configurationRaw, 'configuration').settings,
              )
                ? {
                    ...(requireObject(configurationRaw, 'configuration')
                      .settings as Record<string, unknown>),
                  }
                : {},
            },
      review:
        reviewRaw === undefined || reviewRaw === null
          ? {
              review_status: ReviewStatus.UNREVIEWED,
              reviewer: '',
              notes: '',
            }
          : {
              review_status: String(
                requireObject(reviewRaw, 'review').review_status ??
                  ReviewStatus.UNREVIEWED,
              ),
              reviewer: String(
                requireObject(reviewRaw, 'review').reviewer ?? '',
              ),
              notes: String(requireObject(reviewRaw, 'review').notes ?? ''),
            },
      trust_bindings: decodeRecordArray(
        raw.trust_bindings,
        'trust_bindings',
        decodeTrust,
      ),
      composition_edges: Array.isArray(raw.composition_edges)
        ? [...raw.composition_edges]
        : [],
      layout_regions: decodeRecordArray(
        raw.layout_regions,
        'layout_regions',
        decodeLayoutRegion,
      ),
      layout_constraints: Array.isArray(raw.layout_constraints)
        ? [...raw.layout_constraints]
        : [],
      design_token_refs: Array.isArray(raw.design_token_refs)
        ? [...raw.design_token_refs]
        : [],
      state_variables: decodeRecordArray(
        raw.state_variables,
        'state_variables',
        decodeStateVariable,
      ),
      states: Array.isArray(raw.states) ? [...raw.states] : [],
      events: decodeRecordArray(raw.events, 'events', decodeEvent),
      transitions: Array.isArray(raw.transitions) ? [...raw.transitions] : [],
      guards: Array.isArray(raw.guards) ? [...raw.guards] : [],
      effects: Array.isArray(raw.effects) ? [...raw.effects] : [],
      ux_tasks: decodeRecordArray(raw.ux_tasks, 'ux_tasks', decodeTask),
      journeys: decodeRecordArray(raw.journeys, 'journeys', decodeJourney),
      success_failure_recovery: Array.isArray(raw.success_failure_recovery)
        ? [...raw.success_failure_recovery]
        : [],
      feedback_contracts: decodeRecordArray(
        raw.feedback_contracts,
        'feedback_contracts',
        decodeFeedback,
      ),
      accessibility: Array.isArray(raw.accessibility)
        ? [...raw.accessibility]
        : [],
      localization: Array.isArray(raw.localization) ? [...raw.localization] : [],
      input_modality_requirements: Array.isArray(raw.input_modality_requirements)
        ? [...raw.input_modality_requirements]
        : [],
      output_modality_requirements: Array.isArray(
        raw.output_modality_requirements,
      )
        ? [...raw.output_modality_requirements]
        : [],
      modality_alternatives: Array.isArray(raw.modality_alternatives)
        ? [...raw.modality_alternatives]
        : [],
      device_capability_requirements: Array.isArray(
        raw.device_capability_requirements,
      )
        ? [...raw.device_capability_requirements]
        : [],
      adaptive_variants: Array.isArray(raw.adaptive_variants)
        ? [...raw.adaptive_variants]
        : [],
      data_bindings: Array.isArray(raw.data_bindings)
        ? [...raw.data_bindings]
        : [],
      content_references: Array.isArray(raw.content_references)
        ? [...raw.content_references]
        : [],
      program_bindings: decodeRecordArray(
        raw.program_bindings,
        'program_bindings',
        decodeProgramBinding,
      ),
      intent_ir_bindings: Array.isArray(raw.intent_ir_bindings)
        ? [...raw.intent_ir_bindings]
        : [],
      invocation_bindings: Array.isArray(raw.invocation_bindings)
        ? [...raw.invocation_bindings]
        : [],
      mcp_idl_bindings: decodeRecordArray(
        raw.mcp_idl_bindings,
        'mcp_idl_bindings',
        decodeMcpIdlBinding,
      ),
      formal_constraint_refs: Array.isArray(raw.formal_constraint_refs)
        ? [...raw.formal_constraint_refs]
        : [],
      proof_obligation_refs: Array.isArray(raw.proof_obligation_refs)
        ? [...raw.proof_obligation_refs]
        : [],
      initial_states: asStringArray(raw.initial_states, 'initial_states'),
      extensions: decodeRecordArray(
        raw.extensions,
        'extensions',
        decodeExtension,
      ),
    };
  } catch (exc) {
    if (exc instanceof UIIRValidationError) {
      throw new UIIRDecodeError(exc.message);
    }
    throw new UIIRDecodeError(
      `Failed to decode UI/UX IR document: ${String(exc)}`,
    );
  }

  try {
    return validateUiIr(document);
  } catch (exc) {
    if (exc instanceof UIIRValidationError) {
      throw new UIIRDecodeError(exc.message);
    }
    throw exc;
  }
}

export const decodeUIIR = decodeUiIr;
export const decode_ui_ir = decodeUiIr;

// ---------------------------------------------------------------------------
// SwissKnife MCP UI profile conversion (lossy, fully reported)
// ---------------------------------------------------------------------------

function regionKindFromSection(
  kind: MCPUISection['kind'] | string | undefined,
): LayoutRegionKind {
  switch (kind) {
    case 'table':
    case 'graph':
      return LayoutRegionKind.GRID;
    case 'timeline':
    case 'status':
    case 'audit':
      return LayoutRegionKind.FLOW;
    case 'form':
    case 'command-bar':
      return LayoutRegionKind.STACK;
    default:
      return LayoutRegionKind.FLOW;
  }
}

/**
 * Convert a SwissKnife MCP++ UI profile descriptor into a UIIR document.
 * Retains every mapped semantic and lists every unmapped loss explicitly.
 */
export function convertMcpUiProfileToUiIr(
  profile: MCPUIProfileDescriptor,
  options: {
    sourceUri?: string;
    sourceRevision?: string;
    contentSha256?: string;
  } = {},
): UIIRProfileConversionResult {
  const losses: UIIRConversionLoss[] = [];
  const appId = profile.meta?.app_id || profile.name || 'unknown-app';
  const documentId = stableId(`doc:${appId}`, 'doc');
  const sourceRefId = stableId(`source:mcp-ui-profile:${appId}`, 'source');
  const contentSha256 =
    options.contentSha256 ??
    sha256Hex(
      JSON.stringify({
        name: profile.name,
        namespace: profile.namespace,
        version: profile.version,
        app_id: profile.meta?.app_id,
      }),
    );

  const source: UISourceRef = {
    ref_id: sourceRefId,
    source_uri:
      options.sourceUri ??
      `swissknife:mcp-ui-profile:${profile.namespace ?? 'local'}/${appId}`,
    source_id: appId,
    source_revision:
      options.sourceRevision ??
      String(profile.meta?.profile_version ?? profile.version ?? '0'),
    content_sha256: contentSha256,
    review_status: ReviewStatus.MACHINE_EXTRACTED,
    span: null,
  };

  const components: UIComponent[] = [];
  const programBindings: UIProgramBinding[] = [];
  const mcpIdlBindings: UIMCPIDLBinding[] = [];
  const layoutRegions: UILayoutRegion[] = [];
  const feedbackContracts: UIFeedbackContract[] = [];
  const stateVariables: UIStateVariable[] = [];
  const events: UIEvent[] = [];
  const uxTasks: UIUXTask[] = [];
  const journeys: UIJourney[] = [];
  const trustBindings: UITrustBinding[] = [];
  const extensions: UINamespacedExtension[] = [];

  const rootId = stableId(`component:root:${appId}`, 'component');
  const rootChildIds: string[] = [];

  // Map methods / operations -> components + program + mcp-idl bindings.
  const methods = profile.methods ?? [];
  const operations = profile.data_contracts?.operations ?? [];
  const methodNames = new Set(methods.map(m => m.name));

  for (const method of methods) {
    const componentId = stableId(`component:method:${method.name}`, 'component');
    const programId = stableId(`program:${method.name}`, 'program');
    const mcpId = stableId(`mcp-idl:${method.name}`, 'mcp-idl');
    rootChildIds.push(componentId);

    components.push({
      component_id: componentId,
      role: 'button',
      purpose: `Invoke MCP method ${method.name}`,
      parent_id: rootId,
      program_binding_ids: [programId],
      source_ref_ids: [sourceRefId],
      presentation_classification: 'interactive',
      privacy_sensitivity: 'none',
    });

    programBindings.push({
      binding_id: programId,
      target_kind: ProgramBindingTargetKind.MCP_IDL,
      target_ref: `mcp:${profile.namespace ?? 'local'}/${method.name}`,
      risk_class: 'medium',
      confirmation_class: 'none',
      source_ref_ids: [sourceRefId],
    });

    const interfaceCid =
      profile.services?.find(s => s.operations?.includes(method.name))
        ?.interface_cid ??
      `legacy-alias:interface:${profile.namespace ?? 'local'}/${profile.name ?? appId}`;

    mcpIdlBindings.push({
      binding_id: mcpId,
      interface_cid: interfaceCid,
      method_name: method.name,
      argument_schema_ref: '',
      result_schema_ref: '',
      source_ref_ids: [sourceRefId],
    });

    // Detailed method schemas are referenced, not embedded as executable code.
    if (method.input_schema) {
      losses.push({
        path: `methods[${method.name}].input_schema`,
        reason:
          'JSON Schema bodies are not declaration content; retain only method identity and external schema refs in UIIR',
      });
    }
    if (method.output_schema) {
      losses.push({
        path: `methods[${method.name}].output_schema`,
        reason:
          'JSON Schema bodies are not declaration content; retain only method identity and external schema refs in UIIR',
      });
    }
  }

  for (const operation of operations) {
    if (!methodNames.has(operation.method)) {
      losses.push({
        path: `data_contracts.operations[${operation.method}]`,
        reason:
          'Operation contract without matching MCP-IDL method is retained only as loss (no silent method synthesis)',
        source_value: operation.method,
      });
    }
    if (operation.stream && operation.stream.kind !== 'none') {
      losses.push({
        path: `data_contracts.operations[${operation.method}].stream`,
        reason:
          'Stream contracts are runtime/transport concerns, not UIIR declaration content',
        source_value: operation.stream,
      });
    }
    if (operation.retry_policy) {
      losses.push({
        path: `data_contracts.operations[${operation.method}].retry_policy`,
        reason: 'Retry policy is mediation/runtime policy, not UIIR declaration content',
        source_value: operation.retry_policy,
      });
    }
    if (operation.input_schema_cid || operation.output_schema_cid) {
      // Schema CIDs are identity-adjacent but not mapped into closed v1 leaves
      // beyond program/mcp bindings; report explicitly.
      losses.push({
        path: `data_contracts.operations[${operation.method}].schema_cids`,
        reason:
          'Operation schema CIDs are not a closed UIIR v1 leaf; use mcp_idl_bindings and external identity vectors',
        source_value: {
          input_schema_cid: operation.input_schema_cid,
          output_schema_cid: operation.output_schema_cid,
        },
      });
    }
  }

  // UI templates / sections / regions -> layout regions + tasks.
  const templates: MCPUITemplateMapping[] = profile.ui?.templates ?? [];
  const sections: MCPUISection[] = profile.ui?.sections ?? [];
  const primaryTemplate = profile.ui?.primary_template;

  components.unshift({
    component_id: rootId,
    role: 'application',
    purpose: profile.meta?.description || profile.meta?.title || profile.name,
    accessible_name_ref: '',
    child_ids: rootChildIds,
    source_ref_ids: [sourceRefId],
    presentation_classification: 'interactive',
    privacy_sensitivity: 'none',
  });

  if (primaryTemplate) {
    layoutRegions.push({
      region_id: stableId(`region:primary:${primaryTemplate}`, 'region'),
      kind: LayoutRegionKind.STACK,
      component_ids: [rootId, ...rootChildIds],
      source_ref_ids: [sourceRefId],
    });
  }

  for (const template of templates) {
    const taskId = stableId(`task:template:${template.kind}`, 'task');
    const stepIds = (template.operations ?? [])
      .map(op => stableId(`component:method:${op}`, 'component'))
      .filter(id => components.some(c => c.component_id === id));
    uxTasks.push({
      task_id: taskId,
      name: template.title || template.kind,
      step_component_ids: stepIds.length ? stepIds : [rootId],
      source_ref_ids: [sourceRefId],
    });
    for (const region of template.regions ?? []) {
      const componentForOp = region.operation
        ? stableId(`component:method:${region.operation}`, 'component')
        : rootId;
      layoutRegions.push({
        region_id: stableId(`region:${template.kind}:${region.id}`, 'region'),
        kind: regionKindFromSection(region.kind),
        component_ids: components.some(c => c.component_id === componentForOp)
          ? [componentForOp]
          : [rootId],
        source_ref_ids: [sourceRefId],
      });
    }
  }

  for (const section of sections) {
    layoutRegions.push({
      region_id: stableId(`region:section:${section.id}`, 'region'),
      kind: regionKindFromSection(section.kind),
      component_ids: section.operation
        ? [
            components.some(
              c =>
                c.component_id ===
                stableId(`component:method:${section.operation}`, 'component'),
            )
              ? stableId(`component:method:${section.operation}`, 'component')
              : rootId,
          ]
        : [rootId],
      source_ref_ids: [sourceRefId],
    });
  }

  if (uxTasks.length > 0) {
    journeys.push({
      journey_id: stableId(`journey:${appId}`, 'journey'),
      name: profile.meta?.title || profile.name,
      task_ids: uxTasks.map(t => t.task_id),
      source_ref_ids: [sourceRefId],
    });
  }

  // State model keys/events.
  for (const key of profile.state_model?.keys ?? []) {
    stateVariables.push({
      variable_id: stableId(`state-var:${key}`, 'state-var'),
      value_type: 'unknown',
      derived: false,
      source_ref_ids: [sourceRefId],
    });
  }
  for (const eventName of profile.state_model?.events ?? []) {
    events.push({
      event_id: stableId(`event:${eventName}`, 'event'),
      kind: 'domain',
      source_ref_ids: [sourceRefId],
    });
  }
  if (profile.state_model?.projections?.length) {
    losses.push({
      path: 'state_model.projections',
      reason:
        'State projections are derived runtime views, not UIIR declaration content',
      source_value: profile.state_model.projections,
    });
  }
  if (profile.state_model?.replay) {
    losses.push({
      path: 'state_model.replay',
      reason: 'Replay capability is runtime policy, not UIIR declaration content',
      source_value: profile.state_model.replay,
    });
  }

  // Permissions are authorization policy, never UI visibility authority.
  if (profile.permissions) {
    losses.push({
      path: 'permissions',
      reason:
        'Permission maps are runtime authorization policy and must not be encoded as UIIR visibility/enabled state',
      source_value: profile.permissions,
    });
  }

  // Services transport/endpoints are runtime, not declaration.
  for (const service of profile.services ?? []) {
    if (service.transport || service.endpoint) {
      losses.push({
        path: `services[${service.id}].transport_endpoint`,
        reason:
          'Service transport/endpoint bindings are runtime routing, not UIIR declaration content',
        source_value: {
          transport: service.transport,
          endpoint: service.endpoint,
        },
      });
    }
    if (service.interface_type) {
      // interface_type is retained only indirectly via tags/extensions.
    }
  }

  // Workflow graph -> journey/tasks when present; residual details as losses.
  if (profile.workflow_graph) {
    const wf = profile.workflow_graph;
    const wfTaskId = stableId(`task:workflow:${wf.id}`, 'task');
    const stepComponentIds = (wf.steps ?? []).map(step =>
      stableId(`component:method:${step.operation}`, 'component'),
    );
    uxTasks.push({
      task_id: wfTaskId,
      name: wf.title || wf.id,
      step_component_ids: stepComponentIds.filter(id =>
        components.some(c => c.component_id === id),
      ),
      source_ref_ids: [sourceRefId],
    });
    for (const step of wf.steps ?? []) {
      if (step.depends_on?.length) {
        losses.push({
          path: `workflow_graph.steps[${step.id}].depends_on`,
          reason:
            'Workflow step dependency edges are not a closed UIIR v1 behavior edge; retained as loss pending behavior model binding',
          source_value: step.depends_on,
        });
      }
      if (step.rollback || step.compensation) {
        losses.push({
          path: `workflow_graph.steps[${step.id}].rollback_compensation`,
          reason:
            'Rollback/compensation actions require Intent/Invocation bindings not present on the UI profile alone',
          source_value: {
            rollback: step.rollback,
            compensation: step.compensation,
          },
        });
      }
      if (step.read_state_keys || step.write_state_keys) {
        losses.push({
          path: `workflow_graph.steps[${step.id}].state_keys`,
          reason:
            'Per-step state read/write keys are runtime state-machine detail beyond mapped state_variables',
          source_value: {
            read_state_keys: step.read_state_keys,
            write_state_keys: step.write_state_keys,
          },
        });
      }
    }
    if (wf.shared_state_keys?.length) {
      for (const key of wf.shared_state_keys) {
        const varId = stableId(`state-var:${key}`, 'state-var');
        if (!stateVariables.some(v => v.variable_id === varId)) {
          stateVariables.push({
            variable_id: varId,
            value_type: 'unknown',
            derived: false,
            source_ref_ids: [sourceRefId],
          });
        }
      }
    }
  }

  // Control surface contract is mediation policy.
  if (profile.control_surface_contract !== undefined) {
    losses.push({
      path: 'control_surface_contract',
      reason:
        'Control-surface mediation contracts belong to the broker/mediator path, not the immutable UIIR declaration',
      source_value: profile.control_surface_contract,
    });
  }

  // Trust metadata: retain subject identity; signature material is not declaration.
  if (profile.trust) {
    trustBindings.push({
      trust_id: stableId(`trust:interface:${appId}`, 'trust'),
      authority_kind: AuthorityKind.INTERFACE,
      subject_ref: profile.trust.canonical_cid || profile.name,
      source_ref_ids: [sourceRefId],
    });
    losses.push({
      path: 'trust.signature_material',
      reason:
        'Descriptor signatures and signed_at are trust artifacts, not UIIR declaration content; only subject identity is mapped',
      source_value: {
        signed_by: profile.trust.signed_by,
        signature_algorithm: profile.trust.signature_algorithm,
        signature: profile.trust.signature,
        signed_at: profile.trust.signed_at,
      },
    });
  }

  // Errors / requires / compatibility / observability / interaction patterns.
  if (profile.errors?.length) {
    losses.push({
      path: 'errors',
      reason:
        'MCP-IDL error catalogs are interface identity, not UIIR terminal UX outcomes',
      source_value: profile.errors,
    });
  }
  if (profile.requires?.length) {
    losses.push({
      path: 'requires',
      reason: 'MCP-IDL requires list is interface dependency metadata, not UIIR content',
      source_value: profile.requires,
    });
  }
  if (profile.compatibility) {
    losses.push({
      path: 'compatibility',
      reason:
        'MCP-IDL compatibility metadata is interface identity, not UIIR declaration content',
      source_value: profile.compatibility,
    });
  }
  if (profile.observability) {
    losses.push({
      path: 'observability',
      reason: 'Observability flags are runtime telemetry policy, not UIIR declaration content',
      source_value: profile.observability,
    });
  }
  if (profile.interaction_patterns) {
    losses.push({
      path: 'interaction_patterns',
      reason:
        'Interaction pattern flags are interface capability metadata; only concrete methods/UI structure are mapped',
      source_value: profile.interaction_patterns,
    });
  }
  if (profile.data_contracts?.schemas) {
    losses.push({
      path: 'data_contracts.schemas',
      reason:
        'Named schema dictionary bodies are not UIIR declaration leaves; keep external schema identity',
      source_value: Object.keys(profile.data_contracts.schemas),
    });
  }
  if (profile.meta?.icon) {
    losses.push({
      path: 'meta.icon',
      reason: 'Icon assets are presentation resources outside closed UIIR v1 leaves',
      source_value: profile.meta.icon,
    });
  }
  if (profile.meta?.publisher) {
    losses.push({
      path: 'meta.publisher',
      reason: 'Publisher string is retained only via producer name when present',
      source_value: profile.meta.publisher,
    });
  }
  if (
    profile.meta?.profile &&
    profile.meta.profile !== SWISSKNIFE_MCP_UI_PROFILE
  ) {
    losses.push({
      path: 'meta.profile',
      reason: 'Non-standard UI profile identifier is recorded as conversion loss',
      source_value: profile.meta.profile,
    });
  }

  // Feedback surface for errors.
  feedbackContracts.push({
    feedback_id: stableId(`feedback:status:${appId}`, 'feedback'),
    channel: 'status',
    component_id: rootId,
    source_ref_ids: [sourceRefId],
  });

  // Preserve residual SwissKnife profile identity in a namespaced extension
  // (declaration content, not observation/runtime).
  extensions.push({
    extension_id: stableId(`ext:swissknife-ui-profile:${appId}`, 'ext'),
    namespace: 'swissknife.mcp_ui_profile',
    version: String(profile.meta?.profile_version ?? '0.1.0'),
    required: false,
    payload: {
      profile: profile.meta?.profile ?? SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: profile.meta?.profile_version ?? null,
      app_id: profile.meta?.app_id ?? appId,
      primary_template: primaryTemplate ?? null,
      service_ids: (profile.services ?? []).map(s => s.id),
      interface_types: (profile.services ?? []).map(s => s.interface_type),
    },
    source_ref_ids: [sourceRefId],
  });

  const tags = [
    ...(profile.semanticTags ?? []),
    'swissknife-mcp-ui-profile',
    primaryTemplate ?? '',
  ].filter(Boolean);

  const document: UIIRDocument = {
    schema_version: UI_UX_IR_SCHEMA_VERSION,
    document_id: documentId,
    title: profile.meta?.title || profile.name || appId,
    sources: [source],
    components,
    entry_components: [rootId],
    terminal_outcomes: [
      {
        outcome_id: stableId(`outcome:success:${appId}`, 'outcome'),
        kind: TerminalOutcomeKind.SUCCESS,
        description: 'Primary UI interaction completed',
        source_ref_ids: [sourceRefId],
      },
      {
        outcome_id: stableId(`outcome:failure:${appId}`, 'outcome'),
        kind: TerminalOutcomeKind.FAILURE,
        description: 'Primary UI interaction failed',
        source_ref_ids: [sourceRefId],
      },
    ],
    locale_defaults: {
      default_locale: 'en',
      fallback_locales: ['en'],
      text_direction: 'ltr',
    },
    tags,
    producer: {
      producer_id: 'producer:swissknife-ui-ux-ir-codec',
      name: 'SwissKnife UI/UX IR codec',
      version: '1.0.0',
    },
    configuration: {
      configuration_id: stableId(`config:${appId}`, 'config'),
      profile: 'swissknife-mcp-ui-profile',
      settings: {
        namespace: profile.namespace ?? '',
        version: profile.version ?? '',
        primary_template: primaryTemplate ?? '',
      },
    },
    review: {
      review_status: ReviewStatus.MACHINE_EXTRACTED,
      reviewer: '',
      notes: 'Converted from SwissKnife MCP++ UI profile',
    },
    trust_bindings: trustBindings,
    layout_regions: layoutRegions,
    state_variables: stateVariables,
    events,
    ux_tasks: uxTasks,
    journeys,
    feedback_contracts: feedbackContracts,
    program_bindings: programBindings,
    mcp_idl_bindings: mcpIdlBindings,
    extensions,
    initial_states: [],
  };

  // Validate mapped document; conversion must not emit invalid UIIR.
  const validated = validateUiIr(document);

  // Sort losses by path for stable receipts.
  losses.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  return {
    document: validated,
    losses,
    lossy: losses.length > 0,
  };
}

export const convertMCPUIProfileToUIIR = convertMcpUiProfileToUiIr;

/**
 * Convenience: decode if needed, then return canonical identity digest.
 */
export function uiIrIdentity(
  document: UIIRDocument | Record<string, unknown>,
): { schema_version: string; digest: string; byte_length: number } {
  const bytes = canonicalizeUiIr(document);
  return {
    schema_version: UI_UX_IR_SCHEMA_VERSION,
    digest: `sha256:${sha256Hex(bytes)}`,
    byte_length: bytes.byteLength,
  };
}

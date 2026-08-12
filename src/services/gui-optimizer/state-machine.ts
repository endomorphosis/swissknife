/**
 * Explicit bounded UI state-machine extraction (VGO-016).
 *
 * Wire models:
 *   - UiStateDefinition@1 / ui-state-definition/v1
 *   - UiEventDefinition@1 / ui-event-definition/v1
 *   - UiTransitionDefinition@1 / ui-transition-definition/v1
 *   - UiStateMachineExtractor@1 / ui-state-machine-extractor/v1
 *   - UiStateMachine@1 / ui-state-machine/v1
 *
 * Derives only source-supported states and explicit conservative unknowns.
 * Never invents missing transitions by intuition. Undefined destinations are
 * rejected; explicit no-ops differ from absent outcomes; async effects must
 * expose observed loading/success/failure facts or a typed violation.
 * Extraction is pure and deterministic. This module never executes source.
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import {
  CANONICAL_JSON_PROFILE,
  type GuiExtractionConfidence,
  type GuiSourceFinding,
  type GuiSourceSpan,
  type GuiStaticScanResult,
  worstGuiExtractionConfidence,
} from './models.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_STATE_DEFINITION_INTERFACE = 'UiStateDefinition@1' as const;
export const UI_STATE_DEFINITION_SCHEMA = 'ui-state-definition/v1' as const;

export const UI_EVENT_DEFINITION_INTERFACE = 'UiEventDefinition@1' as const;
export const UI_EVENT_DEFINITION_SCHEMA = 'ui-event-definition/v1' as const;

export const UI_TRANSITION_DEFINITION_INTERFACE =
  'UiTransitionDefinition@1' as const;
export const UI_TRANSITION_DEFINITION_SCHEMA =
  'ui-transition-definition/v1' as const;

export const UI_STATE_MACHINE_EXTRACTOR_INTERFACE =
  'UiStateMachineExtractor@1' as const;
export const UI_STATE_MACHINE_EXTRACTOR_SCHEMA =
  'ui-state-machine-extractor/v1' as const;

export const UI_STATE_MACHINE_INTERFACE = 'UiStateMachine@1' as const;
export const UI_STATE_MACHINE_SCHEMA = 'ui-state-machine/v1' as const;

export const UI_STATE_MACHINE_EXTRACTOR_VERSION =
  'gui-state-machine-extractor@1.0.0' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** Closed UI state kinds for explicit state machines (mirrors Python UiStateKind). */
export const UI_STATE_KINDS = Object.freeze([
  'initial',
  'loading',
  'ready',
  'empty',
  'success',
  'failure',
  'confirmation',
  'disabled',
  'offline',
  'unavailable',
  'terminal',
  'recovery',
] as const);
export type UiStateKind = (typeof UI_STATE_KINDS)[number];

/** Closed event kinds (mirrors Python UiEventKind). */
export const UI_EVENT_KINDS = Object.freeze([
  'click',
  'submit',
  'cancel',
  'escape',
  'keyboard_activation',
  'timeout',
  'network_success',
  'network_failure',
  'validation_failure',
  'confirmation_grant',
  'confirmation_denial',
  'service_unavailable',
  'focus',
  'blur',
  'change',
  'custom',
] as const);
export type UiEventKind = (typeof UI_EVENT_KINDS)[number];

/** Scenario catalog terminal-state vocabulary consumed by the extractor. */
export const SCENARIO_TERMINAL_STATE_VOCABULARY = Object.freeze([
  'state:ready',
  'state:loading',
  'state:success',
  'state:empty',
  'state:recovery',
  'state:failure',
  'state:unavailable',
] as const);

// ---------------------------------------------------------------------------
// Wire record types
// ---------------------------------------------------------------------------

export interface UiStateDefinition {
  readonly interface: typeof UI_STATE_DEFINITION_INTERFACE;
  readonly schema_version: typeof UI_STATE_DEFINITION_SCHEMA;
  readonly state_id: string;
  readonly kind: UiStateKind;
  readonly screen_id: string;
  readonly label: string;
  readonly is_initial: boolean;
  readonly is_terminal: boolean;
  readonly description: string;
}

export interface UiEventDefinition {
  readonly interface: typeof UI_EVENT_DEFINITION_INTERFACE;
  readonly schema_version: typeof UI_EVENT_DEFINITION_SCHEMA;
  readonly event_id: string;
  readonly kind: UiEventKind;
  readonly name: string;
  readonly description: string;
}

export interface UiTransitionDefinition {
  readonly interface: typeof UI_TRANSITION_DEFINITION_INTERFACE;
  readonly schema_version: typeof UI_TRANSITION_DEFINITION_SCHEMA;
  readonly transition_id: string;
  readonly from_state_id: string;
  readonly to_state_id: string;
  readonly event_id: string;
  readonly guard: string;
  readonly effect_ids: readonly string[];
  readonly is_noop: boolean;
}

export interface UiStateMachineViolation {
  readonly code: string;
  readonly message: string;
  readonly subject_id: string;
}

export interface UiReachabilityNode {
  readonly state_id: string;
  readonly kind: UiStateKind;
  readonly reachable: boolean;
  readonly is_initial: boolean;
  readonly is_terminal: boolean;
}

export interface UiReachabilityEdge {
  readonly from_state_id: string;
  readonly to_state_id: string;
  readonly event_id: string;
  readonly transition_id: string;
  readonly is_noop: boolean;
}

export interface UiReachabilityGraph {
  readonly initial_state_id: string;
  readonly nodes: readonly UiReachabilityNode[];
  readonly edges: readonly UiReachabilityEdge[];
  readonly reachable_state_ids: readonly string[];
  readonly unreachable_state_ids: readonly string[];
}

export interface UiConditionalRenderSpan {
  readonly path: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number | null;
  readonly end_column: number | null;
  readonly observed_state_kind: UiStateKind | 'unknown';
  readonly evidence: string;
}

export interface UiAsyncEffectObservation {
  readonly effect_id: string;
  readonly source_identity: string;
  readonly has_loading: boolean;
  readonly has_success: boolean;
  readonly has_failure: boolean;
  readonly complete: boolean;
  readonly evidence: string;
}

export interface UiStateMachine {
  readonly interface: typeof UI_STATE_MACHINE_INTERFACE;
  readonly schema_version: typeof UI_STATE_MACHINE_SCHEMA;
  readonly extractor_interface: typeof UI_STATE_MACHINE_EXTRACTOR_INTERFACE;
  readonly extractor_schema_version: typeof UI_STATE_MACHINE_EXTRACTOR_SCHEMA;
  readonly extractor_version: typeof UI_STATE_MACHINE_EXTRACTOR_VERSION;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
  readonly machine_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly initial_state_id: string;
  readonly states: readonly UiStateDefinition[];
  readonly events: readonly UiEventDefinition[];
  readonly transitions: readonly UiTransitionDefinition[];
  readonly reachability: UiReachabilityGraph;
  readonly conditional_render_spans: readonly UiConditionalRenderSpan[];
  readonly async_effects: readonly UiAsyncEffectObservation[];
  readonly unresolved: readonly string[];
  readonly violations: readonly UiStateMachineViolation[];
  readonly analysis_classification: GuiExtractionConfidence;
  readonly completeness_boundary:
    | 'complete_within_boundary'
    | 'partial'
    | 'best_effort'
    | 'unknown';
  readonly executed_code: false;
}

export interface UiStateMachineValidationIssue {
  readonly code: string;
  readonly message: string;
}

export interface UiStateMachineValidationResult {
  readonly ok: boolean;
  readonly issues: readonly UiStateMachineValidationIssue[];
}

export interface UiStateMachineExtractor {
  readonly interface: typeof UI_STATE_MACHINE_EXTRACTOR_INTERFACE;
  readonly schema_version: typeof UI_STATE_MACHINE_EXTRACTOR_SCHEMA;
  readonly extractorVersion: typeof UI_STATE_MACHINE_EXTRACTOR_VERSION;
  extractFromFacts(facts: UiStateMachineFacts): UiStateMachine;
  extractFromScan(
    scan: GuiStaticScanResult,
    options?: UiStateMachineExtractOptions,
  ): UiStateMachine;
}

export interface UiStateMachineExtractOptions {
  readonly applicationId?: string;
  readonly screenId?: string;
  readonly machineId?: string;
}

/**
 * Explicit extraction input. Transitions must be source-supported facts;
 * missing outcomes stay absent rather than invented.
 */
export interface UiStateMachineFacts {
  readonly application_id: string;
  readonly screen_id: string;
  readonly machine_id?: string;
  readonly states?: readonly unknown[];
  readonly events?: readonly unknown[];
  readonly transitions?: readonly unknown[];
  readonly findings?: readonly GuiSourceFinding[];
  readonly unresolved?: readonly string[];
  readonly conditional_render_spans?: readonly UiConditionalRenderSpan[];
  readonly analysis_classification?: GuiExtractionConfidence;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UiStateMachineError extends Error {
  readonly name = 'UiStateMachineError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UiStateMachineDecodeError extends UiStateMachineError {
  readonly name = 'UiStateMachineDecodeError';
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

const STATE_KIND_SET = new Set<string>(UI_STATE_KINDS);
const EVENT_KIND_SET = new Set<string>(UI_EVENT_KINDS);
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;

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
    throw new UiStateMachineDecodeError(
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
    throw new UiStateMachineDecodeError(
      `missing required ${label} field(s): ${missing.join(', ')}`,
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiStateMachineDecodeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOptionalString(value: unknown, field: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new UiStateMachineDecodeError(`${field} must be a string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new UiStateMachineDecodeError(`${field} is not a valid identifier`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UiStateMachineDecodeError(`${field} must be a boolean`);
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
    throw new UiStateMachineDecodeError(
      `${field} must be one of: ${[...allowed].join(', ')}`,
    );
  }
  return text as T;
}

function requireStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new UiStateMachineDecodeError(`${field} must be an array`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = requireIdentifier(value[i], `${field}[${i}]`);
    if (seen.has(item)) {
      throw new UiStateMachineDecodeError(
        `${field} must not contain duplicate identifiers`,
      );
    }
    seen.add(item);
    out.push(item);
  }
  return Object.freeze(out);
}

const STATE_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'state_id',
  'kind',
  'screen_id',
  'label',
  'is_initial',
  'is_terminal',
  'description',
] as const);

const EVENT_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'event_id',
  'kind',
  'name',
  'description',
] as const);

const TRANSITION_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'transition_id',
  'from_state_id',
  'to_state_id',
  'event_id',
  'guard',
  'effect_ids',
  'is_noop',
] as const);

export function decodeUiStateDefinition(raw: unknown): UiStateDefinition {
  if (!isPlainObject(raw)) {
    throw new UiStateMachineDecodeError('UiStateDefinition must be an object');
  }
  rejectUnknownKeys(raw, STATE_FIELDS, 'UiStateDefinition');
  requireKeys(raw, STATE_FIELDS, 'UiStateDefinition');
  if (raw.interface !== UI_STATE_DEFINITION_INTERFACE) {
    throw new UiStateMachineDecodeError(
      `unsupported UiStateDefinition interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_STATE_DEFINITION_SCHEMA) {
    throw new UiStateMachineDecodeError(
      `unsupported UiStateDefinition schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_STATE_DEFINITION_INTERFACE,
    schema_version: UI_STATE_DEFINITION_SCHEMA,
    state_id: requireIdentifier(raw.state_id, 'state_id'),
    kind: requireEnum<UiStateKind>(raw.kind, 'kind', STATE_KIND_SET),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    label: requireOptionalString(raw.label, 'label'),
    is_initial: requireBoolean(raw.is_initial, 'is_initial'),
    is_terminal: requireBoolean(raw.is_terminal, 'is_terminal'),
    description: requireOptionalString(raw.description, 'description'),
  });
}

export function decodeUiEventDefinition(raw: unknown): UiEventDefinition {
  if (!isPlainObject(raw)) {
    throw new UiStateMachineDecodeError('UiEventDefinition must be an object');
  }
  rejectUnknownKeys(raw, EVENT_FIELDS, 'UiEventDefinition');
  requireKeys(raw, EVENT_FIELDS, 'UiEventDefinition');
  if (raw.interface !== UI_EVENT_DEFINITION_INTERFACE) {
    throw new UiStateMachineDecodeError(
      `unsupported UiEventDefinition interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_EVENT_DEFINITION_SCHEMA) {
    throw new UiStateMachineDecodeError(
      `unsupported UiEventDefinition schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: UI_EVENT_DEFINITION_INTERFACE,
    schema_version: UI_EVENT_DEFINITION_SCHEMA,
    event_id: requireIdentifier(raw.event_id, 'event_id'),
    kind: requireEnum<UiEventKind>(raw.kind, 'kind', EVENT_KIND_SET),
    name: requireString(raw.name, 'name'),
    description: requireOptionalString(raw.description, 'description'),
  });
}

export function decodeUiTransitionDefinition(
  raw: unknown,
): UiTransitionDefinition {
  if (!isPlainObject(raw)) {
    throw new UiStateMachineDecodeError(
      'UiTransitionDefinition must be an object',
    );
  }
  rejectUnknownKeys(raw, TRANSITION_FIELDS, 'UiTransitionDefinition');
  requireKeys(raw, TRANSITION_FIELDS, 'UiTransitionDefinition');
  if (raw.interface !== UI_TRANSITION_DEFINITION_INTERFACE) {
    throw new UiStateMachineDecodeError(
      `unsupported UiTransitionDefinition interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_TRANSITION_DEFINITION_SCHEMA) {
    throw new UiStateMachineDecodeError(
      `unsupported UiTransitionDefinition schema_version: ${String(raw.schema_version)}`,
    );
  }
  const isNoop = requireBoolean(raw.is_noop, 'is_noop');
  const fromStateId = requireIdentifier(raw.from_state_id, 'from_state_id');
  const toStateId = requireIdentifier(raw.to_state_id, 'to_state_id');
  if (isNoop && fromStateId !== toStateId) {
    throw new UiStateMachineDecodeError(
      'is_noop transitions must keep to_state_id equal to from_state_id',
    );
  }
  return Object.freeze({
    interface: UI_TRANSITION_DEFINITION_INTERFACE,
    schema_version: UI_TRANSITION_DEFINITION_SCHEMA,
    transition_id: requireIdentifier(raw.transition_id, 'transition_id'),
    from_state_id: fromStateId,
    to_state_id: toStateId,
    event_id: requireIdentifier(raw.event_id, 'event_id'),
    guard: requireOptionalString(raw.guard, 'guard'),
    effect_ids: requireStringArray(raw.effect_ids, 'effect_ids'),
    is_noop: isNoop,
  });
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function makeUiStateDefinition(partial: {
  state_id: string;
  kind: UiStateKind;
  screen_id: string;
  label?: string;
  is_initial?: boolean;
  is_terminal?: boolean;
  description?: string;
}): UiStateDefinition {
  return decodeUiStateDefinition({
    interface: UI_STATE_DEFINITION_INTERFACE,
    schema_version: UI_STATE_DEFINITION_SCHEMA,
    state_id: partial.state_id,
    kind: partial.kind,
    screen_id: partial.screen_id,
    label: partial.label ?? '',
    is_initial: partial.is_initial ?? false,
    is_terminal: partial.is_terminal ?? false,
    description: partial.description ?? '',
  });
}

export function makeUiEventDefinition(partial: {
  event_id: string;
  kind: UiEventKind;
  name: string;
  description?: string;
}): UiEventDefinition {
  return decodeUiEventDefinition({
    interface: UI_EVENT_DEFINITION_INTERFACE,
    schema_version: UI_EVENT_DEFINITION_SCHEMA,
    event_id: partial.event_id,
    kind: partial.kind,
    name: partial.name,
    description: partial.description ?? '',
  });
}

export function makeUiTransitionDefinition(partial: {
  transition_id: string;
  from_state_id: string;
  to_state_id: string;
  event_id: string;
  guard?: string;
  effect_ids?: readonly string[];
  is_noop?: boolean;
}): UiTransitionDefinition {
  return decodeUiTransitionDefinition({
    interface: UI_TRANSITION_DEFINITION_INTERFACE,
    schema_version: UI_TRANSITION_DEFINITION_SCHEMA,
    transition_id: partial.transition_id,
    from_state_id: partial.from_state_id,
    to_state_id: partial.to_state_id,
    event_id: partial.event_id,
    guard: partial.guard ?? '',
    effect_ids: partial.effect_ids ?? [],
    is_noop: partial.is_noop ?? false,
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
      throw new UiStateMachineError('canonical JSON rejects non-finite numbers');
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
  throw new UiStateMachineError(
    `canonical JSON cannot encode ${typeof value}`,
  );
}

export function serializeUiStateMachine(machine: UiStateMachine): string {
  return canonicalJson(machine);
}

export function stateMachineDigest(machine: UiStateMachine): string {
  return `sha256:${sha256Hex(serializeUiStateMachine(machine))}`;
}

// ---------------------------------------------------------------------------
// Public extractor API
// ---------------------------------------------------------------------------

export function createUiStateMachineExtractor(): UiStateMachineExtractor {
  return {
    interface: UI_STATE_MACHINE_EXTRACTOR_INTERFACE,
    schema_version: UI_STATE_MACHINE_EXTRACTOR_SCHEMA,
    extractorVersion: UI_STATE_MACHINE_EXTRACTOR_VERSION,
    extractFromFacts(facts) {
      return extractUiStateMachineFromFacts(facts);
    },
    extractFromScan(scan, options) {
      return extractUiStateMachineFromScan(scan, options);
    },
  };
}

export function extractUiStateMachineFromFacts(
  facts: UiStateMachineFacts,
): UiStateMachine {
  if (!facts || typeof facts !== 'object') {
    throw new UiStateMachineError('facts must be an object');
  }
  const applicationId = requireIdentifier(
    facts.application_id,
    'application_id',
  );
  const screenId = requireIdentifier(facts.screen_id, 'screen_id');
  const machineId = facts.machine_id
    ? requireIdentifier(facts.machine_id, 'machine_id')
    : `sm:${applicationId}:${screenId}`;

  const unresolved = new Set<string>(facts.unresolved ?? []);
  const violations: UiStateMachineViolation[] = [];
  const confidences: GuiExtractionConfidence[] = [];
  if (facts.analysis_classification) {
    confidences.push(facts.analysis_classification);
  }

  // Decode explicit wire records first (source-supported facts).
  const statesById = new Map<string, UiStateDefinition>();
  for (const raw of facts.states ?? []) {
    const state = decodeUiStateDefinition(raw);
    if (statesById.has(state.state_id)) {
      throw new UiStateMachineError(
        `duplicate state_id: ${state.state_id}`,
      );
    }
    statesById.set(state.state_id, state);
  }

  const eventsById = new Map<string, UiEventDefinition>();
  for (const raw of facts.events ?? []) {
    const event = decodeUiEventDefinition(raw);
    if (eventsById.has(event.event_id)) {
      throw new UiStateMachineError(
        `duplicate event_id: ${event.event_id}`,
      );
    }
    eventsById.set(event.event_id, event);
  }

  const transitionsById = new Map<string, UiTransitionDefinition>();
  for (const raw of facts.transitions ?? []) {
    const transition = decodeUiTransitionDefinition(raw);
    if (transitionsById.has(transition.transition_id)) {
      throw new UiStateMachineError(
        `duplicate transition_id: ${transition.transition_id}`,
      );
    }
    transitionsById.set(transition.transition_id, transition);
  }

  const findings = [...(facts.findings ?? [])];
  findings.sort(compareFindings);

  // Derive conservative states/events from scanner findings without inventing
  // transitions. Unsupported names become explicit unresolved unknowns.
  const conditionalSpans: UiConditionalRenderSpan[] = [
    ...(facts.conditional_render_spans ?? []),
  ];
  const asyncEffects: UiAsyncEffectObservation[] = [];

  // Pass 1: derive states/events from findings. Async observations wait until
  // every state fact is known so ordering cannot hide loading/success/failure.
  const asyncFindings: GuiSourceFinding[] = [];
  for (const finding of findings) {
    confidences.push(finding.confidence);
    if (
      finding.confidence === 'opaque' ||
      finding.confidence === 'heuristic' ||
      finding.requires_raw_source
    ) {
      unresolved.add(`${finding.stable_identity}:${finding.confidence}`);
    }

    if (finding.kind === 'async_operation') {
      asyncFindings.push(finding);
      continue;
    }

    if (finding.kind === 'state' || finding.kind === 'reducer') {
      const kind = inferStateKind(finding.name, finding.evidence);
      if (kind === null) {
        unresolved.add(
          `state-unknown:${finding.stable_identity}:${sanitizeToken(finding.name)}`,
        );
        continue;
      }
      const stateId = stableStateId(kind);
      if (!statesById.has(stateId)) {
        statesById.set(
          stateId,
          makeUiStateDefinition({
            state_id: stateId,
            kind,
            screen_id: screenId,
            label: kind,
            is_initial: kind === 'initial',
            is_terminal: isTerminalKind(kind),
            description: `Derived from ${finding.kind} finding ${finding.name}`,
          }),
        );
      }
      if (looksLikeConditionalRender(finding)) {
        conditionalSpans.push(
          freezeConditionalSpan({
            path: finding.path,
            start_line: finding.span.start_line,
            start_column: finding.span.start_column,
            end_line: finding.span.end_line,
            end_column: finding.span.end_column,
            observed_state_kind: kind,
            evidence: finding.evidence || finding.name,
          }),
        );
      }
      continue;
    }

    if (
      finding.kind === 'event_handler' ||
      finding.kind === 'button' ||
      finding.kind === 'form' ||
      finding.kind === 'keyboard' ||
      finding.kind === 'confirmation' ||
      finding.kind === 'validation'
    ) {
      const eventKind = inferEventKind(finding);
      if (eventKind === null) {
        unresolved.add(
          `event-unknown:${finding.stable_identity}:${sanitizeToken(finding.name)}`,
        );
        continue;
      }
      const eventId = stableEventId(eventKind);
      if (!eventsById.has(eventId)) {
        eventsById.set(
          eventId,
          makeUiEventDefinition({
            event_id: eventId,
            kind: eventKind,
            name: finding.name || eventKind,
            description: `Derived from ${finding.kind} finding`,
          }),
        );
      }
    }
  }

  // Pass 2: async completeness against the full observed state/transition set.
  for (const finding of asyncFindings) {
    const observation = observeAsyncEffect(
      finding,
      statesById,
      transitionsById,
    );
    asyncEffects.push(observation);
    if (!observation.complete) {
      violations.push({
        code: 'async_effect_incomplete',
        subject_id: observation.effect_id,
        message:
          `async effect ${observation.effect_id} lacks observed ` +
          `loading/success/failure facts`,
      });
      unresolved.add(`async-incomplete:${observation.effect_id}`);
    }
  }

  // Explicit transitions may reference destinations that must already exist.
  for (const transition of transitionsById.values()) {
    if (!statesById.has(transition.from_state_id)) {
      throw new UiStateMachineError(
        `undefined transition source: ${transition.from_state_id}`,
      );
    }
    if (!statesById.has(transition.to_state_id)) {
      throw new UiStateMachineError(
        `undefined transition destination: ${transition.to_state_id}`,
      );
    }
    if (!eventsById.has(transition.event_id)) {
      throw new UiStateMachineError(
        `undefined transition event: ${transition.event_id}`,
      );
    }
  }

  // Require exactly one initial state when any states exist.
  const states = [...statesById.values()].sort(compareStates);
  const events = [...eventsById.values()].sort(compareEvents);
  const transitions = [...transitionsById.values()].sort(compareTransitions);

  if (states.length === 0) {
    unresolved.add('no-source-supported-states');
  }

  const initialStates = states.filter(state => state.is_initial);
  let initialStateId = '';
  if (initialStates.length === 1) {
    initialStateId = initialStates[0].state_id;
  } else if (initialStates.length === 0 && states.length > 0) {
    // Prefer an explicit initial kind, else first ready, else first state.
    const preferred =
      states.find(s => s.kind === 'initial') ??
      states.find(s => s.kind === 'ready') ??
      states[0];
    initialStateId = preferred.state_id;
    unresolved.add(`initial-state-inferred:${initialStateId}`);
  } else if (initialStates.length > 1) {
    throw new UiStateMachineError(
      `multiple initial states: ${initialStates.map(s => s.state_id).join(', ')}`,
    );
  }

  // Nonterminal failure without recovery/terminal explanation is unresolved.
  for (const state of states) {
    if (state.kind === 'failure' && !state.is_terminal) {
      const hasRecovery = transitions.some(
        t =>
          t.from_state_id === state.state_id &&
          (statesById.get(t.to_state_id)?.kind === 'recovery' ||
            statesById.get(t.to_state_id)?.is_terminal === true),
      );
      if (!hasRecovery) {
        unresolved.add(`failure-without-recovery:${state.state_id}`);
      }
    }
  }

  const reachability = buildReachabilityGraph(
    initialStateId,
    states,
    transitions,
  );

  conditionalSpans.sort(compareConditionalSpans);
  asyncEffects.sort((a, b) => a.effect_id.localeCompare(b.effect_id));
  violations.sort((a, b) => {
    const byCode = a.code.localeCompare(b.code);
    if (byCode !== 0) return byCode;
    return a.subject_id.localeCompare(b.subject_id);
  });

  const unresolvedList = [...unresolved].sort((a, b) => a.localeCompare(b));
  const classification = worstGuiExtractionConfidence(
    confidences.length > 0 ? confidences : ['exact'],
  );
  const completeness =
    unresolvedList.length > 0 ||
    violations.length > 0 ||
    classification !== 'exact'
      ? 'partial'
      : 'complete_within_boundary';

  return Object.freeze({
    interface: UI_STATE_MACHINE_INTERFACE,
    schema_version: UI_STATE_MACHINE_SCHEMA,
    extractor_interface: UI_STATE_MACHINE_EXTRACTOR_INTERFACE,
    extractor_schema_version: UI_STATE_MACHINE_EXTRACTOR_SCHEMA,
    extractor_version: UI_STATE_MACHINE_EXTRACTOR_VERSION,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    machine_id: machineId,
    application_id: applicationId,
    screen_id: screenId,
    initial_state_id: initialStateId,
    states: Object.freeze(states),
    events: Object.freeze(events),
    transitions: Object.freeze(transitions),
    reachability: Object.freeze(reachability),
    conditional_render_spans: Object.freeze(conditionalSpans.map(freezeConditionalSpan)),
    async_effects: Object.freeze(asyncEffects.map(freezeAsyncEffect)),
    unresolved: Object.freeze(unresolvedList),
    violations: Object.freeze(violations.map(v => Object.freeze({ ...v }))),
    analysis_classification: classification,
    completeness_boundary: completeness,
    executed_code: false as const,
  });
}

export function extractUiStateMachineFromScan(
  scan: GuiStaticScanResult,
  options: UiStateMachineExtractOptions = {},
): UiStateMachine {
  if (!scan || typeof scan !== 'object') {
    throw new UiStateMachineError('scan must be an object');
  }
  if (scan.executed_code !== false) {
    throw new UiStateMachineError(
      'UiStateMachineExtractor refuses scans that executed repository code',
    );
  }
  const applicationId =
    options.applicationId ??
    inferIdFromFindings(scan.findings, 'application_id') ??
    'unknown-application';
  const screenId =
    options.screenId ??
    inferIdFromFindings(scan.findings, 'screen_id') ??
    'unknown-screen';

  return extractUiStateMachineFromFacts({
    application_id: applicationId,
    screen_id: screenId,
    machine_id: options.machineId,
    findings: scan.findings,
    unresolved: scan.unresolved,
    analysis_classification: scan.analysis_classification,
  });
}

/**
 * Validate a machine. Undefined destinations, bad no-ops, and incomplete
 * async effects fail closed. Absent outcomes are not treated as no-ops.
 */
export function validateUiStateMachine(
  machine: UiStateMachine,
): UiStateMachineValidationResult {
  const issues: UiStateMachineValidationIssue[] = [];

  if (machine.interface !== UI_STATE_MACHINE_INTERFACE) {
    issues.push({
      code: 'machine_interface_mismatch',
      message: `expected ${UI_STATE_MACHINE_INTERFACE}`,
    });
  }
  if (machine.schema_version !== UI_STATE_MACHINE_SCHEMA) {
    issues.push({
      code: 'machine_schema_mismatch',
      message: `expected ${UI_STATE_MACHINE_SCHEMA}`,
    });
  }
  if (machine.extractor_interface !== UI_STATE_MACHINE_EXTRACTOR_INTERFACE) {
    issues.push({
      code: 'extractor_interface_mismatch',
      message: `expected ${UI_STATE_MACHINE_EXTRACTOR_INTERFACE}`,
    });
  }
  if (machine.executed_code !== false) {
    issues.push({
      code: 'executed_code',
      message: 'executed_code must be false',
    });
  }

  const stateIds = new Set(machine.states.map(s => s.state_id));
  const eventIds = new Set(machine.events.map(e => e.event_id));
  const transitionIds = new Set<string>();

  if (machine.states.length > 0 && !stateIds.has(machine.initial_state_id)) {
    issues.push({
      code: 'undefined_initial_state',
      message: `initial_state_id ${machine.initial_state_id} is not defined`,
    });
  }

  const initialCount = machine.states.filter(s => s.is_initial).length;
  if (initialCount > 1) {
    issues.push({
      code: 'multiple_initial_states',
      message: `expected at most one initial state, found ${initialCount}`,
    });
  }

  for (const transition of machine.transitions) {
    if (transitionIds.has(transition.transition_id)) {
      issues.push({
        code: 'duplicate_transition_id',
        message: transition.transition_id,
      });
    }
    transitionIds.add(transition.transition_id);

    if (!stateIds.has(transition.from_state_id)) {
      issues.push({
        code: 'undefined_source_state',
        message: transition.from_state_id,
      });
    }
    if (!stateIds.has(transition.to_state_id)) {
      issues.push({
        code: 'undefined_destination_state',
        message: `transition ${transition.transition_id} targets undefined state ${transition.to_state_id}`,
      });
    }
    if (!eventIds.has(transition.event_id)) {
      issues.push({
        code: 'undefined_event',
        message: transition.event_id,
      });
    }
    if (transition.is_noop && transition.from_state_id !== transition.to_state_id) {
      issues.push({
        code: 'invalid_noop',
        message: `noop ${transition.transition_id} must keep source and destination identical`,
      });
    }
  }

  // Explicit no-ops differ from absent outcomes: absence is not an issue by
  // itself; only incomplete async effects and undefined destinations fail.
  const seenAsync = new Set<string>();
  for (const effect of machine.async_effects) {
    if (!effect.complete && !seenAsync.has(effect.effect_id)) {
      seenAsync.add(effect.effect_id);
      issues.push({
        code: 'async_effect_incomplete',
        message: `async effect ${effect.effect_id} is incomplete`,
      });
    }
  }
  for (const violation of machine.violations) {
    if (
      violation.code === 'async_effect_incomplete' &&
      !seenAsync.has(violation.subject_id)
    ) {
      seenAsync.add(violation.subject_id);
      issues.push({
        code: 'async_effect_incomplete',
        message: violation.message,
      });
    }
  }

  issues.sort((a, b) => {
    const byCode = a.code.localeCompare(b.code);
    if (byCode !== 0) return byCode;
    return a.message.localeCompare(b.message);
  });

  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export function buildReachabilityGraph(
  initialStateId: string,
  states: readonly UiStateDefinition[],
  transitions: readonly UiTransitionDefinition[],
): UiReachabilityGraph {
  const adjacency = new Map<string, UiReachabilityEdge[]>();
  for (const transition of transitions) {
    const edge: UiReachabilityEdge = Object.freeze({
      from_state_id: transition.from_state_id,
      to_state_id: transition.to_state_id,
      event_id: transition.event_id,
      transition_id: transition.transition_id,
      is_noop: transition.is_noop,
    });
    const list = adjacency.get(transition.from_state_id) ?? [];
    list.push(edge);
    adjacency.set(transition.from_state_id, list);
  }
  for (const [key, list] of adjacency) {
    list.sort((a, b) => {
      const byEvent = a.event_id.localeCompare(b.event_id);
      if (byEvent !== 0) return byEvent;
      return a.transition_id.localeCompare(b.transition_id);
    });
    adjacency.set(key, list);
  }

  const reachable = new Set<string>();
  if (initialStateId) {
    const queue = [initialStateId];
    reachable.add(initialStateId);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const edge of adjacency.get(current) ?? []) {
        if (!reachable.has(edge.to_state_id)) {
          reachable.add(edge.to_state_id);
          queue.push(edge.to_state_id);
        }
      }
    }
  }

  const nodes = states
    .map(state =>
      Object.freeze({
        state_id: state.state_id,
        kind: state.kind,
        reachable: reachable.has(state.state_id),
        is_initial: state.is_initial,
        is_terminal: state.is_terminal,
      }),
    )
    .sort((a, b) => a.state_id.localeCompare(b.state_id));

  const edges = transitions
    .map(t =>
      Object.freeze({
        from_state_id: t.from_state_id,
        to_state_id: t.to_state_id,
        event_id: t.event_id,
        transition_id: t.transition_id,
        is_noop: t.is_noop,
      }),
    )
    .sort((a, b) => {
      const byFrom = a.from_state_id.localeCompare(b.from_state_id);
      if (byFrom !== 0) return byFrom;
      const byEvent = a.event_id.localeCompare(b.event_id);
      if (byEvent !== 0) return byEvent;
      return a.transition_id.localeCompare(b.transition_id);
    });

  const reachableIds = [...reachable].sort((a, b) => a.localeCompare(b));
  const unreachableIds = states
    .map(s => s.state_id)
    .filter(id => !reachable.has(id))
    .sort((a, b) => a.localeCompare(b));

  return Object.freeze({
    initial_state_id: initialStateId,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    reachable_state_ids: Object.freeze(reachableIds),
    unreachable_state_ids: Object.freeze(unreachableIds),
  });
}

/**
 * Report outcomes for a (state, event) pair.
 * - explicit transition(s) when source-supported
 * - is_noop when the transition is an explicit no-op
 * - absent when no transition exists (distinct from no-op)
 */
export function lookupTransitionOutcomes(
  machine: UiStateMachine,
  fromStateId: string,
  eventId: string,
): {
  readonly status: 'transition' | 'noop' | 'absent';
  readonly transitions: readonly UiTransitionDefinition[];
} {
  const matches = machine.transitions.filter(
    t => t.from_state_id === fromStateId && t.event_id === eventId,
  );
  if (matches.length === 0) {
    return Object.freeze({ status: 'absent' as const, transitions: Object.freeze([]) });
  }
  if (matches.every(t => t.is_noop)) {
    return Object.freeze({
      status: 'noop' as const,
      transitions: Object.freeze(matches),
    });
  }
  return Object.freeze({
    status: 'transition' as const,
    transitions: Object.freeze(matches),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stableStateId(kind: UiStateKind): string {
  return `state:${kind}`;
}

function stableEventId(kind: UiEventKind): string {
  return `event:${kind.replace(/_/g, '-')}`;
}

function isTerminalKind(kind: UiStateKind): boolean {
  return (
    kind === 'terminal' ||
    kind === 'success' ||
    kind === 'empty' ||
    kind === 'unavailable'
  );
}

function sanitizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '_')
    .slice(0, 64) || 'anonymous';
}

function inferStateKind(
  name: string,
  evidence: string,
): UiStateKind | null {
  // CamelCase tokens are split so names like isLoading / hasError match kinds.
  const text = `${name} ${evidence}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./]+/g, ' ')
    .toLowerCase();
  const ordered: Array<[RegExp, UiStateKind]> = [
    [/\binitial\b|\bmount\b|\bbootstrap\b/, 'initial'],
    [/\bloading\b|\bpending\b|\bin[_-]?flight\b|\bfetching\b/, 'loading'],
    [/\brecovery\b|\bretry\b|\brecoverable\b/, 'recovery'],
    [/\bconfirm(ation)?\b|\bmodal\b/, 'confirmation'],
    [/\bunavailable\b|\bservice[_-]?unavailable\b/, 'unavailable'],
    [/\boffline\b|\bdisconnected\b/, 'offline'],
    [/\bdisabled\b|\breadonly\b/, 'disabled'],
    [/\bfailure\b|\berror\b|\brejected\b/, 'failure'],
    [/\bsuccess\b|\bcompleted\b|\bdone\b/, 'success'],
    [/\bempty\b|\bno[_-]?data\b|\bzero[_-]?state\b/, 'empty'],
    [/\bready\b|\bidle\b|\bdefault\b/, 'ready'],
    [/\bterminal\b|\bfinal\b/, 'terminal'],
  ];
  for (const [pattern, kind] of ordered) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

function inferEventKind(finding: GuiSourceFinding): UiEventKind | null {
  const text = [
    finding.kind,
    finding.name,
    finding.evidence,
    ...Object.values(finding.attributes ?? {}),
  ]
    .join(' ')
    .toLowerCase();

  if (finding.kind === 'form' || /\bsubmit\b|\bonsubmit\b/.test(text)) {
    return 'submit';
  }
  if (/\bcancel\b|\boncancel\b/.test(text)) return 'cancel';
  if (/\bescape\b|\besckey\b|\bkey(board)?[_\s-]?escape\b/.test(text)) {
    return 'escape';
  }
  if (
    finding.kind === 'keyboard' ||
    /\bkeyboard\b|\bonkey(down|up|press)\b|\benter\b|\bspace\b/.test(text)
  ) {
    return 'keyboard_activation';
  }
  if (/\btimeout\b|\bsettimeout\b|\bdeadline\b/.test(text)) return 'timeout';
  if (/\bnetwork[_-]?success\b|\bfetch[_-]?ok\b|\bonload\b/.test(text)) {
    return 'network_success';
  }
  if (/\bnetwork[_-]?fail|\bfetch[_-]?error\b|\bonerror\b/.test(text)) {
    return 'network_failure';
  }
  if (
    finding.kind === 'validation' ||
    /\bvalidation[_-]?fail|\binvalid\b/.test(text)
  ) {
    return 'validation_failure';
  }
  if (/\bconfirm(ation)?[_-]?(grant|accept|yes)\b/.test(text)) {
    return 'confirmation_grant';
  }
  if (/\bconfirm(ation)?[_-]?(den(y|ial)|reject|no)\b/.test(text)) {
    return 'confirmation_denial';
  }
  if (/\bservice[_-]?unavailable\b|\b503\b/.test(text)) {
    return 'service_unavailable';
  }
  if (/\bfocus\b|\bonfocus\b/.test(text)) return 'focus';
  if (/\bblur\b|\bonblur\b/.test(text)) return 'blur';
  if (/\bchange\b|\bonchange\b|\binput\b/.test(text)) return 'change';
  if (
    finding.kind === 'button' ||
    /\bclick\b|\bonclick\b|\bpress\b/.test(text)
  ) {
    return 'click';
  }
  if (finding.kind === 'confirmation') return 'confirmation_grant';
  return null;
}

function looksLikeConditionalRender(finding: GuiSourceFinding): boolean {
  const text = `${finding.evidence} ${finding.name} ${JSON.stringify(finding.attributes)}`.toLowerCase();
  return (
    text.includes('?') ||
    text.includes('&&') ||
    text.includes('conditional') ||
    text.includes('render') ||
    text.includes('ternary') ||
    finding.attributes?.conditional === 'true'
  );
}

function observeAsyncEffect(
  finding: GuiSourceFinding,
  statesById: Map<string, UiStateDefinition>,
  transitionsById: Map<string, UiTransitionDefinition>,
): UiAsyncEffectObservation {
  const effectId = `effect:${sanitizeToken(finding.stable_identity || finding.name)}`;
  const text = `${finding.name} ${finding.evidence} ${JSON.stringify(finding.attributes)}`.toLowerCase();

  const hasLoading =
    statesById.has('state:loading') ||
    [...statesById.values()].some(s => s.kind === 'loading') ||
    /\bloading\b|\bpending\b/.test(text) ||
    finding.attributes?.loading === 'true';
  const hasSuccess =
    statesById.has('state:success') ||
    [...statesById.values()].some(s => s.kind === 'success') ||
    [...transitionsById.values()].some(
      t =>
        t.effect_ids.includes(effectId) &&
        (t.to_state_id === 'state:success' ||
          statesById.get(t.to_state_id)?.kind === 'success'),
    ) ||
    /\bsuccess\b|\bresolved\b|\bcompleted\b/.test(text) ||
    finding.attributes?.success === 'true';
  const hasFailure =
    statesById.has('state:failure') ||
    [...statesById.values()].some(s => s.kind === 'failure') ||
    [...transitionsById.values()].some(
      t =>
        t.effect_ids.includes(effectId) &&
        (t.to_state_id === 'state:failure' ||
          statesById.get(t.to_state_id)?.kind === 'failure'),
    ) ||
    /\bfailure\b|\berror\b|\brejected\b/.test(text) ||
    finding.attributes?.failure === 'true';

  return Object.freeze({
    effect_id: effectId,
    source_identity: finding.stable_identity,
    has_loading: hasLoading,
    has_success: hasSuccess,
    has_failure: hasFailure,
    complete: hasLoading && hasSuccess && hasFailure,
    evidence: finding.evidence || finding.name,
  });
}

function freezeConditionalSpan(
  span: UiConditionalRenderSpan,
): UiConditionalRenderSpan {
  return Object.freeze({ ...span });
}

function freezeAsyncEffect(
  effect: UiAsyncEffectObservation,
): UiAsyncEffectObservation {
  return Object.freeze({ ...effect });
}

function inferIdFromFindings(
  findings: readonly GuiSourceFinding[],
  key: 'application_id' | 'screen_id',
): string | null {
  for (const finding of findings) {
    const value = finding.attributes?.[key];
    if (typeof value === 'string' && IDENTIFIER_RE.test(value)) {
      return value;
    }
  }
  return null;
}

function compareFindings(a: GuiSourceFinding, b: GuiSourceFinding): number {
  const byPath = a.path.localeCompare(b.path);
  if (byPath !== 0) return byPath;
  const byId = a.finding_id.localeCompare(b.finding_id);
  if (byId !== 0) return byId;
  return a.stable_identity.localeCompare(b.stable_identity);
}

function compareStates(a: UiStateDefinition, b: UiStateDefinition): number {
  return a.state_id.localeCompare(b.state_id);
}

function compareEvents(a: UiEventDefinition, b: UiEventDefinition): number {
  return a.event_id.localeCompare(b.event_id);
}

function compareTransitions(
  a: UiTransitionDefinition,
  b: UiTransitionDefinition,
): number {
  return a.transition_id.localeCompare(b.transition_id);
}

function compareConditionalSpans(
  a: UiConditionalRenderSpan,
  b: UiConditionalRenderSpan,
): number {
  const byPath = a.path.localeCompare(b.path);
  if (byPath !== 0) return byPath;
  if (a.start_line !== b.start_line) return a.start_line - b.start_line;
  if (a.start_column !== b.start_column) return a.start_column - b.start_column;
  return a.evidence.localeCompare(b.evidence);
}

// Re-export span type for consumers that bind conditional spans to findings.
export type { GuiSourceFinding, GuiSourceSpan, GuiStaticScanResult };

/**
 * Deterministic evaluation scenario catalog (VGO-003).
 *
 * Declares controlled Agent Supervisor evaluation scenarios with stable IDs,
 * explicit synthetic fixtures, locale/color/viewport/text-scale inputs, and
 * expected terminal states. Catalog construction is pure and byte-identical
 * across repeated builds. Fixtures are inert: no production credentials,
 * services, user data, or effectful external operations.
 *
 * Wire models:
 *   - UiEvaluationScenario@1 / ui-evaluation-scenario/v1
 *   - ViewportSpec@1 / gui-viewport-spec/v1
 *   - DeterministicScenarioCatalog@1 / deterministic-scenario-catalog/v1
 */

import { sha256Hex } from '../shared/shared-browser-crypto.js';
import { CANONICAL_JSON_PROFILE } from './models.js';

// ---------------------------------------------------------------------------
// Interface / schema identity
// ---------------------------------------------------------------------------

export const UI_EVALUATION_SCENARIO_INTERFACE =
  'UiEvaluationScenario@1' as const;
export const UI_EVALUATION_SCENARIO_SCHEMA =
  'ui-evaluation-scenario/v1' as const;

export const VIEWPORT_SPEC_INTERFACE = 'ViewportSpec@1' as const;
export const VIEWPORT_SPEC_SCHEMA = 'gui-viewport-spec/v1' as const;

export const DETERMINISTIC_SCENARIO_CATALOG_INTERFACE =
  'DeterministicScenarioCatalog@1' as const;
export const DETERMINISTIC_SCENARIO_CATALOG_SCHEMA =
  'deterministic-scenario-catalog/v1' as const;

export const SCENARIO_FIXTURE_INTERFACE = 'ScenarioFixture@1' as const;
export const SCENARIO_FIXTURE_SCHEMA = 'scenario-fixture/v1' as const;

export const AGENT_SUPERVISOR_APPLICATION_ID = 'app:agent-supervisor' as const;
export const AGENT_SUPERVISOR_SCREEN_ID = 'screen:agent-supervisor' as const;
export const AGENT_SUPERVISOR_CATALOG_ID =
  'catalog:agent-supervisor-scenarios' as const;

/** Fixed seed/time settings frozen into every catalog construction. */
export const AGENT_SUPERVISOR_CATALOG_SEED =
  'vgo-003-agent-supervisor-deterministic-seed' as const;
export const AGENT_SUPERVISOR_FROZEN_TIME = '2026-08-11T00:00:00.000Z' as const;
export const AGENT_SUPERVISOR_TIMEZONE = 'UTC' as const;
export const AGENT_SUPERVISOR_DEFAULT_LOCALE = 'en-US' as const;

export const SCENARIO_CATALOG_EXTRACTOR_VERSION =
  'gui-scenario-catalog@1.0.0' as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/**
 * Required scenario kinds for the Agent Supervisor evaluation matrix.
 * Order is the sealed catalog declaration order.
 */
export const REQUIRED_SCENARIO_KINDS = Object.freeze([
  'initial_load',
  'loading',
  'success',
  'empty',
  'recoverable_failure',
  'unrecoverable_failure',
  'invalid_submission',
  'valid_submission',
  'keyboard_only',
  'viewport_mobile',
  'viewport_desktop',
  'viewport_wide',
  'text_scale_200',
  'reduced_motion',
  'dark_mode',
  'service_unavailable',
  'confirmation_grant',
  'confirmation_deny',
] as const);

export type ScenarioKind = (typeof REQUIRED_SCENARIO_KINDS)[number];

export const STABLE_SCENARIO_IDS = Object.freeze({
  initial_load: 'scenario:initial-load',
  loading: 'scenario:loading',
  success: 'scenario:success',
  empty: 'scenario:empty',
  recoverable_failure: 'scenario:recoverable-failure',
  unrecoverable_failure: 'scenario:unrecoverable-failure',
  invalid_submission: 'scenario:invalid-submission',
  valid_submission: 'scenario:valid-submission',
  keyboard_only: 'scenario:keyboard-only',
  viewport_mobile: 'scenario:viewport-mobile',
  viewport_desktop: 'scenario:viewport-desktop',
  viewport_wide: 'scenario:viewport-wide',
  text_scale_200: 'scenario:text-scale-200',
  reduced_motion: 'scenario:reduced-motion',
  dark_mode: 'scenario:dark-mode',
  service_unavailable: 'scenario:service-unavailable',
  confirmation_grant: 'scenario:confirmation-grant',
  confirmation_deny: 'scenario:confirmation-deny',
} as const satisfies Record<ScenarioKind, string>);

export const EXPECTED_TERMINAL_STATES = Object.freeze({
  initial_load: Object.freeze(['state:ready'] as const),
  loading: Object.freeze(['state:loading'] as const),
  success: Object.freeze(['state:success'] as const),
  empty: Object.freeze(['state:empty'] as const),
  recoverable_failure: Object.freeze(['state:recovery'] as const),
  unrecoverable_failure: Object.freeze(['state:failure'] as const),
  invalid_submission: Object.freeze(['state:ready'] as const),
  valid_submission: Object.freeze(['state:success'] as const),
  keyboard_only: Object.freeze(['state:ready'] as const),
  viewport_mobile: Object.freeze(['state:ready'] as const),
  viewport_desktop: Object.freeze(['state:ready'] as const),
  viewport_wide: Object.freeze(['state:ready'] as const),
  text_scale_200: Object.freeze(['state:ready'] as const),
  reduced_motion: Object.freeze(['state:ready'] as const),
  dark_mode: Object.freeze(['state:ready'] as const),
  service_unavailable: Object.freeze(['state:unavailable'] as const),
  confirmation_grant: Object.freeze(['state:success'] as const),
  confirmation_deny: Object.freeze(['state:ready'] as const),
} as const satisfies Record<ScenarioKind, readonly string[]>);

export type ColorScheme = 'light' | 'dark';

export type NetworkOutcome =
  | 'success'
  | 'empty'
  | 'loading'
  | 'recoverable_error'
  | 'unrecoverable_error'
  | 'service_unavailable'
  | 'validation_failure'
  | 'confirmation_pending'
  | 'confirmation_granted'
  | 'confirmation_denied';

// ---------------------------------------------------------------------------
// Wire / catalog types
// ---------------------------------------------------------------------------

export interface ViewportSpec {
  readonly interface: typeof VIEWPORT_SPEC_INTERFACE;
  readonly schema_version: typeof VIEWPORT_SPEC_SCHEMA;
  readonly width: number;
  readonly height: number;
  readonly device_scale_factor: number;
}

/** UiEvaluationScenario@1 closed wire record. */
export interface UiEvaluationScenario {
  readonly interface: typeof UI_EVALUATION_SCENARIO_INTERFACE;
  readonly schema_version: typeof UI_EVALUATION_SCENARIO_SCHEMA;
  readonly scenario_id: string;
  readonly name: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly fixture_digest: string;
  readonly viewport: ViewportSpec;
  readonly locale: string;
  readonly timezone: string;
  readonly color_scheme: string;
  readonly text_scale_percent: number;
  readonly reduced_motion: boolean;
  readonly tags: readonly string[];
}

/** Explicit synthetic fixture bound into the catalog. */
export interface ScenarioFixture {
  readonly interface: typeof SCENARIO_FIXTURE_INTERFACE;
  readonly schema_version: typeof SCENARIO_FIXTURE_SCHEMA;
  readonly fixture_id: string;
  readonly description: string;
  readonly seed: string;
  readonly frozen_time: string;
  readonly timezone: string;
  readonly locale: string;
  readonly network_outcome: NetworkOutcome;
  readonly animation: 'allowed' | 'reduced' | 'disabled';
  readonly random_seed: number;
  readonly service_descriptors: Readonly<Record<string, string>>;
  readonly application_data: Readonly<Record<string, unknown>>;
  readonly uses_production_services: false;
  readonly uses_production_credentials: false;
  readonly fixture_digest: string;
}

/**
 * Catalog scenario entry: wire scenario plus explicit fixture binding and
 * expected terminal states for evaluation.
 */
export interface CatalogScenarioEntry {
  readonly kind: ScenarioKind;
  readonly scenario: UiEvaluationScenario;
  readonly fixture_id: string;
  readonly expected_terminal_states: readonly string[];
}

export interface ScenarioCompletenessRow {
  readonly kind: ScenarioKind;
  readonly scenario_id: string;
  readonly fixture_id: string;
  readonly present: true;
  readonly expected_terminal_states: readonly string[];
}

/** DeterministicScenarioCatalog@1. */
export interface DeterministicScenarioCatalog {
  readonly interface: typeof DETERMINISTIC_SCENARIO_CATALOG_INTERFACE;
  readonly schema_version: typeof DETERMINISTIC_SCENARIO_CATALOG_SCHEMA;
  readonly catalog_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly seed: string;
  readonly frozen_time: string;
  readonly timezone: string;
  readonly locale: string;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
  readonly extractor_version: typeof SCENARIO_CATALOG_EXTRACTOR_VERSION;
  readonly fixtures: readonly ScenarioFixture[];
  readonly scenarios: readonly CatalogScenarioEntry[];
  readonly completeness: readonly ScenarioCompletenessRow[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ScenarioCatalogError extends Error {
  readonly name = 'ScenarioCatalogError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------

/**
 * Canonical JSON (gui-optimizer-canonical-json/v1): sorted object keys,
 * no whitespace, reject non-finite numbers, omit undefined.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ScenarioCatalogError(
        'canonical JSON rejects non-finite numbers',
      );
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
  throw new ScenarioCatalogError(
    `canonical JSON cannot encode ${typeof value}`,
  );
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  const text = canonicalJson(value);
  return new TextEncoder().encode(text);
}

export function digestOf(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

// ---------------------------------------------------------------------------
// Viewport presets (plan matrix)
// ---------------------------------------------------------------------------

export const VIEWPORT_MOBILE: ViewportSpec = Object.freeze({
  interface: VIEWPORT_SPEC_INTERFACE,
  schema_version: VIEWPORT_SPEC_SCHEMA,
  width: 390,
  height: 844,
  device_scale_factor: 1,
});

export const VIEWPORT_DESKTOP: ViewportSpec = Object.freeze({
  interface: VIEWPORT_SPEC_INTERFACE,
  schema_version: VIEWPORT_SPEC_SCHEMA,
  width: 1280,
  height: 800,
  device_scale_factor: 1,
});

export const VIEWPORT_WIDE: ViewportSpec = Object.freeze({
  interface: VIEWPORT_SPEC_INTERFACE,
  schema_version: VIEWPORT_SPEC_SCHEMA,
  width: 1600,
  height: 1000,
  device_scale_factor: 1,
});

// ---------------------------------------------------------------------------
// Fixture construction
// ---------------------------------------------------------------------------

const BASE_SERVICE_DESCRIPTORS = Object.freeze({
  supervisor_state: 'synthetic://agent-supervisor/state',
  task_queue: 'synthetic://agent-supervisor/queue',
  goal_index: 'synthetic://agent-supervisor/goals',
  receipt_store: 'synthetic://agent-supervisor/receipts',
  policy_assist: 'synthetic://agent-supervisor/policy',
});

type FixtureRecipe = {
  readonly fixture_id: string;
  readonly description: string;
  readonly network_outcome: NetworkOutcome;
  readonly animation: 'allowed' | 'reduced' | 'disabled';
  readonly application_data: Readonly<Record<string, unknown>>;
  readonly locale?: string;
  readonly service_overrides?: Readonly<Record<string, string>>;
};

function freezeRecord<T extends Record<string, unknown>>(
  value: T,
): Readonly<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      out[key] = freezeRecord(entry as Record<string, unknown>);
    } else if (Array.isArray(entry)) {
      out[key] = Object.freeze(
        entry.map(item =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? freezeRecord(item as Record<string, unknown>)
            : item,
        ),
      );
    } else {
      out[key] = entry;
    }
  }
  return Object.freeze(out) as Readonly<T>;
}

function buildFixture(recipe: FixtureRecipe): ScenarioFixture {
  const service_descriptors = freezeRecord({
    ...BASE_SERVICE_DESCRIPTORS,
    ...(recipe.service_overrides ?? {}),
  });
  const application_data = freezeRecord({ ...recipe.application_data });
  const body = {
    interface: SCENARIO_FIXTURE_INTERFACE,
    schema_version: SCENARIO_FIXTURE_SCHEMA,
    fixture_id: recipe.fixture_id,
    description: recipe.description,
    seed: AGENT_SUPERVISOR_CATALOG_SEED,
    frozen_time: AGENT_SUPERVISOR_FROZEN_TIME,
    timezone: AGENT_SUPERVISOR_TIMEZONE,
    locale: recipe.locale ?? AGENT_SUPERVISOR_DEFAULT_LOCALE,
    network_outcome: recipe.network_outcome,
    animation: recipe.animation,
    random_seed: 0,
    service_descriptors,
    application_data,
    uses_production_services: false as const,
    uses_production_credentials: false as const,
  };
  const fixture_digest = digestOf(body);
  return Object.freeze({
    ...body,
    fixture_digest,
  });
}

function sampleGoals(status: string): readonly Record<string, unknown>[] {
  return Object.freeze([
    Object.freeze({
      goal_id: 'goal:synthetic-A',
      title: 'Synthetic goal A',
      status,
    }),
    Object.freeze({
      goal_id: 'goal:synthetic-B',
      title: 'Synthetic goal B',
      status,
    }),
  ]);
}

function sampleQueue(count: number): readonly Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i += 1) {
    items.push(
      Object.freeze({
        task_id: `task:synthetic-${i + 1}`,
        status: i === 0 ? 'running' : 'queued',
        title: `Synthetic task ${i + 1}`,
      }),
    );
  }
  return Object.freeze(items);
}

const FIXTURE_RECIPES: readonly FixtureRecipe[] = Object.freeze([
  {
    fixture_id: 'fixture:agent-supervisor:initial-load',
    description: 'Initial load with populated synthetic supervisor state.',
    network_outcome: 'success',
    animation: 'allowed',
    application_data: {
      phase: 'initial',
      goals: sampleGoals('running'),
      queue: sampleQueue(2),
      health: Object.freeze({ status: 'available' }),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:loading',
    description: 'In-flight loading snapshot with pending network.',
    network_outcome: 'loading',
    animation: 'allowed',
    application_data: {
      phase: 'loading',
      goals: Object.freeze([]),
      queue: Object.freeze([]),
      health: Object.freeze({ status: 'loading' }),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:success',
    description: 'Normal success with completed synthetic goals.',
    network_outcome: 'success',
    animation: 'allowed',
    application_data: {
      phase: 'success',
      goals: sampleGoals('completed'),
      queue: Object.freeze([]),
      health: Object.freeze({ status: 'available' }),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:empty',
    description: 'Empty data set with no goals or queue items.',
    network_outcome: 'empty',
    animation: 'allowed',
    application_data: {
      phase: 'empty',
      goals: Object.freeze([]),
      queue: Object.freeze([]),
      health: Object.freeze({ status: 'available' }),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:recoverable-failure',
    description: 'Recoverable transport error with retry affordance.',
    network_outcome: 'recoverable_error',
    animation: 'allowed',
    application_data: {
      phase: 'recoverable_failure',
      error: Object.freeze({
        code: 'transport_timeout',
        recoverable: true,
        message: 'Synthetic recoverable timeout',
      }),
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:unrecoverable-failure',
    description: 'Unrecoverable failure requiring operator intervention.',
    network_outcome: 'unrecoverable_error',
    animation: 'allowed',
    application_data: {
      phase: 'unrecoverable_failure',
      error: Object.freeze({
        code: 'schema_mismatch',
        recoverable: false,
        message: 'Synthetic unrecoverable schema mismatch',
      }),
      goals: Object.freeze([]),
      queue: Object.freeze([]),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:invalid-submission',
    description: 'Invalid steering/dispatch input rejected by validation.',
    network_outcome: 'validation_failure',
    animation: 'allowed',
    application_data: {
      phase: 'invalid_submission',
      steering: Object.freeze({
        prompt: '',
        valid: false,
        errors: Object.freeze(['prompt_required']),
      }),
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:valid-submission',
    description: 'Valid confirmed submission of synthetic steering request.',
    network_outcome: 'confirmation_granted',
    animation: 'allowed',
    application_data: {
      phase: 'valid_submission',
      steering: Object.freeze({
        prompt: 'Synthetic governed prompt',
        valid: true,
        confirmed: true,
      }),
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:keyboard-only',
    description: 'Keyboard-only navigation over synthetic console controls.',
    network_outcome: 'success',
    animation: 'reduced',
    application_data: {
      phase: 'keyboard_only',
      focus_order: Object.freeze([
        'control:goals-tree',
        'control:queue',
        'control:prompt-input',
        'control:submit',
      ]),
      goals: sampleGoals('running'),
      queue: sampleQueue(2),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:viewport-matrix',
    description: 'Shared synthetic state for viewport and scale scenarios.',
    network_outcome: 'success',
    animation: 'allowed',
    application_data: {
      phase: 'viewport_matrix',
      goals: sampleGoals('running'),
      queue: sampleQueue(2),
      health: Object.freeze({ status: 'available' }),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:reduced-motion',
    description: 'Reduced-motion preference with animations disabled.',
    network_outcome: 'success',
    animation: 'disabled',
    application_data: {
      phase: 'reduced_motion',
      prefers_reduced_motion: true,
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:dark-mode',
    description: 'Dark color scheme when the screen advertises support.',
    network_outcome: 'success',
    animation: 'allowed',
    application_data: {
      phase: 'dark_mode',
      color_scheme_support: Object.freeze(['light', 'dark']),
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:service-unavailable',
    description: 'All synthetic backends report unavailable.',
    network_outcome: 'service_unavailable',
    animation: 'allowed',
    service_overrides: Object.freeze({
      supervisor_state: 'synthetic://unavailable',
      task_queue: 'synthetic://unavailable',
      goal_index: 'synthetic://unavailable',
      receipt_store: 'synthetic://unavailable',
      policy_assist: 'synthetic://unavailable',
    }),
    application_data: {
      phase: 'service_unavailable',
      health: Object.freeze({ status: 'server_unavailable' }),
      goals: Object.freeze([]),
      queue: Object.freeze([]),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:confirmation-grant',
    description: 'Confirmation dialog granted for governed write.',
    network_outcome: 'confirmation_granted',
    animation: 'allowed',
    application_data: {
      phase: 'confirmation_grant',
      confirmation: Object.freeze({
        required: true,
        decision: 'granted',
        action_id: 'action:prompt-steering',
      }),
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
  {
    fixture_id: 'fixture:agent-supervisor:confirmation-deny',
    description: 'Confirmation dialog denied; no governed write applied.',
    network_outcome: 'confirmation_denied',
    animation: 'allowed',
    application_data: {
      phase: 'confirmation_deny',
      confirmation: Object.freeze({
        required: true,
        decision: 'denied',
        action_id: 'action:prompt-steering',
      }),
      goals: sampleGoals('running'),
      queue: sampleQueue(1),
    },
  },
]);

// ---------------------------------------------------------------------------
// Scenario recipes
// ---------------------------------------------------------------------------

type ScenarioRecipe = {
  readonly kind: ScenarioKind;
  readonly name: string;
  readonly fixture_id: string;
  readonly viewport: ViewportSpec;
  readonly locale: string;
  readonly color_scheme: ColorScheme;
  readonly text_scale_percent: number;
  readonly reduced_motion: boolean;
  readonly tags: readonly string[];
};

const SCENARIO_RECIPES: readonly ScenarioRecipe[] = Object.freeze([
  {
    kind: 'initial_load',
    name: 'Initial load',
    fixture_id: 'fixture:agent-supervisor:initial-load',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['initial', 'load', 'baseline']),
  },
  {
    kind: 'loading',
    name: 'Loading state',
    fixture_id: 'fixture:agent-supervisor:loading',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['loading', 'async']),
  },
  {
    kind: 'success',
    name: 'Normal success',
    fixture_id: 'fixture:agent-supervisor:success',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['success', 'baseline']),
  },
  {
    kind: 'empty',
    name: 'Empty data',
    fixture_id: 'fixture:agent-supervisor:empty',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['empty', 'data']),
  },
  {
    kind: 'recoverable_failure',
    name: 'Recoverable error',
    fixture_id: 'fixture:agent-supervisor:recoverable-failure',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['error', 'recoverable', 'failure']),
  },
  {
    kind: 'unrecoverable_failure',
    name: 'Unrecoverable error',
    fixture_id: 'fixture:agent-supervisor:unrecoverable-failure',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['error', 'unrecoverable', 'failure']),
  },
  {
    kind: 'invalid_submission',
    name: 'Invalid steering or dispatch input',
    fixture_id: 'fixture:agent-supervisor:invalid-submission',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['submission', 'validation', 'invalid']),
  },
  {
    kind: 'valid_submission',
    name: 'Valid confirmed submission',
    fixture_id: 'fixture:agent-supervisor:valid-submission',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['submission', 'validation', 'valid', 'confirmation']),
  },
  {
    kind: 'keyboard_only',
    name: 'Keyboard-only navigation',
    fixture_id: 'fixture:agent-supervisor:keyboard-only',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: true,
    tags: Object.freeze(['keyboard', 'a11y']),
  },
  {
    kind: 'viewport_mobile',
    name: 'Narrow mobile viewport 390x844',
    fixture_id: 'fixture:agent-supervisor:viewport-matrix',
    viewport: VIEWPORT_MOBILE,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['viewport', 'mobile', 'responsive']),
  },
  {
    kind: 'viewport_desktop',
    name: 'Standard desktop viewport 1280x800',
    fixture_id: 'fixture:agent-supervisor:viewport-matrix',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['viewport', 'desktop', 'responsive']),
  },
  {
    kind: 'viewport_wide',
    name: 'Wide desktop viewport 1600x1000',
    fixture_id: 'fixture:agent-supervisor:viewport-matrix',
    viewport: VIEWPORT_WIDE,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['viewport', 'wide', 'responsive']),
  },
  {
    kind: 'text_scale_200',
    name: '200 percent text scaling',
    fixture_id: 'fixture:agent-supervisor:viewport-matrix',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 200,
    reduced_motion: false,
    tags: Object.freeze(['text-scale', 'zoom', 'a11y']),
  },
  {
    kind: 'reduced_motion',
    name: 'Reduced-motion preference',
    fixture_id: 'fixture:agent-supervisor:reduced-motion',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: true,
    tags: Object.freeze(['reduced-motion', 'a11y', 'animation']),
  },
  {
    kind: 'dark_mode',
    name: 'Dark mode when screen advertises support',
    fixture_id: 'fixture:agent-supervisor:dark-mode',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'dark',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['dark-mode', 'color-scheme']),
  },
  {
    kind: 'service_unavailable',
    name: 'Service unavailable',
    fixture_id: 'fixture:agent-supervisor:service-unavailable',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['service', 'unavailable', 'offline']),
  },
  {
    kind: 'confirmation_grant',
    name: 'Confirmation granted',
    fixture_id: 'fixture:agent-supervisor:confirmation-grant',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['confirmation', 'grant', 'governed-write']),
  },
  {
    kind: 'confirmation_deny',
    name: 'Confirmation denied',
    fixture_id: 'fixture:agent-supervisor:confirmation-deny',
    viewport: VIEWPORT_DESKTOP,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    color_scheme: 'light',
    text_scale_percent: 100,
    reduced_motion: false,
    tags: Object.freeze(['confirmation', 'deny', 'governed-write']),
  },
]);

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeViewport(spec: ViewportSpec): ViewportSpec {
  return Object.freeze({
    interface: VIEWPORT_SPEC_INTERFACE,
    schema_version: VIEWPORT_SPEC_SCHEMA,
    width: spec.width,
    height: spec.height,
    device_scale_factor: spec.device_scale_factor,
  });
}

function makeUiEvaluationScenario(
  recipe: ScenarioRecipe,
  fixture_digest: string,
): UiEvaluationScenario {
  const scenario_id = STABLE_SCENARIO_IDS[recipe.kind];
  return Object.freeze({
    interface: UI_EVALUATION_SCENARIO_INTERFACE,
    schema_version: UI_EVALUATION_SCENARIO_SCHEMA,
    scenario_id,
    name: recipe.name,
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    fixture_digest,
    viewport: makeViewport(recipe.viewport),
    locale: recipe.locale,
    timezone: AGENT_SUPERVISOR_TIMEZONE,
    color_scheme: recipe.color_scheme,
    text_scale_percent: recipe.text_scale_percent,
    reduced_motion: recipe.reduced_motion,
    tags: Object.freeze([...recipe.tags]),
  });
}

/**
 * Build the sealed Agent Supervisor deterministic scenario catalog.
 * Pure: no I/O, no clocks, no randomness. Repeated calls are byte-identical.
 */
export function buildAgentSupervisorScenarioCatalog(): DeterministicScenarioCatalog {
  const fixtures = Object.freeze(FIXTURE_RECIPES.map(buildFixture));
  const fixturesById = new Map(
    fixtures.map(fixture => [fixture.fixture_id, fixture]),
  );

  const scenarios: CatalogScenarioEntry[] = [];
  for (const recipe of SCENARIO_RECIPES) {
    const fixture = fixturesById.get(recipe.fixture_id);
    if (!fixture) {
      throw new ScenarioCatalogError(
        `missing fixture ${recipe.fixture_id} for scenario kind ${recipe.kind}`,
      );
    }
    const expected_terminal_states = Object.freeze([
      ...EXPECTED_TERMINAL_STATES[recipe.kind],
    ]);
    scenarios.push(
      Object.freeze({
        kind: recipe.kind,
        scenario: makeUiEvaluationScenario(recipe, fixture.fixture_digest),
        fixture_id: fixture.fixture_id,
        expected_terminal_states,
      }),
    );
  }

  const completeness = Object.freeze(
    scenarios.map(entry =>
      Object.freeze({
        kind: entry.kind,
        scenario_id: entry.scenario.scenario_id,
        fixture_id: entry.fixture_id,
        present: true as const,
        expected_terminal_states: entry.expected_terminal_states,
      }),
    ),
  );

  // Validate completeness against the sealed kind list.
  if (scenarios.length !== REQUIRED_SCENARIO_KINDS.length) {
    throw new ScenarioCatalogError(
      `catalog must declare exactly ${REQUIRED_SCENARIO_KINDS.length} scenarios`,
    );
  }
  for (let i = 0; i < REQUIRED_SCENARIO_KINDS.length; i += 1) {
    if (scenarios[i].kind !== REQUIRED_SCENARIO_KINDS[i]) {
      throw new ScenarioCatalogError(
        `scenario order mismatch at index ${i}: expected ${REQUIRED_SCENARIO_KINDS[i]}, got ${scenarios[i].kind}`,
      );
    }
  }
  const ids = scenarios.map(s => s.scenario.scenario_id);
  if (new Set(ids).size !== ids.length) {
    throw new ScenarioCatalogError('scenario IDs must be unique');
  }

  return Object.freeze({
    interface: DETERMINISTIC_SCENARIO_CATALOG_INTERFACE,
    schema_version: DETERMINISTIC_SCENARIO_CATALOG_SCHEMA,
    catalog_id: AGENT_SUPERVISOR_CATALOG_ID,
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    seed: AGENT_SUPERVISOR_CATALOG_SEED,
    frozen_time: AGENT_SUPERVISOR_FROZEN_TIME,
    timezone: AGENT_SUPERVISOR_TIMEZONE,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    extractor_version: SCENARIO_CATALOG_EXTRACTOR_VERSION,
    fixtures,
    scenarios: Object.freeze(scenarios),
    completeness,
  });
}

/** Serialize a catalog to canonical JSON bytes (utf-8). */
export function serializeScenarioCatalog(
  catalog: DeterministicScenarioCatalog,
): string {
  return canonicalJson(catalog);
}

/** Content digest of a fully built catalog. */
export function catalogDigest(catalog: DeterministicScenarioCatalog): string {
  return digestOf(catalog);
}

/** Extract pure UiEvaluationScenario@1 wire records in catalog order. */
export function listUiEvaluationScenarios(
  catalog: DeterministicScenarioCatalog = buildAgentSupervisorScenarioCatalog(),
): readonly UiEvaluationScenario[] {
  return Object.freeze(catalog.scenarios.map(entry => entry.scenario));
}

/** Look up a catalog scenario entry by stable scenario_id. */
export function getCatalogScenarioById(
  scenarioId: string,
  catalog: DeterministicScenarioCatalog = buildAgentSupervisorScenarioCatalog(),
): CatalogScenarioEntry {
  const found = catalog.scenarios.find(
    entry => entry.scenario.scenario_id === scenarioId,
  );
  if (!found) {
    throw new ScenarioCatalogError(`unknown scenario_id: ${scenarioId}`);
  }
  return found;
}

/** Look up an explicit fixture by fixture_id. */
export function getFixtureById(
  fixtureId: string,
  catalog: DeterministicScenarioCatalog = buildAgentSupervisorScenarioCatalog(),
): ScenarioFixture {
  const found = catalog.fixtures.find(
    fixture => fixture.fixture_id === fixtureId,
  );
  if (!found) {
    throw new ScenarioCatalogError(`unknown fixture_id: ${fixtureId}`);
  }
  return found;
}

/**
 * Build a plain JSON-ready object for fixture emission / disk dump.
 * Equivalent to JSON.parse(serializeScenarioCatalog(catalog)).
 */
export function scenarioCatalogToJson(
  catalog: DeterministicScenarioCatalog = buildAgentSupervisorScenarioCatalog(),
): Record<string, unknown> {
  return JSON.parse(serializeScenarioCatalog(catalog)) as Record<
    string,
    unknown
  >;
}

// ---------------------------------------------------------------------------
// Closed decode / validate
// ---------------------------------------------------------------------------

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ScenarioCatalogError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new ScenarioCatalogError(`${field} is not a valid identifier`);
  }
  return text;
}

function requireDigest(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!DIGEST_RE.test(text)) {
    throw new ScenarioCatalogError(`${field} must be a sha256: digest`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ScenarioCatalogError(`${field} must be a boolean`);
  }
  return value;
}

function requireIntInRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new ScenarioCatalogError(
      `${field} must be an integer in [${minimum}, ${maximum}]`,
    );
  }
  return value;
}

function requireFinitePositive(
  value: unknown,
  field: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ScenarioCatalogError(`${field} must be a finite number > 0`);
  }
  return value;
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
    throw new ScenarioCatalogError(
      `unknown ${label} field(s): ${unknown.join(', ')}`,
    );
  }
}

const VIEWPORT_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'width',
  'height',
  'device_scale_factor',
] as const);

const SCENARIO_WIRE_FIELDS = Object.freeze([
  'interface',
  'schema_version',
  'scenario_id',
  'name',
  'application_id',
  'screen_id',
  'fixture_digest',
  'viewport',
  'locale',
  'timezone',
  'color_scheme',
  'text_scale_percent',
  'reduced_motion',
  'tags',
] as const);

export function decodeViewportSpec(raw: unknown): ViewportSpec {
  if (!isPlainObject(raw)) {
    throw new ScenarioCatalogError('ViewportSpec must be an object');
  }
  rejectUnknownKeys(raw, VIEWPORT_FIELDS, 'ViewportSpec');
  if (raw.interface !== VIEWPORT_SPEC_INTERFACE) {
    throw new ScenarioCatalogError(
      `unsupported ViewportSpec interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== VIEWPORT_SPEC_SCHEMA) {
    throw new ScenarioCatalogError(
      `unsupported ViewportSpec schema_version: ${String(raw.schema_version)}`,
    );
  }
  return Object.freeze({
    interface: VIEWPORT_SPEC_INTERFACE,
    schema_version: VIEWPORT_SPEC_SCHEMA,
    width: requireIntInRange(raw.width, 'width', 1, 100_000),
    height: requireIntInRange(raw.height, 'height', 1, 100_000),
    device_scale_factor: requireFinitePositive(
      raw.device_scale_factor,
      'device_scale_factor',
    ),
  });
}

export function decodeUiEvaluationScenario(raw: unknown): UiEvaluationScenario {
  if (!isPlainObject(raw)) {
    throw new ScenarioCatalogError('UiEvaluationScenario must be an object');
  }
  rejectUnknownKeys(raw, SCENARIO_WIRE_FIELDS, 'UiEvaluationScenario');
  if (raw.interface !== UI_EVALUATION_SCENARIO_INTERFACE) {
    throw new ScenarioCatalogError(
      `unsupported UiEvaluationScenario interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== UI_EVALUATION_SCENARIO_SCHEMA) {
    throw new ScenarioCatalogError(
      `unsupported UiEvaluationScenario schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (!Array.isArray(raw.tags)) {
    throw new ScenarioCatalogError('tags must be an array');
  }
  const tags = Object.freeze(
    raw.tags.map((tag, index) => requireString(tag, `tags[${index}]`)),
  );
  // uniqueness of tags
  if (new Set(tags).size !== tags.length) {
    throw new ScenarioCatalogError('tags must be unique');
  }
  return Object.freeze({
    interface: UI_EVALUATION_SCENARIO_INTERFACE,
    schema_version: UI_EVALUATION_SCENARIO_SCHEMA,
    scenario_id: requireIdentifier(raw.scenario_id, 'scenario_id'),
    name: requireString(raw.name, 'name'),
    application_id: requireIdentifier(raw.application_id, 'application_id'),
    screen_id: requireIdentifier(raw.screen_id, 'screen_id'),
    fixture_digest: requireDigest(raw.fixture_digest, 'fixture_digest'),
    viewport: decodeViewportSpec(raw.viewport),
    locale: requireString(raw.locale, 'locale'),
    timezone: requireString(raw.timezone, 'timezone'),
    color_scheme: requireString(raw.color_scheme, 'color_scheme'),
    text_scale_percent: requireIntInRange(
      raw.text_scale_percent,
      'text_scale_percent',
      25,
      500,
    ),
    reduced_motion: requireBoolean(raw.reduced_motion, 'reduced_motion'),
    tags,
  });
}

/**
 * Compact recipe document (fixture-file form). Digests are not stored; the
 * sealed builder materializes them deterministically at construction time.
 */
export interface ScenarioCatalogRecipeDocument {
  readonly interface: typeof DETERMINISTIC_SCENARIO_CATALOG_INTERFACE;
  readonly schema_version: typeof DETERMINISTIC_SCENARIO_CATALOG_SCHEMA;
  readonly catalog_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly seed: string;
  readonly frozen_time: string;
  readonly timezone: string;
  readonly locale: string;
  readonly canonical_json_profile: typeof CANONICAL_JSON_PROFILE;
  readonly extractor_version: typeof SCENARIO_CATALOG_EXTRACTOR_VERSION;
  readonly required_scenario_kinds: readonly ScenarioKind[];
  readonly stable_scenario_ids: Readonly<Record<ScenarioKind, string>>;
  readonly expected_terminal_states: Readonly<
    Record<ScenarioKind, readonly string[]>
  >;
  readonly viewports: Readonly<{
    readonly mobile: ViewportSpec;
    readonly desktop: ViewportSpec;
    readonly wide: ViewportSpec;
  }>;
  readonly fixtures: readonly {
    readonly fixture_id: string;
    readonly description: string;
    readonly network_outcome: NetworkOutcome;
    readonly animation: 'allowed' | 'reduced' | 'disabled';
    readonly locale: string;
    readonly application_data: Readonly<Record<string, unknown>>;
    readonly service_overrides?: Readonly<Record<string, string>>;
  }[];
  readonly scenarios: readonly {
    readonly kind: ScenarioKind;
    readonly scenario_id: string;
    readonly name: string;
    readonly fixture_id: string;
    readonly viewport: 'mobile' | 'desktop' | 'wide';
    readonly locale: string;
    readonly color_scheme: ColorScheme;
    readonly text_scale_percent: number;
    readonly reduced_motion: boolean;
    readonly tags: readonly string[];
    readonly expected_terminal_states: readonly string[];
  }[];
}

function viewportKeyFor(spec: ViewportSpec): 'mobile' | 'desktop' | 'wide' {
  if (
    spec.width === VIEWPORT_MOBILE.width &&
    spec.height === VIEWPORT_MOBILE.height
  ) {
    return 'mobile';
  }
  if (
    spec.width === VIEWPORT_WIDE.width &&
    spec.height === VIEWPORT_WIDE.height
  ) {
    return 'wide';
  }
  return 'desktop';
}

/**
 * Emit the compact sealed recipe document mirrored by
 * test/fixtures/gui-optimizer/scenarios/agent-supervisor-scenarios.json.
 */
export function buildAgentSupervisorScenarioRecipeDocument(): ScenarioCatalogRecipeDocument {
  return Object.freeze({
    interface: DETERMINISTIC_SCENARIO_CATALOG_INTERFACE,
    schema_version: DETERMINISTIC_SCENARIO_CATALOG_SCHEMA,
    catalog_id: AGENT_SUPERVISOR_CATALOG_ID,
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    seed: AGENT_SUPERVISOR_CATALOG_SEED,
    frozen_time: AGENT_SUPERVISOR_FROZEN_TIME,
    timezone: AGENT_SUPERVISOR_TIMEZONE,
    locale: AGENT_SUPERVISOR_DEFAULT_LOCALE,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    extractor_version: SCENARIO_CATALOG_EXTRACTOR_VERSION,
    required_scenario_kinds: REQUIRED_SCENARIO_KINDS,
    stable_scenario_ids: STABLE_SCENARIO_IDS,
    expected_terminal_states: EXPECTED_TERMINAL_STATES,
    viewports: Object.freeze({
      mobile: VIEWPORT_MOBILE,
      desktop: VIEWPORT_DESKTOP,
      wide: VIEWPORT_WIDE,
    }),
    fixtures: Object.freeze(
      FIXTURE_RECIPES.map(recipe =>
        Object.freeze({
          fixture_id: recipe.fixture_id,
          description: recipe.description,
          network_outcome: recipe.network_outcome,
          animation: recipe.animation,
          locale: recipe.locale ?? AGENT_SUPERVISOR_DEFAULT_LOCALE,
          application_data: freezeRecord({ ...recipe.application_data }),
          ...(recipe.service_overrides
            ? {
                service_overrides: freezeRecord({
                  ...recipe.service_overrides,
                }),
              }
            : {}),
        }),
      ),
    ),
    scenarios: Object.freeze(
      SCENARIO_RECIPES.map(recipe =>
        Object.freeze({
          kind: recipe.kind,
          scenario_id: STABLE_SCENARIO_IDS[recipe.kind],
          name: recipe.name,
          fixture_id: recipe.fixture_id,
          viewport: viewportKeyFor(recipe.viewport),
          locale: recipe.locale,
          color_scheme: recipe.color_scheme,
          text_scale_percent: recipe.text_scale_percent,
          reduced_motion: recipe.reduced_motion,
          tags: Object.freeze([...recipe.tags]),
          expected_terminal_states: Object.freeze([
            ...EXPECTED_TERMINAL_STATES[recipe.kind],
          ]),
        }),
      ),
    ),
  });
}

/**
 * Materialize a full catalog from a compact recipe document. Used to prove the
 * on-disk fixture expands to the same sealed catalog as the in-code builder.
 *
 * Comparison is via canonical JSON of the recipe document so key order and
 * non-semantic formatting in the on-disk fixture cannot drift the sealed
 * catalog surface.
 */
export function buildScenarioCatalogFromRecipeDocument(
  raw: unknown,
): DeterministicScenarioCatalog {
  if (!isPlainObject(raw)) {
    throw new ScenarioCatalogError('recipe document must be an object');
  }
  if (raw.interface !== DETERMINISTIC_SCENARIO_CATALOG_INTERFACE) {
    throw new ScenarioCatalogError(
      `unsupported catalog interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== DETERMINISTIC_SCENARIO_CATALOG_SCHEMA) {
    throw new ScenarioCatalogError(
      `unsupported catalog schema_version: ${String(raw.schema_version)}`,
    );
  }
  // Normalize through JSON round-trip so frozen prototypes / key order cannot
  // create false negatives, then require byte identity with the sealed recipe.
  const normalized = JSON.parse(JSON.stringify(raw)) as unknown;
  const sealedRecipe = buildAgentSupervisorScenarioRecipeDocument();
  const sealedNormalized = JSON.parse(JSON.stringify(sealedRecipe)) as unknown;
  if (canonicalJson(normalized) !== canonicalJson(sealedNormalized)) {
    throw new ScenarioCatalogError(
      'recipe document is not byte-identical to the sealed Agent Supervisor recipe',
    );
  }
  return buildAgentSupervisorScenarioCatalog();
}

/**
 * Validate a fully materialized catalog for structural integrity and sealed
 * completeness. Returns the frozen sealed catalog when the payload matches.
 */
export function validateScenarioCatalog(
  raw: unknown,
): DeterministicScenarioCatalog {
  if (!isPlainObject(raw)) {
    throw new ScenarioCatalogError(
      'DeterministicScenarioCatalog must be an object',
    );
  }
  if (raw.interface !== DETERMINISTIC_SCENARIO_CATALOG_INTERFACE) {
    throw new ScenarioCatalogError(
      `unsupported catalog interface: ${String(raw.interface)}`,
    );
  }
  if (raw.schema_version !== DETERMINISTIC_SCENARIO_CATALOG_SCHEMA) {
    throw new ScenarioCatalogError(
      `unsupported catalog schema_version: ${String(raw.schema_version)}`,
    );
  }
  if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) {
    throw new ScenarioCatalogError('fixtures must be a non-empty array');
  }
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length === 0) {
    throw new ScenarioCatalogError('scenarios must be a non-empty array');
  }

  const built = buildAgentSupervisorScenarioCatalog();
  if (canonicalJson(raw) !== serializeScenarioCatalog(built)) {
    throw new ScenarioCatalogError(
      'catalog payload is not byte-identical to the sealed Agent Supervisor catalog',
    );
  }
  return built;
}

/**
 * Create a catalog service object (factory style, mirrors other VGO modules).
 */
export function createDeterministicScenarioCatalog(): {
  readonly interface: typeof DETERMINISTIC_SCENARIO_CATALOG_INTERFACE;
  readonly schema_version: typeof DETERMINISTIC_SCENARIO_CATALOG_SCHEMA;
  buildAgentSupervisorCatalog: () => DeterministicScenarioCatalog;
  serialize: (catalog: DeterministicScenarioCatalog) => string;
  digest: (catalog: DeterministicScenarioCatalog) => string;
  listScenarios: (
    catalog?: DeterministicScenarioCatalog,
  ) => readonly UiEvaluationScenario[];
} {
  return Object.freeze({
    interface: DETERMINISTIC_SCENARIO_CATALOG_INTERFACE,
    schema_version: DETERMINISTIC_SCENARIO_CATALOG_SCHEMA,
    buildAgentSupervisorCatalog: buildAgentSupervisorScenarioCatalog,
    serialize: serializeScenarioCatalog,
    digest: catalogDigest,
    listScenarios: listUiEvaluationScenarios,
  });
}

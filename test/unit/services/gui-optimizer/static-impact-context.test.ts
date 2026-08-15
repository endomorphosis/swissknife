/**
 * VGO-070 — static-analysis, invalidation, and context fixtures.
 *
 * Acceptance:
 * - opaque forces raw source
 * - stale capsules cannot be consumed
 * - unrelated style avoids global screenshots
 * - token/action/state changes invalidate only their declared dependent
 *   evidence plus uncertainty fallback
 */

// @vitest-environment node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildGuiContextPack,
  buildGuiContextPackWithTrace,
  collectContextPackInclusionReasons,
  contextPackDigest,
  estimateContextTokens,
  serializeUiContextPack,
  uiContextTokenAccountingFromPack,
  type GuiContextPackRequest,
  type GuiContextRepositoryState,
  type GuiContextSourceInput,
  type UiContextPack,
} from '../../../../src/services/gui-optimizer/context-pack.js';
import {
  buildStableIdentity,
  compileComponentVersion,
} from '../../../../src/services/gui-optimizer/identity.js';
import {
  UI_INVALIDATION_CHECK_IDS,
  UI_INVALIDATION_PLAN_INTERFACE,
  UI_INVALIDATION_PLAN_SCHEMA,
  affectedScreenshotIds,
  makeUiChangeSet,
  makeUiInvalidationPlan,
  planUiInvalidation,
  serializeUiInvalidationPlan,
  type UiInvalidationContext,
  type UiInvalidationEdge,
} from '../../../../src/services/gui-optimizer/invalidation.js';
import { makeUiActionBinding } from '../../../../src/services/gui-optimizer/policy-validator.js';
import { scanGuiSources } from '../../../../src/services/gui-optimizer/scanner.js';
import { STABLE_SCENARIO_IDS } from '../../../../src/services/gui-optimizer/scenario-catalog.js';
import {
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
} from '../../../../src/services/gui-optimizer/state-machine.js';
import {
  UI_CAPSULE_COMPILER_VERSION,
  UI_COMPONENT_VERSION_SCHEMA,
  UI_SEMANTIC_CAPSULE_INTERFACE,
  compileUiSemanticCapsuleFromScan,
  decodeUiSemanticCapsule,
  isVerifiedAllowed,
  makeUiSemanticCapsule,
  type UiSemanticCapsule,
} from '../../../../src/services/gui-optimizer/ui-capsule.js';

export const GUI_STATIC_FIXTURE_SUITE_INTERFACE =
  'GuiStaticFixtureSuite@1' as const;
export const GUI_STATIC_FIXTURE_SUITE_SCHEMA =
  'gui-static-fixture-suite/v1' as const;

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/gui-optimizer/static',
);
const UNRELATED_STYLE_REL =
  'swissknife/test/fixtures/gui-optimizer/static/unrelated-style.css';
const CHANGED_TOKEN_REL =
  'swissknife/test/fixtures/gui-optimizer/static/changed-token.css';
const OPAQUE_COMPONENT_REL =
  'swissknife/test/fixtures/gui-optimizer/static/opaque-component.ts';
const STALE_CAPSULE_REL =
  'swissknife/test/fixtures/gui-optimizer/static/stale-capsule.json';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const PKG = 'org.hallucinate.swissknife.gui-optimizer';
const GOAL_FORM = 'comp:goal-form';
const ROOT = 'comp:console-root';
const CHILD = 'comp:goal-input';
const SIDEBAR = 'comp:sidebar';
const SETTINGS = 'comp:settings-panel';
const OPAQUE = 'comp:opaque-widget';
const TOKEN_SURFACE = 'token:--as-surface';
const TOKEN_SETTINGS = 'token:--settings-panel-bg';
const ACTION_DISPATCH = 'action:dispatch';
const DIGEST_A =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DIGEST_B =
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const ALL_KNOWN_SCENARIOS = Object.freeze(Object.values(STABLE_SCENARIO_IDS));

const unrelatedStyle = readFileSync(
  join(FIXTURE_DIR, 'unrelated-style.css'),
  'utf8',
);
const changedToken = readFileSync(
  join(FIXTURE_DIR, 'changed-token.css'),
  'utf8',
);
const opaqueSource = readFileSync(
  join(FIXTURE_DIR, 'opaque-component.ts'),
  'utf8',
);
const staleCapsuleRaw = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'stale-capsule.json'), 'utf8'),
) as unknown;

export const GUI_STATIC_FIXTURE_SUITE = Object.freeze({
  interface: GUI_STATIC_FIXTURE_SUITE_INTERFACE,
  schema_version: GUI_STATIC_FIXTURE_SUITE_SCHEMA,
  suite_id: 'suite:vgo-070-static-impact-context',
  application_id: APP,
  screen_id: SCREEN,
  fixtures: Object.freeze({
    unrelated_style: Object.freeze({
      path: UNRELATED_STYLE_REL,
      change_kind: 'css_design_token',
      component_ids: Object.freeze([TOKEN_SETTINGS, SETTINGS]),
      expected_affected_component_ids: Object.freeze([
        TOKEN_SETTINGS,
        SETTINGS,
      ]),
      expected_unaffected_component_ids: Object.freeze([
        GOAL_FORM,
        SIDEBAR,
        ROOT,
      ]),
      expected_affected_screenshot_ids: Object.freeze([
        'screenshot:unrelated-settings',
      ]),
      expected_unaffected_screenshot_ids: Object.freeze([
        'screenshot:goal-form-ready',
        'screenshot:sidebar-ready',
        'screenshot:console-root',
      ]),
      expected_check_ids: Object.freeze([
        UI_INVALIDATION_CHECK_IDS.dependentScreenshots,
        UI_INVALIDATION_CHECK_IDS.responsive,
        UI_INVALIDATION_CHECK_IDS.contrast,
        UI_INVALIDATION_CHECK_IDS.clipping,
        UI_INVALIDATION_CHECK_IDS.overflow,
      ]),
    }),
    changed_token: Object.freeze({
      path: CHANGED_TOKEN_REL,
      change_kind: 'css_design_token',
      component_ids: Object.freeze([TOKEN_SURFACE]),
      expected_affected_component_ids: Object.freeze([TOKEN_SURFACE, GOAL_FORM]),
      expected_unaffected_component_ids: Object.freeze([SIDEBAR, SETTINGS]),
      expected_affected_screenshot_ids: Object.freeze([
        'screenshot:goal-form-ready',
      ]),
      expected_unaffected_screenshot_ids: Object.freeze([
        'screenshot:sidebar-ready',
        'screenshot:unrelated-settings',
        'screenshot:console-root',
      ]),
      expected_check_ids: Object.freeze([
        UI_INVALIDATION_CHECK_IDS.dependentScreenshots,
        UI_INVALIDATION_CHECK_IDS.responsive,
        UI_INVALIDATION_CHECK_IDS.contrast,
        UI_INVALIDATION_CHECK_IDS.clipping,
        UI_INVALIDATION_CHECK_IDS.overflow,
      ]),
      expected_scenario_ids: Object.freeze([
        STABLE_SCENARIO_IDS.viewport_mobile,
        STABLE_SCENARIO_IDS.viewport_desktop,
        STABLE_SCENARIO_IDS.text_scale_200,
      ]),
    }),
    opaque_component: Object.freeze({
      path: OPAQUE_COMPONENT_REL,
      component_id: OPAQUE,
      forces_raw_source: true,
      inclusion_reason: 'opaque_component',
    }),
    stale_capsule: Object.freeze({
      path: STALE_CAPSULE_REL,
      capsule_id: 'capsule:stale-console-root',
      component_id: ROOT,
      rejection_reason: 'stale_capsule',
      cannot_be_consumed: true,
    }),
    action_binding: Object.freeze({
      change_kind: 'action_binding',
      component_ids: Object.freeze([GOAL_FORM]),
      action_ids: Object.freeze([ACTION_DISPATCH]),
      expected_check_ids: Object.freeze([
        UI_INVALIDATION_CHECK_IDS.policy,
        UI_INVALIDATION_CHECK_IDS.confirmation,
        UI_INVALIDATION_CHECK_IDS.hostBoundary,
        UI_INVALIDATION_CHECK_IDS.interaction,
        UI_INVALIDATION_CHECK_IDS.invocationTests,
      ]),
      expected_scenario_ids: Object.freeze([
        STABLE_SCENARIO_IDS.confirmation_grant,
        STABLE_SCENARIO_IDS.confirmation_deny,
        STABLE_SCENARIO_IDS.valid_submission,
        STABLE_SCENARIO_IDS.keyboard_only,
      ]),
    }),
    state_machine: Object.freeze({
      change_kind: 'state_machine',
      component_ids: Object.freeze([GOAL_FORM]),
      state_ids: Object.freeze([
        'state:ready',
        'state:loading',
        'state:failure',
      ]),
      expected_check_ids: Object.freeze([
        UI_INVALIDATION_CHECK_IDS.reachability,
        UI_INVALIDATION_CHECK_IDS.outcome,
        UI_INVALIDATION_CHECK_IDS.formal,
        UI_INVALIDATION_CHECK_IDS.interactionScenarios,
      ]),
      expected_scenario_ids: Object.freeze([
        STABLE_SCENARIO_IDS.loading,
        STABLE_SCENARIO_IDS.success,
        STABLE_SCENARIO_IDS.recoverable_failure,
        STABLE_SCENARIO_IDS.unrecoverable_failure,
      ]),
    }),
  }),
});

function fixtureVersion(
  qualifiedName: string,
  kind: 'form' | 'screen' | 'input' | 'nav' | 'composite' = 'form',
) {
  const identity = buildStableIdentity({
    applicationId: APP,
    screenId: SCREEN,
    qualifiedName,
    componentKind: kind,
    packageNamespace: PKG,
  });
  return compileComponentVersion(
    identity,
    {
      structure: { name: qualifiedName },
      props: { names: ['value'] },
      state: { ready: true },
      handlers: { submit: true },
      accessibility: { contract: `a11y:${qualifiedName}` },
      styles: { role: 'surface' },
      actions: { dispatch: true },
      localization: { keys: ['label.goal'] },
    },
    {
      extractorVersion: UI_CAPSULE_COMPILER_VERSION,
      optimizerSchemaVersion: UI_COMPONENT_VERSION_SCHEMA,
    },
  );
}

function fixtureCapsule(
  partial: Partial<UiSemanticCapsule> &
    Pick<UiSemanticCapsule, 'capsule_id'> & {
      qualifiedName?: string;
      kind?: 'form' | 'screen' | 'input' | 'nav' | 'composite';
    },
): UiSemanticCapsule {
  const version = fixtureVersion(
    partial.qualifiedName ?? partial.capsule_id.replace(/^capsule:/, 'comp:'),
    partial.kind ?? 'form',
  );
  return makeUiSemanticCapsule({
    capsule_id: partial.capsule_id,
    stable_identity: version.stable_identity,
    version_identity: version,
    application_id: APP,
    screen_id: SCREEN,
    purpose: partial.purpose ?? 'Bounded GUI capsule',
    component_type: partial.component_type ?? 'composite',
    analysis_classification: partial.analysis_classification ?? 'exact',
    verification_status: partial.verification_status ?? 'unverified',
    child_component_ids: partial.child_component_ids ?? [],
    test_ids: partial.test_ids ?? [],
    screenshot_ids: partial.screenshot_ids ?? [],
    known_violation_ids: partial.known_violation_ids ?? [],
    unresolved_dynamic_behavior: partial.unresolved_dynamic_behavior ?? [],
    action_binding_ids: partial.action_binding_ids ?? [],
  });
}

function fixtureStateMachine() {
  return {
    interface: 'UiContextStateMachine@1' as const,
    schema_version: 'ui-context-state-machine/v1' as const,
    machine_id: 'sm:agent-supervisor',
    initial_state_id: 'state:ready',
    states: [
      makeUiStateDefinition({
        state_id: 'state:ready',
        kind: 'ready',
        screen_id: SCREEN,
        is_initial: true,
      }),
    ],
    events: [
      makeUiEventDefinition({
        event_id: 'event:submit',
        kind: 'submit',
        name: 'submit',
      }),
    ],
    transitions: [
      makeUiTransitionDefinition({
        transition_id: 'transition:ready-submit',
        from_state_id: 'state:ready',
        to_state_id: 'state:ready',
        event_id: 'event:submit',
        is_noop: true,
      }),
    ],
  };
}

function source(partial: GuiContextSourceInput): GuiContextSourceInput {
  return partial;
}

function fixtureInvalidationEdges(): UiInvalidationEdge[] {
  return [
    {
      source_component_id: ROOT,
      target_component_id: GOAL_FORM,
      relation: 'contains',
      confidence: 'exact',
    },
    {
      source_component_id: ROOT,
      target_component_id: SIDEBAR,
      relation: 'contains',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: CHILD,
      relation: 'contains',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: TOKEN_SURFACE,
      relation: 'uses_design_token',
      confidence: 'exact',
    },
    {
      source_component_id: SETTINGS,
      target_component_id: TOKEN_SETTINGS,
      relation: 'uses_design_token',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: 'screenshot:goal-form-ready',
      relation: 'screenshot_by',
      confidence: 'exact',
    },
    {
      source_component_id: SIDEBAR,
      target_component_id: 'screenshot:sidebar-ready',
      relation: 'screenshot_by',
      confidence: 'exact',
    },
    {
      source_component_id: ROOT,
      target_component_id: 'screenshot:console-root',
      relation: 'screenshot_by',
      confidence: 'exact',
    },
    {
      source_component_id: SETTINGS,
      target_component_id: 'screenshot:unrelated-settings',
      relation: 'screenshot_by',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: ACTION_DISPATCH,
      relation: 'invokes_action',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: 'test:goal-form-submit',
      relation: 'tested_by',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: 'state:ready',
      relation: 'updates_state',
      confidence: 'exact',
    },
  ];
}

function fixtureInvalidationContext(
  partial: Partial<UiInvalidationContext> = {},
): UiInvalidationContext {
  return {
    application_id: APP,
    screen_id: SCREEN,
    edges: fixtureInvalidationEdges(),
    capsules: [
      {
        component_id: GOAL_FORM,
        screenshot_ids: ['screenshot:goal-form-ready'],
        test_ids: ['test:goal-form-submit'],
        action_binding_ids: [ACTION_DISPATCH],
        localization_keys: ['label.goal'],
        child_component_ids: [CHILD],
      },
      {
        component_id: SIDEBAR,
        screenshot_ids: ['screenshot:sidebar-ready'],
        test_ids: ['test:sidebar-nav'],
        action_binding_ids: [],
        localization_keys: ['label.nav'],
        child_component_ids: [],
      },
      {
        component_id: SETTINGS,
        screenshot_ids: ['screenshot:unrelated-settings'],
        test_ids: ['test:settings-panel'],
        action_binding_ids: [],
        child_component_ids: [],
      },
      {
        component_id: ROOT,
        screenshot_ids: ['screenshot:console-root'],
        test_ids: [],
        action_binding_ids: [],
        child_component_ids: [GOAL_FORM, SIDEBAR],
      },
    ],
    screenshots: [
      {
        screenshot_id: 'screenshot:goal-form-ready',
        component_id: GOAL_FORM,
        scenario_id: STABLE_SCENARIO_IDS.initial_load,
      },
      {
        screenshot_id: 'screenshot:sidebar-ready',
        component_id: SIDEBAR,
        scenario_id: STABLE_SCENARIO_IDS.initial_load,
      },
      {
        screenshot_id: 'screenshot:console-root',
        component_id: ROOT,
        scenario_id: STABLE_SCENARIO_IDS.initial_load,
      },
      {
        screenshot_id: 'screenshot:unrelated-settings',
        component_id: SETTINGS,
        scenario_id: STABLE_SCENARIO_IDS.initial_load,
      },
    ],
    known_component_ids: [ROOT, GOAL_FORM, SIDEBAR, SETTINGS, CHILD],
    known_scenario_ids: [...ALL_KNOWN_SCENARIOS],
    known_screenshot_ids: [
      'screenshot:goal-form-ready',
      'screenshot:sidebar-ready',
      'screenshot:console-root',
      'screenshot:unrelated-settings',
    ],
    graph_confidence: 'exact',
    ...partial,
  };
}

function baseState(
  overrides: Partial<GuiContextRepositoryState> = {},
): GuiContextRepositoryState {
  return {
    revision: 'rev:vgo-070-static',
    application_id: APP,
    screen_id: SCREEN,
    sources: [
      source({
        path: 'web/js/apps/agent-supervisor.js',
        content: 'export function GoalForm() {\n  return <form />;\n}\n',
        component_id: GOAL_FORM,
        editable: true,
      }),
      source({
        path: 'web/js/apps/console-root.js',
        content: 'export function ConsoleRoot() { return <section /> }\n',
        component_id: ROOT,
      }),
      source({
        path: 'web/js/apps/goal-input.js',
        content: 'export function GoalInput() { return <input /> }\n',
        component_id: CHILD,
      }),
      source({
        path: OPAQUE_COMPONENT_REL,
        content: opaqueSource,
        component_id: OPAQUE,
      }),
    ],
    styles: [
      {
        path: CHANGED_TOKEN_REL,
        content: changedToken,
        style_kind: 'design-token',
        component_id: GOAL_FORM,
      },
      {
        path: UNRELATED_STYLE_REL,
        content: unrelatedStyle,
        style_kind: 'css',
        component_id: SETTINGS,
        application_id: 'app:other',
        screen_id: 'screen:other',
      },
    ],
    tests: [
      {
        path: 'test/goal-form.test.ts',
        content: "it('labels the goal input', () => {})\n",
        test_id: 'test:goal-form-a11y',
        component_id: GOAL_FORM,
      },
    ],
    capsules: [
      fixtureCapsule({
        capsule_id: 'capsule:console-root',
        qualifiedName: ROOT,
        kind: 'screen',
        child_component_ids: [GOAL_FORM, SIDEBAR],
      }),
      fixtureCapsule({
        capsule_id: 'capsule:goal-input',
        qualifiedName: CHILD,
        kind: 'input',
      }),
    ],
    edges: fixtureInvalidationEdges(),
    state_machine: fixtureStateMachine(),
    action_bindings: [
      makeUiActionBinding({
        action_id: ACTION_DISPATCH,
        method: 'method:dispatch-goal',
        schema_id: 'schema:dispatch-goal',
        component_id: GOAL_FORM,
      }),
    ],
    routes: [{ route_id: 'route:agent-supervisor', path: '/agent-supervisor' }],
    screenshots: [
      {
        scenario_id: STABLE_SCENARIO_IDS.keyboard_only,
        artifact_digest: DIGEST_B,
        description: 'Goal form at desktop width.',
        component_id: GOAL_FORM,
        required: true,
      },
    ],
    visual_references: [
      {
        artifact_digest: DIGEST_A,
        description: 'Desktop baseline before the bounded label repair.',
        component_id: GOAL_FORM,
        required: true,
      },
    ],
    change_set: makeUiChangeSet({
      change_set_id: 'change:goal-label',
      change_kinds: ['component_implementation', 'accessibility'],
      file_paths: ['web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
    }),
    invalidation_plan: makeUiInvalidationPlan({
      plan_id: 'plan:goal-label',
      change_set_id: 'change:goal-label',
      reasons: ['component_changed'],
      affected_component_ids: [GOAL_FORM],
      affected_scenario_ids: [STABLE_SCENARIO_IDS.keyboard_only],
      affected_check_ids: ['check:direct-tests'],
      confidence: 'exact',
    }),
    ...overrides,
  };
}

function baseRequest(
  overrides: Partial<GuiContextPackRequest> = {},
): GuiContextPackRequest {
  return {
    repository_state: baseState(overrides.repository_state),
    application_id: APP,
    screen_id: SCREEN,
    objective: 'Give the goal input one accessible name.',
    token_budget: 100000,
    baseline: {
      baseline_id: 'baseline:goal-form',
      metric_id: 'metric:goal-form',
      metrics: { interaction_steps: 3, unlabeled_controls: 1 },
      artifact_digests: [DIGEST_A, DIGEST_B],
    },
    violations: {
      formal_invariant_failures: [
        {
          invariant_id: 'invariant:input-accessible-name',
          status: 'violated',
          description: 'Goal input has no accessible name.',
          component_id: GOAL_FORM,
          path: 'web/js/apps/agent-supervisor.js',
        },
      ],
      accessibility_violations: [
        {
          violation_id: 'violation:missing-label',
          severity: 'serious',
          description: 'Goal input lacks an associated label.',
          component_id: GOAL_FORM,
          path: 'web/js/apps/agent-supervisor.js',
        },
      ],
    },
    ...overrides,
  };
}

function assertAccountingEquations(pack: UiContextPack): void {
  const total =
    pack.raw_source_tokens +
    pack.capsule_tokens +
    pack.screenshot_analysis_tokens +
    pack.other_context_tokens;
  const ordinary =
    pack.raw_source_tokens +
    pack.source_tokens_replaced_by_capsules +
    pack.screenshot_analysis_tokens +
    pack.other_context_tokens;
  expect(pack.total_estimated_prompt_tokens).toBe(total);
  expect(pack.ordinary_raw_dependency_tokens).toBe(ordinary);
  expect(pack.ordinary_raw_dependency_tokens).toBeGreaterThan(0);
  expect(pack.total_estimated_prompt_tokens).toBeLessThanOrEqual(
    pack.token_budget,
  );
  expect(pack.compression_ratio).toBe((ordinary - total) / ordinary);
}

function scanStaticFixtures() {
  return scanGuiSources(
    [
      { path: UNRELATED_STYLE_REL, content: unrelatedStyle, language: 'css' },
      { path: CHANGED_TOKEN_REL, content: changedToken, language: 'css' },
      {
        path: OPAQUE_COMPONENT_REL,
        content: opaqueSource,
        language: 'typescript',
      },
    ],
    { applicationId: 'agent-supervisor', screenId: 'agent-supervisor' },
  );
}

describe('VGO-070 GuiStaticFixtureSuite@1 identities', () => {
  it('exposes closed suite identity and fixture paths', () => {
    expect(GUI_STATIC_FIXTURE_SUITE.interface).toBe(
      GUI_STATIC_FIXTURE_SUITE_INTERFACE,
    );
    expect(GUI_STATIC_FIXTURE_SUITE.schema_version).toBe(
      GUI_STATIC_FIXTURE_SUITE_SCHEMA,
    );
    expect(GUI_STATIC_FIXTURE_SUITE.fixtures.unrelated_style.path).toBe(
      UNRELATED_STYLE_REL,
    );
    expect(GUI_STATIC_FIXTURE_SUITE.fixtures.changed_token.path).toBe(
      CHANGED_TOKEN_REL,
    );
    expect(GUI_STATIC_FIXTURE_SUITE.fixtures.opaque_component.path).toBe(
      OPAQUE_COMPONENT_REL,
    );
    expect(GUI_STATIC_FIXTURE_SUITE.fixtures.stale_capsule.path).toBe(
      STALE_CAPSULE_REL,
    );
    expect(unrelatedStyle).toContain('--settings-panel-bg');
    expect(unrelatedStyle).not.toContain('--as-surface');
    expect(changedToken).toContain('--as-surface');
    expect(changedToken).toContain('.goal-form');
    expect(opaqueSource).toContain('innerHTML');
    expect(opaqueSource).toContain('https://cdn.example/opaque-widget.js');
  });
});

describe('VGO-070 static analysis of controlled fixtures', () => {
  it('extracts design tokens from the changed-token stylesheet', () => {
    const scan = scanStaticFixtures();
    expect(scan.executed_code).toBe(false);
    const tokenNames = scan.findings
      .filter(finding => finding.kind === 'design_token')
      .map(finding => finding.name);
    expect(tokenNames).toEqual(
      expect.arrayContaining([
        '--as-surface',
        '--as-surface-contrast',
        '--as-surface-border',
      ]),
    );
    expect(scan.edges.some(edge => edge.relation === 'uses_design_token')).toBe(
      true,
    );
    expect(
      scan.findings.some(
        finding =>
          finding.kind === 'media_query' && finding.path === CHANGED_TOKEN_REL,
      ),
    ).toBe(true);
  });

  it('keeps unrelated settings tokens off the goal-form surface', () => {
    const scan = scanStaticFixtures();
    const settingsTokens = scan.findings.filter(
      finding =>
        finding.kind === 'design_token' && finding.path === UNRELATED_STYLE_REL,
    );
    expect(settingsTokens.map(finding => finding.name)).toEqual(
      expect.arrayContaining([
        '--settings-panel-bg',
        '--settings-panel-border',
        '--settings-panel-fg',
      ]),
    );
    expect(
      settingsTokens.some(finding => finding.name.startsWith('--as-')),
    ).toBe(false);
    expect(
      scan.findings.some(
        finding =>
          finding.kind === 'style' &&
          finding.path === UNRELATED_STYLE_REL &&
          finding.name.includes('.settings-panel'),
      ),
    ).toBe(true);
  });

  it('classifies the opaque third-party widget as requiring raw source', () => {
    const scan = scanStaticFixtures();
    expect(scan.analysis_classification).toBe('opaque');
    const opaque = scan.findings.filter(
      finding =>
        finding.path === OPAQUE_COMPONENT_REL && finding.confidence === 'opaque',
    );
    expect(opaque.length).toBeGreaterThan(0);
    expect(opaque.every(finding => finding.requires_raw_source)).toBe(true);
    expect(
      opaque.some(
        finding =>
          finding.name.includes('innerHTML') ||
          finding.attributes.unresolved_cause === 'dynamic_html',
      ),
    ).toBe(true);
    expect(
      scan.unresolved.some(
        item => item.includes('dynamic_html') || item.includes('opaque'),
      ),
    ).toBe(true);

    const opaqueScan = scanGuiSources(
      [
        {
          path: OPAQUE_COMPONENT_REL,
          content: opaqueSource,
          language: 'typescript',
        },
      ],
      { applicationId: 'agent-supervisor', screenId: 'agent-supervisor' },
    );
    const compiled = compileUiSemanticCapsuleFromScan(opaqueScan, {
      applicationId: APP,
      screenId: SCREEN,
      packageNamespace: PKG,
      capsuleId: 'capsule:opaque-widget',
    });
    expect(compiled.analysis_classification).toBe('opaque');
    expect(compiled.verification_status).not.toBe('verified');
    expect(
      isVerifiedAllowed({
        analysis_classification: compiled.analysis_classification,
        verification_status: compiled.verification_status,
      }),
    ).toBe(false);
  });
});

describe('VGO-070 stale capsules cannot be consumed', () => {
  const stale = decodeUiSemanticCapsule(staleCapsuleRaw);

  it('decodes the fixture as a closed stale UiSemanticCapsule@1', () => {
    expect(stale.interface).toBe(UI_SEMANTIC_CAPSULE_INTERFACE);
    expect(stale.capsule_id).toBe(
      GUI_STATIC_FIXTURE_SUITE.fixtures.stale_capsule.capsule_id,
    );
    expect(stale.verification_status).toBe('stale');
    expect(stale.stable_identity.qualified_name).toBe(ROOT);
    expect(
      isVerifiedAllowed({
        analysis_classification: stale.analysis_classification,
        verification_status: stale.verification_status,
      }),
    ).toBe(false);
  });

  it('rejects the stale capsule and includes raw console-root source', () => {
    const trace = buildGuiContextPackWithTrace(
      baseRequest({
        repository_state: baseState({
          capsules: [
            stale,
            fixtureCapsule({
              capsule_id: 'capsule:goal-input',
              qualifiedName: CHILD,
              kind: 'input',
            }),
          ],
        }),
      }),
    );
    expect(trace.rejected_capsules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capsule_id: 'capsule:stale-console-root',
          reason: 'stale_capsule',
        }),
      ]),
    );
    expect(
      [...trace.pack.parent_capsules, ...trace.pack.child_capsules].map(
        item => item.capsule_id,
      ),
    ).not.toContain('capsule:stale-console-root');
    expect(
      trace.pack.raw_sources.some(
        item => item.path === 'web/js/apps/console-root.js',
      ),
    ).toBe(true);
    expect(trace.pack.excluded_context_explanation).toMatch(/Stale capsule/);
  });

  it('fails closed when the stale capsule has no raw source', () => {
    expect(() =>
      buildGuiContextPack(
        baseRequest({
          repository_state: baseState({
            sources: [
              source({
                path: 'web/js/apps/agent-supervisor.js',
                content: 'export function GoalForm() { return null }\n',
                component_id: GOAL_FORM,
                editable: true,
              }),
            ],
            capsules: [stale],
          }),
        }),
      ),
    ).toThrow(/raw source required for stale_component/);
  });
});

describe('VGO-070 opaque forces raw source', () => {
  it('includes the opaque fixture source as raw even when a capsule exists', () => {
    const opaqueCapsule = fixtureCapsule({
      capsule_id: 'capsule:opaque-widget',
      qualifiedName: OPAQUE,
      kind: 'composite',
      analysis_classification: 'opaque',
      verification_status: 'unverified',
      unresolved_dynamic_behavior: ['dynamic_html', 'remote_script'],
    });
    const pack = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          capsules: [
            fixtureCapsule({
              capsule_id: 'capsule:console-root',
              qualifiedName: ROOT,
              kind: 'screen',
              child_component_ids: [GOAL_FORM, OPAQUE],
            }),
            opaqueCapsule,
          ],
        }),
      }),
    );
    const raw = pack.raw_sources.find(item => item.path === OPAQUE_COMPONENT_REL);
    expect(raw).toBeDefined();
    expect(raw?.editable).toBe(false);
    expect(raw?.content).toBe(opaqueSource);
    expect(collectContextPackInclusionReasons(pack)).toEqual(
      expect.arrayContaining([`raw:required:${OPAQUE_COMPONENT_REL}`]),
    );
  });
});

describe('VGO-070 bounded invalidation from fixture change kinds', () => {
  it('does not invalidate global screenshots for an unrelated style change', () => {
    const fixture = GUI_STATIC_FIXTURE_SUITE.fixtures.unrelated_style;
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:unrelated-style',
      change_kinds: ['css_design_token'],
      file_paths: [fixture.path],
      component_ids: [...fixture.component_ids],
      summary: 'Restyle the unrelated settings panel only.',
    });
    const context = fixtureInvalidationContext();
    const plan = planUiInvalidation(changeSet, { context });
    const shots = affectedScreenshotIds(changeSet, { context });

    expect(plan.interface).toBe(UI_INVALIDATION_PLAN_INTERFACE);
    expect(plan.schema_version).toBe(UI_INVALIDATION_PLAN_SCHEMA);
    expect(plan.reasons).toContain('style_changed');
    expect(plan.fallback_triggered).toBe(false);
    expect(plan.affected_component_ids).toEqual(
      expect.arrayContaining([...fixture.expected_affected_component_ids]),
    );
    for (const id of fixture.expected_unaffected_component_ids) {
      expect(plan.affected_component_ids).not.toContain(id);
    }
    expect(shots).toEqual(
      expect.arrayContaining([...fixture.expected_affected_screenshot_ids]),
    );
    for (const id of fixture.expected_unaffected_screenshot_ids) {
      expect(shots).not.toContain(id);
    }
    expect(shots.length).toBeLessThan(
      (context.known_screenshot_ids ?? []).length,
    );
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([...fixture.expected_check_ids]),
    );
  });

  it('invalidates only declared dependents of a changed design token', () => {
    const fixture = GUI_STATIC_FIXTURE_SUITE.fixtures.changed_token;
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:as-surface-token',
      change_kinds: ['css_design_token'],
      file_paths: [fixture.path],
      component_ids: [...fixture.component_ids],
      summary: 'Update --as-surface used only by the goal form.',
    });
    const context = fixtureInvalidationContext();
    const plan = planUiInvalidation(changeSet, { context });
    const shots = affectedScreenshotIds(changeSet, { context });

    expect(plan.reasons).toContain('style_changed');
    expect(plan.fallback_triggered).toBe(false);
    expect(plan.affected_component_ids).toEqual(
      expect.arrayContaining([...fixture.expected_affected_component_ids]),
    );
    for (const id of fixture.expected_unaffected_component_ids) {
      expect(plan.affected_component_ids).not.toContain(id);
    }
    expect(shots).toEqual(
      expect.arrayContaining([...fixture.expected_affected_screenshot_ids]),
    );
    for (const id of fixture.expected_unaffected_screenshot_ids) {
      expect(shots).not.toContain(id);
    }
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([...fixture.expected_check_ids]),
    );
    expect(plan.affected_scenario_ids).toEqual(
      expect.arrayContaining([...fixture.expected_scenario_ids]),
    );
  });

  it('invalidates only declared policy and interaction evidence for a binding change', () => {
    const fixture = GUI_STATIC_FIXTURE_SUITE.fixtures.action_binding;
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:dispatch-binding',
      change_kinds: ['action_binding'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [...fixture.component_ids],
      action_ids: [...fixture.action_ids],
      summary: 'Retarget dispatch action binding.',
    });
    const plan = planUiInvalidation(changeSet, {
      context: fixtureInvalidationContext(),
    });

    expect(plan.reasons).toContain('action_changed');
    expect(plan.fallback_triggered).toBe(false);
    expect(plan.affected_component_ids).toEqual(
      expect.arrayContaining([...fixture.component_ids]),
    );
    expect(plan.affected_component_ids).not.toContain(SETTINGS);
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([...fixture.expected_check_ids]),
    );
    expect(plan.affected_check_ids).not.toContain(
      UI_INVALIDATION_CHECK_IDS.broaderScreenFallback,
    );
    expect(plan.affected_scenario_ids).toEqual(
      expect.arrayContaining([...fixture.expected_scenario_ids]),
    );
  });

  it('invalidates only declared reachability and formal evidence for a state change', () => {
    const fixture = GUI_STATIC_FIXTURE_SUITE.fixtures.state_machine;
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:ready-transition',
      change_kinds: ['state_machine'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [...fixture.component_ids],
      state_ids: [...fixture.state_ids],
      summary: 'Add an explicit failure transition from loading.',
    });
    const plan = planUiInvalidation(changeSet, {
      context: fixtureInvalidationContext(),
    });

    expect(plan.reasons).toContain('state_changed');
    expect(plan.fallback_triggered).toBe(false);
    expect(plan.affected_component_ids).toEqual(
      expect.arrayContaining([...fixture.component_ids]),
    );
    expect(plan.affected_component_ids).not.toContain(SETTINGS);
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([...fixture.expected_check_ids]),
    );
    expect(plan.affected_check_ids).not.toContain(
      UI_INVALIDATION_CHECK_IDS.broaderScreenFallback,
    );
    expect(plan.affected_scenario_ids).toEqual(
      expect.arrayContaining([...fixture.expected_scenario_ids]),
    );
  });

  it('expands only documented fallback under opaque uncertainty', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:opaque-handler',
      change_kinds: ['component_implementation'],
      file_paths: [OPAQUE_COMPONENT_REL],
      component_ids: [GOAL_FORM],
      summary: 'Opaque third-party handler rewrite.',
    });
    const context = fixtureInvalidationContext({
      unresolved: ['dynamic:third-party-handler'],
      graph_confidence: 'opaque',
      edges: [
        {
          source_component_id: GOAL_FORM,
          target_component_id: 'unresolved:third-party',
          relation: 'invokes_action',
          confidence: 'opaque',
        },
        {
          source_component_id: GOAL_FORM,
          target_component_id: 'screenshot:goal-form-ready',
          relation: 'screenshot_by',
          confidence: 'exact',
        },
        {
          source_component_id: SIDEBAR,
          target_component_id: 'screenshot:sidebar-ready',
          relation: 'screenshot_by',
          confidence: 'exact',
        },
      ],
    });
    const plan = planUiInvalidation(changeSet, { context });
    const shots = affectedScreenshotIds(changeSet, { context });

    expect(plan.fallback_triggered).toBe(true);
    expect(plan.reasons).toEqual(
      expect.arrayContaining([
        'component_changed',
        'opaque_edge',
        'fallback_expansion',
      ]),
    );
    expect(plan.fallback_explanation.length).toBeGreaterThan(0);
    expect(plan.affected_check_ids).toContain(
      UI_INVALIDATION_CHECK_IDS.broaderScreenFallback,
    );
    expect(plan.confidence).toBe('opaque');
    expect(shots).toContain('screenshot:goal-form-ready');
    expect(shots).not.toContain('screenshot:unrelated-settings');
  });

  it('produces deterministic plans for identical fixture inputs', () => {
    const fixture = GUI_STATIC_FIXTURE_SUITE.fixtures.changed_token;
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:deterministic-token',
      change_kinds: ['css_design_token'],
      file_paths: [fixture.path],
      component_ids: [...fixture.component_ids],
    });
    const context = fixtureInvalidationContext();
    const first = planUiInvalidation(changeSet, { context });
    const second = planUiInvalidation(changeSet, { context });
    expect(serializeUiInvalidationPlan(first)).toBe(
      serializeUiInvalidationPlan(second),
    );
    expect(first.plan_id).toBe(second.plan_id);
  });
});

describe('VGO-070 token accounting and omitted unrelated context', () => {
  it('records reproducible compression accounting from the fixture pack', () => {
    const first = buildGuiContextPack(baseRequest());
    const second = buildGuiContextPack(baseRequest());
    assertAccountingEquations(first);
    expect(first.raw_source_tokens).toBe(second.raw_source_tokens);
    expect(first.capsule_tokens).toBe(second.capsule_tokens);
    expect(first.compression_ratio).toBe(second.compression_ratio);
    expect(serializeUiContextPack(first)).toBe(serializeUiContextPack(second));
    expect(contextPackDigest(first)).toBe(contextPackDigest(second));
    expect(uiContextTokenAccountingFromPack(first).raw_source_tokens).toBe(
      first.raw_source_tokens,
    );
    expect(first.raw_source_tokens).toBe(
      first.raw_sources.reduce(
        (sum, item) => sum + estimateContextTokens(item.content),
        0,
      ),
    );
  });

  it('omits the unrelated stylesheet and keeps required acceptance evidence', () => {
    const pack = buildGuiContextPack(baseRequest());
    assertAccountingEquations(pack);
    expect(pack.styles.map(item => item.path)).toContain(CHANGED_TOKEN_REL);
    expect(pack.styles.map(item => item.path)).not.toContain(UNRELATED_STYLE_REL);
    expect(pack.raw_sources.map(item => item.path)).toContain(
      'web/js/apps/agent-supervisor.js',
    );
    expect(pack.raw_sources.some(item => item.editable)).toBe(true);
    expect(pack.affected_tests.map(item => item.test_id)).toContain(
      'test:goal-form-a11y',
    );
    expect(pack.acceptance_criteria.length).toBeGreaterThan(0);
    expect(pack.excluded_context_explanation).toMatch(
      /omitted|excluded|Unrelated/i,
    );
  });
});

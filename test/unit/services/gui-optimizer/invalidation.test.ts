/**
 * VGO-027 — incremental GUI invalidation planning tests.
 *
 * Acceptance:
 * - unrelated changes do not invalidate all screenshots
 * - binding changes include policy/confirmation/host/interaction checks
 * - state changes include reachability/outcome/formal checks
 * - uncertainty explicitly requests broader fallback
 * - plans are deterministic for identical inputs
 * - closed wire models reject unknown fields and empty required sequences
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { STABLE_SCENARIO_IDS } from '../../../../src/services/gui-optimizer/scenario-catalog.js';
import {
  UI_CHANGE_KINDS,
  UI_CHANGE_SET_INTERFACE,
  UI_CHANGE_SET_SCHEMA,
  UI_INVALIDATION_CHECK_IDS,
  UI_INVALIDATION_PLANNER_INTERFACE,
  UI_INVALIDATION_PLANNER_SCHEMA,
  UI_INVALIDATION_PLANNER_VERSION,
  UI_INVALIDATION_PLAN_INTERFACE,
  UI_INVALIDATION_PLAN_SCHEMA,
  UI_INVALIDATION_REASONS,
  affectedScreenshotIds,
  createUiInvalidationPlanner,
  decodeUiChangeSet,
  decodeUiInvalidationPlan,
  invalidationPlanDigest,
  makeUiChangeSet,
  makeUiInvalidationPlan,
  normalizeUiChangeSet,
  planUiInvalidation,
  serializeUiChangeSet,
  serializeUiInvalidationPlan,
  uiChangeSetToDict,
  uiInvalidationPlanToDict,
  type UiInvalidationContext,
  type UiInvalidationEdge,
} from '../../../../src/services/gui-optimizer/invalidation.js';

const GOAL_FORM = 'comp:goal-form';
const SIDEBAR = 'comp:sidebar';
const TOKEN = 'token:surface-color';
const ROOT = 'comp:console-root';

const ALL_KNOWN_SCENARIOS = Object.freeze(Object.values(STABLE_SCENARIO_IDS));

function baseContext(
  partial: Partial<UiInvalidationContext> = {},
): UiInvalidationContext {
  const edges: UiInvalidationEdge[] = [
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
      source_component_id: GOAL_FORM,
      target_component_id: TOKEN,
      relation: 'uses_design_token',
      confidence: 'exact',
    },
    {
      source_component_id: GOAL_FORM,
      target_component_id: 'action:dispatch',
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

  return {
    application_id: 'app:agent-supervisor',
    screen_id: 'screen:agent-supervisor',
    edges,
    capsules: [
      {
        component_id: GOAL_FORM,
        screenshot_ids: ['screenshot:goal-form-ready'],
        test_ids: ['test:goal-form-submit'],
        action_binding_ids: ['action:dispatch'],
        localization_keys: ['label.goal'],
        child_component_ids: [],
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
        component_id: 'comp:settings-panel',
        scenario_id: STABLE_SCENARIO_IDS.initial_load,
      },
    ],
    known_component_ids: [
      ROOT,
      GOAL_FORM,
      SIDEBAR,
      'comp:settings-panel',
    ],
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

describe('VGO-027 UiChangeSet@1 / UiInvalidationPlan@1 wire models', () => {
  it('decodes a closed UiChangeSet and rejects unknown fields', () => {
    const changeSet = decodeUiChangeSet({
      interface: UI_CHANGE_SET_INTERFACE,
      schema_version: UI_CHANGE_SET_SCHEMA,
      change_set_id: 'change:label-fix',
      change_kinds: ['component_implementation', 'accessibility'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
      state_ids: ['state:ready'],
      action_ids: ['action:dispatch'],
      summary: 'Add an accessible name to the goal form.',
    });

    expect(changeSet.interface).toBe(UI_CHANGE_SET_INTERFACE);
    expect(changeSet.schema_version).toBe(UI_CHANGE_SET_SCHEMA);
    expect(changeSet.change_kinds).toEqual([
      'component_implementation',
      'accessibility',
    ]);
    expect(serializeUiChangeSet(changeSet)).toBe(
      serializeUiChangeSet(normalizeUiChangeSet(uiChangeSetToDict(changeSet))),
    );

    expect(() =>
      decodeUiChangeSet({
        ...uiChangeSetToDict(changeSet),
        extra: true,
      }),
    ).toThrow(/unknown UiChangeSet field/);

    expect(() =>
      decodeUiChangeSet({
        ...uiChangeSetToDict(changeSet),
        change_kinds: [],
      }),
    ).toThrow(/change_kinds must not be empty/);

    expect(() =>
      decodeUiChangeSet({
        ...uiChangeSetToDict(changeSet),
        file_paths: [],
      }),
    ).toThrow(/file_paths must not be empty/);
  });

  it('decodes a closed UiInvalidationPlan sample matching Python fixtures', () => {
    const plan = decodeUiInvalidationPlan({
      interface: UI_INVALIDATION_PLAN_INTERFACE,
      schema_version: UI_INVALIDATION_PLAN_SCHEMA,
      plan_id: 'invalidate:label-form',
      change_set_id: 'change:label-form',
      reasons: ['component_changed'],
      affected_component_ids: [GOAL_FORM],
      affected_scenario_ids: [STABLE_SCENARIO_IDS.keyboard_only],
      affected_check_ids: ['check:accessible-name'],
      confidence: 'exact',
      fallback_triggered: false,
      fallback_explanation: 'No uncertainty requires broad fallback.',
    });

    expect(plan.interface).toBe(UI_INVALIDATION_PLAN_INTERFACE);
    expect(plan.fallback_triggered).toBe(false);
    expect(invalidationPlanDigest(plan)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(uiInvalidationPlanToDict(plan).reasons).toEqual(['component_changed']);
  });

  it('exposes closed change-kind and reason vocabularies', () => {
    expect(UI_CHANGE_KINDS).toContain('css_design_token');
    expect(UI_CHANGE_KINDS).toContain('action_binding');
    expect(UI_INVALIDATION_REASONS).toContain('fallback_expansion');
    expect(UI_INVALIDATION_REASONS).toContain('opaque_edge');
  });
});

describe('VGO-027 incremental invalidation planning', () => {
  it('does not invalidate unrelated screenshots for a local style/token change', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:token-surface',
      change_kinds: ['css_design_token'],
      file_paths: ['swissknife/web/css/tokens.css'],
      component_ids: [TOKEN],
      summary: 'Update surface color token used by the goal form.',
    });

    // Token is used by goal-form only; reverse uses_design_token edge.
    const context = baseContext({
      edges: [
        {
          source_component_id: GOAL_FORM,
          target_component_id: TOKEN,
          relation: 'uses_design_token',
          confidence: 'exact',
        },
        {
          source_component_id: SIDEBAR,
          target_component_id: 'token:sidebar-border',
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
          source_component_id: 'comp:settings-panel',
          target_component_id: 'screenshot:unrelated-settings',
          relation: 'screenshot_by',
          confidence: 'exact',
        },
      ],
    });

    const plan = planUiInvalidation(changeSet, { context });
    const shots = affectedScreenshotIds(changeSet, { context });

    expect(plan.reasons).toContain('style_changed');
    expect(plan.fallback_triggered).toBe(false);
    expect(plan.affected_component_ids).toContain(GOAL_FORM);
    expect(plan.affected_component_ids).toContain(TOKEN);
    expect(plan.affected_component_ids).not.toContain(SIDEBAR);
    expect(plan.affected_component_ids).not.toContain('comp:settings-panel');

    expect(shots).toContain('screenshot:goal-form-ready');
    expect(shots).not.toContain('screenshot:sidebar-ready');
    expect(shots).not.toContain('screenshot:unrelated-settings');
    expect(shots.length).toBeLessThan(
      (context.known_screenshot_ids ?? []).length,
    );

    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([
        UI_INVALIDATION_CHECK_IDS.dependentScreenshots,
        UI_INVALIDATION_CHECK_IDS.responsive,
        UI_INVALIDATION_CHECK_IDS.contrast,
        UI_INVALIDATION_CHECK_IDS.clipping,
        UI_INVALIDATION_CHECK_IDS.overflow,
      ]),
    );
    expect(plan.affected_scenario_ids).toEqual(
      expect.arrayContaining([
        STABLE_SCENARIO_IDS.viewport_mobile,
        STABLE_SCENARIO_IDS.viewport_desktop,
        STABLE_SCENARIO_IDS.text_scale_200,
      ]),
    );
  });

  it('includes policy, confirmation, host, and interaction checks for binding changes', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:dispatch-binding',
      change_kinds: ['action_binding'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
      action_ids: ['action:dispatch'],
      summary: 'Retarget dispatch action binding.',
    });

    const plan = planUiInvalidation(changeSet, { context: baseContext() });

    expect(plan.reasons).toContain('action_changed');
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([
        UI_INVALIDATION_CHECK_IDS.policy,
        UI_INVALIDATION_CHECK_IDS.confirmation,
        UI_INVALIDATION_CHECK_IDS.hostBoundary,
        UI_INVALIDATION_CHECK_IDS.interaction,
        UI_INVALIDATION_CHECK_IDS.invocationTests,
      ]),
    );
    expect(plan.affected_scenario_ids).toEqual(
      expect.arrayContaining([
        STABLE_SCENARIO_IDS.confirmation_grant,
        STABLE_SCENARIO_IDS.confirmation_deny,
        STABLE_SCENARIO_IDS.valid_submission,
        STABLE_SCENARIO_IDS.keyboard_only,
      ]),
    );
    expect(plan.fallback_triggered).toBe(false);
  });

  it('includes reachability, outcome, and formal checks for state-machine changes', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:ready-transition',
      change_kinds: ['state_machine'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
      state_ids: ['state:ready', 'state:loading', 'state:failure'],
      summary: 'Add explicit failure transition from loading.',
    });

    const plan = planUiInvalidation(changeSet, { context: baseContext() });

    expect(plan.reasons).toContain('state_changed');
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([
        UI_INVALIDATION_CHECK_IDS.reachability,
        UI_INVALIDATION_CHECK_IDS.outcome,
        UI_INVALIDATION_CHECK_IDS.formal,
        UI_INVALIDATION_CHECK_IDS.interactionScenarios,
      ]),
    );
    expect(plan.affected_scenario_ids).toEqual(
      expect.arrayContaining([
        STABLE_SCENARIO_IDS.loading,
        STABLE_SCENARIO_IDS.success,
        STABLE_SCENARIO_IDS.recoverable_failure,
        STABLE_SCENARIO_IDS.unrecoverable_failure,
      ]),
    );
    expect(plan.fallback_triggered).toBe(false);
  });

  it('explicitly requests broader fallback under uncertainty without invalidating every screenshot', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:opaque-handler',
      change_kinds: ['component_implementation'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
      summary: 'Opaque third-party handler rewrite.',
    });

    const context = baseContext({
      unresolved: ['dynamic:third-party-handler'],
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
      graph_confidence: 'opaque',
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
    expect(plan.fallback_explanation.toLowerCase()).toMatch(
      /fallback|opaque|unresolved|broader/,
    );
    expect(plan.affected_check_ids).toContain(
      UI_INVALIDATION_CHECK_IDS.broaderScreenFallback,
    );
    // Broader screen scenarios, still not every application.
    expect(plan.affected_scenario_ids.length).toBeGreaterThan(3);
    expect(plan.confidence).toBe('opaque');

    // Screenshot precision remains ownership-bounded for the helper even when
    // scenario fallback expands.
    expect(shots).toContain('screenshot:goal-form-ready');
    expect(shots).not.toContain('screenshot:unrelated-settings');
  });

  it('triggers documented fallback for missing or stale edges', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:stale-graph',
      change_kinds: ['props_event_contract'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
    });

    const plan = planUiInvalidation(changeSet, {
      context: baseContext({
        missing_edges: true,
        stale_edges: true,
      }),
    });

    expect(plan.fallback_triggered).toBe(true);
    expect(plan.reasons).toEqual(
      expect.arrayContaining([
        'props_changed',
        'missing_edge',
        'stale_edge',
        'fallback_expansion',
      ]),
    );
    expect(plan.fallback_explanation).toMatch(/missing|stale/i);
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([
        UI_INVALIDATION_CHECK_IDS.parentsConsumers,
        UI_INVALIDATION_CHECK_IDS.actionBindings,
        UI_INVALIDATION_CHECK_IDS.interfaceDescriptors,
        UI_INVALIDATION_CHECK_IDS.broaderScreenFallback,
      ]),
    );
  });

  it('maps localization changes to text-layout and accessible-name checks', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:locale-labels',
      change_kinds: ['localization'],
      file_paths: ['swissknife/web/i18n/en-US.json'],
      component_ids: [GOAL_FORM],
    });

    const plan = planUiInvalidation(changeSet, { context: baseContext() });

    expect(plan.reasons).toContain('localization_changed');
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([
        UI_INVALIDATION_CHECK_IDS.textLayoutScreenshots,
        UI_INVALIDATION_CHECK_IDS.accessibleName,
        UI_INVALIDATION_CHECK_IDS.localeScenarios,
      ]),
    );
    expect(plan.affected_scenario_ids).toContain(
      STABLE_SCENARIO_IDS.text_scale_200,
    );
  });

  it('maps component implementation to capsule, tests, screenshots, and a11y scenarios', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:goal-impl',
      change_kinds: ['component_implementation'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
    });

    const plan = planUiInvalidation(changeSet, { context: baseContext() });

    expect(plan.reasons).toContain('component_changed');
    expect(plan.affected_component_ids).toContain(GOAL_FORM);
    expect(plan.affected_check_ids).toEqual(
      expect.arrayContaining([
        UI_INVALIDATION_CHECK_IDS.capsule,
        UI_INVALIDATION_CHECK_IDS.directTests,
        UI_INVALIDATION_CHECK_IDS.containingScreenshots,
        UI_INVALIDATION_CHECK_IDS.accessibilityScenarios,
      ]),
    );
    expect(plan.affected_scenario_ids).toContain(
      STABLE_SCENARIO_IDS.keyboard_only,
    );
  });

  it('produces deterministic plans for identical inputs via the planner interface', () => {
    const planner = createUiInvalidationPlanner();
    expect(planner.interface).toBe(UI_INVALIDATION_PLANNER_INTERFACE);
    expect(planner.schema_version).toBe(UI_INVALIDATION_PLANNER_SCHEMA);
    expect(planner.extractorVersion).toBe(UI_INVALIDATION_PLANNER_VERSION);

    const changeSet = makeUiChangeSet({
      change_set_id: 'change:deterministic',
      change_kinds: ['component_implementation', 'accessibility'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
      summary: 'Determinism check',
    });
    const context = baseContext();

    const a = planner.plan(changeSet, { context });
    const b = planner.plan(changeSet, { context });

    expect(serializeUiInvalidationPlan(a)).toBe(serializeUiInvalidationPlan(b));
    expect(a.plan_id).toBe(b.plan_id);
    expect(a.affected_component_ids).toEqual(
      [...a.affected_component_ids].sort((x, y) => x.localeCompare(y)),
    );
    expect(a.affected_scenario_ids).toEqual(
      [...a.affected_scenario_ids].sort((x, y) => x.localeCompare(y)),
    );
    expect(a.affected_check_ids).toEqual(
      [...a.affected_check_ids].sort((x, y) => x.localeCompare(y)),
    );
  });

  it('never rewrites every application by default for other/unknown-precision changes', () => {
    const changeSet = makeUiChangeSet({
      change_set_id: 'change:other',
      change_kinds: ['other'],
      file_paths: ['swissknife/web/js/apps/agent-supervisor.js'],
      component_ids: [GOAL_FORM],
    });

    const plan = planUiInvalidation(changeSet, { context: baseContext() });

    expect(plan.fallback_triggered).toBe(true);
    expect(plan.reasons).toContain('fallback_expansion');
    expect(plan.affected_component_ids).toContain(GOAL_FORM);
    // Fallback may expand to known screen components, still not inventing
    // foreign applications.
    for (const id of plan.affected_component_ids) {
      expect(id.startsWith('comp:') || id.startsWith('token:')).toBe(true);
    }
  });

  it('makeUiInvalidationPlan round-trips through decode', () => {
    const plan = makeUiInvalidationPlan({
      plan_id: 'invalidate:round-trip',
      change_set_id: 'change:round-trip',
      reasons: ['component_changed'],
      affected_component_ids: [GOAL_FORM],
      affected_scenario_ids: [STABLE_SCENARIO_IDS.initial_load],
      affected_check_ids: [UI_INVALIDATION_CHECK_IDS.capsule],
      confidence: 'exact',
      fallback_triggered: false,
      fallback_explanation: 'No uncertainty requires broad fallback.',
    });
    expect(decodeUiInvalidationPlan(uiInvalidationPlanToDict(plan))).toEqual(
      plan,
    );
  });
});


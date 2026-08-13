/**
 * VGO-030 — compact, evidence-bounded GUI context packs.
 *
 * Acceptance:
 * - editable, opaque, stale, unresolved or failure-point source is raw
 * - stale capsules are rejected
 * - budgets are bounded
 * - compression accounting is reproducible
 * - omitted context is explained without losing affected acceptance evidence
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildStableIdentity,
  compileComponentVersion,
} from '../../../../src/services/gui-optimizer/identity.js';
import {
  makeUiChangeSet,
  makeUiInvalidationPlan,
} from '../../../../src/services/gui-optimizer/invalidation.js';
import { makeUiActionBinding } from '../../../../src/services/gui-optimizer/policy-validator.js';
import {
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
} from '../../../../src/services/gui-optimizer/state-machine.js';
import {
  UI_CAPSULE_COMPILER_VERSION,
  UI_COMPONENT_VERSION_SCHEMA,
  makeUiSemanticCapsule,
  type UiSemanticCapsule,
} from '../../../../src/services/gui-optimizer/ui-capsule.js';
import {
  BUILD_GUI_CONTEXT_PACK_INTERFACE,
  CONTEXT_TOKEN_CHARS_PER_TOKEN,
  UI_CONTEXT_PACK_BUILDER_INTERFACE,
  UI_CONTEXT_PACK_BUILDER_SCHEMA,
  UI_CONTEXT_PACK_BUILDER_VERSION,
  UI_CONTEXT_PACK_INTERFACE,
  UI_CONTEXT_PACK_SCHEMA,
  UI_CONTEXT_SOURCE_INCLUSION_REASONS,
  UI_CONTEXT_SOURCE_INTERFACE,
  UI_CONTEXT_SOURCE_SCHEMA,
  UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE,
  UI_CONTEXT_TOKEN_ACCOUNTING_SCHEMA,
  buildGuiContextPack,
  buildGuiContextPackWithTrace,
  build_gui_context_pack,
  collectContextPackInclusionReasons,
  computeUiContextTokenAccounting,
  contextPackDigest,
  createUiContextPackBuilder,
  decodeUiContextPack,
  decodeUiContextSource,
  decodeUiContextTokenAccounting,
  estimateContextTokens,
  makeUiContextSource,
  serializeUiContextPack,
  serializeUiContextTokenAccounting,
  uiContextPackToDict,
  uiContextTokenAccountingFromPack,
  type GuiContextPackRequest,
  type GuiContextRepositoryState,
  type GuiContextSourceInput,
  type UiContextPack,
} from '../../../../src/services/gui-optimizer/context-pack.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const PKG = 'org.hallucinate.swissknife.gui-optimizer';
const GOAL_FORM = 'comp:goal-form';
const ROOT = 'comp:console-root';
const CHILD = 'comp:goal-input';
const SIDEBAR = 'comp:sidebar';
const DIGEST_A =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DIGEST_B =
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DIGEST_C =
  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function fixtureVersion(qualifiedName: string, kind: 'form' | 'screen' | 'input' | 'nav' = 'form') {
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
      accessibility: { contract: 'a11y:goal-form' },
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
      kind?: 'form' | 'screen' | 'input' | 'nav';
    },
): UiSemanticCapsule {
  const version = fixtureVersion(
    partial.qualifiedName ?? partial.capsule_id.replace(/^capsule:/, 'apps.'),
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

function source(
  partial: GuiContextSourceInput,
): GuiContextSourceInput {
  return partial;
}

function baseState(
  overrides: Partial<GuiContextRepositoryState> = {},
): GuiContextRepositoryState {
  return {
    revision: 'rev:fixture',
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
        path: 'web/js/apps/sidebar.js',
        content: 'export function Sidebar() { return <nav /> }\n',
        component_id: SIDEBAR,
        application_id: 'app:other',
        screen_id: 'screen:other',
      }),
    ],
    styles: [
      {
        path: 'web/css/goal-form.css',
        content: '.goal-form {  color:  token(surface); }\n',
        style_kind: 'css',
        component_id: GOAL_FORM,
      },
      {
        path: 'web/css/tokens.css',
        content: ':root { --surface: #111; }\n',
        style_kind: 'design-token',
        component_id: GOAL_FORM,
      },
      {
        path: 'web/css/other-app.css',
        content: '.unrelated { display: none; }\n',
        style_kind: 'css',
        component_id: SIDEBAR,
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
      {
        path: 'test/other-app.test.ts',
        content: "it('other', () => {})\n",
        test_id: 'test:other-app',
        component_id: SIDEBAR,
        application_id: 'app:other',
        screen_id: 'screen:other',
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
    edges: [
      {
        source_component_id: ROOT,
        target_component_id: GOAL_FORM,
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
        target_component_id: 'web/css/tokens.css',
        relation: 'uses_design_token',
        confidence: 'exact',
      },
      {
        source_component_id: GOAL_FORM,
        target_component_id: 'test:goal-form-a11y',
        relation: 'tested_by',
        confidence: 'exact',
      },
    ],
    state_machine: fixtureStateMachine(),
    action_bindings: [
      makeUiActionBinding({
        action_id: 'action:dispatch',
        method: 'method:dispatch-goal',
        schema_id: 'schema:dispatch-goal',
        component_id: GOAL_FORM,
      }),
    ],
    routes: [
      { route_id: 'route:agent-supervisor', path: '/agent-supervisor' },
    ],
    screenshots: [
      {
        scenario_id: 'scenario:keyboard-only',
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
      affected_scenario_ids: ['scenario:keyboard-only'],
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
  expect(pack.compression_ratio).toBe(
    (ordinary - total) / ordinary,
  );
}

describe('VGO-030 UiContextPack@1 wire contract', () => {
  it('exposes closed interface identities and inclusion vocabulary', () => {
    expect(BUILD_GUI_CONTEXT_PACK_INTERFACE).toBe('build_gui_context_pack@1');
    expect(UI_CONTEXT_PACK_INTERFACE).toBe('UiContextPack@1');
    expect(UI_CONTEXT_PACK_SCHEMA).toBe('ui-context-pack/v1');
    expect(UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE).toBe(
      'UiContextTokenAccounting@1',
    );
    expect(UI_CONTEXT_TOKEN_ACCOUNTING_SCHEMA).toBe(
      'ui-context-token-accounting/v1',
    );
    expect(UI_CONTEXT_SOURCE_INTERFACE).toBe('UiContextSource@1');
    expect(UI_CONTEXT_SOURCE_SCHEMA).toBe('ui-context-source/v1');
    expect(UI_CONTEXT_PACK_BUILDER_INTERFACE).toBe('UiContextPackBuilder@1');
    expect(UI_CONTEXT_PACK_BUILDER_SCHEMA).toBe('ui-context-pack-builder/v1');
    expect(UI_CONTEXT_PACK_BUILDER_VERSION).toBe(
      'gui-context-pack-builder@1.0.0',
    );
    expect([...UI_CONTEXT_SOURCE_INCLUSION_REASONS]).toEqual([
      'editable_target',
      'opaque_component',
      'stale_component',
      'unresolved_binding',
      'failure_point',
      'implementation_visual_failure',
    ]);
    expect(CONTEXT_TOKEN_CHARS_PER_TOKEN).toBe(3);
  });

  it('decodes a built pack and rejects unknown fields', () => {
    const pack = buildGuiContextPack(baseRequest());
    expect(decodeUiContextPack(uiContextPackToDict(pack))).toEqual(pack);
    const withoutRatio = { ...uiContextPackToDict(pack) };
    delete withoutRatio.compression_ratio;
    expect(decodeUiContextPack(withoutRatio).compression_ratio).toBe(
      pack.compression_ratio,
    );
    expect(() =>
      decodeUiContextPack({ ...uiContextPackToDict(pack), extra: true }),
    ).toThrow(/unknown UiContextPack field/);
    expect(() =>
      decodeUiContextSource({
        ...makeUiContextSource({
          path: 'web/js/apps/agent-supervisor.js',
          content: 'x',
        }),
        notes: 'nope',
      }),
    ).toThrow(/unknown UiContextSource field/);
  });

  it('preserves exact source whitespace and does not trim content', () => {
    const content = '  export function GoalForm() {\n\treturn <form />;\n  }\n';
    const pack = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          sources: [
            source({
              path: 'web/js/apps/agent-supervisor.js',
              content,
              component_id: GOAL_FORM,
              editable: true,
            }),
          ],
        }),
      }),
    );
    expect(pack.raw_sources[0]?.content).toBe(content);
    expect(pack.styles.find(item => item.path === 'web/css/goal-form.css')?.content).toBe(
      '.goal-form {  color:  token(surface); }\n',
    );
  });
});

describe('VGO-030 raw-source inclusion rules', () => {
  it('includes editable target source as raw', () => {
    const pack = buildGuiContextPack(baseRequest());
    const editable = pack.raw_sources.find(
      item => item.path === 'web/js/apps/agent-supervisor.js',
    );
    expect(editable).toBeDefined();
    expect(editable?.editable).toBe(true);
    expect(editable?.content).toContain('GoalForm');
    expect(collectContextPackInclusionReasons(pack)).toEqual(
      expect.arrayContaining([
        'raw:editable_target:web/js/apps/agent-supervisor.js',
      ]),
    );
  });

  it('includes opaque component source as raw even when a capsule exists', () => {
    const opaque = fixtureCapsule({
      capsule_id: 'capsule:opaque-input',
      qualifiedName: CHILD,
      kind: 'input',
      analysis_classification: 'opaque',
      verification_status: 'unverified',
    });
    const pack = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          capsules: [
            fixtureCapsule({
              capsule_id: 'capsule:console-root',
              qualifiedName: ROOT,
              kind: 'screen',
              child_component_ids: [GOAL_FORM, CHILD],
            }),
            opaque,
          ],
        }),
      }),
    );
    expect(
      pack.raw_sources.some(item => item.path === 'web/js/apps/goal-input.js'),
    ).toBe(true);
    expect(
      pack.raw_sources.find(item => item.path === 'web/js/apps/goal-input.js')
        ?.editable,
    ).toBe(false);
  });

  it('rejects stale capsules and requires raw source instead', () => {
    const stale = fixtureCapsule({
      capsule_id: 'capsule:stale-root',
      qualifiedName: ROOT,
      kind: 'screen',
      verification_status: 'stale',
      child_component_ids: [GOAL_FORM],
    });
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
          capsule_id: 'capsule:stale-root',
          reason: 'stale_capsule',
        }),
      ]),
    );
    expect(
      [...trace.pack.parent_capsules, ...trace.pack.child_capsules].map(
        item => item.capsule_id,
      ),
    ).not.toContain('capsule:stale-root');
    expect(
      trace.pack.raw_sources.some(
        item => item.path === 'web/js/apps/console-root.js',
      ),
    ).toBe(true);
    expect(trace.pack.excluded_context_explanation).toMatch(/Stale capsule/);
  });

  it('fails closed when a stale capsule has no raw source', () => {
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
            capsules: [
              fixtureCapsule({
                capsule_id: 'capsule:stale-root',
                qualifiedName: ROOT,
                kind: 'screen',
                verification_status: 'stale',
                child_component_ids: [GOAL_FORM],
              }),
            ],
          }),
        }),
      ),
    ).toThrow(/raw source required for stale_component/);
  });

  it('includes unresolved binding implementation source as raw', () => {
    const pack = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          binding_resolutions: [
            {
              action_id: 'action:dispatch',
              component_id: GOAL_FORM,
              path: 'web/js/apps/agent-supervisor.js',
              resolution: 'unresolved',
            },
          ],
        }),
      }),
    );
    expect(
      pack.raw_sources.some(
        item => item.path === 'web/js/apps/agent-supervisor.js',
      ),
    ).toBe(true);
    expect(pack.escalation_conditions).toEqual(
      expect.arrayContaining([
        'Escalate if unresolved state or action bindings remain.',
      ]),
    );
  });

  it('includes failure-point and implementation-dependent visual source as raw', () => {
    const pack = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          sources: [
            source({
              path: 'web/js/apps/agent-supervisor.js',
              content: 'export function GoalForm() { return <form /> }\n',
              component_id: GOAL_FORM,
              editable: true,
            }),
            source({
              path: 'web/js/apps/goal-input.js',
              content: 'export function GoalInput() { return <input /> }\n',
              component_id: CHILD,
            }),
          ],
        }),
        violations: {
          formal_invariant_failures: [
            {
              invariant_id: 'invariant:input-accessible-name',
              status: 'violated',
              description: 'Goal input has no accessible name.',
              component_id: CHILD,
              path: 'web/js/apps/goal-input.js',
            },
          ],
          visual_failures: [
            {
              artifact_digest: DIGEST_C,
              description: 'Implementation-dependent clipping at the input.',
              component_id: CHILD,
              path: 'web/js/apps/goal-input.js',
              implementation_dependent: true,
            },
          ],
        },
      }),
    );
    expect(
      pack.raw_sources.map(item => item.path).sort(),
    ).toEqual([
      'web/js/apps/agent-supervisor.js',
      'web/js/apps/goal-input.js',
    ]);
    expect(pack.visual_references.some(item => item.artifact_digest === DIGEST_C)).toBe(
      true,
    );
    expect(pack.escalation_conditions).toEqual(
      expect.arrayContaining([
        'Escalate if visual failure is implementation-dependent.',
      ]),
    );
  });
});

describe('VGO-030 budgets, compression, and omissions', () => {
  it('records reproducible token accounting equations', () => {
    const first = buildGuiContextPack(baseRequest());
    const second = buildGuiContextPack(baseRequest());
    assertAccountingEquations(first);
    expect(first.raw_source_tokens).toBe(second.raw_source_tokens);
    expect(first.capsule_tokens).toBe(second.capsule_tokens);
    expect(first.screenshot_analysis_tokens).toBe(
      second.screenshot_analysis_tokens,
    );
    expect(first.other_context_tokens).toBe(second.other_context_tokens);
    expect(first.source_tokens_replaced_by_capsules).toBe(
      second.source_tokens_replaced_by_capsules,
    );
    expect(first.compression_ratio).toBe(second.compression_ratio);
    expect(serializeUiContextPack(first)).toBe(serializeUiContextPack(second));
    expect(contextPackDigest(first)).toBe(contextPackDigest(second));
    const accounting = uiContextTokenAccountingFromPack(first);
    expect(accounting.interface).toBe(UI_CONTEXT_TOKEN_ACCOUNTING_INTERFACE);
    expect(decodeUiContextTokenAccounting(accounting)).toEqual(accounting);
    expect(serializeUiContextTokenAccounting(accounting)).toBe(
      serializeUiContextTokenAccounting(
        computeUiContextTokenAccounting(accounting),
      ),
    );
  });

  it('uses a conservative deterministic token estimator', () => {
    expect(estimateContextTokens('')).toBe(0);
    expect(estimateContextTokens('abc')).toBe(1);
    expect(estimateContextTokens('abcd')).toBe(2);
    const pack = buildGuiContextPack(baseRequest());
    const expectedRaw = pack.raw_sources.reduce(
      (sum, item) => sum + estimateContextTokens(item.content),
      0,
    );
    expect(pack.raw_source_tokens).toBe(expectedRaw);
  });

  it('preserves truthful negative compression', () => {
    const tinySource = source({
      path: 'web/js/apps/console-root.js',
      content: 'x',
      component_id: ROOT,
    });
    const pack = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          sources: [
            source({
              path: 'web/js/apps/agent-supervisor.js',
              content: 'export function GoalForm() { return <form /> }\n',
              component_id: GOAL_FORM,
              editable: true,
            }),
            tinySource,
            source({
              path: 'web/js/apps/goal-input.js',
              content: 'y',
              component_id: CHILD,
            }),
          ],
        }),
      }),
    );
    assertAccountingEquations(pack);
    expect(pack.source_tokens_replaced_by_capsules).toBeLessThan(
      pack.capsule_tokens,
    );
    expect(pack.compression_ratio).toBeLessThan(0);
    const derived =
      (pack.ordinary_raw_dependency_tokens -
        pack.total_estimated_prompt_tokens) /
      pack.ordinary_raw_dependency_tokens;
    expect(pack.compression_ratio).toBe(derived);
  });

  it('rejects a token budget that cannot retain required acceptance evidence', () => {
    expect(() =>
      buildGuiContextPack(
        baseRequest({
          token_budget: 8,
        }),
      ),
    ).toThrow(/cannot retain required acceptance evidence/);
  });

  it('rejects non-positive token budgets', () => {
    expect(() =>
      buildGuiContextPack(baseRequest({ token_budget: 0 })),
    ).toThrow(/token_budget must be >= 1/);
    expect(() =>
      computeUiContextTokenAccounting({
        raw_source_tokens: 10,
        capsule_tokens: 4,
        screenshot_analysis_tokens: 2,
        other_context_tokens: 4,
        source_tokens_replaced_by_capsules: 20,
        token_budget: 0,
      }),
    ).toThrow(/token_budget must be >= 1/);
  });

  it('rejects accounting that does not satisfy the derived equations', () => {
    const pack = buildGuiContextPack(baseRequest());
    const dict = uiContextPackToDict(pack);
    expect(() =>
      decodeUiContextPack({
        ...dict,
        compression_ratio: 0.999,
      }),
    ).toThrow(/compression_ratio must equal the derived equation exactly/);
    expect(() =>
      decodeUiContextPack({
        ...dict,
        total_estimated_prompt_tokens: pack.total_estimated_prompt_tokens + 1,
      }),
    ).toThrow(/total_estimated_prompt_tokens/);
  });

  it('omits unrelated context with an explanation and keeps acceptance evidence', () => {
    const requiredShot = {
      scenario_id: 'scenario:keyboard-only',
      artifact_digest: DIGEST_B,
      description: 'Goal form at desktop width.',
      component_id: GOAL_FORM,
      required: true,
    };
    // Stay inside the closed description bound so omission is a budget
    // decision, not a wire-length rejection. 140 repeats is ~1.2k tokens.
    const largeOptional = `${'optional screenshot payload '.repeat(140)}end`;
    const withOptional = baseRequest({
      repository_state: baseState({
        screenshots: [
          requiredShot,
          {
            scenario_id: 'scenario:unrelated-wide',
            artifact_digest: DIGEST_C,
            description: largeOptional,
            component_id: SIDEBAR,
          },
        ],
      }),
    });
    const withoutOptional = buildGuiContextPack(
      baseRequest({
        repository_state: baseState({
          screenshots: [requiredShot],
        }),
      }),
    );
    const pack = buildGuiContextPack({
      ...withOptional,
      token_budget: withoutOptional.total_estimated_prompt_tokens + 250,
    });
    assertAccountingEquations(pack);
    expect(pack.raw_sources.some(item => item.editable)).toBe(true);
    expect(pack.affected_tests.map(item => item.test_id)).toContain(
      'test:goal-form-a11y',
    );
    expect(pack.formal_invariant_failures.map(item => item.invariant_id)).toContain(
      'invariant:input-accessible-name',
    );
    expect(pack.accessibility_violations.map(item => item.violation_id)).toContain(
      'violation:missing-label',
    );
    expect(pack.acceptance_criteria.length).toBeGreaterThan(0);
    expect(pack.styles.map(item => item.path)).not.toContain(
      'web/css/other-app.css',
    );
    expect(pack.affected_tests.map(item => item.test_id)).not.toContain(
      'test:other-app',
    );
    expect(pack.raw_sources.map(item => item.path)).not.toContain(
      'web/js/apps/sidebar.js',
    );
    expect(pack.excluded_context_explanation.length).toBeGreaterThan(0);
    expect(pack.excluded_context_explanation).toMatch(
      /omitted|excluded|Unrelated/i,
    );
    expect(pack.screenshot_descriptions.map(item => item.scenario_id)).toContain(
      'scenario:keyboard-only',
    );
    expect(pack.screenshot_descriptions.map(item => item.scenario_id)).not.toContain(
      'scenario:unrelated-wide',
    );
  });

  it('includes unchanged parent and child capsules when they are not stale', () => {
    const pack = buildGuiContextPack(baseRequest());
    expect(pack.parent_capsules.map(item => item.capsule_id)).toContain(
      'capsule:console-root',
    );
    expect(pack.child_capsules.map(item => item.capsule_id)).toContain(
      'capsule:goal-input',
    );
    expect(pack.source_tokens_replaced_by_capsules).toBeGreaterThan(0);
    expect(pack.capsule_tokens).toBeGreaterThan(0);
  });
});

describe('VGO-030 builder surface and pack completeness', () => {
  it('implements build_gui_context_pack@1 positionally and via the builder', () => {
    const state = baseState();
    const baseline = {
      baseline_id: 'baseline:goal-form',
      metric_id: 'metric:goal-form',
      metrics: { interaction_steps: 3, unlabeled_controls: 1 },
    };
    const positional = build_gui_context_pack(
      state,
      APP,
      SCREEN,
      'Give the goal input one accessible name.',
      100000,
      baseline,
      {
        formal_invariant_failures: [
          {
            invariant_id: 'invariant:input-accessible-name',
            status: 'violated',
            description: 'Goal input has no accessible name.',
            component_id: GOAL_FORM,
            path: 'web/js/apps/agent-supervisor.js',
          },
        ],
      },
    );
    const builder = createUiContextPackBuilder();
    expect(builder.interface).toBe(UI_CONTEXT_PACK_BUILDER_INTERFACE);
    const viaBuilder = builder.build(baseRequest());
    expect(positional.interface).toBe(UI_CONTEXT_PACK_INTERFACE);
    expect(positional.schema_version).toBe(UI_CONTEXT_PACK_SCHEMA);
    expect(viaBuilder.application_id).toBe(APP);
    expect(viaBuilder.screen_id).toBe(SCREEN);
    expect(viaBuilder.objective).toBe(
      'Give the goal input one accessible name.',
    );
  });

  it('packs objective, styles, tests, state, routes, bindings, baseline, and escalation', () => {
    const pack = buildGuiContextPack(baseRequest());
    expect(pack.objective).toBe('Give the goal input one accessible name.');
    expect(pack.styles.map(item => item.path)).toEqual(
      expect.arrayContaining(['web/css/goal-form.css', 'web/css/tokens.css']),
    );
    expect(pack.affected_tests[0]?.test_id).toBe('test:goal-form-a11y');
    expect(pack.state_machine.machine_id).toBe('sm:agent-supervisor');
    expect(pack.state_machine.states[0]?.state_id).toBe('state:ready');
    expect(pack.affected_routes[0]?.route_id).toBe('route:agent-supervisor');
    expect(pack.action_bindings[0]?.action_id).toBe('action:dispatch');
    expect(pack.metric_baseline.metric_id).toBe('metric:goal-form');
    expect(pack.metric_baseline.metrics.interaction_steps).toBe(3);
    expect(pack.baseline_id).toBe('baseline:goal-form');
    expect(pack.artifact_digests).toEqual(
      expect.arrayContaining([DIGEST_A, DIGEST_B]),
    );
    expect(pack.escalation_conditions).toEqual(
      expect.arrayContaining([
        'Escalate if required acceptance evidence cannot fit the token budget.',
        'Escalate if action binding changes.',
      ]),
    );
    expect(pack.acceptance_criteria.join(' ')).toMatch(/accessible name/i);
    assertAccountingEquations(pack);
  });

  it('does not dump unrelated raw repository files', () => {
    const pack = buildGuiContextPack(baseRequest());
    expect(pack.raw_sources.map(item => item.path)).toEqual([
      'web/js/apps/agent-supervisor.js',
    ]);
  });
});

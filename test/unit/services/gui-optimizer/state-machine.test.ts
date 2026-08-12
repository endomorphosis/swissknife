/**
 * VGO-016 — explicit bounded UI state-machine extraction tests.
 *
 * Acceptance:
 * - undefined destinations are rejected
 * - explicit no-ops differ from absent outcomes
 * - async effects expose observed loading/success/failure facts or a violation
 * - extraction is deterministic
 * - reachability graphs, conditional-render spans, async fixtures, and
 *   unresolved-transition reports are produced without inventing transitions
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_JSON_PROFILE,
  GUI_SOURCE_FINDING_INTERFACE,
  GUI_SOURCE_FINDING_SCHEMA,
  GUI_STATIC_EXTRACTOR_VERSION,
  makeSourceSpan,
  type GuiSourceFinding,
} from '../../../../src/services/gui-optimizer/models.js';
import {
  UI_EVENT_DEFINITION_INTERFACE,
  UI_EVENT_DEFINITION_SCHEMA,
  UI_EVENT_KINDS,
  UI_STATE_DEFINITION_INTERFACE,
  UI_STATE_DEFINITION_SCHEMA,
  UI_STATE_KINDS,
  UI_STATE_MACHINE_EXTRACTOR_INTERFACE,
  UI_STATE_MACHINE_EXTRACTOR_SCHEMA,
  UI_STATE_MACHINE_EXTRACTOR_VERSION,
  UI_STATE_MACHINE_INTERFACE,
  UI_STATE_MACHINE_SCHEMA,
  UI_TRANSITION_DEFINITION_INTERFACE,
  UI_TRANSITION_DEFINITION_SCHEMA,
  buildReachabilityGraph,
  canonicalJson,
  createUiStateMachineExtractor,
  decodeUiEventDefinition,
  decodeUiStateDefinition,
  decodeUiTransitionDefinition,
  extractUiStateMachineFromFacts,
  lookupTransitionOutcomes,
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
  serializeUiStateMachine,
  stateMachineDigest,
  validateUiStateMachine,
  type UiStateMachine,
} from '../../../../src/services/gui-optimizer/state-machine.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';

function finding(
  partial: Partial<GuiSourceFinding> &
    Pick<GuiSourceFinding, 'finding_id' | 'kind' | 'name' | 'stable_identity'>,
): GuiSourceFinding {
  const path = partial.path ?? 'web/js/apps/agent-supervisor.tsx';
  return {
    interface: GUI_SOURCE_FINDING_INTERFACE,
    schema_version: GUI_SOURCE_FINDING_SCHEMA,
    finding_id: partial.finding_id,
    kind: partial.kind,
    name: partial.name,
    stable_identity: partial.stable_identity,
    path,
    span:
      partial.span ??
      makeSourceSpan({
        path,
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: 12,
      }),
    confidence: partial.confidence ?? 'exact',
    extraction_method: partial.extraction_method ?? 'typescript_compiler_api',
    extractor_version: partial.extractor_version ?? GUI_STATIC_EXTRACTOR_VERSION,
    attributes: Object.freeze(partial.attributes ?? {}),
    evidence: partial.evidence ?? partial.name,
    requires_raw_source: partial.requires_raw_source ?? false,
    language: partial.language ?? 'tsx',
    occurrence: partial.occurrence ?? 1,
  };
}

function completeAsyncMachine(): UiStateMachine {
  const states = [
    makeUiStateDefinition({
      state_id: 'state:initial',
      kind: 'initial',
      screen_id: SCREEN,
      label: 'Initial',
      is_initial: true,
    }),
    makeUiStateDefinition({
      state_id: 'state:loading',
      kind: 'loading',
      screen_id: SCREEN,
      label: 'Loading',
    }),
    makeUiStateDefinition({
      state_id: 'state:success',
      kind: 'success',
      screen_id: SCREEN,
      label: 'Success',
      is_terminal: true,
    }),
    makeUiStateDefinition({
      state_id: 'state:failure',
      kind: 'failure',
      screen_id: SCREEN,
      label: 'Failure',
    }),
    makeUiStateDefinition({
      state_id: 'state:recovery',
      kind: 'recovery',
      screen_id: SCREEN,
      label: 'Recovery',
    }),
    makeUiStateDefinition({
      state_id: 'state:ready',
      kind: 'ready',
      screen_id: SCREEN,
      label: 'Ready',
    }),
  ];
  const events = [
    makeUiEventDefinition({
      event_id: 'event:submit',
      kind: 'submit',
      name: 'submit-goal',
    }),
    makeUiEventDefinition({
      event_id: 'event:network-success',
      kind: 'network_success',
      name: 'network-success',
    }),
    makeUiEventDefinition({
      event_id: 'event:network-failure',
      kind: 'network_failure',
      name: 'network-failure',
    }),
    makeUiEventDefinition({
      event_id: 'event:click',
      kind: 'click',
      name: 'retry',
    }),
  ];
  const transitions = [
    makeUiTransitionDefinition({
      transition_id: 'transition:initial-to-loading',
      from_state_id: 'state:initial',
      to_state_id: 'state:loading',
      event_id: 'event:submit',
      effect_ids: ['effect:dispatch'],
    }),
    makeUiTransitionDefinition({
      transition_id: 'transition:loading-to-success',
      from_state_id: 'state:loading',
      to_state_id: 'state:success',
      event_id: 'event:network-success',
      effect_ids: ['effect:dispatch'],
    }),
    makeUiTransitionDefinition({
      transition_id: 'transition:loading-to-failure',
      from_state_id: 'state:loading',
      to_state_id: 'state:failure',
      event_id: 'event:network-failure',
      effect_ids: ['effect:dispatch'],
    }),
    makeUiTransitionDefinition({
      transition_id: 'transition:failure-to-recovery',
      from_state_id: 'state:failure',
      to_state_id: 'state:recovery',
      event_id: 'event:click',
    }),
    makeUiTransitionDefinition({
      transition_id: 'transition:recovery-noop',
      from_state_id: 'state:recovery',
      to_state_id: 'state:recovery',
      event_id: 'event:submit',
      is_noop: true,
      guard: 'form.invalid',
    }),
  ];
  return extractUiStateMachineFromFacts({
    application_id: APP,
    screen_id: SCREEN,
    machine_id: 'sm:agent-supervisor',
    states,
    events,
    transitions,
    findings: [
      finding({
        finding_id: 'finding:async-1',
        kind: 'async_operation',
        name: 'dispatch',
        stable_identity: 'dispatch',
        evidence: 'async dispatch with loading success failure',
        attributes: {
          loading: 'true',
          success: 'true',
          failure: 'true',
        },
      }),
      finding({
        finding_id: 'finding:state-ready',
        kind: 'state',
        name: 'ready',
        stable_identity: 'state-finding-ready',
        evidence: 'conditional render ready && content',
        attributes: { conditional: 'true' },
        span: makeSourceSpan({
          path: 'web/js/apps/agent-supervisor.tsx',
          start_line: 40,
          start_column: 4,
          end_line: 48,
          end_column: 5,
        }),
      }),
    ],
    conditional_render_spans: [
      {
        path: 'web/js/apps/agent-supervisor.tsx',
        start_line: 12,
        start_column: 2,
        end_line: 18,
        end_column: 3,
        observed_state_kind: 'loading',
        evidence: 'status === "loading" ? <Spinner /> : null',
      },
    ],
  });
}

describe('UiStateMachineExtractor@1 surface (VGO-016)', () => {
  it('exports sealed interface, schema, extractor version, and closed vocabularies', () => {
    expect(UI_STATE_MACHINE_EXTRACTOR_INTERFACE).toBe(
      'UiStateMachineExtractor@1',
    );
    expect(UI_STATE_MACHINE_EXTRACTOR_SCHEMA).toBe(
      'ui-state-machine-extractor/v1',
    );
    expect(UI_STATE_MACHINE_INTERFACE).toBe('UiStateMachine@1');
    expect(UI_STATE_MACHINE_SCHEMA).toBe('ui-state-machine/v1');
    expect(UI_STATE_DEFINITION_INTERFACE).toBe('UiStateDefinition@1');
    expect(UI_STATE_DEFINITION_SCHEMA).toBe('ui-state-definition/v1');
    expect(UI_EVENT_DEFINITION_INTERFACE).toBe('UiEventDefinition@1');
    expect(UI_EVENT_DEFINITION_SCHEMA).toBe('ui-event-definition/v1');
    expect(UI_TRANSITION_DEFINITION_INTERFACE).toBe('UiTransitionDefinition@1');
    expect(UI_TRANSITION_DEFINITION_SCHEMA).toBe('ui-transition-definition/v1');
    expect(UI_STATE_MACHINE_EXTRACTOR_VERSION).toBe(
      'gui-state-machine-extractor@1.0.0',
    );
    expect(CANONICAL_JSON_PROFILE).toBe('gui-optimizer-canonical-json/v1');

    expect([...UI_STATE_KINDS]).toEqual([
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
    ]);
    expect([...UI_EVENT_KINDS]).toEqual(
      expect.arrayContaining([
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
      ]),
    );

    const extractor = createUiStateMachineExtractor();
    expect(extractor.interface).toBe(UI_STATE_MACHINE_EXTRACTOR_INTERFACE);
    expect(extractor.extractorVersion).toBe(UI_STATE_MACHINE_EXTRACTOR_VERSION);
  });

  it('decodes closed wire records and rejects unknown fields / invalid enums', () => {
    const state = decodeUiStateDefinition({
      interface: UI_STATE_DEFINITION_INTERFACE,
      schema_version: UI_STATE_DEFINITION_SCHEMA,
      state_id: 'state:ready',
      kind: 'ready',
      screen_id: SCREEN,
      label: 'Ready',
      is_initial: true,
      is_terminal: false,
      description: 'ready state',
    });
    expect(state.state_id).toBe('state:ready');
    expect(state.kind).toBe('ready');

    expect(() =>
      decodeUiStateDefinition({
        interface: UI_STATE_DEFINITION_INTERFACE,
        schema_version: UI_STATE_DEFINITION_SCHEMA,
        state_id: 'state:ready',
        kind: 'mystery',
        screen_id: SCREEN,
        label: '',
        is_initial: false,
        is_terminal: false,
        description: '',
      }),
    ).toThrow(/kind must be one of/);

    expect(() =>
      decodeUiEventDefinition({
        interface: UI_EVENT_DEFINITION_INTERFACE,
        schema_version: UI_EVENT_DEFINITION_SCHEMA,
        event_id: 'event:submit',
        kind: 'submit',
        name: 'submit',
        description: '',
        extra: true,
      }),
    ).toThrow(/unknown UiEventDefinition field/);

    expect(() =>
      decodeUiTransitionDefinition({
        interface: UI_TRANSITION_DEFINITION_INTERFACE,
        schema_version: UI_TRANSITION_DEFINITION_SCHEMA,
        transition_id: 'transition:bad-noop',
        from_state_id: 'state:ready',
        to_state_id: 'state:loading',
        event_id: 'event:submit',
        guard: '',
        effect_ids: [],
        is_noop: true,
      }),
    ).toThrow(/is_noop transitions must keep to_state_id equal to from_state_id/);
  });
});

describe('extraction and acceptance', () => {
  it('extracts a bounded machine with reachability and conditional-render spans', () => {
    const machine = completeAsyncMachine();
    expect(machine.interface).toBe(UI_STATE_MACHINE_INTERFACE);
    expect(machine.application_id).toBe(APP);
    expect(machine.screen_id).toBe(SCREEN);
    expect(machine.initial_state_id).toBe('state:initial');
    expect(machine.executed_code).toBe(false);
    expect(machine.states.map(s => s.kind)).toEqual(
      expect.arrayContaining([
        'initial',
        'loading',
        'ready',
        'success',
        'failure',
        'recovery',
      ]),
    );
    expect(machine.events.map(e => e.kind)).toEqual(
      expect.arrayContaining([
        'submit',
        'network_success',
        'network_failure',
        'click',
      ]),
    );
    expect(machine.reachability.reachable_state_ids).toEqual(
      expect.arrayContaining([
        'state:initial',
        'state:loading',
        'state:success',
        'state:failure',
        'state:recovery',
      ]),
    );
    // ready is declared but not transition-reachable from initial in this fixture
    expect(machine.reachability.unreachable_state_ids).toContain('state:ready');
    expect(machine.conditional_render_spans.length).toBeGreaterThanOrEqual(1);
    expect(
      machine.conditional_render_spans.some(
        span => span.observed_state_kind === 'loading',
      ),
    ).toBe(true);
    expect(
      machine.conditional_render_spans.some(
        span => span.observed_state_kind === 'ready',
      ),
    ).toBe(true);

    const validation = validateUiStateMachine(machine);
    expect(validation.ok).toBe(true);
  });

  it('rejects undefined transition destinations', () => {
    expect(() =>
      extractUiStateMachineFromFacts({
        application_id: APP,
        screen_id: SCREEN,
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
            transition_id: 'transition:to-missing',
            from_state_id: 'state:ready',
            to_state_id: 'state:missing',
            event_id: 'event:submit',
          }),
        ],
      }),
    ).toThrow(/undefined transition destination: state:missing/);
  });

  it('distinguishes explicit no-ops from absent outcomes', () => {
    const machine = completeAsyncMachine();

    const noop = lookupTransitionOutcomes(
      machine,
      'state:recovery',
      'event:submit',
    );
    expect(noop.status).toBe('noop');
    expect(noop.transitions).toHaveLength(1);
    expect(noop.transitions[0].is_noop).toBe(true);
    expect(noop.transitions[0].from_state_id).toBe(
      noop.transitions[0].to_state_id,
    );

    const present = lookupTransitionOutcomes(
      machine,
      'state:initial',
      'event:submit',
    );
    expect(present.status).toBe('transition');
    expect(present.transitions[0].is_noop).toBe(false);

    const absent = lookupTransitionOutcomes(
      machine,
      'state:success',
      'event:submit',
    );
    expect(absent.status).toBe('absent');
    expect(absent.transitions).toEqual([]);
    // Absence is not validation failure; only undefined destinations / async gaps fail.
    expect(validateUiStateMachine(machine).ok).toBe(true);
  });

  it('requires async effects to expose loading/success/failure or records a violation', () => {
    const incomplete = extractUiStateMachineFromFacts({
      application_id: APP,
      screen_id: SCREEN,
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
      transitions: [],
      findings: [
        finding({
          finding_id: 'finding:async-bare',
          kind: 'async_operation',
          name: 'fetchGoals',
          stable_identity: 'fetchGoals',
          evidence: 'fetch(/api/goals)',
        }),
      ],
    });

    expect(incomplete.async_effects).toHaveLength(1);
    expect(incomplete.async_effects[0].complete).toBe(false);
    expect(
      incomplete.violations.some(v => v.code === 'async_effect_incomplete'),
    ).toBe(true);
    expect(
      incomplete.unresolved.some(u => u.startsWith('async-incomplete:')),
    ).toBe(true);
    const validation = validateUiStateMachine(incomplete);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some(i => i.code === 'async_effect_incomplete')).toBe(
      true,
    );

    const complete = completeAsyncMachine();
    expect(complete.async_effects.every(effect => effect.complete)).toBe(true);
    expect(
      complete.violations.some(v => v.code === 'async_effect_incomplete'),
    ).toBe(false);
    expect(validateUiStateMachine(complete).ok).toBe(true);
  });

  it('is deterministic across repeated extractions', () => {
    const first = completeAsyncMachine();
    const second = completeAsyncMachine();
    expect(serializeUiStateMachine(first)).toBe(serializeUiStateMachine(second));
    expect(stateMachineDigest(first)).toBe(stateMachineDigest(second));
    expect(canonicalJson(first.reachability)).toBe(
      canonicalJson(second.reachability),
    );
  });

  it('derives only source-supported states/events and leaves unsupported names unresolved', () => {
    const machine = extractUiStateMachineFromFacts({
      application_id: APP,
      screen_id: SCREEN,
      findings: [
        finding({
          finding_id: 'finding:loading',
          kind: 'state',
          name: 'isLoading',
          stable_identity: 'state/isLoading',
          evidence: 'const isLoading = true',
        }),
        finding({
          finding_id: 'finding:mystery',
          kind: 'state',
          name: 'widgetPhase',
          stable_identity: 'state/widgetPhase',
          evidence: 'phase token without closed kind',
        }),
        finding({
          finding_id: 'finding:click',
          kind: 'button',
          name: 'Retry',
          stable_identity: 'button/retry',
          evidence: 'onClick retry',
        }),
        finding({
          finding_id: 'finding:unknown-handler',
          kind: 'event_handler',
          name: 'onWeird',
          stable_identity: 'handler/onWeird',
          evidence: 'custom proprietary gesture',
        }),
      ],
    });

    expect(machine.states.some(s => s.kind === 'loading')).toBe(true);
    expect(machine.events.some(e => e.kind === 'click')).toBe(true);
    // No invented transitions from findings alone.
    expect(machine.transitions).toEqual([]);
    expect(
      machine.unresolved.some(u => u.startsWith('state-unknown:')),
    ).toBe(true);
    expect(
      machine.unresolved.some(u => u.startsWith('event-unknown:')),
    ).toBe(true);
  });

  it('builds reachability graphs and unresolved-transition reports without inventing edges', () => {
    const states = [
      makeUiStateDefinition({
        state_id: 'state:ready',
        kind: 'ready',
        screen_id: SCREEN,
        is_initial: true,
      }),
      makeUiStateDefinition({
        state_id: 'state:confirmation',
        kind: 'confirmation',
        screen_id: SCREEN,
      }),
      makeUiStateDefinition({
        state_id: 'state:disabled',
        kind: 'disabled',
        screen_id: SCREEN,
      }),
    ];
    const transitions = [
      makeUiTransitionDefinition({
        transition_id: 'transition:ready-to-confirmation',
        from_state_id: 'state:ready',
        to_state_id: 'state:confirmation',
        event_id: 'event:click',
      }),
    ];
    const graph = buildReachabilityGraph('state:ready', states, transitions);
    expect(graph.reachable_state_ids).toEqual([
      'state:confirmation',
      'state:ready',
    ]);
    expect(graph.unreachable_state_ids).toEqual(['state:disabled']);
    expect(graph.edges).toHaveLength(1);

    const machine = extractUiStateMachineFromFacts({
      application_id: APP,
      screen_id: SCREEN,
      states,
      events: [
        makeUiEventDefinition({
          event_id: 'event:click',
          kind: 'click',
          name: 'open-confirm',
        }),
        makeUiEventDefinition({
          event_id: 'event:escape',
          kind: 'escape',
          name: 'escape',
        }),
      ],
      transitions,
    });
    // Event exists in confirmation but no transition was provided — absent, not invented.
    const absentEscape = lookupTransitionOutcomes(
      machine,
      'state:confirmation',
      'event:escape',
    );
    expect(absentEscape.status).toBe('absent');
    expect(machine.transitions).toHaveLength(1);
  });

  it('reports nonterminal failure without recovery as unresolved', () => {
    const machine = extractUiStateMachineFromFacts({
      application_id: APP,
      screen_id: SCREEN,
      states: [
        makeUiStateDefinition({
          state_id: 'state:ready',
          kind: 'ready',
          screen_id: SCREEN,
          is_initial: true,
        }),
        makeUiStateDefinition({
          state_id: 'state:failure',
          kind: 'failure',
          screen_id: SCREEN,
          is_terminal: false,
        }),
      ],
      events: [
        makeUiEventDefinition({
          event_id: 'event:network-failure',
          kind: 'network_failure',
          name: 'network-failure',
        }),
      ],
      transitions: [
        makeUiTransitionDefinition({
          transition_id: 'transition:ready-to-failure',
          from_state_id: 'state:ready',
          to_state_id: 'state:failure',
          event_id: 'event:network-failure',
        }),
      ],
    });
    expect(
      machine.unresolved.some(u =>
        u.startsWith('failure-without-recovery:state:failure'),
      ),
    ).toBe(true);
    expect(machine.completeness_boundary).toBe('partial');
  });
});

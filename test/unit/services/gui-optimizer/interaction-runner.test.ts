/**
 * VGO-034 — deterministic interaction and focus tracing tests.
 *
 * Acceptance:
 * - Reruns with identical fixture inputs yield the same normalized trace identity
 * - Undefined transitions and focus loss are visible
 * - Confirmation grant/deny and unavailable/recovery paths remain distinct
 * - Fixture scenarios are driven through browser-visible interfaces only
 * - Policy/confirmation/service boundaries are never bypassed to manufacture success
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { CANONICAL_JSON_PROFILE } from '../../../../src/services/gui-optimizer/models.js';
import {
  EVIDENCE_LEVELS,
  INTERACTION_RECEIPT_INTERFACE,
  INTERACTION_RECEIPT_SCHEMA,
  UI_FOCUS_TRACE_INTERFACE,
  UI_FOCUS_TRACE_SCHEMA,
  UI_INTERACTION_RUNNER_INTERFACE,
  UI_INTERACTION_RUNNER_SCHEMA,
  UI_INTERACTION_RUNNER_VERSION,
  UI_INTERACTION_STEP_KINDS,
  createUiInteractionRunner,
  decodeInteractionReceipt,
  focusTraceDigest,
  hasVisibleFocusLoss,
  hasVisibleUndefinedTransition,
  interactionReceiptDigest,
  interactionTraceDigest,
  makeInteractionReceipt,
  makeUiInteractionStepInput,
  makeUiVisibleControl,
  pathKindsDistinct,
  runInteractionScenario,
  type UiInteractionRunRequest,
  type UiInteractionStepInput,
} from '../../../../src/services/gui-optimizer/interaction-runner.js';
import {
  makeUiActionBinding,
} from '../../../../src/services/gui-optimizer/policy-validator.js';
import {
  extractUiStateMachineFromFacts,
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
  type UiStateMachine,
} from '../../../../src/services/gui-optimizer/state-machine.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const REVISION = 'deadbeefcafebabe';

function buildMachine(): UiStateMachine {
  return extractUiStateMachineFromFacts({
    application_id: APP,
    screen_id: SCREEN,
    machine_id: 'sm:agent-supervisor:interaction',
    states: [
      makeUiStateDefinition({
        state_id: 'state:ready',
        kind: 'ready',
        screen_id: SCREEN,
        label: 'Ready',
        is_initial: true,
      }),
      makeUiStateDefinition({
        state_id: 'state:confirmation',
        kind: 'confirmation',
        screen_id: SCREEN,
        label: 'Confirm',
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
        state_id: 'state:recovery',
        kind: 'recovery',
        screen_id: SCREEN,
        label: 'Recovery',
      }),
      makeUiStateDefinition({
        state_id: 'state:failure',
        kind: 'failure',
        screen_id: SCREEN,
        label: 'Failure',
        is_terminal: true,
      }),
      makeUiStateDefinition({
        state_id: 'state:unavailable',
        kind: 'unavailable',
        screen_id: SCREEN,
        label: 'Unavailable',
        is_terminal: true,
      }),
    ],
    events: [
      makeUiEventDefinition({
        event_id: 'event:focus',
        kind: 'focus',
        name: 'focus',
      }),
      makeUiEventDefinition({
        event_id: 'event:keyboard-activation',
        kind: 'keyboard_activation',
        name: 'keyboard-activation',
      }),
      makeUiEventDefinition({
        event_id: 'event:submit',
        kind: 'submit',
        name: 'submit',
      }),
      makeUiEventDefinition({
        event_id: 'event:confirmation-grant',
        kind: 'confirmation_grant',
        name: 'confirmation-grant',
      }),
      makeUiEventDefinition({
        event_id: 'event:confirmation-denial',
        kind: 'confirmation_denial',
        name: 'confirmation-denial',
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
        event_id: 'event:service-unavailable',
        kind: 'service_unavailable',
        name: 'service-unavailable',
      }),
      makeUiEventDefinition({
        event_id: 'event:click',
        kind: 'click',
        name: 'retry',
      }),
      makeUiEventDefinition({
        event_id: 'event:escape',
        kind: 'escape',
        name: 'escape',
      }),
    ],
    transitions: [
      makeUiTransitionDefinition({
        transition_id: 't:ready-to-confirmation',
        from_state_id: 'state:ready',
        to_state_id: 'state:confirmation',
        event_id: 'event:submit',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:confirm-grant-to-loading',
        from_state_id: 'state:confirmation',
        to_state_id: 'state:loading',
        event_id: 'event:confirmation-grant',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:confirm-deny-to-ready',
        from_state_id: 'state:confirmation',
        to_state_id: 'state:ready',
        event_id: 'event:confirmation-denial',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:loading-to-success',
        from_state_id: 'state:loading',
        to_state_id: 'state:success',
        event_id: 'event:network-success',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:loading-to-recovery',
        from_state_id: 'state:loading',
        to_state_id: 'state:recovery',
        event_id: 'event:network-failure',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:ready-to-unavailable',
        from_state_id: 'state:ready',
        to_state_id: 'state:unavailable',
        event_id: 'event:service-unavailable',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:recovery-to-ready',
        from_state_id: 'state:recovery',
        to_state_id: 'state:ready',
        event_id: 'event:click',
      }),
      makeUiTransitionDefinition({
        transition_id: 't:confirm-escape-noop',
        from_state_id: 'state:confirmation',
        to_state_id: 'state:confirmation',
        event_id: 'event:escape',
        is_noop: true,
      }),
    ],
  });
}

function visibleControls() {
  return [
    makeUiVisibleControl({
      control_id: 'control:prompt-input',
      role: 'textbox',
      action_id: '',
    }),
    makeUiVisibleControl({
      control_id: 'control:submit',
      role: 'button',
      action_id: 'action:dispatch',
    }),
    makeUiVisibleControl({
      control_id: 'control:confirm-grant',
      role: 'button',
      action_id: 'action:dispatch',
      modal_id: 'modal:confirm',
    }),
    makeUiVisibleControl({
      control_id: 'control:confirm-deny',
      role: 'button',
      action_id: '',
      modal_id: 'modal:confirm',
    }),
    makeUiVisibleControl({
      control_id: 'control:retry',
      role: 'button',
      action_id: '',
    }),
    makeUiVisibleControl({
      control_id: 'control:hidden-dispatch',
      role: 'button',
      visible: false,
      action_id: 'action:dispatch',
    }),
  ];
}

function dispatchBinding(requiresConfirmation = true) {
  return makeUiActionBinding({
    action_id: 'action:dispatch',
    method: 'dispatch_goal',
    schema_id: 'schema:dispatch-goal/v1',
    requires_confirmation: requiresConfirmation,
    confirmation_id: 'confirm:dispatch',
    policy_id: 'policy:agent-supervisor',
    component_id: 'comp:goal-form',
    is_destructive: requiresConfirmation,
  });
}

function baseRequest(
  steps: readonly UiInteractionStepInput[],
  overrides: Partial<UiInteractionRunRequest> = {},
): UiInteractionRunRequest {
  return {
    application_id: APP,
    screen_id: SCREEN,
    scenario_id: 'scenario:keyboard-only',
    repository_revision: REVISION,
    steps,
    state_machine: buildMachine(),
    action_bindings: [dispatchBinding(true)],
    visible_controls: visibleControls(),
    expected_terminal_states: ['state:ready', 'state:success'],
    initial_focus_id: '',
    ...overrides,
  };
}

function keyboardOnlySteps(
  wallBase = 1_700_000_000_000,
): UiInteractionStepInput[] {
  return [
    makeUiInteractionStepInput({
      step_id: 'step:focus-input',
      kind: 'focus',
      target_control_id: 'control:prompt-input',
      keyboard: true,
      wall_timestamp_ms: wallBase,
    }),
    makeUiInteractionStepInput({
      step_id: 'step:tab-submit',
      kind: 'tab',
      target_control_id: 'control:submit',
      expected_focus_id: 'control:submit',
      keyboard: true,
      wall_timestamp_ms: wallBase + 17,
    }),
    makeUiInteractionStepInput({
      step_id: 'step:activate-submit',
      kind: 'keyboard_activation',
      target_control_id: 'control:submit',
      // Keyboard reachability/activation observation only — no privileged
      // dispatch without a confirmation path in this scenario.
      keyboard: true,
      wall_timestamp_ms: wallBase + 42,
    }),
  ];
}

describe('UiInteractionRunner@1 (VGO-034)', () => {
  it('exports sealed interface and schema identities', () => {
    expect(UI_INTERACTION_RUNNER_INTERFACE).toBe('UiInteractionRunner@1');
    expect(UI_INTERACTION_RUNNER_SCHEMA).toBe('ui-interaction-runner/v1');
    expect(INTERACTION_RECEIPT_INTERFACE).toBe('InteractionReceipt@1');
    expect(INTERACTION_RECEIPT_SCHEMA).toBe('interaction-receipt/v1');
    expect(UI_FOCUS_TRACE_INTERFACE).toBe('UiFocusTrace@1');
    expect(UI_FOCUS_TRACE_SCHEMA).toBe('ui-focus-trace/v1');
    expect(UI_INTERACTION_RUNNER_VERSION).toBe('gui-interaction-runner@1.0.0');
    expect(CANONICAL_JSON_PROFILE).toBe('gui-optimizer-canonical-json/v1');
    expect(EVIDENCE_LEVELS).toContain('simulated');
    expect(UI_INTERACTION_STEP_KINDS).toContain('keyboard_activation');
  });

  it('creates a runner that returns InteractionReceipt@1 and UiFocusTrace@1', () => {
    const runner = createUiInteractionRunner();
    expect(runner.interface).toBe(UI_INTERACTION_RUNNER_INTERFACE);
    expect(runner.schema_version).toBe(UI_INTERACTION_RUNNER_SCHEMA);
    expect(runner.runnerVersion).toBe(UI_INTERACTION_RUNNER_VERSION);

    const result = runner.run(baseRequest(keyboardOnlySteps()));
    expect(result.receipt.interface).toBe(INTERACTION_RECEIPT_INTERFACE);
    expect(result.receipt.schema_version).toBe(INTERACTION_RECEIPT_SCHEMA);
    expect(result.focus_trace.interface).toBe(UI_FOCUS_TRACE_INTERFACE);
    expect(result.focus_trace.schema_version).toBe(UI_FOCUS_TRACE_SCHEMA);
    expect(result.trace.privileged_host_invocation).toBe(false);
    expect(result.receipt.step_ids).toEqual([
      'step:focus-input',
      'step:tab-submit',
      'step:activate-submit',
    ]);
    expect(result.receipt.focus_sequence).toEqual([
      'control:prompt-input',
      'control:submit',
    ]);
    expect(result.trace.terminal_state_id).toBe('state:ready');
    expect(result.trace.steps.every(s => s.keyboard || s.kind === 'focus')).toBe(
      true,
    );
  });

  it('records action method/schema references on confirmed dispatch', () => {
    const result = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:submit',
            kind: 'submit',
            target_control_id: 'control:submit',
            event_id: 'event:submit',
            action_id: 'action:dispatch',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:grant',
            kind: 'confirmation_grant',
            target_control_id: 'control:confirm-grant',
            event_id: 'event:confirmation-grant',
            confirmation_id: 'confirm:dispatch',
            action_id: 'action:dispatch',
          }),
        ],
        {
          scenario_id: 'scenario:confirmation-grant',
          expected_terminal_states: ['state:loading'],
        },
      ),
    );
    const granted = result.action_invocations.find(
      inv => inv.step_id === 'step:grant',
    );
    expect(granted?.allowed).toBe(true);
    expect(granted?.method).toBe('dispatch_goal');
    expect(granted?.schema_id).toBe('schema:dispatch-goal/v1');
    expect(result.receipt.action_invocation_ids.length).toBeGreaterThan(0);
  });

  it('yields the same normalized trace identity across reruns with different wall clocks', () => {
    const first = runInteractionScenario(
      baseRequest(keyboardOnlySteps(1_700_000_000_000)),
    );
    const second = runInteractionScenario(
      baseRequest(keyboardOnlySteps(9_999_999_999_999)),
    );

    expect(first.normalized_trace_identity).toBe(
      second.normalized_trace_identity,
    );
    expect(first.receipt_identity).toBe(second.receipt_identity);
    expect(first.focus_trace_identity).toBe(second.focus_trace_identity);
    expect(interactionTraceDigest(first.trace)).toBe(
      interactionTraceDigest(second.trace),
    );
    expect(interactionReceiptDigest(first.receipt)).toBe(
      interactionReceiptDigest(second.receipt),
    );
    expect(focusTraceDigest(first.focus_trace)).toBe(
      focusTraceDigest(second.focus_trace),
    );

    // Relative timestamps are normalized, not absolute wall clocks.
    expect(first.trace.steps.map(s => s.relative_timestamp_ms)).toEqual([
      0, 17, 42,
    ]);
    expect(second.trace.steps.map(s => s.relative_timestamp_ms)).toEqual([
      0, 17, 42,
    ]);
  });

  it('makes undefined transitions visible without inventing destinations', () => {
    const steps = [
      makeUiInteractionStepInput({
        step_id: 'step:undefined-event',
        kind: 'click',
        target_control_id: 'control:submit',
        // No transition from ready on keyboard-activation alone in this path.
        event_id: 'event:keyboard-activation',
      }),
    ];
    const result = runInteractionScenario(
      baseRequest(steps, {
        scenario_id: 'scenario:undefined-transition',
        expected_terminal_states: ['state:ready'],
      }),
    );

    expect(hasVisibleUndefinedTransition(result)).toBe(true);
    expect(result.trace.undefined_transition_step_ids).toContain(
      'step:undefined-event',
    );
    expect(
      result.receipt.unresolved_observation_ids.some(id =>
        id.includes('undefined-transition'),
      ),
    ).toBe(true);
    expect(result.trace.terminal_state_id).toBe('state:ready');
    expect(result.trace.steps[0]?.transition_status).toBe('undefined');
    expect(result.receipt.verification_status).toBe('unverified');
  });

  it('makes focus loss visible in the focus trace', () => {
    const steps = [
      makeUiInteractionStepInput({
        step_id: 'step:focus-input',
        kind: 'focus',
        target_control_id: 'control:prompt-input',
      }),
      makeUiInteractionStepInput({
        step_id: 'step:focus-lost',
        kind: 'blur',
        target_control_id: 'control:prompt-input',
        expected_focus_id: '',
        notes: 'focus_loss',
      }),
    ];
    const result = runInteractionScenario(
      baseRequest(steps, {
        scenario_id: 'scenario:focus-loss',
        expected_terminal_states: ['state:ready'],
      }),
    );

    expect(hasVisibleFocusLoss(result)).toBe(true);
    expect(result.focus_trace.has_focus_loss).toBe(true);
    expect(result.focus_trace.focus_loss_step_ids).toContain('step:focus-lost');
    expect(result.trace.focus_loss_step_ids).toContain('step:focus-lost');
    expect(
      result.receipt.unresolved_observation_ids.some(id =>
        id.includes('focus-loss'),
      ),
    ).toBe(true);
    expect(result.focus_trace.final_focus_id).toBe('');
  });

  it('keeps confirmation grant and deny paths distinct', () => {
    const grant = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:submit',
            kind: 'submit',
            target_control_id: 'control:submit',
            event_id: 'event:submit',
            action_id: 'action:dispatch',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:grant',
            kind: 'confirmation_grant',
            target_control_id: 'control:confirm-grant',
            event_id: 'event:confirmation-grant',
            confirmation_id: 'confirm:dispatch',
            action_id: 'action:dispatch',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:network-ok',
            kind: 'service_outcome',
            event_id: 'event:network-success',
            service_outcome: 'success',
          }),
        ],
        {
          scenario_id: 'scenario:confirmation-grant',
          expected_terminal_states: ['state:success'],
        },
      ),
    );

    const deny = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:submit',
            kind: 'submit',
            target_control_id: 'control:submit',
            event_id: 'event:submit',
            action_id: 'action:dispatch',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:deny',
            kind: 'confirmation_denial',
            target_control_id: 'control:confirm-deny',
            event_id: 'event:confirmation-denial',
            confirmation_id: 'confirm:dispatch',
          }),
        ],
        {
          scenario_id: 'scenario:confirmation-deny',
          expected_terminal_states: ['state:ready'],
        },
      ),
    );

    expect(grant.trace.path_kind).toBe('confirmation_grant');
    expect(deny.trace.path_kind).toBe('confirmation_deny');
    expect(pathKindsDistinct(grant, deny)).toBe(true);
    expect(grant.trace.terminal_state_id).toBe('state:success');
    expect(deny.trace.terminal_state_id).toBe('state:ready');
    expect(grant.receipt.confirmation_id).toBe('confirm:dispatch');
    expect(deny.receipt.confirmation_id).toBe('confirm:dispatch');
    expect(grant.normalized_trace_identity).not.toBe(
      deny.normalized_trace_identity,
    );
  });

  it('keeps unavailable and recovery paths distinct', () => {
    const unavailable = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:service-down',
            kind: 'service_outcome',
            event_id: 'event:service-unavailable',
            service_outcome: 'service_unavailable',
          }),
        ],
        {
          scenario_id: 'scenario:service-unavailable',
          expected_terminal_states: ['state:unavailable'],
        },
      ),
    );

    const recovery = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:submit',
            kind: 'submit',
            target_control_id: 'control:submit',
            event_id: 'event:submit',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:grant',
            kind: 'confirmation_grant',
            target_control_id: 'control:confirm-grant',
            event_id: 'event:confirmation-grant',
            confirmation_id: 'confirm:dispatch',
            action_id: 'action:dispatch',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:network-fail',
            kind: 'service_outcome',
            event_id: 'event:network-failure',
            service_outcome: 'recoverable_error',
          }),
        ],
        {
          scenario_id: 'scenario:recoverable-failure',
          expected_terminal_states: ['state:recovery'],
        },
      ),
    );

    expect(unavailable.trace.path_kind).toBe('unavailable');
    expect(recovery.trace.path_kind).toBe('recovery');
    expect(pathKindsDistinct(unavailable, recovery)).toBe(true);
    expect(unavailable.trace.terminal_state_id).toBe('state:unavailable');
    expect(recovery.trace.terminal_state_id).toBe('state:recovery');
    expect(recovery.receipt.recovery_ids.length).toBeGreaterThan(0);
    expect(unavailable.receipt.recovery_ids).toEqual([]);
  });

  it('never manufactures success by bypassing confirmation or hidden controls', () => {
    const blockedConfirmation = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:submit-without-confirm',
            kind: 'submit',
            target_control_id: 'control:submit',
            event_id: 'event:submit',
            action_id: 'action:dispatch',
          }),
        ],
        {
          scenario_id: 'scenario:blocked-confirmation',
          expected_terminal_states: ['state:confirmation'],
          attempt_boundary_bypass: true,
        },
      ),
    );

    // Submit moves to confirmation, but action invocation remains blocked
    // until grant; bypass attempt is recorded and rejected.
    expect(blockedConfirmation.trace.bypass_attempt_ids.length).toBeGreaterThan(
      0,
    );
    expect(
      blockedConfirmation.receipt.unresolved_observation_ids.some(id =>
        id.includes('bypass'),
      ),
    ).toBe(true);
    expect(blockedConfirmation.action_invocations[0]?.allowed).toBe(false);
    expect(blockedConfirmation.action_invocations[0]?.blocked_reason).toBe(
      'confirmation_required',
    );

    const hidden = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:hidden',
            kind: 'click',
            target_control_id: 'control:hidden-dispatch',
            event_id: 'event:submit',
            action_id: 'action:dispatch',
          }),
        ],
        {
          scenario_id: 'scenario:hidden-control',
          expected_terminal_states: ['state:ready'],
        },
      ),
    );
    expect(hidden.trace.steps[0]?.transition_status).toBe('blocked_not_visible');
    expect(hidden.trace.terminal_state_id).toBe('state:ready');
    expect(
      hidden.receipt.unresolved_observation_ids.some(id =>
        id.includes('hidden-control'),
      ),
    ).toBe(true);
  });

  it('records modal focus trap and restoration', () => {
    const result = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:open-modal',
            kind: 'focus',
            target_control_id: 'control:confirm-grant',
            expected_focus_id: 'control:confirm-grant',
            modal_id: 'modal:confirm',
          }),
          makeUiInteractionStepInput({
            step_id: 'step:trap-tab',
            kind: 'tab',
            // Outside the modal — must trap.
            target_control_id: 'control:retry',
            expected_focus_id: 'control:retry',
            keyboard: true,
          }),
          makeUiInteractionStepInput({
            step_id: 'step:escape-restore',
            kind: 'escape',
            // Focus restoration only; no state-machine event required here.
            keyboard: true,
          }),
        ],
        {
          scenario_id: 'scenario:modal-focus',
          initial_focus_id: 'control:submit',
          expected_terminal_states: ['state:ready'],
        },
      ),
    );

    expect(result.focus_trace.has_focus_trap).toBe(true);
    expect(result.focus_trace.trap_step_ids).toContain('step:trap-tab');
    expect(result.focus_trace.restoration_step_ids).toContain(
      'step:escape-restore',
    );
    // Escape restores initiating focus.
    expect(result.focus_trace.final_focus_id).toBe('control:submit');
  });

  it('round-trips InteractionReceipt@1 through the closed decoder', () => {
    const result = runInteractionScenario(baseRequest(keyboardOnlySteps()));
    const decoded = decodeInteractionReceipt(
      JSON.parse(JSON.stringify(result.receipt)),
    );
    expect(decoded).toEqual(result.receipt);
    expect(interactionReceiptDigest(decoded)).toBe(result.receipt_identity);
  });

  it('rejects unknown InteractionReceipt fields and invalid enums', () => {
    expect(() =>
      decodeInteractionReceipt({
        ...makeInteractionReceipt({
          receipt_id: 'receipt:interaction-1',
          application_id: APP,
          screen_id: SCREEN,
          scenario_id: 'scenario:keyboard-only',
          repository_revision: REVISION,
        }),
        extra: true,
      }),
    ).toThrow(/unknown InteractionReceipt field/);

    expect(() =>
      makeInteractionReceipt({
        receipt_id: 'receipt:interaction-1',
        application_id: APP,
        screen_id: SCREEN,
        scenario_id: 'scenario:keyboard-only',
        repository_revision: REVISION,
        evidence_level: 'not-a-level' as never,
      }),
    ).toThrow(/evidence_level/);
  });

  it('asserts terminal-state match against expected scenario terminals', () => {
    const matched = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:down',
            kind: 'service_outcome',
            event_id: 'event:service-unavailable',
            service_outcome: 'service_unavailable',
          }),
        ],
        {
          scenario_id: 'scenario:service-unavailable',
          expected_terminal_states: ['state:unavailable'],
        },
      ),
    );
    expect(matched.trace.terminal_matched).toBe(true);

    const mismatched = runInteractionScenario(
      baseRequest(
        [
          makeUiInteractionStepInput({
            step_id: 'step:down',
            kind: 'service_outcome',
            event_id: 'event:service-unavailable',
            service_outcome: 'service_unavailable',
          }),
        ],
        {
          scenario_id: 'scenario:service-unavailable',
          expected_terminal_states: ['state:success'],
        },
      ),
    );
    expect(mismatched.trace.terminal_matched).toBe(false);
    expect(
      mismatched.receipt.unresolved_observation_ids.some(id =>
        id.includes('terminal-mismatch'),
      ),
    ).toBe(true);
  });
});

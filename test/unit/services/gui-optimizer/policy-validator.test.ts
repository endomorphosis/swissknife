/**
 * VGO-023 — policy and action-binding validation at the UI boundary.
 *
 * Acceptance:
 * - Ambiguous/dynamic bindings are unresolved or review-required
 * - UI visibility never proves permission
 * - Any dispatchable prohibited/disabled action or stale/exact-confirmation
 *   failure blocks automatic acceptance
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_JSON_PROFILE,
  makeSourceSpan,
} from '../../../../src/services/gui-optimizer/models.js';
import {
  BLOCKING_REASON_CODES,
  REVIEW_REQUIRED_REASON_CODES,
  UI_ACTION_BINDING_INTERFACE,
  UI_ACTION_BINDING_SCHEMA,
  UI_CONFIRMATION_BINDING_INTERFACE,
  UI_CONFIRMATION_BINDING_SCHEMA,
  UI_POLICY_BINDING_REPORT_INTERFACE,
  UI_POLICY_BINDING_REPORT_SCHEMA,
  UI_POLICY_BINDING_VALIDATOR_INTERFACE,
  UI_POLICY_BINDING_VALIDATOR_SCHEMA,
  UI_POLICY_BINDING_VALIDATOR_VERSION,
  allowsAutomaticAcceptance,
  argumentDigestFromPayload,
  canonicalJson,
  createUiPolicyBindingValidator,
  decodeUiActionBinding,
  decodeUiConfirmationBinding,
  exactConfirmationBinding,
  makeUiActionBinding,
  makeUiConfirmationBinding,
  policyBindingReportDigest,
  presentationDoesNotAuthorize,
  serializeUiPolicyBindingReport,
  validatePolicyBindings,
  type UiActionBindingEvidence,
  type UiActionRuntimeObservation,
  type UiConfirmationBinding,
  type UiPolicyBindingReport,
} from '../../../../src/services/gui-optimizer/policy-validator.js';

const APP = 'app:agent-supervisor';
const SCREEN = 'screen:agent-supervisor';
const DIGEST_A = argumentDigestFromPayload({ goal: 'optimize-focus' });
const DIGEST_B = argumentDigestFromPayload({ goal: 'other-goal' });

function span(startLine = 10) {
  return makeSourceSpan({
    path: 'web/js/apps/agent-supervisor.tsx',
    start_line: startLine,
    start_column: 2,
    end_line: startLine + 4,
    end_column: 3,
  });
}

function exactEvidence(
  actionId: string,
  method: string,
  schemaId: string,
  overrides: Partial<UiActionBindingEvidence> = {},
): UiActionBindingEvidence {
  return {
    action_id: actionId,
    contract_reference: `contract:${method}@1`,
    source_span: span(),
    resolution: 'exact',
    candidate_targets: [{ method, schema_id: schemaId }],
    ...overrides,
  };
}

function permittedObservation(
  actionId: string,
  method: string,
  schemaId: string,
  overrides: Partial<UiActionRuntimeObservation> = {},
): UiActionRuntimeObservation {
  return {
    action_id: actionId,
    current_method: method,
    current_schema_id: schemaId,
    current_argument_digest: DIGEST_A,
    policy_decision_id: 'decision:dispatch-1',
    policy_fresh: true,
    ui_visible: true,
    ui_enabled: true,
    presentation_visibility: 'enabled',
    deontic_status: 'permitted',
    is_dispatchable: true,
    has_hidden_dispatch_path: false,
    runtime_reevaluated: true,
    requires_host_boundary: true,
    host_boundary_used: true,
    browser_policy_authoritative_claim: false,
    confirmation: null,
    ...overrides,
  };
}

function cleanDispatchBinding() {
  return makeUiActionBinding({
    action_id: 'action:dispatch',
    method: 'dispatch_goal',
    schema_id: 'schema:dispatch-goal/v1',
    policy_id: 'policy:agent-supervisor',
    component_id: 'comp:goal-form',
    depends_on_schema: true,
    is_destructive: false,
    requires_confirmation: false,
  });
}

function cleanDestructiveBinding() {
  return makeUiActionBinding({
    action_id: 'action:delete-goal',
    method: 'delete_goal',
    schema_id: 'schema:delete-goal/v1',
    policy_id: 'policy:agent-supervisor',
    component_id: 'comp:goal-list',
    is_destructive: true,
    requires_confirmation: true,
    confirmation_id: 'confirm:delete-goal',
  });
}

function grantedConfirmation(
  actionId: string,
  confirmationId: string,
  digest = DIGEST_A,
): UiConfirmationBinding {
  return makeUiConfirmationBinding({
    confirmation_id: confirmationId,
    action_id: actionId,
    argument_digest: digest,
    granted: true,
    policy_decision_id: 'decision:confirm-1',
  });
}

describe('UiPolicyBindingValidator@1 surface (VGO-023)', () => {
  it('exports sealed interface, schema, and validator version identities', () => {
    expect(UI_ACTION_BINDING_INTERFACE).toBe('UiActionBinding@1');
    expect(UI_ACTION_BINDING_SCHEMA).toBe('ui-action-binding/v1');
    expect(UI_CONFIRMATION_BINDING_INTERFACE).toBe('UiConfirmationBinding@1');
    expect(UI_CONFIRMATION_BINDING_SCHEMA).toBe('ui-confirmation-binding/v1');
    expect(UI_POLICY_BINDING_VALIDATOR_INTERFACE).toBe(
      'UiPolicyBindingValidator@1',
    );
    expect(UI_POLICY_BINDING_VALIDATOR_SCHEMA).toBe(
      'ui-policy-binding-validator/v1',
    );
    expect(UI_POLICY_BINDING_VALIDATOR_VERSION).toBe(
      'gui-policy-binding-validator@1.0.0',
    );
    expect(UI_POLICY_BINDING_REPORT_INTERFACE).toBe('UiPolicyBindingReport@1');
    expect(UI_POLICY_BINDING_REPORT_SCHEMA).toBe('ui-policy-binding-report/v1');

    const validator = createUiPolicyBindingValidator();
    expect(validator.interface).toBe(UI_POLICY_BINDING_VALIDATOR_INTERFACE);
    expect(validator.schema_version).toBe(UI_POLICY_BINDING_VALIDATOR_SCHEMA);
    expect(validator.validatorVersion).toBe(UI_POLICY_BINDING_VALIDATOR_VERSION);
  });

  it('decodes UiActionBinding@1 closed wire records and rejects unknown fields', () => {
    const binding = makeUiActionBinding({
      action_id: 'action:dispatch',
      method: 'dispatch_goal',
      schema_id: 'schema:dispatch-goal/v1',
      policy_id: 'policy:agent-supervisor',
    });
    expect(binding.interface).toBe(UI_ACTION_BINDING_INTERFACE);
    expect(binding.schema_version).toBe(UI_ACTION_BINDING_SCHEMA);
    expect(decodeUiActionBinding(binding)).toEqual(binding);

    expect(() =>
      decodeUiActionBinding({ ...binding, extra: true }),
    ).toThrow(/unknown UiActionBinding field/);
    expect(() =>
      decodeUiActionBinding({
        ...binding,
        requires_confirmation: true,
        confirmation_id: '',
      }),
    ).toThrow(/confirmation_id is required/);
  });

  it('decodes UiConfirmationBinding@1 with exact canonical argument digests', () => {
    const conf = makeUiConfirmationBinding({
      confirmation_id: 'confirm:dispatch',
      action_id: 'action:dispatch',
      argument_digest: DIGEST_A,
      granted: true,
    });
    expect(conf.interface).toBe(UI_CONFIRMATION_BINDING_INTERFACE);
    expect(decodeUiConfirmationBinding(conf)).toEqual(conf);
    expect(() =>
      decodeUiConfirmationBinding({
        ...conf,
        argument_digest: 'not-canonical',
      }),
    ).toThrow(/canonical sha256/);
    expect(() =>
      decodeUiConfirmationBinding({
        ...conf,
        argument_digest: 'sha256:' + 'A'.repeat(64),
      }),
    ).toThrow(/canonical sha256/);
  });
});

describe('clean binding path allows automatic acceptance', () => {
  it('accepts a single intended method/schema with fresh policy and host boundary', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });

    expect(report.interface).toBe(UI_POLICY_BINDING_REPORT_INTERFACE);
    expect(report.canonical_json_profile).toBe(CANONICAL_JSON_PROFILE);
    expect(report.acceptance_outcome).toBe('allow_automatic');
    expect(report.automatic_acceptance_blocked).toBe(false);
    expect(report.ui_visibility_authorizes).toBe(false);
    expect(report.browser_policy_authoritative).toBe(false);
    expect(allowsAutomaticAcceptance(report)).toBe(true);
    expect(report.unresolved_action_ids).toEqual([]);
    expect(report.violations.filter(v => v.blocks_automatic_acceptance)).toEqual(
      [],
    );
  });

  it('accepts destructive actions only with exact argument-bound confirmation', () => {
    const binding = cleanDestructiveBinding();
    const confirmation = grantedConfirmation(
      binding.action_id,
      binding.confirmation_id,
    );
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      confirmation_bindings: [confirmation],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          confirmation,
        }),
      ],
    });
    expect(allowsAutomaticAcceptance(report)).toBe(true);
    expect(exactConfirmationBinding(binding.action_id, DIGEST_A, confirmation)).toBe(
      true,
    );
  });

  it('produces deterministic canonical serialization and digests', () => {
    const binding = cleanDispatchBinding();
    const build = (): UiPolicyBindingReport =>
      validatePolicyBindings({
        application_id: APP,
        screen_id: SCREEN,
        action_bindings: [binding],
        binding_evidence: [
          exactEvidence(binding.action_id, binding.method, binding.schema_id),
        ],
        runtime_observations: [
          permittedObservation(
            binding.action_id,
            binding.method,
            binding.schema_id,
          ),
        ],
      });
    const a = build();
    const b = build();
    expect(serializeUiPolicyBindingReport(a)).toBe(
      serializeUiPolicyBindingReport(b),
    );
    expect(policyBindingReportDigest(a)).toBe(policyBindingReportDigest(b));
    expect(policyBindingReportDigest(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(canonicalJson(a)).toBe(serializeUiPolicyBindingReport(a));
  });
});

describe('ambiguous/dynamic bindings are unresolved or review-required', () => {
  it('marks ambiguous bindings as review-required and blocks automatic acceptance', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id, {
          resolution: 'ambiguous',
          candidate_targets: [
            { method: 'dispatch_goal', schema_id: 'schema:dispatch-goal/v1' },
            { method: 'dispatch_goal_v2', schema_id: 'schema:dispatch-goal/v2' },
          ],
        }),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });

    expect(report.acceptance_outcome).toBe('review_required');
    expect(report.automatic_acceptance_blocked).toBe(true);
    expect(allowsAutomaticAcceptance(report)).toBe(false);
    expect(report.unresolved_action_ids).toContain(binding.action_id);
    expect(report.review_required_action_ids).toContain(binding.action_id);
    expect(report.reason_codes).toEqual(
      expect.arrayContaining(['ambiguous_binding', 'multiple_method_schema_targets']),
    );
  });

  it('marks dynamic bindings as unresolved/review-required', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id, {
          resolution: 'dynamic',
        }),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });
    expect(report.acceptance_outcome).toBe('review_required');
    expect(report.unresolved_action_ids).toContain(binding.action_id);
    expect(report.reason_codes).toContain('dynamic_binding_unresolved');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });

  it('marks unresolved resolution status without inventing a method/schema', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id, {
          resolution: 'unresolved',
          candidate_targets: [],
        }),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });
    expect(report.unresolved_action_ids).toContain(binding.action_id);
    expect(report.acceptance_outcome).toBe('review_required');
  });
});

describe('UI visibility never proves permission', () => {
  it('never elevates presentation into authorization', () => {
    const claim = presentationDoesNotAuthorize({
      ui_visible: true,
      ui_enabled: true,
      presentation_visibility: 'enabled',
    });
    expect(claim.authorized).toBe(false);
    expect(claim.reasons.join(' ')).toMatch(/never proves permission|never authorizes/i);

    const hidden = presentationDoesNotAuthorize({
      ui_visible: false,
      ui_enabled: false,
      presentation_visibility: 'hidden',
    });
    expect(hidden.authorized).toBe(false);
  });

  it('records ui_visibility_authorizes=false on every report', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          ui_visible: true,
          ui_enabled: true,
          presentation_visibility: 'enabled',
        }),
      ],
    });
    expect(report.ui_visibility_authorizes).toBe(false);
    expect(report.browser_policy_authoritative).toBe(false);
  });

  it('rejects browser_policy_authoritative_claim and blocks automatic acceptance', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          browser_policy_authoritative_claim: true,
        }),
      ],
    });
    expect(report.reason_codes).toContain('browser_policy_not_authoritative');
    expect(report.acceptance_outcome).toBe('block_automatic');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });
});

describe('dispatchable prohibited/disabled actions block automatic acceptance', () => {
  it('blocks when a prohibited action remains dispatchable', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          deontic_status: 'prohibited',
          presentation_visibility: 'hidden',
          ui_enabled: false,
          ui_visible: false,
          is_dispatchable: true,
        }),
      ],
    });
    expect(report.reason_codes).toEqual(
      expect.arrayContaining([
        'dispatchable_prohibited_action',
        'dispatchable_disabled_action',
      ]),
    );
    expect(report.acceptance_outcome).toBe('block_automatic');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });

  it('blocks hidden-handler dispatch paths for disabled actions', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          deontic_status: 'prohibited',
          presentation_visibility: 'disabled',
          ui_enabled: false,
          is_dispatchable: false,
          has_hidden_dispatch_path: true,
        }),
      ],
    });
    expect(report.reason_codes).toContain('hidden_dispatch_path');
    expect(report.acceptance_outcome).toBe('block_automatic');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });

  it('allows prohibited actions that are not dispatchable and have no hidden path', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          deontic_status: 'prohibited',
          presentation_visibility: 'hidden',
          ui_visible: false,
          ui_enabled: false,
          is_dispatchable: false,
          has_hidden_dispatch_path: false,
        }),
      ],
    });
    expect(allowsAutomaticAcceptance(report)).toBe(true);
  });
});

describe('stale policy and exact-confirmation failures block automatic acceptance', () => {
  it('blocks stale policy decisions', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          policy_decision_id: 'decision:stale',
          policy_fresh: false,
        }),
      ],
    });
    expect(report.reason_codes).toContain('stale_policy_decision');
    expect(report.acceptance_outcome).toBe('block_automatic');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });

  it('blocks missing confirmation for destructive actions', () => {
    const binding = cleanDestructiveBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          confirmation: null,
        }),
      ],
    });
    expect(report.reason_codes).toContain('confirmation_required');
    expect(report.acceptance_outcome).toBe('block_automatic');
  });

  it('blocks confirmation bound to a different action or argument digest', () => {
    const binding = cleanDestructiveBinding();
    const wrongAction = grantedConfirmation(
      'action:other',
      binding.confirmation_id,
      DIGEST_A,
    );
    const wrongDigest = grantedConfirmation(
      binding.action_id,
      binding.confirmation_id,
      DIGEST_B,
    );

    const reportWrongAction = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      confirmation_bindings: [wrongAction],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          confirmation: wrongAction,
        }),
      ],
    });
    expect(reportWrongAction.reason_codes).toContain(
      'confirmation_binding_mismatch',
    );
    expect(allowsAutomaticAcceptance(reportWrongAction)).toBe(false);

    const reportWrongDigest = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      confirmation_bindings: [wrongDigest],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          current_argument_digest: DIGEST_A,
          confirmation: wrongDigest,
        }),
      ],
    });
    expect(reportWrongDigest.reason_codes).toContain(
      'confirmation_binding_mismatch',
    );
    expect(exactConfirmationBinding(binding.action_id, DIGEST_A, wrongDigest)).toBe(
      false,
    );
  });

  it('blocks missing runtime re-evaluation for policy-shaped actions', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          runtime_reevaluated: false,
        }),
      ],
    });
    expect(report.reason_codes).toContain('missing_runtime_reevaluation');
    expect(report.acceptance_outcome).toBe('block_automatic');
  });

  it('blocks method/schema mismatch under runtime re-evaluation', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, 'other_method', 'schema:other/v1'),
      ],
    });
    expect(report.reason_codes).toContain('method_schema_mismatch');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });
});

describe('browser-host boundary and contract evidence', () => {
  it('blocks host-crossing actions that skip the browser-host boundary', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id, {
          requires_host_boundary: true,
          host_boundary_used: false,
        }),
      ],
    });
    expect(report.reason_codes).toContain('host_boundary_missing');
    expect(report.acceptance_outcome).toBe('block_automatic');
  });

  it('blocks missing canonical contract references', () => {
    const binding = cleanDispatchBinding();
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id, {
          contract_reference: '',
        }),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });
    expect(report.reason_codes).toContain('missing_canonical_contract');
    expect(allowsAutomaticAcceptance(report)).toBe(false);
  });

  it('records binding-source spans on exact evidence without inventing them', () => {
    const binding = cleanDispatchBinding();
    const sourceSpan = span(42);
    const report = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id, {
          source_span: sourceSpan,
        }),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });
    expect(allowsAutomaticAcceptance(report)).toBe(true);
    expect(sourceSpan.start_line).toBe(42);

    const missingSpan = validatePolicyBindings({
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id, {
          source_span: null,
        }),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    });
    expect(missingSpan.reason_codes).toContain('missing_source_span');
    // Advisory only — does not by itself hard-block when otherwise clean.
    expect(missingSpan.acceptance_outcome).toBe('allow_automatic');
  });
});

describe('validator factory and blocking reason inventory', () => {
  it('createUiPolicyBindingValidator().validate matches validatePolicyBindings', () => {
    const binding = cleanDispatchBinding();
    const request = {
      application_id: APP,
      screen_id: SCREEN,
      action_bindings: [binding],
      binding_evidence: [
        exactEvidence(binding.action_id, binding.method, binding.schema_id),
      ],
      runtime_observations: [
        permittedObservation(binding.action_id, binding.method, binding.schema_id),
      ],
    };
    const viaFactory = createUiPolicyBindingValidator().validate(request);
    const viaFn = validatePolicyBindings(request);
    expect(serializeUiPolicyBindingReport(viaFactory)).toBe(
      serializeUiPolicyBindingReport(viaFn),
    );
  });

  it('exposes closed blocking and review reason inventories used by acceptance', () => {
    expect(BLOCKING_REASON_CODES).toEqual(
      expect.arrayContaining([
        'ambiguous_binding',
        'dynamic_binding_unresolved',
        'dispatchable_prohibited_action',
        'dispatchable_disabled_action',
        'stale_policy_decision',
        'confirmation_binding_mismatch',
        'hidden_dispatch_path',
      ]),
    );
    expect(REVIEW_REQUIRED_REASON_CODES).toEqual(
      expect.arrayContaining([
        'ambiguous_binding',
        'dynamic_binding_unresolved',
        'review_required',
      ]),
    );
    // UI visibility never appears as a positive authorization path.
    expect(BLOCKING_REASON_CODES).toContain('ui_visibility_not_permission');
  });
});

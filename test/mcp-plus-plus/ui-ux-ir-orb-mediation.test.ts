/**
 * UIR-033 — UI/UX IR integration with deontic broker, control-surface mediator,
 * and ORB capability router (UIIRORBBridge@1 / ControlSurfaceMediation@1).
 *
 * Evidence criteria (spy executor + exact receipts):
 * - Hidden/enabled presentation never authorizes
 * - Policy identity + current real input mandatory for unary and streaming
 * - Every invocation re-evaluates current policy
 * - Blocking / missing-policy outcomes never call transport
 * - Duplicate correlated inputs call transport at most once
 * - Actor/delegation/UI/action/IDL/policy/state/decision/invocation IDs retained
 * - Existing non-UIIR descriptors remain compatible through explicit adapters
 */

import {
  projectDeonticInterface,
  projectUIIRDeonticInterface,
  adaptNonUIIRDescriptorToORBBridge,
  presentationStateFromDeontic,
  assertPresentationDoesNotAuthorize,
  resolveUIIRActionBinding,
  retainUIIRMediationIdentity,
  createDeonticORBEvaluator,
  UIIR_ORB_BRIDGE_INTERFACE,
  PolicyEngine,
  type Policy,
} from '../../src/services/mcp/mcp-deontic-interface-broker';
import {
  control_surface_mediator,
  mediateControlSurfaceInvocation,
  mediateLegacyControlSurfaceInvocation,
  type ControlSurfacePolicyEvaluationRequest,
  type ControlSurfaceORBLikeBinding,
} from '../../src/services/mcp/mcp-control-surface-mediator';
import {
  MCPCapabilityRouter,
  LocalORBTransportAdapter,
  createDefaultORBAdapters,
  type ORBDescriptorSource,
} from '../../src/services/mcp/mcp-orb-capability-router';
import { ipfsDatasetsUIProfileDescriptor } from '../../src/services/ipfs/mcp-ipfs-ui-descriptors';
import type { InterfaceDescriptor } from '../../src/services/mcp/mcp-idl';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';

const DATASET_INTERFACE_CID = 'sha256:dataset-fixture';
const UI_IR_CID = 'sha256:uiir-dataset-workbench';

function localDatasetDescriptor(): MCPUIProfileDescriptor {
  const descriptor = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)) as MCPUIProfileDescriptor;
  descriptor.services = descriptor.services.map(service => ({
    ...service,
    transport: 'local',
    endpoint: 'local://ipfs_datasets_py',
  }));
  return descriptor;
}

function source(): ORBDescriptorSource {
  return { cid: DATASET_INTERFACE_CID, descriptor: localDatasetDescriptor() };
}

function datasetInterface(): InterfaceDescriptor {
  return ipfsDatasetsUIProfileDescriptor as InterfaceDescriptor;
}

function permitAllExceptPublish(): Policy {
  return {
    id: 'dataset-policy',
    version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: '*' }],
    obligations: [],
  };
}

function allowControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow' as const,
    reasons: ['Test runtime policy evaluator allowed ORB invocation.'],
    explanation: `allowed ${request.interaction_envelope.normalized_intent.method}`,
    metadata: {
      test_policy_evaluator: 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction',
      saw_input: request.input,
      policy_cid: request.context.policy_cid,
    },
  };
}

function denyControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'deny' as const,
    reasons: [`Denied by test policy for ${request.interaction_envelope.normalized_intent.method}`],
    explanation: 'test deny',
    metadata: { saw_input: request.input },
  };
}

function orbBinding(method = 'browse'): ControlSurfaceORBLikeBinding {
  const descriptor = localDatasetDescriptor();
  return {
    interface_cid: DATASET_INTERFACE_CID,
    descriptor,
    service: { id: descriptor.services[0]?.id ?? 'ipfs_datasets' },
    operation: { method },
  };
}

describe('UIR-033 UIIRORBBridge@1 — deontic presentation is advisory', () => {
  it('projects UIIR action bindings with advisory presentation, never as authorization', () => {
    const bridge = projectUIIRDeonticInterface(datasetInterface(), permitAllExceptPublish(), {
      ui_ir_cid: UI_IR_CID,
      action_ids: { browse: 'action:browse', publish: 'action:publish' },
    });

    expect(bridge.interface).toBe(UIIR_ORB_BRIDGE_INTERFACE);
    expect(bridge.ui_ir_cid).toBe(UI_IR_CID);
    expect(bridge.legacy_adapter).toBe(false);

    const browse = resolveUIIRActionBinding(bridge, 'browse');
    const publish = resolveUIIRActionBinding(bridge, 'publish');
    expect(browse?.presentation.visibility).toBe('enabled');
    expect(publish?.presentation.visibility).toBe('hidden');

    // Presentation must never be treated as a permit.
    const presentationClaim = assertPresentationDoesNotAuthorize(
      browse!.presentation,
      'permit',
    );
    expect(presentationClaim.authorized).toBe(false);
    expect(presentationClaim.reasons.join(' ')).toMatch(/never authorizes|advisory/i);
  });

  it('maps deontic states to presentation without elevating them to policy grants', () => {
    expect(presentationStateFromDeontic('prohibited').visibility).toBe('hidden');
    expect(presentationStateFromDeontic('unavailable').visibility).toBe('disabled');
    expect(presentationStateFromDeontic('permitted').visibility).toBe('enabled');
    expect(presentationStateFromDeontic('obligated').visibility).toBe('enabled');

    const enabled = assertPresentationDoesNotAuthorize({ visibility: 'enabled' });
    const hidden = assertPresentationDoesNotAuthorize({ visibility: 'hidden' });
    expect(enabled.authorized).toBe(false);
    expect(hidden.authorized).toBe(false);
  });

  it('adapts existing non-UIIR descriptors through an explicit legacy adapter', () => {
    const adapted = adaptNonUIIRDescriptorToORBBridge(datasetInterface(), permitAllExceptPublish());
    expect(adapted.legacy_adapter).toBe(true);
    expect(adapted.ui_ir_cid).toBeUndefined();
    expect(adapted.interface).toBe(UIIR_ORB_BRIDGE_INTERFACE);
    expect(adapted.actions.length).toBeGreaterThan(0);

    // Same formal projection as the classic path.
    const classic = projectDeonticInterface(datasetInterface(), permitAllExceptPublish());
    expect(adapted.projection.prohibited).toEqual(classic.prohibited);
    expect(adapted.policy_decisions.publish.visibility).toBe('hidden');
  });

  it('retains actor/delegation/UI/action/IDL/policy/state/decision/invocation IDs', () => {
    const retained = retainUIIRMediationIdentity({
      actor_id: 'did:key:alice',
      delegation_chain: ['did:key:alice', 'did:key:bob'],
      ui_ir_cid: UI_IR_CID,
      action_id: 'action:browse',
      interface_cid: DATASET_INTERFACE_CID,
      policy_cid: 'sha256:policy-1',
      state_id: 'state:ready',
      decision_id: 'decision:1',
      invocation_id: 'inv:1',
      correlation_id: 'corr-1',
    });
    expect(retained).toEqual(expect.objectContaining({
      actor_id: 'did:key:alice',
      ui_ir_cid: UI_IR_CID,
      action_id: 'action:browse',
      interface_cid: DATASET_INTERFACE_CID,
      policy_cid: 'sha256:policy-1',
      state_id: 'state:ready',
      decision_id: 'decision:1',
      invocation_id: 'inv:1',
      correlation_id: 'corr-1',
    }));
    expect(retained).not.toHaveProperty('presentation');
  });
});

describe('UIR-033 ControlSurfaceMediation@1 — presentation never authorizes', () => {
  it('rejects presentation-claimed authorization even when a policy evaluator would allow', async () => {
    let evaluatorCalls = 0;
    const result = await mediateControlSurfaceInvocation({
      binding: orbBinding('browse'),
      input: { path: '/' },
      context: {
        correlation_id: 'corr-presentation',
        caller_did: 'did:key:alice',
        policy_cid: 'sha256:policy-1',
        uiir: {
          ui_ir_cid: UI_IR_CID,
          action_id: 'action:browse',
          presentation: {
            visibility: 'enabled',
            authorizes: true,
          },
        },
        control_surface: {
          surface: 'mouse',
          surface_event: 'click',
          actor: { type: 'user', id: 'did:key:alice', delegation_chain: ['did:key:alice'] },
        },
      },
      policy_evaluator: (request) => {
        evaluatorCalls += 1;
        return allowControlSurfaceEvaluation(request);
      },
      require_uiir_mediation: true,
    });

    expect(result.can_invoke).toBe(false);
    expect(result.policy_decision.outcome).toBe('deny');
    expect(result.policy_decision.reasons.join('\n')).toMatch(/presentation|never authorizes/i);
    // Fail closed before evaluator when presentation claims a grant.
    expect(evaluatorCalls).toBe(0);
    expect(result.retained_identities?.ui_ir_cid).toBe(UI_IR_CID);
    expect(result.retained_identities?.action_id).toBe('action:browse');
    expect(result.retained_identities?.actor_id).toBe('did:key:alice');
  });

  it('requires policy identity and real input under UIIR mediation', async () => {
    const missingPolicy = await mediateControlSurfaceInvocation({
      binding: orbBinding('browse'),
      input: { path: '/' },
      context: {
        correlation_id: 'corr-no-policy',
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
      },
      policy_evaluator: allowControlSurfaceEvaluation,
      require_uiir_mediation: true,
    });
    expect(missingPolicy.can_invoke).toBe(false);
    expect(missingPolicy.policy_decision.reasons.join('\n')).toMatch(/policy identity/i);

    const missingInput = await mediateControlSurfaceInvocation({
      binding: orbBinding('browse'),
      input: {},
      context: {
        correlation_id: 'corr-no-input',
        policy_cid: 'sha256:policy-1',
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
      },
      policy_evaluator: allowControlSurfaceEvaluation,
      require_uiir_mediation: true,
    });
    expect(missingInput.can_invoke).toBe(false);
    expect(missingInput.policy_decision.reasons.join('\n')).toMatch(/real input/i);
  });

  it('re-evaluates policy with the actual input on every mediation call', async () => {
    const seenInputs: unknown[] = [];
    const evaluator = (request: ControlSurfacePolicyEvaluationRequest) => {
      seenInputs.push(request.input);
      const path = (request.input as { path?: string })?.path;
      if (path === '/deny-me') {
        return denyControlSurfaceEvaluation(request);
      }
      return allowControlSurfaceEvaluation(request);
    };

    const first = await control_surface_mediator({
      binding: orbBinding('browse'),
      input: { path: '/ok' },
      context: {
        correlation_id: 'corr-reeval-1',
        policy_cid: 'sha256:policy-1',
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
      },
      policy_evaluator: evaluator,
    });
    const second = await control_surface_mediator({
      binding: orbBinding('browse'),
      input: { path: '/deny-me' },
      context: {
        correlation_id: 'corr-reeval-2',
        policy_cid: 'sha256:policy-1',
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
      },
      policy_evaluator: evaluator,
    });

    expect(first.can_invoke).toBe(true);
    expect(second.can_invoke).toBe(false);
    expect(seenInputs).toEqual([{ path: '/ok' }, { path: '/deny-me' }]);
  });

  it('keeps non-UIIR descriptors compatible through the explicit legacy adapter', async () => {
    const result = await mediateLegacyControlSurfaceInvocation({
      binding: orbBinding('browse'),
      input: { path: '/' },
      context: { correlation_id: 'corr-legacy' },
      policy_evaluator: allowControlSurfaceEvaluation,
    });
    expect(result.can_invoke).toBe(true);
    expect(result.policy_decision.outcome).toBe('allow');
    expect(result.retained_identities?.interface_cid).toBe(DATASET_INTERFACE_CID);
  });
});

describe('UIR-033 ORB mediation — fail-closed transport with spy executor', () => {
  it('never calls transport when presentation claims authorization', async () => {
    let handlerCalls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => {
      handlerCalls += 1;
      return { entries: [] };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    const response = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: {
        correlation_id: 'corr-pres-deny',
        capabilities: ['dataset/read'],
        policy_cid: 'sha256:policy-1',
        uiir: {
          ui_ir_cid: UI_IR_CID,
          action_id: 'action:browse',
          presentation: { visibility: 'enabled', authorizes: true },
        },
      },
    });

    expect(response.denied).toBe(true);
    expect(handlerCalls).toBe(0);
    expect(response.receipt.policy_decision.reasons.join('\n')).toMatch(/presentation|never authorizes/i);
  });

  it('fails closed without transport when UIIR policy identity is missing', async () => {
    let handlerCalls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => {
      handlerCalls += 1;
      return { entries: [] };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    const response = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: {
        correlation_id: 'corr-missing-policy',
        capabilities: ['dataset/read'],
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
      },
    });

    expect(response.denied).toBe(true);
    expect(handlerCalls).toBe(0);
    expect(response.receipt.policy_decision.reasons.join('\n')).toMatch(/policy identity/i);
  });

  it('fails closed for blocking control-surface outcomes (deny/confirm/defer/rate_limit)', async () => {
    const outcomes = ['deny', 'require_confirmation', 'defer', 'rate_limit'] as const;
    for (const outcome of outcomes) {
      let handlerCalls = 0;
      const local = new LocalORBTransportAdapter();
      local.registerHandler('browse', () => {
        handlerCalls += 1;
        return { entries: [] };
      });
      const router = new MCPCapabilityRouter({
        adapters: createDefaultORBAdapters(local),
        control_surface_policy_evaluator: () => ({
          outcome,
          reasons: [`blocked:${outcome}`],
          explanation: `blocked ${outcome}`,
        }),
      });
      const binding = await router.bind({ descriptors: [source()], operation: 'browse' });
      const response = await router.invoke({
        handle: binding.handle,
        input: { path: '/' },
        context: {
          correlation_id: `corr-block-${outcome}`,
          capabilities: ['dataset/read'],
          policy_cid: 'sha256:policy-1',
          uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
        },
      });
      expect(response.denied).toBe(true);
      expect(handlerCalls).toBe(0);
      expect(response.receipt.mediation_receipt?.policy_decision.outcome).toBe(outcome);
    }
  });

  it('re-evaluates deontic policy on every unary invocation with current policy identity', async () => {
    const engine = new PolicyEngine();
    const policyCid = engine.registerPolicy({
      id: 'flip',
      version: '1',
      permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [],
      obligations: [],
    });

    let handlerCalls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => {
      handlerCalls += 1;
      return { entries: [{ name: 'ok' }] };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      deontic_evaluator: createDeonticORBEvaluator(engine),
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    const first = await router.invoke({
      handle: binding.handle,
      input: { path: '/a' },
      context: {
        correlation_id: 'corr-reeval-a',
        capabilities: ['dataset/read'],
        policy_cid: policyCid,
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
        state_id: 'state:1',
      },
    });
    expect(first.denied).toBe(false);
    expect(handlerCalls).toBe(1);

    // Flip the live policy: subsequent invoke must re-evaluate and deny.
    engine.registerPolicy({
      id: 'flip',
      version: '2',
      permissions: [],
      prohibitions: [{ cap: 'mcp++/invoke:browse', rsc: '*' }],
      obligations: [],
    });
    // Re-register under a new cid by using evaluate against updated engine state:
    // create a new policy cid that denies browse.
    const denyCid = engine.registerPolicy({
      id: 'flip-deny',
      version: '1',
      permissions: [],
      prohibitions: [{ cap: 'mcp++/invoke:browse', rsc: '*' }],
      obligations: [],
    });

    const second = await router.invoke({
      handle: binding.handle,
      input: { path: '/b' },
      context: {
        correlation_id: 'corr-reeval-b',
        capabilities: ['dataset/read'],
        policy_cid: denyCid,
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
        state_id: 'state:2',
      },
    });
    expect(second.denied).toBe(true);
    expect(handlerCalls).toBe(1);
    expect(second.receipt.policy_decision.reasons.join(' ')).toMatch(/Prohibited|DENY|deny/i);
  });

  it('requires real stream input under UIIR mediation and never opens transport when missing', async () => {
    let streamCalls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerStreamHandler('sync_status', async function* ({ binding, context }) {
      streamCalls += 1;
      yield {
        correlation_id: context.correlation_id ?? 'corr-stream',
        interface_cid: binding.interface_cid,
        operation: binding.operation.method,
        event: { status: 'running' },
        received_at: new Date().toISOString(),
      };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'sync_status' });

    const denied = await router.stream(binding.handle, {}, {
      correlation_id: 'corr-stream-empty',
      capabilities: ['dataset/read', 'dataset/progress'],
      policy_cid: 'sha256:policy-1',
      uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:sync_status' },
    });
    expect(denied.receipt.policy_decision.outcome).toBe('deny');
    expect(streamCalls).toBe(0);
    expect(denied.receipt.policy_decision.reasons.join('\n')).toMatch(/real input/i);

    const allowed = await router.stream(
      binding.handle,
      { cursor: '0', filter: 'active' },
      {
        correlation_id: 'corr-stream-real',
        capabilities: ['dataset/read', 'dataset/progress'],
        policy_cid: 'sha256:policy-1',
        uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:sync_status' },
        state_id: 'state:streaming',
      },
    );
    const first = await allowed.events[Symbol.asyncIterator]().next();
    expect(allowed.receipt.policy_decision.outcome).toBe('permit');
    expect(streamCalls).toBe(1);
    expect(first.done).toBe(false);
    expect(allowed.receipt.retained_identities?.ui_ir_cid).toBe(UI_IR_CID);
    expect(allowed.receipt.retained_identities?.policy_cid).toBe('sha256:policy-1');
    expect(allowed.receipt.retained_identities?.state_id).toBe('state:streaming');
  });

  it('calls transport at most once for duplicate correlated inputs while re-evaluating policy', async () => {
    let handlerCalls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => {
      handlerCalls += 1;
      return { entries: [{ name: `call-${handlerCalls}` }], call: handlerCalls };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    const input = { path: '/shared' };
    const context = {
      correlation_id: 'corr-dedup-1',
      capabilities: ['dataset/read'],
      policy_cid: 'sha256:policy-1',
      uiir: { ui_ir_cid: UI_IR_CID, action_id: 'action:browse' },
      state_id: 'state:ready',
      control_surface: {
        surface: 'mouse',
        surface_event: 'click',
        actor: {
          type: 'user' as const,
          id: 'did:key:alice',
          delegation_chain: ['did:key:alice', 'did:key:delegate'],
        },
      },
    };

    const first = await router.invoke({ handle: binding.handle, input, context });
    const second = await router.invoke({ handle: binding.handle, input, context });

    expect(first.denied).toBe(false);
    expect(second.denied).toBe(false);
    expect(handlerCalls).toBe(1);
    expect(second.receipt.correlated_dedup).toBe(true);
    expect(first.output).toEqual(second.output);

    // Different correlation may invoke again.
    const third = await router.invoke({
      handle: binding.handle,
      input,
      context: { ...context, correlation_id: 'corr-dedup-2' },
    });
    expect(third.denied).toBe(false);
    expect(handlerCalls).toBe(2);
  });

  it('retains actor/delegation/UI/action/IDL/policy/state/decision/invocation IDs on receipts', async () => {
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => ({ entries: [] }));
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    const response = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: {
        correlation_id: 'corr-ids',
        capabilities: ['dataset/read'],
        policy_cid: 'sha256:policy-ids',
        state_id: 'state:browse-ready',
        uiir: {
          ui_ir_cid: UI_IR_CID,
          action_id: 'action:browse',
          component_id: 'component:browse',
          program_binding_id: 'program:browse',
          mcp_idl_binding_id: 'mcp-idl:browse',
        },
        control_surface: {
          surface: 'agent',
          surface_event: 'autonomous_invoke',
          actor: {
            type: 'agent',
            id: 'did:key:agent-1',
            delegation_chain: ['did:key:user', 'did:key:agent-1'],
          },
        },
      },
    });

    expect(response.denied).toBe(false);
    const ids = response.receipt.retained_identities;
    expect(ids?.actor_id).toBe('did:key:agent-1');
    expect(ids?.delegation_chain).toEqual(['did:key:user', 'did:key:agent-1']);
    expect(ids?.ui_ir_cid).toBe(UI_IR_CID);
    expect(ids?.action_id).toBe('action:browse');
    expect(ids?.interface_cid).toBe(DATASET_INTERFACE_CID);
    expect(ids?.policy_cid).toBe('sha256:policy-ids');
    expect(ids?.state_id).toBe('state:browse-ready');
    expect(ids?.decision_id).toBeTruthy();
    expect(ids?.invocation_id).toBeTruthy();
    expect(ids?.correlation_id).toBe('corr-ids');
    expect(ids?.program_binding_id).toBe('program:browse');
    expect(ids?.mcp_idl_binding_id).toBe('mcp-idl:browse');
    expect(response.receipt.mediation_receipt?.metadata.presentation_never_authorizes).toBe(true);
  });

  it('preserves non-UIIR descriptor compatibility (legacy path still invokes)', async () => {
    let handlerCalls = 0;
    const local = new LocalORBTransportAdapter();
    local.registerHandler('browse', () => {
      handlerCalls += 1;
      return { entries: [] };
    });
    const router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(local),
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    });
    const binding = await router.bind({ descriptors: [source()], operation: 'browse' });

    // No uiir block — explicit legacy compatibility path.
    const response = await router.invoke({
      handle: binding.handle,
      input: { path: '/' },
      context: {
        correlation_id: 'corr-legacy-orb',
        capabilities: ['dataset/read'],
      },
    });

    expect(response.denied).toBe(false);
    expect(handlerCalls).toBe(1);
    expect(response.receipt.interface_cid).toBe(DATASET_INTERFACE_CID);
  });
});

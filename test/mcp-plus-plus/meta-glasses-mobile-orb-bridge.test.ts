import { computeInterfaceCID } from '../../src/services/mcp-idl';
import { vi } from 'vitest';
import {
  META_GLASSES_MOBILE_ORB_OPERATIONS,
  MetaGlassesMobileORBBridgeAdapter,
  createMetaGlassesMobileORBBridgeDescriptor,
  createMetaGlassesMobileORBDescriptorSource,
  createMetaGlassesMobileORBOperationPolicies,
  type MetaGlassesMobileORBBindServiceResponse,
  type MetaGlassesMobileORBDispatchResponseResponse,
  type MetaGlassesMobileORBEventResponse,
  type MetaGlassesMobileORBInvokeServiceResponse,
  type MetaGlassesMobileORBRegisterResponse,
  type MetaGlassesMobileORBSubscribeServiceUpdatesResponse,
} from '../../src/services/glasses/meta-glasses-mobile-orb-bridge';
import type { ControlSurfacePolicyEvaluationRequest } from '../../src/services/control-surface-mediator';

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    createHash: actual.createHash,
    randomUUID: actual.randomUUID,
    default: actual,
  };
});

const ALL_CAPABILITIES = [
  'mobile/orb.edge',
  'mobile/orb.service.bind',
  'mobile/orb.service.invoke',
  'mobile/orb.subscription',
  'mobile/orb.response.dispatch',
  'mobile/orb.binding.revoke',
];

const OPERATOR_DAEMON_TASK = {
  id: 'VAI-024',
  daemon_id: 'ipfs-datasets-todo-daemon',
  widget_id: 'operator-daemon-task-vai-024',
  hallucinate_surface: 'Hallucinate App desktop operator console',
  swissknife_surface: 'SwissKnife virtual desktop',
};

const allowControlSurfacePolicy = () => ({
  outcome: 'allow' as const,
  reasons: ['test runtime policy evaluator allowed mobile ORB interaction'],
});

function outputAs<T>(response: { output: unknown }): T {
  return response.output as T;
}

function allowControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow',
    reasons: ['Test runtime policy evaluator allowed mobile ORB invocation.'],
    explanation: `Test runtime policy evaluator allowed ${request.interaction_envelope.normalized_intent.method}.`,
  };
}

describe('Meta glasses mobile ORB bridge adapter', () => {
  it('describes the phone edge bridge with MCP-IDL and ORB service metadata', () => {
    const descriptor = createMetaGlassesMobileORBBridgeDescriptor();
    const source = createMetaGlassesMobileORBDescriptorSource();

    expect(descriptor.name).toBe('mobile_orb_bridge');
    expect(descriptor.namespace).toBe('handsfree.meta_glasses.mobile');
    expect(descriptor.methods.map(method => method.name)).toEqual(
      META_GLASSES_MOBILE_ORB_OPERATIONS,
    );
    expect(descriptor.services[0]).toEqual(
      expect.objectContaining({
        id: 'mobile-orb-edge',
        transport: 'local',
        operations: META_GLASSES_MOBILE_ORB_OPERATIONS,
      }),
    );
    expect(descriptor.permissions.default_deny).toBe(true);
    expect(descriptor.permissions.operations.invoke_service).toEqual([
      'mobile/orb.service.invoke',
    ]);
    expect(source.cid).toBe(computeInterfaceCID(descriptor));
  });

  it('routes register/event/bind/invoke/dispatch/subscribe/revoke through the ORB', async () => {
    const adapter = new MetaGlassesMobileORBBridgeAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      now: () => new Date('2026-05-23T12:00:00Z'),
      control_surface_policy_evaluator: allowControlSurfacePolicy,
    });

    const register = await adapter.invoke(
      (await adapter.bind({ operation: 'register_edge_capabilities' })).handle,
      {
        edge_id: 'handsfree-mobile-orb-edge',
        platform: 'ios',
        device_id: 'AA:BB',
        device_model: 'Meta Ray-Ban Display',
        dat_capabilities: {
          session: true,
          audio: true,
          display: true,
          displayVideo: true,
          webAppDisplay: true,
        },
        local_interface_cids: ['sha256:mobile', 'sha256:display'],
        transport_preferences: ['local', 'mcp-server'],
      },
      {
        correlation_id: 'corr-register',
        capabilities: ALL_CAPABILITIES,
      },
    );
    const registered = outputAs<MetaGlassesMobileORBRegisterResponse>(register);

    const event = await adapter.invoke(
      (await adapter.bind({ operation: 'publish_glasses_event' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        event_type: 'captouch',
        payload: { gesture: 'tap', intent: 'show task status' },
        correlation_id: 'corr-task-status',
        parent_receipt_cids: [register.receipt.receipt_cid],
      },
      {
        correlation_id: 'corr-task-status',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [register.receipt.receipt_cid],
      },
    );
    const eventOutput = outputAs<MetaGlassesMobileORBEventResponse>(event);

    const bound = await adapter.invoke(
      (await adapter.bind({ operation: 'bind_service' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        service_interface_cid: 'sha256:task-service',
        service_descriptor: {
          name: 'task_status_service',
          namespace: 'handsfree.services.tasks',
          metadata: {
            server_family: 'ipfs_datasets',
            tool_name: 'tools_dispatch',
            provider_name: 'ipfs_datasets_mcp',
          },
          methods: [
            {
              name: 'get_task_status',
              outputSchema: { type: 'object' },
            },
          ],
        },
        operation: 'get_task_status',
        transport_preference: 'mcp-server',
        user_intent: 'show task status',
      },
      {
        correlation_id: 'corr-bind',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [eventOutput.receipt_cid],
      },
    );
    const binding = outputAs<MetaGlassesMobileORBBindServiceResponse>(bound);

    const invoked = await adapter.invoke(
      (await adapter.bind({ operation: 'invoke_service' })).handle,
      {
        binding_handle: binding.binding_handle,
        operation: 'get_task_status',
        arguments: {
          task_id: 'task-123',
          display_widget_action: {
            type: 'mobile_render_display_widget',
            operation: 'render_widget',
            widget_id: 'task-progress-active',
            widget_cid: 'sha256:widget',
          },
          spoken_text: 'Sync dataset is 42 percent complete.',
        },
        correlation_id: 'corr-task-status',
        parent_receipt_cids: [eventOutput.receipt_cid],
      },
      {
        correlation_id: 'corr-task-status',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [eventOutput.receipt_cid],
      },
    );
    const serviceResult = outputAs<MetaGlassesMobileORBInvokeServiceResponse>(invoked);

    const dispatched = await adapter.invoke(
      (await adapter.bind({ operation: 'dispatch_glasses_response' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        result: serviceResult,
        render_targets: ['display_widget', 'audio', 'mobile_card'],
        correlation_id: 'corr-task-status',
        parent_receipt_cids: [eventOutput.receipt_cid, serviceResult.receipt_cid],
      },
      {
        correlation_id: 'corr-task-status',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [eventOutput.receipt_cid, serviceResult.receipt_cid],
      },
    );
    const dispatchOutput = outputAs<MetaGlassesMobileORBDispatchResponseResponse>(
      dispatched,
    );

    const subscribed = await adapter.invoke(
      (await adapter.bind({ operation: 'subscribe_service_updates' })).handle,
      {
        binding_handle: binding.binding_handle,
        operation: 'get_task_status',
        stream: 'task-status',
        correlation_id: 'corr-task-status',
      },
      {
        correlation_id: 'corr-task-status',
        capabilities: ALL_CAPABILITIES,
      },
    );
    const subscription = outputAs<MetaGlassesMobileORBSubscribeServiceUpdatesResponse>(
      subscribed,
    );

    const revoked = await adapter.invoke(
      (await adapter.bind({ operation: 'revoke_binding' })).handle,
      {
        binding_handle: binding.binding_handle,
        reason: 'test complete',
        correlation_id: 'corr-task-status',
      },
      {
        correlation_id: 'corr-task-status',
        capabilities: ALL_CAPABILITIES,
      },
    );

    expect(register.denied).toBe(false);
    expect(register.receipt.lifecycle.map(record => record.phase)).toEqual([
      'discover',
      'bind',
      'authorize',
      'invoke',
    ]);
    expect(registered.accepted_interface_cids).toEqual(['sha256:mobile', 'sha256:display']);
    expect(adapter.getEdgeSession()).toEqual(
      expect.objectContaining({
        edge_id: 'handsfree-mobile-orb-edge',
        platform: 'ios',
        edge_session_id: registered.edge_session_id,
        registered_at: '2026-05-23T12:00:00.000Z',
      }),
    );
    expect(eventOutput.routed_operations).toEqual(['bind_service', 'invoke_service']);
    expect(binding.transport).toBe('mcp-server');
    expect(binding.orb_binding).toEqual(
      expect.objectContaining({
        handle: binding.binding_handle,
        interface_cid: 'sha256:task-service',
        service_id: 'task_status_service',
        operation: 'get_task_status',
        transport: 'mcp-server',
        transport_binding: expect.objectContaining({
          transport: 'mcp-server',
          operation: 'get_task_status',
          metadata: expect.objectContaining({
            descriptor_kind: 'mcp-idl',
            server_family: 'ipfs_datasets',
            tool_name: 'tools_dispatch',
            provider_name: 'ipfs_datasets_mcp',
            interface_descriptor: expect.objectContaining({
              name: 'task_status_service',
              namespace: 'handsfree.services.tasks',
              version: '0.1.0',
              metadata: {
                server_family: 'ipfs_datasets',
                tool_name: 'tools_dispatch',
                provider_name: 'ipfs_datasets_mcp',
              },
            }),
          }),
        }),
      }),
    );
    expect(serviceResult.provenance_refs).toContain('sha256:task-service');
    expect(serviceResult.service_result.orb_binding).toEqual(binding.orb_binding);
    expect(serviceResult.display_widget_action).toEqual(
      expect.objectContaining({
        type: 'mobile_render_display_widget',
        widget_id: 'task-progress-active',
      }),
    );
    expect(dispatchOutput.display_widget_action).toEqual(serviceResult.display_widget_action);
    expect(dispatchOutput.spoken_text).toBe('Sync dataset is 42 percent complete.');
    expect(subscription.generation_key).toContain(':get_task_status:task-status');
    expect(subscription.subscription).toEqual(
      expect.objectContaining({
        subscription_id: subscription.subscription_id,
        binding_handle: binding.binding_handle,
        operation: 'get_task_status',
        stream: 'task-status',
        service_id: 'task_status_service',
        status: 'active',
        orb_binding: binding.orb_binding,
      }),
    );
    expect(outputAs<{ revoked: boolean }>(revoked).revoked).toBe(true);
    expect(adapter.getTaskMetadata().map(entry => entry.operation)).toEqual([
      'register_edge_capabilities',
      'publish_glasses_event',
      'bind_service',
      'invoke_service',
      'dispatch_glasses_response',
      'subscribe_service_updates',
      'revoke_binding',
    ]);
  });

  it('denies service invocation before it reaches a bridge backend without capability', async () => {
    let backendCalls = 0;
    const adapter = new MetaGlassesMobileORBBridgeAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      backend: {
        registerEdgeCapabilities: () => {
          throw new Error('not used');
        },
        publishGlassesEvent: () => {
          throw new Error('not used');
        },
        bindService: () => {
          backendCalls += 1;
          throw new Error('policy should deny first');
        },
        invokeService: () => {
          throw new Error('not used');
        },
        subscribeServiceUpdates: () => {
          throw new Error('not used');
        },
        dispatchGlassesResponse: () => {
          throw new Error('not used');
        },
        revokeBinding: () => {
          throw new Error('not used');
        },
      },
    });

    const denied = await adapter.invoke(
      (await adapter.bind({ operation: 'bind_service' })).handle,
      {
        edge_session_id: 'session',
        service_interface_cid: 'sha256:task-service',
        operation: 'get_task_status',
      },
      {
        correlation_id: 'corr-denied',
        capabilities: ['mobile/orb.edge'],
      },
    );

    expect(denied.denied).toBe(true);
    expect(denied.receipt.policy_decision.reasons.join('\n')).toContain(
      'Missing capability: mobile/orb.service.bind',
    );
    expect(backendCalls).toBe(0);
  });

  it('routes an unpaired Meta glasses daemon task through SwissKnife and Hallucinate desktop operator recovery', async () => {
    const adapter = new MetaGlassesMobileORBBridgeAdapter({
      now: () => new Date('2026-05-26T13:00:00.000Z'),
      control_surface_policy_evaluator: allowControlSurfacePolicy,
    });

    const register = await adapter.invoke(
      (await adapter.bind({ operation: 'register_edge_capabilities' })).handle,
      {
        edge_id: 'hallucinate-desktop-operator',
        platform: 'simulator',
        device_id: 'desktop-operator-no-glasses',
        device_model: 'Meta glasses hardware-free desktop harness',
        dat_capabilities: {
          session: true,
          audio: false,
          display: false,
          displayVideo: false,
          webAppDisplay: true,
        },
        local_interface_cids: [
          'sha256:hallucinate-desktop-operator',
          'sha256:swissknife-virtual-desktop',
        ],
        transport_preferences: ['local', 'mcp-server'],
      },
      {
        correlation_id: 'corr-operator-register',
        capabilities: ALL_CAPABILITIES,
      },
    );
    const registered = outputAs<MetaGlassesMobileORBRegisterResponse>(register);

    const event = await adapter.invoke(
      (await adapter.bind({ operation: 'publish_glasses_event' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        event_type: 'display_action',
        payload: {
          operator_event: 'inspect_daemon_task',
          daemon_task_id: OPERATOR_DAEMON_TASK.id,
          daemon_id: OPERATOR_DAEMON_TASK.daemon_id,
          desktop_surface: OPERATOR_DAEMON_TASK.hallucinate_surface,
          swissknife_surface: OPERATOR_DAEMON_TASK.swissknife_surface,
          meta_glasses_paired: false,
        },
        correlation_id: 'corr-operator-inspect',
        parent_receipt_cids: [register.receipt.receipt_cid],
      },
      {
        correlation_id: 'corr-operator-inspect',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [register.receipt.receipt_cid],
      },
    );
    const eventOutput = outputAs<MetaGlassesMobileORBEventResponse>(event);

    const bound = await adapter.invoke(
      (await adapter.bind({ operation: 'bind_service' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        service_interface_cid: 'sha256:desktop-operator-task-service',
        service_descriptor: {
          name: 'desktop_operator_task_service',
          namespace: 'hallucinate_app.operator_console',
          metadata: {
            server_family: 'ipfs_datasets_todo_daemon',
            tool_name: 'inspect_daemon_task',
            provider_name: 'hallucinate_app',
          },
          methods: [
            { name: 'inspect_daemon_task', outputSchema: { type: 'object' } },
            { name: 'recover_daemon_task', outputSchema: { type: 'object' } },
          ],
        },
        operation: 'inspect_daemon_task',
        transport_preference: 'mcp-server',
        user_intent: 'desktop operator inspects daemon task',
      },
      {
        correlation_id: 'corr-operator-bind',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [eventOutput.receipt_cid],
      },
    );
    const binding = outputAs<MetaGlassesMobileORBBindServiceResponse>(bound);

    const inspected = await adapter.invoke(
      (await adapter.bind({ operation: 'invoke_service' })).handle,
      {
        binding_handle: binding.binding_handle,
        operation: 'inspect_daemon_task',
        arguments: {
          daemon_task_id: OPERATOR_DAEMON_TASK.id,
          daemon_id: OPERATOR_DAEMON_TASK.daemon_id,
          desktop_surface: OPERATOR_DAEMON_TASK.hallucinate_surface,
          swissknife_surface: OPERATOR_DAEMON_TASK.swissknife_surface,
          meta_glasses_paired: false,
          display_widget_action: {
            type: 'mobile_render_display_widget',
            operation: 'render_widget',
            widget_id: OPERATOR_DAEMON_TASK.widget_id,
            fallback: {
              render_path: 'desktop-operator-panel',
              message: 'Meta glasses not paired; rendered in the Hallucinate App desktop operator console.',
            },
          },
          spoken_text: 'Daemon task VAI-024 is visible in the desktop operator console.',
          follow_up_actions: [
            {
              type: 'operator_route',
              target: 'swissknife.virtual_desktop',
              surface: OPERATOR_DAEMON_TASK.swissknife_surface,
            },
          ],
        },
        correlation_id: 'corr-operator-inspect',
        parent_receipt_cids: [eventOutput.receipt_cid],
      },
      {
        correlation_id: 'corr-operator-inspect',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [eventOutput.receipt_cid],
      },
    );
    const inspectedOutput = outputAs<MetaGlassesMobileORBInvokeServiceResponse>(inspected);

    const inspectedDispatch = await adapter.invoke(
      (await adapter.bind({ operation: 'dispatch_glasses_response' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        result: inspectedOutput,
        render_targets: ['display_webapp', 'mobile_card', 'notification'],
        fallback: {
          reason: 'paired Meta glasses display unavailable in desktop E2E',
          render_path: 'desktop-operator-panel',
        },
        correlation_id: 'corr-operator-dispatch',
        parent_receipt_cids: [eventOutput.receipt_cid, inspectedOutput.receipt_cid],
      },
      {
        correlation_id: 'corr-operator-dispatch',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [eventOutput.receipt_cid, inspectedOutput.receipt_cid],
      },
    );
    const inspectedDispatchOutput = outputAs<MetaGlassesMobileORBDispatchResponseResponse>(
      inspectedDispatch,
    );

    const recovered = await adapter.invoke(
      (await adapter.bind({ operation: 'invoke_service' })).handle,
      {
        binding_handle: binding.binding_handle,
        operation: 'recover_daemon_task',
        arguments: {
          daemon_task_id: OPERATOR_DAEMON_TASK.id,
          daemon_id: OPERATOR_DAEMON_TASK.daemon_id,
          desktop_surface: OPERATOR_DAEMON_TASK.hallucinate_surface,
          swissknife_surface: OPERATOR_DAEMON_TASK.swissknife_surface,
          display_widget_action: {
            type: 'mobile_update_display_widget',
            operation: 'update_widget',
            widget_id: OPERATOR_DAEMON_TASK.widget_id,
            patch: {
              status: 'running',
              recovery_state: 'recovered',
              operator_route: 'desktop',
            },
          },
          spoken_text: 'Daemon task VAI-024 recovered through the desktop operator route.',
          follow_up_actions: [
            {
              type: 'operator_recovery',
              target: 'hallucinate_app.daemon_manager',
              status: 'recovered',
            },
          ],
        },
        correlation_id: 'corr-operator-recover',
        parent_receipt_cids: [inspectedOutput.receipt_cid],
      },
      {
        correlation_id: 'corr-operator-recover',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [inspectedOutput.receipt_cid],
      },
    );
    const recoveredOutput = outputAs<MetaGlassesMobileORBInvokeServiceResponse>(recovered);

    const recoveredDispatch = await adapter.invoke(
      (await adapter.bind({ operation: 'dispatch_glasses_response' })).handle,
      {
        edge_session_id: registered.edge_session_id,
        result: recoveredOutput,
        render_targets: ['display_webapp', 'mobile_card', 'notification'],
        fallback: {
          reason: 'desktop operator recovery kept Meta glasses hardware optional',
          render_path: 'desktop-operator-panel',
        },
        correlation_id: 'corr-operator-recovered-dispatch',
        parent_receipt_cids: [recoveredOutput.receipt_cid],
      },
      {
        correlation_id: 'corr-operator-recovered-dispatch',
        capabilities: ALL_CAPABILITIES,
        parent_receipt_cids: [recoveredOutput.receipt_cid],
      },
    );
    const recoveredDispatchOutput = outputAs<MetaGlassesMobileORBDispatchResponseResponse>(
      recoveredDispatch,
    );

    expect(registered.accepted_interface_cids).toEqual([
      'sha256:hallucinate-desktop-operator',
      'sha256:swissknife-virtual-desktop',
    ]);
    expect(adapter.getEdgeSession()).toMatchObject({
      platform: 'simulator',
      device_model: 'Meta glasses hardware-free desktop harness',
      dat_capabilities: {
        display: false,
        webAppDisplay: true,
      },
    });
    expect(eventOutput.routed_operations).toEqual(['bind_service', 'invoke_service']);
    expect(binding.orb_binding).toMatchObject({
      service_id: 'desktop_operator_task_service',
      operation: 'inspect_daemon_task',
      transport: 'mcp-server',
      transport_binding: {
        metadata: {
          server_family: 'ipfs_datasets_todo_daemon',
          tool_name: 'inspect_daemon_task',
          provider_name: 'hallucinate_app',
        },
      },
    });
    expect(inspectedOutput.service_result.arguments).toMatchObject({
      daemon_task_id: OPERATOR_DAEMON_TASK.id,
      desktop_surface: OPERATOR_DAEMON_TASK.hallucinate_surface,
      swissknife_surface: OPERATOR_DAEMON_TASK.swissknife_surface,
      meta_glasses_paired: false,
    });
    expect(inspectedOutput.display_widget_action).toMatchObject({
      type: 'mobile_render_display_widget',
      widget_id: OPERATOR_DAEMON_TASK.widget_id,
      fallback: {
        render_path: 'desktop-operator-panel',
      },
    });
    expect(inspectedDispatchOutput.display_widget_action).toEqual(
      inspectedOutput.display_widget_action,
    );
    expect(inspectedDispatchOutput.spoken_text).toBe(
      'Daemon task VAI-024 is visible in the desktop operator console.',
    );
    expect(recoveredOutput.display_widget_action).toMatchObject({
      type: 'mobile_update_display_widget',
      widget_id: OPERATOR_DAEMON_TASK.widget_id,
      patch: {
        status: 'running',
        recovery_state: 'recovered',
      },
    });
    expect(recoveredDispatchOutput.display_widget_action).toEqual(
      recoveredOutput.display_widget_action,
    );
    expect(adapter.getTaskMetadata().map(entry => entry.operation)).toEqual([
      'register_edge_capabilities',
      'publish_glasses_event',
      'bind_service',
      'invoke_service',
      'dispatch_glasses_response',
      'invoke_service',
      'dispatch_glasses_response',
    ]);
  });

  it('exposes conservative default policies for mobile ORB operations', () => {
    const policies = createMetaGlassesMobileORBOperationPolicies();

    expect(policies.register_edge_capabilities.idempotency).toEqual({
      required: true,
      key_field: 'edge_id',
    });
    expect(policies.invoke_service.authorization?.required_capabilities).toEqual([
      'mobile/orb.service.invoke',
    ]);
    expect(policies.dispatch_glasses_response.authorization?.required_capabilities).toEqual([
      'mobile/orb.response.dispatch',
    ]);
  });
});

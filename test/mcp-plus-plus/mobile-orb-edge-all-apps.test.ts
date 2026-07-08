/**
 * @vitest-environment node
 */

import {
  getSwissknifeMCPCapabilityRegistry,
  type SwissknifeMCPCapabilityDescriptor,
} from '../../src/services/apps/swissknife-mcp-capability-registry';
import {
  MetaGlassesMobileORBBridgeAdapter,
  type MetaGlassesMobileORBBindServiceResponse,
  type MetaGlassesMobileORBRegisterResponse,
} from '../../src/services/glasses/meta-glasses-mobile-orb-bridge';
import {
  ipfsAccelerateUIProfileDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/ipfs/mcp-ipfs-ui-descriptors';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';
import type { ControlSurfacePolicyEvaluationRequest } from '../../src/services/mcp/control-surface-mediator';

function allowControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow',
    reasons: [`Allowed ${request.interaction_envelope.normalized_intent.method} for all-app mobile ORB edge coverage.`],
    explanation: 'SWR-006 hardware-free mobile ORB edge validation.',
    metadata: {
      test_policy_evaluator: 'mobile-orb-edge-all-apps',
    },
  };
}

const descriptorByServerPackage: Partial<Record<string, MCPUIProfileDescriptor>> = {
  ipfs_datasets_py: ipfsDatasetsUIProfileDescriptor,
  ipfs_accelerate_py: ipfsAccelerateUIProfileDescriptor,
};

describe('SWR-006 mobile ORB edge coverage for all app surfaces', () => {
  it('binds every dashboard app capability through the phone-edge ORB adapter', async () => {
    const registry = getSwissknifeMCPCapabilityRegistry();
    const adapter = new MetaGlassesMobileORBBridgeAdapter({
      control_surface_policy_evaluator: allowControlSurfaceEvaluation,
      now: () => new Date('2026-07-08T00:00:00.000Z'),
    });
    const registerBinding = await adapter.bind({ operation: 'register_edge_capabilities' });
    const registration = await adapter.invoke(
      registerBinding.handle,
      {
        edge_id: 'swr-006-mobile-edge',
        platform: 'simulator',
        device_id: 'swr-006-device',
        device_model: 'hardware-free-meta-glasses-simulator',
        dat_capabilities: {
          session: true,
          display: true,
          webAppDisplay: true,
          audio: true,
          camera: true,
          photoCapture: true,
        },
        local_interface_cids: registry.map(descriptor => descriptor.descriptor_id),
      },
      {
        correlation_id: 'swr-006-register',
        capabilities: ['mobile/orb.edge'],
        control_surface: { surface: 'agent', surface_event: 'autonomous_invoke' },
      },
    );
    const edgeSession = registration.output as unknown as MetaGlassesMobileORBRegisterResponse;

    expect(registration.denied).toBe(false);
    expect(edgeSession.accepted_interface_cids.sort()).toEqual(
      registry.map(descriptor => descriptor.descriptor_id).sort(),
    );

    const bindBinding = await adapter.bind({ operation: 'bind_service' });
    const boundApps: Array<{
      app_id: string;
      server_package: string;
      operation: string;
      descriptor_available: boolean;
    }> = [];

    for (const descriptor of registry) {
      const firstOperation = firstOperationFor(descriptor);
      const serviceDescriptor = descriptorByServerPackage[descriptor.server_package];
      const response = await adapter.invoke(
        bindBinding.handle,
        {
          edge_session_id: edgeSession.edge_session_id,
          service_interface_cid: descriptor.descriptor_id,
          service_descriptor: serviceDescriptor as unknown as Record<string, unknown> | undefined,
          operation: firstOperation,
          transport_preference: descriptor.transport,
          user_intent: descriptor.capability_descriptor.command_intents[0]?.intent,
        },
        {
          correlation_id: `swr-006-bind-${descriptor.server_package}`,
          capabilities: ['mobile/orb.service.bind'],
          control_surface: { surface: 'agent', surface_event: 'autonomous_invoke' },
        },
      );
      const output = response.output as unknown as MetaGlassesMobileORBBindServiceResponse;

      expect(response.denied).toBe(false);
      expect(output.orb_binding?.interface_cid).toBe(descriptor.descriptor_id);
      expect(output.orb_binding?.operation).toBe(firstOperation);
      expect(output.orb_binding?.transport).toBe(descriptor.transport);
      expect(output.mediation_receipt?.policy_decision.outcome).toBe('allow');
      boundApps.push({
        app_id: descriptor.app_id,
        server_package: descriptor.server_package,
        operation: firstOperation,
        descriptor_available: Boolean(serviceDescriptor),
      });
    }

    expect(boundApps.map(app => app.app_id).sort()).toEqual(
      registry.map(descriptor => descriptor.app_id).sort(),
    );
    expect(boundApps.filter(app => app.descriptor_available).map(app => app.server_package).sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
    ]);
    expect(adapter.getTaskMetadata().filter(task => task.operation === 'bind_service')).toHaveLength(registry.length);
  });
});

function firstOperationFor(descriptor: SwissknifeMCPCapabilityDescriptor): string {
  const firstOperation = descriptor.capability_descriptor.operations[0];
  if (!firstOperation) {
    throw new Error(`${descriptor.server_package} has no app capability operation`);
  }
  return firstOperation;
}

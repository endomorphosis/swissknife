import {
  InterfaceRepository,
} from './mcp-idl.js';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
  type LaunchResolution,
} from './mcp-interface-registry.js';
import {
  LocalORBTransportAdapter,
  MCPCapabilityRouter,
  createDefaultORBAdapters,
  type ORBInvocationResponse,
  type ORBStreamEvent,
} from './mcp-orb-capability-router.js';
import {
  generateSchemaDrivenUI,
  type GeneratedSchemaDrivenUI,
} from './mcp-schema-ui-generator.js';
import {
  validateMCPUIProfileDescriptor,
  type MCPUIOperationContract,
  type MCPUIProfileDescriptor,
} from './mcp-ui-profile.js';

export interface GeneratedAppQualityGateOptions {
  descriptors: MCPUIProfileDescriptor[];
  app_id: string;
  invoke_operation?: string;
  stream_operation?: string;
  capabilities?: string[];
}

export interface GeneratedAppQualityGateReport {
  app_id: string;
  descriptor_cid: string;
  launch: LaunchResolution;
  generated_ui: GeneratedSchemaDrivenUI;
  invoked_operation: string;
  invocation: ORBInvocationResponse;
  denial: ORBInvocationResponse;
  stream?: {
    operation: string;
    first_event: ORBStreamEvent;
    recovered: boolean;
    binding_generation: number;
  };
}

export async function runGeneratedAppQualityGate(
  options: GeneratedAppQualityGateOptions,
): Promise<GeneratedAppQualityGateReport> {
  validateDescriptorSet(options.descriptors);

  const registry = new MCPInterfaceDiscoveryRegistry(
    new LocalMCPInterfaceRegistryBackend(new InterfaceRepository()),
  );
  for (const descriptor of options.descriptors) {
    registry.publish(descriptor);
  }

  const launch = await registry.resolveForLaunch({
    app_id: options.app_id,
    required_methods: options.invoke_operation ? [options.invoke_operation] : undefined,
  });
  if (!launch) {
    throw new Error(`Generated app launch failed for ${options.app_id}.`);
  }

  const descriptor = withLocalTransports(launch.descriptor);
  const generatedUI = generateSchemaDrivenUI(descriptor);
  const invokeOperation = options.invoke_operation
    ?? firstOperation(descriptor, operation => !operation.stream)
    ?? descriptor.data_contracts.operations[0]?.method;
  if (!invokeOperation) {
    throw new Error(`Descriptor ${descriptor.name} has no invokable operation.`);
  }

  const local = new LocalORBTransportAdapter();
  local.registerHandler(invokeOperation, ({ binding, context }) => sampleOutput(binding.operation, context.correlation_id));

  const streamOperation = options.stream_operation
    ?? firstOperation(descriptor, operation => operation.stream !== undefined);
  if (streamOperation) {
    local.registerStreamHandler(streamOperation, async function* ({ binding, context }) {
      yield {
        correlation_id: context.correlation_id ?? 'quality-gate-stream',
        interface_cid: binding.interface_cid,
        operation: binding.operation.method,
        event: sampleStreamEvent(binding.operation, context.correlation_id),
        received_at: '2026-05-21T00:00:00.000Z',
      };
    });
  }

  const router = new MCPCapabilityRouter({ adapters: createDefaultORBAdapters(local) });
  const descriptorSource = {
    cid: launch.cid,
    descriptor,
  };
  const invocationBinding = await router.bind({
    descriptors: [descriptorSource],
    operation: invokeOperation,
  });
  const capabilities = options.capabilities
    ?? descriptor.permissions.operations[invokeOperation]
    ?? [];
  const invocation = await router.invoke({
    handle: invocationBinding.handle,
    input: sampleInput(invocationBinding.operation),
    context: { correlation_id: 'quality-gate-invoke', capabilities },
  });
  const denial = await router.invoke({
    handle: invocationBinding.handle,
    input: sampleInput(invocationBinding.operation),
    context: { correlation_id: 'quality-gate-denied', capabilities: [] },
  });

  let stream: GeneratedAppQualityGateReport['stream'];
  if (streamOperation) {
    const streamBinding = await router.bind({
      descriptors: [descriptorSource],
      operation: streamOperation,
    });
    const streamCapabilities = descriptor.permissions.operations[streamOperation] ?? [];
    const subscription = await router.stream(streamBinding.handle, {
      correlation_id: 'quality-gate-stream',
      capabilities: streamCapabilities,
    });
    const first = await subscription.events[Symbol.asyncIterator]().next();
    if (first.done) {
      throw new Error(`Stream quality gate produced no event for ${streamOperation}.`);
    }
    const recovery = await router.recover(streamBinding.handle, { correlation_id: 'quality-gate-stream' }, 'quality gate reconnect');
    stream = {
      operation: streamOperation,
      first_event: first.value,
      recovered: recovery.recovered,
      binding_generation: router.getBinding(streamBinding.handle)?.binding_generation ?? -1,
    };
  }

  return {
    app_id: options.app_id,
    descriptor_cid: launch.cid,
    launch,
    generated_ui: generatedUI,
    invoked_operation: invokeOperation,
    invocation,
    denial,
    stream,
  };
}

export function validateDescriptorSet(descriptors: MCPUIProfileDescriptor[]): void {
  if (descriptors.length === 0) {
    throw new Error('At least one generated app descriptor is required.');
  }
  for (const [index, descriptor] of descriptors.entries()) {
    const result = validateMCPUIProfileDescriptor(descriptor);
    if (!result.conformant) {
      throw new Error(`Descriptor quality gate failed at descriptors[${index}]: ${JSON.stringify(result.errors)}`);
    }
  }
}

function withLocalTransports(descriptor: MCPUIProfileDescriptor): MCPUIProfileDescriptor {
  return {
    ...JSON.parse(JSON.stringify(descriptor)) as MCPUIProfileDescriptor,
    services: descriptor.services.map(service => ({
      ...service,
      transport: 'local' as const,
      endpoint: `local://${service.id}`,
    })),
  };
}

function firstOperation(
  descriptor: MCPUIProfileDescriptor,
  predicate: (operation: MCPUIOperationContract) => boolean,
): string | undefined {
  return descriptor.data_contracts.operations.find(predicate)?.method;
}

function sampleInput(operation: MCPUIOperationContract): Record<string, unknown> {
  const properties = operation.input_schema?.properties;
  const input: Record<string, unknown> = {};
  if (!isRecord(properties)) {
    return input;
  }
  const required = Array.isArray(operation.input_schema?.required)
    ? operation.input_schema.required.filter((value): value is string => typeof value === 'string')
    : [];
  for (const key of required) {
    input[key] = sampleValue(isRecord(properties[key]) ? properties[key] : {});
  }
  return input;
}

function sampleOutput(operation: MCPUIOperationContract, correlationId?: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const properties = operation.output_schema?.properties;
  if (isRecord(properties)) {
    for (const [key, schema] of Object.entries(properties)) {
      output[key] = sampleValue(isRecord(schema) ? schema : {});
    }
  }
  output.correlation_id = correlationId ?? output.correlation_id ?? 'quality-gate-invoke';
  return output;
}

function sampleStreamEvent(operation: MCPUIOperationContract, correlationId?: string): Record<string, unknown> {
  const event: Record<string, unknown> = {
    correlation_id: correlationId ?? 'quality-gate-stream',
    status: 'running',
    timestamp: '2026-05-21T00:00:00.000Z',
  };
  if (operation.stream?.kind === 'progress') {
    event.operation = operation.method;
    event.progress = 0.5;
  }
  if (operation.stream?.kind === 'telemetry' || operation.stream?.kind === 'job-status') {
    event.metrics = { latency_ms: 1 };
  }
  return event;
}

function sampleValue(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  switch (schema.type) {
    case 'integer':
      return 1;
    case 'number':
      return 0.5;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'string':
    default:
      return sampleString(schema);
  }
}

function sampleString(schema: Record<string, unknown>): string {
  const description = typeof schema.description === 'string' ? schema.description.toLowerCase() : '';
  if (description.includes('cid')) {
    return 'bafybeigdyrzt5qualitygate';
  }
  return 'quality-gate';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

import {
  InterfaceRepository,
} from '../mcp/mcp-idl.js';
import type {
  ControlSurfacePolicyEvaluationRequest,
  ControlSurfacePolicyEvaluator,
} from '../mcp/mcp-control-surface-mediator.js';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
  type LaunchResolution,
} from '../mcp/mcp-interface-registry.js';
import {
  LocalORBTransportAdapter,
  MCPCapabilityRouter,
  createDefaultORBAdapters,
  type ORBInvocationResponse,
  type ORBStreamEvent,
} from '../mcp/mcp-orb-capability-router.js';
import {
  generateSchemaDrivenUI,
  type GeneratedSchemaDrivenUI,
} from '../mcp/mcp-schema-ui-generator.js';
import {
  validateMCPUIProfileDescriptor,
  type MCPUIOperationContract,
  type MCPUIProfileDescriptor,
  type MCPUIWorkflowAction,
  type MCPUIWorkflowStep,
} from '../mcp/mcp-ui-profile.js';

export interface GeneratedAppQualityGateOptions {
  descriptors: MCPUIProfileDescriptor[];
  app_id: string;
  invoke_operation?: string;
  stream_operation?: string;
  capabilities?: string[];
  control_surface_policy_evaluator?: ControlSurfacePolicyEvaluator;
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
  workflow?: GeneratedWorkflowQualityGateReport;
}

export interface GeneratedWorkflowStepReport {
  id: string;
  operation: string;
  service_id?: string;
  status: 'completed' | 'denied' | 'failed';
  attempts: number;
  receipt_cid?: string;
  output?: unknown;
  error?: string;
}

export interface GeneratedWorkflowActionReport {
  operation: string;
  service_id?: string;
  reason?: string;
  status: 'completed' | 'denied' | 'failed';
  receipt_cid?: string;
  output?: unknown;
  error?: string;
}

export interface GeneratedWorkflowQualityGateReport {
  graph_id: string;
  completed_steps: string[];
  steps: GeneratedWorkflowStepReport[];
  final_state: Record<string, unknown>;
  rollback?: GeneratedWorkflowActionReport;
  compensation?: GeneratedWorkflowActionReport;
  recovery_paths: {
    failed_pin_retry: boolean;
    failed_inference_rollback: boolean;
    stream_reconnect: boolean;
    artifact_publish_retry: boolean;
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

  const streamOperation = options.stream_operation
    ?? firstOperation(descriptor, operation => operation.stream !== undefined);

  const local = new LocalORBTransportAdapter();
  const attemptsByOperation = new Map<string, number>();
  registerQualityGateHandlers(local, descriptor, attemptsByOperation);

  const router = new MCPCapabilityRouter({
    adapters: createDefaultORBAdapters(local),
    control_surface_policy_evaluator: options.control_surface_policy_evaluator
      ?? generatedAppQualityGatePolicyEvaluator,
    operation_policies: zeroBackoffRetryPolicies(descriptor),
  });
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

  const workflow = descriptor.workflow_graph
    ? await executeWorkflowQualityGate({
      router,
      descriptorSource,
      descriptor,
      attemptsByOperation,
      stream_reconnect: Boolean(stream?.recovered),
    })
    : undefined;

  return {
    app_id: options.app_id,
    descriptor_cid: launch.cid,
    launch,
    generated_ui: generatedUI,
    invoked_operation: invokeOperation,
    invocation,
    denial,
    stream,
    workflow,
  };
}

function generatedAppQualityGatePolicyEvaluator(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow',
    reasons: ['Generated app quality gate registered a runtime control_surface policy evaluator.'],
    explanation: `Generated app quality gate allowed ${request.interaction_envelope.normalized_intent.method}.`,
    metadata: {
      quality_gate_policy_evaluator: 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction',
    },
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

function registerQualityGateHandlers(
  local: LocalORBTransportAdapter,
  descriptor: MCPUIProfileDescriptor,
  attemptsByOperation: Map<string, number>,
): void {
  for (const operation of descriptor.data_contracts.operations) {
    local.registerHandler(operation.method, ({ binding, input, context }) => {
      const attempts = (attemptsByOperation.get(binding.operation.method) ?? 0) + 1;
      attemptsByOperation.set(binding.operation.method, attempts);
      if (shouldSimulateTransientFailure(binding.operation.method, attempts)) {
        throw new Error(`Simulated transient failure for ${binding.operation.method}.`);
      }
      return sampleOutput(binding.operation, context.correlation_id, input);
    });

    if (operation.stream) {
      local.registerStreamHandler(operation.method, async function* ({ binding, context }) {
        yield {
          correlation_id: context.correlation_id ?? 'quality-gate-stream',
          interface_cid: binding.interface_cid,
          operation: binding.operation.method,
          event: sampleStreamEvent(binding.operation, context.correlation_id),
          received_at: '2026-05-21T00:00:00.000Z',
        };
      });
    }
  }
}

function shouldSimulateTransientFailure(operation: string, attempt: number): boolean {
  return attempt === 1 && (operation === 'pin_dataset' || operation === 'publish_artifact');
}

function zeroBackoffRetryPolicies(descriptor: MCPUIProfileDescriptor) {
  return Object.fromEntries(
    descriptor.data_contracts.operations
      .filter(operation => operation.retry_policy)
      .map(operation => [
        operation.method,
        {
          retry: {
            max_attempts: operation.retry_policy?.max_attempts ?? 1,
            backoff_ms: 0,
          },
        },
      ]),
  );
}

async function executeWorkflowQualityGate(options: {
  router: MCPCapabilityRouter;
  descriptorSource: { cid: string; descriptor: MCPUIProfileDescriptor };
  descriptor: MCPUIProfileDescriptor;
  attemptsByOperation: Map<string, number>;
  stream_reconnect: boolean;
}): Promise<GeneratedWorkflowQualityGateReport> {
  const graph = options.descriptor.workflow_graph;
  if (!graph) {
    throw new Error('Workflow quality gate requires descriptor.workflow_graph.');
  }

  const state: Record<string, unknown> = {
    workflow_correlation_id: 'quality-gate-workflow',
  };
  const reports: GeneratedWorkflowStepReport[] = [];
  for (const step of orderWorkflowSteps(graph.steps)) {
    const binding = await options.router.bind({
      descriptors: [options.descriptorSource],
      operation: step.operation,
      service_id: step.service_id,
    });
    const operation = binding.operation;
    const input = sampleWorkflowInput(operation, step, state);
    const capabilities = options.descriptor.permissions.operations[operation.method] ?? [];
    const attemptsBefore = options.attemptsByOperation.get(operation.method) ?? 0;
    try {
      const response = await options.router.invoke({
        handle: binding.handle,
        input,
        context: {
          correlation_id: String(state.workflow_correlation_id),
          capabilities,
        },
      });
      const attemptsAfter = options.attemptsByOperation.get(operation.method) ?? attemptsBefore;
      const report: GeneratedWorkflowStepReport = {
        id: step.id,
        operation: step.operation,
        service_id: step.service_id,
        status: response.denied ? 'denied' : 'completed',
        attempts: Math.max(1, attemptsAfter - attemptsBefore),
        receipt_cid: response.receipt.receipt_cid,
        output: response.output,
      };
      reports.push(report);
      if (response.denied) {
        break;
      }
      applyWorkflowStepOutput(step, response.output, state);
    } catch (error) {
      const attemptsAfter = options.attemptsByOperation.get(operation.method) ?? attemptsBefore;
      reports.push({
        id: step.id,
        operation: step.operation,
        service_id: step.service_id,
        status: 'failed',
        attempts: Math.max(1, attemptsAfter - attemptsBefore),
        error: errorMessage(error),
      });
      break;
    }
  }

  const rollbackStep = graph.steps.find(step => step.rollback);
  const rollback = rollbackStep?.rollback
    ? await exerciseWorkflowAction(options, rollbackStep.rollback, state)
    : undefined;
  const compensationStep = graph.steps.find(step => step.compensation);
  const compensation = compensationStep?.compensation
    ? await exerciseWorkflowAction(options, compensationStep.compensation, state)
    : undefined;

  return {
    graph_id: graph.id,
    completed_steps: reports.filter(report => report.status === 'completed').map(report => report.id),
    steps: reports,
    final_state: { ...state },
    rollback,
    compensation,
    recovery_paths: {
      failed_pin_retry: (options.attemptsByOperation.get('pin_dataset') ?? 0) > 1,
      failed_inference_rollback: rollback?.status === 'completed',
      stream_reconnect: options.stream_reconnect,
      artifact_publish_retry: (options.attemptsByOperation.get('publish_artifact') ?? 0) > 1,
    },
  };
}

async function exerciseWorkflowAction(
  options: {
    router: MCPCapabilityRouter;
    descriptorSource: { cid: string; descriptor: MCPUIProfileDescriptor };
    descriptor: MCPUIProfileDescriptor;
  },
  action: MCPUIWorkflowAction,
  state: Record<string, unknown>,
): Promise<GeneratedWorkflowActionReport> {
  const binding = await options.router.bind({
    descriptors: [options.descriptorSource],
    operation: action.operation,
    service_id: action.service_id,
  });
  const capabilities = options.descriptor.permissions.operations[action.operation] ?? [];
  try {
    const response = await options.router.invoke({
      handle: binding.handle,
      input: sampleWorkflowActionInput(binding.operation, action, state),
      context: {
        correlation_id: String(state.workflow_correlation_id ?? 'quality-gate-workflow'),
        capabilities,
      },
    });
    return {
      operation: action.operation,
      service_id: action.service_id,
      reason: action.reason,
      status: response.denied ? 'denied' : 'completed',
      receipt_cid: response.receipt.receipt_cid,
      output: response.output,
    };
  } catch (error) {
    return {
      operation: action.operation,
      service_id: action.service_id,
      reason: action.reason,
      status: 'failed',
      error: errorMessage(error),
    };
  }
}

function orderWorkflowSteps(steps: MCPUIWorkflowStep[]): MCPUIWorkflowStep[] {
  const remaining = new Map(steps.map(step => [step.id, step]));
  const completed = new Set<string>();
  const ordered: MCPUIWorkflowStep[] = [];
  while (remaining.size > 0) {
    const ready = Array.from(remaining.values()).find(
      step => (step.depends_on ?? []).every(dependency => completed.has(dependency)),
    );
    if (!ready) {
      throw new Error('Workflow graph dependencies could not be ordered.');
    }
    ordered.push(ready);
    remaining.delete(ready.id);
    completed.add(ready.id);
  }
  return ordered;
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

function sampleWorkflowInput(
  operation: MCPUIOperationContract,
  step: MCPUIWorkflowStep,
  state: Record<string, unknown>,
): Record<string, unknown> {
  const input = sampleInput(operation);
  for (const key of step.read_state_keys ?? []) {
    const inputKey = workflowInputKey(key);
    const value = state[key];
    if (value !== undefined) {
      input[inputKey] = value;
    }
  }
  return fillWorkflowInput(operation, input, state);
}

function sampleWorkflowActionInput(
  operation: MCPUIOperationContract,
  action: MCPUIWorkflowAction,
  state: Record<string, unknown>,
): Record<string, unknown> {
  const input = sampleInput(operation);
  for (const key of action.state_keys ?? []) {
    const inputKey = workflowInputKey(key);
    const value = state[key];
    if (value !== undefined) {
      input[inputKey] = value;
    }
  }
  return fillWorkflowInput(operation, input, state);
}

function fillWorkflowInput(
  operation: MCPUIOperationContract,
  input: Record<string, unknown>,
  state: Record<string, unknown>,
): Record<string, unknown> {
  input.correlation_id = input.correlation_id ?? state.workflow_correlation_id ?? 'quality-gate-workflow';
  if (operation.method === 'select_dataset') {
    input.root_cid = input.root_cid ?? 'bafybeigdyrzt5dataset';
    input.path = input.path ?? '/';
  }
  if (operation.method === 'pin_dataset') {
    input.dataset_cid = input.dataset_cid ?? state.selected_dataset_cid ?? 'bafybeigdyrzt5dataset';
  }
  if (operation.method === 'run_inference_job') {
    input.model_id = input.model_id ?? 'quality-gate-model';
    input.input_ref = input.input_ref ?? { cid: state.pinned_dataset_cid ?? state.selected_dataset_cid ?? 'bafybeigdyrzt5dataset' };
    input.publish_artifacts = input.publish_artifacts ?? true;
  }
  if (operation.method === 'job_status') {
    input.job_id = input.job_id ?? state.inference_job_id ?? 'quality-gate-job';
  }
  if (operation.method === 'publish_artifact') {
    input.job_id = input.job_id ?? state.inference_job_id ?? 'quality-gate-job';
    input.artifact_cid = input.artifact_cid ?? state.artifact_cid ?? 'bafybeigdyrzt5artifact';
    input.destination = input.destination ?? 'ipfs';
  }
  return input;
}

function workflowInputKey(stateKey: string): string {
  return ({
    workflow_correlation_id: 'correlation_id',
    selected_dataset_cid: 'dataset_cid',
    pinned_dataset_cid: 'dataset_cid',
    inference_job_id: 'job_id',
  } as Record<string, string>)[stateKey] ?? stateKey;
}

function applyWorkflowStepOutput(
  step: MCPUIWorkflowStep,
  output: unknown,
  state: Record<string, unknown>,
): void {
  if (!isRecord(output)) {
    return;
  }
  for (const key of step.write_state_keys ?? []) {
    const value = workflowStateValue(key, output, state);
    if (value !== undefined) {
      state[key] = value;
    }
  }
}

function workflowStateValue(
  stateKey: string,
  output: Record<string, unknown>,
  state: Record<string, unknown>,
): unknown {
  if (stateKey === 'workflow_correlation_id') {
    return output.correlation_id ?? state.workflow_correlation_id;
  }
  if (stateKey === 'selected_dataset_cid') {
    return output.dataset_cid ?? output.cid;
  }
  if (stateKey === 'pinned_dataset_cid') {
    return output.pinned_cid ?? output.dataset_cid ?? output.cid;
  }
  if (stateKey === 'inference_job_id') {
    return output.job_id;
  }
  if (stateKey === 'artifact_cid') {
    return output.artifact_cid;
  }
  if (stateKey === 'publication_id') {
    return output.publication_id;
  }
  return output[stateKey];
}

function sampleOutput(
  operation: MCPUIOperationContract,
  correlationId?: string,
  input?: unknown,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const properties = operation.output_schema?.properties;
  if (isRecord(properties)) {
    for (const [key, schema] of Object.entries(properties)) {
      output[key] = sampleValue(isRecord(schema) ? schema : {});
    }
  }
  output.correlation_id = correlationId ?? output.correlation_id ?? 'quality-gate-invoke';
  if (operation.method === 'select_dataset') {
    output.dataset_cid = 'bafybeigdyrzt5dataset';
    output.dataset_id = 'quality-gate-dataset';
    output.path = '/';
  }
  if (operation.method === 'pin_dataset') {
    output.job_id = 'quality-gate-pin-job';
    output.pinned_cid = isRecord(input) && typeof input.dataset_cid === 'string'
      ? input.dataset_cid
      : 'bafybeigdyrzt5dataset';
    output.status = 'completed';
  }
  if (operation.method === 'run_inference_job') {
    output.job_id = 'quality-gate-inference-job';
    output.status = 'running';
    output.telemetry_stream = 'quality-gate-telemetry';
  }
  if (operation.method === 'job_status') {
    output.job_id = isRecord(input) && typeof input.job_id === 'string'
      ? input.job_id
      : 'quality-gate-inference-job';
    output.status = 'completed';
    output.progress = 1;
    output.artifact_cid = 'bafybeigdyrzt5artifact';
  }
  if (operation.method === 'publish_artifact') {
    output.publication_id = 'quality-gate-publication';
    output.artifact_cid = isRecord(input) && typeof input.artifact_cid === 'string'
      ? input.artifact_cid
      : 'bafybeigdyrzt5artifact';
  }
  return output;
}

function sampleStreamEvent(operation: MCPUIOperationContract, correlationId?: string): Record<string, unknown> {
  const event: Record<string, unknown> = {
    correlation_id: correlationId ?? 'quality-gate-stream',
    status: 'running',
    timestamp: '2026-05-21T00:00:00.000Z',
  };
  if (operation.stream?.kind === 'progress') {
    event.operation = progressEventOperation(operation.method);
    event.progress = 0.5;
  }
  if (operation.stream?.kind === 'telemetry' || operation.stream?.kind === 'job-status') {
    event.metrics = { latency_ms: 1 };
  }
  return event;
}

function progressEventOperation(method: string): string {
  if (method.includes('pin')) {
    return 'pin';
  }
  if (method.includes('publish')) {
    return 'publish';
  }
  if (method.includes('sync')) {
    return 'sync';
  }
  if (method.includes('index')) {
    return 'index';
  }
  return method;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

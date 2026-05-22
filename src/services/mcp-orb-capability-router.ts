import { randomUUID } from 'crypto';
import type { InterfaceDescriptor, MethodSignature } from './mcp-idl.js';
import { computeCID } from './mcp-idl.js';
import type { MCPInterfaceDiscoveryRegistry } from './mcp-interface-registry.js';
import type {
  InterfaceType,
  MCPUIOperationContract,
  MCPUIProfileDescriptor,
  MCPUIServiceDescriptor,
} from './mcp-ui-profile.js';

export const ORB_TRANSPORT_KINDS = ['local', 'websocket', 'http', 'mcp-server'] as const;

export type ORBTransportKind = (typeof ORB_TRANSPORT_KINDS)[number];

export type ORBLifecyclePhase =
  | 'discover'
  | 'bind'
  | 'authorize'
  | 'invoke'
  | 'stream'
  | 'recover';

export type ORBLifecycleStatus = 'ok' | 'denied' | 'error';

export interface ORBLifecycleRecord {
  phase: ORBLifecyclePhase;
  status: ORBLifecycleStatus;
  at: string;
  message?: string;
}

export interface ORBDescriptorSource {
  cid: string;
  descriptor: MCPUIProfileDescriptor;
}

export interface ORBDiscoveryRequest {
  descriptors?: ORBDescriptorSource[];
  app_id?: string;
  interface_type?: InterfaceType;
  operation?: string;
  transport?: ORBTransportKind;
}

export interface ORBDiscoveredCapability {
  interface_cid: string;
  descriptor: MCPUIProfileDescriptor;
  service: MCPUIServiceDescriptor;
  method: MethodSignature;
  operation: MCPUIOperationContract;
  transport: ORBTransportKind;
  lifecycle: ORBLifecycleRecord[];
}

export interface ORBInvocationContext {
  correlation_id?: string;
  caller_did?: string;
  capabilities?: string[];
  policy_cid?: string;
  parent_receipt_cids?: string[];
  metadata?: Record<string, unknown>;
}

export interface ORBPolicyDecision {
  outcome: 'permit' | 'deny';
  reasons: string[];
  required_capabilities: string[];
  granted_capabilities: string[];
  decision_cid: string;
}

export interface ORBAuthorizationPolicy {
  required_capabilities?: string[];
}

export interface ORBRateLimitPolicy {
  max_invocations: number;
  window_ms: number;
}

export interface ORBRetryPolicy {
  max_attempts: number;
  backoff_ms: number;
}

export interface ORBCircuitBreakerPolicy {
  failure_threshold: number;
  cooldown_ms: number;
}

export interface ORBIdempotencyPolicy {
  required?: boolean;
  key_field?: string;
  cache_success?: boolean;
}

export interface ORBOperationPolicy {
  authorization?: ORBAuthorizationPolicy;
  rate_limit?: ORBRateLimitPolicy;
  retry?: ORBRetryPolicy;
  circuit_breaker?: ORBCircuitBreakerPolicy;
  idempotency?: ORBIdempotencyPolicy;
}

export interface ORBPolicyRequest {
  binding: ORBBoundOperation;
  input: unknown;
  context: ORBInvocationContext;
}

export type ORBPolicyHook = (request: ORBPolicyRequest) => Promise<ORBPolicyDecision> | ORBPolicyDecision;

export interface ORBTransportDiscoveryRequest {
  descriptor: MCPUIProfileDescriptor;
  service: MCPUIServiceDescriptor;
}

export interface ORBTransportDiscoveryResult {
  reachable: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ORBTransportBindRequest {
  capability: ORBDiscoveredCapability;
  context?: ORBInvocationContext;
}

export interface ORBTransportBinding {
  transport: ORBTransportKind;
  service_id: string;
  operation: string;
  endpoint?: string;
  metadata?: Record<string, unknown>;
}

export interface ORBTransportInvocationRequest {
  binding: ORBBoundOperation;
  input: unknown;
  context: ORBInvocationContext;
}

export interface ORBTransportInvocationResult {
  output: unknown;
  output_refs?: string[];
  provenance_refs?: string[];
  metadata?: Record<string, unknown>;
}

export interface ORBStreamEvent {
  correlation_id: string;
  interface_cid: string;
  operation: string;
  event: unknown;
  event_cid?: string;
  generation_key?: string;
  binding_handle?: string;
  binding_generation?: number;
  received_at: string;
}

export interface ORBStreamRequest {
  binding: ORBBoundOperation;
  context: ORBInvocationContext;
}

export interface ORBRecoveryRequest {
  binding: ORBBoundOperation;
  context: ORBInvocationContext;
  reason?: string;
}

export interface ORBRecoveryResult {
  recovered: boolean;
  reason: string;
  new_binding?: ORBTransportBinding;
}

export interface ORBTransportAdapter {
  readonly kind: ORBTransportKind;
  discover(request: ORBTransportDiscoveryRequest): Promise<ORBTransportDiscoveryResult> | ORBTransportDiscoveryResult;
  bind(request: ORBTransportBindRequest): Promise<ORBTransportBinding> | ORBTransportBinding;
  invoke(request: ORBTransportInvocationRequest): Promise<ORBTransportInvocationResult> | ORBTransportInvocationResult;
  stream?(request: ORBStreamRequest): AsyncIterable<ORBStreamEvent> | Promise<AsyncIterable<ORBStreamEvent>>;
  recover?(request: ORBRecoveryRequest): Promise<ORBRecoveryResult> | ORBRecoveryResult;
}

export interface ORBBindRequest {
  capability?: ORBDiscoveredCapability;
  interface_cid?: string;
  service_id?: string;
  operation?: string;
  descriptors?: ORBDescriptorSource[];
  context?: ORBInvocationContext;
}

export interface ORBBoundOperation {
  handle: string;
  interface_cid: string;
  descriptor: MCPUIProfileDescriptor;
  service: MCPUIServiceDescriptor;
  method: MethodSignature;
  operation: MCPUIOperationContract;
  transport: ORBTransportKind;
  transport_binding: ORBTransportBinding;
  binding_generation: number;
  lifecycle: ORBLifecycleRecord[];
}

export interface ORBInvocationReceipt {
  receipt_cid: string;
  correlation_id: string;
  interface_cid: string;
  descriptor_name: string;
  descriptor_version: string;
  service_id: string;
  operation: string;
  transport: ORBTransportKind;
  policy_decision: ORBPolicyDecision;
  output_cid?: string;
  output_refs: string[];
  provenance_refs: string[];
  parent_receipt_cids: string[];
  lifecycle: ORBLifecycleRecord[];
  issued_at: string;
}

export interface ORBInvocationRequest {
  handle: string;
  input: unknown;
  context?: ORBInvocationContext;
}

export interface ORBInvocationResponse {
  output: unknown;
  receipt: ORBInvocationReceipt;
  denied: boolean;
}

export interface ORBStreamSubscription {
  correlation_id: string;
  receipt: ORBInvocationReceipt;
  events: AsyncIterable<ORBStreamEvent>;
}

export interface MCPCapabilityRouterOptions {
  registry?: MCPInterfaceDiscoveryRegistry;
  adapters?: ORBTransportAdapter[];
  policy_hook?: ORBPolicyHook;
  operation_policies?: Record<string, ORBOperationPolicy>;
}

export interface LocalORBHandlerRequest {
  binding: ORBBoundOperation;
  input: unknown;
  context: ORBInvocationContext;
}

export type LocalORBOperationHandler =
  (request: LocalORBHandlerRequest) => Promise<unknown | ORBTransportInvocationResult> | unknown | ORBTransportInvocationResult;

export type LocalORBStreamHandler =
  (request: ORBStreamRequest) => AsyncIterable<ORBStreamEvent> | Promise<AsyncIterable<ORBStreamEvent>>;

export class LocalORBTransportAdapter implements ORBTransportAdapter {
  readonly kind = 'local' as const;
  private readonly handlers = new Map<string, LocalORBOperationHandler>();
  private readonly streamHandlers = new Map<string, LocalORBStreamHandler>();

  registerHandler(operation: string, handler: LocalORBOperationHandler): void {
    this.handlers.set(operation, handler);
  }

  registerServiceHandler(serviceId: string, operation: string, handler: LocalORBOperationHandler): void {
    this.handlers.set(`${serviceId}.${operation}`, handler);
  }

  registerStreamHandler(operation: string, handler: LocalORBStreamHandler): void {
    this.streamHandlers.set(operation, handler);
  }

  registerServiceStreamHandler(serviceId: string, operation: string, handler: LocalORBStreamHandler): void {
    this.streamHandlers.set(`${serviceId}.${operation}`, handler);
  }

  discover(): ORBTransportDiscoveryResult {
    return {
      reachable: true,
      metadata: { mode: 'in-process' },
    };
  }

  bind(request: ORBTransportBindRequest): ORBTransportBinding {
    return {
      transport: this.kind,
      service_id: request.capability.service.id,
      operation: request.capability.operation.method,
      endpoint: request.capability.service.endpoint,
      metadata: { bound_at: new Date().toISOString() },
    };
  }

  async invoke(request: ORBTransportInvocationRequest): Promise<ORBTransportInvocationResult> {
    const handler = this.resolveHandler(request.binding);
    if (!handler) {
      throw new Error(`No local ORB handler registered for ${request.binding.service.id}.${request.binding.operation.method}.`);
    }

    const result = await handler({
      binding: request.binding,
      input: request.input,
      context: request.context,
    });

    return isTransportInvocationResult(result)
      ? result
      : { output: result };
  }

  async stream(request: ORBStreamRequest): Promise<AsyncIterable<ORBStreamEvent>> {
    const handler = this.resolveStreamHandler(request.binding);
    if (!handler) {
      throw new Error(`No local ORB stream handler registered for ${request.binding.service.id}.${request.binding.operation.method}.`);
    }
    return handler(request);
  }

  recover(request: ORBRecoveryRequest): ORBRecoveryResult {
    return {
      recovered: true,
      reason: request.reason ?? 'local bindings are stateless',
      new_binding: request.binding.transport_binding,
    };
  }

  private resolveHandler(binding: ORBBoundOperation): LocalORBOperationHandler | undefined {
    return this.handlers.get(`${binding.service.id}.${binding.operation.method}`)
      ?? this.handlers.get(binding.operation.method);
  }

  private resolveStreamHandler(binding: ORBBoundOperation): LocalORBStreamHandler | undefined {
    return this.streamHandlers.get(`${binding.service.id}.${binding.operation.method}`)
      ?? this.streamHandlers.get(binding.operation.method);
  }
}

abstract class EndpointORBTransportAdapter implements ORBTransportAdapter {
  abstract readonly kind: ORBTransportKind;

  discover(request: ORBTransportDiscoveryRequest): ORBTransportDiscoveryResult {
    return {
      reachable: Boolean(request.service.endpoint),
      reason: request.service.endpoint ? undefined : `Service ${request.service.id} does not declare an endpoint.`,
      metadata: {
        endpoint: request.service.endpoint,
      },
    };
  }

  bind(request: ORBTransportBindRequest): ORBTransportBinding {
    return {
      transport: this.kind,
      service_id: request.capability.service.id,
      operation: request.capability.operation.method,
      endpoint: request.capability.service.endpoint,
      metadata: {
        descriptor: request.capability.descriptor.name,
        bound_at: new Date().toISOString(),
      },
    };
  }

  invoke(request: ORBTransportInvocationRequest): ORBTransportInvocationResult {
    throw new Error(`${this.kind} ORB invocation is a transport contract only; provide a concrete adapter before invoking ${request.binding.operation.method}.`);
  }

  recover(request: ORBRecoveryRequest): ORBRecoveryResult {
    return {
      recovered: false,
      reason: `${this.kind} adapter has no concrete reconnect implementation for ${request.binding.operation.method}.`,
    };
  }
}

export class WebSocketORBTransportAdapter extends EndpointORBTransportAdapter {
  readonly kind = 'websocket' as const;
}

export class HttpORBTransportAdapter extends EndpointORBTransportAdapter {
  readonly kind = 'http' as const;
}

export class MCPServerBridgeORBTransportAdapter extends EndpointORBTransportAdapter {
  readonly kind = 'mcp-server' as const;
}

export class MCPCapabilityRouter {
  private readonly adapters = new Map<ORBTransportKind, ORBTransportAdapter>();
  private readonly bindings = new Map<string, ORBBoundOperation>();
  private readonly registry?: MCPInterfaceDiscoveryRegistry;
  private readonly policyHook: ORBPolicyHook;
  private readonly operationPolicies: Map<string, ORBOperationPolicy> = new Map();
  private readonly rateLimitState = new Map<string, { count: number; window_start: number }>();
  private readonly circuitBreakerState = new Map<string, { failures: number; open_until: number }>();
  private readonly idempotencyCache = new Map<string, ORBTransportInvocationResult>();

  constructor(options: MCPCapabilityRouterOptions = {}) {
    this.registry = options.registry;
    this.policyHook = options.policy_hook ?? (request => this.evaluateOperationPolicy(request));

    for (const [operation, policy] of Object.entries(options.operation_policies ?? {})) {
      this.operationPolicies.set(operation, policy);
    }

    for (const adapter of options.adapters ?? createDefaultORBAdapters()) {
      this.registerAdapter(adapter);
    }
  }

  registerAdapter(adapter: ORBTransportAdapter): void {
    this.adapters.set(adapter.kind, adapter);
  }

  setOperationPolicy(operation: string, policy: ORBOperationPolicy): void {
    this.operationPolicies.set(operation, policy);
  }

  getOperationPolicy(operation: string): ORBOperationPolicy | undefined {
    return this.operationPolicies.get(operation);
  }

  getAdapter(kind: ORBTransportKind): ORBTransportAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`No ORB transport adapter registered for ${kind}.`);
    }
    return adapter;
  }

  listAdapters(): ORBTransportKind[] {
    return Array.from(this.adapters.keys()).sort() as ORBTransportKind[];
  }

  async discover(request: ORBDiscoveryRequest = {}): Promise<ORBDiscoveredCapability[]> {
    const sources = await this.collectDescriptorSources(request);
    const capabilities: ORBDiscoveredCapability[] = [];

    for (const source of sources) {
      if (request.app_id && source.descriptor.meta.app_id !== request.app_id) {
        continue;
      }

      for (const service of source.descriptor.services) {
        if (request.interface_type && service.interface_type !== request.interface_type) {
          continue;
        }

        const transport = normalizeTransport(service.transport);
        if (request.transport && transport !== request.transport) {
          continue;
        }

        const adapter = this.adapters.get(transport);
        if (!adapter) {
          continue;
        }

        const transportDiscovery = await adapter.discover({
          descriptor: source.descriptor,
          service,
        });
        if (!transportDiscovery.reachable) {
          continue;
        }

        for (const operationName of service.operations) {
          if (request.operation && operationName !== request.operation) {
            continue;
          }

          const method = source.descriptor.methods.find(candidate => candidate.name === operationName);
          const operation = source.descriptor.data_contracts.operations.find(candidate => candidate.method === operationName);
          if (!method || !operation) {
            continue;
          }

          capabilities.push({
            interface_cid: source.cid,
            descriptor: source.descriptor,
            service,
            method,
            operation,
            transport,
            lifecycle: [
              lifecycle('discover', 'ok', transportDiscovery.reason),
            ],
          });
        }
      }
    }

    return capabilities.sort((a, b) => compareCapabilities(a, b));
  }

  async bind(request: ORBBindRequest): Promise<ORBBoundOperation> {
    const capability = request.capability ?? await this.resolveCapability(request);
    if (!capability) {
      throw new Error('No ORB capability matched the bind request.');
    }

    const adapter = this.getAdapter(capability.transport);
    const transportBinding = await adapter.bind({
      capability,
      context: request.context,
    });

    const binding: ORBBoundOperation = {
      handle: randomUUID(),
      interface_cid: capability.interface_cid,
      descriptor: capability.descriptor,
      service: capability.service,
      method: capability.method,
      operation: capability.operation,
      transport: capability.transport,
      transport_binding: transportBinding,
      binding_generation: 0,
      lifecycle: [
        ...capability.lifecycle,
        lifecycle('bind', 'ok'),
      ],
    };

    this.bindings.set(binding.handle, binding);
    return binding;
  }

  async authorize(
    handle: string,
    input: unknown,
    context: ORBInvocationContext = {},
  ): Promise<ORBPolicyDecision> {
    const binding = this.requireBinding(handle);
    const decision = await this.policyHook({ binding, input, context });
    binding.lifecycle.push(lifecycle(
      'authorize',
      decision.outcome === 'permit' ? 'ok' : 'denied',
      decision.reasons.join('; ') || undefined,
    ));
    return decision;
  }

  async invoke(request: ORBInvocationRequest): Promise<ORBInvocationResponse> {
    const binding = this.requireBinding(request.handle);
    const context = withCorrelationId(request.context);
    const policyDecision = await this.authorize(binding.handle, request.input, context);

    if (policyDecision.outcome === 'deny') {
      const output = {
        error: 'ORB_INVOCATION_DENIED',
        reasons: policyDecision.reasons,
      };
      const receipt = buildORBReceipt(binding, output, policyDecision, context, [], []);
      return { output, receipt, denied: true };
    }

    const adapter = this.getAdapter(binding.transport);
    const cached = this.getCachedIdempotentResult(binding, request.input, context);
    if (cached) {
      binding.lifecycle.push(lifecycle('invoke', 'ok', 'idempotency cache hit'));
      const receipt = buildORBReceipt(
        binding,
        cached.output,
        policyDecision,
        context,
        cached.output_refs ?? collectOutputRefs(cached.output),
        cached.provenance_refs ?? collectProvenanceRefs(cached.output),
      );
      return {
        output: cached.output,
        receipt,
        denied: false,
      };
    }

    try {
      const result = await this.invokeWithPolicy(adapter, binding, request.input, context);
      binding.lifecycle.push(lifecycle('invoke', 'ok'));
      this.recordCircuitBreakerSuccess(binding);
      this.storeIdempotentResult(binding, request.input, context, result);
      const outputRefs = result.output_refs ?? collectOutputRefs(result.output);
      const provenanceRefs = result.provenance_refs ?? collectProvenanceRefs(result.output);
      const receipt = buildORBReceipt(binding, result.output, policyDecision, context, outputRefs, provenanceRefs);
      return {
        output: result.output,
        receipt,
        denied: false,
      };
    } catch (error) {
      binding.lifecycle.push(lifecycle('invoke', 'error', errorMessage(error)));
      this.recordCircuitBreakerFailure(binding);
      throw error;
    }
  }

  async stream(handle: string, context: ORBInvocationContext = {}): Promise<ORBStreamSubscription> {
    const binding = this.requireBinding(handle);
    const streamContext = withCorrelationId(context);
    const policyDecision = await this.authorize(binding.handle, {}, streamContext);
    if (policyDecision.outcome === 'deny') {
      binding.lifecycle.push(lifecycle('stream', 'denied', policyDecision.reasons.join('; ') || undefined));
      const receipt = buildORBReceipt(binding, { error: 'ORB_STREAM_DENIED' }, policyDecision, streamContext, [], []);
      return {
        correlation_id: streamContext.correlation_id,
        receipt,
        events: emptyAsyncIterable(),
      };
    }

    const adapter = this.getAdapter(binding.transport);
    if (!adapter.stream) {
      binding.lifecycle.push(lifecycle('stream', 'error', `${binding.transport} adapter does not support streams.`));
      throw new Error(`${binding.transport} adapter does not support streams.`);
    }

    const bindingGeneration = binding.binding_generation;
    const events = guardStreamEvents(
      await adapter.stream({ binding, context: streamContext }),
      binding,
      bindingGeneration,
    );
    binding.lifecycle.push(lifecycle('stream', 'ok'));
    const receipt = buildORBReceipt(binding, { stream: true }, policyDecision, streamContext, [], []);
    return {
      correlation_id: streamContext.correlation_id,
      receipt,
      events,
    };
  }

  async recover(handle: string, context: ORBInvocationContext = {}, reason?: string): Promise<ORBRecoveryResult> {
    const binding = this.requireBinding(handle);
    const adapter = this.getAdapter(binding.transport);
    if (!adapter.recover) {
      binding.lifecycle.push(lifecycle('recover', 'error', `${binding.transport} adapter does not support recovery.`));
      return {
        recovered: false,
        reason: `${binding.transport} adapter does not support recovery.`,
      };
    }

    const result = await adapter.recover({
      binding,
      context: withCorrelationId(context),
      reason,
    });

    if (result.new_binding) {
      binding.transport_binding = result.new_binding;
    }
    if (result.recovered) {
      binding.binding_generation += 1;
    }
    binding.lifecycle.push(lifecycle('recover', result.recovered ? 'ok' : 'error', result.reason));
    return result;
  }

  getBinding(handle: string): ORBBoundOperation | undefined {
    return this.bindings.get(handle);
  }

  private requireBinding(handle: string): ORBBoundOperation {
    const binding = this.bindings.get(handle);
    if (!binding) {
      throw new Error(`Unknown ORB binding handle: ${handle}.`);
    }
    return binding;
  }

  private async resolveCapability(request: ORBBindRequest): Promise<ORBDiscoveredCapability | undefined> {
    const capabilities = await this.discover({
      descriptors: request.descriptors,
      operation: request.operation,
    });
    return capabilities.find(capability => {
      if (request.interface_cid && capability.interface_cid !== request.interface_cid) {
        return false;
      }
      if (request.service_id && capability.service.id !== request.service_id) {
        return false;
      }
      if (request.operation && capability.operation.method !== request.operation) {
        return false;
      }
      return true;
    });
  }

  private async collectDescriptorSources(request: ORBDiscoveryRequest): Promise<ORBDescriptorSource[]> {
    const sources = new Map<string, ORBDescriptorSource>();
    for (const source of request.descriptors ?? []) {
      sources.set(source.cid, source);
    }

    if (this.registry) {
      const discovered = await this.registry.discover({ ui_only: true });
      for (const entry of discovered) {
        if (entry.ui_profile) {
          sources.set(entry.cid, {
            cid: entry.cid,
            descriptor: entry.ui_profile,
          });
        }
      }
    }

    return Array.from(sources.values());
  }

  private evaluateOperationPolicy(request: ORBPolicyRequest): ORBPolicyDecision {
    const operationPolicy = this.resolveOperationPolicy(request.binding);
    const descriptorCapabilities = request.binding.descriptor.permissions.operations[request.binding.operation.method] ?? [];
    const policyCapabilities = operationPolicy.authorization?.required_capabilities ?? [];
    const required = uniqueStrings([...descriptorCapabilities, ...policyCapabilities]);
    const granted = request.context.capabilities ?? [];
    const reasons: string[] = [];

    const missing = required.filter(capability => !granted.includes(capability));
    if ((request.binding.descriptor.permissions.default_deny || policyCapabilities.length > 0) && missing.length > 0) {
      reasons.push(...missing.map(capability => `Missing capability: ${capability}`));
    }

    const circuitReason = this.circuitBreakerDenialReason(request.binding);
    if (circuitReason) {
      reasons.push(circuitReason);
    }

    const rateLimitReason = this.rateLimitDenialReason(request.binding);
    if (rateLimitReason) {
      reasons.push(rateLimitReason);
    }

    const idempotencyReason = this.idempotencyDenialReason(request.binding, request.input, request.context);
    if (idempotencyReason) {
      reasons.push(idempotencyReason);
    }

    if (reasons.length > 0) {
      return createPolicyDecision({
        outcome: 'deny',
        reasons,
        required_capabilities: required,
        granted_capabilities: granted,
      });
    }

    return createPolicyDecision({
      outcome: 'permit',
      reasons: required.length === 0 ? ['No operation capabilities required.'] : ['Required capabilities granted.'],
      required_capabilities: required,
      granted_capabilities: granted,
    });
  }

  private async invokeWithPolicy(
    adapter: ORBTransportAdapter,
    binding: ORBBoundOperation,
    input: unknown,
    context: ORBInvocationContext,
  ): Promise<ORBTransportInvocationResult> {
    const retry = this.resolveRetryPolicy(binding);
    const attempts = Math.max(1, retry?.max_attempts ?? 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await adapter.invoke({ binding, input, context });
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          break;
        }
        await sleep(retry?.backoff_ms ?? 0);
      }
    }

    throw lastError;
  }

  private resolveOperationPolicy(binding: ORBBoundOperation): ORBOperationPolicy {
    return this.operationPolicies.get(`${binding.service.id}.${binding.operation.method}`)
      ?? this.operationPolicies.get(binding.operation.method)
      ?? {};
  }

  private resolveRetryPolicy(binding: ORBBoundOperation): ORBRetryPolicy | undefined {
    const operationPolicy = this.resolveOperationPolicy(binding);
    const retry = operationPolicy.retry;
    const descriptorRetry = binding.operation.retry_policy;
    if (retry) {
      return retry;
    }
    if (descriptorRetry?.max_attempts !== undefined || descriptorRetry?.backoff_ms !== undefined) {
      return {
        max_attempts: descriptorRetry.max_attempts ?? 1,
        backoff_ms: descriptorRetry.backoff_ms ?? 0,
      };
    }
    return undefined;
  }

  private policyStateKey(binding: ORBBoundOperation): string {
    return `${binding.interface_cid}:${binding.service.id}:${binding.operation.method}`;
  }

  private rateLimitDenialReason(binding: ORBBoundOperation): string | undefined {
    const rateLimit = this.resolveOperationPolicy(binding).rate_limit;
    if (!rateLimit) {
      return undefined;
    }

    const now = Date.now();
    const key = this.policyStateKey(binding);
    const current = this.rateLimitState.get(key);
    if (!current || now - current.window_start >= rateLimit.window_ms) {
      this.rateLimitState.set(key, { count: 1, window_start: now });
      return undefined;
    }
    if (current.count >= rateLimit.max_invocations) {
      return `Rate limit exceeded for ${binding.operation.method}.`;
    }
    current.count += 1;
    return undefined;
  }

  private circuitBreakerDenialReason(binding: ORBBoundOperation): string | undefined {
    const breaker = this.resolveOperationPolicy(binding).circuit_breaker;
    if (!breaker) {
      return undefined;
    }
    const state = this.circuitBreakerState.get(this.policyStateKey(binding));
    if (state && state.open_until > Date.now()) {
      return `Circuit breaker open for ${binding.operation.method}.`;
    }
    return undefined;
  }

  private recordCircuitBreakerSuccess(binding: ORBBoundOperation): void {
    if (this.resolveOperationPolicy(binding).circuit_breaker) {
      this.circuitBreakerState.delete(this.policyStateKey(binding));
    }
  }

  private recordCircuitBreakerFailure(binding: ORBBoundOperation): void {
    const breaker = this.resolveOperationPolicy(binding).circuit_breaker;
    if (!breaker) {
      return;
    }
    const key = this.policyStateKey(binding);
    const current = this.circuitBreakerState.get(key) ?? { failures: 0, open_until: 0 };
    current.failures += 1;
    if (current.failures >= breaker.failure_threshold) {
      current.open_until = Date.now() + breaker.cooldown_ms;
    }
    this.circuitBreakerState.set(key, current);
  }

  private idempotencyDenialReason(
    binding: ORBBoundOperation,
    input: unknown,
    context: ORBInvocationContext,
  ): string | undefined {
    const idempotency = this.resolveOperationPolicy(binding).idempotency;
    if (!idempotency?.required) {
      return undefined;
    }
    return resolveIdempotencyKey(idempotency, input, context)
      ? undefined
      : `Idempotency key required for ${binding.operation.method}.`;
  }

  private getCachedIdempotentResult(
    binding: ORBBoundOperation,
    input: unknown,
    context: ORBInvocationContext,
  ): ORBTransportInvocationResult | undefined {
    const idempotency = this.resolveOperationPolicy(binding).idempotency;
    if (!idempotency || idempotency.cache_success === false) {
      return undefined;
    }
    const key = resolveIdempotencyKey(idempotency, input, context);
    return key ? this.idempotencyCache.get(`${this.policyStateKey(binding)}:${key}`) : undefined;
  }

  private storeIdempotentResult(
    binding: ORBBoundOperation,
    input: unknown,
    context: ORBInvocationContext,
    result: ORBTransportInvocationResult,
  ): void {
    const idempotency = this.resolveOperationPolicy(binding).idempotency;
    if (!idempotency || idempotency.cache_success === false) {
      return;
    }
    const key = resolveIdempotencyKey(idempotency, input, context);
    if (key) {
      this.idempotencyCache.set(`${this.policyStateKey(binding)}:${key}`, result);
    }
  }
}

export function createDefaultORBAdapters(local?: LocalORBTransportAdapter): ORBTransportAdapter[] {
  return [
    local ?? new LocalORBTransportAdapter(),
    new WebSocketORBTransportAdapter(),
    new HttpORBTransportAdapter(),
    new MCPServerBridgeORBTransportAdapter(),
  ];
}

export function buildORBReceipt(
  binding: ORBBoundOperation,
  output: unknown,
  policyDecision: ORBPolicyDecision,
  context: ORBInvocationContext,
  outputRefs: string[],
  provenanceRefs: string[],
): ORBInvocationReceipt {
  const outputCid = computeCID(stableStringify(output));
  const receiptWithoutCid = {
    correlation_id: context.correlation_id ?? randomUUID(),
    interface_cid: binding.interface_cid,
    descriptor_name: binding.descriptor.name,
    descriptor_version: binding.descriptor.version,
    service_id: binding.service.id,
    operation: binding.operation.method,
    transport: binding.transport,
    policy_decision: policyDecision,
    output_cid: outputCid,
    output_refs: uniqueStrings([outputCid, ...outputRefs]),
    provenance_refs: uniqueStrings(provenanceRefs),
    parent_receipt_cids: context.parent_receipt_cids ?? [],
    lifecycle: binding.lifecycle.slice(),
    issued_at: new Date().toISOString(),
  };

  return {
    receipt_cid: computeCID(stableStringify(receiptWithoutCid)),
    ...receiptWithoutCid,
  };
}

export function defaultORBPolicyHook(request: ORBPolicyRequest): ORBPolicyDecision {
  const required = request.binding.descriptor.permissions.operations[request.binding.operation.method] ?? [];
  const granted = request.context.capabilities ?? [];
  const missing = required.filter(capability => !granted.includes(capability));

  if (request.binding.descriptor.permissions.default_deny && missing.length > 0) {
    return createPolicyDecision({
      outcome: 'deny',
      reasons: missing.map(capability => `Missing capability: ${capability}`),
      required_capabilities: required,
      granted_capabilities: granted,
    });
  }

  return createPolicyDecision({
    outcome: 'permit',
    reasons: required.length === 0 ? ['No operation capabilities required.'] : ['Required capabilities granted.'],
    required_capabilities: required,
    granted_capabilities: granted,
  });
}

export function createPolicyDecision(
  decision: Omit<ORBPolicyDecision, 'decision_cid'>,
): ORBPolicyDecision {
  return {
    ...decision,
    decision_cid: computeCID(stableStringify(decision)),
  };
}

function normalizeTransport(transport: MCPUIServiceDescriptor['transport']): ORBTransportKind {
  return transport ?? 'local';
}

function lifecycle(
  phase: ORBLifecyclePhase,
  status: ORBLifecycleStatus,
  message?: string,
): ORBLifecycleRecord {
  return {
    phase,
    status,
    at: new Date().toISOString(),
    message,
  };
}

function withCorrelationId(context: ORBInvocationContext = {}): ORBInvocationContext & { correlation_id: string } {
  return {
    ...context,
    correlation_id: context.correlation_id ?? randomUUID(),
  };
}

function resolveIdempotencyKey(
  policy: ORBIdempotencyPolicy,
  input: unknown,
  context: ORBInvocationContext,
): string | undefined {
  const metadataKey = context.metadata?.idempotency_key;
  if (typeof metadataKey === 'string' && metadataKey.length > 0) {
    return metadataKey;
  }

  if (policy.key_field && isRecord(input)) {
    const value = valueAtPath(input, policy.key_field);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  if (isRecord(input) && typeof input.idempotency_key === 'string' && input.idempotency_key.length > 0) {
    return input.idempotency_key;
  }

  return undefined;
}

function valueAtPath(input: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => (
    isRecord(current) ? current[segment] : undefined
  ), input);
}

function compareCapabilities(a: ORBDiscoveredCapability, b: ORBDiscoveredCapability): number {
  return [
    a.descriptor.name.localeCompare(b.descriptor.name),
    a.service.id.localeCompare(b.service.id),
    a.operation.method.localeCompare(b.operation.method),
  ].find(result => result !== 0) ?? 0;
}

function isTransportInvocationResult(value: unknown): value is ORBTransportInvocationResult {
  return isRecord(value) && 'output' in value;
}

function collectOutputRefs(output: unknown): string[] {
  const refs = collectStringFields(output, new Set(['cid', 'output_cid', 'artifact_cid', 'payload_cid']));
  return refs.filter(value => value.startsWith('sha256:') || value.startsWith('bafy') || value.startsWith('Qm'));
}

function collectProvenanceRefs(output: unknown): string[] {
  return collectStringFields(output, new Set([
    'provenance_cid',
    'source_interface_cid',
    'artifact_cid',
    'correlation_id',
  ]));
}

function collectStringFields(value: unknown, keys: Set<string>): string[] {
  const collected: string[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) {
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (keys.has(key) && typeof child === 'string' && child.length > 0) {
        collected.push(child);
      }
      visit(child);
    }
  };
  visit(value);
  return uniqueStrings(collected);
}

async function* guardStreamEvents(
  events: AsyncIterable<ORBStreamEvent>,
  binding: ORBBoundOperation,
  expectedGeneration: number,
): AsyncIterable<ORBStreamEvent> {
  for await (const event of events) {
    if (binding.binding_generation !== expectedGeneration) {
      continue;
    }
    yield {
      ...event,
      binding_handle: binding.handle,
      binding_generation: expectedGeneration,
      generation_key: event.generation_key ?? binding.operation.stream?.generation_key,
    };
  }
}

async function* emptyAsyncIterable(): AsyncIterable<ORBStreamEvent> {
  return;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',') + '}';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type ORBCompatibleDescriptor = InterfaceDescriptor & Partial<MCPUIProfileDescriptor>;

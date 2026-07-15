import {
  EXECUTABLE_BACKEND_GATEWAY_ROUTE,
  getExecutableAppBackendDisposition,
  resolveBackendRecovery,
  resolveMediatedInvocation,
  validateMediatedInvocationOutput,
  type BackendFailureCode,
  type BackendRecoveryRoute,
  type MediatedInvocationFailure,
  type MediatedInvocationPlan,
  type MediatedInvocationRequest,
  type MediatedPolicyOutcome,
} from '../apps/all-app-executable-backend-contract.js';

/**
 * Browser-only choke point for every SVD-103 application/backend pair.
 * Applications submit an intent and opaque payload here; they never receive a
 * Python endpoint, a process handle, a filesystem path, or backend credentials.
 */
export const ALL_APP_TOOL_GATEWAY_PROTOCOL = 'swissknife.all-app-tool-gateway.v1';

export type AllAppToolGatewayTransportKind = 'http' | 'libp2p';
export type AllAppToolGatewayOutcome = 'executed' | 'denied' | 'unsupported' | 'unreachable' | 'failed';
export type AllAppToolGatewayState = 'executed' | 'denied' | 'unavailable' | 'error';

export interface BrowserMediatedToolCall {
  protocol: typeof ALL_APP_TOOL_GATEWAY_PROTOCOL;
  route: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE;
  binding_id: string;
  app_id: string;
  intent_id: string;
  owner: string;
  tool_id: string;
  transport: AllAppToolGatewayTransportKind;
  correlation_id: string;
  input: MediatedInvocationPlan['input'];
  receipt_required: true;
}

/** A transport adapter is gateway-owned; application code receives no adapter. */
export interface AllAppToolGatewayTransport {
  kind: AllAppToolGatewayTransportKind;
  invoke(call: BrowserMediatedToolCall): Promise<unknown>;
}

export interface AllAppToolGatewayOptions {
  http?: AllAppToolGatewayTransport;
  libp2p?: AllAppToolGatewayTransport;
  now?: () => Date;
}

export interface AllAppToolGatewayHttpOptions {
  /** Must be the same browser gateway route, never a Python-owner URL. */
  endpoint?: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE;
  fetch?: typeof globalThis.fetch;
  headers?: Readonly<Record<string, string>>;
}

export interface AllAppToolGatewayEvent {
  phase: 'request' | 'policy' | 'response' | 'recovery';
  at: string;
  correlation_id: string;
  detail: Readonly<Record<string, unknown>>;
}

export interface AllAppToolGatewayRequestObservation {
  protocol: typeof ALL_APP_TOOL_GATEWAY_PROTOCOL;
  route: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE;
  dispatched: boolean;
  app_id: string;
  intent_id: string | null;
  owner: string | null;
  tool_id: string | null;
  transport: AllAppToolGatewayTransportKind | null;
  correlation_id: string;
}

export interface AllAppToolGatewayResponseObservation {
  received: boolean;
  valid: boolean;
  outcome: AllAppToolGatewayOutcome;
  response: unknown;
}

export interface AllAppToolGatewayResult {
  state: AllAppToolGatewayState;
  app_id: string;
  binding_id: string | null;
  intent_id: string | null;
  owner: string | null;
  tool_id: string | null;
  transport: AllAppToolGatewayTransportKind | null;
  correlation_id: string;
  policy_outcome: MediatedPolicyOutcome;
  request: AllAppToolGatewayRequestObservation;
  response: AllAppToolGatewayResponseObservation;
  recovery: BackendRecoveryRoute | null;
  events: readonly AllAppToolGatewayEvent[];
}

const FORBIDDEN_BROWSER_PAYLOAD_KEYS = new Set([
  'authorization', 'backend_credentials', 'bearer_token', 'api_key', 'password', 'secret',
  'host_path', 'file_path', 'filesystem_path', 'python_process', 'process_command', 'stdio',
]);

export class AllAppToolGateway {
  private readonly transports: ReadonlyMap<AllAppToolGatewayTransportKind, AllAppToolGatewayTransport>;
  private readonly now: () => Date;

  constructor(options: AllAppToolGatewayOptions = {}) {
    const transports = [options.http, options.libp2p]
      .filter((transport): transport is AllAppToolGatewayTransport => transport !== undefined);
    this.transports = new Map(transports.map(transport => [transport.kind, transport]));
    this.now = options.now ?? (() => new Date());
  }

  async invoke(request: MediatedInvocationRequest): Promise<AllAppToolGatewayResult> {
    const events: AllAppToolGatewayEvent[] = [];
    const policyOutcome = request.policy_decision?.outcome ?? 'deny';
    const boundaryError = forbiddenBrowserPayloadPath(request.payload);
    if (boundaryError) {
      const planned = resolveMediatedInvocation({ ...request, payload: {} });
      const failure = planned.ok ? undefined : planned;
      return this.failureResult(
        request,
        failure,
        'invalid_input',
        policyOutcome,
        events,
        boundaryError,
        planned.ok ? planned : undefined,
      );
    }

    const availableTransports = request.available_transports.filter(transport => this.transports.has(transport));
    const planned = resolveMediatedInvocation({ ...request, available_transports: availableTransports });
    if (!planned.ok) return this.failureResult(request, planned, planned.error, policyOutcome, events, planned.user_message);

    const plan = planned;
    const call = this.buildCall(plan);
    events.push(this.event('request', request.correlation_id, {
      route: call.route,
      binding_id: call.binding_id,
      owner: call.owner,
      tool_id: call.tool_id,
      transport: call.transport,
      dispatched: true,
    }));
    events.push(this.event('policy', request.correlation_id, {
      decision_id: plan.input.policy.decision_id,
      outcome: plan.input.policy.outcome,
      consent: plan.input.policy.consent,
      dry_run: plan.input.policy.dry_run,
    }));

    const transport = this.transports.get(plan.transport);
    if (!transport) {
      return this.failureResult(request, undefined, 'owner_unreachable', policyOutcome, events,
        `No browser ${plan.transport} gateway adapter is configured.` , plan);
    }

    let candidate: unknown;
    try {
      candidate = await transport.invoke(call);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser gateway transport failed.';
      return this.transportFailureResult(request, plan, policyOutcome, events, message);
    }

    const validation = validateMediatedInvocationOutput(plan, candidate);
    if (!validation.valid) {
      const outcome = outputOutcome(candidate) ?? 'failed';
      events.push(this.event('response', request.correlation_id, {
        received: true,
        valid: false,
        outcome,
        validation_error: validation.error,
      }));
      if (validation.recovery) events.push(this.recoveryEvent(request.correlation_id, validation.recovery));
      return {
        state: 'error',
        app_id: plan.app_id,
        binding_id: plan.binding_id,
        intent_id: plan.intent_id,
        owner: plan.owner,
        tool_id: plan.tool_id,
        transport: plan.transport,
        correlation_id: plan.correlation_id,
        policy_outcome: plan.input.policy.outcome,
        request: this.requestObservation(plan, true),
        response: { received: true, valid: false, outcome, response: candidate },
        recovery: validation.recovery,
        events,
      };
    }

    const output = candidate as {
      outcome: AllAppToolGatewayOutcome;
      receipt: { receipt_id: string; policy_outcome: MediatedPolicyOutcome };
    };
    events.push(this.event('response', request.correlation_id, {
      received: true,
      valid: true,
      outcome: output.outcome,
      receipt_id: output.receipt.receipt_id,
    }));
    const error = failureForOutcome(output.outcome);
    const recovery = error ? resolveRecovery(plan, error) : null;
    if (recovery) events.push(this.recoveryEvent(request.correlation_id, recovery));
    return {
      state: stateForOutcome(output.outcome),
      app_id: plan.app_id,
      binding_id: plan.binding_id,
      intent_id: plan.intent_id,
      owner: plan.owner,
      tool_id: plan.tool_id,
      transport: plan.transport,
      correlation_id: plan.correlation_id,
      policy_outcome: output.receipt.policy_outcome,
      request: this.requestObservation(plan, true),
      response: { received: true, valid: true, outcome: output.outcome, response: candidate },
      recovery,
      events,
    };
  }

  private buildCall(plan: MediatedInvocationPlan): BrowserMediatedToolCall {
    return {
      protocol: ALL_APP_TOOL_GATEWAY_PROTOCOL,
      route: plan.gateway_route,
      binding_id: plan.binding_id,
      app_id: plan.app_id,
      intent_id: plan.intent_id,
      owner: plan.owner,
      tool_id: plan.tool_id,
      transport: plan.transport,
      correlation_id: plan.correlation_id,
      input: plan.input,
      // Browser-mediated calls are receipt-bearing by contract. Output
      // validation also rejects a missing receipt, so do not weaken this wire
      // invariant when an upstream declaration is malformed.
      receipt_required: true,
    };
  }

  private failureResult(
    request: MediatedInvocationRequest,
    failure: MediatedInvocationFailure | undefined,
    error: BackendFailureCode,
    policyOutcome: MediatedPolicyOutcome,
    events: AllAppToolGatewayEvent[],
    message: string,
    plan?: MediatedInvocationPlan,
  ): AllAppToolGatewayResult {
    const recovery = failure?.recovery ?? (plan ? resolveRecovery(plan, error) : null);
    const outcome = outcomeForFailure(error);
    events.push(this.event('request', request.correlation_id, {
      route: EXECUTABLE_BACKEND_GATEWAY_ROUTE,
      dispatched: false,
      error,
    }));
    events.push(this.event('policy', request.correlation_id, { outcome: policyOutcome }));
    events.push(this.event('response', request.correlation_id, { received: false, valid: false, outcome, message }));
    if (recovery) events.push(this.recoveryEvent(request.correlation_id, recovery));
    return {
      state: stateForOutcome(outcome),
      app_id: request.app_id,
      binding_id: plan?.binding_id ?? null,
      intent_id: failure?.intent_id ?? plan?.intent_id ?? request.intent_id ?? null,
      owner: plan?.owner ?? request.owner ?? null,
      tool_id: plan?.tool_id ?? null,
      transport: plan?.transport ?? null,
      correlation_id: request.correlation_id,
      policy_outcome: policyOutcome,
      request: plan ? this.requestObservation(plan, false) : {
        protocol: ALL_APP_TOOL_GATEWAY_PROTOCOL,
        route: EXECUTABLE_BACKEND_GATEWAY_ROUTE,
        dispatched: false,
        app_id: request.app_id,
        intent_id: request.intent_id ?? null,
        owner: request.owner ?? null,
        tool_id: null,
        transport: null,
        correlation_id: request.correlation_id,
      },
      response: { received: false, valid: false, outcome, response: { error, message } },
      recovery,
      events,
    };
  }

  private transportFailureResult(
    request: MediatedInvocationRequest,
    plan: MediatedInvocationPlan,
    policyOutcome: MediatedPolicyOutcome,
    events: AllAppToolGatewayEvent[],
    message: string,
  ): AllAppToolGatewayResult {
    const response = browserGatewayFailureResponse(plan, 'unreachable', policyOutcome, { message });
    events.push(this.event('response', request.correlation_id, {
      received: false,
      valid: true,
      outcome: 'unreachable',
      message,
    }));
    const recovery = resolveRecovery(plan, 'owner_unreachable');
    if (recovery) events.push(this.recoveryEvent(request.correlation_id, recovery));
    return {
      state: 'unavailable',
      app_id: plan.app_id,
      binding_id: plan.binding_id,
      intent_id: plan.intent_id,
      owner: plan.owner,
      tool_id: plan.tool_id,
      transport: plan.transport,
      correlation_id: plan.correlation_id,
      policy_outcome: policyOutcome,
      request: this.requestObservation(plan, true),
      response: { received: false, valid: true, outcome: 'unreachable', response },
      recovery,
      events,
    };
  }

  private requestObservation(plan: MediatedInvocationPlan, dispatched: boolean): AllAppToolGatewayRequestObservation {
    return {
      protocol: ALL_APP_TOOL_GATEWAY_PROTOCOL,
      route: plan.gateway_route,
      dispatched,
      app_id: plan.app_id,
      intent_id: plan.intent_id,
      owner: plan.owner,
      tool_id: plan.tool_id,
      transport: plan.transport,
      correlation_id: plan.correlation_id,
    };
  }

  private event(
    phase: AllAppToolGatewayEvent['phase'],
    correlationId: string,
    detail: Readonly<Record<string, unknown>>,
  ): AllAppToolGatewayEvent {
    return { phase, at: this.now().toISOString(), correlation_id: correlationId, detail };
  }

  private recoveryEvent(correlationId: string, recovery: BackendRecoveryRoute): AllAppToolGatewayEvent {
    return this.event('recovery', correlationId, {
      error: recovery.error,
      action: recovery.action,
      next_error: recovery.next_error,
      preserves_correlation_id: recovery.preserves_correlation_id,
    });
  }
}

export function createAllAppToolGateway(options?: AllAppToolGatewayOptions): AllAppToolGateway {
  return new AllAppToolGateway(options);
}

/**
 * HTTP remains same-origin and fixed to /mcp/tools/call. The adapter cannot be
 * pointed at an owner process, so backend URLs and credentials never enter the
 * browser application API.
 */
export function createAllAppToolHttpGatewayTransport(
  options: AllAppToolGatewayHttpOptions = {},
): AllAppToolGatewayTransport {
  const endpoint = options.endpoint ?? EXECUTABLE_BACKEND_GATEWAY_ROUTE;
  const fetchClient = options.fetch ?? globalThis.fetch?.bind(globalThis);
  return {
    kind: 'http',
    async invoke(call: BrowserMediatedToolCall): Promise<unknown> {
      if (endpoint !== EXECUTABLE_BACKEND_GATEWAY_ROUTE || call.route !== EXECUTABLE_BACKEND_GATEWAY_ROUTE) {
        throw new Error('Browser tool dispatch may only use the mediated gateway route.');
      }
      if (!fetchClient) throw new Error('Browser fetch is unavailable for the mediated gateway.');
      const response = await fetchClient(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-swissknife-correlation-id': call.correlation_id,
          ...options.headers,
        },
        body: JSON.stringify(call),
      });
      if (!response.ok) {
        throw new Error(`Mediated gateway HTTP ${response.status}.`);
      }
      return response.json();
    },
  };
}

export function browserGatewayFailureResponse(
  plan: MediatedInvocationPlan,
  outcome: Exclude<AllAppToolGatewayOutcome, 'executed'>,
  policyOutcome: MediatedPolicyOutcome,
  result: unknown,
): Record<string, unknown> {
  return {
    ok: false,
    owner: plan.owner,
    tool_id: plan.tool_id,
    transport: plan.transport,
    correlation_id: plan.correlation_id,
    outcome,
    result,
    receipt: {
      receipt_id: `browser-gateway:${plan.correlation_id}:${outcome}`,
      correlation_id: plan.correlation_id,
      owner: plan.owner,
      tool_id: plan.tool_id,
      transport: plan.transport,
      policy_outcome: policyOutcome,
      outcome,
      persistence: 'browser-gateway-recovery-receipt',
    },
  };
}

function resolveRecovery(plan: MediatedInvocationPlan, error: BackendFailureCode): BackendRecoveryRoute | null {
  // The plan carries the binding identity but not its recovery object; resolve
  // it through the executable contract's canonical binding index.
  const app = getExecutableAppBackendDisposition(plan.app_id);
  const binding = app?.backend_bindings.find(candidate => candidate.binding_id === plan.binding_id);
  return binding ? resolveBackendRecovery(binding, error) : null;
}

function forbiddenBrowserPayloadPath(value: unknown, path = 'payload'): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenBrowserPayloadPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_BROWSER_PAYLOAD_KEYS.has(key.toLowerCase())) {
      return `${path}.${key} is forbidden at the browser gateway boundary`;
    }
    const found = forbiddenBrowserPayloadPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function outputOutcome(value: unknown): AllAppToolGatewayOutcome | null {
  if (!value || typeof value !== 'object') return null;
  const outcome = (value as { outcome?: unknown }).outcome;
  return outcome === 'executed' || outcome === 'denied' || outcome === 'unsupported'
    || outcome === 'unreachable' || outcome === 'failed' ? outcome : null;
}

function failureForOutcome(outcome: AllAppToolGatewayOutcome): BackendFailureCode | null {
  switch (outcome) {
    case 'executed': return null;
    case 'denied': return 'policy_denied';
    case 'unsupported': return 'tool_unsupported';
    case 'unreachable': return 'owner_unreachable';
    case 'failed': return 'invalid_output';
  }
}

function outcomeForFailure(error: BackendFailureCode): AllAppToolGatewayOutcome {
  switch (error) {
    case 'policy_denied': return 'denied';
    case 'tool_unsupported': return 'unsupported';
    case 'owner_unreachable': return 'unreachable';
    default: return 'failed';
  }
}

function stateForOutcome(outcome: AllAppToolGatewayOutcome): AllAppToolGatewayState {
  switch (outcome) {
    case 'executed': return 'executed';
    case 'denied': return 'denied';
    case 'unsupported':
    case 'unreachable': return 'unavailable';
    case 'failed': return 'error';
  }
}

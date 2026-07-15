import {
  ALL_APP_LIVE_TOOL_BINDINGS,
  invokeAllAppLiveToolBinding,
  validateAllAppLiveToolBindings,
} from '../../src/services/apps/all-app-live-tool-bindings';
import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  getExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
  type MediatedInvocationRequest,
} from '../../src/services/apps/all-app-executable-backend-contract';
import {
  AllAppToolGateway,
  type AllAppToolGatewayTransport,
  type BrowserMediatedToolCall,
} from '../../src/services/mcp/all-app-tool-gateway';

const NOW = () => new Date('2026-07-15T00:00:00.000Z');

function supervisorBinding(transport: 'http' | 'libp2p' = 'http'): ExecutableBackendBinding {
  const app = getExecutableAppBackendDisposition('agent-supervisor');
  const binding = app?.backend_bindings.find(candidate =>
    candidate.owner === 'ipfs_accelerate_py'
      && candidate.transport_policy.allowed_transports.includes(transport),
  );
  if (!binding) throw new Error(`Missing Agent Supervisor ${transport} binding fixture`);
  return binding;
}

function invocation(
  binding: ExecutableBackendBinding,
  transport: 'http' | 'libp2p' = 'http',
): MediatedInvocationRequest {
  return {
    app_id: 'agent-supervisor',
    intent_id: binding.mediated_intent.intent_id,
    correlation_id: `corr-svd-104-${transport}`,
    payload: { view: 'queue' },
    consent: 'granted',
    policy_decision: {
      decision_id: 'policy-svd-104',
      outcome: 'allow',
      reason: 'Browser-mediated gateway test fixture.',
    },
    dry_run: true,
    discovered_tools: [{ owner: binding.owner, tool_id: binding.tool_selection.preferred_tool_ids[0] }],
    available_transports: [transport],
  };
}

function executedResponse(call: BrowserMediatedToolCall): Record<string, unknown> {
  return {
    ok: true,
    owner: call.owner,
    tool_id: call.tool_id,
    transport: call.transport,
    correlation_id: call.correlation_id,
    outcome: 'executed',
    result: { queue: [] },
    receipt: {
      receipt_id: `receipt:${call.correlation_id}`,
      owner: call.owner,
      tool_id: call.tool_id,
      transport: call.transport,
      correlation_id: call.correlation_id,
      policy_outcome: 'allow',
      outcome: 'executed',
    },
  };
}

describe('SVD-104 all-app browser tool gateway', () => {
  it('materializes every tool-backed binding with a mediated gateway lifecycle', () => {
    const validation = validateAllAppLiveToolBindings();
    expect(validation).toEqual({ valid: true, errors: [] });

    const declared = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps
      .flatMap(app => app.disposition === 'tool_backed' ? app.backend_bindings : []);
    expect(ALL_APP_LIVE_TOOL_BINDINGS.bindings).toHaveLength(declared.length);
    expect(ALL_APP_LIVE_TOOL_BINDINGS.bindings.every(binding =>
      binding.gateway.direct_backend_access === false
      && binding.gateway.browser_credentials === 'never_exposed_to_application'
      && binding.observability.required_events.join(',') === 'request,policy,response,recovery',
    )).toBe(true);
  });

  it('dispatches an HTTP request with an observable correlation-preserving receipt', async () => {
    const binding = supervisorBinding();
    const calls: BrowserMediatedToolCall[] = [];
    const http: AllAppToolGatewayTransport = {
      kind: 'http',
      async invoke(call) {
        calls.push(call);
        return executedResponse(call);
      },
    };
    const gateway = new AllAppToolGateway({ http, now: NOW });

    const result = await invokeAllAppLiveToolBinding(
      binding.binding_id,
      invocation(binding),
      gateway,
    );

    expect(result).toMatchObject({
      state: 'executed',
      correlation_id: 'corr-svd-104-http',
      transport: 'http',
      request: { dispatched: true, route: '/mcp/tools/call' },
      response: { received: true, valid: true, outcome: 'executed' },
    });
    expect(result.events.map(event => event.phase)).toEqual(['request', 'policy', 'response']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      route: '/mcp/tools/call',
      owner: binding.owner,
      correlation_id: 'corr-svd-104-http',
      receipt_required: true,
    });
  });

  it('uses the declared libp2p transport without exposing an owner endpoint', async () => {
    const binding = supervisorBinding('libp2p');
    const calls: BrowserMediatedToolCall[] = [];
    const libp2p: AllAppToolGatewayTransport = {
      kind: 'libp2p',
      async invoke(call) {
        calls.push(call);
        return executedResponse(call);
      },
    };
    const gateway = new AllAppToolGateway({ libp2p, now: NOW });

    const result = await gateway.invoke(invocation(binding, 'libp2p'));

    expect(result).toMatchObject({ state: 'executed', transport: 'libp2p' });
    expect(calls[0]).toMatchObject({ transport: 'libp2p', route: '/mcp/tools/call' });
    expect(JSON.stringify(calls[0])).not.toMatch(/python|credential|endpoint|host_path/i);
  });

  it('rejects browser secrets before dispatch and preserves recovery correlation IDs', async () => {
    const binding = supervisorBinding();
    let calls = 0;
    const gateway = new AllAppToolGateway({
      http: {
        kind: 'http',
        async invoke() {
          calls += 1;
          throw new Error('should not dispatch');
        },
      },
      now: NOW,
    });
    const request = {
      ...invocation(binding),
      payload: { nested: { authorization: 'private-token' } },
    };

    const result = await gateway.invoke(request);

    expect(calls).toBe(0);
    expect(result).toMatchObject({
      state: 'error',
      correlation_id: 'corr-svd-104-http',
      request: { dispatched: false },
      response: { outcome: 'failed' },
      recovery: { error: 'invalid_input', preserves_correlation_id: true },
    });
    expect(result.events.map(event => event.phase)).toEqual(['request', 'policy', 'response', 'recovery']);
  });

  it('surfaces a transport failure with its declared recovery route instead of silently falling back', async () => {
    const binding = supervisorBinding();
    const gateway = new AllAppToolGateway({
      http: { kind: 'http', invoke: async () => { throw new Error('HTTP bridge unavailable'); } },
      now: NOW,
    });

    const result = await gateway.invoke(invocation(binding));

    expect(result).toMatchObject({
      state: 'unavailable',
      correlation_id: 'corr-svd-104-http',
      response: { outcome: 'unreachable' },
      recovery: { error: 'owner_unreachable', action: 'try_fallback_transport', preserves_correlation_id: true },
    });
    expect(result.events.map(event => event.phase)).toEqual(['request', 'policy', 'response', 'recovery']);
  });
});

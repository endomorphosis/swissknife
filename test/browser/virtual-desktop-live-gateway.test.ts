import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
} from '../../src/services/apps/all-app-executable-backend-contract';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import { createAllAppToolMediator } from '../../src/services/mcp/all-app-tool-mediator';
import { VirtualDesktopLiveGateway } from '../../src/services/mcp/virtual-desktop-live-gateway';

describe('SVD-126 virtual desktop live gateway bootstrap', () => {
  it('exposes one safe application control for every materialized binding', () => {
    const gateway = new VirtualDesktopLiveGateway({ fetch: async () => new Response('{}') });
    const controls = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app => gateway.controlsForApp(app.app_id));
    expect(controls).toHaveLength(79);
    expect(new Set(controls.map(control => control.binding.ui_control_id)).size).toBe(79);
    expect(controls.filter(control => control.mutates_remote_state).every(control => control.confirmation_required)).toBe(true);
  });

  it('uses only the same-origin mediator and sends governed controls as dry runs', async () => {
    const binding = ALL_APP_LIVE_TOOL_BINDINGS.bindings.find(candidate => {
      const app = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(item => item.app_id === candidate.app_id);
      return app?.backend_bindings.find(item => item.binding_id === candidate.binding_id)?.mediated_intent.mutates_remote_state;
    });
    expect(binding).toBeDefined();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const gateway = new VirtualDesktopLiveGateway({
      correlationId: () => 'desktop-correlation',
      fetch: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push({ url: String(input), body });
        return new Response(JSON.stringify({
          ok: true, owner: body.owner, tool_id: body.tool_id, transport: 'http', correlation_id: 'desktop-correlation', outcome: 'executed', result: {},
          receipt: { receipt_id: 'receipt:desktop-correlation', owner: body.owner, tool_id: body.tool_id, transport: 'http', correlation_id: 'desktop-correlation', policy_outcome: 'allow', outcome: 'executed' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const result = await gateway.invoke(binding!.binding_id);
    expect(result.state).toBe('executed');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/mcp/tools/call');
    expect((requests[0].body.input as { policy: { dry_run: boolean } }).policy.dry_run).toBe(true);
    expect(JSON.stringify(requests[0].body)).not.toMatch(/backend_url|authorization|password|secret/i);
  });

  it('mediates the exact binding identity and adds receipt and event-DAG references', async () => {
    const binding = ALL_APP_LIVE_TOOL_BINDINGS.bindings.find(candidate => candidate.gateway.transports.includes('http'))!;
    const source = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(app => app.app_id === binding.app_id)!
      .backend_bindings.find(item => item.binding_id === binding.binding_id)!;
    const mediator = createAllAppToolMediator({
      adapters: { [binding.owner]: { invoke: async call => ({ jsonrpc: '2.0', result: { selected: call.tool_id } }) } },
      now: () => new Date('2026-07-18T00:00:00.000Z'),
    });
    const result = await mediator.dispatch({
      protocol: 'swissknife.all-app-tool-gateway.v1', route: '/mcp/tools/call', binding_id: binding.binding_id,
      app_id: binding.app_id, intent_id: binding.intent_id, owner: binding.owner,
      tool_id: source.tool_selection.preferred_tool_ids[0], transport: 'http', correlation_id: 'corr-126',
      input: { correlation_id: 'corr-126', payload: { limit: 1 }, policy: { decision_id: 'policy', outcome: 'allow', reason: 'test', consent: 'granted', dry_run: true } },
      receipt_required: true,
    });
    expect(result).toMatchObject({ ok: true, owner: binding.owner, tool_id: source.tool_selection.preferred_tool_ids[0], correlation_id: 'corr-126' });
    expect(result.receipt.event_dag_refs).toEqual(['event-dag:corr-126']);
  });
});

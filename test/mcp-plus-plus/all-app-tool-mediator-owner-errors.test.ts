import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_APP_EXECUTABLE_BACKEND_CONTRACT } from '../../src/services/apps/all-app-executable-backend-contract';
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings';
import { createAllAppToolMediator } from '../../src/services/mcp/all-app-tool-mediator';
import type { BrowserMediatedToolCall } from '../../src/services/mcp/all-app-tool-gateway';

const binding = ALL_APP_LIVE_TOOL_BINDINGS.bindings.find(item => item.gateway.transports.includes('http'))!;
const source = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(app => app.app_id === binding.app_id)!
  .backend_bindings.find(item => item.binding_id === binding.binding_id)!;
const call: BrowserMediatedToolCall = {
  protocol: 'swissknife.all-app-tool-gateway.v1', route: '/mcp/tools/call',
  binding_id: binding.binding_id, app_id: binding.app_id, intent_id: binding.intent_id,
  owner: binding.owner, tool_id: source.tool_selection.preferred_tool_ids[0],
  transport: 'http', correlation_id: 'vdg-owner-result-regression', receipt_required: true,
  input: { correlation_id: 'vdg-owner-result-regression', payload: {},
    policy: { decision_id: 'vdg-test', outcome: 'allow', reason: 'isolated regression', consent: 'granted', dry_run: true } },
};

const failures = [
  { isError: true, content: [{ type: 'text', text: 'No callable implementation' }] },
  { application_transport_observation: { transport: 'http' }, result: { result: { isError: true, error: 'No callable implementation' } } },
  { jsonrpc: '2.0', result: { result: { success: false, error: 'Missing model mapping' } } },
  { response: { jsonrpc: '2.0', error: { code: -32603, message: 'Tool failed' } } },
  { content: [{ type: 'text', text: JSON.stringify({ isError: true, error: 'Tool failed' }) }] },
];
for (const [index, output] of failures.entries()) {
  test(`owner failure envelope ${index} cannot issue an executed receipt`, async () => {
    const mediator = createAllAppToolMediator({ adapters: { [binding.owner]: { invoke: async () => output } } });
    const result = await mediator.dispatch(call);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'failed');
    assert.equal(result.receipt.outcome, 'failed');
    assert.ok((result.result as { error?: string }).error);
  });
}

test('successful wrapped result retains independent transport proof', async () => {
  const output = { application_transport_observation: { transport: 'http', correlation_id: call.correlation_id },
    result: { isError: false, success: true, data: { error: 'ordinary application data' } } };
  const mediator = createAllAppToolMediator({ adapters: { [binding.owner]: { invoke: async () => output } } });
  const result = await mediator.dispatch(call);
  assert.equal(result.ok, true);
  assert.equal(result.receipt.outcome, 'executed');
  assert.deepEqual(result.result, output);
});

test('successful JSON-RPC responses preserve the existing unwrapped result', async () => {
  const output = { isError: false, content: [{ type: 'text', text: 'ok' }] };
  const mediator = createAllAppToolMediator({ adapters: { [binding.owner]: { invoke: async () => ({ jsonrpc: '2.0', result: output }) } } });
  assert.deepEqual((await mediator.dispatch(call)).result, output);
});

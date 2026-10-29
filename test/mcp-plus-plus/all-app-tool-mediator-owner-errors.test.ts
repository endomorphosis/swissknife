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

for (const [message, type] of [
  ['RuntimeError: FAISS index not found: default', 'RuntimeError'],
  ["TypeError: missing a required argument: 'model'", 'TypeError'],
]) test(`structured native error remains actionable: ${type}`, async () => {
  const output = { jsonrpc: '2.0', result: { isError: true,
    content: [{ type: 'json', json: { error: message, error_type: type } }],
    receipt: { traceback: 'PRIVATE BACKEND TRACE', backend_credentials: 'PRIVATE VALUE' } } };
  const mediator = createAllAppToolMediator({ adapters: { [binding.owner]: { invoke: async () => output } } });
  const result = await mediator.dispatch(call);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.receipt.outcome, 'failed');
  assert.deepEqual(result.result, { error: message, owner_error: { message, type } });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('nested structured failures redact sensitive values and keep the typed code', async () => {
  const output = { result: { isError: true, content: [{ type: 'json', json: { error: {
    code: 'index_missing', message: 'index missing; api_key=PRIVATEKEY password=PRIVATEPASS Bearer PRIVATETOKEN at /home/private/config',
    traceback: 'PRIVATE TRACE', credentials: { key: 'PRIVATE KEY' },
  } } }] } };
  const mediator = createAllAppToolMediator({ adapters: { [binding.owner]: { invoke: async () => output } } });
  const result = await mediator.dispatch(call);
  assert.equal(result.outcome, 'failed');
  assert.equal((result.result as any).owner_error.code, 'index_missing');
  assert.match((result.result as any).error, /index missing/);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('/home/'));
});

test('error extraction is bounded and does not inspect ordinary application data', async () => {
  const output = { jsonrpc: '2.0', result: { isError: true,
    content: [{ type: 'json', json: { error: 'x'.repeat(20000), error_type: 'Error' } }] } };
  const mediator = createAllAppToolMediator({ adapters: { [binding.owner]: { invoke: async () => output } } });
  const result = await mediator.dispatch(call);
  assert.equal((result.result as any).error.length, 2048);
  assert.equal(result.receipt.outcome, 'failed');
});

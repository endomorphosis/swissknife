'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { require: tsxRequire } = require('tsx/cjs/api');
const { ALL_APP_EXECUTABLE_BACKEND_CONTRACT: contract } = tsxRequire(path.resolve(__dirname, '../src/services/apps/all-app-executable-backend-contract.ts'), __filename);
const { gatewayEnvelopePost, summarizeCallEvidence, matchExpectedInvocation } = require('../test/e2e/helpers/live-click-call-evidence.cjs');

function fixture() {
  const app = contract.apps.find(app => app.app_id === 'notes');
  const binding = app.backend_bindings.find(binding => binding.owner === 'ipfs_datasets_py');
  const call = {
    protocol: 'swissknife.all-app-tool-gateway.v1', route: '/mcp/tools/call', receipt_required: true,
    app_id: app.app_id, binding_id: binding.binding_id, owner: binding.owner,
    tool_id: binding.tool_selection.preferred_tool_ids[0], transport: binding.transport_policy.preferred_transport,
    correlation_id: 'test-exact-binding-correlation',
    input: { correlation_id: 'test-exact-binding-correlation', policy: { outcome: 'require_confirmation', dry_run: true } },
  };
  const observation = { route: call.route, tool_id: call.tool_id, transport: call.transport, correlation_id: call.correlation_id, policy_outcome: call.input.policy.outcome, dry_run: true };
  return { appId: app.app_id, expectedToolId: `mcp++:${binding.binding_id}`, selector: `[data-live-gateway-binding="${binding.binding_id}"]`, observation, call };
}
const attempt = post => ({ kind: 'tools-call', pathname: '/mcp/tools/call', post });

test('IDL binding projection matches a real canonical executable binding and reviewed exact tool', () => {
  const input = fixture();
  assert.equal(input.observation.tool_id, 'record_provenance');
  assert.notEqual(input.observation.tool_id, input.expectedToolId);
  assert.deepEqual(matchExpectedInvocation(input, contract), { matches: true, reason: 'exact-projected-binding-and-reviewed-tool' });
});
test('a matching tool string cannot substitute the wrong backend owner', () => {
  const input = fixture(); input.call.owner = 'ipfs_kit_py';
  assert.equal(matchExpectedInvocation(input, contract).matches, false);
});
test('an unreviewed exact tool cannot satisfy a known binding projection', () => {
  const input = fixture(); input.call.tool_id = input.observation.tool_id = 'unreviewed_tool';
  assert.equal(matchExpectedInvocation(input, contract).matches, false);
});
test('a different valid binding cannot satisfy the expected originating control', () => {
  const input = fixture();
  const other = contract.apps.find(app => app.app_id === 'notes').backend_bindings.find(binding => binding.owner === 'ipfs_kit_py');
  input.call.binding_id = other.binding_id;
  input.call.owner = other.owner;
  input.call.tool_id = input.observation.tool_id = other.tool_selection.preferred_tool_ids[0];
  assert.equal(matchExpectedInvocation(input, contract).matches, false);
});
test('an unknown app binding is rejected rather than stripped into a tool name', () => {
  const input = fixture(); input.expectedToolId = 'mcp++:notes.ipfs_datasets_py.unreviewed';
  assert.equal(matchExpectedInvocation(input, contract).matches, false);
});
test('same-binding calls still require the originating app, declared transport and observation identity', () => {
  for (const mutation of [
    input => { input.call.app_id = 'vibecode'; },
    input => { input.call.transport = input.observation.transport = 'libp2p'; },
    input => { input.observation.correlation_id = 'another-correlation'; },
    input => { input.observation.policy_outcome = 'allow'; },
    input => { input.observation.dry_run = false; },
    input => { input.selector = '[data-live-gateway-binding="notes.ipfs_kit_py.retrieve_content"]'; },
  ]) {
    const input = fixture(); mutation(input);
    assert.equal(matchExpectedInvocation(input, contract).matches, false);
  }
});
test('original exact raw tool IDs remain supported with reviewed owner and binding', () => {
  const input = fixture();
  for (const expected of ['record_provenance', 'ipfs_datasets_py:record_provenance', 'mcp++:ipfs_datasets_py/record_provenance']) {
    input.expectedToolId = expected;
    assert.equal(matchExpectedInvocation(input, contract).matches, true, expected);
  }
  input.expectedToolId = 'ipfs_kit_py:record_provenance';
  assert.equal(matchExpectedInvocation(input, contract).matches, false);
});
test('legacy unmediated POST increases actual MCP count and cannot become an observation', () => {
  const legacy = { method: 'tools/call', tool: 'load_dataset', arguments: {} };
  const evidence = summarizeCallEvidence([attempt(legacy)]);
  assert.equal(evidence.toolCalls.length, 1);
  assert.equal(evidence.incompleteCallCount, 1);
  assert.equal(evidence.newestGatewayCall, null);
  assert.equal(gatewayEnvelopePost(legacy), false);
  // This actual count is assigned to the row; every zero-call disposition
  // must now reject the attempt instead of accepting an apparently empty row.
  assert.notEqual(evidence.toolCalls.length, 0);
});
test('malformed POSTs are counted even when a later complete call succeeds', () => {
  const { call } = fixture();
  const evidence = summarizeCallEvidence([attempt(null), attempt({ tool_id: 'half_an_envelope' }), attempt(call)]);
  assert.equal(evidence.toolCalls.length, 3);
  assert.equal(evidence.incompleteCallCount, 2);
  assert.equal(evidence.gatewayCalls.length, 1);
  assert.equal(evidence.newestGatewayCall.post, call);
});
test('missing protocol, correlation or policy metadata remains an incomplete attempt', () => {
  for (const mutate of [
    call => { delete call.protocol; }, call => { delete call.input.policy; },
    call => { call.input.correlation_id = 'other'; }, call => { delete call.input.policy.dry_run; },
  ]) {
    const { call } = fixture(); mutate(call);
    const evidence = summarizeCallEvidence([attempt(call)]);
    assert.equal(evidence.toolCalls.length, 1);
    assert.equal(evidence.incompleteCallCount, 1);
    assert.equal(evidence.newestGatewayCall, null);
  }
});
test('private artifact probes stay separate from actual tools-call attempts', () => {
  const evidence = summarizeCallEvidence([{ kind: 'private-artifact', pathname: '/mcp/artifacts' }]);
  assert.equal(evidence.toolCalls.length, 0);
  assert.equal(evidence.privateCalls.length, 1);
});

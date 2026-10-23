const test = require('node:test');
const assert = require('node:assert/strict');
const { OWNERS, deriveCurrentBindingLedger } = require('./vdg-current-binding-ledger.cjs');
const { discoverOwner } = require('./refresh-vdg-owner-discovery.cjs');
function fixture() {
  const binding = { binding_id: 'vibecode.ipfs_kit_py.list_virtual_files', owner: 'ipfs_kit_py', tool_selection: { preferred_tool_ids: ['files_ls', 'files_read'] }, transport_policy: { allowed_transports: ['http', 'libp2p'] } };
  return { historicalPath: 'vdg/inventory/history/historical.json', historical: { schema: 'swissknife.all-app-live-binding-gap-ledger.v1', tools: [
    { owner: 'ipfs_kit_py', name: 'old_tool', current_state: 'denied', states: { denied: true }, binding: { rows: [{ app_id: 'calendar', app_visible: true }] } }] },
    discovery: { schema: 'swissknife.vdg-owner-tools.v1', owners: OWNERS.map(owner => ({ owner, endpoint: `http://localhost/${owner}`, state: 'live-discovered', tools: [{ name: owner === 'ipfs_kit_py' ? 'files_ls' : 'health' }] })) },
    contract: { apps: [{ app_id: 'vibecode', aliases: ['code-editor'], disposition: 'tool_backed', backend_bindings: [binding] }] },
    matrix: { rows: ['files_ls', 'files_read'].map(name => ({ app_id: 'vibecode', launch_id: 'vibecode', selector: `[data-native-tool-id="${name}"]`, data_native_gateway_binding: binding.binding_id, data_native_gateway_tool: name, tool_id: name })) },
    catalog: { entries: [{ owner: 'ipfs_kit_py', tool_id: 'files_ls', disposition: { kind: 'app_operation', app_id: 'vibecode' } }, { owner: 'ipfs_kit_py', tool_id: 'files_read', disposition: { kind: 'app_operation', app_id: 'vibecode' } }] } };
}
test('current bindings use exact rendered controls and preserve undiscovered obligations/history', () => {
  const input = fixture(); const ledger = deriveCurrentBindingLedger(input);
  const old = ledger.tools.find(tool => tool.name === 'old_tool');
  assert.equal(old.history.current_state, 'denied'); assert.deepEqual(old.history.states, { denied: true });
  assert.equal(old.binding.rows.length, 0, 'historical calendar heuristics must not be current bindings');
  const missing = ledger.tools.find(tool => tool.name === 'files_read');
  assert.equal(missing.discovery_state, 'not-advertised'); assert.equal(missing.binding.rows[0].app_visible, true);
  assert.deepEqual(missing.binding.rows[0].transports, ['http', 'libp2p']);
  assert.equal(ledger.gaps[0].code, 'rendered_tool_not_discovered');
  assert.equal(ledger.completion_authority, false); assert.equal(ledger.decision, 'no_go');
  assert.ok(ledger.tools.every(tool => tool.observed_execution_state === 'not_evaluated'));
});
test('server-only tools never become app-visible while invalid rendered controls remain gaps', () => {
  const input = fixture(); input.catalog.entries[0].disposition = { kind: 'server_only' };
  input.matrix.rows[1].data_native_gateway_tool = 'unreviewed';
  const ledger = deriveCurrentBindingLedger(input);
  assert.equal(ledger.tools.find(tool => tool.name === 'files_ls').binding.app_visible_row_count, 0);
  assert.deepEqual(ledger.gaps.map(gap => gap.code), ['server_only_tool_rendered_as_operation', 'rendered_exact_binding_unresolved']);
});
test('all three complete independent owner inventories are mandatory', () => {
  for (const change of [input => input.discovery.owners.pop(), input => input.discovery.owners[1].tools = [], input => input.discovery.owners[0].state = 'unreachable', input => input.discovery.owners.push(input.discovery.owners[0])]) {
    const input = fixture(); change(input); assert.throws(() => deriveCurrentBindingLedger(input), /owner|three/);
  }
});
test('actual tools/list pagination preserves exact names and never invokes tools', async () => {
  const calls = [];
  const result = await discoverOwner('ipfs_kit_py', 'http://owner/mcp', async (_url, options) => {
    const call = JSON.parse(options.body); calls.push(call);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', result: { tools: [{ name: calls.length === 1 ? 'files_ls' : 'files_read' }], ...(calls.length === 1 ? { nextCursor: 'second' } : {}) } }) };
  });
  assert.deepEqual(result.tools.map(tool => tool.name), ['files_ls', 'files_read']);
  assert.deepEqual(calls.map(call => call.method), ['tools/list', 'tools/list']); assert.equal(calls[1].params.cursor, 'second');
});
test('failed, empty, repeated-name and cyclic-page discovery fails closed', async () => {
  for (const body of [{ error: { message: 'denied' } }, { result: { tools: [] } }, { result: { tools: [{ name: 'a' }, { name: 'a' }] } }, { result: { tools: [{ name: 'a' }], nextCursor: 'again' } }]) {
    await assert.rejects(discoverOwner('ipfs_kit_py', 'http://owner/mcp', async () => ({ ok: true, json: async () => body })), /invalid|no tools|repeated/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { Window } from 'happy-dom';
import { parse } from 'acorn';

// Explicit authored DOM/owner fixtures. These tests are not live SDK proof.
const source = name => fs.readFileSync(new URL(`../../web/js/apps/${name}.js`, import.meta.url), 'utf8');
const peerId = '12D3KooWAuthoredUnitIdentity1234567890';
function ownerResult(owner, tool, data, overrides = {}) {
  return { ok: true, outcome: 'executed', owner, tool_id: tool, correlation_id: 'authored-unit-correlation',
    receipt: { receipt_id: 'authored-unit-receipt', outcome: 'executed' },
    result: { result: { content: [{ type: 'json', json: data }] } }, ...overrides };
}
function observation(peers = []) {
  const raw = { Peers: peers }, rows = peers === null ? [] : peers;
  return { success: true, Peers: rows, peer_count: rows.length, peers_reported_null: peers === null,
    raw_observation: raw, raw_observation_canonical_sha256: createHash('sha256').update(JSON.stringify(raw, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest('hex'),
    native_provenance: { owner: 'ipfs_kit_py', sdk_method: 'swarm_peers', simulated: false,
      cache_fallback: false, observed_at: new Date().toISOString() } };
}
function mcpFixture(t, results) {
  const window = new Window({ url: 'http://authored.invalid' });
  t.after(() => window.happyDOM.abort());
  const calls = [], text = source('mcp-control'), ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  const constants = ast.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(value => value.id.name === 'MCP_CONTROL_DECLARED_DIAGNOSTICS'));
  const klass = ast.body.find(node => node.type === 'ClassDeclaration' && node.id.name === 'MCPControlApp');
  const App = vm.runInNewContext(`${text.slice(constants.start, constants.end)};(${text.slice(klass.start, klass.end)})`, {
    document: window.document, localStorage: window.localStorage, console,
    invokeNativeTool: async (container, app, binding, options) => {
      calls.push({ container, app, binding, options });
      return results[options.toolId];
    },
  });
  const app = Object.create(App.prototype);
  const host = window.document.createElement('section'); host.className = 'window-app-content';
  host.innerHTML = app.renderOwnerDiagnostics(); window.document.body.append(host); app._diagnosticScope = host;
  return { app, host, window, calls };
}
function nativeDiagnostics() {
  return {
    node_id: ownerResult('ipfs_kit_py', 'node_id', { ID: peerId, Addresses: [] }),
    tools_list_categories: ownerResult('ipfs_datasets_py', 'tools_list_categories', { categories: [{ name: 'dataset_tools', count: 2 }] }),
    'HealthChecker.check_detailed': ownerResult('ipfs_accelerate_py', 'HealthChecker.check_detailed',
      { status: 'healthy', timestamp: new Date().toISOString() }),
  };
}

test('MCP diagnostics use exact canonical read bindings and display actual node/categories/SDK health', async t => {
  const f = mcpFixture(t, nativeDiagnostics());
  await f.app.executeDeclaredDiagnostics({ fixture_scope: 'authored-unit' });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls.map(call => call.binding), [
    'mcp-control.ipfs_kit_py.inspect_tool_registry', 'mcp-control.ipfs_datasets_py.inspect_tool_registry',
    'mcp-control.ipfs_accelerate_py.inspect_tool_registry',
  ]);
  for (const call of f.calls) { assert.equal(call.options.executionMode, 'execute'); assert.equal(call.app, 'mcp-control'); }
  const rendered = f.host.querySelector('#mcp-diagnostic-ready').textContent;
  assert.ok(rendered.includes(peerId)); assert.match(rendered, /dataset_tools \(2\)/);
  assert.match(rendered, /Accelerate SDK health: healthy at \d{4}-/);
  const saved = JSON.parse(f.window.localStorage.getItem('mcp-control-last-diagnostic'));
  assert.equal(saved.observations[0].node_id, peerId); assert.equal(saved.observations[1].categories[0].name, 'dataset_tools');
  const reopened = Object.create(Object.getPrototypeOf(f.app)); reopened.lastDiagnostic = saved;
  assert.ok(reopened.renderOwnerDiagnostics().includes(peerId));
});

for (const [name, tool, data] of [
  ['tool labels alone', 'node_id', { tool: 'node_id' }],
  ['missing categories', 'tools_list_categories', { tool: 'tools_list_categories' }],
  ['malformed category array', 'tools_list_categories', { categories: [{ name: 'x', count: 'invented' }] }],
  ['missing health timestamp', 'HealthChecker.check_detailed', { status: 'healthy' }],
  ['actual degraded health', 'HealthChecker.check_detailed', { status: 'degraded', timestamp: new Date().toISOString() }],
]) test(`MCP ${name} cannot be retained or rendered as successful diagnostics`, async t => {
  const results = nativeDiagnostics(); results[tool].result.result.content[0].json = data;
  const f = mcpFixture(t, results); await f.app.executeDeclaredDiagnostics({ fixture_scope: 'authored-unit' });
  assert.equal(Boolean(f.host.querySelector('#mcp-diagnostic-ready')), false);
  assert.match(f.host.querySelector('#mcp-diagnostic-status').textContent, /Owner outage:/);
  assert.equal(f.window.localStorage.getItem('mcp-control-last-diagnostic'), null);
});

test('MCP failed/preview envelopes cannot use authentic-looking receipt labels to claim success', async t => {
  for (const override of [{ ok: false }, { outcome: 'preview' }, { owner: 'wrong-owner' }]) {
    const results = nativeDiagnostics(); Object.assign(results.node_id, override);
    const f = mcpFixture(t, results); await f.app.executeDeclaredDiagnostics({ fixture_scope: 'authored-unit' });
    assert.equal(Boolean(f.host.querySelector('#mcp-diagnostic-ready')), false);
  }
});

async function p2pFixture(t, result) {
  const window = new Window({ url: 'http://authored.invalid' }); t.after(() => window.happyDOM.abort());
  const calls = [], text = source('p2p-network'), ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  const body = ast.body.filter(node => node.type !== 'ImportDeclaration').map(node => text.slice(node.start, node.end)).join('\n');
  const context = { window, document: window.document, console: { log() {}, warn() {}, error() {} },
    crypto: webcrypto, TextEncoder, Uint8Array, BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER: [], summarizeBrowserLibp2pGaps: () => [],
    getBrowserLibp2pDefaultStatus: async () => ({ capabilities: {}, transports: [] }),
    invokeNativeToolImport: async (container, app, binding, options) => {
      calls.push({ container, app, binding, options }); return result;
    },
  };
  vm.runInNewContext(body, context);
  const app = window.createP2PNetworkApp(); const host = window.document.createElement('section');
  host.className = 'window-app-content'; host.innerHTML = await app.render(); window.document.body.append(host);
  const refresh = async () => window.p2pRefreshOwnerSwarm({ currentTarget: host.querySelector('#p2p-refresh-swarm') });
  return { window, host, calls, refresh };
}

for (const peers of [[], null, [{ Peer: peerId, Addr: '/ip4/127.0.0.1/tcp/4001' }]]) {
  test(`P2P displays genuine ${peers === null ? 'explicit raw-null empty swarm' : peers.length ? 'connected peer' : 'empty swarm'} from MCP content JSON`, async t => {
    const f = await p2pFixture(t, ownerResult('ipfs_kit_py', 'swarm_peers', observation(peers)));
    await f.refresh(); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].binding, 'p2p-network.ipfs_kit_py.inspect_peer_network');
    assert.equal(f.calls[0].options.toolId, 'swarm_peers'); assert.equal(f.calls[0].options.executionMode, 'execute');
    assert.match(f.host.querySelector('#p2p-swarm-observation').textContent, new RegExp(`${peers?.length || 0} connected peers; observed at`));
    assert.equal(f.host.querySelector('#p2p-swarm-status').dataset.swarmState, peers?.length ? 'connected' : 'empty');
    assert.equal(f.host.querySelector('[data-gateway-confirm]'), null, 'unguarded read must not invent confirmation');
  });
}

for (const [name, mutate] of [
  ['SDK error with peer-shaped data', data => { data.success = false; }],
  ['invented count', data => { data.peer_count = 7; }],
  ['simulated peers', data => { data.native_provenance.simulated = true; }],
  ['stale peers', data => { data.native_provenance.observed_at = '2000-01-01T00:00:00Z'; }],
  ['unidentified peers', data => { data.Peers = [{}]; data.peer_count = 1; }],
  ['missing raw peer key', data => { data.raw_observation = {}; }],
  ['false raw owner error', data => { data.raw_observation = { Peers: null, error: 'actual owner failure' }; }],
  ['inconsistent null marker', data => { data.peers_reported_null = true; }],
  ['forged raw observation hash', data => { data.raw_observation_canonical_sha256 = 'f'.repeat(64); }],
]) test(`P2P ${name} remains unavailable and never becomes an accepted empty swarm`, async t => {
  const data = observation(); mutate(data);
  const f = await p2pFixture(t, ownerResult('ipfs_kit_py', 'swarm_peers', data)); await f.refresh();
  assert.equal(f.host.querySelector('#p2p-swarm-status').dataset.swarmState, 'unavailable');
  assert.equal(Boolean(f.host.querySelector('#p2p-swarm-observation')), false);
});

test('P2P offline negative makes no backend call; correcting transport performs a fresh native read', async t => {
  const f = await p2pFixture(t, ownerResult('ipfs_kit_py', 'swarm_peers', observation()));
  f.host.querySelector('#p2p-transport-input').value = 'offline'; await f.refresh();
  assert.equal(f.calls.length, 0); assert.match(f.host.querySelector('#p2p-swarm-status').textContent, /unavailable/);
  f.host.querySelector('#p2p-transport-input').value = 'http'; await f.refresh();
  assert.equal(f.calls.length, 1); assert.ok(f.host.querySelector('#p2p-swarm-observation'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { Window } from 'happy-dom';

const filename = fileURLToPath(new URL('../../web/js/apps/mcp-control.js', import.meta.url));
const source = fs.readFileSync(filename, 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const declaration = ast.body.find(node => node.type === 'ClassDeclaration' && node.id.name === 'MCPControlApp');
const MCPControlApp = vm.runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
  console: { log() {}, warn() {} }, WebSocket: { OPEN: 1, CLOSED: 3 },
});

function fixture() {
  const app = Object.create(MCPControlApp.prototype);
  let reconciliations = 0;
  Object.assign(app, { servers: new Map(), remoteServers: new Map(), connections: new Map(),
    syncHallucinateDaemons: async () => { reconciliations++; } });
  return { app, reconciliations: () => reconciliations };
}

test('the actual browser module parses in V8 without a transformed or extracted source', () => {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=commonjs', '-e',
    'const fs=require("node:fs"),vm=require("node:vm");new vm.SourceTextModule(fs.readFileSync(process.argv[1],"utf8"),{identifier:process.argv[1]});', filename],
  { cwd: path.dirname(filename), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('an empty host catalog still checks real remote connection states and invents no servers', async () => {
  const f = fixture();
  f.app.remoteServers.set('connected', { status: 'unknown' });
  f.app.remoteServers.set('closed', { status: 'connected' });
  f.app.connections.set('connected', { readyState: 1 });
  f.app.connections.set('closed', { readyState: 3 });
  await f.app.checkServerStatuses();
  assert.equal(f.reconciliations(), 1);
  assert.equal(f.app.servers.size, 0);
  assert.equal(f.app.remoteServers.get('connected').status, 'connected');
  assert.equal(f.app.remoteServers.get('closed').status, 'disconnected');
  assert.equal(f.app.connections.has('closed'), false);
  assert.ok(Number.isFinite(f.app.remoteServers.get('connected').lastCheck));
});

test('host discovery merges only the actual returned records before checking browser remotes', async () => {
  const f = fixture(), existing = { name: 'owned', status: 'stopped', command: 'node existing.js' };
  f.app.servers.set('owned', existing);
  f.app.desktop = { swissknife: { listMCPServers: async () => [
    { name: 'owned', status: 'running' }, { name: 'second', status: 'degraded' },
  ] } };
  f.app.remoteServers.set('remote', { status: 'unknown' });
  f.app.connections.set('remote', { readyState: 1 });
  await f.app.checkServerStatuses();
  assert.equal(f.app.servers.size, 2);
  assert.equal(f.app.servers.get('owned'), existing);
  assert.equal(existing.command, 'node existing.js');
  assert.equal(existing.status, 'running');
  assert.equal(f.app.servers.get('second').status, 'degraded');
  assert.equal(f.app.remoteServers.get('remote').status, 'connected');
});

test('failed host enumeration still checks browser remotes without fabricating a host record', async () => {
  const f = fixture();
  f.app.desktop = { swissknife: { listMCPServers: async () => { throw new Error('host unavailable'); } } };
  f.app.remoteServers.set('remote', { status: 'unknown' });
  f.app.connections.set('remote', { readyState: 1 });
  await f.app.checkServerStatuses();
  assert.equal(f.app.servers.size, 0);
  assert.equal(f.app.remoteServers.get('remote').status, 'connected');
});

test('a failed browser connection check retains its real error instead of claiming connection', async () => {
  const f = fixture();
  f.app.remoteServers.set('broken', { status: 'unknown' });
  f.app.connections.set('broken', { get readyState() { throw new Error('socket unavailable'); } });
  await f.app.checkServerStatuses();
  const remote = f.app.remoteServers.get('broken');
  assert.equal(remote.status, 'error');
  assert.equal(remote.lastError, 'socket unavailable');
  assert.ok(Number.isFinite(remote.lastCheck));
});

test('an unavailable daemon reconciliation stays a rejected operation', async () => {
  const f = fixture();
  f.app.syncHallucinateDaemons = async () => { throw new Error('daemon unavailable'); };
  await assert.rejects(f.app.checkServerStatuses(), /daemon unavailable/);
  assert.equal(f.app.servers.size, 0);
});

test('the real metrics view does not claim a measured success ratio without connection outcome samples', () => {
  const { app } = fixture();
  for (const connectionCount of [0, 2]) {
    app.connections = new Map(Array.from({ length: connectionCount }, (_, index) => [String(index), {}]));
    const html = app.renderMetricsDashboard();
    assert.match(html, /Connection Success Rate:[\s\S]*?Not measured/);
    assert.doesNotMatch(html, /\d+(?:\.\d+)?%/);
  }
});

test('all five real dialogs stay inside their app content and preserve their actual open and close handlers', t => {
  const window = new Window({ url: 'http://localhost' });
  t.after(() => window.happyDOM.abort());
  const policy = ast.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(declaration => declaration.id.name === 'MCP_DASHBOARD_BROWSER_POLICY'));
  const BrowserApp = vm.runInNewContext(`${source.slice(policy.start, policy.end)};(${source.slice(declaration.start, declaration.end)})`,
    { document: window.document, localStorage: window.localStorage, console, WebSocket: { OPEN: 1, CLOSED: 3 } });
  const app = Object.create(BrowserApp.prototype);
  Object.assign(app, { serverTemplates: new Map(), servers: new Map(), remoteServers: new Map(), connections: new Map() });
  const host = window.document.createElement('section');
  host.className = 'window-content';
  host.innerHTML = `<style>.modal {position:fixed}.hidden {display:none}</style>
    <div class="mcp-control-app">${app.renderLibp2pBrowserStyles()}${app.renderModals()}</div>`;
  window.document.body.append(host);
  const foreign = window.document.createElement('div'); foreign.className = 'modal'; window.document.body.append(foreign);
  for (const [id, show, hide] of [['templates-modal', 'showServerTemplates', 'hideServerTemplates'],
    ['add-server-modal', 'showAddServer', 'hideAddServer'], ['add-remote-modal', 'showAddRemote', 'hideAddRemote'],
    ['discovery-modal', 'showDiscovery', 'hideDiscovery'], ['metrics-modal', 'showMetrics', 'hideMetrics']]) {
    const modal = host.querySelector(`#${id}`);
    assert.equal(modal.parentElement.className, 'mcp-control-app');
    assert.equal(window.getComputedStyle(modal).position, 'absolute', `${id} must use its window-content containing block`);
    app[show](); assert.equal(modal.classList.contains('hidden'), false);
    app[hide](); assert.equal(modal.classList.contains('hidden'), true);
  }
  assert.equal(window.getComputedStyle(foreign).position, 'fixed', 'MCP styles must not change another app dialog');
  const modals = [...host.querySelectorAll('.mcp-control-app > .modal')]; assert.equal(modals.length, 5);
  host.remove(); assert.ok(modals.every(modal => !modal.isConnected));
  assert.equal(foreign.isConnected, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { MCPPlusPlusExplorerApp } from '../../web/js/apps/mcp-plus-plus-explorer.js';
import { IPFSExplorerApp } from '../../web/js/apps/ipfs-explorer.js';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';

const controls = ['mcp-plus-plus', 'ipfs-explorer'].map(app_id => ({ app_id,
  binding_id: `${app_id}.ipfs_kit_py.persist_artifact`, intent_id: `${app_id}.ipfs_kit_py.persist_artifact`,
  owner: 'ipfs_kit_py', selected_tool_id: 'artifacts_put', preferred_tool_ids: ['artifacts_put'],
  mutates_remote_state: true, status: 'available', transports: ['http', 'libp2p'], transport: 'http' }));

async function until(predicate) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Expected native transition was not reached.');
}

function environment(t, preview = true) {
  const names = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent, localStorage: window.localStorage,
    __SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__: 'libp2p', __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) {
      const appId = new URL(url, 'http://localhost').searchParams.get('app_id');
      return { ok: true, json: async () => ({ controls: controls.filter(item => item.app_id === appId) }) };
    }
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body);
    calls.push(call);
    const result = preview
      ? { validated: true, dry_run: true, persisted: false, mutation_performed: false, expected_cid: call.input.payload.cid }
      : { persisted: true, verified: true, cid: call.input.payload.cid };
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', result, correlation_id: call.correlation_id, receipt: { receipt_id: 'unit-owner-receipt' } }) };
  };
  t.after(() => {
    window.happyDOM.abort();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  return { window, calls };
}

function mcppApp() {
  const client = { listServices: () => [{ id: 'ipfs_kit_py', label: 'Kit test owner' }] };
  const app = new MCPPlusPlusExplorerApp(null, { client });
  app.state.activeTab = 'diagnostics';
  const root = document.createElement('section');
  app.container = root;
  document.body.append(root);
  app.update();
  return { app, root };
}

class QuietIPFSExplorer extends IPFSExplorerApp {
  async initializeIntegrations() {}
}

function ipfsApp(desktop = {}) {
  const app = new QuietIPFSExplorer(desktop);
  const root = document.createElement('section');
  root.innerHTML = app.createWindow();
  document.body.append(root);
  app.container = root;
  app.showNotification = () => {};
  return { app, root };
}

test('MCP++ native evidence preview preserves canonical bytes and never creates persisted evidence', async t => {
  const { calls } = environment(t);
  const { app, root } = mcppApp();
  const pending = app.requestEvidencePersist();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.binding_id, 'mcp-plus-plus.ipfs_kit_py.persist_artifact');
  assert.equal(call.tool_id, 'artifacts_put');
  assert.equal(call.transport, 'libp2p');
  const bytes = new Uint8Array(Buffer.from(call.input.payload.bytes_base64, 'base64'));
  assert.equal(await contentCidForBytes(bytes), call.input.payload.cid);
  assert.equal(JSON.parse(new TextDecoder().decode(bytes)).schema, 'swissknife.mcp-plus-plus-explorer.evidence.v1');
  assert.equal(app.state.diag.evidenceCid, null);
  assert.equal(app.state.diag.evidence, null);
  assert.match(app.state.message, /dry-run preview/);
});

test('MCP++ native cancellation makes zero requests and retains no persistence claim', async t => {
  const { calls } = environment(t);
  const { app, root } = mcppApp();
  const pending = app.requestEvidencePersist();
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(app.state.diag.evidenceCid, null);
  assert.match(app.state.message, /cancelled/);
});

test('IPFS native file preview validates exact selected bytes without pinning or alternate writes', async t => {
  const { window, calls } = environment(t);
  let alternateWrites = 0;
  const { app, root } = ipfsApp({ swissknife: { ipfs: { add: async () => { alternateWrites++; } } } });
  const file = new window.File(['exact selected content'], 'selected.txt', { type: 'text/plain' });
  const pending = app.uploadFileToIPFS(file);
  const rejected = assert.rejects(pending, /Validated dry-run preview/);
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  assert.equal(alternateWrites, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await rejected;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].binding_id, 'ipfs-explorer.ipfs_kit_py.persist_artifact');
  assert.equal(calls[0].tool_id, 'artifacts_put');
  assert.equal(Buffer.from(calls[0].input.payload.bytes_base64, 'base64').toString(), 'exact selected content');
  assert.equal(app.pinnedContent.size, 0);
  assert.equal(alternateWrites, 0);
});

test('IPFS native cancellation sends nothing and creates no pinned state', async t => {
  const { window, calls } = environment(t);
  const { app, root } = ipfsApp();
  const pending = app.uploadFileToIPFS(new window.File(['cancel me'], 'selected.txt'));
  const cancelled = assert.rejects(pending, /cancelled before dispatch/);
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await cancelled;
  assert.equal(calls.length, 0);
  assert.equal(app.pinnedContent.size, 0);
});

test('repeated IPFS listener setup dispatches the originating upload once', async t => {
  const { window, calls } = environment(t);
  const { app, root } = ipfsApp();
  app.setupEventListeners(root);
  app.setupEventListeners(root);
  app.handleFileSelection([new window.File(['one upload'], 'single.txt')]);
  root.querySelector('#start-upload').click();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(root.querySelectorAll('[data-gateway-confirm]').length, 1);
  root.querySelector('[data-gateway-confirm]').click();
  await until(() => calls.length === 1);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls.length, 1);
});

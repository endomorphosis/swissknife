import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { NeuralPhotoshopApp } from '../../web/js/apps/neural-photoshop.js';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';
const bindings = [
  { app_id: 'neural-photoshop', owner: 'ipfs_accelerate_py', binding_id: 'neural-photoshop.ipfs_accelerate_py.run_inference_job', selected_tool_id: 'run_inference_job', preferred_tool_ids: ['run_inference_job'] },
  { app_id: 'neural-photoshop', owner: 'ipfs_kit_py', binding_id: 'neural-photoshop.ipfs_kit_py.retrieve_content', selected_tool_id: 'ipfs_cat', preferred_tool_ids: ['ipfs_cat'] },
].map(binding => ({ ...binding, transport: 'http', transports: ['http', 'libp2p'], mutates_remote_state: true, status: 'available', safe_payloads: { run_inference_job: { model: 'unit-owned-model' } } }));
function fixture(t, ownerResult = { ok: true, dry_run: true, body_executed: false, mutation_performed: false }, failure = false) {
  const keys = ['window', 'document', 'CustomEvent', 'fetch', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window(); Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent, __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls: bindings }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body); calls.push(call);
    return { status: failure ? 503 : 200, json: async () => ({ ok: !failure, outcome: failure ? 'failed' : 'executed',
      ...(failure ? { error: 'Actual owner unavailable' } : { result: ownerResult }), correlation_id: call.correlation_id,
      receipt: { receipt_id: 'unit-receipt-only', event_dag_refs: ['unit-event-only'] } }) };
  };
  t.after(() => { window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const root = document.createElement('main'); document.body.append(root);
  const app = new NeuralPhotoshopApp(root, {}); root.innerHTML = app.renderVdaG042WorkflowPanel();
  return { app, root, calls };
}
async function confirm(root, pending, cancel = false) {
  for (let count = 0; count < 100 && !root.querySelector('[data-gateway-confirm]'); count++) await new Promise(resolve => setTimeout(resolve, 3));
  assert.ok(root.querySelector('[data-gateway-confirm]'));
  root.querySelector(cancel ? '[data-gateway-cancel]' : '[data-gateway-confirm]').click();
  await pending;
}
test('initial workflow has no invented CID, job, receipt, progress or persistence', t => {
  const { app, root, calls } = fixture(t);
  assert.equal(app.vdaG042.sourceCid, null); assert.equal(app.vdaG042.resultCid, null);
  assert.equal(root.querySelector('[data-source-cid-state]').dataset.sourceCidState, 'not-loaded');
  assert.equal(root.querySelector('[data-generation-state]').dataset.generationState, 'idle');
  assert.equal(root.querySelectorAll('.vda-g042-receipt, progress').length, 0);
  assert.equal(/bafyneuralphotoshop|receipt:neural|job:neural/.test(root.textContent), false);
  assert.equal(calls.length, 0);
});
for (const transport of ['http', 'libp2p']) test(`generation ${transport} preview requires confirmation and cannot claim an image or job`, async t => {
  const { app, root, calls } = fixture(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
  root.querySelector('[data-generation-prompt]').value = 'Restore this test image';
  const pending = app.markVdaG042GenerationComplete(root, root.querySelector('[data-native-tool-id="run_inference_job"]'));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(calls.length, 0);
  await confirm(root, pending);
  assert.equal(calls.length, 1); assert.equal(calls[0].tool_id, 'run_inference_job'); assert.equal(calls[0].transport, transport);
  assert.equal(calls[0].input.payload.input, 'Restore this test image');
  assert.equal(calls[0].input.payload.model, 'unit-owned-model');
  assert.equal(app.vdaG042.generationState, 'validated-preview'); assert.equal(app.vdaG042.taskId, null); assert.equal(app.vdaG042.resultCid, null);
  assert.match(root.querySelector('[data-generation-status]').textContent, /No image was generated/);
  assert.equal(root.querySelector('[data-source-cid-state]').dataset.resultCidState, 'unavailable');
  assert.equal(root.querySelectorAll('.vda-g042-receipt').length, 1);
});
test('cancel and empty prompt dispatch no owner call', async t => {
  const { app, root, calls } = fixture(t);
  root.querySelector('[data-generation-prompt]').value = '';
  await app.markVdaG042GenerationComplete(root); assert.equal(calls.length, 0);
  root.querySelector('[data-generation-prompt]').value = 'Test request';
  await confirm(root, app.markVdaG042GenerationComplete(root), true);
  assert.equal(calls.length, 0); assert.match(root.querySelector('[data-generation-status]').textContent, /Cancelled/);
});
test('real owner failure stays an error without creating result or completion claims', async t => {
  const { app, root, calls } = fixture(t, null, true);
  await confirm(root, app.markVdaG042GenerationComplete(root));
  assert.equal(calls.length, 1); assert.equal(app.vdaG042.generationState, 'error');
  assert.match(root.querySelector('[data-generation-status]').textContent, /Actual owner unavailable/);
  assert.equal(root.querySelectorAll('.vda-g042-receipt').length, 0); assert.equal(app.vdaG042.resultCid, null);
});
test('a missing actual model stays unavailable before any owner invocation', async t => {
  const { app, root, calls } = fixture(t);
  const saved = bindings[0].safe_payloads; bindings[0].safe_payloads = {};
  t.after(() => { bindings[0].safe_payloads = saved; });
  await app.markVdaG042GenerationComplete(root);
  assert.equal(calls.length, 0); assert.equal(root.querySelector('[data-gateway-confirm]'), null);
  assert.match(root.querySelector('[data-generation-status]').textContent, /No reviewed owner model/);
});
test('an executed envelope cannot hide an explicit owner error or invent progress', async t => {
  const { app, root } = fixture(t, { content: [{ type: 'json', json: { success: false, error: 'Actual inference rejected' } }] });
  await confirm(root, app.markVdaG042GenerationComplete(root));
  assert.equal(app.vdaG042.generationState, 'error');
  assert.match(root.querySelector('[data-generation-status]').textContent, /Actual inference rejected/);
  assert.equal(root.querySelectorAll('progress, .vda-g042-receipt').length, 0);
});
test('a job identifier or incomplete preview acknowledgement cannot become a no-side-effect claim', async t => {
  const { app, root } = fixture(t, { success: true, dry_run: true, body_executed: false, mutation_performed: false, task_id: 'unexpected-owner-task' });
  await confirm(root, app.markVdaG042GenerationComplete(root));
  assert.equal(app.vdaG042.generationState, 'error'); assert.equal(app.vdaG042.taskId, null);
  assert.match(root.querySelector('[data-generation-status]').textContent, /did not verify a no-side-effect inference preview/);
  assert.equal(root.querySelectorAll('.vda-g042-receipt').length, 0);
});
test('source load verifies actual bytes against the requested CID', async t => {
  const bytes = new TextEncoder().encode('<svg>real test source bytes</svg>'); const cid = await contentCidForBytes(bytes);
  const { app, root } = fixture(t, { success: true, cid, bytes_base64: Buffer.from(bytes).toString('base64') });
  root.querySelector('[data-source-cid-input]').value = cid;
  await confirm(root, app.markVdaG042SourceLoaded(root));
  assert.equal(app.vdaG042.sourceCid, cid); assert.deepEqual(app.vdaG042.sourceBytes, bytes);
  assert.equal(root.querySelector('[data-source-cid-state]').dataset.sourceCidState, 'verified-bytes');
});
test('a plausible source CID cannot conceal bytes with another hash', async t => {
  const { app, root } = fixture(t, { success: true, bytes_base64: Buffer.from('other bytes').toString('base64') });
  root.querySelector('[data-source-cid-input]').value = 'bafy-unmatched-test-only';
  await confirm(root, app.markVdaG042SourceLoaded(root));
  assert.equal(app.vdaG042.sourceCid, null); assert.equal(root.querySelector('[data-source-cid-state]').dataset.sourceCidState, 'error');
  assert.match(root.querySelector('[data-source-result]').textContent, /do not match/);
});
test('local history, clear, policy and comparison never manufacture owner evidence', t => {
  const { app, root, calls } = fixture(t);
  app.markVdaG042EditComplete(root); app.markVdaG042Cancelled(root); app.markVdaG042Denied(root); app.markVdaG042ComparisonOpen(root);
  assert.equal(calls.length, 0); assert.equal(root.querySelectorAll('.vda-g042-receipt').length, 0);
  assert.match(root.querySelector('[data-policy-status]').textContent, /does not claim a denial/);
  assert.match(root.querySelector('[data-comparison-status]').textContent, /No verified generated result/);
});

test('local panel headers remain available while their own content collapses and reopens', t => {
  const { app, root, calls } = fixture(t); root.innerHTML = app.createWindow().content; app.setupPanelHandlers(root);
  for (const panel of ['tools', 'properties', 'layers', 'ai', 'history']) {
    const button = root.querySelector(`.panel-toggle[data-panel="${panel}"]`);
    const content = root.querySelector(`.${panel}-panel`); const initial = app.panels[panel];
    assert.equal(button.getAttribute('aria-expanded'), String(initial));
    button.click(); assert.equal(app.panels[panel], !initial); assert.equal(content.hidden, initial);
    assert.equal(button.isConnected, true); assert.equal(button.hidden, false);
    button.click(); assert.equal(app.panels[panel], initial); assert.equal(content.hidden, !initial);
  }
  assert.equal(root.querySelector('.left-panel').classList.contains('hidden'), false); assert.equal(calls.length, 0);
});

test('repeated mounting cannot double-toggle a panel or duplicate its native confirmation', async t => {
  const { app, root, calls } = fixture(t); root.innerHTML = app.createWindow().content;
  // Canvas/file subsystems are unrelated to the actual panel/native mounts.
  for (const method of ['setupCanvas', 'setupMenuHandlers', 'setupToolHandlers', 'setupLayerHandlers', 'setupAIHandlers', 'setupCanvasHandlers', 'setupFileOperations', 'setupKeyboardHandlers']) app[method] = () => {};
  app.setupEventHandlers(root); app.setupEventHandlers(root);
  root.querySelector('[data-panel="properties"]').click(); assert.equal(app.panels.properties, false);
  root.querySelector('[data-generation-prompt]').value = 'Actual mounted request';
  root.querySelector('[data-native-tool-id="run_inference_job"]').click();
  for (let count = 0; count < 100 && !root.querySelector('[data-gateway-confirm]'); count++) await new Promise(resolve => setTimeout(resolve, 3));
  assert.equal(root.querySelectorAll('[data-gateway-confirm]').length, 1); assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-cancel]').click();
  assert.equal(calls.length, 0);
});

test('Photoshop panels keep their own visible document flow under the actual desktop stylesheet', t => {
  const { root, app } = fixture(t);
  const shared = document.createElement('style'); shared.textContent = fs.readFileSync(new URL('../../web/css/apps.css', import.meta.url), 'utf8'); document.head.append(shared);
  root.innerHTML = app.createWindow().content;
  for (const panel of root.querySelectorAll('.panel-section, .ai-panel')) {
    const computed = window.getComputedStyle(panel);
    assert.equal(computed.display, 'block'); assert.equal(computed.position, 'static');
  }
});

test('an empty source CID asks for actual user input and never seeds or invokes a fixture', async t => {
  const { root, app, calls } = fixture(t);
  await app.markVdaG042SourceLoaded(root);
  assert.equal(calls.length, 0); assert.equal(root.querySelector('[data-source-cid-input]').value, '');
  assert.equal(app.vdaG042.sourceCid, null); assert.match(root.querySelector('[data-source-result]').textContent, /Enter a source artifact CID first/);
});

test('the local style chooser belongs to its app and supports Escape, backdrop, Cancel and style selection', async t => {
  const { app, root, calls } = fixture(t);
  for (const action of ['Escape', 'backdrop', 'Cancel', 'style']) {
    const pending = app.showStyleSelectionDialog();
    const dialog = root.querySelector('[data-neural-photoshop-dialog="style"]');
    assert.ok(dialog, 'The chooser must be contained by its owning app window');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    dialog.querySelector('h3').click();
    assert.equal(dialog.isConnected, true, 'Clicks inside the dialog must not dismiss it');
    if (action === 'Escape') {
      const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      dialog.querySelector('#cancel-style').dispatchEvent(escape);
      assert.equal(escape.defaultPrevented, true);
    } else if (action === 'backdrop') dialog.click();
    else if (action === 'Cancel') dialog.querySelector('#cancel-style').click();
    else dialog.querySelector('[data-style="watercolor"]').click();
    assert.equal(await pending, action === 'style' ? 'watercolor' : null);
    assert.equal(dialog.isConnected, false);
  }
  assert.equal(calls.length, 0, 'Choosing a local style must not authorize an owner call');
});

test('closing the owning app settles its local style request and leaves no global modal', { timeout: 2000 }, async t => {
  const { app, root, calls } = fixture(t);
  const pending = app.showStyleSelectionDialog();
  root.remove();
  assert.equal(await pending, null);
  assert.equal(document.querySelector('[data-neural-photoshop-dialog="style"]'), null);
  assert.equal(app.closeStyleSelection, null);
  assert.equal(calls.length, 0);
});

test('opening another style chooser cancels the earlier pending view without leaking a dialog', async t => {
  const { app, root } = fixture(t);
  const first = app.showStyleSelectionDialog();
  const second = app.showStyleSelectionDialog();
  assert.equal(await first, null);
  assert.equal(root.querySelectorAll('[data-neural-photoshop-dialog="style"]').length, 1);
  root.querySelector('#cancel-style').click();
  assert.equal(await second, null);
  assert.equal(root.querySelector('[data-neural-photoshop-dialog="style"]'), null);
});

test('progress and notifications remain owned by their window and cannot remove another app progress view', t => {
  const { app, root, calls } = fixture(t);
  const other = document.createElement('div'); other.dataset.neuralPhotoshopProgress = '';
  document.body.append(other);
  app.showAIProgress('A real pending local operation');
  assert.ok(root.querySelector('[data-neural-photoshop-progress]'));
  app.hideAIProgress();
  assert.equal(root.querySelector('[data-neural-photoshop-progress]'), null);
  assert.equal(other.isConnected, true, 'Progress dismissal must remain scoped to the app owner');
  other.remove();
  app.showAIProgress('Another pending local operation');
  app.showNotification('Actual local result');
  assert.ok(root.querySelector('[data-neural-photoshop-notification]'));
  root.remove();
  assert.equal(document.querySelector('[data-neural-photoshop-progress], [data-neural-photoshop-notification]'), null);
  assert.equal(calls.length, 0);
});

test('a detached app cannot create new body overlays from a late asynchronous callback', async t => {
  const { app, root, calls } = fixture(t);
  root.remove();
  app.showAIProgress('Late operation'); app.showNotification('Late result');
  assert.equal(await app.showStyleSelectionDialog(), null);
  assert.equal(document.querySelector('[data-neural-photoshop-dialog], [data-neural-photoshop-progress], [data-neural-photoshop-notification]'), null);
  assert.equal(calls.length, 0);
});

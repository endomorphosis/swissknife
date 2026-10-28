// Authored HTTP/DOM fixtures exercise wiring and byte validation, not live acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';
import { unwrapNetworkToolResult } from '../../web/js/apps/network-native-tools.js';

const initial = new Window({ url: 'http://localhost' });
Object.assign(globalThis, { window: initial, localStorage: initial.localStorage });
const [{ GitHubApp }, { FileManagerApp }, { IPFSExplorerApp }, { ModelBrowserApp }, { HuggingFaceApp }] = await Promise.all([
  import('../../web/js/apps/github.js'), import('../../web/js/apps/file-manager.js'), import('../../web/js/apps/ipfs-explorer.js'),
  import('../../web/js/apps/model-browser.js'), import('../../web/js/apps/huggingface.js')
]);
await initial.happyDOM.abort();
const githubRecord = { repository: 'fixture-owner/fixture-repo', file: 'README.md', content: '# Actual stored README' };
const blobs = { github: JSON.stringify(githubRecord), 'file-manager': 'svf-fixture-utf8-ok', 'ipfs-explorer': '<svg>authored bytes</svg>' };
const cids = Object.fromEntries(await Promise.all(Object.entries(blobs).map(async ([id, text]) => [id, await contentCidForBytes(new TextEncoder().encode(text))])));
const bindingIds = { github: 'github.ipfs_kit_py.retrieve_content', 'file-manager': 'file-manager.ipfs_kit_py.retrieve_content',
  'ipfs-explorer': 'ipfs-explorer.ipfs_kit_py.retrieve_content', huggingface: 'huggingface.ipfs_datasets_py.query_catalog',
  'model-browser': 'model-browser.ipfs_accelerate_py.inspect_model_catalog' };
function fixture(t, id, { corrupt = false, failTool = () => false } = {}) {
  const names = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', 'getComputedStyle'];
  const old = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const win = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent, localStorage: win.localStorage, getComputedStyle: win.getComputedStyle.bind(win) });
  const host = document.createElement('div'); host.className = 'window'; host.dataset.appId = id;
  host.innerHTML = '<div class="window-app-content"></div>'; document.body.append(host);
  const root = host.firstElementChild, calls = [];
  const owner = id === 'huggingface' ? 'ipfs_datasets_py' : id === 'model-browser' ? 'ipfs_accelerate_py' : 'ipfs_kit_py';
  const tools = id === 'huggingface' ? ['get_from_ipfs'] : id === 'model-browser' ? ['list_models', 'run_inference_job'] : ['ipfs_cat'];
  // Read-style authored controls avoid simulating trusted user consent. Real
  // governed dialogs are qualified separately by the actual Chrome workflow.
  const control = { app_id: id, owner, binding_id: bindingIds[id], intent_id: bindingIds[id], selected_tool_id: tools[0],
    preferred_tool_ids: tools, mutates_remote_state: false, status: 'available', transports: ['http'], transport: 'http',
    safe_payloads: { ipfs_cat: { cid: cids[id] }, get_from_ipfs: { cid: 'authored-catalog-id', gateway: 'http://127.0.0.1:8091' } } };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls: [control] }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call'); const call = JSON.parse(options.body); calls.push(call);
    if (failTool(call.tool_id)) return { ok: true, status: 200, json: async () => ({ ok: false, outcome: 'failed', error: 'authored owner unavailable' }) };
    let result = { cid: cids[id], bytes_base64: Buffer.from(corrupt ? 'wrong bytes' : blobs[id] || '').toString('base64') };
    if (id === 'huggingface') result = { status: 'success', content: JSON.stringify([{ id: 'gpt2', task: 'text-generation', snapshot: '607a30d783dfa663caf39e06633721c8d4cfcd7e' }]) };
    if (id === 'model-browser') result = call.tool_id === 'list_models' ? { models: [{ id: 'gpt2', task: 'text-generation', device: 'cpu' }] }
      : { status: 'completed', output: 'ping authored continuation', generated_text: ' authored continuation' };
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', result: {
      result: { content: [{ type: 'json', json: result }], result } } }) };
  };
  t.after(async () => { await win.happyDOM.abort(); for (const name of names) old[name] === undefined ? delete globalThis[name] : globalThis[name] = old[name]; });
  assert.equal(window.invokeNativeTool, undefined, 'apps must not depend on a global shim');
  return { root, calls };
}

test('IPFS Explorer invokes the canonical module and independently hashes actual returned bytes', async t => {
  const { root, calls } = fixture(t, 'ipfs-explorer'); root.innerHTML = '<div class="ipfs-explorer-container"><button id="go-btn">Go</button></div>';
  const app = Object.create(IPFSExplorerApp.prototype); app.container = root.firstElementChild;
  const actual = await app.fetchIPFSContent(cids['ipfs-explorer']);
  assert.equal(actual.verifiedPreview, blobs['ipfs-explorer']); assert.equal(actual.cid, cids['ipfs-explorer']);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].input.payload, { cid: cids['ipfs-explorer'], fixture_scope: 'svf-ipfs-explorer' });
});

test('IPFS Explorer refuses corrupted bytes instead of falling back to another transport', async t => {
  const { root, calls } = fixture(t, 'ipfs-explorer', { corrupt: true }); root.innerHTML = '<div class="ipfs-explorer-container"></div>';
  const app = Object.create(IPFSExplorerApp.prototype); app.container = root.firstElementChild;
  app.desktop = { swissknife: { ipfs: { ls() { throw new Error('fallback must not run'); } } } };
  await assert.rejects(app.fetchIPFSContent(cids['ipfs-explorer']), /do not hash/); assert.equal(calls.length, 1);
});

test('File Manager uses reviewed CID bytes without host paths or local-preview substitution', async t => {
  const { root, calls } = fixture(t, 'file-manager'); root.innerHTML = '<button id="svf-notes">notes.txt</button>';
  const app = Object.create(FileManagerApp.prototype); const file = { path: '/svf-isolated/notes.txt', name: 'notes.txt', content: 'previous local bytes' };
  const text = await app.requestGovernedRetrieve(root, file);
  assert.equal(text, blobs['file-manager']); assert.equal(file.content, text);
  assert.deepEqual(calls[0].input.payload, { cid: cids['file-manager'], fixture_scope: 'svf-file-manager' });
});

test('GitHub verifies repository identity inside the returned content-addressed record', async t => {
  const { root, calls } = fixture(t, 'github'); root.innerHTML = '<button>Retrieve</button><div id="github-review-identity"></div><div id="github-review-error"></div>';
  const app = Object.create(GitHubApp.prototype); app.reviewArtifact = { repository: githubRecord.repository, file: githubRecord.file }; app.saveSettings = () => {};
  await app.retrieveSelectedContent({ currentTarget: root.querySelector('button') });
  assert.equal(root.querySelector('#github-review-identity').textContent, 'fixture-owner/fixture-repo · README.md');
  assert.equal(root.querySelector('#github-retrieved-content').textContent, githubRecord.content);
  assert.deepEqual(calls[0].input.payload, { cid: cids.github, fixture_scope: 'svf-github-review' });
});

test('GitHub rejects a genuine blob for a different selected repository', async t => {
  const { root } = fixture(t, 'github'); root.innerHTML = '<button>Retrieve</button><div id="github-review-identity"></div><div id="github-review-error"></div>';
  const app = Object.create(GitHubApp.prototype); app.reviewArtifact = { repository: 'other/repository', file: 'README.md' }; app.saveSettings = () => {};
  await app.retrieveSelectedContent({ currentTarget: root.querySelector('button') });
  assert.match(root.querySelector('#github-review-error').textContent, /does not match/);
  assert.equal(root.querySelector('#github-retrieved-content'), null);
});

test('Hugging Face queries actual stored catalog rows without manufacturing a confirmation', async t => {
  const { root, calls } = fixture(t, 'huggingface'); root.innerHTML = '<input id="models-search" value="gpt2"><button id="models-search-submit">Search</button>';
  const app = Object.create(HuggingFaceApp.prototype); Object.assign(app, { models: new Map(), catalogMetadata: {}, modelSearch: '', modelTaskFilter: '', modelLibraryFilter: '' });
  app.persistHubState = () => {}; app.refresh = () => {};
  await app.searchModels();
  assert.equal(calls.length, 1); assert.equal(calls[0].tool_id, 'get_from_ipfs'); assert.equal(calls[0].input.policy.consent, 'not_required');
  assert.equal(app.models.get('gpt2').task, 'text-generation'); assert.equal(root.querySelector('[data-gateway-confirm]'), null);
  app.settings = { defaultModel: 'gpt2' }; app.apiToken = '';
  await app.loadModel('gpt2');
  assert.equal(app.selection.id, 'gpt2'); assert.equal(app.selection.sha, '607a30d783dfa663caf39e06633721c8d4cfcd7e');
  const prompt = document.createElement('textarea'); prompt.id = 'inference-input'; prompt.value = 'bounded request';
  const output = document.createElement('div'); output.id = 'results-content'; root.append(prompt, output);
  await app.runInference();
  assert.match(output.textContent, /requires a credential/); assert.equal(output.getAttribute('aria-live'), 'polite');
  assert.equal(calls.length, 1, 'missing credential must send no inference/provider request');
  await app.searchModels(); assert.equal(calls.length, 2);
  assert.equal(app.selection.id, 'gpt2'); assert.equal(app.selection.prepared_id, '');
  assert.match(app.selectionStatusText(), /No model weights have been prepared/);
});

test('Model Browser rejects unknown IDs against the actual native catalog before inference', async t => {
  const { root, calls } = fixture(t, 'model-browser'); root.innerHTML = '<button id="refresh-models">Refresh</button><input id="model-test-prompt" value="ping"><input id="model-test-model-id" value="unsupported"><p id="model-run-status"></p><pre id="model-test-output"></pre>';
  const app = Object.create(ModelBrowserApp.prototype); app.renderModelList = () => {}; app.showNotification = () => {}; app.rememberRun = () => {};
  await Promise.all([app.refreshModels(root), app.refreshModels(root)]); assert.deepEqual([...app.nativeModelIds], ['gpt2']);
  await app.runBoundedTest(root, app.models[0]); assert.equal(calls.length, 1); assert.match(root.querySelector('#model-run-status').textContent, /unsupported model/);
  root.querySelector('#model-test-model-id').value = 'gpt2'; await Promise.all([app.runBoundedTest(root, app.models[0]), app.runBoundedTest(root, app.models[0])]);
  assert.equal(calls.length, 2); assert.equal(calls[1].tool_id, 'run_inference_job');
  assert.equal(calls[1].input.payload.model_id, 'gpt2'); assert.equal(calls[1].input.payload.input, 'ping');
  assert.equal(root.querySelector('#model-run-status').dataset.runState, 'completed');
});

test('nested MCP content arrays preserve real owner string content and associated metadata', () => {
  const owner = { status: 'success', content: '[{"id":"gpt2"}]', content_type: 'text', binary_size: 15,
    metadata: { source: 'authored-owner-payload' } };
  assert.deepEqual(unwrapNetworkToolResult({ result: { content: [{ type: 'json', json: owner }] } }), owner);
  const binary = { cid: 'authored-content-address', bytes_base64: 'aGVsbG8=', size: 5,
    native_provenance: { source: 'authored-unit-fixture' } };
  assert.deepEqual(unwrapNetworkToolResult({ content: [{ type: 'text', text: JSON.stringify(binary) }] }), binary);
});

test('IPFS restored preview must rehash raw bytes, never trust cached preview text or a bare CID', async t => {
  const { root, calls } = fixture(t, 'ipfs-explorer');
  root.innerHTML = '<input id="path-input"><div id="content-browser"></div>';
  const app = Object.create(IPFSExplorerApp.prototype);
  const key = 'ipfs-explorer-last-preview';
  localStorage.setItem(key, JSON.stringify({ cid: cids['ipfs-explorer'], preview: 'tampered legacy text' }));
  assert.equal(await app.restoreRetainedPreview(), false);
  assert.equal(root.querySelector('.ipfs-preview'), null);
  localStorage.setItem(key, JSON.stringify({ cid: cids['ipfs-explorer'], bytes_base64: Buffer.from('tampered bytes').toString('base64') }));
  assert.equal(await app.restoreRetainedPreview(), false);
  assert.equal(root.querySelector('.ipfs-preview'), null);
  const valid = JSON.stringify({ cid: cids['ipfs-explorer'], bytes_base64: Buffer.from(blobs['ipfs-explorer']).toString('base64'), preview: 'untrusted display string' });
  localStorage.setItem(key, valid);
  assert.equal(await app.restoreRetainedPreview(), true);
  assert.equal(root.querySelector('.ipfs-preview pre').textContent, blobs['ipfs-explorer']);
  assert.equal(root.textContent.includes('untrusted display string'), false);
  root.querySelector('#content-browser').replaceChildren(); localStorage.setItem(key, valid);
  const pending = app.restoreRetainedPreview();
  localStorage.setItem(key, JSON.stringify({ cid: cids['ipfs-explorer'], preview: 'changed during verification' }));
  assert.equal(await pending, false);
  assert.equal(root.querySelector('.ipfs-preview'), null);
  localStorage.setItem(key, valid);
  const reopening = app.restoreRetainedPreview();
  const replacement = document.createElement('div'); replacement.id = 'content-browser';
  root.querySelector('#content-browser').replaceWith(replacement);
  assert.equal(await reopening, false, 'verification for a closed app generation cannot write into the new surface');
  assert.equal(replacement.querySelector('.ipfs-preview'), null);
  assert.equal(calls.length, 0, 'a cache check cannot manufacture a fresh owner operation');
});

test('Model Browser restores selected stored metadata without granting current model availability', async t => {
  let failed = false;
  const { root } = fixture(t, 'model-browser', { failTool: () => failed }); root.innerHTML = '<button id="refresh-models">Refresh</button>';
  const app = Object.create(ModelBrowserApp.prototype); app.renderModelList = () => {}; app.showNotification = () => {};
  await app.refreshModels(root); app.selectedModel = app.models[0]; app.saveNativeCatalogMetadata();
  const original = localStorage.getItem('model-browser-native-catalog');
  const restored = Object.create(ModelBrowserApp.prototype);
  assert.equal(restored.restoreNativeCatalogMetadata(), true); assert.equal(restored.selectedModel.id, 'gpt2');
  assert.equal(restored.catalogObservation.stored, true); assert.equal(restored.nativeModelIds, undefined);
  failed = true; await app.refreshModels(root);
  assert.equal(localStorage.getItem('model-browser-native-catalog'), original, 'failed refresh cannot replace the stored observation');
  assert.equal(app.models[0].id, 'gpt2'); assert.equal(app.nativeModelIds, null); assert.match(app.catalogObservation.error, /failed/);
});

test('Hugging Face retains selected native catalog metadata across reopen and failed refresh', async t => {
  let failed = false;
  const { root } = fixture(t, 'huggingface', { failTool: () => failed }); root.innerHTML = '<input id="models-search" value="gpt2"><button id="models-search-submit">Search</button>';
  const app = Object.create(HuggingFaceApp.prototype); Object.assign(app, { models: new Map(), catalogMetadata: {}, modelSearch: '', modelTaskFilter: '', modelLibraryFilter: '' });
  app.refresh = () => {}; app.settings = {};
  await app.searchModels(); await app.loadModel('gpt2');
  const original = localStorage.getItem('huggingface-native-catalog');
  const restored = Object.create(HuggingFaceApp.prototype); restored.catalogMetadata = {};
  restored.restoreHubState(); assert.equal(restored.selection.id, 'gpt2'); assert.equal(restored.selection.sha, app.selection.sha);
  assert.equal(restored.restoreNativeCatalogMetadata(), true); assert.equal(restored.models.get('gpt2').snapshot, app.selection.sha);
  assert.match(restored.catalogStatusText('models'), /Stored catalog metadata.*availability is unconfirmed/);
  await restored.fetchModels(); assert.equal(restored.models.get('gpt2').id, 'gpt2', 'initial public fetch cannot replace valid stored native rows');
  failed = true; await app.searchModels();
  assert.equal(localStorage.getItem('huggingface-native-catalog'), original);
  assert.equal(app.models.get('gpt2').id, 'gpt2'); assert.match(app.catalogStatusText('models'), /Refresh failed/);
  assert.equal(app.selection.id, 'gpt2'); assert.equal(app.selection.prepared_id, '');
});

test('GitHub shows stored repository preview before optional account setup without claiming fresh verification', t => {
  const { root, calls } = fixture(t, 'github');
  localStorage.setItem('github-app-settings', JSON.stringify({ reviewArtifact: githubRecord }));
  const app = Object.create(GitHubApp.prototype); app.loadSettings(); root.innerHTML = app.renderAuthenticationScreen();
  const review = root.querySelector('#github-review-panel'), setup = root.querySelector('.github-account-setup');
  assert.equal(review.closest('details'), null); assert.equal(setup.open, false);
  assert.equal(root.querySelector('#github-retrieved-content').textContent, githubRecord.content);
  assert.match(review.textContent, /Stored README preview; retrieve again to verify/);
  assert.equal(root.querySelector('#github-token').closest('details'), setup);
  assert.equal(root.querySelector('#github-token').value, ''); assert.equal(calls.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { invokeNativeTool } from '../../web/js/live-tool-gateway.js';
const source = fs.readFileSync(new URL('../../web/js/main-simple.js', import.meta.url), 'utf8');
const start = source.indexOf('    async createAcceleratePanelSurface(contentElement) {');
const end = source.indexOf('\n    async createAgentSupervisorApp', start);
assert.ok(start > 0 && end > start);
const createPanel = new Function('invokeNativeTool', `return (${source.slice(start, end).trim().replace('async createAcceleratePanelSurface', 'async function createAcceleratePanelSurface')})`)(invokeNativeTool);
const opNames = { list_models: 'read_model_catalog', job_status: 'read_job_status', run_inference_job: 'run_inference_job', hardware_profile: 'read_hardware_profile', telemetry: 'read_telemetry' };
const controls = Object.entries(opNames).map(([tool, operation]) => ({
  app_id: 'accelerate-panel', owner: 'ipfs_accelerate_py', binding_id: `accelerate-panel.ipfs_accelerate_py.${operation}`,
  selected_tool_id: tool, preferred_tool_ids: [tool], transport: 'http', transports: ['http', 'libp2p'],
  intent_id: `accelerate-panel.ipfs_accelerate_py.${operation}`, mutates_remote_state: tool === 'run_inference_job',
  safe_payload: tool === 'run_inference_job' ? { model: 'catalog-confirmed-model', input: 'reviewed owner default' } : tool === 'job_status' ? { task_id: 'real-existing-task' } : {},
}));
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); } throw new Error('UI did not settle'); }
function dom(t) {
  const keys = ['window', 'document', 'localStorage', 'CustomEvent', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, CustomEvent: window.CustomEvent });
  t.after(() => { window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  return window;
}
let nextHubModule = 0;
async function huggingFace(t) {
  dom(t);
  return (await import(`../../web/js/apps/huggingface.js?test-session=${++nextHubModule}`)).HuggingFaceApp;
}
async function panel(t, results = {}) {
  dom(t); const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body); calls.push(call);
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id, transport: call.transport,
      result: results[call.tool_id] || { success: true, value: 'actual-owner-value' }, receipt: { receipt_id: 'actual-receipt', event_dag_refs: ['actual-event'] } }) };
  };
  const root = document.createElement('div'); document.body.append(root); await createPanel.call({ setupEventListeners() {} }, root);
  const button = action => root.querySelector(`[data-svd-workflow-action="${action}"]`);
  const settled = () => root.querySelector('#accelerate-workflow-log').textContent.includes('actual-receipt');
  return { root, calls, button, settled };
}
test('HF initialization finishes with visible failures when the real external fetch never resolves', async t => {
  const HuggingFaceApp = await huggingFace(t); const signals = [];
  globalThis.fetch = (_url, options) => { signals.push(options.signal); return new Promise(() => {}); };
  const app = new HuggingFaceApp({ requestTimeoutMs: 20 });
  const started = Date.now(); await app.initialize();
  assert.ok(Date.now() - started < 1000); assert.equal(signals.length, 2); assert.ok(signals.every(signal => signal.aborted));
  assert.equal(app.modelsLoading, false); assert.equal(app.datasetsLoading, false);
  assert.match(app.renderModelsGrid(), /external provider is unavailable/); assert.match(app.renderDatasetsGrid(), /external provider is unavailable/);
  assert.equal(app.models.size, 0); assert.equal(app.datasets.size, 0);
});
test('HF response-body hangs are bounded and a real successful catalog is retained', async t => {
  const HuggingFaceApp = await huggingFace(t); const app = new HuggingFaceApp({ requestTimeoutMs: 20 });
  globalThis.fetch = async url => ({ ok: true, json: () => String(url).includes('/models?') ? Promise.resolve([{ id: 'actual/hub-model', pipeline_tag: 'text-generation' }]) : new Promise(() => {}) });
  await app.loadCachedData();
  assert.equal(app.models.has('actual/hub-model'), true); assert.match(app.datasetsError, /timed out/);
});
test('HF keeps external provider requests and exposes actual HTTP errors without invented data', async t => {
  const HuggingFaceApp = await huggingFace(t); const urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return { ok: false, status: 503 }; };
  const app = new HuggingFaceApp({ requestTimeoutMs: 20 }); await app.loadCachedData();
  assert.ok(urls.every(url => url.startsWith('https://huggingface.co/api/')));
  assert.match(app.modelsError, /503/); assert.match(app.datasetsError, /503/); assert.equal(app.models.size + app.datasets.size, 0);
});

test('HF repeated windows reuse complete real catalogs with visible ten-minute freshness', async t => {
  const HuggingFaceApp = await huggingFace(t); const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return { ok: true, json: async () => [{ id: String(url).includes('/models?') ? 'real/model' : 'real/dataset', private_provider_metadata: { revision: 'actual-revision' } }] };
  };
  const first = new HuggingFaceApp(); await first.loadCachedData();
  first.models.get('real/model').private_provider_metadata.revision = 'window-only-change';
  const reopened = new HuggingFaceApp(); await reopened.loadCachedData();
  assert.equal(urls.length, 2);
  assert.equal(reopened.models.get('real/model').private_provider_metadata.revision, 'actual-revision');
  assert.equal(reopened.datasets.get('real/dataset').private_provider_metadata.revision, 'actual-revision');
  assert.equal(reopened.catalogMetadata.models.cache, 'session');
  assert.equal(reopened.catalogMetadata.datasets.cache_ttl_ms, 600000);
  assert.ok(reopened.catalogMetadata.models.observed_at);
  assert.match(reopened.renderModelsTab(), /Actual Hugging Face models observed/);
  assert.match(reopened.renderDatasetsTab(), /Complete response retained for up to 10 minutes/);
  assert.equal(reopened.cache.models.size + reopened.cache.datasets.size, 2);
});

test('HF concurrent windows coalesce each real resource and explicit refresh still reaches the provider', async t => {
  const HuggingFaceApp = await huggingFace(t); const urls = []; const release = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    await new Promise(resolve => release.push(resolve));
    return { ok: true, json: async () => [{ id: String(url).includes('/models?') ? 'real/model' : 'real/dataset' }] };
  };
  const first = new HuggingFaceApp(), second = new HuggingFaceApp();
  const reads = Promise.all([first.loadCachedData(), second.loadCachedData()]);
  assert.equal(urls.length, 2); release.splice(0).forEach(resolve => resolve()); await reads;
  assert.equal(second.catalogMetadata.models.cache, 'coalesced');
  assert.equal(second.catalogMetadata.datasets.cache, 'coalesced');
  second.refresh = () => {};
  const refreshed = second.refreshModels();
  assert.equal(urls.length, 3); release.splice(0).forEach(resolve => resolve()); await refreshed;
  assert.equal(second.catalogMetadata.models.cache, 'network');
});

test('HF expires success at ten minutes, retains stale actual data on failure, and bounds failure retries', async t => {
  const HuggingFaceApp = await huggingFace(t); let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let calls = 0, fail = false;
  globalThis.fetch = async () => { calls++; return fail ? { ok: false, status: 503 } : { ok: true, json: async () => [{ id: 'real/observed-model', config: { actual: true } }] }; };
  const first = new HuggingFaceApp(); await first.fetchModels(); const observed = first.catalogMetadata.models.observed_at;
  now += 599999; const fresh = new HuggingFaceApp(); await fresh.fetchModels(); assert.equal(calls, 1);
  fail = true; now += 1; const unavailable = new HuggingFaceApp(); await unavailable.fetchModels();
  assert.equal(calls, 2); assert.equal(unavailable.catalogMetadata.models.observed_at, observed);
  assert.equal(unavailable.catalogMetadata.models.stale, true); assert.match(unavailable.modelsError, /503/);
  assert.equal(unavailable.models.get('real/observed-model').config.actual, true);
  assert.match(unavailable.renderModelsTab(), /Retaining the actual catalog observed/);
  now += 29999; const repeated = new HuggingFaceApp(); await repeated.fetchModels(); assert.equal(calls, 2); assert.match(repeated.modelsError, /503/);
  now += 1; fail = false; await repeated.fetchModels(); assert.equal(calls, 3); assert.equal(repeated.modelsError, '');
  assert.equal(repeated.catalogMetadata.models.stale, false);
});

test('HF failures without any actual observation stay empty and are coalesced during the retry window', async t => {
  const HuggingFaceApp = await huggingFace(t); let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 429 }; };
  const first = new HuggingFaceApp(); await first.loadCachedData();
  const reopened = new HuggingFaceApp(); await reopened.loadCachedData();
  assert.equal(calls, 2); assert.equal(reopened.models.size + reopened.datasets.size, 0);
  assert.equal(reopened.catalogMetadata.models.observed_at, null);
  assert.match(reopened.renderModelsTab(), /No live catalog observation is available/);
  assert.match(reopened.renderDatasetsTab(), /429/);
});

test('HF separates search, page, resource, and authentication requests', async t => {
  const HuggingFaceApp = await huggingFace(t); const requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url: String(url), auth: options.headers.Authorization }); return { ok: true, json: async () => [{ id: 'actual/query-result' }] }; };
  const app = new HuggingFaceApp(); await app.fetchModels();
  app.modelSearch = 'different'; await app.fetchModels();
  app.modelSkip = 24; await app.fetchModels();
  await app.fetchDatasets(); app.apiToken = 'test-private-scope'; await app.fetchModels();
  assert.equal(requests.length, 5); assert.match(requests[1].url, /search=different/); assert.match(requests[2].url, /skip=24/);
  assert.match(requests[3].url, /\/datasets\?/); assert.equal(requests[4].auth, 'Bearer test-private-scope');
  assert.equal(JSON.stringify(app.catalogMetadata).includes('test-private-scope'), false);
});

test('HF cache retains at most32 settled query entries and rejects malformed provider catalogs visibly', async t => {
  const HuggingFaceApp = await huggingFace(t); let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => [{ id: 'actual/query-result' }] }; };
  const app = new HuggingFaceApp();
  for (let i = 0; i < 33; i++) { app.modelSearch = `query-${i}`; await app.fetchModels(); }
  app.modelSearch = 'query-0'; await app.fetchModels(); assert.equal(calls, 34);
  app.modelSearch = 'malformed'; globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [{ id: 'wrong-shape' }] }) });
  await app.fetchModels(); assert.equal(app.models.size, 0); assert.match(app.modelsError, /invalid catalog/);
  assert.equal(app.catalogMetadata.models.observed_at, null);
});

test('HF bounds simultaneous distinct catalog reads without evicting pending shared requests', async t => {
  const HuggingFaceApp = await huggingFace(t); let calls = 0; const release = [];
  globalThis.fetch = async () => { calls++; await new Promise(resolve => release.push(resolve)); return { ok: true, json: async () => [{ id: 'actual/query-result' }] }; };
  const pending = [];
  for (let i = 0; i < 32; i++) { const app = new HuggingFaceApp(); app.modelSearch = `query-${i}`; pending.push(app.fetchModels()); }
  const overCapacity = new HuggingFaceApp(); overCapacity.modelSearch = 'new-query'; await overCapacity.fetchModels();
  assert.equal(calls, 32); assert.equal(overCapacity.models.size, 0); assert.match(overCapacity.modelsError, /capacity reached/);
  assert.match(overCapacity.renderModelsTab(), /No live catalog observation is available/);
  const shared = new HuggingFaceApp(); shared.modelSearch = 'query-0'; pending.push(shared.fetchModels()); assert.equal(calls, 32);
  release.splice(0).forEach(resolve => resolve()); await Promise.all(pending);
  assert.equal(shared.catalogMetadata.models.cache, 'coalesced');
  const retry = overCapacity.fetchModels(); assert.equal(calls, 33); release.splice(0).forEach(resolve => resolve()); await retry;
  assert.equal(overCapacity.models.has('actual/query-result'), true); assert.equal(overCapacity.modelsError, '');
});
for (const transport of ['http', 'libp2p']) {
  test(`panel native read controls execute the four exact owner operations over ${transport}`, async t => {
    const f = await panel(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    for (const [action, tool] of [['inspect-model-artifacts', 'list_models'], ['refresh-hardware-fit', 'hardware_profile'], ['read-job-status', 'job_status'], ['recover-no-capacity', 'telemetry']]) {
      const count = f.calls.length; f.button(action).click(); await until(() => f.calls.length === count + 1);
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(f.calls.at(-1).tool_id, tool); assert.equal(f.calls.at(-1).transport, transport);
      assert.equal(f.calls.at(-1).binding_id, `accelerate-panel.ipfs_accelerate_py.${opNames[tool]}`);
    }
    assert.equal(f.calls[2].input.payload.task_id, 'real-existing-task');
  });
  test(`panel inference confirms then reports actual preview without creating a job over ${transport}`, async t => {
    const f = await panel(t, { run_inference_job: { dry_run: true, mutation_performed: false, validation: 'real-callable-signature' } });
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    f.button('launch-primary-execution').click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
    assert.equal(f.calls.length, 0); f.root.querySelector('[data-gateway-confirm]').click(); await until(f.settled);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].tool_id, 'run_inference_job'); assert.equal(f.calls[0].transport, transport);
    assert.equal(f.calls[0].input.payload.model, 'catalog-confirmed-model'); assert.equal(f.calls[0].input.payload.max_length, 64);
    assert.match(f.root.querySelector('#accelerate-primary-status').textContent, /preview validated/);
    assert.match(f.root.querySelector('#accelerate-queue-status').textContent, /no job was created/);
    assert.match(f.root.querySelector('#accelerate-selected-model').textContent, /catalog-confirmed-model/);
  });
}
test('panel inference cancellation sends zero owner calls', async t => {
  const f = await panel(t); f.button('launch-primary-execution').click(); await until(() => f.root.querySelector('[data-gateway-cancel]'));
  f.root.querySelector('[data-gateway-cancel]').click(); await until(() => f.root.querySelector('#accelerate-primary-status').textContent.includes('Cancelled'));
  assert.equal(f.calls.length, 0);
});
test('panel actual submitted job is read separately and unsupported cancellation never invokes a substitute', async t => {
  const f = await panel(t, { run_inference_job: { success: true, job_id: 'actual-owner-task' } });
  f.button('launch-primary-execution').click(); await until(() => f.root.querySelector('[data-gateway-confirm]')); f.root.querySelector('[data-gateway-confirm]').click(); await until(f.settled);
  assert.equal(f.calls.length, 1); assert.match(f.root.querySelector('#accelerate-queue-status').textContent, /actual-owner-task/);
  f.button('cancel-queued-job').click(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.calls.length, 1);
  assert.match(f.root.querySelector('#accelerate-queue-status').textContent, /Nothing was cancelled/);
  assert.equal(f.button('cancel-queued-job').hasAttribute('data-native-gateway-binding'), false);
  f.button('read-job-status').click(); await until(() => f.calls.length === 2);
  assert.equal(f.calls[1].input.payload.task_id, 'actual-owner-task');
});
test('panel structured owner failure cannot turn into a successful result', async t => {
  const f = await panel(t, { list_models: { content: [{ type: 'json', json: { success: false, error: 'Actual catalog unavailable' } }] } });
  f.button('inspect-model-artifacts').click(); await until(() => f.root.querySelector('#accelerate-model-status').textContent.includes('Actual catalog unavailable'));
  assert.equal(f.calls.length, 1); assert.equal(f.root.querySelector('#accelerate-envelope-result').textContent, '');
});

test('desktop resolves strudel-grandma to its actual canonical music-studio owner', () => {
  const begin = source.indexOf('const VIRTUAL_DESKTOP_ALIAS_TO_ID = new Map(');
  const finish = source.indexOf('class SwissKnifeDesktop', begin);
  const resolve = new Function(`${source.slice(begin, finish)}; return resolveVirtualDesktopAppId;`)();
  const apps = new Map([['music-studio', {}], ['strudel', {}]]);
  assert.equal(resolve('strudel-grandma', apps), 'music-studio');
  assert.equal(resolve('strudel', apps), 'strudel');
  assert.equal(resolve('unknown-alias', apps), null);
});

test('panel layout keeps full native evidence in collapsed diagnostics and primary statuses compact', async t => {
  const large = 'authored-diagnostic-only-'.repeat(1000);
  const f = await panel(t, { list_models: { models: [{ id: 'gpt2' }], native_provenance: { detail: large } } });
  f.button('inspect-model-artifacts').click(); await until(f.settled);
  const diagnostic = f.root.querySelector('details.accelerate-diagnostics');
  assert.ok(diagnostic); assert.equal(diagnostic.open, false);
  assert.ok(diagnostic.querySelector('#accelerate-envelope-result').textContent.includes(large));
  assert.ok(f.root.querySelector('#accelerate-model-status').textContent.length < 180);
  assert.equal(f.root.querySelector('#accelerate-model-status').textContent.includes(large), false);
  for (const action of ['launch-primary-execution', 'inspect-model-artifacts', 'refresh-hardware-fit', 'read-job-status', 'cancel-queued-job', 'recover-no-capacity']) assert.ok(f.button(action));
});

test('panel layout contains its native primary surface while preserving scrollable app and gateway controls', async t => {
  dom(t);
  const frame = document.createElement('div'); frame.className = 'window';
  frame.innerHTML = '<div class="window-content"><div class="window-app-content"><div id="mount"></div><div class="live-tool-gateway-host"></div></div></div>';
  document.body.append(frame); const mount = frame.querySelector('#mount');
  await createPanel.call({ setupEventListeners() {} }, mount);
  assert.equal(frame.querySelector('.window-content').style.overflow, 'hidden');
  assert.equal(frame.querySelector('.window-app-content').style.minHeight, '0');
  assert.equal(mount.style.overflow, 'auto'); assert.equal(mount.style.minHeight, '0');
  assert.equal(frame.querySelector('.live-tool-gateway-host').style.overflow, 'auto');
  assert.equal(frame.querySelector('.live-tool-gateway-host').style.maxHeight, '24%');
  assert.ok(mount.querySelector('#accelerate-output')); assert.ok(mount.querySelector('#accelerate-model-id'));
  assert.ok(mount.querySelector('#accelerate-error-status')); assert.ok(mount.querySelector('[data-action="run-primary-inference"]'));
});

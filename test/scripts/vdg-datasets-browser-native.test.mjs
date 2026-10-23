import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { invokeNativeTool } from '../../web/js/live-tool-gateway.js';

const source = fs.readFileSync(new URL('../../web/js/main-simple.js', import.meta.url), 'utf8');
const start = source.indexOf('    async createDatasetsBrowserSurface(contentElement) {');
const end = source.indexOf('\n    async createMCPPlusPlusExplorerSurface', start);
assert.ok(start > 0 && end > start);
const createBrowser = new Function('invokeNativeTool', `return (${source.slice(start, end).trim().replace('async createDatasetsBrowserSurface', 'async function createDatasetsBrowserSurface')})`)(invokeNativeTool);
const operations = { semantic_search: 'search_dataset', record_provenance: 'record_dataset_provenance', index: 'preview_dataset_preparation', sync_status: 'read_dataset_progress' };
const defaults = {
  semantic_search: { collection: 'actual-owner-collection', model: 'actual-owner-model', filters: { language: 'en' } },
  record_provenance: { inputs: ['actual-dataset-cid'] },
  index: { dataset_source: { data: [{ text: 'actual fixture record' }] }, operations: [{ type: 'clean' }] },
  sync_status: {},
};
async function until(predicate) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); }
  throw new Error('Dataset UI did not settle');
}
async function fixture(t, options = {}) {
  const keys = ['window', 'document', 'localStorage', 'CustomEvent', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, CustomEvent: window.CustomEvent });
  t.after(() => { window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const calls = [];
  const origins = [];
  const controls = Object.entries(operations).map(([tool, operation]) => ({
    app_id: 'datasets-browser', owner: 'ipfs_datasets_py', binding_id: `datasets-browser.ipfs_datasets_py.${operation}`,
    selected_tool_id: tool, preferred_tool_ids: [tool], transport: 'http', transports: ['http', 'libp2p'],
    intent_id: `datasets-browser.ipfs_datasets_py.${operation}`, mutates_remote_state: ['index', 'record_provenance'].includes(tool),
    safe_payloads: { [tool]: options.defaults?.[tool] ?? defaults[tool] },
  }));
  controls.push({ app_id: 'datasets-browser', safe_payloads: { get_from_ipfs: { cid: 'actual-dataset-cid' } } });
  globalThis.fetch = async (url, request = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(request.body); calls.push(call);
    const actual = call.tool_id === 'semantic_search' ? { results: [{ text: 'actual match', score: 0.8 }] }
      : call.tool_id === 'sync_status' ? { status: 'success', ipfs_available: true, dataset_id: call.input.payload.dataset_id }
        : { ok: true, dry_run: true, mutation_performed: false, body_executed: false, validation: 'real-callable-signature' };
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      transport: call.transport, result: options.results?.[call.tool_id] ?? actual, receipt: { receipt_id: 'actual-owner-receipt' } }) };
  };
  const root = document.createElement('div'); document.body.append(root);
  root.addEventListener('swissknife:live-gateway-result', event => origins.push(event.detail.origin));
  await createBrowser.call({ setupEventListeners() {} }, root);
  const action = name => root.querySelector(`[data-svd-workflow-action="${name}"]`);
  return { root, calls, origins, action };
}
for (const transport of ['http', 'libp2p']) {
  test(`native Search and Progress use exact reviewed operations and actual context over ${transport}`, async t => {
    const f = await fixture(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    f.root.querySelector('[data-datasets-query]').value = 'my actual user query';
    f.root.querySelector('[data-datasets-filter="split"]').value = 'validation';
    f.action('run-semantic-search').click();
    await until(() => f.root.querySelector('#datasets-semantic-status').textContent.includes('actual-owner-receipt'));
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].input.payload, { ...defaults.semantic_search, query: 'my actual user query', top_k: 5, filters: { language: 'en', schema: 'support-intent-v2', split: 'validation' } });
    f.action('refresh-progress').click();
    await until(() => f.root.querySelector('#datasets-progress-status').textContent.includes('Actual IPFS backend is available'));
    assert.equal(f.calls.length, 2); assert.equal(f.calls[1].input.payload.dataset_id, 'actual-dataset-cid');
    for (const call of f.calls) {
      assert.equal(call.binding_id, `datasets-browser.ipfs_datasets_py.${operations[call.tool_id]}`);
      assert.equal(call.owner, 'ipfs_datasets_py'); assert.equal(call.transport, transport);
    }
    assert.deepEqual(f.origins, ['native-control', 'native-control']);
    assert.equal(f.root.querySelector('#datasets-progress-bar').hasAttribute('value'), false);
  });
  test(`native provenance and preparation confirm actual payloads and only report previews over ${transport}`, async t => {
    const f = await fixture(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    f.root.querySelector('[data-datasets-id]').value = 'actual-user-selected-dataset';
    f.root.querySelector('[data-datasets-source]').value = JSON.stringify({ data: [{ text: 'user records' }] });
    for (const [action, tool, status] of [['record-provenance', 'record_provenance', '#datasets-provenance-status'], ['start-preparation-job', 'index', '#datasets-preparation-status']]) {
      const count = f.calls.length; f.action(action).click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
      assert.equal(f.calls.length, count);
      assert.equal(f.action(action).dataset.nativeToolId, tool);
      f.root.querySelector('[data-gateway-confirm]').click(); await until(() => f.calls.length === count + 1 && f.root.querySelector(status).textContent.includes('preview validated'));
      assert.equal(f.calls.at(-1).tool_id, tool); assert.equal(f.calls.at(-1).transport, transport);
      assert.equal(f.calls.at(-1).input.policy.consent, 'granted'); assert.equal(f.calls.at(-1).input.policy.dry_run, true);
      assert.match(f.root.querySelector(status).textContent, /body not executed, no record, index or job created/);
    }
    assert.equal(f.calls[0].input.payload.dataset_id, 'actual-user-selected-dataset');
    assert.equal(f.calls[0].input.payload.operation, 'dataset-browser-context');
    assert.deepEqual(f.calls[1].input.payload.dataset_source, { data: [{ text: 'user records' }] });
    assert.deepEqual(f.calls[1].input.payload.operations, [{ type: 'clean' }]);
    assert.ok(f.calls.every(call => call.binding_id === `datasets-browser.ipfs_datasets_py.${operations[call.tool_id]}`));
  });
}
test('cancelled mutation and local filter/error controls send zero owner calls', async t => {
  const f = await fixture(t);
  for (const [action, status] of [['record-provenance', '#datasets-provenance-status'], ['start-preparation-job', '#datasets-preparation-status']]) {
    f.action(action).click(); await until(() => f.root.querySelector('[data-gateway-cancel]'));
    f.root.querySelector('[data-gateway-cancel]').click(); await until(() => f.root.querySelector(status).textContent.includes('Cancelled'));
  }
  for (const action of ['apply-schema-filter', 'show-schema-error']) {
    assert.equal(f.action(action).hasAttribute('data-native-gateway-binding'), false); f.action(action).click();
  }
  assert.equal(f.calls.length, 0); assert.match(f.root.querySelector('#datasets-error-status').textContent, /No backend call was made/);
});
test('preparation displays reviewed actual records and never routes through load_index', async t => {
  const f = await fixture(t); f.action('start-preparation-job').click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
  assert.deepEqual(JSON.parse(f.root.querySelector('[data-datasets-source]').value), defaults.index.dataset_source);
  f.root.querySelector('[data-gateway-confirm]').click(); await until(() => f.calls.length === 1);
  assert.equal(f.calls[0].tool_id, 'index'); assert.equal(f.calls[0].input.payload.dataset_id, undefined);
});
test('invalid preparation records fail before confirmation or dispatch', async t => {
  const f = await fixture(t); f.root.querySelector('[data-datasets-source]').value = '"unregistered-mock-id"';
  f.action('start-preparation-job').click(); await until(() => f.root.querySelector('#datasets-preparation-status').textContent.includes('actual preparation records'));
  assert.equal(f.calls.length, 0); assert.equal(f.root.querySelector('[data-gateway-confirm]'), null);
});
test('missing real semantic collection or blank query never invokes fallback search', async t => {
  const f = await fixture(t, { defaults: { semantic_search: {} } });
  f.action('run-semantic-search').click(); await until(() => f.root.querySelector('#datasets-semantic-status').textContent.includes('actual search collection'));
  assert.equal(f.calls.length, 0);
  f.root.querySelector('[data-datasets-query]').value = ' ';
  f.action('run-semantic-search').click(); await until(() => f.root.querySelector('#datasets-semantic-status').textContent.includes('non-empty search query'));
  assert.equal(f.calls.length, 0);
});
test('nested semantic owner failure remains visible and produces no result', async t => {
  const f = await fixture(t, { results: { semantic_search: { content: [{ type: 'json', json: { status: 'error', message: 'Actual FAISS unavailable' } }] } } });
  f.action('run-semantic-search').click(); await until(() => f.root.querySelector('#datasets-semantic-status').textContent.includes('Actual FAISS unavailable'));
  assert.equal(f.calls.length, 1); assert.equal(f.root.querySelector('#datasets-envelope-result').textContent, '');
});
test('actual unavailable IPFS status is exposed without fabricated progress', async t => {
  const f = await fixture(t, { results: { sync_status: { status: 'success', ipfs_available: false, ipfs_error: 'Actual owner daemon unavailable' } } });
  f.action('refresh-progress').click(); await until(() => f.root.querySelector('#datasets-progress-status').textContent.includes('IPFS backend unavailable'));
  assert.equal(f.calls.length, 1); assert.match(f.root.querySelector('#datasets-progress-status').textContent, /Actual owner daemon unavailable/);
  assert.match(f.root.querySelector('#datasets-progress-status').textContent, /No preparation progress is available/);
  assert.equal(f.root.querySelector('#datasets-progress-bar').hasAttribute('value'), false);
});
test('a mutation without a validated no-write preview cannot claim preparation success', async t => {
  const f = await fixture(t, { results: { index: { status: 'success', job_id: 'unacceptable-invented-job' } } });
  f.action('start-preparation-job').click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
  f.root.querySelector('[data-gateway-confirm]').click(); await until(() => f.root.querySelector('#datasets-preparation-status').textContent.includes('required no-mutation validated preview'));
  assert.equal(f.root.querySelector('#datasets-envelope-result').textContent, '');
});

// Authored owner responses exercise the actual surface/validator. No SDK,
// embedding model, browser, dataset store or live owner is invoked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { invokeNativeTool } from '../../web/js/live-tool-gateway.js';
import { validateScenario } from '../../scripts/run-visual-functional-workflow.mjs';

const source = fs.readFileSync(new URL('../../web/js/main-simple.js', import.meta.url), 'utf8');
const start = source.indexOf('    async createDatasetsBrowserSurface(contentElement) {');
const end = source.indexOf('\n    async createMCPPlusPlusExplorerSurface', start);
assert.ok(start > 0 && end > start);
const createBrowser = new Function('invokeNativeTool', `return (${source.slice(start, end).trim().replace('async createDatasetsBrowserSurface', 'async function createDatasetsBrowserSurface')})`)(invokeNativeTool);
const scenarioPath = process.env.SVF_DATASETS_SCENARIO_CANDIDATE
  || new URL('../e2e/functional-workflows/datasets-browser.json', import.meta.url);
const scenario = JSON.parse(fs.readFileSync(scenarioPath));
const contracts = JSON.parse(fs.readFileSync(new URL('../../config/visual-functional-app-contracts.json', import.meta.url)));
const app = contracts.apps.find(item => item.app_id === 'datasets-browser');
const knownRow = { score: 0.83, vector_id: 'doc_0', document: { metadata: { note_id: 'cedar-ledger', title: 'SVF cedar-ledger note' }, text: 'cedar-ledger semantic phrase for notebook search' } };
async function until(predicate) {
  for (let count = 0; count < 150; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw Error('authored dataset surface did not settle');
}
async function fixture(t) {
  const names = ['window', 'document', 'localStorage', 'sessionStorage', 'CustomEvent', 'fetch'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, sessionStorage: window.sessionStorage, CustomEvent: window.CustomEvent });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls: [{
      app_id: 'datasets-browser', owner: 'ipfs_datasets_py', binding_id: 'datasets-browser.ipfs_datasets_py.search_dataset',
      intent_id: 'datasets-browser.ipfs_datasets_py.search_dataset', selected_tool_id: 'semantic_search', preferred_tool_ids: ['semantic_search'],
      transport: 'http', transports: ['http'], mutates_remote_state: false,
      safe_payloads: { semantic_search: { collection: 'authored-controlled-collection', model: 'authored-model' } },
    }] }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call', 'all other network requests forbidden');
    const call = JSON.parse(options.body); calls.push(call);
    return { status: 200, json: async () => ({ ok: true, outcome: 'executed', transport: 'http', correlation_id: call.correlation_id,
      result: { result: { content: [{ type: 'json', json: { query: call.input.payload.query, collection: 'authored-controlled-collection', results: [knownRow], total_found: 1 } }] } },
      receipt: { receipt_id: 'authored-unit-receipt' } }) };
  };
  const root = document.createElement('main'); document.body.append(root);
  await createBrowser.call({ setupEventListeners() {} }, root);
  t.after(async () => {
    await window.happyDOM.abort();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  const query = root.querySelector('#datasets-query'), identity = root.querySelector('#datasets-record-id');
  identity.value = 'authored-selected-dataset';
  const search = async value => {
    query.value = value; root.querySelector('#datasets-search').click();
    await until(() => !root.querySelector('#datasets-semantic-status').hidden);
  };
  return { root, query, identity, calls, search };
}

test('declared recovery uses the genuine empty-query rejection and a real known-record owner assertion', () => {
  validateScenario(scenario, app);
  const failure = scenario.phases.failure_recovery;
  assert.equal(failure[0].op, 'fill'); assert.equal(failure[0].selector, '#datasets-query'); assert.equal(failure[0].value, '');
  assert.ok(failure.find(step => step.checkpoint_id === 'error_observed' && step.expected.includes('The dataset selection was kept.')));
  assert.deepEqual(scenario.backend_bindings[0].result_assertion, {
    pointer: '/result/result/content/0/json/results/0/document/metadata/note_id', operator: 'equals', expected: 'cedar-ledger',
  });
  assert.equal(scenario.phases.primary_result.at(-1).expected, 'schema=support-intent-v2');
  assert.equal(scenario.phases.persist_reopen.at(-1).expected, 'bafkreib3xeblemlbglbw2yduqo2xkaiqt34ms6q7l63bn5q2yzmpd72lgm');
  assert.equal(failure.at(-1).expected, 'schema=support-intent-v2', 'original schema target remains strict');
});

test('empty and whitespace queries expose actual validation failure without owner dispatch or lost selection', async t => {
  const f = await fixture(t);
  for (const query of ['', '   ']) {
    await f.search(query);
    assert.match(f.root.querySelector('#datasets-error-status').textContent, /Enter a non-empty search query/);
    assert.match(f.root.querySelector('#datasets-error-status').textContent, /The dataset selection was kept/);
    assert.equal(f.identity.value, 'authored-selected-dataset'); assert.equal(f.calls.length, 0);
    assert.equal(f.root.querySelectorAll('.datasets-row').length, 0);
  }
});

test('correcting the rejected query reads real returned document data and clears the failure', async t => {
  const f = await fixture(t); await f.search(''); await f.search('desktop note provenance');
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].tool_id, 'semantic_search'); assert.equal(f.calls[0].input.payload.query, 'desktop note provenance');
  assert.equal(f.identity.value, 'authored-selected-dataset');
  assert.equal(f.root.querySelectorAll('.datasets-row').length, 1);
  assert.match(f.root.querySelector('#datasets-rows').textContent, /cedar-ledger semantic phrase for notebook search/);
  assert.match(f.root.querySelector('#datasets-rows').textContent, /"note_id":"cedar-ledger"/);
  assert.equal(f.root.querySelector('#datasets-error-status').textContent, 'No query failure.');
});

test('an arbitrary string remains a valid semantic nearest-neighbor query rather than a fabricated no-match error', async t => {
  const f = await fixture(t); await f.search('___svf_missing_record___');
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].input.payload.query, '___svf_missing_record___');
  assert.equal(f.root.querySelectorAll('.datasets-row').length, 1);
  assert.equal(f.root.querySelector('#datasets-error-status').textContent, 'No query failure.');
});

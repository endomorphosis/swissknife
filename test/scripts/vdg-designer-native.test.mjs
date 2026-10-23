import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { NeuralNetworkDesignerApp } from '../../web/js/apps/neural-network-designer.js';
import { contentCidForBytes, stableStringifyValue } from '../../web/js/core/mcp-plus-plus-desktop-client.js';

const tools = {
  list_models: ['ipfs_accelerate_py', 'read_model_catalog', false, {}],
  job_status: ['ipfs_accelerate_py', 'read_job_status', false, { task_id: 'real-existing-task' }],
  run_inference_job: ['ipfs_accelerate_py', 'run_inference_job', true, { model: 'real-catalog-model', input: 'owner sample' }],
  artifacts_put: ['ipfs_kit_py', 'persist_artifact', true, {}],
  artifacts_get: ['ipfs_kit_py', 'retrieve_artifact', false, { cid: 'owner-existing-artifact' }],
};
const controls = Object.entries(tools).map(([tool, [owner, operation, mutates, payload]]) => ({
  app_id: 'neural-network-designer', owner, binding_id: `neural-network-designer.${owner}.${operation}`,
  intent_id: `neural-network-designer.${owner}.${operation}`, preferred_tool_ids: [tool], selected_tool_id: tool,
  transport: 'http', transports: ['http', 'libp2p'], mutates_remote_state: mutates, safe_payload: payload,
}));
async function until(predicate) {
  for (let count = 0; count < 100; count += 1) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); }
  throw new Error('Confirmation did not appear');
}
function fixture(t, results = {}) {
  const keys = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent, localStorage: window.localStorage });
  const app = new NeuralNetworkDesignerApp({});
  const root = document.createElement('div'); root.innerHTML = app.render(); document.body.append(root);
  app.updateWorkflowPanel = () => {};
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body); calls.push(call);
    const result = typeof results[call.tool_id] === 'function' ? await results[call.tool_id](call) : results[call.tool_id];
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      result: result || { success: true }, receipt: { receipt_id: 'actual-receipt', event_dag_refs: ['actual-event'] } }) };
  };
  t.after(() => {
    window.happyDOM.abort();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  });
  const trigger = tool => root.querySelector(`[data-native-tool-id="${tool}"]`);
  const confirm = async pending => { await until(() => root.querySelector('[data-gateway-confirm]')); assert.equal(calls.length, 0); root.querySelector('[data-gateway-confirm]').click(); await pending; };
  return { app, root, calls, trigger, confirm };
}
for (const transport of ['http', 'libp2p']) {
  test(`designer model and existing job reads use exact ${transport} owner operations`, async t => {
    const f = fixture(t, { list_models: { models: [{ id: 'actual-model' }] }, job_status: { task_id: 'real-existing-task', status: 'completed' } });
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    await f.app.refreshModelCatalog(f.trigger('list_models'));
    await f.app.refreshJobStatus(f.trigger('job_status'));
    assert.deepEqual(f.calls.map(call => call.tool_id), ['list_models', 'job_status']);
    assert.ok(f.calls.every(call => call.transport === transport && call.app_id === 'neural-network-designer'));
    assert.equal(f.calls[1].input.payload.task_id, 'real-existing-task');
    assert.equal(f.calls[1].input.payload.task, undefined);
    assert.equal(f.app.designArtifacts.modelCatalog.models[0].id, 'actual-model');
    assert.match(f.app.designArtifacts.backendStatus, /real-existing-task/);
  });
  test(`designer inference preview confirms and preserves actual graph on ${transport}`, async t => {
    const f = fixture(t, { run_inference_job: { success: true, dry_run: true, validated: true } });
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    f.app.networkConfig.layers.push({ id: 'actual-layer', type: 'input', params: { inputSize: 7 } });
    await f.confirm(f.app.runInferenceJob(f.trigger('run_inference_job')));
    assert.equal(f.calls.length, 1); const call = f.calls[0];
    assert.equal(call.tool_id, 'run_inference_job'); assert.equal(call.transport, transport);
    assert.equal(call.input.payload.model, 'real-catalog-model');
    assert.equal(JSON.parse(call.input.payload.input).layers[0].id, 'actual-layer');
    assert.equal(f.app.designArtifacts.inference.status, 'preview');
    assert.equal(f.app.designArtifacts.inference.job_id, null);
    assert.equal(f.app.designArtifacts.inference.envelope.correlation_id, call.correlation_id);
  });
  test(`designer artifact preview on ${transport} never assigns persistence`, async t => {
    const f = fixture(t, { artifacts_put: { success: true, dry_run: true, validated: true, persisted: false } });
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    await f.confirm(f.app.requestGraphPersist(f.trigger('artifacts_put')));
    const call = f.calls[0];
    assert.equal(call.tool_id, 'artifacts_put'); assert.equal(call.transport, transport);
    const bytes = Uint8Array.from(Buffer.from(call.input.payload.bytes_base64, 'base64'));
    assert.equal(await contentCidForBytes(bytes), call.input.payload.cid);
    assert.equal(f.app.designArtifacts.graphPersistedCid, null);
    assert.match(f.app.designArtifacts.backendStatus, /preview validated; no artifact was persisted/);
  });
}
test('designer cancelled artifact submission sends zero calls and preserves version history', async t => {
  const f = fixture(t); const pending = f.app.requestVersionCommit(f.trigger('artifacts_put'));
  await until(() => f.root.querySelector('[data-gateway-cancel]'));
  f.root.querySelector('[data-gateway-cancel]').click(); await pending;
  assert.equal(f.calls.length, 0); assert.equal(f.app.designArtifacts.versions.length, 0);
  assert.match(f.app.designArtifacts.backendStatus, /Cancelled/);
});
test('designer records a real submitted job ID without claiming completion or extra polling', async t => {
  const f = fixture(t, { run_inference_job: { success: true, job_id: 'actual-owner-job' } });
  await f.confirm(f.app.runInferenceJob(f.trigger('run_inference_job')));
  assert.equal(f.app.designArtifacts.inference.status, 'submitted');
  assert.equal(f.app.designArtifacts.inference.job_id, 'actual-owner-job');
  assert.deepEqual(f.calls.map(call => call.tool_id), ['run_inference_job']);
});
test('designer refuses structured owner failures', async t => {
  const f = fixture(t, { artifacts_put: { content: [{ type: 'json', json: { success: false, error: 'Actual store failure' } }] },
    run_inference_job: { success: false, error: 'Actual inference failure' } });
  await f.confirm(f.app.requestGraphPersist(f.trigger('artifacts_put')));
  assert.match(f.app.designArtifacts.backendStatus, /Actual store failure/);
  assert.equal(f.app.designArtifacts.graphPersistedCid, null);
  const pending = f.app.runInferenceJob(f.trigger('run_inference_job'));
  await until(() => f.root.querySelector('[data-gateway-confirm]')); f.root.querySelector('[data-gateway-confirm]').click(); await pending;
  assert.equal(f.app.designArtifacts.inference.status, 'failed');
  assert.match(f.app.designArtifacts.inference.error, /Actual inference failure/);
});
test('designer retrieves actual content-addressed bytes and rejects mismatched CID', async t => {
  const record = { schema: 'real-record', layers: [{ id: 'real-layer' }], connections: [] };
  const bytes = new TextEncoder().encode(stableStringifyValue(record)); const cid = await contentCidForBytes(bytes);
  const f = fixture(t, { artifacts_get: { found: true, cid, bytes_base64: Buffer.from(bytes).toString('base64'), verified: true } });
  assert.deepEqual((await f.app.retrieveArtifact(cid, f.trigger('artifacts_get'))).record, record);
  await assert.rejects(f.app.retrieveArtifact('not-the-real-cid', f.trigger('artifacts_get')), /did not match its CID/);
});
test('designer assigns persisted CID only after real exact-byte acknowledgment', async t => {
  const f = fixture(t, { artifacts_put: call => ({ persisted: true, verified: true, cid: call.input.payload.cid }) });
  await f.confirm(f.app.requestGraphPersist(f.trigger('artifacts_put')));
  assert.equal(f.app.designArtifacts.graphPersistedCid, f.calls[0].input.payload.cid);
  assert.match(f.app.designArtifacts.backendStatus, /Graph artifact persisted/);
});
test('designer local graph, validation, and planning controls remain local', t => {
  const f = fixture(t);
  for (const action of ['generate-graph-artifacts', 'validate-schema-contract', 'plan-compile-train', 'surface-invalid-edge-feedback']) {
    const candidates = [...f.root.querySelectorAll(`[data-svd-workflow-action="${action}"]`)];
    assert.ok(candidates.some(button => !button.hasAttribute('data-native-gateway-binding')), action);
  }
  assert.ok(f.trigger('list_models')); assert.ok(f.trigger('job_status')); assert.ok(f.trigger('run_inference_job'));
});

test('designer rejects a persistence acknowledgment for a different content CID', async t => {
  const f = fixture(t, { artifacts_put: { persisted: true, verified: true, cid: 'not-the-sent-cid' } });
  await f.confirm(f.app.requestGraphPersist(f.trigger('artifacts_put')));
  assert.equal(f.app.designArtifacts.graphPersistedCid, null);
  assert.match(f.app.designArtifacts.backendStatus, /did not verify the persisted artifact/);
});
test('designer disabled graph verification remains visible and explains its missing context', t => {
  const f = fixture(t);
  const button = [...f.root.querySelectorAll('button')].find(button => button.textContent === 'Verify retrieve');
  assert.equal(button.disabled, true); assert.match(button.title, /Persist a graph artifact/);
  assert.equal(button.hasAttribute('data-native-gateway-binding'), false);
  f.app.designArtifacts.graphPersistedCid = 'actual-existing-graph';
  f.root.innerHTML = f.app.render();
  const active = [...f.root.querySelectorAll('button')].find(button => button.textContent === 'Verify retrieve');
  assert.equal(active.disabled, false); assert.equal(active.dataset.nativeToolId, 'artifacts_get');
});

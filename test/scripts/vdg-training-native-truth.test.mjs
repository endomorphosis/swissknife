import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
let instance = 0;
const binding = { app_id: 'training-manager', owner: 'ipfs_accelerate_py',
  binding_id: 'training-manager.ipfs_accelerate_py.preview_training_task',
  intent_id: 'training-manager.ipfs_accelerate_py.preview_training_task',
  selected_tool_id: 'submit_task', preferred_tool_ids: ['submit_task'], mutates_remote_state: true,
  transport: 'http', transports: ['http', 'libp2p'] };
async function until(predicate) { for (let count = 0; count < 100; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); } throw new Error('UI did not settle'); }
async function fixture(t, { result = { ok: true, dry_run: true, validation: 'real-callable-signature', body_executed: false, mutation_performed: false }, jobs } = {}) {
  const keys = ['window', 'document', 'localStorage', 'CustomEvent', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, CustomEvent: window.CustomEvent });
  if (jobs) localStorage.setItem('training-manager-jobs', JSON.stringify(jobs));
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls: [binding] }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call'); const call = JSON.parse(options.body); calls.push(call);
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      transport: call.transport, result, receipt: { receipt_id: 'actual-owner-receipt', event_dag_refs: ['actual-owner-event'] } }) };
  };
  const url = new URL('../../web/js/apps/training-manager.js', import.meta.url); url.searchParams.set('native-truth-test', String(++instance));
  await import(url.href);
  const root = document.createElement('div'); document.body.append(root); const app = window.createTrainingManagerApp(); app.init(root);
  t.after(() => {
    app.destroy(); window.happyDOM.abort();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  });
  return { root, calls, button: root.querySelector('#launch-governed-training'), status: root.querySelector('#training-owner-preview'), app };
}
test('opening training manager invents no job, dataset, metric, checkpoint, or receipt', async t => {
  const f = await fixture(t);
  assert.equal(f.calls.length, 0); assert.equal(f.root.querySelector('#total-jobs').textContent, '0');
  assert.equal(localStorage.getItem('training-manager-jobs'), null); assert.equal(localStorage.getItem('training-manager-datasets'), null);
  assert.equal(f.root.querySelector('#workflow-queue-state').textContent, 'not observed');
  assert.equal(f.root.querySelector('#workflow-telemetry-state').textContent, 'not observed');
  assert.equal(f.root.querySelector('#workflow-checkpoint-state').textContent, 'not observed');
  assert.equal(f.root.textContent.includes('receipt:training-manager:'), false);
  assert.match(f.button.textContent, /training unavailable/);
});
for (const transport of ['http', 'libp2p']) {
  test(`training owner preview confirms before exact submit_task over ${transport} and creates no simulated job`, async t => {
    const f = await fixture(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    f.button.click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
    assert.equal(f.calls.length, 0); f.root.querySelector('[data-gateway-confirm]').click();
    await until(() => f.status.dataset.previewState === 'preview');
    assert.equal(f.calls.length, 1); const call = f.calls[0];
    assert.equal(call.tool_id, 'submit_task'); assert.equal(call.transport, transport);
    assert.equal(call.binding_id, binding.binding_id); assert.equal(call.input.policy.dry_run, true); assert.equal(call.input.policy.consent, 'granted');
    assert.match(f.status.textContent, /no training job, metrics, checkpoint, or remote change was created/);
    assert.match(f.status.textContent, /actual-owner-receipt/); assert.equal(f.root.querySelector('#total-jobs').textContent, '0');
    assert.equal(localStorage.getItem('training-manager-jobs'), null);
  });
}
test('training preview cancellation sends zero calls and does not create history', async t => {
  const f = await fixture(t); f.button.click(); await until(() => f.root.querySelector('[data-gateway-cancel]'));
  f.root.querySelector('[data-gateway-cancel]').click(); await until(() => f.status.dataset.previewState === 'cancelled');
  assert.equal(f.calls.length, 0); assert.equal(localStorage.getItem('training-manager-jobs'), null);
});
test('training preview owner error remains a failure without fabricated metrics or IDs', async t => {
  const f = await fixture(t, { result: { content: [{ type: 'json', json: { success: false, error: 'Actual task queue unavailable' } }] } });
  f.button.click(); await until(() => f.root.querySelector('[data-gateway-confirm]')); f.root.querySelector('[data-gateway-confirm]').click();
  await until(() => f.status.dataset.previewState === 'failed');
  assert.match(f.status.textContent, /Actual task queue unavailable/); assert.equal(f.root.querySelector('#total-jobs').textContent, '0');
  assert.equal(f.root.querySelector('#workflow-telemetry-state').textContent, 'not observed');
});
test('a real task ID or incomplete preview receipt cannot be relabeled successful training', async t => {
  const f = await fixture(t, { result: { success: true, task_id: 'actual-owner-task' } });
  f.button.click(); await until(() => f.root.querySelector('[data-gateway-confirm]')); f.root.querySelector('[data-gateway-confirm]').click();
  await until(() => f.status.dataset.previewState === 'failed');
  assert.match(f.status.textContent, /did not verify a no-side-effect signature preview/);
  assert.equal(f.root.querySelector('#total-jobs').textContent, '0');
  assert.equal(localStorage.getItem('training-manager-jobs'), null);
});
test('existing historical simulation is retained without being treated as current owner telemetry', async t => {
  const jobs = [{ id: 'historical-local-simulation', name: 'Saved local history', status: 'completed', simulated: true,
    architecture: 'old-user-configuration', config: { epochs: 1 }, progress: 100, currentEpoch: 1,
    currentLoss: 0.2, currentAccuracy: 0.8, startTime: '2026-10-20T00:00:00Z',
    telemetry: { samplesPerSecond: 999, step: 'historical', receiptId: 'old-local-claim' }, logs: [], checkpoints: [] }];
  const f = await fixture(t, { jobs });
  assert.equal(f.root.querySelector('#total-jobs').textContent, '1'); assert.equal(f.root.querySelector('#workflow-telemetry-state').textContent, 'not observed');
  const before = localStorage.getItem('training-manager-jobs');
  f.button.click(); await until(() => f.root.querySelector('[data-gateway-confirm]')); f.root.querySelector('[data-gateway-confirm]').click();
  await until(() => f.status.dataset.previewState === 'preview');
  assert.equal(localStorage.getItem('training-manager-jobs'), before); assert.equal(f.root.querySelector('#total-jobs').textContent, '1');
  assert.match(f.root.querySelector('#jobs-list').textContent, /local simulation/);
});

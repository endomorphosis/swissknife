import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { CinemaApp } from '../../web/js/apps/cinema.js';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';
const controls = [
  { app_id: 'cinema', owner: 'ipfs_kit_py', binding_id: 'cinema.ipfs_kit_py.persist_artifact', selected_tool_id: 'artifacts_put', preferred_tool_ids: ['artifacts_put'], intent_id: 'cinema.ipfs_kit_py.persist_artifact', transport: 'http', transports: ['http', 'libp2p'], mutates_remote_state: true, safe_payload: {} },
  { app_id: 'cinema', owner: 'ipfs_accelerate_py', binding_id: 'cinema.ipfs_accelerate_py.run_inference_job', selected_tool_id: 'run_inference_job', preferred_tool_ids: ['run_inference_job'], intent_id: 'cinema.ipfs_accelerate_py.run_inference_job', transport: 'http', transports: ['http', 'libp2p'], mutates_remote_state: true, safe_payload: { model: 'catalog-confirmed-model', input: 'owner sample' } },
];
const defaultResults = {
  artifacts_put: call => ({ success: true, validated: true, dry_run: true, mutation_performed: false, persisted: false, expected_cid: call.input.payload.cid }),
  run_inference_job: { success: true, dry_run: true, body_executed: false, mutation_performed: false },
};
async function until(predicate) { for (let count = 0; count < 100; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); } throw new Error('Cinema UI did not settle'); }
function fixture(t, results = {}) {
  const keys = ['window', 'document', 'localStorage', 'sessionStorage', 'CustomEvent', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, sessionStorage: window.sessionStorage, CustomEvent: window.CustomEvent, __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  const calls = []; const notices = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call'); const call = JSON.parse(options.body); calls.push(call);
    const selected = results[call.tool_id] || defaultResults[call.tool_id];
    const value = typeof selected === 'function' ? selected(call) : selected;
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      result: value, receipt: { receipt_id: 'actual-owner-receipt', event_dag_refs: ['actual-owner-event'] } }) };
  };
  const app = new CinemaApp(); app.showCinemaNotice = message => notices.push(message);
  const root = document.createElement('div'); document.body.append(root); app.createInterface(root);
  t.after(() => { window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const persist = root.querySelector('[data-cinema-workflow="load-project-media-cids"]');
  const status = root.querySelector('[data-cinema-workflow-status]');
  const confirm = async pending => {
    const before = calls.length; await until(() => root.querySelector('[data-gateway-confirm]')); assert.equal(calls.length, before);
    root.querySelector('[data-gateway-confirm]').click(); await pending;
  };
  return { app, root, calls, notices, persist, status, confirm };
}
test('Cinema starts without fabricated project/media CIDs, jobs, queue metrics, or receipts', t => {
  const f = fixture(t);
  assert.equal(f.app.currentProject, null); assert.equal(f.app.cinemaWorkflow.projectCid, null); assert.equal(f.app.renderQueue.length, 0);
  assert.equal(f.root.textContent.includes('bafycinema'), false); assert.equal(f.root.textContent.includes('receipt:cinema:'), false);
  const visibleContent = f.root.cloneNode(true); visibleContent.querySelectorAll('style').forEach(node => node.remove());
  assert.equal(visibleContent.textContent.includes('72%'), false); assert.match(f.root.textContent, /No project has been persisted/);
  assert.equal(f.persist.dataset.nativeToolId, 'artifacts_put');
  assert.equal(f.root.querySelectorAll('.ai-tool-btn[data-native-tool-id="run_inference_job"]').length, 4);
});
for (const transport of ['http', 'libp2p']) {
  test(`Cinema project preview confirms over ${transport}, binds exact actual project bytes, and assigns no CID`, async t => {
    const f = fixture(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    f.root.querySelector('[data-cinema-trim="out"]').value = '2'; f.app.commitTimeline(f.root, 2);
    await f.confirm(f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids', f.persist));
    assert.equal(f.calls.length, 1); const call = f.calls[0];
    assert.equal(call.binding_id, 'cinema.ipfs_kit_py.persist_artifact'); assert.equal(call.tool_id, 'artifacts_put'); assert.equal(call.transport, transport);
    assert.equal(call.input.policy.consent, 'granted'); assert.equal(call.input.policy.dry_run, true);
    const bytes = Uint8Array.from(Buffer.from(call.input.payload.bytes_base64, 'base64'));
    assert.equal(await contentCidForBytes(bytes), call.input.payload.cid); const track = JSON.parse(new TextDecoder().decode(bytes)).timeline.tracks[0]; assert.equal(track.kind, 'video'); assert.equal(track.out, 2);
    assert.equal(f.app.currentProject?.id || null, null); assert.equal(f.app.cinemaWorkflow.projectCid, null); assert.match(f.status.textContent, /no project or media was persisted/);
    assert.match(f.status.textContent, /actual-owner-receipt/);
  });
  test(`Cinema AI preview requires shared confirmation and actual declared model on ${transport}`, async t => {
    const f = fixture(t); globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    const button = f.root.querySelector('.ai-tool-btn');
    await f.confirm(f.app.runCinemaAIOperation('Actual requested analysis', button));
    const call = f.calls[0]; assert.equal(call.tool_id, 'run_inference_job'); assert.equal(call.transport, transport);
    assert.equal(call.input.payload.model, 'catalog-confirmed-model'); assert.match(call.input.payload.input, /Actual requested analysis/); assert.equal(call.input.payload.max_length, 256);
    assert.match(f.notices[0], /no video analysis or job was executed/); assert.equal(f.app.renderQueue.length, 0);
    assert.equal(button.disabled, false);
  });
}
test('Cinema actual native button handlers reach the trusted confirmation path', async t => {
  const f = fixture(t); f.persist.click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
  assert.equal(f.calls.length, 0); f.root.querySelector('[data-gateway-confirm]').click(); await until(() => f.status.textContent.includes('Project preview validated'));
  const button = f.root.querySelectorAll('.ai-tool-btn')[2]; button.click(); await until(() => f.root.querySelector('[data-gateway-confirm]'));
  assert.equal(f.calls.length, 1); f.root.querySelector('[data-gateway-confirm]').click(); await until(() => f.notices.length === 1);
  assert.equal(f.calls.length, 2); assert.match(f.calls[1].input.payload.input, /AI Upscaling/);
});
test('Cinema cancelled persistence and inference send zero owner calls', async t => {
  const f = fixture(t);
  const pending = f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids', f.persist);
  await until(() => f.root.querySelector('[data-gateway-cancel]')); f.root.querySelector('[data-gateway-cancel]').click(); await pending;
  const inference = f.app.runCinemaAIOperation('Review', f.root.querySelector('.ai-tool-btn'));
  await until(() => f.root.querySelector('[data-gateway-cancel]')); f.root.querySelector('[data-gateway-cancel]').click(); await inference;
  assert.equal(f.calls.length, 0); assert.equal(f.app.currentProject?.id || null, null); assert.match(f.status.textContent, /Cancelled/); assert.match(f.notices[0], /Cancelled/);
});
for (const tool of ['artifacts_put', 'run_inference_job']) {
  test(`Cinema surfaces structured ${tool} owner failures without fabricated success`, async t => {
    const f = fixture(t, { [tool]: { content: [{ type: 'json', json: { success: false, error: 'Actual owner failure' } }] } });
    await f.confirm(tool === 'artifacts_put' ? f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids', f.persist) : f.app.runCinemaAIOperation('Review', f.root.querySelector('.ai-tool-btn')));
    assert.match(tool === 'artifacts_put' ? f.status.textContent : f.notices[0], /Actual owner failure/);
    assert.equal(f.app.currentProject?.id || null, null); assert.equal(f.app.renderQueue.length, 0);
  });
}
test('Cinema persistence requires an actual verified acknowledgment for the exact sent CID', async t => {
  const f = fixture(t, { artifacts_put: call => ({ success: true, persisted: true, verified: true, cid: call.input.payload.cid }) });
  await f.confirm(f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids', f.persist));
  assert.equal(f.app.currentProject.id, f.calls[0].input.payload.cid); assert.equal(f.app.cinemaWorkflow.projectCid, f.app.currentProject.id);
  assert.match(f.root.querySelector('[data-cinema-project-cid]').textContent, /Project persisted/);
});
test('Cinema rejects forged preview CID and never turns a submitted job into completed analysis', async t => {
  const f = fixture(t, { artifacts_put: { success: true, dry_run: true, persisted: false, mutation_performed: false, expected_cid: 'forged', validated: true }, run_inference_job: { success: true, job_id: 'actual-owner-job' } });
  await f.confirm(f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids', f.persist)); assert.equal(f.app.currentProject?.id || null, null); assert.match(f.status.textContent, /did not verify the exact project CID/);
  await f.confirm(f.app.runCinemaAIOperation('Review', f.root.querySelector('.ai-tool-btn')));
  assert.match(f.notices[0], /actual-owner-job; completion has not been observed/);
});
test('unimplemented Cinema render/export/fallback actions remain visible and issue no substitute calls', async t => {
  const f = fixture(t);
  for (const action of ['verify-rights-metadata', 'submit-render-queue', 'simulate-failed-export', 'activate-playback-fallback', 'stabilize-timeline-controls']) await f.app.handleCinemaWorkflowAction(f.root, action);
  assert.equal(f.calls.length, 0); assert.equal(f.app.renderQueue.length, 0); assert.match(f.status.textContent, /Local timeline/);
});

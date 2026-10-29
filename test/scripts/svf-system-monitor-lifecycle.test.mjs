import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { Window } from 'happy-dom';

// Hermetic lifecycle regression; owner replies are explicitly authored fixtures.
const filename = process.env.SVF_MONITOR_SOURCE || new URL('../../web/js/apps/system-monitor.js', import.meta.url);
const source = fs.readFileSync(filename, 'utf8'), ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const declaration = ast.body.find(node => node.declaration?.id?.name === 'SystemMonitorApp').declaration;
const constants = ast.body.filter(node => node.type === 'VariableDeclaration').map(node => source.slice(node.start, node.end)).join('\n');
function reply() {
  const owner = 'ipfs_accelerate_py', tool = 'PrometheusMetrics.generate_metrics', correlation = 'authored-unit-correlation';
  const native_provenance = { schema: 'swissknife.native-accelerate-observation.v1', owner, correlation_id: correlation,
    sdk_class: 'ipfs_accelerate_py.hf_model_server.monitoring.metrics.PrometheusMetrics', sdk_method: 'generate_metrics',
    simulated: false, echo_fallback: false, external_provider_called: false };
  const data = { success: true, tool, utilization: 7.9, cpu_percent: 7.9, memory_percent: 49,
    gpu_utilization: null, metrics: '# authored fixture\n', timestamp: new Date().toISOString(), native_provenance };
  return { ok: true, owner, tool_id: tool, correlation_id: correlation, outcome: 'executed',
    receipt: { receipt_id: 'authored-unit-receipt', owner, tool_id: tool, correlation_id: correlation, outcome: 'executed' },
    result: { result: { content: [{ type: 'json', json: data }],
      receipt: { owner, tool, status: 'ok', native_provenance: { ...native_provenance } } } } };
}
function fixture(t, invoke = async () => reply()) {
  const window = new Window({ url: 'http://authored.invalid' }); t.after(() => window.happyDOM.abort());
  let next = 1; const timeouts = [], intervals = new Map(), calls = [];
  const App = vm.runInNewContext(`${constants};(${source.slice(declaration.start, declaration.end)})`, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage, console, Date,
    setTimeout(fn, delay) { timeouts.push({ fn, delay }); return next++; }, clearTimeout() {},
    setInterval(fn) { const id = next++; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); },
    invokeNativeTool: async (...args) => { calls.push(args); return invoke(...args); },
  });
  App.prototype.detectGPUModel = () => 'unmeasured in authored unit';
  async function mount() {
    const app = new App({}); await app.initialize(); const html = await app.render();
    const host = window.document.createElement('section'); host.className = 'window-app-content'; host.innerHTML = html;
    window.document.body.append(host);
    for (const task of timeouts.splice(0)) if (task.delay === 0) task.fn();
    return { app, host, container: host.querySelector('.system-monitor-container') };
  }
  const settle = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };
  return { window, calls, intervals, mount, settle };
}

test('closed instance interval cannot overwrite reopened measured state with old unavailable state', async t => {
  const f = fixture(t), first = await f.mount(); const oldId = first.app.updateInterval, oldTick = f.intervals.get(oldId);
  assert.ok(oldTick); first.host.remove();
  const current = await f.mount(); current.host.querySelector('#refresh-backend-telemetry').click(); await f.settle();
  assert.equal(current.app.backendTelemetry.state, 'ok');
  oldTick();
  assert.match(current.host.querySelector('#observation-stamp').textContent, /^measured /);
  assert.equal(current.host.querySelector('#accel-telemetry-state').textContent, 'ok');
  assert.equal(f.intervals.has(oldId), false, 'only disconnected instance timer must be cleared');
  assert.equal(f.intervals.has(current.app.updateInterval), true);
});

test('body replacement rebinds exact native action once while original toolbar refresh remains usable', async t => {
  const f = fixture(t), current = await f.mount();
  current.app.refreshContent(); current.app.setupContentEventHandlers(); current.app.setupContentEventHandlers();
  current.host.querySelector('#refresh-backend-telemetry').click(); await f.settle();
  assert.equal(f.calls.length, 1, 'rerendered body action must remain wired without duplicate dispatch');
  assert.equal(current.app.backendTelemetry.state, 'ok');
  const prior = current.app.telemetrySequence;
  current.host.querySelector('#refresh-btn').click();
  assert.equal(current.app.telemetrySequence, prior + 1, 'unchanged toolbar runs one local refresh');
  current.app.refreshContent(); current.host.querySelector('#refresh-backend-telemetry').click(); await f.settle();
  assert.equal(f.calls.length, 2);
  assert.equal(current.host.querySelector('#accel-telemetry-state').textContent, 'ok');
});

test('native reply arriving after close cannot repaint or qualify the newly opened instance', async t => {
  let finish; const f = fixture(t, () => new Promise(resolve => { finish = resolve; })); const old = await f.mount();
  old.host.querySelector('#refresh-backend-telemetry').click(); await f.settle(); assert.equal(f.calls.length, 1);
  old.host.remove(); const current = await f.mount(); finish(reply()); await f.settle();
  assert.equal(current.app.backendTelemetry.state, 'not-run'); assert.equal(current.app.observationStamp, 'unavailable');
  assert.equal(current.host.querySelector('#observation-stamp').textContent, 'unavailable');
  assert.equal(current.app.diagnosticHistory.length, 0);
});

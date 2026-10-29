import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { Window } from 'happy-dom';

// Authored owner/DOM fixtures only: no live backend, browser, or acceptance.
const filename = process.env.SVF_MONITOR_SOURCE || new URL('../../web/js/apps/system-monitor.js', import.meta.url);
const source = fs.readFileSync(filename, 'utf8'), ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const declaration = ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'SystemMonitorApp').declaration;
const owner = 'ipfs_accelerate_py', tool = 'PrometheusMetrics.generate_metrics', correlation = 'authored-unit-correlation';

function metricsEnvelope(utilization = 14.1) {
  const proof = { schema: 'swissknife.native-accelerate-observation.v1', owner,
    sdk_class: 'ipfs_accelerate_py.hf_model_server.monitoring.metrics.PrometheusMetrics', sdk_method: 'generate_metrics',
    simulated: false, echo_fallback: false, external_provider_called: false, correlation_id: correlation };
  const data = { success: true, tool, utilization, cpu_percent: utilization, memory_percent: 49.1,
    gpu_utilization: null, metrics: '# TYPE authored_fixture gauge\nauthored_fixture 1\n',
    timestamp: new Date().toISOString(), native_provenance: proof };
  const nativeReceipt = { owner, tool, status: 'ok', native_provenance: { ...proof } };
  return { ok: true, owner, tool_id: tool, outcome: 'executed', correlation_id: correlation,
    result: { result: { isError: false, content: [{ type: 'json', json: data }], receipt: nativeReceipt, result: data } },
    receipt: { receipt_id: 'authored-unit-gateway-receipt', owner, tool_id: tool, outcome: 'executed', correlation_id: correlation } };
}
function dataOf(envelope) { return envelope.result.result.content[0].json; }
function fixture(t, response) {
  const window = new Window({ url: 'http://authored.invalid' }); t.after(() => window.happyDOM.abort());
  const calls = [], records = [];
  window.document.body.innerHTML = '<section class="window" data-app-id="system-monitor"><div class="window-app-content"><button id="refresh-backend-telemetry">Refresh</button><div id="observation-stamp">unavailable</div></div></section>';
  const App = vm.runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
    document: window.document, console, Date,
    VDA_G041_RECEIPTS: { liveTelemetry: 'legacy-static-label' },
    invokeNativeTool: async (container, app, binding, options) => { calls.push({ container, app, binding, options }); return response; },
  });
  const app = Object.create(App.prototype);
  Object.assign(app, { backendTelemetry: { state: 'not-run', at: null }, telemetrySequence: 0, chartData: { cpu: [], memory: [], gpu: [], network: [], disk: [] },
    maxDataPoints: 60, observationStamp: 'unavailable', hasMeasuredSample: false, ownerUnavailable: false,
    recordDiagnosticSample(sample) { records.push(sample); }, persistRetainedHistory() {} });
  return { app, window, calls, records };
}

for (const cpu of [0, 14.1, 100]) test(`actual MCP content JSON accepts numeric ${cpu}% CPU with matching owner/receipt/correlation`, async t => {
  const response = metricsEnvelope(cpu), f = fixture(t, response);
  const value = await f.app.refreshBackendTelemetry(true);
  assert.equal(value.state, 'ok'); assert.equal(value.data.utilization, cpu); assert.equal(value.data.gpu_utilization, null);
  assert.equal(value.receiptId, response.receipt.receipt_id); assert.equal(value.correlationId, correlation);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].app, 'system-monitor');
  assert.equal(f.calls[0].binding, 'system-monitor.ipfs_accelerate_py.inspect_telemetry');
  assert.equal(f.calls[0].options.toolId, tool); assert.equal(f.calls[0].options.executionMode, 'execute');
  assert.equal(f.records.length, 1); assert.equal(f.records[0].cpu, cpu); assert.equal(f.records[0].gpu, null);
  assert.equal(f.records[0].receiptId, response.receipt.receipt_id); assert.equal(f.records[0].correlationId, correlation);
  assert.match(f.window.document.querySelector('#observation-stamp').textContent, /^measured /);
  await f.app.refreshBackendTelemetry(false); assert.equal(f.calls.length, 1, 'normal 30s cache must remain');
  await f.app.refreshBackendTelemetry(true); assert.equal(f.calls.length, 2, 'explicit refresh must perform a fresh owner read');
});

for (const [label, mutate] of [
  ['outer failed status despite numeric output', value => { value.ok = false; value.output = { utilization: 15 }; }],
  ['preview despite successful data', value => { value.outcome = 'preview'; }],
  ['outer error despite success flags', value => { value.error = 'actual error'; }],
  ['wrong owner', value => { value.owner = 'foreign-owner'; }],
  ['wrong exact tool', value => { value.tool_id = 'HealthChecker.check_detailed'; }],
  ['missing actual receipt', value => { delete value.receipt; }],
  ['wrong receipt correlation', value => { value.receipt.correlation_id = 'another-call'; }],
  ['native owner error', value => { value.result.result.isError = true; }],
  ['wrong native receipt owner', value => { value.result.result.receipt.owner = 'foreign-owner'; }],
  ['wrong SDK method', value => { dataOf(value).native_provenance.sdk_method = 'check_detailed'; }],
  ['simulated observation', value => { dataOf(value).native_provenance.simulated = true; }],
  ['mismatched SDK correlation', value => { dataOf(value).native_provenance.correlation_id = 'another-call'; }],
  ['string CPU percentage', value => { dataOf(value).utilization = '15'; }],
  ['negative CPU percentage', value => { dataOf(value).utilization = -1; }],
  ['out-of-range CPU percentage', value => { dataOf(value).utilization = 101; }],
  ['NaN CPU percentage', value => { dataOf(value).utilization = NaN; }],
  ['count without measured CPU', value => { delete dataOf(value).utilization; delete dataOf(value).cpu_percent; dataOf(value).count = 12; }],
  ['throughput without measured CPU', value => { delete dataOf(value).utilization; delete dataOf(value).cpu_percent; dataOf(value).throughput = 12; }],
  ['CPU fields disagree', value => { dataOf(value).cpu_percent = 99; }],
  ['string memory percentage', value => { dataOf(value).memory_percent = '49.1'; }],
  ['unknown GPU string', value => { dataOf(value).gpu_utilization = 'unknown'; }],
  ['invented GPU zero for unmeasured host probe', value => { dataOf(value).gpu_utilization = 0; }],
  ['stale timestamp', value => { dataOf(value).timestamp = '2000-01-01T00:00:00Z'; }],
  ['ambiguous JSON blocks', value => { value.result.result.content.push({ type: 'json', json: { utilization: 99 } }); }],
]) test(`${label} cannot append measured history or clear unavailable state`, async t => {
  const response = metricsEnvelope(); mutate(response); const f = fixture(t, response);
  const value = await f.app.refreshBackendTelemetry(true);
  assert.equal(value.state, 'error'); assert.equal(value.data, null); assert.equal(f.app.ownerUnavailable, true);
  assert.equal(f.app.observationStamp, 'unavailable'); assert.equal(f.app.hasMeasuredSample, false);
  assert.equal(f.records.length, 0); assert.equal(f.app.chartData.cpu.length, 0);
});

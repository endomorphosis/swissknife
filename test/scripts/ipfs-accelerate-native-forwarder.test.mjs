import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createNativeAccelerateForwarder, nativeAccelerateCatalog } = require('../../scripts/ipfs-accelerate-native-forwarder.cjs');
const tools = ['run_inference_job', 'list_models', 'job_status', 'hardware_profile'].map(name => ({ name, inputSchema: { type: 'object' } }));
function observationFixture(tool, mutate = value => value) {
  const health = tool === 'HealthChecker.check_detailed';
  const moduleName = health ? 'health' : 'metrics';
  const native_provenance = {
    schema: 'swissknife.native-accelerate-observation.v1', owner: 'ipfs_accelerate_py',
    simulated: false, echo_fallback: false, inference_executed: false, external_provider_called: false,
    sdk_class: `ipfs_accelerate_py.hf_model_server.monitoring.${moduleName}.${health ? 'HealthChecker' : 'PrometheusMetrics'}`,
    sdk_method: health ? 'check_detailed' : 'generate_metrics',
    sdk_source_path: `external/ipfs_accelerate/ipfs_accelerate_py/hf_model_server/monitoring/${moduleName}.py`,
    sdk_source_sha256: 'a'.repeat(64), observation_source_sha256: 'b'.repeat(64), service_source_sha256: 'c'.repeat(64),
    observation_pid: 123, service_pid: 100,
    scope: health ? 'sdk_liveness; model_loading_and_hardware_capacity_not_measured' : 'host_cpu_memory_and_observation_process',
  };
  const payload = { success: true, inference_executed: false, timestamp: new Date().toISOString(), native_provenance,
    ...(health ? { status: 'healthy', components: {}, uptime_seconds: 0.1 }
      : { utilization: 23.5, memory_percent: 40.1, metrics: 'authored unit exporter bytes, not execution evidence' }) };
  const result = { isError: false, content: [{ type: 'json', json: payload }],
    receipt: { owner: 'ipfs_accelerate_py', tool, status: 'ok', native_provenance } };
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    return Response.json({ jsonrpc: '2.0', id: request.id, result: mutate(structuredClone(result)) });
  };
  return createNativeAccelerateForwarder({ endpoint: 'http://127.0.0.1:18313/mcp', fetchImpl });
}

for (const tool of ['HealthChecker.check_detailed', 'PrometheusMetrics.generate_metrics']) {
  test(`real observation contract accepted separately from generation: ${tool}`, async () => {
    const value = await observationFixture(tool).execute(tool, {});
    assert.equal(value.result.inference_executed, false);
    assert.equal(value.result.native_provenance.schema, 'swissknife.native-accelerate-observation.v1');
  });
  for (const [name, mutate] of [
    ['wrong SDK class', value => { value.content[0].json.native_provenance.sdk_class = 'fake.Owner'; return value; }],
    ['wrong method', value => { value.content[0].json.native_provenance.sdk_method = 'made_up'; return value; }],
    ['wrong source path', value => { value.content[0].json.native_provenance.sdk_source_path = '/tmp/fake.py'; return value; }],
    ['missing source identity', value => { delete value.content[0].json.native_provenance.observation_source_sha256; return value; }],
    ['claimed inference', value => { value.content[0].json.inference_executed = true; return value; }],
    ['external provider', value => { value.content[0].json.native_provenance.external_provider_called = true; return value; }],
    ['invalid timestamp', value => { value.content[0].json.timestamp = 'not-a-date'; return value; }],
    ['unknown observation scope', value => { value.content[0].json.native_provenance.scope = 'everything'; return value; }],
    ['missing process', value => { value.content[0].json.native_provenance.observation_pid = 0; return value; }],
  ]) {
    test(`observation refuses ${name}: ${tool}`, async () => {
      await assert.rejects(observationFixture(tool, mutate).execute(tool, {}));
    });
  }
}
for (const [name, mutate] of [
  ['out-of-range utilization', value => { value.content[0].json.utilization = 101; return value; }],
  ['unmeasured memory', value => { value.content[0].json.memory_percent = null; return value; }],
  ['empty exporter', value => { value.content[0].json.metrics = ''; return value; }],
]) {
  test(`metrics refuses ${name}`, async () => {
    await assert.rejects(observationFixture('PrometheusMetrics.generate_metrics', mutate).execute('PrometheusMetrics.generate_metrics', {}));
  });
}
function fixture(change = value => value) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith('/mcp/health')) return Response.json({ status: 'ok', simulated: false, echo_fallback: false });
    const request = JSON.parse(options.body); calls.push(request);
    if (request.method === 'tools/list') return Response.json({ jsonrpc: '2.0', id: request.id, result: { tools } });
    const native_provenance = { schema: 'swissknife.native-accelerate-execution.v1', owner: 'ipfs_accelerate_py',
      simulated: false, echo_fallback: false, sdk_class: 'ipfs_accelerate_py.inference_backend_manager.InferenceBackendManager',
      sdk_method: 'execute_task', sdk_source_sha256: 'a'.repeat(64), generated_token_count: 4 };
    const payload = { success: true, output: 'authored unit native output', native_provenance };
    const result = { isError: false, content: [{ type: 'json', json: payload }],
      receipt: { owner: 'ipfs_accelerate_py', tool: request.params.name, status: 'ok', native_provenance } };
    return Response.json(change({ jsonrpc: '2.0', id: request.id, result }));
  };
  return { calls, forwarder: createNativeAccelerateForwarder({ endpoint: 'http://127.0.0.1:18313/mcp', fetchImpl }) };
}
test('strict native forwarder preserves actual payload, receipt and transport alias', async () => {
  const { calls, forwarder } = fixture();
  const result = await forwarder.execute('run_inference_job', { model: 'gpt2', input: 'unit' });
  assert.deepEqual(result.result, result.content[0].json);
  assert.equal(result.receipt.native_provenance.generated_token_count, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.arguments.input, 'unit');
});
test('catalog advertises only actual native tools plus implemented Node controls', async () => {
  const { forwarder } = fixture();
  const actual = await forwarder.listTools();
  const catalog = nativeAccelerateCatalog(actual);
  assert.equal(catalog.length, 9);
  assert.equal(new Set(catalog.map(t => t.name)).size, 9);
  assert.ok(!catalog.some(t => ['submit_task', 'cancel_task', 'get_task', 'detect_hardware'].includes(t.name)));
  assert.equal((await forwarder.health()).status, 'ok');
});
for (const [name, change] of [
  ['wrong RPC identity', value => ({ ...value, id: 'wrong' })],
  ['missing native provenance', value => { delete value.result.content[0].json.native_provenance; return value; }],
  ['unacknowledged execution', value => { value.result.content[0].json.success = false; return value; }],
  ['mismatched native receipt', value => { value.result.receipt.tool = 'list_models'; return value; }],
  ['no actual generated tokens', value => { value.result.content[0].json.native_provenance.generated_token_count = 0; return value; }],
  ['generation outside qualified bound', value => { value.result.content[0].json.native_provenance.generated_token_count = 5; return value; }],
  ['simulated output', value => { value.result.content[0].json.native_provenance.simulated = true; return value; }],
]) test(`reject ${name} without any local fallback`, async () => {
  const { forwarder, calls } = fixture(change);
  await assert.rejects(forwarder.execute('run_inference_job', { model: 'gpt2', input: 'unit' }));
  assert.equal(calls.length, 1);
});
test('actual native errors remain errors with their precise diagnostic', async () => {
  const { forwarder } = fixture(value => ({ ...value, result: { isError: true,
    content: [{ type: 'json', json: { error: 'Unsupported model' } }] } }));
  const value = await forwarder.execute('run_inference_job', { model: 'wrong', input: 'unit' });
  assert.equal(value.isError, true);
  assert.equal(value.content[0].json.error, 'Unsupported model');
  assert.equal(value.result, undefined);
});
test('native RPC failures preserve their actionable reason', async () => {
  const { forwarder } = fixture(value => ({ jsonrpc: '2.0', id: value.id,
    error: { code: -32000, message: 'Exactly one explicit model is required' } }));
  await assert.rejects(forwarder.execute('run_inference_job', {}), /explicit model/);
});
test('unsupported tool cannot fall through to legacy Python or remote aliases', async () => {
  const { forwarder, calls } = fixture();
  await assert.rejects(forwarder.execute('WorkflowCoordinator.submit_task', {}), /unsupported_tool/);
  assert.equal(calls.length, 0);
});
test('native endpoint requires exact credential-free loopback MCP origin', () => {
  for (const endpoint of ['http://example.com/mcp', 'https://127.0.0.1:18313/mcp',
    'http://user:secret@127.0.0.1:18313/mcp', 'http://127.0.0.1:18313/mcp?token=x']) {
    assert.throws(() => createNativeAccelerateForwarder({ endpoint }));
  }
});
test('oversized response fails before parsing or accepting provenance', async () => {
  const forwarder = createNativeAccelerateForwarder({ endpoint: 'http://127.0.0.1:18313/mcp',
    fetchImpl: async () => new Response('x'.repeat(262145)) });
  await assert.rejects(forwarder.execute('run_inference_job', {}), /response_limit/);
});

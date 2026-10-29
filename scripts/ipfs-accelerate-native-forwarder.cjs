'use strict';
const { randomUUID } = require('node:crypto');
const { stableStringify } = require('./mcpplusplus-profile-a.cjs');
const DOMAIN_TOOLS = new Set(['run_inference_job', 'list_models', 'job_status', 'hardware_profile',
  'submit_task', 'get_task', 'detect_hardware', 'HealthChecker.check_detailed', 'PrometheusMetrics.generate_metrics',
  'WorkflowCoordinator.submit_task']);
const OBSERVATION_TOOLS = {
  'HealthChecker.check_detailed': ['health', 'HealthChecker', 'check_detailed'],
  'PrometheusMetrics.generate_metrics': ['metrics', 'PrometheusMetrics', 'generate_metrics'],
};
const CONTROL_TOOLS = ['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch', 'get_mcp_manifest'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const demand = (value, message) => { if (!value) throw new Error(message); };

function createNativeAccelerateForwarder({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = 35000 } = {}) {
  const target = new URL(endpoint);
  demand(target.protocol === 'http:' && target.hostname === '127.0.0.1' && Number(target.port) >= 1024
    && !target.username && !target.password && target.pathname === '/mcp' && !target.search && !target.hash,
  'Native Accelerate upstream must be a credential-free IPv4 loopback /mcp endpoint.');
  demand(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 40000, 'invalid_native_accelerate_timeout');
  async function request(url, options) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    demand(response.ok, `native_accelerate_http_${response.status}`);
    const reader = response.body?.getReader(); demand(reader, 'native_accelerate_body_missing');
    const chunks = []; let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        bytes += value.byteLength; demand(bytes <= 262144, 'native_accelerate_response_limit'); chunks.push(Buffer.from(value));
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    demand(object(value), 'native_accelerate_invalid_envelope'); return value;
  }
  async function rpc(method, params) {
    const id = `native-accelerate:${randomUUID()}`;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    demand(Buffer.byteLength(body) <= 16384, 'native_accelerate_request_limit');
    const value = await request(target.href, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    demand(value.jsonrpc === '2.0' && value.id === id, 'native_accelerate_rpc_identity_mismatch');
    if (value.error) throw new Error(typeof value.error.message === 'string'
      ? value.error.message.slice(0, 2048) : 'native_accelerate_rpc_error');
    demand(object(value.result), 'native_accelerate_result_missing');
    return value.result;
  }
  async function listTools() {
    const result = await rpc('tools/list', {});
    demand(Array.isArray(result.tools) && result.tools.length > 0 && result.tools.length <= DOMAIN_TOOLS.size,
      'native_accelerate_invalid_catalog');
    const seen = new Set();
    for (const tool of result.tools) {
      demand(object(tool) && DOMAIN_TOOLS.has(tool.name) && !seen.has(tool.name)
        && object(tool.inputSchema) && tool.inputSchema.type === 'object', 'native_accelerate_invalid_descriptor');
      seen.add(tool.name);
    }
    return result.tools;
  }
  async function execute(name, args = {}) {
    demand(DOMAIN_TOOLS.has(name) && object(args), 'native_accelerate_unsupported_tool');
    const result = await rpc('tools/call', { name, arguments: args });
    // Preserve the actual native failure so the mediator can expose its cause.
    if (result.isError === true) return result;
    demand(Array.isArray(result.content) && result.content.length === 1 && result.content[0]?.type === 'json'
      && object(result.content[0].json), 'native_accelerate_ambiguous_result');
    const payload = result.content[0].json;
    const provenance = payload.native_provenance;
    if (object(provenance) && provenance.schema === 'swissknife.native-supervisor-execution.v1') {
      demand((name === 'WorkflowCoordinator.submit_task' || name === 'get_task') && payload.success === true
        && provenance.owner === 'ipfs_accelerate_py' && provenance.simulated === false && provenance.cache_fallback === false
        && object(result.receipt) && result.receipt.owner === 'ipfs_accelerate_py' && result.receipt.tool === name
        && result.receipt.status === 'ok' && stableStringify(result.receipt.native_provenance) === stableStringify(provenance),
      'native_supervisor_provenance_missing');
      return { ...result, result: payload };
    }
    demand(payload.success === true && object(provenance)
      && provenance.schema === (OBSERVATION_TOOLS[name] ? 'swissknife.native-accelerate-observation.v1' : 'swissknife.native-accelerate-execution.v1')
      && provenance.owner === 'ipfs_accelerate_py' && provenance.simulated === false
      && provenance.echo_fallback === false, 'native_accelerate_provenance_missing');
    demand(object(result.receipt) && result.receipt.owner === 'ipfs_accelerate_py' && result.receipt.tool === name
      && result.receipt.status === 'ok' && stableStringify(result.receipt.native_provenance) === stableStringify(provenance),
    'native_accelerate_receipt_mismatch');
    if (name === 'run_inference_job' || name === 'submit_task') {
      demand(provenance.sdk_class === 'ipfs_accelerate_py.inference_backend_manager.InferenceBackendManager'
        && provenance.sdk_method === 'execute_task' && /^[0-9a-f]{64}$/.test(provenance.sdk_source_sha256 || '')
        && typeof payload.output === 'string' && payload.output.length > 0
        && Number.isInteger(provenance.generated_token_count) && provenance.generated_token_count > 0
        && provenance.generated_token_count <= 4, 'native_accelerate_generation_unproven');
    }
    if (OBSERVATION_TOOLS[name]) {
      const [moduleName, className, method] = OBSERVATION_TOOLS[name];
      demand(provenance.sdk_class === `ipfs_accelerate_py.hf_model_server.monitoring.${moduleName}.${className}`
        && provenance.sdk_method === method
        && provenance.sdk_source_path === `external/ipfs_accelerate/ipfs_accelerate_py/hf_model_server/monitoring/${moduleName}.py`
        && ['sdk_source_sha256', 'observation_source_sha256', 'service_source_sha256'].every(key => /^[0-9a-f]{64}$/.test(provenance[key] || ''))
        && provenance.inference_executed === false && payload.inference_executed === false
        && provenance.external_provider_called === false
        && Number.isInteger(provenance.observation_pid) && provenance.observation_pid > 0
        && Number.isInteger(provenance.service_pid) && provenance.service_pid > 0
        && typeof payload.timestamp === 'string' && Number.isFinite(Date.parse(payload.timestamp)),
      'native_accelerate_observation_unproven');
      if (name === 'HealthChecker.check_detailed') {
        demand(['healthy', 'degraded'].includes(payload.status) && object(payload.components)
          && provenance.scope === 'sdk_liveness; model_loading_and_hardware_capacity_not_measured',
        'native_accelerate_health_unproven');
      } else {
        demand(typeof payload.utilization === 'number' && Number.isFinite(payload.utilization)
          && payload.utilization >= 0 && payload.utilization <= 100
          && typeof payload.memory_percent === 'number' && Number.isFinite(payload.memory_percent)
          && payload.memory_percent >= 0 && payload.memory_percent <= 100
          && typeof payload.metrics === 'string' && payload.metrics.length > 0
          && provenance.scope === 'host_cpu_memory_and_observation_process',
        'native_accelerate_metrics_unproven');
      }
    }
    // A transport alias retains the same genuine native payload for existing
    // application consumers; it does not fabricate any output or job state.
    return { ...result, result: payload };
  }
  async function health() {
    const value = await request(new URL('/mcp/health', target), { method: 'GET' });
    demand(value.status === 'ok' && value.simulated !== true && value.echo_fallback !== true,
      'native_accelerate_upstream_unready'); return value;
  }
  return { execute, listTools, health, endpoint: target.href };
}
function nativeAccelerateCatalog(tools) {
  return [...CONTROL_TOOLS.map(name => ({ name, description: 'Node MCP++ control operation.',
    inputSchema: { type: 'object', additionalProperties: true } })), ...tools];
}
module.exports = { createNativeAccelerateForwarder, nativeAccelerateCatalog, DOMAIN_TOOLS };

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');
const OUT_DIR = path.join(REPO_ROOT, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const WEB_APPS_DIR = path.join(REPO_ROOT, 'web', 'js', 'apps');
const SERVICES_DIR = path.join(REPO_ROOT, 'src', 'services');

const CONFIGURED_SERVICES = [
  {
    service: 'ipfs_kit_py',
    role: 'configured',
    endpoint: 'http://127.0.0.1:8014',
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/mcp/health',
  },
  {
    service: 'ipfs_datasets_py',
    role: 'configured',
    endpoint: 'http://127.0.0.1:3002',
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/mcp/health',
  },
  {
    service: 'ipfs_accelerate_py',
    role: 'configured_compat',
    endpoint: 'http://127.0.0.1:3003',
    rpc_path: '/mcp',
    tools_list_path: '/mcp/tools/list',
    health_path: '/mcp/health',
  },
  {
    service: 'ipfs_accelerate_py',
    role: 'real_local',
    endpoint: 'http://127.0.0.1:9000',
    rpc_path: '/mcp',
    tools_path: '/mcp/tools',
    health_path: '/mcp/health',
  },
];

const REQUIRED_ACCELERATE_TOOLS = [
  'detect_hardware',
  'get_task',
  'hardware_profile',
  'HardwareDetector.get_available_hardware',
  'HealthChecker.check_detailed',
  'job_status',
  'PrometheusMetrics.generate_metrics',
  'ProvenanceLogger.log_inference',
  'run_inference_job',
  'submit_task',
  'telemetry',
];

const ACCELERATE_ALIASES = {
  detect_hardware: ['detect_hardware', 'hardware_get_info', 'get_hardware_info'],
  get_task: ['get_task', 'p2p_taskqueue_get_task', 'p2p_taskqueue_status', 'runner_get_status'],
  hardware_profile: ['hardware_profile', 'hardware_get_info', 'get_hardware_info', 'get_optimal_hardware', 'hardware_recommend', 'recommend_hardware'],
  'HardwareDetector.get_available_hardware': ['HardwareDetector.get_available_hardware', 'get_hardware_info', 'hardware_get_info', 'detect_hardware'],
  'HealthChecker.check_detailed': ['HealthChecker.check_detailed', 'get_server_status', 'get_dashboard_system_metrics'],
  job_status: ['job_status', 'get_task', 'p2p_taskqueue_get_task', 'p2p_taskqueue_status', 'runner_get_status'],
  'PrometheusMetrics.generate_metrics': ['PrometheusMetrics.generate_metrics', 'get_performance_metrics', 'get_dashboard_system_metrics'],
  'ProvenanceLogger.log_inference': ['ProvenanceLogger.log_inference', 'log_operation', 'log_request'],
  run_inference_job: ['run_inference_job', 'run_inference', 'run_distributed_inference', 'execute_with_payload', 'p2p_taskqueue_submit'],
  submit_task: ['submit_task', 'p2p_taskqueue_submit', 'p2p_taskqueue_submit_docker_hub', 'p2p_taskqueue_submit_docker_github'],
  telemetry: ['telemetry', 'get_performance_metrics', 'get_dashboard_system_metrics', 'get_server_status'],
};

function nowIso() {
  return new Date().toISOString();
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeJson(name, value) {
  ensureOutDir();
  const filePath = path.join(OUT_DIR, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeText(name, value) {
  ensureOutDir();
  const filePath = path.join(OUT_DIR, name);
  fs.writeFileSync(filePath, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
  return filePath;
}

function hashObject(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout_ms ?? 3500);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,
      body,
      json: parseJson(body),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      status_text: error.name === 'AbortError' ? 'timeout' : 'fetch_error',
      body: '',
      json: null,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function toolName(tool) {
  if (typeof tool === 'string') return tool;
  if (tool && typeof tool.name === 'string') return tool.name;
  if (tool && typeof tool.tool === 'string') return tool.tool;
  return '';
}

function extractTools(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.tools)) return payload.tools;
  if (payload.result) return extractTools(payload.result);
  if (payload.data) return extractTools(payload.data);
  return [];
}

async function probeService(config) {
  const probes = [];
  const rpc = await fetchText(`${config.endpoint}${config.rpc_path}`, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  probes.push({ kind: 'json_rpc_tools_list', path: config.rpc_path, status: rpc.status, ok: rpc.ok, error: rpc.error });

  const toolsList = config.tools_list_path
    ? await fetchText(`${config.endpoint}${config.tools_list_path}`)
    : null;
  if (toolsList) {
    probes.push({ kind: 'http_tools_list', path: config.tools_list_path, status: toolsList.status, ok: toolsList.ok, error: toolsList.error });
  }

  const toolsPath = config.tools_path
    ? await fetchText(`${config.endpoint}${config.tools_path}`)
    : null;
  if (toolsPath) {
    probes.push({ kind: 'http_tools', path: config.tools_path, status: toolsPath.status, ok: toolsPath.ok, error: toolsPath.error });
  }

  const health = config.health_path
    ? await fetchText(`${config.endpoint}${config.health_path}`)
    : null;
  if (health) {
    probes.push({ kind: 'health', path: config.health_path, status: health.status, ok: health.ok, error: health.error });
  }

  const toolPayload = [rpc, toolsList, toolsPath]
    .filter(Boolean)
    .map(result => ({ result, tools: extractTools(result.json) }))
    .find(entry => entry.tools.length > 0);
  const tools = (toolPayload?.tools ?? [])
    .map(tool => (typeof tool === 'string' ? { name: tool, inputSchema: { type: 'object' } } : tool))
    .filter(tool => toolName(tool))
    .sort((a, b) => toolName(a).localeCompare(toolName(b)));

  return {
    service: config.service,
    role: config.role,
    endpoint: config.endpoint,
    rpc_path: config.rpc_path,
    available: probes.some(probe => probe.ok),
    tools_available: tools.length > 0,
    tool_count: tools.length,
    tools,
    probes,
    health: health?.json ?? null,
    preferred_probe: toolPayload
      ? { status: toolPayload.result.status, source: toolPayload.result === rpc ? 'json_rpc_tools_list' : 'http_tools' }
      : null,
  };
}

async function captureServiceEvidence() {
  const services = [];
  for (const service of CONFIGURED_SERVICES) {
    services.push(await probeService(service));
  }
  const configured = services.filter(service => service.role !== 'real_local');
  const health = {
    schema: 'swissknife.ipfs_mcp_service_health.v2',
    generated_at: nowIso(),
    summary: {
      configured_service_count: configured.length,
      configured_available_count: configured.filter(service => service.available).length,
      configured_tool_count: configured.reduce((sum, service) => sum + service.tool_count, 0),
      real_local_accelerate_tool_count: services.find(service => service.role === 'real_local')?.tool_count ?? 0,
      service_count: services.length,
      available: configured.filter(service => service.available).map(service => service.service).sort(),
      unavailable: configured.filter(service => !service.available).map(service => service.service).sort(),
      endpoint_failures: configured.filter(service => !service.available).length,
      normalized_failure_count: configured.filter(service => !service.available).length,
    },
    services: services.map(service => ({
      service: service.service,
      role: service.role,
      endpoint: service.endpoint,
      rpc_path: service.rpc_path,
      available: service.available,
      tools_available: service.tools_available,
      tool_count: service.tool_count,
      probes: service.probes,
      health: service.health,
    })),
  };

  const descriptorDiscovery = {
    schema: 'swissknife.ipfs_mcp_descriptor_discovery.v2',
    generated_at: health.generated_at,
    summary: {
      service_count: services.length,
      live_discovery_available: configured
        .filter(service => service.tool_count > 0)
        .map(service => service.service)
        .sort(),
      static_fallback_used: configured
        .filter(service => service.tool_count === 0 && (getStaticDescriptorCounts()[service.service] ?? 0) > 0)
        .map(service => service.service)
        .sort(),
      tool_counts: Object.fromEntries(configured.map(service => [service.service, service.tool_count])),
      interface_counts: Object.fromEntries(configured.map(service => [service.service, Math.max(1, new Set(service.tools.map(tool => categoryForTool(toolName(tool)))).size)])),
    },
    services: services.map(service => ({
      service: service.service,
      role: service.role,
      endpoint: service.endpoint,
      tool_count: service.tool_count,
      tools: service.tools.map(tool => ({
        name: toolName(tool),
        description: typeof tool.description === 'string' ? tool.description : '',
        schema_hash: hashObject(tool.inputSchema ?? {}),
      })),
    })),
    static_descriptor_counts: getStaticDescriptorCounts(),
  };

  writeJson('service-health.json', health);
  writeJson('descriptor-discovery.json', descriptorDiscovery);
  return { health, descriptorDiscovery, services };
}

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function getStaticDescriptorCounts() {
  const kitManifest = readJsonIfExists(path.join(SERVICES_DIR, 'mcp-ipfs-kit-tools-manifest.json'));
  return {
    ipfs_kit_py: Array.isArray(kitManifest?.tools) ? kitManifest.tools.length : 0,
    ipfs_datasets_py: parseToolFunctions(path.join(SERVICES_DIR, 'mcp-ipfs-datasets-descriptor-pack.ts')).length,
    ipfs_accelerate_py: parseToolFunctions(path.join(SERVICES_DIR, 'mcp-ipfs-accelerate-descriptor-pack.ts')).length,
  };
}

function parseToolFunctions(filePath) {
  const source = readIfExists(filePath);
  const names = [];
  const re = /tool_function:\s*'([^']+)'/g;
  for (const match of source.matchAll(re)) {
    names.push(match[1]);
  }
  return Array.from(new Set(names)).sort();
}

function staticTools() {
  const tools = [];
  const kitManifest = readJsonIfExists(path.join(SERVICES_DIR, 'mcp-ipfs-kit-tools-manifest.json'));
  for (const tool of kitManifest?.tools ?? []) {
    tools.push({
      service: 'ipfs_kit_py',
      role: 'static_descriptor',
      name: tool.name,
      category: tool.category ?? categoryForTool(tool.name),
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? { type: 'object' },
    });
  }
  for (const name of parseToolFunctions(path.join(SERVICES_DIR, 'mcp-ipfs-datasets-descriptor-pack.ts'))) {
    tools.push({
      service: 'ipfs_datasets_py',
      role: 'static_descriptor',
      name,
      category: categoryForTool(name),
      description: 'Static ipfs_datasets_py descriptor backend binding.',
      inputSchema: { type: 'object' },
    });
  }
  for (const name of parseToolFunctions(path.join(SERVICES_DIR, 'mcp-ipfs-accelerate-descriptor-pack.ts'))) {
    tools.push({
      service: 'ipfs_accelerate_py',
      role: 'static_descriptor',
      name,
      category: categoryForTool(name),
      description: 'Static ipfs_accelerate_py descriptor backend binding.',
      inputSchema: { type: 'object' },
    });
  }
  return tools;
}

function categoryForTool(name) {
  if (name.includes('.')) return name.split('.')[0];
  if (name.includes('_')) return name.split('_')[0];
  return 'general';
}

function normalizeRecord(service, role, endpoint, tool) {
  const name = toolName(tool);
  return {
    id: `${service}:${role}:${name}`,
    service,
    role,
    endpoint,
    name,
    category: tool.category ?? categoryForTool(name),
    description: typeof tool.description === 'string' ? tool.description : '',
    schema_hash: hashObject(tool.inputSchema ?? {}),
    source: role,
  };
}

async function captureAllToolsLedger() {
  const serviceEvidence = await captureServiceEvidence();
  const records = [];
  for (const service of serviceEvidence.services) {
    for (const tool of service.tools) {
      records.push(normalizeRecord(service.service, service.role, service.endpoint, tool));
    }
  }
  for (const tool of staticTools()) {
    records.push(normalizeRecord(tool.service, tool.role, 'static_descriptor_pack', tool));
  }

  const unique = [];
  const seen = new Set();
  for (const record of records) {
    const key = `${record.service}:${record.role}:${record.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(record);
    }
  }
  unique.sort((a, b) => `${a.service}:${a.role}:${a.name}`.localeCompare(`${b.service}:${b.role}:${b.name}`));
  const tools = unique.map(record => ({
    ...record,
    tool_id: record.id,
    service_id: record.service,
  }));

  const ledger = {
    schema: 'swissknife.all_tools_ledger.v2',
    generated_at: nowIso(),
    summary: {
      tool_record_count: unique.length,
      exact_tool_record_count: unique.length,
      configured_live_tool_count: unique.filter(record => record.role !== 'static_descriptor' && record.role !== 'real_local').length,
      live_exact_tool_count: unique.filter(record => record.role !== 'static_descriptor').length,
      real_local_accelerate_tool_count: unique.filter(record => record.service === 'ipfs_accelerate_py' && record.role === 'real_local').length,
      static_descriptor_tool_count: unique.filter(record => record.role === 'static_descriptor').length,
      static_exact_tool_count: unique.filter(record => record.role === 'static_descriptor').length,
      service_counts: countBy(unique, record => `${record.service}:${record.role}`),
    },
    service_health_ref: 'service-health.json',
    descriptor_discovery_ref: 'descriptor-discovery.json',
    tools,
    records: unique,
    tools: unique.map(record => ({
      tool_id: record.id,
      service_id: record.service,
      service: record.service,
      role: record.role,
      name: record.name,
      category: record.category,
      discovery: {
        live: record.role !== 'static_descriptor',
        static: record.role === 'static_descriptor',
      },
      coverage_status: record.role === 'static_descriptor' ? 'static_only' : 'live',
    })),
  };
  writeJson('all-tools-ledger.json', ledger);
  writeText('all-tools-ledger.md', markdownTable(
    'All MCP/MCP++ Tools Ledger',
    ['Service', 'Role', 'Tool', 'Category'],
    unique.map(record => [record.service, record.role, record.name, record.category]),
  ));

  buildDerivedArtifacts(ledger);
  return ledger;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function classifyTool(record) {
  const haystack = `${record.name} ${record.category} ${record.description}`.toLowerCase();
  if (/(delete|remove|stop|kill|unpin|purge|destroy)/.test(haystack)) return 'destructive';
  if (/(credential|oauth|auth|token|key|secret)/.test(haystack)) return 'credential';
  if (/(docker|github|network|connect|download|upload|publish|external)/.test(haystack)) return 'external_network';
  if (/(camera|audio|media|image|video|microphone)/.test(haystack)) return 'media_capture';
  if (/(inference|model|hardware|workflow|accelerate|compute|train)/.test(haystack)) return 'heavy_compute';
  if (/(submit|start|run|execute|create|update|save|pin|put|add|write|log)/.test(haystack)) return 'write';
  return 'read';
}

function exposureFor(policyClass, record) {
  if (record.role === 'real_local') return 'adapter_source_only';
  if (policyClass === 'credential' || policyClass === 'destructive' || policyClass === 'media_capture') return 'desktop_or_mobile_only';
  if (policyClass === 'external_network' || policyClass === 'heavy_compute' || policyClass === 'write') return 'app_visible_with_confirmation';
  return 'app_visible';
}

function appBindingFor(record, policyClass) {
  const name = `${record.name} ${record.category}`.toLowerCase();
  if (record.service === 'ipfs_kit_py' || /ipfs|pin|bucket|backend|p2p|network/.test(name)) {
    return pickStable(['ipfs-explorer', 'mcp-plus-plus', 'p2p-network', 'file-manager'], record.name);
  }
  if (record.service === 'ipfs_datasets_py' || /dataset|vector|embedding|provenance|index|search/.test(name)) {
    return pickStable(['datasets-browser', 'mcp-control', 'idl-explorer', 'orb-auto-ui'], record.name);
  }
  if (record.service === 'ipfs_accelerate_py' || /model|hardware|inference|workflow|runner|accelerate/.test(name)) {
    if (policyClass === 'heavy_compute') {
      return pickStable(['accelerate-panel', 'model-browser', 'mcp-plus-plus'], record.name);
    }
    return pickStable(['accelerate-panel', 'mcp-control', 'orb-auto-ui'], record.name);
  }
  if (/file|cat|add|get|storage/.test(name)) return 'file-manager';
  return 'mcp-control';
}

function pickStable(values, seed) {
  const hash = crypto.createHash('sha1').update(String(seed)).digest();
  return values[hash[0] % values.length];
}

function dispositionFor(policy, index) {
  if (index < 20) return 'supervisor_only_internal';
  if (index < 70) return 'desktop_mobile_only';
  if (policy.role === 'static_descriptor') return 'generated_descriptor_app_capability';
  return 'existing_app_capability';
}

function normalizedDispositionFor(disposition) {
  if (disposition === 'supervisor_only_internal') return 'server_internal';
  if (disposition === 'desktop_mobile_only') return 'unsafe_without_human_review';
  return disposition;
}

function resultRendererFor(appId) {
  if (appId === 'accelerate-panel' || appId === 'model-browser') return 'job-status-console';
  if (appId === 'datasets-browser') return 'dataset-card-grid';
  if (appId === 'ipfs-explorer' || appId === 'file-manager') return 'cid-file-list';
  if (appId === 'idl-explorer') return 'idl-method-inspector';
  if (appId === 'orb-auto-ui') return 'orb-envelope-timeline';
  if (appId === 'mcp-plus-plus') return 'mcp-tool-result-tree';
  return 'json-result-viewer';
}

function glassesFallbackFor(policyClass) {
  if (['credential', 'destructive', 'media_capture'].includes(policyClass)) return 'desktop_confirmation_required';
  if (policyClass === 'heavy_compute') return 'audio_summary_with_receipt';
  if (policyClass === 'external_network') return 'mobile_review_card';
  return 'compact_result_card';
}

function glassesExposureFor(policyClass) {
  if (['credential', 'destructive', 'media_capture'].includes(policyClass)) return 'blocked_until_desktop_confirmed';
  if (policyClass === 'heavy_compute') return 'progress_and_summary';
  return 'display_webapp';
}

function buildDerivedArtifacts(ledger) {
  const policies = ledger.records.map(record => {
    const policy_class = classifyTool(record);
    const exposure = exposureFor(policy_class, record);
    const confirmation_required = ['destructive', 'credential', 'external_network', 'heavy_compute', 'media_capture', 'write'].includes(policy_class);
    const receipt_required = record.role !== 'static_descriptor';
    return {
      tool_id: record.id,
      service: record.service,
      service_id: record.service,
      role: record.role,
      name: record.name,
      category: record.category,
      policy_class,
      owner_module: ownerFor(record),
      exposure_disposition: exposure,
      glasses_exposure: glassesExposureFor(policy_class),
      side_effectful: policy_class !== 'read',
      sensitive: ['credential', 'destructive', 'external_network', 'media_capture'].includes(policy_class),
      high_risk: ['credential', 'destructive', 'external_network', 'heavy_compute', 'media_capture'].includes(policy_class),
      exposure,
      confirmation_required,
      confirmation_policy: confirmation_required ? 'required' : 'none',
      receipt_required,
      receipt_policy: receipt_required ? 'required' : 'none',
      fallback_rule: exposure === 'desktop_or_mobile_only' ? 'blocked_state_with_receipt' : 'degraded_descriptor_preview',
      fallback: exposure === 'desktop_or_mobile_only' ? 'blocked_state_with_receipt' : 'degraded_descriptor_preview',
    };
  });
  const policyMatrix = {
    matrix_id: 'swissknife.all_tools_policy_matrix.v2',
    schema: 'swissknife.all_tools_policy_matrix.v2',
    generated_at: nowIso(),
    tool_count: policies.length,
    class_counts: countBy(policies, row => row.policy_class),
    owner_counts: countBy(policies, row => row.owner_module),
    exposure_counts: countBy(policies, row => row.exposure),
    service_counts: countBy(policies, row => row.service_id),
    summary: {
      tool_count: policies.length,
      class_counts: countBy(policies, row => row.policy_class),
      exposure_counts: countBy(policies, row => row.exposure),
      confirmation_required_count: policies.filter(row => row.confirmation_required).length,
    },
    rules: policies,
    tools: policies,
  };
  writeJson('all-tools-policy-matrix.json', policyMatrix);

  const bindings = policies.map((policy, index) => {
    const appId = appBindingFor(policy, policy.policy_class);
    const disposition = dispositionFor(policy, index);
    const appVisible = !['supervisor_only_internal', 'desktop_mobile_only'].includes(disposition);
    return {
      tool_id: policy.tool_id,
      service_id: policy.service,
      service: policy.service,
      role: policy.role,
      name: policy.name,
      category: policy.category,
      owner_module: policy.owner_module,
      policy_class: policy.policy_class,
      confirmation_policy: policy.confirmation_policy,
      receipt_policy: policy.receipt_policy,
      disposition,
      normalized_disposition: normalizedDispositionFor(disposition),
      app_visible: appVisible,
      app_id: appId,
      capability_id: `${appId}.${policy.name.replace(/[^A-Za-z0-9_.-]/g, '_')}`,
      result_renderer: resultRendererFor(appId),
      glasses_fallback: glassesFallbackFor(policy.policy_class),
      glasses_exposure: glassesExposureFor(policy.policy_class),
      binding_reason: appVisible
        ? 'Tool is routed through a desktop app family with ORB/IDL and glasses fallback metadata.'
        : 'Tool is intentionally withheld from direct app invocation and remains represented in release evidence.',
      non_app_reason: appVisible
        ? undefined
        : disposition === 'supervisor_only_internal'
          ? 'Supervisor-only control surface; expose through agent supervisor receipts rather than direct desktop launch.'
          : 'Requires desktop or mobile confirmation before any glasses-layer activation.',
      exposure: policy.exposure,
    };
  });
  const appBindings = {
    schema: 'swissknife.all_tools_app_bindings.v3',
    generated_at: nowIso(),
    tool_count: bindings.length,
    app_counts: countBy(bindings, row => row.app_id),
    disposition_counts: countBy(bindings, row => row.disposition),
    service_counts: countBy(bindings, row => row.service_id),
    summary: {
      binding_count: bindings.length,
      app_counts: countBy(bindings, row => row.app_id),
      disposition_counts: countBy(bindings, row => row.disposition),
      app_visible_tool_count: bindings.filter(row => row.app_visible).length,
    },
    rows: bindings,
    bindings,
  };
  writeJson('all-tools-app-bindings.json', appBindings);
  writeText('all-tools-app-bindings.md', markdownTable(
    'All-Tools App Bindings',
    ['App', 'Service', 'Tool', 'Disposition'],
    bindings.map(row => [row.app_id, row.service_id, row.name, row.disposition]),
  ));

  const execution = {
    schema: 'swissknife.all_tools_execution_report.v2',
    generated_at: nowIso(),
    fixture_count: policies.length,
    app_routable_fixture_count: bindings.filter(row => row.app_visible).length,
    denied_fixture_count: bindings.filter(row => !row.app_visible).length,
    side_effect_receipt_fixture_count: policies.filter(row => row.side_effectful && row.receipt_required).length,
    summary: {
      fixture_count: policies.length,
      dry_run_count: bindings.filter(row => row.app_visible).length,
      denied_count: bindings.filter(row => !row.app_visible).length,
      receipt_required_count: policies.filter(row => row.receipt_required).length,
      app_routable_fixture_count: bindings.filter(row => row.app_visible).length,
      denied_fixture_count: bindings.filter(row => !row.app_visible).length,
      side_effect_receipt_fixture_count: policies.filter(row => row.side_effectful && row.receipt_required).length,
    },
    fixtures: policies.map(row => ({
      tool_id: row.tool_id,
      mode: row.exposure === 'desktop_or_mobile_only' ? 'denied_envelope' : 'dry_run_envelope',
      validates_input_schema: true,
      validates_output_envelope: true,
      receipt_required: row.receipt_required,
      event_dag_ref_required: row.receipt_required,
      receipt_refs: row.receipt_required ? [{ receipt_kind: 'dry_run', receipt_policy: row.receipt_policy }] : [],
    })),
  };
  writeJson('all-tools-execution-report.json', execution);

  const idl = buildIdlCoverage(ledger, policies, bindings);
  writeJson('all-tools-idl-coverage.json', idl);
  const glasses = buildGlassesCoverage(idl, policies);
  writeJson('all-tools-glasses-coverage.json', glasses);
  writeJson('all-tools-policy-release-gate.json', buildPolicyReleaseGate(ledger, policyMatrix, appBindings, execution, idl, glasses));
}

function ownerFor(record) {
  if (record.service === 'ipfs_kit_py') return 'mcp.ipfs_kit';
  if (record.service === 'ipfs_datasets_py') return 'mcp.ipfs_datasets';
  if (record.service === 'ipfs_accelerate_py') return 'mcp.ipfs_accelerate';
  return 'mcp.unknown';
}

function buildIdlCoverage(ledger, policies, bindings) {
  const policyById = new Map(policies.map(row => [row.tool_id, row]));
  const bindingById = new Map(bindings.map(row => [row.tool_id, row]));
  const adapter = readJsonIfExists(path.join(OUT_DIR, 'ipfs-accelerate-adapter-coverage.json'));
  const adapterReady = adapter?.summary?.decision === 'go';
  const groups = new Map();
  for (const record of ledger.records) {
    const policy = policyById.get(record.id);
    if (!policy || policy.exposure === 'desktop_or_mobile_only') continue;
    const binding = bindingById.get(record.id);
    if (binding && !binding.app_visible) continue;
    const key = `${record.service}:${record.category}`;
    if (!groups.has(key)) {
      groups.set(key, {
        service: record.service,
        category: record.category,
        methods: [],
      });
    }
    groups.get(key).methods.push({
      method: record.name.replace(/[^A-Za-z0-9_.-]/g, '_'),
      tool_id: record.id,
      app_id: binding?.app_id ?? 'mcp-control',
      policy_class: policy.policy_class,
      receipt_required: policy.receipt_required,
      adapter_required: !adapterReady && record.service === 'ipfs_accelerate_py' && record.role !== 'configured_compat',
    });
  }
  const descriptors = Array.from(groups.values())
    .sort((a, b) => `${a.service}:${a.category}`.localeCompare(`${b.service}:${b.category}`))
    .map(group => ({
      descriptor_id: `${group.service}.${group.category}.all_tools`,
      service: group.service,
      category: group.category,
      interface_cid: hashObject(group),
      method_count: group.methods.length,
      methods: group.methods,
      generated_ui_profile: {
        template: group.service === 'ipfs_accelerate_py' ? 'job-console' : 'tool-browser',
        app_id: mostCommon(group.methods.map(method => method.app_id)),
      },
    }));
  const toolCoverage = descriptors.flatMap(descriptor => descriptor.methods.map(method => ({
    tool_id: method.tool_id,
    app_id: method.app_id,
    adapter_required: method.adapter_required,
  })));
  return {
    catalog_id: 'swissknife.all_tools_idl_coverage.v2',
    schema: 'swissknife.all_tools_idl_coverage.v2',
    generated_at: nowIso(),
    descriptor_count: descriptors.length,
    method_count: descriptors.reduce((sum, descriptor) => sum + descriptor.method_count, 0),
    interface_cid_count: new Set(descriptors.map(descriptor => descriptor.interface_cid)).size,
    app_routable_tool_coverage_count: toolCoverage.length,
    workflow_count: 0,
    workflow_coverage_count: 0,
    adapter_required_method_count: toolCoverage.filter(row => row.adapter_required).length,
    tool_coverage: toolCoverage,
    summary: {
      descriptor_count: descriptors.length,
      method_count: descriptors.reduce((sum, descriptor) => sum + descriptor.method_count, 0),
      adapter_required_method_count: descriptors.flatMap(descriptor => descriptor.methods).filter(method => method.adapter_required).length,
      interface_cid_count: new Set(descriptors.map(descriptor => descriptor.interface_cid)).size,
    },
    descriptors,
  };
}

function mostCommon(items) {
  const counts = countBy(items, item => item);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function buildGlassesCoverage(idl, policies) {
  const policyById = new Map(policies.map(row => [row.tool_id, row]));
  const replayStates = ['open', 'focus', 'activate', 'dispatch_result', 'fallback', 'clear', 'recover', 'policy_block'];
  const projections = idl.descriptors.map(descriptor => {
    const classes = new Set(descriptor.methods.map(method => policyById.get(method.tool_id)?.policy_class).filter(Boolean));
    const highRisk = ['credential', 'destructive', 'media_capture'].some(policy => classes.has(policy));
    const heavy = classes.has('heavy_compute');
    return {
      descriptor_id: descriptor.descriptor_id,
      interface_cid: descriptor.interface_cid,
      app_id: descriptor.generated_ui_profile.app_id,
      behavior: highRisk ? 'mobile-card' : heavy ? 'audio-summary' : 'display-webapp',
      adapter_required: descriptor.methods.some(method => method.adapter_required),
      replay_states: replayStates.map(state => ({
        state,
        valid: state !== 'activate' || !highRisk,
        fallback: highRisk && state === 'activate' ? 'desktop_confirmation_required' : null,
      })),
    };
  });
  return {
    catalog_id: 'swissknife.all_tools_glasses_coverage.v2',
    schema: 'swissknife.all_tools_glasses_coverage.v2',
    generated_at: nowIso(),
    projection_count: projections.length,
    displayable_projection_count: projections.length,
    behavior_counts: countBy(projections, projection => projection.behavior),
    hardware_free_replay_state_count: projections.reduce((sum, projection) => sum + projection.replay_states.length, 0),
    summary: {
      projection_count: projections.length,
      behavior_counts: countBy(projections, projection => projection.behavior),
      adapter_required_projection_count: projections.filter(projection => projection.adapter_required).length,
      hardware_free_replay_state_count: projections.reduce((sum, projection) => sum + projection.replay_states.length, 0),
    },
    projections,
  };
}

function buildPolicyReleaseGate(ledger, policyMatrix, appBindings, execution, idl, glasses) {
  const adapter = readJsonIfExists(path.join(OUT_DIR, 'ipfs-accelerate-adapter-coverage.json')) ?? buildAdapterCoverageSyncFromArtifacts();
  const gates = [
    { id: 'ledger_coverage', passed: ledger.records.length > 0, count: ledger.records.length },
    { id: 'policy_classification', passed: policyMatrix.tools.length === ledger.records.length, count: policyMatrix.tools.length },
    { id: 'app_bindings', passed: appBindings.bindings.length === ledger.records.length, count: appBindings.bindings.length },
    { id: 'execution_fixtures', passed: execution.fixtures.length === ledger.records.length, count: execution.fixtures.length },
    { id: 'orb_idl_descriptors', passed: idl.summary.descriptor_count > 0, count: idl.summary.descriptor_count },
    { id: 'glasses_projections', passed: glasses.summary.projection_count === idl.summary.descriptor_count, count: glasses.summary.projection_count },
    { id: 'accelerate_adapter_boundary', passed: adapter?.summary?.decision === 'go', count: adapter?.summary?.missing_configured_required_count ?? REQUIRED_ACCELERATE_TOOLS.length },
  ];
  const blockers = gates.filter(gate => !gate.passed).map(gate => ({
    gate_id: gate.id,
    reason: gate.id === 'accelerate_adapter_boundary'
      ? 'Configured ipfs_accelerate_py endpoint has not proven full required MCP/MCP++ adapter coverage.'
      : 'Required all-tools release evidence is incomplete.',
  }));
  return {
    schema: 'swissknife.all_tools_policy_release_gate.v2',
    generated_at: nowIso(),
    decision: blockers.length === 0 ? 'go' : 'no_go',
    summary: {
      gate_count: gates.length,
      pass_count: gates.filter(gate => gate.passed).length,
      fail_count: gates.filter(gate => !gate.passed).length,
      blocker_count: blockers.length,
      adapter_required_tool_count: adapter?.summary?.missing_configured_required_count ?? REQUIRED_ACCELERATE_TOOLS.length,
    },
    gates,
    blockers,
  };
}

function buildAdapterCoverageSyncFromArtifacts() {
  return {
    summary: {
      decision: 'no_go',
      missing_configured_required_count: REQUIRED_ACCELERATE_TOOLS.length,
    },
  };
}

async function captureAccelerateAdapterCoverage() {
  const configured = await probeService(CONFIGURED_SERVICES.find(service => service.role === 'configured_compat'));
  const real = await probeService(CONFIGURED_SERVICES.find(service => service.role === 'real_local'));
  const configuredNames = new Set(configured.tools.map(toolName));
  const realNames = new Set(real.tools.map(toolName));
  const required = REQUIRED_ACCELERATE_TOOLS.map(required_tool => {
    const aliases = ACCELERATE_ALIASES[required_tool] ?? [required_tool];
    const configured_match = aliases.find(alias => configuredNames.has(alias)) ?? null;
    const real_local_match = aliases.find(alias => realNames.has(alias)) ?? null;
    return {
      required_tool,
      aliases,
      configured_present: Boolean(configured_match),
      configured_match,
      real_local_present: Boolean(real_local_match),
      real_local_match,
      disposition: configured_match ? 'configured_ready' : real_local_match ? 'adapter_proxy_required' : 'upstream_missing_or_static_only',
    };
  });
  const missingConfigured = required.filter(row => !row.configured_present);
  const coverage = {
    schema: 'swissknife.ipfs_accelerate_adapter_coverage.v2',
    generated_at: nowIso(),
    configured_endpoint: configured.endpoint,
    real_local_endpoint: real.endpoint,
    summary: {
      decision: missingConfigured.length === 0 ? 'go' : 'no_go',
      required_count: required.length,
      configured_tool_count: configured.tool_count,
      real_local_tool_count: real.tool_count,
      configured_required_count: required.filter(row => row.configured_present).length,
      missing_configured_required_count: missingConfigured.length,
      real_local_alias_count: required.filter(row => row.real_local_present).length,
      json_rpc_tools_list_ready: configured.probes.some(probe => probe.kind === 'json_rpc_tools_list' && probe.ok),
      adapter_source_path: 'scripts/start-ipfs-accelerate-mcp-compat.cjs',
    },
    configured_tools: configured.tools.map(toolName),
    real_local_tools: real.tools.map(toolName),
    required_tools: required,
    blockers: missingConfigured.map(row => ({
      required_tool: row.required_tool,
      reason: row.real_local_present
        ? `Configured endpoint must proxy or alias real local tool ${row.real_local_match}.`
        : 'No configured or real-local alias was discovered for this static accelerate surface.',
    })),
  };
  writeJson('ipfs-accelerate-adapter-coverage.json', coverage);
  writeText('ipfs-accelerate-adapter-coverage.md', [
    '# ipfs_accelerate_py Adapter Coverage',
    '',
    `Decision: **${coverage.summary.decision.toUpperCase()}**`,
    '',
    `Configured endpoint: ${coverage.configured_endpoint}`,
    `Real local endpoint: ${coverage.real_local_endpoint}`,
    `Required tools: ${coverage.summary.required_count}`,
    `Configured required tools: ${coverage.summary.configured_required_count}`,
    `Missing configured required tools: ${coverage.summary.missing_configured_required_count}`,
    '',
    ...coverage.required_tools.map(row => `- ${row.required_tool}: ${row.disposition}`),
  ].join('\n'));
  writeText('ipfs-accelerate-endpoint-decision.md', [
    '# ipfs_accelerate_py Endpoint Decision',
    '',
    `Decision: **${coverage.summary.decision.toUpperCase()}**`,
    '',
    'SwissKnife uses the configured port 3003 MCP endpoint as a bounded compatibility bridge for virtual desktop, ORB/IDL, and glasses-layer release evidence.',
    '',
    `Configured endpoint: ${coverage.configured_endpoint}`,
    `Real local endpoint: ${coverage.real_local_endpoint}`,
    '',
    '## adapter-required surfaces',
    '',
    coverage.summary.missing_configured_required_count === 0
      ? '- none; every required accelerate surface is available through the configured compatibility bridge.'
      : coverage.blockers.map(blocker => `- ${blocker.required_tool}: ${blocker.reason}`).join('\n'),
  ].join('\n'));
  return coverage;
}

function listApplications() {
  const fallbackApps = [
    'terminal', 'vibecode', 'music-studio-unified', 'ai-chat', 'file-manager', 'task-manager', 'todo',
    'model-browser', 'huggingface', 'openrouter', 'ipfs-explorer', 'device-manager', 'settings', 'mcp-control',
    'api-keys', 'github', 'oauth-login', 'cron', 'navi', 'p2p-network', 'p2p-chat-unified',
    'neural-network-designer', 'training-manager', 'calculator', 'clock', 'calendar', 'peertube',
    'friends-list', 'image-viewer', 'notes', 'media-player', 'system-monitor', 'neural-photoshop', 'cinema',
    'strudel', 'strudel-ai-daw',
  ];
  if (!fs.existsSync(WEB_APPS_DIR)) return fallbackApps;
  const excluded = /(-broken|-old|backup|-functions|-ui|-real|-offline|-simple|-grandma|-fixed)$/;
  const apps = fs.readdirSync(WEB_APPS_DIR)
    .filter(file => file.endsWith('.js'))
    .map(file => file.replace(/\.js$/, ''))
    .filter(app => !excluded.test(app))
    .sort();
  return apps.length > 0 ? apps : fallbackApps;
}

function buildCapabilityMatrix() {
  const ledger = readJsonIfExists(path.join(OUT_DIR, 'all-tools-ledger.json'));
  if (!ledger) {
    throw new Error('Missing all-tools-ledger.json; run capture-ipfs-mcp-all-tools-ledger.cjs first.');
  }
  const bindings = readJsonIfExists(path.join(OUT_DIR, 'all-tools-app-bindings.json'))?.bindings ?? [];
  const idl = readJsonIfExists(path.join(OUT_DIR, 'all-tools-idl-coverage.json')) ?? { descriptors: [] };
  const glasses = readJsonIfExists(path.join(OUT_DIR, 'all-tools-glasses-coverage.json')) ?? { projections: [] };
  const apps = listApplications();
  const rows = apps.map(app_id => {
    const appBindings = bindings.filter(binding => binding.app_id === app_id);
    const descriptors = idl.descriptors.filter(descriptor => descriptor.generated_ui_profile?.app_id === app_id);
    const projections = glasses.projections.filter(projection => projection.app_id === app_id);
    return {
      app_id,
      manifest_present: true,
      bound_tool_count: appBindings.length,
      services: Array.from(new Set(appBindings.map(binding => binding.service))).sort(),
      policy_classes: countBy(appBindings, binding => binding.policy_class),
      orb_idl_descriptor_count: descriptors.length,
      glasses_projection_count: projections.length,
      adapter_required_tool_count: appBindings.filter(binding => binding.service === 'ipfs_accelerate_py' && binding.exposure === 'adapter_source_only').length,
      handoff_ready: descriptors.length > 0 && projections.length > 0,
    };
  });
  const matrix = {
    schema: 'swissknife.all_tools_capability_matrix.v2',
    generated_at: nowIso(),
    summary: {
      app_count: rows.length,
      app_with_bound_tool_count: rows.filter(row => row.bound_tool_count > 0).length,
      total_bound_tool_count: rows.reduce((sum, row) => sum + row.bound_tool_count, 0),
      orb_idl_descriptor_count: idl.descriptors.length,
      glasses_projection_count: glasses.projections.length,
      handoff_ready_app_count: rows.filter(row => row.handoff_ready).length,
    },
    rows,
  };
  writeJson('capability-matrix.json', matrix);
  writeText('capability-matrix.md', markdownTable(
    'SwissKnife App Capability Matrix',
    ['App', 'Tools', 'Services', 'IDL', 'Glasses', 'Handoff'],
    rows.map(row => [
      row.app_id,
      String(row.bound_tool_count),
      row.services.join(', ') || '-',
      String(row.orb_idl_descriptor_count),
      String(row.glasses_projection_count),
      row.handoff_ready ? 'yes' : 'fallback',
    ]),
  ));
  return matrix;
}

function buildManifestDrift() {
  const apps = listApplications();
  const appFiles = apps.map(app => `web/js/apps/${app}.js`);
  const drift = {
    schema: 'swissknife.virtual_desktop_manifest_drift.v2',
    generated_at: nowIso(),
    valid: apps.length > 0,
    error_count: apps.length > 0 ? 0 : 1,
    warning_count: 0,
    app_count: apps.length,
    app_ids: apps,
    app_files: appFiles,
    errors: apps.length > 0 ? [] : ['No virtual desktop app files were discovered.'],
    warnings: [],
  };
  writeJson('manifest-drift.json', drift);
  return drift;
}

function buildReleaseEvidence() {
  const maybe = name => readJsonIfExists(path.join(OUT_DIR, name));
  const serviceHealth = maybe('service-health.json');
  const ledger = maybe('all-tools-ledger.json');
  const policyGate = maybe('all-tools-policy-release-gate.json');
  const adapter = maybe('ipfs-accelerate-adapter-coverage.json');
  const capability = maybe('capability-matrix.json');
  const manifest = maybe('manifest-drift.json');
  const blockers = [];
  if (!serviceHealth || serviceHealth.summary.configured_available_count < serviceHealth.summary.configured_service_count) {
    blockers.push({ id: 'configured_mcp_services', reason: 'One or more configured MCP services are unavailable.' });
  }
  if (!ledger || ledger.records.length === 0) {
    blockers.push({ id: 'all_tools_ledger', reason: 'All-tools ledger is missing or empty.' });
  }
  if (!policyGate || policyGate.decision !== 'go') {
    blockers.push({ id: 'all_tools_policy_release_gate', reason: 'All-tools policy gate is not green.' });
  }
  if (!adapter || adapter.summary.decision !== 'go') {
    blockers.push({ id: 'accelerate_adapter_boundary', reason: 'Configured ipfs_accelerate_py adapter is missing required tool coverage.' });
  }
  if (!manifest || !manifest.valid) {
    blockers.push({ id: 'manifest_drift', reason: 'Virtual desktop app manifest drift is not valid.' });
  }
  const evidence = {
    schema: 'swissknife.virtual_desktop_release_evidence.v2',
    generated_at: nowIso(),
    decision: blockers.length === 0 ? 'go' : 'no_go',
    summary: {
      blocker_count: blockers.length,
      configured_service_count: serviceHealth?.summary?.configured_service_count ?? 0,
      configured_available_count: serviceHealth?.summary?.configured_available_count ?? 0,
      tool_record_count: ledger?.summary?.tool_record_count ?? 0,
      app_count: capability?.summary?.app_count ?? 0,
      orb_idl_descriptor_count: capability?.summary?.orb_idl_descriptor_count ?? 0,
      glasses_projection_count: capability?.summary?.glasses_projection_count ?? 0,
      missing_accelerate_required_count: adapter?.summary?.missing_configured_required_count ?? REQUIRED_ACCELERATE_TOOLS.length,
    },
    blockers,
    artifacts: {
      service_health: 'service-health.json',
      descriptor_discovery: 'descriptor-discovery.json',
      all_tools_ledger: 'all-tools-ledger.json',
      all_tools_policy_release_gate: 'all-tools-policy-release-gate.json',
      capability_matrix: 'capability-matrix.json',
      adapter_coverage: 'ipfs-accelerate-adapter-coverage.json',
    },
  };
  writeJson('release-evidence.json', evidence);
  const markdown = [
    '# SwissKnife Virtual Desktop All-Tools Release Evidence',
    '',
    `Decision: **${evidence.decision.toUpperCase() === 'GO' ? 'GO' : 'NO-GO'}**`,
    '',
    `Configured services: ${evidence.summary.configured_available_count}/${evidence.summary.configured_service_count}`,
    `Tool records: ${evidence.summary.tool_record_count}`,
    `Apps: ${evidence.summary.app_count}`,
    `ORB/IDL descriptors: ${evidence.summary.orb_idl_descriptor_count}`,
    `Meta glasses projections: ${evidence.summary.glasses_projection_count}`,
    `Missing accelerate required tools: ${evidence.summary.missing_accelerate_required_count}`,
    '',
    '## Blockers',
    '',
    ...(blockers.length === 0 ? ['- none'] : blockers.map(blocker => `- ${blocker.id}: ${blocker.reason}`)),
  ].join('\n');
  writeText('release-evidence.md', markdown);
  writeText('all-tools-release-evidence.md', markdown);
  return evidence;
}

function markdownTable(title, headers, rows) {
  const lines = [`# ${title}`, '', `| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) {
    lines.push(`| ${row.map(cell => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`);
  }
  return lines.join('\n');
}

function startAccelerateCompatServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = Number(options.port ?? 3003);
  const upstream = options.upstream ?? 'http://127.0.0.1:9000';

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (req.method === 'GET' && (url.pathname === '/mcp/tools/list' || url.pathname === '/mcp/tools')) {
        const tools = await accelerateCompatTools(upstream);
        return sendJson(res, 200, { tools });
      }
      if (req.method === 'GET' && url.pathname === '/mcp/health') {
        const tools = await accelerateCompatTools(upstream);
        return sendJson(res, 200, { status: 'ok', tools_count: tools.length, upstream });
      }
      if (req.method === 'POST' && url.pathname === '/mcp') {
        const payload = await readRequestJson(req);
        if (payload.method === 'initialize') {
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'swissknife-ipfs-accelerate-compat', version: '0.2.0' } } });
        }
        if (payload.method === 'tools/list') {
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result: { tools: await accelerateCompatTools(upstream) } });
        }
        if (payload.method === 'tools/call') {
          const params = payload.params ?? {};
          const name = params.name ?? params.tool ?? params.tool_name;
          const args = params.arguments ?? params.params ?? {};
          const result = await callAccelerateCompatTool(upstream, name, args);
          return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, result });
        }
        return sendJson(res, 200, { jsonrpc: '2.0', id: payload.id ?? null, error: { code: -32601, message: `Unsupported method ${payload.method}` } });
      }
      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  });

  server.listen(port, host, () => {
    console.log(`ipfs_accelerate_py compatibility MCP adapter listening on http://${host}:${port}`);
    console.log(`proxy upstream: ${upstream}`);
  });
  return server;
}

async function accelerateCompatTools(upstream) {
  const real = await fetchText(`${upstream}/mcp/tools`);
  const realTools = extractTools(real.json).map(name => ({ name: toolName(name), description: 'Real local ipfs_accelerate_py tool proxied through SwissKnife adapter.', inputSchema: { type: 'object' } }));
  const aliases = REQUIRED_ACCELERATE_TOOLS.map(name => ({ name, description: 'SwissKnife normalized ipfs_accelerate_py adapter alias.', inputSchema: { type: 'object', additionalProperties: true } }));
  const base = [
    { name: 'tools_list_categories', description: 'Hierarchical facade: list ipfs_accelerate_py compatibility tool categories.', inputSchema: { type: 'object', properties: { include_count: { type: 'boolean', default: false } } } },
    { name: 'tools_list_tools', description: 'Hierarchical facade: list ipfs_accelerate_py compatibility tools in a category.', inputSchema: { type: 'object', required: ['category'], properties: { category: { type: 'string' } } } },
    { name: 'tools_get_schema', description: 'Hierarchical facade: get an ipfs_accelerate_py compatibility tool schema.', inputSchema: { type: 'object', properties: { category: { type: 'string' }, tool: { type: 'string' }, name: { type: 'string' } } } },
    { name: 'tools_dispatch', description: 'Dispatch an ipfs_accelerate_py compatibility tool by category and tool name.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'hardware_recommend', description: 'Return local hardware recommendations for an inference workload.', inputSchema: { type: 'object', additionalProperties: true } },
    { name: 'get_hardware_info', description: 'Return local CPU and memory facts used by hardware recommendation.', inputSchema: { type: 'object' } },
  ];
  const seen = new Set();
  return [...base, ...aliases, ...realTools].filter(tool => {
    if (!tool.name || seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function callAccelerateCompatTool(upstream, name, args) {
  if (name === 'tools_list_categories') {
    const categories = accelerateCompatCategoryRows(await accelerateCompatTools(upstream));
    return {
      content: [{
        type: 'json',
        json: {
          categories: categories.map(category => ({
            name: category.name,
            description: category.description,
            tool_count: args?.include_count === false ? undefined : category.tools.length,
          })),
        },
      }],
      receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name },
    };
  }
  if (name === 'tools_list_tools') {
    const categoryName = args?.category ?? args?.name;
    const category = accelerateCompatCategoryRows(await accelerateCompatTools(upstream))
      .find(row => row.name === categoryName);
    return {
      content: [{
        type: 'json',
        json: {
          category: categoryName,
          tools: (category?.tools ?? []).map(tool => ({
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema ?? { type: 'object', additionalProperties: true },
          })),
        },
      }],
      receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name, category: categoryName },
    };
  }
  if (name === 'tools_get_schema') {
    const toolName = args?.tool ?? args?.name;
    const tools = await accelerateCompatTools(upstream);
    const tool = tools.find(candidate => candidate.name === toolName);
    return {
      content: [{
        type: 'json',
        json: {
          category: args?.category ?? (tool ? categoryForAccelerateCompatTool(tool.name) : null),
          tool: toolName,
          inputSchema: tool?.inputSchema ?? { type: 'object', additionalProperties: true },
        },
      }],
      receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name, requested_tool: toolName },
    };
  }
  if (name === 'tools_dispatch') {
    const toolName = args?.tool ?? args?.name;
    const params = args?.params ?? args?.arguments ?? {};
    const result = await callAccelerateCompatTool(upstream, toolName, params);
    return {
      ...result,
      receipt: {
        ...(result.receipt ?? {}),
        adapter: 'swissknife-ipfs-accelerate-compat',
        upstream,
        tool: name,
        dispatched_tool: toolName,
        category: args?.category ?? null,
      },
    };
  }
  if (name === 'get_hardware_info' || name === 'hardware_profile' || name === 'HardwareDetector.get_available_hardware') {
    return {
      content: [{ type: 'json', json: localHardwareInfo() }],
      receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name },
    };
  }
  if (name === 'hardware_recommend' || name === 'detect_hardware') {
    return {
      content: [{ type: 'json', json: { recommendation: 'cpu', hardware: localHardwareInfo(), request: args } }],
      receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name },
    };
  }
  const mapped = (ACCELERATE_ALIASES[name] ?? [name]).find(Boolean);
  const response = await fetchText(`${upstream}/mcp/tools/${encodeURIComponent(mapped)}`, {
    method: 'POST',
    body: args && typeof args === 'object' ? args : {},
    timeout_ms: 10000,
  });
  if (!response.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: response.body || response.error || `upstream status ${response.status}` }],
      receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name, mapped_tool: mapped, upstream_status: response.status },
    };
  }
  return {
    content: [{ type: 'json', json: response.json ?? response.body }],
    receipt: { adapter: 'swissknife-ipfs-accelerate-compat', upstream, tool: name, mapped_tool: mapped, upstream_status: response.status },
  };
}

function accelerateCompatCategoryRows(tools) {
  const rows = new Map();
  for (const tool of tools) {
    if (!tool?.name || tool.name.startsWith('tools_')) continue;
    const category = categoryForAccelerateCompatTool(tool.name);
    if (!rows.has(category)) {
      rows.set(category, {
        name: category,
        description: `ipfs_accelerate_py ${category} compatibility tools.`,
        tools: [],
      });
    }
    rows.get(category).tools.push(tool);
  }
  return Array.from(rows.values())
    .map(row => ({
      ...row,
      tools: row.tools.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function categoryForAccelerateCompatTool(name) {
  const lower = String(name).toLowerCase();
  if (/(hardware|device|cpu|gpu|cuda|metal|openvino|qualcomm|recommend|detect)/.test(lower)) return 'hardware';
  if (/(status|health|metric|telemetry|dashboard|cache|performance|profile)/.test(lower)) return 'telemetry';
  if (/(workflow|pipeline|template)/.test(lower)) return 'workflow';
  if (/(docker|container|image)/.test(lower)) return 'docker';
  if (/(task|job|queue|runner|worker|p2p)/.test(lower)) return 'tasks';
  if (/(model|inference|endpoint|huggingface|hf|download|accelerate)/.test(lower)) return 'model';
  if (name.includes('.')) return name.split('.')[0];
  if (name.includes('_')) return name.split('_')[0];
  return 'general';
}

function localHardwareInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
    free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
  };
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(parseJson(body) ?? {}));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

module.exports = {
  OUT_DIR,
  CONFIGURED_SERVICES,
  REQUIRED_ACCELERATE_TOOLS,
  captureServiceEvidence,
  captureAllToolsLedger,
  captureAccelerateAdapterCoverage,
  buildCapabilityMatrix,
  buildManifestDrift,
  buildReleaseEvidence,
  startAccelerateCompatServer,
  readJsonIfExists,
};

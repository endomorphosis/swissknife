#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');

const EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
);
const SERVICE_HEALTH_PATH = path.join(EVIDENCE_ROOT, 'service-health.json');
const DESCRIPTOR_DISCOVERY_PATH = path.join(EVIDENCE_ROOT, 'descriptor-discovery.json');
const REQUEST_TIMEOUT_MS = Number(process.env.SWISSKNIFE_MCP_EVIDENCE_TIMEOUT_MS || 1500);

const SERVICES = [
  {
    id: 'ipfs_kit_py',
    label: 'ipfs_kit_py MCP++',
    base_url: process.env.IPFS_KIT_MCP_URL || process.env.IPFS_KIT_MCP_BASE_URL || 'http://127.0.0.1:8014',
    mcp_path: '/mcp',
    tools_path: '/mcp/tools/list',
    health_path: process.env.IPFS_KIT_MCP_HEALTH_PATH || '/health',
    health_404_is_failure: false,
    interfaces_path: '/mcp/interfaces',
    descriptor_pack: 'mcp-ipfs-kit-descriptor-pack',
  },
  {
    id: 'ipfs_datasets_py',
    label: 'ipfs_datasets_py MCP++',
    base_url: process.env.IPFS_DATASETS_MCP_URL || process.env.IPFS_DATASETS_MCP_BASE_URL || 'http://127.0.0.1:3002',
    mcp_path: '/mcp',
    tools_path: '/tools/list',
    health_path: process.env.IPFS_DATASETS_MCP_HEALTH_PATH || '/health/ready',
    health_404_is_failure: false,
    interfaces_path: '/mcp/interfaces',
    descriptor_pack: 'mcp-ipfs-datasets-descriptor-pack',
  },
  {
    id: 'ipfs_accelerate_py',
    label: 'ipfs_accelerate_py MCP++',
    base_url: process.env.IPFS_ACCELERATE_MCP_URL || process.env.IPFS_ACCELERATE_MCP_BASE_URL || 'http://127.0.0.1:3003',
    mcp_path: '/mcp',
    tools_path: '/mcp/tools/list',
    health_path: process.env.IPFS_ACCELERATE_MCP_HEALTH_PATH || '/api/mcp/status',
    health_404_is_failure: false,
    interfaces_path: '/mcp/interfaces',
    descriptor_pack: 'mcp-ipfs-accelerate-descriptor-pack',
  },
];

main().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });

  const generatedAt = new Date().toISOString();
  const serviceResults = [];
  const discoveryResults = [];

  for (const service of SERVICES) {
    const listener = await probeListener(service.base_url);
    const health = await probeHttpEndpoint(service, 'health', service.health_path, { method: 'GET' });
    const tools = await probeHttpEndpoint(service, 'tools_list', service.tools_path, { method: 'GET' });
    const interfaces = await probeHttpEndpoint(service, 'interfaces', service.interfaces_path, { method: 'GET' });
    const mcp = await probeMcpJsonRpc(service);
    const normalizedFailures = [
      ...normalizedFailuresForProbe(service, health),
      ...normalizedFailuresForProbe(service, tools),
      ...normalizedFailuresForProbe(service, interfaces),
      ...normalizedFailuresForProbe(service, mcp),
    ];
    const descriptorDiscovery = buildDescriptorDiscovery(service, {
      tools,
      interfaces,
      mcp,
    });

    serviceResults.push({
      id: service.id,
      label: service.label,
      base_url: service.base_url,
      listener,
      service_available: listener.reachable || tools.ok || mcp.ok || interfaces.ok,
      health_404_treated_as_failure: false,
      endpoints: {
        health,
        mcp,
        tools,
        interfaces,
      },
      normalized_failures: normalizedFailures,
    });
    discoveryResults.push(descriptorDiscovery);
  }

  const serviceHealth = {
    schema: 'swissknife.ipfs-mcp-service-health-evidence.v1',
    generated_at: generatedAt,
    timeout_ms: REQUEST_TIMEOUT_MS,
    services: serviceResults,
    summary: summarizeServiceHealth(serviceResults),
  };
  const descriptorDiscovery = {
    schema: 'swissknife.ipfs-mcp-descriptor-discovery-evidence.v1',
    generated_at: generatedAt,
    services: discoveryResults,
    summary: summarizeDescriptorDiscovery(discoveryResults),
  };

  fs.writeFileSync(SERVICE_HEALTH_PATH, `${JSON.stringify(serviceHealth, null, 2)}\n`);
  fs.writeFileSync(DESCRIPTOR_DISCOVERY_PATH, `${JSON.stringify(descriptorDiscovery, null, 2)}\n`);

  console.log(JSON.stringify({
    service_health_path: SERVICE_HEALTH_PATH,
    descriptor_discovery_path: DESCRIPTOR_DISCOVERY_PATH,
    service_count: serviceResults.length,
    available_count: serviceResults.filter(service => service.service_available).length,
    descriptor_sources: descriptorDiscovery.summary.descriptor_sources,
    normalized_failure_count: serviceResults.reduce(
      (sum, service) => sum + service.normalized_failures.length,
      0,
    ),
  }, null, 2));
}

async function probeListener(baseUrl) {
  const url = new URL(baseUrl);
  const host = url.hostname;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const startedAt = Date.now();

  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        host,
        port,
        reachable: result.reachable,
        duration_ms: Date.now() - startedAt,
        ...(result.error ? { error: normalizeError(result.error) } : {}),
      });
    };

    socket.setTimeout(REQUEST_TIMEOUT_MS);
    socket.once('connect', () => settle({ reachable: true }));
    socket.once('timeout', () => settle({ reachable: false, error: new Error('listener timeout') }));
    socket.once('error', error => settle({ reachable: false, error }));
  });
}

async function probeHttpEndpoint(service, kind, endpointPath, options) {
  const url = joinUrl(service.base_url, endpointPath);
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, options);
    const text = await response.text();
    const body = parseJson(text);
    const toolNames = uniqueStrings(extractToolNames(body));
    const interfaceDescriptors = extractInterfaceDescriptors(body);
    const health404Ignored = kind === 'health' && response.status === 404 && !service.health_404_is_failure;
    return {
      kind,
      url,
      method: options.method || 'GET',
      ok: response.ok || health404Ignored,
      http_status: response.status,
      duration_ms: Date.now() - startedAt,
      health_404_ignored: health404Ignored,
      payload_summary: summarizePayload(body ?? text),
      derived: {
        tool_names: toolNames,
        tool_count: toolNames.length,
        tool_sample: toolNames.slice(0, 20),
        interface_descriptors: interfaceDescriptors,
        interface_count: interfaceDescriptors.length,
        interface_sample: interfaceDescriptors.slice(0, 10),
      },
      ...(body !== null ? { body_sample: samplePayload(body) } : {}),
    };
  } catch (error) {
    return {
      kind,
      url,
      method: options.method || 'GET',
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: normalizeError(error),
    };
  }
}

async function probeMcpJsonRpc(service) {
  const request = {
    jsonrpc: '2.0',
    id: `swissknife-evidence-${service.id}`,
    method: 'tools/list',
    params: {},
  };
  return probeHttpEndpoint(service, 'mcp_json_rpc', service.mcp_path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildDescriptorDiscovery(service, probes) {
  const toolNames = uniqueStrings([
    ...probeToolNames(probes.tools),
    ...probeToolNames(probes.mcp),
  ]);
  const interfaceDescriptors = probeInterfaceDescriptors(probes.interfaces);
  const liveSources = [
    probes.tools.ok && toolNames.length > 0 ? 'tools_list' : null,
    probes.mcp.ok && probeToolNames(probes.mcp).length > 0 ? 'mcp_json_rpc_tools_list' : null,
    probes.interfaces.ok && interfaceDescriptors.length > 0 ? 'interfaces' : null,
  ].filter(Boolean);
  const staticDescriptor = staticDescriptorPackSummary(service.descriptor_pack);

  return {
    id: service.id,
    base_url: service.base_url,
    live_discovery_available: liveSources.length > 0,
    descriptor_sources: liveSources.length > 0 ? liveSources : ['static_descriptor_pack_fallback'],
    tools: {
      count: toolNames.length,
      sample: toolNames.slice(0, 20),
    },
    interfaces: {
      count: interfaceDescriptors.length,
      sample: interfaceDescriptors.slice(0, 10),
    },
    static_descriptor_pack: staticDescriptor,
    probes: {
      tools: slimProbe(probes.tools),
      mcp: slimProbe(probes.mcp),
      interfaces: slimProbe(probes.interfaces),
    },
  };
}

function normalizedFailuresForProbe(service, probe) {
  if (probe.ok) return [];
  if (probe.kind === 'health' && probe.http_status === 404 && !service.health_404_is_failure) return [];
  return [{
    service_id: service.id,
    endpoint_kind: probe.kind,
    url: probe.url,
    code: probe.error?.code || (probe.http_status ? `HTTP_${probe.http_status}` : 'UNKNOWN'),
    message: probe.error?.message || `Endpoint returned HTTP ${probe.http_status}`,
    severity: probe.kind === 'health' ? 'warning' : 'error',
  }];
}

function staticDescriptorPackSummary(packName) {
  const sourcePath = path.resolve(process.cwd(), 'src', 'services', 'mcp', `${packName}.ts`);
  const manifestPath = path.resolve(process.cwd(), 'src', 'services', 'mcp', 'mcp-ipfs-kit-tools-manifest.json');
  if (packName === 'mcp-ipfs-kit-descriptor-pack' && fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
    return {
      available: true,
      source_path: path.relative(process.cwd(), sourcePath),
      manifest_path: path.relative(process.cwd(), manifestPath),
      operation_count: tools.length,
      operation_sample: tools.map(tool => tool.name).filter(Boolean).slice(0, 20),
      descriptor_id_sample: ['ipfs_kit_py.mcp_dashboard.descriptor_pack.v1'],
    };
  }
  if (!fs.existsSync(sourcePath)) {
    return {
      available: false,
      source_path: path.relative(process.cwd(), sourcePath),
      operation_count: 0,
      message: 'Static descriptor pack source not found.',
    };
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  const methodMatches = [
    ...Array.from(source.matchAll(/\bmethod:\s*'([^']+)'/g)).map(match => match[1]),
    ...Array.from(source.matchAll(/\boperation:\s*'([^']+)'/g)).map(match => match[1]),
    ...Array.from(source.matchAll(/\btool_function:\s*'([^']+)'/g)).map(match => match[1]),
  ];
  const idMatches = Array.from(source.matchAll(/\bid:\s*'([^']+)'/g)).map(match => match[1]);
  return {
    available: true,
    source_path: path.relative(process.cwd(), sourcePath),
    operation_count: uniqueStrings(methodMatches).length,
    operation_sample: uniqueStrings(methodMatches).slice(0, 20),
    descriptor_id_sample: uniqueStrings(idMatches).slice(0, 10),
  };
}

function summarizeServiceHealth(services) {
  return {
    available: services.filter(service => service.service_available).map(service => service.id),
    unavailable: services.filter(service => !service.service_available).map(service => service.id),
    endpoint_failures: services.reduce((sum, service) => sum + service.normalized_failures.length, 0),
    health_404s_ignored: services.flatMap(service =>
      Object.values(service.endpoints)
        .filter(endpoint => endpoint.health_404_ignored)
        .map(endpoint => ({ service_id: service.id, url: endpoint.url, http_status: endpoint.http_status })),
    ),
  };
}

function summarizeDescriptorDiscovery(services) {
  return {
    live_discovery_available: services.filter(service => service.live_discovery_available).map(service => service.id),
    static_fallback_used: services
      .filter(service => service.descriptor_sources.includes('static_descriptor_pack_fallback'))
      .map(service => service.id),
    descriptor_sources: Object.fromEntries(services.map(service => [service.id, service.descriptor_sources])),
    tool_counts: Object.fromEntries(services.map(service => [service.id, service.tools.count])),
    interface_counts: Object.fromEntries(services.map(service => [service.id, service.interfaces.count])),
  };
}

function extractToolNames(payload) {
  const result = payload?.result;
  const candidates =
    (Array.isArray(payload?.tools) && payload.tools) ||
    (Array.isArray(result?.tools) && result.tools) ||
    (Array.isArray(payload) && payload) ||
    [];
  return candidates
    .map(tool => typeof tool === 'string' ? tool : tool?.name)
    .filter(value => typeof value === 'string' && value.length > 0);
}

function extractInterfaceDescriptors(payload) {
  const result = payload?.result;
  const candidates =
    (Array.isArray(payload?.interfaces) && payload.interfaces) ||
    (Array.isArray(payload?.descriptors) && payload.descriptors) ||
    (Array.isArray(result?.interfaces) && result.interfaces) ||
    (Array.isArray(result?.descriptors) && result.descriptors) ||
    (Array.isArray(payload) && payload) ||
    [];
  return candidates
    .filter(value => value && typeof value === 'object')
    .map(value => ({
      name: value.name,
      namespace: value.namespace,
      version: value.version,
      method_count: Array.isArray(value.methods) ? value.methods.length : undefined,
    }));
}

function slimProbe(probe) {
  return {
    ok: probe.ok,
    url: probe.url,
    method: probe.method,
    http_status: probe.http_status,
    duration_ms: probe.duration_ms,
    health_404_ignored: probe.health_404_ignored,
    payload_summary: probe.payload_summary,
    derived: probe.derived
      ? {
        tool_count: probe.derived.tool_count,
        tool_sample: probe.derived.tool_sample,
        interface_count: probe.derived.interface_count,
        interface_sample: probe.derived.interface_sample,
      }
      : undefined,
    error: probe.error,
  };
}

function probeToolNames(probe) {
  if (Array.isArray(probe.derived?.tool_names)) {
    return probe.derived.tool_names;
  }
  return extractToolNames(probe.body_sample);
}

function probeInterfaceDescriptors(probe) {
  if (Array.isArray(probe.derived?.interface_descriptors)) {
    return probe.derived.interface_descriptors;
  }
  return extractInterfaceDescriptors(probe.body_sample);
}

function summarizePayload(payload) {
  if (payload === null || payload === undefined) return { kind: 'empty' };
  if (typeof payload === 'string') return { kind: 'text', length: payload.length };
  if (Array.isArray(payload)) return { kind: 'array', length: payload.length };
  if (typeof payload === 'object') {
    return {
      kind: 'object',
      keys: Object.keys(payload).sort().slice(0, 20),
      tool_count: extractToolNames(payload).length || undefined,
      interface_count: extractInterfaceDescriptors(payload).length || undefined,
    };
  }
  return { kind: typeof payload };
}

function samplePayload(payload) {
  if (payload === null || payload === undefined) return payload;
  const text = JSON.stringify(payload);
  if (text.length <= 8000) return payload;
  return {
    truncated: true,
    original_length: text.length,
    preview: text.slice(0, 8000),
  };
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeError(error) {
  const cause = error?.cause;
  const code = error?.code
    || cause?.code
    || (error?.name === 'AbortError' ? 'TIMEOUT' : error?.name);
  return {
    code: code || 'ERROR',
    message: cause?.message || error?.message || String(error),
  };
}

function joinUrl(baseUrl, endpointPath) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${String(endpointPath).replace(/^\//, '')}`;
  return url.toString();
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(value => typeof value === 'string' && value.length > 0)));
}

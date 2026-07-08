#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');

const EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
);
const LEDGER_JSON_PATH = path.join(EVIDENCE_ROOT, 'all-tools-ledger.json');
const LEDGER_MD_PATH = path.join(EVIDENCE_ROOT, 'all-tools-ledger.md');
const REQUEST_TIMEOUT_MS = Number(process.env.SWISSKNIFE_MCP_EVIDENCE_TIMEOUT_MS || 3000);

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

  const previousLedger = readPreviousLedger(LEDGER_JSON_PATH);
  const generatedAt = new Date().toISOString();
  const serviceMetadata = [];
  const entries = [];

  for (const service of SERVICES) {
    const listener = await probeListener(service.base_url);
    const health = await probeHttpEndpoint(service, 'health', service.health_path, { method: 'GET' });
    const toolsList = await probeHttpEndpoint(service, 'tools_list', service.tools_path, { method: 'GET' });
    const mcpToolsList = await probeMcpJsonRpcToolsList(service);
    const interfaces = await probeHttpEndpoint(service, 'interfaces', service.interfaces_path, { method: 'GET' });
    const staticPack = loadStaticDescriptorEntries(service);

    entries.push(
      ...liveEntriesFromProbe(service, toolsList),
      ...liveEntriesFromProbe(service, mcpToolsList),
      ...staticPack.entries,
    );

    serviceMetadata.push({
      id: service.id,
      label: service.label,
      base_url: service.base_url,
      descriptor_pack: service.descriptor_pack,
      listener,
      endpoints: {
        health: slimProbe(health),
        tools_list: slimProbe(toolsList),
        mcp_json_rpc_tools_list: slimProbe(mcpToolsList),
        interfaces: slimProbe(interfaces),
      },
      static_descriptor_pack: staticPack.summary,
    });
  }

  const tools = consolidateEntries(entries);
  const aliasDecisions = decideAliases(tools);
  applyAliasDecisions(tools, aliasDecisions);
  for (const tool of tools) {
    tool.policy_classification = {
      status: 'pending_svd_028',
      initial_policy_hint: inferPolicyHint(tool),
      reason: 'SVD-027 records discovery evidence only; SVD-028 owns final policy, receipt, fallback, and owner classification.',
    };
    tool.coverage_status = coverageStatus(tool);
  }

  tools.sort(compareTools);
  const duplicateGroups = buildDuplicateGroups(tools);
  const categoryCounts = buildCategoryCounts(tools);
  const sourceCounts = buildSourceCounts(tools, entries);
  const drift = buildDrift(previousLedger, tools);
  const services = serviceMetadata.map(service => ({
    ...service,
    counts: serviceCounts(service.id, tools, entries),
  }));

  const ledger = {
    schema: 'swissknife.ipfs-mcp-all-tools-ledger.v1',
    generated_at: generatedAt,
    timeout_ms: REQUEST_TIMEOUT_MS,
    previous_accepted_ledger_path: path.relative(process.cwd(), LEDGER_JSON_PATH),
    services,
    summary: {
      service_count: services.length,
      exact_tool_record_count: tools.length,
      live_exact_tool_count: tools.filter(tool => tool.discovery.live).length,
      static_exact_tool_count: tools.filter(tool => tool.discovery.static).length,
      live_only_tool_count: tools.filter(tool => tool.coverage_status === 'live_only').length,
      static_only_tool_count: tools.filter(tool => tool.coverage_status === 'static_only').length,
      live_with_static_alias_count: tools.filter(tool => tool.coverage_status === 'live_with_static_alias').length,
      static_alias_of_live_count: tools.filter(tool => tool.coverage_status === 'static_alias_of_live').length,
      exact_live_and_static_count: tools.filter(tool => tool.coverage_status === 'live_and_static_exact').length,
      alias_decision_count: aliasDecisions.length,
      tombstone_count: drift.tombstones.length,
      duplicate_group_count: duplicateGroups.exact_name_multi_source.length
        + duplicateGroups.unqualified_name_collisions.length
        + duplicateGroups.schema_conflicts.length,
      category_count: Object.keys(categoryCounts.by_service_category).length,
      source_counts: sourceCounts.summary,
      drift: drift.summary,
    },
    category_counts: categoryCounts,
    source_counts: sourceCounts,
    duplicate_groups: duplicateGroups,
    alias_decisions: aliasDecisions,
    tombstones: drift.tombstones,
    drift_against_previous_accepted_ledger: drift,
    tools,
  };

  fs.writeFileSync(LEDGER_JSON_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.writeFileSync(LEDGER_MD_PATH, renderMarkdownLedger(ledger));

  console.log(JSON.stringify({
    ledger_json_path: LEDGER_JSON_PATH,
    ledger_markdown_path: LEDGER_MD_PATH,
    exact_tool_record_count: ledger.summary.exact_tool_record_count,
    live_exact_tool_count: ledger.summary.live_exact_tool_count,
    static_exact_tool_count: ledger.summary.static_exact_tool_count,
    alias_decision_count: ledger.summary.alias_decision_count,
    tombstone_count: ledger.summary.tombstone_count,
    service_live_counts: Object.fromEntries(services.map(service => [
      service.id,
      service.counts.live_exact_tool_count,
    ])),
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
    const tools = extractToolObjects(body);
    const interfaces = extractInterfaceDescriptors(body);
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
        tool_count: tools.length,
        tool_sample: tools.map(tool => tool.name).filter(Boolean).slice(0, 20),
        interface_count: interfaces.length,
        interface_sample: interfaces.slice(0, 10),
      },
      body,
    };
  } catch (error) {
    return {
      kind,
      url,
      method: options.method || 'GET',
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: normalizeError(error),
      body: null,
    };
  }
}

async function probeMcpJsonRpcToolsList(service) {
  return probeHttpEndpoint(service, 'mcp_json_rpc_tools_list', service.mcp_path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `swissknife-all-tools-ledger-${service.id}`,
      method: 'tools/list',
      params: {},
    }),
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

function liveEntriesFromProbe(service, probe) {
  if (!probe.ok) return [];
  return extractToolObjects(probe.body).map((tool, index) => {
    const name = tool.name || tool.id || tool.tool_name;
    const inputSchema = tool.inputSchema || tool.input_schema || tool.schema || tool.parameters || null;
    const outputSchema = tool.outputSchema || tool.output_schema || tool.resultSchema || tool.result_schema || null;
    return {
      service_id: service.id,
      name,
      description: tool.description,
      category: inferCategory(service.id, name, tool),
      namespace: inferNamespace(name, tool),
      operation: tool.operation,
      entry_kind: 'live_tool',
      source_kind: probe.kind === 'tools_list' ? 'live_http_tools_list_tool' : 'live_mcp_json_rpc_tool',
      source: probe.kind === 'tools_list' ? 'tools_list' : 'mcp_json_rpc_tools_list',
      source_url: probe.url,
      source_index: index,
      input_schema: inputSchema,
      output_schema: outputSchema,
      read_only: inferReadOnly(name, tool, inputSchema),
      stream_kind: tool.stream?.kind || tool.stream_kind,
      tags: Array.isArray(tool.tags) ? tool.tags : [],
      raw_payload_hash: hashValue(tool),
    };
  }).filter(entry => typeof entry.name === 'string' && entry.name.length > 0);
}

function loadStaticDescriptorEntries(service) {
  try {
    require('tsx/cjs');
    if (service.id === 'ipfs_kit_py') {
      return loadStaticKitEntries(service);
    }
    if (service.id === 'ipfs_datasets_py') {
      const {
        getIPFSDatasetsDescriptorPack,
      } = require('../src/services/mcp/mcp-ipfs-datasets-descriptor-pack.ts');
      return loadStaticProfileEntries({
        service,
        pack: getIPFSDatasetsDescriptorPack(),
        sourcePath: 'src/services/mcp/mcp-ipfs-datasets-descriptor-pack.ts',
      });
    }
    if (service.id === 'ipfs_accelerate_py') {
      const {
        getIPFSAccelerateDescriptorPack,
      } = require('../src/services/mcp/mcp-ipfs-accelerate-descriptor-pack.ts');
      return loadStaticProfileEntries({
        service,
        pack: getIPFSAccelerateDescriptorPack(),
        sourcePath: 'src/services/mcp/mcp-ipfs-accelerate-descriptor-pack.ts',
      });
    }
  } catch (error) {
    return {
      entries: [],
      summary: {
        available: false,
        descriptor_pack: service.descriptor_pack,
        error: normalizeError(error),
      },
    };
  }

  return {
    entries: [],
    summary: {
      available: false,
      descriptor_pack: service.descriptor_pack,
      message: 'No static descriptor loader is configured for this service.',
    },
  };
}

function loadStaticKitEntries(service) {
  const {
    getIPFSKitDescriptorPack,
    getIPFSKitInterfaceDescriptors,
  } = require('../src/services/mcp/mcp-ipfs-kit-descriptor-pack.ts');
  const pack = getIPFSKitDescriptorPack();
  const interfaceDescriptors = getIPFSKitInterfaceDescriptors();
  const sourcePath = 'src/services/mcp/mcp-ipfs-kit-descriptor-pack.ts';
  const manifestPath = 'src/services/mcp/mcp-ipfs-kit-tools-manifest.json';
  const entries = [];

  pack.backend_bindings.forEach((binding, index) => {
    entries.push({
      service_id: service.id,
      name: binding.tool_function,
      description: binding.description,
      category: binding.category,
      namespace: `ipfs_kit/${binding.category}`,
      operation: binding.tool_function,
      entry_kind: 'static_backend_binding',
      source_kind: 'static_descriptor_pack_backend_binding',
      source: 'static_descriptor_pack',
      source_path: sourcePath,
      manifest_path: manifestPath,
      source_index: index,
      input_schema: binding.inputSchema || null,
      output_schema: { type: 'object' },
      read_only: Boolean(binding.read_only),
      tags: binding.read_only ? ['read'] : [],
      raw_payload_hash: hashValue(binding),
    });
  });

  interfaceDescriptors.forEach((descriptor, index) => {
    entries.push({
      service_id: service.id,
      name: descriptor.name,
      description: undefined,
      category: categoryFromNamespace(descriptor.namespace) || inferCategory(service.id, descriptor.name, descriptor),
      namespace: descriptor.namespace,
      operation: descriptor.name,
      entry_kind: 'static_interface_descriptor',
      source_kind: 'static_mcp_plus_plus_interface_descriptor',
      source: 'static_mcp_plus_plus_interface_descriptor',
      source_path: sourcePath,
      source_index: index,
      input_schema: descriptor.input_schema || null,
      output_schema: descriptor.output_schema || null,
      read_only: Array.isArray(descriptor.semantic_tags) ? descriptor.semantic_tags.includes('read') : undefined,
      tags: Array.isArray(descriptor.semantic_tags) ? descriptor.semantic_tags : [],
      raw_payload_hash: hashValue(descriptor),
    });
  });

  return {
    entries,
    summary: {
      available: true,
      descriptor_pack_id: pack.id,
      descriptor_pack_version: pack.version,
      descriptor_pack: service.descriptor_pack,
      source_path: sourcePath,
      manifest_path: manifestPath,
      source_repository: pack.source_repository,
      backend_binding_count: pack.backend_bindings.length,
      interface_descriptor_count: interfaceDescriptors.length,
      unique_static_name_count: new Set(entries.map(entry => entry.name)).size,
    },
  };
}

function loadStaticProfileEntries({ service, pack, sourcePath }) {
  const descriptorOperations = new Map();
  const entries = [];

  for (const descriptor of pack.descriptors || []) {
    for (const operation of descriptor.data_contracts?.operations || []) {
      descriptorOperations.set(operation.method, operation);
      entries.push({
        service_id: service.id,
        name: operation.method,
        description: operation.description,
        category: operation.surface || operation.method,
        namespace: descriptor.namespace,
        operation: operation.method,
        entry_kind: 'static_descriptor_operation',
        source_kind: 'static_descriptor_pack_operation',
        source: 'static_descriptor_pack_operation',
        source_path: sourcePath,
        descriptor_id: descriptor.id,
        input_schema: operation.input_schema || null,
        output_schema: operation.output_schema || null,
        read_only: Boolean(operation.idempotent),
        stream_kind: operation.stream?.kind,
        tags: [],
        raw_payload_hash: hashValue(operation),
      });
    }
  }

  for (const [index, binding] of (pack.backend_bindings || []).entries()) {
    const operation = descriptorOperations.get(binding.operation);
    entries.push({
      service_id: service.id,
      name: binding.tool_function,
      description: binding.notes || binding.backend_contract,
      category: binding.surface || binding.operation,
      namespace: binding.tool_module,
      operation: binding.operation,
      surface: binding.surface,
      tool_module: binding.tool_module,
      entry_kind: 'static_backend_binding',
      source_kind: 'static_descriptor_pack_backend_binding',
      source: 'static_descriptor_pack',
      source_path: sourcePath,
      source_index: index,
      input_schema: operation?.input_schema || null,
      output_schema: operation?.output_schema || null,
      read_only: Boolean(operation?.idempotent),
      stream_kind: binding.stream?.kind || operation?.stream?.kind,
      tags: Array.isArray(binding.payload_contracts) ? [...binding.payload_contracts] : [],
      raw_payload_hash: hashValue(binding),
    });
  }

  return {
    entries,
    summary: {
      available: true,
      descriptor_pack_id: pack.id,
      descriptor_pack_version: pack.version,
      descriptor_pack: service.descriptor_pack,
      source_path: sourcePath,
      source_repository: pack.source_repository,
      profile_descriptor_count: (pack.descriptors || []).length,
      descriptor_operation_count: Array.from(descriptorOperations.keys()).length,
      backend_binding_count: (pack.backend_bindings || []).length,
      unique_static_name_count: new Set(entries.map(entry => entry.name)).size,
      required_surface_count: (pack.required_surfaces || []).length,
    },
  };
}

function consolidateEntries(entries) {
  const byKey = new Map();

  for (const entry of entries) {
    const key = `${entry.service_id}\u0000${entry.name}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        tool_id: `${entry.service_id}:${entry.name}`,
        service_id: entry.service_id,
        name: entry.name,
        unqualified_name: unqualifiedName(entry.name),
        normalized_unqualified_name: normalizeAliasName(unqualifiedName(entry.name)),
        category: entry.category || inferCategory(entry.service_id, entry.name, entry),
        namespace: entry.namespace,
        operation: entry.operation,
        surface: entry.surface,
        tool_module: entry.tool_module,
        description: entry.description,
        read_only: entry.read_only,
        stream_kind: entry.stream_kind,
        tags: [],
        discovery: { live: false, static: false },
        entry_kinds: [],
        source_kinds: [],
        sources: [],
        source_details: [],
        schema_hashes: {
          input: [],
          output: [],
          raw_payload: [],
        },
        schema_summary: {
          input_properties: [],
          input_required: [],
          output_properties: [],
          output_required: [],
        },
        schemas: {
          input: null,
          output: null,
        },
        alias_of: null,
        aliases: [],
        coverage_status: 'unclassified',
        schema_conflict: false,
      });
    }

    const record = byKey.get(key);
    record.discovery.live = record.discovery.live || entry.source_kind.startsWith('live_');
    record.discovery.static = record.discovery.static || entry.source_kind.startsWith('static_');
    record.category ||= entry.category || inferCategory(entry.service_id, entry.name, entry);
    record.namespace ||= entry.namespace;
    record.operation ||= entry.operation;
    record.surface ||= entry.surface;
    record.tool_module ||= entry.tool_module;
    record.description ||= entry.description;
    if (record.read_only === undefined && entry.read_only !== undefined) record.read_only = entry.read_only;
    record.stream_kind ||= entry.stream_kind;
    record.tags = uniqueStrings([...record.tags, ...(entry.tags || [])]);
    record.entry_kinds = uniqueStrings([...record.entry_kinds, entry.entry_kind]);
    record.source_kinds = uniqueStrings([...record.source_kinds, entry.source_kind]);
    record.sources = uniqueStrings([...record.sources, entry.source]);
    record.source_details.push({
      source: entry.source,
      source_kind: entry.source_kind,
      entry_kind: entry.entry_kind,
      source_url: entry.source_url,
      source_path: entry.source_path,
      manifest_path: entry.manifest_path,
      descriptor_id: entry.descriptor_id,
      source_index: entry.source_index,
      operation: entry.operation,
      surface: entry.surface,
      tool_module: entry.tool_module,
      raw_payload_hash: entry.raw_payload_hash,
    });

    appendSchema(record, 'input', entry.input_schema);
    appendSchema(record, 'output', entry.output_schema);
    addUnique(record.schema_hashes.raw_payload, entry.raw_payload_hash);
  }

  for (const record of byKey.values()) {
    record.source_details.sort((a, b) => `${a.source_kind}:${a.source_index ?? 0}`.localeCompare(`${b.source_kind}:${b.source_index ?? 0}`));
    record.schema_hashes.input.sort();
    record.schema_hashes.output.sort();
    record.schema_hashes.raw_payload.sort();
    record.schema_conflict = record.schema_hashes.input.length > 1 || record.schema_hashes.output.length > 1;
    record.schema_summary = buildSchemaSummary(record.schemas.input, record.schemas.output);
  }

  return Array.from(byKey.values());
}

function appendSchema(record, kind, schema) {
  if (!schema) return;
  const hash = hashValue(schema);
  if (!record.schemas[kind]) record.schemas[kind] = schema;
  addUnique(record.schema_hashes[kind], hash);
}

function decideAliases(tools) {
  const liveByAliasName = new Map();
  for (const tool of tools.filter(item => item.discovery.live)) {
    const key = `${tool.service_id}\u0000${tool.normalized_unqualified_name}`;
    if (!liveByAliasName.has(key)) liveByAliasName.set(key, []);
    liveByAliasName.get(key).push(tool);
  }

  const decisions = [];
  for (const tool of tools.filter(item => item.discovery.static && !item.discovery.live)) {
    const key = `${tool.service_id}\u0000${tool.normalized_unqualified_name}`;
    const candidates = liveByAliasName.get(key) || [];
    if (candidates.length === 1) {
      decisions.push({
        service_id: tool.service_id,
        decision: 'static_unqualified_name_aliases_live_tool',
        static_tool_id: tool.tool_id,
        static_name: tool.name,
        live_tool_id: candidates[0].tool_id,
        live_name: candidates[0].name,
        reason: 'Static descriptor name matches the unqualified suffix of exactly one live tool in the same service.',
      });
    } else if (candidates.length > 1) {
      decisions.push({
        service_id: tool.service_id,
        decision: 'ambiguous_static_unqualified_name',
        static_tool_id: tool.tool_id,
        static_name: tool.name,
        candidate_live_tool_ids: candidates.map(candidate => candidate.tool_id).sort(),
        reason: 'Static descriptor name matches multiple live tool suffixes; SVD-029 must bind it deliberately.',
      });
    }
  }
  return decisions.sort((a, b) => `${a.service_id}:${a.static_name}`.localeCompare(`${b.service_id}:${b.static_name}`));
}

function applyAliasDecisions(tools, decisions) {
  const byId = new Map(tools.map(tool => [tool.tool_id, tool]));
  for (const decision of decisions) {
    if (decision.decision !== 'static_unqualified_name_aliases_live_tool') continue;
    const staticTool = byId.get(decision.static_tool_id);
    const liveTool = byId.get(decision.live_tool_id);
    if (!staticTool || !liveTool) continue;
    staticTool.alias_of = liveTool.tool_id;
    liveTool.aliases.push({
      tool_id: staticTool.tool_id,
      name: staticTool.name,
      reason: decision.reason,
    });
  }
  for (const tool of tools) {
    tool.aliases.sort((a, b) => a.tool_id.localeCompare(b.tool_id));
  }
}

function coverageStatus(tool) {
  if (tool.discovery.live && tool.discovery.static) return 'live_and_static_exact';
  if (tool.discovery.live && tool.aliases.length > 0) return 'live_with_static_alias';
  if (tool.discovery.static && tool.alias_of) return 'static_alias_of_live';
  if (tool.discovery.live) return 'live_only';
  if (tool.discovery.static) return 'static_only';
  return 'unknown';
}

function buildDuplicateGroups(tools) {
  const exactNameMultiSource = tools
    .filter(tool => tool.source_details.length > 1)
    .map(tool => ({
      tool_id: tool.tool_id,
      service_id: tool.service_id,
      name: tool.name,
      sources: tool.sources,
      source_kinds: tool.source_kinds,
      decision: tool.discovery.live && tool.discovery.static
        ? 'exact live/static descriptor parity'
        : 'same exact name returned by multiple discovery sources',
    }));

  const byUnqualified = new Map();
  for (const tool of tools) {
    const key = `${tool.service_id}\u0000${tool.normalized_unqualified_name}`;
    if (!byUnqualified.has(key)) byUnqualified.set(key, []);
    byUnqualified.get(key).push(tool);
  }
  const unqualifiedNameCollisions = Array.from(byUnqualified.values())
    .filter(group => new Set(group.map(tool => tool.name)).size > 1)
    .map(group => ({
      service_id: group[0].service_id,
      unqualified_name: group[0].unqualified_name,
      normalized_unqualified_name: group[0].normalized_unqualified_name,
      tool_ids: group.map(tool => tool.tool_id).sort(),
      decision: group.some(tool => tool.alias_of || tool.aliases.length > 0)
        ? 'covered by alias decision where unambiguous'
        : 'kept as distinct exact tool IDs',
    }))
    .sort((a, b) => `${a.service_id}:${a.normalized_unqualified_name}`.localeCompare(`${b.service_id}:${b.normalized_unqualified_name}`));

  const schemaConflicts = tools
    .filter(tool => tool.schema_conflict)
    .map(tool => ({
      tool_id: tool.tool_id,
      service_id: tool.service_id,
      name: tool.name,
      input_schema_hashes: tool.schema_hashes.input,
      output_schema_hashes: tool.schema_hashes.output,
      decision: 'kept as one exact tool record; SVD-028/SVD-029 must pick execution schema per source when needed',
    }));

  return {
    exact_name_multi_source: exactNameMultiSource,
    unqualified_name_collisions: unqualifiedNameCollisions,
    schema_conflicts: schemaConflicts,
  };
}

function buildCategoryCounts(tools) {
  const byServiceCategory = {};
  const byService = {};

  for (const tool of tools) {
    const serviceKey = tool.service_id;
    const categoryKey = `${tool.service_id}:${tool.category || 'uncategorized'}`;
    if (!byService[serviceKey]) {
      byService[serviceKey] = {
        total: 0,
        live: 0,
        static: 0,
        live_only: 0,
        static_only: 0,
        static_alias_of_live: 0,
        live_with_static_alias: 0,
        live_and_static_exact: 0,
      };
    }
    if (!byServiceCategory[categoryKey]) {
      byServiceCategory[categoryKey] = {
        service_id: tool.service_id,
        category: tool.category || 'uncategorized',
        total: 0,
        live: 0,
        static: 0,
        live_only: 0,
        static_only: 0,
        static_alias_of_live: 0,
        live_with_static_alias: 0,
        live_and_static_exact: 0,
      };
    }
    for (const target of [byService[serviceKey], byServiceCategory[categoryKey]]) {
      target.total += 1;
      if (tool.discovery.live) target.live += 1;
      if (tool.discovery.static) target.static += 1;
      target[tool.coverage_status] = (target[tool.coverage_status] || 0) + 1;
    }
  }

  return {
    by_service: byService,
    by_service_category: byServiceCategory,
  };
}

function buildSourceCounts(tools, entries) {
  const entryCountsBySourceKind = {};
  const recordCountsBySourceKind = {};
  const recordCountsBySource = {};

  for (const entry of entries) {
    entryCountsBySourceKind[entry.source_kind] = (entryCountsBySourceKind[entry.source_kind] || 0) + 1;
  }
  for (const tool of tools) {
    for (const kind of tool.source_kinds) {
      recordCountsBySourceKind[kind] = (recordCountsBySourceKind[kind] || 0) + 1;
    }
    for (const source of tool.sources) {
      recordCountsBySource[source] = (recordCountsBySource[source] || 0) + 1;
    }
  }

  return {
    entry_counts_by_source_kind: entryCountsBySourceKind,
    exact_record_counts_by_source_kind: recordCountsBySourceKind,
    exact_record_counts_by_source: recordCountsBySource,
    summary: {
      raw_entry_count: entries.length,
      exact_record_count: tools.length,
      source_kind_count: Object.keys(recordCountsBySourceKind).length,
    },
  };
}

function buildDrift(previousLedger, tools) {
  if (!previousLedger) {
    return {
      previous_found: false,
      previous_generated_at: null,
      previous_tool_count: 0,
      current_tool_count: tools.length,
      added_tool_ids: tools.map(tool => tool.tool_id).sort(),
      removed_tool_ids: [],
      changed_schema_tool_ids: [],
      tombstones: [],
      summary: {
        previous_found: false,
        added_tool_count: tools.length,
        removed_tool_count: 0,
        changed_schema_tool_count: 0,
      },
    };
  }

  const previousTools = Array.isArray(previousLedger.tools) ? previousLedger.tools : [];
  const previousById = new Map(previousTools.map(tool => [tool.tool_id, tool]));
  const currentById = new Map(tools.map(tool => [tool.tool_id, tool]));
  const added = tools
    .filter(tool => !previousById.has(tool.tool_id))
    .map(tool => tool.tool_id)
    .sort();
  const removed = previousTools
    .filter(tool => !currentById.has(tool.tool_id))
    .map(tool => tool.tool_id)
    .sort();
  const changedSchema = tools
    .filter(tool => {
      const previous = previousById.get(tool.tool_id);
      if (!previous) return false;
      return stableJson(previous.schema_hashes || {}) !== stableJson(tool.schema_hashes || {});
    })
    .map(tool => tool.tool_id)
    .sort();

  const tombstones = removed.map(toolId => {
    const previous = previousById.get(toolId);
    return {
      tool_id: toolId,
      service_id: previous?.service_id,
      name: previous?.name,
      previous_generated_at: previousLedger.generated_at,
      decision: 'removed_from_current_discovery',
      required_follow_up: 'Confirm intended removal or restore service/static descriptor parity before release.',
    };
  });

  return {
    previous_found: true,
    previous_generated_at: previousLedger.generated_at || null,
    previous_tool_count: previousTools.length,
    current_tool_count: tools.length,
    added_tool_ids: added,
    removed_tool_ids: removed,
    changed_schema_tool_ids: changedSchema,
    tombstones,
    summary: {
      previous_found: true,
      added_tool_count: added.length,
      removed_tool_count: removed.length,
      changed_schema_tool_count: changedSchema.length,
    },
  };
}

function serviceCounts(serviceId, tools, entries) {
  const serviceTools = tools.filter(tool => tool.service_id === serviceId);
  const serviceEntries = entries.filter(entry => entry.service_id === serviceId);
  return {
    raw_entry_count: serviceEntries.length,
    exact_tool_record_count: serviceTools.length,
    live_exact_tool_count: serviceTools.filter(tool => tool.discovery.live).length,
    static_exact_tool_count: serviceTools.filter(tool => tool.discovery.static).length,
    live_only_tool_count: serviceTools.filter(tool => tool.coverage_status === 'live_only').length,
    static_only_tool_count: serviceTools.filter(tool => tool.coverage_status === 'static_only').length,
    live_with_static_alias_count: serviceTools.filter(tool => tool.coverage_status === 'live_with_static_alias').length,
    static_alias_of_live_count: serviceTools.filter(tool => tool.coverage_status === 'static_alias_of_live').length,
    live_and_static_exact_count: serviceTools.filter(tool => tool.coverage_status === 'live_and_static_exact').length,
  };
}

function readPreviousLedger(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function renderMarkdownLedger(ledger) {
  const lines = [];
  lines.push('# SwissKnife All MCP/MCP++ Tools Ledger');
  lines.push('');
  lines.push(`Generated: ${ledger.generated_at}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Exact tool records | ${ledger.summary.exact_tool_record_count} |`);
  lines.push(`| Live exact tools | ${ledger.summary.live_exact_tool_count} |`);
  lines.push(`| Static exact tools | ${ledger.summary.static_exact_tool_count} |`);
  lines.push(`| Live only | ${ledger.summary.live_only_tool_count} |`);
  lines.push(`| Static only | ${ledger.summary.static_only_tool_count} |`);
  lines.push(`| Live with static alias | ${ledger.summary.live_with_static_alias_count} |`);
  lines.push(`| Static aliases of live tools | ${ledger.summary.static_alias_of_live_count} |`);
  lines.push(`| Exact live/static matches | ${ledger.summary.exact_live_and_static_count} |`);
  lines.push(`| Alias decisions | ${ledger.summary.alias_decision_count} |`);
  lines.push(`| Tombstones | ${ledger.summary.tombstone_count} |`);
  lines.push('');

  lines.push('## Services');
  lines.push('');
  lines.push('| Service | Base URL | Listener | HTTP tools | JSON-RPC tools | Static unique | Exact records | Live exact | Static exact |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const service of ledger.services) {
    lines.push([
      service.id,
      service.base_url,
      service.listener.reachable ? 'reachable' : 'unreachable',
      service.endpoints.tools_list.derived?.tool_count ?? 0,
      service.endpoints.mcp_json_rpc_tools_list.derived?.tool_count ?? 0,
      service.static_descriptor_pack.unique_static_name_count ?? 0,
      service.counts.exact_tool_record_count,
      service.counts.live_exact_tool_count,
      service.counts.static_exact_tool_count,
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');

  lines.push('## Category Counts');
  lines.push('');
  lines.push('| Service | Category | Total | Live | Static | Live only | Static only | Aliased static |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of Object.values(ledger.category_counts.by_service_category)
    .sort((a, b) => `${a.service_id}:${a.category}`.localeCompare(`${b.service_id}:${b.category}`))) {
    lines.push([
      row.service_id,
      row.category,
      row.total,
      row.live,
      row.static,
      row.live_only,
      row.static_only,
      row.static_alias_of_live,
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');

  lines.push('## Alias Decisions');
  lines.push('');
  if (ledger.alias_decisions.length === 0) {
    lines.push('No alias decisions were needed.');
  } else {
    lines.push('| Service | Decision | Static | Live | Reason |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const decision of ledger.alias_decisions) {
      lines.push([
        decision.service_id,
        decision.decision,
        decision.static_name,
        decision.live_name || (decision.candidate_live_tool_ids || []).join(', '),
        decision.reason,
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
  }
  lines.push('');

  lines.push('## Duplicate Decisions');
  lines.push('');
  lines.push(`- Exact multi-source records: ${ledger.duplicate_groups.exact_name_multi_source.length}`);
  lines.push(`- Unqualified-name collisions: ${ledger.duplicate_groups.unqualified_name_collisions.length}`);
  lines.push(`- Schema conflicts: ${ledger.duplicate_groups.schema_conflicts.length}`);
  lines.push('');

  lines.push('## Tombstones And Drift');
  lines.push('');
  lines.push(`Previous ledger found: ${ledger.drift_against_previous_accepted_ledger.previous_found ? 'yes' : 'no'}`);
  lines.push(`Added tools: ${ledger.drift_against_previous_accepted_ledger.summary.added_tool_count}`);
  lines.push(`Removed tools: ${ledger.drift_against_previous_accepted_ledger.summary.removed_tool_count}`);
  lines.push(`Schema changes: ${ledger.drift_against_previous_accepted_ledger.summary.changed_schema_tool_count}`);
  lines.push('');
  if (ledger.tombstones.length > 0) {
    lines.push('| Tool ID | Previous Name | Decision |');
    lines.push('| --- | --- | --- |');
    for (const tombstone of ledger.tombstones) {
      lines.push([
        tombstone.tool_id,
        tombstone.name,
        tombstone.decision,
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    lines.push('');
  }

  lines.push('## Tool Records');
  lines.push('');
  lines.push('| Service | Name | Category | Coverage | Sources | Input Hashes | Output Hashes |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const tool of ledger.tools) {
    lines.push([
      tool.service_id,
      tool.name,
      tool.category || '',
      tool.coverage_status,
      tool.sources.join(', '),
      tool.schema_hashes.input.join(', '),
      tool.schema_hashes.output.join(', '),
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function slimProbe(probe) {
  return {
    kind: probe.kind,
    url: probe.url,
    method: probe.method,
    ok: probe.ok,
    http_status: probe.http_status,
    duration_ms: probe.duration_ms,
    health_404_ignored: probe.health_404_ignored,
    payload_summary: probe.payload_summary,
    derived: probe.derived,
    error: probe.error,
  };
}

function extractToolObjects(payload) {
  const result = payload?.result;
  const candidates =
    (Array.isArray(payload?.tools) && payload.tools)
    || (Array.isArray(result?.tools) && result.tools)
    || (Array.isArray(payload) && payload)
    || [];

  return candidates
    .map(tool => typeof tool === 'string' ? { name: tool } : tool)
    .filter(tool => tool && typeof tool === 'object' && typeof tool.name === 'string' && tool.name.length > 0);
}

function extractInterfaceDescriptors(payload) {
  const result = payload?.result;
  const candidates =
    (Array.isArray(payload?.interfaces) && payload.interfaces)
    || (Array.isArray(payload?.descriptors) && payload.descriptors)
    || (Array.isArray(result?.interfaces) && result.interfaces)
    || (Array.isArray(result?.descriptors) && result.descriptors)
    || (Array.isArray(payload) && payload)
    || [];
  return candidates
    .filter(value => value && typeof value === 'object')
    .map(value => ({
      name: value.name,
      namespace: value.namespace,
      version: value.version,
      method_count: Array.isArray(value.methods) ? value.methods.length : undefined,
    }));
}

function summarizePayload(payload) {
  if (payload === null || payload === undefined) return { kind: 'empty' };
  if (typeof payload === 'string') return { kind: 'text', length: payload.length };
  if (Array.isArray(payload)) return { kind: 'array', length: payload.length };
  if (typeof payload === 'object') {
    return {
      kind: 'object',
      keys: Object.keys(payload).sort().slice(0, 20),
      tool_count: extractToolObjects(payload).length || undefined,
      interface_count: extractInterfaceDescriptors(payload).length || undefined,
    };
  }
  return { kind: typeof payload };
}

function inferCategory(serviceId, name, tool) {
  if (tool?.category) return String(tool.category);
  if (tool?.surface) return String(tool.surface);
  if (typeof name !== 'string') return 'uncategorized';
  if (name.includes('.')) return name.split('.')[0];
  if (name.startsWith('tools_')) return 'mcp_control';
  if (name.startsWith('policy_')) return 'policy';
  if (name.startsWith('interface_')) return 'interfaces';
  if (name.startsWith('compliance_')) return 'compliance';
  if (serviceId === 'ipfs_accelerate_py' && name.includes('hardware')) return 'hardware';
  return 'uncategorized';
}

function inferNamespace(name, tool) {
  if (tool?.namespace) return String(tool.namespace);
  if (typeof name === 'string' && name.includes('.')) return name.split('.').slice(0, -1).join('.');
  return undefined;
}

function inferReadOnly(name, tool, inputSchema) {
  if (tool?.read_only !== undefined) return Boolean(tool.read_only);
  const tags = Array.isArray(tool?.tags) ? tool.tags.map(tag => String(tag).toLowerCase()) : [];
  if (tags.includes('read')) return true;
  if (tags.includes('write')) return false;
  const lowered = String(name || '').toLowerCase();
  if (/(^|[._-])(get|list|read|cat|stat|status|info|version|summary|search|query|health|recommend)([._-]|$)/.test(lowered)) return true;
  if (inputSchema && Object.keys(inputSchema.properties || {}).length === 0) return true;
  return undefined;
}

function inferPolicyHint(tool) {
  const lowered = `${tool.name} ${tool.category || ''} ${tool.operation || ''}`.toLowerCase();
  if (lowered.includes('dispatch')) return 'dispatcher';
  if (/(delete|remove|rm|destroy|purge)/.test(lowered)) return 'destructive';
  if (/(inference|benchmark|accelerate|vector|index|training|workflow)/.test(lowered)) return 'heavy_compute';
  if (/(swarm|peer|connect|pubsub|search|crawl|scrape|archive|download|upload|sync)/.test(lowered)) return 'external_network';
  if (/(write|create|update|save|pin|publish|add|import|export|copy|move|mkdir|touch|configure|register|backup|restore)/.test(lowered)) return 'write';
  if (tool.read_only === true) return 'read';
  return 'unknown';
}

function buildSchemaSummary(inputSchema, outputSchema) {
  return {
    input_properties: Object.keys(inputSchema?.properties || {}).sort(),
    input_required: Array.isArray(inputSchema?.required) ? [...inputSchema.required].sort() : [],
    output_properties: Object.keys(outputSchema?.properties || {}).sort(),
    output_required: Array.isArray(outputSchema?.required) ? [...outputSchema.required].sort() : [],
  };
}

function categoryFromNamespace(namespace) {
  if (typeof namespace !== 'string') return undefined;
  const parts = namespace.split('/');
  return parts.length > 1 ? parts[1] : undefined;
}

function unqualifiedName(name) {
  return String(name).split('.').pop();
}

function normalizeAliasName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function compareTools(a, b) {
  return `${a.service_id}:${a.name}`.localeCompare(`${b.service_id}:${b.name}`);
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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

function hashValue(value) {
  if (value === undefined || value === null) return null;
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(value => typeof value === 'string' && value.length > 0)));
}

function addUnique(target, value) {
  if (typeof value === 'string' && value.length > 0 && !target.includes(value)) target.push(value);
}

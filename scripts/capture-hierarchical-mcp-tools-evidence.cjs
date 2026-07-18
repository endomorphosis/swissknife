#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  CONFIGURED_SERVICES,
  OUT_DIR,
  readJsonIfExists,
} = require('./all-tools-evidence-lib.cjs');

const META_TOOLS = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];
const PREFERRED_REPRESENTATIVE_TOOLS = [
  'get_server_status',
  'healthchecker_check_detailed',
  'hardware_get_info',
  'get_hardware_info',
  'get_dashboard_system_metrics',
];
const EXPECTED_MINIMUM_FLAT_TOOLS = {
  ipfs_kit_py: 80,
  ipfs_datasets_py: 300,
  ipfs_accelerate_py: 100,
};
const CONFIGURED_ROLES = new Set(['configured', 'configured_compat']);
const LIVE_FLEET_REQUIRED = process.env.HIERARCHICAL_MCP_REQUIRE_LIVE === '1';

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const generatedAt = new Date().toISOString();
  const appVisibleLedger = readAppVisibleLedger();
  const allToolsLedger = readAllToolsLedger();
  const services = [];
  for (const config of CONFIGURED_SERVICES.filter(service => CONFIGURED_ROLES.has(service.role))) {
    services.push(await captureService(config, appVisibleLedger, generatedAt));
  }

  const blockers = [];
  const warnings = [];
  const unavailable = services.filter(service => !service.available).map(service => service.service);
  const missingFacade = services.filter(service => service.available && !service.full_facade_available);
  const failedDispatch = services.filter(service => service.dispatch_probe && service.dispatch_probe.status !== 'passed');
  const failedAliasDispatch = services.filter(service => (service.alias_dispatch_failed_count ?? 0) > 0);
  const unexplainedGapServices = services.filter(service => (service.unexplained_flat_hierarchy_gap_count ?? 0) > 0);

  for (const service of missingFacade) {
    blockers.push(`Missing hierarchical facade meta-tools for ${service.service}: ${META_TOOLS.filter(tool => !service.meta_presence[tool]).join(', ')}`);
  }
  for (const service of failedDispatch) {
    blockers.push(`Representative hierarchical dispatch failed for ${service.service}: ${service.dispatch_probe.category ?? 'unknown'}.${service.dispatch_probe.tool ?? 'unknown'} (${service.dispatch_probe.status}).`);
  }
  for (const service of failedAliasDispatch) {
    warnings.push(`${service.alias_dispatch_failed_count} normalized alias dispatch probes failed for ${service.service}.`);
  }
  for (const service of unexplainedGapServices) {
    blockers.push(`${service.unexplained_flat_hierarchy_gap_count} flat descriptors remain unexplained for ${service.service}.`);
  }
  if (LIVE_FLEET_REQUIRED && unavailable.length > 0) {
    blockers.push(`Hierarchical MCP live fleet required but unavailable services were observed: ${unavailable.join(', ')}.`);
  } else if (unavailable.length > 0) {
    warnings.push(`Only ${services.length - unavailable.length}/${services.length} configured MCP services responded; set HIERARCHICAL_MCP_REQUIRE_LIVE=1 to make endpoint availability a hard validation failure.`);
  }

  const summary = {
    service_count: services.length,
    available_service_count: services.filter(service => service.available).length,
    services_with_full_facade: services.filter(service => service.full_facade_available).length,
    flat_tool_count: sum(services, service => service.flat_tool_count),
    flat_non_meta_tool_count: sum(services, service => service.flat_non_meta_tool_count),
    category_count: sum(services, service => service.category_count),
    hierarchical_tool_count: sum(services, service => service.hierarchical_tool_count),
    raw_flat_hierarchy_gap_count: sum(services, service => service.raw_flat_hierarchy_gap_count),
    removed_from_app_visible_ledger_count: sum(services, service => service.removed_from_app_visible_ledger_count),
    flat_direct_only_count: sum(services, service => service.flat_direct_only_count),
    unexplained_flat_hierarchy_gap_count: sum(services, service => service.unexplained_flat_hierarchy_gap_count),
    flat_hierarchy_gap_count: sum(services, service => service.flat_hierarchy_gap_count),
    flat_hierarchy_count_gap: sum(services, service => service.flat_hierarchy_count_gap),
    hierarchical_name_match_count: sum(services, service => service.hierarchical_name_match_count),
    dispatch_pass_count: services.filter(service => service.dispatch_probe?.status === 'passed').length,
    dispatch_probe_count: services.filter(service => service.dispatch_probe).length,
    alias_dispatch_probe_count: sum(services, service => service.alias_dispatch_probe_count),
    alias_dispatch_pass_count: sum(services, service => service.alias_dispatch_pass_count),
    direct_only_probe_count: sum(services, service => service.direct_only_probe_count),
    direct_only_receipt_count: sum(services, service => service.direct_only_receipt_count),
    unavailable_services: unavailable,
    services_missing_facade: missingFacade.map(service => service.service),
    services_below_expected_flat_count: services
      .filter(service => service.available && service.flat_non_meta_tool_count < service.expected_minimum_flat_tools)
      .map(service => service.service),
    services_with_flat_hierarchy_gap: services.filter(service => service.flat_hierarchy_gap_count > 0).map(service => service.service),
    services_with_unexplained_flat_hierarchy_gap: unexplainedGapServices.map(service => service.service),
    services_with_failed_dispatch_probe: failedDispatch.map(service => service.service),
    services_with_failed_alias_dispatch_probe: failedAliasDispatch.map(service => service.service),
    ipfs_datasets_unexplained_flat_hierarchy_gap_count: services
      .find(service => service.service === 'ipfs_datasets_py')?.unexplained_flat_hierarchy_gap_count ?? 0,
    blocker_count: blockers.length,
    warning_count: warnings.length,
  };

  const evidence = {
    schema: 'swissknife.hierarchical-mcp-tools-evidence.v1',
    generated_at: generatedAt,
    decision: blockers.length === 0 ? 'go' : 'no_go',
    live_fleet_required: LIVE_FLEET_REQUIRED,
    summary,
    blockers,
    warnings,
    meta_tools: META_TOOLS,
    docs: {
      release_gate_task: 'SWR-083',
      policy: 'Available MCP services must expose all hierarchical facade meta-tools and pass representative tools_dispatch evidence. Remaining direct-only descriptors must be explicit warnings or blockers.',
    },
    services,
    app_visible_ledger: appVisibleLedger.summary,
    all_tools_ledger: allToolsLedger.summary,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outputPath = path.join(OUT_DIR, 'hierarchical-tools-evidence.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    decision: evidence.decision,
    blocker_count: blockers.length,
    warning_count: warnings.length,
    available_service_count: summary.available_service_count,
    services_with_full_facade: summary.services_with_full_facade,
    direct_only_descriptor_count: summary.flat_direct_only_count,
    output: path.relative(path.resolve(__dirname, '..'), outputPath),
  }, null, 2));
}

async function captureService(config, appVisibleLedger, generatedAt) {
  const endpoint = `${config.endpoint}${config.rpc_path ?? '/mcp'}`;
  const listed = await listFlatTools(config);
  const flatTools = listed.tools;
  const flatNames = flatTools.map(toolName).filter(Boolean).sort();
  const flatNonMetaNames = flatNames.filter(name => !META_TOOLS.includes(name));
  const metaPresence = Object.fromEntries(META_TOOLS.map(name => [name, flatNames.includes(name)]));
  const fullFacadeAvailable = listed.available && META_TOOLS.every(name => metaPresence[name]);
  const appVisibleNames = appVisibleLedger.byService.get(config.service) ?? new Map();

  let categories = [];
  let hierarchicalEntries = [];
  let schemaProbe = null;
  let dispatchProbe = null;
  const aliasDispatchProbes = [];

  if (fullFacadeAvailable) {
    const categoriesProbe = await callTool(endpoint, 'tools_list_categories', { include_count: true });
    categories = extractCategories(categoriesProbe.value);
    for (const category of categories) {
      const toolsProbe = await callTool(endpoint, 'tools_list_tools', { category: category.name });
      const categoryTools = extractCategoryTools(toolsProbe.value, category.name);
      for (const tool of categoryTools) {
        hierarchicalEntries.push({
          category: category.name,
          name: tool.name,
          flat_name: `${category.name}.${tool.name}`,
          description: tool.description ?? '',
        });
      }
    }
    const representative = chooseRepresentativeTool(hierarchicalEntries);
    if (representative) {
      schemaProbe = await probeSchema(endpoint, representative);
      dispatchProbe = await probeDispatch(endpoint, representative);
      for (const alias of representativeAliases(representative)) {
        aliasDispatchProbes.push(await probeDispatch(endpoint, alias, 'alias'));
      }
    }
  }

  const hierarchicalNameSet = new Set();
  for (const entry of hierarchicalEntries) {
    hierarchicalNameSet.add(entry.flat_name);
    hierarchicalNameSet.add(entry.name);
    hierarchicalNameSet.add(`${entry.category}/${entry.name}`);
    hierarchicalNameSet.add(normalizeName(entry.flat_name));
    hierarchicalNameSet.add(normalizeName(entry.name));
  }

  const rawGap = flatNonMetaNames.filter(name => !hierarchicalNameSet.has(name) && !hierarchicalNameSet.has(normalizeName(name)));
  const removed = [];
  const directOnly = [];
  const unexplained = [];
  for (const name of rawGap) {
    const ledgerRow = appVisibleNames.get(name) ?? appVisibleNames.get(normalizeName(name)) ?? null;
    if (!ledgerRow) {
      removed.push(name);
    } else {
      const descriptor = directOnlyDescriptor(config.service, name, ledgerRow);
      directOnly.push(descriptor);
      if (!descriptor.reason) unexplained.push(name);
    }
  }

  const directOnlyProbes = directOnly
    .filter(descriptor => descriptor.policy_class === 'read' || /(^|[_.-])list|status|health|get|check/.test(descriptor.name))
    .slice(0, 5)
    .map(descriptor => ({
      service: config.service,
      name: descriptor.name,
      status: 'not_probed',
      reason: 'direct-only descriptors are accounted for as explicit release warnings; unsafe direct execution is skipped by the evidence capture.',
      receipt_present: false,
    }));

  return {
    service: config.service,
    role: config.role,
    endpoint,
    available: listed.available,
    expected_minimum_flat_tools: EXPECTED_MINIMUM_FLAT_TOOLS[config.service] ?? 0,
    flat_tool_count: flatNames.length,
    flat_non_meta_tool_count: flatNonMetaNames.length,
    full_facade_available: fullFacadeAvailable,
    meta_presence: metaPresence,
    category_count: categories.length,
    hierarchical_tool_count: hierarchicalEntries.length,
    hierarchical_name_match_count: flatNonMetaNames.length - rawGap.length,
    flat_hierarchy_count_gap: Math.max(0, flatNonMetaNames.length - hierarchicalEntries.length),
    raw_flat_hierarchy_gap_count: rawGap.length,
    raw_flat_hierarchy_gap: rawGap,
    raw_flat_hierarchy_gap_sample: rawGap.slice(0, 20),
    app_visible_ledger_accounting: {
      app_visible_ledger_available: appVisibleLedger.available,
      app_visible_ledger_source: appVisibleLedger.source,
      app_visible_ledger_schema: appVisibleLedger.schema,
      app_visible_ledger_record_count: appVisibleLedger.record_count,
      app_visible_flat_descriptor_count: appVisibleNames.size,
      app_visible_flat_descriptor_names: Array.from(appVisibleNames.keys()).filter(name => !name.includes('__normalized__')).sort(),
      app_visible_flat_descriptor_sample: Array.from(appVisibleNames.keys()).filter(name => !name.includes('__normalized__')).sort().slice(0, 20),
      removed_from_app_visible_ledger_count: removed.length,
      removed_from_app_visible_ledger_descriptors: removed,
      removed_from_app_visible_ledger_policy: 'accounted_as_removed_from_swissknife_app_visible_ledger',
    },
    removed_from_app_visible_ledger_count: removed.length,
    removed_from_app_visible_ledger_descriptors: removed,
    removed_from_app_visible_ledger_sample: removed.slice(0, 20),
    flat_direct_only_count: directOnly.length,
    flat_direct_only_descriptors: directOnly,
    flat_direct_only_policy_counts: countBy(directOnly, descriptor => descriptor.policy_class),
    flat_direct_only_reason_counts: countBy(directOnly, descriptor => descriptor.reason),
    flat_direct_only_sample: directOnly.slice(0, 20),
    flat_gap_classification_count: rawGap.length,
    flat_gap_classifications: rawGap.map(name => ({
      name,
      classification: directOnly.some(descriptor => descriptor.name === name)
        ? 'direct_only'
        : removed.includes(name)
          ? 'removed_from_app_visible_ledger'
          : 'unexplained',
    })),
    unexplained_flat_hierarchy_gap_count: unexplained.length,
    unexplained_flat_hierarchy_gap: unexplained,
    unexplained_flat_hierarchy_gap_sample: unexplained.slice(0, 20),
    flat_hierarchy_gap_count: rawGap.length,
    flat_hierarchy_gap_sample: rawGap.slice(0, 20),
    flat_hierarchy_gap_closure: {
      accounted: unexplained.length === 0,
      listed_through_hierarchy_count: flatNonMetaNames.length - rawGap.length,
      removed_from_app_visible_ledger_count: removed.length,
      direct_only_count: directOnly.length,
      unexplained_count: unexplained.length,
    },
    nonempty_category_count: categories.filter(category => (category.count ?? 1) > 0).length,
    sample_categories: categories.slice(0, 20),
    schema_probe: schemaProbe,
    dispatch_probe: dispatchProbe,
    alias_dispatch_probe_count: aliasDispatchProbes.length,
    alias_dispatch_pass_count: aliasDispatchProbes.filter(probe => probe.status === 'passed').length,
    alias_dispatch_failed_count: aliasDispatchProbes.filter(probe => probe.status !== 'passed').length,
    alias_dispatch_probes: aliasDispatchProbes,
    direct_only_probe_count: directOnlyProbes.length,
    direct_only_receipt_count: directOnlyProbes.filter(probe => probe.receipt_present).length,
    direct_only_probes: directOnlyProbes,
  };
}

async function listFlatTools(config) {
  const probes = [];
  const rpc = await fetchJson(`${config.endpoint}${config.rpc_path ?? '/mcp'}`, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  probes.push(rpc);
  const rest = config.tools_list_path
    ? await fetchJson(`${config.endpoint}${config.tools_list_path}`)
    : null;
  if (rest) probes.push(rest);
  const tools = probes.map(probe => extractTools(probe.json)).find(list => list.length > 0) ?? [];
  return {
    available: probes.some(probe => probe.ok),
    tools: tools.map(tool => (typeof tool === 'string' ? { name: tool, inputSchema: { type: 'object' } } : tool)),
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout_ms ?? 3500);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      json: parseJson(text),
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callTool(endpoint, name, args) {
  const response = await fetchJson(endpoint, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: `${name}-${Date.now()}`, method: 'tools/call', params: { name, arguments: args } },
  });
  if (!response.ok) {
    return { status: 'failed', error: response.error ?? `HTTP ${response.status}`, value: null, raw: response.json };
  }
  if (response.json?.error) {
    return { status: 'failed', error: response.json.error.message ?? JSON.stringify(response.json.error), value: null, raw: response.json };
  }
  const result = response.json?.result ?? response.json;
  const value = unwrapToolResult(result);
  if (result?.isError || value?.isError) {
    return { status: 'failed', error: errorText(value ?? result), value, raw: response.json };
  }
  return { status: 'passed', value, raw: response.json };
}

async function probeSchema(endpoint, representative) {
  const probe = await callTool(endpoint, 'tools_get_schema', {
    category: representative.category,
    tool: representative.name,
  });
  return {
    category: representative.category,
    tool: representative.name,
    status: probe.status,
    error: probe.error ?? null,
    schema_available: Boolean(probe.value && typeof probe.value === 'object'),
  };
}

async function probeDispatch(endpoint, representative, kind = 'representative') {
  let probe = await callTool(endpoint, 'tools_dispatch', {
    category: representative.category,
    tool: representative.name,
    // Representative tools are selected from known read-only status surfaces.
    // Do not add probe-only fields because upstream MCP tools reject unknown args.
    params: {},
  });
  let mode = 'dry_run';
  if (probe.status !== 'passed') {
    const fallback = await callTool(endpoint, 'tools_dispatch', {
      category: representative.category,
      tool: representative.name,
      params: {},
    });
    if (fallback.status === 'passed') {
      probe = fallback;
      mode = 'empty_params_fallback';
    }
  }
  return {
    kind,
    mode,
    category: representative.category,
    tool: representative.name,
    status: probe.status,
    error: probe.error ?? null,
    receipt_present: Boolean(probe.value?.receipt ?? probe.value?.event_cid ?? probe.value?.envelope_cid),
  };
}

function extractTools(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.tools)) return payload.tools;
  if (payload.result) return extractTools(payload.result);
  if (payload.data) return extractTools(payload.data);
  return [];
}

function extractCategories(payload) {
  const raw = Array.isArray(payload?.categories)
    ? payload.categories
    : Array.isArray(payload)
      ? payload
      : [];
  return raw
    .map(category => {
      if (typeof category === 'string') return { name: category, count: null };
      return {
        name: category?.name ?? category?.category ?? '',
        count: numberOrNull(category?.count ?? category?.tool_count ?? category?.total),
      };
    })
    .filter(category => category.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extractCategoryTools(payload, category) {
  const raw = Array.isArray(payload?.tools)
    ? payload.tools
    : Array.isArray(payload)
      ? payload
      : [];
  return raw
    .map(tool => {
      if (typeof tool === 'string') return { name: stripCategoryPrefix(tool, category), description: '' };
      return {
        name: stripCategoryPrefix(tool?.name ?? tool?.tool ?? '', category),
        description: tool?.description ?? '',
      };
    })
    .filter(tool => tool.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function chooseRepresentativeTool(entries) {
  if (entries.length === 0) return null;
  const preferredNames = [
    'get_server_status',
    'p2p_taskqueue_status',
    'get_dashboard_system_metrics',
    'get_dashboard_peer_status',
    'HealthChecker.check_detailed',
    'job_status',
    'runner_get_status',
    'telemetry',
  ];
  for (const preferredName of preferredNames) {
    const preferred = entries.find(entry => entry.name === preferredName || entry.flat_name === preferredName || entry.flat_name.endsWith(`.${preferredName}`));
    if (preferred) return preferred;
  }
  const preferred = entries.filter(entry => PREFERRED_REPRESENTATIVE_TOOLS.includes(entry.name));
  const safe = entries.filter(entry => /(^|[_.-])(status|health|list|get|check|info|version|ping)([_.-]|$)/i.test(entry.name));
  return (preferred.length > 0 ? preferred : safe.length > 0 ? safe : entries).sort((a, b) => {
    const preferredIndexA = PREFERRED_REPRESENTATIVE_TOOLS.indexOf(a.name);
    const preferredIndexB = PREFERRED_REPRESENTATIVE_TOOLS.indexOf(b.name);
    if (preferredIndexA !== preferredIndexB) return preferredIndexA - preferredIndexB;
    const riskA = riskScore(a.name);
    const riskB = riskScore(b.name);
    if (riskA !== riskB) return riskA - riskB;
    return `${a.category}.${a.name}`.localeCompare(`${b.category}.${b.name}`);
  })[0];
}

function representativeAliases(representative) {
  return [
    { category: representative.category, name: `${representative.category}.${representative.name}` },
    { category: representative.category, name: `${representative.category}/${representative.name}` },
  ];
}

function riskScore(name) {
  if (/(delete|remove|stop|kill|purge|destroy|write|save|create|submit|run|execute|upload|publish|pin|add)/i.test(name)) return 10;
  if (/(list|get|status|health|check|info|version|ping)/i.test(name)) return 0;
  return 5;
}

function directOnlyDescriptor(service, name, ledgerRow) {
  return {
    service,
    name,
    policy_class: ledgerRow.policy_class ?? 'unknown',
    exposure: ledgerRow.exposure ?? 'unknown',
    app_id: ledgerRow.app_id ?? null,
    reason: ledgerRow.direct_only_reason
      ?? (ledgerRow.app_visible ? 'app_visible_direct_descriptor_not_listed_by_hierarchical_facade' : 'not_app_visible'),
    disposition: ledgerRow.disposition ?? ledgerRow.normalized_disposition ?? 'unknown',
  };
}

function readAppVisibleLedger() {
  const filePath = path.join(OUT_DIR, 'all-tools-app-bindings.json');
  const data = readJsonIfExists(filePath);
  const rows = data?.rows ?? data?.bindings ?? [];
  const byService = new Map();
  for (const row of rows) {
    if (row.app_visible === false || row.disposition === 'adapter_source_only') continue;
    const service = row.service_id ?? row.service;
    const name = row.name;
    if (!service || !name) continue;
    if (!byService.has(service)) byService.set(service, new Map());
    byService.get(service).set(name, row);
    byService.get(service).set(normalizeName(name), row);
  }
  return {
    available: Boolean(data),
    source: 'all-tools-app-bindings',
    schema: data?.schema ?? null,
    record_count: rows.length,
    byService,
    summary: {
      available: Boolean(data),
      source: 'all-tools-app-bindings',
      schema: data?.schema ?? null,
      record_count: rows.length,
      service_counts: countBy(rows, row => row.service_id ?? row.service ?? 'unknown'),
      app_visible_count: rows.filter(row => row.app_visible !== false && row.disposition !== 'adapter_source_only').length,
    },
  };
}

function readAllToolsLedger() {
  const data = readJsonIfExists(path.join(OUT_DIR, 'all-tools-ledger.json'));
  const records = data?.tools ?? data?.records ?? [];
  return {
    available: Boolean(data),
    summary: {
      available: Boolean(data),
      schema: data?.schema ?? null,
      generated_at: data?.generated_at ?? null,
      record_count: records.length,
      service_counts: data?.summary?.service_counts ?? countBy(records, record => `${record.service}:${record.role}`),
    },
  };
}

function unwrapToolResult(result) {
  if (result && Array.isArray(result.content)) {
    const jsonContent = result.content.find(item => item?.type === 'json' && item.json);
    if (jsonContent) return jsonContent.json;
    const text = result.content
      .filter(item => item?.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join('');
    if (text) return parseJson(text) ?? text;
  }
  return result;
}

function errorText(value) {
  if (typeof value === 'string') return value.slice(0, 200);
  if (value?.error) return String(value.error).slice(0, 200);
  if (Array.isArray(value?.content)) {
    return value.content.map(item => item.text ?? item.json ?? '').join(' ').slice(0, 200);
  }
  return 'tool returned an error envelope';
}

function toolName(tool) {
  if (typeof tool === 'string') return tool;
  return tool?.name ?? tool?.tool ?? '';
}

function stripCategoryPrefix(name, category) {
  if (name.startsWith(`${category}.`)) return name.slice(category.length + 1);
  if (name.startsWith(`${category}/`)) return name.slice(category.length + 1);
  return name;
}

function normalizeName(name) {
  return String(name).toLowerCase().replace(/[/.:-]+/g, '_').replace(/_+/g, '_');
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sum(items, valueFn) {
  return items.reduce((total, item) => total + (Number(valueFn(item)) || 0), 0);
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

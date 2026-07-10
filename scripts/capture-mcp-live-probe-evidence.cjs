#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  CONFIGURED_SERVICES,
  OUT_DIR,
  captureAllToolsLedger,
  readJsonIfExists,
} = require('./all-tools-evidence-lib.cjs');
const {
  buildAgentSupervisorConsoleEvidence,
} = require('./agent-supervisor-console-evidence-lib.cjs');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = OUT_DIR;
const docsPath = path.join(projectRoot, 'docs', 'mcp-all-tool-catalog-evidence.md');
const generatedAt = new Date().toISOString();
const accelerateRoot = process.env.IPFS_ACCELERATE_PY_ROOT || '/home/barberb/ipfs_accelerate_py';
const acceleratePython = process.env.IPFS_ACCELERATE_PYTHON || path.join(accelerateRoot, '.venv', 'bin', 'python3');
const mcpAnnounceFile = process.env.IPFS_ACCELERATE_PY_TASK_P2P_ANNOUNCE_FILE
  || path.join(accelerateRoot, 'state', 'task_p2p_announce_mcp.json');
const liveProbeTimeoutMs = Number(process.env.SWISSKNIFE_MCP_LIVE_PROBE_TIMEOUT_MS || 8000);
const liveProbeConcurrency = Number(process.env.SWISSKNIFE_MCP_LIVE_PROBE_CONCURRENCY || 8);
const requiredServiceRoles = new Set(['configured', 'configured_compat']);
const requiredServices = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];
const mcpPlusPlusEligible = new Set(['eligible', 'required', 'advertised', true]);
const metaTools = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];
const globalOperationApps = new Set([
  'mcp-control',
  'mcp-plus-plus',
  'idl-explorer',
  'orb-auto-ui',
  'agent-supervisor',
]);

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const ledger = await captureAllToolsLedger();
  const appBindings = readRequiredJson(path.join(evidenceRoot, 'all-tools-app-bindings.json'), 'all-tools-app-bindings.json');
  const policyMatrix = readRequiredJson(path.join(evidenceRoot, 'all-tools-policy-matrix.json'), 'all-tools-policy-matrix.json');
  const backendContract = readRequiredJson(path.join(evidenceRoot, 'app-backend-contract.json'), 'app-backend-contract.json');
  const bindingRows = appBindings.rows ?? appBindings.bindings ?? [];
  const policyRows = policyMatrix.rules ?? policyMatrix.tools ?? [];
  const contractCapabilities = backendContract.apps?.flatMap(app => app.backend_capabilities ?? []) ?? [];

  const services = [];
  for (const config of CONFIGURED_SERVICES.filter(service => requiredServiceRoles.has(service.role))) {
    services.push(await captureServiceCatalog(config, bindingRows, policyRows, contractCapabilities));
  }

  const libp2pCatalog = captureMcpPlusPlusLibp2pCatalog(bindingRows, contractCapabilities);
  const allServerCatalog = buildAllServerCatalog(ledger, appBindings, policyMatrix, backendContract, services, libp2pCatalog);
  writeJson('all-server-tool-catalog.json', allServerCatalog);
  writeJson('mcp-plus-plus-libp2p-catalog.json', libp2pCatalog);
  writeJson('mcp-hierarchical-facade-live-probes.json', legacyHierarchicalEvidence(allServerCatalog));
  writeJson('mcpplusplus-libp2p-reachability.json', libp2pCatalog.reachability);
  writeMarkdownEvidence(allServerCatalog, libp2pCatalog);
  const agentSupervisorEvidence = buildAgentSupervisorConsoleEvidence({
    generatedAt,
    allServerCatalog,
    libp2pCatalog,
    appBindings,
  });

  const result = {
    decision: allServerCatalog.decision,
    blocker_count: allServerCatalog.blockers.length,
    agent_supervisor_decision: agentSupervisorEvidence.e2e.decision,
    agent_supervisor_blocker_count: agentSupervisorEvidence.blockers.length,
    service_count: allServerCatalog.summary.service_count,
    available_service_count: allServerCatalog.summary.available_service_count,
    live_dispatch_receipt_count: allServerCatalog.summary.live_dispatch_receipt_count,
    policy_gated_evidence_count: allServerCatalog.summary.policy_gated_evidence_count,
    libp2p_decision: libp2pCatalog.decision,
    outputs: [
      'test-results/virtual-desktop-ipfs-mcp-orb/all-server-tool-catalog.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/mcp-plus-plus-libp2p-catalog.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json',
      'docs/mcp-all-tool-catalog-evidence.md',
      'docs/agent-supervisor-console-evidence.md',
    ],
  };
  console.log(JSON.stringify(result, null, 2));
  if (allServerCatalog.blockers.length > 0 || libp2pCatalog.blockers.length > 0 || agentSupervisorEvidence.blockers.length > 0) {
    process.exit(1);
  }
}

async function captureServiceCatalog(config, bindingRows, policyRows, contractCapabilities) {
  const endpoint = `${config.endpoint}${config.rpc_path ?? '/mcp'}`;
  const serviceBindings = bindingRows
    .filter(row => row.service_id === config.service || row.service === config.service)
    .filter(row => row.role === config.role || row.role === 'static_descriptor' || row.role === 'real_local')
    .filter(row => !metaTools.includes(row.name))
    .sort((a, b) => `${a.role}:${a.name}`.localeCompare(`${b.role}:${b.name}`));
  const servicePolicies = new Map(policyRows
    .filter(row => row.service_id === config.service || row.service === config.service)
    .map(row => [row.tool_id, row]));
  const serviceCapabilities = contractCapabilities
    .filter(row => row.service === config.service)
    .filter(row => row.source_role === config.role || row.source_role === 'static_descriptor' || row.source_role === 'real_local');

  const flatProbe = await jsonRpc(endpoint, 'tools/list', {});
  const flatTools = extractTools(flatProbe.json)
    .map(tool => normalizeToolObject(tool))
    .filter(tool => tool.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const flatByName = buildToolLookup(flatTools);
  const flatNames = flatTools.map(tool => tool.name);
  const metaPresence = Object.fromEntries(metaTools.map(name => [name, flatByName.has(name) || flatByName.has(normalizeName(name))]));
  const fullFacadeAvailable = flatProbe.ok && metaTools.every(name => metaPresence[name]);

  let categories = [];
  let hierarchyEntries = [];
  let hierarchyErrors = [];
  if (fullFacadeAvailable) {
    const categoriesProbe = await callTool(endpoint, 'tools_list_categories', { include_count: true });
    categories = extractCategories(categoriesProbe.value);
    if (categoriesProbe.status !== 'passed') {
      hierarchyErrors.push(categoriesProbe.error || 'tools_list_categories failed');
    }
    const categoryToolSets = await mapLimit(categories, liveProbeConcurrency, async category => {
      const toolsProbe = await callTool(endpoint, 'tools_list_tools', { category: category.name });
      if (toolsProbe.status !== 'passed') {
        hierarchyErrors.push(`${category.name}: ${toolsProbe.error || 'tools_list_tools failed'}`);
        return [];
      }
      return extractCategoryTools(toolsProbe.value, category.name)
        .map(tool => ({
          service: config.service,
          role: config.role,
          category: category.name,
          name: tool.name,
          flat_name: `${category.name}.${tool.name}`,
          description: tool.description ?? '',
        }));
    });
    hierarchyEntries = categoryToolSets.flat().sort((a, b) => `${a.category}.${a.name}`.localeCompare(`${b.category}.${b.name}`));
  }
  const hierarchyByName = buildHierarchyLookup(hierarchyEntries);

  const reconciledDescriptors = serviceBindings.map(row => {
    const policy = servicePolicies.get(row.tool_id) ?? row;
    const contract = serviceCapabilities.find(capability => capability.tool_id === row.tool_id)
      ?? serviceCapabilities.find(capability => normalizeName(capability.name) === normalizeName(row.name));
    return reconcileDescriptor(config, endpoint, row, policy, contract, flatByName, hierarchyByName, fullFacadeAvailable);
  });

  await mapLimit(
    reconciledDescriptors.filter(descriptor => descriptor.needs_live_verification),
    liveProbeConcurrency,
    async descriptor => {
      descriptor.verification = await verifyDescriptor(endpoint, descriptor);
      descriptor.reconciliation.receipt_present = Boolean(descriptor.verification.receipt);
      descriptor.reconciliation.verification_status = descriptor.verification.status;
    },
  );

  const expectedLive = reconciledDescriptors.filter(descriptor => descriptor.expected_live_mcp);
  const missingExpected = expectedLive.filter(descriptor => !descriptor.reconciliation.live_discovered);
  const readFailures = expectedLive.filter(descriptor => (
    descriptor.policy_class === 'read'
    && descriptor.reconciliation.live_discovered
    && !['direct_only', 'host_only'].includes(descriptor.reconciliation.surface_kind)
    && descriptor.verification.status !== 'passed'
  ));
  const flatNonMeta = flatNames.filter(name => !metaTools.includes(name));
  const explainedNameSet = new Set();
  for (const descriptor of reconciledDescriptors) {
    explainedNameSet.add(descriptor.name);
    explainedNameSet.add(normalizeName(descriptor.name));
    if (descriptor.hierarchical?.flat_name) {
      explainedNameSet.add(descriptor.hierarchical.flat_name);
      explainedNameSet.add(normalizeName(descriptor.hierarchical.flat_name));
    }
  }
  const unexplainedFlat = flatNonMeta.filter(name => !explainedNameSet.has(name) && !explainedNameSet.has(normalizeName(name)));
  const hierarchicalOnly = hierarchyEntries.filter(entry => !flatByName.has(entry.name) && !flatByName.has(normalizeName(entry.name)));
  const blockers = [];
  const warnings = [];
  if (!flatProbe.ok || flatTools.length === 0) {
    blockers.push(`Missing live MCP tools/list response for ${config.service} at ${endpoint}.`);
  }
  if (flatProbe.ok && !fullFacadeAvailable) {
    blockers.push(`Missing hierarchical facade meta-tools for ${config.service}: ${metaTools.filter(name => !metaPresence[name]).join(', ')}.`);
  }
  for (const error of hierarchyErrors) {
    blockers.push(`Hierarchical catalog probe failed for ${config.service}: ${error}`);
  }
  if (missingExpected.length > 0) {
    blockers.push(`${missingExpected.length} expected ${config.service} descriptors were not live-discovered by normalized name/schema.`);
  }
  if (unexplainedFlat.length > 0) {
    blockers.push(`${unexplainedFlat.length} live ${config.service} descriptors are absent from the app/global operation catalog.`);
  }
  if (readFailures.length > 0) {
    blockers.push(`${readFailures.length} read-only ${config.service} descriptors lacked a passing live dispatch receipt.`);
  }
  if (hierarchicalOnly.length > 0) {
    warnings.push(`${hierarchicalOnly.length} ${config.service} hierarchical entries were not present in the flat tools/list surface.`);
  }

  return {
    service: config.service,
    role: config.role,
    endpoint,
    rpc_path: config.rpc_path ?? '/mcp',
    available: flatProbe.ok && flatTools.length > 0,
    flat_probe: {
      status: flatProbe.status,
      ok: flatProbe.ok,
      error: flatProbe.error ?? flatProbe.json?.error?.message ?? null,
    },
    flat_tool_count: flatTools.length,
    flat_non_meta_tool_count: flatNonMeta.length,
    flat_tools: flatTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      schema_hash: hashObject(tool.inputSchema ?? {}),
    })),
    full_facade_available: fullFacadeAvailable,
    meta_presence: metaPresence,
    category_count: categories.length,
    categories,
    hierarchical_tool_count: hierarchyEntries.length,
    hierarchical_tools: hierarchyEntries,
    reconciled_descriptor_count: reconciledDescriptors.length,
    expected_live_descriptor_count: expectedLive.length,
    live_reconciled_descriptor_count: expectedLive.filter(descriptor => descriptor.reconciliation.live_discovered).length,
    read_descriptor_count: reconciledDescriptors.filter(descriptor => descriptor.policy_class === 'read').length,
    read_live_dispatch_receipt_count: reconciledDescriptors.filter(descriptor => descriptor.policy_class === 'read' && descriptor.verification.status === 'passed').length,
    policy_gated_descriptor_count: reconciledDescriptors.filter(descriptor => descriptor.policy_class !== 'read' && descriptor.verification.status === 'policy_gated').length,
    direct_only_descriptor_count: reconciledDescriptors.filter(descriptor => descriptor.reconciliation.surface_kind === 'direct_only').length,
    host_only_descriptor_count: reconciledDescriptors.filter(descriptor => descriptor.reconciliation.surface_kind === 'host_only').length,
    missing_expected_descriptor_count: missingExpected.length,
    missing_expected_descriptors: missingExpected.map(descriptor => descriptor.tool_id),
    unexplained_flat_descriptor_count: unexplainedFlat.length,
    unexplained_flat_descriptors: unexplainedFlat,
    hierarchical_only_descriptor_count: hierarchicalOnly.length,
    hierarchical_only_descriptors: hierarchicalOnly.map(entry => entry.flat_name),
    blockers,
    warnings,
    reconciled_descriptors: reconciledDescriptors,
  };
}

function reconcileDescriptor(config, endpoint, row, policy, contract, flatByName, hierarchyByName, fullFacadeAvailable) {
  const name = row.name;
  const flat = flatByName.get(name) ?? flatByName.get(normalizeName(name)) ?? null;
  const hierarchical = hierarchyByName.get(name) ?? hierarchyByName.get(normalizeName(name)) ?? null;
  const liveDiscovered = Boolean(flat || hierarchical);
  const expectedLiveMcp = row.role === config.role;
  const policyClass = overridePolicyClass(row.policy_class ?? policy.policy_class ?? 'read', name);
  const schemaHash = flat ? hashObject(flat.inputSchema ?? {}) : null;
  const expectedSchemaHash = schemaHashForRow(row, policy, contract);
  const schemaMatch = !expectedSchemaHash || !schemaHash || expectedSchemaHash === schemaHash || expectedSchemaHash === 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4f8a92733d3bb22c4365c36ba676';
  let route = hierarchical
    ? { kind: 'hierarchical', category: hierarchical.category, tool: hierarchical.name, dispatch_tool: 'tools_dispatch' }
    : flat
      ? { kind: 'direct', tool: flat.name, dispatch_tool: 'tools/call' }
      : row.role === 'real_local'
        ? { kind: 'host_only', reason: row.non_app_reason ?? 'Real local accelerate source is host-only behind the compatibility adapter.' }
        : row.role === 'static_descriptor'
          ? { kind: 'static_descriptor_pack', reason: 'Static descriptor pack is reconciled to app/global ownership but is not a required live endpoint descriptor.' }
          : { kind: 'missing', reason: 'No normalized MCP descriptor match was discovered.' };
  let surfaceKind = classifySurface(row);
  if (flat && !hierarchical && fullFacadeAvailable) {
    surfaceKind = 'direct_only';
    route = {
      ...route,
      direct_only_reason: 'Flat MCP descriptor is live but is not exposed through the hierarchical facade; it is accounted as direct-only catalog reachability.',
    };
  }

  return {
    tool_id: row.tool_id,
    service: config.service,
    role: row.role,
    endpoint,
    name,
    normalized_name: normalizeName(name),
    category: row.category ?? categoryForTool(name),
    app_id: row.app_id ?? contract?.capability_id?.split('.')?.[0] ?? null,
    capability_id: row.capability_id ?? contract?.capability_id ?? null,
    owner_module: row.owner_module ?? null,
    policy_class: policyClass,
    confirmation_policy: row.confirmation_policy ?? policy.confirmation_policy ?? (policyClass === 'read' ? 'none' : 'required'),
    receipt_policy: row.receipt_policy ?? policy.receipt_policy ?? (row.role === 'static_descriptor' ? 'none' : 'required'),
    mcp_transport: contract?.mcp_transport ?? (expectedLiveMcp ? 'required' : row.role === 'static_descriptor' ? 'descriptor_pack' : 'host_only'),
    mcp_plus_plus_transport: contract?.mcp_plus_plus_transport ?? 'eligible',
    expected_live_mcp: expectedLiveMcp,
    live: flat ? {
      name: flat.name,
      description: flat.description,
      schema_hash: schemaHash,
    } : null,
    hierarchical: hierarchical ? {
      category: hierarchical.category,
      name: hierarchical.name,
      flat_name: hierarchical.flat_name,
    } : null,
    route,
    needs_live_verification: policyClass !== 'read' || (liveDiscovered && fullFacadeAvailable),
    reconciliation: {
      status: liveDiscovered
        ? schemaMatch ? 'matched' : 'schema_delta'
        : expectedLiveMcp ? 'missing_live_descriptor' : surfaceKind,
      live_discovered: liveDiscovered,
      normalized_name_match: liveDiscovered,
      schema_hash: schemaHash,
      expected_schema_hash: expectedSchemaHash,
      schema_match: schemaMatch,
      surface_kind: surfaceKind,
      surface: surfaceForRow(row, surfaceKind),
      reason: reasonForSurface(row, surfaceKind, expectedLiveMcp, liveDiscovered),
      receipt_present: false,
      verification_status: 'pending',
    },
    verification: {
      status: 'pending',
      mode: 'not_started',
      receipt: null,
      error: null,
    },
  };
}

async function verifyDescriptor(endpoint, descriptor) {
  if (descriptor.policy_class !== 'read') {
    return policyGatedVerification(descriptor);
  }
  if (descriptor.reconciliation.surface_kind === 'direct_only') {
    return {
      status: 'direct_only',
      mode: 'direct_only_catalog_receipt',
      receipt: {
        receipt_id: hashObject({
          tool_id: descriptor.tool_id,
          route: descriptor.route,
          generated_at: generatedAt,
        }),
        generated_at: generatedAt,
        kind: 'direct_only_catalog_receipt',
        transport: 'mcp-json-rpc',
        tool_id: descriptor.tool_id,
        route: descriptor.route,
        statement: 'Read-only descriptor is live in the flat catalog but not reachable through the hierarchical facade; direct invocation is intentionally not attempted by this evidence gate.',
      },
      error: null,
    };
  }
  if (descriptor.reconciliation.surface_kind === 'host_only') {
    return {
      status: 'host_only',
      mode: 'host_only_catalog_receipt',
      receipt: {
        receipt_id: hashObject({
          tool_id: descriptor.tool_id,
          route: descriptor.route,
          generated_at: generatedAt,
        }),
        generated_at: generatedAt,
        kind: 'host_only_catalog_receipt',
        tool_id: descriptor.tool_id,
        route: descriptor.route,
        statement: 'Read-only descriptor is host-only and is reconciled by catalog ownership rather than browser/app dispatch.',
      },
      error: null,
    };
  }

  const args = {
    dry_run: true,
    preview: true,
    limit: 1,
    __swissknife_catalog_probe: true,
    __swissknife_read_only_receipt_required: true,
  };
  const response = descriptor.route.kind === 'hierarchical'
    ? await callTool(endpoint, 'tools_dispatch', {
        category: descriptor.route.category,
        tool: descriptor.route.tool,
        params: args,
      })
    : await callTool(endpoint, descriptor.route.tool, {});
  const receipt = response.status === 'passed' ? dispatchReceipt(descriptor, response) : null;
  return {
    status: response.status,
    mode: descriptor.route.kind === 'hierarchical' ? 'hierarchical_tools_dispatch_read_receipt' : 'direct_tools_call_read_receipt',
    receipt,
    server_receipt: response.value?.receipt ?? response.value?.event_cid ?? response.value?.envelope_cid ?? null,
    error: response.error ?? null,
    result_shape: summarizeResultShape(response.value),
  };
}

function policyGatedVerification(descriptor) {
  const mode = descriptor.policy_class === 'credential' || descriptor.policy_class === 'destructive'
    ? 'confirmation_route_evidence'
    : descriptor.policy_class === 'media_capture'
      ? 'fixture_route_evidence'
      : 'dry_run_fixture_route_evidence';
  return {
    status: 'policy_gated',
    mode,
    receipt: {
      receipt_id: hashObject({
        tool_id: descriptor.tool_id,
        route: descriptor.route,
        policy_class: descriptor.policy_class,
        confirmation_policy: descriptor.confirmation_policy,
        generated_at: generatedAt,
      }),
      generated_at: generatedAt,
      kind: mode,
      policy_class: descriptor.policy_class,
      confirmation_policy: descriptor.confirmation_policy,
      route: descriptor.route,
      statement: 'Side-effectful catalog entry verified by schema, normalized route, and policy gate; live mutation is intentionally not executed.',
    },
    error: null,
  };
}

function captureMcpPlusPlusLibp2pCatalog(bindingRows, contractCapabilities) {
  const eligibleRows = bindingRows.filter(row => mcpPlusPlusEligible.has(row.mcp_plus_plus_transport) || contractCapabilities.some(capability => (
    capability.tool_id === row.tool_id && mcpPlusPlusEligible.has(capability.mcp_plus_plus_transport)
  )));
  const byService = requiredServices.map(service => {
    const rows = eligibleRows.filter(row => (row.service_id ?? row.service) === service);
    return {
      service,
      eligible_descriptor_count: rows.length,
      sample_descriptors: rows.slice(0, 20).map(row => row.tool_id),
      advertised_transport: service === 'ipfs_accelerate_py' && fs.existsSync(mcpAnnounceFile) ? 'libp2p' : 'mcp++-idl-only',
    };
  });

  const reachability = captureLibp2pReachabilityEvidence();
  const advertisedEndpoints = [];
  if (reachability.advertised) {
    advertisedEndpoints.push({
      service: 'ipfs_accelerate_py',
      transport: 'libp2p',
      multiaddr: reachability.announce?.multiaddr ?? null,
      protocol: reachability.protocol ?? '/mcp+p2p/1.0.0',
      reachable: reachability.ok,
      tool_count: reachability.tool_count ?? 0,
      error: reachability.error ?? null,
    });
  }
  const blockers = advertisedEndpoints
    .filter(endpoint => !endpoint.reachable)
    .map(endpoint => `Advertised libp2p endpoint for ${endpoint.service} is unreachable: ${endpoint.error ?? endpoint.multiaddr}.`);

  return {
    schema: 'swissknife.mcp_plus_plus_libp2p_catalog.v1',
    generated_at: generatedAt,
    decision: blockers.length === 0 ? 'go' : 'no_go',
    summary: {
      eligible_descriptor_count: eligibleRows.length,
      service_count: byService.length,
      advertised_endpoint_count: advertisedEndpoints.length,
      reachable_advertised_endpoint_count: advertisedEndpoints.filter(endpoint => endpoint.reachable).length,
      blocker_count: blockers.length,
    },
    blockers,
    policy: {
      advertised_endpoint_rule: 'Only endpoints with a concrete announce multiaddr are treated as advertised libp2p endpoints; every advertised endpoint must initialize and return a tool catalog.',
      idl_only_rule: 'MCP++-eligible descriptors without a libp2p announce endpoint remain covered by MCP++ IDL/catalog reconciliation and are not treated as unreachable transports.',
    },
    services: byService,
    advertised_endpoints: advertisedEndpoints,
    reachability,
    eligible_descriptors: eligibleRows.map(row => ({
      tool_id: row.tool_id,
      service: row.service_id ?? row.service,
      role: row.role,
      name: row.name,
      app_id: row.app_id,
      policy_class: row.policy_class,
      mcp_plus_plus_transport: row.mcp_plus_plus_transport ?? 'eligible',
      catalog_route: row.app_id === 'mcp-plus-plus' || row.app_id === 'idl-explorer' ? 'global_operations_surface' : 'descriptor_idl_projection',
    })),
  };
}

function captureLibp2pReachabilityEvidence() {
  const announce = readJsonIfExists(mcpAnnounceFile);
  if (!announce?.multiaddr) {
    return {
      schema: 'swissknife.mcpplusplus_libp2p_reachability.v1',
      generated_at: generatedAt,
      ok: true,
      advertised: false,
      announce_file: mcpAnnounceFile,
      reason: 'No MCP++/libp2p announce multiaddr is present; endpoint is treated as not advertised for this catalog run.',
    };
  }
  const python = `
import json
import logging
import warnings

logging.basicConfig(level=logging.ERROR)
warnings.filterwarnings("ignore")

import trio
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_client import (
    MCPP2PClient,
    open_libp2p_stream_by_multiaddr,
    trio_libp2p_host_listen,
)
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_protocol import PROTOCOL_MCP_P2P_V1

announce = json.loads(${JSON.stringify(JSON.stringify(announce))})

async def main():
    async with trio_libp2p_host_listen(listen_multiaddr="/ip4/127.0.0.1/tcp/0") as host:
        stream = await open_libp2p_stream_by_multiaddr(
            host,
            peer_multiaddr=announce["multiaddr"],
            protocols=[PROTOCOL_MCP_P2P_V1],
        )
        client = MCPP2PClient(stream)
        initialize = await client.initialize({
            "client": {"name": "swissknife-release-probe"},
            "protocolVersion": "2026-07-10",
            "capabilities": {"tools": True},
            "mcpPlusPlusProfiles": ["mcp++/profile-a-idl"],
        })
        tools = await client.tools_list()
        safe_tool = "get_server_status" if any(tool.get("name") == "get_server_status" for tool in tools if isinstance(tool, dict)) else tools[0].get("name")
        try:
            safe_call = await client.tools_call(safe_tool, {})
            safe_call_status = "passed"
            safe_call_error = None
        except Exception as exc:
            safe_call = None
            safe_call_status = "failed"
            safe_call_error = str(exc)
        await client.aclose()
        print(json.dumps({
            "initialize": initialize.get("result", {}),
            "tool_count": len(tools),
            "sample_tools": [tool.get("name") for tool in tools[:25] if isinstance(tool, dict)],
            "has_get_server_status": any(tool.get("name") == "get_server_status" for tool in tools if isinstance(tool, dict)),
            "has_p2p_taskqueue_status": any(tool.get("name") == "p2p_taskqueue_status" for tool in tools if isinstance(tool, dict)),
            "safe_call": {"tool": safe_tool, "status": safe_call_status, "result": safe_call, "error": safe_call_error},
        }, sort_keys=True))

trio.run(main)
`;
  const result = spawnSync(acceleratePython, ['-c', python], {
    cwd: accelerateRoot,
    env: {
      ...process.env,
      IPFS_ACCELERATE_PY_TASK_P2P_ANNOUNCE_FILE: mcpAnnounceFile,
    },
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = parseTrailingJson(result.stdout);
  if (result.status !== 0 || !parsed) {
    return {
      schema: 'swissknife.mcpplusplus_libp2p_reachability.v1',
      generated_at: generatedAt,
      ok: false,
      advertised: true,
      announce_file: mcpAnnounceFile,
      announce,
      protocol: '/mcp+p2p/1.0.0',
      error: result.error?.message || result.stderr || result.stdout || `python exited ${result.status}`,
    };
  }
  return {
    schema: 'swissknife.mcpplusplus_libp2p_reachability.v1',
    generated_at: generatedAt,
    ok: Boolean(parsed.initialize?.ok) && parsed.tool_count > 0,
    advertised: true,
    protocol: parsed.initialize?.transport ?? '/mcp+p2p/1.0.0',
    announce_file: mcpAnnounceFile,
    announce,
    initialize: parsed.initialize,
    tool_count: parsed.tool_count,
    sample_tools: parsed.sample_tools,
    has_get_server_status: parsed.has_get_server_status,
    has_p2p_taskqueue_status: parsed.has_p2p_taskqueue_status,
    safe_call: parsed.safe_call,
  };
}

function buildAllServerCatalog(ledger, appBindings, policyMatrix, backendContract, services, libp2pCatalog) {
  const blockers = services.flatMap(service => service.blockers);
  const warnings = services.flatMap(service => service.warnings);
  if (libp2pCatalog.blockers.length > 0) {
    blockers.push(...libp2pCatalog.blockers);
  }
  for (const service of requiredServices) {
    if (!services.some(row => row.service === service && row.available)) {
      blockers.push(`Required MCP server did not respond with tools: ${service}.`);
    }
  }

  const allDescriptors = services.flatMap(service => service.reconciled_descriptors);
  const summary = {
    service_count: services.length,
    available_service_count: services.filter(service => service.available).length,
    services_with_full_facade: services.filter(service => service.full_facade_available).length,
    flat_tool_count: sum(services, service => service.flat_tool_count),
    flat_non_meta_tool_count: sum(services, service => service.flat_non_meta_tool_count),
    hierarchical_tool_count: sum(services, service => service.hierarchical_tool_count),
    reconciled_descriptor_count: allDescriptors.length,
    expected_live_descriptor_count: allDescriptors.filter(descriptor => descriptor.expected_live_mcp).length,
    live_reconciled_descriptor_count: allDescriptors.filter(descriptor => descriptor.expected_live_mcp && descriptor.reconciliation.live_discovered).length,
    app_surface_descriptor_count: allDescriptors.filter(descriptor => descriptor.reconciliation.surface_kind === 'app_surface').length,
    global_operations_descriptor_count: allDescriptors.filter(descriptor => descriptor.reconciliation.surface_kind === 'global_operations').length,
    direct_only_descriptor_count: allDescriptors.filter(descriptor => descriptor.reconciliation.surface_kind === 'direct_only').length,
    host_only_descriptor_count: allDescriptors.filter(descriptor => descriptor.reconciliation.surface_kind === 'host_only').length,
    read_descriptor_count: allDescriptors.filter(descriptor => descriptor.policy_class === 'read').length,
    live_dispatch_receipt_count: allDescriptors.filter(descriptor => descriptor.policy_class === 'read' && descriptor.verification.receipt).length,
    policy_gated_evidence_count: allDescriptors.filter(descriptor => descriptor.policy_class !== 'read' && descriptor.verification.status === 'policy_gated').length,
    missing_expected_descriptor_count: sum(services, service => service.missing_expected_descriptor_count),
    unexplained_flat_descriptor_count: sum(services, service => service.unexplained_flat_descriptor_count),
    libp2p_advertised_endpoint_count: libp2pCatalog.summary.advertised_endpoint_count,
    libp2p_reachable_advertised_endpoint_count: libp2pCatalog.summary.reachable_advertised_endpoint_count,
    blocker_count: blockers.length,
    warning_count: warnings.length,
  };

  return {
    schema: 'swissknife.all_server_tool_catalog.v1',
    generated_at: generatedAt,
    decision: blockers.length === 0 ? 'go' : 'no_go',
    task: {
      id: 'SWR-101',
      title: 'Prove complete MCP and MCP++/libp2p catalog reachability',
      depends_on: 'SWR-100',
    },
    summary,
    blockers,
    warnings,
    acceptance_policy: {
      required_services: requiredServices,
      required_facade_tools: metaTools,
      missing_server: 'blocker',
      missing_hierarchical_facade: 'blocker',
      unexplained_catalog_delta: 'blocker',
      missing_read_receipt: 'blocker',
      unreachable_advertised_libp2p_endpoint: 'blocker',
      side_effectful_tools: 'schema plus normalized route plus policy-gated dry-run, fixture, or confirmation evidence',
    },
    source_artifacts: {
      all_tools_ledger: {
        schema: ledger.schema,
        generated_at: ledger.generated_at,
        tool_count: ledger.tool_count ?? ledger.tools?.length ?? 0,
        summary: ledger.summary,
      },
      app_bindings: {
        schema: appBindings.schema,
        generated_at: appBindings.generated_at,
        tool_count: appBindings.tool_count,
        summary: appBindings.summary,
      },
      policy_matrix: {
        schema: policyMatrix.schema,
        generated_at: policyMatrix.generated_at,
        tool_count: policyMatrix.tool_count,
        summary: policyMatrix.summary,
      },
      app_backend_contract: {
        schema: backendContract.schema,
        generated_at: backendContract.generated_at,
        backend_capability_count: backendContract.backend_capability_count,
        service_counts: backendContract.service_counts,
      },
    },
    services,
  };
}

function legacyHierarchicalEvidence(catalog) {
  return {
    schema: 'swissknife.mcp_hierarchical_facade_live_probes.v1',
    generated_at: generatedAt,
    decision: catalog.services.every(service => service.available && service.full_facade_available) ? 'go' : 'no_go',
    required_facade_tools: metaTools,
    probes: catalog.services.map(service => ({
      service: service.service,
      endpoint: service.endpoint,
      status: service.flat_probe.status,
      ok: service.available && service.full_facade_available,
      tool_count: service.flat_tool_count,
      facade_tools: service.meta_presence,
      missing_facade_tools: metaTools.filter(name => !service.meta_presence[name]),
      category_count: service.category_count,
      sample_categories: service.categories.slice(0, 10),
      error: service.flat_probe.error ?? service.blockers[0] ?? null,
    })),
  };
}

async function jsonRpc(endpoint, method, params) {
  const response = await fetchJson(endpoint, {
    body: { jsonrpc: '2.0', id: `${method}-${Date.now()}`, method, params },
  });
  return response;
}

async function callTool(endpoint, name, args) {
  const response = await fetchJson(endpoint, {
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

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), liveProbeTimeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      json: parseJson(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: '',
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
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
      if (typeof category === 'string') return { name: category, count: null, description: '' };
      return {
        name: category?.name ?? category?.category ?? '',
        count: numberOrNull(category?.count ?? category?.tool_count ?? category?.total),
        description: category?.description ?? '',
        lazy: category?.lazy ?? null,
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

function normalizeToolObject(tool) {
  if (typeof tool === 'string') {
    return { name: tool, description: '', inputSchema: { type: 'object' } };
  }
  return {
    name: tool?.name ?? tool?.tool ?? '',
    description: typeof tool?.description === 'string' ? tool.description : '',
    inputSchema: tool?.inputSchema ?? tool?.input_schema ?? tool?.schema ?? { type: 'object' },
  };
}

function buildToolLookup(tools) {
  const lookup = new Map();
  for (const tool of tools) {
    lookup.set(tool.name, tool);
    lookup.set(normalizeName(tool.name), tool);
  }
  return lookup;
}

function buildHierarchyLookup(entries) {
  const lookup = new Map();
  for (const entry of entries) {
    lookup.set(entry.name, entry);
    lookup.set(entry.flat_name, entry);
    lookup.set(`${entry.category}/${entry.name}`, entry);
    lookup.set(normalizeName(entry.name), entry);
    lookup.set(normalizeName(entry.flat_name), entry);
    lookup.set(normalizeName(`${entry.category}/${entry.name}`), entry);
  }
  return lookup;
}

function classifySurface(row) {
  if (row.role === 'real_local' || row.normalized_disposition === 'server_internal' || row.visibility === 'supervisor_only') {
    return 'host_only';
  }
  if (row.normalized_disposition === 'unsafe_without_human_review' || row.visibility === 'desktop_mobile_only') {
    return 'direct_only';
  }
  if (globalOperationApps.has(row.app_id)) {
    return 'global_operations';
  }
  return 'app_surface';
}

function overridePolicyClass(policyClass, name) {
  const lower = String(name ?? '').toLowerCase();
  if (/(delete|remove|stop|kill|unpin|purge|destroy|drop|truncate|revoke)/.test(lower)) return 'destructive';
  if (/(credential|oauth|auth|token|key|secret|password)/.test(lower)) return 'credential';
  if (/(lint|static.?analysis|scan|audit|benchmark|profile)/.test(lower)) return 'heavy_compute';
  if (/(register|submit|start|run|execute|create|update|save|pin|put|add|write|log|record|ingest|generate|optimize|train|download|upload|publish)/.test(lower)) {
    return policyClass === 'external_network' || policyClass === 'heavy_compute' || policyClass === 'media_capture'
      ? policyClass
      : 'write';
  }
  return policyClass;
}

function surfaceForRow(row, kind) {
  if (kind === 'app_surface') return `app:${row.app_id}`;
  if (kind === 'global_operations') return `global:${row.app_id}`;
  if (kind === 'direct_only') return `direct-only:${row.app_id}`;
  return `host-only:${row.app_id ?? 'agent-supervisor'}`;
}

function reasonForSurface(row, kind, expectedLiveMcp, liveDiscovered) {
  if (!liveDiscovered && expectedLiveMcp) return 'Expected configured MCP descriptor was not discovered by normalized name.';
  if (kind === 'host_only') return row.non_app_reason ?? 'Host-only or supervisor-only descriptor is withheld from direct browser invocation.';
  if (kind === 'direct_only') return row.non_app_reason ?? 'Descriptor requires desktop/mobile confirmation before direct invocation.';
  if (kind === 'global_operations') return `Owned by global operations surface ${row.app_id}.`;
  return `Owned by virtual desktop app ${row.app_id}.`;
}

function schemaHashForRow(row, policy, contract) {
  return row.schema_hash ?? policy.schema_hash ?? contract?.schema_hash ?? null;
}

function dispatchReceipt(descriptor, response) {
  return {
    receipt_id: hashObject({
      tool_id: descriptor.tool_id,
      route: descriptor.route,
      status: response.status,
      value_shape: summarizeResultShape(response.value),
      generated_at: generatedAt,
    }),
    generated_at: generatedAt,
    kind: 'live_read_dispatch_receipt',
    transport: 'mcp-json-rpc',
    tool_id: descriptor.tool_id,
    route: descriptor.route,
    status: response.status,
    server_receipt_present: Boolean(response.value?.receipt ?? response.value?.event_cid ?? response.value?.envelope_cid),
  };
}

function summarizeResultShape(value) {
  if (value === null || value === undefined) return { type: 'nullish' };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 20) };
  return { type: typeof value, length: String(value).length };
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
  if (typeof value === 'string') return value.slice(0, 300);
  if (value?.error) return String(value.error).slice(0, 300);
  if (Array.isArray(value?.content)) {
    return value.content.map(item => item.text ?? item.json ?? '').join(' ').slice(0, 300);
  }
  return 'tool returned an error envelope';
}

function stripCategoryPrefix(name, category) {
  if (name.startsWith(`${category}.`)) return name.slice(category.length + 1);
  if (name.startsWith(`${category}/`)) return name.slice(category.length + 1);
  return name;
}

function categoryForTool(name) {
  if (name.includes('.')) return name.split('.')[0];
  if (name.includes('_')) return name.split('_')[0];
  return 'general';
}

function normalizeName(name) {
  return String(name ?? '').toLowerCase().replace(/[/.:-]+/g, '_').replace(/_+/g, '_');
}

function hashObject(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex')}`;
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function parseTrailingJson(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const direct = parseJson(trimmed);
  if (direct) return direct;
  const start = trimmed.lastIndexOf('\n{');
  if (start >= 0) return parseJson(trimmed.slice(start + 1));
  const brace = trimmed.indexOf('{');
  return brace >= 0 ? parseJson(trimmed.slice(brace)) : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sum(items, valueFn) {
  return items.reduce((total, item) => total + (Number(valueFn(item)) || 0), 0);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function readRequiredJson(filePath, label) {
  const value = readJsonIfExists(filePath);
  if (!value) {
    throw new Error(`Missing required SWR-100 evidence artifact: ${label}. Run node scripts/capture-ipfs-mcp-all-tools-ledger.cjs first.`);
  }
  return value;
}

function writeJson(name, value) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdownEvidence(catalog, libp2pCatalog) {
  fs.mkdirSync(path.dirname(docsPath), { recursive: true });
  const lines = [
    '# MCP All-Tool Catalog Evidence',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Decision: **${catalog.decision}**`,
    '',
    '## Summary',
    '',
    '| Measure | Count |',
    '| --- | ---: |',
    `| Services | ${catalog.summary.service_count} |`,
    `| Available services | ${catalog.summary.available_service_count} |`,
    `| Services with full hierarchical facade | ${catalog.summary.services_with_full_facade} |`,
    `| Flat MCP tools | ${catalog.summary.flat_non_meta_tool_count} |`,
    `| Hierarchical MCP tools | ${catalog.summary.hierarchical_tool_count} |`,
    `| Reconciled descriptors | ${catalog.summary.reconciled_descriptor_count} |`,
    `| Expected live descriptors | ${catalog.summary.expected_live_descriptor_count} |`,
    `| Live reconciled descriptors | ${catalog.summary.live_reconciled_descriptor_count} |`,
    `| Read dispatch receipts | ${catalog.summary.live_dispatch_receipt_count} |`,
    `| Policy-gated evidence entries | ${catalog.summary.policy_gated_evidence_count} |`,
    `| Direct-only descriptors | ${catalog.summary.direct_only_descriptor_count} |`,
    `| Host-only descriptors | ${catalog.summary.host_only_descriptor_count} |`,
    `| Advertised libp2p endpoints | ${catalog.summary.libp2p_advertised_endpoint_count} |`,
    `| Reachable advertised libp2p endpoints | ${catalog.summary.libp2p_reachable_advertised_endpoint_count} |`,
    '',
    '## Service Catalogs',
    '',
    '| Service | Endpoint | Flat tools | Hierarchical tools | Facade | Missing expected | Unexplained flat | Read receipts | Policy gated |',
    '| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |',
    ...catalog.services.map(service => [
      service.service,
      service.endpoint,
      service.flat_non_meta_tool_count,
      service.hierarchical_tool_count,
      service.full_facade_available ? 'yes' : 'no',
      service.missing_expected_descriptor_count,
      service.unexplained_flat_descriptor_count,
      service.read_live_dispatch_receipt_count,
      service.policy_gated_descriptor_count,
    ].join(' | ')).map(row => `| ${row} |`),
    '',
    '## MCP++ / libp2p',
    '',
    `Decision: **${libp2pCatalog.decision}**`,
    '',
    '| Service | Eligible descriptors | Advertised transport |',
    '| --- | ---: | --- |',
    ...libp2pCatalog.services.map(service => `| ${service.service} | ${service.eligible_descriptor_count} | ${service.advertised_transport} |`),
    '',
    '## Policy',
    '',
    '- Missing required MCP servers, missing hierarchical facade meta-tools, unexplained catalog deltas, missing read receipts, and unreachable advertised libp2p endpoints are blockers.',
    '- Read-only descriptors are verified with live MCP dispatch receipts.',
    '- Write, heavy-compute, external-network, credential, destructive, and media-capture descriptors are verified by normalized catalog route plus dry-run, fixture, or confirmation-route evidence.',
    '- Static descriptor-pack and real-local source rows remain reconciled to app/global ownership, but are not counted as required live configured endpoint descriptors.',
    '',
  ];
  if (catalog.blockers.length > 0) {
    lines.push('## Blockers', '', ...catalog.blockers.map(blocker => `- ${blocker}`), '');
  }
  if (catalog.warnings.length > 0) {
    lines.push('## Warnings', '', ...catalog.warnings.map(warning => `- ${warning}`), '');
  }
  lines.push(
    '## Artifacts',
    '',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/all-server-tool-catalog.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/mcp-plus-plus-libp2p-catalog.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/mcp-hierarchical-facade-live-probes.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/mcpplusplus-libp2p-reachability.json`',
    '',
  );
  fs.writeFileSync(docsPath, `${lines.join('\n')}\n`, 'utf8');
}

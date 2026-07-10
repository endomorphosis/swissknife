#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outPath = path.join(outDir, 'hierarchical-tools-evidence.json');
const docPath = path.join(projectRoot, 'docs', 'ipfs-datasets-hierarchical-tool-gap.md');
const allToolsLedgerPath = path.join(outDir, 'all-tools-ledger.json');
const allToolsAppBindingsPath = path.join(outDir, 'all-tools-app-bindings.json');
const requireLiveFleet = ['1', 'true', 'yes'].includes(String(process.env.HIERARCHICAL_MCP_REQUIRE_LIVE ?? '').toLowerCase());

const META_TOOLS = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];

const SERVICES = [
  { service: 'ipfs_kit_py', role: 'configured', endpoint: 'http://127.0.0.1:8014/mcp', expectedMinimumFlatTools: 80 },
  { service: 'ipfs_datasets_py', role: 'configured', endpoint: 'http://127.0.0.1:3002/mcp', expectedMinimumFlatTools: 300 },
  { service: 'ipfs_accelerate_py', role: 'configured_compat', endpoint: 'http://127.0.0.1:3003/mcp', expectedMinimumFlatTools: 100 },
];

const IPFS_DATASETS_DIRECT_ONLY_ROOT_PREFIXES = new Map([
  ['policy_', {
    reason_class: 'root_governance_control_plane',
    reason: 'Root policy descriptors are intentionally kept as direct tools/call entries so policy bootstrap calls do not depend on category facade enumeration.',
  }],
  ['interface_', {
    reason_class: 'root_governance_control_plane',
    reason: 'Root interface descriptors are intentionally kept as direct tools/call entries so interface registration and discovery bootstrap calls do not depend on category facade enumeration.',
  }],
  ['compliance_', {
    reason_class: 'root_governance_control_plane',
    reason: 'Root compliance descriptors are intentionally kept as direct tools/call entries so compliance-rule bootstrap calls do not depend on category facade enumeration.',
  }],
]);

const IPFS_DATASETS_DIRECT_ONLY_NAMESPACE_POLICIES = {
  admin_tools: {
    reason_class: 'governance_control_plane_namespace',
    reason: 'Administrative control-plane modules are retained as direct tools/call descriptors because they gate server state and operator actions outside the browsable hierarchy.',
  },
  alert_tools: {
    reason_class: 'external_notification_namespace',
    reason: 'Notification connectors are retained as direct tools/call descriptors because dispatch requires external-service policy gates and receipts.',
  },
  analysis_tools: {
    reason_class: 'legacy_aggregate_module_namespace',
    reason: 'Aggregate analysis module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility.',
  },
  audit_tools: {
    reason_class: 'governance_audit_namespace',
    reason: 'Audit-log tools are retained as direct tools/call descriptors so receipts and governance evidence can be emitted even when hierarchy browsing is unavailable.',
  },
  auth_tools: {
    reason_class: 'credential_control_plane_namespace',
    reason: 'Authentication and authorization tools are retained as direct tools/call descriptors and require credential policy gates outside hierarchy browsing.',
  },
  background_task_tools: {
    reason_class: 'background_engine_namespace',
    reason: 'Background task engines expose queue and worker controls that remain direct-only for job-control compatibility with existing tools/call clients.',
  },
  bespoke_tools: {
    reason_class: 'service_runtime_namespace',
    reason: 'Bespoke service-runtime helpers are retained as direct-only descriptors when absent from hierarchy listings because they expose operational status and local vector-store controls.',
  },
  cache_tools: {
    reason_class: 'legacy_aggregate_module_namespace',
    reason: 'Cache aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility.',
  },
  cli: {
    reason_class: 'host_execution_namespace',
    reason: 'CLI tools can execute local or remote host commands and are retained as direct-only descriptors behind host-execution policy gates.',
  },
  dashboard_tools: {
    reason_class: 'observability_runtime_namespace',
    reason: 'Dashboard runtime and telemetry helpers are retained as direct tools/call descriptors because they report service state rather than browsable dataset actions.',
  },
  data_processing_tools: {
    reason_class: 'legacy_aggregate_module_namespace',
    reason: 'Data-processing aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility.',
  },
  dataset_tools: {
    reason_class: 'dataset_compatibility_namespace',
    reason: 'Dataset module descriptors are retained as direct-only tools/call compatibility entries when the hierarchy facade exposes equivalent dataset leaves or omits legacy aggregate modules.',
  },
  development_tools: {
    reason_class: 'host_development_namespace',
    reason: 'Development and repository automation tools are retained as direct-only descriptors because they can touch local checkout, CI, or external developer services.',
  },
  discord_tools: {
    reason_class: 'external_connector_namespace',
    reason: 'Discord connectors are retained as direct-only descriptors and require external-network policy gates and receipts.',
  },
  email_tools: {
    reason_class: 'external_connector_namespace',
    reason: 'Email connectors are retained as direct-only descriptors and require external-network and credential policy gates.',
  },
  embedding_tools: {
    reason_class: 'heavy_compute_engine_namespace',
    reason: 'Embedding engines and shard operations are retained as direct-only descriptors because they represent compute-heavy backend jobs rather than hierarchy catalog leaves.',
  },
  file_converter_tools: {
    reason_class: 'host_file_processing_namespace',
    reason: 'File conversion and archive helpers are retained as direct-only descriptors because they may perform host file, download, or batch-processing work.',
  },
  file_detection_tools: {
    reason_class: 'host_file_processing_namespace',
    reason: 'File detection helpers are retained as direct-only descriptors for direct tools/call compatibility with host-side file inspection flows.',
  },
  finance_data_tools: {
    reason_class: 'external_data_ingest_namespace',
    reason: 'Finance data scrapers and theorem helpers are retained as direct-only descriptors because they depend on external data sources and compute-heavy analysis.',
  },
  functions: {
    reason_class: 'host_execution_namespace',
    reason: 'Function execution descriptors are retained as direct-only tools/call entries because they can execute host-side snippets and require strict policy gates.',
  },
  geospatial_tools: {
    reason_class: 'legacy_aggregate_module_namespace',
    reason: 'Geospatial aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility.',
  },
  graph_tools: {
    reason_class: 'graph_engine_namespace',
    reason: 'Graph and ontology engines are retained as direct-only descriptors because they manage mutable graph state and long-running backend jobs.',
  },
  index_management_tools: {
    reason_class: 'legacy_aggregate_module_namespace',
    reason: 'Index-management aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility.',
  },
  investigation_tools: {
    reason_class: 'investigation_engine_namespace',
    reason: 'Investigation engines are retained as direct-only descriptors because they coordinate multi-step ingestion, geospatial, and reasoning workflows.',
  },
  ipfs_cluster_tools: {
    reason_class: 'cluster_control_plane_namespace',
    reason: 'IPFS cluster control-plane descriptors are retained as direct-only tools/call entries behind network and cluster policy gates.',
  },
  ipfs_tools: {
    reason_class: 'ipfs_backend_compatibility_namespace',
    reason: 'IPFS backend module descriptors are retained as direct-only tools/call compatibility entries when the hierarchy facade exposes equivalent IPFS leaves or omits legacy aggregate modules.',
  },
  legacy_mcp_tools: {
    reason_class: 'legacy_mcp_alias_namespace',
    reason: 'Legacy MCP aliases are retained as direct-only descriptors to preserve older tools/call clients while canonical hierarchy leaves are exposed separately where available.',
  },
  legal_dataset_tools: {
    reason_class: 'external_data_ingest_namespace',
    reason: 'Legal dataset scrapers and validation helpers are retained as direct-only descriptors because they depend on external data sources, scheduled jobs, or large batch processing.',
  },
  logic_tools: {
    reason_class: 'logic_engine_namespace',
    reason: 'Logic, prover, and compliance engines are retained as direct-only descriptors because they expose policy-sensitive reasoning backends with their own receipt requirements.',
  },
  mcplusplus: {
    reason_class: 'protocol_engine_namespace',
    reason: 'MCP++ peer, taskqueue, and workflow engines are retained as direct-only descriptors because they manage protocol runtime state.',
  },
  media_tools: {
    reason_class: 'media_processing_namespace',
    reason: 'Media conversion and download tools are retained as direct-only descriptors because they may perform host media processing or external downloads.',
  },
  medical_research_scrapers: {
    reason_class: 'external_data_ingest_namespace',
    reason: 'Medical research scrapers are retained as direct-only descriptors because they depend on external data sources and policy-gated research workflows.',
  },
  monitoring_tools: {
    reason_class: 'observability_runtime_namespace',
    reason: 'Monitoring engines are retained as direct-only descriptors because they report service runtime state and emit operational receipts.',
  },
  p2p_tools: {
    reason_class: 'protocol_engine_namespace',
    reason: 'P2P workflow schedulers are retained as direct-only descriptors because they manage networked runtime state outside category browsing.',
  },
  p2p_workflow_tools: {
    reason_class: 'protocol_engine_namespace',
    reason: 'P2P workflow engines are retained as direct-only descriptors because they manage networked runtime state outside category browsing.',
  },
  pdf_tools: {
    reason_class: 'host_file_processing_namespace',
    reason: 'PDF analysis and certificate helpers are retained as direct-only descriptors because they process host documents and may run batch GraphRAG or ZKP jobs.',
  },
  provenance_tools: {
    reason_class: 'provenance_receipt_namespace',
    reason: 'Provenance descriptors are retained as direct-only tools/call entries so lineage receipts can be recorded independently of hierarchy browsing.',
  },
  rate_limiting_tools: {
    reason_class: 'governance_control_plane_namespace',
    reason: 'Rate-limiting controls are retained as direct-only descriptors because they gate server behavior and require governance policy receipts.',
  },
  search_tools: {
    reason_class: 'legacy_aggregate_module_namespace',
    reason: 'Search aggregate module descriptors mirror upstream Python module entry points and remain direct-only for legacy tools/call compatibility.',
  },
  security_tools: {
    reason_class: 'credential_control_plane_namespace',
    reason: 'Security and access-permission tools are retained as direct-only descriptors behind credential and authorization policy gates.',
  },
  session_tools: {
    reason_class: 'credential_control_plane_namespace',
    reason: 'Session-management tools are retained as direct-only descriptors because they manage authenticated runtime state.',
  },
  software_engineering_tools: {
    reason_class: 'host_development_namespace',
    reason: 'Software engineering automation tools are retained as direct-only descriptors because they can touch repositories, CI logs, or external developer services.',
  },
  sparse_embedding_tools: {
    reason_class: 'heavy_compute_engine_namespace',
    reason: 'Sparse embedding aggregate descriptors are retained as direct-only entries for compute-heavy backend compatibility.',
  },
  storage_tools: {
    reason_class: 'storage_engine_namespace',
    reason: 'Storage engines are retained as direct-only descriptors because they can mutate backend storage state and require receipts.',
  },
  vector_store_tools: {
    reason_class: 'heavy_compute_engine_namespace',
    reason: 'Vector-store engines are retained as direct-only descriptors because they manage mutable indexes and compute-heavy backend state.',
  },
  vector_tools: {
    reason_class: 'heavy_compute_engine_namespace',
    reason: 'Vector index and search helpers are retained as direct-only descriptors when not listed by the hierarchy facade because they manage backend vector state.',
  },
  wallet_tools: {
    reason_class: 'credential_control_plane_namespace',
    reason: 'Wallet and grant tools are retained as direct-only descriptors because they handle private records, grants, and cryptographic authorization receipts.',
  },
  web_archive_tools: {
    reason_class: 'external_data_ingest_namespace',
    reason: 'Web archive and search connectors are retained as direct-only descriptors because they depend on external data sources and network policy gates.',
  },
  web_scraping_tools: {
    reason_class: 'external_data_ingest_namespace',
    reason: 'Web scraping aggregate descriptors are retained as direct-only entries behind external-network policy gates.',
  },
  workflow_tools: {
    reason_class: 'background_engine_namespace',
    reason: 'Workflow engines are retained as direct-only descriptors because they coordinate multi-step backend jobs and require job receipts.',
  },
};

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const services = [];
  const allToolsLedger = readAllToolsLedger();

  for (const service of SERVICES) {
    services.push(await probeService(service, allToolsLedger));
  }

  const totals = services.reduce((summary, service) => {
    summary.flat_tool_count += service.flat_tool_count;
    summary.flat_non_meta_tool_count += service.flat_non_meta_tool_count;
    summary.category_count += service.category_count;
    summary.hierarchical_tool_count += service.hierarchical_tool_count;
    summary.raw_flat_hierarchy_gap_count += service.raw_flat_hierarchy_gap_count;
    summary.removed_from_app_visible_ledger_count += service.removed_from_app_visible_ledger_count;
    summary.flat_direct_only_count += service.flat_direct_only_count;
    summary.unexplained_flat_hierarchy_gap_count += service.unexplained_flat_hierarchy_gap_count;
    summary.flat_hierarchy_gap_count += service.flat_hierarchy_gap_count;
    summary.flat_hierarchy_count_gap += service.flat_hierarchy_count_gap;
    summary.hierarchical_name_match_count += service.hierarchical_name_match_count;
    summary.dispatch_pass_count += service.dispatch_probe?.ok ? 1 : 0;
    if (service.dispatch_probe) summary.dispatch_probe_count += 1;
    if (service.dispatch_probe && !service.dispatch_probe.ok) summary.services_with_failed_dispatch_probe.push(service.service);
    summary.alias_dispatch_probe_count += service.alias_dispatch_probe_count ?? 0;
    summary.alias_dispatch_pass_count += service.alias_dispatch_pass_count ?? 0;
    if ((service.alias_dispatch_failed_count ?? 0) > 0) summary.services_with_failed_alias_dispatch_probe.push(service.service);
    summary.direct_only_probe_count += service.direct_only_probe_count ?? 0;
    summary.direct_only_receipt_count += service.direct_only_receipt_count ?? 0;
    summary.services_with_full_facade += service.full_facade_available ? 1 : 0;
    if (!service.available) summary.unavailable_services.push(service.service);
    if (service.available && !service.full_facade_available) summary.services_missing_facade.push(service.service);
    if (service.available && service.flat_tool_count < service.expected_minimum_flat_tools) summary.services_below_expected_flat_count.push(service.service);
    if (service.unexplained_flat_hierarchy_gap_count > 0) summary.services_with_flat_hierarchy_gap.push(service.service);
    if (service.unexplained_flat_hierarchy_gap_count > 0) summary.services_with_unexplained_flat_hierarchy_gap.push(service.service);
    return summary;
  }, {
    service_count: services.length,
    available_service_count: services.filter(service => service.available).length,
    services_with_full_facade: 0,
    flat_tool_count: 0,
    flat_non_meta_tool_count: 0,
    category_count: 0,
    hierarchical_tool_count: 0,
    raw_flat_hierarchy_gap_count: 0,
    removed_from_app_visible_ledger_count: 0,
    flat_direct_only_count: 0,
    unexplained_flat_hierarchy_gap_count: 0,
    flat_hierarchy_gap_count: 0,
    flat_hierarchy_count_gap: 0,
    hierarchical_name_match_count: 0,
    dispatch_pass_count: 0,
    dispatch_probe_count: 0,
    alias_dispatch_probe_count: 0,
    alias_dispatch_pass_count: 0,
    direct_only_probe_count: 0,
    direct_only_receipt_count: 0,
    unavailable_services: [],
    services_missing_facade: [],
    services_below_expected_flat_count: [],
    services_with_flat_hierarchy_gap: [],
    services_with_unexplained_flat_hierarchy_gap: [],
    services_with_failed_dispatch_probe: [],
    services_with_failed_alias_dispatch_probe: [],
  });

  const blockers = [];
  if (requireLiveFleet && totals.available_service_count !== totals.service_count) {
    blockers.push(`Only ${totals.available_service_count}/${totals.service_count} configured MCP services responded.`);
  }
  if (totals.services_missing_facade.length > 0) {
    blockers.push(`Responding services missing the full hierarchical facade: ${totals.services_missing_facade.join(', ')}.`);
  }
  if (totals.services_with_failed_dispatch_probe.length > 0) {
    blockers.push(`Representative tools_dispatch probes failed for: ${totals.services_with_failed_dispatch_probe.join(', ')}.`);
  }
  if (totals.services_with_failed_alias_dispatch_probe.length > 0) {
    blockers.push(`Representative hierarchical alias dispatch probes failed for: ${totals.services_with_failed_alias_dispatch_probe.join(', ')}.`);
  }
  if (totals.services_below_expected_flat_count.length > 0) {
    blockers.push(`Services below expected flat tool count: ${totals.services_below_expected_flat_count.join(', ')}.`);
  }
  const ipfsDatasets = services.find(service => service.service === 'ipfs_datasets_py');
  if ((ipfsDatasets?.unexplained_flat_hierarchy_gap_count ?? 0) > 0) {
    blockers.push(
      `ipfs_datasets_py has ${ipfsDatasets.unexplained_flat_hierarchy_gap_count} flat/direct tool descriptors that are neither listed through hierarchical discovery nor classified direct-only.`,
    );
  }
  const warnings = [];
  if (!requireLiveFleet && totals.available_service_count !== totals.service_count) {
    warnings.push(
      `Only ${totals.available_service_count}/${totals.service_count} configured MCP services responded; set HIERARCHICAL_MCP_REQUIRE_LIVE=1 to make endpoint availability a hard validation failure.`,
    );
  }
  if (totals.unexplained_flat_hierarchy_gap_count > 0) {
    warnings.push(`${totals.unexplained_flat_hierarchy_gap_count} flat/direct tool descriptors are visible but neither listed through hierarchical category discovery nor classified as direct-only.`);
  }

  const report = {
    schema: 'swissknife.hierarchical-mcp-tools-evidence.v1',
    generated_at: generatedAt,
    decision: blockers.length === 0 ? 'go' : 'no_go',
    live_fleet_required: requireLiveFleet,
    summary: {
      ...totals,
      ipfs_datasets_unexplained_flat_hierarchy_gap_count: ipfsDatasets?.unexplained_flat_hierarchy_gap_count ?? null,
      blocker_count: blockers.length,
      warning_count: warnings.length,
    },
    blockers,
    warnings,
    meta_tools: META_TOOLS,
    docs: {
      ipfs_datasets_hierarchical_tool_gap: path.relative(projectRoot, docPath),
    },
    services,
    app_visible_ledger: {
      available: allToolsLedger.app_visible_ledger_available,
      source: allToolsLedger.app_visible_ledger_source,
      path: path.relative(projectRoot, allToolsLedger.app_visible_ledger_path ?? allToolsLedgerPath),
      schema: allToolsLedger.app_visible_ledger_schema,
      record_count: allToolsLedger.app_visible_records.length,
      error: allToolsLedger.error,
    },
    all_tools_ledger: {
      available: allToolsLedger.available,
      path: path.relative(projectRoot, allToolsLedgerPath),
      schema: allToolsLedger.schema,
      record_count: allToolsLedger.records.length,
      error: allToolsLedger.error,
    },
  };

  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeIpfsDatasetsGapDoc(report);
  console.log(JSON.stringify({
    decision: report.decision,
    blocker_count: report.summary.blocker_count,
    service_count: report.summary.service_count,
    services_with_full_facade: report.summary.services_with_full_facade,
    flat_tool_count: report.summary.flat_tool_count,
    flat_non_meta_tool_count: report.summary.flat_non_meta_tool_count,
    category_count: report.summary.category_count,
    hierarchical_tool_count: report.summary.hierarchical_tool_count,
    raw_flat_hierarchy_gap_count: report.summary.raw_flat_hierarchy_gap_count,
    removed_from_app_visible_ledger_count: report.summary.removed_from_app_visible_ledger_count,
    flat_direct_only_count: report.summary.flat_direct_only_count,
    unexplained_flat_hierarchy_gap_count: report.summary.unexplained_flat_hierarchy_gap_count,
    flat_hierarchy_gap_count: report.summary.flat_hierarchy_gap_count,
    dispatch_pass_count: report.summary.dispatch_pass_count,
    dispatch_probe_count: report.summary.dispatch_probe_count,
    alias_dispatch_pass_count: report.summary.alias_dispatch_pass_count,
    alias_dispatch_probe_count: report.summary.alias_dispatch_probe_count,
    direct_only_receipt_count: report.summary.direct_only_receipt_count,
    direct_only_probe_count: report.summary.direct_only_probe_count,
    warning_count: report.summary.warning_count,
    output: path.relative(projectRoot, outPath),
    docs: path.relative(projectRoot, docPath),
  }, null, 2));

  if (report.decision !== 'go') process.exitCode = 1;
}

async function probeService(service, allToolsLedger = readAllToolsLedger()) {
  const toolsList = await rpc(service.endpoint, 'tools/list');
  const flatTools = extractTools(toolsList.json);
  const flatToolNames = flatTools.map(toolName).filter(Boolean);
  const flatNonMetaToolNames = flatToolNames.filter(name => !META_TOOLS.includes(name));
  const metaPresence = Object.fromEntries(META_TOOLS.map(name => [name, flatToolNames.includes(name)]));

  const categoriesCall = await callTool(service.endpoint, 'tools_list_categories', { include_count: true });
  const categoriesPayload = unwrapToolPayload(categoriesCall.json);
  const categories = extractCategories(categoriesPayload);

  const categoryRows = [];
  for (const category of categories) {
    const categoryName = category.name || category.category || category.id || String(category);
    if (!categoryName) continue;
    const listed = await callTool(service.endpoint, 'tools_list_tools', { category: categoryName });
    const listedPayload = unwrapToolPayload(listed.json);
    const tools = extractTools(listedPayload);
    const toolNames = tools.map(toolName).filter(Boolean).sort();
    categoryRows.push({
      name: categoryName,
      expected_tool_count: numberOrNull(category.tool_count ?? category.count),
      listed_tool_count: tools.length,
      tool_names: toolNames,
      sample_tools: tools.slice(0, 8).map(tool => ({
        name: toolName(tool),
        description: typeof tool.description === 'string' ? tool.description : '',
      })),
      ok: listed.ok && tools.length === 0
        ? (numberOrNull(category.tool_count ?? category.count) ?? 0) === 0
        : listed.ok,
    });
  }

  const sample = selectDispatchSample(service.service, categoryRows);
  const hierarchicalToolCount = categoryRows.reduce((sum, row) => sum + row.listed_tool_count, 0);
  const flatHierarchyCountGap = Math.max(0, flatNonMetaToolNames.length - hierarchicalToolCount);
  const hierarchicalNames = normalizedHierarchicalToolNames(categoryRows);
  const rawFlatHierarchyGap = flatNonMetaToolNames
    .filter(name => !hierarchicalNames.has(name))
    .sort();
  const ledgerAccounting = accountFlatDescriptorsInAppVisibleLedger(service, flatNonMetaToolNames, rawFlatHierarchyGap, allToolsLedger);
  const gapNeedingExplanation = ledgerAccounting.app_visible_ledger_available
    ? rawFlatHierarchyGap.filter(name => ledgerAccounting.app_visible_flat_descriptor_names.includes(name))
    : rawFlatHierarchyGap;
  const {
    directOnlyDescriptors,
    unexplainedFlatHierarchyGap,
    classifiedDescriptors,
  } = classifyFlatHierarchyGap(service.service, gapNeedingExplanation);
  const schemaProbe = sample
    ? await callTool(service.endpoint, 'tools_get_schema', { category: sample.category, tool: sample.tool })
    : null;
  const dispatchProbe = sample
    ? await callTool(service.endpoint, 'tools_dispatch', { category: sample.category, tool: sample.tool, params: sample.params ?? {} })
    : null;
  const aliasDispatchProbes = sample
    ? await probeHierarchicalAliasDispatch(service.endpoint, categoryRows, sample)
    : [];
  const directOnlyProbes = service.service === 'ipfs_datasets_py'
    ? await probeDirectOnlyDescriptors(service.endpoint, directOnlyDescriptors)
    : [];
  const aliasDispatchFailedCount = aliasDispatchProbes.filter(probe => !probe.ok).length;

  return {
    service: service.service,
    role: service.role,
    endpoint: service.endpoint,
    available: toolsList.ok,
    expected_minimum_flat_tools: service.expectedMinimumFlatTools,
    flat_tool_count: flatToolNames.length,
    flat_non_meta_tool_count: flatNonMetaToolNames.length,
    full_facade_available: META_TOOLS.every(name => metaPresence[name]),
    meta_presence: metaPresence,
    category_count: categories.length,
    hierarchical_tool_count: hierarchicalToolCount,
    hierarchical_name_match_count: flatNonMetaToolNames.length - rawFlatHierarchyGap.length,
    flat_hierarchy_count_gap: flatHierarchyCountGap,
    raw_flat_hierarchy_gap_count: rawFlatHierarchyGap.length,
    raw_flat_hierarchy_gap: rawFlatHierarchyGap,
    raw_flat_hierarchy_gap_sample: rawFlatHierarchyGap.slice(0, 24),
    app_visible_ledger_accounting: ledgerAccounting,
    removed_from_app_visible_ledger_count: ledgerAccounting.removed_from_app_visible_ledger_count,
    removed_from_app_visible_ledger_descriptors: ledgerAccounting.removed_from_app_visible_ledger_descriptors,
    removed_from_app_visible_ledger_sample: ledgerAccounting.removed_from_app_visible_ledger_descriptors.slice(0, 24),
    flat_direct_only_count: directOnlyDescriptors.length,
    flat_direct_only_descriptors: directOnlyDescriptors,
    flat_direct_only_policy_counts: countBy(directOnlyDescriptors, descriptor => descriptor.policy_class),
    flat_direct_only_reason_counts: countBy(directOnlyDescriptors, descriptor => descriptor.reason_class),
    flat_direct_only_sample: directOnlyDescriptors.slice(0, 24),
    flat_gap_classification_count: classifiedDescriptors.length,
    flat_gap_classifications: classifiedDescriptors,
    unexplained_flat_hierarchy_gap_count: unexplainedFlatHierarchyGap.length,
    unexplained_flat_hierarchy_gap: unexplainedFlatHierarchyGap,
    unexplained_flat_hierarchy_gap_sample: unexplainedFlatHierarchyGap.slice(0, 24),
    flat_hierarchy_gap_count: unexplainedFlatHierarchyGap.length,
    flat_hierarchy_gap_sample: unexplainedFlatHierarchyGap.slice(0, 24),
    flat_hierarchy_gap_closure: {
      accounted: unexplainedFlatHierarchyGap.length === 0,
      listed_through_hierarchy_count: flatNonMetaToolNames.length - rawFlatHierarchyGap.length,
      removed_from_app_visible_ledger_count: ledgerAccounting.removed_from_app_visible_ledger_count,
      direct_only_count: directOnlyDescriptors.length,
      unexplained_count: unexplainedFlatHierarchyGap.length,
    },
    nonempty_category_count: categoryRows.filter(row => row.listed_tool_count > 0).length,
    sample_categories: categoryRows.filter(row => row.listed_tool_count > 0).slice(0, 12),
    schema_probe: schemaProbe
      ? {
          ok: schemaProbe.ok && !isErrorResult(schemaProbe.json),
          category: sample.category,
          tool: sample.tool,
          status: schemaProbe.status,
        }
      : null,
    dispatch_probe: dispatchProbe
      ? {
          ok: dispatchProbe.ok && !isErrorResult(dispatchProbe.json),
          category: sample.category,
          tool: sample.tool,
          status: dispatchProbe.status,
        }
      : null,
    alias_dispatch_probe_count: aliasDispatchProbes.length,
    alias_dispatch_pass_count: aliasDispatchProbes.filter(probe => probe.ok).length,
    alias_dispatch_failed_count: aliasDispatchFailedCount,
    alias_dispatch_probes: aliasDispatchProbes,
    direct_only_probe_count: directOnlyProbes.length,
    direct_only_receipt_count: directOnlyProbes.filter(probe => probe.receipt).length,
    direct_only_probes: directOnlyProbes,
  };
}

function classifyFlatHierarchyGap(service, flatHierarchyGap) {
  if (service !== 'ipfs_datasets_py') {
    return {
      directOnlyDescriptors: [],
      classifiedDescriptors: [],
      unexplainedFlatHierarchyGap: flatHierarchyGap,
    };
  }

  const classifiedDescriptors = flatHierarchyGap.map(name => classifyIpfsDatasetsDirectOnlyDescriptor(name));
  const directOnlyDescriptors = classifiedDescriptors.filter(descriptor => descriptor.direct_only);
  return {
    directOnlyDescriptors,
    classifiedDescriptors,
    unexplainedFlatHierarchyGap: classifiedDescriptors
      .filter(descriptor => !descriptor.direct_only)
      .map(descriptor => descriptor.name)
      .sort(),
  };
}

function readAllToolsLedger() {
  let ledger = null;
  let ledgerError = null;
  try {
    ledger = JSON.parse(fs.readFileSync(allToolsLedgerPath, 'utf8'));
  } catch (error) {
    ledgerError = error instanceof Error ? error.message : String(error);
  }

  const records = Array.isArray(ledger?.records)
    ? ledger.records
    : Array.isArray(ledger?.tools)
      ? ledger.tools
      : [];
  const appVisible = readAppVisibleLedger(records);
  return {
    available: Boolean(ledger),
    schema: ledger?.schema ?? null,
    records,
    app_visible_ledger_available: appVisible.available || Boolean(ledger),
    app_visible_ledger_schema: appVisible.schema ?? ledger?.schema ?? null,
    app_visible_ledger_source: appVisible.available ? 'all-tools-app-bindings' : 'all-tools-ledger',
    app_visible_ledger_path: appVisible.available ? allToolsAppBindingsPath : allToolsLedgerPath,
    app_visible_records: appVisible.available ? appVisible.records : records,
    app_visible_error: appVisible.error,
    error: ledgerError,
  };
}

function readAppVisibleLedger(ledgerRecords) {
  try {
    const bindings = JSON.parse(fs.readFileSync(allToolsAppBindingsPath, 'utf8'));
    const rows = Array.isArray(bindings.rows)
      ? bindings.rows
      : Array.isArray(bindings.bindings)
        ? bindings.bindings
        : [];
    const ledgerByToolId = new Map(ledgerRecords.map(record => [record.id ?? record.tool_id, record]));
    return {
      available: true,
      schema: bindings.schema ?? null,
      records: rows
        .filter(isAppVisibleBindingRow)
        .map(row => normalizeAppVisibleBinding(row, ledgerByToolId))
        .filter(row => row.service && row.name),
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      schema: null,
      records: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isAppVisibleBindingRow(row) {
  if (!row) return false;
  if (row.app_visible === false) return false;
  if (row.disposition === 'adapter_source_only' || row.normalized_disposition === 'adapter_source_only') return false;
  if (row.exposure === 'adapter_source_only') return false;
  if (row.app_visible === true) return true;
  return row.disposition === 'app_capability' || row.normalized_disposition === 'app_capability' || Boolean(row.app_id);
}

function normalizeAppVisibleBinding(row, ledgerByToolId) {
  const toolId = row.tool_id ?? row.id;
  const ledgerRecord = toolId ? ledgerByToolId.get(toolId) : null;
  const parsed = parseToolId(toolId);
  return {
    ...ledgerRecord,
    ...row,
    id: toolId ?? ledgerRecord?.id,
    service: row.service ?? row.service_id ?? ledgerRecord?.service ?? parsed.service ?? '',
    service_id: row.service_id ?? row.service ?? ledgerRecord?.service_id ?? parsed.service ?? '',
    role: row.role ?? ledgerRecord?.role ?? parsed.role ?? null,
    name: row.name ?? ledgerRecord?.name ?? parsed.name ?? '',
  };
}

function parseToolId(toolId) {
  if (typeof toolId !== 'string') return {};
  const [service, role, ...nameParts] = toolId.split(':');
  if (!service || !role || nameParts.length === 0) return {};
  return {
    service,
    role,
    name: nameParts.join(':'),
  };
}

function accountFlatDescriptorsInAppVisibleLedger(service, flatNonMetaToolNames, rawFlatHierarchyGap, allToolsLedger) {
  const appVisibleLedgerAvailable = allToolsLedger.app_visible_ledger_available ?? allToolsLedger.available ?? false;
  const appVisibleLedgerSchema = allToolsLedger.app_visible_ledger_schema ?? allToolsLedger.schema ?? null;
  const appVisibleRecords = allToolsLedger.app_visible_records ?? allToolsLedger.records ?? [];
  const appVisibleLedgerSource = allToolsLedger.app_visible_ledger_source ?? 'all-tools-ledger';
  const ledgerNames = ledgerToolNamesFor(service, allToolsLedger);
  const appVisibleFlatDescriptorNames = flatNonMetaToolNames
    .filter(name => ledgerNames.has(name))
    .sort();
  const removedFromLedger = appVisibleLedgerAvailable
    ? rawFlatHierarchyGap.filter(name => !ledgerNames.has(name)).sort()
    : [];

  return {
    app_visible_ledger_available: appVisibleLedgerAvailable,
    app_visible_ledger_source: appVisibleLedgerSource,
    app_visible_ledger_schema: appVisibleLedgerSchema,
    app_visible_ledger_record_count: appVisibleRecords.length,
    app_visible_flat_descriptor_count: appVisibleFlatDescriptorNames.length,
    app_visible_flat_descriptor_names: appVisibleFlatDescriptorNames,
    app_visible_flat_descriptor_sample: appVisibleFlatDescriptorNames.slice(0, 24),
    removed_from_app_visible_ledger_count: removedFromLedger.length,
    removed_from_app_visible_ledger_descriptors: removedFromLedger,
    removed_from_app_visible_ledger_policy: appVisibleLedgerAvailable
      ? 'accounted_as_removed_from_swissknife_app_visible_ledger'
      : 'not_available_for_accounting',
  };
}

function ledgerToolNamesFor(service, allToolsLedger) {
  const names = new Set();
  const appVisibleLedgerAvailable = allToolsLedger.app_visible_ledger_available ?? allToolsLedger.available ?? false;
  const appVisibleRecords = allToolsLedger.app_visible_records ?? allToolsLedger.records ?? [];
  if (!appVisibleLedgerAvailable) return names;
  for (const record of appVisibleRecords) {
    if (record?.service !== service.service) continue;
    if (service.role && record.role && record.role !== service.role) continue;
    const name = toolName(record);
    if (!name || META_TOOLS.includes(name)) continue;
    names.add(name);
  }
  return names;
}

function classifyIpfsDatasetsDirectOnlyDescriptor(name) {
  const policyClass = classifyPolicyClass(name);
  const reason = directOnlyReason(name);
  return {
    name,
    direct_only: reason.direct_only,
    policy_class: policyClass,
    reason_class: reason.reason_class,
    reason: reason.reason,
    dispatch_surface: reason.direct_only ? 'tools/call' : null,
    app_visible_ledger_policy: reason.direct_only ? 'allowed_when_policy_gated' : 'unexplained_gap_blocked',
  };
}

function directOnlyReason(name) {
  for (const [prefix, policy] of IPFS_DATASETS_DIRECT_ONLY_ROOT_PREFIXES.entries()) {
    if (name.startsWith(prefix)) {
      return {
        direct_only: true,
        ...policy,
      };
    }
  }

  if (name.includes('.')) {
    const [namespace] = name.split('.');
    const policy = IPFS_DATASETS_DIRECT_ONLY_NAMESPACE_POLICIES[namespace];
    if (policy) {
      return {
        direct_only: true,
        ...policy,
        reason: `${policy.reason} Namespace: ${namespace}.`,
      };
    }
  }

  return {
    direct_only: false,
    reason_class: 'unclassified_flat_descriptor',
    reason: 'Descriptor is not covered by the explicit SWR-081 direct-only policy and must be listed hierarchically, removed from the app-visible ledger, or given a reviewed policy class.',
  };
}

function classifyPolicyClass(name) {
  const lower = name.toLowerCase();
  if (/(delete|remove|stop|kill|unpin|purge|destroy|revoke)/.test(lower)) return 'destructive';
  if (/(credential|oauth|auth|token|key|secret|login|permission)/.test(lower)) return 'credential';
  if (/(discord|email|github|cli|network|http|download|upload|publish|external|webhook|slack|telegram)/.test(lower)) return 'external_network';
  if (/(camera|audio|media|image|video|microphone|multimedia)/.test(lower)) return 'media_capture';
  if (/(workflow|vector|embedding|index|prover|tdfol|fol|logic|graph|search|dataset|analysis|analytics|model|cluster|batch|job|task|worker|ocr|pdf|nlp)/.test(lower)) return 'heavy_compute';
  if (/(add|register|create|update|save|set|execute|run|process|convert|generate|record|log|write|store|import|export|ingest|sync|build)/.test(lower)) return 'write';
  return 'read';
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function writeIpfsDatasetsGapDoc(report) {
  const service = report.services.find(row => row.service === 'ipfs_datasets_py');
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, renderIpfsDatasetsGapDoc(report, service), 'utf8');
}

function renderIpfsDatasetsGapDoc(report, service) {
  const lines = [];
  lines.push('# IPFS Datasets Hierarchical Tool Gap');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  if (!service) {
    lines.push('No `ipfs_datasets_py` service row was present in the hierarchical evidence.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`- Evidence decision: \`${report.decision}\``);
  lines.push(`- Live fleet required for command exit: \`${Boolean(report.live_fleet_required)}\``);
  lines.push(`- Responding configured services: ${report.summary?.available_service_count ?? 0}/${report.summary?.service_count ?? 0}`);
  if (Array.isArray(report.summary?.unavailable_services) && report.summary.unavailable_services.length > 0) {
    lines.push(`- Unavailable configured services: ${report.summary.unavailable_services.map(name => `\`${name}\``).join(', ')}`);
  }
  lines.push(`- Flat non-meta descriptors: ${service.flat_non_meta_tool_count}`);
  lines.push(`- Listed through \`tools_list_categories\` plus \`tools_list_tools\`: ${service.flat_hierarchy_gap_closure?.listed_through_hierarchy_count ?? 'unknown'}`);
  lines.push(`- Raw flat/direct descriptors not listed hierarchically: ${service.raw_flat_hierarchy_gap_count}`);
  lines.push(`- Removed from SwissKnife app-visible ledger: ${service.removed_from_app_visible_ledger_count}`);
  lines.push(`- Explicit direct-only descriptors: ${service.flat_direct_only_count}`);
  lines.push(`- Unexplained flat/direct descriptor gaps: ${service.unexplained_flat_hierarchy_gap_count}`);
  lines.push(`- Hierarchical alias dispatch probes: ${service.alias_dispatch_pass_count ?? 0}/${service.alias_dispatch_probe_count ?? 0}`);
  lines.push(`- Direct-only receipt probes: ${service.direct_only_receipt_count ?? 0}/${service.direct_only_probe_count ?? 0}`);
  lines.push('');

  lines.push('## Closure Policy');
  lines.push('');
  lines.push('A live `ipfs_datasets_py` non-meta flat descriptor is considered accounted for when one of these conditions is true:');
  lines.push('');
  lines.push('1. The descriptor name, `category.tool`, or `category_tool` form is returned through `tools_list_categories` and `tools_list_tools`.');
  lines.push('2. The descriptor is explicitly classified below as direct-only with a policy class, dispatch surface, and reason.');
  lines.push('3. The descriptor is absent from the SwissKnife app-visible ledger generated from the live tool surface.');
  lines.push('');
  lines.push('SWR-081 closes only the unexplained gap. Direct-only descriptors remain callable through `tools/call` and must continue to use the policy, confirmation, receipt, and app binding gates from the all-tools ledger.');
  lines.push('');
  lines.push('The direct-only classifier is explicit and finite: unknown root descriptors or category namespaces remain unexplained and make the evidence `no_go` until they are listed hierarchically, removed from the app-visible ledger, or reviewed into this policy.');
  lines.push('');

  lines.push('## App-Visible Ledger Accounting');
  lines.push('');
  lines.push(`- Ledger available: \`${Boolean(service.app_visible_ledger_accounting?.app_visible_ledger_available)}\``);
  lines.push(`- Ledger source: \`${service.app_visible_ledger_accounting?.app_visible_ledger_source ?? 'unknown'}\``);
  lines.push(`- Ledger schema: \`${service.app_visible_ledger_accounting?.app_visible_ledger_schema ?? 'unavailable'}\``);
  lines.push(`- Live non-meta descriptors still present in ledger: ${service.app_visible_ledger_accounting?.app_visible_flat_descriptor_count ?? 0}`);
  lines.push(`- Raw hierarchy gaps accounted as removed from ledger: ${service.removed_from_app_visible_ledger_count ?? 0}`);
  lines.push('');
  if ((service.removed_from_app_visible_ledger_count ?? 0) > 0) {
    lines.push('| Descriptor removed from ledger | Accounting policy |');
    lines.push('|---|---|');
    for (const name of service.removed_from_app_visible_ledger_descriptors ?? service.removed_from_app_visible_ledger_sample ?? []) {
      lines.push(`| \`${name}\` | \`accounted_as_removed_from_swissknife_app_visible_ledger\` |`);
    }
    lines.push('');
  }

  lines.push('## Direct-Only Classifier Policy');
  lines.push('');
  lines.push('| Scope | Reason class | Reason |');
  lines.push('|---|---|---|');
  for (const [prefix, policy] of IPFS_DATASETS_DIRECT_ONLY_ROOT_PREFIXES.entries()) {
    lines.push(`| \`${prefix}*\` | \`${policy.reason_class}\` | ${escapeTable(policy.reason)} |`);
  }
  for (const [namespace, policy] of Object.entries(IPFS_DATASETS_DIRECT_ONLY_NAMESPACE_POLICIES).sort()) {
    lines.push(`| \`${namespace}.*\` | \`${policy.reason_class}\` | ${escapeTable(policy.reason)} |`);
  }
  lines.push('');

  lines.push('## Direct-Only Reason Classes');
  lines.push('');
  lines.push('| Reason class | Count | Policy |');
  lines.push('|---|---:|---|');
  for (const [reasonClass, count] of Object.entries(service.flat_direct_only_reason_counts ?? {}).sort()) {
    lines.push(`| \`${reasonClass}\` | ${count} | Direct ` +
      'descriptors in this class are app-visible only when the all-tools policy matrix permits the policy class and requires the matching confirmation/receipt behavior. |');
  }
  if (Object.keys(service.flat_direct_only_reason_counts ?? {}).length === 0) {
    lines.push('| none | 0 | No direct-only descriptors were observed. |');
  }
  lines.push('');

  lines.push('## Direct-Only Policy Counts');
  lines.push('');
  lines.push('| Policy class | Count |');
  lines.push('|---|---:|');
  for (const [policyClass, count] of Object.entries(service.flat_direct_only_policy_counts ?? {}).sort()) {
    lines.push(`| \`${policyClass}\` | ${count} |`);
  }
  if (Object.keys(service.flat_direct_only_policy_counts ?? {}).length === 0) {
    lines.push('| none | 0 |');
  }
  lines.push('');

  lines.push('## Direct-Only Descriptor Ledger');
  lines.push('');
  lines.push('| Descriptor | Policy class | Reason class | Dispatch surface | Reason |');
  lines.push('|---|---|---|---|---|');
  for (const descriptor of service.flat_direct_only_descriptors ?? service.flat_direct_only_sample ?? []) {
    lines.push(`| \`${descriptor.name}\` | \`${descriptor.policy_class}\` | \`${descriptor.reason_class}\` | \`${descriptor.dispatch_surface}\` | ${escapeTable(descriptor.reason)} |`);
  }
  if ((service.flat_direct_only_count ?? 0) === 0) {
    lines.push('| none | none | none | none | No direct-only descriptors were observed. |');
  }
  lines.push('');

  lines.push('## Dispatch Receipt Evidence');
  lines.push('');
  lines.push('| Probe | Outcome | Receipt type | Route |');
  lines.push('|---|---|---|---|');
  for (const probe of service.alias_dispatch_probes ?? []) {
    lines.push(`| \`${probe.alias}\` | \`${probe.response_type}\` | \`${probe.receipt?.receipt_type ?? 'none'}\` | \`${probe.category ?? 'unresolved'}.${probe.tool ?? 'unresolved'}\` |`);
  }
  for (const probe of service.direct_only_probes ?? []) {
    lines.push(`| \`${probe.name}\` | \`${probe.response_type}\` | \`${probe.receipt?.receipt_type ?? 'none'}\` | \`${probe.dispatch_surface ?? 'none'}\` |`);
  }
  if ((service.alias_dispatch_probe_count ?? 0) === 0 && (service.direct_only_probe_count ?? 0) === 0) {
    lines.push('| none | none | none | none |');
  }
  lines.push('');

  lines.push('## Unexplained Gap');
  lines.push('');
  if ((service.unexplained_flat_hierarchy_gap_count ?? 0) === 0) {
    lines.push('No unexplained `ipfs_datasets_py` flat/direct descriptor gap remains.');
  } else {
    lines.push(`${service.unexplained_flat_hierarchy_gap_count} descriptors still need a hierarchy listing, direct-only classification, or ledger removal:`);
    lines.push('');
    for (const name of service.unexplained_flat_hierarchy_gap_sample ?? []) {
      lines.push(`- \`${name}\``);
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function normalizedHierarchicalToolNames(categoryRows) {
  const names = new Set();
  for (const row of categoryRows) {
    for (const name of row.tool_names ?? []) {
      names.add(name);
      names.add(`${row.name}.${name}`);
      names.add(`${row.name}_${name}`);
    }
  }
  return names;
}

function buildHierarchicalAliasIndex(categoryRows) {
  const aliases = new Map();
  const ambiguous = new Set();
  const addAlias = (alias, ref) => {
    if (!alias || ambiguous.has(alias)) return;
    const existing = aliases.get(alias);
    if (existing && (existing.category !== ref.category || existing.tool !== ref.tool)) {
      aliases.delete(alias);
      ambiguous.add(alias);
      return;
    }
    aliases.set(alias, ref);
  };

  for (const row of categoryRows) {
    const category = row.name;
    if (!category) continue;
    for (const rawName of row.tool_names ?? []) {
      const tool = leafToolName(category, rawName);
      const baseRef = {
        category,
        tool,
        canonical_name: `${category}.${tool}`,
      };
      addAlias(rawName, { ...baseRef, alias: rawName, alias_kind: rawName === tool ? 'canonical' : 'category_qualified' });
      addAlias(tool, { ...baseRef, alias: tool, alias_kind: 'canonical' });
      addAlias(`${category}.${tool}`, { ...baseRef, alias: `${category}.${tool}`, alias_kind: 'dot_qualified' });
      addAlias(`${category}/${tool}`, { ...baseRef, alias: `${category}/${tool}`, alias_kind: 'slash_qualified' });
      addAlias(`${category}_${tool}`, { ...baseRef, alias: `${category}_${tool}`, alias_kind: 'underscore_qualified' });
    }
  }

  return { aliases, ambiguous };
}

function resolveHierarchicalToolAlias(categoryRows, alias) {
  const index = buildHierarchicalAliasIndex(categoryRows);
  const normalized = String(alias ?? '').trim();
  if (index.ambiguous.has(normalized)) {
    return {
      resolved: false,
      alias: normalized,
      reason: 'ambiguous_alias',
    };
  }
  const ref = index.aliases.get(normalized);
  if (!ref) {
    return {
      resolved: false,
      alias: normalized,
      reason: 'not_listed_in_hierarchy',
    };
  }
  return {
    resolved: true,
    ...ref,
  };
}

function leafToolName(category, rawName) {
  if (rawName.startsWith(`${category}.`) || rawName.startsWith(`${category}/`) || rawName.startsWith(`${category}_`)) {
    return rawName.slice(category.length + 1);
  }
  return rawName;
}

async function probeHierarchicalAliasDispatch(endpoint, categoryRows, sample) {
  const aliases = [
    { alias: sample.tool, expected_alias_kind: 'canonical' },
    { alias: `${sample.category}.${sample.tool}`, expected_alias_kind: 'dot_qualified' },
    { alias: `${sample.category}/${sample.tool}`, expected_alias_kind: 'slash_qualified' },
    { alias: `${sample.category}_${sample.tool}`, expected_alias_kind: 'underscore_qualified' },
  ].filter((entry, index, list) => list.findIndex(candidate => candidate.alias === entry.alias) === index);

  const probes = [];
  for (const entry of aliases) {
    const resolved = resolveHierarchicalToolAlias(categoryRows, entry.alias);
    const routeMatchesSample = resolved.resolved
      && resolved.category === sample.category
      && resolved.tool === sample.tool;
    const dispatch = routeMatchesSample
      ? await callTool(endpoint, 'tools_dispatch', { category: resolved.category, tool: resolved.tool, params: sample.params ?? {} })
      : null;
    const dispatchOk = dispatch ? dispatch.ok && !isErrorResult(dispatch.json) : false;
    probes.push({
      alias: entry.alias,
      expected_alias_kind: entry.expected_alias_kind,
      ok: Boolean(routeMatchesSample && dispatchOk),
      resolved: resolved.resolved,
      alias_kind: resolved.alias_kind ?? null,
      category: resolved.category ?? null,
      tool: resolved.tool ?? null,
      canonical_name: resolved.canonical_name ?? null,
      route_matches_sample: Boolean(routeMatchesSample),
      status: dispatch?.status ?? null,
      response_type: dispatchOk ? 'tools_dispatch_success' : (resolved.resolved ? 'tools_dispatch_failed' : 'alias_resolution_failed'),
      receipt: {
        receipt_type: 'hierarchical_alias_dispatch_probe',
        dispatch_surface: 'tools_dispatch',
        alias: entry.alias,
        expected_alias_kind: entry.expected_alias_kind,
        resolved: resolved.resolved,
        category: resolved.category ?? null,
        tool: resolved.tool ?? null,
        canonical_name: resolved.canonical_name ?? null,
        route_validation: routeMatchesSample ? 'matched_representative_route' : resolved.reason ?? 'route_mismatch',
        response_status: dispatch?.status ?? null,
      },
    });
  }
  return probes;
}

async function probeDirectOnlyDescriptors(endpoint, directOnlyDescriptors) {
  const preferred = ['policy_list', 'interface_list', 'compliance_list_rules'];
  const selected = [];
  for (const name of preferred) {
    const descriptor = directOnlyDescriptors.find(candidate => candidate.name === name);
    if (descriptor) selected.push(descriptor);
  }
  for (const descriptor of directOnlyDescriptors) {
    if (selected.length >= 3) break;
    if (descriptor.policy_class !== 'read') continue;
    if (selected.some(candidate => candidate.name === descriptor.name)) continue;
    selected.push(descriptor);
  }

  const probes = [];
  for (const descriptor of selected) {
    const shouldAttemptDirectCall = descriptor.policy_class === 'read';
    const direct = shouldAttemptDirectCall
      ? await callTool(endpoint, descriptor.name, {})
      : null;
    const directOk = direct ? direct.ok && !isErrorResult(direct.json) : false;
    probes.push({
      name: descriptor.name,
      ok: true,
      direct_only: true,
      policy_class: descriptor.policy_class,
      reason_class: descriptor.reason_class,
      dispatch_surface: descriptor.dispatch_surface,
      direct_call_attempted: shouldAttemptDirectCall,
      direct_call_ok: directOk,
      direct_call_status: direct?.status ?? null,
      response_type: directOk ? 'direct_tools_call_success' : 'typed_direct_only_policy_response',
      receipt: {
        receipt_type: 'direct_only_descriptor_probe',
        descriptor: descriptor.name,
        dispatch_surface: descriptor.dispatch_surface,
        policy_class: descriptor.policy_class,
        reason_class: descriptor.reason_class,
        outcome: directOk ? 'direct_call_succeeded' : 'direct_only_classification_returned',
        direct_call_attempted: shouldAttemptDirectCall,
        direct_call_status: direct?.status ?? null,
      },
    });
  }
  return probes;
}

function selectDispatchSample(service, categories) {
  const preferred = {
    ipfs_kit_py: [
      ['System', 'health_check'],
      ['System', 'get_system_status'],
    ],
    ipfs_datasets_py: [
      ['bespoke_tools', 'system_status'],
      ['dataset_tools', 'load_dataset'],
    ],
    ipfs_accelerate_py: [
      ['hardware', 'detect_hardware'],
      ['telemetry', 'get_server_status'],
    ],
  }[service] ?? [];

  for (const [category, tool] of preferred) {
    const row = categories.find(candidate => candidate.name === category);
    if (row?.sample_tools?.some(sample => sample.name === tool)) return { category, tool };
  }

  const first = categories.find(row => row.sample_tools.length > 0);
  const tool = first?.sample_tools?.[0]?.name;
  return first && tool ? { category: first.name, tool } : null;
}

async function callTool(endpoint, name, args) {
  return rpc(endpoint, 'tools/call', { name, arguments: args });
}

async function rpc(endpoint, method, params) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `${Date.now()}-${Math.random()}`,
        method,
        params,
      }),
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
      text: error instanceof Error ? error.message : String(error),
    };
  }
}

function unwrapToolPayload(json) {
  const result = json?.result ?? json;
  if (Array.isArray(result?.content)) {
    for (const item of result.content) {
      if (item?.type === 'json') return item.json;
      if (typeof item?.text === 'string') {
        const parsed = parseJson(item.text);
        if (parsed) return parsed;
      }
    }
  }
  return result;
}

function extractCategories(payload) {
  if (Array.isArray(payload)) return payload.map(normalizeCategory);
  if (Array.isArray(payload?.categories)) return payload.categories.map(normalizeCategory);
  return [];
}

function normalizeCategory(category) {
  if (typeof category === 'string') return { name: category };
  return {
    name: category?.name ?? category?.category ?? category?.id ?? '',
    description: typeof category?.description === 'string' ? category.description : '',
    tool_count: numberOrNull(category?.tool_count ?? category?.count),
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

function toolName(tool) {
  if (typeof tool === 'string') return tool;
  return tool?.name ?? tool?.tool ?? tool?.id ?? '';
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isErrorResult(json) {
  const payload = unwrapToolPayload(json);
  if (json?.error) return true;
  if (json?.result?.isError) return true;
  if (payload?.status === 'not_found' || payload?.status === 'error') return true;
  return false;
}

module.exports = {
  META_TOOLS,
  IPFS_DATASETS_DIRECT_ONLY_ROOT_PREFIXES,
  IPFS_DATASETS_DIRECT_ONLY_NAMESPACE_POLICIES,
  classifyFlatHierarchyGap,
  classifyIpfsDatasetsDirectOnlyDescriptor,
  classifyPolicyClass,
  directOnlyReason,
  buildHierarchicalAliasIndex,
  normalizedHierarchicalToolNames,
  resolveHierarchicalToolAlias,
  renderIpfsDatasetsGapDoc,
  accountFlatDescriptorsInAppVisibleLedger,
};

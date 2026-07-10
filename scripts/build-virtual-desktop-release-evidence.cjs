#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const evidenceRootRelative = path.relative(projectRoot, evidenceRoot);
const sameBatchEvidenceWindowMs = 15 * 60 * 1000;

const artifactDefs = [
  ['app_inventory', 'app-inventory.json', true],
  ['app_backend_contract', 'app-backend-contract.json', true],
  ['app_workflow_matrix', 'app-workflow-matrix.json', true],
  ['manifest_drift', 'manifest-drift.json', false],
  ['app_launch', 'app-launch-report.json', false],
  ['capability_matrix', 'capability-matrix.json', false],
  ['all_server_tool_catalog', 'all-server-tool-catalog.json', true],
  ['mcp_plus_plus_libp2p_catalog', 'mcp-plus-plus-libp2p-catalog.json', true],
  ['mcpplusplus_libp2p_reachability', 'mcpplusplus-libp2p-reachability.json', true],
  ['descriptor_discovery', 'descriptor-discovery.json', true],
  ['hierarchical_mcp_tools', 'hierarchical-tools-evidence.json', true],
  ['service_health', 'service-health.json', true],
  ['tool_ui_smoke_receipts', 'tool-ui-smoke-receipts.json', true],
  ['agent_supervisor_console_e2e', 'agent-supervisor-console-e2e.json', true],
  ['agent_supervisor_console_receipts', 'agent-supervisor-console-receipts.json', true],
  ['orb_idl_complete_coverage', 'orb-idl-complete-coverage.json', true],
  ['glasses_simulator_handoff', 'glasses-simulator-handoff.json', true],
  ['glasses_handoff', 'glasses-handoff-report.json', false],
  ['live_critical_flows', 'live-critical-flows.json', false],
  ['receipt_samples', 'receipt-samples.json', false],
  ['all_tools_ledger', 'all-tools-ledger.json', true],
  ['all_tools_policy_matrix', 'all-tools-policy-matrix.json', true],
  ['all_tools_app_bindings', 'all-tools-app-bindings.json', true],
  ['all_tools_app_family_coverage', 'all-tools-app-family-coverage.json', true],
  ['all_tools_execution_report', 'all-tools-execution-report.json', true],
  ['all_tools_idl_coverage', 'all-tools-idl-coverage.json', true],
  ['all_tools_glasses_coverage', 'all-tools-glasses-coverage.json', true],
  ['all_tools_policy_release_gate', 'all-tools-policy-release-gate.json', true],
];

const generatedAt = new Date().toISOString();
const artifacts = {};
const data = {};
const warnings = [];
const representativeBlockers = [];
const allToolsBlockers = [];

for (const [key, fileName, required] of artifactDefs) {
  const artifact = readArtifact(fileName, required);
  artifacts[key] = artifact.status;
  data[key] = artifact.data;
  if (!artifact.data && required) {
    const targetBlockers = key.startsWith('all_tools_') ? allToolsBlockers : representativeBlockers;
    targetBlockers.push(`Missing required release evidence artifact: ${artifact.status.path}`);
  } else if (!artifact.data && !required) {
    warnings.push(`Optional release evidence artifact is missing: ${artifact.status.path}`);
  }
}

const appInventory = data.app_inventory;
const appBackendContract = data.app_backend_contract;
const appWorkflowMatrix = data.app_workflow_matrix;
const manifestDrift = data.manifest_drift;
const appLaunch = data.app_launch;
const descriptorDiscovery = data.descriptor_discovery;
const hierarchicalMcpTools = data.hierarchical_mcp_tools;
const serviceHealth = data.service_health;
const toolUiSmokeReceipts = data.tool_ui_smoke_receipts;
const agentSupervisorConsoleE2e = data.agent_supervisor_console_e2e;
const agentSupervisorConsoleReceipts = data.agent_supervisor_console_receipts;
const orbIdlCompleteCoverage = data.orb_idl_complete_coverage;
const glassesSimulatorHandoff = data.glasses_simulator_handoff;
const glassesHandoff = data.glasses_handoff;
const liveCriticalFlows = data.live_critical_flows;
const receiptSamples = data.receipt_samples;
const allToolsLedger = data.all_tools_ledger;
const allToolsPolicyMatrix = data.all_tools_policy_matrix;
const allToolsAppBindings = data.all_tools_app_bindings;
const allToolsAppFamilyCoverage = data.all_tools_app_family_coverage;
const allToolsExecutionReport = data.all_tools_execution_report;
const allToolsIdlCoverage = data.all_tools_idl_coverage;
const allToolsGlassesCoverage = data.all_tools_glasses_coverage;
const allToolsReleaseGate = data.all_tools_policy_release_gate;
const allServerToolCatalog = data.all_server_tool_catalog;
const mcpPlusPlusLibp2pCatalog = data.mcp_plus_plus_libp2p_catalog;
const mcpPlusPlusLibp2pReachability = data.mcpplusplus_libp2p_reachability;
const requiredHierarchicalMetaTools = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];

const appScreenshotCoverage = screenshotCoverage(
  'app-screenshots',
  appWorkflowMatrix?.app_count ?? appLaunch?.app_count ?? appInventory?.app_count ?? null,
);
const glassesScreenshotCoverage = screenshotCoverage(
  'glasses-screenshots',
  glassesHandoff?.displayable_count ? glassesHandoff.displayable_count * 2 : null,
);

const appInventorySummary = {
  manifest_app_count: appInventory?.app_count ?? null,
  inventory_artifact_status: artifacts.app_inventory.status,
  inventory_app_count: appInventory?.summary?.app_count ?? appInventory?.app_count ?? null,
  inventory_path: artifacts.app_inventory.path,
};

const launchStatus = appLaunch
  ? {
      status: 'present',
      path: artifacts.app_launch.path,
      generated_at: appLaunch.generated_at,
      app_count: appLaunch.app_count,
      opened: appLaunch.summary?.opened ?? null,
      classifications: {
        real: appLaunch.summary?.real ?? 0,
        partial: appLaunch.summary?.partial ?? 0,
        placeholder: appLaunch.summary?.placeholder ?? 0,
        generated: appLaunch.summary?.generated ?? 0,
      },
      broken_apps: (appLaunch.results ?? [])
        .filter(result => !result.opened || result.status === 'broken')
        .map(result => result.app_id),
      placeholder_apps: (appLaunch.results ?? [])
        .filter(result => result.status === 'placeholder')
        .map(result => result.app_id),
    }
  : missingStatus(artifacts.app_launch.path);

if (appLaunch) {
  if ((appLaunch.summary?.broken ?? 0) > 0) {
    representativeBlockers.push(`${appLaunch.summary.broken} virtual desktop apps are broken.`);
  }
  if ((appLaunch.summary?.opened ?? 0) !== appLaunch.app_count) {
    representativeBlockers.push(`App launch evidence opened ${appLaunch.summary?.opened ?? 0}/${appLaunch.app_count} apps.`);
  }
}

if (appScreenshotCoverage.expected !== null && appScreenshotCoverage.count < appScreenshotCoverage.expected) {
  representativeBlockers.push(`App screenshot coverage is ${appScreenshotCoverage.count}/${appScreenshotCoverage.expected}.`);
}
if (glassesScreenshotCoverage.expected !== null && glassesScreenshotCoverage.count < glassesScreenshotCoverage.expected) {
  representativeBlockers.push(`Glasses screenshot coverage is ${glassesScreenshotCoverage.count}/${glassesScreenshotCoverage.expected}.`);
}

if (manifestDrift) {
  if (!manifestDrift.valid || (manifestDrift.errors ?? []).length > 0) {
    representativeBlockers.push(`Manifest drift validation failed with ${(manifestDrift.errors ?? []).length} errors.`);
  }
  for (const warning of manifestDrift.warnings ?? []) {
    warnings.push(`Manifest drift warning: ${warning}`);
  }
}

if (serviceHealth) {
  const unavailable = serviceHealth.summary?.unavailable ?? [];
  if (unavailable.length > 0) {
    representativeBlockers.push(`MCP services unavailable: ${unavailable.join(', ')}.`);
  }
  const endpointFailures = serviceHealth.summary?.endpoint_failures ?? 0;
  if (endpointFailures > 0) {
    warnings.push(`${endpointFailures} MCP endpoint probes failed while service availability remained usable.`);
  }
}

if (descriptorDiscovery) {
  const available = descriptorDiscovery.summary?.live_discovery_available ?? [];
  for (const serviceId of ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']) {
    if (!available.includes(serviceId)) {
      representativeBlockers.push(`${serviceId} live descriptor discovery is unavailable.`);
    }
  }
}

const hierarchicalMcpGate = summarizeHierarchicalMcpGate(
  hierarchicalMcpTools,
  artifacts.hierarchical_mcp_tools,
);
representativeBlockers.push(...hierarchicalMcpGate.release_blockers);
warnings.push(...hierarchicalMcpGate.release_warnings);

if (glassesHandoff) {
  if (!glassesHandoff.hardware_free) {
    representativeBlockers.push('Meta glasses handoff evidence must be hardware-free replayable.');
  }
  if (glassesHandoff.passed_count !== glassesHandoff.displayable_count) {
    representativeBlockers.push(`Meta glasses handoff passed ${glassesHandoff.passed_count}/${glassesHandoff.displayable_count} displayable apps.`);
  }
}

if (liveCriticalFlows) {
  if (liveCriticalFlows.status !== 'passed') {
    representativeBlockers.push(`Live critical MCP flows status is ${liveCriticalFlows.status ?? 'unknown'}.`);
  }
  if (liveCriticalFlows.passed_count !== liveCriticalFlows.flow_count) {
    representativeBlockers.push(`Live critical MCP flows passed ${liveCriticalFlows.passed_count}/${liveCriticalFlows.flow_count}.`);
  }
}

if (receiptSamples && (receiptSamples.samples ?? []).length === 0) {
  representativeBlockers.push('No live receipt samples are available.');
}

const gatewayFallbackSpecs = [
  'test/e2e/storage-provenance-apps.spec.ts',
  'test/e2e/accelerate-datasets-apps.spec.ts',
  'test/e2e/media-artifact-apps.spec.ts',
  'test/e2e/system-network-local-apps.spec.ts',
  'test/e2e/mcp-orb-descriptor-apps.spec.ts',
].map(specPath => ({
  path: specPath,
  present: fs.existsSync(path.join(projectRoot, specPath)),
}));

const allToolsFallbackStateCoverage = allToolsAppFamilyCoverage
  ? {
      status: 'present',
      path: artifacts.all_tools_app_family_coverage.path,
      app_family_count: allToolsAppFamilyCoverage.summary?.app_family_count ?? allToolsAppFamilyCoverage.app_families?.length ?? 0,
      fallback_state_family_count: (allToolsAppFamilyCoverage.app_families ?? [])
        .filter(family => (family.state_coverage ?? []).includes('fallback')).length,
      blocked_state_family_count: (allToolsAppFamilyCoverage.app_families ?? [])
        .filter(family => (family.state_coverage ?? []).includes('blocked')).length,
      degraded_state_family_count: (allToolsAppFamilyCoverage.app_families ?? [])
        .filter(family => (family.state_coverage ?? []).includes('degraded')).length,
      adapter_required_accelerate_count: allToolsAppFamilyCoverage.summary?.adapter_required_accelerate_count ?? 0,
    }
  : missingStatus(artifacts.all_tools_app_family_coverage.path);

if (allToolsFallbackStateCoverage.status === 'present') {
  if (allToolsFallbackStateCoverage.fallback_state_family_count !== allToolsFallbackStateCoverage.app_family_count) {
    allToolsBlockers.push(`All-tools app-family fallback state coverage is ${allToolsFallbackStateCoverage.fallback_state_family_count}/${allToolsFallbackStateCoverage.app_family_count}.`);
  }
  if (allToolsFallbackStateCoverage.blocked_state_family_count !== allToolsFallbackStateCoverage.app_family_count) {
    allToolsBlockers.push(`All-tools app-family blocked state coverage is ${allToolsFallbackStateCoverage.blocked_state_family_count}/${allToolsFallbackStateCoverage.app_family_count}.`);
  }
  if (allToolsFallbackStateCoverage.degraded_state_family_count !== allToolsFallbackStateCoverage.app_family_count) {
    allToolsBlockers.push(`All-tools app-family degraded state coverage is ${allToolsFallbackStateCoverage.degraded_state_family_count}/${allToolsFallbackStateCoverage.app_family_count}.`);
  }
}

const liveReceiptSamples = receiptSamples
  ? {
      status: 'present',
      path: artifacts.receipt_samples.path,
      sample_count: (receiptSamples.samples ?? []).length,
    }
  : missingStatus(artifacts.receipt_samples.path);

const nonLiveReceiptSamples = (glassesHandoff?.results ?? [])
  .filter(result => result.receipt_cid)
  .map(result => ({
    source: 'glasses_handoff',
    app_id: result.app_id,
    receipt_cid: result.receipt_cid,
  }));

const allToolsDrift = allToolsLedger?.summary?.drift
  ?? allToolsLedger?.drift_against_previous_accepted_ledger
  ?? {};
const allToolsTombstoneCount = allToolsLedger?.summary?.tombstone_count
  ?? (allToolsLedger?.tombstones ?? []).length
  ?? 0;
const failedGates = (allToolsReleaseGate?.gates ?? [])
  .filter(gate => gate.status === 'fail' || gate.passed === false);
const adapterBoundaryGate = (allToolsReleaseGate?.gates ?? [])
  .find(gate => (gate.gate_id ?? gate.id) === 'accelerate_adapter_boundary');

if (allToolsReleaseGate) {
  if (failedGates.length > 0) {
    allToolsBlockers.push(...failedGates.map(gate => (
      `All-tools policy gate failed: ${gate.gate_id ?? gate.id} (${gate.summary ?? gate.reason ?? 'SWR-103 all-tools policy gate failed'}).`
    )));
  }
} else {
  allToolsBlockers.push('Missing exhaustive all-tools release policy gate.');
}

if ((allToolsDrift.added_tool_count ?? 0) > 0) {
  allToolsBlockers.push(`${allToolsDrift.added_tool_count} new MCP tools are not in the accepted ledger.`);
}
if ((allToolsDrift.removed_tool_count ?? 0) > 0) {
  allToolsBlockers.push(`${allToolsDrift.removed_tool_count} previously accepted MCP tools disappeared.`);
}
if ((allToolsDrift.changed_schema_tool_count ?? 0) > 0) {
  allToolsBlockers.push(`${allToolsDrift.changed_schema_tool_count} MCP tools changed schema.`);
}

const appMatrixGate = buildVirtualDesktopAppMatrixGate({
  appInventory,
  appBackendContract,
  appWorkflowMatrix,
  allToolsAppBindings,
  allToolsIdlCoverage,
  allToolsGlassesCoverage,
  allServerToolCatalog,
  mcpPlusPlusLibp2pCatalog,
  glassesSimulatorHandoff,
  hierarchicalMcpGate,
});
representativeBlockers.push(...appMatrixGate.representative_blockers);
allToolsBlockers.push(...appMatrixGate.all_tools_blockers);

const swr110Gate = buildSWR110ReleaseGate({
  artifacts,
  appInventory,
  appBackendContract,
  appWorkflowMatrix,
  toolUiSmokeReceipts,
  serviceHealth,
  descriptorDiscovery,
  hierarchicalMcpGate,
  allServerToolCatalog,
  mcpPlusPlusLibp2pCatalog,
  mcpPlusPlusLibp2pReachability,
  allToolsLedger,
  allToolsPolicyMatrix,
  allToolsAppBindings,
  allToolsExecutionReport,
  allToolsIdlCoverage,
  allToolsGlassesCoverage,
  allToolsReleaseGate,
  agentSupervisorConsoleE2e,
  agentSupervisorConsoleReceipts,
  orbIdlCompleteCoverage,
  glassesSimulatorHandoff,
});
representativeBlockers.push(...swr110Gate.representative_blockers);
allToolsBlockers.push(...swr110Gate.all_tools_blockers);

const representativeDecision = representativeBlockers.length === 0 ? 'go' : 'no_go';
const allToolsDecision = allToolsBlockers.length === 0 ? 'go' : 'no_go';
const blockers = dedupe([...representativeBlockers, ...allToolsBlockers]);
const decision = representativeDecision === 'go' && allToolsDecision === 'go' ? 'go' : 'no_go';
const nextActions = decision === 'go' ? [] : releaseNextActions({
  hierarchicalDecision: hierarchicalMcpGate.decision,
  representativeDecision,
  allToolsDecision,
});

const report = {
  schema: 'swissknife.virtual-desktop-release-evidence.v1',
  generated_at: generatedAt,
  evidence_root: evidenceRootRelative,
  manifest: {
    status: appInventory ? 'present' : 'missing',
    manifest_id: appInventory?.manifest_id ?? manifestDrift?.manifest_id ?? null,
    version: appInventory?.manifest_version ?? manifestDrift?.manifest_version ?? null,
    app_count: appInventory?.app_count ?? null,
    categories: appInventory?.summary?.category_counts ?? {},
    launch_kinds: appInventory?.summary?.launch_kind_counts ?? {},
  },
  artifacts,
  app_inventory: appInventorySummary,
  launch_status: launchStatus,
  screenshot_coverage: {
    app_screenshots: appScreenshotCoverage,
    glasses_screenshots: glassesScreenshotCoverage,
  },
  swr110_release_gate: swr110Gate.summary,
  virtual_desktop_app_matrix_gate: appMatrixGate.summary,
  capability_matrix: data.capability_matrix
    ? {
        status: 'present',
        path: artifacts.capability_matrix.path,
        schema: data.capability_matrix.schema,
        generated_at: data.capability_matrix.generated_at,
      }
    : missingStatus(artifacts.capability_matrix.path),
  descriptor_validation: {
    descriptor_discovery: descriptorDiscovery
      ? {
          status: 'present',
          path: artifacts.descriptor_discovery.path,
          generated_at: descriptorDiscovery.generated_at,
          live_discovery_available: descriptorDiscovery.summary?.live_discovery_available ?? [],
          static_fallback_used: descriptorDiscovery.summary?.static_fallback_used ?? [],
          tool_counts: descriptorDiscovery.summary?.tool_counts ?? {},
          interface_counts: descriptorDiscovery.summary?.interface_counts ?? {},
        }
      : missingStatus(artifacts.descriptor_discovery.path),
    manifest_drift: manifestDrift
      ? {
          status: 'present',
          path: artifacts.manifest_drift.path,
          generated_at: manifestDrift.generated_at,
          valid: manifestDrift.valid,
          error_count: (manifestDrift.errors ?? []).length,
          warning_count: (manifestDrift.warnings ?? []).length,
        }
      : missingStatus(artifacts.manifest_drift.path),
  },
  service_health: serviceHealth
    ? {
        status: 'present',
        path: artifacts.service_health.path,
        generated_at: serviceHealth.generated_at,
        service_count: (serviceHealth.services ?? []).length,
        available: serviceHealth.summary?.available ?? [],
        unavailable: serviceHealth.summary?.unavailable ?? [],
        endpoint_failures: serviceHealth.summary?.endpoint_failures ?? 0,
        normalized_failure_count: serviceHealth.summary?.normalized_failure_count ?? serviceHealth.summary?.endpoint_failures ?? 0,
    }
    : missingStatus(artifacts.service_health.path),
  hierarchical_mcp: hierarchicalMcpGate.summary,
  glasses_simulator_handoff: glassesSimulatorHandoff
    ? {
        status: 'present',
        path: artifacts.glasses_simulator_handoff.path,
        schema: glassesSimulatorHandoff.schema ?? null,
        generated_at: glassesSimulatorHandoff.generated_at ?? null,
        hardware_free: glassesSimulatorHandoff.hardware_free ?? null,
        simulator_driven: glassesSimulatorHandoff.simulator_driven ?? null,
        physical_glasses_required: glassesSimulatorHandoff.physical_glasses_required ?? null,
        simulator_id: glassesSimulatorHandoff.simulator?.simulator_id ?? null,
        simulator_capabilities: glassesSimulatorHandoff.simulator?.capabilities ?? {},
        capability_evidence_count: (glassesSimulatorHandoff.capability_evidence ?? []).length,
      }
    : missingStatus(artifacts.glasses_simulator_handoff.path),
  glasses_handoff: glassesHandoff
    ? {
        status: 'present',
        path: artifacts.glasses_handoff.path,
        generated_at: glassesHandoff.generated_at,
        app_count: glassesHandoff.app_count,
        displayable_count: glassesHandoff.displayable_count,
        passed_count: glassesHandoff.passed_count,
        hardware_free: glassesHandoff.hardware_free,
        fallback_targets: countBy(glassesHandoff.results ?? [], result => result.fallback_target ?? 'none'),
        receipt_count: nonLiveReceiptSamples.length,
      }
    : missingStatus(artifacts.glasses_handoff.path),
  fallback_coverage: {
    all_tools_app_family_states: allToolsFallbackStateCoverage,
    legacy_gateway_fallback_specs: gatewayFallbackSpecs,
    legacy_gateway_spec_count: gatewayFallbackSpecs.filter(spec => spec.present).length,
    glasses_fallbacks: glassesHandoff
      ? {
          status: 'present',
          displayable_count: glassesHandoff.displayable_count,
          fallback_count: (glassesHandoff.results ?? []).filter(result => result.fallback_target).length,
          fallback_targets: countBy(glassesHandoff.results ?? [], result => result.fallback_target ?? 'none'),
        }
      : missingStatus(artifacts.glasses_handoff.path),
  },
  receipt_samples: {
    live_receipt_samples: liveReceiptSamples,
    non_live_receipt_samples: nonLiveReceiptSamples,
  },
  representative_app_gate: {
    decision: representativeDecision,
    blocker_count: representativeBlockers.length,
    warning_count: warnings.length,
    blockers: representativeBlockers,
  },
  all_tools: {
    ledger: allToolsLedger
      ? {
          status: 'present',
          path: artifacts.all_tools_ledger.path,
          generated_at: allToolsLedger.generated_at,
          exact_tool_record_count: allToolsLedger.summary?.exact_tool_record_count
            ?? allToolsLedger.summary?.tool_record_count
            ?? allToolsLedger.tools?.length
            ?? allToolsLedger.records?.length
            ?? null,
          live_exact_tool_count: allToolsLedger.summary?.live_exact_tool_count
            ?? allToolsLedger.summary?.configured_live_tool_count
            ?? null,
          static_exact_tool_count: allToolsLedger.summary?.static_exact_tool_count
            ?? allToolsLedger.summary?.static_descriptor_tool_count
            ?? null,
          tombstone_count: allToolsTombstoneCount,
          duplicate_group_count: allToolsLedger.summary?.duplicate_group_count ?? (allToolsLedger.duplicate_groups ?? []).length,
          drift: {
            previous_found: allToolsDrift.previous_found ?? null,
            added_tool_count: allToolsDrift.added_tool_count ?? 0,
            removed_tool_count: allToolsDrift.removed_tool_count ?? 0,
            changed_schema_tool_count: allToolsDrift.changed_schema_tool_count ?? 0,
          },
        }
      : missingStatus(artifacts.all_tools_ledger.path),
    classification: allToolsPolicyMatrix
      ? {
          status: 'present',
          path: artifacts.all_tools_policy_matrix.path,
          tool_count: allToolsPolicyMatrix.tool_count
            ?? allToolsPolicyMatrix.summary?.tool_count
            ?? allToolsPolicyMatrix.tools?.length,
          class_counts: allToolsPolicyMatrix.class_counts ?? allToolsPolicyMatrix.summary?.class_counts ?? {},
          owner_counts: allToolsPolicyMatrix.owner_counts ?? allToolsPolicyMatrix.summary?.owner_counts ?? {},
          exposure_counts: allToolsPolicyMatrix.exposure_counts ?? allToolsPolicyMatrix.summary?.exposure_counts ?? {},
        }
      : missingStatus(artifacts.all_tools_policy_matrix.path),
    app_bindings: allToolsAppBindings
      ? {
          status: 'present',
          path: artifacts.all_tools_app_bindings.path,
          tool_count: allToolsAppBindings.tool_count
            ?? allToolsAppBindings.summary?.binding_count
            ?? allToolsAppBindings.rows?.length
            ?? allToolsAppBindings.bindings?.length,
          app_visible_tool_count: appVisibleBindingCount(allToolsAppBindings),
          disposition_counts: allToolsAppBindings.disposition_counts ?? allToolsAppBindings.summary?.disposition_counts ?? {},
          app_counts: allToolsAppBindings.app_counts ?? allToolsAppBindings.summary?.app_counts ?? {},
      }
      : missingStatus(artifacts.all_tools_app_bindings.path),
    app_family_coverage: allToolsAppFamilyCoverage
      ? {
          status: 'present',
          path: artifacts.all_tools_app_family_coverage.path,
          app_family_count: allToolsAppFamilyCoverage.summary?.app_family_count,
          app_visible_tool_count: allToolsAppFamilyCoverage.summary?.app_visible_tool_count,
          desktop_mobile_only_count: allToolsAppFamilyCoverage.summary?.desktop_mobile_only_count,
          supervisor_only_count: allToolsAppFamilyCoverage.summary?.supervisor_only_count,
          adapter_required_accelerate_count: allToolsAppFamilyCoverage.summary?.adapter_required_accelerate_count,
          fallback_state_family_count: allToolsFallbackStateCoverage.fallback_state_family_count,
          blocked_state_family_count: allToolsFallbackStateCoverage.blocked_state_family_count,
          degraded_state_family_count: allToolsFallbackStateCoverage.degraded_state_family_count,
        }
      : missingStatus(artifacts.all_tools_app_family_coverage.path),
    execution_fixtures: allToolsExecutionReport
      ? {
          status: 'present',
          path: artifacts.all_tools_execution_report.path,
          fixture_count: allToolsExecutionReport.fixture_count
            ?? allToolsExecutionReport.summary?.fixture_count
            ?? allToolsExecutionReport.fixtures?.length,
          app_routable_fixture_count: allToolsExecutionReport.app_routable_fixture_count
            ?? allToolsExecutionReport.summary?.dry_run_count
            ?? (allToolsExecutionReport.fixtures ?? []).filter(fixture => fixture.mode !== 'denied_envelope').length,
          denied_fixture_count: allToolsExecutionReport.denied_fixture_count
            ?? allToolsExecutionReport.summary?.denied_count
            ?? (allToolsExecutionReport.fixtures ?? []).filter(fixture => fixture.mode === 'denied_envelope').length,
          side_effect_receipt_fixture_count: allToolsExecutionReport.side_effect_receipt_fixture_count
            ?? allToolsExecutionReport.summary?.receipt_required_count
            ?? null,
        }
      : missingStatus(artifacts.all_tools_execution_report.path),
    orb_idl: allToolsIdlCoverage
      ? {
          status: 'present',
          path: artifacts.all_tools_idl_coverage.path,
          descriptor_count: allToolsIdlCoverage.descriptor_count
            ?? allToolsIdlCoverage.summary?.descriptor_count
            ?? allToolsIdlCoverage.descriptors?.length,
          method_count: allToolsIdlCoverage.method_count
            ?? allToolsIdlCoverage.summary?.method_count
            ?? null,
          app_routable_tool_count: allToolsIdlCoverage.app_routable_tool_count
            ?? allToolsIdlCoverage.summary?.method_count
            ?? null,
          app_routable_tool_coverage_count: allToolsIdlCoverage.app_routable_tool_coverage_count
            ?? allToolsIdlCoverage.summary?.method_count
            ?? null,
          workflow_count: allToolsIdlCoverage.workflow_count ?? 0,
          workflow_coverage_count: allToolsIdlCoverage.workflow_coverage_count ?? 0,
          interface_cid_count: allToolsIdlCoverage.interface_cid_count
            ?? allToolsIdlCoverage.summary?.interface_cid_count
            ?? null,
          adapter_required_method_count: allToolsIdlCoverage.adapter_required_method_count
            ?? allToolsIdlCoverage.summary?.adapter_required_method_count
            ?? null,
        }
      : missingStatus(artifacts.all_tools_idl_coverage.path),
    glasses_projection: allToolsGlassesCoverage
      ? {
          status: 'present',
          path: artifacts.all_tools_glasses_coverage.path,
          projection_count: allToolsGlassesCoverage.projection_count
            ?? allToolsGlassesCoverage.summary?.projection_count
            ?? allToolsGlassesCoverage.projections?.length,
          displayable_projection_count: allToolsGlassesCoverage.displayable_projection_count
            ?? allToolsGlassesCoverage.summary?.projection_count
            ?? allToolsGlassesCoverage.projections?.length,
          hardware_free_replay_state_count: allToolsGlassesCoverage.hardware_free_replay_state_count
            ?? allToolsGlassesCoverage.summary?.hardware_free_replay_state_count
            ?? null,
          adapter_required_projection_count: allToolsGlassesCoverage.adapter_required_projection_count
            ?? allToolsGlassesCoverage.summary?.adapter_required_projection_count
            ?? null,
          behavior_counts: allToolsGlassesCoverage.behavior_counts ?? allToolsGlassesCoverage.summary?.behavior_counts ?? {},
        }
      : missingStatus(artifacts.all_tools_glasses_coverage.path),
    release_policy_gate: allToolsReleaseGate
      ? {
          status: 'present',
          path: artifacts.all_tools_policy_release_gate.path,
          decision: allToolsReleaseGate.decision,
          gate_count: allToolsReleaseGate.gate_count ?? allToolsReleaseGate.summary?.gate_count,
          pass_count: allToolsReleaseGate.pass_count ?? allToolsReleaseGate.summary?.pass_count,
          fail_count: allToolsReleaseGate.fail_count ?? allToolsReleaseGate.summary?.fail_count,
          warn_count: allToolsReleaseGate.warn_count ?? allToolsReleaseGate.summary?.warn_count ?? 0,
          blocker_count: allToolsReleaseGate.blocker_count ?? allToolsReleaseGate.summary?.blocker_count,
          failed_gates: failedGates.map(gate => ({
            gate_id: gate.gate_id ?? gate.id,
            summary: gate.summary ?? (gate.passed === false ? 'gate failed' : 'gate status is fail'),
            blockers: gate.blockers ?? [],
          })),
        }
      : missingStatus(artifacts.all_tools_policy_release_gate.path),
    adapter_boundary: adapterBoundaryGate
      ? {
          status: adapterBoundaryGate.status ?? (adapterBoundaryGate.passed ? 'pass' : 'fail'),
          summary: adapterBoundaryGate.summary ?? {
            passed: adapterBoundaryGate.passed,
            count: adapterBoundaryGate.count,
          },
          evidence: adapterBoundaryGate.evidence,
          blockers: adapterBoundaryGate.blockers,
        }
      : missingStatus('all-tools-policy-release-gate.json#accelerate_adapter_boundary'),
  },
  exhaustive_all_tools_gate: {
    decision: allToolsDecision,
    blocker_count: allToolsBlockers.length,
    blockers: dedupe(allToolsBlockers),
  },
  go_no_go: {
    decision,
    representative_decision: representativeDecision,
    all_tools_decision: allToolsDecision,
    blocker_count: blockers.length,
    warning_count: warnings.length,
    blockers,
    warnings: dedupe(warnings),
    next_actions: nextActions,
  },
};

const releaseJsonPath = path.join(evidenceRoot, 'release-evidence.json');
const releaseMarkdownPath = path.join(evidenceRoot, 'release-evidence.md');
const allToolsMarkdownPath = path.join(evidenceRoot, 'all-tools-release-evidence.md');
const supervisorFreshnessPath = path.join(evidenceRoot, 'all-tools-supervisor-release-freshness.json');
const markdown = renderMarkdown(report);

fs.mkdirSync(evidenceRoot, { recursive: true });
fs.writeFileSync(releaseJsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(releaseMarkdownPath, markdown);
fs.writeFileSync(allToolsMarkdownPath, markdown);
fs.writeFileSync(
  supervisorFreshnessPath,
  `${JSON.stringify(buildSupervisorReleaseFreshness(report), null, 2)}\n`,
);
refreshReleaseEvidenceFreshness();

console.log(JSON.stringify({
  decision,
  blocker_count: report.go_no_go.blocker_count,
  warning_count: report.go_no_go.warning_count,
  hierarchical_mcp_decision: hierarchicalMcpGate.decision,
  all_tools_decision: allToolsDecision,
  output: path.relative(projectRoot, releaseJsonPath),
  supervisor_freshness_output: path.relative(projectRoot, supervisorFreshnessPath),
}, null, 2));

if (decision !== 'go') {
  process.exitCode = 1;
}

function readArtifact(fileName, required) {
  const absolutePath = path.join(evidenceRoot, fileName);
  const relativePath = path.join(evidenceRootRelative, fileName);
  if (!fs.existsSync(absolutePath)) {
    return {
      data: null,
      status: {
        status: 'missing',
        path: relativePath,
        required,
        error: 'artifact does not exist',
      },
    };
  }
  try {
    const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return {
      data,
      status: {
        status: 'present',
        path: relativePath,
        required,
        schema: data.schema ?? data.matrix_id ?? data.catalog_id ?? data.report_id ?? null,
        generated_at: data.generated_at ?? null,
      },
    };
  } catch (error) {
    return {
      data: null,
      status: {
        status: 'invalid',
        path: relativePath,
        required,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function screenshotCoverage(directoryName, expected) {
  const directory = path.join(evidenceRoot, directoryName);
  const relativeDirectory = path.join(evidenceRootRelative, directoryName);
  const count = countFiles(directory, fileName => fileName.endsWith('.png'));
  return {
    status: fs.existsSync(directory) ? 'present' : 'missing',
    directory: relativeDirectory,
    count,
    expected,
  };
}

function countFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && predicate(entry.name)) count += 1;
  }
  return count;
}

function missingStatus(pathValue) {
  return {
    status: 'missing',
    path: pathValue,
    error: 'artifact does not exist',
  };
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function dedupe(items) {
  return [...new Set(items)];
}

function blockerText(blocker) {
  if (typeof blocker === 'string') return blocker;
  if (!blocker || typeof blocker !== 'object') return String(blocker);
  return Object.entries(blocker)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`)
    .join('; ');
}

function hasNonEmptyValue(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function appVisibleBindingCount(bindingsArtifact) {
  if (!bindingsArtifact) return null;
  if (typeof bindingsArtifact.app_visible_tool_count === 'number') return bindingsArtifact.app_visible_tool_count;
  if (typeof bindingsArtifact.summary?.app_visible_tool_count === 'number') return bindingsArtifact.summary.app_visible_tool_count;
  const rows = bindingsArtifact.rows ?? bindingsArtifact.bindings ?? [];
  if (!Array.isArray(rows)) return null;
  return rows.filter(row => row?.app_visible === true).length;
}

function summarizeHierarchicalMcpGate(evidence, artifactStatus) {
  if (!evidence) {
    return {
      decision: 'no_go',
      summary: missingStatus(artifactStatus.path),
      release_blockers: [`Missing required hierarchical MCP evidence artifact: ${artifactStatus.path}`],
      release_warnings: [],
    };
  }

  const services = Array.isArray(evidence.services) ? evidence.services : [];
  const metaTools = Array.isArray(evidence.meta_tools)
    ? evidence.meta_tools
    : ['tools_list_categories', 'tools_list_tools', 'tools_get_schema', 'tools_dispatch'];
  const liveFleetRequired = Boolean(evidence.live_fleet_required)
    || process.env.HIERARCHICAL_MCP_REQUIRE_LIVE === '1';
  const availableServices = services.filter(service => service.available);
  const servicesMissingFacade = services
    .filter(service => service.available && !service.full_facade_available)
    .map(service => ({
      service: service.service,
      missing_meta_tools: metaTools.filter(tool => !service.meta_presence?.[tool]),
    }));
  const dispatchFailures = services
    .flatMap(service => [service.dispatch_probe]
      .filter(probe => probe && probe.status && probe.status !== 'passed')
      .map(probe => ({
        service: service.service,
        category: probe.category ?? null,
        tool: probe.tool ?? probe.name ?? null,
        status: probe.status,
        error: probe.error ?? probe.message ?? null,
      })));
  const aliasDispatchFailures = services
    .flatMap(service => (service.alias_dispatch_probes ?? [])
      .filter(probe => probe && probe.status && probe.status !== 'passed')
      .map(probe => ({
        service: service.service,
        category: probe.category ?? null,
        tool: probe.tool ?? probe.name ?? null,
        status: probe.status,
        error: probe.error ?? probe.message ?? null,
      })));
  const directOnlySummaries = services
    .filter(service => (service.flat_direct_only_count ?? 0) > 0)
    .map(service => ({
      service: service.service,
      count: service.flat_direct_only_count,
      policy_counts: service.flat_direct_only_policy_counts ?? {},
      reason_counts: service.flat_direct_only_reason_counts ?? {},
      sample: service.flat_direct_only_sample ?? [],
    }));
  const removedSummaries = services
    .filter(service => (service.removed_from_app_visible_ledger_count ?? 0) > 0)
    .map(service => ({
      service: service.service,
      count: service.removed_from_app_visible_ledger_count,
      sample: service.removed_from_app_visible_ledger_sample ?? [],
    }));

  const releaseBlockers = [];
  const releaseWarnings = [];
  for (const service of servicesMissingFacade) {
    releaseBlockers.push(
      `Hierarchical MCP facade missing for ${service.service}: ${service.missing_meta_tools.join(', ') || 'unknown meta-tools'}.`,
    );
  }
  for (const failure of dispatchFailures) {
    releaseBlockers.push(
      `Hierarchical MCP representative dispatch failed for ${failure.service}:${failure.category ?? 'unknown'}.${failure.tool ?? 'unknown'} (${failure.status}${failure.error ? `: ${failure.error}` : ''}).`,
    );
  }
  const unexplainedGapCount = evidence.summary?.unexplained_flat_hierarchy_gap_count
    ?? services.reduce((sum, service) => sum + (service.unexplained_flat_hierarchy_gap_count ?? 0), 0);
  if (unexplainedGapCount > 0) {
    releaseBlockers.push(`${unexplainedGapCount} flat MCP descriptors are neither hierarchical, direct-only, nor removed from the app-visible ledger.`);
  }
  const directOnlyCount = evidence.summary?.flat_direct_only_count
    ?? services.reduce((sum, service) => sum + (service.flat_direct_only_count ?? 0), 0);
  if (directOnlyCount > 0) {
    releaseWarnings.push(`${directOnlyCount} MCP descriptors remain direct-only and are explicitly accounted for in hierarchical MCP evidence.`);
  }
  if (aliasDispatchFailures.length > 0) {
    releaseWarnings.push(`${aliasDispatchFailures.length} hierarchical MCP alias dispatch probes failed; representative dispatch remains the release-blocking probe.`);
  }
  if (removedSummaries.length > 0) {
    releaseWarnings.push(
      `${removedSummaries.reduce((sum, service) => sum + service.count, 0)} flat MCP descriptors are excluded from the SwissKnife app-visible ledger and accounted for in hierarchical MCP evidence.`,
    );
  }
  const evidenceBlockers = evidence.blockers ?? [];
  for (const blocker of evidenceBlockers) {
    releaseBlockers.push(`Hierarchical MCP evidence blocker: ${blocker}`);
  }
  const evidenceWarnings = evidence.warnings ?? [];
  for (const warning of evidenceWarnings) {
    releaseWarnings.push(`Hierarchical MCP evidence warning: ${warning}`);
  }
  if (liveFleetRequired && availableServices.length !== services.length) {
    const unavailable = services.filter(service => !service.available).map(service => service.service);
    releaseBlockers.push(`Hierarchical MCP live fleet required but unavailable services were observed: ${unavailable.join(', ') || 'unknown'}.`);
  } else if (!liveFleetRequired && availableServices.length !== services.length) {
    releaseWarnings.push(`Hierarchical MCP evidence observed ${availableServices.length}/${services.length} configured services live.`);
  }

  const decision = releaseBlockers.length === 0 ? 'go' : 'no_go';
  return {
    decision,
    summary: {
      status: 'present',
      path: artifactStatus.path,
      schema: evidence.schema ?? null,
      generated_at: evidence.generated_at ?? null,
      decision: evidence.decision ?? decision,
      release_gate_decision: decision,
      live_fleet_required: liveFleetRequired,
      service_count: services.length,
      available_service_count: availableServices.length,
      services_with_full_facade: services.filter(service => service.full_facade_available).length,
      meta_tools: metaTools,
      missing_facade_by_service: servicesMissingFacade,
      unobserved_services: services.filter(service => !service.available).map(service => service.service),
      dispatch_probe_count: evidence.summary?.dispatch_probe_count
        ?? services.filter(service => service.dispatch_probe).length,
      dispatch_pass_count: evidence.summary?.dispatch_pass_count
        ?? services.filter(service => service.dispatch_probe?.status === 'passed').length,
      dispatch_failures: dispatchFailures,
      alias_dispatch_probe_count: evidence.summary?.alias_dispatch_probe_count
        ?? services.reduce((sum, service) => sum + (service.alias_dispatch_probe_count ?? 0), 0),
      alias_dispatch_pass_count: evidence.summary?.alias_dispatch_pass_count
        ?? services.reduce((sum, service) => sum + (service.alias_dispatch_pass_count ?? 0), 0),
      alias_dispatch_failures: aliasDispatchFailures,
      direct_only_descriptor_count: directOnlyCount,
      direct_only_probe_count: evidence.summary?.direct_only_probe_count
        ?? services.reduce((sum, service) => sum + (service.direct_only_probe_count ?? 0), 0),
      direct_only_receipt_count: evidence.summary?.direct_only_receipt_count
        ?? services.reduce((sum, service) => sum + (service.direct_only_receipt_count ?? 0), 0),
      direct_only_policy_counts: mergeCounts(services.map(service => service.flat_direct_only_policy_counts ?? {})),
      direct_only_reason_counts: mergeCounts(services.map(service => service.flat_direct_only_reason_counts ?? {})),
      direct_only_summaries: directOnlySummaries,
      removed_from_app_visible_ledger_count: evidence.summary?.removed_from_app_visible_ledger_count
        ?? services.reduce((sum, service) => sum + (service.removed_from_app_visible_ledger_count ?? 0), 0),
      removed_from_app_visible_ledger_summaries: removedSummaries,
      unexplained_flat_hierarchy_gap_count: unexplainedGapCount,
      evidence_blockers: evidenceBlockers,
      evidence_warnings: evidenceWarnings,
      release_blockers: dedupe(releaseBlockers),
      release_warnings: dedupe(releaseWarnings),
    },
    release_blockers: dedupe(releaseBlockers),
    release_warnings: dedupe(releaseWarnings),
  };
}

function buildVirtualDesktopAppMatrixGate({
  appInventory,
  appBackendContract,
  appWorkflowMatrix,
  allToolsAppBindings,
  allToolsIdlCoverage,
  allToolsGlassesCoverage,
  allServerToolCatalog,
  mcpPlusPlusLibp2pCatalog,
  glassesSimulatorHandoff,
  hierarchicalMcpGate,
}) {
  const representativeBlockers = [];
  const allToolsBlockers = [];
  const requiredWorkflowStates = dedupe([
    'loading',
    'success',
    'fallback',
    'error',
    ...(appWorkflowMatrix?.required_states ?? []),
  ]);
  const requiredUxStates = ['success', 'fallback', 'error'];
  const requiredSimulatorReplayStates = ['open', 'focus', 'activate', 'dispatch_result', 'fallback', 'policy_block'];
  const requiredSimulatorModalities = ['audio_channel', 'glasses_hud'];
  const requiredSimulatorCapabilityModalities = [
    'display.output',
    'camera.photo_capture',
    'microphone.input',
    'speaker.output',
  ];
  const hierarchicalMetaToolIds = new Set(requiredHierarchicalMetaTools);

  const inventoryApps = new Set((appInventory?.apps ?? []).map(app => app.id ?? app.app_id ?? app.canonical_id).filter(Boolean));
  const contractApps = new Map((appBackendContract?.apps ?? []).map(app => [app.canonical_id, app]));
  const workflowApps = new Map((appWorkflowMatrix?.apps ?? []).map(app => [app.canonical_id ?? app.app_id, app]));
  const allAppIds = [...new Set([...inventoryApps, ...contractApps.keys(), ...workflowApps.keys()])].sort();

  const appVisibleBindings = (allToolsAppBindings?.rows ?? allToolsAppBindings?.bindings ?? [])
    .filter(binding => binding?.app_visible === true || binding?.visibility === 'app_visible');
  const idlDescriptors = allToolsIdlCoverage?.descriptors ?? [];
  const glassesProjections = allToolsGlassesCoverage?.projections ?? [];
  const catalogServices = allServerToolCatalog?.services ?? [];
  const catalogDescriptors = catalogServices.flatMap(service => service.reconciled_descriptors ?? []);
  const mcpPlusPlusServices = mcpPlusPlusLibp2pCatalog?.services ?? [];
  const mcpPlusPlusEligibleDescriptors = mcpPlusPlusLibp2pCatalog?.eligible_descriptors ?? [];

  const idlCapabilityIds = new Set(idlDescriptors.flatMap(descriptor => [
    ...(descriptor.methods ?? []),
    ...(descriptor.method_bindings ?? []),
  ].map(method => method.capability_id).filter(Boolean)));
  const idlToolIds = new Set(idlDescriptors.flatMap(descriptor => descriptor.tool_ids ?? []));
  const idlApps = new Set(idlDescriptors.map(descriptor => descriptor.app_id).filter(Boolean));
  const glassesToolIds = new Set(glassesProjections.flatMap(projection => projection.tool_ids ?? []));
  const glassesApps = new Set(glassesProjections.map(projection => projection.app_id).filter(Boolean));
  const catalogToolIds = new Set(catalogDescriptors.map(descriptor => descriptor.tool_id).filter(Boolean));
  const appVisibleBindingCapabilityIds = new Set(appVisibleBindings.map(binding => binding.capability_id).filter(Boolean));
  const appVisibleBindingToolIds = new Set(appVisibleBindings.map(binding => binding.tool_id).filter(Boolean));
  const mcpPlusPlusEligibleByService = new Map(mcpPlusPlusServices.map(service => [service.service, new Set()]));
  for (const descriptor of mcpPlusPlusEligibleDescriptors) {
    const toolId = typeof descriptor === 'string' ? descriptor : descriptor.tool_id;
    const service = typeof descriptor === 'string' ? descriptor.split(':')[0] : descriptor.service_id ?? descriptor.service;
    if (!toolId || !service) continue;
    if (!mcpPlusPlusEligibleByService.has(service)) mcpPlusPlusEligibleByService.set(service, new Set());
    mcpPlusPlusEligibleByService.get(service).add(toolId);
  }

  const missingContractAppIds = allAppIds.filter(appId => !contractApps.has(appId));
  const missingWorkflowAppIds = allAppIds.filter(appId => !workflowApps.has(appId));
  const missingScreenshotApps = [];
  const missingWorkflowStates = [];
  const missingUxStates = [];
  const missingLocalOnlyRationaleApps = [];
  const missingBackendCapabilitySetApps = [];
  const malformedBackendCapabilities = [];
  const missingAppVisibleBindingCapabilities = [];
  const missingOrbIdlApps = [];
  const missingOrbIdlCapabilities = [];
  const missingGlassesProjectionApps = [];
  const missingGlassesProjectionCapabilities = [];
  const missingCatalogReconciliation = [];
  const missingMcpPlusPlusEligibility = [];
  const simulatorReplayGaps = [];
  const simulatorModalities = new Set();
  const observedSimulatorCapabilityModalities = new Set();
  const serverCatalogGaps = [];
  const serverFacadeGaps = [];
  const toolClassCounts = {};

  for (const appId of allAppIds) {
    const contract = contractApps.get(appId);
    const workflow = workflowApps.get(appId);
    if (workflow) {
      const screenshotPath = workflow.screenshot;
      const screenshotAbsolutePath = screenshotPath ? path.join(projectRoot, screenshotPath) : null;
      if (!screenshotPath || !fs.existsSync(screenshotAbsolutePath)) {
        missingScreenshotApps.push({
          app_id: appId,
          screenshot: screenshotPath ?? null,
        });
      }
      for (const state of requiredWorkflowStates) {
        if (!workflow.states?.[state]?.visible) {
          missingWorkflowStates.push({ app_id: appId, state });
        }
      }
    } else {
      missingScreenshotApps.push({
        app_id: appId,
        screenshot: null,
        reason: 'missing_workflow',
      });
    }
    if (contract) {
      for (const state of requiredUxStates) {
        if (!contract.ux_scenarios?.[state]) {
          missingUxStates.push({ app_id: appId, state });
        }
      }
      const isToolBacked = contract.backend_state === 'tool_backed';
      const backendCapabilities = Array.isArray(contract.backend_capabilities)
        ? contract.backend_capabilities
        : [];
      const hasLocalRationale = typeof contract.local_only_rationale === 'string'
        && contract.local_only_rationale.trim().length > 0;
      const declaredCapabilityCount = Number(contract.backend_capability_count ?? backendCapabilities.length);
      if (isToolBacked && (backendCapabilities.length === 0 || declaredCapabilityCount === 0)) {
        missingBackendCapabilitySetApps.push(appId);
      }
      if (Number.isFinite(declaredCapabilityCount) && declaredCapabilityCount !== backendCapabilities.length) {
        malformedBackendCapabilities.push({
          app_id: appId,
          capability_id: null,
          tool_id: null,
          service: null,
          tool_class: 'contract',
          missing_fields: ['backend_capability_count_mismatch'],
        });
      }
      for (const capability of backendCapabilities) {
        const missingFields = [
          'capability_id',
          'tool_id',
          'service',
          'mcp_transport',
          'mcp_plus_plus_transport',
          'policy_class',
          'receipt_strategy',
        ].filter(field => !hasNonEmptyValue(capability[field]));
        if (missingFields.length > 0) {
          malformedBackendCapabilities.push({
            app_id: appId,
            capability_id: capability.capability_id ?? null,
            tool_id: capability.tool_id ?? null,
            service: capability.service ?? capability.service_id ?? null,
            tool_class: capability.policy_class ?? 'unknown',
            missing_fields: missingFields,
          });
        }
        if ((capability.app_visible === true || capability.visibility === 'app_visible')
          && !appVisibleBindingCapabilityIds.has(capability.capability_id)
          && !appVisibleBindingToolIds.has(capability.tool_id)) {
          missingAppVisibleBindingCapabilities.push({
            app_id: appId,
            capability_id: capability.capability_id ?? null,
            tool_id: capability.tool_id ?? null,
            service: capability.service ?? capability.service_id ?? null,
            tool_class: capability.policy_class ?? 'unknown',
          });
        }
      }
      if (!isToolBacked && !hasLocalRationale) {
        missingLocalOnlyRationaleApps.push(appId);
      }
      const hasAppVisibleCapability = backendCapabilities
        .some(capability => capability.app_visible === true || capability.visibility === 'app_visible');
      if (isToolBacked && hasAppVisibleCapability) {
        const descriptorCount = Number(contract.orb_idl_state?.descriptor_count ?? 0);
        const descriptorIds = contract.orb_idl_state?.descriptor_ids ?? [];
        if (contract.orb_idl_state?.state === 'not-required' || (descriptorCount === 0 && descriptorIds.length === 0) || !idlApps.has(appId)) {
          missingOrbIdlApps.push(appId);
        }
        if (!glassesApps.has(appId)) {
          missingGlassesProjectionApps.push(appId);
        }
      }
    }
  }

  for (const binding of appVisibleBindings) {
    const toolClass = binding.policy_class ?? 'unknown';
    toolClassCounts[toolClass] = (toolClassCounts[toolClass] ?? 0) + 1;
    const capabilityId = binding.capability_id;
    const toolId = binding.tool_id;
    const appId = binding.app_id;
    const service = binding.service_id ?? binding.service ?? null;
    const name = binding.name ?? toolId?.split(':').at(-1) ?? null;
    const isHierarchicalMetaTool = hierarchicalMetaToolIds.has(name);

    if (!idlCapabilityIds.has(capabilityId) && !idlToolIds.has(toolId)) {
      missingOrbIdlCapabilities.push({
        app_id: appId,
        capability_id: capabilityId,
        tool_id: toolId,
        service,
        tool_class: toolClass,
      });
    }
    if (!glassesToolIds.has(toolId)) {
      missingGlassesProjectionCapabilities.push({
        app_id: appId,
        capability_id: capabilityId,
        tool_id: toolId,
        service,
        tool_class: toolClass,
      });
    }
    if (!isHierarchicalMetaTool && !catalogToolIds.has(toolId)) {
      missingCatalogReconciliation.push({
        app_id: appId,
        capability_id: capabilityId,
        tool_id: toolId,
        service,
        tool_class: toolClass,
      });
    }
    if (binding.mcp_plus_plus_transport === 'eligible') {
      const eligible = mcpPlusPlusEligibleByService.get(service);
      if ((!eligible || eligible.size === 0 || !eligible.has(toolId)) && !isHierarchicalMetaTool) {
        missingMcpPlusPlusEligibility.push({
          app_id: appId,
          capability_id: capabilityId,
          tool_id: toolId,
          service,
          tool_class: toolClass,
        });
      }
    }
  }

  for (const service of catalogServices) {
    if ((service.missing_expected_descriptor_count ?? 0) > 0) {
      serverCatalogGaps.push({
        server: service.service,
        kind: 'missing_expected_descriptors',
        descriptor_count: service.missing_expected_descriptor_count,
        descriptors: service.missing_expected_descriptors ?? [],
      });
    }
    if ((service.unexplained_flat_descriptor_count ?? 0) > 0) {
      serverCatalogGaps.push({
        server: service.service,
        kind: 'unexplained_flat_descriptors',
        descriptor_count: service.unexplained_flat_descriptor_count,
        descriptors: service.unexplained_flat_descriptors ?? [],
      });
    }
  }

  for (const service of hierarchicalMcpGate.summary?.missing_facade_by_service ?? []) {
    serverFacadeGaps.push({
      server: service.service,
      missing_meta_tools: service.missing_meta_tools ?? [],
    });
  }

  for (const projection of glassesProjections) {
    const replayStates = new Set((projection.replay_states ?? projection.replay ?? []).map(state => state.state).filter(Boolean));
    for (const replay of projection.replay ?? []) {
      if (replay.surface) simulatorModalities.add(replay.surface);
    }
    for (const state of requiredSimulatorReplayStates) {
      if (!replayStates.has(state)) {
        simulatorReplayGaps.push({
          projection_id: projection.projection_id,
          app_id: projection.app_id,
          descriptor_id: projection.descriptor_id,
          simulator_state: state,
          modality: projection.widget_profile?.renderer ?? projection.behavior ?? null,
        });
      }
    }
  }
  const missingSimulatorModalities = requiredSimulatorModalities
    .filter(modality => !simulatorModalities.has(modality));
  for (const [modality, available] of Object.entries(glassesSimulatorHandoff?.simulator?.capabilities ?? {})) {
    if (available) observedSimulatorCapabilityModalities.add(modality);
  }
  for (const evidence of glassesSimulatorHandoff?.capability_evidence ?? []) {
    if (evidence.capability) observedSimulatorCapabilityModalities.add(evidence.capability);
  }
  const missingSimulatorCapabilityModalities = requiredSimulatorCapabilityModalities
    .filter(modality => !observedSimulatorCapabilityModalities.has(modality));

  if (missingContractAppIds.length > 0) {
    representativeBlockers.push(`Missing canonical backend contract app IDs: ${missingContractAppIds.join(', ')}.`);
  }
  if (missingWorkflowAppIds.length > 0) {
    representativeBlockers.push(`Missing UI/UX workflow app IDs: ${missingWorkflowAppIds.join(', ')}.`);
  }
  if (missingScreenshotApps.length > 0) {
    representativeBlockers.push(`Missing screenshot app IDs: ${missingScreenshotApps.map(item => item.app_id).join(', ')}.`);
  }
  if (missingWorkflowStates.length > 0) {
    representativeBlockers.push(`Missing workflow states: ${missingWorkflowStates.map(item => `${item.app_id}:${item.state}`).join(', ')}.`);
  }
  if (missingUxStates.length > 0) {
    representativeBlockers.push(`Missing contract UX scenarios: ${missingUxStates.map(item => `${item.app_id}:${item.state}`).join(', ')}.`);
  }
  if (missingLocalOnlyRationaleApps.length > 0) {
    representativeBlockers.push(`Missing local-only rationale app IDs: ${missingLocalOnlyRationaleApps.join(', ')}.`);
  }
  if (missingBackendCapabilitySetApps.length > 0) {
    representativeBlockers.push(`Missing backend capability set app IDs: ${missingBackendCapabilitySetApps.join(', ')}.`);
  }
  if (malformedBackendCapabilities.length > 0) {
    representativeBlockers.push(`Malformed backend contract capabilities: ${malformedBackendCapabilities.map(item => `${item.app_id}:${item.capability_id ?? 'contract'}:${item.missing_fields.join('|')}`).join(', ')}.`);
  }
  if (missingOrbIdlApps.length > 0) {
    representativeBlockers.push(`Missing ORB/IDL app projections: ${missingOrbIdlApps.join(', ')}.`);
  }
  if (missingGlassesProjectionApps.length > 0) {
    representativeBlockers.push(`Missing glasses projection app IDs: ${missingGlassesProjectionApps.join(', ')}.`);
  }
  if (missingSimulatorModalities.length > 0) {
    representativeBlockers.push(`Missing simulator modalities: ${missingSimulatorModalities.join(', ')}.`);
  }
  if (missingSimulatorCapabilityModalities.length > 0) {
    representativeBlockers.push(`Missing simulator capability modalities: ${missingSimulatorCapabilityModalities.join(', ')}.`);
  }
  if (simulatorReplayGaps.length > 0) {
    representativeBlockers.push(`Missing simulator replay states: ${simulatorReplayGaps.map(item => `${item.projection_id}:${item.simulator_state}`).join(', ')}.`);
  }
  if (missingOrbIdlCapabilities.length > 0) {
    allToolsBlockers.push(`Missing ORB/IDL capability IDs: ${missingOrbIdlCapabilities.map(item => `${item.app_id}:${item.capability_id}:${item.service}:${item.tool_class}`).join(', ')}.`);
  }
  if (missingAppVisibleBindingCapabilities.length > 0) {
    allToolsBlockers.push(`Missing app-visible binding capability IDs: ${missingAppVisibleBindingCapabilities.map(item => `${item.app_id}:${item.capability_id}:${item.service}:${item.tool_class}`).join(', ')}.`);
  }
  if (missingGlassesProjectionCapabilities.length > 0) {
    allToolsBlockers.push(`Missing glasses projection capability IDs: ${missingGlassesProjectionCapabilities.map(item => `${item.app_id}:${item.capability_id}:${item.service}:${item.tool_class}`).join(', ')}.`);
  }
  if (missingCatalogReconciliation.length > 0) {
    allToolsBlockers.push(`Missing server/tool catalog reconciliation tool IDs: ${missingCatalogReconciliation.map(item => `${item.service}:${item.tool_id}:${item.capability_id}:${item.tool_class}`).join(', ')}.`);
  }
  if (missingMcpPlusPlusEligibility.length > 0) {
    allToolsBlockers.push(`Missing MCP++/libp2p eligibility records: ${missingMcpPlusPlusEligibility.map(item => `${item.service}:${item.tool_id}:${item.capability_id}:${item.tool_class}`).join(', ')}.`);
  }
  if (serverCatalogGaps.length > 0) {
    allToolsBlockers.push(`Server catalog reconciliation gaps: ${serverCatalogGaps.map(item => `${item.server}:${item.kind}:${item.descriptor_count}`).join(', ')}.`);
  }
  if (serverFacadeGaps.length > 0) {
    allToolsBlockers.push(`Hierarchical facade gaps by server: ${serverFacadeGaps.map(item => `${item.server}:${item.missing_meta_tools.join('|')}`).join(', ')}.`);
  }

  const blockerCount = representativeBlockers.length + allToolsBlockers.length;
  return {
    representative_blockers: representativeBlockers,
    all_tools_blockers: allToolsBlockers,
    summary: {
      status: 'present',
      decision: blockerCount === 0 ? 'go' : 'no_go',
      blocker_count: blockerCount,
      representative_blocker_count: representativeBlockers.length,
      all_tools_blocker_count: allToolsBlockers.length,
      app_count: allAppIds.length,
      app_ids: allAppIds,
      required_workflow_states: requiredWorkflowStates,
      required_ux_states: requiredUxStates,
      required_simulator_replay_states: requiredSimulatorReplayStates,
      required_simulator_modalities: requiredSimulatorModalities,
      required_simulator_capability_modalities: requiredSimulatorCapabilityModalities,
      observed_simulator_modalities: [...simulatorModalities].sort(),
      observed_simulator_capability_modalities: [...observedSimulatorCapabilityModalities].sort(),
      tool_class_counts: toolClassCounts,
      missing_contract_app_ids: missingContractAppIds,
      missing_workflow_app_ids: missingWorkflowAppIds,
      missing_screenshot_apps: missingScreenshotApps,
      missing_workflow_states: missingWorkflowStates,
      missing_ux_states: missingUxStates,
      missing_local_only_rationale_app_ids: missingLocalOnlyRationaleApps,
      missing_backend_capability_set_app_ids: missingBackendCapabilitySetApps,
      malformed_backend_capabilities: malformedBackendCapabilities,
      missing_app_visible_binding_capabilities: missingAppVisibleBindingCapabilities,
      missing_orb_idl_app_ids: missingOrbIdlApps,
      missing_orb_idl_capabilities: missingOrbIdlCapabilities,
      missing_glasses_projection_app_ids: missingGlassesProjectionApps,
      missing_glasses_projection_capabilities: missingGlassesProjectionCapabilities,
      missing_catalog_reconciliation: missingCatalogReconciliation,
      missing_mcp_plus_plus_eligibility: missingMcpPlusPlusEligibility,
      server_catalog_gaps: serverCatalogGaps,
      server_facade_gaps: serverFacadeGaps,
      missing_simulator_modalities: missingSimulatorModalities,
      missing_simulator_capability_modalities: missingSimulatorCapabilityModalities,
      simulator_replay_gaps: simulatorReplayGaps,
    },
  };
}

function buildSWR110ReleaseGate({
  artifacts,
  appInventory,
  appBackendContract,
  appWorkflowMatrix,
  toolUiSmokeReceipts,
  serviceHealth,
  descriptorDiscovery,
  hierarchicalMcpGate,
  allServerToolCatalog,
  mcpPlusPlusLibp2pCatalog,
  mcpPlusPlusLibp2pReachability,
  allToolsLedger,
  allToolsPolicyMatrix,
  allToolsAppBindings,
  allToolsExecutionReport,
  allToolsIdlCoverage,
  allToolsGlassesCoverage,
  allToolsReleaseGate,
  agentSupervisorConsoleE2e,
  agentSupervisorConsoleReceipts,
  orbIdlCompleteCoverage,
  glassesSimulatorHandoff,
}) {
  const representativeBlockers = [];
  const allToolsBlockers = [];
  const missingEvidencePaths = [];
  const requiredMcpServers = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'];
  const requiredWorkflowStates = ['loading', 'success', 'fallback', 'error'];
  const requiredToolUiStates = ['success', 'fallback', 'error'];
  const requiredPolicyFields = [
    'tool_id',
    'service_id',
    'policy_class',
    'confirmation_policy',
    'receipt_policy',
    'fallback',
  ];
  const requiredOrbModalities = ['display', 'camera', 'speaker', 'microphone', 'input'];
  const requiredSupervisorPaths = [
    'success',
    'receipt_resolve',
    'index_search',
    'server_unavailable',
    'denied',
    'stale_state',
    'transport_fallback',
  ];
  const requiredSimulatorCapabilities = [
    'display.output',
    'camera.photo_capture',
    'speaker.output',
    'microphone.input',
  ];

  const failRepresentative = (pathValue, message) => {
    missingEvidencePaths.push(pathValue);
    representativeBlockers.push(`${pathValue}: ${message}`);
  };
  const failAllTools = (pathValue, message) => {
    missingEvidencePaths.push(pathValue);
    allToolsBlockers.push(`${pathValue}: ${message}`);
  };
  const artifactPath = (key) => artifacts[key]?.path ?? `test-results/virtual-desktop-ipfs-mcp-orb/${key}.json`;
  const requireArtifact = (key, allTools = false) => {
    const artifact = artifacts[key];
    if (artifact?.status === 'present') return true;
    const message = `required SWR-110 evidence artifact is ${artifact?.status ?? 'missing'}${artifact?.error ? ` (${artifact.error})` : ''}`;
    if (allTools) failAllTools(artifactPath(key), message);
    else failRepresentative(artifactPath(key), message);
    return false;
  };

  for (const key of [
    'app_inventory',
    'app_backend_contract',
    'app_workflow_matrix',
    'service_health',
    'descriptor_discovery',
    'hierarchical_mcp_tools',
    'all_server_tool_catalog',
    'mcp_plus_plus_libp2p_catalog',
    'mcpplusplus_libp2p_reachability',
    'tool_ui_smoke_receipts',
    'agent_supervisor_console_e2e',
    'agent_supervisor_console_receipts',
    'orb_idl_complete_coverage',
    'glasses_simulator_handoff',
  ]) {
    requireArtifact(key, false);
  }
  for (const key of [
    'all_tools_ledger',
    'all_tools_policy_matrix',
    'all_tools_app_bindings',
    'all_tools_execution_report',
    'all_tools_idl_coverage',
    'all_tools_glasses_coverage',
    'all_tools_policy_release_gate',
  ]) {
    requireArtifact(key, true);
  }

  const appIds = (appInventory?.apps ?? [])
    .map(app => app.id ?? app.app_id ?? app.canonical_id)
    .filter(Boolean)
    .sort();
  const appIdSet = new Set(appIds);
  const contractApps = new Map((appBackendContract?.apps ?? []).map(app => [app.canonical_id ?? app.app_id, app]));
  const workflowApps = new Map((appWorkflowMatrix?.apps ?? []).map(app => [app.canonical_id ?? app.app_id, app]));
  const toolUiApps = new Map((toolUiSmokeReceipts?.apps ?? []).map(app => [app.app_id ?? app.canonical_id, app]));
  const missingWorkflowEvidence = [];

  if (!appInventory || (appInventory.app_count ?? appIds.length) !== appIds.length || appIds.length === 0) {
    failRepresentative(artifactPath('app_inventory'), 'canonical app inventory is empty or internally inconsistent');
  }
  for (const appId of appIds) {
    const contract = contractApps.get(appId);
    const workflow = workflowApps.get(appId);
    if (!contract) {
      missingWorkflowEvidence.push(`${appId}:backend-contract`);
    }
    if (!workflow) {
      missingWorkflowEvidence.push(`${appId}:workflow`);
      continue;
    }
    for (const state of requiredWorkflowStates) {
      if (!workflow.states?.[state]?.visible) {
        missingWorkflowEvidence.push(`${appId}:workflow-state:${state}`);
      }
    }
    if (!workflow.screenshot || !fs.existsSync(path.join(projectRoot, workflow.screenshot))) {
      missingWorkflowEvidence.push(`${appId}:screenshot:${workflow.screenshot ?? 'missing'}`);
    }
  }
  if (missingWorkflowEvidence.length > 0) {
    failRepresentative(
      artifactPath('app_workflow_matrix'),
      `missing complete desktop app UI/UX evidence: ${missingWorkflowEvidence.slice(0, 80).join(', ')}`,
    );
  }
  for (const app of toolUiSmokeReceipts?.apps ?? []) {
    const observed = new Set((app.observed_states ?? []).map(state => typeof state === 'string' ? state : state?.state).filter(Boolean));
    for (const state of requiredToolUiStates) {
      if (!observed.has(state)) {
        missingWorkflowEvidence.push(`${app.app_id}:tool-ui-state:${state}`);
      }
    }
    if (!app.screenshot || !fs.existsSync(path.join(projectRoot, app.screenshot))) {
      missingWorkflowEvidence.push(`${app.app_id}:tool-ui-screenshot:${app.screenshot ?? 'missing'}`);
    }
  }
  for (const appId of appIds.filter(id => contractApps.get(id)?.backend_state === 'tool_backed')) {
    if (!toolUiApps.has(appId)) {
      missingWorkflowEvidence.push(`${appId}:tool-ui-smoke`);
    }
  }
  if (missingWorkflowEvidence.some(item => item.includes(':tool-ui-'))) {
    failRepresentative(
      artifactPath('tool_ui_smoke_receipts'),
      `missing app tool UI smoke workflow evidence: ${missingWorkflowEvidence.filter(item => item.includes(':tool-ui-')).slice(0, 80).join(', ')}`,
    );
  }

  const serviceAvailable = new Set(serviceHealth?.summary?.available ?? []);
  const descriptorAvailable = new Set(descriptorDiscovery?.summary?.live_discovery_available ?? []);
  const catalogServices = new Map((allServerToolCatalog?.services ?? []).map(service => [service.service, service]));
  for (const service of requiredMcpServers) {
    if (!serviceAvailable.has(service)) {
      failRepresentative(artifactPath('service_health'), `required MCP server is not available: ${service}`);
    }
    if (!descriptorAvailable.has(service)) {
      failRepresentative(artifactPath('descriptor_discovery'), `required MCP server lacks live descriptor discovery: ${service}`);
    }
    const catalog = catalogServices.get(service);
    if (!catalog) {
      failAllTools(artifactPath('all_server_tool_catalog'), `required MCP server is absent from all-server catalog: ${service}`);
    } else if (!catalog.available || !catalog.full_facade_available) {
      failAllTools(artifactPath('all_server_tool_catalog'), `required MCP server lacks availability or hierarchical facade: ${service}`);
    }
  }
  if (allServerToolCatalog?.decision !== 'go' || (allServerToolCatalog?.summary?.blocker_count ?? 0) > 0) {
    failAllTools(artifactPath('all_server_tool_catalog'), `all-server catalog decision is ${allServerToolCatalog?.decision ?? 'missing'}`);
  }

  const advertisedEndpoints = mcpPlusPlusLibp2pCatalog?.advertised_endpoints ?? [];
  const unreachableAdvertised = advertisedEndpoints.filter(endpoint => endpoint.reachable !== true);
  if (mcpPlusPlusLibp2pCatalog?.decision !== 'go') {
    failAllTools(artifactPath('mcp_plus_plus_libp2p_catalog'), `MCP++/libp2p catalog decision is ${mcpPlusPlusLibp2pCatalog?.decision ?? 'missing'}`);
  }
  if (unreachableAdvertised.length > 0) {
    failAllTools(
      artifactPath('mcp_plus_plus_libp2p_catalog'),
      `advertised libp2p endpoints are unreachable: ${unreachableAdvertised.map(endpoint => `${endpoint.service}:${endpoint.multiaddr ?? endpoint.protocol ?? 'unknown'}`).join(', ')}`,
    );
  }
  if (mcpPlusPlusLibp2pReachability?.advertised && mcpPlusPlusLibp2pReachability.ok !== true) {
    failAllTools(artifactPath('mcpplusplus_libp2p_reachability'), 'advertised MCP++/libp2p reachability probe did not pass');
  }

  const policyTools = allToolsPolicyMatrix?.tools ?? allToolsPolicyMatrix?.rules ?? [];
  const ledgerCount = allToolsLedger?.summary?.exact_tool_record_count
    ?? allToolsLedger?.summary?.tool_record_count
    ?? allToolsLedger?.tool_count
    ?? (allToolsLedger?.tools ?? []).length;
  const appBindingCount = allToolsAppBindings?.summary?.binding_count
    ?? allToolsAppBindings?.tool_count
    ?? (allToolsAppBindings?.rows ?? allToolsAppBindings?.bindings ?? []).length;
  if (!policyTools.length || Number(allToolsPolicyMatrix?.tool_count ?? policyTools.length) !== policyTools.length) {
    failAllTools(artifactPath('all_tools_policy_matrix'), 'per-tool policy matrix is empty or internally inconsistent');
  }
  if (Number.isFinite(Number(ledgerCount)) && Number(ledgerCount) !== policyTools.length) {
    failAllTools(artifactPath('all_tools_ledger'), `ledger count ${ledgerCount} does not match policy matrix count ${policyTools.length}`);
  }
  if (Number.isFinite(Number(appBindingCount)) && Number(appBindingCount) !== policyTools.length) {
    failAllTools(artifactPath('all_tools_app_bindings'), `app binding count ${appBindingCount} does not match policy matrix count ${policyTools.length}`);
  }
  const malformedPolicyTools = policyTools
    .filter(tool => requiredPolicyFields.some(field => !hasNonEmptyValue(tool[field])))
    .map(tool => `${tool.tool_id ?? 'missing-tool-id'}:${requiredPolicyFields.filter(field => !hasNonEmptyValue(tool[field])).join('|')}`);
  if (malformedPolicyTools.length > 0) {
    failAllTools(artifactPath('all_tools_policy_matrix'), `tools missing policy classification fields: ${malformedPolicyTools.slice(0, 80).join(', ')}`);
  }
  const sideEffectfulWithoutReceipts = policyTools
    .filter(tool => tool.side_effectful && (tool.confirmation_policy !== 'required' || tool.receipt_policy !== 'required'))
    .map(tool => tool.tool_id);
  if (sideEffectfulWithoutReceipts.length > 0) {
    failAllTools(artifactPath('all_tools_policy_matrix'), `side-effectful tools lack confirmation and receipt policy: ${sideEffectfulWithoutReceipts.slice(0, 80).join(', ')}`);
  }
  if (allToolsExecutionReport) {
    const fixtureCount = allToolsExecutionReport.fixture_count ?? allToolsExecutionReport.summary?.fixture_count;
    if (fixtureCount !== policyTools.length) {
      failAllTools(artifactPath('all_tools_execution_report'), `execution fixture count ${fixtureCount ?? 'missing'} does not match policy matrix count ${policyTools.length}`);
    }
  }
  const failedPolicyGates = (allToolsReleaseGate?.gates ?? []).filter(gate => gate.status === 'fail' || gate.passed === false);
  if (allToolsReleaseGate?.decision !== 'go' || failedPolicyGates.length > 0 || (allToolsReleaseGate?.blockers ?? []).length > 0) {
    const failed = failedPolicyGates.map(gate => gate.gate_id ?? gate.id).join(', ') || 'decision/blockers';
    failAllTools(artifactPath('all_tools_policy_release_gate'), `all-tools policy release gate is not GO: ${failed}`);
  }
  if ((allToolsIdlCoverage?.app_routable_tool_coverage_count ?? 0) !== (allToolsIdlCoverage?.app_routable_tool_count ?? 0)) {
    failAllTools(artifactPath('all_tools_idl_coverage'), 'all-tools ORB/IDL app-routable tool coverage is incomplete');
  }
  if ((allToolsGlassesCoverage?.tool_coverage_count ?? 0) !== (allToolsIdlCoverage?.app_routable_tool_count ?? allToolsGlassesCoverage?.tool_coverage_count ?? 0)) {
    failAllTools(artifactPath('all_tools_glasses_coverage'), 'all-tools glasses projection coverage is incomplete');
  }

  if (agentSupervisorConsoleE2e?.decision !== 'go') {
    failRepresentative(artifactPath('agent_supervisor_console_e2e'), `Agent Supervisor Console decision is ${agentSupervisorConsoleE2e?.decision ?? 'missing'}`);
  }
  const observedSupervisorPaths = new Set((agentSupervisorConsoleE2e?.required_paths ?? [])
    .filter(item => item.observed)
    .map(item => item.path));
  for (const requiredPath of requiredSupervisorPaths) {
    if (!observedSupervisorPaths.has(requiredPath)) {
      failRepresentative(artifactPath('agent_supervisor_console_e2e'), `Agent Supervisor Console missing required path: ${requiredPath}`);
    }
  }
  const supervisorSourceOwners = new Set((agentSupervisorConsoleE2e?.scenarios ?? []).map(scenario => scenario.source_owner).filter(Boolean));
  for (const service of requiredMcpServers) {
    if (!supervisorSourceOwners.has(service)) {
      failRepresentative(artifactPath('agent_supervisor_console_e2e'), `Agent Supervisor Console does not prove service integration for ${service}`);
    }
  }
  const receiptCount = agentSupervisorConsoleReceipts?.receipt_count ?? (agentSupervisorConsoleReceipts?.receipts ?? []).length;
  if (receiptCount !== (agentSupervisorConsoleE2e?.summary?.receipt_count ?? receiptCount)) {
    failRepresentative(artifactPath('agent_supervisor_console_receipts'), 'Agent Supervisor Console receipt count does not match e2e evidence');
  }
  if ((agentSupervisorConsoleReceipts?.receipts ?? []).some(receipt => !receipt.receipt_cid || receipt.receipt_owner !== 'ipfs_kit_py')) {
    failRepresentative(artifactPath('agent_supervisor_console_receipts'), 'Agent Supervisor Console receipts must be owned by ipfs_kit_py and include receipt CIDs');
  }

  const orbDescriptors = orbIdlCompleteCoverage?.descriptors ?? [];
  if ((orbIdlCompleteCoverage?.app_count ?? 0) !== appIds.length || (orbIdlCompleteCoverage?.descriptor_count ?? 0) !== appIds.length) {
    failRepresentative(artifactPath('orb_idl_complete_coverage'), `ORB/IDL descriptor count does not match app inventory count ${appIds.length}`);
  }
  const orbAppIds = new Set(orbDescriptors.map(descriptor => descriptor.app_id).filter(Boolean));
  for (const appId of appIds) {
    if (!orbAppIds.has(appId)) {
      failRepresentative(artifactPath('orb_idl_complete_coverage'), `ORB/IDL descriptor missing for app: ${appId}`);
    }
  }
  const orbModalityGaps = [];
  for (const descriptor of orbDescriptors) {
    for (const modality of requiredOrbModalities) {
      const contract = descriptor.modality_contract?.[modality];
      if (!contract) {
        orbModalityGaps.push(`${descriptor.app_id}:${modality}:missing-contract`);
      } else if (!contract.fallback?.kind || !contract.fallback?.typed_reason) {
        orbModalityGaps.push(`${descriptor.app_id}:${modality}:missing-typed-fallback`);
      }
    }
    const operationPolicies = descriptor.action_policy?.operation_policies ?? [];
    const hasReadPolicy = operationPolicies.some(policy => policy.method === 'read_status' && policy.policy_class === 'read');
    const hasActionPolicy = operationPolicies.some(policy => (
      policy.method === 'request_action'
      && (policy.policy_class === 'read' || policy.confirmation === 'required')
      && policy.receipt_required === true
      && policy.fallback?.typed_reason === 'policy_gate'
    ));
    if (!hasReadPolicy || !hasActionPolicy) {
      orbModalityGaps.push(`${descriptor.app_id}:action-policy`);
    }
  }
  if (orbModalityGaps.length > 0) {
    failRepresentative(artifactPath('orb_idl_complete_coverage'), `ORB/IDL modality or policy coverage gaps: ${orbModalityGaps.slice(0, 80).join(', ')}`);
  }
  const supervisorProjection = orbIdlCompleteCoverage?.supervisor_console ?? {};
  if (
    supervisorProjection.app_id !== 'agent-supervisor'
    || supervisorProjection.status_read_only !== true
    || supervisorProjection.receipts_read_only !== true
    || supervisorProjection.steering_requires_confirmation !== true
  ) {
    failRepresentative(artifactPath('orb_idl_complete_coverage'), 'Agent Supervisor ORB/IDL projection is not read-only for status/receipts with confirmed steering');
  }

  const simulatorCaps = glassesSimulatorHandoff?.simulator?.capabilities ?? {};
  for (const capability of requiredSimulatorCapabilities) {
    if (simulatorCaps[capability] !== true) {
      failRepresentative(artifactPath('glasses_simulator_handoff'), `Meta glasses simulator capability is not available: ${capability}`);
    }
  }
  if (
    glassesSimulatorHandoff?.hardware_free !== true
    || glassesSimulatorHandoff?.simulator_driven !== true
    || glassesSimulatorHandoff?.physical_glasses_required !== false
    || glassesSimulatorHandoff?.direct_desktop_pairing_required !== false
  ) {
    failRepresentative(artifactPath('glasses_simulator_handoff'), 'Meta glasses evidence must be simulator-driven, hardware-free, and not depend on direct desktop/physical pairing');
  }
  const capabilityEvidence = new Map((glassesSimulatorHandoff?.capability_evidence ?? [])
    .map(evidence => [evidence.capability, evidence]));
  const simulatorWorkflowGaps = [];
  const hasVisibleStates = (items, states) => {
    const visible = new Set((items ?? [])
      .filter(item => item.visible_in_simulator !== false)
      .map(item => item.state)
      .filter(Boolean));
    return states.filter(state => !visible.has(state));
  };
  const displayEvidence = capabilityEvidence.get('display.output');
  simulatorWorkflowGaps.push(...hasVisibleStates(
    displayEvidence?.simulator_visible_states,
    ['rendered', 'updated', 'focused', 'activated', 'cleared'],
  ).map(state => `display.output:${state}`));
  const cameraEvidence = capabilityEvidence.get('camera.photo_capture');
  simulatorWorkflowGaps.push(...hasVisibleStates(
    cameraEvidence?.camera_permission_states,
    ['permission_denied', 'fallback', 'accepted'],
  ).map(state => `camera.photo_capture:${state}`));
  const microphoneStates = microphoneWorkflowStates(capabilityEvidence.get('microphone.input')?.audio_policy_states ?? []);
  for (const state of ['permission_required', 'capturing_transcript', 'denied']) {
    if (!microphoneStates.has(state)) simulatorWorkflowGaps.push(`microphone.input:${state}`);
  }
  const speakerStates = speakerWorkflowStates(capabilityEvidence.get('speaker.output')?.audio_policy_states ?? []);
  for (const state of ['playing', 'fallback']) {
    if (!speakerStates.has(state)) simulatorWorkflowGaps.push(`speaker.output:${state}`);
  }
  const inputSources = new Set((glassesSimulatorHandoff?.input_mapping_evidence ?? []).map(item => item.input_source).filter(Boolean));
  for (const inputSource of ['touch', 'voice']) {
    if (!inputSources.has(inputSource)) simulatorWorkflowGaps.push(`input_mapping:${inputSource}`);
  }
  if (glassesSimulatorHandoff?.acceptance_matrix) {
    for (const [key, value] of Object.entries(glassesSimulatorHandoff.acceptance_matrix)) {
      if (value !== true) simulatorWorkflowGaps.push(`acceptance_matrix:${key}`);
    }
  }
  if (simulatorWorkflowGaps.length > 0) {
    failRepresentative(artifactPath('glasses_simulator_handoff'), `Meta glasses simulator modality workflow gaps: ${simulatorWorkflowGaps.join(', ')}`);
  }

  const blockerCount = representativeBlockers.length + allToolsBlockers.length;
  return {
    representative_blockers: dedupe(representativeBlockers),
    all_tools_blockers: dedupe(allToolsBlockers),
    summary: {
      status: 'present',
      decision: blockerCount === 0 ? 'go' : 'no_go',
      release_decision: blockerCount === 0 ? 'GO' : 'NO_GO',
      blocker_count: blockerCount,
      representative_blocker_count: representativeBlockers.length,
      all_tools_blocker_count: allToolsBlockers.length,
      required_mcp_servers: requiredMcpServers,
      required_orb_modalities: requiredOrbModalities,
      required_simulator_capabilities: requiredSimulatorCapabilities,
      required_supervisor_paths: requiredSupervisorPaths,
      app_count: appIds.length,
      evidence_paths: Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, artifact.path])),
      missing_evidence_paths: dedupe(missingEvidencePaths),
      representative_blockers: dedupe(representativeBlockers),
      all_tools_blockers: dedupe(allToolsBlockers),
    },
  };
}

function microphoneWorkflowStates(states) {
  const observed = new Set();
  for (const state of states) {
    if (state.state === 'permission_required' && state.policy_outcome === 'require_confirmation') {
      observed.add('permission_required');
    }
    if (state.audio_state === 'capturing' && state.transcript?.state === 'redacted_transcript_available') {
      observed.add('capturing_transcript');
    }
    if (state.policy_outcome === 'deny' || state.audio_state === 'denied' || state.transcript?.state === 'denied') {
      observed.add('denied');
    }
  }
  return observed;
}

function speakerWorkflowStates(states) {
  const observed = new Set();
  for (const state of states) {
    if (state.audio_state === 'playing') observed.add('playing');
    if (state.audio_state === 'fallback' || state.policy_outcome === 'fallback') observed.add('fallback');
  }
  return observed;
}

function refreshReleaseEvidenceFreshness() {
  execFileSync(
    process.execPath,
    [
      'scripts/audit-release-evidence-freshness.mjs',
      '--update',
      'virtual-desktop-release-evidence',
      '--json',
      'docs/release-evidence-freshness.json',
      '--report',
      'docs/release-evidence-freshness.md',
    ],
    {
      cwd: projectRoot,
      stdio: 'pipe',
    },
  );
}

function mergeCounts(countObjects) {
  const merged = {};
  for (const counts of countObjects) {
    for (const [key, value] of Object.entries(counts)) {
      merged[key] = (merged[key] ?? 0) + Number(value ?? 0);
    }
  }
  return merged;
}

function releaseNextActions({ hierarchicalDecision, representativeDecision, allToolsDecision }) {
  const actions = [];
  if (hierarchicalDecision !== 'go') {
    actions.push('Refresh hierarchical MCP evidence and close missing facade meta-tools, failed representative dispatch, or unexplained direct-only descriptor gaps.');
  }
  if (representativeDecision !== 'go') {
    actions.push('Refresh representative virtual desktop evidence and close app launch, screenshot, service, descriptor, handoff, critical-flow, or receipt blockers.');
  }
  if (allToolsDecision !== 'go') {
    actions.push('Close exhaustive all-tools release policy blockers and rebuild virtual desktop release evidence.');
  }
  return actions;
}

function buildSupervisorReleaseFreshness(report) {
  const artifactEntries = Object.entries(report.artifacts ?? {}).map(([id, artifact]) => ({
    id,
    status: artifact.status,
    required: Boolean(artifact.required),
    path: artifact.path,
    schema: artifact.schema ?? null,
    generated_at: artifact.generated_at ?? null,
    error: artifact.error ?? null,
  }));
  const staleArtifacts = artifactEntries
    .filter(artifact => artifact.required && artifact.status !== 'present')
    .map(artifact => artifact.id);

  return {
    schema: 'swissknife.all_tools_supervisor_release_freshness.v1',
    generated_at: report.generated_at,
    source_schema: report.schema,
    source_report: 'test-results/virtual-desktop-ipfs-mcp-orb/release-evidence.json',
    decision: report.go_no_go?.decision ?? 'unknown',
    blocker_count: report.go_no_go?.blocker_count ?? 0,
    warning_count: report.go_no_go?.warning_count ?? 0,
    stale_artifact_count: staleArtifacts.length,
    stale_artifacts: staleArtifacts,
    hierarchical_mcp: {
      decision: report.hierarchical_mcp?.release_gate_decision ?? report.hierarchical_mcp?.decision ?? 'unknown',
      generated_at: report.hierarchical_mcp?.generated_at ?? null,
      direct_only_descriptor_count: report.hierarchical_mcp?.direct_only_descriptor_count ?? null,
      unexplained_flat_hierarchy_gap_count: report.hierarchical_mcp?.unexplained_flat_hierarchy_gap_count ?? null,
    },
    all_tools: {
      decision: report.exhaustive_all_tools_gate?.decision ?? 'unknown',
      blocker_count: report.exhaustive_all_tools_gate?.blocker_count ?? 0,
    },
    artifacts: artifactEntries,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# SwissKnife Virtual Desktop All-Tools Release Evidence');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Decision: **${report.go_no_go.decision.toUpperCase().replace('_', '-')}**`);
  lines.push('');
  lines.push('## Blockers');
  if (report.go_no_go.blockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of report.go_no_go.blockers) lines.push(`- ${blockerText(blocker)}`);
  }
  lines.push('');
  lines.push('## Representative App Evidence');
  lines.push(`- Manifest apps: ${report.manifest.app_count ?? 'unknown'}`);
  lines.push(`- Launch evidence: ${report.launch_status.status}; opened ${report.launch_status.opened ?? 'unknown'} / ${report.launch_status.app_count ?? 'unknown'}`);
  lines.push(`- App screenshots: ${report.screenshot_coverage.app_screenshots.count} / ${report.screenshot_coverage.app_screenshots.expected ?? 'unknown'}`);
  lines.push(`- SWR-110 complete evidence gate: ${report.swr110_release_gate.release_decision}; blockers ${report.swr110_release_gate.blocker_count}`);
  lines.push(`- App matrix release gate: ${report.virtual_desktop_app_matrix_gate.decision}; blockers ${report.virtual_desktop_app_matrix_gate.blocker_count}`);
  lines.push(`- Glasses handoff: ${report.glasses_handoff.status}; passed ${report.glasses_handoff.passed_count ?? 'unknown'} / ${report.glasses_handoff.displayable_count ?? 'unknown'} displayable apps`);
  lines.push(`- Service availability: ${(report.service_health.available ?? []).length} available, ${(report.service_health.unavailable ?? []).length} unavailable`);
  lines.push(`- Hierarchical MCP facade: ${report.hierarchical_mcp.services_with_full_facade ?? 'unknown'} / ${report.hierarchical_mcp.service_count ?? 'unknown'} services; dispatch ${report.hierarchical_mcp.dispatch_pass_count ?? 'unknown'} / ${report.hierarchical_mcp.dispatch_probe_count ?? 'unknown'} passed`);
  lines.push(`- Hierarchical MCP direct-only descriptors: ${report.hierarchical_mcp.direct_only_descriptor_count ?? 'unknown'}; unexplained gaps ${report.hierarchical_mcp.unexplained_flat_hierarchy_gap_count ?? 'unknown'}`);
  lines.push(`- All-tools fallback states: ${report.fallback_coverage.all_tools_app_family_states.fallback_state_family_count ?? 'unknown'} / ${report.fallback_coverage.all_tools_app_family_states.app_family_count ?? 'unknown'} app families`);
  lines.push(`- Legacy gateway fallback specs present: ${report.fallback_coverage.legacy_gateway_spec_count}`);
  lines.push(`- Live receipt samples: ${report.receipt_samples.live_receipt_samples.status}; count ${report.receipt_samples.live_receipt_samples.sample_count ?? 0}`);
  lines.push(`- Representative decision: ${report.representative_app_gate.decision}`);
  lines.push('');
  lines.push('## SWR-110 Complete Release Evidence Gate');
  lines.push(`- Decision: ${report.swr110_release_gate.release_decision}`);
  lines.push(`- Required MCP servers: ${report.swr110_release_gate.required_mcp_servers.join(', ')}`);
  lines.push(`- Required ORB/IDL modalities: ${report.swr110_release_gate.required_orb_modalities.join(', ')}`);
  lines.push(`- Required simulator capabilities: ${report.swr110_release_gate.required_simulator_capabilities.join(', ')}`);
  lines.push(`- Required supervisor paths: ${report.swr110_release_gate.required_supervisor_paths.join(', ')}`);
  lines.push(`- Missing/failing evidence paths: ${report.swr110_release_gate.missing_evidence_paths.join(', ') || 'none'}`);
  if ((report.swr110_release_gate.representative_blockers ?? []).length > 0) {
    lines.push('- Representative blockers:');
    for (const blocker of report.swr110_release_gate.representative_blockers.slice(0, 40)) {
      lines.push(`  - ${blocker}`);
    }
  }
  if ((report.swr110_release_gate.all_tools_blockers ?? []).length > 0) {
    lines.push('- All-tools blockers:');
    for (const blocker of report.swr110_release_gate.all_tools_blockers.slice(0, 40)) {
      lines.push(`  - ${blocker}`);
    }
  }
  lines.push('');
  lines.push('## Virtual Desktop App Matrix Gate');
  lines.push(`- Decision: ${report.virtual_desktop_app_matrix_gate.decision}`);
  lines.push(`- Apps checked: ${report.virtual_desktop_app_matrix_gate.app_count}`);
  lines.push(`- Required workflow states: ${report.virtual_desktop_app_matrix_gate.required_workflow_states.join(', ')}`);
  lines.push(`- Required simulator modalities: ${report.virtual_desktop_app_matrix_gate.required_simulator_modalities.join(', ')}`);
  lines.push(`- Observed simulator modalities: ${report.virtual_desktop_app_matrix_gate.observed_simulator_modalities.join(', ') || 'none'}`);
  lines.push(`- Required simulator capability modalities: ${(report.virtual_desktop_app_matrix_gate.required_simulator_capability_modalities ?? []).join(', ')}`);
  lines.push(`- Observed simulator capability modalities: ${(report.virtual_desktop_app_matrix_gate.observed_simulator_capability_modalities ?? []).join(', ') || 'none'}`);
  lines.push(`- Missing backend contracts: ${report.virtual_desktop_app_matrix_gate.missing_contract_app_ids.join(', ') || 'none'}`);
  lines.push(`- Missing workflows: ${report.virtual_desktop_app_matrix_gate.missing_workflow_app_ids.join(', ') || 'none'}`);
  lines.push(`- Missing screenshots: ${report.virtual_desktop_app_matrix_gate.missing_screenshot_apps.map(item => item.app_id).join(', ') || 'none'}`);
  lines.push(`- Missing workflow states: ${report.virtual_desktop_app_matrix_gate.missing_workflow_states.map(item => `${item.app_id}:${item.state}`).join(', ') || 'none'}`);
  lines.push(`- Missing UX states: ${report.virtual_desktop_app_matrix_gate.missing_ux_states.map(item => `${item.app_id}:${item.state}`).join(', ') || 'none'}`);
  lines.push(`- Missing backend capability sets: ${(report.virtual_desktop_app_matrix_gate.missing_backend_capability_set_app_ids ?? []).join(', ') || 'none'}`);
  lines.push(`- Malformed backend capabilities: ${(report.virtual_desktop_app_matrix_gate.malformed_backend_capabilities ?? []).map(item => `${item.app_id}:${item.capability_id ?? 'contract'}:${(item.missing_fields ?? []).join('|')}`).slice(0, 40).join(', ') || 'none'}`);
  lines.push(`- Missing app-visible binding capabilities: ${(report.virtual_desktop_app_matrix_gate.missing_app_visible_binding_capabilities ?? []).map(item => `${item.app_id}:${item.capability_id}`).slice(0, 40).join(', ') || 'none'}`);
  lines.push(`- Missing ORB/IDL apps: ${report.virtual_desktop_app_matrix_gate.missing_orb_idl_app_ids.join(', ') || 'none'}`);
  lines.push(`- Missing ORB/IDL capabilities: ${report.virtual_desktop_app_matrix_gate.missing_orb_idl_capabilities.map(item => item.capability_id).slice(0, 40).join(', ') || 'none'}`);
  lines.push(`- Missing catalog reconciliation: ${report.virtual_desktop_app_matrix_gate.missing_catalog_reconciliation.map(item => `${item.service}:${item.tool_id}`).slice(0, 40).join(', ') || 'none'}`);
  lines.push(`- Server catalog gaps: ${report.virtual_desktop_app_matrix_gate.server_catalog_gaps.map(item => `${item.server}:${item.kind}:${item.descriptor_count}`).join(', ') || 'none'}`);
  lines.push(`- Missing simulator capability modalities: ${(report.virtual_desktop_app_matrix_gate.missing_simulator_capability_modalities ?? []).join(', ') || 'none'}`);
  lines.push(`- Simulator replay gaps: ${report.virtual_desktop_app_matrix_gate.simulator_replay_gaps.map(item => `${item.projection_id}:${item.simulator_state}`).slice(0, 40).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Hierarchical MCP Evidence');
  lines.push(`- Evidence decision: ${report.hierarchical_mcp.decision ?? report.hierarchical_mcp.status}; release gate: ${report.hierarchical_mcp.release_gate_decision ?? report.hierarchical_mcp.status}`);
  lines.push(`- Services live: ${report.hierarchical_mcp.available_service_count ?? 'unknown'} / ${report.hierarchical_mcp.service_count ?? 'unknown'}`);
  lines.push(`- Expected live services: ${(report.hierarchical_mcp.expected_live_services ?? []).join(', ') || 'none'}`);
  lines.push(`- Full facade services: ${report.hierarchical_mcp.services_with_full_facade ?? 'unknown'} / ${report.hierarchical_mcp.service_count ?? 'unknown'}`);
  lines.push(`- Dispatch probes: ${report.hierarchical_mcp.dispatch_pass_count ?? 'unknown'} / ${report.hierarchical_mcp.dispatch_probe_count ?? 'unknown'}`);
  lines.push(`- Alias dispatch probes: ${report.hierarchical_mcp.alias_dispatch_pass_count ?? 'unknown'} / ${report.hierarchical_mcp.alias_dispatch_probe_count ?? 'unknown'}`);
  lines.push(`- Direct-only descriptors: ${report.hierarchical_mcp.direct_only_descriptor_count ?? 'unknown'}; receipt probes ${report.hierarchical_mcp.direct_only_receipt_count ?? 'unknown'} / ${report.hierarchical_mcp.direct_only_probe_count ?? 'unknown'}`);
  lines.push(`- Removed from app-visible ledger: ${report.hierarchical_mcp.removed_from_app_visible_ledger_count ?? 'unknown'}`);
  lines.push(`- Unexplained flat hierarchy gaps: ${report.hierarchical_mcp.unexplained_flat_hierarchy_gap_count ?? 'unknown'}`);
  for (const mismatch of report.hierarchical_mcp.availability_mismatches ?? []) {
    lines.push(`- Availability mismatch ${mismatch.service}: ${mismatch.reason}`);
  }
  for (const service of report.hierarchical_mcp.missing_facade_by_service ?? []) {
    lines.push(`- Missing facade ${service.service}: ${service.missing_meta_tools.join(', ')}`);
  }
  if ((report.hierarchical_mcp.unobserved_services ?? []).length > 0) {
    lines.push(`- Unobserved services: ${report.hierarchical_mcp.unobserved_services.join(', ')}`);
  }
  for (const directOnly of report.hierarchical_mcp.direct_only_summaries ?? []) {
    lines.push(`- Direct-only ${directOnly.service}: ${directOnly.count ?? directOnly.descriptor_count ?? 'unknown'} descriptors; sample ${directOnly.sample.slice(0, 6).map(item => item.tool_id ?? item.name ?? String(item)).join(', ') || 'none'}`);
  }
  lines.push('');
  lines.push('## Exhaustive All-Tools Evidence');
  lines.push(`- Ledger tools: ${report.all_tools.ledger.exact_tool_record_count ?? 'unknown'} exact records; live ${report.all_tools.ledger.live_exact_tool_count ?? 'unknown'}; static ${report.all_tools.ledger.static_exact_tool_count ?? 'unknown'}`);
  lines.push(`- Policy classifications: ${report.all_tools.classification.tool_count ?? 'unknown'} tools`);
  lines.push(`- App bindings: ${report.all_tools.app_bindings.app_visible_tool_count ?? 'unknown'} app-visible tools / ${report.all_tools.app_bindings.tool_count ?? 'unknown'} total`);
  lines.push(`- App-family states: ${report.all_tools.app_family_coverage.app_family_count ?? 'unknown'} families; fallback ${report.all_tools.app_family_coverage.fallback_state_family_count ?? 'unknown'}; blocked ${report.all_tools.app_family_coverage.blocked_state_family_count ?? 'unknown'}; degraded ${report.all_tools.app_family_coverage.degraded_state_family_count ?? 'unknown'}`);
  lines.push(`- Execution fixtures: ${report.all_tools.execution_fixtures.fixture_count ?? 'unknown'} total; ${report.all_tools.execution_fixtures.app_routable_fixture_count ?? 'unknown'} app-routable; ${report.all_tools.execution_fixtures.denied_fixture_count ?? 'unknown'} denied`);
  lines.push(`- ORB/IDL descriptors: ${report.all_tools.orb_idl.descriptor_count ?? 'unknown'} descriptors; ${report.all_tools.orb_idl.method_count ?? 'unknown'} methods; ${report.all_tools.orb_idl.adapter_required_method_count ?? 'unknown'} adapter-required methods`);
  lines.push(`- Meta glasses projections: ${report.all_tools.glasses_projection.projection_count ?? 'unknown'} projections; ${report.all_tools.glasses_projection.hardware_free_replay_state_count ?? 'unknown'} replay states`);
  lines.push(`- Tombstones: ${report.all_tools.ledger.tombstone_count ?? 'unknown'}`);
  lines.push(`- New-tool drift: +${report.all_tools.ledger.drift?.added_tool_count ?? 0} / -${report.all_tools.ledger.drift?.removed_tool_count ?? 0} / changed ${report.all_tools.ledger.drift?.changed_schema_tool_count ?? 0}`);
  lines.push(`- Exhaustive all-tools decision: ${report.exhaustive_all_tools_gate.decision}`);
  lines.push('');
  lines.push('## Hierarchical MCP Evidence');
  lines.push(`- Evidence: ${report.hierarchical_mcp.status} (${report.hierarchical_mcp.path})`);
  lines.push(`- Release gate: ${report.hierarchical_mcp.release_gate_decision ?? 'unknown'}`);
  lines.push(`- Live services: ${report.hierarchical_mcp.available_service_count ?? 'unknown'} / ${report.hierarchical_mcp.service_count ?? 'unknown'}`);
  lines.push(`- Full facade services: ${report.hierarchical_mcp.services_with_full_facade ?? 'unknown'} / ${report.hierarchical_mcp.service_count ?? 'unknown'}`);
  lines.push(`- Representative dispatch: ${report.hierarchical_mcp.dispatch_pass_count ?? 'unknown'} / ${report.hierarchical_mcp.dispatch_probe_count ?? 'unknown'} passed`);
  lines.push(`- Direct-only descriptors: ${report.hierarchical_mcp.direct_only_descriptor_count ?? 'unknown'}`);
  lines.push(`- Removed from app-visible ledger: ${report.hierarchical_mcp.removed_from_app_visible_ledger_count ?? 'unknown'}`);
  lines.push(`- Unexplained flat/hierarchy gaps: ${report.hierarchical_mcp.unexplained_flat_hierarchy_gap_count ?? 'unknown'}`);
  for (const failure of report.hierarchical_mcp.dispatch_failures ?? []) {
    lines.push(`- Dispatch failure ${failure.service}:${failure.category ?? 'unknown'}.${failure.tool ?? 'unknown'} (${failure.status})`);
  }
  for (const service of report.hierarchical_mcp.missing_facade_by_service ?? []) {
    lines.push(`- Missing facade ${service.service}: ${(service.missing_meta_tools ?? []).join(', ') || 'unknown'}`);
  }
  lines.push('');
  lines.push('## Release Gates');
  const releaseGate = report.all_tools.release_policy_gate;
  lines.push(`- Gate summary: ${releaseGate.pass_count ?? 'unknown'} passed, ${releaseGate.fail_count ?? 'unknown'} failed, ${releaseGate.warn_count ?? 'unknown'} warned`);
  for (const gate of releaseGate.failed_gates ?? []) {
    lines.push(`- Failed gate ${gate.gate_id}: ${gate.summary}`);
  }
  lines.push('');
  lines.push('## Artifacts');
  for (const [key, artifact] of Object.entries(report.artifacts)) {
    lines.push(`- ${key}: ${artifact.status} (${artifact.path})`);
  }
  lines.push('');
  lines.push('## Warnings');
  if (report.go_no_go.warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const warning of report.go_no_go.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('## Next Actions');
  if (report.go_no_go.next_actions.length === 0) {
    lines.push('- None');
  } else {
    for (const action of report.go_no_go.next_actions) lines.push(`- ${action}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

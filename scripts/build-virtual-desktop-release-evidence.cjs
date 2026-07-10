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
  ['manifest_drift', 'manifest-drift.json', true],
  ['app_launch', 'app-launch-report.json', true],
  ['capability_matrix', 'capability-matrix.json', false],
  ['descriptor_discovery', 'descriptor-discovery.json', true],
  ['service_health', 'service-health.json', true],
  ['hierarchical_mcp_tools', 'hierarchical-tools-evidence.json', true],
  ['glasses_handoff', 'glasses-handoff-report.json', true],
  ['live_critical_flows', 'live-critical-flows.json', true],
  ['receipt_samples', 'receipt-samples.json', true],
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
const manifestDrift = data.manifest_drift;
const appLaunch = data.app_launch;
const descriptorDiscovery = data.descriptor_discovery;
const serviceHealth = data.service_health;
const hierarchicalMcpTools = data.hierarchical_mcp_tools;
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
const requiredHierarchicalMetaTools = [
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
];

const appScreenshotCoverage = screenshotCoverage(
  'app-screenshots',
  appLaunch?.app_count ? appLaunch.app_count + 1 : appInventory?.app_count ? appInventory.app_count + 1 : null,
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
  const unavailable = serviceHealthSummary.unavailable;
  if (unavailable.length > 0) {
    representativeBlockers.push(`MCP services unavailable: ${unavailable.join(', ')}.`);
  }
  const endpointFailures = serviceHealthSummary.endpoint_failures;
  if (endpointFailures > 0) {
    warnings.push(`${endpointFailures} MCP endpoint probes failed while service availability remained usable.`);
  }
}

const hierarchicalMcpGate = summarizeHierarchicalMcpEvidence(hierarchicalMcpTools, artifacts.hierarchical_mcp_tools.path, {
  descriptorDiscovery,
  serviceHealth,
});
representativeBlockers.push(...hierarchicalMcpGate.blockers);
warnings.push(...hierarchicalMcpGate.warnings);

if (descriptorDiscovery) {
  const available = descriptorDiscoverySummary.live_discovery_available;
  for (const serviceId of ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']) {
    if (!available.includes(serviceId)) {
      representativeBlockers.push(`${serviceId} live descriptor discovery is unavailable.`);
    }
  }
}

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
  if (allToolsReleaseGate.decision !== 'go') {
    allToolsBlockers.push(...(allToolsReleaseGate.blockers ?? []));
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
          live_discovery_available: descriptorDiscoverySummary.live_discovery_available,
          static_fallback_used: descriptorDiscoverySummary.static_fallback_used,
          tool_counts: descriptorDiscoverySummary.tool_counts,
          interface_counts: descriptorDiscoverySummary.interface_counts,
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
  hierarchical_mcp: hierarchicalMcpGate.report,
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
    blockers: allToolsBlockerTexts,
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

function summarizeHierarchicalMcpEvidence(evidence, artifactPath, context = {}) {
  if (!evidence) {
    return {
      decision: 'no_go',
      blockers: [`Missing required hierarchical MCP evidence artifact: ${artifactPath}`],
      warnings: [],
      report: missingStatus(artifactPath),
    };
  }

  const blockers = [];
  const warningsForGate = [];
  const services = Array.isArray(evidence.services) ? evidence.services : [];
  const serviceByName = new Map(services.map(service => [service.service ?? service.service_id ?? 'unknown_service', service]));
  const expectedLiveEvidence = releaseExpectedHierarchicalServices(context, evidence.generated_at);
  const expectedLiveServices = expectedLiveEvidence.services;
  const availabilityMismatches = [];
  const metaTools = Array.isArray(evidence.meta_tools) && evidence.meta_tools.length > 0
    ? evidence.meta_tools
    : requiredHierarchicalMetaTools;
  const requiredMetaTools = requiredHierarchicalMetaTools;
  const missingFacadeByService = [];
  const unobservedServices = [];
  const dispatchFailures = [];
  const directOnlySummaries = [];
  const removedFromLedgerSummaries = [];
  const directOnlyPolicyCounts = {};
  const directOnlyReasonCounts = {};
  let directOnlyDescriptorCount = 0;
  let directOnlyProbeCount = 0;
  let directOnlyReceiptCount = 0;
  let removedFromAppVisibleLedgerCount = 0;
  let unexplainedFlatHierarchyGapCount = 0;

  if (evidence.schema !== 'swissknife.hierarchical-mcp-tools-evidence.v1') {
    warningsForGate.push(`Hierarchical MCP evidence schema is ${evidence.schema ?? 'unknown'}.`);
  }

  if (evidence.decision === 'no_go') {
    blockers.push(...(evidence.blockers ?? ['Hierarchical MCP evidence reported no_go.']));
  }

  for (const serviceName of expectedLiveServices) {
    const service = serviceByName.get(serviceName);
    if (!service) {
      const message = `${serviceName} is available in release service evidence but missing from hierarchical MCP evidence.`;
      blockers.push(message);
      availabilityMismatches.push({
        service: serviceName,
        expected_live: true,
        hierarchical_available: null,
        reason: 'missing_service_row',
      });
      continue;
    }
    if (service.available !== true) {
      const message = `${serviceName} is available in release service evidence but hierarchical MCP evidence did not observe it live.`;
      blockers.push(message);
      availabilityMismatches.push({
        service: serviceName,
        expected_live: true,
        hierarchical_available: false,
        reason: 'not_observed_by_hierarchical_probe',
      });
    }
  }

  if (expectedLiveEvidence.stale_live_services.length > 0) {
    const sample = expectedLiveEvidence.stale_live_services
      .slice(0, 6)
      .map(item => `${item.service} from ${item.source}`)
      .join(', ');
    warningsForGate.push(
      `Ignored ${expectedLiveEvidence.stale_live_services.length} stale live-service expectations older than the hierarchical evidence batch: ${sample}.`,
    );
  }

  for (const service of services) {
    const serviceName = service.service ?? service.service_id ?? 'unknown_service';
    const missingMetaTools = requiredMetaTools.filter(tool => service.meta_presence?.[tool] !== true);
    const serviceAvailable = service.available === true;
    const releaseExpectedLive = expectedLiveServices.has(serviceName);
    const serviceMustExposeFacade = serviceAvailable || releaseExpectedLive;

    if (serviceMustExposeFacade && missingMetaTools.length > 0) {
      const message = `${serviceName} is missing hierarchical facade meta-tools: ${missingMetaTools.join(', ')}.`;
      blockers.push(message);
      missingFacadeByService.push({
        service: serviceName,
        missing_meta_tools: missingMetaTools,
        service_available: serviceAvailable,
        expected_live_from_release_evidence: releaseExpectedLive,
      });
    } else if (!serviceAvailable) {
      unobservedServices.push(serviceName);
    }

    if (serviceMustExposeFacade && service.full_facade_available === true && !service.dispatch_probe) {
      blockers.push(`${serviceName} has the full hierarchical facade but no representative tools_dispatch probe.`);
    }
    if (service.dispatch_probe && service.dispatch_probe.ok !== true) {
      const target = [service.dispatch_probe.category, service.dispatch_probe.tool].filter(Boolean).join('.');
      const message = `${serviceName} representative tools_dispatch probe failed${target ? ` for ${target}` : ''}.`;
      blockers.push(message);
      dispatchFailures.push({
        service: serviceName,
        category: service.dispatch_probe.category ?? null,
        tool: service.dispatch_probe.tool ?? null,
        status: service.dispatch_probe.status ?? null,
      });
    }
    if ((service.alias_dispatch_failed_count ?? 0) > 0) {
      blockers.push(`${serviceName} has ${service.alias_dispatch_failed_count} failed hierarchical alias dispatch probes.`);
    }

    const serviceUnexplainedGapCount = service.unexplained_flat_hierarchy_gap_count ?? 0;
    unexplainedFlatHierarchyGapCount += serviceUnexplainedGapCount;
    if (serviceUnexplainedGapCount > 0) {
      blockers.push(`${serviceName} has ${serviceUnexplainedGapCount} app-visible flat descriptors that are neither hierarchical nor direct-only.`);
    }

    const serviceDirectOnlyCount = service.flat_direct_only_count ?? 0;
    directOnlyDescriptorCount += serviceDirectOnlyCount;
    directOnlyProbeCount += service.direct_only_probe_count ?? 0;
    directOnlyReceiptCount += service.direct_only_receipt_count ?? 0;
    mergeCounts(directOnlyPolicyCounts, service.flat_direct_only_policy_counts);
    mergeCounts(directOnlyReasonCounts, service.flat_direct_only_reason_counts);
    if (serviceDirectOnlyCount > 0) {
      const policyCountTotal = sumObjectValues(service.flat_direct_only_policy_counts);
      const reasonCountTotal = sumObjectValues(service.flat_direct_only_reason_counts);
      directOnlySummaries.push({
        service: serviceName,
        descriptor_count: serviceDirectOnlyCount,
        probe_count: service.direct_only_probe_count ?? 0,
        receipt_count: service.direct_only_receipt_count ?? 0,
        policy_counts: service.flat_direct_only_policy_counts ?? {},
        reason_counts: service.flat_direct_only_reason_counts ?? {},
        sample: (service.flat_direct_only_sample ?? service.flat_direct_only_descriptors ?? [])
          .slice(0, 12)
          .map(descriptor => typeof descriptor === 'string' ? descriptor : descriptor.name)
          .filter(Boolean),
      });
      warningsForGate.push(
        `${serviceName} retains ${serviceDirectOnlyCount} reviewed direct-only descriptors; ` +
        `${service.direct_only_receipt_count ?? 0}/${service.direct_only_probe_count ?? 0} representative probes produced receipts.`,
      );
      if (policyCountTotal !== serviceDirectOnlyCount || reasonCountTotal !== serviceDirectOnlyCount) {
        blockers.push(
          `${serviceName} direct-only descriptors are not fully accounted by policy and reason counts ` +
          `(${policyCountTotal}/${serviceDirectOnlyCount} policy, ${reasonCountTotal}/${serviceDirectOnlyCount} reason).`,
        );
      }
    }
    if ((service.direct_only_probe_count ?? 0) > 0 && (service.direct_only_receipt_count ?? 0) < service.direct_only_probe_count) {
      blockers.push(`${serviceName} direct-only descriptor probes produced ${service.direct_only_receipt_count ?? 0}/${service.direct_only_probe_count} receipts.`);
    }

    const serviceRemovedCount = service.removed_from_app_visible_ledger_count ?? 0;
    removedFromAppVisibleLedgerCount += serviceRemovedCount;
    if (serviceRemovedCount > 0) {
      removedFromLedgerSummaries.push({
        service: serviceName,
        descriptor_count: serviceRemovedCount,
        sample: service.removed_from_app_visible_ledger_sample ?? [],
      });
      warningsForGate.push(`${serviceName} has ${serviceRemovedCount} flat descriptors accounted as removed from the app-visible ledger.`);
    }
  }

  for (const warning of evidence.warnings ?? []) {
    warningsForGate.push(`Hierarchical MCP evidence warning: ${warning}`);
  }

  const serviceCount = evidence.summary?.service_count ?? services.length;
  const availableServiceCount = evidence.summary?.available_service_count
    ?? services.filter(service => service.available === true).length;
  if (availableServiceCount < serviceCount) {
    warningsForGate.push(`Hierarchical MCP evidence observed ${availableServiceCount}/${serviceCount} configured services live.`);
  }

  return {
    decision: blockers.length === 0 ? 'go' : 'no_go',
    blockers: dedupe(blockers),
    warnings: dedupe(warningsForGate),
    report: {
      status: 'present',
      path: artifactPath,
      schema: evidence.schema ?? null,
      generated_at: evidence.generated_at ?? null,
      decision: evidence.decision ?? null,
      release_gate_decision: blockers.length === 0 ? 'go' : 'no_go',
      live_fleet_required: evidence.live_fleet_required ?? null,
      service_count: serviceCount,
      available_service_count: availableServiceCount,
      expected_live_services: [...expectedLiveServices],
      stale_live_service_evidence: expectedLiveEvidence.stale_live_services,
      availability_mismatches: availabilityMismatches,
      services_with_full_facade: evidence.summary?.services_with_full_facade ?? services.filter(service => service.full_facade_available).length,
      meta_tools: metaTools,
      missing_facade_by_service: missingFacadeByService,
      unobserved_services: unobservedServices,
      dispatch_probe_count: evidence.summary?.dispatch_probe_count ?? services.filter(service => service.dispatch_probe).length,
      dispatch_pass_count: evidence.summary?.dispatch_pass_count ?? services.filter(service => service.dispatch_probe?.ok).length,
      dispatch_failures: dispatchFailures,
      alias_dispatch_probe_count: evidence.summary?.alias_dispatch_probe_count ?? sumBy(services, service => service.alias_dispatch_probe_count ?? 0),
      alias_dispatch_pass_count: evidence.summary?.alias_dispatch_pass_count ?? sumBy(services, service => service.alias_dispatch_pass_count ?? 0),
      direct_only_descriptor_count: directOnlyDescriptorCount,
      direct_only_probe_count: directOnlyProbeCount,
      direct_only_receipt_count: directOnlyReceiptCount,
      direct_only_policy_counts: directOnlyPolicyCounts,
      direct_only_reason_counts: directOnlyReasonCounts,
      direct_only_summaries: directOnlySummaries,
      removed_from_app_visible_ledger_count: removedFromAppVisibleLedgerCount,
      removed_from_app_visible_ledger_summaries: removedFromLedgerSummaries,
      unexplained_flat_hierarchy_gap_count: unexplainedFlatHierarchyGapCount,
      evidence_blockers: evidence.blockers ?? [],
      evidence_warnings: evidence.warnings ?? [],
      release_blockers: dedupe(blockers),
      release_warnings: dedupe(warningsForGate),
    },
  };
}

function releaseExpectedHierarchicalServices({ descriptorDiscovery, serviceHealth } = {}, hierarchicalGeneratedAt = null) {
  const names = new Set();
  const staleLiveServices = [];
  const addFromArtifact = (artifact, source, serviceIds) => {
    const fresh = artifactFreshForHierarchical(artifact?.generated_at, hierarchicalGeneratedAt);
    for (const serviceId of serviceIds) {
      if (!serviceId) continue;
      if (fresh) {
        names.add(serviceId);
      } else {
        staleLiveServices.push({
          service: serviceId,
          source,
          source_generated_at: artifact.generated_at,
          hierarchical_generated_at: hierarchicalGeneratedAt,
        });
      }
    }
  };

  addFromArtifact(serviceHealth, 'service_health.summary.available', serviceHealth?.summary?.available ?? []);
  addFromArtifact(
    serviceHealth,
    'service_health.services',
    (serviceHealth?.services ?? [])
      .filter(service => service?.available === true)
      .map(service => service.id ?? service.service_id ?? service.service),
  );
  addFromArtifact(
    descriptorDiscovery,
    'descriptor_discovery.summary.live_discovery_available',
    descriptorDiscovery?.summary?.live_discovery_available ?? [],
  );
  const liveDiscoveryAvailable = new Set(descriptorDiscovery?.summary?.live_discovery_available ?? []);
  for (const service of descriptorDiscovery?.services ?? []) {
    const serviceId = service.id ?? service.service_id ?? service.service;
    if (serviceId && liveDiscoveryAvailable.has(serviceId)) {
      addFromArtifact(descriptorDiscovery, 'descriptor_discovery.services', [serviceId]);
    }
  }
  return {
    services: new Set([...names].sort()),
    stale_live_services: dedupeStaleLiveServices(staleLiveServices),
  };
}

function artifactFreshForHierarchical(sourceGeneratedAt, hierarchicalGeneratedAt) {
  if (!sourceGeneratedAt || !hierarchicalGeneratedAt) return true;
  const sourceTime = Date.parse(sourceGeneratedAt);
  const hierarchicalTime = Date.parse(hierarchicalGeneratedAt);
  if (!Number.isFinite(sourceTime) || !Number.isFinite(hierarchicalTime)) return true;
  return sourceTime + sameBatchEvidenceWindowMs >= hierarchicalTime;
}

function dedupeStaleLiveServices(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = `${item.service}:${item.source}:${item.source_generated_at}:${item.hierarchical_generated_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function sumObjectValues(source) {
  return Object.values(source ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0);
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    target[key] = (target[key] ?? 0) + Number(value ?? 0);
  }
}

function sumBy(items, valueFn) {
  return items.reduce((sum, item) => sum + Number(valueFn(item) ?? 0), 0);
}

function releaseNextActions({ hierarchicalDecision, representativeDecision, allToolsDecision }) {
  const actions = [];
  if (hierarchicalDecision !== 'go') {
    actions.push('Restore hierarchical MCP facade meta-tools and representative tools_dispatch probes, regenerate hierarchical-tools-evidence.json, then rebuild release evidence.');
  }
  if (representativeDecision !== 'go' && hierarchicalDecision === 'go') {
    actions.push('Regenerate the representative virtual-desktop evidence artifacts listed in the blockers, then rebuild release evidence.');
  }
  if (allToolsDecision !== 'go') {
    actions.push('Close the exhaustive all-tools release policy blockers, then rerun the all-tools evidence builders and release aggregation.');
  }
  return actions;
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
  lines.push(`- Glasses handoff: ${report.glasses_handoff.status}; passed ${report.glasses_handoff.passed_count ?? 'unknown'} / ${report.glasses_handoff.displayable_count ?? 'unknown'} displayable apps`);
  lines.push(`- Service availability: ${(report.service_health.available ?? []).length} available, ${(report.service_health.unavailable ?? []).length} unavailable`);
  lines.push(`- Hierarchical MCP: ${report.hierarchical_mcp.release_gate_decision ?? report.hierarchical_mcp.status}; facade ${report.hierarchical_mcp.services_with_full_facade ?? 'unknown'} / ${report.hierarchical_mcp.service_count ?? 'unknown'} services; dispatch ${report.hierarchical_mcp.dispatch_pass_count ?? 'unknown'} / ${report.hierarchical_mcp.dispatch_probe_count ?? 'unknown'} probes`);
  lines.push(`- All-tools fallback states: ${report.fallback_coverage.all_tools_app_family_states.fallback_state_family_count ?? 'unknown'} / ${report.fallback_coverage.all_tools_app_family_states.app_family_count ?? 'unknown'} app families`);
  lines.push(`- Legacy gateway fallback specs present: ${report.fallback_coverage.legacy_gateway_spec_count}`);
  lines.push(`- Live receipt samples: ${report.receipt_samples.live_receipt_samples.status}; count ${report.receipt_samples.live_receipt_samples.sample_count ?? 0}`);
  lines.push(`- Representative decision: ${report.representative_app_gate.decision}`);
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
    lines.push(`- Direct-only ${directOnly.service}: ${directOnly.descriptor_count} descriptors; sample ${directOnly.sample.slice(0, 6).join(', ') || 'none'}`);
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

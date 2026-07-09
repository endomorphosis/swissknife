#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const evidenceRootRelative = path.relative(projectRoot, evidenceRoot);

const artifactDefs = [
  ['app_inventory', 'app-inventory.json', true],
  ['manifest_drift', 'manifest-drift.json', true],
  ['app_launch', 'app-launch-report.json', true],
  ['capability_matrix', 'capability-matrix.json', false],
  ['descriptor_discovery', 'descriptor-discovery.json', true],
  ['service_health', 'service-health.json', true],
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
const serviceHealthSummary = normalizeServiceHealth(serviceHealth);
const descriptorDiscoverySummary = normalizeDescriptorDiscovery(descriptorDiscovery);

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
const allToolsBlockerTexts = dedupe(allToolsBlockers.map(blockerText));
const blockers = [...representativeBlockers.map(blockerText), ...allToolsBlockerTexts];
const decision = representativeDecision === 'go' && allToolsDecision === 'go' ? 'go' : 'no_go';
const nextActions = decision === 'go'
  ? []
  : [
      'Close the SVD-031 ipfs_accelerate_py adapter-required boundary or retarget SwissKnife to a full compatible accelerate MCP endpoint.',
      'Re-run SVD-036 release policy gates and this SVD-038 release evidence aggregation after the adapter boundary changes.',
    ];

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
        service_count: serviceHealthSummary.service_count,
        available: serviceHealthSummary.available,
        unavailable: serviceHealthSummary.unavailable,
        endpoint_failures: serviceHealthSummary.endpoint_failures,
        normalized_failure_count: serviceHealthSummary.normalized_failure_count,
      }
    : missingStatus(artifacts.service_health.path),
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
  all_tools_decision: allToolsDecision,
  output: path.relative(projectRoot, releaseJsonPath),
  supervisor_freshness_output: path.relative(projectRoot, supervisorFreshnessPath),
}, null, 2));

function normalizeServiceHealth(health) {
  const services = Array.isArray(health?.services) ? health.services : [];
  const configured = services.filter(service => service.role !== 'real_local');
  const available = health?.summary?.available
    ?? configured.filter(service => service.available).map(service => service.service);
  const unavailable = health?.summary?.unavailable
    ?? configured.filter(service => !service.available).map(service => service.service);
  const endpointFailures = health?.summary?.endpoint_failures
    ?? health?.summary?.normalized_failure_count
    ?? unavailable.length;

  return {
    service_count: services.length,
    available: Array.from(new Set(available)).sort(),
    unavailable: Array.from(new Set(unavailable)).sort(),
    endpoint_failures: endpointFailures,
    normalized_failure_count: health?.summary?.normalized_failure_count ?? endpointFailures,
  };
}

function normalizeDescriptorDiscovery(discovery) {
  const services = Array.isArray(discovery?.services) ? discovery.services : [];
  const configured = services.filter(service => service.role !== 'real_local');
  const liveFromSummary = discovery?.summary?.live_discovery_available;
  const fallbackFromSummary = discovery?.summary?.static_fallback_used;
  const toolCountsFromSummary = discovery?.summary?.tool_counts;
  const staticCounts = discovery?.static_descriptor_counts ?? {};

  const liveDiscoveryAvailable = Array.isArray(liveFromSummary)
    ? liveFromSummary
    : configured
      .filter(service => (service.tool_count ?? 0) > 0)
      .map(service => service.service);
  const staticFallbackUsed = Array.isArray(fallbackFromSummary)
    ? fallbackFromSummary
    : configured
      .filter(service => (service.tool_count ?? 0) === 0 && (staticCounts[service.service] ?? 0) > 0)
      .map(service => service.service);
  const toolCounts = toolCountsFromSummary && typeof toolCountsFromSummary === 'object'
    ? toolCountsFromSummary
    : Object.fromEntries(configured.map(service => [service.service, service.tool_count ?? 0]));

  return {
    live_discovery_available: Array.from(new Set(liveDiscoveryAvailable)).sort(),
    static_fallback_used: Array.from(new Set(staticFallbackUsed)).sort(),
    tool_counts: toolCounts,
    interface_counts: discovery?.summary?.interface_counts ?? {},
  };
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
  if (blocker.gate_id && blocker.reason) return `${blocker.gate_id}: ${blocker.reason}`;
  if (blocker.id && blocker.reason) return `${blocker.id}: ${blocker.reason}`;
  if (blocker.reason) return blocker.reason;
  return JSON.stringify(blocker);
}

function appVisibleBindingCount(appBindings) {
  if (Array.isArray(appBindings.rows)) {
    return appBindings.rows.filter(row => row.app_visible).length;
  }
  if (Array.isArray(appBindings.bindings)) {
    return appBindings.bindings
      .filter(row => row.exposure !== 'desktop_or_mobile_only')
      .length;
  }
  return null;
}

function readJsonAbsoluteIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileRevision(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return { status: 'missing', path: relativePath };
  }
  const stat = fs.statSync(filePath);
  return {
    status: 'present',
    path: relativePath,
    mtime: stat.mtime.toISOString(),
    size: stat.size,
  };
}

function adapterListener(port) {
  try {
    const output = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' });
    const line = output
      .split('\n')
      .find(candidate => candidate.includes(`127.0.0.1:${port}`) || candidate.includes(`0.0.0.0:${port}`));
    const pid = line?.match(/pid=(\d+)/)?.[1] ?? null;
    return {
      port,
      listening: Boolean(line),
      pid: pid ? Number(pid) : null,
      source: 'ss -ltnp',
      line: line ?? null,
    };
  } catch (error) {
    return {
      port,
      listening: false,
      pid: null,
      source: 'ss -ltnp',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildSupervisorReleaseFreshness(releaseReport) {
  const state = readJsonAbsoluteIfExists(path.join(
    workspaceRoot,
    'data/virtual_ai_os/state/swissknife_virtual_desktop_task_state.json',
  ));
  const queue = readJsonAbsoluteIfExists(path.join(
    workspaceRoot,
    'data/swissknife_virtual_desktop/all_tools_supervisor_queue.json',
  ));
  const freshness = readJsonAbsoluteIfExists(path.join(projectRoot, 'docs/release-evidence-freshness.json'));
  const appSmoke = readJsonAbsoluteIfExists(path.join(evidenceRoot, 'all-tools-app-smoke-coverage.json'));
  const routeCoverage = readJsonAbsoluteIfExists(path.join(evidenceRoot, 'all-tools-app-route-coverage.json'));
  const callEnvelopes = readJsonAbsoluteIfExists(path.join(evidenceRoot, 'all-tools-call-envelope-fixtures.json'));
  const freshnessResults = freshness?.results ?? [];

  return {
    schema: 'swissknife.all-tools-supervisor-release-freshness.v1',
    generated_at: generatedAt,
    supervisor: {
      id: queue?.supervisor?.id ?? 'ipfs_accelerate_py.agent_supervisor.swissknife_all_tools',
      active_task_id: state?.active_task_id ?? null,
      recommended_task_id: queue?.summary?.recommended_task_id ?? null,
      completed_count: queue?.summary?.completed_count ?? state?.completed_count ?? null,
      ready_task_ids: queue?.summary?.ready_task_ids ?? state?.ready_task_ids ?? [],
      waiting_task_ids: queue?.summary?.waiting_task_ids ?? state?.waiting_task_ids ?? [],
      blocked_task_ids: queue?.summary?.blocked_task_ids ?? state?.blocked_task_ids ?? [],
    },
    live_mcp_endpoints: (serviceHealth?.services ?? []).map(service => ({
      service: service.service,
      role: service.role,
      endpoint: service.endpoint,
      available: service.available,
      tool_count: service.tool_count,
    })),
    configured_accelerate_adapter: {
      endpoint: 'http://127.0.0.1:3003',
      listener: adapterListener(3003),
      coverage_decision: releaseReport.all_tools.adapter_boundary.status ?? null,
      missing_required_count: releaseReport.all_tools.adapter_boundary.summary?.missing_configured_required_count
        ?? releaseReport.all_tools.adapter_boundary.summary?.adapter_required_tool_count
        ?? releaseReport.all_tools.adapter_boundary.summary?.count
        ?? null,
    },
    evidence_timestamps: {
      release_evidence: releaseReport.generated_at,
      freshness_report: freshness?.generatedAt ?? null,
      app_smoke: appSmoke?.generated_at ?? null,
      route_coverage: routeCoverage?.generated_at ?? null,
      call_envelopes: callEnvelopes?.generated_at ?? null,
      all_tools_ledger: allToolsLedger?.generated_at ?? null,
      service_health: serviceHealth?.generated_at ?? null,
      capability_matrix: data.capability_matrix?.generated_at ?? null,
    },
    stale_evidence_policy: {
      mode: 'fingerprint',
      stale_statuses: ['missing-evidence', 'never-certified', 'stale'],
      failure_behavior: 'force_no_go',
      freshness_gate_passed: freshnessResults.every(result => result.status === 'fresh'),
      results: freshnessResults.map(result => ({
        id: result.id,
        status: result.status,
        recordedAt: result.recordedAt,
        regenerateHint: result.regenerateHint,
      })),
    },
    manifest_and_tool_drift: {
      manifest_status: report.manifest.status,
      manifest_app_count: report.manifest.app_count,
      browser_compatibility_inventory: fileRevision('docs/browser-compatibility-inventory.md'),
      tool_record_count: report.all_tools.ledger.exact_tool_record_count,
      app_routable_tool_count: routeCoverage?.app_routable_tool_count ?? appSmoke?.app_routable_tool_count ?? null,
      call_envelope_count: callEnvelopes?.envelope_count ?? appSmoke?.call_envelope_count ?? null,
      drift: report.all_tools.ledger.drift,
    },
    release_gate: {
      decision: releaseReport.go_no_go.decision,
      representative_decision: releaseReport.go_no_go.representative_decision,
      all_tools_decision: releaseReport.go_no_go.all_tools_decision,
      blocker_count: releaseReport.go_no_go.blocker_count,
      blockers: releaseReport.go_no_go.blockers,
      validation: 'node scripts/audit-release-evidence-freshness.mjs && node scripts/build-virtual-desktop-release-evidence.cjs',
    },
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
  lines.push(`- Glasses handoff: ${report.glasses_handoff.status}; passed ${report.glasses_handoff.passed_count ?? 'unknown'} / ${report.glasses_handoff.displayable_count ?? 'unknown'} displayable apps`);
  lines.push(`- Service availability: ${(report.service_health.available ?? []).length} available, ${(report.service_health.unavailable ?? []).length} unavailable`);
  lines.push(`- All-tools fallback states: ${report.fallback_coverage.all_tools_app_family_states.fallback_state_family_count ?? 'unknown'} / ${report.fallback_coverage.all_tools_app_family_states.app_family_count ?? 'unknown'} app families`);
  lines.push(`- Legacy gateway fallback specs present: ${report.fallback_coverage.legacy_gateway_spec_count}`);
  lines.push(`- Live receipt samples: ${report.receipt_samples.live_receipt_samples.status}; count ${report.receipt_samples.live_receipt_samples.sample_count ?? 0}`);
  lines.push(`- Representative decision: ${report.representative_app_gate.decision}`);
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

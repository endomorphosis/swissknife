#!/usr/bin/env node

<<<<<<< HEAD
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const evidenceRoot = path.join(root, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const jsonOutputPath = path.join(evidenceRoot, 'release-evidence.json');
const markdownOutputPath = path.join(evidenceRoot, 'release-evidence.md');

const ARTIFACTS = {
  app_inventory: 'app-inventory.json',
  manifest_drift: 'manifest-drift.json',
  app_launch: 'app-launch-report.json',
  capability_matrix: 'capability-matrix.json',
  descriptor_discovery: 'descriptor-discovery.json',
  service_health: 'service-health.json',
  glasses_handoff: 'glasses-handoff-report.json',
  live_critical_flows: 'live-critical-flows.json',
  receipt_samples: 'receipt-samples.json',
};

main();

function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const artifacts = Object.fromEntries(
    Object.entries(ARTIFACTS).map(([key, filename]) => [key, readArtifact(filename)]),
  );
  const manifest = loadManifest();
  const fallbackCoverage = summarizeFallbackCoverage(artifacts);
  const report = {
    schema: 'swissknife.virtual-desktop-release-evidence.v1',
    generated_at: new Date().toISOString(),
    evidence_root: path.relative(root, evidenceRoot),
    manifest: summarizeManifest(manifest),
    artifacts: summarizeArtifacts(artifacts),
    app_inventory: summarizeAppInventory(manifest, artifacts.app_inventory),
    launch_status: summarizeLaunchStatus(artifacts.app_launch),
    screenshot_coverage: summarizeScreenshotCoverage(artifacts.app_launch, artifacts.glasses_handoff),
    capability_matrix: summarizeCapabilityMatrix(artifacts.capability_matrix),
    descriptor_validation: summarizeDescriptorDiscovery(artifacts.descriptor_discovery, artifacts.manifest_drift),
    service_health: summarizeServiceHealth(artifacts.service_health),
    glasses_handoff: summarizeGlassesHandoff(artifacts.glasses_handoff),
    fallback_coverage: fallbackCoverage,
    receipt_samples: summarizeReceiptSamples(artifacts.receipt_samples, artifacts.glasses_handoff),
    go_no_go: buildDecision({ artifacts, manifest, fallbackCoverage }),
  };

  fs.writeFileSync(jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownOutputPath, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    release_evidence_path: path.relative(root, jsonOutputPath),
    release_evidence_markdown_path: path.relative(root, markdownOutputPath),
    decision: report.go_no_go.decision,
    blocker_count: report.go_no_go.blockers.length,
    warning_count: report.go_no_go.warnings.length,
  }, null, 2));
}

function readArtifact(filename) {
  const absolutePath = path.join(evidenceRoot, filename);
  const relPath = path.relative(root, absolutePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      status: 'missing',
      path: relPath,
      error: 'artifact does not exist',
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return {
      status: 'present',
      path: relPath,
      generated_at: parsed.generated_at,
      schema: parsed.schema,
      data: parsed,
    };
  } catch (error) {
    return {
      status: 'invalid',
      path: relPath,
      error: error instanceof Error ? error.message : String(error),
=======
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
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
const failedGates = (allToolsReleaseGate?.gates ?? []).filter(gate => gate.status === 'fail');
const adapterBoundaryGate = (allToolsReleaseGate?.gates ?? [])
  .find(gate => gate.gate_id === 'accelerate_adapter_boundary');

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
const blockers = [...representativeBlockers, ...dedupe(allToolsBlockers)];
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
          exact_tool_record_count: allToolsLedger.summary?.exact_tool_record_count ?? allToolsLedger.tools?.length ?? null,
          live_exact_tool_count: allToolsLedger.summary?.live_exact_tool_count ?? null,
          static_exact_tool_count: allToolsLedger.summary?.static_exact_tool_count ?? null,
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
          tool_count: allToolsPolicyMatrix.tool_count,
          class_counts: allToolsPolicyMatrix.class_counts ?? {},
          owner_counts: allToolsPolicyMatrix.owner_counts ?? {},
          exposure_counts: allToolsPolicyMatrix.exposure_counts ?? {},
        }
      : missingStatus(artifacts.all_tools_policy_matrix.path),
    app_bindings: allToolsAppBindings
      ? {
          status: 'present',
          path: artifacts.all_tools_app_bindings.path,
          tool_count: allToolsAppBindings.tool_count,
          app_visible_tool_count: (allToolsAppBindings.rows ?? []).filter(row => row.app_visible).length,
          disposition_counts: allToolsAppBindings.disposition_counts ?? {},
          app_counts: allToolsAppBindings.app_counts ?? {},
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
          fixture_count: allToolsExecutionReport.fixture_count,
          app_routable_fixture_count: allToolsExecutionReport.app_routable_fixture_count,
          denied_fixture_count: allToolsExecutionReport.denied_fixture_count,
          side_effect_receipt_fixture_count: allToolsExecutionReport.side_effect_receipt_fixture_count,
        }
      : missingStatus(artifacts.all_tools_execution_report.path),
    orb_idl: allToolsIdlCoverage
      ? {
          status: 'present',
          path: artifacts.all_tools_idl_coverage.path,
          descriptor_count: allToolsIdlCoverage.descriptor_count,
          method_count: allToolsIdlCoverage.method_count,
          app_routable_tool_count: allToolsIdlCoverage.app_routable_tool_count,
          app_routable_tool_coverage_count: allToolsIdlCoverage.app_routable_tool_coverage_count,
          workflow_count: allToolsIdlCoverage.workflow_count,
          workflow_coverage_count: allToolsIdlCoverage.workflow_coverage_count,
          interface_cid_count: allToolsIdlCoverage.interface_cid_count,
          adapter_required_method_count: allToolsIdlCoverage.adapter_required_method_count,
        }
      : missingStatus(artifacts.all_tools_idl_coverage.path),
    glasses_projection: allToolsGlassesCoverage
      ? {
          status: 'present',
          path: artifacts.all_tools_glasses_coverage.path,
          projection_count: allToolsGlassesCoverage.projection_count,
          displayable_projection_count: allToolsGlassesCoverage.displayable_projection_count,
          hardware_free_replay_state_count: allToolsGlassesCoverage.hardware_free_replay_state_count,
          adapter_required_projection_count: allToolsGlassesCoverage.adapter_required_projection_count,
          behavior_counts: allToolsGlassesCoverage.behavior_counts ?? {},
        }
      : missingStatus(artifacts.all_tools_glasses_coverage.path),
    release_policy_gate: allToolsReleaseGate
      ? {
          status: 'present',
          path: artifacts.all_tools_policy_release_gate.path,
          decision: allToolsReleaseGate.decision,
          gate_count: allToolsReleaseGate.gate_count,
          pass_count: allToolsReleaseGate.pass_count,
          fail_count: allToolsReleaseGate.fail_count,
          warn_count: allToolsReleaseGate.warn_count,
          blocker_count: allToolsReleaseGate.blocker_count,
          failed_gates: failedGates.map(gate => ({
            gate_id: gate.gate_id,
            summary: gate.summary,
            blockers: gate.blockers ?? [],
          })),
        }
      : missingStatus(artifacts.all_tools_policy_release_gate.path),
    adapter_boundary: adapterBoundaryGate
      ? {
          status: adapterBoundaryGate.status,
          summary: adapterBoundaryGate.summary,
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
const markdown = renderMarkdown(report);

fs.mkdirSync(evidenceRoot, { recursive: true });
fs.writeFileSync(releaseJsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(releaseMarkdownPath, markdown);
fs.writeFileSync(allToolsMarkdownPath, markdown);

console.log(JSON.stringify({
  decision,
  blocker_count: report.go_no_go.blocker_count,
  warning_count: report.go_no_go.warning_count,
  all_tools_decision: allToolsDecision,
  output: path.relative(projectRoot, releaseJsonPath),
}, null, 2));

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
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
    };
  }
}

<<<<<<< HEAD
function loadManifest() {
  try {
    require('tsx/cjs');
    const { VIRTUAL_DESKTOP_APP_MANIFEST } = require('../src/services/apps/virtual-desktop-app-manifest.ts');
    return {
      status: 'present',
      data: VIRTUAL_DESKTOP_APP_MANIFEST,
    };
  } catch (error) {
    return {
      status: 'invalid',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeManifest(manifest) {
  if (manifest.status !== 'present') {
    return {
      status: manifest.status,
      error: manifest.error,
    };
  }

  const apps = manifest.data.apps || [];
  return {
    status: 'present',
    manifest_id: manifest.data.manifest_id,
    version: manifest.data.version,
    app_count: apps.length,
    categories: countBy(apps, app => app.category || 'unknown'),
    launch_kinds: countBy(apps, app => app.launch_kind || 'unknown'),
  };
}

function summarizeArtifacts(artifacts) {
  return Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [
    key,
    {
      status: artifact.status,
      path: artifact.path,
      ...(artifact.schema ? { schema: artifact.schema } : {}),
      ...(artifact.generated_at ? { generated_at: artifact.generated_at } : {}),
      ...(artifact.error ? { error: artifact.error } : {}),
    },
  ]));
}

function summarizeAppInventory(manifest, artifact) {
  return {
    manifest_app_count: manifest.status === 'present' ? manifest.data.apps.length : null,
    inventory_artifact_status: artifact.status,
    inventory_app_count: artifact.data?.app_count ?? artifact.data?.summary?.app_count ?? null,
    inventory_path: artifact.path,
  };
}

function summarizeLaunchStatus(artifact) {
  const report = artifact.data;
  if (!report) {
    return {
      status: artifact.status,
      path: artifact.path,
      error: artifact.error,
    };
  }

  const results = report.results || [];
  return {
    status: artifact.status,
    path: artifact.path,
    generated_at: report.generated_at,
    app_count: report.app_count ?? results.length,
    opened: report.summary?.opened ?? results.filter(result => result.opened).length,
    classifications: report.summary?.statuses ?? countBy(results, result => result.status || 'unknown'),
    broken_apps: results.filter(result => result.status === 'broken').map(result => result.app_id),
    placeholder_apps: results.filter(result => result.status === 'placeholder').map(result => result.app_id),
  };
}

function summarizeScreenshotCoverage(appLaunchArtifact, glassesArtifact) {
  const appLaunch = appLaunchArtifact.data;
  const glasses = glassesArtifact.data;
  const appScreenshotDir = appLaunch?.screenshot_dir
    ? path.join(root, appLaunch.screenshot_dir)
    : path.join(evidenceRoot, 'app-screenshots');
  const glassesScreenshotDir = glasses?.screenshot_root
    ? path.resolve(glasses.screenshot_root)
    : path.join(evidenceRoot, 'glasses-screenshots');

  return {
    app_screenshots: {
      status: appLaunchArtifact.status,
      directory: path.relative(root, appScreenshotDir),
      count: countFiles(appScreenshotDir, file => /\.(png|jpe?g)$/i.test(file)),
      expected: appLaunch?.app_count ? appLaunch.app_count + 1 : null,
    },
    glasses_screenshots: {
      status: glassesArtifact.status,
      directory: path.relative(root, glassesScreenshotDir),
      count: countFiles(glassesScreenshotDir, file => /\.(png|jpe?g)$/i.test(file)),
      expected: glasses?.displayable_count ? glasses.displayable_count * 2 : null,
    },
  };
}

function summarizeCapabilityMatrix(artifact) {
  const matrix = artifact.data;
  if (!matrix) {
    return {
      status: artifact.status,
      path: artifact.path,
      error: artifact.error,
    };
  }

  return {
    status: artifact.status,
    path: artifact.path,
    registry_id: matrix.registry_id,
    version: matrix.version,
    family_count: (matrix.families || []).length,
    families: matrix.families || [],
    capability_count: Array.isArray(matrix.matrix)
      ? matrix.matrix.length
      : Object.keys(matrix.matrix || {}).length,
  };
}

function summarizeDescriptorDiscovery(descriptorArtifact, manifestDriftArtifact) {
  return {
    descriptor_discovery: descriptorArtifact.data ? {
      status: descriptorArtifact.status,
      path: descriptorArtifact.path,
      generated_at: descriptorArtifact.data.generated_at,
      live_discovery_available: descriptorArtifact.data.summary?.live_discovery_available || [],
      static_fallback_used: descriptorArtifact.data.summary?.static_fallback_used || [],
      tool_counts: descriptorArtifact.data.summary?.tool_counts || {},
      interface_counts: descriptorArtifact.data.summary?.interface_counts || {},
    } : {
      status: descriptorArtifact.status,
      path: descriptorArtifact.path,
      error: descriptorArtifact.error,
    },
    manifest_drift: manifestDriftArtifact.data ? {
      status: manifestDriftArtifact.status,
      path: manifestDriftArtifact.path,
      generated_at: manifestDriftArtifact.data.generated_at,
      valid: manifestDriftArtifact.data.valid,
      error_count: (manifestDriftArtifact.data.errors || []).length,
      warning_count: (manifestDriftArtifact.data.warnings || []).length,
    } : {
      status: manifestDriftArtifact.status,
      path: manifestDriftArtifact.path,
      error: manifestDriftArtifact.error,
    },
  };
}

function summarizeServiceHealth(artifact) {
  const health = artifact.data;
  if (!health) {
    return {
      status: artifact.status,
      path: artifact.path,
      error: artifact.error,
    };
  }

  return {
    status: artifact.status,
    path: artifact.path,
    generated_at: health.generated_at,
    service_count: (health.services || []).length,
    available: health.summary?.available || [],
    unavailable: health.summary?.unavailable || [],
    endpoint_failures: health.summary?.endpoint_failures ?? null,
    normalized_failure_count: (health.services || []).reduce(
      (sum, service) => sum + (service.normalized_failures || []).length,
      0,
    ),
  };
}

function summarizeGlassesHandoff(artifact) {
  const report = artifact.data;
  if (!report) {
    return {
      status: artifact.status,
      path: artifact.path,
      error: artifact.error,
    };
  }

  return {
    status: artifact.status,
    path: artifact.path,
    generated_at: report.generated_at,
    app_count: report.app_count,
    displayable_count: report.displayable_count,
    passed_count: report.passed_count,
    hardware_free: report.hardware_free,
    fallback_targets: countBy(report.results || [], result => result.fallback_target || 'unknown'),
    receipt_count: (report.results || []).filter(result => result.receipt_cid).length,
  };
}

function summarizeFallbackCoverage(artifacts) {
  const gatewaySpecs = [
    'test/e2e/storage-provenance-apps.spec.ts',
    'test/e2e/accelerate-datasets-apps.spec.ts',
    'test/e2e/media-artifact-apps.spec.ts',
    'test/e2e/system-network-local-apps.spec.ts',
    'test/e2e/mcp-orb-descriptor-apps.spec.ts',
  ].map(relPath => ({
    path: relPath,
    present: fs.existsSync(path.join(root, relPath)),
  }));
  const glasses = artifacts.glasses_handoff.data;

  return {
    gateway_fallback_specs: gatewaySpecs,
    gateway_spec_count: gatewaySpecs.filter(spec => spec.present).length,
    glasses_fallbacks: glasses ? {
      status: artifacts.glasses_handoff.status,
      displayable_count: glasses.displayable_count,
      fallback_count: (glasses.results || []).filter(result => result.fallback_target).length,
      fallback_targets: countBy(glasses.results || [], result => result.fallback_target || 'unknown'),
    } : {
      status: artifacts.glasses_handoff.status,
      error: artifacts.glasses_handoff.error,
    },
  };
}

function summarizeReceiptSamples(receiptArtifact, glassesArtifact) {
  const liveSamples = receiptArtifact.data;
  const glassesReport = glassesArtifact.data;
  const glassesSamples = (glassesReport?.results || [])
    .filter(result => result.receipt_cid)
    .slice(0, 10)
    .map(result => ({
      source: 'glasses_handoff',
      app_id: result.app_id,
      receipt_cid: result.receipt_cid,
    }));

  return {
    live_receipt_samples: liveSamples ? {
      status: receiptArtifact.status,
      path: receiptArtifact.path,
      sample_count: Array.isArray(liveSamples.samples)
        ? liveSamples.samples.length
        : Array.isArray(liveSamples.receipts)
          ? liveSamples.receipts.length
          : 0,
    } : {
      status: receiptArtifact.status,
      path: receiptArtifact.path,
      error: receiptArtifact.error,
    },
    non_live_receipt_samples: glassesSamples,
  };
}

function buildDecision({ artifacts, manifest, fallbackCoverage }) {
  const blockers = [];
  const warnings = [];

  if (manifest.status !== 'present') blockers.push(`Manifest could not be loaded: ${manifest.error}`);
  if (artifacts.manifest_drift.status !== 'present') blockers.push(`Manifest drift evidence missing or invalid: ${artifacts.manifest_drift.error || artifacts.manifest_drift.path}`);
  if (artifacts.app_launch.status !== 'present') blockers.push(`App launch evidence missing or invalid: ${artifacts.app_launch.error || artifacts.app_launch.path}`);
  if (artifacts.service_health.status !== 'present') blockers.push(`Service health evidence missing or invalid: ${artifacts.service_health.error || artifacts.service_health.path}`);
  if (artifacts.live_critical_flows.status !== 'present') blockers.push(`Live critical-path flow evidence missing or invalid: ${artifacts.live_critical_flows.error || artifacts.live_critical_flows.path}`);
  if (artifacts.receipt_samples.status !== 'present') blockers.push(`Live receipt samples missing or invalid: ${artifacts.receipt_samples.error || artifacts.receipt_samples.path}`);

  const serviceHealth = artifacts.service_health.data;
  const unavailable = serviceHealth?.summary?.unavailable || [];
  if (unavailable.length > 0) blockers.push(`Configured MCP services unavailable: ${unavailable.join(', ')}`);

  const descriptorDiscovery = artifacts.descriptor_discovery.data;
  const staticFallback = descriptorDiscovery?.summary?.static_fallback_used || [];
  if (staticFallback.length > 0) warnings.push(`Descriptor discovery used static fallback for: ${staticFallback.join(', ')}`);

  const appLaunch = artifacts.app_launch.data;
  const brokenApps = (appLaunch?.results || []).filter(result => result.status === 'broken').map(result => result.app_id);
  if (brokenApps.length > 0) blockers.push(`Broken app launch classifications: ${brokenApps.join(', ')}`);

  const missingGatewaySpecs = fallbackCoverage.gateway_fallback_specs.filter(spec => !spec.present);
  if (missingGatewaySpecs.length > 0) warnings.push(`Gateway fallback specs missing: ${missingGatewaySpecs.map(spec => spec.path).join(', ')}`);

  return {
    decision: blockers.length > 0 ? 'no_go' : 'go',
    blockers,
    warnings,
    next_actions: blockers.length > 0 ? buildNextActions({ artifacts, unavailable, brokenApps }) : [],
  };
}

function buildNextActions({ artifacts, unavailable, brokenApps }) {
  const actions = [];
  if (unavailable.length > 0) {
    actions.push('Start or retarget configured ipfs_kit_py, ipfs_datasets_py, and ipfs_accelerate_py MCP services.');
  }
  if (artifacts.live_critical_flows.status !== 'present' || artifacts.receipt_samples.status !== 'present') {
    actions.push('Run SVD-019 live critical-path flows and generate live-critical-flows.json plus receipt-samples.json.');
  }
  if (artifacts.manifest_drift.status !== 'present') {
    actions.push('Resolve TypeScript module path regressions and regenerate manifest-drift.json.');
  }
  if (artifacts.app_launch.status !== 'present') {
    actions.push('Regenerate app-launch-report.json and app screenshots.');
  }
  if (brokenApps.length > 0) {
    actions.push(`Investigate broken app launch classifications: ${brokenApps.join(', ')}.`);
  }
  actions.push('Re-run this release evidence aggregator.');
  return actions;
=======
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
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

function renderMarkdown(report) {
  const lines = [];
<<<<<<< HEAD
  lines.push('# SwissKnife Virtual Desktop Release Evidence');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Decision: **${report.go_no_go.decision.toUpperCase()}**`);
  lines.push('');

=======
  lines.push('# SwissKnife Virtual Desktop All-Tools Release Evidence');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Decision: **${report.go_no_go.decision.toUpperCase().replace('_', '-')}**`);
  lines.push('');
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  lines.push('## Blockers');
  if (report.go_no_go.blockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of report.go_no_go.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('');
<<<<<<< HEAD

  lines.push('## Summary');
  lines.push(`- Manifest apps: ${report.manifest.app_count ?? 'unknown'}`);
  lines.push(`- Launch evidence: ${statusText(report.launch_status.status)}; opened ${report.launch_status.opened ?? 'unknown'} / ${report.launch_status.app_count ?? 'unknown'}`);
  lines.push(`- App screenshots: ${report.screenshot_coverage.app_screenshots.count} / ${report.screenshot_coverage.app_screenshots.expected ?? 'unknown'}`);
  lines.push(`- Glasses handoff: ${statusText(report.glasses_handoff.status)}; passed ${report.glasses_handoff.passed_count ?? 'unknown'} / ${report.glasses_handoff.displayable_count ?? 'unknown'} displayable apps`);
  lines.push(`- Capability rows: ${report.capability_matrix.capability_count ?? 'unknown'}`);
  lines.push(`- Service availability: ${(report.service_health.available || []).length} available, ${(report.service_health.unavailable || []).length} unavailable`);
  lines.push(`- Gateway fallback specs present: ${report.fallback_coverage.gateway_spec_count}`);
  lines.push(`- Live receipt samples: ${statusText(report.receipt_samples.live_receipt_samples.status)}`);
  lines.push('');

  lines.push('## Artifacts');
  for (const [name, artifact] of Object.entries(report.artifacts)) {
    lines.push(`- ${name}: ${statusText(artifact.status)} (${artifact.path})`);
  }
  lines.push('');

=======
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
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  lines.push('## Next Actions');
  if (report.go_no_go.next_actions.length === 0) {
    lines.push('- None');
  } else {
    for (const action of report.go_no_go.next_actions) lines.push(`- ${action}`);
  }
<<<<<<< HEAD

  return lines.join('\n');
}

function statusText(status) {
  return status || 'unknown';
}

function countBy(values, selector) {
  return values.reduce((counts, value) => {
    const key = selector(value);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function countFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath, predicate);
    } else if (predicate(fullPath)) {
      count += 1;
    }
  }
  return count;
=======
  lines.push('');
  return `${lines.join('\n')}\n`;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

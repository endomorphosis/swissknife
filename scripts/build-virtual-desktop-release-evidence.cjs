#!/usr/bin/env node

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
    };
  }
}

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
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# SwissKnife Virtual Desktop Release Evidence');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Decision: **${report.go_no_go.decision.toUpperCase()}**`);
  lines.push('');

  lines.push('## Blockers');
  if (report.go_no_go.blockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of report.go_no_go.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('');

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

  lines.push('## Next Actions');
  if (report.go_no_go.next_actions.length === 0) {
    lines.push('- None');
  } else {
    for (const action of report.go_no_go.next_actions) lines.push(`- ${action}`);
  }

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
}

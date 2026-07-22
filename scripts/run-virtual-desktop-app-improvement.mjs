#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rawRunnerArgs = process.argv.slice(2);
const validateOnly = rawRunnerArgs.includes('--validate-only');
const runnerArgs = rawRunnerArgs.filter(arg => arg !== '--validate-only');
const canonicalManifest = loadCanonicalManifest();
const { scope, playwrightArgs, expectedAppIds, viewportMatrix, requireLiveReceipts } = parseArgs(runnerArgs, canonicalManifest);
const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'app-improvement');
const reportRelativePath = resolveReportRelativePath(scope);
const reportPath = join(evidenceRoot, reportRelativePath);
const uiUxAccessibilityReportPath = join(evidenceRoot, 'ui-ux-accessibility.json');
const screenshotIndexPath = join(evidenceRoot, 'screenshot-index.json');

if (validateOnly) {
  if (playwrightArgs.length > 0) {
    console.error(`--validate-only does not accept Playwright arguments: ${playwrightArgs.join(' ')}`);
    process.exit(1);
  }
  validateReport(reportPath, scope, canonicalManifest, expectedAppIds);
  if (viewportMatrix) validateUiUxAccessibilityGate(uiUxAccessibilityReportPath, screenshotIndexPath, canonicalManifest, expectedAppIds);
  if (requireLiveReceipts) runLiveReceiptGate(true);
  process.exit(0);
}

const command = [
  'scripts/run-with-owned-port.mjs',
  '--env-var',
  'SWISSKNIFE_APP_IMPROVEMENT_E2E_PORT',
  '--preferred',
  process.env.SWISSKNIFE_APP_IMPROVEMENT_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '3001',
  '--',
  process.execPath,
  'scripts/run_playwright_test.mjs',
  'test',
  '-c',
  'build-tools/configs/playwright.app-improvement.config.ts',
  'test/e2e/virtual-desktop-all-app-improvement.spec.ts',
  '--reporter=line',
  ...playwrightArgs,
];

const result = spawnSync(process.execPath, command, {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    SVD_APP_IMPROVEMENT_SCOPE: scope,
    SVD_APP_IMPROVEMENT_EXPECTED_APP_IDS: expectedAppIds.join(','),
    SVD_APP_IMPROVEMENT_REPORT_PATH: reportRelativePath,
    SVD_APP_IMPROVEMENT_VIEWPORT_MATRIX: viewportMatrix ? '1' : '0',
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

validateReport(reportPath, scope, canonicalManifest, expectedAppIds);
if (viewportMatrix) validateUiUxAccessibilityGate(uiUxAccessibilityReportPath, screenshotIndexPath, canonicalManifest, expectedAppIds);
if (requireLiveReceipts) runLiveReceiptGate(false);
process.exit(0);

function loadCanonicalManifest() {
  const probe = `
    import { VIRTUAL_DESKTOP_APP_MANIFEST } from './src/services/apps/virtual-desktop-app-manifest.ts';
    process.stdout.write(JSON.stringify({
      manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
      version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
      apps: VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => ({
        id: app.id,
        canonical_id: app.canonical_id,
        aliases: [...app.aliases],
        title: app.title,
      })),
    }));
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) {
    console.error(`Unable to load canonical app manifest: ${result.error.message}`);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    console.error(`Unable to load canonical app manifest from src/services/apps/virtual-desktop-app-manifest.ts.`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }

  let manifest;
  try {
    manifest = JSON.parse(result.stdout);
  } catch (error) {
    console.error(`Unable to parse canonical app manifest: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const appIds = Array.isArray(manifest.apps) ? manifest.apps.map(app => app.id) : [];
  const uniqueIds = new Set(appIds);
  if (appIds.length !== 45 || uniqueIds.size !== appIds.length || appIds.some(appId => typeof appId !== 'string' || !appId)) {
    console.error(`Canonical manifest must contain exactly 45 unique app ids; got ${appIds.length} entries and ${uniqueIds.size} unique ids.`);
    process.exit(1);
  }
  if (manifest.apps.some(app => app.canonical_id !== app.id)) {
    console.error('Canonical manifest contains an app whose canonical_id differs from id; app-improvement evidence must use canonical desktop ids only.');
    process.exit(1);
  }

  return manifest;
}

function parseArgs(args, manifest) {
  const apps = [];
  const playwrightArgs = [];
  let all = false;
  let viewportMatrix = false;
  let requireLiveReceipts = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--all') {
      all = true;
    } else if (token === '--viewport-matrix') {
      viewportMatrix = true;
    } else if (token === '--require-live-receipts') {
      requireLiveReceipts = true;
    } else if (token === '--app') {
      const appId = args[index + 1];
      if (!appId || appId.startsWith('--')) {
        console.error('--app requires a canonical app id.');
        process.exit(1);
      }
      apps.push(appId);
      index += 1;
    } else if (token.startsWith('--app=')) {
      const appId = token.slice('--app='.length).trim();
      if (!appId) {
        console.error('--app requires a canonical app id.');
        process.exit(1);
      }
      apps.push(appId);
    } else {
      playwrightArgs.push(token);
    }
  }

  if (all && apps.length > 0) {
    console.error('Use either --all or one or more --app <id> selectors, not both.');
    process.exit(1);
  }

  const canonicalIds = manifest.apps.map(app => app.id);
  const aliases = new Map();
  for (const app of manifest.apps) {
    for (const alias of app.aliases ?? []) aliases.set(alias, app.id);
  }
  const requestedIds = all || apps.length === 0 ? canonicalIds : apps;
  if (requireLiveReceipts && !(all || apps.length === 0)) {
    console.error('--require-live-receipts is an all-app release gate; use it with --all.');
    process.exit(1);
  }
  const unknown = requestedIds.filter(appId => !canonicalIds.includes(appId));
  if (unknown.length > 0) {
    const aliasHints = unknown
      .filter(appId => aliases.has(appId))
      .map(appId => `${appId} is an alias for ${aliases.get(appId)}`);
    console.error(`Unknown canonical manifest app id(s): ${unknown.join(', ')}.`);
    if (aliasHints.length > 0) {
      console.error(`Aliases are intentionally rejected by SVD-133: ${aliasHints.join('; ')}.`);
    }
    process.exit(1);
  }

  const duplicate = requestedIds.filter((appId, index) => requestedIds.indexOf(appId) !== index);
  if (duplicate.length > 0) {
    console.error(`Duplicate --app selector(s): ${[...new Set(duplicate)].join(', ')}`);
    process.exit(1);
  }

  return {
    scope: all || apps.length === 0 ? 'all' : apps.join(','),
    playwrightArgs,
    expectedAppIds: requestedIds,
    viewportMatrix,
    requireLiveReceipts,
  };
}

function runLiveReceiptGate(validateOnly) {
  const args = [
    '--import',
    'tsx',
    'scripts/build-all-app-tool-matrix.ts',
    ...(validateOnly ? ['--validate-only'] : []),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`Unable to run SVD-181 live receipt gate: ${result.error.message}`);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function resolveReportRelativePath(scope) {
  if (scope === 'all') return 'index.json';
  const selectedApps = scope
    .split(',')
    .map(appId => safeFileName(appId))
    .filter(Boolean);
  return join('runs', `${selectedApps.join('--')}.json`);
}

function validateReport(path, expectedScope, manifest, expectedAppIds) {
  if (!existsSync(path)) {
    console.error(`App-improvement runner completed without writing ${path}.`);
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Unable to parse app-improvement report ${path}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const manifestAppIds = manifest.apps.map(app => app.id);
  const selectedCount = expectedAppIds.length;
  const problems = [];

  if (report.schema !== 'swissknife.virtual-desktop-all-app-improvement.v1') {
    problems.push(`unexpected schema ${JSON.stringify(report.schema)}`);
  }
  if (report.task_id !== 'SVD-133') {
    problems.push(`unexpected task_id ${JSON.stringify(report.task_id)}`);
  }
  if (report.scope !== expectedScope) {
    problems.push(`expected scope ${expectedScope}, got ${JSON.stringify(report.scope)}`);
  }
  if (report.manifest_id !== manifest.manifest_id || report.manifest_version !== manifest.version) {
    problems.push(`report manifest ${report.manifest_id}@${report.manifest_version} does not match canonical manifest ${manifest.manifest_id}@${manifest.version}`);
  }
  if (report.manifest_app_count !== 45) {
    problems.push(`expected manifest_app_count 45, got ${report.manifest_app_count}`);
  }
  if (!sameArray(report.manifest_app_ids, manifestAppIds)) {
    problems.push('report manifest_app_ids do not exactly match canonical manifest order');
  }
  if (!sameArray(report.selected_app_ids, expectedAppIds)) {
    problems.push('report selected_app_ids do not exactly match requested canonical app order');
  }
  if (report.selected_app_count !== selectedCount || !Array.isArray(report.apps) || report.apps.length !== selectedCount) {
    problems.push(`expected ${selectedCount} selected app records, got selected_app_count=${report.selected_app_count} apps=${Array.isArray(report.apps) ? report.apps.length : 'not-array'}`);
  }
  if (report.summary?.failed !== 0 || report.summary?.passed !== selectedCount) {
    problems.push(`expected all selected apps to pass, got passed=${report.summary?.passed} failed=${report.summary?.failed}`);
  }
  if (report.launch_policy?.aliases_allowed !== false || report.launch_policy?.static_html_server_allowed !== false || report.launch_policy?.synthetic_success_allowed !== false) {
    problems.push('launch policy must explicitly reject aliases, static HTML, and synthetic success');
  }

  const apps = Array.isArray(report.apps) ? report.apps : [];
  const seen = new Set();
  for (const [index, app] of apps.entries()) {
    if (!app?.app_id || typeof app.app_id !== 'string') {
      problems.push('app record is missing app_id');
      continue;
    }
    if (app.app_id !== expectedAppIds[index]) {
      problems.push(`app record ${index} expected ${expectedAppIds[index]}, got ${app.app_id}`);
    }
    if (app.canonical_id !== app.app_id) {
      problems.push(`${app.app_id}: canonical_id must match the manifest desktop id`);
    }
    if (seen.has(app.app_id)) problems.push(`${app.app_id}: duplicate app record`);
    seen.add(app.app_id);
    validateViewportEvidence(app, 'desktop', problems);
    validateViewportEvidence(app, 'mobile', problems);
    validateAppSpecificWorkflowEvidence(app, problems);

    const appReportPath = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'app-improvement', `${safeFileName(app.app_id)}.json`);
    if (!existsSync(appReportPath)) {
      problems.push(`${app.app_id}: missing per-app report ${appReportPath}`);
    }
  }

  if (problems.length > 0) {
    console.error(`Invalid app-improvement report ${path}:`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
}

function validateUiUxAccessibilityGate(reportPath, indexPath, manifest, expectedAppIds) {
  const problems = [];
  const report = readJsonEvidence(reportPath, problems, 'SVD-180 UI/UX accessibility report');
  const screenshotIndex = readJsonEvidence(indexPath, problems, 'SVD-180 screenshot index');
  if (!report || !screenshotIndex) {
    printValidationProblems(`Invalid SVD-180 UI/UX accessibility evidence`, problems);
  }

  const manifestIds = manifest.apps.map(app => app.id);
  if (expectedAppIds.length !== manifestIds.length || !sameArray(expectedAppIds, manifestIds)) {
    problems.push('--viewport-matrix must cover every canonical app in manifest order; run with --all');
  }
  if (report.schema !== 'swissknife.virtual-desktop-app-improvement.ui-ux-accessibility.v1') {
    problems.push(`unexpected SVD-180 schema ${JSON.stringify(report.schema)}`);
  }
  if (report.task_id !== 'SVD-180') problems.push(`unexpected SVD-180 task_id ${JSON.stringify(report.task_id)}`);
  if (report.status !== 'passed') problems.push(`SVD-180 status must be passed, got ${JSON.stringify(report.status)}`);
  if (report.manifest_id !== manifest.manifest_id || report.manifest_version !== manifest.version) {
    problems.push(`SVD-180 manifest ${report.manifest_id}@${report.manifest_version} does not match canonical manifest ${manifest.manifest_id}@${manifest.version}`);
  }
  if (report.manifest_app_count !== manifestIds.length || report.selected_app_count !== manifestIds.length) {
    problems.push(`SVD-180 must cover ${manifestIds.length} apps, got manifest_app_count=${report.manifest_app_count} selected_app_count=${report.selected_app_count}`);
  }
  if (!Array.isArray(report.viewport_matrix) || report.viewport_matrix.map(viewport => viewport.id).join(',') !== 'desktop,narrow') {
    problems.push('SVD-180 viewport_matrix must contain desktop and narrow viewports');
  }
  if (!report.acceptance || Object.values(report.acceptance).some(value => value !== true)) {
    problems.push('SVD-180 acceptance object must contain only passing boolean checks');
  }
  if (!Array.isArray(report.applications) || report.applications.length !== manifestIds.length) {
    problems.push(`SVD-180 expected ${manifestIds.length} application records, got ${Array.isArray(report.applications) ? report.applications.length : 'not-array'}`);
  }

  const apps = Array.isArray(report.applications) ? report.applications : [];
  for (const [index, app] of apps.entries()) {
    const expectedAppId = manifestIds[index];
    if (app.app_id !== expectedAppId) {
      problems.push(`SVD-180 app record ${index} expected ${expectedAppId}, got ${app.app_id}`);
    }
    if (app.pass !== true) problems.push(`${app.app_id}: SVD-180 app pass must be true`);
    for (const viewportName of ['desktop', 'narrow']) {
      const viewport = app.viewports?.[viewportName];
      const prefix = `${app.app_id}/${viewportName}`;
      if (!viewport) {
        problems.push(`${prefix}: missing viewport summary`);
        continue;
      }
      if (viewport.opened !== true || viewport.pass !== true) problems.push(`${prefix}: viewport did not pass`);
      if (viewport.layout?.pass !== true) problems.push(`${prefix}: layout pass missing`);
      if (viewport.layout?.no_unintended_horizontal_overflow !== true) problems.push(`${prefix}: horizontal overflow was not gated`);
      if (viewport.layout?.no_text_or_control_overlap !== true) problems.push(`${prefix}: overlap was not gated`);
      if (viewport.keyboard?.focus_after_tab !== true || !viewport.keyboard?.primary_control_name) {
        problems.push(`${prefix}: keyboard focus or primary control evidence missing`);
      }
      if (viewport.states?.readable !== true) problems.push(`${prefix}: readable state contract missing`);
      if (viewport.recovery?.closed_to_desktop !== true) problems.push(`${prefix}: recovery path did not close to desktop`);
      const screenshotPath = viewport.screenshot ? join(process.cwd(), viewport.screenshot) : '';
      if (!screenshotPath || !existsSync(screenshotPath)) problems.push(`${prefix}: missing screenshot ${viewport.screenshot ?? ''}`);
    }
    if (!Array.isArray(app.recovery_path?.guidance) || app.recovery_path.guidance.length === 0) {
      problems.push(`${app.app_id}: reviewer-readable recovery guidance missing`);
    }
  }

  if (screenshotIndex.schema !== 'swissknife.virtual-desktop-app-improvement.screenshot-index.v1') {
    problems.push(`unexpected screenshot index schema ${JSON.stringify(screenshotIndex.schema)}`);
  }
  if (screenshotIndex.task_id !== 'SVD-180') problems.push(`unexpected screenshot index task_id ${JSON.stringify(screenshotIndex.task_id)}`);
  if (screenshotIndex.screenshot_count !== manifestIds.length * 2 || !Array.isArray(screenshotIndex.screenshots) || screenshotIndex.screenshots.length !== manifestIds.length * 2) {
    problems.push(`screenshot index must contain ${manifestIds.length * 2} entries`);
  }
  const expectedScreenshotKeys = new Set(manifestIds.flatMap(appId => [`${appId}/desktop`, `${appId}/narrow`]));
  for (const entry of Array.isArray(screenshotIndex.screenshots) ? screenshotIndex.screenshots : []) {
    expectedScreenshotKeys.delete(`${entry.app_id}/${entry.viewport}`);
    if (entry.exists !== true || !(entry.bytes > 0)) {
      problems.push(`${entry.app_id}/${entry.viewport}: screenshot index entry does not point to a non-empty screenshot`);
    }
    if (!entry.path || !existsSync(join(process.cwd(), entry.path))) {
      problems.push(`${entry.app_id}/${entry.viewport}: screenshot path is missing on disk`);
    }
    if (entry.layout_pass !== true) problems.push(`${entry.app_id}/${entry.viewport}: screenshot index lacks layout pass evidence`);
  }
  if (expectedScreenshotKeys.size > 0) {
    problems.push(`screenshot index missing entries: ${[...expectedScreenshotKeys].join(', ')}`);
  }

  if (problems.length > 0) {
    printValidationProblems(`Invalid SVD-180 UI/UX accessibility evidence`, problems);
  }
}

function readJsonEvidence(path, problems, label) {
  if (!existsSync(path)) {
    problems.push(`${label} missing at ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(`${label} at ${path} could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function printValidationProblems(header, problems) {
  console.error(`${header}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

function validateAppSpecificWorkflowEvidence(app, problems) {
  if (app.app_id === 'datasets-browser') {
    validateDatasetsBrowserWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'accelerate-panel') {
    validateAcceleratePanelWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'agent-supervisor') {
    validateAgentSupervisorWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'calendar') {
    validateCalendarWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'calculator') {
    validateCalculatorWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'clock') {
    validateClockWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'cinema') {
    validateCinemaWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'friends-list') {
    validateFriendsListWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'glasses-preview') {
    validateGlassesPreviewWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'idl-explorer') {
    validateIDLExplorerWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'image-viewer') {
    validateImageViewerWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'media-player') {
    validateMediaPlayerWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'music-studio') {
    validateMusicStudioWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'mcp-plus-plus') {
    validateMCPPlusPlusWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'neural-network-designer') {
    validateNeuralNetworkDesignerWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'neural-photoshop') {
    validateNeuralPhotoshopWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'orb-auto-ui') {
    validateORBAutoUIWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'p2p-chat') {
    validateP2PChatWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'p2p-chat-unified') {
    validateP2PChatUnifiedWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'peertube') {
    validatePeerTubeWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'strudel') {
    validateStrudelWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'strudel-ai-daw') {
    validateStrudelAIDAWWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id === 'system-monitor') {
    validateSystemMonitorWorkflowEvidence(app, problems);
    return;
  }
  if (app.app_id !== 'training-manager') return;
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G032`;
    if (!workflow) {
      problems.push(`${prefix}: missing governed training workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'training-manager.train-with-dataset' || workflow.vda_id !== 'VDA-G032') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'provenance',
      'capacity-queue',
      'telemetry',
      'cancellation-confirmation',
      'checkpoints',
      'resume-recovery',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    if (!Array.isArray(workflow.checkpoint_refs) || workflow.checkpoint_refs.length === 0) {
      problems.push(`${prefix}: missing checkpoint CID refs`);
    }
    if (!Array.isArray(workflow.receipt_refs) || workflow.receipt_refs.length === 0) {
      problems.push(`${prefix}: missing receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'launch-governed-training')) {
      problems.push(`${prefix}: missing launch-governed-training action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateCalculatorWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G033`;
    if (!workflow) {
      problems.push(`${prefix}: missing Calculator workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'calculator.calculation-cid-history' || workflow.vda_id !== 'VDA-G033') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'calculation-cid-history',
      'verified-explanation',
      'keypad-focus',
      'error-handling',
      'responsive-layout',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    if (!Array.isArray(workflow.checkpoint_refs) || !workflow.checkpoint_refs.some(ref => /^bafy[a-z0-9]+g033$/i.test(ref))) {
      problems.push(`${prefix}: missing calculation CID refs`);
    }
    if (!Array.isArray(workflow.receipt_refs) || !workflow.receipt_refs.some(ref => /^receipt:calculator:vda-g033:/i.test(ref))) {
      problems.push(`${prefix}: missing calculator receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'verify-explanation')) {
      problems.push(`${prefix}: missing verify-explanation action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateCalendarWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G035`;
    if (!workflow) {
      problems.push(`${prefix}: missing Calendar workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'calendar.artifact-backed-scheduling' || workflow.vda_id !== 'VDA-G035') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'artifact-backed-events',
      'semantic-search',
      'reminders',
      'conflict-handling',
      'mobile-summary',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafycalg035/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing event artifact, semantic index, reminder policy, conflict resolution, mobile summary, and Event DAG CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:calendar:g035:/i.test(ref)).length < 5) {
      problems.push(`${prefix}: missing event artifact, semantic search, reminder, conflict, and mobile summary receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'persist-event-artifact')) {
      problems.push(`${prefix}: missing persist-event-artifact action`);
    }
    if (!workflow.actions?.some(action => action.action === 'run-semantic-search')) {
      problems.push(`${prefix}: missing run-semantic-search action`);
    }
    if (!workflow.actions?.some(action => action.action === 'schedule-reminder')) {
      problems.push(`${prefix}: missing schedule-reminder action`);
    }
    if (!workflow.actions?.some(action => action.action === 'resolve-conflict')) {
      problems.push(`${prefix}: missing resolve-conflict action`);
    }
    if (!workflow.actions?.some(action => action.action === 'refresh-mobile-summary')) {
      problems.push(`${prefix}: missing refresh-mobile-summary action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateClockWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G034`;
    if (!workflow) {
      problems.push(`${prefix}: missing Clock workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'clock.timer-reminder-scheduling' || workflow.vda_id !== 'VDA-G034') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'timer-receipt',
      'reminder-policy',
      'scheduling-state',
      'permission-recovery',
      'compact-ui',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyclockg034/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing timer receipt, reminder policy, scheduling state, permission recovery, compact UI, and Event DAG CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:clock:g034:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing timer, reminder policy, scheduling state, permission recovery, compact UI, and Event DAG receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'start-timer-with-receipt')) {
      problems.push(`${prefix}: missing start-timer-with-receipt action`);
    }
    if (!workflow.actions?.some(action => action.action === 'apply-reminder-policy')) {
      problems.push(`${prefix}: missing apply-reminder-policy action`);
    }
    if (!workflow.actions?.some(action => action.action === 'schedule-clock-reminder')) {
      problems.push(`${prefix}: missing schedule-clock-reminder action`);
    }
    if (!workflow.actions?.some(action => action.action === 'recover-notification-permission')) {
      problems.push(`${prefix}: missing recover-notification-permission action`);
    }
    if (!workflow.actions?.some(action => action.action === 'verify-compact-ui')) {
      problems.push(`${prefix}: missing verify-compact-ui action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateImageViewerWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G038`;
    if (!workflow) {
      problems.push(`${prefix}: missing Image Viewer CID metadata/enhancement workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'image-viewer.cid-metadata-enhancement' || workflow.vda_id !== 'VDA-G038') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'cid-retrieval',
      'metadata-ocr',
      'enhancement-job',
      'zoom-pan',
      'unsupported-format',
      'alt-text',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyimageviewerg038/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing image retrieval, retrieval manifest, metadata/OCR, enhancement, zoom/pan, unsupported-format, and alt-text CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:image-viewer:g038:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing retrieval, metadata/OCR, enhancement, zoom/pan, unsupported-format, and alt-text receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'retrieve-cid-image')) {
      problems.push(`${prefix}: missing retrieve-cid-image action`);
    }
    if (!workflow.actions?.some(action => action.action === 'run-metadata-ocr')) {
      problems.push(`${prefix}: missing run-metadata-ocr action`);
    }
    if (!workflow.actions?.some(action => action.action === 'start-enhancement-job')) {
      problems.push(`${prefix}: missing start-enhancement-job action`);
    }
    if (!workflow.actions?.some(action => action.action === 'apply-zoom-pan')) {
      problems.push(`${prefix}: missing apply-zoom-pan action`);
    }
    if (!workflow.actions?.some(action => action.action === 'show-unsupported-format')) {
      problems.push(`${prefix}: missing show-unsupported-format action`);
    }
    if (!workflow.actions?.some(action => action.action === 'refresh-alt-text')) {
      problems.push(`${prefix}: missing refresh-alt-text action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateFriendsListWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G037`;
    if (!workflow) {
      problems.push(`${prefix}: missing Friends List provenance/policy workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'friends-list.contact-provenance-policy-state' || workflow.vda_id !== 'VDA-G037') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'contact-provenance',
      'relationship-policy',
      'invitation-blocking-state',
      'freshness',
      'accessible-empty-state',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyfriendsg037/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing contact provenance, relationship policy, invitation, blocking, freshness, accessible-empty, and event DAG CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:friends-list:g037:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing contact provenance, relationship policy, invitation, blocking, freshness, and accessible-empty receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'review-contact-provenance')) {
      problems.push(`${prefix}: missing review-contact-provenance action`);
    }
    if (!workflow.actions?.some(action => action.action === 'apply-relationship-policy')) {
      problems.push(`${prefix}: missing apply-relationship-policy action`);
    }
    if (!workflow.actions?.some(action => action.action === 'process-invitation-state')) {
      problems.push(`${prefix}: missing process-invitation-state action`);
    }
    if (!workflow.actions?.some(action => action.action === 'toggle-blocking-state')) {
      problems.push(`${prefix}: missing toggle-blocking-state action`);
    }
    if (!workflow.actions?.some(action => action.action === 'refresh-freshness')) {
      problems.push(`${prefix}: missing refresh-freshness action`);
    }
    if (!workflow.actions?.some(action => action.action === 'show-accessible-empty-state')) {
      problems.push(`${prefix}: missing show-accessible-empty-state action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateMediaPlayerWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G040`;
    if (!workflow) {
      problems.push(`${prefix}: missing Media Player CID audio workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'media-player.cid-audio-quality-recovery' || workflow.vda_id !== 'VDA-G040') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'cid-media',
      'captions-metadata',
      'diagnostics',
      'seek-volume',
      'missing-codec',
      'background-audio-recovery',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafymediaplayerg040/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing CID playback, retrieval manifest, captions/metadata, diagnostics, seek/volume, missing-codec, and background-audio CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:media-player:g040:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing CID media, captions/metadata, diagnostics, seek/volume, missing-codec, and background-audio receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'retrieve-cid-media')) {
      problems.push(`${prefix}: missing retrieve-cid-media action`);
    }
    if (!workflow.actions?.some(action => action.action === 'toggle-captions-metadata')) {
      problems.push(`${prefix}: missing toggle-captions-metadata action`);
    }
    if (!workflow.actions?.some(action => action.action === 'run-quality-diagnostics')) {
      problems.push(`${prefix}: missing run-quality-diagnostics action`);
    }
    if (!workflow.actions?.some(action => action.action === 'exercise-seek-volume')) {
      problems.push(`${prefix}: missing exercise-seek-volume action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-missing-codec')) {
      problems.push(`${prefix}: missing simulate-missing-codec action`);
    }
    if (!workflow.actions?.some(action => action.action === 'recover-background-audio')) {
      problems.push(`${prefix}: missing recover-background-audio action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateMusicStudioWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G046`;
    if (!workflow) {
      problems.push(`${prefix}: missing classic studio artifact save render fallback workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'music-studio.classic-artifact-save-render-fallback' || workflow.vda_id !== 'VDA-G046') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'legacy-workflow',
      'artifact-workflow',
      'metadata-rights',
      'optional-render',
      'save-proof',
      'responsive-fallback',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafymusicstudiog046/i.test(ref)).length < 8) {
      problems.push(`${prefix}: missing project asset, stem, mix, catalog rights, optional render, save, fallback, and event DAG CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:music-studio:g046:/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing legacy, artifact, rights, render, save, restore, and responsive fallback receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'preserve-legacy-flow')) {
      problems.push(`${prefix}: missing preserve-legacy-flow action`);
    }
    if (!workflow.actions?.some(action => action.action === 'load-artifact-cids')) {
      problems.push(`${prefix}: missing load-artifact-cids action`);
    }
    if (!workflow.actions?.some(action => action.action === 'inspect-catalog-rights')) {
      problems.push(`${prefix}: missing inspect-catalog-rights action`);
    }
    if (!workflow.actions?.some(action => action.action === 'start-optional-render')) {
      problems.push(`${prefix}: missing start-optional-render action`);
    }
    if (!workflow.actions?.some(action => action.action === 'save-classic-project')) {
      problems.push(`${prefix}: missing save-classic-project action`);
    }
    if (!workflow.actions?.some(action => action.action === 'prove-responsive-fallback')) {
      problems.push(`${prefix}: missing prove-responsive-fallback action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateCinemaWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G043`;
    if (!workflow) {
      problems.push(`${prefix}: missing Cinema project/media render workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'cinema.project-media-render-provenance' || workflow.vda_id !== 'VDA-G043') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'project-media-cids',
      'rights-metadata',
      'render-queue',
      'failed-export',
      'playback-fallback',
      'stable-timeline-controls',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafycinemag043/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing project, media, rights, render queue, failed export, playback fallback, and timeline CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:cinema:g043:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing project/media, rights, render queue, failed export, playback fallback, and timeline receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'load-project-media-cids')) {
      problems.push(`${prefix}: missing load-project-media-cids action`);
    }
    if (!workflow.actions?.some(action => action.action === 'verify-rights-metadata')) {
      problems.push(`${prefix}: missing verify-rights-metadata action`);
    }
    if (!workflow.actions?.some(action => action.action === 'submit-render-queue')) {
      problems.push(`${prefix}: missing submit-render-queue action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-failed-export')) {
      problems.push(`${prefix}: missing simulate-failed-export action`);
    }
    if (!workflow.actions?.some(action => action.action === 'activate-playback-fallback')) {
      problems.push(`${prefix}: missing activate-playback-fallback action`);
    }
    if (!workflow.actions?.some(action => action.action === 'stabilize-timeline-controls')) {
      problems.push(`${prefix}: missing stabilize-timeline-controls action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateNeuralPhotoshopWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G042`;
    if (!workflow) {
      problems.push(`${prefix}: missing Neural Photoshop source/result provenance workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'neural-photoshop.source-result-provenance-edit' || workflow.vda_id !== 'VDA-G042') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'source-result-cids',
      'prompt-model-provenance',
      'generation-progress',
      'edit-progress',
      'cancellation',
      'denial',
      'comparison-ui',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyneuralphotoshopg042/i.test(ref)).length < 9) {
      problems.push(`${prefix}: missing source, result, prompt, model, generation, edit, cancellation, denial, and comparison CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:neural-photoshop:g042:/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing source/result, provenance, generation, edit, cancellation, denial, and comparison receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'load-source-cid')) {
      problems.push(`${prefix}: missing load-source-cid action`);
    }
    if (!workflow.actions?.some(action => action.action === 'start-generation')) {
      problems.push(`${prefix}: missing start-generation action`);
    }
    if (!workflow.actions?.some(action => action.action === 'apply-edit-progress')) {
      problems.push(`${prefix}: missing apply-edit-progress action`);
    }
    if (!workflow.actions?.some(action => action.action === 'cancel-generation')) {
      problems.push(`${prefix}: missing cancel-generation action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-policy-denial')) {
      problems.push(`${prefix}: missing simulate-policy-denial action`);
    }
    if (!workflow.actions?.some(action => action.action === 'open-comparison-ui')) {
      problems.push(`${prefix}: missing open-comparison-ui action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateNeuralNetworkDesignerWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G031`;
    if (!workflow) {
      problems.push(`${prefix}: missing Neural Network Designer workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'neural-network-designer.design-compile-train' || workflow.vda_id !== 'VDA-G031') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'graph-artifacts',
      'schema-validation',
      'compile-train-planning',
      'invalid-edge-feedback',
      'result-receipts',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafynndg031/i.test(ref)).length < 5) {
      problems.push(`${prefix}: missing graph, schema, compile/train plan, invalid-edge, and result artifact CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:neural-network-designer:g031:/i.test(ref)).length < 5) {
      problems.push(`${prefix}: missing graph, schema, compile/train plan, invalid-edge, and result receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'generate-graph-artifacts')) {
      problems.push(`${prefix}: missing generate-graph-artifacts action`);
    }
    if (!workflow.actions?.some(action => action.action === 'validate-schema-contract')) {
      problems.push(`${prefix}: missing validate-schema-contract action`);
    }
    if (!workflow.actions?.some(action => action.action === 'plan-compile-train')) {
      problems.push(`${prefix}: missing plan-compile-train action`);
    }
    if (!workflow.actions?.some(action => action.action === 'surface-invalid-edge-feedback')) {
      problems.push(`${prefix}: missing surface-invalid-edge-feedback action`);
    }
    if (!workflow.actions?.some(action => action.action === 'submit-compile-workflow')) {
      problems.push(`${prefix}: missing submit-compile-workflow action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateDatasetsBrowserWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G048`;
    if (!workflow) {
      problems.push(`${prefix}: missing datasets browser workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'datasets-browser.semantic-provenance-preparation' || workflow.vda_id !== 'VDA-G048') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'dataset-cid',
      'semantic-operation',
      'provenance-operation',
      'preparation-job',
      'schema-filter-ui',
      'error-ui',
      'progress-ui',
      'receipts',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafydatasetg048/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing dataset, semantic, provenance, preparation, schema, filter, error, and progress CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:datasets-browser:g048:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing catalog, semantic, provenance, preparation, schema-error, and progress receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'run-semantic-search')) {
      problems.push(`${prefix}: missing run-semantic-search action`);
    }
    if (!workflow.actions?.some(action => action.action === 'record-provenance')) {
      problems.push(`${prefix}: missing record-provenance action`);
    }
    if (!workflow.actions?.some(action => action.action === 'start-preparation-job')) {
      problems.push(`${prefix}: missing start-preparation-job action`);
    }
    if (!workflow.actions?.some(action => action.action === 'apply-schema-filter')) {
      problems.push(`${prefix}: missing apply-schema-filter action`);
    }
    if (!workflow.actions?.some(action => action.action === 'show-schema-error')) {
      problems.push(`${prefix}: missing show-schema-error action`);
    }
    if (!workflow.actions?.some(action => action.action === 'refresh-progress')) {
      problems.push(`${prefix}: missing refresh-progress action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validatePeerTubeWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G036`;
    if (!workflow) {
      problems.push(`${prefix}: missing PeerTube CID playback workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'peertube.cid-playback-quality-recovery' || workflow.vda_id !== 'VDA-G036') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'cid-playback',
      'captions',
      'diagnostics',
      'buffering-recovery',
      'missing-content-recovery',
      'media-fallback',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafypeertubeg036/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing playback CID, retrieval manifest, captions, diagnostics, buffering, missing-content, and fallback CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:peertube:g036:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing playback, captions, diagnostics, buffering, missing-content, and fallback receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'retrieve-cid-playback')) {
      problems.push(`${prefix}: missing retrieve-cid-playback action`);
    }
    if (!workflow.actions?.some(action => action.action === 'toggle-captions')) {
      problems.push(`${prefix}: missing toggle-captions action`);
    }
    if (!workflow.actions?.some(action => action.action === 'run-quality-diagnostics')) {
      problems.push(`${prefix}: missing run-quality-diagnostics action`);
    }
    if (!workflow.actions?.some(action => action.action === 'recover-buffering')) {
      problems.push(`${prefix}: missing recover-buffering action`);
    }
    if (!workflow.actions?.some(action => action.action === 'recover-missing-content')) {
      problems.push(`${prefix}: missing recover-missing-content action`);
    }
    if (!workflow.actions?.some(action => action.action === 'activate-media-fallback')) {
      problems.push(`${prefix}: missing activate-media-fallback action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateStrudelWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G044`;
    if (!workflow) {
      problems.push(`${prefix}: missing Strudel session sample recovery workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'strudel.session-sample-pattern-recovery' || workflow.vda_id !== 'VDA-G044') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'session-sample-cids',
      'pattern-context',
      'optional-assistance',
      'compile-audio-errors',
      'session-restore',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafystrudelg044/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing session, sample, pattern, assistance, compile error, audio error, restore, and event DAG CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:strudel:g044:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing session/sample, pattern, optional assistance, compile error, audio error, and restore receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'load-session-sample-cids')) {
      problems.push(`${prefix}: missing load-session-sample-cids action`);
    }
    if (!workflow.actions?.some(action => action.action === 'inspect-pattern-context')) {
      problems.push(`${prefix}: missing inspect-pattern-context action`);
    }
    if (!workflow.actions?.some(action => action.action === 'request-optional-assistance')) {
      problems.push(`${prefix}: missing request-optional-assistance action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-compile-error')) {
      problems.push(`${prefix}: missing simulate-compile-error action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-audio-error')) {
      problems.push(`${prefix}: missing simulate-audio-error action`);
    }
    if (!workflow.actions?.some(action => action.action === 'restore-session')) {
      problems.push(`${prefix}: missing restore-session action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateStrudelAIDAWWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G045`;
    if (!workflow) {
      problems.push(`${prefix}: missing Strudel AI DAW assisted composition render workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'strudel-ai-daw.assisted-composition-render-recovery' || workflow.vda_id !== 'VDA-G045') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'asset-provenance',
      'assisted-composition',
      'render-state',
      'undo',
      'failed-audio-backend',
      'compact-controls',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafystrudelaidawg045/i.test(ref)).length < 9) {
      problems.push(`${prefix}: missing project, media, sample library, library context, Event DAG, assisted composition, render, undo, failed backend, fallback, and compact CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:strudel-ai-daw:g045:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing asset provenance, assisted composition, render, undo, failed audio backend, and compact controls receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'load-asset-provenance')) {
      problems.push(`${prefix}: missing load-asset-provenance action`);
    }
    if (!workflow.actions?.some(action => action.action === 'request-assisted-composition')) {
      problems.push(`${prefix}: missing request-assisted-composition action`);
    }
    if (!workflow.actions?.some(action => action.action === 'start-render-job')) {
      problems.push(`${prefix}: missing start-render-job action`);
    }
    if (!workflow.actions?.some(action => action.action === 'undo-ai-change')) {
      problems.push(`${prefix}: missing undo-ai-change action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-audio-backend-failure')) {
      problems.push(`${prefix}: missing simulate-audio-backend-failure action`);
    }
    if (!workflow.actions?.some(action => action.action === 'toggle-compact-controls')) {
      problems.push(`${prefix}: missing toggle-compact-controls action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateP2PChatUnifiedWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G030`;
    if (!workflow) {
      problems.push(`${prefix}: missing unified P2P chat workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'p2p-chat-unified.pubsub-offline-recovery' || workflow.vda_id !== 'VDA-G030') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'pubsub-offline-delivery',
      'moderation-context',
      'receipts',
      'audio-fallback',
      'offline-recovery',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyp2pchatg030/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing pubsub, offline queue, moderation, receipt bundle, audio fallback, and recovery CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:p2p-chat-unified:g030:/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing pubsub, offline, moderation, delivery, audio fallback, and recovery receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'publish-pubsub-message')) {
      problems.push(`${prefix}: missing publish-pubsub-message action`);
    }
    if (!workflow.actions?.some(action => action.action === 'queue-offline-delivery')) {
      problems.push(`${prefix}: missing queue-offline-delivery action`);
    }
    if (!workflow.actions?.some(action => action.action === 'review-moderation-context')) {
      problems.push(`${prefix}: missing review-moderation-context action`);
    }
    if (!workflow.actions?.some(action => action.action === 'emit-delivery-receipt')) {
      problems.push(`${prefix}: missing emit-delivery-receipt action`);
    }
    if (!workflow.actions?.some(action => action.action === 'activate-audio-fallback')) {
      problems.push(`${prefix}: missing activate-audio-fallback action`);
    }
    if (!workflow.actions?.some(action => action.action === 'recover-offline-delivery')) {
      problems.push(`${prefix}: missing recover-offline-delivery action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateP2PChatWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G047`;
    if (!workflow) {
      problems.push(`${prefix}: missing legacy P2P chat alias/pubsub/migration workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'p2p-chat.legacy-alias-pubsub-migration' || workflow.vda_id !== 'VDA-G047') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'legacy-alias-behavior',
      'pubsub-provenance',
      'offline-state',
      'delivery-failure',
      'migration-path',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyp2pchatg047/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing legacy alias, pubsub provenance, offline queue, delivery failure, migration path, and Event DAG CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:p2p-chat:g047:/i.test(ref)).length < 5) {
      problems.push(`${prefix}: missing legacy alias, pubsub provenance, offline queue, delivery failure, and migration receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'document-legacy-alias')) {
      problems.push(`${prefix}: missing document-legacy-alias action`);
    }
    if (!workflow.actions?.some(action => action.action === 'publish-pubsub-provenance')) {
      problems.push(`${prefix}: missing publish-pubsub-provenance action`);
    }
    if (!workflow.actions?.some(action => action.action === 'queue-offline-state')) {
      problems.push(`${prefix}: missing queue-offline-state action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-delivery-failure')) {
      problems.push(`${prefix}: missing simulate-delivery-failure action`);
    }
    if (!workflow.actions?.some(action => action.action === 'show-migration-path')) {
      problems.push(`${prefix}: missing show-migration-path action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateAgentSupervisorWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G054`;
    if (!workflow) {
      problems.push(`${prefix}: missing Agent Supervisor workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'agent-supervisor.steer-goals-subgoals-dispatch' || workflow.vda_id !== 'VDA-G054') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'goal-subgoal-graph',
      'prompt-preview',
      'taskboard-links',
      'policy-confirmation',
      'kda-evidence',
      'progress',
      'timeout-reassignment',
      'receipt-visibility',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyagentg054/i.test(ref)).length < 8) {
      problems.push(`${prefix}: missing goal, prompt, taskboard, policy, K/D/A, progress, timeout, and receipt CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:agent-supervisor:g054:/i.test(ref)).length < 8) {
      problems.push(`${prefix}: missing goal, prompt, taskboard, policy, K/D/A, progress, timeout, and receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'inspect-goal-graph')) {
      problems.push(`${prefix}: missing inspect-goal-graph action`);
    }
    if (!workflow.actions?.some(action => action.action === 'preview-steering-prompt')) {
      problems.push(`${prefix}: missing preview-steering-prompt action`);
    }
    if (!workflow.actions?.some(action => action.action === 'open-taskboard-links')) {
      problems.push(`${prefix}: missing open-taskboard-links action`);
    }
    if (!workflow.actions?.some(action => action.action === 'confirm-policy')) {
      problems.push(`${prefix}: missing confirm-policy action`);
    }
    if (!workflow.actions?.some(action => action.action === 'inspect-kda-evidence')) {
      problems.push(`${prefix}: missing inspect-kda-evidence action`);
    }
    if (!workflow.actions?.some(action => action.action === 'track-progress')) {
      problems.push(`${prefix}: missing track-progress action`);
    }
    if (!workflow.actions?.some(action => action.action === 'simulate-timeout-reassignment')) {
      problems.push(`${prefix}: missing simulate-timeout-reassignment action`);
    }
    if (!workflow.actions?.some(action => action.action === 'open-receipt-visibility')) {
      problems.push(`${prefix}: missing open-receipt-visibility action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateORBAutoUIWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G052`;
    if (!workflow) {
      problems.push(`${prefix}: missing ORB Auto-UI workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'orb-auto-ui.generate-governed-auto-ui' || workflow.vda_id !== 'VDA-G052') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'generated-artifact-cids',
      'intent-schema-policy',
      'execution-preview',
      'schema-error',
      'confirmation',
      'fallback-renderer',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyorbg052/i.test(ref)).length < 6) {
      problems.push(`${prefix}: missing generated app, schema, policy, preview, error, confirmation, and fallback CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:orb-auto-ui:g052:/i.test(ref)).length < 5) {
      problems.push(`${prefix}: missing preview, schema-error, confirmation, execution, and fallback receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'generate-auto-ui-artifacts')) {
      problems.push(`${prefix}: missing generate-auto-ui-artifacts action`);
    }
    if (!workflow.actions?.some(action => action.action === 'preview-execution-envelope')) {
      problems.push(`${prefix}: missing preview-execution-envelope action`);
    }
    if (!workflow.actions?.some(action => action.action === 'validate-schema-error')) {
      problems.push(`${prefix}: missing validate-schema-error action`);
    }
    if (!workflow.actions?.some(action => action.action === 'confirm-governed-execution')) {
      problems.push(`${prefix}: missing confirm-governed-execution action`);
    }
    if (!workflow.actions?.some(action => action.action === 'render-fallback-surface')) {
      problems.push(`${prefix}: missing render-fallback-surface action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateGlassesPreviewWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G051`;
    if (!workflow) {
      problems.push(`${prefix}: missing glasses simulator replay workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'glasses-preview.replay-orb-handoff' || workflow.vda_id !== 'VDA-G051') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'replay-bundle',
      'privacy-policy',
      'display-denial',
      'camera-denial',
      'microphone-denial',
      'speaker-denial',
      'display-audio-analysis',
      'fallback-proof',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyglassg051/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing replay bundle, policy, packet, analysis, and fallback CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:glasses-preview:g051:/i.test(ref)).length < 7) {
      problems.push(`${prefix}: missing replay, denial, analysis, and fallback receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'replay-simulator-bundle')) {
      problems.push(`${prefix}: missing replay-simulator-bundle action`);
    }
    if (!workflow.actions?.some(action => action.action === 'deny-display')) {
      problems.push(`${prefix}: missing deny-display action`);
    }
    if (!workflow.actions?.some(action => action.action === 'deny-camera')) {
      problems.push(`${prefix}: missing deny-camera action`);
    }
    if (!workflow.actions?.some(action => action.action === 'deny-microphone')) {
      problems.push(`${prefix}: missing deny-microphone action`);
    }
    if (!workflow.actions?.some(action => action.action === 'deny-speaker')) {
      problems.push(`${prefix}: missing deny-speaker action`);
    }
    if (!workflow.actions?.some(action => action.action === 'run-display-audio-analysis')) {
      problems.push(`${prefix}: missing run-display-audio-analysis action`);
    }
    if (!workflow.actions?.some(action => action.action === 'prove-fallback')) {
      problems.push(`${prefix}: missing prove-fallback action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateAcceleratePanelWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G049`;
    if (!workflow) {
      problems.push(`${prefix}: missing accelerate workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'accelerate-panel.inference-with-hardware-fit' || workflow.vda_id !== 'VDA-G049') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'model-artifacts',
      'evaluation-policy',
      'primary-execution',
      'hardware-fit',
      'queue-log-cancel',
      'no-capacity-recovery',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    if (!Array.isArray(workflow.checkpoint_refs) || workflow.checkpoint_refs.filter(ref => /^bafyaccelerate/i.test(String(ref))).length < 4) {
      problems.push(`${prefix}: missing model artifact/evaluation/result CID refs`);
    }
    if (!Array.isArray(workflow.receipt_refs) || workflow.receipt_refs.length < 5) {
      problems.push(`${prefix}: missing queue/run/cancel/recovery receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'launch-primary-execution')) {
      problems.push(`${prefix}: missing launch-primary-execution action`);
    }
    if (!workflow.actions?.some(action => action.action === 'cancel-queued-job')) {
      problems.push(`${prefix}: missing cancel-queued-job action`);
    }
    if (!workflow.actions?.some(action => action.action === 'recover-no-capacity')) {
      problems.push(`${prefix}: missing recover-no-capacity action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateSystemMonitorWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G041`;
    if (!workflow) {
      problems.push(`${prefix}: missing live diagnostic workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'system-monitor.live-diagnostics' || workflow.vda_id !== 'VDA-G041') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'live-telemetry',
      'diagnostic-history',
      'analysis',
      'stale-data',
      'alert-state',
      'accessible-summaries',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    if (!Array.isArray(workflow.checkpoint_refs) || workflow.checkpoint_refs.length === 0) {
      problems.push(`${prefix}: missing telemetry sample refs`);
    }
    if (!Array.isArray(workflow.receipt_refs) || workflow.receipt_refs.length < 6) {
      problems.push(`${prefix}: missing diagnostic receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'refresh-live-telemetry')) {
      problems.push(`${prefix}: missing refresh-live-telemetry action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateIDLExplorerWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G050`;
    if (!workflow) {
      problems.push(`${prefix}: missing IDL Explorer workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'idl-explorer.inspect-governed-descriptors' || workflow.vda_id !== 'VDA-G050') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'descriptor-cids',
      'schema-policy',
      'compatibility-fixture',
      'invalid-input',
      'transport-badges',
      'receipt-drill-down',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafyidlg050/i.test(ref)).length < 5) {
      problems.push(`${prefix}: missing descriptor, fixture, invalid-input, and policy CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:idl-explorer:/i.test(ref)).length < 3) {
      problems.push(`${prefix}: missing compatibility, invalid-input, and receipt drill-down refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'run-compatibility-fixture')) {
      problems.push(`${prefix}: missing run-compatibility-fixture action`);
    }
    if (!workflow.actions?.some(action => action.action === 'validate-invalid-input')) {
      problems.push(`${prefix}: missing validate-invalid-input action`);
    }
    if (!workflow.actions?.some(action => action.action === 'open-receipt-drilldown')) {
      problems.push(`${prefix}: missing open-receipt-drilldown action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function validateMCPPlusPlusWorkflowEvidence(app, problems) {
  for (const viewportName of ['desktop', 'mobile']) {
    const workflow = app?.[viewportName]?.app_workflow;
    const prefix = `${app.app_id}/${viewportName}/VDA-G053`;
    if (!workflow) {
      problems.push(`${prefix}: missing MCP++ diagnostic workflow evidence`);
      continue;
    }
    if (workflow.workflow_id !== 'mcp-plus-plus.diagnose-profiles-peers-event-dag' || workflow.vda_id !== 'VDA-G053') {
      problems.push(`${prefix}: unexpected workflow identity ${workflow.workflow_id ?? 'missing'} ${workflow.vda_id ?? 'missing'}`);
    }
    for (const marker of [
      'peer-diagnostics',
      'event-dag-diagnostics',
      'policy-diagnostics',
      'scheduling-diagnostics',
      'http-libp2p-distinction',
      'did-identity',
      'profile-failure',
      'evidence-drill-down',
    ]) {
      if (workflow.acceptance?.[marker] !== true) {
        problems.push(`${prefix}: missing acceptance marker ${marker}`);
      }
    }
    const checkpointRefs = Array.isArray(workflow.checkpoint_refs) ? workflow.checkpoint_refs.map(String) : [];
    const receiptRefs = Array.isArray(workflow.receipt_refs) ? workflow.receipt_refs.map(String) : [];
    if (checkpointRefs.filter(ref => /^bafymcppg053/i.test(ref)).length < 8) {
      problems.push(`${prefix}: missing peer, Event DAG, policy, scheduling, transport, DID, profile failure, and evidence CID refs`);
    }
    if (receiptRefs.filter(ref => /^receipt:mcp-plus-plus:g053:/i.test(ref)).length < 8) {
      problems.push(`${prefix}: missing diagnostic, transport, identity, profile-failure, and evidence receipt refs`);
    }
    if (!Array.isArray(workflow.actions) || !workflow.actions.some(action => action.action === 'inspect-peer-diagnostics')) {
      problems.push(`${prefix}: missing inspect-peer-diagnostics action`);
    }
    if (!workflow.actions?.some(action => action.action === 'compare-http-libp2p')) {
      problems.push(`${prefix}: missing compare-http-libp2p action`);
    }
    if (!workflow.actions?.some(action => action.action === 'verify-did-identity')) {
      problems.push(`${prefix}: missing verify-did-identity action`);
    }
    if (!workflow.actions?.some(action => action.action === 'evaluate-policy-diagnostics')) {
      problems.push(`${prefix}: missing evaluate-policy-diagnostics action`);
    }
    if (!workflow.actions?.some(action => action.action === 'evaluate-scheduling-frontier')) {
      problems.push(`${prefix}: missing evaluate-scheduling-frontier action`);
    }
    if (!workflow.actions?.some(action => action.action === 'diagnose-profile-failure')) {
      problems.push(`${prefix}: missing diagnose-profile-failure action`);
    }
    if (!workflow.actions?.some(action => action.action === 'open-evidence-drilldown')) {
      problems.push(`${prefix}: missing open-evidence-drilldown action`);
    }
    if (workflow.complete !== true) {
      problems.push(`${prefix}: workflow evidence is not complete`);
    }
  }
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function validateViewportEvidence(app, viewportName, problems) {
  const viewport = app?.[viewportName];
  const prefix = `${app.app_id}/${viewportName}`;
  if (!viewport) {
    problems.push(`${prefix}: missing viewport evidence`);
    return;
  }
  if (viewport.opened !== true) problems.push(`${prefix}: app did not open`);
  if (viewport.launch?.from_desktop_icon !== true || viewport.launch?.icon_visible !== true) {
    problems.push(`${prefix}: launch was not proven from a visible canonical desktop icon`);
  }
  if (viewport.launch?.registered_in_desktop_runtime !== true) {
    problems.push(`${prefix}: canonical app id was not registered in the actual desktop runtime`);
  }
  if (viewport.primary_control?.action_succeeded !== true || !viewport.primary_control?.name) {
    problems.push(`${prefix}: missing named successful primary visible control evidence`);
  }
  const eventProbe = viewport.primary_control?.event_probe;
  if (!eventProbe || !(eventProbe.action_event_count > 0 || eventProbe.value_changed === true)) {
    problems.push(`${prefix}: primary control success lacks concrete browser event or value-mutation evidence`);
  }
  if (!viewport.focus?.before || !viewport.focus?.after_tab) {
    problems.push(`${prefix}: missing focus evidence`);
  }
  if (!Array.isArray(viewport.console_events) || !Array.isArray(viewport.network_events)) {
    problems.push(`${prefix}: missing console/network evidence arrays`);
  }
  const screenshotPath = viewport.screenshot ? join(process.cwd(), viewport.screenshot) : '';
  if (!screenshotPath || !existsSync(screenshotPath)) {
    problems.push(`${prefix}: missing screenshot ${viewport.screenshot ?? ''}`);
  }
  const snapshot = viewport.states?.deterministic_snapshot;
  if (!/^[0-9a-f]{16}$/.test(snapshot?.state_hash ?? '') || !(snapshot?.visible_control_count > 0)) {
    problems.push(`${prefix}: missing deterministic state snapshot`);
  }
  if (!viewport.states?.deterministic_contract?.loading_state || !viewport.states?.deterministic_contract?.empty_state || !viewport.states?.deterministic_contract?.error_state || !viewport.states?.deterministic_contract?.recovery_state) {
    problems.push(`${prefix}: missing deterministic loading/empty/error/recovery contract`);
  }
  if (viewport.states?.recovery?.closed_to_desktop !== true) {
    problems.push(`${prefix}: recovery did not close back to desktop`);
  }
  if (viewport.interaction_error) {
    problems.push(`${prefix}: interaction error ${viewport.interaction_error}`);
  }
}

function safeFileName(value) {
  return value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

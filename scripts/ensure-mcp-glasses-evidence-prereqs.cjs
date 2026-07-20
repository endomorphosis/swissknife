#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');

const requiredArtifacts = [
  'all-tools-ledger.json',
  'all-tools-policy-matrix.json',
  'all-tools-app-bindings.json',
  'all-tools-app-family-coverage.json',
  'all-tools-composite-workflows.json',
  'all-tools-execution-report.json',
  'all-tools-idl-coverage.json',
  'all-tools-glasses-coverage.json',
  'all-tools-policy-release-gate.json',
  'all-server-tool-catalog.json',
  'mcp-plus-plus-libp2p-catalog.json',
  'mcpplusplus-libp2p-reachability.json',
  'descriptor-discovery.json',
  'hierarchical-tools-evidence.json',
  'service-health.json',
  'capability-matrix.json',
  'tool-ui-smoke-receipts.json',
  'app-inventory.json',
  'app-backend-contract.json',
  'app-workflow-matrix.json',
  'agent-supervisor-console-e2e.json',
  'agent-supervisor-console-receipts.json',
  'orb-idl-complete-coverage.json',
].filter(fileName => fileName !== 'app-inventory.json' || dashboardConsumerAvailable());
const simulatorArtifact = 'glasses-simulator-handoff.json';

const missing = requiredArtifacts.filter(fileName => !fs.existsSync(path.join(evidenceRoot, fileName)));
const staleOrNoGo = releaseBlockingArtifactsNeedingRefresh();
if (missing.length === 0 && staleOrNoGo.length === 0) {
  if (!fs.existsSync(path.join(evidenceRoot, simulatorArtifact))) {
    runChecked(tsxBinary(), ['scripts/build-meta-glasses-simulator-handoff-evidence.ts']);
  }
  console.log('MCP glasses evidence prerequisites are present.');
  process.exit(0);
}

console.log(`Regenerating MCP glasses evidence prerequisites: ${[...missing, ...staleOrNoGo].join(', ')}`);
const commands = [
  [process.execPath, ['scripts/capture-ipfs-mcp-all-tools-ledger.cjs']],
  [process.execPath, ['scripts/capture-ipfs-accelerate-adapter-coverage.cjs']],
  [process.execPath, ['scripts/build-all-tools-composite-workflows.cjs']],
  [process.execPath, ['scripts/build-all-tools-capability-matrix.cjs']],
  [process.execPath, ['scripts/capture-mcp-live-probe-evidence.cjs']],
  [process.execPath, ['scripts/capture-hierarchical-mcp-tools-evidence.cjs']],
  [process.execPath, ['scripts/build-agent-supervisor-console-evidence.cjs']],
  [tsxBinary(), ['scripts/build-meta-glasses-simulator-handoff-evidence.ts']],
];

// Dashboard-consumer evidence belongs to a sibling Hallucinate App checkout.
// In a standalone SwissKnife worktree retain the real desktop workflow replay,
// but do not claim an unavailable external consumer as passing evidence.
if (dashboardConsumerAvailable()) {
  commands.splice(6, 0,
    [process.execPath, [
      'scripts/run-with-owned-port.mjs',
      '--env-var', 'SWISSKNIFE_MCP_E2E_PORT',
      '--preferred', '3417',
      '--',
      process.execPath,
      'scripts/run_playwright_test.mjs',
      'test',
      '-c', 'build-tools/configs/playwright.mcp-dashboard.config.ts',
    ]],
    [process.execPath, ['scripts/test-mcp-dashboard-consumer.cjs']],
  );
} else {
  console.log('Skipping optional Hallucinate App dashboard-consumer evidence: sibling checkout is unavailable.');
  commands.splice(6, 0, [process.execPath, [
    'scripts/run-with-owned-port.mjs',
    '--env-var', 'SWISSKNIFE_MCP_E2E_PORT',
    '--preferred', '3417',
    '--',
    process.execPath,
    'scripts/run_playwright_test.mjs',
    'test',
    '-c', 'build-tools/configs/playwright.mcp-dashboard.config.ts',
    '--grep',
    'opens every tool-backed virtual desktop app|generates exhaustive SWR-102 per-app UI/UX workflow matrix',
  ]]);
}

for (const [command, args] of commands) {
  runChecked(command, args);
}

function dashboardConsumerAvailable() {
  const appRoot = path.resolve(projectRoot, '..', 'hallucinate_app');
  return [
    path.join(appRoot, 'hallucinate_app', 'node', 'mcp_daemon_manager.js'),
    path.join(appRoot, 'test', 'e2e', 'fixtures', 'vai-512-mcp-dashboard-catalog.json'),
    path.join(appRoot, 'test', 'e2e', 'fixtures', 'vai-512-hallucinate-swissknife-mcp-dashboard-consumption.json'),
  ].every(fs.existsSync);
}

function tsxBinary() {
  return path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
  );
}

function runChecked(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${path.basename(args[0] ?? command)} exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function releaseBlockingArtifactsNeedingRefresh() {
  const needsRefresh = [];
  const allToolsGate = readJson('all-tools-policy-release-gate.json');
  if (allToolsGate && allToolsGate.decision !== 'go') {
    needsRefresh.push('all-tools-policy-release-gate.json:not-go');
  }
  const hierarchical = readJson('hierarchical-tools-evidence.json');
  if (hierarchical && hierarchical.decision !== 'go') {
    needsRefresh.push('hierarchical-tools-evidence.json:not-go');
  }
  const serverCatalog = readJson('all-server-tool-catalog.json');
  if (serverCatalog && serverCatalog.decision !== 'go') {
    needsRefresh.push('all-server-tool-catalog.json:not-go');
  }
  const libp2pCatalog = readJson('mcp-plus-plus-libp2p-catalog.json');
  if (libp2pCatalog && libp2pCatalog.decision !== 'go') {
    needsRefresh.push('mcp-plus-plus-libp2p-catalog.json:not-go');
  }
  const simulator = readJson(simulatorArtifact);
  if (simulator && (
    simulator.hardware_free !== true
      || simulator.simulator_driven !== true
      || simulator.physical_glasses_required !== false
      || simulator.direct_desktop_pairing_required !== false
  )) {
    needsRefresh.push(`${simulatorArtifact}:not-simulator-driven`);
  }
  return needsRefresh;
}

function readJson(fileName) {
  const filePath = path.join(evidenceRoot, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { decision: 'invalid' };
  }
}

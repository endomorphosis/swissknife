#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');

const requiredArtifacts = [
  'all-tools-ledger.json',
  'all-tools-app-bindings.json',
  'all-tools-composite-workflows.json',
  'capability-matrix.json',
  'tool-ui-smoke-receipts.json',
];
const simulatorArtifact = 'glasses-simulator-handoff.json';

const missing = requiredArtifacts.filter(fileName => !fs.existsSync(path.join(evidenceRoot, fileName)));
if (missing.length === 0) {
  if (!fs.existsSync(path.join(evidenceRoot, simulatorArtifact))) {
    runChecked(tsxBinary(), ['scripts/build-meta-glasses-simulator-handoff-evidence.ts']);
  }
  console.log('MCP glasses evidence prerequisites are present.');
  process.exit(0);
}

console.log(`Regenerating MCP glasses evidence prerequisites: ${missing.join(', ')}`);
for (const [command, args] of [
  [process.execPath, ['scripts/capture-ipfs-mcp-all-tools-ledger.cjs']],
  [process.execPath, ['scripts/build-all-tools-composite-workflows.cjs']],
  [process.execPath, ['scripts/build-all-tools-capability-matrix.cjs']],
  [process.execPath, ['scripts/run_playwright_test.mjs', 'test', '-c', 'build-tools/configs/playwright.mcp-dashboard.config.ts']],
  [process.execPath, ['scripts/test-mcp-dashboard-consumer.cjs']],
  [tsxBinary(), ['scripts/build-meta-glasses-simulator-handoff-evidence.ts']],
]) {
  runChecked(command, args);
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

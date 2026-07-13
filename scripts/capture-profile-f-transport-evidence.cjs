#!/usr/bin/env node

/**
 * Bootstrap the managed adapters and prove the complete Profile F lifecycle
 * through both HTTP/REST and the canonical MCP+p2p libp2p transport.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'profile-f-event-dag-http-libp2p.json');

main();

function main() {
  for (const script of [
    'ensure-ipfs-mcp-compat-adapters.cjs',
    'ensure-ipfs-mcp-libp2p-bridges.cjs',
  ]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: projectRoot,
      env: process.env,
      encoding: 'utf8',
      timeout: 180_000,
    });
    if (result.error || result.status !== 0) {
      writeNoGo(result.error?.message || result.stderr || `${script} exited ${result.status}`);
      process.exitCode = 1;
      return;
    }
  }

  const probe = spawnSync(process.execPath, [
    '--import',
    'tsx',
    path.join(__dirname, 'capture-profile-f-transport-evidence-probe.mts'),
  ], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (probe.error || probe.status !== 0) {
    if (!fs.existsSync(outputPath)) {
      writeNoGo(probe.error?.message || probe.stderr || probe.stdout || `Profile F probe exited ${probe.status}`);
    }
    process.stderr.write(probe.stderr || probe.stdout || 'Profile F probe failed.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(probe.stdout);
}

function writeNoGo(error) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schema: 'swissknife.profile_f_http_libp2p_lifecycle.v1',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    service_count: 0,
    profile_name: 'Profile F: Event DAG Provenance, Archival, and Compaction',
    error: String(error),
    services: [],
  }, null, 2)}\n`);
}

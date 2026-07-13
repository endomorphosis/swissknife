#!/usr/bin/env node

/**
 * Bootstrap the managed Profile D adapters then run the canonical direct
 * SwissKnife HTTP/libp2p probe. The probe owns the v2 evidence schema and
 * parses every Profile D artifact as CIDv1 dag-json rather than accepting a
 * legacy hash-shaped string.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outputPath = path.join(evidenceRoot, 'profile-d-policy-http-libp2p.json');
const cidContract = { version: 1, codec: 'dag-json', multihash: 'sha2-256' };

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
    path.join(__dirname, 'capture-profile-d-transport-evidence-probe.mts'),
  ], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (probe.error || probe.status !== 0) {
    // The TypeScript probe normally writes the detailed no-go evidence itself.
    // Keep a fallback for launch failures before it can initialize.
    if (!fs.existsSync(outputPath)) {
      writeNoGo(probe.error?.message || probe.stderr || probe.stdout || `Profile D probe exited ${probe.status}`);
    }
    process.stderr.write(probe.stderr || probe.stdout || 'Profile D probe failed.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(probe.stdout);
}

function writeNoGo(error) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schema: 'swissknife.profile_d_http_libp2p_parity.v2',
    generated_at: new Date().toISOString(),
    decision: 'no_go',
    service_count: 0,
    vector_count: 5,
    cid_contract: cidContract,
    error: String(error),
    services: [],
  }, null, 2)}\n`);
}

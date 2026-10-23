#!/usr/bin/env node
/**
 * Lease one port and click one live-click target.
 *
 * Usage from the repo root:
 *   node swissknife/scripts/run-live-click.mjs pilot
 * Usage from swissknife:
 *   npm run evidence:live-click -- pilot
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from './live-click-fixture.cjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = new Set(['pilot', 'storage', 'datasets', 'accelerate', 'network', 'control', 'local']);
const target = process.argv[2] || process.env.VDL_LIVE_CLICK_TARGET || '';

if (!targets.has(target)) {
  console.error('usage: node scripts/run-live-click.mjs <pilot|storage|datasets|accelerate|network|control|local>');
  process.exit(2);
}

await fixture.ensureLiveClickFixture();

const child = spawnSync(process.execPath, [
  path.join(projectRoot, 'scripts', 'run-with-owned-port.mjs'),
  '--env-var',
  'SWISSKNIFE_LIVE_CLICK_E2E_PORT',
  '--preferred',
  '3011',
  '--',
  process.execPath,
  path.join(projectRoot, 'scripts', 'run_playwright_test.mjs'),
  'test',
  '-c',
  'build-tools/configs/playwright.live-click.config.ts',
  'test/e2e/virtual-desktop-live-click.spec.ts',
  '--reporter=line',
], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, VDL_LIVE_CLICK_TARGET: target },
});

if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}
process.exit(child.status ?? 1);

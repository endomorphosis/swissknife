#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const playwrightCli = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const commandArgs = process.argv.slice(2);
const args = commandArgs.length > 0 ? commandArgs : ['test'];

ensureE2EDependencies();
runPlaywright(args);

function ensureE2EDependencies() {
  if (hasE2EDependencies()) {
    return;
  }

  if (process.env.SWISSKNIFE_E2E_NO_BOOTSTRAP === 'true') {
    console.error('Missing local E2E dependencies and bootstrap is disabled.');
    console.error('Run `npm install --package-lock=false --include=dev` from swissknife.');
    process.exit(1);
  }

  console.warn('Local Playwright test dependencies are missing; bootstrapping swissknife npm dependencies.');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const status = run(npm, [
    'install',
    '--package-lock=false',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
    '--include=dev',
  ], {
    SKIP_POSTINSTALL: 'true',
    SKIP_SUBMODULE_INSTALL: 'true',
  });

  if (status !== 0) {
    process.exit(status);
  }

  if (!hasE2EDependencies()) {
    console.error('E2E dependency bootstrap completed but @playwright/test is still unavailable.');
    process.exit(1);
  }
}

function hasE2EDependencies() {
  return fs.existsSync(playwrightCli);
}

function runPlaywright(playwrightArgs) {
  const status = run(process.execPath, [playwrightCli, ...playwrightArgs]);
  process.exit(status);
}

function run(command, runArgs, extraEnv = {}) {
  const result = spawnSync(command, runArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return typeof result.status === 'number' ? result.status : 1;
}

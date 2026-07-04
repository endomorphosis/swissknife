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
const CHROMIUM_UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
  10080,
]);

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
  const status = run(process.execPath, [playwrightCli, ...playwrightArgs], playwrightEnv(playwrightArgs));
  process.exit(status);
}

function playwrightEnv(playwrightArgs) {
  if (!usesMetaGlassesConfig(playwrightArgs)) {
    return {};
  }

  const port = process.env.SWISSKNIFE_META_GLASSES_E2E_PORT
    || process.env.SWISSKNIFE_E2E_PORT
    || String(stablePortForPath(projectRoot));

  return {
    SWISSKNIFE_META_GLASSES_E2E_PORT: port,
    SWISSKNIFE_E2E_PORT: process.env.SWISSKNIFE_E2E_PORT || port,
  };
}

function usesMetaGlassesConfig(playwrightArgs) {
  return playwrightArgs.some((arg, index) => {
    if (arg.includes('playwright.meta-glasses.config.ts')) {
      return true;
    }
    if ((arg === '-c' || arg === '--config') && playwrightArgs[index + 1]) {
      return playwrightArgs[index + 1].includes('playwright.meta-glasses.config.ts');
    }
    return false;
  });
}

function stablePortForPath(seedPath) {
  let hash = 0;
  for (const char of seedPath) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2000;
  }
  return browserSafePort(3100 + hash);
}

function browserSafePort(port) {
  let candidate = port;
  while (CHROMIUM_UNSAFE_PORTS.has(candidate)) {
    candidate += 1;
  }
  return candidate;
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

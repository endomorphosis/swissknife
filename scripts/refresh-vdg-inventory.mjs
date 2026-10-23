#!/usr/bin/env node
/** Serialize source-bound live DOM inventory production across family workers. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { inspectInventory, roots } = require('./vdg-inventory-contract.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = fileURLToPath(import.meta.url);
const LOCKED_ENTRY = 'const module = await import(process.argv[2]); process.exitCode = await module.refreshUnderLock(JSON.parse(process.argv[3]));';

// Keep the lock owner alive while its producer handles cancellation. In
// particular a timeout must not release the lock before browser cleanup ends.
export function runInventoryChild(command, args, options) {
  return new Promise(resolve => {
    let child, deadline, escalation, terminal;
    const stop = status => {
      if (terminal !== undefined) return;
      terminal = status;
      child?.kill('SIGTERM');
      escalation = setTimeout(() => child?.kill('SIGKILL'), 25000);
    };
    const terminate = () => stop(143), interrupt = () => stop(130);
    const finish = result => {
      clearTimeout(deadline); clearTimeout(escalation);
      process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', interrupt);
      resolve({ ...result, status: terminal ?? result.status });
    };
    try {
      child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: 'inherit', shell: false });
      child.once('error', error => finish({ error, status: 1 }));
      child.once('close', (code, signal) => finish({ status: Number.isInteger(code) ? code : signal === 'SIGTERM' ? 143 : 1 }));
      process.once('SIGTERM', terminate); process.once('SIGINT', interrupt);
      deadline = setTimeout(() => stop(124), options.timeout);
    } catch (error) { finish({ error, status: 1 }); }
  });
}

export function parseArguments(argv) {
  if (new Set(argv).size !== argv.length || argv.some(arg => !['--check', '--if-stale'].includes(arg)) || argv.length > 1) {
    throw new Error('usage: refresh-vdg-inventory.mjs [--check|--if-stale]');
  }
  return { check: argv.includes('--check'), ifStale: argv.includes('--if-stale') };
}
function exitStatus(result) {
  return !result.error && result.status === 0 ? 0 : Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
}

// Invoked by the fixed flock command below. Recheck after acquiring the lock.
export async function refreshUnderLock(settings = {}, dependencies = {}) {
  const locations = roots(settings);
  const inspect = dependencies.inspectInventory || inspectInventory;
  if (settings.ifStale && inspect(locations).current === true) return 0;
  const execute = dependencies.spawnSync || dependencies.runChild || runInventoryChild;
  const env = { ...(dependencies.env || process.env), VDG_EVIDENCE_ROOT: locations.evidenceRoot,
    SWISSKNIFE_RENDERED_CENSUS_PORT: '3031',
    RENDERED_CENSUS_OUT: path.join(locations.evidenceRoot, 'vdg/inventory/rendered-control-census.json') };
  for (const [script, args, timeout] of [
    ['run-rendered-census.mjs', [], 600000],
    ['refresh-vdg-owner-discovery.cjs', [], 120000],
    ['prepare-vdg-rendered-inputs.cjs', ['--fresh-source'], 120000],
  ]) {
    const status = exitStatus(await execute(process.execPath, [path.join(root, 'scripts', script), ...args], {
      cwd: root, env, stdio: 'inherit', shell: false, timeout, killSignal: 'SIGTERM',
    }));
    if (status !== 0) return status;
  }
  const result = inspect(locations);
  if (result.current === true) return 0;
  dependencies.log?.(`VDG inventory refresh did not establish a current inventory: ${result.reason}`);
  return 75;
}

export async function runLockedRefresh(settings = {}, dependencies = {}) {
  const locations = roots(settings);
  const lock = path.join(locations.evidenceRoot, 'vdg/inventory/refresh.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  // Keep this inode after release so waiting workers acquire the same lock.
  // --no-fork makes the Node owner retain it through all production stages.
  const execute = dependencies.spawnSync || dependencies.runChild || runInventoryChild;
  return exitStatus(await execute('/usr/bin/flock', [
    '--exclusive', '--wait', '900', '--conflict-exit-code', '75', '--no-fork', lock,
    process.execPath, '--input-type=module', '--eval', LOCKED_ENTRY,
    'vdg-inventory-lock-owner', dependencies.lockedModule || filename,
    JSON.stringify({ ...locations, ifStale: Boolean(settings.ifStale) }),
  ], { cwd: root, env: dependencies.env || process.env, stdio: 'inherit', shell: false,
    timeout: 1770000, killSignal: 'SIGTERM' }));
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const settings = parseArguments(argv);
  const locations = roots(dependencies);
  const inspect = dependencies.inspectInventory || inspectInventory;
  if (settings.check || settings.ifStale) {
    const result = inspect(locations);
    if (result.current === true) return 0;
    if (settings.check) {
      (dependencies.log || console.error)(`VDG inventory stale: ${result.reason}`);
      return 75;
    }
  }
  return (dependencies.runLockedRefresh || runLockedRefresh)({ ...settings, ...locations }, dependencies);
}
if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

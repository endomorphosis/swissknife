#!/usr/bin/env node
/** Acquire both transports for every family with at most three family owners.
 * Acquisition is source-bound collection, never GUI/tool acceptance authority.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { constants } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { FAMILIES } = require('./vdg-evidence.cjs');
const { checkCapture } = require('./check-vdg-capture.cjs');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FAMILY_NAMES = Object.freeze(Object.keys(FAMILIES));
export const TRANSPORTS = Object.freeze(['http', 'libp2p']);
const usage = 'usage: run-vdg-all-families.mjs [--check] [--fresh] [--concurrency 1|2|3] [--timeout-seconds 1..22200]';

function validateOptions(options = {}) {
  const result = { concurrency: 3, timeoutSeconds: 1800, fresh: false, check: false, ...options };
  if (!Number.isInteger(result.concurrency) || result.concurrency < 1 || result.concurrency > 3
    || !Number.isInteger(result.timeoutSeconds) || result.timeoutSeconds < 1 || result.timeoutSeconds > 22200
    || typeof result.fresh !== 'boolean' || typeof result.check !== 'boolean' || (result.check && result.fresh)) throw new Error(usage);
  return result;
}
export function parseArguments(argv) {
  const options = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (seen.has(argument)) throw new Error(usage);
    seen.add(argument);
    if (argument === '--fresh') options.fresh = true;
    else if (argument === '--check') options.check = true;
    else if (argument === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (argument === '--timeout-seconds') options.timeoutSeconds = Number(argv[++index]);
    else throw new Error(usage);
  }
  return validateOptions(options);
}

/** Own only this worker's process group; a timed-out zero exit stays timeout. */
export function runChild(executable, args, options = {}) {
  if (options.signal?.aborted) return Promise.resolve({ status: 143, signal: 'SIGTERM' });
  return new Promise(resolve => {
    let child;
    let timeout;
    let escalation;
    let terminalStatus;
    let settled = false;
    const grouped = process.platform !== 'win32';
    const signal = name => {
      if (!child?.pid) return;
      try { grouped ? process.kill(-child.pid, name) : child.kill(name); }
      catch (error) { if (error.code !== 'ESRCH') options.log?.(`worker signal failed: ${error.message}`); }
    };
    const stop = status => {
      if (terminalStatus !== undefined) return;
      terminalStatus = status;
      signal('SIGTERM');
      escalation = setTimeout(() => signal('SIGKILL'), 5000);
    };
    const abort = () => stop(143);
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(escalation);
      options.signal?.removeEventListener('abort', abort);
      // A leader exiting on TERM must not leave resistant children behind.
      if (terminalStatus !== undefined || result.status !== 0) {
        signal('SIGTERM');
        signal('SIGKILL');
      }
      resolve({ ...result, status: terminalStatus ?? result.status });
    };
    try {
      child = spawn(executable, args, { cwd: options.cwd || projectRoot, env: options.env || process.env,
        stdio: 'inherit', shell: false, detached: grouped });
      child.once('error', error => finish({ status: 1, error: error.message }));
      child.once('close', (code, receivedSignal) => finish({
        status: Number.isInteger(code) ? code : 128 + (constants.signals[receivedSignal] || 1), signal: receivedSignal,
      }));
      timeout = setTimeout(() => stop(124), (options.timeoutSeconds || 1800) * 1000);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
    } catch (error) { finish({ status: 1, error: error.message }); }
  });
}

export function checkAllCaptures(options = {}, dependencies = {}) {
  const checker = dependencies.checkCapture || checkCapture;
  const captures = [];
  for (const family of FAMILY_NAMES) {
    for (const transport of TRANSPORTS) {
      try {
        const proof = checker(family, transport, { evidenceRoot: dependencies.evidenceRoot, sourceRoot: dependencies.sourceRoot });
        if (proof?.capture_complete !== true || proof.family !== family || proof.transport !== transport) throw new Error('capture checker did not verify the requested acquisition');
        captures.push(proof);
      } catch (error) { captures.push({ family, transport, capture_complete: false, reason: error.message }); }
    }
  }
  return { schema: 'swissknife.vdg-all-family-acquisition.v1',
    acquisition_complete: captures.length === FAMILY_NAMES.length * TRANSPORTS.length && captures.every(item => item.capture_complete),
    acceptance_decision: 'not_evaluated', captures, work_complete: false, completion_authority: false };
}

export async function runAllFamilies(options = {}, dependencies = {}) {
  const settings = validateOptions(options);
  if (settings.check) {
    const summary = checkAllCaptures(settings, dependencies);
    return { ...summary, exit_code: summary.acquisition_complete ? 0 : 75, workers: [] };
  }
  const execute = dependencies.runChild || runChild;
  const checker = dependencies.checkCapture || checkCapture;
  const executable = dependencies.execPath || process.execPath;
  const runner = dependencies.workerScript || path.join(projectRoot, 'scripts/run-vdg-family.mjs');
  const workers = [];
  let cursor = 0;
  const consume = async () => {
    while (!dependencies.signal?.aborted) {
      const family = FAMILY_NAMES[cursor++];
      if (!family) break;
      // A family owns one connector target. Never overlap its transports.
      for (const transport of TRANSPORTS) {
        if (dependencies.signal?.aborted) break;
        if (!settings.fresh) {
          try {
            const proof = checker(family, transport, { evidenceRoot: dependencies.evidenceRoot, sourceRoot: dependencies.sourceRoot });
            if (proof?.capture_complete !== true || proof.family !== family || proof.transport !== transport) throw new Error('invalid acquisition');
            workers.push({ family, transport, exit_code: 0, reused: true });
            dependencies.log?.(`VDG acquisition reused ${family} ${transport}`);
            continue;
          } catch { /* Only the stale or missing transport needs collection. */ }
        }
        const args = [runner, family, transport, '--capture-only', ...(settings.fresh ? ['--fresh'] : [])];
        dependencies.log?.(`VDG acquisition start ${family} ${transport}`);
        let result;
        try {
          result = await execute(executable, args, { cwd: projectRoot, env: dependencies.env || process.env,
            timeoutSeconds: settings.timeoutSeconds, signal: dependencies.signal, log: dependencies.log });
        } catch (error) { result = { status: 1, error: error.message }; }
        const status = Number.isInteger(result?.status) && result.status >= 0 ? result.status : 1;
        workers.push({ family, transport, exit_code: status, ...(result?.error ? { error: result.error } : {}) });
        dependencies.log?.(`VDG acquisition finished ${family} ${transport} exit=${status}`);
      }
    }
  };
  await Promise.all(Array.from({ length: settings.concurrency }, consume));
  // Recheck every cell against current sources after all writers finish.
  // Successful subprocess exits alone never establish acquisition completion.
  const summary = checkAllCaptures(settings, dependencies);
  workers.sort((left, right) => FAMILY_NAMES.indexOf(left.family) - FAMILY_NAMES.indexOf(right.family)
    || TRANSPORTS.indexOf(left.transport) - TRANSPORTS.indexOf(right.transport));
  const failure = workers.find(worker => worker.exit_code !== 0);
  return { ...summary, acquisition_complete: summary.acquisition_complete && workers.length === FAMILY_NAMES.length * TRANSPORTS.length && !failure,
    exit_code: failure?.exit_code ?? (dependencies.signal?.aborted ? 143 : summary.acquisition_complete ? 0 : 75), workers };
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const settings = parseArguments(argv);
  const ensureInventory = dependencies.ensureInventory || require('./vdg-inventory-contract.cjs').ensureInventory;
  const status = ensureInventory({ check: settings.check, sourceRoot: dependencies.sourceRoot || projectRoot,
    evidenceRoot: dependencies.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || path.join(projectRoot, 'test-results/virtual-desktop-ipfs-mcp-orb'),
    env: dependencies.env || process.env });
  if (status !== 0) return Number.isInteger(status) && status > 0 ? status : 1;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const summary = await runAllFamilies(settings, { log: message => console.log(message), ...dependencies,
      signal: dependencies.signal || controller.signal });
    console.log(JSON.stringify(summary));
    return summary.exit_code;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

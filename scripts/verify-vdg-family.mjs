#!/usr/bin/env node
/** Refresh missing/stale acquisitions, then apply the full family GO gate. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILY_NAMES, TRANSPORTS, runChild } from './run-vdg-all-families.mjs';

const require = createRequire(import.meta.url);
const { checkCapture } = require('./check-vdg-capture.cjs');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = `usage: verify-vdg-family.mjs <${FAMILY_NAMES.join('|')}> [--check] [--timeout-seconds 1..22200]`;

export function parseArguments(argv) {
  const [family, ...extra] = argv;
  const options = { family, check: false, timeoutSeconds: 1800 };
  const seen = new Set();
  for (let index = 0; index < extra.length; index += 1) {
    const argument = extra[index];
    if (seen.has(argument)) throw new Error(usage);
    seen.add(argument);
    if (argument === '--check') options.check = true;
    else if (argument === '--timeout-seconds') options.timeoutSeconds = Number(extra[++index]);
    else throw new Error(usage);
  }
  if (!FAMILY_NAMES.includes(family) || !Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 1 || options.timeoutSeconds > 22200) throw new Error(usage);
  return options;
}

export async function verifyFamily(options, dependencies = {}) {
  const settings = parseArguments([options.family, ...(options.check ? ['--check'] : []),
    '--timeout-seconds', String(options.timeoutSeconds ?? 1800)]);
  const checker = dependencies.checkCapture || checkCapture;
  const execute = dependencies.runChild || runChild;
  const executable = dependencies.execPath || process.execPath;
  const acquisitions = [];
  let firstFailure;
  const run = async args => {
    try {
      const result = await execute(executable, args, { cwd: projectRoot, env: dependencies.env || process.env,
        timeoutSeconds: args[0].endsWith('check-vdg-family-evidence.cjs') ? Math.min(settings.timeoutSeconds, 300) : settings.timeoutSeconds,
        signal: dependencies.signal, log: dependencies.log });
      return Number.isInteger(result?.status) && result.status >= 0 ? result.status : 1;
    } catch (error) { dependencies.log?.(error.message); return 1; }
  };
  if (!settings.check) {
    // A transport acquisition never waits for acceptance of the other one.
    for (const transport of TRANSPORTS) {
      if (dependencies.signal?.aborted) break;
      const inspect = () => {
        const proof = checker(settings.family, transport, { evidenceRoot: dependencies.evidenceRoot, sourceRoot: dependencies.sourceRoot });
        if (proof?.capture_complete !== true || proof.family !== settings.family || proof.transport !== transport) throw new Error('capture checker did not verify the requested acquisition');
        return proof;
      };
      try {
        inspect(); acquisitions.push({ transport, reused: true, capture_complete: true });
        continue;
      } catch { /* A source change or missing report needs one new capture. */ }
      const status = await run([path.join(projectRoot, 'scripts/run-vdg-family.mjs'), settings.family, transport, '--capture-only']);
      let complete = false;
      let reason;
      try { inspect(); complete = true; } catch (error) { reason = error.message; }
      const outcome = status || (complete ? 0 : 75);
      if (outcome !== 0 && firstFailure === undefined) firstFailure = outcome;
      acquisitions.push({ transport, reused: false, capture_complete: complete, exit_code: outcome, ...(reason ? { reason } : {}) });
    }
  }
  const strictStatus = dependencies.signal?.aborted ? 143 : await run([
    path.join(projectRoot, 'scripts/check-vdg-family-evidence.cjs'), settings.family, ...(settings.check ? ['--check'] : []),
  ]);
  return { schema: 'swissknife.vdg-family-verification.v1', family: settings.family,
    acquisitions, strict_exit_code: strictStatus, exit_code: firstFailure ?? strictStatus,
    work_complete: false, completion_authority: false };
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
    const result = await verifyFamily(settings, { log: message => console.log(message), ...dependencies,
      signal: dependencies.signal || controller.signal });
    console.log(JSON.stringify(result));
    return result.exit_code;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

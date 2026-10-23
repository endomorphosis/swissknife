#!/usr/bin/env node
/** Strengthen existing commands with a source-bound public-input check. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { constants } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Final pins are installed only after reviewed candidate source is frozen.
export const EXPECTED_SOURCE_PINS = Object.freeze({
  'scripts/vdg-openrouter-catalog-input.cjs': '320201344c87a2a17e575d83e67cde129e8d10b457453b1e87c60e7887f5b2ea',
  'web/js/apps/openrouter.js': '294342a920e7d33729f2b4afdb3c8c352f1c080fc5897f901e2cd0c9225b579a',
});
const approved = [
  ['node', 'swissknife/scripts/run-vdg-all-families.mjs', '--timeout-seconds', '22200'],
  ['node', 'swissknife/scripts/run-vdg-all-families.mjs', '--check'],
  ...['http', 'libp2p'].flatMap(transport => [
    ['node', 'swissknife/scripts/run-vdg-family.mjs', 'vdg-local', transport, '--capture-only'],
    ['node', 'swissknife/scripts/check-vdg-capture.cjs', 'vdg-local', transport],
  ]),
  ['node', 'swissknife/scripts/verify-vdg-family.mjs', 'vdg-local', '--timeout-seconds', '22200'],
  ['node', 'swissknife/scripts/verify-vdg-family.mjs', 'vdg-local', '--check'],
  ['node', 'swissknife/scripts/build-gui-mcp-coverage.cjs', '--require-go'],
  ['python3', 'swissknife/scripts/vdg_closeout_requires_go.py'],
];
export function parseArguments(argv) {
  if (argv[0] !== '--' || !approved.some(candidate => JSON.stringify(candidate) === JSON.stringify(argv.slice(1)))) {
    throw Error('VDG Local catalog input: wrapper requires -- followed by an exact reviewed acquisition, Local, aggregate, or closeout command');
  }
  return argv.slice(1);
}
export function snapshotEnvironment(env = process.env) {
  if (Object.hasOwn(env, 'VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT') && env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT !== '1') {
    throw Error('VDG Local catalog input: an explicit conflicting snapshot mode is refused');
  }
  return { ...env, VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT: '1' };
}
export function verifySourcePins(root = projectRoot, pins = EXPECTED_SOURCE_PINS) {
  const required = ['scripts/vdg-openrouter-catalog-input.cjs', 'web/js/apps/openrouter.js'];
  if (JSON.stringify(Object.keys(pins).sort()) !== JSON.stringify(required.sort())) throw Error('VDG Local catalog input: invalid reviewed source pin contract');
  for (const [relative, expected] of Object.entries(pins)) {
    if (!/^[a-f0-9]{64}$/.test(expected || '')) throw Error('VDG Local catalog input: final source pins are not installed');
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
    if (actual !== expected) throw Error(`VDG Local catalog input: reviewed source bytes changed: ${relative}`);
  }
}
/** No extra runtime deadline: the existing original worker and lane retain theirs. */
export function runOriginal(argv, options = {}) {
  if (options.signal?.aborted) return Promise.resolve(143);
  return new Promise(resolve => {
    let child, escalation, terminal, settled = false;
    const grouped = process.platform !== 'win32';
    const signalChild = name => {
      if (!child?.pid) return;
      try { grouped ? process.kill(-child.pid, name) : child.kill(name); }
      catch (error) { if (error.code !== 'ESRCH') options.log?.(`Owned original command signal failed: ${error.message}`); }
    };
    const stop = signal => {
      if (terminal !== undefined) return;
      terminal = 128 + (constants.signals[signal] || 1);
      signalChild(signal);
      escalation = setTimeout(() => signalChild('SIGKILL'), options.stopGraceMs ?? 5000);
    };
    const onTerm = () => stop('SIGTERM'), onInt = () => stop('SIGINT');
    const onAbort = () => stop('SIGTERM');
    const finish = status => {
      if (settled) return;
      settled = true; clearTimeout(escalation);
      process.off('SIGTERM', onTerm); process.off('SIGINT', onInt);
      options.signal?.removeEventListener('abort', onAbort);
      // A stopped leader cannot leave a resistant child in its owned group.
      signalChild('SIGTERM'); signalChild('SIGKILL');
      resolve(terminal ?? status);
    };
    try {
      child = (options.spawn || spawn)(argv[0], argv.slice(1), {
        cwd: options.cwd || path.resolve(projectRoot, '..'), env: options.env || process.env,
        stdio: options.stdio || 'inherit', shell: false, detached: grouped,
      });
      child.once('error', error => { options.log?.(error.message); finish(1); });
      child.once('close', (code, signal) => finish(Number.isInteger(code) ? code : 128 + (constants.signals[signal] || 1)));
      process.once('SIGTERM', onTerm); process.once('SIGINT', onInt);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
    } catch (error) { options.log?.(error.message); finish(1); }
  });
}
export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const original = parseArguments(argv);
  const env = snapshotEnvironment(dependencies.env || process.env);
  const root = dependencies.projectRoot || projectRoot;
  // Check bytes before importing the executable validator or spawning a child.
  (dependencies.verifySourcePins || verifySourcePins)(root);
  const guard = dependencies.guard || require(path.join(root, 'scripts/vdg-openrouter-catalog-input.cjs'));
  const contract = guard.assertLocalCatalogInput({ projectRoot: root, env });
  guard.assertCatalogInventory(contract, { projectRoot: root });
  return (dependencies.runOriginal || runOriginal)(original, { cwd: path.resolve(root, '..'), env,
    signal: dependencies.signal, log: message => console.error(message) });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error.message); process.exitCode = 75; }
}

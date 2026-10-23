#!/usr/bin/env node
/** Real family capture on an owned port; unchanged failed evidence is a cheap
 * semantic wait. --fresh recaptures after an external backend repair.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { FAMILIES, EVIDENCE_ROOT } = require('./vdg-evidence.cjs');
const { captureInputFingerprint: fingerprintInputs } = require('./vdg-capture-fingerprint.cjs');
const { checkCapture } = require('./check-vdg-capture.cjs');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = `usage: node scripts/run-vdg-family.mjs <${Object.keys(FAMILIES).join('|')}> <http|libp2p> [--list] [--fresh] [--capture-only]`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function parseArguments(argv) {
  const [family, transport, ...extra] = argv;
  if (!Object.hasOwn(FAMILIES, family || '') || !['http', 'libp2p'].includes(transport)
    || extra.some(arg => !['--list', '--fresh', '--capture-only'].includes(arg)) || new Set(extra).size !== extra.length) throw new Error(usage);
  return { family, transport, list: extra.includes('--list'), fresh: extra.includes('--fresh'), captureOnly: extra.includes('--capture-only') };
}
function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return null; }
}
function fileHash(filename) {
  try { return hash(fs.readFileSync(filename)); } catch { return 'missing'; }
}
export function captureInputFingerprint(family, transport, options = {}) {
  return fingerprintInputs(family, transport, { ...options, definition: FAMILIES[family] });
}

function registeredRuns(evidenceRoot, target) {
  const manifest = readJson(path.join(evidenceRoot, 'vdg/connectors', `${target}.json`));
  return manifest?.schema === 'swissknife.virtual-desktop-gui-mcp-connectors.v1' && manifest.target === target && Array.isArray(manifest.runs) ? manifest.runs : [];
}
function completeRun(evidenceRoot, target, run, startedAt = 0) {
  if (!/^[a-z][a-z0-9-]*$/.test(run?.run_id || '') || run.capture_complete !== true || run.report_path !== `vdg/runs/${run.run_id}.json`
    || !run.run_id.startsWith(`${target}-`) || !Number.isFinite(Date.parse(run.completed_at)) || Date.parse(run.completed_at) < startedAt) return false;
  const report = readJson(path.join(evidenceRoot, run.report_path));
  return report?.schema === 'swissknife.virtual-desktop-live-click.v1' && report.target === target
    && Number.isFinite(Date.parse(report.generated_at)) && Date.parse(report.generated_at) >= startedAt
    && Array.isArray(report.rows) && report.rows.length > 0 && report.row_count === report.rows.length
    && !report.rows.some(row => Array.isArray(row.failure_reasons) && row.failure_reasons.includes('runner-failed'));
}
function familyWithheld(evidenceRoot, options, startedAt) {
  const report = readJson(path.join(evidenceRoot, 'vdg/families', `${FAMILIES[options.family].target}.json`));
  return report?.family === options.family && report.decision === 'no_go' && report.passed === false
    && Number.isFinite(Date.parse(report.generated_at)) && Date.parse(report.generated_at) >= startedAt ? report : null;
}

export function runFamily(options, dependencies = {}) {
  const spawn = dependencies.spawnSync || spawnSync;
  const executable = dependencies.execPath || process.execPath;
  const evidenceRoot = path.resolve(dependencies.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT);
  const target = FAMILIES[options.family].target;
  const previous = new Set(registeredRuns(evidenceRoot, target).map(run => run.run_id));
  const startedAt = Date.now();
  const fingerprint = captureInputFingerprint(options.family, options.transport, { evidenceRoot, sourceRoot: dependencies.sourceRoot });
  const env = { ...(dependencies.env || process.env), VDG_CAPTURE_FAMILY: target, VDG_CAPTURE_TRANSPORT: options.transport, VDG_EVIDENCE_REPLAY: '0', VDG_CAPTURE_INPUT_FINGERPRINT: fingerprint, VDG_CAPTURE_FORCE_FRESH: options.fresh ? '1' : '0' };
  const acquisition = (fresh = false) => {
    const receipt = checkCapture(options.family, options.transport, { evidenceRoot, sourceRoot: dependencies.sourceRoot, ...(fresh ? { startedAfter: startedAt } : {}) });
    if (fresh && previous.has(receipt.run_id)) throw new Error('new acquisition did not register a new transport run');
    return receipt;
  };
  if (options.captureOnly && !options.list && !options.fresh) {
    try { console.log(JSON.stringify(acquisition())); return 0; } catch { /* Capture a missing or stale acquisition. */ }
  }
  const refreshCoverage = () => {
    const result = spawn(executable, [path.join(projectRoot, 'scripts/build-gui-mcp-coverage.cjs')], { cwd: projectRoot, stdio: 'inherit', env, shell: false });
    if (result.error) console.error(result.error.message);
    return !result.error && Number.isInteger(result.status) ? result.status : 1;
  };
  const cacheFile = path.join(evidenceRoot, 'vdg/capture-cache', `${target}-${options.transport}.json`);
  const cache = readJson(cacheFile);
  const cachedRun = registeredRuns(evidenceRoot, target).find(run => run.run_id === cache?.run_id);
  if (!options.captureOnly && !options.list && !options.fresh && cache?.schema === 'swissknife.vdg-failed-capture-cache.v1'
    && cache.family === options.family && cache.transport === options.transport && cache.decision === 'no_go'
    && cache.input_fingerprint === fingerprint && completeRun(evidenceRoot, target, cachedRun)
    && cache.report_sha256 === fileHash(path.join(evidenceRoot, cachedRun.report_path))) {
    const aggregateStatus = refreshCoverage();
    if (aggregateStatus !== 0) return aggregateStatus;
    const withheld = familyWithheld(evidenceRoot, options, startedAt);
    if (withheld) {
      console.log(JSON.stringify({ decision: 'no_go', family: options.family, reason: 'unchanged_capture_evidence_withheld', gap_count: withheld.gap_count, input_fingerprint: fingerprint }));
      return 75;
    }
    // A successful result is never granted by the failed-capture cache.
  }
  const args = [
    path.join(projectRoot, 'scripts/run-with-owned-port.mjs'), '--env-var', 'SWISSKNIFE_VDG_E2E_PORT', '--preferred', String(3021 + Object.keys(FAMILIES).indexOf(options.family) * 100), '--',
    executable, path.join(projectRoot, 'scripts/run_playwright_test.mjs'),
    'test', '-c', 'build-tools/configs/playwright.vdg.config.ts', `test/e2e/families/${FAMILIES[options.family].spec}`,
    '--grep', `\\b${options.family}\\b`, '--reporter=line', ...(options.list ? ['--list'] : []),
  ];
  const capture = spawn(executable, args, { cwd: projectRoot, stdio: 'inherit', env, shell: false });
  if (capture.error) console.error(capture.error.message);
  const captureStatus = Number.isInteger(capture.status) ? capture.status : 1;
  if (options.list) return captureStatus;
  const aggregateStatus = refreshCoverage();
  if (options.captureOnly) {
    if (capture.error || aggregateStatus !== 0) return captureStatus || aggregateStatus || 1;
    try { console.log(JSON.stringify(acquisition(true))); return 0; }
    catch (error) { console.error(error.message); return captureStatus || 75; }
  }
  const freshRun = registeredRuns(evidenceRoot, target).find(run => !previous.has(run.run_id) && completeRun(evidenceRoot, target, run, startedAt));
  const withheld = familyWithheld(evidenceRoot, options, startedAt);
  if (!capture.error && aggregateStatus === 0 && freshRun && withheld) {
    // Cache only a completed failed acceptance result, bound to source bytes
    // and this exact run. Infrastructure failures and GO are never cached.
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, `${JSON.stringify({ schema: 'swissknife.vdg-failed-capture-cache.v1', family: options.family,
      transport: options.transport, decision: 'no_go', input_fingerprint: fingerprint, run_id: freshRun.run_id,
      report_sha256: fileHash(path.join(evidenceRoot, freshRun.report_path)), cached_at: new Date().toISOString(),
      completion_authority: false }, null, 2)}\n`);
    console.log(JSON.stringify({ decision: 'no_go', family: options.family, reason: 'fresh_capture_evidence_withheld', capture_exit: captureStatus, gap_count: withheld.gap_count }));
    return 75;
  }
  return captureStatus !== 0 ? captureStatus : aggregateStatus;
}

export function main(argv = process.argv.slice(2), dependencies = {}) {
  const settings = parseArguments(argv);
  if (!settings.list) {
    const ensureInventory = dependencies.ensureInventory || require('./vdg-inventory-contract.cjs').ensureInventory;
    const status = ensureInventory({ check: false, sourceRoot: dependencies.sourceRoot || projectRoot,
      evidenceRoot: dependencies.evidenceRoot || process.env.VDG_EVIDENCE_ROOT || EVIDENCE_ROOT,
      env: dependencies.env || process.env });
    if (status !== 0) return Number.isInteger(status) && status > 0 ? status : 1;
  }
  return runFamily(settings, dependencies);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

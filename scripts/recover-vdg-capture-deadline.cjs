#!/usr/bin/env node
'use strict';
/** Discard infrastructure-interrupted reuse proof; never create acquisition or GO.
 * No capture source, image, report, row, or input fingerprint is rewritten.
 * applyRecovery is called only by the supervisor's independently fenced hook.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const compact = value => Buffer.from(JSON.stringify(value));
const encoded = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const check = (value, reason) => { if (!value) throw new Error(reason); };
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const authority = { work_complete: false, completion_authority: false, gui_acceptance: false };
function regular(filename) {
  const info = fs.lstatSync(filename);
  check(info.isFile() && info.uid === process.getuid() && info.nlink === 1, `unsafe owned regular file: ${filename}`);
  return fs.readFileSync(filename);
}
function local(root, relative) {
  check(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..') && !relative.includes('\\'), 'unsafe artifact path');
  const file = path.join(root, relative);
  check(file.startsWith(`${path.resolve(root)}${path.sep}`), 'artifact escapes root');
  return file;
}
function durable(filename, bytes, exclusive = false) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const tmp = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    if (exclusive) { fs.linkSync(tmp, filename); fs.unlinkSync(tmp); }
    else fs.renameSync(tmp, filename);
    const parent = fs.openSync(path.dirname(filename), 'r');
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function image(artifactRoot, relative, expected) {
  check(hex(expected), 'PNG is not hash-bound');
  const bytes = regular(local(artifactRoot, relative));
  check(sha(bytes) === expected, `original PNG hash changed: ${relative}`);
  check(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.subarray(12, 16).toString() === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, 'original PNG header invalid');
}
function isGlobalTestDeadline(reason, milliseconds) {
  if (typeof reason !== 'string') return false;
  // Playwright prefixes its global context-close reason with the API that was
  // awaiting at teardown. Ordinary locator/action and 45s row budgets differ.
  const firstLine = reason.split(/\r?\n/, 1)[0];
  const match = /^(?:(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*: )?Test timeout of ([1-9][0-9]*)ms exceeded\.$/.exec(firstLine);
  return Boolean(match && Number(match[1]) === milliseconds);
}
function replayableGlobalTestDeadline(reason, milliseconds) {
  if (!isGlobalTestDeadline(reason, milliseconds)) return false;
  const newline = reason.search(/\r?\n/);
  return newline < 0 || /^\r?\nCall log:\r?\n[\s\S]*$/.test(reason.slice(newline));
}
function hasGlobalTestDeadline(row, milliseconds) {
  return [row.failure_reasons, row.pageerrors].some(values => Array.isArray(values)
    && values.some(reason => isGlobalTestDeadline(reason, milliseconds)));
}
function noActionDeadline(row, milliseconds) {
  return Array.isArray(row.failure_reasons) && row.failure_reasons.length === 1
    && replayableGlobalTestDeadline(row.failure_reasons[0], milliseconds)
    && row.clicked === false && row.visibility === 'not-launched' && row.icon_visible === false
    && row.window_box === null && row.mcp_call_count === 0 && row.observation === null
    && (!row.observations || Array.isArray(row.observations) && row.observations.length === 0)
    && (!row.incomplete_mcp_call_count) && Array.isArray(row.pageerrors) && row.pageerrors.length === 0
    && ['screenshot_before', 'screenshot_after', 'screenshot_before_check', 'screenshot_after_check', 'result_surface'].every(key => row[key] === '')
    && row.confirm_surface === false;
}
function verifySuccessfulRow(row, payload, artifactRoot) {
  check(row.clicked === true && row.visibility === 'visible' && Array.isArray(row.failure_reasons) && row.failure_reasons.length === 0
    && Array.isArray(row.pageerrors) && row.pageerrors.length === 0 && row.mcp_call_count === 0 && row.observation === null
    && (!row.observations || row.observations.length === 0) && (!row.incomplete_mcp_call_count), 'semantic failure or unverified action cannot be discarded');
  check(row.screenshot_before && row.screenshot_before_check === 'png-ok', 'successful row lacks original before PNG');
  image(artifactRoot, row.screenshot_before, payload.image_hashes?.[row.screenshot_before]);
  if (row.screenshot_after) {
    check(row.screenshot_after_check === 'png-ok', 'successful row has invalid after PNG status');
    image(artifactRoot, row.screenshot_after, payload.image_hashes?.[row.screenshot_after]);
  } else check(row.screenshot_after_check === 'window-dismissed', 'successful row lacks original after PNG');
}
function sourceState({ projectRoot, evidenceRoot, family, transport }) {
  projectRoot = path.resolve(projectRoot);
  evidenceRoot = path.resolve(evidenceRoot || path.join(projectRoot, 'test-results/virtual-desktop-ipfs-mcp-orb'));
  const { FAMILIES } = require(path.join(projectRoot, 'scripts/vdg-evidence.cjs'));
  const { captureInputFingerprint } = require(path.join(projectRoot, 'scripts/vdg-capture-fingerprint.cjs'));
  const definition = FAMILIES[family];
  // Local has no MCP calls. Extending this to another family requires independent
  // correlation/receipt ownership filtering, not carrying all observations forward.
  check(family === 'vdg-local' && definition?.target === 'local' && ['http', 'libp2p'].includes(transport), 'only declared Local transports are supported');
  const spec = regular(path.join(projectRoot, 'test/e2e/families', definition.spec)).toString();
  const deadlines = [...spec.matchAll(/test\.setTimeout\(([\d_]+)\)/g)];
  check(deadlines.length === 1, 'capture has no unique explicit test deadline');
  const milliseconds = Number(deadlines[0][1].replaceAll('_', ''));
  check(Number.isSafeInteger(milliseconds) && milliseconds > 0, 'invalid explicit test deadline');
  return { projectRoot, evidenceRoot, artifactRoot: path.dirname(projectRoot), family, transport, milliseconds,
    fingerprint: captureInputFingerprint(family, transport, { sourceRoot: projectRoot, evidenceRoot, definition }) };
}
function planRecovery(options, originalFiles = new Map()) {
  const state = sourceState(options);
  const { projectRoot, evidenceRoot, artifactRoot, transport, fingerprint, milliseconds } = state;
  const readArtifact = filename => originalFiles.has(filename) ? originalFiles.get(filename) : regular(filename);
  const existsArtifact = filename => originalFiles.has(filename) || fs.existsSync(filename);
  const checkpointPath = path.join(evidenceRoot, `vdg/checkpoints/local-${transport}-${fingerprint}.json`);
  if (!existsArtifact(checkpointPath)) return { ...state, needed: false, reason: 'no-current-checkpoint', ...authority };
  const checkpointBytes = readArtifact(checkpointPath);
  const checkpoint = JSON.parse(checkpointBytes), payload = checkpoint.payload;
  check(checkpoint.schema === 'swissknife.vdg-capture-checkpoint.v1' && checkpoint.target === 'local' && checkpoint.transport === transport
    && checkpoint.input_fingerprint === fingerprint && hex(checkpoint.payload_sha256) && sha(compact(payload)) === checkpoint.payload_sha256
    && Array.isArray(payload?.rows) && Array.isArray(payload?.observations) && Array.isArray(payload?.pageerrors), 'current checkpoint integrity invalid');
  check(!payload.pageerrors.some(reason => isGlobalTestDeadline(reason, milliseconds)), 'global test deadline in session errors; capture cannot be called clean');
  const deadlineIndices = payload.rows.flatMap((row, index) => noActionDeadline(row, milliseconds) ? [index] : []);
  const globalIndices = payload.rows.flatMap((row, index) => hasGlobalTestDeadline(row, milliseconds) ? [index] : []);
  check(globalIndices.every(index => deadlineIndices.includes(index)), 'global test deadline has unsupported action evidence; capture cannot be called clean');
  if (!deadlineIndices.length) return { ...state, needed: false, reason: 'no-exact-infrastructure-deadline', ...authority };
  check(payload.observations.length === 0 && payload.pageerrors.length === 0, 'MCP observations or page errors require independent repair');
  const rowKeys = payload.rows.map(row => JSON.stringify([row.app_id, row.launch_id, row.selector]));
  check(payload.rows.every(row => row.app_id && row.launch_id && row.selector) && new Set(rowKeys).size === rowKeys.length, 'checkpoint row identity invalid');
  for (const row of payload.rows) if (!noActionDeadline(row, milliseconds)) verifySuccessfulRow(row, payload, artifactRoot);
  const prefix = payload.rows.slice(0, deadlineIndices[0]);
  check(prefix.length > 0, 'no independently verified successful prefix');
  const matrixBytes = readArtifact(path.join(evidenceRoot, 'control-tool-matrix.json'));
  const matrix = JSON.parse(matrixBytes);
  const { controlKey } = require(path.join(projectRoot, 'scripts/vdg-capture-observations.cjs'));
  const expected = new Map((matrix.rows || []).filter(row => row.family === 'vdg-local').map(row => [controlKey(row), row]));
  check(expected.size > 0, 'current Local matrix empty');
  for (const row of payload.rows) {
    const declared = expected.get(controlKey(row));
    check(declared && row.source === 'matrix' && row.disposition === declared.disposition
      && row.expected_tool_id === (declared.tool_id || ''), 'checkpoint control differs from current source matrix');
  }
  const files = [], reports = [];
  const add = (filename, before, after, kind) => files.push({ path: path.relative(artifactRoot, filename), before_sha256: sha(before),
    before_base64: before.toString('base64'), after_sha256: after === null ? null : sha(after), after_base64: after === null ? null : after.toString('base64'), kind });
  const connectorPath = path.join(evidenceRoot, 'vdg/connectors/local.json');
  let badRunIds = [];
  if (existsArtifact(connectorPath)) {
    const before = readArtifact(connectorPath), connector = JSON.parse(before);
    check(connector.schema === 'swissknife.virtual-desktop-gui-mcp-connectors.v1' && connector.target === 'local' && Array.isArray(connector.runs), 'connector manifest invalid');
    const runs = connector.runs.map(run => {
      if (run.transport !== transport || run.input_fingerprint !== fingerprint || run.capture_complete !== true) return run;
      check(/^[a-z][a-z0-9-]*$/.test(run.run_id || '') && run.run_id.startsWith(`local-${transport}-`)
        && run.report_path === `vdg/runs/${run.run_id}.json` && hex(run.report_sha256), 'source-current run identity invalid');
      const reportPath = local(evidenceRoot, run.report_path), bytes = readArtifact(reportPath);
      check(sha(bytes) === run.report_sha256, 'source-current report bytes changed');
      const report = JSON.parse(bytes);
      check(report.schema === 'swissknife.virtual-desktop-live-click.v1' && report.target === 'local' && Array.isArray(report.rows)
        && report.row_count === report.rows.length, 'source-current report invalid');
      if (!report.rows.some(row => noActionDeadline(row, milliseconds))) return run;
      check(sha(compact(report.rows)) === sha(compact(payload.rows)), 'interrupted report/checkpoint rows differ');
      badRunIds.push(run.run_id);
      reports.push({ path: path.relative(artifactRoot, reportPath), sha256: sha(bytes), base64: bytes.toString('base64') });
      return { ...run, capture_complete: false, infrastructure_interrupted: 'playwright-global-test-deadline', recovery_prefix_rows: prefix.length };
    });
    if (badRunIds.length) add(connectorPath, before, encoded({ ...connector, runs }), 'invalidate-interrupted-run');
  }
  const cachePath = path.join(evidenceRoot, `vdg/capture-cache/local-${transport}.json`);
  if (existsArtifact(cachePath)) {
    const before = readArtifact(cachePath), cache = JSON.parse(before);
    if (cache.input_fingerprint === fingerprint) {
      check(cache.schema === 'swissknife.vdg-failed-capture-cache.v1' && cache.family === 'vdg-local' && cache.transport === transport
        && badRunIds.includes(cache.run_id), 'current failed cache is not bound to the interrupted report');
      add(cachePath, before, null, 'invalidate-interrupted-failed-cache');
    }
  }
  const retainedHashes = {};
  for (const row of prefix) for (const field of ['screenshot_before', 'screenshot_after']) if (row[field]) retainedHashes[row[field]] = payload.image_hashes[row[field]];
  const nextPayload = { ...payload, rows: prefix, image_hashes: retainedHashes };
  const afterCheckpoint = { ...checkpoint, payload: nextPayload, payload_sha256: sha(compact(nextPayload)), capture_complete: false,
    infrastructure_recovery: { reason: 'playwright-global-test-deadline', original_checkpoint_sha256: sha(checkpointBytes), discarded_rows: payload.rows.length - prefix.length }, ...authority };
  add(checkpointPath, checkpointBytes, encoded(afterCheckpoint), 'retain-verified-successful-prefix');
  return { ...state, schema: 'swissknife.vdg-capture-deadline-recovery.v1', needed: true, original_rows: payload.rows.length,
    retained_rows: prefix.length, deadline_indices: deadlineIndices, interrupted_run_ids: badRunIds,
    original_checkpoint_sha256: sha(checkpointBytes), matrix_sha256: sha(matrixBytes), files, reports, ...authority };
}
function assertCurrentPlan(plan) {
  const state = sourceState(plan);
  check(state.fingerprint === plan.fingerprint, 'source fingerprint changed during recovery');
  check(sha(regular(path.join(plan.evidenceRoot, 'control-tool-matrix.json'))) === plan.matrix_sha256, 'matrix changed during recovery');
  for (const report of plan.reports) check(sha(regular(local(plan.artifactRoot, report.path))) === report.sha256, 'interrupted report changed');
  const original = JSON.parse(Buffer.from(plan.files.find(file => file.kind === 'retain-verified-successful-prefix').before_base64, 'base64'));
  for (const row of original.payload.rows) if (!noActionDeadline(row, plan.milliseconds)) verifySuccessfulRow(row, original.payload, plan.artifactRoot);
}
function verifyJournal(directory, options) {
  const journal = JSON.parse(regular(path.join(directory, 'plan.json')));
  check(journal.schema === 'swissknife.vdg-capture-deadline-recovery.v1' && journal.needed === true && journal.completion_authority === false, 'recovery journal invalid');
  const state = sourceState(options);
  check(journal.projectRoot === state.projectRoot && journal.evidenceRoot === state.evidenceRoot && journal.fingerprint === state.fingerprint
    && journal.family === state.family && journal.transport === state.transport, 'recovery journal identity differs');
  for (const file of journal.files) {
    check(sha(Buffer.from(file.before_base64, 'base64')) === file.before_sha256
      && (file.after_base64 === null ? file.after_sha256 === null : sha(Buffer.from(file.after_base64, 'base64')) === file.after_sha256), 'recovery journal bytes changed');
  }
  const originalFiles = new Map(journal.files.map(file => [local(state.artifactRoot, file.path), Buffer.from(file.before_base64, 'base64')]));
  const derived = planRecovery(options, originalFiles);
  check(sha(compact(derived)) === sha(compact(journal)), 'recovery journal differs from independently derived minimal repair');
  assertCurrentPlan(journal);
  return journal;
}
function applyRecovery(plan, { archiveRoot, assertSafe, afterWrite } = {}) {
  check(typeof assertSafe === 'function', 'independent supervisor safety fence required');
  assertSafe();
  if (!plan.needed) return { needed: false, reason: plan.reason, ...authority };
  check(path.isAbsolute(archiveRoot), 'absolute owned recovery archive required');
  const directory = path.join(archiveRoot, `local-${plan.transport}-${plan.fingerprint}-${plan.original_checkpoint_sha256}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = fs.lstatSync(directory);
  check(info.isDirectory() && info.uid === process.getuid() && (info.mode & 0o077) === 0, 'private owned recovery archive required');
  const journalPath = path.join(directory, 'plan.json');
  if (!fs.existsSync(journalPath)) { assertSafe(); durable(journalPath, encoded(plan), true); }
  const journal = verifyJournal(directory, plan);
  check(sha(compact(journal)) === sha(compact(plan)), 'existing recovery transaction differs');
  for (let index = 0; index < journal.files.length; index += 1) {
    assertSafe(); assertCurrentPlan(journal);
    const change = journal.files[index], filename = local(journal.artifactRoot, change.path);
    const actual = fs.existsSync(filename) ? sha(regular(filename)) : null;
    if (actual !== change.after_sha256) {
      check(actual === change.before_sha256, `evidence changed outside recovery: ${change.path}`);
      assertSafe(); // Refresh after expensive PNG/source verification, immediately before mutation.
      if (change.after_base64 === null) { fs.unlinkSync(filename); const fd = fs.openSync(path.dirname(filename), 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
      else durable(filename, Buffer.from(change.after_base64, 'base64'));
    }
    afterWrite?.(index, change);
  }
  assertSafe(); assertCurrentPlan(journal);
  const receipt = { schema: 'swissknife.vdg-capture-deadline-recovery-receipt.v1', transaction: path.basename(directory),
    plan_sha256: sha(regular(journalPath)), input_fingerprint: plan.fingerprint, family: plan.family, transport: plan.transport,
    original_rows: plan.original_rows, retained_rows: plan.retained_rows, discarded_rows: plan.original_rows - plan.retained_rows,
    interrupted_run_ids: plan.interrupted_run_ids, reason: 'playwright-global-test-deadline', ...authority };
  const receiptPath = path.join(directory, 'receipt.json');
  if (fs.existsSync(receiptPath)) check(regular(receiptPath).equals(encoded(receipt)), 'completed recovery receipt changed');
  else { assertSafe(); durable(receiptPath, encoded(receipt), true); }
  return { ...receipt, receipt_path: receiptPath };
}
function resumeRecovery(directory, options, hooks) {
  const journal = verifyJournal(directory, options);
  return applyRecovery(journal, { ...hooks, archiveRoot: path.dirname(directory) });
}
module.exports = { isGlobalTestDeadline, replayableGlobalTestDeadline, hasGlobalTestDeadline, resumeRecovery, planRecovery, applyRecovery, verifyJournal, noActionDeadline, verifySuccessfulRow, sourceState, durable, sha };

function processIdentity(pid) {
  const directory = `/proc/${pid}`;
  const stat = fs.readFileSync(`${directory}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  return { pid: Number(pid), start: fields[19], parent: Number(fields[1]), uid: fs.statSync(directory).uid,
    argv: fs.readFileSync(`${directory}/cmdline`).toString().split('\0').filter(Boolean), cwd: fs.realpathSync(`${directory}/cwd`),
    executable: fs.realpathSync(`${directory}/exe`) };
}
function uniqueOption(argv, option) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === option) { check(i + 1 < argv.length, 'missing owner flag operand'); values.push(argv[i + 1]); }
    else if (argv[i].startsWith(`${option}=`)) values.push(argv[i].slice(option.length + 1));
  }
  check(values.length === 1, `owner must have exactly one ${option}`);
  return values[0];
}
function assertOwnerSafe(options) {
  const owner = processIdentity(options.ownerPid);
  check(owner.uid === process.getuid() && owner.start === String(options.ownerStartTicks), 'owner PID/UID/start fence changed');
  check(/^(?:python|pypy)(?:\d+(?:\.\d+)*)?$/.test(path.basename(owner.argv[0] || ''))
    && /^(?:python|pypy)(?:\d+(?:\.\d+)*)?$/.test(path.basename(owner.executable)), 'owner is not a Python interpreter');
  let index = 1;
  while (['-u', '-B', '-E', '-s', '-S', '-I', '-O', '-OO'].includes(owner.argv[index])) index += 1;
  check(owner.argv[index] === '-m' && owner.argv[index + 1] === 'ipfs_accelerate_py.agent_supervisor.rescue.lane_resume', 'owner is not the actual lane module');
  const args = owner.argv.slice(index + 2), repo = path.dirname(path.resolve(options.projectRoot));
  check(fs.realpathSync(path.resolve(owner.cwd, uniqueOption(args, '--repo-root'))) === fs.realpathSync(repo), 'owner repository mismatch');
  const statusPath = path.resolve(owner.cwd, uniqueOption(args, '--status-path'));
  const canonicalStatus = path.join(repo, 'data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/lanes/vdg-planning/vdg_planning_status.json');
  check(statusPath === canonicalStatus, 'owner canonical status mismatch');
  for (let directory = path.dirname(statusPath); directory === repo || directory.startsWith(`${repo}${path.sep}`); directory = path.dirname(directory)) {
    for (const marker of ['HOLD', 'OPERATOR_STOP', 'watchdog.disabled', 'hold', 'operator.hold', 'repair-dispatcher.hold'])
      check(!fs.existsSync(path.join(directory, marker)), `operator hold blocks recovery: ${marker}`);
    if (directory === repo) break;
  }
  const status = JSON.parse(regular(statusPath));
  check(status.pid === owner.pid && status.target_id === 'vdg-planning' && status.state === 'healthy'
    && status.active_task_id === options.taskId && Number.isSafeInteger(status.heartbeat_at_ms)
    && Date.now() - status.heartbeat_at_ms >= -5000 && Date.now() - status.heartbeat_at_ms <= 60000, 'owner task/heartbeat is not authoritative and fresh');
  const lockPath = path.join(path.dirname(statusPath), 'vdg-planning.resume.lock'), lockInfo = fs.statSync(lockPath);
  let locked = false;
  for (const fd of fs.readdirSync(`/proc/${owner.pid}/fd`)) {
    try {
      const info = fs.statSync(`/proc/${owner.pid}/fd/${fd}`);
      if (info.dev === lockInfo.dev && info.ino === lockInfo.ino
        && /\bFLOCK\s+ADVISORY\s+WRITE\b/.test(fs.readFileSync(`/proc/${owner.pid}/fdinfo/${fd}`, 'utf8'))) locked = true;
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  check(locked, 'owner does not retain the exact lifecycle flock');
  const ancestors = new Set(); let cursor = process.pid;
  while (cursor > 1 && !ancestors.has(cursor)) {
    ancestors.add(cursor); if (cursor === owner.pid) break; cursor = processIdentity(cursor).parent;
  }
  check(ancestors.has(owner.pid), 'recovery is not descended from the exact owner');
  const captureNames = new Set(['run-vdg-family.mjs', 'run-vdg-all-families.mjs', 'run_playwright_test.mjs']);
  for (const name of fs.readdirSync('/proc').filter(value => /^\d+$/.test(value))) {
    let identity;
    try {
      if (fs.statSync(`/proc/${name}`).uid !== process.getuid()) continue;
      const argv = fs.readFileSync(`/proc/${name}/cmdline`).toString().split('\0').filter(Boolean);
      const comm = fs.readFileSync(`/proc/${name}/comm`, 'utf8').trim();
      if (!['node', 'nodejs'].includes(path.basename(argv[0] || '')) && !/chrome|chromium|playwright|vite/.test(`${comm} ${argv[0] || ''} ${argv[1] || ''}`)) continue;
      identity = processIdentity(Number(name));
    }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
    if (identity.uid !== process.getuid() || ancestors.has(identity.pid)) continue;
    if (['node', 'nodejs'].includes(path.basename(identity.argv[0] || ''))) {
      for (const arg of identity.argv.slice(1)) if (captureNames.has(path.basename(arg))) {
        const candidate = path.resolve(identity.cwd, arg);
        check(candidate !== path.join(options.projectRoot, 'scripts', path.basename(arg)), `live capture entrypoint exists: ${identity.pid}`);
      }
    }
    // Owner-descended browser/Vite remnants also exclude admission, even when
    // the producer itself has exited. Other independent desktop sessions do not.
    if (/chrome|chromium|playwright|vite/.test(`${path.basename(identity.executable)} ${identity.argv[1] || ''}`)) {
      let parent = identity.parent, seen = new Set();
      while (parent > 1 && !seen.has(parent)) {
        check(parent !== owner.pid, `owned capture/browser descendant remains: ${identity.pid}`);
        seen.add(parent);
        try { parent = processIdentity(parent).parent; } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) break; throw error; }
      }
    }
  }
}
function withRecoveryLock(archiveRoot, transport, callback) {
  fs.mkdirSync(archiveRoot, { recursive: true, mode: 0o700 });
  const directory = fs.lstatSync(archiveRoot);
  check(directory.isDirectory() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0, 'archive root must be private and owned');
  const lock = path.join(archiveRoot, `.local-${transport}.lock`);
  if (fs.existsSync(lock)) {
    const priorBytes = regular(lock), prior = JSON.parse(priorBytes);
    check(Number.isSafeInteger(prior.pid) && prior.pid > 1 && /^\d+$/.test(prior.start), 'invalid recovery lock');
    let alive = false;
    try { alive = processIdentity(prior.pid).start === prior.start; } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
    check(!alive, 'another recovery is alive');
    check(regular(lock).equals(priorBytes), 'recovery lock changed'); fs.unlinkSync(lock);
  }
  const identity = processIdentity(process.pid), bytes = encoded({ pid: identity.pid, start: identity.start });
  durable(lock, bytes, true);
  const own = fs.lstatSync(lock);
  try { return callback(); }
  finally {
    const actual = fs.lstatSync(lock);
    check(actual.dev === own.dev && actual.ino === own.ino && regular(lock).equals(bytes), 'recovery lock ownership changed');
    fs.unlinkSync(lock);
  }
}
function main(argv = process.argv.slice(2)) {
  const values = {}, switches = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (['--check', '--apply', '--require-clean'].includes(flag)) { check(!switches.has(flag), 'duplicate switch'); switches.add(flag); }
    else {
      check(['--project-root', '--evidence-root', '--archive-root', '--family', '--transport', '--owner-pid', '--owner-start-ticks', '--task-id'].includes(flag)
        && !Object.hasOwn(values, flag) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'unknown/duplicate/missing argument');
      values[flag] = argv[++i];
    }
  }
  check(switches.size <= 1, 'read-only and apply modes are mutually exclusive');
  const options = { projectRoot: path.resolve(values['--project-root'] || path.join(__dirname, '..')),
    evidenceRoot: values['--evidence-root'], family: values['--family'], transport: values['--transport'],
    ownerPid: Number(values['--owner-pid']), ownerStartTicks: values['--owner-start-ticks'], taskId: values['--task-id'] };
  if (!switches.has('--apply')) {
    if (switches.has('--require-clean')) assertOwnerSafe(options);
    const plan = planRecovery(options);
    if (switches.has('--require-clean')) assertOwnerSafe(options);
    console.log(JSON.stringify({ needed: plan.needed, reason: plan.reason || 'playwright-global-test-deadline', family: plan.family,
      transport: plan.transport, input_fingerprint: plan.fingerprint, original_rows: plan.original_rows, retained_rows: plan.retained_rows, ...authority }));
    return switches.has('--require-clean') && plan.needed ? 1 : 0;
  }
  check(Number.isSafeInteger(options.ownerPid) && options.ownerPid > 1 && /^\d+$/.test(options.ownerStartTicks || '')
    && /^VDG-[A-Z0-9-]+$/.test(options.taskId || ''), 'live owner identity/task required for apply');
  const assertSafe = () => assertOwnerSafe(options);
  assertSafe();
  const archiveRoot = path.resolve(values['--archive-root'] || path.join(path.dirname(options.projectRoot), 'data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/smoke-receipts/capture-deadline-recovery'));
  return withRecoveryLock(archiveRoot, options.transport, () => {
    const state = sourceState(options), prefix = `local-${state.transport}-${state.fingerprint}-`;
    const pending = fs.readdirSync(archiveRoot).filter(name => name.startsWith(prefix)
      && fs.existsSync(path.join(archiveRoot, name, 'plan.json')) && !fs.existsSync(path.join(archiveRoot, name, 'receipt.json')));
    check(pending.length <= 1, 'multiple incomplete recovery transactions');
    if (pending.length) resumeRecovery(path.join(archiveRoot, pending[0]), options, { archiveRoot, assertSafe });
    const plan = planRecovery(options), result = applyRecovery(plan, { archiveRoot, assertSafe });
    console.log(JSON.stringify(result)); return 0;
  });
}
module.exports = { ...module.exports, main, assertOwnerSafe, processIdentity, withRecoveryLock };
if (require.main === module) {
  try { process.exitCode = main(); } catch (error) { console.error(`capture deadline recovery refused: ${error.message}`); process.exitCode = 75; }
}

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const recovery = require('./recover-vdg-capture-deadline.cjs');
const canonical = '/home/barberb/lift_coding/swissknife';
const { openCaptureCheckpoint } = require(path.join(canonical, 'scripts/vdg-capture-checkpoint.cjs'));
const { captureInputFingerprint } = require(path.join(canonical, 'scripts/vdg-capture-fingerprint.cjs'));
const { FAMILIES } = require(path.join(canonical, 'scripts/vdg-evidence.cjs'));
const { checkCapture } = require(path.join(canonical, 'scripts/check-vdg-capture.cjs'));
const hash = recovery.sha;
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const compactHash = value => hash(Buffer.from(JSON.stringify(value)));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : json(value)); };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-real-deadline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'swissknife'), evidenceRoot = path.join(projectRoot, 'test-results/virtual-desktop-ipfs-mcp-orb');
  fs.mkdirSync(path.join(projectRoot, 'scripts'), { recursive: true });
  for (const name of ['vdg-evidence.cjs', 'vdg-capture-fingerprint.cjs', 'vdg-capture-observations.cjs']) fs.symlinkSync(path.join(canonical, 'scripts', name), path.join(projectRoot, 'scripts', name));
  write(path.join(projectRoot, 'test/e2e/families/local-negative-mcp.spec.ts'), 'test.setTimeout(21_600_000);\n');
  const matrixRows = Array.from({ length: 3 }, (_, index) => ({ family: 'vdg-local', app_id: 'terminal', launch_id: 'terminal', selector: `#control-${index}`, disposition: 'local-only', tool_id: '' }));
  write(path.join(evidenceRoot, 'control-tool-matrix.json'), { rows: matrixRows });
  const options = { projectRoot, evidenceRoot, family: 'vdg-local', transport: 'http' };
  const fingerprint = captureInputFingerprint(options.family, options.transport, { sourceRoot: projectRoot, evidenceRoot, definition: FAMILIES[options.family] });
  const checkpointOptions = { directory: path.join(evidenceRoot, 'vdg/checkpoints'), target: 'local', transport: 'http', inputFingerprint: fingerprint, artifactRoot: root };
  const png = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(png); png.write('IHDR', 12); png.writeUInt32BE(720, 16); png.writeUInt32BE(540, 20);
  function successful(index) {
    const row = { source: 'matrix', app_id: 'terminal', launch_id: 'terminal', selector: `#control-${index}`, disposition: 'local-only', expected_tool_id: '', visibility: 'visible', clicked: true,
      icon_visible: true, window_box: { width: 720, height: 540 }, screenshot_before: '', screenshot_after: '', screenshot_before_check: 'png-ok', screenshot_after_check: 'png-ok', pageerrors: [], mcp_call_count: 0,
      observation: null, observations: [], incomplete_mcp_call_count: 0, confirm_surface: false, result_surface: 'Actual local test control', failure_reasons: [] };
    for (const field of ['screenshot_before', 'screenshot_after']) {
      const relative = `swissknife/test-results/virtual-desktop-ipfs-mcp-orb/vdg/live-clicks/local-http-1/local/${index}-${field}.png`;
      const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, png); row[field] = relative;
    }
    return row;
  }
  const deadline = { ...successful(1), visibility: 'not-launched', clicked: false, icon_visible: false, window_box: null,
    screenshot_before: '', screenshot_after: '', screenshot_before_check: '', screenshot_after_check: '', result_surface: '', failure_reasons: ['page.waitForTimeout: Test timeout of 21600000ms exceeded.'] };
  const rows = [successful(0), deadline, successful(2)];
  const checkpointPath = path.join(checkpointOptions.directory, `local-http-${fingerprint}.json`);
  const reportPath = path.join(evidenceRoot, 'vdg/runs/local-http-1.json');
  const connectorPath = path.join(evidenceRoot, 'vdg/connectors/local.json');
  const cachePath = path.join(evidenceRoot, 'vdg/capture-cache/local-http.json');
  function save() {
    openCaptureCheckpoint(checkpointOptions).save({ rows, observations: [], pageerrors: [] });
    const report = { schema: 'swissknife.virtual-desktop-live-click.v1', target: 'local', generated_at: '2026-10-23T00:53:12.000Z', rows, row_count: rows.length, decision: 'no_go' };
    write(reportPath, report);
    write(connectorPath, { schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'local', observations: [], runs: [
      { run_id: 'local-libp2p-old', transport: 'libp2p', capture_complete: true, input_fingerprint: 'e'.repeat(64), arbitrary: 'unchanged other transport' },
      { run_id: 'local-http-1', transport: 'http', capture_complete: true, input_fingerprint: fingerprint, report_path: 'vdg/runs/local-http-1.json', report_sha256: hash(fs.readFileSync(reportPath)), completed_at: '2026-10-23T00:53:13.000Z' }], completion_authority: false });
    write(cachePath, { schema: 'swissknife.vdg-failed-capture-cache.v1', family: 'vdg-local', transport: 'http', input_fingerprint: fingerprint, run_id: 'local-http-1', decision: 'no_go' });
  }
  save();
  const archiveRoot = path.join(root, 'recovery');
  return { root, projectRoot, evidenceRoot, options, fingerprint, rows, checkpointOptions, checkpointPath, reportPath, connectorPath, cachePath, archiveRoot, successful, save };
}
function safe() {}
function ownedBytes(f) { return new Map([f.checkpointPath, f.connectorPath, f.cachePath, f.reportPath].map(file => [file, fs.readFileSync(file)])); }
function assertSame(map) { for (const [file, bytes] of map) assert.equal(fs.readFileSync(file).equals(bytes), true, file); }
test('actual checkpoint and acquisition helpers expose the original global-deadline reuse defect', t => {
  const f = fixture(t);
  assert.equal(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows.length, 3);
  assert.equal(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows[1].clicked, false);
  assert.equal(checkCapture('vdg-local', 'http', { sourceRoot: f.projectRoot, evidenceRoot: f.evidenceRoot }).capture_complete, true);
});
test('recovery retains exact verified prefix, invalidates interrupted reuse, and preserves reports/images/source identity', t => {
  const f = fixture(t), before = ownedBytes(f), connector = JSON.parse(before.get(f.connectorPath));
  const plan = recovery.planRecovery(f.options);
  assert.equal(plan.needed, true); assert.equal(plan.retained_rows, 1); assert.equal(plan.original_rows, 3);
  const receipt = recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe });
  assert.equal(receipt.completion_authority, false); assert.equal(receipt.work_complete, false);
  assert.deepEqual(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows, [f.rows[0]]);
  assert.throws(() => checkCapture('vdg-local', 'http', { sourceRoot: f.projectRoot, evidenceRoot: f.evidenceRoot }), /complete transport capture missing/);
  assert.equal(fs.existsSync(f.cachePath), false);
  assert.equal(fs.readFileSync(f.reportPath).equals(before.get(f.reportPath)), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.connectorPath)).runs[0], connector.runs[0]);
  assert.equal(recovery.sourceState(f.options).fingerprint, f.fingerprint);
  assert.equal(recovery.planRecovery(f.options).needed, false);
  const journal = recovery.verifyJournal(path.dirname(receipt.receipt_path), f.options);
  assert.equal(Buffer.from(journal.files.find(x => x.kind === 'retain-verified-successful-prefix').before_base64, 'base64').equals(before.get(f.checkpointPath)), true);
});
test('unchanged real checkpoint helper resumes the retained rows and accepts genuinely re-executed suffix', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options);
  recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe });
  const resumed = openCaptureCheckpoint(f.checkpointOptions);
  assert.deepEqual(resumed.snapshot.rows.map(row => row.selector), ['#control-0']);
  // The producer must actually execute these missing keys; fixture supplies new
  // observed action rows, never promotes the old clicked:false deadline row.
  const rerun = [f.successful(1), f.successful(2)];
  resumed.save({ rows: [...resumed.snapshot.rows, ...rerun], observations: [], pageerrors: [] });
  assert.equal(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows.every(row => row.clicked === true && row.failure_reasons.length === 0), true);
  // A checkpoint by itself still cannot grant an acquisition.
  assert.throws(() => checkCapture('vdg-local', 'http', { sourceRoot: f.projectRoot, evidenceRoot: f.evidenceRoot }));
});
for (const phase of [0, 1, 2]) test(`journal resumes after real interruption following mutation ${phase}`, t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options);
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe, afterWrite(index) { if (index === phase) throw new Error('injected process interruption'); } }), /injected/);
  const directory = path.join(f.archiveRoot, fs.readdirSync(f.archiveRoot)[0]);
  const receipt = recovery.resumeRecovery(directory, f.options, { archiveRoot: f.archiveRoot, assertSafe: safe });
  assert.equal(receipt.retained_rows, 1); assert.equal(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows.length, 1);
  assert.deepEqual(recovery.resumeRecovery(directory, f.options, { archiveRoot: f.archiveRoot, assertSafe: safe }), receipt);
});
test('genuine product failures cannot be discarded even after a global deadline', t => {
  const f = fixture(t); f.rows[2].failure_reasons = ['click-failed']; f.save();
  const before = ownedBytes(f); assert.throws(() => recovery.planRecovery(f.options), /semantic failure/); assertSame(before);
});
test('page errors and independent MCP calls exclude automatic prefix repair', t => {
  const f = fixture(t); f.rows[0].pageerrors = ['TypeError: real app failure']; f.save();
  assert.throws(() => recovery.planRecovery(f.options), /semantic failure/);
  f.rows[0].pageerrors = []; f.rows[0].mcp_call_count = 1; f.save(); assert.throws(() => recovery.planRecovery(f.options), /semantic failure/);
});
test('only exact global declared deadline with no action evidence is classified', t => {
  const f = fixture(t), deadline = f.rows[1];
  assert.equal(recovery.noActionDeadline(deadline, 21_600_000), true);
  for (const change of [{ failure_reasons: ['locator.click: Timeout 3000ms exceeded.'] }, { failure_reasons: ['row timed out after 45s'] },
    { failure_reasons: ['page.waitForTimeout: Test timeout of 7200000ms exceeded.'] }, { clicked: true }, { pageerrors: ['real failure'] }, { screenshot_before: 'real.png' }, { mcp_call_count: 1 }]) {
    assert.equal(recovery.noActionDeadline({ ...deadline, ...change }, 21_600_000), false);
  }
});
test('hash or matrix identity changes fail closed before any evidence mutation', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options), before = ownedBytes(f);
  fs.appendFileSync(path.join(f.root, f.rows[0].screenshot_before), 'changed');
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe }), /PNG hash/); assertSame(before);
});
test('source change between plan and apply preserves the interrupted original', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options), before = ownedBytes(f);
  fs.appendFileSync(path.join(f.projectRoot, 'test/e2e/families/local-negative-mcp.spec.ts'), '// real source fix\n');
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe }), /identity differs|fingerprint/); assertSame(before);
});
test('independently reconstructed journal rejects fabricated operations or modified prefix', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options);
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe, afterWrite() { throw new Error('interrupt'); } }));
  const directory = path.join(f.archiveRoot, fs.readdirSync(f.archiveRoot)[0]), file = path.join(directory, 'plan.json'), journal = JSON.parse(fs.readFileSync(file));
  const checkpoint = journal.files.find(x => x.kind === 'retain-verified-successful-prefix');
  const forged = JSON.parse(Buffer.from(checkpoint.after_base64, 'base64')); forged.payload.rows[0].clicked = false; forged.payload_sha256 = compactHash(forged.payload);
  const bytes = Buffer.from(json(forged)); checkpoint.after_base64 = bytes.toString('base64'); checkpoint.after_sha256 = hash(bytes); write(file, journal);
  assert.throws(() => recovery.resumeRecovery(directory, f.options, { archiveRoot: f.archiveRoot, assertSafe: safe }), /independently derived/);
});
test('external artifact mutation after interrupted transaction is never blessed', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options);
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe, afterWrite(index) { if (index === 1) throw new Error('interrupt'); } }));
  fs.appendFileSync(f.checkpointPath, '\n');
  const directory = path.join(f.archiveRoot, fs.readdirSync(f.archiveRoot)[0]);
  assert.throws(() => recovery.resumeRecovery(directory, f.options, { archiveRoot: f.archiveRoot, assertSafe: safe }), /outside recovery/);
});
test('caller must retain independent safety fence before every actual mutation', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options), before = ownedBytes(f);
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot }), /safety fence/); assertSame(before);
  assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe() { throw new Error('actual owner exited'); } }), /owner exited/); assertSame(before);
});
test('read-only CLI has no artifact side effects and apply rejects an unrelated live process', t => {
  const f = fixture(t), before = ownedBytes(f), script = require.resolve('./recover-vdg-capture-deadline.cjs');
  const args = ['--project-root', f.projectRoot, '--family', 'vdg-local', '--transport', 'http'];
  const checked = cp.spawnSync(process.execPath, [script, ...args, '--check'], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr); assert.equal(JSON.parse(checked.stdout).needed, true); assertSame(before);
  const refused = cp.spawnSync(process.execPath, [script, ...args, '--apply', '--owner-pid', String(process.pid), '--owner-start-ticks', recovery.processIdentity(process.pid).start, '--task-id', 'VDG-039-R01'], { encoding: 'utf8' });
  assert.equal(refused.status, 75); assert.match(refused.stderr, /not a Python interpreter/); assertSame(before);
});
test('live exclusive recovery lock is retained; stale real PID lock can be recovered', t => {
  const f = fixture(t); let called = false;
  recovery.withRecoveryLock(f.archiveRoot, 'http', () => {
    assert.throws(() => recovery.withRecoveryLock(f.archiveRoot, 'http', () => { called = true; }), /another recovery/);
  });
  assert.equal(called, false);
  write(path.join(f.archiveRoot, '.local-http.lock'), { pid: 2147483647, start: '1' });
  recovery.withRecoveryLock(f.archiveRoot, 'http', () => { called = true; }); assert.equal(called, true);
});

function ownerFixture(f, { mode = 'valid' } = {}) {
  const pythonRoot = path.join(f.root, 'python-owner');
  for (const part of ['ipfs_accelerate_py', 'ipfs_accelerate_py/agent_supervisor', 'ipfs_accelerate_py/agent_supervisor/rescue']) write(path.join(pythonRoot, part, '__init__.py'), '');
  const statusPath = path.join(f.root, 'data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/lanes/vdg-planning/vdg_planning_status.json');
  const script = require.resolve('./recover-vdg-capture-deadline.cjs');
  if (mode === 'live-capture') write(path.join(f.projectRoot, 'scripts/run-vdg-family.mjs'), 'setInterval(() => {}, 1000);\n');
  const source = `import os,sys,json,time,fcntl,subprocess\nfrom pathlib import Path\nstatus=Path(sys.argv[sys.argv.index('--status-path')+1])\nstatus.parent.mkdir(parents=True,exist_ok=True)\nlock=(status.parent/'vdg-planning.resume.lock').open('a')\nmode=${JSON.stringify(mode)}\nif mode!='no-flock':fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)\nif mode=='hold':(status.parent.parent.parent/'HOLD').write_text('operator owned hold')\nraw=Path('/proc/self/stat').read_text();start=raw[raw.rindex(')')+2:].split()[19]\nstatus.write_text(json.dumps({'pid':os.getpid(),'target_id':'vdg-planning','state':'healthy','active_task_id':'VDG-039-R01','heartbeat_at_ms':int(time.time()*1000)-(120000 if mode=='stale' else 0)}))\nargv=[${JSON.stringify(process.execPath)},${JSON.stringify(script)},'--project-root',${JSON.stringify(f.projectRoot)},'--family','vdg-local','--transport','http','--archive-root',${JSON.stringify(f.archiveRoot)},${JSON.stringify(mode.startsWith('guard-') ? '--require-clean' : '--apply')},'--owner-pid',str(os.getpid()),'--owner-start-ticks',str(int(start)+(1 if mode=='wrong-start' else 0)),'--task-id','VDG-039-R01']\nproducer=subprocess.Popen([${JSON.stringify(process.execPath)},${JSON.stringify(path.join(f.projectRoot, 'scripts/run-vdg-family.mjs'))}]) if mode=='live-capture' else None\ntry:result=subprocess.run(argv,capture_output=True,text=True)\nfinally:\n if producer:producer.terminate();producer.wait(timeout=5)\nprint(json.dumps({'status':result.returncode,'stdout':result.stdout,'stderr':result.stderr}))\n`;
  write(path.join(pythonRoot, 'ipfs_accelerate_py/agent_supervisor/rescue/lane_resume.py'), source);
  const argv = ['-B', '-m', 'ipfs_accelerate_py.agent_supervisor.rescue.lane_resume', '--repo-root', f.root, '--status-path', statusPath];
  if (mode === 'duplicate-repo') argv.push('--repo-root', f.root);
  const result = cp.spawnSync('python3', argv, { encoding: 'utf8', cwd: f.root, env: { ...process.env, PYTHONPATH: pythonRoot, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}
test('actual Python module owner, retained kernel flock and live ancestry permit bounded recovery', t => {
  const f = fixture(t), result = ownerFixture(f);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).retained_rows, 1);
  assert.equal(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows.length, 1);
});
for (const mode of ['no-flock', 'stale', 'wrong-start', 'duplicate-repo', 'live-capture', 'hold']) test(`actual owner admission rejects ${mode} without altering capture artifacts`, t => {
  const f = fixture(t), before = ownedBytes(f), result = ownerFixture(f, { mode });
  assert.equal(result.status, 75, result.stdout); assertSame(before);
});

test('checkpoint-only hard interruption recovers prefix without inventing a report or acquisition', t => {
  const f = fixture(t);
  for (const file of [f.connectorPath, f.cachePath, f.reportPath]) fs.unlinkSync(file);
  const plan = recovery.planRecovery(f.options);
  assert.equal(plan.retained_rows, 1); assert.deepEqual(plan.interrupted_run_ids, []); assert.equal(plan.files.length, 1);
  const receipt = recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe });
  assert.equal(receipt.completion_authority, false);
  assert.deepEqual(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows, [f.rows[0]]);
  for (const file of [f.connectorPath, f.cachePath, f.reportPath]) assert.equal(fs.existsSync(file), false);
  assert.throws(() => checkCapture('vdg-local', 'http', { sourceRoot: f.projectRoot, evidenceRoot: f.evidenceRoot }));
});
test('a genuine product NO_GO without the exact global deadline is left intact', t => {
  const f = fixture(t); f.rows[1] = f.successful(1); f.rows[1].failure_reasons = ['click-failed']; f.save();
  const before = ownedBytes(f), plan = recovery.planRecovery(f.options);
  assert.equal(plan.needed, false);
  const result = recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe });
  assert.equal(result.completion_authority, false); assertSame(before);
});

test('later checkpoint-only deadline can recover while earlier interrupted run remains archived and nonreusable', t => {
  const f = fixture(t), first = recovery.planRecovery(f.options);
  recovery.applyRecovery(first, { archiveRoot: f.archiveRoot, assertSafe: safe });
  const oldConnector = fs.readFileSync(f.connectorPath), oldReport = fs.readFileSync(f.reportPath);
  const nextDeadline = { ...f.rows[1], selector: '#control-2' };
  openCaptureCheckpoint(f.checkpointOptions).save({ rows: [f.rows[0], f.successful(1), nextDeadline], observations: [], pageerrors: [] });
  const second = recovery.planRecovery(f.options); assert.equal(second.retained_rows, 2); assert.equal(second.files.length, 1);
  recovery.applyRecovery(second, { archiveRoot: f.archiveRoot, assertSafe: safe });
  assert.equal(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows.length, 2);
  assert.equal(fs.readFileSync(f.connectorPath).equals(oldConnector), true); assert.equal(fs.readFileSync(f.reportPath).equals(oldReport), true);
});

test('a hold appearing during costly PNG validation prevents the very next evidence mutation', t => {
  const f = fixture(t), plan = recovery.planRecovery(f.options), before = ownedBytes(f);
  const hold = path.join(f.root, 'HOLD'), originalRead = fs.readFileSync; let fences = 0, injected = false;
  fs.readFileSync = function(filename, ...args) {
    const bytes = originalRead.call(this, filename, ...args);
    if (!injected && fences >= 3 && String(filename).endsWith('.png')) { fs.writeFileSync(hold, 'operator stop during PNG verification'); injected = true; }
    return bytes;
  };
  try {
    assert.throws(() => recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe() { fences += 1; if (fs.existsSync(hold)) throw new Error('operator hold'); } }), /operator hold/);
  } finally { fs.readFileSync = originalRead; }
  assert.equal(injected, true); assertSame(before);
});

test('actual owner read-only post-command guard returns ordinary1 for interruption without changing evidence', t => {
  const f = fixture(t), before = ownedBytes(f), result = ownerFixture(f, { mode: 'guard-needed' });
  assert.equal(result.status, 1, result.stderr); assert.equal(JSON.parse(result.stdout).needed, true); assertSame(before); assert.equal(fs.existsSync(f.archiveRoot), false);
});
test('post-command guard permits a clean prefix while preserving strict acquisition authority', t => {
  const f = fixture(t); recovery.applyRecovery(recovery.planRecovery(f.options), { archiveRoot: f.archiveRoot, assertSafe: safe });
  const before = new Map([f.checkpointPath, f.connectorPath, f.reportPath].map(file => [file, fs.readFileSync(file)]));
  const result = ownerFixture(f, { mode: 'guard-clean' }); assert.equal(result.status, 0, result.stderr); assertSame(before);
  assert.throws(() => checkCapture('vdg-local', 'http', { sourceRoot: f.projectRoot, evidenceRoot: f.evidenceRoot }));
});
test('post-command guard leaves genuine product NO_GO to strict acceptance rather than classifying it interrupted', t => {
  const f = fixture(t); f.rows[1] = f.successful(1); f.rows[1].failure_reasons = ['click-failed']; f.save(); const before = ownedBytes(f);
  const result = ownerFixture(f, { mode: 'guard-product' }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).needed, false); assertSame(before);
});
test('post-command guard blocks checkpoint-only interruption even without final report or registry', t => {
  const f = fixture(t); for (const file of [f.connectorPath, f.cachePath, f.reportPath]) fs.unlinkSync(file); const before = fs.readFileSync(f.checkpointPath);
  const result = ownerFixture(f, { mode: 'guard-checkpoint-only' }); assert.equal(result.status, 1, result.stderr);
  assert.equal(fs.readFileSync(f.checkpointPath).equals(before), true); assert.equal(fs.existsSync(f.archiveRoot), false);
});

for (const api of ['page.evaluate', 'page.screenshot', 'locator.click', 'locator.screenshot', 'browserContext.newPage', 'frame.evaluate', '']) test(`global test deadline is recognized independently of awaited API: ${api || 'raw reason'}`, t => {
  const f = fixture(t); f.rows[1].failure_reasons = [`${api ? api + ': ' : ''}Test timeout of 21600000ms exceeded.`]; f.save();
  const plan = recovery.planRecovery(f.options); assert.equal(plan.needed, true); assert.equal(plan.retained_rows, 1);
  const before = ownedBytes(f), result = ownerFixture(f, { mode: 'guard-needed' });
  assert.equal(result.status, 1, result.stderr); assertSame(before);
  recovery.applyRecovery(plan, { archiveRoot: f.archiveRoot, assertSafe: safe });
  assert.deepEqual(openCaptureCheckpoint(f.checkpointOptions).snapshot.rows, [f.rows[0]]);
});
test('ordinary action/row timeouts and product errors remain semantic failures, not repair candidates', t => {
  const f = fixture(t);
  for (const reason of ['row timed out after 45s', 'locator.click: Timeout 3000ms exceeded.', 'page.screenshot: Timeout 5000ms exceeded.', 'page.waitForTimeout: Test timeout of 7200000ms exceeded.', 'page.evaluate: Error: Test timeout of 21600000ms exceeded.', 'Error: Test timeout of 21600000ms exceeded.', 'product returned a description of Test timeout of 21600000ms exceeded.']) {
    assert.equal(recovery.isGlobalTestDeadline(reason, 21600000), false);
    f.rows[1].failure_reasons = [reason]; f.save(); const before = ownedBytes(f);
    assert.equal(recovery.planRecovery(f.options).needed, false); assertSame(before);
  }
});
test('global screenshot deadline on a partially performed row refuses clean and never erases original evidence', t => {
  const f = fixture(t); f.rows[1] = f.successful(1); f.rows[1].failure_reasons = ['page.screenshot: Test timeout of 21600000ms exceeded.']; f.save();
  const before = ownedBytes(f); assert.throws(() => recovery.planRecovery(f.options), /unsupported action evidence/);
  const result = ownerFixture(f, { mode: 'guard-needed' }); assert.notEqual(result.status, 0); assertSame(before);
});
test('global deadline alongside real product errors refuses clean instead of discarding those errors', t => {
  const f = fixture(t); f.rows[1].failure_reasons = ['locator.click: Test timeout of 21600000ms exceeded.', 'click-failed']; f.save();
  const before = ownedBytes(f); assert.throws(() => recovery.planRecovery(f.options), /unsupported action evidence/); assertSame(before);
});
test('a global deadline preserved in row pageerrors also cannot be reported clean', t => {
  const f = fixture(t); f.rows[1] = f.successful(1); f.rows[1].pageerrors = ['page.evaluate: Test timeout of 21600000ms exceeded.']; f.save();
  assert.throws(() => recovery.planRecovery(f.options), /unsupported action evidence/);
});
test('the exact global first line survives the helper call-log truncation without interpreting the log as an error kind', t => {
  const f = fixture(t); f.rows[1].failure_reasons = ['locator.click: Test timeout of 21600000ms exceeded.\nCall log:\n  - waiting for actual control'.slice(0, 180)]; f.save();
  assert.equal(recovery.planRecovery(f.options).needed, true);
});

test('a global deadline in session-level errors refuses clean without manufacturing repair eligibility', t => {
  const f = fixture(t); f.rows[1] = f.successful(1); f.save();
  const value = JSON.parse(fs.readFileSync(f.checkpointPath)); value.payload.pageerrors = ['page.evaluate: Test timeout of 21600000ms exceeded.']; value.payload_sha256 = compactHash(value.payload); write(f.checkpointPath, value);
  const before = ownedBytes(f); assert.throws(() => recovery.planRecovery(f.options), /global test deadline in session errors/);
  const result = ownerFixture(f, { mode: 'guard-needed' }); assert.notEqual(result.status, 0); assertSame(before);
});
test('unknown semantic text after the global first line blocks clean and is never automatically discarded', t => {
  const f = fixture(t); f.rows[1].failure_reasons = ['page.evaluate: Test timeout of 21600000ms exceeded.\nActual product error: failed to persist data']; f.save();
  assert.equal(recovery.isGlobalTestDeadline(f.rows[1].failure_reasons[0], 21600000), true);
  assert.equal(recovery.replayableGlobalTestDeadline(f.rows[1].failure_reasons[0], 21600000), false);
  const before = ownedBytes(f); assert.throws(() => recovery.planRecovery(f.options), /unsupported action evidence/);
  const result = ownerFixture(f, { mode: 'guard-needed' }); assert.notEqual(result.status, 0); assertSame(before);
});

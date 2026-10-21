import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceScripts = fileURLToPath(new URL('../../scripts/', import.meta.url));
const targets = [
  ['pilot', 'pilot/image-viewer.json'],
  ['storage', 'storage.json'],
  ['datasets', 'datasets.json'],
  ['accelerate', 'accelerate.json'],
  ['network', 'network.json'],
  ['control', 'control.json'],
  ['local', 'local.json'],
];

async function putJson(file, body) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(body)}\n`);
}

async function getJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'vog-coverage-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = path.join(root, 'swissknife/scripts');
  await mkdir(scripts, { recursive: true });
  for (const name of [
    'build-orb-idl-gui-coverage.cjs',
    'vog_closeout_requires_go.py',
    'vog_live_click_requires_observation.py',
  ]) {
    await copyFile(path.join(sourceScripts, name), path.join(scripts, name));
  }
  const evidence = path.join(root, 'swissknife/test-results/virtual-desktop-ipfs-mcp-orb');
  const screenshot = path.join(root, 'screenshot.png');
  await writeFile(screenshot, Buffer.alloc(256));
  const reports = {};
  for (const [index, [name, relative]] of targets.entries()) {
    const local = name === 'local';
    const rows = Array.from({ length: index + 1 }, (_, rowIndex) => ({
      app_id: local ? 'calculator' : 'image-viewer',
      selector: `#${name}-${rowIndex}`,
      clicked: true,
      screenshot_before: 'screenshot.png',
      screenshot_after: 'screenshot.png',
      disposition: local ? 'local-only' : 'invoke',
      mcp_call_count: local ? 0 : 1,
      observation: local ? null : {
        route: '/mcp/tools/call',
        tool_id: 'fixture.tool',
        transport: 'http',
        correlation_id: `${name}-${rowIndex}`,
        policy_outcome: 'allowed',
        receipt_id: `receipt-${name}-${rowIndex}`,
        event_dag_cid: `cid-${name}-${rowIndex}`,
        outcome: 'executed',
        dry_run: true,
      },
    }));
    const file = path.join(evidence, 'live-clicks', relative);
    reports[name] = file;
    await putJson(file, {
      target: name,
      decision: 'GO',
      passed: true,
      clicked: true,
      owner_health: 'up',
      row_count: rows.length,
      rows,
    });
  }
  return {
    root,
    reports,
    screenshot,
    aggregate: path.join(evidence, 'vog/orb-idl-gui-coverage.json'),
    build: () => spawnSync(process.execPath, [path.join(scripts, 'build-orb-idl-gui-coverage.cjs')], {
      cwd: root, encoding: 'utf8',
    }),
    closeout: () => spawnSync('python3', [path.join(scripts, 'vog_closeout_requires_go.py')], {
      cwd: root, encoding: 'utf8',
    }),
  };
}

function succeeds(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function rejectsBuild(result) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
}

function withholds(result, reason) {
  assert.equal(result.status, 75, `${result.stdout}\n${result.stderr}`);
  if (reason) assert.match(result.stdout, reason);
}

test('seven independently valid inputs produce GO and allow closeout', async (t) => {
  const item = await fixture(t);
  succeeds(item.build());
  const report = await getJson(item.aggregate);
  assert.equal(report.decision, 'GO');
  assert.deepEqual(report.targets.map(({ target, row_count }) => [target, row_count]),
    targets.map(([target], index) => [target, index + 1]));
  succeeds(item.closeout());
});

test('legacy pilot cannot publish GO or pass a previously generated aggregate', async (t) => {
  const item = await fixture(t);
  succeeds(item.build());
  const previous = await readFile(item.aggregate, 'utf8');
  const pilot = await getJson(item.reports.pilot);
  delete pilot.owner_health;
  delete pilot.rows[0].observation.outcome;
  await putJson(item.reports.pilot, pilot);
  const result = item.build();
  rejectsBuild(result);
  assert.match(result.stderr, /owner health down/);
  assert.equal(await readFile(item.aggregate, 'utf8'), previous);
  withholds(item.closeout(), /target=pilot observation validation failed/);
});

for (const [name, alter] of [
  ['missing receipt', (report) => { delete report.rows[0].observation.receipt_id; }],
  ['missing owner execution outcome', (report) => { delete report.rows[0].observation.outcome; }],
  ['failed owner execution', (report) => { report.rows[0].observation.outcome = 'failed'; }],
  ['missing dry run', (report) => { report.rows[0].observation.dry_run = false; }],
  ['missing screenshot', (report) => { report.rows[0].screenshot_before = 'missing.png'; }],
  ['owner health down', (report) => { report.owner_health = 'down'; }],
  ['wrong input target', (report) => { report.target = 'local'; }],
  ['incorrect input row count', (report) => { report.row_count += 1; }],
]) {
  test(`both gates reject ${name} behind GO headers`, async (t) => {
    const item = await fixture(t);
    succeeds(item.build());
    const report = await getJson(item.reports.storage);
    alter(report);
    await putJson(item.reports.storage, report);
    rejectsBuild(item.build());
    withholds(item.closeout(), /target=storage/);
  });
}

for (const [name, alter] of [
  ['missing target', (report) => { report.targets.pop(); }],
  ['duplicate target', (report) => { report.targets[6] = report.targets[0]; }],
  ['unexpected target', (report) => { report.targets[6].target = 'unexpected'; }],
  ['wrong target count', (report) => { report.targets[0].row_count += 1; }],
  ['boolean target count', (report) => { report.targets[0].row_count = true; }],
  ['target did not pass', (report) => { report.targets[0].passed = false; }],
  ['target was not clicked', (report) => { report.targets[0].clicked = false; }],
  ['target is no_go', (report) => { report.targets[0].decision = 'no_go'; }],
]) {
  test(`closeout rejects an aggregate with ${name}`, async (t) => {
    const item = await fixture(t);
    succeeds(item.build());
    const report = await getJson(item.aggregate);
    alter(report);
    await putJson(item.aggregate, report);
    withholds(item.closeout());
  });
}

test('explicit well-formed no_go still writes coverage successfully and withholds closeout', async (t) => {
  const item = await fixture(t);
  const report = await getJson(item.reports.pilot);
  report.decision = 'no_go';
  report.passed = false;
  report.clicked = false;
  report.owner_health = 'down';
  report.rows = [];
  report.row_count = 0;
  await putJson(item.reports.pilot, report);
  succeeds(item.build());
  const coverage = await getJson(item.aggregate);
  assert.equal(coverage.decision, 'no_go');
  assert.equal(coverage.passed, false);
  assert.equal(coverage.targets[0].row_count, 0);
  withholds(item.closeout(), /decision=no_go/);
});

for (const [name, alter] of [
  ['missing', async (file) => rm(file)],
  ['invalid JSON', async (file) => writeFile(file, '{broken')],
  ['JSON array', async (file) => putJson(file, [])],
  ['invalid rows', async (file) => {
    const report = await getJson(file);
    report.rows = [null];
    await putJson(file, report);
  }],
]) {
  test(`both gates reject ${name} input without publishing new coverage`, async (t) => {
    const item = await fixture(t);
    succeeds(item.build());
    const previous = await readFile(item.aggregate, 'utf8');
    await alter(item.reports.pilot);
    rejectsBuild(item.build());
    assert.equal(await readFile(item.aggregate, 'utf8'), previous);
    withholds(item.closeout());
  });
}

test('closeout retains its untested supervisor repair safeguard', async (t) => {
  const item = await fixture(t);
  succeeds(item.build());
  await putJson(path.join(item.root,
    'data/agent_supervisor/virtual_desktop_orb_idl_gui/unstall-repair/packet.json'), {
    body_free: true, missing_handler: 'new_recovery_handler',
  });
  withholds(item.closeout(), /untested_handler=new_recovery_handler/);
  const watchdogTest = path.join(item.root,
    'external/ipfs_accelerate/test/api/test_agent_supervisor_supervisor_watchdog.py');
  await mkdir(path.dirname(watchdogTest), { recursive: true });
  await writeFile(watchdogTest, 'def test_new_recovery_handler(): pass\n');
  succeeds(item.closeout());
});

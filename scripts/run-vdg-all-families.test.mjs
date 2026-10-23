import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FAMILY_NAMES, TRANSPORTS, parseArguments, runAllFamilies, runChild } from './run-vdg-all-families.mjs';

const cell = (family, transport) => `${family}:${transport}`;
const proof = (family, transport) => ({ family, transport, capture_complete: true,
  input_fingerprint: 'current-source-binding', acceptance_decision: 'no_go', completion_authority: false });
const checker = complete => (family, transport) => {
  if (!complete.has(cell(family, transport))) throw new Error('capture source binding is stale or missing');
  return proof(family, transport);
};

test('rejects unbounded or ambiguous CLI settings before starting acquisition', () => {
  assert.deepEqual(parseArguments([]), { concurrency: 3, timeoutSeconds: 1800, fresh: false, check: false });
  assert.equal(parseArguments(['--concurrency', '2', '--timeout-seconds', '120', '--fresh']).concurrency, 2);
  for (const args of [['--concurrency', '4'], ['--concurrency', '0'], ['--concurrency'], ['--timeout-seconds', '0'],
    ['--timeout-seconds', '22201'], ['--timeout-seconds', '22200.5'], ['--fresh', '--fresh'], ['--check', '--fresh'], ['--family', 'vdg-storage']]) {
    assert.throws(() => parseArguments(args), /usage:/);
  }
});

test('explicit long browser workload remains bounded and reaches every owned worker', async () => {
  assert.equal(parseArguments(['--timeout-seconds', '14400']).timeoutSeconds, 14400);
  assert.equal(parseArguments(['--timeout-seconds', '22200']).timeoutSeconds, 22200);
  const bounds = [];
  const result = await runAllFamilies({ fresh: true, timeoutSeconds: 22200 }, {
    checkCapture: proof, runChild: async (_executable, _args, options) => { bounds.push(options.timeoutSeconds); return { status: 0 }; },
  });
  assert.equal(result.exit_code, 0); assert.equal(bounds.length, 12);
  assert.ok(bounds.every(value => value === 22200));
});

test('acquires three distinct families concurrently while each HTTP precedes its libp2p', async () => {
  const complete = new Set();
  const active = new Set();
  const order = new Map();
  const calls = [];
  let maximum = 0;
  const result = await runAllFamilies({}, { checkCapture: checker(complete), runChild: async (executable, args, options) => {
    const [, family, transport] = args;
    assert.equal(executable, process.execPath);
    assert.equal(active.has(family), false, 'same connector target overlapped its transports');
    assert.ok(args[0].endsWith('run-vdg-family.mjs'));
    assert.deepEqual(args.slice(3), ['--capture-only']);
    assert.equal(options.timeoutSeconds, 1800);
    if (transport === 'libp2p') assert.ok(complete.has(cell(family, 'http')));
    active.add(family); maximum = Math.max(maximum, active.size);
    assert.ok(active.size <= 3);
    calls.push(args);
    order.set(family, [...(order.get(family) || []), transport]);
    await new Promise(resolve => setTimeout(resolve, 3));
    complete.add(cell(family, transport)); active.delete(family);
    return { status: 0 };
  } });
  assert.equal(maximum, 3);
  assert.equal(calls.length, 12);
  assert.equal(result.exit_code, 0);
  assert.equal(result.acquisition_complete, true);
  assert.equal(result.acceptance_decision, 'not_evaluated');
  assert.equal(result.completion_authority, false);
  assert.ok(result.captures.every(item => item.acceptance_decision === 'no_go'));
  for (const family of FAMILY_NAMES) assert.deepEqual(order.get(family), ['http', 'libp2p']);
});

test('reuses valid source-bound acquisitions and reacquires only a stale cell', async () => {
  const complete = new Set(FAMILY_NAMES.flatMap(family => TRANSPORTS.map(transport => cell(family, transport))));
  const calls = [];
  const dependencies = { checkCapture: checker(complete), runChild: async (_executable, args) => {
    calls.push(args); complete.add(cell(args[1], args[2])); return { status: 0 };
  } };
  assert.equal((await runAllFamilies({}, dependencies)).exit_code, 0);
  assert.equal(calls.length, 0);
  complete.delete(cell('vdg-datasets', 'libp2p'));
  const result = await runAllFamilies({}, dependencies);
  assert.equal(result.exit_code, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(1), ['vdg-datasets', 'libp2p', '--capture-only']);
  assert.equal(result.workers.filter(item => item.reused).length, 11);
});

test('fresh is an explicit one-pass recapture of every transport and family', async () => {
  let calls = 0;
  const result = await runAllFamilies({ fresh: true }, {
    checkCapture: proof,
    runChild: async (_executable, args) => { calls += 1; assert.ok(args.includes('--fresh')); return { status: 0 }; },
  });
  assert.equal(calls, 12);
  assert.equal(result.exit_code, 0);
});

test('all-check is read only and requires all current source-bound cells', async () => {
  const complete = new Set(FAMILY_NAMES.flatMap(family => TRANSPORTS.map(transport => cell(family, transport))));
  const dependencies = { checkCapture: checker(complete), runChild: () => assert.fail('read-only check launched a worker') };
  assert.equal((await runAllFamilies({ check: true }, dependencies)).exit_code, 0);
  complete.delete(cell('vdg-local', 'http'));
  const result = await runAllFamilies({ check: true }, dependencies);
  assert.equal(result.exit_code, 75);
  assert.equal(result.acquisition_complete, false);
  assert.deepEqual(result.captures.filter(item => !item.capture_complete).map(item => [item.family, item.transport]), [['vdg-local', 'http']]);
});

test('actual worker failure is preserved even when other or old captures look complete', async () => {
  const result = await runAllFamilies({ fresh: true }, {
    checkCapture: proof,
    runChild: async (_executable, args) => ({ status: args[1] === 'vdg-datasets' && args[2] === 'http' ? 37 : 0 }),
  });
  assert.equal(result.exit_code, 37);
  assert.equal(result.acquisition_complete, false);
  assert.equal(result.workers.length, 12, 'one family failure starved independent acquisition');
});

test('a zero worker exit cannot hide missing or invalid acquisition proof', async () => {
  const result = await runAllFamilies({}, {
    checkCapture: () => { throw new Error('capture report hash mismatch'); }, runChild: async () => ({ status: 0 }),
  });
  assert.equal(result.exit_code, 75);
  assert.equal(result.acquisition_complete, false);
  assert.ok(result.captures.every(item => item.reason === 'capture report hash mismatch'));
});

test('final current-source checks reject acquisitions invalidated during other work', async () => {
  const complete = new Set();
  const result = await runAllFamilies({ concurrency: 1 }, {
    checkCapture: checker(complete), runChild: async (_executable, args) => {
      complete.add(cell(args[1], args[2]));
      if (args[1] === FAMILY_NAMES.at(-1) && args[2] === 'libp2p') complete.delete(cell(FAMILY_NAMES[0], 'http'));
      return { status: 0 };
    },
  });
  assert.equal(result.exit_code, 75);
  assert.equal(result.captures[0].capture_complete, false);
});

test('cancellation launches no further family or transport work', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await runAllFamilies({ concurrency: 1 }, {
    signal: controller.signal, checkCapture: () => { throw new Error('missing'); },
    runChild: async () => { calls += 1; controller.abort(); return { status: 143 }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.exit_code, 143);
  assert.equal(result.acquisition_complete, false);
});

test('owned worker preserves a real failure code without shell interpretation', async () => {
  const result = await runChild(process.execPath, ['-e', 'process.exit(29)'], { timeoutSeconds: 1 });
  assert.equal(result.status, 29);
});

test('timeout remains a failure when a worker handles TERM by exiting zero', async () => {
  const result = await runChild(process.execPath, ['-e', "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)"], { timeoutSeconds: 0.2 });
  assert.equal(result.status, 124);
});

test('timeout cleans a resistant child even after its leader exits on TERM', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-acquisition-tree-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const child = path.join(directory, 'child.mjs');
  const leader = path.join(directory, 'leader.mjs');
  const pidfile = path.join(directory, 'child.pid');
  fs.writeFileSync(child, `import fs from 'node:fs'; process.on('SIGTERM', () => {}); fs.writeFileSync(${JSON.stringify(pidfile)}, String(process.pid)); setInterval(() => {}, 1000);`);
  fs.writeFileSync(leader, `import {spawn} from 'node:child_process'; spawn(process.execPath, [${JSON.stringify(child)}], {stdio:'inherit'}); setInterval(() => {}, 1000);`);
  const result = await runChild(process.execPath, [leader], { timeoutSeconds: 0.4 });
  assert.equal(result.status, 124);
  assert.ok(fs.existsSync(pidfile));
  const pid = Number(fs.readFileSync(pidfile, 'utf8'));
  const deadline = Date.now() + 1000;
  const alive = () => {
    try { return !['Z', 'X'].includes(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[0]); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  while (alive() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(alive(), false);
});

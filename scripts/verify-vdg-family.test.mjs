import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments, verifyFamily } from './verify-vdg-family.mjs';

function fixture(complete = []) {
  const acquired = new Set(complete);
  const state = { strictStatus: 75, captureStatus: 0, checks: [], calls: [], recordCapture: true };
  const dependencies = {
    checkCapture: (family, transport) => {
      state.checks.push(transport);
      if (!acquired.has(transport)) throw new Error('capture source binding stale or missing');
      return { family, transport, capture_complete: true, acceptance_decision: 'no_go' };
    },
    runChild: async (executable, args, options) => {
      assert.equal(executable, process.execPath);
      state.calls.push({ args, options });
      if (args[0].endsWith('check-vdg-family-evidence.cjs')) return { status: state.strictStatus };
      assert.ok(args[0].endsWith('run-vdg-family.mjs'));
      assert.deepEqual(args.slice(3), ['--capture-only']);
      if (state.recordCapture) acquired.add(args[2]);
      return { status: state.captureStatus };
    },
  };
  return { state, dependencies, acquired };
}

test('only known family verification and bounded options are accepted', () => {
  assert.deepEqual(parseArguments(['vdg-datasets']), { family: 'vdg-datasets', check: false, timeoutSeconds: 1800 });
  for (const args of [[], ['datasets'], ['vdg-datasets', '--fresh'], ['vdg-datasets', '--check', '--check'],
    ['vdg-datasets', '--timeout-seconds'], ['vdg-datasets', '--timeout-seconds', '0'],
    ['vdg-datasets', '--timeout-seconds', '22201'], ['vdg-datasets', '--timeout-seconds', '22200.5']]) {
    assert.throws(() => parseArguments(args), /usage:/);
  }
});

test('current acquisitions are reused but full family refusal remains 75', async () => {
  const f = fixture(['http', 'libp2p']);
  const result = await verifyFamily({ family: 'vdg-datasets' }, f.dependencies);
  assert.equal(result.exit_code, 75);
  assert.deepEqual(f.state.checks, ['http', 'libp2p']);
  assert.equal(f.state.calls.length, 1);
  assert.ok(f.state.calls[0].args[0].endsWith('check-vdg-family-evidence.cjs'));
  assert.ok(result.acquisitions.every(item => item.reused));
  assert.equal(result.completion_authority, false);
});

test('both transports can be acquired before either has family GO', async () => {
  const f = fixture();
  const result = await verifyFamily({ family: 'vdg-datasets' }, f.dependencies);
  assert.deepEqual(f.state.calls.slice(0, 2).map(item => item.args[2]), ['http', 'libp2p']);
  assert.ok(f.state.calls[2].args[0].endsWith('check-vdg-family-evidence.cjs'));
  assert.ok(result.acquisitions.every(item => item.capture_complete));
  assert.equal(result.exit_code, 75, 'complete acquisition was incorrectly promoted to acceptance');
});

test('a source-invalidated transport is collected once while a current peer is reused', async () => {
  const f = fixture(['http']);
  f.state.strictStatus = 0;
  const result = await verifyFamily({ family: 'vdg-datasets' }, f.dependencies);
  assert.equal(result.exit_code, 0);
  assert.equal(f.state.calls.length, 2);
  assert.equal(f.state.calls[0].args[2], 'libp2p');
  assert.deepEqual(result.acquisitions.map(item => item.reused), [true, false]);
});

test('check mode performs only the strict family check and never captures', async () => {
  const f = fixture();
  const result = await verifyFamily({ family: 'vdg-control', check: true }, f.dependencies);
  assert.equal(result.exit_code, 75);
  assert.deepEqual(f.state.checks, []);
  assert.equal(f.state.calls.length, 1);
  assert.deepEqual(f.state.calls[0].args.slice(1), ['vdg-control', '--check']);
});

test('a real capture failure survives a later green or withheld strict gate', async () => {
  for (const strictStatus of [0, 75]) {
    const f = fixture(); f.state.captureStatus = 39; f.state.strictStatus = strictStatus;
    const result = await verifyFamily({ family: 'vdg-datasets' }, f.dependencies);
    assert.equal(result.exit_code, 39);
    assert.equal(result.strict_exit_code, strictStatus);
    assert.equal(f.state.calls.length, 3);
  }
});

test('zero acquisition subprocess exit needs independent positive capture proof', async () => {
  const f = fixture(); f.state.recordCapture = false; f.state.strictStatus = 0;
  const result = await verifyFamily({ family: 'vdg-datasets' }, f.dependencies);
  assert.equal(result.exit_code, 75);
  assert.ok(result.acquisitions.every(item => item.capture_complete === false));
});

test('capture timeouts are bounded and the strict check has its own short bound', async () => {
  const f = fixture();
  assert.equal(parseArguments(['vdg-local', '--timeout-seconds', '14400']).timeoutSeconds, 14400);
  assert.equal(parseArguments(['vdg-local', '--timeout-seconds', '22200']).timeoutSeconds, 22200);
  await verifyFamily({ family: 'vdg-local', timeoutSeconds: 22200 }, f.dependencies);
  assert.deepEqual(f.state.calls.map(item => item.options.timeoutSeconds), [22200, 22200, 300]);
});

test('cancelled verification starts no capture or strict child', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  const result = await verifyFamily({ family: 'vdg-storage' }, { ...f.dependencies, signal: controller.signal });
  assert.equal(result.exit_code, 143);
  assert.deepEqual(f.state.calls, []);
});

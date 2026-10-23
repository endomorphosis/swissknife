import test from 'node:test';
import assert from 'node:assert/strict';
import { main as familyMain } from './run-vdg-family.mjs';
import { main as allMain, FAMILY_NAMES } from './run-vdg-all-families.mjs';
import { main as verifyMain } from './verify-vdg-family.mjs';

test('every actual CLI parses invalid arguments before inventory checks or subprocess work', async () => {
  for (const [main, args] of [[familyMain, ['not-a-family', 'http']], [allMain, ['--concurrency', '0']], [verifyMain, ['vdg-storage', '--unknown']]]) {
    let guards = 0; let children = 0;
    await assert.rejects(async () => main(args, {
      ensureInventory() { guards++; return 0; }, spawnSync() { children++; return { status: 0 }; }, runChild() { children++; return { status: 0 }; },
    }), /usage:/);
    assert.equal(guards, 0); assert.equal(children, 0);
  }
});
test('family list enumerates only when requested and does not trigger inventory collection', () => {
  let guards = 0; const children = [];
  const result = familyMain(['vdg-datasets', 'http', '--list'], {
    ensureInventory() { guards++; return 89; }, spawnSync(_executable, args) { children.push(args); return { status: 0 }; },
  });
  assert.equal(result, 0); assert.equal(guards, 0); assert.equal(children.length, 1); assert.ok(children[0].includes('--list'));
});
test('a failed inventory guard propagates its status and suppresses every capture or strict child', async () => {
  for (const [main, args] of [[familyMain, ['vdg-storage', 'http']], [allMain, ['--fresh']], [verifyMain, ['vdg-storage']]]) {
    const guards = []; let children = 0;
    const result = await main(args, {
      sourceRoot: '/reviewed/source', evidenceRoot: '/reviewed/evidence', env: { REVIEWED: 'fixture' },
      ensureInventory(options) { guards.push(options); return 73; },
      spawnSync() { children++; return { status: 0 }; }, runChild() { children++; return { status: 0 }; },
    });
    assert.equal(result, 73); assert.equal(children, 0); assert.equal(guards.length, 1);
    assert.equal(guards[0].check, false); assert.equal(guards[0].sourceRoot, '/reviewed/source');
    assert.equal(guards[0].evidenceRoot, '/reviewed/evidence'); assert.deepEqual(guards[0].env, { REVIEWED: 'fixture' });
  }
});
test('read-only all-family check invokes only a read-only inventory guard and proof inspection', async () => {
  const guards = []; const inspections = []; let children = 0;
  const result = await allMain(['--check'], {
    ensureInventory(options) { guards.push(options); return 0; }, runChild() { children++; return { status: 0 }; },
    checkCapture(family, transport) { inspections.push([family, transport]); return { family, transport, capture_complete: true }; },
  });
  assert.equal(result, 0); assert.deepEqual(guards.map(guard => guard.check), [true]); assert.equal(children, 0);
  assert.equal(inspections.length, FAMILY_NAMES.length * 2);
});
test('read-only verification never repairs inventory or starts a capture when its inventory is stale', async () => {
  const guards = []; let children = 0;
  const result = await verifyMain(['vdg-control', '--check'], {
    ensureInventory(options) { guards.push(options); return 75; }, runChild() { children++; return { status: 0 }; },
  });
  assert.equal(result, 75); assert.deepEqual(guards.map(guard => guard.check), [true]); assert.equal(children, 0);
});
test('read-only verification with current inventory runs the strict evidence child and no capture', async () => {
  const guards = []; const children = [];
  const result = await verifyMain(['vdg-control', '--check'], {
    ensureInventory(options) { guards.push(options); return 0; },
    runChild: async (_executable, args) => { children.push(args); return { status: 75 }; },
  });
  assert.equal(result, 75); assert.deepEqual(guards.map(guard => guard.check), [true]);
  assert.equal(children.length, 1); assert.ok(children[0][0].endsWith('check-vdg-family-evidence.cjs'));
});
test('a successful inventory guard runs before any real family capture attempt', () => {
  const order = [];
  const status = familyMain(['vdg-storage', 'http', '--fresh'], {
    ensureInventory() { order.push('inventory'); return 0; },
    spawnSync(_executable, args) { order.push(args.some(arg => arg.endsWith('run-with-owned-port.mjs')) ? 'capture' : 'coverage'); return { status: 48 }; },
  });
  assert.equal(status, 48); assert.deepEqual(order, ['inventory', 'capture', 'coverage']);
});

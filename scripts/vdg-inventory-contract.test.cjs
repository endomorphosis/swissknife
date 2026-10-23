'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inventorySourceFingerprint } = require('./vdg-capture-fingerprint.cjs');
const { RAW_CENSUS, assertInventorySource, inspectInventory, commitInventoryCensus, ensureInventory } = require('./vdg-inventory-contract.cjs');
const { prepareRenderedInputs, checkRenderedInputs } = require('./prepare-vdg-rendered-inputs.cjs');
function fixture(t) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-inventory-contract-'));
  t.after(() => fs.rmSync(sourceRoot, { recursive: true, force: true }));
  const evidenceRoot = path.join(sourceRoot, 'evidence');
  fs.mkdirSync(path.join(sourceRoot, 'web/js/apps'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'web/js/apps/ai-chat.js'), 'export const binding = "before";');
  const census = { schema: 'swissknife.rendered-control-census.v1', collection: 'live-dom', source_template: false, clicked: false,
    source_fingerprint: inventorySourceFingerprint({ sourceRoot }), rows: [], row_count: 0 };
  const options = { sourceRoot, evidenceRoot };
  const raw = path.join(evidenceRoot, RAW_CENSUS);
  commitInventoryCensus(census, raw, options);
  return { ...options, census, raw, options, write: (relative, content) => {
    const filename = path.join(sourceRoot, relative); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content);
  } };
}
test('attribute-only actual app repair invalidates a raw census and cannot be projected or committed as current', t => {
  const f = fixture(t); const original = fs.readFileSync(f.raw, 'utf8');
  assert.equal(assertInventorySource(f.census, f.options), f.census.source_fingerprint);
  f.write('web/js/apps/ai-chat.js', 'export const binding = "reviewed-native-binding";');
  const report = inspectInventory(f.options, { checkRenderedInputs: () => assert.fail('must reject before projection') });
  assert.equal(report.current, false); assert.match(report.reason, /inventory_source_stale/);
  assert.throws(() => commitInventoryCensus(f.census, f.raw, f.options), /inventory_source_stale/);
  assert.equal(fs.readFileSync(f.raw, 'utf8'), original);
  for (const fn of [prepareRenderedInputs, checkRenderedInputs]) assert.throws(() => fn({ ...f.options, freshSource: true }), /inventory_source_stale/);
  assert.equal(fs.existsSync(path.join(f.evidenceRoot, 'control-census.json')), false);
});
test('new app modules and real shared source changes also invalidate inventory', t => {
  for (const [filename, content] of [['web/js/apps/new-app.js', 'export const actual = true;'], ['web/js/main-simple.js', 'actual changed bootstrap']]) {
    const f = fixture(t); f.write(filename, content);
    assert.throws(() => assertInventorySource(f.census, f.options), /inventory_source_stale/);
  }
});
test('timestamps, census history, discovery and generated outputs cannot invalidate source-only identity', t => {
  const f = fixture(t);
  for (const filename of ['evidence/vdg/inventory/history/previous.json', 'evidence/vdg/inventory/owner-tools.json',
    'evidence/control-tool-matrix.json', 'test-results/virtual-desktop-ipfs-mcp-orb/gui-mcp-coverage.json']) f.write(filename, '{"generated_at":"new-clock","rows":["history"]}');
  f.census.generated_at = 'new-clock';
  assert.equal(assertInventorySource(f.census, f.options), f.census.source_fingerprint);
  const report = inspectInventory(f.options, { checkRenderedInputs: settings => assert.equal(settings.freshSource, true) });
  assert.equal(report.current, true); assert.equal(report.completion_authority, false);
});
test('unbound, malformed and non-live raw census cannot enter fresh-source preparation', t => {
  for (const change of [census => { delete census.source_fingerprint; }, census => { census.source_fingerprint = 'unverified'; },
    census => { census.clicked = true; }, census => { census.source_template = true; }]) {
    const f = fixture(t); change(f.census); fs.writeFileSync(f.raw, JSON.stringify(f.census));
    assert.equal(inspectInventory(f.options, { checkRenderedInputs: () => assert.fail('unexpected projection') }).current, false);
    assert.throws(() => prepareRenderedInputs({ ...f.options, freshSource: true }), /inventory_source_unbound|inventory_not_live_dom/);
  }
});
test('readonly guard never creates inventory or invokes a producer', t => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-inventory-readonly-'));
  t.after(() => fs.rmSync(sourceRoot, { recursive: true, force: true }));
  const evidenceRoot = path.join(sourceRoot, 'absent');
  assert.equal(ensureInventory({ sourceRoot, evidenceRoot, check: true }, { log() {}, spawnSync: () => assert.fail('read-only producer') }), 75);
  assert.equal(fs.existsSync(evidenceRoot), false);
});
test('guard refreshes stale inventory through a bounded fixed command then revalidates; child0 alone is insufficient', t => {
  const f = fixture(t); const calls = []; let inspections = 0;
  const inspect = () => ({ current: ++inspections > 1, reason: 'source stale' });
  assert.equal(ensureInventory(f.options, { log() {}, inspectInventory: inspect, spawnSync: (executable, args, options) => {
    calls.push(args); assert.equal(executable, process.execPath); assert.match(args[0], /scripts\/refresh-vdg-inventory.mjs$/);
    assert.deepEqual(args.slice(1), ['--if-stale']); assert.equal(options.shell, false); assert.ok(options.timeout > 0);
    return { status: 0 };
  } }), 0);
  assert.equal(calls.length, 1); assert.equal(inspections, 2);
  assert.equal(ensureInventory(f.options, { log() {}, inspectInventory: () => ({ current: false }), spawnSync: () => ({ status: 0 }) }), 75);
  assert.equal(ensureInventory(f.options, { log() {}, inspectInventory: () => ({ current: false }), spawnSync: () => ({ status: 37 }) }), 37);
  assert.equal(ensureInventory(f.options, { log() {}, inspectInventory: () => ({ current: false }), spawnSync: () => ({ error: new Error('timeout'), status: null }) }), 1);
});

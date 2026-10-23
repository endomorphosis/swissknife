import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Window } from 'happy-dom';
import * as registry from '../../web/js/core/mcp-descriptor-registry.js';
const source = fs.readFileSync(new URL('../../web/js/main-simple.js', import.meta.url), 'utf8');
const start = source.indexOf('    async createIDLExplorerSurface(contentElement) {');
const end = source.indexOf('\n    async createAcceleratePanelSurface', start);
assert.ok(start > 0 && end > start);
const createSurface = new Function('registry', `return (${source.slice(start, end).trim()
  .replace('async createIDLExplorerSurface', 'async function createIDLExplorerSurface')
  .replace("await import('./core/mcp-descriptor-registry.js')", 'registry')})`)(registry);
async function fixture(t) {
  const keys = ['window', 'document', 'fetch']; const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window(); let fetches = 0;
  Object.assign(globalThis, { window, document: window.document, fetch: async () => { fetches++; throw new Error('IDL local app must not invoke a network service'); } });
  t.after(() => { window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const root = document.createElement('main'); document.body.append(root);
  await createSurface.call({ setupEventListeners() {} }, root);
  return { root, fetches: () => fetches };
}
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 3)); } throw new Error('Local fixture did not settle'); }
test('actual registered IDL app displays real local descriptor hashes and no fabricated provider receipts', async t => {
  const { root, fetches } = await fixture(t);
  assert.equal(fetches(), 0); assert.equal(/bafyidlg050|receipt:idl-explorer|pending receipt/.test(root.textContent), false);
  const inspection = registry.inspectBrowserMCPDescriptor('ipfs_datasets_py');
  const digest = crypto.createHash('sha256').update(JSON.stringify(inspection)).digest('hex');
  assert.ok(root.textContent.includes(`sha256:${digest}`));
  assert.match(root.querySelector('#idl-compatibility-status').textContent, /Not run/);
});
test('Run Fixture executes a real local function against current descriptor methods without backend dispatch', async t => {
  const { root, fetches } = await fixture(t);
  root.querySelector('[data-action="run-compatibility-fixture"]').click();
  await until(() => root.querySelector('#idl-compatibility-status').dataset.fixtureState === 'passed-local');
  const output = JSON.parse(root.querySelector('#idl-local-result').textContent);
  const actual = registry.inspectBrowserMCPDescriptor(output.result.descriptor_id);
  assert.deepEqual(output.result.method_names, actual.method_schemas.slice(0, 5).map(method => method.method));
  assert.equal(output.result.total_method_count, actual.method_schemas.length);
  assert.equal(output.result.remote_execution, false); assert.equal(output.result.execution, 'local-only'); assert.equal(output.receipt, null);
  assert.equal(output.content_hash, `sha256:${crypto.createHash('sha256').update(JSON.stringify(output.result)).digest('hex')}`);
  assert.equal(fetches(), 0);
});
test('invalid input is actually rejected by the same local fixture validator', async t => {
  const { root, fetches } = await fixture(t);
  root.querySelector('[data-action="validate-invalid-input"]').click();
  assert.equal(root.querySelector('#idl-invalid-status').dataset.fixtureState, 'rejected-local');
  assert.match(root.querySelector('#idl-invalid-status').textContent, /descriptor_id must be a string/);
  assert.match(root.querySelector('#idl-invalid-status').textContent, /limit must be an integer/);
  assert.equal(fetches(), 0);
});
test('output and transport inspection never fabricate remote execution or connectivity', async t => {
  const { root, fetches } = await fixture(t);
  root.querySelector('[data-action="open-receipt-drilldown"]').click();
  root.querySelector('[data-action="refresh-transport-badges"]').click();
  assert.equal(root.querySelector('#idl-receipt-drilldown').open, true);
  assert.match(root.querySelector('#idl-transport-status').textContent, /Connectivity remains untested/);
  assert.equal(fetches(), 0);
});

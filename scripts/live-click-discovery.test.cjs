'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { require: tsxRequire } = require('tsx/cjs/api');
const { discoverLive } = tsxRequire(path.resolve(__dirname, '../test/e2e/helpers/live-click-session.ts'), __filename);
const { validateFamily, FAMILIES } = require('./vdg-evidence.cjs');
let browser;
test.before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
test.after(async () => { await browser?.close(); });
const row = selector => ({ app_id: 'vibecode', launch_id: 'vibecode', selector, disposition: 'invoke', tool_id: 'submit_task' });

test('root-relative structural native and generic semantic declarations match their actual nodes exactly once', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<main id="root"><section><button data-native-gateway-binding="vibecode.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" aria-label="Code Assistant">Assistant</button><button data-action="local-analysis">Desktop analysis</button><button id="known-id">Known</button></section></main>');
  const matrix = [row(':scope > section:nth-of-type(1) > button:nth-of-type(1)'), row('[data-action="local-analysis"]'), row('#known-id')];
  assert.equal(await page.locator('#root button').first().evaluate(element => element.matches(':scope > section:nth-of-type(1) > button:nth-of-type(1)')), false,
    'the fixture must exercise the actual :scope mismatch');
  assert.deepEqual(await discoverLive(page.locator('#root'), matrix, false), []);
});

test('two native nodes sharing a binding retain independent root paths when only one is declared', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<main id="root"><section><button data-native-gateway-binding="vibecode.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" onclick="this.dataset.clicked=\'yes\'">Same action</button><button data-native-gateway-binding="vibecode.ipfs_accelerate_py.submit_inference" data-native-tool-id="submit_task" onclick="this.dataset.clicked=\'yes\'">Same action</button></section></main>');
  const first = ':scope > section:nth-of-type(1) > button:nth-of-type(1)';
  const extra = await discoverLive(page.locator('#root'), [row(first)], false);
  assert.equal(extra.length, 1); assert.equal(extra[0].selector, ':scope > section:nth-of-type(1) > button:nth-of-type(2)');
  assert.equal(extra[0].source, 'live-tool'); assert.equal(extra[0].disposition, 'unlisted');
  assert.equal(extra[0].matrix_reason, 'live-tool-button-not-in-matrix');
  await page.locator('#root').locator(extra[0].selector).click();
  assert.equal(await page.locator('#root button').nth(0).getAttribute('data-clicked'), null);
  assert.equal(await page.locator('#root button').nth(1).getAttribute('data-clicked'), 'yes');
  assert.deepEqual(await discoverLive(page.locator('#root'), [row(first), row(extra[0].selector)], false), []);
});

test('all truly unmatched repeated controls remain uniquely clickable and undeclared native tools keep NO_GO', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<main id="root"><button id="known">Known</button><button title="Repeat">Actual local one</button><button title="Repeat">Actual local two</button><button data-native-gateway-binding="vibecode.ipfs_kit_py.unknown_operation" data-native-tool-id="unknown_tool">New native operation</button></main>');
  const extra = await discoverLive(page.locator('#root'), [row('#known')], false);
  assert.equal(extra.length, 3); assert.equal(new Set(extra.map(item => item.selector)).size, 3);
  for (const item of extra) { assert.equal(await page.locator('#root').locator(item.selector).count(), 1); await page.locator('#root').locator(item.selector).click(); }
  const native = extra.find(item => item.source === 'live-tool'); assert.equal(native.disposition, 'unlisted');
  const family = 'vdg-datasets', declared = FAMILIES[family].apps.map(app_id => ({ app_id, launch_id: app_id,
    selector: '#known', family, disposition: 'local-only' }));
  const report = validateFamily({ family, matrix: { schema: 'swissknife.virtual-desktop-control-tool-matrix.v1', rows: declared },
    reports: [{ schema: 'swissknife.virtual-desktop-live-click.v1', target: 'datasets', owner_health: 'up',
      rows: [...declared.map(item => ({ ...item, clicked: true, visibility: 'visible', mcp_call_count: 0, failure_reasons: [] })),
      { ...native, clicked: true, visibility: 'visible', mcp_call_count: 0, failure_reasons: [] }] }],
    catalog: { schema: 'swissknife.all-tools-disposition-catalog.v1', entries: [{ owner: 'kit', tool_id: 'diagnostic', disposition: { kind: 'diagnostic_operation' } }] },
    contract: { apps: FAMILIES[family].apps.map(app_id => ({ app_id, aliases: [], backend_bindings: [] })) },
    ledger: { schema: 'swissknife.all-app-live-binding-gap-ledger.v1' },
  });
  assert.equal(report.passed, false); assert.equal(report.decision, 'no_go');
  assert.ok(report.gaps.some(gap => gap.code === 'dynamic_tool_requires_disposition' && gap.selector === native.selector));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { collectRenderedControls } from './rendered-control-rows.mjs';
let browser;
test.before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
test.after(async () => { await browser?.close(); });
test('selectors survive dynamic instance IDs and distinguish repeated controls', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  const markup = stamp => `<main id="root"><section><input id="p2p-chat-${stamp}-message"><button title="Refresh">One</button><button title="Refresh">Two</button><button title="Launch">Title only</button><button>Unnamed</button></section></main>`;
  await page.setContent(markup('1792570800000'));
  const first = await page.locator('#root').evaluate(collectRenderedControls);
  await page.setContent(markup('1792570999999'));
  const second = await page.locator('#root').evaluate(collectRenderedControls);
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map(row => row.selector)).size, 5);
  for (const row of first) assert.equal(await page.locator('#root').locator(row.selector).count(), 1);
  assert.match(first.find(row => row.accessible_name === 'Launch').selector, /\[title="Launch"\]/);
});
test('native exact tools remain distinct, including a declared hidden action', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent(`<main id="root">${['files_ls', 'files_read', 'files_write'].map((tool, i) => `<button data-native-gateway-binding="vibecode.ipfs_kit_py.list_virtual_files" data-native-tool-id="${tool}" ${i === 2 ? 'hidden' : ''}>${tool}</button>`).join('')}</main>`);
  const rows = await page.locator('#root').evaluate(collectRenderedControls);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.selector)).size, 3);
  assert.equal(rows[2].visible, false);
  for (const row of rows) assert.equal(await page.locator('#root').locator(row.selector).count(), 1);
});

test('model and provider identities survive favorites insertion and keep duplicate placements distinct', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  const card = (model, placement) => ['favorite', 'info', 'try', 'default'].map(action => `<button data-openrouter-model="${model}" data-openrouter-provider="actual-provider" data-openrouter-placement="${placement}" data-openrouter-action="${action}">${action}</button>`).join('');
  await page.setContent(`<main id="root">${card('provider/model:one', 'catalog')}${card('provider/model:two', 'catalog')}</main>`);
  const baseline = await page.locator('#root').evaluate(collectRenderedControls);
  await page.setContent(`<main id="root">${card('provider/model:one', 'favorites')}${card('provider/model:two', 'catalog')}${card('provider/model:one', 'catalog')}</main>`);
  const after = await page.locator('#root').evaluate(collectRenderedControls);
  assert.equal(baseline.length, 8); assert.equal(after.length, 12);
  assert.equal(new Set(after.map(row => row.selector)).size, 12);
  for (const row of baseline) assert.equal(await page.locator('#root').locator(row.selector).count(), 1);
});

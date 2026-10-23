const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { require: tsxRequire } = require('tsx/cjs/api');
const { waitForRowCalls, closeLaunched, screenshotAppWindow } = tsxRequire(path.resolve(__dirname, '../test/e2e/helpers/live-click-session.ts'), __filename);
const gateway = fs.readFileSync(path.resolve(__dirname, '../web/js/live-tool-gateway.js'), 'utf8');
let browser;
test.before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
test.after(async () => { await browser?.close(); });
test('a delayed governed companion is confirmed by an actual trusted click after the read', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  const calls = [];
  await page.exposeFunction('recordStart', correlation => calls.push({ kind: 'tools-call', correlation, done: false }));
  await page.exposeFunction('recordDone', correlation => { calls.find(call => call.correlation === correlation).done = true; });
  await page.setContent('<main id="app"><button id="start">Read then review write</button></main>');
  await page.evaluate(() => {
    window.events = []; window.posts = [];
    document.addEventListener('swissknife:gateway-confirmation', event => window.events.push({ ...event.detail,
      matching_requests: window.posts.filter(call => call.correlation_id === event.detail.correlation_id).length,
      total_requests: window.posts.length }));
    window.fetch = async (url, options = {}) => {
      if (String(url).includes('/dispositions')) return { ok: true, json: async () => ({ entries: [] }) };
      if (!options.body) return { ok: true, json: async () => ({ controls: ['artifacts_get', 'artifacts_put'].map(tool => ({ app_id: 'notes',
        binding_id: `notes.ipfs_kit_py.${tool}`, owner: 'ipfs_kit_py', selected_tool_id: tool, preferred_tool_ids: [tool],
        mutates_remote_state: tool === 'artifacts_put', transport: 'http', transports: ['http'], status: 'available' })) }) };
      const call = JSON.parse(options.body); window.posts.push(call); await window.recordStart(call.correlation_id);
      await new Promise(resolve => setTimeout(resolve, 120)); await window.recordDone(call.correlation_id);
      return { status: 200, json: async () => ({ ok: true, outcome: 'executed', result: { ok: true, dry_run: true }, correlation_id: call.correlation_id,
        receipt: { receipt_id: 'unit-compound-only', event_dag_refs: ['unit-event-only'] } }) };
    };
  });
  await page.evaluate(async source => { window.gateway = await import(`data:text/javascript;base64,${btoa(source)}`); }, gateway);
  await page.evaluate(() => document.querySelector('#start').addEventListener('click', () => {
    window.workflow = (async () => {
      await window.gateway.invokeNativeTool(document.querySelector('#app'), 'notes', 'notes.ipfs_kit_py.artifacts_get', { payload: { cid: 'unit-existing-artifact' } });
      await new Promise(resolve => setTimeout(resolve, 180));
      return window.gateway.invokeNativeTool(document.querySelector('#app'), 'notes', 'notes.ipfs_kit_py.artifacts_put', { payload: { content: 'actual unit merge preview' } });
    })();
  }));
  await page.click('#start');
  await waitForRowCalls(page, calls, 0);
  const result = await page.evaluate(() => window.workflow);
  assert.equal(result.outcome, 'executed'); assert.equal(calls.length, 2); assert.ok(calls.every(call => call.done));
  const events = await page.evaluate(() => window.events);
  assert.equal(events.find(event => event.phase === 'confirmed').trusted, true);
  assert.equal(events.find(event => event.phase === 'shown').matching_requests, 0);
  assert.equal(events.find(event => event.phase === 'shown').total_requests, 1, 'the earlier read must remain accounted for');
});
test('an unfinished owner call exhausts its bound instead of looking settled', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<main>Pending owner result</main>');
  await assert.rejects(waitForRowCalls(page, [{ kind: 'tools-call', done: false }], 0, { timeoutMs: 180, appearMs: 10, quietMs: 20 }), /did not settle/);
});
test('normal close does not wait for its removed window to reappear', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  page.setDefaultTimeout(1200);
  await page.setContent('<div id="owned-window" class="window"><button class="window-control close" onclick="this.parentElement.remove()">Close</button></div>');
  const started = Date.now();
  await closeLaunched(page, page.locator('#owned-window'));
  assert.equal(await page.locator('#owned-window').count(), 0);
  assert.ok(Date.now() - started < 1000, 'A removed window consumed the full action timeout');
});
test('minimized owned windows are actually removed without waiting for a visible box', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<div id="owned-window" class="window" style="display:none"></div>');
  await page.evaluate(() => { window.swissknifeDesktop = { windows: new Map([['owned-window', {}]]) }; });
  await closeLaunched(page, page.locator('#owned-window'));
  assert.equal(await page.locator('#owned-window').count(), 0);
  assert.equal(await page.evaluate(() => window.swissknifeDesktop.windows.size), 0);
});

test('visible app clip retains two actual full-size PNGs across a real control click', async t => {
  const page = await browser.newPage({ viewport: { width: 500, height: 400 } }); t.after(() => page.close());
  await page.setContent('<style>body{margin:0}#app{position:absolute;left:20px;top:30px;width:200px;height:100px;background:red}</style><main id="app"><button onclick="this.parentElement.style.background=\'blue\'">Change local view</button></main>');
  const app = page.locator('#app');
  const before = await screenshotAppWindow(page, app, { animations: 'disabled' });
  await app.locator('button').click();
  const after = await screenshotAppWindow(page, app, { animations: 'disabled' });
  for (const bytes of [before, after]) {
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 200); assert.equal(bytes.readUInt32BE(20), 100);
  }
  assert.equal(before.equals(after), false);
});
test('an app extending beyond the viewport keeps a complete element PNG', async t => {
  const page = await browser.newPage({ viewport: { width: 500, height: 400 } }); t.after(() => page.close());
  await page.setContent('<main id="app" style="position:absolute;left:450px;top:20px;width:200px;height:100px;background:green">Actual offscreen app</main>');
  const bytes = await screenshotAppWindow(page, page.locator('#app'), { animations: 'disabled' });
  assert.equal(bytes.readUInt32BE(16), 200); assert.equal(bytes.readUInt32BE(20), 100);
});

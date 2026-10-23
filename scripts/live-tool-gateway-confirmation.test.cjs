const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.resolve(__dirname, '../web/js/live-tool-gateway.js'), 'utf8');
let browser;
test.before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
test.after(async () => { await browser?.close(); });
async function fixture(t) {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent('<main id="app"><button id="native">Send</button></main>');
  await page.evaluate(() => {
    window.posts = []; window.proof = [];
    document.addEventListener('swissknife:gateway-confirmation', event => window.proof.push(event.detail));
    window.fetch = async (url, options) => {
      if (String(url).includes('/dispositions')) return { ok: true, json: async () => ({ entries: [] }) };
      if (!options?.body) return { ok: true, json: async () => ({ controls: [{ app_id: 'ai-chat', binding_id: 'ai-chat.ipfs_accelerate_py.submit_inference', owner: 'ipfs_accelerate_py',
        selected_tool_id: 'submit_task', preferred_tool_ids: ['submit_task'], mutates_remote_state: true, status: 'available', label: 'Send message', transports: ['http', 'libp2p'], transport: 'http' }] }) };
      const call = JSON.parse(options.body); window.posts.push(call);
      return { status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id, receipt: { receipt_id: 'unit-only', event_dag_refs: ['unit-only'] } }) };
    };
  });
  await page.evaluate(async code => { window.gateway = await import(`data:text/javascript;base64,${btoa(code)}`); }, source);
  await page.evaluate(() => document.querySelector('#native').addEventListener('click', () => {
    window.invocation = window.gateway.invokeNativeTool(document.querySelector('#app'), 'ai-chat', 'ai-chat.ipfs_accelerate_py.submit_inference', { trigger: document.querySelector('#native'), payload: { prompt: 'real unit interaction' } });
  }));
  return page;
}
test('native action waits for a real trusted confirming click before POST', async t => {
  const page = await fixture(t); await page.click('#native');
  await page.waitForSelector('[data-gateway-confirm]');
  assert.equal(await page.evaluate(() => window.posts.length), 0);
  await page.click('[data-gateway-confirm]');
  const result = await page.evaluate(() => window.invocation);
  assert.equal(result.outcome, 'executed');
  const proof = await page.evaluate(() => ({ posts: window.posts, events: window.proof }));
  assert.equal(proof.posts.length, 1); assert.equal(proof.posts[0].input.policy.consent, 'granted');
  assert.equal(proof.events.find(event => event.phase === 'confirmed').trusted, true);
});
test('cancel returns null and dispatches zero calls', async t => {
  const page = await fixture(t); await page.click('#native'); await page.click('[data-gateway-cancel]');
  assert.equal(await page.evaluate(() => window.invocation), null);
  assert.equal(await page.evaluate(() => window.posts.length), 0);
});
test('unapproved exact tools are rejected before confirmation or dispatch', async t => {
  const page = await fixture(t);
  const message = await page.evaluate(async () => {
    try { await window.gateway.invokeNativeTool(document.querySelector('#app'), 'ai-chat', 'ai-chat.ipfs_accelerate_py.submit_inference', { toolId: 'ipfs_add' }); }
    catch (error) { return error.message; }
  });
  assert.match(message, /not approved/); assert.equal(await page.evaluate(() => window.posts.length), 0);
});

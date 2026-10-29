const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.resolve(__dirname, '../web/js/live-tool-gateway.js'), 'utf8');
let browser;
test.before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
test.after(async () => { await browser?.close(); });
// Authored DOM fixtures with intercepted fetches prove the gateway policy and
// browser trust boundary only. They do not establish real-app/backend acceptance.
async function fixture(t, settings = {}) {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.route('**/*', route => route.abort());
  await page.setContent('<main id="app"><button id="native">Send</button></main>');
  await page.evaluate(settings => {
    window.posts = []; window.proof = []; window.fetches = [];
    window.invocationOptions = settings.executionMode === undefined ? {} : { executionMode: settings.executionMode };
    window.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = settings.forceDryRun === true;
    document.addEventListener('swissknife:gateway-confirmation', event => window.proof.push(event.detail));
    window.fetch = async (url, options) => {
      window.fetches.push(String(url));
      if (String(url).includes('/dispositions')) return { ok: true, json: async () => ({ entries: [] }) };
      if (!options?.body) return { ok: true, json: async () => ({ controls: [{ app_id: 'ai-chat', binding_id: 'ai-chat.ipfs_accelerate_py.submit_inference', owner: 'ipfs_accelerate_py',
        selected_tool_id: 'submit_task', preferred_tool_ids: ['submit_task'], mutates_remote_state: settings.governed !== false, status: 'available', label: 'Send message', transports: ['http', 'libp2p'], transport: 'http' }] }) };
      const call = JSON.parse(options.body); window.posts.push(call);
      return { status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id, receipt: { receipt_id: 'unit-only', event_dag_refs: ['unit-only'] } }) };
    };
  }, settings);
  await page.evaluate(async code => { window.gateway = await import(`data:text/javascript;base64,${btoa(code)}`); }, source);
  await page.evaluate(() => document.querySelector('#native').addEventListener('click', () => {
    window.invocationSettled = false;
    window.invocation = window.gateway.invokeNativeTool(document.querySelector('#app'), 'ai-chat', 'ai-chat.ipfs_accelerate_py.submit_inference', { ...window.invocationOptions, trigger: document.querySelector('#native'), payload: { prompt: 'real unit interaction' } });
    window.invocation.then(() => { window.invocationSettled = true; }, () => { window.invocationSettled = true; });
  }));
  return page;
}
test('native action waits for a real trusted confirming click before POST', async t => {
  const page = await fixture(t); await page.click('#native');
  await page.waitForSelector('[data-gateway-confirm]');
  assert.equal(await page.locator('[data-gateway-confirm]').textContent(), 'Confirm dry run');
  assert.match(await page.locator('[role="dialog"]').textContent(), /will run as a dry run/);
  assert.equal(await page.evaluate(() => window.posts.length), 0);
  await page.click('[data-gateway-confirm]');
  const result = await page.evaluate(() => window.invocation);
  assert.equal(result.outcome, 'executed');
  const proof = await page.evaluate(() => ({ posts: window.posts, events: window.proof }));
  assert.equal(proof.posts.length, 1); assert.equal(proof.posts[0].input.policy.consent, 'granted');
  assert.equal(proof.posts[0].input.policy.dry_run, true);
  assert.equal(proof.posts[0].input.policy.reason, 'The governed desktop request is explicitly confirmed and executes only as a no-side-effect dry run.');
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

test('explicit real execution requires trusted correlated confirmation and truthful wording', async t => {
  const page = await fixture(t, { executionMode: 'execute' });
  await page.click('#native'); await page.waitForSelector('[data-gateway-confirm]');
  assert.equal(await page.evaluate(() => window.posts.length), 0);
  assert.equal(await page.locator('[data-gateway-confirm]').textContent(), 'Confirm execution');
  assert.match(await page.locator('[role="dialog"]').textContent(), /submit_task will execute against ipfs_accelerate_py/);
  assert.doesNotMatch(await page.locator('[role="dialog"]').textContent(), /dry run/);
  await page.click('[data-gateway-confirm]');
  assert.equal((await page.evaluate(() => window.invocation)).outcome, 'executed');
  const { posts, proof } = await page.evaluate(() => ({ posts: window.posts, proof: window.proof }));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].input.policy.dry_run, false);
  assert.equal(posts[0].input.policy.outcome, 'require_confirmation');
  assert.equal(posts[0].input.policy.consent, 'granted');
  assert.match(posts[0].input.policy.reason, /real backend execution/);
  const confirmed = proof.find(event => event.phase === 'confirmed');
  assert.equal(confirmed.trusted, true);
  assert.equal(confirmed.correlation_id, posts[0].correlation_id);
  assert.equal(confirmed.binding_id, posts[0].binding_id);
  assert.equal(confirmed.tool_id, posts[0].tool_id);
  assert.equal(confirmed.origin, 'native-control');
  assert.deepEqual(proof.map(event => event.phase), ['shown', 'confirmed']);
});

test('synthetic real confirmations do not dispatch or consume the pending trusted listener', async t => {
  const page = await fixture(t, { executionMode: 'execute' });
  await page.click('#native'); await page.waitForSelector('[data-gateway-confirm]');
  await page.evaluate(() => {
    const button = document.querySelector('[data-gateway-confirm]');
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(await page.evaluate(() => ({ posts: window.posts.length, settled: window.invocationSettled, phases: window.proof.map(event => event.phase) })),
    { posts: 0, settled: false, phases: ['shown'] });
  assert.equal(await page.locator('[data-gateway-confirm]').count(), 1);
  await page.click('[data-gateway-confirm]');
  await page.evaluate(() => window.invocation);
  assert.equal(await page.evaluate(() => window.posts.length), 1);
  assert.equal(await page.evaluate(() => window.posts[0].input.policy.dry_run), false);
  assert.equal(await page.evaluate(() => window.proof.find(event => event.phase === 'confirmed').trusted), true);
});

test('real execution cancellation returns null with zero dispatches', async t => {
  const page = await fixture(t, { executionMode: 'execute' });
  await page.click('#native'); await page.click('[data-gateway-cancel]');
  assert.equal(await page.evaluate(() => window.invocation), null);
  assert.equal(await page.evaluate(() => window.posts.length), 0);
  assert.equal(await page.locator('[data-gateway-confirm]').count(), 0);
  assert.equal(await page.locator('#native').isEnabled(), true);
});

test('global forced preview wins over explicit execution and preserves preview wording', async t => {
  const page = await fixture(t, { executionMode: 'execute', forceDryRun: true });
  await page.click('#native'); await page.waitForSelector('[data-gateway-confirm]');
  assert.equal(await page.locator('[data-gateway-confirm]').textContent(), 'Confirm dry run');
  await page.click('[data-gateway-confirm]'); await page.evaluate(() => window.invocation);
  assert.equal(await page.evaluate(() => window.posts[0].input.policy.dry_run), true);
  assert.match(await page.evaluate(() => window.posts[0].input.policy.reason), /no-side-effect dry run/);
});

test('forced preview enabled during confirmation also prevents real dispatch', async t => {
  const page = await fixture(t, { executionMode: 'execute' });
  await page.click('#native'); await page.waitForSelector('[data-gateway-confirm]');
  await page.evaluate(() => { window.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true; });
  await page.click('[data-gateway-confirm]'); await page.evaluate(() => window.invocation);
  assert.equal(await page.evaluate(() => window.posts[0].input.policy.dry_run), true);
});

test('unknown execution modes fail before catalog access, confirmation or dispatch', async t => {
  const page = await fixture(t);
  const message = await page.evaluate(async () => {
    try { await window.gateway.invokeNativeTool(document.querySelector('#app'), 'ai-chat', 'ai-chat.ipfs_accelerate_py.submit_inference', { executionMode: 'real' }); }
    catch (error) { return error.message; }
  });
  assert.match(message, /Unknown native tool execution mode/);
  assert.equal(await page.evaluate(() => window.fetches.length), 0);
  assert.equal(await page.locator('[data-gateway-confirm]').count(), 0);
});

test('real execution does not bypass the exact approved tool allowlist', async t => {
  const page = await fixture(t);
  const message = await page.evaluate(async () => {
    try { await window.gateway.invokeNativeTool(document.querySelector('#app'), 'ai-chat', 'ai-chat.ipfs_accelerate_py.submit_inference', { executionMode: 'execute', toolId: 'ipfs_add' }); }
    catch (error) { return error.message; }
  });
  assert.match(message, /not approved/);
  assert.equal(await page.evaluate(() => window.posts.length), 0);
  assert.equal(await page.locator('[data-gateway-confirm]').count(), 0);
});

test('ordinary non-mutating native reads preserve their existing immediate real execution', async t => {
  const page = await fixture(t, { governed: false });
  await page.click('#native'); await page.evaluate(() => window.invocation);
  assert.equal(await page.locator('[data-gateway-confirm]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.posts[0].input.policy), {
    decision_id: 'desktop-policy:ai-chat.ipfs_accelerate_py.submit_inference', outcome: 'allow',
    reason: 'Narrow non-mutating desktop read request.', consent: 'not_required', dry_run: false,
  });
});

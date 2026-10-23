#!/usr/bin/env node
/** Standalone real-browser smoke; never writes family reports or capture manifests.
 * Load the owned backend client.env, then invoke through run-with-owned-port.mjs:
 * --env-var SWISSKNIFE_VDG_PHOTOSHOP_HISTORY_SMOKE_PORT --preferred 3087 -- node <this file>
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, createWriteStream, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { collectRenderedControls } from '../../../scripts/rendered-control-rows.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const { cidForBytes } = require('../../../scripts/mcpplusplus-profile-a.cjs');
const { assessOwnerResult, loadConnectorArtifacts } = require('../../../scripts/vdg-connector-artifacts.cjs');
const defaultProject = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function options(argv) {
  const result = { project: defaultProject, candidate: null };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    assert.ok(['--project-root', '--candidate-source'].includes(name), `Unknown diagnostic argument: ${name}`);
    assert.ok(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing ${name} value`);
    const key = name === '--project-root' ? 'project' : 'candidate';
    assert.equal(result[`${key}Set`], undefined, `Duplicate ${name}`);
    result[key] = path.resolve(argv[++index]); result[`${key}Set`] = true;
  }
  return result;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, milliseconds, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function stopServer(child) {
  if (!child) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (child.exitCode === null && child.signalCode === null) await bounded(new Promise(resolve => child.once('exit', resolve)), 5000, 'owned Vite did not exit after TERM').catch(() => {});
  // A cooperative leader must not leave its owned descendants running.
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
function records(value) {
  const pending = [value], result = [], seen = new Set();
  while (pending.length && result.length < 256) {
    const item = pending.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item); result.push(item);
    if (Array.isArray(item)) pending.push(...item); else pending.push(...Object.values(item));
  }
  return result;
}
function verifyResponse(call, body, transport) {
  assert.equal(call.app_id, 'neural-photoshop', 'request did not originate from Neural Photoshop');
  assert.equal(call.transport, transport, 'native transport selection was not respected');
  assert.equal(body.ok, true, 'real owner returned failure'); assert.equal(body.outcome, 'executed');
  assert.equal(body.correlation_id, call.correlation_id, 'owner correlation changed');
  assert.ok(body.receipt?.receipt_id, 'real mediator receipt missing');
  const proof = assessOwnerResult(body.result, { outcome: body.outcome, tool_id: call.tool_id,
    transport: call.transport, correlation_id: call.correlation_id,
    policy_outcome: call.input.policy.outcome, dry_run: call.input.policy.dry_run });
  assert.equal(proof.verified, true, `real owner/transport evidence rejected: ${proof.reason}`);
  const observation = { method: 'POST', route: '/mcp/tools/call', app_id: call.app_id,
    binding_id: call.binding_id, owner: call.owner, tool_id: call.tool_id, transport: call.transport,
    correlation_id: call.correlation_id, policy_outcome: call.input.policy.outcome,
    dry_run: call.input.policy.dry_run, outcome: body.outcome,
    receipt_id: body.receipt.receipt_id, event_dag_cid: body.receipt.event_dag_refs?.[0] };
  const persisted = loadConnectorArtifacts([{ app_id: call.app_id, binding_id: call.binding_id,
    owner: call.owner, observations: [observation] }]);
  assert.deepEqual(persisted.problems, [], 'Actual receipt/event block verification failed');
  assert.equal(persisted.observations.length, 1);
  return observation;
}
export async function runNeuralPhotoshopHistorySmoke() {
  const settings = options(process.argv.slice(2));
  const project = settings.project;
  const canonicalSource = path.join(project, 'web/js/apps/neural-photoshop.js');
  const canonicalBeforeSha = createHash('sha256').update(readFileSync(canonicalSource)).digest('hex');
  const sourcePath = settings.candidate || canonicalSource;
  const sourceSha256 = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
  assert.equal(sourceSha256, '45f5b9a94cc1ca48282019fbe6c55d08a4ef4cbd57a1b46fe7efab1c568abfca', 'This diagnostic requires the reviewed history-control source bytes');
  const port = Number(process.env.SWISSKNIFE_VDG_PHOTOSHOP_HISTORY_SMOKE_PORT);
  assert.ok(Number.isInteger(port) && port > 1023, 'An owned smoke port is required');
  const diagnostics = mkdtempSync(path.join(tmpdir(), 'vdg-neural-photoshop-history-smoke-'));
  const viteLog = createWriteStream(path.join(diagnostics, 'vite.log'));
  const baseURL = `http://127.0.0.1:${port}`;
  let server, browserServer, browser, browserPid, page, summary, stage = 'startup';
  try {
    let config = path.join(project, 'vite.web.config.ts');
    if (sourcePath !== canonicalSource) {
      // A genuine candidate build, not a request/response mock: only this
      // reviewed app module is compiled from the isolated source file. All
      // desktop routing, actual backend middleware and remaining code stay
      // in the real project. The report explicitly records this scope.
      config = path.join(diagnostics, 'reviewed-neural-candidate.config.mjs');
      writeFileSync(config, [
        `import original from ${JSON.stringify(path.join(project, 'vite.web.config.ts'))};`,
        `import { mergeConfig } from ${JSON.stringify(pathToFileURL(path.join(project, 'node_modules/vite/dist/node/index.js')).href)};`,
        'import { readFileSync, realpathSync } from "node:fs";',
        `const app = ${JSON.stringify(canonicalSource)}, candidate = ${JSON.stringify(sourcePath)};`,
        'export default mergeConfig(original, {plugins: [{name: "reviewed-neural-history-candidate", enforce: "pre", load(id) {',
        ' const file = id.split("?")[0]; if (file === app || file === realpathSync(app)) return readFileSync(candidate, "utf8");',
        '}}]});',
      ].join('\n'));
    }
    server = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--config', config, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: project, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(viteLog, { end: false }); server.stderr.pipe(viteLog, { end: false });
    const deadline = Date.now() + 60000;
    while (true) {
      if (server.exitCode !== null) throw new Error('Owned Vite exited before readiness');
      try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Owned Vite readiness exceeded its deadline');
      await delay(200);
    }
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    browserPid = browserServer.process()?.pid;
    assert.ok(Number.isInteger(browserPid), 'The diagnostic must own an identifiable Chrome process');
    browser = await chromium.connect(browserServer.wsEndpoint());
    const results = [];
    for (const transport of ['http', 'libp2p']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(transport => {
        globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
        globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
        globalThis.__photoshopConfirmations = [];
        document.addEventListener('swissknife:gateway-confirmation', event => globalThis.__photoshopConfirmations.push(event.detail));
      }, transport);
      page = await context.newPage(); page.setDefaultTimeout(12000);
      const calls = [], errors = [];
      page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/mcp/tools/call') calls.push(request.postDataJSON()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.desktop?.launchApp === 'function');
      await page.locator('#loading-screen').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.desktop.launchApp('neural-photoshop'));
      const app = page.locator('.window[data-app-id="neural-photoshop"]').last();
      await app.locator('.neural-photoshop-container').waitFor();
      // Match the actual family capture geometry without changing app content.
      await app.evaluate(node => Object.assign(node.style, { width: '720px', height: '540px', left: '20px', top: '60px' }));
      const history = app.locator('#neural-history-panel-toggle');
      const historyStates = [];
      const recordHistory = async label => {
        assert.equal(await history.count(), 1, 'The actual app root must contain exactly one stable history control');
        await history.scrollIntoViewIfNeeded();
        const collected = await app.evaluate(collectRenderedControls);
        const row = collected.filter(row => row.selector === '#neural-history-panel-toggle');
        assert.equal(row.length, 1, 'Actual census selector drifted from the history control');
        assert.equal(collected.some(row => /^button\[aria-label="(?:Expand|Collapse) history panel"\]$/.test(row.selector)), false);
        const expanded = await history.getAttribute('aria-expanded');
        const accessibleName = await history.getAttribute('aria-label');
        assert.equal(accessibleName, `${expanded === 'true' ? 'Collapse' : 'Expand'} history panel`);
        historyStates.push({ label, selector: row[0].selector, expanded, accessible_name: accessibleName,
          content_visible: await app.locator('.history-panel').isVisible(), actual_control_count: await history.count() });
        await app.screenshot({ path: path.join(diagnostics, `${transport}-history-${label}.png`) });
      };
      await recordHistory('initial');
      assert.equal(await history.getAttribute('aria-expanded'), 'false');
      await page.waitForTimeout(200);
      await recordHistory('bound');
      assert.equal(await history.getAttribute('aria-expanded'), 'false');
      for (const panel of ['tools', 'properties', 'ai', 'history']) {
        stage = `${transport}: panel ${panel}`;
        const toggle = app.locator(`.panel-toggle[data-panel="${panel}"]`);
        await toggle.scrollIntoViewIfNeeded();
        const before = panel === 'history' ? 'false' : 'true';
        assert.equal(await toggle.getAttribute('aria-expanded'), before);
        await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), String(before !== 'true'));
        assert.equal(await app.locator(`.${panel}-panel`).isVisible(), before !== 'true');
        if (panel === 'history') await recordHistory('expanded');
        await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), before);
        assert.equal(await app.locator(`.${panel}-panel`).isVisible(), before === 'true');
        if (panel === 'history') await recordHistory('collapsed');
      }
      assert.equal(calls.length, 0, 'Local panel controls must not invoke an owner');
      stage = `${transport}: local style dialog dismissal`;
      for (const mode of ['Escape', 'backdrop', 'Cancel']) {
        await app.locator('#ai-style-transfer-btn').click();
        const style = app.locator('[data-neural-photoshop-dialog="style"]');
        await style.waitFor({ state: 'visible' });
        assert.equal(calls.length, 0, 'The local style chooser must not invoke an owner');
        if (mode === 'Escape') await page.keyboard.press('Escape');
        else if (mode === 'backdrop') await style.click({ position: { x: 5, y: 5 } });
        else await style.locator('#cancel-style').click();
        await style.waitFor({ state: 'detached' });
      }
      // Reproduce the full capture's earlier style-action row, app close and
      // later gateway row. An app-owned chooser cannot outlive that close.
      stage = `${transport}: close window with style chooser pending`;
      await app.locator('#ai-style-transfer-btn').click();
      await app.locator('[data-neural-photoshop-dialog="style"]').waitFor({ state: 'visible' });
      await app.screenshot({ path: path.join(diagnostics, `${transport}-style-before-close.png`) });
      await app.locator('.window-control.close').click();
      assert.equal(await page.locator('[data-neural-photoshop-dialog="style"]').count(), 0);
      await page.evaluate(() => window.desktop.launchApp('neural-photoshop'));
      await app.locator('.neural-photoshop-container').waitFor();
      await app.evaluate(node => Object.assign(node.style, { width: '720px', height: '540px', left: '20px', top: '60px' }));
      assert.equal(calls.length, 0, 'Closing a pending local chooser must not authorize an owner call');
      await recordHistory('reopened');
      assert.equal(await history.getAttribute('aria-expanded'), 'false', 'A real fresh app must restore its actual collapsed default');
      const observations = [];
      const catalog = await (await page.request.get(`${baseURL}/mcp/tools/bindings?app_id=neural-photoshop`)).json();
      const control = catalog.controls.find(control => control.binding_id === 'neural-photoshop.ipfs_kit_py.retrieve_content');
      const readTransport = control.transports.includes(transport) ? transport : control.transport;
      assert.ok(control.transports.includes(readTransport), 'Source read must use its exact declared transport policy');
      const cid = control.safe_payloads?.ipfs_cat?.cid || control.safe_payload?.cid;
      assert.equal(typeof cid, 'string'); assert.ok(cid.length > 20);
      await app.locator('[data-source-cid-input]').fill(cid);
      stage = `${transport}: source read`;
      const readButton = app.locator('[data-native-tool-id="ipfs_cat"]');
      const confirm = app.locator('[data-gateway-confirm]');
      await readButton.click(); await confirm.waitFor({ state: 'visible' });
      assert.equal(calls.length, 0, 'Source read dispatched before confirmation');
      const waitRead = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON().tool_id === 'ipfs_cat');
      await confirm.click(); const read = await waitRead; const readBody = await read.json();
      await app.locator('[data-source-cid-state="verified-bytes"]').waitFor();
      assert.equal(calls.length, 1); observations.push(verifyResponse(calls[0], readBody, readTransport));
      assert.equal(calls[0].input.payload.cid, cid);
      assert.ok(await app.locator('[data-source-result]').textContent().then(text => text.includes(cid)));
      const prompt = 'Review these actual source bytes as a bounded preview; do not generate an image.';
      stage = `${transport}: generation`;
      await app.locator('[data-generation-prompt]').fill(prompt);
      await app.locator('[data-native-tool-id="run_inference_job"]').click(); await confirm.waitFor({ state: 'visible' });
      assert.equal(calls.length, 1, 'Generation dispatched before confirmation');
      const waitGeneration = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON().tool_id === 'run_inference_job');
      await confirm.click(); const generation = await waitGeneration; const generationBody = await generation.json();
      await app.locator('[data-generation-state="validated-preview"]').waitFor();
      assert.equal(calls.length, 2); observations.push(verifyResponse(calls[1], generationBody, transport));
      assert.equal(calls[1].input.payload.input, prompt); assert.equal(calls[1].input.payload.source_cid, cid);
      assert.ok(records(generationBody.result).some(value => value.body_executed === false && value.mutation_performed === false));
      assert.match(await app.locator('[data-generation-status]').textContent(), /No image was generated/);
      stage = `${transport}: later generic ipfs_cat confirmation`;
      await app.locator('[data-live-gateway-binding="neural-photoshop.ipfs_kit_py.retrieve_content"][data-gateway-exact-tool="ipfs_cat"]').click();
      await confirm.waitFor({ state: 'visible' });
      assert.equal(calls.length, 2, 'The later generic read dispatched before its own confirmation');
      await app.screenshot({ path: path.join(diagnostics, `${transport}-gateway-confirmation.png`) });
      const waitGatewayRead = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON().tool_id === 'ipfs_cat');
      await confirm.click({ timeout: 3000 });
      const gatewayRead = await waitGatewayRead, gatewayBody = await gatewayRead.json();
      assert.equal(calls.length, 3); observations.push(verifyResponse(calls[2], gatewayBody, readTransport));
      assert.equal(calls[2].input.payload.cid, cid);
      const confirmations = await page.evaluate(() => globalThis.__photoshopConfirmations.filter(event => event.phase === 'confirmed'));
      assert.equal(confirmations.length, 3); assert.ok(confirmations.every(event => event.trusted === true));
      assert.equal(confirmations.at(-1).origin, 'gateway-button');
      assert.deepEqual(errors, []);
      await app.screenshot({ path: path.join(diagnostics, `${transport}-layout.png`) });
      results.push({ transport_profile: transport, source_transport: readTransport, generation_transport: transport,
        actual_post_count: calls.length, trusted_confirmations: confirmations.length, source_cid_verified: true,
        generation_preview_only: true, local_panel_collapse_reopen: true, local_style_dismissal: ['Escape', 'backdrop', 'Cancel'],
        pending_style_close_reopen: true, later_generic_confirmation: true, history_states: historyStates, page_errors: errors, observations });
      await context.close();
    }
    summary = { schema: 'swissknife.vdg-neural-photoshop-history-smoke.v1', source_sha256: sourceSha256,
      source_path: sourcePath, project_root: project, candidate_module_override: sourcePath !== canonicalSource,
      route_interception: false, canonical_source_sha256: canonicalBeforeSha,
      passed: true, viewport: { width: 720, height: 540 }, results,
      gui_acceptance: false, completion_authority: false, work_complete: false };
  } catch (error) {
    if (page) await page.evaluate(() => [...document.querySelectorAll('.window[data-app-id="neural-photoshop"] .window-content, .window[data-app-id="neural-photoshop"] .window-app-content, .window[data-app-id="neural-photoshop"] .neural-photoshop-container, .window[data-app-id="neural-photoshop"] .main-content, .window[data-app-id="neural-photoshop"] .left-panel, .window[data-app-id="neural-photoshop"] .right-panel, .window[data-app-id="neural-photoshop"] .panel-toggle')].map(node => {
      const style = getComputedStyle(node); const box = node.getBoundingClientRect();
      return { classes: node.className, panel: node.dataset.panel, hidden: node.hidden, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, display: style.display, height: style.height, overflow: style.overflow, position: style.position, flex: style.flex };
    })).then(value => writeFileSync(path.join(diagnostics, 'layout.json'), JSON.stringify({ stage, value }, null, 2))).catch(() => {});
    if (page) await bounded(page.screenshot({ path: path.join(diagnostics, 'failure.png'), fullPage: true }), 5000, 'diagnostic screenshot timed out').catch(() => {});
    throw Object.assign(error, { diagnostic_directory: diagnostics, stage });
  } finally {
    if (browser) await bounded(browser.close(), 10000, 'owned browser close timed out').catch(() => {});
    if (browserServer) await bounded(browserServer.close(), 10000, 'owned browser server close timed out').catch(() => browserServer.kill());
    await stopServer(server); viteLog.end();
  }
  assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex'), sourceSha256, 'Source changed during the diagnostic');
  assert.equal(createHash('sha256').update(readFileSync(canonicalSource)).digest('hex'), canonicalBeforeSha, 'Canonical source changed during the diagnostic');
  const alive = pid => {
    try { process.kill(pid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  assert.equal(alive(server.pid), false, 'The owned Vite process survived cleanup');
  assert.equal(alive(browserPid), false, 'The owned Chrome process survived cleanup');
  summary.owned_resources = { server_pid: server.pid, browser_pid: browserPid, server_alive_after_cleanup: false, browser_alive_after_cleanup: false };
  summary.owned_resources_closed = true;
  summary.screenshot_sha256 = Object.fromEntries(readdirSync(diagnostics).filter(name => name.endsWith('.png')).map(name => [name, createHash('sha256').update(readFileSync(path.join(diagnostics, name))).digest('hex')]));
  writeFileSync(path.join(diagnostics, 'result.json'), JSON.stringify(summary, null, 2) + '\n');
  return { ...summary, diagnostic_directory: diagnostics, owned_resources_closed: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runNeuralPhotoshopHistorySmoke().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ passed: false, error: error.message, stage: error.stage, diagnostic_directory: error.diagnostic_directory || '', gui_acceptance: false })); process.exitCode = 1;
  });
}

#!/usr/bin/env node
/** Normal desktop factory diagnostic; no canonical capture or census writes.
 * node scripts/run-with-owned-port.mjs --env-var SWISSKNIFE_VDG_MCP_CONTROL_SMOKE_PORT
 * --preferred 3097 -- node test/e2e/smoke/vdg-mcp-control-mounted-smoke.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function runMCPControlMountedSmoke() {
  const port = Number(process.env.SWISSKNIFE_VDG_MCP_CONTROL_SMOKE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('An owned MCP Control smoke port is required.');
  const diagnostics = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-mcp-control-mounted-after-'));
  const log = fs.createWriteStream(path.join(diagnostics, 'vite.log'), { mode: 0o600 });
  const base = `http://127.0.0.1:${port}`;
  const source = path.join(root, 'web/js/apps/mcp-control.js');
  const transport = process.env.VDG_CAPTURE_TRANSPORT || 'http';
  if (!['http', 'libp2p'].includes(transport)) throw new Error('Unsupported capture transport.');
  const controlSpec = path.join(root, 'test/e2e/families/control-plane-mcp-invoke.spec.ts');
  const specSource = fs.readFileSync(controlSpec, 'utf8');
  const guardStart = specSource.indexOf('export function installControlPrimaryAppGuard() {');
  const guardEnd = specSource.indexOf('\n\nconst require', guardStart);
  if (guardStart < 0 || guardEnd < guardStart) throw new Error('Exact Control primary mount guard missing.');
  const installGuard = Function(`${specSource.slice(guardStart, guardEnd).replace(/^export /, '')};return installControlPrimaryAppGuard;`)();
  const report = { diagnostics, transport, source_sha256: sha256(source), guard_source_sha256: sha256(controlSpec), cases: [], module_responses: [],
    page_errors: [], posts: [], gui_acceptance: false, work_complete: false, completion_authority: false };
  let server, browserServer, browser, context, page;
  try {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts',
      '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
    const deadline = Date.now() + 60000;
    while (true) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Owned Vite exited before readiness.');
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Owned Vite readiness exceeded 60 seconds.');
      await delay(100);
    }
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, timeout: 30000 });
    browser = await chromium.connect(browserServer.wsEndpoint());
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(installGuard);
    await context.addInitScript(selected => { globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = selected; }, transport);
    page = await context.newPage();
    page.on('pageerror', error => report.page_errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST') { const url = new URL(request.url()); report.posts.push({ origin: url.origin, path: url.pathname }); }
    });
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.endsWith('/js/apps/mcp-control.js')) report.module_responses.push({ path: pathname, status: response.status() });
    });
    // Observe browser-generated pointer events. No factory, app method,
    // network response, storage value or backend result is replaced.
    await page.addInitScript(() => {
      window.__mcpControlSmokeClicks = [];
      document.addEventListener('click', event => {
        if (event.target.closest?.('.window[data-app-id="mcp-control"]'))
          window.__mcpControlSmokeClicks.push({ trusted: event.isTrusted });
      }, true);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
    const launch = async () => {
      await page.locator('.icon[data-app="mcp-control"]').click();
      const app = page.locator('.window[data-app-id="mcp-control"]');
      await app.locator('.mcp-control-app.enhanced #mcp-server-list').waitFor({ state: 'visible', timeout: 45000 });
      assert.equal(await app.locator('.app-error').count(), 0);
      assert.equal(await page.evaluate(() => window.mcpControlApp instanceof window.MCPControlApp), true);
      await page.waitForFunction(() => !window.mcpControlApp.libp2pBrowserDefaultsLoading);
      return app;
    };
    let app = await launch();
    report.initial_state = await page.evaluate(() => ({ host_records: window.mcpControlApp.servers.size,
      remote_records: window.mcpControlApp.remoteServers.size, connected_remotes: window.mcpControlApp.connections.size,
      libp2p_status_available: Boolean(window.mcpControlApp.libp2pBrowserDefaults),
      libp2p_error: window.mcpControlApp.libp2pBrowserDefaultsError }));
    report.initial_visible_primary_controls = await app.locator('.mcp-control-app').evaluate(element =>
      [...element.querySelectorAll('button,input,select,textarea,[role="button"]')]
        .filter(control => control.getClientRects().length && getComputedStyle(control).visibility !== 'hidden')
        .map(control => ({ tag: control.tagName, id: control.id, text: (control.textContent || control.getAttribute('placeholder') || '').trim().slice(0, 100) })));
    const screenshot = async name => {
      const filename = path.join(diagnostics, `${name}.png`); await app.screenshot({ path: filename }); return filename;
    };
    report.initial_screenshot = await screenshot('actual-mounted');
    const click = async (locator, name) => {
      const before = await page.evaluate(() => window.__mcpControlSmokeClicks.length);
      await locator.click({ timeout: 5000 });
      assert.ok(await page.evaluate(index => window.__mcpControlSmokeClicks.slice(index).some(event => event.trusted), before), name);
      assert.deepEqual(report.page_errors, [], name);
    };
    await click(app.locator('.mcp-actions button[onclick="mcpControlApp.refreshServers()"]'), 'refresh actual server records');
    await page.waitForFunction(() => !window.mcpControlApp.libp2pBrowserDefaultsLoading);
    report.cases.push({ action: 'refresh server records', trusted_click: true });
    for (const [method, modalId] of [['showServerTemplates', 'templates-modal'], ['showAddServer', 'add-server-modal'],
      ['showAddRemote', 'add-remote-modal'], ['showDiscovery', 'discovery-modal'], ['showMetrics', 'metrics-modal']]) {
      await click(app.locator(`.mcp-actions button[onclick="mcpControlApp.${method}()"]`), `open ${modalId}`);
      const modal = app.locator(`#${modalId}`); await modal.waitFor({ state: 'visible' });
      if (modalId === 'add-server-modal') assert.match(await modal.innerText(), /browser build never executes this command/);
      if (modalId === 'metrics-modal') {
        assert.match(await modal.innerText(), /Connection Success Rate:\s*Not measured/);
        assert.doesNotMatch(await modal.innerText(), /95%/);
      }
      const screenshotPath = await screenshot(modalId);
      await click(modal.locator('.modal-close'), `close ${modalId}`);
      await modal.waitFor({ state: 'hidden' });
      report.cases.push({ action: modalId, trusted_open_and_close: true, screenshot: screenshotPath });
    }
    await click(app.locator('.mcp-actions button[onclick="mcpControlApp.refreshLibp2pBrowserDefaults()"]'), 'refresh actual libp2p status');
    await page.waitForFunction(() => !window.mcpControlApp.libp2pBrowserDefaultsLoading);
    report.cases.push({ action: 'refresh libp2p status', trusted_click: true });
    await app.locator('#server-search').fill('No matching configured server');
    await app.locator('#status-filter').selectOption('stopped'); await app.locator('#type-filter').selectOption('remote');
    assert.deepEqual(report.page_errors, []);
    report.cases.push({ action: 'own search and filter inputs', actual_input_events: true });
    for (const [method, modalId] of [['showServerTemplates', 'templates-modal'], ['showAddServer', 'add-server-modal'],
      ['showAddRemote', 'add-remote-modal'], ['showDiscovery', 'discovery-modal'], ['showMetrics', 'metrics-modal']]) {
      await click(app.locator(`.mcp-actions button[onclick="mcpControlApp.${method}()"]`), `open ${modalId} before owning window close`);
      await app.locator(`#${modalId}`).waitFor({ state: 'visible' });
      report.pending_case = `trusted titlebar Close while ${modalId} remains open`;
      await screenshot(`${modalId}-before-owning-close`);
      await click(app.locator('.window-control.close'), report.pending_case);
      await app.waitFor({ state: 'detached' });
      assert.equal(await page.locator(`#${modalId}`).count(), 0, 'owning dialog survived its window');
      app = await launch();
      report.cases.push({ action: report.pending_case, trusted_close: true, dialog_removed: true, next_factory_mount_usable: true });
      delete report.pending_case;
    }
    await click(app.locator('.window-control.close'), 'close actual app'); await app.waitFor({ state: 'detached' });
    const reopened = await launch();
    assert.equal(await reopened.locator('.mcp-control-app.enhanced').count(), 1);
    assert.equal(await reopened.locator('.app-error').count(), 0);
    await click(reopened.locator('.window-control.close'), 'close reopened app'); await reopened.waitFor({ state: 'detached' });
    report.cases.push({ action: 'trusted close and reopen actual factory', passed: true });
    assert.deepEqual(report.posts, [], 'pure dashboard inspection must not invoke a backend mutation');
    assert.deepEqual(report.page_errors, []);
    assert.ok(report.module_responses.some(row => row.status === 200));
    report.guard_checked_launches = await page.evaluate(() => window.__vdgControlPrimaryAppGuard?.checked_launches);
    assert.ok(report.guard_checked_launches >= 7, 'the real capture guard must verify each actual app launch');
    assert.equal(sha256(source), report.source_sha256, 'app source changed during diagnostic');
    assert.equal(sha256(controlSpec), report.guard_source_sha256, 'capture guard source changed during diagnostic');
    report.passed = true;
  } catch (error) {
    report.passed = false; report.error = error.stack || String(error);
    if (page && !page.isClosed()) {
      report.failure_screenshot = path.join(diagnostics, 'failure.png');
      await page.screenshot({ path: report.failure_screenshot }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    if (browserServer) await browserServer.kill().catch(() => undefined);
    if (server) {
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
      if (server.exitCode === null && server.signalCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(5000)]);
      if (server.exitCode === null && server.signalCode === null) { try { process.kill(-server.pid, 'SIGKILL'); } catch {} }
    }
    await new Promise(resolve => log.end(resolve));
    report.owned_resources_closed = true;
    fs.writeFileSync(path.join(diagnostics, 'result.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report));
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runMCPControlMountedSmoke(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

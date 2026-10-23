#!/usr/bin/env node
/** Real owned desktop/browser check, no canonical artifacts or external calls.
 * run-with-owned-port.mjs --env-var SWISSKNIFE_VDG_LOCAL_MODAL_SMOKE_PORT
 * --preferred 3087 -- node test/e2e/smoke/vdg-local-modal-ownership-smoke.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function runLocalModalOwnershipSmoke() {
  const port = Number(process.env.SWISSKNIFE_VDG_LOCAL_MODAL_SMOKE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('An owned Local modal smoke port is required.');
  const diagnostics = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-local-modal-smoke-'));
  const log = fs.createWriteStream(path.join(diagnostics, 'vite.log'), { mode: 0o600 });
  const base = `http://127.0.0.1:${port}`;
  let server, browserServer, browser, summary;
  try {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
    const deadline = Date.now() + 60000;
    while (true) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Owned Vite exited before readiness.');
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Owned Vite readiness exceeded60 seconds.'); await delay(100);
    }
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, timeout: 30000 });
    browser = await chromium.connect(browserServer.wsEndpoint());
    const cases = [];
    for (const id of ['openrouter', 'cron']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const blocked = [];
      // No provider request, credential write or backend operation is needed
      // to test a local dialog's ownership and real pointer interactions.
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          blocked.push({ method: request.method(), host: url.host }); return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      const page = await context.newPage(); page.on('dialog', dialog => dialog.dismiss());
      await page.addInitScript(() => {
        globalThis.__localModalCloses = [];
        document.addEventListener('click', event => {
          const close = event.target.closest?.('.window-control.close');
          if (close) globalThis.__localModalCloses.push({ app_id: close.closest('.window')?.dataset.appId, trusted: event.isTrusted });
        }, true);
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.desktop?.launchApp === 'function');
      for (let reopening = 0; reopening < 2; reopening++) {
        await page.locator(`.icon[data-app="${id}"]`).click();
        const app = page.locator(`.window[data-app-id="${id}"]`); await app.waitFor({ state: 'visible' });
        const trigger = id === 'openrouter' ? app.locator('button[onclick="window.openRouterApp.showAuthentication()"]') : app.locator('#cron-settings');
        await trigger.click();
        const modal = app.getByRole('dialog', { name: id === 'openrouter' ? 'OpenRouter API Configuration' : 'Scheduler settings', exact: true });
        await modal.waitFor({ state: 'visible' }); assert.equal(await modal.count(), 1, 'reopening duplicated the local modal');
        assert.equal(await modal.evaluate(element => element.parentElement.classList.contains('window-content') && getComputedStyle(element).position === 'absolute'), true);
        await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' });
        await trigger.click(); await modal.waitFor({ state: 'visible' });
        // This must be a real unforced pointer click while the dialog is open.
        await app.locator('.window-control.close').click({ timeout: 3000 });
        await app.waitFor({ state: 'detached' }); await modal.waitFor({ state: 'detached' });
        assert.equal(await page.locator('body > .or-modal, body > [data-cron-dialog]').count(), 0);
        await page.locator('.icon[data-app="calculator"]').click();
        const calculator = page.locator('.window[data-app-id="calculator"]');
        await calculator.getByRole('button', { name: '7', exact: true }).click({ timeout: 3000 });
        await calculator.locator('.window-control.close').click();
      }
      const closes = await page.evaluate(() => globalThis.__localModalCloses);
      assert.equal(closes.filter(item => item.app_id === id && item.trusted).length, 2);
      assert.equal(blocked.some(item => !['GET', 'HEAD', 'OPTIONS'].includes(item.method)), false, 'dialog workflow attempted an unexpected backend/provider operation');
      cases.push({ app_id: id, trusted_titlebar_closes: 2, repeated_mount_single_dialog: true, escape_closes_dialog: true,
        next_app_control_operable: true, external_requests_blocked: blocked.length });
      await page.screenshot({ path: path.join(diagnostics, `${id}-after-close.png`) }); await context.close();
    }
    summary = { passed: true, cases, gui_acceptance: false, work_complete: false, completion_authority: false };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (browserServer) await browserServer.kill().catch(() => undefined);
    if (server) {
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
      if (server.exitCode === null && server.signalCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(5000)]);
      try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    }
    log.end();
  }
  summary.owned_resources_closed = true;
  fs.writeFileSync(path.join(diagnostics, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ diagnostics, ...summary })); return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runLocalModalOwnershipSmoke(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

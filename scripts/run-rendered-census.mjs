#!/usr/bin/env node
/**
 * Launch every registered virtual-desktop app and record the controls that
 * are actually in the rendered window. Tool buttons are not clicked.
 *
 * Schema: swissknife.rendered-control-census.v1
 * Output: test-results/virtual-desktop-ipfs-mcp-orb/vog/rendered-control-census.json
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOwnedPort } from './lib/pick-free-port.mjs';
import { collectRenderedControls } from './rendered-control-rows.mjs';
const require = createRequire(import.meta.url);
const { inventorySourceFingerprint } = require('./vdg-capture-fingerprint.cjs');
const { commitInventoryCensus } = require('./vdg-inventory-contract.cjs');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const swissknifeRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(swissknifeRoot, '..');
const outputRelative = 'swissknife/test-results/virtual-desktop-ipfs-mcp-orb/vog/rendered-control-census.json';
const outputPath = process.env.RENDERED_CENSUS_OUT
  ? path.resolve(process.env.RENDERED_CENSUS_OUT)
  : path.join(repoRoot, outputRelative);
const appLimit = Number(process.env.RENDERED_CENSUS_LIMIT || '0');

function logLine(message) {
  fs.writeSync(1, `${message}\n`);
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`desktop exited ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // The server is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('desktop did not accept connections');
}

async function main() {
  const sourceFingerprint = inventorySourceFingerprint({ sourceRoot: swissknifeRoot });
  const lease = await findOwnedPort({
    preferredPort: Number(process.env.SWISSKNIFE_RENDERED_CENSUS_PORT || '3013'),
  });
  const port = lease.port;
  const baseURL = `http://127.0.0.1:${port}`;
  const child = spawn('npm', ['run', 'desktop', '--', '--port', String(port), '--strictPort'], {
    cwd: swissknifeRoot,
    stdio: 'ignore',
    detached: true,
  });
  const playwright = require('playwright');
  let browser;
  let browserServer;
  let browserStarting;
  let cleaning;
  let cancelled = false;
  const bounded = (promise, ms) => new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    Promise.resolve(promise).catch(() => undefined).finally(() => { clearTimeout(timer); resolve(); });
  });
  const signalServer = signal => {
    try { process.kill(-child.pid, signal); }
    catch { try { child.kill(signal); } catch {} }
  };
  const cleanup = () => cleaning ||= (async () => {
    // launchServer exposes the actual owned Chrome process even if connection
    // setup is interrupted; it can be killed after a failed graceful close.
    if (browserStarting) await bounded(browserStarting, 16000);
    if (browser) await bounded(browser.close(), 2000);
    if (browserServer) {
      await bounded(browserServer.kill(), 2000);
      try { browserServer.process()?.kill('SIGKILL'); } catch {}
    }
    signalServer('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 150));
    signalServer('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await bounded(new Promise(resolve => child.once('close', resolve)), 1000);
  })();
  const stop = () => { cancelled = true; void cleanup().finally(() => process.exit(143)); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    await waitForServer(baseURL, child);
    browserStarting = playwright.chromium.launchServer({ channel: 'chrome', headless: true, timeout: 15000 })
      .then(server => { browserServer = server; return server; });
    await browserStarting;
    browser = await playwright.chromium.connect(browserServer.wsEndpoint());
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('dialog', (dialog) => {
      dialog.dismiss().catch(() => undefined);
    });
    page.on('filechooser', (chooser) => {
      chooser.setFiles([]).catch(() => undefined);
    });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(
      () => window.swissknifeDesktop && typeof window.swissknifeDesktop.launchApp === 'function',
      { timeout: 30000 },
    );
    const { require: tsxRequire } = require('tsx/cjs/api');
    const { VIRTUAL_DESKTOP_APP_MANIFEST } = tsxRequire(path.join(swissknifeRoot, 'src/services/apps/virtual-desktop-app-manifest.ts'), import.meta.url);
    const registered = await page.evaluate(() => Array.from(window.swissknifeDesktop.apps.keys()));
    let launches = VIRTUAL_DESKTOP_APP_MANIFEST.apps.flatMap(app => [app.id, ...app.aliases].map(launch_id => ({ app_id: app.id, launch_id })));
    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) if (!registered.includes(app.id)) throw new Error(`manifest app is not registered: ${app.id}`);
    if (Number.isInteger(appLimit) && appLimit > 0) launches = launches.slice(0, appLimit);
    const rows = [];
    logLine(`census runner live-dom launches=${launches.length}`);

    async function ensureDesktop() {
      const ready = await page.evaluate(() => Boolean(
        window.swissknifeDesktop && typeof window.swissknifeDesktop.launchApp === 'function',
      )).catch(() => false);
      if (ready) return;
      await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(
        () => window.swissknifeDesktop && typeof window.swissknifeDesktop.launchApp === 'function',
        { timeout: 30000 },
      );
    }

    for (const { app_id: appId, launch_id: launchId } of launches) {
      let visible = false;
      let appWindow;
      for (let attempt = 1; attempt <= 2 && !visible; attempt += 1) {
        try {
          await ensureDesktop();
        } catch (error) {
          logLine(`census desktop unavailable before ${appId}: ${error.message}`);
          continue;
        }
        logLine(`census launch ${appId} attempt=${attempt}`);
        try {
          await page.evaluate((id) => Promise.race([
            Promise.resolve(window.swissknifeDesktop.launchApp(id)).then(() => 'done').catch(() => 'error'),
            new Promise((resolve) => setTimeout(() => resolve('timeout'), 12000)),
          ]), launchId);
          const windowSelector = `.window[data-app-id="${appId}"]`;
          appWindow = page.locator(windowSelector).last();
          visible = await appWindow.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
        } catch (error) {
          logLine(`census skip ${appId}: ${error.message}`);
          visible = false;
        }
      }
      if (!visible || !appWindow) {
        logLine(`census miss ${appId}`);
        continue;
      }
      await appWindow.locator('.window-control, button, [data-live-gateway-binding]').first()
        .waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      const declaration = VIRTUAL_DESKTOP_APP_MANIFEST.apps.find(app => app.id === appId);
      if (declaration.backend_capabilities.length > 0) {
        await appWindow.locator('[data-live-gateway-binding]').first().waitFor({ state: 'visible', timeout: 15000 });
      }
      let found = [];
      try {
        found = await appWindow.evaluate(collectRenderedControls);
      } catch (error) {
        logLine(`census skip ${appId}: ${error.message}`);
        continue;
      }
      const seen = new Set();
      for (const item of found) {
        if ((!item.visible && !item.data_native_gateway_binding) || !item.selector || item.selector.includes('${') || item.selector.includes('escapeHTML')) {
          continue;
        }
        const key = `${launchId}:${item.selector}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          app_id: appId,
          launch_id: launchId,
          selector: item.selector,
          role: item.role || 'button',
          accessible_name: item.accessible_name || '',
          data_action: item.data_action, data_live_gateway_binding: item.data_live_gateway_binding,
          data_native_gateway_binding: item.data_native_gateway_binding, data_native_gateway_tool: item.data_native_gateway_tool,
          data_gateway_policy_tool: item.data_gateway_policy_tool, data_external_provider: item.data_external_provider,
        });
      }
      await appWindow.locator('.window-control.close').first().click({ timeout: 3000 }).catch(() => undefined);
      logLine(`census recorded ${appId} rows=${rows.length}`);
    }
    const apps = new Set(rows.map((row) => row.app_id));
    const payload = {
      schema: 'swissknife.rendered-control-census.v1',
      collection: 'live-dom',
      source_template: false,
      clicked: false,
      source_fingerprint: sourceFingerprint,
      work_complete: false,
      completion_authority: false,
      app_count: apps.size,
      row_count: rows.length,
      rows,
    };
    if (apps.size < 45 || rows.length < 45 || launches.some(launch => !rows.some(row => row.launch_id === launch.launch_id))) throw new Error('rendered census incomplete: preserving the previous inventory');
    if (cancelled) throw new Error('rendered census cancelled: preserving previous inventory');
    commitInventoryCensus(payload, outputPath, { sourceRoot: swissknifeRoot });
    logLine(outputPath);
    logLine(`rendered census apps=${apps.size} rows=${rows.length}`);
  } finally {
    await cleanup();
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

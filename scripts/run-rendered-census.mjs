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
  const require = createRequire(import.meta.url);
  const playwright = require('playwright');
  let browser;
  try {
    await waitForServer(baseURL, child);
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
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
    let appIds = await page.evaluate(() => Array.from(window.swissknifeDesktop.apps.keys()));
    appIds = appIds.filter((id) => typeof id === 'string' && id.length > 0).sort();
    if (Number.isInteger(appLimit) && appLimit > 0) appIds = appIds.slice(0, appLimit);
    const rows = [];
    logLine(`census runner live-dom apps=${appIds.length}`);

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

    for (const appId of appIds) {
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
          ]), appId);
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
      let found = [];
      try {
        found = await appWindow.evaluate((root) => {
        const nodes = Array.from(root.querySelectorAll(
          'button, [role="button"], [role="menuitem"], a[href], input, select, textarea, [data-live-gateway-binding], .window-control',
        ));
        return nodes.map((node) => {
          const element = node;
          const binding = element.getAttribute('data-live-gateway-binding') || '';
          const action = element.getAttribute('data-action') || '';
          let selector = '';
          if (element.classList.contains('window-control') && element.classList.contains('minimize')) {
            selector = '.window-control.minimize';
          } else if (element.classList.contains('window-control') && element.classList.contains('maximize')) {
            selector = '.window-control.maximize';
          } else if (element.classList.contains('window-control') && element.classList.contains('close')) {
            selector = '.window-control.close';
          } else if (binding) {
            selector = `[data-live-gateway-binding="${binding.replaceAll('"', '\\"')}"]`;
          } else if (element.id) {
            selector = `#${CSS.escape(element.id)}`;
          } else if (action && !action.includes('${') && !action.includes('escapeHTML')) {
            selector = `[data-action="${action.replaceAll('"', '\\"')}"]`;
          } else {
            const label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
            if (label && !label.includes('${') && !label.includes('escapeHTML')) {
              selector = `${element.tagName.toLowerCase()}[aria-label="${label.replaceAll('"', '\\"')}"]`;
            }
          }
          const role = element.getAttribute('role')
            || (element.classList.contains('window-control') ? 'button' : element.tagName.toLowerCase());
          const accessible = (
            element.getAttribute('aria-label')
            || element.getAttribute('title')
            || (element.textContent || '')
          ).trim().slice(0, 160);
          const shown = element.getClientRects().length > 0;
          return { selector, role, accessible_name: accessible, visible: shown };
        });
      });
      } catch (error) {
        logLine(`census skip ${appId}: ${error.message}`);
        continue;
      }
      const seen = new Set();
      for (const item of found) {
        if (!item.visible || !item.selector || item.selector.includes('${') || item.selector.includes('escapeHTML')) {
          continue;
        }
        const key = `${appId}:${item.selector}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          app_id: appId,
          launch_id: appId,
          selector: item.selector,
          role: item.role || 'button',
          accessible_name: item.accessible_name || '',
        });
      }
      await page.evaluate((id) => {
        document.querySelectorAll(`.window[data-app-id="${id}"]`).forEach((node) => node.remove());
      }, appId).catch(() => undefined);
      logLine(`census recorded ${appId} rows=${rows.length}`);
    }
    const apps = new Set(rows.map((row) => row.app_id));
    const payload = {
      schema: 'swissknife.rendered-control-census.v1',
      collection: 'live-dom',
      source_template: false,
      clicked: false,
      app_count: apps.size,
      row_count: rows.length,
      rows,
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    logLine(outputPath);
    logLine(`rendered census apps=${apps.size} rows=${rows.length}`);
    if (apps.size < 45 || rows.length < 45) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

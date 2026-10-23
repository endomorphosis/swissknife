#!/usr/bin/env node
// Actual provider catalog and local UI clicks. Diagnostic, never family GO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { collectRenderedControls } from '../../../scripts/rendered-control-rows.mjs';
import { closeLaunched, waitForRowCalls, screenshotAppWindow } from '../helpers/live-click-session.ts';
const root = path.resolve(import.meta.dirname, '../../..');
const port = Number(process.env.SWISSKNIFE_VDG_OPENROUTER_SMOKE_PORT);
assert.ok(Number.isInteger(port) && port > 1023, 'use run-with-owned-port.mjs');
Object.assign(process.env, parseEnv(fs.readFileSync(path.resolve(root, '../data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/backends/client.env'), 'utf8')));
const output = path.join(root, 'test-results/vdg-native-smoke', `openrouter-controls-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const report = { passed: false, completion_authority: false, mocked: false, samples: [] };
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, env: process.env, detached: true, stdio: 'ignore' });
let browser;
try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`owned Vite exited ${server.exitCode}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let posts = 0; const errors = [];
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(url);
  await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
  const launch = async () => {
    await page.evaluate(() => window.swissknifeDesktop.launchApp('openrouter'));
    const app = page.locator('.window[data-app-id="openrouter"]').last();
    await app.locator('[data-openrouter-action="favorite"]').first().waitFor({ state: 'visible' });
    return app;
  };
  let app = await launch();
  const baseline = await app.evaluate(collectRenderedControls);
  const modelControls = baseline.filter(row => row.selector.startsWith('[data-openrouter-model='));
  const favorites = modelControls.filter(row => row.selector.includes('[data-openrouter-action="favorite"]'));
  assert.ok(favorites.length > 1, 'actual public catalog is unavailable');
  assert.equal(modelControls.length, favorites.length * 4, 'a model action was dropped');
  assert.equal(new Set(baseline.map(row => row.selector)).size, baseline.length);
  report.actual_initial_control_count = baseline.length; report.actual_model_count = favorites.length;
  const allResolve = async () => {
    const missing = await app.evaluate((root, selectors) => selectors.filter(selector => root.querySelectorAll(selector).length !== 1), modelControls.map(row => row.selector));
    assert.deepEqual(missing, [], 'catalog model identities changed across favorite reorder/reopen');
  };
  const actions = [favorites[0], favorites[1], ...['info', 'default', 'try'].map(action => ({
    ...favorites[0], selector: favorites[0].selector.replace('[data-openrouter-action="favorite"]', `[data-openrouter-action="${action}"]`),
  }))];
  for (const [index, action] of actions.entries()) {
    const started = performance.now();
    await allResolve();
    const target = app.locator(action.selector);
    const imageStart = performance.now();
    await screenshotAppWindow(page, app, { path: path.join(output, `${index}-before.png`), animations: 'disabled' });
    const beforeMs = performance.now() - imageStart;
    await target.click();
    await waitForRowCalls(page, [], 0);
    const afterStart = performance.now();
    await screenshotAppWindow(page, app, { path: path.join(output, `${index}-after.png`), animations: 'disabled' });
    const afterMs = performance.now() - afterStart;
    await closeLaunched(page, app);
    const reopenStart = performance.now(); app = await launch(); const reopenMs = performance.now() - reopenStart;
    await allResolve();
    report.samples.push({ selector: action.selector, beforeMs, afterMs, reopenMs, totalMs: performance.now() - started });
  }
  // Compare genuine app-region PNG paths; no click, model or proof is omitted.
  report.screenshot_samples = [];
  for (let index = 0; index < 3; index++) {
    const start = performance.now(); await app.screenshot({ animations: 'disabled' }); const locatorMs = performance.now() - start;
    const box = await app.boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 900);
    const clipStart = performance.now(); await page.screenshot({ clip: box, animations: 'disabled' });
    const viewportClipMs = performance.now() - clipStart;
    const optimizedStart = performance.now(); await screenshotAppWindow(page, app, { animations: 'disabled' });
    report.screenshot_samples.push({ locatorMs, viewportClipMs, optimizedMs: performance.now() - optimizedStart });
  }
  assert.equal(posts, 0, 'local model controls originated a remote POST'); assert.deepEqual(errors, []);
  report.remote_post_count = posts; report.pageerrors = errors;
  report.passed = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, report: path.join(output, 'report.json'), error: report.error,
    controls: report.actual_initial_control_count, samples: report.samples, screenshots: report.screenshot_samples }));
}

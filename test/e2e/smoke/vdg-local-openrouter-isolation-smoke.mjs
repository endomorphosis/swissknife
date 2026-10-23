#!/usr/bin/env node
/** Paired local-state diagnostic using actual catalog/UI/helper operations.
 * Run from SwissKnife with node --import tsx. Never writes family evidence.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { closeLaunched, waitForRowCalls, screenshotAppWindow } from '../helpers/live-click-session.ts';

const require = createRequire(import.meta.url);
const { inspectPng } = require('../helpers/live-click-png.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const keys = ['openrouter_favorites', 'openrouter_settings', 'openrouter_conversations', 'openrouter_history'];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const archivedFixtureSpec = path.resolve(root, '../data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/smoke-receipts/openrouter-case-cost-diagnostic/candidate-source/test/e2e/families/local-negative-mcp.spec.ts');
const archivedFixtureSha256 = '016f82163d01d2dc01c6f6768fa638247e8dc8fbcb209854bd0d9a6afddd1ad2';

function fixture() {
  // The measured candidate was rejected. Reruns explicitly evaluate its
  // archived bytes and must never silently use or claim the canonical fixture.
  const source = fs.readFileSync(archivedFixtureSpec, 'utf8');
  assert.equal(digest(source), archivedFixtureSha256, 'archived diagnostic fixture bytes changed');
  const match = source.match(/export (function installLocalTodoCaseIsolation\(\) \{[\s\S]*?\n\})\n\nconst require/);
  assert.ok(match, 'Local spec must retain the complete executable fixture');
  return new Function(`return (${match[1]});`)();
}

function diagnosticInputs() {
  const evidence = path.join(root, 'test-results/virtual-desktop-ipfs-mcp-orb');
  const directory = path.join(evidence, 'vdg/checkpoints');
  const checkpointPath = fs.readdirSync(directory).filter(name => /^local-http-[a-f0-9]{64}\.json$/.test(name))
    .map(name => path.join(directory, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const bytes = fs.readFileSync(checkpointPath);
  const checkpoint = JSON.parse(bytes);
  assert.equal(checkpoint.schema, 'swissknife.vdg-capture-checkpoint.v1');
  assert.equal(digest(JSON.stringify(checkpoint.payload)), checkpoint.payload_sha256);
  const successful = checkpoint.payload.rows.filter(row => row.app_id === 'openrouter' && row.clicked === true
    && row.visibility === 'visible' && row.failure_reasons.length === 0 && row.selector.includes('[data-openrouter-action="favorite"]'));
  const favorites = [...new Set(successful.map(row => JSON.parse(row.selector.match(/^\[data-openrouter-model=("[^"]+")\]/)[1])))];
  assert.ok(favorites.length >= 100, 'control precondition needs actual observed accumulated favorites');
  const matrix = JSON.parse(fs.readFileSync(path.join(evidence, 'control-tool-matrix.json'))).rows.filter(row => row.app_id === 'openrouter');
  const catalogRows = matrix.filter(row => row.selector.includes('[data-openrouter-placement="catalog"]'));
  const modelIds = [...new Set(catalogRows.map(row => JSON.parse(row.selector.match(/^\[data-openrouter-model=("[^"]+")\]/)[1])))];
  const selected = modelIds.slice(Math.floor(modelIds.length * 0.65)).filter(id => !favorites.includes(id)).slice(0, 6);
  assert.equal(selected.length, 6);
  const rows = selected.flatMap(id => ['favorite', 'info', 'try', 'default'].map(action => {
    const row = catalogRows.find(row => row.selector.startsWith(`[data-openrouter-model=${JSON.stringify(id)}]`)
      && row.selector.endsWith(`[data-openrouter-action="${action}"]`));
    assert.ok(row, `missing actual matrix action ${id} ${action}`);
    return { model_id: id, action, selector: row.selector };
  }));
  return { favorites, matrix, modelIds, rows, provenance: {
    source: path.relative(root, checkpointPath), checkpoint_sha256: digest(bytes), input_fingerprint: checkpoint.input_fingerprint,
    seed_favorite_count: favorites.length, seed_favorite_ids: favorites,
    local_precondition_only: true, acquisition_or_acceptance_authority: false,
  } };
}

async function readState(page) {
  return page.evaluate(keys => ({
    storage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
    api_key: localStorage.getItem('openrouter_api_key'), independent: localStorage.getItem('vdg-isolation-independent-key'),
    restores: window.__vdgLocalOpenRouterCaseIsolation?.restored_cases ?? null,
    favorites: [...(window.openRouterApp?.favoriteModels || [])],
    default_model: window.openRouterApp?.settings.defaultModel,
    current_tab: window.openRouterApp?.currentTab,
    models: [...(window.openRouterApp?.models.keys() || [])].sort(),
  }), keys);
}

export async function runLocalOpenRouterIsolationSmoke() {
  const port = Number(process.env.SWISSKNIFE_VDG_LOCAL_OPENROUTER_SMOKE_PORT);
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'An owned smoke port is required');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-local-openrouter-isolation-'));
  const inputs = diagnosticInputs();
  const log = fs.createWriteStream(path.join(output, 'vite.log'), { mode: 0o600 });
  const base = `http://127.0.0.1:${port}`;
  const report = { passed: false, diagnostic_only: true, canonical_capture: false,
    fixture_source: { scope: 'archived rejected candidate', path: path.relative(root, archivedFixtureSpec), sha256: archivedFixtureSha256 },
    driver_limitation: 'Custom case driver; uses actual screenshotAppWindow, waitForRowCalls and closeLaunched helpers. Full capture remains required.',
    quiet_bounds: { appear_ms: 800, quiet_ms: 400, timeout_ms: 15000 },
    control_local_precondition: inputs.provenance, selected_model_ids: [...new Set(inputs.rows.map(row => row.model_id))],
    scenarios: [], work_complete: false, completion_authority: false };
  let server, browserServer, browser;
  try {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
    const deadline = Date.now() + 60000;
    while (true) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Owned Vite exited before readiness');
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Owned Vite readiness exceeded60 seconds');
      await pause(100);
    }
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, timeout: 30000 });
    browser = await chromium.connect(browserServer.wsEndpoint());
    for (const isolated of [false, true]) {
      const name = isolated ? 'isolated' : 'accumulated-control';
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const posts = [], pageerrors = [], dialogs = [];
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          posts.push({ method: request.method(), host: url.host, path: url.pathname }); return route.abort('blockedbyclient');
        }
        // The complete real public catalog is required. Other external
        // requests are unnecessary; no provider completion is originated.
        if (url.origin !== base && !(url.origin === 'https://openrouter.ai' && url.pathname === '/api/v1/models')) return route.abort('blockedbyclient');
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => pageerrors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
      await page.evaluate(({ seed, keys }) => {
        for (const key of keys) localStorage.removeItem(key);
        if (seed) localStorage.setItem('openrouter_favorites', JSON.stringify(seed));
        localStorage.setItem('vdg-isolation-independent-key', 'exact independent local bytes');
      }, { seed: isolated ? null : inputs.favorites, keys });
      if (isolated) await context.addInitScript(fixture());
      await context.addInitScript(() => {
        window.__openRouterDiagnosticClicks = [];
        document.addEventListener('click', event => {
          const target = event.target.closest?.('[data-openrouter-action]');
          if (target) window.__openRouterDiagnosticClicks.push({ trusted: event.isTrusted, model_id: target.dataset.openrouterModel, action: target.dataset.openrouterAction });
        }, true);
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
      const baseline = (await readState(page)).storage;
      const launch = async () => {
        await page.evaluate(() => window.swissknifeDesktop.launchApp('openrouter'));
        const app = page.locator('.window[data-app-id="openrouter"]').last();
        await app.locator('[data-openrouter-placement="catalog"][data-openrouter-action="favorite"]').first().waitFor({ state: 'visible', timeout: 20000 });
        return app;
      };
      let app = await launch();
      const initial = await readState(page);
      assert.deepEqual(initial.models, [...inputs.modelIds].sort(), 'the full actual catalog must match the current source inventory');
      assert.equal(initial.api_key, null, 'private smoke context must not contain a provider credential');
      const unresolved = await app.evaluate((element, selectors) => selectors.filter(selector => element.querySelectorAll(selector).length !== 1), inputs.matrix.map(row => row.selector));
      assert.deepEqual(unresolved, [], 'every original OpenRouter census control must remain present and unique');
      await closeLaunched(page, app);
      const samples = [];
      for (const [index, row] of inputs.rows.entries()) {
        const started = performance.now(); app = await launch();
        const launchMs = performance.now() - started;
        const target = app.locator(row.selector);
        assert.equal(await target.count(), 1);
        assert.equal(await target.isVisible(), true);
        const before = await readState(page);
        assert.deepEqual(before.models, initial.models, 'no catalog model may be dropped to reduce work');
        assert.equal(await app.locator('[data-openrouter-placement="catalog"][data-openrouter-action="favorite"]').count(), inputs.modelIds.length);
        if (isolated) assert.deepEqual(before.storage, baseline);
        if (row.action === 'favorite') assert.equal(before.favorites.includes(row.model_id), false, 'the paired action must genuinely add a later unfavorited model');
        const beforePath = path.join(output, `${name}-${index}-before.png`);
        const beforeStart = performance.now();
        await screenshotAppWindow(page, app, { path: beforePath, timeout: 15000, animations: 'disabled' });
        const beforeMs = performance.now() - beforeStart;
        assert.equal(inspectPng(fs.readFileSync(beforePath)).ok, true);
        const clickCount = await page.evaluate(() => window.__openRouterDiagnosticClicks.length);
        const dialogCount = dialogs.length;
        await target.scrollIntoViewIfNeeded({ timeout: 2000 });
        const clickStart = performance.now(); await target.click({ timeout: 8000 }); const clickMs = performance.now() - clickStart;
        const quietStart = performance.now();
        await waitForRowCalls(page, [], 0, { appearMs: 800, quietMs: 400, timeoutMs: 15000 });
        const quietMs = performance.now() - quietStart;
        const after = await readState(page);
        assert.deepEqual(after.models, initial.models);
        assert.equal(after.restores, before.restores, 'a real card rerender must not trigger case reset');
        assert.ok(await page.evaluate(({ count, id, action }) => window.__openRouterDiagnosticClicks.slice(count)
          .some(event => event.trusted && event.model_id === id && event.action === action), { count: clickCount, id: row.model_id, action: row.action }));
        if (row.action === 'favorite') {
          assert.equal(after.favorites.length, before.favorites.length + 1);
          assert.ok(JSON.parse(after.storage.openrouter_favorites).includes(row.model_id));
          assert.ok(keys.every(key => after.storage[key] !== null), 'saveSettings must genuinely write its four owned keys');
        } else if (row.action === 'default') {
          assert.equal(after.default_model, row.model_id);
          assert.equal(JSON.parse(after.storage.openrouter_settings).defaultModel, row.model_id);
        } else if (row.action === 'try') {
          assert.equal(after.current_tab, 'playground'); assert.equal(after.default_model, row.model_id);
          assert.deepEqual(after.storage, before.storage, 'Try does not persist settings without a real save');
        } else assert.ok(dialogs.slice(dialogCount).some(message => message.includes(row.model_id)), 'real model info must be shown');
        assert.equal(after.api_key, null); assert.equal(after.independent, 'exact independent local bytes');
        const afterPath = path.join(output, `${name}-${index}-after.png`);
        const afterStart = performance.now();
        await screenshotAppWindow(page, app, { path: afterPath, timeout: 15000, animations: 'disabled' });
        const afterMs = performance.now() - afterStart;
        assert.equal(inspectPng(fs.readFileSync(afterPath)).ok, true);
        await closeLaunched(page, app);
        const closed = await readState(page);
        assert.deepEqual(closed.storage, isolated ? baseline : after.storage, 'reset must occur only after the real owning window closes');
        if (isolated) assert.equal(closed.restores, before.restores + 1);
        assert.equal(closed.api_key, null); assert.equal(closed.independent, 'exact independent local bytes');
        samples.push({ ...row, launch_ms: launchMs, before_png_ms: beforeMs, click_ms: clickMs, quiet_ms: quietMs,
          after_png_ms: afterMs, total_ms: performance.now() - started, favorites_before: before.favorites.length,
          favorites_after: after.favorites.length, model_count: initial.models.length, trusted_click: true,
          genuine_action_verified: true, after_png_precedes_reset: true, exact_baseline_after_close: isolated,
          screenshot_before: path.basename(beforePath), screenshot_after: path.basename(afterPath) });
        console.log(JSON.stringify({ scenario: name, row: index + 1, action: row.action, total_ms: Math.round(samples.at(-1).total_ms) }));
      }
      assert.equal(posts.length, 0, 'no provider write or MCP operation may be originated');
      assert.deepEqual(pageerrors, []);
      report.scenarios.push({ name, initial_favorite_count: initial.favorites.length, full_catalog_count: initial.models.length,
        original_census_controls_verified: inputs.matrix.length, rows: samples, provider_or_mcp_posts: posts.length,
        timing_ms: { mean: mean(samples.map(row => row.total_ms)), median: median(samples.map(row => row.total_ms)),
          total: samples.reduce((sum, row) => sum + row.total_ms, 0), mean_launch: mean(samples.map(row => row.launch_ms)),
          mean_before_png: mean(samples.map(row => row.before_png_ms)), mean_after_png: mean(samples.map(row => row.after_png_ms)) } });
      await context.close();
    }
    const [control, isolated] = report.scenarios;
    report.timing_gain = { ratio: isolated.timing_ms.mean / control.timing_ms.mean,
      mean_ms_saved: control.timing_ms.mean - isolated.timing_ms.mean,
      percent_faster: 100 * (1 - isolated.timing_ms.mean / control.timing_ms.mean) };
    report.actual_case_count = 48; report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (browserServer) await browserServer.kill().catch(() => undefined);
    if (server) {
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
      if (server.exitCode === null && server.signalCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), pause(5000)]);
      try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    }
    log.end(); report.owned_resources_closed = true;
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ diagnostics: output, passed: report.passed, actual_case_count: report.actual_case_count,
      timing_gain: report.timing_gain, owned_resources_closed: true }));
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runLocalOpenRouterIsolationSmoke(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

#!/usr/bin/env node
/** Owned real desktop diagnostic; never writes canonical capture evidence.
 * node scripts/run-with-owned-port.mjs --env-var SWISSKNIFE_VDG_STRUDEL_SMOKE_PORT
 * --preferred 3087 -- node --import tsx test/e2e/smoke/vdg-strudel-grandma-controls-smoke.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { closeLaunched, screenshotAppWindow, waitForRowCalls } from '../helpers/live-click-session.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rank = selector => selector.includes('.window-control.close') ? 3
  : selector.includes('.window-control.minimize') ? 2 : selector.includes('.window-control.maximize') ? 1 : 0;

export async function runStrudelControlsSmoke() {
  const port = Number(process.env.SWISSKNIFE_VDG_STRUDEL_SMOKE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('An owned Strudel smoke port is required.');
  const diagnostics = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-strudel-controls-'));
  const log = fs.createWriteStream(path.join(diagnostics, 'vite.log'), { mode: 0o600 });
  const base = `http://127.0.0.1:${port}`;
  const matrixPath = path.join(root, 'test-results/virtual-desktop-ipfs-mcp-orb/control-tool-matrix.json');
  const rows = JSON.parse(fs.readFileSync(matrixPath)).rows.filter(row => row.app_id === 'strudel' && row.family === 'vdg-local')
    .sort((left, right) => rank(left.selector) - rank(right.selector));
  assert.equal(rows.length, 19, 'diagnostic covers all19 original Strudel controls');
  let server, browserServer, browser, context, summary;
  try {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts',
      '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
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
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const blocked = [], pageErrors = [], dialogs = [];
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        blocked.push({ method: request.method(), host: url.host }); return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('dialog', dialog => { dialogs.push({ type: dialog.type(), dismissed: true }); return dialog.dismiss(); });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      window.__strudelSmokeClicks = [];
      document.addEventListener('click', event => {
        if (event.target.closest?.('.window[data-app-id="strudel"]')) window.__strudelSmokeClicks.push({ trusted: event.isTrusted });
      }, true);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
    // Observe the actual factory's returned instance without replacing its
    // implementation or any audio/backend operation.
    await page.evaluate(() => {
      const desktop = window.swissknifeDesktop;
      const factory = desktop.createGrandmaStrudelDAWApp.bind(desktop);
      window.__strudelSmokeInstances = [];
      desktop.createGrandmaStrudelDAWApp = async (...args) => {
        const instance = await factory(...args); window.__strudelSmokeInstances.push(instance); return instance;
      };
    });
    const launch = async () => {
      const previousCount = await page.evaluate(() => window.__strudelSmokeInstances.length);
      await page.evaluate(() => window.swissknifeDesktop.launchApp('strudel'));
      const app = page.locator('.window[data-app-id="strudel"]');
      await app.locator('#help-btn').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(previousCount => window.__strudelSmokeInstances.length > previousCount
        && window.__strudelSmokeInstances.at(-1)?.state.isReady, previousCount, { timeout: 15000 });
      assert.equal(await page.evaluate(() => typeof window.strudelDAW), 'undefined', 'test must exercise the actual factory without the legacy singleton');
      return app;
    };
    const close = async app => {
      await closeLaunched(page, app);
      await page.waitForFunction(() => {
        const app = window.__strudelSmokeInstances.at(-1);
        return app.disposed && app.currentOscillators.length === 0 && (!app.audio.context || app.audio.context.state === 'closed');
      }, undefined, { timeout: 10000 }).catch(async error => {
        const state = await page.evaluate(() => window.__strudelSmokeInstances.map(app => ({ disposed: app.disposed,
          playing: app.state.isPlaying, oscillators: app.currentOscillators.length, audio: app.audio.context?.state })));
        throw new Error(`Owned app close failed: ${JSON.stringify(state)}; ${error.message}`);
      });
    };
    const cases = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], app = await launch(), control = app.locator(row.selector);
      await control.waitFor({ state: 'visible' }); assert.equal(await control.count(), 1);
      let precondition = 'fresh actual app';
      // These controls are disabled at rest. Exercise their real enabled
      // states too, rather than treating a disabled button as a successful click.
      if (['#play-button', '#stop-button'].includes(row.selector)) {
        await app.locator('[data-song-id="my-creation"] button').click();
        precondition = 'local creation selected';
        if (row.selector === '#stop-button') { await app.locator('#play-button').click(); precondition += '; real playback started'; }
      }
      await screenshotAppWindow(page, app, { path: path.join(diagnostics, `${index}-before.png`), animations: 'disabled' });
      const before = await page.evaluate(() => window.__strudelSmokeClicks.length);
      await control.click({ timeout: 5000 }); await waitForRowCalls(page, [], 0);
      assert.ok(await page.evaluate(before => window.__strudelSmokeClicks.slice(before).some(click => click.trusted), before));
      if (await app.count() && await app.isVisible()) await screenshotAppWindow(page, app, { path: path.join(diagnostics, `${index}-after.png`), animations: 'disabled' });
      else await page.screenshot({ path: path.join(diagnostics, `${index}-after.png`) });
      await close(app);
      assert.deepEqual(pageErrors, [], `page error at original control ${index}: ${row.selector}`);
      cases.push({ selector: row.selector, trusted_click: true, precondition, passed: true });
      console.log(JSON.stringify({ original_control: index + 1, of: rows.length, passed: true }));
    }
    const app = await launch();
    await app.locator('[data-song-id="my-creation"] button').click();
    await app.locator('#creation-pattern').fill('C0 Eb4 G4');
    await app.locator('#creation-tempo').fill('90');
    await app.locator('#apply-creation').click();
    assert.match(await app.locator('[data-creation-status]').textContent(), /c0 eb4 g4 at 90 BPM/);
    assert.deepEqual(await page.evaluate(() => window.__strudelSmokeInstances.at(-1).creation), { pattern: 'c0 eb4 g4', tempo: 90 });
    await app.locator('#play-button').click(); await waitForRowCalls(page, [], 0);
    // AudioParam.value remains its default until the scheduled note time.
    // Wait for the final note rather than reading future scheduled parameters.
    await page.waitForFunction(() => {
      const oscillators = window.__strudelSmokeInstances.at(-1).currentOscillators;
      return oscillators.length === 3 && [261.63 / 16, 311.13, 392].every((frequency, index) =>
        Math.abs(oscillators[index].frequency.value - frequency) < 0.001);
    }, undefined, { timeout: 5000, polling: 50 });
    const actualAudio = await page.evaluate(() => {
      const app = window.__strudelSmokeInstances.at(-1);
      return { state: app.audio.context?.state, playing: app.state.isPlaying,
        frequencies: app.currentOscillators.map(oscillator => oscillator.frequency.value) };
    });
    assert.equal(actualAudio.playing, true); assert.equal(actualAudio.state, 'running');
    assert.equal(actualAudio.frequencies.length, 3);
    for (const [index, expected] of [261.63 / 16, 311.13, 392].entries()) {
      assert.ok(Math.abs(actualAudio.frequencies[index] - expected) < 0.001,
        `real AudioParam must carry note${index + 1} at its expected frequency`);
    }
    await app.locator('#stop-button').click();
    assert.equal(await page.evaluate(() => window.__strudelSmokeInstances.at(-1).state.isPlaying), false);
    await app.locator('#creation-pattern').fill('not-a-note'); await app.locator('#apply-creation').click();
    assert.match(await app.locator('[data-creation-status]').textContent(), /Use 1–64 notes/);
    assert.equal(await page.evaluate(() => window.__strudelSmokeInstances.at(-1).creation.pattern), 'c0 eb4 g4');
    await screenshotAppWindow(page, app, { path: path.join(diagnostics, 'creation-functional.png'), animations: 'disabled' });
    await app.locator('#return-to-songs').click(); assert.equal(await app.locator('[data-local-creation]').count(), 0);
    await app.locator('[data-song-id="my-creation"] button').click();
    await app.locator('[data-song-id="playing-god"] button').click();
    assert.equal(await app.locator('[data-local-creation]').count(), 0);
    // Close while the real tutorial advance is pending; old work must never
    // render into the next mounted window.
    await app.locator('.tip-next').click(); await close(app);
    const reopened = await launch(); await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.__strudelSmokeInstances.at(-1).help.currentStep), 0);
    await reopened.locator('.tip-skip').click();
    assert.equal(await page.evaluate(() => window.__strudelSmokeInstances.at(-1).help.isActive), false);
    await close(reopened);
    assert.deepEqual(pageErrors, []);
    assert.equal(blocked.filter(row => !['GET', 'HEAD', 'OPTIONS'].includes(row.method)).length, 0, 'local controls attempted a backend/provider mutation');
    summary = { passed: true, original_controls: cases, original_control_count: cases.length,
      creation_edit_apply_play_stop_return_verified: true, invalid_edit_preserves_last_valid_melody: true,
      actual_web_audio: actualAudio, late_tutorial_cleanup_verified: true, repeated_mount_verified: true,
      mcp_provider_posts: 0, page_errors: pageErrors, cancelled_backend_confirmations: dialogs,
      matrix_sha256: hash(matrixPath), source_sha256: hash(path.join(root, 'web/js/apps/strudel-grandma.js')),
      gui_acceptance: false, work_complete: false, completion_authority: false };
    await context.close(); context = null;
  } finally {
    if (context) await context.close().catch(() => undefined);
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
  console.log(JSON.stringify({ diagnostics, ...summary })); return { diagnostics, ...summary };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runStrudelControlsSmoke(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

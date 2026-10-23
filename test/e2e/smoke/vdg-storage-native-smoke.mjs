#!/usr/bin/env node
/** Real storage-native UI diagnostics; never changes canonical family evidence. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { waitForRowCalls, closeLaunched } from '../helpers/live-click-session.ts';
const require = createRequire(import.meta.url);
const { loadConnectorArtifacts } = require('../../../scripts/vdg-connector-artifacts.cjs');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = fs.mkdtempSync(path.join(tmpdir(), 'vdg-storage-native-smoke-'));
const port = Number(process.env.SWISSKNIFE_VDG_STORAGE_SMOKE_PORT);
assert.ok(Number.isInteger(port) && port > 1023, 'An owned storage smoke port is required');
Object.assign(process.env, parseEnv(fs.readFileSync(path.join(project, '../data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/backends/client.env'), 'utf8')));
let server, browser, page;
const result = { schema: 'swissknife.vdg-storage-native-smoke.v1', passed: false, results: [], gui_acceptance: false, completion_authority: false, work_complete: false };
try {
  const log = fs.openSync(path.join(output, 'vite.log'), 'a');
  server = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: project, env: process.env, detached: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  const baseURL = `http://127.0.0.1:${port}`, deadline = Date.now() + 60000;
  while (true) {
    if (server.exitCode !== null) throw new Error('Owned Vite exited before readiness');
    try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Owned Vite readiness deadline');
    await pause(200);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const profile of ['http', 'libp2p']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(profile => {
      globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
      globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = profile;
      globalThis.__storageUiEvents = [];
      document.addEventListener('swissknife:gateway-confirmation', event => globalThis.__storageUiEvents.push({ at: performance.now(), ...event.detail }));
      document.addEventListener('click', event => globalThis.__storageUiEvents.push({ at: performance.now(), click: event.target.outerHTML?.slice(0, 400), trusted: event.isTrusted }), true);
    }, profile);
    page = await context.newPage(); page.setDefaultTimeout(12000);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof globalThis.swissknifeDesktop?.launchApp === 'function');
    await page.locator('#loading-screen').waitFor({ state: 'hidden' });
    for (const [appId, selector] of [['image-viewer', '#retrieve-cid-btn'], ['image-viewer', '[data-svd-workflow-action="retrieve-cid-image"]'], ['media-player', '[data-native-tool-id="ipfs_cat"]']]) {
      const record = { profile, app_id: appId, selector, observations: [] }; result.results.push(record);
      const calls = [], pending = [], errors = [];
      const onRequest = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/mcp/tools/call') { const call = request.postDataJSON(); calls.push({ kind: 'tools-call', done: false, call }); } };
      const onResponse = response => { if (response.request().method() === 'POST' && new URL(response.url()).pathname === '/mcp/tools/call') pending.push((async () => {
        const call = response.request().postDataJSON(), body = await response.json();
        calls.find(value => value.call.correlation_id === call.correlation_id).done = true;
        record.observations.push({ method: 'POST', route: '/mcp/tools/call', app_id: call.app_id, binding_id: call.binding_id, owner: call.owner, tool_id: call.tool_id, transport: call.transport, correlation_id: call.correlation_id, policy_outcome: call.input.policy.outcome, dry_run: call.input.policy.dry_run, outcome: body.outcome, receipt_id: body.receipt?.receipt_id, event_dag_cid: body.receipt?.event_dag_refs?.[0] });
      })()); };
      const onError = error => errors.push(error.message);
      page.on('request', onRequest); page.on('response', onResponse); page.on('pageerror', onError);
      await page.evaluate(appId => globalThis.swissknifeDesktop.launchApp(appId), appId);
      const app = page.locator(`.window[data-app-id="${appId}"]`).last(); await app.waitFor({ state: 'visible' });
      await app.evaluate(node => Object.assign(node.style, { width: '720px', height: '540px', left: '20px', top: '60px' }));
      const catalog = await (await page.request.get(`${baseURL}/mcp/tools/bindings?app_id=${appId}`)).json();
      const control = catalog.controls.find(control => control.binding_id === `${appId}.ipfs_kit_py.retrieve_content`);
      const cid = control.safe_payloads?.ipfs_cat?.cid || control.safe_payload?.cid;
      assert.ok(cid, 'No actual owner CID fixture');
      await page.evaluate(() => { globalThis.__storageUiEvents = []; });
      await app.locator(selector).first().click();
      // The CID Enter must stop before the separate owner consent. This was
      // cancelling the following dialog through Enter's browser default.
      await page.locator('[data-gateway-confirm], .iv-governed-confirm, .mp-governed-confirm').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      const firstConfirm = app.locator('[data-gateway-confirm]').first();
      if (await firstConfirm.isVisible().catch(() => false)) await firstConfirm.click();
      const input = page.locator('.iv-governed-confirm-overlay input[aria-label="Artifact CID"], .mp-governed-confirm-overlay input[aria-label="Artifact CID"]').first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill(cid);
        await input.press('Enter');
      }
      const ownerConfirm = app.locator('[data-gateway-confirm]').first();
      await ownerConfirm.waitFor({ state: 'visible' });
      await pause(50);
      assert.equal(await ownerConfirm.isVisible(), true, 'The CID Enter cancelled or authorized the owner dialog');
      assert.equal(calls.length, 0, 'The CID Enter must not dispatch an owner call');
      record.calls_before_confirmation = calls.length;
      assert.deepEqual((await page.evaluate(() => globalThis.__storageUiEvents)).filter(event => ['confirmed', 'cancelled'].includes(event.phase)), [], 'CID submission must leave consent pending');
      record.cid_enter_stops_before_consent = true;
      await page.evaluate(() => {
        document.querySelectorAll('.mp-governed-confirm-overlay, .iv-governed-confirm-overlay, .pc-governed-confirm-overlay').forEach(overlay => {
          if (overlay.querySelector('input[aria-label="Artifact CID"], input[aria-label="Playlist artifact CID"], input[aria-label="Video artifact CID"]')) return;
          overlay.querySelector('.mp-governed-cancel, .iv-governed-cancel, .pc-governed-cancel')?.click();
        });
      });
      await waitForRowCalls(page, calls, 0); await Promise.all(pending);
      record.events = await page.evaluate(() => globalThis.__storageUiEvents);
      record.call_count = calls.length; record.text = (await app.innerText()).slice(-1800); record.pageerrors = errors;
      const proof = loadConnectorArtifacts([{ app_id: appId, selector, observations: record.observations }]);
      record.proof_problems = proof.problems; record.verified = proof.observations.length;
      const actual = record.observations[0];
      assert.equal(actual?.app_id, appId); assert.equal(actual?.owner, 'ipfs_kit_py');
      assert.equal(actual?.binding_id, `${appId}.ipfs_kit_py.retrieve_content`);
      assert.equal(actual?.tool_id, 'ipfs_cat');
      const expectedTransport = control.transports.includes(profile) ? profile : control.transport;
      assert.equal(actual?.transport, expectedTransport, 'The exact declared transport must be respected');
      const phases = record.events.filter(event => event.correlation_id === actual.correlation_id);
      assert.equal(phases.filter(event => event.phase === 'confirmed' && event.trusted === true).length, 1);
      assert.equal(phases.some(event => event.phase === 'cancelled'), false);
      record.declared_transport = expectedTransport;
      await app.screenshot({ path: path.join(output, `${profile}-${result.results.length}.png`) });
      await closeLaunched(page, app);
      page.off('request', onRequest); page.off('response', onResponse); page.off('pageerror', onError);
    }
    await context.close();
  }
  result.passed = result.results.every(record => record.call_count === 1 && record.verified === 1 && record.proof_problems.length === 0 && record.pageerrors.length === 0);
} catch (error) { result.error = error.stack || error.message; }
finally {
  await browser?.close().catch(() => {});
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} await pause(500); try { process.kill(-server.pid, 'SIGKILL'); } catch {} }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ schema: result.schema, passed: result.passed, error: result.error,
  results: result.results.map(({ profile, app_id, selector, call_count, verified, declared_transport,
    cid_enter_stops_before_consent, proof_problems, pageerrors }) => ({ profile, app_id, selector,
    call_count, verified, declared_transport, cid_enter_stops_before_consent, proof_problems, pageerrors })),
  diagnostic_directory: output, gui_acceptance: false, completion_authority: false, work_complete: false }));
process.exitCode = result.passed ? 0 : 1;

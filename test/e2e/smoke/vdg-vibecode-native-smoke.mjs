#!/usr/bin/env node
/** Standalone real-browser smoke; never writes family reports or capture manifests.
 * Load the owned backend client.env, then invoke through run-with-owned-port.mjs:
 * --env-var SWISSKNIFE_VDG_VIBECODE_SMOKE_PORT --preferred 3047 -- node <this file>
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, createWriteStream, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const { cidForBytes } = require('../../../scripts/mcpplusplus-profile-a.cjs');
const { assessOwnerResult } = require('../../../scripts/vdg-connector-artifacts.cjs');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
function verifyResponse(call, body) {
  assert.equal(call.app_id, 'vibecode', 'request did not originate from VibeCode');
  assert.equal(call.transport, 'http', 'native transport selection was not respected');
  assert.equal(body.ok, true, 'real owner returned failure'); assert.equal(body.outcome, 'executed');
  assert.equal(body.correlation_id, call.correlation_id, 'owner correlation changed');
  assert.ok(body.receipt?.receipt_id, 'real mediator receipt missing');
  const proof = assessOwnerResult(body.result, { outcome: body.outcome, tool_id: call.tool_id,
    transport: call.transport, correlation_id: call.correlation_id,
    policy_outcome: call.input.policy.outcome, dry_run: call.input.policy.dry_run });
  assert.equal(proof.verified, true, `real owner/transport evidence rejected: ${proof.reason}`);
}
export async function runVibecodeNativeSmoke() {
  const port = Number(process.env.SWISSKNIFE_VDG_VIBECODE_SMOKE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('An owned SWISSKNIFE_VDG_VIBECODE_SMOKE_PORT is required.');
  const diagnostics = mkdtempSync(path.join(tmpdir(), 'vdg-vibecode-native-smoke-'));
  const viteLog = createWriteStream(path.join(diagnostics, 'vite.log'), { mode: 0o600 });
  const baseURL = `http://127.0.0.1:${port}`;
  let server, browserServer, browser, page, summary;
  try {
    server = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: project, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(viteLog, { end: false }); server.stderr.pipe(viteLog, { end: false });
    let spawnError; server.once('error', error => { spawnError = error; });
    const readyBy = Date.now() + 90000;
    while (true) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Owned Vite exited before readiness; inspect its isolated diagnostic log.');
      try { const response = await fetch(baseURL, { signal: AbortSignal.timeout(2000) }); if (response.ok) break; } catch { /* retry only within the bounded startup window */ }
      if (Date.now() >= readyBy) throw new Error('Owned Vite readiness exceeded 90 seconds.');
      await delay(250);
    }
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, timeout: 30000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    browser = await chromium.connect(browserServer.wsEndpoint());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
      globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = 'http';
      globalThis.__vdgNativeSmokeConfirmations = [];
      document.addEventListener('swissknife:gateway-confirmation', event => {
        const detail = event.detail || {};
        globalThis.__vdgNativeSmokeConfirmations.push({ phase: detail.phase, trusted: detail.trusted,
          binding_id: detail.binding_id, tool_id: detail.tool_id, correlation_id: detail.correlation_id });
      });
    });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    const requests = [];
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/mcp/tools/call') requests.push(request.postDataJSON()); });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => typeof window.desktop?.launchApp === 'function', undefined, { timeout: 30000 });
    await page.locator('.icon[data-app="vibecode"]').click();
    const app = page.locator('.window[data-app-id="vibecode"]');
    await app.locator('#code-editor').waitFor({ state: 'visible' });
    await app.locator('#code-editor').fill('print("VDG native browser smoke; preview only")\n');
    assert.equal(requests.length, 0, 'mount unexpectedly invoked a backend tool');
    await app.locator('#run-btn').click();
    const confirm = app.locator('[data-gateway-confirm]'); await confirm.waitFor({ state: 'visible' });
    assert.equal(await confirm.count(), 1, 'duplicate mounted handlers created multiple confirmations');
    assert.equal(requests.length, 0, 'Run dispatched before the real confirmation click');
    const runResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON()?.tool_id === 'artifacts_put');
    await confirm.click();
    const run = await runResponse; assert.equal(run.status(), 200); const runBody = await run.json();
    await app.locator('#preview-section').getByText('The code was not persisted or executed.', { exact: true }).waitFor();
    assert.equal(requests.length, 1, 'Run must cause exactly one real POST');
    const runCall = requests[0]; assert.equal(runCall.tool_id, 'artifacts_put'); assert.equal(runCall.binding_id, 'vibecode.ipfs_kit_py.persist_artifact');
    verifyResponse(runCall, runBody);
    const bytes = Buffer.from(runCall.input.payload.bytes_base64, 'base64');
    assert.equal(cidForBytes(bytes), runCall.input.payload.cid, 'Run did not bind exact actual editor bytes');
    assert.equal(JSON.parse(bytes).code, 'print("VDG native browser smoke; preview only")\n');
    const runValue = records(runBody.result).find(item => item.dry_run === true && item.persisted === false);
    assert.ok(runValue, 'real owner did not return an artifact preview');
    assert.equal(runValue.mutation_performed, false); assert.equal(runValue.expected_cid, runCall.input.payload.cid);
    const confirmation = await page.evaluate(correlation => globalThis.__vdgNativeSmokeConfirmations.find(event => event.phase === 'confirmed' && event.correlation_id === correlation), runCall.correlation_id);
    assert.equal(confirmation?.trusted, true, 'confirmation did not come from a trusted DOM click');
    assert.equal(confirmation.tool_id, 'artifacts_put');
    await app.locator('#vibecode-workspace-path').fill('/swissknife/vdg/README.md');
    const readResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON()?.tool_id === 'files_ls');
    const readGoverned = await page.evaluate(async () => {
      const response = await fetch('/mcp/tools/bindings?app_id=vibecode');
      if (!response.ok) throw new Error('The real workspace binding catalog is unavailable.');
      const control = (await response.json()).controls.find(item => item.binding_id === 'vibecode.ipfs_kit_py.list_virtual_files');
      if (!control) throw new Error('The actual workspace binding is undeclared.');
      return control.mutates_remote_state === true || control.confirmation_required === true;
    });
    await app.locator('#vibecode-list-files').click();
    if (readGoverned) {
      await confirm.waitFor({ state: 'visible' });
      assert.equal(requests.length, 1, 'workspace read dispatched before its declared confirmation');
      assert.equal(await confirm.count(), 1, 'workspace handler duplicated its confirmation');
      await confirm.click();
    }
    const read = await readResponse; assert.equal(read.status(), 200); const readBody = await read.json();
    await page.waitForFunction(() => document.querySelector('.window[data-app-id="vibecode"] #vibecode-workspace-result')?.textContent.includes('files_ls acknowledged by ipfs_kit_py'));
    assert.equal(requests.length, 2, 'workspace list must add exactly one real POST');
    const readCall = requests[1]; assert.equal(readCall.tool_id, 'files_ls'); assert.equal(readCall.input.payload.path, '/swissknife/vdg');
    verifyResponse(readCall, readBody);
    if (readGoverned) {
      const readConfirmation = await page.evaluate(correlation => globalThis.__vdgNativeSmokeConfirmations.find(event => event.phase === 'confirmed' && event.correlation_id === correlation), readCall.correlation_id);
      assert.equal(readConfirmation?.trusted, true, 'workspace confirmation was not a trusted DOM click');
      assert.equal(readConfirmation.tool_id, 'files_ls');
    }
    const listing = records(readBody.result).find(item => Array.isArray(item.Entries));
    assert.ok(listing, 'real Kubo MFS directory entries missing');
    assert.ok(listing.Entries.some(entry => entry.Name === 'README.md'), 'real seeded workspace README was not listed');
    summary = { schema: 'swissknife.vdg-native-browser-smoke.v1', passed: true, app_id: 'vibecode', transport: 'http',
      actual_native_post_count: requests.length, trusted_confirmation: true, code_cid_verified: true,
      artifact_preview_without_persistence_or_execution: true, real_workspace_read: true,
      workspace_entry_count: listing.Entries.length, gui_acceptance: false, work_complete: false, completion_authority: false };
  } catch (error) {
    if (page) await bounded(page.screenshot({ path: path.join(diagnostics, 'failure.png'), fullPage: true }), 5000, 'failure screenshot exceeded timeout').catch(() => {});
    throw Object.assign(error, { diagnostic_directory: diagnostics });
  } finally {
    if (browser) await bounded(browser.close(), 10000, 'owned browser close exceeded timeout').catch(() => {});
    if (browserServer) await bounded(browserServer.close(), 10000, 'owned browser server close exceeded timeout').catch(() => browserServer.kill());
    await stopServer(server); viteLog.end();
  }
  writeFileSync(path.join(diagnostics, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  return { ...summary, diagnostic_directory: diagnostics, owned_resources_closed: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runVibecodeNativeSmoke().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ passed: false, error: error.message, diagnostic_directory: error.diagnostic_directory || '', gui_acceptance: false })); process.exitCode = 1;
  });
}

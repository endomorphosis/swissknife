#!/usr/bin/env node
/** Real native UI smoke; independent diagnostic evidence, never family GO. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { chromium } from '@playwright/test';
import { unwrapNetworkToolResult } from '../../../web/js/apps/network-native-tools.js';

const require = createRequire(import.meta.url);
const { loadConnectorArtifacts } = require('../../../scripts/vdg-connector-artifacts.cjs');
const { cidForBytes } = require('../../../scripts/mcpplusplus-profile-a.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const clientEnv = path.resolve(root, '../data/agent_supervisor/virtual_desktop_gui_mcp/watchdog/backends/client.env');
const port = Number(process.env.SWISSKNIFE_VDG_P2P_SMOKE_PORT);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535,
  'Launch through run-with-owned-port.mjs --env-var SWISSKNIFE_VDG_P2P_SMOKE_PORT --preferred 3037');
Object.assign(process.env, parseEnv(fs.readFileSync(clientEnv, 'utf8')));
execFileSync(process.execPath, [path.join(root, 'scripts/verify-browser-toolchain.mjs'), '--check-node-executable', process.execPath], { cwd: root, stdio: 'inherit' });
const baseURL = `http://127.0.0.1:${port}`;
const output = path.join(root, 'test-results/vdg-native-smoke', `classic-p2p-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const report = { schema: 'swissknife.vdg-classic-p2p-native-smoke.v1', generated_at: new Date().toISOString(),
  base_url: baseURL, mocks: false, completion_authority: false, passed: false, transports: [] };
let browser;
const serverLines = [];
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--config', 'vite.web.config.ts',
  '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => {
  serverLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (serverLines.length > 50) serverLines.splice(0, serverLines.length - 50);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = Date.now() + 120_000;

async function stopOwnedServer() {
  if (!server.pid) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), sleep(1500)]);
  try { process.kill(-server.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function callObservation(response, call, body) {
  const receipt = body.receipt || {};
  return { method: 'POST', route: '/mcp/tools/call', app_id: call.app_id, binding_id: call.binding_id,
    owner: call.owner, tool_id: call.tool_id, transport: call.transport, correlation_id: call.correlation_id,
    policy_outcome: call.input?.policy?.outcome, dry_run: call.input?.policy?.dry_run,
    status: response.status(), outcome: body.outcome, receipt_id: receipt.receipt_id,
    event_dag_cid: receipt.event_dag_refs?.[0] };
}

async function verifyResponse(response, tool, transport, record) {
  const call = response.request().postDataJSON();
  const body = await response.json();
  const result = unwrapNetworkToolResult(body.result);
  const observation = { ...callObservation(response, call, body), artifact_verified: false };
  record.observations.push(observation);
  assert.equal(response.status(), 200, `${tool}: HTTP ${response.status()}`);
  assert.equal(call.app_id, 'p2p-chat'); assert.equal(call.owner, 'ipfs_kit_py');
  assert.equal(call.tool_id, tool); assert.equal(call.transport, transport);
  const ownerError = body.error?.message || body.error || result?.error?.message || result?.error || result?.message || 'mediator did not return ok';
  assert.equal(body.ok, true, `${tool}: outcome=${body.outcome}; ${ownerError}`);
  assert.equal(body.outcome, 'executed', `${tool}: owner outcome ${body.outcome}`);
  assert.equal(call.input.policy.dry_run, true);
  const verified = loadConnectorArtifacts([{ app_id: 'p2p-chat', binding_id: call.binding_id, owner: call.owner,
    selector: `[data-native-gateway-binding="${call.binding_id}"][data-native-tool-id="${tool}"]`, observations: [observation] }]);
  assert.deepEqual(verified.problems, [], `${tool}: independent receipt/event verification failed`);
  assert.equal(verified.observations.length, 1);
  observation.artifact_verified = true;
  return { call, body, observation, result };
}

async function runTransport(transport) {
  const record = { transport, passed: false, observations: [] };
  report.transports.push(record);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ transport }) => {
    globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    globalThis.__vdgP2PSmokeConfirmations = [];
    document.addEventListener('swissknife:gateway-confirmation', event => {
      globalThis.__vdgP2PSmokeConfirmations.push({ ...event.detail });
    });
  }, { transport });
  const page = await context.newPage();
  const requests = [];
  const pageerrors = [];
  page.on('pageerror', error => pageerrors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/mcp/tools/call') requests.push(request.postDataJSON());
  });
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => typeof globalThis.swissknifeDesktop?.launchApp === 'function', undefined, { timeout: 45_000 });
    await page.evaluate(() => globalThis.swissknifeDesktop.launchApp('p2p-chat'));
    const app = page.locator('.window[data-app-id="p2p-chat"]').last();
    await app.waitFor({ state: 'visible', timeout: 20_000 });
    const catalogResponse = await page.request.get(`${baseURL}/mcp/tools/bindings?app_id=p2p-chat`, { timeout: 120_000 });
    assert.equal(catalogResponse.status(), 200);
    const catalog = await catalogResponse.json();
    const historyBinding = catalog.controls.find(item => item.binding_id === 'p2p-chat.ipfs_kit_py.retrieve_artifact');
    const historyCid = historyBinding?.safe_payloads?.artifacts_get?.cid;
    assert.match(historyCid || '', /^b[a-z2-7]{58}$/, 'actual typed history CID missing from source catalog');
    const publish = app.locator('.network-controls [data-native-tool-id="ipfs_pubsub_publish"]');
    const draft = app.locator('[data-chat-broadcast-message]');
    await draft.fill('');
    await publish.click();
    await page.waitForTimeout(150);
    assert.equal(requests.length, 0, 'empty broadcast must not dispatch');
    await draft.fill(`Review the actual classic P2P ${transport} broadcast draft without delivery.`);
    await publish.click();
    const confirm = app.locator('[data-gateway-confirm="p2p-chat.ipfs_kit_py.exchange_peer_messages"]');
    await confirm.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(requests.length, 0, 'broadcast dispatched before confirmation');
    await app.locator('[data-gateway-cancel="p2p-chat.ipfs_kit_py.exchange_peer_messages"]').click();
    assert.equal(requests.length, 0, 'cancelled broadcast dispatched');
    assert.ok((await draft.inputValue()).includes('without delivery'), 'cancellation lost actual draft');
    await publish.click();
    await confirm.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(requests.length, 0);
    const publishResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON()?.tool_id === 'ipfs_pubsub_publish', { timeout: 120_000 });
    await confirm.click();
    const preview = await verifyResponse(await publishResponse, 'ipfs_pubsub_publish', transport, record);
    assert.equal(preview.call.input.policy.outcome, 'require_confirmation');
    assert.equal(preview.call.input.policy.consent, 'granted');
    assert.equal(preview.result.dry_run, true); assert.equal(preview.result.mutation_performed, false);
    assert.notEqual(preview.result.published, true, 'preview claimed published delivery');
    await page.getByText('Broadcast preview: Validated dry-run preview; no remote change was made.', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    record.preview_ui = 'Broadcast preview: Validated dry-run preview; no remote change was made.';
    const confirmations = await page.evaluate(() => globalThis.__vdgP2PSmokeConfirmations);
    const approved = confirmations.filter(item => item.correlation_id === preview.call.correlation_id);
    assert.equal(approved.some(item => item.phase === 'shown'), true);
    assert.equal(approved.some(item => item.phase === 'confirmed' && item.trusted === true && item.origin === 'native-control'), true);
    record.confirmation = { correlation_id: preview.call.correlation_id, trusted: true, calls_before_confirmation: 0,
      blank_dispatch_count: 0, cancelled_dispatch_count: 0 };
    await app.locator('[data-chat-history-cid]').fill(historyCid);
    const historyResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/mcp/tools/call' && response.request().postDataJSON()?.tool_id === 'artifacts_get', { timeout: 120_000 });
    await app.locator('.network-controls [data-native-tool-id="artifacts_get"]').click();
    const history = await verifyResponse(await historyResponse, 'artifacts_get', transport, record);
    assert.equal(history.call.input.policy.outcome, 'allow');
    assert.equal(history.call.input.payload.cid, historyCid);
    assert.equal(history.result.found, true); assert.equal(history.result.verified, true); assert.equal(history.result.cid, historyCid);
    const bytes = Buffer.from(history.result.bytes_base64, 'base64');
    assert.equal(cidForBytes(bytes), historyCid);
    const artifact = JSON.parse(bytes.toString('utf8'));
    assert.equal(artifact.schema, 'swissknife.p2p-chat.history.v1'); assert.ok(Array.isArray(artifact.conversations));
    const historyMessage = `History loaded from ${historyCid} (${artifact.conversations.length} conversation(s))`;
    await page.getByText(historyMessage, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    record.history_ui = historyMessage;
    record.history = { cid: historyCid, bytes: bytes.length, schema: artifact.schema,
      conversation_count: artifact.conversations.length, payload_cid_verified: true };
    assert.equal(requests.length, 2, 'unexpected additional MCP tool calls');
    assert.deepEqual(pageerrors, []);
    await page.screenshot({ path: path.join(output, `${transport}.png`) });
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    record.pageerrors = pageerrors;
    await page.screenshot({ path: path.join(output, `${transport}-failed.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

try {
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Owned Vite exited ${server.exitCode}`);
    try { const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch { /* own server starting */ }
    await sleep(250);
  }
  assert.equal(ready, true, 'Owned Vite did not become ready');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const transport of ['http', 'libp2p']) await runTransport(transport);
  report.passed = true;
} catch (error) {
  report.error = error.message;
  report.server_tail = serverLines;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopOwnedServer();
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, report: path.join(output, 'report.json'),
    transports: report.transports.map(item => ({ transport: item.transport, passed: item.passed, error: item.error })), error: report.error }));
}

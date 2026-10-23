#!/usr/bin/env node
/** Focused actual desktop diagnostic; never family/GUI completion authority. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const expectedSource = '294342a920e7d33729f2b4afdb3c8c352f1c080fc5897f901e2cd0c9225b579a';
const options = { project: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), candidate: null, guard: null };
const names = { '--project-root': 'project', '--candidate-source': 'candidate', '--guard-module': 'guard' }, seen = new Set();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]; assert.ok(names[token] && !seen.has(token), `Unknown/duplicate ${token}`); seen.add(token);
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `Missing ${token}`);
  options[names[token]] = path.resolve(process.argv[++i]);
}
assert.equal(process.env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT, '1', 'The actual Vite process must receive the explicit snapshot flag');
const project = options.project, canonical = path.join(project, 'web/js/apps/openrouter.js'), source = options.candidate || canonical;
const sourceBytes = fs.readFileSync(source); assert.equal(hash(sourceBytes), expectedSource);
const canonicalBefore = hash(fs.readFileSync(canonical));
const { OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR: descriptor } = await import(pathToFileURL(source).href);
const publicFile = url => path.join(project, 'web/public', url);
const rawBytes = fs.readFileSync(publicFile(descriptor.local_url));
const provenanceBytes = fs.readFileSync(publicFile(descriptor.provenance_url));
assert.equal(hash(rawBytes), descriptor.raw_sha256); assert.equal(hash(provenanceBytes), descriptor.provenance_sha256);
const modelIds = JSON.parse(rawBytes).data.map(model => model.id).sort();
assert.equal(modelIds.length, 468); assert.equal(hash(JSON.stringify(modelIds)), descriptor.model_ids_sha256);
const guard = options.guard ? createRequire(import.meta.url)(options.guard) : null;
const guardContract = guard?.assertLocalCatalogInput({ projectRoot: project, env: process.env });
if (guardContract) assert.deepEqual(guardContract.descriptor, descriptor);
const port = Number(process.env.SWISSKNIFE_VDG_OPENROUTER_CATALOG_SMOKE_PORT);
assert.ok(Number.isInteger(port) && port > 1023 && port < 65536, 'An owned smoke port is required');
const base = `http://127.0.0.1:${port}`;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-openrouter-catalog-snapshot-'));
const { closeLaunched, waitForRowCalls, screenshotAppWindow } = await import(pathToFileURL(path.join(project, 'test/e2e/helpers/live-click-session.ts')).href);
const { collectRenderedControls } = await import(pathToFileURL(path.join(project, 'scripts/rendered-control-rows.mjs')).href);
const report = { schema: 'swissknife.openrouter-catalog-snapshot-smoke.v1', passed: false, work_complete: false,
  gui_acceptance: false, completion_authority: false, candidate_module_override: source !== canonical,
  source_sha256: expectedSource, canonical_source_sha256: canonicalBefore, descriptor, source_hashes: {},
  flag: process.env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT, profiles: [], posts_attempted: [], posts_blocked: [],
  external_catalog_gets: [], other_external_requests: [], page_errors: [], module_responses: [], input_responses: [], network_observer_errors: [],
  guard_coverage: !!guard, guard_source_sha256: options.guard ? hash(fs.readFileSync(options.guard)) : null,
  resources: {}, tracked_processes: [], driver_limitation: 'Focused registered-factory diagnostic. Refresh observation invokes the existing app.loadModels() method because there is no Refresh UI control. Browser clocks are real; the separate unit test proves retention beyond ten minutes. No family acceptance is produced.' };
for (const relative of ['web/js/apps/openrouter.js', 'web/js/main-simple.js', 'test/e2e/helpers/live-click-session.ts', 'scripts/rendered-control-rows.mjs']) report.source_hashes[`swissknife/${relative}`] = hash(fs.readFileSync(relative === 'web/js/apps/openrouter.js' ? source : path.join(project, relative)));
report.source_hashes['swissknife/test/e2e/smoke/vdg-openrouter-catalog-snapshot-smoke.mjs'] = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
if (options.guard) report.source_hashes['guard_module'] = report.guard_source_sha256;
let server, browserServer, browser, activeContext, page, interrupted = false;
const pendingResponses = new Set(), tracked = new Map();
const log = fs.createWriteStream(path.join(output, 'vite.log'), { mode: 0o600 });
const persist = () => fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
function identity(pid) {
  try { const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid: Number(pid), uid: fs.statSync(`/proc/${pid}`).uid, ppid: Number(fields[1]), pgid: Number(fields[2]), sid: Number(fields[3]), start_tick: fields[19] }; } catch { return null; }
}
function sampleOwned() {
  const processes = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(identity).filter(Boolean);
  const owned = new Set([server?.pid, browserServer?.process()?.pid].filter(Boolean));
  let changed = true; while (changed) { changed = false; for (const process of processes) if (owned.has(process.ppid) && !owned.has(process.pid)) { owned.add(process.pid); changed = true; } }
  for (const process of processes) if (owned.has(process.pid)) tracked.set(`${process.pid}:${process.start_tick}`, process);
}
const stillSame = recorded => { const current = identity(recorded.pid); return !!current && current.uid === recorded.uid && current.start_tick === recorded.start_tick; };
const onSignal = () => { interrupted = true; void browser?.close(); };
process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
const ceiling = setTimeout(onSignal, 300000), sampling = setInterval(sampleOwned, 250);
const escaped = value => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
const selector = (id, action) => ['model', 'provider', 'placement', 'action'].map((key, index) => `[data-openrouter-${key}="${escaped([id, id.split('/')[0], 'catalog', action][index])}"]`).join('');
async function state() { return page.evaluate(() => {
  const app = window.openRouterApp, root = app?.getContainer(), d = window.__orCatalogProof;
  return { mode: app?.catalogMode, metadata: app?.catalogMetadata, model_ids: [...app.models.keys()].sort(), model_count: app?.models.size,
    favorite_ids: [...app.favoriteModels].sort(), default_model: app?.settings.defaultModel, current_tab: app?.currentTab,
    stored: Object.fromEntries(['openrouter_settings', 'openrouter_favorites', 'openrouter_conversations', 'openrouter_history'].map(key => [key, localStorage.getItem(key)])),
    api_key_present: !!localStorage.getItem('openrouter_api_key'), events: [...d.events], writes: [...d.writes], dialogs: [...d.dialogs],
    selected_copies: [...(root?.querySelectorAll('[data-openrouter-action="default"]') || [])].filter(button => button.dataset.openrouterModel === app.settings.defaultModel).map(button => ({ model: button.dataset.openrouterModel, placement: button.dataset.openrouterPlacement, text: button.textContent.trim(), pressed: button.getAttribute('aria-pressed'), card_default: button.closest('.model-card')?.classList.contains('default-model') })),
    guard_checked_launches: window.__vdgOpenRouterCatalogGuard?.checked_launches || 0 };
}); }
function verifyInput(s) {
  assert.equal(s.mode, 'snapshot'); assert.equal(s.metadata.mode, 'snapshot'); assert.equal(s.metadata.verified, true);
  for (const [field, expected] of Object.entries({ input_sha256: descriptor.raw_sha256, model_ids_sha256: descriptor.model_ids_sha256, model_count: descriptor.model_count, raw_bytes: descriptor.raw_bytes, original_source: descriptor.source_url, observed_at: descriptor.observed_at, local_url: descriptor.local_url, provenance_url: descriptor.provenance_url, provenance_sha256: descriptor.provenance_sha256 })) assert.equal(s.metadata[field], expected, field);
  assert.equal(s.metadata.cache_ttl_ms, null); assert.deepEqual(s.model_ids, modelIds); assert.equal(s.model_count, 468); assert.equal(s.api_key_present, false);
}
try {
  console.log(JSON.stringify({ output, stage: 'startup', port }));
  let config = path.join(project, 'vite.web.config.ts');
  if (source !== canonical) {
    // Supply exact reviewed source BEFORE Vite's normal environment transform.
    // This covers the actual registered module independent of its fetch path.
    config = path.join(output, 'reviewed-catalog-candidate.config.mjs');
    const contents = [
      `import original from ${JSON.stringify(path.join(project, 'vite.web.config.ts'))};`,
      `import {mergeConfig} from ${JSON.stringify(pathToFileURL(path.join(project, 'node_modules/vite/dist/node/index.js')).href)};`,
      'import {readFileSync,realpathSync} from "node:fs";',
      'import {createHash} from "node:crypto";',
      `const app=${JSON.stringify(canonical)},candidate=${JSON.stringify(source)},expected=${JSON.stringify(expectedSource)};`,
      'export default mergeConfig(original,{plugins:[{name:"reviewed-openrouter-catalog-candidate",enforce:"pre",load(id){const file=id.split("?")[0];if(file!==app&&file!==realpathSync(app))return null;const bytes=readFileSync(candidate);if(createHash("sha256").update(bytes).digest("hex")!==expected)throw Error("Reviewed candidate source changed");console.log("[r23-reviewed-candidate] exact source loaded before Vite transform");return bytes.toString("utf8");}}]});',
    ].join('\n');
    fs.writeFileSync(config, contents, { mode: 0o600 });
    report.candidate_vite_input = { mode: 'vite-pre-load-plugin', frozen_source: source, raw_sha256: hash(sourceBytes), canonical_module: canonical, config_sha256: hash(contents) };
  }
  server = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--config', config, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: project, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  report.resources.vite_pid = server.pid; server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
  const deadline = Date.now() + 60000;
  while (true) { if (interrupted || server.exitCode !== null || server.signalCode !== null) throw Error('Owned Vite stopped before readiness'); try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {} if (Date.now() > deadline) throw Error('Vite readiness timeout60s'); await delay(100); }
  browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, timeout: 30000 }); report.resources.chrome_pid = browserServer.process().pid; sampleOwned();
  browser = await chromium.connect(browserServer.wsEndpoint());
  const targetId = 'minimax/minimax-m3.1-flash', neighborId = 'minimax/minimax-m3';
  assert.ok(modelIds.includes(targetId) && modelIds.includes(neighborId));
  for (const transport of ['http', 'libp2p']) {
    if (interrupted) throw Error('Smoke deadline/interruption');
    const profile = { transport, cases: [], passed: false }; report.profiles.push(profile);
    activeContext = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 900 } });
    await activeContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await activeContext.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { const row = { transport, method: request.method(), url: request.url() }; report.posts_attempted.push(row); report.posts_blocked.push(row); return route.abort('blockedbyclient'); }
      if (url.origin !== base) {
        const row = { transport, method: request.method(), url: request.url(), blocked: true };
        if (url.origin === 'https://openrouter.ai' && url.pathname === '/api/v1/models') report.external_catalog_gets.push(row); else report.other_external_requests.push(row);
        return route.abort('blockedbyclient');
      }
      return route.continue(); // Raw/provenance assets are NEVER intercepted.
    });
    await activeContext.addInitScript(transport => {
      globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport; globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
      const d = window.__orCatalogProof = { events: [], writes: [], dialogs: [] }, original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { const result = Reflect.apply(original, this, [key, value]); if (String(key).startsWith('openrouter_')) d.writes.push({ key: String(key), length: String(value).length }); return result; };
      document.addEventListener('click', event => { const element = event.target.closest?.('[data-openrouter-action],.window-control.close'); if (element) d.events.push({ trusted: event.isTrusted, model: element.dataset.openrouterModel || null, action: element.dataset.openrouterAction || null, placement: element.dataset.openrouterPlacement || null, close: element.classList.contains('close') }); }, true);
    }, transport);
    if (guard) await activeContext.addInitScript(guard.installLocalOpenRouterCatalogGuard, guardContract);
    page = await activeContext.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.page_errors.push({ transport, message: error.message }));
    page.on('dialog', async dialog => { const message = dialog.message(); await dialog.dismiss(); await page.evaluate(message => window.__orCatalogProof.dialogs.push(message), message).catch(() => {}); });
    const observe = pending => {
      const tracked = pending.catch(error => report.network_observer_errors.push({ transport, message: String(error) })).finally(() => pendingResponses.delete(tracked));
      pendingResponses.add(tracked);
    };
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname === '/js/apps/openrouter.js') {
        observe((async () => {
          const body = await response.body();
          const file = `${transport}-actual-vite-module.js`; fs.writeFileSync(path.join(output, file), body);
          const row = { transport, status: response.status(), original_path: url.pathname, transformed_sha256: hash(body), file,
            actual_vite_env_injection: body.includes(Buffer.from('import.meta.env =')),
            actual_vite_snapshot_env: /"VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT"\s*:\s*"1"/.test(body.toString('utf8')),
            from_service_worker: response.fromServiceWorker(), raw_source_sha256: expectedSource,
            candidate_module_override: source !== canonical, source_selection: source !== canonical ? 'vite-pre-load-plugin' : 'canonical' };
          report.module_responses.push(row);
          assert.equal(row.actual_vite_env_injection, true); assert.equal(row.actual_vite_snapshot_env, true);
        })());
      }
      if (url.pathname === descriptor.local_url || url.pathname === descriptor.provenance_url) {
        observe((async () => { const bytes = await response.body(); const file = `${transport}-${url.pathname === descriptor.local_url ? 'actual-catalog' : 'actual-provenance'}.json`; fs.writeFileSync(path.join(output, file), bytes); report.input_responses.push({ transport, path: url.pathname, status: response.status(), sha256: hash(bytes), bytes: bytes.length, file, intercepted: false }); })());
      }
    });
    if (guard) profile.actual_guard_preflight = await guard.preflightLocalCatalogPage(page);
    else { await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function'); }
    const launch = async () => { await page.evaluate(() => window.swissknifeDesktop.launchApp('openrouter')); const appWindow = page.locator('.window[data-app-id="openrouter"]').last(); await appWindow.locator(selector(targetId, 'default')).waitFor({ state: 'visible' }); return appWindow; };
    let appWindow = await launch(); profile.initial = await state(); verifyInput(profile.initial); assert.deepEqual(profile.initial.favorite_ids, []);
    profile.original_controls = await appWindow.evaluate(collectRenderedControls);
    assert.equal(profile.original_controls.length, 1881); assert.equal(new Set(profile.original_controls.map(row => row.selector)).size, 1881);
    profile.nonunique_selectors = await appWindow.evaluate((root, selectors) => selectors.filter(selector => root.querySelectorAll(selector).length !== 1), profile.original_controls.map(row => row.selector)); assert.deepEqual(profile.nonunique_selectors, []);
    const actionSelectors = modelIds.flatMap(id => ['favorite', 'info', 'try', 'default'].map(action => selector(id, action)));
    assert.equal(actionSelectors.length, 1872); profile.missing_model_actions = await appWindow.evaluate((root, selectors) => selectors.filter(selector => root.querySelectorAll(selector).length !== 1), actionSelectors); assert.deepEqual(profile.missing_model_actions, []);
    await closeLaunched(page, appWindow);
    const cases = [['favorite', targetId], ['info', targetId], ['try', targetId], ['default', targetId], ['default', targetId], ['default', neighborId], ['favorite', targetId], ['favorite', targetId], ['default', targetId], ['default', targetId]];
    for (const [index, [action, id]] of cases.entries()) {
      if (interrupted) throw Error('Smoke deadline/interruption'); report.stage = `${transport}:${index}:${action}`; persist();
      if (index !== 3) appWindow = await launch();
      const target = appWindow.locator(selector(id, action)); assert.equal(await target.count(), 1);
      const row = { index, model: id, action, selector: selector(id, action) }; profile.cases.push(row);
      row.before = await state(); verifyInput(row.before);
      row.screenshot_before = `${transport}-${index}-before.png`; await screenshotAppWindow(page, appWindow, { path: path.join(output, row.screenshot_before), timeout: 15000, animations: 'disabled' });
      const started = Date.now(); await target.click({ timeout: 8000 }); row.click_ms = Date.now() - started;
      await waitForRowCalls(page, [], 0, { appearMs: 800, quietMs: 400, timeoutMs: 15000 });
      row.after = await state(); verifyInput(row.after); row.trusted_events = row.after.events.slice(row.before.events.length);
      assert.ok(row.trusted_events.some(event => event.trusted && event.model === id && event.action === action && event.placement === 'catalog'));
      if (action === 'favorite') {
        const added = index !== 6; assert.equal(row.after.favorite_ids.includes(id), added); assert.equal(JSON.parse(row.after.stored.openrouter_favorites).includes(id), added);
      } else if (action === 'info') assert.ok(row.after.dialogs.slice(row.before.dialogs.length).some(message => message.includes(id)));
      else if (action === 'try') { assert.equal(row.after.current_tab, 'playground'); assert.equal(row.after.default_model, id); assert.deepEqual(row.after.stored, row.before.stored, 'Try remains unsaved'); }
      else {
        assert.equal(row.after.default_model, id); assert.equal(JSON.parse(row.after.stored.openrouter_settings).defaultModel, id);
        assert.equal(row.after.selected_copies.length, 1 + Number(row.after.favorite_ids.includes(id)));
        for (const copy of row.after.selected_copies) { assert.equal(copy.text, '✓ Default'); assert.equal(copy.pressed, 'true'); assert.equal(copy.card_default, true); }
        const writes = row.after.writes.slice(row.before.writes.length); for (const key of ['openrouter_settings', 'openrouter_favorites', 'openrouter_conversations', 'openrouter_history']) assert.ok(writes.some(write => write.key === key));
        if (index === 4 || index === 9) assert.deepEqual(row.after.stored, row.before.stored, 'Repeated selection retains actual persisted values');
      }
      row.screenshot_after = `${transport}-${index}-after.png`; await screenshotAppWindow(page, appWindow, { path: path.join(output, row.screenshot_after), timeout: 15000, animations: 'disabled' });
      if (index === 2) { await appWindow.locator('.tab-item[data-tab="models"]').click({ timeout: 8000 }); assert.equal((await state()).current_tab, 'models'); }
      else { await closeLaunched(page, appWindow); assert.equal(await page.locator('.window[data-app-id="openrouter"]').count(), 0); }
      console.log(JSON.stringify({ transport, index, action, model: id, click_ms: row.click_ms })); persist();
    }
    appWindow = await launch(); const beforeRefresh = await state(); verifyInput(beforeRefresh);
    await Promise.all([...pendingResponses]); const requestCount = report.input_responses.filter(row => row.transport === transport).length;
    await page.evaluate(() => window.openRouterApp.loadModels()); const afterRefresh = await state(); verifyInput(afterRefresh);
    await Promise.all([...pendingResponses]); profile.programmatic_refresh = { method: 'existing app.loadModels()', ui_control: false, before: beforeRefresh.metadata, after: afterRefresh.metadata, input_response_count_before: requestCount, input_response_count_after: report.input_responses.filter(row => row.transport === transport).length };
    assert.equal(profile.programmatic_refresh.input_response_count_after, requestCount); assert.equal(afterRefresh.default_model, targetId);
    profile.final_reopen = afterRefresh; await closeLaunched(page, appWindow);
    assert.deepEqual(report.posts_attempted, []); assert.deepEqual(report.external_catalog_gets, []); assert.deepEqual(report.page_errors, []); assert.deepEqual(report.network_observer_errors, []);
    await Promise.all([...pendingResponses]); const inputs = report.input_responses.filter(row => row.transport === transport);
    assert.equal(inputs.length, 2); assert.ok(inputs.every(row => row.status === 200 && row.sha256 === (row.path === descriptor.local_url ? descriptor.raw_sha256 : descriptor.provenance_sha256)));
    profile.passed = true;
    await activeContext.tracing.stop({ path: path.join(output, `${transport}-trace.zip`) }); await activeContext.close(); activeContext = null;
  }
  assert.equal(report.module_responses.length, 2); assert.deepEqual(report.network_observer_errors, []); assert.ok(report.module_responses.every(row => row.status === 200));
  report.passed = true;
} catch (error) { report.error = error.stack || error.message; process.exitCode = 1; if (page) await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 5000 }).catch(() => {}); }
finally {
  clearTimeout(ceiling); clearInterval(sampling); process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal); sampleOwned();
  if (activeContext) await activeContext.tracing.stop({ path: path.join(output, 'failed-trace.zip') }).catch(() => {});
  await browser?.close().catch(() => {}); await browserServer?.kill().catch(() => {});
  if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} if (server.exitCode === null && server.signalCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(5000)]); try { process.kill(-server.pid, 'SIGKILL'); } catch {} }
  await Promise.allSettled([...pendingResponses]);
  const cleanupDeadline = Date.now() + 5000;
  while ([...tracked.values()].some(stillSame) && Date.now() < cleanupDeadline) await delay(100);
  report.tracked_processes = [...tracked.values()].map(recorded => ({ ...recorded, same_identity_alive: stillSame(recorded) }));
  report.owned_resources_closed = report.tracked_processes.length >= 2 && report.tracked_processes.every(row => !row.same_identity_alive);
  for (const rootName of ['vite_pid', 'chrome_pid']) { const pid = report.resources[rootName]; const recorded = [...tracked.values()].find(row => row.pid === pid); report.resources[`${rootName}_absent`] = !!recorded && !stillSame(recorded); }
  report.owned_resources_closed &&= report.resources.vite_pid_absent && report.resources.chrome_pid_absent;
  report.canonical_source_sha256_after = hash(fs.readFileSync(canonical)); report.canonical_source_unchanged = report.canonical_source_sha256_after === canonicalBefore;
  report.candidate_source_unchanged = hash(fs.readFileSync(source)) === expectedSource;
  report.screenshot_sha256 = Object.fromEntries(fs.readdirSync(output).filter(name => name.endsWith('.png')).map(name => [name, hash(fs.readFileSync(path.join(output, name)))]));
  if (!report.owned_resources_closed || !report.canonical_source_unchanged || !report.candidate_source_unchanged) { report.passed = false; process.exitCode = 1; report.cleanup_or_source_failure = true; }

  log.end(); report.finished_at = new Date().toISOString(); persist();
  console.log(JSON.stringify({ output, passed: report.passed, error: report.error, owned_resources_closed: report.owned_resources_closed }));
}

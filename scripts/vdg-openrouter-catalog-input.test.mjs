import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Window } from 'happy-dom';
import { capturePublicInput, archivePublicInput, parseArguments as parseProducer } from './capture-openrouter-catalog-input.mjs';
import { parseArguments as parseWrapper, snapshotEnvironment, verifySourcePins, main as wrapperMain, runOriginal } from './run-with-vdg-openrouter-catalog-input.mjs';
const require = createRequire(import.meta.url);
const guard = require('./vdg-openrouter-catalog-input.cjs');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { FAMILIES } = require('./vdg-evidence.cjs');

function fixtureInput(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-public-input-pure-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = Buffer.from('{"data":[{"id":"vendor/one","name":"Actual UTF8 ✨"},{"id":"other/two"}]}\n');
  const parsed = guard.parseCatalog(raw), raw_sha256 = guard.hash(raw);
  const provenance = { schema: 'swissknife.openrouter-observed-public-input.v1', source_url: guard.SOURCE_URL,
    final_url: guard.SOURCE_URL, requested_at: '2026-10-22T00:00:00.000Z', observed_at: '2026-10-22T00:00:01.000Z',
    http_status: 200, raw_sha256, raw_bytes: raw.length, model_count: parsed.model_count,
    model_ids_sha256: parsed.model_ids_sha256, raw_filename: `${raw_sha256}.json`,
    reconstructed: false, provider_execution: false, gui_acceptance: false, work_complete: false, completion_authority: false };
  const provenanceBytes = Buffer.from(`${JSON.stringify(provenance)}\n`), provenance_sha256 = guard.hash(provenanceBytes);
  const descriptor = { schema: 'swissknife.openrouter-catalog-snapshot.v1', source_url: guard.SOURCE_URL,
    observed_at: provenance.observed_at, raw_sha256, raw_bytes: raw.length, model_count: parsed.model_count,
    model_ids_sha256: parsed.model_ids_sha256, local_url: `/vdg-public-inputs/openrouter/${raw_sha256}.json`,
    provenance_url: `/vdg-public-inputs/openrouter/provenance-${provenance_sha256}.json`, provenance_sha256 };
  for (const [url, bytes] of [[descriptor.local_url, raw], [descriptor.provenance_url, provenanceBytes]]) {
    const file = guard.publicFile(root, url); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
  const options = { projectRoot: root, env: { VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT: '1' }, descriptor };
  return { root, raw, provenance, provenanceBytes, descriptor, parsed, options };
}
function browserFixture(t, { late = false } = {}) {
  const input = fixtureInput(t), contract = guard.assertLocalCatalogInput(input.options);
  const window = new Window({ url: 'http://127.0.0.1/' });
  t.after(() => window.happyDOM.abort());
  const document = window.document;
  window.Element.prototype.getClientRects = function() { return this.isConnected ? [{ width: 720, height: 540 }] : []; };
  const owner = document.createElement('section'); owner.className = 'window'; owner.dataset.appId = 'openrouter';
  const root = document.createElement('div'); root.className = 'openrouter-app'; owner.append(root); document.body.append(owner);
  for (const id of contract.model_ids) for (const action of ['favorite', 'info', 'try', 'default']) {
    const button = document.createElement('button');
    for (const [name, value] of Object.entries({ model: id, provider: id.split('/')[0], placement: 'catalog', action })) button.setAttribute(`data-openrouter-${name}`, value);
    root.append(button);
  }
  const d = input.descriptor;
  const app = { models: new Map(contract.model_ids.map(id => [id, { id }])), catalogMode: 'snapshot', disposed: false, getContainer: () => root,
    catalogMetadata: { mode: 'snapshot', input_sha256: d.raw_sha256, model_ids_sha256: d.model_ids_sha256,
      model_count: d.model_count, original_source: d.source_url, observed_at: d.observed_at, local_url: d.local_url,
      provenance_url: d.provenance_url, provenance_sha256: d.provenance_sha256, raw_bytes: d.raw_bytes, verified: true } };
  window.openRouterApp = app;
  const originalResult = Promise.resolve({ actual: 'original result' });
  let callThis, callArgs;
  const desktop = { launchApp(...args) { callThis = this; callArgs = args; return originalResult; } };
  if (!late) window.swissknifeDesktop = desktop;
  const install = new Function('window', 'document', `${guard.installLocalOpenRouterCatalogGuard.toString()}; return installLocalOpenRouterCatalogGuard;`)(window, document);
  install(contract);
  if (late) window.swissknifeDesktop = desktop;
  return { ...input, contract, window, document, owner, root, app, desktop, install, originalResult,
    getCall: () => ({ callThis, callArgs }) };
}
function inventoryRows(ids) {
  return ids.flatMap(id => ['favorite', 'info', 'try', 'default'].map(action => ({ app_id: 'openrouter', launch_id: 'openrouter',
    selector: `[data-openrouter-model="${id}"][data-openrouter-provider="${id.split('/')[0]}"][data-openrouter-placement="catalog"][data-openrouter-action="${action}"]` })));
}
function writeInventory(root, rows) {
  const base = path.join(root, 'test-results/virtual-desktop-ipfs-mcp-orb');
  for (const relative of ['vdg/inventory/rendered-control-census.json', 'control-tool-matrix.json']) {
    const file = path.join(base, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    const rawCensus = relative.startsWith('vdg/inventory/');
    fs.writeFileSync(file, JSON.stringify({ schema: rawCensus ? 'swissknife.rendered-control-census.v1' : 'swissknife.virtual-desktop-control-tool-matrix.v1',
      collection: rawCensus ? 'live-dom' : 'live-dom-current-contract-join', source_template: false, clicked: false, rows, row_count: rows.length }));
  }
}

test('raw UTF8 bytes, actual provenance and the full unique model ID set verify without acceptance authority', t => {
  const f = fixtureInput(t), result = guard.assertLocalCatalogInput(f.options);
  assert.deepEqual(result.model_ids, ['other/two', 'vendor/one']);
  assert.equal(result.input_sha256, guard.hash(f.raw)); assert.equal(result.completion_authority, false);
});
for (const value of [undefined, '0', 'true', '']) test(`missing or conflicting explicit snapshot flag ${String(value)} fails before capture`, t => {
  const f = fixtureInput(t);
  assert.throws(() => guard.assertLocalCatalogInput({ ...f.options, env: value === undefined ? {} : { VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT: value } }), /explicit.*=1/);
});
test('same model count cannot conceal a replaced ID or tampered raw byte', t => {
  const f = fixtureInput(t); fs.writeFileSync(guard.publicFile(f.root, f.descriptor.local_url), f.raw.toString().replace('vendor/one', 'vendor/new'));
  assert.throws(() => guard.assertLocalCatalogInput(f.options), /raw response bytes differ/);
  const other = guard.parseCatalog(Buffer.from('{"data":[{"id":"vendor/new"},{"id":"other/two"}]}'));
  assert.equal(other.model_count, f.parsed.model_count); assert.notEqual(other.model_ids_sha256, f.descriptor.model_ids_sha256);
});
test('altered provenance bytes and internally contradictory authority claims are rejected', t => {
  const f = fixtureInput(t);
  assert.throws(() => guard.validatePublicInput(f.raw, Buffer.from('{}'), f.descriptor), /provenance bytes differ/);
  for (const change of [{ http_status: 500 }, { final_url: 'https://other.example/models' }, { reconstructed: true }, { gui_acceptance: true }, { observed_at: '2099-01-01T00:00:00Z' }]) {
    const p = { ...f.provenance, ...change }, bytes = Buffer.from(JSON.stringify(p)), sha = guard.hash(bytes);
    const d = { ...f.descriptor, provenance_sha256: sha, provenance_url: `/vdg-public-inputs/openrouter/provenance-${sha}.json` };
    assert.throws(() => guard.validatePublicInput(f.raw, bytes, d), /VDG Local catalog input:/);
  }
});
test('duplicate or unstable model IDs and path traversal cannot be accepted', t => {
  for (const data of [[{ id: 'a/one' }, { id: 'a/one' }], [{ name: 'unnamed ID' }], [{ id: 'a/white space' }], []]) assert.throws(() => guard.parseCatalog(Buffer.from(JSON.stringify({ data }))));
  assert.throws(() => guard.publicFile('/tmp', '/vdg-public-inputs/openrouter/../../secret.json'), /immutable/);
  const f = fixtureInput(t); assert.throws(() => guard.validatePublicInput(f.raw, f.provenanceBytes, { ...f.descriptor, local_url: '/vdg-public-inputs/openrouter/unbound.json' }), /content addressed/);
});
test('both real census and matrix must contain all four actions of the complete declared ID set', t => {
  const f = fixtureInput(t), contract = guard.assertLocalCatalogInput(f.options);
  writeInventory(f.root, inventoryRows(contract.model_ids)); assert.equal(guard.assertCatalogInventory(contract, { projectRoot: f.root }), contract);
  for (const rows of [inventoryRows(['other/two', 'vendor/new']), inventoryRows(contract.model_ids).slice(1), [...inventoryRows(contract.model_ids), inventoryRows(contract.model_ids)[0]]]) {
    writeInventory(f.root, rows); assert.throws(() => guard.assertCatalogInventory(contract, { projectRoot: f.root }), /VDG Local catalog input:/);
  }
});
test('actual valid mounted root passes with original this, arguments and resolved value', async t => {
  const f = browserFixture(t), value = await f.desktop.launchApp('openrouter', { actual: 'options' });
  assert.deepEqual(value, { actual: 'original result' }); assert.equal(f.getCall().callThis, f.desktop);
  assert.deepEqual(f.getCall().callArgs, ['openrouter', { actual: 'options' }]); assert.equal(f.window.__vdgOpenRouterCatalogGuard.checked_launches, 1);
});
test('late desktop publication is guarded and repeated initialization never double-wraps', async t => {
  const f = browserFixture(t, { late: true }), wrapped = f.desktop.launchApp;
  f.install(f.contract); assert.equal(f.desktop.launchApp, wrapped);
  await f.desktop.launchApp('openrouter'); assert.equal(f.window.__vdgOpenRouterCatalogGuard.checked_launches, 1);
});
test('other app and alias return the exact original Promise without changing normal behavior', async t => {
  const f = browserFixture(t);
  assert.equal(f.desktop.launchApp('calculator'), f.originalResult);
  assert.equal(f.desktop.launchApp('unrelated-alias'), f.originalResult);
  assert.equal(f.window.__vdgOpenRouterCatalogGuard.checked_launches, 0);
});
test('actual immutable application mode must agree even when metadata claims a verified snapshot', async t => {
  const f = browserFixture(t); f.app.catalogMode = 'live';
  await assert.rejects(f.desktop.launchApp('openrouter'), /actual mounted application.*snapshot mode/);
});
for (const [field, value] of [['mode', 'live'], ['input_sha256', '0'.repeat(64)], ['observed_at', 'other'], ['provenance_sha256', '0'.repeat(64)], ['verified', false], ['raw_bytes', 1]]) test(`every actual launch rejects mismatched browser ${field}`, async t => {
  const f = browserFixture(t); await f.desktop.launchApp('openrouter');
  f.app.catalogMetadata[field] = value;
  await assert.rejects(f.desktop.launchApp('openrouter'), /VDG Local catalog input:/);
  assert.equal(f.window.__vdgOpenRouterCatalogGuard.checked_launches, 1);
});
test('same-count actual model ID replacement and absent or duplicate catalog actions fail', async t => {
  const f = browserFixture(t); f.app.models.delete('vendor/one'); f.app.models.set('vendor/new', {});
  await assert.rejects(f.desktop.launchApp('openrouter'), /complete model ID set/);
  f.app.models.delete('vendor/new'); f.app.models.set('vendor/one', {});
  const button = f.root.querySelector('button'); button.remove(); await assert.rejects(f.desktop.launchApp('openrouter'), /four actual/);
  f.root.append(button, button.cloneNode()); await assert.rejects(f.desktop.launchApp('openrouter'), /duplicate action/);
});
test('error fallback cannot pass merely because generic controls or a stale app instance exist', async t => {
  const f = browserFixture(t); f.root.remove();
  f.owner.innerHTML = '<div class="app-error">failed mount</div><button data-live-gateway-binding="anything">Generic gateway</button>';
  await assert.rejects(f.desktop.launchApp('openrouter'), /visible actual OpenRouter root/);
});
for (const synchronous of [false, true]) test(`original ${synchronous ? 'synchronous' : 'async'} exact launch-timeout error receives a non-bypassable prefix`, async t => {
  const f = browserFixture(t);
  f.window.swissknifeDesktop = { launchApp() { if (synchronous) throw Error('launch timed out'); return Promise.reject(Error('launch timed out')); } };
  if (synchronous) assert.throws(() => f.window.swissknifeDesktop.launchApp('openrouter'), /^Error: VDG Local catalog input:/);
  else await assert.rejects(f.window.swissknifeDesktop.launchApp('openrouter'), /^Error: VDG Local catalog input:/);
});
test('a hung original launch is bounded and replacement pages install a fresh guard', async t => {
  const f = browserFixture(t), originalTimer = f.window.setTimeout.bind(f.window), deadlines = [];
  f.window.setTimeout = (callback, ms) => { deadlines.push(ms); return originalTimer(callback, 5); };
  f.window.swissknifeDesktop = { launchApp() { return new Promise(() => {}); } };
  await assert.rejects(f.window.swissknifeDesktop.launchApp('openrouter'), /bounded mount check/); assert.deepEqual(deadlines, [6500]);
  const fresh = browserFixture(t, { late: true }); await fresh.desktop.launchApp('openrouter');
  assert.equal(fresh.window.__vdgOpenRouterCatalogGuard.checked_launches, 1);
});

test('producer sends only the reviewed bounded public GET and archives exact response bytes immutably', async t => {
  const f = fixtureInput(t); let request;
  const observation = await capturePublicInput({}, { fetch: async (url, options) => {
    request = { url, options }; const response = new Response(f.raw, { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: guard.SOURCE_URL }); return response;
  } });
  assert.equal(request.url, guard.SOURCE_URL); assert.equal(request.options.method, 'GET'); assert.equal(request.options.redirect, 'error');
  assert.deepEqual(observation.raw, f.raw); assert.equal(observation.provenance.gui_acceptance, false);
  const archive = archivePublicInput(observation, path.join(f.root, 'archive'));
  assert.deepEqual(fs.readFileSync(archive.raw_path), f.raw); archivePublicInput(observation, path.join(f.root, 'archive'));
  assert.throws(() => archivePublicInput({ ...observation, raw: Buffer.from('invented') }, path.join(f.root, 'bad-archive')), /raw response bytes differ/);
  assert.equal(fs.existsSync(path.join(f.root, 'bad-archive')), false);
  fs.writeFileSync(archive.raw_path, 'tampered'); assert.throws(() => archivePublicInput(observation, path.join(f.root, 'archive')));
});
test('hanging public response bodies and rejected source/status/size fail without fabricated fallback', async () => {
  await assert.rejects(capturePublicInput({ timeoutMs: 10 }, { fetch: () => new Promise(() => {}) }), /bounded deadline/);
  for (const [status, url, length] of [[500, guard.SOURCE_URL, null], [200, 'https://other.example/models', null], [200, guard.SOURCE_URL, String(guard.MAX_BYTES + 1)]]) {
    await assert.rejects(capturePublicInput({ timeoutMs: 100 }, { fetch: async () => {
      const response = new Response('{"data":[{"id":"v/a"}]}', { status, headers: { 'content-type': 'application/json', ...(length ? { 'content-length': length } : {}) } });
      Object.defineProperty(response, 'url', { value: url }); return response;
    } }));
  }
  const response = new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(response, 'url', { value: guard.SOURCE_URL });
  await assert.rejects(capturePublicInput({ timeoutMs: 10 }, { fetch: async () => response }), /bounded deadline/);
  assert.throws(() => parseProducer([]), /usage/);
});
test('wrapper accepts exact original commands only and preserves unset environment by setting only child mode', () => {
  const argv = ['node', 'swissknife/scripts/run-vdg-all-families.mjs', '--timeout-seconds', '22200'];
  assert.deepEqual(parseWrapper(['--', ...argv]), argv);
  for (const bad of [argv, ['--', 'node', '-e', 'process.exit(0)'], ['--', ...argv, '--fresh'], ['--', 'sh', '-c', 'anything']]) assert.throws(() => parseWrapper(bad), /exact reviewed/);
  const original = { ACTUAL_UNRELATED: 'kept' }, env = snapshotEnvironment(original);
  assert.deepEqual(original, { ACTUAL_UNRELATED: 'kept' }); assert.equal(env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT, '1'); assert.equal(env.ACTUAL_UNRELATED, 'kept');
  assert.throws(() => snapshotEnvironment({ VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT: '0' }), /conflicting/);
});
test('wrapper source pin check precedes helper import and every underlying invocation including reuse', async () => {
  let guardCalls = 0, children = 0;
  const args = ['--', 'node', 'swissknife/scripts/run-vdg-all-families.mjs', '--check'];
  await assert.rejects(wrapperMain(args, { env: {}, verifySourcePins() { throw Error('actual source mismatch'); }, guard: { assertLocalCatalogInput() { guardCalls++; } }, runOriginal() { children++; } }), /actual source mismatch/);
  assert.equal(guardCalls, 0); assert.equal(children, 0);
  const order = [];
  const result = await wrapperMain(args, { env: {}, verifySourcePins() { order.push('source'); },
    guard: { assertLocalCatalogInput({ env }) { order.push('input'); assert.equal(env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT, '1'); return {}; }, assertCatalogInventory() { order.push('inventory'); } },
    runOriginal(argv, options) { order.push('original'); assert.deepEqual(argv, args.slice(1)); assert.equal(options.env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT, '1'); return 75; } });
  assert.equal(result, 75); assert.deepEqual(order, ['source', 'input', 'inventory', 'original']);
});
test('actual source changes or missing final pins fail before trusting a helper', t => {
  const f = fixtureInput(t), pins = {};
  for (const relative of ['scripts/vdg-openrouter-catalog-input.cjs', 'web/js/apps/openrouter.js']) {
    const file = path.join(f.root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `reviewed ${relative}`); pins[relative] = guard.hash(fs.readFileSync(file));
  }
  verifySourcePins(f.root, pins);
  fs.appendFileSync(path.join(f.root, 'scripts/vdg-openrouter-catalog-input.cjs'), 'changed'); assert.throws(() => verifySourcePins(f.root, pins), /source bytes changed/);
  assert.throws(() => verifySourcePins(f.root, { 'scripts/vdg-openrouter-catalog-input.cjs': null, 'web/js/apps/openrouter.js': null }), /pins are not installed/);
});
for (const exit of [0, 75, 124]) test(`original real process exit ${exit} is preserved without a new deadline`, async () => {
  assert.equal(await runOriginal([process.execPath, '-e', `process.exit(${exit})`], { stdio: 'ignore' }), exit);
});
test('aborting an owned original command cannot turn its graceful zero exit into success', async () => {
  const controller = new AbortController();
  const promise = runOriginal([process.execPath, '-e', 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)'], { stdio: 'ignore', signal: controller.signal, stopGraceMs: 30 });
  setTimeout(() => controller.abort(), 100);
  assert.equal(await promise, 143);
});
test('stopping a leader also cleans its resistant owned process-group child', async t => {
  const f = fixtureInput(t), pidFile = path.join(f.root, 'owned-child.pid'), controller = new AbortController();
  const childCode = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`;
  const code = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`;
  const pending = runOriginal([process.execPath, '-e', code], { signal: controller.signal, stdio: 'ignore', stopGraceMs: 30 });
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(pidFile) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(fs.existsSync(pidFile), true);
  const pid = Number(fs.readFileSync(pidFile, 'utf8')); controller.abort(); assert.equal(await pending, 143);
  let running = true;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); running = !['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]); }
    catch (error) { if (error.code === 'ENOENT') running = false; else throw error; }
    if (!running) break; await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(running, false, 'The exact child created by this test must not remain running');
});
test('generation pins helper and wrapper source, keeps Todo extraction valid, and leaves the five other specs exact', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-snapshot-spec-parity-')); t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  for (const [family, definition] of Object.entries(FAMILIES)) {
    execFileSync(process.execPath, [path.join(project, 'scripts/build-family-mcp-spec.cjs'), family], { cwd: project, env: { ...process.env, VDG_FAMILY_SPEC_DIR: output }, stdio: 'pipe', timeout: 30000 });
    const generated = fs.readFileSync(path.join(output, definition.spec), 'utf8');
    assert.equal(generated, fs.readFileSync(path.join(project, 'test/e2e/families', definition.spec), 'utf8'));
    if (family !== 'vdg-local') assert.equal(generated.includes('OpenRouterCatalogGuard'), false);
    else {
      assert.ok(generated.indexOf('export function installLocalOpenRouterCatalogGuard') < generated.indexOf('export function installLocalTodoCaseIsolation'));
      const pins = JSON.parse(generated.match(/const catalogInputSourcePins = (\{[^\n]+\});/)[1]);
      for (const [filename, expected] of Object.entries(pins)) assert.equal(guard.hash(fs.readFileSync(path.join(project, 'scripts', filename))), expected);
      assert.ok(generated.indexOf('assertCatalogInventory(assertLocalCatalogInput())') < generated.indexOf("await runVdgFamilyCapture(page, 'local')"));
      assert.ok(generated.indexOf('addInitScript(installLocalOpenRouterCatalogGuard, catalogInput)') < generated.indexOf('preflightLocalCatalogPage(page)'));
    }
  }
});

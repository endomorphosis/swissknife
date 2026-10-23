import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { transform } from 'esbuild';
import { Window } from 'happy-dom';

const appUrl = new URL('../../web/js/apps/openrouter.js', import.meta.url);
const appSource = await fs.readFile(appUrl, 'utf8');
const appSha = createHash('sha256').update(appSource).digest('hex');
const rawName = '65a3034c116179fac2ba1511796f0e1a014955986295385dfac8fbc35b7271bc.json';
const raw = new Uint8Array(await fs.readFile(new URL(`../../web/public/vdg-public-inputs/openrouter/${rawName}`, import.meta.url)));
const provenanceBytes = new Uint8Array(await fs.readFile(new URL('../../web/public/vdg-public-inputs/openrouter/provenance-19726a9dac6901f79566e387871e286f32633b415ef28fb5f0912e94aa125e3c.json', import.meta.url)));
const originalProvenance = JSON.parse(new TextDecoder().decode(provenanceBytes));
const catalog = JSON.parse(new TextDecoder().decode(raw)).data;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = data => new TextEncoder().encode(JSON.stringify(data));
let importId = 0;

async function fixture(t, flag = '1') {
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'fetch'].map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage });
  // Apply exactly the Vite import.meta.env substitution to the actual candidate
  // source. No production mode/descriptor override is introduced for tests.
  const compiled = await transform(appSource, { loader: 'js', format: 'esm', sourcefile: fileURLToPath(appUrl), define: { 'import.meta.env': JSON.stringify(flag === null ? {} : { VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT: flag }) } });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vdg-catalog-unit-'));
  const compiledPath = path.join(temporary, `snapshot-${++importId}.mjs`);
  await fs.writeFile(compiledPath, compiled.code);
  const module = await import(pathToFileURL(compiledPath).href);
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  t.mock.method(console, 'error', () => {});
  t.after(() => { window.openRouterApp?.dispose?.(); window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  return { ...module, window };
}
function bytesResponse(url, bytes, options = {}) {
  return { ok: true, status: 200, url: new URL(url, 'http://localhost/').href, arrayBuffer: async () => bytes.slice().buffer, ...options };
}
function serveInput(t, descriptor, overrides = {}) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.ok(url === descriptor.local_url || url === descriptor.provenance_url, 'snapshot must never request a live catalog/provider endpoint');
    const bytes = url === descriptor.local_url ? raw : provenanceBytes;
    return overrides.respond ? overrides.respond(url, options, bytes) : bytesResponse(url, bytes);
  };
  return requests;
}
function repin(descriptor, { data, provenance = originalProvenance, descriptorChanges = {} } = {}) {
  const changedRaw = data === undefined ? raw : encode(data);
  const d = { ...descriptor, raw_sha256: sha(changedRaw), raw_bytes: changedRaw.length, ...descriptorChanges };
  d.local_url = `/vdg-public-inputs/openrouter/${d.raw_sha256}.json`;
  const p = { ...provenance, raw_sha256: d.raw_sha256, raw_bytes: d.raw_bytes, raw_filename: `${d.raw_sha256}.json` };
  const changedProvenance = encode(p);
  d.provenance_sha256 = sha(changedProvenance);
  d.provenance_url = `/vdg-public-inputs/openrouter/provenance-${d.provenance_sha256}.json`;
  return { descriptor: d, raw: changedRaw, provenance: changedProvenance };
}
async function rejectsInput(module, changes, pattern) {
  const input = repin(module.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, changes);
  await assert.rejects(module.verifyOpenRouterCatalogSnapshot(input.raw, input.provenance, input.descriptor), pattern);
}

test('the source descriptor binds the exact genuine 468-model response and immutable provenance', async t => {
  const m = await fixture(t); const d = m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR;
  assert.equal(sha(raw), d.raw_sha256); assert.equal(raw.length, d.raw_bytes);
  assert.equal(sha(provenanceBytes), d.provenance_sha256); assert.equal(d.model_count, 468);
  assert.equal(sha(encode(catalog.map(model => model.id).sort())), d.model_ids_sha256);
  assert.equal(d.observed_at, originalProvenance.observed_at); assert.equal(Object.isFrozen(d), true);
  assert.deepEqual(await m.verifyOpenRouterCatalogSnapshot(raw, provenanceBytes), catalog);
  assert.match(appSha, /^[a-f0-9]{64}$/);
});

test('actual snapshot-mode initialization publishes every original model field and honest retrieval metadata', async t => {
  const m = await fixture(t); const requests = serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR);
  const app = new m.OpenRouterApp(); await app.initialize();
  assert.equal(app.catalogMode, 'snapshot'); assert.equal(app.models.size, 468);
  assert.equal(app.catalogMetadata.mode, 'snapshot'); assert.equal(app.catalogMetadata.verified, true);
  assert.equal(app.catalogMetadata.input_sha256, sha(raw)); assert.equal(app.catalogMetadata.observed_at, originalProvenance.observed_at);
  assert.equal(app.catalogMetadata.original_source, originalProvenance.source_url);
  assert.equal(app.catalogMetadata.model_ids_sha256, originalProvenance.model_ids_sha256);
  assert.equal(app.catalogMetadata.provenance_sha256, sha(provenanceBytes)); assert.equal(app.catalogMetadata.cache_ttl_ms, null);
  for (const model of catalog) for (const [key, value] of Object.entries(model)) assert.deepEqual(app.models.get(model.id)[key], value, `full original field retained: ${key}`);
  assert.equal(requests.length, 2); for (const request of requests) assert.equal(request.options.redirect, 'error');
  assert.match(app.catalogStatusText(), /Verified OpenRouter catalog snapshot/);
  assert.match(app.catalogStatusText(), /2026-10-22T17:51:25.969769\+00:00/);
});

test('snapshot cache coalesces, survives TTL/Refresh/reopen and isolates mutable consumer data', async t => {
  const m = await fixture(t); const requests = serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR);
  let clock = Date.now(); t.mock.method(Date, 'now', () => clock);
  const first = new m.OpenRouterApp(); const a = first.loadModels();
  const second = new m.OpenRouterApp(); await Promise.all([a, second.loadModels()]);
  assert.equal(first.disposed, true); assert.equal(first.models.size, 0); assert.equal(second.models.size, 468);
  assert.equal(second.catalogMetadata.cache, 'coalesced'); assert.equal(requests.length, 2);
  second.models.get(catalog[0].id).pricing.prompt = 'consumer-specific';
  const originalAge = second.catalogMetadata.cache_age_ms; clock += 24 * 3600 * 1000;
  globalThis.fetch = () => { throw new Error('late network outage must not change the declared input'); };
  await second.loadModels(); const reopened = new m.OpenRouterApp(); await reopened.loadModels();
  assert.equal(reopened.models.get(catalog[0].id).pricing.prompt, catalog[0].pricing.prompt);
  assert.equal(reopened.catalogMetadata.input_sha256, sha(raw)); assert.equal(reopened.catalogMetadata.cache_age_ms - originalAge, 86400000);
  assert.match(reopened.catalogStatusText(), new RegExp(`age ${reopened.catalogMetadata.cache_age_ms} ms`));
  assert.throws(() => { reopened.catalogMode = 'live'; }, TypeError);
});

test('ordinary missing/nonexact Vite flags still use the unchanged real live catalog path', async t => {
  for (const flag of [null, '', 'true', '0']) {
    const m = await fixture(t, flag); let calls = 0;
    globalThis.fetch = async url => { calls++; assert.equal(url, 'https://openrouter.ai/api/v1/models'); return { ok: true, json: async () => ({ data: [{ id: 'live-provider/real-model', name: 'Live model' }] }) }; };
    const app = new m.OpenRouterApp(); await app.loadModels();
    assert.equal(app.catalogMode, 'live'); assert.equal(app.catalogMetadata.mode, 'live'); assert.equal(app.models.size, 1); assert.equal(calls, 1);
  }
});

test('a previously populated live module cache cannot satisfy a failed snapshot-mode input', async t => {
  const live = await fixture(t, '0'); globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 'live-provider/prior' }] }) });
  const prior = new live.OpenRouterApp(); await prior.loadModels(); assert.equal(prior.models.size, 1);
  const m = await fixture(t); const requests = serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, { respond: url => bytesResponse(url, raw, { ok: false, status: 503 }) });
  const app = new m.OpenRouterApp(); await assert.rejects(app.initialize(), /request failed/);
  assert.equal(app.models.size, 0); assert.equal(app.providers.size, 0); assert.equal(app.catalogMetadata.verified, false);
  assert.equal(app.catalogMetadata.mode, 'snapshot'); assert.equal(requests.length, 2);
  assert.match(app.catalogStatusText(), /snapshot unavailable/);
});

test('changed raw bytes are rejected before JSON parsing and cannot publish any model', async t => {
  const m = await fixture(t); const corrupted = raw.slice(); corrupted[0] = 33;
  serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, { respond: (url, _options, bytes) => bytesResponse(url, url.endsWith(rawName) ? corrupted : bytes) });
  const app = new m.OpenRouterApp(); await assert.rejects(app.loadModels(), /SHA-256 mismatch/);
  assert.equal(app.models.size, 0); assert.equal(app.catalogMetadata.verified, false);
});

test('wrong provenance bytes reject even an otherwise exact raw response', async t => {
  const m = await fixture(t); const bad = provenanceBytes.slice(); bad[0] = 33;
  serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, { respond: (url, _options, bytes) => bytesResponse(url, url.includes('provenance-') ? bad : bytes) });
  const app = new m.OpenRouterApp(); await assert.rejects(app.loadModels(), /SHA-256 mismatch/); assert.equal(app.models.size, 0);
});

test('raw byte length and redirected/wrong-origin local responses fail closed', async t => {
  const m = await fixture(t);
  await assert.rejects(m.verifyOpenRouterCatalogSnapshot(raw.subarray(1), provenanceBytes), /byte length/);
  serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, { respond: (url, _options, bytes) => bytesResponse(url, bytes, { url: 'https://other.invalid/same-bytes.json' }) });
  const app = new m.OpenRouterApp(); await assert.rejects(app.loadModels(), /failed or redirected/); assert.equal(app.models.size, 0);
});

test('snapshot body timeout aborts the owned request and late completion cannot populate its cache', async t => {
  const m = await fixture(t); let release; let signal;
  serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, { respond: (url, options, bytes) => {
    signal = options.signal;
    return bytesResponse(url, bytes, url.endsWith(rawName) ? { arrayBuffer: () => new Promise(resolve => { release = () => resolve(bytes.slice().buffer); }) } : {});
  } });
  const app = new m.OpenRouterApp({ requestTimeoutMs: 20 }); await assert.rejects(app.initialize(), /verification timed out/);
  assert.equal(signal.aborted, true); assert.equal(app.models.size, 0); release(); await new Promise(resolve => setTimeout(resolve, 30));
  let newRequests = 0;
  globalThis.fetch = async () => { newRequests++; throw new Error('actual next request still unavailable'); };
  const next = new m.OpenRouterApp(); await assert.rejects(next.loadModels(), /still unavailable/);
  assert.equal(newRequests, 2); assert.equal(next.models.size, 0); assert.equal(next.catalogMetadata.verified, false);
});

test('snapshot request stall is bounded and remains a genuine initialization failure', async t => {
  const m = await fixture(t); let signal;
  globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(() => {}); };
  const app = new m.OpenRouterApp({ requestTimeoutMs: 20 }); const started = Date.now();
  await assert.rejects(app.initialize(), /verification timed out/); assert.ok(Date.now() - started < 1000);
  assert.equal(signal.aborted, true); assert.equal(app.models.size, 0);
});

test('digest verification itself is within the request deadline and requires actual SHA-256 support', async t => {
  const m = await fixture(t); serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR);
  t.mock.method(globalThis.crypto.subtle, 'digest', () => new Promise(() => {}));
  const app = new m.OpenRouterApp({ requestTimeoutMs: 20 }); await assert.rejects(app.loadModels(), /verification timed out/);
  assert.equal(app.models.size, 0); assert.equal(app.catalogMetadata.verified, false);
});

test('source descriptor validation rejects wrong schema/source/hash/path/count before input is accepted', async t => {
  const m = await fixture(t); const original = m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR;
  for (const change of [{ schema: 'unreviewed' }, { source_url: 'https://wrong.invalid/models' }, { local_url: 'https://openrouter.ai/api/v1/models' }, { raw_sha256: 'bad' }, { model_ids_sha256: 'bad' }, { raw_bytes: 0 }, { model_count: 0 }, { observed_at: 'not-a-date' }]) {
    await assert.rejects(m.verifyOpenRouterCatalogSnapshot(raw, provenanceBytes, { ...original, ...change }), /descriptor is invalid/);
  }
});

test('a validly hashed provenance cannot claim another source/status/time/raw response or completion authority', async t => {
  const m = await fixture(t);
  for (const change of [{ source_url: 'https://wrong.invalid/models' }, { final_url: 'https://wrong.invalid/models' }, { http_status: 503 }, { observed_at: '2025-01-01T00:00:00Z' }, { requested_at: '2030-01-01T00:00:00Z' }, { model_ids_sha256: '0'.repeat(64) }, { model_count: 467 }, { reconstructed: true }, { gui_acceptance: true }, { completion_authority: true }]) {
    await rejectsInput(m, { provenance: { ...originalProvenance, ...change } }, /provenance does not match/);
  }
});

test('a same-count changed model set is rejected even if its new raw bytes are correctly hashed', async t => {
  const m = await fixture(t); const changed = structuredClone(catalog); changed[0].id = 'different-provider/replacement';
  await rejectsInput(m, { data: { data: changed } }, /exact model ID set/);
});

test('missing/duplicate IDs and wrong model schemas/counts cannot silently drop obligations', async t => {
  const m = await fixture(t);
  for (const change of [list => { delete list[0].id; }, list => { list[0].id = 'provider/'; }, list => { list[0] = null; }, list => { list.pop(); }]) {
    const changed = structuredClone(catalog); change(changed); await rejectsInput(m, { data: { data: changed } }, /schema\/count/);
  }
  const duplicate = structuredClone(catalog); duplicate[0].id = duplicate[1].id;
  await rejectsInput(m, { data: { data: duplicate } }, /exact model ID set/);
  await rejectsInput(m, { data: { data: {} } }, /schema\/count/);
});

test('a closed/stale instance cannot publish a late valid bound catalog into its successor', async t => {
  const m = await fixture(t); let release;
  serveInput(t, m.OPENROUTER_CATALOG_SNAPSHOT_DESCRIPTOR, { respond: (url, _options, bytes) => bytesResponse(url, bytes, url.endsWith(rawName) ? { arrayBuffer: () => new Promise(resolve => { release = () => resolve(bytes.slice().buffer); }) } : {}) });
  const old = new m.OpenRouterApp(); const pending = old.loadModels();
  const current = new m.OpenRouterApp(); const currentPending = current.loadModels();
  while (!release) await new Promise(resolve => setTimeout(resolve, 1)); release(); await Promise.all([pending, currentPending]);
  assert.equal(old.disposed, true); assert.equal(old.models.size, 0); assert.equal(old.catalogMetadata, null);
  assert.equal(current.models.size, 468); assert.equal(current.catalogMetadata.verified, true);
});

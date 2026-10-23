'use strict';
/** Verify a recorded public input. This never grants GUI acceptance. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE_URL = 'https://openrouter.ai/api/v1/models';
const MAX_BYTES = 16 * 1024 * 1024;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const EXPECTED_CATALOG_DESCRIPTOR = Object.freeze({
  schema: 'swissknife.openrouter-catalog-snapshot.v1',
  source_url: SOURCE_URL,
  observed_at: '2026-10-22T17:51:25.969769+00:00',
  raw_sha256: '65a3034c116179fac2ba1511796f0e1a014955986295385dfac8fbc35b7271bc',
  raw_bytes: 787610,
  model_count: 468,
  model_ids_sha256: '819a351f4633f638d5d26192f8a57162e8a6ab498aac04e35cd064c3d4947c41',
  local_url: '/vdg-public-inputs/openrouter/65a3034c116179fac2ba1511796f0e1a014955986295385dfac8fbc35b7271bc.json',
  provenance_url: '/vdg-public-inputs/openrouter/provenance-19726a9dac6901f79566e387871e286f32633b415ef28fb5f0912e94aa125e3c.json',
  provenance_sha256: '19726a9dac6901f79566e387871e286f32633b415ef28fb5f0912e94aa125e3c',
});
function requireCondition(value, reason) {
  if (!value) throw new Error(`VDG Local catalog input: ${reason}`);
}
function parseCatalog(bytes) {
  requireCondition(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES, 'raw response size is invalid');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  requireCondition(value && !Array.isArray(value) && Array.isArray(value.data) && value.data.length > 0, 'response needs a nonempty complete data array');
  const ids = value.data.map(model => model?.id);
  requireCondition(ids.every(id => typeof id === 'string' && /^[\x21-\x7e]+$/.test(id)), 'every model needs a stable nonempty public ID');
  requireCondition(new Set(ids).size === ids.length, 'duplicate model IDs are ambiguous');
  return { value, model_ids: [...ids].sort(), model_count: ids.length,
    model_ids_sha256: hash(Buffer.from(JSON.stringify([...ids].sort()))) };
}
function publicFile(projectRoot, url) {
  requireCondition(typeof url === 'string' && /^\/vdg-public-inputs\/openrouter\/[a-z0-9-]+\.json$/.test(url), 'snapshot URL must name an immutable same-origin public file');
  const root = path.resolve(projectRoot, 'web/public');
  const file = path.resolve(root, `.${url}`);
  requireCondition(file.startsWith(`${root}${path.sep}`), 'public input escapes the web root');
  return file;
}
function validatePublicInput(raw, provenanceBytes, descriptor, now = Date.now()) {
  requireCondition(descriptor?.schema === 'swissknife.openrouter-catalog-snapshot.v1'
    && descriptor.source_url === SOURCE_URL, 'unreviewed snapshot descriptor or upstream URL');
  requireCondition(/^[a-f0-9]{64}$/.test(descriptor.raw_sha256 || '')
    && /^[a-f0-9]{64}$/.test(descriptor.provenance_sha256 || ''), 'descriptor hashes are invalid');
  requireCondition(descriptor.local_url === `/vdg-public-inputs/openrouter/${descriptor.raw_sha256}.json`
    && descriptor.provenance_url === `/vdg-public-inputs/openrouter/provenance-${descriptor.provenance_sha256}.json`, 'snapshot and provenance URLs must be content addressed');
  requireCondition(hash(raw) === descriptor.raw_sha256 && raw.length === descriptor.raw_bytes, 'raw response bytes differ from the source-bound descriptor');
  requireCondition(hash(provenanceBytes) === descriptor.provenance_sha256, 'public provenance bytes differ from the source-bound descriptor');
  const provenance = JSON.parse(provenanceBytes.toString('utf8'));
  requireCondition(provenance?.schema === 'swissknife.openrouter-observed-public-input.v1'
    && provenance.source_url === SOURCE_URL && provenance.final_url === SOURCE_URL
    && provenance.http_status === 200, 'provenance is not an actual successful response from the reviewed source');
  for (const field of ['raw_sha256', 'raw_bytes', 'model_count', 'model_ids_sha256', 'observed_at']) {
    requireCondition(provenance[field] === descriptor[field], `provenance ${field} contradicts the descriptor`);
  }
  requireCondition(provenance.raw_filename === `${descriptor.raw_sha256}.json`, 'raw filename is not content addressed');
  const observed = Date.parse(provenance.observed_at), requested = Date.parse(provenance.requested_at);
  requireCondition(Number.isFinite(observed) && Number.isFinite(requested) && requested <= observed
    && observed <= now + 300000, 'provenance observation time is invalid');
  for (const field of ['reconstructed', 'provider_execution', 'gui_acceptance', 'work_complete', 'completion_authority']) {
    requireCondition(provenance[field] === false, `provenance ${field} must remain false`);
  }
  const catalog = parseCatalog(raw);
  requireCondition(catalog.model_count === descriptor.model_count
    && catalog.model_ids_sha256 === descriptor.model_ids_sha256, 'complete model ID set differs from the descriptor');
  return { descriptor: { ...descriptor }, model_ids: catalog.model_ids, model_count: catalog.model_count,
    input_sha256: descriptor.raw_sha256, verified: true, completion_authority: false };
}
function assertLocalCatalogInput(options = {}) {
  const env = options.env || process.env;
  requireCondition(env.VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT === '1', 'explicit VITE_VDG_OPENROUTER_CATALOG_SNAPSHOT=1 is required');
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const descriptor = options.descriptor || EXPECTED_CATALOG_DESCRIPTOR;
  const raw = fs.readFileSync(publicFile(projectRoot, descriptor.local_url));
  const provenance = fs.readFileSync(publicFile(projectRoot, descriptor.provenance_url));
  return validatePublicInput(raw, provenance, descriptor, options.now);
}
function assertCatalogInventory(contract, options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const evidenceRoot = options.evidenceRoot || path.join(projectRoot, 'test-results/virtual-desktop-ipfs-mcp-orb');
  for (const relative of ['vdg/inventory/rendered-control-census.json', 'control-tool-matrix.json']) {
    const value = JSON.parse(fs.readFileSync(path.join(evidenceRoot, relative), 'utf8'));
    const rawCensus = relative.startsWith('vdg/inventory/');
    requireCondition(value.schema === (rawCensus ? 'swissknife.rendered-control-census.v1' : 'swissknife.virtual-desktop-control-tool-matrix.v1')
      && value.collection === (rawCensus ? 'live-dom' : 'live-dom-current-contract-join')
      && value.source_template === false && value.clicked === false
      && Array.isArray(value.rows) && value.row_count === value.rows.length, `${relative} has invalid live census rows`);
    const controls = value.rows.filter(row => row.app_id === 'openrouter' && row.selector.includes('[data-openrouter-placement="catalog"]'));
    const seen = new Set();
    for (const row of controls) {
      const match = row.selector.match(/^\[data-openrouter-model="([^"\\]+)"\]\[data-openrouter-provider="([^"\\]+)"\]\[data-openrouter-placement="catalog"\]\[data-openrouter-action="(favorite|info|try|default)"\]$/);
      requireCondition(match && match[2] === match[1].split('/')[0], `${relative} has an ambiguous catalog control`);
      const key = JSON.stringify([match[1], match[3]]);
      requireCondition(!seen.has(key), `${relative} duplicates a catalog control`); seen.add(key);
    }
    requireCondition(seen.size === contract.model_ids.length * 4, `${relative} catalog control count differs from the declared snapshot`);
    for (const id of contract.model_ids) for (const action of ['favorite', 'info', 'try', 'default']) {
      requireCondition(seen.has(JSON.stringify([id, action])), `${relative} omits declared model ${id}/${action}`);
    }
  }
  return contract;
}
/** Self-contained context init script: every launch and replacement page is guarded. */
function installLocalOpenRouterCatalogGuard(config) {
  const fail = reason => new Error(`VDG Local catalog input: ${reason}`);
  const previous = window.__vdgOpenRouterCatalogGuard;
  if (previous) {
    if (JSON.stringify(previous.descriptor) !== JSON.stringify(config.descriptor)
      || JSON.stringify(previous.model_ids) !== JSON.stringify(config.model_ids)) throw fail('different catalog guards cannot share one page');
    return;
  }
  const state = { descriptor: config.descriptor, model_ids: config.model_ids, checked_launches: 0 };
  window.__vdgOpenRouterCatalogGuard = state;
  const expected = config.descriptor;
  const check = () => {
    const app = window.openRouterApp;
    const windows = [...document.querySelectorAll('.window[data-app-id="openrouter"]')].filter(node => node.getClientRects().length > 0);
    const owner = windows.length === 1 ? windows[0] : null;
    const roots = owner ? [...owner.querySelectorAll('.openrouter-app')] : [];
    if (!owner || roots.length !== 1 || roots[0].getClientRects().length === 0
      || owner.querySelector('.app-error, .app-placeholder, .window-loading')) throw fail('visible actual OpenRouter root required without an error fallback');
    if (!app || app.disposed || app.getContainer?.() !== roots[0]) throw fail('mounted OpenRouter instance is not the owning window');
    if (app.catalogMode !== 'snapshot') throw fail('actual mounted application is not in the explicit snapshot mode');
    const metadata = app.catalogMetadata;
    const fields = { mode: 'snapshot', input_sha256: expected.raw_sha256, model_ids_sha256: expected.model_ids_sha256,
      model_count: expected.model_count, original_source: expected.source_url, observed_at: expected.observed_at,
      local_url: expected.local_url, provenance_url: expected.provenance_url,
      provenance_sha256: expected.provenance_sha256, raw_bytes: expected.raw_bytes, verified: true };
    if (!metadata || Object.entries(fields).some(([key, value]) => metadata[key] !== value)
      || metadata.error || metadata.stale === true) throw fail('actual browser mode, hash, provenance, or verification differs from the declared input');
    const ids = app.models instanceof Map ? [...app.models.keys()].sort() : [];
    if (JSON.stringify(ids) !== JSON.stringify(config.model_ids)) throw fail('actual complete model ID set differs from the declared input');
    const controls = [...roots[0].querySelectorAll('[data-openrouter-placement="catalog"][data-openrouter-action]')];
    const declared = new Set(ids);
    const seen = new Set();
    for (const control of controls) {
      const id = control.getAttribute('data-openrouter-model'), action = control.getAttribute('data-openrouter-action');
      const key = JSON.stringify([id, action]);
      if (!declared.has(id) || !['favorite', 'info', 'try', 'default'].includes(action)
        || control.getAttribute('data-openrouter-provider') !== id.split('/')[0] || seen.has(key)) throw fail('rendered catalog contains an undeclared or duplicate action');
      seen.add(key);
    }
    if (seen.size !== ids.length * 4) throw fail('every declared model requires all four actual catalog actions');
    state.checked_launches += 1;
  };
  const wrapped = new WeakMap();
  const wrap = desktop => {
    if (!desktop || typeof desktop.launchApp !== 'function' || wrapped.get(desktop) === desktop.launchApp) return;
    const original = desktop.launchApp;
    const guarded = function(...args) {
      if (args[0] !== 'openrouter') return Reflect.apply(original, this, args);
      let timer;
      const timeout = new Promise((_, reject) => { timer = window.setTimeout(() => reject(fail('actual OpenRouter launch exceeded its bounded mount check')), 6500); });
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (error) { window.clearTimeout(timer); throw fail(`actual OpenRouter launch rejected: ${error?.message || error}`); }
      return Promise.race([Promise.resolve(result), timeout]).then(value => { check(); return value; })
        .catch(error => { throw String(error?.message || '').startsWith('VDG Local catalog input:') ? error : fail(`actual OpenRouter launch rejected: ${error?.message || error}`); })
        .finally(() => window.clearTimeout(timer));
    };
    wrapped.set(desktop, guarded); desktop.launchApp = guarded;
  };
  let current = window.swissknifeDesktop;
  Object.defineProperty(window, 'swissknifeDesktop', { configurable: true, enumerable: true,
    get: () => current, set: value => { current = value; wrap(value); } });
  wrap(current);
}
async function preflightLocalCatalogPage(page) {
  const posts = [], errors = [];
  const onRequest = request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); };
  const onError = error => errors.push(String(error));
  page.on('request', onRequest); page.on('pageerror', onError);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function', null, { timeout: 15000 });
    await page.evaluate(() => window.swissknifeDesktop.launchApp('openrouter'));
    const checked = await page.evaluate(() => window.__vdgOpenRouterCatalogGuard?.checked_launches || 0);
    requireCondition(checked === 1, 'the actual browser preflight did not check its first OpenRouter mount');
    await page.locator('.window[data-app-id="openrouter"] .window-control.close').click({ timeout: 3000 });
    await page.locator('.window[data-app-id="openrouter"]').waitFor({ state: 'detached', timeout: 3000 });
    requireCondition(posts.length === 0 && errors.length === 0, 'browser preflight produced a POST or page error');
    return { schema: 'swissknife.openrouter-input-preflight.v1', checked_launches: checked, provider_execution: false,
      gui_acceptance: false, work_complete: false, completion_authority: false };
  } finally { page.off('request', onRequest); page.off('pageerror', onError); }
}
module.exports = { SOURCE_URL, MAX_BYTES, EXPECTED_CATALOG_DESCRIPTOR, hash, parseCatalog, publicFile,
  validatePublicInput, assertLocalCatalogInput, assertCatalogInventory, installLocalOpenRouterCatalogGuard, preflightLocalCatalogPage };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    requireCondition(args.length === 1 && ['--check', '--check-input'].includes(args[0]), 'usage: node scripts/vdg-openrouter-catalog-input.cjs --check|--check-input');
    const contract = assertLocalCatalogInput();
    if (args[0] === '--check') assertCatalogInventory(contract);
    console.log(JSON.stringify({ verified: true, input_sha256: contract.input_sha256, model_count: contract.model_count,
      gui_acceptance: false, work_complete: false, completion_authority: false }));
  } catch (error) { console.error(error.message); process.exitCode = 75; }
}

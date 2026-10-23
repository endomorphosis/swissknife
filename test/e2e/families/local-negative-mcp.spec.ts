import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { runVdgFamilyCapture } from '../helpers/vdg-family-capture';

export function installLocalOpenRouterCatalogGuard(config) {
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

export function installLocalTodoCaseIsolation() {
  if (window.__vdgLocalTodoCaseIsolation) return;
  const keys = ['swissknife-todos', 'swissknife-goals'];
  const baseline = keys.map(key => [key, localStorage.getItem(key)]);
  const state = { restored_cases: 0 };
  window.__vdgLocalTodoCaseIsolation = state;
  const restore = () => {
    for (const [key, value] of baseline) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    state.restored_cases += 1;
  };
  const containsTodoWindow = node => node.nodeType === 1
    && (node.matches('.window[data-app-id="todo"]') || node.querySelector('.window[data-app-id="todo"]'));
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.removedNodes].some(node => !node.isConnected && containsTodoWindow(node)))) restore();
  });
  observer.observe(document, { childList: true, subtree: true });
  // A timed-out row may replace its page instead of removing one app window.
  window.addEventListener('pagehide', restore);
}

const require = createRequire(import.meta.url);
const { writeFamilyEvidence } = require('../../../scripts/vdg-evidence.cjs');
const catalogInputGuardPath = require.resolve('../../../scripts/vdg-openrouter-catalog-input.cjs');
const catalogInputSourcePins = {"vdg-openrouter-catalog-input.cjs":"320201344c87a2a17e575d83e67cde129e8d10b457453b1e87c60e7887f5b2ea","run-with-vdg-openrouter-catalog-input.mjs":"4865da3831aa75f523e33cee3ecad46490430505f0aad209798e664d59c0c4bb"};
for (const [filename, expected] of Object.entries(catalogInputSourcePins)) {
  const actual = require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(require.resolve('../../../scripts/' + filename))).digest('hex');
  if (actual !== expected) throw new Error('VDG Local catalog input: source differs from the executable Local contract: ' + filename);
}
const { assertLocalCatalogInput, assertCatalogInventory, preflightLocalCatalogPage } = require(catalogInputGuardPath);

test('vdg-local proves originating calls, connector receipts and governed negatives', async ({ page }) => {
  test.setTimeout(21_600_000);
  // Replay verifies existing real evidence; the default captures real clicks.
  if (process.env.VDG_EVIDENCE_REPLAY !== '1') {
    const catalogInput = assertCatalogInventory(assertLocalCatalogInput());
    await page.context().addInitScript(installLocalOpenRouterCatalogGuard, catalogInput);
    await page.context().addInitScript(installLocalTodoCaseIsolation);
    await preflightLocalCatalogPage(page);
    await runVdgFamilyCapture(page, 'local');
  }
  const evidence = writeFamilyEvidence('vdg-local');
  expect(evidence.reasons, JSON.stringify(evidence.gap_counts)).toEqual([]);
  expect(evidence.decision).toBe('GO');
  expect(evidence.passed).toBe(true);
});

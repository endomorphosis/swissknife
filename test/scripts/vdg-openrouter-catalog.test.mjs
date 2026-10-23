import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

let importId = 0;
async function fixture(t) {
  const keys = ['window', 'document', 'localStorage', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage });
  const { OpenRouterApp } = await import(`../../web/js/apps/openrouter.js?catalog-test=${++importId}`);
  t.after(() => { window.openRouterApp?.dispose?.(); window.happyDOM.abort(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  return OpenRouterApp;
}
const models = Array.from({ length: 625 }, (_, i) => ({ id: `actual-provider/model-${i}`, name: `Actual model ${i}`, context_length: 4096 + i, pricing: { prompt: '0.001', completion: '0.002' } }));
const response = data => ({ ok: true, json: async () => ({ data }) });

test('OpenRouter initialization bounds a never-resolving public request without inventing models', async t => {
  const App = await fixture(t); let signal; let requests = 0;
  globalThis.fetch = (_url, options) => { requests++; signal = options.signal; return new Promise(() => {}); };
  const app = new App({ requestTimeoutMs: 20 });
  app.setupEventListeners = () => {}; // Authentication polling is outside the catalog lifecycle under test.
  const started = Date.now(); await app.initialize();
  assert.ok(Date.now() - started < 1000); assert.equal(signal.aborted, true); assert.equal(requests, 1);
  assert.equal(app.models.size, 0); assert.equal(app.providers.size, 0);
  assert.equal(app.catalogMetadata.observed_at, null); assert.equal(app.catalogMetadata.cache_age_ms, null);
  assert.match(app.catalogMetadata.error, /timed out/); assert.match(app.renderModelsTab(), /No live catalog observation is available/);
});
test('OpenRouter bounds JSON body consumption and exposes the real failure', async t => {
  const App = await fixture(t); let signal;
  globalThis.fetch = async (_url, options) => { signal = options.signal; return { ok: true, json: () => new Promise(() => {}) }; };
  const app = new App({ requestTimeoutMs: 20 }); await app.loadModels();
  assert.equal(signal.aborted, true); assert.match(app.catalogMetadata.error, /response body timed out/);
  assert.equal(app.models.size, 0); assert.match(app.catalogStatusText(), /unavailable/);
});
test('concurrent windows coalesce fetch and JSON then reuse all real models for the session', async t => {
  const App = await fixture(t); let requests = 0; let reads = 0; let releaseBody;
  globalThis.fetch = async url => {
    requests++; assert.equal(url, 'https://openrouter.ai/api/v1/models');
    return { ok: true, json: () => { reads++; return new Promise(resolve => { releaseBody = resolve; }); } };
  };
  const first = new App(); const firstPending = first.loadModels();
  const second = new App(); const pending = [firstPending, second.loadModels()];
  while (!releaseBody) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(requests, 1); assert.equal(reads, 1); releaseBody({ data: models }); await Promise.all(pending);
  assert.equal(first.models.size, 0); assert.equal(first.disposed, true); assert.equal(second.models.size, 625);
  assert.equal(second.catalogMetadata.cache, 'coalesced');
  second.models.get(models[0].id).pricing.prompt = 'consumer-specific';
  const reopened = new App(); await reopened.loadModels();
  assert.equal(requests, 1); assert.equal(reopened.models.size, 625); assert.equal(reopened.catalogMetadata.cache, 'session');
  assert.equal(reopened.models.get(models[0].id).pricing.prompt, '0.001');
  assert.equal(reopened.catalogMetadata.cache_ttl_ms, 600000);
  assert.ok(reopened.catalogMetadata.cache_age_ms >= 0);
  const html = reopened.renderModelsTab();
  for (const model of models) assert.ok(html.includes(`data-model-id="${model.id}"`));
});
test('the full real catalog refreshes only after ten minutes and replaces removed models', async t => {
  const App = await fixture(t); let clock = Date.now(); t.mock.method(Date, 'now', () => clock); let requests = 0;
  globalThis.fetch = async () => response(++requests === 1 ? models : [{ id: 'real-provider/current', name: 'Current' }]);
  const app = new App(); await app.loadModels(); clock += 599999;
  const beforeExpiry = new App(); await beforeExpiry.loadModels(); assert.equal(requests, 1); assert.equal(beforeExpiry.models.size, 625);
  clock += 1; await beforeExpiry.loadModels(); assert.equal(requests, 2);
  assert.equal(beforeExpiry.models.size, 1); assert.equal(beforeExpiry.models.has('real-provider/current'), true);
  assert.equal(beforeExpiry.models.has(models[0].id), false); assert.equal(beforeExpiry.catalogMetadata.error, null);
});
test('an actual HTTP failure is cached briefly with visible metadata rather than creating a request storm', async t => {
  const App = await fixture(t); let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok: false, status: 503 }; };
  const first = new App(); await first.loadModels(); const reopened = new App(); await reopened.loadModels();
  assert.equal(requests, 1); assert.equal(reopened.catalogMetadata.cache, 'session');
  assert.match(reopened.catalogMetadata.error, /503/); assert.equal(reopened.models.size, 0);
  assert.equal(reopened.catalogMetadata.stale, false); assert.ok(reopened.catalogMetadata.retry_at);
});
test('a failed refresh retains only the previously observed real catalog with an explicit stale error', async t => {
  const App = await fixture(t); let clock = Date.now(); t.mock.method(Date, 'now', () => clock); let requests = 0;
  globalThis.fetch = async () => { if (++requests === 1) return response(models); throw new Error('Actual provider connection failed'); };
  const first = new App(); await first.loadModels(); const observation = first.catalogMetadata.observed_at;
  clock += 600001; const refreshed = new App(); await refreshed.loadModels();
  assert.equal(requests, 2); assert.equal(refreshed.models.size, 625);
  assert.equal(refreshed.catalogMetadata.observed_at, observation); assert.equal(refreshed.catalogMetadata.stale, true);
  assert.match(refreshed.catalogStatusText(), /Retaining the actual catalog observed/);
  assert.match(refreshed.catalogStatusText(), /Actual provider connection failed/);
  const reopened = new App(); await reopened.loadModels(); assert.equal(requests, 2); assert.equal(reopened.models.size, 625);
});
test('invalid public response data cannot become fabricated model cards', async t => {
  const App = await fixture(t); globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { made_up: true } }) });
  const app = new App(); await app.loadModels(); assert.equal(app.models.size, 0);
  assert.match(app.catalogMetadata.error, /invalid model catalog/); assert.equal(app.catalogMetadata.observed_at, null);
});

function observeLifecycle(t) {
  const intervals = new Map(); const handlers = new Set(); let nextId = 0; let added = 0; let removed = 0;
  const add = document.addEventListener.bind(document); const remove = document.removeEventListener.bind(document);
  t.mock.method(document, 'addEventListener', (type, handler, options) => {
    if (type === 'click') { handlers.add(handler); added++; } return add(type, handler, options);
  });
  t.mock.method(document, 'removeEventListener', (type, handler, options) => {
    if (type === 'click' && handlers.delete(handler)) removed++; return remove(type, handler, options);
  });
  t.mock.method(globalThis, 'setInterval', (callback, ms) => { const id = ++nextId; intervals.set(id, { callback, ms }); return id; });
  t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
  return { intervals, handlers, get added() { return added; }, get removed() { return removed; } };
}
function mount(app) {
  const host = document.createElement('section'); host.innerHTML = app.render(); document.body.append(host);
  app.setupEventListeners(); return host;
}

test('the actual initialize plus post-render setup lifecycle owns one timer and one scoped document listener', async t => {
  const App = await fixture(t); const lifecycle = observeLifecycle(t);
  globalThis.fetch = async () => response(models);
  const app = new App(); await app.initialize(); const host = mount(app); app.setupEventListeners();
  assert.equal(lifecycle.intervals.size, 1); assert.equal(lifecycle.handlers.size, 1); assert.equal(lifecycle.added, 1);
  const timer = [...lifecycle.intervals.values()][0]; assert.equal(timer.ms, 30000);
  let saves = 0; app.saveSettings = () => { saves++; }; timer.callback(); assert.equal(saves, 1);
  const unrelated = document.createElement('div'); unrelated.className = 'tab-item'; unrelated.dataset.tab = 'analytics'; document.body.append(unrelated);
  unrelated.click(); assert.equal(app.currentTab, 'models');
  host.querySelector('[data-tab="chat"]').click(); assert.equal(app.currentTab, 'chat');
  assert.equal(host.querySelectorAll('.openrouter-app').length, 1); assert.equal(lifecycle.intervals.size, 1);
});

test('reopening disposes the old instance immediately and stale methods cannot change the current UI', async t => {
  const App = await fixture(t); const lifecycle = observeLifecycle(t); let requests = 0;
  globalThis.fetch = async () => { requests++; return response(models); };
  const oldApp = new App(); await oldApp.initialize(); const oldHost = mount(oldApp);
  const current = new App();
  assert.equal(oldApp.disposed, true); assert.equal(oldApp.models.size, 0); assert.equal(oldApp.providers.size, 0);
  assert.equal(lifecycle.intervals.size, 0); assert.equal(lifecycle.handlers.size, 0); assert.equal(lifecycle.removed, 1);
  await current.initialize(); const currentHost = mount(current); const before = currentHost.innerHTML;
  oldApp.render = () => '<div>stale instance must not render</div>';
  oldApp.updateDisplay(); oldApp.setupEventListeners(); await oldApp.loadModels();
  assert.equal(currentHost.innerHTML, before); assert.equal(oldHost.textContent.includes('stale instance'), false);
  assert.equal(oldApp.models.size, 0); assert.equal(current.models.size, 625); assert.equal(requests, 1);
  assert.equal(lifecycle.intervals.size, 1); assert.equal(lifecycle.handlers.size, 1); assert.equal(lifecycle.added, 2);
  currentHost.querySelector('[data-tab="providers"]').click(); assert.equal(current.currentTab, 'providers');
  assert.equal(oldApp.currentTab, 'models');
});

test('a closed current container cleans its interval, document handler and model maps on the next bounded tick', async t => {
  const App = await fixture(t); const lifecycle = observeLifecycle(t);
  globalThis.fetch = async () => response(models);
  const app = new App(); await app.initialize(); const host = mount(app);
  const timer = [...lifecycle.intervals.values()][0]; let saves = 0; app.saveSettings = () => { saves++; };
  host.remove(); timer.callback();
  assert.equal(app.disposed, true); assert.equal(lifecycle.intervals.size, 0); assert.equal(lifecycle.handlers.size, 0);
  assert.equal(app.models.size, 0); assert.equal(app.providers.size, 0); assert.equal(window.openRouterApp, undefined); assert.equal(saves, 0);
  app.dispose(); timer.callback(); assert.equal(lifecycle.removed, 1); assert.equal(saves, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
let nextImport = 0;
async function fixture(t) {
  const keys = ['window', 'document', 'localStorage', 'fetch'];
  const prior = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  let requests = 0;
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage,
    fetch: () => { requests++; throw new Error('Dialog must not request a provider'); } });
  const { OpenRouterApp } = await import(`../../web/js/apps/openrouter.js?modal-test=${++nextImport}`);
  const { CronApp } = await import(`../../web/js/apps/cron.js?modal-test=${++nextImport}`);
  const cronInstances = [];
  class OwnedCronApp extends CronApp { constructor(...args) { super(...args); cronInstances.push(this); } }
  t.after(() => { for (const app of cronInstances) app.onDestroy(); window.openRouterApp?.dispose(); window.happyDOM.abort(); for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  const mount = (id, app) => {
    const host = document.createElement('section'); host.className = 'window'; host.dataset.appId = id;
    host.innerHTML = '<header><button class="window-control close">Close</button></header><div class="window-content"></div>';
    const content = host.querySelector('.window-content'); content.innerHTML = app.render(); document.body.append(host);
    host.querySelector('button').onclick = () => host.remove(); return { host, content };
  };
  return { OpenRouterApp, CronApp: OwnedCronApp, mount, requests: () => requests };
}

test('OpenRouter authentication is owned below the titlebar and Escape closes only its dialog', async t => {
  const f = await fixture(t), app = new f.OpenRouterApp(), { host, content } = f.mount('openrouter', app);
  const foreign = document.createElement('div'); foreign.className = 'or-modal'; document.body.append(foreign);
  app.showAuthentication(); const modal = content.querySelector('.or-modal');
  assert.ok(modal); assert.equal(modal.parentElement, content); assert.equal(modal.style.position, 'absolute');
  assert.equal(content.style.position, 'relative'); assert.equal(host.querySelector('header').contains(modal), false);
  assert.equal(modal.getAttribute('aria-modal'), 'true');
  modal.querySelector('input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(content.querySelector('.or-modal'), null); assert.equal(foreign.isConnected, true); assert.equal(f.requests(), 0);
});

test('OpenRouter dialog replacement and disposal preserve the complete model set and foreign dialogs', async t => {
  const f = await fixture(t), app = new f.OpenRouterApp(), { content } = f.mount('openrouter', app);
  for (let i = 0; i < 625; i++) app.models.set(`observed/model-${i}`, { id: `observed/model-${i}` });
  const foreign = document.createElement('div'); foreign.className = 'or-modal'; document.body.append(foreign);
  app.showAuthentication(); app.showAuthentication(); assert.equal(content.querySelectorAll('.or-modal').length, 1);
  assert.equal(app.models.size, 625); app.closeModal(); assert.equal(app.models.size, 625);
  app.showAuthentication(); app.dispose(); assert.equal(content.querySelector('.or-modal'), null);
  assert.equal(foreign.isConnected, true); assert.equal(f.requests(), 0);
});

test('OpenRouter window detach removes its blocking surface and stale instance cannot open a replacement modal', async t => {
  const f = await fixture(t), old = new f.OpenRouterApp(), mounted = f.mount('openrouter', old);
  old.showAuthentication(); mounted.host.querySelector('.close').click(); assert.equal(document.querySelector('.or-modal'), null);
  const current = new f.OpenRouterApp(); const next = f.mount('openrouter', current); old.showAuthentication();
  assert.equal(next.content.querySelector('.or-modal'), null); current.showAuthentication(); assert.equal(next.content.querySelectorAll('.or-modal').length, 1);
  assert.equal(f.requests(), 0);
});

test('Cron settings and output dialogs belong to their exact app instance and keep real text content', async t => {
  const f = await fixture(t), app = new f.CronApp({}), { content } = f.mount('cron', app);
  app.scheduledTasks.set('user-defined', { id: 'user-defined' }); app.showSettings();
  const dialog = content.querySelector('[data-cron-dialog]'); assert.ok(dialog);
  assert.equal(dialog.parentElement, content); assert.equal(dialog.style.position, 'absolute');
  assert.match(dialog.textContent, /1 defined/); app.showTextDialog('Task output', '<actual output>');
  assert.equal(content.querySelectorAll('[data-cron-dialog]').length, 1); assert.equal(content.querySelector('pre').textContent, '<actual output>');
  assert.equal(content.querySelector('actual'), null); assert.equal(f.requests(), 0);
});

test('Cron Escape, explicit close and destroy remove its dialog without affecting another window', async t => {
  const f = await fixture(t), app = new f.CronApp({}), { content } = f.mount('cron', app);
  const foreign = document.createElement('div'); foreign.dataset.cronDialog = 'foreign'; document.body.append(foreign);
  app.showSettings(); content.querySelector('[data-cron-dialog] button').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(content.querySelector('[data-cron-dialog]'), null); assert.equal(foreign.isConnected, true);
  app.showSettings(); content.querySelector('[data-cron-dialog] button').click(); assert.equal(content.querySelector('[data-cron-dialog]'), null);
  app.showSettings(); app.onDestroy(); assert.equal(content.querySelector('[data-cron-dialog]'), null); assert.equal(foreign.isConnected, true);
});

test('Cron detached old handlers cannot append a modal into a new instance', async t => {
  const f = await fixture(t), old = new f.CronApp({}), first = f.mount('cron', old);
  old.showSettings(); first.host.remove(); assert.equal(document.querySelector('[data-cron-dialog]'), null);
  const current = new f.CronApp({}), second = f.mount('cron', current);
  old.showSettings(); assert.equal(second.content.querySelector('[data-cron-dialog]'), null);
  current.showSettings(); assert.equal(second.content.querySelectorAll('[data-cron-dialog]').length, 1); assert.equal(f.requests(), 0);
});

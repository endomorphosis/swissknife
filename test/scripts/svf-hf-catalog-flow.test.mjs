import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';

// Authored DOM fixtures check scroll ownership, never browser acceptance.
const appSource = process.env.SVF_HF_LAYOUT_SOURCE || new URL('../../web/js/apps/huggingface.js', import.meta.url).href;
const initial = new Window({ url: 'http://authored.invalid' });
Object.assign(globalThis, { window: initial, localStorage: initial.localStorage });
const { HuggingFaceApp } = await import(appSource);
delete globalThis.window; delete globalThis.localStorage; await initial.happyDOM.abort();
const root = process.env.SVF_HF_LAYOUT_CHECKOUT || new URL('../../', import.meta.url);

for (const width of [1440, 390]) test(`HF ${width}px catalog card cannot shrink beneath fixed status siblings`, async t => {
  const window = new Window({ url: 'http://authored.invalid', width, height: 844,
    settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
  const names = ['window', 'document', 'localStorage', 'fetch', 'requestAnimationFrame'];
  const before = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, requestAnimationFrame: window.requestAnimationFrame.bind(window),
    fetch: async () => { throw new Error('UNIT_FORBIDS_NETWORK'); } });
  t.after(async () => { await window.happyDOM.abort(); for (const name of names) {
    const prior = before.get(name); if (prior) Object.defineProperty(globalThis, name, prior); else delete globalThis[name];
  } });
  const web = new URL('web/', root);
  const index = fs.readFileSync(new URL('index.html', web), 'utf8');
  for (const match of index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)) {
    const style = document.createElement('style'); style.textContent = fs.readFileSync(new URL(match[1].replace(/^\//, ''), web), 'utf8'); document.head.append(style);
  }
  const observedAt = '2026-10-27T06:03:09.606Z', snapshot = '607a30d783dfa663caf39e06633721c8d4cfcd7e';
  localStorage.setItem('huggingface-native-catalog', JSON.stringify({ rows: [{ id: 'gpt2', snapshot, task: 'text-generation' }], observedAt }));
  localStorage.setItem('huggingface_hub_state', JSON.stringify({ selection: { id: 'gpt2', sha: snapshot, kind: 'model' } }));
  const app = new HuggingFaceApp(), shell = document.createElement('section'); shell.className = 'window'; shell.dataset.appId = 'huggingface';
  shell.innerHTML = '<div class="window-content"><div class="window-app-content"><div id="unit-content"></div><div class="live-tool-gateway-host"></div></div></div>';
  document.body.append(shell); shell.querySelector('#unit-content').innerHTML = app.render();
  const content = shell.querySelector('.hf-content'), tab = shell.querySelector('.models-tab'), grid = shell.querySelector('#models-grid');
  assert.equal(window.getComputedStyle(content).overflowY, 'auto', 'the existing outer content owns scrolling');
  for (const node of [tab, grid]) {
    const style = window.getComputedStyle(node);
    assert.equal(style.flexGrow, '0'); assert.equal(style.flexShrink, '0'); assert.equal(style.overflow, 'visible');
  }
  assert.equal(window.getComputedStyle(grid).gridAutoRows, 'max-content');
  assert.equal(window.getComputedStyle(tab.querySelector('.tab-header')).flexDirection, 'column');
  const card = grid.querySelector('[data-model-id="gpt2"]'); assert.ok(card);
  assert.match(card.textContent, /gpt2/); assert.ok(card.querySelectorAll('button').length >= 2);
  for (const id of ['hf-catalog-status', 'hf-selection-status', 'hf-selected-item']) {
    const status = tab.querySelector('#' + id); assert.ok(status); assert.equal(status.parentElement, tab);
    assert.equal(window.getComputedStyle(status).position, ''); assert.equal(window.getComputedStyle(status).flexShrink, '0');
  }
  assert.match(tab.querySelector('#hf-catalog-status').textContent, /Current provider availability is unconfirmed/);
  assert.match(tab.querySelector('#hf-selection-status').textContent, /No model weights have been prepared/);
  assert.equal(tab.querySelector('#hf-selected-item').textContent, 'gpt2 @ ' + snapshot);
  assert.ok(tab.querySelector('#models-search')); assert.ok(tab.querySelector('#models-filter-task'));
  assert.ok(tab.querySelector('#models-filter-library')); assert.ok(tab.querySelector('#models-retry'));
});

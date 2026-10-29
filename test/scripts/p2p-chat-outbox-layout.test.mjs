// Authored DOM and injected geometry only; no real browser/owner qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
const { P2PChatApp } = await import(process.env.SVF_P2P_CHAT_CANDIDATE
  ? pathToFileURL(process.env.SVF_P2P_CHAT_CANDIDATE).href
  : new URL('../../web/js/apps/p2p-chat.js', import.meta.url).href);
let serial = 0;
async function fixture(t, width = 1440) {
  const names = ['window', 'document', 'localStorage', 'CustomEvent', 'getComputedStyle', 'fetch'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const window = new Window({ url: 'http://localhost', width, height: width === 390 ? 844 : 900 });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage,
    CustomEvent: window.CustomEvent, getComputedStyle: window.getComputedStyle.bind(window),
    fetch: async () => { throw Error('AUTHORED_LAYOUT_TEST_FORBIDS_NETWORK'); } });
  for (const match of fs.readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8').matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)) {
    const style = document.createElement('style');
    style.textContent = fs.readFileSync(new URL('../../web' + match[1], import.meta.url), 'utf8');
    document.head.append(style);
  }
  const mount = async () => {
    const shell = document.createElement('section'); shell.className = 'window';
    shell.innerHTML = '<div class="window-content"><div class="window-app-content"><div class="unit-app-mount"></div><div class="live-tool-gateway-host" style="min-height:2.5rem;max-height:42%;flex:0 1 auto;overflow:auto"><details><summary>Backends · K: live · D: unavailable · A: unavailable</summary></details></div></div></div>';
    document.body.append(shell);
    const app = new P2PChatApp({}); app.instanceId += '-unit-' + (++serial);
    const notices = []; app.showNotification = (message, type) => notices.push({ message, type });
    const content = shell.querySelector('.unit-app-mount'); content.innerHTML = await app.render();
    const root = app.getNativeContainer(), frame = shell.querySelector('.window-content');
    Object.defineProperty(frame, 'clientHeight', { value: width === 390 ? 740 : 566, configurable: true });
    Object.defineProperty(shell.querySelector('.live-tool-gateway-host'), 'offsetHeight', { value: width === 390 ? 54 : 35, configurable: true });
    return { app, root, shell, frame, notices, primary: shell.querySelector('.window-app-content'), gateway: shell.querySelector('.live-tool-gateway-host') };
  };
  const f = await mount();
  t.after(async () => {
    await window.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  return { ...f, window, mount };
}
function state(f) {
  const outbox = f.root.querySelector('[data-chat-outbox]'); assert.ok(outbox, 'actual outbox component exists');
  return { outbox, queue: JSON.parse(outbox.getAttribute('data-chat-outbox-state')).queue };
}
async function queue(f, text = 'svf-p2p-classic-offline') {
  f.app.lastPublishedKey = '/swissknife/chat/g047\nprevious delivered note';
  f.root.querySelector('[data-chat-broadcast-message]').value = text;
  await f.app.broadcastMessage();
}

for (const width of [1440, 390]) {
  test(`actual global CSS ${width}: composer actions use owned scroll and the wrapped footer cannot flex-shrink`, async t => {
    const f = await fixture(t, width); f.app.containNativeFrame();
    const style = element => f.window.getComputedStyle(element);
    assert.equal(style(f.frame).paddingBottom, '0px');
    assert.equal(f.primary.style.height, `${width === 390 ? 740 : 566}px`, 'generic 56px bottom reservation must not be counted twice');
    assert.equal(style(f.gateway).flexShrink, '0'); assert.equal(style(f.gateway).minHeight, '0px');
    assert.equal(style(f.gateway).overflow, 'auto'); assert.equal(style(f.gateway).maxHeight, '42%');
    const main = f.root.querySelector('.chat-main'), panel = f.root.querySelector('.chat-broadcast-panel');
    assert.equal(style(main).overflow, 'auto'); assert.equal(style(panel).position, 'static');
    main.scrollTop = 127; f.app.containNativeFrame(); assert.equal(main.scrollTop, 127, 'owned scrolling must survive send/status actions');
    for (const selector of ['[data-chat-broadcast-submit]', '[data-chat-show-delivery]', '[data-chat-workflow-action="show-migration-path"]', '[data-chat-history-cid]']) assert.ok(f.root.querySelector(selector));
  });
}

test('frame containment changes only the owning window and retains the native details footer', async t => {
  const f = await fixture(t); const other = await f.mount();
  f.app.containNativeFrame();
  assert.equal(f.frame.style.paddingBottom, '0px'); assert.equal(other.frame.style.paddingBottom, '');
  assert.equal(other.gateway.style.flex, '0 1 auto'); assert.ok(f.gateway.querySelector('details > summary'));
});

test('empty outbox stays hidden, while retry remains an explicit action instead of a queued-status label', async t => {
  const f = await fixture(t); assert.equal(typeof f.app.renderOutbox, 'function'); f.app.renderOutbox();
  assert.deepEqual(state(f).queue, { count: 0, messages: [] }); assert.equal(state(f).outbox.hidden, true);
  const retry = f.root.querySelector('[data-chat-workflow-action="show-migration-path"]');
  assert.equal(retry.tagName, 'BUTTON'); assert.equal(retry.type, 'button'); assert.equal(retry.disabled, false);
  assert.equal(retry.textContent.trim(), 'Retry / upgrade options');
});

test('real offline branch renders exact local queue count, topic and draft without dispatching an owner request', async t => {
  const f = await fixture(t); await queue(f);
  const actual = state(f); assert.deepEqual(actual.queue, { count: 1, messages: [{ topic: '/swissknife/chat/g047', text: 'svf-p2p-classic-offline' }] });
  assert.equal(actual.outbox.hidden, false); assert.equal(actual.outbox.querySelector('[data-chat-outbox-count]').textContent, '1 queued message');
  assert.equal(actual.outbox.querySelectorAll('li').length, 1); assert.match(actual.outbox.textContent, /svf-p2p-classic-offline/);
  assert.match(actual.outbox.textContent, /\/swissknife\/chat\/g047/); assert.match(f.app.composeStatus, /queued locally/);
  assert.equal(f.root.querySelector('[data-chat-broadcast-message]').value, 'svf-p2p-classic-offline');
});

test('repeated offline attempts keep one entry; distinct queued drafts retain their actual order and count', async t => {
  const f = await fixture(t); await queue(f); await f.app.broadcastMessage();
  assert.equal(state(f).queue.count, 1);
  f.root.querySelector('[data-chat-broadcast-message]').value = 'second pending draft'; await f.app.broadcastMessage();
  assert.deepEqual(state(f).queue.messages.map(row => row.text), ['svf-p2p-classic-offline', 'second pending draft']);
  assert.equal(state(f).queue.count, 2); assert.equal(state(f).outbox.querySelectorAll('li').length, 2);
});

test('queued text is rendered literally and cannot inject markup or corrupt the typed component state', async t => {
  const f = await fixture(t); const text = '<img src="untrusted" onerror="throw 1"> & "draft"'; await queue(f, text);
  assert.equal(state(f).queue.messages[0].text, text); assert.match(state(f).outbox.textContent, /<img src=/);
  assert.equal(state(f).outbox.querySelector('img'), null); assert.equal(state(f).outbox.querySelector('[onerror]'), null);
});

test('rendering a drained actual queue removes the pending entry and never leaves a stale queued-state panel', async t => {
  const f = await fixture(t); await queue(f); f.app.offlineQueue = []; f.app.renderRetainedState();
  assert.deepEqual(state(f).queue, { count: 0, messages: [] }); assert.equal(state(f).outbox.hidden, true);
  assert.equal(state(f).outbox.querySelectorAll('li').length, 0);
});

test('normal retained history restores the exact pending outbox across a fresh app instance', async t => {
  const f = await fixture(t); await queue(f); const reopened = await f.mount(); reopened.app.renderOutbox();
  assert.deepEqual(state(reopened).queue, state(f).queue); assert.equal(state(reopened).outbox.hidden, false);
  assert.equal(reopened.app.offlineQueue[0].content, 'svf-p2p-classic-offline');
});

test('scenario error checkpoint observes actual local outbox data and preserves all existing final targets', () => {
  const scenario = JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/p2p-chat.json', import.meta.url)));
  const failure = scenario.phases.failure_recovery.find(step => step.checkpoint_id === 'error_observed');
  assert.deepEqual(failure.probe, { kind: 'json_attribute', selector: '[data-chat-outbox]', attribute: 'data-chat-outbox-state', pointer: '/queue' });
  assert.deepEqual(failure.expected, { count: 1, messages: [{ topic: '/swissknife/chat/g047', text: 'svf-p2p-classic-offline' }] });
  assert.equal(scenario.phases.primary_result.at(-1).expected, 'svf-p2p-classic-note · peers ');
  assert.equal(scenario.phases.persist_reopen.at(-1).expected, 'delivery delivered; message svf-p2p-classic-note');
  assert.equal(scenario.phases.failure_recovery.at(-1).expected, 'delivery delivered · sends 2 · offline queue 0 holding none');
});

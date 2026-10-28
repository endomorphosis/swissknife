// Authored DOM/owner responses test application behavior, not live delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
const { P2PChatApp } = await import(process.env.SVF_P2P_CHAT_CANDIDATE
  ? pathToFileURL(process.env.SVF_P2P_CHAT_CANDIDATE).href
  : new URL('../../web/js/apps/p2p-chat.js', import.meta.url).href);

const binding = 'p2p-chat.ipfs_kit_py.exchange_peer_messages';
async function until(predicate) {
  for (let count = 0; count < 150; count++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  throw Error('authored confirmation did not appear');
}
async function fixture(t) {
  const names = ['window', 'document', 'localStorage', 'CustomEvent', 'getComputedStyle', 'fetch', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage,
    CustomEvent: window.CustomEvent, getComputedStyle: window.getComputedStyle.bind(window), __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: false });
  const calls = [], notices = [];
  let response = () => ({ accepted: true, durable: false, delivery_state: 'delivered', sender_peer_id: 'authored-peer-A', receiver_peer_id: 'authored-peer-B', replayed: false });
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls: [{
      app_id: 'p2p-chat', owner: 'ipfs_kit_py', binding_id: binding, intent_id: binding,
      selected_tool_id: 'ipfs_pubsub_publish', preferred_tool_ids: ['ipfs_pubsub_publish'],
      transport: 'http', transports: ['http'], mutates_remote_state: true,
    }] }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call', 'all other network requests are forbidden');
    const call = JSON.parse(options.body); calls.push(call);
    return { status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      result: response(call), receipt: { receipt_id: 'authored-unit-receipt', event_dag_refs: ['authored-unit-event'] } }) };
  };
  const app = new P2PChatApp({});
  app.showNotification = (message, type) => notices.push({ message, type });
  const mount = document.createElement('main'); document.body.append(mount); mount.innerHTML = await app.render();
  t.after(async () => {
    await window.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  const root = app.getNativeContainer();
  const message = root.querySelector('[data-chat-broadcast-message]');
  const topic = root.querySelector('[data-chat-publish-topic]');
  const confirm = async (pending, cancel = false) => {
    const before = calls.length;
    await until(() => root.querySelector('[data-gateway-confirm]'));
    assert.equal(calls.length, before, 'no dispatch before explicit confirmation');
    const button = root.querySelector(cancel ? '[data-gateway-cancel]' : '[data-gateway-confirm]');
    if (cancel) button.click();
    else {
      button.click();
      assert.equal(calls.length, before, 'synthetic DOM click must not grant real execution');
      // Authored happy-dom event only: this exercises the existing guarded
      // callback with a trusted-event fixture, not a browser/consent proof.
      const authored = new window.MouseEvent('click', { bubbles: true });
      Object.defineProperty(authored, 'isTrusted', { value: true });
      button.dispatchEvent(authored);
    }
    await pending;
  };
  const publish = async text => { message.value = text; await confirm(app.broadcastMessage()); };
  const initialAndQueue = async () => {
    await publish('first delivered note');
    message.value = 'later offline draft'; await app.broadcastMessage();
    assert.equal(calls.length, 1); assert.equal(app.offlineQueue.length, 1);
    assert.match(root.querySelector('[data-chat-compose-status]').textContent, /queued locally/);
  };
  return { app, root, calls, notices, message, topic, confirm, publish, initialAndQueue,
    result: value => { response = typeof value === 'function' ? value : () => value; } };
}

test('an explicitly armed retry confirms and publishes the queued bytes, then removes only that queue entry', async t => {
  const f = await fixture(t); await f.initialAndQueue();
  f.app.offlineQueue.push({ to: f.topic.value, content: 'another retained draft' });
  f.app.showMigrationPath();
  await f.confirm(f.app.broadcastMessage());
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].binding_id, binding);
  assert.equal(f.calls[1].tool_id, 'ipfs_pubsub_publish');
  assert.equal(f.calls[1].input.policy.consent, 'granted'); assert.equal(f.calls[1].input.policy.dry_run, false);
  const before = JSON.parse(f.calls[0].input.payload.message), after = JSON.parse(f.calls[1].input.payload.message);
  assert.equal(after.text, 'later offline draft'); assert.notEqual(after.message_id, before.message_id); assert.notEqual(after.nonce, before.nonce);
  assert.deepEqual(f.app.offlineQueue.map(row => row.content), ['another retained draft']);
  assert.equal(f.app.governedSendCount, 2); assert.equal(f.app.workflowState.delivery, 'delivered'); assert.equal(f.app.replayArmed, false);
  assert.equal(f.app.retainedDraft, 'later offline draft');
  assert.match(f.root.querySelector('.chat-published-transcript').textContent, /later offline draft.*delivery delivered.*sends 2/);
});

test('without explicit retry, repeated offline sends stay local and cannot duplicate the queue', async t => {
  const f = await fixture(t); await f.initialAndQueue();
  await f.app.broadcastMessage(); await f.app.broadcastMessage();
  assert.equal(f.calls.length, 1); assert.equal(f.app.offlineQueue.length, 1);
  assert.equal(f.root.querySelector('[data-gateway-confirm]'), null);
});

test('retry arming does not bypass the offline gate for an unrelated unqueued draft', async t => {
  const f = await fixture(t); await f.initialAndQueue();
  f.app.showMigrationPath(); f.message.value = 'unrelated draft'; await f.app.broadcastMessage();
  assert.equal(f.calls.length, 1); assert.deepEqual(f.app.offlineQueue.map(row => row.content), ['later offline draft', 'unrelated draft']);
  assert.equal(f.root.querySelector('[data-gateway-confirm]'), null);
});

test('cancelled queued retry retains the draft and queue and does not dispatch', async t => {
  const f = await fixture(t); await f.initialAndQueue(); f.app.showMigrationPath();
  await f.confirm(f.app.broadcastMessage(), true);
  assert.equal(f.calls.length, 1); assert.equal(f.app.offlineQueue.length, 1); assert.equal(f.message.value, 'later offline draft');
  assert.equal(f.app.governedSendCount, 1); assert.match(f.app.composeStatus, /not published/);
});

test('a failed or non-distinct owner acknowledgement cannot empty the queue or claim delivery', async t => {
  const f = await fixture(t); await f.initialAndQueue(); f.app.showMigrationPath();
  f.result({ accepted: true, durable: false, delivery_state: 'delivered', sender_peer_id: 'same-peer', receiver_peer_id: 'same-peer' });
  await f.confirm(f.app.broadcastMessage());
  assert.equal(f.calls.length, 2); assert.equal(f.app.offlineQueue.length, 1); assert.equal(f.app.governedSendCount, 1);
  assert.equal(f.app.workflowState.delivery, 'failed'); assert.match(f.notices.at(-1).message, /distinct peer delivery/);
});

test('successful queued retry drains the queue and identical send does not dispatch again', async t => {
  const f = await fixture(t); await f.initialAndQueue(); f.app.showMigrationPath(); await f.confirm(f.app.broadcastMessage());
  assert.equal(f.app.offlineQueue.length, 0); assert.equal(f.app.workflowState.offline, 'empty');
  assert.match(f.root.querySelector('.chat-published-transcript').textContent, /delivery delivered · sends 2 · offline queue 0 holding none/);
  await f.app.broadcastMessage(); assert.equal(f.calls.length, 2); assert.equal(f.app.governedSendCount, 2);
  f.app.showMigrationPath(); f.result({ accepted: true, durable: false, delivery_state: 'delivered', sender_peer_id: 'authored-peer-A', receiver_peer_id: 'authored-peer-B', replayed: true });
  await f.confirm(f.app.broadcastMessage());
  assert.equal(f.calls.length, 3); assert.equal(f.calls[2].input.payload.message, f.calls[1].input.payload.message);
  assert.equal(f.app.governedSendCount, 2); f.app.showDeliveryStatus();
  assert.equal(f.notices.at(-1).type, 'info', 'successful replay must not become a red failure notice');
});

test('reopening retained history preserves exact peer identities, delivered bytes, queue and duplicate key', async t => {
  const f = await fixture(t); await f.initialAndQueue();
  const saved = JSON.parse(localStorage.getItem('p2p-chat.retained-history.v1'));
  const reopened = new P2PChatApp({});
  assert.equal(reopened.peerId, saved.peerId); assert.equal(reopened.remotePeerId, saved.remotePeerId);
  assert.equal(reopened.retainedDraft, 'first delivered note'); assert.equal(reopened.lastPublishedKey, f.app.lastPublishedKey);
  assert.deepEqual(reopened.lastExchange, f.app.lastExchange); assert.equal(reopened.offlineQueue[0].content, 'later offline draft');
  assert.equal(reopened.workflowState.delivery, 'delivered'); assert.equal(reopened.governedSendCount, 1); assert.equal(reopened.replayArmed, false);
});

test('the declared recovery retries the queued draft and requires a drained queue rather than replaying old bytes', () => {
  const scenario = JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/p2p-chat.json', import.meta.url)));
  const recovery = scenario.phases.failure_recovery;
  assert.equal(recovery.filter(step => step.op === 'fill').length, 1);
  assert.equal(recovery.find(step => step.op === 'fill').value, 'svf-p2p-classic-offline');
  assert.ok(recovery.find(step => step.op === 'wait_for' && step.selector === '[data-offline-state="empty"]'));
  assert.equal(recovery.at(-1).expected, 'delivery delivered · sends 2 · offline queue 0 holding none');
  assert.deepEqual(recovery.find(step => step.checkpoint_id === 'error_observed')?.expected, { count: 1, messages: [{ topic: '/swissknife/chat/g047', text: 'svf-p2p-classic-offline' }] });
  assert.equal(recovery.filter(step => step.selector?.startsWith('[data-gateway-confirm=') && step.op === 'click').length, 1);
});

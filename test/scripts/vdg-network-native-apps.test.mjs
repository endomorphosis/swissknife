import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { P2PChatApp } from '../../web/js/apps/p2p-chat.js';
import { FriendsListApp } from '../../web/js/apps/friends-list.js';
import { invokeNetworkNativeTool, networkNativeAttributes, NetworkPreview } from '../../web/js/apps/network-native-tools.js';

const operationTools = [
  ['persist_artifact', 'artifacts_put', 'mcp++:ipfs_kit_py/artifacts/put'],
  ['retrieve_artifact', 'artifacts_get', 'mcp++:ipfs_kit_py/artifacts/get'],
  ['append_event', 'dag_append', 'mcp++:ipfs_kit_py/dag/append'],
  ['read_event_history', 'dag_history', 'mcp++:ipfs_kit_py/dag/history'],
  ['exchange_peer_messages', 'ipfs_pubsub_publish', 'mcp++:ipfs_kit_py/ipfs_pubsub_publish'],
];
const bindings = ['p2p-chat', 'p2p-chat-unified', 'friends-list'].flatMap(app_id => operationTools.map(([operation, tool]) => ({
  app_id, binding_id: `${app_id}.ipfs_kit_py.${operation}`, owner: 'ipfs_kit_py', intent_id: `${app_id}.ipfs_kit_py.${operation}`,
  selected_tool_id: tool, preferred_tool_ids: [tool], status: 'available',
  mutates_remote_state: !['artifacts_get', 'dag_history'].includes(tool), transport: 'http', transports: ['http', 'libp2p'],
})));

async function until(predicate) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Expected native confirmation was not shown.');
}

function environment(t, resultFor = call => ({ ok: true, dry_run: true, mutation_performed: false, persisted: false, expected_cid: call.input.payload.cid })) {
  const names = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent, localStorage: window.localStorage,
    __SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__: 'libp2p', __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) {
      const appId = new URL(url, 'http://localhost').searchParams.get('app_id');
      return { ok: true, json: async () => ({ controls: bindings.filter(item => item.app_id === appId) }) };
    }
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    assert.equal(options.method, 'POST');
    const call = JSON.parse(options.body);
    calls.push(call);
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      result: { result: { content: [{ type: 'json', json: resultFor(call) }] } }, receipt: { receipt_id: 'test-owner-receipt' } }) };
  };
  t.after(() => {
    window.happyDOM.abort();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  return { window, calls };
}

for (const [operation, tool, legacy] of operationTools) {
  test(`native ${tool} preserves its exact operation and payload through the reviewed gateway`, async t => {
    const payload = tool === 'artifacts_put' ? { cid: 'requested-unit-cid', bytes_base64: 'dW5pdA==', pin: true }
      : tool === 'artifacts_get' ? { cid: 'stored-unit-cid' }
      : tool === 'dag_append' ? { event: { event_type: 'unit.reviewed', parents: [] } }
      : tool === 'dag_history' ? { limit: 10 }
      : { topic: '/unit/topic', content: 'actual draft', peer_id: 'selected-peer' };
    const mutates = !['artifacts_get', 'dag_history'].includes(tool);
    const result = mutates ? { ok: true, dry_run: true, mutation_performed: false, persisted: false, expected_cid: payload.cid }
      : tool === 'artifacts_get' ? { found: true, verified: true, cid: payload.cid, bytes_base64: 'dW5pdA==' } : { events: [] };
    const { calls } = environment(t, () => result);
    const root = document.createElement('section');
    root.innerHTML = `<button ${networkNativeAttributes('p2p-chat', legacy)}>Native action</button>`;
    document.body.append(root);
    let origin;
    root.addEventListener('swissknife:live-gateway-result', event => { origin = event.detail.origin; });
    const pending = invokeNetworkNativeTool(root, 'p2p-chat', legacy, payload);
    if (mutates) {
      const rejection = assert.rejects(pending, NetworkPreview);
      await until(() => root.querySelector('[data-gateway-confirm]'));
      assert.equal(calls.length, 0);
      root.querySelector('[data-gateway-confirm]').click();
      await rejection;
    } else assert.deepEqual(await pending, result);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].binding_id, `p2p-chat.ipfs_kit_py.${operation}`);
    assert.equal(calls[0].tool_id, tool);
    assert.equal(calls[0].owner, 'ipfs_kit_py');
    assert.equal(calls[0].transport, 'libp2p');
    assert.deepEqual(calls[0].input.payload, payload);
    assert.equal(calls[0].input.policy.dry_run, true);
    assert.equal(calls[0].method, undefined);
    assert.equal(origin, 'native-control');
  });
}

test('classic native send cancellation preserves the draft and sends zero requests', async t => {
  const { calls } = environment(t);
  const app = new P2PChatApp({});
  app.peers.set('local-contact', { id: 'local-contact', name: 'Local contact', status: 'offline' });
  app.currentChatPeer = 'local-contact';
  const root = document.createElement('section');
  root.innerHTML = await app.render();
  document.body.append(root);
  root.querySelector('.message-input').value = 'Keep this draft';
  const pending = app.sendMessage();
  await until(() => root.querySelector('[data-gateway-cancel]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(root.querySelector('.message-input').value, 'Keep this draft');
});

test('classic artifact preview never assigns a persisted CID or chains a DAG append', async t => {
  const { calls } = environment(t);
  const app = new P2PChatApp({});
  const root = document.createElement('section');
  root.innerHTML = await app.render();
  document.body.append(root);
  app.showNotification = () => {};
  const pending = app.publishPubsubProvenance();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool_id, 'artifacts_put');
  assert.equal(app.workflowState.pubsub, 'validated-preview');
  assert.equal(app.workflowState.provenanceCid, '');
});

test('friends policy preview leaves persisted identity fields unset', async t => {
  const { calls } = environment(t);
  const app = new FriendsListApp({});
  const root = document.createElement('section');
  root.innerHTML = app.getHTML();
  document.body.append(root);
  app.container = root;
  const pending = app.applyRelationshipPolicy();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].app_id, 'friends-list');
  assert.equal(calls[0].tool_id, 'artifacts_put');
  assert.equal(app.relationshipPolicy.cid, null);
  assert.equal(app.relationshipPolicy.receipt, null);
  assert.match(app.vdaG037.selectedAction, /preview/);
});

test('unknown network operation is refused before dispatch', async t => {
  const { calls } = environment(t);
  await assert.rejects(invokeNetworkNativeTool(document.body, 'p2p-chat', 'unreviewed:operation', {}), /No reviewed network operation/);
  assert.equal(calls.length, 0);
});

test('unified native publish preview never calls the separate browser transport', async t => {
  const { calls } = environment(t);
  const { UnifiedP2PChatApp } = await import('../../web/js/apps/p2p-chat-unified.js');
  const app = new UnifiedP2PChatApp({});
  let browserPublishes = 0;
  app.libp2p = { publish: async () => { browserPublishes++; } };
  const root = document.createElement('section');
  root.innerHTML = await app.render();
  document.body.append(root);
  const pending = app.confirmThenInvokeSend('Current native message');
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  const message = await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].app_id, 'p2p-chat-unified');
  assert.equal(calls[0].tool_id, 'ipfs_pubsub_publish');
  assert.equal(calls[0].input.payload.content, 'Current native message');
  assert.equal(message.delivered, false);
  assert.equal(message.delivery, 'validated-preview');
  assert.equal(browserPublishes, 0);
});

test('unified archive preview starts visible confirmation and never creates a persisted archive', async t => {
  const { calls } = environment(t);
  const { UnifiedP2PChatApp } = await import('../../web/js/apps/p2p-chat-unified.js');
  const app = new UnifiedP2PChatApp({});
  const root = document.createElement('section');
  root.innerHTML = await app.render();
  document.body.append(root);
  const pending = app.requestChannelPersist();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool_id, 'artifacts_put');
  assert.equal(app.persistedChannelCid, null);
  assert.equal(app.receipts.some(receipt => receipt.status === 'persisted'), false);
  assert.match(app.backendStatus, /dry-run preview/);
  const actualStatus = root.querySelector('[data-gateway-status="p2p-chat-unified.ipfs_kit_py.persist_artifact"]').textContent;
  await app.refresh();
  assert.equal(app.getNativeContainer().querySelector('[data-gateway-status="last-native-result"]').textContent, actualStatus);
  assert.match(actualStatus, /artifacts_put .*receipt=test-owner-receipt/);
});

for (const transport of ['http', 'libp2p']) {
  test(`unified archive ${transport} read keeps the actual tool and receipt status after its root is replaced`, async t => {
    const archive = { schema: 'swissknife.p2p-chat.channel.v1', conversations: { actualPeer: [{ content: 'Archived actual note' }] } };
    const { calls } = environment(t, call => ({ found: true, verified: true, cid: call.input.payload.cid,
      bytes_base64: Buffer.from(JSON.stringify(archive)).toString('base64') }));
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
    const { UnifiedP2PChatApp } = await import('../../web/js/apps/p2p-chat-unified.js');
    const app = new UnifiedP2PChatApp({});
    const host = document.createElement('section');
    document.body.append(host);
    await app.mount(host);
    const initialRoot = app.getNativeContainer();
    initialRoot.querySelector('[data-chat-archive-cid]').value = 'actual-archive-cid';
    await app.handleAction('load-channel', initialRoot.querySelector('[data-chat-action="load-channel"]'));
    const actualStatus = initialRoot.querySelector('[data-gateway-status="p2p-chat-unified.ipfs_kit_py.retrieve_artifact"]').textContent;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].transport, transport);
    assert.equal(calls[0].input.payload.cid, 'actual-archive-cid');
    await app.refresh();
    const currentRoot = app.getNativeContainer();
    assert.notEqual(currentRoot, initialRoot);
    assert.equal(currentRoot.querySelector('[data-gateway-status="last-native-result"]').textContent, actualStatus);
    assert.match(actualStatus, /artifacts_get .*; executed; receipt=test-owner-receipt/);
    assert.match(actualStatus, new RegExp(calls[0].correlation_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(app.conversations.get('actualPeer'), archive.conversations.actualPeer);
    assert.match(app.backendStatus, /actual-archive-cid.*verified: true/);
    // The status contract precedes window text in the real capture collector.
    assert.match(`ready ready ready ready ready ${actualStatus} ${currentRoot.textContent}`.slice(0, 500), /artifacts_get/);
    await app.refresh();
    assert.equal(app.getNativeContainer().querySelector('[data-gateway-status="last-native-result"]').textContent, actualStatus);
  });
}

test('unified failed native result remains a failure and cancellation cannot reuse a previous receipt', async t => {
  const { calls } = environment(t);
  const gatewayFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url !== '/mcp/tools/call') return gatewayFetch(url, options);
    const call = JSON.parse(options.body);
    calls.push(call);
    return { ok: true, status: 200, json: async () => ({ ok: false, outcome: 'failed',
      correlation_id: call.correlation_id, error: 'Actual owner unavailable' }) };
  };
  const { UnifiedP2PChatApp } = await import('../../web/js/apps/p2p-chat-unified.js');
  const app = new UnifiedP2PChatApp({});
  const host = document.createElement('section');
  document.body.append(host);
  await app.mount(host);
  app.getNativeContainer().querySelector('[data-chat-archive-cid]').value = 'missing-cid';
  await app.loadChannelArchive();
  await app.refresh();
  let status = app.getNativeContainer().querySelector('[data-gateway-status="last-native-result"]').textContent;
  assert.match(status, /artifacts_get .*; failed; receipt=unavailable/);
  assert.match(app.backendStatus, /Actual owner unavailable/);
  assert.equal(app.persistedChannelCid, null);
  const pending = app.requestChannelPersist();
  await until(() => app.getNativeContainer().querySelector('[data-gateway-cancel]'));
  app.getNativeContainer().querySelector('[data-gateway-cancel]').click();
  await pending;
  await app.refresh();
  assert.equal(calls.length, 1);
  assert.equal(app.getNativeContainer().querySelector('[data-gateway-status="last-native-result"]'), null);
  assert.match(app.backendStatus, /cancelled before dispatch/);
});

test('friends native cancellation preserves policy state without dispatch', async t => {
  const { calls } = environment(t);
  const app = new FriendsListApp({});
  const root = document.createElement('section');
  root.innerHTML = app.getHTML();
  document.body.append(root);
  app.container = root;
  const pending = app.applyRelationshipPolicy();
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(app.relationshipPolicy.cid, null);
  assert.match(app.vdaG037.selectedAction, /cancelled/);
});

test('mismatched artifact preview CID is an error and cannot establish a validated preview', async t => {
  const { calls } = environment(t, () => ({ dry_run: true, mutation_performed: false, persisted: false, expected_cid: 'different' }));
  const root = document.createElement('section');
  document.body.append(root);
  const pending = invokeNetworkNativeTool(root, 'p2p-chat', 'mcp++:ipfs_kit_py/artifacts/put', { cid: 'requested' });
  const failed = assert.rejects(pending, /did not validate the requested CID/);
  await until(() => root.querySelector('[data-gateway-confirm]'));
  root.querySelector('[data-gateway-confirm]').click();
  await failed;
  assert.equal(calls.length, 1);
});

test('classic broadcast validates actual topic and message without inventing a peer connection or delivery', async t => {
  const { calls } = environment(t);
  const app = new P2PChatApp({});
  const root = document.createElement('section');
  root.innerHTML = await app.render();
  document.body.append(root);
  app.showNotification = () => {};
  let localDeliveries = 0;
  app.p2pManager.broadcast = () => { localDeliveries++; };
  const trigger = root.querySelector('[data-native-tool-id="ipfs_pubsub_publish"]');
  assert.equal(trigger.disabled, false);
  app.updateConnectionStatus();
  assert.equal(trigger.disabled, false);
  root.querySelector('[data-chat-publish-topic]').value = '/swissknife/chat/selected-topic';
  root.querySelector('[data-chat-broadcast-message]').value = 'Current reviewed message';
  const pending = app.broadcastMessage();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  assert.equal(app.connectionStatus, 'disconnected');
  assert.equal(app.peers.size, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool_id, 'ipfs_pubsub_publish');
  assert.deepEqual(calls[0].input.payload, { topic: '/swissknife/chat/selected-topic', content: 'Current reviewed message' });
  assert.equal(app.lastSendOutcome.status, 'validated-preview');
  assert.equal(app.connectionStatus, 'disconnected');
  assert.equal(app.peers.size, 0);
  assert.equal(localDeliveries, 0);
});

test('empty or cancelled classic broadcast makes zero requests and keeps its draft', async t => {
  const { calls } = environment(t);
  const app = new P2PChatApp({});
  const root = document.createElement('section');
  root.innerHTML = await app.render();
  document.body.append(root);
  app.showNotification = () => {};
  await app.broadcastMessage();
  assert.equal(calls.length, 0);
  root.querySelector('[data-chat-broadcast-message]').value = 'Keep this broadcast draft';
  const pending = app.broadcastMessage();
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(root.querySelector('[data-chat-broadcast-message]').value, 'Keep this broadcast draft');
  assert.equal(app.lastSendOutcome, null);
});

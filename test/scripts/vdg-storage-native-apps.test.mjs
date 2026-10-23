import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { ImageViewerApp } from '../../web/js/apps/image-viewer.js';
import { MediaPlayer } from '../../web/js/apps/media-player.js';
import { PeerTubeApp } from '../../web/js/apps/peertube.js';

const apps = ['image-viewer', 'media-player', 'peertube'];
const bindings = apps.map(app_id => ({ app_id, binding_id: `${app_id}.ipfs_kit_py.retrieve_content`,
  owner: 'ipfs_kit_py', intent_id: `${app_id}.ipfs_kit_py.retrieve_content`,
  selected_tool_id: 'ipfs_cat', preferred_tool_ids: ['ipfs_cat'], transport: 'http', transports: ['http', 'libp2p'],
  mutates_remote_state: true, status: 'available' }));
async function until(predicate) {
  for (let count = 0; count < 100; count += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 3));
  }
  throw new Error('Native confirmation did not become visible.');
}
function environment(t, failed = false, ownerResult = { ok: true, dry_run: true }) {
  const keys = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent,
    localStorage: window.localStorage, __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  const initializeAudio = MediaPlayer.prototype.initializeAudio;
  MediaPlayer.prototype.initializeAudio = async function() {};
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) {
      const app = new URL(url, 'http://localhost').searchParams.get('app_id');
      return { ok: true, json: async () => ({ controls: bindings.filter(binding => binding.app_id === app) }) };
    }
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body); calls.push(call);
    return { ok: !failed, status: failed ? 503 : 200, json: async () => ({
      ok: !failed, outcome: failed ? 'failed' : 'executed', correlation_id: call.correlation_id,
      ...(failed ? { error: 'Owner unavailable: real failure' } : { result: ownerResult }),
      receipt: { receipt_id: 'test-receipt', event_dag_refs: ['test-event'] },
    }) };
  };
  t.after(() => {
    window.happyDOM.abort();
    MediaPlayer.prototype.initializeAudio = initializeAudio;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  return { calls };
}
function nativeApp(appId) {
  const root = document.createElement('section'); document.body.append(root);
  const button = document.createElement('button');
  button.dataset.nativeGatewayBinding = `${appId}.ipfs_kit_py.retrieve_content`;
  button.dataset.nativeToolId = 'ipfs_cat'; root.append(button);
  const messages = [];
  let app;
  let run;
  if (appId === 'image-viewer') {
    app = new ImageViewerApp({}); app.container = () => root;
    app.refreshContent = () => {}; app.appendWorkflowLog = value => messages.push(value);
    run = () => app.retrieveCidImage('bafy-native-fixture', button);
  } else if (appId === 'media-player') {
    app = new MediaPlayer(); app.container = root;
    app.promptForCid = async () => 'bafy-native-fixture';
    app.setWorkflowLine = (_key, value) => messages.push(value); app.appendReceiptLog = value => messages.push(value);
    run = () => app.retrieveCidMedia(button);
  } else {
    app = new PeerTubeApp({}); app.container = root;
    app.setCidOpenStatus = value => messages.push(value); app.appendWorkflowLog = value => messages.push(value);
    run = () => app.openVideoByCid('bafy-native-fixture', button);
  }
  return { app, root, button, messages, run };
}

for (const appId of apps) {
  for (const transport of ['http', 'libp2p']) {
    test(`${appId} native CID retrieval confirms before its exact ${transport} call`, async t => {
      const { calls } = environment(t);
      globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = transport;
      const app = nativeApp(appId);
      let observation;
      app.root.addEventListener('swissknife:live-gateway-result', event => { observation = event.detail; });
      const pending = app.run();
      await until(() => app.root.querySelector('[data-gateway-confirm]'));
      assert.equal(calls.length, 0);
      app.root.querySelector('[data-gateway-confirm]').click();
      await pending;
      assert.equal(calls.length, 1);
      assert.equal(calls[0].app_id, appId);
      assert.equal(calls[0].binding_id, `${appId}.ipfs_kit_py.retrieve_content`);
      assert.equal(calls[0].owner, 'ipfs_kit_py');
      assert.equal(calls[0].tool_id, 'ipfs_cat');
      assert.equal(calls[0].transport, transport);
      assert.equal(calls[0].input.payload.cid, 'bafy-native-fixture');
      assert.equal(calls[0].input.policy.dry_run, true);
      assert.equal(observation.origin, 'native-control');
      assert.ok(app.messages.some(message => message.includes(calls[0].correlation_id)));
    });
  }
  test(`${appId} cancelled native retrieval sends zero calls`, async t => {
    const { calls } = environment(t); const app = nativeApp(appId);
    const pending = app.run();
    await until(() => app.root.querySelector('[data-gateway-cancel]'));
    app.root.querySelector('[data-gateway-cancel]').click(); await pending;
    assert.equal(calls.length, 0);
    assert.ok(app.messages.some(message => message.includes('Cancelled')) || app.app.vdaG038?.lastRetrievedInfo.includes('Cancelled'));
  });
  test(`${appId} owner failure stays visible instead of reporting dry-run success`, async t => {
    const { calls } = environment(t, true); const app = nativeApp(appId);
    const pending = app.run();
    await until(() => app.root.querySelector('[data-gateway-confirm]'));
    app.root.querySelector('[data-gateway-confirm]').click(); await pending;
    assert.equal(calls.length, 1);
    assert.ok(app.messages.some(message => message.includes('Owner unavailable')) || app.app.vdaG038?.lastRetrievedInfo.includes('Owner unavailable'));
  });
}

for (const appId of ['image-viewer', 'media-player']) {
  test(`${appId} CID Enter stops at the next owner confirmation without forwarding its keyboard default`, async t => {
    const { calls } = environment(t);
    const root = document.createElement('section'); document.body.append(root);
    const trigger = document.createElement('button'); root.append(trigger);
    let app, pending;
    if (appId === 'image-viewer') {
      app = new ImageViewerApp({}); app.container = () => root;
      app.refreshContent = () => {}; app.appendWorkflowLog = () => {};
      pending = app.retrieveCidImage(null, trigger);
    } else {
      app = new MediaPlayer(); app.container = root;
      app.setWorkflowLine = () => {}; app.appendReceiptLog = () => {};
      pending = app.retrieveCidMedia(trigger);
    }
    const input = document.querySelector('input[aria-label="Artifact CID"]');
    assert.ok(input, 'The actual CID prompt must be used');
    input.value = 'bafy-native-keyboard-fixture';
    let leakedKeys = 0;
    document.addEventListener('keydown', () => leakedKeys++);
    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    assert.equal(input.dispatchEvent(enter), false, 'CID submission must consume the Enter default');
    assert.equal(enter.defaultPrevented, true);
    assert.equal(leakedKeys, 0, 'The CID key must not reach a following dialog');
    await until(() => root.querySelector('[data-gateway-confirm]'));
    assert.equal(calls.length, 0, 'Supplying a CID must not authorize dispatch');
    assert.ok(root.querySelector('[data-gateway-cancel]'), 'The separate owner consent must remain open');
    root.querySelector('[data-gateway-confirm]').click();
    await pending;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool_id, 'ipfs_cat');
    assert.equal(calls[0].input.payload.cid, 'bafy-native-keyboard-fixture');
  });
}

test('only dispatching CID controls expose reviewed native binding metadata', t => {
  environment(t);
  const image = new ImageViewerApp({}); const media = new MediaPlayer(); const peer = new PeerTubeApp({});
  const root = document.createElement('section');
  root.innerHTML = image.getWindowContent();
  assert.ok(root.querySelector('#retrieve-cid-btn[data-native-tool-id="ipfs_cat"]'));
  root.innerHTML = image.renderWelcomeScreen();
  assert.ok(root.querySelector('#welcome-retrieve-cid[data-native-tool-id="ipfs_cat"]'));
  root.innerHTML = image.renderVdaG038Workflow();
  assert.ok(root.querySelector('[data-native-gateway-binding="image-viewer.ipfs_kit_py.retrieve_content"][data-native-tool-id="ipfs_cat"]'));
  root.innerHTML = media.createInterface();
  assert.ok(root.querySelector('[data-native-gateway-binding="media-player.ipfs_kit_py.retrieve_content"][data-native-tool-id="ipfs_cat"]'));
  root.innerHTML = peer.getHTML();
  assert.equal(root.querySelector('#cid-open-btn').dataset.nativeGatewayBinding, 'peertube.ipfs_kit_py.retrieve_content');
  assert.equal(root.querySelector('[data-svd-workflow-action="retrieve-cid-playback"]').hasAttribute('data-native-gateway-binding'), false,
    'a focus-only local control was mislabeled as invoking');
});

for (const appId of apps) {
  test(`${appId} decodes the real structured ipfs_cat bytes without a legacy found flag`, async t => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const { calls } = environment(t, false, { content: [{ type: 'json', json: {
      success: true, cid: 'bafy-native-fixture', bytes_base64: bytes.toString('base64'), size: bytes.length,
    } }] });
    globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = false;
    const binding = bindings.find(item => item.app_id === appId);
    binding.mutates_remote_state = false;
    t.after(() => { binding.mutates_remote_state = true; });
    const app = nativeApp(appId);
    app.app.measureImageDimensions = () => {};
    for (const method of ['setWorkflowReceipt', 'setWorkflowState', 'markWorkflowAction', 'updatePlaylist', 'showNotification', 'saveLocalLibraryIndex']) app.app[method] = () => {};
    let played;
    app.app.playVideo = async id => { played = id; };
    await app.run();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input.policy.dry_run, false);
    if (appId === 'image-viewer') {
      assert.equal(app.app.currentImage.bytes.length, bytes.length);
      assert.equal(app.app.vdaG038.retrievalState, 'retrieved');
      URL.revokeObjectURL(app.app.currentImage.url);
    } else if (appId === 'media-player') {
      assert.equal(app.app.lastRetrievedArtifact.bytes, bytes.length);
      assert.equal(app.app.playlist.at(-1).cid, 'bafy-native-fixture');
      URL.revokeObjectURL(app.app.playlist.at(-1).url);
    } else {
      assert.equal(app.app.videoLibrary.get(played).size, bytes.length);
    }
  });
  test(`${appId} structured owner error cannot become successful dry-run text`, async t => {
    environment(t, false, { content: [{ type: 'json', json: { success: false, error: 'Structured owner failure' } }] });
    const app = nativeApp(appId); const pending = app.run();
    await until(() => app.root.querySelector('[data-gateway-confirm]'));
    app.root.querySelector('[data-gateway-confirm]').click(); await pending;
    assert.ok(app.messages.some(message => message.includes('Structured owner failure')) || app.app.vdaG038?.lastRetrievedInfo.includes('Structured owner failure'));
    assert.equal(app.messages.some(message => message.startsWith('dry run')), false);
  });
}

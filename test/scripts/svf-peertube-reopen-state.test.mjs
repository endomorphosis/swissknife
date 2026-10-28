// Authored local media-state regression; no browser/codec/backend qualification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { Window } from 'happy-dom';

const sourceRoot = process.env.SVF_PEERTUBE_SOURCE_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
const source = fs.readFileSync(sourceRoot + '/swissknife/web/js/apps/peertube.js', 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const node = ast.body.map(item => item.declaration || item).find(item => item.type === 'ClassDeclaration' && item.id.name === 'PeerTubeApp');
const functions = ast.body.filter(item => item.type === 'FunctionDeclaration').map(item => source.slice(item.start, item.end)).join('\n');

function fixture(t, { ownerFailure = null, viewportWidth = 1024, viewportHeight = 844 } = {}) {
  const window = new Window({ url: 'http://authored.invalid', width: viewportWidth, height: viewportHeight, settings: { disableCSSFileLoading: true, disableJavaScriptEvaluation: true } });
  t.after(() => window.happyDOM.abort());
  const calls = []; const urlTrace = []; const ownerCalls = [];
  const forbidden = () => { calls.push('forbidden owner request'); throw new Error('No backend request is allowed'); };
  const invokeNativeTool = ownerFailure === null ? forbidden : async (...args) => {
    ownerCalls.push(args);
    return { ok: false, error: ownerFailure };
  };
  const App = vm.runInNewContext(functions + ';(' + source.slice(node.start, node.end) + ')', {
    window, document: window.document, localStorage: window.localStorage, console: { log() {}, warn() {}, error() {} },
    URL: { createObjectURL: () => { urlTrace.push('create'); throw new Error('No new media URL expected'); },
      revokeObjectURL: url => urlTrace.push(['revoke', url]) },
    setTimeout, clearTimeout, fetch: forbidden, invokeNativeTool, performance, Element: window.Element,
  });
  const desktop = { windows: new Map(), activeWindow: null, updateSystemStatus() {}, updateTaskbar() {} };
  const desktopSource = fs.readFileSync(sourceRoot + '/swissknife/web/js/main-simple.js', 'utf8');
  const desktopAST = parse(desktopSource, { ecmaVersion: 'latest', sourceType: 'module' });
  const desktopClass = desktopAST.body.find(item => item.type === 'ClassDeclaration' && item.id.name === 'SwissKnifeDesktop');
  const closeMethod = desktopClass.body.body.find(item => item.key?.name === 'setupWindowControls');
  const setupWindowControls = vm.runInNewContext('({' + desktopSource.slice(closeMethod.start, closeMethod.end) + '}).setupWindowControls', { document: window.document });
  async function mount(owner = desktop, nativeWindow = false) {
    const app = new App(owner); app.isInitialized = true;
    const root = window.document.createElement('div');
    let shell = null;
    if (nativeWindow) {
      shell = window.document.createElement('div'); shell.id = 'peertube-' + owner.windows.size;
      shell.className = 'window'; shell.dataset.appId = 'peertube';
      shell.innerHTML = '<button type="button" class="window-control close">Close</button>';
      shell.append(root); window.document.body.append(shell); owner.windows.set(shell.id, {});
      setupWindowControls.call(owner, shell);
    } else window.document.body.append(root);
    await app.createInterface(root);
    return { app, root, shell };
  }
  function seed({ app, root }, { paused = false, error = null, readyState = 2, wrongCid = false, wrongDecodedCid = false } = {}) {
    const video = root.querySelector('#video-element');
    const state = { paused, error, readyState, duration: 30, currentTime: 12, playCalls: 0, ended: false };
    for (const key of ['paused', 'error', 'readyState', 'duration']) Object.defineProperty(video, key, { configurable: true, get: () => state[key] });
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => state.currentTime, set(value) { state.currentTime = value; video.dispatchEvent(new window.Event('seeked')); } });
    Object.defineProperty(video, 'ended', { configurable: true, get: () => state.ended });
    video.play = async () => { state.playCalls++; const changed = state.paused; state.paused = false; if (changed) video.dispatchEvent(new window.Event('play')); };
    video.pause = () => { const changed = !state.paused; state.paused = true; if (changed) video.dispatchEvent(new window.Event('pause')); };
    video.src = 'blob:http://authored.invalid/retrieved-media'; video.dataset.cid = wrongCid ? 'another-cid' : 'actual-fixture-cid';
    video.dataset.decodedCid = wrongDecodedCid ? 'stale-decoder-cid' : video.dataset.cid; video.muted = true; video.volume = 0.35;
    app.currentVideo = { id: 'local-fixture', cid: 'actual-fixture-cid', title: 'Retrieved fixture', description: 'Original local metadata' };
    app.currentObjectUrl = video.src; app.videoLibrary.set(app.currentVideo.id, app.currentVideo); app.saveLocalLibraryIndex();
    app.vdaG036.playbackCid = app.currentVideo.cid;
    app.bindPlaybackControls(root, video);
    video.dispatchEvent(new window.Event('loadedmetadata'));
    return { video, state };
  }
  function close(first) { first.app.cleanup(); first.root.remove(); }
  return { App, window, calls, urlTrace, ownerCalls, desktop, mount, seed, close };
}

function assertCidInputReachable(f, { root }) {
  const input = root.querySelector('#cid-open-input');
  const bar = input.closest('.cid-open-bar');
  const button = root.querySelector('#cid-open-btn');
  const status = root.querySelector('#cid-open-status');
  assert.equal(root.querySelectorAll('#cid-open-input').length, 1);
  assert.equal(f.window.getComputedStyle(bar).display, 'flex');
  for (const control of [input, button, status]) {
    assert.ok(control);
    for (let element = control; element; element = element.parentElement) {
      const style = f.window.getComputedStyle(element);
      assert.equal(element.hidden, false);
      assert.equal(element.classList.contains('hidden'), false, 'CID controls must have no hidden ancestor');
      assert.notEqual(style.display, 'none', 'CID control ancestors must be displayed by the real app CSS');
      assert.notEqual(style.visibility, 'hidden');
      assert.notEqual(style.visibility, 'collapse');
    }
  }
  assert.ok(bar.parentElement === root.querySelector('.content-area'), 'CID controls must be siblings of the hideable grid');
  assert.ok(bar.nextElementSibling === root.querySelector('#video-player'));
  assert.equal(input.disabled, false);
  assert.equal(button.disabled, false);
  input.focus();
  assert.equal(f.window.document.activeElement, input);
  return input;
}

test('fresh app starts without retained media or a backend request', async t => {
  const f = fixture(t); const first = await f.mount();
  assert.equal(first.app.currentVideo, null); assert.equal(first.root.querySelector('#video-element').getAttribute('src'), null);
  assert.equal(first.root.querySelector('.sync-status').style.display, 'none');
  assert.equal(first.root.querySelector('#video-title').textContent, 'No video loaded'); assert.deepEqual(f.calls, []);
});

test('new instance after desktop close retains actual media node, CID, time, metadata and local controls', async t => {
  const f = fixture(t); const first = await f.mount(); const { video, state } = f.seed(first);
  f.close(first);
  const reopened = await f.mount();
  assert.notEqual(reopened.app, first.app); assert.ok(reopened.root.querySelector('#video-element') === video);
  assert.equal(video.dataset.cid, 'actual-fixture-cid'); assert.equal(video.currentTime, 12); assert.equal(video.muted, true); assert.equal(video.volume, 0.35);
  assert.equal(reopened.root.querySelector('#video-title').textContent, 'Retrieved fixture');
  assert.equal(reopened.root.querySelector('#video-desc').textContent, 'Original local metadata');
  assert.equal(reopened.root.querySelector('.sync-status').style.display, 'none');
  assert.equal(reopened.root.querySelector('[data-cid-seek]').value, '40');
  assert.equal(state.paused, false); assert.equal(state.playCalls, 1); assert.deepEqual(f.calls, []);
  reopened.root.querySelector('[data-cid-seek]').value = '50'; reopened.root.querySelector('[data-cid-seek]').onchange();
  assert.equal(video.currentTime, 15); assert.equal(video.dataset.seekState, 'observed');
  assert.match(reopened.root.querySelector('#videos-container').textContent, /actual-fixture-cid/);
});

test('paused playback stays paused after a new window and can use its new Play button', async t => {
  const f = fixture(t); const first = await f.mount(); const { video, state } = f.seed(first, { paused: true });
  f.close(first); const reopened = await f.mount(); assert.equal(state.playCalls, 0); assert.equal(video.paused, true);
  await reopened.root.querySelector('[data-cid-play]').onclick(); assert.equal(state.playCalls, 1); assert.equal(video.paused, false); assert.deepEqual(f.calls, []);
});

for (const [name, options] of [['undecoded', { readyState: 0 }], ['failed', { error: new Error('actual decode failure') }], ['wrong CID', { wrongCid: true }], ['stale decoded CID', { wrongDecodedCid: true }]]) {
  test(`${name} media cannot become retained successful playback`, async t => {
    const f = fixture(t); const first = await f.mount(); const { video } = f.seed(first, options);
    f.close(first); const reopened = await f.mount();
    assert.notEqual(reopened.root.querySelector('#video-element'), video); assert.equal(reopened.app.currentVideo, null); assert.deepEqual(f.calls, []);
  });
}

test('retained node is isolated to its desktop and can only be claimed once', async t => {
  const f = fixture(t); const first = await f.mount(); const { video } = f.seed(first); f.close(first);
  const other = await f.mount({}); assert.equal(other.app.currentVideo, null); other.root.remove();
  const reopened = await f.mount(); assert.ok(reopened.root.querySelector('#video-element') === video);
  const duplicate = await f.mount(); assert.notEqual(duplicate.root.querySelector('#video-element'), video); assert.equal(duplicate.app.currentVideo, null); assert.deepEqual(f.calls, []);
});

test('rebuilding the same interface and repeated close/reopen preserve the same local playback', async t => {
  const f = fixture(t); const first = await f.mount(); const { video } = f.seed(first, { paused: true });
  await first.app.createInterface(first.root); assert.ok(first.root.querySelector('#video-element') === video);
  f.close(first); const second = await f.mount(); f.close(second); const third = await f.mount();
  assert.ok(third.root.querySelector('#video-element') === video); assert.equal(video.currentTime, 12); assert.deepEqual(f.calls, []);
});

test('restoration awaits actual decoder readiness and does not label failed media successful', async t => {
  const f = fixture(t); const first = await f.mount(); const { video, state } = f.seed(first); f.close(first);
  state.readyState = 0; const pending = f.mount();
  await new Promise(resolve => setTimeout(resolve, 0)); state.error = new Error('decoded media is no longer usable');
  video.dispatchEvent(new f.window.Event('error'));
  await assert.rejects(pending, /could not be decoded/); assert.deepEqual(f.calls, []);
  assert.deepEqual(f.urlTrace, [['revoke', 'blob:http://authored.invalid/retrieved-media']]);
  assert.equal(first.app.currentObjectUrl, null); assert.equal(video.dataset.decodedCid, undefined);
  assert.equal(video.getAttribute('src'), null); assert.equal(f.App.retainedPlayback.has(f.desktop), false);
});

test('new controls update only the new workflow and library state after media transfer', async t => {
  const f = fixture(t); const first = await f.mount(); const { video } = f.seed(first, { paused: true });
  Object.defineProperty(video, 'textTracks', { configurable: true, value: [{ mode: 'disabled' }] });
  first.app.vdaG036.log.push('old-instance-marker');
  const oldWorkflow = first.app.vdaG036; const oldEntry = first.app.currentVideo;
  f.close(first); const reopened = await f.mount();
  assert.notEqual(reopened.app.vdaG036, oldWorkflow); assert.notEqual(reopened.app.vdaG036.log, oldWorkflow.log);
  reopened.root.querySelector('[data-svd-workflow-action="toggle-captions"]').click();
  assert.equal(reopened.app.vdaG036.captionState, 'showing-local'); assert.equal(oldWorkflow.captionState, 'available-local');
  reopened.root.querySelector('[data-svd-workflow-action="recover-buffering"]').click();
  assert.match(reopened.app.vdaG036.bufferInfo, /readyState=current-data/); assert.equal(oldWorkflow.bufferInfo, 'No playback session yet.');
  assert.equal(oldWorkflow.log.length, 1); assert.equal(reopened.app.vdaG036.log.length, 3);
  reopened.root.querySelector('#like-btn').click();
  assert.equal(reopened.app.currentVideo.liked, true); assert.equal(oldEntry.liked, undefined);
  assert.equal(reopened.app.videoLibrary.get('local-fixture'), reopened.app.currentVideo);
  assert.equal(JSON.parse(f.window.localStorage.getItem('peertube-library'))[0].liked, true);
  const oldMessages = []; const newMessages = [];
  first.app.setCidOpenStatus = text => oldMessages.push(text); reopened.app.setCidOpenStatus = text => newMessages.push(text);
  video.play = async () => { throw new Error('authored play refusal'); };
  await reopened.root.querySelector('[data-cid-play]').onclick();
  assert.deepEqual(oldMessages, []); assert.deepEqual(newMessages, ['Play blocked: authored play refusal']);
  assert.deepEqual(f.calls, []);
});

test('object URL ownership transfers once without creating or revoking the retained media', async t => {
  const f = fixture(t); const first = await f.mount(); const { video } = f.seed(first, { paused: true });
  const originalUrl = first.app.currentObjectUrl; f.close(first);
  assert.equal(f.App.retainedPlayback.has(f.desktop), true);
  const reopened = await f.mount();
  assert.equal(first.app.currentObjectUrl, null); assert.equal(reopened.app.currentObjectUrl, originalUrl);
  assert.equal(video.src, originalUrl); assert.equal(video.dataset.decodedCid, reopened.app.currentVideo.cid);
  assert.equal(f.App.retainedPlayback.has(f.desktop), false); assert.deepEqual(f.urlTrace, []);
  assert.equal(f.window.localStorage.getItem('peertube-library').includes('blob:'), false);
  f.close(reopened); first.app.cleanup();
  assert.equal(f.App.retainedPlayback.get(f.desktop).owner, reopened.app, 'late old cleanup cannot erase new ownership');
  const third = await f.mount(); assert.equal(third.app.currentObjectUrl, originalUrl); assert.equal(reopened.app.currentObjectUrl, null);
  assert.deepEqual(f.urlTrace, []); assert.deepEqual(f.calls, []);
});

for (const flag of ['cidOpenPending', 'libraryPlaybackPending']) test(`in-flight ${flag} refuses handoff to avoid old asynchronous source mutation`, async t => {
  const f = fixture(t); const first = await f.mount(); const { video } = f.seed(first, { paused: true });
  first.app[flag] = true; f.close(first); const reopened = await f.mount();
  assert.ok(reopened.root.querySelector('#video-element') !== video); assert.equal(reopened.app.currentVideo, null);
  assert.equal(f.App.retainedPlayback.has(f.desktop), false); assert.deepEqual(f.calls, []);
});


test('actual desktop Close captures playback before its direct DOM removal', async t => {
  const f = fixture(t); const first = await f.mount(f.desktop, true);
  const { video, state } = f.seed(first);
  first.shell.querySelector('.window-control.close').click();
  assert.equal(first.shell.isConnected, false); assert.equal(f.desktop.windows.size, 0);
  const reopened = await f.mount(f.desktop, true);
  assert.ok(reopened.root.querySelector('#video-element') === video, 'native close must retain the decoded media element');
  assert.equal(reopened.app.currentVideo.cid, 'actual-fixture-cid');
  assert.equal(video.currentTime, 12); assert.equal(state.paused, false);
  assert.equal(reopened.root.querySelector('#video-title').textContent, 'Retrieved fixture');
  assert.deepEqual(f.calls, []);
});

test('mobile Browse keeps navigation reachable and returns to playback after selection', async t => {
  const f = fixture(t); const first = await f.mount();
  const button = first.root.querySelector('[data-mobile-browse]');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  button.click(); assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(first.root.querySelector('.peertube-container').classList.contains('navigation-open'), true);
  first.root.querySelector('[data-view="home"]').click();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(first.root.querySelector('.peertube-container').classList.contains('navigation-open'), false);
  assert.equal(first.root.querySelectorAll('[data-category]').length > 0, true);
  assert.deepEqual(f.calls, []);
});

test('fresh CID controls are visible outside the video grid under actual app styles', async t => {
  const f = fixture(t); const first = await f.mount(f.desktop, true);
  const input = assertCidInputReachable(f, first);
  input.value = 'authored-next-cid';
  assert.equal(input.value, 'authored-next-cid');
  assert.deepEqual(f.calls, []); assert.deepEqual(f.ownerCalls, []);
});

test('actual desktop close and restored or failed playback keep the CID recovery input visible', async t => {
  const f = fixture(t, { ownerFailure: 'Authored missing artifact; no backend was called' });
  const first = await f.mount(f.desktop, true); const { video } = f.seed(first);
  first.shell.querySelector('.window-control.close').click();
  assert.equal(first.shell.isConnected, false);
  const reopened = await f.mount(f.desktop, true);
  assert.equal(reopened.root.querySelector('#video-element'), video);
  assert.equal(f.window.getComputedStyle(reopened.root.querySelector('#video-grid')).display, 'none');
  const input = assertCidInputReachable(f, reopened);
  input.value = 'authored-unavailable-cid';
  await reopened.app.openVideoByCid(input.value, reopened.root.querySelector('#cid-open-btn'));
  assert.equal(f.ownerCalls.length, 1);
  assert.equal(f.ownerCalls[0][0], reopened.root);
  assert.equal(f.ownerCalls[0][1], 'peertube');
  assert.equal(f.ownerCalls[0][2], 'peertube.ipfs_kit_py.retrieve_content');
  assert.equal(f.ownerCalls[0][3].toolId, 'ipfs_cat');
  assert.equal(f.ownerCalls[0][3].payload.cid, 'authored-unavailable-cid');
  assert.equal(reopened.root.querySelector('#cid-open-status').dataset.retrievalState, 'failed');
  assert.match(reopened.root.querySelector('#cid-open-status').textContent, /Authored missing artifact/);
  assert.equal(f.window.getComputedStyle(reopened.root.querySelector('#video-grid')).display, 'none');
  assert.equal(assertCidInputReachable(f, reopened), input);
  assert.deepEqual(f.calls, []);
});

test('mobile CID input retains its complete editable value and full status wraps inside the pane', async t => {
  const f = fixture(t, { viewportWidth: 390 }); const first = await f.mount(f.desktop, true);
  const cid = 'bafkreiedh65a7kpxnldwlbhv4hszsqyld2l4gg3ybe4jq77dp2tnyzuhla';
  const input = assertCidInputReachable(f, first); input.value = cid;
  const status = first.root.querySelector('#cid-open-status'); first.app.setCidOpenStatus('Opened ' + cid);
  assert.equal(input.value, cid); input.setSelectionRange(0, 0); assert.equal(input.selectionStart, 0);
  input.setSelectionRange(cid.length, cid.length); assert.equal(input.selectionStart, cid.length);
  assert.equal(status.textContent, 'Opened ' + cid);
  const inputStyle = f.window.getComputedStyle(input), statusStyle = f.window.getComputedStyle(status);
  assert.equal(Number.parseFloat(inputStyle.minWidth), 0); assert.equal(inputStyle.maxWidth, '100%'); assert.equal(inputStyle.boxSizing, 'border-box');
  assert.equal(statusStyle.whiteSpace, 'normal'); assert.equal(statusStyle.overflowWrap, 'anywhere');
  assert.equal(statusStyle.flexBasis, '100%'); assert.equal(statusStyle.maxWidth, '100%');
  assert.equal(f.window.getComputedStyle(input.closest('.cid-open-bar')).flexWrap, 'wrap');
  assert.equal(input.getAttribute('aria-describedby'), status.id); assert.equal(status.getAttribute('role'), 'status');
  assert.deepEqual(f.calls, []); assert.deepEqual(f.ownerCalls, []);
});

test('custom Play and Pause names follow actual media events and control the same video', async t => {
  const f = fixture(t); const first = await f.mount(); const { video, state } = f.seed(first, { paused: true });
  const button = first.root.querySelector('[data-cid-play]');
  assert.equal(button.disabled, false); assert.equal(button.textContent, 'Play'); assert.equal(button.getAttribute('aria-label'), 'Play retrieved video');
  await button.onclick(); assert.equal(state.playCalls, 1); assert.equal(video.paused, false);
  assert.equal(button.textContent, 'Pause'); assert.equal(button.getAttribute('aria-label'), 'Pause retrieved video');
  await button.onclick(); assert.equal(video.paused, true); assert.equal(state.playCalls, 1); assert.equal(button.textContent, 'Play');
  await video.play(); assert.equal(button.textContent, 'Pause');
  video.pause(); assert.equal(button.textContent, 'Play');
  state.ended = true; state.paused = false; video.dispatchEvent(new f.window.Event('ended'));
  assert.equal(button.textContent, 'Play'); assert.deepEqual(f.calls, []);
});

test('time readout, seek position and accessible value use observed media time and seeked events', async t => {
  const f = fixture(t); const first = await f.mount(); const { video, state } = f.seed(first, { paused: true });
  const seek = first.root.querySelector('[data-cid-seek]'), clock = first.root.querySelector('[data-cid-time]');
  assert.ok(clock, 'retrieved playback must expose its observed elapsed time and duration');
  assert.equal(clock.textContent, '0:12.0 / 0:30.0'); assert.equal(seek.getAttribute('aria-valuetext'), '0:12.0 of 0:30.0');
  state.currentTime = 17.25; video.dispatchEvent(new f.window.Event('timeupdate'));
  assert.equal(clock.textContent, '0:17.2 / 0:30.0'); assert.ok(Math.abs(Number(seek.value) - 57.5) < 1e-9);
  seek.value = '50'; seek.onchange();
  assert.equal(state.currentTime, 15); assert.equal(video.dataset.seekState, 'observed');
  assert.equal(clock.textContent, '0:15.0 / 0:30.0'); assert.equal(seek.getAttribute('aria-valuetext'), '0:15.0 of 0:30.0');
  state.duration = NaN; video.dispatchEvent(new f.window.Event('durationchange'));
  assert.equal(clock.textContent, '0:15.0 / —'); assert.equal(seek.disabled, true);
  assert.equal(seek.getAttribute('aria-valuetext'), 'Playback time unavailable'); assert.deepEqual(f.calls, []);
});

test('native Close transfers event-driven controls once and leaves old window controls detached', async t => {
  const f = fixture(t); const first = await f.mount(f.desktop, true); const { video, state } = f.seed(first);
  const oldPlay = first.root.querySelector('[data-cid-play]'), oldClock = first.root.querySelector('[data-cid-time]');
  assert.equal(oldPlay.textContent, 'Pause');
  first.shell.querySelector('.window-control.close').click();
  assert.equal(oldPlay.textContent, 'Play'); assert.equal(oldPlay.onclick, null);
  const oldTime = oldClock.textContent; const reopened = await f.mount(f.desktop, true);
  const button = reopened.root.querySelector('[data-cid-play]'), clock = reopened.root.querySelector('[data-cid-time]');
  assert.ok(reopened.root.querySelector('#video-element') === video); assert.equal(button.textContent, 'Pause');
  state.currentTime = 21; video.dispatchEvent(new f.window.Event('timeupdate'));
  assert.equal(clock.textContent, '0:21.0 / 0:30.0'); assert.equal(oldClock.textContent, oldTime); assert.equal(oldPlay.textContent, 'Play');
  await button.onclick(); assert.equal(video.paused, true); assert.equal(button.textContent, 'Play');
  assert.deepEqual(f.calls, []); assert.deepEqual(f.urlTrace, []);
});

test('fresh unknown or failed media never receives invented duration or enabled playback controls', async t => {
  const f = fixture(t); const first = await f.mount();
  const button = first.root.querySelector('[data-cid-play]'), seek = first.root.querySelector('[data-cid-seek]');
  assert.equal(button.disabled, true); assert.equal(seek.disabled, true);
  assert.match(first.root.querySelector('[data-cid-time]').textContent, /\/ —$/);
  const { video, state } = f.seed(first, { paused: true });
  state.error = new Error('Authored decoder failure'); video.dispatchEvent(new f.window.Event('error'));
  assert.equal(button.disabled, true); assert.equal(seek.disabled, true); assert.equal(button.textContent, 'Play');
  assert.deepEqual(f.calls, []);
});

function assertCompactFailure(f, root) {
  assert.equal(root.querySelector('#video-player').classList.contains('media-failed'), true);
  const media = root.querySelector('.player-container'), style = f.window.getComputedStyle(media);
  assert.equal(style.height, '120px'); assert.equal(style.minHeight, '120px'); assert.equal(style.maxHeight, '120px');
  assert.equal(style.aspectRatio, 'auto');
  assert.equal(root.querySelector('#video-element').controls, true, 'native media controls must remain present');
  for (const selector of ['#cid-open-input', '#cid-open-btn', '[data-cid-play]', '[data-cid-seek]', '[data-cid-time]']) {
    const control = root.querySelector(selector); assert.ok(control, selector + ' must remain present');
    for (let element = control; element; element = element.parentElement) {
      assert.equal(element.hidden, false); assert.equal(element.classList.contains('hidden'), false);
      const current = f.window.getComputedStyle(element);
      assert.notEqual(current.display, 'none'); assert.notEqual(current.visibility, 'hidden'); assert.notEqual(current.visibility, 'collapse');
    }
  }
  assert.equal(root.querySelector('[data-cid-play]').disabled, true);
  assert.equal(root.querySelector('[data-cid-seek]').disabled, true);
  assert.equal(root.querySelector('#cid-open-input').disabled, false);
  assert.equal(root.querySelector('#cid-open-btn').disabled, false);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}x${viewport.height} retrieval failure compacts only the empty media area and retains disabled controls plus retry`, async t => {
    const f = fixture(t, { ownerFailure: 'Authored unavailable source; no backend called', viewportWidth: viewport.width, viewportHeight: viewport.height });
    const first = await f.mount(f.desktop, true); const { video, state } = f.seed(first, { paused: true });
    assert.equal(first.root.querySelector('#video-player').classList.contains('media-failed'), false);
    video.load = () => { state.readyState = 0; state.duration = NaN; state.paused = true; video.dispatchEvent(new f.window.Event('emptied')); };
    await first.app.openVideoByCid('authored-unavailable-cid', first.root.querySelector('#cid-open-btn'));
    assertCompactFailure(f, first.root);
    assert.equal(first.root.querySelector('#cid-open-status').dataset.retrievalState, 'failed');
    assert.match(first.root.querySelector('#cid-open-status').textContent, /Authored unavailable source/);
    const retry = first.app.openVideoByCid('authored-retry-cid', first.root.querySelector('#cid-open-btn'));
    assert.equal(first.root.querySelector('#cid-open-status').dataset.retrievalState, 'loading');
    assert.equal(first.root.querySelector('#video-player').classList.contains('media-failed'), true, 'starting another read must not claim decoded recovery');
    await retry; assertCompactFailure(f, first.root);
    assert.equal(f.ownerCalls.length, 2); assert.equal(f.ownerCalls[1][3].payload.cid, 'authored-retry-cid');
    assert.deepEqual(f.calls, []);
  });
}

test('decoder error compacts the media area until an actual ready loadeddata event restores normal layout', async t => {
  const f = fixture(t, { viewportWidth: 1440, viewportHeight: 900 }); const first = await f.mount(f.desktop, true);
  const { video, state } = f.seed(first, { paused: true }); const player = first.root.querySelector('#video-player');
  state.error = new Error('Authored decode failure'); video.dispatchEvent(new f.window.Event('error'));
  assertCompactFailure(f, first.root);
  state.error = null; state.readyState = 1; video.dispatchEvent(new f.window.Event('loadedmetadata'));
  assert.equal(player.classList.contains('media-failed'), true);
  assert.equal(first.root.querySelector('[data-cid-play]').disabled, true);
  state.readyState = 2; video.dispatchEvent(new f.window.Event('timeupdate'));
  assert.equal(player.classList.contains('media-failed'), true, 'an unrelated playback event cannot assert successful decoding');
  video.dispatchEvent(new f.window.Event('loadeddata'));
  assert.equal(player.classList.contains('media-failed'), false);
  assert.notEqual(f.window.getComputedStyle(first.root.querySelector('.player-container')).maxHeight, '120px');
  assert.equal(first.root.querySelector('[data-cid-play]').disabled, false);
  assert.equal(first.root.querySelector('[data-cid-seek]').disabled, false);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.ownerCalls, []);
});

test('a retained node that actually fails decoding reopens into the same compact error layout', async t => {
  const f = fixture(t, { viewportWidth: 1440, viewportHeight: 900 }); const first = await f.mount(f.desktop, true);
  const { video, state } = f.seed(first, { paused: true });
  first.shell.querySelector('.window-control.close').click(); state.readyState = 0;
  const pending = f.mount(f.desktop, true);
  await new Promise(resolve => setTimeout(resolve, 0)); state.error = new Error('Authored retained decode failure');
  video.dispatchEvent(new f.window.Event('error')); await assert.rejects(pending, /could not be decoded/);
  const root = f.window.document.querySelector('.window[data-app-id="peertube"]');
  assertCompactFailure(f, root); assert.equal(video.getAttribute('src'), null);
  assert.deepEqual(f.calls, []);
});

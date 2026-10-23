import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

let sequence = 0;
async function fixture(t) {
  const keys = ['window', 'document', 'localStorage', 'MutationObserver', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window({ url: 'http://localhost' });
  let requests = 0;
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage,
    MutationObserver: window.MutationObserver, fetch: () => { requests++; throw new Error('Local melody must not request a backend'); } });
  const { GrandmaStrudelDAW } = await import(`../../web/js/apps/strudel-grandma.js?controls=${++sequence}`);
  const app = new GrandmaStrudelDAW();
  const host = document.createElement('section'); host.className = 'window';
  host.innerHTML = '<div class="window-content"></div>'; document.body.append(host);
  const content = host.firstElementChild;
  app.container = content; app.createSimpleInterface(content); app.loadDemoSongs(); app.connectButtons();
  app.setupWindowCleanup(content); app.startTutorial();
  t.after(() => {
    app.cleanup(); window.happyDOM.abort();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const chooseCreation = () => content.querySelector('[data-song-id="my-creation"] button').click();
  return { app, host, content, chooseCreation, window, requests: () => requests };
}

test('My Creation opens a usable local melody without replacing the original song controls', async t => {
  const f = await fixture(t); f.chooseCreation();
  assert.ok(f.content.querySelector('[data-local-creation]'));
  assert.equal(f.content.querySelectorAll('.song-card').length, 2);
  assert.equal(f.content.querySelector('#play-button').disabled, false);
  assert.equal(f.app.state.currentSong.type, 'creation');
  assert.deepEqual(await f.app.getEnhancedSongData(f.app.state.currentSong), {
    pattern: 'c4 e4 g4 c5', tempo: 120, description: 'Local user melody', isRealMusic: false,
  });
  assert.equal(f.requests(), 0);
});

test('Apply uses the edited notes and tempo in the real audio scheduling path, and Stop stops them', async t => {
  const f = await fixture(t); f.chooseCreation();
  f.content.querySelector('#creation-pattern').value = ' C0   Eb4 G4 ';
  f.content.querySelector('#creation-tempo').value = '90';
  f.content.querySelector('#apply-creation').click();
  const scheduled = [], stopped = [];
  f.app.audio = { isSetup: true, gain: {}, context: { currentTime: 10, state: 'running',
    createOscillator: () => ({ connect() {}, disconnect() {}, frequency: { setValueAtTime: value => scheduled.push(value) },
      start() {}, stop: time => stopped.push(time) }),
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
    close() { this.state = 'closed'; },
  } };
  f.content.querySelector('#play-button').click();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(scheduled, [261.63 / 16, 311.13, 392]);
  assert.equal(f.app.state.isPlaying, true);
  assert.equal(f.content.querySelector('#stop-button').disabled, false);
  f.content.querySelector('#stop-button').click();
  assert.equal(f.app.state.isPlaying, false); assert.equal(f.app.currentOscillators.length, 0);
  assert.ok(stopped.includes(undefined), 'Stop must stop active audio nodes');
  assert.equal(f.requests(), 0);
});

test('invalid notes, unsupported accidentals and out-of-range tempo retain the last valid melody', async t => {
  const f = await fixture(t); f.chooseCreation();
  const initial = { ...f.app.state.currentSong };
  for (const [notes, tempo] of [['c4 nope', '120'], ['e#4', '120'], ['c4', '0'], ['c4', '241'], [Array(65).fill('c4').join(' '), '120']]) {
    f.content.querySelector('#creation-pattern').value = notes;
    f.content.querySelector('#creation-tempo').value = tempo;
    f.content.querySelector('#apply-creation').click();
    assert.match(f.content.querySelector('[data-creation-status]').textContent, /Use 1–64 notes/);
    assert.deepEqual(f.app.state.currentSong, initial);
  }
});

test('return and the original playback selection keep working after editing a melody', async t => {
  const f = await fixture(t); f.chooseCreation();
  f.content.querySelector('#return-to-songs').click();
  assert.equal(f.content.querySelector('[data-local-creation]'), null);
  f.chooseCreation(); f.content.querySelector('[data-song-id="playing-god"] button').click();
  assert.equal(f.content.querySelector('[data-local-creation]'), null);
  assert.equal(f.app.state.currentSong.id, 'playing-god'); assert.equal(f.requests(), 0);
});

test('tutorial Next and Skip bind to the mounted instance without the legacy global', async t => {
  const f = await fixture(t); assert.equal(f.window.strudelDAW, undefined);
  f.content.querySelector('.tip-next').click(); assert.equal(f.app.help.currentStep, 1);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(f.content.querySelector('.tip-text').textContent, f.app.help.steps[1]);
  f.content.querySelector('.tip-skip').click();
  assert.equal(f.app.help.isActive, false); assert.equal(f.content.querySelector('#tutorial-tip').style.display, 'none');
});

test('closing the owning window disposes audio and pending tutorial work without affecting a new mount', async t => {
  const f = await fixture(t); let closed = 0;
  f.chooseCreation(); f.app.state.isPlaying = true;
  f.app.audio.context = { state: 'running', close() { closed++; this.state = 'closed'; } };
  f.content.querySelector('.tip-next').click(); f.host.remove();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.app.disposed, true); assert.equal(closed, 1); assert.equal(f.app.help.isActive, false);
  assert.equal(f.app.state.isPlaying, false);
  f.app.onDestroy(); assert.equal(closed, 1, 'cleanup is idempotent');
  const next = document.createElement('div'); next.innerHTML = '<div id="tutorial-tip">New window</div>'; document.body.append(next);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(next.textContent, 'New window');
});

test('a synchronous connected window move does not dispose the live editor', async t => {
  const f = await fixture(t); const other = document.createElement('div'); document.body.append(other);
  other.append(f.host); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.app.disposed, false); f.chooseCreation(); assert.ok(f.content.querySelector('[data-local-creation]'));
});

test('a pending song-data read cannot start audio after its owning window closes', async t => {
  const f = await fixture(t); f.chooseCreation(); let complete;
  f.app.getEnhancedSongData = () => new Promise(resolve => { complete = resolve; });
  let scheduled = 0; f.app.startEnhancedFallbackAudio = () => { scheduled++; };
  f.app.state.isPlaying = true; const pending = f.app.startRealAudioPlayback();
  f.app.onDestroy(); complete({ pattern: 'c4', tempo: 120, isRealMusic: false }); await pending;
  assert.equal(scheduled, 0);
});

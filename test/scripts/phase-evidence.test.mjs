// Authored DOM observers only; these tests grant no actual-browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { PHASES, PHASE_EVIDENCE_SCHEMA, canonicalJSON, phaseEvidenceSelectors, readPhaseElement,
  beginPhaseStepEvidence, executeScenarioPhase, validatePhaseEvidence, assembleWorkflowReport,
} from '../../scripts/run-visual-functional-workflow.mjs';

const CID = 'bafkreiedh65a7kpxnldwlbhv4hszsqyld2l4gg3ybe4jq77dp2tnyzuhla';
const app = { app_id: 'media-unit', backend_roles: [], primary_workflow: {
  expected_results: ['Native playback advances after range input'], persist_reopen: 'Restored media CID',
  error: 'Observed retrieval failure', recovery: 'Choose supported source and resume',
} };
const mediaAssert = id => ({ op: 'assert', requirement_id: id,
  probe: { kind: 'media_state', selector: '#video', pointer: '/current_time', temporal_ms: 250 }, operator: 'at_least', expected: 0.05 });
const scenario = { schema: 'swissknife.visual-functional-scenario.v1', app_id: app.app_id, phases: {
  primary_result: [{ op: 'fill', selector: '#cid', value: CID }, { op: 'click', selector: '#open' },
    { op: 'press', selector: '#seek', key: 'ArrowRight' }, mediaAssert('result_1')],
  persist_reopen: [{ op: 'reopen_app' }, { op: 'assert', requirement_id: 'persist_reopen',
    probe: { kind: 'text', selector: '#status' }, operator: 'contains', expected: CID }],
  failure_recovery: [{ op: 'fill', selector: '#cid', value: 'unavailable-source' }, { op: 'click', selector: '#open' },
    { op: 'assert', checkpoint_id: 'error_observed', probe: { kind: 'text', selector: '#status' }, operator: 'contains', expected: 'Open failed' },
    { op: 'fill', selector: '#cid', value: CID }, { op: 'click', selector: '#open' },
    { op: 'press', selector: '#play', key: 'Enter' }, mediaAssert('failure_recovery')],
} };
const clone = value => structuredClone(value);

function dom(t, options = {}) {
  const view = new Window({ url: 'https://unit.invalid/' }), document = view.document;
  t.after(() => view.happyDOM.abort());
  // Explicit DOM unit driver supplies media state through prototype getters.
  // It has no decoder, trusted event, or actual-browser acceptance authority.
  const states = new WeakMap();
  for (const key of ['currentTime', 'duration', 'readyState', 'currentSrc', 'paused', 'ended', 'seeking'])
    Object.defineProperty(view.HTMLMediaElement.prototype, key, { configurable: true,
      get() { return states.get(this)?.[key] ?? (key === 'currentSrc' ? '' : 0); },
      set(value) { if (!states.has(this)) states.set(this, {}); states.get(this)[key] = value; } });
  for (const [key, value] of [['videoWidth', 320], ['videoHeight', 180]])
    Object.defineProperty(view.HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
  const rect = { left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180 };
  let current, video = document.createElement('video'), generation = 1;
  const set = (key, value) => Object.getOwnPropertyDescriptor(view.HTMLMediaElement.prototype, key).set.call(video, value);
  for (const [key, value] of Object.entries({ currentTime: 2, duration: 60, readyState: 4, currentSrc: 'blob:https://unit.invalid/decoded', paused: false, ended: false, seeking: false })) set(key, value);
  video.id = 'video'; video.dataset.decodedCid = CID; video.getBoundingClientRect = () => rect;
  const render = () => {
    current = document.createElement('section'); current.className = 'window'; current.getBoundingClientRect = () => rect;
    current.innerHTML = '<main><input id="cid"><button id="open">Open</button><button id="play">Play</button><input id="seek" type="range" min="0" max="60" step="1" value="2"><p id="status"></p></main>';
    for (const element of current.querySelectorAll('*')) element.getBoundingClientRect = () => rect;
    current.querySelector('main').prepend(video); document.body.append(current);
    current.querySelector('#status').textContent = CID;
    current.querySelector('#seek').onkeydown = () => {
      set('currentTime', video.currentTime + 5); current.querySelector('#seek').value = String(video.currentTime);
      video.dispatchEvent(new view.Event('seeked')); // untrusted event stays false
    };
    current.querySelector('#open').onclick = () => {
      const good = current.querySelector('#cid').value === CID;
      current.querySelector('#status').textContent = good ? CID : 'Open failed: unavailable source';
      set('readyState', good ? 4 : 0); set('currentSrc', good ? 'blob:https://unit.invalid/decoded' : '');
      video.dataset.decodedCid = good ? CID : ''; set('paused', !good);
      current.querySelector('#play').disabled = !good; current.querySelector('#seek').disabled = !good;
    };
    current.querySelector('#play').onkeydown = () => set('paused', false);
  };
  render();
  class Handle {
    constructor(value) { this.value = value; this.disposed = false; }
    async evaluate(fn, argument) { return fn(this.value, argument instanceof Handle ? argument.value : argument); }
    async evaluateHandle(fn, argument) { return new Handle(await this.evaluate(fn, argument)); }
    async dispose() { this.disposed = true; }
  }
  class Locator {
    constructor(resolve) { this.resolve = resolve; }
    one() { assert.equal(this.resolve().length, 1); return this.resolve()[0]; }
    locator(css) { return new Locator(() => this.resolve().flatMap(element => [...element.querySelectorAll(css)])); }
    async count() { return this.resolve().length; }
    async elementHandle() { return new Handle(this.one()); }
    async evaluate(fn, argument) { return fn(this.one(), argument); }
    async scrollIntoViewIfNeeded() {}
    async focus() { this.one().focus(); }
    async fill(value) { this.one().value = value; this.one().dispatchEvent(new view.Event('input', { bubbles: true })); }
    async click() { this.one().click(); }
    async press(key) { this.one().dispatchEvent(new view.KeyboardEvent('keydown', { key, bubbles: true })); }
  }
  const session = { app, scenario: clone(scenario), generation, actual_desktop: false, phase_evidence_started: performance.now(),
    phase_evidence: { schema: PHASE_EVIDENCE_SCHEMA, phases: [] }, temporal_observations: [], semantic_assertions: [], checkpoints: [], keyboard_focus_observations: [],
    primary: new Locator(() => [current.querySelector('main')]), window: new Locator(() => [current]),
    assertActive: async () => assert.ok(current.isConnected),
    page: { async waitForTimeout(milliseconds) { if (!video.paused && video.readyState >= 2) set('currentTime', video.currentTime + milliseconds / 1000); } },
    async reopen() {
      const old = current; video.remove(); old.remove();
      if (options.newMedia) { const replacement = video.cloneNode(); states.set(replacement, { ...states.get(video) }); Object.assign(replacement, { getBoundingClientRect: () => rect }); video = replacement; }
      render(); session.generation += 1;
    },
  };
  return { view, document, session, video, set, get current() { return current; }, Handle };
}

async function complete(t, options) {
  const fixture = dom(t, options);
  for (const phase of PHASES) await executeScenarioPhase(fixture.session, phase, fixture.session.scenario.phases[phase]);
  const child = { phase_evidence: fixture.session.phase_evidence, semantic_assertions: fixture.session.semantic_assertions,
    error_observations: fixture.session.checkpoints, temporal_observations: fixture.session.temporal_observations };
  validatePhaseEvidence(child, fixture.session.scenario);
  return { ...fixture, child };
}

test('V2 retains actual action order, native range events, reopen identity and error/retry controls', async t => {
  const f = await complete(t), [primary, reopen, recovery] = f.child.phase_evidence.phases;
  assert.equal(primary.steps.length, scenario.phases.primary_result.length);
  assert.deepEqual(primary.steps.map(row => row.step), scenario.phases.primary_result);
  const seek = primary.steps[2]; assert.equal(seek.controls[0].before.value_as_number, 2);
  assert.equal(seek.controls[0].after.value_as_number, 7);
  assert.equal(seek.media[0].before.current_time, 2); assert.equal(seek.media[0].after.current_time, 7);
  assert.deepEqual(seek.media[0].seeked_events, [{ current_time: 7, is_trusted: false }]);
  assert.equal(reopen.steps[0].media[0].same_element, true);
  assert.deepEqual(reopen.steps[0].reopen, { old_window_disconnected: true });
  assert.equal(reopen.generation_before, 1); assert.equal(reopen.generation_after, 2);
  const error = recovery.steps[2];
  assert.equal(error.observed.actual, 'Open failed: unavailable source');
  assert.equal(error.controls.find(row => row.selector === '#cid').after.enabled, true);
  assert.equal(error.controls.find(row => row.selector === '#play').after.enabled, false);
  assert.equal(error.media[0].after.ready_state, 0); assert.equal(error.media[0].after.decoded_cid, null);
  assert.equal(recovery.steps[3].controls.find(row => row.selector === '#cid').after.value, CID);
  assert.equal(recovery.steps[4].controls.find(row => row.selector === '#cid').before.value, CID);
  assert.equal(recovery.steps.at(-1).temporal_samples.length, 1);
  assert.ok(Buffer.byteLength(canonicalJSON(f.child.phase_evidence)) < 131072);
  if (process.env.SVF_PHASE_EVIDENCE_FIXTURE) fs.writeFileSync(process.env.SVF_PHASE_EVIDENCE_FIXTURE,
    JSON.stringify({ scenario: f.session.scenario, child: f.child }, null, 2) + '\n');
});

test('supplemental native getters ignore application shadow media properties', async t => {
  const f = dom(t); Object.defineProperty(f.video, 'currentTime', { value: 999 });
  const value = readPhaseElement(f.video, true); assert.equal(value.current_time, 2);
});

test('a newly decoded media element is retained as a measured identity difference', async t => {
  const f = await complete(t, { newMedia: true });
  const media = f.child.phase_evidence.phases[1].steps[0].media[0];
  assert.equal(media.same_element, false); assert.equal(media.before.decoded_cid, media.after.decoded_cid);
});

test('controls reflect hidden ancestors, disabled state and missing declarations', async t => {
  const f = dom(t); f.current.querySelector('main').style.display = 'none';
  assert.equal(readPhaseElement(f.current.querySelector('#cid'), false).visible, false);
  f.session.scenario.phases.primary_result.splice(0, 0, { op: 'click', selector: '#not-present' });
  const side = await beginPhaseStepEvidence(f.session, 'failure_recovery', f.session.scenario.phases.failure_recovery[2], 2);
  const row = await side.finish({ operator: 'contains', actual: 'Open failed', expected: 'Open failed' });
  const absent = row.controls.find(item => item.selector === '#not-present');
  assert.equal(absent.after.present, false); assert.equal(absent.after.value, null);
});

test('password and private subtree values are refused before observing them', async t => {
  const f = dom(t), input = f.current.querySelector('#cid'); input.type = 'password';
  assert.throws(() => readPhaseElement(input, false), /SECRET_OBSERVATION_BLOCKED/);
  input.type = 'text'; input.parentElement.dataset.secret = 'yes';
  assert.throws(() => readPhaseElement(input, false), /SECRET_OBSERVATION_BLOCKED/);
  delete input.parentElement.dataset.secret; input.setAttribute('name', 'api_key');
  assert.throws(() => readPhaseElement(input, false), /SECRET_OBSERVATION_BLOCKED/);
});

test('viewport and scroll clipping prevent offscreen controls from claiming visibility', async t => {
  const f = dom(t), input = f.current.querySelector('#cid'), parent = input.parentElement;
  input.getBoundingClientRect = () => ({ left: 2000, top: 0, right: 2100, bottom: 40, width: 100, height: 40 });
  assert.equal(readPhaseElement(input, false).visible, false);
  input.getBoundingClientRect = () => ({ left: 10, top: 200, right: 110, bottom: 240, width: 100, height: 40 });
  parent.style.overflow = 'hidden';
  assert.equal(readPhaseElement(input, false).visible, false);
  input.getBoundingClientRect = () => ({ left: 10, top: 160, right: 110, bottom: 200, width: 100, height: 40 });
  assert.equal(readPhaseElement(input, false).visible, true); // partial actual intersection
  parent.style.visibility = 'hidden'; assert.equal(readPhaseElement(input, false).visible, false);
});

test('file and hidden controls expose availability without retaining their private value', async t => {
  const f = dom(t), input = f.current.querySelector('#cid');
  input.type = 'hidden'; input.value = 'private-hidden-value';
  assert.equal(readPhaseElement(input, false).value, null); assert.equal(readPhaseElement(input, false).value_as_number, null);
  input.type = 'file';
  assert.equal(readPhaseElement(input, false).value, null); assert.equal(readPhaseElement(input, false).value_as_number, null);
});

test('a declared range without a native seek event is retained without invented proof', async t => {
  const f = dom(t); f.current.querySelector('#seek').onkeydown = () => {};
  const side = await beginPhaseStepEvidence(f.session, 'primary_result', scenario.phases.primary_result[2], 2);
  const row = await side.finish(); assert.deepEqual(row.media[0].seeked_events, []);
  assert.equal(row.media[0].before.current_time, 2); assert.equal(row.media[0].after.current_time, 2.5);
});

test('observers detach native event listeners after completion and aborted actions', async t => {
  const f = dom(t); let added = 0, removed = 0;
  const add = f.video.addEventListener.bind(f.video), remove = f.video.removeEventListener.bind(f.video);
  f.video.addEventListener = (...args) => { if (args[0] === 'seeked') added++; return add(...args); };
  f.video.removeEventListener = (...args) => { if (args[0] === 'seeked') removed++; return remove(...args); };
  const first = await beginPhaseStepEvidence(f.session, 'primary_result', scenario.phases.primary_result[2], 2); await first.finish(); await first.abort();
  const second = await beginPhaseStepEvidence(f.session, 'primary_result', scenario.phases.primary_result[2], 2); await second.abort();
  assert.equal(added, 2); assert.equal(removed, 2);
});

test('V1 execution retains its original return and omits supplemental evidence', async t => {
  const f = dom(t); delete f.session.phase_evidence; delete f.session.phase_evidence_started;
  const result = await executeScenarioPhase(f.session, 'primary_result', scenario.phases.primary_result);
  assert.equal(Object.hasOwn(f.session, 'phase_evidence'), false);
  assert.deepEqual(result.actions, [{ op: 'fill', step_index: 0 }, { op: 'click', step_index: 1 }, { op: 'press', step_index: 2 }]);
  assert.equal(result.generation, 1); assert.equal(result.actual_desktop, false);
});

test('typed phase evidence remains optional for historical child reports', () => {
  assert.equal(validatePhaseEvidence({}, scenario), undefined);
});

for (const [name, mutate] of [
  ['step order', child => child.phase_evidence.phases[0].steps.reverse()],
  ['literal action', child => child.phase_evidence.phases[0].steps[0].step.value = 'changed'],
  ['generation', child => child.phase_evidence.phases[1].steps[0].generation_after += 1],
  ['time reversal', child => child.phase_evidence.phases[1].steps[0].started_ms = 0],
  ['probe actual', child => child.phase_evidence.phases[0].steps.at(-1).observed.actual = 99],
  ['temporal delta', child => child.phase_evidence.phases[0].steps.at(-1).temporal_samples[0].after += 1],
  ['undeclared media', child => child.phase_evidence.phases[0].steps[2].media[0].selector = '#outside'],
  ['duplicate media', child => child.phase_evidence.phases[0].steps[2].media.push(clone(child.phase_evidence.phases[0].steps[2].media[0]))],
  ['missing error control', child => child.phase_evidence.phases[2].steps[2].controls.pop()],
  ['false window disconnect', child => child.phase_evidence.phases[1].steps[0].reopen.old_window_disconnected = false],
  ['invented source digest', child => child.phase_evidence.phases[0].steps[2].media[0].after.src_sha256 = 'fake'],
  ['untyped event trust', child => child.phase_evidence.phases[0].steps[2].media[0].seeked_events[0].is_trusted = 'true'],
  ['event on non-range action', child => { child.phase_evidence.phases[0].steps[1].media[0].seeked_events = [{ current_time: 7, is_trusted: true }]; }],
  ['missing action record', child => child.phase_evidence.phases[1].steps.pop()],
  ['unbounded native events', child => { const row = child.phase_evidence.phases[0].steps[2].media[0]; row.seeked_events = Array(9).fill(row.seeked_events[0]); }],
  ['missing snapshot field', child => { delete child.phase_evidence.phases[0].steps[2].media[0].after.paused; }],
  ['invented missing-element values', child => { const row = child.phase_evidence.phases[0].steps[2].media[0].after; row.present = false; }],
  ['retained byte overflow', child => { child.phase_evidence.phases[0].steps[0].step.value = 'x'.repeat(131073); }],
  ['private control value', child => { child.phase_evidence.phases[0].steps[0].controls[0].after.type = 'hidden'; }],
]) test(`typed evidence refuses ${name}`, async t => {
  const f = await complete(t); mutate(f.child); assert.throws(() => validatePhaseEvidence(f.child, scenario));
});

test('declared media/control selector bounds fail closed before broad DOM reads', () => {
  const changed = clone(scenario);
  changed.phases.primary_result = Array.from({ length: 5 }, (_, n) => ({ ...mediaAssert('result_1'), probe: { kind: 'media_state', selector: '#video' + n } }));
  assert.throws(() => phaseEvidenceSelectors(changed));
  changed.phases.primary_result = Array.from({ length: 33 }, (_, n) => ({ op: 'click', selector: '#button' + n }));
  assert.throws(() => phaseEvidenceSelectors(changed));
});

test('DOM-authored session and supplemental flags cannot promote browser acceptance', async t => {
  const f = await complete(t); f.session.actual_desktop = true;
  assert.throws(() => assembleWorkflowReport({ session: f.session, actualSession: true }), /fixtures|authored/);
});

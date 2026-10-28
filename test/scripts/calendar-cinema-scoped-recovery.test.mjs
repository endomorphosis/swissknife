import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { CalendarApp } from '../../web/js/apps/calendar.js';
import { CinemaApp } from '../../web/js/apps/cinema.js';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';

function dom(t) {
  const names = ['window', 'document', 'localStorage', 'sessionStorage', 'CustomEvent', 'MutationObserver'];
  const before = Object.fromEntries(names.map(n => [n, globalThis[n]]));
  const window = new Window({ url: 'http://localhost' });
  for (const name of names) globalThis[name] = name === 'window' ? window : window[name];
  t.after(() => { window.happyDOM.abort(); for (const name of names) {
    if (before[name] === undefined) delete globalThis[name]; else globalThis[name] = before[name];
  } });
  return window;
}
function localEvent(title, start, end) {
  return { id: title, title, date: new Date(start), endDate: new Date(end), category: 'work', timezone: 'Europe/Amsterdam', description: '' };
}
function selectedCalendar(t) {
  dom(t); const app = new CalendarApp();
  app.events = [localEvent('Saved standup', '2027-06-15T10:30:00', '2027-06-15T11:30:00'),
    localEvent('Saved overlap', '2027-06-15T10:45:00', '2027-06-15T11:15:00'),
    localEvent('Other month', '2026-10-26T09:30:00', '2026-10-26T10:30:00')];
  app.currentDate = new Date(2027, 5, 15); app.selectedDate = new Date(2027, 5, 15); app.currentView = 'agenda';
  return app;
}
test('Calendar result contains the selected date, full saved titles, timezone and actual overlap only', t => {
  const app = selectedCalendar(t), status = app.buildLiveStatus();
  assert.match(status, /Selected date: 2027-06-15/);
  assert.match(status, /Saved standup \| 2027-06-15 10:30 \| timezone: Europe\/Amsterdam/);
  assert.match(status, /Saved standup 2027-06-15 10:30 and Saved overlap 2027-06-15 10:45/);
  assert.doesNotMatch(status, /Other month/);
});
test('Calendar real storage reopen restores the chosen view and date without replacing events', t => {
  const first = selectedCalendar(t); first.saveEventsToStorage(); first.updateView();
  const second = new CalendarApp();
  assert.equal(second.currentView, 'agenda'); assert.equal(second.formatLocalDate(second.selectedDate), '2027-06-15');
  assert.equal(second.formatCurrentPeriod(), 'June 2027'); assert.match(second.buildLiveStatus(), /Saved overlap/);
});
test('Calendar selected-month agenda includes real dates/zones and excludes other-month defaults', t => {
  const app = selectedCalendar(t), html = app.renderAgendaView();
  assert.match(html, /Saved standup/); assert.match(html, /2027-06-15 10:30/); assert.match(html, /Timezone: Europe\/Amsterdam/);
  assert.doesNotMatch(html, /Other month/);
});
test('Calendar result precedes the grid, does not clip its result, and secondary tools use disclosure', async t => {
  const app = selectedCalendar(t), root = document.createElement('div'); root.innerHTML = await app.render();
  assert.ok(root.querySelector('#calendarLiveStatus').compareDocumentPosition(root.querySelector('.calendar-content')) & 4);
  assert.ok(root.querySelector('details.calendar-sidebar > summary'));
  const style = root.querySelector('style').textContent;
  assert.match(style, /\.calendar-live-status\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/);
  assert.match(style, /\.event-chip\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/);
});
test('Calendar corrupt view preference preserves event storage and a usable default', t => {
  const first = selectedCalendar(t); first.saveEventsToStorage(); localStorage.setItem('swissknife-calendar-view', '{invalid');
  const app = new CalendarApp(); assert.equal(app.currentView, 'month'); assert.ok(app.events.some(e => e.title === 'Saved standup'));
});
function cinema(t) {
  dom(t); const app = new CinemaApp(), root = document.createElement('div'); document.body.append(root); app.createInterface(root);
  // Explicit unit fixture: no gateway, provider, browser or real SDK operation.
  const calls = [];
  app.invokeCinemaOwner = async (_container, tool, payload) => {
    calls.push({ tool, payload });
    return { value: { persisted: true, verified: true, cid: payload.cid }, envelope: { receipt: { receipt_id: 'unit-fixture-only' } }, preview: false };
  };
  app.commitTimeline(root, 2);
  return { app, root, calls };
}
async function persist(f) { await f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids'); return f.app.readLocalProject(); }
test('Cinema no longer inherits the globally loaded Strudel fixed timeline-header height', t => {
  const f = cinema(t), head = f.root.querySelector('.cinema-timeline-head');
  assert.equal(head.classList.contains('timeline-header'), false);
  const css = f.root.querySelector('style').textContent;
  assert.match(css, /\.cinema-app \.cinema-timeline-head\s*\{[^}]*height:\s*auto;/);
  assert.match(fs.readFileSync(new URL('../../web/css/strudel.css', import.meta.url), 'utf8'), /\.timeline-header\s*\{\s*height:\s*40px;/);
});
test('Cinema saves the exact acknowledged bytes and an unchanged Enter commit retains that snapshot', async t => {
  const f = cinema(t), before = await persist(f), record = before.persistence.record;
  assert.equal(await contentCidForBytes(new TextEncoder().encode(record)), before.projectCid);
  assert.equal(Buffer.from(f.calls[0].payload.bytes_base64, 'base64').toString(), record);
  f.app.commitTimeline(f.root, 2); const after = f.app.readLocalProject();
  assert.equal(after.projectCid, before.projectCid); assert.equal(after.persistence.record, record); assert.equal(f.calls.length, 1);
});
test('Cinema real close/new instance restores saved CID and actual last availability result without a new owner call', async t => {
  const f = cinema(t), before = await persist(f);
  await f.app.handleCinemaWorkflowAction(f.root, 'simulate-failed-export');
  f.root.remove(); const reopened = new CinemaApp(), root = document.createElement('div'); document.body.append(root); reopened.createInterface(root);
  await reopened.projectRestoration;
  assert.equal(reopened.cinemaWorkflow.projectCid, before.projectCid);
  assert.equal(root.querySelector('.cinema-header .project-info').textContent, 'Project saved');
  assert.match(root.querySelector('[data-cinema-workflow-status]').textContent, /no encoder is connected/);
  assert.equal(f.calls.length, 1);
});
test('Cinema material trim edit clears saved status and retains the last saved snapshot reference', async t => {
  const f = cinema(t), saved = await persist(f); f.app.commitTimeline(f.root, 3); const changed = f.app.readLocalProject();
  assert.equal(changed.projectCid, undefined); assert.equal(changed.lastSavedProjectCid, saved.projectCid);
  assert.equal(f.app.cinemaWorkflow.projectCid, null); assert.equal(f.app.currentProject.id, null);
  assert.equal(f.root.querySelector('.cinema-header .project-info').textContent, 'Project not saved');
  assert.match(f.root.querySelector('[data-cinema-workflow-status]').textContent, /Unsaved changes/);
});
test('Cinema changed stored edit bytes cannot inherit the earlier verified saved label', async t => {
  const f = cinema(t); await persist(f); const altered = JSON.parse(sessionStorage.getItem('swissknife.cinema.localProject'));
  altered.tracks[0].out = 9; sessionStorage.setItem('swissknife.cinema.localProject', JSON.stringify(altered));
  assert.equal(f.app.readLocalProject().projectCid, null);
});
test('Cinema rejected persistence acknowledgement never marks the local project saved', async t => {
  const f = cinema(t); f.app.invokeCinemaOwner = async () => ({ value: { persisted: true, verified: true, cid: 'wrong-cid' }, envelope: {}, preview: false });
  await f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids');
  assert.equal(f.app.readLocalProject().projectCid, undefined); assert.equal(f.app.cinemaWorkflow.projectCid, null);
  assert.match(f.root.querySelector('[data-cinema-workflow-status]').textContent, /did not verify persistence/);
});

async function pendingAcknowledgement(f) {
  let acknowledge;
  let sent;
  f.app.invokeCinemaOwner = async (_container, tool, payload) => {
    f.calls.push({ tool, payload }); sent = payload;
    return await new Promise(resolve => { acknowledge = () => resolve({ value: { persisted: true, verified: true, cid: payload.cid }, envelope: {}, preview: false }); });
  };
  const completion = f.app.handleCinemaWorkflowAction(f.root, 'load-project-media-cids');
  for (let n = 0; n < 100 && !acknowledge; n++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(typeof acknowledge, 'function');
  return { completion, acknowledge, sent };
}
test('Cinema acknowledgement after actual app recreation updates the currently open matching snapshot', async t => {
  const f = cinema(t), pending = await pendingAcknowledgement(f);
  f.root.remove();
  const reopened = new CinemaApp(), root = document.createElement('div'); document.body.append(root); reopened.createInterface(root);
  assert.equal(root.querySelector('.cinema-header .project-info').textContent, 'Project not saved');
  pending.acknowledge(); await pending.completion;
  await reopened.projectRestoration;
  assert.equal(root.querySelector('.cinema-header .project-info').textContent, 'Project saved');
  assert.equal(reopened.cinemaWorkflow.projectCid, pending.sent.cid);
  assert.match(root.querySelector('[data-cinema-workflow-status]').textContent, /Project persisted/);
  const stored = reopened.readLocalProject();
  assert.equal(Buffer.from(pending.sent.bytes_base64, 'base64').toString(), stored.persistence.record);
  assert.equal(f.calls.length, 1, 'notification must not replay the owner call');
});
test('Cinema edit while owner persistence is pending cannot inherit acknowledgement for older bytes', async t => {
  const f = cinema(t), pending = await pendingAcknowledgement(f);
  f.app.commitTimeline(f.root, 3);
  pending.acknowledge(); await pending.completion;
  const stored = f.app.readLocalProject();
  assert.equal(stored.tracks[0].out, 3);
  assert.equal(stored.projectCid, undefined);
  assert.equal(stored.lastSavedProjectCid, pending.sent.cid);
  assert.equal(f.app.cinemaWorkflow.projectCid, null);
  assert.equal(f.root.querySelector('.cinema-header .project-info').textContent, 'Project not saved');
  assert.match(f.root.querySelector('[data-cinema-workflow-status]').textContent, /current changes remain unsaved/);
  assert.notEqual(f.app.projectEditState(stored), f.app.projectEditState({ ...stored, duration: 2, tracks: [{ kind: 'video', label: 'Sample clip', in: 0, out: 2, order: 0 }] }));
  assert.equal(f.calls.length, 1);
});

test('Cinema cold restore rejects changed record metadata whose content CID differs', async t => {
  const f = cinema(t); const saved = await persist(f);
  const raw = JSON.parse(sessionStorage.getItem('swissknife.cinema.localProject'));
  const record = JSON.parse(raw.persistence.record); record.created = '2031-01-01T00:00:00Z';
  raw.persistence.record = JSON.stringify(record);
  assert.notEqual(await contentCidForBytes(new TextEncoder().encode(raw.persistence.record)), saved.projectCid);
  sessionStorage.setItem('swissknife.cinema.localProject', JSON.stringify(raw)); f.root.remove();
  const app = new CinemaApp(), root = document.createElement('div'); document.body.append(root); app.createInterface(root);
  assert.equal(root.querySelector('.cinema-header .project-info').textContent, 'Checking saved project…');
  await app.projectRestoration;
  assert.equal(root.querySelector('.cinema-header .project-info').textContent, 'Project not saved');
  assert.equal(app.cinemaWorkflow.projectCid, null);
  assert.match(root.querySelector('[data-cinema-workflow-status]').textContent, /verification failed/);
  assert.equal(app.readLocalProject().tracks[0].out, 2);
  assert.equal(f.calls.length, 1);
});
async function deferredRestore(f, t) {
  await persist(f); f.root.remove();
  const subtle = globalThis.crypto.subtle, original = subtle.digest;
  let release; const blocked = new Promise(resolve => { release = resolve; });
  subtle.digest = async function(...args) { await blocked; return original.apply(this, args); };
  t.after(() => { subtle.digest = original; release(); });
  const app = new CinemaApp(), root = document.createElement('div'); document.body.append(root); app.createInterface(root);
  assert.equal(root.querySelector('.cinema-header .project-info').textContent, 'Checking saved project…');
  return { app, root, release };
}
test('Cinema cold valid restore grants Saved only after actual WebCrypto CID qualification', async t => {
  const f = cinema(t), x = await deferredRestore(f, t);
  assert.equal(x.app.cinemaWorkflow.projectCid, null);
  x.release(); await x.app.projectRestoration;
  assert.equal(x.root.querySelector('.cinema-header .project-info').textContent, 'Project saved');
  assert.equal(x.app.readLocalProject().projectCid, f.calls[0].payload.cid);
});
test('Cinema current edit during restored-record hashing survives and cannot inherit Saved', async t => {
  const f = cinema(t), x = await deferredRestore(f, t);
  x.app.commitTimeline(x.root, 3);
  x.release(); await x.app.projectRestoration;
  assert.equal(x.app.readLocalProject().tracks[0].out, 3);
  assert.equal(x.app.cinemaWorkflow.projectCid, null);
  assert.equal(x.root.querySelector('.cinema-header .project-info').textContent, 'Project not saved');
  assert.equal(x.app.readLocalProject().projectCid, undefined);
});

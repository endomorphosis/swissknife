import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url);
const { FAMILIES } = require('./vdg-evidence.cjs');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specs = path.join(project, 'test/e2e/families');
const localSpec = path.join(specs, FAMILIES['vdg-local'].spec);
const todoKey = 'swissknife-todos';
const goalsKey = 'swissknife-goals';

function fixtureSource(source = fs.readFileSync(localSpec, 'utf8')) {
  const start = source.indexOf('export function installLocalTodoCaseIsolation() {');
  const end = source.indexOf('\n\nconst require', start);
  assert.ok(start >= 0 && end > start, 'The actual Local spec must contain its inline fixture');
  return source.slice(start, end).replace(/^export /, '');
}

function fixture(t, baseline = { [todoKey]: ' [ { "id": 1 } ]\n', [goalsKey]: '\n[ { "id": 2 } ] ' }) {
  const window = new Window({ url: 'http://localhost' });
  const { document, localStorage } = window;
  for (const [key, value] of Object.entries(baseline)) if (value !== null) localStorage.setItem(key, value);
  localStorage.setItem('unrelated-app-settings', 'original independent settings');
  const install = new Function('window', 'document', 'localStorage', 'MutationObserver',
    `${fixtureSource()}; return installLocalTodoCaseIsolation;`)(window, document, localStorage, window.MutationObserver);
  const storageMethods = Object.fromEntries(['getItem', 'setItem', 'removeItem', 'clear']
    .map(name => [name, window.Storage.prototype[name]]));
  install();
  t.after(() => window.happyDOM.abort());
  const appendWindow = (id = 'todo', parent = document.body) => {
    const node = document.createElement('section'); node.className = 'window'; node.dataset.appId = id;
    node.innerHTML = '<div class="todo-row"><input type="checkbox"><button>Delete</button></div>';
    parent.appendChild(node); return node;
  };
  return { window, document, localStorage, install, appendWindow, storageMethods,
    flush: () => window.happyDOM.waitUntilComplete(),
    state: window.__vdgLocalTodoCaseIsolation };
}

test('real Todo action writes remain intact while its window is open, then exact baseline bytes return on close', async t => {
  const f = fixture(t);
  const before = [f.localStorage.getItem(todoKey), f.localStorage.getItem(goalsKey)];
  const app = f.appendWindow();
  app.querySelector('input').addEventListener('change', () => {
    f.localStorage.setItem(todoKey, '[{"id":1,"completed":true}]');
    f.localStorage.setItem(goalsKey, '[{"id":2,"status":"updated"}]');
  });
  const checkbox = app.querySelector('input'); checkbox.checked = true;
  checkbox.dispatchEvent(new f.window.Event('change', { bubbles: true }));
  f.localStorage.setItem('unrelated-app-settings', 'new independent settings');
  await f.flush();
  assert.equal(f.localStorage.getItem(todoKey), '[{"id":1,"completed":true}]');
  assert.equal(f.localStorage.getItem(goalsKey), '[{"id":2,"status":"updated"}]');
  assert.equal(checkbox.checked, true);
  assert.equal(f.state.restored_cases, 0);
  for (const [name, original] of Object.entries(f.storageMethods)) {
    assert.equal(f.window.Storage.prototype[name], original, `The fixture must not override real storage ${name}`);
  }
  app.remove(); await f.flush();
  assert.deepEqual([f.localStorage.getItem(todoKey), f.localStorage.getItem(goalsKey)], before);
  assert.equal(f.localStorage.getItem('unrelated-app-settings'), 'new independent settings');
  assert.equal(f.state.restored_cases, 1);
});

for (const [label, todos, goals] of [
  ['both keys absent', null, null],
  ['only goals present', null, ' \n[]\n'],
  ['only todos present', '\n [{"id":3}] ', null],
]) {
  test(`Todo case restoration preserves ${label}`, async t => {
    const f = fixture(t, { [todoKey]: todos, [goalsKey]: goals }), app = f.appendWindow();
    f.localStorage.setItem(todoKey, '[]'); f.localStorage.setItem(goalsKey, '[]');
    app.remove(); await f.flush();
    assert.equal(f.localStorage.getItem(todoKey), todos);
    assert.equal(f.localStorage.getItem(goalsKey), goals);
    assert.equal(f.localStorage.getItem('unrelated-app-settings'), 'original independent settings');
  });
}

test('item rerenders, connected moves, and synchronous window reinsertion cannot reset an active Todo case', async t => {
  const f = fixture(t), app = f.appendWindow();
  f.localStorage.setItem(todoKey, '[{"id":1,"completed":true}]');
  app.querySelector('.todo-row').remove();
  app.innerHTML = '<div class="todo-row">Actually changed item list</div>';
  await f.flush();
  assert.equal(f.state.restored_cases, 0);
  const otherParent = f.document.createElement('main'); f.document.body.append(otherParent);
  otherParent.append(app); await f.flush();
  assert.equal(f.state.restored_cases, 0);
  app.remove(); f.document.body.append(app); await f.flush();
  assert.equal(f.state.restored_cases, 0);
  assert.equal(f.localStorage.getItem(todoKey), '[{"id":1,"completed":true}]');
  app.remove(); await f.flush();
  assert.equal(f.state.restored_cases, 1);
});

test('closing another app leaves Todo changes intact; detaching the wrapper containing Todo restores its case', async t => {
  const f = fixture(t), wrapper = f.document.createElement('main'); f.document.body.append(wrapper);
  f.appendWindow('todo', wrapper);
  f.localStorage.setItem(todoKey, '[{"id":7}]');
  const other = f.appendWindow('calendar'); other.remove(); await f.flush();
  assert.equal(f.state.restored_cases, 0);
  assert.equal(f.localStorage.getItem(todoKey), '[{"id":7}]');
  wrapper.remove(); await f.flush();
  assert.equal(f.state.restored_cases, 1);
  assert.equal(f.localStorage.getItem(todoKey), ' [ { "id": 1 } ]\n');
});

test('pagehide restores both exact fixture keys and repeated installation adds no duplicate restore handler', async t => {
  const f = fixture(t), before = [f.localStorage.getItem(todoKey), f.localStorage.getItem(goalsKey)];
  f.install(); f.appendWindow();
  f.localStorage.removeItem(todoKey); f.localStorage.setItem(goalsKey, '[{"id":9}]');
  f.localStorage.setItem('unrelated-app-settings', 'keep this new value');
  f.window.dispatchEvent(new f.window.Event('pagehide'));
  assert.deepEqual([f.localStorage.getItem(todoKey), f.localStorage.getItem(goalsKey)], before);
  assert.equal(f.localStorage.getItem('unrelated-app-settings'), 'keep this new value');
  assert.equal(f.state.restored_cases, 1);
});

test('actual family generation preserves the inline Local fixture, timeout, and every other family spec', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-local-spec-regeneration-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const before = new Map(Object.entries(FAMILIES).map(([family, definition]) =>
    [family, fs.readFileSync(path.join(specs, definition.spec))]));
  for (const [family, definition] of Object.entries(FAMILIES)) {
    const stdout = execFileSync(process.execPath, [path.join(project, 'scripts/build-family-mcp-spec.cjs'), family],
      { cwd: project, env: { ...process.env, VDG_FAMILY_SPEC_DIR: output }, encoding: 'utf8', timeout: 30000 });
    assert.equal(JSON.parse(stdout).completion_authority, false);
    const generated = fs.readFileSync(path.join(output, definition.spec));
    assert.deepEqual(generated, before.get(family), `${family} regeneration changed its reviewed executable bytes`);
    const timeoutCalls = [...generated.toString().matchAll(/test\.setTimeout\(([\d_]+)\)/g)];
    assert.equal(timeoutCalls.length, 1, `${family} must declare exactly one bounded test timeout`);
    assert.equal(timeoutCalls[0][1], family === 'vdg-local' ? '21_600_000' : '14_400_000',
      'Only Local may receive the longer measured-workload budget');
    if (family === 'vdg-local') {
      assert.equal(fixtureSource(generated.toString()), fixtureSource(before.get(family).toString()));
      assert.ok(generated.indexOf('await page.context().addInitScript(installLocalTodoCaseIsolation)')
        < generated.indexOf("await runVdgFamilyCapture(page, 'local')"));
    } else assert.equal(generated.includes('installLocalTodoCaseIsolation'), false);
  }
  for (const [family, definition] of Object.entries(FAMILIES)) {
    assert.deepEqual(fs.readFileSync(path.join(specs, definition.spec)), before.get(family),
      'The redirected generator must leave canonical family specs unchanged');
  }
});

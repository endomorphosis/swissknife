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
const controlSpec = path.join(specs, FAMILIES['vdg-control'].spec);

function guardSource(source = fs.readFileSync(controlSpec, 'utf8')) {
  const start = source.indexOf('export function installControlPrimaryAppGuard() {');
  const end = source.indexOf('\n\nconst require', start);
  assert.ok(start >= 0 && end > start, 'Control must contain its executable source-bound mount guard');
  return source.slice(start, end).replace(/^export /, '');
}

function fixture(t) {
  const window = new Window({ url: 'http://localhost' });
  t.after(() => window.happyDOM.abort());
  const install = new Function('window', guardSource() + '; return installControlPrimaryAppGuard;')(window);
  install();
  const addWindow = (appId = 'mcp-control', body = '<section class="mcp-control-app">Real app controls</section>') => {
    const element = window.document.createElement('section');
    element.className = 'window'; element.dataset.appId = appId;
    element.innerHTML = `<div class="window-content"><div class="window-app-content">${body}</div><div class="live-tool-gateway-host"><button data-live-gateway-binding="fixture">Generic tool</button></div></div>`;
    for (const root of element.querySelectorAll('.mcp-control-app')) root.getClientRects = () => [{ width: 720, height: 500 }];
    window.document.body.append(element);
    return { appId, element };
  };
  const publish = launchApp => {
    const desktop = { windows: new Map(), launchApp };
    window.swissknifeDesktop = desktop;
    return desktop;
  };
  return { window, install, addWindow, publish };
}

test('the real post-await owned primary root passes and preserves this, arguments and return value', async t => {
  const f = fixture(t), expected = { actual: 'launch-return' }, options = { native: 'unchanged' };
  let calls = 0, desktop;
  desktop = f.publish(async function (...args) {
    calls += 1; assert.equal(this, desktop); assert.deepEqual(args, ['mcp-control', options]);
    await Promise.resolve();
    this.windows.set('owned', f.addWindow());
    return expected;
  });
  assert.equal(await desktop.launchApp('mcp-control', options), expected);
  assert.equal(calls, 1);
  assert.equal(f.window.__vdgControlPrimaryAppGuard.checked_launches, 1);
});

for (const [name, body] of [
  ['caught app-error with a functioning generic gateway', '<div class="app-error">App Load Error<button>Close</button></div>'],
  ['generic-only app without primary content', ''],
  ['placeholder plus primary-looking generic panel', '<div class="app-placeholder">Transport controls ready</div>'],
  ['unfinished loader', '<div class="window-loading">Loading</div>'],
  ['primary root alongside app-error', '<section class="mcp-control-app">App</section><div class="app-error">Failed</div>'],
]) {
  test(`${name} rejects before the caller can click its tool or take a success screenshot`, async t => {
    const f = fixture(t), desktop = f.publish(async function () { this.windows.set('owned', f.addWindow('mcp-control', body)); });
    let toolClicks = 0, screenshots = 0;
    await assert.rejects(async () => {
      await desktop.launchApp('mcp-control');
      toolClicks += 1; screenshots += 1;
    }, /VDG control primary mount:/);
    assert.equal(toolClicks, 0); assert.equal(screenshots, 0);
    assert.equal(f.window.document.querySelectorAll('[data-live-gateway-binding]').length, 1);
    assert.equal(f.window.__vdgControlPrimaryAppGuard.checked_launches, 0);
  });
}

test('hidden, detached, other-window and gateway-only primary roots cannot establish the owned app mount', async t => {
  for (const fault of ['hidden', 'detached', 'other-window', 'gateway-root']) {
    const f = fixture(t), desktop = f.publish(async function () {
      const record = f.addWindow();
      if (fault === 'hidden') record.element.querySelector('.mcp-control-app').getClientRects = () => [];
      if (fault === 'detached') record.element.remove();
      if (fault === 'other-window') record.element.dataset.appId = 'api-keys';
      if (fault === 'gateway-root') record.element.querySelector('.live-tool-gateway-host').append(record.element.querySelector('.mcp-control-app'));
      this.windows.set('owned', record);
    });
    await assert.rejects(desktop.launchApp('mcp-control'), /VDG control primary mount:/);
  }
});

test('each singleton launch rechecks the current primary instead of caching a prior successful mount', async t => {
  const f = fixture(t), record = f.addWindow(), desktop = f.publish(async () => undefined);
  desktop.windows.set('owned', record);
  await desktop.launchApp('mcp-control');
  record.element.querySelector('.window-app-content').innerHTML = '<div class="app-error">Later failure</div>';
  await assert.rejects(desktop.launchApp('mcp-control'), /VDG control primary mount:/);
  assert.equal(f.window.__vdgControlPrimaryAppGuard.checked_launches, 1);
});

test('other apps and aliases preserve the exact original return or rejection without MCP mount requirements', async t => {
  const f = fixture(t), result = Promise.resolve({ actual: true }), expectedError = new Error('original failure');
  const calls = [], desktop = f.publish(function (...args) { calls.push({ self: this, args }); return result; });
  for (const app of ['api-keys', 'code-editor', 'strudel-grandma']) assert.equal(desktop.launchApp(app, { value: app }), result);
  assert.ok(calls.every(call => call.self === desktop));
  assert.deepEqual(calls.map(call => call.args), ['api-keys', 'code-editor', 'strudel-grandma'].map(app => [app, { value: app }]));
  const failed = f.publish(async () => { throw expectedError; });
  await assert.rejects(failed.launchApp('mcp-control'), error => error === expectedError);
});

test('early installation, repeated init and desktop replacement wrap each published launch method once', async t => {
  const f = fixture(t);
  f.install();
  let calls = 0;
  const desktop = f.publish(async function () { calls += 1; this.windows.set('owned', f.addWindow()); });
  const wrapped = desktop.launchApp;
  // Real constructor publication precedes app registry initialization.
  desktop.apps = new Map([['mcp-control', {}]]);
  f.install(); f.window.swissknifeDesktop = desktop;
  assert.equal(desktop.launchApp, wrapped);
  await desktop.launchApp('mcp-control');
  assert.equal(calls, 1);
  const replacement = f.publish(async function () { calls += 1; this.windows.set('new', f.addWindow()); });
  await replacement.launchApp('mcp-control');
  assert.equal(calls, 2);
  assert.equal(f.window.__vdgControlPrimaryAppGuard.checked_launches, 2);
});

test('a hanging app with generic gateway cannot use the shared recoverable launch timeout bypass', async t => {
  const f = fixture(t), requested = [];
  f.window.setTimeout = (callback, delay) => { requested.push(delay); return setTimeout(callback, 5); };
  f.window.clearTimeout = clearTimeout;
  const desktop = f.publish(function () { this.windows.set('owned', f.addWindow('mcp-control', '<div class="app-error">Failed</div>')); return new Promise(() => {}); });
  await assert.rejects(desktop.launchApp('mcp-control'), error => {
    assert.notEqual(error.message, 'launch timed out');
    assert.match(error.message, /VDG control primary mount: launch completion exceeded 6500ms/);
    return true;
  });
  assert.deepEqual(requested, [6500]);
  assert.ok(requested[0] < 8000);
});

test('underlying Control timeout rejections or throws cannot impersonate the recoverable shared timeout', async t => {
  for (const rejection of [new Error('launch timed out'), 'launch timed out']) {
    const f = fixture(t), desktop = f.publish(async () => { throw rejection; });
    await assert.rejects(desktop.launchApp('mcp-control'), /VDG control primary mount: underlying launch timed out/);
  }
  const f = fixture(t), original = new Error('launch timed out');
  const desktop = f.publish(() => { throw original; });
  assert.throws(() => desktop.launchApp('mcp-control'), /VDG control primary mount: underlying launch timed out/);
  assert.throws(() => desktop.launchApp('api-keys'), error => error === original);
});

test('real regeneration preserves the guarded Control spec and all other five exact spec bytes', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-control-mount-regen-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const before = new Map(Object.entries(FAMILIES).map(([family, definition]) => [family, fs.readFileSync(path.join(specs, definition.spec))]));
  for (const [family, definition] of Object.entries(FAMILIES)) {
    execFileSync(process.execPath, [path.join(project, 'scripts/build-family-mcp-spec.cjs'), family],
      { cwd: project, env: { ...process.env, VDG_FAMILY_SPEC_DIR: output }, timeout: 30000 });
    const generated = fs.readFileSync(path.join(output, definition.spec));
    assert.deepEqual(generated, before.get(family), `${family} output differs from reviewed spec`);
    if (family === 'vdg-control') {
      const source = generated.toString();
      assert.equal(guardSource(source), guardSource());
      assert.ok(source.indexOf('await page.context().addInitScript(installControlPrimaryAppGuard)')
        < source.indexOf("await runVdgFamilyCapture(page, 'control')"));
      assert.equal(/VDG_CAPTURE_TRANSPORT/.test(source), false, 'Both declared profiles use the same unconditional guard');
    } else assert.equal(generated.toString().includes('installControlPrimaryAppGuard'), false);
  }
  for (const [family, definition] of Object.entries(FAMILIES)) assert.deepEqual(fs.readFileSync(path.join(specs, definition.spec)), before.get(family));
});

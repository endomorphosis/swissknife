import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { NeuralPhotoshopApp } from '../../web/js/apps/neural-photoshop.js';
import { collectRenderedControls } from '../../scripts/rendered-control-rows.mjs';

const selector = '#neural-history-panel-toggle';
function fixture(t) {
  const names = ['window', 'document', 'CSS', 'fetch'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, CSS: window.CSS });
  let ownerCalls = 0;
  globalThis.fetch = () => { ownerCalls++; throw new Error('Local history controls must never call an owner'); };
  const root = document.createElement('main'); document.body.append(root);
  const app = new NeuralPhotoshopApp(root, {});
  t.after(() => {
    window.happyDOM.abort();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
    assert.equal(ownerCalls, 0);
  });
  return { app, root };
}
function history(root) {
  assert.equal(root.querySelectorAll(selector).length, 1, 'One actual history control must own the stable selector');
  return root.querySelector(selector);
}
function inventory(root) {
  const controls = collectRenderedControls(root);
  const rows = controls.filter(row => row.selector === selector);
  assert.equal(rows.length, 1, 'The production census collector must identify the actual control exactly once');
  assert.equal(controls.some(row => /^button\[aria-label="(?:Expand|Collapse) history panel"\]$/.test(row.selector)), false);
  return rows[0];
}
function state(root, expanded) {
  const button = history(root);
  assert.equal(button.getAttribute('aria-expanded'), String(expanded));
  assert.equal(button.getAttribute('aria-label'), `${expanded ? 'Collapse' : 'Expand'} history panel`);
  assert.equal(button.textContent, expanded ? '−' : '+');
  return button;
}

test('initial rendered history label and glyph describe the real collapsed default', t => {
  const { app, root } = fixture(t);
  assert.equal(app.panels.history, false);
  root.innerHTML = app.createWindow().content;
  assert.equal(root.querySelector('button[data-panel="history"]').getAttribute('aria-label'), 'Expand history panel',
    'A collapsed panel must not first render the opposite action to the census');
  state(root, false);
  assert.equal(root.querySelector('.history-panel').classList.contains('hidden'), true);
  assert.equal(inventory(root).accessible_name, 'Expand history panel');
});

test('the same census selector survives real handler setup and both actual toggle transitions', t => {
  const { app, root } = fixture(t);
  root.innerHTML = app.createWindow().content;
  const button = history(root);
  const before = inventory(root);
  app.setupPanelHandlers(root);
  assert.equal(history(root), button);
  assert.equal(inventory(root).selector, before.selector);
  state(root, false).click();
  assert.equal(app.panels.history, true);
  assert.equal(root.querySelector('.history-panel').hidden, false);
  assert.equal(history(root), button);
  assert.equal(inventory(root).accessible_name, 'Collapse history panel');
  state(root, true).click();
  assert.equal(app.panels.history, false);
  assert.equal(root.querySelector('.history-panel').hidden, true);
  state(root, false);
  assert.equal(inventory(root).selector, before.selector);
});

test('an already expanded history panel renders truthfully under the same stable identity', t => {
  const { app, root } = fixture(t);
  app.panels.history = true;
  root.innerHTML = app.createWindow().content;
  state(root, true);
  assert.equal(root.querySelector('.history-panel').classList.contains('hidden'), false);
  assert.equal(inventory(root).accessible_name, 'Collapse history panel');
  app.setupPanelHandlers(root);
  state(root, true).click();
  assert.equal(app.panels.history, false);
  state(root, false);
  inventory(root);
});

test('closing and rebuilding a fresh case restores its real default without changing control identity', t => {
  const { app, root } = fixture(t);
  root.innerHTML = app.createWindow().content;
  app.setupPanelHandlers(root);
  state(root, false).click();
  assert.equal(app.panels.history, true);
  root.replaceChildren();
  const fresh = new NeuralPhotoshopApp(root, {});
  root.innerHTML = fresh.createWindow().content;
  fresh.setupPanelHandlers(root);
  assert.equal(fresh.panels.history, false);
  state(root, false).click();
  assert.equal(fresh.panels.history, true);
  state(root, true);
  inventory(root);
});

test('history IDs are unique inside each real app root across simultaneous independent instances', t => {
  const { app, root } = fixture(t);
  const other = document.createElement('main'); document.body.append(other);
  const second = new NeuralPhotoshopApp(other, {});
  root.innerHTML = app.createWindow().content;
  other.innerHTML = second.createWindow().content;
  app.setupPanelHandlers(root); second.setupPanelHandlers(other);
  state(root, false).click();
  assert.equal(app.panels.history, true); assert.equal(second.panels.history, false);
  state(other, false).click();
  assert.equal(second.panels.history, true);
  inventory(root); inventory(other);
});

test('repeated real event setup cannot double-toggle the stable history control', t => {
  const { app, root } = fixture(t);
  root.innerHTML = app.createWindow().content;
  for (const method of ['setupCanvas', 'setupMenuHandlers', 'setupToolHandlers', 'setupLayerHandlers', 'setupAIHandlers', 'setupVdaG042Handlers', 'setupCanvasHandlers', 'setupFileOperations', 'setupKeyboardHandlers']) app[method] = () => {};
  app.setupEventHandlers(root); app.setupEventHandlers(root);
  state(root, false).click();
  assert.equal(app.panels.history, true);
  state(root, true).click();
  assert.equal(app.panels.history, false);
});

test('an awaited real initialize has the same truthful history inventory before and after its delayed binding', async t => {
  const { app, root } = fixture(t);
  // Isolate the real mount and history behavior from unrelated canvas/AI work.
  app.initializeCanvas = async () => {};
  app.initializeAI = async () => {};
  app.createNewProject = () => {};
  app.setupEventHandlers = container => app.setupPanelHandlers(container);
  await app.initialize();
  const button = state(root, false);
  const before = inventory(root);
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.equal(history(root), button);
  state(root, false);
  assert.equal(inventory(root).selector, before.selector);
  state(root, false).click();
  assert.equal(app.panels.history, true);
  state(root, true);
});

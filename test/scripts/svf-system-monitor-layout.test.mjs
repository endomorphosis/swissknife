import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { Window } from 'happy-dom';

// Authored computed-layout fixtures; real browser boundary validation is separate.
const filename = process.env.SVF_MONITOR_SOURCE || new URL('../../web/js/apps/system-monitor.js', import.meta.url);
const text = fs.readFileSync(filename, 'utf8'), ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
const declaration = ast.body.find(node => node.declaration?.id?.name === 'SystemMonitorApp').declaration;
const constants = ast.body.filter(node => node.type === 'VariableDeclaration').map(node => text.slice(node.start, node.end)).join('\n');
const checkout = process.env.SVF_MONITOR_LAYOUT_CHECKOUT || new URL('../../', import.meta.url);

for (const width of [1440, 390]) test(`Monitor ${width}px keeps its primary root bounded and owns inner-content scrolling`, async t => {
  const window = new Window({ url: 'http://authored.invalid', width, height: 844,
    settings: { disableCSSFileLoading: true, disableJavaScriptEvaluation: true } });
  t.after(() => window.happyDOM.abort()); const document = window.document;
  const web = new URL('web/', checkout), index = fs.readFileSync(new URL('index.html', web), 'utf8');
  for (const match of index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)) {
    const style = document.createElement('style'); style.textContent = fs.readFileSync(new URL(match[1].replace(/^\//, ''), web), 'utf8'); document.head.append(style);
  }
  const App = vm.runInNewContext(`${constants};(${text.slice(declaration.start, declaration.end)})`, {
    window, document, navigator: window.navigator, localStorage: window.localStorage, console,
  });
  App.prototype.detectGPUModel = () => 'unmeasured in authored fixture';
  const app = new App({}), host = document.createElement('section'); host.className = 'window'; host.dataset.appId = 'system-monitor';
  host.innerHTML = '<div class="window-content"><div class="window-app-content"><div id="unit-content"></div><div class="live-tool-gateway-host"></div></div></div>';
  document.body.append(host); host.querySelector('#unit-content').innerHTML = app.createWindow().content;
  for (const selector of ['.window-content', '.window-app-content', '#unit-content', '.system-monitor-container']) {
    const style = window.getComputedStyle(host.querySelector(selector));
    assert.equal(style.display, 'flex', selector); assert.equal(style.flexDirection, 'column', selector); assert.equal(style.minHeight, '0', selector);
  }
  assert.equal(window.getComputedStyle(host.querySelector('.system-monitor-container')).height, 'auto');
  const content = window.getComputedStyle(host.querySelector('#monitor-content'));
  assert.equal(content.flexGrow, '1'); assert.equal(content.flexBasis, '0px'); assert.equal(content.minHeight, '0');
  assert.equal(content.overflowY, 'auto'); assert.equal(content.overflowX, 'hidden');
  assert.equal(window.getComputedStyle(host.querySelector('.monitor-header')).flexShrink, '0');
  assert.equal(window.getComputedStyle(host.querySelector('.system-monitor-container > .status-bar')).flexShrink, '0');
  for (const id of ['refresh-btn', 'refresh-backend-telemetry', 'vda-persist-sample', 'ipfs-node-refresh', 'observation-stamp']) assert.ok(host.querySelector('#' + id));
  assert.equal(host.querySelector('#gpu-metric').textContent, 'n/a');
});

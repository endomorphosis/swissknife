import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {Window} from 'happy-dom';
import {AIChatApp} from '../../web/js/apps/ai-chat.js';

// This is a CSS-cascade regression, not browser geometry or app acceptance.
// Use the real desktop stylesheet order and real rendered app markup so that
// another app's global class rules cannot silently change this app's main axis.
async function desktopWithChat(t, width) {
  const window = new Window({url:'http://localhost', width, height:900,
    settings:{disableJavaScriptEvaluation:true, disableCSSFileLoading:true}});
  const names = ['window', 'document', 'localStorage'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {window, document:window.document, localStorage:window.localStorage});
  t.after(async () => {
    await window.happyDOM.abort();
    for (const name of names) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const index = fs.readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  const stylesheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^\"]+)"/g)].map(match => match[1]);
  assert.ok(stylesheets.includes('/css/apps.css'));
  assert.ok(stylesheets.includes('/css/strudel-ai-daw.css'));
  for (const href of stylesheets) {
    const style = window.document.createElement('style');
    style.textContent = fs.readFileSync(new URL('../../web' + href, import.meta.url), 'utf8');
    window.document.head.append(style);
  }
  const shell = window.document.createElement('section');
  shell.className = 'window'; shell.dataset.appId = 'ai-chat';
  const app = new AIChatApp({windows:new Map()});
  shell.innerHTML = await app.render();
  window.document.body.append(shell);
  const container = shell.querySelector('.ai-chat-container');
  const sidebar = [...container.children].find(child => child.classList.contains('chat-sidebar'));
  const main = [...container.children].find(child => child.classList.contains('chat-main'));
  assert.ok(sidebar && main, 'real rendered chat must expose both structural panes');
  assert.equal(sidebar.nextElementSibling, main, 'real sidebar and transcript must remain siblings');
  return {window, container, shell};
}

for (const width of [1440, 769]) {
  test(`AI Chat desktop ${width}px keeps sidebar and transcript on a horizontal main axis with all desktop CSS`, async t => {
    const {window, container, shell} = await desktopWithChat(t, width);
    assert.equal(window.getComputedStyle(container).display, 'flex');
    assert.equal(window.getComputedStyle(container).flexDirection, 'row',
      'globally loaded column rules must not stack the sidebar above the transcript');
    assert.equal(window.getComputedStyle(shell.querySelector('.chat-main')).flexDirection, 'column',
      'toolbar/messages/composer must retain their internal vertical layout');
  });
}
for (const width of [768, 390]) {
  test(`AI Chat mobile ${width}px retains its vertical sidebar/transcript flow`, async t => {
    const {window, container, shell} = await desktopWithChat(t, width);
    assert.equal(window.getComputedStyle(container).flexDirection, 'column');
    assert.equal(window.getComputedStyle(shell.querySelector('.chat-sidebar')).maxHeight, '22%');
    assert.ok(shell.querySelector('#ai-chat-input'));
  });
}
test('AI Chat desktop direction override does not change another app using the shared container class', async t => {
  const {window} = await desktopWithChat(t, 1440);
  const sibling = window.document.createElement('section');
  sibling.className = 'window'; sibling.dataset.appId = 'strudel';
  sibling.innerHTML = '<div class="ai-chat-container"></div>';
  window.document.body.append(sibling);
  assert.equal(window.getComputedStyle(sibling.firstElementChild).flexDirection, 'column');
});

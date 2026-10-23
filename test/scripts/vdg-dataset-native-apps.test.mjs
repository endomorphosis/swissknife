import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { AIChatApp } from '../../web/js/apps/ai-chat.js';
import { VibeCodeApp } from '../../web/js/apps/vibecode.js';

const desktopSource = fs.readFileSync(new URL('../../web/js/main-simple.js', import.meta.url), 'utf8');
function desktopFactory(name, nextName, AppClass) {
  const start = desktopSource.indexOf(`    async ${name}(contentElement) {`);
  const end = desktopSource.indexOf(`\n    async ${nextName}`, start);
  assert.ok(start > 0 && end > start);
  const method = desktopSource.slice(start, end).trim().replace(`async ${name}`, `async function ${name}`)
    .replace(/const \{ \w+ \} = await import\('[^']+'\);/, 'const App = AppClass;')
    .replace(/new (VibeCodeApp|AIChatApp)\(this\)/, 'new App(this)');
  return new Function('AppClass', `return (${method})`)(AppClass);
}
const createEditor = desktopFactory('createVibeCodeApp', 'createStrudelAIDAWApp', VibeCodeApp);
const createChat = desktopFactory('createAIChatApp', 'createFileManagerApp', AIChatApp);

const bindings = [
  { app_id: 'ai-chat', binding_id: 'ai-chat.ipfs_accelerate_py.submit_inference', owner: 'ipfs_accelerate_py', selected_tool_id: 'submit_task', preferred_tool_ids: ['submit_task'], mutates_remote_state: true, transports: ['http', 'libp2p'], transport: 'http', intent_id: 'ai-chat.ipfs_accelerate_py.submit_inference' },
  { app_id: 'vibecode', binding_id: 'vibecode.ipfs_kit_py.list_virtual_files', owner: 'ipfs_kit_py', selected_tool_id: 'files_ls', preferred_tool_ids: ['files_ls', 'files_read', 'files_write'], mutates_remote_state: true, transports: ['http'], transport: 'http', intent_id: 'vibecode.ipfs_kit_py.list_virtual_files' },
  { app_id: 'vibecode', binding_id: 'vibecode.ipfs_accelerate_py.submit_inference', owner: 'ipfs_accelerate_py', selected_tool_id: 'submit_task', preferred_tool_ids: ['submit_task'], mutates_remote_state: true, transports: ['http'], transport: 'http', intent_id: 'vibecode.ipfs_accelerate_py.submit_inference' },
  { app_id: 'vibecode', binding_id: 'vibecode.ipfs_kit_py.persist_artifact', owner: 'ipfs_kit_py', selected_tool_id: 'artifacts_put', preferred_tool_ids: ['artifacts_put'], mutates_remote_state: true, transports: ['http', 'libp2p'], transport: 'http', intent_id: 'vibecode.ipfs_kit_py.persist_artifact' },
];
async function until(predicate) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Expected native UI transition did not occur.');
}
function environment(t, resultFor = call => ({ dry_run: true, ok: true, tool: call.tool_id })) {
  const previous = Object.fromEntries(['window', 'document', 'CustomEvent', 'localStorage', 'fetch', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__'].map(name => [name, globalThis[name]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent, localStorage: window.localStorage, __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  delete globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) {
      const appId = new URL(url, 'http://localhost').searchParams.get('app_id');
      return { ok: true, json: async () => ({ controls: bindings.filter(binding => binding.app_id === appId) }) };
    }
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    assert.equal(options.method, 'POST');
    const call = JSON.parse(options.body);
    calls.push(call);
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id, result: resultFor(call), receipt: { receipt_id: 'unit-test-receipt', event_dag_refs: ['unit-test-event'] } }) };
  };
  t.after(() => {
    window.happyDOM.abort();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  return { window, calls };
}
async function chatRoot(app) {
  const element = document.createElement('section');
  element.innerHTML = await app.render();
  document.body.append(element);
  return element;
}
async function editorRoot(app) {
  const element = document.createElement('section');
  element.innerHTML = await app.render();
  document.body.append(element);
  app.setupEventListeners(element);
  return element;
}

test('actual desktop VibeCode factory mounts native reads and Run once after inserting the DOM', async t => {
  const { calls } = environment(t, call => call.tool_id === 'artifacts_put'
    ? { ok: true, dry_run: true, mutation_performed: false, persisted: false, expected_cid: call.input.payload.cid }
    : { ok: true, tool: call.tool_id });
  const root = document.createElement('section'); document.body.append(root);
  let desktopSetup = 0;
  const app = await createEditor.call({ setupEventListeners() { desktopSetup++; }, windows: new Map(), apps: new Map() }, root);
  assert.equal(desktopSetup, 1);
  app.setupEventListeners(root); // Lifecycle callers may bind again; it must be idempotent for this rendered root.
  for (const [selector, tool] of [['#vibecode-list-files', 'files_ls'], ['#run-btn', 'artifacts_put']]) {
    const count = calls.length;
    root.querySelector(selector).click(); await until(() => root.querySelector('[data-gateway-confirm]'));
    assert.equal(root.querySelectorAll('[data-gateway-confirm]').length, 1); assert.equal(calls.length, count);
    root.querySelector('[data-gateway-confirm]').click(); await until(() => calls.length === count + 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls.length, count + 1); assert.equal(calls.at(-1).tool_id, tool); assert.equal(calls.at(-1).app_id, 'vibecode');
  }
});

test('actual desktop AIChat factory registers its own inline handlers after rendering', async t => {
  const { calls } = environment(t);
  const root = document.createElement('section'); document.body.append(root);
  const app = await createChat.call({ setupEventListeners() {}, windows: new Map(), apps: new Map() }, root);
  assert.equal(window.aiChatInstances[app.instanceId], app);
  const input = root.querySelector('#ai-chat-input'); const send = root.querySelector('#ai-chat-send-btn');
  assert.ok(input.getAttribute('oninput').includes(app.instanceId)); assert.ok(send.getAttribute('onclick').includes(app.instanceId));
  // Happy DOM does not compile inline attributes by default; execute the exact
  // product handlers with their real elements and instance registry.
  input.value = 'Actual desktop factory request';
  new Function(input.getAttribute('oninput')).call(input);
  assert.equal(send.disabled, false);
  const pending = new Function(`return ${send.getAttribute('onclick')}`).call(send);
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0); root.querySelector('[data-gateway-confirm]').click(); await pending;
  assert.equal(calls.length, 1); assert.equal(calls[0].tool_id, 'submit_task');
  assert.equal(calls[0].input.payload.prompt, 'Actual desktop factory request');
});

test('actual chat factory context toggles report observed data or explicit unavailability without transport', async t => {
  const { calls } = environment(t);
  const root = document.createElement('section'); document.body.append(root);
  const app = await createChat.call({ setupEventListeners() {}, windows: new Map(), apps: new Map() }, root);
  for (const source of Object.keys(app.contextSources)) {
    const toggle = root.querySelector(`[data-context="${source}"] input`); toggle.checked = true;
    const state = await new Function(`return ${toggle.getAttribute('onchange')}`).call(toggle);
    assert.ok(['available', 'unavailable'].includes(state.status));
    assert.match(root.querySelector('[data-chat-context-status]').textContent, new RegExp(state.status));
  }
  assert.equal(calls.length, 0);
  const context = await app.gatherEnabledContext();
  assert.equal(context.files.status, 'unavailable'); assert.equal(context.p2p.status, 'unavailable'); assert.equal(context.ipfs.status, 'unavailable');
  assert.equal(context.system.scope, 'browser'); assert.equal(context.system.user_agent, window.navigator.userAgent);
  assert.equal(context.system.online, window.navigator.onLine);
  assert.equal(context.code.status, 'unavailable'); assert.equal(context.desktop.status, 'available');
});

test('chat context includes only actual local window, file event, and open editor observations', async t => {
  const { calls } = environment(t);
  const handlers = new Map(); const activeWindow = document.createElement('div');
  const desktop = { setupEventListeners() {}, windows: new Map([['real-window', { appId: 'vibecode', title: 'Actual editor', element: activeWindow }]]), activeWindow, eventBus: { on(name, handler) { handlers.set(name, handler); } } };
  const root = document.createElement('section'); document.body.append(root); const app = await createChat.call(desktop, root);
  const editor = document.createElement('div'); editor.className = 'vibecode-container'; editor.innerHTML = '<textarea id="code-editor"></textarea>'; document.body.append(editor);
  editor.querySelector('textarea').value = 'actual editor buffer';
  app.contextSources.files.enabled = true;
  handlers.get('file:selected')({ file: { name: 'actual.py', path: '/selected/actual.py', content: 'actual selected file bytes', invented: 'must not be included' } });
  handlers.get('app:opened')({ appId: 'vibecode' });
  assert.deepEqual(app.getFileContext().files, [{ name: 'actual.py', path: '/selected/actual.py', content: 'actual selected file bytes' }]);
  assert.equal(app.getCodeContext().content, 'actual editor buffer'); assert.equal(app.getDesktopContext().activeApp, 'vibecode');
  assert.deepEqual(app.getDesktopContext().openApps, [{ id: 'vibecode', title: 'Actual editor' }]);
  assert.equal(calls.length, 0);
});

test('actual provider controls update only their instance-scoped real model selector', async t => {
  const { calls } = environment(t);
  const roots = [document.createElement('section'), document.createElement('section')]; roots.forEach(root => document.body.append(root));
  const desktop = { setupEventListeners() {}, windows: new Map() };
  const first = await createChat.call(desktop, roots[0]); const second = await createChat.call(desktop, roots[1]);
  for (const provider of Object.keys(second.aiProviders)) {
    const card = roots[1].querySelector(`[data-provider="${provider}"]`);
    new Function(`return ${card.getAttribute('onclick')}`).call(card);
    assert.equal(second.selectedProvider, provider);
    assert.equal(roots[1].querySelector('#ai-chat-model-select').value, second.aiProviders[provider].models[0]);
    assert.match(roots[1].querySelector('.status-text').textContent, /selected; owner requests require confirmation/);
  }
  assert.equal(first.selectedProvider, 'openai'); assert.equal(roots[0].querySelector('#ai-chat-model-select').value, 'gpt-4'); assert.equal(calls.length, 0);
});

for (const [index, prompt] of ['Analyze my desktop state', 'Help me write code', 'Explain system performance'].entries()) {
  test(`actual quick prompt ${index + 1} declares and confirms its exact native owner action`, async t => {
    const { calls } = environment(t); const root = document.createElement('section'); document.body.append(root);
    await createChat.call({ setupEventListeners() {}, windows: new Map() }, root);
    const trigger = root.querySelectorAll('.quick-action-btn')[index];
    assert.equal(trigger.dataset.nativeGatewayBinding, 'ai-chat.ipfs_accelerate_py.submit_inference'); assert.equal(trigger.dataset.nativeToolId, 'submit_task');
    const pending = new Function(`return ${trigger.getAttribute('onclick')}`).call(trigger);
    await until(() => root.querySelector('[data-gateway-confirm]'));
    assert.equal(calls.length, 0); root.querySelector('[data-gateway-confirm]').click(); await pending;
    assert.equal(calls.length, 1); assert.equal(calls[0].tool_id, 'submit_task'); assert.equal(calls[0].binding_id, trigger.dataset.nativeGatewayBinding);
    assert.equal(calls[0].input.payload.prompt, prompt); assert.equal(calls[0].input.policy.consent, 'granted');
    assert.match(root.querySelector('.chat-messages').textContent, /validated as a dry run/);
  });
}

test('a quick prompt cancellation preserves its actual draft and sends zero owner calls', async t => {
  const { calls } = environment(t); const root = document.createElement('section'); document.body.append(root);
  await createChat.call({ setupEventListeners() {}, windows: new Map() }, root);
  const trigger = root.querySelector('.quick-action-btn'); const pending = new Function(`return ${trigger.getAttribute('onclick')}`).call(trigger);
  await until(() => root.querySelector('[data-gateway-cancel]')); root.querySelector('[data-gateway-cancel]').click(); await pending;
  assert.equal(calls.length, 0); assert.equal(root.querySelector('#ai-chat-input').value, 'Analyze my desktop state');
});

test('chat control selectors survive rerender and each window owns its own input', async t => {
  environment(t);
  const first = new AIChatApp({ windows: new Map(), apps: new Map() });
  const second = new AIChatApp({ windows: new Map(), apps: new Map() });
  const firstRoot = await chatRoot(first);
  const secondRoot = await chatRoot(second);
  assert.notEqual(first.instanceId, second.instanceId);
  assert.equal(first.getContainer(), firstRoot.querySelector('.ai-chat-container'));
  assert.equal(second.getContainer(), secondRoot.querySelector('.ai-chat-container'));
  for (const root of [firstRoot, secondRoot]) {
    assert.ok(root.querySelector('#ai-chat-input'));
    assert.ok(root.querySelector('#ai-chat-model-select'));
    assert.ok(root.querySelector('#ai-chat-send-btn'));
  }
  second.handleInputChange('only second window');
  assert.equal(firstRoot.querySelector('#ai-chat-send-btn').disabled, true);
  assert.equal(secondRoot.querySelector('#ai-chat-send-btn').disabled, false);
  const html = await first.render();
  assert.ok(html.includes('id="ai-chat-input"'));
  assert.ok(html.includes('id="ai-chat-model-select"'));
});

test('empty chat input makes zero MCP calls', async t => {
  const { calls } = environment(t);
  const app = new AIChatApp({});
  await chatRoot(app);
  await app.sendMessage();
  assert.equal(calls.length, 0);
});

test('native chat send holds before confirmation and cancellation preserves the draft', async t => {
  const { calls } = environment(t);
  const app = new AIChatApp({});
  app.gatherEnabledContext = async () => ({ desktop: 'current window' });
  const root = await chatRoot(app);
  root.querySelector('#ai-chat-input').value = 'Explain this code';
  const pending = app.sendMessage();
  await until(() => root.querySelector('[data-gateway-cancel]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(root.querySelector('#ai-chat-input').value, 'Explain this code');
});

test('confirmed native chat dispatches its exact owner binding on the selected transport', async t => {
  const { calls } = environment(t);
  globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = 'libp2p';
  const app = new AIChatApp({});
  app.gatherEnabledContext = async () => ({ selection: 'current code' });
  const root = await chatRoot(app);
  root.querySelector('#ai-chat-input').value = 'Explain this code';
  let event;
  root.addEventListener('swissknife:live-gateway-result', received => { event = received.detail; });
  const pending = app.sendMessage();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].app_id, 'ai-chat');
  assert.equal(calls[0].owner, 'ipfs_accelerate_py');
  assert.equal(calls[0].tool_id, 'submit_task');
  assert.equal(calls[0].binding_id, 'ai-chat.ipfs_accelerate_py.submit_inference');
  assert.equal(calls[0].transport, 'libp2p');
  assert.equal(calls[0].input.policy.dry_run, true);
  assert.equal(calls[0].input.payload.prompt, 'Explain this code');
  assert.equal(event.origin, 'native-control');
  assert.match(root.querySelector('.chat-messages').textContent, /validated as a dry run/);
});

for (const toolId of ['files_ls', 'files_read', 'files_write']) {
  test(`native editor ${toolId} uses the reviewed owner tool with confirmation`, async t => {
    const { calls } = environment(t, call => ({ ok: true, tool: call.tool_id, ...(call.tool_id === 'files_read' ? { content: 'actual owner fixture content' } : {}) }));
    const app = new VibeCodeApp({});
    const root = await editorRoot(app);
    const trigger = root.querySelector(toolId === 'files_ls' ? '#vibecode-list-files' : toolId === 'files_read' ? '#vibecode-open-file' : '#vibecode-write-file');
    const original = root.querySelector('#code-editor').value;
    const pending = app.runWorkspaceOperation(root, toolId, trigger);
    await until(() => root.querySelector('[data-gateway-confirm]'));
    assert.equal(calls.length, 0);
    root.querySelector('[data-gateway-confirm]').click();
    await pending;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].owner, 'ipfs_kit_py');
    assert.equal(calls[0].binding_id, 'vibecode.ipfs_kit_py.list_virtual_files');
    assert.equal(calls[0].tool_id, toolId);
    assert.equal(calls[0].input.payload.path, toolId === 'files_ls' ? '/swissknife/vdg' : '/swissknife/vdg/README.md');
    assert.equal(calls[0].input.policy.dry_run, true);
    if (toolId === 'files_write') assert.equal(calls[0].input.payload.content, original);
    if (toolId === 'files_read') assert.equal(root.querySelector('#code-editor').value, 'actual owner fixture content');
  });
}

test('invalid editor paths and a cancelled save make zero MCP calls', async t => {
  const { calls } = environment(t);
  const app = new VibeCodeApp({});
  const root = await editorRoot(app);
  root.querySelector('#vibecode-workspace-path').value = '/../host/private';
  await app.runWorkspaceOperation(root, 'files_write', root.querySelector('#vibecode-write-file'));
  assert.equal(calls.length, 0);
  assert.match(root.querySelector('#vibecode-workspace-result').textContent, /without parent traversal/);
  root.querySelector('#vibecode-workspace-path').value = '/swissknife/vdg/README.md';
  const pending = app.runWorkspaceOperation(root, 'files_write', root.querySelector('#vibecode-write-file'));
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
});

test('native Run confirms its exact artifact payload and labels the owner preview truthfully', async t => {
  const { calls } = environment(t, call => ({ validated: true, dry_run: true, mutation_performed: false, persisted: false, expected_cid: call.input.payload.cid }));
  const app = new VibeCodeApp({});
  const root = await editorRoot(app);
  root.querySelector('#code-editor').value = 'print("current code")';
  assert.equal(root.querySelector('#run-btn').dataset.nativeToolId, 'artifacts_put');
  const pending = app.runStreamlitApp(root);
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].binding_id, 'vibecode.ipfs_kit_py.persist_artifact');
  assert.equal(calls[0].tool_id, 'artifacts_put');
  const record = JSON.parse(Buffer.from(calls[0].input.payload.bytes_base64, 'base64').toString());
  assert.equal(record.code, 'print("current code")');
  assert.equal(record.kind, 'streamlit-code');
  assert.match(root.querySelector('#preview-section').textContent, /Validated artifact preview/);
  assert.match(root.querySelector('#preview-section').textContent, /not persisted or executed/);
});

test('native Run cancellation makes no request and preserves editor content', async t => {
  const { calls } = environment(t);
  const app = new VibeCodeApp({});
  const root = await editorRoot(app);
  root.querySelector('#code-editor').value = 'keep this draft';
  const pending = app.runStreamlitApp(root);
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(root.querySelector('#code-editor').value, 'keep this draft');
});

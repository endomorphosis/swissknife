import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { NotesApp } from '../../web/js/apps/notes.js';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';

const operations = [['persist_artifact', 'artifacts_put', true], ['retrieve_artifact', 'artifacts_get', false],
  ['append_event', 'dag_append', true], ['search_notes', 'semantic_search', false]];
const controls = operations.map(([operation, tool, governed]) => {
  const owner = tool === 'semantic_search' ? 'ipfs_datasets_py' : 'ipfs_kit_py';
  return { app_id: 'notes', owner, binding_id: `notes.${owner}.${operation}`, intent_id: `notes.${owner}.${operation}`,
    selected_tool_id: tool, preferred_tool_ids: [tool], mutates_remote_state: governed, status: 'available',
    ...(tool === 'semantic_search' ? { safe_payloads: { semantic_search: { collection: 'swissknife-vdg-notes', model: 'thenlper/gte-small', filters: { corpus: 'actual-index-fixture' } } } } : {}),
    transports: ['http', 'libp2p'], transport: 'http' };
});
async function until(predicate) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Expected Notes native transition did not occur.');
}
function environment(t, resultFor = call => ({ validated: true, dry_run: true, persisted: false, mutation_performed: false, expected_cid: call.input.payload.cid })) {
  const names = ['window', 'document', 'CustomEvent', 'localStorage', 'fetch', '__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__', '__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, { window, document: window.document, CustomEvent: window.CustomEvent, localStorage: window.localStorage,
    __SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__: 'libp2p', __SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__: true });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('/mcp/tools/bindings')) return { ok: true, json: async () => ({ controls }) };
    if (url === '/mcp/tools/dispositions') return { ok: true, json: async () => ({ entries: [] }) };
    assert.equal(url, '/mcp/tools/call');
    const call = JSON.parse(options.body);
    calls.push(call);
    return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'executed', correlation_id: call.correlation_id,
      result: { result: { content: [{ type: 'json', json: resultFor(call) }] } }, receipt: { receipt_id: 'unit-owner-receipt' } }) };
  };
  t.after(() => {
    window.happyDOM.abort();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  return { calls };
}
async function notesRoot() {
  const app = new NotesApp({});
  await app.assignCanonicalNoteCids();
  app.currentNote = app.notes[0];
  const root = document.createElement('section');
  root.className = 'notes-container';
  root.innerHTML = app.renderVdaG039Workflow();
  app.container = root;
  document.body.append(root);
  return { app, root, note: app.currentNote };
}
async function confirm(root, pending) {
  await until(() => root.querySelector('[data-gateway-confirm]'));
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
}

test('Notes persistence validates the current canonical record without assigning persisted state', async t => {
  const { calls } = environment(t);
  const { app, root, note } = await notesRoot();
  note.content = 'Current actual note content';
  const pending = app.persistVdaG039NoteCid();
  await until(() => root.querySelector('[data-gateway-confirm]'));
  assert.equal(calls.length, 0);
  root.querySelector('[data-gateway-confirm]').click();
  await pending;
  assert.equal(calls.length, 1, 'a preview cannot manufacture persisted CIDs for follow-up writes');
  assert.equal(calls[0].binding_id, 'notes.ipfs_kit_py.persist_artifact');
  assert.equal(calls[0].tool_id, 'artifacts_put');
  assert.equal(calls[0].transport, 'libp2p');
  const bytes = new Uint8Array(Buffer.from(calls[0].input.payload.bytes_base64, 'base64'));
  assert.equal(JSON.parse(new TextDecoder().decode(bytes)).content, 'Current actual note content');
  assert.equal(calls[0].input.payload.cid, await contentCidForBytes(bytes));
  assert.equal(note.persistedAt, undefined);
  assert.equal(app.vdaG039.notebookCid, null);
  assert.match(app.vdaG039.status, /Validated preview/);
});

test('Notes persistence cancellation preserves content and sends zero requests', async t => {
  const { calls } = environment(t);
  const { app, root, note } = await notesRoot();
  const original = note.content;
  const pending = app.persistVdaG039NoteCid();
  await until(() => root.querySelector('[data-gateway-cancel]'));
  root.querySelector('[data-gateway-cancel]').click();
  await pending;
  assert.equal(calls.length, 0);
  assert.equal(note.content, original);
  assert.equal(note.persistedAt, undefined);
});

for (const [method, field] of [['recordVdaG039Provenance', 'provenanceCid'], ['generateVdaG039Summary', 'summaryCid']]) {
  test(`Notes ${method} preview cannot claim a stored artifact`, async t => {
    const { calls } = environment(t);
    const { app, root } = await notesRoot();
    await confirm(root, app[method]());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool_id, 'artifacts_put');
    assert.equal(app.vdaG039[field], null);
    assert.equal(app.vdaG039.summaryPersisted, false);
  });
}

test('Notes semantic search preserves the actual query and exact datasets search operation', async t => {
  const result = { results: [{ cid: 'unit-existing-note', title: 'Owner result', score: 0.71 }], total_found: 1 };
  const { calls } = environment(t, () => result);
  const { app } = await notesRoot();
  await app.runVdaG039SemanticSearch('current query words');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].owner, 'ipfs_datasets_py');
  assert.equal(calls[0].binding_id, 'notes.ipfs_datasets_py.search_notes');
  assert.equal(calls[0].tool_id, 'semantic_search');
  assert.deepEqual(calls[0].input.payload, { query: 'current query words', top_k: 5, collection: 'swissknife-vdg-notes', model: 'thenlper/gte-small', filters: { corpus: 'actual-index-fixture' } });
  assert.equal(app.vdaG039.semanticResults[0].title, 'Owner result');
  assert.equal(app.vdaG039.semanticResults[0].score, 0.71);
});

test('a local canonical note CID is not treated as proof of a backend version', async t => {
  const { calls } = environment(t);
  const { app, note } = await notesRoot();
  assert.ok(note.cid, 'the local note has an actual computed content address');
  assert.equal(note.persistedAt, undefined);
  await app.recoverVdaG039Conflict();
  assert.equal(calls.length, 0);
  assert.equal(app.vdaG039.conflict.state, 'not-run');
});

test('Notes recovery compares an actual returned artifact and previews the merge without changing the local note', async t => {
  const remote = { schema: 'swissknife.notes.note.v1', title: 'Stored version', content: 'remote text', tags: ['remote'], favorite: false, color: 'blue' };
  const { calls } = environment(t, call => call.tool_id === 'artifacts_get'
    ? { found: true, verified: true, cid: call.input.payload.cid, bytes_base64: Buffer.from(JSON.stringify(remote)).toString('base64') }
    : { validated: true, dry_run: true, persisted: false, mutation_performed: false, expected_cid: call.input.payload.cid });
  const { app, root, note } = await notesRoot();
  const original = note.content;
  root.querySelector('[data-notes-base-cid]').value = 'unit-stored-note-cid';
  await confirm(root, app.recoverVdaG039Conflict());
  assert.deepEqual(calls.map(call => call.tool_id), ['artifacts_get', 'artifacts_put']);
  assert.equal(calls[0].input.payload.cid, 'unit-stored-note-cid');
  const merged = JSON.parse(Buffer.from(calls[1].input.payload.bytes_base64, 'base64').toString());
  assert.equal(merged.content, original);
  assert.ok(merged.tags.includes('remote'));
  assert.equal(note.content, original);
  assert.equal(note.persistedAt, undefined);
  assert.equal(app.vdaG039.conflict.state, 'validated-preview');
  assert.equal(app.vdaG039.conflict.recoveredCid, null);
});

test('creating a local note makes zero backend requests', async t => {
  const { calls } = environment(t);
  const { app } = await notesRoot();
  app.refreshContent = () => {};
  const previous = app.notes.length;
  await app.createNewNote();
  assert.equal(app.notes.length, previous + 1);
  assert.equal(calls.length, 0);
  assert.equal(app.currentNote.sync.state, 'local-only');
});

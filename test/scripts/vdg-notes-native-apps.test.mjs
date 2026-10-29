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

test('Notes opens actual indexed document content without uploading or indexing local edits', async t => {
  const document = { text: 'Actual indexed body', metadata: { title: 'Owner indexed note', content: 'Actual indexed body' } };
  const { calls } = environment(t, () => ({ results: [{ score: 0.93, document,
    document_provenance: { source: 'duckdb_authority', document_id: 'unit-published-document' } }] }));
  const { app, root, note } = await notesRoot();
  const original = note.content;
  app.refreshContent = () => { root.innerHTML = app.renderVdaG039Workflow() + app.renderNoteEditor(); };
  app.refreshContent();
  root.querySelector('#notes-search-collection').value = 'existing-owned-index';
  await app.runVdaG039SemanticSearch('actual query');
  assert.equal(calls.length, 1); assert.equal(calls[0].tool_id, 'semantic_search');
  assert.equal(calls[0].input.payload.collection, 'existing-owned-index');
  assert.equal(calls[0].input.payload.texts, undefined); assert.equal(calls[0].input.payload.documents, undefined);
  assert.equal(app.vdaG039.semanticResults[0].content, document.text);
  assert.equal(root.querySelector('#notes-open-semantic-result-0').disabled, false);
  await app.openVdaG039SemanticResult(0);
  assert.equal(app.currentNote.title, document.metadata.title); assert.equal(app.currentNote.content, document.text);
  assert.equal(root.querySelector('#note-content').value, document.text);
  assert.equal(note.content, original, 'opening a backend row cannot overwrite another local note');
  assert.equal(calls.length, 1, 'search/open is not a remote index write');
  assert.match(root.textContent, /not added to that index automatically/);
});

test('Notes never substitutes a local note when the owner returns only IDs', async t => {
  const { calls } = environment(t, () => ({ results: [{ score: 0.9, document: { id: 'doc_0', source: 'duckdb_authority' } }] }));
  const { app } = await notesRoot();
  await app.runVdaG039SemanticSearch('local note title');
  assert.equal(calls.length, 1); assert.deepEqual(app.vdaG039.semanticResults, []);
  assert.equal(app.vdaG039.semanticBackend, null); assert.match(app.vdaG039.status, /IDs without a note title/);
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
  const storedCid = await contentCidForBytes(new TextEncoder().encode(JSON.stringify(remote)));
  root.querySelector('[data-notes-base-cid]').value = storedCid;
  await confirm(root, app.recoverVdaG039Conflict());
  assert.deepEqual(calls.map(call => call.tool_id), ['artifacts_get', 'artifacts_put']);
  assert.equal(calls[0].input.payload.cid, storedCid);
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

// Authored owner/DOM fixtures test transitions; they do not grant live app acceptance.
const recoveryDocument = { text: 'Actual indexed recovery body', metadata: { title: 'Indexed recovery note' } };
function recoveryResponse() {
  return { results: [{ document: recoveryDocument, document_provenance: {
    source: 'duckdb_authority', document_id: 'authored-published-document', payload_digest: `sha256:${'a'.repeat(64)}`
  } }] };
}
function pressSave(app) { app.handleKeyboardSafeEditing({ ctrlKey: true, key: 's', preventDefault() {} }); }
async function failedRecoveryEditor(t, resultFor) {
  const fixture = environment(t, resultFor);
  const value = await notesRoot();
  const { app, root } = value;
  app.refreshContent = () => { root.innerHTML = app.renderVdaG039Workflow() + app.renderNoteEditor(); };
  app.refreshContent();
  root.querySelector('[data-notes-base-cid]').value = 'invalid-reference';
  await app.recoverVdaG039Conflict();
  assert.equal(app.vdaG039.conflict.state, 'failed');
  assert.equal(root.querySelector('[data-notes-base-cid]').value, 'invalid-reference', 'the failed reference is retained until the user clears it');
  assert.equal(fixture.calls.length, 0, 'invalid reference is refused before any owner call');
  return { ...fixture, ...value };
}

test('Notes recovery requires a fresh authoritative row, opening it, clearing the reference and verified local save', async t => {
  const { app, root, calls, note } = await failedRecoveryEditor(t, recoveryResponse);
  const original = note.content;
  root.querySelector('[data-notes-base-cid]').value = '';
  pressSave(app);
  assert.equal(app.vdaG039.editorRecovery.state, 'needs-retry', 'clearing the reference and saving alone cannot claim recovery');
  assert.match(app.vdaG039.status, /failed/);
  await app.runVdaG039SemanticSearch('actual recovery query');
  assert.equal(app.vdaG039.editorRecovery.state, 'searched');
  await app.openVdaG039SemanticResult(0);
  assert.equal(app.vdaG039.editorRecovery.state, 'opened');
  assert.equal(app.currentNote.content, recoveryDocument.text);
  assert.equal(note.content, original, 'restoring the owner row does not overwrite another local note');
  root.querySelector('[data-notes-base-cid]').value = 'still-invalid';
  pressSave(app);
  assert.equal(app.vdaG039.editorRecovery.state, 'opened', 'the invalid reference must actually be cleared');
  root.querySelector('[data-notes-base-cid]').value = '';
  pressSave(app);
  assert.equal(app.vdaG039.editorRecovery.state, 'saved-local');
  assert.match(app.vdaG039.status, /^Ready.*saved locally/);
  assert.equal(root.querySelector('#vda-g039-status').dataset.notesEditorRecovery, 'saved-local');
  const stored = JSON.parse(localStorage.getItem('swissknife-notes')).find(item => item.id === app.currentNote.id);
  assert.equal(stored.title, recoveryDocument.metadata.title);
  assert.equal(stored.content, recoveryDocument.text);
  assert.equal(app.vdaG039.conflict.state, 'failed', 'the earlier failed artifact request remains truthful in diagnostics');
  assert.match(app.vdaG039.conflict.message, /not a real artifact CID/);
  assert.deepEqual(calls.map(call => call.tool_id), ['semantic_search'], 'recovery never silently writes an index or artifact');
});

test('Notes owner failure during retry retains text and cannot claim a recovered editor', async t => {
  const { app, root, note } = await failedRecoveryEditor(t, () => { throw new Error('authored owner unavailable'); });
  const original = note.content;
  root.querySelector('[data-notes-base-cid]').value = '';
  await app.runVdaG039SemanticSearch('actual recovery query');
  pressSave(app);
  assert.equal(app.currentNote.content, original);
  assert.deepEqual(app.vdaG039.semanticResults, []);
  assert.equal(app.vdaG039.editorRecovery.state, 'needs-retry');
  assert.match(app.vdaG039.status, /failed.*owner unavailable/);
  assert.notEqual(root.querySelector('#vda-g039-status').dataset.notesEditorRecovery, 'saved-local');
});

test('Notes legacy or stale search rows cannot satisfy recovery', async t => {
  const { app, root } = await failedRecoveryEditor(t, () => ({ results: [{ document: recoveryDocument }] }));
  root.querySelector('[data-notes-base-cid]').value = '';
  await app.runVdaG039SemanticSearch('actual recovery query');
  await app.openVdaG039SemanticResult(0);
  pressSave(app);
  assert.equal(app.vdaG039.editorRecovery.state, 'searched', 'a document without native published provenance cannot mark recovery');
  app.vdaG039.semanticResults[0].provenance = recoveryResponse().results[0].document_provenance;
  app.vdaG039.semanticResults[0].documentId = 'authored-published-document';
  app.vdaG039.semanticResults[0].searchRevision -= 1;
  await app.openVdaG039SemanticResult(0);
  pressSave(app);
  assert.equal(app.vdaG039.editorRecovery.state, 'searched', 'a previous search revision cannot mark recovery');
});

test('Notes failed local storage readback cannot claim recovered or saved status', async t => {
  const { app, root } = await failedRecoveryEditor(t, recoveryResponse);
  root.querySelector('[data-notes-base-cid]').value = '';
  await app.runVdaG039SemanticSearch('actual recovery query');
  await app.openVdaG039SemanticResult(0);
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { setItem() {}, getItem() { return '[]'; } };
  const originalError = console.error; console.error = () => {};
  try { pressSave(app); } finally { globalThis.localStorage = previousStorage; console.error = originalError; }
  assert.equal(app.vdaG039.editorRecovery.state, 'opened');
  assert.match(app.vdaG039.status, /Local save failed/);
  assert.equal(app.currentNote.content, recoveryDocument.text);
  assert.notEqual(root.querySelector('#vda-g039-status').dataset.notesEditorRecovery, 'saved-local');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { captureInputFingerprint, inventorySourceFingerprint } = require('./vdg-capture-fingerprint.cjs');
const { deriveFreshInputs } = require('./build-vdg-inputs.cjs');
const { deriveCurrentBindingLedger } = require('./vdg-current-binding-ledger.cjs');
const { FAMILIES } = require('./vdg-evidence.cjs');
const { checkCapture } = require('./check-vdg-capture.cjs');
const { openCaptureCheckpoint } = require('./vdg-capture-checkpoint.cjs');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-fingerprint-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => { const filename = path.join(root, name); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, typeof value === 'string' ? value : JSON.stringify(value)); };
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const change = (name, fn) => { const value = read(name); fn(value); write(name, value); };
  const app = (app_id, owner, tool) => ({ app_id, aliases: [], disposition: 'tool_backed', backend_bindings: [{
    binding_id: `${app_id}.${owner}.read`, owner, mediated_intent: { mutates_remote_state: false }, ui_control: { confirmation: 'none' },
    tool_selection: { preferred_tool_ids: [tool] }, transport_policy: { allowed_transports: ['http', 'libp2p'] },
  }] });
  const contract = { apps: [app('file-manager', 'ipfs_kit_py', 'ipfs_cat'), app('ai-chat', 'ipfs_kit_py', 'ipfs_cat')] };
  const raw = { schema: 'swissknife.rendered-control-census.v1', collection: 'live-dom', source_template: false, clicked: false,
    app_count: 2, row_count: 2, rows: contract.apps.map(app => ({ app_id: app.app_id, launch_id: app.app_id,
      selector: `#${app.app_id}-read`, role: 'button', accessible_name: 'Read actual bytes',
      data_native_gateway_binding: app.backend_bindings[0].binding_id, data_native_gateway_tool: 'ipfs_cat' })) };
  const inputs = deriveFreshInputs(raw, contract);
  const catalog = { schema: 'swissknife.all-tools-disposition-catalog.v1', entries: [
    { owner: 'ipfs_kit_py', tool_id: 'ipfs_cat', disposition: { kind: 'app_visible', app_id: 'file-manager' } },
  ] };
  const historical = { schema: 'swissknife.all-app-live-binding-gap-ledger.v1', tools: [{ owner: 'ipfs_kit_py', name: 'ipfs_cat', current_state: 'old-history' }] };
  const discovery = { schema: 'swissknife.vdg-owner-tools.v1', owners: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'].map(owner => ({ owner,
    endpoint: `http://127.0.0.1:1234/${owner}`, state: 'live-discovered', tools: [{ name: owner === 'ipfs_kit_py' ? 'ipfs_cat' : 'other_owner_tool' }] })) };
  const ledger = deriveCurrentBindingLedger({ historical, historicalPath: 'vdg/inventory/history/original.json', discovery,
    contract, matrix: inputs.matrix, catalog });
  write('control-census.json', inputs.census); write('control-tool-matrix.json', inputs.matrix);
  write('all-app-live-binding-gap-ledger.json', ledger); write('all-tools-disposition-catalog.json', catalog);
  write('web/js/apps/file-manager.js', 'export const storageVersion = 1;');
  write('web/js/apps/ai-chat.js', 'export const chatVersion = 1;');
  const fingerprint = (family = 'vdg-storage', transport = 'http') => captureInputFingerprint(family, transport,
    { sourceRoot: root, evidenceRoot: root, definition: FAMILIES[family] });
  const updateSummary = ledger => { ledger.summary.exact_tool_record_count = ledger.tools.length;
    ledger.summary.app_visible_binding_count = ledger.tools.reduce((count, tool) => count + tool.binding.rows.length, 0);
    ledger.summary.gap_count = ledger.gaps.length; };
  return { root, write, read, change, fingerprint, updateSummary };
}

test('unrelated current controls, shared-tool bindings and historical archive churn preserve a family fingerprint', t => {
  const f = fixture(t), before = f.fingerprint(), datasetsBefore = f.fingerprint('vdg-datasets');
  for (const name of ['control-census.json', 'control-tool-matrix.json']) f.change(name, value => {
    value.rows.find(row => row.app_id === 'ai-chat').selector = '#new-real-chat-action';
    value.rows.push({ ...value.rows.find(row => row.app_id === 'ai-chat'), selector: '#another-real-chat-action' });
    value.row_count = value.rows.length; value.generated_at = 'another inventory observation';
    value.input_fingerprint = 'another global inventory digest';
    value.provenance.sources.forEach(source => { source.semantic_sha256 = 'changed global source digest'; });
    if (value.disposition_counts) value.disposition_counts.invoke++;
  });
  f.change('all-app-live-binding-gap-ledger.json', value => {
    value.generated_at = 'fresh clock'; value.provenance.historical_path = 'vdg/inventory/history/new-archive.json';
    for (const key of ['historical_sha256', 'discovery_sha256', 'contract_sha256', 'matrix_sha256', 'catalog_sha256']) value.provenance[key] = 'new global digest';
    for (const tool of value.tools) tool.history = { source_path: 'new archive', current_state: 'different historical result' };
    const tool = value.tools.find(tool => tool.name === 'ipfs_cat');
    tool.binding.rows.find(row => row.app_id === 'ai-chat').selector = '#new-real-chat-action';
    tool.binding.rows.push({ ...tool.binding.rows.find(row => row.app_id === 'ai-chat'), selector: '#another-real-chat-action' });
    tool.binding.app_visible_row_count = tool.binding.rows.length;
    value.tools.push({ tool_id: 'ipfs_kit_py:historical_only', owner: 'ipfs_kit_py', name: 'historical_only', history: { current_state: 'old' },
      current_state: 'missing', discovery_state: 'not-advertised', binding: { state: 'not-app-visible', app_visible_row_count: 0, rows: [] } });
    value.backend_owners[0].tool_count++;
    f.updateSummary(value);
  });
  assert.equal(f.fingerprint(), before);
  assert.notEqual(f.fingerprint('vdg-datasets'), datasetsBefore);
});

for (const [name, mutation] of [
  ['relevant control identity', f => f.change('control-tool-matrix.json', v => { v.rows[0].selector = '#changed-storage-control'; })],
  ['relevant census alias', f => f.change('control-census.json', v => { v.rows[0].launch_id = 'storage-alias'; v.launch_ids.push('storage-alias'); })],
  ['relevant control policy', f => f.change('control-tool-matrix.json', v => { v.rows[0].disposition = 'deny'; })],
  ['wrong family assignment', f => f.change('control-tool-matrix.json', v => { v.rows[0].family = 'vdg-datasets'; })],
  ['relevant binding transport', f => f.change('all-app-live-binding-gap-ledger.json', v => { v.tools.find(x => x.name === 'ipfs_cat').binding.rows[0].transports = ['http']; })],
  ['relevant discovery state', f => f.change('all-app-live-binding-gap-ledger.json', v => { v.tools.find(x => x.name === 'ipfs_cat').discovery_state = 'not-advertised'; })],
  ['relevant exact binding gap', f => f.change('all-app-live-binding-gap-ledger.json', v => { v.gaps.push({ app_id: 'file-manager', code: 'rendered_tool_not_discovered', owner: 'ipfs_kit_py', tool_id: 'ipfs_cat' }); f.updateSummary(v); })],
  ['global unscoped gap', f => f.change('control-tool-matrix.json', v => { v.uncovered_app_visible_tools.push({ owner: 'ipfs_kit_py', tool_id: 'unresolved-global-obligation' }); })],
  ['schema version', f => f.change('control-census.json', v => { v.schema += '.future'; })],
  ['owner endpoint', f => f.change('all-app-live-binding-gap-ledger.json', v => { v.backend_owners[0].endpoint = 'http://127.0.0.1:9999/mcp'; })],
  ['global catalog obligation', f => f.change('all-tools-disposition-catalog.json', v => { v.entries.push({ owner: 'ipfs_kit_py', tool_id: 'server_secret', disposition: { kind: 'server_only' } }); })],
  ['family application source', f => f.write('web/js/apps/file-manager.js', 'actual storage code changed')],
  ['shared gateway source', f => f.write('web/js/live-tool-gateway.js', 'actual gateway code changed')],
]) test(`${name} invalidates existing family capture identity`, t => {
  const f = fixture(t), before = f.fingerprint(); mutation(f); assert.notEqual(f.fingerprint(), before);
});

test('unrelated app source and scoped gaps do not invalidate storage, but fixture bytes and actual routing do', t => {
  const f = fixture(t), before = f.fingerprint();
  f.write('web/js/apps/ai-chat.js', 'actual chat implementation changed');
  f.change('all-app-live-binding-gap-ledger.json', v => { v.gaps.push({ app_id: 'ai-chat', code: 'real-chat-gap' }); f.updateSummary(v); });
  assert.equal(f.fingerprint(), before);
  const key = 'SWISSKNIFE_VDG_PAYLOAD_FIXTURES', old = process.env[key];
  const routeKey = 'SWISSKNIFE_IPFS_KIT_MCP_URL', oldRoute = process.env[routeKey];
  t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old;
    if (oldRoute === undefined) delete process.env[routeKey]; else process.env[routeKey] = oldRoute; });
  f.write('fixture.json', { actual_cid: 'first', generated_at: 'first' }); process.env[key] = path.join(f.root, 'fixture.json');
  const fixtureBefore = f.fingerprint(); f.write('fixture.json', { actual_cid: 'first', generated_at: 'changed' });
  assert.notEqual(f.fingerprint(), fixtureBefore, 'fixture payload bytes must never receive inventory clock filtering');
  const routeBefore = f.fingerprint(); process.env[routeKey] = 'http://127.0.0.1:18015/mcp';
  assert.notEqual(f.fingerprint(), routeBefore);
});

for (const variant of ['unknown-schema', 'unknown-adapter', 'malformed-current']) test(`${variant} inventory retains raw byte identity`, t => {
  const f = fixture(t);
  f.change('control-tool-matrix.json', v => { if (variant === 'unknown-schema') v.schema = 'future.schema';
    if (variant === 'unknown-adapter') v.provenance.adapter = 'future-adapter';
    if (variant === 'malformed-current') v.row_count++; });
  const before = f.fingerprint(); f.change('control-tool-matrix.json', v => { v.generated_at = 'must remain bound when scope is unknown'; });
  assert.notEqual(f.fingerprint(), before);
});

test('unrelated inventory refresh reuses real checkpoint/acquisition identity without weakening report SHA or acceptance', t => {
  const f = fixture(t), fp = f.fingerprint();
  const row = { ...f.read('control-tool-matrix.json').rows[0], failure_reasons: ['owner-did-not-execute'] };
  const directory = path.join(f.root, 'vdg/checkpoints');
  openCaptureCheckpoint({ directory, target: 'storage', transport: 'http', inputFingerprint: fp }).save({ rows: [row], observations: [], pageerrors: [] });
  const stamp = new Date().toISOString(), runId = 'storage-http-source-bound';
  const reportBytes = JSON.stringify({ schema: 'swissknife.virtual-desktop-live-click.v1', target: 'storage', generated_at: stamp,
    decision: 'no_go', row_count: 1, rows: [row] });
  f.write(`vdg/runs/${runId}.json`, reportBytes);
  f.write('vdg/connectors/storage.json', { schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'storage', runs: [{
    run_id: runId, transport: 'http', report_path: `vdg/runs/${runId}.json`, completed_at: stamp, capture_complete: true,
    input_fingerprint: fp, report_sha256: digest(reportBytes),
  }] });
  for (const name of ['control-census.json', 'control-tool-matrix.json']) f.change(name, v => { v.rows[1].selector = '#repaired-chat'; });
  assert.equal(f.fingerprint(), fp);
  assert.equal(openCaptureCheckpoint({ directory, target: 'storage', transport: 'http', inputFingerprint: f.fingerprint() }).snapshot.rows.length, 1);
  const receipt = checkCapture('vdg-storage', 'http', { sourceRoot: f.root, evidenceRoot: f.root });
  assert.equal(receipt.capture_complete, true); assert.equal(receipt.acceptance_decision, 'no_go'); assert.equal(receipt.completion_authority, false);
  f.write(`vdg/runs/${runId}.json`, reportBytes + '\n');
  assert.throws(() => checkCapture('vdg-storage', 'http', { sourceRoot: f.root, evidenceRoot: f.root }), /report hash/);
  f.change('control-tool-matrix.json', v => { v.rows[0].selector = '#changed-storage'; });
  assert.equal(openCaptureCheckpoint({ directory, target: 'storage', transport: 'http', inputFingerprint: f.fingerprint() }).snapshot.rows.length, 0);
});

test('inventory source identity covers all app code and helper without an output JSON dependency cycle', t => {
  const f = fixture(t), source = () => inventorySourceFingerprint({ sourceRoot: f.root, evidenceRoot: f.root });
  const before = source();
  for (const name of ['control-census.json', 'control-tool-matrix.json', 'all-app-live-binding-gap-ledger.json', 'all-tools-disposition-catalog.json',
    'capability-matrix.json', 'vdg/inventory/rendered-control-census.json', 'vdg/inventory/owner-tools.json']) f.write(name, { source_fingerprint: before, generated_at: 'new output' });
  assert.equal(source(), before, 'writing the inventory output must never invalidate its own source identity');
  f.write('web/js/apps/ai-chat.js', 'actual app source outside storage changed');
  assert.notEqual(source(), before, 'all app sources must bind the global raw census');
  const after = source(); f.write('web/js/apps/new-native-app.js', 'a newly added app'); assert.notEqual(source(), after);
  const beforeHelper = source(); f.write('scripts/vdg-inventory-contract.cjs', 'new inventory contract implementation');
  assert.notEqual(source(), beforeHelper);
});

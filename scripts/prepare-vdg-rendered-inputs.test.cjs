'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { deriveRenderedInputs, semanticHash, checkRenderedInputs, prepareRenderedInputs } = require('./prepare-vdg-rendered-inputs.cjs');

function fixture() {
  const rows = [
    { app_id: 'file-manager', launch_id: 'file-manager', selector: '#read', role: 'button', accessible_name: 'Read' },
    { app_id: 'file-manager', launch_id: 'files-alias', selector: '#read', role: 'button', accessible_name: 'Read via alias' },
    { app_id: 'notes', launch_id: 'notes', selector: '#local', role: 'button', accessible_name: 'Edit notes' },
  ];
  const census = { schema: 'swissknife.rendered-control-census.v1', collection: 'live-dom', source_template: false,
    clicked: false, app_count: 2, row_count: rows.length, rows };
  const matrix = { schema: 'swissknife.orb-idl-control-matrix.v1', collection: 'census-ledger-join',
    generated_at: 'old', clicked: false, decision: 'GO', app_ids: ['file-manager', 'notes'],
    family_lanes: { 'vog-storage': ['file-manager'], 'vog-datasets': ['notes'] },
    row_count: rows.length, disposition_counts: { invoke: 2, 'local-only': 1 },
    uncovered_app_visible_tools: [], uncovered_app_visible_count: 0,
    rows: rows.map(row => ({ ...row, family: row.app_id === 'notes' ? 'vog-datasets' : 'vog-storage',
      disposition: row.app_id === 'notes' ? 'local-only' : 'invoke',
      tool_id: row.app_id === 'notes' ? '' : 'mcp++:file-manager.ipfs_kit_py.list_files',
      tool_name: row.app_id === 'notes' ? '' : 'list_files',
      reason: row.app_id === 'notes' ? 'local-edit' : 'gateway-binding',
      idl_method: row.app_id === 'notes' ? 'none' : 'request_action', clicked: false,
      data_live_gateway_binding: row.app_id === 'notes' ? '' : 'file-manager.ipfs_kit_py.list_files',
      dry_run: row.app_id !== 'notes', ledger_match: row.app_id !== 'notes' })),
  };
  return { census, matrix };
}

function directory(t) {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-rendered-inputs-'));
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(evidenceRoot, 'vog'));
  const data = fixture();
  const writeSources = () => {
    fs.writeFileSync(path.join(evidenceRoot, 'vog/rendered-control-census.json'), JSON.stringify(data.census));
    fs.writeFileSync(path.join(evidenceRoot, 'vog/orb-idl-control-matrix.json'), JSON.stringify(data.matrix));
  };
  writeSources();
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, 'prepare-vdg-rendered-inputs.cjs'),
    '--evidence-root', evidenceRoot, ...args], { encoding: 'utf8' });
  return { evidenceRoot, data, writeSources, run };
}

test('projects the exact live census and aliases without importing a GO decision or zero gap count', () => {
  const { census, matrix } = fixture();
  const before = structuredClone({ census, matrix });
  const output = deriveRenderedInputs(census, matrix);
  assert.deepEqual({ census, matrix }, before, 'projection modified the source proof');
  assert.equal(output.census.schema, 'swissknife.virtual-desktop-control-census.v1');
  assert.equal(output.matrix.schema, 'swissknife.virtual-desktop-control-tool-matrix.v1');
  assert.equal(output.census.collection, 'live-dom');
  assert.deepEqual(output.census.launch_ids, ['file-manager', 'files-alias', 'notes']);
  assert.equal(output.matrix.rows[1].launch_id, 'files-alias');
  for (let index = 0; index < matrix.rows.length; index += 1) {
    const { family, ...preserved } = output.matrix.rows[index];
    assert.equal(family, matrix.rows[index].family.replace(/^vog-/, 'vdg-'));
    const { family: _family, ...original } = matrix.rows[index];
    assert.deepEqual(preserved, original, 'tool IDs, dispositions, reasons, and native metadata changed');
  }
  for (const document of [output.census, output.matrix]) {
    assert.equal(document.decision, 'no_go');
    assert.equal(document.clicked, false);
    assert.equal(document.source_template, false);
    assert.equal(document.coverage_status, 'not_evaluated');
    assert.equal(document.work_complete, false);
    assert.equal(document.completion_authority, false);
    assert.equal(document.provenance.live_dom.launch_count, 3);
    assert.equal(document.provenance.sources[0].semantic_sha256, semanticHash(census));
  }
  assert.equal(output.matrix.uncovered_app_visible_count, null);
  assert.deepEqual(output.matrix.uncovered_app_visible_tools, []);
  assert.equal(output.matrix.provenance.source_coverage_claims.uncovered_app_visible_count, 0);
  assert.match(output.matrix.provenance.source_coverage_claims.authority, /historical-only/);
});

test('only an explicit preparation writes outputs, and check is read only', t => {
  const f = directory(t);
  assert.equal(fs.existsSync(path.join(f.evidenceRoot, 'control-census.json')), false);
  const originals = ['vog/rendered-control-census.json', 'vog/orb-idl-control-matrix.json']
    .map(relative => fs.readFileSync(path.join(f.evidenceRoot, relative), 'utf8'));
  assert.equal(f.run('--check').status, 1);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const filename = path.join(f.evidenceRoot, 'control-tool-matrix.json');
  const content = fs.readFileSync(filename, 'utf8');
  const modified = fs.statSync(filename).mtimeMs;
  assert.equal(f.run('--check').status, 0);
  assert.equal(fs.readFileSync(filename, 'utf8'), content);
  assert.equal(fs.statSync(filename).mtimeMs, modified);
  originals.forEach((original, index) => assert.equal(fs.readFileSync(path.join(f.evidenceRoot,
    ['vog/rendered-control-census.json', 'vog/orb-idl-control-matrix.json'][index]), 'utf8'), original));
});

test('legacy producer cannot overwrite a modern VDG inventory or its generated outputs', t => {
  for (const source of ['modern-raw', 'modern-output']) {
    const f = directory(t);
    prepareRenderedInputs({ evidenceRoot: f.evidenceRoot });
    if (source === 'modern-raw') {
      fs.mkdirSync(path.join(f.evidenceRoot, 'vdg/inventory'), { recursive: true });
      fs.writeFileSync(path.join(f.evidenceRoot, 'vdg/inventory/rendered-control-census.json'), JSON.stringify(f.data.census));
    } else {
      const filename = path.join(f.evidenceRoot, 'control-tool-matrix.json');
      const value = JSON.parse(fs.readFileSync(filename)); value.provenance.adapter = 'fresh-vdg-live-dom@1';
      fs.writeFileSync(filename, JSON.stringify(value));
    }
    const filenames = ['control-census.json', 'control-tool-matrix.json'].map(relative => path.join(f.evidenceRoot, relative));
    const before = filenames.map(filename => fs.readFileSync(filename, 'utf8'));
    assert.throws(() => prepareRenderedInputs({ evidenceRoot: f.evidenceRoot }), /legacy_projection_superseded_requires_fresh_source/);
    assert.throws(() => checkRenderedInputs({ evidenceRoot: f.evidenceRoot }), /legacy_projection_superseded_requires_fresh_source/);
    assert.deepEqual(filenames.map(filename => fs.readFileSync(filename, 'utf8')), before);
  }
});

test('check accepts equivalent row/key order and timestamps without rewriting inputs or outputs', t => {
  const f = directory(t);
  prepareRenderedInputs(f);
  f.data.census.generated_at = 'new collection label';
  f.data.matrix.generated_at = 'new join label';
  f.data.matrix.rows.reverse();
  f.data.census.rows.reverse();
  f.writeSources();
  assert.doesNotThrow(() => checkRenderedInputs(f));
});

test('does not read a VOG aggregate or runtime report as acceptance authority', t => {
  const f = directory(t);
  fs.writeFileSync(path.join(f.evidenceRoot, 'vog/gui-orb-idl-coverage.json'), '{ malformed unrelated aggregate');
  fs.writeFileSync(path.join(f.evidenceRoot, 'gui-mcp-coverage.json'), 'do not overwrite runtime proof');
  prepareRenderedInputs(f);
  assert.equal(fs.readFileSync(path.join(f.evidenceRoot, 'gui-mcp-coverage.json'), 'utf8'), 'do not overwrite runtime proof');
  assert.equal(checkRenderedInputs(f).matrix.decision, 'no_go');
});

test('missing or invalid live input fails closed before modifying either generated output', t => {
  const f = directory(t);
  const filenames = ['control-census.json', 'control-tool-matrix.json'];
  filenames.forEach(relative => fs.writeFileSync(path.join(f.evidenceRoot, relative), 'existing evidence'));
  fs.unlinkSync(path.join(f.evidenceRoot, 'vog/rendered-control-census.json'));
  assert.throws(() => prepareRenderedInputs(f), /cannot read vog\/rendered-control-census/);
  filenames.forEach(relative => assert.equal(fs.readFileSync(path.join(f.evidenceRoot, relative), 'utf8'), 'existing evidence'));
});

test('check rejects stale source controls and all generated metadata tampering', t => {
  const f = directory(t);
  prepareRenderedInputs(f);
  const filename = path.join(f.evidenceRoot, 'control-tool-matrix.json');
  const original = fs.readFileSync(filename, 'utf8');
  for (const change of [
    value => { value.decision = 'GO'; }, value => { value.rows[0].tool_id = 'unrelated_tool'; },
    value => { value.rows[0].disposition = 'local-only'; }, value => { value.provenance.live_dom.source_template = true; },
    value => { value.provenance.sources[0].semantic_sha256 = 'stale'; },
  ]) {
    const changed = JSON.parse(original); change(changed);
    fs.writeFileSync(filename, JSON.stringify(changed));
    assert.throws(() => checkRenderedInputs(f), /differs from validated live sources/);
  }
  fs.writeFileSync(filename, original);
  f.data.census.rows[0].selector = f.data.matrix.rows[0].selector = '#new-live-control';
  f.writeSources();
  assert.throws(() => checkRenderedInputs(f), /differs from validated live sources/);
});

test('preserves explicit source gaps while leaving current VDG gap count unevaluated', () => {
  const input = fixture();
  input.matrix.uncovered_app_visible_tools = [{ kind: 'uncovered-app-visible-tool', tool_id: 'missing_tool', owner: 'owner' }];
  input.matrix.uncovered_app_visible_count = 1;
  const output = deriveRenderedInputs(input.census, input.matrix);
  assert.deepEqual(output.matrix.uncovered_app_visible_tools, input.matrix.uncovered_app_visible_tools);
  assert.equal(output.matrix.uncovered_app_visible_count, null);
  assert.equal(output.matrix.provenance.source_coverage_claims.uncovered_app_visible_count, 1);
});

test('rejects alias loss even if canonical app and selector remain represented', () => {
  const input = fixture();
  input.matrix.rows.splice(1, 1);
  input.matrix.row_count -= 1;
  assert.throws(() => deriveRenderedInputs(input.census, input.matrix), /exact census app\/launch\/selector keys; alias loss/);
});

for (const [label, change, expected] of [
  ['source template', input => { input.census.source_template = true; }, /live-dom/],
  ['nonbrowser collection', input => { input.census.collection = 'source-template'; }, /live-dom/],
  ['clicked census', input => { input.census.clicked = true; }, /clicked:false/],
  ['template selector', input => { input.census.rows[0].selector = '#${unresolved}'; }, /template selector/],
  ['row count mismatch', input => { input.census.row_count += 1; }, /row_count/],
  ['app count mismatch', input => { input.census.app_count += 1; }, /app_count/],
  ['missing launch identity', input => { delete input.census.rows[1].launch_id; }, /identity is incomplete/],
  ['duplicate census control', input => { input.census.rows[1] = structuredClone(input.census.rows[0]); }, /duplicate control/],
  ['duplicate matrix control', input => { input.matrix.rows[1] = structuredClone(input.matrix.rows[0]); }, /duplicate control/],
  ['missing matrix app', input => { input.matrix.app_ids.pop(); }, /app_ids/],
  ['invalid disposition', input => { input.matrix.rows[0].disposition = 'unclassified'; }, /disposition or reason/],
  ['missing disposition reason', input => { input.matrix.rows[0].reason = ''; }, /disposition or reason/],
  ['missing invocation identity', input => { input.matrix.rows[0].tool_id = ''; }, /missing tool_id/],
  ['wrong family', input => { input.matrix.rows[0].family = 'vog-datasets'; }, /family does not match/],
  ['clicked matrix control', input => { input.matrix.rows[0].clicked = true; }, /unclicked live DOM/],
  ['unsupported IDL method', input => { input.matrix.rows[0].idl_method = 'fabricated'; }, /IDL method/],
  ['inconsistent gap count', input => { input.matrix.uncovered_app_visible_count = 3; }, /gap count/],
]) {
  test(`refuses ${label} without projecting misleading evidence`, () => {
    const input = fixture(); change(input);
    assert.throws(() => deriveRenderedInputs(input.census, input.matrix), expected);
  });
}

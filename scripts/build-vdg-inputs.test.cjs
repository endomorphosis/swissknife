const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveFreshInputs } = require('./build-vdg-inputs.cjs');
function fixture() {
  const binding = { binding_id: 'vibecode.ipfs_kit_py.list_virtual_files', owner: 'ipfs_kit_py', tool_selection: { preferred_tool_ids: ['files_ls', 'files_read', 'files_write'] },
    mediated_intent: { mutates_remote_state: true }, ui_control: { confirmation: 'policy' } };
  const contract = { apps: [{ app_id: 'vibecode', aliases: ['code-editor'], disposition: 'tool_backed', backend_bindings: [binding] }] };
  const rows = ['vibecode', 'code-editor'].flatMap(launch_id => ['files_ls', 'files_read', 'files_write'].map(tool => ({ app_id: 'vibecode', launch_id,
    selector: `[data-native-gateway-binding="${binding.binding_id}"][data-native-tool-id="${tool}"]`, role: 'button', accessible_name: tool,
    data_native_gateway_binding: binding.binding_id, data_native_gateway_tool: tool })));
  return { contract, census: { schema: 'swissknife.rendered-control-census.v1', collection: 'live-dom', source_template: false, clicked: false, app_count: 1, row_count: rows.length, rows } };
}
test('fresh alias-aware join preserves all exact native tools and withholds GO', () => {
  const f = fixture(); const result = deriveFreshInputs(f.census, f.contract);
  assert.equal(result.matrix.rows.length, 6);
  assert.deepEqual(result.matrix.launch_ids, ['code-editor', 'vibecode']);
  assert.deepEqual(result.matrix.rows.map(row => row.tool_id), ['files_ls', 'files_read', 'files_write', 'files_ls', 'files_read', 'files_write']);
  assert.equal(result.matrix.decision, 'no_go'); assert.equal(result.matrix.uncovered_app_visible_count, null);
});
test('rejects dropped aliases, duplicate controls, undeclared native tools and template evidence', () => {
  for (const variant of ['alias', 'duplicate', 'tool', 'template']) {
    const f = fixture();
    if (variant === 'alias') f.census.rows = f.census.rows.filter(row => row.launch_id !== 'code-editor');
    if (variant === 'duplicate') f.census.rows.push(f.census.rows[0]);
    if (variant === 'tool') f.census.rows[0].data_native_gateway_tool = 'ipfs_add';
    if (variant === 'template') f.census.source_template = true;
    f.census.row_count = f.census.rows.length;
    assert.throws(() => deriveFreshInputs(f.census, f.contract), undefined, variant);
  }
});
test('ordinary explicit-local controls stay local while genuine provider handoff is external', () => {
  const f = fixture();
  f.contract.apps[0] = { app_id: 'openrouter', aliases: [], disposition: 'external_provider', backend_bindings: [] };
  f.census.rows = [{ app_id: 'openrouter', launch_id: 'openrouter', selector: '#model-search', role: 'textbox', accessible_name: 'Search' },
    { app_id: 'openrouter', launch_id: 'openrouter', selector: '#openrouter-provider-handoff', role: 'link', accessible_name: 'Open provider', data_external_provider: 'openrouter' }];
  f.census.row_count = 2;
  assert.deepEqual(deriveFreshInputs(f.census, f.contract).matrix.rows.map(row => row.disposition), ['local-only', 'external-provider']);
});

'use strict';
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const OWNERS = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];

function deriveCurrentBindingLedger({ historical, historicalPath, discovery, contract, matrix, catalog }) {
  if (historical?.schema !== 'swissknife.all-app-live-binding-gap-ledger.v1' || !Array.isArray(historical.tools)) throw new Error('historical name-level ledger missing');
  if (discovery?.schema !== 'swissknife.vdg-owner-tools.v1' || !Array.isArray(discovery.owners)) throw new Error('current real owner discovery missing');
  const ownerMap = new Map();
  for (const owner of discovery.owners) {
    if (!OWNERS.includes(owner.owner) || ownerMap.has(owner.owner) || owner.state !== 'live-discovered' || !Array.isArray(owner.tools) || owner.tools.length === 0
      || owner.tools.some(tool => typeof tool.name !== 'string' || !tool.name.trim()) || new Set(owner.tools.map(tool => tool.name)).size !== owner.tools.length) throw new Error('owner tools/list discovery is incomplete or ambiguous');
    ownerMap.set(owner.owner, owner);
  }
  if (ownerMap.size !== OWNERS.length) throw new Error('all three originating owners must be discovered');
  const apps = new Map((contract?.apps || []).map(app => [app.app_id, app]));
  if (!apps.size || !Array.isArray(matrix?.rows) || !Array.isArray(catalog?.entries)) throw new Error('current contract, controls and exact tool catalog required');
  const records = new Map();
  const get = (owner, name) => {
    if (!OWNERS.includes(owner) || typeof name !== 'string' || !name.trim()) throw new Error('invalid owner/tool identity');
    const identity = `${owner}:${name}`;
    if (!records.has(identity)) records.set(identity, { tool_id: identity, owner, name, history: null, discovered: false, catalog: null, rows: [] });
    return records.get(identity);
  };
  for (const tool of historical.tools) {
    const name = tool.name || String(tool.tool_id || '').slice(String(tool.owner || '').length + 1);
    get(tool.owner, name).history = { source_path: historicalPath, record_sha256: hash(tool),
      current_state: tool.current_state ?? null, release_state: tool.release_state ?? null, states: tool.states ?? null,
      observed_execution_state: tool.observed_execution_state ?? null };
  }
  for (const owner of discovery.owners) for (const tool of owner.tools) get(owner.owner, tool.name).discovered = true;
  for (const tool of catalog.entries) get(tool.owner, tool.tool_id).catalog = tool.disposition;
  const gaps = [];
  for (const row of matrix.rows) {
    const bindingId = row.data_native_gateway_binding || row.data_live_gateway_binding;
    if (!bindingId) continue;
    const binding = apps.get(row.app_id)?.backend_bindings?.find(item => item.binding_id === bindingId);
    const exact = row.data_native_gateway_tool || (binding?.tool_selection?.preferred_tool_ids || []).find(name => name === row.tool_id);
    if (!binding || !exact || !binding.tool_selection.preferred_tool_ids.includes(exact)) {
      gaps.push({ code: 'rendered_exact_binding_unresolved', app_id: row.app_id, selector: row.selector, binding_id: bindingId });
      continue;
    }
    const record = get(binding.owner, exact);
    if (record.catalog?.kind === 'server_only') {
      gaps.push({ code: 'server_only_tool_rendered_as_operation', app_id: row.app_id, selector: row.selector, owner: binding.owner, tool_id: exact });
      continue;
    }
    record.rows.push({ app_id: row.app_id, launch_id: row.launch_id, selector: row.selector,
      binding_id: bindingId, owner: binding.owner, tool_id: exact, app_visible: true, visibility: 'app_visible',
      transports: [...binding.transport_policy.allowed_transports], source: 'current-live-dom-exact-binding' });
    if (!record.discovered) gaps.push({ code: 'rendered_tool_not_discovered', app_id: row.app_id, selector: row.selector, owner: binding.owner, tool_id: exact });
  }
  const tools = [...records.values()].sort((a, b) => a.tool_id.localeCompare(b.tool_id)).map(record => ({
    tool_id: record.tool_id, owner: record.owner, name: record.name,
    current_state: record.discovered ? 'not_executed' : 'missing',
    discovery_state: record.discovered ? 'live-discovered' : 'not-advertised',
    observed_execution_state: 'not_evaluated',
    history: record.history,
    disposition: record.catalog,
    binding: { state: record.rows.length ? 'explicitly-bound' : 'not-app-visible',
      app_visible_row_count: record.rows.length, rows: record.rows },
  }));
  return { schema: 'swissknife.all-app-live-binding-gap-ledger.v1',
    scope: { authority: 'current VDG inventory; no execution or completion claim', backend_owners: OWNERS },
    decision: 'no_go', clicked: false, work_complete: false, completion_authority: false,
    provenance: { adapter: 'vdg-current-exact-binding-ledger@1', historical_path: historicalPath,
      historical_sha256: hash(historical), discovery_sha256: hash(discovery), contract_sha256: hash(contract), matrix_sha256: hash(matrix), catalog_sha256: hash(catalog) },
    backend_owners: discovery.owners.map(owner => ({ owner: owner.owner, endpoint: owner.endpoint, state: owner.state, tool_count: owner.tools.length })),
    applications: [...apps.values()].map(app => ({ app_id: app.app_id, aliases: app.aliases, disposition: app.disposition })),
    tools, gaps,
    summary: { exact_tool_record_count: tools.length, app_visible_binding_count: tools.reduce((sum, tool) => sum + tool.binding.app_visible_row_count, 0), gap_count: gaps.length },
  };
}
module.exports = { OWNERS, deriveCurrentBindingLedger };

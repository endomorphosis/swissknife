'use strict';
const crypto = require('node:crypto');
const { FAMILIES } = require('./vdg-evidence.cjs');
const { controlKey } = require('./vdg-capture-observations.cjs');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function deriveFreshInputs(census, contract, sourcePath = 'vdg/inventory/rendered-control-census.json') {
  if (census?.schema !== 'swissknife.rendered-control-census.v1' || census.collection !== 'live-dom' || census.source_template !== false || census.clicked !== false
    || !Array.isArray(census.rows) || !census.rows.length || census.row_count !== census.rows.length) throw new Error('fresh inventory requires a complete unclicked live DOM census');
  if (!Array.isArray(contract?.apps) || !contract.apps.length) throw new Error('current executable contract missing');
  const membership = new Map(Object.entries(FAMILIES).flatMap(([family, definition]) => definition.apps.map(app => [app, family])));
  const apps = new Map(contract.apps.map(app => [app.app_id, app]));
  const seen = new Set();
  if (census.app_count !== new Set(census.rows.map(row => row.app_id)).size) throw new Error('live census app count mismatch');
  for (const row of census.rows) {
    const app = apps.get(row.app_id);
    if (!app || !membership.has(row.app_id) || ![app.app_id, ...(app.aliases || [])].includes(row.launch_id)
      || !row.selector || /\$\{|escapeHTML|\{\{|<%/.test(row.selector) || !row.role || typeof row.accessible_name !== 'string') throw new Error('census has undeclared app, alias, or incomplete selector');
    if (seen.has(controlKey(row))) throw new Error('duplicate live control identity');
    seen.add(controlKey(row));
  }
  for (const app of contract.apps) {
    for (const launch of [app.app_id, ...(app.aliases || [])]) {
      if (!census.rows.some(row => row.app_id === app.app_id && row.launch_id === launch)) throw new Error(`fresh census missing app/alias ${launch}`);
    }
  }
  const rows = census.rows.map(row => {
    const app = apps.get(row.app_id);
    const rawBinding = row.data_native_gateway_binding || row.data_live_gateway_binding || '';
    const binding = app.backend_bindings.find(item => item.binding_id === rawBinding);
    if (rawBinding && !binding) throw new Error(`live control names an undeclared binding ${rawBinding}`);
    let disposition = 'unsupported';
    let reason = 'no-declared-tool-binding';
    let toolId = '';
    if (row.selector.startsWith('.window-control.')) { disposition = 'local-only'; reason = 'shell-chrome'; }
    else if (row.data_external_provider) { disposition = 'external-provider'; reason = 'declared-provider-handoff'; }
    else if (row.data_gateway_policy_tool) { disposition = 'local-only'; reason = 'governed-tool-negative'; }
    else if (['browser_local', 'external_provider', 'policy_blocked'].includes(app.disposition)) { disposition = 'local-only'; reason = `current-contract-${app.disposition}`; }
    else if (binding) {
      const exactTool = row.data_native_gateway_tool || '';
      if (exactTool && !binding.tool_selection.preferred_tool_ids.includes(exactTool)) throw new Error(`native control names an unapproved tool ${exactTool}`);
      disposition = binding.mediated_intent.mutates_remote_state || binding.ui_control.confirmation !== 'none' ? 'confirm-then-invoke' : 'invoke';
      reason = row.data_native_gateway_binding ? 'native-executable-binding' : 'gateway-executable-binding';
      toolId = exactTool || `mcp++:${binding.binding_id}`;
    }
    return { ...structuredClone(row), family: membership.get(row.app_id), disposition, reason, tool_id: toolId,
      data_live_gateway_binding: binding?.binding_id || '', data_native_gateway_binding: row.data_native_gateway_binding || '',
      dry_run: Boolean(binding), clicked: false };
  });
  const provenance = { adapter: 'fresh-vdg-live-dom@1', sources: [{ path: sourcePath, semantic_sha256: hash(census) },
    { path: 'src/services/apps/all-app-executable-backend-contract.ts', semantic_sha256: hash(contract) }],
    authority: 'inventory only; current originating calls and connector receipts still required' };
  const common = { clicked: false, source_template: false, decision: 'no_go', coverage_status: 'not_evaluated', provenance,
    input_fingerprint: hash(provenance), work_complete: false, completion_authority: false };
  const appIds = [...apps.keys()].sort();
  const launchIds = [...new Set(rows.map(row => row.launch_id))].sort();
  const uncovered = contract.apps.flatMap(app => app.backend_bindings.filter(binding => !rows.some(row => row.app_id === app.app_id && row.data_live_gateway_binding === binding.binding_id))
    .map(binding => ({ app_id: app.app_id, owner: binding.owner, tool_id: binding.binding_id, kind: 'rendered-binding-missing' })));
  return {
    census: { schema: 'swissknife.virtual-desktop-control-census.v1', collection: 'live-dom', ...common,
      app_count: appIds.length, app_ids: appIds, launch_ids: launchIds, row_count: rows.length,
      rows: rows.map(row => ({ ...row, evidence: 'live-dom' })) },
    matrix: { schema: 'swissknife.virtual-desktop-control-tool-matrix.v1', collection: 'live-dom-current-contract-join', ...common,
      app_ids: appIds, launch_ids: launchIds, family_lanes: Object.fromEntries(Object.entries(FAMILIES).map(([family, definition]) => [family, definition.apps])),
      row_count: rows.length, rows, disposition_counts: rows.reduce((counts, row) => { counts[row.disposition] = (counts[row.disposition] || 0) + 1; return counts; }, {}),
      uncovered_app_visible_tools: uncovered, uncovered_app_visible_count: null },
  };
}
module.exports = { deriveFreshInputs };

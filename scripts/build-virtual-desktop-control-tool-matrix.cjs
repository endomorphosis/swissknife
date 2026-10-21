#!/usr/bin/env node
/**
 * VDG-012: one disposition for every census control.
 *
 * This does not invoke tools. A gateway binding names the tool the control
 * would call. A missing binding stays local-only, external-provider, or
 * unsupported. App-visible ledger tools with no control stay gaps.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const outRoot = process.env.VDG_MATRIX_OUT
  ? path.resolve(process.env.VDG_MATRIX_OUT)
  : evidenceRoot;
const censusPath = path.join(evidenceRoot, 'control-census.json');
const ledgerPath = path.join(evidenceRoot, 'all-app-live-binding-gap-ledger.json');
const jsonPath = path.join(outRoot, 'control-tool-matrix.json');
const testPath = process.env.VDG_MATRIX_OUT
  ? path.join(outRoot, 'virtual-desktop-control-tool-matrix.test.ts')
  : path.join(projectRoot, 'test', 'mcp-plus-plus', 'virtual-desktop-control-tool-matrix.test.ts');

const DISPOSITIONS = new Set([
  'invoke',
  'confirm-then-invoke',
  'deny',
  'local-only',
  'external-provider',
  'unsupported',
]);

// Objective text names every app except ai-chat and orb-auto-ui.
// Those two stay on the nearest family and are marked objective_named false.
const FAMILIES = {
  'vdg-storage': ['file-manager', 'ipfs-explorer', 'image-viewer', 'media-player', 'cinema', 'peertube'],
  'vdg-datasets': ['notes', 'datasets-browser', 'model-browser', 'vibecode', 'ai-chat'],
  'vdg-accelerate': ['device-manager', 'huggingface', 'training-manager', 'accelerate-panel', 'neural-network-designer', 'neural-photoshop'],
  'vdg-network': ['p2p-network', 'p2p-chat', 'p2p-chat-unified', 'friends-list', 'navi'],
  'vdg-control': ['mcp-control', 'mcp-plus-plus', 'idl-explorer', 'agent-supervisor', 'system-monitor', 'github', 'api-keys', 'orb-auto-ui'],
  'vdg-local': ['calculator', 'clock', 'terminal', 'glasses-preview', 'settings', 'todo', 'calendar', 'cron', 'task-manager', 'music-studio', 'music-studio-unified', 'strudel', 'strudel-ai-daw', 'oauth-login', 'openrouter'],
};
const OBJECTIVE_NAMED = new Set(
  Object.values(FAMILIES).flat().filter(id => id !== 'ai-chat' && id !== 'orb-auto-ui'),
);
const EXTERNAL_PROVIDER_APPS = new Set(['openrouter']);

function familyFor(appId) {
  for (const [family, ids] of Object.entries(FAMILIES)) {
    if (ids.includes(appId)) {
      return { family, objective_named: OBJECTIVE_NAMED.has(appId) };
    }
  }
  return null;
}

function matchTool(binding, tools) {
  const raw = String(binding || '').trim();
  if (!raw) return null;
  const tail = raw.split('/').pop();
  return tools.find(tool =>
    tool.tool_id === raw
    || tool.name === raw
    || tool.name === tail
    || `${tool.owner}:${tool.name}` === raw
    || `${tool.owner}/${tool.name}` === raw
  ) || null;
}

function policyClass(appId, tool, assignments) {
  if (!tool) return '';
  for (const assignment of assignments) {
    if (assignment.app_id !== appId) continue;
    const ids = [
      ...(assignment.exact_bound_tool_ids || []),
      ...(assignment.exact_associated_tool_ids || []),
    ];
    if (ids.includes(tool.tool_id) || ids.includes(tool.name)) {
      return String(assignment.policy_class || '');
    }
  }
  return '';
}

function joinRow(row, context) {
  const family = familyFor(row.app_id);
  if (!family) throw new Error(`app has no family lane: ${row.app_id}`);
  const binding = String(row.data_live_gateway_binding || '');
  const tool = matchTool(binding, context.tools);
  const policy = policyClass(row.app_id, tool, context.assignments);
  const app = context.apps.get(row.app_id);
  let disposition = 'unsupported';
  let reason = 'no-tool-binding';
  if (row.disposition === 'local-only') {
    disposition = 'local-only';
    reason = 'census-local-only';
  } else if (binding) {
    if (tool && tool.states && tool.states.denied) {
      disposition = 'deny';
      reason = 'ledger-denied';
    } else if (policy === 'write' || policy === 'heavy_compute') {
      disposition = 'confirm-then-invoke';
      reason = `policy-${policy}`;
    } else {
      disposition = 'invoke';
      reason = tool ? 'gateway-binding' : 'gateway-binding-unmatched';
    }
  } else if (app && app.local_only === true) {
    disposition = 'local-only';
    reason = 'ledger-local-only-app';
  } else if (EXTERNAL_PROVIDER_APPS.has(row.app_id)) {
    disposition = 'external-provider';
    reason = 'external-provider-app';
  }
  if (!DISPOSITIONS.has(disposition)) throw new Error(`bad disposition ${disposition}`);
  return {
    app_id: row.app_id,
    launch_id: row.launch_id,
    selector: row.selector,
    family: family.family,
    objective_named: family.objective_named,
    disposition,
    tool_id: tool ? tool.tool_id : binding,
    tool_name: tool ? tool.name : '',
    ledger_match: Boolean(tool),
    dry_run: disposition === 'invoke' || disposition === 'confirm-then-invoke' || disposition === 'deny',
    reason,
    clicked: false,
  };
}

function uncoveredAppVisibleTools(tools, rows) {
  const covered = new Set(rows.flatMap(row => [row.tool_id, row.tool_name]).filter(Boolean));
  return tools
    .filter(tool => Number(tool.binding && tool.binding.app_visible_row_count) > 0)
    .filter(tool => !covered.has(tool.tool_id) && !covered.has(tool.name))
    .map(tool => ({
      gap_id: `uncovered-app-visible:${tool.tool_id}`,
      kind: 'uncovered-app-visible-tool',
      tool_id: tool.tool_id,
      tool_name: tool.name,
      owner: tool.owner,
    }));
}

function assertMatrix(payload, census) {
  if (payload.rows.length !== census.rows.length) {
    throw new Error(`row count ${payload.rows.length} != census ${census.rows.length}`);
  }
  const seen = new Set();
  for (const row of payload.rows) {
    if (!DISPOSITIONS.has(row.disposition)) throw new Error(`bad disposition ${row.disposition}`);
    if (!row.family) throw new Error(`missing family for ${row.app_id}`);
    if (row.clicked !== false) throw new Error('matrix clicked a control');
    const key = `${row.launch_id}\t${row.selector}`;
    if (seen.has(key)) throw new Error(`duplicate control ${key}`);
    seen.add(key);
  }
  const apps = new Set(payload.rows.map(row => row.app_id));
  for (const appId of payload.app_ids) {
    if (!apps.has(appId)) throw new Error(`app missing from matrix rows: ${appId}`);
    if (!familyFor(appId)) throw new Error(`app has no family lane: ${appId}`);
  }
}

function writeTest() {
  const test = `import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const matrixPath = fileURLToPath(new URL(
  '../../test-results/virtual-desktop-ipfs-mcp-orb/control-tool-matrix.json',
  import.meta.url,
));

const DISPOSITIONS = new Set([
  'invoke',
  'confirm-then-invoke',
  'deny',
  'local-only',
  'external-provider',
  'unsupported',
]);

test('control tool matrix gives every control one disposition', () => {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  assert.equal(matrix.schema, 'swissknife.virtual-desktop-control-tool-matrix.v1');
  assert.equal(matrix.clicked, false);
  assert.ok(matrix.rows.length > 0);
  const seen = new Set();
  for (const row of matrix.rows) {
    assert.equal(DISPOSITIONS.has(row.disposition), true);
    assert.equal(typeof row.family, 'string');
    assert.ok(row.family.length > 0);
    assert.equal(row.clicked, false);
    const key = row.launch_id + '\\t' + row.selector;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
  for (const appId of matrix.app_ids) {
    assert.equal(matrix.rows.some(row => row.app_id === appId), true);
  }
  for (const gap of matrix.uncovered_app_visible_tools) {
    assert.equal(gap.kind, 'uncovered-app-visible-tool');
  }
});
`;
  fs.mkdirSync(path.dirname(testPath), { recursive: true });
  fs.writeFileSync(testPath, test);
}

function main() {
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const apps = new Map((ledger.applications || []).map(app => [app.app_id, app]));
  for (const app of ledger.applications || []) {
    if (!familyFor(app.app_id)) throw new Error(`app has no family lane: ${app.app_id}`);
  }
  const context = {
    tools: ledger.tools || [],
    assignments: ledger.application_backend_assignments || [],
    apps,
  };
  const rows = (census.rows || []).map(row => joinRow(row, context));
  const uncovered = uncoveredAppVisibleTools(context.tools, rows);
  const payload = {
    schema: 'swissknife.virtual-desktop-control-tool-matrix.v1',
    generated_at: new Date().toISOString(),
    clicked: false,
    collection: 'census-join',
    decision: 'no_go',
    app_ids: (ledger.applications || []).map(app => app.app_id),
    family_lanes: FAMILIES,
    objective_omissions: ['ai-chat', 'orb-auto-ui'],
    row_count: rows.length,
    disposition_counts: rows.reduce((counts, row) => {
      counts[row.disposition] = (counts[row.disposition] || 0) + 1;
      return counts;
    }, {}),
    uncovered_app_visible_tools: uncovered,
    uncovered_app_visible_count: uncovered.length,
    rows,
  };
  assertMatrix(payload, census);
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeTest();
  process.stdout.write(`${JSON.stringify({
    decision: 'matrix_written',
    row_count: payload.row_count,
    disposition_counts: payload.disposition_counts,
    uncovered_app_visible_count: payload.uncovered_app_visible_count,
    objective_omissions: payload.objective_omissions,
    clicked: false,
  }, null, 2)}\n`);
}

main();

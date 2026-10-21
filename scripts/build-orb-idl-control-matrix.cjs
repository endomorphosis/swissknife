#!/usr/bin/env node
/**
 * VOG-013: one ORB/IDL disposition and one IDL method for every rendered control.
 *
 * Reads the rendered census and the live-binding gap ledger. Does not click,
 * does not edit the census, and does not invoke a tool. generated_at is the
 * later input timestamp, so the same inputs always write the same matrix.
 */

const fs = require('node:fs');
const path = require('node:path');

const evidenceRoot = path.join(path.resolve(__dirname, '..'), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const censusPath = path.join(evidenceRoot, 'vog', 'rendered-control-census.json');
const ledgerPath = path.join(evidenceRoot, 'all-app-live-binding-gap-ledger.json');
const jsonPath = path.join(evidenceRoot, 'vog', 'orb-idl-control-matrix.json');

const CENSUS_SCHEMA = 'swissknife.rendered-control-census.v1';
const LEDGER_SCHEMA = 'swissknife.all-app-live-binding-gap-ledger.v1';
const MATRIX_SCHEMA = 'swissknife.orb-idl-control-matrix.v1';

const DISPOSITIONS = new Set([
  'invoke',
  'confirm-then-invoke',
  'deny',
  'local-only',
  'external-provider',
  'unsupported',
]);
const IDL_METHODS = new Set([
  'read_status',
  'read_receipts',
  'request_action',
  'request_fallback',
  'request_prompt_steering',
  'none',
]);
const CONFIRM_POLICIES = new Set([
  'write',
  'heavy_compute',
  'credential',
  'destructive',
  'external_network',
  'confirm',
]);
const READ_METHODS = new Set(['read_status', 'read_receipts', 'request_fallback']);
const SHELL_ACTIONS = new Set(['minimize', 'maximize', 'close']);
const LOCAL_ACTIONS = new Set([
  'cancel',
  'cancel-evidence-persist',
  'zoom',
  'zoom-in',
  'zoom-out',
  'pan',
  'filter',
  'filters',
]);
const STATUS_APPS = new Set(['training-manager', 'device-manager']);
const CHAT_APPS = new Set(['p2p-chat', 'p2p-chat-unified', 'friends-list', 'navi', 'ai-chat']);
const KNOWN_ALIASES = {
  'code-editor': 'vibecode',
  'strudel-grandma': 'strudel',
  'p2p-chat-offline': 'p2p-chat',
};

const FAMILIES = {
  'vog-storage': ['file-manager', 'ipfs-explorer', 'image-viewer', 'media-player', 'cinema', 'peertube'],
  'vog-datasets': ['notes', 'datasets-browser', 'model-browser', 'vibecode', 'ai-chat'],
  'vog-accelerate': ['device-manager', 'huggingface', 'training-manager', 'accelerate-panel', 'neural-network-designer', 'neural-photoshop'],
  'vog-network': ['p2p-network', 'p2p-chat', 'p2p-chat-unified', 'friends-list', 'navi'],
  'vog-control': ['mcp-control', 'mcp-plus-plus', 'idl-explorer', 'agent-supervisor', 'system-monitor', 'github', 'api-keys', 'orb-auto-ui'],
  'vog-local': ['calculator', 'clock', 'terminal', 'glasses-preview', 'settings', 'todo', 'calendar', 'cron', 'task-manager', 'music-studio', 'music-studio-unified', 'strudel', 'strudel-ai-daw', 'oauth-login', 'openrouter'],
};

function familyFor(appId) {
  for (const [family, ids] of Object.entries(FAMILIES)) {
    if (ids.includes(appId)) return family;
  }
  return '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function bindingFromSelector(selector) {
  const match = String(selector || '').match(/\[data-live-gateway-binding=["']([^"']+)["']\]/);
  return match ? match[1] : '';
}

function field(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return String(row[name]).trim();
  }
  const bags = [row.attributes, row.attrs, row.dataset];
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') continue;
    for (const name of names) {
      if (bag[name] != null && String(bag[name]).trim() !== '') return String(bag[name]).trim();
    }
  }
  return '';
}

function canonicalAppId(raw, apps) {
  const id = String(raw || '').trim();
  if (familyFor(id)) return id;
  if (KNOWN_ALIASES[id]) return KNOWN_ALIASES[id];
  for (const app of apps || []) {
    if (app.app_id === id) return id;
    if ((app.aliases || []).includes(id) && familyFor(app.app_id)) return app.app_id;
  }
  return id;
}

function generatedAt(census, ledger) {
  const stamps = [census.generated_at, ledger.generated_at]
    .filter(value => typeof value === 'string' && value.trim() !== '');
  stamps.sort();
  return stamps.length ? stamps[stamps.length - 1] : '1970-01-01T00:00:00.000Z';
}

function controlFrom(row, apps) {
  const appId = canonicalAppId(field(row, ['app_id', 'appId']) || row.app_id, apps);
  const selector = field(row, ['selector']);
  return {
    app_id: appId,
    launch_id: field(row, ['launch_id', 'launchId']) || appId,
    selector,
    role: field(row, ['role']) || 'button',
    accessible_name: field(row, ['accessible_name', 'accessibleName', 'aria_label', 'aria-label', 'name', 'label']),
    data_action: field(row, ['data_action', 'data-action', 'action']),
    data_capability: field(row, ['data_capability', 'data-capability', 'capability']),
    data_live_gateway_binding: field(row, [
      'data_live_gateway_binding',
      'data-live-gateway-binding',
      'live_gateway_binding',
      'liveGatewayBinding',
    ]) || bindingFromSelector(selector),
    class_name: field(row, ['class_name', 'className', 'class']),
    census_disposition: field(row, ['disposition']),
  };
}

function isShellChrome(control) {
  const action = control.data_action.toLowerCase();
  const selector = control.selector.toLowerCase();
  const className = control.class_name.toLowerCase();
  const name = control.accessible_name.trim().toLowerCase();
  if (selector.includes('window-control') || /(^|\s)window-control(\s|$)/.test(className)) return true;
  if (SHELL_ACTIONS.has(action)) return true;
  if (/\[data-action=["']?(minimize|maximize|close)["']?\]/.test(selector)) return true;
  if ((name === 'minimize' || name === 'maximize' || name === 'close')
    && (selector.includes('window') || className.includes('window'))) return true;
  return false;
}

function isChromeLabel(control) {
  const name = control.accessible_name.trim().toLowerCase();
  return name === 'minimize' || name === 'maximize' || name === 'close';
}

function textOf(control) {
  return [
    control.data_action,
    control.accessible_name,
    control.data_capability,
    control.selector,
    control.data_live_gateway_binding,
  ].join(' ').toLowerCase().replace(/[_]+/g, ' ');
}

function namedToolId(binding) {
  const raw = String(binding || '').trim();
  if (raw.startsWith('mcp++')) return raw;
  return `mcp++:${raw}`;
}

function matchTool(binding, tools) {
  const raw = String(binding || '').trim();
  if (!raw) return null;
  const stripped = raw.replace(/^mcp\+\+:/, '').replace(/^mcp\+\+\//, '');
  const exact = (tools || []).find(tool =>
    tool.tool_id === raw
    || tool.name === raw
    || tool.tool_id === stripped
    || tool.name === stripped
    || `${tool.owner}:${tool.name}` === stripped
    || `${tool.owner}/${tool.name}` === stripped
    || `mcp++:${tool.owner}/${tool.name}` === raw
    || `mcp++:${tool.owner}:${tool.name}` === raw
  );
  if (exact) return exact;
  const parts = stripped.split(/[/:]/).filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const name = parts[parts.length - 1];
  if (!name || name.length < 3) return null;
  return (tools || []).find(tool => tool.name === name && tool.owner === owner) || null;
}

function policyClass(appId, tool, assignments) {
  if (!tool) return '';
  for (const assignment of assignments || []) {
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

function idlMethod(control, policy) {
  const text = textOf(control);
  const named = text.match(/\b(read status|read receipts|request action|request fallback|request prompt steering)\b/);
  if (named) {
    const method = named[1].replace(/ /g, '_');
    if (method === 'request_prompt_steering') {
      return control.app_id === 'agent-supervisor' ? 'request_prompt_steering' : 'request_action';
    }
    return method;
  }
  if (control.app_id === 'agent-supervisor' && /prompt steering|\bsteering\b/.test(text)) {
    return 'request_prompt_steering';
  }
  if (/\breceipts?\b|\bevidence\b/.test(text)) return 'read_receipts';
  if (/\bfallback\b|\bdegrad/.test(text)) return 'request_fallback';
  if (/\b(status|health|telemetry)\b/.test(text)) return 'read_status';
  if (policy === 'read' && /\b(inspect|monitor|poll|list)\b/.test(text)) return 'read_status';
  if (STATUS_APPS.has(control.app_id) && policy === 'read') return 'read_status';
  return 'request_action';
}

function isChatSend(control) {
  return CHAT_APPS.has(control.app_id) && /\bsend\b/.test(textOf(control));
}

function isConfirmControl(control, policy) {
  if (CONFIRM_POLICIES.has(policy)) return true;
  if (isChatSend(control)) return true;
  return /\b(delete|remove|destroy|purge|publish|submit|train|send|write|create|stop|kill)\b/.test(textOf(control));
}

function joinControl(control, context) {
  const family = familyFor(control.app_id);
  if (!family) throw new Error(`app has no family lane: ${control.app_id}`);
  const binding = control.data_live_gateway_binding;
  const tool = binding ? matchTool(binding, context.tools) : null;
  const policy = policyClass(control.app_id, tool, context.assignments);
  const app = context.apps.get(control.app_id);

  if (isShellChrome(control) || (isChromeLabel(control) && !binding)) {
    return finish(control, family, 'local-only', 'none', '', '', false, false, 'shell-chrome');
  }

  if (binding) {
    const method = idlMethod(control, policy);
    const confirm = method === 'request_prompt_steering' || (READ_METHODS.has(method) ? false : isConfirmControl(control, policy));
    const disposition = confirm ? 'confirm-then-invoke' : 'invoke';
    let reason = 'gateway-binding';
    if (method === 'request_prompt_steering') reason = 'gateway-binding-steering';
    else if (isChatSend(control)) reason = 'gateway-binding-chat-send';
    else if (confirm) reason = `policy-${policy || 'confirm'}`;
    else if (!tool) reason = 'gateway-binding-unmatched';
    return finish(
      control,
      family,
      disposition,
      method,
      namedToolId(binding),
      tool ? tool.name : '',
      Boolean(tool),
      true,
      reason,
    );
  }

  if (control.app_id === 'openrouter') {
    return finish(control, family, 'external-provider', 'none', '', '', false, false, 'external-provider-app');
  }
  if (control.census_disposition === 'local-only') {
    return finish(control, family, 'local-only', 'none', '', '', false, false, 'census-local-only');
  }
  if (LOCAL_ACTIONS.has(control.data_action.toLowerCase())) {
    return finish(control, family, 'local-only', 'none', '', '', false, false, 'local-action');
  }
  if (app && app.local_only === true) {
    return finish(control, family, 'local-only', 'none', '', '', false, false, 'ledger-local-only-app');
  }
  return finish(control, family, 'unsupported', 'none', '', '', false, false, 'no-tool-binding');
}

function finish(control, family, disposition, method, toolId, toolName, ledgerMatch, dryRun, reason) {
  if (!DISPOSITIONS.has(disposition)) throw new Error(`bad disposition ${disposition}`);
  if (!IDL_METHODS.has(method)) throw new Error(`bad idl method ${method}`);
  if (method === 'request_prompt_steering' && control.app_id !== 'agent-supervisor') {
    throw new Error(`request_prompt_steering belongs only to agent-supervisor: ${control.app_id}`);
  }
  return {
    app_id: control.app_id,
    launch_id: control.launch_id,
    selector: control.selector,
    role: control.role,
    accessible_name: control.accessible_name,
    data_action: control.data_action,
    family,
    disposition,
    idl_method: method,
    tool_id: toolId,
    tool_name: toolName,
    data_live_gateway_binding: control.data_live_gateway_binding,
    ledger_match: ledgerMatch,
    dry_run: dryRun,
    reason,
    clicked: false,
  };
}

function collapseControls(controls) {
  const groups = new Map();
  for (const control of controls) {
    const key = `${control.app_id}\0${control.selector}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(control);
  }
  const collapsed = [];
  for (const group of groups.values()) {
    const signature = control => [
      control.data_live_gateway_binding,
      control.data_action,
      control.accessible_name,
      control.role,
      control.census_disposition,
    ].join('\0');
    const signatures = new Set(group.map(signature));
    if (signatures.size > 1) {
      throw new Error(`duplicate control ${group[0].app_id} ${group[0].selector}`);
    }
    const canonical = group.find(control => control.launch_id === control.app_id)
      || group.slice().sort((left, right) => left.launch_id.localeCompare(right.launch_id))[0];
    collapsed.push(canonical);
  }
  collapsed.sort((left, right) => `${left.app_id}\t${left.launch_id}\t${left.selector}`
    .localeCompare(`${right.app_id}\t${right.launch_id}\t${right.selector}`));
  return collapsed;
}

function uncoveredAppVisibleTools(tools, rows) {
  const covered = new Set();
  for (const row of rows) {
    if (row.tool_id) covered.add(row.tool_id);
    if (row.tool_name) covered.add(row.tool_name);
    if (row.data_live_gateway_binding) covered.add(row.data_live_gateway_binding);
  }
  return (tools || [])
    .filter(tool => Number(tool.binding && tool.binding.app_visible_row_count) > 0)
    .filter(tool => {
      if (covered.has(tool.tool_id) || covered.has(tool.name)) return false;
      if (covered.has(`mcp++:${tool.owner}/${tool.name}`)) return false;
      if (covered.has(`mcp++:${tool.owner}:${tool.name}`)) return false;
      return true;
    })
    .map(tool => ({
      gap_id: `uncovered-app-visible:${tool.tool_id}`,
      kind: 'uncovered-app-visible-tool',
      tool_id: tool.tool_id,
      tool_name: tool.name,
      owner: tool.owner,
    }))
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] || 0) + 1;
  return counts;
}

function assertMatrix(payload) {
  if (payload.schema !== MATRIX_SCHEMA) throw new Error('bad matrix schema');
  if (payload.clicked !== false) throw new Error('matrix clicked a control');
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) throw new Error('matrix has no rows');
  if (payload.uncovered_app_visible_count !== payload.uncovered_app_visible_tools.length) {
    throw new Error('uncovered count drifted');
  }
  const seen = new Set();
  for (const row of payload.rows) {
    const key = `${row.app_id}\0${row.selector}`;
    if (seen.has(key)) throw new Error(`duplicate control ${row.app_id} ${row.selector}`);
    seen.add(key);
    if (!DISPOSITIONS.has(row.disposition)) throw new Error(`bad disposition ${row.disposition}`);
    if (!IDL_METHODS.has(row.idl_method)) throw new Error(`bad idl method ${row.idl_method}`);
    if (!row.family) throw new Error(`missing family for ${row.app_id}`);
    if (row.clicked !== false) throw new Error('matrix clicked a control');
    if (row.idl_method === 'request_prompt_steering' && row.app_id !== 'agent-supervisor') {
      throw new Error(`request_prompt_steering belongs only to agent-supervisor: ${row.app_id}`);
    }
    const bound = row.disposition === 'invoke' || row.disposition === 'confirm-then-invoke' || row.disposition === 'deny';
    if (bound) {
      if (!String(row.tool_id || '').startsWith('mcp++')) {
        throw new Error(`invoke row missing mcp++ tool id ${row.app_id} ${row.selector}`);
      }
      if (row.idl_method === 'none') throw new Error(`invoke row missing idl method ${row.app_id} ${row.selector}`);
      if (!row.data_live_gateway_binding) throw new Error(`invoke row missing binding ${row.app_id} ${row.selector}`);
      if (row.tool_id !== namedToolId(row.data_live_gateway_binding)) {
        throw new Error(`invoke row does not name its binding ${row.app_id} ${row.selector}`);
      }
    } else if (row.idl_method !== 'none' || row.tool_id !== '') {
      throw new Error(`zero-call row carries a tool ${row.app_id} ${row.selector}`);
    }
    if (row.reason === 'shell-chrome' && (row.disposition !== 'local-only' || row.idl_method !== 'none')) {
      throw new Error(`shell chrome is local-only ${row.app_id} ${row.selector}`);
    }
    if (row.app_id === 'openrouter' && row.reason !== 'shell-chrome' && !row.data_live_gateway_binding
      && row.disposition !== 'external-provider') {
      throw new Error(`openrouter is external-provider ${row.selector}`);
    }
  }
}

function buildMatrix(census, ledger) {
  if (!census || census.schema !== CENSUS_SCHEMA) throw new Error('rendered census schema');
  if (census.source_template !== false || census.clicked !== false) {
    throw new Error('rendered census must be a live DOM census and must not click');
  }
  if (!ledger || ledger.schema !== LEDGER_SCHEMA) throw new Error('gap ledger schema');
  const apps = ledger.applications || [];
  for (const app of apps) {
    const appId = canonicalAppId(app.app_id, apps);
    if (!familyFor(appId)) throw new Error(`app has no family lane: ${app.app_id}`);
  }
  const rawRows = Array.isArray(census.rows) ? census.rows : [];
  if (rawRows.length === 0) throw new Error('rendered census has no rows');
  const controls = rawRows.map(row => controlFrom(row, apps));
  for (const control of controls) {
    if (!control.selector) throw new Error(`census row missing selector ${control.app_id}`);
    if (control.selector.includes('${') || control.selector.includes('escapeHTML')) {
      throw new Error(`template selector ${control.app_id} ${control.selector}`);
    }
    if (!familyFor(control.app_id)) throw new Error(`app has no family lane: ${control.app_id}`);
  }
  const context = {
    tools: ledger.tools || [],
    assignments: ledger.application_backend_assignments || [],
    apps: new Map(apps.map(app => [canonicalAppId(app.app_id, apps), app])),
  };
  const rows = collapseControls(controls).map(control => joinControl(control, context));
  const uncovered = uncoveredAppVisibleTools(context.tools, rows);
  const payload = {
    schema: MATRIX_SCHEMA,
    generated_at: generatedAt(census, ledger),
    clicked: false,
    collection: 'census-ledger-join',
    decision: 'no_go',
    app_ids: apps.map(app => canonicalAppId(app.app_id, apps)),
    family_lanes: FAMILIES,
    row_count: rows.length,
    disposition_counts: countBy(rows, 'disposition'),
    idl_method_counts: countBy(rows, 'idl_method'),
    uncovered_app_visible_tools: uncovered,
    uncovered_app_visible_count: uncovered.length,
    rows,
  };
  assertMatrix(payload);
  return payload;
}

function main() {
  const census = readJson(censusPath);
  const ledger = readJson(ledgerPath);
  const payload = buildMatrix(census, ledger);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    decision: 'matrix_written',
    row_count: payload.row_count,
    disposition_counts: payload.disposition_counts,
    idl_method_counts: payload.idl_method_counts,
    uncovered_app_visible_count: payload.uncovered_app_visible_count,
    clicked: false,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  FAMILIES,
  buildMatrix,
  namedToolId,
};

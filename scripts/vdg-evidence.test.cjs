'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const test = require('node:test');
const { FAMILIES, validateFamily } = require('./vdg-evidence.cjs');
const { buildCoverage } = require('./build-gui-mcp-coverage.cjs');

function fixture(family = 'vdg-storage') {
  const definition = FAMILIES[family];
  const rows = definition.apps.map(app_id => ({
    app_id, launch_id: app_id, selector: '#native-action', family,
    disposition: family === 'vdg-local' && ['oauth-login', 'openrouter'].includes(app_id) ? 'external-provider' : 'local-only',
    clicked: true, visibility: 'visible', mcp_call_count: 0, observation: null, failure_reasons: [], pageerrors: [],
    external_provider_outcome: 'external-provider',
  }));
  const input = {
    family,
    matrix: { schema: 'swissknife.virtual-desktop-control-tool-matrix.v1', rows: structuredClone(rows), uncovered_app_visible_tools: [] },
    reports: [{ schema: 'swissknife.virtual-desktop-live-click.v1', target: definition.target, decision: 'GO', passed: true, owner_health: 'up', rows }],
    connectors: [],
    catalog: { schema: 'swissknife.all-tools-disposition-catalog.v1', entries: [{ owner: 'kit', tool_id: 'inspect-only', disposition: { kind: 'diagnostic_operation' } }] },
    contract: { apps: definition.apps.map(app_id => ({ app_id, aliases: [], backend_bindings: [] })) },
    ledger: { schema: 'swissknife.all-app-live-binding-gap-ledger.v1' },
  };
  return input;
}
function invocation(input, transport = 'http') {
  const row = input.reports[0].rows[0];
  row.disposition = 'invoke';
  input.matrix.rows[0].disposition = 'invoke';
  input.matrix.rows[0].tool_id = 'owner:exact_tool';
  row.mcp_call_count = 1;
  row.observation = { route: '/mcp/tools/call', tool_id: 'exact_tool', transport, correlation_id: 'test-correlation', policy_outcome: 'allow', receipt_id: 'test-receipt', event_dag_cid: 'test-event', dry_run: true, outcome: 'executed', origin: 'native-control' };
  input.connectors.push({ ...row.observation, method: 'POST', app_id: row.app_id, owner: 'owner', artifact_verified: true });
  input.catalog.entries.push({ owner: 'owner', tool_id: 'exact_tool', disposition: { kind: 'app_operation', app_id: row.app_id }, reachability: { approved_transports: ['http'] } });
  return row;
}
function has(input, code) { return validateFamily(input).gaps.some(gap => gap.code === code); }

test('real matched originating evidence can satisfy VDG instead of permanent no_go', () => {
  const input = fixture(); invocation(input);
  const report = validateFamily(input);
  assert.equal(report.decision, 'GO', JSON.stringify(report.gaps));
  assert.equal(report.executed_tool_count, 1);
  assert.equal(report.completion_authority, false);
});
test('a prior GO label and screenshot counts cannot hide an omitted control', () => {
  const input = fixture(); input.reports[0].rows.pop();
  assert.equal(has(input, 'control_not_observed'), true);
  assert.equal(validateFamily(input).decision, 'no_go');
});
test('each declared transport is an independent originating obligation', () => {
  const input = fixture(); invocation(input);
  input.catalog.entries.at(-1).reachability.approved_transports.push('libp2p');
  const report = validateFamily(input);
  assert.ok(report.gaps.some(gap => gap.code === 'app_visible_tool_transport_uncovered' && gap.transport === 'libp2p'));
});
test('a native workflow proves its exact primary call and independently reviewed companion calls', () => {
  const input = fixture(); const row = invocation(input);
  const app = input.contract.apps[0];
  app.backend_bindings = ['exact_tool', 'append_event'].map(name => ({ binding_id: `${app.app_id}.owner.${name}`, owner: 'owner',
    tool_selection: { preferred_tool_ids: [name] }, transport_policy: { allowed_transports: ['http'] } }));
  input.matrix.rows[0].data_native_gateway_binding = app.backend_bindings[0].binding_id;
  input.connectors[0].binding_id = app.backend_bindings[0].binding_id;
  const companion = { ...row.observation, tool_id: 'append_event', correlation_id: 'companion-correlation', receipt_id: 'companion-receipt', event_dag_cid: 'companion-event' };
  row.observations = [row.observation, companion]; row.mcp_call_count = 2;
  input.connectors.push({ ...companion, method: 'POST', app_id: row.app_id, owner: 'owner', artifact_verified: true, binding_id: app.backend_bindings[1].binding_id });
  assert.equal(validateFamily(input).decision, 'GO');
  input.connectors[1].binding_id = 'unreviewed';
  assert.equal(has(input, 'companion_binding_not_proven'), true);
  input.connectors[1].binding_id = app.backend_bindings[1].binding_id;
  row.observations = [companion]; row.mcp_call_count = 1;
  assert.equal(has(input, 'exact_tool_name_mismatch'), true, 'a valid companion cannot substitute for the original tool');
});
test('receipt and event identities must match an independently verified connector', () => {
  for (const field of ['receipt_id', 'event_dag_cid', 'correlation_id', 'tool_id', 'transport', 'dry_run', 'policy_outcome']) {
    const input = fixture(); invocation(input); input.connectors[0][field] = 'tampered';
    assert.equal(has(input, 'connector_receipt_not_matched'), true, field);
  }
});
test('owner identity is exact even when two owners expose the same tool name', () => {
  const input = fixture(); invocation(input); input.connectors[0].owner = 'other-owner';
  assert.equal(has(input, 'app_visible_tool_transport_uncovered'), true);
});
test('an unverified HTTP 200 or fabricated executed label cannot prove execution', () => {
  const input = fixture(); invocation(input); delete input.connectors[0].artifact_verified; input.connectors[0].status = 200;
  assert.equal(has(input, 'connector_receipt_not_matched'), true);
});
test('persisted receipt does not turn an unreachable owner into execution', () => {
  const input = fixture(); const row = invocation(input);
  row.observation.outcome = 'unreachable'; input.connectors[0].outcome = 'unreachable';
  assert.equal(has(input, 'owner_did_not_execute'), true);
});
test('native controls require native originating proof', () => {
  const input = fixture(); const row = invocation(input); row.observation.origin = 'gateway-button';
  assert.equal(has(input, 'native_control_origin_missing'), true);
});
test('zero-call negatives reject a stray call, even when labeled GO', () => {
  const input = fixture('vdg-local'); input.reports[0].rows[0].mcp_call_count = 1;
  assert.equal(has(input, 'negative_control_invoked_mcp'), true);
});
test('external providers need an observed external outcome without an MCP receipt', () => {
  const input = fixture('vdg-local');
  assert.equal(validateFamily(input).decision, 'GO');
  delete input.reports[0].rows.find(row => row.app_id === 'oauth-login').external_provider_outcome;
  assert.equal(has(input, 'external_provider_outcome_missing'), true);
});
test('confirmation requires observed zero calls before the confirming control runs', () => {
  const input = fixture(); const row = invocation(input);
  row.disposition = input.matrix.rows[0].disposition = 'confirm-then-invoke';
  assert.equal(has(input, 'confirmation_order_not_proven'), true);
  row.confirmation = { calls_before_confirmation: 0, confirmed: true, control_clicked: true };
  assert.equal(has(input, 'confirmation_order_not_proven'), false);
  row.confirmation.calls_before_confirmation = 1;
  assert.equal(has(input, 'confirmation_order_not_proven'), true);
});
test('a confirmation policy cannot bypass ordering by labeling its row invoke', () => {
  const input = fixture(); const row = invocation(input);
  row.observation.policy_outcome = input.connectors[0].policy_outcome = 'require_confirmation';
  assert.equal(has(input, 'confirmation_order_not_proven'), true);
});
test('MCP Control real invocation needs a declared reviewed safe read', () => {
  const input = fixture('vdg-control'); const row = invocation(input);
  row.observation.dry_run = input.connectors[0].dry_run = false;
  assert.equal(has(input, 'mutating_invocation_not_dry_run'), true);
  input.connectors[0].binding_id = 'mcp-control.owner.read';
  input.contract.apps[0].backend_bindings = [{ binding_id: 'mcp-control.owner.read', mediated_intent: { mutates_remote_state: false, policy_class: 'read' } }];
  assert.equal(has(input, 'mutating_invocation_not_dry_run'), false);
});
test('ordinary clicks cannot invoke supervisor-only exact identities', () => {
  const input = fixture(); invocation(input);
  input.catalog.entries.push({ owner: 'owner', tool_id: 'exact_tool', disposition: { kind: 'server_only' } });
  assert.equal(has(input, 'forbidden_tool_invocation'), true);
});
test('mutating app calls stay dry-run and local declarations cannot quietly disappear', () => {
  const input = fixture(); const row = invocation(input);
  row.observation.dry_run = input.connectors[0].dry_run = false;
  assert.equal(has(input, 'mutating_invocation_not_dry_run'), true);
  const local = fixture('vdg-local');
  local.catalog.entries.push({ owner: 'owner', tool_id: 'record', disposition: { kind: 'app_operation', app_id: 'calendar' }, reachability: { approved_transports: ['http'] } });
  assert.equal(has(local, 'local_family_tool_declaration_conflict'), true);
});
test('partial family greens never grant aggregate GO', () => {
  const reports = Object.keys(FAMILIES).map(family => validateFamily(fixture(family)));
  assert.equal(buildCoverage(reports).decision, 'GO');
  reports.pop();
  assert.equal(buildCoverage(reports).decision, 'no_go');
});
test('regenerating the observer preserves owner outcome checks used by live capture', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-observer-test-'));
  try {
    const output = path.join(temp, 'observer.ts');
    execFileSync(process.execPath, [path.join(__dirname, 'build-mcp-invocation-observer.cjs')], { env: { ...process.env, VDG_OBSERVER_OUT: output } });
    const source = fs.readFileSync(output, 'utf8');
    assert.match(source, /export function closedOwnerOutcome/);
    assert.match(source, /outcome: closedOwnerOutcome\(responseOutcome\)/);
    assert.match(source, /'unreachable'/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

function sourceBoundFixture(t) {
  const { loadFamilyEvidence } = require('./vdg-evidence.cjs');
  const { captureInputFingerprint } = require('./vdg-capture-fingerprint.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-source-bound-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = fixture();
  for (const directory of ['vdg/connectors', 'vdg/runs']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  const write = (relative, value) => fs.writeFileSync(path.join(root, relative), JSON.stringify(value));
  write('control-tool-matrix.json', input.matrix);
  write('all-tools-disposition-catalog.json', input.catalog);
  write('all-app-live-binding-gap-ledger.json', input.ledger);
  const report = { ...input.reports[0], generated_at: '2026-10-21T01:00:00Z', row_count: input.reports[0].rows.length };
  const reportPath = 'vdg/runs/storage-http-test.json';
  write(reportPath, report);
  const run = { run_id: 'storage-http-test', transport: 'http', report_path: reportPath,
    input_fingerprint: captureInputFingerprint('vdg-storage', 'http', { evidenceRoot: root, definition: FAMILIES['vdg-storage'] }),
    capture_complete: true, completed_at: '2026-10-21T01:00:01Z',
    report_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, reportPath))).digest('hex') };
  const manifest = { schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1', target: 'storage', runs: [run], observations: [] };
  const save = () => write('vdg/connectors/storage.json', manifest);
  save();
  return { root, input, report, run, manifest, write, save,
    load: () => loadFamilyEvidence('vdg-storage', { evidenceRoot: root }) };
}

test('a source-bound capture stops granting GO when its matrix changes', t => {
  const f = sourceBoundFixture(t);
  assert.equal(f.load().decision, 'GO');
  f.write('control-tool-matrix.json', { ...f.input.matrix, new_source_revision: true });
  const changed = f.load();
  assert.equal(changed.decision, 'no_go');
  assert.ok(changed.gaps.some(gap => gap.reason === 'capture_inputs_changed_or_unbound'));
});

test('family acceptance rejects report bytes changed after acquisition', t => {
  const f = sourceBoundFixture(t);
  assert.equal(f.load().decision, 'GO');
  fs.appendFileSync(path.join(f.root, f.run.report_path), ' ');
  const result = f.load();
  assert.equal(result.decision, 'no_go');
  assert.ok(result.gaps.some(gap => gap.reason === 'capture_acquisition_rejected' && /hash/.test(gap.detail)));
  assert.equal(result.evidence_sources.some(source => source.path === f.run.report_path), false);
});

test('unsafe report paths are rejected before any report read', t => {
  const f = sourceBoundFixture(t);
  const read = fs.readFileSync;
  for (const reportPath of ['../outside.json', '/tmp/outside.json', 'vdg/runs/../outside.json']) {
    f.run.report_path = reportPath; f.save();
    let unsafeRead = false;
    fs.readFileSync = function(filename, ...args) {
      if (String(filename) === path.join(f.root, reportPath)) unsafeRead = true;
      return read.call(this, filename, ...args);
    };
    try { assert.equal(f.load().decision, 'no_go'); }
    finally { fs.readFileSync = read; }
    assert.equal(unsafeRead, false, reportPath);
  }
});

test('family acceptance requires acquisition metadata and a complete current census', t => {
  const f = sourceBoundFixture(t);
  for (const [field, value] of [['run_id', 'storage-http-../bad'], ['capture_complete', false],
    ['completed_at', 'invalid'], ['report_sha256', undefined], ['transport', 'other']]) {
    const original = f.run[field]; f.run[field] = value; f.save();
    assert.equal(f.load().decision, 'no_go', field);
    f.run[field] = original; f.save();
  }
  f.report.rows.pop(); f.report.row_count = f.report.rows.length;
  f.write(f.run.report_path, f.report);
  f.run.report_sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(f.root, f.run.report_path))).digest('hex'); f.save();
  assert.ok(f.load().gaps.some(gap => gap.reason === 'capture_acquisition_rejected' && /every declared control/.test(gap.detail)));
});

test('current rendered exact-binding gaps cannot silently erase family obligations', () => {
  const input = fixture();
  input.ledger.gaps = [{ code: 'rendered_exact_binding_unresolved', app_id: 'image-viewer', selector: '#retrieve-cid-btn', owner: 'ipfs_kit_py', tool_id: 'missing' },
    { code: 'rendered_tool_not_discovered', app_id: 'notes', selector: '#other-family' }];
  // Historical inventory claims do not establish this capture's obligations.
  assert.equal(validateFamily(input).decision, 'GO');
  input.ledger.provenance = { adapter: 'vdg-current-exact-binding-ledger@1' };
  const report = validateFamily(input);
  assert.equal(report.decision, 'no_go');
  const gaps = report.gaps.filter(gap => gap.code === 'current_binding_ledger_gap');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].app_id, 'image-viewer');
  assert.equal(gaps[0].reason, 'rendered_exact_binding_unresolved');
  assert.equal(gaps[0].tool_id, 'missing');
});

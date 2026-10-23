'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { cidForBytes, stableStringify } = require('./mcpplusplus-profile-a.cjs');
const { loadConnectorArtifacts, assessOwnerResult } = require('./vdg-connector-artifacts.cjs');

function fixture(t, change = () => {}) {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-connector-test-'));
  t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));
  for (const directory of ['blocks', 'metadata']) fs.mkdirSync(path.join(artifactRoot, directory));
  const observation = {
    route: '/mcp/tools/call', tool_id: 'get_task', transport: 'http', correlation_id: 'test:call:1',
    policy_outcome: 'require_confirmation', dry_run: true, outcome: 'executed', origin: 'gateway-button',
  };
  const call = {
    protocol: 'swissknife.all-app-tool-gateway.v1', route: observation.route,
    app_id: 'cinema', binding_id: 'cinema.ipfs_accelerate_py.inspect_job_state', owner: 'ipfs_accelerate_py',
    tool_id: observation.tool_id, transport: observation.transport, correlation_id: observation.correlation_id,
    receipt_required: true, input: { correlation_id: observation.correlation_id, payload: {}, policy: {
      outcome: observation.policy_outcome, dry_run: true, consent: 'granted',
    } },
  };
  const result = {
    application_transport_observation: {
      transport: observation.transport, correlation_id: observation.correlation_id, ucan_did_verified: true,
      remote_did: 'did:key:test', descriptor_cid: cidForBytes(Buffer.from('descriptor')),
      identity_proof_cid: cidForBytes(Buffer.from('identity')),
    },
    result: { content: [{ type: 'json', json: { ok: true, dry_run: true, tool: observation.tool_id } }],
      receipt: { tool: observation.tool_id, dry_run: true } },
  };
  const row = { app_id: call.app_id, selector: `[data-live-gateway-binding="${call.binding_id}"]`, observation, mcp_call_count: 1 };
  change({ call, result, row, observation });
  function write(kind, value = { kind, call, result }) {
    const bytes = Buffer.from(stableStringify(value));
    const cid = cidForBytes(bytes);
    fs.writeFileSync(path.join(artifactRoot, 'blocks', cid), bytes);
    fs.writeFileSync(path.join(artifactRoot, 'metadata', `${cid}.json`), JSON.stringify({
      schema: 'swissknife.mcpplusplus.artifact-metadata.v1', cid, profile: kind === 'receipt' ? 'B' : 'F',
      kind: `swissknife_gateway_${kind}`, service: 'ipfs_kit_py', bytes: bytes.length, pinned: true,
    }));
    return cid;
  }
  observation.receipt_id = write('receipt');
  observation.event_dag_cid = write('event');
  return { artifactRoot, observation, call, result, row, write,
    load: rows => loadConnectorArtifacts(rows || [row], { artifactRoot }) };
}

test('joins verified receipt/event bytes to exact originating call without inventing HTTP status', t => {
  const f = fixture(t);
  const proof = f.load();
  assert.deepEqual(proof.problems, []);
  assert.equal(proof.observations.length, 1);
  const connector = proof.observations[0];
  for (const key of ['tool_id', 'transport', 'correlation_id', 'policy_outcome', 'dry_run', 'outcome', 'receipt_id', 'event_dag_cid']) assert.equal(connector[key], f.observation[key]);
  assert.equal(connector.owner, f.call.owner);
  assert.equal(connector.artifact_verified, true);
  assert.equal(connector.owner_result_verified, true);
  assert.equal(Object.hasOwn(connector, 'status'), false);
});

test('deduplicates the same verified call across reports and observations arrays', t => {
  const f = fixture(t);
  const proof = f.load([f.row, { ...f.row, observations: [f.observation, f.observation] }]);
  assert.equal(proof.observations.length, 1);
  assert.deepEqual(proof.problems, []);
});

test('requires both artifacts, not just plausible CID strings', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.artifactRoot, 'blocks', f.observation.event_dag_cid));
  assert.equal(f.load().problems[0].reason, 'connector_artifact_missing');
  assert.equal(f.load().observations.length, 0);
});

test('rejects modified block bytes even with unchanged metadata', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.artifactRoot, 'blocks', f.observation.receipt_id), ' ');
  assert.equal(f.load().problems[0].reason, 'receipt_cid_hash_mismatch');
});

test('rejects traversal strings before opening any artifact file', t => {
  const f = fixture(t);
  f.observation.receipt_id = '../private';
  assert.equal(f.load().problems[0].reason, 'receipt_cid_invalid');
});

test('rejects wrong profile, kind, byte size, CID, service or unpinned metadata', t => {
  const f = fixture(t);
  const filename = path.join(f.artifactRoot, 'metadata', `${f.observation.receipt_id}.json`);
  const original = JSON.parse(fs.readFileSync(filename, 'utf8'));
  for (const [key, value] of [['profile', 'F'], ['kind', 'other'], ['bytes', 0], ['cid', f.observation.event_dag_cid], ['service', 'browser'], ['pinned', false]]) {
    fs.writeFileSync(filename, JSON.stringify({ ...original, [key]: value }));
    assert.equal(f.load().problems[0].reason, 'receipt_metadata_mismatch', key);
  }
});

test('rejects internally valid event CID when event call or result differs from receipt', t => {
  const f = fixture(t);
  for (const value of [
    { kind: 'event', call: { ...f.call, correlation_id: 'other' }, result: f.result },
    { kind: 'event', call: f.call, result: { ...f.result, other: true } },
  ]) {
    f.observation.event_dag_cid = f.write('event', value);
    assert.equal(f.load().problems[0].reason, 'receipt_event_content_mismatch');
  }
});

test('checks exact browser tool, transport, correlation, policy and dry-run identity', t => {
  const f = fixture(t);
  for (const [key, value] of [['tool_id', 'other'], ['transport', 'libp2p'], ['correlation_id', 'other'], ['policy_outcome', 'allow'], ['dry_run', false]]) {
    const saved = f.observation[key];
    f.observation[key] = value;
    assert.equal(f.load().problems[0].reason, 'connector_call_identity_mismatch', key);
    f.observation[key] = saved;
  }
});

test('checks exact originating app, expected owner and binding identity', t => {
  const f = fixture(t);
  for (const [key, value, reason] of [
    ['app_id', 'image-viewer', 'connector_call_identity_mismatch'],
    ['owner', 'ipfs_kit_py', 'connector_owner_mismatch'],
    ['binding_id', 'other', 'connector_binding_mismatch'],
    ['selector', '[data-live-gateway-binding="other"]', 'connector_binding_mismatch'],
  ]) {
    const saved = f.row[key];
    f.row[key] = value;
    assert.equal(f.load().problems[0].reason, reason);
    if (saved === undefined) delete f.row[key]; else f.row[key] = saved;
  }
});

test('rejects mediator executed label when nested MCP result reports an error', t => {
  const f = fixture(t, ({ result }) => {
    result.result.isError = true;
    result.result.content = [{ type: 'text', text: 'No callable implementation.' }];
    result.result.receipt.status = 'error';
  });
  assert.equal(f.load().problems[0].reason, 'owner_result_reports_failure');
  assert.equal(f.load().observations.length, 0);
});

test('rejects explicit failure inside text JSON even beside a success acknowledgement', t => {
  const f = fixture(t, ({ result }) => { result.result.content.push({ type: 'text', text: '{"ok":false}' }); });
  assert.equal(f.load().problems[0].reason, 'owner_result_reports_failure');
});

test('requires independently acknowledged execution and matching transport proof', t => {
  const f = fixture(t);
  const ambiguous = structuredClone(f.result);
  ambiguous.result.content = [{ type: 'text', text: 'a plain tool value' }];
  assert.equal(assessOwnerResult(ambiguous, f.observation).reason, 'owner_execution_not_acknowledged');
  for (const changes of [{ correlation_id: 'other' }, { transport: 'libp2p' }, { ucan_did_verified: false }]) {
    const altered = structuredClone(f.result);
    Object.assign(altered.application_transport_observation, changes);
    assert.equal(assessOwnerResult(altered, f.observation).reason, 'owner_transport_proof_missing_or_mismatched');
  }
});

test('rejects tool and dry-run contradictions inside owner acknowledgement', t => {
  const f = fixture(t);
  for (const [key, value, reason] of [['tool', 'other', 'owner_result_tool_mismatch'], ['dry_run', false, 'owner_result_dry_run_mismatch']]) {
    const altered = structuredClone(f.result);
    altered.result.receipt[key] = value;
    assert.equal(assessOwnerResult(altered, f.observation).reason, reason);
  }
});

test('fails closed when owner envelope traversal would hide a deeper error', t => {
  const f = fixture(t);
  let nested = f.result;
  for (let index = 0; index < 70; index += 1) {
    nested.response = { ok: true };
    nested = nested.response;
  }
  nested.isError = true;
  assert.equal(assessOwnerResult(f.result, f.observation).reason, 'owner_result_envelope_limit_exceeded');
});

test('verifies explicit policy denial without pretending an owner was invoked', t => {
  const f = fixture(t, ({ call, observation, result }) => {
    call.input.policy.outcome = observation.policy_outcome = 'deny';
    observation.outcome = 'denied';
    for (const key of Object.keys(result)) delete result[key];
    result.error = 'policy_denied';
  });
  assert.deepEqual(f.load().problems, []);
  assert.equal(f.load().observations[0].outcome, 'denied');
  assert.equal(assessOwnerResult({ ok: true, error: 'policy_denied' }, f.observation).verified, false);
});

'use strict';

/** Verify persisted gateway receipts independently of browser report labels.
 * The artifacts do not store an HTTP status. artifact_verified describes this
 * proof; it never manufactures a successful network response.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cidForBytes, stableStringify } = require('./mcpplusplus-profile-a.cjs');

const ROUTE = '/mcp/tools/call';
const PROTOCOL = 'swissknife.all-app-tool-gateway.v1';
const OWNERS = new Set(['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']);
const CID = /^b[a-z2-7]{58}$/;
const text = value => typeof value === 'string' && value.length > 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

// Only inspect MCP envelope locations. Arbitrary objects inside returned
// application data are not independent execution acknowledgements.
function resultEnvelopes(result) {
  const pending = [result];
  const records = [];
  const seen = new Set();
  while (pending.length && records.length < 64) {
    const value = pending.shift();
    if (!object(value) || seen.has(value)) continue;
    seen.add(value);
    records.push(value);
    for (const name of ['result', 'response']) if (object(value[name])) pending.push(value[name]);
    for (const item of Array.isArray(value.content) ? value.content : []) {
      if (object(item?.json)) pending.push(item.json);
      if (item?.type === 'text' && typeof item.text === 'string') {
        try { const parsed = JSON.parse(item.text); if (object(parsed)) pending.push(parsed); } catch { /* Plain tool output is not an acknowledgement. */ }
      }
    }
  }
  return { records, truncated: pending.some(value => object(value) && !seen.has(value)) };
}

/** Reusable by a network capture against response.result.
 * Returns {verified,outcome,reason}; an "executed" mediator label alone fails.
 */
function assessOwnerResult(result, observation) {
  const fail = reason => ({ verified: false, outcome: '', reason });
  if (!observation || !['executed', 'denied'].includes(observation.outcome)) return fail('owner_outcome_not_success_or_denial');
  const { records, truncated } = resultEnvelopes(result);
  if (truncated) return fail('owner_result_envelope_limit_exceeded');
  if (!records.length) return fail('owner_result_missing');
  if (observation.outcome === 'denied') {
    const denial = records.some(value => value.error === 'policy_denied' || value.error === 'confirmation_required' || value.outcome === 'denied');
    if (!denial || !['deny', 'require_confirmation'].includes(observation.policy_outcome)) return fail('policy_denial_not_proven');
    if (records.some(value => value.ok === true || value.success === true || value.outcome === 'executed')) return fail('policy_denial_conflicts_with_success');
    return { verified: true, outcome: 'denied', reason: 'policy_denial_verified' };
  }
  if (observation.policy_outcome === 'deny') return fail('executed_outcome_conflicts_with_policy');
  const failed = new Set(['failed', 'error', 'unsupported', 'unreachable', 'denied']);
  for (const value of records) {
    if (value.isError === true || value.ok === false || value.success === false || value.error
      || failed.has(value.outcome) || failed.has(value.status)
      || (object(value.receipt) && (value.receipt.error || failed.has(value.receipt.status) || failed.has(value.receipt.outcome)))) {
      return fail('owner_result_reports_failure');
    }
    const receipt = value.receipt;
    for (const identity of [value.tool, value.tool_id, receipt?.tool, receipt?.tool_id]) {
      if (text(identity) && identity !== observation.tool_id) return fail('owner_result_tool_mismatch');
    }
    for (const dryRun of [value.dry_run, receipt?.dry_run]) {
      if (typeof dryRun === 'boolean' && dryRun !== observation.dry_run) return fail('owner_result_dry_run_mismatch');
    }
  }
  const transport = records.map(value => value.application_transport_observation).find(object);
  if (!transport || transport.transport !== observation.transport || transport.correlation_id !== observation.correlation_id
    || transport.ucan_did_verified !== true || !text(transport.remote_did) || !transport.remote_did.startsWith('did:')
    || !CID.test(transport.descriptor_cid || '') || !CID.test(transport.identity_proof_cid || '')) {
    return fail('owner_transport_proof_missing_or_mismatched');
  }
  const positive = records.some(value => value.ok === true || value.success === true || value.outcome === 'executed'
    || (object(value.receipt) && ['executed', 'success', 'ok', 'dry_run'].includes(value.receipt.status)));
  if (!positive) return fail('owner_execution_not_acknowledged');
  return { verified: true, outcome: 'executed', reason: 'owner_execution_verified' };
}

function readArtifact(artifactRoot, cid, kind) {
  if (!CID.test(cid || '')) throw new Error(`${kind}_cid_invalid`);
  const bytes = fs.readFileSync(path.join(artifactRoot, 'blocks', cid));
  if (cidForBytes(bytes) !== cid) throw new Error(`${kind}_cid_hash_mismatch`);
  const metadata = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'metadata', `${cid}.json`), 'utf8'));
  if (metadata.schema !== 'swissknife.mcpplusplus.artifact-metadata.v1' || metadata.cid !== cid
    || metadata.profile !== (kind === 'receipt' ? 'B' : 'F') || metadata.kind !== `swissknife_gateway_${kind}`
    || metadata.service !== 'ipfs_kit_py' || metadata.bytes !== bytes.length || metadata.pinned !== true) {
    throw new Error(`${kind}_metadata_mismatch`);
  }
  const artifact = JSON.parse(bytes.toString('utf8'));
  if (!object(artifact) || artifact.kind !== kind || !object(artifact.call) || !object(artifact.result)) throw new Error(`${kind}_artifact_invalid`);
  return artifact;
}

function loadConnectorArtifacts(rows, options = {}) {
  const artifactRoot = path.resolve(options.artifactRoot || process.env.MCPPLUSPLUS_ARTIFACT_STORE_DIR
    || path.join(os.homedir(), '.cache', 'swissknife', 'mcpplusplus-artifacts'));
  const observations = [];
  const problems = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const recorded = Array.isArray(row.observations) && row.observations.length ? row.observations : row.observation ? [row.observation] : [];
    for (const observation of recorded) {
      try {
        if (!observation || observation.route !== ROUTE || !['http', 'libp2p'].includes(observation.transport)
          || !['tool_id', 'correlation_id', 'policy_outcome', 'receipt_id', 'event_dag_cid'].every(name => text(observation[name]))
          || typeof observation.dry_run !== 'boolean') throw new Error('browser_observation_incomplete');
        const receipt = readArtifact(artifactRoot, observation.receipt_id, 'receipt');
        const event = readArtifact(artifactRoot, observation.event_dag_cid, 'event');
        if (stableStringify(receipt.call) !== stableStringify(event.call) || stableStringify(receipt.result) !== stableStringify(event.result)) throw new Error('receipt_event_content_mismatch');
        const call = receipt.call;
        const policy = call.input?.policy;
        if (call.protocol !== PROTOCOL || call.route !== ROUTE || call.receipt_required !== true
          || !text(row.app_id) || call.app_id !== row.app_id || !OWNERS.has(call.owner) || !text(call.binding_id)
          || !call.binding_id.startsWith(`${call.app_id}.${call.owner}.`)
          || !['tool_id', 'transport', 'correlation_id'].every(name => call[name] === observation[name])
          || call.input?.correlation_id !== observation.correlation_id || !object(policy)
          || policy.outcome !== observation.policy_outcome || policy.dry_run !== observation.dry_run) throw new Error('connector_call_identity_mismatch');
        const binding = String(row.selector || '').match(/data-live-gateway-binding\s*=\s*['"]([^'"]+)['"]/);
        for (const owner of [row.owner, observation.owner]) if (text(owner) && owner !== call.owner) throw new Error('connector_owner_mismatch');
        for (const bindingId of [row.binding_id, observation.binding_id, binding?.[1]]) if (text(bindingId) && bindingId !== call.binding_id) throw new Error('connector_binding_mismatch');
        const assessment = assessOwnerResult(receipt.result, observation);
        if (!assessment.verified) throw new Error(assessment.reason);
        const identity = stableStringify([call.app_id, call.owner, call.tool_id, call.transport, call.correlation_id, observation.receipt_id, observation.event_dag_cid]);
        if (seen.has(identity)) continue;
        seen.add(identity);
        observations.push({
          schema: 'swissknife.vdg-connector-artifact-observation.v1',
          // This gateway protocol is served only by the POST tools/call handler.
          method: 'POST', route: call.route, app_id: call.app_id, binding_id: call.binding_id,
          owner: call.owner, tool_id: call.tool_id, transport: call.transport,
          correlation_id: call.correlation_id, policy_outcome: policy.outcome, dry_run: policy.dry_run,
          outcome: assessment.outcome, receipt_id: observation.receipt_id, event_dag_cid: observation.event_dag_cid,
          artifact_verified: true, owner_result_verified: true, verification_method: 'persisted_gateway_artifacts',
        });
      } catch (error) {
        problems.push({ app_id: row.app_id || '', selector: row.selector || '', correlation_id: observation?.correlation_id || '',
          reason: error.code === 'ENOENT' ? 'connector_artifact_missing' : error instanceof SyntaxError ? 'connector_artifact_unreadable' : error.message });
      }
    }
  }
  return { observations, problems };
}

module.exports = { loadConnectorArtifacts, assessOwnerResult };

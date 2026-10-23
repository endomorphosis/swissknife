#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyMCPPPeerIdentity } from '../src/services/mcp/mcp-plus-plus-profile-c.ts';
const execute = promisify(execFile);
const { writeAtomicJson } = createRequire(import.meta.url)('./vdg-atomic-json.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.resolve(root, '../data/agent_supervisor/virtual_desktop_gui_mcp/watchdog');
const audience = 'did:key:z6MkvAUPBCMQzakz16QeKSg68XSeewjGUvpzUjxQGD33qwKu';
const python = process.env.IPFS_ACCELERATE_PYTHON || '/home/barberb/ipfs_accelerate_py/.venv/bin/python3';
const services = [
  ['ipfs_kit_py', 'kit', process.env.SWISSKNIFE_IPFS_KIT_MCP_URL || 'http://127.0.0.1:18014/mcp', 'node_id'],
  ['ipfs_datasets_py', 'datasets', process.env.SWISSKNIFE_IPFS_DATASETS_MCP_URL || 'http://127.0.0.1:13002/mcp', 'tools_list_categories'],
  ['ipfs_accelerate_py', 'accelerate', process.env.SWISSKNIFE_IPFS_ACCELERATE_MCP_URL || 'http://127.0.0.1:13003/mcp', 'get_hardware_info'],
];
function succeeded(value) {
  assert.ok(value && typeof value === 'object', 'owner returned no result');
  assert.notEqual(value.isError, true, JSON.stringify(value));
  assert.notEqual(value.success, false, JSON.stringify(value));
  assert.notEqual(value.ok, false, JSON.stringify(value));
  assert.ok(!value.error, JSON.stringify(value));
  assert.ok(!['error', 'failed', 'backend_error', 'unavailable'].includes(value.status), JSON.stringify(value));
  if (value.result && typeof value.result === 'object') succeeded(value.result);
  for (const item of value.content || []) {
    if (item.json) succeeded(item.json);
    else if (item.type === 'text') {
      let parsed;
      try { parsed = JSON.parse(item.text); } catch { continue; }
      if (parsed && typeof parsed === 'object') succeeded(parsed);
    }
  }
  return value;
}
async function call(endpoint, tool, args = {}) {
  let response;
  const readyDeadline = Date.now() + 30_000;
  while (!response) {
    try {
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `vdg-readiness:${tool}`, method: 'tools/call', params: { name: tool, arguments: args } }),
        signal: AbortSignal.timeout(Math.max(1, readyDeadline - Date.now())) });
      if ([502, 503, 504].includes(response.status) && Date.now() < readyDeadline) {
        await response.body?.cancel();
        response = undefined;
        await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(1, readyDeadline - Date.now()))));
      }
    } catch (error) {
      if (Date.now() >= readyDeadline) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(1, readyDeadline - Date.now()))));
    }
  }
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(!body.error, JSON.stringify(body.error));
  return succeeded(body.result);
}
const checks = [];
async function verifiedPeerCall(service, label, endpoint, tool) {
  const deadline = Date.now() + 45_000;
  while (true) {
    try {
      // Owner and bridge units can restart independently. Re-read the announcement
      // on every attempt so a previous process's address cannot pin readiness.
      const peer = JSON.parse(readFileSync(path.join(state, 'backend-peers', `ipfs-${label}-mcp-p2p-announce.json`), 'utf8'));
      assert.equal(peer.service, service);
      assert.equal(peer.endpoint, endpoint);
      const nonce = `vdg-readiness-${service}-${Date.now()}`;
      const { stdout } = await execute(python, [path.join(root, 'scripts/invoke-mcp-libp2p.py'), '--multiaddr', peer.multiaddr,
        '--tool-id', tool, '--arguments-json', JSON.stringify({ dry_run: true }), '--audience-did', audience, '--nonce', nonce],
      { cwd: root, timeout: Math.max(1, Math.min(30_000, deadline - Date.now())), maxBuffer: 4 * 1024 * 1024 });
      const proof = JSON.parse(stdout);
      succeeded(proof.result);
      const identity = await verifyMCPPPeerIdentity(proof.profile_c_identity, { audience, nonce, service, transport: 'libp2p' });
      assert.equal(identity.valid, true, identity.reason);
      return { proof, identity };
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(1_000, Math.max(1, deadline - Date.now()))));
    }
  }
}
try {
  for (const [service, label, endpoint, tool] of services) {
    const result = await call(endpoint, tool, { dry_run: true });
    assert.equal(result.receipt?.tool, tool, 'owner receipt must name the actual invoked tool');
    const { proof, identity } = await verifiedPeerCall(service, label, endpoint, tool);
    checks.push({ service, tool, http_verified: true, libp2p_verified: true, identity_verified: identity.valid,
      descriptor_cid: proof.profile_a_descriptor_cid, identity_proof_cid: identity.proofCid });
  }
  const kit = services[0][2];
  const file = '/swissknife/vdg/README.md';
  const before = await call(kit, 'files_read', { path: file, dry_run: true });
  const preview = await call(kit, 'files_write', { path: file, content: 'This preview must not replace the real file.', dry_run: true });
  const after = await call(kit, 'files_read', { path: file, dry_run: true });
  assert.equal(preview.content[0].json.written, false);
  assert.equal(preview.content[0].json.validated, true);
  assert.equal(before.content[0].json.bytes_base64, after.content[0].json.bytes_base64);
  assert.ok(Buffer.from(after.content[0].json.bytes_base64, 'base64').length > 0);
  checks.push({ operation: 'native_workspace', real_bytes_read: true, dry_run_validated: true, file_unchanged: true });
  const fixturePath = process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES || path.join(state, 'backends/desktop-payload-fixtures.json');
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const dataset = await call(services[1][2], 'load_dataset', {
    source: 'json', format: 'json', options: { data_files: fixtures.dataset_file, split: 'train' }, dry_run: true,
  });
  const rows = JSON.parse(readFileSync(fixtures.dataset_file, 'utf8'));
  assert.equal(dataset.content[0].json.summary.num_records, rows.length, 'actual loader must read the real local rows');
  const content = await call(services[1][2], 'get_from_ipfs', { cid: fixtures.dataset_cid, gateway: fixtures.gateway, dry_run: true });
  assert.equal(content.content[0].json.content, readFileSync(fixtures.dataset_file, 'utf8'), 'IPFS reads must return exact real bytes');
  const models = await call(services[2][2], 'list_models', { dry_run: true });
  assert.ok(models.content[0].json.includes(fixtures.inference_model), 'preview model must occur in the real owner catalog');
  checks.push({ operation: 'native_dataset_inputs', actual_rows: rows.length, exact_ipfs_bytes: true, model_in_owner_catalog: true });
  const search = await call(services[1][2], 'semantic_search', { query: 'desktop note provenance', model: fixtures.notes_embedding_model,
    collection: fixtures.notes_collection, top_k: 2, dry_run: true });
  assert.ok(search.content[0].json.total_found > 0, 'actual owned note index must produce genuine search results');
  assert.equal(search.content[0].json.model, fixtures.notes_embedding_model);
  checks.push({ operation: 'native_note_search', actual_results: search.content[0].json.total_found, actual_model: search.content[0].json.model });
  mkdirSync(state, { recursive: true });
  writeAtomicJson(path.join(state, 'backend-readiness.json'), { schema: 'swissknife.vdg-backend-readiness.v1',
    observed_at: new Date().toISOString(), passed: true, checks, gui_acceptance: false, work_complete: false, completion_authority: false });
  console.log(JSON.stringify({ passed: true, checks: checks.length, gui_acceptance: false }));
} catch (error) {
  mkdirSync(state, { recursive: true });
  writeAtomicJson(path.join(state, 'backend-readiness.json'), { schema: 'swissknife.vdg-backend-readiness.v1',
    observed_at: new Date().toISOString(), passed: false, error: error.message, checks,
    gui_acceptance: false, work_complete: false, completion_authority: false });
  console.error(JSON.stringify({ passed: false, error: error.message, completed_checks: checks.length, gui_acceptance: false }));
  process.exitCode = 1;
}

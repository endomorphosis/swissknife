import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { safeDesktopPayload } from '../../build-tools/configs/vite.web.config.ts';
import { getExecutableAppBackendDisposition } from '../../src/services/apps/all-app-executable-backend-contract.ts';
import { loadCanonicalContracts, validateContracts } from '../../scripts/capture-visual-functional-baseline.mjs';
const { cidForBytes } = createRequire(import.meta.url)('../../scripts/mcpplusplus-profile-a.cjs');

function fixtures(t, value) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-payload-unit-'));
  const file = path.join(directory, 'fixture.json');
  const previous = process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES;
  fs.writeFileSync(file, JSON.stringify(value));
  process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES = file;
  t.after(() => {
    if (previous === undefined) delete process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES;
    else process.env.SWISSKNIFE_VDG_PAYLOAD_FIXTURES = previous;
    fs.rmSync(directory, { recursive: true });
  });
}

test('app content defaults keep independently identified file and repository bytes separate', t => {
  const file = cidForBytes(Buffer.from('authored unit file, not native proof'));
  const github = cidForBytes(Buffer.from('authored unit repository, not native proof'));
  fixtures(t, { artifact_cids: { 'file-manager': file, github } });
  assert.deepEqual(safeDesktopPayload('ipfs_cat', 'ipfs.kit.storage', 'file-manager'), { cid: file });
  assert.deepEqual(safeDesktopPayload('ipfs_cat', 'ipfs.kit.storage', 'github'), { cid: github });
  assert.notEqual(safeDesktopPayload('ipfs_cat', 'ipfs.kit.storage', 'image-viewer').cid, github);
});

test('malformed app fixture CID is refused instead of substituting unrelated image bytes', t => {
  fixtures(t, { artifact_cids: { github: 'plausible-but-not-a-cid' } });
  assert.throws(() => safeDesktopPayload('ipfs_cat', 'ipfs.kit.storage', 'github'), /Invalid app content fixture CID/);
});

test('stored model catalog and native inference retain their distinct real owner argument schemas', t => {
  const cid = cidForBytes(Buffer.from('authored catalog unit bytes'));
  fixtures(t, { dataset_cid: cid, gateway: 'http://127.0.0.1:8091', inference_model: 'gpt2' });
  assert.deepEqual(safeDesktopPayload('get_from_ipfs', 'ipfs.datasets.discovery', 'huggingface'), { cid, gateway: 'http://127.0.0.1:8091' });
  const inference = safeDesktopPayload('run_inference_job', 'ipfs.accelerate.models', 'model-browser');
  assert.equal(inference.model, 'gpt2'); assert.equal(inference.model_id, 'gpt2');
  assert.equal(typeof inference.input, 'string'); assert.equal(inference.max_length, 64);
  const binding = getExecutableAppBackendDisposition('model-browser').backend_bindings.find(item => item.owner === 'ipfs_accelerate_py');
  assert.ok(binding.tool_selection.preferred_tool_ids.includes('run_inference_job'));
  assert.ok(binding.tool_selection.preferred_tool_ids.includes('list_models'));
  assert.equal(binding.mediated_intent.mutates_remote_state, true);
  assert.equal(binding.ui_control.confirmation, 'policy');
});

test('all45 authored app contracts still match the actual canonical TypeScript owner declarations', () => {
  const contracts = JSON.parse(fs.readFileSync(new URL('../../config/visual-functional-app-contracts.json', import.meta.url)));
  const { manifest, backend } = loadCanonicalContracts();
  assert.equal(validateContracts(contracts, manifest, backend), contracts);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../../vite.web.config.ts', import.meta.url), 'utf8');
const start = source.indexOf('function safeDesktopPayload(');
const end = source.indexOf('\nasync function persistGatewayArtifacts', start);
assert.ok(start > 0 && end > start);
const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function payloadBuilder(fixturesPath) {
  return new Function('readFileSync', 'process', 'LIVE_CLICK_FIXTURE_CID', `${compiled}; return safeDesktopPayload;`)(fs.readFileSync, { env: fixturesPath ? { SWISSKNIFE_VDG_PAYLOAD_FIXTURES: fixturesPath } : {} }, 'unused-kit-fixture-cid');
}

test('published dataset defaults preserve actual records and the actual provenance source CID', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-dataset-defaults-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = [{ text: 'actual local record one' }, { text: 'actual local record two' }];
  const datasetFile = path.join(root, 'source.json'); fs.writeFileSync(datasetFile, JSON.stringify(data));
  const fixtureFile = path.join(root, 'fixtures.json'); fs.writeFileSync(fixtureFile, JSON.stringify({ dataset_file: datasetFile, dataset_cid: 'actual-source-cid' }));
  const build = payloadBuilder(fixtureFile);
  assert.deepEqual(build('save_dataset', 'ipfs.datasets.provenance').dataset_data, { data });
  assert.deepEqual(build('record_provenance', 'ipfs.datasets.provenance'), {
    dataset_id: 'actual-source-cid', operation: 'vdg-gui-preview', inputs: ['actual-source-cid'], parameters: { source: 'real-desktop-control' },
  });
  assert.equal(payloadBuilder()('record_provenance', 'ipfs.datasets.provenance').dataset_id, undefined, 'an absent real source must not be replaced with a fabricated identifier');
});

test('actual Python callable validates the published previews while rejecting the previous malformed payloads', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-dataset-preview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const datasetFile = path.join(root, 'source.json'); fs.writeFileSync(datasetFile, JSON.stringify([{ text: 'actual source' }]));
  const fixtureFile = path.join(root, 'fixtures.json'); fs.writeFileSync(fixtureFile, JSON.stringify({ dataset_file: datasetFile, dataset_cid: 'actual-source-cid' }));
  const build = payloadBuilder(fixtureFile);
  const adapter = require('../../scripts/start-ipfs-datasets-mcp-compat.cjs');
  const destination = path.join(root, 'must-not-be-written.json');
  const requests = [
    ['record_provenance', build('record_provenance', 'ipfs.datasets.provenance')],
    ['save_dataset', { ...build('save_dataset', 'ipfs.datasets.provenance'), destination }],
    ['record_provenance', { operation: 'vdg-gui-preview', inputs: [] }],
    ['save_dataset', { dataset_data: [{ text: 'old invalid array' }], destination }],
  ];
  const datasetsRoot = path.resolve(new URL('../../../external/ipfs_datasets', import.meta.url).pathname);
  const python = process.env.PYTHON || path.join(datasetsRoot, '.venv/bin/python');
  const result = spawnSync(python, ['-u', '-c', adapter.CONTRACT_WORKER_CODE], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 4000000,
    env: { ...process.env, PYTHONPATH: datasetsRoot },
    input: requests.map(([name, args], id) => JSON.stringify({ id, ...adapter.CONTRACT_OP_IMPLEMENTATIONS[name], args: { ...args, dry_run: true }, preview: true })).join('\n') + '\n',
  });
  assert.equal(result.error, undefined, result.error?.message); assert.equal(result.status, 0, result.stderr);
  const replies = result.stdout.trim().split('\n').map(line => JSON.parse(line)); assert.equal(replies.length, 4);
  for (const reply of replies.slice(0, 2)) {
    assert.equal(reply.ok, true, JSON.stringify(reply)); assert.equal(reply.result.validation, 'real-callable-signature');
    assert.equal(reply.result.body_executed, false); assert.equal(reply.result.mutation_performed, false);
  }
  assert.equal(replies[2].ok, false); assert.match(replies[2].error, /dataset_id/);
  assert.equal(replies[3].ok, false); assert.match(replies[3].error, /dataset_data/);
  assert.equal(fs.existsSync(destination), false);
});

test('published inference defaults validate the actual required input_data while native input can replace the preview text', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-inference-defaults-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixtures = path.join(root, 'fixtures.json'); fs.writeFileSync(fixtures, JSON.stringify({ inference_model: 'actual-catalog-model' }));
  const defaults = payloadBuilder(fixtures)('run_inference_job', 'ipfs.accelerate.inference_job');
  assert.equal(defaults.model, 'actual-catalog-model'); assert.equal(typeof defaults.input, 'string'); assert.ok(defaults.input.length > 0 && defaults.input.length < 256);
  assert.equal(defaults.max_length, 64); assert.equal(defaults.input_data, undefined, 'native legacy input must remain able to override the shared preview default');
  const adapter = require('../../scripts/all-tools-evidence-lib.cjs');
  const pythonRoot = path.resolve(new URL('../../../external/ipfs_accelerate', import.meta.url).pathname);
  const python = process.env.PYTHON || path.resolve(new URL('../../../external/ipfs_datasets/.venv/bin/python', import.meta.url).pathname);
  const results = [];
  for (const input of [defaults.input, 'Actual user graph/prompt']) {
    const output = await adapter.callAccelerateContractOp('http://unused.invalid', 'run_inference_job', { ...defaults, input, dry_run: true }, async (spec, request) => {
      assert.equal(spec.argMap.input, 'input_data'); assert.equal(request.input, input);
      const mapped = { model: request.model, input_data: request.input, max_length: request.max_length, dry_run: true };
      const result = spawnSync(python, ['-u', '-c', adapter.ACCELERATE_CONTRACT_WORKER_CODE], {
        encoding: 'utf8', timeout: 60000, maxBuffer: 4000000, env: { ...process.env, PYTHONPATH: pythonRoot },
        input: JSON.stringify({ id: 1, spec, args: mapped, preview: true }) + '\n',
      });
      assert.equal(result.error, undefined, result.error?.message); assert.equal(result.status, 0, result.stderr);
      const reply = JSON.parse(result.stdout.trim()); results.push(reply); return reply;
    });
    assert.equal(output.receipt.status, 'ok'); assert.equal(output.content[0].json.validation, 'real-callable-signature');
    assert.equal(output.content[0].json.body_executed, false); assert.equal(output.content[0].json.mutation_performed, false);
    assert.ok(output.content[0].json.validated_parameters.includes('input_data'));
  }
  assert.ok(results.every(result => result.ok === true));
});

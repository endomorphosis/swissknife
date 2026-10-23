import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const datasetsRoot = path.join(workspace, 'external/ipfs_datasets');
process.env.IPFS_DATASETS_PY_ROOT = datasetsRoot;
const adapter = createRequire(import.meta.url)('../../scripts/start-ipfs-datasets-mcp-compat.cjs');
const python = process.env.PYTHON || path.join(datasetsRoot, '.venv/bin/python');
const specs = adapter.CONTRACT_OP_IMPLEMENTATIONS;

test('real metadata reads remain executable under dry-run and have truthful success receipts', async () => {
  for (const name of ['tools_list_categories', 'tools_list_tools', 'tools_get_schema']) {
    const result = await adapter.callDatasetTool({ params: { name, arguments: { tool: 'load_dataset', dry_run: true } } });
    assert.equal(result.isError, undefined);
    assert.equal(result.receipt.status, 'ok');
    assert.equal(result.content[0].json.dry_run, undefined);
    if (name === 'tools_get_schema') assert.equal(result.content[0].json.found, true);
  }
});

test('read dispatch calls its actual implementation even under dry-run', async () => {
  let called = false;
  const actual = { status: 'success', summary: { num_records: 2 } };
  const result = await adapter.callContractOperation('load_dataset', { source: 'json', dry_run: true }, async (impl, args) => {
    called = true;
    assert.equal(impl.func, 'load_dataset');
    assert.equal(args.dry_run, true);
    return { ok: true, result: actual };
  });
  assert.equal(called, true);
  assert.equal(result.content[0].json, actual);
  assert.equal(result.receipt.status, 'ok');
  assert.equal(result.receipt.execution_mode, 'backend_execution');
});

test('real backend error values, nested MCP text errors, and worker exceptions cannot claim success', async () => {
  for (const result of [{ status: 'error', message: 'no dataset' }, { ok: false }, { content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: 'invalid' }) }] }]) {
    const value = await adapter.callContractOperation('load_dataset', {}, async () => ({ ok: true, result }));
    assert.equal(value.isError, true);
    assert.equal(value.receipt.status, 'backend_error');
    assert.equal(value.content[0].json, result);
  }
  const value = await adapter.callContractOperation('load_dataset', {}, async () => ({ ok: false, error: 'ModuleNotFoundError' }));
  assert.equal(value.isError, true);
  assert.equal(value.receipt.status, 'backend_error');
});

test('mock index implementation and unreviewed dry-runs fail closed', async () => {
  const unavailable = await adapter.callDatasetTool({ params: { name: 'load_index', arguments: { action: 'load', dry_run: true } } });
  assert.equal(unavailable.isError, true);
  assert.equal(unavailable.receipt.status, 'not_implemented');
  assert.match(unavailable.content[0].text, /MockIndexManager/);
  const unknown = await adapter.callDatasetTool({ params: { name: 'unreviewed', arguments: { dry_run: true } } });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.receipt.status, 'error');
});

test('real Python callable validates previews and rejects malformed write inputs without producing files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasets-contracts-'));
  try {
    const destination = path.join(temporary, 'must-not-exist.json');
    const source = path.join(temporary, 'actual-source.json');
    fs.writeFileSync(source, JSON.stringify([{ text: 'one' }, { text: 'two' }]));
    const requests = [
      { ...specs.save_dataset, args: { dry_run: true, dataset_data: { rows: [{ text: 'actual source data' }] }, destination }, preview: true },
      { ...specs.save_dataset, args: { dry_run: true }, preview: true },
      { ...specs.record_provenance, args: { dataset_id: 42, operation: 'validate' }, preview: true },
      { ...specs.record_provenance, args: { dataset_id: 'fixture', operation: 'validate', inputs: [] }, preview: true },
      { ...specs.load_dataset, args: { dry_run: true, source: 'json', format: 'json', options: { data_files: source, split: 'train' } } },
    ];
    const processResult = spawnSync(python, ['-u', '-c', adapter.CONTRACT_WORKER_CODE], {
      cwd: workspace, encoding: 'utf8', timeout: 60_000, maxBuffer: 10_000_000,
      env: { ...process.env, PYTHONPATH: datasetsRoot, HF_HUB_OFFLINE: '1', HF_DATASETS_OFFLINE: '1' },
      input: requests.map((request, index) => JSON.stringify({ id: index + 1, ...request })).join('\n') + '\n',
    });
    assert.equal(processResult.error, undefined, processResult.error?.message);
    assert.equal(processResult.status, 0, processResult.stderr);
    const lines = processResult.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(lines.length, requests.length);
    for (const index of [0, 3]) {
      assert.equal(lines[index].ok, true, JSON.stringify(lines[index]));
      assert.equal(lines[index].result.validation, 'real-callable-signature');
      assert.equal(lines[index].result.body_executed, false);
      assert.equal(lines[index].result.mutation_performed, false);
    }
    assert.equal(lines[1].ok, false);
    assert.match(lines[1].error, /dataset_data/);
    assert.equal(lines[2].ok, false);
    assert.match(lines[2].error, /dataset_id/);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(lines[4].ok, true, JSON.stringify(lines[4]));
    assert.equal(lines[4].result.status, 'success', JSON.stringify(lines[4].result));
    assert.equal(lines[4].result.summary.num_records, 2);
    assert.equal(lines[4].result.dry_run, undefined);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

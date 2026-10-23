import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import adapter from '../../scripts/all-tools-evidence-lib.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const python = process.env.PYTHON || path.join(root, 'external/ipfs_datasets/.venv/bin/python');
const specs = adapter.ACCELERATE_CONTRACT_OPS;
function worker(requests) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'accelerate-contracts-'));
  try {
    const result = spawnSync(python, ['-u', '-c', adapter.ACCELERATE_CONTRACT_WORKER_CODE], {
      cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 10_000_000,
      env: { ...process.env, HOME: temporary, PYTHONPATH: path.join(root, 'external/ipfs_accelerate'), IPFS_ACCELERATE_PY_TASK_QUEUE_PATH: path.join(temporary, 'queue.duckdb') },
      input: requests.map((request, index) => JSON.stringify({ id: index + 1, ...request })).join('\n') + '\n',
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(lines.length, requests.length, 'one actual JSON-line response per request');
    return { lines, files: fs.readdirSync(temporary) };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

test('real health and model registry reads execute even when caller requests dry-run', () => {
  const { lines } = worker([
    { spec: specs['HealthChecker.check_detailed'], args: { dry_run: true } },
    { spec: specs.list_models, args: { dry_run: true } },
  ]);
  assert.equal(lines[0].ok, true, JSON.stringify(lines[0]));
  assert.equal(lines[0].result.status, 'healthy');
  assert.ok(Number.isFinite(Date.parse(lines[0].result.timestamp)));
  assert.equal(lines[0].result.dry_run, undefined, 'read returns backend data, not a synthetic preview acknowledgement');
  assert.equal(lines[1].ok, true, JSON.stringify(lines[1]));
  assert.ok(Array.isArray(lines[1].result));
  assert.ok(lines[1].result.length > 0);
});

test('actual Prometheus telemetry is read and its reusable instance avoids duplicate registrations', () => {
  const { lines } = worker([
    { spec: specs['PrometheusMetrics.generate_metrics'], args: { dry_run: true } },
    { spec: specs.telemetry, args: { dry_run: true } },
  ]);
  for (const line of lines) {
    assert.equal(line.ok, true, JSON.stringify(line));
    assert.equal(line.result.encoding, 'utf-8');
    assert.match(line.result.content, /hf_server_requests_total/);
    assert.match(line.result.content, /python_/);
  }
});

test('missing telemetry dependency cannot silently use the upstream no-op fallback', () => {
  const { lines } = worker([{ spec: { module: 'math', func: 'sqrt', require_flag: 'HAVE_PROMETHEUS_CLIENT' }, args: {} }]);
  assert.equal(lines[0].ok, false);
  assert.match(lines[0].error, /Required real backend dependency is unavailable/);
});

test('mutation preview validates the real submit callable without creating a queue or task ID', () => {
  const { lines, files } = worker([{ spec: specs.submit_task, preview: true, args: { dry_run: true, prompt: 'Review the selected source', model_name: 'gpt2' } }]);
  assert.equal(lines[0].ok, true, JSON.stringify(lines[0]));
  assert.equal(lines[0].result.validation, 'real-callable-signature');
  assert.equal(lines[0].result.body_executed, false);
  assert.equal(lines[0].result.mutation_performed, false);
  assert.equal(lines[0].result.task_id, undefined);
  assert.equal(files.includes('queue.duckdb'), false);
});

test('malformed mutation preview fails the actual callable signature and annotations', () => {
  const { lines } = worker([
    { spec: specs.submit_task, preview: true, args: { dry_run: true } },
    { spec: specs.submit_task, preview: true, args: { dry_run: true, prompt: 42 } },
  ]);
  assert.equal(lines[0].ok, false);
  assert.match(lines[0].error, /prompt/);
  assert.equal(lines[1].ok, false);
  assert.match(lines[1].error, /prompt/);
});

test('quarantined coordinator is preview-only and its constructor is never used for preview', () => {
  const { lines } = worker([
    { spec: specs['WorkflowCoordinator.submit_task'], preview: true, args: { task_id: 'preview-request', task_type: 'inference', data: {} } },
    { spec: specs['WorkflowCoordinator.submit_task'], args: { task_id: 'preview-request', task_type: 'inference', data: {} } },
  ]);
  assert.equal(lines[0].ok, true, JSON.stringify(lines[0]));
  assert.equal(lines[0].result.live_execution_allowed, false);
  assert.equal(lines[0].result.body_executed, false);
  assert.equal(lines[1].ok, false);
  assert.match(lines[1].error, /quarantined/);
});

test('adapter read path invokes Python and retains the actual result under dry-run', async () => {
  let invoked = false;
  const actual = { status: 'healthy', timestamp: '2026-10-21T02:30:00Z' };
  const response = await adapter.callAccelerateContractOp('http://unused.invalid', 'HealthChecker.check_detailed', { dry_run: true }, async (spec, args) => {
    invoked = true;
    assert.equal(spec.method, 'check_detailed');
    assert.equal(args.dry_run, true);
    return { ok: true, result: actual };
  });
  assert.equal(invoked, true);
  assert.equal(response.content[0].json, actual);
  assert.equal(response.receipt.execution_mode, 'backend_execution');
  assert.equal(response.receipt.dry_run, true);
  assert.equal(response.receipt.status, 'ok');
});

test('Python-returned error envelopes never become successful execution receipts', async () => {
  for (const result of [{ isError: true }, { result: { ok: false, error: 'backend unavailable' } }, { content: [{ type: 'json', json: { status: 'error' } }] }]) {
    const response = await adapter.callAccelerateContractOp('http://unused.invalid', 'HealthChecker.check_detailed', {}, async () => ({ ok: true, result }));
    assert.equal(response.isError, true);
    assert.equal(response.receipt.status, 'backend_error');
    assert.equal(response.content[0].json, result);
  }
});

test('catalog advertises reviewed real entrypoints but unknown dry-runs cannot claim execution', async t => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ tools: [{ name: 'unreviewed_write' }] }) });
  t.after(() => { globalThis.fetch = original; });
  const upstream = 'http://accelerate-contract-unit.invalid';
  const tools = await adapter.accelerateCompatTools(upstream);
  for (const name of ['HealthChecker.check_detailed', 'WorkflowCoordinator.submit_task', 'list_models', 'job_status', 'telemetry', 'detect_hardware']) assert.ok(tools.some(tool => tool.name === name), name);
  assert.equal(tools.find(tool => tool.name === 'WorkflowCoordinator.submit_task').execution_mode, 'validated-preview-only');
  const metadata = await adapter.callAccelerateCompatTool(upstream, 'tools_list_categories', { dry_run: true });
  assert.equal(metadata.receipt.status, 'ok');
  assert.ok(Array.isArray(metadata.content[0].json.categories));
  assert.equal(metadata.content[0].json.dry_run, undefined);
  const result = await adapter.callAccelerateCompatTool(upstream, 'unreviewed_write', { dry_run: true });
  assert.equal(result.isError, true);
  assert.equal(result.receipt.status, 'error');
  assert.match(result.content[0].text, /No reviewed dry-run entrypoint/);
});

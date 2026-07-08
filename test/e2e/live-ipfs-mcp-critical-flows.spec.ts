import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { expect, test } from '@playwright/test';

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const liveFlowsPath = join(evidenceRoot, 'live-critical-flows.json');
const receiptSamplesPath = join(evidenceRoot, 'receipt-samples.json');
const requestTimeoutMs = Number(process.env.SWISSKNIFE_MCP_EVIDENCE_TIMEOUT_MS || 10_000);

const endpoints = {
  ipfs_kit_py: process.env.IPFS_KIT_MCP_URL || 'http://127.0.0.1:8014',
  ipfs_datasets_py: process.env.IPFS_DATASETS_MCP_URL || 'http://127.0.0.1:3002',
  ipfs_accelerate_py: process.env.IPFS_ACCELERATE_MCP_URL || 'http://127.0.0.1:3003',
} as const;

test('SVD-019 live critical IPFS MCP flows emit receipts', async () => {
  mkdirSync(evidenceRoot, { recursive: true });

  const runId = `svd019-${Date.now()}`;
  const flows: LiveFlowResult[] = [];

  flows.push(await runFlow({
    id: 'ipfs-kit-write-bucket',
    service_id: 'ipfs_kit_py',
    service_family: 'ipfs_kit_py',
    flow_kind: 'write',
    method: 'tools/call',
    params: {
      name: 'Buckets.create_bucket',
      arguments: { name: runId },
    },
    success: payload => payload.ok === true || payload.name === runId,
  }));

  flows.push(await runFlow({
    id: 'ipfs-kit-read-bucket',
    service_id: 'ipfs_kit_py',
    service_family: 'ipfs_kit_py',
    flow_kind: 'read',
    method: 'tools/call',
    params: {
      name: 'Buckets.get_bucket',
      arguments: { name: runId },
    },
    success: payload => payload.name === runId,
  }));

  flows.push(await runFlow({
    id: 'datasets-save-json',
    service_id: 'ipfs_datasets_py',
    service_family: 'ipfs_datasets_py',
    flow_kind: 'dataset',
    method: 'tools/call',
    params: {
      name: 'dataset_tools.save_dataset',
      arguments: {
        dataset_data: { records: [{ id: runId, value: 1 }] },
        destination: `/tmp/${runId}.json`,
        format: 'json',
        options: {},
      },
    },
    success: payload => payload.status === 'success' && payload.destination === `/tmp/${runId}.json`,
  }));

  flows.push(await runFlow({
    id: 'datasets-vector-index',
    service_id: 'ipfs_datasets_py',
    service_family: 'ipfs_datasets_py',
    flow_kind: 'vector',
    method: 'tools/call',
    params: {
      name: 'vector_tools.create_vector_index',
      arguments: {
        vectors: [[0.1, 0.2], [0.2, 0.3]],
        dimension: 2,
        metric: 'cosine',
        metadata: [{ id: `${runId}-a` }, { id: `${runId}-b` }],
        index_id: `${runId}-vector`,
        index_name: 'SVD-019 Vector Probe',
      },
    },
    success: payload => payload.status === 'success' && payload.index_id === `${runId}-vector`,
  }));

  flows.push(await runFlow({
    id: 'datasets-provenance-verify',
    service_id: 'ipfs_datasets_py',
    service_family: 'ipfs_datasets_py',
    flow_kind: 'provenance',
    method: 'tools/call',
    params: {
      name: 'graph_tools.graph_provenance_verify',
      arguments: {},
    },
    success: payload => payload.status === 'success' && payload.valid === true,
  }));

  flows.push(await runFlow({
    id: 'accelerate-hardware-recommend',
    service_id: 'ipfs_accelerate_py',
    service_family: 'ipfs_accelerate_py',
    flow_kind: 'hardware',
    method: 'tools/call',
    params: {
      name: 'tools_dispatch',
      arguments: {
        category: 'Hardware',
        tool: 'hardware_recommend',
        params: { task_type: 'inference' },
      },
    },
    success: payload => Array.isArray(payload.recommendations) && payload.recommendations.length > 0,
  }));

  const requiredKinds = new Set(['read', 'write', 'dataset', 'vector', 'provenance', 'hardware']);
  const passedKinds = new Set(flows.filter(flow => flow.status === 'passed').map(flow => flow.flow_kind));
  const missingRequiredKinds = Array.from(requiredKinds).filter(kind => !passedKinds.has(kind));
  const generatedAt = new Date().toISOString();
  const report = {
    schema: 'swissknife.live-ipfs-mcp-critical-flows.v1',
    generated_at: generatedAt,
    status: missingRequiredKinds.length === 0 ? 'passed' : 'failed',
    endpoints,
    run_id: runId,
    flow_count: flows.length,
    passed_count: flows.filter(flow => flow.status === 'passed').length,
    missing_required_kinds: missingRequiredKinds,
    flows,
  };
  const receiptSamples = {
    schema: 'swissknife.live-ipfs-mcp-receipt-samples.v1',
    generated_at: generatedAt,
    run_id: runId,
    samples: flows
      .filter(flow => flow.status === 'passed')
      .map(flow => ({
        service_id: flow.service_id,
        flow_id: flow.id,
        flow_kind: flow.flow_kind,
        endpoint: flow.endpoint,
        receipt_sha256: flow.receipt_sha256,
        request_id: flow.request_id ?? null,
        duration_ms: flow.duration_ms,
      })),
  };

  writeFileSync(liveFlowsPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(receiptSamplesPath, `${JSON.stringify(receiptSamples, null, 2)}\n`, 'utf8');

  expect(report.status, JSON.stringify(report.flows, null, 2)).toBe('passed');
  expect(receiptSamples.samples.length).toBe(flows.length);
});

interface LiveFlowInput {
  id: string;
  service_id: keyof typeof endpoints;
  service_family: string;
  flow_kind: string;
  method: string;
  params: Record<string, unknown>;
  success: (payload: Record<string, any>) => boolean;
}

interface LiveFlowResult {
  id: string;
  service_id: keyof typeof endpoints;
  service_family: string;
  flow_kind: string;
  endpoint: string;
  method: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  request_id?: string;
  receipt_sha256: string;
  payload_summary: Record<string, unknown>;
  error?: string;
}

async function runFlow(input: LiveFlowInput): Promise<LiveFlowResult> {
  const endpoint = `${endpoints[input.service_id].replace(/\/$/, '')}/mcp`;
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: input.id,
        method: input.method,
        params: input.params,
      }),
    });
    const json = await response.json();
    const payload = extractPayload(json);
    const status = response.ok && !json.error && input.success(payload) ? 'passed' : 'failed';
    return {
      id: input.id,
      service_id: input.service_id,
      service_family: input.service_family,
      flow_kind: input.flow_kind,
      endpoint,
      method: input.method,
      status,
      duration_ms: Date.now() - started,
      request_id: typeof payload.request_id === 'string' ? payload.request_id : undefined,
      receipt_sha256: receiptHash({ input, json }),
      payload_summary: summarizePayload(payload),
      ...(status === 'failed' ? { error: json.error?.message || payload.message || payload.error || 'flow did not satisfy success predicate' } : {}),
    };
  } catch (error) {
    return {
      id: input.id,
      service_id: input.service_id,
      service_family: input.service_family,
      flow_kind: input.flow_kind,
      endpoint,
      method: input.method,
      status: 'failed',
      duration_ms: Date.now() - started,
      receipt_sha256: receiptHash({ input, error: String(error) }),
      payload_summary: { kind: 'error' },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractPayload(json: Record<string, any>): Record<string, any> {
  const result = json.result;
  if (!result) return {};
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const text = Array.isArray(result.content)
    ? result.content.find((item: any) => item?.type === 'text')?.text
    : undefined;
  if (typeof text === 'string') {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
    } catch {
      return { text };
    }
  }
  return result && typeof result === 'object' ? result : {};
}

function summarizePayload(payload: Record<string, any>): Record<string, unknown> {
  return {
    keys: Object.keys(payload).sort().slice(0, 20),
    status: payload.status,
    ok: payload.ok,
    request_id: payload.request_id,
    name: payload.name,
    dataset_id: payload.dataset_id,
    index_id: payload.index_id,
    valid: payload.valid,
  };
}

function receiptHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

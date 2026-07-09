/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const bindingsPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const policyPath = join(evidenceRoot, 'all-tools-policy-matrix.json');
const routeCoveragePath = join(evidenceRoot, 'all-tools-app-route-coverage.json');
const callEnvelopePath = join(evidenceRoot, 'all-tools-call-envelope-fixtures.json');

interface LedgerTool {
  tool_id: string;
  service_id: string;
  service: string;
  role?: string;
  endpoint?: string;
  name: string;
  category: string;
  schema_hash?: string;
}

interface LedgerArtifact {
  schema: string;
  tools: LedgerTool[];
}

interface BindingRow {
  tool_id: string;
  service_id: string;
  name: string;
  category: string;
  owner_module: string;
  app_id?: string;
  capability_id?: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  glasses_fallback?: string;
  glasses_exposure?: string;
  app_visible: boolean;
}

interface BindingArtifact {
  matrix_id: string;
  rows: BindingRow[];
}

interface PolicyRule {
  tool_id: string;
  service_id: string;
  role?: string;
  exposure?: string;
  exposure_disposition?: string;
  confirmation_required?: boolean;
  confirmation_policy: string;
  receipt_required?: boolean;
  receipt_policy: string;
  policy_class: string;
  fallback?: string;
  fallback_rule?: string;
}

interface PolicyArtifact {
  matrix_id: string;
  tools: PolicyRule[];
}

interface RouteCoverageArtifact {
  schema: string;
  app_routable_tool_count: number;
  route_rows: {
    tool_id: string;
    service_id: string;
    app_visible: boolean;
    app_id?: string;
    capability_id?: string;
    policy_class: string;
    confirmation_policy: string;
    receipt_policy: string;
    glasses_fallback?: string;
  }[];
}

interface CallEnvelope {
  envelope_id: string;
  protocol: 'mcp++';
  transport: 'json-rpc';
  service_id: string;
  service_role: string;
  endpoint?: string;
  tool_id: string;
  tool_name: string;
  method: 'tools/call';
  app_id: string;
  capability_id: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  glasses_fallback: string;
  adapter_required: boolean;
  input_schema: {
    type: 'object';
    additionalProperties: true;
    schema_hash?: string;
  };
  request: {
    jsonrpc: '2.0';
    method: 'tools/call';
    params: {
      name: string;
      arguments: Record<string, unknown>;
    };
  };
  result_envelope: {
    ok: true;
    result_path: 'result';
    artifact_refs: string[];
    receipt_refs: string[];
    event_dag_refs: string[];
  };
  error_envelope: {
    ok: false;
    error_codes: string[];
    retryable: boolean;
  };
  receipt_refs: string[];
  event_dag_refs: string[];
  cancellation: {
    cancellable: true;
    method: '$/cancelRequest';
    timeout_ms: number;
    timeout_behavior: 'emit_timeout_error_and_receipt';
  };
}

interface CallEnvelopeCatalog {
  schema: 'swissknife.all-tools-call-envelope-fixtures.v1';
  generated_at: string;
  generated_from: string[];
  envelope_count: number;
  app_routable_tool_count: number;
  confirmation_required_count: number;
  receipt_required_count: number;
  adapter_required_envelope_count: number;
  service_counts: Record<string, number>;
  service_role_counts: Record<string, number>;
  app_counts: Record<string, number>;
  policy_counts: Record<string, number>;
  envelopes: CallEnvelope[];
}

let catalog: CallEnvelopeCatalog;
let routeCoverage: RouteCoverageArtifact;

describe('all MCP/MCP++ app-routable call envelope fixtures', () => {
  beforeAll(() => {
    const ledger = readJson<LedgerArtifact>(ledgerPath);
    const bindings = readJson<BindingArtifact>(bindingsPath);
    const policy = readJson<PolicyArtifact>(policyPath);
    routeCoverage = readJson<RouteCoverageArtifact>(routeCoveragePath);
    catalog = buildCallEnvelopeCatalog(ledger, bindings, policy, routeCoverage);
    actualFs.mkdirSync(dirname(callEnvelopePath), { recursive: true });
    actualFs.writeFileSync(callEnvelopePath, `${JSON.stringify(catalog, null, 2)}\n`);
  });

  it('writes one call envelope for every app-routable route row', () => {
    expect(catalog.schema).toBe('swissknife.all-tools-call-envelope-fixtures.v1');
    expect(catalog.envelope_count).toBe(routeCoverage.app_routable_tool_count);
    expect(catalog.envelope_count).toBe(627);
    expect(new Set(catalog.envelopes.map(envelope => envelope.envelope_id)).size).toBe(catalog.envelope_count);
    expect(actualFs.existsSync(callEnvelopePath)).toBe(true);
  });

  it('preserves service, role, app, and policy coverage for app-routable tools', () => {
    expect(catalog.service_counts).toEqual({
      ipfs_accelerate_py: 218,
      ipfs_datasets_py: 326,
      ipfs_kit_py: 83,
    });
    expect(catalog.service_role_counts).toEqual({
      'ipfs_accelerate_py:configured_compat': 110,
      'ipfs_accelerate_py:real_local': 108,
      'ipfs_datasets_py:configured': 326,
      'ipfs_kit_py:configured': 83,
    });
    expect(catalog.app_counts).toEqual({
      'ipfs-explorer': 152,
      'mcp-control': 380,
      'model-browser': 95,
    });
    expect(catalog.confirmation_required_count).toBe(291);
    expect(catalog.receipt_required_count).toBe(627);
    expect(catalog.adapter_required_envelope_count).toBe(108);
  });

  it('includes request, result, error, receipt, event DAG, and cancellation envelopes', () => {
    for (const envelope of catalog.envelopes) {
      expect(envelope.protocol).toBe('mcp++');
      expect(envelope.transport).toBe('json-rpc');
      expect(envelope.method).toBe('tools/call');
      expect(envelope.request).toEqual({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: envelope.tool_name,
          arguments: {},
        },
      });
      expect(envelope.input_schema.type).toBe('object');
      expect(envelope.input_schema.additionalProperties).toBe(true);
      expect(envelope.result_envelope.ok).toBe(true);
      expect(envelope.result_envelope.receipt_refs).toEqual(envelope.receipt_refs);
      expect(envelope.result_envelope.event_dag_refs).toEqual(envelope.event_dag_refs);
      expect(envelope.error_envelope.ok).toBe(false);
      expect(envelope.error_envelope.error_codes).toEqual(expect.arrayContaining([
        'POLICY_DENIED',
        'VALIDATION_ERROR',
        'MCP_TOOL_ERROR',
        'TIMEOUT',
        'CANCELLED',
      ]));
      expect(envelope.receipt_refs).toHaveLength(1);
      expect(envelope.event_dag_refs).toHaveLength(1);
      expect(envelope.cancellation.cancellable).toBe(true);
      expect(envelope.cancellation.method).toBe('$/cancelRequest');
      expect(envelope.cancellation.timeout_ms).toBeGreaterThan(0);
    }
  });

  it('marks adapter-source-only envelopes without hiding their app route', () => {
    const adapterSourceOnly = catalog.envelopes.filter(envelope => envelope.adapter_required);

    expect(adapterSourceOnly).toHaveLength(108);
    expect(adapterSourceOnly.every(envelope => envelope.service_id === 'ipfs_accelerate_py')).toBe(true);
    expect(adapterSourceOnly.every(envelope => envelope.service_role === 'real_local')).toBe(true);
    expect(adapterSourceOnly.every(envelope => Boolean(envelope.app_id && envelope.capability_id))).toBe(true);
  });
});

function buildCallEnvelopeCatalog(
  ledger: LedgerArtifact,
  bindings: BindingArtifact,
  policy: PolicyArtifact,
  routes: RouteCoverageArtifact,
): CallEnvelopeCatalog {
  const ledgerByTool = new Map(ledger.tools.map(tool => [tool.tool_id, tool]));
  const bindingByTool = new Map(bindings.rows.map(row => [row.tool_id, row]));
  const policyByTool = new Map(policy.tools.map(row => [row.tool_id, row]));
  const appRoutes = routes.route_rows
    .filter(row => row.app_visible)
    .map(row => {
      const tool = ledgerByTool.get(row.tool_id);
      const binding = bindingByTool.get(row.tool_id);
      const rule = policyByTool.get(row.tool_id);
      if (!tool || !binding || !rule) throw new Error(`${row.tool_id}: missing ledger, binding, or policy row`);
      return buildCallEnvelope(tool, binding, rule);
    })
    .sort((left, right) => left.envelope_id.localeCompare(right.envelope_id));

  return {
    schema: 'swissknife.all-tools-call-envelope-fixtures.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [ledger.schema, bindings.matrix_id, policy.matrix_id, routes.schema],
    envelope_count: appRoutes.length,
    app_routable_tool_count: routes.app_routable_tool_count,
    confirmation_required_count: appRoutes.filter(envelope => envelope.confirmation_policy === 'required').length,
    receipt_required_count: appRoutes.filter(envelope => envelope.receipt_policy === 'required').length,
    adapter_required_envelope_count: appRoutes.filter(envelope => envelope.adapter_required).length,
    service_counts: countBy(appRoutes, envelope => envelope.service_id),
    service_role_counts: countBy(appRoutes, envelope => `${envelope.service_id}:${envelope.service_role}`),
    app_counts: countBy(appRoutes, envelope => envelope.app_id),
    policy_counts: countBy(appRoutes, envelope => envelope.policy_class),
    envelopes: appRoutes,
  };
}

function buildCallEnvelope(
  tool: LedgerTool,
  binding: BindingRow,
  rule: PolicyRule,
): CallEnvelope {
  const receiptRefs = binding.receipt_policy === 'required' ? [`receipt:${tool.tool_id}`] : [];
  const eventDagRefs = [`event-dag:${tool.tool_id}`];
  const adapterRequired = rule.exposure === 'adapter_source_only' || rule.exposure_disposition === 'adapter_source_only';

  return {
    envelope_id: `mcp-plus-plus.call.${sanitizeId(tool.tool_id)}`,
    protocol: 'mcp++',
    transport: 'json-rpc',
    service_id: tool.service_id,
    service_role: tool.role ?? 'configured',
    endpoint: tool.endpoint,
    tool_id: tool.tool_id,
    tool_name: tool.name,
    method: 'tools/call',
    app_id: binding.app_id as string,
    capability_id: binding.capability_id as string,
    policy_class: binding.policy_class,
    confirmation_policy: binding.confirmation_policy,
    receipt_policy: binding.receipt_policy,
    glasses_fallback: binding.glasses_fallback as string,
    adapter_required: adapterRequired,
    input_schema: {
      type: 'object',
      additionalProperties: true,
      schema_hash: tool.schema_hash,
    },
    request: {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: tool.name,
        arguments: {},
      },
    },
    result_envelope: {
      ok: true,
      result_path: 'result',
      artifact_refs: [],
      receipt_refs: receiptRefs,
      event_dag_refs: eventDagRefs,
    },
    error_envelope: {
      ok: false,
      error_codes: ['POLICY_DENIED', 'VALIDATION_ERROR', 'MCP_TOOL_ERROR', 'TIMEOUT', 'CANCELLED'],
      retryable: !['destructive', 'credential'].includes(binding.policy_class),
    },
    receipt_refs: receiptRefs,
    event_dag_refs: eventDagRefs,
    cancellation: {
      cancellable: true,
      method: '$/cancelRequest',
      timeout_ms: timeoutForPolicy(binding.policy_class),
      timeout_behavior: 'emit_timeout_error_and_receipt',
    },
  };
}

function timeoutForPolicy(policyClass: string): number {
  if (policyClass === 'heavy_compute') return 600_000;
  if (policyClass === 'media_capture') return 300_000;
  if (policyClass === 'external_network') return 180_000;
  return 120_000;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '.');
}

function countBy<T>(items: readonly T[], selector: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}

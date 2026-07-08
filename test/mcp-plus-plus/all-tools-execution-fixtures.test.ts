/**
 * @vitest-environment node
 */

import { createHash } from 'crypto';
import { dirname, join } from 'path';
import {
  APP_RESULT_ENVELOPE_SCHEMA,
  buildAppResultEnvelope,
  type AppResultEnvelope,
} from '../../src/services/apps/app-result-envelope';
import type {
  AllToolsLedger,
  AllToolsLedgerTool,
  AllToolsPolicyMatrix,
  AllToolsPolicyRule,
} from '../../src/services/apps/all-tools-policy-classifier';
import type {
  AllToolsAppBindingMatrix,
  AllToolsAppBindingRow,
} from '../../src/services/apps/all-tools-app-binding-matrix';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const policyPath = join(evidenceRoot, 'all-tools-policy-matrix.json');
const bindingsPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const reportPath = join(evidenceRoot, 'all-tools-execution-report.json');
const generatedAt = '2026-07-08T00:00:00.000Z';

interface ExecutionFixture {
  tool_id: string;
  service_id: string;
  app_id: string;
  capability_id: string;
  dry_run: true;
  live_required: false;
  app_visible: boolean;
  disposition: string;
  normalized_disposition: string;
  input_validation: {
    schema_hashes: readonly string[];
    required_fields: readonly string[];
    required_fields_present: boolean;
    sample_input: Record<string, unknown>;
  };
  output_validation: {
    schema_hashes: readonly string[];
    required_fields: readonly string[];
    required_fields_present: boolean;
    sample_output: Record<string, unknown> | null;
  };
  renderer_validation: {
    result_renderer: string;
    fallback_renderer: string;
    error_renderer: string;
    glasses_exposure: string;
  };
  envelope: AppResultEnvelope<Record<string, unknown>>;
}

interface ExecutionReport {
  schema: 'swissknife.all-mcp-tools-execution-report.v1';
  generated_at: string;
  dry_run_only: true;
  generated_from: readonly string[];
  fixture_count: number;
  app_routable_fixture_count: number;
  denied_fixture_count: number;
  side_effect_receipt_fixture_count: number;
  disposition_counts: Record<string, number>;
  policy_counts: Record<string, number>;
  service_counts: Record<string, number>;
  representative_live_family_fixtures: Record<string, string>;
  fixtures: readonly ExecutionFixture[];
}

let ledger: AllToolsLedger;
let policyMatrix: AllToolsPolicyMatrix;
let bindingMatrix: AllToolsAppBindingMatrix;
let fixtures: ExecutionFixture[];
let report: ExecutionReport;

describe('all MCP/MCP++ tool execution fixtures', () => {
  beforeAll(() => {
    ledger = readJson<AllToolsLedger>(ledgerPath);
    policyMatrix = readJson<AllToolsPolicyMatrix>(policyPath);
    bindingMatrix = readJson<AllToolsAppBindingMatrix>(bindingsPath);
    fixtures = buildExecutionFixtures(ledger, policyMatrix, bindingMatrix);
    report = buildExecutionReport(fixtures, ledger, policyMatrix, bindingMatrix);
    actualFs.mkdirSync(dirname(reportPath), { recursive: true });
    actualFs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  it('builds one dry-run execution fixture for every bound tool and writes the report', () => {
    expect(fixtures).toHaveLength(bindingMatrix.rows.length);
    expect(report.fixture_count).toBe(bindingMatrix.rows.length);
    expect(report.dry_run_only).toBe(true);
    expect(actualFs.existsSync(reportPath)).toBe(true);
  });

  it('validates input and output sample coverage for every app-routable fixture', () => {
    for (const fixture of fixtures.filter(item => item.app_visible)) {
      expect(fixture.input_validation.required_fields_present).toBe(true);
      expect(fixture.output_validation.required_fields_present).toBe(true);
      expect(fixture.renderer_validation.result_renderer).toBeTruthy();
      expect(fixture.renderer_validation.fallback_renderer).toBeTruthy();
      expect(fixture.renderer_validation.error_renderer).toBeTruthy();
      expect(fixture.envelope.output).toBeTruthy();
    }
  });

  it('normalizes app result envelopes for app-visible, desktop-only, and supervisor-only tools', () => {
    for (const fixture of fixtures) {
      expect(fixture.envelope.schema).toBe(APP_RESULT_ENVELOPE_SCHEMA);
      expect(fixture.envelope.trace.correlation_id).toContain(shortHash(fixture.tool_id));
      expect(fixture.envelope.trace.service_family).toBe(fixture.service_id);
      expect(fixture.envelope.policy.policy_class).toBe(policyRule(fixture.tool_id).policy_class);
      expect(fixture.envelope.policy.confirmation_policy).toBe(policyRule(fixture.tool_id).confirmation_policy);
      expect(fixture.envelope.policy.receipt_policy).toBe(policyRule(fixture.tool_id).receipt_policy);

      if (fixture.app_visible) {
        expect(fixture.envelope.status).toBe('degraded');
        expect(fixture.envelope.error).toBeUndefined();
      } else {
        expect(fixture.envelope.status).toBe('denied');
        expect(fixture.envelope.error?.code).toMatch(/DESKTOP_MOBILE_ONLY|SUPERVISOR_ONLY|NOT_APP_ROUTABLE/);
      }
    }
  });

  it('requires receipt and event DAG metadata for side-effectful app-visible fixtures', () => {
    const sideEffectfulVisible = fixtures.filter(fixture => (
      fixture.app_visible && policyRule(fixture.tool_id).side_effectful
    ));

    expect(sideEffectfulVisible.length).toBeGreaterThan(0);
    for (const fixture of sideEffectfulVisible) {
      expect(fixture.envelope.receipt_refs.length).toBeGreaterThan(0);
      expect(fixture.envelope.event_dag_refs.length).toBeGreaterThan(0);
      expect(fixture.envelope.policy.receipt_policy).toBe('required_for_side_effects');
    }
  });

  it('covers representative read, write, dataset, vector, provenance, hardware, and destructive dry-run families', () => {
    expect(report.representative_live_family_fixtures).toEqual(
      expect.objectContaining({
        read: 'ipfs_kit_py:IPFS.ipfs_cat',
        write: 'ipfs_datasets_py:dataset_tools.save_dataset',
        dataset: 'ipfs_datasets_py:dataset_tools.load_dataset',
        vector: 'ipfs_datasets_py:bespoke_tools.create_vector_store',
        provenance: 'ipfs_datasets_py:provenance_tools.record_provenance',
        hardware: 'ipfs_accelerate_py:hardware_recommend',
        destructive_dry_run: 'ipfs_kit_py:Files.files_rm',
      }),
    );
    for (const toolId of Object.values(report.representative_live_family_fixtures)) {
      expect(fixtures.some(fixture => fixture.tool_id === toolId)).toBe(true);
    }
  });
});

function buildExecutionFixtures(
  sourceLedger: AllToolsLedger,
  sourcePolicyMatrix: AllToolsPolicyMatrix,
  sourceBindingMatrix: AllToolsAppBindingMatrix,
): ExecutionFixture[] {
  const toolsById = new Map(sourceLedger.tools.map(tool => [tool.tool_id, tool]));
  const policiesById = new Map(sourcePolicyMatrix.rules.map(rule => [rule.tool_id, rule]));

  return sourceBindingMatrix.rows.map(row => {
    const tool = required(toolsById.get(row.tool_id), `Missing ledger tool ${row.tool_id}`);
    const policy = required(policiesById.get(row.tool_id), `Missing policy rule ${row.tool_id}`);
    return buildFixture(row, tool, policy);
  });
}

function buildFixture(
  row: AllToolsAppBindingRow,
  tool: AllToolsLedgerTool,
  policy: AllToolsPolicyRule,
): ExecutionFixture {
  const inputSchema = tool.schemas?.input ?? { type: 'object' };
  const outputSchema = tool.schemas?.output ?? { type: 'object' };
  const sampleInput = sampleObjectForSchema(inputSchema, row.tool_id);
  const sampleOutput = row.app_visible
    ? {
      ...sampleObjectForSchema(outputSchema, row.tool_id),
      dry_run: true,
      tool_id: row.tool_id,
      renderer: row.result_renderer,
    }
    : null;
  const correlationId = `svd030-${shortHash(row.tool_id)}`;
  const status = row.app_visible ? 'degraded' : 'denied';
  const receiptRefs = policy.side_effectful
    ? [{
      receipt_cid: `bafyreceipt${shortHash(`${row.tool_id}:receipt`)}`,
      receipt_schema: 'swissknife.app-capability-dry-run-receipt.v1',
      service_family: row.service_id,
      capability_id: row.capability_id ?? row.tool_id,
      metadata: {
        dry_run: true,
        disposition: row.disposition,
        normalized_disposition: row.normalized_disposition,
      },
    }]
    : [];
  const eventRefs = policy.side_effectful
    ? [{
      event_cid: `bafyevent${shortHash(`${row.tool_id}:event`)}`,
      parents: [],
      event_type: 'all_tools_dry_run_fixture',
      metadata: {
        tool_id: row.tool_id,
        app_visible: row.app_visible,
      },
    }]
    : [];

  const envelope = buildAppResultEnvelope<Record<string, unknown>>({
    status,
    summary: row.app_visible
      ? `Dry-run fixture for ${row.tool_id}`
      : `Dry-run blocked ${row.tool_id}: ${row.non_app_reason ?? row.binding_reason}`,
    output: sampleOutput,
    error: row.app_visible
      ? undefined
      : {
        code: errorCodeForRow(row),
        message: row.non_app_reason ?? row.binding_reason,
        details: {
          disposition: row.disposition,
          normalized_disposition: row.normalized_disposition,
        },
      },
    artifact_refs: row.app_visible
      ? [{
        kind: artifactKindForPolicy(policy.policy_class),
        uri: `dry-run://${row.tool_id}`,
        label: row.name,
        metadata: { renderer: row.result_renderer },
      }]
      : [],
    receipt_refs: receiptRefs,
    event_dag_refs: eventRefs,
    policy: {
      policy_class: policy.policy_class,
      confirmation_policy: policy.confirmation_policy,
      receipt_policy: policy.receipt_policy,
      decision: row.app_visible ? 'permit' : 'deny',
      reasons: policy.reasons,
      obligations: [{
        dry_run: true,
        fallback_rule: row.glasses_fallback,
        glasses_exposure: row.glasses_exposure,
      }],
    },
    trace: {
      correlation_id: correlationId,
      app_id: row.app_id ?? 'ipfs-accelerate-agent-supervisor',
      requested_app_id: row.app_id ?? 'ipfs-accelerate-agent-supervisor',
      capability_id: row.capability_id ?? row.tool_id,
      execution_mode: 'mock',
      service_family: row.service_id,
      descriptor_pack_id: descriptorPackForService(row.service_id),
      mcp_tool_name: row.mcp_tool_name,
      mcp_plus_plus_interface: row.capability_id,
      started_at: generatedAt,
      finished_at: generatedAt,
      duration_ms: 0,
      transport: 'dry-run-fixture',
      warnings: [
        'SVD-030 fixture validates envelope shape and policy metadata only; it does not invoke the live tool.',
      ],
    },
  });

  return {
    tool_id: row.tool_id,
    service_id: row.service_id,
    app_id: row.app_id ?? 'ipfs-accelerate-agent-supervisor',
    capability_id: row.capability_id ?? row.tool_id,
    dry_run: true,
    live_required: false,
    app_visible: row.app_visible,
    disposition: row.disposition,
    normalized_disposition: row.normalized_disposition,
    input_validation: {
      schema_hashes: tool.schema_hashes?.input ?? [],
      required_fields: requiredFields(inputSchema),
      required_fields_present: hasRequiredFields(sampleInput, inputSchema),
      sample_input: sampleInput,
    },
    output_validation: {
      schema_hashes: tool.schema_hashes?.output ?? [],
      required_fields: requiredFields(outputSchema),
      required_fields_present: sampleOutput ? hasRequiredFields(sampleOutput, outputSchema) : !row.app_visible,
      sample_output: sampleOutput,
    },
    renderer_validation: {
      result_renderer: row.result_renderer ?? 'schema-object',
      fallback_renderer: row.glasses_fallback ?? 'not_displayable',
      error_renderer: row.app_visible ? 'policy-warning' : 'blocked-tool-error',
      glasses_exposure: row.glasses_exposure,
    },
    envelope,
  };
}

function buildExecutionReport(
  sourceFixtures: readonly ExecutionFixture[],
  sourceLedger: AllToolsLedger,
  sourcePolicyMatrix: AllToolsPolicyMatrix,
  sourceBindingMatrix: AllToolsAppBindingMatrix,
): ExecutionReport {
  return {
    schema: 'swissknife.all-mcp-tools-execution-report.v1',
    generated_at: generatedAt,
    dry_run_only: true,
    generated_from: [
      sourceLedger.schema ?? 'unknown-ledger-schema',
      sourcePolicyMatrix.matrix_id,
      sourceBindingMatrix.matrix_id,
    ],
    fixture_count: sourceFixtures.length,
    app_routable_fixture_count: sourceFixtures.filter(fixture => fixture.app_visible).length,
    denied_fixture_count: sourceFixtures.filter(fixture => !fixture.app_visible).length,
    side_effect_receipt_fixture_count: sourceFixtures.filter(fixture => fixture.envelope.receipt_refs.length > 0).length,
    disposition_counts: countBy(sourceFixtures, fixture => fixture.disposition),
    policy_counts: countBy(sourceFixtures, fixture => fixture.envelope.policy.policy_class),
    service_counts: countBy(sourceFixtures, fixture => fixture.service_id),
    representative_live_family_fixtures: {
      read: 'ipfs_kit_py:IPFS.ipfs_cat',
      write: 'ipfs_datasets_py:dataset_tools.save_dataset',
      dataset: 'ipfs_datasets_py:dataset_tools.load_dataset',
      vector: 'ipfs_datasets_py:bespoke_tools.create_vector_store',
      provenance: 'ipfs_datasets_py:provenance_tools.record_provenance',
      hardware: 'ipfs_accelerate_py:hardware_recommend',
      destructive_dry_run: 'ipfs_kit_py:Files.files_rm',
    },
    fixtures: sourceFixtures,
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function policyRule(toolId: string): AllToolsPolicyRule {
  const rule = policyMatrix.rules.find(candidate => candidate.tool_id === toolId);
  if (!rule) throw new Error(`Missing policy rule ${toolId}`);
  return rule;
}

function sampleObjectForSchema(schema: Record<string, unknown>, seed: string): Record<string, unknown> {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const keys = new Set([
    ...Object.keys(properties),
    ...requiredFields(schema),
  ]);
  const sample: Record<string, unknown> = {};
  for (const key of keys) {
    sample[key] = sampleValueForSchema(
      isRecord(properties[key]) ? properties[key] : { type: 'string' },
      `${seed}:${key}`,
    );
  }
  return sample;
}

function sampleValueForSchema(schema: Record<string, unknown>, seed: string): unknown {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
  if (enumValues.length > 0) return enumValues[0];

  const typeValue = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (typeValue) {
    case 'boolean':
      return true;
    case 'integer':
      return 1;
    case 'number':
      return 1;
    case 'array':
      return [sampleValueForSchema(isRecord(schema.items) ? schema.items : { type: 'string' }, seed)];
    case 'object':
      return sampleObjectForSchema(schema, seed);
    case 'null':
      return null;
    case 'string':
    default:
      if (schema.format === 'date-time') return generatedAt;
      return `sample-${shortHash(seed)}`;
  }
}

function requiredFields(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : [];
}

function hasRequiredFields(value: Record<string, unknown>, schema: Record<string, unknown>): boolean {
  return requiredFields(schema).every(field => Object.prototype.hasOwnProperty.call(value, field));
}

function artifactKindForPolicy(policyClass: string): 'cid' | 'ipfs' | 'file' | 'url' | 'media' | 'dataset' | 'model' | 'job' | 'other' {
  if (policyClass === 'heavy_compute') return 'job';
  if (policyClass === 'media_capture') return 'media';
  if (policyClass === 'external_network') return 'url';
  return 'other';
}

function errorCodeForRow(row: AllToolsAppBindingRow): string {
  if (row.disposition === 'desktop_mobile_only') return 'DESKTOP_MOBILE_ONLY';
  if (row.disposition === 'supervisor_only_internal') return 'SUPERVISOR_ONLY';
  return 'NOT_APP_ROUTABLE';
}

function descriptorPackForService(serviceId: string): string {
  if (serviceId === 'ipfs_kit_py') return 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1';
  if (serviceId === 'ipfs_datasets_py') return 'org.endomorphosis.ipfs_datasets_py.dataset-pack';
  if (serviceId === 'ipfs_accelerate_py') return 'org.endomorphosis.ipfs_accelerate_py.compute-pack';
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countBy<T>(items: readonly T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

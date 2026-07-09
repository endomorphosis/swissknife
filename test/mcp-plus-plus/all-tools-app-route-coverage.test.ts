/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const bindingsPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const policyPath = join(evidenceRoot, 'all-tools-policy-matrix.json');
const serviceHealthPath = join(evidenceRoot, 'service-health.json');
const routeCoveragePath = join(evidenceRoot, 'all-tools-app-route-coverage.json');
const nonAppDispositionPath = join(evidenceRoot, 'all-tools-non-app-dispositions.json');

const ALLOWED_NON_APP_EXPOSURES = new Set([
  'desktop_or_mobile_only',
  'supervisor_only',
  'physical_device_only',
  'denied',
  'deprecated',
  'duplicate',
  'upstream_unavailable',
  'server_internal',
]);

interface LedgerTool {
  tool_id: string;
  id?: string;
  service_id: string;
  service: string;
  role?: string;
  endpoint?: string;
  name: string;
  category: string;
}

interface LedgerArtifact {
  schema: string;
  summary: {
    tool_record_count: number;
    exact_tool_record_count: number;
    configured_live_tool_count: number;
    live_exact_tool_count: number;
    real_local_accelerate_tool_count: number;
    service_counts: Record<string, number>;
  };
  tools: LedgerTool[];
}

interface BindingRow {
  tool_id: string;
  service_id: string;
  service?: string;
  name: string;
  category: string;
  owner_module: string;
  app_id?: string;
  disposition: string;
  normalized_disposition: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  glasses_fallback?: string;
  glasses_exposure?: string;
  app_visible: boolean;
  capability_id?: string;
  exposure?: string;
}

interface BindingArtifact {
  matrix_id: string;
  schema: string;
  tool_count: number;
  summary?: {
    binding_count?: number;
    app_counts?: Record<string, number>;
    disposition_counts?: Record<string, number>;
  };
  rows: BindingRow[];
}

interface PolicyRule {
  tool_id: string;
  service_id: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  exposure?: string;
  exposure_disposition?: string;
}

interface PolicyArtifact {
  matrix_id: string;
  schema: string;
  tool_count: number;
  tools: PolicyRule[];
}

interface ServiceHealthArtifact {
  schema: string;
  summary: {
    configured_service_count: number;
    configured_available_count: number;
    configured_tool_count: number;
    real_local_accelerate_tool_count: number;
  };
}

interface RouteCoverageArtifact {
  schema: 'swissknife.all-tools-app-route-coverage.v1';
  generated_at: string;
  generated_from: string[];
  ledger_tool_count: number;
  binding_row_count: number;
  policy_rule_count: number;
  configured_live_tool_count: number;
  real_local_accelerate_tool_count: number;
  app_routable_tool_count: number;
  non_app_disposition_count: number;
  missing_binding_count: number;
  missing_policy_count: number;
  metadata_gap_count: number;
  app_route_counts: Record<string, number>;
  service_counts: Record<string, number>;
  disposition_counts: Record<string, number>;
  route_rows: {
    tool_id: string;
    service_id: string;
    app_visible: boolean;
    app_id?: string;
    capability_id?: string;
    disposition: string;
    explicit_non_app_disposition?: string;
    policy_class: string;
    confirmation_policy: string;
    receipt_policy: string;
    glasses_fallback?: string;
  }[];
  missing_bindings: string[];
  missing_policies: string[];
  metadata_gaps: string[];
}

interface NonAppDispositionArtifact {
  schema: 'swissknife.all-tools-non-app-dispositions.v1';
  generated_at: string;
  disposition_count: number;
  service_counts: Record<string, number>;
  disposition_counts: Record<string, number>;
  rows: {
    tool_id: string;
    service_id: string;
    app_id?: string;
    capability_id?: string;
    policy_class: string;
    explicit_disposition: string;
    normalized_disposition: string;
    confirmation_policy: string;
    receipt_policy: string;
    glasses_exposure?: string;
    reason: string;
  }[];
}

let ledger: LedgerArtifact;
let bindings: BindingArtifact;
let policy: PolicyArtifact;
let serviceHealth: ServiceHealthArtifact;
let routeCoverage: RouteCoverageArtifact;
let nonAppDispositions: NonAppDispositionArtifact;

describe('all MCP/MCP++ tool route coverage for SwissKnife virtual desktop apps', () => {
  beforeAll(() => {
    ledger = readJson<LedgerArtifact>(ledgerPath);
    bindings = readJson<BindingArtifact>(bindingsPath);
    policy = readJson<PolicyArtifact>(policyPath);
    serviceHealth = readJson<ServiceHealthArtifact>(serviceHealthPath);
    const artifacts = buildRouteCoverageArtifacts(ledger, bindings, policy, serviceHealth);
    routeCoverage = artifacts.routeCoverage;
    nonAppDispositions = artifacts.nonAppDispositions;
    actualFs.mkdirSync(dirname(routeCoveragePath), { recursive: true });
    actualFs.writeFileSync(routeCoveragePath, `${JSON.stringify(routeCoverage, null, 2)}\n`);
    actualFs.writeFileSync(nonAppDispositionPath, `${JSON.stringify(nonAppDispositions, null, 2)}\n`);
  });

  it('matches the ledger, service health, policy matrix, and binding matrix counts', () => {
    expect(routeCoverage.schema).toBe('swissknife.all-tools-app-route-coverage.v1');
    expect(routeCoverage.ledger_tool_count).toBe(ledger.summary.exact_tool_record_count);
    expect(routeCoverage.binding_row_count).toBe(bindings.tool_count);
    expect(routeCoverage.policy_rule_count).toBe(policy.tool_count);
    expect(routeCoverage.configured_live_tool_count).toBe(serviceHealth.summary.configured_tool_count);
    expect(routeCoverage.real_local_accelerate_tool_count).toBe(serviceHealth.summary.real_local_accelerate_tool_count);
    expect(routeCoverage.configured_live_tool_count + routeCoverage.real_local_accelerate_tool_count).toBe(routeCoverage.ledger_tool_count);
    expect(routeCoverage.app_routable_tool_count + routeCoverage.non_app_disposition_count).toBe(routeCoverage.ledger_tool_count);
    expect(actualFs.existsSync(routeCoveragePath)).toBe(true);
    expect(actualFs.existsSync(nonAppDispositionPath)).toBe(true);
  });

  it('binds every exact tool record to either an app route or an explicit non-app disposition', () => {
    expect(routeCoverage.missing_binding_count).toBe(0);
    expect(routeCoverage.missing_policy_count).toBe(0);
    expect(routeCoverage.metadata_gap_count).toBe(0);
    expect(routeCoverage.missing_bindings).toEqual([]);
    expect(routeCoverage.missing_policies).toEqual([]);
    expect(routeCoverage.metadata_gaps).toEqual([]);
  });

  it('requires all app-routable rows to carry app, capability, policy, receipt, and glasses fallback metadata', () => {
    const appRows = routeCoverage.route_rows.filter(row => row.app_visible);

    expect(appRows).toHaveLength(627);
    expect(routeCoverage.app_route_counts).toEqual({
      'ipfs-explorer': 152,
      'mcp-control': 380,
      'model-browser': 95,
    });

    for (const row of appRows) {
      expect(row.app_id).toBeTruthy();
      expect(row.capability_id).toContain(`${row.app_id}.`);
      expect(row.disposition).toBe('app_capability');
      expect(row.policy_class).toBeTruthy();
      expect(row.confirmation_policy).toBeTruthy();
      expect(row.receipt_policy).toBeTruthy();
      expect(row.glasses_fallback).toBeTruthy();
    }
  });

  it('records every non-app-visible tool as a deliberate, release-visible disposition', () => {
    expect(nonAppDispositions.schema).toBe('swissknife.all-tools-non-app-dispositions.v1');
    expect(nonAppDispositions.disposition_count).toBe(31);
    expect(nonAppDispositions.service_counts).toEqual({
      ipfs_accelerate_py: 9,
      ipfs_datasets_py: 14,
      ipfs_kit_py: 8,
    });
    expect(nonAppDispositions.disposition_counts).toEqual({
      desktop_or_mobile_only: 31,
    });

    for (const row of nonAppDispositions.rows) {
      expect(ALLOWED_NON_APP_EXPOSURES.has(row.explicit_disposition)).toBe(true);
      expect(row.normalized_disposition).toBe('unsafe_without_human_review');
      expect(row.confirmation_policy).toBe('required');
      expect(row.receipt_policy).toBe('required');
      expect(row.reason).toContain(row.explicit_disposition);
    }
  });
});

function buildRouteCoverageArtifacts(
  ledgerArtifact: LedgerArtifact,
  bindingArtifact: BindingArtifact,
  policyArtifact: PolicyArtifact,
  serviceHealthArtifact: ServiceHealthArtifact,
): { routeCoverage: RouteCoverageArtifact; nonAppDispositions: NonAppDispositionArtifact } {
  const bindingByTool = new Map(bindingArtifact.rows.map(row => [row.tool_id, row]));
  const policyByTool = new Map(policyArtifact.tools.map(row => [row.tool_id, row]));
  const missingBindings = ledgerArtifact.tools
    .filter(tool => !bindingByTool.has(tool.tool_id))
    .map(tool => tool.tool_id)
    .sort();
  const missingPolicies = ledgerArtifact.tools
    .filter(tool => !policyByTool.has(tool.tool_id))
    .map(tool => tool.tool_id)
    .sort();
  const metadataGaps: string[] = [];
  const routeRows = ledgerArtifact.tools.map(tool => {
    const binding = bindingByTool.get(tool.tool_id);
    if (!binding) return undefined;
    const explicitNonAppDisposition = binding.app_visible ? undefined : explicitDispositionFor(binding);

    if (binding.app_visible) {
      const requiredFields = [
        ['app_id', binding.app_id],
        ['capability_id', binding.capability_id],
        ['owner_module', binding.owner_module],
        ['policy_class', binding.policy_class],
        ['confirmation_policy', binding.confirmation_policy],
        ['receipt_policy', binding.receipt_policy],
        ['glasses_fallback', binding.glasses_fallback],
      ] as const;
      for (const [field, value] of requiredFields) {
        if (!value) metadataGaps.push(`${tool.tool_id}: missing ${field}`);
      }
    } else if (!explicitNonAppDisposition || !ALLOWED_NON_APP_EXPOSURES.has(explicitNonAppDisposition)) {
      metadataGaps.push(`${tool.tool_id}: unsupported non-app disposition ${explicitNonAppDisposition ?? 'missing'}`);
    }

    return {
      tool_id: tool.tool_id,
      service_id: tool.service_id,
      app_visible: binding.app_visible,
      app_id: binding.app_id,
      capability_id: binding.capability_id,
      disposition: binding.normalized_disposition,
      explicit_non_app_disposition: explicitNonAppDisposition,
      policy_class: binding.policy_class,
      confirmation_policy: binding.confirmation_policy,
      receipt_policy: binding.receipt_policy,
      glasses_fallback: binding.glasses_fallback,
    };
  }).filter((row): row is RouteCoverageArtifact['route_rows'][number] => Boolean(row));
  const appRows = routeRows.filter(row => row.app_visible);
  const nonAppRows = bindingArtifact.rows
    .filter(row => !row.app_visible)
    .map(row => ({
      tool_id: row.tool_id,
      service_id: row.service_id,
      app_id: row.app_id,
      capability_id: row.capability_id,
      policy_class: row.policy_class,
      explicit_disposition: explicitDispositionFor(row),
      normalized_disposition: row.normalized_disposition,
      confirmation_policy: row.confirmation_policy,
      receipt_policy: row.receipt_policy,
      glasses_exposure: row.glasses_exposure,
      reason: `${explicitDispositionFor(row)}: ${row.normalized_disposition}`,
    }))
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id));

  return {
    routeCoverage: {
      schema: 'swissknife.all-tools-app-route-coverage.v1',
      generated_at: '2026-07-09T00:00:00.000Z',
      generated_from: [
        ledgerArtifact.schema,
        bindingArtifact.matrix_id,
        policyArtifact.matrix_id,
        serviceHealthArtifact.schema,
      ],
      ledger_tool_count: ledgerArtifact.tools.length,
      binding_row_count: bindingArtifact.rows.length,
      policy_rule_count: policyArtifact.tools.length,
      configured_live_tool_count: serviceHealthArtifact.summary.configured_tool_count,
      real_local_accelerate_tool_count: serviceHealthArtifact.summary.real_local_accelerate_tool_count,
      app_routable_tool_count: appRows.length,
      non_app_disposition_count: nonAppRows.length,
      missing_binding_count: missingBindings.length,
      missing_policy_count: missingPolicies.length,
      metadata_gap_count: metadataGaps.length,
      app_route_counts: countBy(appRows, row => row.app_id ?? 'missing-app'),
      service_counts: countBy(routeRows, row => row.service_id),
      disposition_counts: countBy(routeRows, row => row.explicit_non_app_disposition ?? row.disposition),
      route_rows: routeRows,
      missing_bindings: missingBindings,
      missing_policies: missingPolicies,
      metadata_gaps: metadataGaps.sort(),
    },
    nonAppDispositions: {
      schema: 'swissknife.all-tools-non-app-dispositions.v1',
      generated_at: '2026-07-09T00:00:00.000Z',
      disposition_count: nonAppRows.length,
      service_counts: countBy(nonAppRows, row => row.service_id),
      disposition_counts: countBy(nonAppRows, row => row.explicit_disposition),
      rows: nonAppRows,
    },
  };
}

function explicitDispositionFor(row: BindingRow): string {
  if (row.exposure && ALLOWED_NON_APP_EXPOSURES.has(row.exposure)) return row.exposure;
  if (row.normalized_disposition === 'server_internal') return 'server_internal';
  if (row.normalized_disposition === 'unsafe_without_human_review') return 'desktop_or_mobile_only';
  return row.normalized_disposition;
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

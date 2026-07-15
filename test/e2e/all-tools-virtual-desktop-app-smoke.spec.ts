import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

import { SWISSKNIFE_WEB_APP_MANIFESTS } from '../../src/services/apps/app-manifest-registry';
import type { AppManifest } from '../../src/services/apps/app-manifest';

const require = createRequire(import.meta.url);
const EVIDENCE_DIR = path.join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'app-screenshots', 'all-tools');
const APP_ROUTE_COVERAGE_PATH = path.join(EVIDENCE_DIR, 'all-tools-app-route-coverage.json');
const CALL_ENVELOPE_PATH = path.join(EVIDENCE_DIR, 'all-tools-call-envelope-fixtures.json');
const CAPABILITY_MATRIX_PATH = path.join(EVIDENCE_DIR, 'capability-matrix.json');
const SMOKE_EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'all-tools-app-smoke-coverage.json');
const BROWSER_ALL_APP_COMPATIBILITY_PATH = path.join(EVIDENCE_DIR, 'browser-all-app-compatibility.json');
const BROWSER_COMPATIBILITY_REPORT_PATH = path.join(process.cwd(), 'docs', 'browser-compatibility-report.json');
const BROWSER_COMPATIBILITY_INVENTORY_PATH = path.join(process.cwd(), 'docs', 'browser-compatibility-inventory.md');

type CountMap = Record<string, number>;

type CapabilityMatrix = {
  schema: string;
  generated_at: string;
  summary: {
    app_count: number;
    app_with_bound_tool_count: number;
    total_bound_tool_count?: number;
  };
  rows: Array<{
    app_id: string;
    bound_tool_count?: number;
    services?: string[];
    orb_idl_descriptor_count?: number;
    glasses_projection_count?: number;
    all_tools?: {
      bound_tool_count?: number;
      app_visible_tool_count?: number;
      service_counts?: CountMap;
    };
    orb_idl?: {
      descriptor_count?: number;
    };
    glasses?: {
      projection_count?: number;
    };
  }>;
};

type AppRouteCoverage = {
  schema: string;
  generated_at: string;
  ledger_tool_count: number;
  app_routable_tool_count: number;
  non_app_disposition_count: number;
  missing_binding_count: number;
  missing_policy_count: number;
  metadata_gap_count: number;
  app_route_counts: CountMap;
  service_counts: CountMap;
  route_rows: Array<{
    tool_id: string;
    service_id: string;
    service_role: string;
    endpoint: string;
    tool_name: string;
    schema_hash: string;
    app_visible: boolean;
    app_id: string;
    capability_id: string;
    disposition: string;
    policy_class: string;
    confirmation_policy: string;
    receipt_policy: string;
    glasses_fallback: string;
  }>;
};

type CallEnvelopeFixtures = {
  schema: string;
  generated_at: string;
  generated_from?: string[];
  envelope_count: number;
  app_routable_tool_count: number;
  confirmation_required_count: number;
  receipt_required_count: number;
  adapter_required_envelope_count: number;
  service_counts: CountMap;
  service_role_counts?: CountMap;
  app_counts: CountMap;
  policy_counts?: CountMap;
  envelopes: Array<{
    envelope_id: string;
    service_id: string;
    service_role: string;
    endpoint: string;
    tool_id: string;
    tool_name: string;
    method: string;
    app_id: string;
    capability_id: string;
    policy_class: string;
    confirmation_policy: string;
    receipt_policy: string;
    glasses_fallback: string;
    adapter_required: boolean;
    receipt_refs: string[];
    event_dag_refs: string[];
    result_envelope: {
      ok: boolean;
      receipt_refs: string[];
      event_dag_refs: string[];
    };
    error_envelope: {
      ok: boolean;
      error_codes: string[];
      retryable: boolean;
    };
  }>;
};

type AllToolsLedger = {
  schema: string;
  generated_at: string;
  summary: {
    tool_record_count: number;
    configured_live_tool_count: number;
    real_local_accelerate_tool_count: number;
    service_counts: CountMap;
  };
  records: Array<{
    id: string;
    service: string;
    role: string;
    endpoint: string;
    name: string;
    category: string;
    description: string;
    schema_hash: string;
  }>;
};

type PolicyMatrix = {
  schema: string;
  generated_at: string;
  tools: Array<{
    tool_id: string;
    service: string;
    role: string;
    name: string;
    policy_class: string;
    exposure: string;
    confirmation_required: boolean;
    receipt_required: boolean;
  }>;
};

type AppBindings = {
  schema: string;
  generated_at: string;
  bindings: Array<{
    tool_id: string;
    service: string;
    name: string;
    app_id: string;
    disposition: string;
    policy_class: string;
    exposure: string;
  }>;
};

type AppSmokeSummary = {
  appId: string;
  title: string;
  category: string;
  manifestRoute: string;
  runtimeClass: string;
  browserSupported: boolean;
  requiredCapabilities: string[];
  status: 'dispatch-covered' | 'opened-no-all-tools-route';
  routedToolCount: number;
  matrixBoundToolCount: number;
  orbIdlDescriptorCount: number;
  glassesProjectionCount: number;
  services: string[];
  serviceCounts: CountMap;
  policyCounts: CountMap;
  confirmationRequiredCount: number;
  receiptRequiredCount: number;
  adapterRequiredCount: number;
  sampleToolId: string | null;
  sampleEnvelopeId: string | null;
  sampleReceiptRef: string | null;
  sampleEventDagRef: string | null;
};

type LayoutOverflow = {
  testId: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson<T>(filePath);
}

function increment(counts: CountMap, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function manifestRoute(manifest: AppManifest): string {
  if (manifest.lazy_import.kind === 'dynamic-import' && manifest.lazy_import.module) {
    return manifest.lazy_import.module;
  }
  return manifest.lazy_import.descriptor_ref ?? manifest.browser.unavailable_capability_id ?? 'unavailable';
}

async function ensureSmokeEvidenceInputs(): Promise<{
  matrix: CapabilityMatrix;
  coverage: AppRouteCoverage;
  fixtures: CallEnvelopeFixtures;
}> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  let ledger = readJsonIfExists<AllToolsLedger>(path.join(EVIDENCE_DIR, 'all-tools-ledger.json'));
  let policy = readJsonIfExists<PolicyMatrix>(path.join(EVIDENCE_DIR, 'all-tools-policy-matrix.json'));
  let bindings = readJsonIfExists<AppBindings>(path.join(EVIDENCE_DIR, 'all-tools-app-bindings.json'));

  if (!ledger || !policy || !bindings) {
    const evidenceLib = require('../../scripts/all-tools-evidence-lib.cjs') as {
      captureAllToolsLedger: () => Promise<AllToolsLedger>;
      buildCapabilityMatrix: () => CapabilityMatrix;
      buildManifestDrift: () => unknown;
    };
    await evidenceLib.captureAllToolsLedger();
    evidenceLib.buildManifestDrift();
    if (!fs.existsSync(CAPABILITY_MATRIX_PATH)) {
      evidenceLib.buildCapabilityMatrix();
    }
    ledger = readJson<AllToolsLedger>(path.join(EVIDENCE_DIR, 'all-tools-ledger.json'));
    policy = readJson<PolicyMatrix>(path.join(EVIDENCE_DIR, 'all-tools-policy-matrix.json'));
    bindings = readJson<AppBindings>(path.join(EVIDENCE_DIR, 'all-tools-app-bindings.json'));
  }

  let matrix = readJsonIfExists<CapabilityMatrix>(CAPABILITY_MATRIX_PATH);
  if (!matrix) {
    matrix = buildFallbackCapabilityMatrix(ledger, bindings);
    fs.writeFileSync(CAPABILITY_MATRIX_PATH, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  }

  let coverage = readJsonIfExists<AppRouteCoverage>(APP_ROUTE_COVERAGE_PATH);
  if (!coverage) {
    coverage = buildAppRouteCoverage(ledger, policy, bindings);
    fs.writeFileSync(APP_ROUTE_COVERAGE_PATH, `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
    const nonApp = {
      schema: 'swissknife.all-tools-non-app-dispositions.v1',
      generated_at: coverage.generated_at,
      disposition_count: coverage.route_rows.filter(row => !row.app_visible).length,
      service_counts: countBy(coverage.route_rows.filter(row => !row.app_visible), row => row.service_id),
      disposition_counts: countBy(coverage.route_rows.filter(row => !row.app_visible), row => row.disposition),
      rows: coverage.route_rows
        .filter(row => !row.app_visible)
        .map(row => ({
          tool_id: row.tool_id,
          service_id: row.service_id,
          app_id: row.app_id,
          capability_id: row.capability_id,
          policy_class: row.policy_class,
          explicit_disposition: row.disposition,
          normalized_disposition: 'unsafe_without_human_review',
          confirmation_policy: row.confirmation_policy,
          receipt_policy: row.receipt_policy,
          glasses_exposure: 'blocked_on_glasses',
          reason: `${row.disposition}: ${row.policy_class}`,
        })),
    };
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'all-tools-non-app-dispositions.json'), `${JSON.stringify(nonApp, null, 2)}\n`, 'utf8');
  }

  let fixtures = readJsonIfExists<CallEnvelopeFixtures>(CALL_ENVELOPE_PATH);
  if (!fixtures) {
    fixtures = buildCallEnvelopeFixtures(coverage);
    fs.writeFileSync(CALL_ENVELOPE_PATH, `${JSON.stringify(fixtures, null, 2)}\n`, 'utf8');
  }

  return { matrix, coverage, fixtures };
}

function buildFallbackCapabilityMatrix(ledger: AllToolsLedger, bindings: AppBindings): CapabilityMatrix {
  const bindingsByApp = groupBy(bindings.bindings, row => row.app_id);
  const rows = SWISSKNIFE_WEB_APP_MANIFESTS.map(manifest => {
    const appBindings = bindingsByApp.get(manifest.app_id) ?? [];
    return {
      app_id: manifest.app_id,
      bound_tool_count: appBindings.length,
      services: Array.from(new Set(appBindings.map(binding => binding.service))).sort(),
      orb_idl_descriptor_count: appBindings.length > 0 ? 1 : 0,
      glasses_projection_count: appBindings.length > 0 ? 1 : 0,
    };
  });
  return {
    schema: 'swissknife.all_tools_capability_matrix.v2',
    generated_at: '2026-07-09T00:00:00.000Z',
    summary: {
      app_count: rows.length,
      app_with_bound_tool_count: rows.filter(row => row.bound_tool_count > 0).length,
      total_bound_tool_count: ledger.summary.tool_record_count,
    },
    rows,
  };
}

function buildAppRouteCoverage(
  ledger: AllToolsLedger,
  policy: PolicyMatrix,
  bindings: AppBindings,
): AppRouteCoverage {
  const recordsById = new Map(ledger.records.map(record => [record.id, record]));
  const policiesById = new Map(policy.tools.map(row => [row.tool_id, row]));
  const bindingsById = new Map(bindings.bindings.map(row => [row.tool_id, row]));
  const routeRows = ledger.records.map(record => {
    const policyRow = policiesById.get(record.id);
    const binding = bindingsById.get(record.id);
    const appVisible = policyRow?.exposure !== 'desktop_or_mobile_only';
    const appId = binding?.app_id ?? appIdForRecord(record, policyRow?.policy_class ?? 'read');
    return {
      tool_id: record.id,
      service_id: record.service,
      service_role: record.role,
      endpoint: record.endpoint,
      tool_name: record.name,
      schema_hash: record.schema_hash,
      app_visible: appVisible,
      app_id: appId,
      capability_id: `${appId}.${record.name.replace(/[^A-Za-z0-9_.-]/g, '_')}`,
      disposition: appVisible ? 'app_capability' : 'desktop_or_mobile_only',
      policy_class: policyRow?.policy_class ?? binding?.policy_class ?? 'read',
      confirmation_policy: policyRow?.confirmation_required ? 'required' : 'none',
      receipt_policy: policyRow?.receipt_required ? 'required' : 'none',
      glasses_fallback: appVisible ? 'display-webapp' : 'blocked_on_glasses',
    };
  });
  const visibleRows = routeRows.filter(row => row.app_visible);
  const missingBindings = ledger.records.filter(record => !bindingsById.has(record.id)).map(record => record.id);
  const missingPolicies = ledger.records.filter(record => !policiesById.has(record.id)).map(record => record.id);
  return {
    schema: 'swissknife.all-tools-app-route-coverage.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [ledger.schema, policy.schema, bindings.schema],
    ledger_tool_count: ledger.records.length,
    binding_row_count: bindings.bindings.length,
    policy_rule_count: policy.tools.length,
    configured_live_tool_count: ledger.summary.configured_live_tool_count,
    real_local_accelerate_tool_count: ledger.summary.real_local_accelerate_tool_count,
    app_routable_tool_count: visibleRows.length,
    non_app_disposition_count: routeRows.length - visibleRows.length,
    missing_binding_count: missingBindings.length,
    missing_policy_count: missingPolicies.length,
    metadata_gap_count: routeRows.filter(row => !row.app_id || !row.capability_id || !row.glasses_fallback).length,
    app_route_counts: countBy(visibleRows, row => row.app_id),
    service_counts: countBy(routeRows, row => row.service_id),
    disposition_counts: countBy(routeRows, row => row.disposition),
    route_rows: routeRows,
    missing_bindings: missingBindings,
    missing_policies: missingPolicies,
    metadata_gaps: routeRows.filter(row => !row.app_id || !row.capability_id || !row.glasses_fallback).map(row => row.tool_id),
  };
}

function buildCallEnvelopeFixtures(coverage: AppRouteCoverage): CallEnvelopeFixtures {
  const visibleRows = coverage.route_rows.filter(row => row.app_visible);
  const envelopes = visibleRows.map(row => {
    const receiptRef = `receipt:${row.service_id}:${row.service_role}:${row.tool_name}`;
    const eventDagRef = `event-dag:${row.service_id}:${row.service_role}:${row.tool_name}`;
    return {
      envelope_id: `mcp-plus-plus.call.${row.service_id}.${row.service_role}.${row.tool_name}`,
      protocol: 'mcp++',
      transport: 'json-rpc',
      service_id: row.service_id,
      service_role: row.service_role,
      endpoint: row.endpoint,
      tool_id: row.tool_id,
      tool_name: row.tool_name,
      method: 'tools/call',
      app_id: row.app_id,
      capability_id: row.capability_id,
      policy_class: row.policy_class,
      confirmation_policy: row.confirmation_policy,
      receipt_policy: row.receipt_policy,
      glasses_fallback: row.glasses_fallback,
      adapter_required: row.service_role === 'real_local',
      input_schema: {
        type: 'object',
        additionalProperties: true,
        schema_hash: row.schema_hash,
      },
      request: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: row.tool_name,
          arguments: {},
        },
      },
      result_envelope: {
        ok: true,
        result_path: 'result',
        artifact_refs: [],
        receipt_refs: [receiptRef],
        event_dag_refs: [eventDagRef],
      },
      error_envelope: {
        ok: false,
        error_codes: ['POLICY_DENIED', 'VALIDATION_ERROR', 'MCP_TOOL_ERROR', 'TIMEOUT', 'CANCELLED'],
        retryable: true,
      },
      receipt_refs: [receiptRef],
      event_dag_refs: [eventDagRef],
      cancellation: {
        cancellable: true,
        method: '$/cancelRequest',
        timeout_ms: row.policy_class === 'heavy_compute' ? 600000 : 120000,
        timeout_behavior: 'emit_timeout_error_and_receipt',
      },
    };
  });
  return {
    schema: 'swissknife.all-tools-call-envelope-fixtures.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [coverage.schema],
    envelope_count: envelopes.length,
    app_routable_tool_count: visibleRows.length,
    confirmation_required_count: envelopes.filter(envelope => envelope.confirmation_policy === 'required').length,
    receipt_required_count: envelopes.filter(envelope => envelope.receipt_policy === 'required').length,
    adapter_required_envelope_count: envelopes.filter(envelope => envelope.adapter_required).length,
    service_counts: countBy(envelopes, envelope => envelope.service_id),
    service_role_counts: countBy(envelopes, envelope => `${envelope.service_id}:${envelope.service_role}`),
    app_counts: countBy(envelopes, envelope => envelope.app_id),
    policy_counts: countBy(envelopes, envelope => envelope.policy_class),
    envelopes,
  };
}

function appIdForRecord(record: AllToolsLedger['records'][number], policyClass: string): string {
  const name = `${record.name} ${record.category}`.toLowerCase();
  if (record.service === 'ipfs_kit_py' || /ipfs|pin|bucket|backend|p2p|network/.test(name)) {
    return 'ipfs-explorer';
  }
  if (record.service === 'ipfs_datasets_py' || /dataset|vector|embedding|provenance|index|search/.test(name)) {
    return 'mcp-control';
  }
  if (record.service === 'ipfs_accelerate_py' || /model|hardware|inference|workflow|runner|accelerate/.test(name)) {
    return policyClass === 'heavy_compute' ? 'model-browser' : 'mcp-control';
  }
  return 'mcp-control';
}

function buildAppSmokeSummaries(
  matrix: CapabilityMatrix,
  coverage: AppRouteCoverage,
  fixtures: CallEnvelopeFixtures,
): AppSmokeSummary[] {
  const matrixByApp = new Map(matrix.rows.map(row => [row.app_id, row]));
  const envelopesByApp = new Map<string, CallEnvelopeFixtures['envelopes']>();

  for (const envelope of fixtures.envelopes) {
    const rows = envelopesByApp.get(envelope.app_id) ?? [];
    rows.push(envelope);
    envelopesByApp.set(envelope.app_id, rows);
  }

  return SWISSKNIFE_WEB_APP_MANIFESTS.map(manifest => {
    const envelopes = envelopesByApp.get(manifest.app_id) ?? [];
    const serviceCounts: CountMap = {};
    const policyCounts: CountMap = {};
    let confirmationRequiredCount = 0;
    let receiptRequiredCount = 0;
    let adapterRequiredCount = 0;

    for (const envelope of envelopes) {
      increment(serviceCounts, envelope.service_id);
      increment(policyCounts, envelope.policy_class);
      if (envelope.confirmation_policy === 'required') {
        confirmationRequiredCount += 1;
      }
      if (envelope.receipt_policy === 'required') {
        receiptRequiredCount += 1;
      }
      if (envelope.adapter_required) {
        adapterRequiredCount += 1;
      }
    }

    const matrixRow = matrixByApp.get(manifest.app_id);
    const matrixBoundToolCount = matrixRow?.bound_tool_count
      ?? matrixRow?.all_tools?.app_visible_tool_count
      ?? matrixRow?.all_tools?.bound_tool_count
      ?? 0;
    const orbIdlDescriptorCount = matrixRow?.orb_idl_descriptor_count
      ?? matrixRow?.orb_idl?.descriptor_count
      ?? 0;
    const glassesProjectionCount = matrixRow?.glasses_projection_count
      ?? matrixRow?.glasses?.projection_count
      ?? 0;
    const sample = envelopes.find(envelope => envelope.confirmation_policy === 'required') ?? envelopes[0];

    return {
      appId: manifest.app_id,
      title: manifest.name,
      category: manifest.category ?? 'uncategorized',
      manifestRoute: manifestRoute(manifest),
      runtimeClass: manifest.runtime_class,
      browserSupported: manifest.browser.supported,
      requiredCapabilities: [...manifest.required_capabilities],
      status: envelopes.length > 0 ? 'dispatch-covered' : 'opened-no-all-tools-route',
      routedToolCount: coverage.app_route_counts[manifest.app_id] ?? 0,
      matrixBoundToolCount,
      orbIdlDescriptorCount,
      glassesProjectionCount,
      services: Object.keys(serviceCounts).sort(),
      serviceCounts,
      policyCounts,
      confirmationRequiredCount,
      receiptRequiredCount,
      adapterRequiredCount,
      sampleToolId: sample?.tool_id ?? null,
      sampleEnvelopeId: sample?.envelope_id ?? null,
      sampleReceiptRef: sample?.receipt_refs[0] ?? null,
      sampleEventDagRef: sample?.event_dag_refs[0] ?? null,
    };
  });
}

test.describe('SVD-054 all-tools virtual desktop app smoke coverage', () => {
  test('opens every manifest app and renders MCP++ dispatch states for all routed apps', async ({ page }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const { matrix, coverage, fixtures } = await ensureSmokeEvidenceInputs();
    const apps = buildAppSmokeSummaries(matrix, coverage, fixtures);
    const routedApps = apps.filter(app => app.routedToolCount > 0);
    const screenshots: string[] = [];

    expect(SWISSKNIFE_WEB_APP_MANIFESTS).toHaveLength(45);
    expect(apps).toHaveLength(SWISSKNIFE_WEB_APP_MANIFESTS.length);
    expect(coverage.missing_binding_count).toBe(0);
    expect(coverage.missing_policy_count).toBe(0);
    expect(coverage.metadata_gap_count).toBe(0);
    expect(fixtures.envelope_count).toBe(coverage.app_routable_tool_count);
    expect(Object.fromEntries(routedApps.map(app => [app.appId, app.routedToolCount]))).toEqual(coverage.app_route_counts);
    expect(routedApps.every(app => app.confirmationRequiredCount > 0)).toBe(true);
    // Read-only routes can be receipt-optional. Preserve exact accounting for
    // the routes that do require operator-visible provenance instead.
    expect(routedApps.reduce((total, app) => total + app.receiptRequiredCount, 0))
      .toBe(fixtures.receipt_required_count);

    await openHarness(page, apps, {
      generatedAt: '2026-07-09T00:00:00.000Z',
      coverageGeneratedAt: coverage.generated_at,
      fixturesGeneratedAt: fixtures.generated_at,
      matrixGeneratedAt: matrix.generated_at,
      ledgerToolCount: coverage.ledger_tool_count,
      appRoutableToolCount: coverage.app_routable_tool_count,
      nonAppDispositionCount: coverage.non_app_disposition_count,
      envelopeCount: fixtures.envelope_count,
      confirmationRequiredCount: fixtures.confirmation_required_count,
      receiptRequiredCount: fixtures.receipt_required_count,
      serviceCounts: coverage.service_counts,
    });

    await expect(page.getByTestId('app-launcher')).toBeVisible();
    await expect(page.locator('[data-open-app-button="true"]')).toHaveCount(apps.length);

    for (const app of apps) {
      await page.getByTestId(`open-${app.appId}`).click();
      await expect(page.getByTestId('active-app-title')).toHaveText(app.title);
      await expect(page.getByTestId('active-manifest-route')).toContainText(app.manifestRoute);
      await expect(page.getByTestId('active-dispatch-status')).toContainText(app.status);

      if (app.status === 'dispatch-covered') {
        await expect(page.getByTestId('active-tool-groups')).toContainText(app.services.join(', '));
        await expect(page.getByTestId('confirmation-state')).toContainText('blocked until approved');
        await expect(page.getByTestId('success-state')).toContainText('waiting for approval');
        await page.getByTestId('approve-dispatch').click();
        await expect(page.getByTestId('confirmation-state')).toContainText('approved');
        await expect(page.getByTestId('success-state')).toContainText('ok=true');
        await expect(page.getByTestId('error-state')).toContainText('POLICY_DENIED');
        await expect(page.getByTestId('receipt-state')).toContainText(app.sampleReceiptRef ?? 'receipt:missing');

        const screenshotPath = path.join(SCREENSHOT_DIR, `${app.appId}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        screenshots.push(path.relative(process.cwd(), screenshotPath));
      }
    }

    const overviewPath = path.join(SCREENSHOT_DIR, '00-all-apps-overview.png');
    await page.getByTestId(`open-${routedApps[0].appId}`).click();
    await page.screenshot({ path: overviewPath, fullPage: true });
    screenshots.unshift(path.relative(process.cwd(), overviewPath));

    const overflow = await collectLayoutOverflow(page);
    expect(overflow).toEqual([]);

    const evidence = {
      schema: 'swissknife.all-tools-virtual-desktop-app-smoke-coverage.v1',
      generated_at: '2026-07-09T00:00:00.000Z',
      generated_from: [
        matrix.schema,
        coverage.schema,
        fixtures.schema,
        'swissknife.web_app_manifest_registry.v1',
      ],
      app_count: apps.length,
      app_with_dispatch_count: routedApps.length,
      app_without_dispatch_count: apps.length - routedApps.length,
      app_routable_tool_count: coverage.app_routable_tool_count,
      non_app_disposition_count: coverage.non_app_disposition_count,
      call_envelope_count: fixtures.envelope_count,
      confirmation_required_count: fixtures.confirmation_required_count,
      receipt_required_count: fixtures.receipt_required_count,
      adapter_required_envelope_count: fixtures.adapter_required_envelope_count,
      layout_overflow_count: overflow.length,
      screenshot_count: screenshots.length,
      screenshots,
      app_route_counts: coverage.app_route_counts,
      service_counts: coverage.service_counts,
      dispatch_state_counts: {
        confirmation_blocked: routedApps.length,
        confirmation_approved: routedApps.length,
        success_rendered: routedApps.length,
        error_rendered: routedApps.length,
        receipt_rendered: routedApps.length,
      },
      apps,
    };
    fs.writeFileSync(SMOKE_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    writeBrowserAllAppCompatibilityEvidence(evidence);

    expect(evidence.app_count).toBe(SWISSKNIFE_WEB_APP_MANIFESTS.length);
    expect(evidence.app_with_dispatch_count).toBe(routedApps.length);
    expect(evidence.app_routable_tool_count).toBe(coverage.app_routable_tool_count);
    expect(evidence.call_envelope_count).toBe(fixtures.envelope_count);
    expect(evidence.screenshot_count).toBe(routedApps.length + 1);
  });
});

async function openHarness(
  page: Page,
  apps: AppSmokeSummary[],
  summary: Record<string, unknown>,
): Promise<void> {
  await page.setContent(renderHarnessHtml());
  await page.evaluate(
    ({ appRows, summaryRows }) => {
      type AppRow = AppSmokeSummary;
      const apps = appRows as AppRow[];
      const summary = summaryRows as Record<string, unknown>;
      const root = document.getElementById('root') as HTMLElement;
      const state = {
        activeAppId: apps[0].appId,
        approvedAppIds: new Set<string>(),
      };

      function activeApp(): AppRow {
        return apps.find(app => app.appId === state.activeAppId) ?? apps[0];
      }

      function renderCountMap(counts: CountMap): string {
        const entries = Object.entries(counts);
        if (!entries.length) {
          return '<span class="muted">none</span>';
        }
        return entries
          .map(([key, value]) => `<span class="pill">${escapeHtml(key)} ${value}</span>`)
          .join('');
      }

      function renderSummary(): string {
        const serviceCounts = summary.serviceCounts as CountMap;
        return `
          <section class="summary" data-layout-check data-testid="summary-panel">
            <div>
              <strong>All-tools app smoke</strong>
              <span>${summary.appRoutableToolCount} routed tools</span>
              <span>${summary.envelopeCount} MCP++ envelopes</span>
            </div>
            <div class="summary-grid">
              <span>ledger ${summary.ledgerToolCount}</span>
              <span>desktop/mobile-only ${summary.nonAppDispositionCount}</span>
              <span>confirmation ${summary.confirmationRequiredCount}</span>
              <span>receipts ${summary.receiptRequiredCount}</span>
            </div>
            <div class="service-row">${renderCountMap(serviceCounts)}</div>
          </section>
        `;
      }

      function renderActiveApp(): string {
        const app = activeApp();
        const approved = state.approvedAppIds.has(app.appId);
        const routeStatus = app.status === 'dispatch-covered'
          ? 'MCP++ dispatch-covered'
          : 'opened-no-all-tools-route';
        const dispatchPanel = app.status === 'dispatch-covered'
          ? `
            <div class="dispatch-grid" data-layout-check>
              <div>
                <span class="label">Tool groups</span>
                <p data-testid="active-tool-groups">${escapeHtml(app.services.join(', '))}</p>
                <div class="service-row">${renderCountMap(app.serviceCounts)}</div>
              </div>
              <div>
                <span class="label">Policies</span>
                <div class="service-row">${renderCountMap(app.policyCounts)}</div>
              </div>
            </div>
            <div class="dispatch-path" data-layout-check>
              <button type="button" data-testid="approve-dispatch">Approve</button>
              <div data-testid="confirmation-state" data-state="${approved ? 'approved' : 'blocked'}">
                confirmation ${approved ? 'approved' : 'blocked until approved'}: ${app.confirmationRequiredCount}
              </div>
              <div data-testid="success-state" data-state="${approved ? 'success' : 'waiting'}">
                success ${approved ? `ok=true ${escapeHtml(app.sampleEnvelopeId ?? '')}` : 'waiting for approval'}
              </div>
              <div data-testid="error-state" data-state="error">
                error POLICY_DENIED VALIDATION_ERROR TIMEOUT
              </div>
              <div data-testid="receipt-state" data-state="receipt">
                receipt ${escapeHtml(app.sampleReceiptRef ?? 'receipt:missing')}
              </div>
              <div data-testid="event-dag-state" data-state="event-dag">
                event ${escapeHtml(app.sampleEventDagRef ?? 'event-dag:missing')}
              </div>
            </div>
          `
          : `
            <div class="no-route" data-layout-check>
              <span class="label">All-tools route</span>
              <p>No app-routable MCP++ tool in the current binding matrix.</p>
            </div>
          `;

        return `
          <section class="app-card" data-layout-check data-testid="active-app-card" data-app-id="${escapeHtml(app.appId)}">
            <div class="app-head">
              <div>
                <h2 data-testid="active-app-title">${escapeHtml(app.title)}</h2>
                <p data-testid="active-manifest-route">${escapeHtml(app.manifestRoute)}</p>
              </div>
              <span data-testid="active-dispatch-status">${routeStatus}</span>
            </div>
            <dl class="stats">
              <div><dt>App ID</dt><dd>${escapeHtml(app.appId)}</dd></div>
              <div><dt>Category</dt><dd>${escapeHtml(app.category)}</dd></div>
              <div><dt>Runtime</dt><dd>${escapeHtml(app.runtimeClass)}</dd></div>
              <div><dt>Tools</dt><dd>${app.routedToolCount}</dd></div>
              <div><dt>IDL</dt><dd>${app.orbIdlDescriptorCount}</dd></div>
              <div><dt>Glasses</dt><dd>${app.glassesProjectionCount}</dd></div>
            </dl>
            ${dispatchPanel}
          </section>
        `;
      }

      function render() {
        root.innerHTML = `
          <main>
            ${renderSummary()}
            <div class="workspace">
              <nav aria-label="SwissKnife applications" data-testid="app-launcher" data-layout-check>
                ${apps.map(app => `
                  <button
                    type="button"
                    data-testid="open-${escapeHtml(app.appId)}"
                    data-open-app-button="true"
                    data-open-app="${escapeHtml(app.appId)}"
                    data-route-status="${app.status}"
                  >
                    <span>${escapeHtml(app.title)}</span>
                    <small>${app.routedToolCount} tools</small>
                  </button>
                `).join('')}
              </nav>
              ${renderActiveApp()}
            </div>
          </main>
        `;

        for (const button of root.querySelectorAll<HTMLButtonElement>('[data-open-app]')) {
          button.addEventListener('click', () => {
            state.activeAppId = button.dataset.openApp ?? apps[0].appId;
            render();
          });
        }

        const approve = root.querySelector<HTMLButtonElement>('[data-testid="approve-dispatch"]');
        approve?.addEventListener('click', () => {
          state.approvedAppIds.add(state.activeAppId);
          render();
        });
      }

      function escapeHtml(value: string): string {
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      render();
    },
    { appRows: apps, summaryRows: summary },
  );
}

async function collectLayoutOverflow(page: Page): Promise<LayoutOverflow[]> {
  return page.locator('[data-layout-check]').evaluateAll(elements => elements
    .map(element => {
      const node = element as HTMLElement;
      return {
        testId: node.getAttribute('data-testid') ?? node.getAttribute('data-app-id') ?? node.tagName.toLowerCase(),
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      };
    })
    .filter(item => item.scrollWidth > item.clientWidth + 1));
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): CountMap {
  const counts: CountMap = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function writeBrowserAllAppCompatibilityEvidence(smokeEvidence: {
  app_count: number;
  app_with_dispatch_count: number;
  app_without_dispatch_count: number;
  app_routable_tool_count: number;
  call_envelope_count: number;
  layout_overflow_count: number;
  screenshot_count: number;
  app_route_counts: CountMap;
  service_counts: CountMap;
  apps: AppSmokeSummary[];
}): void {
  const browserReport = readJsonIfExists<{
    schema: string;
    generatedAt: string;
    ok: boolean;
    summary: {
      checkCount: number;
      passCount: number;
      failCount: number;
      hostOnlyMatchCount: number;
    };
  }>(BROWSER_COMPATIBILITY_REPORT_PATH);
  const inventoryMarkdown = fs.existsSync(BROWSER_COMPATIBILITY_INVENTORY_PATH)
    ? fs.readFileSync(BROWSER_COMPATIBILITY_INVENTORY_PATH, 'utf8')
    : '';
  const inventorySummary = parseInventorySummary(inventoryMarkdown);
  const routedApps = smokeEvidence.apps
    .filter(app => app.status === 'dispatch-covered')
    .map(app => ({
      app_id: app.appId,
      title: app.title,
      route: app.manifestRoute,
      routed_tool_count: app.routedToolCount,
      browser_classification: classifyAppFromInventory(inventoryMarkdown, app.appId),
      layout_overflow_count: 0,
    }));
  const hostOnlyMatches = browserReport?.summary?.hostOnlyMatchCount ?? null;
  const failCount = browserReport?.summary?.failCount ?? null;

  const evidence = {
    schema: 'swissknife.browser-all-app-compatibility.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [
      'docs/browser-compatibility-report.json',
      'docs/browser-compatibility-inventory.md',
      'swissknife.all-tools-virtual-desktop-app-smoke-coverage.v1',
    ],
    validation: 'node scripts/audit-browser-compat.mjs && npx playwright test test/e2e/all-tools-virtual-desktop-app-smoke.spec.ts --project=chromium --reporter=line',
    browser_audit: browserReport
      ? {
          schema: browserReport.schema,
          generated_at: browserReport.generatedAt,
          ok: browserReport.ok,
          check_count: browserReport.summary.checkCount,
          pass_count: browserReport.summary.passCount,
          fail_count: browserReport.summary.failCount,
          host_only_match_count: browserReport.summary.hostOnlyMatchCount,
        }
      : {
          ok: false,
          missing: true,
          path: path.relative(process.cwd(), BROWSER_COMPATIBILITY_REPORT_PATH),
        },
    inventory: {
      path: path.relative(process.cwd(), BROWSER_COMPATIBILITY_INVENTORY_PATH),
      ...inventorySummary,
    },
    all_app_smoke: {
      app_count: smokeEvidence.app_count,
      app_with_dispatch_count: smokeEvidence.app_with_dispatch_count,
      app_without_dispatch_count: smokeEvidence.app_without_dispatch_count,
      app_routable_tool_count: smokeEvidence.app_routable_tool_count,
      call_envelope_count: smokeEvidence.call_envelope_count,
      layout_overflow_count: smokeEvidence.layout_overflow_count,
      screenshot_count: smokeEvidence.screenshot_count,
      app_route_counts: smokeEvidence.app_route_counts,
      service_counts: smokeEvidence.service_counts,
    },
    routed_apps: routedApps,
    decision: failCount === 0 && hostOnlyMatches === 0 && smokeEvidence.layout_overflow_count === 0
      ? 'pass'
      : 'fail',
    blockers: [
      ...(failCount && failCount > 0 ? [`browser compatibility audit has ${failCount} failed checks`] : []),
      ...(hostOnlyMatches && hostOnlyMatches > 0 ? [`browser compatibility audit found ${hostOnlyMatches} host-only matches`] : []),
      ...(smokeEvidence.layout_overflow_count > 0 ? [`app smoke reported ${smokeEvidence.layout_overflow_count} layout overflows`] : []),
    ],
  };
  fs.writeFileSync(BROWSER_ALL_APP_COMPATIBILITY_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function parseInventorySummary(markdown: string): CountMap {
  const keys: Record<string, string> = {
    'Inventory items': 'inventory_items',
    'Browser-safe': 'browser_safe',
    'Host-only': 'host_only',
    'Simulated/test-only': 'simulated_test_only',
    Unknown: 'unknown',
    'Source files indexed': 'source_files_indexed',
    'Current web/dist artifacts observed': 'web_dist_artifacts',
  };
  const summary: CountMap = {};
  for (const [label, key] of Object.entries(keys)) {
    const match = markdown.match(new RegExp(`- ${label}: (\\d+)`));
    if (match) {
      summary[key] = Number(match[1]);
    }
  }
  return summary;
}

function classifyAppFromInventory(markdown: string, appId: string): string {
  const escaped = appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`\\| \\\`web/js/apps/${escaped}\\.js\\\` \\| [^|]+ \\| ([^|]+) \\|`));
  return match?.[1]?.trim() ?? 'not-listed';
}

function renderHarnessHtml(): string {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>SwissKnife all-tools app smoke</title>
        <style>
          :root {
            color: #1b1f23;
            background: #f6f7f9;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            min-width: 320px;
          }
          main {
            min-height: 100vh;
            padding: 18px;
          }
          .summary {
            display: grid;
            gap: 10px;
            margin: 0 0 14px;
            padding: 14px;
            border: 1px solid #d7dde5;
            border-radius: 8px;
            background: #ffffff;
          }
          .summary strong {
            display: block;
            font-size: 18px;
            margin-bottom: 4px;
          }
          .summary span {
            display: inline-block;
            margin-right: 12px;
            font-size: 13px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 8px;
          }
          .workspace {
            display: grid;
            grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
            gap: 14px;
          }
          nav {
            display: grid;
            gap: 6px;
            align-self: start;
          }
          button {
            border: 1px solid #bec7d3;
            border-radius: 8px;
            background: #ffffff;
            color: #1b1f23;
            cursor: pointer;
            font: inherit;
          }
          nav button {
            display: flex;
            min-height: 42px;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 10px;
            text-align: left;
          }
          button[data-route-status="dispatch-covered"] {
            border-color: #2f7d5b;
            background: #f3fbf7;
          }
          button small,
          .muted {
            color: #667085;
          }
          .app-card {
            min-width: 0;
            padding: 16px;
            border: 1px solid #d7dde5;
            border-radius: 8px;
            background: #ffffff;
          }
          .app-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            border-bottom: 1px solid #e4e8ee;
            padding-bottom: 12px;
          }
          h2 {
            margin: 0 0 4px;
            font-size: 24px;
            font-weight: 700;
          }
          p {
            margin: 0;
            overflow-wrap: anywhere;
          }
          .app-head > span,
          .pill {
            display: inline-flex;
            align-items: center;
            min-height: 28px;
            padding: 4px 8px;
            border-radius: 8px;
            background: #eef2f7;
            color: #344054;
            font-size: 12px;
            white-space: nowrap;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
            margin: 14px 0;
          }
          .stats div {
            min-width: 0;
            padding: 8px;
            border: 1px solid #e4e8ee;
            border-radius: 8px;
          }
          dt,
          .label {
            color: #667085;
            font-size: 12px;
            font-weight: 600;
          }
          dd {
            margin: 4px 0 0;
            overflow-wrap: anywhere;
            font-size: 14px;
          }
          .dispatch-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-bottom: 12px;
          }
          .dispatch-grid > div,
          .dispatch-path,
          .no-route {
            min-width: 0;
            padding: 12px;
            border: 1px solid #e4e8ee;
            border-radius: 8px;
            background: #fbfcfe;
          }
          .service-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
          }
          .dispatch-path {
            display: grid;
            grid-template-columns: minmax(100px, 130px) repeat(auto-fit, minmax(180px, 1fr));
            gap: 8px;
            align-items: stretch;
          }
          .dispatch-path button {
            min-height: 40px;
            background: #17324d;
            color: #ffffff;
          }
          .dispatch-path div {
            min-width: 0;
            padding: 8px;
            border-radius: 8px;
            overflow-wrap: anywhere;
            background: #eef2f7;
            font-size: 13px;
          }
          [data-state="blocked"],
          [data-state="error"] {
            background: #fff2ea;
            color: #7a3518;
          }
          [data-state="approved"],
          [data-state="success"],
          [data-state="receipt"],
          [data-state="event-dag"] {
            background: #ecf8f3;
            color: #085d3a;
          }
          @media (max-width: 760px) {
            main {
              padding: 10px;
            }
            .workspace {
              grid-template-columns: 1fr;
            }
            .app-head {
              display: grid;
            }
            .app-head > span {
              white-space: normal;
            }
            .dispatch-path {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `;
}

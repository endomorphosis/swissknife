import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { expect, test } from '@playwright/test';

interface BindingMatrix {
  rows: BindingRow[];
}

interface BindingRow {
  tool_id: string;
  service_id: string;
  name: string;
  category: string;
  owner_module: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  disposition: string;
  normalized_disposition: string;
  app_visible: boolean;
  app_id?: string;
  capability_id?: string;
  result_renderer?: string;
  glasses_fallback?: string;
  glasses_exposure: string;
  binding_reason: string;
  non_app_reason?: string;
}

interface Ledger {
  tools: Array<{
    tool_id: string;
    service_id: string;
    discovery?: {
      live?: boolean;
      static?: boolean;
    };
    coverage_status?: string;
  }>;
}

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const bindingPath = join(evidenceRoot, 'all-tools-app-bindings.json');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const accelerateCoveragePath = join(evidenceRoot, 'ipfs-accelerate-adapter-coverage.json');
const accelerateDecisionPath = join(evidenceRoot, 'ipfs-accelerate-endpoint-decision.md');
const outputPath = join(evidenceRoot, 'all-tools-app-family-coverage.json');

test.describe.configure({ mode: 'serial' });

test('all bound virtual desktop app families expose expected all-tools states and fallbacks', async () => {
  const bindings = readJson<BindingMatrix>(bindingPath);
  const ledger = readJson<Ledger>(ledgerPath);
  const accelerateCoverage = readJson<{ summary?: { decision?: string } }>(accelerateCoveragePath);
  const liveByTool = new Map(ledger.tools.map(tool => [tool.tool_id, Boolean(tool.discovery?.live)]));
  const staticOnlyByTool = new Map(ledger.tools.map(tool => [tool.tool_id, tool.coverage_status === 'static_only']));
  const accelerateDecision = readFileSync(accelerateDecisionPath, 'utf8');

  expect(accelerateDecision).toContain('bounded compatibility bridge');
  expect(accelerateDecision).toContain('adapter-required');

  const appFamilies = buildAppFamilies(bindings.rows, liveByTool, staticOnlyByTool);
  const report = {
    schema: 'swissknife.all-tools-app-family-coverage.v1',
    generated_at: new Date().toISOString(),
    source_artifacts: {
      bindings: relativeEvidence(bindingPath),
      ledger: relativeEvidence(ledgerPath),
      accelerate_endpoint_decision: relativeEvidence(accelerateDecisionPath),
    },
    summary: {
      app_family_count: appFamilies.length,
      app_visible_tool_count: bindings.rows.filter(row => row.app_visible).length,
      desktop_mobile_only_count: bindings.rows.filter(row => row.disposition === 'desktop_mobile_only').length,
      supervisor_only_count: bindings.rows.filter(row => row.disposition === 'supervisor_only_internal').length,
      adapter_required_accelerate_count: appFamilies.reduce(
        (sum, family) => sum + family.adapter_required_tool_ids.length,
        0,
      ),
    },
    app_families: appFamilies,
    supervisor_only: bindings.rows
      .filter(row => row.disposition === 'supervisor_only_internal')
      .map(row => ({
        tool_id: row.tool_id,
        service_id: row.service_id,
        policy_class: row.policy_class,
        normalized_disposition: row.normalized_disposition,
        reason: row.non_app_reason ?? row.binding_reason,
      })),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  expect(report.summary.app_family_count).toBeGreaterThanOrEqual(7);
  expect(report.summary.app_visible_tool_count).toBeGreaterThan(400);
  expect(report.summary.desktop_mobile_only_count).toBe(50);
  expect(report.summary.supervisor_only_count).toBe(20);
  if (accelerateCoverage.summary?.decision === 'go') {
    expect(report.summary.adapter_required_accelerate_count).toBe(0);
  } else {
    expect(report.summary.adapter_required_accelerate_count).toBeGreaterThanOrEqual(10);
  }

  for (const family of appFamilies) {
    expect(family.tool_count, family.app_id).toBeGreaterThan(0);
    expect(family.visible_tool_count, family.app_id).toBeGreaterThan(0);
    expect(family.state_coverage, family.app_id).toEqual(
      expect.arrayContaining(['ready', 'running', 'success', 'degraded', 'blocked', 'fallback']),
    );
    expect(family.service_families.length, family.app_id).toBeGreaterThan(0);
    expect(family.result_renderers.length, family.app_id).toBeGreaterThan(0);
    expect(family.glasses_fallbacks.length, family.app_id).toBeGreaterThan(0);
    expect(family.primary_tool_categories.length, family.app_id).toBeGreaterThan(0);
  }

  const accelerate = appFamilies.find(family => family.app_id === 'accelerate-panel');
  if (accelerateCoverage.summary?.decision === 'go') {
    expect(accelerate?.adapter_required_tool_ids ?? []).toHaveLength(0);
  } else {
    expect(accelerate?.adapter_required_tool_ids).toEqual(
      expect.arrayContaining([
        'ipfs_accelerate_py:detect_hardware',
        'ipfs_accelerate_py:run_inference_job',
        'ipfs_accelerate_py:submit_task',
        'ipfs_accelerate_py:telemetry',
      ]),
    );
  }

  const hiddenRows = bindings.rows.filter(row => !row.app_visible);
  for (const row of hiddenRows) {
    expect(row.normalized_disposition, row.tool_id).toMatch(
      /server_internal|unsafe_without_human_review|not_app_surface|admin_only|deprecated/,
    );
    expect(row.non_app_reason || row.binding_reason, row.tool_id).toBeTruthy();
  }

  expect(existsSync(outputPath)).toBe(true);
});

function buildAppFamilies(
  rows: BindingRow[],
  liveByTool: Map<string, boolean>,
  staticOnlyByTool: Map<string, boolean>,
) {
  const grouped = new Map<string, BindingRow[]>();
  for (const row of rows) {
    if (!row.app_id) continue;
    if (!grouped.has(row.app_id)) grouped.set(row.app_id, []);
    grouped.get(row.app_id)?.push(row);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([appId, appRows]) => {
      const visibleRows = appRows.filter(row => row.app_visible);
      const hiddenRows = appRows.filter(row => !row.app_visible);
      const stateCoverage = new Set(['ready', 'degraded', 'fallback']);
      for (const row of appRows) {
        if (row.app_visible) stateCoverage.add('success');
        if (row.policy_class !== 'read') stateCoverage.add('running');
        if (row.confirmation_policy !== 'none' || !row.app_visible) stateCoverage.add('blocked');
      }

      return {
        app_id: appId,
        tool_count: appRows.length,
        visible_tool_count: visibleRows.length,
        hidden_tool_count: hiddenRows.length,
        existing_capability_count: appRows.filter(row => row.disposition === 'existing_app_capability').length,
        generated_capability_count: appRows.filter(row => row.disposition === 'generated_descriptor_app_capability').length,
        desktop_mobile_only_count: appRows.filter(row => row.disposition === 'desktop_mobile_only').length,
        service_families: unique(appRows.map(row => row.service_id)),
        owner_modules: unique(appRows.map(row => row.owner_module)),
        policy_classes: unique(appRows.map(row => row.policy_class)),
        result_renderers: unique(appRows.map(row => row.result_renderer).filter(Boolean)),
        glasses_fallbacks: unique(appRows.map(row => row.glasses_fallback).filter(Boolean)),
        primary_tool_categories: unique(appRows.map(row => row.category)).slice(0, 20),
        state_coverage: Array.from(stateCoverage).sort(),
        adapter_required_tool_ids: appRows
          .filter(row => row.service_id === 'ipfs_accelerate_py' && (staticOnlyByTool.get(row.tool_id) || !liveByTool.get(row.tool_id)))
          .map(row => row.tool_id)
          .sort(),
        hidden_or_delegated_tool_ids: hiddenRows.map(row => row.tool_id).sort(),
      };
    });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function relativeEvidence(filePath: string): string {
  return filePath.slice(process.cwd().length + 1);
}

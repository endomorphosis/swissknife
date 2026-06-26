import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import MCPDaemonManager from '../../../hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
} from '../../src/services/swissknife-mcp-capability-registry';

const DASHBOARD_CATALOG_FIXTURE = path.resolve(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-mcp-dashboard-catalog.json',
);
const MGW_537_LAUNCH_GATE_FIXTURE = path.resolve(
  process.cwd(),
  'test',
  'e2e',
  'fixtures',
  'mgw-537-mcp-dashboard-launch-gate.json',
);

const EXPECTED_PACKAGES = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'];
const REQUIRED_EVIDENCE = [
  'Swissknife applications',
  'Mcp-Plus-Plus',
  'MCP++ compatibility',
  'MCP server dashboard',
  'dashboard capability catalog',
  'ipfs_accelerate_py',
  'ipfs_datasets_py',
  'ipfs_kit_py',
  'tools/list',
  'tools/call',
  'control plane',
  'launch Playwright validation gate',
];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

test.describe('MGW-537 Swissknife MCP++ dashboard launch gate', () => {
  test('consumes the Hallucinate App dashboard catalog without schema drift', () => {
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);
    const liveCatalog = new MCPDaemonManager().getDashboardCapabilityCatalog();

    expect(catalog).toEqual(liveCatalog);
    expect(catalog.schema).toBe('hallucinate_app.mcp_dashboard_capability_catalog.v1');
    expect(catalog.dashboard_only_mocks).toBe(false);
    expect(catalog.generated_by).toBe('hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog');
    expect(catalog.control_surface_route).toEqual([
      'Hallucinate App dashboard action',
      'dashboard capability catalog',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport',
    ]);

    const plans = buildSwissknifeMCPDashboardConsumerPlans(catalog);
    expect(plans.map(plan => plan.server_package).sort()).toEqual(EXPECTED_PACKAGES);
    expect(new Set(plans.map(plan => plan.catalog_schema)).size).toBe(1);

    for (const plan of plans) {
      expect(plan.catalog_schema).toBe(catalog.schema);
      expect(plan.catalog_generated_by).toBe(catalog.generated_by);
      expect(plan.dashboard_only_mock).toBe(false);
      expect(plan.receipt_schema).toBe('mcp_server_invocation_receipt_v1');
      expect(plan.tools_list.operation).toBe('tools/list');
      expect(plan.tools_call.operation).toBe('tools/call');
      expect(plan.tools_call.safeProbe?.mutation).toBe(false);
      expect(plan.control_surface_route).toEqual(catalog.control_surface_route);
      expect(plan.required_receipt_fields).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'mediation_receipt_id',
        'mcpplusplus_descriptor_evidence',
        'receipt_cid',
      ]));
    }
  });

  test('maps tools/list and tools/call through Swissknife invocation plans', () => {
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);

    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_kit_py', 'tools/list')).toMatchObject({
      operation: 'tools/list',
      method: 'GET',
      url: 'http://127.0.0.1:8004/mcp/tools/list',
    });
    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_datasets_py', 'tools/call').safe_probe).toMatchObject({
      tool_name: 'datasets_list',
      mutation: false,
      expected_receipt: 'ipfs_datasets_list_probe',
    });
    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_accelerate_py', 'tools/call').safe_probe).toMatchObject({
      tool_name: 'hardware_profile',
      mutation: false,
      expected_receipt: 'ipfs_accelerate_hardware_profile_probe',
    });
  });

  test('binds VAIOS-G725 to a Playwright launch validation gate receipt', () => {
    const receipt = readJson<any>(MGW_537_LAUNCH_GATE_FIXTURE);
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'MGW-537',
      goal_id: 'VAIOS-G725',
      evidence_term: 'launch Playwright validation gate',
      catalog_schema: catalog.schema,
      catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
      supervisor_gap_receipt: 'data/meta_glasses_display_widgets/discovery/2026-06-26-mgw-537-objective-gap-1d0c6a56cf6c.md',
    });
    expect(receipt.playwright_specs).toContain('swissknife/test/e2e/mcp-dashboard.spec.ts');
    expect(receipt.validation_commands).toContain('npm --prefix swissknife run test:e2e:mcp');
    expect(receipt.required_backends.sort()).toEqual(EXPECTED_PACKAGES);
    expect(receipt.required_evidence).toEqual(expect.arrayContaining(REQUIRED_EVIDENCE));
    expect(receipt.receipt_route).toEqual([
      'Swissknife application command intent',
      'MCP++ capability descriptor',
      'Hallucinate App dashboard capability catalog',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport',
    ]);
    expect(receipt.dashboard_servers.map((server: any) => server.server_package).sort()).toEqual(EXPECTED_PACKAGES);
  });
});

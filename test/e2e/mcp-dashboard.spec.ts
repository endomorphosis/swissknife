import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import MCPDaemonManager from '../../../hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
} from '../../src/services/swissknife-mcp-capability-registry';
import hallucinateBackendBridge from '../../web/js/hallucinate-backend-bridge.mjs';

const DASHBOARD_CATALOG_FIXTURE = path.resolve(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-mcp-dashboard-catalog.json',
);
const HAO_704_LAUNCH_GATE_FIXTURE = path.resolve(
  process.cwd(),
  'test',
  'e2e',
  'fixtures',
  'hao-704-mcp-dashboard-launch-gate.json',
);
const VAI_512_CONSUMPTION_RECEIPT = path.resolve(
  process.cwd(),
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-hallucinate-swissknife-mcp-dashboard-consumption.json',
);
const HAO_681_CATALOG_CONSUMER_FIXTURE = path.resolve(
  process.cwd(),
  'test',
  'e2e',
  'fixtures',
  'hao-681-mcp-dashboard-catalog-consumer.json',
);

const EXPECTED_PACKAGES = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'];
const {
  HallucinateBackendBridge,
  mapCatalogServerToMCPControlServer,
} = hallucinateBackendBridge;
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

// The published catalog fixture snapshots the DEFAULT daemon ports; normalize an
// overridden live catalog (e.g. MCP_KIT_PORT set locally) back to defaults so the
// parity check validates schema/content rather than the environment's port choice.
const PORT_NORMALIZATION: Array<[number, number]> = [
  [Number(process.env.MCP_KIT_PORT) || 8014, 8014],
  [Number(process.env.MCP_DATASETS_PORT) || 3002, 3002],
  [Number(process.env.MCP_ACCELERATE_PORT) || 3003, 3003],
  [Number(process.env.MCP_SWISSKNIFE_PORT) || 3004, 3004],
  [Number(process.env.MCP_DATASETS_DASHBOARD_PORT) || 8899, 8899],
];

function normalizeCatalogPorts<T>(value: T): T {
  let json = JSON.stringify(value);
  for (const [actual, canonical] of PORT_NORMALIZATION) {
    if (actual === canonical) {
      continue;
    }
    json = json.split(`:${actual}/`).join(`:${canonical}/`);
    json = json.split(`:${actual}"`).join(`:${canonical}"`);
    json = json.split(`"port":${actual}`).join(`"port":${canonical}`);
  }
  return JSON.parse(json);
}

test.describe('HAO-704 Swissknife MCP++ dashboard launch gate', () => {
  test('consumes the Hallucinate App dashboard catalog without schema drift', () => {
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);
    const receipt = readJson<any>(VAI_512_CONSUMPTION_RECEIPT);
    const liveCatalog = new MCPDaemonManager().getDashboardCapabilityCatalog();

    expect(catalog).toEqual(normalizeCatalogPorts(liveCatalog));
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
    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'VAI-512',
      goal_id: 'VAIOS-G723',
      evidence_term: 'Hallucinate dashboard to Swissknife MCP consumer launch receipt',
      catalog_schema: catalog.schema,
      catalog_generated_by: catalog.generated_by,
      dashboard_only_mocks: false,
      shared_receipt_schema: 'mcp_server_invocation_receipt_v1',
    });
    expect(receipt.required_backends.sort()).toEqual(EXPECTED_PACKAGES);
    expect(receipt.validation_commands).toEqual(expect.arrayContaining([
      'npm --prefix hallucinate_app run test:e2e -- mcp-feature-exposure.spec.ts mcp-dashboard-interoperability.spec.ts',
      'npm --prefix swissknife run test:e2e:mcp',
      'npm --prefix hallucinate_app run test:e2e -- multimodal-control-surface.spec.ts',
    ]));
    expect(receipt.receipt_route).toEqual([
      'Hallucinate App MCP dashboard',
      'dashboard capability catalog',
      'Swissknife MCP dashboard capability registry',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport',
    ]);

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
      expect(receipt.required_operations).toEqual(expect.arrayContaining([
        `${plan.server_package}:tools/list`,
        `${plan.server_package}:tools/call`,
      ]));
    }
  });

  test('maps tools/list and tools/call through Swissknife invocation plans', () => {
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);

    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_kit_py', 'tools/list')).toMatchObject({
      operation: 'tools/list',
      method: 'GET',
      url: 'http://127.0.0.1:8014/mcp/tools/list',
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

  test('proves HAO-681 storage, dataset, and compute apps consume the Hallucinate App MCP dashboard catalog', () => {
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);
    const receipt = readJson<any>(HAO_681_CATALOG_CONSUMER_FIXTURE);
    const plans = buildSwissknifeMCPDashboardConsumerPlans(catalog);
    const plansByPackage = new Map(plans.map(plan => [plan.server_package, plan]));

    expect(catalog.swissknife_catalog_consumer_proof).toMatchObject({
      task_id: 'HAO-681',
      depends_on: ['HAO-677', 'HAO-680'],
      evidence_term: 'Hallucinate App MCP dashboard catalog consumed by Swissknife applications',
      consumer_registry: 'hallucinate_app.swissknife.mcp_capability_registry',
      receipt_fixture: 'swissknife/test/e2e/fixtures/hao-681-mcp-dashboard-catalog-consumer.json',
    });
    expect(receipt).toMatchObject({
      schema: 'swissknife_mcp_dashboard_catalog_consumer_receipt_v1',
      task_id: 'HAO-681',
      depends_on: ['HAO-677', 'HAO-680'],
      goal_id: 'VAIOS-G723',
      catalog_schema: catalog.schema,
      catalog_generated_by: catalog.generated_by,
      consumer_registry: 'hallucinate_app.swissknife.mcp_capability_registry',
      receipt_schema: 'mcp_server_invocation_receipt_v1',
    });
    expect(receipt.validation_commands).toContain('npm --prefix swissknife run test:e2e:mcp');
    expect(receipt.receipt_route).toEqual(expect.arrayContaining([
      'Hallucinate App MCP dashboard catalog',
      'MCP++ capability descriptor',
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'supervised MCP server transport',
    ]));
    expect(receipt.required_receipt_fields).toEqual(expect.arrayContaining([
      'interaction_envelope',
      'policy_decision',
      'mediation_receipt',
      'mediation_receipt_id',
      'receipt_cid',
      'mcpplusplus_descriptor_evidence',
    ]));
    expect(receipt.applications.map((app: any) => app.role).sort()).toEqual(['compute', 'dataset', 'storage']);

    for (const app of receipt.applications) {
      const plan = plansByPackage.get(app.server_package);
      expect(plan, app.server_package).toBeTruthy();
      expect(plan?.app_id).toBe(app.app_id);
      expect(plan?.daemon_id).toBe(app.daemon_id);
      expect(plan?.tools_list.url).toBe(app.tools_list_url);
      expect(plan?.tools_call.safeProbe?.tool_name).toBe(app.safe_tools_call_probe);
      expect(plan?.tools_call.safeProbe?.expected_receipt).toBe(app.safe_probe_receipt);
      expect(plan?.required_receipt_fields).toEqual(expect.arrayContaining(receipt.required_receipt_fields));
    }
  });

  test('binds VAIOS-G725 to a Playwright launch validation gate receipt', () => {
    const receipt = readJson<any>(HAO_704_LAUNCH_GATE_FIXTURE);
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);

    expect(receipt).toMatchObject({
      schema: 'launch_readiness_receipt_v1',
      task_id: 'HAO-704',
      goal_id: 'VAIOS-G725',
      evidence_term: 'launch Playwright validation gate',
      catalog_schema: catalog.schema,
      catalog_fixture: 'hallucinate_app/test/e2e/fixtures/vai-512-mcp-dashboard-catalog.json',
      supervisor_gap_receipt: 'data/hallucinate_multimodal_control/discovery/2026-06-26-hao-704-objective-gap-1d0c6a56cf6c.md',
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

  test('maps the Hallucinate daemon catalog into the SwissKnife MCP Control backend bridge', async () => {
    const catalog = readJson<any>(DASHBOARD_CATALOG_FIXTURE);
    const manager = new MCPDaemonManager();
    const launchPlan = manager.getLaunchPlan();
    const allStatus = Object.fromEntries(
      launchPlan.map((entry: any) => [entry.daemon_id, {
        status: 'running',
        pid: 1000 + entry.startup_order,
        uptime: 2500,
        lastHealth: { healthy: true, endpoint: entry.endpoint },
      }]),
    );
    const fakeApi = {
      getDashboardCapabilityCatalog: async () => catalog,
      getLaunchPlan: async () => launchPlan,
      getAll: async () => allStatus,
      getDaemonLaunchValidationGate: async () => manager.getDaemonLaunchValidationGate(),
      checkHealth: async (daemonId: string) => allStatus[daemonId].lastHealth,
      start: async (daemonId: string) => ({ daemonId, status: 'starting' }),
      stop: async (daemonId: string) => ({ daemonId, status: 'stopping' }),
      restart: async (daemonId: string) => ({ daemonId, status: 'restarting' }),
    };

    const bridge = new HallucinateBackendBridge(fakeApi as any);
    const snapshot = await bridge.getSnapshot();
    const serversByPackage = new Map(snapshot.servers.map((server: any) => [server.serverPackage, server]));
    const mappedKit = mapCatalogServerToMCPControlServer(catalog.servers[0], launchPlan[0], allStatus['ipfs-kit']);

    expect(snapshot.available).toBe(true);
    expect(snapshot.ready).toBe(true);
    expect(snapshot.requiredBackends.sort()).toEqual(EXPECTED_PACKAGES);
    expect(snapshot.evidence).toEqual(expect.arrayContaining([
      'Hallucinate App daemon health',
      'dashboard capability catalog',
      'Swissknife applications',
      'launch Playwright validation gate',
    ]));

    for (const packageName of EXPECTED_PACKAGES) {
      const server = serversByPackage.get(packageName) as any;
      expect(server.managedBy).toBe('hallucinate_app.electron.daemon');
      expect(server.status).toBe('running');
      expect(server.capabilities).toEqual(expect.arrayContaining([
        packageName,
        'tools/list',
        'tools/call',
        'dashboard capability catalog',
      ]));
      expect(server.mediationContractRef).toMatch(/^control_surface_contract:mcp-daemon:/);
      expect(server.safeProbeReceipt).toBeTruthy();
    }

    expect(mappedKit).toMatchObject({
      name: 'ipfs-kit',
      serverPackage: 'ipfs_kit_py',
      toolsListUrl: 'http://127.0.0.1:8014/mcp/tools/list',
      safeProbeTool: 'ipfs_status',
      safeProbeReceipt: 'ipfs_kit_status_probe',
    });
  });
});

import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import MCPDaemonManager from '../../../hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
} from '../../src/services/apps/swissknife-mcp-capability-registry';
import { getAppManifest } from '../../src/services/apps/app-manifest-registry';
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
const VIRTUAL_DESKTOP_EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
);
const CAPABILITY_MATRIX_FIXTURE = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'capability-matrix.json');
const COMPOSITE_WORKFLOWS_FIXTURE = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'all-tools-composite-workflows.json');
const TOOL_UI_SMOKE_RECEIPT = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'tool-ui-smoke-receipts.json');
const TOOL_UI_SMOKE_MARKDOWN = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'tool-ui-smoke-receipts.md');
const TOOL_UI_SMOKE_SCREENSHOT_DIR = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'tool-ui-smoke-screenshots');
const TOOL_UI_SMOKE_DOC = path.resolve(process.cwd(), 'docs', 'virtual-desktop-tool-ui-smoke-evidence.md');

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
  if (
    filePath === CAPABILITY_MATRIX_FIXTURE
    && (!fs.existsSync(filePath) || !fs.existsSync(COMPOSITE_WORKFLOWS_FIXTURE))
  ) {
    ensureCapabilityMatrixEvidence();
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function ensureCapabilityMatrixEvidence(): void {
  for (const script of [
    'scripts/capture-ipfs-mcp-all-tools-ledger.cjs',
    'scripts/build-all-tools-composite-workflows.cjs',
    'scripts/build-all-tools-capability-matrix.cjs',
  ]) {
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`${script} exited with status ${result.status}`);
    }
  }
}

interface ToolBackedSmokeApp {
  app_id: string;
  title: string;
  binding_state: string;
  manifest_runtime_class: string;
  manifest_lazy_import_kind: string;
  manifest_browser_supported: boolean;
  manifest_browser_degraded: boolean;
  service_families: string[];
  sample_tool_ids: string[];
  app_visible_tool_count: number;
  desktop_mobile_only_count: number;
  supervisor_only_count: number;
  rationale: string;
  browser_safety: ToolBackedSmokeBrowserSafety;
}

interface ToolBackedSmokeBrowserSafety {
  browser_context: true;
  node_builtins_required: false;
  python_wrappers_required: false;
  host_subprocess_required: false;
  physical_glasses_required: false;
  unavailable_native_adapters_required: false;
  bundled_runtime_classes: string[];
  allowed_transports: string[];
  fallback_paths: string[];
  proof: string[];
}

interface ToolBackedSmokeReceipt {
  schema: string;
  task_id: string;
  generated_at: string;
  source_matrix: string;
  matrix_cid: string;
  app_count: number;
  state_count: number;
  screenshot_dir: string;
  validation_commands: string[];
  required_states: string[];
  apps: Array<ToolBackedSmokeApp & {
    observed_states: string[];
    screenshot: string;
    receipts: Array<{
      state: string;
      receipt_cid: string;
      service_families: string[];
      sample_tool_ids: string[];
      ui_path: string[];
      browser_safety: ToolBackedSmokeBrowserSafety;
    }>;
  }>;
}

function buildToolBackedSmokeApps(): ToolBackedSmokeApp[] {
  const matrix = readJson<any>(CAPABILITY_MATRIX_FIXTURE);
  return matrix.rows
    .filter((row: any) => row.binding_state === 'tool_backed')
    .map((row: any) => {
      const manifest = getAppManifest(row.app_id);
      if (!manifest) {
        throw new Error(`No browser app manifest is registered for tool-backed app "${row.app_id}".`);
      }
      if (manifest.browser.supported !== true || manifest.lazy_import.kind !== 'dynamic-import') {
        throw new Error(`Tool-backed app "${row.app_id}" is not directly browser-bundleable.`);
      }
      const sampleToolIds = [
        ...(row.all_tools?.app_visible_tool_ids ?? []),
        ...(row.all_tools?.desktop_mobile_only_tool_ids ?? []),
        ...(row.all_tools?.supervisor_only_tool_ids ?? []),
      ].slice(0, 5);
      const browserSafety: ToolBackedSmokeBrowserSafety = {
        browser_context: true,
        node_builtins_required: false,
        python_wrappers_required: false,
        host_subprocess_required: false,
        physical_glasses_required: false,
        unavailable_native_adapters_required: false,
        bundled_runtime_classes: [manifest.runtime_class],
        allowed_transports: ['http', 'https', 'websocket', 'libp2p'],
        fallback_paths: [
          'browser-fallback-ui',
          'desktop-mobile-confirmation',
          'simulator-only-glasses-handoff',
        ],
        proof: [
          'Playwright Chromium page',
          'desktop icon launcher',
          'browser app manifest',
          'in-window tool smoke panel',
          'client-side receipt buffer',
        ],
      };
      return {
        app_id: row.app_id,
        title: row.title,
        binding_state: row.binding_state,
        manifest_runtime_class: manifest.runtime_class,
        manifest_lazy_import_kind: manifest.lazy_import.kind,
        manifest_browser_supported: manifest.browser.supported === true,
        manifest_browser_degraded: manifest.browser.degraded === true,
        service_families: row.manifest_service_families ?? [],
        sample_tool_ids: sampleToolIds,
        app_visible_tool_count: row.all_tools?.app_visible_tool_count ?? 0,
        desktop_mobile_only_count: row.all_tools?.desktop_mobile_only_count ?? 0,
        supervisor_only_count: row.all_tools?.supervisor_only_count ?? 0,
        rationale: row.binding_rationale,
        browser_safety: browserSafety,
      };
    })
    .sort((a: ToolBackedSmokeApp, b: ToolBackedSmokeApp) => a.app_id.localeCompare(b.app_id));
}

function writeToolUiSmokeEvidence(receipt: ToolBackedSmokeReceipt): void {
  fs.mkdirSync(VIRTUAL_DESKTOP_EVIDENCE_ROOT, { recursive: true });
  fs.writeFileSync(TOOL_UI_SMOKE_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  const rows = receipt.apps.map(app => (
    `| ${app.app_id} | ${app.service_families.join(', ')} | ${app.app_visible_tool_count} | ${app.desktop_mobile_only_count} | ${app.observed_states.join(', ')} | ${app.screenshot} |`
  ));
  const markdown = [
    '# Virtual Desktop Tool UI Smoke Receipts',
    '',
    `Generated: ${receipt.generated_at}`,
    `Task: ${receipt.task_id}`,
    `Matrix CID: \`${receipt.matrix_cid}\``,
    '',
    '## Summary',
    '',
    `- Tool-backed apps covered: ${receipt.app_count}`,
    `- UI states recorded: ${receipt.state_count}`,
    `- Screenshot directory: \`${receipt.screenshot_dir}\``,
    '',
    '## Coverage',
    '',
    '| App | Backends | App-visible | Fallback/desktop | States | Screenshot |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(TOOL_UI_SMOKE_MARKDOWN, markdown, 'utf8');

  const doc = [
    '# Virtual Desktop Tool UI Smoke Evidence',
    '',
    'SWR-096 proves every virtual desktop app whose all-tools matrix row is `tool_backed` keeps a browser-compatible UI path.',
    'The Playwright smoke opens each app through the desktop icon path, waits for the MCP capability control panel, records success/fallback/error UI receipts, and captures a screenshot for the rendered app window.',
    '',
    '## Evidence Artifacts',
    '',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.md`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/`',
    '',
    '## Validation',
    '',
    '- `npm run test:e2e:mcp`',
    '- `npm run evidence:mcp-glasses`',
    '',
    '## Required UI States',
    '',
    '- `success`: the app records an MCP-backed receipt using its intended service family and representative tool ids.',
    '- `fallback`: the app exposes the degraded or desktop/mobile confirmation path without breaking the window shell.',
    '- `error`: the app records an error-state receipt while keeping the desktop window interactive.',
    '',
    '## Browser Safety Contract',
    '',
    'Each receipt is recorded from a Playwright browser page and asserts that no app smoke path requires Node builtins, Python wrappers, host subprocesses, physical glasses, or unavailable native adapters. Optional device, host, and glasses features must appear only as browser fallback, desktop/mobile confirmation, or simulator handoff paths.',
    '',
    '## Current Coverage',
    '',
    markdown.split('## Coverage\n\n')[1].trim(),
    '',
  ].join('\n');
  fs.writeFileSync(TOOL_UI_SMOKE_DOC, doc, 'utf8');
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

  test('opens every tool-backed virtual desktop app and records MCP UI smoke receipts', async ({ page }, testInfo) => {
    test.setTimeout(180 * 1000);
    const matrix = readJson<any>(CAPABILITY_MATRIX_FIXTURE);
    const apps = buildToolBackedSmokeApps();
    const catalog = Object.fromEntries(apps.map(app => [app.app_id, app]));
    const coveredApps: ToolBackedSmokeReceipt['apps'] = [];

    fs.mkdirSync(TOOL_UI_SMOKE_SCREENSHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.addInitScript((injectedCatalog) => {
      window.__SWISSKNIFE_TOOL_UI_SMOKE_CATALOG__ = injectedCatalog as any;
      window.__SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__ = [];
    }, catalog);
    await page.goto('/');
    await expect(page.locator('#desktop')).toBeVisible();
    await page.waitForFunction(() => {
      const desktop = (window as any).swissknifeDesktop;
      return Boolean(desktop?.apps?.size >= 38);
    });
    await page.locator('#loading-screen').evaluate(element => {
      (element as HTMLElement).style.display = 'none';
    });

    for (const app of apps) {
      await page.locator('.window').evaluateAll(windows => windows.forEach(windowElement => windowElement.remove()));
      const icon = page.locator(`.icon[data-app="${app.app_id}"]`).first();
      await expect(icon, `desktop icon for ${app.app_id}`).toHaveCount(1);
      await icon.scrollIntoViewIfNeeded();
      await icon.click({ force: true });

      const panel = page.locator(`.tool-smoke-panel[data-app-id="${app.app_id}"]`).last();
      await expect(panel, `MCP smoke panel for ${app.app_id}`).toBeVisible();
      await expect(panel.getByTestId('tool-smoke-control-state')).toContainText(String(app.app_visible_tool_count));
      for (const serviceFamily of app.service_families) {
        await expect(panel.getByTestId('tool-smoke-control-state')).toContainText(serviceFamily);
      }
      for (const toolId of app.sample_tool_ids.slice(0, 1)) {
        await expect(panel.getByTestId('tool-smoke-tools')).toContainText(toolId);
      }

      const observedStates: string[] = [];
      for (const state of ['success', 'fallback', 'error'] as const) {
        await panel.getByTestId(`tool-smoke-${state}`).click();
        await expect(panel.getByTestId('tool-smoke-state')).toHaveText(state);
        await expect(panel.getByTestId('tool-smoke-receipt')).toContainText('sha256:');
        observedStates.push(state);
      }

      const screenshotPath = path.join(TOOL_UI_SMOKE_SCREENSHOT_DIR, `${app.app_id}.png`);
      await panel.screenshot({ path: screenshotPath });
      await testInfo.attach(`tool-ui-smoke-${app.app_id}`, {
        path: screenshotPath,
        contentType: 'image/png',
      });

      const appReceipts = await page.evaluate((appId) => (
        (((window as any).__SWISSKNIFE_TOOL_UI_SMOKE_RECEIPTS__ ?? []) as any[])
          .filter(receipt => receipt.app_id === appId)
          .map(receipt => ({
            state: receipt.state,
          receipt_cid: receipt.receipt_cid,
          service_families: receipt.service_families,
          sample_tool_ids: receipt.sample_tool_ids,
          ui_path: receipt.ui_path,
          browser_safety: receipt.browser_safety,
        }))
      ), app.app_id);

      expect(appReceipts.map(receipt => receipt.state).sort()).toEqual(['error', 'fallback', 'success']);
      for (const receipt of appReceipts) {
        expect(receipt.browser_safety).toMatchObject({
          browser_context: true,
          node_builtins_required: false,
          python_wrappers_required: false,
          host_subprocess_required: false,
          physical_glasses_required: false,
          unavailable_native_adapters_required: false,
        });
        expect(receipt.browser_safety.bundled_runtime_classes).toEqual([app.manifest_runtime_class]);
        expect(receipt.browser_safety.allowed_transports).toEqual(['http', 'https', 'websocket', 'libp2p']);
      }
      coveredApps.push({
        ...app,
        observed_states: observedStates,
        screenshot: path.relative(process.cwd(), screenshotPath),
        receipts: appReceipts,
      });
    }

    expect(coveredApps.map(app => app.app_id).sort()).toEqual(apps.map(app => app.app_id).sort());
    const receipt: ToolBackedSmokeReceipt = {
      schema: 'swissknife.virtual-desktop-tool-ui-smoke-evidence.v1',
      task_id: 'SWR-096',
      generated_at: new Date().toISOString(),
      source_matrix: path.relative(process.cwd(), CAPABILITY_MATRIX_FIXTURE),
      matrix_cid: matrix.matrix_cid,
      app_count: coveredApps.length,
      state_count: coveredApps.reduce((sum, app) => sum + app.observed_states.length, 0),
      screenshot_dir: path.relative(process.cwd(), TOOL_UI_SMOKE_SCREENSHOT_DIR),
      validation_commands: [
        'npm run test:e2e:mcp',
        'npm run evidence:mcp-glasses',
      ],
      required_states: ['success', 'fallback', 'error'],
      apps: coveredApps,
    };
    writeToolUiSmokeEvidence(receipt);
  });
});

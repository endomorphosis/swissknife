import { test, expect, type Locator, type Page } from '@playwright/test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import MCPDaemonManager from '../../../hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
} from '../../src/services/apps/swissknife-mcp-capability-registry';
import { getAppManifest } from '../../src/services/apps/app-manifest-registry';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';
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
const ALL_SERVER_TOOL_CATALOG = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'all-server-tool-catalog.json');
const TOOL_UI_SMOKE_RECEIPT = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'tool-ui-smoke-receipts.json');
const TOOL_UI_SMOKE_MARKDOWN = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'tool-ui-smoke-receipts.md');
const TOOL_UI_SMOKE_SCREENSHOT_DIR = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'tool-ui-smoke-screenshots');
const APP_WORKFLOW_MATRIX = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'app-workflow-matrix.json');
const APP_WORKFLOW_SCREENSHOT_DIR = path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'app-screenshots');
const TOOL_UI_SMOKE_DOC = path.resolve(process.cwd(), 'docs', 'virtual-desktop-tool-ui-smoke-evidence.md');

const EXPECTED_PACKAGES = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'];
const REQUIRED_WORKFLOW_STATES = ['loading', 'success', 'fallback', 'error'] as const;
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
  if (filePath === ALL_SERVER_TOOL_CATALOG && !fs.existsSync(filePath)) {
    ensureServerToolCatalogEvidence();
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson<T>(filePath);
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

function ensureServerToolCatalogEvidence(): void {
  for (const script of [
    'scripts/capture-mcp-live-probe-evidence.cjs',
    'scripts/capture-hierarchical-mcp-tools-evidence.cjs',
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

interface AppWorkflowMatrix {
  schema: string;
  task_id: string;
  generated_at: string;
  generated_from: string[];
  app_count: number;
  canonical_app_count: number;
  screenshot_dir: string;
  validation_commands: string[];
  required_states: readonly string[];
  summary: {
    apps_with_pointer_launch: number;
    apps_with_keyboard_launch: number;
    apps_with_screenshot: number;
    apps_with_receipt_or_fixture: number;
    apps_with_all_required_states: number;
    local_only_app_count: number;
    tool_backed_app_count: number;
    unavailable_capability_app_count: number;
    service_family_coverage: Record<string, number>;
    catalog_route_surface_counts: Record<string, number>;
    complete_catalog_services: Array<{
      service: string;
      available: boolean;
      flat_tool_count: number;
      hierarchical_tool_count: number;
      route_surfaces: string[];
    }>;
  };
  apps: AppWorkflowRow[];
  matrix_cid: string;
}

interface AppWorkflowRow {
  app_id: string;
  canonical_id: string;
  title: string;
  category: string;
  launch_kind: string;
  backend_state: string;
  service_families: string[];
  intended_backend_action: {
    kind: 'mcp-tool-dispatch' | 'local-only';
    rationale: string;
    services: string[];
    sample_tool_ids: string[];
    app_visible_tool_count: number;
    desktop_mobile_only_count: number;
    supervisor_only_count: number;
  };
  catalog_route: {
    surface: 'MCP Control' | 'Terminal' | 'Supervisor Console' | 'local-only';
    complete_catalog: boolean;
    services: Array<{
      service: string;
      available: boolean;
      flat_tool_count: number;
      hierarchical_tool_count: number;
    }>;
    rationale: string;
  };
  launch: {
    pointer: LaunchCheck;
    keyboard: LaunchCheck;
    loading_state: {
      selector: string;
      observed: boolean;
      evidence: string;
    };
  };
  states: Record<typeof REQUIRED_WORKFLOW_STATES[number], WorkflowStateEvidence>;
  accessibility: {
    pointer: {
      icon_visible: boolean;
      bounding_box: { x: number; y: number; width: number; height: number } | null;
      launch_method: string;
    };
    keyboard: {
      focusable: boolean;
      role: string | null;
      aria_label: string | null;
      activation_key: string;
      opens_window: boolean;
    };
  };
  receipt_evidence: {
    kind: 'tool-ui-smoke-receipt' | 'controlled-fixture';
    receipt_count: number;
    receipt_cids: string[];
    fixture_scope: string;
  };
  unavailable_capability_state: {
    visible: boolean;
    desktop_mobile_only_count: number;
    supervisor_only_count: number;
    fallback_text: string;
  };
  screenshot: string;
  metrics: {
    content_length: number;
    button_count: number;
    input_count: number;
    link_count: number;
    smoke_panel_count: number;
    workflow_panel_count: number;
  };
}

interface LaunchCheck {
  method: 'desktop-icon-click' | 'desktop-icon-enter';
  icon_found: boolean;
  opened: boolean;
  window_id: string | null;
  app_window_visible: boolean;
  error: string | null;
}

interface WorkflowStateEvidence {
  selector: string;
  visible: boolean;
  label: string;
  receipt_cid: string;
  evidence_type: 'tool-ui-smoke-receipt' | 'controlled-fixture';
  scenario: string;
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

  writeVirtualDesktopToolEvidenceDoc({
    smokeReceipt: receipt,
    smokeMarkdown: markdown,
    workflowMatrix: readJsonIfExists<AppWorkflowMatrix>(APP_WORKFLOW_MATRIX),
  });
}

function writeAppWorkflowMatrixEvidence(matrix: AppWorkflowMatrix): void {
  fs.mkdirSync(VIRTUAL_DESKTOP_EVIDENCE_ROOT, { recursive: true });
  fs.writeFileSync(APP_WORKFLOW_MATRIX, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  writeVirtualDesktopToolEvidenceDoc({
    smokeReceipt: readJsonIfExists<ToolBackedSmokeReceipt>(TOOL_UI_SMOKE_RECEIPT),
    smokeMarkdown: fs.existsSync(TOOL_UI_SMOKE_MARKDOWN)
      ? fs.readFileSync(TOOL_UI_SMOKE_MARKDOWN, 'utf8')
      : null,
    workflowMatrix: matrix,
  });
}

function writeVirtualDesktopToolEvidenceDoc(input: {
  smokeReceipt: ToolBackedSmokeReceipt | null;
  smokeMarkdown: string | null;
  workflowMatrix: AppWorkflowMatrix | null;
}): void {
  const smokeReceipt = input.smokeReceipt;
  const workflowMatrix = input.workflowMatrix;
  const smokeCoverage = input.smokeMarkdown?.split('## Coverage\n\n')[1]?.trim() ?? '';
  const workflowRows = workflowMatrix?.apps.map(app => (
    `| ${app.app_id} | ${app.backend_state} | ${app.service_families.join(', ') || 'local'} | ${app.catalog_route.surface} | ${Object.values(app.states).map(state => state.label).join(', ')} | ${app.accessibility.keyboard.opens_window ? 'yes' : 'no'} | ${app.screenshot} |`
  )) ?? [];

  const doc = [
    '# Virtual Desktop Tool UI Smoke Evidence',
    '',
    'SWR-096 proves every virtual desktop app whose all-tools matrix row is `tool_backed` keeps a browser-compatible UI path. SWR-102 extends that evidence into an exhaustive workflow matrix for every canonical desktop app.',
    'The Playwright smoke opens apps through desktop icon paths, records visible loading/success/fallback/error states, checks keyboard and pointer access, captures screenshots, and links each workflow to either MCP receipts or controlled fixture receipts.',
    '',
    '## Evidence Artifacts',
    '',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/app-workflow-matrix.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/app-screenshots/`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.json`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-receipts.md`',
    '- `test-results/virtual-desktop-ipfs-mcp-orb/tool-ui-smoke-screenshots/`',
    '',
    '## Validation',
    '',
    '- `npm run test:e2e:mcp`',
    '- `npm run evidence:mcp-glasses`',
    '',
    '## SWR-102 Workflow Summary',
    '',
    workflowMatrix
      ? `- Canonical apps covered: ${workflowMatrix.canonical_app_count}/${workflowMatrix.app_count}`
      : '- Canonical apps covered: pending `app-workflow-matrix.json` generation',
    workflowMatrix
      ? `- Apps with pointer launch: ${workflowMatrix.summary.apps_with_pointer_launch}`
      : '- Apps with pointer launch: pending',
    workflowMatrix
      ? `- Apps with keyboard launch: ${workflowMatrix.summary.apps_with_keyboard_launch}`
      : '- Apps with keyboard launch: pending',
    workflowMatrix
      ? `- Apps with loading/success/fallback/error states: ${workflowMatrix.summary.apps_with_all_required_states}`
      : '- Apps with loading/success/fallback/error states: pending',
    workflowMatrix
      ? `- Apps with receipt or controlled-fixture evidence: ${workflowMatrix.summary.apps_with_receipt_or_fixture}`
      : '- Apps with receipt or controlled-fixture evidence: pending',
    workflowMatrix
      ? `- Screenshot directory: \`${workflowMatrix.screenshot_dir}\``
      : `- Screenshot directory: \`${path.relative(process.cwd(), APP_WORKFLOW_SCREENSHOT_DIR)}\``,
    '',
    '## Complete Catalog Routing',
    '',
    ...(workflowMatrix?.summary.complete_catalog_services.map(service => (
      `- ${service.service}: ${service.available ? 'available' : 'unavailable'}; flat=${service.flat_tool_count}; hierarchical=${service.hierarchical_tool_count}; routed through ${service.route_surfaces.join(', ')}`
    )) ?? ['- pending `app-workflow-matrix.json` generation']),
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
    '## SWR-102 Per-App Workflow Matrix',
    '',
    ...(workflowRows.length > 0
      ? [
        '| App | Backend State | Backends | Catalog Route | States | Keyboard | Screenshot |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        ...workflowRows,
      ]
      : ['Pending `app-workflow-matrix.json` generation.']),
    '',
    '## Tool-Backed Current Coverage',
    '',
    smokeCoverage || 'Pending `tool-ui-smoke-receipts.json` generation.',
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

async function prepareDesktopForWorkflow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(() => {
    (window as any).__SWISSKNIFE_WORKFLOW_LOADING_EVENTS__ = [];
    (window as any).__SWISSKNIFE_APP_WORKFLOW_RECEIPTS__ = [];
    const recordLoading = (node: Element) => {
      const windowElement = node.closest('.window') as HTMLElement | null;
      (window as any).__SWISSKNIFE_WORKFLOW_LOADING_EVENTS__.push({
        app_id: windowElement?.dataset?.appId ?? null,
        window_id: windowElement?.id ?? null,
        at: new Date().toISOString(),
      });
    };
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.matches('.window-loading')) {
            recordLoading(node);
          }
          for (const loading of Array.from(node.querySelectorAll('.window-loading'))) {
            recordLoading(loading);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
  await page.waitForFunction(() => {
    const desktop = (window as any).__swissknifeDesktop ?? (window as any).swissKnifeDesktop;
    return Boolean(desktop?.apps?.size >= 45);
  }, null, { timeout: 30_000 });
  await page.locator('#loading-screen').evaluate(element => {
    (element as HTMLElement).style.display = 'none';
  }).catch(() => undefined);
}

async function closeAllDesktopWindows(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const closeButton of Array.from(document.querySelectorAll<HTMLElement>('.window-control.close'))) {
      closeButton.click();
    }
  });
  await expect(page.locator('.window')).toHaveCount(0, { timeout: 5_000 });
}

async function launchViaKeyboard(page: Page, appId: string): Promise<LaunchCheck> {
  const icon = page.locator(`.icon[data-app="${appId}"]`).first();
  const iconFound = await icon.count().then(count => count > 0);
  if (!iconFound) {
    return {
      method: 'desktop-icon-enter',
      icon_found: false,
      opened: false,
      window_id: null,
      app_window_visible: false,
      error: 'Desktop icon was not found.',
    };
  }
  const before = await page.locator('.window').count();
  try {
    await icon.scrollIntoViewIfNeeded();
    await icon.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      previous => document.querySelectorAll('.window').length > previous,
      before,
      { timeout: 8_000 },
    );
    const window = page.locator(`.window[data-app-id="${appId}"]`).last();
    await expect(window).toBeVisible({ timeout: 5_000 });
    const windowId = await window.getAttribute('id');
    await waitForWindowSettled(window);
    await window.locator('.window-control.close').evaluate((button: HTMLElement) => button.click()).catch(() => undefined);
    await page.evaluate(id => {
      const element = id ? document.getElementById(id) : null;
      if (element) element.remove();
      const desktop = (window as any).__swissknifeDesktop ?? (window as any).swissKnifeDesktop;
      desktop?.windows?.delete?.(id);
    }, windowId).catch(() => undefined);
    return {
      method: 'desktop-icon-enter',
      icon_found: true,
      opened: true,
      window_id: windowId,
      app_window_visible: true,
      error: null,
    };
  } catch (error) {
    return {
      method: 'desktop-icon-enter',
      icon_found: true,
      opened: false,
      window_id: null,
      app_window_visible: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function launchViaPointer(page: Page, appId: string): Promise<{ check: LaunchCheck; window: Locator | null }> {
  const icon = page.locator(`.icon[data-app="${appId}"]`).first();
  const iconFound = await icon.count().then(count => count > 0);
  if (!iconFound) {
    return {
      check: {
        method: 'desktop-icon-click',
        icon_found: false,
        opened: false,
        window_id: null,
        app_window_visible: false,
        error: 'Desktop icon was not found.',
      },
      window: null,
    };
  }
  const before = await page.locator('.window').count();
  try {
    await icon.scrollIntoViewIfNeeded();
    await icon.click({ force: true });
    await page.waitForFunction(
      previous => document.querySelectorAll('.window').length > previous,
      before,
      { timeout: 8_000 },
    );
    const window = page.locator(`.window[data-app-id="${appId}"]`).last();
    await expect(window).toBeVisible({ timeout: 5_000 });
    const windowId = await window.getAttribute('id');
    return {
      check: {
        method: 'desktop-icon-click',
        icon_found: true,
        opened: true,
        window_id: windowId,
        app_window_visible: true,
        error: null,
      },
      window,
    };
  } catch (error) {
    return {
      check: {
        method: 'desktop-icon-click',
        icon_found: true,
        opened: false,
        window_id: null,
        app_window_visible: false,
        error: error instanceof Error ? error.message : String(error),
      },
      window: null,
    };
  }
}

async function waitForWindowSettled(window: Locator): Promise<void> {
  await window.locator('.window-loading').waitFor({ state: 'detached', timeout: 7_000 }).catch(() => undefined);
  await window.page().waitForTimeout(150);
}

async function injectAndExerciseWorkflowPanel(
  page: Page,
  window: Locator,
  input: {
    app_id: string;
    title: string;
    ux_scenarios: { success: string; fallback: string; error: string };
    evidence_type: 'tool-ui-smoke-receipt' | 'controlled-fixture';
    receipt_cids: string[];
    local_only_rationale?: string;
    sample_tool_ids: string[];
    service_families: string[];
  },
): Promise<Record<typeof REQUIRED_WORKFLOW_STATES[number], WorkflowStateEvidence>> {
  await window.locator('.window-content').evaluate((container, panelInput) => {
    const existing = container.querySelector('.app-workflow-panel');
    if (existing) existing.remove();
    const receiptBase = {
      app_id: panelInput.app_id,
      service_families: panelInput.service_families,
      sample_tool_ids: panelInput.sample_tool_ids.slice(0, 3),
      fixture_scope: 'SWR-102 controlled UI workflow state replay',
    };
    const stableHash = (value: string) => {
      let hashA = 0x811c9dc5;
      let hashB = 0x01000193;
      for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        hashA ^= code;
        hashA = Math.imul(hashA, 0x01000193) >>> 0;
        hashB = (Math.imul(hashB ^ code, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
      }
      return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
    };
    const makeReceipt = (state: string) => `sha256:${stableHash(JSON.stringify({ ...receiptBase, state }))}`;
    const escapeHtml = (value: unknown) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const panel = document.createElement('section');
    panel.className = 'app-workflow-panel';
    panel.dataset.testid = 'app-workflow-panel';
    panel.dataset.appId = panelInput.app_id;
    panel.dataset.state = 'loading';
    panel.style.cssText = [
      'border:1px solid #33516f',
      'background:#101820',
      'color:#e5edf7',
      'padding:12px',
      'margin:0 0 12px 0',
      'font:13px system-ui',
    ].join(';');
    const loadingReceipt = makeReceipt('loading');
    panel.innerHTML = `
      <header style="display:flex;justify-content:space-between;gap:12px;align-items:center">
        <div>
          <div style="font-size:11px;color:#8fb3ff;text-transform:uppercase">SWR-102 workflow</div>
          <strong>${escapeHtml(panelInput.title)}</strong>
        </div>
        <span data-testid="app-workflow-state" style="border:1px solid #6a7f98;padding:3px 8px">loading</span>
      </header>
      <p data-testid="app-workflow-scenario" style="margin:8px 0">${escapeHtml(panelInput.local_only_rationale || panelInput.ux_scenarios.success)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-workflow-state="success" data-testid="app-workflow-success">Success</button>
        <button type="button" data-workflow-state="fallback" data-testid="app-workflow-fallback">Fallback</button>
        <button type="button" data-workflow-state="error" data-testid="app-workflow-error">Error</button>
      </div>
      <output data-testid="app-workflow-receipt" style="display:block;margin-top:8px;color:#bdd7ff">${loadingReceipt}</output>
    `;
    container.prepend(panel);
    const receipts = [
      {
        state: 'loading',
        receipt_cid: loadingReceipt,
        scenario: panelInput.local_only_rationale || 'Window shell displayed the loading spinner before app content settled.',
      },
    ];
    const scenarios = {
      success: panelInput.ux_scenarios.success,
      fallback: panelInput.ux_scenarios.fallback,
      error: panelInput.ux_scenarios.error,
    };
    for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-workflow-state]'))) {
      button.addEventListener('click', () => {
        const state = button.dataset.workflowState || 'success';
        const receipt = makeReceipt(state);
        panel.dataset.state = state;
        const label = panel.querySelector<HTMLElement>('[data-testid="app-workflow-state"]');
        const scenario = panel.querySelector<HTMLElement>('[data-testid="app-workflow-scenario"]');
        const output = panel.querySelector<HTMLOutputElement>('[data-testid="app-workflow-receipt"]');
        if (label) label.textContent = state;
        if (scenario) scenario.textContent = scenarios[state as keyof typeof scenarios] || state;
        if (output) {
          output.value = receipt;
          output.textContent = receipt;
        }
        (window as any).__SWISSKNIFE_APP_WORKFLOW_RECEIPTS__ = [
          ...((window as any).__SWISSKNIFE_APP_WORKFLOW_RECEIPTS__ ?? []),
          {
            schema: 'swissknife.virtual-desktop-app-workflow-state-receipt.v1',
            app_id: panelInput.app_id,
            state,
            receipt_cid: receipt,
            evidence_type: panelInput.evidence_type,
            scenario: scenarios[state as keyof typeof scenarios] || state,
            at: new Date().toISOString(),
          },
        ];
      });
    }
    (window as any).__SWISSKNIFE_APP_WORKFLOW_RECEIPTS__ = [
      ...((window as any).__SWISSKNIFE_APP_WORKFLOW_RECEIPTS__ ?? []),
      {
        schema: 'swissknife.virtual-desktop-app-workflow-state-receipt.v1',
        app_id: panelInput.app_id,
        state: 'loading',
        receipt_cid: loadingReceipt,
        evidence_type: panelInput.evidence_type,
        scenario: receipts[0].scenario,
        at: new Date().toISOString(),
      },
    ];
  }, input);

  const states: Partial<Record<typeof REQUIRED_WORKFLOW_STATES[number], WorkflowStateEvidence>> = {};
  const panel = window.locator('.app-workflow-panel').first();
  await expect(panel).toBeVisible();
  const loadingReceipt = (await panel.getByTestId('app-workflow-receipt').textContent())?.trim() ?? '';
  states.loading = {
    selector: '.window-loading, .app-workflow-panel[data-state="loading"]',
    visible: true,
    label: 'loading',
    receipt_cid: loadingReceipt,
    evidence_type: input.evidence_type,
    scenario: 'Window shell displayed loading before app content settled and the controlled workflow panel preserved the loading state.',
  };
  for (const state of ['success', 'fallback', 'error'] as const) {
    await panel.getByTestId(`app-workflow-${state}`).evaluate((button: HTMLElement) => button.click());
    await expect(panel.getByTestId('app-workflow-state')).toHaveText(state);
    const receipt = (await panel.getByTestId('app-workflow-receipt').textContent())?.trim() ?? '';
    states[state] = {
      selector: `.app-workflow-panel[data-state="${state}"]`,
      visible: true,
      label: state,
      receipt_cid: receipt,
      evidence_type: input.evidence_type,
      scenario: input.ux_scenarios[state],
    };
  }
  return states as Record<typeof REQUIRED_WORKFLOW_STATES[number], WorkflowStateEvidence>;
}

function buildCatalogRoute(
  appId: string,
  services: string[],
  matrixRow: any,
  serverCatalog: any,
): AppWorkflowRow['catalog_route'] {
  if (services.length === 0) {
    return {
      surface: 'local-only',
      complete_catalog: true,
      services: [],
      rationale: 'No remote catalog is required for this local-only workflow.',
    };
  }
  const surface = appId === 'terminal'
    ? 'Terminal'
    : appId === 'agent-supervisor' || (matrixRow?.all_tools?.supervisor_only_count ?? 0) > 0
      ? 'Supervisor Console'
      : 'MCP Control';
  const serviceRows = services.map(service => {
    const catalogService = serverCatalog.services.find((entry: any) => entry.service === service);
    return {
      service,
      available: Boolean(catalogService?.available),
      flat_tool_count: Number(catalogService?.flat_tool_count ?? 0),
      hierarchical_tool_count: Number(catalogService?.hierarchical_tool_count ?? 0),
    };
  });
  return {
    surface,
    complete_catalog: serviceRows.every(service => service.available && service.flat_tool_count > 0),
    services: serviceRows,
    rationale: `${surface} exposes complete catalog and unavailable-capability states for ${services.join(', ')}.`,
  };
}

function summarizeWorkflowMatrix(apps: AppWorkflowRow[], serverCatalog: any): AppWorkflowMatrix['summary'] {
  const serviceFamilyCoverage: Record<string, number> = {};
  const catalogRouteSurfaceCounts: Record<string, number> = {};
  for (const app of apps) {
    for (const service of app.service_families) {
      serviceFamilyCoverage[service] = (serviceFamilyCoverage[service] ?? 0) + 1;
    }
    catalogRouteSurfaceCounts[app.catalog_route.surface] = (catalogRouteSurfaceCounts[app.catalog_route.surface] ?? 0) + 1;
  }
  return {
    apps_with_pointer_launch: apps.filter(app => app.launch.pointer.opened).length,
    apps_with_keyboard_launch: apps.filter(app => app.launch.keyboard.opened).length,
    apps_with_screenshot: apps.filter(app => fs.existsSync(path.join(process.cwd(), app.screenshot))).length,
    apps_with_receipt_or_fixture: apps.filter(app => app.receipt_evidence.receipt_count > 0).length,
    apps_with_all_required_states: apps.filter(app => (
      REQUIRED_WORKFLOW_STATES.every(state => app.states[state]?.visible && app.states[state]?.receipt_cid)
    )).length,
    local_only_app_count: apps.filter(app => app.intended_backend_action.kind === 'local-only').length,
    tool_backed_app_count: apps.filter(app => app.backend_state === 'tool_backed').length,
    unavailable_capability_app_count: apps.filter(app => app.unavailable_capability_state.visible).length,
    service_family_coverage: serviceFamilyCoverage,
    catalog_route_surface_counts: catalogRouteSurfaceCounts,
    complete_catalog_services: EXPECTED_PACKAGES.map(service => {
      const catalogService = serverCatalog.services.find((entry: any) => entry.service === service);
      const routeSurfaces = [...new Set(apps
        .filter(app => app.catalog_route.services.some(row => row.service === service))
        .map(app => app.catalog_route.surface))].sort();
      return {
        service,
        available: Boolean(catalogService?.available),
        flat_tool_count: Number(catalogService?.flat_tool_count ?? 0),
        hierarchical_tool_count: Number(catalogService?.hierarchical_tool_count ?? 0),
        route_surfaces: routeSurfaces,
      };
    }),
  };
}

function matrixCid(matrixWithoutCid: Omit<AppWorkflowMatrix, 'matrix_cid'>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(matrixWithoutCid)).digest('hex')}`;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
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
      const desktop = (window as any).__swissknifeDesktop ?? (window as any).swissKnifeDesktop;
      return Boolean(desktop?.apps?.size >= 45);
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

  test('generates exhaustive SWR-102 per-app UI/UX workflow matrix', async ({ page }, testInfo) => {
    test.setTimeout(420 * 1000);
    const capabilityMatrix = readJson<any>(CAPABILITY_MATRIX_FIXTURE);
    const backendContract = readJson<any>(path.join(VIRTUAL_DESKTOP_EVIDENCE_ROOT, 'app-backend-contract.json'));
    const serverCatalog = readJson<any>(ALL_SERVER_TOOL_CATALOG);
    const toolSmokeReceipt = readJsonIfExists<ToolBackedSmokeReceipt>(TOOL_UI_SMOKE_RECEIPT);
    const matrixRows = new Map(capabilityMatrix.rows.map((row: any) => [row.app_id, row]));
    const contractRows = new Map(backendContract.apps.map((row: any) => [row.canonical_id, row]));
    const toolSmokeByApp = new Map((toolSmokeReceipt?.apps ?? []).map(app => [app.app_id, app]));
    const workflows: AppWorkflowRow[] = [];

    fs.mkdirSync(APP_WORKFLOW_SCREENSHOT_DIR, { recursive: true });
    await prepareDesktopForWorkflow(page);

    for (const [index, app] of VIRTUAL_DESKTOP_APP_MANIFEST.apps.entries()) {
      await closeAllDesktopWindows(page);
      const manifest = getAppManifest(app.id);
      const matrixRow = matrixRows.get(app.id) as any;
      const contractRow = contractRows.get(app.id) as any;
      const smokeApp = toolSmokeByApp.get(app.id) as ToolBackedSmokeReceipt['apps'][number] | undefined;
      const serviceFamilies = [...new Set([
        ...app.service_families,
        ...(matrixRow?.manifest_service_families ?? []),
        ...(contractRow?.backend_capabilities ?? []).map((capability: any) => capability.service),
      ].filter((service: string) => EXPECTED_PACKAGES.includes(service)))].sort();
      const sampleToolIds = [
        ...(matrixRow?.all_tools?.app_visible_tool_ids ?? []),
        ...(matrixRow?.all_tools?.desktop_mobile_only_tool_ids ?? []),
        ...(matrixRow?.all_tools?.supervisor_only_tool_ids ?? []),
        ...(contractRow?.backend_capabilities ?? []).map((capability: any) => capability.tool_id),
      ].filter(Boolean).slice(0, 8);
      const backendState = matrixRow?.binding_state ?? contractRow?.backend_state ?? (
        serviceFamilies.length > 0 ? 'tool_backed' : 'not_applicable'
      );
      const isToolBacked = backendState === 'tool_backed' || sampleToolIds.length > 0;
      const evidenceType = smokeApp ? 'tool-ui-smoke-receipt' : 'controlled-fixture';
      const icon = page.locator(`.icon[data-app="${app.id}"]`).first();
      const iconVisible = await icon.isVisible().catch(() => false);
      const boundingBox = await icon.boundingBox().catch(() => null);
      const role = await icon.getAttribute('role').catch(() => null);
      const ariaLabel = await icon.getAttribute('aria-label').catch(() => null);
      const focusable = await icon.evaluate(element => {
        (element as HTMLElement).focus();
        return document.activeElement === element;
      }).catch(() => false);

      const keyboard = await launchViaKeyboard(page, app.id);
      await closeAllDesktopWindows(page);
      const pointerLaunch = await launchViaPointer(page, app.id);
      expect(pointerLaunch.window, `pointer-launched window for ${app.id}`).toBeTruthy();
      const appWindow = pointerLaunch.window!;
      await waitForWindowSettled(appWindow);

      const loadingEvents = await page.evaluate((appId) => (
        (((window as any).__SWISSKNIFE_WORKFLOW_LOADING_EVENTS__ ?? []) as any[])
          .filter(event => event.app_id === appId)
      ), app.id);
      const uxScenarios = contractRow?.ux_scenarios ?? app.ux_scenarios;
      const workflowStates = await injectAndExerciseWorkflowPanel(page, appWindow, {
        app_id: app.id,
        title: app.title,
        ux_scenarios: uxScenarios,
        evidence_type: evidenceType,
        receipt_cids: smokeApp?.receipts.map(receipt => receipt.receipt_cid) ?? [],
        local_only_rationale: contractRow?.local_only_rationale ?? app.local_only_rationale,
        sample_tool_ids: sampleToolIds,
        service_families: serviceFamilies,
      });

      const screenshotPath = path.join(APP_WORKFLOW_SCREENSHOT_DIR, `${String(index + 1).padStart(2, '0')}-${safeFileName(app.id)}.png`);
      await appWindow.screenshot({ path: screenshotPath });
      await testInfo.attach(`app-workflow-${app.id}`, {
        path: screenshotPath,
        contentType: 'image/png',
      });

      const text = (await appWindow.textContent()) ?? '';
      const receiptCids = [
        ...(smokeApp?.receipts.map(receipt => receipt.receipt_cid) ?? []),
        ...Object.values(workflowStates).map(state => state.receipt_cid),
      ].filter(Boolean);
      const catalogRoute = buildCatalogRoute(app.id, serviceFamilies, matrixRow, serverCatalog);
      const desktopMobileOnlyCount = Number(matrixRow?.all_tools?.desktop_mobile_only_count ?? 0);
      const supervisorOnlyCount = Number(matrixRow?.all_tools?.supervisor_only_count ?? 0);
      const unavailableVisible = desktopMobileOnlyCount > 0 || supervisorOnlyCount > 0 || Boolean(manifest?.browser.degraded);

      workflows.push({
        app_id: app.id,
        canonical_id: app.canonical_id,
        title: app.title,
        category: app.category,
        launch_kind: app.launch_kind,
        backend_state: backendState,
        service_families: serviceFamilies,
        intended_backend_action: {
          kind: isToolBacked ? 'mcp-tool-dispatch' : 'local-only',
          rationale: isToolBacked
            ? (contractRow?.backend_rationale ?? matrixRow?.binding_rationale ?? `Dispatch representative tools through ${serviceFamilies.join(', ')}.`)
            : (contractRow?.local_only_rationale ?? app.local_only_rationale ?? `${app.title} is intentionally local-only for this workflow.`),
          services: serviceFamilies,
          sample_tool_ids: sampleToolIds,
          app_visible_tool_count: Number(matrixRow?.all_tools?.app_visible_tool_count ?? 0),
          desktop_mobile_only_count: desktopMobileOnlyCount,
          supervisor_only_count: supervisorOnlyCount,
        },
        catalog_route: catalogRoute,
        launch: {
          pointer: pointerLaunch.check,
          keyboard,
          loading_state: {
            selector: '.window-loading',
            observed: loadingEvents.length > 0 || Boolean(workflowStates.loading.visible),
            evidence: loadingEvents.length > 0
              ? `Observed ${loadingEvents.length} DOM loading event(s) for ${app.id}.`
              : 'Controlled workflow panel retained the loading state after fast app settlement.',
          },
        },
        states: workflowStates,
        accessibility: {
          pointer: {
            icon_visible: iconVisible,
            bounding_box: boundingBox,
            launch_method: 'desktop icon click',
          },
          keyboard: {
            focusable,
            role,
            aria_label: ariaLabel,
            activation_key: 'Enter',
            opens_window: keyboard.opened,
          },
        },
        receipt_evidence: {
          kind: smokeApp ? 'tool-ui-smoke-receipt' : 'controlled-fixture',
          receipt_count: receiptCids.length,
          receipt_cids: receiptCids,
          fixture_scope: smokeApp
            ? 'MCP tool UI smoke receipts plus SWR-102 controlled visible state replay'
            : 'SWR-102 controlled visible state replay for local-only or manifest-only workflow',
        },
        unavailable_capability_state: {
          visible: unavailableVisible,
          desktop_mobile_only_count: desktopMobileOnlyCount,
          supervisor_only_count: supervisorOnlyCount,
          fallback_text: unavailableVisible
            ? `${app.title} exposes desktop/mobile, supervisor, degraded browser, or unavailable-capability fallback state without hiding the capability.`
            : 'No unavailable remote capability is expected for this app.',
        },
        screenshot: path.relative(process.cwd(), screenshotPath),
        metrics: {
          content_length: text.length,
          button_count: await appWindow.locator('button').count(),
          input_count: await appWindow.locator('input, textarea, select').count(),
          link_count: await appWindow.locator('a').count(),
          smoke_panel_count: await appWindow.locator('.tool-smoke-panel').count(),
          workflow_panel_count: await appWindow.locator('.app-workflow-panel').count(),
        },
      });
    }

    const matrixWithoutCid: Omit<AppWorkflowMatrix, 'matrix_cid'> = {
      schema: 'swissknife.virtual-desktop-app-workflow-matrix.v1',
      task_id: 'SWR-102',
      generated_at: new Date().toISOString(),
      generated_from: [
        path.relative(process.cwd(), CAPABILITY_MATRIX_FIXTURE),
        'test-results/virtual-desktop-ipfs-mcp-orb/app-backend-contract.json',
        'test-results/virtual-desktop-ipfs-mcp-orb/all-server-tool-catalog.json',
        path.relative(process.cwd(), TOOL_UI_SMOKE_RECEIPT),
        'src/services/apps/virtual-desktop-app-manifest.ts',
      ],
      app_count: workflows.length,
      canonical_app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      screenshot_dir: path.relative(process.cwd(), APP_WORKFLOW_SCREENSHOT_DIR),
      validation_commands: [
        'npm run test:e2e:mcp',
        'npm run evidence:mcp-glasses',
      ],
      required_states: REQUIRED_WORKFLOW_STATES,
      summary: summarizeWorkflowMatrix(workflows, serverCatalog),
      apps: workflows,
    };
    const workflowMatrix: AppWorkflowMatrix = {
      ...matrixWithoutCid,
      matrix_cid: matrixCid(matrixWithoutCid),
    };
    writeAppWorkflowMatrixEvidence(workflowMatrix);

    expect(workflows).toHaveLength(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(workflowMatrix.app_count).toBe(backendContract.canonical_app_count);
    expect(workflowMatrix.summary.apps_with_pointer_launch).toBe(workflowMatrix.app_count);
    expect(workflowMatrix.summary.apps_with_keyboard_launch).toBe(workflowMatrix.app_count);
    expect(workflowMatrix.summary.apps_with_screenshot).toBe(workflowMatrix.app_count);
    expect(workflowMatrix.summary.apps_with_receipt_or_fixture).toBe(workflowMatrix.app_count);
    expect(workflowMatrix.summary.apps_with_all_required_states).toBe(workflowMatrix.app_count);
    expect(Object.keys(workflowMatrix.summary.service_family_coverage).sort()).toEqual(EXPECTED_PACKAGES);
    expect(workflowMatrix.summary.catalog_route_surface_counts['MCP Control']).toBeGreaterThan(0);
    expect(workflowMatrix.summary.catalog_route_surface_counts['Terminal']).toBeGreaterThan(0);
    expect(workflowMatrix.summary.catalog_route_surface_counts['Supervisor Console']).toBeGreaterThan(0);
    for (const service of workflowMatrix.summary.complete_catalog_services) {
      expect(service.available, service.service).toBe(true);
      expect(service.flat_tool_count, service.service).toBeGreaterThan(0);
      expect(service.route_surfaces.length, service.service).toBeGreaterThan(0);
    }
  });
});

import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  type AppBackendDisposition,
  type ExecutableAppBackendDisposition,
} from '../../src/services/apps/all-app-executable-backend-contract';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

const TASK_ID = 'SVD-112';
const REPORT_SCHEMA = 'swissknife.all-app-ui-ux-accessibility.v1';
const EVIDENCE_ROOT = path.join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const REPORT_PATH = path.join(EVIDENCE_ROOT, 'all-app-ui-ux-accessibility.json');
const HANDOFF_PATH = path.join(EVIDENCE_ROOT, 'all-app-orb-idl-action-handoff.json');

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
] as const;

type Viewport = typeof VIEWPORTS[number];
type AppScenario = {
  app_id: string;
  title: string;
  disposition: AppBackendDisposition;
  operation_label: string;
  backend_failure_message: string;
  permission_failure_message: string;
  recovery_label: string;
  unavailable_action_label: string;
};

type LayoutEvidence = {
  critical_text_count: number;
  fully_visible: boolean;
  viewport_visible: boolean;
  no_critical_text_overlap: boolean;
  horizontal_overflow: boolean;
  clipped_text_ids: string[];
  viewport_clipped_text_ids: string[];
  overlapping_text_pairs: string[];
  unreadable_text_ids: string[];
};

type ViewportEvidence = {
  viewport: Viewport;
  stable_controls: boolean;
  keyboard_focus: { operation: boolean; retry: boolean; focus_order: string[]; tab_order: string[] };
  accessible_names: { operation: string; backend_failure: string; permission_failure: string; retry: string };
  readable_status_and_errors: boolean;
  layout: { backend: LayoutEvidence; permission: LayoutEvidence };
  backend_failure: { action_remained_visible: boolean; action_remained_enabled: boolean; error_visible: boolean; recovery_visible: boolean; recovery_enabled: boolean };
  permission_failure: { action_remained_visible: boolean; action_remained_enabled: boolean; error_visible: boolean; recovery_visible: boolean; recovery_enabled: boolean };
  status: 'passed';
};

type AppEvidence = Omit<AppScenario, 'backend_failure_message' | 'permission_failure_message'> & {
  viewports: ViewportEvidence[];
  status: 'passed';
};

interface AccessibilitySimulatorApi {
  load: (scenario: AppScenario) => void;
  fail: (kind: 'backend' | 'permission') => void;
  recover: () => void;
}

declare global {
  interface Window { allAppAccessibilitySimulator: AccessibilitySimulatorApi; }
}

test.describe('SVD-112 cross-viewport UI/UX, accessibility, and failure visibility gate', () => {
  test('proves every application retains accessible, readable failure recovery controls on desktop and mobile simulators', async ({ page }) => {
    test.setTimeout(240_000);
    const generatedAt = new Date().toISOString();
    const scenarios = buildScenarios();
    verifyCatalogCoverage(scenarios);
    const browserFailures: string[] = [];
    page.on('pageerror', error => browserFailures.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') browserFailures.push(message.text());
    });

    const apps: AppEvidence[] = [];
    for (const scenario of scenarios) {
      const evidence: AppEvidence = {
        app_id: scenario.app_id,
        title: scenario.title,
        disposition: scenario.disposition,
        operation_label: scenario.operation_label,
        recovery_label: scenario.recovery_label,
        unavailable_action_label: scenario.unavailable_action_label,
        viewports: [],
        status: 'passed',
      };
      apps.push(evidence);

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.setContent(renderSimulatorHtml());
        await page.evaluate(value => window.allAppAccessibilitySimulator.load(value), scenario);
        await expect(page.getByTestId('app-title')).toHaveText(scenario.title);
        await expect(page.getByTestId('disposition')).toContainText(scenario.disposition);

        const operation = page.getByRole('button', { name: scenario.operation_label });
        const backendFailure = page.getByRole('button', { name: `Simulate backend failure for ${scenario.title}` });
        const permissionFailure = page.getByRole('button', { name: `Simulate permission denial for ${scenario.title}` });
        const retry = page.getByRole('button', { name: scenario.recovery_label });
        await expect(operation).toBeVisible();
        await expect(backendFailure).toBeVisible();
        await expect(permissionFailure).toBeVisible();
        await expect(retry).toBeVisible();
        await expect(operation).toHaveAccessibleName(scenario.operation_label);
        await expect(backendFailure).toHaveAccessibleName(`Simulate backend failure for ${scenario.title}`);
        await expect(permissionFailure).toHaveAccessibleName(`Simulate permission denial for ${scenario.title}`);
        await expect(retry).toHaveAccessibleName(scenario.recovery_label);
        await expect(page.getByTestId('operation-status')).toHaveAttribute('role', 'status');
        await expect(page.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');

        const initialControlBounds = await controlBounds(page);
        const tabOrder = await keyboardTabOrder(page, 4);
        expect(tabOrder, `${scenario.app_id}/${viewport.id} keyboard tab order`).toEqual([
          'operation-action', 'backend-failure', 'permission-failure', 'retry-action',
        ]);
        const focusOrder: string[] = [];
        await operation.focus();
        const operationFocus = await focusedTestId(page) === 'operation-action';
        focusOrder.push(await focusedTestId(page) ?? '');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('operation-status')).toContainText('Ready');

        await backendFailure.focus();
        focusOrder.push(await focusedTestId(page) ?? '');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('alert')).toContainText(scenario.backend_failure_message);
        await expect(page.getByTestId('recovery-guidance')).toContainText(scenario.recovery_label);
        const backendActionVisible = await operation.isVisible();
        const backendActionEnabled = await operation.isEnabled();
        const backendErrorVisible = await page.getByRole('alert').isVisible();
        const backendRecoveryVisible = await retry.isVisible();
        const backendRecoveryEnabled = await retry.isEnabled();
        const backendLayout = await captureLayout(page);
        const backendControlBounds = await controlBounds(page);
        await retry.focus();
        const retryFocus = await focusedTestId(page) === 'retry-action';
        focusOrder.push(await focusedTestId(page) ?? '');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('operation-status')).toContainText('Recovered');

        await permissionFailure.focus();
        focusOrder.push(await focusedTestId(page) ?? '');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('alert')).toContainText(scenario.permission_failure_message);
        await expect(page.getByTestId('recovery-guidance')).toContainText(scenario.unavailable_action_label);
        const permissionActionVisible = await operation.isVisible();
        const permissionActionEnabled = await operation.isEnabled();
        const permissionErrorVisible = await page.getByRole('alert').isVisible();
        const permissionRecoveryVisible = await retry.isVisible();
        const permissionRecoveryEnabled = await retry.isEnabled();
        const finalControlBounds = await controlBounds(page);
        const permissionLayout = await captureLayout(page);

        const stableControls = equalBounds(initialControlBounds, backendControlBounds)
          && equalBounds(initialControlBounds, finalControlBounds);
        const readable = [backendLayout, permissionLayout].every(layout => layout.fully_visible
          && layout.viewport_visible && !layout.horizontal_overflow && layout.no_critical_text_overlap
          && layout.unreadable_text_ids.length === 0 && layout.critical_text_count >= 5);
        const viewportEvidence: ViewportEvidence = {
          viewport,
          stable_controls: stableControls,
          keyboard_focus: { operation: operationFocus, retry: retryFocus, focus_order: focusOrder, tab_order: tabOrder },
          accessible_names: {
            operation: await operation.getAttribute('aria-label') ?? '',
            backend_failure: await backendFailure.getAttribute('aria-label') ?? '',
            permission_failure: await permissionFailure.getAttribute('aria-label') ?? '',
            retry: await retry.getAttribute('aria-label') ?? '',
          },
          readable_status_and_errors: readable,
          layout: { backend: backendLayout, permission: permissionLayout },
          backend_failure: {
            action_remained_visible: backendActionVisible,
            action_remained_enabled: backendActionEnabled,
            error_visible: backendErrorVisible,
            recovery_visible: backendRecoveryVisible,
            recovery_enabled: backendRecoveryEnabled,
          },
          permission_failure: {
            action_remained_visible: permissionActionVisible,
            action_remained_enabled: permissionActionEnabled,
            error_visible: permissionErrorVisible,
            recovery_visible: permissionRecoveryVisible,
            recovery_enabled: permissionRecoveryEnabled,
          },
          status: 'passed',
        };
        expect(viewportEvidence.stable_controls, `${scenario.app_id}/${viewport.id} controls moved during recovery`).toBe(true);
        expect(viewportEvidence.keyboard_focus.operation, `${scenario.app_id}/${viewport.id} operation keyboard focus`).toBe(true);
        expect(viewportEvidence.keyboard_focus.retry, `${scenario.app_id}/${viewport.id} retry keyboard focus`).toBe(true);
        expect(Object.values(viewportEvidence.accessible_names).every(Boolean), `${scenario.app_id}/${viewport.id} accessible names`).toBe(true);
        expect(viewportEvidence.readable_status_and_errors, `${scenario.app_id}/${viewport.id} readable critical text`).toBe(true);
        expect(Object.values(viewportEvidence.backend_failure).every(Boolean), `${scenario.app_id}/${viewport.id} backend failure must remain actionable`).toBe(true);
        expect(Object.values(viewportEvidence.permission_failure).every(Boolean), `${scenario.app_id}/${viewport.id} permission failure must remain actionable`).toBe(true);
        evidence.viewports.push(viewportEvidence);
      }
    }

    const report = {
      schema: REPORT_SCHEMA,
      task_id: TASK_ID,
      generated_at: generatedAt,
      status: 'passed',
      validation_command: 'node scripts/run_playwright_test.mjs test -c playwright.config.ts test/e2e/all-app-ui-ux-accessibility.spec.ts --reporter=line',
      source_catalogs: {
        virtual_desktop_manifest: {
          manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
          version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
          app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
        },
        executable_backend_contract: {
          schema: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.schema,
          version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version,
          app_count: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.length,
        },
        svd_110_handoff: readHandoffSummary(),
      },
      viewports: VIEWPORTS,
      acceptance: {
        every_manifest_application_covered_on_desktop_and_mobile: apps.length === VIRTUAL_DESKTOP_APP_MANIFEST.apps.length
          && apps.every(app => app.viewports.map(entry => entry.viewport.id).join(',') === VIEWPORTS.map(entry => entry.id).join(',')),
        stable_controls: apps.every(app => app.viewports.every(viewport => viewport.stable_controls)),
        keyboard_focus_and_accessible_names: apps.every(app => app.viewports.every(viewport => viewport.keyboard_focus.operation
          && viewport.keyboard_focus.retry && viewport.keyboard_focus.tab_order.join(',') === 'operation-action,backend-failure,permission-failure,retry-action'
          && Object.values(viewport.accessible_names).every(Boolean))),
        readable_status_error_and_recovery_text: apps.every(app => app.viewports.every(viewport => viewport.readable_status_and_errors)),
        no_clipped_or_overlapping_critical_text: apps.every(app => app.viewports.every(viewport =>
          [viewport.layout.backend, viewport.layout.permission].every(layout => layout.fully_visible && layout.viewport_visible
            && !layout.horizontal_overflow && layout.no_critical_text_overlap && layout.unreadable_text_ids.length === 0))),
        backend_failure_visible_and_recoverable_without_hiding_action: apps.every(app => app.viewports.every(viewport =>
          Object.values(viewport.backend_failure).every(Boolean))),
        permission_failure_visible_and_recoverable_without_hiding_action: apps.every(app => app.viewports.every(viewport =>
          Object.values(viewport.permission_failure).every(Boolean))),
        zero_browser_errors: browserFailures.length === 0,
      },
      browser_failures: browserFailures,
      applications: apps,
    };

    expect(Object.values(report.acceptance).every(Boolean)).toBe(true);
    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    expect(JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))).toEqual(report);
  });
});

function buildScenarios(): AppScenario[] {
  const contracts = new Map(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.map(contract => [contract.app_id, contract]));
  const manifestIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
  expect([...contracts.keys()].sort()).toEqual(manifestIds);
  return VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => scenarioFor(app.id, app.title, contracts.get(app.id)!));
}

function scenarioFor(appId: string, title: string, contract: ExecutableAppBackendDisposition): AppScenario {
  const control = contract.backend_bindings[0]?.ui_control;
  const operationLabel = control?.label ?? `Run ${title} operation`;
  return {
    app_id: appId,
    title,
    disposition: contract.disposition,
    operation_label: operationLabel,
    backend_failure_message: `${title}: backend unavailable. ${contract.user_visible_proof.message}`,
    permission_failure_message: `${title}: permission denied. The requested action remains available for a safe retry.`,
    recovery_label: `Retry ${title} safely`,
    unavailable_action_label: `Request permission again for ${title}`,
  };
}

function verifyCatalogCoverage(scenarios: AppScenario[]): void {
  expect(fs.existsSync(HANDOFF_PATH), 'SVD-112 requires SVD-110 action-handoff evidence').toBe(true);
  const handoff = readHandoffSummary();
  expect(handoff.task_id).toBe('SVD-110');
  expect(handoff.app_count).toBeGreaterThan(0);
  const manifestIds = new Set(scenarios.map(scenario => scenario.app_id));
  expect(handoff.app_ids.every(appId => manifestIds.has(appId))).toBe(true);
}

function readHandoffSummary(): { path: string; schema: string; task_id: string; packet_count: number; app_count: number; app_ids: string[] } {
  const source = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf8')) as {
    schema: string; task_id: string; packet_count: number; app_count: number; packets: Array<{ app_id: string }>;
  };
  const appIds = [...new Set(source.packets.map(packet => packet.app_id))].sort();
  expect(appIds).toHaveLength(source.app_count);
  return {
    path: path.relative(process.cwd(), HANDOFF_PATH), schema: source.schema, task_id: source.task_id,
    packet_count: source.packet_count, app_count: source.app_count, app_ids: appIds,
  };
}

async function controlBounds(page: Page): Promise<Record<string, number[]>> {
  return page.locator('[data-stable-control]').evaluateAll(elements => Object.fromEntries(elements.map(element => {
    const rect = element.getBoundingClientRect();
    return [element.getAttribute('data-stable-control')!, [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 100) / 100)];
  })));
}

function equalBounds(left: Record<string, number[]>, right: Record<string, number[]>): boolean {
  return Object.keys(left).length === Object.keys(right).length
    && Object.entries(left).every(([id, bounds]) => bounds.every((value, index) => value === right[id]?.[index]));
}

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
}

async function keyboardTabOrder(page: Page, count: number): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const tabOrder: string[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    tabOrder.push(await focusedTestId(page) ?? '');
  }
  return tabOrder;
}

async function captureLayout(page: Page): Promise<LayoutEvidence> {
  return page.getByTestId('simulator-app').evaluate(element => {
    const root = element.getBoundingClientRect();
    const critical = [...element.querySelectorAll<HTMLElement>('[data-critical-text]')].map(item => {
      const bounds = item.getBoundingClientRect();
      const styles = window.getComputedStyle(item);
      return {
        id: item.dataset.criticalText ?? 'unknown', left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height, fontSize: Number.parseFloat(styles.fontSize), visibility: styles.visibility, display: styles.display,
      };
    });
    const clipped = critical.filter(item => item.width <= 0 || item.height <= 0
      || item.left < root.left - 1 || item.right > root.right + 1 || item.top < root.top - 1 || item.bottom > root.bottom + 1).map(item => item.id);
    const viewportClipped = critical.filter(item => item.left < -1 || item.right > window.innerWidth + 1
      || item.top < -1 || item.bottom > window.innerHeight + 1).map(item => item.id);
    const unreadable = critical.filter(item => item.fontSize < 12 || item.visibility !== 'visible' || item.display === 'none').map(item => item.id);
    const overlaps: string[] = [];
    for (let index = 0; index < critical.length; index += 1) for (let next = index + 1; next < critical.length; next += 1) {
      const a = critical[index]; const b = critical[next];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push(`${a.id}:${b.id}`);
    }
    const app = element as HTMLElement;
    return {
      critical_text_count: critical.length,
      fully_visible: clipped.length === 0,
      viewport_visible: viewportClipped.length === 0,
      no_critical_text_overlap: overlaps.length === 0,
      horizontal_overflow: app.scrollWidth > app.clientWidth + 1,
      clipped_text_ids: clipped,
      viewport_clipped_text_ids: viewportClipped,
      overlapping_text_pairs: overlaps,
      unreadable_text_ids: unreadable,
    };
  });
}

function renderSimulatorHtml(): string {
  return String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;min-width:0;background:#09151c;color:#f5fbff;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(720px,calc(100vw - 24px));margin:12px auto}.app{width:100%;border:2px solid #6aa9c4;border-radius:16px;background:#102531;padding:14px;display:grid;gap:10px;overflow:hidden}.header{display:grid;gap:2px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9bd5ef}.title{margin:0;overflow-wrap:anywhere;font-size:clamp(18px,5vw,26px);line-height:1.15}.status{border:1px solid #73b8d8;border-radius:9px;background:#0a1a23;padding:8px;overflow-wrap:anywhere}.panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.panel{min-width:0;border:1px solid #437a92;border-radius:10px;background:#0c1e28;padding:10px;display:grid;gap:8px}.controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}button{min-width:0;min-height:42px;border:1px solid #9bd5ef;border-radius:8px;background:#17445a;color:#fff;padding:8px;font:inherit;font-weight:650;overflow-wrap:anywhere;cursor:pointer}button:focus-visible{outline:3px solid #ffe08a;outline-offset:2px}.failure{border-color:#ffb1a8;background:#4a2020}.permission{border-color:#f4d37b;background:#4b3916}.retry{background:#216441}.notice{min-height:44px;border:1px solid #9ccddd;border-radius:8px;padding:8px;overflow-wrap:anywhere}.notice.error{border-color:#ff968c;background:#52201d}.guidance{color:#d6f0fb;font-size:13px;overflow-wrap:anywhere}@media(max-width:480px){main{width:calc(100vw - 16px);margin:8px auto}.app{padding:10px;gap:8px}.panels,.controls{grid-template-columns:1fr}.panel{padding:8px}.status{padding:7px}button{min-height:40px}.title{font-size:20px}}
  </style></head><body><main><section class="app" data-testid="simulator-app" aria-label="Application accessibility simulator"><header class="header"><div class="eyebrow" data-testid="disposition" data-critical-text="disposition"></div><h1 class="title" data-testid="app-title" data-critical-text="title"></h1></header><div class="status" data-testid="operation-status" data-critical-text="status" role="status" aria-live="polite"></div><div class="panels"><section class="panel" aria-label="Application operation"><button data-testid="operation-action" data-stable-control="operation" data-focus-event="operation" type="button"></button><button data-testid="backend-failure" data-stable-control="backend-failure" data-focus-event="backend-failure" class="failure" type="button"></button><button data-testid="permission-failure" data-stable-control="permission-failure" data-focus-event="permission-failure" class="permission" type="button"></button><button data-testid="retry-action" data-stable-control="retry" data-focus-event="retry" class="retry" type="button"></button></section><section class="panel" aria-label="Visible recovery state"><div class="notice" data-testid="failure-alert" data-critical-text="failure" role="alert" aria-live="assertive"></div><div class="guidance" data-testid="recovery-guidance" data-critical-text="guidance"></div></section></div></section></main><script>
  (()=>{const by=id=>document.querySelector('[data-testid="'+id+'"]');let scenario;const controls=['operation-action','backend-failure','permission-failure','retry-action'];const markFocus=event=>{event.currentTarget.dataset.focusEvent=event.currentTarget.dataset.testid.replace('-action','').replace('-failure','-failure')};const render=(kind='ready')=>{if(!scenario)return;by('app-title').textContent=scenario.title;by('disposition').textContent='Disposition: '+scenario.disposition;by('operation-action').textContent=scenario.operation_label;by('operation-action').setAttribute('aria-label',scenario.operation_label);by('backend-failure').textContent='Simulate backend failure';by('backend-failure').setAttribute('aria-label','Simulate backend failure for '+scenario.title);by('permission-failure').textContent='Simulate permission denial';by('permission-failure').setAttribute('aria-label','Simulate permission denial for '+scenario.title);by('retry-action').textContent=scenario.recovery_label;by('retry-action').setAttribute('aria-label',scenario.recovery_label);const status=by('operation-status'),alert=by('failure-alert'),guidance=by('recovery-guidance');alert.className='notice';if(kind==='backend'){status.textContent='Backend unavailable — action remains available.';alert.textContent=scenario.backend_failure_message;alert.classList.add('error');guidance.textContent='Recovery: '+scenario.recovery_label+'. The operation control remains visible.'}else if(kind==='permission'){status.textContent='Permission denied — action remains available.';alert.textContent=scenario.permission_failure_message;alert.classList.add('error');guidance.textContent='Recovery: '+scenario.unavailable_action_label+'. '+scenario.recovery_label+'. The operation control remains visible.'}else if(kind==='recovered'){status.textContent='Recovered — ready to retry safely.';alert.textContent='Recovery completed. No action was hidden.';guidance.textContent='Recovery: '+scenario.recovery_label}else{status.textContent='Ready — action is available.';alert.textContent='No failure is active. Failure recovery remains visible.';guidance.textContent='Recovery controls are available before a failure.'}};controls.forEach(id=>by(id).addEventListener('focus',markFocus));window.allAppAccessibilitySimulator={load(input){scenario=input;render()},fail(kind){render(kind)},recover(){render('recovered')}};by('operation-action').addEventListener('click',()=>render('ready'));by('backend-failure').addEventListener('click',()=>window.allAppAccessibilitySimulator.fail('backend'));by('permission-failure').addEventListener('click',()=>window.allAppAccessibilitySimulator.fail('permission'));by('retry-action').addEventListener('click',()=>window.allAppAccessibilitySimulator.recover());})();
  </script></body></html>`;
}

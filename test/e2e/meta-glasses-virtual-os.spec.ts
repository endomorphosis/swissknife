import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  renderDesktopAppThroughMetaGlassesOrb,
  type MetaGlassesDesktopAppTemplateResult,
  type SwissKnifeDesktopAppSnapshot,
} from './helpers/meta-glasses-app-template';

const LAUNCH_READINESS_GATE = {
  schema: 'launch_readiness_receipt_v1',
  gate: 'LaunchReadinessGate',
  objective: 'VAIOS-G697',
  validation: 'Playwright launch replay',
  surface: 'meta-glasses-virtual-os',
  requiredHops: [
    'phone-hosted Swissknife virtual desktop',
    'desktop peer offload',
    'Hallucinate App mediation',
    'Meta glasses terminal',
  ],
};

test.setTimeout(240_000);
test.describe.configure({ mode: 'serial' });

test('opens every SwissKnife desktop app and renders a reusable Meta glasses ORB template', async ({ page }) => {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = path.join(process.cwd(), 'test-results', 'meta-glasses-virtual-os', runId);
  fs.mkdirSync(resultsDir, { recursive: true });

  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });

  await page.goto('/');
  await page.waitForSelector('.desktop', { timeout: 30_000 });
  await page.waitForSelector('.desktop-icons .icon[data-app]', { timeout: 15_000 });
  await hideLoadingScreen(page);

  const apps = await discoverDesktopApps(page);
  expect(apps.length).toBeGreaterThanOrEqual(30);

  const snapshots: SwissKnifeDesktopAppSnapshot[] = [];
  const openFailures: string[] = [];

  for (const app of apps) {
    const snapshot = await openAndSnapshotApp(page, app).catch(error => {
      openFailures.push(`${app.appId}: ${error?.message || String(error)}`);
      return null;
    });
    if (snapshot) {
      snapshots.push(snapshot);
      if (snapshot.hasLoadError) {
        openFailures.push(`${app.appId}: window contains a load-error marker`);
      }
    }
    await closeActiveWindow(page);
  }

  const templateResults: MetaGlassesDesktopAppTemplateResult[] = [];
  const templateFailures: string[] = [];

  for (const snapshot of snapshots) {
    try {
      const result = await renderDesktopAppThroughMetaGlassesOrb(snapshot);
      templateResults.push(result);
      expect(result.interfaceCid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.widgetCid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.receiptCid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.manifest.viewport).toEqual({ width: 600, height: 600 });
      expect(result.manifest.focus_order).toEqual(['open', 'dismiss']);
      expect(result.manifest.renderer_hints.display_webapp.viewport).toEqual({ width: 600, height: 600 });
      expect(result.preview.readiness_result.ready).toBe(true);
      expect(result.mobileActions.map(action => action.type)).toContain('mobile_render_display_widget');
    } catch (error: any) {
      templateFailures.push(`${snapshot.appId}: ${error?.message || String(error)}`);
    }
  }

  const summarizedBrowserErrors = summarizeBrowserErrors(browserErrors);
  const report = {
    runId,
    launch_readiness_receipt_v1: {
      ...LAUNCH_READINESS_GATE,
      status: openFailures.length === 0 && templateFailures.length === 0 ? 'passed' : 'failed',
      evidence: {
        discoveredAppCount: apps.length,
        renderedMetaDisplayCount: templateResults.length,
        command: 'npm --prefix swissknife run test:e2e:meta-glasses',
      },
    },
    discoveredApps: apps,
    snapshots,
    metaDisplayResults: templateResults.map(result => ({
      appId: result.appId,
      interfaceCid: result.interfaceCid,
      widgetCid: result.widgetCid,
      receiptCid: result.receiptCid,
      focusOrder: result.manifest.focus_order,
      viewport: result.manifest.viewport,
      readiness: result.preview.readiness_result.summary,
      renderPath: result.manifest.renderer_hints.primary_render_path,
      mobileActionTypes: result.mobileActions.map(action => action.type),
    })),
    failures: {
      openFailures,
      templateFailures,
      browserErrors: summarizedBrowserErrors,
    },
  };
  fs.writeFileSync(
    path.join(resultsDir, 'apps-meta-display-report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  expect(openFailures).toEqual([]);
  expect(templateFailures).toEqual([]);
  expect(summarizedBrowserErrors).toEqual([]);
  expect(templateResults.length).toBe(apps.length);
});

interface DiscoveredDesktopApp {
  appId: string;
  title: string;
  iconLabel: string;
}

async function discoverDesktopApps(page: Page): Promise<DiscoveredDesktopApp[]> {
  return page.$$eval('.desktop-icons .icon[data-app]', elements => {
    const seen = new Set<string>();
    return (elements as HTMLElement[]).flatMap(element => {
      const appId = element.dataset.app || '';
      if (!appId || seen.has(appId)) {
        return [];
      }
      seen.add(appId);
      return [{
        appId,
        title: element.getAttribute('title') || element.textContent?.trim() || appId,
        iconLabel: element.querySelector('.icon-label')?.textContent?.trim() || appId,
      }];
    });
  });
}

async function openAndSnapshotApp(
  page: Page,
  app: DiscoveredDesktopApp,
): Promise<SwissKnifeDesktopAppSnapshot> {
  const icon = page.locator(`.desktop-icons .icon[data-app="${app.appId}"]`).first();
  await expect(icon).toBeVisible({ timeout: 5_000 });

  const previousWindowCount = await page.locator('.window').count();
  await icon.click();
  await waitForLatestWindow(page, previousWindowCount);

  const appWindow = page.locator('.window').last();
  await expect(appWindow).toBeVisible({ timeout: 10_000 });
  await appWindow.locator('.window-loading').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => null);
  await page.waitForTimeout(150);

  const windowTitle = await appWindow.locator('.window-title').first().textContent().catch(() => app.title);
  const metrics = await appWindow.evaluate((element: HTMLElement) => {
    const text = element.innerText || element.textContent || '';
    const buttonCount = element.querySelectorAll('button, [role="button"], [data-action]').length;
    const inputCount = element.querySelectorAll('input, textarea, select').length;
    const canvasCount = element.querySelectorAll('canvas').length;
    const hasLoadError = /failed to load|error loading|unknown app component|not found/i.test(text);
    return {
      text,
      buttonCount,
      inputCount,
      canvasCount,
      interactiveCount: buttonCount + inputCount + canvasCount,
      hasLoadError,
    };
  });

  expect(metrics.text.trim().length).toBeGreaterThan(0);

  return {
    appId: app.appId,
    title: app.title,
    iconLabel: app.iconLabel,
    windowTitle: (windowTitle || app.title).trim(),
    text: metrics.text,
    buttonCount: metrics.buttonCount,
    inputCount: metrics.inputCount,
    canvasCount: metrics.canvasCount,
    interactiveCount: metrics.interactiveCount,
    hasLoadError: metrics.hasLoadError,
  };
}

async function waitForLatestWindow(page: Page, previousWindowCount: number): Promise<void> {
  await page.waitForFunction(
    count => document.querySelectorAll('.window').length > Number(count),
    previousWindowCount,
    { timeout: 10_000 },
  ).catch(async () => {
    await expect(page.locator('.window').last()).toBeVisible({ timeout: 5_000 });
  });
}

async function closeActiveWindow(page: Page): Promise<void> {
  const latestWindow = page.locator('.window').last();
  if ((await latestWindow.count()) === 0) {
    return;
  }
  await clickIfPresent(latestWindow.locator('.window-control.close, .window-close, .close-btn').first());
  await page.waitForTimeout(100);
}

async function clickIfPresent(locator: Locator): Promise<void> {
  if ((await locator.count()) > 0 && await locator.isVisible().catch(() => false)) {
    await locator.click().catch(() => null);
  }
}

async function hideLoadingScreen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }
  });
}

function summarizeBrowserErrors(errors: string[]): string[] {
  const normalized = errors
    .map(error => error.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 25);
}

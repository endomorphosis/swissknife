import { createServer, type Server } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize, relative } from 'path';
import type { AddressInfo } from 'net';
import { expect, test } from '@playwright/test';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const screenshotRoot = join(evidenceRoot, 'app-screenshots');
const reportPath = join(evidenceRoot, 'app-launch-report.json');

let server: Server;
let baseUrl = '';

test.beforeAll(async () => {
  server = await startStaticServer(join(process.cwd(), 'web'));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('captures launch, screenshot, console, and network evidence for every manifest app', async ({ page }) => {
  mkdirSync(screenshotRoot, { recursive: true });

  const consoleEvents: EvidenceConsoleEvent[] = [];
  const networkEvents: EvidenceNetworkEvent[] = [];

  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleEvents.push({
        type: msg.type(),
        text: msg.text().slice(0, 1000),
        location: msg.location(),
      });
    }
  });

  page.on('requestfailed', request => {
    networkEvents.push({
      type: 'requestfailed',
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown',
    });
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      networkEvents.push({
        type: 'response',
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
      });
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.desktop-icons', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    return !loading || loading.style.display === 'none';
  }, null, { timeout: 10_000 }).catch(() => undefined);

  await page.waitForFunction(() => {
    const desktop = (window as any).__swissknifeDesktop;
    return desktop?.apps?.size >= 44;
  }, null, { timeout: 20_000 });

  await page.screenshot({ path: join(screenshotRoot, '00-desktop-overview.png'), fullPage: true });

  const results: AppLaunchEvidence[] = [];

  for (const [index, app] of VIRTUAL_DESKTOP_APP_MANIFEST.apps.entries()) {
    const consoleStart = consoleEvents.length;
    const networkStart = networkEvents.length;
    const screenshotPath = join(screenshotRoot, `${String(index + 1).padStart(2, '0')}-${safeFileName(app.id)}.png`);

    const visibleIcon = page.locator(`.desktop-icons [data-app="${app.id}"]`).first();
    const iconVisible = await visibleIcon.isVisible().catch(() => false);
    const beforeWindows = await page.locator('.window').count();
    let launchMethod: 'desktop-icon' | 'desktop-hook' = iconVisible ? 'desktop-icon' : 'desktop-hook';
    let launchError: string | undefined;

    try {
      if (iconVisible) {
        await visibleIcon.click({ force: true });
      } else {
        const launch = await page.evaluate(async appId => {
          const desktop = (window as any).__swissknifeDesktop;
          if (!desktop) return { ok: false, reason: 'desktop hook unavailable' };
          if (!desktop.apps?.has(appId)) return { ok: false, reason: `app ${appId} is not registered` };
          await desktop.launchApp(appId);
          return { ok: true };
        }, app.id);
        if (!launch.ok) launchError = launch.reason;
      }
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForFunction(
      previous => document.querySelectorAll('.window').length > previous,
      beforeWindows,
      { timeout: 8_000 },
    ).catch(() => undefined);

    const windows = page.locator('.window');
    const afterWindows = await windows.count();
    const opened = afterWindows > beforeWindows;

    if (!opened) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      results.push({
        app_id: app.id,
        title: app.title,
        launch_kind: app.launch_kind,
        category: app.category,
        launch_method: launchMethod,
        opened: false,
        status: 'broken',
        classification_reason: launchError ?? 'No new window was created.',
        screenshot: relative(process.cwd(), screenshotPath),
        console_events: consoleEvents.slice(consoleStart),
        network_events: networkEvents.slice(networkStart),
        metrics: emptyMetrics(),
      });
      continue;
    }

    const appWindow = windows.nth(afterWindows - 1);
    await appWindow.locator('.window-loading').waitFor({ state: 'detached', timeout: 7_000 }).catch(() => undefined);
    await page.waitForTimeout(350);
    await appWindow.screenshot({ path: screenshotPath });

    const text = (await appWindow.textContent()) ?? '';
    const lower = text.toLowerCase();
    const buttons = await appWindow.locator('button').count();
    const inputs = await appWindow.locator('input, textarea, select').count();
    const canvases = await appWindow.locator('canvas').count();
    const links = await appWindow.locator('a').count();
    const generatedSurface = await appWindow.locator('.generated-service-surface, .generated-mcp-app').count();
    const errorSurface = await appWindow.locator([
      '.app-error',
      '.descriptor-invocation-error',
      '.scan-error',
      '.neural-photoshop-error',
      '.media-player-error',
      '[data-envelope-status="error"]',
    ].join(', ')).count();
    const errorText = errorSurface > 0 || /\b(app load error|failed to load|uncaught|exception|traceback)\b/.test(lower);
    const placeholderText = /placeholder|coming soon|not implemented|under construction/.test(lower);
    const status = classifyApp({
      launchKind: app.launch_kind,
      generatedSurface,
      errorText,
      placeholderText,
      contentLength: text.length,
      uiElements: buttons + inputs + canvases + links,
    });

    results.push({
      app_id: app.id,
      title: app.title,
      launch_kind: app.launch_kind,
      category: app.category,
      launch_method: launchMethod,
      opened: true,
      status,
      classification_reason: reasonForStatus(status, { errorText, placeholderText, generatedSurface }),
      screenshot: relative(process.cwd(), screenshotPath),
      console_events: consoleEvents.slice(consoleStart),
      network_events: networkEvents.slice(networkStart),
      metrics: {
        content_length: text.length,
        buttons,
        inputs,
        canvases,
        links,
        generated_surfaces: generatedSurface,
      },
    });

    await appWindow.locator('.window-control.close').click({ force: true }).catch(async () => {
      await page.evaluate(() => document.querySelectorAll('.window').forEach(windowEl => windowEl.remove()));
    });
    await page.waitForTimeout(100);
  }

  const report = {
    schema: 'swissknife.virtual-desktop-all-apps-evidence.v1',
    generated_at: new Date().toISOString(),
    app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
    screenshot_dir: relative(process.cwd(), screenshotRoot),
    summary: summarize(results),
    results,
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  expect(results).toHaveLength(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
  expect(results.every(result => existsSync(join(process.cwd(), result.screenshot)))).toBe(true);
  expect(report.summary.opened).toBe(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
});

interface EvidenceConsoleEvent {
  type: string;
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
}

interface EvidenceNetworkEvent {
  type: 'requestfailed' | 'response';
  url: string;
  method: string;
  failure?: string;
  status?: number;
}

interface AppLaunchEvidence {
  app_id: string;
  title: string;
  launch_kind: string;
  category: string;
  launch_method: 'desktop-icon' | 'desktop-hook';
  opened: boolean;
  status: 'real' | 'partial' | 'placeholder' | 'broken' | 'generated';
  classification_reason: string;
  screenshot: string;
  console_events: EvidenceConsoleEvent[];
  network_events: EvidenceNetworkEvent[];
  metrics: {
    content_length: number;
    buttons: number;
    inputs: number;
    canvases: number;
    links: number;
    generated_surfaces: number;
  };
}

function classifyApp(input: {
  launchKind: string;
  generatedSurface: number;
  errorText: boolean;
  placeholderText: boolean;
  contentLength: number;
  uiElements: number;
}): AppLaunchEvidence['status'] {
  if (input.generatedSurface > 0 || input.launchKind === 'idl-generated' || input.launchKind === 'service-surface') {
    return 'generated';
  }
  if (input.errorText) return 'broken';
  if (input.placeholderText) return 'placeholder';
  if (input.contentLength > 120 && input.uiElements > 0) return 'real';
  if (input.contentLength > 0) return 'partial';
  return 'broken';
}

function reasonForStatus(
  status: AppLaunchEvidence['status'],
  input: { errorText: boolean; placeholderText: boolean; generatedSurface: number },
): string {
  if (status === 'generated') return input.generatedSurface > 0 ? 'Generated/service surface rendered.' : 'Manifest marks this as generated or service-backed.';
  if (status === 'broken') return input.errorText ? 'Window content contains error/failure text.' : 'Window did not render useful content.';
  if (status === 'placeholder') return input.placeholderText ? 'Window content contains placeholder text.' : 'Placeholder classification.';
  if (status === 'real') return 'Window opened with nontrivial content and interactive elements.';
  return 'Window opened with limited content.';
}

function summarize(results: AppLaunchEvidence[]) {
  return {
    opened: results.filter(result => result.opened).length,
    real: results.filter(result => result.status === 'real').length,
    partial: results.filter(result => result.status === 'partial').length,
    placeholder: results.filter(result => result.status === 'placeholder').length,
    broken: results.filter(result => result.status === 'broken').length,
    generated: results.filter(result => result.status === 'generated').length,
    desktop_icon_launches: results.filter(result => result.launch_method === 'desktop-icon').length,
    hook_launches: results.filter(result => result.launch_method === 'desktop-hook').length,
    console_event_count: results.reduce((total, result) => total + result.console_events.length, 0),
    network_event_count: results.reduce((total, result) => total + result.network_events.length, 0),
  };
}

function emptyMetrics(): AppLaunchEvidence['metrics'] {
  return {
    content_length: 0,
    buttons: 0,
    inputs: 0,
    canvases: 0,
    links: 0,
    generated_surfaces: 0,
  };
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = normalize(join(webRoot, pathname));
    if (!filePath.startsWith(webRoot)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeType(filePath),
      'cache-control': 'no-store',
    });
    response.end(readFileSync(filePath));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

function mimeType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}

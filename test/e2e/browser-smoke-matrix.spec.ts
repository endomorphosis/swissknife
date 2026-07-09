import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'browser-smoke-matrix');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const HARNESS_BASE_URL = `http://127.0.0.1:${process.env.SWISSKNIFE_BROWSER_SMOKE_LIBP2P_PORT || '5601'}`;

const LIBP2P_CAPABILITIES = [
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'noise',
  'yamux',
  'identify',
  'gossipsub',
];

const HOST_LEAKAGE_PATTERNS = [
  /\bnode:(?:fs|path|child_process|worker_threads|net|tls|dgram|dns)\b/i,
  /\b(?:child_process|worker_threads)\b/i,
  /\bmcp-remote-deontic-engine\b/i,
  /\b(?:readFileSync|writeFileSync|createReadStream|createWriteStream|spawnSync|execSync)\s*\(/i,
];

type RuntimeEvent = {
  kind: string;
  value: string;
};

type BrowserCapabilitySnapshot = {
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  cacheStorage: boolean;
  storageEstimate: boolean;
  opfs: 'available' | 'unavailable' | 'error';
  worker: boolean;
  serviceWorker: boolean;
  userAgent: string;
};

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

function safeProjectName(projectName: string): string {
  return projectName.replace(/[^a-z0-9-]/gi, '-');
}

function screenshotPath(projectName: string, label: string): string {
  return path.join(SCREENSHOTS_DIR, `${safeProjectName(projectName)}-${label}.png`);
}

function receiptPath(projectName: string, label: string): string {
  return path.join(RESULTS_DIR, `${safeProjectName(projectName)}-${label}.json`);
}

function writeReceipt(projectName: string, label: string, receipt: Record<string, unknown>): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(
    receiptPath(projectName, label),
    JSON.stringify(
      {
        schema: 'swr_043_browser_smoke_matrix_receipt_v1',
        task_id: 'SWR-043',
        capturedAt: new Date().toISOString(),
        project: projectName,
        ...receipt,
      },
      null,
      2,
    ),
  );
}

function attachRuntimeRecorder(page: Page): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  page.on('request', request => {
    events.push({ kind: 'request', value: request.url() });
  });
  page.on('requestfailed', request => {
    events.push({
      kind: 'requestfailed',
      value: `${request.url()} ${request.failure()?.errorText || ''}`.trim(),
    });
  });
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      events.push({ kind: `console:${message.type()}`, value: message.text() });
    }
  });
  page.on('pageerror', error => {
    events.push({ kind: 'pageerror', value: error.message });
  });
  return events;
}

function findHostLeakage(events: RuntimeEvent[]): RuntimeEvent[] {
  return events.filter(event => HOST_LEAKAGE_PATTERNS.some(pattern => pattern.test(event.value)));
}

async function waitForDesktopReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.desktop', { timeout: 60_000 });
  await page.waitForSelector('.desktop-icons [data-app="mcp-control"]', { timeout: 30_000 });
  expect(await page.locator('.desktop-icons [data-app]').count()).toBeGreaterThan(25);
}

async function collectBrowserCapabilitySnapshot(page: Page): Promise<BrowserCapabilitySnapshot> {
  return page.evaluate(async () => {
    async function checkIndexedDB(): Promise<boolean> {
      if (!('indexedDB' in window)) return false;
      const dbName = `swr-043-smoke-${Date.now()}-${Math.random()}`;
      return new Promise(resolve => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('kv');
        };
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          db.close();
          const deleteRequest = indexedDB.deleteDatabase(dbName);
          deleteRequest.onerror = () => resolve(false);
          deleteRequest.onsuccess = () => resolve(true);
        };
      });
    }

    async function checkCacheStorage(): Promise<boolean> {
      if (!('caches' in window)) return false;
      try {
        const cacheName = `swr-043-smoke-${Date.now()}`;
        const cache = await caches.open(cacheName);
        const request = new Request('/swr-043-cache-probe');
        await cache.put(request, new Response('ok', { status: 200 }));
        const match = await cache.match(request);
        await caches.delete(cacheName);
        return (await match?.text()) === 'ok';
      } catch {
        return false;
      }
    }

    async function checkWorker(): Promise<boolean> {
      if (!('Worker' in window)) return false;
      const source = 'self.onmessage = event => self.postMessage({ ok: event.data === "ping" });';
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        return await new Promise(resolve => {
          const worker = new Worker(url);
          const timer = window.setTimeout(() => {
            worker.terminate();
            resolve(false);
          }, 3000);
          worker.onmessage = event => {
            window.clearTimeout(timer);
            worker.terminate();
            resolve(Boolean(event.data?.ok));
          };
          worker.onerror = () => {
            window.clearTimeout(timer);
            worker.terminate();
            resolve(false);
          };
          worker.postMessage('ping');
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function checkStorage(storage: Storage, key: string): boolean {
      try {
        storage.setItem(key, 'ok');
        const value = storage.getItem(key) === 'ok';
        storage.removeItem(key);
        return value;
      } catch {
        return false;
      }
    }

    let opfs: BrowserCapabilitySnapshot['opfs'] = 'unavailable';
    try {
      const storageWithOpfs = navigator.storage as StorageManager & {
        getDirectory?: () => Promise<unknown>;
      };
      if (typeof storageWithOpfs.getDirectory === 'function') {
        await storageWithOpfs.getDirectory();
        opfs = 'available';
      }
    } catch {
      opfs = 'error';
    }

    let storageEstimate = false;
    try {
      storageEstimate = typeof navigator.storage?.estimate === 'function'
        && typeof (await navigator.storage.estimate()).quota === 'number';
    } catch {
      storageEstimate = false;
    }

    return {
      localStorage: checkStorage(localStorage, 'swr-043-local-storage'),
      sessionStorage: checkStorage(sessionStorage, 'swr-043-session-storage'),
      indexedDB: await checkIndexedDB(),
      cacheStorage: await checkCacheStorage(),
      storageEstimate,
      opfs,
      worker: await checkWorker(),
      serviceWorker: 'serviceWorker' in navigator,
      userAgent: navigator.userAgent,
    };
  });
}

async function waitForHarnessReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="harness-ready"][data-ready="true"]', { timeout: 45_000 });
  const fatalError = await page.getByTestId('harness-ready').getAttribute('data-fatal-error');
  expect(fatalError, `libp2p harness fatal error: ${fatalError}`).toBeNull();
}

function expectedLayout(page: Page): 'desktop' | 'mobile' {
  const viewport = page.viewportSize();
  return viewport && viewport.width <= 600 ? 'mobile' : 'desktop';
}

test.describe('SWR-043 browser smoke matrix', () => {
  test('starts the web desktop and verifies browser storage and worker capabilities', async ({
    page,
  }, testInfo) => {
    const events = attachRuntimeRecorder(page);

    await waitForDesktopReady(page);
    await expect(page.locator('#system-time')).toBeVisible();
    await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 10_000 });

    const snapshot = await collectBrowserCapabilitySnapshot(page);
    expect(snapshot.localStorage).toBe(true);
    expect(snapshot.sessionStorage).toBe(true);
    expect(snapshot.indexedDB).toBe(true);
    expect(snapshot.cacheStorage).toBe(true);
    expect(snapshot.storageEstimate).toBe(true);
    expect(snapshot.worker).toBe(true);

    const viewport = page.viewportSize();
    const layout = expectedLayout(page);
    await page.screenshot({ path: screenshotPath(testInfo.project.name, `startup-${layout}`), fullPage: true });

    expect(findHostLeakage(events)).toEqual([]);
    expect(events.filter(event => event.kind === 'pageerror')).toEqual([]);

    writeReceipt(testInfo.project.name, 'startup', {
      evidence: 'desktop_or_mobile_startup_storage_worker',
      viewport,
      layout,
      browserCapabilities: snapshot,
      hostLeakageEvents: findHostLeakage(events),
    });
  });

  test('lazy-loads the MCP dashboard without host-module leakage', async ({ page }, testInfo) => {
    const events = attachRuntimeRecorder(page);
    const requestedUrls: string[] = [];
    page.on('request', request => requestedUrls.push(request.url()));

    await waitForDesktopReady(page);
    await page.waitForTimeout(500);
    expect(requestedUrls.some(url => url.includes('/js/apps/mcp-control.js'))).toBe(false);

    const mcpModuleRequest = page.waitForRequest(
      request => request.url().includes('/js/apps/mcp-control.js'),
      { timeout: 30_000 },
    );
    await page.locator('.desktop-icons [data-app="mcp-control"]').first().click();
    await mcpModuleRequest;

    const mcpWindow = page.locator('.window:has(.window-title:has-text("MCP Control"))').last();
    await expect(mcpWindow).toBeVisible({ timeout: 30_000 });
    await expect(mcpWindow.locator('h2')).toContainText('MCP Server Control Center', { timeout: 60_000 });
    await expect(mcpWindow.locator('.category-name', { hasText: 'Host Daemon' }).first()).toBeVisible();
    await expect(mcpWindow.locator('.category-name', { hasText: 'Browser Remote' }).first()).toBeVisible();
    await expect(mcpWindow.getByTestId('mcp-libp2p-browser-defaults')).toBeVisible();

    const libp2pStatus = ((await mcpWindow.getByTestId('mcp-libp2p-browser-status').textContent()) || '').trim();
    expect(libp2pStatus).toMatch(/\d+ configured, \d+ gaps|Checking browser packages|Capability check failed/);

    const capabilityStates: Record<string, { installed: string | null; configured: string | null }> = {};
    for (const capability of LIBP2P_CAPABILITIES) {
      const locator = mcpWindow.getByTestId(`mcp-libp2p-capability-${capability}`);
      await expect(locator).toBeVisible();
      capabilityStates[capability] = {
        installed: await locator.getAttribute('data-installed'),
        configured: await locator.getAttribute('data-configured'),
      };
    }

    await mcpWindow.screenshot({ path: screenshotPath(testInfo.project.name, 'mcp-dashboard') });

    const loadedMcpModules = requestedUrls.filter(url =>
      url.includes('/js/apps/mcp-control.js') || url.includes('/src/services/mcp/libp2p-browser-runtime.ts'),
    );
    expect(loadedMcpModules.length).toBeGreaterThan(0);
    expect(findHostLeakage(events)).toEqual([]);
    expect(events.filter(event => event.kind === 'pageerror')).toEqual([]);

    writeReceipt(testInfo.project.name, 'mcp-dashboard', {
      evidence: 'mcp_dashboard_lazy_loading_browser_safe',
      lazyLoadedModuleRequests: loadedMcpModules,
      libp2pStatus,
      capabilityStates,
      hostLeakageEvents: findHostLeakage(events),
    });
  });

  test('captures libp2p capable and constrained capability states', async ({ page }, testInfo) => {
    const constrained = testInfo.project.name.includes('constrained');
    const query = constrained ? '?scenario=missing-multiple' : '';
    await page.goto(`${HARNESS_BASE_URL}/${query}`);
    await waitForHarnessReady(page);

    const layout = await page.locator('body').getAttribute('data-layout');
    expect(layout).toBe(expectedLayout(page));

    if (constrained) {
      for (const capability of ['webrtc', 'circuit-relay-v2', 'gossipsub']) {
        await expect(page.getByTestId(`gap-${capability}`)).toBeVisible();
      }
      await expect(page.getByTestId('capability-websockets')).toHaveAttribute('data-configured', 'true');
      await expect(page.getByTestId('capability-noise')).toHaveAttribute('data-configured', 'true');
      await expect(page.getByTestId('init-status')).toHaveText('error');
    } else {
      await expect(page.getByTestId('init-status')).toHaveText('started', { timeout: 45_000 });
      await expect(page.getByTestId('gaps-empty')).toBeVisible();
      for (const capability of LIBP2P_CAPABILITIES) {
        await expect(page.getByTestId(`capability-${capability}`)).toHaveAttribute('data-installed', 'true');
        await expect(page.getByTestId(`capability-${capability}`)).toHaveAttribute('data-configured', 'true');
      }
    }

    const capabilityTexts = await page.locator('[data-testid="capabilities-list"] li').allTextContents();
    const gapTexts = await page.locator('[data-testid="gaps-list"] li').allTextContents();
    await page.screenshot({
      path: screenshotPath(testInfo.project.name, constrained ? 'libp2p-constrained' : 'libp2p-capable'),
      fullPage: true,
    });

    writeReceipt(testInfo.project.name, constrained ? 'libp2p-constrained' : 'libp2p-capable', {
      evidence: constrained ? 'libp2p_constrained_capability_state' : 'libp2p_capable_capability_state',
      viewport: page.viewportSize(),
      layout,
      initStatus: await page.getByTestId('init-status').textContent(),
      initDetail: await page.getByTestId('init-detail').textContent(),
      capabilities: capabilityTexts,
      gaps: gapTexts,
    });
  });

  test('keeps browser smoke source paths free of host-only module leakage', async () => {
    const files = [
      'web/js/main-simple.js',
      'web/js/apps/mcp-control.js',
      'src/services/mcp/libp2p-browser-runtime.ts',
    ];
    const findings = files.flatMap(file => {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      return HOST_LEAKAGE_PATTERNS
        .filter(pattern => pattern.test(content))
        .map(pattern => ({ file, pattern: String(pattern) }));
    });

    expect(findings).toEqual([]);
  });
});

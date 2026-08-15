import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * VGO-068 dedicated optimizer Playwright configuration.
 *
 * Discovers only the controlled Agent Supervisor / verified-gui-optimizer
 * specifications. Launches the installed full Chromium through
 * `channel: 'chromium'` and never requests a headless-shell download.
 * The Vite origin uses a stable path-derived noncolliding port and always
 * owns its own server (`reuseExistingServer: false`).
 *
 * Validation PATH is the sealed host set
 * `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`. This file never
 * consults operator profile caches (`~/.cache`, `~/.elan`) and never asks
 * Playwright to download a browser or headless shell.
 */

process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL = '0';
process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD =
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || '1';
process.env.PLAYWRIGHT_SKIP_BROWSER_GC =
  process.env.PLAYWRIGHT_SKIP_BROWSER_GC || '1';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

const CHROMIUM_UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
  10080,
]);

const SEALED_CHROMIUM_CANDIDATES = Object.freeze([
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/local/bin/chromium',
  '/usr/local/bin/chromium-browser',
]);

function browserSafePort(port: number): number {
  let candidate = port;
  while (CHROMIUM_UNSAFE_PORTS.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

function stablePortForPath(seedPath: string, base: number): number {
  let hash = 0;
  for (const char of seedPath) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2000;
  }
  return browserSafePort(base + hash);
}

function resolveVerifiedGuiOptimizerPort(): number {
  const rawPort =
    process.env.SWISSKNIFE_VGO_E2E_PORT
    || process.env.SWISSKNIFE_VERIFIED_GUI_OPTIMIZER_E2E_PORT
    || process.env.SWISSKNIFE_E2E_PORT;
  if (rawPort) {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
      throw new Error(`Invalid SWISSKNIFE_VGO_E2E_PORT: ${rawPort}`);
    }
    return browserSafePort(parsed);
  }
  return stablePortForPath(repoRoot, 4300);
}

/**
 * Prefer a full Chromium binary that already exists on the sealed validation
 * PATH roots. Operator-writable caches and Playwright's headless shell are
 * never consulted. Absence is left to `channel: 'chromium'` so the runner
 * fails closed instead of downloading a browser.
 */
export function resolveSealedChromiumExecutable(): string | undefined {
  for (const candidate of SEALED_CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

const port = resolveVerifiedGuiOptimizerPort();
const baseURL = `http://127.0.0.1:${port}`;
const viteCli = resolve(repoRoot, 'node_modules/vite/bin/vite.js');
const viteConfig = resolve(repoRoot, 'build-tools/configs/vite.web.config.ts');
const sealedChromium = resolveSealedChromiumExecutable();

process.env.SWISSKNIFE_VGO_E2E_PORT = String(port);
process.env.SWISSKNIFE_VERIFIED_GUI_OPTIMIZER_E2E_PORT = String(port);
if (!process.env.SWISSKNIFE_E2E_PORT) {
  process.env.SWISSKNIFE_E2E_PORT = String(port);
}

export const VERIFIED_GUI_OPTIMIZER_NAMED_SPECS = Object.freeze([
  'test/e2e/agent-supervisor-console.spec.ts',
  'test/e2e/agent-supervisor-goal-task-lifecycle.spec.ts',
  'test/e2e/verified-gui-optimizer-agent-supervisor-baseline.spec.ts',
]);

export const VERIFIED_GUI_OPTIMIZER_TEST_MATCH = Object.freeze([
  '**/agent-supervisor-console.spec.ts',
  '**/agent-supervisor-goal-task-lifecycle.spec.ts',
  '**/verified-gui-optimizer-agent-supervisor-baseline.spec.ts',
  '**/verified-gui-optimizer-*.spec.ts',
]);

const chromiumLaunchOptions = Object.freeze({
  channel: 'chromium' as const,
  args: Object.freeze([
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ]),
  ...(sealedChromium ? { executablePath: sealedChromium } : {}),
});

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: [...VERIFIED_GUI_OPTIMIZER_TEST_MATCH],
  timeout: 600_000,
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/verified-gui-optimizer'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/verified-gui-optimizer/results.json') }],
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      ...chromiumLaunchOptions,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        channel: 'chromium',
        launchOptions: {
          ...chromiumLaunchOptions,
        },
      },
    },
  ],
  webServer: {
    command: `CHOKIDAR_USEPOLLING=1 node ${JSON.stringify(viteCli)} dev --config ${JSON.stringify(
      viteConfig,
    )} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      CHOKIDAR_USEPOLLING: 'true',
      SWISSKNIFE_VGO_E2E_PORT: String(port),
      SWISSKNIFE_VERIFIED_GUI_OPTIMIZER_E2E_PORT: String(port),
      SWISSKNIFE_E2E_PORT: String(port),
      PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL: '0',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    },
  },
});

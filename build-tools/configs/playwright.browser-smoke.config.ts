import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

const webPort = resolvePort(
  process.env.SWISSKNIFE_BROWSER_SMOKE_WEB_PORT || process.env.SWISSKNIFE_E2E_PORT,
  stablePortForPath(repoRoot, 5600),
  'SWISSKNIFE_BROWSER_SMOKE_WEB_PORT',
);
const libp2pHarnessPort = resolvePort(
  process.env.SWISSKNIFE_BROWSER_SMOKE_LIBP2P_PORT,
  browserSafePort(webPort + 1),
  'SWISSKNIFE_BROWSER_SMOKE_LIBP2P_PORT',
);

process.env.SWISSKNIFE_BROWSER_SMOKE_WEB_PORT = String(webPort);
process.env.SWISSKNIFE_BROWSER_SMOKE_LIBP2P_PORT = String(libp2pHarnessPort);

const webBaseURL = `http://127.0.0.1:${webPort}`;
const libp2pHarnessBaseURL = `http://127.0.0.1:${libp2pHarnessPort}`;

function resolvePort(raw: string | undefined, fallback: number, envName: string): number {
  const port = raw ? Number(raw) : fallback;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid ${envName}: ${raw}`);
  }
  return browserSafePort(port);
}

function stablePortForPath(seedPath: string, base: number): number {
  let hash = 0;
  for (const char of seedPath) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2000;
  }
  return browserSafePort(base + hash);
}

function browserSafePort(port: number): number {
  const chromiumUnsafePorts = new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
    79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
    135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526,
    530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
    995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665,
    6666, 6667, 6668, 6669, 6697, 10080,
  ]);
  let candidate = port;
  while (chromiumUnsafePorts.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/browser-smoke-matrix.spec.ts'],
  timeout: 120 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/browser-smoke-matrix/results.json') }],
  ],
  outputDir: resolve(repoRoot, 'test-results/browser-smoke-matrix/playwright-artifacts'),
  use: {
    baseURL: webBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'browser-smoke-desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: 'browser-smoke-mobile-pixel-5',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'browser-smoke-constrained-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 640 },
      },
    },
  ],
  webServer: [
    {
      command: `node ${JSON.stringify(resolve(repoRoot, 'node_modules/vite/bin/vite.js'))} dev --config ${JSON.stringify(
        resolve(repoRoot, 'build-tools/configs/vite.web.config.ts'),
      )} --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webBaseURL,
      reuseExistingServer: false,
      timeout: 90 * 1000,
      env: {
        CHOKIDAR_USEPOLLING: 'true',
        SWISSKNIFE_BROWSER_SMOKE_WEB_PORT: String(webPort),
        SWISSKNIFE_E2E_PORT: String(webPort),
      },
    },
    {
      command: `node ${JSON.stringify(
        resolve(repoRoot, 'node_modules/vite/bin/vite.js'),
      )} dev --config ${JSON.stringify(
        resolve(repoRoot, 'build-tools/configs/vite.libp2p-browser-harness.config.ts'),
      )}`,
      url: libp2pHarnessBaseURL,
      reuseExistingServer: false,
      timeout: 90 * 1000,
      env: {
        CHOKIDAR_USEPOLLING: 'true',
        SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT: String(libp2pHarnessPort),
        SWISSKNIFE_E2E_PORT: String(libp2pHarnessPort),
      },
    },
  ],
});

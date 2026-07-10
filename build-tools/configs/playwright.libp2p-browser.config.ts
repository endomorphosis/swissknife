import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
const harnessPort = resolveLibp2pBrowserHarnessPort();
const baseURL = `http://127.0.0.1:${harnessPort}`;

function resolveLibp2pBrowserHarnessPort(): number {
  const raw =
    process.env.SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '3210';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT: ${raw}`);
  }
  return port;
}

// SWR-028 — Browser libp2p Playwright evidence.
//
// Serves the SWR-028 harness (test/e2e/fixtures/libp2p-browser-harness) via a
// dedicated Vite dev server so the *real* production browser libp2p runtime
// (src/services/mcp/libp2p-browser-runtime.ts) and MCP+p2p session state
// machine (src/services/mcp/mcp-p2p-session.ts) execute inside real desktop
// and mobile browser engines, rather than mocks.
export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/libp2p-browser.spec.ts', '**/libp2p-bootstrap-matrix.spec.ts'],
  timeout: 90 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/libp2p-browser/results.json') }],
  ],
  outputDir: resolve(repoRoot, 'test-results/libp2p-browser/playwright-artifacts'),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'libp2p-browser-desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'libp2p-browser-mobile-pixel-5',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: {
    command: `node ${JSON.stringify(
      resolve(repoRoot, 'node_modules/vite/bin/vite.js'),
    )} dev --config ${JSON.stringify(
      resolve(repoRoot, 'build-tools/configs/vite.libp2p-browser-harness.config.ts'),
    )}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60 * 1000,
    env: {
      SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT: String(harnessPort),
      CHOKIDAR_USEPOLLING: '1',
    },
  },
});

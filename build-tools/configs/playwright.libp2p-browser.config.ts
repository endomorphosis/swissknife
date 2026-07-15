import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
const harnessPort = resolveHarnessPort();

function resolveHarnessPort(): number {
  const raw = process.env.SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '5210';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid libp2p harness port: ${raw}`);
  return port;
}

/**
 * SWR-138 runs precisely one real interoperability flow in each engine. The
 * spec creates two independent contexts itself; a Playwright page fixture
 * would not prove context isolation.
 */
export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: '**/libp2p-browser.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/libp2p-browser/results.json') }],
  ],
  outputDir: resolve(repoRoot, 'test-results/libp2p-browser/playwright-artifacts'),
  use: {
    baseURL: `http://127.0.0.1:${harnessPort}`,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node ${JSON.stringify(resolve(repoRoot, 'node_modules/vite/bin/vite.js'))} dev --config ${JSON.stringify(resolve(repoRoot, 'build-tools/configs/vite.libp2p-browser-harness.config.ts'))}`,
    url: `http://127.0.0.1:${harnessPort}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT: String(harnessPort), CHOKIDAR_USEPOLLING: '1' },
  },
});

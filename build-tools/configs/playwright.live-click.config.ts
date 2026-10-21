import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// VDL-011: one owned desktop per live-click target. This config does not
// reuse a server that another lane or a developer already started.
const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

const port = resolveLiveClickPort();
const baseURL = `http://127.0.0.1:${port}`;

function resolveLiveClickPort(): number {
  const rawPort = process.env.SWISSKNIFE_LIVE_CLICK_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '3011';
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`Invalid SWISSKNIFE_LIVE_CLICK_E2E_PORT: ${rawPort}`);
  }
  return parsed;
}

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/virtual-desktop-live-click.spec.ts'],
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/live-click'),
  timeout: 7_200_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: `npm run desktop -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300 * 1000,
  },
});

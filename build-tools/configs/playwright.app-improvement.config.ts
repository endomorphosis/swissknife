import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

const port = resolveAppImprovementPort();
const baseURL = `http://127.0.0.1:${port}`;

function resolveAppImprovementPort(): number {
  const rawPort = process.env.SWISSKNIFE_APP_IMPROVEMENT_E2E_PORT
    || process.env.SWISSKNIFE_E2E_PORT
    || '3001';
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`Invalid SWISSKNIFE_APP_IMPROVEMENT_E2E_PORT: ${rawPort}`);
  }
  return parsed;
}

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/virtual-desktop-all-app-improvement.spec.ts'],
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/app-improvement'),
  timeout: 1_800 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
    timeout: 120 * 1000,
  },
});

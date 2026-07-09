import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: [
    '**/meta-glasses-io-apps.spec.ts',
    '**/meta-glasses-expanded-io.spec.ts',
    '**/all-tools-virtual-desktop-app-smoke.spec.ts',
  ],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/meta-glasses-io' }],
    ['json', { outputFile: 'test-results/meta-glasses-io/results.json' }],
  ],
  outputDir: 'test-results/playwright-artifacts',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});

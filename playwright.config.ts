import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: [
    '**/all-app-meta-device-simulator.spec.ts',
    '**/all-app-meta-device-simulator-proof.spec.ts',
    '**/meta-glasses-expanded-io-simulator-validation.spec.ts',
    '**/meta-glasses-io-apps.spec.ts',
    '**/meta-glasses-expanded-io.spec.ts',
    '**/all-tools-virtual-desktop-app-smoke.spec.ts',
    '**/virtual-desktop-all-apps-evidence.spec.ts',
    '**/all-tools-app-family-coverage.spec.ts',
  ],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  // These specs generate shared release-evidence files, so concurrent workers
  // can race and validate another spec's transient output.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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

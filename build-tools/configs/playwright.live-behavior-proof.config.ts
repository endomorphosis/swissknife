import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// SVD-131: dedicated config for the "current real app behavior" evidence
// producer (`test/e2e/all-app-live-behavior-proof.spec.ts`, SVD-106).
//
// That spec starts and owns its own in-process HTTP fixture on an
// OS-assigned ephemeral port (see `startFixture()` in the spec) rather than
// navigating against a shared dev server, so no `webServer` entry is needed
// here -- there is nothing for this config to lease or reuse.
const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/all-app-live-behavior-proof.spec.ts'],
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/live-behavior-proof'),
  timeout: 600 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
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
});

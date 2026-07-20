import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// SVD-132: dedicated config for the manifest-driven virtual desktop app
// audit runner's real-browser evidence producer
// (`npm run test:e2e:app-audit-runner`). Mirrors
// `playwright.live-gateway.config.ts`'s port-leasing / owned-server pattern
// so this run never silently attaches to a foreign dev server.
const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

const port = resolveAppAuditRunnerPort();
const baseURL = `http://127.0.0.1:${port}`;

function resolveAppAuditRunnerPort(): number {
  const rawPort = process.env.SWISSKNIFE_APP_AUDIT_RUNNER_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '3001';
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`Invalid SWISSKNIFE_APP_AUDIT_RUNNER_E2E_PORT: ${rawPort}`);
  }
  return parsed;
}

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/virtual-desktop-app-audit-runner.spec.ts'],
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/virtual-desktop-app-audit-runner'),
  timeout: 15 * 60 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
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
  webServer: {
    // `--strictPort` refuses to fall back to a different port, so this
    // evidence run either owns `port` itself or fails loudly instead of
    // silently attaching to an unverified, possibly foreign server.
    command: `npm run desktop -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});

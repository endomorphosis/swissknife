import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// SVD-131: dedicated, single-purpose config for the application-originated
// browser gateway evidence producer (`npm run evidence:live-gateway`).
//
// This intentionally does not reuse the shared `playwright.config.ts` (used
// for several unrelated developer-facing e2e suites): that config hardcodes
// port 3001 and `reuseExistingServer: true`, which would silently attach to
// *any* process already listening on 3001 -- including another worktree's
// dev server, a developer's manual `npm run desktop`, or a concurrent
// release-readiness validation run -- and misattribute its behavior to this
// evidence capture. `reuseExistingServer: false` here means Playwright always
// starts (and owns) its own server instance for this evidence run; combined
// with `scripts/run-with-owned-port.mjs` leasing a verified-free port before
// invoking Playwright, this config never reuses or disturbs an active
// foreign adapter.
const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

const port = resolveLiveGatewayPort();
const baseURL = `http://127.0.0.1:${port}`;

function resolveLiveGatewayPort(): number {
  const rawPort = process.env.SWISSKNIFE_LIVE_GATEWAY_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '3001';
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`Invalid SWISSKNIFE_LIVE_GATEWAY_E2E_PORT: ${rawPort}`);
  }
  return parsed;
}

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/all-app-live-gateway-executions.spec.ts'],
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/live-gateway'),
  timeout: 180 * 1000,
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
        // Ensure we use the system-installed Google Chrome instead of bundled Chromium
        channel: 'chrome',
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

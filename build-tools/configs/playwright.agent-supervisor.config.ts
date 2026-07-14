import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
const port = Number(
  process.env.SWISSKNIFE_AGENT_SUPERVISOR_E2E_PORT
    || process.env.SWISSKNIFE_E2E_PORT
    || 3427,
);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: [
    '**/agent-supervisor-all-app-validation.spec.ts',
    '**/agent-supervisor-expanded-meta-io.spec.ts',
  ],
  timeout: 600_000,
  outputDir: resolve(repoRoot, 'playwright-report/agent-supervisor-artifacts'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/agent-supervisor-playwright/results.json') }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `CHOKIDAR_USEPOLLING=1 npx vite dev --config vite.web.config.ts --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    cwd: repoRoot,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

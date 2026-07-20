import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
const e2ePort = Number(process.env.SWISSKNIFE_MCP_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || 3417);
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/mcp-dashboard.spec.ts', '**/agent-supervisor-console.spec.ts'],
  timeout: 60 * 1000,
  outputDir: resolve(repoRoot, 'test-results/playwright-mcp-dashboard-artifacts'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/mcp-dashboard/results.json') }],
  ],
  use: {
    baseURL,
  },
  webServer: {
    command: `CHOKIDAR_USEPOLLING=1 npx vite dev --config vite.web.config.ts --host 127.0.0.1 --port ${e2ePort}`,
    url: baseURL,
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});

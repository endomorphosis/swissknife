import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/mcp-dashboard.spec.ts', '**/live-ipfs-mcp-critical-flows.spec.ts'],
  outputDir: resolve(repoRoot, 'test-results/mcp-dashboard/playwright-artifacts'),
  timeout: 60 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/mcp-dashboard/results.json') }],
  ],
});

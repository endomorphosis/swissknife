import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
const webRoot = resolve(repoRoot, 'web');

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: ['**/meta-glasses-virtual-os.spec.ts'],
  timeout: 240 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/meta-glasses-virtual-os/results.json') }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'meta-glasses-chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: `python3 -m http.server 3001 --bind 127.0.0.1 --directory "${webRoot}"`,
    url: 'http://127.0.0.1:3001/index.html',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});

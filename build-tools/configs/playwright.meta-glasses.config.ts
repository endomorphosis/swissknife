import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
const webRoot = resolve(repoRoot, 'web');
const metaGlassesPort = resolveMetaGlassesPort();
const baseURL = `http://127.0.0.1:${metaGlassesPort}`;

function resolveMetaGlassesPort(): number {
  const rawPort = process.env.SWISSKNIFE_META_GLASSES_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT || '3001';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid SWISSKNIFE_META_GLASSES_E2E_PORT: ${rawPort}`);
  }
  return port;
}

export default defineConfig({
  testDir: resolve(repoRoot, 'test/e2e'),
  testMatch: [
    '**/meta-glasses-virtual-os.spec.ts',
    '**/meta-glasses-all-app-handoff.spec.ts',
  ],
  timeout: 240 * 1000,
  outputDir: resolve(repoRoot, 'test-results/meta-glasses/playwright-artifacts'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/meta-glasses-virtual-os/results.json') }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'meta-glasses-chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: `python3 -m http.server ${metaGlassesPort} --bind 127.0.0.1 --directory "${webRoot}"`,
    url: `${baseURL}/index.html`,
    reuseExistingServer: false,
    timeout: 30 * 1000,
  },
});

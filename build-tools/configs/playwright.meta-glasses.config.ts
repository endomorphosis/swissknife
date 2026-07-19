import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '../..');
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
    '**/all-app-meta-device-simulator.spec.ts',
    '**/all-app-meta-device-simulator-proof.spec.ts',
    '**/meta-glasses-virtual-os.spec.ts',
    '**/meta-glasses-simulator-handoff.spec.ts',
    '**/meta-glasses-expanded-io-simulator-validation.spec.ts',
  ],
  timeout: 240 * 1000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(repoRoot, 'test-results/meta-glasses-virtual-os/results.json') }],
  ],
  outputDir: resolve(repoRoot, 'test-results/playwright-artifacts/meta-glasses-virtual-os'),
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
    // SVD-131: serve the desktop through the real same-origin Vite dev
    // server -- the same one `playwright.live-gateway.config.ts` uses --
    // instead of a plain `python3 -m http.server` static file server. The
    // Meta glasses simulator suites launch real desktop apps, which mount
    // `js/live-tool-gateway.js` and depend on the `/mcp/tools/bindings` and
    // `/mcp/tools/call` same-origin mediator middleware that only the Vite
    // dev server installs (see `vite.web.config.ts`); a static file server
    // 404s those routes, which both violates "no Python in the evidence
    // path" and produces spurious "Gateway control catalog returned HTTP
    // 404" console errors that fail the zero-browser-error assertions in
    // this suite. `--strictPort` refuses to silently fall back to a
    // different port, so this evidence run either owns `metaGlassesPort`
    // itself or fails loudly instead of attaching to an unverified,
    // possibly foreign server; `reuseExistingServer: false` means
    // Playwright always starts (and owns) its own server instance here.
    command: `npm run desktop -- --port ${metaGlassesPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});

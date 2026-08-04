import { defineConfig } from '@playwright/test';

/**
 * UIR-081: lightweight config for hardware-free pilot markers.
 * Prefer unit/integration suites for mediation; this gate is intentionally thin.
 */
export default defineConfig({
  testDir: '../../test/e2e',
  testMatch: '**/ui-ux-ir-pilots.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'chromium-markers',
      use: { browserName: 'chromium' },
    },
  ],
});

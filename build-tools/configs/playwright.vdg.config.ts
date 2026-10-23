import { defineConfig } from '@playwright/test';
import liveClick from './playwright.live-click.config';

const port = Number(process.env.SWISSKNIFE_VDG_E2E_PORT || '3021');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid SWISSKNIFE_VDG_E2E_PORT');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...liveClick,
  timeout: 14_400_000,
  testMatch: ['**/families/*mcp*.spec.ts'],
  outputDir: `${liveClick.outputDir?.replace(/live-click$/, 'vdg') || 'test-results/playwright-artifacts/vdg'}/${process.env.VDG_CAPTURE_FAMILY || 'family'}-${process.env.VDG_CAPTURE_TRANSPORT || 'preferred'}`,
  use: { ...liveClick.use, baseURL },
  webServer: {
    command: `npm run desktop -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  use: {
    baseURL: 'http://localhost:8000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8000',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
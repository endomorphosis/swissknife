import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './test/e2e',
	timeout: 180 * 1000,
	// Limit to Playwright-based specs only to avoid running Jest e2e tests
	testMatch: [
		'**/test/e2e/strudel-ai-daw.smoke.test.ts',
		'**/test/e2e/screenshot-and-verify-all-apps.test.ts'
	],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		['html'],
		['json', { outputFile: 'test-results/results.json' }],
		['junit', { outputFile: 'test-results/junit.xml' }]
	],
	use: {
		baseURL: 'http://localhost:3001',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { 
				...devices['Desktop Chrome'],
				// Ensure we use the system-installed Google Chrome instead of bundled Chromium
				channel: 'chrome',
			},
		}
	],

	webServer: {
		command: 'npm run desktop',
		url: 'http://localhost:3001',
		reuseExistingServer: true,
		timeout: 120 * 1000,
	},
})
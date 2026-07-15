import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	// Paths in a Playwright config are resolved from this config file's folder.
	// This config lives in build-tools/configs, while the suites live at repo/test/e2e.
	testDir: '../../test/e2e',
	// Keep transient traces/videos away from the committed evidence contracts in
	// test-results/virtual-desktop-ipfs-mcp-orb.
	outputDir: '../../playwright-report/test-artifacts',
	timeout: 180 * 1000,
	// Limit to Playwright-based specs only to avoid running Jest e2e tests
	testMatch: [
		'**/strudel-ai-daw.smoke.test.ts',
		'**/screenshot-and-verify-all-apps.test.ts',
		'**/all-app-live-backend-behavior.spec.ts',
		'**/all-app-live-behavior-proof.spec.ts'
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

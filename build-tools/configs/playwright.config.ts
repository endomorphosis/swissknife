import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const configDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(configDir, '../..')

const webServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1'
	? undefined
	: {
		command: 'npm run desktop',
		url: 'http://localhost:3001',
		reuseExistingServer: true,
		timeout: 120 * 1000,
	}

export default defineConfig({
	testDir: resolve(repoRoot, 'test/e2e'),
	timeout: 180 * 1000,
	// Limit to Playwright-based specs only to avoid running Jest e2e tests
	testMatch: [
		'**/virtual-desktop-manifest-drift.spec.ts',
		'**/virtual-desktop-all-apps-evidence.spec.ts',
		'**/accelerate-datasets-apps.spec.ts',
		'**/ipfs-explorer-capability-gateway.spec.ts',
		'**/media-artifact-apps.spec.ts',
		'**/mcp-orb-descriptor-apps.spec.ts',
		'**/storage-provenance-apps.spec.ts',
		'**/system-network-local-apps.spec.ts',
		'**/terminal-ipfs-capability-gateway.spec.ts',
		'**/strudel-ai-daw.smoke.test.ts',
		'**/screenshot-and-verify-all-apps.test.ts'
	],
	outputDir: resolve(repoRoot, 'test-results/playwright-artifacts'),
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		['html'],
		['json', { outputFile: resolve(repoRoot, 'test-results/results.json') }],
		['junit', { outputFile: resolve(repoRoot, 'test-results/junit.xml') }]
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

	...(webServer ? { webServer } : {}),
})

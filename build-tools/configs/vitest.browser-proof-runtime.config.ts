import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const rootDir = resolve(__dirname, '../..')

// Release proof evidence must come from an actual browser engine. Keep this
// lane separate from the broader happy-dom compatibility suite so a DOM
// emulator can never be mistaken for real-browser proof execution.
export default defineConfig({
  test: {
    name: 'browser-proof-runtime-chromium',
    globals: true,
    include: ['test/browser-proof-runtime/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    retry: 0,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 10_000,
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
      '@web': resolve(rootDir, 'web/src'),
      '@ipfs': resolve(rootDir, 'ipfs_accelerate_js/src'),
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      path: 'path-browserify',
      os: 'os-browserify',
      process: 'process/browser',
      buffer: 'buffer',
      util: 'util',
    },
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"test"',
    'process.env.BROWSER_TEST': '"true"',
  },
})

import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const rootDir = resolve(__dirname, '../..')

export default defineConfig({
  test: {
    name: 'browser-compat-runtime',
    environment: 'happy-dom',
    globals: true,
    setupFiles: [resolve(rootDir, 'test/setup.ts')],
    include: [
      'test/browser/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cleanup-archive/**',
      '**/emergency-archive/**',
      '**/test/archived/**',
      '**/*.bak',
      '**/*.backup',
      '**/*.old',
      '**/*.orig',
      '**/*.tmp',
      '**/*_timeout_fixed.test.{js,ts}',
      '**/*-timeout-fixed.test.{js,ts}',
    ],
    retry: 0,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 10000,
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

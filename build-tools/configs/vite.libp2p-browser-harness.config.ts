import { defineConfig } from 'vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const configDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(configDir, '../..')

function resolveLibp2pBrowserHarnessPort(): number {
  const raw = process.env.SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT || process.env.SWISSKNIFE_E2E_PORT
  const port = raw ? Number(raw) : 3210
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid SWISSKNIFE_LIBP2P_BROWSER_E2E_PORT: ${raw}`)
  }
  return port
}

// Dedicated, isolated Vite dev server for the SWR-028 browser libp2p Playwright
// evidence harness (test/e2e/fixtures/libp2p-browser-harness). This serves the
// real production browser libp2p runtime and MCP+p2p session modules from
// `src/services/mcp` unmodified, so Playwright evidence reflects real browser
// behavior rather than mocks.
export default defineConfig({
  root: resolve(repoRoot, 'test/e2e/fixtures/libp2p-browser-harness'),
  base: './',
  // Explicit cacheDir: the harness root has no nearby node_modules, so Vite
  // would otherwise walk up and create one next to test/package.json.
  cacheDir: resolve(repoRoot, 'node_modules/.vite-libp2p-browser-harness'),

  server: {
    port: resolveLibp2pBrowserHarnessPort(),
    host: '127.0.0.1',
    strictPort: true,
  },

  resolve: {
    alias: {
      // Browser polyfills for the Node-oriented libp2p/MCP++ dependency tree.
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
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.SWISSKNIFE_WEB': '"true"',
  },

  optimizeDeps: {
    include: [
      'crypto-browserify',
      'stream-browserify',
      'path-browserify',
      'os-browserify',
      'process',
      'buffer',
      'util',
      'events',
    ],
  },
})

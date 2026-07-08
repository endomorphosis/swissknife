import { defineConfig, type Plugin } from 'vite'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const configDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(configDir, '../..')

function normalizeId(id: string): string {
  return id
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '')
}

function packageNameFromId(id: string): string | null {
  const normalized = normalizeId(id)
  const marker = '/node_modules/'
  const index = normalized.lastIndexOf(marker)
  if (index === -1) return null
  const parts = normalized.slice(index + marker.length).split('/')
  if (!parts[0]) return null
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1] ?? ''}`
  return parts[0]
}

function manualChunkName(id: string): string | undefined {
  const normalized = normalizeId(id)
  const packageName = packageNameFromId(normalized)
  if (!packageName) return undefined

  if (
    packageName === 'libp2p'
    || packageName.startsWith('@libp2p/')
    || packageName.startsWith('@chainsafe/libp2p-')
    || packageName === '@multiformats/multiaddr'
  ) {
    return 'vendor-libp2p'
  }

  if (packageName === 'pyodide') return 'vendor-pyodide'

  if (
    [
      'assert',
      'buffer',
      'constants-browserify',
      'crypto-browserify',
      'events',
      'path-browserify',
      'process',
      'stream-browserify',
      'util',
    ].includes(packageName)
  ) {
    return 'vendor-node-polyfills'
  }

  if (packageName === 'react' || packageName === 'react-dom') return 'vendor-react'

  if (
    packageName === '@anthropic-ai/sdk'
    || packageName === 'openai'
    || packageName === '@modelcontextprotocol/sdk'
  ) {
    return 'vendor-protocol-clients'
  }

  return undefined
}

const forbiddenBrowserImportSpecifiers = new Set([
  'child_process',
  'fs',
  'fs/promises',
  'node:child_process',
  'node:fs',
  'node:fs/promises',
  'node:path',
])

function swissknifeWebDistCleanPlugin(): Plugin {
  return {
    name: 'swissknife-web-dist-clean',
    apply: 'build',
    buildStart() {
      for (const artifact of ['.vite', 'assets', 'index.html']) {
        rmSync(resolve(repoRoot, 'dist', artifact), { force: true, recursive: true })
      }
    },
  }
}

function swissknifeBrowserImportGuardPlugin(): Plugin {
  return {
    name: 'swissknife-browser-import-guard',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        forbiddenBrowserImportSpecifiers.has(source)
        || source.includes('mcp-remote-deontic-engine')
      ) {
        const from = importer ? ` imported by ${normalizeId(importer)}` : ''
        this.error(`Host-only module "${source}" must not enter the browser bundle${from}.`)
      }
      return null
    },
  }
}

function swissknifeBundleAuditPlugin(): Plugin {
  return {
    name: 'swissknife-bundle-audit-metadata',
    apply: 'build',
    generateBundle(_, bundle) {
      const chunks = Object.values(bundle)
        .filter(item => item.type === 'chunk')
        .map(chunk => ({
          fileName: chunk.fileName,
          name: chunk.name,
          facadeModuleId: chunk.facadeModuleId ? normalizeId(chunk.facadeModuleId) : null,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.entries(chunk.modules).map(([id, module]) => ({
            id: normalizeId(id),
            packageName: packageNameFromId(id),
            renderedLength: module.renderedLength,
            originalLength: module.originalLength,
            codeLength: module.code?.length ?? 0,
          })),
        }))
        .sort((a, b) => a.fileName.localeCompare(b.fileName))

      const assets = Object.values(bundle)
        .filter(item => item.type === 'asset')
        .map(asset => ({
          fileName: asset.fileName,
          name: asset.name ?? null,
          originalFileNames: asset.originalFileNames ?? [],
          sourceLength: typeof asset.source === 'string'
            ? Buffer.byteLength(asset.source)
            : asset.source.byteLength,
        }))
        .sort((a, b) => a.fileName.localeCompare(b.fileName))

      this.emitFile({
        type: 'asset',
        fileName: '.vite/swissknife-bundle-metadata.json',
        source: JSON.stringify({
          schemaVersion: 1,
          build: 'web',
          chunks,
          assets,
        }, null, 2),
      })
    },
  }
}

// Web GUI specific Vite configuration
export default defineConfig({
  root: resolve(repoRoot, 'web'),
  base: './',
  plugins: [
    swissknifeWebDistCleanPlugin(),
    swissknifeBrowserImportGuardPlugin(),
    swissknifeBundleAuditPlugin(),
  ],
  
  build: {
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: false,
    manifest: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: resolve(repoRoot, 'web/index.html'),
      external: ['/src/cloudflare/worker-templates.ts'],
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: manualChunkName,
      },
    },
    target: 'es2020'
  },
  
  server: {
    port: 3001,
    host: true
  },
  
  resolve: {
    alias: {
      '@web': resolve(repoRoot, 'web/src'),
      '@': resolve(repoRoot, 'src'),
      '@ipfs': resolve(repoRoot, 'ipfs_accelerate_js/src'),
      // Browser polyfills
      'crypto': 'crypto-browserify',
      'stream': 'stream-browserify',
      'path': 'path-browserify',
      'os': 'os-browserify',
      'process': 'process/browser',
      'buffer': 'buffer',
      'util': 'util'
    }
  },
  
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.SWISSKNIFE_WEB': '"true"'
  },
  
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@anthropic-ai/sdk',
      'openai',
      'crypto-browserify',
      'stream-browserify',
      'path-browserify',
      'os-browserify',
      'process',
      'buffer',
      'util'
    ]
  }
})

import { defineConfig, type Plugin } from 'vite'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  createAllAppToolMediator,
  gatewayArtifactCanonicalJson,
  type AllAppToolMediatorResponse,
} from '../../src/services/mcp/all-app-tool-mediator.js'
import type { BrowserMediatedToolCall } from '../../src/services/mcp/all-app-tool-gateway.js'
import { ALL_APP_EXECUTABLE_BACKEND_CONTRACT } from '../../src/services/apps/all-app-executable-backend-contract.js'
import { ALL_APP_LIVE_TOOL_BINDINGS } from '../../src/services/apps/all-app-live-tool-bindings.js'

const configDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(configDir, '../..')

const mcpEndpointLeaseFileNames: Record<string, string> = {
  ipfs_kit_py: 'ipfs-kit-compat-endpoint.json',
  ipfs_datasets_py: 'ipfs-datasets-compat-endpoint.json',
  ipfs_accelerate_py: 'ipfs-accelerate-compat-endpoint.json',
}

function vettedMcpEndpoint(service: keyof typeof mcpEndpointLeaseFileNames, fallback: string): string {
  const environmentName = `SWISSKNIFE_${service.toUpperCase().replace(/_PY$/, '').replaceAll('_', '_')}_MCP_URL`
  const configured = process.env[environmentName]
  if (configured) return configured.replace(/\/(api\/mcp\/status|mcp)$/, '/mcp')
  try {
    const leasePath = resolve(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb', mcpEndpointLeaseFileNames[service])
    const lease = JSON.parse(readFileSync(leasePath, 'utf8')) as { schema?: string; service?: string; endpoint?: string }
    if (lease.schema === 'swissknife.mcp-compat-endpoint.v1' && lease.service === service && typeof lease.endpoint === 'string') {
      return `${lease.endpoint.replace(/\/$/, '')}/mcp`
    }
  } catch {
    // No verified local lease exists yet; use the conventional endpoint.
  }
  return fallback
}

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
  // SWR-041: host-only worker and storage runtimes must never enter the
  // browser deployment bundle. `src/workers/browser.ts` and
  // `src/storage/browser.ts` are the only browser-safe entrypoints for
  // worker and storage access; see docs/browser-deployment-policy.md.
  'worker_threads',
  'node:worker_threads',
  'node:os',
])

// SWR-041: browser deployment security headers.
//
// `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
// require-corp` opt the page into "cross-origin isolation", which is what
// gates access to `SharedArrayBuffer` and multi-threaded WASM (used by the
// browser ZKP/theorem-proving stack behind `src/services/zkp`). These are
// dev/preview-server equivalents of `web/public/_headers`, which applies the
// same headers (plus CSP) to the actual deployment output in `dist/`. Keep
// both in sync; `scripts/audit-browser-deployment-policy.mjs` checks both.
const crossOriginIsolationHeaders: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
}

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

function swissknifeBrowserLibp2pFallbackHygienePlugin(): Plugin {
  return {
    name: 'swissknife-browser-libp2p-fallback-hygiene',
    apply: 'build',
    transform(code, id) {
      const normalized = normalizeId(id)
      if (!normalized.includes('/node_modules/pvtsutils/')) return null
      if (!code.includes('Buffer.from')) return null

      return {
        code: code.replace(/\bBuffer\.from\b/g, "globalThis.Buffer?.['from']"),
        map: null,
      }
    },
  }
}

/**
 * The desktop is the only browser-facing origin.  This middleware owns the
 * fixed `/mcp/tools/call` route and forwards a normalized tool call to an
 * owner adapter selected on the server.  Endpoint configuration is read here,
 * never serialized into the browser bundle or response envelope.
 */
function swissknifeSameOriginToolMediatorPlugin(): Plugin {
  // Descriptor discovery can materialize hundreds of MCP++ tools. Keep this
  // aligned with the compatibility adapters so opening desktop windows does
  // not repeatedly rebuild their catalogs.
  const CONTROL_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000
  const endpointFor = {
    ipfs_kit_py: vettedMcpEndpoint('ipfs_kit_py', 'http://127.0.0.1:8014/mcp'),
    ipfs_datasets_py: vettedMcpEndpoint('ipfs_datasets_py', 'http://127.0.0.1:3002/mcp'),
    ipfs_accelerate_py: vettedMcpEndpoint('ipfs_accelerate_py', 'http://127.0.0.1:3003/mcp'),
  } as const
  const adapters = Object.fromEntries(Object.entries(endpointFor).map(([owner, endpoint]) => [owner, {
    async invoke(call: { tool_id: string; payload: Readonly<Record<string, unknown>>; correlation_id: string; dry_run: boolean }) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-swissknife-correlation-id': call.correlation_id },
        body: JSON.stringify({
          jsonrpc: '2.0', id: call.correlation_id, method: 'tools/call',
          params: { name: call.tool_id, arguments: { ...call.payload, dry_run: call.dry_run } },
        }),
      })
      if (!response.ok) throw new Error(`Owner adapter returned HTTP ${response.status}.`)
      return response.json()
    },
  }])) as Parameters<typeof createAllAppToolMediator>[0]['adapters']
  const mediator = createAllAppToolMediator({
    adapters,
  })
  let catalogCache: { generatedAt: number; controls: readonly Record<string, unknown>[] } | undefined
  const controls = async () => {
    if (catalogCache && Date.now() - catalogCache.generatedAt < CONTROL_CATALOG_CACHE_TTL_MS) return catalogCache.controls
    const availableTools = await ownerToolNames(endpointFor)
    const sourceByBinding = new Map(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app =>
      app.backend_bindings.map(binding => [binding.binding_id, binding] as const),
    ))
    const next = ALL_APP_LIVE_TOOL_BINDINGS.bindings.map(binding => {
      const source = sourceByBinding.get(binding.binding_id)
      const selectedTool = source?.tool_selection.preferred_tool_ids.find(tool => availableTools[binding.owner]?.has(tool)) ?? null
      return {
        app_id: binding.app_id,
        binding_id: binding.binding_id,
        capability_id: binding.capability_id,
        intent_id: binding.intent_id,
        owner: binding.owner,
        label: source?.ui_control.label ?? binding.ui_control_id,
        mutates_remote_state: source?.mediated_intent.mutates_remote_state === true,
        transport: selectedTool && binding.gateway.transports.includes('http') ? 'http' : null,
        selected_tool_id: selectedTool,
        safe_payload: selectedTool ? safeDesktopPayload(selectedTool, binding.capability_id) : null,
        status: selectedTool ? 'available' : 'unavailable',
      }
    })
    catalogCache = { generatedAt: Date.now(), controls: next }
    return next
  }
  const install = (server: { middlewares: { use(handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, next: () => void) => void): void } }) => {
    server.middlewares.use((request, response, next) => {
      if (request.method === 'GET' && request.url?.split('?')[0] === '/mcp/tools/bindings') {
        const url = new URL(request.url, 'http://swissknife.local')
        void controls().then(allControls => {
          const appId = url.searchParams.get('app_id')
          const filtered = appId ? allControls.filter(control => control.app_id === appId) : allControls
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          response.end(JSON.stringify({ schema: 'swissknife.live-tool-control-catalog.v1', controls: filtered }))
        }).catch(error => {
          response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        })
        return
      }
      if (request.method !== 'POST' || request.url?.split('?')[0] !== '/mcp/tools/call') return next()
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      request.on('end', async () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const result = await mediator.dispatch(payload)
          await persistGatewayArtifacts(payload, result, endpointFor.ipfs_kit_py)
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          response.end(JSON.stringify(result))
        } catch (error) {
          response.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    })
  }
  return { name: 'swissknife-same-origin-tool-mediator', configureServer: install, configurePreviewServer: install }
}

async function ownerToolNames(endpoints: Record<string, string>): Promise<Record<string, Set<string>>> {
  const entries = await Promise.all(Object.entries(endpoints).map(async ([owner, endpoint]) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: `swissknife-catalog:${owner}`, method: 'tools/list', params: {} }),
    })
    if (!response.ok) throw new Error(`${owner} descriptor discovery returned HTTP ${response.status}.`)
    const body = await response.json() as { error?: { message?: string }; result?: { tools?: Array<{ name?: string }> } }
    if (body.error) throw new Error(`${owner} descriptor discovery failed: ${body.error.message ?? 'unknown JSON-RPC error'}.`)
    return [owner, new Set((body.result?.tools ?? []).map(tool => tool.name).filter((name): name is string => Boolean(name)))] as const
  }))
  return Object.fromEntries(entries)
}

function safeDesktopPayload(toolId: string, capabilityId: string): Readonly<Record<string, unknown>> {
  if (toolId === 'tools_get_schema') return { name: 'tools_list_categories' }
  if (toolId === 'tools_list_tools') return { category: 'mcplusplus' }
  return { scope: capabilityId, limit: 1, cursor: 'desktop-read-only' }
}

async function persistGatewayArtifacts(
  call: BrowserMediatedToolCall,
  result: AllAppToolMediatorResponse,
  kitMcpEndpoint: string,
): Promise<void> {
  const artifactEndpoint = kitMcpEndpoint.replace(/\/mcp$/, '/mcp/artifacts/put')
  const receiptCid = result.receipt.receipt_id
  const eventCid = result.receipt.event_dag_refs[0]
  try {
    const persisted = await Promise.all([
      persistGatewayArtifact(artifactEndpoint, receiptCid, 'receipt', call, result.result),
      persistGatewayArtifact(artifactEndpoint, eventCid, 'event', call, result.result),
    ])
    result.receipt.persistence = {
      status: 'persisted',
      backend: persisted.map(item => item.backend).filter(Boolean).join(',') || 'ipfs_kit_py',
      receipt_cid: receiptCid,
      event_cid: eventCid,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.ok = false
    result.outcome = 'failed'
    result.result = { error: 'receipt_persistence_failed', message, execution_result: result.result }
    result.receipt.outcome = 'failed'
    result.receipt.persistence = { status: 'failed', receipt_cid: receiptCid, event_cid: eventCid, error: message }
  }
}

async function persistGatewayArtifact(
  endpoint: string,
  cid: string | undefined,
  kind: 'receipt' | 'event',
  call: BrowserMediatedToolCall,
  result: unknown,
): Promise<{ backend?: string }> {
  if (!cid) throw new Error(`Missing ${kind} CID.`)
  const bytes = Buffer.from(gatewayArtifactCanonicalJson(kind, call, result), 'utf8')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      cid,
      bytes_base64: bytes.toString('base64'),
      profile: kind === 'event' ? 'F' : 'B',
      kind: `swissknife_gateway_${kind}`,
      service: 'swissknife',
      pin: true,
    }),
  })
  const body = await response.json() as { persisted?: boolean; verified?: boolean; cid?: string; backend?: string; error?: string }
  if (!response.ok || body.persisted !== true || body.verified !== true || body.cid !== cid) {
    throw new Error(body.error ?? `IPFS Kit ${kind} persistence returned HTTP ${response.status}.`)
  }
  return { backend: body.backend }
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
    swissknifeBrowserLibp2pFallbackHygienePlugin(),
    swissknifeSameOriginToolMediatorPlugin(),
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

  // SWR-041: browser worker builds emitted from dynamic `new Worker(...)` /
  // `new SharedWorker(...)` construction inside the web app must use the
  // same ES module format as `build-tools/configs/vite.workers.config.ts`,
  // never Vite's classic/IIFE worker output, so worker chunks share the
  // browser-safe import graph and code-splitting as the rest of the bundle.
  worker: {
    format: 'es',
  },

  server: {
    port: 3001,
    host: true,
    headers: crossOriginIsolationHeaders,
  },

  // `vite preview` serves the built `dist/` output and is the closest local
  // approximation of production hosting; it must carry the same isolation
  // headers as `web/public/_headers` so WASM/COOP-COEP regressions are
  // caught before deployment.
  preview: {
    headers: crossOriginIsolationHeaders,
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

import { defineConfig, type Plugin } from 'vite'
import { readFileSync, rmSync } from 'node:fs'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
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

const PROFILE_REPLAY_CLIENT_DID = 'did:key:z6MkvAUPBCMQzakz16QeKSg68XSeewjGUvpzUjxQGD33qwKu'
const profileReplayConnectorCache = new Map<string, Promise<InstanceType<typeof import('../../src/services/mcp/mcp-plus-plus-connector.js').MCPPPServerConnector>>>()
const execFile = promisify(execFileCallback)

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
    async invoke(call: { tool_id: string; payload: Readonly<Record<string, unknown>>; correlation_id: string; dry_run: boolean; transport: 'http' | 'libp2p' }) {
      return invokeOwnerOverMcpPlusPlus(owner as keyof typeof endpointFor, endpoint, call)
    },
  }])) as Parameters<typeof createAllAppToolMediator>[0]['adapters']
  const mediator = createAllAppToolMediator({
    adapters,
  })
  let catalogCache: { generatedAt: number; controls: readonly Record<string, unknown>[] } | undefined
  const controls = async () => {
    if (catalogCache && Date.now() - catalogCache.generatedAt < CONTROL_CATALOG_CACHE_TTL_MS) return catalogCache.controls
    const { availableTools, discoveryUnavailable } = await ownerToolNames(endpointFor)
    const sourceByBinding = new Map(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app =>
      app.backend_bindings.map(binding => [binding.binding_id, binding] as const),
    ))
    const next = ALL_APP_LIVE_TOOL_BINDINGS.bindings.map(binding => {
      const source = sourceByBinding.get(binding.binding_id)
      const selectedTool = source?.tool_selection.preferred_tool_ids.find(tool => {
        if (discoveryUnavailable.has(binding.owner)) return true
        return availableTools[binding.owner]?.has(tool)
      }) ?? null
      return {
        app_id: binding.app_id,
        binding_id: binding.binding_id,
        capability_id: binding.capability_id,
        intent_id: binding.intent_id,
        owner: binding.owner,
        label: source?.ui_control.label ?? binding.ui_control_id,
        mutates_remote_state: source?.mediated_intent.mutates_remote_state === true,
        transport: selectedTool && binding.gateway.transports.includes('http') ? 'http' : null,
        transports: selectedTool ? binding.gateway.transports : [],
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

/**
 * The browser always reaches the desktop's same-origin mediator.  For a
 * libp2p-selected binding the mediator, not the browser, dials the announced
 * Profile E peer and returns only sanitized tool output.  Keeping this here
 * makes the application execution observable without leaking a multiaddr,
 * backend URL, credential, or libp2p handle into the page.
 */
async function invokeOwnerOverMcpPlusPlus(
  owner: keyof typeof endpointFor,
  endpoint: string,
  call: { tool_id: string; payload: Readonly<Record<string, unknown>>; correlation_id: string; dry_run: boolean; transport: 'http' | 'libp2p' },
): Promise<unknown> {
  const announceNames: Record<keyof typeof endpointFor, string> = {
    ipfs_kit_py: 'ipfs-kit-mcp-p2p-announce.json',
    ipfs_datasets_py: 'ipfs-datasets-mcp-p2p-announce.json',
    ipfs_accelerate_py: 'ipfs-accelerate-mcp-p2p-announce.json',
  }
  let multiaddr: string | undefined
  if (call.transport === 'libp2p') {
    const announcePath = resolve(repoRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb', announceNames[owner])
    const announce = JSON.parse(readFileSync(announcePath, 'utf8')) as { multiaddr?: string }
    multiaddr = announce.multiaddr
    if (!multiaddr) throw new Error(`No verified libp2p announce is available for ${owner}.`)
    return invokeOwnerOverInteropLibp2p(owner, multiaddr, call)
  }
  const cacheKey = `http:${owner}`
  let cached = profileReplayConnectorCache.get(cacheKey)
  if (!cached) {
    cached = (async () => {
      const { MCPPPServerConnector } = await import('../../src/services/mcp/mcp-plus-plus-connector.js')
      const connector = new MCPPPServerConnector({
        name: `desktop-${owner}-${call.transport}-replay`, baseUrl: endpoint.replace(/\/mcp$/, ''), mcpPath: '/mcp',
        toolsPath: '/mcp/tools/list', healthPath: '/mcp/health', ucanService: owner,
        ...(call.transport === 'libp2p' ? { transport: 'libp2p' as const, multiaddr, p2pProtocolId: '/mcp+p2p/1.0.0' } : {}),
        clientDID: PROFILE_REPLAY_CLIENT_DID,
      })
      const connection = await connector.connect()
      if (!connection.success || connector.transportKind !== call.transport) {
        throw new Error(`MCP++ ${call.transport} did not establish a ${owner} application route.`)
      }
      return connector
    })()
    profileReplayConnectorCache.set(cacheKey, cached)
  }
  const connector = await cached
  try {
    if (!connector.isConnected || connector.transportKind !== call.transport) {
      throw new Error(`MCP++ ${call.transport} did not establish an ${owner} application route.`)
    }
    const interfaces = await connector.listInterfaces()
    const interfaceCid = interfaces[0]?.interface_cid
    const identity = connector.verifiedPeerIdentity
    if (!interfaceCid || identity?.valid !== true || !identity.did || !identity.proofCid) {
      throw new Error(`MCP++ ${call.transport} did not retain descriptor and UCAN identity evidence for ${owner}.`)
    }
    // The correlation ID is part of the actual owner invocation, not merely
    // a browser-side label. It lets the resulting Profile A/C observation be
    // tied to this exact desktop operation without exposing an owner URL.
    const result = await connector.callTool(call.tool_id, {
      ...call.payload,
      dry_run: call.dry_run,
      correlation_id: call.correlation_id,
    })
    return {
      result,
      application_transport_observation: {
        transport: call.transport, descriptor_cid: interfaceCid,
        ucan_did_verified: true, remote_did: identity.did,
        identity_proof_cid: identity.proofCid, correlation_id: call.correlation_id,
      },
    }
  } catch (error) { throw error }
}

/**
 * The local Profile E bridge is implemented with py-libp2p.  Its Noise stack
 * is authoritative for the announced peer and interoperates with the matching
 * py-libp2p connector.  Run that connector behind the mediator, never in the
 * browser, so the visible control still causes the exact live libp2p call
 * without leaking a multiaddr, endpoint, or process detail to the page.
 */
async function invokeOwnerOverInteropLibp2p(
  owner: keyof typeof endpointFor,
  multiaddr: string,
  call: { tool_id: string; payload: Readonly<Record<string, unknown>>; correlation_id: string; dry_run: boolean },
): Promise<unknown> {
  const nonce = `desktop-${call.correlation_id}-${Math.random().toString(36).slice(2)}`.slice(0, 512)
  const python = process.env.IPFS_ACCELERATE_PYTHON || '/home/barberb/ipfs_accelerate_py/.venv/bin/python3'
  const helper = resolve(repoRoot, 'scripts', 'invoke-mcp-libp2p.py')
  const { stdout } = await execFile(python, [
    helper,
    '--multiaddr', multiaddr,
    '--tool-id', call.tool_id,
    '--arguments-json', JSON.stringify({ ...call.payload, dry_run: call.dry_run, correlation_id: call.correlation_id }),
    '--audience-did', PROFILE_REPLAY_CLIENT_DID,
    '--nonce', nonce,
  ], { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 })
  try {
    const result = JSON.parse(stdout) as {
      result?: unknown
      profile_a_descriptor_cid?: unknown
      profile_c_identity?: unknown
    }
    if (typeof result.profile_a_descriptor_cid !== 'string' || !/^b[a-z2-7]{58}$/.test(result.profile_a_descriptor_cid)) {
      throw new Error('libp2p connector did not return a valid Profile A descriptor CID.')
    }
    // Keep UCAN material on the mediator. The report receives only the
    // verified DID and derived proof CID, never the bearer token itself.
    const { verifyMCPPPeerIdentity } = await import('../../src/services/mcp/mcp-plus-plus-profile-c.js')
    const identity = await verifyMCPPPeerIdentity(result.profile_c_identity, {
      audience: PROFILE_REPLAY_CLIENT_DID,
      nonce,
      service: owner,
      transport: 'libp2p',
    })
    if (!identity.valid || !identity.did || !identity.proofCid) {
      throw new Error(`libp2p connector did not return a verified Profile C UCAN identity for ${owner}: ${identity.reason ?? 'unknown verification failure'}`)
    }
    return {
      result: result.result,
      application_transport_observation: {
        transport: 'libp2p',
        descriptor_cid: result.profile_a_descriptor_cid,
        ucan_did_verified: true,
        remote_did: identity.did,
        identity_proof_cid: identity.proofCid,
        correlation_id: call.correlation_id,
      },
    }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('libp2p connector returned invalid JSON evidence.')
    throw error
  }
}

async function ownerToolNames(endpoints: Record<string, string>): Promise<{
  availableTools: Record<string, Set<string>>;
  discoveryUnavailable: Set<string>;
}> {
  const entries = await Promise.allSettled(
    Object.entries(endpoints).map(async ([owner, endpoint]) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `swissknife-catalog:${owner}`, method: 'tools/list', params: {} }),
      })
      if (!response.ok) throw new Error(`${owner} descriptor discovery returned HTTP ${response.status}.`)
      const body = await response.json() as { error?: { message?: string }; result?: { tools?: Array<{ name?: string }> } }
      if (body.error) throw new Error(`${owner} descriptor discovery failed: ${body.error.message ?? 'unknown JSON-RPC error'}.`)
      return [owner, new Set((body.result?.tools ?? []).map(tool => tool.name).filter((name): name is string => Boolean(name)))] as const
    }),
  )
  const availableTools: Record<string, Set<string>> = {}
  const discoveryUnavailable = new Set<string>()

  for (const outcome of entries) {
    if (outcome.status === 'rejected') continue
    const [owner, tools] = outcome.value
    availableTools[owner] = tools
  }

  const successfulOwners = new Set(Object.keys(availableTools))
  for (const owner of Object.keys(endpoints)) {
    if (!successfulOwners.has(owner)) discoveryUnavailable.add(owner)
  }
  return { availableTools, discoveryUnavailable }
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

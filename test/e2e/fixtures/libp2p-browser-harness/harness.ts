/**
 * SWR-028 — Browser libp2p Playwright evidence harness.
 *
 * This module runs inside a real browser (served by Vite, driven by Playwright)
 * and exercises the actual production browser libp2p runtime
 * (`src/services/mcp/libp2p-browser-runtime.ts`) and the actual MCP+p2p session
 * state machine (`src/services/mcp/mcp-p2p-session.ts`) — not mocks — so the
 * Playwright specs in `test/e2e/libp2p-browser.spec.ts` capture real evidence of:
 *
 *  1. Browser libp2p initialization (a real `createLibp2p` node is started).
 *  2. Unavailable optional package reporting (capability gaps).
 *  3. Relay / bootstrap configuration surfaced to the UI.
 *  4. MCP+p2p connection UI state transitions (idle → handshaking → open/error).
 *
 * Scenarios are selected via URL query parameters so the Playwright spec can
 * deterministically reproduce each evidence case across desktop and mobile
 * viewports without depending on real network access.
 */

import { Buffer as BufferPolyfill } from 'buffer';

// `mcp-p2p-session.ts` is currently classified as a host-only module (see
// tsconfig.host.json) and therefore uses the bare Node `Buffer` global
// directly rather than importing a browser polyfill itself. Running the real
// session state machine inside this browser harness requires a full-featured
// `Buffer` global (allocUnsafe/concat/read-write-UInt32BE/slice/toString),
// which the `buffer` npm package provides faithfully. This must run before
// any session method is invoked; it does not need to run before the static
// imports below evaluate, since none of them touch `Buffer` at module scope.
(globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;

import {
  buildBrowserLibp2pConfig,
  createBrowserLibp2pNode,
  summarizeBrowserLibp2pGaps,
  type BrowserLibp2pImport,
  type BrowserLibp2pRuntimeOptions,
  type BrowserLibp2pRuntimeReport,
} from '../../../../src/services/mcp/libp2p-browser-runtime';
import {
  MCPp2pSession,
  MCP_PLUS_PLUS_PROFILES,
  type P2PStream,
  type SessionState,
} from '../../../../src/services/mcp/mcp-p2p-session';

// ---------------------------------------------------------------------------
// Real, literal dynamic imports (Vite statically resolves these because they
// are literal string specifiers, exactly like production browser bundles do).
// ---------------------------------------------------------------------------

const KNOWN_LITERAL_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  libp2p: () => import('libp2p'),
  '@libp2p/webrtc': () => import('@libp2p/webrtc'),
  '@libp2p/websockets': () => import('@libp2p/websockets'),
  '@libp2p/circuit-relay-v2': () => import('@libp2p/circuit-relay-v2'),
  '@chainsafe/libp2p-noise': () => import('@chainsafe/libp2p-noise'),
  '@chainsafe/libp2p-yamux': () => import('@chainsafe/libp2p-yamux'),
  '@libp2p/identify': () => import('@libp2p/identify'),
  '@chainsafe/libp2p-gossipsub': () => import('@chainsafe/libp2p-gossipsub'),
};

/**
 * True runtime dynamic import for specifiers that are not statically known
 * above (either genuinely absent from this repo's dependency tree, such as
 * `@libp2p/gossipsub`, `@libp2p/mdns`, and `@libp2p/kad-dht`, or forced
 * "unavailable" by a Playwright scenario). The default evidence scenario does
 * not use this override; it exercises the production literal-import loader in
 * libp2p-browser-runtime.ts directly.
 */
async function dynamicSpecifierImport(specifier: string): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ specifier) as Promise<Record<string, unknown>>;
}

function buildImportModule(forcedMissing: ReadonlySet<string>): BrowserLibp2pImport {
  return async specifier => {
    if (!forcedMissing.has(specifier) && specifier in KNOWN_LITERAL_LOADERS) {
      return KNOWN_LITERAL_LOADERS[specifier]();
    }
    return dynamicSpecifierImport(specifier);
  };
}

// ---------------------------------------------------------------------------
// Scenario configuration (driven by URL query parameters)
// ---------------------------------------------------------------------------

type Scenario = 'available' | 'relay-only' | 'websocket-only' | 'missing-webrtc' | 'missing-multiple' | 'disabled';

const SCENARIO_FORCED_MISSING: Record<Scenario, string[]> = {
  available: [],
  'relay-only': [],
  'websocket-only': [],
  'missing-webrtc': ['@libp2p/webrtc'],
  'missing-multiple': ['@libp2p/webrtc', '@libp2p/circuit-relay-v2', '@chainsafe/libp2p-gossipsub'],
  disabled: [],
};

const DEFAULT_RELAY_MULTIADDR =
  '/dns4/relay.swissknife-mcp.example/tcp/443/wss/p2p/12D3KooWRelayBootstrapExamplePeerAaaaaaaaaaaaaaaaaaaaaaaaaa/p2p-circuit';
const DEFAULT_WEBSOCKET_BOOTSTRAP_MULTIADDR =
  '/dns4/bootstrap.swissknife-mcp.example/tcp/443/wss/p2p/12D3KooWBrowserBootstrapPeerAaaaaaaaaaaaaaaaaaaaaaaaa';

interface HarnessConfig {
  scenario: Scenario;
  listenMultiaddrs: string[];
  rendezvousAddr: string;
  bootstrapPeers: string[];
  usesDefaultBootstrap: boolean;
  p2pOutcome: 'success' | 'error' | 'timeout';
}

function parseConfig(): HarnessConfig {
  const params = new URLSearchParams(window.location.search);
  const scenarioParam = params.get('scenario');
  const scenario: Scenario =
    scenarioParam === 'relay-only' ||
    scenarioParam === 'websocket-only' ||
    scenarioParam === 'missing-webrtc' ||
    scenarioParam === 'missing-multiple' ||
    scenarioParam === 'disabled'
      ? scenarioParam
      : 'available';

  // Circuit-relay listening (`/p2p-circuit`) requires a reachable bootstrap
  // relay peer to reserve a slot on. It is opt-in (default false) so the
  // default "available" scenario demonstrates a clean, real, CI-safe
  // initialization; the dedicated `relayListen=true` scenario demonstrates
  // the real (and realistic) failure when no relay is reachable.
  const includeRelayListen = params.get('relayListen') === 'true';
  const listenMultiaddrs =
    scenario === 'relay-only'
      ? ['/p2p-circuit']
      : scenario === 'websocket-only'
        ? []
        : ['/webrtc', ...(includeRelayListen ? ['/p2p-circuit'] : [])];

  const relayParam = params.get('relay');
  const rendezvousAddr = relayParam ?? DEFAULT_RELAY_MULTIADDR;
  const bootstrapParam = params.get('bootstrap');
  const bootstrapPeers = bootstrapParam
    ? bootstrapParam.split(',').map(value => value.trim()).filter(Boolean)
    : scenario === 'websocket-only'
      ? [DEFAULT_WEBSOCKET_BOOTSTRAP_MULTIADDR]
      : [rendezvousAddr];
  const usesDefaultBootstrap = bootstrapParam === null && relayParam === null;

  const p2pParam = params.get('p2p');
  const p2pOutcome: HarnessConfig['p2pOutcome'] =
    p2pParam === 'error' || p2pParam === 'timeout' ? p2pParam : 'success';

  return { scenario, listenMultiaddrs, rendezvousAddr, bootstrapPeers, usesDefaultBootstrap, p2pOutcome };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<T extends HTMLElement = HTMLElement>(testId: string): T {
  const found = document.querySelector<T>(`[data-testid="${testId}"]`);
  if (!found) throw new Error(`Missing element for data-testid="${testId}"`);
  return found;
}

function setBadge(badgeEl: HTMLElement, textEl: HTMLElement, state: string, modifierPrefix: string): void {
  textEl.textContent = state;
  badgeEl.textContent = state;
  badgeEl.className = `badge badge-${modifierPrefix}${state}`;
}

function renderViewportBanner(): void {
  const banner = el('viewport-banner');
  const mobileQuery = window.matchMedia('(max-width: 600px)');

  function update(): void {
    const layout = mobileQuery.matches ? 'mobile' : 'desktop';
    document.body.dataset.layout = layout;
    banner.textContent = `viewport ${window.innerWidth}x${window.innerHeight} (${layout} layout)`;
  }

  update();
  mobileQuery.addEventListener('change', update);
  window.addEventListener('resize', update);
}

function renderCapabilities(report: BrowserLibp2pRuntimeReport): void {
  const list = el('capabilities-list');
  list.innerHTML = '';
  for (const capability of report.capabilities) {
    const li = document.createElement('li');
    li.dataset.testid = `capability-${capability.name}`;
    li.dataset.installed = String(capability.installed);
    li.dataset.configured = String(capability.configured);
    li.textContent = `${capability.name}: installed=${capability.installed} configured=${capability.configured} (${capability.packageName})${
      capability.reason ? ` — ${capability.reason}` : ''
    }`;
    list.appendChild(li);
  }
}

function renderGaps(report: BrowserLibp2pRuntimeReport): void {
  const list = el('gaps-list');
  const empty = el('gaps-empty');
  list.innerHTML = '';
  const summaries = summarizeBrowserLibp2pGaps(report);
  if (summaries.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const gap of report.gaps) {
    const li = document.createElement('li');
    li.dataset.testid = `gap-${gap.name}`;
    li.dataset.installed = 'false';
    li.textContent = `${gap.name} (${gap.packageName}): ${gap.reason}`;
    list.appendChild(li);
  }
}

async function renderPeerDiscoveryAvailability(importModule: BrowserLibp2pImport): Promise<void> {
  const list = el('discovery-list');
  list.innerHTML = '';
  const discoveryPackages: Array<{ name: string; packageName: string; exportName: string }> = [
    { name: 'mdns', packageName: '@libp2p/mdns', exportName: 'mdns' },
    { name: 'kad-dht', packageName: '@libp2p/kad-dht', exportName: 'kadDHT' },
  ];

  for (const pkg of discoveryPackages) {
    const li = document.createElement('li');
    li.dataset.testid = `discovery-${pkg.name}`;
    try {
      const module = await importModule(pkg.packageName);
      const installed = typeof module[pkg.exportName] === 'function';
      li.dataset.installed = String(installed);
      li.textContent = installed
        ? `${pkg.name} (${pkg.packageName}): installed`
        : `${pkg.name} (${pkg.packageName}): installed but missing export ${pkg.exportName}`;
    } catch (err) {
      li.dataset.installed = 'false';
      const reason = err instanceof Error ? err.message : String(err);
      li.textContent = `${pkg.name} (${pkg.packageName}): unavailable — ${reason}`;
    }
    list.appendChild(li);
  }
}

function renderRelayConfig(config: HarnessConfig): void {
  el('relay-listen').textContent = JSON.stringify(config.listenMultiaddrs, null, 2);
  el('relay-rendezvous').textContent = config.rendezvousAddr;
  el('relay-bootstrap-peers').textContent = JSON.stringify(config.bootstrapPeers, null, 2);
}

function renderBootstrapMatrix(report: BrowserLibp2pRuntimeReport): void {
  const matrix = report.bootstrap;
  el('bootstrap-mode').textContent = matrix.transportMode;
  el('bootstrap-report').textContent = JSON.stringify(
    {
      schema: matrix.schema,
      defaultBootstrap: matrix.defaultBootstrap,
      listenMultiaddrs: matrix.listenMultiaddrs,
      bootstrapPeers: matrix.bootstrapPeers,
      relayMultiaddr: matrix.relayMultiaddr,
      relayOnlyFallback: matrix.relayOnlyFallback,
      webRTCUnavailable: matrix.webRTCUnavailable,
      webSocketOnly: matrix.webSocketOnly,
      gossipSubAvailable: matrix.gossipSubAvailable,
      simulatedTransports: matrix.simulatedTransports,
      capabilities: matrix.capabilities,
      notes: matrix.notes,
    },
    null,
    2,
  );
  el('bootstrap-capability-gaps').textContent = JSON.stringify(matrix.capabilityGaps, null, 2);
}

function buildRuntimeOptions(
  config: HarnessConfig,
  importModule?: BrowserLibp2pImport,
  extraOptions: BrowserLibp2pRuntimeOptions = {},
): BrowserLibp2pRuntimeOptions {
  const transportMode =
    config.scenario === 'relay-only'
      ? 'relay-only'
      : config.scenario === 'websocket-only'
        ? 'websocket-only'
        : 'default';

  return {
    importModule,
    transportMode,
    relayMultiaddr: config.usesDefaultBootstrap ? undefined : config.rendezvousAddr,
    bootstrapPeers: config.usesDefaultBootstrap ? undefined : config.bootstrapPeers,
    libp2pOptions: { addresses: { listen: config.listenMultiaddrs } },
    ...extraOptions,
  };
}

// ---------------------------------------------------------------------------
// Browser libp2p initialization
// ---------------------------------------------------------------------------

async function runInitialization(config: HarnessConfig): Promise<void> {
  const statusText = el('init-status');
  const statusBadge = el('init-status-badge');
  const detail = el('init-detail');

  if (config.scenario === 'disabled') {
    const { report } = await buildBrowserLibp2pConfig(buildRuntimeOptions(config, undefined, { enabled: false }));
    renderCapabilities(report);
    renderGaps(report);
    renderBootstrapMatrix(report);
    setBadge(statusBadge, statusText, 'disabled', '');
    detail.textContent = 'Browser libp2p runtime disabled by scenario (enabled: false); no node was created.';
    return;
  }

  const forcedMissing = new Set(SCENARIO_FORCED_MISSING[config.scenario]);
  const importModule = forcedMissing.size > 0 ? buildImportModule(forcedMissing) : undefined;
  const runtimeOptions = buildRuntimeOptions(config, importModule);

  // Capability/gap assembly never requires real network connectivity, so it
  // is always computed and rendered first — independent of whether the
  // subsequent real node construction/start attempt below succeeds. This
  // guarantees "unavailable package reporting" evidence is captured even in
  // scenarios where starting the node legitimately fails (e.g. no reachable
  // circuit-relay bootstrap peer).
  const { report } = await buildBrowserLibp2pConfig(runtimeOptions);
  renderCapabilities(report);
  renderGaps(report);
  renderBootstrapMatrix(report);

  try {
    // `start: false` defers the actual transport listen attempt so we can
    // control and time it explicitly below, independent of whatever
    // `createLibp2p`'s own default auto-start behavior is.
    const runtime = await createBrowserLibp2pNode({
      ...runtimeOptions,
      libp2pOptions: { ...(runtimeOptions.libp2pOptions ?? {}), start: false },
    });

    const node = runtime.node as {
      start(): Promise<void>;
      peerId: { toString(): string };
      getMultiaddrs(): Array<{ toString(): string }>;
      stop(): Promise<void>;
    };

    const timeoutMs = 15_000;
    await Promise.race([
      node.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('libp2p start() timed out')), timeoutMs)),
    ]);

    const peerId = node.peerId.toString();
    const addrs = node.getMultiaddrs().map(addr => addr.toString());

    setBadge(statusBadge, statusText, 'started', '');
    detail.textContent = `peerId=${peerId}\nlisten multiaddrs=${JSON.stringify(config.listenMultiaddrs)}\nadvertised addrs=${JSON.stringify(addrs)}`;

    await node.stop();
  } catch (err) {
    setBadge(statusBadge, statusText, 'error', '');
    detail.textContent = err instanceof Error ? `${err.message}` : String(err);
  }
}

// ---------------------------------------------------------------------------
// MCP + p2p connection state (real MCPp2pSession, scripted transport)
// ---------------------------------------------------------------------------

function buildLengthPrefixedFrame(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, body.length, false);
  const frame = new Uint8Array(header.length + body.length);
  frame.set(header, 0);
  frame.set(body, header.length);
  return frame;
}

/**
 * A scripted P2PStream standing in for a real libp2p stream. It responds to
 * the first outbound MCP `initialize` request with a canned reply so the
 * *real* `MCPp2pSession` handshake / framing / state-machine code executes
 * end-to-end inside the browser, without depending on external network peers
 * (which would make the evidence flaky and CI-unsafe).
 */
function createScriptedP2PStream(outcome: HarnessConfig['p2pOutcome']): P2PStream {
  let ended = false;
  const queue: Uint8Array[] = [];
  let pendingResolve: ((chunk: Uint8Array) => void) | null = null;
  let requestCount = 0;

  function push(chunk: Uint8Array): void {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(chunk);
    } else {
      queue.push(chunk);
    }
  }

  return {
    write(_chunk: Uint8Array) {
      requestCount += 1;
      if (requestCount !== 1) return;
      if (outcome === 'timeout') return; // Never respond — caller races against a timeout.
      queueMicrotask(() => {
        if (outcome === 'success') {
          push(
            buildLengthPrefixedFrame({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'swissknife-libp2p-harness-relay', version: '1.0.0' },
                capabilities: { tools: true, mcpPlusPlusProfiles: [...MCP_PLUS_PLUS_PROFILES] },
              },
            }),
          );
        } else {
          push(
            buildLengthPrefixedFrame({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -32000, message: 'Simulated relay rejection: no route to bootstrap peer' },
            }),
          );
        }
      });
    },
    close() {
      ended = true;
    },
    abort() {
      ended = true;
    },
    async *[Symbol.asyncIterator]() {
      while (!ended) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          yield await new Promise<Uint8Array>(resolve => {
            pendingResolve = resolve;
          });
        }
      }
    },
  };
}

async function runP2PConnectionScenario(config: HarnessConfig): Promise<void> {
  const statusText = el('p2p-status');
  const statusBadge = el('p2p-status-badge');
  const detail = el('p2p-detail');

  const stream = createScriptedP2PStream(config.p2pOutcome);
  const session = new MCPp2pSession(stream);
  session.on('state', (state: SessionState) => {
    setBadge(statusBadge, statusText, state, '');
  });
  setBadge(statusBadge, statusText, session.sessionState, '');

  try {
    const result = await Promise.race([
      session.handshake({ name: 'swissknife-libp2p-browser-harness', version: '1.0.0' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MCP+p2p handshake timed out waiting for relay peer')), 4000),
      ),
    ]);
    detail.textContent = `Connected to ${result.serverInfo.name} (protocol ${result.protocolVersion})\nnegotiated profiles: ${
      result.capabilities.mcpPlusPlusProfiles?.join(', ') ?? '(none)'
    }`;
  } catch (err) {
    setBadge(statusBadge, statusText, 'error', '');
    detail.textContent = err instanceof Error ? err.message : String(err);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  renderViewportBanner();
  const config = parseConfig();
  renderRelayConfig(config);

  const discoveryImportModule = buildImportModule(new Set());
  await Promise.all([
    runInitialization(config),
    renderPeerDiscoveryAvailability(discoveryImportModule),
    runP2PConnectionScenario(config),
  ]);

  const ready = el('harness-ready');
  ready.dataset.ready = 'true';
}

main().catch(err => {
  console.error('[libp2p-browser-harness] fatal error', err);
  const ready = el('harness-ready');
  ready.dataset.ready = 'true';
  ready.dataset.fatalError = err instanceof Error ? err.message : String(err);
});

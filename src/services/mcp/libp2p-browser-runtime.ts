/**
 * Browser libp2p runtime assembly for MCP++.
 *
 * The browser stack intentionally uses real libp2p modules only. Optional
 * packages that are not installed are reported as capability gaps and are left
 * out of the config instead of being replaced by local stand-ins.
 */

export type BrowserLibp2pCapabilityName =
  | 'libp2p'
  | 'webrtc'
  | 'websockets'
  | 'circuit-relay-v2'
  | 'noise'
  | 'yamux'
  | 'identify'
  | 'gossipsub';

export type BrowserLibp2pImport = (specifier: string) => Promise<Record<string, unknown>>;
export type BrowserLibp2pTransportMode = 'default' | 'relay-only' | 'websocket-only';

export type BrowserLibp2pCapabilityGapCode =
  | 'package-unavailable'
  | 'export-missing'
  | 'factory-initialization-failed';

export interface BrowserLibp2pCapabilityGap {
  name: BrowserLibp2pCapabilityName;
  packageName: string;
  code: BrowserLibp2pCapabilityGapCode;
  reason: string;
}

export interface BrowserLibp2pCapabilityStatus {
  name: BrowserLibp2pCapabilityName;
  packageName: string;
  installed: boolean;
  configured: boolean;
  exportName?: string;
  reason?: string;
}

export interface BrowserLibp2pBootstrapCapabilitySummary {
  requested: boolean;
  installed: boolean;
  configured: boolean;
  packageName?: string;
  reason?: string;
}

export interface BrowserLibp2pBootstrapReport {
  schema: 'swissknife.browser_libp2p_bootstrap_report.v1';
  transportMode: BrowserLibp2pTransportMode;
  defaultBootstrap: boolean;
  listenMultiaddrs: string[];
  bootstrapPeers: string[];
  relayMultiaddr?: string;
  relayOnlyFallback: boolean;
  webRTCUnavailable: boolean;
  webSocketOnly: boolean;
  gossipSubAvailable: boolean;
  simulatedTransports: false;
  capabilities: Record<'webrtc' | 'websockets' | 'circuit-relay-v2' | 'gossipsub', BrowserLibp2pBootstrapCapabilitySummary>;
  capabilityGaps: BrowserLibp2pCapabilityGap[];
  notes: string[];
}

export interface BrowserLibp2pRuntimeReport {
  enabled: boolean;
  capabilities: BrowserLibp2pCapabilityStatus[];
  gaps: BrowserLibp2pCapabilityGap[];
  bootstrap: BrowserLibp2pBootstrapReport;
}

export interface BrowserLibp2pRuntimeOptions {
  enabled?: boolean;
  transportMode?: BrowserLibp2pTransportMode;
  bootstrapPeers?: string[];
  relayMultiaddr?: string;
  includeWebRTC?: boolean;
  includeWebSockets?: boolean;
  includeCircuitRelay?: boolean;
  includeNoise?: boolean;
  includeYamux?: boolean;
  includeIdentify?: boolean;
  includeGossipSub?: boolean;
  libp2pOptions?: Record<string, unknown>;
  importModule?: BrowserLibp2pImport;
}

export interface BrowserLibp2pRuntimeConfig {
  config: Record<string, unknown>;
  report: BrowserLibp2pRuntimeReport;
}

export interface BrowserLibp2pDefaultStatus extends BrowserLibp2pRuntimeConfig {
  schema: 'swissknife.browser_libp2p_default_status.v1';
  generatedAt: string;
  listenMultiaddrs: string[];
}

export interface BrowserLibp2pNodeRuntime extends BrowserLibp2pRuntimeConfig {
  node: unknown;
}

export interface BrowserLibp2pDefaultStatus extends BrowserLibp2pRuntimeConfig {
  defaultEnabled: true;
  generatedAt: string;
  listenMultiaddrs: string[];
  moduleLoader: 'literal-browser-imports';
}

interface OptionalModuleSpec {
  name: BrowserLibp2pCapabilityName;
  packageNames: string[];
  exportNames: string[];
}

interface OptionalModuleLoad {
  spec: OptionalModuleSpec;
  packageName: string;
  exportName: string;
  factory: (...args: never[]) => unknown;
}

const DEFAULT_LISTEN_MULTIADDRS = ['/webrtc'];
const DEFAULT_RELAY_MULTIADDR =
  '/dns4/relay.swissknife-mcp.example/tcp/443/wss/p2p/12D3KooWRelayBootstrapExamplePeerAaaaaaaaaaaaaaaaaaaaaaaaaa/p2p-circuit';
const DEFAULT_WEBSOCKET_BOOTSTRAP_MULTIADDR =
  '/dns4/bootstrap.swissknife-mcp.example/tcp/443/wss/p2p/12D3KooWBrowserBootstrapPeerAaaaaaaaaaaaaaaaaaaaaaaaa';
const DEFAULT_BOOTSTRAP_PEERS = [DEFAULT_RELAY_MULTIADDR, DEFAULT_WEBSOCKET_BOOTSTRAP_MULTIADDR];

/**
 * Canonical, UI-facing display order for the optional browser libp2p
 * capabilities. `web/js/apps/mcp-control.js` and `web/js/apps/p2p-network.js`
 * both render this exact order so the MCP dashboard and P2P network app show
 * browser transport/capability status consistently.
 */
export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER: BrowserLibp2pCapabilityName[] = [
  'libp2p',
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'identify',
  'noise',
  'yamux',
  'gossipsub',
];

const MODULES = {
  libp2p: {
    name: 'libp2p',
    packageNames: ['libp2p'],
    exportNames: ['createLibp2p'],
  },
  webrtc: {
    name: 'webrtc',
    packageNames: ['@libp2p/webrtc'],
    exportNames: ['webRTC'],
  },
  websockets: {
    name: 'websockets',
    packageNames: ['@libp2p/websockets'],
    exportNames: ['webSockets'],
  },
  relay: {
    name: 'circuit-relay-v2',
    packageNames: ['@libp2p/circuit-relay-v2'],
    exportNames: ['circuitRelayTransport'],
  },
  noise: {
    name: 'noise',
    packageNames: ['@chainsafe/libp2p-noise'],
    exportNames: ['noise'],
  },
  yamux: {
    name: 'yamux',
    packageNames: ['@chainsafe/libp2p-yamux'],
    exportNames: ['yamux'],
  },
  identify: {
    name: 'identify',
    packageNames: ['@libp2p/identify'],
    exportNames: ['identify'],
  },
  gossipsub: {
    name: 'gossipsub',
    packageNames: ['@libp2p/gossipsub', '@chainsafe/libp2p-gossipsub'],
    exportNames: ['gossipsub'],
  },
} satisfies Record<string, OptionalModuleSpec>;

const defaultImportModule: BrowserLibp2pImport = async specifier => {
  switch (specifier) {
    case 'libp2p':
      return import('libp2p') as Promise<Record<string, unknown>>;
    case '@libp2p/webrtc':
      return import('@libp2p/webrtc') as Promise<Record<string, unknown>>;
    case '@libp2p/websockets':
      return import('@libp2p/websockets') as Promise<Record<string, unknown>>;
    case '@libp2p/circuit-relay-v2':
      return import('@libp2p/circuit-relay-v2') as Promise<Record<string, unknown>>;
    case '@chainsafe/libp2p-noise':
      return import('@chainsafe/libp2p-noise') as Promise<Record<string, unknown>>;
    case '@chainsafe/libp2p-yamux':
      return import('@chainsafe/libp2p-yamux') as Promise<Record<string, unknown>>;
    case '@libp2p/identify':
      return import('@libp2p/identify') as Promise<Record<string, unknown>>;
    case '@chainsafe/libp2p-gossipsub':
      return import('@chainsafe/libp2p-gossipsub') as Promise<Record<string, unknown>>;
    default:
      throw new Error(`Browser libp2p package is not bundled in this build: ${specifier}`);
  }
};

const BROWSER_LITERAL_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  libp2p: () => import('libp2p') as Promise<Record<string, unknown>>,
  '@libp2p/webrtc': () => import('@libp2p/webrtc') as Promise<Record<string, unknown>>,
  '@libp2p/websockets': () => import('@libp2p/websockets') as Promise<Record<string, unknown>>,
  '@libp2p/circuit-relay-v2': () => import('@libp2p/circuit-relay-v2') as Promise<Record<string, unknown>>,
  '@chainsafe/libp2p-noise': () => import('@chainsafe/libp2p-noise') as Promise<Record<string, unknown>>,
  '@chainsafe/libp2p-yamux': () => import('@chainsafe/libp2p-yamux') as Promise<Record<string, unknown>>,
  '@libp2p/identify': () => import('@libp2p/identify') as Promise<Record<string, unknown>>,
  '@chainsafe/libp2p-gossipsub': () =>
    import('@chainsafe/libp2p-gossipsub') as Promise<Record<string, unknown>>,
};

function enabled(value: boolean | undefined): boolean {
  return value !== false;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function gapReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function requestedForMode(
  mode: BrowserLibp2pTransportMode,
  capability: 'webrtc' | 'websockets' | 'circuit-relay-v2',
  requested: boolean | undefined,
): boolean {
  if (mode === 'relay-only') {
    return capability === 'websockets' || capability === 'circuit-relay-v2';
  }
  if (mode === 'websocket-only') {
    return capability === 'websockets';
  }
  return enabled(requested);
}

function defaultListenMultiaddrsForMode(mode: BrowserLibp2pTransportMode): string[] {
  if (mode === 'relay-only') return ['/p2p-circuit'];
  if (mode === 'websocket-only') return [];
  return [...DEFAULT_LISTEN_MULTIADDRS];
}

function defaultBootstrapPeersForMode(mode: BrowserLibp2pTransportMode): string[] {
  if (mode === 'websocket-only') return [DEFAULT_WEBSOCKET_BOOTSTRAP_MULTIADDR];
  return [...DEFAULT_BOOTSTRAP_PEERS];
}

function resolveBootstrapPeers(options: BrowserLibp2pRuntimeOptions, mode: BrowserLibp2pTransportMode): string[] {
  return options.bootstrapPeers?.map(peer => String(peer)) ?? defaultBootstrapPeersForMode(mode);
}

function findCapability(
  statuses: BrowserLibp2pCapabilityStatus[],
  name: BrowserLibp2pCapabilityName,
): BrowserLibp2pCapabilityStatus | undefined {
  return statuses.find(status => status.name === name);
}

function bootstrapCapabilitySummary(
  statuses: BrowserLibp2pCapabilityStatus[],
  name: 'webrtc' | 'websockets' | 'circuit-relay-v2' | 'gossipsub',
  requested: boolean,
): BrowserLibp2pBootstrapCapabilitySummary {
  const status = findCapability(statuses, name);
  return {
    requested,
    installed: status?.installed ?? false,
    configured: status?.configured ?? false,
    packageName: status?.packageName,
    reason: status?.reason,
  };
}

function buildBootstrapReport(
  options: BrowserLibp2pRuntimeOptions,
  config: Record<string, unknown>,
  statuses: BrowserLibp2pCapabilityStatus[],
  gaps: BrowserLibp2pCapabilityGap[],
  requested: {
    webrtc: boolean;
    websockets: boolean;
    relay: boolean;
    gossipsub: boolean;
  },
): BrowserLibp2pBootstrapReport {
  const mode = options.transportMode ?? 'default';
  const addresses = asRecord(config.addresses);
  const listenMultiaddrs = asStringArray(addresses.listen);
  const bootstrapPeers = resolveBootstrapPeers(options, mode);
  const relayMultiaddr = options.relayMultiaddr ?? bootstrapPeers.find(peer => peer.includes('/p2p-circuit'));
  const capabilities = {
    webrtc: bootstrapCapabilitySummary(statuses, 'webrtc', requested.webrtc),
    websockets: bootstrapCapabilitySummary(statuses, 'websockets', requested.websockets),
    'circuit-relay-v2': bootstrapCapabilitySummary(statuses, 'circuit-relay-v2', requested.relay),
    gossipsub: bootstrapCapabilitySummary(statuses, 'gossipsub', requested.gossipsub),
  };
  const webRTCUnavailable = requested.webrtc && !capabilities.webrtc.configured;
  const relayOnlyFallback = mode === 'relay-only' || (webRTCUnavailable && capabilities['circuit-relay-v2'].configured);
  const notes: string[] = [];

  if (mode === 'default') {
    notes.push('Default browser mode prefers WebRTC listen with WebSocket and circuit-relay transports available for outbound relay/bootstrap paths.');
  }
  if (relayOnlyFallback) {
    notes.push('Relay-only fallback requires a reachable WebSocket relay/bootstrap peer; no local transport replacement is configured.');
  }
  if (mode === 'websocket-only') {
    notes.push('WebSocket-only mode disables WebRTC and circuit-relay transports and keeps browser networking outbound-only.');
  }
  if (webRTCUnavailable) {
    notes.push('WebRTC was requested but unavailable; the gap is reported explicitly and no substitute WebRTC transport is installed.');
  }
  if (capabilities.gossipsub.configured) {
    notes.push('GossipSub is available as the libp2p pubsub service.');
  }

  return {
    schema: 'swissknife.browser_libp2p_bootstrap_report.v1',
    transportMode: mode,
    defaultBootstrap: options.bootstrapPeers === undefined,
    listenMultiaddrs,
    bootstrapPeers,
    relayMultiaddr,
    relayOnlyFallback,
    webRTCUnavailable,
    webSocketOnly: mode === 'websocket-only',
    gossipSubAvailable: capabilities.gossipsub.configured,
    simulatedTransports: false,
    capabilities,
    capabilityGaps: [...gaps],
    notes,
  };
}

async function loadOptionalModule(
  spec: OptionalModuleSpec,
  importModule: BrowserLibp2pImport,
  statuses: BrowserLibp2pCapabilityStatus[],
  gaps: BrowserLibp2pCapabilityGap[],
): Promise<OptionalModuleLoad | null> {
  const reasons: string[] = [];

  for (const packageName of spec.packageNames) {
    try {
      const module = await importModule(packageName);
      for (const exportName of spec.exportNames) {
        const exported = module[exportName];
        if (typeof exported === 'function') {
          statuses.push({
            name: spec.name,
            packageName,
            exportName,
            installed: true,
            configured: false,
          });
          return {
            spec,
            packageName,
            exportName,
            factory: exported as (...args: never[]) => unknown,
          };
        }
      }

      const reason = `Installed package ${packageName} does not export ${spec.exportNames.join(' or ')}`;
      statuses.push({
        name: spec.name,
        packageName,
        installed: true,
        configured: false,
        reason,
      });
      gaps.push({ name: spec.name, packageName, code: 'export-missing', reason });
      return null;
    } catch (err) {
      reasons.push(`${packageName}: ${gapReason(err)}`);
    }
  }

  const packageName = spec.packageNames.join(' | ');
  const reason = `Optional libp2p package unavailable (${reasons.join('; ')})`;
  statuses.push({
    name: spec.name,
    packageName,
    installed: false,
    configured: false,
    reason,
  });
  gaps.push({ name: spec.name, packageName, code: 'package-unavailable', reason });
  return null;
}

function markConfigured(
  statuses: BrowserLibp2pCapabilityStatus[],
  load: OptionalModuleLoad,
): void {
  const status = statuses.find(candidate =>
    candidate.name === load.spec.name &&
    candidate.packageName === load.packageName &&
    candidate.exportName === load.exportName
  );
  if (status) status.configured = true;
}

function addFactory(
  key: 'transports' | 'connectionEncryption' | 'streamMuxers',
  config: Record<string, unknown>,
  load: OptionalModuleLoad,
  statuses: BrowserLibp2pCapabilityStatus[],
  gaps: BrowserLibp2pCapabilityGap[],
): void {
  try {
    config[key] = [...asArray(config[key]), load.factory()];
    markConfigured(statuses, load);
  } catch (err) {
    const reason = `Failed to initialize ${load.packageName}: ${gapReason(err)}`;
    gaps.push({
      name: load.spec.name,
      packageName: load.packageName,
      code: 'factory-initialization-failed',
      reason,
    });
  }
}

function addServiceFactory(
  serviceName: string,
  config: Record<string, unknown>,
  load: OptionalModuleLoad,
  statuses: BrowserLibp2pCapabilityStatus[],
  gaps: BrowserLibp2pCapabilityGap[],
): void {
  try {
    const services = asRecord(config.services);
    services[serviceName] = load.factory();
    config.services = services;
    markConfigured(statuses, load);
  } catch (err) {
    const reason = `Failed to initialize ${load.packageName}: ${gapReason(err)}`;
    gaps.push({
      name: load.spec.name,
      packageName: load.packageName,
      code: 'factory-initialization-failed',
      reason,
    });
  }
}

export async function buildBrowserLibp2pConfig(
  options: BrowserLibp2pRuntimeOptions = {},
): Promise<BrowserLibp2pRuntimeConfig> {
  const config: Record<string, unknown> = {
    ...(options.libp2pOptions ?? {}),
  };
  const statuses: BrowserLibp2pCapabilityStatus[] = [];
  const gaps: BrowserLibp2pCapabilityGap[] = [];
  const importModule = options.importModule ?? defaultImportModule;
  const transportMode = options.transportMode ?? 'default';
  const requested = {
    webrtc: requestedForMode(transportMode, 'webrtc', options.includeWebRTC),
    websockets: requestedForMode(transportMode, 'websockets', options.includeWebSockets),
    relay: requestedForMode(transportMode, 'circuit-relay-v2', options.includeCircuitRelay),
    gossipsub: enabled(options.includeGossipSub),
  };

  if (!enabled(options.enabled)) {
    return {
      config,
      report: {
        enabled: false,
        capabilities: statuses,
        gaps,
        bootstrap: buildBootstrapReport(options, config, statuses, gaps, requested),
      },
    };
  }

  const addresses = asRecord(config.addresses);
  if (!Array.isArray(addresses.listen)) {
    addresses.listen = defaultListenMultiaddrsForMode(transportMode);
    config.addresses = addresses;
  }

  if (requested.webrtc) {
    const webrtc = await loadOptionalModule(MODULES.webrtc, importModule, statuses, gaps);
    if (webrtc) addFactory('transports', config, webrtc, statuses, gaps);
  }

  if (requested.websockets) {
    const websockets = await loadOptionalModule(MODULES.websockets, importModule, statuses, gaps);
    if (websockets) addFactory('transports', config, websockets, statuses, gaps);
  }

  if (requested.relay) {
    const relay = await loadOptionalModule(MODULES.relay, importModule, statuses, gaps);
    if (relay) addFactory('transports', config, relay, statuses, gaps);
  }

  if (enabled(options.includeNoise)) {
    const noise = await loadOptionalModule(MODULES.noise, importModule, statuses, gaps);
    if (noise) addFactory('connectionEncryption', config, noise, statuses, gaps);
  }

  if (enabled(options.includeYamux)) {
    const yamux = await loadOptionalModule(MODULES.yamux, importModule, statuses, gaps);
    if (yamux) addFactory('streamMuxers', config, yamux, statuses, gaps);
  }

  if (enabled(options.includeIdentify)) {
    const identify = await loadOptionalModule(MODULES.identify, importModule, statuses, gaps);
    if (identify) addServiceFactory('identify', config, identify, statuses, gaps);
  }

  if (requested.gossipsub) {
    const gossipSub = await loadOptionalModule(MODULES.gossipsub, importModule, statuses, gaps);
    if (gossipSub) addServiceFactory('pubsub', config, gossipSub, statuses, gaps);
  }

  return {
    config,
    report: {
      enabled: true,
      capabilities: statuses,
      gaps,
      bootstrap: buildBootstrapReport(options, config, statuses, gaps, requested),
    },
  };
}

export async function createBrowserLibp2pNode(
  options: BrowserLibp2pRuntimeOptions = {},
): Promise<BrowserLibp2pNodeRuntime> {
  const importModule = options.importModule ?? defaultImportModule;
  const runtime = await buildBrowserLibp2pConfig({ ...options, importModule });
  const statuses = [...runtime.report.capabilities];
  const gaps = [...runtime.report.gaps];

  const libp2p = await loadOptionalModule(MODULES.libp2p, importModule, statuses, gaps);
  if (!libp2p) {
    throw new Error(`Browser libp2p unavailable: ${gaps.map(gap => gap.reason).join('; ')}`);
  }

  const node = await libp2p.factory(runtime.config as never);
  markConfigured(statuses, libp2p);

  return {
    node,
    config: runtime.config,
    report: {
      enabled: runtime.report.enabled,
      capabilities: statuses,
      gaps,
      bootstrap: runtime.report.bootstrap,
    },
  };
}

export async function getBrowserLibp2pDefaultStatus(
  options: BrowserLibp2pRuntimeOptions = {},
): Promise<BrowserLibp2pDefaultStatus> {
  const importModule = options.importModule ?? defaultImportModule;
  const runtime = await buildBrowserLibp2pConfig({
    enabled: true,
    includeWebRTC: true,
    includeWebSockets: true,
    includeCircuitRelay: true,
    includeNoise: true,
    includeYamux: true,
    includeIdentify: true,
    includeGossipSub: true,
    ...options,
    importModule,
  });
  const statuses = [...runtime.report.capabilities];
  const gaps = [...runtime.report.gaps];
  const libp2p = await loadOptionalModule(MODULES.libp2p, importModule, statuses, gaps);
  if (libp2p) markConfigured(statuses, libp2p);

  const addresses = asRecord(runtime.config.addresses);
  const listen = Array.isArray(addresses.listen)
    ? addresses.listen.map(item => String(item))
    : [...DEFAULT_LISTEN_MULTIADDRS];

  return {
    schema: 'swissknife.browser_libp2p_default_status.v1',
    config: runtime.config,
    report: {
      enabled: runtime.report.enabled,
      capabilities: statuses,
      gaps,
      bootstrap: runtime.report.bootstrap,
    },
    defaultEnabled: true,
    generatedAt: new Date().toISOString(),
    listenMultiaddrs: listen,
    moduleLoader: 'literal-browser-imports',
  };
}

export function summarizeBrowserLibp2pGaps(
  report: BrowserLibp2pRuntimeReport,
): string[] {
  return report.gaps.map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

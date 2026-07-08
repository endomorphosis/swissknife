/**
<<<<<<< HEAD
 * Browser-ready libp2p runtime assembly for MCP++.
 *
 * The module is intentionally dynamic-import based so browser bundles can load
 * the MCP service surface without Node polyfills.  When the compatible libp2p
 * packages are installed, the default config enables WebRTC, WebSockets,
 * circuit relay v2, Noise, Yamux, GossipSub, and optional bootstrap relays.
 */

export interface McpLibp2pRuntimeOptions {
  /** Additional libp2p config supplied by the caller. */
  overrides?: Record<string, unknown>;
  /** Bootstrap relay/peer multiaddrs for browser discovery. */
  bootstrapMultiaddrs?: string[];
  /** Listen multiaddrs. Browser default is `/webrtc`; Node callers can override. */
  listenMultiaddrs?: string[];
  /** Enable browser-compatible WebRTC transport. Default true. */
  webRTC?: boolean;
  /** Enable browser-compatible WebSocket transport. Default true. */
  webSockets?: boolean;
  /** Enable circuit relay v2 transport for browser WebRTC reachability. Default true when WebRTC is enabled. */
  circuitRelay?: boolean | { discoverRelays?: number };
  /** Enable GossipSub service. Default true. */
  pubsub?: boolean;
  /** Enable bootstrap discovery when bootstrap multiaddrs are present. Default true. */
  bootstrap?: boolean;
  /** Enable mDNS when the optional package exists. Default false in browsers, true in Node. */
  mdns?: boolean;
  /** Enable Kad-DHT client mode when the optional package exists. Default false in browsers, true in Node. */
  dht?: boolean;
}

export interface McpLibp2pRuntimeConfigResult {
  config: Record<string, unknown>;
  enabled: {
    transports: string[];
    peerDiscovery: string[];
    services: string[];
  };
  unavailable: string[];
}

type DynamicModule = Record<string, unknown>;
type ServiceFactory = (components: unknown) => unknown;

export async function createMcpLibp2pNode(
  options: McpLibp2pRuntimeOptions = {},
): Promise<unknown> {
  const { createLibp2p } = await import('libp2p');
  const { config } = await createMcpLibp2pConfig(options);
  return createLibp2p(config as Parameters<typeof createLibp2p>[0]);
}

export async function createMcpLibp2pConfig(
  options: McpLibp2pRuntimeOptions = {},
): Promise<McpLibp2pRuntimeConfigResult> {
  const config: Record<string, unknown> = { ...(options.overrides ?? {}) };
  const enabled = {
    transports: [] as string[],
    peerDiscovery: [] as string[],
    services: [] as string[],
  };
  const unavailable: string[] = [];
  const browser = isBrowserRuntime();

  const addresses = { ...((config.addresses as Record<string, unknown> | undefined) ?? {}) };
  if (!Array.isArray(addresses.listen)) {
    addresses.listen = options.listenMultiaddrs ?? (browser ? ['/webrtc'] : []);
  }
  config.addresses = addresses;

  const transports = [...asArray(config.transports)];
  if (options.webSockets ?? true) {
    const mod = await optionalImport('@libp2p/websockets', unavailable);
    const webSockets = mod?.webSockets as (() => unknown) | undefined;
    if (webSockets) {
      transports.push(webSockets());
      enabled.transports.push('websockets');
    }
  }
  if (options.webRTC ?? true) {
    const mod = await optionalImport('@libp2p/webrtc', unavailable);
    const webRTC = mod?.webRTC as (() => unknown) | undefined;
    if (webRTC) {
      transports.push(webRTC());
      enabled.transports.push('webrtc');
    }
  }
  const relaySetting = options.circuitRelay ?? (options.webRTC ?? true);
  if (relaySetting) {
    const mod = await optionalImport('@libp2p/circuit-relay-v2', unavailable);
    const circuitRelayTransport = mod?.circuitRelayTransport as ((options?: Record<string, unknown>) => unknown) | undefined;
    if (circuitRelayTransport) {
      const relayOptions = typeof relaySetting === 'object' ? relaySetting : undefined;
      transports.push(circuitRelayTransport(relayOptions));
      enabled.transports.push('circuit-relay-v2');
    }
  }
  if (transports.length > 0) config.transports = transports;

  const encrypters = [...asArray(config.connectionEncrypters)];
  const noiseMod = await optionalImport('@chainsafe/libp2p-noise', unavailable);
  const noise = noiseMod?.noise as (() => unknown) | undefined;
  if (noise) {
    encrypters.push(noise());
    enabled.services.push('noise');
  }
  if (encrypters.length > 0) config.connectionEncrypters = encrypters;

  const muxers = [...asArray(config.streamMuxers)];
  const yamuxMod = await optionalImport('@chainsafe/libp2p-yamux', unavailable);
  const yamux = yamuxMod?.yamux as (() => unknown) | undefined;
  if (yamux) {
    muxers.push(yamux());
    enabled.services.push('yamux');
  }
  if (muxers.length > 0) config.streamMuxers = muxers;

  const services = { ...((config.services as Record<string, unknown> | undefined) ?? {}) };
  const identifyMod = await optionalImport('@libp2p/identify', unavailable);
  const identify = identifyMod?.identify as (() => ServiceFactory) | undefined;
  if (identify && !services.identify) {
    services.identify = await createIdentifyFactory(identify(), unavailable);
    enabled.services.push('identify');
  }
  if (options.pubsub ?? true) {
    const mod = await optionalImport('@chainsafe/libp2p-gossipsub', unavailable);
    const gossipsub = mod?.gossipsub as (() => unknown) | undefined;
    if (gossipsub) {
      services.pubsub = gossipsub();
      enabled.services.push('gossipsub');
    }
  }
  const dhtDefault = !browser;
  if (options.dht ?? dhtDefault) {
    const mod = await optionalImport('@libp2p/kad-dht', unavailable);
    const kadDHT = mod?.kadDHT as ((options?: Record<string, unknown>) => unknown) | undefined;
    if (kadDHT) {
      services.dht = kadDHT({ clientMode: true });
      enabled.services.push('kad-dht');
    }
  }
  if (Object.keys(services).length > 0) config.services = services;

  const peerDiscovery = [...asArray(config.peerDiscovery)];
  const bootstrapAddrs = options.bootstrapMultiaddrs ?? [];
  if ((options.bootstrap ?? true) && bootstrapAddrs.length > 0) {
    const mod = await optionalImport('@libp2p/bootstrap', unavailable);
    const bootstrap = mod?.bootstrap as ((options: { list: string[] }) => unknown) | undefined;
    if (bootstrap) {
      peerDiscovery.push(bootstrap({ list: bootstrapAddrs }));
      enabled.peerDiscovery.push('bootstrap');
    }
  }
  const mdnsDefault = !browser;
  if (options.mdns ?? mdnsDefault) {
    const mod = await optionalImport('@libp2p/mdns', unavailable);
    const mdns = mod?.mdns as (() => unknown) | undefined;
    if (mdns) {
      peerDiscovery.push(mdns());
      enabled.peerDiscovery.push('mdns');
    }
  }
  if (peerDiscovery.length > 0) config.peerDiscovery = peerDiscovery;

  return { config, enabled, unavailable };
}

export function isBrowserRuntime(): boolean {
  return typeof globalThis.window !== 'undefined'
    && typeof globalThis.document !== 'undefined';
}

async function optionalImport(specifier: string, unavailable: string[]): Promise<DynamicModule | null> {
  try {
    return await import(specifier) as DynamicModule;
  } catch {
    unavailable.push(specifier);
    return null;
  }
}

async function createIdentifyFactory(
  factory: ServiceFactory,
  unavailable: string[],
): Promise<ServiceFactory> {
  const interfaceMod = await optionalImport('@libp2p/interface', unavailable);
  const serviceCapabilities = interfaceMod?.serviceCapabilities as symbol | undefined;
  if (!serviceCapabilities) return factory;

  return (components: unknown) => {
    const service = factory(components) as Record<symbol, unknown>;
    if (!Array.isArray(service[serviceCapabilities])) {
      service[serviceCapabilities] = ['@libp2p/identify'];
    }
    return service;
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
=======
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

export interface BrowserLibp2pCapabilityGap {
  name: BrowserLibp2pCapabilityName;
  packageName: string;
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

export interface BrowserLibp2pRuntimeReport {
  enabled: boolean;
  capabilities: BrowserLibp2pCapabilityStatus[];
  gaps: BrowserLibp2pCapabilityGap[];
}

export interface BrowserLibp2pRuntimeOptions {
  enabled?: boolean;
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

export interface BrowserLibp2pNodeRuntime extends BrowserLibp2pRuntimeConfig {
  node: unknown;
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
  return import(/* @vite-ignore */ specifier) as Promise<Record<string, unknown>>;
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

function gapReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
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
      gaps.push({ name: spec.name, packageName, reason });
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
  gaps.push({ name: spec.name, packageName, reason });
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
    gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
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
    gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
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

  if (!enabled(options.enabled)) {
    return {
      config,
      report: { enabled: false, capabilities: statuses, gaps },
    };
  }

  const addresses = asRecord(config.addresses);
  if (!Array.isArray(addresses.listen)) {
    addresses.listen = DEFAULT_LISTEN_MULTIADDRS;
    config.addresses = addresses;
  }

  if (enabled(options.includeWebRTC)) {
    const webrtc = await loadOptionalModule(MODULES.webrtc, importModule, statuses, gaps);
    if (webrtc) addFactory('transports', config, webrtc, statuses, gaps);
  }

  if (enabled(options.includeWebSockets)) {
    const websockets = await loadOptionalModule(MODULES.websockets, importModule, statuses, gaps);
    if (websockets) addFactory('transports', config, websockets, statuses, gaps);
  }

  if (enabled(options.includeCircuitRelay)) {
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

  if (enabled(options.includeGossipSub)) {
    const gossipSub = await loadOptionalModule(MODULES.gossipsub, importModule, statuses, gaps);
    if (gossipSub) addServiceFactory('pubsub', config, gossipSub, statuses, gaps);
  }

  return {
    config,
    report: { enabled: true, capabilities: statuses, gaps },
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
    },
  };
}

export function summarizeBrowserLibp2pGaps(
  report: BrowserLibp2pRuntimeReport,
): string[] {
  return report.gaps.map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

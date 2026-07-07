/**
 * Browser-ready libp2p runtime assembly for MCP++.
 *
 * The module is intentionally dynamic-import based so browser bundles can load
 * the MCP service surface without Node polyfills.  When the compatible libp2p
 * packages are installed, the default config enables WebRTC, WebSockets,
 * Noise, Yamux, GossipSub, and optional bootstrap relays.
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
}

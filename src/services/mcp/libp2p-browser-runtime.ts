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

export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER: BrowserLibp2pCapabilityName[] = [
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

export async function getBrowserLibp2pDefaultStatus(
  options: BrowserLibp2pRuntimeOptions = {},
): Promise<BrowserLibp2pRuntimeReport> {
  const { report } = await buildBrowserLibp2pConfig(options);
  return report;
}

export function summarizeBrowserLibp2pGaps(
  report: BrowserLibp2pRuntimeReport,
): string[] {
  return report.gaps.map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

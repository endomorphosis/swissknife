/**
 * Browser libp2p runtime assembly for MCP++ (plain-JS runtime companion).
 *
 * This file mirrors `libp2p-browser-runtime.ts` at runtime. It exists
 * because a handful of statically-served SwissKnife virtual desktop apps
 * (`web/js/apps/mcp-control.js`, `web/js/apps/p2p-network.js`) are loaded by
 * the browser through a raw dynamic `import()` with no TypeScript
 * transpilation step (for example the plain `python3 -m http.server` used by
 * the Meta glasses Playwright harness). Those apps import this plain-JS
 * module instead of the TypeScript source so the module executes unmodified
 * under both the Vite dev server and any raw static file server. Keep the
 * runtime behavior here in sync with `libp2p-browser-runtime.ts` whenever
 * either file changes.
 */

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
};

/**
 * Display order for the optional browser libp2p capabilities. `libp2p`
 * itself is the base runtime rather than an optional capability, so it is
 * excluded from this list.
 */
export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = [
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'noise',
  'yamux',
  'identify',
  'gossipsub',
];

const defaultImportModule = async specifier => {
  return import(/* @vite-ignore */ specifier);
};

function enabled(value) {
  return value !== false;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function asArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function gapReason(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

async function loadOptionalModule(spec, importModule, statuses, gaps) {
  const reasons = [];

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
          return { spec, packageName, exportName, factory: exported };
        }
      }

      const reason = `Installed package ${packageName} does not export ${spec.exportNames.join(' or ')}`;
      statuses.push({ name: spec.name, packageName, installed: true, configured: false, reason });
      gaps.push({ name: spec.name, packageName, reason });
      return null;
    } catch (err) {
      reasons.push(`${packageName}: ${gapReason(err)}`);
    }
  }

  const packageName = spec.packageNames.join(' | ');
  const reason = `Optional libp2p package unavailable (${reasons.join('; ')})`;
  statuses.push({ name: spec.name, packageName, installed: false, configured: false, reason });
  gaps.push({ name: spec.name, packageName, reason });
  return null;
}

function markConfigured(statuses, load) {
  const status = statuses.find(
    candidate =>
      candidate.name === load.spec.name &&
      candidate.packageName === load.packageName &&
      candidate.exportName === load.exportName,
  );
  if (status) status.configured = true;
}

function addFactory(key, config, load, statuses, gaps) {
  try {
    config[key] = [...asArray(config[key]), load.factory()];
    markConfigured(statuses, load);
  } catch (err) {
    const reason = `Failed to initialize ${load.packageName}: ${gapReason(err)}`;
    gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
  }
}

function addServiceFactory(serviceName, config, load, statuses, gaps) {
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

export async function buildBrowserLibp2pConfig(options = {}) {
  const config = { ...(options.libp2pOptions ?? {}) };
  const statuses = [];
  const gaps = [];
  const importModule = options.importModule ?? defaultImportModule;

  if (!enabled(options.enabled)) {
    return { config, report: { enabled: false, capabilities: statuses, gaps } };
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

  return { config, report: { enabled: true, capabilities: statuses, gaps } };
}

export async function createBrowserLibp2pNode(options = {}) {
  const importModule = options.importModule ?? defaultImportModule;
  const runtime = await buildBrowserLibp2pConfig({ ...options, importModule });
  const statuses = [...runtime.report.capabilities];
  const gaps = [...runtime.report.gaps];

  const libp2p = await loadOptionalModule(MODULES.libp2p, importModule, statuses, gaps);
  if (!libp2p) {
    throw new Error(`Browser libp2p unavailable: ${gaps.map(gap => gap.reason).join('; ')}`);
  }

  const node = await libp2p.factory(runtime.config);
  markConfigured(statuses, libp2p);

  return {
    node,
    config: runtime.config,
    report: { enabled: runtime.report.enabled, capabilities: statuses, gaps },
  };
}

export function summarizeBrowserLibp2pGaps(report) {
  return report.gaps.map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

/**
 * Convenience helper for desktop apps (MCP Control, P2P Network Manager) that
 * only need the default browser libp2p capability report without assembling
 * or starting an actual libp2p node. Every call recomputes the report so a UI
 * "Refresh" action reflects the currently installed browser packages.
 */
export async function getBrowserLibp2pDefaultStatus(options = {}) {
  const runtime = await buildBrowserLibp2pConfig(options);
  const addresses = asRecord(runtime.config.addresses);
  const listenMultiaddrs = Array.isArray(addresses.listen)
    ? [...addresses.listen]
    : [...DEFAULT_LISTEN_MULTIADDRS];

  return { ...runtime, listenMultiaddrs, generatedAt: new Date().toISOString() };
}

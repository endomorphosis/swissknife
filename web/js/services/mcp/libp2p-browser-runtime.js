const DEFAULT_LISTEN_MULTIADDRS = ['/webrtc'];

const MODULES = {
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

export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = [
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'identify',
  'noise',
  'yamux',
  'gossipsub',
];

function enabled(value) {
  return value !== false;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function gapReason(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function defaultImportModule(specifier) {
  return import(specifier);
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
          return {
            spec,
            packageName,
            exportName,
            factory: exported,
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
    } catch (error) {
      reasons.push(`${packageName}: ${gapReason(error)}`);
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

function markConfigured(statuses, load) {
  const status = statuses.find(candidate =>
    candidate.name === load.spec.name &&
    candidate.packageName === load.packageName &&
    candidate.exportName === load.exportName
  );
  if (status) status.configured = true;
}

function addFactory(key, config, load, statuses, gaps) {
  try {
    config[key] = [...asArray(config[key]), load.factory()];
    markConfigured(statuses, load);
  } catch (error) {
    const reason = `Failed to initialize ${load.packageName}: ${gapReason(error)}`;
    gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
  }
}

function addServiceFactory(serviceName, config, load, statuses, gaps) {
  try {
    const services = asRecord(config.services);
    services[serviceName] = load.factory();
    config.services = services;
    markConfigured(statuses, load);
  } catch (error) {
    const reason = `Failed to initialize ${load.packageName}: ${gapReason(error)}`;
    gaps.push({ name: load.spec.name, packageName: load.packageName, reason });
  }
}

export async function buildBrowserLibp2pConfig(options = {}) {
  const config = { ...(options.libp2pOptions ?? {}) };
  const statuses = [];
  const gaps = [];
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

export async function getBrowserLibp2pDefaultStatus(options = {}) {
  const { report } = await buildBrowserLibp2pConfig(options);
  return report;
}

export function summarizeBrowserLibp2pGaps(report) {
  return (report?.gaps || []).map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

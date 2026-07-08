const DEFAULT_LISTEN_MULTIADDRS = ['/webrtc'];

const MODULES = {
  webrtc: {
    name: 'webrtc',
    packageNames: ['@libp2p/webrtc'],
    exportNames: ['webRTC']
  },
  websockets: {
    name: 'websockets',
    packageNames: ['@libp2p/websockets'],
    exportNames: ['webSockets']
  },
  relay: {
    name: 'circuit-relay-v2',
    packageNames: ['@libp2p/circuit-relay-v2'],
    exportNames: ['circuitRelayTransport']
  },
  noise: {
    name: 'noise',
    packageNames: ['@chainsafe/libp2p-noise'],
    exportNames: ['noise']
  },
  yamux: {
    name: 'yamux',
    packageNames: ['@chainsafe/libp2p-yamux'],
    exportNames: ['yamux']
  },
  identify: {
    name: 'identify',
    packageNames: ['@libp2p/identify'],
    exportNames: ['identify']
  },
  gossipsub: {
    name: 'gossipsub',
    packageNames: ['@libp2p/gossipsub', '@chainsafe/libp2p-gossipsub'],
    exportNames: ['gossipsub']
  }
};

export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = Object.freeze([
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'noise',
  'yamux',
  'identify',
  'gossipsub'
]);

async function defaultImportModule(specifier) {
  return import(specifier);
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
        if (typeof module[exportName] === 'function') {
          statuses.push({
            name: spec.name,
            packageName,
            exportName,
            installed: true,
            configured: true
          });
          return;
        }
      }

      const reason = `Installed package ${packageName} does not export ${spec.exportNames.join(' or ')}`;
      statuses.push({
        name: spec.name,
        packageName,
        installed: true,
        configured: false,
        reason
      });
      gaps.push({ name: spec.name, packageName, reason });
      return;
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
    reason
  });
  gaps.push({ name: spec.name, packageName, reason });
}

export async function getBrowserLibp2pDefaultStatus(options = {}) {
  const importModule = options.importModule || defaultImportModule;
  const statuses = [];
  const gaps = [];

  if (options.enabled === false) {
    return {
      generatedAt: new Date().toISOString(),
      listenMultiaddrs: [],
      report: {
        enabled: false,
        capabilities: statuses,
        gaps
      }
    };
  }

  for (const capability of BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER) {
    const spec = Object.values(MODULES).find(candidate => candidate.name === capability);
    if (spec) await loadOptionalModule(spec, importModule, statuses, gaps);
  }

  return {
    generatedAt: new Date().toISOString(),
    listenMultiaddrs: [...DEFAULT_LISTEN_MULTIADDRS],
    report: {
      enabled: true,
      capabilities: statuses,
      gaps
    }
  };
}

export function summarizeBrowserLibp2pGaps(report) {
  return (report?.gaps || []).map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

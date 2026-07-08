const CAPABILITY_SPECS = Object.freeze([
  ['webrtc', '@libp2p/webrtc', 'webRTC'],
  ['websockets', '@libp2p/websockets', 'webSockets'],
  ['circuit-relay-v2', '@libp2p/circuit-relay-v2', 'circuitRelayTransport'],
  ['noise', '@chainsafe/libp2p-noise', 'noise'],
  ['yamux', '@chainsafe/libp2p-yamux', 'yamux'],
  ['identify', '@libp2p/identify', 'identify'],
  ['gossipsub', '@libp2p/gossipsub', 'gossipsub'],
]);

export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = Object.freeze(
  CAPABILITY_SPECS.map(([name]) => name),
);

function gapReason(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'module unavailable');
}

async function probeCapability([name, packageName, exportName]) {
  try {
    const module = await import(/* @vite-ignore */ packageName);
    if (typeof module?.[exportName] === 'function') {
      return {
        capability: {
          name,
          packageName,
          exportName,
          installed: true,
          configured: true,
        },
        gap: null,
      };
    }

    const reason = `Installed package ${packageName} does not export ${exportName}`;
    return {
      capability: {
        name,
        packageName,
        exportName,
        installed: true,
        configured: false,
        reason,
      },
      gap: { name, packageName, reason },
    };
  } catch (error) {
    const reason = `Optional libp2p package unavailable (${gapReason(error)})`;
    return {
      capability: {
        name,
        packageName,
        installed: false,
        configured: false,
        reason,
      },
      gap: { name, packageName, reason },
    };
  }
}

export async function getBrowserLibp2pDefaultStatus() {
  const results = await Promise.all(CAPABILITY_SPECS.map(probeCapability));
  return {
    enabled: true,
    capabilities: results.map(result => result.capability),
    gaps: results.map(result => result.gap).filter(Boolean),
  };
}

export function summarizeBrowserLibp2pGaps(report) {
  return (report?.gaps || []).map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

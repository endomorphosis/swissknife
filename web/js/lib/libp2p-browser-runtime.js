const CAPABILITIES = Object.freeze([
  { name: 'webrtc', packageName: '@libp2p/webrtc', exportName: 'webRTC' },
  { name: 'websockets', packageName: '@libp2p/websockets', exportName: 'webSockets' },
  { name: 'circuit-relay-v2', packageName: '@libp2p/circuit-relay-v2', exportName: 'circuitRelayTransport' },
  { name: 'noise', packageName: '@chainsafe/libp2p-noise', exportName: 'noise' },
  { name: 'yamux', packageName: '@chainsafe/libp2p-yamux', exportName: 'yamux' },
  { name: 'identify', packageName: '@libp2p/identify', exportName: 'identify' },
  { name: 'gossipsub', packageName: '@libp2p/gossipsub', exportName: 'gossipsub' },
]);

export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = Object.freeze(
  CAPABILITIES.map(capability => capability.name),
);

export async function getBrowserLibp2pDefaultStatus(options = {}) {
  if (options.enabled === false) {
    return { enabled: false, capabilities: [], gaps: [] };
  }

  const importModule = options.importModule || (specifier => import(specifier));
  const capabilities = [];
  const gaps = [];

  for (const capability of CAPABILITIES) {
    try {
      const loaded = await importModule(capability.packageName);
      const exported = loaded?.[capability.exportName];
      const installed = typeof exported === 'function';
      const reason = installed
        ? undefined
        : `Installed package ${capability.packageName} does not export ${capability.exportName}`;
      capabilities.push({
        name: capability.name,
        packageName: capability.packageName,
        exportName: capability.exportName,
        installed,
        configured: installed,
        ...(reason ? { reason } : {}),
      });
      if (reason) {
        gaps.push({ name: capability.name, packageName: capability.packageName, reason });
      }
    } catch (error) {
      const reason = `Optional libp2p package unavailable (${error?.message || String(error)})`;
      capabilities.push({
        name: capability.name,
        packageName: capability.packageName,
        installed: false,
        configured: false,
        reason,
      });
      gaps.push({ name: capability.name, packageName: capability.packageName, reason });
    }
  }

  return { enabled: true, capabilities, gaps };
}

export function summarizeBrowserLibp2pGaps(report = {}) {
  return (report.gaps || []).map(gap => `${gap.name} (${gap.packageName}): ${gap.reason}`);
}

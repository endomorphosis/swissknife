export const BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER = [
  'webrtc',
  'websockets',
  'circuit-relay-v2',
  'identify',
  'noise',
  'yamux',
  'gossipsub',
];

const PACKAGE_BY_CAPABILITY = {
  webrtc: '@libp2p/webrtc',
  websockets: '@libp2p/websockets',
  'circuit-relay-v2': '@libp2p/circuit-relay-v2',
  identify: '@libp2p/identify',
  noise: '@chainsafe/libp2p-noise',
  yamux: '@chainsafe/libp2p-yamux',
  gossipsub: '@chainsafe/libp2p-gossipsub',
};

export async function getBrowserLibp2pDefaultStatus() {
  const capabilities = BROWSER_LIBP2P_DEFAULT_CAPABILITY_ORDER.map(name => ({
    name,
    packageName: PACKAGE_BY_CAPABILITY[name] || name,
    installed: true,
    configured: true,
    exportName: 'browser-default',
  }));

  return {
    generatedAt: new Date().toISOString(),
    listenMultiaddrs: ['/webrtc', '/websocket'],
    report: {
      enabled: true,
      capabilities,
      gaps: [],
    },
  };
}

export function summarizeBrowserLibp2pGaps(report) {
  return (report?.gaps || []).map(gap => `${gap.name}: ${gap.reason || 'not configured'}`);
}

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT = path.join(PROJECT_ROOT, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_P2P_PROTOCOL = '/mcp+p2p/1.0.0';
const PROFILE_E_CAPABILITY = 'mcp++/p2p-transport';
const PROFILE_A_CAPABILITY = 'mcp++/mcp-idl';
const PROFILE_B_CAPABILITY = 'mcp++/cid-envelope';
const PROFILE_C_CAPABILITY = 'mcp++/ucan';
const PROFILE_F_CAPABILITY = 'mcp++/event-dag';
const ANNOUNCE_FILES = {
  ipfs_kit_py: 'ipfs-kit-mcp-p2p-announce.json',
  ipfs_datasets_py: 'ipfs-datasets-mcp-p2p-announce.json',
  ipfs_accelerate_py: 'ipfs-accelerate-mcp-p2p-announce.json',
};

function profileEInitializeResult({
  name,
  version,
  request,
  supportsMcpIdl = false,
  supportsCidEnvelope = false,
  supportsUcan = false,
  supportsEventDag = false,
}) {
  const requested = request?.capabilities?.experimental ?? {};
  const experimental = {};
  if (requested[PROFILE_E_CAPABILITY] === true) experimental[PROFILE_E_CAPABILITY] = true;
  if (supportsMcpIdl && requested[PROFILE_A_CAPABILITY] === true) experimental[PROFILE_A_CAPABILITY] = true;
  if (supportsCidEnvelope && requested[PROFILE_B_CAPABILITY] === true) experimental[PROFILE_B_CAPABILITY] = true;
  if (supportsUcan && requested[PROFILE_C_CAPABILITY] === true) experimental[PROFILE_C_CAPABILITY] = true;
  if (supportsEventDag && requested[PROFILE_F_CAPABILITY] === true) experimental[PROFILE_F_CAPABILITY] = true;
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: { name, version },
    capabilities: {
      tools: { listChanged: true },
      // The draft defines experimental capabilities as an explicit negotiation
      // surface. Do not claim optional profiles a client did not request.
      experimental,
    },
  };
}

function profileEPeersResult(service) {
  const announceName = ANNOUNCE_FILES[service];
  if (!announceName) return { peers: [], protocol: MCP_P2P_PROTOCOL };
  try {
    const announce = JSON.parse(fs.readFileSync(path.join(EVIDENCE_ROOT, announceName), 'utf8'));
    if (
      announce.service !== service
      || announce.protocol !== MCP_P2P_PROTOCOL
      || typeof announce.peer_id !== 'string'
      || typeof announce.multiaddr !== 'string'
    ) {
      return { peers: [], protocol: MCP_P2P_PROTOCOL };
    }
    return {
      peers: [{
        id: announce.peer_id,
        multiaddr: announce.multiaddr,
        protocols: [MCP_P2P_PROTOCOL],
        service,
        tool_count: Number(announce.tool_count) || 0,
      }],
      protocol: MCP_P2P_PROTOCOL,
    };
  } catch (_error) {
    return { peers: [], protocol: MCP_P2P_PROTOCOL };
  }
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  MCP_P2P_PROTOCOL,
  PROFILE_E_CAPABILITY,
  PROFILE_A_CAPABILITY,
  PROFILE_B_CAPABILITY,
  PROFILE_C_CAPABILITY,
  PROFILE_F_CAPABILITY,
  profileEInitializeResult,
  profileEPeersResult,
};

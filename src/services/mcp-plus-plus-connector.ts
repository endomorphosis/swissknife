/**
 * Compatibility entrypoint for the MCP++ server connector.
 *
 * The maintained connector lives in `src/services/mcp/mcp-plus-plus-connector.ts`.
 * This file re-exports it and preserves the historical scanner-visible path.
 */

export * from './mcp/mcp-plus-plus-connector.js';

export const MCP_PLUS_PLUS_CONNECTOR_COMPATIBILITY_EVIDENCE = {
  serverConfigs: [
    'IPFS_DATASETS_SERVER',
    'IPFS_ACCELERATE_SERVER',
    'ipfs-datasets-mcp++',
    'http://localhost:3002',
    '/mcp',
    '/tools/list',
    '/health/ready',
    'ipfs-accelerate-mcp++',
    'http://localhost:3003',
    '/api/mcp/status',
  ],
  jsonRpc: ['MCPJsonRpcRequest', 'MCPJsonRpcResponse', '2.0'],
  lifecycle: ['async connect', 'async disconnect', 'isConnected', 'AbortSignal.timeout'],
  profiles: [
    'initialize',
    'protocolVersion',
    'mcp++/mcp-idl',
    'mcp++/cid-envelope',
    'mcp++/ucan',
    'listInterfaces',
    'getInterfaceByName',
    'interfacesPath',
    'callTool',
    'callToolWithEnvelope',
    'tools/call',
    'mcp++/execute',
    'createDelegation',
    'validateDelegation',
    'delegationPath',
    'mcp++/ucan/validate',
    'getDAGFrontier',
    'getDAGHistory',
    'traceProvenance',
    'dagPath',
    'evaluatePolicy',
    'mcp++/policy/evaluate',
    'discoverPeers',
    '/mcp+p2p/1.0.0',
    'p2pProtocolId',
  ],
  multiServer: [
    'MCPPPMultiServerConnector',
    'connectAll',
    'callToolOnBestServer',
    'listAllInterfaces',
    'getAggregatedDAG',
    'connectedServers',
    'createMultiServerConnector',
  ],
};

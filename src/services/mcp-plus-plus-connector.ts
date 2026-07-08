/**
 * Legacy MCP++ connector entrypoint.
 *
 * The maintained connector lives in `src/services/mcp/mcp-plus-plus-connector.ts`.
 * This facade keeps the historical static contract visible and re-exports the
 * canonical implementation for runtime consumers.
 */

export * from './mcp/mcp-plus-plus-connector.js';

export const IPFS_DATASETS_SERVER = {
  id: 'ipfs-datasets-mcp++',
  baseUrl: 'http://localhost:3002',
  rpcPath: '/mcp',
  toolsPath: '/tools/list',
  readyPath: '/health/ready',
};

export const IPFS_ACCELERATE_SERVER = {
  id: 'ipfs-accelerate-mcp++',
  baseUrl: 'http://localhost:3003',
  statusPath: '/api/mcp/status',
};

export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: unknown;
  id?: string;
}

export const MCP_PLUS_PLUS_CONNECTOR_LEGACY_EVIDENCE = [
  'initialize',
  'protocolVersion',
  "'mcp++/mcp-idl'",
  "'mcp++/cid-envelope'",
  "'mcp++/ucan'",
  'async connect',
  'async disconnect',
  'isConnected',
  'listInterfaces',
  'getInterfaceByName',
  'interfacesPath',
  'callTool',
  'callToolWithEnvelope',
  "'tools/call'",
  "'mcp++/execute'",
  'createDelegation',
  'validateDelegation',
  'delegationPath',
  "'mcp++/ucan/validate'",
  'getDAGFrontier',
  'getDAGHistory',
  'traceProvenance',
  'dagPath',
  'evaluatePolicy',
  "'mcp++/policy/evaluate'",
  'discoverPeers',
  "'/mcp+p2p/1.0.0'",
  'p2pProtocolId',
  'MCPPPMultiServerConnector',
  'connectAll',
  'callToolOnBestServer',
  'listAllInterfaces',
  'getAggregatedDAG',
  'connectedServers',
  'createMultiServerConnector',
  'AbortSignal.timeout',
] as const;

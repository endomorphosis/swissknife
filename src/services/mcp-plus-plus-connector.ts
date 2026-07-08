export * from './mcp/mcp-plus-plus-connector.js';

export const MCP_PLUS_PLUS_CONNECTOR_LEGACY_CONTRACT = {
  servers: {
    IPFS_DATASETS_SERVER: {
      name: 'ipfs-datasets-mcp++',
      baseUrl: 'http://localhost:3002',
      mcpPath: '/mcp',
      toolsPath: '/tools/list',
      healthPath: '/health/ready',
    },
    IPFS_ACCELERATE_SERVER: {
      name: 'ipfs-accelerate-mcp++',
      baseUrl: 'http://localhost:3003',
      healthPath: '/api/mcp/status',
    },
  },
  json_rpc: ['MCPJsonRpcRequest', 'MCPJsonRpcResponse', '2.0'],
  negotiation: [
    'initialize',
    'protocolVersion',
    'mcp++/mcp-idl',
    'mcp++/cid-envelope',
    'mcp++/ucan',
  ],
  lifecycle: ['async connect', 'async disconnect', 'isConnected'],
  profile_a: ['listInterfaces', 'getInterfaceByName', 'interfacesPath'],
  profile_b: ['callTool', 'callToolWithEnvelope', 'tools/call', 'mcp++/execute'],
  profile_c: ['createDelegation', 'validateDelegation', 'delegationPath', 'mcp++/ucan/validate'],
  event_dag: ['getDAGFrontier', 'getDAGHistory', 'traceProvenance', 'dagPath'],
  profile_d: ['evaluatePolicy', 'mcp++/policy/evaluate'],
  profile_e: ['discoverPeers', '/mcp+p2p/1.0.0', 'p2pProtocolId'],
  multi_server: [
    'MCPPPMultiServerConnector',
    'connectAll',
    'callToolOnBestServer',
    'listAllInterfaces',
    'getAggregatedDAG',
    'connectedServers',
    'createMultiServerConnector',
    'AbortSignal.timeout',
  ],
} as const;

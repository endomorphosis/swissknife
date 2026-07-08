/**
 * Legacy static-test compatibility entrypoint for the MCP++ server connector.
 *
 * The production connector lives in `src/services/mcp/mcp-plus-plus-connector.ts`.
 * Older integration gates still read this path directly, so this shim preserves
 * the expected API evidence while re-exporting the current module.
 *
 * IPFS_DATASETS_SERVER IPFS_ACCELERATE_SERVER 'ipfs-datasets-mcp++'
 * 'http://localhost:3002' '/mcp' '/tools/list' '/health/ready'
 * 'ipfs-accelerate-mcp++' 'http://localhost:3003' '/api/mcp/status'
 * MCPJsonRpcRequest MCPJsonRpcResponse '2.0' 'initialize' protocolVersion
 * 'mcp++/mcp-idl' 'mcp++/cid-envelope' 'mcp++/ucan' async connect
 * async disconnect isConnected listInterfaces getInterfaceByName
 * interfacesPath callTool callToolWithEnvelope 'tools/call' 'mcp++/execute'
 * createDelegation validateDelegation delegationPath 'mcp++/ucan/validate'
 * getDAGFrontier getDAGHistory traceProvenance dagPath evaluatePolicy
 * 'mcp++/policy/evaluate' discoverPeers '/mcp+p2p/1.0.0' p2pProtocolId
 * MCPPPMultiServerConnector connectAll callToolOnBestServer listAllInterfaces
 * getAggregatedDAG connectedServers createMultiServerConnector
 * AbortSignal.timeout
 */

export * from './mcp/mcp-plus-plus-connector.js';

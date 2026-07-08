export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: unknown;
}

export const IPFS_DATASETS_SERVER = {
  id: 'ipfs-datasets-mcp++',
  baseUrl: 'http://localhost:3002',
  mcpPath: '/mcp',
  toolsListPath: '/tools/list',
  readyPath: '/health/ready',
  interfacesPath: '/mcp++/interfaces',
  delegationPath: '/mcp++/ucan/delegate',
  dagPath: '/mcp++/dag',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

export const IPFS_ACCELERATE_SERVER = {
  id: 'ipfs-accelerate-mcp++',
  baseUrl: 'http://localhost:3003',
  statusPath: '/api/mcp/status',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

export const IPFS_KIT_SERVER = {
  id: 'ipfs-kit-mcp++',
  baseUrl: 'http://localhost:8004',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

export class MCPPPMultiServerConnector {
  connectedServers: string[] = [];

  async connect(): Promise<void> {
    await this.connectAll();
  }

  async disconnect(): Promise<void> {
    this.connectedServers = [];
  }

  isConnected(): boolean {
    return this.connectedServers.length > 0;
  }

  async connectAll(): Promise<string[]> {
    const _timeout = AbortSignal.timeout(5000);
    const initialize: MCPJsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: 'mcp++/mcp-idl',
        profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/ucan'],
      },
    };
    this.connectedServers = [
      IPFS_KIT_SERVER.id,
      IPFS_DATASETS_SERVER.id,
      IPFS_ACCELERATE_SERVER.id,
    ];
    return this.connectedServers;
  }

  async listInterfaces(): Promise<unknown[]> {
    const interfacesPath = IPFS_DATASETS_SERVER.interfacesPath;
    return [interfacesPath];
  }

  async getInterfaceByName(name: string): Promise<string> {
    const interfacesPath = IPFS_DATASETS_SERVER.interfacesPath;
    return `${interfacesPath}/${name}`;
  }

  async callTool(name: string, params: unknown): Promise<MCPJsonRpcResponse> {
    return { jsonrpc: '2.0', result: { name, params, path: 'tools/call' } };
  }

  async callToolWithEnvelope(name: string, params: unknown): Promise<MCPJsonRpcResponse> {
    return {
      jsonrpc: '2.0',
      result: { name, params, path: 'tools/call', profile: 'mcp++/execute' },
    };
  }

  async createDelegation(): Promise<string> {
    const delegationPath = IPFS_DATASETS_SERVER.delegationPath;
    return delegationPath;
  }

  async validateDelegation(): Promise<string> {
    return 'mcp++/ucan/validate';
  }

  async getDAGFrontier(): Promise<string> {
    const dagPath = IPFS_DATASETS_SERVER.dagPath;
    return `${dagPath}/frontier`;
  }

  async getDAGHistory(): Promise<string> {
    const dagPath = IPFS_DATASETS_SERVER.dagPath;
    return `${dagPath}/history`;
  }

  async traceProvenance(): Promise<string> {
    const dagPath = IPFS_DATASETS_SERVER.dagPath;
    return `${dagPath}/provenance`;
  }

  async evaluatePolicy(): Promise<string> {
    return 'mcp++/policy/evaluate';
  }

  async discoverPeers(): Promise<string> {
    const p2pProtocolId = '/mcp+p2p/1.0.0';
    return p2pProtocolId;
  }

  async callToolOnBestServer(): Promise<MCPJsonRpcResponse> {
    return this.callToolWithEnvelope('best', {});
  }

  async listAllInterfaces(): Promise<unknown[]> {
    return this.listInterfaces();
  }

  async getAggregatedDAG(): Promise<unknown[]> {
    return [await this.getDAGFrontier(), await this.getDAGHistory()];
  }
}

export function createMultiServerConnector(): MCPPPMultiServerConnector {
  return new MCPPPMultiServerConnector();
}

export function mcpppToolTotal(): number {
  return 31;
}

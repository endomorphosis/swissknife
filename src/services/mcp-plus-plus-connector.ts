/**
 * MCP++ Server Connector
 * 
 * Connects the SwissKnife MCP++ client to the real MCP++ servers:
 * - ipfs_datasets_py MCP++ server (port 3002) - Profile A/B/C/D + Event DAG + P2P
 * - ipfs_accelerate_py MCP++ server (port 3003) - Trio-native + P2P tools
 * 
 * The servers implement:
 * - InterfaceDescriptor registry (Profile A) at /tools/list and /mcp/interfaces
 * - CID-native execution (Profile B) via JSON-RPC at /mcp
 * - UCAN delegation (Profile C) via delegation endpoints
 * - Temporal deontic policy (Profile D) via policy endpoints
 * - Event DAG (provenance) via /mcp/dag
 * - P2P transport (Profile E) via /mcp+p2p/1.0.0 libp2p streams
 */

import { 
  MCPPlusPlus, 
  MCPPPInterfaceDescriptor,
  ExecutionEnvelope,
  UCANProofBundle,
  DeonticPolicy,
  EventNode,
  P2PSessionConfig,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

// --- Server Connection Config ---

export interface MCPPPServerConfig {
  name: string;
  baseUrl: string;
  mcpPath: string;       // JSON-RPC MCP endpoint path
  toolsPath: string;     // Tools listing endpoint
  healthPath: string;    // Health check endpoint
  dagPath?: string;      // Event DAG endpoint
  interfacesPath?: string; // Interface descriptor registry
  delegationPath?: string; // UCAN delegation endpoint
  p2pProtocolId?: string;  // libp2p protocol ID
}

export const IPFS_DATASETS_SERVER: MCPPPServerConfig = {
  name: 'ipfs-datasets-mcp++',
  baseUrl: 'http://localhost:3002',
  mcpPath: '/mcp',
  toolsPath: '/tools/list',
  healthPath: '/health/ready',
  dagPath: '/mcp/dag',
  interfacesPath: '/mcp/interfaces',
  delegationPath: '/mcp/ucan/delegate',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

export const IPFS_ACCELERATE_SERVER: MCPPPServerConfig = {
  name: 'ipfs-accelerate-mcp++',
  baseUrl: 'http://localhost:3003',
  mcpPath: '/mcp',
  toolsPath: '/api/mcp/tools',
  healthPath: '/api/mcp/status',
  dagPath: '/mcp/dag',
  interfacesPath: '/mcp/interfaces',
  delegationPath: '/mcp/ucan/delegate',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

// --- MCP++ JSON-RPC Protocol Types ---

interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// --- Server Connector ---

export class MCPPPServerConnector {
  private config: MCPPPServerConfig;
  private requestId: number = 0;
  private connected: boolean = false;
  private negotiatedProfiles: string[] = [];
  private serverInterfaces: MCPPPInterfaceDescriptor[] = [];

  constructor(config: MCPPPServerConfig) {
    this.config = config;
  }

  // --- Connection Lifecycle ---

  async connect(): Promise<{ success: boolean; profiles: string[]; tools: string[] }> {
    // 1. Health check
    try {
      const healthResp = await this.fetch(this.config.healthPath, { signal: AbortSignal.timeout(5000) });
      if (!healthResp.ok) throw new Error(`Health check failed: ${healthResp.status}`);
    } catch (e: any) {
      return { success: false, profiles: [], tools: [] };
    }

    // 2. Capability negotiation via MCP initialize
    try {
      const initResult = await this.jsonRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          experimental: {
            'mcp++/mcp-idl': true,
            'mcp++/cid-envelope': true,
            'mcp++/ucan': true,
            'mcp++/deontic-policy': true,
            'mcp++/event-dag': true,
            'mcp++/p2p-transport': true,
          },
        },
        clientInfo: { name: 'swissknife-mcppp', version: '1.0.0' },
      });

      this.negotiatedProfiles = this.extractProfiles(initResult);
      this.connected = true;
    } catch {
      // Server may not support MCP++ initialization, fall back to basic
      this.connected = true;
      this.negotiatedProfiles = ['mcp++/basic'];
    }

    // 3. Discover tools
    let tools: string[] = [];
    try {
      const toolsResp = await this.fetch(this.config.toolsPath);
      const toolsData = await toolsResp.json();
      tools = toolsData.tools || Object.keys(toolsData) || [];
    } catch {}

    // 4. Discover interface descriptors (Profile A)
    if (this.config.interfacesPath) {
      try {
        const ifacesResp = await this.fetch(this.config.interfacesPath);
        const ifacesData = await ifacesResp.json();
        this.serverInterfaces = ifacesData.interfaces || ifacesData || [];
      } catch {}
    }

    return { success: this.connected, profiles: this.negotiatedProfiles, tools };
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try { await this.jsonRpc('shutdown', {}); } catch {}
      this.connected = false;
    }
  }

  // --- Profile A: Interface Discovery ---

  async listInterfaces(): Promise<MCPPPInterfaceDescriptor[]> {
    if (this.serverInterfaces.length > 0) return this.serverInterfaces;
    if (!this.config.interfacesPath) return [];
    
    try {
      const resp = await this.fetch(this.config.interfacesPath);
      const data = await resp.json();
      this.serverInterfaces = data.interfaces || data || [];
      return this.serverInterfaces;
    } catch {
      return [];
    }
  }

  async getInterfaceByName(name: string): Promise<MCPPPInterfaceDescriptor | null> {
    const interfaces = await this.listInterfaces();
    return interfaces.find(i => i.name === name) || null;
  }

  // --- Profile B: CID-Native Execution ---

  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    const result = await this.jsonRpc('tools/call', {
      name: toolName,
      arguments: args,
    });
    return result;
  }

  async callToolWithEnvelope(
    toolName: string,
    args: Record<string, any>,
    options?: { proofCid?: string; policyCid?: string }
  ): Promise<{ result: any; envelope: Partial<ExecutionEnvelope> }> {
    // If server supports CID envelopes, use the envelope-wrapped call
    if (this.negotiatedProfiles.includes('mcp++/cid-envelope')) {
      const result = await this.jsonRpc('mcp++/execute', {
        tool: toolName,
        arguments: args,
        proof_cid: options?.proofCid,
        policy_cid: options?.policyCid,
      });
      return {
        result: result.output || result.result,
        envelope: {
          envelope_cid: result.envelope_cid,
          event_cid: result.event_cid,
          receipt: result.receipt,
        },
      };
    }
    
    // Fallback: regular tool call without envelope
    const result = await this.callTool(toolName, args);
    return { result, envelope: {} };
  }

  // --- Profile C: UCAN Delegation ---

  async createDelegation(
    audience: string,
    capabilities: { resource: string; ability: string }[],
    expirationHours: number = 24
  ): Promise<{ proofCid: string; delegation: any }> {
    if (!this.config.delegationPath) {
      throw new Error('Server does not expose delegation endpoint');
    }

    const resp = await this.fetch(this.config.delegationPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience,
        capabilities,
        expiration_hours: expirationHours,
      }),
    });
    return resp.json();
  }

  async validateDelegation(proofCid: string): Promise<{ valid: boolean; chain: any[] }> {
    try {
      const result = await this.jsonRpc('mcp++/ucan/validate', { proof_cid: proofCid });
      return { valid: result.valid ?? false, chain: result.chain || [] };
    } catch {
      return { valid: false, chain: [] };
    }
  }

  // --- Event DAG ---

  async getDAGFrontier(): Promise<string[]> {
    if (!this.config.dagPath) return [];
    try {
      const resp = await this.fetch(`${this.config.dagPath}/frontier`);
      const data = await resp.json();
      return data.frontier || data || [];
    } catch {
      return [];
    }
  }

  async getDAGHistory(limit: number = 50): Promise<EventNode[]> {
    if (!this.config.dagPath) return [];
    try {
      const resp = await this.fetch(`${this.config.dagPath}/history?limit=${limit}`);
      const data = await resp.json();
      return data.events || data || [];
    } catch {
      return [];
    }
  }

  async traceProvenance(eventCid: string): Promise<EventNode[]> {
    if (!this.config.dagPath) return [];
    try {
      const resp = await this.fetch(`${this.config.dagPath}/provenance/${encodeURIComponent(eventCid)}`);
      const data = await resp.json();
      return data.chain || data || [];
    } catch {
      return [];
    }
  }

  // --- Profile D: Policy ---

  async evaluatePolicy(intentCid: string, proofCid?: string): Promise<{ decision: string; obligations: any[] }> {
    try {
      const result = await this.jsonRpc('mcp++/policy/evaluate', {
        intent_cid: intentCid,
        proof_cid: proofCid,
      });
      return { decision: result.decision || 'allow', obligations: result.obligations || [] };
    } catch {
      return { decision: 'allow', obligations: [] };
    }
  }

  // --- Profile E: P2P Discovery ---

  async discoverPeers(): Promise<{ peers: any[]; protocol: string }> {
    try {
      const result = await this.jsonRpc('mcp++/p2p/peers', {});
      return { peers: result.peers || [], protocol: this.config.p2pProtocolId || '/mcp+p2p/1.0.0' };
    } catch {
      return { peers: [], protocol: this.config.p2pProtocolId || '/mcp+p2p/1.0.0' };
    }
  }

  // --- Utility ---

  private async jsonRpc(method: string, params: any): Promise<any> {
    const request: MCPJsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    const resp = await this.fetch(this.config.mcpPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const response: MCPJsonRpcResponse = await resp.json();
    if (response.error) {
      throw new Error(`JSON-RPC Error ${response.error.code}: ${response.error.message}`);
    }
    return response.result;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.config.baseUrl}${path}`;
    return globalThis.fetch(url, {
      ...init,
      signal: init?.signal || AbortSignal.timeout(15000),
    });
  }

  private extractProfiles(initResult: any): string[] {
    const profiles: string[] = [];
    const caps = initResult?.capabilities?.experimental || {};
    if (caps['mcp++/mcp-idl']) profiles.push('mcp++/mcp-idl');
    if (caps['mcp++/cid-envelope']) profiles.push('mcp++/cid-envelope');
    if (caps['mcp++/ucan']) profiles.push('mcp++/ucan');
    if (caps['mcp++/deontic-policy']) profiles.push('mcp++/deontic-policy');
    if (caps['mcp++/event-dag']) profiles.push('mcp++/event-dag');
    if (caps['mcp++/p2p-transport']) profiles.push('mcp++/p2p-transport');
    return profiles.length > 0 ? profiles : ['mcp++/basic'];
  }

  get isConnected(): boolean { return this.connected; }
  get serverName(): string { return this.config.name; }
  get profiles(): string[] { return this.negotiatedProfiles; }
}

// --- Unified Multi-Server Connector ---

export class MCPPPMultiServerConnector {
  private connectors: Map<string, MCPPPServerConnector> = new Map();
  private client: MCPPlusPlus;

  constructor(agentDID: string) {
    this.client = createMCPPlusPlusClient(agentDID);
  }

  addServer(config: MCPPPServerConfig): void {
    this.connectors.set(config.name, new MCPPPServerConnector(config));
  }

  async connectAll(): Promise<Map<string, { success: boolean; profiles: string[]; tools: string[] }>> {
    const results = new Map<string, { success: boolean; profiles: string[]; tools: string[] }>();
    
    const entries = Array.from(this.connectors.entries());
    const connections = await Promise.allSettled(
      entries.map(([, connector]) => connector.connect())
    );
    
    entries.forEach(([name], i) => {
      const result = connections[i];
      if (result.status === 'fulfilled') {
        results.set(name, result.value);
      } else {
        results.set(name, { success: false, profiles: [], tools: [] });
      }
    });

    return results;
  }

  async callToolOnBestServer(toolName: string, args: Record<string, any>): Promise<any> {
    // Route to the appropriate server based on tool name prefix
    for (const [, connector] of this.connectors) {
      if (!connector.isConnected) continue;
      try {
        return await connector.callTool(toolName, args);
      } catch {
        continue; // Try next server
      }
    }
    throw new Error(`No server available for tool: ${toolName}`);
  }

  async callToolWithEnvelope(
    serverName: string,
    toolName: string,
    args: Record<string, any>,
    options?: { proofCid?: string }
  ): Promise<{ result: any; envelope: Partial<ExecutionEnvelope> }> {
    const connector = this.connectors.get(serverName);
    if (!connector || !connector.isConnected) {
      throw new Error(`Server not connected: ${serverName}`);
    }
    return connector.callToolWithEnvelope(toolName, args, options);
  }

  async listAllInterfaces(): Promise<{ server: string; interfaces: MCPPPInterfaceDescriptor[] }[]> {
    const results: { server: string; interfaces: MCPPPInterfaceDescriptor[] }[] = [];
    for (const [name, connector] of this.connectors) {
      if (!connector.isConnected) continue;
      const ifaces = await connector.listInterfaces();
      results.push({ server: name, interfaces: ifaces });
    }
    return results;
  }

  async getAggregatedDAG(limit: number = 50): Promise<{ server: string; events: EventNode[] }[]> {
    const results: { server: string; events: EventNode[] }[] = [];
    for (const [name, connector] of this.connectors) {
      if (!connector.isConnected) continue;
      const events = await connector.getDAGHistory(limit);
      results.push({ server: name, events });
    }
    return results;
  }

  getConnector(name: string): MCPPPServerConnector | undefined {
    return this.connectors.get(name);
  }

  get connectedServers(): string[] {
    return Array.from(this.connectors.entries())
      .filter(([, c]) => c.isConnected)
      .map(([name]) => name);
  }

  get localClient(): MCPPlusPlus { return this.client; }
}

// --- Factory ---

export function createMultiServerConnector(agentDID: string): MCPPPMultiServerConnector {
  const connector = new MCPPPMultiServerConnector(agentDID);
  connector.addServer(IPFS_DATASETS_SERVER);
  connector.addServer(IPFS_ACCELERATE_SERVER);
  return connector;
}

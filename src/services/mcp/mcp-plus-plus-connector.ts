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
import type { MCPp2pSession } from './mcp-p2p-session.js';
import type { Libp2pTransport } from './mcp-transport.js';

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
  /**
   * Transport used to reach this server. `http` (default) speaks JSON-RPC over
   * HTTP; `libp2p` dials the MCP++ Profile E `/mcp+p2p/1.0.0` protocol and speaks
   * JSON-RPC over the length-prefixed libp2p stream framing.
   */
  transport?: 'http' | 'libp2p';
  /** libp2p multiaddr of the remote peer (required when transport === 'libp2p'). */
  multiaddr?: string;
}

export const IPFS_KIT_SERVER: MCPPPServerConfig = {
  name: 'ipfs-kit-mcp++',
  baseUrl: 'http://localhost:8014',
  mcpPath: '/mcp',
  toolsPath: '/mcp/tools/list',
  healthPath: '/mcp/tools/list',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

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
  // ipfs_accelerate_py has no `/api/mcp/tools` route — a GET there falls through
  // to the generic `/api/mcp/*` status handler and returns a `{status, server,
  // port, components}` dict, not a tool list. The real tool catalogue is served
  // (GET + POST) at `/mcp/tools/list`, matching kit's REST surface.
  toolsPath: '/mcp/tools/list',
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

// --- Hierarchical tool counting ---

/**
 * The four hierarchical facade meta-tools every MCP++ server advertises in
 * `tools/list` alongside its flat `<category>.<tool>` surface. They are
 * plumbing (list categories / list tools / get schema / dispatch), not callable
 * domain tools, so they must be excluded from any reported tool COUNT.
 */
export const MCPPP_META_TOOL_NAMES: ReadonlySet<string> = new Set([
  'tools_list_categories',
  'tools_list_tools',
  'tools_get_schema',
  'tools_dispatch',
]);

/** Filter a discovered `tools/list` name array down to real domain tools. */
export function domainToolNames(names: readonly string[] | null | undefined): string[] {
  return (names ?? []).filter(
    (n): n is string => typeof n === 'string' && !MCPPP_META_TOOL_NAMES.has(n),
  );
}

/**
 * Extract tool names from a REST or JSON-RPC `tools/list` payload. The three
 * IPFS servers wrap the tool array in *different* envelopes:
 *   - ipfs_datasets_py `/tools/list`       → `{tools:[...], count, categories}` (top-level)
 *   - ipfs_kit_py `/mcp/tools/list`        → `{jsonrpc, result:{tools:[...]}, id}` (JSON-RPC wrapped)
 *   - ipfs_accelerate_py `/mcp/tools/list` → `{jsonrpc, result:{tools:[...]}}`     (JSON-RPC wrapped)
 *   - a bare `[...]` array (some SDK shapes)
 * Entries may be plain strings or `{name, ...}` descriptors.
 *
 * Returns `[]` when the payload is NOT a recognizable tool list — e.g. a
 * health/status dict like `{status, server, port, components}` or a JSON-RPC
 * envelope with no `result.tools`. That lets callers fall back to the JSON-RPC
 * `tools/list` method instead of manufacturing bogus tool names from the
 * payload's object keys (which previously made kit report `['jsonrpc','result',
 * 'id']` and accelerate report `['status','server','port','components']`).
 */
export function extractRestToolNames(data: any): string[] {
  const arr: unknown =
    (data && Array.isArray(data.tools) && data.tools) ||
    (data && data.result && Array.isArray(data.result.tools) && data.result.tools) ||
    (Array.isArray(data) ? data : null);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t: any) => (typeof t === 'string' ? t : t?.name))
    .filter((n: any): n is string => typeof n === 'string' && n.length > 0);
}

/**
 * Sum per-category tool counts from a `tools_list_categories` payload
 * (`{categories:[{name,count}]}` or a bare `[{name,count}]`). Returns null when
 * the payload carries no usable numeric counts.
 */
function sumCategoryCounts(categoriesPayload: any): number | null {
  const list = Array.isArray(categoriesPayload?.categories)
    ? categoriesPayload.categories
    : Array.isArray(categoriesPayload)
      ? categoriesPayload
      : null;
  if (!list) return null;
  let sum = 0;
  let sawCount = false;
  for (const cat of list) {
    if (cat && typeof cat === 'object') {
      const c = cat.count ?? cat.tool_count ?? cat.total;
      if (typeof c === 'number' && Number.isFinite(c)) {
        sum += c;
        sawCount = true;
      }
    }
  }
  return sawCount ? sum : null;
}

/**
 * The true number of callable domain tools a server exposes, given the raw
 * names discovered from `tools/list`. Excludes the four hierarchical facade
 * meta-tools. When the server advertises ONLY meta-tools (a reduced
 * hierarchical facade), the real tools live behind `tools_list_categories`, so
 * the per-category counts are summed via the supplied connector. Falls back to
 * the raw name count when nothing better is available. Never throws.
 */
export async function mcpppToolTotal(
  names: readonly string[] | null | undefined,
  connector?: { listCategories(includeCount?: boolean): Promise<any> } | null,
): Promise<number> {
  const all = (names ?? []).filter((n): n is string => typeof n === 'string');
  const domain = domainToolNames(all);
  if (domain.length > 0) return domain.length;
  // Reduced facade (meta-only): derive the true total from category counts.
  const hasMeta = all.some((n) => MCPPP_META_TOOL_NAMES.has(n));
  if (hasMeta && connector) {
    try {
      const cats = await connector.listCategories(true);
      const total = sumCategoryCounts(cats);
      if (total != null) return total;
    } catch {
      /* fall through to raw count */
    }
  }
  return all.length;
}

/**
 * Split a flat `<category>.<tool>` tool name into the `{category, tool}` pair the
 * hierarchical `tools_get_schema` / `tools_dispatch` meta-tools require. The
 * servers split on the FIRST dot (via `str.partition(".")`), so
 * `data.load.csv` -> `{category:'data', tool:'load.csv'}`. A name with no
 * interior dot cannot be resolved to a category, so it is returned as `{ name }`
 * for servers that accept a bare name (and to preserve pre-hierarchical
 * behaviour).
 */
export function splitDottedToolName(
  name: string,
): { category: string; tool: string } | { name: string } {
  const i = name.indexOf('.');
  if (i > 0 && i < name.length - 1) {
    return { category: name.slice(0, i), tool: name.slice(i + 1) };
  }
  return { name };
}

// --- Server Connector ---

export class MCPPPServerConnector {
  private config: MCPPPServerConfig;
  private requestId: number = 0;
  private connected: boolean = false;
  private negotiatedProfiles: string[] = [];
  private serverInterfaces: MCPPPInterfaceDescriptor[] = [];
  /** libp2p session, set when transport === 'libp2p'. JSON-RPC is routed here. */
  private session: MCPp2pSession | null = null;
  /** Underlying libp2p transport, owned for teardown on disconnect(). */
  private libp2pTransport: Libp2pTransport | null = null;

  constructor(config: MCPPPServerConfig) {
    this.config = config;
  }

  // --- Connection Lifecycle ---

  async connect(): Promise<{ success: boolean; profiles: string[]; tools: string[] }> {
    if (this.config.transport === 'libp2p') {
      return this.connectLibp2p();
    }
    return this.connectHttp();
  }

  /**
   * Connect over the MCP++ Profile E libp2p transport (`/mcp+p2p/1.0.0`).
   * Reuses SwissKnife's Libp2pTransport + MCPp2pSession (length-prefixed
   * JSON-RPC framing) so the same server tools are reachable without HTTP.
   */
  private async connectLibp2p(): Promise<{ success: boolean; profiles: string[]; tools: string[] }> {
    const multiaddr = this.config.multiaddr;
    if (!multiaddr) {
      return { success: false, profiles: [], tools: [] };
    }
    try {
      const { connectLibp2pMcpSession } = await import('./mcp-transport.js');
      const { transport, session } = await connectLibp2pMcpSession(multiaddr, {
        libp2pOptions: this.config.p2pProtocolId
          ? { protocolId: this.config.p2pProtocolId }
          : undefined,
      });
      this.libp2pTransport = transport;
      this.session = session;
      this.connected = true;

      // The Libp2pTransport already performed the MCP initialize handshake.
      const hs = session.handshakeResult;
      this.negotiatedProfiles =
        hs?.capabilities?.mcpPlusPlusProfiles && hs.capabilities.mcpPlusPlusProfiles.length > 0
          ? hs.capabilities.mcpPlusPlusProfiles
          : ['mcp++/p2p-transport'];

      const tools = await this.discoverTools();
      return { success: true, profiles: this.negotiatedProfiles, tools };
    } catch {
      this.connected = false;
      this.session = null;
      this.libp2pTransport = null;
      return { success: false, profiles: [], tools: [] };
    }
  }

  private async connectHttp(): Promise<{ success: boolean; profiles: string[]; tools: string[] }> {
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
    const tools = await this.discoverTools();

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

  /**
   * Discover the server's tool names. Over libp2p (or when the REST tools
   * endpoint is unavailable) this falls back to the JSON-RPC `tools/list`
   * method, which every MCP/MCP++ server exposes.
   */
  private async discoverTools(): Promise<string[]> {
    const fromRpc = async (): Promise<string[]> => {
      try {
        const res = await this.jsonRpc('tools/list', {});
        return extractRestToolNames(res);
      } catch {
        return [];
      }
    };

    // libp2p has no REST endpoints — go straight to JSON-RPC.
    if (this.session) return fromRpc();

    try {
      const toolsResp = await this.fetch(this.config.toolsPath);
      if (toolsResp.ok) {
        const toolsData = await toolsResp.json();
        const names = extractRestToolNames(toolsData);
        if (names.length > 0) return names;
      }
    } catch {}

    // REST tools endpoint missing/empty/unrecognized (e.g. a status dict or a
    // JSON-RPC envelope the parser didn't recognize) — fall back to the
    // JSON-RPC `tools/list` method, which every MCP/MCP++ server exposes.
    return fromRpc();
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try { await this.jsonRpc('shutdown', {}); } catch {}
      this.connected = false;
    }
    if (this.libp2pTransport) {
      try { await this.libp2pTransport.disconnect(); } catch {}
      this.libp2pTransport = null;
    }
    this.session = null;
  }

  /**
   * Bind this connector to an already-open MCP+p2p session (Profile E).
   * Lets SwissKnife reuse a libp2p session it has already dialed/handshaked
   * (e.g. via Libp2pTransport / connectLibp2pMcpSession) to call this server's
   * tools over JSON-RPC without opening a second connection. The caller retains
   * ownership of the session lifecycle.
   */
  async useSession(session: MCPp2pSession): Promise<{ success: boolean; profiles: string[]; tools: string[] }> {
    this.session = session;
    this.connected = true;
    const hs = session.handshakeResult;
    this.negotiatedProfiles =
      hs?.capabilities?.mcpPlusPlusProfiles && hs.capabilities.mcpPlusPlusProfiles.length > 0
        ? hs.capabilities.mcpPlusPlusProfiles
        : ['mcp++/p2p-transport'];
    const tools = await this.discoverTools();
    return { success: true, profiles: this.negotiatedProfiles, tools };
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

  // --- Hierarchical tool facade (matches the package JS SDKs) ---
  // Servers expose meta-tools tools_list_categories / tools_list_tools /
  // tools_get_schema / tools_dispatch plus flat `<category>.<tool>` descriptors.
  // These helpers unwrap the CallToolResult envelope so callers get plain data.

  /** List tool categories (optionally with per-category tool counts). */
  async listCategories(includeCount: boolean = true): Promise<any> {
    return this.unwrapToolResult(
      await this.callTool('tools_list_categories', { include_count: includeCount }),
    );
  }

  /** List the tools within a single category. */
  async listToolsInCategory(category: string): Promise<any> {
    return this.unwrapToolResult(
      await this.callTool('tools_list_tools', { category }),
    );
  }

  /**
   * Fetch the JSON schema for a tool. Accepts a flat `<category>.<tool>` name
   * (split into the `{category, tool}` pair the server's `tools_get_schema`
   * meta-tool requires) or an explicit `{category, tool}` param object.
   */
  async getToolSchema(nameOrParams: string | Record<string, any>): Promise<any> {
    const params = typeof nameOrParams === 'string' ? splitDottedToolName(nameOrParams) : nameOrParams;
    return this.unwrapToolResult(
      await this.callTool('tools_get_schema', params),
    );
  }

  /** Dispatch a tool inside a category via the `tools_dispatch` meta-tool. */
  async dispatch(category: string, tool: string, params: Record<string, any> = {}): Promise<any> {
    return this.unwrapToolResult(
      await this.callTool('tools_dispatch', { category, tool, params }),
    );
  }

  /** Unwrap an MCP CallToolResult ({content:[{type:'text',text}]}) to plain data. */
  private unwrapToolResult(result: any): any {
    if (result && Array.isArray(result.content)) {
      const text = result.content
        .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
        .map((c: any) => c.text)
        .join('');
      if (text) {
        try { return JSON.parse(text); } catch { return text; }
      }
    }
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

    // Route over the libp2p MCP+p2p session when connected via Profile E.
    if (this.session) {
      const response = await this.session.sendRequest(request as any);
      if (response.error) {
        throw new Error(`JSON-RPC Error ${response.error.code}: ${response.error.message}`);
      }
      return response.result;
    }

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
  /** 'libp2p' when connected over MCP+p2p, otherwise 'http'. */
  get transportKind(): 'http' | 'libp2p' { return this.session ? 'libp2p' : (this.config.transport ?? 'http'); }
  get endpoint(): string { return this.config.transport === 'libp2p' ? (this.config.multiaddr ?? '') : this.config.baseUrl; }
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

export interface MultiServerConnectorOptions {
  /** Include the ipfs_kit_py MCP++ server (default: true). */
  includeKit?: boolean;
  /**
   * Force all servers onto the libp2p MCP+p2p transport. Provide a map of
   * server name → multiaddr, or a single multiaddr applied to every server.
   * When omitted, servers use their default HTTP transport.
   */
  libp2p?: string | Record<string, string>;
}

export function createMultiServerConnector(
  agentDID: string,
  options: MultiServerConnectorOptions = {},
): MCPPPMultiServerConnector {
  const { includeKit = true, libp2p } = options;
  const connector = new MCPPPMultiServerConnector(agentDID);

  const withTransport = (base: MCPPPServerConfig): MCPPPServerConfig => {
    if (!libp2p) return base;
    const multiaddr = typeof libp2p === 'string' ? libp2p : libp2p[base.name];
    if (!multiaddr) return base;
    return { ...base, transport: 'libp2p', multiaddr };
  };

  if (includeKit) connector.addServer(withTransport(IPFS_KIT_SERVER));
  connector.addServer(withTransport(IPFS_DATASETS_SERVER));
  connector.addServer(withTransport(IPFS_ACCELERATE_SERVER));
  return connector;
}

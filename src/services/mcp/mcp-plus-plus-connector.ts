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
import { randomBytes } from 'node:crypto';
import {
  verifyMCPPPeerIdentity,
  type MCPPPPeerIdentity,
} from './mcp-plus-plus-profile-c.js';
import type {
  ProfileDExecutionDecision,
  ProfileDExecutionRequest,
} from './profile-d-policy.js';

// Helia-backed backend adapters can need one cold initialization round-trip.
// Keep this finite, but above the backend tool adapter's 15 second execution
// budget so the client reports the backend receipt rather than aborting first.
const MCPPP_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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
  /** Profile D policy evaluator REST endpoint, when the server exposes one. */
  policyPath?: string;
  p2pProtocolId?: string;  // libp2p protocol ID
  /** Ed25519 did:key DID that verifies Profile C peer identity challenges. */
  clientDID?: string;
  /** Profile C service namespace, separate from the display server name. */
  ucanService?: string;
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
  dagPath: '/mcp/dag',
  interfacesPath: '/mcp/interfaces',
  ucanService: 'ipfs_kit_py',
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
  policyPath: '/mcp/policy/evaluate',
  ucanService: 'ipfs_datasets_py',
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
  healthPath: '/mcp/health',
  dagPath: '/mcp/dag',
  interfacesPath: '/mcp/interfaces',
  delegationPath: '/mcp/ucan/delegate',
  policyPath: '/mcp/policy/evaluate',
  ucanService: 'ipfs_accelerate_py',
  p2pProtocolId: '/mcp+p2p/1.0.0',
};

export const MCPPP_PROFILE_H_CAPABILITY = 'mcp++/x402-payments' as const;
export const MCPPP_PROFILE_H_METHODS = [
  'mcp++/payments/profile', 'mcp++/payments/catalog', 'mcp++/payments/quote',
  'mcp++/payments/verify', 'mcp++/payments/settle', 'mcp++/payments/receipt/get',
  'mcp++/payments/entitlement/get', 'mcp++/payments/usage/get',
  'mcp++/payments/refund/request', 'mcp++/payments/reconcile',
] as const;

/** Profile G is the governed goal, risk, and scheduling control plane. */
export const MCPPP_PROFILE_G_CAPABILITY = 'mcp++/risk-scheduling' as const;

/**
 * The common authority fields required by Profile G mutations.  Keep this
 * intentionally structural: each operation adds its own CID-bearing payload,
 * while all writes remain bound to a caller, idempotency key, policy proof,
 * and correlation ID.
 */
export interface MCPPPProfileGMutation {
  caller_did: string;
  idempotency_key: string;
  correlation_id: string;
  parents: readonly string[];
  proof_cid: string;
  policy_decision_cid: string;
  [key: string]: unknown;
}

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

export interface MCPPPArtifactPersistence {
  profile?: 'A' | 'B';
  complete?: boolean;
  artifacts?: Record<string, { cid?: string; backend?: string; persisted?: boolean; verified?: boolean }>;
}

export type MCPPPProfileBEnvelope = Partial<ExecutionEnvelope> & {
  envelope_cid?: string;
  input_cid?: string;
  intent_cid?: string;
  output_cid?: string;
  receipt_artifact?: unknown;
  event?: unknown;
  event_cid?: string;
  artifact_persistence?: MCPPPArtifactPersistence;
};

export interface MCPPPArtifactReadResult {
  found: boolean;
  verified: boolean;
  cid: string;
  backend?: string;
  bytes_base64?: string;
  error?: string;
}

/** Profile F archive certificate. `zero_knowledge` is false for hash commitments. */
export interface MCPPPEventDagCertificate {
  certificate_cid: string;
  archive_cid: string;
  merkle_root: string;
  epoch_id: number;
  event_count: number;
  root_cids: string[];
  frontier_cids: string[];
  proof_system: string;
  zero_knowledge: boolean;
  proof?: string;
  verification_key_cid?: string;
}

export interface MCPPPEventDagArchive {
  archive_cid: string;
  certificate_cid: string;
  epoch_id: number;
  merkle_root: string;
  event_count: number;
  root_cids: string[];
  frontier_cids: string[];
}

function dagCid(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const cid = candidate.event_cid ?? candidate.cid;
    return typeof cid === 'string' ? cid : null;
  }
  return null;
}

function isArtifactReadResult(value: unknown): value is MCPPPArtifactReadResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.cid === 'string'
    && typeof candidate.found === 'boolean'
    && typeof candidate.verified === 'boolean';
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

/** Convert a wire-format MCP-IDL descriptor into SwissKnife's local type. */
function interfaceDescriptorFromPayload(
  payload: unknown,
  fallbackCid?: string,
): MCPPPInterfaceDescriptor | null {
  const outer = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null;
  const candidate = outer?.descriptor && typeof outer.descriptor === 'object'
    ? outer.descriptor as Record<string, unknown>
    : outer?.canonical_descriptor && typeof outer.canonical_descriptor === 'object'
      ? outer.canonical_descriptor as Record<string, unknown>
      : outer;
  if (!candidate) return null;

  const interfaceCid = candidate.interface_cid ?? outer?.interface_cid ?? fallbackCid;
  if (
    typeof interfaceCid !== 'string'
    || typeof candidate.name !== 'string'
    || typeof candidate.namespace !== 'string'
    || typeof candidate.version !== 'string'
    || !Array.isArray(candidate.methods)
  ) return null;

  const methods = candidate.methods
    .filter((method): method is Record<string, unknown> => Boolean(method) && typeof method === 'object')
    .filter(method => typeof method.name === 'string'
      && typeof method.input_schema_cid === 'string'
      && typeof method.output_schema_cid === 'string'
      && Array.isArray(method.error_schema_cids))
    .map(method => ({ ...method })) as MCPPPInterfaceDescriptor['methods'];
  if (methods.length === 0) return null;

  const wireErrors = Array.isArray(candidate.errors) ? candidate.errors : [];
  const errors = wireErrors
    .map(error => typeof error === 'string'
      ? { name: error }
      : error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string'
        ? error as { name: string; code?: number }
        : null)
    .filter((error): error is { name: string; code?: number } => error !== null);
  const compatibility = candidate.compatibility && typeof candidate.compatibility === 'object'
    ? candidate.compatibility as Record<string, unknown>
    : {};
  const observability = candidate.observability && typeof candidate.observability === 'object'
    ? candidate.observability as Record<string, unknown>
    : {};

  return {
    name: candidate.name,
    namespace: candidate.namespace,
    version: candidate.version,
    interface_cid: interfaceCid,
    methods,
    errors,
    requires: Array.isArray(candidate.requires)
      ? candidate.requires.filter((requirement): requirement is string => typeof requirement === 'string')
      : [],
    compatibility: {
      compatible_with: Array.isArray(compatibility.compatible_with)
        ? compatibility.compatible_with.filter((cid): cid is string => typeof cid === 'string')
        : [],
      supersedes: Array.isArray(compatibility.supersedes)
        ? compatibility.supersedes.filter((cid): cid is string => typeof cid === 'string')
        : [],
    },
    semantic_tags: Array.isArray(candidate.semantic_tags)
      ? candidate.semantic_tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    observability: {
      trace: observability.trace === true,
      metrics: observability.metrics === true,
      events: observability.events === true,
    },
  };
}

function interfaceDescriptorsFromPayload(payload: unknown): MCPPPInterfaceDescriptor[] {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  const rows = Array.isArray(value?.interfaces)
    ? value.interfaces
    : Array.isArray(value?.descriptors)
      ? value.descriptors
      : value?.descriptor || value?.canonical_descriptor || value?.methods
        ? [value]
        : [];
  return dedupeInterfaces(rows
    .map(row => interfaceDescriptorFromPayload(row))
    .filter((descriptor): descriptor is MCPPPInterfaceDescriptor => descriptor !== null));
}

function interfaceCidsFromPayload(payload: unknown): string[] {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  const candidates = [
    ...(Array.isArray(value?.interface_cids) ? value.interface_cids : []),
    ...(Array.isArray(value?.interfaces) ? value.interfaces : []),
  ];
  return [...new Set(candidates.filter((cid): cid is string => typeof cid === 'string' && cid.length > 0))].sort();
}

function dedupeInterfaces(descriptors: MCPPPInterfaceDescriptor[]): MCPPPInterfaceDescriptor[] {
  const byCid = new Map<string, MCPPPInterfaceDescriptor>();
  for (const descriptor of descriptors) byCid.set(descriptor.interface_cid, descriptor);
  return [...byCid.values()].sort((left, right) => left.interface_cid.localeCompare(right.interface_cid));
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

export type HierarchicalToolAliasKind =
  | 'canonical'
  | 'dot_qualified'
  | 'slash_qualified'
  | 'underscore_qualified'
  | 'bare';

export interface HierarchicalToolRef {
  category: string;
  tool: string;
  canonicalName: string;
  requestedName: string;
  aliasKind: HierarchicalToolAliasKind;
}

interface HierarchicalToolAliasIndex {
  categories: string[];
  toolsByCategory: Map<string, Set<string>>;
  aliases: Map<string, HierarchicalToolRef>;
  ambiguousAliases: Set<string>;
}

/**
 * Split a user-facing hierarchical tool alias into a `{category, tool}` pair.
 * Dotted (`category.tool`) and slash (`category/tool`) names are self-describing.
 * Underscore-qualified names are only split when the category namespace is known,
 * because dataset categories themselves contain underscores (`bespoke_tools`).
 */
export function splitHierarchicalToolAlias(
  name: string,
  knownCategories: readonly string[] = [],
): { category: string; tool: string; aliasKind: HierarchicalToolAliasKind } | { name: string; aliasKind: 'bare' } {
  const trimmed = name.trim();
  const slash = trimmed.indexOf('/');
  if (slash > 0 && slash < trimmed.length - 1) {
    return { category: trimmed.slice(0, slash), tool: trimmed.slice(slash + 1), aliasKind: 'slash_qualified' };
  }
  const dot = trimmed.indexOf('.');
  if (dot > 0 && dot < trimmed.length - 1) {
    return { category: trimmed.slice(0, dot), tool: trimmed.slice(dot + 1), aliasKind: 'dot_qualified' };
  }
  const categories = [...knownCategories].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const category of categories) {
    const prefix = `${category}_`;
    if (trimmed.startsWith(prefix) && trimmed.length > prefix.length) {
      return { category, tool: trimmed.slice(prefix.length), aliasKind: 'underscore_qualified' };
    }
  }
  return { name: trimmed, aliasKind: 'bare' };
}

function extractCategoryNames(payload: any): string[] {
  const rows = Array.isArray(payload?.categories)
    ? payload.categories
    : Array.isArray(payload)
      ? payload
      : [];
  return rows
    .map((row: any) => typeof row === 'string' ? row : row?.name ?? row?.category ?? row?.id)
    .filter((name: any): name is string => typeof name === 'string' && name.length > 0);
}

function extractHierarchicalToolNames(payload: any): string[] {
  const rows = Array.isArray(payload?.tools)
    ? payload.tools
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.result?.tools)
        ? payload.result.tools
        : [];
  return rows
    .map((row: any) => typeof row === 'string' ? row : row?.name ?? row?.tool ?? row?.id)
    .filter((name: any): name is string => typeof name === 'string' && name.length > 0);
}

function addHierarchicalToolAliases(index: HierarchicalToolAliasIndex, category: string, rawTool: string): void {
  const leaf = rawTool.startsWith(`${category}.`)
    ? rawTool.slice(category.length + 1)
    : rawTool.startsWith(`${category}/`)
      ? rawTool.slice(category.length + 1)
      : rawTool.startsWith(`${category}_`)
        ? rawTool.slice(category.length + 1)
        : rawTool;
  const ref: HierarchicalToolRef = {
    category,
    tool: leaf,
    canonicalName: `${category}.${leaf}`,
    requestedName: rawTool,
    aliasKind: 'canonical',
  };
  const aliases: Array<[string, HierarchicalToolAliasKind]> = [
    [leaf, 'canonical'],
    [rawTool, rawTool === leaf ? 'canonical' : 'dot_qualified'],
    [`${category}.${leaf}`, 'dot_qualified'],
    [`${category}/${leaf}`, 'slash_qualified'],
    [`${category}_${leaf}`, 'underscore_qualified'],
  ];
  for (const [alias, aliasKind] of aliases) {
    if (!alias || index.ambiguousAliases.has(alias)) continue;
    const existing = index.aliases.get(alias);
    if (existing && (existing.category !== ref.category || existing.tool !== ref.tool)) {
      index.aliases.delete(alias);
      index.ambiguousAliases.add(alias);
      continue;
    }
    if (existing) continue;
    index.aliases.set(alias, { ...ref, requestedName: alias, aliasKind });
  }
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
  private hierarchicalAliasIndex: Promise<HierarchicalToolAliasIndex> | null = null;
  private peerIdentity: MCPPPPeerIdentity | null = null;

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

      await this.requireProfileCPeerIdentity();

      const tools = await this.discoverTools();
      if (this.negotiatedProfiles.includes('mcp++/idl')) await this.listInterfaces();
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
            [MCPPP_PROFILE_H_CAPABILITY]: true,
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
    try {
      await this.requireProfileCPeerIdentity();
    } catch {
      this.connected = false;
      return { success: false, profiles: [], tools: [] };
    }
    const tools = await this.discoverTools();

    // 4. Discover interface descriptors (Profile A) over the same JSON-RPC
    // boundary used for calls. This keeps HTTP and libp2p discovery identical.
    if (this.negotiatedProfiles.includes('mcp++/mcp-idl')) await this.listInterfaces();

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
    this.peerIdentity = null;
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
    await this.requireProfileCPeerIdentity();
    const tools = await this.discoverTools();
    if (this.negotiatedProfiles.includes('mcp++/idl')) await this.listInterfaces();
    return { success: true, profiles: this.negotiatedProfiles, tools };
  }

  // --- Profile A: Interface Discovery ---

  async listInterfaces(): Promise<MCPPPInterfaceDescriptor[]> {
    if (this.serverInterfaces.length > 0) return this.serverInterfaces;

    try {
      const data = await this.jsonRpc('interfaces/list', {});
      const direct = interfaceDescriptorsFromPayload(data);
      const cids = interfaceCidsFromPayload(data);
      const fetched = await Promise.all(cids.map(cid => this.getInterface(cid)));
      this.serverInterfaces = dedupeInterfaces([
        ...direct,
        ...fetched.filter((descriptor): descriptor is MCPPPInterfaceDescriptor => descriptor !== null),
      ]);
      return this.serverInterfaces;
    } catch {
      // A legacy REST registry remains a read-only fallback for older servers.
      if (!this.config.interfacesPath || this.session) return [];
      try {
        const resp = await this.fetch(this.config.interfacesPath);
        const data = await resp.json();
        this.serverInterfaces = interfaceDescriptorsFromPayload(data);
        return this.serverInterfaces;
      } catch {
        return [];
      }
    }
  }

  async getInterface(interfaceCid: string): Promise<MCPPPInterfaceDescriptor | null> {
    const cached = this.serverInterfaces.find(descriptor => descriptor.interface_cid === interfaceCid);
    if (cached) return cached;
    try {
      const data = await this.jsonRpc('interfaces/get', { interface_cid: interfaceCid });
      const descriptor = interfaceDescriptorFromPayload(data, interfaceCid);
      if (descriptor) this.serverInterfaces = dedupeInterfaces([...this.serverInterfaces, descriptor]);
      return descriptor;
    } catch {
      if (!this.config.interfacesPath || this.session) return null;
      try {
        const resp = await this.fetch(`${this.config.interfacesPath}/${encodeURIComponent(interfaceCid)}`);
        if (!resp.ok) return null;
        const descriptor = interfaceDescriptorFromPayload(await resp.json(), interfaceCid);
        if (descriptor) this.serverInterfaces = dedupeInterfaces([...this.serverInterfaces, descriptor]);
        return descriptor;
      } catch {
        return null;
      }
    }
  }

  async checkInterfaceCompatibility(
    clientCid: string,
    serverCid: string = clientCid,
  ): Promise<{ compatible: boolean; reasons: string[]; requires_missing: string[]; suggested_alternatives: string[] }> {
    try {
      const result = await this.jsonRpc('interfaces/compat', {
        client_cid: clientCid,
        server_cid: serverCid,
      });
      return {
        compatible: result?.compatible === true,
        reasons: Array.isArray(result?.reasons) ? result.reasons : [],
        requires_missing: Array.isArray(result?.requires_missing) ? result.requires_missing : [],
        suggested_alternatives: Array.isArray(result?.suggested_alternatives) ? result.suggested_alternatives : [],
      };
    } catch {
      return {
        compatible: false,
        reasons: ['Interface compatibility is unavailable.'],
        requires_missing: [],
        suggested_alternatives: [],
      };
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
    const params = typeof nameOrParams === 'string'
      ? await this.resolveSchemaParams(nameOrParams)
      : nameOrParams;
    return this.unwrapToolResult(
      await this.callTool('tools_get_schema', params),
    );
  }

  /** Dispatch a tool inside a category via the `tools_dispatch` meta-tool. */
  async dispatch(category: string, tool: string, params?: Record<string, any>): Promise<any>;
  async dispatch(name: string, params?: Record<string, any>): Promise<any>;
  async dispatch(ref: { category: string; tool: string }, params?: Record<string, any>): Promise<any>;
  async dispatch(
    categoryOrName: string | { category: string; tool: string },
    toolOrParams: string | Record<string, any> = {},
    maybeParams: Record<string, any> = {},
  ): Promise<any> {
    if (typeof categoryOrName === 'object') {
      return this.dispatchResolved(categoryOrName.category, categoryOrName.tool, toolOrParams as Record<string, any>);
    }
    if (typeof toolOrParams === 'string') {
      return this.dispatchResolved(categoryOrName, toolOrParams, maybeParams);
    }
    try {
      const resolved = await this.resolveHierarchicalToolAlias(categoryOrName);
      if (resolved) return this.dispatchResolved(resolved.category, resolved.tool, toolOrParams);
    } catch {
      /* fall through to direct tools/call compatibility */
    }
    return this.unwrapToolResult(await this.callTool(categoryOrName, toolOrParams));
  }

  /** Dispatch a user-facing alias such as `cat.tool`, `cat/tool`, or `cat_tool`. */
  async dispatchToolName(name: string, params: Record<string, any> = {}): Promise<any> {
    return this.dispatch(name, params);
  }

  /**
   * Resolve a user-facing alias against the live hierarchical facade. Returns
   * null when the alias is not a listed hierarchy leaf, allowing callers to fall
   * back to a direct tools/call descriptor when policy permits.
   */
  async resolveHierarchicalToolAlias(name: string): Promise<HierarchicalToolRef | null> {
    const index = await this.getHierarchicalToolAliasIndex();
    return index.aliases.get(name.trim()) ?? null;
  }

  private async dispatchResolved(category: string, tool: string, params: Record<string, any> = {}): Promise<any> {
    return this.unwrapToolResult(
      await this.callTool('tools_dispatch', { category, tool, params }),
    );
  }

  private async resolveSchemaParams(name: string): Promise<{ category: string; tool: string } | { name: string }> {
    const direct = splitHierarchicalToolAlias(name);
    if ('category' in direct && direct.aliasKind !== 'underscore_qualified') {
      return { category: direct.category, tool: direct.tool };
    }
    if (direct.aliasKind === 'bare') {
      const split = splitDottedToolName(name);
      if ('category' in split) return split;
    }
    try {
      const resolved = await this.resolveHierarchicalToolAlias(name);
      if (resolved) return { category: resolved.category, tool: resolved.tool };
    } catch {
      /* fall through to pre-hierarchical {name} compatibility */
    }
    return { name };
  }

  private async getHierarchicalToolAliasIndex(): Promise<HierarchicalToolAliasIndex> {
    if (!this.hierarchicalAliasIndex) {
      this.hierarchicalAliasIndex = this.buildHierarchicalToolAliasIndex();
    }
    return this.hierarchicalAliasIndex;
  }

  private async buildHierarchicalToolAliasIndex(): Promise<HierarchicalToolAliasIndex> {
    const categoriesPayload = await this.listCategories(true);
    const categoryNames = extractCategoryNames(categoriesPayload);
    const index: HierarchicalToolAliasIndex = {
      categories: categoryNames,
      toolsByCategory: new Map(),
      aliases: new Map(),
      ambiguousAliases: new Set(),
    };

    for (const category of categoryNames) {
      const listed = await this.listToolsInCategory(category);
      const toolNames = extractHierarchicalToolNames(listed);
      index.toolsByCategory.set(category, new Set(toolNames));
      for (const rawTool of toolNames) {
        addHierarchicalToolAliases(index, category, rawTool);
      }
    }
    return index;
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
    options?: {
      interfaceCid?: string;
      proofCid?: string;
      ucan?: string;
      ucanAudience?: string;
      policyCid?: string;
      parents?: string[];
      timestamp?: string | number;
      correlationId?: string;
    }
  ): Promise<{ result: any; envelope: MCPPPProfileBEnvelope }> {
    // If server supports CID envelopes, use the envelope-wrapped call
    if (this.negotiatedProfiles.includes('mcp++/cid-envelope')) {
      const interfaceCid = options?.interfaceCid ?? (await this.listInterfaces())[0]?.interface_cid;
      if (!interfaceCid) throw new Error(`Profile B requires a discovered interface for ${this.config.name}`);
      const result = await this.jsonRpc('mcp++/execute', {
        interface_cid: interfaceCid,
        tool: toolName,
        arguments: args,
        proof_cid: options?.proofCid,
        ucan: options?.ucan,
        ucan_audience: options?.ucanAudience ?? this.config.clientDID,
        policy_cid: options?.policyCid,
        parents: options?.parents ?? [],
        timestamp: options?.timestamp,
        correlation_id: options?.correlationId,
      });
      return {
        result: result.output ?? result.result,
        envelope: {
          ...(result.envelope ?? {}),
          envelope_cid: result.envelope_cid,
          input_cid: result.input_cid,
          intent_cid: result.intent_cid,
          output_cid: result.output_cid,
          receipt_artifact: result.receipt_artifact,
          event: result.event,
          event_cid: result.event_cid,
          receipt: result.receipt,
          artifact_persistence: result.artifact_persistence,
        },
      };
    }
    
    // Fallback: regular tool call without envelope
    const result = await this.callTool(toolName, args);
    return { result, envelope: {} };
  }

  /** Read and verify a Profile A/B artifact over the active MCP++ transport. */
  async getArtifact(cid: string): Promise<MCPPPArtifactReadResult | null> {
    if (!cid) return null;
    try {
      if (this.session) {
        const result = await this.jsonRpc('mcp++/artifacts/get', { cid });
        return isArtifactReadResult(result) ? result : null;
      }
      const response = await this.fetch(`${this.config.baseUrl.replace(/\/$/, '')}/mcp/artifacts/${encodeURIComponent(cid)}`);
      if (!response.ok) return null;
      const result = await response.json();
      return isArtifactReadResult(result) ? result : null;
    } catch {
      return null;
    }
  }

  // --- Profile C: UCAN Delegation ---

  async createDelegation(
    audience: string,
    capabilities: { resource: string; ability: string }[],
    expirationHours: number = 24
  ): Promise<{ proofCid: string; delegation: any; ucan?: string }> {
    if (!this.negotiatedProfiles.includes('mcp++/ucan')) {
      throw new Error('Profile C UCAN delegation was not negotiated with this server.');
    }
    const result = await this.jsonRpc('mcp++/ucan/delegate', {
      audience,
      capabilities,
      lifetime_seconds: Math.max(1, Math.floor(expirationHours * 60 * 60)),
    });
    return {
      proofCid: result?.proof_cid ?? result?.proofCid ?? '',
      delegation: result?.delegation ?? result,
      ucan: typeof result?.ucan === 'string' ? result.ucan : undefined,
    };
  }

  async validateDelegation(
    proofCid: string,
    options: { ucan?: string; requiredCapability?: { resource: string; ability: string } } = {},
  ): Promise<{ valid: boolean; chain: any[]; reason?: string }> {
    try {
      const result = await this.jsonRpc('mcp++/ucan/validate', {
        proof_cid: proofCid,
        ucan: options.ucan,
        required_capability: options.requiredCapability,
      });
      return { valid: result.valid ?? false, chain: result.chain || [], reason: result.reason };
    } catch {
      return { valid: false, chain: [] };
    }
  }

  async revokeDelegation(proofCid: string): Promise<{ revoked: boolean; proofCid: string }> {
    const result = await this.jsonRpc('mcp++/ucan/revoke', { proof_cid: proofCid });
    return { revoked: result?.revoked === true, proofCid: result?.proof_cid ?? proofCid };
  }

  async identifyPeer(): Promise<MCPPPPeerIdentity> {
    if (!this.config.clientDID) throw new Error('A clientDID is required to verify a Profile C peer.');
    if (!this.negotiatedProfiles.includes('mcp++/ucan')) {
      throw new Error('Profile C UCAN peer identity was not negotiated with this server.');
    }
    const nonce = randomBytes(32).toString('base64url');
    const transport = this.session ? 'libp2p' : 'http';
    const response = await this.jsonRpc('mcp++/ucan/identity', {
      audience: this.config.clientDID,
      nonce,
      transport,
    });
    const identity = await verifyMCPPPeerIdentity(response, {
      audience: this.config.clientDID,
      nonce,
      service: this.config.ucanService ?? this.config.name,
      transport,
    });
    if (!identity.valid) throw new Error(identity.reason ?? 'Profile C peer identity verification failed.');
    this.peerIdentity = identity;
    return identity;
  }

  private async requireProfileCPeerIdentity(): Promise<void> {
    if (!this.negotiatedProfiles.includes('mcp++/ucan')) return;
    if (!this.config.clientDID) return;
    await this.identifyPeer();
  }

  // --- Event DAG ---

  async getDAGFrontier(): Promise<string[]> {
    try {
      const data = await this.jsonRpc('mcp++/dag/frontier', {});
      const frontier = Array.isArray(data?.frontier) ? data.frontier : data;
      return Array.isArray(frontier)
        ? frontier.map(dagCid).filter((cid): cid is string => cid !== null)
        : [];
    } catch {
      if (!this.config.dagPath || this.session) return [];
    }
    try {
      const resp = await this.fetch(`${this.config.dagPath}/frontier`);
      const data = await resp.json();
      const frontier = Array.isArray(data?.frontier) ? data.frontier : data;
      return Array.isArray(frontier)
        ? frontier.map(dagCid).filter((cid): cid is string => cid !== null)
        : [];
    } catch {
      return [];
    }
  }

  async getDAGHistory(limit: number = 50): Promise<EventNode[]> {
    try {
      const data = await this.jsonRpc('mcp++/dag/history', { limit });
      return Array.isArray(data?.events) ? data.events : [];
    } catch {
      if (!this.config.dagPath || this.session) return [];
    }
    try {
      const resp = await this.fetch(`${this.config.dagPath}/history?limit=${limit}`);
      const data = await resp.json();
      return data.events || data || [];
    } catch {
      return [];
    }
  }

  async traceProvenance(eventCid: string): Promise<EventNode[]> {
    try {
      const data = await this.jsonRpc('mcp++/dag/provenance', { event_cid: eventCid });
      return Array.isArray(data?.chain) ? data.chain : Array.isArray(data?.provenance) ? data.provenance : [];
    } catch {
      if (!this.config.dagPath || this.session) return [];
    }
    try {
      const resp = await this.fetch(`${this.config.dagPath}/provenance/${encodeURIComponent(eventCid)}`);
      const data = await resp.json();
      return data.chain || data.provenance || data || [];
    } catch {
      return [];
    }
  }

  /** Compact old hot events into a persisted Profile F archive and certificate. */
  async compactEventDAG(options: { max_events?: number; retain_recent?: number } = {}): Promise<any> {
    try {
      return await this.jsonRpc('mcp++/dag/compact', options);
    } catch {
      if (!this.config.dagPath || this.session) throw new Error('Profile F Event DAG compaction is unavailable.');
      const response = await this.fetch(`${this.config.dagPath}/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (!response.ok) throw new Error(`Event DAG compaction failed: ${response.status}`);
      return response.json();
    }
  }

  async listDAGArchives(): Promise<MCPPPEventDagArchive[]> {
    try {
      const data = await this.jsonRpc('mcp++/dag/archives', {});
      return Array.isArray(data?.archives) ? data.archives : [];
    } catch {
      if (!this.config.dagPath || this.session) return [];
      try {
        const response = await this.fetch(`${this.config.dagPath}/archives`);
        const data = await response.json();
        return Array.isArray(data?.archives) ? data.archives : [];
      } catch {
        return [];
      }
    }
  }

  async getDAGCertificate(certificateCid: string): Promise<MCPPPEventDagCertificate | null> {
    try {
      const data = await this.jsonRpc('mcp++/dag/certificate/get', { certificate_cid: certificateCid });
      return data?.certificate ?? null;
    } catch {
      if (!this.config.dagPath || this.session) return null;
      try {
        const response = await this.fetch(`${this.config.dagPath}/certificates/${encodeURIComponent(certificateCid)}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data?.certificate ?? null;
      } catch {
        return null;
      }
    }
  }

  async verifyDAGCertificate(certificateCid: string): Promise<{ valid: boolean; certificate?: MCPPPEventDagCertificate; proof_system?: string; zero_knowledge?: boolean }> {
    try {
      return await this.jsonRpc('mcp++/dag/certificate/verify', { certificate_cid: certificateCid });
    } catch {
      if (!this.config.dagPath || this.session) return { valid: false };
      try {
        const response = await this.fetch(`${this.config.dagPath}/certificates/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ certificate_cid: certificateCid }),
        });
        return response.ok ? response.json() : { valid: false };
      } catch {
        return { valid: false };
      }
    }
  }

  // --- Profile D: Policy ---

  /**
   * Evaluate a Profile D policy over the negotiated transport.
   *
   * The response is intentionally returned verbatim: callers must pass any
   * supplied ZKP certificate through `verifyProfileDPolicyCertificate` before
   * treating it as a verified zero-knowledge proof.
   */
  async evaluateProfileDPolicy(request: ProfileDExecutionRequest): Promise<ProfileDExecutionDecision> {
    if (!this.connected || !this.negotiatedProfiles.includes('mcp++/deontic-policy')) {
      throw new Error('MCP++ Profile D deontic policy was not negotiated with this server.');
    }
    if (this.session || !this.config.policyPath) {
      return this.jsonRpc('mcp++/policy/evaluate', request) as Promise<ProfileDExecutionDecision>;
    }
    const response = await this.fetch(this.config.policyPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Profile D policy evaluation failed: ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    return (payload.result ?? payload) as ProfileDExecutionDecision;
  }

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

  // --- Profile G: risk-aware goal and scheduling control plane ---

  async getRiskSchedulingProfile(): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/risk/profile', {});
  }

  async createGoal(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/goals/create', request);
  }

  async getGoal(goalCid: string): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/goals/get', { goal_cid: goalCid });
  }

  async listGoals(request: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/goals/list', request);
  }

  async decomposeGoal(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/goals/decompose', request);
  }

  async selectGoalPlan(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/goals/select', request);
  }

  async createTask(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/tasks/create', request);
  }

  async getTask(taskCid: string): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/tasks/get', { task_cid: taskCid });
  }

  async listTasks(request: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/tasks/list', request);
  }

  async listReadyTasks(request: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/tasks/ready', request);
  }

  async assessRisk(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/risk/assess', request);
  }

  async getRiskEvidence(taskCid: string): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/risk/evidence', { task_cid: taskCid });
  }

  async getRiskHistory(taskCid: string): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/risk/history', { task_cid: taskCid });
  }

  async queryNeighborhood(request: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/neighborhood/query', request);
  }

  async attestNeighborhood(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/neighborhood/attest', request);
  }

  async getScheduleFrontier(request: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/frontier', request);
  }

  async getScheduleStatus(taskCid: string): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/status', { task_cid: taskCid });
  }

  async proposeSchedule(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/propose', request);
  }

  async claimTask(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/claim', request);
  }

  async renewTaskClaim(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/renew', request);
  }

  async releaseTaskClaim(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/release', request);
  }

  async resolveTaskClaims(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/resolve', request);
  }

  async reconcileSchedule(request: MCPPPProfileGMutation): Promise<Record<string, unknown>> {
    return this.profileGRequest('mcp++/schedule/reconcile', request);
  }

  private async profileGRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.connected || !this.negotiatedProfiles.includes(MCPPP_PROFILE_G_CAPABILITY)) {
      throw new Error('MCP++ Profile G risk scheduling was not negotiated with this server.');
    }
    const result = await this.jsonRpc(method, params);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error(`Profile G returned an invalid response for ${method}.`);
    }
    return result as Record<string, unknown>;
  }

  // --- Profile H: x402 paid capability control plane ---

  async getPaymentProfile(): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/profile', {}); }
  async getPaymentCatalog(): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/catalog', {}); }
  async quotePayment(request: Record<string, unknown>): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/quote', request); }
  async verifyPayment(request: Record<string, unknown>): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/verify', request); }
  async settlePayment(request: Record<string, unknown>): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/settle', request); }
  async getPaymentReceipt(receiptCid: string, context: Record<string, unknown> = {}): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/receipt/get', { ...context, receipt_cid: requiredProfileHCid(receiptCid, 'receipt') }); }
  async getPaymentEntitlement(entitlementCid: string, context: Record<string, unknown> = {}): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/entitlement/get', { ...context, entitlement_cid: requiredProfileHCid(entitlementCid, 'entitlement') }); }
  async getPaymentUsage(usageCid: string, context: Record<string, unknown> = {}): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/usage/get', { ...context, usage_cid: requiredProfileHCid(usageCid, 'usage') }); }
  async requestPaymentRefund(request: Record<string, unknown>): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/refund/request', request); }
  async reconcilePayments(request: Record<string, unknown> = {}): Promise<Record<string, unknown>> { return this.profileHRequest('mcp++/payments/reconcile', request); }

  private async profileHRequest(method: typeof MCPPP_PROFILE_H_METHODS[number], params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.connected || !this.negotiatedProfiles.includes(MCPPP_PROFILE_H_CAPABILITY)) {
      throw new Error('MCP++ Profile H x402 payments was not negotiated with this server.');
    }
    const result = await this.jsonRpc(method, params);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(`Profile H returned an invalid response for ${method}.`);
    return result as Record<string, unknown>;
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
      signal: init?.signal || AbortSignal.timeout(MCPPP_DEFAULT_REQUEST_TIMEOUT_MS),
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
    if (caps[MCPPP_PROFILE_G_CAPABILITY]) profiles.push(MCPPP_PROFILE_G_CAPABILITY);
    if (caps[MCPPP_PROFILE_H_CAPABILITY]) profiles.push(MCPPP_PROFILE_H_CAPABILITY);
    return profiles.length > 0 ? profiles : ['mcp++/basic'];
  }

  get isConnected(): boolean { return this.connected; }
  get serverName(): string { return this.config.name; }
  get profiles(): string[] { return this.negotiatedProfiles; }
  get peerDID(): string | null { return this.peerIdentity?.did ?? null; }
  get verifiedPeerIdentity(): MCPPPPeerIdentity | null { return this.peerIdentity; }
  /** 'libp2p' when connected over MCP+p2p, otherwise 'http'. */
  get transportKind(): 'http' | 'libp2p' { return this.session ? 'libp2p' : (this.config.transport ?? 'http'); }
  get endpoint(): string { return this.config.transport === 'libp2p' ? (this.config.multiaddr ?? '') : this.config.baseUrl; }
}

function requiredProfileHCid(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Profile H ${label} CID is required.`);
  return value;
}

// --- Unified Multi-Server Connector ---

export class MCPPPMultiServerConnector {
  private connectors: Map<string, MCPPPServerConnector> = new Map();
  private client: MCPPlusPlus;

  private readonly agentDID: string;

  constructor(agentDID: string) {
    this.agentDID = agentDID;
    this.client = createMCPPlusPlusClient(agentDID);
  }

  addServer(config: MCPPPServerConfig): void {
    this.connectors.set(config.name, new MCPPPServerConnector({
      ...config,
      clientDID: config.clientDID ?? this.agentDID,
    }));
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
    options?: {
      interfaceCid?: string;
      proofCid?: string;
      ucan?: string;
      ucanAudience?: string;
      policyCid?: string;
      parents?: string[];
      timestamp?: string | number;
      correlationId?: string;
    }
  ): Promise<{ result: any; envelope: MCPPPProfileBEnvelope }> {
    const connector = this.connectors.get(serverName);
    if (!connector || !connector.isConnected) {
      throw new Error(`Server not connected: ${serverName}`);
    }
    return connector.callToolWithEnvelope(toolName, args, options);
  }

  async getArtifact(serverName: string, cid: string): Promise<MCPPPArtifactReadResult | null> {
    const connector = this.connectors.get(serverName);
    if (!connector || !connector.isConnected) {
      throw new Error(`Server not connected: ${serverName}`);
    }
    return connector.getArtifact(cid);
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

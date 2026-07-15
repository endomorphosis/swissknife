import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  EXECUTABLE_BACKEND_OWNERS,
  type ExecutableBackendBinding,
  type ExecutableBackendOwner,
} from '../apps/all-app-executable-backend-contract.js';
import { ipfsAccelerateBackendBindings } from '../ipfs/mcp-ipfs-accelerate-descriptor-pack.js';
import { ipfsDatasetsBackendBindings } from '../ipfs/mcp-ipfs-datasets-descriptor-pack.js';
import { ipfsKitDescriptorPack } from '../ipfs/mcp-ipfs-kit-descriptor-pack.js';

/**
 * A fail-closed disposition for every exact backend tool name SwissKnife has
 * discovered.  This deliberately models a tool separately from an app
 * capability: apps select a small, approved subset while the diagnostic
 * surfaces retain visibility of everything else.
 */
export const ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA = 'swissknife.all-tools-disposition-catalog.v1';
export const ALL_TOOLS_DISPOSITION_CATALOG_ID =
  'org.hallucinate.swissknife.all-tools-disposition-catalog';
export const ALL_TOOLS_DISPOSITION_CATALOG_VERSION = '1.0.0';

export type AllToolsDispositionOwner = ExecutableBackendOwner;
export type AllToolsTransport = 'http' | 'libp2p';
export type ToolReachabilityState = 'reachable' | 'unavailable' | 'unsupported' | 'denied';
export type ToolDispositionKind = 'app_operation' | 'diagnostic_operation' | 'server_only';

export interface DiscoveredBackendToolRecord {
  owner: AllToolsDispositionOwner;
  tool_id: string;
  /** The source that supplied the exact name; it is not a reachability claim. */
  discovery_source?: 'kit_manifest' | 'datasets_descriptor' | 'accelerate_descriptor' | 'runtime_discovery';
  /** True only when this exact input needs a host filesystem path. */
  host_file_input?: boolean;
}

export interface ToolTransportObservation {
  transport: AllToolsTransport;
  state: ToolReachabilityState;
  /** Required for a reachable claim; typically an HTTP or libp2p receipt CID. */
  evidence_id?: string;
  rationale: string;
}

export interface ToolDispositionReachability {
  approved_transports: readonly AllToolsTransport[];
  observations: readonly ToolTransportObservation[];
}

export interface AppOperationDisposition {
  kind: 'app_operation';
  app_id: string;
  binding_id: string;
  intent_id: string;
  ui_control_id: string;
}

export interface DiagnosticOperationDisposition {
  kind: 'diagnostic_operation';
  app_id: 'mcp-control' | 'mcp-plus-plus';
  operation_id: 'mcp-control.inspect-tool-policy' | 'mcp-plus-plus.inspect-tool-descriptor';
  rationale: string;
}

export interface ServerOnlyDisposition {
  kind: 'server_only';
  governance: 'policy_review_required';
  review_surface: 'mcp-control';
  rationale: string;
}

export interface AllToolsDispositionEntry {
  entry_id: string;
  owner: AllToolsDispositionOwner;
  tool_id: string;
  discovery_source: NonNullable<DiscoveredBackendToolRecord['discovery_source']>;
  disposition: AppOperationDisposition | DiagnosticOperationDisposition | ServerOnlyDisposition;
  reachability: ToolDispositionReachability;
}

export interface AllToolsDispositionCatalog {
  schema: typeof ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA;
  catalog_id: typeof ALL_TOOLS_DISPOSITION_CATALOG_ID;
  version: typeof ALL_TOOLS_DISPOSITION_CATALOG_VERSION;
  backend_owners: readonly AllToolsDispositionOwner[];
  source_contract: {
    contract_id: string;
    version: string;
  };
  entries: readonly AllToolsDispositionEntry[];
}

export interface AllToolsDispositionCatalogValidationResult {
  valid: boolean;
  errors: string[];
}

type StaticTool = Required<Pick<DiscoveredBackendToolRecord, 'owner' | 'tool_id' | 'discovery_source'>>
  & Pick<DiscoveredBackendToolRecord, 'host_file_input'>;

const OWNER_SET = new Set<string>(EXECUTABLE_BACKEND_OWNERS);
const TRANSPORTS: readonly AllToolsTransport[] = Object.freeze(['http', 'libp2p']);

function uniqueStaticTools(tools: readonly StaticTool[]): readonly StaticTool[] {
  const byIdentity = new Map<string, StaticTool>();
  for (const tool of tools) {
    const identity = `${tool.owner}:${tool.tool_id}`;
    const previous = byIdentity.get(identity);
    byIdentity.set(identity, {
      ...tool,
      host_file_input: Boolean(previous?.host_file_input || tool.host_file_input),
    });
  }
  return Object.freeze([...byIdentity.values()].sort(compareTool));
}

/** Canonical descriptor/manifest names from each of the three backend owners. */
export const STATIC_DISCOVERED_BACKEND_TOOLS: readonly StaticTool[] = uniqueStaticTools([
  ...ipfsKitDescriptorPack.backend_bindings.map(binding => ({
    owner: 'ipfs_kit_py' as const,
    tool_id: binding.tool_function,
    discovery_source: 'kit_manifest' as const,
    host_file_input: Object.hasOwn(binding.inputSchema.properties, 'file_path')
      || Object.hasOwn(binding.inputSchema.properties, 'output_path'),
  })),
  ...ipfsDatasetsBackendBindings.map(binding => ({
    owner: 'ipfs_datasets_py' as const,
    tool_id: binding.tool_function,
    discovery_source: 'datasets_descriptor' as const,
  })),
  ...ipfsAccelerateBackendBindings.map(binding => ({
    owner: 'ipfs_accelerate_py' as const,
    tool_id: binding.tool_function,
    discovery_source: 'accelerate_descriptor' as const,
  })),
]);

const APP_BINDINGS = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps
  .flatMap(app => app.backend_bindings.map(binding => ({ app_id: app.app_id, binding })))
  .sort((left, right) => left.binding.binding_id.localeCompare(right.binding.binding_id));

/**
 * Build a catalog for the static descriptor set plus names from a fresh
 * tools/list observation. Runtime names that have no app selection rule are
 * intentionally routed to MCP++ Explorer; they never disappear into an
 * unclassified bucket.
 */
export function buildAllToolsDispositionCatalog(
  discoveredTools: readonly DiscoveredBackendToolRecord[] = STATIC_DISCOVERED_BACKEND_TOOLS,
  reachabilityByTool: ReadonlyMap<string, readonly ToolTransportObservation[]> = new Map(),
): AllToolsDispositionCatalog {
  const normalized = normalizeDiscoveredTools(discoveredTools);
  return Object.freeze({
    schema: ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA,
    catalog_id: ALL_TOOLS_DISPOSITION_CATALOG_ID,
    version: ALL_TOOLS_DISPOSITION_CATALOG_VERSION,
    backend_owners: EXECUTABLE_BACKEND_OWNERS,
    source_contract: Object.freeze({
      contract_id: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.contract_id,
      version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version,
    }),
    entries: Object.freeze(normalized.map(tool => buildEntry(tool, reachabilityByTool.get(toolIdentity(tool)) ?? []))),
  });
}

export const ALL_TOOLS_DISPOSITION_CATALOG = buildAllToolsDispositionCatalog();

export function toolIdentity(tool: Pick<DiscoveredBackendToolRecord, 'owner' | 'tool_id'>): string {
  return `${tool.owner}:${tool.tool_id}`;
}

function normalizeDiscoveredTools(
  tools: readonly DiscoveredBackendToolRecord[],
): readonly StaticTool[] {
  const byIdentity = new Map<string, StaticTool>();
  for (const candidate of tools) {
    const owner = candidate.owner;
    const toolId = candidate.tool_id.trim();
    if (!OWNER_SET.has(owner) || !toolId) continue;
    const identity = `${owner}:${toolId}`;
    const previous = byIdentity.get(identity);
    byIdentity.set(identity, {
      owner,
      tool_id: toolId,
      discovery_source: candidate.discovery_source ?? previous?.discovery_source ?? 'runtime_discovery',
      host_file_input: Boolean(previous?.host_file_input || candidate.host_file_input),
    });
  }
  return [...byIdentity.values()].sort(compareTool);
}

function buildEntry(
  tool: StaticTool,
  observations: readonly ToolTransportObservation[],
): AllToolsDispositionEntry {
  const reachability = buildReachability(tool, observations);
  return Object.freeze({
    entry_id: `tool:${tool.owner}:${tool.tool_id}`,
    owner: tool.owner,
    tool_id: tool.tool_id,
    discovery_source: tool.discovery_source,
    disposition: dispositionFor(tool, reachability.observations),
    reachability,
  });
}

function dispositionFor(
  tool: StaticTool,
  observations: readonly ToolTransportObservation[],
): AllToolsDispositionEntry['disposition'] {
  if (tool.host_file_input) {
    return Object.freeze({
      kind: 'server_only',
      governance: 'policy_review_required',
      review_surface: 'mcp-control',
      rationale: 'The declared tool schema accepts a host filesystem path. Browser applications must not receive host paths, so a policy reviewer must authorize any server-side invocation.',
    });
  }
  if (observations.some(observation => observation.state === 'denied')) {
    return Object.freeze({
      kind: 'server_only',
      governance: 'policy_review_required',
      review_surface: 'mcp-control',
      rationale: 'Discovery or transport policy denied this exact tool. It remains visible only for MCP Control policy review until a new approved decision is recorded.',
    });
  }
  const appBinding = APP_BINDINGS.find(candidate => matchesBinding(candidate.binding, tool));
  if (appBinding) {
    return Object.freeze({
      kind: 'app_operation',
      app_id: appBinding.app_id,
      binding_id: appBinding.binding.binding_id,
      intent_id: appBinding.binding.mediated_intent.intent_id,
      ui_control_id: appBinding.binding.ui_control.control_id,
    });
  }
  return Object.freeze({
    kind: 'diagnostic_operation',
    app_id: 'mcp-plus-plus',
    operation_id: 'mcp-plus-plus.inspect-tool-descriptor',
    rationale: tool.discovery_source === 'runtime_discovery'
      ? 'This exact runtime-discovered name has no reviewed application selection rule, so MCP++ Explorer exposes its descriptor, receipt, and transport state for review.'
      : 'This descriptor-discovered tool has no reviewed application selection rule, so MCP++ Explorer exposes its descriptor, receipt, and transport state for review.',
  });
}

function matchesBinding(binding: ExecutableBackendBinding, tool: StaticTool): boolean {
  return binding.owner === tool.owner && binding.tool_selection.preferred_tool_ids.includes(tool.tool_id);
}

function buildReachability(
  tool: StaticTool,
  observations: readonly ToolTransportObservation[],
): ToolDispositionReachability {
  const byTransport = new Map<AllToolsTransport, ToolTransportObservation>();
  for (const observation of observations) {
    if (TRANSPORTS.includes(observation.transport)) byTransport.set(observation.transport, Object.freeze({ ...observation }));
  }
  // A recorded denial revokes browser approval until MCP Control records a
  // reviewed replacement decision. Keep the denied observation itself rather
  // than collapsing it into a generic unavailable state.
  const approved = tool.host_file_input || observations.some(observation => observation.state === 'denied')
    ? []
    : TRANSPORTS;
  return Object.freeze({
    approved_transports: Object.freeze([...approved]),
    observations: Object.freeze(TRANSPORTS.map(transport => byTransport.get(transport) ?? Object.freeze({
      transport,
      state: approved.includes(transport) ? 'unavailable' : 'unsupported',
      rationale: approved.includes(transport)
        ? 'No explicit HTTP/libp2p reachability receipt has been captured for this exact tool yet.'
        : 'This server-only tool is not approved for browser-mediated transport.',
    }))),
  });
}

export function validateAllToolsDispositionCatalog(
  catalog: AllToolsDispositionCatalog = ALL_TOOLS_DISPOSITION_CATALOG,
): AllToolsDispositionCatalogValidationResult {
  const errors: string[] = [];
  if (catalog.schema !== ALL_TOOLS_DISPOSITION_CATALOG_SCHEMA) errors.push('invalid catalog schema');
  if (catalog.catalog_id !== ALL_TOOLS_DISPOSITION_CATALOG_ID) errors.push('invalid catalog ID');
  if (catalog.version !== ALL_TOOLS_DISPOSITION_CATALOG_VERSION) errors.push('unsupported catalog version');
  if (catalog.backend_owners.length !== EXECUTABLE_BACKEND_OWNERS.length
    || EXECUTABLE_BACKEND_OWNERS.some(owner => !catalog.backend_owners.includes(owner))) {
    errors.push('catalog must include each backend owner exactly once');
  }
  const expected = new Set(STATIC_DISCOVERED_BACKEND_TOOLS.map(toolIdentity));
  const seen = new Set<string>();
  for (const entry of catalog.entries) {
    const identity = toolIdentity(entry);
    if (seen.has(identity)) errors.push(`${identity}: duplicate entry`);
    seen.add(identity);
    if (!OWNER_SET.has(entry.owner) || !entry.tool_id.trim()) errors.push(`${identity}: invalid owner or tool ID`);
    if (entry.entry_id !== `tool:${identity}`) errors.push(`${identity}: entry ID is not stable`);
    if (!['app_operation', 'diagnostic_operation', 'server_only'].includes(entry.disposition.kind)) {
      errors.push(`${identity}: missing disposition`);
    }
    if (entry.disposition.kind === 'app_operation') {
      const binding = APP_BINDINGS.find(candidate => candidate.binding.binding_id === entry.disposition.binding_id);
      if (!binding || binding.app_id !== entry.disposition.app_id
        || binding.binding.mediated_intent.intent_id !== entry.disposition.intent_id
        || binding.binding.ui_control.control_id !== entry.disposition.ui_control_id
        || !matchesBinding(binding.binding, entry)) {
        errors.push(`${identity}: app operation does not identify an approved exact binding`);
      }
    }
    if (entry.disposition.kind === 'diagnostic_operation'
      && (!entry.disposition.rationale || entry.disposition.app_id !== 'mcp-plus-plus')) {
      errors.push(`${identity}: diagnostic disposition is incomplete`);
    }
    if (entry.disposition.kind === 'server_only'
      && (entry.disposition.governance !== 'policy_review_required'
        || entry.disposition.review_surface !== 'mcp-control'
        || !entry.disposition.rationale)) {
      errors.push(`${identity}: server-only disposition is not governed`);
    }
    const transports = new Set(entry.reachability.observations.map(observation => observation.transport));
    if (transports.size !== TRANSPORTS.length || TRANSPORTS.some(transport => !transports.has(transport))) {
      errors.push(`${identity}: HTTP and libp2p observations must both be preserved`);
    }
    for (const observation of entry.reachability.observations) {
      if (observation.state === 'reachable' && !observation.evidence_id?.trim()) {
        errors.push(`${identity}/${observation.transport}: reachable claims require evidence_id`);
      }
      if (!observation.rationale.trim()) errors.push(`${identity}/${observation.transport}: rationale is required`);
    }
    if (entry.disposition.kind === 'server_only' && entry.reachability.approved_transports.length !== 0) {
      errors.push(`${identity}: server-only tool cannot approve browser transports`);
    }
    if (entry.disposition.kind !== 'server_only'
      && entry.reachability.approved_transports.join(',') !== TRANSPORTS.join(',')) {
      errors.push(`${identity}: app and diagnostic tools must declare HTTP/libp2p approval`);
    }
  }
  for (const identity of expected) {
    if (!seen.has(identity)) errors.push(`${identity}: static discovered tool is missing`);
  }
  return { valid: errors.length === 0, errors };
}

function compareTool(left: Pick<StaticTool, 'owner' | 'tool_id'>, right: Pick<StaticTool, 'owner' | 'tool_id'>): number {
  return toolIdentity(left).localeCompare(toolIdentity(right));
}

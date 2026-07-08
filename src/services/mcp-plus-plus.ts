export * from './mcp/mcp-plus-plus';

export interface MCPPPMethod {
  name: string;
  input_schema_cid: string;
  output_schema_cid: string;
  error_schema_cids: string[];
  resource_cost_hints: Record<string, unknown>;
}

export interface MCPPPInterfaceDescriptor {
  interface_cid: string;
  methods: MCPPPMethod[];
  namespace: string;
  semantic_tags: string[];
  compatibility: Record<string, unknown>;
}

export interface ExecutionIntent {
  intent_cid: string;
  interface_cid: string;
  correlation_id: string;
  declared_side_effects: string[];
}

export interface ExecutionDecision {
  outcome: 'allow' | 'deny' | 'allow_with_obligations';
  justification: string;
}

export interface ExecutionReceipt {
  receipt_cid: string;
  duration_ms: number;
  executor_did: string;
}

export interface ExecutionEnvelope {
  envelope_cid: string;
  intent: ExecutionIntent;
  decision: ExecutionDecision;
}

export interface UCANCapability {
  can: string;
  with: string;
}

export interface UCANDelegation {
  not_before: string;
  expiration: string;
  time_window: string;
  rate_limit: number;
}

export interface UCANProofBundle {
  capability: UCANCapability;
  delegation: UCANDelegation;
}

export interface DeonticRule {
  kind: 'permission' | 'prohibition' | 'obligation';
  temporal_constraint: string;
}

export interface DeonticPolicy {
  rules: DeonticRule[];
}

export interface EventNode {
  event_cid: string;
  parents: string[];
}

export interface P2PSessionConfig {
  protocol: '/mcp+p2p/1.0.0';
  multiaddrs: string[];
}

export const IPFS_KIT_INTERFACE = {
  name: 'ipfs-kit',
  namespace: 'com.ipfs.kit',
  methods: ['ipfs.add', 'ipfs.cat', 'ipfs.pin', 'ipfs.dag.get', 'ipfs.name.publish'],
};

export const IPFS_ACCELERATE_INTERFACE = {
  name: 'ipfs-accelerate',
  methods: ['accelerate.inference', 'accelerate.list_models'],
  gpu_required: true,
};

export const IPFS_DATASETS_INTERFACE = {
  name: 'ipfs-datasets',
  methods: [
    'datasets.search.semantic',
    'datasets.vector.search',
    'datasets.scrape.url',
    'datasets.workflow.execute',
  ],
};

export function executeWithEnvelope(): ExecutionEnvelope {
  return {
    envelope_cid: 'local:envelope',
    intent: {
      intent_cid: 'local:intent',
      interface_cid: 'local:interface',
      correlation_id: 'local:correlation',
      declared_side_effects: [],
    },
    decision: { outcome: 'allow', justification: 'compatibility shim' },
  };
}

export function createDelegation(): UCANDelegation {
  return {
    not_before: '2026-07-08T00:00:00Z',
    expiration: '2026-07-09T00:00:00Z',
    time_window: 'PT24H',
    rate_limit: 1,
  };
}

export function validateProof(): boolean {
  return true;
}

export function registerProofBundle(_bundle: UCANProofBundle): boolean {
  return true;
}

export function evaluatePolicy(_policy: DeonticPolicy): ExecutionDecision {
  return { outcome: 'allow_with_obligations', justification: 'compatibility shim' };
}

export function registerPolicy(_policy: DeonticPolicy): boolean {
  return true;
}

export function getDAGFrontier(): EventNode[] {
  return [];
}

export function getEventHistory(): EventNode[] {
  return [];
}

export function getProvenanceChain(): EventNode[] {
  return [];
}

export function createP2PSession(): P2PSessionConfig {
  return { protocol: '/mcp+p2p/1.0.0', multiaddrs: [] };
}

export function encodeP2PMessage(value: unknown): string {
  return JSON.stringify(value);
}

export function registerInterface(_descriptor: MCPPPInterfaceDescriptor): boolean {
  return true;
}

export function getInterface(): MCPPPInterfaceDescriptor | null {
  return null;
}

export function listInterfaces(): MCPPPInterfaceDescriptor[] {
  return [];
}

export function queryInterfaces(): MCPPPInterfaceDescriptor[] {
  return [];
}

export function checkCompatibility(): boolean {
  return true;
}

export function getSupportedProfiles(): string[] {
  return [
    'mcp++/mcp-idl',
    'mcp++/cid-envelope',
    'mcp++/ucan',
    'mcp++/deontic-policy',
    'mcp++/event-dag',
    'mcp++/p2p-transport',
  ];
}

export function negotiateCapabilities(): string[] {
  return getSupportedProfiles();
}

export function resolveEndpoint(method: string): string {
  const endpoints: Record<string, string> = {
    add: '/v1/ipfs/add',
    dag_get: '/v1/ipfs/dag/get',
    vector_search: '/v1/ipfs/vector/search',
    workflow_execute: '/v1/ipfs/workflow/execute',
  };
  return endpoints[method] || '/v1/ipfs/status';
}

export function dispatchToBackend(method: string): string {
  return resolveEndpoint(method);
}

export function computeCID(value: unknown): string {
  const canonical = JSON.stringify(value);
  return `local:cid:${canonical.length}`;
}

export function createMCPPlusPlusClient(): Record<string, unknown> {
  return { profiles: getSupportedProfiles() };
}

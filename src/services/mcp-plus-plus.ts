/**
 * MCP++ Protocol Support for SwissKnife
 * 
 * Implements the MCP++ execution profiles:
 * - Profile A: MCP-IDL (CID-Addressed Interface Contracts)
 * - Profile B: CID-Native Execution Artifacts (envelopes, receipts, events)
 * - Profile C: Capability Delegation (UCAN chains)
 * - Profile D: Temporal Deontic Policy Evaluation
 * - Profile E: mcp+p2p Transport Binding
 * - Event DAG: Append-only provenance DAG
 */

// --- Profile A: MCP-IDL Interface Descriptors ---

export interface MCPPPMethod {
  name: string;
  input_schema_cid: string;
  output_schema_cid: string;
  error_schema_cids: string[];
  interaction_pattern?: 'request-response' | 'stream' | 'event';
  resource_cost_hints?: { tokens?: number; latency_ms?: number; gpu_required?: boolean };
}

export interface MCPPPInterfaceDescriptor {
  name: string;
  namespace: string;
  version: string;
  interface_cid: string;
  methods: MCPPPMethod[];
  errors: { name: string; code?: number }[];
  requires: string[];
  compatibility: {
    compatible_with: string[];
    supersedes: string[];
  };
  semantic_tags: string[];
  observability: { trace: boolean; metrics: boolean; events: boolean };
}

// --- Profile B: CID-Native Execution Artifacts ---

export interface ExecutionIntent {
  interface_cid: string;
  tool: string;
  input_cid: string;
  expected_output_schema_cid: string;
  constraints_policy_cid?: string;
  correlation_id: string;
  declared_side_effects: string[];
}

export interface ExecutionDecision {
  decision: 'allow' | 'deny' | 'allow_with_obligations';
  intent_cid: string;
  policy_cid: string;
  proofs_checked: string[];
  justification: string;
  obligations: { type: string; deadline?: string }[];
  evaluator_dids: string[];
}

export interface ExecutionReceipt {
  receipt_cid: string;
  intent_cid: string;
  decision_cid: string;
  input_cid: string;
  output_cid: string;
  proof_cid: string;
  timestamp: string;
  executor_did: string;
  duration_ms: number;
  success: boolean;
  error?: string;
}

export interface ExecutionEnvelope {
  envelope_cid: string;
  intent: ExecutionIntent;
  decision: ExecutionDecision;
  input: any;
  output?: any;
  receipt?: ExecutionReceipt;
  event_cid?: string;
}

// --- Profile C: UCAN Capability Delegation ---

export interface UCANCapability {
  interface_cid: string;
  method: string;
  caveats: {
    time_window?: { not_before: string; expires_at: string };
    rate_limit?: { max_calls: number; window_seconds: number };
    content_scope?: string[];
  };
}

export interface UCANDelegation {
  issuer: string;      // DID of delegator
  audience: string;    // DID of delegate
  capabilities: UCANCapability[];
  proof_cid: string;
  not_before: number;
  expiration: number;
  expiry?: number;     // alias of expiration; canonical spec field name
  nonce: string;
  signature: string;
}

export interface UCANProofBundle {
  proof_cid: string;
  chain: UCANDelegation[];
  root_issuer: string;
}

// --- Profile D: Temporal Deontic Policy ---

export interface DeonticPolicy {
  policy_cid: string;
  version: string;
  rules: DeonticRule[];
  valid_from: string;
  valid_until: string;
}

export interface DeonticRule {
  type: 'permission' | 'prohibition' | 'obligation';
  agent_pattern: string;
  action_pattern: string;
  resource_pattern: string;
  temporal_constraint?: {
    time_window?: { start: string; end: string };
    frequency?: { max: number; period_seconds: number };
  };
  condition?: string;
  priority: number;
}

// --- Event DAG ---

export interface EventNode {
  event_cid: string;
  event_type?: string;
  parents: string[];
  payload?: Record<string, any>;
  intent_cid: string;
  decision_cid: string;
  receipt_cid?: string;
  timestamp: string | number;
  agent_did: string;
  interface_cid: string;
  method: string;
}

// --- Profile E: mcp+p2p Transport ---

export interface P2PSessionConfig {
  protocol_id: string;  // /mcp+p2p/1.0.0
  peer_id: string;
  multiaddrs: string[];
  capabilities: string[];
}

export interface P2PMessage {
  type: 'request' | 'response' | 'notification' | 'event';
  id: string;
  peer_id: string;
  payload: any;
  signature?: string;
}

// --- MCP++ Client Implementation ---

export class MCPPlusPlus {
  private descriptorRegistry: Map<string, MCPPPInterfaceDescriptor> = new Map();
  private eventDAG: EventNode[] = [];
  private envelopes: Map<string, ExecutionEnvelope> = new Map();
  private policies: Map<string, DeonticPolicy> = new Map();
  private proofBundles: Map<string, UCANProofBundle> = new Map();
  private agentDID: string;

  constructor(agentDID: string) {
    this.agentDID = agentDID;
  }

  // --- Profile A: Interface Registry ---

  registerInterface(descriptor: MCPPPInterfaceDescriptor): string {
    this.descriptorRegistry.set(descriptor.interface_cid, descriptor);
    return descriptor.interface_cid;
  }

  getInterface(cid: string): MCPPPInterfaceDescriptor | undefined {
    return this.descriptorRegistry.get(cid);
  }

  listInterfaces(): MCPPPInterfaceDescriptor[] {
    return Array.from(this.descriptorRegistry.values());
  }

  queryInterfaces(filter: { namespace?: string; tags?: string[]; method?: string }): MCPPPInterfaceDescriptor[] {
    return this.listInterfaces().filter(desc => {
      if (filter.namespace && desc.namespace !== filter.namespace) return false;
      if (filter.tags && !filter.tags.some(t => desc.semantic_tags.includes(t))) return false;
      if (filter.method && !desc.methods.some(m => m.name === filter.method)) return false;
      return true;
    });
  }

  checkCompatibility(cidA: string, cidB: string): boolean {
    const a = this.getInterface(cidA);
    const b = this.getInterface(cidB);
    if (!a || !b) return false;
    return a.compatibility.compatible_with.includes(cidB) ||
           b.compatibility.compatible_with.includes(cidA);
  }

  // --- Profile B: Execution Artifacts ---

  createIntent(interfaceCid: string, method: string, input: any): ExecutionIntent {
    const inputCid = this.computeCID(input);
    const desc = this.getInterface(interfaceCid);
    const methodDef = desc?.methods.find(m => m.name === method);
    return {
      interface_cid: interfaceCid,
      tool: method,
      input_cid: inputCid,
      expected_output_schema_cid: methodDef?.output_schema_cid || '',
      correlation_id: crypto.randomUUID(),
      declared_side_effects: [],
    };
  }

  async executeWithEnvelope(interfaceCid: string, method: string, input: any, proofCid?: string): Promise<ExecutionEnvelope> {
    const intent = this.createIntent(interfaceCid, method, input);
    const intentCid = this.computeCID(intent);

    // Profile D: Evaluate policy
    const decision = this.evaluatePolicy(intent, proofCid);
    const decisionCid = this.computeCID(decision);

    if (decision.decision === 'deny') {
      const envelope: ExecutionEnvelope = {
        envelope_cid: this.computeCID({ intent, decision }),
        intent,
        decision,
        input,
      };
      this.envelopes.set(envelope.envelope_cid, envelope);
      return envelope;
    }

    // Execute the method (delegate to backend)
    const startTime = Date.now();
    let output: any;
    let success = true;
    let error: string | undefined;

    try {
      output = await this.dispatchToBackend(interfaceCid, method, input);
    } catch (e: any) {
      success = false;
      error = e.message;
    }

    // Create receipt
    const receipt: ExecutionReceipt = {
      receipt_cid: this.computeCID({ intent_cid: intentCid, output }),
      intent_cid: intentCid,
      decision_cid: decisionCid,
      input_cid: intent.input_cid,
      output_cid: output ? this.computeCID(output) : '',
      proof_cid: proofCid || '',
      timestamp: new Date().toISOString(),
      executor_did: this.agentDID,
      duration_ms: Date.now() - startTime,
      success,
      error,
    };

    // Event DAG: append node
    const eventNode: EventNode = {
      event_cid: this.computeCID({ intent_cid: intentCid, receipt_cid: receipt.receipt_cid }),
      parents: this.getDAGFrontier(),
      intent_cid: intentCid,
      decision_cid: decisionCid,
      receipt_cid: receipt.receipt_cid,
      timestamp: receipt.timestamp,
      agent_did: this.agentDID,
      interface_cid: interfaceCid,
      method,
    };
    this.eventDAG.push(eventNode);

    const envelope: ExecutionEnvelope = {
      envelope_cid: this.computeCID({ intent, decision, receipt }),
      intent,
      decision,
      input,
      output,
      receipt,
      event_cid: eventNode.event_cid,
    };
    this.envelopes.set(envelope.envelope_cid, envelope);
    return envelope;
  }

  // --- Profile C: UCAN Delegation ---

  createDelegation(audience: string, capabilities: UCANCapability[], expirationHours = 24): UCANDelegation {
    const now = Math.floor(Date.now() / 1000);
    const delegation: UCANDelegation = {
      issuer: this.agentDID,
      audience,
      capabilities,
      proof_cid: '',
      not_before: now,
      expiration: now + (expirationHours * 3600),
      nonce: crypto.randomUUID(),
      signature: '', // Placeholder - real impl signs with Ed25519
    };
    delegation.proof_cid = this.computeCID(delegation);
    return delegation;
  }

  registerProofBundle(bundle: UCANProofBundle): void {
    this.proofBundles.set(bundle.proof_cid, bundle);
  }

  validateProof(proofCid: string, interfaceCid: string, method: string): boolean {
    const bundle = this.proofBundles.get(proofCid);
    if (!bundle) return false;
    
    const now = Math.floor(Date.now() / 1000);
    return bundle.chain.every(del => {
      if (del.expiration < now || del.not_before > now) return false;
      return del.capabilities.some(cap =>
        cap.interface_cid === interfaceCid && (cap.method === '*' || cap.method === method)
      );
    });
  }

  // --- Profile D: Temporal Deontic Policy ---

  registerPolicy(policy: DeonticPolicy): void {
    this.policies.set(policy.policy_cid, policy);
  }

  evaluatePolicy(intent: ExecutionIntent, proofCid?: string): ExecutionDecision {
    const now = new Date().toISOString();
    const obligations: { type: string; deadline?: string }[] = [];

    for (const [, policy] of this.policies) {
      if (policy.valid_from > now || policy.valid_until < now) continue;

      for (const rule of policy.rules.sort((a, b) => b.priority - a.priority)) {
        const matchesAction = rule.action_pattern === '*' || intent.tool.includes(rule.action_pattern);
        const matchesResource = rule.resource_pattern === '*' || intent.interface_cid.includes(rule.resource_pattern);

        if (matchesAction && matchesResource) {
          if (rule.type === 'prohibition') {
            return {
              decision: 'deny',
              intent_cid: this.computeCID(intent),
              policy_cid: policy.policy_cid,
              proofs_checked: proofCid ? [proofCid] : [],
              justification: `Prohibited by rule: ${rule.action_pattern} on ${rule.resource_pattern}`,
              obligations: [],
              evaluator_dids: [this.agentDID],
            };
          }
          if (rule.type === 'obligation') {
            obligations.push({ type: rule.action_pattern, deadline: rule.temporal_constraint?.time_window?.end });
          }
        }
      }
    }

    return {
      decision: obligations.length > 0 ? 'allow_with_obligations' : 'allow',
      intent_cid: this.computeCID(intent),
      policy_cid: this.policies.size > 0 ? Array.from(this.policies.keys())[0] : '',
      proofs_checked: proofCid ? [proofCid] : [],
      justification: 'Allowed by default policy',
      obligations,
      evaluator_dids: [this.agentDID],
    };
  }

  // --- Event DAG ---

  getDAGFrontier(): string[] {
    if (this.eventDAG.length === 0) return [];
    const allParents = new Set(this.eventDAG.flatMap(n => n.parents));
    return this.eventDAG.filter(n => !allParents.has(n.event_cid)).map(n => n.event_cid);
  }

  getEventHistory(fromCid?: string): EventNode[] {
    if (!fromCid) return [...this.eventDAG];
    const idx = this.eventDAG.findIndex(n => n.event_cid === fromCid);
    return idx >= 0 ? this.eventDAG.slice(idx) : [];
  }

  getProvenanceChain(eventCid: string): EventNode[] {
    const chain: EventNode[] = [];
    const visited = new Set<string>();
    const queue = [eventCid];
    while (queue.length > 0) {
      const cid = queue.shift()!;
      if (visited.has(cid)) continue;
      visited.add(cid);
      const node = this.eventDAG.find(n => n.event_cid === cid);
      if (node) {
        chain.push(node);
        queue.push(...node.parents);
      }
    }
    return chain;
  }

  // --- Profile E: P2P Transport ---

  createP2PSession(peerId: string, multiaddrs: string[]): P2PSessionConfig {
    return {
      protocol_id: '/mcp+p2p/1.0.0',
      peer_id: peerId,
      multiaddrs,
      capabilities: ['mcp-idl', 'cid-envelope', 'ucan', 'event-dag'],
    };
  }

  encodeP2PMessage(type: P2PMessage['type'], payload: any): P2PMessage {
    return {
      type,
      id: crypto.randomUUID(),
      peer_id: this.agentDID,
      payload,
    };
  }

  // --- Utility ---

  private computeCID(data: any): string {
    // Deterministic CID computation via canonical JSON hash
    const canonical = JSON.stringify(data, Object.keys(data || {}).sort());
    let hash = 0;
    for (let i = 0; i < canonical.length; i++) {
      hash = ((hash << 5) - hash + canonical.charCodeAt(i)) | 0;
    }
    return `bafy${Math.abs(hash).toString(36).padStart(40, '0')}`;
  }

  private async dispatchToBackend(interfaceCid: string, method: string, input: any): Promise<any> {
    // Map interface CID + method to the correct backend endpoint
    const desc = this.getInterface(interfaceCid);
    const endpoint = this.resolveEndpoint(desc, method);
    const BACKEND = 'http://localhost:8080';
    
    const response = await fetch(`${BACKEND}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) throw new Error(`Backend error: ${response.status}`);
    return response.json();
  }

  private resolveEndpoint(desc: MCPPPInterfaceDescriptor | undefined, method: string): string {
    // Resolve method name to API endpoint path
    const methodToEndpoint: Record<string, string> = {
      'ipfs.add': '/v1/ipfs/add',
      'ipfs.cat': '/v1/ipfs/cat',
      'ipfs.pin': '/v1/ipfs/pin',
      'ipfs.unpin': '/v1/ipfs/unpin',
      'ipfs.status': '/v1/ipfs/status',
      'ipfs.resolve': '/v1/ipfs/resolve',
      'ipfs.stat': '/v1/ipfs/stat',
      'ipfs.list_pins': '/v1/ipfs/list_pins',
      'ipfs.dag.get': '/v1/ipfs/dag/get',
      'ipfs.dag.put': '/v1/ipfs/dag/put',
      'ipfs.name.publish': '/v1/ipfs/name/publish',
      'ipfs.name.resolve': '/v1/ipfs/name/resolve',
      'accelerate.list_models': '/v1/ipfs/list_models',
      'accelerate.capabilities': '/v1/ipfs/capabilities',
      'accelerate.hardware_profile': '/v1/ipfs/hardware_profile',
      'accelerate.inference': '/v1/ipfs/inference',
      'accelerate.metrics': '/v1/ipfs/metrics',
      'accelerate.endpoints': '/v1/ipfs/endpoints',
      'datasets.list': '/v1/ipfs/list_datasets',
      'datasets.embed': '/v1/ipfs/embed',
      'datasets.generate': '/v1/ipfs/generate',
      'datasets.search.semantic': '/v1/ipfs/search/semantic',
      'datasets.search.similarity': '/v1/ipfs/search/similarity',
      'datasets.search.faceted': '/v1/ipfs/search/faceted',
      'datasets.search_models': '/v1/ipfs/search_models',
      'datasets.vector.index': '/v1/ipfs/vector/index',
      'datasets.vector.search': '/v1/ipfs/vector/search',
      'datasets.vector.metadata': '/v1/ipfs/vector/metadata',
      'datasets.scrape.url': '/v1/ipfs/scrape/url',
      'datasets.scrape.batch': '/v1/ipfs/scrape/batch',
      'datasets.workflow.execute': '/v1/ipfs/workflow/execute',
    };
    return methodToEndpoint[method] || `/v1/ipfs/${method.replace(/\./g, '/')}`;
  }

  // --- Capability Negotiation ---

  getSupportedProfiles(): string[] {
    return [
      'mcp++/mcp-idl',
      'mcp++/cid-envelope',
      'mcp++/ucan',
      'mcp++/deontic-policy',
      'mcp++/event-dag',
      'mcp++/p2p-transport',
    ];
  }

  negotiateCapabilities(remoteProfiles: string[]): string[] {
    return this.getSupportedProfiles().filter(p => remoteProfiles.includes(p));
  }
}

// --- Pre-built IPFS Interface Descriptors for MCP++ ---

export const IPFS_KIT_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'ipfs-kit',
  namespace: 'com.ipfs.kit',
  version: '1.0.0',
  interface_cid: 'bafyipfskit000000000000000000000000000001',
  methods: [
    { name: 'ipfs.add', input_schema_cid: 'bafy_add_in', output_schema_cid: 'bafy_add_out', error_schema_cids: ['bafy_err_io'] },
    { name: 'ipfs.cat', input_schema_cid: 'bafy_cat_in', output_schema_cid: 'bafy_cat_out', error_schema_cids: ['bafy_err_notfound'] },
    { name: 'ipfs.pin', input_schema_cid: 'bafy_pin_in', output_schema_cid: 'bafy_pin_out', error_schema_cids: ['bafy_err_io'] },
    { name: 'ipfs.unpin', input_schema_cid: 'bafy_unpin_in', output_schema_cid: 'bafy_unpin_out', error_schema_cids: ['bafy_err_notfound'] },
    { name: 'ipfs.list_pins', input_schema_cid: 'bafy_lpins_in', output_schema_cid: 'bafy_lpins_out', error_schema_cids: [] },
    { name: 'ipfs.stat', input_schema_cid: 'bafy_stat_in', output_schema_cid: 'bafy_stat_out', error_schema_cids: ['bafy_err_notfound'] },
    { name: 'ipfs.resolve', input_schema_cid: 'bafy_resolve_in', output_schema_cid: 'bafy_resolve_out', error_schema_cids: ['bafy_err_notfound'] },
    { name: 'ipfs.dag.get', input_schema_cid: 'bafy_dagget_in', output_schema_cid: 'bafy_dagget_out', error_schema_cids: ['bafy_err_notfound'] },
    { name: 'ipfs.dag.put', input_schema_cid: 'bafy_dagput_in', output_schema_cid: 'bafy_dagput_out', error_schema_cids: ['bafy_err_io'] },
    { name: 'ipfs.name.publish', input_schema_cid: 'bafy_npub_in', output_schema_cid: 'bafy_npub_out', error_schema_cids: ['bafy_err_io'] },
    { name: 'ipfs.name.resolve', input_schema_cid: 'bafy_nres_in', output_schema_cid: 'bafy_nres_out', error_schema_cids: ['bafy_err_notfound'] },
    { name: 'ipfs.status', input_schema_cid: 'bafy_status_in', output_schema_cid: 'bafy_status_out', error_schema_cids: [] },
  ],
  errors: [
    { name: 'NotFound', code: 404 },
    { name: 'IOError', code: 500 },
    { name: 'Timeout', code: 408 },
  ],
  requires: ['mcp++/cid-envelope'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['ipfs', 'storage', 'content-addressing', 'dag', 'ipns', 'pinning'],
  observability: { trace: true, metrics: true, events: true },
};

export const IPFS_ACCELERATE_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'ipfs-accelerate',
  namespace: 'com.ipfs.accelerate',
  version: '1.0.0',
  interface_cid: 'bafyipfsaccelerate0000000000000000000000001',
  methods: [
    { name: 'accelerate.list_models', input_schema_cid: 'bafy_lm_in', output_schema_cid: 'bafy_lm_out', error_schema_cids: [] },
    { name: 'accelerate.capabilities', input_schema_cid: 'bafy_caps_in', output_schema_cid: 'bafy_caps_out', error_schema_cids: [] },
    { name: 'accelerate.hardware_profile', input_schema_cid: 'bafy_hw_in', output_schema_cid: 'bafy_hw_out', error_schema_cids: [] },
    { name: 'accelerate.inference', input_schema_cid: 'bafy_inf_in', output_schema_cid: 'bafy_inf_out', error_schema_cids: ['bafy_err_model'], interaction_pattern: 'stream', resource_cost_hints: { gpu_required: true } },
    { name: 'accelerate.metrics', input_schema_cid: 'bafy_met_in', output_schema_cid: 'bafy_met_out', error_schema_cids: [] },
    { name: 'accelerate.endpoints', input_schema_cid: 'bafy_ep_in', output_schema_cid: 'bafy_ep_out', error_schema_cids: [] },
  ],
  errors: [
    { name: 'ModelNotFound', code: 404 },
    { name: 'GPUUnavailable', code: 503 },
    { name: 'InferenceError', code: 500 },
  ],
  requires: ['mcp++/cid-envelope', 'mcp++/ucan'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['ai', 'inference', 'gpu', 'models', 'acceleration'],
  observability: { trace: true, metrics: true, events: true },
};

export const IPFS_DATASETS_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'ipfs-datasets',
  namespace: 'com.ipfs.datasets',
  version: '1.0.0',
  interface_cid: 'bafyipfsdatasets00000000000000000000000001',
  methods: [
    { name: 'datasets.list', input_schema_cid: 'bafy_dsl_in', output_schema_cid: 'bafy_dsl_out', error_schema_cids: [] },
    { name: 'datasets.embed', input_schema_cid: 'bafy_emb_in', output_schema_cid: 'bafy_emb_out', error_schema_cids: ['bafy_err_model'] },
    { name: 'datasets.generate', input_schema_cid: 'bafy_gen_in', output_schema_cid: 'bafy_gen_out', error_schema_cids: ['bafy_err_model'], interaction_pattern: 'stream', resource_cost_hints: { tokens: 500, gpu_required: true } },
    { name: 'datasets.search.semantic', input_schema_cid: 'bafy_ss_in', output_schema_cid: 'bafy_ss_out', error_schema_cids: [] },
    { name: 'datasets.search.similarity', input_schema_cid: 'bafy_sim_in', output_schema_cid: 'bafy_sim_out', error_schema_cids: [] },
    { name: 'datasets.search.faceted', input_schema_cid: 'bafy_fac_in', output_schema_cid: 'bafy_fac_out', error_schema_cids: [] },
    { name: 'datasets.search_models', input_schema_cid: 'bafy_sm_in', output_schema_cid: 'bafy_sm_out', error_schema_cids: [] },
    { name: 'datasets.vector.index', input_schema_cid: 'bafy_vi_in', output_schema_cid: 'bafy_vi_out', error_schema_cids: [] },
    { name: 'datasets.vector.search', input_schema_cid: 'bafy_vs_in', output_schema_cid: 'bafy_vs_out', error_schema_cids: [] },
    { name: 'datasets.vector.metadata', input_schema_cid: 'bafy_vm_in', output_schema_cid: 'bafy_vm_out', error_schema_cids: [] },
    { name: 'datasets.scrape.url', input_schema_cid: 'bafy_su_in', output_schema_cid: 'bafy_su_out', error_schema_cids: ['bafy_err_network'] },
    { name: 'datasets.scrape.batch', input_schema_cid: 'bafy_sb_in', output_schema_cid: 'bafy_sb_out', error_schema_cids: ['bafy_err_network'] },
    { name: 'datasets.workflow.execute', input_schema_cid: 'bafy_wf_in', output_schema_cid: 'bafy_wf_out', error_schema_cids: ['bafy_err_workflow'] },
  ],
  errors: [
    { name: 'ModelError', code: 500 },
    { name: 'NetworkError', code: 502 },
    { name: 'WorkflowError', code: 500 },
    { name: 'NotFound', code: 404 },
  ],
  requires: ['mcp++/cid-envelope', 'mcp++/ucan'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['datasets', 'search', 'embeddings', 'vectors', 'scraping', 'workflows', 'generation'],
  observability: { trace: true, metrics: true, events: true },
};

// --- Factory ---

export function createMCPPlusPlusClient(agentDID: string): MCPPlusPlus {
  const client = new MCPPlusPlus(agentDID);
  // Register all IPFS interfaces
  client.registerInterface(IPFS_KIT_INTERFACE);
  client.registerInterface(IPFS_ACCELERATE_INTERFACE);
  client.registerInterface(IPFS_DATASETS_INTERFACE);
  return client;
}

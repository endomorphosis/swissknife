const DEFAULT_TIMEOUT_MS = 8_000;

export const MCP_PLUS_PLUS_DESKTOP_SERVICES = Object.freeze([
  {
    id: 'ipfs_kit_py',
    label: 'IPFS Kit',
    baseUrl: '/mcp/services/ipfs_kit_py',
    mcpPath: '/mcp',
    healthPath: '/mcp/health',
  },
  {
    id: 'ipfs_datasets_py',
    label: 'IPFS Datasets',
    baseUrl: '/mcp/services/ipfs_datasets_py',
    mcpPath: '/mcp',
    healthPath: '/mcp/health',
  },
  {
    id: 'ipfs_accelerate_py',
    label: 'IPFS Accelerate',
    baseUrl: '/mcp/services/ipfs_accelerate_py',
    mcpPath: '/mcp',
    healthPath: '/mcp/health',
  },
]);

export const MCP_PLUS_PLUS_PROFILE_CAPABILITIES = Object.freeze({
  a: 'mcp++/mcp-idl',
  b: 'mcp++/cid-envelope',
  c: 'mcp++/ucan',
  d: 'mcp++/deontic-policy',
  e: 'mcp++/p2p-transport',
  f: 'mcp++/event-dag',
  g: 'mcp++/risk-scheduling',
});

const MCP_PLUS_PLUS_CAPABILITIES = Object.freeze({
  'mcp++/mcp-idl': true,
  'mcp++/cid-envelope': true,
  'mcp++/ucan': true,
  'mcp++/deontic-policy': true,
  'mcp++/event-dag': true,
  'mcp++/groth16-mpc-ceremony': true,
  'mcp++/p2p-transport': true,
  'mcp++/risk-scheduling': true,
});

export class MCPPlusPlusDesktopClient {
  constructor(options = {}) {
    this.fetch = options.fetch || globalThis.fetch?.bind(globalThis);
    this.timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.services = new Map((options.services || MCP_PLUS_PLUS_DESKTOP_SERVICES).map(service => [service.id, {
      ...service,
      baseUrl: String(service.baseUrl).replace(/\/$/, ''),
    }]));
    this.requestSequence = 0;
  }

  listServices() {
    return [...this.services.values()].map(service => ({ ...service }));
  }

  getService(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) throw new Error(`Unknown MCP++ service: ${serviceId}`);
    return service;
  }

  async rpc(serviceId, method, params = {}) {
    const service = this.getService(serviceId);
    const response = await this.request(`${service.baseUrl}${service.mcpPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `desktop-${++this.requestSequence}`,
        method,
        params,
      }),
    });
    const payload = await parseResponse(response);
    if (!response.ok) throw new Error(payload?.error?.message || `MCP++ request failed: ${response.status}`);
    if (payload?.error) throw new Error(payload.error.message || `MCP++ method failed: ${method}`);
    return payload?.result;
  }

  async get(serviceId, path) {
    const service = this.getService(serviceId);
    const response = await this.request(`${service.baseUrl}${path}`);
    const payload = await parseResponse(response);
    if (!response.ok) throw new Error(payload?.error || `MCP++ request failed: ${response.status}`);
    return payload;
  }

  async post(serviceId, path, body = {}) {
    const service = this.getService(serviceId);
    const response = await this.request(`${service.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await parseResponse(response);
    if (!response.ok) throw new Error(payload?.error || `MCP++ request failed: ${response.status}`);
    return payload;
  }

  async inspectService(serviceId) {
    const service = this.getService(serviceId);
    const probes = {
      health: this.get(serviceId, service.healthPath),
      initialize: this.rpc(serviceId, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { experimental: MCP_PLUS_PLUS_CAPABILITIES },
        clientInfo: { name: 'swissknife-virtual-desktop', version: '1.0.0' },
      }),
      tools: this.rpc(serviceId, 'tools/list', {}),
      interfaces: this.rpc(serviceId, 'interfaces/list', {}),
      frontier: this.rpc(serviceId, 'mcp++/dag/frontier', {}),
      archives: this.rpc(serviceId, 'mcp++/dag/archives', {}),
      peers: this.rpc(serviceId, 'mcp++/p2p/peers', {}),
      profileG: this.rpc(serviceId, 'mcp++/risk/profile', {}),
      helia: this.get(serviceId, '/mcp/helia/status'),
    };
    const settled = await Promise.all(Object.entries(probes).map(async ([name, probe]) => {
      try {
        return [name, { ok: true, value: await probe }];
      } catch (error) {
        return [name, { ok: false, error: messageFor(error) }];
      }
    }));
    const results = Object.fromEntries(settled);
    const tools = Array.isArray(results.tools?.value?.tools) ? results.tools.value.tools : [];
    const interfaces = Array.isArray(results.interfaces?.value?.interfaces) ? results.interfaces.value.interfaces : [];
    const profiles = extractProfiles(results.initialize?.value);
    return {
      service: service.id,
      label: service.label,
      endpoint: `${service.baseUrl}${service.mcpPath}`,
      available: results.health?.ok === true && results.initialize?.ok === true,
      profiles,
      toolCount: tools.length,
      tools,
      interfaces,
      frontier: asArray(results.frontier?.value?.frontier),
      archives: asArray(results.archives?.value?.archives),
      peers: asArray(results.peers?.value?.peers),
      profileG: results.profileG?.value || null,
      helia: results.helia?.value || null,
      health: results.health?.value || null,
      errors: Object.fromEntries(Object.entries(results)
        .filter(([, result]) => !result.ok)
        .map(([name, result]) => [name, result.error])),
      inspectedAt: new Date().toISOString(),
    };
  }

  async inspectAll() {
    return Promise.all(this.listServices().map(service => this.inspectService(service.id)));
  }

  async listToolSchema(serviceId, toolName) {
    const tools = await this.rpc(serviceId, 'tools/list', {});
    return asArray(tools?.tools).find(tool => tool?.name === toolName) || null;
  }

  async callTool(serviceId, name, args = {}) {
    if (!name) throw new Error('Select a tool before execution.');
    return this.rpc(serviceId, 'tools/call', { name, arguments: args });
  }

  // Profile A: MCP-IDL interface repository.
  async listInterfaces(serviceId) {
    return this.rpc(serviceId, 'interfaces/list', {});
  }

  async getInterface(serviceId, interfaceCid) {
    if (!interfaceCid) throw new Error('Enter an interface CID.');
    return this.rpc(serviceId, 'interfaces/get', { interface_cid: interfaceCid });
  }

  async checkInterfaceCompatibility(serviceId, interfaceCid) {
    if (!interfaceCid) throw new Error('Enter an interface CID.');
    return this.rpc(serviceId, 'interfaces/compat', { interface_cid: interfaceCid });
  }

  async selectInterfaces(serviceId, taskHintCid, budget = {}) {
    if (!taskHintCid) throw new Error('Enter a task-hint CID.');
    return this.rpc(serviceId, 'interfaces/select', { task_hint_cid: taskHintCid, budget });
  }

  // Profile B: CID-native execution envelope.
  async executeEnvelope(serviceId, request) {
    return this.rpc(serviceId, 'mcp++/execute', request || {});
  }

  // Profile C: UCAN delegation and peer identity.
  async delegateCapability(serviceId, request) {
    return this.rpc(serviceId, 'mcp++/ucan/delegate', request || {});
  }

  async validateDelegation(serviceId, request) {
    return this.rpc(serviceId, 'mcp++/ucan/validate', request || {});
  }

  async revokeDelegation(serviceId, proofCid) {
    if (!proofCid) throw new Error('Enter a delegation proof CID.');
    return this.rpc(serviceId, 'mcp++/ucan/revoke', { proof_cid: proofCid });
  }

  async evaluatePolicy(serviceId, request) {
    return this.rpc(serviceId, 'mcp++/policy/evaluate', request);
  }

  // Profile E: MCP+p2p peer discovery over the active MCP++ service.
  async discoverPeers(serviceId) {
    return this.rpc(serviceId, 'mcp++/p2p/peers', {});
  }

  async getDagHistory(serviceId, limit = 50) {
    return this.rpc(serviceId, 'mcp++/dag/history', { limit });
  }

  async getDagProvenance(serviceId, eventCid, limit = 100) {
    if (!eventCid) throw new Error('Enter an Event DAG CID.');
    return this.rpc(serviceId, 'mcp++/dag/provenance', { event_cid: eventCid, limit });
  }

  async appendDagEvent(serviceId, event) {
    return this.rpc(serviceId, 'mcp++/dag/append', { event: event || {} });
  }

  async compactDag(serviceId, options = {}) {
    return this.rpc(serviceId, 'mcp++/dag/compact', options);
  }

  async archiveDag(serviceId, options = {}) {
    return this.rpc(serviceId, 'mcp++/dag/archive', options);
  }

  async listDagArchives(serviceId) {
    return this.rpc(serviceId, 'mcp++/dag/archives', {});
  }

  async getDagCertificate(serviceId, certificateCid) {
    if (!certificateCid) throw new Error('Enter a compaction certificate CID.');
    return this.rpc(serviceId, 'mcp++/dag/certificate/get', { certificate_cid: certificateCid });
  }

  async verifyDagCertificate(serviceId, certificateCid) {
    if (!certificateCid) throw new Error('Enter a compaction certificate CID.');
    return this.rpc(serviceId, 'mcp++/dag/certificate/verify', { certificate_cid: certificateCid });
  }

  async getDagInclusion(serviceId, eventCid) {
    if (!eventCid) throw new Error('Enter an archived Event DAG CID.');
    return this.rpc(serviceId, 'mcp++/dag/inclusion', { event_cid: eventCid });
  }

  async getArtifact(serviceId, cid) {
    if (!cid) throw new Error('Enter an artifact CID.');
    return this.rpc(serviceId, 'mcp++/artifacts/get', { cid });
  }

  async identifyPeer(serviceId, audience, nonce = randomNonce()) {
    if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(String(audience || ''))) {
      throw new Error('A valid Ed25519 did:key audience is required.');
    }
    return this.rpc(serviceId, 'mcp++/ucan/identity', { audience, nonce, transport: 'http' });
  }

  // Profile G: all methods preserve their canonical JSON-RPC names over HTTP
  // and MCP+p2p. Mutation payloads are intentionally structured and explicit.
  async getRiskSchedulingProfile(serviceId) { return this.rpc(serviceId, 'mcp++/risk/profile', {}); }
  async listGoals(serviceId, params = {}) { return this.rpc(serviceId, 'mcp++/goals/list', params); }
  async getGoal(serviceId, goalCid) { return this.rpc(serviceId, 'mcp++/goals/get', { goal_cid: required(goalCid, 'goal CID') }); }
  async createGoal(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/goals/create', request); }
  async decomposeGoal(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/goals/decompose', request); }
  async selectGoalPlan(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/goals/select', request); }
  async listTasks(serviceId, params = {}) { return this.rpc(serviceId, 'mcp++/tasks/list', params); }
  async listReadyTasks(serviceId, params = {}) { return this.rpc(serviceId, 'mcp++/tasks/ready', params); }
  async getTask(serviceId, taskCid) { return this.rpc(serviceId, 'mcp++/tasks/get', { task_cid: required(taskCid, 'task CID') }); }
  async createTask(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/tasks/create', request); }
  async assessRisk(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/risk/assess', request); }
  async getRiskEvidence(serviceId, subjectCid, params = {}) { return this.rpc(serviceId, 'mcp++/risk/evidence', { ...params, subject_cid: required(subjectCid, 'subject CID') }); }
  async getRiskHistory(serviceId, subjectCid, params = {}) { return this.rpc(serviceId, 'mcp++/risk/history', { ...params, subject_cid: required(subjectCid, 'subject CID') }); }
  async queryNeighborhood(serviceId, params = {}) { return this.rpc(serviceId, 'mcp++/neighborhood/query', params); }
  async attestNeighborhood(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/neighborhood/attest', request); }
  async getScheduleFrontier(serviceId, params = {}) { return this.rpc(serviceId, 'mcp++/schedule/frontier', params); }
  async getScheduleStatus(serviceId, taskCid) { return this.rpc(serviceId, 'mcp++/schedule/status', { task_cid: required(taskCid, 'task CID') }); }
  async proposeSchedule(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/schedule/propose', request); }
  async claimTask(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/schedule/claim', request); }
  async renewTaskClaim(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/schedule/renew', request); }
  async releaseTaskClaim(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/schedule/release', request); }
  async resolveTaskClaims(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/schedule/resolve', request); }
  async reconcileSchedule(serviceId, request) { return this.profileGMutation(serviceId, 'mcp++/schedule/reconcile', request); }

  async profileGMutation(serviceId, method, request) {
    validateMutationContext(request);
    return this.rpc(serviceId, method, request);
  }

  createSupervisorGateway() {
    return {
      invoke: async invocation => {
        const profileGRead = PROFILE_G_GATEWAY_READS[invocation?.capability_id];
        if (profileGRead) return this.invokeProfileGSupervisorRead(invocation, profileGRead);
        const profileGWrite = PROFILE_G_GATEWAY_WRITES[invocation?.capability_id];
        if (profileGWrite) return this.invokeProfileGSupervisorWrite(invocation, profileGWrite);
        if (invocation?.capability_id === 'supervisor.logs.read') return this.invokeSupervisorLogsRead(invocation);
        if (invocation?.capability_id === 'supervisor.content.retrieve') return this.invokeSupervisorContentRetrieve(invocation);
        if (invocation?.capability_id === 'supervisor.receipts.persist') return this.invokeSupervisorReceiptPersist(invocation);
        if (invocation?.capability_id === 'supervisor.event-dag.checkpoint') return this.invokeSupervisorEventDagCheckpoint(invocation);
        if (invocation?.capability_id === 'supervisor.prompt-steering.request') return this.invokeSupervisorPromptSteering(invocation);
        if (invocation?.capability_id !== 'supervisor.health.read') return unavailableGatewayResult(invocation, 'capability_unavailable', 'The requested Supervisor gateway capability is not mapped.');
        const services = await this.inspectAll();
        const available = services.filter(service => service.available);
        if (available.length === 0) {
          return unavailableGatewayResult(invocation, 'server_unavailable', 'No configured MCP++ service responded to the browser diagnostic probe.');
        }
        const observedAt = new Date().toISOString();
        return {
          state: 'available',
          capability_id: invocation.capability_id,
          owner: invocation.owner,
          correlation_id: invocation.correlation_id,
          observed_at: observedAt,
          data: {
            status: available.length === services.length ? 'available' : 'degraded',
            active_goal_count: 0,
            queued_task_count: 0,
            running_task_count: 0,
            server_time: observedAt,
            backends: services.map(service => ({
              owner: service.service,
              status: service.available ? 'available' : 'unavailable',
              transport: service.profiles.includes('mcp++/p2p-transport') ? 'mcp++/libp2p' : 'mcp++/http',
              receipt: null,
              tool_count: service.toolCount,
              diagnostic_errors: service.errors,
            })),
          },
        };
      },
    };
  }

  async invokeProfileGSupervisorRead(invocation, method) {
    const candidates = this.listServices().filter(service => service.id === invocation.owner || invocation.owner === 'ipfs_accelerate_py');
    const responses = await Promise.all(candidates.map(async service => {
      try {
        await this.getRiskSchedulingProfile(service.id);
        if (['supervisor.claims.read', 'supervisor.risk.read', 'supervisor.receipts.read'].includes(invocation.capability_id)) {
          const taskPage = await this.listTasks(service.id, { limit: Math.min(invocation.payload?.limit || 100, 100) });
          const taskCids = asArray(taskPage?.items).map(item => item?.artifact_cid || item?.cid).filter(Boolean);
          const values = await Promise.all(taskCids.map(async taskCid => {
            try {
              return invocation.capability_id === 'supervisor.risk.read'
                ? await this.getRiskHistory(service.id, taskCid, { limit: 25 })
                : await this.getScheduleStatus(service.id, taskCid);
            } catch (error) {
              return { task_cid: taskCid, unavailable: messageFor(error) };
            }
          }));
          return { service: service.id, ok: true, value: { items: values.flatMap(value => asArray(value?.items).length ? value.items : [value]) } };
        }
        return { service: service.id, ok: true, value: await this.rpc(service.id, method, invocation.payload || {}) };
      } catch (error) {
        return { service: service.id, ok: false, error: messageFor(error) };
      }
    }));
    const available = responses.filter(item => item.ok);
    if (!available.length) return unavailableGatewayResult(invocation, 'server_unavailable', responses.map(item => `${item.service}: ${item.error}`).join('; ') || 'No Profile G server is available.');
    return {
      state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
      correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(),
      data: normalizeProfileGGatewayData(invocation.capability_id, available),
    };
  }

  async invokeProfileGSupervisorWrite(invocation, method) {
    if (invocation?.access !== 'governed-write' || !invocation?.payload?.confirmed) {
      return { ...unavailableGatewayResult(invocation, 'confirmation_required', 'Profile G mutations require an explicit reviewed confirmation.'), state: 'denied', policy_class: invocation?.policy_class || 'confirm', required_confirmation: true };
    }
    try {
      validateMutationContext(invocation.payload);
      const value = await this.rpc(invocation.owner || 'ipfs_accelerate_py', method, invocation.payload);
      const receiptCid = value?.receipt_cid || value?.receipt?.cid;
      if (!receiptCid) return unavailableGatewayResult(invocation, 'receipt_unavailable', 'The governed Profile G mutation returned no immutable receipt CID.');
      return { state: 'available', capability_id: invocation.capability_id, owner: invocation.owner, correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(), data: value, receipt: { receipt_id: receiptCid, cid: receiptCid, owner: 'ipfs_kit_py' } };
    } catch (error) {
      return unavailableGatewayResult(invocation, 'transport_unavailable', messageFor(error));
    }
  }

  // Supervisor logs are the mediated ipfs_accelerate_py state service's own
  // Event DAG (Profile F): its history is a genuine supervisor log, exposed
  // here with event -> log-entry normalization. No other log source exists.
  async invokeSupervisorLogsRead(invocation) {
    try {
      const limit = Math.min(Math.max(Number(invocation.payload?.limit) || 50, 1), 200);
      const history = await this.getDagHistory('ipfs_accelerate_py', limit);
      return {
        state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
        correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(),
        data: asArray(history?.events).map(normalizeDagEventLogEntry),
      };
    } catch (error) {
      return unavailableGatewayResult(invocation, 'server_unavailable', messageFor(error));
    }
  }

  // Receipt content retrieval is served by the ipfs_kit_py artifact store
  // (GET /mcp/artifacts/<cid>), the evidence authority for supervisor reads.
  async invokeSupervisorContentRetrieve(invocation) {
    const cid = String(invocation.payload?.cid || '').trim();
    if (!isContentCid(cid)) {
      return unavailableGatewayResult(invocation, 'receipt_unavailable', 'Supervisor content retrieval requires a valid content CID.');
    }
    try {
      const artifact = await this.get('ipfs_kit_py', `/mcp/artifacts/${encodeURIComponent(cid)}`);
      if (!artifact || artifact.found !== true) {
        return unavailableGatewayResult(invocation, 'receipt_unavailable', artifact?.error || `Artifact ${cid} was not found in ipfs_kit_py.`);
      }
      return {
        state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
        correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(),
        data: {
          cid: artifact.cid || cid,
          found: true,
          verified: artifact.verified === true,
          backend: artifact.backend || 'ipfs_kit_py',
          metadata: artifact.metadata ?? null,
          content_bytes: typeof artifact.bytes_base64 === 'string'
            ? Math.floor(artifact.bytes_base64.replace(/=+$/, '').length * 3 / 4)
            : 0,
        },
      };
    } catch (error) {
      return unavailableGatewayResult(invocation, 'server_unavailable', messageFor(error));
    }
  }

  // Receipt persistence is served by the ipfs_kit_py artifact store
  // (POST /mcp/artifacts/put). The store only accepts bytes whose canonical
  // CIDv1-raw+sha2-256 matches the supplied CID, so the gateway computes the
  // CID over the exact receipt-record bytes it sends. Governed-write: the
  // console's reviewed confirmation token is required.
  async invokeSupervisorReceiptPersist(invocation) {
    const denial = supervisorGovernedWriteDenial(invocation);
    if (denial) return denial;
    const receiptRecord = invocation.payload?.receipt;
    if (!receiptRecord || typeof receiptRecord !== 'object' || !receiptRecord.receipt_id) {
      return unavailableGatewayResult(invocation, 'receipt_unavailable', 'A receipt record is required for supervisor receipt persistence.');
    }
    try {
      const bytes = new TextEncoder().encode(stableStringifyValue(receiptRecord));
      const cid = await contentCidForBytes(bytes);
      const result = await this.post('ipfs_kit_py', '/mcp/artifacts/put', {
        cid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'supervisor-receipt',
        kind: 'receipt',
        service: 'ipfs_kit_py',
        pin: true,
      });
      if (!result || result.persisted !== true || result.cid !== cid) {
        return unavailableGatewayResult(invocation, 'persistence_failed', result?.error || 'ipfs_kit_py did not verify the persisted receipt artifact.');
      }
      const persistedReceipt = { ...receiptRecord, cid, owner: 'ipfs_kit_py' };
      return {
        state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
        correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(),
        data: { ...persistedReceipt, persisted: true, verified: result.verified === true, backend: result.backend || 'ipfs_kit_py' },
        receipt: persistedReceipt,
      };
    } catch (error) {
      return unavailableGatewayResult(invocation, 'persistence_failed', messageFor(error));
    }
  }

  // An event-DAG checkpoint is a genuine append to the ipfs_kit_py Event DAG
  // (POST /mcp/dag/append) naming the selected receipt. Governed-write: the
  // console's reviewed confirmation token is required.
  async invokeSupervisorEventDagCheckpoint(invocation) {
    const denial = supervisorGovernedWriteDenial(invocation);
    if (denial) return denial;
    const receiptRecord = invocation.payload?.receipt;
    if (!receiptRecord || typeof receiptRecord !== 'object' || !receiptRecord.receipt_id) {
      return unavailableGatewayResult(invocation, 'receipt_unavailable', 'A receipt record is required for an event-DAG checkpoint.');
    }
    try {
      const appended = await this.post('ipfs_kit_py', '/mcp/dag/append', {
        event: {
          event_type: 'supervisor.receipt.checkpoint',
          receipt_id: receiptRecord.receipt_id,
          receipt_cid: receiptRecord.cid || null,
          correlation_id: invocation.correlation_id || null,
          parents: [],
        },
      });
      if (!appended?.event_cid) {
        return unavailableGatewayResult(invocation, 'persistence_failed', 'ipfs_kit_py event DAG did not return a checkpoint event CID.');
      }
      const checkpointReceipt = {
        receipt_id: `rcpt-checkpoint-${receiptRecord.receipt_id}`,
        cid: appended.event_cid,
        owner: 'ipfs_kit_py',
        created_at: new Date().toISOString(),
      };
      return {
        state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
        correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(),
        data: {
          receipt: checkpointReceipt,
          event_dag: { cid: appended.event_cid, event_type: 'supervisor.receipt.checkpoint', status: appended.status || 'recorded' },
        },
        receipt: checkpointReceipt,
      };
    } catch (error) {
      return unavailableGatewayResult(invocation, 'persistence_failed', messageFor(error));
    }
  }

  // Prompt steering is owned by the ipfs_accelerate_py agent supervisor:
  // the facade's Supervisor.steer, published as the prompt-lifecycle tool
  // agent_supervisor_steer (ASE3-011) and served by the accelerate compat
  // adapter's steering bridge, which hosts the one long-lived Supervisor
  // session that tool requires. Governance mirrors the other governed
  // writes: dry runs are NOT executed (the console previews them locally;
  // the typed capability_unavailable result below is what engages that
  // preview), and a confirmed submission without the console's reviewed
  // confirmation token is denied here, before any backend call. Backend
  // failures surface with the backend's own message; nothing is simulated.
  async invokeSupervisorPromptSteering(invocation) {
    const payload = invocation.payload || {};
    if (payload.dry_run === true) {
      return unavailableGatewayResult(invocation, 'capability_unavailable', 'Prompt steering dry runs are previewed locally by the console; the backend route executes confirmed submissions only.');
    }
    const denial = supervisorGovernedWriteDenial(invocation);
    if (denial) return denial;
    const prompt = String(payload.prompt || '').trim();
    if (!prompt) {
      return unavailableGatewayResult(invocation, 'invalid_target', 'Prompt steering requires prompt text.');
    }
    const targetType = payload.target_type || 'task';
    const targetId = String(payload.target_id || '');
    const normalizedTarget = payload.expected_normalized_target || `${targetType}:${targetId}`;
    let outcome;
    try {
      outcome = await this.rpc('ipfs_accelerate_py', 'agent_supervisor.prompt_steering.request', {
        prompt,
        target_type: targetType,
        target_id: targetId,
        normalized_target: normalizedTarget,
        client_request_id: payload.client_request_id || null,
        correlation_id: invocation.correlation_id || null,
      });
    } catch (error) {
      return unavailableGatewayResult(invocation, 'server_unavailable', messageFor(error));
    }
    if (!outcome || outcome.ok !== true) {
      return unavailableGatewayResult(invocation, 'server_unavailable', outcome?.error || 'The ipfs_accelerate_py supervisor session did not accept the steering request.');
    }
    const observation = outcome.result || {};
    const values = observation.values || {};
    const steeringCid = String(values.steering_prompt_cid || '');
    const receipt = {
      receipt_id: `rcpt-steer-${steeringCid || observation.run_id || payload.client_request_id || 'unknown'}`,
      cid: steeringCid || null,
      owner: 'ipfs_accelerate_py',
      action: 'agent_supervisor.prompt_steering.request',
      target: normalizedTarget,
      run_id: observation.run_id || null,
      created_at: new Date().toISOString(),
    };
    return {
      state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
      correlation_id: invocation.correlation_id, observed_at: new Date().toISOString(),
      data: {
        request_id: payload.client_request_id || receipt.receipt_id,
        correlation_id: invocation.correlation_id || null,
        accepted: true,
        dry_run: false,
        normalized_target: normalizedTarget,
        policy_class: invocation.policy_class || 'confirm',
        affected_task_ids: targetType === 'task' && targetId ? [targetId] : [],
        planned_mcp_action: null,
        policy_effects: null,
        receipt,
        event_dag: steeringCid ? {
          event_id: `evt-steer-${steeringCid}`,
          cid: steeringCid,
          receipt_cid: steeringCid,
          owner: 'ipfs_accelerate_py',
          event_type: 'prompt-steering-confirmed',
          created_at: receipt.created_at,
        } : null,
        supervisor_observation: observation,
        post_status: outcome.post_status || null,
      },
      receipt,
    };
  }

  async request(url, options = {}) {
    if (!this.fetch) throw new Error('Browser fetch is unavailable.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Timed out after ${this.timeoutMs}ms.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getMCPPlusPlusDesktopClient(options = {}) {
  if (!globalThis.window) return new MCPPlusPlusDesktopClient(options);
  if (!window.__swissknifeMCPPlusPlusDesktopClient) {
    window.__swissknifeMCPPlusPlusDesktopClient = new MCPPlusPlusDesktopClient(options);
  }
  return window.__swissknifeMCPPlusPlusDesktopClient;
}

export function installMCPPlusPlusSupervisorGateway(client = getMCPPlusPlusDesktopClient()) {
  if (!globalThis.window) return client.createSupervisorGateway();
  if (!window.swissknifeMCPPlusPlusSupervisorGateway) {
    window.swissknifeMCPPlusPlusSupervisorGateway = client.createSupervisorGateway();
  }
  return window.swissknifeMCPPlusPlusSupervisorGateway;
}

function extractProfiles(initialization) {
  const profiles = initialization?.capabilities?.mcpPlusPlusProfiles;
  if (Array.isArray(profiles)) return profiles.filter(profile => typeof profile === 'string');
  const experimental = initialization?.capabilities?.experimental || {};
  return Object.entries(experimental)
    .filter(([key, enabled]) => key.startsWith('mcp++/') && (enabled === true || (enabled && typeof enabled === 'object')))
    .map(([key]) => key);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

function randomNonce() {
  const bytes = new Uint8Array(24);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function unavailableGatewayResult(invocation, reason, message) {
  return {
    state: 'unavailable',
    capability_id: invocation?.capability_id || 'supervisor.health.read',
    owner: invocation?.owner || 'ipfs_accelerate_py',
    reason,
    message,
    correlation_id: invocation?.correlation_id,
  };
}

// Governed supervisor writes (receipt persist, event-DAG checkpoint) follow
// the Profile G write contract shape: an explicit reviewed confirmation is
// required. The console collects it as a confirmation_token in the payload
// after its own confirm control; without it the gateway denies, exactly as
// invokeProfileGSupervisorWrite denies unconfirmed mutations.
function supervisorGovernedWriteDenial(invocation) {
  if (invocation?.access === 'governed-write' && String(invocation?.payload?.confirmation_token || '').trim()) return null;
  return {
    ...unavailableGatewayResult(invocation, 'confirmation_required', 'Governed supervisor writes require an explicit reviewed confirmation.'),
    state: 'denied',
    policy_class: invocation?.policy_class || 'confirm',
    required_confirmation: true,
  };
}

function normalizeDagEventLogEntry(event) {
  const eventType = String(event?.event_type || 'execution');
  const declaredLevel = String(event?.level || '');
  const level = ['error', 'warn', 'info'].includes(declaredLevel)
    ? declaredLevel
    : /error|fail/i.test(eventType) ? 'error' : /warn/i.test(eventType) ? 'warn' : 'info';
  return {
    log_id: event?.event_cid || event?.cid || '',
    level,
    message: typeof event?.message === 'string' && event.message
      ? event.message
      : typeof event?.summary === 'string' && event.summary
        ? event.summary
        : `${eventType} event recorded in the mediated ipfs_accelerate_py event DAG.`,
    created_at: event?.timestamp || event?.created_at || null,
    scope: typeof event?.scope === 'string' && event.scope ? event.scope : 'supervisor',
    target_id: event?.target_id || event?.task_cid || event?.goal_cid || '',
    redacted: event?.redacted === true,
  };
}

// Mirrors scripts/mcpplusplus-profile-a.cjs isContentCid (the artifact
// store's own acceptance rule for artifact CIDs).
function isContentCid(value) {
  return typeof value === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})$/.test(value);
}

// Mirrors scripts/mcpplusplus-profile-a.cjs stableStringify so the receipt
// bytes persisted here are canonical.
function stableStringifyValue(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringifyValue).join(',')}]`;
  return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableStringifyValue(value[key])}`).join(',')}}`;
}

// CIDv1 raw + sha2-256, base32-lower — mirrors cidForBytes in
// scripts/mcpplusplus-profile-a.cjs, which the kit artifact store verifies
// byte-for-byte on POST /mcp/artifacts/put.
async function contentCidForBytes(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  const cidBytes = new Uint8Array(4 + digest.length);
  cidBytes.set([0x01, 0x55, 0x12, 0x20], 0);
  cidBytes.set(digest, 4);
  return `b${base32Lower(cidBytes)}`;
}

function base32Lower(bytes) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let result = '';
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(accumulator >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

function base64ForBytes(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const PROFILE_G_GATEWAY_READS = Object.freeze({
  'supervisor.goals.read': 'mcp++/goals/list',
  'supervisor.subgoals.read': 'mcp++/goals/list',
  'supervisor.queue.read': 'mcp++/tasks/list',
  'supervisor.profile-g.read': 'mcp++/risk/profile',
  'supervisor.frontier.read': 'mcp++/schedule/frontier',
  'supervisor.neighborhood.read': 'mcp++/neighborhood/query',
  'supervisor.claims.read': 'mcp++/tasks/list',
  'supervisor.risk.read': 'mcp++/tasks/list',
  'supervisor.receipts.read': 'mcp++/tasks/list',
});

const PROFILE_G_GATEWAY_WRITES = Object.freeze({
  'supervisor.goal-plan.select': 'mcp++/goals/select',
  'supervisor.schedule.claim': 'mcp++/schedule/claim',
  'supervisor.schedule.renew': 'mcp++/schedule/renew',
  'supervisor.schedule.release': 'mcp++/schedule/release',
  'supervisor.schedule.resolve': 'mcp++/schedule/resolve',
  'supervisor.schedule.reconcile': 'mcp++/schedule/reconcile',
});

function normalizeProfileGGatewayData(capabilityId, responses) {
  const values = responses.map(response => response.value);
  if (capabilityId === 'supervisor.profile-g.read') return values.map((value, index) => ({ ...value, peer: responses[index].service }));
  const items = values.flatMap(value => asArray(value?.items || value?.goals || value?.tasks || value?.records || value?.frontier || value?.subgoals));
  const artifacts = items.map(item => ({ ...(item?.artifact || item), artifact_cid: item?.artifact_cid || item?.cid, peer: item?.peer || item?.provider }));
  if (capabilityId === 'supervisor.goals.read') return artifacts.filter(item => item.schema?.includes('/goal@')).map(item => ({ goal_id: item.artifact_cid, title: item.label || item.objective_cid || 'CID-addressed goal', status: item.status || 'ready', subgoal_ids: item.subgoal_cids || [], task_ids: item.task_cids || [], owner_did: item.owner_did, peer: item.peer, cid: item.artifact_cid }));
  if (capabilityId === 'supervisor.subgoals.read') {
    const graphItems = [...artifacts, ...values.flatMap(value => asArray(value?.subgoals || value?.graph?.subgoals))];
    return graphItems.flatMap(item => item.schema?.includes('/subgoal@') ? [item] : asArray(item.subgoals)).map(item => ({ subgoal_id: item.artifact_cid || item.subgoal_cid || item.cid, goal_id: item.goal_cid, title: item.objective_cid || 'CID-addressed subgoal', status: item.status || (item.selection_cid ? 'ready' : 'blocked'), task_ids: item.task_cids || [], selection_cid: item.selection_cid, plan_branches: item.plan_branches || [] }));
  }
  if (capabilityId === 'supervisor.queue.read') return artifacts.map(item => ({ task_id: item.artifact_cid, title: item.tool || 'CID-addressed task', status: item.status || 'ready', goal_id: item.goal_cid, subgoal_id: item.subgoal_cid, dependencies: item.dependency_task_cids || [], interface_cid: item.interface_cid, plan_branch_cid: item.plan_branch_cid, selection_cid: item.selection_cid, peer: item.peer, cid: item.artifact_cid }));
  if (capabilityId === 'supervisor.claims.read') return artifacts.flatMap(item => [...asArray(item.claims), ...(item.current_claim ? [item.current_claim] : []), ...(item.claim ? [item.claim] : [])]).map(item => ({ ...(item.artifact || item), claim_cid: item.claim_cid || item.artifact_cid || item.cid }));
  if (capabilityId === 'supervisor.risk.read') return artifacts.map(item => ({ ...item, assessment_cid: item.assessment_cid || item.artifact_cid }));
  if (capabilityId === 'supervisor.receipts.read') {
    const refs = artifacts.flatMap(item => [item.receipt, ...asArray(item.receipts), ...asArray(item.claims).map(claim => claim.receipt)].filter(Boolean));
    return refs.map(item => ({ receipt_id: item.receipt_id || item.receipt_cid || item.cid, cid: item.cid || item.receipt_cid, owner: 'ipfs_kit_py', created_at: item.created_at }));
  }
  return artifacts;
}

function validateMutationContext(request) {
  if (!request || typeof request !== 'object') throw new Error('Profile G mutation payload is required.');
  for (const key of ['idempotency_key', 'correlation_id', 'proof_cid', 'policy_decision_cid']) if (!String(request[key] || '').trim()) throw new Error(`Profile G mutation requires ${key}.`);
  if (!Array.isArray(request.parents)) throw new Error('Profile G mutation requires a parents CID array.');
}

function required(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`Enter a ${label}.`);
  return result;
}

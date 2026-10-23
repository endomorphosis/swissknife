import {
  MCP_PLUS_PLUS_DESKTOP_SERVICES,
  getMCPPlusPlusDesktopClient,
  installMCPPlusPlusSupervisorGateway,
  contentCidForBytes,
  stableStringifyValue,
  base64ForBytes,
} from '../core/mcp-plus-plus-desktop-client.js';
import { invokeNetworkNativeTool, networkNativeAttributes } from './network-native-tools.js';

const TABS = ['overview', 'tools', 'protocol', 'diagnostics', 'events', 'policy', 'artifacts'];

const DESKTOP_IDL_METHODS = Object.freeze([
  'read_status',
  'read_receipts',
  'request_action',
  'request_fallback',
]);

function idlMethodsForSurface(surfaceId) {
  if (surfaceId === 'agent-supervisor') {
    return Object.freeze([...DESKTOP_IDL_METHODS, 'request_prompt_steering']);
  }
  return DESKTOP_IDL_METHODS;
}

const PROTOCOL_OPERATIONS = Object.freeze([
  { profile: 'A', method: 'interfaces/list', description: 'List CID-addressed MCP-IDL interfaces.', params: {} },
  { profile: 'A', method: 'interfaces/get', description: 'Read one canonical interface descriptor.', params: { interface_cid: '' } },
  { profile: 'A', method: 'interfaces/compat', description: 'Check compatibility with an interface CID.', params: { interface_cid: '' } },
  { profile: 'A', method: 'interfaces/select', description: 'Select interfaces for a CID-addressed task hint.', params: { task_hint_cid: '', budget: {} } },
  { profile: 'B', method: 'mcp++/execute', description: 'Execute a tool through a CID-native envelope.', params: { interface_cid: '', tool: '', arguments: {}, parents: [] } },
  { profile: 'C', method: 'mcp++/ucan/identity', description: 'Request a UCAN-bound peer identity response.', params: { audience: '', nonce: '' } },
  { profile: 'C', method: 'mcp++/ucan/delegate', description: 'Create an attenuated UCAN delegation.', params: { audience: '', capabilities: [], lifetime_seconds: 60 } },
  { profile: 'C', method: 'mcp++/ucan/validate', description: 'Validate a UCAN proof bundle for a requested capability.', params: { proof_cid: '', ucan: '', required_capability: { resource: '', ability: 'mcp++/invoke' } } },
  { profile: 'C', method: 'mcp++/ucan/revoke', description: 'Revoke a locally-issued delegation proof.', params: { proof_cid: '' } },
  { profile: 'D', method: 'mcp++/policy/evaluate', description: 'Evaluate a temporal deontic execution policy.', params: { actor: '', action: 'tools.call', policy: { clauses: [] } } },
  { profile: 'E', method: 'mcp++/p2p/peers', description: 'Discover advertised MCP+p2p peers.', params: {} },
  { profile: 'F', method: 'mcp++/dag/frontier', description: 'Read the bounded Event DAG frontier.', params: {} },
  { profile: 'F', method: 'mcp++/dag/history', description: 'Read bounded Event DAG history.', params: { limit: 50 } },
  { profile: 'F', method: 'mcp++/dag/provenance', description: 'Trace bounded provenance for an event CID.', params: { event_cid: '', limit: 100 } },
  { profile: 'F', method: 'mcp++/dag/append', description: 'Append an explicit Event DAG event.', params: { event: { event_type: 'invocation', parents: [], payload: {} } } },
  { profile: 'F', method: 'mcp++/dag/compact', description: 'Archive eligible hot events and return a compaction certificate.', params: { max_events: 100, retain_recent: 1000 } },
  { profile: 'F', method: 'mcp++/dag/archive', description: 'Alias for durable Event DAG archival and compaction.', params: { max_events: 100, retain_recent: 1000 } },
  { profile: 'F', method: 'mcp++/dag/archives', description: 'List durable Event DAG archives.', params: {} },
  { profile: 'F', method: 'mcp++/dag/certificate/get', description: 'Read a compaction certificate by CID.', params: { certificate_cid: '' } },
  { profile: 'F', method: 'mcp++/dag/certificate/verify', description: 'Verify archive integrity for a certificate CID.', params: { certificate_cid: '' } },
  { profile: 'F', method: 'mcp++/dag/inclusion', description: 'Request an archived event inclusion proof.', params: { event_cid: '' } },
  { profile: 'G', method: 'mcp++/risk/profile', description: 'Read negotiated risk models, lease clock, bounds, and transports.', params: {} },
  { profile: 'G', method: 'mcp++/goals/list', description: 'Read the bounded multi-peer goal graph.', params: { limit: 100 } },
  { profile: 'G', method: 'mcp++/goals/get', description: 'Read one immutable goal by CID.', params: { goal_cid: '' } },
  { profile: 'G', method: 'mcp++/goals/create', description: 'Create a governed CID-native goal.', params: { artifact: {}, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/goals/decompose', description: 'Publish operator-reviewable subgoals and plan branches.', params: { goal_cid: '', artifacts: [], caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/goals/select', description: 'Select one plan branch through Profile C/D authority.', params: { artifact: {}, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/tasks/list', description: 'Read immutable task specifications.', params: { limit: 100 } },
  { profile: 'G', method: 'mcp++/tasks/ready', description: 'Read the bounded ready task set.', params: { limit: 100 } },
  { profile: 'G', method: 'mcp++/tasks/get', description: 'Read one task by CID.', params: { task_cid: '' } },
  { profile: 'G', method: 'mcp++/tasks/create', description: 'Create a task from an authorized selected branch.', params: { artifact: {}, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/risk/assess', description: 'Persist a reproducible risk assessment.', params: { artifact: {}, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/risk/evidence', description: 'Read bounded redacted risk evidence.', params: { subject_cid: '', limit: 100 } },
  { profile: 'G', method: 'mcp++/risk/history', description: 'Read bounded risk explanation history.', params: { subject_cid: '', limit: 100 } },
  { profile: 'G', method: 'mcp++/neighborhood/query', description: 'Read signed, policy-filtered peer capacity records.', params: { limit: 64 } },
  { profile: 'G', method: 'mcp++/neighborhood/attest', description: 'Publish a governed neighborhood attestation.', params: { caller_did: '', proposal_cid: '', record_cid: '', verdict: 'support', reason_code: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/frontier', description: 'Read the deterministic distributed scheduling frontier.', params: { limit: 100 } },
  { profile: 'G', method: 'mcp++/schedule/status', description: 'Read claims, lease, risk, and receipts for a task.', params: { task_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/propose', description: 'Publish a governed schedule proposal.', params: { artifact: {}, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/claim', description: 'Claim a task with a bounded lease and fencing token.', params: { task_cid: '', requested_lease_ms: 30000, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/renew', description: 'Renew a current lease using its fencing token.', params: { claim_cid: '', fencing_token: 0, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/release', description: 'Explicitly release a current task lease.', params: { claim_cid: '', fencing_token: 0, caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/resolve', description: 'Resolve competing claims deterministically.', params: { claim_cids: [], caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
  { profile: 'G', method: 'mcp++/schedule/reconcile', description: 'Reconcile durable lease state after recovery.', params: { task_cids: [], caller_did: '', idempotency_key: '', correlation_id: '', parents: [], proof_cid: '', policy_decision_cid: '' } },
]);

export class MCPPlusPlusExplorerApp {
  constructor(desktop = null, options = {}) {
    this.desktop = desktop;
    this.client = options.client || getMCPPlusPlusDesktopClient();
    this.services = this.client.listServices();
    this.state = {
      activeTab: 'overview',
      selectedService: this.services[0]?.id || '',
      idlSurface: 'desktop',
      snapshots: new Map(),
      status: 'idle',
      message: 'Refresh to inspect the configured MCP++ services.',
      selectedTool: '',
      toolSearch: '',
      selectedProtocolMethod: PROTOCOL_OPERATIONS[0].method,
      protocolResult: null,
      result: null,
      resultSource: null,
      eventHistory: [],
      artifact: null,
      policy: null,
      identity: null,
      // Live VDA-G053 diagnostic workflow state. Every card below starts
      // empty and is filled only by real adapter calls; nothing here is
      // prefabricated.
      diag: {
        peers: null,
        transport: null,
        did: null,
        policy: null,
        scheduling: null,
        eventDag: null,
        profileFailure: null,
        evidence: null,
        evidenceCid: null,
        log: [],
        pendingConfirm: null,
      },
    };
    this.container = null;
  }

  async initialize() {
    installMCPPlusPlusSupervisorGateway(this.client);
    return true;
  }

  async render() {
    return this.renderShell();
  }

  bind(container) {
    this.container = container;
    this.bindEvents();
    void this.refreshAll();
  }

  async refreshAll() {
    this.state.status = 'loading';
    this.state.message = 'Inspecting configured MCP++ services...';
    this.update();
    const snapshots = await this.client.inspectAll();
    this.state.snapshots = new Map(snapshots.map(snapshot => [snapshot.service, snapshot]));
    const available = snapshots.filter(snapshot => snapshot.available).length;
    this.state.status = available === snapshots.length ? 'ready' : available > 0 ? 'degraded' : 'unavailable';
    this.state.message = `${available}/${snapshots.length} MCP++ services responded.`;
    this.ensureSelectedTool();
    this.update();
  }

  selectedSnapshot() {
    return this.state.snapshots.get(this.state.selectedService) || null;
  }

  selectedTools() {
    const tools = this.selectedSnapshot()?.tools || [];
    const needle = this.state.toolSearch.trim().toLowerCase();
    return needle
      ? tools.filter(tool => `${tool.name || ''} ${tool.description || ''}`.toLowerCase().includes(needle))
      : tools;
  }

  ensureSelectedTool() {
    const tools = this.selectedTools();
    if (!tools.some(tool => tool.name === this.state.selectedTool)) {
      this.state.selectedTool = tools[0]?.name || '';
    }
  }

  update() {
    if (!this.container) return;
    this.container.innerHTML = this.renderShell();
    this.bindEvents();
  }

  renderShell() {
    return `
      <section class="mcp-plus-plus-explorer" data-testid="mcp-plus-plus-explorer">
        ${this.renderStyles()}
        <header class="mcppp-header">
          <div>
            <h2>MCP++ Explorer</h2>
            <p>Live protocol state and explicit tool exchange across the configured IPFS services.</p>
          </div>
          <div class="mcppp-header-actions">
            <span class="mcppp-state is-${escapeHtml(this.state.status)}">${escapeHtml(this.state.status)}</span>
            <button type="button" class="mcppp-icon-button" data-action="refresh" title="Refresh all MCP++ services" aria-label="Refresh all MCP++ services">Refresh</button>
          </div>
        </header>
        <div class="mcppp-message" role="status">${escapeHtml(this.state.message)}</div>
        <nav class="mcppp-tabs" aria-label="MCP++ views">
          ${TABS.map(tab => `<button type="button" class="mcppp-tab ${this.state.activeTab === tab ? 'is-active' : ''}" data-tab="${tab}">${tabLabel(tab)}</button>`).join('')}
        </nav>
        <div class="mcppp-body">
          ${this.renderActiveTab()}
        </div>
      </section>
    `;
  }

  renderActiveTab() {
    switch (this.state.activeTab) {
      case 'tools': return this.renderTools();
      case 'protocol': return this.renderProtocol();
      case 'diagnostics': return this.renderDiagnostics();
      case 'events': return this.renderEvents();
      case 'policy': return this.renderPolicy();
      case 'artifacts': return this.renderArtifacts();
      default: return this.renderOverview();
    }
  }

  renderOverview() {
    const snapshots = this.services.map(service => this.state.snapshots.get(service.id));
    return `
      <div class="mcppp-summary-grid">
        ${this.services.map((service, index) => this.renderServiceSummary(service, snapshots[index])).join('')}
      </div>
      <section class="mcppp-section">
        <div class="mcppp-section-heading"><h3>Protocol Coverage</h3><span>${totalTools(snapshots)} discovered tools</span></div>
        <div class="mcppp-coverage-row">
          <span>Interfaces, peer identity, policies, Event DAGs, artifacts, and Helia status are queried from each selected service.</span>
          <button type="button" data-action="open-diagnostics">Inspect diagnostics</button>
        </div>
      </section>
      ${this.renderIdlMethods()}
      ${this.renderVdaG053Workflow()}
    `;
  }

  renderIdlMethods() {
    const surface = this.state.idlSurface === 'agent-supervisor' ? 'agent-supervisor' : 'desktop';
    const methods = idlMethodsForSurface(surface);
    return `
      <section class="mcppp-section" aria-label="IDL methods">
        <div class="mcppp-section-heading"><h3>IDL methods</h3><span>${escapeHtml(surface)}</span></div>
        <label for="mcppp-idl-surface">Surface</label>
        <select id="mcppp-idl-surface">
          <option value="desktop" ${surface === 'desktop' ? 'selected' : ''}>Desktop</option>
          <option value="agent-supervisor" ${surface === 'agent-supervisor' ? 'selected' : ''}>agent-supervisor</option>
        </select>
        <ul class="mcppp-idl-methods">
          ${methods.map(method => `<li data-idl-method="${escapeAttribute(method)}"><code>${escapeHtml(method)}</code></li>`).join('')}
        </ul>
      </section>
    `;
  }

  // VDA-G053 diagnostics, live: every card below is populated by a real
  // adapter call against the selected service. Nothing is prefabricated;
  // cards read "not run yet" until their action executes.
  renderVdaG053Workflow() {
    const diag = this.state.diag;
    const card = (marker, title, body, action, actionLabel) => `
      <article data-svd-vda-marker="${marker}">
        <h4>${escapeHtml(title)}</h4>
        ${body}
        <div class="mcppp-actions mcppp-actions-spaced">
          <button type="button" ${action === 'open-evidence-drilldown' ? networkNativeAttributes('mcp-plus-plus', 'mcp++:ipfs_kit_py/artifacts/put') : ''} data-svd-workflow-action="${action}" data-action="${action}">${escapeHtml(actionLabel)}</button>
        </div>
      </article>`;
    const resultBlock = value => value === null || value === undefined
      ? '<p class="mcppp-note sk-honest-note">Not run yet — use the action below.</p>'
      : `<pre>${escapeHtml(prettyJson(value))}</pre>`;
    return `
      <section class="mcppp-section mcppp-vda-g053"
        data-svd-workflow="mcp-plus-plus.diagnose-profiles-peers-event-dag"
        data-mcppp-correlation-id="corr:mcp-plus-plus:g053:diagnostic-workflow"
        aria-label="VDA-G053 MCP++ diagnostic workflow">
        <div class="mcppp-section-heading">
          <h3>VDA-G053 Diagnostics</h3>
          <span>live peer, Event DAG, policy, scheduling, transports</span>
        </div>
        <p class="mcppp-note">Each action below executes a real MCP++ call against the selected service (<strong>${escapeHtml(this.state.selectedService || 'none')}</strong>) and shows the verbatim result. Failures are reported with the adapter's own error; nothing is simulated.</p>
        ${diag.pendingConfirm ? this.renderDiagConfirmCard() : ''}
        <div class="mcppp-vda-grid">
          ${card('peer-diagnostics', 'Peer Diagnostics',
            `<p>Live <code>mcp++/p2p/peers</code> discovery on the selected service.</p>${resultBlock(diag.peers)}`,
            'inspect-peer-diagnostics', 'Inspect Peers')}
          ${card('event-dag-diagnostics', 'Event DAG',
            `<p>Live <code>mcp++/dag/history</code> (limit 50); frontier and archives come from the inspected snapshot.</p>${resultBlock(diag.eventDag)}`,
            'load-event-dag', 'Load Event DAG')}
          ${card('policy-diagnostics', 'Policy Diagnostics',
            `<p>Live <code>mcp++/policy/evaluate</code> for <code>tools.call</code> by <code>did:key:swissknife-desktop</code>.</p>${resultBlock(diag.policy)}`,
            'evaluate-policy-diagnostics', 'Evaluate Policy')}
          ${card('scheduling-diagnostics', 'Scheduling Diagnostics',
            `<p>Live <code>mcp++/schedule/frontier</code> (limit 100).</p>${resultBlock(diag.scheduling)}`,
            'evaluate-scheduling-frontier', 'Scheduling')}
          ${card('http-libp2p-distinction', 'HTTP and libp2p',
            `<p>Transport facts from the live service inspection; HTTP JSON-RPC uses /mcp, libp2p uses /mcp+p2p/1.0.0.</p>${resultBlock(diag.transport)}`,
            'compare-http-libp2p', 'Compare Transports')}
          ${card('did-identity', 'DID Identity',
            `<p>Live <code>mcp++/ucan/identity</code> challenge response.</p>${resultBlock(diag.did)}`,
            'verify-did-identity', 'Verify DID')}
          ${card('profile-failure', 'Profile Failure',
            `<p>Fail-closed check: profiles the selected service did <em>not</em> negotiate are genuinely unavailable — calls to them are denied, not simulated.</p>${resultBlock(diag.profileFailure)}`,
            'diagnose-profile-failure', 'Profile Failure')}
          ${card('evidence-drill-down', 'Evidence Drill-Down',
            `<p>Bundles every live diagnostic result above and persists it to the kit artifact store behind your confirmation.</p>${diag.evidenceCid ? `<p>Evidence CID <code class="sk-code">${escapeHtml(diag.evidenceCid)}</code></p>${resultBlock(diag.evidence)}` : '<p class="mcppp-note sk-honest-note">No evidence bundle persisted yet.</p>'}`,
            'open-evidence-drilldown', 'Open Evidence')}
        </div>
        <ol class="mcppp-vda-log" aria-live="polite">
          ${diag.log.length ? diag.log.map(entry => `<li>${escapeHtml(entry)}</li>`).join('') : '<li>No diagnostic actions have run yet in this session.</li>'}
        </ol>
      </section>
    `;
  }

  renderDiagConfirmCard() {
    const pending = this.state.diag.pendingConfirm;
    if (!pending) return '';
    return `
      <section class="mcppp-section" aria-label="Confirm evidence persist">
        <div class="mcppp-section-heading"><h3>Confirm evidence persist</h3></div>
        <p class="mcppp-note">Review the evidence bundle (${pending.bytes} bytes, expected CID ${escapeHtml(pending.expectedCid)}). The owner verifies these exact bytes. A validated preview creates no stored artifact.</p>
        <div class="mcppp-actions">
          <button type="button" data-action="confirm-evidence-persist">Confirm persist</button>
          <button type="button" data-action="cancel-evidence-persist">Cancel</button>
        </div>
      </section>
    `;
  }

  diagLog(entry) {
    this.state.diag.log = [...this.state.diag.log, `${new Date().toISOString()} ${entry}`].slice(-12);
  }

  diagServiceId() {
    return this.state.selectedService;
  }

  async inspectPeerDiagnostics() {
    const serviceId = this.diagServiceId();
    try {
      const result = await this.client.discoverPeers(serviceId);
      const peers = Array.isArray(result?.peers) ? result.peers : [];
      this.state.diag.peers = { service: serviceId, count: peers.length, peers };
      this.state.message = `Peer diagnostics: ${peers.length} peer(s) discovered on ${serviceId}.`;
      this.diagLog(`peer-diagnostics: ${peers.length} peer(s) via mcp++/p2p/peers on ${serviceId}`);
    } catch (error) {
      this.state.diag.peers = { service: serviceId, error: messageFor(error) };
      this.state.message = `Peer diagnostics failed: ${messageFor(error)}`;
      this.diagLog(`peer-diagnostics failed on ${serviceId}: ${messageFor(error)}`);
    }
    this.update();
  }

  async compareTransports() {
    const serviceId = this.diagServiceId();
    const snapshot = this.selectedSnapshot();
    if (!snapshot) {
      this.state.message = 'Refresh the service inspection first.';
      this.update();
      return;
    }
    const service = this.client.getService(serviceId);
    this.state.diag.transport = {
      service: serviceId,
      http: { base_url: service.baseUrl, mcp_path: service.mcpPath, endpoint: `${service.baseUrl}${service.mcpPath}` },
      libp2p: {
        protocol: '/mcp+p2p/1.0.0',
        helia: snapshot.helia || null,
        discovered_peers: (snapshot.peers || []).length,
      },
      eventDag: { frontier: snapshot.frontier || [], archives: snapshot.archives || [] },
      inspected_at: snapshot.inspectedAt,
    };
    this.state.message = 'Transport comparison built from the live service inspection.';
    this.diagLog(`compare-transports: http ${service.baseUrl}${service.mcpPath}, helia ${snapshot.helia ? 'reported' : 'not reported'} on ${serviceId}`);
    this.update();
  }

  async verifyDidWorkflow() {
    const serviceId = this.diagServiceId();
    try {
      const peers = this.state.diag.peers?.peers?.length
        ? this.state.diag.peers.peers
        : (this.selectedSnapshot()?.peers || []);
      const audience = peers[0]?.peer_id || peers[0]?.id || peers[0]?.did || '';
      const response = await this.client.identifyPeer(serviceId, audience);
      this.state.diag.did = { service: serviceId, audience: audience || '(none supplied)', response };
      this.state.message = 'DID identity challenge response received.';
      this.diagLog(`verify-did-identity: challenge response received on ${serviceId}`);
    } catch (error) {
      this.state.diag.did = { service: serviceId, error: messageFor(error) };
      this.state.message = `DID verification failed: ${messageFor(error)}`;
      this.diagLog(`verify-did-identity failed on ${serviceId}: ${messageFor(error)}`);
    }
    this.update();
  }

  async evaluatePolicyDiagnostics() {
    const serviceId = this.diagServiceId();
    try {
      const request = {
        actor: 'did:key:swissknife-desktop',
        action: 'tools.call',
        evaluated_at: new Date().toISOString(),
        policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:swissknife-desktop', action: 'tools.call' }] },
      };
      const decision = await this.client.evaluatePolicy(serviceId, request);
      this.state.diag.policy = { service: serviceId, request, decision };
      this.state.message = 'Policy diagnostics evaluation completed.';
      this.diagLog(`evaluate-policy-diagnostics: decision received on ${serviceId}`);
    } catch (error) {
      this.state.diag.policy = { service: serviceId, error: messageFor(error) };
      this.state.message = `Policy diagnostics failed: ${messageFor(error)}`;
      this.diagLog(`evaluate-policy-diagnostics failed on ${serviceId}: ${messageFor(error)}`);
    }
    this.update();
  }

  async evaluateSchedulingFrontier() {
    const serviceId = this.diagServiceId();
    try {
      const frontier = await this.client.rpc(serviceId, 'mcp++/schedule/frontier', { limit: 100 });
      this.state.diag.scheduling = { service: serviceId, frontier };
      this.state.message = 'Scheduling frontier received.';
      this.diagLog(`evaluate-scheduling-frontier: frontier received on ${serviceId}`);
    } catch (error) {
      this.state.diag.scheduling = { service: serviceId, error: messageFor(error) };
      this.state.message = `Scheduling frontier failed: ${messageFor(error)}`;
      this.diagLog(`evaluate-scheduling-frontier failed on ${serviceId}: ${messageFor(error)}`);
    }
    this.update();
  }

  async loadEventDag() {
    const serviceId = this.diagServiceId();
    try {
      const history = await this.client.getDagHistory(serviceId, 50);
      const events = Array.isArray(history?.events) ? history.events : [];
      this.state.diag.eventDag = { service: serviceId, count: events.length, events };
      this.state.message = `Event DAG: ${events.length} live entr(ies) loaded from ${serviceId}.`;
      this.diagLog(`load-event-dag: ${events.length} event(s) via mcp++/dag/history on ${serviceId}`);
    } catch (error) {
      this.state.diag.eventDag = { service: serviceId, error: messageFor(error) };
      this.state.message = `Event DAG load failed: ${messageFor(error)}`;
      this.diagLog(`load-event-dag failed on ${serviceId}: ${messageFor(error)}`);
    }
    this.update();
  }

  // Genuine fail-closed diagnostic: profiles the service did not negotiate  // are reported as unavailable from the real inspection snapshot. No
  // failure is invented for profiles that are present.
  diagnoseProfileFailure() {
    const serviceId = this.diagServiceId();
    const snapshot = this.selectedSnapshot();
    if (!snapshot) {
      this.state.message = 'Refresh the service inspection first.';
      this.update();
      return;
    }
    const expectedProfiles = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const negotiated = snapshot.profiles || [];
    const missing = expectedProfiles.filter(profile => !negotiated.includes(profile));
    this.state.diag.profileFailure = {
      service: serviceId,
      negotiated_profiles: negotiated,
      unavailable_profiles: missing,
      fail_closed: missing.map(profile => ({
        profile,
        disposition: 'profile_unavailable',
        note: `Profile ${profile} was not negotiated by ${serviceId}; calls requiring it are denied by the gateway. No mutation occurs.`,
      })),
      inspection_errors: snapshot.errors || {},
      inspected_at: snapshot.inspectedAt,
    };
    this.state.message = missing.length
      ? `${missing.length} profile(s) genuinely unavailable (fail closed) on ${serviceId}.`
      : `All expected profiles negotiated on ${serviceId}; nothing is failed closed.`;
    this.diagLog(`diagnose-profile-failure: ${missing.length} unavailable profile(s) on ${serviceId}`);
    this.update();
  }

  async requestEvidencePersist() {
    const bundle = {
      schema: 'swissknife.mcp-plus-plus-explorer.evidence.v1',
      service: this.diagServiceId(),
      collected_at: new Date().toISOString(),
      diagnostics: {
        peers: this.state.diag.peers,
        transport: this.state.diag.transport,
        eventDag: this.state.diag.eventDag,
        did: this.state.diag.did,
        policy: this.state.diag.policy,
        scheduling: this.state.diag.scheduling,
        profileFailure: this.state.diag.profileFailure,
      },
      log: this.state.diag.log,
    };
    const bytes = new TextEncoder().encode(stableStringifyValue(bundle));
    const expectedCid = await contentCidForBytes(bytes);
    this.state.diag.pendingConfirm = { bundle, bytes: bytes.length, expectedCid };
    this.state.message = `Evidence bundle ready (CID ${expectedCid}). Confirm to persist it to the kit backend.`;
    this.update();
    await this.confirmEvidencePersist();
  }

  async confirmEvidencePersist() {
    const pending = this.state.diag.pendingConfirm;
    this.state.diag.pendingConfirm = null;
    if (!pending) {
      this.state.message = 'Nothing was pending confirmation.';
      this.update();
      return;
    }
    try {
      const bytes = new TextEncoder().encode(stableStringifyValue(pending.bundle));
      const cid = await contentCidForBytes(bytes);
      const res = await invokeNetworkNativeTool(this.container, 'mcp-plus-plus', 'mcp++:ipfs_kit_py/artifacts/put', {
        cid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'mcppp-explorer-artifact',
        kind: 'diagnostic-evidence',
        service: 'ipfs_kit_py',
        pin: true,
      });
      if (res === null) { this.state.message = 'Evidence persistence cancelled before dispatch.'; this.update(); return; }
      if (res.persisted !== true || res.cid !== cid) {
        throw new Error(res?.error || 'ipfs_kit_py did not verify the persisted evidence artifact.');
      }
      this.state.diag.evidence = pending.bundle;
      this.state.diag.evidenceCid = cid;
      this.state.message = `Evidence bundle persisted to ipfs_kit_py at CID ${cid} (verified: ${res.verified === true}).`;
      this.diagLog(`open-evidence-drilldown: bundle persisted at ${cid}`);
    } catch (error) {
      this.state.message = error.preview ? error.message : `Evidence persist failed: ${messageFor(error)}`;
      this.diagLog(`open-evidence-drilldown ${error.preview ? 'preview' : 'failed'}: ${messageFor(error)}`);
    }
    this.update();
  }

  renderServiceSummary(service, snapshot) {
    const availability = snapshot?.available ? 'available' : snapshot ? 'unavailable' : 'unknown';
    const profiles = snapshot?.profiles?.length ? snapshot.profiles.join(', ') : 'not negotiated';
    return `
      <button type="button" class="mcppp-service-card ${this.state.selectedService === service.id ? 'is-selected' : ''}" data-service="${service.id}" aria-label="${escapeAttribute(service.label)}">
        <span class="mcppp-dot is-${availability}"></span>
        <strong>${escapeHtml(service.label)}</strong>
        <span>${snapshot ? `${snapshot.toolCount} tools` : 'not inspected'}</span>
        <small>${escapeHtml(profiles)}</small>
      </button>
    `;
  }

  renderTools() {
    const snapshot = this.selectedSnapshot();
    const tools = this.selectedTools();
    const selectedTool = tools.find(tool => tool.name === this.state.selectedTool) || null;
    return `
      ${this.renderServiceSelector('tool-service')}
      <div class="mcppp-split">
        <section class="mcppp-section mcppp-tool-list">
          <div class="mcppp-section-heading"><h3>Tools</h3><span>${snapshot?.toolCount ?? 0} discovered</span></div>
          <input id="mcppp-tool-search" type="search" placeholder="Filter tools" value="${escapeAttribute(this.state.toolSearch)}">
          <div class="mcppp-list" role="listbox" aria-label="MCP tools">
            ${tools.slice(0, 300).map(tool => `<button type="button" data-tool="${escapeAttribute(tool.name)}" class="${tool.name === this.state.selectedTool ? 'is-selected' : ''}"><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(tool.description || 'No description')}</span></button>`).join('') || '<div class="mcppp-empty sk-empty">No tools discovered for this service.</div>'}
          </div>
        </section>
        <section class="mcppp-section mcppp-tool-call">
          <div class="mcppp-section-heading"><h3>${escapeHtml(selectedTool?.name || 'Select a tool')}</h3><span>Explicit call</span></div>
          <pre class="mcppp-schema">${escapeHtml(prettyJson(selectedTool?.inputSchema || selectedTool?.input_schema || {}))}</pre>
          <label for="mcppp-tool-args">Arguments</label>
          <textarea id="mcppp-tool-args" spellcheck="false">{}</textarea>
          <div class="mcppp-actions">
            <button type="button" data-action="execute-tool" ${selectedTool ? '' : 'disabled'}>Run tool</button>
            <button type="button" data-action="use-last-result" ${this.state.result ? '' : 'disabled'}>Use last result</button>
          </div>
          ${this.renderResult('Tool result')}
        </section>
      </div>
    `;
  }

  renderProtocol() {
    const operation = PROTOCOL_OPERATIONS.find(candidate => candidate.method === this.state.selectedProtocolMethod)
      || PROTOCOL_OPERATIONS[0];
    return `
      ${this.renderServiceSelector('protocol-service')}
      <section class="mcppp-section">
        <div class="mcppp-section-heading"><h3>Profiles A-F Protocol Request</h3><span>Explicit JSON-RPC only</span></div>
        <label for="mcppp-protocol-method">Method</label>
        <select id="mcppp-protocol-method">
          ${PROTOCOL_OPERATIONS.map(candidate => `<option value="${escapeAttribute(candidate.method)}" ${candidate.method === operation.method ? 'selected' : ''}>Profile ${candidate.profile}: ${escapeHtml(candidate.method)}</option>`).join('')}
        </select>
        <div class="mcppp-note">${escapeHtml(operation.description)}</div>
        <label for="mcppp-protocol-params">Parameters</label>
        <textarea id="mcppp-protocol-params" spellcheck="false">${escapeHtml(prettyJson(operation.params))}</textarea>
        <div class="mcppp-actions"><button type="button" data-action="execute-protocol">Run protocol request</button></div>
        ${this.state.protocolResult ? `<pre class="mcppp-output">${escapeHtml(prettyJson(this.state.protocolResult))}</pre>` : '<div class="mcppp-note sk-honest-note">No protocol request has been sent.</div>'}
      </section>
    `;
  }

  renderDiagnostics() {
    const snapshot = this.selectedSnapshot();
    const helia = snapshot?.helia || {};
    return `
      ${this.renderServiceSelector('diagnostic-service')}
      <div class="mcppp-diagnostic-grid">
        ${diagnosticMetric('Profiles', snapshot?.profiles?.length || 0)}
        ${diagnosticMetric('Interfaces', snapshot?.interfaces?.length || 0)}
        ${diagnosticMetric('Peers', snapshot?.peers?.length || 0)}
        ${diagnosticMetric('DAG frontier', snapshot?.frontier?.length || 0)}
        ${diagnosticMetric('Helia peers', helia.connected_peer_count ?? 0)}
        ${diagnosticMetric('Helia connections', `${helia.connection_count ?? 0}/${helia.connection_limit ?? 0}`)}
      </div>
      <div class="mcppp-split">
        <section class="mcppp-section">
          <div class="mcppp-section-heading"><h3>Protocol report</h3><span>${escapeHtml(snapshot?.inspectedAt || 'not inspected')}</span></div>
          <pre class="mcppp-output">${escapeHtml(prettyJson(snapshot || { status: 'not inspected' }))}</pre>
        </section>
        <section class="mcppp-section">
          <div class="mcppp-section-heading"><h3>UCAN peer identity</h3><span>Challenge response</span></div>
          <label for="mcppp-identity-audience">Audience DID</label>
          <input id="mcppp-identity-audience" placeholder="did:key:z..." value="">
          <button type="button" data-action="identify-peer">Verify peer identity</button>
          ${this.state.identity ? `<pre class="mcppp-output">${escapeHtml(prettyJson(this.state.identity))}</pre>` : '<div class="mcppp-note sk-honest-note">A valid Ed25519 did:key is required. The explorer does not create or store a browser identity.</div>'}
        </section>
      </div>
    `;
  }

  renderEvents() {
    const snapshot = this.selectedSnapshot();
    const history = this.state.eventHistory;
    return `
      ${this.renderServiceSelector('event-service')}
      <section class="mcppp-section">
        <div class="mcppp-section-heading"><h3>Event DAG</h3><span>${snapshot?.frontier?.length || 0} frontier events</span></div>
        <div class="mcppp-actions"><button type="button" data-action="load-events">Load history</button></div>
        <div class="mcppp-event-list">
          ${history.length ? history.map(event => `<article><strong>${escapeHtml(event.event_type || 'event')}</strong><code>${escapeHtml(event.event_cid || 'no-cid')}</code><span>${escapeHtml(String(event.timestamp || 'unknown time'))}</span></article>`).join('') : '<div class="mcppp-empty">Load bounded history from the selected service.</div>'}
        </div>
        <pre class="mcppp-output">${escapeHtml(prettyJson({ frontier: snapshot?.frontier || [], archives: snapshot?.archives || [] }))}</pre>
      </section>
    `;
  }

  renderPolicy() {
    const request = {
      actor: 'did:key:swissknife-desktop',
      action: 'tools.call',
      evaluated_at: new Date().toISOString(),
      request_zkp_certificate: true,
      policy: { clauses: [{ clause_type: 'permission', actor: 'did:key:swissknife-desktop', action: 'tools.call' }] },
    };
    return `
      ${this.renderServiceSelector('policy-service')}
      <section class="mcppp-section">
        <div class="mcppp-section-heading"><h3>Profile D policy evaluation</h3><span>Explicit request</span></div>
        <label for="mcppp-policy-request">Policy request</label>
        <textarea id="mcppp-policy-request" spellcheck="false">${escapeHtml(prettyJson(request))}</textarea>
        <div class="mcppp-actions"><button type="button" data-action="evaluate-policy">Evaluate policy</button></div>
        ${this.state.policy ? `<pre class="mcppp-output">${escapeHtml(prettyJson(this.state.policy))}</pre>` : '<div class="mcppp-note">Policy evaluation returns formal-logic and artifact CIDs. It does not manufacture a zero-knowledge proof.</div>'}
      </section>
    `;
  }

  renderArtifacts() {
    return `
      ${this.renderServiceSelector('artifact-service')}
      <section class="mcppp-section">
        <div class="mcppp-section-heading"><h3>CID artifact exchange</h3><span>Read and verify</span></div>
        <label for="mcppp-artifact-cid">CID</label>
        <input id="mcppp-artifact-cid" placeholder="bafy... or baguq...">
        <div class="mcppp-actions"><button type="button" data-action="read-artifact">Read artifact</button></div>
        ${this.state.artifact ? `<pre class="mcppp-output">${escapeHtml(prettyJson(this.state.artifact))}</pre>` : '<div class="mcppp-note">Paste a CID from a policy decision, envelope, or receipt to read it through the selected MCP++ service.</div>'}
      </section>
    `;
  }

  renderServiceSelector(id) {
    return `<label class="mcppp-service-selector" for="${id}">Service<select id="${id}">${this.services.map(service => `<option value="${service.id}" ${service.id === this.state.selectedService ? 'selected' : ''}>${escapeHtml(service.label)}</option>`).join('')}</select></label>`;
  }

  renderResult(title) {
    if (!this.state.result) return `<div class="mcppp-note">${escapeHtml(title)} will remain available for handoff to another selected service.</div>`;
    return `<div class="mcppp-result-heading"><strong>${escapeHtml(title)}</strong><span>from ${escapeHtml(this.state.resultSource || 'unknown')}</span></div><pre class="mcppp-output">${escapeHtml(prettyJson(this.state.result))}</pre>`;
  }

  bindEvents() {
    if (!this.container) return;
    this.container.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
      this.state.activeTab = button.dataset.tab;
      this.update();
    }));
    this.container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void this.refreshAll());
    this.container.querySelector('[data-action="open-diagnostics"]')?.addEventListener('click', () => {
      this.state.activeTab = 'diagnostics';
      this.update();
    });
    this.container.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => {
      this.state.selectedService = button.dataset.service;
      this.ensureSelectedTool();
      this.update();
    }));
    this.container.querySelector('#mcppp-idl-surface')?.addEventListener('change', event => {
      this.state.idlSurface = event.target.value === 'agent-supervisor' ? 'agent-supervisor' : 'desktop';
      this.update();
    });
    this.container.querySelectorAll('.mcppp-service-selector select').forEach(select => select.addEventListener('change', event => {
      this.state.selectedService = event.target.value;
      this.state.eventHistory = [];
      this.state.identity = null;
      this.ensureSelectedTool();
      this.update();
    }));
    this.container.querySelector('#mcppp-tool-search')?.addEventListener('input', event => {
      this.state.toolSearch = event.target.value;
      this.ensureSelectedTool();
      this.update();
    });
    this.container.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => {
      this.state.selectedTool = button.dataset.tool;
      this.update();
    }));
    this.container.querySelector('[data-action="execute-tool"]')?.addEventListener('click', () => void this.executeTool());
    this.container.querySelector('#mcppp-protocol-method')?.addEventListener('change', event => {
      this.state.selectedProtocolMethod = event.target.value;
      this.state.protocolResult = null;
      this.update();
    });
    this.container.querySelector('[data-action="execute-protocol"]')?.addEventListener('click', () => void this.executeProtocol());
    this.container.querySelector('[data-action="use-last-result"]')?.addEventListener('click', () => {
      const input = this.container.querySelector('#mcppp-tool-args');
      if (input && this.state.result) input.value = prettyJson(this.state.result);
    });
    this.container.querySelector('[data-action="identify-peer"]')?.addEventListener('click', () => void this.identifyPeer());
    this.container.querySelector('[data-action="load-events"]')?.addEventListener('click', () => void this.loadEvents());
    this.container.querySelector('[data-action="evaluate-policy"]')?.addEventListener('click', () => void this.evaluatePolicy());
    this.container.querySelector('[data-action="read-artifact"]')?.addEventListener('click', () => void this.readArtifact());
    // Live VDA-G053 diagnostic workflow actions: each executes a real
    // adapter call and renders the verbatim result in its card.
    this.container.querySelector('[data-action="inspect-peer-diagnostics"]')?.addEventListener('click', () => void this.inspectPeerDiagnostics());
    this.container.querySelector('[data-action="compare-http-libp2p"]')?.addEventListener('click', () => void this.compareTransports());
    this.container.querySelector('[data-action="verify-did-identity"]')?.addEventListener('click', () => void this.verifyDidWorkflow());
    this.container.querySelector('[data-action="evaluate-policy-diagnostics"]')?.addEventListener('click', () => void this.evaluatePolicyDiagnostics());
    this.container.querySelector('[data-action="evaluate-scheduling-frontier"]')?.addEventListener('click', () => void this.evaluateSchedulingFrontier());
    this.container.querySelector('[data-action="load-event-dag"]')?.addEventListener('click', () => void this.loadEventDag());
    this.container.querySelector('[data-action="diagnose-profile-failure"]')?.addEventListener('click', () => this.diagnoseProfileFailure());
    this.container.querySelector('[data-action="open-evidence-drilldown"]')?.addEventListener('click', () => void this.requestEvidencePersist());
    this.container.querySelector('[data-action="confirm-evidence-persist"]')?.addEventListener('click', () => void this.confirmEvidencePersist());
    this.container.querySelector('[data-action="cancel-evidence-persist"]')?.addEventListener('click', () => {
      this.state.diag.pendingConfirm = null;
      this.state.message = 'Evidence persist cancelled; nothing was sent.';
      this.update();
    });
  }

  async executeTool() {
    const input = this.container?.querySelector('#mcppp-tool-args');
    try {
      const args = parseJsonInput(input?.value || '{}', 'Tool arguments');
      this.state.message = `Calling ${this.state.selectedTool} on ${this.state.selectedService}...`;
      this.update();
      this.state.result = await this.client.callTool(this.state.selectedService, this.state.selectedTool, args);
      this.state.resultSource = this.state.selectedService;
      this.state.message = 'Tool call completed. Its result can be handed to another selected service.';
    } catch (error) {
      this.state.message = messageFor(error);
    }
    this.update();
  }

  async executeProtocol() {
    const input = this.container?.querySelector('#mcppp-protocol-params');
    try {
      const params = parseJsonInput(input?.value || '{}', 'Protocol parameters');
      this.state.message = `Calling ${this.state.selectedProtocolMethod} on ${this.state.selectedService}...`;
      this.update();
      this.state.protocolResult = await this.client.rpc(this.state.selectedService, this.state.selectedProtocolMethod, params);
      this.state.result = this.state.protocolResult;
      this.state.resultSource = this.state.selectedService;
      this.state.message = 'Protocol request completed. Its result can be handed to another selected service.';
    } catch (error) {
      this.state.message = messageFor(error);
    }
    this.update();
  }

  async identifyPeer() {
    try {
      const audience = this.container?.querySelector('#mcppp-identity-audience')?.value || '';
      this.state.identity = await this.client.identifyPeer(this.state.selectedService, audience);
      this.state.message = 'Peer identity response received.';
    } catch (error) {
      this.state.message = messageFor(error);
    }
    this.update();
  }

  async loadEvents() {
    try {
      const history = await this.client.getDagHistory(this.state.selectedService, 100);
      this.state.eventHistory = Array.isArray(history?.events) ? history.events : [];
      this.state.message = `Loaded ${this.state.eventHistory.length} Event DAG entries.`;
    } catch (error) {
      this.state.message = messageFor(error);
    }
    this.update();
  }

  async evaluatePolicy() {
    try {
      const request = parseJsonInput(this.container?.querySelector('#mcppp-policy-request')?.value || '{}', 'Policy request');
      this.state.policy = await this.client.evaluatePolicy(this.state.selectedService, request);
      this.state.result = this.state.policy;
      this.state.resultSource = this.state.selectedService;
      this.state.message = 'Policy evaluation completed; returned CIDs are available for artifact exchange.';
    } catch (error) {
      this.state.message = messageFor(error);
    }
    this.update();
  }

  async readArtifact() {
    try {
      const cid = this.container?.querySelector('#mcppp-artifact-cid')?.value?.trim() || '';
      this.state.artifact = await this.client.getArtifact(this.state.selectedService, cid);
      this.state.result = this.state.artifact;
      this.state.resultSource = this.state.selectedService;
      this.state.message = 'Artifact response received.';
    } catch (error) {
      this.state.message = messageFor(error);
    }
    this.update();
  }

  renderStyles() {
    return `<style>
      .mcp-plus-plus-explorer { height: 100%; overflow: auto; background: #101820; color: #e7edf4; font: 13px/1.45 system-ui, sans-serif; padding: 16px; box-sizing: border-box; }
      .mcppp-header, .mcppp-header-actions, .mcppp-section-heading, .mcppp-actions, .mcppp-result-heading { display: flex; align-items: center; gap: 10px; } .mcppp-actions-spaced { margin-top: 8px; }
      .mcppp-header { justify-content: space-between; border-bottom: 1px solid #2b3a49; padding-bottom: 12px; }
      .mcppp-header h2, .mcppp-section h3 { margin: 0; font-size: 16px; } .mcppp-header p { margin: 3px 0 0; color: #aebdcc; }
      .mcppp-state, .mcppp-dot { display: inline-block; border-radius: 50%; } .mcppp-state { border-radius: 3px; padding: 3px 7px; background: #3a4855; text-transform: uppercase; font-size: 11px; } .mcppp-state.is-ready { background: #1f6b52; } .mcppp-state.is-degraded { background: #7a5c22; } .mcppp-state.is-unavailable { background: #7a3030; }
      .mcppp-icon-button, .mcppp-tab, .mcppp-actions button, .mcppp-section button { border: 1px solid #496174; background: #172735; color: #e7edf4; border-radius: 4px; padding: 6px 9px; cursor: pointer; } .mcppp-icon-button:hover, .mcppp-tab:hover, .mcppp-actions button:hover, .mcppp-section button:hover { background: #24445a; } button:disabled { opacity: .5; cursor: not-allowed; }
      .mcppp-message { margin: 12px 0; color: #b9c7d5; } .mcppp-tabs { display: flex; gap: 4px; border-bottom: 1px solid #2b3a49; overflow-x: auto; } .mcppp-tab { border-radius: 4px 4px 0 0; border-bottom: 0; white-space: nowrap; } .mcppp-tab.is-active { background: #2e6b7f; color: #fff; }
      .mcppp-body { padding-top: 14px; } .mcppp-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; } .mcppp-service-card { min-height: 116px; text-align: left; display: grid; gap: 5px; border: 1px solid #32495d; background: #172735; color: inherit; padding: 12px; border-radius: 5px; cursor: pointer; } .mcppp-service-card.is-selected { border-color: #4cc2dd; background: #1a3545; } .mcppp-service-card small { color: #a8b8c8; overflow-wrap: anywhere; } .mcppp-dot { width: 8px; height: 8px; background: #768594; } .mcppp-dot.is-available { background: #47c78e; } .mcppp-dot.is-unavailable { background: #e06a6a; }
      .mcppp-section { border: 1px solid #2d4558; background: #142330; border-radius: 5px; padding: 12px; margin-top: 12px; min-width: 0; } .mcppp-section-heading { justify-content: space-between; margin-bottom: 10px; } .mcppp-section-heading span, .mcppp-note { color: #aab9c7; font-size: 12px; }
      .mcppp-coverage-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; color: #bdc9d3; } .mcppp-split { display: grid; grid-template-columns: minmax(220px, .85fr) minmax(340px, 1.4fr); gap: 12px; } .mcppp-tool-list { margin-top: 12px; } .mcppp-tool-call { margin-top: 12px; }
      .mcppp-service-selector { display: inline-flex; align-items: center; gap: 8px; color: #bac8d5; } .mcppp-service-selector select, .mcppp-section input, .mcppp-section select, .mcppp-section textarea { background: #0d1821; border: 1px solid #425a6e; color: #eef4f8; border-radius: 4px; padding: 7px; font: inherit; box-sizing: border-box; width: 100%; } .mcppp-service-selector select { width: auto; min-width: 180px; } .mcppp-section label { display: block; margin: 9px 0 5px; color: #bcc9d5; font-size: 12px; } .mcppp-section textarea { min-height: 150px; font: 12px/1.4 ui-monospace, monospace; resize: vertical; }
      .mcppp-list { margin-top: 8px; max-height: 470px; overflow: auto; border: 1px solid #2b4355; } .mcppp-list button { display: grid; width: 100%; text-align: left; border: 0; border-bottom: 1px solid #263b4c; border-radius: 0; gap: 3px; } .mcppp-list button.is-selected { background: #234a60; } .mcppp-list span { color: #a7b6c4; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mcppp-schema, .mcppp-output { white-space: pre-wrap; overflow: auto; overflow-wrap: anywhere; background: #0c151d; border: 1px solid #263e50; color: #d6e3eb; padding: 9px; margin: 8px 0; max-height: 260px; font: 11px/1.45 ui-monospace, monospace; } .mcppp-result-heading { justify-content: space-between; margin-top: 12px; color: #a9c5d5; } .mcppp-diagnostic-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; } .mcppp-diagnostic-grid div { padding: 9px; border: 1px solid #304b5d; background: #152632; } .mcppp-diagnostic-grid span { display: block; color: #a7bac9; font-size: 11px; } .mcppp-diagnostic-grid strong { display: block; margin-top: 3px; font-size: 16px; }
      .mcppp-event-list { border: 1px solid #284356; margin-top: 10px; } .mcppp-event-list article { display: grid; grid-template-columns: 120px 1fr auto; gap: 8px; padding: 8px; border-bottom: 1px solid #263e50; } .mcppp-event-list code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a6d3e4; } .mcppp-event-list span { color: #acbbc9; font-size: 11px; } .mcppp-empty { padding: 14px; color: #a8b6c3; }
      .mcppp-vda-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .mcppp-vda-grid article { min-width: 0; border: 1px solid #304b5d; background: #152632; border-radius: 5px; padding: 10px; } .mcppp-vda-grid h4 { margin: 0 0 6px; font-size: 13px; } .mcppp-vda-grid p { margin: 0 0 8px; color: #bdc9d3; overflow-wrap: anywhere; } .mcppp-vda-grid code { color: #a6d3e4; overflow-wrap: anywhere; } .mcppp-vda-grid pre { max-height: 170px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #0c151d; border: 1px solid #263e50; padding: 8px; font: 11px/1.4 ui-monospace, monospace; } .mcppp-vda-log { margin: 10px 0 0; padding-left: 22px; color: #b9c7d5; overflow-wrap: anywhere; }
      @media (max-width: 760px) { .mcp-plus-plus-explorer { padding: 12px; } .mcppp-header, .mcppp-coverage-row, .mcppp-section-heading { align-items: flex-start; flex-direction: column; } .mcppp-actions, .mcppp-vda-actions { align-items: stretch; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .mcppp-actions button, .mcppp-section button { min-width: 0; overflow-wrap: anywhere; } .mcppp-summary-grid, .mcppp-split, .mcppp-diagnostic-grid, .mcppp-vda-grid { grid-template-columns: 1fr; } .mcppp-event-list article { grid-template-columns: 1fr; } }
    </style>`;
  }
}

function tabLabel(tab) { return tab.charAt(0).toUpperCase() + tab.slice(1); }
function totalTools(snapshots) { return snapshots.reduce((total, snapshot) => total + (snapshot?.toolCount || 0), 0); }
function diagnosticMetric(label, value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`; }
function prettyJson(value) { return JSON.stringify(value, null, 2); }
function parseJsonInput(value, label) { try { return JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON.`); } }
function messageFor(error) { return error instanceof Error ? error.message : String(error); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

export default MCPPlusPlusExplorerApp;

import { invokeNativeTool } from '../live-tool-gateway.js';

const APP_ID = 'agent-supervisor';
const SUPERVISE_BINDING = 'agent-supervisor.ipfs_accelerate_py.supervise_agent_work';
const CONTRACT_SCHEMA = 'swissknife.agent_supervisor_console.v1';
const CONTRACT_SCHEMA_REF = 'contracts/agent-supervisor-console.schema.json';

const AGENT_SUPERVISOR_CONTRACT = Object.freeze({
  schema: CONTRACT_SCHEMA,
  app_id: APP_ID,
  version: '0.1.0',
  browser_safe: true,
  schema_ref: CONTRACT_SCHEMA_REF,
  owners: Object.freeze([
    {
      owner: 'ipfs_accelerate_py',
      responsibility: 'Supervisor state, queue state, goal/subgoal state, redacted logs, and governed actions.',
      state_authority: true,
      evidence_authority: false,
      search_authority: false,
      governed_action_authority: true,
    },
    {
      owner: 'ipfs_kit_py',
      responsibility: 'Immutable evidence and receipt persistence for supervisor reads and governed requests.',
      state_authority: false,
      evidence_authority: true,
      search_authority: false,
      governed_action_authority: false,
    },
    {
      owner: 'ipfs_datasets_py',
      responsibility: 'Searchable task, goal, taskboard, and run-history indexes.',
      state_authority: false,
      evidence_authority: false,
      search_authority: true,
      governed_action_authority: false,
    },
  ]),
  capabilities: Object.freeze([
    capability('supervisor.health.read', 'Supervisor health', 'read', 'ipfs_accelerate_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.health.read', true),
    capability('supervisor.queue.read', 'Supervisor queue', 'read', 'ipfs_accelerate_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.queue.read', true),
    capability('supervisor.goals.read', 'Supervisor goals', 'read', 'ipfs_accelerate_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.goals.read', true),
    capability('supervisor.subgoals.read', 'Supervisor subgoals', 'read', 'ipfs_accelerate_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.subgoals.read', true),
    capability('supervisor.taskboard.links.read', 'Taskboard links', 'read', 'ipfs_datasets_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.taskboard.links.read', true),
    capability('supervisor.logs.read', 'Supervisor logs', 'read', 'ipfs_accelerate_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.logs.read', true),
    capability('supervisor.receipts.read', 'Supervisor receipts', 'read', 'ipfs_kit_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.receipts.read', false),
    capability('supervisor.policy.assist', 'Dataset policy assistance', 'read', 'ipfs_datasets_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.policy.assist', true),
    capability('supervisor.semantic-goal.assist', 'Dataset semantic-goal assistance', 'read', 'ipfs_datasets_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.semantic_goal.assist', true),
    capability('supervisor.receipts.persist', 'Persist supervisor receipt', 'governed-write', 'ipfs_kit_py', 'confirm', ['mcp', 'mcp++'], 'agent_supervisor.receipts.persist', true),
    capability('supervisor.content.retrieve', 'Retrieve content reference', 'read', 'ipfs_kit_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.content.retrieve', true),
    capability('supervisor.event-dag.checkpoint', 'Persist event-DAG checkpoint', 'governed-write', 'ipfs_kit_py', 'confirm', ['mcp', 'mcp++'], 'agent_supervisor.event_dag.checkpoint', true),
    capability('supervisor.run-history.search', 'Run history search', 'read', 'ipfs_datasets_py', 'read', ['mcp', 'mcp++', 'libp2p'], 'agent_supervisor.run_history.search', true),
    capability('supervisor.prompt-steering.request', 'Prompt steering request', 'governed-write', 'ipfs_accelerate_py', 'confirm', ['mcp', 'mcp++'], 'agent_supervisor.prompt_steering.request', true),
    capability('supervisor.task-control.request', 'Task control request', 'governed-write', 'ipfs_accelerate_py', 'privileged-control', ['mcp', 'mcp++'], 'agent_supervisor.task_control.request', true),
  ]),
  unavailable_states: Object.freeze([
    'server_unavailable',
    'transport_unavailable',
    'capability_unavailable',
    'index_stale',
    'receipt_unavailable',
    'not_configured',
    'timeout',
    'helia_unavailable',
    'persistence_failed',
  ]),
  denied_states: Object.freeze([
    'policy_denied',
    'confirmation_required',
    'dependency_blocked',
    'budget_exceeded',
    'scope_not_allowed',
    'invalid_target',
  ]),
  forbidden_browser_surfaces: Object.freeze([
    'host_state_file_read',
    'host_process_launch',
    'direct_implementation_supervisor_call',
    'unmediated_prompt_mutation',
  ]),
});

const SAMPLE_SNAPSHOT = Object.freeze({
  health: {
    status: 'degraded',
    active_goal_count: 2,
    queued_task_count: 4,
    running_task_count: 1,
    server_time: '2026-07-10T12:00:00.000Z',
    backends: [
      backend('ipfs_accelerate_py', 'degraded', 'mcp++', 'rcpt-health-accelerate'),
      backend('ipfs_datasets_py', 'available', 'libp2p', 'rcpt-health-datasets'),
      backend('ipfs_kit_py', 'available', 'mcp', 'rcpt-health-kit'),
    ],
  },
  goals: [
    goal('SWR-105', 'Build the Agent Supervisor virtual-desktop application', 'running', ['SWR-105-ui', 'SWR-105-contract'], ['SWR-105-1', 'SWR-105-2']),
    goal('SWR-106', 'Add governed prompt steering for goals, subgoals, and tasks', 'blocked', ['SWR-106-policy'], ['SWR-106-1']),
  ],
  subgoals: [
    subgoal('SWR-105-ui', 'SWR-105', 'Goals tree, queue, active task, and receipt UI', 'running', ['SWR-105-1', 'SWR-105-2']),
    subgoal('SWR-105-contract', 'SWR-105', 'Browser-safe contract cross-links and health panes', 'ready', ['SWR-105-3']),
    subgoal('SWR-106-policy', 'SWR-106', 'Confirmation-gated steering request flow', 'blocked', ['SWR-106-1']),
  ],
  queue: [
    queueItem('SWR-105-1', 'Render supervisor goals/subgoals tree', 'running', 'SWR-105', 'SWR-105-ui', [], 68, 'worker-alpha', null),
    queueItem('SWR-105-2', 'Wire queue item to taskboard and receipts', 'ready', 'SWR-105', 'SWR-105-ui', ['SWR-105-1'], 25, 'unassigned', 'timeout: 900s; reassign_to: worker-beta'),
    queueItem('SWR-105-3', 'Publish browser-safe backend contract links', 'waiting', 'SWR-105', 'SWR-105-contract', [], 10, 'worker-gamma', null),
    queueItem('SWR-106-1', 'Draft governed prompt steering confirmation flow', 'blocked', 'SWR-106', 'SWR-106-policy', ['SWR-105'], 0, 'unassigned', 'blocked_by_dependency: SWR-105'),
  ],
  taskboardLinks: [
    taskboardLink('SWR-105-1', 'supervisor', '#task/SWR-105-1', 'Supervisor queue record', 'running'),
    taskboardLink('SWR-105-2', 'release-evidence', 'docs/agent-supervisor-console-security-model.md#receipts', 'Receipt evidence model', 'ready'),
    taskboardLink('SWR-105-3', 'github', 'contracts/agent-supervisor-console.schema.json', 'Gateway JSON schema', 'waiting'),
    taskboardLink('SWR-106-1', 'todo', 'implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md#swr-106', 'Backlog dependency', 'blocked'),
  ],
  logs: [
    logEntry('log-1', 'info', 'Queue snapshot loaded through the mediated read surface.', 'supervisor', 'SWR-105', false),
    logEntry('log-2', 'warn', 'Live transport unavailable; cached index and receipt references are displayed.', 'task', 'SWR-105-2', true),
    logEntry('log-3', 'info', 'Governed write capabilities are present but require confirmation.', 'goal', 'SWR-106', false),
  ],
  receipts: [
    receipt('rcpt-health-accelerate', 'bafyagenthealthaccelerate', '2026-07-10T12:00:00.000Z'),
    receipt('rcpt-task-SWR-105-1', 'bafyagenttask1051', '2026-07-10T12:01:00.000Z'),
    receipt('rcpt-task-SWR-105-2', 'bafyagenttask1052', '2026-07-10T12:02:00.000Z'),
    receipt('rcpt-run-SWR-105-1', 'bafyagentrun1051', '2026-07-10T12:03:00.000Z'),
  ],
  runHistory: [
    runRecord('run-SWR-105-1', 'SWR-105', 'SWR-105-ui', 'SWR-105-1', 'running', 'rcpt-run-SWR-105-1'),
    runRecord('run-SWR-105-2', 'SWR-105', 'SWR-105-contract', 'SWR-105-3', 'queued', 'rcpt-task-SWR-105-2'),
  ],
  vdaG054: {
    checkpoint_refs: [
      'bafyagentg054goalsubgoalgraph',
      'bafyagentg054promptpreview',
      'bafyagentg054taskboardlinks',
      'bafyagentg054policyconfirmation',
      'bafyagentg054kdaevidence',
      'bafyagentg054progress',
      'bafyagentg054timeoutreassignment',
      'bafyagentg054receiptvisibility',
    ],
    receipt_refs: [
      'receipt:agent-supervisor:g054:goal-graph',
      'receipt:agent-supervisor:g054:prompt-preview',
      'receipt:agent-supervisor:g054:taskboard-links',
      'receipt:agent-supervisor:g054:policy-confirmation',
      'receipt:agent-supervisor:g054:kda-evidence',
      'receipt:agent-supervisor:g054:progress',
      'receipt:agent-supervisor:g054:timeout-reassignment',
      'receipt:agent-supervisor:g054:receipt-visibility',
    ],
  },
});

export class AgentSupervisorApp {
  constructor(desktop = null, options = {}) {
    this.desktop = desktop;
    this.options = options;
    this.contract = options.contract || AGENT_SUPERVISOR_CONTRACT;
    this.gateway = options.gateway || resolveBrowserGateway();
    this.endpoint = options.endpoint || resolveGatewayEndpoint();
    this.state = {
      status: 'loading',
      transportMode: 'fallback',
      selectedGoalId: 'SWR-105',
      selectedSubgoalId: 'SWR-105-ui',
      selectedTaskId: 'SWR-105-1',
      selectedReceiptId: 'rcpt-task-SWR-105-1',
      activeTab: 'active',
      steering: {
        targetType: 'task',
        targetId: 'SWR-105-1',
        prompt: '',
        dryRun: false,
        confirm: false,
        submitting: false,
        result: null,
        error: null,
        recoveryAction: null,
      },
      dispatch: {
        reason: 'Dispatch the reviewed task through the governed supervisor queue.',
        confirm: false,
        submitting: false,
        result: null,
        error: null,
        recoveryNote: null,
      },
      fixtureRun: null,
      fixtureHistory: [],
      nativeStage: 'a',
      nativeReadback: null,
      nativeReadbacks: {},
      events: [],
      receiptOperation: {
        loading: false,
        operation: null,
        confirm: false,
        result: null,
        error: null,
      },
      snapshot: cloneSnapshot(SAMPLE_SNAPSHOT),
      results: {},
      errors: [],
      lastUpdated: null,
    };
    this.container = null;
    this.restoreBoard();
  }

  async initialize() {
    await this.refresh({ silent: true });
    return true;
  }

  async render() {
    return this.renderShell();
  }

  bind(container) {
    this.container = container;
    this.containSupervisorFrame();
    this.bindEvents();
    this.update();
  }

  containSupervisorFrame() {
    const container = this.container;
    if (!container || typeof container.closest !== 'function') return;
    const pin = (node, extra) => {
      if (!node) return;
      node.style.minHeight = '0';
      node.style.maxHeight = '100%';
      node.style.overflow = 'hidden';
      node.style.boxSizing = 'border-box';
      if (extra) Object.assign(node.style, extra);
    };
    pin(container.closest('.window-content'), {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      paddingBottom: '0',
      scrollPaddingBottom: '0',
    });
    pin(container.closest('.window-app-content'), {
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 auto',
      height: '100%',
      position: 'relative',
    });
    pin(container, {
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 auto',
      height: '100%',
      position: 'relative',
    });
    const frame = container.closest('.window') || container;
    frame.querySelectorAll('.live-tool-gateway-host, [data-native-operation-details]').forEach(node => {
      node.style.flex = '0 1 auto';
      node.style.minHeight = '0';
      node.style.maxHeight = '18%';
      node.style.overflow = 'auto';
    });
  }

  async refresh({ silent = false } = {}) {
    if (!silent) {
      this.state.status = 'loading';
      this.update();
      await delay(60);
    }

    const live = await this.readLiveSnapshot();
    if (live.ok) {
      this.state.snapshot = live.snapshot;
      this.state.results = live.results;
      this.state.errors = live.errors;
      this.state.transportMode = live.errors.length ? 'degraded' : 'live';
      this.state.status = hasContent(live.snapshot) ? 'ready' : 'empty';
    } else {
      this.state.snapshot = cloneSnapshot(SAMPLE_SNAPSHOT);
      this.state.results = live.results || {};
      this.state.errors = live.errors.length ? live.errors : [{
        capability_id: 'supervisor.health.read',
        reason: 'not_configured',
        message: 'No browser Agent Supervisor gateway transport is configured.',
      }];
      this.state.transportMode = 'fallback';
      this.state.status = 'ready';
    }
    this.state.lastUpdated = new Date().toISOString();
    this.ensureSelection();
    this.update();
  }

  showEmptyState() {
    this.state.status = 'empty';
    this.state.transportMode = 'empty-fixture';
    this.state.snapshot = emptySnapshot();
    this.state.selectedGoalId = '';
    this.state.selectedSubgoalId = '';
    this.state.selectedTaskId = '';
    this.state.selectedReceiptId = '';
    this.state.steering.targetId = '';
    this.state.steering.result = null;
    this.state.steering.error = null;
    this.state.errors = [];
    this.state.lastUpdated = new Date().toISOString();
    this.update();
  }

  showErrorState() {
    this.state.status = 'error';
    this.state.transportMode = 'error-fixture';
    this.state.errors = [{
      capability_id: 'supervisor.queue.read',
      reason: 'transport_unavailable',
      message: 'The browser gateway returned an unavailable state while preserving the cached contract surface.',
    }];
    this.update();
  }

  async readLiveSnapshot() {
    const requests = {
      health: ['supervisor.health.read', {}],
      queue: ['supervisor.queue.read', { limit: 100 }],
      goals: ['supervisor.goals.read', { limit: 100 }],
      subgoals: ['supervisor.subgoals.read', { limit: 200 }],
      taskboardLinks: ['supervisor.taskboard.links.read', { limit: 200 }],
      logs: ['supervisor.logs.read', { limit: 50 }],
      receipts: ['supervisor.receipts.read', { limit: 100 }],
      runHistory: ['supervisor.run-history.search', { limit: 100 }],
      policyAssist: ['supervisor.policy.assist', { limit: 20 }],
      semanticGoalAssist: ['supervisor.semantic-goal.assist', { limit: 20 }],
    };

    const entries = await Promise.all(Object.entries(requests).map(async ([key, [capabilityId, payload]]) => {
      const result = await this.invokeCapability(capabilityId, payload);
      return [key, result];
    }));

    const results = Object.fromEntries(entries);
    const errors = Object.values(results)
      .filter(result => !isAvailableResult(result))
      .map(result => ({
        capability_id: result.capability_id,
        reason: result.reason || result.state,
        message: result.message || 'Capability did not return an available result.',
      }));

    const availableCount = Object.values(results).filter(isAvailableResult).length;
    if (availableCount === 0) return { ok: false, results, errors };

    // Live mode must never substitute SAMPLE fixtures per capability: a
    // capability the gateway does not serve contributes an empty list (and
    // its typed error stays visible in Gateway evidence). SAMPLE_SNAPSHOT
    // renders only when NO capability is available, which refresh() routes
    // to the full-fallback branch above instead of this snapshot.
    const snapshot = {
      health: dataOr(results.health, { status: 'unavailable', active_goal_count: 0, queued_task_count: 0, running_task_count: 0, backends: [] }),
      queue: listDataOr(results.queue, []),
      goals: listDataOr(results.goals, []),
      subgoals: listDataOr(results.subgoals, []),
      taskboardLinks: listDataOr(results.taskboardLinks, []),
      logs: listDataOr(results.logs, []),
      receipts: listDataOr(results.receipts, []),
      runHistory: listDataOr(results.runHistory, []),
      policyAssist: dataOr(results.policyAssist, null),
      semanticGoalAssist: dataOr(results.semanticGoalAssist, null),
    };
    return { ok: true, snapshot, results, errors };
  }

  async invokeCapability(capabilityId, payload) {
    const capability = this.contract.capabilities.find(item => item.id === capabilityId);
    const invocation = {
      capability_id: capabilityId,
      owner: capability?.owner || 'ipfs_accelerate_py',
      method: capability?.method || capabilityId,
      access: capability?.access || 'read',
      policy_class: capability?.policy_class || 'read',
      payload,
      correlation_id: `${APP_ID}-${Date.now()}-${capabilityId.replace(/[^a-z0-9]+/gi, '-')}`,
    };

    try {
      if (this.gateway && typeof this.gateway.invoke === 'function') {
        const result = normalizeGatewayResult(invocation, await this.gateway.invoke(invocation));
        return this.withLocalSteeringPreview(invocation, result);
      }
      if (this.endpoint && typeof fetch === 'function') {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(invocation),
        });
        if (!response.ok) {
          return unavailable(invocation, response.status === 408 ? 'timeout' : 'server_unavailable', `Gateway HTTP ${response.status}`);
        }
        return this.withLocalSteeringPreview(invocation, normalizeGatewayResult(invocation, await response.json()));
      }
    } catch (error) {
      return unavailable(invocation, 'transport_unavailable', error instanceof Error ? error.message : String(error));
    }
    // The standalone desktop still supports a reviewed, confirmation-gated
    // prompt-steering receipt when no mediated gateway has been provisioned.
    // This is deliberately limited to the local policy preview; any injected
    // HTTP/libp2p gateway remains the authoritative execution path above.
    if (capabilityId === 'supervisor.prompt-steering.request') {
      return localPromptSteeringResult(invocation, this.state.snapshot);
    }
    return unavailable(invocation, 'not_configured', 'No browser gateway transport is configured.');
  }

  withLocalSteeringPreview(invocation, result) {
    // The mediated gateway now serves a real prompt-steering route
    // (console -> gateway -> accelerate adapter -> Python bridge ->
    // production Supervisor.steer). A steering DRY RUN is still a local,
    // no-mutation policy preview by design, so it falls back to the
    // console's local preview; a confirmed submission keeps the
    // gateway's typed capability_unavailable error and is never
    // simulated locally.
    if (invocation.capability_id === 'supervisor.prompt-steering.request'
      && invocation.payload?.dry_run === true
      && result.state === 'unavailable'
      && result.reason === 'capability_unavailable') {
      return localPromptSteeringResult(invocation, this.state.snapshot);
    }
    return result;
  }

  ensureSelection() {
    const { snapshot } = this.state;
    if (!snapshot.goals.some(goal => goal.goal_id === this.state.selectedGoalId)) {
      this.state.selectedGoalId = snapshot.goals[0]?.goal_id || '';
    }
    if (!snapshot.subgoals.some(subgoal => subgoal.subgoal_id === this.state.selectedSubgoalId)) {
      const selectedGoalSubgoal = snapshot.subgoals.find(item => item.goal_id === this.state.selectedGoalId);
      this.state.selectedSubgoalId = selectedGoalSubgoal?.subgoal_id || snapshot.subgoals[0]?.subgoal_id || '';
    }
    if (!snapshot.queue.some(task => task.task_id === this.state.selectedTaskId)) {
      this.state.selectedTaskId = snapshot.queue[0]?.task_id || '';
    }
    if (!snapshot.receipts.some(item => item.receipt_id === this.state.selectedReceiptId)) {
      this.state.selectedReceiptId = snapshot.receipts[0]?.receipt_id || '';
    }
    if (!this.targetExists(this.state.steering.targetType, this.state.steering.targetId)) {
      this.setSteeringTarget('task', this.state.selectedTaskId || snapshot.queue[0]?.task_id || '', { update: false });
    }
  }

  targetExists(targetType, targetId) {
    if (!targetId) return false;
    const { goals, subgoals, queue } = this.state.snapshot;
    if (targetType === 'goal') return goals.some(item => item.goal_id === targetId);
    if (targetType === 'subgoal') return subgoals.some(item => item.subgoal_id === targetId);
    return queue.some(item => item.task_id === targetId);
  }

  setSteeringTarget(targetType, targetId, { update = true } = {}) {
    this.state.steering.targetType = targetType;
    this.state.steering.targetId = targetId;
    this.state.steering.confirm = false;
    this.state.steering.result = null;
    this.state.steering.error = null;
    this.state.steering.recoveryAction = null;
    if (update) this.update();
  }

  resetDispatchReview() {
    this.state.dispatch.confirm = false;
    this.state.dispatch.result = null;
    this.state.dispatch.error = null;
  }

  update() {
    if (!this.container) return;
    this.containSupervisorFrame();
    const root = this.container.querySelector('[data-agent-supervisor-root]');
    if (!root) return;
    const focusState = this.captureFocusState();
    root.outerHTML = this.renderRoot();
    this.bindEvents();
    this.restoreFocusState(focusState);
    this.persistBoard();
    if (this.state.activeTab === 'dispatch') this.scrollWithinApp('[data-testid="dispatch-panel"]');
    this.revealInPane('.as-pane.as-goals', '.as-pane.as-goals .is-selected');
    this.revealInPane('.as-pane.as-queue', '.as-pane.as-queue .is-selected');
  }

  captureFocusState() {
    if (!this.container) return null;
    const doc = this.container.ownerDocument;
    const active = doc && doc.activeElement;
    if (!active || !this.container.contains(active)) return null;
    const key = this.focusKeyFor(active);
    if (!key) return null;
    const state = { key };
    if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
      state.selectionStart = active.selectionStart;
      state.selectionEnd = active.selectionEnd;
    }
    return state;
  }

  focusKeyFor(el) {
    if (!el || !el.getAttribute) return '';
    if (el.getAttribute('data-testid')) return `testid:${el.getAttribute('data-testid')}`;
    if (el.hasAttribute('data-steering-prompt')) return 'attr:data-steering-prompt';
    if (el.hasAttribute('data-steering-confirm')) return 'attr:data-steering-confirm';
    if (el.hasAttribute('data-steering-dry-run')) return 'attr:data-steering-dry-run';
    if (el.hasAttribute('data-dispatch-reason')) return 'attr:data-dispatch-reason';
    if (el.hasAttribute('data-dispatch-confirm')) return 'attr:data-dispatch-confirm';
    if (el.hasAttribute('data-receipt-operation-confirm')) return 'attr:data-receipt-operation-confirm';
    if (el.getAttribute('data-action')) return `action:${el.getAttribute('data-action')}`;
    if (el.getAttribute('data-tab')) return `tab:${el.getAttribute('data-tab')}`;
    if (el.getAttribute('data-subgoal-id')) return `subgoal:${el.getAttribute('data-subgoal-id')}`;
    if (el.getAttribute('data-goal-id')) return `goal:${el.getAttribute('data-goal-id')}`;
    if (el.getAttribute('data-task-id')) return `task:${el.getAttribute('data-task-id')}`;
    if (el.getAttribute('data-receipt-id')) return `receipt:${el.getAttribute('data-receipt-id')}`;
    return '';
  }

  elementForFocusKey(key) {
    if (!this.container || !key) return null;
    const attrValue = (prefix) => escapeSelector(key.slice(prefix.length));
    if (key.startsWith('testid:')) return this.container.querySelector(`[data-testid="${attrValue('testid:')}"]`);
    if (key.startsWith('attr:')) return this.container.querySelector(`[${key.slice(5)}]`);
    if (key.startsWith('action:')) return this.container.querySelector(`[data-action="${attrValue('action:')}"]`);
    if (key.startsWith('tab:')) return this.container.querySelector(`[data-tab="${attrValue('tab:')}"]`);
    if (key.startsWith('subgoal:')) return this.container.querySelector(`[data-subgoal-id="${attrValue('subgoal:')}"]`);
    if (key.startsWith('goal:')) return this.container.querySelector(`[data-goal-id="${attrValue('goal:')}"]:not([data-subgoal-id])`);
    if (key.startsWith('task:')) return this.container.querySelector(`[data-task-id="${attrValue('task:')}"]`);
    if (key.startsWith('receipt:')) return this.container.querySelector(`[data-receipt-id="${attrValue('receipt:')}"]`);
    return null;
  }

  restoreFocusState(state) {
    if (!state || !state.key) return;
    const el = this.elementForFocusKey(state.key);
    if (!el || typeof el.focus !== 'function') return;
    el.focus({ preventScroll: true });
    if (typeof state.selectionStart === 'number' && typeof el.setSelectionRange === 'function') {
      try {
        el.setSelectionRange(state.selectionStart, state.selectionEnd);
      } catch (_err) {
        // Some input types reject selection ranges.
      }
    }
  }

  focusAssociatedInvalidControl(form, reason) {
    let key = '';
    if (form === 'steering') {
      key = reason === 'confirmation_required' ? 'testid:steering-confirm' : 'testid:steering-prompt';
    } else if (form === 'dispatch') {
      key = reason === 'confirmation_required' ? 'testid:dispatch-confirm' : 'testid:dispatch-reason';
    }
    const el = this.elementForFocusKey(key);
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }

  bindEvents() {
    if (!this.container) return;
    this.container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
      this.refresh();
    });
    this.container.querySelector('[data-action="empty"]')?.addEventListener('click', () => {
      this.showEmptyState();
    });
    this.container.querySelector('[data-action="error"]')?.addEventListener('click', () => {
      this.showErrorState();
    });
    this.container.querySelectorAll('[data-goal-id]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.subgoalId) return;
        this.state.selectedGoalId = button.dataset.goalId || '';
        this.setSteeringTarget('goal', this.state.selectedGoalId, { update: false });
        this.state.activeTab = 'steering';
        this.update();
      });
    });
    this.container.querySelectorAll('[data-subgoal-id]').forEach(button => {
      button.addEventListener('click', () => {
        this.state.selectedSubgoalId = button.dataset.subgoalId || '';
        this.state.selectedGoalId = button.dataset.goalId || this.state.selectedGoalId;
        this.setSteeringTarget('subgoal', this.state.selectedSubgoalId, { update: false });
        this.state.activeTab = 'steering';
        this.update();
      });
    });
    this.container.querySelectorAll('[data-task-id]').forEach(button => {
      button.addEventListener('click', () => {
        this.state.selectedTaskId = button.dataset.taskId || '';
        this.setSteeringTarget('task', this.state.selectedTaskId, { update: false });
        this.resetDispatchReview();
        this.state.activeTab = 'active';
        this.update();
      });
    });
    this.container.querySelectorAll('[data-receipt-id]').forEach(button => {
      button.addEventListener('click', () => {
        this.state.selectedReceiptId = button.dataset.receiptId || '';
        this.state.activeTab = 'receipts';
        this.update();
      });
    });
    this.container.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        this.state.activeTab = button.dataset.tab || 'active';
        this.update();
      });
    });
    this.container.querySelector('[data-action="retrieve-receipt-content"]')?.addEventListener('click', () => {
      this.retrieveSelectedReceiptContent();
    });
    this.container.querySelector('[data-action="checkpoint-receipt"]')?.addEventListener('click', () => {
      this.checkpointSelectedReceipt();
    });
    this.container.querySelector('[data-action="persist-receipt"]')?.addEventListener('click', () => {
      this.persistSelectedReceipt();
    });
    this.container.querySelector('[data-receipt-operation-confirm]')?.addEventListener('change', event => {
      this.state.receiptOperation.confirm = Boolean(event.target.checked);
      this.state.receiptOperation.result = null;
      this.state.receiptOperation.error = null;
      this.update();
    });
    this.container.querySelector('[data-steering-prompt]')?.addEventListener('input', event => {
      this.state.steering.prompt = event.target.value.slice(0, 8000);
      this.state.steering.result = null;
      this.state.steering.error = null;
      this.state.steering.recoveryAction = null;
    });
    this.container.querySelector('[data-steering-confirm]')?.addEventListener('change', event => {
      this.state.steering.confirm = Boolean(event.target.checked);
      this.state.steering.result = null;
      this.state.steering.error = null;
      this.state.steering.recoveryAction = null;
      this.update();
    });
    this.container.querySelector('[data-steering-dry-run]')?.addEventListener('change', event => {
      this.state.steering.dryRun = Boolean(event.target.checked);
      this.state.steering.confirm = false;
      this.state.steering.result = null;
      this.state.steering.error = null;
      this.state.steering.recoveryAction = null;
      this.update();
    });
    this.container.querySelector('[data-action="submit-steering"]')?.addEventListener('click', () => {
      this.submitSteeringPrompt();
    });
    this.container.querySelector('[data-action="recover-steering"]')?.addEventListener('click', () => {
      this.recoverSteeringRequest();
    });
    this.container.querySelector('[data-dispatch-reason]')?.addEventListener('input', event => {
      this.state.dispatch.reason = event.target.value.slice(0, 1000);
      this.state.dispatch.result = null;
      this.state.dispatch.error = null;
    });
    this.container.querySelector('[data-dispatch-confirm]')?.addEventListener('change', event => {
      this.state.dispatch.confirm = Boolean(event.target.checked);
      this.state.dispatch.result = null;
      this.state.dispatch.error = null;
      this.update();
    });
    this.container.querySelector('[data-native-create]')?.addEventListener('click', () => this.createNativeRun());
    this.container.querySelector('[data-native-read]')?.addEventListener('click', () => this.readNativeRun());
    this.container.querySelector('[data-native-retry]')?.addEventListener('click', () => this.retryNativeTask());
    this.container.querySelectorAll('[data-native-select-stage]').forEach(button => button.addEventListener('click', () => this.selectNativeTask(button.dataset.nativeSelectStage)));
    this.container.querySelector('[data-action="submit-dispatch"]')?.addEventListener('click', () => {
      this.submitTaskDispatch();
    });
    this.container.querySelector('[data-action="repair-blocker"]')?.addEventListener('click', () => {
      this.repairNamedBlocker();
    });
    this.container.querySelectorAll('[data-supervisor-focusable]').forEach(item => {
      item.addEventListener('keydown', event => this.handleFocusKey(event));
    });
    this.container.querySelectorAll('[data-svd-workflow-action]').forEach(button => {
      button.addEventListener('click', () => {
        this.handleWorkflowProofAction(button.getAttribute('data-svd-workflow-action'));
      });
    });
  }

  handleWorkflowProofAction(action) {
    // The VDA-G054 proof actions navigate to the live pane that carries the
    // evidence each action names; they never fabricate proof data.
    if (action === 'inspect-goal-graph') {
      this.update();
      this.scrollWithinApp('.as-goals');
      return;
    }
    const tabForAction = {
      'preview-steering-prompt': 'steering',
      'confirm-policy': 'steering',
      'open-taskboard-links': 'active',
      'track-progress': 'active',
      'simulate-timeout-reassignment': 'active',
      'open-receipt-visibility': 'receipts',
      'inspect-kda-evidence': 'health',
    };
    const tab = tabForAction[action];
    if (!tab) return;
    this.state.activeTab = tab;
    this.update();
    this.scrollWithinApp('.as-detail');
  }

  scrollWithinApp(selector) {
    const scroller = this.container?.querySelector('.as-layout');
    const target = this.container?.querySelector(selector);
    if (!scroller || !target || typeof target.getBoundingClientRect !== 'function') return;
    const box = scroller.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    if (targetBox.height > box.height || targetBox.top < box.top) scroller.scrollTop -= box.top - targetBox.top;
    else if (targetBox.bottom > box.bottom) scroller.scrollTop += targetBox.bottom - box.bottom;
  }

  handleFocusKey(event) {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const focusables = Array.from(this.container.querySelectorAll('[data-supervisor-focusable]'))
      .filter(item => !item.hasAttribute('disabled'));
    const index = focusables.indexOf(event.currentTarget);
    if (index === -1) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(focusables.length - 1, index + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = focusables.length - 1;
    focusables[next]?.focus({ preventScroll: true });
  }

  buildSteeringReview() {
    const { targetType, targetId, prompt } = this.state.steering;
    const normalizedTarget = `${targetType}:${targetId || 'unselected'}`;
    const affectedTasks = affectedTaskIds(targetType, targetId, this.state.snapshot);
    const capability = this.contract.capabilities.find(item => item.id === 'supervisor.prompt-steering.request') || {};
    return {
      normalized_target: normalizedTarget,
      policy_class: capability.policy_class || 'confirm',
      affected_task_ids: affectedTasks,
      prompt_char_count: prompt.trim().length,
      prompt_max_chars: 8000,
      prompt_log_preview: '[prompt redacted]',
      planned_mcp_action: {
        capability_id: 'supervisor.prompt-steering.request',
        method: capability.method || 'agent_supervisor.prompt_steering.request',
        owner: capability.owner || 'ipfs_accelerate_py',
        access: capability.access || 'governed-write',
        policy_class: capability.policy_class || 'confirm',
        normalized_target: normalizedTarget,
        transport_candidates: capability.transports || ['mcp', 'mcp++'],
        input_mode: 'structured-json-payload',
        prompt_log_mode: 'redacted',
        required_policy_checks: [
          'target_authorization',
          'task_dependencies',
          'branch_protection',
          'confirmation_policy',
          'execution_budget',
          'receipt_persistence',
        ],
      },
    };
  }

  async submitSteeringPrompt() {
    const review = this.buildSteeringReview();
    const steering = this.state.steering;
    const prompt = steering.prompt.trim();
    if (!steering.targetId || !this.targetExists(steering.targetType, steering.targetId)) {
      steering.error = { reason: 'invalid_target', message: 'Select a goal, subgoal, or task before submitting steering.' };
      this.update();
      this.focusAssociatedInvalidControl('steering', steering.error.reason);
      return;
    }
    if (!prompt || prompt.length > 8000) {
      steering.error = { reason: 'scope_not_allowed', message: 'Prompt text must be present and no longer than 8000 characters.' };
      this.update();
      this.focusAssociatedInvalidControl('steering', steering.error.reason);
      return;
    }
    if (!steering.dryRun && !steering.confirm) {
      steering.error = { reason: 'confirmation_required', message: 'Explicit confirmation is required before submission.' };
      this.update();
      this.focusAssociatedInvalidControl('steering', steering.error.reason);
      return;
    }

    const clientRequestId = `steer-${Date.now()}`;
    const request = {
      target_type: steering.targetType,
      target_id: steering.targetId,
      prompt,
      dry_run: steering.dryRun,
      confirmation_token: steering.dryRun
        ? undefined
        : `confirm-agent-supervisor:${review.normalized_target}:${clientRequestId}`,
      client_request_id: clientRequestId,
      expected_normalized_target: review.normalized_target,
    };

    steering.submitting = true;
    steering.error = null;
    steering.result = null;
    steering.recoveryAction = null;
    this.update();

    const result = await this.invokeCapability('supervisor.prompt-steering.request', request);
    steering.submitting = false;
    if (isAvailableResult(result)) {
      const data = normalizeSteeringAccepted(result.data, review, result.correlation_id);
      steering.result = data;
      steering.confirm = false;
      if (data.receipt?.receipt_id) {
        this.state.snapshot.receipts = upsertReceipt(this.state.snapshot.receipts, data.receipt);
        this.state.selectedReceiptId = data.receipt.receipt_id;
      }
    } else {
      steering.error = {
        reason: result.reason || result.state,
        message: result.message || 'Prompt steering request was not accepted.',
        correlation_id: result.correlation_id,
      };
      steering.recoveryAction = result.recovery_action
        || result.runtime?.recovery_action
        || recoveryActionForSteeringFailure(steering.error.reason);
    }
    this.state.activeTab = 'steering';
    this.update();
  }

  recoverSteeringRequest() {
    this.state.steering.confirm = false;
    this.state.steering.result = null;
    this.state.steering.error = null;
    this.state.steering.recoveryAction = null;
    this.state.activeTab = 'steering';
    this.update();
  }

  nativeTaskId(stage = this.state.nativeStage || 'a') {
    return this.state.fixtureRun?.task_ids?.[stage] || '';
  }

  selectNativeTask(stage) {
    if (!['a','b'].includes(stage)) return;
    this.state.nativeStage = stage;
    this.state.dispatch.confirm = false;
    this.state.dispatch.error = null;
    this.state.activeTab = 'dispatch';
    this.update();
  }

  async createNativeRun() { return this.performNativeAction('create', 'a'); }
  async readNativeRun() { return this.performNativeAction('read', this.state.nativeStage || 'a'); }
  async retryNativeTask() { return this.performNativeAction('retry', 'b'); }

  async submitTaskDispatch() {
    if (!this.state.fixtureRun?.task_ids?.a) return this.createNativeRun();
    return this.performNativeAction('dispatch', this.state.nativeStage || 'a');
  }

  async repairNamedBlocker() {
    const run = this.state.fixtureRun;
    if (!run?.task_ids?.a) return false;
    if (run.stages?.a?.status === 'completed') {
      this.state.dispatch.recoveryNote = 'Dependency A has validated output. Explicitly retry task B; no second execution of A is needed.';
      this.update(); return false;
    }
    return this.performNativeAction('dispatch', 'a', '[data-testid="dispatch-repair"]');
  }

  async performNativeAction(action, stage, triggerSelector) {
    const dispatch = this.state.dispatch;
    if (dispatch.submitting) return false;
    if (!dispatch.confirm) {
      dispatch.error = {reason:'confirmation_required',message:'Confirm the next bounded native run action before requesting gateway consent.'};
      this.update(); return false;
    }
    const existing = this.state.fixtureRun;
    if (action !== 'create' && (!nativeUUID(existing?.run_id)||!nativeUUID(existing?.task_ids?.a)||!nativeUUID(existing?.task_ids?.b))) {
      dispatch.error = {reason:'invalid_target',message:'Create a bounded native run first.'}; this.update(); return false;
    }
    if (action !== 'create' && !['a','b'].includes(stage)) return false;
    if (['dispatch','retry'].includes(action) && existing?.stages?.[stage]?.status === 'completed') {
      dispatch.recoveryNote = `Native task ${stage.toUpperCase()} already has validated output; refresh its owner state instead of dispatching it again.`;
      this.update(); return false;
    }
    const toolId = action === 'read' ? 'get_task' : 'WorkflowCoordinator.submit_task';
    const payload = {fixture_mode:'svf-goal-worker-v1',fixture_scope:'svf-agent-supervisor-552'};
    if (action === 'create') Object.assign(payload,{action:'create',fixture:'dependency-output-v1',dry_run:false});
    else {
      Object.assign(payload,{run_id:existing.run_id,task_key:stage});
      if (action !== 'read') Object.assign(payload,{action,dry_run:false});
    }
    const priorRun = existing ? JSON.parse(JSON.stringify(existing)) : null;
    const container = this.container;
    const operation = Symbol('native-run-action');this.nativeOperation = operation;
    dispatch.submitting = true;dispatch.error = null;dispatch.result = null;dispatch.confirm = false;
    if (action === 'create') { this.state.nativeReadback = null; this.state.nativeReadbacks = {}; }
    this.update();
    try {
      const trigger = container?.querySelector(triggerSelector || (action === 'create' ? '[data-native-create]' : action === 'read' ? '[data-native-read]' : action === 'retry' ? '[data-native-retry]' : stage === 'a' && dispatch.error?.reason === 'dependency_blocked' ? '[data-testid="dispatch-repair"]' : '[data-testid="dispatch-submit"]'));
      const response = await invokeNativeTool(container,APP_ID,SUPERVISE_BINDING,{executionMode:'execute',toolId,payload,trigger});
      // A response may finish after native close. It cannot publish into a
      // detached instance or overwrite a newer reopened browser session.
      if (this.nativeOperation !== operation || this.container !== container || !container?.isConnected) return false;
      if (!response) { dispatch.error={reason:'cancelled',message:'Cancelled before native owner dispatch; retained run is unchanged.'};return false; }
      const reference = nativeGatewayReference(response,toolId);
      const body = nativeFixtureBody(response);
      if (!reference || response.ok !== true || response.outcome !== 'executed' || !body || body.fixture_mode !== 'svf-goal-worker-v1' || body.native_provenance?.schema!=='swissknife.native-supervisor-execution.v1' || body.native_provenance.owner!=='ipfs_accelerate_py' || body.native_provenance.simulated!==false || body.native_provenance.cache_fallback!==false) {
        const message=nativeFailureMessage(response);
        const blocked=action!=='create' && stage==='b' && /task is not ready/i.test(message);
        dispatch.error={reason:blocked?'dependency_blocked':'owner_execution_failed',message:blocked?`Blocked by dependency native task A ${existing.task_ids.a}: ${message}`:message};
        if (reference && existing) {
          existing.history=[...(existing.history||[]),{action,stage,run_id:existing.run_id,task_id:existing.task_ids[stage],outcome:response.outcome,error:message,...reference}].slice(-12);
          if(blocked)existing.stages.b={...(existing.stages.b||{}),status:'blocked'};
          this.persistBoard();
        }
        return false;
      }
      if (!nativeUUID(body.run_id)) throw new Error('Owner did not return a canonical run identity.');
      if (action === 'create') {
        if (!nativeUUID(body.task_ids?.a)||!nativeUUID(body.task_ids?.b)||body.task_ids.a===body.task_ids.b
            ||!nativeUUID(body.root_goal_cid)||!nativeUUID(body.child_goal_cid)) throw new Error('Owner fixture identities are incomplete.');
        if (priorRun) this.state.fixtureHistory=[...(this.state.fixtureHistory||[]),priorRun].slice(-2);
        this.state.fixtureRun={schema:'swissknife.native-supervisor-run.v1',run_id:body.run_id,
          task_ids:{a:body.task_ids.a,b:body.task_ids.b},root_goal_cid:body.root_goal_cid,child_goal_cid:body.child_goal_cid,
          stages:{a:{status:'not_run'},b:{status:'not_run'}},history:[{action:'create',run_id:body.run_id,outcome:'executed',...reference}]};
        this.state.nativeStage='a';dispatch.recoveryNote='Run created. No worker has completed; explicitly run task A.';
      } else {
        if(body.run_id!==existing.run_id || body.task_key!==stage || body.task_id!==existing.task_ids[stage]) throw new Error('Owner returned a different run or task.');
        const prior=existing.stages?.[stage];
        if(action==='read' && body.status!=='completed') {
          const nonCompleted=['proposed','admitted','pending','ready','todo','queued','retrying','claimed','in_progress','running','blocked','cancelled','failed','quarantined','rejected'];
          if(!nonCompleted.includes(body.status)||prior?.output_sha256)throw new Error('Owner readback does not match the retained validated output.');
          existing.stages[stage]={...prior,status:body.status,owner_status:body.status,task_id:body.task_id};
          const observed={run_id:body.run_id,task_id:body.task_id,stage,owner_status:body.status,matched:false};
          this.state.nativeReadback=observed;this.state.nativeReadbacks={...(this.state.nativeReadbacks||{}),[stage]:observed};
          existing.history=[...(existing.history||[]),{action,stage,run_id:body.run_id,task_id:body.task_id,status:body.status,outcome:'executed',...reference}].slice(-12);
          this.state.nativeStage=stage;
        } else {
          if(body.status!=='completed'||!nativeDigest(body.output_sha256))throw new Error('Owner has not published validated task output.');
          if(action==='read' && (!prior?.output_sha256 || prior.output_sha256!==body.output_sha256))throw new Error('Owner readback does not match the retained validated output.');
          if(action!=='read' && (!nativeArtifact(body.execution?.producer,body.run_id)||!nativeArtifact(body.execution?.validator,body.run_id)
            ||body.execution.producer.path===body.execution.validator.path))throw new Error('Distinct native producer and independent validator records are missing.');
          const execution=action==='read'?prior.execution:body.execution;
          existing.stages[stage]={status:'completed',owner_status:'completed',task_id:body.task_id,output_sha256:body.output_sha256,execution,...reference};
          this.state.nativeStage=stage;
          existing.output_sha256=body.output_sha256;existing.last_validated_stage=stage;
          if(action==='read') {
            const matched={run_id:body.run_id,task_id:body.task_id,stage,owner_status:body.status,output_sha256:body.output_sha256,matched:true};
            this.state.nativeReadback=matched;this.state.nativeReadbacks={...(this.state.nativeReadbacks||{}),[stage]:matched};
          } else {
            if(this.state.nativeReadbacks)delete this.state.nativeReadbacks[stage];
            if(this.state.nativeReadback?.stage===stage)this.state.nativeReadback=null;
          }
          existing.history=[...(existing.history||[]),{action,stage,run_id:body.run_id,task_id:body.task_id,status:body.status,
            output_sha256:body.output_sha256,outcome:'executed',...reference}].slice(-12);
          if(action!=='read') {
            if(stage==='a')dispatch.recoveryNote='Dependency A now has actual validated output. Task B can be explicitly retried.';
            else {
              const taskADispatches=(existing.history||[]).filter(item=>item.action==='dispatch'&&item.stage==='a'&&item.outcome==='executed').length;
              dispatch.recoveryNote=`The named dependency was repaired and task B completed with validated output without a duplicate dispatch of task A. Task A executed dispatches: ${taskADispatches}.`;
            }
          }
        }
        // Owner observations describe one task; never infer whole-run completion.
        delete existing.status;
      }
      const run=this.state.fixtureRun;const current=run.stages?.[stage];
      dispatch.result={accepted:current?.status==='completed',native_stage:stage,native_status:current?.status||'created',run_id:run.run_id,output_sha256:current?.output_sha256||'',
        correlation_id:reference.correlation_id,receipt:{receipt_id:reference.receipt_id,cid:reference.receipt_id},
        event_dag:{cid:reference.event_id,event_type:action},policy_class:'privileged-control',
        note:current?.status==='completed'?'Actual native output passed its fixed independent validator. Heartbeat is not completion.':action==='read'?`Owner reports ${current?.owner_status||'unverified'}; completion is withheld without validated output.`:'Created only; no validated worker output yet.'};
      this.rememberEvent(`${action} ${run.run_id} ${stage}: ${reference.receipt_id}; event ${reference.event_id}.`);
      if (!this.persistBoard()) throw new Error('The browser could not retain native run identity for reopen.');
      return true;
    } catch(error) {
      dispatch.error={reason:'owner_result_unverified',message:error instanceof Error?error.message:String(error)};dispatch.result=null;
      this.state.nativeReadback=null;if(this.state.nativeReadbacks)delete this.state.nativeReadbacks[stage];return false;
    } finally {
      if(this.nativeOperation===operation){dispatch.submitting=false;dispatch.confirm=false;if(this.container===container && container?.isConnected){this.state.activeTab='dispatch';this.update();(action!=='create'&&!dispatch.error?container.querySelector(`[data-native-result-stage="${stage}"]`)||container.querySelector('[data-native-summary]'):container.querySelector('[data-native-summary]'))?.scrollIntoView?.({block:'nearest'});}}
    }
  }

  nativeReadbackFor(stage) {
    const run=this.state.fixtureRun,read=this.state.nativeReadbacks?.[stage];
    if(!run||!read||read.run_id!==run.run_id||read.task_id!==run.task_ids?.[stage])return null;
    if(read.matched&&(!nativeDigest(read.output_sha256)||read.output_sha256!==run.stages?.[stage]?.output_sha256))return null;
    return read;
  }

  renderNativeRun() {
    const run=this.state.fixtureRun,stage=this.state.nativeStage||'a',current=run?.stages?.[stage],read=this.nativeReadbackFor(stage);
    return `<section class="as-section-line" data-native-run data-native-summary data-native-run-state="${run?.task_ids?.a?'created':'none'}">
      <h4>Bounded native task run</h4>
      <label class="as-field as-native-identity"><span>Native run ID</span><input readonly data-native-run-id aria-label="Native run ID" value="${escapeHtml(run?.run_id||'')}" placeholder="Create a run to obtain its ID"></label>
      <div class="as-native-stage-results">${['a','b'].map(key=>{
        const result=run?.stages?.[key],matched=this.nativeReadbackFor(key),label=key.toUpperCase();
        return `<section class="as-native-stage-result" data-native-result-stage="${key}" data-native-state="${escapeHtml(JSON.stringify({owner_status:result?.owner_status||'not_read',validated:result?.status==='completed'&&nativeDigest(result?.output_sha256),output_sha256:result?.output_sha256||'',readback:matched?.matched===true}))}">
        <strong data-native-${key}-complete="${result?.status==='completed'}" data-native-owner-status="${key}" data-owner-status="${escapeHtml(result?.owner_status||'not_read')}">Task ${label}: ${escapeHtml(result?.status||'not created')}</strong>
        <code style="overflow-wrap:anywhere" data-native-stage-output="${key}" ${stage===key?'data-native-output-sha':''}>${escapeHtml(result?.output_sha256||'not published')}</code>
        <span data-native-readback-stage="${key}" data-readback-state="${matched?.matched?'matched':matched?'pending':'not_read'}" ${stage===key?`data-native-readback="${matched?.matched?'matched':matched?'pending':'not_read'}"`:''}>${matched?.matched?`Task ${label}: owner readback matched this session.`:matched?`Task ${label}: owner returned ${escapeHtml(matched.owner_status)}; validated output is not published.`:`Task ${label}: not read back in this session.`}</span></section>`;
      }).join('')}</div>
      <details><summary>Task and result references</summary><div class="as-section-line">
      <span>Actual isolated supervisor tasks. The cached board is separate from this run.</span>
      <span>${read?.matched?'Owner readback matched the retained run, task and validated output.':'Reopen identity requires explicit owner readback.'}</span>
      <span data-native-completion-caution>Heartbeat and progress percent are not completion.</span>
      <span>Task A ${escapeHtml(run?.task_ids?.a||'uncreated')}</span><span>Task B ${escapeHtml(run?.task_ids?.b||'uncreated')} depends on A</span>
      <span>Goal ${escapeHtml(run?.root_goal_cid||'not returned')}; child ${escapeHtml(run?.child_goal_cid||'not returned')}</span>
      <span>Owner receipt ${escapeHtml(current?.receipt_id||'none')}</span><span>Event DAG ${escapeHtml(current?.event_id||'none')}</span>
      <span>Producer ${escapeHtml(current?.execution?.producer?.sha256||'not returned')}</span><span>Independent validator ${escapeHtml(current?.execution?.validator?.sha256||'not returned')}</span>
      <span>${escapeHtml((run?.history||[]).map(item=>`${item.action} ${item.stage||''} ${item.outcome||item.status}: ${item.receipt_id}; ${item.event_id}`).join(' | '))}</span>
      </div></details></section>`;
  }

  renderNativeActions() {
    const run=this.state.fixtureRun,stage=this.state.nativeStage||'a';
    return `<nav class="as-actions as-dispatch-toolbar" data-native-action-toolbar aria-label="Native run controls"><button type="button" data-native-create aria-label="Create new bounded native run" ${this.state.dispatch.submitting?'disabled':''}>New run</button>
      <button type="button" data-native-select-stage="a" aria-label="Select native task A" ${!run?.task_ids?.a?'disabled':''}>Select A</button>
      <button type="button" data-native-select-stage="b" aria-label="Select native task B" ${!run?.task_ids?.b?'disabled':''}>Select B</button>
      <button type="button" data-native-read aria-label="Read owner task ${escapeHtml(stage.toUpperCase())}" ${!run?.task_ids?.[stage]?'disabled':''}>Read owner ${escapeHtml(stage.toUpperCase())}</button></nav>`;
  }

  renderNativeTaskSummary() {
    const run=this.state.fixtureRun;
    if(!run?.task_ids?.a)return '';
    const stage=this.state.nativeStage||'a',current=run.stages?.[stage];
    return `<section class="as-section-line" data-native-active-result>
      <h4>Native task ${escapeHtml(stage.toUpperCase())}: ${escapeHtml(current?.status||'not_run')}</h4>
      <span style="overflow-wrap:anywhere">Run ${escapeHtml(run.run_id)}; task ${escapeHtml(run.task_ids[stage]||'not returned')}</span>
      <span style="overflow-wrap:anywhere">Task B ${escapeHtml(run.task_ids.b)} depends on task A ${escapeHtml(run.task_ids.a)}.</span>
      <span style="overflow-wrap:anywhere">Validated output SHA-256 ${escapeHtml(current?.output_sha256||'not published')}</span>
      <span style="overflow-wrap:anywhere">Owner receipt ${escapeHtml(current?.receipt_id||'not returned')}; event ${escapeHtml(current?.event_id||'not returned')}</span>
      <span>${this.nativeReadbackFor(stage)?.matched?'Explicit owner readback matched this retained run, task and output.':'Task status and artifacts below are retained results, not a new owner readback.'} Goal completion is not inferred.</span>
      <details><summary>Goal and independent validation references</summary>
      <span style="overflow-wrap:anywhere">Goal ${escapeHtml(run.root_goal_cid)}; subgoal ${escapeHtml(run.child_goal_cid)}</span>
      <span style="overflow-wrap:anywhere">Producer ${escapeHtml(current?.execution?.producer?.path||'not returned')} (${escapeHtml(current?.execution?.producer?.sha256||'none')})</span>
      <span style="overflow-wrap:anywhere">Independent validator ${escapeHtml(current?.execution?.validator?.path||'not returned')} (${escapeHtml(current?.execution?.validator?.sha256||'none')})</span></details>
      </section>`;
  }

  rememberEvent(message) {
    const entry = { at: new Date().toISOString(), message: String(message || '').slice(0, 500) };
    this.state.events = [...(this.state.events || []), entry].slice(-12);
  }

  restoreBoard() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const raw = sessionStorage.getItem('agent-supervisor-board');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      for (const key of ['selectedGoalId', 'selectedSubgoalId', 'selectedTaskId', 'selectedReceiptId', 'activeTab']) {
        if (typeof saved[key] === 'string') this.state[key] = saved[key];
      }
      if (saved.fixtureRun && nativeUUID(saved.fixtureRun.run_id)) {
        const value=saved.fixtureRun;
        this.state.fixtureRun={...value,stages:value.stages&&typeof value.stages==='object'?value.stages:{},history:Array.isArray(value.history)?value.history.slice(-12):[]};
        this.state.nativeReadback=null;this.state.nativeReadbacks={};
      }
      if(Array.isArray(saved.fixtureHistory))this.state.fixtureHistory=saved.fixtureHistory.slice(-2);
      if(['a','b'].includes(saved.nativeStage))this.state.nativeStage=saved.nativeStage;
      if (Array.isArray(saved.events)) {
        this.state.events = saved.events.filter(item => item && typeof item.message === 'string').slice(-12);
      }
      if (typeof saved.recoveryNote === 'string') this.state.dispatch.recoveryNote = saved.recoveryNote;
    } catch (_err) {
      // Ignore unreadable board storage and keep the in-memory snapshot.
    }
  }

  persistBoard() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem('agent-supervisor-board', JSON.stringify({
        selectedGoalId: this.state.selectedGoalId,
        selectedSubgoalId: this.state.selectedSubgoalId,
        selectedTaskId: this.state.selectedTaskId,
        selectedReceiptId: this.state.selectedReceiptId,
        activeTab: this.state.activeTab,
        fixtureRun: this.state.fixtureRun,
        fixtureHistory: this.state.fixtureHistory,
        nativeStage: this.state.nativeStage,
        events: this.state.events || [],
        recoveryNote: this.state.dispatch.recoveryNote || '',
      }));
    } catch (_err) {
      // A native operation must not claim reopen retention on storage failure.
      return false;
    }
    return true;
  }

  dependencyCopy(task) {
    const unresolved = unresolvedDependencyIds([task.task_id], this.state.snapshot);
    if (unresolved.length) {
      return `Dependency blocker: ${unresolved.join(', ')} is not validated. Heartbeat and progress percent are not completion.`;
    }
    return 'No open dependency. Completion still requires validated output. Heartbeat and progress percent are not completion.';
  }

  fixtureCopy() {
    const run = this.state.fixtureRun;
    if (!run?.run_id) return 'No validated fixture output yet.';
    return `Retained run ${run.run_id}; ${run.output_sha256 ? `last validated task ${(run.last_validated_stage||'a').toUpperCase()} output ${run.output_sha256}` : 'no validated task output yet'}. Goal completion is not inferred from a task result.`;
  }

  reassignmentCopy() {
    const stalled = this.state.snapshot.queue.find(item => item.reassignment);
    if (!stalled) return 'No stalled-task reassignment is recorded.';
    return `Reassignment ${stalled.task_id}: ${stalled.reassignment}.`;
  }

  eventCopy() {
    const events = this.state.events || [];
    if (!events.length) return 'No retained events.';
    return events.map(item => item.message).join(' ');
  }

  async retrieveSelectedReceiptContent() {
    const selected = this.state.snapshot.receipts
      .find(item => item.receipt_id === this.state.selectedReceiptId);
    if (!selected?.cid) {
      this.state.receiptOperation.error = {
        reason: 'receipt_unavailable',
        message: 'Select a receipt with a content CID before requesting retrieval.',
      };
      this.update();
      return;
    }
    this.state.receiptOperation.loading = true;
    this.state.receiptOperation.operation = 'retrieve-content';
    this.state.receiptOperation.result = null;
    this.state.receiptOperation.error = null;
    this.update();
    const result = await this.invokeCapability('supervisor.content.retrieve', {
      cid: selected.cid,
      receipt_ids: [selected.receipt_id],
    });
    this.state.receiptOperation.loading = false;
    if (isAvailableResult(result)) {
      this.state.receiptOperation.result = result;
    } else {
      this.state.receiptOperation.error = result;
    }
    this.state.results.contentRetrieve = result;
    this.update();
  }

  async checkpointSelectedReceipt() {
    const selected = this.state.snapshot.receipts
      .find(item => item.receipt_id === this.state.selectedReceiptId);
    if (!selected) {
      this.state.receiptOperation.error = {
        reason: 'receipt_unavailable',
        message: 'Select a receipt before creating an event-DAG checkpoint.',
      };
      this.update();
      return;
    }
    if (!this.state.receiptOperation.confirm) {
      this.state.receiptOperation.error = {
        reason: 'confirmation_required',
        message: 'Confirm the selected receipt operation before creating an event-DAG checkpoint.',
      };
      this.update();
      return;
    }
    this.state.receiptOperation.loading = true;
    this.state.receiptOperation.operation = 'checkpoint-event-dag';
    this.state.receiptOperation.result = null;
    this.state.receiptOperation.error = null;
    this.update();
    const correlation = `checkpoint-${Date.now()}`;
    const result = await this.invokeCapability('supervisor.event-dag.checkpoint', {
      receipt: selected,
      confirmation_token: `confirm-agent-supervisor:receipt:${selected.receipt_id}:${correlation}`,
    });
    this.state.receiptOperation.loading = false;
    if (isAvailableResult(result)) {
      this.state.receiptOperation.result = result;
      this.state.receiptOperation.confirm = false;
      const checkpointReceipt = result.receipt || result.data?.receipt;
      if (checkpointReceipt?.receipt_id) {
        this.state.snapshot.receipts = upsertReceipt(this.state.snapshot.receipts, checkpointReceipt);
        this.state.selectedReceiptId = checkpointReceipt.receipt_id;
      }
    } else {
      this.state.receiptOperation.error = result;
    }
    this.state.results.eventDagCheckpoint = result;
    this.update();
  }

  async persistSelectedReceipt() {
    const selected = this.state.snapshot.receipts
      .find(item => item.receipt_id === this.state.selectedReceiptId);
    if (!selected) {
      this.state.receiptOperation.error = {
        reason: 'receipt_unavailable',
        message: 'Select a receipt before requesting browser-safe persistence.',
      };
      this.update();
      return;
    }
    if (!this.state.receiptOperation.confirm) {
      this.state.receiptOperation.error = {
        reason: 'confirmation_required',
        message: 'Confirm the selected receipt operation before requesting browser-safe persistence.',
      };
      this.update();
      return;
    }
    this.state.receiptOperation.loading = true;
    this.state.receiptOperation.operation = 'persist-receipt';
    this.state.receiptOperation.result = null;
    this.state.receiptOperation.error = null;
    this.update();
    const correlation = `persist-${Date.now()}`;
    const result = await this.invokeCapability('supervisor.receipts.persist', {
      receipt: selected,
      confirmation_token: `confirm-agent-supervisor:receipt:${selected.receipt_id}:${correlation}`,
    });
    this.state.receiptOperation.loading = false;
    if (isAvailableResult(result)) {
      this.state.receiptOperation.result = result;
      this.state.receiptOperation.confirm = false;
      const persistedReceipt = result.receipt || result.data;
      if (persistedReceipt?.receipt_id) {
        this.state.snapshot.receipts = upsertReceipt(this.state.snapshot.receipts, persistedReceipt);
        this.state.selectedReceiptId = persistedReceipt.receipt_id;
      }
    } else {
      this.state.receiptOperation.error = result;
    }
    this.state.results.receiptPersist = result;
    this.update();
  }

  renderShell() {
    return `${this.renderStyles()}${this.renderRoot()}`;
  }

  renderRoot() {
    const status = this.state.status;
    return `
      <div class="agent-supervisor" data-agent-supervisor-root data-testid="agent-supervisor-app" data-active-tab="${escapeHtml(this.state.activeTab)}" data-state="${escapeHtml(status)}" data-transport="${escapeHtml(this.state.transportMode)}">
        ${this.renderHeader()}
        ${status === 'loading' ? this.renderLoading() : ''}
        ${status === 'empty' ? this.renderEmpty() : ''}
        ${status === 'error' ? this.renderError() : ''}
        ${status !== 'loading' ? this.renderContent() : ''}
      </div>
    `;
  }

  renderHeader() {
    const { snapshot } = this.state;
    const health = snapshot.health || {};
    return `
      <header class="as-header">
        <div>
          <h2>Agent Supervisor</h2>
          <div class="as-subtitle">Goals, task queue, receipts, and MCP++ health</div>
        </div>
        <div class="as-actions" aria-label="Supervisor actions">
          <a class="as-link" href="${CONTRACT_SCHEMA_REF}" data-testid="contract-link" target="_blank" rel="noopener">Contract</a>
          <a class="as-link" href="docs/agent-supervisor-console-security-model.md" data-testid="security-link" target="_blank" rel="noopener">Security</a>
          <button type="button" data-action="refresh" data-supervisor-focusable>Refresh</button>
          <button type="button" data-action="empty" data-supervisor-focusable>Empty</button>
          <button type="button" data-action="error" data-supervisor-focusable>Error</button>
        </div>
      </header>
      <${this.state.fixtureRun?'details':'section'} class="${this.state.fixtureRun?'as-cached-health':'as-health-band'}" aria-label="${this.state.fixtureRun?'Cached board status':'Supervisor health'}" data-testid="supervisor-health">
        ${this.state.fixtureRun?`<summary>Cached board: ${escapeHtml(health.status||'unavailable')} · mode ${escapeHtml(this.state.transportMode)}</summary><div class="as-health-band">`:''}
        ${metric(this.state.fixtureRun?'Cached status':'Status', health.status || 'unavailable')}
        ${metric(this.state.fixtureRun?'Cached goals':'Active goals', String(health.active_goal_count ?? 0))}
        ${metric(this.state.fixtureRun?'Cached queue':'Queued', String(health.queued_task_count ?? 0))}
        ${metric(this.state.fixtureRun?'Cached running':'Running', String(health.running_task_count ?? 0))}
        ${metric(this.state.fixtureRun?'Cached mode':'Mode', this.state.transportMode)}
        ${this.state.fixtureRun?'</div>':''}
      </${this.state.fixtureRun?'details':'section'}>
    `;
  }

  renderLoading() {
    return `
      <section class="as-state as-loading" data-testid="supervisor-loading" aria-live="polite">
        <div class="as-spinner"></div>
        <div>
          <strong>Loading supervisor state</strong>
          <span>Reading browser-safe MCP, MCP++, and libp2p capabilities.</span>
        </div>
      </section>
    `;
  }

  renderEmpty() {
    return `
      <section class="as-state" data-testid="supervisor-empty">
        <strong>No supervisor work is queued.</strong>
        <span>Goals, queue items, receipts, and logs are all empty for this snapshot.</span>
      </section>
    `;
  }

  renderError() {
    const error = this.state.errors[0] || {};
    return `
      <section class="as-state as-error" data-testid="supervisor-error" role="alert">
        <strong>${escapeHtml(error.reason || 'unavailable')}</strong>
        <span>${escapeHtml(error.message || 'Supervisor gateway request failed.')}</span>
      </section>
    `;
  }

  renderContent() {
    const { snapshot } = this.state;
    return `
      <main class="as-layout">
        <section class="as-pane as-goals" aria-label="Goals and subgoals">
          <div class="as-pane-title">
            <h3>Goals</h3>
            <span>${snapshot.goals.length} goals</span>
          </div>
          ${this.renderGoalsTree()}
        </section>
        <section class="as-pane as-queue" aria-label="Taskboard-linked queue">
          <div class="as-pane-title">
            <h3>Queue</h3>
            <span>${snapshot.queue.length} tasks</span>
          </div>
          ${this.renderQueue()}
        </section>
        <section class="as-pane as-detail" aria-label="Active task and receipts">
          ${this.renderTabs()}
          ${this.state.activeTab === 'active' ? this.renderActiveTask() : ''}
          ${this.state.activeTab === 'dispatch' ? this.renderDispatch() : ''}
          ${this.state.activeTab === 'steering' ? this.renderSteering() : ''}
          ${this.state.activeTab === 'receipts' ? this.renderReceipts() : ''}
          ${this.state.activeTab === 'health' ? this.renderBackendHealth() : ''}
          ${this.state.activeTab === 'contract' ? this.renderContract() : ''}
        </section>
      </main>
      ${this.renderVdaG054WorkflowProof()}
    `;
  }

  renderGoalsTree() {
    const { goals, subgoals } = this.state.snapshot;
    if (!goals.length) return '<div class="as-list-empty">No goals available.</div>';
    return `
      <div class="as-tree" role="tree" data-testid="goals-tree">
        ${goals.map(goalItem => {
          const children = subgoals.filter(item => item.goal_id === goalItem.goal_id);
          return `
            <div class="as-tree-goal" role="treeitem" aria-expanded="true">
              <button type="button" class="as-row ${goalItem.goal_id === this.state.selectedGoalId ? 'is-selected' : ''}" data-goal-id="${escapeHtml(goalItem.goal_id)}" data-supervisor-focusable>
                <span class="as-status ${escapeHtml(goalItem.status)}"></span>
                <span><strong>${escapeHtml(goalItem.goal_id)}</strong>${escapeHtml(goalItem.title)}</span>
              </button>
              <div class="as-tree-children" role="group">
                ${children.map(child => `
                  <button type="button" class="as-row as-subgoal ${child.subgoal_id === this.state.selectedSubgoalId ? 'is-selected' : ''}" data-subgoal-id="${escapeHtml(child.subgoal_id)}" data-goal-id="${escapeHtml(child.goal_id)}" data-supervisor-focusable>
                    <span class="as-status ${escapeHtml(child.status)}"></span>
                    <span><strong>${escapeHtml(child.subgoal_id)}</strong>${escapeHtml(child.title)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderQueue() {
    const { queue, taskboardLinks } = this.state.snapshot;
    if (!queue.length) return '<div class="as-list-empty">No queue items available.</div>';
    return `
      <div class="as-queue-list" role="listbox" data-testid="task-queue">
        ${queue.map(task => {
          const link = taskboardLinks.find(item => item.task_id === task.task_id);
          return `
            <button type="button" role="option" aria-selected="${task.task_id === this.state.selectedTaskId}" class="as-queue-row ${task.task_id === this.state.selectedTaskId ? 'is-selected' : ''}" data-task-id="${escapeHtml(task.task_id)}" data-supervisor-focusable>
              <span class="as-status ${escapeHtml(task.status)}"></span>
              <span class="as-queue-main">
                <strong>${escapeHtml(task.task_id)}</strong>
                <span>${escapeHtml(task.title)}</span>
              </span>
              <span class="as-queue-meta">${escapeHtml(link?.source || 'supervisor')}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  renderTabs() {
    const tabs = [
      ['active', 'Active task'],
      ['dispatch', 'Dispatch'],
      ['steering', 'Steering'],
      ['receipts', 'Receipts'],
      ['health', 'Health'],
      ['contract', 'Contract'],
    ];
    return `
      <div class="as-tabs" role="tablist" data-testid="supervisor-tabs">
        ${tabs.map(([id, label]) => `
          <button type="button" role="tab" aria-selected="${this.state.activeTab === id}" class="${this.state.activeTab === id ? 'is-selected' : ''}" data-tab="${id}" data-supervisor-focusable>${label}</button>
        `).join('')}
      </div>
    `;
  }

  renderActiveTask() {
    const { queue, taskboardLinks, logs, runHistory } = this.state.snapshot;
    const task = queue.find(item => item.task_id === this.state.selectedTaskId);
    if (!task) return '<div class="as-list-empty" data-testid="active-task">No active task selected.</div>';
    const links = taskboardLinks.filter(item => item.task_id === task.task_id);
    const taskLogs = logs.filter(item => item.target_id === task.task_id || item.target_id === task.goal_id);
    const runs = runHistory.filter(item => item.task_id === task.task_id);
    return `
      <div class="as-detail-body" data-testid="active-task">
        ${this.renderNativeTaskSummary()}
        <div class="as-active-heading">
          <span class="as-status ${escapeHtml(task.status)}"></span>
          <div>
            <h3>${this.state.fixtureRun?'Cached board task ':''}${escapeHtml(task.task_id)}</h3>
            <p>${escapeHtml(task.title)}</p>
          </div>
        </div>
        <div class="as-inline-grid">
          ${metric('Goal', task.goal_id || 'unlinked')}
          ${metric('Subgoal', task.subgoal_id || 'unlinked')}
          ${metric('State', task.status)}
          ${metric('Deps', task.dependencies.length ? task.dependencies.join(', ') : 'none')}
          ${metric('Progress', `${Number(task.progress ?? 0)}%`)}
          ${metric('Assignee', task.assignee || 'unassigned')}
          ${metric('Timeout/Reassign', task.reassignment || 'within lease')}
        </div>
        <div class="as-section-line" data-testid="dependency-blocker">
          <h4>Dependency and output</h4>
          <span>${escapeHtml(this.dependencyCopy(task))}</span>
          <span>${escapeHtml(this.fixtureCopy())}</span>
          <span>${escapeHtml(this.eventCopy())}</span>
        </div>
        <div class="as-section-line">
          <h4>Taskboard links</h4>
          ${links.length ? links.map(link => `<a href="${escapeAttr(link.url)}">${escapeHtml(link.source)}: ${escapeHtml(link.title)}</a>`).join('') : '<span>No taskboard links.</span>'}
        </div>
        <div class="as-section-line">
          <h4>Run history</h4>
          ${runs.length ? runs.map(run => `<button type="button" data-receipt-id="${escapeHtml(run.receipt?.receipt_id || '')}" data-supervisor-focusable>${escapeHtml(run.run_id)} ${escapeHtml(run.status)}</button>`).join('') : '<span>No run history.</span>'}
        </div>
        <div class="as-section-line">
          <h4>Redacted logs</h4>
          ${taskLogs.length ? taskLogs.map(log => `<span>${escapeHtml(log.level)}: ${escapeHtml(log.message)}${log.redacted ? ' [redacted]' : ''}</span>`).join('') : '<span>No log entries.</span>'}
        </div>
        ${this.renderDatasetAssistance()}
      </div>
    `;
  }

  renderSteering() {
    const steering = this.state.steering;
    const review = this.buildSteeringReview();
    const result = steering.result;
    const error = steering.error;
    const modeLocal = typeof result?.receipt?.receipt_id === 'string' && result.receipt.receipt_id.startsWith('rcpt-prompt-steering-');
    const modeText = result ? (result.dry_run ? (modeLocal ? 'dry-run (local preview)' : 'dry-run') : (modeLocal ? 'confirmed — local preview, no backend call' : 'confirmed')) : '';
    const canSubmit = steering.targetId
      && steering.prompt.trim().length > 0
      && steering.prompt.trim().length <= 8000
      && (steering.dryRun || steering.confirm)
      && !steering.submitting;
    const steeringErrorId = 'agent-supervisor-steering-error';
    const promptBinding = error ? fieldErrorBinding(steeringErrorId) : '';
    const confirmBinding = error && error.reason === 'confirmation_required' ? fieldErrorBinding(steeringErrorId) : '';
    const submitDescribed = error ? ` aria-describedby="${steeringErrorId}"` : '';
    return `
      <div class="as-detail-body as-steering" data-testid="steering-panel">
        <div class="as-active-heading">
          <span class="as-status ${steering.targetId ? 'ready' : 'blocked'}"></span>
          <div>
            <h3>Prompt steering</h3>
            <p>${escapeHtml(targetLabel(steering.targetType, steering.targetId, this.state.snapshot))}</p>
          </div>
        </div>
        <label class="as-field">
          <span>Steering prompt</span>
          <textarea id="agent-supervisor-steering-prompt" data-steering-prompt maxlength="8000" data-testid="steering-prompt" spellcheck="false"${promptBinding}>${escapeHtml(steering.prompt)}</textarea>
        </label>
        <div class="as-inline-grid as-review-grid" data-testid="steering-review">
          ${metric('Normalized target', review.normalized_target)}
          ${metric('Policy class', review.policy_class)}
          ${metric('Affected tasks', review.affected_task_ids.length ? review.affected_task_ids.join(', ') : 'none')}
          ${metric('Prompt size', `${review.prompt_char_count}/${review.prompt_max_chars}`)}
        </div>
        <div class="as-section-line">
          <h4>Planned MCP action</h4>
          <code>${escapeHtml(review.planned_mcp_action.method)}</code>
          <span>${escapeHtml(review.planned_mcp_action.owner)} via ${escapeHtml(review.planned_mcp_action.transport_candidates.join(', '))}</span>
          <span>${escapeHtml(review.planned_mcp_action.input_mode)}; logs store ${escapeHtml(review.prompt_log_preview)}</span>
          <span>${escapeHtml(review.planned_mcp_action.required_policy_checks.join(', '))}</span>
        </div>
        <label class="as-confirm-line">
          <input type="checkbox" data-steering-dry-run data-testid="steering-dry-run" ${steering.dryRun ? 'checked' : ''}>
          <span>Dry run: review policy, receipt, and event-DAG output without mutating supervisor state.</span>
        </label>
        <label class="as-confirm-line">
          <input type="checkbox" id="agent-supervisor-steering-confirm" data-steering-confirm data-testid="steering-confirm" ${steering.confirm ? 'checked' : ''} ${steering.dryRun ? 'disabled' : ''}${confirmBinding}>
          <span>Confirm this governed prompt steering request for the reviewed target.</span>
        </label>
        <div class="as-actions as-steering-actions">
          <button type="button" data-action="submit-steering" data-testid="steering-submit" data-supervisor-focusable aria-disabled="${canSubmit ? 'false' : 'true'}"${submitDescribed}>${steering.submitting ? 'Submitting' : 'Submit'}</button>
        </div>
        ${error ? `
          <div class="as-state as-error" id="${steeringErrorId}" data-testid="steering-error" role="alert">
            <strong>${escapeHtml(error.reason)}</strong>
            <span>${escapeHtml(error.message)}${error.correlation_id ? ` ${escapeHtml(error.correlation_id)}` : ''}</span>
            <button type="button" data-action="recover-steering" data-testid="steering-recovery" data-supervisor-focusable>${escapeHtml(steering.recoveryAction || recoveryActionForSteeringFailure(error.reason))}</button>
          </div>
        ` : ''}
        ${result ? `
          <div class="as-steering-result" data-testid="steering-result">
            ${metric('Correlation', result.correlation_id)}
            ${metric('Receipt', result.receipt?.receipt_id || 'pending', result.receipt?.receipt_id ? '' : 'as-honest')}
            ${metric('CID', result.receipt?.cid || 'pending', result.receipt?.cid ? '' : 'as-honest')}
            ${metric('Accepted', String(result.accepted))}
            ${metric('Mode', modeText, modeLocal ? 'as-honest' : '')}
            ${metric('Policy', result.policy_class || 'unknown')}
            ${metric('Policy effect', result.policy_effects?.outcome || 'reviewed')}
            ${metric('Budget', result.policy_effects?.budget || 'not reported')}
            ${metric('Dependencies', result.policy_effects?.dependencies || 'not reported')}
            ${metric('Event DAG', result.event_dag?.cid || 'pending', result.event_dag?.cid ? '' : 'as-honest')}
            ${metric('Event', result.event_dag?.event_type || 'governed-action')}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderDispatch() {
    const task = this.state.snapshot.queue.find(item => item.task_id === this.state.selectedTaskId);
    const dispatch = this.state.dispatch;
    const result = dispatch.result;
    const error = dispatch.error;
    const unresolved = task ? unresolvedDependencyIds([task.task_id], this.state.snapshot) : [];
    const showRepair = Boolean(dispatch.recoveryNote) || unresolved.length > 0 || dispatch.error?.reason === 'dependency_blocked';
    const canSubmit = Boolean(dispatch.confirm && !dispatch.submitting);
    const completed = this.state.fixtureRun?.stages?.b?.status === 'completed' && !error;
    const dispatchErrorId = 'agent-supervisor-dispatch-error';
    const reasonBinding = error ? fieldErrorBinding(dispatchErrorId) : '';
    const confirmBinding = error && error.reason === 'confirmation_required' ? fieldErrorBinding(dispatchErrorId) : '';
    const submitDescribed = error ? ` aria-describedby="${dispatchErrorId}"` : '';
    return `
      <div class="as-detail-body as-dispatch" data-testid="dispatch-panel">
        <${completed?'details':'section'} class="as-dispatch-controls" aria-label="Native task actions" ${completed&&(dispatch.confirm||dispatch.submitting)?'open':''}>
        ${completed?'<summary>More native task actions</summary>':''}
        ${error ? `
          <div class="as-state as-error" id="${dispatchErrorId}" data-testid="dispatch-error" role="alert">
            <strong>${escapeHtml(error.reason)}</strong>
            <span>${escapeHtml(error.message)}${error.correlation_id ? ` ${escapeHtml(error.correlation_id)}` : ''}</span>
          </div>
        ` : ''}
        <label class="as-confirm-line">
          <input type="checkbox" id="agent-supervisor-dispatch-confirm" data-dispatch-confirm data-testid="dispatch-confirm" ${dispatch.confirm ? 'checked' : ''}${confirmBinding}>
          <span>Confirm the next native action. Gateway consent follows.</span>
        </label>
        <div class="as-actions as-steering-actions">
          ${showRepair ? '<button type="button" data-action="repair-blocker" data-testid="dispatch-repair" data-supervisor-focusable>Repair task A</button>' : ''}
          <button type="button" data-action="submit-dispatch" data-testid="dispatch-submit" data-supervisor-focusable aria-disabled="${canSubmit ? 'false' : 'true'}"${submitDescribed}>${dispatch.submitting ? 'Dispatching' : `Run task ${(this.state.nativeStage||'a').toUpperCase()}`}</button>
          <button type="button" data-native-retry ${!this.state.fixtureRun?.task_ids?.b?'disabled':''}>Retry task B</button>
        </div>
        </${completed?'details':'section'}>
        <div class="as-dispatch-content">
        ${this.renderNativeRun()}
        <div class="as-active-heading">
          <span class="as-status ${task ? task.status : 'blocked'}"></span>
          <div>
            <h3>Bounded native task dispatch</h3>
            <p>${escapeHtml(this.nativeTaskId() ? `Native task ${(this.state.nativeStage||'a').toUpperCase()} ${this.nativeTaskId()}` : 'Create an isolated native run; the cached board remains separate.')}</p>
            ${unresolved.length ? `<p data-testid="dispatch-named-blocker">Cached board blocker: ${escapeHtml(unresolved.join(', '))}. Heartbeat and progress percent are not completion.</p>` : ''}
          </div>
        </div>

        <div class="as-section-line" data-testid="dispatch-outcome">
          <h4>Validated output and blocker</h4>
          <span>Cached board: ${escapeHtml(task ? this.dependencyCopy(task) : 'No cached task selected.')}</span>
          <span>${escapeHtml(this.fixtureCopy())}</span>
          <span>${escapeHtml(this.eventCopy())}</span>
          ${dispatch.blockerMessage ? `<span>${escapeHtml(dispatch.blockerMessage)}</span>` : ''}
          ${dispatch.recoveryNote ? `<div><span>Retained UI action history</span><span data-testid="dispatch-recovery-note">${escapeHtml(dispatch.recoveryNote)}</span></div>` : ''}
        </div>
        <div class="as-inline-grid" data-testid="dispatch-review">
          ${metric('Action', this.state.fixtureRun?.task_ids?.a?'dispatch':'create')}
          ${metric('Policy class', 'privileged-control')}
          ${metric('Owner', 'ipfs_accelerate_py')}
          ${metric('Target', this.nativeTaskId()||'new isolated native run')}
        </div>
        <div class="as-section-line">
          <h4>Planned MCP action</h4>
          <code>WorkflowCoordinator.submit_task / get_task</code>
          <span>Structured browser-safe request; no direct file or process access.</span>
          <span>Checks target authorization, dependencies, confirmation, execution budget, receipt persistence, and event-DAG append.</span>
        </div>
        <label class="as-field">
          <span>Local operator note</span>
          <textarea id="agent-supervisor-dispatch-reason" data-dispatch-reason data-testid="dispatch-reason" maxlength="1000" spellcheck="false"${reasonBinding}>${escapeHtml(dispatch.reason)}</textarea>
        </label>
        <div class="as-section-line">
          <span>${escapeHtml(this.reassignmentCopy())}</span>
          <span>${escapeHtml(this.eventCopy())}</span>
        </div>
        ${result ? `
          <div class="as-steering-result" data-testid="dispatch-result">
            ${metric('Correlation', result.correlation_id)}
            ${metric('Receipt', result.receipt?.receipt_id || 'pending')}
            ${metric('CID', result.receipt?.cid || 'pending')}
            ${metric('Validated output', String(result.accepted))}
            ${metric('Policy', result.policy_class || 'privileged-control')}
            ${metric('Event DAG', result.event_dag?.cid || 'pending')}
            ${metric('Event', result.event_dag?.event_type || 'task-dispatched')}
            ${metric('Run', result.run_id || 'unpublished')}
            ${metric('Output', result.output_sha256 || 'unpublished until validated')}
            ${metric('Completion', result.note || 'Heartbeat is not completion')}
            ${metric('Native state', result.native_status || 'unknown')}
          </div>
        ` : ''}
        </div>
        ${this.renderNativeActions()}
      </div>
    `;
  }

  renderReceipts() {
    const { receipts } = this.state.snapshot;
    const selected = receipts.find(item => item.receipt_id === this.state.selectedReceiptId) || receipts[0];
    const operation = this.state.receiptOperation;
    const operationResult = operation.result;
    const operationError = operation.error;
    return `
      <div class="as-detail-body" data-testid="receipt-view">
        <div class="as-receipt-list">
          ${receipts.length ? receipts.map(item => `
            <button type="button" class="${selected?.receipt_id === item.receipt_id ? 'is-selected' : ''}" data-receipt-id="${escapeHtml(item.receipt_id)}" data-supervisor-focusable>
              <strong>${escapeHtml(item.receipt_id)}</strong>
              <span class="${item.cid ? '' : 'as-honest'}">${escapeHtml(item.cid || 'pending-cid')}</span>
            </button>
          `).join('') : '<div class="as-list-empty">No receipts available.</div>'}
        </div>
        ${selected ? `
          <div class="as-receipt-detail">
            ${metric('Receipt', selected.receipt_id)}
            ${metric('CID', selected.cid || 'pending', selected.cid ? '' : 'as-honest')}
            ${metric('Owner', selected.owner)}
            ${metric('Created', selected.created_at || 'unknown', selected.created_at ? '' : 'as-honest')}
          </div>
          <label class="as-confirm-line">
            <input type="checkbox" data-receipt-operation-confirm data-testid="receipt-operation-confirm" ${operation.confirm ? 'checked' : ''} ${operation.loading ? 'disabled' : ''}>
            <span>Confirm persistence or event-DAG checkpoint for this selected receipt.</span>
          </label>
          <div class="as-actions as-receipt-actions">
            <button type="button" data-action="persist-receipt" data-testid="receipt-persist" data-supervisor-focusable ${operation.loading || !operation.confirm ? 'disabled' : ''}>${operation.loading ? 'Working' : 'Persist receipt'}</button>
            <button type="button" data-action="retrieve-receipt-content" data-testid="receipt-retrieve" data-supervisor-focusable ${operation.loading ? 'disabled' : ''}>${operation.loading ? 'Working' : 'Retrieve content'}</button>
            <button type="button" data-action="checkpoint-receipt" data-testid="receipt-checkpoint" data-supervisor-focusable ${operation.loading || !operation.confirm ? 'disabled' : ''}>Checkpoint event-DAG</button>
          </div>
          <div class="as-section-line" data-testid="receipt-operation-evidence">
            <h4>Receipt operation evidence</h4>
            ${operationResult ? `
              ${metric('Operation', operation.operation || 'unknown')}
              ${metric('Owner', operationResult.owner || 'ipfs_kit_py')}
              ${metric('Transport', operationResult.runtime?.transport || 'unobserved', operationResult.runtime?.transport ? '' : 'as-honest')}
              ${metric('Policy', operationResult.runtime?.policy_outcome || operationResult.policy_class || 'unobserved', (operationResult.runtime?.policy_outcome || operationResult.policy_class) ? '' : 'as-honest')}
              ${metric('CID', operationResult.runtime?.event_dag_cid || operationResult.runtime?.content_cid || operationResult.receipt?.cid || 'no-cid', (operationResult.runtime?.event_dag_cid || operationResult.runtime?.content_cid || operationResult.receipt?.cid) ? '' : 'as-honest')}
              ${metric('Event DAG', operationResult.runtime?.event_dag_cid || operationResult.data?.cid || operationResult.data?.event_dag?.cid || 'no-checkpoint', (operationResult.runtime?.event_dag_cid || operationResult.data?.cid || operationResult.data?.event_dag?.cid) ? '' : 'as-honest')}
              ${metric('Failure', operationResult.runtime?.failure_code || 'none')}
            ` : '<span>Persist, retrieve, or checkpoint the selected receipt to record mediated kit or browser-Helia evidence.</span>'}
            ${operationError ? `<span role="alert">${escapeHtml(operationError.reason || operationError.state || 'unavailable')}: ${escapeHtml(operationError.message || 'Receipt operation failed.')}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderBackendHealth() {
    const backends = this.state.snapshot.health?.backends || [];
    return `
      <div class="as-detail-body" data-testid="backend-health">
        <div class="as-backends">
          ${backends.length ? backends.map(item => `
            <div class="as-backend-row">
              <span class="as-status ${escapeHtml(item.status)}"></span>
              <strong>${escapeHtml(item.owner)}</strong>
              <span>${escapeHtml(item.transport)}</span>
              <span class="${item.receipt?.receipt_id ? '' : 'as-honest'}">${escapeHtml(item.receipt?.receipt_id || 'no-receipt')}</span>
              <span class="${item.receipt?.cid ? '' : 'as-honest'}">${escapeHtml(item.receipt?.cid || 'no-cid')}</span>
            </div>
          `).join('') : '<div class="as-list-empty">No backends reported.</div>'}
        </div>
        <div class="as-section-line">
          <h4>MCP++ / libp2p</h4>
          <span>Read transports: ${escapeHtml(uniqueTransports(this.contract.capabilities).join(', '))}</span>
        </div>
        ${this.renderGatewayEvidence()}
      </div>
    `;
  }

  renderGatewayEvidence() {
    const results = Object.values(this.state.results || {});
    const rows = results.length
      ? results.map(result => {
        const state = result?.state || 'unavailable';
        const reason = result?.reason || result?.runtime?.failure_code || result?.data?.evidence_path || result?.data?.transport_path?.path || state;
        const correlation = result?.correlation_id || 'uncorrelated';
        const receiptId = result?.receipt?.receipt_id || result?.data?.receipt?.receipt_id || 'no-receipt';
        const cid = result?.runtime?.content_cid || result?.receipt?.cid || result?.data?.receipt?.cid || 'no-cid';
        const transport = result?.runtime?.transport || result?.transport || 'unobserved';
        const policy = result?.runtime?.policy_outcome || result?.policy_class || 'unobserved';
        return `
          <div class="as-gateway-row">
            <span class="as-status ${escapeHtml(state === 'available' ? 'available' : 'unavailable')}"></span>
            <strong>${escapeHtml(result?.capability_id || 'unknown-capability')}</strong>
            <span>${escapeHtml(result?.owner || 'unknown-owner')}</span>
            <span class="${state === 'available' ? '' : 'as-honest'}">${escapeHtml(state)}</span>
            <span>${escapeHtml(reason)}</span>
            <span class="${transport === 'unobserved' ? 'as-honest' : ''}">${escapeHtml(transport)}</span>
            <span class="${policy === 'unobserved' ? 'as-honest' : ''}">${escapeHtml(policy)}</span>
            <span class="${correlation === 'uncorrelated' ? 'as-honest' : ''}">${escapeHtml(correlation)}</span>
            <span class="${receiptId === 'no-receipt' ? 'as-honest' : ''}">${escapeHtml(receiptId)}</span>
            <span class="${cid === 'no-cid' ? 'as-honest' : ''}">${escapeHtml(cid)}</span>
          </div>
        `;
      }).join('')
      : this.state.errors.map(error => `
        <div class="as-gateway-row">
          <span class="as-status unavailable"></span>
          <strong>${escapeHtml(error.capability_id || 'unknown-capability')}</strong>
          <span>unknown-owner</span>
          <span>unavailable</span>
          <span>${escapeHtml(error.reason || 'not_configured')}</span>
          <span>uncorrelated</span>
          <span>no-receipt</span>
        </div>
      `).join('');

    return `
      <div class="as-section-line" data-testid="gateway-evidence">
        <h4>Gateway evidence</h4>
        <div class="as-gateway-table">
          <div class="as-gateway-row as-gateway-head">
            <span></span>
            <strong>Capability</strong>
            <span>Owner</span>
            <span>State</span>
            <span>Path</span>
            <span>Transport</span>
            <span>Policy</span>
            <span>Correlation</span>
            <span>Receipt</span>
            <span>CID</span>
          </div>
          ${rows || '<span>No gateway evidence recorded.</span>'}
        </div>
      </div>
    `;
  }

  renderContract() {
    return `
      <div class="as-detail-body" data-testid="contract-view">
        <div class="as-inline-grid">
          ${metric('Schema', this.contract.schema)}
          ${metric('Version', this.contract.version)}
          ${metric('Capabilities', String(this.contract.capabilities.length))}
          ${metric('Browser safe', String(this.contract.browser_safe))}
        </div>
        <div class="as-section-line">
          <h4>Backend owners</h4>
          ${this.contract.owners.map(owner => `<span>${escapeHtml(owner.owner)}: ${escapeHtml(owner.responsibility)}</span>`).join('')}
        </div>
        <div class="as-section-line">
          <h4>Forbidden browser surfaces</h4>
          ${this.contract.forbidden_browser_surfaces.map(surface => `<code>${escapeHtml(surface)}</code>`).join('')}
        </div>
      </div>
    `;
  }

  renderDatasetAssistance() {
    const policy = this.state.snapshot.policyAssist;
    const semantic = this.state.snapshot.semanticGoalAssist;
    const describe = value => {
      if (!value) return 'No live dataset assistance returned.';
      if (typeof value === 'string') return value;
      const text = value.summary || value.message || value.policy_result || value.semantic_goal || value.goal || value.title;
      return text ? String(text) : JSON.stringify(value).slice(0, 420);
    };
    return `
      <div class="as-section-line" data-testid="dataset-assistance">
        <h4>Dataset assistance</h4>
        <span><strong>Policy:</strong> ${escapeHtml(describe(policy))}</span>
        <span><strong>Semantic goal:</strong> ${escapeHtml(describe(semantic))}</span>
        <span>Owner: ipfs_datasets_py; every result and failure is listed in Gateway evidence.</span>
      </div>
    `;
  }

  renderVdaG054WorkflowProof() {
    const { snapshot } = this.state;
    // Checkpoint/receipt refs render only when the current snapshot carries
    // them (the designed full-fallback SAMPLE snapshot does). A live
    // snapshot carries no vdaG054 refs, so none may be rendered as if live.
    const proof = snapshot.vdaG054;
    const checkpointRefs = Array.isArray(proof?.checkpoint_refs) ? proof.checkpoint_refs : [];
    const receiptRefs = Array.isArray(proof?.receipt_refs) ? proof.receipt_refs : [];
    const refText = index => {
      const refs = [checkpointRefs[index], receiptRefs[index]].filter(Boolean);
      return refs.length ? `${refs.join(' ')} ` : '';
    };
    const selectedTask = snapshot.queue.find(item => item.task_id === this.state.selectedTaskId) || snapshot.queue[0] || {};
    const review = this.buildSteeringReview();
    const owners = this.contract.owners.map(owner => owner.owner).join(', ');
    const taskboardCount = snapshot.taskboardLinks.length;
    const receiptCount = snapshot.receipts.length;
    const progressSummary = snapshot.queue.map(task => `${task.task_id}:${Number(task.progress ?? 0)}%`).join(' ');
    const reassignment = snapshot.queue.find(task => task.reassignment) || selectedTask;
    return `
      <details class="as-workflow-proof" data-svd-workflow="agent-supervisor.steer-goals-subgoals-dispatch" data-testid="agent-supervisor-vda-g054">
        <summary>Workflow evidence</summary>
        <div class="as-workflow-proof-head">
          <h3>VDA-G054 workflow evidence</h3>
          <span>Bounded goal steering, dispatch, K/D/A receipts, timeout recovery, and taskboard visibility.</span>
        </div>
        <div class="as-proof-actions" aria-label="Agent Supervisor workflow proof actions">
          ${workflowActionButton('inspect-goal-graph', 'Goal graph')}
          ${workflowActionButton('preview-steering-prompt', 'Prompt preview')}
          ${workflowActionButton('open-taskboard-links', 'Taskboard links')}
          ${workflowActionButton('confirm-policy', 'Policy confirmation')}
          ${workflowActionButton('inspect-kda-evidence', 'K/D/A evidence')}
          ${workflowActionButton('track-progress', 'Progress')}
          ${workflowActionButton('simulate-timeout-reassignment', 'Timeout reassignment')}
          ${workflowActionButton('open-receipt-visibility', 'Receipts')}
        </div>
        <div class="as-proof-grid">
          <div data-svd-vda-marker="goal-subgoal-graph">
            <strong>Goal/subgoal graph</strong>
            <span>${refText(0)}${snapshot.goals.length} goals, ${snapshot.subgoals.length} subgoals, selected ${escapeHtml(this.state.selectedGoalId)} -> ${escapeHtml(this.state.selectedSubgoalId)}.</span>
          </div>
          <div data-svd-vda-marker="prompt-preview">
            <strong>Prompt preview</strong>
            <span>${refText(1)}normalized target ${escapeHtml(review.normalized_target)}; planned MCP action ${escapeHtml(review.planned_mcp_action.method)}; prompt_log_preview ${escapeHtml(review.prompt_log_preview)}; structured-json-payload.</span>
          </div>
          <div data-svd-vda-marker="taskboard-links">
            <strong>Taskboard links</strong>
            <span>${refText(2)}${taskboardCount} taskboard links include ${escapeHtml((snapshot.taskboardLinks[0]?.url || selectedTask.taskboard_url || '#task/unselected'))}; queue records remain linked to goals and subgoals.</span>
          </div>
          <div data-svd-vda-marker="policy-confirmation">
            <strong>Policy confirmation</strong>
            <span>${refText(3)}confirmation_required policy class ${escapeHtml(review.policy_class)} checks ${escapeHtml(review.planned_mcp_action.required_policy_checks.join(', '))}; governed writes stay dry-run or confirmed.</span>
          </div>
          <div data-svd-vda-marker="kda-evidence">
            <strong>K/D/A evidence</strong>
            <span>${refText(4)}K ipfs_kit_py task receipts/event DAG; D ipfs_datasets_py goal and policy reasoning; A ipfs_accelerate_py queue, scheduler, and workers; owners ${escapeHtml(owners)}.</span>
          </div>
          <div data-svd-vda-marker="progress">
            <strong>Progress</strong>
            <span>${refText(5)}progress ${escapeHtml(progressSummary || 'empty queue')}; selected task ${escapeHtml(selectedTask.task_id || 'none')} state ${escapeHtml(selectedTask.status || 'empty')}.</span>
          </div>
          <div data-svd-vda-marker="timeout-reassignment">
            <strong>Timeout/reassignment</strong>
            <span>${refText(6)}timeout and reassignment path ${escapeHtml(reassignment?.reassignment || 'within lease')}; assignee ${escapeHtml(reassignment?.assignee || 'unassigned')}.</span>
          </div>
          <div data-svd-vda-marker="receipt-visibility">
            <strong>Receipt visibility</strong>
            <span>${refText(7)}${receiptCount} receipts visible; selected ${escapeHtml(this.state.selectedReceiptId || 'none')}; event-DAG checkpoint and receipt retrieval controls are visible.</span>
          </div>
        </div>
      </details>
    `;
  }

  renderStyles() {
    return `
      <style>
        .agent-supervisor { height: 100%; width: 100%; max-height: 100%; min-height: 0; display: flex; flex-direction: column; background: #0e1412; color: #edf7f2; font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; overscroll-behavior: none; container-type: inline-size; container-name: asapp; }
        .agent-supervisor * { box-sizing: border-box; }
        .as-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-bottom: 1px solid #263a34; background: #12211d; }
        .as-header h2, .as-pane-title h3, .as-active-heading h3 { margin: 0; letter-spacing: 0; }
        .as-header h2 { font-size: 16px; font-weight: 650; }
        .as-pane-title h3 { font-size: 13px; font-weight: 650; }
        .as-subtitle, .as-pane-title span, .as-state span, .as-section-line span, .as-active-heading p { color: #a8bbb2; }
        .as-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .as-actions button, .as-actions a, .as-tabs button, .as-row, .as-queue-row, .as-receipt-list button, .as-section-line button, .as-state button { border: 1px solid #315248; background: #173029; color: #edf7f2; border-radius: 6px; padding: 7px 10px; min-height: 32px; text-decoration: none; cursor: pointer; }
        .as-actions button:disabled { color: #7c8f87; border-color: #263a34; background: #121b18; cursor: not-allowed; }
        .as-actions button[aria-disabled="true"] { color: #9eb2aa; border-color: #315248; }
        .as-actions button:hover, .as-actions a:hover, .as-tabs button:hover, .as-row:hover, .as-queue-row:hover, .as-receipt-list button:hover, .as-section-line button:hover, .as-state button:hover { border-color: #5fb99d; }
        .as-actions button:focus-visible, .as-actions a:focus-visible, .as-tabs button:focus-visible, .as-row:focus-visible, .as-queue-row:focus-visible, .as-receipt-list button:focus-visible, .as-section-line button:focus-visible, .as-state button:focus-visible, .as-proof-actions button:focus-visible { outline: 2px solid #8bd8bd; outline-offset: 2px; }
        .as-cached-health { flex-shrink: 0; border-bottom: 1px solid #263a34; background: #15241e; }
        .as-cached-health > summary { padding: 7px 12px; cursor: pointer; font-size: 12px; line-height: 1.35; color: #bfcbc4; }
        .as-cached-health > summary:focus-visible { outline: 2px solid #8bd8bd; outline-offset: -2px; }
        .as-health-band, .as-inline-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 1px; background: #263a34; border-bottom: 1px solid #263a34; }
        .as-metric { background: #101b18; padding: 10px 12px; min-width: 0; }
        .as-metric span { display: block; color: #91a79d; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
        .as-metric strong { display: block; overflow-wrap: break-word; word-break: normal; font-size: 13px; max-width: 100%; }
        .as-layout { display: flex; flex-direction: column; gap: 1px; background: #263a34; flex: 1 1 auto; min-height: 0; overflow: hidden; overscroll-behavior: contain; }
        .as-pane { background: #0e1412; min-width: 0; min-height: 0; overflow: auto; }
        .as-pane.as-detail { order: -1; flex: 1 1 16rem; display: flex; flex-direction: column; overflow: hidden; min-height: 16rem; }
        .as-pane.as-goals, .as-pane.as-queue { flex: 0 0 auto; max-height: 12rem; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; }
        .agent-supervisor[data-active-tab="dispatch"] .as-pane.as-goals,
        .agent-supervisor[data-active-tab="dispatch"] .as-pane.as-queue { display: none; }
        .agent-supervisor[data-active-tab="dispatch"] .as-pane.as-detail { flex: 1 1 0; min-height: 0; }
        .as-pane-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid #263a34; background: #101b18; }
        .as-tree, .as-queue-list, .as-detail-body, .as-backends { display: grid; gap: 12px; padding: 12px; align-content: start; }
        .as-detail-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding-bottom: 24px; }
        .as-detail-body.as-dispatch { display: flex; flex-direction: column; gap: 0; padding: 0; overflow: hidden; }
        .as-dispatch-controls { flex: 0 0 auto; display: grid; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #315248; background: #12211d; }
        .as-dispatch-controls .as-confirm-line { padding: 6px 8px; }
        .as-dispatch-controls .as-state { display: block; margin: 0; padding: 6px 8px; font-size: 12px; }
        .as-dispatch-controls .as-state span { display: block; overflow-wrap: anywhere; }
        .as-dispatch-controls .as-actions button { padding: 6px 8px; }
        .as-dispatch-controls > summary { cursor: pointer; }
        .as-dispatch-content { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; gap: 12px; padding: 8px 12px 24px; align-content: start; }
        .as-dispatch-toolbar { flex: 0 0 auto; padding: 8px 12px; border-top: 1px solid #315248; background: #12211d; }
        .as-dispatch-toolbar button { padding: 6px 8px; }
        [data-native-run] { gap: 6px; padding-top: 0; border-top: 0; }
        .as-native-identity { gap: 3px; }
        .as-native-identity input { width: 100%; min-width: 0; height: 32px; border: 1px solid #315248; border-radius: 4px; padding: 6px 8px; background: #101b18; color: #edf7f2; font: 12px/1.4 monospace; user-select: all; }
        .as-native-identity input:focus-visible { outline: 2px solid #8bd8bd; outline-offset: 2px; }
        .as-native-status { display: flex; gap: 8px 20px; flex-wrap: wrap; }
        .as-native-stage-results { display: grid; gap: 8px; }
        .as-native-stage-result { display: grid; gap: 2px; min-width: 0; font-size: 12px; }
        .as-native-stage-result code { font: 11px/1.35 monospace; user-select: all; }
        .as-tree-children { display: grid; gap: 6px; margin: 6px 0 10px 18px; }
        .as-row, .as-queue-row { width: 100%; display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 9px; text-align: left; }
        .as-subgoal { grid-template-columns: 10px minmax(0, 1fr); background: #101b18; }
        .as-row strong, .as-queue-main strong { display: block; color: #8bd8bd; font-size: 11px; }
        .as-row span:last-child, .as-queue-main span { overflow-wrap: anywhere; }
        .as-queue-main { min-width: 0; }
        .as-queue-meta { color: #9eb2aa; font-size: 11px; }
        .is-selected { border-color: #8bd8bd !important; background: #1b3d34 !important; }
        .as-status { width: 10px; height: 10px; border-radius: 50%; background: #7e8d87; display: inline-block; }
        .as-status.healthy, .as-status.available, .as-status.ready, .as-status.completed { background: #5ee3a1; }
        .as-status.running, .as-status.waiting, .as-status.degraded { background: #ffd166; }
        .as-status.blocked, .as-status.failed, .as-status.unavailable { background: #ff6b6b; }
        .as-tabs { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 1px; background: #263a34; border-bottom: 1px solid #263a34; overflow: visible; }
        .as-tabs button { flex: 0 0 auto; white-space: nowrap; border-radius: 0; border: 0; border-right: 1px solid #263a34; }
        .as-tabs button.is-selected { box-shadow: inset 0 0 0 2px #8bd8bd; }
        .as-active-heading { display: flex; align-items: flex-start; gap: 10px; padding: 4px 0 8px; min-width: 0; }
        .as-active-heading > div { min-width: 0; }
        .as-active-heading h3, .as-active-heading p { overflow-wrap: break-word; }
        .as-active-heading .as-status { margin-top: 5px; flex: none; }
        .as-active-heading p { margin: 4px 0 0; }
        .as-detail .as-inline-grid { grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); border: 1px solid #263a34; }
        .as-section-line { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid #263a34; align-content: start; min-width: 0; max-width: 100%; }
        .as-section-line > * { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
        .as-section-line h4 { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #a8bbb2; }
        .as-section-line a { color: #8bd8bd; overflow-wrap: anywhere; }
        .as-section-line code { background: #17241f; border: 1px solid #263a34; border-radius: 4px; padding: 4px 6px; overflow-wrap: anywhere; }
        .as-field { display: grid; gap: 6px; }
        .as-field > span { color: #a8bbb2; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
        .as-field textarea { min-height: 64px; resize: vertical; border: 1px solid #315248; border-radius: 6px; background: #101b18; color: #edf7f2; padding: 10px; font: inherit; width: 100%; }
        .as-field textarea:focus-visible { outline: 2px solid #8bd8bd; outline-offset: 2px; }
        .as-confirm-line { display: flex; align-items: flex-start; gap: 10px; border: 1px solid #4a3d24; border-left: 3px solid #ffd166; border-radius: 6px; background: rgba(255, 209, 102, 0.07); padding: 10px 12px; }
        .as-confirm-line input { margin-top: 3px; flex: none; accent-color: #ffd166; }
        .as-confirm-line input:focus-visible { outline: 2px solid #8bd8bd; outline-offset: 2px; }
        .as-confirm-line span { color: #edf7f2; }
        .as-steering-actions { justify-content: flex-start; }
        .as-steering-result { display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 1px; background: #263a34; border: 1px solid #263a34; border-radius: 6px; overflow: hidden; }
        .as-receipt-list { display: grid; gap: 6px; align-content: start; }
        .as-receipt-list button { display: grid; gap: 2px; text-align: left; }
        .as-receipt-list span { color: #9eb2aa; overflow-wrap: anywhere; }
        .as-receipt-detail { display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 1px; background: #263a34; border: 1px solid #263a34; border-radius: 6px; overflow: hidden; margin-top: 8px; }
        .as-backend-row { display: grid; grid-template-columns: 10px minmax(150px, 1fr) minmax(70px, auto) minmax(120px, 1fr); gap: 10px; align-items: center; border-bottom: 1px solid #263a34; padding: 8px 0; min-width: 0; }
        .as-backend-row span:last-child { overflow-wrap: anywhere; color: #9eb2aa; }
        .as-gateway-table { display: grid; gap: 1px; background: #263a34; border: 1px solid #263a34; border-radius: 6px; overflow-x: auto; }
        .as-gateway-table > span { padding: 10px 12px; color: #a8bbb2; }
        .as-gateway-row { display: grid; grid-template-columns: 10px minmax(190px, 1.2fr) minmax(120px, 0.8fr) minmax(86px, 0.6fr) minmax(130px, 0.8fr) minmax(80px, .55fr) minmax(90px, .65fr) minmax(150px, 1fr) minmax(120px, .8fr) minmax(120px, .8fr); gap: 8px; align-items: center; min-width: 1280px; background: #101b18; padding: 8px 10px; }
        .as-gateway-row span, .as-gateway-row strong { overflow-wrap: anywhere; min-width: 0; }
        .as-gateway-row span { color: #a8bbb2; }
        .as-gateway-row strong { color: #edf7f2; font-weight: 600; }
        .as-gateway-head { background: #17241f; }
        .as-gateway-head span, .as-gateway-head strong { color: #91a79d; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
        .as-workflow-proof { display: grid; gap: 12px; padding: 12px; border-top: 1px solid #263a34; background: #101b18; flex: 0 1 auto; min-height: 0; max-height: 32%; overflow: auto; overscroll-behavior: contain; }
        .as-workflow-proof > summary { cursor: pointer; color: #edf7f2; }
        .as-workflow-proof-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .as-workflow-proof-head h3 { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: 0; }
        .as-workflow-proof-head span { color: #a8bbb2; }
        .as-proof-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .as-proof-actions button { border: 1px solid #315248; background: #173029; color: #edf7f2; border-radius: 6px; padding: 6px 9px; min-height: 30px; cursor: pointer; }
        .as-proof-grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 1px; background: #263a34; border: 1px solid #263a34; border-radius: 6px; overflow: hidden; }
        .as-proof-grid > div { display: grid; gap: 4px; background: #0e1412; padding: 10px 12px; min-width: 0; align-content: start; }
        .as-proof-grid strong { color: #8bd8bd; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
        .as-proof-grid span { color: #a8bbb2; overflow-wrap: anywhere; }
        .as-state { margin: 12px; padding: 12px; border: 1px solid #315248; background: #101b18; border-radius: 6px; display: flex; align-items: center; gap: 10px; }
        .as-error { border-color: #8c3d3d; background: #231312; }
        .as-spinner { width: 20px; height: 20px; border: 3px solid #315248; border-top-color: #8bd8bd; border-radius: 50%; animation: as-spin 900ms linear infinite; flex: none; }
        .as-list-empty { padding: 12px; color: #a8bbb2; font-size: 12px; }
        .as-honest { color: #ffd166; }
        span.as-honest, .as-metric.as-honest strong, .as-receipt-list span.as-honest { color: #ffd166; }
        @keyframes as-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .as-spinner { animation: none; }
        }
        @media (max-width: 1024px) {
          .as-layout { grid-template-columns: 1fr; }
          .as-health-band { grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); }
          .as-detail .as-inline-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-steering-result { grid-template-columns: 1fr; }
          .as-receipt-detail { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .agent-supervisor { min-height: 0; }
          .as-header { align-items: flex-start; flex-direction: column; }
          .as-inline-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-layout { display: flex; flex-direction: column; }
          .as-pane.as-goals, .as-pane.as-queue { max-height: 6.5rem; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; }
          .as-pane.as-detail { min-height: 0; flex: 1 1 auto; }
          .agent-supervisor[data-active-tab="dispatch"] .as-pane.as-goals,
          .agent-supervisor[data-active-tab="dispatch"] .as-pane.as-queue { display: none; }
          .agent-supervisor[data-active-tab="dispatch"] .as-pane.as-detail { flex: 1 1 0; min-height: 0; }
          .as-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: visible; }
          .as-tabs button { min-width: 0; }
          .as-steering-result { grid-template-columns: 1fr; }
          .as-backend-row { grid-template-columns: 10px minmax(0, 1fr); }
          .as-backend-row span { overflow-wrap: anywhere; }
          .as-gateway-row { min-width: 1080px; }
          .as-proof-grid { grid-template-columns: 1fr; }
        }
        @container asapp (max-width: 860px) {
          .as-layout { grid-template-columns: 1fr; }
          .as-header { align-items: flex-start; flex-direction: column; }
          .as-inline-grid, .as-detail .as-inline-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-tabs { flex-wrap: wrap; overflow: visible; }
          .as-tabs button { flex: 1 1 auto; }
          .as-proof-grid, .as-steering-result, .as-receipt-detail { grid-template-columns: 1fr; }
        }
      </style>
    `;
  }

  revealInPane(paneSelector, rowSelector) {
    const pane = this.container?.querySelector(paneSelector);
    const row = this.container?.querySelector(rowSelector);
    if (!pane || !row || typeof row.getBoundingClientRect !== 'function') return;
    const paneBox = pane.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (rowBox.height > paneBox.height || rowBox.top < paneBox.top) pane.scrollTop -= paneBox.top - rowBox.top;
    else if (rowBox.bottom > paneBox.bottom) pane.scrollTop += rowBox.bottom - paneBox.bottom;
  }
}

export async function mountSwissKnifeApp(container, options = {}) {
  const app = new AgentSupervisorApp(options.desktop || null, options);
  container.innerHTML = app.renderShell();
  app.bind(container);
  await app.refresh({ silent: false });
  window.agentSupervisorApp = app;
  return app;
}

export { AGENT_SUPERVISOR_CONTRACT };
export const AgentSupervisorConsole = AgentSupervisorApp;
export default AgentSupervisorApp;

function capability(id, title, access, owner, policyClass, transports, method, receiptRequired) {
  return {
    id,
    title,
    access,
    owner,
    policy_class: policyClass,
    transports,
    method,
    input_ref: '#/$defs/listRequest',
    output_ref: '#/$defs/gatewayResult',
    receipt_required: receiptRequired,
    description: `${title} through the browser-safe Agent Supervisor gateway.`,
  };
}

function backend(owner, status, transport, receiptId) {
  return { owner, status, transport, receipt: receipt(receiptId, `bafy${receiptId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`) };
}

function receipt(receiptId, cid, createdAt = '2026-07-10T12:00:00.000Z') {
  return { receipt_id: receiptId, cid, owner: 'ipfs_kit_py', created_at: createdAt };
}

function goal(goalId, title, status, subgoalIds, taskIds) {
  return { goal_id: goalId, title, status, subgoal_ids: subgoalIds, task_ids: taskIds, taskboard_url: `#goal/${goalId}`, receipt: receipt(`rcpt-goal-${goalId}`, `bafygoal${goalId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`) };
}

function subgoal(subgoalId, goalId, title, status, taskIds) {
  return { subgoal_id: subgoalId, goal_id: goalId, title, status, task_ids: taskIds, taskboard_url: `#subgoal/${subgoalId}`, receipt: receipt(`rcpt-subgoal-${subgoalId}`, `bafysubgoal${subgoalId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`) };
}

function queueItem(taskId, title, status, goalId, subgoalId, dependencies, progress = 0, assignee = 'unassigned', reassignment = null) {
  return { task_id: taskId, title, status, goal_id: goalId, subgoal_id: subgoalId, taskboard_url: `#task/${taskId}`, dependencies, progress, assignee, reassignment, receipt: receipt(`rcpt-task-${taskId}`, `bafytask${taskId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`) };
}

function taskboardLink(taskId, source, url, title, status) {
  return { task_id: taskId, source, url, title, status };
}

function logEntry(logId, level, message, scope, targetId, redacted) {
  return { log_id: logId, level, message, created_at: '2026-07-10T12:00:00.000Z', scope, target_id: targetId, redacted, receipt: receipt(`rcpt-${logId}`, `bafy${logId}`) };
}

function runRecord(runId, goalId, subgoalId, taskId, status, receiptId) {
  return { run_id: runId, goal_id: goalId, subgoal_id: subgoalId, task_id: taskId, status, started_at: '2026-07-10T12:00:00.000Z', receipt: receipt(receiptId, `bafy${receiptId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`) };
}

function metric(label, value, cls = '') {
  const extra = cls ? ` ${cls}` : '';
  const readable = escapeHtml(value).replace(/([_:-])/g, '$1<wbr>');
  return `<div class="as-metric${extra}"><span>${escapeHtml(label)}</span><strong>${readable}</strong></div>`;
}

function workflowActionButton(action, label) {
  return `<button type="button" data-svd-workflow-action="${escapeHtml(action)}" data-supervisor-focusable>${escapeHtml(label)}</button>`;
}

function resolveBrowserGateway() {
  if (typeof window === 'undefined') return null;
  return window.agentSupervisorGateway
    || window.swissknifeAgentSupervisorGateway
    || window.__agentSupervisorGateway
    || null;
}

function resolveGatewayEndpoint() {
  if (typeof window === 'undefined') return '';
  return window.__AGENT_SUPERVISOR_GATEWAY_ENDPOINT__ || '';
}

function normalizeGatewayResult(invocation, value) {
  if (value && typeof value === 'object' && value.state === 'available' && 'data' in value) {
    return {
      state: 'available',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      data: value.data,
      receipt: value.receipt,
      correlation_id: value.correlation_id || invocation.correlation_id,
      observed_at: value.observed_at,
      runtime: normalizeRuntimeObservation(value.runtime),
    };
  }
  if (value && typeof value === 'object' && value.state === 'denied') {
    return {
      state: 'denied',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      reason: value.reason || 'policy_denied',
      message: value.message || 'Agent Supervisor request was denied.',
      policy_class: invocation.policy_class,
      correlation_id: value.correlation_id || invocation.correlation_id,
      recovery_action: isSafeRuntimeIdentifier(value.recovery_action) ? value.recovery_action : undefined,
      runtime: normalizeRuntimeObservation(value.runtime),
    };
  }
  if (value && typeof value === 'object' && value.state === 'unavailable') {
    return unavailable({
      ...invocation,
      correlation_id: value.correlation_id || invocation.correlation_id,
    }, value.reason || 'capability_unavailable', value.message || 'Agent Supervisor capability is unavailable.',
    normalizeRuntimeObservation(value.runtime));
  }
  return unavailable(invocation, 'capability_unavailable', 'Agent Supervisor gateway returned an unsupported response shape.');
}

function unavailable(invocation, reason, message, runtime = null) {
  const result = {
    state: 'unavailable',
    capability_id: invocation.capability_id,
    owner: invocation.owner,
    reason,
    message,
    correlation_id: invocation.correlation_id,
  };
  if (runtime) result.runtime = runtime;
  return result;
}

// Runtime observations originate at the mediated gateway.  Keep only the
// browser-safe identifiers the console is allowed to expose; endpoint URLs,
// host paths, credentials, and arbitrary transport payloads never enter UI
// state or the evidence table.
function normalizeRuntimeObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const runtime = {};
  if (value.transport === 'http' || value.transport === 'libp2p' || value.transport === 'browser-helia') {
    runtime.transport = value.transport;
  }
  if (value.policy_outcome === 'allow' || value.policy_outcome === 'deny' || value.policy_outcome === 'require_confirmation') {
    runtime.policy_outcome = value.policy_outcome;
  }
  for (const key of ['binding_id', 'content_cid', 'event_dag_cid', 'failure_code', 'recovery_action']) {
    if (isSafeRuntimeIdentifier(value[key])) runtime[key] = value[key];
  }
  return Object.keys(runtime).length ? runtime : undefined;
}

function isSafeRuntimeIdentifier(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,256}$/.test(value);
}

function localPromptSteeringResult(invocation, snapshot) {
  const payload = invocation.payload || {};
  const prompt = String(payload.prompt || '').trim();
  const targetType = payload.target_type || 'task';
  const targetId = String(payload.target_id || '').trim();
  const normalizedTarget = `${targetType}:${targetId}`;
  if (!targetId || !prompt || prompt.length > 8000) {
    return {
      state: 'denied',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      reason: !targetId ? 'invalid_target' : 'scope_not_allowed',
      message: !targetId ? 'Prompt steering requires a selected target.' : 'Prompt steering text must be present and no longer than 8000 characters.',
      policy_class: invocation.policy_class,
      correlation_id: invocation.correlation_id,
    };
  }
  if (!payload.dry_run && !payload.confirmation_token) {
    return {
      state: 'denied',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      reason: 'confirmation_required',
      message: 'Prompt steering requires explicit confirmation.',
      policy_class: invocation.policy_class,
      required_confirmation: true,
      correlation_id: invocation.correlation_id,
    };
  }
  if (payload.expected_normalized_target && payload.expected_normalized_target !== normalizedTarget) {
    return {
      state: 'denied',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      reason: 'invalid_target',
      message: 'Prompt steering target changed after review.',
      policy_class: invocation.policy_class,
      correlation_id: invocation.correlation_id,
    };
  }
  const affected = affectedTaskIds(targetType, targetId, snapshot);
  const unresolved = unresolvedDependencyIds(affected, snapshot);
  if (unresolved.length && requestsDependencyBypass(prompt)) {
    return {
      state: 'denied',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      reason: 'dependency_blocked',
      message: `Prompt steering cannot bypass unresolved task dependencies: ${unresolved.join(', ')}.`,
      policy_class: invocation.policy_class,
      correlation_id: invocation.correlation_id,
    };
  }
  const review = {
    normalized_target: normalizedTarget,
    policy_class: invocation.policy_class,
    affected_task_ids: affected,
    prompt_char_count: prompt.length,
    prompt_max_chars: 8000,
    prompt_log_preview: '[prompt redacted]',
    planned_mcp_action: {
      capability_id: invocation.capability_id,
      method: invocation.method,
      owner: invocation.owner,
      access: invocation.access,
      policy_class: invocation.policy_class,
      normalized_target: normalizedTarget,
      transport_candidates: ['mcp', 'mcp++'],
      input_mode: 'structured-json-payload',
      prompt_log_mode: 'redacted',
      required_policy_checks: [
        'target_authorization',
        'task_dependencies',
        'branch_protection',
        'confirmation_policy',
        'execution_budget',
        'receipt_persistence',
      ],
    },
  };
  const receipt = buildLocalSteeringReceipt(payload, review, invocation.correlation_id);
  const eventDag = buildLocalEventDag(receipt, invocation.correlation_id, payload.dry_run ? 'prompt-steering-reviewed' : 'prompt-steering-confirmed');
  return {
    state: 'available',
    capability_id: invocation.capability_id,
    owner: invocation.owner,
    data: {
      request_id: payload.client_request_id || `steer-${Date.now()}`,
      correlation_id: invocation.correlation_id,
      accepted: true,
      dry_run: Boolean(payload.dry_run),
      normalized_target: normalizedTarget,
      policy_class: invocation.policy_class,
      affected_task_ids: affected,
      planned_mcp_action: review.planned_mcp_action,
      receipt,
      event_dag: eventDag,
    },
    receipt,
    correlation_id: invocation.correlation_id,
    observed_at: new Date().toISOString(),
  };
}

function normalizeSteeringAccepted(data, review, correlationId) {
  const receipt = data?.receipt || buildLocalSteeringReceipt({ client_request_id: data?.request_id }, review, correlationId);
  return {
    request_id: data?.request_id || `steer-${Date.now()}`,
    correlation_id: data?.correlation_id || correlationId,
    accepted: data?.accepted !== false,
    dry_run: Boolean(data?.dry_run),
    normalized_target: data?.normalized_target || review.normalized_target,
    policy_class: data?.policy_class || review.policy_class,
    affected_task_ids: Array.isArray(data?.affected_task_ids) ? data.affected_task_ids : review.affected_task_ids,
    planned_mcp_action: data?.planned_mcp_action || review.planned_mcp_action,
    policy_effects: normalizePolicyEffects(data?.policy_effects),
    receipt,
    event_dag: data?.event_dag || null,
  };
}

function normalizePolicyEffects(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const effects = {};
  for (const key of ['outcome', 'budget', 'dependencies']) {
    if (typeof value[key] === 'string' && value[key].length <= 256) effects[key] = value[key];
  }
  return Object.keys(effects).length ? effects : null;
}

function recoveryActionForSteeringFailure(reason) {
  if (reason === 'dependency_blocked') return 'Review dependencies and retry';
  if (reason === 'budget_exceeded') return 'Adjust scope or budget and retry';
  if (reason === 'request_expired') return 'Start a new reviewed request';
  if (reason === 'request_cancelled') return 'Review and resubmit';
  if (reason === 'policy_denied') return 'Review policy and retry';
  return 'Review request and retry';
}

function buildTaskDispatchReview(task, contract) {
  const capability = contract.capabilities.find(item => item.id === 'supervisor.task-control.request') || {};
  return {
    normalized_target: `task:${task.task_id}`,
    policy_class: capability.policy_class || 'privileged-control',
    affected_task_ids: [task.task_id],
    planned_mcp_action: {
      capability_id: 'supervisor.task-control.request',
      method: capability.method || 'agent_supervisor.task_control.request',
      owner: capability.owner || 'ipfs_accelerate_py',
      access: capability.access || 'governed-write',
      policy_class: capability.policy_class || 'privileged-control',
      normalized_target: `task:${task.task_id}`,
      transport_candidates: capability.transports || ['mcp', 'mcp++'],
      input_mode: 'structured-json-payload',
      required_policy_checks: [
        'target_authorization',
        'task_dependencies',
        'confirmation_policy',
        'execution_budget',
        'receipt_persistence',
      ],
    },
  };
}

function affectedTaskIds(targetType, targetId, snapshot) {
  if (!targetId) return [];
  if (targetType === 'task') return [targetId];
  if (targetType === 'subgoal') {
    const subgoal = snapshot.subgoals.find(item => item.subgoal_id === targetId);
    const fromQueue = snapshot.queue.filter(item => item.subgoal_id === targetId).map(item => item.task_id);
    return uniqueStrings([...(subgoal?.task_ids || []), ...fromQueue]);
  }
  const goal = snapshot.goals.find(item => item.goal_id === targetId);
  const fromSubgoals = snapshot.subgoals.filter(item => item.goal_id === targetId).flatMap(item => item.task_ids || []);
  const fromQueue = snapshot.queue.filter(item => item.goal_id === targetId).map(item => item.task_id);
  return uniqueStrings([...(goal?.task_ids || []), ...fromSubgoals, ...fromQueue]);
}

function unresolvedDependencyIds(taskIds, snapshot) {
  const taskSet = new Set(taskIds);
  const unresolved = new Set();
  snapshot.queue.forEach(task => {
    if (!taskSet.has(task.task_id)) return;
    (task.dependencies || []).forEach(dependencyId => {
      const dependency = snapshot.queue.find(item => item.task_id === dependencyId);
      if (!dependency || dependency.status !== 'completed') unresolved.add(dependencyId);
    });
  });
  return Array.from(unresolved).sort();
}

function requestsDependencyBypass(prompt) {
  return /\b(ignore|skip|bypass|override)\b[\s\S]{0,40}\b(dependenc|blocked|prereq)/i.test(prompt)
    || /\bforce\b[\s\S]{0,40}\b(run|start|execute)\b/i.test(prompt);
}

function targetLabel(targetType, targetId, snapshot) {
  if (!targetId) return 'No target selected';
  if (targetType === 'goal') {
    const goalItem = snapshot.goals.find(item => item.goal_id === targetId);
    return goalItem ? `${goalItem.goal_id} ${goalItem.title}` : `goal ${targetId}`;
  }
  if (targetType === 'subgoal') {
    const subgoalItem = snapshot.subgoals.find(item => item.subgoal_id === targetId);
    return subgoalItem ? `${subgoalItem.subgoal_id} ${subgoalItem.title}` : `subgoal ${targetId}`;
  }
  const task = snapshot.queue.find(item => item.task_id === targetId);
  return task ? `${task.task_id} ${task.title}` : `task ${targetId}`;
}

function buildLocalSteeringReceipt(payload, review, correlationId) {
  const seed = stableStringify({
    request_id: payload?.client_request_id,
    correlation_id: correlationId,
    normalized_target: review.normalized_target,
    affected_task_ids: review.affected_task_ids,
    prompt: '[prompt redacted]',
  });
  const digest = stableDigest(seed);
  return {
    receipt_id: `rcpt-prompt-steering-${digest}`,
    cid: `bafyagentprompt${digest}`,
    owner: 'ipfs_kit_py',
    created_at: new Date().toISOString(),
  };
}

function buildLocalEventDag(receiptRef, correlationId, eventType) {
  const digest = stableDigest(stableStringify({ receipt_cid: receiptRef.cid, correlation_id: correlationId, event_type: eventType }));
  return {
    event_id: `evt-agent-supervisor-${digest}`,
    cid: `bafyagentevent${digest}`,
    receipt_cid: receiptRef.cid,
    owner: 'ipfs_kit_py',
    event_type: eventType,
    created_at: new Date().toISOString(),
  };
}

function upsertReceipt(receipts, receiptRef) {
  const next = receipts.filter(item => item.receipt_id !== receiptRef.receipt_id);
  next.unshift(receiptRef);
  return next;
}

function nativeUUID(value) { return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value); }
function nativeDigest(value) { return typeof value==='string'&&/^[0-9a-f]{64}$/.test(value); }
function nativeArtifact(value,run) { return value&&typeof value.path==='string'&&value.path.startsWith('/')&&value.path.length<=2048&&!value.path.includes('..')&&new RegExp('/data/agent_supervisor/swissknife_visual_functional/backends/supervisor-fixtures/'+run+'/attempts/([0-9a-f-]{36})/result\\.json$').test(value.path)&&nativeUUID(value.path.split('/attempts/').at(-1).split('/')[0])&&nativeDigest(value.sha256); }
function nativeGatewayReference(value,tool) {
  const r=value?.receipt, event=r?.event_dag_refs?.[0], cid=r?.receipt_id;
  if(value?.owner!=='ipfs_accelerate_py'||value.tool_id!==tool||!['http','libp2p'].includes(value.transport)
      ||typeof value.correlation_id!=='string'||r?.owner!==value.owner||r.tool_id!==tool||r.transport!==value.transport
      ||r.correlation_id!==value.correlation_id||r.outcome!==value.outcome||r.policy_outcome!=='require_confirmation'
      ||!/^b[a-z2-7]{58}$/.test(cid||'')||!/^b[a-z2-7]{58}$/.test(event||'')
      ||r.persistence?.status!=='persisted'||r.persistence.receipt_cid!==cid||r.persistence.event_cid!==event)return null;
  return {receipt_id:cid,event_id:event,correlation_id:value.correlation_id};
}

function nativeFixtureBody(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (value.isError === true || value.success === false) return null;
  if (typeof value.run_id === 'string' && value.run_id && value.success === true) return value;
  if (Array.isArray(value.content)) {
    for (const item of value.content) {
      const found = nativeFixtureBody(item?.json || item, depth + 1);
      if (found) return found;
    }
  }
  for (const key of ['result', 'data', 'json']) {
    const found = nativeFixtureBody(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function nativeFailureMessage(value,depth=0) {
  if(!value||typeof value!=='object'||depth>6)return 'Governed dispatch did not return validated output.';
  for(const key of ['message','error','reason','code'])if(typeof value[key]==='string'&&value[key].trim())return value[key].slice(0,500);
  for(const key of ['error','result','data','json','content'])if(value[key]&&typeof value[key]==='object'){
    if(Array.isArray(value[key])){for(const item of value[key].slice(0,8)){const message=nativeFailureMessage(item,depth+1);if(!message.startsWith('Governed dispatch did not'))return message;}continue;}
    const message=nativeFailureMessage(value[key],depth+1);if(!message.startsWith('Governed dispatch did not'))return message;
  }
  return 'Governed dispatch did not return validated output.';
}

function isAvailableResult(result) {
  return result && result.state === 'available' && 'data' in result;
}

function dataOr(result, fallback) {
  return isAvailableResult(result) ? result.data : fallback;
}

function listDataOr(result, fallback) {
  const data = dataOr(result, fallback);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  return fallback;
}

function emptySnapshot() {
  return {
    health: { status: 'healthy', active_goal_count: 0, queued_task_count: 0, running_task_count: 0, backends: [] },
    goals: [],
    subgoals: [],
    queue: [],
    taskboardLinks: [],
    logs: [],
    receipts: [],
    runHistory: [],
    policyAssist: null,
    semanticGoalAssist: null,
  };
}

function hasContent(snapshot) {
  return Boolean(snapshot.goals.length || snapshot.queue.length || snapshot.receipts.length || snapshot.logs.length);
}

function uniqueTransports(capabilities) {
  return Array.from(new Set(capabilities.flatMap(item => item.transports || []))).sort();
}

function uniqueStrings(items) {
  return Array.from(new Set(items.filter(Boolean))).sort();
}

function stableDigest(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeSelector(value) {
  const text = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/["\\]/g, '\\$&');
}

function fieldErrorBinding(errorId) {
  const id = escapeHtml(errorId);
  return ` aria-invalid="true" aria-describedby="${id}" aria-errormessage="${id}"`;
}

function escapeAttr(value) {
  const string = String(value || '#');
  if (/^(?:https?:\/\/|#|docs\/|contracts\/|implementation_plan\/)/.test(string)) return escapeHtml(string);
  return '#';
}

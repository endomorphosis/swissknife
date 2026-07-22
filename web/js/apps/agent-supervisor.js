const APP_ID = 'agent-supervisor';
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
      },
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
    this.bindEvents();
    this.update();
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

    const fallback = cloneSnapshot(SAMPLE_SNAPSHOT);
    const snapshot = {
      health: dataOr(results.health, fallback.health),
      queue: listDataOr(results.queue, fallback.queue),
      goals: listDataOr(results.goals, fallback.goals),
      subgoals: listDataOr(results.subgoals, fallback.subgoals),
      taskboardLinks: listDataOr(results.taskboardLinks, fallback.taskboardLinks),
      logs: listDataOr(results.logs, fallback.logs),
      receipts: listDataOr(results.receipts, fallback.receipts),
      runHistory: listDataOr(results.runHistory, fallback.runHistory),
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
        return normalizeGatewayResult(invocation, await this.gateway.invoke(invocation));
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
        return normalizeGatewayResult(invocation, await response.json());
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
    const root = this.container.querySelector('[data-agent-supervisor-root]');
    if (!root) return;
    root.outerHTML = this.renderRoot();
    this.bindEvents();
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
    this.container.querySelector('[data-action="submit-dispatch"]')?.addEventListener('click', () => {
      this.submitTaskDispatch();
    });
    this.container.querySelectorAll('[data-supervisor-focusable]').forEach(item => {
      item.addEventListener('keydown', event => this.handleFocusKey(event));
    });
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
    focusables[next]?.focus();
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
      return;
    }
    if (!prompt || prompt.length > 8000) {
      steering.error = { reason: 'scope_not_allowed', message: 'Prompt text must be present and no longer than 8000 characters.' };
      this.update();
      return;
    }
    if (!steering.dryRun && !steering.confirm) {
      steering.error = { reason: 'confirmation_required', message: 'Explicit confirmation is required before submission.' };
      this.update();
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

  async submitTaskDispatch() {
    const dispatch = this.state.dispatch;
    const task = this.state.snapshot.queue.find(item => item.task_id === this.state.selectedTaskId);
    const reason = dispatch.reason.trim();
    if (!task) {
      dispatch.error = { reason: 'invalid_target', message: 'Select a task before dispatching work.' };
      this.update();
      return;
    }
    if (!reason) {
      dispatch.error = { reason: 'scope_not_allowed', message: 'A dispatch reason is required.' };
      this.update();
      return;
    }
    if (!dispatch.confirm) {
      dispatch.error = { reason: 'confirmation_required', message: 'Explicit confirmation is required before dispatch.' };
      this.update();
      return;
    }

    const clientRequestId = `dispatch-${Date.now()}`;
    dispatch.submitting = true;
    dispatch.result = null;
    dispatch.error = null;
    this.update();
    const result = await this.invokeCapability('supervisor.task-control.request', {
      task_id: task.task_id,
      action: 'claim',
      reason,
      dry_run: false,
      confirmation_token: `confirm-agent-supervisor:task:${task.task_id}:${clientRequestId}`,
      client_request_id: clientRequestId,
    });
    dispatch.submitting = false;
    if (isAvailableResult(result)) {
      const review = buildTaskDispatchReview(task, this.contract);
      dispatch.result = normalizeSteeringAccepted(result.data, review, result.correlation_id);
      dispatch.confirm = false;
      task.status = 'running';
      if (dispatch.result.receipt?.receipt_id) {
        this.state.snapshot.receipts = upsertReceipt(this.state.snapshot.receipts, dispatch.result.receipt);
        this.state.selectedReceiptId = dispatch.result.receipt.receipt_id;
      }
    } else {
      dispatch.error = {
        reason: result.reason || result.state,
        message: result.message || 'Task dispatch was not accepted.',
        correlation_id: result.correlation_id,
      };
    }
    this.state.activeTab = 'dispatch';
    this.update();
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
      <div class="agent-supervisor" data-agent-supervisor-root data-testid="agent-supervisor-app" data-state="${escapeHtml(status)}" data-transport="${escapeHtml(this.state.transportMode)}">
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
          <a class="as-link" href="${CONTRACT_SCHEMA_REF}" data-testid="contract-link">Contract</a>
          <a class="as-link" href="docs/agent-supervisor-console-security-model.md" data-testid="security-link">Security</a>
          <button type="button" data-action="refresh" data-supervisor-focusable>Refresh</button>
          <button type="button" data-action="empty" data-supervisor-focusable>Empty</button>
          <button type="button" data-action="error" data-supervisor-focusable>Error</button>
        </div>
      </header>
      <section class="as-health-band" aria-label="Supervisor health" data-testid="supervisor-health">
        ${metric('Status', health.status || 'unavailable')}
        ${metric('Active goals', String(health.active_goal_count ?? 0))}
        ${metric('Queued', String(health.queued_task_count ?? 0))}
        ${metric('Running', String(health.running_task_count ?? 0))}
        ${metric('Mode', this.state.transportMode)}
      </section>
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
        <div class="as-active-heading">
          <span class="as-status ${escapeHtml(task.status)}"></span>
          <div>
            <h3>${escapeHtml(task.task_id)}</h3>
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
    const canSubmit = steering.targetId
      && steering.prompt.trim().length > 0
      && steering.prompt.trim().length <= 8000
      && (steering.dryRun || steering.confirm)
      && !steering.submitting;
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
          <textarea data-steering-prompt maxlength="8000" data-testid="steering-prompt" spellcheck="false">${escapeHtml(steering.prompt)}</textarea>
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
          <input type="checkbox" data-steering-confirm data-testid="steering-confirm" ${steering.confirm ? 'checked' : ''} ${steering.dryRun ? 'disabled' : ''}>
          <span>Confirm this governed prompt steering request for the reviewed target.</span>
        </label>
        <div class="as-actions as-steering-actions">
          <button type="button" data-action="submit-steering" data-testid="steering-submit" data-supervisor-focusable aria-disabled="${canSubmit ? 'false' : 'true'}">${steering.submitting ? 'Submitting' : 'Submit'}</button>
        </div>
        ${error ? `
          <div class="as-state as-error" data-testid="steering-error" role="alert">
            <strong>${escapeHtml(error.reason)}</strong>
            <span>${escapeHtml(error.message)}${error.correlation_id ? ` ${escapeHtml(error.correlation_id)}` : ''}</span>
            <button type="button" data-action="recover-steering" data-testid="steering-recovery" data-supervisor-focusable>${escapeHtml(steering.recoveryAction || recoveryActionForSteeringFailure(error.reason))}</button>
          </div>
        ` : ''}
        ${result ? `
          <div class="as-steering-result" data-testid="steering-result">
            ${metric('Correlation', result.correlation_id)}
            ${metric('Receipt', result.receipt?.receipt_id || 'pending')}
            ${metric('CID', result.receipt?.cid || 'pending')}
            ${metric('Accepted', String(result.accepted))}
            ${metric('Mode', result.dry_run ? 'dry-run' : 'confirmed')}
            ${metric('Policy', result.policy_class || 'unknown')}
            ${metric('Policy effect', result.policy_effects?.outcome || 'reviewed')}
            ${metric('Budget', result.policy_effects?.budget || 'not reported')}
            ${metric('Dependencies', result.policy_effects?.dependencies || 'not reported')}
            ${metric('Event DAG', result.event_dag?.cid || 'pending')}
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
    const canSubmit = task && dispatch.reason.trim() && dispatch.confirm && !dispatch.submitting;
    return `
      <div class="as-detail-body as-dispatch" data-testid="dispatch-panel">
        <div class="as-active-heading">
          <span class="as-status ${task ? task.status : 'blocked'}"></span>
          <div>
            <h3>Governed task dispatch</h3>
            <p>${escapeHtml(task ? `${task.task_id} ${task.title}` : 'No task selected')}</p>
          </div>
        </div>
        <div class="as-inline-grid" data-testid="dispatch-review">
          ${metric('Action', 'claim')}
          ${metric('Policy class', 'privileged-control')}
          ${metric('Owner', 'ipfs_accelerate_py')}
          ${metric('Target', task ? `task:${task.task_id}` : 'unselected')}
        </div>
        <div class="as-section-line">
          <h4>Planned MCP action</h4>
          <code>agent_supervisor.task_control.request</code>
          <span>Structured browser-safe request; no direct file or process access.</span>
          <span>Checks target authorization, dependencies, confirmation, execution budget, receipt persistence, and event-DAG append.</span>
        </div>
        <label class="as-field">
          <span>Dispatch reason</span>
          <textarea data-dispatch-reason data-testid="dispatch-reason" maxlength="1000" spellcheck="false">${escapeHtml(dispatch.reason)}</textarea>
        </label>
        <label class="as-confirm-line">
          <input type="checkbox" data-dispatch-confirm data-testid="dispatch-confirm" ${dispatch.confirm ? 'checked' : ''}>
          <span>Confirm this governed task dispatch for the reviewed task and policy.</span>
        </label>
        <div class="as-actions as-steering-actions">
          <button type="button" data-action="submit-dispatch" data-testid="dispatch-submit" data-supervisor-focusable aria-disabled="${canSubmit ? 'false' : 'true'}">${dispatch.submitting ? 'Dispatching' : 'Dispatch task'}</button>
        </div>
        ${error ? `
          <div class="as-state as-error" data-testid="dispatch-error" role="alert">
            <strong>${escapeHtml(error.reason)}</strong>
            <span>${escapeHtml(error.message)}${error.correlation_id ? ` ${escapeHtml(error.correlation_id)}` : ''}</span>
          </div>
        ` : ''}
        ${result ? `
          <div class="as-steering-result" data-testid="dispatch-result">
            ${metric('Correlation', result.correlation_id)}
            ${metric('Receipt', result.receipt?.receipt_id || 'pending')}
            ${metric('CID', result.receipt?.cid || 'pending')}
            ${metric('Accepted', String(result.accepted))}
            ${metric('Policy', result.policy_class || 'privileged-control')}
            ${metric('Event DAG', result.event_dag?.cid || 'pending')}
            ${metric('Event', result.event_dag?.event_type || 'task-dispatched')}
            ${metric('State', task?.status || 'unknown')}
          </div>
        ` : ''}
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
              <span>${escapeHtml(item.cid || 'pending-cid')}</span>
            </button>
          `).join('') : '<div class="as-list-empty">No receipts available.</div>'}
        </div>
        ${selected ? `
          <div class="as-receipt-detail">
            ${metric('Receipt', selected.receipt_id)}
            ${metric('CID', selected.cid || 'pending')}
            ${metric('Owner', selected.owner)}
            ${metric('Created', selected.created_at || 'unknown')}
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
              ${metric('Transport', operationResult.runtime?.transport || 'unobserved')}
              ${metric('Policy', operationResult.runtime?.policy_outcome || operationResult.policy_class || 'unobserved')}
              ${metric('CID', operationResult.runtime?.event_dag_cid || operationResult.runtime?.content_cid || operationResult.receipt?.cid || 'no-cid')}
              ${metric('Event DAG', operationResult.runtime?.event_dag_cid || operationResult.data?.cid || operationResult.data?.event_dag?.cid || 'no-checkpoint')}
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
          ${backends.map(item => `
            <div class="as-backend-row">
              <span class="as-status ${escapeHtml(item.status)}"></span>
              <strong>${escapeHtml(item.owner)}</strong>
              <span>${escapeHtml(item.transport)}</span>
              <span>${escapeHtml(item.receipt?.receipt_id || 'no-receipt')}</span>
              <span>${escapeHtml(item.receipt?.cid || 'no-cid')}</span>
            </div>
          `).join('')}
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
            <span>${escapeHtml(state)}</span>
            <span>${escapeHtml(reason)}</span>
            <span>${escapeHtml(transport)}</span>
            <span>${escapeHtml(policy)}</span>
            <span>${escapeHtml(correlation)}</span>
            <span>${escapeHtml(receiptId)}</span>
            <span>${escapeHtml(cid)}</span>
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
    const proof = snapshot.vdaG054 || SAMPLE_SNAPSHOT.vdaG054;
    const checkpointRefs = Array.isArray(proof?.checkpoint_refs) ? proof.checkpoint_refs : SAMPLE_SNAPSHOT.vdaG054.checkpoint_refs;
    const receiptRefs = Array.isArray(proof?.receipt_refs) ? proof.receipt_refs : SAMPLE_SNAPSHOT.vdaG054.receipt_refs;
    const selectedTask = snapshot.queue.find(item => item.task_id === this.state.selectedTaskId) || snapshot.queue[0] || {};
    const review = this.buildSteeringReview();
    const owners = this.contract.owners.map(owner => owner.owner).join(', ');
    const taskboardCount = snapshot.taskboardLinks.length;
    const receiptCount = snapshot.receipts.length;
    const progressSummary = snapshot.queue.map(task => `${task.task_id}:${Number(task.progress ?? 0)}%`).join(' ');
    const reassignment = snapshot.queue.find(task => task.reassignment) || selectedTask;
    return `
      <section class="as-workflow-proof" data-svd-workflow="agent-supervisor.steer-goals-subgoals-dispatch" data-testid="agent-supervisor-vda-g054">
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
            <span>${checkpointRefs[0]} ${receiptRefs[0]} ${snapshot.goals.length} goals, ${snapshot.subgoals.length} subgoals, selected ${escapeHtml(this.state.selectedGoalId)} -> ${escapeHtml(this.state.selectedSubgoalId)}.</span>
          </div>
          <div data-svd-vda-marker="prompt-preview">
            <strong>Prompt preview</strong>
            <span>${checkpointRefs[1]} ${receiptRefs[1]} normalized target ${escapeHtml(review.normalized_target)}; planned MCP action ${escapeHtml(review.planned_mcp_action.method)}; prompt_log_preview ${escapeHtml(review.prompt_log_preview)}; structured-json-payload.</span>
          </div>
          <div data-svd-vda-marker="taskboard-links">
            <strong>Taskboard links</strong>
            <span>${checkpointRefs[2]} ${receiptRefs[2]} ${taskboardCount} taskboard links include ${escapeHtml((snapshot.taskboardLinks[0]?.url || selectedTask.taskboard_url || '#task/unselected'))}; queue records remain linked to goals and subgoals.</span>
          </div>
          <div data-svd-vda-marker="policy-confirmation">
            <strong>Policy confirmation</strong>
            <span>${checkpointRefs[3]} ${receiptRefs[3]} confirmation_required policy class ${escapeHtml(review.policy_class)} checks ${escapeHtml(review.planned_mcp_action.required_policy_checks.join(', '))}; governed writes stay dry-run or confirmed.</span>
          </div>
          <div data-svd-vda-marker="kda-evidence">
            <strong>K/D/A evidence</strong>
            <span>${checkpointRefs[4]} ${receiptRefs[4]} K ipfs_kit_py task receipts/event DAG; D ipfs_datasets_py goal and policy reasoning; A ipfs_accelerate_py queue, scheduler, and workers; owners ${escapeHtml(owners)}.</span>
          </div>
          <div data-svd-vda-marker="progress">
            <strong>Progress</strong>
            <span>${checkpointRefs[5]} ${receiptRefs[5]} progress ${escapeHtml(progressSummary || 'empty queue')}; selected task ${escapeHtml(selectedTask.task_id || 'none')} state ${escapeHtml(selectedTask.status || 'empty')}.</span>
          </div>
          <div data-svd-vda-marker="timeout-reassignment">
            <strong>Timeout/reassignment</strong>
            <span>${checkpointRefs[6]} ${receiptRefs[6]} timeout and reassignment path ${escapeHtml(reassignment?.reassignment || 'within lease')}; assignee ${escapeHtml(reassignment?.assignee || 'unassigned')}.</span>
          </div>
          <div data-svd-vda-marker="receipt-visibility">
            <strong>Receipt visibility</strong>
            <span>${checkpointRefs[7]} ${receiptRefs[7]} ${receiptCount} receipts visible; selected ${escapeHtml(this.state.selectedReceiptId || 'none')}; event-DAG checkpoint and receipt retrieval controls are visible.</span>
          </div>
        </div>
      </section>
    `;
  }

  renderStyles() {
    return `
      <style>
        .agent-supervisor { height: 100%; min-height: 520px; background: #0e1412; color: #edf7f2; font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: auto; }
        .agent-supervisor * { box-sizing: border-box; }
        .as-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-bottom: 1px solid #263a34; background: #12211d; }
        .as-header h2, .as-pane-title h3, .as-active-heading h3 { margin: 0; letter-spacing: 0; }
        .as-subtitle, .as-pane-title span, .as-state span, .as-section-line span, .as-active-heading p { color: #a8bbb2; }
        .as-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .as-actions button, .as-actions a, .as-tabs button, .as-row, .as-queue-row, .as-receipt-list button, .as-section-line button { border: 1px solid #315248; background: #173029; color: #edf7f2; border-radius: 6px; padding: 7px 10px; min-height: 32px; text-decoration: none; cursor: pointer; }
        .as-actions button:disabled { color: #7c8f87; border-color: #263a34; background: #121b18; cursor: not-allowed; }
        .as-actions button[aria-disabled="true"] { color: #9eb2aa; border-color: #315248; }
        .as-actions button:hover, .as-actions a:hover, .as-tabs button:hover, .as-row:hover, .as-queue-row:hover, .as-receipt-list button:hover, .as-section-line button:hover { border-color: #5fb99d; }
        .as-actions button:focus-visible, .as-actions a:focus-visible, .as-tabs button:focus-visible, .as-row:focus-visible, .as-queue-row:focus-visible, .as-receipt-list button:focus-visible, .as-section-line button:focus-visible { outline: 2px solid #8bd8bd; outline-offset: 2px; }
        .as-health-band, .as-inline-grid { display: grid; grid-template-columns: repeat(5, minmax(96px, 1fr)); gap: 1px; background: #263a34; border-bottom: 1px solid #263a34; }
        .as-metric { background: #101b18; padding: 10px 12px; min-width: 0; }
        .as-metric span { display: block; color: #91a79d; font-size: 11px; text-transform: uppercase; }
        .as-metric strong { display: block; overflow-wrap: anywhere; font-size: 13px; }
        .as-layout { display: grid; grid-template-columns: minmax(220px, 0.9fr) minmax(260px, 1.1fr) minmax(320px, 1.4fr); gap: 1px; background: #263a34; min-height: 430px; }
        .as-pane { background: #0e1412; min-width: 0; overflow: auto; }
        .as-pane-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid #263a34; background: #101b18; position: sticky; top: 0; z-index: 1; }
        .as-tree, .as-queue-list, .as-detail-body, .as-backends { display: grid; gap: 8px; padding: 10px; }
        .as-detail-body { padding-bottom: 86px; }
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
        .as-tabs { display: grid; grid-template-columns: repeat(6, minmax(66px, 1fr)); gap: 1px; background: #263a34; border-bottom: 1px solid #263a34; }
        .as-tabs button { border-radius: 0; border: 0; border-right: 1px solid #263a34; }
        .as-active-heading { display: flex; align-items: flex-start; gap: 10px; padding: 4px 0 8px; }
        .as-active-heading p { margin: 4px 0 0; }
        .as-detail .as-inline-grid { grid-template-columns: repeat(4, minmax(80px, 1fr)); border: 1px solid #263a34; }
        .as-section-line { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid #263a34; }
        .as-section-line h4 { margin: 0; }
        .as-section-line a { color: #8bd8bd; overflow-wrap: anywhere; }
        .as-section-line code { background: #17241f; border: 1px solid #263a34; border-radius: 4px; padding: 4px 6px; overflow-wrap: anywhere; }
        .as-field { display: grid; gap: 6px; }
        .as-field span, .as-confirm-line span { color: #a8bbb2; }
        .as-field textarea { min-height: 132px; resize: vertical; border: 1px solid #315248; border-radius: 6px; background: #101b18; color: #edf7f2; padding: 10px; font: inherit; width: 100%; }
        .as-field textarea:focus-visible { outline: 2px solid #8bd8bd; outline-offset: 2px; }
        .as-confirm-line { display: flex; align-items: flex-start; gap: 8px; border-top: 1px solid #263a34; padding-top: 10px; }
        .as-confirm-line input { margin-top: 3px; }
        .as-steering-actions { justify-content: flex-start; }
        .as-steering-result { display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 1px; background: #263a34; border: 1px solid #263a34; }
        .as-receipt-list { display: grid; gap: 6px; }
        .as-receipt-list button { display: grid; gap: 2px; text-align: left; }
        .as-receipt-list span { color: #9eb2aa; overflow-wrap: anywhere; }
        .as-receipt-detail { display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 1px; background: #263a34; margin-top: 8px; }
        .as-backend-row { display: grid; grid-template-columns: 10px minmax(150px, 1fr) minmax(70px, auto) minmax(120px, 1fr); gap: 10px; align-items: center; border-bottom: 1px solid #263a34; padding: 8px 0; min-width: 0; }
        .as-backend-row span:last-child { overflow-wrap: anywhere; color: #9eb2aa; }
        .as-gateway-table { display: grid; gap: 1px; background: #263a34; border: 1px solid #263a34; overflow-x: auto; }
        .as-gateway-row { display: grid; grid-template-columns: 10px minmax(190px, 1.2fr) minmax(120px, 0.8fr) minmax(86px, 0.6fr) minmax(130px, 0.8fr) minmax(80px, .55fr) minmax(90px, .65fr) minmax(150px, 1fr) minmax(120px, .8fr) minmax(120px, .8fr); gap: 8px; align-items: center; min-width: 1280px; background: #101b18; padding: 8px; }
        .as-gateway-row span, .as-gateway-row strong { overflow-wrap: anywhere; min-width: 0; }
        .as-gateway-row span { color: #a8bbb2; }
        .as-gateway-head { background: #17241f; }
        .as-workflow-proof { display: grid; gap: 10px; padding: 12px; border-top: 1px solid #263a34; background: #101b18; }
        .as-workflow-proof-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .as-workflow-proof-head h3 { margin: 0; font-size: 15px; letter-spacing: 0; }
        .as-workflow-proof-head span { color: #a8bbb2; }
        .as-proof-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .as-proof-actions button { border: 1px solid #315248; background: #173029; color: #edf7f2; border-radius: 6px; padding: 6px 9px; min-height: 30px; cursor: pointer; }
        .as-proof-grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 1px; background: #263a34; border: 1px solid #263a34; }
        .as-proof-grid > div { display: grid; gap: 4px; background: #0e1412; padding: 9px; min-width: 0; }
        .as-proof-grid strong { color: #8bd8bd; }
        .as-proof-grid span { color: #a8bbb2; overflow-wrap: anywhere; }
        .as-state { margin: 12px; padding: 12px; border: 1px solid #315248; background: #101b18; border-radius: 6px; display: flex; align-items: center; gap: 10px; }
        .as-error { border-color: #8c3d3d; background: #231312; }
        .as-spinner { width: 20px; height: 20px; border: 3px solid #315248; border-top-color: #8bd8bd; border-radius: 50%; animation: as-spin 900ms linear infinite; }
        .as-list-empty { padding: 12px; color: #a8bbb2; }
        @keyframes as-spin { to { transform: rotate(360deg); } }
        @media (max-width: 760px) {
          .agent-supervisor { min-height: 640px; }
          .as-header { align-items: flex-start; flex-direction: column; }
          .as-health-band, .as-inline-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-layout { grid-template-columns: 1fr; }
          .as-pane { max-height: none; }
          .as-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .as-steering-result { grid-template-columns: 1fr; }
          .as-backend-row { grid-template-columns: 10px minmax(0, 1fr); }
          .as-backend-row span { overflow-wrap: anywhere; }
          .as-gateway-row { min-width: 1080px; }
          .as-proof-grid { grid-template-columns: 1fr; }
        }
      </style>
    `;
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

function metric(label, value) {
  return `<div class="as-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
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

function escapeAttr(value) {
  const string = String(value || '#');
  if (/^(?:https?:\/\/|#|docs\/|contracts\/|implementation_plan\/)/.test(string)) return escapeHtml(string);
  return '#';
}

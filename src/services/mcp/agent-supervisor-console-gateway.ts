import type {
  AgentSupervisorBackendOwner,
  AgentSupervisorCapabilityDescriptor,
  AgentSupervisorCapabilityId,
  AgentSupervisorConsoleContract,
  AgentSupervisorDeniedReason,
  AgentSupervisorEventDagRef,
  AgentSupervisorGatewayInvocation,
  AgentSupervisorGatewayResult,
  AgentSupervisorGoal,
  AgentSupervisorGovernedActionAccepted,
  AgentSupervisorHealth,
  AgentSupervisorLogEntry,
  AgentSupervisorPolicyClass,
  AgentSupervisorPlannedMCPAction,
  AgentSupervisorPromptSteeringReview,
  AgentSupervisorPromptSteeringRequest,
  AgentSupervisorQueueItem,
  AgentSupervisorReceiptRef,
  AgentSupervisorRunHistoryRecord,
  AgentSupervisorSubgoal,
  AgentSupervisorTaskboardLink,
  AgentSupervisorTaskControlRequest,
  AgentSupervisorUnavailableReason,
} from '../../shared/service-contracts/agent-supervisor-console.js';
import {
  AllAppToolGateway,
  type AllAppToolGatewayResult,
} from './all-app-tool-gateway.js';
import {
  ALL_APP_LIVE_TOOL_BINDINGS,
  getAllAppLiveToolBinding,
  invokeAllAppLiveToolBinding,
} from '../apps/all-app-live-tool-bindings.js';
import type {
  DiscoveredBackendTool,
  MediatedPolicyOutcome,
} from '../apps/all-app-executable-backend-contract.js';

export const AGENT_SUPERVISOR_CONSOLE_CONTRACT_ID = 'swissknife.agent_supervisor_console.v1';
export const AGENT_SUPERVISOR_CONSOLE_SCHEMA_REF = 'contracts/agent-supervisor-console.schema.json';

export interface AgentSupervisorGatewayTransport {
  invoke<TData = unknown, TPayload = unknown>(
    invocation: AgentSupervisorGatewayInvocation<TPayload>,
  ): Promise<AgentSupervisorGatewayResult<TData>>;
}

export interface AgentSupervisorHttpGatewayTransportOptions {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

export interface AgentSupervisorReadListRequest {
  limit?: number;
  cursor?: string;
  status?: string;
  target_id?: string;
}

export interface AgentSupervisorReceiptReadRequest extends AgentSupervisorReadListRequest {
  receipt_ids?: readonly string[];
}

export interface AgentSupervisorRunHistorySearchRequest extends AgentSupervisorReadListRequest {
  query?: string;
  goal_id?: string;
  subgoal_id?: string;
  task_id?: string;
}

export interface AgentSupervisorPromptSteeringPolicyContext {
  goals?: readonly AgentSupervisorGoal[];
  subgoals?: readonly AgentSupervisorSubgoal[];
  queue?: readonly AgentSupervisorQueueItem[];
  branch_protected_task_ids?: readonly string[];
  execution_budget_remaining?: number;
  now?: () => Date;
  id_factory?: () => string;
}

export interface AgentSupervisorPromptSteeringPolicyDecision {
  request: AgentSupervisorPromptSteeringRequest;
  review: AgentSupervisorPromptSteeringReview;
  denial?: AgentSupervisorGatewayResult<never>;
}

const READ_TRANSPORTS = ['mcp', 'mcp++', 'libp2p'] as const;
const GOVERNED_TRANSPORTS = ['mcp', 'mcp++'] as const;
export const AGENT_SUPERVISOR_PROMPT_STEERING_MAX_CHARS = 8000;
export const AGENT_SUPERVISOR_PROMPT_STEERING_REDACTED_LOG = '[prompt redacted]' as const;

const CAPABILITIES: readonly AgentSupervisorCapabilityDescriptor[] = Object.freeze([
  {
    id: 'supervisor.health.read',
    title: 'Supervisor health',
    access: 'read',
    owner: 'ipfs_accelerate_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.health.read',
    input_ref: '#/$defs/healthReadRequest',
    output_ref: '#/$defs/health',
    receipt_required: true,
    description: 'Reads liveness, backlog counts, and backend status from the supervisor state authority.',
  },
  {
    id: 'supervisor.queue.read',
    title: 'Supervisor queue',
    access: 'read',
    owner: 'ipfs_accelerate_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.queue.read',
    input_ref: '#/$defs/listRequest',
    output_ref: '#/$defs/queueItemList',
    receipt_required: true,
    description: 'Reads queued, running, blocked, waiting, and completed task entries without mutating queue state.',
  },
  {
    id: 'supervisor.goals.read',
    title: 'Supervisor goals',
    access: 'read',
    owner: 'ipfs_accelerate_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.goals.read',
    input_ref: '#/$defs/listRequest',
    output_ref: '#/$defs/goalList',
    receipt_required: true,
    description: 'Reads top-level supervisor goals and their taskboard bindings.',
  },
  {
    id: 'supervisor.subgoals.read',
    title: 'Supervisor subgoals',
    access: 'read',
    owner: 'ipfs_accelerate_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.subgoals.read',
    input_ref: '#/$defs/listRequest',
    output_ref: '#/$defs/subgoalList',
    receipt_required: true,
    description: 'Reads subgoal state for a goal, task, or supervisor queue slice.',
  },
  {
    id: 'supervisor.taskboard.links.read',
    title: 'Taskboard links',
    access: 'read',
    owner: 'ipfs_datasets_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.taskboard.links.read',
    input_ref: '#/$defs/listRequest',
    output_ref: '#/$defs/taskboardLinkList',
    receipt_required: true,
    description: 'Reads searchable taskboard, release-evidence, and run-history index links.',
  },
  {
    id: 'supervisor.logs.read',
    title: 'Supervisor logs',
    access: 'read',
    owner: 'ipfs_accelerate_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.logs.read',
    input_ref: '#/$defs/listRequest',
    output_ref: '#/$defs/logEntryList',
    receipt_required: true,
    description: 'Reads redacted supervisor log entries through the mediated state service.',
  },
  {
    id: 'supervisor.receipts.read',
    title: 'Supervisor receipts',
    access: 'read',
    owner: 'ipfs_kit_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.receipts.read',
    input_ref: '#/$defs/receiptReadRequest',
    output_ref: '#/$defs/receiptRefList',
    receipt_required: false,
    description: 'Resolves immutable evidence and receipt references from content-addressed persistence.',
  },
  {
    id: 'supervisor.policy.assist',
    title: 'Dataset policy assistance',
    access: 'read', owner: 'ipfs_datasets_py', policy_class: 'read', transports: READ_TRANSPORTS,
    method: 'agent_supervisor.policy.assist', input_ref: '#/$defs/listRequest', output_ref: '#/$defs/semanticAssist',
    receipt_required: true,
    description: 'Retrieves policy guidance and policy-result context from the governed datasets index.',
  },
  {
    id: 'supervisor.semantic-goal.assist',
    title: 'Dataset semantic-goal assistance',
    access: 'read', owner: 'ipfs_datasets_py', policy_class: 'read', transports: READ_TRANSPORTS,
    method: 'agent_supervisor.semantic_goal.assist', input_ref: '#/$defs/listRequest', output_ref: '#/$defs/semanticAssist',
    receipt_required: true,
    description: 'Retrieves semantic goal, dependency, and task suggestions from the datasets index.',
  },
  {
    id: 'supervisor.receipts.persist',
    title: 'Persist supervisor receipt',
    access: 'governed-write', owner: 'ipfs_kit_py', policy_class: 'confirm', transports: GOVERNED_TRANSPORTS,
    method: 'agent_supervisor.receipts.persist', input_ref: '#/$defs/receiptRef', output_ref: '#/$defs/receiptRef',
    receipt_required: true,
    description: 'Persists a receipt through ipfs_kit_py, using a browser-safe Helia fallback only when kit is unavailable.',
  },
  {
    id: 'supervisor.content.retrieve',
    title: 'Retrieve supervisor content reference',
    access: 'read', owner: 'ipfs_kit_py', policy_class: 'read', transports: READ_TRANSPORTS,
    method: 'agent_supervisor.content.retrieve', input_ref: '#/$defs/receiptReadRequest', output_ref: '#/$defs/receiptRef',
    receipt_required: true,
    description: 'Resolves a supervisor content reference by CID through kit or browser-safe Helia fallback.',
  },
  {
    id: 'supervisor.event-dag.checkpoint',
    title: 'Persist event-DAG checkpoint',
    access: 'governed-write', owner: 'ipfs_kit_py', policy_class: 'confirm', transports: GOVERNED_TRANSPORTS,
    method: 'agent_supervisor.event_dag.checkpoint', input_ref: '#/$defs/receiptRef', output_ref: '#/$defs/eventDagRef',
    receipt_required: true,
    description: 'Persists an event-DAG checkpoint and exposes its CID, owner, policy outcome, and recovery state.',
  },
  {
    id: 'supervisor.run-history.search',
    title: 'Run history search',
    access: 'read',
    owner: 'ipfs_datasets_py',
    policy_class: 'read',
    transports: READ_TRANSPORTS,
    method: 'agent_supervisor.run_history.search',
    input_ref: '#/$defs/runHistorySearchRequest',
    output_ref: '#/$defs/runHistoryRecordList',
    receipt_required: true,
    description: 'Searches indexed goal, task, and run-history records without direct state file access.',
  },
  {
    id: 'supervisor.prompt-steering.request',
    title: 'Prompt steering request',
    access: 'governed-write',
    owner: 'ipfs_accelerate_py',
    policy_class: 'confirm',
    transports: GOVERNED_TRANSPORTS,
    method: 'agent_supervisor.prompt_steering.request',
    input_ref: '#/$defs/promptSteeringRequest',
    output_ref: '#/$defs/governedActionAccepted',
    receipt_required: true,
    description: 'Submits bounded steering for a goal, subgoal, or task through confirmation and policy mediation.',
  },
  {
    id: 'supervisor.task-control.request',
    title: 'Task control request',
    access: 'governed-write',
    owner: 'ipfs_accelerate_py',
    policy_class: 'privileged-control',
    transports: GOVERNED_TRANSPORTS,
    method: 'agent_supervisor.task_control.request',
    input_ref: '#/$defs/taskControlRequest',
    output_ref: '#/$defs/governedActionAccepted',
    receipt_required: true,
    description: 'Requests a task-control transition through supervisor policy, dependency, and receipt checks.',
  },
]);

export const AGENT_SUPERVISOR_CONSOLE_CONTRACT: AgentSupervisorConsoleContract = Object.freeze({
  schema: AGENT_SUPERVISOR_CONSOLE_CONTRACT_ID,
  app_id: 'agent-supervisor',
  version: '0.1.0',
  browser_safe: true,
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
  ] as const),
  capabilities: CAPABILITIES,
  unavailable_states: Object.freeze([
    'server_unavailable',
    'transport_unavailable',
    'capability_unavailable',
    'index_stale',
    'receipt_unavailable',
    'not_configured',
    'timeout',
  ] as const),
  denied_states: Object.freeze([
    'policy_denied',
    'confirmation_required',
    'dependency_blocked',
    'budget_exceeded',
    'scope_not_allowed',
    'invalid_target',
  ] as const),
  forbidden_browser_surfaces: Object.freeze([
    'host_state_file_read',
    'host_process_launch',
    'direct_implementation_supervisor_call',
    'unmediated_prompt_mutation',
  ] as const),
  schema_ref: AGENT_SUPERVISOR_CONSOLE_SCHEMA_REF,
});

export function getAgentSupervisorConsoleContract(): AgentSupervisorConsoleContract {
  return clone(AGENT_SUPERVISOR_CONSOLE_CONTRACT);
}

export function listAgentSupervisorCapabilities(): AgentSupervisorCapabilityDescriptor[] {
  return getAgentSupervisorConsoleContract().capabilities.slice();
}

export function getAgentSupervisorCapability(
  capabilityId: AgentSupervisorCapabilityId,
): AgentSupervisorCapabilityDescriptor | undefined {
  return listAgentSupervisorCapabilities().find(capability => capability.id === capabilityId);
}

export function buildAgentSupervisorInvocation<TPayload>(
  capabilityId: AgentSupervisorCapabilityId,
  payload: TPayload,
  correlationId?: string,
): AgentSupervisorGatewayInvocation<TPayload> {
  const capability = getAgentSupervisorCapability(capabilityId);
  if (!capability) {
    throw new Error(`Unknown Agent Supervisor capability: ${capabilityId}`);
  }
  return {
    capability_id: capability.id,
    owner: capability.owner,
    method: capability.method,
    access: capability.access,
    policy_class: capability.policy_class,
    payload,
    correlation_id: correlationId,
  };
}

export function agentSupervisorUnavailableResult(
  capabilityId: AgentSupervisorCapabilityId,
  reason: AgentSupervisorUnavailableReason,
  message: string,
  options: { owner?: AgentSupervisorBackendOwner; retry_after_ms?: number; correlation_id?: string } = {},
): AgentSupervisorGatewayResult<never> {
  const capability = getAgentSupervisorCapability(capabilityId);
  return {
    state: 'unavailable',
    capability_id: capabilityId,
    owner: options.owner ?? capability?.owner ?? 'ipfs_accelerate_py',
    reason,
    message,
    retry_after_ms: options.retry_after_ms,
    correlation_id: options.correlation_id,
  };
}

export function agentSupervisorDeniedResult(
  capabilityId: AgentSupervisorCapabilityId,
  reason: AgentSupervisorDeniedReason,
  message: string,
  options: {
    owner?: AgentSupervisorBackendOwner;
    decision_id?: string;
    required_confirmation?: boolean;
    correlation_id?: string;
  } = {},
): AgentSupervisorGatewayResult<never> {
  const capability = getAgentSupervisorCapability(capabilityId);
  return {
    state: 'denied',
    capability_id: capabilityId,
    owner: options.owner ?? capability?.owner ?? 'ipfs_accelerate_py',
    reason,
    message,
    policy_class: capability?.policy_class ?? 'confirm',
    decision_id: options.decision_id,
    required_confirmation: options.required_confirmation,
    correlation_id: options.correlation_id,
  };
}

export function redactAgentSupervisorPromptSteeringForLog(
  request: AgentSupervisorPromptSteeringRequest,
): Omit<AgentSupervisorPromptSteeringRequest, 'prompt'> & {
  prompt: typeof AGENT_SUPERVISOR_PROMPT_STEERING_REDACTED_LOG;
  prompt_char_count: number;
} {
  return {
    ...request,
    prompt: AGENT_SUPERVISOR_PROMPT_STEERING_REDACTED_LOG,
    prompt_char_count: normalizedPrompt(request.prompt).length,
  };
}

export function buildAgentSupervisorPromptSteeringReview(
  request: AgentSupervisorPromptSteeringRequest,
  context: AgentSupervisorPromptSteeringPolicyContext = {},
): AgentSupervisorPromptSteeringReview {
  const prompt = normalizedPrompt(request.prompt);
  const normalized_target = normalizePromptSteeringTarget(request);
  const affected_task_ids = affectedTaskIds(request, context);
  const capability = getAgentSupervisorCapability('supervisor.prompt-steering.request');
  if (!capability) {
    throw new Error('Prompt steering capability is not registered.');
  }
  return {
    normalized_target,
    policy_class: capability.policy_class,
    affected_task_ids,
    prompt_char_count: prompt.length,
    prompt_max_chars: AGENT_SUPERVISOR_PROMPT_STEERING_MAX_CHARS,
    prompt_log_preview: AGENT_SUPERVISOR_PROMPT_STEERING_REDACTED_LOG,
    planned_mcp_action: {
      capability_id: capability.id,
      method: capability.method,
      owner: capability.owner,
      access: capability.access,
      policy_class: capability.policy_class,
      normalized_target,
      transport_candidates: capability.transports,
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

export function evaluateAgentSupervisorPromptSteeringPolicy(
  request: AgentSupervisorPromptSteeringRequest,
  context: AgentSupervisorPromptSteeringPolicyContext = {},
): AgentSupervisorPromptSteeringPolicyDecision {
  const normalizedRequest = normalizePromptSteeringRequest(request);
  const review = buildAgentSupervisorPromptSteeringReview(normalizedRequest, context);
  const shapeDenial = validatePromptSteeringRequest(normalizedRequest, review);
  if (shapeDenial) return { request: normalizedRequest, review, denial: shapeDenial };

  if (normalizedRequest.expected_normalized_target
    && normalizedRequest.expected_normalized_target !== review.normalized_target) {
    return {
      request: normalizedRequest,
      review,
      denial: agentSupervisorDeniedResult(
        'supervisor.prompt-steering.request',
        'invalid_target',
        'Prompt steering target changed after review and must be reviewed again.',
      ),
    };
  }

  if (context.execution_budget_remaining !== undefined && context.execution_budget_remaining <= 0) {
    return {
      request: normalizedRequest,
      review,
      denial: agentSupervisorDeniedResult(
        'supervisor.prompt-steering.request',
        'budget_exceeded',
        'Prompt steering cannot bypass the supervisor execution budget.',
      ),
    };
  }

  const targetKnown = isPromptSteeringTargetKnown(normalizedRequest, context);
  if (targetKnown === false) {
    return {
      request: normalizedRequest,
      review,
      denial: agentSupervisorDeniedResult(
        'supervisor.prompt-steering.request',
        'invalid_target',
        'Prompt steering target is not present in the current supervisor snapshot.',
      ),
    };
  }

  const blockedDependencies = unresolvedDependencies(review.affected_task_ids, context);
  if (!normalizedRequest.dry_run
    && blockedDependencies.length > 0
    && requestsDependencyBypass(normalizedRequest.prompt)) {
    return {
      request: normalizedRequest,
      review,
      denial: agentSupervisorDeniedResult(
        'supervisor.prompt-steering.request',
        'dependency_blocked',
        `Prompt steering cannot bypass unresolved task dependencies: ${blockedDependencies.join(', ')}.`,
      ),
    };
  }

  const protectedTasks = review.affected_task_ids.filter(taskId =>
    (context.branch_protected_task_ids ?? []).includes(taskId),
  );
  if (!normalizedRequest.dry_run
    && protectedTasks.length > 0
    && requestsBranchProtectionBypass(normalizedRequest.prompt)) {
    return {
      request: normalizedRequest,
      review,
      denial: agentSupervisorDeniedResult(
        'supervisor.prompt-steering.request',
        'policy_denied',
        `Prompt steering cannot bypass branch protections for: ${protectedTasks.join(', ')}.`,
      ),
    };
  }

  return { request: normalizedRequest, review };
}

export function createAgentSupervisorGovernedPolicyTransport(
  context: AgentSupervisorPromptSteeringPolicyContext = {},
): AgentSupervisorGatewayTransport {
  return {
    async invoke<TData, TPayload>(
      invocation: AgentSupervisorGatewayInvocation<TPayload>,
    ): Promise<AgentSupervisorGatewayResult<TData>> {
      if (invocation.capability_id !== 'supervisor.prompt-steering.request') {
        return agentSupervisorUnavailableResult(
          invocation.capability_id,
          'capability_unavailable',
          'The governed policy transport only handles prompt steering requests.',
          {
            owner: invocation.owner,
            correlation_id: invocation.correlation_id,
          },
        ) as AgentSupervisorGatewayResult<TData>;
      }
      const request = invocation.payload as AgentSupervisorPromptSteeringRequest;
      const decision = evaluateAgentSupervisorPromptSteeringPolicy(request, context);
      if (decision.denial) {
        return {
          ...decision.denial,
          correlation_id: invocation.correlation_id,
        } as AgentSupervisorGatewayResult<TData>;
      }

      const correlationId = invocation.correlation_id ?? decision.request.client_request_id ?? makeStableId('corr');
      const receipt = buildPromptSteeringReceipt(decision.request, decision.review, correlationId, context);
      const eventDag = buildAgentSupervisorEventDag(
        receipt,
        correlationId,
        decision.request.dry_run ? 'prompt-steering-reviewed' : 'prompt-steering-confirmed',
      );
      const data: AgentSupervisorGovernedActionAccepted = {
        request_id: decision.request.client_request_id ?? makeStableId('prompt-steering'),
        correlation_id: correlationId,
        accepted: true,
        dry_run: decision.request.dry_run,
        normalized_target: decision.review.normalized_target,
        policy_class: decision.review.policy_class,
        affected_task_ids: decision.review.affected_task_ids,
        planned_mcp_action: decision.review.planned_mcp_action,
        receipt,
        event_dag: eventDag,
      };
      return {
        state: 'available',
        capability_id: invocation.capability_id,
        owner: invocation.owner,
        data: data as TData,
        receipt,
        correlation_id: correlationId,
        observed_at: (context.now ?? (() => new Date()))().toISOString(),
      };
    },
  };
}

export class AgentSupervisorConsoleGateway {
  private readonly transport: AgentSupervisorGatewayTransport;

  constructor(transport: AgentSupervisorGatewayTransport = createUnavailableAgentSupervisorTransport()) {
    this.transport = transport;
  }

  health(correlationId?: string): Promise<AgentSupervisorGatewayResult<AgentSupervisorHealth>> {
    return this.invoke('supervisor.health.read', {}, correlationId);
  }

  queue(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorQueueItem[]>> {
    return this.invoke('supervisor.queue.read', request, correlationId);
  }

  goals(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorGoal[]>> {
    return this.invoke('supervisor.goals.read', request, correlationId);
  }

  subgoals(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorSubgoal[]>> {
    return this.invoke('supervisor.subgoals.read', request, correlationId);
  }

  taskboardLinks(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorTaskboardLink[]>> {
    return this.invoke('supervisor.taskboard.links.read', request, correlationId);
  }

  logs(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorLogEntry[]>> {
    return this.invoke('supervisor.logs.read', request, correlationId);
  }

  receipts(
    request: AgentSupervisorReceiptReadRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorReceiptRef[]>> {
    return this.invoke('supervisor.receipts.read', request, correlationId);
  }

  runHistory(
    request: AgentSupervisorRunHistorySearchRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorRunHistoryRecord[]>> {
    return this.invoke('supervisor.run-history.search', request, correlationId);
  }

  policyAssist(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<unknown>> {
    return this.invoke('supervisor.policy.assist', request, correlationId);
  }

  semanticGoalAssist(
    request: AgentSupervisorReadListRequest = {},
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<unknown>> {
    return this.invoke('supervisor.semantic-goal.assist', request, correlationId);
  }

  persistReceipt(
    request: Record<string, unknown>,
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorReceiptRef>> {
    return this.invoke('supervisor.receipts.persist', request, correlationId);
  }

  retrieveContent(
    request: AgentSupervisorReceiptReadRequest,
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<unknown>> {
    return this.invoke('supervisor.content.retrieve', request, correlationId);
  }

  checkpointEventDag(
    request: Record<string, unknown>,
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorEventDagRef>> {
    return this.invoke('supervisor.event-dag.checkpoint', request, correlationId);
  }

  requestPromptSteering(
    request: AgentSupervisorPromptSteeringRequest,
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorGovernedActionAccepted>> {
    const normalizedRequest = normalizePromptSteeringRequest(request);
    const validation = validatePromptSteeringRequest(normalizedRequest);
    if (validation) return Promise.resolve(validation);
    return this.invoke('supervisor.prompt-steering.request', normalizedRequest, correlationId);
  }

  requestTaskControl(
    request: AgentSupervisorTaskControlRequest,
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<AgentSupervisorGovernedActionAccepted>> {
    const validation = validateTaskControlRequest(request);
    if (validation) return Promise.resolve(validation);
    return this.invoke('supervisor.task-control.request', request, correlationId);
  }

  private invoke<TData, TPayload>(
    capabilityId: AgentSupervisorCapabilityId,
    payload: TPayload,
    correlationId?: string,
  ): Promise<AgentSupervisorGatewayResult<TData>> {
    return this.transport.invoke<TData, TPayload>(
      buildAgentSupervisorInvocation(capabilityId, payload, correlationId),
    );
  }
}

export function createAgentSupervisorConsoleGateway(
  transport?: AgentSupervisorGatewayTransport,
): AgentSupervisorConsoleGateway {
  return new AgentSupervisorConsoleGateway(transport);
}

/** Browser-safe content store used only after the ipfs_kit_py binding fails. */
export interface AgentSupervisorHeliaFallback {
  put(value: unknown): Promise<{ cid: string }>;
  get(cid: string): Promise<unknown>;
}

export interface AgentSupervisorThreeBackendRuntimeOptions {
  tool_gateway: AllAppToolGateway;
  discovered_tools: readonly DiscoveredBackendTool[];
  available_transports: readonly ('http' | 'libp2p')[];
  helia?: AgentSupervisorHeliaFallback;
  now?: () => Date;
  policy_decision?: (invocation: AgentSupervisorGatewayInvocation) => {
    decision_id: string;
    outcome: MediatedPolicyOutcome;
    reason: string;
  };
}

const SUPERVISOR_BINDING_BY_OWNER = Object.freeze({
  ipfs_accelerate_py: 'agent-supervisor.ipfs_accelerate_py.supervise_agent_work',
  ipfs_datasets_py: 'agent-supervisor.ipfs_datasets_py.query_catalog',
  ipfs_kit_py: 'agent-supervisor.ipfs_kit_py.retrieve_content',
} as const);

/**
 * Bridges the high-level console API to SVD-104's materialized bindings.  The
 * owner is selected from the capability catalog, never from browser input.
 */
export class AgentSupervisorThreeBackendRuntime implements AgentSupervisorGatewayTransport {
  private readonly now: () => Date;

  constructor(private readonly options: AgentSupervisorThreeBackendRuntimeOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async invoke<TData, TPayload>(
    invocation: AgentSupervisorGatewayInvocation<TPayload>,
  ): Promise<AgentSupervisorGatewayResult<TData>> {
    const capability = getAgentSupervisorCapability(invocation.capability_id);
    if (!capability || capability.owner !== invocation.owner) {
      return agentSupervisorUnavailableResult(invocation.capability_id, 'capability_unavailable',
        'The capability owner is not registered by the Agent Supervisor contract.', {
          owner: invocation.owner, correlation_id: invocation.correlation_id,
        }) as AgentSupervisorGatewayResult<TData>;
    }
    const bindingId = SUPERVISOR_BINDING_BY_OWNER[capability.owner];
    const binding = getAllAppLiveToolBinding(bindingId);
    if (!binding || binding.app_id !== 'agent-supervisor') {
      return agentSupervisorUnavailableResult(invocation.capability_id, 'capability_unavailable',
        'The required materialized Agent Supervisor binding is unavailable.', {
          owner: invocation.owner, correlation_id: invocation.correlation_id,
        }) as AgentSupervisorGatewayResult<TData>;
    }

    const correlationId = invocation.correlation_id ?? makeStableId('agent-supervisor');
    const policy = this.policyFor(invocation);
    const result = await invokeAllAppLiveToolBinding(bindingId, {
      correlation_id: correlationId,
      payload: {
        operation: invocation.method,
        capability_id: invocation.capability_id,
        request: sanitizeBrowserPayload(invocation.payload),
      },
      consent: consentFor(invocation),
      policy_decision: policy,
      dry_run: Boolean((invocation.payload as { dry_run?: unknown })?.dry_run),
      discovered_tools: this.options.discovered_tools,
      available_transports: this.options.available_transports,
    }, this.options.tool_gateway);

    if (result.state === 'executed') {
      const available = this.availableFromToolResult<TData>(invocation, result);
      return capability.owner === 'ipfs_accelerate_py' && invocation.access === 'governed-write'
        ? this.persistGovernedEvidence(invocation, available, correlationId)
        : available;
    }
    if (capability.owner === 'ipfs_kit_py' && this.options.helia && shouldUseHelia(invocation, result)) {
      return this.heliaFallback<TData>(invocation, result, correlationId);
    }
    return this.failureFromToolResult<TData>(invocation, result);
  }

  private policyFor(invocation: AgentSupervisorGatewayInvocation) {
    if (this.options.policy_decision) return this.options.policy_decision(invocation);
    const confirmed = Boolean((invocation.payload as { confirmation_token?: unknown })?.confirmation_token);
    return {
      decision_id: `policy-${invocation.correlation_id ?? makeStableId('decision')}`,
      outcome: invocation.access === 'governed-write' && !confirmed ? 'require_confirmation' as const : 'allow' as const,
      reason: invocation.access === 'governed-write' && !confirmed
        ? 'Confirmation must be visible before a governed request is dispatched.'
        : 'Browser-safe mediated request is permitted by the console policy.',
    };
  }

  private availableFromToolResult<TData>(
    invocation: AgentSupervisorGatewayInvocation,
    result: AllAppToolGatewayResult,
  ): AgentSupervisorGatewayResult<TData> {
    const response = result.response.response as { result?: unknown; receipt?: unknown } | null;
    const receipt = normalizeReceipt(response?.receipt, invocation.owner);
    const data = response?.result as TData;
    return {
      state: 'available', capability_id: invocation.capability_id, owner: invocation.owner, data,
      receipt, correlation_id: result.correlation_id, observed_at: this.now().toISOString(),
      runtime: observation(result, receipt?.cid),
    };
  }

  private async persistGovernedEvidence<TData>(
    invocation: AgentSupervisorGatewayInvocation,
    accepted: AgentSupervisorGatewayResult<TData>,
    correlationId: string,
  ): Promise<AgentSupervisorGatewayResult<TData>> {
    if (accepted.state !== 'available') return accepted;
    const persistence = await this.invoke<AgentSupervisorReceiptRef, Record<string, unknown>>({
      ...buildAgentSupervisorInvocation('supervisor.receipts.persist', {
        source_capability_id: invocation.capability_id,
        source_correlation_id: correlationId,
        source_receipt: accepted.receipt,
        confirmation_token: (invocation.payload as { confirmation_token?: unknown })?.confirmation_token,
      }, `${correlationId}:receipt`),
    });
    if (persistence.state !== 'available' || !persistence.receipt) {
      return {
        ...accepted,
        runtime: { ...accepted.runtime, failure_code: 'persistence_failed', recovery_action: 'persist_browser_receipt' },
      };
    }
    const checkpoint = await this.invoke<AgentSupervisorEventDagRef, Record<string, unknown>>({
      ...buildAgentSupervisorInvocation('supervisor.event-dag.checkpoint', {
        receipt: persistence.receipt,
        source_capability_id: invocation.capability_id,
        source_correlation_id: correlationId,
        confirmation_token: (invocation.payload as { confirmation_token?: unknown })?.confirmation_token,
      }, `${correlationId}:event-dag`),
    });
    const data = isObject(accepted.data)
      ? { ...accepted.data, receipt: persistence.receipt, event_dag: checkpoint.state === 'available' ? checkpoint.data : undefined } as TData
      : accepted.data;
    return {
      ...accepted,
      data,
      receipt: persistence.receipt,
      runtime: {
        ...accepted.runtime,
        content_cid: persistence.receipt.cid,
        event_dag_cid: checkpoint.state === 'available' ? checkpoint.runtime?.event_dag_cid ?? checkpoint.runtime?.content_cid : undefined,
        failure_code: checkpoint.state === 'available' ? undefined : 'persistence_failed',
        recovery_action: checkpoint.state === 'available' ? undefined : 'persist_browser_receipt',
      },
    };
  }

  private failureFromToolResult<TData>(
    invocation: AgentSupervisorGatewayInvocation,
    result: AllAppToolGatewayResult,
  ): AgentSupervisorGatewayResult<TData> {
    const reason = result.state === 'denied' ? 'policy_denied' : toolFailureReason(result);
    const message = String(result.events.at(-1)?.detail?.message ?? result.recovery?.user_message ?? 'The mediated backend request did not complete.');
    if (result.state === 'denied') {
      return {
        ...agentSupervisorDeniedResult(invocation.capability_id, reason as AgentSupervisorDeniedReason, message, {
          owner: invocation.owner, correlation_id: result.correlation_id,
          required_confirmation: result.policy_outcome === 'require_confirmation',
        }), runtime: observation(result),
      } as AgentSupervisorGatewayResult<TData>;
    }
    return {
      ...agentSupervisorUnavailableResult(invocation.capability_id, reason as AgentSupervisorUnavailableReason, message, {
        owner: invocation.owner, correlation_id: result.correlation_id,
      }), runtime: observation(result),
    } as AgentSupervisorGatewayResult<TData>;
  }

  private async heliaFallback<TData>(
    invocation: AgentSupervisorGatewayInvocation,
    failed: AllAppToolGatewayResult,
    correlationId: string,
  ): Promise<AgentSupervisorGatewayResult<TData>> {
    try {
      const payload = sanitizeBrowserPayload(invocation.payload);
      if (invocation.capability_id === 'supervisor.content.retrieve') {
        const cid = typeof payload.cid === 'string' ? payload.cid : undefined;
        if (!cid) throw new Error('A content CID is required for browser Helia retrieval.');
        const data = await this.options.helia!.get(cid) as TData;
        return this.heliaAvailable(invocation, data, correlationId, cid, failed);
      }
      const stored = await this.options.helia!.put({
        schema: 'swissknife.agent-supervisor-browser-helia-fallback.v1',
        capability_id: invocation.capability_id,
        correlation_id: correlationId,
        payload,
        created_at: this.now().toISOString(),
      });
      const receipt: AgentSupervisorReceiptRef = {
        receipt_id: `browser-helia:${correlationId}`, cid: stored.cid, owner: 'ipfs_kit_py', created_at: this.now().toISOString(),
      };
      const eventDag = invocation.capability_id === 'supervisor.event-dag.checkpoint'
        ? { event_id: `browser-helia-event:${correlationId}`, cid: stored.cid, receipt_cid: stored.cid, owner: 'ipfs_kit_py' as const, event_type: 'browser-helia-checkpoint', created_at: receipt.created_at }
        : undefined;
      return {
        state: 'available', capability_id: invocation.capability_id, owner: invocation.owner,
        data: (eventDag ?? receipt) as TData, receipt, correlation_id: correlationId, observed_at: this.now().toISOString(),
        runtime: { ...observation(failed, stored.cid), transport: 'browser-helia', content_cid: stored.cid, event_dag_cid: eventDag?.cid },
      };
    } catch (error) {
      return {
        ...agentSupervisorUnavailableResult(invocation.capability_id, 'helia_unavailable',
          error instanceof Error ? error.message : 'Browser Helia fallback failed.', {
            owner: invocation.owner, correlation_id: correlationId,
          }),
        runtime: { ...observation(failed), transport: 'browser-helia', failure_code: 'helia_unavailable' },
      } as AgentSupervisorGatewayResult<TData>;
    }
  }

  private heliaAvailable<TData>(invocation: AgentSupervisorGatewayInvocation, data: TData, correlationId: string, cid: string, failed: AllAppToolGatewayResult): AgentSupervisorGatewayResult<TData> {
    return {
      state: 'available', capability_id: invocation.capability_id, owner: invocation.owner, data,
      correlation_id: correlationId, observed_at: this.now().toISOString(),
      runtime: { ...observation(failed, cid), transport: 'browser-helia', content_cid: cid },
    };
  }
}

export function createAgentSupervisorThreeBackendRuntime(
  options: AgentSupervisorThreeBackendRuntimeOptions,
): AgentSupervisorThreeBackendRuntime {
  return new AgentSupervisorThreeBackendRuntime(options);
}

export function createUnavailableAgentSupervisorTransport(
  reason: AgentSupervisorUnavailableReason = 'not_configured',
): AgentSupervisorGatewayTransport {
  return {
    async invoke<TData, TPayload>(
      invocation: AgentSupervisorGatewayInvocation<TPayload>,
    ): Promise<AgentSupervisorGatewayResult<TData>> {
      return agentSupervisorUnavailableResult(
        invocation.capability_id,
        reason,
        'Agent Supervisor gateway transport is not configured for this browser session.',
        {
          owner: invocation.owner,
          correlation_id: invocation.correlation_id,
        },
      ) as AgentSupervisorGatewayResult<TData>;
    },
  };
}

export function createAgentSupervisorHttpGatewayTransport(
  options: AgentSupervisorHttpGatewayTransportOptions,
): AgentSupervisorGatewayTransport {
  const fetchClient = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchClient) {
    return createUnavailableAgentSupervisorTransport('transport_unavailable');
  }

  return {
    async invoke<TData, TPayload>(
      invocation: AgentSupervisorGatewayInvocation<TPayload>,
    ): Promise<AgentSupervisorGatewayResult<TData>> {
      try {
        const response = await fetchClient(options.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.headers ?? {}),
          },
          body: JSON.stringify(invocation),
        });
        if (response.status === 403) {
          return agentSupervisorDeniedResult(
            invocation.capability_id,
            'policy_denied',
            'Agent Supervisor gateway request was denied by policy.',
            {
              owner: invocation.owner,
              correlation_id: invocation.correlation_id,
            },
          ) as AgentSupervisorGatewayResult<TData>;
        }
        if (!response.ok) {
          return agentSupervisorUnavailableResult(
            invocation.capability_id,
            response.status === 408 ? 'timeout' : 'server_unavailable',
            `Agent Supervisor gateway request failed with HTTP ${response.status}.`,
            {
              owner: invocation.owner,
              correlation_id: invocation.correlation_id,
            },
          ) as AgentSupervisorGatewayResult<TData>;
        }
        return normalizeAgentSupervisorGatewayResult<TData>(
          invocation,
          await response.json(),
        );
      } catch (error) {
        return agentSupervisorUnavailableResult(
          invocation.capability_id,
          'transport_unavailable',
          error instanceof Error ? error.message : 'Agent Supervisor gateway transport failed.',
          {
            owner: invocation.owner,
            correlation_id: invocation.correlation_id,
          },
        ) as AgentSupervisorGatewayResult<TData>;
      }
    },
  };
}

export function normalizeAgentSupervisorGatewayResult<TData>(
  invocation: AgentSupervisorGatewayInvocation,
  value: unknown,
): AgentSupervisorGatewayResult<TData> {
  if (isObject(value) && value.state === 'available' && 'data' in value) {
    if (invocation.access === 'governed-write') {
      const data = normalizeGovernedActionAccepted(
        (value as { data: unknown }).data,
        invocation,
        isReceiptRef((value as { receipt?: unknown }).receipt)
          ? (value as { receipt: AgentSupervisorReceiptRef }).receipt
          : undefined,
      );
      if (!data) {
        return agentSupervisorUnavailableResult(
          invocation.capability_id,
          'receipt_unavailable',
          'Governed Agent Supervisor action did not return an immutable ipfs_kit_py receipt.',
          {
            owner: invocation.owner,
            correlation_id: stringOrUndefined((value as { correlation_id?: unknown }).correlation_id)
              ?? invocation.correlation_id,
          },
        ) as AgentSupervisorGatewayResult<TData>;
      }
      return {
        state: 'available',
        capability_id: invocation.capability_id,
        owner: invocation.owner,
        data: data as TData,
        receipt: data.receipt,
        correlation_id: data.correlation_id,
        observed_at: stringOrUndefined((value as { observed_at?: unknown }).observed_at),
      };
    }
    return {
      state: 'available',
      capability_id: invocation.capability_id,
      owner: invocation.owner,
      data: (value as { data: TData }).data,
      receipt: isReceiptRef((value as { receipt?: unknown }).receipt)
        ? (value as { receipt: AgentSupervisorReceiptRef }).receipt
        : undefined,
      correlation_id: stringOrUndefined((value as { correlation_id?: unknown }).correlation_id)
        ?? invocation.correlation_id,
      observed_at: stringOrUndefined((value as { observed_at?: unknown }).observed_at),
    };
  }

  if (isObject(value) && value.state === 'denied') {
    return agentSupervisorDeniedResult(
      invocation.capability_id,
      isDeniedReason((value as { reason?: unknown }).reason)
        ? (value as { reason: AgentSupervisorDeniedReason }).reason
        : 'policy_denied',
      stringOrUndefined((value as { message?: unknown }).message) ?? 'Agent Supervisor request was denied.',
      {
        owner: invocation.owner,
        decision_id: stringOrUndefined((value as { decision_id?: unknown }).decision_id),
        required_confirmation: Boolean((value as { required_confirmation?: unknown }).required_confirmation),
        correlation_id: stringOrUndefined((value as { correlation_id?: unknown }).correlation_id)
          ?? invocation.correlation_id,
      },
    ) as AgentSupervisorGatewayResult<TData>;
  }

  if (isObject(value) && value.state === 'unavailable') {
    return agentSupervisorUnavailableResult(
      invocation.capability_id,
      isUnavailableReason((value as { reason?: unknown }).reason)
        ? (value as { reason: AgentSupervisorUnavailableReason }).reason
        : 'capability_unavailable',
      stringOrUndefined((value as { message?: unknown }).message) ?? 'Agent Supervisor capability is unavailable.',
      {
        owner: invocation.owner,
        retry_after_ms: numberOrUndefined((value as { retry_after_ms?: unknown }).retry_after_ms),
        correlation_id: stringOrUndefined((value as { correlation_id?: unknown }).correlation_id)
          ?? invocation.correlation_id,
      },
    ) as AgentSupervisorGatewayResult<TData>;
  }

  return agentSupervisorUnavailableResult(
    invocation.capability_id,
    'capability_unavailable',
    'Agent Supervisor gateway returned an unsupported response shape.',
    {
      owner: invocation.owner,
      correlation_id: invocation.correlation_id,
    },
  ) as AgentSupervisorGatewayResult<TData>;
}

function validatePromptSteeringRequest(
  request: AgentSupervisorPromptSteeringRequest,
  review?: AgentSupervisorPromptSteeringReview,
): AgentSupervisorGatewayResult<never> | undefined {
  if (!request.target_id || !request.target_type) {
    return agentSupervisorDeniedResult(
      'supervisor.prompt-steering.request',
      'invalid_target',
      'Prompt steering requires a goal, subgoal, or task target.',
    );
  }
  const prompt = request.prompt?.trim() ?? '';
  if (!prompt || prompt.length > AGENT_SUPERVISOR_PROMPT_STEERING_MAX_CHARS) {
    return agentSupervisorDeniedResult(
      'supervisor.prompt-steering.request',
      'scope_not_allowed',
      `Prompt steering text must be present and no longer than ${AGENT_SUPERVISOR_PROMPT_STEERING_MAX_CHARS} characters.`,
    );
  }
  if (review && review.planned_mcp_action.input_mode !== 'structured-json-payload') {
    return agentSupervisorDeniedResult(
      'supervisor.prompt-steering.request',
      'policy_denied',
      'Prompt steering must be submitted as a structured MCP payload, not shell input.',
    );
  }
  if (!request.dry_run && !request.confirmation_token) {
    return agentSupervisorDeniedResult(
      'supervisor.prompt-steering.request',
      'confirmation_required',
      'Prompt steering requires explicit confirmation unless submitted as a dry run.',
      { required_confirmation: true },
    );
  }
  return undefined;
}

function validateTaskControlRequest(
  request: AgentSupervisorTaskControlRequest,
): AgentSupervisorGatewayResult<never> | undefined {
  if (!request.task_id) {
    return agentSupervisorDeniedResult(
      'supervisor.task-control.request',
      'invalid_target',
      'Task control requires a task target.',
    );
  }
  if (!request.reason?.trim()) {
    return agentSupervisorDeniedResult(
      'supervisor.task-control.request',
      'scope_not_allowed',
      'Task control requires a reason for the requested transition.',
    );
  }
  if (!request.dry_run && !request.confirmation_token) {
    return agentSupervisorDeniedResult(
      'supervisor.task-control.request',
      'confirmation_required',
      'Task control requires explicit confirmation unless submitted as a dry run.',
      { required_confirmation: true },
    );
  }
  return undefined;
}

function isReceiptRef(value: unknown): value is AgentSupervisorReceiptRef {
  return isObject(value)
    && typeof value.receipt_id === 'string'
    && value.owner === 'ipfs_kit_py';
}

function normalizePromptSteeringRequest(
  request: AgentSupervisorPromptSteeringRequest,
): AgentSupervisorPromptSteeringRequest {
  return {
    target_type: request.target_type,
    target_id: String(request.target_id ?? '').trim(),
    prompt: normalizedPrompt(request.prompt),
    dry_run: Boolean(request.dry_run),
    confirmation_token: stringOrUndefined(request.confirmation_token),
    client_request_id: stringOrUndefined(request.client_request_id),
    expected_normalized_target: stringOrUndefined(request.expected_normalized_target),
  };
}

function normalizedPrompt(prompt: unknown): string {
  return String(prompt ?? '').replace(/\r\n?/g, '\n').trim();
}

function normalizePromptSteeringTarget(request: AgentSupervisorPromptSteeringRequest): string {
  return `${request.target_type}:${String(request.target_id ?? '').trim()}`;
}

function affectedTaskIds(
  request: AgentSupervisorPromptSteeringRequest,
  context: AgentSupervisorPromptSteeringPolicyContext,
): string[] {
  const queue = context.queue ?? [];
  if (request.target_type === 'task') {
    return uniqueStrings([request.target_id]);
  }
  if (request.target_type === 'subgoal') {
    const subgoal = (context.subgoals ?? []).find(item => item.subgoal_id === request.target_id);
    const fromSubgoal = subgoal?.task_ids ?? [];
    const fromQueue = queue
      .filter(item => item.subgoal_id === request.target_id)
      .map(item => item.task_id);
    return uniqueStrings([...fromSubgoal, ...fromQueue]);
  }
  const goal = (context.goals ?? []).find(item => item.goal_id === request.target_id);
  const fromGoal = goal?.task_ids ?? [];
  const fromSubgoals = (context.subgoals ?? [])
    .filter(item => item.goal_id === request.target_id)
    .flatMap(item => item.task_ids);
  const fromQueue = queue
    .filter(item => item.goal_id === request.target_id)
    .map(item => item.task_id);
  return uniqueStrings([...fromGoal, ...fromSubgoals, ...fromQueue]);
}

function isPromptSteeringTargetKnown(
  request: AgentSupervisorPromptSteeringRequest,
  context: AgentSupervisorPromptSteeringPolicyContext,
): boolean | undefined {
  if (!context.goals && !context.subgoals && !context.queue) return undefined;
  if (request.target_type === 'goal') {
    return Boolean((context.goals ?? []).some(item => item.goal_id === request.target_id));
  }
  if (request.target_type === 'subgoal') {
    return Boolean((context.subgoals ?? []).some(item => item.subgoal_id === request.target_id));
  }
  return Boolean((context.queue ?? []).some(item => item.task_id === request.target_id));
}

function unresolvedDependencies(
  taskIds: readonly string[],
  context: AgentSupervisorPromptSteeringPolicyContext,
): string[] {
  const queue = context.queue ?? [];
  const taskSet = new Set(taskIds);
  const unresolved = new Set<string>();
  for (const task of queue) {
    if (!taskSet.has(task.task_id)) continue;
    for (const dependencyId of task.dependencies ?? []) {
      const dependency = queue.find(item => item.task_id === dependencyId);
      if (!dependency || dependency.status !== 'completed') unresolved.add(dependencyId);
    }
  }
  return Array.from(unresolved).sort();
}

function requestsDependencyBypass(prompt: string): boolean {
  return /\b(ignore|skip|bypass|override)\b[\s\S]{0,40}\b(dependenc|blocked|prereq)/i.test(prompt)
    || /\b(force)\b[\s\S]{0,40}\b(run|start|execute)\b/i.test(prompt);
}

function requestsBranchProtectionBypass(prompt: string): boolean {
  return /\b(ignore|skip|bypass|override)\b[\s\S]{0,40}\b(branch|protection|protected)\b/i.test(prompt)
    || /\b(force[-\s]?push|push\s+--force)\b/i.test(prompt);
}

function normalizeGovernedActionAccepted(
  value: unknown,
  invocation: AgentSupervisorGatewayInvocation,
  fallbackReceipt?: AgentSupervisorReceiptRef,
): AgentSupervisorGovernedActionAccepted | undefined {
  if (!isObject(value)) return undefined;
  const receipt = isReceiptRef(value.receipt) ? value.receipt : fallbackReceipt;
  if (!receipt) return undefined;
  const correlationId = stringOrUndefined(value.correlation_id)
    ?? invocation.correlation_id
    ?? makeStableId('corr');
  const normalizedTarget = stringOrUndefined(value.normalized_target)
    ?? normalizedTargetFromPayload(invocation.payload);
  const plannedAction = plannedActionFrom(value.planned_mcp_action, invocation, normalizedTarget);
  if (!plannedAction) return undefined;
  return {
    request_id: stringOrUndefined(value.request_id) ?? makeStableId('prompt-steering'),
    correlation_id: correlationId,
    accepted: value.accepted !== false,
    dry_run: Boolean(value.dry_run),
    normalized_target: normalizedTarget,
    policy_class: policyClassFrom(value.policy_class) ?? invocation.policy_class,
    affected_task_ids: arrayOfStrings(value.affected_task_ids),
    planned_mcp_action: plannedAction,
    receipt,
    event_dag: normalizeEventDagRef(value.event_dag, receipt),
  };
}

function plannedActionFrom(
  value: unknown,
  invocation: AgentSupervisorGatewayInvocation,
  normalizedTarget: string,
): AgentSupervisorPlannedMCPAction | undefined {
  const baseCapability = getAgentSupervisorCapability(invocation.capability_id);
  if (!baseCapability) return undefined;
  if (isObject(value)) {
    return {
      capability_id: invocation.capability_id,
      method: stringOrUndefined(value.method) ?? baseCapability.method,
      owner: baseCapability.owner,
      access: baseCapability.access,
      policy_class: policyClassFrom(value.policy_class) ?? baseCapability.policy_class,
      normalized_target: stringOrUndefined(value.normalized_target) ?? normalizedTarget,
      transport_candidates: arrayOfTransports(value.transport_candidates, baseCapability.transports),
      input_mode: 'structured-json-payload',
      prompt_log_mode: invocation.capability_id === 'supervisor.prompt-steering.request' ? 'redacted' : undefined,
      required_policy_checks: arrayOfPolicyChecks(value.required_policy_checks),
    };
  }
  return {
    capability_id: invocation.capability_id,
    method: baseCapability.method,
    owner: baseCapability.owner,
    access: baseCapability.access,
    policy_class: baseCapability.policy_class,
    normalized_target: normalizedTarget,
    transport_candidates: baseCapability.transports,
    input_mode: 'structured-json-payload',
    prompt_log_mode: invocation.capability_id === 'supervisor.prompt-steering.request' ? 'redacted' : undefined,
    required_policy_checks: [
      'target_authorization',
      'task_dependencies',
      'branch_protection',
      'confirmation_policy',
      'execution_budget',
      'receipt_persistence',
    ],
  };
}

function normalizedTargetFromPayload(payload: unknown): string {
  if (!isObject(payload)) return 'unknown:unknown';
  const targetType = stringOrUndefined(payload.target_type) ?? 'task';
  const targetId = stringOrUndefined(payload.target_id)
    ?? stringOrUndefined(payload.task_id)
    ?? 'unknown';
  return `${targetType}:${targetId}`;
}

function buildPromptSteeringReceipt(
  request: AgentSupervisorPromptSteeringRequest,
  review: AgentSupervisorPromptSteeringReview,
  correlationId: string,
  context: AgentSupervisorPromptSteeringPolicyContext,
): AgentSupervisorReceiptRef {
  const now = (context.now ?? (() => new Date()))().toISOString();
  const canonical = stableStringify({
    request: redactAgentSupervisorPromptSteeringForLog(request),
    review,
    correlation_id: correlationId,
    created_at: now,
  });
  return {
    receipt_id: `rcpt-${makeStableId('prompt-steering', canonical)}`,
    cid: `bafy${makeStableId('agentprompt', canonical).replace(/-/g, '')}`,
    owner: 'ipfs_kit_py',
    created_at: now,
  };
}

function buildAgentSupervisorEventDag(
  receipt: AgentSupervisorReceiptRef,
  correlationId: string,
  eventType: string,
): AgentSupervisorEventDagRef | undefined {
  if (!receipt.cid) return undefined;
  const canonical = stableStringify({
    correlation_id: correlationId,
    event_type: eventType,
    receipt_cid: receipt.cid,
  });
  return {
    event_id: `evt-${makeStableId('agent-supervisor', canonical)}`,
    cid: `bafy${makeStableId('agentevent', canonical).replace(/-/g, '')}`,
    receipt_cid: receipt.cid,
    owner: 'ipfs_kit_py',
    event_type: eventType,
    created_at: receipt.created_at,
  };
}

function normalizeEventDagRef(
  value: unknown,
  receipt: AgentSupervisorReceiptRef,
): AgentSupervisorEventDagRef | undefined {
  if (!isObject(value)) return undefined;
  const receiptCid = stringOrUndefined(value.receipt_cid) ?? receipt.cid;
  const cid = stringOrUndefined(value.cid);
  if (!receiptCid || !cid) return undefined;
  if (receipt.cid && receiptCid !== receipt.cid) return undefined;
  return {
    event_id: stringOrUndefined(value.event_id) ?? makeStableId('agent-supervisor-event'),
    cid,
    receipt_cid: receiptCid,
    owner: 'ipfs_kit_py',
    event_type: stringOrUndefined(value.event_type) ?? 'governed-action-accepted',
    created_at: stringOrUndefined(value.created_at) ?? receipt.created_at,
  };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(value.filter(item => typeof item === 'string'))
    : [];
}

function arrayOfTransports(
  value: unknown,
  fallback: readonly AgentSupervisorPlannedMCPAction['transport_candidates'][number][],
): AgentSupervisorPlannedMCPAction['transport_candidates'] {
  if (!Array.isArray(value)) return fallback;
  const transports = value.filter((item): item is AgentSupervisorPlannedMCPAction['transport_candidates'][number] =>
    item === 'mcp' || item === 'mcp++' || item === 'libp2p',
  );
  return transports.length ? uniqueStrings(transports) as AgentSupervisorPlannedMCPAction['transport_candidates'] : fallback;
}

function arrayOfPolicyChecks(value: unknown): AgentSupervisorPlannedMCPAction['required_policy_checks'] {
  const allowed = new Set([
    'target_authorization',
    'task_dependencies',
    'branch_protection',
    'confirmation_policy',
    'execution_budget',
    'receipt_persistence',
  ]);
  const checks = Array.isArray(value)
    ? value.filter((item): item is AgentSupervisorPlannedMCPAction['required_policy_checks'][number] =>
      typeof item === 'string' && allowed.has(item),
    )
    : [];
  return checks.length ? uniqueStrings(checks) as AgentSupervisorPlannedMCPAction['required_policy_checks'] : [
    'target_authorization',
    'task_dependencies',
    'branch_protection',
    'confirmation_policy',
    'execution_budget',
    'receipt_persistence',
  ];
}

function policyClassFrom(value: unknown): AgentSupervisorPolicyClass | undefined {
  return value === 'read' || value === 'confirm' || value === 'privileged-control' ? value : undefined;
}

function isUnavailableReason(value: unknown): value is AgentSupervisorUnavailableReason {
  return typeof value === 'string'
    && (AGENT_SUPERVISOR_CONSOLE_CONTRACT.unavailable_states as readonly string[]).includes(value);
}

function isDeniedReason(value: unknown): value is AgentSupervisorDeniedReason {
  return typeof value === 'string'
    && (AGENT_SUPERVISOR_CONSOLE_CONTRACT.denied_states as readonly string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function uniqueStrings<T extends string>(items: readonly T[]): T[] {
  return Array.from(new Set(items)).sort();
}

function makeStableId(prefix: string, seed = `${Date.now()}:${Math.random()}`): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter(key => object[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeBrowserPayload(value: unknown): Record<string, unknown> {
  if (!isObject(value)) return {};
  // The all-app gateway performs the authoritative boundary check. This copy
  // avoids forwarding prototype-bearing browser objects into a transport.
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function consentFor(invocation: AgentSupervisorGatewayInvocation): 'granted' | 'not_required' {
  if (invocation.access === 'read') return 'not_required';
  return (invocation.payload as { confirmation_token?: unknown })?.confirmation_token ? 'granted' : 'not_required';
}

function shouldUseHelia(
  invocation: AgentSupervisorGatewayInvocation,
  result: AllAppToolGatewayResult,
): boolean {
  return result.state === 'unavailable'
    && ['supervisor.receipts.persist', 'supervisor.content.retrieve', 'supervisor.event-dag.checkpoint'].includes(invocation.capability_id);
}

function toolFailureReason(result: AllAppToolGatewayResult): AgentSupervisorUnavailableReason {
  if (result.response.outcome === 'unsupported') return 'capability_unavailable';
  if (result.response.outcome === 'unreachable') return 'transport_unavailable';
  if (result.recovery?.error === 'receipt_missing') return 'receipt_unavailable';
  return 'server_unavailable';
}

function normalizeReceipt(value: unknown, owner: AgentSupervisorBackendOwner): AgentSupervisorReceiptRef | undefined {
  if (!isObject(value) || typeof value.receipt_id !== 'string') return undefined;
  // A backend invocation receipt identifies its executing owner. Console
  // persistence receipts are normalized only when kit owns the reference.
  return {
    receipt_id: value.receipt_id,
    cid: stringOrUndefined(value.cid),
    owner: owner === 'ipfs_kit_py' ? 'ipfs_kit_py' : 'ipfs_kit_py',
    created_at: stringOrUndefined(value.created_at),
  };
}

function observation(result: AllAppToolGatewayResult, contentCid?: string) {
  const response = result.response.response as { receipt?: unknown } | null;
  const receipt = normalizeReceipt(response?.receipt, result.owner ?? 'ipfs_kit_py');
  return {
    binding_id: result.binding_id ?? undefined,
    transport: result.transport ?? undefined,
    policy_outcome: result.policy_outcome,
    content_cid: contentCid ?? receipt?.cid,
    failure_code: result.state === 'executed' ? undefined : result.response.outcome,
    recovery_action: result.recovery?.action,
  };
}

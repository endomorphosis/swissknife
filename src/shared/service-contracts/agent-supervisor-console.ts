export type AgentSupervisorConsoleContractSchema = 'swissknife.agent_supervisor_console.v1';

export type AgentSupervisorBackendOwner =
  | 'ipfs_accelerate_py'
  | 'ipfs_kit_py'
  | 'ipfs_datasets_py';

export type AgentSupervisorCapabilityAccess = 'read' | 'governed-write';

export type AgentSupervisorTransport = 'mcp' | 'mcp++' | 'libp2p';

export type AgentSupervisorPolicyClass =
  | 'read'
  | 'confirm'
  | 'privileged-control';

export type AgentSupervisorCapabilityId =
  | 'supervisor.health.read'
  | 'supervisor.queue.read'
  | 'supervisor.goals.read'
  | 'supervisor.subgoals.read'
  | 'supervisor.taskboard.links.read'
  | 'supervisor.logs.read'
  | 'supervisor.receipts.read'
  | 'supervisor.policy.assist'
  | 'supervisor.semantic-goal.assist'
  | 'supervisor.receipts.persist'
  | 'supervisor.content.retrieve'
  | 'supervisor.event-dag.checkpoint'
  | 'supervisor.run-history.search'
  | 'supervisor.prompt-steering.request'
  | 'supervisor.task-control.request'
  | 'supervisor.profile-g.read'
  | 'supervisor.schedule.frontier.read'
  | 'supervisor.neighborhood.read'
  | 'supervisor.schedule.claims.read'
  | 'supervisor.risk.read'
  | 'supervisor.goal.decompose'
  | 'supervisor.schedule.propose'
  | 'supervisor.schedule.claim'
  | 'supervisor.schedule.renew'
  | 'supervisor.schedule.release'
  | 'supervisor.schedule.reconcile';

export type AgentSupervisorUnavailableReason =
  | 'server_unavailable'
  | 'transport_unavailable'
  | 'capability_unavailable'
  | 'index_stale'
  | 'receipt_unavailable'
  | 'not_configured'
  | 'timeout'
  | 'helia_unavailable'
  | 'persistence_failed';

export type AgentSupervisorDeniedReason =
  | 'policy_denied'
  | 'confirmation_required'
  | 'dependency_blocked'
  | 'budget_exceeded'
  | 'scope_not_allowed'
  | 'invalid_target';

export interface AgentSupervisorReceiptRef {
  receipt_id: string;
  cid?: string;
  owner: 'ipfs_kit_py';
  created_at?: string;
}

export interface AgentSupervisorEventDagRef {
  event_id: string;
  cid: string;
  receipt_cid: string;
  owner: 'ipfs_kit_py';
  event_type: string;
  created_at?: string;
}

export interface AgentSupervisorCapabilityDescriptor {
  id: AgentSupervisorCapabilityId;
  title: string;
  access: AgentSupervisorCapabilityAccess;
  owner: AgentSupervisorBackendOwner;
  policy_class: AgentSupervisorPolicyClass;
  transports: readonly AgentSupervisorTransport[];
  method: string;
  input_ref: string;
  output_ref: string;
  receipt_required: boolean;
  description: string;
}

export interface AgentSupervisorOwnerDescriptor {
  owner: AgentSupervisorBackendOwner;
  responsibility: string;
  state_authority: boolean;
  evidence_authority: boolean;
  search_authority: boolean;
  governed_action_authority: boolean;
}

export interface AgentSupervisorConsoleContract {
  schema: AgentSupervisorConsoleContractSchema;
  app_id: 'agent-supervisor';
  version: string;
  browser_safe: true;
  owners: readonly AgentSupervisorOwnerDescriptor[];
  capabilities: readonly AgentSupervisorCapabilityDescriptor[];
  unavailable_states: readonly AgentSupervisorUnavailableReason[];
  denied_states: readonly AgentSupervisorDeniedReason[];
  forbidden_browser_surfaces: readonly string[];
  schema_ref: 'contracts/agent-supervisor-console.schema.json';
}

export interface AgentSupervisorGatewayInvocation<TPayload = unknown> {
  capability_id: AgentSupervisorCapabilityId;
  owner: AgentSupervisorBackendOwner;
  method: string;
  access: AgentSupervisorCapabilityAccess;
  policy_class: AgentSupervisorPolicyClass;
  payload: TPayload;
  correlation_id?: string;
}

/**
 * Transport-safe evidence attached to every runtime result.  It contains
 * identifiers and outcomes only; it intentionally never contains an owner URL,
 * credential, host path, or process detail.
 */
export interface AgentSupervisorRuntimeObservation {
  binding_id?: string;
  transport?: 'http' | 'libp2p' | 'browser-helia';
  policy_outcome?: 'allow' | 'deny' | 'require_confirmation';
  content_cid?: string;
  event_dag_cid?: string;
  failure_code?: string;
  recovery_action?: string;
}

export interface AgentSupervisorAvailableResult<TData = unknown> {
  state: 'available';
  capability_id: AgentSupervisorCapabilityId;
  owner: AgentSupervisorBackendOwner;
  data: TData;
  receipt?: AgentSupervisorReceiptRef;
  correlation_id?: string;
  observed_at?: string;
  runtime?: AgentSupervisorRuntimeObservation;
}

export interface AgentSupervisorUnavailableResult {
  state: 'unavailable';
  capability_id: AgentSupervisorCapabilityId;
  owner: AgentSupervisorBackendOwner;
  reason: AgentSupervisorUnavailableReason;
  message: string;
  retry_after_ms?: number;
  correlation_id?: string;
  runtime?: AgentSupervisorRuntimeObservation;
}

export interface AgentSupervisorDeniedResult {
  state: 'denied';
  capability_id: AgentSupervisorCapabilityId;
  owner: AgentSupervisorBackendOwner;
  reason: AgentSupervisorDeniedReason;
  message: string;
  policy_class: AgentSupervisorPolicyClass;
  decision_id?: string;
  required_confirmation?: boolean;
  correlation_id?: string;
  runtime?: AgentSupervisorRuntimeObservation;
}

export type AgentSupervisorGatewayResult<TData = unknown> =
  | AgentSupervisorAvailableResult<TData>
  | AgentSupervisorUnavailableResult
  | AgentSupervisorDeniedResult;

export interface AgentSupervisorHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  active_goal_count: number;
  queued_task_count: number;
  running_task_count: number;
  server_time?: string;
  backends: readonly {
    owner: AgentSupervisorBackendOwner;
    status: 'available' | 'degraded' | 'unavailable';
    transport: AgentSupervisorTransport;
    receipt?: AgentSupervisorReceiptRef;
  }[];
}

export interface AgentSupervisorQueueItem {
  task_id: string;
  title: string;
  status: 'ready' | 'blocked' | 'running' | 'waiting' | 'completed' | 'failed';
  goal_id?: string;
  subgoal_id?: string;
  taskboard_url?: string;
  dependencies: readonly string[];
  receipt?: AgentSupervisorReceiptRef;
}

export interface AgentSupervisorGoal {
  goal_id: string;
  title: string;
  status: 'ready' | 'blocked' | 'running' | 'completed' | 'failed';
  subgoal_ids: readonly string[];
  task_ids: readonly string[];
  taskboard_url?: string;
  receipt?: AgentSupervisorReceiptRef;
}

export interface AgentSupervisorSubgoal {
  subgoal_id: string;
  goal_id: string;
  title: string;
  status: 'ready' | 'blocked' | 'running' | 'completed' | 'failed';
  task_ids: readonly string[];
  taskboard_url?: string;
  receipt?: AgentSupervisorReceiptRef;
}

export interface AgentSupervisorTaskboardLink {
  task_id: string;
  source: 'todo' | 'github' | 'release-evidence' | 'supervisor';
  url: string;
  title: string;
  status?: string;
}

export interface AgentSupervisorLogEntry {
  log_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
  scope: 'supervisor' | 'goal' | 'subgoal' | 'task' | 'receipt';
  target_id?: string;
  redacted: boolean;
  receipt?: AgentSupervisorReceiptRef;
}

export interface AgentSupervisorRunHistoryRecord {
  run_id: string;
  goal_id?: string;
  subgoal_id?: string;
  task_id?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  receipt?: AgentSupervisorReceiptRef;
}

export interface AgentSupervisorPromptSteeringRequest {
  target_type: 'goal' | 'subgoal' | 'task';
  target_id: string;
  prompt: string;
  dry_run: boolean;
  confirmation_token?: string;
  client_request_id?: string;
  expected_normalized_target?: string;
}

export interface AgentSupervisorTaskControlRequest {
  task_id: string;
  action: 'pause' | 'resume' | 'retry' | 'cancel' | 'claim' | 'release';
  reason: string;
  dry_run: boolean;
  confirmation_token?: string;
  client_request_id?: string;
}

export interface AgentSupervisorPlannedMCPAction {
  capability_id: AgentSupervisorCapabilityId;
  method: string;
  owner: AgentSupervisorBackendOwner;
  access: AgentSupervisorCapabilityAccess;
  policy_class: AgentSupervisorPolicyClass;
  normalized_target: string;
  transport_candidates: readonly AgentSupervisorTransport[];
  input_mode: 'structured-json-payload';
  prompt_log_mode?: 'redacted';
  required_policy_checks: readonly (
    | 'target_authorization'
    | 'task_dependencies'
    | 'branch_protection'
    | 'confirmation_policy'
    | 'execution_budget'
    | 'receipt_persistence'
  )[];
}

export interface AgentSupervisorPromptSteeringReview {
  normalized_target: string;
  policy_class: AgentSupervisorPolicyClass;
  affected_task_ids: readonly string[];
  prompt_char_count: number;
  prompt_max_chars: number;
  prompt_log_preview: '[prompt redacted]';
  planned_mcp_action: AgentSupervisorPlannedMCPAction;
}

export interface AgentSupervisorGovernedActionAccepted {
  request_id: string;
  correlation_id: string;
  accepted: boolean;
  dry_run: boolean;
  normalized_target: string;
  policy_class: AgentSupervisorPolicyClass;
  affected_task_ids: readonly string[];
  planned_mcp_action: AgentSupervisorPlannedMCPAction;
  receipt: AgentSupervisorReceiptRef;
  event_dag?: AgentSupervisorEventDagRef;
}

import {
  buildAgentSupervisorExpandedIOMap,
  listExpandedIOModalityContracts,
  validateAgentSupervisorExpandedIOMap,
  type AgentSupervisorExpandedIOMap,
  type ExpandedIOAppContract,
  type ExpandedIOModality,
  type ExpandedIOModalityContract,
  type ExpandedIOPermissionScope,
  type ExpandedIORedactionPolicy,
} from '../glasses/index.js';
import { computeCID } from '../mcp/mcp-idl.js';

export const AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA =
  'swissknife.agent-supervisor-expanded-io-envelope.v1' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_SCHEMA =
  'swissknife.agent-supervisor-expanded-io-envelope-catalog.v1' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID =
  'org.hallucinate.swissknife.agent-supervisor-expanded-io-envelopes' as const;
export const AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID = 'SVD-069' as const;

export type ExpandedIOServiceFamily =
  | 'ipfs_accelerate_py'
  | 'ipfs_kit_py'
  | 'ipfs_datasets_py';

export type ExpandedIOConfirmationState =
  | 'not-required'
  | 'pending'
  | 'confirmed'
  | 'denied';

export type ExpandedIOPermissionDecision = 'permit' | 'pending' | 'deny';
export type ExpandedIODispatchState = 'ready' | 'blocked-permission' | 'suppressed-dry-run';

export interface ExpandedIOServiceBinding {
  role:
    | 'supervisor-job-execution'
    | 'artifact-storage'
    | 'event-dag-storage'
    | 'indexing'
    | 'provenance'
    | 'search';
  service_family: ExpandedIOServiceFamily;
  tool_name: string;
  responsibility: string;
  dispatch_state: ExpandedIODispatchState;
}

export interface ExpandedIOPermissionEnvelope {
  scope: ExpandedIOPermissionScope;
  decision: ExpandedIOPermissionDecision;
  confirmation_state: ExpandedIOConfirmationState;
  confirmation_required: boolean;
  execution_allowed: boolean;
  reason: string;
}

export interface ExpandedIOEventDagReference {
  event_cid: string;
  parents: readonly string[];
  event_type: 'expanded-io.permission-and-dispatch';
  storage_service_family: 'ipfs_kit_py';
  storage_tool_name: 'dag_put';
  state: 'simulated' | 'expected';
}

export interface ExpandedIORollbackBehavior {
  rollback_token: string;
  mode: 'no-mutation' | 'compensating-receipt';
  trigger_states: readonly ('cancelled' | 'timed-out' | 'partial-failure' | 'permission-revoked')[];
  preserves_receipt: true;
  preserves_event_dag: true;
  semantics: string;
}

export interface ExpandedIOTimeoutCancelBehavior {
  timeout_ms: number;
  on_timeout: 'cancel-job-preserve-receipt-and-fallback';
  cancel_supported: true;
  cancel_service_family: 'ipfs_accelerate_py';
  cancel_tool_name: 'cancel_task';
  cancellation_signal: 'AbortSignal';
  on_cancel: 'stop-device-io-preserve-receipt-and-fallback';
  fallback_order: readonly ['mobile-card', 'desktop-only'];
}

export interface ExpandedIODryRunBehavior {
  enabled: boolean;
  safe: true;
  device_io_performed: false;
  supervisor_job_dispatched: false | 'only-when-disabled-and-permitted';
  artifact_payload_persisted: false | 'only-when-disabled-and-permitted';
  event_dag_persisted: false | 'only-when-disabled-and-permitted';
  index_or_provenance_written: false | 'only-when-disabled-and-permitted';
  receipt_kind: 'deterministic-simulation' | 'execution';
  summary: string;
}

export interface AgentSupervisorExpandedIOEnvelope {
  schema: typeof AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA;
  task_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID;
  envelope_id: string;
  envelope_cid: string;
  correlation_id: string;
  source_map_cid: string;
  source_contract_cid: string;
  app_id: string;
  action_id: string;
  modality: ExpandedIOModality;
  binding: string | null;
  disposition: ExpandedIOModalityContract['disposition'];
  service_family: 'ipfs_accelerate_py';
  tool_name: 'WorkflowCoordinator.submit_task';
  permission_scope: ExpandedIOPermissionScope;
  redaction_policy: ExpandedIORedactionPolicy;
  confirmation_state: ExpandedIOConfirmationState;
  permission: ExpandedIOPermissionEnvelope;
  receipt_cid: string;
  event_dag_ref: string;
  event_dag_refs: readonly [ExpandedIOEventDagReference];
  rollback_token: string;
  rollback: ExpandedIORollbackBehavior;
  timeout_ms: number;
  cancel_supported: true;
  timeout_cancel: ExpandedIOTimeoutCancelBehavior;
  dry_run: boolean;
  dry_run_behavior: ExpandedIODryRunBehavior;
  service_bindings: readonly ExpandedIOServiceBinding[];
  fallback_order: readonly ['mobile-card', 'desktop-only'];
  operator_visible: true;
  physical_hardware_claimed: false;
}

export interface AgentSupervisorExpandedIOEnvelopeCatalog {
  schema: typeof AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_SCHEMA;
  catalog_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID;
  catalog_cid: string;
  task_id: typeof AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID;
  generated_at: string;
  generated_from: readonly string[];
  source_map_cid: string;
  safe_dry_run: boolean;
  physical_hardware_claimed: false;
  app_count: number;
  envelope_count: number;
  permission_decision_counts: Record<ExpandedIOPermissionDecision, number>;
  confirmation_state_counts: Record<ExpandedIOConfirmationState, number>;
  modality_counts: Record<ExpandedIOModality, number>;
  service_role_counts: Record<ExpandedIOServiceBinding['role'], number>;
  envelopes: readonly AgentSupervisorExpandedIOEnvelope[];
}

export interface BuildExpandedIOEnvelopeOptions {
  generatedAt?: string;
  generatedFrom?: readonly string[];
  dryRun?: boolean;
  timeoutMs?: number | Partial<Record<ExpandedIOModality, number>>;
  confirmationStates?: Readonly<Record<string, ExpandedIOConfirmationState>>;
}

export interface ExpandedIOEnvelopeValidationResult {
  valid: boolean;
  errors: string[];
}

const DEFAULT_TIMEOUTS: Record<ExpandedIOModality, number> = {
  'display.output': 5_000,
  'camera.photo_capture': 15_000,
  'camera.video_capture': 60_000,
  'microphone.input': 30_000,
  'microphone.transcription': 45_000,
  'speaker.output': 30_000,
  'headphone.output': 30_000,
};

const SERVICE_BINDING_DEFINITIONS: ReadonlyArray<Omit<ExpandedIOServiceBinding, 'dispatch_state'>> = [
  {
    role: 'supervisor-job-execution',
    service_family: 'ipfs_accelerate_py',
    tool_name: 'WorkflowCoordinator.submit_task',
    responsibility: 'Execute and supervise the bounded glasses I/O job.',
  },
  {
    role: 'artifact-storage',
    service_family: 'ipfs_kit_py',
    tool_name: 'ipfs_add',
    responsibility: 'Store a permitted redacted media or projection artifact by CID.',
  },
  {
    role: 'event-dag-storage',
    service_family: 'ipfs_kit_py',
    tool_name: 'dag_put',
    responsibility: 'Persist receipt-linked permission and execution events as a DAG.',
  },
  {
    role: 'indexing',
    service_family: 'ipfs_datasets_py',
    tool_name: 'load_index',
    responsibility: 'Index redacted artifact metadata after a permitted execution.',
  },
  {
    role: 'provenance',
    service_family: 'ipfs_datasets_py',
    tool_name: 'record_provenance',
    responsibility: 'Record receipt, artifact, policy, and event-DAG lineage.',
  },
  {
    role: 'search',
    service_family: 'ipfs_datasets_py',
    tool_name: 'semantic_search',
    responsibility: 'Search only the redacted indexed metadata authorized for retrieval.',
  },
];

/**
 * Build the complete MCP++ permission/receipt catalog. The default is a safe
 * dry run: it calculates policy decisions and content addresses but cannot
 * touch a device, submit a job, or write an artifact/index.
 */
export function buildAgentSupervisorExpandedIOEnvelopes(
  ioMap: AgentSupervisorExpandedIOMap = buildAgentSupervisorExpandedIOMap(),
  options: BuildExpandedIOEnvelopeOptions = {},
): AgentSupervisorExpandedIOEnvelopeCatalog {
  const mapValidation = validateAgentSupervisorExpandedIOMap(ioMap);
  if (!mapValidation.valid) {
    throw new Error(`Cannot build expanded I/O envelopes from an invalid map: ${mapValidation.errors.join('; ')}`);
  }

  const dryRun = options.dryRun ?? true;
  const envelopes = ioMap.contracts.flatMap(contract =>
    listExpandedIOModalityContracts(contract).map(modality =>
      buildAgentSupervisorExpandedIOEnvelope(ioMap, contract, modality, { ...options, dryRun }),
    ),
  ).sort((left, right) => left.envelope_id.localeCompare(right.envelope_id));

  const withoutCid = {
    schema: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_SCHEMA,
    catalog_id: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID,
    task_id: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID,
    generated_at: options.generatedAt ?? '2026-07-14T00:00:00.000Z',
    generated_from: [...(options.generatedFrom ?? [
      'src/services/glasses/agent-supervisor-expanded-io-map.ts',
      'src/services/apps/agent-supervisor-expanded-io-envelopes.ts',
      'implementation_plan/docs/37-swissknife-virtual-desktop-ipfs-mcp-orb-meta-glasses-plan-2026-07-07.md#SVD-069',
    ])].sort(),
    source_map_cid: ioMap.map_cid,
    safe_dry_run: dryRun,
    physical_hardware_claimed: false as const,
    app_count: new Set(envelopes.map(envelope => envelope.app_id)).size,
    envelope_count: envelopes.length,
    permission_decision_counts: countByValues(envelopes, envelope => envelope.permission.decision, [
      'permit', 'pending', 'deny',
    ] as const),
    confirmation_state_counts: countByValues(envelopes, envelope => envelope.confirmation_state, [
      'not-required', 'pending', 'confirmed', 'denied',
    ] as const),
    modality_counts: countByValues(envelopes, envelope => envelope.modality, [
      'display.output', 'camera.photo_capture', 'camera.video_capture', 'microphone.input',
      'microphone.transcription', 'speaker.output', 'headphone.output',
    ] as const),
    service_role_counts: countByValues(envelopes.flatMap(envelope => envelope.service_bindings), binding => binding.role, [
      'supervisor-job-execution', 'artifact-storage', 'event-dag-storage', 'indexing', 'provenance', 'search',
    ] as const),
    envelopes,
  };
  return { ...withoutCid, catalog_cid: stableCid(withoutCid) };
}

/** Build one deterministic envelope from a reviewed SVD-068 modality. */
export function buildAgentSupervisorExpandedIOEnvelope(
  ioMap: AgentSupervisorExpandedIOMap,
  app: ExpandedIOAppContract,
  modality: ExpandedIOModalityContract,
  options: BuildExpandedIOEnvelopeOptions = {},
): AgentSupervisorExpandedIOEnvelope {
  const dryRun = options.dryRun ?? true;
  const confirmationState = confirmationStateFor(app, modality, options.confirmationStates);
  const permissionDecision = permissionDecisionFor(modality, confirmationState);
  const executionAllowed = !dryRun && modality.safe_path && permissionDecision === 'permit';
  const dispatchState: ExpandedIODispatchState = dryRun
    ? 'suppressed-dry-run'
    : executionAllowed ? 'ready' : 'blocked-permission';
  const timeoutMs = timeoutFor(modality.modality, options.timeoutMs);
  const correlationId = `svd-069:${app.app_id}:${modality.modality.replace('.', ':')}`;
  const actionId = modality.binding ?? `${app.app_id}.deny-${modality.modality.replace('.', '-')}`;
  const receiptCid = stableCid({
    schema: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA,
    kind: dryRun ? 'dry-run-receipt' : 'execution-receipt',
    correlation_id: correlationId,
    source_contract_cid: app.contract_cid,
    action_id: actionId,
    permission_scope: requiredPermissionScope(modality),
    permission_decision: permissionDecision,
    confirmation_state: confirmationState,
    redaction_policy: modality.redaction_policy,
  });
  const eventDagRef = stableCid({
    event_type: 'expanded-io.permission-and-dispatch',
    correlation_id: correlationId,
    receipt_cid: receiptCid,
    source_map_cid: ioMap.map_cid,
  });
  const rollbackToken = `rollback:${stableCid({ correlation_id: correlationId, receipt_cid: receiptCid })}`;
  const serviceBindings = SERVICE_BINDING_DEFINITIONS.map(binding => ({ ...binding, dispatch_state: dispatchState }));
  const timeoutCancel: ExpandedIOTimeoutCancelBehavior = {
    timeout_ms: timeoutMs,
    on_timeout: 'cancel-job-preserve-receipt-and-fallback',
    cancel_supported: true,
    cancel_service_family: 'ipfs_accelerate_py',
    cancel_tool_name: 'cancel_task',
    cancellation_signal: 'AbortSignal',
    on_cancel: 'stop-device-io-preserve-receipt-and-fallback',
    fallback_order: ['mobile-card', 'desktop-only'],
  };
  const rollback: ExpandedIORollbackBehavior = {
    rollback_token: rollbackToken,
    mode: executionAllowed ? 'compensating-receipt' : 'no-mutation',
    trigger_states: ['cancelled', 'timed-out', 'partial-failure', 'permission-revoked'],
    preserves_receipt: true,
    preserves_event_dag: true,
    semantics: executionAllowed
      ? 'Cancel device I/O, restore the prior safe projection, and append a compensating receipt to the event DAG.'
      : 'No mutation is authorized; preserve the permission receipt and the prior safe projection.',
  };
  const permission: ExpandedIOPermissionEnvelope = {
    scope: requiredPermissionScope(modality),
    decision: permissionDecision,
    confirmation_state: confirmationState,
    confirmation_required: modality.confirmation_required,
    execution_allowed: executionAllowed,
    reason: permissionReason(modality, confirmationState, dryRun),
  };
  const dryRunBehavior: ExpandedIODryRunBehavior = {
    enabled: dryRun,
    safe: true,
    device_io_performed: false,
    supervisor_job_dispatched: dryRun ? false : 'only-when-disabled-and-permitted',
    artifact_payload_persisted: dryRun ? false : 'only-when-disabled-and-permitted',
    event_dag_persisted: dryRun ? false : 'only-when-disabled-and-permitted',
    index_or_provenance_written: dryRun ? false : 'only-when-disabled-and-permitted',
    receipt_kind: dryRun ? 'deterministic-simulation' : 'execution',
    summary: dryRun
      ? 'Policy and receipt CIDs are simulated locally; no device access, job dispatch, payload persistence, DAG write, or index mutation occurs.'
      : 'Backend and device I/O remain gated by the envelope permission decision and confirmation state.',
  };
  const withoutCid = {
    schema: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA,
    task_id: AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID,
    envelope_id: `${AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID}/${app.app_id}/${modality.modality}`,
    correlation_id: correlationId,
    source_map_cid: ioMap.map_cid,
    source_contract_cid: app.contract_cid,
    app_id: app.app_id,
    action_id: actionId,
    modality: modality.modality,
    binding: modality.binding,
    disposition: modality.disposition,
    service_family: 'ipfs_accelerate_py' as const,
    tool_name: 'WorkflowCoordinator.submit_task' as const,
    permission_scope: requiredPermissionScope(modality),
    redaction_policy: modality.redaction_policy,
    confirmation_state: confirmationState,
    permission,
    receipt_cid: receiptCid,
    event_dag_ref: eventDagRef,
    event_dag_refs: [{
      event_cid: eventDagRef,
      parents: [receiptCid],
      event_type: 'expanded-io.permission-and-dispatch' as const,
      storage_service_family: 'ipfs_kit_py' as const,
      storage_tool_name: 'dag_put' as const,
      state: dryRun ? 'simulated' as const : 'expected' as const,
    }] as const,
    rollback_token: rollbackToken,
    rollback,
    timeout_ms: timeoutMs,
    cancel_supported: true as const,
    timeout_cancel: timeoutCancel,
    dry_run: dryRun,
    dry_run_behavior: dryRunBehavior,
    service_bindings: serviceBindings,
    fallback_order: ['mobile-card', 'desktop-only'] as const,
    operator_visible: true as const,
    physical_hardware_claimed: false as const,
  };
  return { ...withoutCid, envelope_cid: stableCid(withoutCid) };
}

/** Validate loaded evidence as strictly as an in-memory catalog. */
export function validateAgentSupervisorExpandedIOEnvelopes(
  catalog: AgentSupervisorExpandedIOEnvelopeCatalog,
  ioMap: AgentSupervisorExpandedIOMap = buildAgentSupervisorExpandedIOMap(),
): ExpandedIOEnvelopeValidationResult {
  const errors: string[] = [];
  const expectedCount = ioMap.contracts.length * 7;
  if (catalog.schema !== AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_SCHEMA) errors.push('catalog schema is not the SVD-069 schema');
  if (catalog.catalog_id !== AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_CATALOG_ID) errors.push('catalog_id is not canonical');
  if (catalog.task_id !== AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_TASK_ID) errors.push('task_id must be SVD-069');
  if (catalog.source_map_cid !== ioMap.map_cid) errors.push('source_map_cid does not match the SVD-068 map');
  if (catalog.physical_hardware_claimed !== false) errors.push('physical hardware must not be claimed');
  if (catalog.envelope_count !== expectedCount || catalog.envelopes.length !== expectedCount) {
    errors.push(`envelope catalog must contain all ${expectedCount} app/modality pairs`);
  }
  if (catalog.app_count !== ioMap.contracts.length) errors.push('app_count does not match the expanded I/O map');
  if (new Set(catalog.envelopes.map(envelope => envelope.envelope_id)).size !== catalog.envelopes.length) {
    errors.push('duplicate envelope ids are not allowed');
  }

  const actualPermissionCounts = countByValues(catalog.envelopes, envelope => envelope.permission.decision, [
    'permit', 'pending', 'deny',
  ] as const);
  const actualConfirmationCounts = countByValues(catalog.envelopes, envelope => envelope.confirmation_state, [
    'not-required', 'pending', 'confirmed', 'denied',
  ] as const);
  const actualModalityCounts = countByValues(catalog.envelopes, envelope => envelope.modality, [
    'display.output', 'camera.photo_capture', 'camera.video_capture', 'microphone.input',
    'microphone.transcription', 'speaker.output', 'headphone.output',
  ] as const);
  const actualRoleCounts = countByValues(
    catalog.envelopes.flatMap(envelope => envelope.service_bindings),
    binding => binding.role,
    ['supervisor-job-execution', 'artifact-storage', 'event-dag-storage', 'indexing', 'provenance', 'search'] as const,
  );
  if (!sameRecord(catalog.permission_decision_counts, actualPermissionCounts)) errors.push('permission_decision_counts do not match envelopes');
  if (!sameRecord(catalog.confirmation_state_counts, actualConfirmationCounts)) errors.push('confirmation_state_counts do not match envelopes');
  if (!sameRecord(catalog.modality_counts, actualModalityCounts)) errors.push('modality_counts do not match envelopes');
  if (!sameRecord(catalog.service_role_counts, actualRoleCounts)) errors.push('service_role_counts do not match envelopes');

  const byContract = new Map(ioMap.contracts.map(contract => [contract.app_id, contract]));
  for (const envelope of catalog.envelopes) {
    const label = `${envelope.app_id}/${envelope.modality}`;
    const contract = byContract.get(envelope.app_id);
    const modality = contract && listExpandedIOModalityContracts(contract)
      .find(candidate => candidate.modality === envelope.modality);
    if (!modality) errors.push(`${label}: no matching SVD-068 modality contract`);
    if (envelope.schema !== AGENT_SUPERVISOR_EXPANDED_IO_ENVELOPE_SCHEMA) errors.push(`${label}: invalid envelope schema`);
    if (envelope.source_map_cid !== ioMap.map_cid) errors.push(`${label}: source map CID mismatch`);
    if (contract && envelope.source_contract_cid !== contract.contract_cid) errors.push(`${label}: source contract CID mismatch`);
    if (modality && (
      envelope.permission_scope !== modality.permission_scope
      || envelope.redaction_policy !== modality.redaction_policy
      || envelope.binding !== modality.binding
    )) errors.push(`${label}: permission, redaction, or binding drifted from SVD-068`);
    if (!isCid(envelope.receipt_cid) || !isCid(envelope.event_dag_ref)) errors.push(`${label}: receipt and event-DAG refs must be CIDs`);
    if (!envelope.rollback_token.startsWith('rollback:sha256:')) errors.push(`${label}: rollback token is not content addressed`);
    if (envelope.timeout_ms <= 0 || !envelope.cancel_supported) errors.push(`${label}: timeout/cancel behavior is incomplete`);
    if (envelope.confirmation_state !== envelope.permission.confirmation_state) errors.push(`${label}: confirmation state is inconsistent`);
    if (envelope.permission_scope !== envelope.permission.scope) errors.push(`${label}: permission scope is inconsistent`);
    if (envelope.permission.execution_allowed && envelope.permission.decision !== 'permit') {
      errors.push(`${label}: execution is allowed without a permit decision`);
    }
    if (envelope.confirmation_state === 'pending' && envelope.permission.decision !== 'pending') {
      errors.push(`${label}: pending confirmation must produce a pending permission decision`);
    }
    if (envelope.confirmation_state === 'denied' && envelope.permission.decision !== 'deny') {
      errors.push(`${label}: denied confirmation must produce a deny decision`);
    }
    if (envelope.event_dag_refs.length !== 1
      || envelope.event_dag_refs[0].event_cid !== envelope.event_dag_ref
      || envelope.event_dag_refs[0].parents[0] !== envelope.receipt_cid) {
      errors.push(`${label}: event-DAG lineage does not point to the receipt`);
    }
    if (envelope.rollback.rollback_token !== envelope.rollback_token
      || !envelope.rollback.preserves_receipt
      || !envelope.rollback.preserves_event_dag) {
      errors.push(`${label}: rollback does not preserve receipt and event-DAG lineage`);
    }
    if (envelope.timeout_cancel.timeout_ms !== envelope.timeout_ms
      || envelope.timeout_cancel.cancel_supported !== envelope.cancel_supported
      || envelope.timeout_cancel.cancel_service_family !== 'ipfs_accelerate_py'
      || envelope.timeout_cancel.cancel_tool_name !== 'cancel_task') {
      errors.push(`${label}: timeout/cancel fields are inconsistent`);
    }
    if (envelope.physical_hardware_claimed) errors.push(`${label}: physical hardware must not be claimed`);
    validateServices(envelope, errors);
    if (catalog.safe_dry_run) {
      if (!envelope.dry_run || !envelope.dry_run_behavior.safe
        || envelope.dry_run_behavior.device_io_performed
        || envelope.permission.execution_allowed
        || envelope.service_bindings.some(binding => binding.dispatch_state !== 'suppressed-dry-run')) {
        errors.push(`${label}: safe dry-run attempted or enabled execution`);
      }
    }
    if (envelope.dry_run !== catalog.safe_dry_run) errors.push(`${label}: dry-run mode differs from its catalog`);
    if (!envelope.dry_run_behavior.safe || envelope.dry_run_behavior.device_io_performed) {
      errors.push(`${label}: envelope construction must never perform device I/O`);
    }
    const { envelope_cid: _envelopeCid, ...withoutCid } = envelope;
    if (envelope.envelope_cid !== stableCid(withoutCid)) errors.push(`${label}: envelope_cid does not match the envelope body`);
  }

  const { catalog_cid: _catalogCid, ...withoutCid } = catalog;
  if (catalog.catalog_cid !== stableCid(withoutCid)) errors.push('catalog_cid does not match the catalog body');
  return { valid: errors.length === 0, errors };
}

export const buildExpandedIOEnvelopeCatalog = buildAgentSupervisorExpandedIOEnvelopes;
export const validateExpandedIOEnvelopeCatalog = validateAgentSupervisorExpandedIOEnvelopes;

function confirmationStateFor(
  app: ExpandedIOAppContract,
  modality: ExpandedIOModalityContract,
  states: BuildExpandedIOEnvelopeOptions['confirmationStates'],
): ExpandedIOConfirmationState {
  if (!modality.safe_path || modality.disposition === 'denied' || modality.disposition === 'desktop-only') return 'denied';
  if (!modality.confirmation_required) return 'not-required';
  const requested = states?.[`${app.app_id}/${modality.modality}`];
  return requested === 'confirmed' || requested === 'denied' || requested === 'pending' ? requested : 'pending';
}

function permissionDecisionFor(
  modality: ExpandedIOModalityContract,
  state: ExpandedIOConfirmationState,
): ExpandedIOPermissionDecision {
  if (!modality.safe_path || state === 'denied') return 'deny';
  if (state === 'pending') return 'pending';
  return 'permit';
}

function permissionReason(
  modality: ExpandedIOModalityContract,
  state: ExpandedIOConfirmationState,
  dryRun: boolean,
): string {
  if (dryRun) return 'Safe dry-run suppresses execution while preserving the evaluated permission decision.';
  if (!modality.safe_path || state === 'denied') return modality.reason;
  if (state === 'pending') return 'A visible scoped confirmation is required before supervisor dispatch.';
  return 'The reviewed binding and scoped permission permit supervisor dispatch.';
}

function requiredPermissionScope(modality: ExpandedIOModalityContract): ExpandedIOPermissionScope {
  if (!modality.permission_scope) throw new Error(`${modality.modality} is missing a permission scope`);
  return modality.permission_scope;
}

function timeoutFor(
  modality: ExpandedIOModality,
  option: BuildExpandedIOEnvelopeOptions['timeoutMs'],
): number {
  const value = typeof option === 'number' ? option : option?.[modality] ?? DEFAULT_TIMEOUTS[modality];
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid timeout for ${modality}: ${String(value)}`);
  return value;
}

function validateServices(envelope: AgentSupervisorExpandedIOEnvelope, errors: string[]): void {
  const label = `${envelope.app_id}/${envelope.modality}`;
  if (envelope.service_family !== 'ipfs_accelerate_py' || envelope.tool_name !== 'WorkflowCoordinator.submit_task') {
    errors.push(`${label}: supervisor/job execution must use ipfs_accelerate_py`);
  }
  const expected: Array<[ExpandedIOServiceBinding['role'], ExpandedIOServiceFamily, string]> = [
    ['supervisor-job-execution', 'ipfs_accelerate_py', 'WorkflowCoordinator.submit_task'],
    ['artifact-storage', 'ipfs_kit_py', 'ipfs_add'],
    ['event-dag-storage', 'ipfs_kit_py', 'dag_put'],
    ['indexing', 'ipfs_datasets_py', 'load_index'],
    ['provenance', 'ipfs_datasets_py', 'record_provenance'],
    ['search', 'ipfs_datasets_py', 'semantic_search'],
  ];
  for (const [role, family, tool] of expected) {
    if (!envelope.service_bindings.some(binding =>
      binding.role === role && binding.service_family === family && binding.tool_name === tool)) {
      errors.push(`${label}: ${role} is not assigned to ${family}:${tool}`);
    }
  }
}

function countByValues<T, K extends string>(
  values: readonly T[],
  select: (value: T) => K,
  keys: readonly K[],
): Record<K, number> {
  const result = Object.fromEntries(keys.map(key => [key, 0])) as Record<K, number>;
  for (const value of values) result[select(value)] += 1;
  return result;
}

function sameRecord<K extends string>(left: Record<K, number>, right: Record<K, number>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableCid(value: unknown): string {
  return computeCID(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function isCid(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value);
}

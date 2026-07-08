import type {
  ORBInvocationReceipt,
  ORBStreamEvent,
} from './mcp-orb-capability-router.js';

export type GeneratedAppReplayEventType =
  | 'command.dispatched'
  | 'command.resolved'
  | 'stream.started'
  | 'stream.event'
  | 'stream.recovered'
  | 'stream.stale_rejected'
  | 'workflow.step.completed'
  | 'projection.updated';

export interface GeneratedAppReplayEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  app_id: string;
  app_instance_id: string;
  descriptor_name?: string;
  descriptor_version?: string;
  interface_cid?: string;
  sequence: number;
  type: GeneratedAppReplayEventType;
  at: string;
  payload: TPayload;
}

export interface GeneratedAppReplayStorage {
  load(appInstanceId: string): Promise<GeneratedAppReplayEvent[]> | GeneratedAppReplayEvent[];
  save(appInstanceId: string, events: GeneratedAppReplayEvent[]): Promise<void> | void;
}

export interface GeneratedCommandState {
  correlation_id: string;
  operation: string;
  status: 'dispatched' | 'resolved';
  input?: unknown;
  output?: unknown;
  receipt_cid?: string;
  updated_at: string;
}

export interface GeneratedStreamGuard {
  operation: string;
  correlation_id: string;
  binding_handle: string;
  binding_generation: number;
  generation_key?: string;
  recovered_at?: string;
}

export interface GeneratedAuditEntry {
  kind: 'command' | 'receipt' | 'stream' | 'stale_stream' | 'workflow_step';
  correlation_id: string;
  operation?: string;
  step_id?: string;
  status?: string;
  receipt_cid?: string;
  interface_cid?: string;
  event_cid?: string;
  binding_handle?: string;
  binding_generation?: number;
  artifact_cids: string[];
  provenance_refs: string[];
  output_refs: string[];
  at: string;
  source_sequence: number;
}

export interface GeneratedAuditProjection {
  entries: GeneratedAuditEntry[];
  by_correlation_id: Record<string, GeneratedAuditEntry[]>;
  artifact_lineage: Record<string, string[]>;
}

export interface GeneratedWorkflowStepState {
  step_id: string;
  operation: string;
  status: string;
  output?: unknown;
  receipt_cid?: string;
  updated_at: string;
}

export interface GeneratedWorkflowProjection {
  workflow_id: string;
  step_order: string[];
  steps: Record<string, GeneratedWorkflowStepState>;
  shared_state: Record<string, unknown>;
  updated_at?: string;
}

export interface GeneratedAppProjectionState {
  app_id: string;
  app_instance_id: string;
  replay_event_count: number;
  commands: Record<string, GeneratedCommandState>;
  command_order: string[];
  active_streams: Record<string, GeneratedStreamGuard>;
  stream_events: ORBStreamEvent[];
  stale_stream_events: Array<{
    operation: string;
    correlation_id: string;
    reason: string;
    event: unknown;
    rejected_at: string;
  }>;
  workflows: Record<string, GeneratedWorkflowProjection>;
  projections: Record<string, unknown>;
  audit: GeneratedAuditProjection;
}

export interface GeneratedAppStateManagerOptions {
  app_id: string;
  app_instance_id: string;
  descriptor_name?: string;
  descriptor_version?: string;
  interface_cid?: string;
  storage?: GeneratedAppReplayStorage;
  strict_stream_guards?: boolean;
  now?: () => string;
}

export interface GeneratedCommandDispatch {
  operation: string;
  input: unknown;
  correlation_id?: string;
}

export interface GeneratedCommandResolution {
  correlation_id: string;
  output: unknown;
  receipt?: ORBInvocationReceipt;
}

export interface GeneratedStreamStart {
  operation: string;
  correlation_id: string;
  binding_handle: string;
  binding_generation: number;
  generation_key?: string;
}

export interface GeneratedStreamRecord {
  operation: string;
  correlation_id: string;
  event: ORBStreamEvent;
  binding_handle?: string;
  binding_generation?: number;
  generation_key?: string;
}

export interface GeneratedStreamRecordResult {
  accepted: boolean;
  reason?: string;
}

export interface GeneratedWorkflowStepCompletion {
  workflow_id?: string;
  step_id: string;
  operation: string;
  correlation_id: string;
  status: 'completed' | 'failed' | 'compensated' | 'rolled_back';
  output?: unknown;
  receipt?: ORBInvocationReceipt;
  artifact_cids?: string[];
  shared_state_updates?: Record<string, unknown>;
}

export class MemoryGeneratedAppReplayStorage implements GeneratedAppReplayStorage {
  private readonly eventsByInstance = new Map<string, GeneratedAppReplayEvent[]>();

  load(appInstanceId: string): GeneratedAppReplayEvent[] {
    return [...(this.eventsByInstance.get(appInstanceId) ?? [])];
  }

  save(appInstanceId: string, events: GeneratedAppReplayEvent[]): void {
    this.eventsByInstance.set(appInstanceId, events.map(event => cloneReplayEvent(event)));
  }
}

export class GeneratedAppStateManager {
  private readonly appId: string;
  private readonly appInstanceId: string;
  private readonly storage: GeneratedAppReplayStorage;
  private readonly descriptorName?: string;
  private readonly descriptorVersion?: string;
  private readonly interfaceCid?: string;
  private readonly strictStreamGuards: boolean;
  private readonly now: () => string;
  private events: GeneratedAppReplayEvent[] = [];
  private state: GeneratedAppProjectionState;

  constructor(options: GeneratedAppStateManagerOptions) {
    this.appId = options.app_id;
    this.appInstanceId = options.app_instance_id;
    this.descriptorName = options.descriptor_name;
    this.descriptorVersion = options.descriptor_version;
    this.interfaceCid = options.interface_cid;
    this.storage = options.storage ?? new MemoryGeneratedAppReplayStorage();
    this.strictStreamGuards = options.strict_stream_guards ?? true;
    this.now = options.now ?? (() => new Date().toISOString());
    this.state = emptyGeneratedAppState(this.appId, this.appInstanceId);
  }

  async restore(): Promise<GeneratedAppProjectionState> {
    this.events = normalizeReplayEvents(await this.storage.load(this.appInstanceId));
    this.state = replayGeneratedAppState(this.appId, this.appInstanceId, this.events);
    return this.getState();
  }

  getReplayLog(): GeneratedAppReplayEvent[] {
    return this.events.map(event => cloneReplayEvent(event));
  }

  getState(): GeneratedAppProjectionState {
    return cloneProjectionState(this.state);
  }

  async dispatchCommand(command: GeneratedCommandDispatch): Promise<GeneratedAppReplayEvent> {
    return this.append('command.dispatched', {
      operation: command.operation,
      input: command.input,
      correlation_id: command.correlation_id ?? createCorrelationId(this.appInstanceId, this.events.length + 1),
    });
  }

  async resolveCommand(resolution: GeneratedCommandResolution): Promise<GeneratedAppReplayEvent> {
    return this.append('command.resolved', {
      correlation_id: resolution.correlation_id,
      output: resolution.output,
      receipt_cid: resolution.receipt?.receipt_cid,
      receipt: resolution.receipt,
    });
  }

  async startStream(stream: GeneratedStreamStart): Promise<GeneratedAppReplayEvent> {
    return this.append('stream.started', { ...stream });
  }

  async recoverStream(stream: GeneratedStreamStart): Promise<GeneratedAppReplayEvent> {
    return this.append('stream.recovered', { ...stream });
  }

  async recordStreamEvent(record: GeneratedStreamRecord): Promise<GeneratedStreamRecordResult> {
    const reason = staleStreamReason(record, this.state, this.strictStreamGuards)
      ?? duplicateStreamReason(record, this.state);
    if (reason) {
      await this.append('stream.stale_rejected', {
        operation: record.operation,
        correlation_id: record.correlation_id,
        reason,
        event: record.event,
      });
      return { accepted: false, reason };
    }

    await this.append('stream.event', {
      operation: record.operation,
      correlation_id: record.correlation_id,
      binding_handle: record.binding_handle ?? record.event.binding_handle,
      binding_generation: record.binding_generation ?? record.event.binding_generation,
      generation_key: record.generation_key ?? record.event.generation_key,
      event: record.event,
    });
    return { accepted: true };
  }

  async recordWorkflowStep(step: GeneratedWorkflowStepCompletion): Promise<GeneratedAppReplayEvent> {
    return this.append('workflow.step.completed', {
      workflow_id: step.workflow_id,
      step_id: step.step_id,
      operation: step.operation,
      correlation_id: step.correlation_id,
      status: step.status,
      output: step.output,
      receipt_cid: step.receipt?.receipt_cid,
      receipt: step.receipt,
      artifact_cids: step.artifact_cids,
      shared_state_updates: step.shared_state_updates,
    });
  }

  async updateProjection(name: string, value: unknown): Promise<GeneratedAppReplayEvent> {
    return this.append('projection.updated', { name, value });
  }

  private async append(
    type: GeneratedAppReplayEventType,
    payload: Record<string, unknown>,
  ): Promise<GeneratedAppReplayEvent> {
    const event: GeneratedAppReplayEvent = {
      id: `${this.appInstanceId}:${this.events.length + 1}`,
      app_id: this.appId,
      app_instance_id: this.appInstanceId,
      descriptor_name: this.descriptorName,
      descriptor_version: this.descriptorVersion,
      interface_cid: this.interfaceCid,
      sequence: this.events.length + 1,
      type,
      at: this.now(),
      payload,
    };
    this.events = [...this.events, event];
    this.state = replayGeneratedAppState(this.appId, this.appInstanceId, this.events);
    await this.storage.save(this.appInstanceId, this.events);
    return cloneReplayEvent(event);
  }
}

export async function restoreGeneratedAppState(options: GeneratedAppStateManagerOptions): Promise<GeneratedAppStateManager> {
  const manager = new GeneratedAppStateManager(options);
  await manager.restore();
  return manager;
}

export function replayGeneratedAppState(
  appId: string,
  appInstanceId: string,
  events: GeneratedAppReplayEvent[],
): GeneratedAppProjectionState {
  const state = emptyGeneratedAppState(appId, appInstanceId);
  for (const event of normalizeReplayEvents(events)) {
    state.replay_event_count += 1;
    applyReplayEvent(state, event);
  }
  return state;
}

function applyReplayEvent(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  switch (event.type) {
    case 'command.dispatched':
      applyCommandDispatched(state, event);
      break;
    case 'command.resolved':
      applyCommandResolved(state, event);
      break;
    case 'stream.started':
    case 'stream.recovered':
      applyStreamGuard(state, event);
      break;
    case 'stream.event':
      applyStreamEvent(state, event);
      break;
    case 'stream.stale_rejected':
      applyStaleStreamEvent(state, event);
      break;
    case 'workflow.step.completed':
      applyWorkflowStepCompleted(state, event);
      break;
    case 'projection.updated':
      applyProjectionUpdated(state, event);
      break;
    default:
      break;
  }
}

function applyCommandDispatched(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const correlationId = stringPayload(event, 'correlation_id');
  const operation = stringPayload(event, 'operation');
  if (!correlationId || !operation) {
    return;
  }
  if (!state.commands[correlationId]) {
    state.command_order.push(correlationId);
  }
  state.commands[correlationId] = {
    correlation_id: correlationId,
    operation,
    status: 'dispatched',
    input: event.payload.input,
    updated_at: event.at,
  };
  indexAuditEntry(state, auditEntry(event, {
    kind: 'command',
    correlation_id: correlationId,
    operation,
  }));
}

function applyCommandResolved(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const correlationId = stringPayload(event, 'correlation_id');
  if (!correlationId) {
    return;
  }
  const existing = state.commands[correlationId] ?? {
    correlation_id: correlationId,
    operation: 'unknown',
    status: 'dispatched' as const,
    updated_at: event.at,
  };
  state.commands[correlationId] = {
    ...existing,
    status: 'resolved',
    output: event.payload.output,
    receipt_cid: stringPayload(event, 'receipt_cid'),
    updated_at: event.at,
  };
  const receipt = isRecord(event.payload.receipt) ? event.payload.receipt : undefined;
  indexAuditEntry(state, auditEntry(event, {
    kind: 'receipt',
    correlation_id: correlationId,
    operation: typeof receipt?.operation === 'string' ? receipt.operation : existing.operation,
    receipt_cid: stringPayload(event, 'receipt_cid'),
    interface_cid: typeof receipt?.interface_cid === 'string' ? receipt.interface_cid : undefined,
    artifact_cids: artifactCidsFrom(event.payload.output),
    provenance_refs: stringArray(receipt?.provenance_refs),
    output_refs: stringArray(receipt?.output_refs),
  }));
}

function applyStreamGuard(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const operation = stringPayload(event, 'operation');
  const correlationId = stringPayload(event, 'correlation_id');
  const bindingHandle = stringPayload(event, 'binding_handle');
  const bindingGeneration = numberPayload(event, 'binding_generation');
  if (!operation || !correlationId || !bindingHandle || bindingGeneration === undefined) {
    return;
  }
  const guard: GeneratedStreamGuard = {
    operation,
    correlation_id: correlationId,
    binding_handle: bindingHandle,
    binding_generation: bindingGeneration,
    generation_key: stringPayload(event, 'generation_key'),
  };
  if (event.type === 'stream.recovered') {
    guard.recovered_at = event.at;
  }
  state.active_streams[streamKey(operation, correlationId)] = guard;
}

function applyStreamEvent(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const streamEvent = event.payload.event;
  if (isORBStreamEvent(streamEvent)) {
    state.stream_events.push(streamEvent);
    indexAuditEntry(state, auditEntry(event, {
      kind: 'stream',
      correlation_id: streamEvent.correlation_id,
      operation: streamEvent.operation,
      interface_cid: streamEvent.interface_cid,
      event_cid: streamEvent.event_cid,
      binding_handle: streamEvent.binding_handle,
      binding_generation: streamEvent.binding_generation,
      artifact_cids: artifactCidsFrom(streamEvent.event),
      provenance_refs: provenanceRefsFrom(streamEvent.event),
    }));
  }
}

function applyStaleStreamEvent(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const operation = stringPayload(event, 'operation');
  const correlationId = stringPayload(event, 'correlation_id');
  const reason = stringPayload(event, 'reason');
  if (!operation || !correlationId || !reason) {
    return;
  }
  state.stale_stream_events.push({
    operation,
    correlation_id: correlationId,
    reason,
    event: event.payload.event,
    rejected_at: event.at,
  });
  indexAuditEntry(state, auditEntry(event, {
    kind: 'stale_stream',
    correlation_id: correlationId,
    operation,
    status: 'rejected',
    artifact_cids: artifactCidsFrom(event.payload.event),
  }));
}

function applyWorkflowStepCompleted(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const correlationId = stringPayload(event, 'correlation_id');
  const operation = stringPayload(event, 'operation');
  const stepId = stringPayload(event, 'step_id');
  if (!correlationId || !operation || !stepId) {
    return;
  }
  const workflowId = stringPayload(event, 'workflow_id') ?? 'default';
  const workflow = state.workflows[workflowId] ?? {
    workflow_id: workflowId,
    step_order: [],
    steps: {},
    shared_state: {},
  };
  if (!workflow.steps[stepId]) {
    workflow.step_order.push(stepId);
  }
  workflow.steps[stepId] = {
    step_id: stepId,
    operation,
    status: stringPayload(event, 'status') ?? 'completed',
    output: event.payload.output,
    receipt_cid: stringPayload(event, 'receipt_cid'),
    updated_at: event.at,
  };
  if (isRecord(event.payload.shared_state_updates)) {
    workflow.shared_state = {
      ...workflow.shared_state,
      ...event.payload.shared_state_updates,
    };
  }
  workflow.updated_at = event.at;
  state.workflows[workflowId] = workflow;

  const receipt = isRecord(event.payload.receipt) ? event.payload.receipt : undefined;
  indexAuditEntry(state, auditEntry(event, {
    kind: 'workflow_step',
    correlation_id: correlationId,
    operation,
    step_id: stepId,
    status: stringPayload(event, 'status'),
    receipt_cid: stringPayload(event, 'receipt_cid'),
    interface_cid: typeof receipt?.interface_cid === 'string' ? receipt.interface_cid : undefined,
    artifact_cids: uniqueStrings([
      ...stringArray(event.payload.artifact_cids),
      ...artifactCidsFrom(event.payload.output),
    ]),
    provenance_refs: stringArray(receipt?.provenance_refs),
    output_refs: stringArray(receipt?.output_refs),
  }));
}

function applyProjectionUpdated(state: GeneratedAppProjectionState, event: GeneratedAppReplayEvent): void {
  const name = stringPayload(event, 'name');
  if (name) {
    state.projections[name] = event.payload.value;
  }
}

function staleStreamReason(
  record: GeneratedStreamRecord,
  state: GeneratedAppProjectionState,
  strict: boolean,
): string | undefined {
  const guard = state.active_streams[streamKey(record.operation, record.correlation_id)];
  if (!guard) {
    return strict ? `No active stream guard for ${record.operation}:${record.correlation_id}.` : undefined;
  }
  const bindingHandle = record.binding_handle ?? record.event.binding_handle;
  if (bindingHandle && bindingHandle !== guard.binding_handle) {
    return `Stale stream handle ${bindingHandle}; expected ${guard.binding_handle}.`;
  }
  const bindingGeneration = record.binding_generation ?? record.event.binding_generation;
  if (bindingGeneration !== undefined && bindingGeneration !== guard.binding_generation) {
    return `Stale stream generation ${bindingGeneration}; expected ${guard.binding_generation}.`;
  }
  const generationKey = record.generation_key ?? record.event.generation_key;
  if (generationKey && guard.generation_key && generationKey !== guard.generation_key) {
    return `Stale stream generation key ${generationKey}; expected ${guard.generation_key}.`;
  }
  return undefined;
}

function duplicateStreamReason(
  record: GeneratedStreamRecord,
  state: GeneratedAppProjectionState,
): string | undefined {
  const fingerprint = streamEventFingerprint(record);
  const duplicate = state.stream_events.some(event => streamEventFingerprint({
    operation: event.operation,
    correlation_id: event.correlation_id,
    event,
    binding_handle: event.binding_handle,
    binding_generation: event.binding_generation,
    generation_key: event.generation_key,
  }) === fingerprint);
  return duplicate ? `Duplicate stream event for ${record.operation}:${record.correlation_id}.` : undefined;
}

function streamEventFingerprint(record: GeneratedStreamRecord): string {
  if (record.event.event_cid) {
    return `event:${record.event.event_cid}`;
  }
  return stableStringify({
    operation: record.operation,
    correlation_id: record.correlation_id,
    binding_handle: record.binding_handle ?? record.event.binding_handle,
    binding_generation: record.binding_generation ?? record.event.binding_generation,
    generation_key: record.generation_key ?? record.event.generation_key,
    event: record.event.event,
  });
}

function emptyGeneratedAppState(appId: string, appInstanceId: string): GeneratedAppProjectionState {
  return {
    app_id: appId,
    app_instance_id: appInstanceId,
    replay_event_count: 0,
    commands: {},
    command_order: [],
    active_streams: {},
    stream_events: [],
    stale_stream_events: [],
    workflows: {},
    projections: {},
    audit: {
      entries: [],
      by_correlation_id: {},
      artifact_lineage: {},
    },
  };
}

function auditEntry(
  event: GeneratedAppReplayEvent,
  entry: Omit<GeneratedAuditEntry, 'artifact_cids' | 'provenance_refs' | 'output_refs' | 'at' | 'source_sequence'> & {
    artifact_cids?: string[];
    provenance_refs?: string[];
    output_refs?: string[];
  },
): GeneratedAuditEntry {
  return {
    ...entry,
    artifact_cids: uniqueStrings(entry.artifact_cids ?? []),
    provenance_refs: uniqueStrings(entry.provenance_refs ?? []),
    output_refs: uniqueStrings(entry.output_refs ?? []),
    at: event.at,
    source_sequence: event.sequence,
  };
}

function indexAuditEntry(state: GeneratedAppProjectionState, entry: GeneratedAuditEntry): void {
  state.audit.entries.push(entry);
  if (!state.audit.by_correlation_id[entry.correlation_id]) {
    state.audit.by_correlation_id[entry.correlation_id] = [];
  }
  state.audit.by_correlation_id[entry.correlation_id].push(entry);
  for (const artifactCid of entry.artifact_cids) {
    if (!state.audit.artifact_lineage[artifactCid]) {
      state.audit.artifact_lineage[artifactCid] = [];
    }
    state.audit.artifact_lineage[artifactCid].push(entry.correlation_id);
  }
}

function artifactCidsFrom(value: unknown): string[] {
  const cids: string[] = [];
  collectArtifactCids(value, '', cids);
  return uniqueStrings(cids);
}

function collectArtifactCids(value: unknown, key: string, cids: string[]): void {
  if (typeof value === 'string') {
    if (key.toLowerCase().includes('artifact') && isCidLike(value)) {
      cids.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectArtifactCids(item, key, cids);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    collectArtifactCids(childValue, childKey, cids);
  }
}

function provenanceRefsFrom(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const provenance = value.provenance;
  if (!isRecord(provenance)) {
    return [];
  }
  return uniqueStrings(Object.values(provenance).filter((item): item is string => typeof item === 'string'));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isCidLike(value: string): boolean {
  return value.startsWith('bafy') || value.startsWith('sha256:');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',') + '}';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeReplayEvents(events: GeneratedAppReplayEvent[]): GeneratedAppReplayEvent[] {
  return events
    .map(event => cloneReplayEvent(event))
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}

function cloneReplayEvent(event: GeneratedAppReplayEvent): GeneratedAppReplayEvent {
  return JSON.parse(JSON.stringify(event)) as GeneratedAppReplayEvent;
}

function cloneProjectionState(state: GeneratedAppProjectionState): GeneratedAppProjectionState {
  return JSON.parse(JSON.stringify(state)) as GeneratedAppProjectionState;
}

function streamKey(operation: string, correlationId: string): string {
  return `${operation}:${correlationId}`;
}

function stringPayload(event: GeneratedAppReplayEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberPayload(event: GeneratedAppReplayEvent, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === 'number' ? value : undefined;
}

function isORBStreamEvent(value: unknown): value is ORBStreamEvent {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as ORBStreamEvent).correlation_id === 'string'
    && typeof (value as ORBStreamEvent).interface_cid === 'string'
    && typeof (value as ORBStreamEvent).operation === 'string'
    && typeof (value as ORBStreamEvent).received_at === 'string',
  );
}

function createCorrelationId(appInstanceId: string, sequence: number): string {
  return `${appInstanceId}:command:${sequence}`;
}

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
  | 'projection.updated';

export interface GeneratedAppReplayEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  app_id: string;
  app_instance_id: string;
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
  projections: Record<string, unknown>;
}

export interface GeneratedAppStateManagerOptions {
  app_id: string;
  app_instance_id: string;
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
  private readonly strictStreamGuards: boolean;
  private readonly now: () => string;
  private events: GeneratedAppReplayEvent[] = [];
  private state: GeneratedAppProjectionState;

  constructor(options: GeneratedAppStateManagerOptions) {
    this.appId = options.app_id;
    this.appInstanceId = options.app_instance_id;
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
    const reason = staleStreamReason(record, this.state, this.strictStreamGuards);
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
    projections: {},
  };
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

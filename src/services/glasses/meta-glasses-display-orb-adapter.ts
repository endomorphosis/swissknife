import { computeCID, computeInterfaceCID } from '../mcp/mcp-idl.js';
import type { ControlSurfacePolicyEvaluator } from './control-surface-mediator.js';
import type { MCPUIProfileDescriptor } from '../mcp/mcp-ui-profile.js';
import {
  LocalORBTransportAdapter,
  MCPCapabilityRouter,
  createDefaultORBAdapters,
  type LocalORBHandlerRequest,
  type ORBBoundOperation,
  type ORBDescriptorSource,
  type ORBInvocationContext,
  type ORBInvocationResponse,
  type ORBOperationPolicy,
  type ORBStreamEvent,
  type ORBStreamRequest,
  type ORBStreamSubscription,
  type ORBTransportInvocationResult,
} from '../mcp/mcp-orb-capability-router.js';
import {
  compileMetaGlassesWidgetManifest,
  type MetaGlassesCompiledAction,
  type MetaGlassesCompiledMedia,
  type MetaGlassesJSONValue,
  type MetaGlassesWidgetManifest,
} from './meta-glasses-widget-compiler.js';
import type {
  MetaGlassesDisplayFallback,
  MetaGlassesWidgetDescriptor,
} from './meta-glasses-display-profile.js';

export const META_GLASSES_DISPLAY_ORB_OPERATIONS = [
  'render_widget',
  'update_widget',
  'clear_widget',
  'focus_next',
  'focus_previous',
  'activate',
  'reset_session',
  'play_video',
  'subscribe_updates',
] as const;

export type MetaGlassesDisplayORBOperation =
  (typeof META_GLASSES_DISPLAY_ORB_OPERATIONS)[number];

export type MetaGlassesDisplayFocusDirection = 'next' | 'previous';

export type MetaGlassesDisplayMobileActionType =
  | 'mobile_render_display_widget'
  | 'mobile_update_display_widget'
  | 'mobile_clear_display_widget'
  | 'mobile_focus_display_widget'
  | 'mobile_activate_display_widget_action'
  | 'mobile_reset_display_widget_session'
  | 'mobile_play_display_widget_video'
  | 'mobile_subscribe_display_widget_updates';

export interface MetaGlassesDisplayVideoPayload {
  media_id?: string;
  content_type?: string;
  uri?: string;
  cid?: string;
  duration_ms?: number;
  size_bytes?: number;
  fallback_text?: string;
}

export interface MetaGlassesDisplayORBInput {
  request_id?: string;
  idempotency_key?: string;
  widget_id?: string;
  state?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  action_id?: string;
  direction?: MetaGlassesDisplayFocusDirection;
  video?: MetaGlassesDisplayVideoPayload;
  reason?: string;
}

export interface MetaGlassesDisplayMobileAction {
  type: MetaGlassesDisplayMobileActionType;
  operation: MetaGlassesDisplayORBOperation;
  correlation_id: string;
  request_id?: string;
  widget_id: string;
  interface_cid: string;
  widget_cid?: string;
  manifest?: MetaGlassesWidgetManifest;
  patch?: Record<string, MetaGlassesJSONValue>;
  state?: Record<string, MetaGlassesJSONValue>;
  focus?: {
    direction: MetaGlassesDisplayFocusDirection;
    action_id?: string;
    focus_index: number;
  };
  activated_action?: MetaGlassesCompiledAction;
  video?: MetaGlassesDisplayVideoPayload;
  fallback?: MetaGlassesDisplayFallback;
  issued_at: string;
}

export type MetaGlassesDisplayBridgeStatus =
  | 'queued'
  | 'rendered'
  | 'updated'
  | 'cleared'
  | 'focused'
  | 'activated'
  | 'reset'
  | 'video'
  | 'subscribed'
  | 'display_unavailable'
  | 'error';

export interface MetaGlassesDisplayBridgeResult {
  ok: boolean;
  status: MetaGlassesDisplayBridgeStatus;
  message?: string;
  native_display_unavailable?: boolean;
  fallback_path?: string;
  metadata?: Record<string, unknown>;
}

export interface MetaGlassesDisplaySessionSnapshot {
  widget_id: string;
  interface_cid: string;
  descriptor_name: string;
  widget_cid?: string;
  state: Record<string, MetaGlassesJSONValue>;
  focus_index: number;
  session_generation: number;
  update_count: number;
  cleared: boolean;
  receipt_cids: string[];
  last_bridge_result?: MetaGlassesDisplayBridgeResult;
  updated_at: string;
}

export interface MetaGlassesDisplayBridgeRequest {
  operation: MetaGlassesDisplayORBOperation;
  binding: ORBBoundOperation;
  context: ORBInvocationContext & { correlation_id: string };
  mobile_action: MetaGlassesDisplayMobileAction;
  session: MetaGlassesDisplaySessionSnapshot;
}

export type MetaGlassesDisplayBridge =
  (request: MetaGlassesDisplayBridgeRequest) =>
    Promise<MetaGlassesDisplayBridgeResult> | MetaGlassesDisplayBridgeResult;

export interface MetaGlassesDisplayStreamSourceRequest {
  binding: ORBBoundOperation;
  context: ORBInvocationContext & { correlation_id: string };
  session?: MetaGlassesDisplaySessionSnapshot;
}

export type MetaGlassesDisplayStreamSource =
  (request: MetaGlassesDisplayStreamSourceRequest) =>
    AsyncIterable<Record<string, unknown>> | Promise<AsyncIterable<Record<string, unknown>>>;

export interface MetaGlassesDisplayORBOperationOutput {
  ok: boolean;
  operation: MetaGlassesDisplayORBOperation;
  correlation_id: string;
  widget_id: string;
  widget_cid?: string;
  interface_cid: string;
  source_interface_cid: string;
  mobile_action: MetaGlassesDisplayMobileAction;
  bridge_result: MetaGlassesDisplayBridgeResult;
  session_generation: number;
  update_count: number;
  manifest?: MetaGlassesWidgetManifest;
  focus?: MetaGlassesDisplayMobileAction['focus'];
  activated_action?: MetaGlassesCompiledAction;
}

export interface MetaGlassesDisplayTaskMetadata {
  operation: string;
  correlation_id: string;
  receipt_cid: string;
  interface_cid: string;
  widget_id?: string;
  widget_cid?: string;
  policy_outcome: 'permit' | 'deny';
  denied: boolean;
  recorded_at: string;
}

export interface MetaGlassesDisplayORBBindOptions {
  descriptor: MetaGlassesWidgetDescriptor;
  operation: MetaGlassesDisplayORBOperation;
  interface_cid?: string;
  endpoint?: string;
  context?: ORBInvocationContext;
}

export interface MetaGlassesDisplayORBAdapterOptions {
  bridge?: MetaGlassesDisplayBridge;
  stream_source?: MetaGlassesDisplayStreamSource;
  control_surface_policy_evaluator?: ControlSurfacePolicyEvaluator;
  operation_policies?: Record<string, ORBOperationPolicy>;
  bridge_timeout_ms?: number;
  now?: () => Date;
}

interface MetaGlassesDisplaySessionState {
  widget_id: string;
  interface_cid: string;
  descriptor_name: string;
  manifest?: MetaGlassesWidgetManifest;
  state: Record<string, MetaGlassesJSONValue>;
  focus_index: number;
  session_generation: number;
  update_count: number;
  cleared: boolean;
  receipt_cids: string[];
  last_bridge_result?: MetaGlassesDisplayBridgeResult;
  updated_at: string;
}

const DISPLAY_WIDGET_CAPABILITY = 'display/widget';
const DISPLAY_CONFIRMATION_CAPABILITY = 'display/widget.confirmed';
const DISPLAY_ACTION_CONFIRMATION_CAPABILITY = 'display/action.confirmed';
const DEFAULT_ENDPOINT = 'local://meta-glasses-display-orb';

const OPERATION_SET = new Set<string>(META_GLASSES_DISPLAY_ORB_OPERATIONS);

const MOBILE_ACTION_TYPES: Record<MetaGlassesDisplayORBOperation, MetaGlassesDisplayMobileActionType> = {
  render_widget: 'mobile_render_display_widget',
  update_widget: 'mobile_update_display_widget',
  clear_widget: 'mobile_clear_display_widget',
  focus_next: 'mobile_focus_display_widget',
  focus_previous: 'mobile_focus_display_widget',
  activate: 'mobile_activate_display_widget_action',
  reset_session: 'mobile_reset_display_widget_session',
  play_video: 'mobile_play_display_widget_video',
  subscribe_updates: 'mobile_subscribe_display_widget_updates',
};

const BRIDGE_STATUSES: Record<MetaGlassesDisplayORBOperation, MetaGlassesDisplayBridgeStatus> = {
  render_widget: 'rendered',
  update_widget: 'updated',
  clear_widget: 'cleared',
  focus_next: 'focused',
  focus_previous: 'focused',
  activate: 'activated',
  reset_session: 'reset',
  play_video: 'video',
  subscribe_updates: 'subscribed',
};

export function createMetaGlassesDisplayORBOperationPolicies(
  overrides: Record<string, ORBOperationPolicy> = {},
): Record<string, ORBOperationPolicy> {
  const bridgeRecovery = {
    retry: { max_attempts: 2, backoff_ms: 0 },
    circuit_breaker: { failure_threshold: 2, cooldown_ms: 30_000 },
  };

  return {
    render_widget: {
      authorization: { required_capabilities: [DISPLAY_WIDGET_CAPABILITY] },
      idempotency: { required: true, key_field: 'request_id' },
      ...bridgeRecovery,
    },
    update_widget: {
      authorization: { required_capabilities: [DISPLAY_WIDGET_CAPABILITY] },
      idempotency: { required: true, key_field: 'request_id' },
      rate_limit: { max_invocations: 5, window_ms: 1_000 },
      ...bridgeRecovery,
    },
    clear_widget: {
      authorization: {
        required_capabilities: [
          DISPLAY_WIDGET_CAPABILITY,
          DISPLAY_CONFIRMATION_CAPABILITY,
        ],
      },
      idempotency: { required: false, key_field: 'request_id' },
      ...bridgeRecovery,
    },
    focus_next: {
      authorization: { required_capabilities: [DISPLAY_WIDGET_CAPABILITY] },
      rate_limit: { max_invocations: 12, window_ms: 1_000 },
    },
    focus_previous: {
      authorization: { required_capabilities: [DISPLAY_WIDGET_CAPABILITY] },
      rate_limit: { max_invocations: 12, window_ms: 1_000 },
    },
    activate: {
      authorization: {
        required_capabilities: [
          DISPLAY_WIDGET_CAPABILITY,
          DISPLAY_ACTION_CONFIRMATION_CAPABILITY,
        ],
      },
      idempotency: { required: false, key_field: 'request_id' },
      ...bridgeRecovery,
    },
    reset_session: {
      authorization: {
        required_capabilities: [
          DISPLAY_WIDGET_CAPABILITY,
          DISPLAY_CONFIRMATION_CAPABILITY,
        ],
      },
      idempotency: { required: false, key_field: 'request_id' },
      ...bridgeRecovery,
    },
    play_video: {
      authorization: { required_capabilities: [DISPLAY_WIDGET_CAPABILITY] },
      idempotency: { required: false, key_field: 'request_id' },
      rate_limit: { max_invocations: 3, window_ms: 1_000 },
      ...bridgeRecovery,
    },
    subscribe_updates: {
      authorization: { required_capabilities: [DISPLAY_WIDGET_CAPABILITY] },
      rate_limit: { max_invocations: 2, window_ms: 1_000 },
    },
    ...overrides,
  };
}

export function createMetaGlassesDisplayORBDescriptorSource(
  descriptor: MetaGlassesWidgetDescriptor,
  options: { interface_cid?: string; endpoint?: string } = {},
): ORBDescriptorSource {
  const interfaceCid = options.interface_cid ?? computeInterfaceCID(descriptor);
  const localDescriptor = clonePlain(descriptor);
  localDescriptor.services = localDescriptor.services.map(service => {
    const hasWidgetOperation = service.operations.some(operation => OPERATION_SET.has(operation));
    return hasWidgetOperation
      ? {
        ...service,
        transport: 'local' as const,
        endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
      }
      : service;
  });

  return {
    cid: interfaceCid,
    descriptor: localDescriptor,
  };
}

export class MetaGlassesDisplayORBAdapter {
  readonly localAdapter: LocalORBTransportAdapter;
  readonly router: MCPCapabilityRouter;

  private readonly bridge: MetaGlassesDisplayBridge;
  private readonly streamSource?: MetaGlassesDisplayStreamSource;
  private readonly bridgeTimeoutMs: number;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, MetaGlassesDisplaySessionState>();
  private readonly taskMetadata: MetaGlassesDisplayTaskMetadata[] = [];

  constructor(options: MetaGlassesDisplayORBAdapterOptions = {}) {
    this.bridge = options.bridge ?? defaultBridge;
    this.streamSource = options.stream_source;
    this.bridgeTimeoutMs = options.bridge_timeout_ms ?? 5_000;
    this.now = options.now ?? (() => new Date());
    this.localAdapter = new LocalORBTransportAdapter();
    this.registerHandlers(this.localAdapter);
    this.router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(this.localAdapter),
      control_surface_policy_evaluator: options.control_surface_policy_evaluator,
      operation_policies: createMetaGlassesDisplayORBOperationPolicies(options.operation_policies),
    });
  }

  registerHandlers(adapter: LocalORBTransportAdapter = this.localAdapter): LocalORBTransportAdapter {
    for (const operation of META_GLASSES_DISPLAY_ORB_OPERATIONS) {
      adapter.registerHandler(operation, request => this.handleInvocation(operation, request));
    }
    adapter.registerStreamHandler('subscribe_updates', request => this.handleStream(request));
    return adapter;
  }

  async bind(options: MetaGlassesDisplayORBBindOptions): Promise<ORBBoundOperation> {
    return this.router.bind({
      descriptors: [
        createMetaGlassesDisplayORBDescriptorSource(options.descriptor, {
          interface_cid: options.interface_cid,
          endpoint: options.endpoint,
        }),
      ],
      operation: options.operation,
      context: options.context,
    });
  }

  async invoke(
    handle: string,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext = {},
  ): Promise<ORBInvocationResponse> {
    const response = await this.router.invoke({ handle, input, context });
    this.recordReceipt(response);
    return response;
  }

  async stream(
    handle: string,
    context: ORBInvocationContext = {},
  ): Promise<ORBStreamSubscription> {
    const subscription = await this.router.stream(handle, context);
    this.recordStreamReceipt(subscription.receipt, subscription.receipt.policy_decision.outcome === 'deny');
    return subscription;
  }

  getTaskMetadata(): MetaGlassesDisplayTaskMetadata[] {
    return clonePlain(this.taskMetadata);
  }

  getSessionSnapshot(
    widgetId: string,
    interfaceCid?: string,
  ): MetaGlassesDisplaySessionSnapshot | undefined {
    const state = interfaceCid
      ? this.sessions.get(sessionKey(interfaceCid, widgetId))
      : Array.from(this.sessions.values()).find(session => session.widget_id === widgetId);
    return state ? sessionSnapshot(state) : undefined;
  }

  private async handleInvocation(
    operation: MetaGlassesDisplayORBOperation,
    request: LocalORBHandlerRequest,
  ): Promise<ORBTransportInvocationResult> {
    const input = normalizeInput(request.input);
    const context = ensureCorrelationId(request.context);

    switch (operation) {
      case 'render_widget':
        return this.handleRender(request.binding, input, context);
      case 'update_widget':
        return this.handleUpdate(request.binding, input, context);
      case 'clear_widget':
        return this.handleClear(request.binding, input, context);
      case 'focus_next':
      case 'focus_previous':
        return this.handleFocus(operation, request.binding, input, context);
      case 'activate':
        return this.handleActivate(request.binding, input, context);
      case 'reset_session':
        return this.handleReset(request.binding, input, context);
      case 'play_video':
        return this.handlePlayVideo(request.binding, input, context);
      case 'subscribe_updates':
        return this.handleSubscribeInvocation(request.binding, input, context);
      default:
        return exhaustive(operation);
    }
  }

  private async handleRender(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const manifest = compileManifest(binding, 'render_widget', input);
    const nextSession = this.nextSessionFromManifest(binding, manifest, manifest.state.values, false);
    const mobileAction = baseMobileAction('render_widget', binding, context, input, manifest);
    mobileAction.manifest = manifest;
    mobileAction.state = manifest.state.values;
    const bridgeResult = await this.sendToBridge('render_widget', binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, manifest.widget_id), nextSession);
    return operationResult(binding, context, 'render_widget', nextSession, mobileAction, bridgeResult, manifest);
  }

  private async handleUpdate(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.resolveSession(binding, input);
    const mergedState = {
      ...(current?.state ?? {}),
      ...recordOrEmpty(input.state),
      ...recordOrEmpty(input.patch),
    };
    const manifest = compileManifest(binding, 'update_widget', { ...input, state: mergedState });
    const nextSession = this.nextSessionFromManifest(binding, manifest, manifest.state.values, false, current);
    nextSession.update_count += 1;

    const mobileAction = baseMobileAction('update_widget', binding, context, input, manifest);
    mobileAction.manifest = manifest;
    mobileAction.patch = patchFromManifest(input.patch, manifest);
    mobileAction.state = manifest.state.values;
    const bridgeResult = await this.sendToBridge('update_widget', binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, manifest.widget_id), nextSession);
    return operationResult(binding, context, 'update_widget', nextSession, mobileAction, bridgeResult, manifest);
  }

  private async handleClear(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.resolveSession(binding, input);
    const widgetId = input.widget_id ?? current?.widget_id ?? defaultWidgetId(binding.descriptor);
    const nextSession = current
      ? { ...current, cleared: true, updated_at: this.now().toISOString() }
      : emptySession(binding, widgetId, this.now());
    const mobileAction = baseMobileAction('clear_widget', binding, context, input, current?.manifest, widgetId);
    const bridgeResult = await this.sendToBridge('clear_widget', binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, widgetId), nextSession);
    return operationResult(binding, context, 'clear_widget', nextSession, mobileAction, bridgeResult, current?.manifest);
  }

  private async handleFocus(
    operation: 'focus_next' | 'focus_previous',
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.requireSessionWithManifest(binding, input, operation);
    const focus = nextFocus(current.manifest, current.focus_index, operation === 'focus_next' ? 'next' : 'previous');
    const nextSession = {
      ...current,
      focus_index: focus.focus_index,
      updated_at: this.now().toISOString(),
    };
    const mobileAction = baseMobileAction(operation, binding, context, input, current.manifest);
    mobileAction.focus = focus;
    const bridgeResult = await this.sendToBridge(operation, binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, current.widget_id), nextSession);
    return operationResult(binding, context, operation, nextSession, mobileAction, bridgeResult, current.manifest);
  }

  private async handleActivate(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.requireSessionWithManifest(binding, input, 'activate');
    const action = selectedAction(current.manifest, current.focus_index, input.action_id);
    if (!action) {
      throw new Error(`No focusable display widget action is available for ${current.widget_id}.`);
    }

    const nextState = {
      ...current.state,
      selected_action: action.id,
    };
    const nextSession = {
      ...current,
      state: nextState,
      updated_at: this.now().toISOString(),
    };
    const mobileAction = baseMobileAction('activate', binding, context, input, current.manifest);
    mobileAction.activated_action = action;
    const bridgeResult = await this.sendToBridge('activate', binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, current.widget_id), nextSession);
    return operationResult(
      binding,
      context,
      'activate',
      nextSession,
      mobileAction,
      bridgeResult,
      current.manifest,
      action,
    );
  }

  private async handleReset(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.resolveSession(binding, input);
    const widgetId = input.widget_id ?? current?.widget_id ?? defaultWidgetId(binding.descriptor);
    const nextSession = current
      ? {
        ...current,
        focus_index: 0,
        session_generation: current.session_generation + 1,
        cleared: false,
        updated_at: this.now().toISOString(),
      }
      : emptySession(binding, widgetId, this.now());
    const mobileAction = baseMobileAction('reset_session', binding, context, input, current?.manifest, widgetId);
    const bridgeResult = await this.sendToBridge('reset_session', binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, widgetId), nextSession);
    return operationResult(binding, context, 'reset_session', nextSession, mobileAction, bridgeResult, current?.manifest);
  }

  private async handlePlayVideo(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.resolveSession(binding, input);
    const state = { ...(current?.state ?? {}), ...recordOrEmpty(input.state) };
    const manifest = compileManifest(binding, 'play_video', { ...input, state });
    const nextSession = this.nextSessionFromManifest(binding, manifest, manifest.state.values, false, current);
    const mobileAction = baseMobileAction('play_video', binding, context, input, manifest);
    mobileAction.manifest = manifest;
    mobileAction.video = resolveVideoPayload(input.video, manifest.media);
    const bridgeResult = await this.sendToBridge('play_video', binding, context, mobileAction, nextSession);
    nextSession.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, manifest.widget_id), nextSession);
    return operationResult(binding, context, 'play_video', nextSession, mobileAction, bridgeResult, manifest);
  }

  private async handleSubscribeInvocation(
    binding: ORBBoundOperation,
    input: MetaGlassesDisplayORBInput,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<ORBTransportInvocationResult> {
    const current = this.resolveSession(binding, input);
    const widgetId = input.widget_id ?? current?.widget_id ?? defaultWidgetId(binding.descriptor);
    const session = current ?? emptySession(binding, widgetId, this.now());
    const mobileAction = baseMobileAction('subscribe_updates', binding, context, input, current?.manifest, widgetId);
    const bridgeResult = await this.sendToBridge('subscribe_updates', binding, context, mobileAction, session);
    session.last_bridge_result = bridgeResult;
    this.sessions.set(sessionKey(binding.interface_cid, widgetId), session);
    return operationResult(binding, context, 'subscribe_updates', session, mobileAction, bridgeResult, current?.manifest);
  }

  private async handleStream(request: ORBStreamRequest): Promise<AsyncIterable<ORBStreamEvent>> {
    const context = ensureCorrelationId(request.context);
    const session = this.resolveSession(request.binding, {
      widget_id: stringFromUnknown(context.metadata?.widget_id),
    });
    const source = this.streamSource
      ? await this.streamSource({
        binding: request.binding,
        context,
        session: session ? sessionSnapshot(session) : undefined,
      })
      : this.defaultStreamEvents(request.binding, context, session);

    return this.toORBStreamEvents(request.binding, context, source, session);
  }

  private async *defaultStreamEvents(
    binding: ORBBoundOperation,
    context: ORBInvocationContext & { correlation_id: string },
    session?: MetaGlassesDisplaySessionState,
  ): AsyncIterable<Record<string, unknown>> {
    yield {
      type: 'display_widget_snapshot',
      correlation_id: context.correlation_id,
      widget_id: session?.widget_id ?? defaultWidgetId(binding.descriptor),
      widget_cid: session?.manifest?.widget_cid,
      state: session?.state ?? {},
      update_count: session?.update_count ?? 0,
    };
  }

  private async *toORBStreamEvents(
    binding: ORBBoundOperation,
    context: ORBInvocationContext & { correlation_id: string },
    source: AsyncIterable<Record<string, unknown>>,
    session?: MetaGlassesDisplaySessionState,
  ): AsyncIterable<ORBStreamEvent> {
    for await (const event of source) {
      const widgetId = stringFromUnknown(event.widget_id)
        ?? session?.widget_id
        ?? defaultWidgetId(binding.descriptor);
      const streamEvent = {
        type: 'display_widget_update',
        widget_id: widgetId,
        widget_cid: stringFromUnknown(event.widget_cid) ?? session?.manifest?.widget_cid,
        ...event,
      };
      yield {
        correlation_id: context.correlation_id,
        interface_cid: binding.interface_cid,
        operation: 'subscribe_updates',
        event: streamEvent,
        event_cid: computeCID(stableStringify(streamEvent)),
        generation_key: `${binding.interface_cid}:${widgetId}:updates`,
        received_at: this.now().toISOString(),
      };
    }
  }

  private nextSessionFromManifest(
    binding: ORBBoundOperation,
    manifest: MetaGlassesWidgetManifest,
    state: Record<string, MetaGlassesJSONValue>,
    cleared: boolean,
    current?: MetaGlassesDisplaySessionState,
  ): MetaGlassesDisplaySessionState {
    return {
      widget_id: manifest.widget_id,
      interface_cid: binding.interface_cid,
      descriptor_name: binding.descriptor.name,
      manifest,
      state,
      focus_index: current?.focus_index ?? 0,
      session_generation: current?.session_generation ?? 0,
      update_count: current?.update_count ?? 0,
      cleared,
      receipt_cids: current?.receipt_cids ? [...current.receipt_cids] : [],
      last_bridge_result: current?.last_bridge_result,
      updated_at: this.now().toISOString(),
    };
  }

  private resolveSession(
    binding: ORBBoundOperation,
    input: Pick<MetaGlassesDisplayORBInput, 'widget_id'>,
  ): MetaGlassesDisplaySessionState | undefined {
    if (input.widget_id) {
      return this.sessions.get(sessionKey(binding.interface_cid, input.widget_id));
    }

    return Array.from(this.sessions.values())
      .find(session => session.interface_cid === binding.interface_cid && !session.cleared);
  }

  private requireSessionWithManifest(
    binding: ORBBoundOperation,
    input: Pick<MetaGlassesDisplayORBInput, 'widget_id'>,
    operation: MetaGlassesDisplayORBOperation,
  ): MetaGlassesDisplaySessionState & { manifest: MetaGlassesWidgetManifest } {
    const session = this.resolveSession(binding, input);
    if (!session?.manifest || session.cleared) {
      throw new Error(`Cannot ${operation} without an active display widget session.`);
    }
    return session as MetaGlassesDisplaySessionState & { manifest: MetaGlassesWidgetManifest };
  }

  private async sendToBridge(
    operation: MetaGlassesDisplayORBOperation,
    binding: ORBBoundOperation,
    context: ORBInvocationContext & { correlation_id: string },
    mobileAction: MetaGlassesDisplayMobileAction,
    session: MetaGlassesDisplaySessionState,
  ): Promise<MetaGlassesDisplayBridgeResult> {
    const bridgePromise = Promise.resolve(this.bridge({
      operation,
      binding,
      context,
      mobile_action: mobileAction,
      session: sessionSnapshot(session),
    }));

    if (this.bridgeTimeoutMs <= 0) {
      return bridgePromise;
    }

    return withTimeout(
      bridgePromise,
      this.bridgeTimeoutMs,
      `Timed out waiting for display bridge operation ${operation}.`,
    );
  }

  private recordReceipt(response: ORBInvocationResponse): void {
    const output = isRecord(response.output) ? response.output : {};
    const widgetId = stringFromUnknown(output.widget_id);
    const widgetCid = stringFromUnknown(output.widget_cid);
    const entry: MetaGlassesDisplayTaskMetadata = {
      operation: response.receipt.operation,
      correlation_id: response.receipt.correlation_id,
      receipt_cid: response.receipt.receipt_cid,
      interface_cid: response.receipt.interface_cid,
      policy_outcome: response.receipt.policy_decision.outcome,
      denied: response.denied,
      recorded_at: this.now().toISOString(),
      ...(widgetId ? { widget_id: widgetId } : {}),
      ...(widgetCid ? { widget_cid: widgetCid } : {}),
    };
    this.taskMetadata.push(entry);

    if (!response.denied && widgetId) {
      const session = this.sessions.get(sessionKey(response.receipt.interface_cid, widgetId));
      session?.receipt_cids.push(response.receipt.receipt_cid);
    }
  }

  private recordStreamReceipt(
    receipt: ORBStreamSubscription['receipt'],
    denied: boolean,
  ): void {
    this.taskMetadata.push({
      operation: receipt.operation,
      correlation_id: receipt.correlation_id,
      receipt_cid: receipt.receipt_cid,
      interface_cid: receipt.interface_cid,
      policy_outcome: receipt.policy_decision.outcome,
      denied,
      recorded_at: this.now().toISOString(),
    });
  }
}

function compileManifest(
  binding: ORBBoundOperation,
  operation: MetaGlassesDisplayORBOperation,
  input: MetaGlassesDisplayORBInput,
): MetaGlassesWidgetManifest {
  return compileMetaGlassesWidgetManifest(binding.descriptor as MetaGlassesWidgetDescriptor, {
    operation,
    state: recordOrEmpty(input.state),
    widget_id: input.widget_id,
    interface_cid: binding.interface_cid,
  });
}

function baseMobileAction(
  operation: MetaGlassesDisplayORBOperation,
  binding: ORBBoundOperation,
  context: ORBInvocationContext & { correlation_id: string },
  input: MetaGlassesDisplayORBInput,
  manifestOrUndefined?: MetaGlassesWidgetManifest,
  widgetIdOverride?: string,
): MetaGlassesDisplayMobileAction {
  const widgetId = widgetIdOverride ?? manifestOrUndefined?.widget_id ?? input.widget_id ?? defaultWidgetId(binding.descriptor);
  return omitUndefined({
    type: MOBILE_ACTION_TYPES[operation],
    operation,
    correlation_id: context.correlation_id,
    request_id: input.request_id ?? input.idempotency_key,
    widget_id: widgetId,
    interface_cid: binding.interface_cid,
    widget_cid: manifestOrUndefined?.widget_cid,
    fallback: manifestOrUndefined?.fallback,
    issued_at: new Date().toISOString(),
  });
}

function operationResult(
  binding: ORBBoundOperation,
  context: ORBInvocationContext & { correlation_id: string },
  operation: MetaGlassesDisplayORBOperation,
  session: MetaGlassesDisplaySessionState,
  mobileAction: MetaGlassesDisplayMobileAction,
  bridgeResult: MetaGlassesDisplayBridgeResult,
  manifest?: MetaGlassesWidgetManifest,
  activatedAction?: MetaGlassesCompiledAction,
): ORBTransportInvocationResult {
  const output: MetaGlassesDisplayORBOperationOutput = omitUndefined({
    ok: bridgeResult.ok,
    operation,
    correlation_id: context.correlation_id,
    widget_id: session.widget_id,
    widget_cid: manifest?.widget_cid ?? session.manifest?.widget_cid,
    interface_cid: binding.interface_cid,
    source_interface_cid: binding.interface_cid,
    mobile_action: mobileAction,
    bridge_result: bridgeResult,
    session_generation: session.session_generation,
    update_count: session.update_count,
    manifest,
    focus: mobileAction.focus,
    activated_action: activatedAction,
  });

  return {
    output,
    output_refs: uniqueStrings([
      ...(output.widget_cid ? [output.widget_cid] : []),
      ...(manifest?.widget_cid ? [manifest.widget_cid] : []),
    ]),
    provenance_refs: uniqueStrings([binding.interface_cid, context.correlation_id]),
  };
}

function patchFromManifest(
  patch: Record<string, unknown> | undefined,
  manifest: MetaGlassesWidgetManifest,
): Record<string, MetaGlassesJSONValue> {
  const patchKeys = Object.keys(recordOrEmpty(patch));
  return Object.fromEntries(
    patchKeys.map(key => [key, manifest.state.values[key] ?? null]),
  );
}

function nextFocus(
  manifest: MetaGlassesWidgetManifest,
  currentIndex: number,
  direction: MetaGlassesDisplayFocusDirection,
): { direction: MetaGlassesDisplayFocusDirection; action_id?: string; focus_index: number } {
  if (manifest.focus_order.length === 0) {
    return {
      direction,
      focus_index: -1,
    };
  }

  const delta = direction === 'next' ? 1 : -1;
  const nextIndex = modulo(currentIndex + delta, manifest.focus_order.length);
  return {
    direction,
    action_id: manifest.focus_order[nextIndex],
    focus_index: nextIndex,
  };
}

function selectedAction(
  manifest: MetaGlassesWidgetManifest,
  focusIndex: number,
  requestedActionId?: string,
): MetaGlassesCompiledAction | undefined {
  const actionId = requestedActionId ?? manifest.focus_order[focusIndex] ?? manifest.focus_order[0];
  return actionId
    ? manifest.actions.find(action => action.id === actionId)
    : undefined;
}

function resolveVideoPayload(
  requested: MetaGlassesDisplayVideoPayload | undefined,
  manifestMedia: MetaGlassesCompiledMedia[],
): MetaGlassesDisplayVideoPayload | undefined {
  const media = requested?.media_id
    ? manifestMedia.find(entry => entry.id === requested.media_id)
    : manifestMedia[0];

  if (!requested && !media) {
    return undefined;
  }

  return omitUndefined({
    media_id: requested?.media_id ?? media?.id,
    content_type: requested?.content_type ?? media?.type,
    uri: requested?.uri,
    cid: requested?.cid,
    duration_ms: requested?.duration_ms ?? media?.duration_ms,
    size_bytes: requested?.size_bytes ?? media?.size_bytes,
    fallback_text: requested?.fallback_text ?? media?.fallback_text,
  });
}

function emptySession(
  binding: ORBBoundOperation,
  widgetId: string,
  now: Date,
): MetaGlassesDisplaySessionState {
  return {
    widget_id: widgetId,
    interface_cid: binding.interface_cid,
    descriptor_name: binding.descriptor.name,
    state: {},
    focus_index: 0,
    session_generation: 0,
    update_count: 0,
    cleared: false,
    receipt_cids: [],
    updated_at: now.toISOString(),
  };
}

function sessionSnapshot(
  session: MetaGlassesDisplaySessionState,
): MetaGlassesDisplaySessionSnapshot {
  return clonePlain(omitUndefined({
    widget_id: session.widget_id,
    interface_cid: session.interface_cid,
    descriptor_name: session.descriptor_name,
    widget_cid: session.manifest?.widget_cid,
    state: session.state,
    focus_index: session.focus_index,
    session_generation: session.session_generation,
    update_count: session.update_count,
    cleared: session.cleared,
    receipt_cids: [...session.receipt_cids],
    last_bridge_result: session.last_bridge_result,
    updated_at: session.updated_at,
  }));
}

function defaultBridge(
  request: MetaGlassesDisplayBridgeRequest,
): MetaGlassesDisplayBridgeResult {
  return {
    ok: true,
    status: BRIDGE_STATUSES[request.operation],
    metadata: {
      mobile_action_type: request.mobile_action.type,
      widget_id: request.mobile_action.widget_id,
    },
  };
}

function normalizeInput(input: unknown): MetaGlassesDisplayORBInput {
  if (!isRecord(input)) {
    return {};
  }
  return {
    request_id: stringFromUnknown(input.request_id),
    idempotency_key: stringFromUnknown(input.idempotency_key),
    widget_id: stringFromUnknown(input.widget_id),
    state: isRecord(input.state) ? input.state : undefined,
    patch: isRecord(input.patch) ? input.patch : undefined,
    action_id: stringFromUnknown(input.action_id),
    direction: input.direction === 'previous' ? 'previous' : input.direction === 'next' ? 'next' : undefined,
    video: isRecord(input.video) ? normalizeVideo(input.video) : undefined,
    reason: stringFromUnknown(input.reason),
  };
}

function normalizeVideo(input: Record<string, unknown>): MetaGlassesDisplayVideoPayload {
  return omitUndefined({
    media_id: stringFromUnknown(input.media_id),
    content_type: stringFromUnknown(input.content_type),
    uri: stringFromUnknown(input.uri),
    cid: stringFromUnknown(input.cid),
    duration_ms: numberFromUnknown(input.duration_ms),
    size_bytes: numberFromUnknown(input.size_bytes),
    fallback_text: stringFromUnknown(input.fallback_text),
  });
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function ensureCorrelationId(
  context: ORBInvocationContext,
): ORBInvocationContext & { correlation_id: string } {
  return {
    ...context,
    correlation_id: context.correlation_id ?? 'meta-glasses-display-orb',
  };
}

function defaultWidgetId(descriptor: MCPUIProfileDescriptor): string {
  return `${descriptor.namespace}.${descriptor.name}@${descriptor.version}`;
}

function sessionKey(interfaceCid: string, widgetId: string): string {
  return `${interfaceCid}:${widgetId}`;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unsupported display ORB operation: ${String(value)}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

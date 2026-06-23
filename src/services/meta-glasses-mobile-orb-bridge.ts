import { computeCID, computeInterfaceCID } from './mcp-idl.js';
import type { ControlSurfacePolicyEvaluator } from './control-surface-mediator.js';
import type { MCPUIProfileDescriptor } from './mcp-ui-profile.js';
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
  type ORBTransportKind,
} from './mcp-orb-capability-router.js';

export const META_GLASSES_MOBILE_ORB_OPERATIONS = [
  'register_edge_capabilities',
  'publish_glasses_event',
  'bind_service',
  'invoke_service',
  'subscribe_service_updates',
  'dispatch_glasses_response',
  'revoke_binding',
] as const;

export type MetaGlassesMobileORBOperation =
  (typeof META_GLASSES_MOBILE_ORB_OPERATIONS)[number];

export type MetaGlassesMobileORBPlatform = 'ios' | 'android' | 'simulator';

export type MetaGlassesMobileORBEventType =
  | 'session_state'
  | 'device_state'
  | 'captouch'
  | 'neural_input'
  | 'display_action'
  | 'audio_state'
  | 'camera_frame_ref'
  | 'photo_ref'
  | 'sensor'
  | 'location'
  | 'permission_state'
  | 'diagnostic';

export type MetaGlassesMobileORBRenderTarget =
  | 'display_widget'
  | 'display_webapp'
  | 'audio'
  | 'mobile_card'
  | 'notification';

export interface MetaGlassesMobileORBDatCapabilities {
  session?: boolean;
  camera?: boolean;
  photoCapture?: boolean;
  videoStream?: boolean;
  audio?: boolean;
  display?: boolean;
  displayVideo?: boolean;
  webAppDisplay?: boolean;
}

export interface MetaGlassesMobileORBControlSurfaceArtifacts {
  control_surface_contract_ref?: string;
  interaction_envelope?: Record<string, unknown>;
  normalized_intent?: Record<string, unknown>;
  policy_decision?: Record<string, unknown>;
  mediation_receipt?: Record<string, unknown>;
}

export interface MetaGlassesMobileORBRegisterRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  edge_id: string;
  platform: MetaGlassesMobileORBPlatform;
  device_id?: string;
  device_model?: string;
  dat_capabilities: MetaGlassesMobileORBDatCapabilities;
  local_interface_cids?: string[];
  transport_preferences?: ORBTransportKind[];
  descriptors?: Record<string, unknown>[];
}

export interface MetaGlassesMobileORBRegisterResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  edge_session_id: string;
  accepted_interface_cids: string[];
  policy_cid?: string | null;
  expires_at?: string | null;
}

export interface MetaGlassesMobileORBEventRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  edge_session_id: string;
  event_type: MetaGlassesMobileORBEventType;
  payload: Record<string, unknown>;
  correlation_id: string;
  parent_receipt_cids?: string[];
  observed_at?: string;
}

export interface MetaGlassesMobileORBEventResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  event_cid: string;
  accepted: boolean;
  routed_operations: string[];
  receipt_cid: string;
}

export interface MetaGlassesMobileORBBindServiceRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  edge_session_id: string;
  service_interface_cid: string;
  service_descriptor?: Record<string, unknown>;
  operation?: string;
  transport_preference?: ORBTransportKind;
  user_intent?: string;
  policy_context?: Record<string, unknown>;
}

export interface MetaGlassesMobileORBTransportBinding {
  transport: ORBTransportKind;
  service_id: string;
  operation: string;
  metadata: Record<string, unknown>;
}

export interface MetaGlassesMobileORBOrbBinding {
  handle: string;
  interface_cid: string;
  descriptor_cid: string;
  service_id: string;
  operation: string;
  transport: ORBTransportKind;
  transport_binding: MetaGlassesMobileORBTransportBinding;
}

export interface MetaGlassesMobileORBBindServiceResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  binding_handle: string;
  transport: ORBTransportKind;
  granted_capabilities: string[];
  policy_decision: Record<string, unknown>;
  orb_binding?: MetaGlassesMobileORBOrbBinding | null;
  expires_at?: string | null;
}

export interface MetaGlassesMobileORBInvokeServiceRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  binding_handle: string;
  operation: string;
  arguments: Record<string, unknown>;
  glasses_context?: Record<string, unknown>;
  display_context?: Record<string, unknown>;
  correlation_id: string;
  parent_receipt_cids?: string[];
}

export interface MetaGlassesMobileORBInvokeServiceResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  ok: boolean;
  service_result: Record<string, unknown>;
  output_refs: string[];
  provenance_refs: string[];
  receipt_cid: string;
  follow_up_actions: Record<string, unknown>[];
  display_widget_action?: Record<string, unknown> | null;
  spoken_text?: string | null;
}

export interface MetaGlassesMobileORBSubscribeServiceUpdatesRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  binding_handle: string;
  operation: string;
  arguments?: Record<string, unknown>;
  stream?: string;
  correlation_id: string;
}

export interface MetaGlassesMobileORBSubscribeServiceUpdatesResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  subscription_id: string;
  receipt_cid: string;
  generation_key: string;
  subscription?: Record<string, unknown> | null;
}

export interface MetaGlassesMobileORBDispatchResponseRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  edge_session_id: string;
  result: Record<string, unknown>;
  render_targets: MetaGlassesMobileORBRenderTarget[];
  fallback?: Record<string, unknown>;
  correlation_id: string;
  parent_receipt_cids?: string[];
}

export interface MetaGlassesMobileORBDispatchResponseResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  dispatched_actions: Record<string, unknown>[];
  display_widget_action?: Record<string, unknown> | null;
  spoken_text?: string | null;
  receipt_cid: string;
}

export interface MetaGlassesMobileORBRevokeBindingRequest
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  binding_handle: string;
  reason: string;
  correlation_id?: string;
}

export interface MetaGlassesMobileORBRevokeBindingResponse
  extends MetaGlassesMobileORBControlSurfaceArtifacts {
  revoked: boolean;
  receipt_cid: string;
}

export type MetaGlassesMobileORBRequest =
  | MetaGlassesMobileORBRegisterRequest
  | MetaGlassesMobileORBEventRequest
  | MetaGlassesMobileORBBindServiceRequest
  | MetaGlassesMobileORBInvokeServiceRequest
  | MetaGlassesMobileORBSubscribeServiceUpdatesRequest
  | MetaGlassesMobileORBDispatchResponseRequest
  | MetaGlassesMobileORBRevokeBindingRequest;

export type MetaGlassesMobileORBResponse =
  | MetaGlassesMobileORBRegisterResponse
  | MetaGlassesMobileORBEventResponse
  | MetaGlassesMobileORBBindServiceResponse
  | MetaGlassesMobileORBInvokeServiceResponse
  | MetaGlassesMobileORBSubscribeServiceUpdatesResponse
  | MetaGlassesMobileORBDispatchResponseResponse
  | MetaGlassesMobileORBRevokeBindingResponse;

export interface MetaGlassesMobileORBBridgeBackend {
  registerEdgeCapabilities(
    request: MetaGlassesMobileORBRegisterRequest,
  ): Promise<MetaGlassesMobileORBRegisterResponse> | MetaGlassesMobileORBRegisterResponse;
  publishGlassesEvent(
    request: MetaGlassesMobileORBEventRequest,
  ): Promise<MetaGlassesMobileORBEventResponse> | MetaGlassesMobileORBEventResponse;
  bindService(
    request: MetaGlassesMobileORBBindServiceRequest,
  ): Promise<MetaGlassesMobileORBBindServiceResponse> | MetaGlassesMobileORBBindServiceResponse;
  invokeService(
    request: MetaGlassesMobileORBInvokeServiceRequest,
  ): Promise<MetaGlassesMobileORBInvokeServiceResponse> | MetaGlassesMobileORBInvokeServiceResponse;
  subscribeServiceUpdates(
    request: MetaGlassesMobileORBSubscribeServiceUpdatesRequest,
  ): Promise<MetaGlassesMobileORBSubscribeServiceUpdatesResponse> | MetaGlassesMobileORBSubscribeServiceUpdatesResponse;
  dispatchGlassesResponse(
    request: MetaGlassesMobileORBDispatchResponseRequest,
  ): Promise<MetaGlassesMobileORBDispatchResponseResponse> | MetaGlassesMobileORBDispatchResponseResponse;
  revokeBinding(
    request: MetaGlassesMobileORBRevokeBindingRequest,
  ): Promise<MetaGlassesMobileORBRevokeBindingResponse> | MetaGlassesMobileORBRevokeBindingResponse;
}

export interface MetaGlassesMobileORBEdgeSessionSnapshot
  extends MetaGlassesMobileORBRegisterResponse {
  edge_id: string;
  platform: MetaGlassesMobileORBPlatform;
  device_id?: string;
  device_model?: string;
  dat_capabilities: MetaGlassesMobileORBDatCapabilities;
  registered_at: string;
}

export interface MetaGlassesMobileORBServiceBindingSnapshot
  extends MetaGlassesMobileORBBindServiceResponse {
  edge_session_id: string;
  service_interface_cid: string;
  service_descriptor?: Record<string, unknown>;
  operation?: string;
  user_intent?: string;
  bound_at: string;
}

export interface MetaGlassesMobileORBEventSnapshot
  extends MetaGlassesMobileORBEventRequest,
    MetaGlassesMobileORBEventResponse {
  observed_at: string;
}

export interface MetaGlassesMobileORBServiceSubscriptionSnapshot
  extends MetaGlassesMobileORBSubscribeServiceUpdatesRequest,
    MetaGlassesMobileORBSubscribeServiceUpdatesResponse {
  edge_session_id?: string;
  service_interface_cid?: string;
  service_id?: string;
  orb_binding?: MetaGlassesMobileORBOrbBinding | null;
  status: 'active';
  subscribed_at: string;
}

export interface MetaGlassesMobileORBTaskMetadata {
  operation: MetaGlassesMobileORBOperation;
  correlation_id: string;
  receipt_cid: string;
  interface_cid: string;
  policy_outcome: 'permit' | 'deny';
  denied: boolean;
  recorded_at: string;
}

export interface MetaGlassesMobileORBBindOptions {
  operation: MetaGlassesMobileORBOperation;
  interface_cid?: string;
  endpoint?: string;
  context?: ORBInvocationContext;
}

export interface MetaGlassesMobileORBBridgeAdapterOptions {
  backend?: MetaGlassesMobileORBBridgeBackend;
  control_surface_policy_evaluator?: ControlSurfacePolicyEvaluator;
  operation_policies?: Record<string, ORBOperationPolicy>;
  control_surface_policy_evaluator?: ControlSurfacePolicyEvaluator;
  controlSurfacePolicyEvaluator?: ControlSurfacePolicyEvaluator;
  now?: () => Date;
}

const DEFAULT_ENDPOINT = 'local://meta-glasses-mobile-orb-bridge';
const MOBILE_ORB_EDGE_CAPABILITY = 'mobile/orb.edge';
const MOBILE_ORB_SERVICE_BIND_CAPABILITY = 'mobile/orb.service.bind';
const MOBILE_ORB_SERVICE_INVOKE_CAPABILITY = 'mobile/orb.service.invoke';
const MOBILE_ORB_SUBSCRIPTION_CAPABILITY = 'mobile/orb.subscription';
const MOBILE_ORB_RESPONSE_DISPATCH_CAPABILITY = 'mobile/orb.response.dispatch';
const MOBILE_ORB_BINDING_REVOKE_CAPABILITY = 'mobile/orb.binding.revoke';
const OBJECT_SCHEMA = { type: 'object', additionalProperties: true } as const;
const CONTROL_SURFACE_CONTRACT_REF = 'control_surface_contract:hallucinate-app:remote-client';
const CONTROL_SURFACE_POLICY_BUNDLE_REF = {
  policy_id: 'policy:hallucinate-app:remote-client-transport',
  policy_cid: 'local:hallucinate-app:remote-client-transport',
  version: '0.1.0',
  scope: 'remote-client-transport',
  source: 'system_default',
};
const CONTROL_SURFACE_COMPILED_POLICY_CID = 'local:hallucinate-app:remote-client-transport';
const CONTROL_SURFACE_SCHEMA_REFS = [
  'control_surface_contract',
  'interaction_envelope',
  'policy_decision',
  'mediation_receipt',
];

const OPERATION_CAPABILITIES: Record<MetaGlassesMobileORBOperation, string[]> = {
  register_edge_capabilities: [MOBILE_ORB_EDGE_CAPABILITY],
  publish_glasses_event: [MOBILE_ORB_EDGE_CAPABILITY],
  bind_service: [MOBILE_ORB_SERVICE_BIND_CAPABILITY],
  invoke_service: [MOBILE_ORB_SERVICE_INVOKE_CAPABILITY],
  subscribe_service_updates: [MOBILE_ORB_SUBSCRIPTION_CAPABILITY],
  dispatch_glasses_response: [MOBILE_ORB_RESPONSE_DISPATCH_CAPABILITY],
  revoke_binding: [MOBILE_ORB_BINDING_REVOKE_CAPABILITY],
};

export function createMetaGlassesMobileORBOperationPolicies(
  overrides: Record<string, ORBOperationPolicy> = {},
): Record<string, ORBOperationPolicy> {
  return {
    register_edge_capabilities: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.register_edge_capabilities },
      idempotency: { required: true, key_field: 'edge_id' },
    },
    publish_glasses_event: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.publish_glasses_event },
      idempotency: { required: true, key_field: 'correlation_id' },
      rate_limit: { max_invocations: 20, window_ms: 1_000 },
    },
    bind_service: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.bind_service },
      idempotency: { required: false, key_field: 'correlation_id' },
    },
    invoke_service: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.invoke_service },
      idempotency: { required: true, key_field: 'correlation_id' },
      retry: { max_attempts: 2, backoff_ms: 0 },
      circuit_breaker: { failure_threshold: 2, cooldown_ms: 30_000 },
    },
    subscribe_service_updates: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.subscribe_service_updates },
      rate_limit: { max_invocations: 4, window_ms: 1_000 },
    },
    dispatch_glasses_response: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.dispatch_glasses_response },
      idempotency: { required: true, key_field: 'correlation_id' },
    },
    revoke_binding: {
      authorization: { required_capabilities: OPERATION_CAPABILITIES.revoke_binding },
    },
    ...overrides,
  };
}

export function createMetaGlassesMobileORBBridgeDescriptor(
  options: { endpoint?: string } = {},
): MCPUIProfileDescriptor {
  const operations = [...META_GLASSES_MOBILE_ORB_OPERATIONS];
  return {
    name: 'mobile_orb_bridge',
    namespace: 'handsfree.meta_glasses.mobile',
    version: '0.1.0',
    methods: operations.map(operation => ({
      name: operation,
      input_schema: OBJECT_SCHEMA,
      output_schema: OBJECT_SCHEMA,
      description: methodDescription(operation),
    })),
    errors: [
      { name: 'policy_denied', code: 403 },
      { name: 'edge_session_not_found', code: 404 },
      { name: 'binding_not_found', code: 404 },
      { name: 'service_unavailable', code: 503 },
      { name: 'invalid_glasses_event', code: 422 },
    ],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['meta-glasses', 'mobile-orb-edge', 'mcp++', 'idl', 'orb'],
    observability: {
      trace: true,
      provenance: true,
    },
    interaction_patterns: {
      request_response: true,
      event_streams: true,
    },
    meta: {
      profile: 'swissknife.mcp++/ui-profile',
      profile_version: '0.1.0',
      app_id: 'handsfree-meta-glasses-mobile-orb',
      title: 'HandsFree Meta Glasses Mobile ORB Bridge',
      description: 'Phone-edge ORB descriptor for Meta Ray-Ban glasses and services.',
      publisher: 'handsfree',
    },
    services: [
      {
        id: 'mobile-orb-edge',
        interface_type: 'generic',
        transport: 'local',
        endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
        operations,
      },
    ],
    ui: {
      primary_template: 'job-console',
      templates: [
        {
          kind: 'job-console',
          title: 'Mobile ORB Bridge',
          operations: [
            'register_edge_capabilities',
            'publish_glasses_event',
            'invoke_service',
            'dispatch_glasses_response',
          ],
          regions: [
            {
              id: 'edge-session',
              kind: 'status',
              operation: 'register_edge_capabilities',
            },
            {
              id: 'events',
              kind: 'timeline',
              operation: 'publish_glasses_event',
            },
            {
              id: 'dispatch',
              kind: 'provenance',
              operation: 'dispatch_glasses_response',
            },
          ],
        },
      ],
    },
    data_contracts: {
      operations: operations.map(operation => ({
        method: operation,
        title: titleForOperation(operation),
        input_schema: OBJECT_SCHEMA,
        output_schema: OBJECT_SCHEMA,
        stream: operation === 'subscribe_service_updates'
          ? {
            kind: 'events',
            correlation_id_field: 'correlation_id',
            generation_key: 'mobile_orb_subscription',
          }
          : undefined,
        idempotent: [
          'register_edge_capabilities',
          'invoke_service',
          'dispatch_glasses_response',
        ].includes(operation),
      })),
    },
    permissions: {
      default_deny: true,
      operations: OPERATION_CAPABILITIES,
    },
    state_model: {
      keys: ['edge_session', 'service_bindings', 'service_subscriptions', 'event_log', 'receipts'],
      events: [
        'edge_registered',
        'glasses_event_published',
        'service_bound',
        'service_subscription_registered',
        'service_invoked',
        'response_dispatched',
        'binding_revoked',
      ],
      projections: ['active_edge_session', 'active_bindings', 'active_subscriptions', 'latest_dispatch'],
      replay: true,
    },
  };
}

export function createMetaGlassesMobileORBDescriptorSource(
  options: { interface_cid?: string; endpoint?: string } = {},
): ORBDescriptorSource {
  const descriptor = createMetaGlassesMobileORBBridgeDescriptor({
    endpoint: options.endpoint,
  });
  return {
    cid: options.interface_cid ?? computeInterfaceCID(descriptor),
    descriptor,
  };
}

export class MetaGlassesMobileORBBridgeAdapter {
  readonly localAdapter: LocalORBTransportAdapter;
  readonly router: MCPCapabilityRouter;

  private readonly backend: MetaGlassesMobileORBBridgeBackend;
  private readonly now: () => Date;
  private readonly taskMetadata: MetaGlassesMobileORBTaskMetadata[] = [];
  private edgeSession?: MetaGlassesMobileORBEdgeSessionSnapshot;

  constructor(options: MetaGlassesMobileORBBridgeAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.backend = options.backend ?? createDefaultMetaGlassesMobileORBBackend(this.now);
    this.localAdapter = new LocalORBTransportAdapter();
    this.registerHandlers(this.localAdapter);
    this.router = new MCPCapabilityRouter({
      adapters: createDefaultORBAdapters(this.localAdapter),
      control_surface_policy_evaluator: options.control_surface_policy_evaluator,
      operation_policies: createMetaGlassesMobileORBOperationPolicies(
        options.operation_policies,
      ),
    });
  }

  registerHandlers(adapter: LocalORBTransportAdapter = this.localAdapter): LocalORBTransportAdapter {
    for (const operation of META_GLASSES_MOBILE_ORB_OPERATIONS) {
      adapter.registerHandler(operation, request => this.handleInvocation(operation, request));
    }
    adapter.registerStreamHandler(
      'subscribe_service_updates',
      request => this.handleStream(request),
    );
    return adapter;
  }

  async bind(options: MetaGlassesMobileORBBindOptions): Promise<ORBBoundOperation> {
    return this.router.bind({
      descriptors: [
        createMetaGlassesMobileORBDescriptorSource({
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
    input: MetaGlassesMobileORBRequest,
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

  getEdgeSession(): MetaGlassesMobileORBEdgeSessionSnapshot | undefined {
    return clonePlain(this.edgeSession);
  }

  getTaskMetadata(): MetaGlassesMobileORBTaskMetadata[] {
    return clonePlain(this.taskMetadata);
  }

  private async handleInvocation(
    operation: MetaGlassesMobileORBOperation,
    request: LocalORBHandlerRequest,
  ): Promise<ORBTransportInvocationResult> {
    const context = ensureCorrelationId(request.context);
    const input = recordOrEmpty(request.input);
    const output = await this.invokeBackend(operation, input, context);
    if (operation === 'register_edge_capabilities') {
      const registerInput = input as unknown as MetaGlassesMobileORBRegisterRequest;
      const registerOutput = output as MetaGlassesMobileORBRegisterResponse;
      this.edgeSession = {
        ...registerOutput,
        edge_id: registerInput.edge_id,
        platform: registerInput.platform,
        device_id: registerInput.device_id,
        device_model: registerInput.device_model,
        dat_capabilities: registerInput.dat_capabilities,
        registered_at: this.now().toISOString(),
      };
    }
    return {
      output,
      output_refs: collectOutputRefs(output),
      provenance_refs: collectProvenanceRefs(output, context),
    };
  }

  private invokeBackend(
    operation: MetaGlassesMobileORBOperation,
    input: Record<string, unknown>,
    context: ORBInvocationContext & { correlation_id: string },
  ): Promise<MetaGlassesMobileORBResponse> | MetaGlassesMobileORBResponse {
    switch (operation) {
      case 'register_edge_capabilities':
        return this.backend.registerEdgeCapabilities(
          input as unknown as MetaGlassesMobileORBRegisterRequest,
        );
      case 'publish_glasses_event':
        return this.backend.publishGlassesEvent({
          ...(input as unknown as MetaGlassesMobileORBEventRequest),
          correlation_id: stringFromUnknown(input.correlation_id) ?? context.correlation_id,
        });
      case 'bind_service':
        return this.backend.bindService(
          input as unknown as MetaGlassesMobileORBBindServiceRequest,
        );
      case 'invoke_service':
        return this.backend.invokeService({
          ...(input as unknown as MetaGlassesMobileORBInvokeServiceRequest),
          correlation_id: stringFromUnknown(input.correlation_id) ?? context.correlation_id,
        });
      case 'subscribe_service_updates':
        return this.backend.subscribeServiceUpdates({
          ...(input as unknown as MetaGlassesMobileORBSubscribeServiceUpdatesRequest),
          correlation_id: stringFromUnknown(input.correlation_id) ?? context.correlation_id,
        });
      case 'dispatch_glasses_response':
        return this.backend.dispatchGlassesResponse({
          ...(input as unknown as MetaGlassesMobileORBDispatchResponseRequest),
          correlation_id: stringFromUnknown(input.correlation_id) ?? context.correlation_id,
        });
      case 'revoke_binding':
        return this.backend.revokeBinding(
          input as unknown as MetaGlassesMobileORBRevokeBindingRequest,
        );
      default:
        return exhaustive(operation);
    }
  }

  private async *handleStream(request: ORBStreamRequest): AsyncIterable<ORBStreamEvent> {
    const context = ensureCorrelationId(request.context);
    const generationKey = `${request.binding.interface_cid}:${request.binding.operation.method}:${context.correlation_id}`;
    const event = {
      type: 'mobile_orb_subscription_ready',
      operation: request.binding.operation.method,
      binding_handle: request.binding.handle,
      correlation_id: context.correlation_id,
    };
    yield {
      correlation_id: context.correlation_id,
      interface_cid: request.binding.interface_cid,
      operation: request.binding.operation.method,
      event,
      event_cid: computeCID(stableStringify(event)),
      generation_key: generationKey,
      received_at: this.now().toISOString(),
    };
  }

  private recordReceipt(response: ORBInvocationResponse): void {
    this.taskMetadata.push({
      operation: response.receipt.operation as MetaGlassesMobileORBOperation,
      correlation_id: response.receipt.correlation_id,
      receipt_cid: response.receipt.receipt_cid,
      interface_cid: response.receipt.interface_cid,
      policy_outcome: response.receipt.policy_decision.outcome,
      denied: response.denied,
      recorded_at: this.now().toISOString(),
    });
  }

  private recordStreamReceipt(
    receipt: ORBStreamSubscription['receipt'],
    denied: boolean,
  ): void {
    this.taskMetadata.push({
      operation: receipt.operation as MetaGlassesMobileORBOperation,
      correlation_id: receipt.correlation_id,
      receipt_cid: receipt.receipt_cid,
      interface_cid: receipt.interface_cid,
      policy_outcome: receipt.policy_decision.outcome,
      denied,
      recorded_at: this.now().toISOString(),
    });
  }
}

function remoteSurface(
  operation: MetaGlassesMobileORBOperation | string,
  payload: Record<string, unknown>,
): string {
  if (payload.platform === 'simulator') {
    return 'simulator';
  }
  if (
    operation === 'publish_glasses_event'
    || ['captouch', 'neural_input', 'display_action'].includes(String(payload.event_type ?? ''))
  ) {
    return 'meta_glasses';
  }
  return 'mobile';
}

function remoteActorId(payload: Record<string, unknown>): string {
  return stringFromUnknown(payload.edge_session_id)
    ?? stringFromUnknown(payload.edge_id)
    ?? stringFromUnknown(payload.device_id)
    ?? stringFromUnknown(payload.binding_handle)
    ?? stringFromUnknown(payload.correlation_id)
    ?? 'remote-client';
}

function canonicalOutcome(value: unknown): string {
  if (value === 'permit') {
    return 'allow';
  }
  return [
    'allow',
    'deny',
    'require_confirmation',
    'defer',
    'rewrite',
    'fallback_surface',
    'rate_limit',
  ].includes(String(value))
    ? String(value)
    : 'allow';
}

function normalizedIntent(
  operation: MetaGlassesMobileORBOperation | string,
  payload: Record<string, unknown>,
  surface: string,
): Record<string, unknown> {
  const existingIntent = recordOrNull(payload.normalized_intent);
  if (existingIntent && stringFromUnknown(existingIntent.method)) {
    return {
      intent: stringFromUnknown(existingIntent.intent) ?? `${surface}.${operation}`,
      method: stringFromUnknown(existingIntent.method) ?? operation,
      target_ref: stringFromUnknown(existingIntent.target_ref)
        ?? `handsfree.meta_glasses.mobile.mobile_orb_bridge.${operation}`,
      arguments: recordOrEmpty(existingIntent.arguments ?? payload),
      confidence: numberFromUnknown(existingIntent.confidence) ?? 1,
    };
  }
  const nestedPayload = recordOrEmpty(payload.payload);
  const args = recordOrEmpty(payload.arguments);
  return {
    intent: stringFromUnknown(payload.user_intent)
      ?? stringFromUnknown(payload.intent)
      ?? stringFromUnknown(nestedPayload.intent)
      ?? stringFromUnknown(nestedPayload.command)
      ?? stringFromUnknown(args.intent)
      ?? `${surface}.${operation}`,
    method: operation,
    target_ref: `handsfree.meta_glasses.mobile.mobile_orb_bridge.${operation}`,
    arguments: payload,
    confidence: 1,
  };
}

function runtimeContext(
  payload: Record<string, unknown>,
  surface: string,
  emittedAt: string,
): Record<string, unknown> {
  return {
    local_time: emittedAt,
    state_frames: Array.isArray(payload.state_frames) ? payload.state_frames : [],
    device_mode: stringFromUnknown(payload.device_mode) ?? surface,
    platform: stringFromUnknown(payload.platform) ?? surface,
    location_context: recordOrEmpty(payload.location_context),
    device_context: sortedDefinedRecord({
      edge_id: payload.edge_id,
      edge_session_id: payload.edge_session_id,
      device_id: payload.device_id,
      device_model: payload.device_model,
      dat_capabilities: payload.dat_capabilities,
      glasses_context: payload.glasses_context,
      display_context: payload.display_context,
    }),
  };
}

function logicBinding(
  operation: MetaGlassesMobileORBOperation | string,
  surface: string,
): Record<string, unknown> {
  const bindingId = `hallucinate_app.remote_client.${surface}.${operation}`;
  return {
    binding_id: bindingId,
    policy_bundle_ref: CONTROL_SURFACE_POLICY_BUNDLE_REF,
    compiled_policy_cid: CONTROL_SURFACE_COMPILED_POLICY_CID,
    surface_ref: surface,
    method_ref: operation,
    norm_refs: [`${bindingId}.transport_only`],
  };
}

function buildMobileORBControlSurfaceArtifacts(
  operation: MetaGlassesMobileORBOperation | string,
  payload: Record<string, unknown>,
  options: {
    emitted_at?: string;
    receipt_cid?: string;
    outcome?: string;
    reason?: string;
  } = {},
): Required<MetaGlassesMobileORBControlSurfaceArtifacts> {
  const transportedReceipt = recordOrNull(payload.mediation_receipt);
  const transportedEnvelope = recordOrNull(transportedReceipt?.interaction_envelope);
  const transportedDecision = recordOrNull(transportedReceipt?.policy_decision);
  if (transportedReceipt && transportedEnvelope && transportedDecision) {
    return {
      control_surface_contract_ref: stringFromUnknown(transportedReceipt.control_surface_contract_ref)
        ?? stringFromUnknown(transportedEnvelope.control_surface_contract_ref)
        ?? stringFromUnknown(payload.control_surface_contract_ref)
        ?? CONTROL_SURFACE_CONTRACT_REF,
      interaction_envelope: transportedEnvelope,
      normalized_intent: recordOrEmpty(transportedEnvelope.normalized_intent),
      policy_decision: transportedDecision,
      mediation_receipt: transportedReceipt,
    };
  }

  const emittedAt = options.emitted_at ?? new Date().toISOString();
  const surface = remoteSurface(operation, payload);
  const intent = normalizedIntent(operation, payload, surface);
  const contractRef = stringFromUnknown(payload.control_surface_contract_ref)
    ?? CONTROL_SURFACE_CONTRACT_REF;
  const interactionEnvelope = {
    interaction_id: stringFromUnknown(payload.interaction_id)
      ?? stringFromUnknown(payload.correlation_id)
      ?? stringFromUnknown(payload.edge_session_id)
      ?? localCid('interaction', { operation, payload }),
    surface,
    surface_event: stringFromUnknown(payload.event_type) ?? String(operation),
    raw_payload: payload,
    normalized_intent: intent,
    actor: {
      type: 'remote_client',
      id: remoteActorId(payload),
      delegation_chain: [remoteActorId(payload)],
    },
    context: runtimeContext(payload, surface, emittedAt),
    control_surface_contract_ref: contractRef,
    policy_bundle_ref: CONTROL_SURFACE_POLICY_BUNDLE_REF,
    compiled_policy_cid: CONTROL_SURFACE_COMPILED_POLICY_CID,
    logic_bindings: [logicBinding(operation, surface)],
  };
  const outcome = canonicalOutcome(options.outcome);
  const explanation = `${options.reason ?? 'Remote client artifact normalized to canonical control-surface envelope.'} Remote clients transport the Hallucinate App mediation receipt and do not define or authorize a separate policy contract.`;
  const policyDecision = {
    decision_id: localCid('control-surface-decision', {
      interaction_id: interactionEnvelope.interaction_id,
      operation,
      outcome,
      compiled_policy_cid: CONTROL_SURFACE_COMPILED_POLICY_CID,
    }),
    interaction_id: interactionEnvelope.interaction_id,
    interaction_envelope: interactionEnvelope,
    outcome,
    policy_bundle_ref: CONTROL_SURFACE_POLICY_BUNDLE_REF,
    compiled_policy_cid: CONTROL_SURFACE_COMPILED_POLICY_CID,
    decided_at: emittedAt,
    matched_norms: [{
      norm_id: 'remote_client_transport_receipt',
      outcome,
      priority: 100,
      policy_bundle_ref: CONTROL_SURFACE_POLICY_BUNDLE_REF,
      logic_clause_refs: [String(logicBinding(operation, surface).binding_id)],
      guard_refs: [],
      explanation,
    }],
    effects: [{
      outcome,
      method: intent.method,
      target_ref: intent.target_ref,
      arguments: intent.arguments,
      confirmation_required: outcome === 'require_confirmation',
      reason: explanation,
    }],
    frame_facts: [
      {
        fact_id: localCid('fact', [interactionEnvelope.interaction_id, 'surface']),
        kind: 'surface',
        subject: surface,
        predicate: 'surface.id',
        value: surface,
        attrs: {},
      },
      {
        fact_id: localCid('fact', [interactionEnvelope.interaction_id, 'event']),
        kind: 'event',
        subject: surface,
        predicate: 'surface_event',
        value: interactionEnvelope.surface_event,
        attrs: {},
      },
      {
        fact_id: localCid('fact', [interactionEnvelope.interaction_id, 'method']),
        kind: 'method',
        subject: String(intent.target_ref),
        predicate: 'intent.method',
        value: intent.method,
        attrs: {},
      },
    ],
    reasons: [explanation],
    explanation,
    confidence: intent.confidence,
    metadata: {
      source: 'hallucinate_app.control_surface_mediator.remote_client_envelope',
      authorization_scope: 'hallucinate_app_control_surface_contract',
      remote_client_policy_contract: false,
      transport_receipt: true,
      schema_refs: CONTROL_SURFACE_SCHEMA_REFS,
    },
  };
  const invoked = !['deny', 'require_confirmation', 'defer', 'rate_limit'].includes(outcome);
  const mediationReceipt = {
    receipt_id: options.receipt_cid ?? localCid('mediation_receipt', {
      interaction_id: interactionEnvelope.interaction_id,
      decision_id: policyDecision.decision_id,
      outcome,
    }),
    emitted_at: emittedAt,
    control_surface_contract_ref: contractRef,
    interaction_envelope: interactionEnvelope,
    policy_decision: policyDecision,
    policy_refs: [{
      policy_bundle_ref: CONTROL_SURFACE_POLICY_BUNDLE_REF,
      compiled_policy_cid: CONTROL_SURFACE_COMPILED_POLICY_CID,
      matched_norm_refs: ['remote_client_transport_receipt'],
    }],
    mediation_result: {
      outcome,
      invoked,
      final_method: intent.method,
      final_target_ref: intent.target_ref,
      confirmation_required: outcome === 'require_confirmation',
    },
    explanation,
    metadata: {
      source: 'hallucinate_app.control_surface_mediator.remote_client_envelope',
      remote_client_policy_contract: false,
      schema_refs: CONTROL_SURFACE_SCHEMA_REFS,
    },
  };

  return {
    control_surface_contract_ref: contractRef,
    interaction_envelope: interactionEnvelope,
    normalized_intent: intent,
    policy_decision: policyDecision,
    mediation_receipt: mediationReceipt,
  };
}

function controlSurfaceFields(
  artifacts: MetaGlassesMobileORBControlSurfaceArtifacts,
): MetaGlassesMobileORBControlSurfaceArtifacts {
  return sortedDefinedRecord({
    control_surface_contract_ref: artifacts.control_surface_contract_ref,
    interaction_envelope: artifacts.interaction_envelope,
    normalized_intent: artifacts.normalized_intent,
    policy_decision: artifacts.policy_decision,
    mediation_receipt: artifacts.mediation_receipt,
  }) as MetaGlassesMobileORBControlSurfaceArtifacts;
}

function mediationInvoked(artifacts: MetaGlassesMobileORBControlSurfaceArtifacts): boolean {
  const receipt = recordOrNull(artifacts.mediation_receipt);
  const result = recordOrNull(receipt?.mediation_result);
  return result?.invoked === true;
}

export function createDefaultMetaGlassesMobileORBBackend(
  now: () => Date = () => new Date(),
): MetaGlassesMobileORBBridgeBackend {
  const edgeSessions = new Map<string, MetaGlassesMobileORBEdgeSessionSnapshot>();
  const bindings = new Map<string, MetaGlassesMobileORBServiceBindingSnapshot>();
  const subscriptions = new Map<string, MetaGlassesMobileORBServiceSubscriptionSnapshot>();
  const events = new Map<string, MetaGlassesMobileORBEventSnapshot>();

  function requireEdgeSession(edgeSessionId: string): MetaGlassesMobileORBEdgeSessionSnapshot {
    const session = edgeSessions.get(edgeSessionId);
    if (!session) {
      throw new Error(`Mobile ORB edge session not found: ${edgeSessionId}.`);
    }
    return session;
  }

  function requireBinding(bindingHandle: string): MetaGlassesMobileORBServiceBindingSnapshot {
    const binding = bindings.get(bindingHandle);
    if (!binding) {
      throw new Error(`Mobile ORB service binding not found: ${bindingHandle}.`);
    }
    return binding;
  }

  return {
    registerEdgeCapabilities(request) {
      const edgeSessionId = localCid('mobile-orb-edge', {
        edge_id: request.edge_id,
        platform: request.platform,
        device_id: request.device_id,
        local_interface_cids: request.local_interface_cids ?? [],
      });
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'register_edge_capabilities',
        {
          ...request,
          edge_session_id: edgeSessionId,
        },
        {
          emitted_at: now().toISOString(),
          reason: 'Mobile ORB edge registration normalized by Hallucinate App control-surface contract.',
        },
      );
      const response = {
        edge_session_id: edgeSessionId,
        accepted_interface_cids: request.local_interface_cids ?? [],
        policy_cid: null,
        ...controlSurfaceFields(artifacts),
        expires_at: null,
      };
      edgeSessions.set(edgeSessionId, {
        ...response,
        edge_id: request.edge_id,
        platform: request.platform,
        device_id: request.device_id,
        device_model: request.device_model,
        dat_capabilities: request.dat_capabilities,
        registered_at: now().toISOString(),
      });
      return response;
    },

    publishGlassesEvent(request) {
      requireEdgeSession(request.edge_session_id);
      const eventCid = localCid('mobile-orb-event', request);
      const receiptCid = localCid('mobile-orb-receipt', {
        operation: 'publish_glasses_event',
        event_cid: eventCid,
        correlation_id: request.correlation_id,
      });
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'publish_glasses_event',
        {
          ...request,
          event_cid: eventCid,
        },
        {
          emitted_at: request.observed_at ?? now().toISOString(),
          receipt_cid: receiptCid,
          reason: 'Meta-glasses event normalized by Hallucinate App control-surface contract.',
        },
      );
      const response = {
        event_cid: eventCid,
        accepted: mediationInvoked(artifacts),
        routed_operations: ['captouch', 'neural_input', 'display_action'].includes(
          request.event_type,
        )
          ? ['bind_service', 'invoke_service']
          : [],
        receipt_cid: receiptCid,
        ...controlSurfaceFields(artifacts),
      };
      events.set(eventCid, {
        ...request,
        ...response,
        observed_at: request.observed_at ?? now().toISOString(),
      });
      return response;
    },

    bindService(request) {
      requireEdgeSession(request.edge_session_id);
      const bindingHandle = localCid('mobile-orb-binding', {
        edge_session_id: request.edge_session_id,
        service_interface_cid: request.service_interface_cid,
        operation: request.operation,
        transport: request.transport_preference ?? 'mcp-server',
      });
      const orbBinding = buildORBServiceBindingMetadata(request, bindingHandle);
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'bind_service',
        {
          ...request,
          binding_handle: bindingHandle,
        },
        {
          emitted_at: now().toISOString(),
          reason: 'Service descriptor binding normalized by Hallucinate App control-surface contract.',
        },
      );
      const response = {
        binding_handle: bindingHandle,
        transport: request.transport_preference ?? 'mcp-server',
        granted_capabilities: [],
        ...controlSurfaceFields(artifacts),
        orb_binding: orbBinding,
        expires_at: null,
      };
      bindings.set(bindingHandle, {
        ...response,
        edge_session_id: request.edge_session_id,
        service_interface_cid: request.service_interface_cid,
        service_descriptor: request.service_descriptor,
        operation: request.operation,
        user_intent: request.user_intent,
        bound_at: now().toISOString(),
      });
      return response;
    },

    invokeService(request) {
      const binding = requireBinding(request.binding_handle);
      const receiptCid = localCid('mobile-orb-receipt', {
        binding_handle: request.binding_handle,
        operation: request.operation,
        correlation_id: request.correlation_id,
        arguments: request.arguments,
      });
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'invoke_service',
        request as unknown as Record<string, unknown>,
        {
          receipt_cid: receiptCid,
          reason: 'Service invocation normalized by Hallucinate App control-surface contract.',
        },
      );
      return {
        ok: true,
        service_result: {
          operation: request.operation,
          arguments: request.arguments,
          service_interface_cid: binding.service_interface_cid,
          orb_binding: binding.orb_binding,
        },
        output_refs: [receiptCid],
        provenance_refs: [
          binding.service_interface_cid,
          ...(request.parent_receipt_cids ?? []),
        ],
        receipt_cid: receiptCid,
        ...controlSurfaceFields(artifacts),
        follow_up_actions: arrayOfRecords(request.arguments.follow_up_actions),
        display_widget_action: recordOrNull(request.arguments.display_widget_action),
        spoken_text: stringFromUnknown(request.arguments.spoken_text) ?? null,
      };
    },

    subscribeServiceUpdates(request) {
      const binding = requireBinding(request.binding_handle);
      const subscriptionId = localCid('mobile-orb-subscription', request);
      const receiptCid = localCid('mobile-orb-receipt', request);
      const generationKey = `${request.binding_handle}:${request.operation}:${request.stream ?? 'updates'}`;
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'subscribe_service_updates',
        {
          ...request,
          subscription_id: subscriptionId,
        },
        {
          emitted_at: now().toISOString(),
          receipt_cid: receiptCid,
          reason: 'Service update subscription normalized by Hallucinate App control-surface contract.',
        },
      );
      const subscription = {
        ...request,
        subscription_id: subscriptionId,
        receipt_cid: receiptCid,
        generation_key: generationKey,
        edge_session_id: binding.edge_session_id,
        service_interface_cid: binding.service_interface_cid,
        service_id: binding.orb_binding?.service_id,
        orb_binding: binding.orb_binding ?? null,
        status: 'active' as const,
        subscribed_at: now().toISOString(),
        ...controlSurfaceFields(artifacts),
      };
      subscriptions.set(subscriptionId, subscription);
      return {
        subscription_id: subscriptionId,
        receipt_cid: receiptCid,
        generation_key: generationKey,
        ...controlSurfaceFields(artifacts),
        subscription,
      };
    },

    dispatchGlassesResponse(request) {
      requireEdgeSession(request.edge_session_id);
      const receiptCid = localCid('mobile-orb-receipt', {
        operation: 'dispatch_glasses_response',
        correlation_id: request.correlation_id,
        parent_receipt_cids: request.parent_receipt_cids ?? [],
        render_targets: request.render_targets,
      });
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'dispatch_glasses_response',
        request as unknown as Record<string, unknown>,
        {
          receipt_cid: receiptCid,
          reason: 'Glasses response dispatch normalized by Hallucinate App control-surface contract.',
        },
      );
      return {
        dispatched_actions: arrayOfRecords(request.result.follow_up_actions),
        display_widget_action: recordOrNull(request.result.display_widget_action),
        spoken_text: stringFromUnknown(request.result.spoken_text) ?? null,
        receipt_cid: receiptCid,
        ...controlSurfaceFields(artifacts),
      };
    },

    revokeBinding(request) {
      const revoked = bindings.delete(request.binding_handle);
      if (revoked) {
        for (const [subscriptionId, subscription] of subscriptions.entries()) {
          if (subscription.binding_handle === request.binding_handle) {
            subscriptions.delete(subscriptionId);
          }
        }
      }
      const receiptCid = localCid('mobile-orb-receipt', request);
      const artifacts = buildMobileORBControlSurfaceArtifacts(
        'revoke_binding',
        request as unknown as Record<string, unknown>,
        {
          receipt_cid: receiptCid,
          reason: 'Service binding revocation normalized by Hallucinate App control-surface contract.',
        },
      );
      return {
        revoked,
        receipt_cid: receiptCid,
        ...controlSurfaceFields(artifacts),
      };
    },
  };
}

function buildORBServiceBindingMetadata(
  request: MetaGlassesMobileORBBindServiceRequest,
  bindingHandle: string,
): MetaGlassesMobileORBOrbBinding {
  const normalizedDescriptor = normalizeServiceInterfaceDescriptor(
    request.service_interface_cid,
    request.service_descriptor,
  );
  const descriptorCid = normalizedDescriptor
    ? localCid('mcp-interface', normalizedDescriptor)
    : request.service_interface_cid;
  const serviceId = serviceIdForDescriptor(
    request.service_interface_cid,
    request.service_descriptor,
  );
  const operation = operationForDescriptor(request.operation, request.service_descriptor);
  const transport = request.transport_preference ?? 'mcp-server';
  const descriptorMetadata = normalizeDescriptorMetadata(request.service_descriptor?.metadata);

  return {
    handle: bindingHandle,
    interface_cid: request.service_interface_cid,
    descriptor_cid: descriptorCid,
    service_id: serviceId,
    operation,
    transport,
    transport_binding: {
      transport,
      service_id: serviceId,
      operation,
      metadata: {
        ...descriptorMetadata,
        descriptor_cid: descriptorCid,
        descriptor_available: isRecord(request.service_descriptor),
        descriptor_kind: normalizedDescriptor ? 'mcp-idl' : undefined,
        interface_descriptor: normalizedDescriptor,
      },
    },
  };
}

function normalizeServiceInterfaceDescriptor(
  serviceInterfaceCid: string,
  serviceDescriptor: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!isRecord(serviceDescriptor)) {
    return undefined;
  }

  const normalizedDescriptor: Record<string, unknown> = {
    name: stringFromUnknown(serviceDescriptor.name)
      ?? stringFromUnknown(serviceDescriptor.service_id)
      ?? stringFromUnknown(serviceDescriptor.serviceId)
      ?? serviceInterfaceCid,
    namespace: stringFromUnknown(serviceDescriptor.namespace)
      ?? stringFromUnknown(serviceDescriptor.service_namespace)
      ?? stringFromUnknown(serviceDescriptor.serviceNamespace)
      ?? 'handsfree.meta_glasses.mobile',
    version: stringFromUnknown(serviceDescriptor.version) ?? '0.1.0',
    methods: normalizeMethodDefinitions(serviceDescriptor.methods),
    errors: normalizeErrorDefinitions(serviceDescriptor.errors),
    requires: Array.isArray(serviceDescriptor.requires)
      ? serviceDescriptor.requires.filter(item => typeof item === 'string')
      : [],
    compatibility: normalizeRecord(serviceDescriptor.compatibility),
  };
  const metadata = normalizeDescriptorMetadata(serviceDescriptor.metadata);
  if (Object.keys(metadata).length > 0) {
    normalizedDescriptor.metadata = metadata;
  }
  return normalizedDescriptor;
}

function normalizeDescriptorMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return sortedDefinedRecord({
    provider_name: stringFromUnknown(value.provider_name),
    server_family: stringFromUnknown(value.server_family) ?? stringFromUnknown(value.mcp_server_family),
    tool_name: stringFromUnknown(value.tool_name)
      ?? stringFromUnknown(value.default_tool_name)
      ?? stringFromUnknown(value.operation_tool_name),
  });
}

function normalizeMethodDefinitions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .filter(method => typeof method.name === 'string' && method.name.length > 0)
    .map(sortedDefinedRecord);
}

function normalizeErrorDefinitions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .filter(error => typeof error.name === 'string' && error.name.length > 0)
    .map(sortedDefinedRecord);
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? sortedDefinedRecord(value) : {};
}

function sortedDefinedRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => [key, value[key]]),
  );
}

function serviceIdForDescriptor(
  serviceInterfaceCid: string,
  serviceDescriptor: Record<string, unknown> | undefined,
): string {
  if (!isRecord(serviceDescriptor)) {
    return serviceInterfaceCid;
  }
  return stringFromUnknown(serviceDescriptor.service_id)
    ?? stringFromUnknown(serviceDescriptor.serviceId)
    ?? stringFromUnknown(serviceDescriptor.name)
    ?? stringFromUnknown(serviceDescriptor.namespace)
    ?? serviceInterfaceCid;
}

function operationForDescriptor(
  requestedOperation: string | undefined,
  serviceDescriptor: Record<string, unknown> | undefined,
): string {
  if (requestedOperation) {
    return requestedOperation;
  }
  const methods = serviceDescriptor?.methods;
  if (Array.isArray(methods)) {
    for (const method of methods) {
      if (isRecord(method) && typeof method.name === 'string' && method.name.length > 0) {
        return method.name;
      }
    }
  }
  return 'invoke';
}

function methodDescription(operation: MetaGlassesMobileORBOperation): string {
  return titleForOperation(operation);
}

function titleForOperation(operation: MetaGlassesMobileORBOperation): string {
  return operation
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function collectOutputRefs(output: MetaGlassesMobileORBResponse): string[] {
  const refs = collectStringFields(output, new Set([
    'policy_cid',
    'event_cid',
    'binding_handle',
    'subscription_id',
    'receipt_cid',
    'widget_cid',
  ]));
  return refs.filter(isCidLike);
}

function collectProvenanceRefs(
  output: MetaGlassesMobileORBResponse,
  context: ORBInvocationContext,
): string[] {
  return uniqueStrings([
    ...collectStringFields(output, new Set([
      'service_interface_cid',
      'interface_cid',
      'descriptor_cid',
      'correlation_id',
    ])),
    ...(context.parent_receipt_cids ?? []),
  ]);
}

function collectStringFields(value: unknown, keys: Set<string>): string[] {
  const collected: string[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) {
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (keys.has(key) && typeof child === 'string' && child.length > 0) {
        collected.push(child);
      }
      visit(child);
    }
  };
  visit(value);
  return uniqueStrings(collected);
}

function localCid(prefix: string, value: unknown): string {
  return `sha256:${prefix}:${computeCID(stableStringify(value)).slice('sha256:'.length)}`;
}

function ensureCorrelationId(
  context: ORBInvocationContext,
): ORBInvocationContext & { correlation_id: string } {
  return {
    ...context,
    correlation_id: context.correlation_id ?? 'meta-glasses-mobile-orb',
  };
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isCidLike(value: string): boolean {
  return value.startsWith('sha256:') || value.startsWith('bafy') || value.startsWith('Qm');
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

function clonePlain<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function exhaustive(value: never): never {
  throw new Error(`Unsupported mobile ORB operation: ${String(value)}.`);
}

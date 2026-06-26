import { computeCID } from './mcp-idl.js';
import {
  META_GLASSES_CAMERA_ADAPTER_PROPERTY,
  createMetaGlassesCameraDescriptor,
  requestMetaGlassesCameraCapture,
  type MetaGlassesCameraAppDescriptor,
  type MetaGlassesCameraCaptureRequest,
  type MetaGlassesCameraCaptureResult,
  type MetaGlassesCameraReceipt,
} from './meta-glasses-camera-adapter.js';
import {
  createMetaGlassesAudioAppRequirements,
  requestMetaGlassesAudioRoute,
  type MetaGlassesAudioCapability,
  type MetaGlassesAudioReceipt,
  type MetaGlassesAudioRouteRequest,
  type MetaGlassesAudioRouteResult,
} from './meta-glasses-audio-adapter.js';
import {
  createMetaGlassesInputAdapterDescriptor,
  routeMetaGlassesInputEvent,
  type MetaGlassesInputAdapterDescriptor,
  type MetaGlassesInputCapability,
  type MetaGlassesInputEventRequest,
  type MetaGlassesInputReceipt,
  type MetaGlassesInputRouteResult,
} from './meta-glasses-input-adapter.js';
import {
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOMCPReceiptMetadata,
  type MetaGlassesIOPayloadRef,
  type MetaGlassesIOPeerSession,
  type MetaGlassesIOPermissionScope,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
  type MetaGlassesIOSurface,
} from './meta-glasses-io-profile.js';
import {
  createMetaGlassesIOBridgeEnvelope,
  type MetaGlassesIOBackpressureState,
  type MetaGlassesIOBridgeEnvelope,
  type MetaGlassesIOControlPlaneRoute,
  type MetaGlassesIOPrivacyRedactionStrategy,
} from './meta-glasses-io-transport.js';

export const META_GLASSES_CONTROL_PLANE_ROUTER_ID =
  'org.handsfree.swissknife.meta-glasses-control-plane-router@0.1.0';

export type MetaGlassesControlPlaneBindingKind =
  | 'camera'
  | 'audio'
  | 'input'
  | 'display';

export type MetaGlassesControlPlaneRouteStatus =
  | 'accepted'
  | 'denied'
  | 'fallback'
  | 'degraded'
  | 'throttled'
  | 'replayed'
  | 'backpressure'
  | 'unsupported'
  | 'error';

export type MetaGlassesControlPlaneSessionStatus =
  | 'active'
  | 'degraded'
  | 'fallback'
  | 'blocked';

export interface MetaGlassesControlPlaneBinding {
  binding_id: string;
  app_id: string;
  kind: MetaGlassesControlPlaneBindingKind;
  capability: MetaGlassesIOCapabilityKind;
  interaction: string;
  action: string;
  required_scopes: MetaGlassesIOPermissionScope[];
  orb_tool: string;
  control_plane_route: MetaGlassesIOControlPlaneRoute;
  privacy_redaction: MetaGlassesIOPrivacyRedactionStrategy;
  fallback_tool: string;
  max_in_flight?: number;
}

export interface MetaGlassesControlPlaneSession {
  app_id: string;
  session_id: string;
  device_session_id: string;
  status: MetaGlassesControlPlaneSessionStatus;
  generation: number;
  route_history: string[];
  receipt_cids: string[];
  last_correlation_id?: string;
  peer_session?: MetaGlassesIOPeerSession;
}

export interface MetaGlassesControlPlaneRegisterRequest {
  app_id: string;
  camera_descriptor?: MetaGlassesCameraAppDescriptor;
  input_descriptor?: MetaGlassesInputAdapterDescriptor;
  include_audio?: boolean;
  include_display?: boolean;
  display_binding_id?: string;
}

export interface MetaGlassesControlPlaneRouteRequest {
  app_id: string;
  binding_id: string;
  correlation_id: string;
  payload_refs?: MetaGlassesIOPayloadRef[];
  bridge?: MetaGlassesIOBridgeEnvelope;
  policy?: MetaGlassesIOPolicyDecision;
  readiness?: MetaGlassesIOReadiness;
  sequence?: number;
  event_id?: string;
  timestamp_ms?: number;
  in_flight?: number;
  force_error?: string;
  adapter_request?:
    | MetaGlassesCameraCaptureRequest
    | MetaGlassesAudioRouteRequest
    | MetaGlassesInputEventRequest;
  normalized_event?: Record<string, unknown>;
}

export interface MetaGlassesControlPlaneToolCall {
  tool: string;
  fallback_tool?: string;
  input_cid: string;
  arguments: {
    app_id: string;
    binding_id: string;
    capability: MetaGlassesIOCapabilityKind;
    correlation_id: string;
    payload_refs: MetaGlassesIOPayloadRef[];
    normalized_event?: unknown;
    bridge_envelope_id?: string;
    session_id: string;
  };
}

export interface MetaGlassesControlPlaneReceipt extends MetaGlassesIOMCPReceiptMetadata {
  receipt_id: string;
  router_id: typeof META_GLASSES_CONTROL_PLANE_ROUTER_ID;
  status: MetaGlassesControlPlaneRouteStatus;
  binding_id: string;
  app_id: string;
  capability: MetaGlassesIOCapabilityKind;
  tool: string;
  policy_decision: MetaGlassesIOPolicyDecision;
  replay_key: string;
  session_generation: number;
}

export interface MetaGlassesControlPlaneRouteDecision {
  route_id: string;
  status: MetaGlassesControlPlaneRouteStatus;
  binding: MetaGlassesControlPlaneBinding;
  tool_call: MetaGlassesControlPlaneToolCall;
  policy_handoff: MetaGlassesIOPolicyDecision;
  session: MetaGlassesControlPlaneSession;
  payload_refs: MetaGlassesIOPayloadRef[];
  peer_session?: MetaGlassesIOPeerSession;
  bridge?: MetaGlassesIOBridgeEnvelope;
  privacy: {
    redaction: MetaGlassesIOPrivacyRedactionStrategy;
    raw_payload_forwarded: false;
    redacted_fields: string[];
  };
  backpressure: {
    state: MetaGlassesIOBackpressureState;
    in_flight: number;
    max_in_flight: number;
  };
  fallback?: {
    tool: string;
    reason: string;
  };
  receipt: MetaGlassesControlPlaneReceipt;
  adapter_result?: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult;
  error?: string;
}

export class MetaGlassesControlPlaneRouter {
  private readonly bindings = new Map<string, MetaGlassesControlPlaneBinding>();
  private readonly sessions = new Map<string, MetaGlassesControlPlaneSession>();
  private readonly replayKeys = new Set<string>();

  registerApp(request: MetaGlassesControlPlaneRegisterRequest): MetaGlassesControlPlaneBinding[] {
    const bindings = [
      ...cameraBindings(request.app_id, request.camera_descriptor ?? createMetaGlassesCameraDescriptor(request.app_id)),
      ...(request.include_audio === false ? [] : audioBindings(request.app_id)),
      ...inputBindings(request.app_id, request.input_descriptor ?? createMetaGlassesInputAdapterDescriptor(request.app_id)),
      ...(request.include_display === false ? [] : [displayBinding(request.app_id, request.display_binding_id)]),
    ];

    for (const binding of bindings) {
      this.bindings.set(binding.binding_id, binding);
    }
    this.ensureSession(request.app_id, undefined);
    return bindings;
  }

  listBindings(appId?: string): MetaGlassesControlPlaneBinding[] {
    return Array.from(this.bindings.values())
      .filter(binding => !appId || binding.app_id === appId)
      .sort((a, b) => a.binding_id.localeCompare(b.binding_id));
  }

  getSession(appId: string): MetaGlassesControlPlaneSession | undefined {
    return this.sessions.get(appId);
  }

  route(request: MetaGlassesControlPlaneRouteRequest): MetaGlassesControlPlaneRouteDecision {
    const binding = this.bindings.get(request.binding_id);
    if (!binding || binding.app_id !== request.app_id) {
      return this.finalize(request, fallbackUnknownBinding(request), undefined, 'error', [], undefined, 'binding is not registered');
    }

    const adapterResult = this.routeThroughAdapter(binding, request);
    const payloadRefs = adapterPayloadRefs(adapterResult, request.payload_refs);
    const bridge = adapterBridge(adapterResult) ?? request.bridge ?? createBridge(binding, request, payloadRefs);
    const policy = adapterPolicy(adapterResult) ?? request.policy ?? allowPolicy(binding);
    const replayKey = createReplayKey(request, binding);
    const backpressure = backpressureFor(binding, request, bridge);

    if (this.replayKeys.has(replayKey) || isAdapterReplay(adapterResult)) {
      return this.finalize(request, binding, adapterResult, 'replayed', payloadRefs, bridge, 'replay protection rejected the route');
    }

    if (backpressure.state === 'hard_limit' || backpressure.state === 'blocked') {
      return this.finalize(request, binding, adapterResult, 'backpressure', payloadRefs, bridge, 'control-plane backpressure blocked the route');
    }

    if (request.force_error) {
      return this.finalize(request, binding, adapterResult, 'error', payloadRefs, bridge, request.force_error);
    }

    const status = statusFor(adapterResult, policy, bridge);
    const decision = this.finalize(request, binding, adapterResult, status, payloadRefs, bridge);
    if (status === 'accepted' || status === 'degraded' || status === 'fallback') {
      this.replayKeys.add(replayKey);
    }
    return decision;
  }

  private routeThroughAdapter(
    binding: MetaGlassesControlPlaneBinding,
    request: MetaGlassesControlPlaneRouteRequest,
  ): MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined {
    if (!request.adapter_request) {
      return undefined;
    }
    if (binding.kind === 'camera') {
      return requestMetaGlassesCameraCapture(
        createMetaGlassesCameraDescriptor(request.app_id),
        request.adapter_request as MetaGlassesCameraCaptureRequest,
      );
    }
    if (binding.kind === 'audio') {
      return requestMetaGlassesAudioRoute(request.adapter_request as MetaGlassesAudioRouteRequest);
    }
    if (binding.kind === 'input') {
      return routeMetaGlassesInputEvent(
        createMetaGlassesInputAdapterDescriptor(request.app_id),
        request.adapter_request as MetaGlassesInputEventRequest,
      );
    }
    return undefined;
  }

  private finalize(
    request: MetaGlassesControlPlaneRouteRequest,
    binding: MetaGlassesControlPlaneBinding,
    adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
    status: MetaGlassesControlPlaneRouteStatus,
    payloadRefs: MetaGlassesIOPayloadRef[],
    bridge: MetaGlassesIOBridgeEnvelope | undefined,
    error?: string,
  ): MetaGlassesControlPlaneRouteDecision {
    const routerTerminalPolicy = ['replayed', 'backpressure', 'error'].includes(status)
      ? policyForStatus(binding, status, error)
      : undefined;
    const policy = routerTerminalPolicy ?? adapterPolicy(adapterResult) ?? request.policy ?? policyForStatus(binding, status, error);
    const peerSession = peerSessionFromBridge(bridge) ?? adapterPeerSession(adapterResult);
    const session = this.updateSession(request, status, peerSession);
    const normalizedEvent = adapterNormalizedEvent(adapterResult) ?? request.normalized_event;
    const tool = status === 'fallback' || status === 'unsupported' ? binding.fallback_tool : binding.orb_tool;
    const toolCall: MetaGlassesControlPlaneToolCall = {
      tool,
      fallback_tool: binding.fallback_tool,
      input_cid: computeCID(JSON.stringify({
        app_id: request.app_id,
        binding_id: binding.binding_id,
        correlation_id: request.correlation_id,
        payload_refs: payloadRefs.map(ref => ref.cid),
        normalizedEvent,
      })),
      arguments: {
        app_id: request.app_id,
        binding_id: binding.binding_id,
        capability: binding.capability,
        correlation_id: request.correlation_id,
        payload_refs: payloadRefs,
        normalized_event: normalizedEvent,
        bridge_envelope_id: bridge?.envelope_id,
        session_id: session.session_id,
      },
    };
    const parentReceiptCids = adapterReceiptCids(adapterResult);
    const receipt = receiptFor({
      request,
      binding,
      status,
      tool,
      payloadRefs,
      policy,
      bridge,
      parentReceiptCids,
      session,
    });
    session.receipt_cids.push(receipt.receipt_cid ?? '');
    session.route_history.push(receipt.receipt_id);

    return {
      route_id: `${binding.binding_id}:${request.correlation_id}`,
      status,
      binding,
      tool_call: toolCall,
      policy_handoff: policy,
      session,
      payload_refs: redactPayloadRefs(payloadRefs, binding),
      peer_session: peerSession,
      bridge,
      privacy: {
        redaction: binding.privacy_redaction,
        raw_payload_forwarded: false,
        redacted_fields: redactedFields(binding),
      },
      backpressure: backpressureFor(binding, request, bridge),
      fallback: fallbackFor(status, binding, error),
      receipt,
      adapter_result: adapterResult,
      error,
    };
  }

  private ensureSession(appId: string, peerSession: MetaGlassesIOPeerSession | undefined): MetaGlassesControlPlaneSession {
    const existing = this.sessions.get(appId);
    if (existing) {
      if (peerSession) existing.peer_session = peerSession;
      return existing;
    }
    const session: MetaGlassesControlPlaneSession = {
      app_id: appId,
      session_id: `mcp-session-${computeCID(appId).slice(7, 19)}`,
      device_session_id: peerSession?.device_session_id ?? `device-session-${computeCID(`device:${appId}`).slice(7, 19)}`,
      status: 'active',
      generation: 0,
      route_history: [],
      receipt_cids: [],
      peer_session: peerSession,
    };
    this.sessions.set(appId, session);
    return session;
  }

  private updateSession(
    request: MetaGlassesControlPlaneRouteRequest,
    status: MetaGlassesControlPlaneRouteStatus,
    peerSession: MetaGlassesIOPeerSession | undefined,
  ): MetaGlassesControlPlaneSession {
    const session = this.ensureSession(request.app_id, peerSession);
    session.generation += 1;
    session.last_correlation_id = request.correlation_id;
    if (peerSession) {
      session.peer_session = peerSession;
      session.device_session_id = peerSession.device_session_id ?? session.device_session_id;
    }
    session.status = sessionStatusFor(status);
    return session;
  }
}

export function createMetaGlassesControlPlaneRouter(appId = 'swissknife.meta-glasses'): MetaGlassesControlPlaneRouter {
  const router = new MetaGlassesControlPlaneRouter();
  router.registerApp({ app_id: appId });
  return router;
}

function cameraBindings(
  appId: string,
  descriptor: MetaGlassesCameraAppDescriptor,
): MetaGlassesControlPlaneBinding[] {
  const camera = descriptor[META_GLASSES_CAMERA_ADAPTER_PROPERTY];
  return camera.bindings.map(binding => {
    const requirement = camera.requirements.find(item => item.requirement_id === binding.requirement_id);
    return {
      binding_id: binding.binding_id,
      app_id: appId,
      kind: 'camera',
      capability: requirement?.capability ?? 'camera.photo_capture',
      interaction: binding.interaction,
      action: binding.action_id,
      required_scopes: requirement ? [requirement.permission_scope, 'meta_glasses.control.route'] : ['meta_glasses.control.route'],
      orb_tool: 'swissknife.mobile_orb.request_capture',
      control_plane_route: 'swissknife.mobile_orb.request_capture',
      privacy_redaction: 'privacy_filtered',
      fallback_tool: 'hallucinate_app.meta_glasses.camera_fallback',
      max_in_flight: binding.interaction === 'start_video_stream' ? 2 : 4,
    };
  });
}

function audioBindings(appId: string): MetaGlassesControlPlaneBinding[] {
  return createMetaGlassesAudioAppRequirements(appId).map(requirement => ({
    binding_id: requirement.binding_id,
    app_id: appId,
    kind: 'audio',
    capability: requirement.capability,
    interaction: requirement.interaction,
    action: requirement.action,
    required_scopes: requirement.required_scopes,
    orb_tool: 'swissknife.mobile_orb.publish_glasses_event',
    control_plane_route: 'swissknife.mobile_orb.publish_glasses_event',
    privacy_redaction: 'content_reference_only',
    fallback_tool: 'hallucinate_app.meta_glasses.audio_fallback',
    max_in_flight: requirement.capability === 'microphone.input' ? 2 : 3,
  }));
}

function inputBindings(appId: string, descriptor: MetaGlassesInputAdapterDescriptor): MetaGlassesControlPlaneBinding[] {
  return descriptor.meta_glasses_input.bindings.map(binding => ({
    binding_id: binding.binding_id,
    app_id: appId,
    kind: 'input',
    capability: binding.capability,
    interaction: binding.target,
    action: binding.target_id,
    required_scopes: binding.required_scopes,
    orb_tool: binding.capability === 'phone_gps.context'
      ? 'swissknife.mobile_orb.publish_glasses_event'
      : 'swissknife.webapp_bridge.publish_display_event',
    control_plane_route: binding.capability === 'phone_gps.context'
      ? 'swissknife.mobile_orb.publish_glasses_event'
      : 'swissknife.webapp_bridge.publish_display_event',
    privacy_redaction: binding.privacy === 'metadata_only' ? 'metadata_only' : 'privacy_filtered',
    fallback_tool: 'hallucinate_app.meta_glasses.input_fallback',
    max_in_flight: Math.max(1, Math.ceil(binding.max_hz / 10)),
  }));
}

function displayBinding(appId: string, bindingId = 'display.output.render.binding'): MetaGlassesControlPlaneBinding {
  return {
    binding_id: bindingId,
    app_id: appId,
    kind: 'display',
    capability: 'display.output',
    interaction: 'render',
    action: 'display.render_widget',
    required_scopes: ['meta_glasses.display.render', 'meta_glasses.control.route'],
    orb_tool: 'swissknife.webapp_bridge.publish_display_event',
    control_plane_route: 'swissknife.webapp_bridge.publish_display_event',
    privacy_redaction: 'content_reference_only',
    fallback_tool: 'hallucinate_app.meta_glasses.display_fallback',
    max_in_flight: 5,
  };
}

function fallbackUnknownBinding(request: MetaGlassesControlPlaneRouteRequest): MetaGlassesControlPlaneBinding {
  return {
    binding_id: request.binding_id,
    app_id: request.app_id,
    kind: 'input',
    capability: 'captouch.input',
    interaction: 'unknown',
    action: 'unknown',
    required_scopes: ['meta_glasses.control.route'],
    orb_tool: 'swissknife.webapp_bridge.publish_display_event',
    control_plane_route: 'swissknife.webapp_bridge.publish_display_event',
    privacy_redaction: 'drop_payload',
    fallback_tool: 'hallucinate_app.meta_glasses.unregistered_binding',
    max_in_flight: 1,
  };
}

function createBridge(
  binding: MetaGlassesControlPlaneBinding,
  request: MetaGlassesControlPlaneRouteRequest,
  payloadRefs: MetaGlassesIOPayloadRef[],
): MetaGlassesIOBridgeEnvelope {
  return createMetaGlassesIOBridgeEnvelope({
    raw_transport: binding.kind === 'audio' || binding.capability === 'phone_gps.context' ? 'bluetooth' : 'wifi',
    bridge_provider: binding.kind === 'audio' || binding.capability === 'phone_gps.context' ? 'phone-app' : 'display-webapp',
    capability: binding.capability,
    app_binding_id: binding.binding_id,
    correlation_id: request.correlation_id,
    content_cids: payloadRefs.map(ref => ref.cid),
    permission_state: request.policy?.outcome === 'deny' ? 'denied' : 'granted',
  });
}

function statusFor(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
  policy: MetaGlassesIOPolicyDecision,
  bridge: MetaGlassesIOBridgeEnvelope,
): MetaGlassesControlPlaneRouteStatus {
  if (policy.outcome === 'deny' || policy.outcome === 'require_confirmation') return 'denied';
  if (policy.outcome === 'fallback') return 'fallback';
  if (policy.outcome === 'degrade') return 'degraded';
  if (bridge.route.readiness === 'unsupported') return 'unsupported';
  if (bridge.route.readiness === 'degraded' || bridge.route.readiness === 'stale_session') return 'degraded';
  if (!adapterResult) return 'accepted';
  if ('outcome' in adapterResult) {
    if (adapterResult.outcome === 'accepted') return 'accepted';
    if (adapterResult.outcome === 'denied') return 'denied';
    return adapterResult.outcome;
  }
  if ('status' in adapterResult) {
    if (adapterResult.status === 'ready' || adapterResult.status === 'mock' || adapterResult.status === 'allowed') return 'accepted';
    if (adapterResult.status === 'permission_required' || adapterResult.status === 'denied') return 'denied';
    if (adapterResult.status === 'throttled') return 'throttled';
    if (adapterResult.status === 'replayed') return 'replayed';
    if (adapterResult.status === 'unsupported') return 'unsupported';
    if (adapterResult.status === 'degraded' || adapterResult.status === 'stale') return 'degraded';
    if (adapterResult.status === 'fallback' || adapterResult.status === 'disconnected') return 'fallback';
  }
  return 'error';
}

function adapterPayloadRefs(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
  fallback: MetaGlassesIOPayloadRef[] = [],
): MetaGlassesIOPayloadRef[] {
  return adapterResult?.payload_refs ?? fallback;
}

function adapterBridge(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): MetaGlassesIOBridgeEnvelope | undefined {
  if (!adapterResult) return undefined;
  if ('bridge' in adapterResult) return adapterResult.bridge;
  if ('envelope' in adapterResult) return adapterResult.envelope;
  if ('normalized_event' in adapterResult && 'envelope' in adapterResult.normalized_event) {
    return adapterResult.normalized_event.envelope as MetaGlassesIOBridgeEnvelope;
  }
  return undefined;
}

function adapterPolicy(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): MetaGlassesIOPolicyDecision | undefined {
  if (!adapterResult) return undefined;
  if ('policy' in adapterResult) return adapterResult.policy;
  if ('policy_decision' in adapterResult) return adapterResult.policy_decision;
  return undefined;
}

function adapterPeerSession(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): MetaGlassesIOPeerSession | undefined {
  if (!adapterResult) return undefined;
  if ('control_event' in adapterResult) return adapterResult.control_event.peer_session;
  if ('route_decision' in adapterResult) return adapterResult.route_decision.peer_session;
  return undefined;
}

function adapterNormalizedEvent(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): unknown {
  if (!adapterResult) return undefined;
  if ('control_event' in adapterResult) return adapterResult.control_event;
  if ('normalized_event' in adapterResult) return adapterResult.normalized_event;
  return undefined;
}

function adapterReceiptCids(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): string[] {
  const receipts = adapterReceipts(adapterResult);
  return receipts
    .map(receipt => ('receipt_cid' in receipt ? receipt.receipt_cid : undefined))
    .filter((cid): cid is string => Boolean(cid));
}

function adapterReceipts(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): Array<MetaGlassesCameraReceipt | MetaGlassesAudioReceipt | MetaGlassesInputReceipt> {
  return adapterResult?.receipts ?? [];
}

function isAdapterReplay(
  adapterResult: MetaGlassesCameraCaptureResult | MetaGlassesAudioRouteResult | MetaGlassesInputRouteResult | undefined,
): boolean {
  return Boolean(adapterResult && 'status' in adapterResult && adapterResult.status === 'replayed');
}

function allowPolicy(binding: MetaGlassesControlPlaneBinding): MetaGlassesIOPolicyDecision {
  return policyForStatus(binding, 'accepted');
}

function policyForStatus(
  binding: MetaGlassesControlPlaneBinding,
  status: MetaGlassesControlPlaneRouteStatus,
  reason?: string,
): MetaGlassesIOPolicyDecision {
  const outcome = status === 'denied' || status === 'replayed' || status === 'error' ? 'deny'
    : status === 'fallback' || status === 'unsupported' || status === 'backpressure' ? 'fallback'
      : status === 'degraded' || status === 'throttled' ? 'degrade'
        : 'allow';
  const decisionCid = computeCID(`control-plane-policy:${binding.binding_id}:${outcome}:${reason ?? status}`);
  return {
    decision_id: `control-plane-${outcome}-${computeCID(binding.binding_id).slice(7, 19)}`,
    outcome,
    reasons: [reason ?? `Control plane routed ${binding.binding_id} with ${status} status.`],
    required_scopes: binding.required_scopes,
    granted_scopes: outcome === 'deny' ? [] : binding.required_scopes,
    decision_cid: decisionCid,
    receipt: {
      receipt_kind: 'mcp++/policy-decision',
      decision_cid: decisionCid,
      correlation_id_field: 'correlation_id',
    },
  };
}

function receiptFor(input: {
  request: MetaGlassesControlPlaneRouteRequest;
  binding: MetaGlassesControlPlaneBinding;
  status: MetaGlassesControlPlaneRouteStatus;
  tool: string;
  payloadRefs: MetaGlassesIOPayloadRef[];
  policy: MetaGlassesIOPolicyDecision;
  bridge?: MetaGlassesIOBridgeEnvelope;
  parentReceiptCids: string[];
  session: MetaGlassesControlPlaneSession;
}): MetaGlassesControlPlaneReceipt {
  const replayKey = createReplayKey(input.request, input.binding);
  const receiptCid = computeCID(JSON.stringify({
    router_id: META_GLASSES_CONTROL_PLANE_ROUTER_ID,
    status: input.status,
    binding_id: input.binding.binding_id,
    app_id: input.request.app_id,
    correlation_id: input.request.correlation_id,
    payload_refs: input.payloadRefs.map(ref => ref.cid),
    decision_cid: input.policy.decision_cid,
    parent_receipt_cids: input.parentReceiptCids,
    tool: input.tool,
    replayKey,
    generation: input.session.generation,
  }));
  return {
    receipt_id: `mcp++-meta-glasses-control-plane-${input.status}-${input.request.correlation_id}`,
    router_id: META_GLASSES_CONTROL_PLANE_ROUTER_ID,
    status: input.status,
    binding_id: input.binding.binding_id,
    app_id: input.request.app_id,
    capability: input.binding.capability,
    tool: input.tool,
    policy_decision: input.policy,
    replay_key: replayKey,
    session_generation: input.session.generation,
    receipt_kind: input.status === 'denied' || input.status === 'replayed'
      ? 'mcp++/policy-decision'
      : 'mcp++/control-route',
    receipt_cid: receiptCid,
    envelope_cid: input.bridge?.envelope_id,
    decision_cid: input.policy.decision_cid,
    correlation_id_field: 'correlation_id',
    parent_receipt_cids: input.parentReceiptCids,
    output_refs: input.payloadRefs,
  };
}

function createReplayKey(
  request: MetaGlassesControlPlaneRouteRequest,
  binding: MetaGlassesControlPlaneBinding,
): string {
  return [
    request.app_id,
    binding.binding_id,
    request.event_id ?? request.correlation_id,
    request.sequence ?? 'no-sequence',
  ].join(':');
}

function backpressureFor(
  binding: MetaGlassesControlPlaneBinding,
  request: MetaGlassesControlPlaneRouteRequest,
  bridge: MetaGlassesIOBridgeEnvelope | undefined,
): { state: MetaGlassesIOBackpressureState; in_flight: number; max_in_flight: number } {
  const inFlight = request.in_flight ?? 0;
  const max = binding.max_in_flight ?? 4;
  const bridgeState = bridge?.flow_control.backpressure ?? 'none';
  if (bridgeState === 'hard_limit' || bridgeState === 'blocked') {
    return { state: bridgeState, in_flight: inFlight, max_in_flight: max };
  }
  if (inFlight >= max) {
    return { state: 'hard_limit', in_flight: inFlight, max_in_flight: max };
  }
  if (inFlight >= Math.max(1, max - 1)) {
    return { state: 'soft_limit', in_flight: inFlight, max_in_flight: max };
  }
  return { state: bridgeState, in_flight: inFlight, max_in_flight: max };
}

function peerSessionFromBridge(bridge: MetaGlassesIOBridgeEnvelope | undefined): MetaGlassesIOPeerSession | undefined {
  if (!bridge?.app_layers.libp2p_peer_id || !bridge.app_layers.libp2p_session_id) {
    return undefined;
  }
  return {
    libp2p_peer_id: bridge.app_layers.libp2p_peer_id,
    libp2p_session_id: bridge.app_layers.libp2p_session_id,
    mcp_session_id: bridge.identity.device_session_id,
    device_session_id: bridge.identity.device_session_id,
    route_generation: 1,
  };
}

function redactPayloadRefs(
  refs: MetaGlassesIOPayloadRef[],
  binding: MetaGlassesControlPlaneBinding,
): MetaGlassesIOPayloadRef[] {
  return refs.map(ref => ({
    ...ref,
    redaction: binding.privacy_redaction === 'drop_payload'
      ? 'metadata_only'
      : ref.redaction ?? (binding.privacy_redaction === 'content_reference_only' ? 'metadata_only' : 'privacy_filtered'),
  }));
}

function redactedFields(binding: MetaGlassesControlPlaneBinding): string[] {
  if (binding.capability === 'phone_gps.context') return ['latitude', 'longitude', 'raw_gps'];
  if (binding.kind === 'audio') return ['raw_audio'];
  if (binding.kind === 'camera') return ['raw_pixels', 'face_embeddings'];
  if (binding.kind === 'display') return ['inline_asset_bytes'];
  return ['raw_sensor_sample'];
}

function fallbackFor(
  status: MetaGlassesControlPlaneRouteStatus,
  binding: MetaGlassesControlPlaneBinding,
  error?: string,
): MetaGlassesControlPlaneRouteDecision['fallback'] {
  if (!['fallback', 'unsupported', 'backpressure', 'error'].includes(status)) {
    return undefined;
  }
  return {
    tool: binding.fallback_tool,
    reason: error ?? `Control plane selected fallback for ${status}.`,
  };
}

function sessionStatusFor(status: MetaGlassesControlPlaneRouteStatus): MetaGlassesControlPlaneSessionStatus {
  if (status === 'accepted') return 'active';
  if (status === 'degraded' || status === 'throttled') return 'degraded';
  if (status === 'fallback' || status === 'unsupported' || status === 'backpressure') return 'fallback';
  return 'blocked';
}

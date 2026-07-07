import { computeCID, computeInterfaceCID, type InterfaceDescriptor } from '../mcp-idl.js';
import {
  createDefaultMetaGlassesIOProfile,
  findMetaGlassesIOCapability,
  META_GLASSES_IO_PROFILE_PROPERTY,
  type MetaGlassesIOCapabilityContract,
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
  type MetaGlassesIOControlPlaneRoute,
  type MetaGlassesIOBridgeEnvelope,
} from './meta-glasses-io-transport.js';

export const META_GLASSES_INPUT_ADAPTER_ID =
  'org.handsfree.swissknife.meta-glasses-input-adapter@0.1.0';

export type MetaGlassesInputCapability =
  | 'neural_band.input'
  | 'captouch.input'
  | 'motion.orientation'
  | 'phone_gps.context';

export type MetaGlassesInputBindingTarget = 'command' | 'view' | 'agent_action';
export type MetaGlassesInputSource = 'neural_band' | 'captouch' | 'motion' | 'phone_gps';
export type MetaGlassesInputPrivacy = 'metadata_only' | 'privacy_filtered';
export type MetaGlassesInputRouteStatus =
  | 'allowed'
  | 'denied'
  | 'unsupported'
  | 'stale'
  | 'throttled'
  | 'disconnected'
  | 'replayed'
  | 'error';
export type MetaGlassesInputReceiptStage =
  | 'authorization'
  | 'control_route'
  | 'normalized_event'
  | 'denial'
  | 'unsupported'
  | 'stale'
  | 'throttled'
  | 'disconnected'
  | 'replay'
  | 'error';

export interface MetaGlassesInputAppBinding {
  app_id: string;
  capability: MetaGlassesInputCapability;
  source: MetaGlassesInputSource;
  binding_id: string;
  input_event: string;
  intent_descriptor: string;
  target: MetaGlassesInputBindingTarget;
  target_id: string;
  required_scopes: MetaGlassesIOPermissionScope[];
  max_hz: number;
  stale_after_ms: number;
  privacy: MetaGlassesInputPrivacy;
}

export interface MetaGlassesInputSample {
  gesture?: string;
  touch?: 'tap' | 'double_tap' | 'swipe_forward' | 'swipe_back' | 'long_press';
  orientation?: 'portrait' | 'landscape' | 'face_up' | 'face_down' | 'unknown';
  motion_state?: 'stationary' | 'walking' | 'turning' | 'unknown';
  gps_context?: 'nearby' | 'in_transit' | 'arrived' | 'unknown';
  confidence?: number;
}

export interface MetaGlassesInputEventRequest {
  app_id: string;
  capability: MetaGlassesInputCapability;
  binding_id: string;
  input_id: string;
  correlation_id?: string;
  sequence: number;
  timestamp_ms: number;
  received_at_ms: number;
  granted_scopes?: MetaGlassesIOPermissionScope[];
  explicit_user_permission?: boolean;
  policy_outcome?: MetaGlassesIOPolicyDecision['outcome'];
  readiness?: MetaGlassesIOReadiness;
  bridge?: MetaGlassesIOBridgeEnvelope;
  sample?: MetaGlassesInputSample;
  seen_input_ids?: string[];
  last_sequence?: number;
  last_event_timestamp_ms?: number;
}

export interface MetaGlassesInputNormalizedEvent {
  event: string;
  intent: string;
  input_id: string;
  correlation_id: string;
  sequence: number;
  capability: MetaGlassesInputCapability;
  source: MetaGlassesInputSource;
  target: MetaGlassesInputBindingTarget;
  target_id: string;
  privacy: MetaGlassesInputPrivacy;
  payload_ref: MetaGlassesIOPayloadRef;
  payload_summary: Record<string, string | number | boolean>;
}

export interface MetaGlassesInputControlPlaneRouteDecision {
  route_id: string;
  route: MetaGlassesIOControlPlaneRoute;
  selected_surface: MetaGlassesIOSurface;
  readiness: MetaGlassesIOReadiness;
  authorized: boolean;
  reason: string;
  peer_session?: MetaGlassesIOPeerSession;
}

export interface MetaGlassesInputReceipt extends MetaGlassesIOMCPReceiptMetadata {
  input_stage: MetaGlassesInputReceiptStage;
  status: MetaGlassesInputRouteStatus;
  input_id: string;
  binding_id: string;
}

export interface MetaGlassesInputRouteResult {
  status: MetaGlassesInputRouteStatus;
  authorized: boolean;
  binding: MetaGlassesInputAppBinding;
  missing_scopes: MetaGlassesIOPermissionScope[];
  readiness: MetaGlassesIOReadiness;
  policy_decision: MetaGlassesIOPolicyDecision;
  route_decision: MetaGlassesInputControlPlaneRouteDecision;
  normalized_event: MetaGlassesInputNormalizedEvent;
  payload_refs: MetaGlassesIOPayloadRef[];
  receipts: MetaGlassesInputReceipt[];
  envelope: MetaGlassesIOBridgeEnvelope;
  error?: string;
}

export interface MetaGlassesInputAdapterDescriptor extends InterfaceDescriptor {
  meta_glasses_input: {
    adapter_id: typeof META_GLASSES_INPUT_ADAPTER_ID;
    descriptor_cid: string;
    bindings: MetaGlassesInputAppBinding[];
    capabilities: MetaGlassesIOCapabilityContract[];
    privacy: {
      default_redaction: 'metadata_only';
      precise_gps_redacted_by_default: true;
      raw_sensor_samples_allowed: false;
    };
  };
}

const INPUT_CAPABILITIES: readonly MetaGlassesInputCapability[] = [
  'neural_band.input',
  'captouch.input',
  'motion.orientation',
  'phone_gps.context',
] as const;

const INPUT_EVENTS: Record<MetaGlassesInputCapability, string> = {
  'neural_band.input': 'io.neural_band.intent',
  'captouch.input': 'io.captouch.intent',
  'motion.orientation': 'io.motion.orientation',
  'phone_gps.context': 'io.phone_gps.context',
};

export function createMetaGlassesInputAdapterDescriptor(
  appId = 'swissknife.meta-glasses',
): MetaGlassesInputAdapterDescriptor {
  const profile = createDefaultMetaGlassesIOProfile();
  const capabilities = INPUT_CAPABILITIES.map(capability => requiredInputCapability(profile, capability));
  const descriptor = {
    name: 'meta-glasses-input-adapter',
    namespace: 'org.handsfree.swissknife.meta_glasses',
    version: '0.1.0',
    methods: INPUT_CAPABILITIES.map(capability => ({
      name: `meta_glasses_input.${capability.replace('.', '_')}`,
      input_schema: { type: 'object', additionalProperties: true },
      output_schema: { type: 'object', additionalProperties: true },
    })),
    errors: [
      { name: 'InputPermissionRequired' },
      { name: 'InputUnsupported' },
      { name: 'InputStale' },
      { name: 'InputThrottled' },
      { name: 'InputDisconnected' },
      { name: 'InputReplayed' },
    ],
    requires: ['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session'],
    compatibility: { compatible_with: [] },
    semanticTags: ['meta-glasses', 'input', 'neural-band', 'captouch', 'motion', 'gps', 'mcp++'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    [META_GLASSES_IO_PROFILE_PROPERTY]: profile,
  } as InterfaceDescriptor;
  const descriptorCid = computeInterfaceCID(descriptor);

  return {
    ...descriptor,
    meta_glasses_input: {
      adapter_id: META_GLASSES_INPUT_ADAPTER_ID,
      descriptor_cid: descriptorCid,
      bindings: createMetaGlassesInputAppBindings(appId),
      capabilities,
      privacy: {
        default_redaction: 'metadata_only',
        precise_gps_redacted_by_default: true,
        raw_sensor_samples_allowed: false,
      },
    },
  };
}

export function createMetaGlassesInputAppBindings(
  appId = 'swissknife.meta-glasses',
): MetaGlassesInputAppBinding[] {
  return [
    inputBinding(appId, 'neural_band.input', 'command', 'commands.confirm_selection', 30, 250),
    inputBinding(appId, 'captouch.input', 'view', 'views.navigate_timeline', 20, 250),
    inputBinding(appId, 'motion.orientation', 'view', 'views.reflow_hud', 10, 500),
    inputBinding(appId, 'phone_gps.context', 'agent_action', 'agent.update_location_context', 1, 5_000),
  ];
}

export function createMetaGlassesInputBridgeEnvelope(
  capability: MetaGlassesInputCapability,
  input: Partial<Parameters<typeof createMetaGlassesIOBridgeEnvelope>[0]> = {},
): MetaGlassesIOBridgeEnvelope {
  const rawTransport = capability === 'phone_gps.context' ? 'bluetooth' : 'wifi';
  return createMetaGlassesIOBridgeEnvelope({
    raw_transport: rawTransport,
    bridge_provider: capability === 'phone_gps.context' ? 'phone-app' : 'display-webapp',
    bridge_route: capability === 'phone_gps.context' ? 'phone-app.local-network-handoff' : 'display-webapp.browser-bridge',
    capability,
    app_binding_id: `${capability}.binding`,
    correlation_id: `corr-${capability.replace('.', '-')}`,
    ...input,
  });
}

export function routeMetaGlassesInputEvent(
  descriptor: MetaGlassesInputAdapterDescriptor,
  request: MetaGlassesInputEventRequest,
): MetaGlassesInputRouteResult {
  const fallbackBinding = descriptor.meta_glasses_input.bindings[0];
  const binding = descriptor.meta_glasses_input.bindings.find(item =>
    item.binding_id === request.binding_id
    && item.capability === request.capability
    && item.app_id === request.app_id,
  );

  if (!binding) {
    return finalizeInputResult(
      'error',
      request,
      fallbackBinding,
      [],
      policy('deny', ['meta_glasses.control.route'], [], 'Input binding is not declared.'),
      request.readiness ?? 'unsupported',
      'Input binding is not declared.',
    );
  }

  const grantedScopes = request.granted_scopes ?? [];
  const missingScopes = binding.required_scopes.filter(scope => !grantedScopes.includes(scope));
  const readiness = request.bridge?.route.readiness ?? request.readiness ?? 'ready';
  const explicitPermission = request.explicit_user_permission !== false;

  if (!explicitPermission || missingScopes.length > 0 || request.policy_outcome === 'deny') {
    return finalizeInputResult(
      'denied',
      request,
      binding,
      missingScopes,
      policy('deny', binding.required_scopes, grantedScopes, 'Hallucinate App policy denied the input descriptor.'),
      readiness,
    );
  }

  if (readiness === 'unsupported') {
    return finalizeInputResult(
      'unsupported',
      request,
      binding,
      [],
      policy('deny', binding.required_scopes, grantedScopes, 'Input capability is unsupported on this route.'),
      readiness,
    );
  }

  if (readiness === 'disconnected' || readiness === 'route_lost' || readiness === 'unavailable') {
    return finalizeInputResult(
      'disconnected',
      request,
      binding,
      [],
      policy('fallback', binding.required_scopes, grantedScopes, 'Input route is disconnected.'),
      readiness,
    );
  }

  if (request.seen_input_ids?.includes(request.input_id) || (request.last_sequence ?? -1) >= request.sequence) {
    return finalizeInputResult(
      'replayed',
      request,
      binding,
      [],
      policy('deny', binding.required_scopes, grantedScopes, 'Replay protection rejected a previously observed input event.'),
      readiness,
    );
  }

  if (request.received_at_ms - request.timestamp_ms > binding.stale_after_ms) {
    return finalizeInputResult(
      'stale',
      request,
      binding,
      [],
      policy('degrade', binding.required_scopes, grantedScopes, 'Input event exceeded the stale event window.'),
      'stale_session',
    );
  }

  const minIntervalMs = Math.floor(1_000 / binding.max_hz);
  if (
    typeof request.last_event_timestamp_ms === 'number'
    && request.timestamp_ms - request.last_event_timestamp_ms < minIntervalMs
  ) {
    return finalizeInputResult(
      'throttled',
      request,
      binding,
      [],
      policy('degrade', binding.required_scopes, grantedScopes, 'High-frequency input event was throttled.'),
      readiness,
    );
  }

  return finalizeInputResult(
    'allowed',
    request,
    binding,
    [],
    policy('allow', binding.required_scopes, grantedScopes, 'Hallucinate App policy authorized the input descriptor.'),
    readiness,
  );
}

function finalizeInputResult(
  status: MetaGlassesInputRouteStatus,
  request: MetaGlassesInputEventRequest,
  binding: MetaGlassesInputAppBinding,
  missingScopes: MetaGlassesIOPermissionScope[],
  policyDecision: MetaGlassesIOPolicyDecision,
  readiness: MetaGlassesIOReadiness,
  error?: string,
): MetaGlassesInputRouteResult {
  const payloadRef = payloadRefFor(request, binding);
  const envelope = request.bridge ?? createMetaGlassesInputBridgeEnvelope(binding.capability, {
    correlation_id: request.correlation_id,
    permission_state: status === 'denied' ? 'denied' : 'granted',
    content_cids: [payloadRef.cid],
  });
  envelope.route.readiness = readiness;
  const authorized = status === 'allowed';
  const routeDecision: MetaGlassesInputControlPlaneRouteDecision = {
    route_id: envelope.route.route_decision_id,
    route: envelope.route.control_plane_route,
    selected_surface: surfaceFor(status, binding.capability),
    readiness,
    authorized,
    reason: routeReason(status, readiness),
    peer_session: peerSessionFromBridge(envelope),
  };
  const normalizedEvent = normalizedEventFor(request, binding, payloadRef);
  const receipts = receiptsFor(status, request, binding, payloadRef, policyDecision, envelope);

  return {
    status,
    authorized,
    binding,
    missing_scopes: missingScopes,
    readiness,
    policy_decision: policyDecision,
    route_decision: routeDecision,
    normalized_event: normalizedEvent,
    payload_refs: [payloadRef],
    receipts,
    envelope,
    error,
  };
}

function inputBinding(
  appId: string,
  capability: MetaGlassesInputCapability,
  target: MetaGlassesInputBindingTarget,
  targetId: string,
  maxHz: number,
  staleAfterMs: number,
): MetaGlassesInputAppBinding {
  const contract = requiredInputCapability(createDefaultMetaGlassesIOProfile(), capability);
  return {
    app_id: appId,
    capability,
    source: sourceFor(capability),
    binding_id: contract.application_bindings[0].binding_id,
    input_event: INPUT_EVENTS[capability],
    intent_descriptor: `intent.${capability.replace('.', '.')}`,
    target,
    target_id: targetId,
    required_scopes: [...contract.permission_scopes],
    max_hz: maxHz,
    stale_after_ms: staleAfterMs,
    privacy: capability === 'phone_gps.context' ? 'metadata_only' : 'privacy_filtered',
  };
}

function normalizedEventFor(
  request: MetaGlassesInputEventRequest,
  binding: MetaGlassesInputAppBinding,
  payloadRef: MetaGlassesIOPayloadRef,
): MetaGlassesInputNormalizedEvent {
  return {
    event: binding.input_event,
    intent: binding.intent_descriptor,
    input_id: request.input_id,
    correlation_id: request.correlation_id ?? `corr-${request.input_id}`,
    sequence: request.sequence,
    capability: binding.capability,
    source: binding.source,
    target: binding.target,
    target_id: binding.target_id,
    privacy: binding.privacy,
    payload_ref: payloadRef,
    payload_summary: privacySafeSummary(request, binding),
  };
}

function privacySafeSummary(
  request: MetaGlassesInputEventRequest,
  binding: MetaGlassesInputAppBinding,
): Record<string, string | number | boolean> {
  if (binding.capability === 'phone_gps.context') {
    return {
      gps_context: request.sample?.gps_context ?? 'unknown',
      location_precision: 'coarse',
      precise_coordinates_redacted: true,
    };
  }
  if (binding.capability === 'motion.orientation') {
    return {
      orientation: request.sample?.orientation ?? 'unknown',
      motion_state: request.sample?.motion_state ?? 'unknown',
      confidence: request.sample?.confidence ?? 0,
    };
  }
  if (binding.capability === 'captouch.input') {
    return {
      touch: request.sample?.touch ?? 'tap',
      confidence: request.sample?.confidence ?? 0,
    };
  }
  return {
    gesture: request.sample?.gesture ?? 'unknown',
    confidence: request.sample?.confidence ?? 0,
  };
}

function payloadRefFor(
  request: MetaGlassesInputEventRequest,
  binding: MetaGlassesInputAppBinding,
): MetaGlassesIOPayloadRef {
  return {
    cid: computeCID(JSON.stringify({
      input_id: request.input_id,
      sequence: request.sequence,
      capability: binding.capability,
      timestamp_ms: request.timestamp_ms,
      summary: privacySafeSummary(request, binding),
    })),
    purpose: 'sensor_sample',
    media_type: 'application/vnd.meta-glasses.input-event+json',
    retention_policy: 'ephemeral',
    redaction: binding.privacy,
  };
}

function receiptsFor(
  status: MetaGlassesInputRouteStatus,
  request: MetaGlassesInputEventRequest,
  binding: MetaGlassesInputAppBinding,
  payloadRef: MetaGlassesIOPayloadRef,
  policyDecision: MetaGlassesIOPolicyDecision,
  envelope: MetaGlassesIOBridgeEnvelope,
): MetaGlassesInputReceipt[] {
  const base = `${request.app_id}:${request.input_id}:${request.sequence}:${status}`;
  const terminalStage = receiptStageFor(status);
  return [
    receipt('authorization', status, base, request, binding, payloadRef, policyDecision, envelope, []),
    receipt('control_route', status, base, request, binding, payloadRef, policyDecision, envelope, [
      computeCID(`input-receipt:${base}:authorization`),
    ]),
    receipt(terminalStage, status, base, request, binding, payloadRef, policyDecision, envelope, [
      computeCID(`input-receipt:${base}:authorization`),
      computeCID(`input-receipt:${base}:control_route`),
    ]),
  ];
}

function receipt(
  stage: MetaGlassesInputReceiptStage,
  status: MetaGlassesInputRouteStatus,
  base: string,
  request: MetaGlassesInputEventRequest,
  binding: MetaGlassesInputAppBinding,
  payloadRef: MetaGlassesIOPayloadRef,
  policyDecision: MetaGlassesIOPolicyDecision,
  envelope: MetaGlassesIOBridgeEnvelope,
  parents: string[],
): MetaGlassesInputReceipt {
  return {
    input_stage: stage,
    status,
    input_id: request.input_id,
    binding_id: binding.binding_id,
    receipt_kind: stage === 'control_route' ? 'mcp++/control-route' : 'mcp++/execution',
    receipt_cid: computeCID(`input-receipt:${base}:${stage}`),
    envelope_cid: envelope.envelope_id,
    decision_cid: policyDecision.decision_cid,
    correlation_id_field: 'correlation_id',
    parent_receipt_cids: parents,
    output_refs: [payloadRef],
  };
}

function receiptStageFor(status: MetaGlassesInputRouteStatus): MetaGlassesInputReceiptStage {
  if (status === 'allowed') return 'normalized_event';
  if (status === 'denied') return 'denial';
  if (status === 'replayed') return 'replay';
  return status;
}

function policy(
  outcome: MetaGlassesIOPolicyDecision['outcome'],
  requiredScopes: MetaGlassesIOPermissionScope[],
  grantedScopes: MetaGlassesIOPermissionScope[],
  reason: string,
): MetaGlassesIOPolicyDecision {
  const decisionCid = computeCID(`input-policy:${outcome}:${requiredScopes.join(',')}:${grantedScopes.join(',')}:${reason}`);
  return {
    decision_id: `input-${outcome}-${computeCID(requiredScopes.join(':')).slice(7, 19)}`,
    outcome,
    reasons: [reason, 'Input payloads are normalized and privacy-filtered before routing.'],
    required_scopes: requiredScopes,
    granted_scopes: outcome === 'deny' ? [] : grantedScopes,
    decision_cid: decisionCid,
    receipt: {
      receipt_kind: 'mcp++/policy-decision',
      decision_cid: decisionCid,
      correlation_id_field: 'correlation_id',
    },
  };
}

function sourceFor(capability: MetaGlassesInputCapability): MetaGlassesInputSource {
  if (capability === 'neural_band.input') return 'neural_band';
  if (capability === 'captouch.input') return 'captouch';
  if (capability === 'motion.orientation') return 'motion';
  return 'phone_gps';
}

function surfaceFor(
  status: MetaGlassesInputRouteStatus,
  capability: MetaGlassesInputCapability,
): MetaGlassesIOSurface {
  if (status === 'disconnected' || status === 'unsupported') return 'mobile-fallback';
  if (capability === 'phone_gps.context') return 'phone-os';
  return 'display-webapp';
}

function routeReason(status: MetaGlassesInputRouteStatus, readiness: MetaGlassesIOReadiness): string {
  if (status === 'allowed') return 'descriptor authorized and routed to the control plane';
  return `descriptor ${status} with readiness ${readiness}`;
}

function peerSessionFromBridge(bridge: MetaGlassesIOBridgeEnvelope): MetaGlassesIOPeerSession | undefined {
  if (!bridge.app_layers.libp2p_peer_id || !bridge.app_layers.libp2p_session_id) {
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

function requiredInputCapability(
  profile: ReturnType<typeof createDefaultMetaGlassesIOProfile>,
  capability: MetaGlassesInputCapability,
): MetaGlassesIOCapabilityContract {
  const contract = findMetaGlassesIOCapability(profile, capability as MetaGlassesIOCapabilityKind);
  if (!contract) {
    throw new Error(`Missing input capability in Meta glasses I/O profile: ${capability}`);
  }
  return contract;
}

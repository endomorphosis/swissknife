import type { InterfaceDescriptor } from './mcp-idl.js';
import { computeCID } from './mcp-idl.js';
import {
  META_GLASSES_IO_PROFILE,
  META_GLASSES_IO_PROFILE_VERSION,
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOPermissionScope,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
} from './meta-glasses-io-profile.js';

export const META_GLASSES_IO_TRANSPORT_PROFILE =
  'handsfree.meta-glasses/io-bridge-transport';
export const META_GLASSES_IO_TRANSPORT_PROFILE_VERSION = '0.1.0';
export const META_GLASSES_IO_TRANSPORT_PROPERTY = 'meta_glasses_io_transport';

export const META_GLASSES_IO_TRANSPORT_ERROR_CODES = {
  ENVELOPE_MISSING: 'MGW_IO_TRANSPORT_ENVELOPE_MISSING',
  PROFILE: 'MGW_IO_TRANSPORT_PROFILE',
  IDENTITY: 'MGW_IO_TRANSPORT_IDENTITY',
  BRIDGE_ROUTE: 'MGW_IO_TRANSPORT_BRIDGE_ROUTE',
  ROUTE_DECISION: 'MGW_IO_TRANSPORT_ROUTE_DECISION',
  PERMISSION_STATE: 'MGW_IO_TRANSPORT_PERMISSION_STATE',
  FLOW_CONTROL: 'MGW_IO_TRANSPORT_FLOW_CONTROL',
  PAYLOAD_LIMITS: 'MGW_IO_TRANSPORT_PAYLOAD_LIMITS',
  CONTENT_CIDS: 'MGW_IO_TRANSPORT_CONTENT_CIDS',
  APP_LAYER_BOUNDARY: 'MGW_IO_TRANSPORT_APP_LAYER_BOUNDARY',
  RECEIPTS: 'MGW_IO_TRANSPORT_RECEIPTS',
  POLICY_DECISION: 'MGW_IO_TRANSPORT_POLICY_DECISION',
  PRIVACY_REDACTION: 'MGW_IO_TRANSPORT_PRIVACY_REDACTION',
} as const;

export type MetaGlassesIOTransportValidationCode =
  (typeof META_GLASSES_IO_TRANSPORT_ERROR_CODES)[keyof typeof META_GLASSES_IO_TRANSPORT_ERROR_CODES];

export type MetaGlassesIORawTransport = 'bluetooth' | 'wifi';
export type MetaGlassesIOBridgeProvider = 'phone-app' | 'display-webapp' | 'simulator';
export type MetaGlassesIOBridgeRoute =
  | 'phone-app.bluetooth-audio'
  | 'phone-app.wifi-direct-handoff'
  | 'phone-app.local-network-handoff'
  | 'display-webapp.browser-bridge'
  | 'simulator.hardware-free';
export type MetaGlassesIOControlPlaneRoute =
  | 'swissknife.mobile_orb.publish_glasses_event'
  | 'swissknife.mobile_orb.request_capture'
  | 'swissknife.webapp_bridge.publish_display_event';
export type MetaGlassesIOTransportPermissionState =
  | 'granted'
  | 'prompt_required'
  | 'denied'
  | 'revoked'
  | 'not_requested';
export type MetaGlassesIOBackpressureState = 'none' | 'soft_limit' | 'hard_limit' | 'blocked';
export type MetaGlassesIOAppLayerState = 'provided_by_bridge' | 'not_provided' | 'unknown';
export type MetaGlassesIOPrivacyRedactionStrategy =
  | 'none'
  | 'metadata_only'
  | 'content_reference_only'
  | 'privacy_filtered'
  | 'drop_payload';

export interface MetaGlassesIOTransportValidationIssue {
  code: MetaGlassesIOTransportValidationCode;
  path: string;
  message: string;
}

export interface MetaGlassesIOTransportValidationResult {
  conformant: boolean;
  errors: MetaGlassesIOTransportValidationIssue[];
  warnings: MetaGlassesIOTransportValidationIssue[];
}

export interface MetaGlassesIOBridgeEnvelopeIdentity {
  device_id: string;
  device_session_id: string;
  app_binding_id: string;
  app_id: string;
  correlation_id: string;
}

export interface MetaGlassesIOBridgeEnvelopeRoute {
  raw_transport: MetaGlassesIORawTransport;
  bridge_provider: MetaGlassesIOBridgeProvider;
  bridge_route: MetaGlassesIOBridgeRoute;
  raw_transport_is_ipfs_libp2p_or_mcp: false;
  route_decision_id: string;
  control_plane_route: MetaGlassesIOControlPlaneRoute;
  readiness: MetaGlassesIOReadiness;
  capability: MetaGlassesIOCapabilityKind;
}

export interface MetaGlassesIOBridgePermissionState {
  state: MetaGlassesIOTransportPermissionState;
  required_scopes: MetaGlassesIOPermissionScope[];
  granted_scopes: MetaGlassesIOPermissionScope[];
  denied_scopes: MetaGlassesIOPermissionScope[];
}

export interface MetaGlassesIOBridgeFlowControl {
  latency_ms: number;
  jitter_ms?: number;
  backpressure: MetaGlassesIOBackpressureState;
  queued_bytes: number;
  dropped_messages: number;
}

export interface MetaGlassesIOBridgePayloadLimits {
  max_payload_bytes: number;
  max_content_cid_count: number;
  chunking_required_above_bytes: number;
  inline_payload_allowed: boolean;
}

export interface MetaGlassesIOBridgeContentRef {
  cid: string;
  purpose: 'input' | 'output' | 'receipt' | 'policy' | 'redaction-log';
  size_bytes: number;
  media_type?: string;
}

export interface MetaGlassesIOBridgeAppLayers {
  ipfs: MetaGlassesIOAppLayerState;
  libp2p: MetaGlassesIOAppLayerState;
  mcp_plus_plus: MetaGlassesIOAppLayerState;
  libp2p_peer_id?: string;
  libp2p_remote_peer_id?: string;
  libp2p_session_id?: string;
}

export interface MetaGlassesIOBridgeReceiptIds {
  mcp_tool_receipt_id?: string;
  mcp_event_receipt_id?: string;
  envelope_cid?: string;
  policy_receipt_id?: string;
}

export interface MetaGlassesIOBridgePrivacyRedaction {
  strategy: MetaGlassesIOPrivacyRedactionStrategy;
  redacted_fields: string[];
  metadata_cid?: string;
  reason: string;
}

export interface MetaGlassesIOBridgeEnvelope {
  profile: typeof META_GLASSES_IO_TRANSPORT_PROFILE;
  profile_version: typeof META_GLASSES_IO_TRANSPORT_PROFILE_VERSION;
  io_profile: typeof META_GLASSES_IO_PROFILE;
  io_profile_version: typeof META_GLASSES_IO_PROFILE_VERSION;
  envelope_id: string;
  identity: MetaGlassesIOBridgeEnvelopeIdentity;
  route: MetaGlassesIOBridgeEnvelopeRoute;
  permission: MetaGlassesIOBridgePermissionState;
  flow_control: MetaGlassesIOBridgeFlowControl;
  payload_limits: MetaGlassesIOBridgePayloadLimits;
  content: MetaGlassesIOBridgeContentRef[];
  app_layers: MetaGlassesIOBridgeAppLayers;
  receipts: MetaGlassesIOBridgeReceiptIds;
  policy: MetaGlassesIOPolicyDecision;
  privacy: MetaGlassesIOBridgePrivacyRedaction;
}

export interface MetaGlassesIOTransportDescriptor extends InterfaceDescriptor {
  [META_GLASSES_IO_TRANSPORT_PROPERTY]: {
    profile: typeof META_GLASSES_IO_TRANSPORT_PROFILE;
    profile_version: typeof META_GLASSES_IO_TRANSPORT_PROFILE_VERSION;
    envelopes: MetaGlassesIOBridgeEnvelope[];
  };
}

export function createMetaGlassesIOBridgeEnvelope(
  input: {
    raw_transport: MetaGlassesIORawTransport;
    bridge_provider?: MetaGlassesIOBridgeProvider;
    bridge_route?: MetaGlassesIOBridgeRoute;
    capability?: MetaGlassesIOCapabilityKind;
    device_id?: string;
    device_session_id?: string;
    app_binding_id?: string;
    correlation_id?: string;
    content_cids?: string[];
    libp2p_peer_id?: string;
    libp2p_session_id?: string;
    permission_state?: MetaGlassesIOTransportPermissionState;
  },
): MetaGlassesIOBridgeEnvelope {
  const capability = input.capability ?? 'microphone.input';
  const permissionScope = permissionScopeForCapability(capability);
  const rawTransport = input.raw_transport;
  const bridgeProvider =
    input.bridge_provider ?? (rawTransport === 'bluetooth' ? 'phone-app' : 'display-webapp');
  const bridgeRoute = input.bridge_route ?? defaultBridgeRoute(rawTransport, bridgeProvider);
  const correlationId = input.correlation_id ?? `corr-${rawTransport}-${capability.replace('.', '-')}`;
  const content = (input.content_cids ?? [
    computeCID(`content:${rawTransport}:${capability}:${correlationId}`),
  ]).map((cid, index): MetaGlassesIOBridgeContentRef => ({
    cid,
    purpose: index === 0 ? 'input' : 'output',
    size_bytes: 4096 + index,
    media_type: mediaTypeForCapability(capability),
  }));
  const envelopeCid = computeCID(JSON.stringify({
    rawTransport,
    bridgeProvider,
    bridgeRoute,
    capability,
    correlationId,
    content: content.map(ref => ref.cid),
  }));
  const libp2pProvided = bridgeProvider !== 'phone-app' || rawTransport === 'wifi';

  return {
    profile: META_GLASSES_IO_TRANSPORT_PROFILE,
    profile_version: META_GLASSES_IO_TRANSPORT_PROFILE_VERSION,
    io_profile: META_GLASSES_IO_PROFILE,
    io_profile_version: META_GLASSES_IO_PROFILE_VERSION,
    envelope_id: envelopeCid,
    identity: {
      device_id: input.device_id ?? 'meta-glasses-device-mgw-366',
      device_session_id: input.device_session_id ?? `device-session-${rawTransport}-mgw-366`,
      app_binding_id: input.app_binding_id ?? `${capability}.binding`,
      app_id: 'swissknife.meta-glasses',
      correlation_id: correlationId,
    },
    route: {
      raw_transport: rawTransport,
      bridge_provider: bridgeProvider,
      bridge_route: bridgeRoute,
      raw_transport_is_ipfs_libp2p_or_mcp: false,
      route_decision_id: `route-${rawTransport}-${capability.replace('.', '-')}`,
      control_plane_route: rawTransport === 'bluetooth'
        ? 'swissknife.mobile_orb.publish_glasses_event'
        : 'swissknife.webapp_bridge.publish_display_event',
      readiness: 'ready',
      capability,
    },
    permission: {
      state: input.permission_state ?? 'granted',
      required_scopes: [permissionScope, 'meta_glasses.control.route'],
      granted_scopes: input.permission_state === 'denied'
        ? []
        : [permissionScope, 'meta_glasses.control.route'],
      denied_scopes: input.permission_state === 'denied' ? [permissionScope] : [],
    },
    flow_control: {
      latency_ms: rawTransport === 'bluetooth' ? 38 : 18,
      jitter_ms: rawTransport === 'bluetooth' ? 12 : 5,
      backpressure: 'none',
      queued_bytes: 0,
      dropped_messages: 0,
    },
    payload_limits: {
      max_payload_bytes: rawTransport === 'bluetooth' ? 64 * 1024 : 1024 * 1024,
      max_content_cid_count: 16,
      chunking_required_above_bytes: rawTransport === 'bluetooth' ? 16 * 1024 : 256 * 1024,
      inline_payload_allowed: false,
    },
    content,
    app_layers: {
      ipfs: 'provided_by_bridge',
      libp2p: libp2pProvided ? 'provided_by_bridge' : 'not_provided',
      mcp_plus_plus: 'provided_by_bridge',
      libp2p_peer_id: libp2pProvided
        ? input.libp2p_peer_id ?? `12D3KooW${rawTransport}BridgePeer`
        : undefined,
      libp2p_session_id: libp2pProvided
        ? input.libp2p_session_id ?? `libp2p-session-${rawTransport}-mgw-366`
        : undefined,
    },
    receipts: {
      mcp_tool_receipt_id: `mcp-tool-receipt-${correlationId}`,
      mcp_event_receipt_id: `mcp-event-receipt-${correlationId}`,
      envelope_cid: envelopeCid,
      policy_receipt_id: `policy-receipt-${correlationId}`,
    },
    policy: {
      decision_id: `policy-${rawTransport}-${capability.replace('.', '-')}`,
      outcome: input.permission_state === 'denied' ? 'deny' : 'allow',
      reasons: ['bridge route declared app-layer transport metadata'],
      required_scopes: [permissionScope, 'meta_glasses.control.route'],
      granted_scopes: input.permission_state === 'denied'
        ? []
        : [permissionScope, 'meta_glasses.control.route'],
      decision_cid: computeCID(`policy:${rawTransport}:${capability}:${correlationId}`),
    },
    privacy: {
      strategy: 'content_reference_only',
      redacted_fields: ['payload.inline_bytes', 'device.bluetooth_address'],
      metadata_cid: computeCID(`privacy:${rawTransport}:${capability}:${correlationId}`),
      reason: 'raw device payloads remain behind the app bridge',
    },
  };
}

export function createDefaultMetaGlassesIOBridgeEnvelopes(): MetaGlassesIOBridgeEnvelope[] {
  return [
    createMetaGlassesIOBridgeEnvelope({
      raw_transport: 'bluetooth',
      bridge_provider: 'phone-app',
      capability: 'microphone.input',
    }),
    createMetaGlassesIOBridgeEnvelope({
      raw_transport: 'wifi',
      bridge_provider: 'display-webapp',
      capability: 'display.output',
    }),
  ];
}

export function createMetaGlassesIOTransportDescriptor(
  envelopes: MetaGlassesIOBridgeEnvelope[] = createDefaultMetaGlassesIOBridgeEnvelopes(),
): MetaGlassesIOTransportDescriptor {
  return {
    name: 'Meta glasses I/O bridge transport envelopes',
    namespace: 'handsfree.meta-glasses.transport',
    version: META_GLASSES_IO_TRANSPORT_PROFILE_VERSION,
    methods: [
      {
        name: 'meta_glasses_io.publish_bridge_envelope',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
    ],
    errors: [
      { name: META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY },
      { name: META_GLASSES_IO_TRANSPORT_ERROR_CODES.RECEIPTS },
    ],
    requires: ['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session'],
    compatibility: { compatibleWith: [] },
    semanticTags: ['meta-glasses', 'bridge-transport', 'mcp++'],
    [META_GLASSES_IO_TRANSPORT_PROPERTY]: {
      profile: META_GLASSES_IO_TRANSPORT_PROFILE,
      profile_version: META_GLASSES_IO_TRANSPORT_PROFILE_VERSION,
      envelopes,
    },
  };
}

export function validateMetaGlassesIOBridgeEnvelope(
  envelope: MetaGlassesIOBridgeEnvelope | undefined,
): MetaGlassesIOTransportValidationResult {
  const errors: MetaGlassesIOTransportValidationIssue[] = [];

  const push = (
    code: MetaGlassesIOTransportValidationCode,
    path: string,
    message: string,
  ): void => {
    errors.push({ code, path, message });
  };

  if (!envelope) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.ENVELOPE_MISSING, '', 'Envelope is required.');
    return { conformant: false, errors, warnings: [] };
  }

  if (
    envelope.profile !== META_GLASSES_IO_TRANSPORT_PROFILE
    || envelope.profile_version !== META_GLASSES_IO_TRANSPORT_PROFILE_VERSION
    || envelope.io_profile !== META_GLASSES_IO_PROFILE
    || envelope.io_profile_version !== META_GLASSES_IO_PROFILE_VERSION
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.PROFILE, 'profile', 'Profile metadata is invalid.');
  }
  if (
    !envelope.envelope_id
    || !envelope.identity?.device_id
    || !envelope.identity.device_session_id
    || !envelope.identity.app_binding_id
    || !envelope.identity.correlation_id
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.IDENTITY, 'identity', 'Device, session, binding, and correlation identity are required.');
  }
  if (!envelope.route?.bridge_route || !envelope.route.raw_transport || !envelope.route.bridge_provider) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.BRIDGE_ROUTE, 'route', 'Bridge route metadata is required.');
  }
  if (!envelope.route?.route_decision_id || !envelope.route.control_plane_route || !envelope.route.capability) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.ROUTE_DECISION, 'route.route_decision_id', 'Control-plane route decision is required.');
  }
  if (envelope.route?.raw_transport_is_ipfs_libp2p_or_mcp !== false) {
    push(
      META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY,
      'route.raw_transport_is_ipfs_libp2p_or_mcp',
      'Raw Bluetooth and Wi-Fi routes must not be claimed as IPFS, libp2p, or MCP++.',
    );
  }
  if (
    !envelope.permission
    || !Array.isArray(envelope.permission.required_scopes)
    || !Array.isArray(envelope.permission.granted_scopes)
    || !Array.isArray(envelope.permission.denied_scopes)
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.PERMISSION_STATE, 'permission', 'Permission state and scopes are required.');
  }
  if (
    !envelope.flow_control
    || envelope.flow_control.latency_ms < 0
    || envelope.flow_control.queued_bytes < 0
    || envelope.flow_control.dropped_messages < 0
    || !envelope.flow_control.backpressure
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.FLOW_CONTROL, 'flow_control', 'Latency, backpressure, and queue counters must be valid.');
  }
  if (
    !envelope.payload_limits
    || envelope.payload_limits.max_payload_bytes <= 0
    || envelope.payload_limits.max_content_cid_count <= 0
    || envelope.payload_limits.chunking_required_above_bytes <= 0
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.PAYLOAD_LIMITS, 'payload_limits', 'Payload size limits must be positive.');
  }
  if (
    !Array.isArray(envelope.content)
    || envelope.content.length === 0
    || envelope.content.some(ref => !isCID(ref.cid) || ref.size_bytes < 0)
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.CONTENT_CIDS, 'content', 'Content references must include valid CIDs.');
  }
  if (envelope.app_layers?.libp2p === 'not_provided' && (
    envelope.app_layers.libp2p_peer_id || envelope.app_layers.libp2p_session_id
  )) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY, 'app_layers.libp2p_peer_id', 'libp2p peer metadata requires bridge-provided libp2p.');
  }
  if (envelope.app_layers?.libp2p === 'provided_by_bridge' && (
    !envelope.app_layers.libp2p_peer_id || !envelope.app_layers.libp2p_session_id
  )) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY, 'app_layers.libp2p', 'Bridge-provided libp2p requires peer and session IDs.');
  }
  if (
    !envelope.receipts?.mcp_tool_receipt_id
    || !envelope.receipts.mcp_event_receipt_id
    || !isCID(envelope.receipts.envelope_cid)
    || !envelope.receipts.policy_receipt_id
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.RECEIPTS, 'receipts', 'MCP++ receipt IDs and envelope CID are required.');
  }
  if (!envelope.policy?.decision_id || !Array.isArray(envelope.policy.reasons)) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.POLICY_DECISION, 'policy', 'Policy decision metadata is required.');
  }
  if (
    !envelope.privacy
    || !Array.isArray(envelope.privacy.redacted_fields)
    || !envelope.privacy.strategy
    || !envelope.privacy.reason
  ) {
    push(META_GLASSES_IO_TRANSPORT_ERROR_CODES.PRIVACY_REDACTION, 'privacy', 'Privacy redaction metadata is required.');
  }

  return { conformant: errors.length === 0, errors, warnings: [] };
}

export function validateMetaGlassesIOTransportDescriptor(
  descriptor: MetaGlassesIOTransportDescriptor,
): MetaGlassesIOTransportValidationResult {
  const errors: MetaGlassesIOTransportValidationIssue[] = [];
  const section = descriptor[META_GLASSES_IO_TRANSPORT_PROPERTY];

  if (
    !section
    || section.profile !== META_GLASSES_IO_TRANSPORT_PROFILE
    || section.profile_version !== META_GLASSES_IO_TRANSPORT_PROFILE_VERSION
  ) {
    errors.push({
      code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.PROFILE,
      path: META_GLASSES_IO_TRANSPORT_PROPERTY,
      message: 'Transport descriptor section is missing or invalid.',
    });
  }

  for (const [index, envelope] of (section?.envelopes ?? []).entries()) {
    const result = validateMetaGlassesIOBridgeEnvelope(envelope);
    errors.push(
      ...result.errors.map(error => ({
        ...error,
        path: `${META_GLASSES_IO_TRANSPORT_PROPERTY}.envelopes.${index}.${error.path}`,
      })),
    );
  }

  return { conformant: errors.length === 0, errors, warnings: [] };
}

export function assertMetaGlassesIOBridgeEnvelope(
  envelope: MetaGlassesIOBridgeEnvelope,
): asserts envelope is MetaGlassesIOBridgeEnvelope {
  const result = validateMetaGlassesIOBridgeEnvelope(envelope);
  if (!result.conformant) {
    throw new Error(result.errors.map(error => `${error.path}: ${error.message}`).join('; '));
  }
}

function defaultBridgeRoute(
  rawTransport: MetaGlassesIORawTransport,
  bridgeProvider: MetaGlassesIOBridgeProvider,
): MetaGlassesIOBridgeRoute {
  if (bridgeProvider === 'simulator') {
    return 'simulator.hardware-free';
  }
  if (bridgeProvider === 'display-webapp') {
    return 'display-webapp.browser-bridge';
  }
  return rawTransport === 'bluetooth'
    ? 'phone-app.bluetooth-audio'
    : 'phone-app.local-network-handoff';
}

function permissionScopeForCapability(
  capability: MetaGlassesIOCapabilityKind,
): MetaGlassesIOPermissionScope {
  const scopes: Record<MetaGlassesIOCapabilityKind, MetaGlassesIOPermissionScope> = {
    'camera.photo_capture': 'meta_glasses.camera.photo',
    'camera.video_capture': 'meta_glasses.camera.video',
    'microphone.input': 'meta_glasses.microphone.capture',
    'speaker.output': 'meta_glasses.audio.playback',
    'headphone.output': 'meta_glasses.audio.playback',
    'display.output': 'meta_glasses.display.render',
    'neural_band.input': 'meta_glasses.neural_band.input',
    'captouch.input': 'meta_glasses.captouch.input',
    'motion.orientation': 'meta_glasses.motion.orientation',
    'phone_gps.context': 'meta_glasses.phone_gps.context',
  };
  return scopes[capability];
}

function mediaTypeForCapability(capability: MetaGlassesIOCapabilityKind): string {
  if (capability.startsWith('camera.')) {
    return capability === 'camera.video_capture' ? 'video/mp4' : 'image/jpeg';
  }
  if (
    capability === 'microphone.input'
    || capability === 'speaker.output'
    || capability === 'headphone.output'
  ) {
    return 'audio/opus';
  }
  return 'application/json';
}

function isCID(value: string | undefined): boolean {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

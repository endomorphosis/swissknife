import type { InterfaceDescriptor } from '../mcp-idl.js';
import type {
  MCPUIConformanceIssue,
  MCPUIConformanceResult,
} from '../mcp-ui-profile.js';

export const META_GLASSES_IO_PROFILE = 'handsfree.meta-glasses/io-capability';
export const META_GLASSES_IO_PROFILE_VERSION = '0.1.0';
export const META_GLASSES_IO_PROFILE_PROPERTY = 'meta_glasses_io';

export const META_GLASSES_IO_ERROR_CODES = {
  PROFILE_MISSING: 'MGW_IO_PROFILE_MISSING',
  PROFILE_ID: 'MGW_IO_PROFILE_ID',
  PROFILE_VERSION: 'MGW_IO_PROFILE_VERSION',
  CAPABILITY_MISSING: 'MGW_IO_CAPABILITY_MISSING',
  CAPABILITY_DUPLICATE: 'MGW_IO_CAPABILITY_DUPLICATE',
  CAPABILITY_STATE: 'MGW_IO_CAPABILITY_STATE',
  PERMISSION_SCOPE: 'MGW_IO_PERMISSION_SCOPE',
  APPLICATION_BINDING: 'MGW_IO_APPLICATION_BINDING',
  FALLBACK_ROUTE: 'MGW_IO_FALLBACK_ROUTE',
  POLICY_DECISION: 'MGW_IO_POLICY_DECISION',
  ROUTE_DECISION: 'MGW_IO_ROUTE_DECISION',
  PAYLOAD_REF: 'MGW_IO_PAYLOAD_REF',
  LIBP2P_SESSION: 'MGW_IO_LIBP2P_SESSION',
  RECEIPT_METADATA: 'MGW_IO_RECEIPT_METADATA',
} as const;

export type MetaGlassesIOValidationCode =
  (typeof META_GLASSES_IO_ERROR_CODES)[keyof typeof META_GLASSES_IO_ERROR_CODES];

export type MetaGlassesIOCapabilityKind =
  | 'camera.photo_capture'
  | 'camera.video_capture'
  | 'microphone.input'
  | 'speaker.output'
  | 'headphone.output'
  | 'display.output'
  | 'neural_band.input'
  | 'captouch.input'
  | 'motion.orientation'
  | 'phone_gps.context';

export type MetaGlassesIOSurface =
  | 'dat-native'
  | 'display-webapp'
  | 'bluetooth-audio'
  | 'phone-os'
  | 'simulator'
  | 'mobile-fallback'
  | 'mcp-bridge';

export type MetaGlassesIOReadiness =
  | 'ready'
  | 'permission_required'
  | 'permission_denied'
  | 'unsupported'
  | 'unavailable'
  | 'degraded'
  | 'disconnected'
  | 'stale_session'
  | 'route_lost'
  | 'dat_app_update_required'
  | 'firmware_update_required'
  | 'package_or_release_channel_unavailable';

export type MetaGlassesIOPermissionScope =
  | 'meta_glasses.camera.photo'
  | 'meta_glasses.camera.video'
  | 'meta_glasses.microphone.capture'
  | 'meta_glasses.audio.playback'
  | 'meta_glasses.display.render'
  | 'meta_glasses.neural_band.input'
  | 'meta_glasses.captouch.input'
  | 'meta_glasses.motion.orientation'
  | 'meta_glasses.phone_gps.context'
  | 'meta_glasses.control.route';

export type MetaGlassesIOPolicyOutcome =
  | 'allow'
  | 'deny'
  | 'require_confirmation'
  | 'fallback'
  | 'degrade';

export type MetaGlassesIOPayloadPurpose =
  | 'photo'
  | 'video'
  | 'audio'
  | 'transcript'
  | 'display_asset'
  | 'sensor_sample'
  | 'route_receipt'
  | 'policy_receipt';

export type MetaGlassesIOReceiptKind =
  | 'mcp++/execution'
  | 'mcp++/policy-decision'
  | 'mcp++/control-route'
  | 'mcp++/capability-readiness';

export interface MetaGlassesIOPayloadRef {
  cid: string;
  purpose: MetaGlassesIOPayloadPurpose;
  media_type?: string;
  size_bytes?: number;
  sha256?: string;
  retention_policy?: 'ephemeral' | 'session' | 'pinned' | 'policy_controlled';
  redaction?: 'none' | 'metadata_only' | 'privacy_filtered';
}

export interface MetaGlassesIOPeerSession {
  libp2p_peer_id: string;
  libp2p_session_id: string;
  mcp_session_id: string;
  device_session_id?: string;
  route_generation: number;
}

export interface MetaGlassesIOMCPReceiptMetadata {
  receipt_kind: MetaGlassesIOReceiptKind;
  receipt_cid?: string;
  envelope_cid?: string;
  interface_cid?: string;
  decision_cid?: string;
  correlation_id_field: string;
  parent_receipt_cids?: string[];
  output_refs?: MetaGlassesIOPayloadRef[];
}

export interface MetaGlassesIOPolicyDecision {
  decision_id: string;
  outcome: MetaGlassesIOPolicyOutcome;
  reasons: string[];
  required_scopes: MetaGlassesIOPermissionScope[];
  granted_scopes: MetaGlassesIOPermissionScope[];
  decision_cid?: string;
  receipt?: MetaGlassesIOMCPReceiptMetadata;
}

export interface MetaGlassesIOApplicationBinding {
  binding_id: string;
  app_id: string;
  interaction: 'capture' | 'stream' | 'render' | 'playback' | 'gesture' | 'sensor' | 'context';
  method: string;
  surface: MetaGlassesIOSurface;
  input_event?: string;
  output_event?: string;
  payload_refs?: MetaGlassesIOPayloadRef[];
}

export interface MetaGlassesIOFallbackRoute {
  route_id: string;
  when: MetaGlassesIOReadiness[];
  to_surface: MetaGlassesIOSurface;
  reason: string;
  policy_decision: MetaGlassesIOPolicyDecision;
  payload_refs?: MetaGlassesIOPayloadRef[];
}

export interface MetaGlassesIOControlPlaneRouteDecision {
  route_id: string;
  capability: MetaGlassesIOCapabilityKind;
  selected_surface: MetaGlassesIOSurface;
  readiness: MetaGlassesIOReadiness;
  policy_decision: MetaGlassesIOPolicyDecision;
  peer_session: MetaGlassesIOPeerSession;
  payload_refs: MetaGlassesIOPayloadRef[];
  receipt: MetaGlassesIOMCPReceiptMetadata;
  fallback_route_id?: string;
}

export interface MetaGlassesIOCapabilityContract {
  kind: MetaGlassesIOCapabilityKind;
  label: string;
  primary_surface: MetaGlassesIOSurface;
  supported_surfaces: MetaGlassesIOSurface[];
  permission_scopes: MetaGlassesIOPermissionScope[];
  readiness: MetaGlassesIOReadiness;
  unsupported_on?: MetaGlassesIOSurface[];
  degraded_when?: MetaGlassesIOReadiness[];
  payloads: MetaGlassesIOPayloadPurpose[];
  events: string[];
  application_bindings: MetaGlassesIOApplicationBinding[];
  fallback_routes: MetaGlassesIOFallbackRoute[];
  route_decisions: MetaGlassesIOControlPlaneRouteDecision[];
}

export interface MetaGlassesIOProfile {
  profile: typeof META_GLASSES_IO_PROFILE;
  profile_version: typeof META_GLASSES_IO_PROFILE_VERSION;
  permissions: {
    default_deny: boolean;
    scopes: MetaGlassesIOPermissionScope[];
  };
  readiness_states: MetaGlassesIOReadiness[];
  capabilities: MetaGlassesIOCapabilityContract[];
}

export interface MetaGlassesIOProfileDescriptor extends InterfaceDescriptor {
  [META_GLASSES_IO_PROFILE_PROPERTY]: MetaGlassesIOProfile;
}

export const META_GLASSES_IO_REQUIRED_CAPABILITIES: readonly MetaGlassesIOCapabilityKind[] = [
  'camera.photo_capture',
  'camera.video_capture',
  'microphone.input',
  'speaker.output',
  'headphone.output',
  'display.output',
  'neural_band.input',
  'captouch.input',
  'motion.orientation',
  'phone_gps.context',
] as const;

export const META_GLASSES_IO_READINESS_STATES: readonly MetaGlassesIOReadiness[] = [
  'ready',
  'permission_required',
  'permission_denied',
  'unsupported',
  'unavailable',
  'degraded',
  'disconnected',
  'stale_session',
  'route_lost',
  'dat_app_update_required',
  'firmware_update_required',
  'package_or_release_channel_unavailable',
] as const;

export const META_GLASSES_IO_PERMISSION_SCOPES: readonly MetaGlassesIOPermissionScope[] = [
  'meta_glasses.camera.photo',
  'meta_glasses.camera.video',
  'meta_glasses.microphone.capture',
  'meta_glasses.audio.playback',
  'meta_glasses.display.render',
  'meta_glasses.neural_band.input',
  'meta_glasses.captouch.input',
  'meta_glasses.motion.orientation',
  'meta_glasses.phone_gps.context',
  'meta_glasses.control.route',
] as const;

const REQUIRED_CAPABILITY_SET = new Set<MetaGlassesIOCapabilityKind>(
  META_GLASSES_IO_REQUIRED_CAPABILITIES,
);
const READINESS_SET = new Set<MetaGlassesIOReadiness>(META_GLASSES_IO_READINESS_STATES);
const PERMISSION_SCOPE_SET = new Set<MetaGlassesIOPermissionScope>(
  META_GLASSES_IO_PERMISSION_SCOPES,
);
const SURFACE_SET = new Set<MetaGlassesIOSurface>([
  'dat-native',
  'display-webapp',
  'bluetooth-audio',
  'phone-os',
  'simulator',
  'mobile-fallback',
  'mcp-bridge',
]);
const POLICY_OUTCOME_SET = new Set<MetaGlassesIOPolicyOutcome>([
  'allow',
  'deny',
  'require_confirmation',
  'fallback',
  'degrade',
]);
const RECEIPT_KIND_SET = new Set<MetaGlassesIOReceiptKind>([
  'mcp++/execution',
  'mcp++/policy-decision',
  'mcp++/control-route',
  'mcp++/capability-readiness',
]);

export function createDefaultMetaGlassesIOProfile(): MetaGlassesIOProfile {
  return {
    profile: META_GLASSES_IO_PROFILE,
    profile_version: META_GLASSES_IO_PROFILE_VERSION,
    permissions: {
      default_deny: true,
      scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    },
    readiness_states: [...META_GLASSES_IO_READINESS_STATES],
    capabilities: [
      capability('camera.photo_capture', 'Camera photo capture', 'dat-native', [
        'meta_glasses.camera.photo',
      ], ['photo'], ['io.camera.photo.captured'], ['permission_denied', 'unavailable']),
      capability('camera.video_capture', 'Camera video capture', 'dat-native', [
        'meta_glasses.camera.video',
      ], ['video'], ['io.camera.video.started', 'io.camera.video.stopped'], [
        'degraded',
        'route_lost',
      ]),
      capability('microphone.input', 'Microphone input', 'bluetooth-audio', [
        'meta_glasses.microphone.capture',
      ], ['audio', 'transcript'], ['io.microphone.input'], ['permission_denied', 'route_lost']),
      capability('speaker.output', 'Speaker output', 'bluetooth-audio', [
        'meta_glasses.audio.playback',
      ], ['audio'], ['io.speaker.playback'], ['route_lost', 'degraded']),
      capability('headphone.output', 'Headphone output', 'bluetooth-audio', [
        'meta_glasses.audio.playback',
      ], ['audio'], ['io.headphone.playback'], ['route_lost', 'degraded']),
      capability('display.output', 'Display output', 'dat-native', [
        'meta_glasses.display.render',
      ], ['display_asset'], ['io.display.rendered', 'io.display.lifecycle'], [
        'dat_app_update_required',
        'firmware_update_required',
        'package_or_release_channel_unavailable',
      ], ['display-webapp', 'simulator', 'mobile-fallback']),
      capability('neural_band.input', 'Meta Neural Band input', 'display-webapp', [
        'meta_glasses.neural_band.input',
      ], ['sensor_sample'], ['io.neural_band.intent'], ['unsupported'], [
        'simulator',
        'mobile-fallback',
      ]),
      capability('captouch.input', 'Captouch input', 'display-webapp', [
        'meta_glasses.captouch.input',
      ], ['sensor_sample'], ['io.captouch.intent'], ['unsupported'], [
        'simulator',
        'mobile-fallback',
      ]),
      capability('motion.orientation', 'Motion and orientation', 'display-webapp', [
        'meta_glasses.motion.orientation',
      ], ['sensor_sample'], ['io.motion.orientation'], ['unsupported', 'degraded'], [
        'simulator',
        'mobile-fallback',
      ]),
      capability('phone_gps.context', 'Phone GPS context', 'phone-os', [
        'meta_glasses.phone_gps.context',
      ], ['sensor_sample'], ['io.phone_gps.context'], ['permission_denied', 'degraded'], [
        'mobile-fallback',
      ]),
    ],
  };
}

export function validateMetaGlassesIOProfile(profile: unknown): MCPUIConformanceResult {
  const errors: MCPUIConformanceIssue[] = [];
  const warnings: MCPUIConformanceIssue[] = [];

  if (!isRecord(profile)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PROFILE_MISSING, META_GLASSES_IO_PROFILE_PROPERTY, 'Meta glasses I/O profile section is required.');
    return { conformant: false, errors, warnings };
  }

  if (profile.profile !== META_GLASSES_IO_PROFILE) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PROFILE_ID, `${META_GLASSES_IO_PROFILE_PROPERTY}.profile`, `Expected ${META_GLASSES_IO_PROFILE}.`);
  }
  if (profile.profile_version !== META_GLASSES_IO_PROFILE_VERSION) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PROFILE_VERSION, `${META_GLASSES_IO_PROFILE_PROPERTY}.profile_version`, `Expected ${META_GLASSES_IO_PROFILE_VERSION}.`);
  }

  validatePermissions(profile.permissions, errors);
  validateReadinessStates(profile.readiness_states, errors);
  validateCapabilities(profile.capabilities, errors);

  return {
    conformant: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateMetaGlassesIOProfileDescriptor(
  descriptor: Partial<MetaGlassesIOProfileDescriptor>,
): MCPUIConformanceResult {
  return validateMetaGlassesIOProfile(descriptor[META_GLASSES_IO_PROFILE_PROPERTY]);
}

export function assertMetaGlassesIOProfile(
  profile: unknown,
): asserts profile is MetaGlassesIOProfile {
  const result = validateMetaGlassesIOProfile(profile);
  if (!result.conformant) {
    const detail = result.errors
      .map(issue => `${issue.code} ${issue.path}: ${issue.message}`)
      .join('; ');
    throw new Error(`Meta glasses I/O profile conformance failed: ${detail}`);
  }
}

export function findMetaGlassesIOCapability(
  profile: MetaGlassesIOProfile,
  kind: MetaGlassesIOCapabilityKind,
): MetaGlassesIOCapabilityContract | undefined {
  return profile.capabilities.find(capabilityContract => capabilityContract.kind === kind);
}

function capability(
  kind: MetaGlassesIOCapabilityKind,
  label: string,
  primarySurface: MetaGlassesIOSurface,
  scopes: MetaGlassesIOPermissionScope[],
  payloads: MetaGlassesIOPayloadPurpose[],
  events: string[],
  degradedWhen: MetaGlassesIOReadiness[],
  fallbackSurfaces: MetaGlassesIOSurface[] = ['mobile-fallback'],
): MetaGlassesIOCapabilityContract {
  const bindingId = `${kind}.binding`;
  const routeId = `${kind}.primary`;
  const fallbackRoutes = fallbackSurfaces.map(surface => fallbackRoute(kind, surface, degradedWhen));
  const payloadRef: MetaGlassesIOPayloadRef = {
    cid: `sha256:${kind.replace(/[^a-z0-9]/g, '')}payload000000000000000000000000000000000000000000000000`,
    purpose: payloads[0],
    retention_policy: 'policy_controlled',
    redaction: 'privacy_filtered',
  };
  const peerSession: MetaGlassesIOPeerSession = {
    libp2p_peer_id: '12D3KooWMetaGlassesBridgePeer',
    libp2p_session_id: `libp2p-session-${kind.replace('.', '-')}`,
    mcp_session_id: `mcp-session-${kind.replace('.', '-')}`,
    device_session_id: `device-session-${kind.replace('.', '-')}`,
    route_generation: 1,
  };
  const policyDecision = policy('allow', scopes, 'Default route allowed by capability contract.');
  const receipt: MetaGlassesIOMCPReceiptMetadata = {
    receipt_kind: 'mcp++/control-route',
    receipt_cid: `sha256:${kind.replace(/[^a-z0-9]/g, '')}receipt000000000000000000000000000000000000000000000000`,
    envelope_cid: `sha256:${kind.replace(/[^a-z0-9]/g, '')}envelope000000000000000000000000000000000000000000000`,
    decision_cid: policyDecision.decision_cid,
    correlation_id_field: 'correlation_id',
    output_refs: [payloadRef],
  };

  return {
    kind,
    label,
    primary_surface: primarySurface,
    supported_surfaces: Array.from(new Set([primarySurface, ...fallbackSurfaces, 'mcp-bridge'])),
    permission_scopes: [...scopes, 'meta_glasses.control.route'],
    readiness: 'ready',
    unsupported_on: primarySurface === 'dat-native' ? ['display-webapp'] : ['dat-native'],
    degraded_when: degradedWhen,
    payloads,
    events,
    application_bindings: [
      {
        binding_id: bindingId,
        app_id: 'swissknife.meta-glasses',
        interaction: interactionForCapability(kind),
        method: methodForCapability(kind),
        surface: primarySurface,
        output_event: events[0],
        payload_refs: [payloadRef],
      },
    ],
    fallback_routes: fallbackRoutes,
    route_decisions: [
      {
        route_id: routeId,
        capability: kind,
        selected_surface: primarySurface,
        readiness: 'ready',
        policy_decision: policyDecision,
        peer_session: peerSession,
        payload_refs: [payloadRef],
        receipt,
        fallback_route_id: fallbackRoutes[0]?.route_id,
      },
    ],
  };
}

function fallbackRoute(
  kind: MetaGlassesIOCapabilityKind,
  surface: MetaGlassesIOSurface,
  states: MetaGlassesIOReadiness[],
): MetaGlassesIOFallbackRoute {
  return {
    route_id: `${kind}.fallback.${surface}`,
    when: states.length ? states : ['unavailable'],
    to_surface: surface,
    reason: `${kind} falls back to ${surface} when the primary route cannot satisfy readiness.`,
    policy_decision: policy('fallback', ['meta_glasses.control.route'], 'Fallback route selected.'),
  };
}

function policy(
  outcome: MetaGlassesIOPolicyOutcome,
  scopes: MetaGlassesIOPermissionScope[],
  reason: string,
): MetaGlassesIOPolicyDecision {
  const decisionCid = `sha256:${outcome}${scopes.join('').replace(/[^a-z0-9]/g, '')}decision000000000000000000000000000`;
  return {
    decision_id: `${outcome}-${scopes[0]}`,
    outcome,
    reasons: [reason],
    required_scopes: scopes,
    granted_scopes: outcome === 'deny' ? [] : scopes,
    decision_cid: decisionCid,
    receipt: {
      receipt_kind: 'mcp++/policy-decision',
      decision_cid: decisionCid,
      correlation_id_field: 'correlation_id',
    },
  };
}

function interactionForCapability(kind: MetaGlassesIOCapabilityKind): MetaGlassesIOApplicationBinding['interaction'] {
  if (kind.startsWith('camera.')) return 'capture';
  if (kind === 'microphone.input') return 'stream';
  if (kind === 'speaker.output' || kind === 'headphone.output') return 'playback';
  if (kind === 'display.output') return 'render';
  if (kind === 'phone_gps.context') return 'context';
  if (kind === 'motion.orientation') return 'sensor';
  return 'gesture';
}

function methodForCapability(kind: MetaGlassesIOCapabilityKind): string {
  return kind.replace('.', '_');
}

function validatePermissions(permissions: unknown, errors: MCPUIConformanceIssue[]): void {
  if (!isRecord(permissions) || permissions.default_deny !== true || !Array.isArray(permissions.scopes)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PERMISSION_SCOPE, `${META_GLASSES_IO_PROFILE_PROPERTY}.permissions`, 'Permissions must default deny and list supported scopes.');
    return;
  }

  for (const scope of permissions.scopes) {
    if (!PERMISSION_SCOPE_SET.has(scope as MetaGlassesIOPermissionScope)) {
      push(errors, META_GLASSES_IO_ERROR_CODES.PERMISSION_SCOPE, `${META_GLASSES_IO_PROFILE_PROPERTY}.permissions.scopes`, `Unsupported permission scope: ${String(scope)}.`);
    }
  }
}

function validateReadinessStates(states: unknown, errors: MCPUIConformanceIssue[]): void {
  if (!Array.isArray(states)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_STATE, `${META_GLASSES_IO_PROFILE_PROPERTY}.readiness_states`, 'Readiness states are required.');
    return;
  }

  for (const state of META_GLASSES_IO_READINESS_STATES) {
    if (!states.includes(state)) {
      push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_STATE, `${META_GLASSES_IO_PROFILE_PROPERTY}.readiness_states`, `Missing readiness state: ${state}.`);
    }
  }
}

function validateCapabilities(capabilities: unknown, errors: MCPUIConformanceIssue[]): void {
  if (!Array.isArray(capabilities)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_MISSING, `${META_GLASSES_IO_PROFILE_PROPERTY}.capabilities`, 'Capability contracts are required.');
    return;
  }

  const seen = new Set<MetaGlassesIOCapabilityKind>();
  capabilities.forEach((item, index) => {
    if (!isRecord(item) || !REQUIRED_CAPABILITY_SET.has(item.kind as MetaGlassesIOCapabilityKind)) {
      push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_MISSING, `${META_GLASSES_IO_PROFILE_PROPERTY}.capabilities[${index}].kind`, `Unsupported capability: ${String(isRecord(item) ? item.kind : item)}.`);
      return;
    }
    const kind = item.kind as MetaGlassesIOCapabilityKind;
    if (seen.has(kind)) {
      push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_DUPLICATE, `${META_GLASSES_IO_PROFILE_PROPERTY}.capabilities[${index}].kind`, `Duplicate capability: ${kind}.`);
    }
    seen.add(kind);

    validateCapabilityContract(item, index, errors);
  });

  for (const required of META_GLASSES_IO_REQUIRED_CAPABILITIES) {
    if (!seen.has(required)) {
      push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_MISSING, `${META_GLASSES_IO_PROFILE_PROPERTY}.capabilities`, `Missing required capability: ${required}.`);
    }
  }
}

function validateCapabilityContract(
  capabilityContract: Record<string, unknown>,
  index: number,
  errors: MCPUIConformanceIssue[],
): void {
  const path = `${META_GLASSES_IO_PROFILE_PROPERTY}.capabilities[${index}]`;
  if (!SURFACE_SET.has(capabilityContract.primary_surface as MetaGlassesIOSurface)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.ROUTE_DECISION, `${path}.primary_surface`, 'Primary surface is required.');
  }
  if (!READINESS_SET.has(capabilityContract.readiness as MetaGlassesIOReadiness)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.CAPABILITY_STATE, `${path}.readiness`, 'Capability readiness must be a known state.');
  }
  if (!isNonEmptyArray(capabilityContract.permission_scopes)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PERMISSION_SCOPE, `${path}.permission_scopes`, 'Capability permission scopes are required.');
  } else {
    for (const scope of capabilityContract.permission_scopes) {
      if (!PERMISSION_SCOPE_SET.has(scope as MetaGlassesIOPermissionScope)) {
        push(errors, META_GLASSES_IO_ERROR_CODES.PERMISSION_SCOPE, `${path}.permission_scopes`, `Unsupported permission scope: ${String(scope)}.`);
      }
    }
  }
  if (!isNonEmptyArray(capabilityContract.application_bindings)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.APPLICATION_BINDING, `${path}.application_bindings`, 'Application interaction bindings are required.');
  }
  if (!isNonEmptyArray(capabilityContract.fallback_routes)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.FALLBACK_ROUTE, `${path}.fallback_routes`, 'Fallback routing is required.');
  } else {
    capabilityContract.fallback_routes.forEach((route, routeIndex) => validateFallbackRoute(route, `${path}.fallback_routes[${routeIndex}]`, errors));
  }
  if (!isNonEmptyArray(capabilityContract.route_decisions)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.ROUTE_DECISION, `${path}.route_decisions`, 'Control-plane route decisions are required.');
  } else {
    capabilityContract.route_decisions.forEach((route, routeIndex) => validateRouteDecision(route, `${path}.route_decisions[${routeIndex}]`, errors));
  }
}

function validateFallbackRoute(
  route: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(route)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.FALLBACK_ROUTE, path, 'Fallback route must be an object.');
    return;
  }
  if (!isNonEmptyString(route.route_id) || !SURFACE_SET.has(route.to_surface as MetaGlassesIOSurface)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.FALLBACK_ROUTE, path, 'Fallback route requires an id and supported target surface.');
  }
  validatePolicyDecision(route.policy_decision, `${path}.policy_decision`, errors);
}

function validateRouteDecision(
  route: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(route)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.ROUTE_DECISION, path, 'Route decision must be an object.');
    return;
  }
  if (!isNonEmptyString(route.route_id) || !SURFACE_SET.has(route.selected_surface as MetaGlassesIOSurface)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.ROUTE_DECISION, path, 'Route decision requires an id and selected surface.');
  }
  validatePolicyDecision(route.policy_decision, `${path}.policy_decision`, errors);
  validatePeerSession(route.peer_session, `${path}.peer_session`, errors);
  if (!Array.isArray(route.payload_refs)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PAYLOAD_REF, `${path}.payload_refs`, 'Route decision must list payload refs, even when empty.');
  } else {
    route.payload_refs.forEach((ref, refIndex) => validatePayloadRef(ref, `${path}.payload_refs[${refIndex}]`, errors));
  }
  validateReceipt(route.receipt, `${path}.receipt`, errors);
}

function validatePolicyDecision(
  decision: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(decision) || !POLICY_OUTCOME_SET.has(decision.outcome as MetaGlassesIOPolicyOutcome)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.POLICY_DECISION, path, 'Policy decision with a supported outcome is required.');
    return;
  }
  if (!Array.isArray(decision.required_scopes) || !Array.isArray(decision.granted_scopes)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.POLICY_DECISION, path, 'Policy decision must record required and granted scopes.');
  }
  if (decision.receipt !== undefined) {
    validateReceipt(decision.receipt, `${path}.receipt`, errors);
  }
}

function validatePeerSession(
  peerSession: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(peerSession)
    || !isNonEmptyString(peerSession.libp2p_peer_id)
    || !isNonEmptyString(peerSession.libp2p_session_id)
    || !isNonEmptyString(peerSession.mcp_session_id)
    || typeof peerSession.route_generation !== 'number') {
    push(errors, META_GLASSES_IO_ERROR_CODES.LIBP2P_SESSION, path, 'libp2p peer/session identifiers, MCP session id, and route generation are required.');
  }
}

function validatePayloadRef(
  ref: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(ref) || !isNonEmptyString(ref.cid) || !ref.cid.startsWith('sha256:')) {
    push(errors, META_GLASSES_IO_ERROR_CODES.PAYLOAD_REF, path, 'Content-addressed payload reference must include a sha256 CID.');
  }
}

function validateReceipt(
  receipt: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(receipt)
    || !RECEIPT_KIND_SET.has(receipt.receipt_kind as MetaGlassesIOReceiptKind)
    || !isNonEmptyString(receipt.correlation_id_field)) {
    push(errors, META_GLASSES_IO_ERROR_CODES.RECEIPT_METADATA, path, 'MCP++ receipt metadata requires receipt kind and correlation id field.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function push(
  target: MCPUIConformanceIssue[],
  code: MetaGlassesIOValidationCode,
  path: string,
  message: string,
): void {
  target.push({ code, path, message });
}

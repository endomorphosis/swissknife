import { computeCID, computeInterfaceCID, type InterfaceDescriptor } from '../mcp/mcp-idl.js';
import {
  createDefaultMetaGlassesIOProfile,
  findMetaGlassesIOCapability,
  META_GLASSES_IO_PROFILE_PROPERTY,
  type MetaGlassesIOCapabilityContract,
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOMCPReceiptMetadata,
  type MetaGlassesIOPayloadRef,
  type MetaGlassesIOPermissionScope,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
} from './meta-glasses-io-profile.js';
import {
  createMetaGlassesIOBridgeEnvelope,
  type MetaGlassesIOBridgeEnvelope,
} from './meta-glasses-io-transport.js';

export const META_GLASSES_AUDIO_ADAPTER_ID =
  'org.handsfree.swissknife.meta-glasses-audio-adapter@0.1.0';

export type MetaGlassesAudioCapability =
  | 'microphone.input'
  | 'speaker.output'
  | 'headphone.output';

export type MetaGlassesAudioRouteState =
  | 'ready'
  | 'mock'
  | 'unsupported'
  | 'degraded'
  | 'permission_required'
  | 'fallback'
  | 'denied'
  | 'error';

export type MetaGlassesAudioInteraction = 'capture' | 'playback';
export type MetaGlassesBluetoothProfile = 'hfp' | 'a2dp' | 'ble-audio' | 'mock';
export type MetaGlassesAudioReceiptStage =
  | 'route_selection'
  | 'capture_start'
  | 'playback_start'
  | 'fallback'
  | 'denial'
  | 'error';

export interface MetaGlassesAudioAppRequirement {
  app_id: string;
  capability: MetaGlassesAudioCapability;
  interaction: MetaGlassesAudioInteraction;
  action: string;
  binding_id: string;
  required_scopes: MetaGlassesIOPermissionScope[];
  bluetooth_profile: MetaGlassesBluetoothProfile;
  default_route_state: MetaGlassesAudioRouteState;
  privacy_redaction: 'privacy_filtered';
  raw_audio_allowed_by_default: false;
}

export interface MetaGlassesAudioRouteRequest {
  app_id: string;
  capability: MetaGlassesAudioCapability;
  action: string;
  granted_scopes?: MetaGlassesIOPermissionScope[];
  readiness?: MetaGlassesIOReadiness;
  storage_enabled?: boolean;
  content_cids?: string[];
  correlation_id?: string;
  mock?: boolean;
}

export interface MetaGlassesAudioEvent {
  event: string;
  capability: MetaGlassesAudioCapability;
  action: string;
  route_state: MetaGlassesAudioRouteState;
  control_plane_route: string;
  payload_refs: MetaGlassesIOPayloadRef[];
  envelope: MetaGlassesIOBridgeEnvelope;
}

export interface MetaGlassesAudioReceipt extends MetaGlassesIOMCPReceiptMetadata {
  audio_stage: MetaGlassesAudioReceiptStage;
  route_state: MetaGlassesAudioRouteState;
  action: string;
  bluetooth_profile: MetaGlassesBluetoothProfile;
}

export interface MetaGlassesAudioRouteResult {
  status: MetaGlassesAudioRouteState;
  granted: boolean;
  requirement: MetaGlassesAudioAppRequirement;
  missing_scopes: MetaGlassesIOPermissionScope[];
  readiness: MetaGlassesIOReadiness;
  policy_decision: MetaGlassesIOPolicyDecision;
  payload_refs: MetaGlassesIOPayloadRef[];
  normalized_event: MetaGlassesAudioEvent;
  receipts: MetaGlassesAudioReceipt[];
  fallback_reason?: string;
  error?: string;
  raw_audio?: never;
}

export interface MetaGlassesAudioAdapterDescriptor extends InterfaceDescriptor {
  meta_glasses_audio: {
    adapter_id: typeof META_GLASSES_AUDIO_ADAPTER_ID;
    descriptor_cid: string;
    requirements: MetaGlassesAudioAppRequirement[];
    capabilities: MetaGlassesIOCapabilityContract[];
    privacy: {
      default_redaction: 'content_reference_only';
      raw_audio_leakage_allowed: false;
      storage_requires_explicit_enablement: true;
    };
  };
}

const AUDIO_CAPABILITIES: readonly MetaGlassesAudioCapability[] = [
  'microphone.input',
  'speaker.output',
  'headphone.output',
];

const AUDIO_METHODS: Record<MetaGlassesAudioCapability, string> = {
  'microphone.input': 'meta_glasses_audio.start_microphone_capture',
  'speaker.output': 'meta_glasses_audio.start_speaker_playback',
  'headphone.output': 'meta_glasses_audio.start_headphone_playback',
};

const AUDIO_EVENTS: Record<MetaGlassesAudioCapability, string> = {
  'microphone.input': 'io.audio.microphone.capture.started',
  'speaker.output': 'io.audio.speaker.playback.started',
  'headphone.output': 'io.audio.headphone.playback.started',
};

export function createMetaGlassesAudioAdapterDescriptor(
  appId = 'swissknife.meta-glasses',
): MetaGlassesAudioAdapterDescriptor {
  const profile = createDefaultMetaGlassesIOProfile();
  const capabilities = AUDIO_CAPABILITIES.map(capability => requiredAudioCapability(profile, capability));
  const descriptor = {
    name: 'meta-glasses-audio-adapter',
    namespace: 'org.handsfree.swissknife.meta_glasses',
    version: '0.1.0',
    methods: AUDIO_CAPABILITIES.map(capability => ({
      name: AUDIO_METHODS[capability],
      input_schema: { type: 'object', additionalProperties: true },
      output_schema: { type: 'object', additionalProperties: true },
    })),
    errors: [
      { name: 'AudioPermissionRequired' },
      { name: 'AudioRouteFallback' },
      { name: 'RawAudioRedacted' },
      { name: 'AudioRouteUnsupported' },
    ],
    requires: ['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session'],
    compatibility: { compatible_with: [] },
    semanticTags: ['meta-glasses', 'audio', 'bluetooth-route', 'mcp++'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    [META_GLASSES_IO_PROFILE_PROPERTY]: profile,
  } as InterfaceDescriptor;
  const descriptorCid = computeInterfaceCID(descriptor);

  return {
    ...descriptor,
    meta_glasses_audio: {
      adapter_id: META_GLASSES_AUDIO_ADAPTER_ID,
      descriptor_cid: descriptorCid,
      requirements: createMetaGlassesAudioAppRequirements(appId),
      capabilities,
      privacy: {
        default_redaction: 'content_reference_only',
        raw_audio_leakage_allowed: false,
        storage_requires_explicit_enablement: true,
      },
    },
  };
}

export function createMetaGlassesAudioAppRequirements(
  appId = 'swissknife.meta-glasses',
): MetaGlassesAudioAppRequirement[] {
  const profile = createDefaultMetaGlassesIOProfile();
  return AUDIO_CAPABILITIES.map(capability => {
    const contract = requiredAudioCapability(profile, capability);
    return {
      app_id: appId,
      capability,
      interaction: capability === 'microphone.input' ? 'capture' : 'playback',
      action: AUDIO_METHODS[capability],
      binding_id: contract.application_bindings[0].binding_id,
      required_scopes: [...contract.permission_scopes],
      bluetooth_profile: bluetoothProfileFor(capability),
      default_route_state: 'ready',
      privacy_redaction: 'privacy_filtered',
      raw_audio_allowed_by_default: false,
    };
  });
}

export function requestMetaGlassesAudioRoute(
  request: MetaGlassesAudioRouteRequest,
): MetaGlassesAudioRouteResult {
  const requirements = createMetaGlassesAudioAppRequirements(request.app_id);
  const requirement = requirements.find(item => item.capability === request.capability);
  if (!requirement) {
    return errorResult(request, requirements[0], 'Unsupported audio capability.');
  }

  const grantedScopes = new Set(request.granted_scopes ?? []);
  const missingScopes = requirement.required_scopes.filter(scope => !grantedScopes.has(scope));
  const readiness = request.readiness ?? 'ready';
  const payloadRefs = audioPayloadRefs(request, requirement);
  const envelope = createAudioEnvelope(request, requirement, payloadRefs);

  if (missingScopes.length > 0) {
    const policyDecision = policy('require_confirmation', requirement.required_scopes, [], 'Audio route requires explicit permission.');
    return routeResult('permission_required', false, request, requirement, missingScopes, readiness, policyDecision, payloadRefs, envelope);
  }

  if (readiness === 'unsupported') {
    const policyDecision = policy('deny', requirement.required_scopes, request.granted_scopes ?? [], 'Audio capability is unsupported on this route.');
    return routeResult('unsupported', false, request, requirement, [], readiness, policyDecision, payloadRefs, envelope, 'unsupported route');
  }

  if (readiness !== 'ready' || request.mock === true) {
    const state: MetaGlassesAudioRouteState = request.mock === true
      ? 'mock'
      : readiness === 'degraded'
        ? 'degraded'
        : 'fallback';
    const policyDecision = policy('fallback', requirement.required_scopes, request.granted_scopes ?? [], 'Audio route selected fallback handling.');
    return routeResult(state, true, request, requirement, [], readiness, policyDecision, payloadRefs, envelope, `${readiness} route`);
  }

  const policyDecision = policy('allow', requirement.required_scopes, request.granted_scopes ?? [], 'Audio route allowed.');
  return routeResult('ready', true, request, requirement, [], readiness, policyDecision, payloadRefs, envelope);
}

function routeResult(
  status: MetaGlassesAudioRouteState,
  granted: boolean,
  request: MetaGlassesAudioRouteRequest,
  requirement: MetaGlassesAudioAppRequirement,
  missingScopes: MetaGlassesIOPermissionScope[],
  readiness: MetaGlassesIOReadiness,
  policyDecision: MetaGlassesIOPolicyDecision,
  payloadRefs: MetaGlassesIOPayloadRef[],
  envelope: MetaGlassesIOBridgeEnvelope,
  fallbackReason?: string,
): MetaGlassesAudioRouteResult {
  const normalizedEvent: MetaGlassesAudioEvent = {
    event: status === 'ready' || status === 'mock' ? AUDIO_EVENTS[requirement.capability] : `io.audio.${status}`,
    capability: requirement.capability,
    action: request.action,
    route_state: status,
    control_plane_route: envelope.route.control_plane_route,
    payload_refs: payloadRefs,
    envelope,
  };
  return {
    status,
    granted,
    requirement,
    missing_scopes: missingScopes,
    readiness,
    policy_decision: policyDecision,
    payload_refs: payloadRefs,
    normalized_event: normalizedEvent,
    receipts: receiptsFor(status, request, requirement, payloadRefs, policyDecision, envelope),
    fallback_reason: fallbackReason,
  };
}

function errorResult(
  request: MetaGlassesAudioRouteRequest,
  requirement: MetaGlassesAudioAppRequirement,
  message: string,
): MetaGlassesAudioRouteResult {
  const payloadRefs: MetaGlassesIOPayloadRef[] = [];
  const envelope = createAudioEnvelope(request, requirement, payloadRefs);
  const policyDecision = policy('deny', requirement.required_scopes, [], message);
  return {
    ...routeResult('error', false, request, requirement, requirement.required_scopes, 'unsupported', policyDecision, payloadRefs, envelope),
    error: message,
  };
}

function audioPayloadRefs(
  request: MetaGlassesAudioRouteRequest,
  requirement: MetaGlassesAudioAppRequirement,
): MetaGlassesIOPayloadRef[] {
  const cids = request.storage_enabled === true
    ? request.content_cids ?? [computeCID(`${request.app_id}:${request.capability}:${request.correlation_id ?? request.action}`)]
    : [computeCID(`redacted-audio-metadata:${request.app_id}:${request.capability}:${request.correlation_id ?? request.action}`)];
  return cids.map((cid): MetaGlassesIOPayloadRef => ({
    cid,
    purpose: request.capability === 'microphone.input' ? 'audio' : 'route_receipt',
    media_type: request.capability === 'microphone.input' ? 'audio/opaque' : 'application/vnd.meta-glasses.audio-route+json',
    retention_policy: request.storage_enabled === true ? 'policy_controlled' : 'ephemeral',
    redaction: requirement.privacy_redaction,
  }));
}

function createAudioEnvelope(
  request: MetaGlassesAudioRouteRequest,
  requirement: MetaGlassesAudioAppRequirement,
  payloadRefs: MetaGlassesIOPayloadRef[],
): MetaGlassesIOBridgeEnvelope {
  return createMetaGlassesIOBridgeEnvelope({
    raw_transport: 'bluetooth',
    bridge_provider: request.mock === true ? 'simulator' : 'phone-app',
    bridge_route: request.mock === true ? 'simulator.hardware-free' : 'phone-app.bluetooth-audio',
    capability: request.capability,
    app_binding_id: requirement.binding_id,
    correlation_id: request.correlation_id,
    content_cids: payloadRefs.map(ref => ref.cid),
    permission_state: request.granted_scopes && request.granted_scopes.length > 0 ? 'granted' : 'prompt_required',
  });
}

function receiptsFor(
  status: MetaGlassesAudioRouteState,
  request: MetaGlassesAudioRouteRequest,
  requirement: MetaGlassesAudioAppRequirement,
  payloadRefs: MetaGlassesIOPayloadRef[],
  policyDecision: MetaGlassesIOPolicyDecision,
  envelope: MetaGlassesIOBridgeEnvelope,
): MetaGlassesAudioReceipt[] {
  const base = `${request.app_id}:${request.capability}:${request.correlation_id ?? request.action}:${status}`;
  const terminalStage = receiptStageFor(status, requirement.interaction);
  return [
    {
      audio_stage: 'route_selection',
      route_state: status,
      action: request.action,
      bluetooth_profile: requirement.bluetooth_profile,
      receipt_kind: 'mcp++/control-route',
      receipt_cid: computeCID(`route:${base}`),
      envelope_cid: envelope.envelope_id,
      decision_cid: policyDecision.decision_cid,
      correlation_id_field: 'correlation_id',
      output_refs: payloadRefs,
    },
    {
      audio_stage: terminalStage,
      route_state: status,
      action: request.action,
      bluetooth_profile: requirement.bluetooth_profile,
      receipt_kind: 'mcp++/execution',
      receipt_cid: computeCID(`execution:${base}:${requirement.binding_id}:${terminalStage}`),
      envelope_cid: envelope.envelope_id,
      decision_cid: policyDecision.decision_cid,
      correlation_id_field: 'correlation_id',
      output_refs: payloadRefs,
    },
  ];
}

function receiptStageFor(
  status: MetaGlassesAudioRouteState,
  interaction: MetaGlassesAudioInteraction,
): MetaGlassesAudioReceiptStage {
  if (status === 'permission_required' || status === 'denied' || status === 'unsupported') {
    return 'denial';
  }
  if (status === 'fallback' || status === 'degraded') {
    return 'fallback';
  }
  if (status === 'error') {
    return 'error';
  }
  return interaction === 'capture' ? 'capture_start' : 'playback_start';
}

function policy(
  outcome: MetaGlassesIOPolicyDecision['outcome'],
  requiredScopes: MetaGlassesIOPermissionScope[],
  grantedScopes: MetaGlassesIOPermissionScope[],
  reason: string,
): MetaGlassesIOPolicyDecision {
  const decisionCid = computeCID(`audio-policy:${outcome}:${requiredScopes.join(',')}:${grantedScopes.join(',')}:${reason}`);
  return {
    decision_id: `audio-${outcome}-${requiredScopes[0]}`,
    outcome,
    reasons: [reason, 'Raw audio is redacted unless storage is explicitly enabled.'],
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

function requiredAudioCapability(
  profile: ReturnType<typeof createDefaultMetaGlassesIOProfile>,
  capability: MetaGlassesAudioCapability,
): MetaGlassesIOCapabilityContract {
  const contract = findMetaGlassesIOCapability(profile, capability as MetaGlassesIOCapabilityKind);
  if (!contract) {
    throw new Error(`Missing audio capability in Meta glasses I/O profile: ${capability}`);
  }
  return contract;
}

function bluetoothProfileFor(capability: MetaGlassesAudioCapability): MetaGlassesBluetoothProfile {
  if (capability === 'microphone.input') {
    return 'hfp';
  }
  if (capability === 'speaker.output') {
    return 'a2dp';
  }
  return 'ble-audio';
}

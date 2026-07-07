import type { InterfaceDescriptor } from '../mcp-idl.js';
import { computeCID } from '../mcp-idl.js';
import {
  META_GLASSES_IO_PROFILE,
  META_GLASSES_IO_PROFILE_VERSION,
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOPayloadRef,
  type MetaGlassesIOPeerSession,
  type MetaGlassesIOPermissionScope,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
} from './meta-glasses-io-profile.js';
import {
  createMetaGlassesIOBridgeEnvelope,
  type MetaGlassesIOBridgeEnvelope,
} from './meta-glasses-io-transport.js';

export const META_GLASSES_CAMERA_ADAPTER_PROFILE =
  'handsfree.meta-glasses/camera-app-descriptor';
export const META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION = '0.1.0';
export const META_GLASSES_CAMERA_ADAPTER_PROPERTY = 'meta_glasses_camera';

export const META_GLASSES_CAMERA_ERROR_CODES = {
  DESCRIPTOR: 'MGW_CAMERA_DESCRIPTOR',
  REQUIREMENT: 'MGW_CAMERA_REQUIREMENT',
  BINDING: 'MGW_CAMERA_BINDING',
  PERMISSION: 'MGW_CAMERA_PERMISSION',
  POLICY: 'MGW_CAMERA_POLICY',
  ROUTE: 'MGW_CAMERA_ROUTE',
  PAYLOAD: 'MGW_CAMERA_PAYLOAD',
  RECEIPT: 'MGW_CAMERA_RECEIPT',
  CONTROL_EVENT: 'MGW_CAMERA_CONTROL_EVENT',
} as const;

export type MetaGlassesCameraValidationCode =
  (typeof META_GLASSES_CAMERA_ERROR_CODES)[keyof typeof META_GLASSES_CAMERA_ERROR_CODES];

export type MetaGlassesCameraRequirementKind = 'photo' | 'video_stream';
export type MetaGlassesCameraInteraction = 'capture_photo' | 'start_video_stream' | 'stop_video_stream';
export type MetaGlassesCameraState = 'mock' | 'unsupported' | 'ready' | 'degraded';
export type MetaGlassesCameraReceiptStage =
  | 'capture_request'
  | 'capture_result'
  | 'fallback'
  | 'denial'
  | 'error';
export type MetaGlassesCameraOutcome = 'accepted' | 'fallback' | 'denied' | 'error';

export interface MetaGlassesCameraRequirement {
  requirement_id: string;
  kind: MetaGlassesCameraRequirementKind;
  capability: Extract<MetaGlassesIOCapabilityKind, 'camera.photo_capture' | 'camera.video_capture'>;
  permission_scope: Extract<MetaGlassesIOPermissionScope, 'meta_glasses.camera.photo' | 'meta_glasses.camera.video'>;
  required: boolean;
  storage: {
    ipfs_enabled: boolean;
    retention_policy: MetaGlassesIOPayloadRef['retention_policy'];
  };
  accepted_media_types: string[];
}

export interface MetaGlassesCameraActionBinding {
  binding_id: string;
  app_id: string;
  action_id: string;
  interaction: MetaGlassesCameraInteraction;
  requirement_id: string;
  input_event: string;
  output_event: string;
}

export interface MetaGlassesCameraReadiness {
  state: MetaGlassesCameraState;
  io_readiness: MetaGlassesIOReadiness;
  mock: boolean;
  reason: string;
  route_id?: string;
}

export interface MetaGlassesCameraDescriptor {
  profile: typeof META_GLASSES_CAMERA_ADAPTER_PROFILE;
  profile_version: typeof META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION;
  io_profile: typeof META_GLASSES_IO_PROFILE;
  io_profile_version: typeof META_GLASSES_IO_PROFILE_VERSION;
  app_id: string;
  requirements: MetaGlassesCameraRequirement[];
  bindings: MetaGlassesCameraActionBinding[];
  readiness: MetaGlassesCameraReadiness[];
}

export interface MetaGlassesCameraAppDescriptor extends InterfaceDescriptor {
  [META_GLASSES_CAMERA_ADAPTER_PROPERTY]: MetaGlassesCameraDescriptor;
}

export interface MetaGlassesCameraPolicyInput {
  explicit_user_permission: boolean;
  granted_scopes: MetaGlassesIOPermissionScope[];
  outcome: MetaGlassesIOPolicyDecision['outcome'];
  reasons?: string[];
}

export interface MetaGlassesCameraCaptureRequest {
  request_id: string;
  app_id: string;
  binding_id: string;
  interaction: MetaGlassesCameraInteraction;
  correlation_id: string;
  policy: MetaGlassesCameraPolicyInput;
  storage_enabled: boolean;
  mock?: boolean;
  bridge?: MetaGlassesIOBridgeEnvelope;
  force_error?: string;
}

export interface MetaGlassesCameraReceipt {
  receipt_id: string;
  receipt_cid: string;
  stage: MetaGlassesCameraReceiptStage;
  correlation_id: string;
  parent_receipt_cids: string[];
  payload_refs: MetaGlassesIOPayloadRef[];
  policy_decision_id?: string;
}

export interface MetaGlassesCameraControlPlaneEvent {
  event_type: string;
  capability: MetaGlassesCameraRequirement['capability'];
  app_id: string;
  binding_id: string;
  action_id: string;
  correlation_id: string;
  payload_refs: MetaGlassesIOPayloadRef[];
  policy: MetaGlassesIOPolicyDecision;
  peer_session?: MetaGlassesIOPeerSession;
  route: {
    route_id: string;
    selected_surface: 'dat-native' | 'simulator' | 'mobile-fallback' | 'mcp-bridge';
    readiness: MetaGlassesIOReadiness;
    bridge_envelope_id?: string;
  };
  receipt: MetaGlassesCameraReceipt;
}

export interface MetaGlassesCameraCaptureResult {
  outcome: MetaGlassesCameraOutcome;
  readiness: MetaGlassesCameraReadiness;
  policy: MetaGlassesIOPolicyDecision;
  payload_refs: MetaGlassesIOPayloadRef[];
  control_event: MetaGlassesCameraControlPlaneEvent;
  receipts: MetaGlassesCameraReceipt[];
  bridge?: MetaGlassesIOBridgeEnvelope;
  error?: string;
}

export interface MetaGlassesCameraValidationIssue {
  code: MetaGlassesCameraValidationCode;
  path: string;
  message: string;
}

export interface MetaGlassesCameraValidationResult {
  conformant: boolean;
  errors: MetaGlassesCameraValidationIssue[];
  warnings: MetaGlassesCameraValidationIssue[];
}

export function createMetaGlassesCameraDescriptor(
  appId = 'swissknife.meta-glasses.camera',
): MetaGlassesCameraAppDescriptor {
  const requirements: MetaGlassesCameraRequirement[] = [
    cameraRequirement('photo', true, true),
    cameraRequirement('video_stream', false, false),
  ];
  const bindings: MetaGlassesCameraActionBinding[] = [
    cameraBinding(appId, requirements[0], 'camera.capturePhoto', 'capture_photo'),
    cameraBinding(appId, requirements[1], 'camera.startVideoStream', 'start_video_stream'),
    cameraBinding(appId, requirements[1], 'camera.stopVideoStream', 'stop_video_stream'),
  ];

  return {
    name: 'Meta glasses camera app descriptors',
    namespace: 'handsfree.meta-glasses.camera',
    version: META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION,
    methods: bindings.map(binding => ({
      name: binding.action_id,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    })),
    errors: [
      { name: META_GLASSES_CAMERA_ERROR_CODES.PERMISSION },
      { name: META_GLASSES_CAMERA_ERROR_CODES.POLICY },
      { name: META_GLASSES_CAMERA_ERROR_CODES.ROUTE },
    ],
    requires: ['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session'],
    compatibility: { compatibleWith: [] },
    semanticTags: ['meta-glasses', 'camera', 'mcp++'],
    observability: { trace: true, provenance: true },
    interactionPatterns: { requestResponse: true, eventStreams: true },
    [META_GLASSES_CAMERA_ADAPTER_PROPERTY]: {
      profile: META_GLASSES_CAMERA_ADAPTER_PROFILE,
      profile_version: META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION,
      io_profile: META_GLASSES_IO_PROFILE,
      io_profile_version: META_GLASSES_IO_PROFILE_VERSION,
      app_id: appId,
      requirements,
      bindings,
      readiness: [
        { state: 'mock', io_readiness: 'ready', mock: true, reason: 'hardware-free fixture route' },
        { state: 'ready', io_readiness: 'ready', mock: false, reason: 'DAT camera route ready' },
        { state: 'degraded', io_readiness: 'degraded', mock: false, reason: 'stream quality degraded' },
        { state: 'unsupported', io_readiness: 'unsupported', mock: false, reason: 'camera route unsupported' },
      ],
    },
  };
}

export function createMetaGlassesCameraBridgeEnvelope(
  requirementKind: MetaGlassesCameraRequirementKind,
  input: Partial<Parameters<typeof createMetaGlassesIOBridgeEnvelope>[0]> = {},
): MetaGlassesIOBridgeEnvelope {
  const capability = capabilityForRequirement(requirementKind);
  return createMetaGlassesIOBridgeEnvelope({
    raw_transport: 'wifi',
    bridge_provider: 'display-webapp',
    capability,
    app_binding_id: `${capability}.binding`,
    correlation_id: `corr-${capability.replace('.', '-')}`,
    ...input,
  });
}

export function requestMetaGlassesCameraCapture(
  descriptor: MetaGlassesCameraAppDescriptor,
  request: MetaGlassesCameraCaptureRequest,
): MetaGlassesCameraCaptureResult {
  const camera = descriptor[META_GLASSES_CAMERA_ADAPTER_PROPERTY];
  const binding = camera.bindings.find(item => item.binding_id === request.binding_id);
  const requirement = binding
    ? camera.requirements.find(item => item.requirement_id === binding.requirement_id)
    : undefined;
  const fallbackReceipt = receipt('fallback', request.correlation_id, [], [], undefined);

  if (!binding || !requirement) {
    return terminalResult(
      'error',
      request,
      fallbackReceipt,
      policyDecision('deny', [], ['camera binding is not declared']),
      [],
      undefined,
      'camera binding is not declared',
    );
  }

  const routeReadiness = readinessForRequest(request, requirement);
  const policy = policyDecision(
    request.policy.outcome,
    [requirement.permission_scope, 'meta_glasses.control.route'],
    request.policy.reasons ?? ['camera request evaluated by app policy'],
    request.policy.granted_scopes,
  );
  const requestReceipt = receipt('capture_request', request.correlation_id, [], [], policy);

  if (request.force_error) {
    const errorReceipt = receipt('error', request.correlation_id, [requestReceipt.receipt_cid], [], policy);
    return terminalResult('error', request, errorReceipt, policy, [], requirement, request.force_error, [
      requestReceipt,
      errorReceipt,
    ], binding, routeReadiness);
  }

  if (!request.policy.explicit_user_permission || !hasScope(request.policy.granted_scopes, requirement.permission_scope)) {
    const denialPolicy = policyDecision(
      'deny',
      [requirement.permission_scope, 'meta_glasses.control.route'],
      ['explicit camera permission or required scope is missing'],
      request.policy.granted_scopes,
    );
    const denialReceipt = receipt('denial', request.correlation_id, [requestReceipt.receipt_cid], [], denialPolicy);
    return terminalResult('denied', request, denialReceipt, denialPolicy, [], requirement, undefined, [
      requestReceipt,
      denialReceipt,
    ], binding, routeReadiness);
  }

  if (policy.outcome === 'deny' || policy.outcome === 'require_confirmation') {
    const denialReceipt = receipt('denial', request.correlation_id, [requestReceipt.receipt_cid], [], policy);
    return terminalResult('denied', request, denialReceipt, policy, [], requirement, undefined, [
      requestReceipt,
      denialReceipt,
    ], binding, routeReadiness);
  }

  if (policy.outcome === 'fallback' || routeReadiness.state === 'unsupported' || routeReadiness.state === 'degraded') {
    const fallbackPolicy = policy.outcome === 'fallback'
      ? policy
      : policyDecision('fallback', policy.required_scopes, [`camera route is ${routeReadiness.state}`], policy.granted_scopes);
    const fallbackPayloads = payloadRefs(requirement, request, false);
    const routeReceipt = receipt('fallback', request.correlation_id, [requestReceipt.receipt_cid], fallbackPayloads, fallbackPolicy);
    return terminalResult('fallback', request, routeReceipt, fallbackPolicy, fallbackPayloads, requirement, undefined, [
      requestReceipt,
      routeReceipt,
    ], binding, routeReadiness);
  }

  const payloads = payloadRefs(requirement, request, request.storage_enabled && requirement.storage.ipfs_enabled);
  const resultReceipt = receipt('capture_result', request.correlation_id, [requestReceipt.receipt_cid], payloads, policy);
  return terminalResult('accepted', request, resultReceipt, policy, payloads, requirement, undefined, [
    requestReceipt,
    resultReceipt,
  ], binding, routeReadiness);
}

export function validateMetaGlassesCameraDescriptor(
  descriptor: MetaGlassesCameraAppDescriptor,
): MetaGlassesCameraValidationResult {
  const errors: MetaGlassesCameraValidationIssue[] = [];
  const camera = descriptor[META_GLASSES_CAMERA_ADAPTER_PROPERTY];
  const push = (code: MetaGlassesCameraValidationCode, path: string, message: string): void => {
    errors.push({ code, path, message });
  };

  if (
    !camera
    || camera.profile !== META_GLASSES_CAMERA_ADAPTER_PROFILE
    || camera.profile_version !== META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION
    || camera.io_profile !== META_GLASSES_IO_PROFILE
    || camera.io_profile_version !== META_GLASSES_IO_PROFILE_VERSION
  ) {
    push(META_GLASSES_CAMERA_ERROR_CODES.DESCRIPTOR, META_GLASSES_CAMERA_ADAPTER_PROPERTY, 'Camera descriptor profile metadata is required.');
    return { conformant: false, errors, warnings: [] };
  }

  for (const kind of ['photo', 'video_stream'] satisfies MetaGlassesCameraRequirementKind[]) {
    const requirement = camera.requirements.find(item => item.kind === kind);
    if (!requirement) {
      push(META_GLASSES_CAMERA_ERROR_CODES.REQUIREMENT, 'requirements', `Missing camera requirement: ${kind}.`);
    } else if (
      requirement.capability !== capabilityForRequirement(kind)
      || requirement.permission_scope !== permissionScopeForRequirement(kind)
      || requirement.accepted_media_types.length === 0
    ) {
      push(META_GLASSES_CAMERA_ERROR_CODES.REQUIREMENT, `requirements.${kind}`, 'Requirement capability, permission, and media types must align.');
    }
  }

  if (camera.bindings.length === 0) {
    push(META_GLASSES_CAMERA_ERROR_CODES.BINDING, 'bindings', 'At least one camera app action binding is required.');
  }

  for (const binding of camera.bindings) {
    const requirement = camera.requirements.find(item => item.requirement_id === binding.requirement_id);
    if (!requirement || binding.app_id !== camera.app_id || !binding.action_id || !binding.output_event) {
      push(META_GLASSES_CAMERA_ERROR_CODES.BINDING, `bindings.${binding.binding_id}`, 'Binding must connect an app action to a camera requirement.');
    }
  }

  for (const state of ['mock', 'unsupported', 'ready', 'degraded'] satisfies MetaGlassesCameraState[]) {
    if (!camera.readiness.some(item => item.state === state)) {
      push(META_GLASSES_CAMERA_ERROR_CODES.ROUTE, 'readiness', `Missing readiness state: ${state}.`);
    }
  }

  return { conformant: errors.length === 0, errors, warnings: [] };
}

export function validateMetaGlassesCameraCaptureResult(
  result: MetaGlassesCameraCaptureResult,
): MetaGlassesCameraValidationResult {
  const errors: MetaGlassesCameraValidationIssue[] = [];
  const push = (code: MetaGlassesCameraValidationCode, path: string, message: string): void => {
    errors.push({ code, path, message });
  };

  if (!result.policy.decision_id || !Array.isArray(result.policy.required_scopes)) {
    push(META_GLASSES_CAMERA_ERROR_CODES.POLICY, 'policy', 'Policy decision metadata is required.');
  }
  if (result.outcome === 'accepted' && result.payload_refs.length === 0) {
    push(META_GLASSES_CAMERA_ERROR_CODES.PAYLOAD, 'payload_refs', 'Accepted camera captures require payload references.');
  }
  if (result.payload_refs.some(ref => !isCID(ref.cid) || !ref.media_type || !ref.retention_policy)) {
    push(META_GLASSES_CAMERA_ERROR_CODES.PAYLOAD, 'payload_refs', 'Payload references must be content addressed and typed.');
  }
  if (
    result.receipts.length === 0
    || result.receipts.some(item => !isCID(item.receipt_cid) || !item.correlation_id)
  ) {
    push(META_GLASSES_CAMERA_ERROR_CODES.RECEIPT, 'receipts', 'MCP++ receipts require CIDs and correlation ids.');
  }
  if (
    !result.control_event?.event_type
    || result.control_event.correlation_id !== result.receipts[result.receipts.length - 1]?.correlation_id
    || result.control_event.payload_refs.length !== result.payload_refs.length
  ) {
    push(META_GLASSES_CAMERA_ERROR_CODES.CONTROL_EVENT, 'control_event', 'Control-plane event must carry normalized payload refs and correlation metadata.');
  }

  return { conformant: errors.length === 0, errors, warnings: [] };
}

function cameraRequirement(
  kind: MetaGlassesCameraRequirementKind,
  required: boolean,
  ipfsEnabled: boolean,
): MetaGlassesCameraRequirement {
  return {
    requirement_id: `camera.${kind}`,
    kind,
    capability: capabilityForRequirement(kind),
    permission_scope: permissionScopeForRequirement(kind),
    required,
    storage: {
      ipfs_enabled: ipfsEnabled,
      retention_policy: ipfsEnabled ? 'policy_controlled' : 'session',
    },
    accepted_media_types: kind === 'photo' ? ['image/jpeg'] : ['video/h264', 'video/mp4'],
  };
}

function cameraBinding(
  appId: string,
  requirement: MetaGlassesCameraRequirement,
  actionId: string,
  interaction: MetaGlassesCameraInteraction,
): MetaGlassesCameraActionBinding {
  return {
    binding_id: `${requirement.capability}.${interaction}.binding`,
    app_id: appId,
    action_id: actionId,
    interaction,
    requirement_id: requirement.requirement_id,
    input_event: `${actionId}.requested`,
    output_event: `${actionId}.completed`,
  };
}

function readinessForRequest(
  request: MetaGlassesCameraCaptureRequest,
  requirement: MetaGlassesCameraRequirement,
): MetaGlassesCameraReadiness {
  if (request.mock) {
    return { state: 'mock', io_readiness: 'ready', mock: true, reason: 'hardware-free camera mock selected' };
  }
  const ioReadiness = request.bridge?.route.readiness ?? 'ready';
  if (ioReadiness === 'unsupported') {
    return { state: 'unsupported', io_readiness: ioReadiness, mock: false, reason: 'bridge reported unsupported camera route' };
  }
  if (ioReadiness !== 'ready') {
    return { state: 'degraded', io_readiness: ioReadiness, mock: false, reason: `bridge reported ${ioReadiness}`, route_id: request.bridge?.route.route_decision_id };
  }
  return { state: 'ready', io_readiness: ioReadiness, mock: false, reason: `${requirement.capability} route ready`, route_id: request.bridge?.route.route_decision_id };
}

function terminalResult(
  outcome: MetaGlassesCameraOutcome,
  request: MetaGlassesCameraCaptureRequest,
  finalReceipt: MetaGlassesCameraReceipt,
  policy: MetaGlassesIOPolicyDecision,
  payloads: MetaGlassesIOPayloadRef[],
  requirement?: MetaGlassesCameraRequirement,
  error?: string,
  receipts: MetaGlassesCameraReceipt[] = [finalReceipt],
  binding?: MetaGlassesCameraActionBinding,
  readiness: MetaGlassesCameraReadiness = { state: 'unsupported', io_readiness: 'unsupported', mock: false, reason: 'request could not be routed' },
): MetaGlassesCameraCaptureResult {
  const capability = requirement?.capability ?? 'camera.photo_capture';
  const selectedSurface = outcome === 'fallback' ? 'mobile-fallback' : request.mock ? 'simulator' : 'dat-native';
  const peerSession = peerSessionFromBridge(request.bridge);
  const controlEvent: MetaGlassesCameraControlPlaneEvent = {
    event_type: `meta_glasses.camera.${finalReceipt.stage}`,
    capability,
    app_id: request.app_id,
    binding_id: request.binding_id,
    action_id: binding?.action_id ?? request.interaction,
    correlation_id: request.correlation_id,
    payload_refs: payloads,
    policy,
    peer_session: peerSession,
    route: {
      route_id: request.bridge?.route.route_decision_id ?? `${capability}.${outcome}`,
      selected_surface: selectedSurface,
      readiness: readiness.io_readiness,
      bridge_envelope_id: request.bridge?.envelope_id,
    },
    receipt: finalReceipt,
  };

  return {
    outcome,
    readiness,
    policy,
    payload_refs: payloads,
    control_event: controlEvent,
    receipts,
    bridge: request.bridge,
    error,
  };
}

function payloadRefs(
  requirement: MetaGlassesCameraRequirement,
  request: MetaGlassesCameraCaptureRequest,
  ipfsEnabled: boolean,
): MetaGlassesIOPayloadRef[] {
  const mediaType = requirement.kind === 'photo' ? 'image/jpeg' : 'video/h264';
  const cid = computeCID(`${request.request_id}:${request.correlation_id}:${requirement.kind}:${ipfsEnabled ? 'ipfs' : 'session'}`);
  return [
    {
      cid,
      purpose: requirement.kind === 'photo' ? 'photo' : 'video',
      media_type: mediaType,
      size_bytes: requirement.kind === 'photo' ? 512_000 : 4_194_304,
      retention_policy: ipfsEnabled ? 'pinned' : requirement.storage.retention_policy,
      redaction: 'privacy_filtered',
    },
  ];
}

function receipt(
  stage: MetaGlassesCameraReceiptStage,
  correlationId: string,
  parentReceiptCids: string[],
  payloadRefs: MetaGlassesIOPayloadRef[],
  policy?: MetaGlassesIOPolicyDecision,
): MetaGlassesCameraReceipt {
  const receiptCid = computeCID(JSON.stringify({
    stage,
    correlationId,
    parentReceiptCids,
    payloadRefs: payloadRefs.map(ref => ref.cid),
    policy: policy?.decision_id,
  }));
  return {
    receipt_id: `mcp++-camera-${stage}-${correlationId}`,
    receipt_cid: receiptCid,
    stage,
    correlation_id: correlationId,
    parent_receipt_cids: parentReceiptCids,
    payload_refs: payloadRefs,
    policy_decision_id: policy?.decision_id,
  };
}

function policyDecision(
  outcome: MetaGlassesIOPolicyDecision['outcome'],
  requiredScopes: MetaGlassesIOPermissionScope[],
  reasons: string[],
  grantedScopes: MetaGlassesIOPermissionScope[] = outcome === 'deny' ? [] : requiredScopes,
): MetaGlassesIOPolicyDecision {
  const decisionId = `camera-${outcome}-${computeCID(JSON.stringify({ requiredScopes, reasons })).slice(7, 19)}`;
  const decisionCid = computeCID(JSON.stringify({ decisionId, outcome, requiredScopes, grantedScopes, reasons }));
  return {
    decision_id: decisionId,
    outcome,
    reasons,
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

function capabilityForRequirement(
  kind: MetaGlassesCameraRequirementKind,
): MetaGlassesCameraRequirement['capability'] {
  return kind === 'photo' ? 'camera.photo_capture' : 'camera.video_capture';
}

function permissionScopeForRequirement(
  kind: MetaGlassesCameraRequirementKind,
): MetaGlassesCameraRequirement['permission_scope'] {
  return kind === 'photo' ? 'meta_glasses.camera.photo' : 'meta_glasses.camera.video';
}

function hasScope(scopes: MetaGlassesIOPermissionScope[], scope: MetaGlassesIOPermissionScope): boolean {
  return scopes.includes(scope);
}

function isCID(value: string | undefined): boolean {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

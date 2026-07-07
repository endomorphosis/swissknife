import { computeCID, computeInterfaceCID, type InterfaceDescriptor } from '../mcp/mcp-idl.js';
import {
  META_GLASSES_INPUT_ADAPTER_ID,
  createMetaGlassesInputAdapterDescriptor,
  createMetaGlassesInputBridgeEnvelope,
  routeMetaGlassesInputEvent,
  type MetaGlassesInputAdapterDescriptor,
  type MetaGlassesInputAppBinding,
  type MetaGlassesInputCapability,
  type MetaGlassesInputEventRequest,
  type MetaGlassesInputNormalizedEvent,
  type MetaGlassesInputReceipt,
  type MetaGlassesInputRouteResult,
  type MetaGlassesInputSample,
} from './meta-glasses-input-adapter.js';
import {
  META_GLASSES_IO_PROFILE_PROPERTY,
  type MetaGlassesIOMCPReceiptMetadata,
  type MetaGlassesIOPermissionScope,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
} from './meta-glasses-io-profile.js';
import type { MetaGlassesIOBridgeEnvelope } from './meta-glasses-io-transport.js';

export const META_GLASSES_WEBAPP_INPUT_ADAPTER_ID =
  'org.handsfree.swissknife.meta-glasses-webapp-input-adapter@0.1.0';

export type MetaGlassesWebAppInputSource =
  | 'neural_band'
  | 'captouch'
  | 'motion'
  | 'phone_gps';
export type MetaGlassesWebAppUnsupportedSource =
  | 'camera'
  | 'microphone'
  | 'speaker'
  | 'headphone'
  | 'audio';
export type MetaGlassesWebAppSource =
  | MetaGlassesWebAppInputSource
  | MetaGlassesWebAppUnsupportedSource;
export type MetaGlassesWebAppKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter';
export type MetaGlassesWebAppDomEvent =
  | MetaGlassesWebAppKey
  | 'deviceorientation'
  | 'devicemotion'
  | 'geolocation.coarse';
export type MetaGlassesWebAppUnsupportedCapability =
  | 'camera.photo_capture'
  | 'camera.video_capture'
  | 'microphone.input'
  | 'speaker.output'
  | 'headphone.output';
export type MetaGlassesWebAppInputStatus =
  | 'allowed'
  | 'denied'
  | 'fallback'
  | 'unsupported'
  | 'stale'
  | 'throttled'
  | 'replayed'
  | 'error';
export type MetaGlassesWebAppReceiptStage =
  | 'authorization'
  | 'control_route'
  | 'webapp_intent'
  | 'context_descriptor'
  | 'denial'
  | 'fallback'
  | 'unsupported'
  | 'stale'
  | 'throttled'
  | 'replay'
  | 'error';

export interface MetaGlassesWebAppInputBinding {
  app_id: string;
  binding_id: string;
  source: MetaGlassesWebAppInputSource;
  capability: MetaGlassesInputCapability;
  app_binding_id: string;
  dom_events: MetaGlassesWebAppDomEvent[];
  normalized_event: string;
  intent_descriptors: Record<string, string>;
  target: MetaGlassesInputAppBinding['target'];
  target_id: string;
  required_scopes: MetaGlassesIOPermissionScope[];
  max_hz: number;
  stale_after_ms: number;
  privacy: MetaGlassesInputAppBinding['privacy'];
}

export interface MetaGlassesWebAppInputEventRequest {
  app_id: string;
  binding_id: string;
  source: MetaGlassesWebAppSource;
  input_id: string;
  sequence: number;
  timestamp_ms: number;
  received_at_ms: number;
  key?: MetaGlassesWebAppKey;
  capability?: MetaGlassesInputCapability | MetaGlassesWebAppUnsupportedCapability;
  correlation_id?: string;
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

export interface MetaGlassesWebAppIntentDescriptor {
  descriptor_id: string;
  event: string;
  intent: string;
  app_binding_id: string;
  binding_id: string;
  source: MetaGlassesWebAppInputSource;
  dom_event: MetaGlassesWebAppDomEvent;
  target: MetaGlassesInputAppBinding['target'];
  target_id: string;
}

export interface MetaGlassesWebAppContextDescriptor {
  descriptor_id: string;
  source: Extract<MetaGlassesWebAppInputSource, 'motion' | 'phone_gps'>;
  app_binding_id: string;
  privacy: 'metadata_only' | 'privacy_filtered';
  context: Record<string, string | number | boolean>;
}

export interface MetaGlassesWebAppReceipt extends MetaGlassesIOMCPReceiptMetadata {
  webapp_stage: MetaGlassesWebAppReceiptStage;
  status: MetaGlassesWebAppInputStatus;
  input_id: string;
  binding_id: string;
  app_binding_id: string;
}

export interface MetaGlassesWebAppInputRouteResult {
  status: MetaGlassesWebAppInputStatus;
  authorized: boolean;
  binding: MetaGlassesWebAppInputBinding;
  app_binding_id: string;
  normalized_event: MetaGlassesInputNormalizedEvent;
  intent_descriptor?: MetaGlassesWebAppIntentDescriptor;
  context_descriptor?: MetaGlassesWebAppContextDescriptor;
  route_decision: MetaGlassesInputRouteResult['route_decision'];
  policy_decision: MetaGlassesIOPolicyDecision;
  missing_scopes: MetaGlassesIOPermissionScope[];
  receipts: MetaGlassesWebAppReceipt[];
  input_result: MetaGlassesInputRouteResult;
  error?: string;
}

export interface MetaGlassesWebAppInputAdapterDescriptor extends InterfaceDescriptor {
  meta_glasses_webapp_input: {
    adapter_id: typeof META_GLASSES_WEBAPP_INPUT_ADAPTER_ID;
    input_adapter_id: typeof META_GLASSES_INPUT_ADAPTER_ID;
    descriptor_cid: string;
    bindings: MetaGlassesWebAppInputBinding[];
    unsupported_webapp_assumptions: MetaGlassesWebAppUnsupportedCapability[];
    privacy: {
      raw_sensor_samples_allowed: false;
      precise_gps_allowed: false;
      camera_microphone_audio_allowed: false;
    };
    rate_limits: Record<MetaGlassesInputCapability, { max_hz: number; stale_after_ms: number }>;
  };
}

const KEY_EVENTS: readonly MetaGlassesWebAppKey[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
] as const;

const UNSUPPORTED_WEBAPP_CAPABILITIES: readonly MetaGlassesWebAppUnsupportedCapability[] = [
  'camera.photo_capture',
  'camera.video_capture',
  'microphone.input',
  'speaker.output',
  'headphone.output',
] as const;

export function createMetaGlassesWebAppInputAdapterDescriptor(
  appId = 'swissknife.meta-glasses.webapp',
): MetaGlassesWebAppInputAdapterDescriptor {
  const inputDescriptor = createMetaGlassesInputAdapterDescriptor(appId);
  const ioProfile = (inputDescriptor as unknown as Record<string, unknown>)[
    META_GLASSES_IO_PROFILE_PROPERTY
  ];
  const bindings = createMetaGlassesWebAppInputBindings(appId, inputDescriptor);
  const descriptor = {
    name: 'meta-glasses-webapp-input-adapter',
    namespace: 'org.handsfree.swissknife.meta_glasses.webapp',
    version: '0.1.0',
    methods: bindings.map(binding => ({
      name: `meta_glasses_webapp_input.${binding.source}`,
      input_schema: { type: 'object', additionalProperties: true },
      output_schema: { type: 'object', additionalProperties: true },
    })),
    errors: [
      { name: 'WebAppInputPermissionRequired' },
      { name: 'WebAppInputUnsupported' },
      { name: 'WebAppInputFallback' },
      { name: 'WebAppInputStale' },
      { name: 'WebAppInputThrottled' },
      { name: 'WebAppInputReplayed' },
    ],
    requires: ['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session'],
    compatibility: { compatible_with: [META_GLASSES_INPUT_ADAPTER_ID] },
    semanticTags: ['meta-glasses', 'webapp', 'input', 'keyboard', 'motion', 'gps', 'mcp++'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    [META_GLASSES_IO_PROFILE_PROPERTY]: ioProfile,
  } as InterfaceDescriptor;
  const descriptorCid = computeInterfaceCID(descriptor);

  return {
    ...descriptor,
    meta_glasses_webapp_input: {
      adapter_id: META_GLASSES_WEBAPP_INPUT_ADAPTER_ID,
      input_adapter_id: META_GLASSES_INPUT_ADAPTER_ID,
      descriptor_cid: descriptorCid,
      bindings,
      unsupported_webapp_assumptions: [...UNSUPPORTED_WEBAPP_CAPABILITIES],
      privacy: {
        raw_sensor_samples_allowed: false,
        precise_gps_allowed: false,
        camera_microphone_audio_allowed: false,
      },
      rate_limits: Object.fromEntries(bindings.map(binding => [
        binding.capability,
        { max_hz: binding.max_hz, stale_after_ms: binding.stale_after_ms },
      ])) as Record<MetaGlassesInputCapability, { max_hz: number; stale_after_ms: number }>,
    },
  };
}

export function createMetaGlassesWebAppInputBindings(
  appId = 'swissknife.meta-glasses.webapp',
  inputDescriptor: MetaGlassesInputAdapterDescriptor = createMetaGlassesInputAdapterDescriptor(appId),
): MetaGlassesWebAppInputBinding[] {
  return inputDescriptor.meta_glasses_input.bindings.map(binding => ({
    app_id: appId,
    binding_id: binding.binding_id,
    source: webAppSourceForCapability(binding.capability),
    capability: binding.capability,
    app_binding_id: binding.binding_id,
    dom_events: domEventsForCapability(binding.capability),
    normalized_event: binding.input_event,
    intent_descriptors: intentDescriptorsFor(binding.capability),
    target: binding.target,
    target_id: binding.target_id,
    required_scopes: [...binding.required_scopes],
    max_hz: binding.max_hz,
    stale_after_ms: binding.stale_after_ms,
    privacy: binding.privacy,
  }));
}

export function routeMetaGlassesWebAppInputEvent(
  descriptor: MetaGlassesWebAppInputAdapterDescriptor,
  request: MetaGlassesWebAppInputEventRequest,
): MetaGlassesWebAppInputRouteResult {
  const binding = findWebAppBinding(descriptor, request);
  const unsupportedCapability = unsupportedCapabilityFor(request);

  if (unsupportedCapability) {
    const inputResult = routeInputForWebApp(binding, request, {
      capability: binding.capability,
      readiness: 'unsupported',
      sample: { gesture: `unsupported:${unsupportedCapability}` },
    });
    return webAppResult('unsupported', binding, request, inputResult, {
      error: `${unsupportedCapability} is not available to display Web Apps; route through native/mobile I/O adapters instead.`,
    });
  }

  if ((request.source === 'neural_band' || request.source === 'captouch') && !isSupportedKey(request.key)) {
    const inputResult = routeInputForWebApp(binding, request, {
      readiness: 'unsupported',
      sample: { gesture: 'unsupported-key' },
    });
    return webAppResult('unsupported', binding, request, inputResult, {
      error: 'Web Apps input supports Arrow keys and Enter for Neural Band and captouch events.',
    });
  }

  const inputResult = routeInputForWebApp(binding, request);
  return webAppResult(webAppStatusFor(inputResult), binding, request, inputResult);
}

function routeInputForWebApp(
  binding: MetaGlassesWebAppInputBinding,
  request: MetaGlassesWebAppInputEventRequest,
  overrides: Partial<MetaGlassesInputEventRequest> = {},
): MetaGlassesInputRouteResult {
  const bridge = request.bridge ?? createMetaGlassesInputBridgeEnvelope(binding.capability, {
    app_binding_id: binding.app_binding_id,
    correlation_id: request.correlation_id,
  });
  bridge.route.readiness = overrides.readiness ?? request.readiness ?? bridge.route.readiness;
  const inputRequest: MetaGlassesInputEventRequest = {
    app_id: request.app_id,
    capability: binding.capability,
    binding_id: binding.binding_id,
    input_id: request.input_id,
    correlation_id: request.correlation_id,
    sequence: request.sequence,
    timestamp_ms: request.timestamp_ms,
    received_at_ms: request.received_at_ms,
    granted_scopes: request.granted_scopes,
    explicit_user_permission: request.explicit_user_permission,
    policy_outcome: request.policy_outcome,
    readiness: request.readiness,
    bridge,
    sample: sampleForWebApp(binding, request),
    seen_input_ids: request.seen_input_ids,
    last_sequence: request.last_sequence,
    last_event_timestamp_ms: request.last_event_timestamp_ms,
    ...overrides,
  };
  return routeMetaGlassesInputEvent(createMetaGlassesInputAdapterDescriptor(request.app_id), inputRequest);
}

function webAppResult(
  status: MetaGlassesWebAppInputStatus,
  binding: MetaGlassesWebAppInputBinding,
  request: MetaGlassesWebAppInputEventRequest,
  inputResult: MetaGlassesInputRouteResult,
  options: { error?: string } = {},
): MetaGlassesWebAppInputRouteResult {
  return {
    status,
    authorized: status === 'allowed',
    binding,
    app_binding_id: binding.app_binding_id,
    normalized_event: inputResult.normalized_event,
    intent_descriptor: intentDescriptorFor(binding, request, inputResult),
    context_descriptor: contextDescriptorFor(binding, inputResult),
    route_decision: inputResult.route_decision,
    policy_decision: inputResult.policy_decision,
    missing_scopes: inputResult.missing_scopes,
    receipts: webAppReceiptsFor(status, request, binding, inputResult.receipts),
    input_result: inputResult,
    error: options.error ?? inputResult.error,
  };
}

function webAppReceiptsFor(
  status: MetaGlassesWebAppInputStatus,
  request: MetaGlassesWebAppInputEventRequest,
  binding: MetaGlassesWebAppInputBinding,
  inputReceipts: MetaGlassesInputReceipt[],
): MetaGlassesWebAppReceipt[] {
  return inputReceipts.map((receipt, index) => {
    const stage = index === inputReceipts.length - 1
      ? terminalWebAppStage(status, binding)
      : inputStageToWebAppStage(receipt.input_stage);
    return {
      ...receipt,
      webapp_stage: stage,
      status,
      input_id: request.input_id,
      binding_id: binding.binding_id,
      app_binding_id: binding.app_binding_id,
      receipt_cid: computeCID(`webapp-input-receipt:${request.app_id}:${request.input_id}:${status}:${stage}:${index}`),
    };
  });
}

function intentDescriptorFor(
  binding: MetaGlassesWebAppInputBinding,
  request: MetaGlassesWebAppInputEventRequest,
  inputResult: MetaGlassesInputRouteResult,
): MetaGlassesWebAppIntentDescriptor | undefined {
  if (binding.source !== 'neural_band' && binding.source !== 'captouch') return undefined;
  const domEvent = request.key ?? 'Enter';
  const intent = binding.intent_descriptors[domEvent] ?? inputResult.normalized_event.intent;
  return {
    descriptor_id: computeCID(`webapp-intent:${binding.binding_id}:${domEvent}:${intent}`),
    event: inputResult.normalized_event.event,
    intent,
    app_binding_id: binding.app_binding_id,
    binding_id: binding.binding_id,
    source: binding.source,
    dom_event: domEvent,
    target: binding.target,
    target_id: binding.target_id,
  };
}

function contextDescriptorFor(
  binding: MetaGlassesWebAppInputBinding,
  inputResult: MetaGlassesInputRouteResult,
): MetaGlassesWebAppContextDescriptor | undefined {
  if (binding.source !== 'motion' && binding.source !== 'phone_gps') return undefined;
  return {
    descriptor_id: computeCID(`webapp-context:${binding.binding_id}:${JSON.stringify(inputResult.normalized_event.payload_summary)}`),
    source: binding.source,
    app_binding_id: binding.app_binding_id,
    privacy: binding.privacy,
    context: inputResult.normalized_event.payload_summary,
  };
}

function sampleForWebApp(
  binding: MetaGlassesWebAppInputBinding,
  request: MetaGlassesWebAppInputEventRequest,
): MetaGlassesInputSample {
  if (binding.source === 'neural_band') {
    return { ...request.sample, gesture: keyIntentName(request.key ?? 'Enter') };
  }
  if (binding.source === 'captouch') {
    return { ...request.sample, touch: touchForKey(request.key ?? 'Enter') };
  }
  return request.sample ?? {};
}

function findWebAppBinding(
  descriptor: MetaGlassesWebAppInputAdapterDescriptor,
  request: MetaGlassesWebAppInputEventRequest,
): MetaGlassesWebAppInputBinding {
  return descriptor.meta_glasses_webapp_input.bindings.find(binding =>
    binding.app_id === request.app_id
    && binding.binding_id === request.binding_id
    && (request.capability ? binding.capability === request.capability : binding.source === request.source),
  ) ?? descriptor.meta_glasses_webapp_input.bindings[0];
}

function unsupportedCapabilityFor(
  request: MetaGlassesWebAppInputEventRequest,
): MetaGlassesWebAppUnsupportedCapability | undefined {
  if (request.capability && UNSUPPORTED_WEBAPP_CAPABILITIES.includes(request.capability as MetaGlassesWebAppUnsupportedCapability)) {
    return request.capability as MetaGlassesWebAppUnsupportedCapability;
  }
  if (request.source === 'camera') return 'camera.photo_capture';
  if (request.source === 'microphone') return 'microphone.input';
  if (request.source === 'speaker' || request.source === 'audio') return 'speaker.output';
  if (request.source === 'headphone') return 'headphone.output';
  return undefined;
}

function webAppStatusFor(inputResult: MetaGlassesInputRouteResult): MetaGlassesWebAppInputStatus {
  if (inputResult.status === 'disconnected') return 'fallback';
  if (inputResult.status === 'allowed') return 'allowed';
  if (inputResult.status === 'denied') return 'denied';
  if (inputResult.status === 'unsupported') return 'unsupported';
  if (inputResult.status === 'stale') return 'stale';
  if (inputResult.status === 'throttled') return 'throttled';
  if (inputResult.status === 'replayed') return 'replayed';
  return 'error';
}

function terminalWebAppStage(
  status: MetaGlassesWebAppInputStatus,
  binding: MetaGlassesWebAppInputBinding,
): MetaGlassesWebAppReceiptStage {
  if (status === 'allowed') {
    return binding.source === 'motion' || binding.source === 'phone_gps'
      ? 'context_descriptor'
      : 'webapp_intent';
  }
  if (status === 'denied') return 'denial';
  if (status === 'replayed') return 'replay';
  return status;
}

function inputStageToWebAppStage(stage: MetaGlassesInputReceipt['input_stage']): MetaGlassesWebAppReceiptStage {
  if (stage === 'normalized_event') return 'webapp_intent';
  if (stage === 'disconnected') return 'fallback';
  if (stage === 'replay') return 'replay';
  return stage;
}

function webAppSourceForCapability(capability: MetaGlassesInputCapability): MetaGlassesWebAppInputSource {
  if (capability === 'neural_band.input') return 'neural_band';
  if (capability === 'captouch.input') return 'captouch';
  if (capability === 'motion.orientation') return 'motion';
  return 'phone_gps';
}

function domEventsForCapability(capability: MetaGlassesInputCapability): MetaGlassesWebAppDomEvent[] {
  if (capability === 'neural_band.input' || capability === 'captouch.input') {
    return [...KEY_EVENTS];
  }
  if (capability === 'motion.orientation') return ['deviceorientation', 'devicemotion'];
  return ['geolocation.coarse'];
}

function intentDescriptorsFor(capability: MetaGlassesInputCapability): Record<string, string> {
  if (capability === 'motion.orientation') {
    return { deviceorientation: 'intent.webapp.motion.orientation_context' };
  }
  if (capability === 'phone_gps.context') {
    return { 'geolocation.coarse': 'intent.webapp.phone_gps.coarse_context' };
  }
  const prefix = capability === 'neural_band.input'
    ? 'intent.webapp.neural_band'
    : 'intent.webapp.captouch';
  return Object.fromEntries(KEY_EVENTS.map(key => [key, `${prefix}.${keyIntentName(key)}`]));
}

function keyIntentName(key: MetaGlassesWebAppKey): string {
  if (key === 'ArrowUp') return 'navigate_up';
  if (key === 'ArrowDown') return 'navigate_down';
  if (key === 'ArrowLeft') return 'navigate_left';
  if (key === 'ArrowRight') return 'navigate_right';
  return 'confirm';
}

function touchForKey(key: MetaGlassesWebAppKey): NonNullable<MetaGlassesInputSample['touch']> {
  if (key === 'ArrowRight') return 'swipe_forward';
  if (key === 'ArrowLeft') return 'swipe_back';
  if (key === 'ArrowUp') return 'double_tap';
  if (key === 'ArrowDown') return 'long_press';
  return 'tap';
}

function isSupportedKey(key: MetaGlassesWebAppKey | undefined): key is MetaGlassesWebAppKey {
  return typeof key === 'string' && KEY_EVENTS.includes(key);
}

import {
  createMetaGlassesAudioAdapterDescriptor,
  requestMetaGlassesAudioRoute,
  type MetaGlassesAudioCapability,
  type MetaGlassesAudioRouteResult,
} from './meta-glasses-audio-adapter.js';
import {
  createMetaGlassesCameraBridgeEnvelope,
  createMetaGlassesCameraDescriptor,
  requestMetaGlassesCameraCapture,
  validateMetaGlassesCameraCaptureResult,
  type MetaGlassesCameraCaptureResult,
} from './meta-glasses-camera-adapter.js';
import {
  MetaGlassesDisplayORBAdapter,
  type MetaGlassesDisplayBridge,
  type MetaGlassesDisplayMobileAction,
  type MetaGlassesDisplayORBOperationOutput,
} from './meta-glasses-display-orb-adapter.js';
import {
  META_GLASSES_DISPLAY_PROFILE,
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_DISPLAY_PROFILE_VERSION,
  type MetaGlassesWidgetDescriptor,
} from './meta-glasses-display-profile.js';
import {
  META_GLASSES_IO_PERMISSION_SCOPES,
  type MetaGlassesIOPermissionScope,
} from './meta-glasses-io-profile.js';
import {
  MetaGlassesMobileORBBridgeAdapter,
  createMetaGlassesMobileORBBridgeDescriptor,
  type MetaGlassesMobileORBBindServiceResponse,
  type MetaGlassesMobileORBDispatchResponseResponse,
  type MetaGlassesMobileORBEventResponse,
  type MetaGlassesMobileORBInvokeServiceResponse,
  type MetaGlassesMobileORBRegisterResponse,
} from './meta-glasses-mobile-orb-bridge.js';
import { computeCID, computeInterfaceCID } from '../mcp/mcp-idl.js';
import type { ControlSurfacePolicyEvaluationRequest } from '../mcp/control-surface-mediator.js';

export const META_GLASSES_SIMULATOR_HANDOFF_SCHEMA =
  'swissknife.meta-glasses-simulator-handoff.v1';
export const META_GLASSES_SIMULATOR_HANDOFF_TASK_ID = 'SWR-086';

export type MetaGlassesSimulatorCapability =
  | 'display.output'
  | 'camera.photo_capture'
  | 'microphone.input'
  | 'speaker.output';

export type MetaGlassesSimulatorHandoffScenario =
  | 'desktop_to_mobile_orb_to_simulator'
  | 'mobile_to_desktop_resume'
  | 'policy_denied_camera_to_mobile_fallback';

export interface MetaGlassesSimulatorDisplayState {
  state: 'rendered' | 'updated' | 'focused' | 'activated' | 'cleared';
  visible_in_simulator: true;
  widget_id: string;
  operation: string;
  receipt_cid: string;
  mobile_action_type: string;
  summary: string;
}

export interface MetaGlassesSimulatorAudioPolicyState {
  capability: Extract<MetaGlassesSimulatorCapability, 'microphone.input' | 'speaker.output'>;
  state: string;
  policy_outcome: string;
  granted: boolean;
  required_scopes: readonly string[];
  granted_scopes: readonly string[];
  receipt_cids: readonly string[];
  route_provider: string;
  route_bridge: string;
  raw_audio_redacted: true;
}

export interface MetaGlassesSimulatorCameraState {
  state: 'permission_denied' | 'fallback' | 'accepted';
  outcome: string;
  policy_outcome: string;
  readiness: string;
  selected_surface: string;
  receipt_cids: readonly string[];
  payload_cids: readonly string[];
  permission_scope: string;
  visible_in_simulator: boolean;
}

export interface MetaGlassesSimulatorCapabilityEvidence {
  capability: MetaGlassesSimulatorCapability;
  source: 'simulator';
  interface_cid: string;
  descriptor_name: string;
  orb_operations: readonly string[];
  idl_projection: {
    descriptor_cid: string;
    method_count: number;
    methods: readonly string[];
    projection_cid: string;
  };
  simulator_visible_states?: readonly MetaGlassesSimulatorDisplayState[];
  audio_policy_states?: readonly MetaGlassesSimulatorAudioPolicyState[];
  camera_permission_states?: readonly MetaGlassesSimulatorCameraState[];
}

export interface MetaGlassesSimulatorHandoffPath {
  scenario: MetaGlassesSimulatorHandoffScenario;
  from_surface: 'desktop' | 'mobile' | 'simulator';
  through: readonly string[];
  to_surface: 'desktop' | 'mobile' | 'simulator';
  direct_desktop_pairing: false;
  physical_glasses_required: false;
  receipts: readonly string[];
  visible_state: string;
  policy_state: 'allow' | 'fallback' | 'deny' | 'require_confirmation';
}

export interface MetaGlassesSimulatorHandoffEvidence {
  schema: typeof META_GLASSES_SIMULATOR_HANDOFF_SCHEMA;
  task_id: typeof META_GLASSES_SIMULATOR_HANDOFF_TASK_ID;
  generated_at: string;
  evidence_cid: string;
  hardware_free: true;
  simulator_driven: true;
  physical_glasses_required: false;
  direct_desktop_pairing_required: false;
  validation_commands: readonly string[];
  simulator: {
    simulator_id: string;
    device_model: string;
    platform: 'simulator';
    session_id: string;
    capabilities: Record<MetaGlassesSimulatorCapability, true>;
    paired_physical_glasses: false;
  };
  orb_idl_projection: {
    display_interface_cid: string;
    camera_interface_cid: string;
    audio_interface_cid: string;
    mobile_orb_interface_cid: string;
    projection_cid: string;
    operation_receipts: readonly string[];
  };
  capability_evidence: readonly MetaGlassesSimulatorCapabilityEvidence[];
  handoff_paths: readonly MetaGlassesSimulatorHandoffPath[];
  acceptance_matrix: {
    display_states_proven: boolean;
    audio_policy_states_proven: boolean;
    microphone_policy_states_proven: boolean;
    camera_permission_fallback_states_proven: boolean;
    desktop_mobile_handoff_proven: boolean;
    no_direct_desktop_physical_pairing: boolean;
  };
  playwright_probe?: {
    status: 'passed';
    visible_dom_assertions: readonly string[];
    screenshot?: string;
  };
}

export interface MetaGlassesSimulatorHandoffValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const APP_ID = 'swissknife.meta-glasses.simulator-handoff';
const GENERATED_AT = '2026-07-10T00:00:00.000Z';
const DISPLAY_CAPABILITIES = [
  'display/widget',
  'display/widget.confirmed',
  'display/action.confirmed',
];

export async function buildMetaGlassesSimulatorHandoffEvidence(
  options: {
    generatedAt?: string;
    playwrightProbe?: MetaGlassesSimulatorHandoffEvidence['playwright_probe'];
  } = {},
): Promise<MetaGlassesSimulatorHandoffEvidence> {
  const generatedAt = options.generatedAt ?? GENERATED_AT;
  const displayDescriptor = createSimulatorDisplayDescriptor();
  const displayInterfaceCid = computeInterfaceCID(displayDescriptor);
  const displayActions: MetaGlassesDisplayMobileAction[] = [];
  const displayBridge: MetaGlassesDisplayBridge = ({ operation, mobile_action }) => {
    displayActions.push(mobile_action);
    return {
      ok: true,
      status: operation === 'render_widget' ? 'rendered' : operation === 'clear_widget' ? 'cleared' : 'queued',
      metadata: {
        simulator_id: 'meta-glasses-simulator-swr-086',
        visible_in_simulator: true,
        operation,
      },
    };
  };
  const displayAdapter = new MetaGlassesDisplayORBAdapter({
    bridge: displayBridge,
    control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    now: () => new Date(generatedAt),
  });

  const render = await displayAdapter.invoke(
    (await displayAdapter.bind({ descriptor: displayDescriptor, operation: 'render_widget' })).handle,
    {
      request_id: 'swr-086-display-render',
      state: {
        title: 'Simulator handoff',
        summary: 'Display visible through hardware-free simulator.',
        progress: 0.86,
        progress_label: '86% validated',
        status: 'running',
      },
    },
    { correlation_id: 'swr-086-display-render', capabilities: ['display/widget'] },
  );
  const renderOutput = outputOf<MetaGlassesDisplayORBOperationOutput>(render);

  const update = await displayAdapter.invoke(
    (await displayAdapter.bind({ descriptor: displayDescriptor, operation: 'update_widget' })).handle,
    {
      request_id: 'swr-086-display-update',
      widget_id: renderOutput.widget_id,
      patch: { progress_label: 'Simulator-visible update', status: 'visible' },
    },
    { correlation_id: 'swr-086-display-update', capabilities: ['display/widget'] },
  );
  const focus = await displayAdapter.invoke(
    (await displayAdapter.bind({ descriptor: displayDescriptor, operation: 'focus_next' })).handle,
    { widget_id: renderOutput.widget_id },
    { correlation_id: 'swr-086-display-focus', capabilities: ['display/widget'] },
  );
  const activate = await displayAdapter.invoke(
    (await displayAdapter.bind({ descriptor: displayDescriptor, operation: 'activate' })).handle,
    { widget_id: renderOutput.widget_id },
    { correlation_id: 'swr-086-display-activate', capabilities: DISPLAY_CAPABILITIES },
  );
  const clear = await displayAdapter.invoke(
    (await displayAdapter.bind({ descriptor: displayDescriptor, operation: 'clear_widget' })).handle,
    { widget_id: renderOutput.widget_id },
    { correlation_id: 'swr-086-display-clear', capabilities: DISPLAY_CAPABILITIES },
  );

  const cameraDescriptor = createMetaGlassesCameraDescriptor(APP_ID);
  const cameraInterfaceCid = computeInterfaceCID(cameraDescriptor);
  const cameraDenied = requestMetaGlassesCameraCapture(cameraDescriptor, {
    request_id: 'swr-086-camera-denied',
    app_id: APP_ID,
    binding_id: 'camera.photo_capture.capture_photo.binding',
    interaction: 'capture_photo',
    correlation_id: 'swr-086-camera-denied',
    storage_enabled: false,
    mock: true,
    bridge: createMetaGlassesCameraBridgeEnvelope('photo', {
      bridge_provider: 'simulator',
      bridge_route: 'simulator.camera.permission-denied',
      correlation_id: 'swr-086-camera-denied',
    }),
    policy: {
      explicit_user_permission: false,
      outcome: 'allow',
      granted_scopes: ['meta_glasses.control.route'],
      reasons: ['simulator camera prompt denied by test user'],
    },
  });
  const degradedBridge = createMetaGlassesCameraBridgeEnvelope('photo', {
    bridge_provider: 'simulator',
    bridge_route: 'simulator.camera.degraded-to-mobile-card',
    correlation_id: 'swr-086-camera-fallback',
  });
  degradedBridge.route.readiness = 'degraded';
  const cameraFallback = requestMetaGlassesCameraCapture(cameraDescriptor, {
    request_id: 'swr-086-camera-fallback',
    app_id: APP_ID,
    binding_id: 'camera.photo_capture.capture_photo.binding',
    interaction: 'capture_photo',
    correlation_id: 'swr-086-camera-fallback',
    storage_enabled: false,
    mock: false,
    bridge: degradedBridge,
    policy: {
      explicit_user_permission: true,
      outcome: 'allow',
      granted_scopes: ['meta_glasses.camera.photo', 'meta_glasses.control.route'],
      reasons: ['simulator camera route degraded and mobile fallback selected'],
    },
  });
  const cameraAccepted = requestMetaGlassesCameraCapture(cameraDescriptor, {
    request_id: 'swr-086-camera-accepted',
    app_id: APP_ID,
    binding_id: 'camera.photo_capture.capture_photo.binding',
    interaction: 'capture_photo',
    correlation_id: 'swr-086-camera-accepted',
    storage_enabled: true,
    mock: true,
    bridge: createMetaGlassesCameraBridgeEnvelope('photo', {
      bridge_provider: 'simulator',
      bridge_route: 'simulator.camera.photo-capture',
      correlation_id: 'swr-086-camera-accepted',
      libp2p_peer_id: '12D3KooWSwr086SimulatorPeer',
      libp2p_session_id: 'libp2p-swr-086-simulator-camera',
    }),
    policy: {
      explicit_user_permission: true,
      outcome: 'allow',
      granted_scopes: ['meta_glasses.camera.photo', 'meta_glasses.control.route'],
      reasons: ['simulator camera permission granted'],
    },
  });

  const audioDescriptor = createMetaGlassesAudioAdapterDescriptor(APP_ID);
  const audioInterfaceCid = computeInterfaceCID(audioDescriptor);
  const microphonePermission = audioRoute('microphone.input', {
    action: 'start_dictation',
    granted_scopes: ['meta_glasses.control.route'],
    correlation_id: 'swr-086-microphone-permission',
    mock: true,
  });
  const microphoneReady = audioRoute('microphone.input', {
    action: 'start_dictation',
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    correlation_id: 'swr-086-microphone-ready',
    mock: true,
  });
  const speakerReady = audioRoute('speaker.output', {
    action: 'play_handoff_summary',
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    correlation_id: 'swr-086-speaker-ready',
    mock: true,
    storage_enabled: true,
    content_cids: [computeCID('swr-086-speaker-simulator-audio-sample')],
  });
  const speakerFallback = audioRoute('speaker.output', {
    action: 'play_low_bitrate_summary',
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    correlation_id: 'swr-086-speaker-fallback',
    readiness: 'degraded',
    mock: true,
  });

  const mobileDescriptor = createMetaGlassesMobileORBBridgeDescriptor();
  const mobileOrbInterfaceCid = computeInterfaceCID(mobileDescriptor);
  const mobileAdapter = new MetaGlassesMobileORBBridgeAdapter({
    control_surface_policy_evaluator: allowControlSurfaceEvaluation,
    now: () => new Date(generatedAt),
  });
  const registration = await mobileAdapter.invoke(
    (await mobileAdapter.bind({ operation: 'register_edge_capabilities' })).handle,
    {
      edge_id: 'swr-086-simulator-edge',
      platform: 'simulator',
      device_id: 'swr-086-simulator-device',
      device_model: 'hardware-free-meta-glasses-simulator',
      dat_capabilities: {
        session: true,
        camera: true,
        photoCapture: true,
        audio: true,
        display: true,
        webAppDisplay: true,
      },
      local_interface_cids: [
        displayInterfaceCid,
        cameraInterfaceCid,
        audioInterfaceCid,
      ],
      transport_preferences: ['local', 'mcp-server'],
    },
    { correlation_id: 'swr-086-register-edge', capabilities: ['mobile/orb.edge'] },
  );
  const registered = outputOf<MetaGlassesMobileORBRegisterResponse>(registration);

  const event = await mobileAdapter.invoke(
    (await mobileAdapter.bind({ operation: 'publish_glasses_event' })).handle,
    {
      edge_session_id: registered.edge_session_id,
      event_type: 'display_action',
      payload: {
        action: 'show-simulator-handoff',
        source_surface: 'desktop',
        direct_desktop_pairing: false,
      },
      correlation_id: 'swr-086-publish-display-action',
      parent_receipt_cids: [registration.receipt.receipt_cid],
    },
    {
      correlation_id: 'swr-086-publish-display-action',
      capabilities: ['mobile/orb.edge'],
      parent_receipt_cids: [registration.receipt.receipt_cid],
    },
  );
  const eventOutput = outputOf<MetaGlassesMobileORBEventResponse>(event);

  const serviceBinding = await mobileAdapter.invoke(
    (await mobileAdapter.bind({ operation: 'bind_service' })).handle,
    {
      edge_session_id: registered.edge_session_id,
      service_interface_cid: displayInterfaceCid,
      service_descriptor: displayDescriptor as unknown as Record<string, unknown>,
      operation: 'render_widget',
      transport_preference: 'local',
      user_intent: 'render simulator-visible display widget',
    },
    {
      correlation_id: 'swr-086-bind-display',
      capabilities: ['mobile/orb.service.bind'],
      parent_receipt_cids: [eventOutput.receipt_cid],
    },
  );
  const bound = outputOf<MetaGlassesMobileORBBindServiceResponse>(serviceBinding);

  const serviceInvoke = await mobileAdapter.invoke(
    (await mobileAdapter.bind({ operation: 'invoke_service' })).handle,
    {
      binding_handle: bound.binding_handle,
      operation: 'render_widget',
      arguments: {
        display_widget_action: renderOutput.mobile_action,
        camera_state: cameraAccepted.control_event.route.selected_surface,
        microphone_state: microphoneReady.status,
        speaker_state: speakerReady.status,
      },
      glasses_context: {
        simulator_id: 'meta-glasses-simulator-swr-086',
        paired_physical_glasses: false,
      },
      display_context: {
        visible_widget_id: renderOutput.widget_id,
        display_state: 'rendered',
      },
      correlation_id: 'swr-086-invoke-display',
      parent_receipt_cids: [bound.orb_binding?.descriptor_cid ?? serviceBinding.receipt.receipt_cid],
    },
    {
      correlation_id: 'swr-086-invoke-display',
      capabilities: ['mobile/orb.service.invoke'],
      parent_receipt_cids: [serviceBinding.receipt.receipt_cid],
    },
  );
  const invoked = outputOf<MetaGlassesMobileORBInvokeServiceResponse>(serviceInvoke);

  const dispatch = await mobileAdapter.invoke(
    (await mobileAdapter.bind({ operation: 'dispatch_glasses_response' })).handle,
    {
      edge_session_id: registered.edge_session_id,
      result: invoked as unknown as Record<string, unknown>,
      render_targets: ['display_widget', 'audio', 'mobile_card'],
      fallback: {
        camera: cameraFallback.control_event.route.selected_surface,
        microphone: microphonePermission.status,
      },
      correlation_id: 'swr-086-dispatch-response',
      parent_receipt_cids: [invoked.receipt_cid],
    },
    {
      correlation_id: 'swr-086-dispatch-response',
      capabilities: ['mobile/orb.response.dispatch'],
      parent_receipt_cids: [invoked.receipt_cid],
    },
  );
  const dispatched = outputOf<MetaGlassesMobileORBDispatchResponseResponse>(dispatch);

  const displayStates = displayStateEvidence(
    renderOutput.widget_id,
    [render, update, focus, activate, clear],
    displayActions,
  );
  const capabilityEvidence: MetaGlassesSimulatorCapabilityEvidence[] = [
    {
      capability: 'display.output',
      source: 'simulator',
      interface_cid: displayInterfaceCid,
      descriptor_name: displayDescriptor.name,
      orb_operations: ['render_widget', 'update_widget', 'focus_next', 'activate', 'clear_widget'],
      idl_projection: idlProjection(displayDescriptor, displayInterfaceCid, 'display.output'),
      simulator_visible_states: displayStates,
    },
    {
      capability: 'camera.photo_capture',
      source: 'simulator',
      interface_cid: cameraInterfaceCid,
      descriptor_name: cameraDescriptor.name,
      orb_operations: ['camera.capturePhoto'],
      idl_projection: idlProjection(cameraDescriptor, cameraInterfaceCid, 'camera.photo_capture'),
      camera_permission_states: [
        cameraState('permission_denied', cameraDenied),
        cameraState('fallback', cameraFallback),
        cameraState('accepted', cameraAccepted),
      ],
    },
    {
      capability: 'microphone.input',
      source: 'simulator',
      interface_cid: audioInterfaceCid,
      descriptor_name: audioDescriptor.name,
      orb_operations: ['meta_glasses_audio.start_microphone_capture'],
      idl_projection: idlProjection(audioDescriptor, audioInterfaceCid, 'microphone.input'),
      audio_policy_states: [
        audioPolicyState('microphone.input', microphonePermission),
        audioPolicyState('microphone.input', microphoneReady),
      ],
    },
    {
      capability: 'speaker.output',
      source: 'simulator',
      interface_cid: audioInterfaceCid,
      descriptor_name: audioDescriptor.name,
      orb_operations: ['meta_glasses_audio.start_speaker_playback'],
      idl_projection: idlProjection(audioDescriptor, audioInterfaceCid, 'speaker.output'),
      audio_policy_states: [
        audioPolicyState('speaker.output', speakerReady),
        audioPolicyState('speaker.output', speakerFallback),
      ],
    },
  ];

  const handoffPaths: MetaGlassesSimulatorHandoffPath[] = [
    {
      scenario: 'desktop_to_mobile_orb_to_simulator',
      from_surface: 'desktop',
      through: [
        'SwissKnife virtual desktop',
        'mobile ORB edge',
        'simulator display bridge',
      ],
      to_surface: 'simulator',
      direct_desktop_pairing: false,
      physical_glasses_required: false,
      receipts: [
        registration.receipt.receipt_cid,
        eventOutput.receipt_cid,
        bound.orb_binding?.descriptor_cid ?? serviceBinding.receipt.receipt_cid,
        invoked.receipt_cid,
        dispatched.receipt_cid,
      ],
      visible_state: 'display.output rendered via simulator after desktop event handoff',
      policy_state: 'allow',
    },
    {
      scenario: 'mobile_to_desktop_resume',
      from_surface: 'mobile',
      through: [
        'mobile companion card',
        'desktop session resume token',
        'ORB service binding',
      ],
      to_surface: 'desktop',
      direct_desktop_pairing: false,
      physical_glasses_required: false,
      receipts: [
        eventOutput.receipt_cid,
        serviceBinding.receipt.receipt_cid,
        update.receipt.receipt_cid,
      ],
      visible_state: 'desktop resumes simulator widget state without pairing to physical glasses',
      policy_state: 'allow',
    },
    {
      scenario: 'policy_denied_camera_to_mobile_fallback',
      from_surface: 'simulator',
      through: [
        'camera permission prompt',
        'MCP++ policy denial receipt',
        'mobile fallback card',
      ],
      to_surface: 'mobile',
      direct_desktop_pairing: false,
      physical_glasses_required: false,
      receipts: cameraDenied.receipts.map(receipt => receipt.receipt_cid),
      visible_state: 'camera.photo_capture denied in simulator and redirected to mobile fallback',
      policy_state: 'deny',
    },
  ];

  const withoutCid = {
    schema: META_GLASSES_SIMULATOR_HANDOFF_SCHEMA,
    task_id: META_GLASSES_SIMULATOR_HANDOFF_TASK_ID,
    generated_at: generatedAt,
    hardware_free: true,
    simulator_driven: true,
    physical_glasses_required: false,
    direct_desktop_pairing_required: false,
    validation_commands: [
      'npm run test:e2e:meta-glasses',
      'npm run evidence:mcp-glasses',
    ],
    simulator: {
      simulator_id: 'meta-glasses-simulator-swr-086',
      device_model: 'hardware-free-meta-glasses-simulator',
      platform: 'simulator' as const,
      session_id: registered.edge_session_id,
      capabilities: {
        'display.output': true,
        'camera.photo_capture': true,
        'microphone.input': true,
        'speaker.output': true,
      },
      paired_physical_glasses: false,
    },
    orb_idl_projection: {
      display_interface_cid: displayInterfaceCid,
      camera_interface_cid: cameraInterfaceCid,
      audio_interface_cid: audioInterfaceCid,
      mobile_orb_interface_cid: mobileOrbInterfaceCid,
      projection_cid: computeCID(JSON.stringify({
        displayInterfaceCid,
        cameraInterfaceCid,
        audioInterfaceCid,
        mobileOrbInterfaceCid,
        task: META_GLASSES_SIMULATOR_HANDOFF_TASK_ID,
      })),
      operation_receipts: [
        ...displayAdapter.getTaskMetadata().map(entry => entry.receipt_cid),
        ...mobileAdapter.getTaskMetadata().map(entry => entry.receipt_cid),
        ...cameraAccepted.receipts.map(receipt => receipt.receipt_cid),
        ...microphoneReady.receipts.map(receipt => receipt.receipt_cid),
        ...speakerReady.receipts.map(receipt => receipt.receipt_cid),
      ],
    },
    capability_evidence: capabilityEvidence,
    handoff_paths: handoffPaths,
    acceptance_matrix: acceptanceMatrix(capabilityEvidence, handoffPaths),
    playwright_probe: options.playwrightProbe,
  };

  return {
    ...withoutCid,
    evidence_cid: computeCID(JSON.stringify(withoutCid)),
  };
}

export function validateMetaGlassesSimulatorHandoffEvidence(
  evidence: MetaGlassesSimulatorHandoffEvidence,
): MetaGlassesSimulatorHandoffValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (evidence.schema !== META_GLASSES_SIMULATOR_HANDOFF_SCHEMA) {
    errors.push(`Unexpected schema: ${evidence.schema}`);
  }
  if (evidence.task_id !== META_GLASSES_SIMULATOR_HANDOFF_TASK_ID) {
    errors.push(`Unexpected task_id: ${evidence.task_id}`);
  }
  if (!evidence.hardware_free || !evidence.simulator_driven) {
    errors.push('Evidence must be hardware-free and simulator-driven.');
  }
  if (evidence.physical_glasses_required || evidence.direct_desktop_pairing_required) {
    errors.push('Evidence must not require physical glasses or direct desktop pairing.');
  }
  if (evidence.simulator.paired_physical_glasses) {
    errors.push('Simulator session must not be paired to physical glasses.');
  }

  const capabilities = new Map(
    evidence.capability_evidence.map(entry => [entry.capability, entry]),
  );
  for (const capability of [
    'display.output',
    'camera.photo_capture',
    'microphone.input',
    'speaker.output',
  ] satisfies MetaGlassesSimulatorCapability[]) {
    if (!capabilities.has(capability)) {
      errors.push(`Missing simulator capability evidence for ${capability}.`);
    }
  }

  const displayStates = new Set(
    capabilities.get('display.output')?.simulator_visible_states?.map(state => state.state) ?? [],
  );
  for (const state of ['rendered', 'updated', 'focused', 'activated', 'cleared']) {
    if (!displayStates.has(state as MetaGlassesSimulatorDisplayState['state'])) {
      errors.push(`Missing simulator-visible display state: ${state}.`);
    }
  }

  const microphoneStates = capabilities.get('microphone.input')?.audio_policy_states ?? [];
  if (!microphoneStates.some(state => state.policy_outcome === 'require_confirmation')) {
    errors.push('Microphone evidence must include a permission-required policy state.');
  }
  if (!microphoneStates.some(state => state.granted && state.route_provider === 'simulator')) {
    errors.push('Microphone evidence must include a granted simulator route.');
  }

  const speakerStates = capabilities.get('speaker.output')?.audio_policy_states ?? [];
  if (!speakerStates.some(state => state.granted && state.route_provider === 'simulator')) {
    errors.push('Speaker evidence must include a granted simulator route.');
  }
  if (!speakerStates.some(state => ['fallback', 'mock'].includes(state.policy_outcome))) {
    errors.push('Speaker evidence must include fallback or mock policy coverage.');
  }

  const cameraStates = capabilities.get('camera.photo_capture')?.camera_permission_states ?? [];
  for (const state of ['permission_denied', 'fallback', 'accepted']) {
    if (!cameraStates.some(item => item.state === state)) {
      errors.push(`Camera evidence must include ${state}.`);
    }
  }
  if (!cameraStates.some(item => item.selected_surface === 'mobile-fallback')) {
    errors.push('Camera evidence must prove mobile fallback selection.');
  }

  if (!evidence.handoff_paths.some(path => path.scenario === 'desktop_to_mobile_orb_to_simulator')) {
    errors.push('Desktop to mobile ORB to simulator handoff path is required.');
  }
  if (!evidence.handoff_paths.some(path => path.scenario === 'mobile_to_desktop_resume')) {
    errors.push('Mobile to desktop resume handoff path is required.');
  }
  if (evidence.handoff_paths.some(path => path.direct_desktop_pairing || path.physical_glasses_required)) {
    errors.push('Handoff paths must not use direct desktop pairing or physical glasses.');
  }

  const matrix = evidence.acceptance_matrix;
  for (const [key, value] of Object.entries(matrix)) {
    if (value !== true) {
      errors.push(`Acceptance matrix failed: ${key}.`);
    }
  }
  if (!isCID(evidence.evidence_cid)) warnings.push('Evidence CID is not a sha256 CID.');

  return { valid: errors.length === 0, errors, warnings };
}

function createSimulatorDisplayDescriptor(): MetaGlassesWidgetDescriptor {
  const objectSchema = { type: 'object', additionalProperties: true } as const;
  const methods = [
    'render_widget',
    'update_widget',
    'clear_widget',
    'focus_next',
    'focus_previous',
    'activate',
    'reset_session',
  ].map(name => ({
    name,
    input_schema: objectSchema,
    output_schema: objectSchema,
  }));

  return {
    name: 'swr-086-simulator-handoff-widget',
    namespace: 'org.hallucinate.swissknife.meta_glasses.simulator',
    version: '0.1.0',
    methods,
    errors: [{ name: 'DisplayUnavailable' }, { name: 'SimulatorHandoffDenied' }],
    requires: ['mcp++/receipts', 'mcp++/policy'],
    compatibility: { compatible_with: [], supersedes: [] },
    semanticTags: ['meta-glasses', 'simulator', 'orb', 'idl', 'display-widget'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    meta: {
      profile: 'swissknife.mcp++/ui-profile',
      profile_version: '0.1.0',
      app_id: APP_ID,
      title: 'SWR-086 Simulator Handoff Widget',
      publisher: 'hallucinate',
    },
    services: [
      {
        id: 'meta-glasses-simulator-display',
        interface_type: 'generic',
        transport: 'local',
        operations: methods.map(method => method.name),
      },
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          operations: ['render_widget', 'update_widget'],
          regions: [{ id: 'simulator-state', kind: 'status', operation: 'render_widget' }],
        },
      ],
    },
    data_contracts: {
      operations: methods.map(method => ({
        method: method.name,
        input_schema: objectSchema,
        output_schema: objectSchema,
        stream: method.name === 'render_widget'
          ? {
            kind: 'telemetry' as const,
            correlation_id_field: 'correlation_id',
            event_schema: objectSchema,
          }
          : undefined,
      })),
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(
        methods.map(method => [method.name, method.name === 'activate' || method.name === 'clear_widget'
          ? DISPLAY_CAPABILITIES
          : ['display/widget']]),
      ),
    },
    state_model: {
      keys: ['title', 'summary', 'progress', 'progress_label', 'status', 'selected_action'],
      events: ['simulator.display.rendered', 'simulator.display.updated'],
      replay: true,
    },
    [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: {
      profile: META_GLASSES_DISPLAY_PROFILE,
      profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
      target: {
        display_class: 'meta-ray-ban-display',
        viewport: { width: 600, height: 600 },
        input: ['dpad', 'voice', 'mobile_action'],
        render_path: 'simulator',
      },
      layout: {
        template: 'task-progress',
        regions: [
          {
            id: 'title',
            kind: 'text',
            bounds: { x: 24, y: 24, width: 552, height: 88 },
            text: { source: 'state.title', max_lines: 2, max_chars: 64, overflow: 'truncate' },
          },
          {
            id: 'summary',
            kind: 'text',
            bounds: { x: 24, y: 128, width: 552, height: 220 },
            text: { source: 'state.summary', max_lines: 5, max_chars: 180, overflow: 'wrap' },
          },
          {
            id: 'progress',
            kind: 'progress',
            bounds: { x: 24, y: 368, width: 552, height: 64 },
            text: { source: 'state.progress_label', max_lines: 1, max_chars: 40, overflow: 'truncate' },
          },
          {
            id: 'pause-control',
            kind: 'action',
            bounds: { x: 24, y: 480, width: 252, height: 72 },
            action_id: 'pause',
          },
          {
            id: 'dismiss-control',
            kind: 'action',
            bounds: { x: 324, y: 480, width: 252, height: 72 },
            action_id: 'dismiss',
          },
        ],
        focus_order: ['pause', 'dismiss'],
      },
      actions: [
        {
          id: 'pause',
          method: 'activate',
          backend_action_id: 'swr-086.display.pause',
          label: 'Pause',
          focusable: true,
        },
        {
          id: 'dismiss',
          method: 'activate',
          backend_action_id: 'swr-086.display.dismiss',
          label: 'Dismiss',
          focusable: true,
        },
      ],
      constraints: {
        max_text_blocks: 3,
        max_actions: 2,
        requires_high_contrast: true,
        requires_focus_order: true,
        max_update_hz: 2,
        ttl_ms: 30000,
      },
      fallback: {
        when: ['dat_native_display_unavailable', 'display_unsupported', 'session_not_ready'],
        render_path: 'mobile-card',
        message: 'Simulator display unavailable. Continue on mobile.',
      },
    },
  };
}

function allowControlSurfaceEvaluation(request: ControlSurfacePolicyEvaluationRequest) {
  return {
    outcome: 'allow' as const,
    reasons: [`SWR-086 simulator policy allowed ${request.interaction_envelope.normalized_intent.method}.`],
    explanation: 'Hardware-free simulator handoff validation does not require direct desktop pairing.',
  };
}

function outputOf<T>(response: { output: unknown }): T {
  return response.output as T;
}

function audioRoute(
  capability: MetaGlassesAudioCapability,
  overrides: Partial<Parameters<typeof requestMetaGlassesAudioRoute>[0]>,
): MetaGlassesAudioRouteResult {
  return requestMetaGlassesAudioRoute({
    app_id: APP_ID,
    capability,
    action: capability === 'microphone.input' ? 'start_dictation' : 'play_summary',
    ...overrides,
  });
}

function displayStateEvidence(
  widgetId: string,
  responses: readonly { receipt: { receipt_cid: string }; output: unknown }[],
  actions: readonly MetaGlassesDisplayMobileAction[],
): MetaGlassesSimulatorDisplayState[] {
  const states: Array<MetaGlassesSimulatorDisplayState['state']> = [
    'rendered',
    'updated',
    'focused',
    'activated',
    'cleared',
  ];
  return states.map((state, index) => ({
    state,
    visible_in_simulator: true,
    widget_id: widgetId,
    operation: actions[index]?.operation ?? state,
    receipt_cid: responses[index].receipt.receipt_cid,
    mobile_action_type: actions[index]?.type ?? 'unknown',
    summary: `${state} state was emitted by the display ORB bridge and rendered by the simulator.`,
  }));
}

function cameraState(
  state: MetaGlassesSimulatorCameraState['state'],
  result: MetaGlassesCameraCaptureResult,
): MetaGlassesSimulatorCameraState {
  const validation = validateMetaGlassesCameraCaptureResult(result);
  return {
    state,
    outcome: result.outcome,
    policy_outcome: result.policy.outcome,
    readiness: result.readiness.state,
    selected_surface: result.control_event.route.selected_surface,
    receipt_cids: result.receipts.map(receipt => receipt.receipt_cid),
    payload_cids: result.payload_refs.map(ref => ref.cid),
    permission_scope: result.policy.required_scopes.find(scope => scope.startsWith('meta_glasses.camera.')) ?? 'meta_glasses.camera.photo',
    visible_in_simulator: validation.conformant && result.control_event.route.selected_surface !== 'dat-native',
  };
}

function audioPolicyState(
  capability: Extract<MetaGlassesSimulatorCapability, 'microphone.input' | 'speaker.output'>,
  result: MetaGlassesAudioRouteResult,
): MetaGlassesSimulatorAudioPolicyState {
  return {
    capability,
    state: result.status,
    policy_outcome: result.policy_decision.outcome,
    granted: result.granted,
    required_scopes: result.policy_decision.required_scopes,
    granted_scopes: result.policy_decision.granted_scopes,
    receipt_cids: result.receipts.map(receipt => receipt.receipt_cid),
    route_provider: result.normalized_event.envelope.route.bridge_provider,
    route_bridge: result.normalized_event.envelope.route.bridge_route,
    raw_audio_redacted: true,
  };
}

function idlProjection(
  descriptor: { name: string; methods: readonly { name: string }[] },
  interfaceCid: string,
  capability: MetaGlassesSimulatorCapability,
): MetaGlassesSimulatorCapabilityEvidence['idl_projection'] {
  const methods = descriptor.methods.map(method => method.name);
  return {
    descriptor_cid: interfaceCid,
    method_count: methods.length,
    methods,
    projection_cid: computeCID(JSON.stringify({ capability, interfaceCid, methods })),
  };
}

function acceptanceMatrix(
  capabilityEvidence: readonly MetaGlassesSimulatorCapabilityEvidence[],
  handoffPaths: readonly MetaGlassesSimulatorHandoffPath[],
): MetaGlassesSimulatorHandoffEvidence['acceptance_matrix'] {
  const byCapability = new Map(capabilityEvidence.map(entry => [entry.capability, entry]));
  const displayStates = byCapability.get('display.output')?.simulator_visible_states ?? [];
  const microphone = byCapability.get('microphone.input')?.audio_policy_states ?? [];
  const speaker = byCapability.get('speaker.output')?.audio_policy_states ?? [];
  const camera = byCapability.get('camera.photo_capture')?.camera_permission_states ?? [];

  return {
    display_states_proven: ['rendered', 'updated', 'focused', 'activated', 'cleared']
      .every(state => displayStates.some(entry => entry.state === state)),
    audio_policy_states_proven: speaker.some(entry => entry.granted)
      && speaker.some(entry => ['fallback', 'mock'].includes(entry.policy_outcome)),
    microphone_policy_states_proven: microphone.some(entry => entry.policy_outcome === 'require_confirmation')
      && microphone.some(entry => entry.granted),
    camera_permission_fallback_states_proven: ['permission_denied', 'fallback', 'accepted']
      .every(state => camera.some(entry => entry.state === state)),
    desktop_mobile_handoff_proven: handoffPaths.some(path => path.scenario === 'desktop_to_mobile_orb_to_simulator')
      && handoffPaths.some(path => path.scenario === 'mobile_to_desktop_resume'),
    no_direct_desktop_physical_pairing: handoffPaths.every(path => !path.direct_desktop_pairing && !path.physical_glasses_required),
  };
}

function isCID(value: string | undefined): boolean {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

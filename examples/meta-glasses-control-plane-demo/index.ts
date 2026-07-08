import { computeCID } from '../../src/services/mcp-idl.js';
import {
  createMetaGlassesAudioAppRequirements,
  type MetaGlassesAudioCapability,
  type MetaGlassesAudioRouteRequest,
} from '../../src/services/meta-glasses-audio-adapter.js';
import {
  createMetaGlassesCameraBridgeEnvelope,
  type MetaGlassesCameraCaptureRequest,
} from '../../src/services/meta-glasses-camera-adapter.js';
import {
  createMetaGlassesControlPlaneRouter,
  type MetaGlassesControlPlaneBinding,
  type MetaGlassesControlPlaneRouteDecision,
  type MetaGlassesControlPlaneRouteRequest,
} from '../../src/services/meta-glasses-control-plane-router.js';
import {
  createMetaGlassesInputAppBindings,
  createMetaGlassesInputBridgeEnvelope,
  type MetaGlassesInputCapability,
  type MetaGlassesInputEventRequest,
  type MetaGlassesInputSample,
} from '../../src/services/meta-glasses-input-adapter.js';
import {
  META_GLASSES_IO_PERMISSION_SCOPES,
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOPayloadRef,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
} from '../../src/services/meta-glasses-io-profile.js';
import {
  createMetaGlassesIOBridgeEnvelope,
  type MetaGlassesIOBridgeEnvelope,
} from '../../src/services/meta-glasses-io-transport.js';

export const META_GLASSES_CONTROL_PLANE_DEMO_APP_ID =
  'swissknife.examples.meta-glasses-control-plane-demo';

export interface MetaGlassesDemoDiagnostic {
  capability: MetaGlassesIOCapabilityKind;
  binding_id: string;
  action: string;
  status: MetaGlassesControlPlaneRouteDecision['status'];
  visible_label: string;
  policy_outcome: MetaGlassesIOPolicyDecision['outcome'];
  receipt_cid?: string;
  payload_refs: MetaGlassesIOPayloadRef[];
  fallback_visible: boolean;
}

export interface MetaGlassesDemoFallbackPanel {
  capability: MetaGlassesIOCapabilityKind;
  binding_id: string;
  route_status: MetaGlassesControlPlaneRouteDecision['status'];
  tool: string;
  message: string;
}

export interface MetaGlassesDemoState {
  app_id: string;
  mock_only: true;
  diagnostics: MetaGlassesDemoDiagnostic[];
  fallback_panels: MetaGlassesDemoFallbackPanel[];
  handoff_receipts: string[];
  capture_references: MetaGlassesIOPayloadRef[];
  visible_actions: Record<string, string>;
}

export interface MetaGlassesCaptureOptions {
  persist_capture?: boolean;
  policy_outcome?: MetaGlassesIOPolicyDecision['outcome'];
  granted_scopes?: MetaGlassesCameraCaptureRequest['policy']['granted_scopes'];
  correlation_id?: string;
}

export class MetaGlassesControlPlaneDemo {
  readonly appId: string;
  readonly state: MetaGlassesDemoState;
  private readonly router;
  private sequence = 0;

  constructor(appId = META_GLASSES_CONTROL_PLANE_DEMO_APP_ID) {
    this.appId = appId;
    this.router = createMetaGlassesControlPlaneRouter(this.appId);
    this.state = {
      app_id: appId,
      mock_only: true,
      diagnostics: [],
      fallback_panels: [],
      handoff_receipts: [],
      capture_references: [],
      visible_actions: visibleActions(),
    };
  }

  listBindings(): MetaGlassesControlPlaneBinding[] {
    return this.router.listBindings(this.appId);
  }

  capturePhoto(options: MetaGlassesCaptureOptions = {}): MetaGlassesControlPlaneRouteDecision {
    const correlationId = options.correlation_id ?? 'demo-camera-photo-001';
    const request: MetaGlassesCameraCaptureRequest = {
      request_id: `${correlationId}-request`,
      app_id: this.appId,
      binding_id: 'camera.photo_capture.capture_photo.binding',
      interaction: 'capture_photo',
      correlation_id: correlationId,
      storage_enabled: options.persist_capture === true,
      mock: true,
      bridge: createMetaGlassesCameraBridgeEnvelope('photo', {
        app_binding_id: 'camera.photo_capture.capture_photo.binding',
        correlation_id: correlationId,
        libp2p_peer_id: '12D3KooWMetaGlassesDemoCameraPeer',
        libp2p_session_id: 'libp2p-meta-glasses-demo-camera',
      }),
      policy: {
        explicit_user_permission: true,
        outcome: options.policy_outcome ?? 'allow',
        granted_scopes: options.granted_scopes ?? ['meta_glasses.camera.photo', 'meta_glasses.control.route'],
        reasons: ['Demo camera capture policy evaluated by mock Hallucinate App gate.'],
      },
    };

    const result = this.route({
      binding_id: request.binding_id,
      correlation_id: request.correlation_id,
      event_id: request.request_id,
      adapter_request: request,
    });

    if (this.capturePersistenceAllowed(result, options.persist_capture === true)) {
      this.state.capture_references.push(...result.payload_refs);
    }
    return result;
  }

  routeMicrophoneStatus(): MetaGlassesControlPlaneRouteDecision {
    return this.routeAudioStatus('microphone.input', 'demo-microphone-route-001');
  }

  routeSpeakerStatus(): MetaGlassesControlPlaneRouteDecision {
    return this.routeAudioStatus('speaker.output', 'demo-speaker-route-001');
  }

  routeHeadphoneStatus(): MetaGlassesControlPlaneRouteDecision {
    return this.routeAudioStatus('headphone.output', 'demo-headphone-route-001');
  }

  renderDisplayOutput(readiness: MetaGlassesIOReadiness = 'ready'): MetaGlassesControlPlaneRouteDecision {
    const binding = this.requiredBinding('display.output');
    const correlationId = readiness === 'ready' ? 'demo-display-render-001' : `demo-display-${readiness}`;
    const payload: MetaGlassesIOPayloadRef = {
      cid: computeCID(`display-widget:${this.appId}:${correlationId}`),
      purpose: 'display_asset',
      media_type: 'application/vnd.meta-glasses.widget+json',
      retention_policy: 'policy_controlled',
      redaction: 'metadata_only',
    };
    const bridge = this.bridge('display.output', binding.binding_id, correlationId, 'wifi', [payload.cid]);
    bridge.route.readiness = readiness;

    return this.route({
      binding_id: binding.binding_id,
      correlation_id: correlationId,
      event_id: correlationId,
      payload_refs: [payload],
      bridge,
      normalized_event: {
        event: 'io.display.rendered',
        widget_id: 'demo.control_plane.status',
        visible: true,
      },
    });
  }

  handleInput(
    capability: MetaGlassesInputCapability,
    sample: MetaGlassesInputSample,
    readiness: MetaGlassesIOReadiness = 'ready',
  ): MetaGlassesControlPlaneRouteDecision {
    const binding = createMetaGlassesInputAppBindings(this.appId).find(item => item.capability === capability);
    if (!binding) {
      throw new Error(`Missing demo input binding for ${capability}`);
    }
    const correlationId = `demo-${capability.replace('.', '-')}-${this.sequence + 1}`;
    const bridge = createMetaGlassesInputBridgeEnvelope(capability, {
      app_binding_id: binding.binding_id,
      correlation_id: correlationId,
      libp2p_peer_id: `12D3KooWMetaGlassesDemo${capability.replace(/[^A-Za-z0-9]/g, '')}Peer`,
      libp2p_session_id: `libp2p-demo-${capability.replace('.', '-')}`,
    });
    bridge.route.readiness = readiness;

    const request: MetaGlassesInputEventRequest = {
      app_id: this.appId,
      capability,
      binding_id: binding.binding_id,
      input_id: `${correlationId}-input`,
      correlation_id: correlationId,
      sequence: this.nextSequence(),
      timestamp_ms: 50_000 + this.sequence,
      received_at_ms: 50_020 + this.sequence,
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      explicit_user_permission: true,
      bridge,
      sample,
    };

    return this.route({
      binding_id: binding.binding_id,
      correlation_id: correlationId,
      event_id: request.input_id,
      sequence: request.sequence,
      adapter_request: request,
    });
  }

  showUnavailableRouteFallbacks(): MetaGlassesControlPlaneRouteDecision[] {
    return [
      this.capturePhoto({
        correlation_id: 'demo-camera-dat-unavailable',
        persist_capture: false,
        policy_outcome: 'fallback',
      }),
      this.renderDisplayOutput('unsupported'),
    ];
  }

  runMockScenario(): MetaGlassesDemoState {
    this.capturePhoto({ persist_capture: true });
    this.capturePhoto({
      correlation_id: 'demo-camera-ephemeral-policy',
      persist_capture: false,
    });
    this.routeMicrophoneStatus();
    this.routeSpeakerStatus();
    this.routeHeadphoneStatus();
    this.renderDisplayOutput();
    this.handleInput('neural_band.input', { gesture: 'pinch', confidence: 0.98 });
    this.handleInput('captouch.input', { touch: 'swipe_forward', confidence: 0.94 });
    this.handleInput('motion.orientation', {
      orientation: 'landscape',
      motion_state: 'walking',
      confidence: 0.88,
    });
    this.handleInput('phone_gps.context', { gps_context: 'nearby', confidence: 0.82 });
    this.showUnavailableRouteFallbacks();
    return this.state;
  }

  private route(
    request: Omit<MetaGlassesControlPlaneRouteRequest, 'app_id' | 'sequence'> & {
      sequence?: number;
    },
  ): MetaGlassesControlPlaneRouteDecision {
    const result = this.router.route({
      app_id: this.appId,
      ...request,
      sequence: request.sequence ?? this.nextSequence(),
    });
    this.recordDiagnostic(result);
    return result;
  }

  private routeAudioStatus(
    capability: MetaGlassesAudioCapability,
    correlationId: string,
  ): MetaGlassesControlPlaneRouteDecision {
    const requirement = createMetaGlassesAudioAppRequirements(this.appId)
      .find(item => item.capability === capability);
    if (!requirement) {
      throw new Error(`Missing demo audio binding for ${capability}`);
    }
    const request: MetaGlassesAudioRouteRequest = {
      app_id: this.appId,
      capability,
      action: requirement.action,
      correlation_id: correlationId,
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      readiness: 'ready',
      storage_enabled: false,
    };

    return this.route({
      binding_id: requirement.binding_id,
      correlation_id: correlationId,
      event_id: correlationId,
      adapter_request: request,
    });
  }

  private recordDiagnostic(result: MetaGlassesControlPlaneRouteDecision): void {
    const receiptCid = result.receipt.receipt_cid;
    if (receiptCid) {
      this.state.handoff_receipts.push(receiptCid);
    }
    this.state.diagnostics.push({
      capability: result.binding.capability,
      binding_id: result.binding.binding_id,
      action: result.binding.action,
      status: result.status,
      visible_label: this.state.visible_actions[result.binding.capability] ?? result.binding.action,
      policy_outcome: result.policy_handoff.outcome,
      receipt_cid: receiptCid,
      payload_refs: result.payload_refs,
      fallback_visible: Boolean(result.fallback),
    });
    if (result.fallback) {
      this.state.fallback_panels.push({
        capability: result.binding.capability,
        binding_id: result.binding.binding_id,
        route_status: result.status,
        tool: result.fallback.tool,
        message: result.fallback.reason,
      });
    }
  }

  private capturePersistenceAllowed(
    result: MetaGlassesControlPlaneRouteDecision,
    persistRequested: boolean,
  ): boolean {
    return result.status === 'accepted'
      && persistRequested
      && result.policy_handoff.outcome === 'allow'
      && result.payload_refs.some(ref => ref.retention_policy === 'pinned');
  }

  private requiredBinding(capability: MetaGlassesIOCapabilityKind): MetaGlassesControlPlaneBinding {
    const binding = this.router.listBindings(this.appId).find(item => item.capability === capability);
    if (!binding) {
      throw new Error(`Missing demo binding for ${capability}`);
    }
    return binding;
  }

  private bridge(
    capability: MetaGlassesIOCapabilityKind,
    bindingId: string,
    correlationId: string,
    rawTransport: 'bluetooth' | 'wifi',
    contentCids: string[] = [],
  ): MetaGlassesIOBridgeEnvelope {
    return createMetaGlassesIOBridgeEnvelope({
      raw_transport: rawTransport,
      bridge_provider: rawTransport === 'bluetooth' ? 'phone-app' : 'display-webapp',
      capability,
      app_binding_id: bindingId,
      correlation_id: correlationId,
      content_cids: contentCids,
      libp2p_peer_id: `12D3KooWMetaGlassesDemo${capability.replace(/[^A-Za-z0-9]/g, '')}Peer`,
      libp2p_session_id: `libp2p-demo-${capability.replace('.', '-')}`,
    });
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }
}

export function createMetaGlassesControlPlaneDemo(
  appId = META_GLASSES_CONTROL_PLANE_DEMO_APP_ID,
): MetaGlassesControlPlaneDemo {
  return new MetaGlassesControlPlaneDemo(appId);
}

export function runMetaGlassesControlPlaneDemoScenario(
  appId = META_GLASSES_CONTROL_PLANE_DEMO_APP_ID,
): MetaGlassesDemoState {
  return createMetaGlassesControlPlaneDemo(appId).runMockScenario();
}

function visibleActions(): Record<MetaGlassesIOCapabilityKind, string> {
  return {
    'camera.photo_capture': 'Camera capture',
    'camera.video_capture': 'Camera video stream',
    'microphone.input': 'Microphone route status',
    'speaker.output': 'Speaker route status',
    'headphone.output': 'Headphone route status',
    'display.output': 'Display output',
    'neural_band.input': 'Neural Band command',
    'captouch.input': 'Captouch command',
    'motion.orientation': 'Motion and orientation',
    'phone_gps.context': 'Phone GPS context',
  };
}

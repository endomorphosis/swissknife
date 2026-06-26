import {
  META_GLASSES_CONTROL_PLANE_ROUTER_ID,
  MetaGlassesControlPlaneRouter,
  createMetaGlassesControlPlaneRouter,
  type MetaGlassesControlPlaneBinding,
} from '../../src/services/meta-glasses-control-plane-router';
import {
  createMetaGlassesCameraBridgeEnvelope,
  type MetaGlassesCameraCaptureRequest,
} from '../../src/services/meta-glasses-camera-adapter';
import {
  createMetaGlassesAudioAppRequirements,
  type MetaGlassesAudioRouteRequest,
} from '../../src/services/meta-glasses-audio-adapter';
import {
  createMetaGlassesInputAppBindings,
  createMetaGlassesInputBridgeEnvelope,
  type MetaGlassesInputCapability,
  type MetaGlassesInputEventRequest,
} from '../../src/services/meta-glasses-input-adapter';
import {
  META_GLASSES_IO_PERMISSION_SCOPES,
  type MetaGlassesIOPayloadRef,
} from '../../src/services/meta-glasses-io-profile';

const APP_ID = 'com.example.control-plane';

function binding(router: MetaGlassesControlPlaneRouter, capability: string): MetaGlassesControlPlaneBinding {
  const result = router.listBindings(APP_ID).find(item => item.capability === capability);
  if (!result) {
    throw new Error(`Missing binding for ${capability}`);
  }
  return result;
}

function cameraRequest(overrides: Partial<MetaGlassesCameraCaptureRequest> = {}): MetaGlassesCameraCaptureRequest {
  return {
    request_id: 'camera-control-001',
    app_id: APP_ID,
    binding_id: 'camera.photo_capture.capture_photo.binding',
    interaction: 'capture_photo',
    correlation_id: 'corr-camera-control-001',
    storage_enabled: true,
    bridge: createMetaGlassesCameraBridgeEnvelope('photo', {
      correlation_id: 'corr-camera-control-001',
      libp2p_peer_id: '12D3KooWControlCameraPeer',
      libp2p_session_id: 'libp2p-control-camera',
    }),
    policy: {
      explicit_user_permission: true,
      outcome: 'allow',
      granted_scopes: ['meta_glasses.camera.photo', 'meta_glasses.control.route'],
    },
    ...overrides,
  };
}

function audioRequest(overrides: Partial<MetaGlassesAudioRouteRequest> = {}): MetaGlassesAudioRouteRequest {
  return {
    app_id: APP_ID,
    capability: 'microphone.input',
    action: 'dictate_note',
    correlation_id: 'corr-audio-control-001',
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    ...overrides,
  };
}

function inputRequest(
  capability: MetaGlassesInputCapability,
  overrides: Partial<MetaGlassesInputEventRequest> = {},
): MetaGlassesInputEventRequest {
  const inputBinding = createMetaGlassesInputAppBindings(APP_ID).find(item => item.capability === capability);
  if (!inputBinding) {
    throw new Error(`Missing input binding for ${capability}`);
  }
  return {
    app_id: APP_ID,
    capability,
    binding_id: inputBinding.binding_id,
    input_id: `${capability}-control-001`,
    correlation_id: `corr-${capability}-control-001`,
    sequence: 7,
    timestamp_ms: 10_000,
    received_at_ms: 10_020,
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    explicit_user_permission: true,
    bridge: createMetaGlassesInputBridgeEnvelope(capability, {
      correlation_id: `corr-${capability}-control-001`,
      libp2p_peer_id: '12D3KooWControlInputPeer',
      libp2p_session_id: 'libp2p-control-input',
    }),
    ...overrides,
  };
}

describe('Meta glasses control-plane router', () => {
  it('registers camera, microphone, speaker/headphone, display, Neural Band, captouch, motion, and GPS bindings', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const bindings = router.listBindings(APP_ID);

    expect(bindings.map(item => item.capability)).toEqual(expect.arrayContaining([
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
    ]));
    expect(bindings.every(item => item.required_scopes.includes('meta_glasses.control.route'))).toBe(true);
    expect(bindings.every(item => item.orb_tool.startsWith('swissknife.'))).toBe(true);
  });

  it('routes camera capture through mobile ORB with policy handoff, libp2p metadata, session state, and parent receipts', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const camera = cameraRequest();
    const result = router.route({
      app_id: APP_ID,
      binding_id: camera.binding_id,
      correlation_id: camera.correlation_id,
      sequence: 1,
      event_id: camera.request_id,
      adapter_request: camera,
    });

    expect(result.status).toBe('accepted');
    expect(result.tool_call.tool).toBe('swissknife.mobile_orb.request_capture');
    expect(result.policy_handoff.outcome).toBe('allow');
    expect(result.peer_session?.libp2p_peer_id).toBe('12D3KooWControlCameraPeer');
    expect(result.session.status).toBe('active');
    expect(result.payload_refs[0]).toEqual(expect.objectContaining({
      purpose: 'photo',
      retention_policy: 'pinned',
      redaction: 'privacy_filtered',
    }));
    expect(result.receipt.router_id).toBe(META_GLASSES_CONTROL_PLANE_ROUTER_ID);
    expect(result.receipt.receipt_cid).toMatch(/^sha256:/);
    expect(result.receipt.parent_receipt_cids).toHaveLength(2);
  });

  it('redacts audio routes to content references and falls back when Hallucinate App policy requires confirmation', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const audioBinding = createMetaGlassesAudioAppRequirements(APP_ID)
      .find(item => item.capability === 'microphone.input');
    if (!audioBinding) throw new Error('missing microphone binding');
    const deniedAudio = audioRequest({
      granted_scopes: ['meta_glasses.control.route'],
      correlation_id: 'corr-audio-denied-control',
    });

    const result = router.route({
      app_id: APP_ID,
      binding_id: audioBinding.binding_id,
      correlation_id: deniedAudio.correlation_id ?? 'corr-audio-denied-control',
      adapter_request: deniedAudio,
    });

    expect(result.status).toBe('denied');
    expect(result.policy_handoff.outcome).toBe('require_confirmation');
    expect(result.privacy.raw_payload_forwarded).toBe(false);
    expect(result.privacy.redacted_fields).toContain('raw_audio');
    expect(result.tool_call.arguments.payload_refs[0].redaction).toBe('privacy_filtered');
    expect(result.receipt.parent_receipt_cids).toHaveLength(2);
  });

  it('routes input events with normalized payloads and rejects replayed events deterministically', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const neuralBand = inputRequest('neural_band.input', {
      sample: { gesture: 'pinch', confidence: 0.99 },
    });

    const first = router.route({
      app_id: APP_ID,
      binding_id: neuralBand.binding_id,
      correlation_id: neuralBand.correlation_id ?? 'corr-neural-control',
      sequence: neuralBand.sequence,
      event_id: neuralBand.input_id,
      adapter_request: neuralBand,
    });
    const replay = router.route({
      app_id: APP_ID,
      binding_id: neuralBand.binding_id,
      correlation_id: neuralBand.correlation_id ?? 'corr-neural-control',
      sequence: neuralBand.sequence,
      event_id: neuralBand.input_id,
      adapter_request: neuralBand,
    });

    expect(first.status).toBe('accepted');
    expect(first.tool_call.tool).toBe('swissknife.webapp_bridge.publish_display_event');
    expect(first.tool_call.arguments.normalized_event).toEqual(expect.objectContaining({
      event: 'io.neural_band.intent',
      payload_summary: { gesture: 'pinch', confidence: 0.99 },
    }));
    expect(replay.status).toBe('replayed');
    expect(replay.policy_handoff.outcome).toBe('deny');
    expect(replay.receipt.replay_key).toBe(first.receipt.replay_key);
    expect(replay.receipt.receipt_cid).toMatch(/^sha256:/);
  });

  it('applies backpressure before ORB invocation and returns a fallback receipt', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const gps = inputRequest('phone_gps.context', {
      input_id: 'gps-backpressure',
      sequence: 2,
      sample: { gps_context: 'nearby', confidence: 0.75 },
    });

    const result = router.route({
      app_id: APP_ID,
      binding_id: gps.binding_id,
      correlation_id: gps.correlation_id ?? 'corr-gps-control',
      sequence: gps.sequence,
      event_id: gps.input_id,
      in_flight: 10,
      adapter_request: gps,
    });

    expect(result.status).toBe('backpressure');
    expect(result.backpressure.state).toBe('hard_limit');
    expect(result.fallback?.tool).toBe('hallucinate_app.meta_glasses.input_fallback');
    expect(result.session.status).toBe('fallback');
    expect(result.receipt.receipt_kind).toBe('mcp++/control-route');
  });

  it('routes display content-addressed payload references through the webapp bridge without inline assets', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const display = binding(router, 'display.output');
    const payload: MetaGlassesIOPayloadRef = {
      cid: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      purpose: 'display_asset',
      media_type: 'application/vnd.meta-glasses.widget+json',
      retention_policy: 'policy_controlled',
      redaction: 'metadata_only',
    };

    const result = router.route({
      app_id: APP_ID,
      binding_id: display.binding_id,
      correlation_id: 'corr-display-control-001',
      payload_refs: [payload],
      normalized_event: {
        event: 'io.display.rendered',
        widget_id: 'hud.summary',
      },
    });

    expect(result.status).toBe('accepted');
    expect(result.tool_call.tool).toBe('swissknife.webapp_bridge.publish_display_event');
    expect(result.payload_refs).toEqual([expect.objectContaining({
      cid: payload.cid,
      purpose: 'display_asset',
      redaction: 'metadata_only',
    })]);
    expect(result.privacy.redacted_fields).toContain('inline_asset_bytes');
    expect(JSON.stringify(result.tool_call.arguments)).not.toMatch(/inline_asset_bytes|raw_pixels|raw_audio/);
  });
});

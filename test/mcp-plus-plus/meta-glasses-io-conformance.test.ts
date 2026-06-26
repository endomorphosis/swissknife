import {
  MetaGlassesControlPlaneRouter,
  createMetaGlassesControlPlaneRouter,
  type MetaGlassesControlPlaneBinding,
  type MetaGlassesControlPlaneRouteDecision,
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
  type MetaGlassesInputCapability,
  type MetaGlassesInputEventRequest,
} from '../../src/services/meta-glasses-input-adapter';
import {
  META_GLASSES_IO_PERMISSION_SCOPES,
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOPayloadRef,
} from '../../src/services/meta-glasses-io-profile';
import {
  META_GLASSES_IO_TRANSPORT_ERROR_CODES,
  createMetaGlassesIOBridgeEnvelope,
  validateMetaGlassesIOBridgeEnvelope,
  type MetaGlassesIOBridgeEnvelope,
} from '../../src/services/meta-glasses-io-transport';

const APP_ID = 'com.example.meta-glasses-io-conformance';
const CID_PATTERN = /^sha256:[a-f0-9]{64}$/;

function binding(router: MetaGlassesControlPlaneRouter, capability: MetaGlassesIOCapabilityKind): MetaGlassesControlPlaneBinding {
  const match = router.listBindings(APP_ID).find(item => item.capability === capability);
  if (!match) {
    throw new Error(`Missing binding for ${capability}`);
  }
  return match;
}

function assertBridgeConformance(result: MetaGlassesControlPlaneRouteDecision): void {
  expect(result.binding.binding_id).toBe(result.tool_call.arguments.binding_id);
  expect(result.tool_call.arguments.app_id).toBe(APP_ID);
  expect(result.tool_call.input_cid).toMatch(CID_PATTERN);
  expect(result.policy_handoff.decision_id).toBeTruthy();
  expect(result.policy_handoff.reasons.length).toBeGreaterThan(0);
  expect(result.policy_handoff.decision_cid).toMatch(CID_PATTERN);
  expect(result.privacy.raw_payload_forwarded).toBe(false);
  expect(result.privacy.redacted_fields.length).toBeGreaterThan(0);
  expect(result.receipt.receipt_cid).toMatch(CID_PATTERN);
  expect(result.receipt.decision_cid).toBe(result.policy_handoff.decision_cid);
  expect(result.receipt.output_refs).toEqual(result.payload_refs);
  expect(result.receipt.binding_id).toBe(result.binding.binding_id);
  expect(result.receipt.app_id).toBe(APP_ID);
  expect(result.session.session_id).toMatch(/^mcp-session-/);

  expect(result.bridge).toBeDefined();
  expect(result.bridge?.identity.app_binding_id).toBe(result.binding.binding_id);
  expect(result.bridge?.identity.correlation_id).toBe(result.tool_call.arguments.correlation_id);
  expect(result.bridge?.route.capability).toBe(result.binding.capability);
  expect(result.bridge?.route.control_plane_route).toMatch(/^swissknife\./);
  expect(result.bridge?.route.route_decision_id).toBeTruthy();
  expect(result.bridge?.route.raw_transport_is_ipfs_libp2p_or_mcp).toBe(false);
  expect(result.bridge?.receipts.mcp_tool_receipt_id).toContain(result.tool_call.arguments.correlation_id);
  expect(result.bridge?.receipts.mcp_event_receipt_id).toContain(result.tool_call.arguments.correlation_id);
  expect(result.bridge?.receipts.envelope_cid).toMatch(CID_PATTERN);
  expect(result.bridge?.policy.decision_id).toBeTruthy();
  expect(result.bridge?.privacy.metadata_cid).toMatch(CID_PATTERN);
  expect(result.bridge?.privacy.redacted_fields).toEqual(expect.arrayContaining(['payload.inline_bytes']));
  expect(validateMetaGlassesIOBridgeEnvelope(result.bridge).conformant).toBe(true);

  for (const ref of result.payload_refs) {
    expect(ref.cid).toMatch(CID_PATTERN);
    expect(ref.redaction).toBeTruthy();
  }
}

function networkEnvelope(
  capability: MetaGlassesIOCapabilityKind,
  bindingId: string,
  correlationId: string,
  contentCids?: string[],
): MetaGlassesIOBridgeEnvelope {
  return createMetaGlassesIOBridgeEnvelope({
    raw_transport: 'wifi',
    bridge_provider: 'display-webapp',
    capability,
    app_binding_id: bindingId,
    correlation_id: correlationId,
    content_cids: contentCids,
    libp2p_peer_id: `12D3KooW${capability.replace(/[^A-Za-z0-9]/g, '')}ConformancePeer`,
    libp2p_session_id: `libp2p-${capability.replace('.', '-')}-conformance-session`,
  });
}

function cameraRequest(correlationId = 'corr-conformance-camera-001'): MetaGlassesCameraCaptureRequest {
  const bindingId = 'camera.photo_capture.capture_photo.binding';
  return {
    request_id: 'camera-conformance-photo-001',
    app_id: APP_ID,
    binding_id: bindingId,
    interaction: 'capture_photo',
    correlation_id: correlationId,
    storage_enabled: true,
    bridge: createMetaGlassesCameraBridgeEnvelope('photo', {
      app_binding_id: bindingId,
      correlation_id: correlationId,
      libp2p_peer_id: '12D3KooWCameraConformancePeer',
      libp2p_session_id: 'libp2p-camera-conformance-session',
    }),
    policy: {
      explicit_user_permission: true,
      outcome: 'allow',
      granted_scopes: ['meta_glasses.camera.photo', 'meta_glasses.control.route'],
    },
  };
}

function audioRequest(correlationId = 'corr-conformance-audio-001'): MetaGlassesAudioRouteRequest {
  return {
    app_id: APP_ID,
    capability: 'microphone.input',
    action: 'meta_glasses_audio.start_microphone_capture',
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    storage_enabled: true,
    content_cids: ['sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    correlation_id: correlationId,
  };
}

function inputRequest(
  capability: MetaGlassesInputCapability,
  correlationId: string,
  sample: MetaGlassesInputEventRequest['sample'],
): MetaGlassesInputEventRequest {
  const inputBinding = createMetaGlassesInputAppBindings(APP_ID).find(item => item.capability === capability);
  if (!inputBinding) {
    throw new Error(`Missing input binding for ${capability}`);
  }
  return {
    app_id: APP_ID,
    capability,
    binding_id: inputBinding.binding_id,
    input_id: `${capability}-conformance-input`,
    correlation_id: correlationId,
    sequence: 10,
    timestamp_ms: 20_000,
    received_at_ms: 20_020,
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    explicit_user_permission: true,
    bridge: networkEnvelope(capability, inputBinding.binding_id, correlationId),
    sample,
  };
}

describe('Meta glasses IPFS/libp2p/MCP++ I/O conformance', () => {
  it('routes camera, audio, Neural Band, captouch, motion/GPS, and display flows with required conformance metadata', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const displayBinding = binding(router, 'display.output');
    const audioBinding = createMetaGlassesAudioAppRequirements(APP_ID)
      .find(item => item.capability === 'microphone.input');
    if (!audioBinding) throw new Error('Missing microphone binding');

    const displayPayload: MetaGlassesIOPayloadRef = {
      cid: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      purpose: 'display_asset',
      media_type: 'application/vnd.meta-glasses.widget+json',
      retention_policy: 'policy_controlled',
      redaction: 'metadata_only',
    };

    const results = [
      router.route({
        app_id: APP_ID,
        binding_id: cameraRequest().binding_id,
        correlation_id: cameraRequest().correlation_id,
        sequence: 1,
        event_id: cameraRequest().request_id,
        adapter_request: cameraRequest(),
      }),
      router.route({
        app_id: APP_ID,
        binding_id: audioBinding.binding_id,
        correlation_id: audioRequest().correlation_id ?? 'corr-conformance-audio-001',
        sequence: 2,
        event_id: 'audio-conformance-capture-001',
        adapter_request: audioRequest(),
      }),
      router.route({
        app_id: APP_ID,
        binding_id: inputRequest('neural_band.input', 'corr-conformance-neural-001', { gesture: 'pinch', confidence: 0.98 }).binding_id,
        correlation_id: 'corr-conformance-neural-001',
        sequence: 3,
        event_id: 'neural-conformance-001',
        adapter_request: inputRequest('neural_band.input', 'corr-conformance-neural-001', { gesture: 'pinch', confidence: 0.98 }),
      }),
      router.route({
        app_id: APP_ID,
        binding_id: inputRequest('captouch.input', 'corr-conformance-captouch-001', { touch: 'swipe_forward', confidence: 0.93 }).binding_id,
        correlation_id: 'corr-conformance-captouch-001',
        sequence: 4,
        event_id: 'captouch-conformance-001',
        adapter_request: inputRequest('captouch.input', 'corr-conformance-captouch-001', { touch: 'swipe_forward', confidence: 0.93 }),
      }),
      router.route({
        app_id: APP_ID,
        binding_id: inputRequest('motion.orientation', 'corr-conformance-motion-001', {
          orientation: 'landscape',
          motion_state: 'walking',
          confidence: 0.89,
        }).binding_id,
        correlation_id: 'corr-conformance-motion-001',
        sequence: 5,
        event_id: 'motion-conformance-001',
        adapter_request: inputRequest('motion.orientation', 'corr-conformance-motion-001', {
          orientation: 'landscape',
          motion_state: 'walking',
          confidence: 0.89,
        }),
      }),
      router.route({
        app_id: APP_ID,
        binding_id: inputRequest('phone_gps.context', 'corr-conformance-gps-001', {
          gps_context: 'nearby',
          confidence: 0.8,
        }).binding_id,
        correlation_id: 'corr-conformance-gps-001',
        sequence: 6,
        event_id: 'gps-conformance-001',
        adapter_request: inputRequest('phone_gps.context', 'corr-conformance-gps-001', {
          gps_context: 'nearby',
          confidence: 0.8,
        }),
      }),
      router.route({
        app_id: APP_ID,
        binding_id: displayBinding.binding_id,
        correlation_id: 'corr-conformance-display-001',
        sequence: 7,
        event_id: 'display-conformance-001',
        payload_refs: [displayPayload],
        bridge: networkEnvelope('display.output', displayBinding.binding_id, 'corr-conformance-display-001', [displayPayload.cid]),
        normalized_event: {
          event: 'io.display.rendered',
          widget_id: 'handsfree.summary',
          inline_asset_bytes: '[redacted]',
        },
      }),
    ];

    expect(results.map(result => result.binding.capability)).toEqual([
      'camera.photo_capture',
      'microphone.input',
      'neural_band.input',
      'captouch.input',
      'motion.orientation',
      'phone_gps.context',
      'display.output',
    ]);

    for (const result of results) {
      expect(result.status).toBe('accepted');
      assertBridgeConformance(result);
      expect(JSON.stringify(result.tool_call.arguments)).not.toMatch(/raw_audio|raw_pixels|face_embeddings|latitude|longitude/);
    }

    const networkRouted = results.filter(result => result.bridge?.app_layers.libp2p === 'provided_by_bridge');
    expect(networkRouted.length).toBeGreaterThanOrEqual(6);
    for (const result of networkRouted) {
      expect(result.peer_session?.libp2p_peer_id).toMatch(/^12D3KooW/);
      expect(result.peer_session?.libp2p_session_id).toContain('libp2p-');
      expect(result.session.peer_session?.libp2p_session_id).toContain('libp2p-');
    }

    const audio = results.find(result => result.binding.capability === 'microphone.input');
    expect(audio?.bridge?.route.raw_transport).toBe('bluetooth');
    expect(audio?.bridge?.route.bridge_route).toBe('phone-app.bluetooth-audio');
    expect(audio?.bridge?.payload_limits.inline_payload_allowed).toBe(false);

    const display = results.find(result => result.binding.capability === 'display.output');
    expect(display?.payload_refs[0].cid).toBe(displayPayload.cid);
    expect(display?.privacy.redacted_fields).toContain('inline_asset_bytes');
  });

  it('keeps persisted payload CIDs stable for deterministic camera, audio, and display operations', () => {
    const firstRouter = createMetaGlassesControlPlaneRouter(APP_ID);
    const secondRouter = createMetaGlassesControlPlaneRouter(APP_ID);
    const audioBinding = createMetaGlassesAudioAppRequirements(APP_ID)
      .find(item => item.capability === 'microphone.input');
    if (!audioBinding) throw new Error('Missing microphone binding');
    const displayBinding = binding(firstRouter, 'display.output');
    const displayCid = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    const displayPayload: MetaGlassesIOPayloadRef = {
      cid: displayCid,
      purpose: 'display_asset',
      media_type: 'application/vnd.meta-glasses.widget+json',
      retention_policy: 'pinned',
      redaction: 'metadata_only',
    };

    const cameraOne = firstRouter.route({
      app_id: APP_ID,
      binding_id: cameraRequest('corr-stable-camera').binding_id,
      correlation_id: 'corr-stable-camera',
      sequence: 1,
      event_id: 'camera-stable',
      adapter_request: cameraRequest('corr-stable-camera'),
    });
    const cameraTwo = secondRouter.route({
      app_id: APP_ID,
      binding_id: cameraRequest('corr-stable-camera').binding_id,
      correlation_id: 'corr-stable-camera',
      sequence: 1,
      event_id: 'camera-stable',
      adapter_request: cameraRequest('corr-stable-camera'),
    });
    expect(cameraOne.payload_refs[0].cid).toBe(cameraTwo.payload_refs[0].cid);
    expect(cameraOne.payload_refs[0].retention_policy).toBe('pinned');

    const audioOne = firstRouter.route({
      app_id: APP_ID,
      binding_id: audioBinding.binding_id,
      correlation_id: 'corr-stable-audio',
      sequence: 2,
      event_id: 'audio-stable',
      adapter_request: audioRequest('corr-stable-audio'),
    });
    const audioTwo = secondRouter.route({
      app_id: APP_ID,
      binding_id: audioBinding.binding_id,
      correlation_id: 'corr-stable-audio',
      sequence: 2,
      event_id: 'audio-stable',
      adapter_request: audioRequest('corr-stable-audio'),
    });
    expect(audioOne.payload_refs[0].cid).toBe(audioTwo.payload_refs[0].cid);
    expect(audioOne.payload_refs[0].cid).toBe('sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    const displayOne = firstRouter.route({
      app_id: APP_ID,
      binding_id: displayBinding.binding_id,
      correlation_id: 'corr-stable-display',
      sequence: 3,
      event_id: 'display-stable',
      payload_refs: [displayPayload],
      bridge: networkEnvelope('display.output', displayBinding.binding_id, 'corr-stable-display', [displayCid]),
    });
    const displayTwo = secondRouter.route({
      app_id: APP_ID,
      binding_id: displayBinding.binding_id,
      correlation_id: 'corr-stable-display',
      sequence: 3,
      event_id: 'display-stable',
      payload_refs: [displayPayload],
      bridge: networkEnvelope('display.output', displayBinding.binding_id, 'corr-stable-display', [displayCid]),
    });
    expect(displayOne.payload_refs[0].cid).toBe(displayTwo.payload_refs[0].cid);
    expect(displayOne.tool_call.input_cid).toBe(displayTwo.tool_call.input_cid);
  });

  it('returns deterministic validation failures for malformed envelopes and unauthorized control-plane handoffs', () => {
    const malformed = createMetaGlassesIOBridgeEnvelope({
      raw_transport: 'bluetooth',
      bridge_provider: 'phone-app',
      capability: 'microphone.input',
      correlation_id: 'corr-malformed-envelope',
    });
    const broken: MetaGlassesIOBridgeEnvelope = {
      ...malformed,
      route: {
        ...malformed.route,
        raw_transport_is_ipfs_libp2p_or_mcp: true as false,
      },
      content: [{ ...malformed.content[0], cid: 'not-a-cid' }],
      receipts: { ...malformed.receipts, mcp_event_receipt_id: '' },
    };

    const validation = validateMetaGlassesIOBridgeEnvelope(broken);
    expect(validation.conformant).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY,
        path: 'route.raw_transport_is_ipfs_libp2p_or_mcp',
      }),
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.CONTENT_CIDS,
        path: 'content',
      }),
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.RECEIPTS,
        path: 'receipts',
      }),
    ]));

    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const display = binding(router, 'display.output');
    const denied = router.route({
      app_id: APP_ID,
      binding_id: display.binding_id,
      correlation_id: 'corr-unauthorized-handoff',
      sequence: 1,
      event_id: 'unauthorized-display-handoff',
      payload_refs: [{
        cid: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        purpose: 'display_asset',
        media_type: 'application/vnd.meta-glasses.widget+json',
        retention_policy: 'policy_controlled',
        redaction: 'metadata_only',
      }],
      bridge: createMetaGlassesIOBridgeEnvelope({
        raw_transport: 'wifi',
        bridge_provider: 'display-webapp',
        capability: 'display.output',
        app_binding_id: display.binding_id,
        correlation_id: 'corr-unauthorized-handoff',
        permission_state: 'denied',
      }),
      policy: {
        decision_id: 'policy-deny-unauthorized-display-handoff',
        outcome: 'deny',
        reasons: ['unauthorized control-plane handoff'],
        required_scopes: display.required_scopes,
        granted_scopes: [],
        decision_cid: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
    });

    expect(denied.status).toBe('denied');
    expect(denied.policy_handoff.outcome).toBe('deny');
    expect(denied.receipt.receipt_kind).toBe('mcp++/policy-decision');
    expect(denied.receipt.replay_key).toBe(`${APP_ID}:${display.binding_id}:unauthorized-display-handoff:1`);
    expect(denied.session.status).toBe('blocked');
    expect(denied.fallback).toBeUndefined();
    expect(denied.receipt.receipt_cid).toMatch(CID_PATTERN);
  });

  it('proves replay protection, backpressure, payload limits, and fallback bridge states', () => {
    const router = createMetaGlassesControlPlaneRouter(APP_ID);
    const display = binding(router, 'display.output');
    const payload: MetaGlassesIOPayloadRef = {
      cid: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      purpose: 'display_asset',
      media_type: 'application/vnd.meta-glasses.widget+json',
      retention_policy: 'policy_controlled',
      redaction: 'metadata_only',
    };

    const first = router.route({
      app_id: APP_ID,
      binding_id: display.binding_id,
      correlation_id: 'corr-replay-proof',
      sequence: 11,
      event_id: 'display-replay-proof',
      payload_refs: [payload],
      bridge: networkEnvelope('display.output', display.binding_id, 'corr-replay-proof', [payload.cid]),
    });
    const replayed = router.route({
      app_id: APP_ID,
      binding_id: display.binding_id,
      correlation_id: 'corr-replay-proof',
      sequence: 11,
      event_id: 'display-replay-proof',
      payload_refs: [payload],
      bridge: networkEnvelope('display.output', display.binding_id, 'corr-replay-proof', [payload.cid]),
    });

    expect(first.status).toBe('accepted');
    expect(replayed.status).toBe('replayed');
    expect(replayed.receipt.receipt_kind).toBe('mcp++/policy-decision');
    expect(replayed.receipt.replay_key).toBe(`${APP_ID}:${display.binding_id}:display-replay-proof:11`);

    const backpressureBridge: MetaGlassesIOBridgeEnvelope = {
      ...networkEnvelope('display.output', display.binding_id, 'corr-backpressure-proof'),
      flow_control: {
        latency_ms: 125,
        jitter_ms: 28,
        backpressure: 'hard_limit',
        queued_bytes: 512_000,
        dropped_messages: 3,
      },
    };
    const backpressure = router.route({
      app_id: APP_ID,
      binding_id: display.binding_id,
      correlation_id: 'corr-backpressure-proof',
      sequence: 12,
      event_id: 'display-backpressure-proof',
      payload_refs: [payload],
      bridge: backpressureBridge,
    });
    expect(backpressure.status).toBe('backpressure');
    expect(backpressure.backpressure.state).toBe('hard_limit');
    expect(backpressure.session.status).toBe('fallback');
    expect(backpressure.fallback?.tool).toBe(display.fallback_tool);

    const fallbackBridge: MetaGlassesIOBridgeEnvelope = {
      ...networkEnvelope('display.output', display.binding_id, 'corr-fallback-proof'),
      route: {
        ...networkEnvelope('display.output', display.binding_id, 'corr-fallback-proof').route,
        readiness: 'unsupported',
      },
    };
    const fallback = router.route({
      app_id: APP_ID,
      binding_id: display.binding_id,
      correlation_id: 'corr-fallback-proof',
      sequence: 13,
      event_id: 'display-fallback-proof',
      payload_refs: [payload],
      bridge: fallbackBridge,
    });
    expect(fallback.status).toBe('unsupported');
    expect(fallback.fallback?.reason).toContain('unsupported');
    expect(fallback.receipt.receipt_cid).toMatch(CID_PATTERN);

    const tooManyContentRefs: MetaGlassesIOBridgeEnvelope = {
      ...networkEnvelope('display.output', display.binding_id, 'corr-payload-limit-proof', [payload.cid]),
      payload_limits: {
        max_payload_bytes: 1024,
        max_content_cid_count: 0,
        chunking_required_above_bytes: 1024,
        inline_payload_allowed: false,
      },
    };
    const validation = validateMetaGlassesIOBridgeEnvelope(tooManyContentRefs);
    expect(validation.conformant).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.PAYLOAD_LIMITS,
        path: 'payload_limits',
      }),
    ]));
  });

  it('fails missing policy decisions, unauthorized relays, raw transport claims, and missing receipts deterministically', () => {
    const base = networkEnvelope('display.output', 'display.output.render.binding', 'corr-negative-proof');
    const missingPolicy: MetaGlassesIOBridgeEnvelope = {
      ...base,
      policy: undefined as never,
    };
    const unauthorizedRelay: MetaGlassesIOBridgeEnvelope = {
      ...base,
      app_layers: {
        ...base.app_layers,
        libp2p: 'provided_by_bridge',
        libp2p_session_id: undefined,
      },
    };
    const rawTransportClaim: MetaGlassesIOBridgeEnvelope = {
      ...base,
      route: {
        ...base.route,
        raw_transport_is_ipfs_libp2p_or_mcp: true as false,
      },
    };
    const missingReceipts: MetaGlassesIOBridgeEnvelope = {
      ...base,
      receipts: {
        ...base.receipts,
        mcp_tool_receipt_id: '',
        policy_receipt_id: '',
      },
    };

    expect(validateMetaGlassesIOBridgeEnvelope(missingPolicy).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.POLICY_DECISION,
        path: 'policy',
      }),
    ]));
    expect(validateMetaGlassesIOBridgeEnvelope(unauthorizedRelay).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY,
        path: 'app_layers.libp2p',
      }),
    ]));
    expect(validateMetaGlassesIOBridgeEnvelope(rawTransportClaim).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY,
        path: 'route.raw_transport_is_ipfs_libp2p_or_mcp',
      }),
    ]));
    expect(validateMetaGlassesIOBridgeEnvelope(missingReceipts).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.RECEIPTS,
        path: 'receipts',
      }),
    ]));
  });
});

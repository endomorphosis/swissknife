import { computeInterfaceCID } from '../../src/services/mcp-idl';
import {
  META_GLASSES_CAMERA_ADAPTER_PROFILE,
  META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION,
  META_GLASSES_CAMERA_ADAPTER_PROPERTY,
  META_GLASSES_CAMERA_ERROR_CODES,
  createMetaGlassesCameraBridgeEnvelope,
  createMetaGlassesCameraDescriptor,
  requestMetaGlassesCameraCapture,
  validateMetaGlassesCameraCaptureResult,
  validateMetaGlassesCameraDescriptor,
  type MetaGlassesCameraCaptureRequest,
  type MetaGlassesCameraAppDescriptor,
} from '../../src/services/meta-glasses-camera-adapter';

function allowedRequest(overrides: Partial<MetaGlassesCameraCaptureRequest> = {}): MetaGlassesCameraCaptureRequest {
  return {
    request_id: 'camera-request-001',
    app_id: 'swissknife.meta-glasses.camera',
    binding_id: 'camera.photo_capture.capture_photo.binding',
    interaction: 'capture_photo',
    correlation_id: 'corr-camera-photo-001',
    storage_enabled: true,
    bridge: createMetaGlassesCameraBridgeEnvelope('photo', {
      correlation_id: 'corr-camera-photo-001',
      libp2p_peer_id: '12D3KooWCameraBridgePeer',
      libp2p_session_id: 'libp2p-session-camera-photo',
    }),
    policy: {
      explicit_user_permission: true,
      outcome: 'allow',
      granted_scopes: ['meta_glasses.camera.photo', 'meta_glasses.control.route'],
      reasons: ['user confirmed photo capture'],
    },
    ...overrides,
  };
}

describe('Meta glasses camera adapter', () => {
  it('creates app descriptors for photo capture and video stream requirements', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const camera = descriptor[META_GLASSES_CAMERA_ADAPTER_PROPERTY];
    const result = validateMetaGlassesCameraDescriptor(descriptor);
    const cid = computeInterfaceCID(descriptor);

    expect(result.conformant).toBe(true);
    expect(camera.profile).toBe(META_GLASSES_CAMERA_ADAPTER_PROFILE);
    expect(camera.profile_version).toBe(META_GLASSES_CAMERA_ADAPTER_PROFILE_VERSION);
    expect(camera.requirements.map(requirement => requirement.kind)).toEqual(
      expect.arrayContaining(['photo', 'video_stream']),
    );
    expect(camera.bindings.map(binding => binding.interaction)).toEqual(
      expect.arrayContaining(['capture_photo', 'start_video_stream', 'stop_video_stream']),
    );
    expect(camera.readiness.map(state => state.state)).toEqual(
      expect.arrayContaining(['mock', 'unsupported', 'ready', 'degraded']),
    );
    expect(descriptor.requires).toEqual(
      expect.arrayContaining(['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session']),
    );
    expect(cid).toMatch(/^sha256:/);
  });

  it('requests photo capture with explicit permission, policy checks, IPFS payload refs, and MCP++ receipts', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const result = requestMetaGlassesCameraCapture(descriptor, allowedRequest());
    const validation = validateMetaGlassesCameraCaptureResult(result);

    expect(validation.conformant).toBe(true);
    expect(result.outcome).toBe('accepted');
    expect(result.policy.outcome).toBe('allow');
    expect(result.readiness.state).toBe('ready');
    expect(result.payload_refs).toHaveLength(1);
    expect(result.payload_refs[0]).toEqual(expect.objectContaining({
      purpose: 'photo',
      media_type: 'image/jpeg',
      retention_policy: 'pinned',
      redaction: 'privacy_filtered',
    }));
    expect(result.payload_refs[0].cid).toMatch(/^sha256:/);
    expect(result.control_event.event_type).toBe('meta_glasses.camera.capture_result');
    expect(result.control_event.payload_refs[0].cid).toBe(result.payload_refs[0].cid);
    expect(result.control_event.peer_session?.libp2p_peer_id).toBe('12D3KooWCameraBridgePeer');
    expect(result.control_event.peer_session?.libp2p_session_id).toBe('libp2p-session-camera-photo');
    expect(result.receipts.map(receipt => receipt.stage)).toEqual([
      'capture_request',
      'capture_result',
    ]);
    expect(result.receipts.every(receipt => receipt.receipt_cid.startsWith('sha256:'))).toBe(true);
  });

  it('passes normalized video stream capture events through the control plane without pinned storage when disabled', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const result = requestMetaGlassesCameraCapture(
      descriptor,
      allowedRequest({
        request_id: 'camera-request-video-001',
        binding_id: 'camera.video_capture.start_video_stream.binding',
        interaction: 'start_video_stream',
        correlation_id: 'corr-camera-video-001',
        storage_enabled: false,
        bridge: createMetaGlassesCameraBridgeEnvelope('video_stream', {
          correlation_id: 'corr-camera-video-001',
          libp2p_peer_id: '12D3KooWCameraVideoBridgePeer',
          libp2p_session_id: 'libp2p-session-camera-video',
        }),
        policy: {
          explicit_user_permission: true,
          outcome: 'allow',
          granted_scopes: ['meta_glasses.camera.video', 'meta_glasses.control.route'],
          reasons: ['user confirmed video stream'],
        },
      }),
    );

    expect(validateMetaGlassesCameraCaptureResult(result).conformant).toBe(true);
    expect(result.outcome).toBe('accepted');
    expect(result.control_event.capability).toBe('camera.video_capture');
    expect(result.control_event.action_id).toBe('camera.startVideoStream');
    expect(result.payload_refs[0]).toEqual(expect.objectContaining({
      purpose: 'video',
      media_type: 'video/h264',
      retention_policy: 'session',
    }));
    expect(result.control_event.route.bridge_envelope_id).toBe(result.bridge?.envelope_id);
  });

  it('emits denial receipts when explicit permission or policy scopes are missing', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const result = requestMetaGlassesCameraCapture(
      descriptor,
      allowedRequest({
        policy: {
          explicit_user_permission: false,
          outcome: 'allow',
          granted_scopes: ['meta_glasses.control.route'],
        },
      }),
    );

    expect(result.outcome).toBe('denied');
    expect(result.policy.outcome).toBe('deny');
    expect(result.payload_refs).toEqual([]);
    expect(result.receipts.map(receipt => receipt.stage)).toEqual(['capture_request', 'denial']);
    expect(result.control_event.event_type).toBe('meta_glasses.camera.denial');
    expect(validateMetaGlassesCameraCaptureResult(result).conformant).toBe(true);
  });

  it('emits fallback receipts for degraded or unsupported camera routes', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const degradedBridge = createMetaGlassesCameraBridgeEnvelope('photo', {
      correlation_id: 'corr-camera-photo-degraded',
    });
    degradedBridge.route.readiness = 'degraded';

    const result = requestMetaGlassesCameraCapture(
      descriptor,
      allowedRequest({
        correlation_id: 'corr-camera-photo-degraded',
        bridge: degradedBridge,
      }),
    );

    expect(result.outcome).toBe('fallback');
    expect(result.readiness.state).toBe('degraded');
    expect(result.policy.outcome).toBe('fallback');
    expect(result.receipts.map(receipt => receipt.stage)).toEqual(['capture_request', 'fallback']);
    expect(result.control_event.route.selected_surface).toBe('mobile-fallback');
    expect(validateMetaGlassesCameraCaptureResult(result).conformant).toBe(true);
  });

  it('emits error receipts for adapter execution failures', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const result = requestMetaGlassesCameraCapture(
      descriptor,
      allowedRequest({
        force_error: 'camera bridge timed out',
      }),
    );

    expect(result.outcome).toBe('error');
    expect(result.error).toBe('camera bridge timed out');
    expect(result.receipts.map(receipt => receipt.stage)).toEqual(['capture_request', 'error']);
    expect(result.control_event.event_type).toBe('meta_glasses.camera.error');
    expect(validateMetaGlassesCameraCaptureResult(result).conformant).toBe(true);
  });

  it('rejects descriptors that omit camera requirements or app action bindings', () => {
    const descriptor = createMetaGlassesCameraDescriptor();
    const broken: MetaGlassesCameraAppDescriptor = {
      ...descriptor,
      [META_GLASSES_CAMERA_ADAPTER_PROPERTY]: {
        ...descriptor[META_GLASSES_CAMERA_ADAPTER_PROPERTY],
        requirements: descriptor[META_GLASSES_CAMERA_ADAPTER_PROPERTY].requirements.filter(
          requirement => requirement.kind !== 'video_stream',
        ),
        bindings: [],
      },
    };

    const result = validateMetaGlassesCameraDescriptor(broken);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: META_GLASSES_CAMERA_ERROR_CODES.REQUIREMENT }),
        expect.objectContaining({ code: META_GLASSES_CAMERA_ERROR_CODES.BINDING }),
      ]),
    );
  });
});

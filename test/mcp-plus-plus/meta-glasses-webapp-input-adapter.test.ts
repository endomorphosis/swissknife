import { computeInterfaceCID } from '../../src/services/mcp-idl';
import { META_GLASSES_IO_PERMISSION_SCOPES } from '../../src/services/meta-glasses-io-profile';
import {
  META_GLASSES_WEBAPP_INPUT_ADAPTER_ID,
  createMetaGlassesWebAppInputAdapterDescriptor,
  createMetaGlassesWebAppInputBindings,
  routeMetaGlassesWebAppInputEvent,
  type MetaGlassesWebAppInputEventRequest,
  type MetaGlassesWebAppInputSource,
} from '../../src/services/glasses/meta-glasses-webapp-input-adapter';

const APP_ID = 'com.example.webapp';

function requestFor(
  source: MetaGlassesWebAppInputSource,
  overrides: Partial<MetaGlassesWebAppInputEventRequest> = {},
): MetaGlassesWebAppInputEventRequest {
  const binding = createMetaGlassesWebAppInputBindings(APP_ID).find(item => item.source === source);
  if (!binding) {
    throw new Error(`missing binding for ${source}`);
  }
  return {
    app_id: APP_ID,
    binding_id: binding.binding_id,
    source,
    input_id: `${source}-webapp-001`,
    correlation_id: `${source}-corr-001`,
    sequence: 5,
    timestamp_ms: 1_000,
    received_at_ms: 1_010,
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    explicit_user_permission: true,
    ...overrides,
  };
}

describe('Meta glasses Web Apps input adapter', () => {
  it('declares Web Apps input bindings and unsupported media assumptions', () => {
    const descriptor = createMetaGlassesWebAppInputAdapterDescriptor(APP_ID);

    expect(descriptor.meta_glasses_webapp_input.adapter_id).toBe(META_GLASSES_WEBAPP_INPUT_ADAPTER_ID);
    expect(descriptor.meta_glasses_webapp_input.descriptor_cid).toBe(
      computeInterfaceCID({
        name: descriptor.name,
        namespace: descriptor.namespace,
        version: descriptor.version,
        methods: descriptor.methods,
        errors: descriptor.errors,
        requires: descriptor.requires,
        compatibility: descriptor.compatibility,
        semanticTags: descriptor.semanticTags,
        observability: descriptor.observability,
        interaction_patterns: descriptor.interaction_patterns,
        meta_glasses_io: descriptor.meta_glasses_io,
      }),
    );
    expect(descriptor.meta_glasses_webapp_input.bindings.map(binding => binding.source)).toEqual([
      'neural_band',
      'captouch',
      'motion',
      'phone_gps',
    ]);
    expect(descriptor.meta_glasses_webapp_input.bindings[0].dom_events).toEqual([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
    ]);
    expect(descriptor.meta_glasses_webapp_input.unsupported_webapp_assumptions).toEqual([
      'camera.photo_capture',
      'camera.video_capture',
      'microphone.input',
      'speaker.output',
      'headphone.output',
    ]);
    expect(descriptor.meta_glasses_webapp_input.privacy).toEqual({
      raw_sensor_samples_allowed: false,
      precise_gps_allowed: false,
      camera_microphone_audio_allowed: false,
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/DAT SDK|AudioAccess|CameraAccess|latitude|longitude/);
  });

  it('maps Neural Band Arrow and Enter keys into normalized Swissknife intent descriptors', () => {
    const descriptor = createMetaGlassesWebAppInputAdapterDescriptor(APP_ID);
    const enter = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('neural_band', { key: 'Enter', sample: { confidence: 0.96 } }),
    );
    const arrow = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('neural_band', {
        input_id: 'neural-band-arrow-right',
        key: 'ArrowRight',
        sequence: 6,
        sample: { confidence: 0.9 },
      }),
    );

    expect(enter.status).toBe('allowed');
    expect(enter.intent_descriptor).toEqual(expect.objectContaining({
      intent: 'intent.webapp.neural_band.confirm',
      dom_event: 'Enter',
      app_binding_id: 'neural_band.input.binding',
      target: 'command',
      target_id: 'commands.confirm_selection',
    }));
    expect(enter.normalized_event.payload_summary).toEqual({
      gesture: 'confirm',
      confidence: 0.96,
    });
    expect(arrow.intent_descriptor?.intent).toBe('intent.webapp.neural_band.navigate_right');
    expect(arrow.normalized_event.payload_summary.gesture).toBe('navigate_right');
    expect(enter.receipts.map(receipt => receipt.webapp_stage)).toEqual([
      'authorization',
      'control_route',
      'webapp_intent',
    ]);
  });

  it('maps captouch Arrow and Enter keys while preserving app binding IDs', () => {
    const result = routeMetaGlassesWebAppInputEvent(
      createMetaGlassesWebAppInputAdapterDescriptor(APP_ID),
      requestFor('captouch', { key: 'ArrowLeft', sample: { confidence: 0.82 } }),
    );

    expect(result.status).toBe('allowed');
    expect(result.app_binding_id).toBe('captouch.input.binding');
    expect(result.intent_descriptor).toEqual(expect.objectContaining({
      intent: 'intent.webapp.captouch.navigate_left',
      binding_id: 'captouch.input.binding',
      app_binding_id: 'captouch.input.binding',
    }));
    expect(result.normalized_event.payload_summary).toEqual({
      touch: 'swipe_back',
      confidence: 0.82,
    });
    expect(result.receipts.every(receipt => receipt.app_binding_id === 'captouch.input.binding')).toBe(true);
  });

  it('folds motion and phone GPS into privacy-safe context descriptors', () => {
    const descriptor = createMetaGlassesWebAppInputAdapterDescriptor(APP_ID);
    const motion = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('motion', {
        sample: { orientation: 'landscape', motion_state: 'turning', confidence: 0.74 },
      }),
    );
    const gps = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('phone_gps', {
        sample: { gps_context: 'in_transit', confidence: 0.88 },
      }),
    );

    expect(motion.status).toBe('allowed');
    expect(motion.context_descriptor).toEqual(expect.objectContaining({
      source: 'motion',
      privacy: 'privacy_filtered',
      context: {
        orientation: 'landscape',
        motion_state: 'turning',
        confidence: 0.74,
      },
    }));
    expect(gps.context_descriptor).toEqual(expect.objectContaining({
      source: 'phone_gps',
      privacy: 'metadata_only',
      context: {
        gps_context: 'in_transit',
        location_precision: 'coarse',
        precise_coordinates_redacted: true,
      },
    }));
    expect(JSON.stringify(gps)).not.toMatch(/latitude|longitude|"lat"|"lon"/);
    expect(gps.receipts.map(receipt => receipt.webapp_stage)).toEqual([
      'authorization',
      'control_route',
      'context_descriptor',
    ]);
  });

  it('denies Web Apps input when policy scopes are missing', () => {
    const result = routeMetaGlassesWebAppInputEvent(
      createMetaGlassesWebAppInputAdapterDescriptor(APP_ID),
      requestFor('captouch', {
        key: 'Enter',
        granted_scopes: ['meta_glasses.control.route'],
      }),
    );

    expect(result.status).toBe('denied');
    expect(result.authorized).toBe(false);
    expect(result.missing_scopes).toContain('meta_glasses.captouch.input');
    expect(result.policy_decision.outcome).toBe('deny');
    expect(result.receipts.map(receipt => receipt.webapp_stage)).toEqual([
      'authorization',
      'control_route',
      'denial',
    ]);
  });

  it('rejects camera, microphone, and audio assumptions for Web Apps', () => {
    const descriptor = createMetaGlassesWebAppInputAdapterDescriptor(APP_ID);
    const camera = routeMetaGlassesWebAppInputEvent(
      descriptor,
      {
        ...requestFor('neural_band', { key: 'Enter' }),
        source: 'camera',
        capability: 'camera.photo_capture',
        input_id: 'camera-webapp-attempt',
      },
    );
    const microphone = routeMetaGlassesWebAppInputEvent(
      descriptor,
      {
        ...requestFor('neural_band', { key: 'Enter' }),
        source: 'microphone',
        capability: 'microphone.input',
        input_id: 'microphone-webapp-attempt',
      },
    );
    const audio = routeMetaGlassesWebAppInputEvent(
      descriptor,
      {
        ...requestFor('neural_band', { key: 'Enter' }),
        source: 'audio',
        capability: 'speaker.output',
        input_id: 'audio-webapp-attempt',
      },
    );

    expect([camera.status, microphone.status, audio.status]).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
    ]);
    expect(camera.error).toContain('camera.photo_capture is not available');
    expect(microphone.error).toContain('microphone.input is not available');
    expect(audio.error).toContain('speaker.output is not available');
    expect(camera.route_decision.selected_surface).toBe('mobile-fallback');
    expect(camera.receipts.map(receipt => receipt.webapp_stage)).toContain('unsupported');
  });

  it('emits fallback, stale, replay, and throttled receipts for degraded Web Apps routes', () => {
    const descriptor = createMetaGlassesWebAppInputAdapterDescriptor(APP_ID);
    const fallback = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('neural_band', { key: 'Enter', readiness: 'route_lost' }),
    );
    const stale = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('motion', {
        timestamp_ms: 1_000,
        received_at_ms: 2_000,
      }),
    );
    const replayed = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('captouch', {
        key: 'Enter',
        input_id: 'captouch-duplicate',
        seen_input_ids: ['captouch-duplicate'],
      }),
    );
    const throttled = routeMetaGlassesWebAppInputEvent(
      descriptor,
      requestFor('motion', {
        timestamp_ms: 1_040,
        received_at_ms: 1_050,
        last_event_timestamp_ms: 1_000,
      }),
    );

    expect(fallback.status).toBe('fallback');
    expect(fallback.policy_decision.outcome).toBe('fallback');
    expect(fallback.receipts.map(receipt => receipt.webapp_stage)).toContain('fallback');
    expect(stale.status).toBe('stale');
    expect(stale.receipts.map(receipt => receipt.webapp_stage)).toContain('stale');
    expect(replayed.status).toBe('replayed');
    expect(replayed.receipts.map(receipt => receipt.webapp_stage)).toContain('replay');
    expect(throttled.status).toBe('throttled');
    expect(throttled.policy_decision.reasons.join('\n')).toContain('throttled');
    expect(throttled.receipts.map(receipt => receipt.webapp_stage)).toContain('throttled');
  });
});

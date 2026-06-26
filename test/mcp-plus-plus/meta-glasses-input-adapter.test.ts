import { computeInterfaceCID } from '../../src/services/mcp-idl';
import {
  META_GLASSES_INPUT_ADAPTER_ID,
  createMetaGlassesInputAdapterDescriptor,
  createMetaGlassesInputAppBindings,
  createMetaGlassesInputBridgeEnvelope,
  routeMetaGlassesInputEvent,
  type MetaGlassesInputCapability,
  type MetaGlassesInputEventRequest,
} from '../../src/services/meta-glasses-input-adapter';
import { META_GLASSES_IO_PERMISSION_SCOPES } from '../../src/services/meta-glasses-io-profile';

const APP_ID = 'com.example.inputs';

function requestFor(
  capability: MetaGlassesInputCapability,
  overrides: Partial<MetaGlassesInputEventRequest> = {},
): MetaGlassesInputEventRequest {
  const binding = createMetaGlassesInputAppBindings(APP_ID).find(item => item.capability === capability);
  if (!binding) {
    throw new Error(`missing binding for ${capability}`);
  }
  return {
    app_id: APP_ID,
    capability,
    binding_id: binding.binding_id,
    input_id: `${capability}-input-001`,
    correlation_id: `${capability}-corr-001`,
    sequence: 10,
    timestamp_ms: 1_000,
    received_at_ms: 1_020,
    granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    explicit_user_permission: true,
    bridge: createMetaGlassesInputBridgeEnvelope(capability, {
      correlation_id: `${capability}-corr-001`,
      libp2p_peer_id: '12D3KooWInputBridgePeer',
      libp2p_session_id: 'libp2p-session-input',
    }),
    ...overrides,
  };
}

describe('Meta glasses input adapter', () => {
  it('declares Neural Band, captouch, motion, and GPS input descriptors', () => {
    const descriptor = createMetaGlassesInputAdapterDescriptor(APP_ID);

    expect(descriptor.meta_glasses_input.adapter_id).toBe(META_GLASSES_INPUT_ADAPTER_ID);
    expect(descriptor.meta_glasses_input.descriptor_cid).toBe(
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
    expect(descriptor.meta_glasses_input.bindings.map(binding => binding.capability)).toEqual([
      'neural_band.input',
      'captouch.input',
      'motion.orientation',
      'phone_gps.context',
    ]);
    expect(descriptor.meta_glasses_input.bindings.map(binding => binding.target)).toEqual([
      'command',
      'view',
      'view',
      'agent_action',
    ]);
    expect(descriptor.meta_glasses_input.privacy).toEqual({
      default_redaction: 'metadata_only',
      precise_gps_redacted_by_default: true,
      raw_sensor_samples_allowed: false,
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/DisplayAccess|NeuralBandAccess|DAT SDK/);
  });

  it('routes allowed Neural Band gestures with session identity, route decisions, and MCP++ receipts', () => {
    const result = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('neural_band.input', {
        sample: { gesture: 'pinch', confidence: 0.98 },
      }),
    );

    expect(result.status).toBe('allowed');
    expect(result.authorized).toBe(true);
    expect(result.normalized_event).toEqual(expect.objectContaining({
      event: 'io.neural_band.intent',
      intent: 'intent.neural_band.input',
      target: 'command',
      target_id: 'commands.confirm_selection',
    }));
    expect(result.normalized_event.payload_summary).toEqual({
      gesture: 'pinch',
      confidence: 0.98,
    });
    expect(result.route_decision.route).toBe('swissknife.webapp_bridge.publish_display_event');
    expect(result.route_decision.peer_session?.libp2p_peer_id).toBe('12D3KooWInputBridgePeer');
    expect(result.route_decision.peer_session?.libp2p_session_id).toBe('libp2p-session-input');
    expect(result.receipts.map(receipt => receipt.input_stage)).toEqual([
      'authorization',
      'control_route',
      'normalized_event',
    ]);
    expect(result.receipts.every(receipt => receipt.receipt_cid?.startsWith('sha256:'))).toBe(true);
  });

  it('denies captouch input when Hallucinate App policy cannot authorize required scopes', () => {
    const result = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('captouch.input', {
        granted_scopes: ['meta_glasses.control.route'],
        sample: { touch: 'swipe_forward', confidence: 0.8 },
      }),
    );

    expect(result.status).toBe('denied');
    expect(result.authorized).toBe(false);
    expect(result.missing_scopes).toContain('meta_glasses.captouch.input');
    expect(result.policy_decision.outcome).toBe('deny');
    expect(result.receipts.map(receipt => receipt.input_stage)).toEqual([
      'authorization',
      'control_route',
      'denial',
    ]);
  });

  it('reports unsupported and disconnected route states without dropping control-plane metadata', () => {
    const unsupported = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('motion.orientation', { readiness: 'unsupported', bridge: undefined }),
    );
    const disconnected = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('neural_band.input', { readiness: 'disconnected', bridge: undefined }),
    );

    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.policy_decision.outcome).toBe('deny');
    expect(unsupported.route_decision.selected_surface).toBe('mobile-fallback');
    expect(unsupported.receipts.map(receipt => receipt.input_stage)).toContain('unsupported');
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.policy_decision.outcome).toBe('fallback');
    expect(disconnected.route_decision.readiness).toBe('disconnected');
    expect(disconnected.receipts.map(receipt => receipt.input_stage)).toContain('disconnected');
  });

  it('marks stale and high-frequency motion inputs as degraded descriptors', () => {
    const stale = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('motion.orientation', {
        timestamp_ms: 1_000,
        received_at_ms: 2_000,
        sample: { orientation: 'landscape', motion_state: 'turning', confidence: 0.74 },
      }),
    );
    const throttled = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('motion.orientation', {
        timestamp_ms: 1_040,
        received_at_ms: 1_050,
        last_event_timestamp_ms: 1_000,
      }),
    );

    expect(stale.status).toBe('stale');
    expect(stale.readiness).toBe('stale_session');
    expect(stale.policy_decision.outcome).toBe('degrade');
    expect(stale.receipts.map(receipt => receipt.input_stage)).toContain('stale');
    expect(throttled.status).toBe('throttled');
    expect(throttled.policy_decision.reasons.join('\n')).toContain('throttled');
    expect(throttled.receipts.map(receipt => receipt.input_stage)).toContain('throttled');
  });

  it('rejects replayed input events by input id or non-increasing sequence', () => {
    const byId = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('captouch.input', {
        input_id: 'captouch-duplicate',
        seen_input_ids: ['captouch-duplicate'],
      }),
    );
    const bySequence = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('captouch.input', {
        sequence: 4,
        last_sequence: 4,
      }),
    );

    expect(byId.status).toBe('replayed');
    expect(byId.policy_decision.outcome).toBe('deny');
    expect(byId.receipts.map(receipt => receipt.input_stage)).toContain('replay');
    expect(bySequence.status).toBe('replayed');
  });

  it('routes phone GPS context as privacy-safe coarse context for agent actions', () => {
    const result = routeMetaGlassesInputEvent(
      createMetaGlassesInputAdapterDescriptor(APP_ID),
      requestFor('phone_gps.context', {
        sample: { gps_context: 'arrived', confidence: 0.91 },
      }),
    );

    expect(result.status).toBe('allowed');
    expect(result.normalized_event.target).toBe('agent_action');
    expect(result.normalized_event.target_id).toBe('agent.update_location_context');
    expect(result.normalized_event.payload_summary).toEqual({
      gps_context: 'arrived',
      location_precision: 'coarse',
      precise_coordinates_redacted: true,
    });
    expect(JSON.stringify(result.normalized_event)).not.toMatch(/latitude|longitude|"lat"|"lon"/);
    expect(result.payload_refs[0]).toEqual(expect.objectContaining({
      purpose: 'sensor_sample',
      retention_policy: 'ephemeral',
      redaction: 'metadata_only',
    }));
  });
});

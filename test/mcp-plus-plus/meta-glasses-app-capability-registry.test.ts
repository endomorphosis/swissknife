import { computeInterfaceCID } from '../../src/services/mcp-idl';
import {
  META_GLASSES_APP_CAPABILITY_REGISTRY_ID,
  createDefaultMetaGlassesAppCapabilityRegistry,
  createMetaGlassesAppCapabilityDescriptor,
  findMetaGlassesAppCapability,
  listMetaGlassesAppCapabilities,
  requestMetaGlassesAppCapability,
  type MetaGlassesAppCapabilityId,
} from '../../src/services/glasses/meta-glasses-app-capability-registry';
import {
  META_GLASSES_IO_PERMISSION_SCOPES,
  META_GLASSES_IO_PROFILE_PROPERTY,
} from '../../src/services/meta-glasses-io-profile';

describe('Meta glasses app capability registry', () => {
  it('enumerates SDK-free app-facing capabilities for every I/O surface plus fallback states', () => {
    const registry = createDefaultMetaGlassesAppCapabilityRegistry();
    const ids = listMetaGlassesAppCapabilities(registry).map(entry => entry.capability_id);

    expect(registry.registry_id).toBe(META_GLASSES_APP_CAPABILITY_REGISTRY_ID);
    expect(registry.sdk_import_required).toBe(false);
    expect(registry.descriptor_cid).toMatch(/^sha256:/);
    expect(registry.descriptor[META_GLASSES_IO_PROFILE_PROPERTY]).toBeDefined();
    expect(ids).toEqual(
      expect.arrayContaining([
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
        'fallback.route',
        'unsupported.capability',
      ] satisfies MetaGlassesAppCapabilityId[]),
    );
    expect(JSON.stringify(registry)).not.toMatch(/DisplayAccess|CameraAccess|Wearables|DAT SDK/);
  });

  it('projects bindings, scopes, readiness, policy, route decisions, descriptor refs, and fallback behavior', () => {
    const registry = createDefaultMetaGlassesAppCapabilityRegistry({ app_id: 'com.example.app' });
    const camera = findMetaGlassesAppCapability(registry, 'camera.photo_capture');
    const neuralBand = findMetaGlassesAppCapability(registry, 'neural_band.input');
    const fallback = findMetaGlassesAppCapability(registry, 'fallback.route');

    expect(camera?.app_id).toBe('com.example.app');
    expect(camera?.app_binding_ids).toContain('camera.photo_capture.binding');
    expect(camera?.permission_scopes).toEqual(
      expect.arrayContaining(['meta_glasses.camera.photo', 'meta_glasses.control.route']),
    );
    expect(camera?.route_readiness).toBe('ready');
    expect(camera?.policy_requirements.default_deny).toBe(true);
    expect(camera?.policy_requirements.policy_gate).toBe('hallucinate_app.control_surface');
    expect(camera?.control_plane_route_decisions[0].receipt.receipt_kind).toBe('mcp++/control-route');
    expect(camera?.mcp_descriptor_refs[0].interface_cid).toBe(registry.descriptor_cid);
    expect(camera?.mcp_descriptor_refs[0].profile_property).toBe(META_GLASSES_IO_PROFILE_PROPERTY);
    expect(camera?.fallback_behavior.routes[0].to_surface).toBe('mobile-fallback');
    expect(camera?.dat_sdk_import_required).toBe(false);

    expect(neuralBand?.source).toBe('display-webapp');
    expect(neuralBand?.fallback_behavior.routes.map(route => route.to_surface)).toEqual(
      expect.arrayContaining(['simulator', 'mobile-fallback']),
    );

    expect(fallback?.source).toBe('swissknife-fallback');
    expect(fallback?.permission_scopes).toEqual(['meta_glasses.control.route']);
    expect(fallback?.fallback_behavior.readiness_triggers).toEqual(
      expect.arrayContaining(['permission_denied', 'route_lost', 'unsupported']),
    );
  });

  it('creates MCP++ descriptor references with stable content-addressed IDs', () => {
    const descriptor = createMetaGlassesAppCapabilityDescriptor();
    const registry = createDefaultMetaGlassesAppCapabilityRegistry({ descriptor });
    const descriptorCid = computeInterfaceCID(descriptor);
    const display = findMetaGlassesAppCapability(registry, 'display.output');

    expect(display?.mcp_descriptor_refs[0].descriptor_id).toBe(
      META_GLASSES_APP_CAPABILITY_REGISTRY_ID,
    );
    expect(display?.mcp_descriptor_refs[0].interface_cid).toBe(descriptorCid);
    expect(display?.mcp_descriptor_refs[0].capability_methods).toEqual(
      expect.arrayContaining(['display_output', 'camera_photo_capture']),
    );
    expect(display?.mcp_descriptor_refs[0].required_profiles).toEqual(
      expect.arrayContaining(['mcp++/receipts', 'mcp++/policy', 'libp2p/session']),
    );
  });

  it('requires permission scopes before returning a ready route decision', () => {
    const registry = createDefaultMetaGlassesAppCapabilityRegistry();

    const permissionRequired = requestMetaGlassesAppCapability(registry, {
      capability_id: 'microphone.input',
      granted_scopes: ['meta_glasses.control.route'],
    });
    const ready = requestMetaGlassesAppCapability(registry, {
      capability_id: 'microphone.input',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      preferred_surface: 'bluetooth-audio',
    });

    expect(permissionRequired.status).toBe('permission_required');
    expect(permissionRequired.granted).toBe(false);
    expect(permissionRequired.missing_scopes).toContain('meta_glasses.microphone.capture');
    expect(permissionRequired.policy_decision.outcome).toBe('require_confirmation');

    expect(ready.status).toBe('ready');
    expect(ready.granted).toBe(true);
    expect(ready.selected_route?.selected_surface).toBe('bluetooth-audio');
    expect(ready.selected_route?.peer_session.libp2p_session_id).toContain('libp2p-session');
  });

  it('selects fallback behavior for degraded or lost routes', () => {
    const registry = createDefaultMetaGlassesAppCapabilityRegistry();
    const displayFallback = requestMetaGlassesAppCapability(registry, {
      capability_id: 'display.output',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      readiness_override: 'firmware_update_required',
    });
    const audioFallback = requestMetaGlassesAppCapability(registry, {
      capability_id: 'speaker.output',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      readiness_override: 'route_lost',
    });

    expect(displayFallback.status).toBe('fallback');
    expect(displayFallback.fallback_route?.to_surface).toEqual(
      expect.stringMatching(/display-webapp|simulator|mobile-fallback/),
    );
    expect(displayFallback.policy_decision.outcome).toBe('fallback');

    expect(audioFallback.status).toBe('fallback');
    expect(audioFallback.fallback_route?.when).toContain('route_lost');
    expect(audioFallback.fallback_route?.policy_decision.required_scopes).toContain(
      'meta_glasses.control.route',
    );
  });

  it('allows applications to request the synthetic fallback routing capability', () => {
    const registry = createDefaultMetaGlassesAppCapabilityRegistry();
    const fallback = requestMetaGlassesAppCapability(registry, {
      capability_id: 'fallback.route',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    });

    expect(fallback.status).toBe('fallback');
    expect(fallback.granted).toBe(true);
    expect(fallback.entry.capability_id).toBe('fallback.route');
    expect(fallback.fallback_route?.policy_decision.outcome).toBe('fallback');
  });

  it('returns structured unsupported and app-binding denial decisions', () => {
    const registry = createDefaultMetaGlassesAppCapabilityRegistry({ app_id: 'com.example.bound' });

    const unsupported = requestMetaGlassesAppCapability(registry, {
      capability_id: 'not.real' as MetaGlassesAppCapabilityId,
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    });
    const denied = requestMetaGlassesAppCapability(registry, {
      capability_id: 'camera.photo_capture',
      app_id: 'com.example.other',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
    });

    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.granted).toBe(false);
    expect(unsupported.entry.capability_id).toBe('unsupported.capability');
    expect(unsupported.policy_decision.outcome).toBe('deny');
    expect(unsupported.reasons.join('\n')).toContain('unsupported');

    expect(denied.status).toBe('denied');
    expect(denied.policy_decision.outcome).toBe('deny');
    expect(denied.reasons.join('\n')).toContain('com.example.bound');
  });
});

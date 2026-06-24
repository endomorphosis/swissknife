import { computeInterfaceCID } from '../../src/services/mcp-idl';
import {
  META_GLASSES_IO_ERROR_CODES,
  META_GLASSES_IO_PERMISSION_SCOPES,
  META_GLASSES_IO_PROFILE,
  META_GLASSES_IO_PROFILE_PROPERTY,
  META_GLASSES_IO_PROFILE_VERSION,
  META_GLASSES_IO_READINESS_STATES,
  META_GLASSES_IO_REQUIRED_CAPABILITIES,
  assertMetaGlassesIOProfile,
  createDefaultMetaGlassesIOProfile,
  findMetaGlassesIOCapability,
  validateMetaGlassesIOProfile,
  validateMetaGlassesIOProfileDescriptor,
  type MetaGlassesIOProfileDescriptor,
} from '../../src/services/meta-glasses-io-profile';

function descriptor(): MetaGlassesIOProfileDescriptor {
  return {
    name: 'meta-glasses-io-capability-contract',
    namespace: 'org.handsfree.meta_glasses',
    version: '1.0.0',
    methods: META_GLASSES_IO_REQUIRED_CAPABILITIES.map(kind => ({
      name: kind.replace('.', '_'),
      input_schema: { type: 'object', additionalProperties: true },
      output_schema: { type: 'object', additionalProperties: true },
    })),
    errors: [{ name: 'CapabilityUnavailable' }, { name: 'PolicyDenied' }],
    requires: ['mcp++/idl', 'mcp++/receipts', 'mcp++/policy', 'libp2p/session'],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['meta-glasses', 'io-capability', 'mcp++'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    [META_GLASSES_IO_PROFILE_PROPERTY]: createDefaultMetaGlassesIOProfile(),
  };
}

describe('Meta glasses I/O profile contract', () => {
  it('defines a versioned default profile covering every researched I/O surface', () => {
    const profile = createDefaultMetaGlassesIOProfile();
    const result = validateMetaGlassesIOProfile(profile);

    expect(profile.profile).toBe(META_GLASSES_IO_PROFILE);
    expect(profile.profile_version).toBe(META_GLASSES_IO_PROFILE_VERSION);
    expect(result.conformant).toBe(true);
    expect(result.errors).toEqual([]);
    expect(profile.capabilities.map(capability => capability.kind)).toEqual(
      expect.arrayContaining([...META_GLASSES_IO_REQUIRED_CAPABILITIES]),
    );
    expect(profile.readiness_states).toEqual(
      expect.arrayContaining([...META_GLASSES_IO_READINESS_STATES]),
    );
    expect(profile.permissions.default_deny).toBe(true);
    expect(profile.permissions.scopes).toEqual(
      expect.arrayContaining([...META_GLASSES_IO_PERMISSION_SCOPES]),
    );
    expect(() => assertMetaGlassesIOProfile(profile)).not.toThrow();
  });

  it('records capability readiness, degraded states, unsupported surfaces, and fallback routes', () => {
    const profile = createDefaultMetaGlassesIOProfile();
    const display = findMetaGlassesIOCapability(profile, 'display.output');
    const neuralBand = findMetaGlassesIOCapability(profile, 'neural_band.input');
    const microphone = findMetaGlassesIOCapability(profile, 'microphone.input');

    expect(display?.primary_surface).toBe('dat-native');
    expect(display?.supported_surfaces).toEqual(
      expect.arrayContaining(['dat-native', 'display-webapp', 'simulator', 'mobile-fallback']),
    );
    expect(display?.degraded_when).toEqual(
      expect.arrayContaining([
        'dat_app_update_required',
        'firmware_update_required',
        'package_or_release_channel_unavailable',
      ]),
    );
    expect(display?.fallback_routes.map(route => route.to_surface)).toEqual(
      expect.arrayContaining(['display-webapp', 'simulator', 'mobile-fallback']),
    );

    expect(neuralBand?.primary_surface).toBe('display-webapp');
    expect(neuralBand?.unsupported_on).toContain('dat-native');
    expect(neuralBand?.application_bindings[0].interaction).toBe('gesture');

    expect(microphone?.primary_surface).toBe('bluetooth-audio');
    expect(microphone?.payloads).toEqual(expect.arrayContaining(['audio', 'transcript']));
    expect(microphone?.fallback_routes[0].when).toEqual(
      expect.arrayContaining(['permission_denied', 'route_lost']),
    );
  });

  it('requires application bindings, policy decisions, route decisions, content refs, peer sessions, and receipts', () => {
    const profile = createDefaultMetaGlassesIOProfile();

    for (const capability of profile.capabilities) {
      expect(capability.application_bindings.length).toBeGreaterThan(0);
      expect(capability.fallback_routes.length).toBeGreaterThan(0);
      expect(capability.route_decisions.length).toBeGreaterThan(0);

      for (const binding of capability.application_bindings) {
        expect(binding.app_id).toBe('swissknife.meta-glasses');
        expect(binding.method).toContain('_');
      }

      for (const fallback of capability.fallback_routes) {
        expect(fallback.policy_decision.outcome).toBe('fallback');
        expect(fallback.policy_decision.required_scopes).toContain('meta_glasses.control.route');
      }

      for (const decision of capability.route_decisions) {
        expect(decision.policy_decision.outcome).toBe('allow');
        expect(decision.peer_session.libp2p_peer_id).toMatch(/^12D3KooW/);
        expect(decision.peer_session.libp2p_session_id).toContain('libp2p-session');
        expect(decision.peer_session.mcp_session_id).toContain('mcp-session');
        expect(decision.payload_refs.every(ref => ref.cid.startsWith('sha256:'))).toBe(true);
        expect(decision.receipt.receipt_kind).toBe('mcp++/control-route');
        expect(decision.receipt.correlation_id_field).toBe('correlation_id');
        expect(decision.receipt.output_refs?.[0].cid).toMatch(/^sha256:/);
      }
    }
  });

  it('can be embedded in an MCP-IDL descriptor and content addressed', () => {
    const ioDescriptor = descriptor();
    const result = validateMetaGlassesIOProfileDescriptor(ioDescriptor);
    const cid = computeInterfaceCID(ioDescriptor);

    expect(result.conformant).toBe(true);
    expect(cid).toMatch(/^sha256:/);
    expect(ioDescriptor.requires).toEqual(
      expect.arrayContaining(['mcp++/receipts', 'mcp++/policy', 'libp2p/session']),
    );
  });

  it('rejects incomplete profiles with stable validation codes', () => {
    const profile = createDefaultMetaGlassesIOProfile();
    const invalid = {
      ...profile,
      capabilities: profile.capabilities.filter(
        capability => capability.kind !== 'phone_gps.context',
      ),
    };

    const result = validateMetaGlassesIOProfile(invalid);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: META_GLASSES_IO_ERROR_CODES.CAPABILITY_MISSING,
          path: `${META_GLASSES_IO_PROFILE_PROPERTY}.capabilities`,
        }),
      ]),
    );
  });

  it('rejects route decisions that omit libp2p session identifiers or MCP++ receipt metadata', () => {
    const profile = createDefaultMetaGlassesIOProfile();
    const broken = {
      ...profile,
      capabilities: profile.capabilities.map(capability => (
        capability.kind === 'camera.photo_capture'
          ? {
            ...capability,
            route_decisions: [
              {
                ...capability.route_decisions[0],
                peer_session: { libp2p_peer_id: '' },
                receipt: { receipt_kind: 'unknown', correlation_id_field: '' },
                payload_refs: [{ cid: 'not-a-cid', purpose: 'photo' }],
              },
            ],
          }
          : capability
      )),
    };

    const result = validateMetaGlassesIOProfile(broken);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: META_GLASSES_IO_ERROR_CODES.LIBP2P_SESSION }),
        expect.objectContaining({ code: META_GLASSES_IO_ERROR_CODES.RECEIPT_METADATA }),
        expect.objectContaining({ code: META_GLASSES_IO_ERROR_CODES.PAYLOAD_REF }),
      ]),
    );
  });
});

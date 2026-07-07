import { computeInterfaceCID } from '../../src/services/mcp/mcp-idl';
import {
  META_GLASSES_AUDIO_ADAPTER_ID,
  createMetaGlassesAudioAdapterDescriptor,
  createMetaGlassesAudioAppRequirements,
  requestMetaGlassesAudioRoute,
} from '../../src/services/glasses/meta-glasses-audio-adapter';
import { META_GLASSES_IO_PERMISSION_SCOPES } from '../../src/services/glasses/meta-glasses-io-profile';

describe('Meta glasses audio adapter', () => {
  it('declares microphone, speaker, and headphone requirements without DAT SDK imports', () => {
    const descriptor = createMetaGlassesAudioAdapterDescriptor('com.example.audio');
    const requirements = createMetaGlassesAudioAppRequirements('com.example.audio');

    expect(descriptor.meta_glasses_audio.adapter_id).toBe(META_GLASSES_AUDIO_ADAPTER_ID);
    expect(descriptor.meta_glasses_audio.descriptor_cid).toBe(
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
    expect(requirements.map(requirement => requirement.capability)).toEqual([
      'microphone.input',
      'speaker.output',
      'headphone.output',
    ]);
    expect(requirements.map(requirement => requirement.bluetooth_profile)).toEqual([
      'hfp',
      'a2dp',
      'ble-audio',
    ]);
    expect(JSON.stringify(descriptor)).not.toMatch(/DisplayAccess|AudioAccess|DAT SDK/);
    expect(requirements.every(requirement => requirement.raw_audio_allowed_by_default === false)).toBe(true);
  });

  it('requires microphone permission before selecting a capture route', () => {
    const result = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'microphone.input',
      action: 'dictate_note',
      granted_scopes: ['meta_glasses.control.route'],
    });

    expect(result.status).toBe('permission_required');
    expect(result.granted).toBe(false);
    expect(result.missing_scopes).toContain('meta_glasses.microphone.capture');
    expect(result.policy_decision.outcome).toBe('require_confirmation');
    expect(result.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'denial']);
  });

  it('redacts raw audio by default and emits normalized control-plane events', () => {
    const result = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'microphone.input',
      action: 'dictate_note',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      correlation_id: 'audio-corr-1',
    });

    expect(result.status).toBe('ready');
    expect(result.granted).toBe(true);
    expect(result.raw_audio).toBeUndefined();
    expect(result.payload_refs[0].cid).toMatch(/^sha256:/);
    expect(result.payload_refs[0].retention_policy).toBe('ephemeral');
    expect(result.payload_refs[0].redaction).toBe('privacy_filtered');
    expect(result.normalized_event.event).toBe('io.audio.microphone.capture.started');
    expect(result.normalized_event.control_plane_route).toBe(
      'swissknife.mobile_orb.publish_glasses_event',
    );
    expect(result.normalized_event.envelope.route.bridge_route).toBe('phone-app.bluetooth-audio');
    expect(result.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'capture_start']);
  });

  it('maps explicitly stored audio artifacts to content-addressed references', () => {
    const result = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'speaker.output',
      action: 'play_summary',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      storage_enabled: true,
      content_cids: ['sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    });

    expect(result.status).toBe('ready');
    expect(result.payload_refs).toEqual([
      expect.objectContaining({
        cid: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        purpose: 'route_receipt',
        retention_policy: 'policy_controlled',
      }),
    ]);
    expect(result.policy_decision.reasons.join('\n')).toContain('Raw audio is redacted');
    expect(result.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'playback_start']);
  });

  it('returns fallback, degraded, mock, unsupported, and error route states with receipts', () => {
    const fallback = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'headphone.output',
      action: 'play_private_summary',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      readiness: 'route_lost',
    });
    const degraded = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'speaker.output',
      action: 'play_low_bitrate',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      readiness: 'degraded',
    });
    const mock = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'speaker.output',
      action: 'play_mock',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      mock: true,
    });
    const unsupported = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'speaker.output',
      action: 'play_summary',
      granted_scopes: [...META_GLASSES_IO_PERMISSION_SCOPES],
      readiness: 'unsupported',
    });
    const error = requestMetaGlassesAudioRoute({
      app_id: 'com.example.audio',
      capability: 'camera.photo_capture' as 'microphone.input',
      action: 'bad_audio',
    });

    expect(fallback.status).toBe('fallback');
    expect(fallback.fallback_reason).toContain('route_lost');
    expect(fallback.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'fallback']);
    expect(degraded.status).toBe('degraded');
    expect(degraded.readiness).toBe('degraded');
    expect(degraded.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'fallback']);
    expect(mock.status).toBe('mock');
    expect(mock.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'playback_start']);
    expect(mock.normalized_event.envelope.route.bridge_provider).toBe('simulator');
    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.policy_decision.outcome).toBe('deny');
    expect(unsupported.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'denial']);
    expect(error.status).toBe('error');
    expect(error.error).toContain('Unsupported audio capability');
    expect(error.receipts.map(receipt => receipt.audio_stage)).toEqual(['route_selection', 'error']);
    expect([fallback, degraded, mock, unsupported, error].every(result => result.receipts.length >= 2)).toBe(true);
  });
});

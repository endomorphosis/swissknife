import { computeInterfaceCID } from '../../src/services/mcp-idl';
import {
  META_GLASSES_IO_TRANSPORT_ERROR_CODES,
  META_GLASSES_IO_TRANSPORT_PROFILE,
  META_GLASSES_IO_TRANSPORT_PROFILE_VERSION,
  META_GLASSES_IO_TRANSPORT_PROPERTY,
  assertMetaGlassesIOBridgeEnvelope,
  createDefaultMetaGlassesIOBridgeEnvelopes,
  createMetaGlassesIOBridgeEnvelope,
  createMetaGlassesIOTransportDescriptor,
  validateMetaGlassesIOBridgeEnvelope,
  validateMetaGlassesIOTransportDescriptor,
  type MetaGlassesIOBridgeEnvelope,
} from '../../src/services/meta-glasses-io-transport';

describe('Meta glasses I/O bridge transport envelopes', () => {
  it('models Bluetooth and Wi-Fi as app-level bridge envelopes', () => {
    const envelopes = createDefaultMetaGlassesIOBridgeEnvelopes();
    const bluetooth = envelopes.find(envelope => envelope.route.raw_transport === 'bluetooth');
    const wifi = envelopes.find(envelope => envelope.route.raw_transport === 'wifi');

    expect(envelopes).toHaveLength(2);
    expect(bluetooth).toBeDefined();
    expect(wifi).toBeDefined();

    for (const envelope of envelopes) {
      const result = validateMetaGlassesIOBridgeEnvelope(envelope);

      expect(result.conformant).toBe(true);
      expect(result.errors).toEqual([]);
      expect(envelope.profile).toBe(META_GLASSES_IO_TRANSPORT_PROFILE);
      expect(envelope.profile_version).toBe(META_GLASSES_IO_TRANSPORT_PROFILE_VERSION);
      expect(envelope.identity.device_id).toBeTruthy();
      expect(envelope.identity.device_session_id).toBeTruthy();
      expect(envelope.identity.app_binding_id).toContain('.binding');
      expect(envelope.route.bridge_route).toBeTruthy();
      expect(envelope.route.control_plane_route).toMatch(/^swissknife\./);
      expect(envelope.route.raw_transport_is_ipfs_libp2p_or_mcp).toBe(false);
      expect(envelope.permission.state).toBe('granted');
      expect(envelope.flow_control.latency_ms).toBeGreaterThanOrEqual(0);
      expect(envelope.flow_control.backpressure).toBe('none');
      expect(envelope.payload_limits.max_payload_bytes).toBeGreaterThan(0);
      expect(envelope.content.every(ref => ref.cid.startsWith('sha256:'))).toBe(true);
      expect(envelope.receipts.mcp_tool_receipt_id).toContain(envelope.identity.correlation_id);
      expect(envelope.receipts.mcp_event_receipt_id).toContain(envelope.identity.correlation_id);
      expect(envelope.policy.decision_id).toContain(envelope.route.raw_transport);
      expect(envelope.privacy.strategy).toBe('content_reference_only');
      expect(envelope.privacy.redacted_fields).toEqual(
        expect.arrayContaining(['payload.inline_bytes', 'device.bluetooth_address']),
      );
      expect(() => assertMetaGlassesIOBridgeEnvelope(envelope)).not.toThrow();
    }
  });

  it('records libp2p peer ids only when the bridge provides a libp2p app layer', () => {
    const bluetooth = createMetaGlassesIOBridgeEnvelope({
      raw_transport: 'bluetooth',
      bridge_provider: 'phone-app',
    });
    const wifi = createMetaGlassesIOBridgeEnvelope({
      raw_transport: 'wifi',
      bridge_provider: 'display-webapp',
    });

    expect(bluetooth.app_layers.libp2p).toBe('not_provided');
    expect(bluetooth.app_layers.libp2p_peer_id).toBeUndefined();
    expect(bluetooth.app_layers.libp2p_remote_peer_id).toBeUndefined();
    expect(wifi.app_layers.libp2p).toBe('provided_by_bridge');
    expect(wifi.app_layers.libp2p_peer_id).toMatch(/^12D3KooW/);
    expect(wifi.app_layers.libp2p_remote_peer_id).toMatch(/^12D3KooW/);
    expect(wifi.app_layers.libp2p_session_id).toContain('libp2p-session');
  });

  it('rejects envelopes that claim raw Bluetooth or Wi-Fi is IPFS/libp2p/MCP++', () => {
    const envelope = createMetaGlassesIOBridgeEnvelope({ raw_transport: 'bluetooth' });
    const broken: MetaGlassesIOBridgeEnvelope = {
      ...envelope,
      route: {
        ...envelope.route,
        raw_transport_is_ipfs_libp2p_or_mcp: true as false,
      },
    };

    const result = validateMetaGlassesIOBridgeEnvelope(broken);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY,
          path: 'route.raw_transport_is_ipfs_libp2p_or_mcp',
        }),
      ]),
    );
  });

  it('rejects libp2p peer metadata when libp2p is not provided by the bridge', () => {
    const envelope = createMetaGlassesIOBridgeEnvelope({ raw_transport: 'bluetooth' });
    const broken: MetaGlassesIOBridgeEnvelope = {
      ...envelope,
      app_layers: {
        ...envelope.app_layers,
        libp2p: 'not_provided',
        libp2p_peer_id: '12D3KooWInvalidRawBluetoothPeer',
        libp2p_remote_peer_id: '12D3KooWInvalidRawBluetoothRemotePeer',
        libp2p_session_id: 'libp2p-session-raw-bluetooth',
      },
    };

    const result = validateMetaGlassesIOBridgeEnvelope(broken);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.APP_LAYER_BOUNDARY,
          path: 'app_layers.libp2p_peer_id',
        }),
      ]),
    );
  });

  it('rejects bridge routes that do not match the declared raw transport', () => {
    const envelope = createMetaGlassesIOBridgeEnvelope({ raw_transport: 'bluetooth' });
    const broken: MetaGlassesIOBridgeEnvelope = {
      ...envelope,
      route: {
        ...envelope.route,
        bridge_provider: 'display-webapp',
        bridge_route: 'display-webapp.browser-bridge',
      },
    };

    const result = validateMetaGlassesIOBridgeEnvelope(broken);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.BRIDGE_ROUTE,
          path: 'route',
        }),
      ]),
    );
  });

  it('validates required transport metadata with stable error codes', () => {
    const envelope = createMetaGlassesIOBridgeEnvelope({ raw_transport: 'wifi' });
    const broken: MetaGlassesIOBridgeEnvelope = {
      ...envelope,
      identity: { ...envelope.identity, device_id: '' },
      permission: { ...envelope.permission, required_scopes: undefined as never },
      flow_control: { ...envelope.flow_control, latency_ms: -1 },
      payload_limits: { ...envelope.payload_limits, max_payload_bytes: 0 },
      content: [{ ...envelope.content[0], cid: 'not-a-cid' }],
      receipts: { ...envelope.receipts, envelope_cid: 'not-a-cid' },
      privacy: { ...envelope.privacy, redacted_fields: undefined as never },
    };

    const result = validateMetaGlassesIOBridgeEnvelope(broken);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.IDENTITY }),
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.PERMISSION_STATE }),
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.FLOW_CONTROL }),
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.PAYLOAD_LIMITS }),
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.CONTENT_CIDS }),
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.RECEIPTS }),
        expect.objectContaining({ code: META_GLASSES_IO_TRANSPORT_ERROR_CODES.PRIVACY_REDACTION }),
      ]),
    );
  });

  it('can be embedded in an MCP-IDL descriptor and content addressed', () => {
    const descriptor = createMetaGlassesIOTransportDescriptor();
    const result = validateMetaGlassesIOTransportDescriptor(descriptor);
    const cid = computeInterfaceCID(descriptor);

    expect(result.conformant).toBe(true);
    expect(cid).toMatch(/^sha256:/);
    expect(descriptor.requires).toEqual(
      expect.arrayContaining(['mcp++/receipts', 'mcp++/policy', 'ipfs/cid', 'libp2p/session']),
    );
    expect(descriptor[META_GLASSES_IO_TRANSPORT_PROPERTY].envelopes).toHaveLength(2);
  });
});

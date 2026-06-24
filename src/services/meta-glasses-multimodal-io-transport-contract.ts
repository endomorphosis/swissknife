export const META_GLASSES_MULTIMODAL_IO_CONTRACT =
  'handsfree.meta-glasses/multimodal-io-control-plane@0.1.0';

export const META_GLASSES_MULTIMODAL_IO_MOCK_BOUNDARY =
  'handsfree.meta-glasses/mock-multimodal-io-boundary@0.1.0';

export const MCP_PLUS_PLUS_ENVELOPE_PROFILE =
  'swissknife.mcp++/event-envelope@0.1.0';

export const META_GLASSES_CONTROL_PLANE_DEVICES = [
  'camera',
  'microphone',
  'headphones',
  'display',
  'captouch',
  'Neural Band',
] as const;

export type MetaGlassesControlPlaneDevice =
  (typeof META_GLASSES_CONTROL_PLANE_DEVICES)[number];

export const META_GLASSES_CONTROL_PLANE_EVENT_TYPES = [
  'camera.photo_ref',
  'camera.video_frame_ref',
  'microphone.route_state',
  'microphone.transcript_ref',
  'headphones.route_state',
  'headphones.playback_state',
  'display.lifecycle_state',
  'display.action',
  'captouch.intent',
  'Neural Band.intent',
  'permission.state',
  'transport.handoff',
] as const;

export type MetaGlassesControlPlaneEventType =
  (typeof META_GLASSES_CONTROL_PLANE_EVENT_TYPES)[number];

export const META_GLASSES_TRANSPORT_ASSUMPTIONS = {
  bluetooth:
    'Bluetooth is a phone-to-glasses route for audio profiles and local device state, not raw libp2p transport.',
  wifi:
    'Wi-Fi may carry app-level handoff traffic through the mobile edge or Web App path; raw radio sockets are out of scope.',
  datAvailability:
    'DAT camera/display capabilities are optional; unavailable, denied, or unsupported states emit fallback receipts.',
  ipfsLibp2pHandoff:
    'IPFS CIDs and libp2p peer/session identifiers live in envelope metadata for payload handoff and replay.',
  mcpPlusPlus:
    'MCP++ compatibility is provided by contract, operation, correlation, policy, and provenance envelope fields.',
} as const;

export const META_GLASSES_REQUIRED_ENVELOPE_FIELDS = [
  'contract',
  'profile',
  'event_type',
  'device',
  'source',
  'edge_session_id',
  'app_binding_id',
  'correlation_id',
  'payload',
  'transport',
  'handoff',
  'fallback',
  'control_plane',
  'policy',
  'receipts',
] as const;

export const META_GLASSES_MOCK_BOUNDARY_STATES = [
  'mock_ready',
  'dat_ready',
  'dat_unavailable',
  'permission_denied',
  'unsupported_capability',
  'route_degraded',
  'route_lost',
] as const;

export type MetaGlassesMockBoundaryState =
  (typeof META_GLASSES_MOCK_BOUNDARY_STATES)[number];

export interface MetaGlassesControlPlaneEventEnvelope {
  contract: typeof META_GLASSES_MULTIMODAL_IO_CONTRACT;
  profile: typeof MCP_PLUS_PLUS_ENVELOPE_PROFILE;
  event_type: MetaGlassesControlPlaneEventType;
  device: MetaGlassesControlPlaneDevice;
  source: 'hardware-free-mock' | 'native-dat' | 'display-webapp' | 'mobile-route';
  edge_session_id: string;
  app_binding_id: string;
  correlation_id: string;
  payload: Record<string, unknown>;
  transport: {
    bluetooth: 'route-state' | 'unavailable' | 'unknown';
    wifi: 'app-level-handoff' | 'unavailable' | 'unknown';
    latency_ms?: number;
    backpressure?: 'none' | 'degraded' | 'blocked';
  } & Record<string, unknown>;
  handoff: {
    ipfs_cids: string[];
    libp2p_peer_id: string | null;
    libp2p_session_id: string | null;
    mcp_plus_plus_profile: typeof MCP_PLUS_PLUS_ENVELOPE_PROFILE;
  } & Record<string, unknown>;
  fallback: {
    dat_available: boolean;
    state: MetaGlassesMockBoundaryState;
    reason?: string;
  } & Record<string, unknown>;
  control_plane: {
    route: 'swissknife.mobile_orb.publish_glasses_event';
    operation: 'publish_glasses_event';
  };
  policy: Record<string, unknown>;
  receipts: string[];
}

export function buildMetaGlassesControlPlaneEvent(
  input: {
    event_type: MetaGlassesControlPlaneEventType;
    device: MetaGlassesControlPlaneDevice;
    edge_session_id: string;
    app_binding_id: string;
    correlation_id: string;
    payload?: Record<string, unknown>;
    transport?: Record<string, unknown>;
    handoff?: Record<string, unknown>;
    fallback?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    receipts?: string[];
  },
): MetaGlassesControlPlaneEventEnvelope {
  return {
    contract: META_GLASSES_MULTIMODAL_IO_CONTRACT,
    profile: MCP_PLUS_PLUS_ENVELOPE_PROFILE,
    event_type: input.event_type,
    device: input.device,
    source: 'hardware-free-mock',
    edge_session_id: input.edge_session_id,
    app_binding_id: input.app_binding_id,
    correlation_id: input.correlation_id,
    payload: input.payload ?? {},
    transport: {
      bluetooth: 'route-state',
      wifi: 'app-level-handoff',
      ...(input.transport ?? {}),
    } as MetaGlassesControlPlaneEventEnvelope['transport'],
    handoff: {
      ipfs_cids: [],
      libp2p_peer_id: null,
      libp2p_session_id: null,
      mcp_plus_plus_profile: MCP_PLUS_PLUS_ENVELOPE_PROFILE,
      ...(input.handoff ?? {}),
    } as MetaGlassesControlPlaneEventEnvelope['handoff'],
    fallback: {
      dat_available: false,
      state: 'mock_ready',
      ...(input.fallback ?? {}),
    } as MetaGlassesControlPlaneEventEnvelope['fallback'],
    control_plane: {
      route: 'swissknife.mobile_orb.publish_glasses_event',
      operation: 'publish_glasses_event',
    },
    policy: input.policy ?? { outcome: 'allow', source: 'mock' },
    receipts: input.receipts ?? [],
  };
}

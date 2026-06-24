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

export const META_GLASSES_PLAYWRIGHT_FIXTURE_ID =
  'mgw-519-meta-glasses-control-plane-playwright-fixture';

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

export interface MetaGlassesControlPlanePlaywrightFixture {
  task_id: 'MGW-519';
  fixture_id: string;
  description: string;
  contract: typeof META_GLASSES_MULTIMODAL_IO_CONTRACT;
  mock_boundary: typeof META_GLASSES_MULTIMODAL_IO_MOCK_BOUNDARY;
  profile: typeof MCP_PLUS_PLUS_ENVELOPE_PROFILE;
  playwright_ready: true;
  edge_session: {
    edge_session_id: string;
    app_binding_id: string;
    hardware_required: false;
    paired_meta_glasses_required: false;
  };
  events: MetaGlassesControlPlaneEventEnvelope[];
  replay_receipts: Array<{
    receipt_cid: string;
    correlation_id: string;
    physical_dat_replay_target: 'Meta Wearables DAT device session';
    preserve_for_dat_replay: true;
  }>;
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

export function buildMetaGlassesPlaywrightFixture(
  input: {
    fixture_id?: string;
    edge_session_id?: string;
    app_binding_id?: string;
  } = {},
): MetaGlassesControlPlanePlaywrightFixture {
  const fixtureId = input.fixture_id ?? META_GLASSES_PLAYWRIGHT_FIXTURE_ID;
  const edgeSessionId = input.edge_session_id ?? 'edge-session-mgw-519-playwright';
  const appBindingId = input.app_binding_id ?? 'swissknife-app-binding-mgw-519';
  const baseHandoff = {
    ipfs_cids: ['bafy-mgw519-fixture-root'],
    libp2p_peer_id: '12D3KooWMgw519FixturePeer',
    libp2p_session_id: 'libp2p-mgw-519-playwright',
  };
  const scenarios: Array<{
    event_type: MetaGlassesControlPlaneEventType;
    device: MetaGlassesControlPlaneDevice;
    correlation_id: string;
    payload: Record<string, unknown>;
    receipt_cid: string;
  }> = [
    {
      event_type: 'camera.photo_ref',
      device: 'camera',
      correlation_id: 'corr-mgw519-camera',
      payload: {
        mode: 'photo',
        cid: 'bafy-mgw519-camera-photo',
        mime_type: 'image/jpeg',
        redaction: 'content-addressed-reference-only',
      },
      receipt_cid: 'bafy-mgw519-receipt-camera',
    },
    {
      event_type: 'microphone.transcript_ref',
      device: 'microphone',
      correlation_id: 'corr-mgw519-microphone',
      payload: {
        route: 'bluetooth-hfp',
        transcript_cid: 'bafy-mgw519-microphone-transcript',
        raw_audio: 'not_in_fixture',
      },
      receipt_cid: 'bafy-mgw519-receipt-microphone',
    },
    {
      event_type: 'headphones.playback_state',
      device: 'headphones',
      correlation_id: 'corr-mgw519-headphones',
      payload: {
        route: 'bluetooth-a2dp',
        state: 'playing',
        spoken_summary: 'Task status rendered on Meta glasses.',
      },
      receipt_cid: 'bafy-mgw519-receipt-headphones',
    },
    {
      event_type: 'display.action',
      device: 'display',
      correlation_id: 'corr-mgw519-display',
      payload: {
        widget_id: 'swissknife-playwright-status-widget',
        action: 'render_widget',
        render_path: 'display-webapp',
      },
      receipt_cid: 'bafy-mgw519-receipt-display',
    },
    {
      event_type: 'Neural Band.intent',
      device: 'Neural Band',
      correlation_id: 'corr-mgw519-neural-band',
      payload: {
        intent: 'activate',
        key: 'Enter',
        confidence: 0.94,
      },
      receipt_cid: 'bafy-mgw519-receipt-neural-band',
    },
  ];

  const events = scenarios.map(scenario => buildMetaGlassesControlPlaneEvent({
    event_type: scenario.event_type,
    device: scenario.device,
    edge_session_id: edgeSessionId,
    app_binding_id: appBindingId,
    correlation_id: scenario.correlation_id,
    payload: scenario.payload,
    handoff: {
      ...baseHandoff,
      ipfs_cids: [
        ...baseHandoff.ipfs_cids,
        ...Object.entries(scenario.payload)
          .filter(([key]) => key === 'cid' || key.endsWith('_cid'))
          .map(([, value]) => String(value)),
      ],
    },
    fallback: {
      dat_available: false,
      state: 'dat_unavailable',
      reason: 'MGW-519 Playwright control-plane fixture runs without paired Meta glasses hardware.',
    },
    policy: {
      outcome: 'allow',
      source: 'mgw-519-playwright-fixture',
      capabilities: [`${scenario.device}/mock`, 'control-plane/replay'],
    },
    receipts: [scenario.receipt_cid],
  }));

  return {
    task_id: 'MGW-519',
    fixture_id: fixtureId,
    description:
      'Meta glasses hardware-free control-plane mocks for Playwright and Swissknife app validation.',
    contract: META_GLASSES_MULTIMODAL_IO_CONTRACT,
    mock_boundary: META_GLASSES_MULTIMODAL_IO_MOCK_BOUNDARY,
    profile: MCP_PLUS_PLUS_ENVELOPE_PROFILE,
    playwright_ready: true,
    edge_session: {
      edge_session_id: edgeSessionId,
      app_binding_id: appBindingId,
      hardware_required: false,
      paired_meta_glasses_required: false,
    },
    events,
    replay_receipts: scenarios.map(scenario => ({
      receipt_cid: scenario.receipt_cid,
      correlation_id: scenario.correlation_id,
      physical_dat_replay_target: 'Meta Wearables DAT device session',
      preserve_for_dat_replay: true,
    })),
  };
}

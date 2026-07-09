/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const idlCoveragePath = join(evidenceRoot, 'all-tools-idl-coverage.json');
const glassesCoveragePath = join(evidenceRoot, 'all-tools-glasses-coverage.json');
const packetPath = join(evidenceRoot, 'all-tools-glasses-handoff-packets.json');

type HandoffBehavior =
  | 'native-display'
  | 'display-webapp'
  | 'mobile-card'
  | 'notification'
  | 'audio-summary'
  | 'desktop-only'
  | 'not-displayable';

interface IdlMethodRecord {
  method: string;
  tool_id: string;
  app_id: string;
  policy_class: string;
  receipt_required: boolean;
  adapter_required: boolean;
}

interface IdlDescriptorRecord {
  descriptor_id: string;
  service: string;
  category: string;
  interface_cid: string;
  method_count: number;
  methods: IdlMethodRecord[];
  generated_ui_profile?: {
    template?: string;
    app_id?: string;
  };
}

interface IdlCoverageCatalog {
  catalog_id: string;
  schema: string;
  descriptor_count: number;
  method_count: number;
  interface_cid_count: number;
  app_routable_tool_coverage_count: number;
  adapter_required_method_count: number;
  tool_coverage: { tool_id: string; app_id: string; adapter_required: boolean }[];
  descriptors: IdlDescriptorRecord[];
}

interface GlassesProjectionRecord {
  descriptor_id: string;
  interface_cid: string;
  app_id: string;
  behavior: HandoffBehavior;
  adapter_required: boolean;
  replay_states: { state: string; valid: boolean; fallback: string | null }[];
}

interface GlassesProjectionCatalog {
  catalog_id: string;
  schema: string;
  projection_count: number;
  displayable_projection_count: number;
  behavior_counts: Record<string, number>;
  hardware_free_replay_state_count: number;
  projections: GlassesProjectionRecord[];
}

interface HandoffPacket {
  packet_id: string;
  descriptor_id: string;
  app_id: string;
  service_id: string;
  category: string;
  interface_cid: string;
  behavior: HandoffBehavior;
  fallback_target: HandoffBehavior;
  display_target: 'glasses_hud' | 'display_webapp' | 'mobile_card' | 'notification_tray' | 'audio_channel' | 'desktop_handoff';
  adapter_required: boolean;
  method_count: number;
  tool_ids: string[];
  method_refs: {
    method: string;
    tool_id: string;
    app_id: string;
    receipt_ref: string | null;
    event_dag_ref: string;
    adapter_required: boolean;
  }[];
  policy_tags: string[];
  receipt_refs: string[];
  event_dag_refs: string[];
  replay_state_refs: {
    state: string;
    valid: boolean;
    fallback: string | null;
    ref: string;
  }[];
}

interface HandoffPacketCatalog {
  schema: 'swissknife.all-tools-glasses-handoff-packets.v1';
  generated_at: string;
  generated_from: string[];
  packet_count: number;
  descriptor_count: number;
  method_count: number;
  app_count: number;
  service_counts: Record<string, number>;
  behavior_counts: Record<string, number>;
  adapter_required_packet_count: number;
  adapter_required_method_count: number;
  replay_state_count: number;
  packets: HandoffPacket[];
}

let idlCatalog: IdlCoverageCatalog;
let glassesCatalog: GlassesProjectionCatalog;
let handoffCatalog: HandoffPacketCatalog;

describe('all MCP/MCP++ ORB/IDL handoff packets for Meta glasses layers', () => {
  beforeAll(() => {
    idlCatalog = readJson<IdlCoverageCatalog>(idlCoveragePath);
    glassesCatalog = readJson<GlassesProjectionCatalog>(glassesCoveragePath);
    handoffCatalog = buildHandoffPacketCatalog(idlCatalog, glassesCatalog);
    actualFs.mkdirSync(dirname(packetPath), { recursive: true });
    actualFs.writeFileSync(packetPath, `${JSON.stringify(handoffCatalog, null, 2)}\n`);
  });

  it('writes one deterministic handoff packet for every ORB/IDL descriptor and glasses projection', () => {
    expect(handoffCatalog.schema).toBe('swissknife.all-tools-glasses-handoff-packets.v1');
    expect(handoffCatalog.generated_from).toEqual([idlCatalog.catalog_id, glassesCatalog.catalog_id]);
    expect(handoffCatalog.packet_count).toBe(idlCatalog.descriptor_count);
    expect(handoffCatalog.packet_count).toBe(glassesCatalog.projection_count);
    expect(handoffCatalog.method_count).toBe(idlCatalog.method_count);
    expect(handoffCatalog.replay_state_count).toBe(glassesCatalog.hardware_free_replay_state_count);
    expect(new Set(handoffCatalog.packets.map(packet => packet.packet_id)).size).toBe(handoffCatalog.packet_count);
    expect(actualFs.existsSync(packetPath)).toBe(true);
  });

  it('links every app-routable tool coverage row to a handoff packet method ref', () => {
    const packetByToolId = new Map<string, HandoffPacket>();
    for (const packet of handoffCatalog.packets) {
      for (const methodRef of packet.method_refs) packetByToolId.set(methodRef.tool_id, packet);
    }

    expect(packetByToolId.size).toBe(idlCatalog.app_routable_tool_coverage_count);
    for (const coverage of idlCatalog.tool_coverage) {
      const packet = packetByToolId.get(coverage.tool_id);
      const methodRef = packet?.method_refs.find(ref => ref.tool_id === coverage.tool_id);
      expect(packet).toBeDefined();
      expect(methodRef?.app_id).toBe(coverage.app_id);
      expect(packet?.adapter_required || !coverage.adapter_required).toBe(true);
    }
  });

  it('carries interface CIDs, policy tags, receipts, event DAG refs, fallback targets, and replay states', () => {
    const projectionByDescriptor = new Map(glassesCatalog.projections.map(projection => [projection.descriptor_id, projection]));

    for (const packet of handoffCatalog.packets) {
      const projection = projectionByDescriptor.get(packet.descriptor_id);
      expect(packet.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(packet.interface_cid).toBe(projection?.interface_cid);
      expect(packet.method_refs).toHaveLength(packet.method_count);
      expect(packet.tool_ids).toHaveLength(packet.method_count);
      expect(packet.policy_tags).toEqual(expect.arrayContaining([
        `service:${packet.service_id}`,
        `glasses:${packet.behavior}`,
      ]));
      expect(packet.event_dag_refs).toHaveLength(packet.method_count);
      expect(packet.method_refs.every(ref => ref.event_dag_ref.startsWith('event-dag:'))).toBe(true);
      expect(packet.replay_state_refs).toHaveLength(projection?.replay_states.length ?? 0);
      expect(packet.replay_state_refs.every(ref => ref.valid || Boolean(ref.fallback))).toBe(true);
      expect(packet.fallback_target).toBe(packet.behavior);
      if (packet.method_refs.some(ref => ref.receipt_ref)) {
        expect(packet.receipt_refs.length).toBeGreaterThan(0);
      }
    }
  });

  it('preserves Meta layer behavior and adapter-required summaries for release evidence', () => {
    expect(handoffCatalog.behavior_counts).toEqual(glassesCatalog.behavior_counts);
    expect(handoffCatalog.behavior_counts['display-webapp']).toBeGreaterThan(0);
    expect(handoffCatalog.behavior_counts['mobile-card']).toBeGreaterThan(0);
    expect(handoffCatalog.behavior_counts['audio-summary']).toBeGreaterThan(0);
    expect(handoffCatalog.adapter_required_packet_count).toBe(
      handoffCatalog.packets.filter(packet => packet.adapter_required).length,
    );
    expect(handoffCatalog.adapter_required_method_count).toBe(idlCatalog.adapter_required_method_count);
    expect(handoffCatalog.service_counts.ipfs_datasets_py).toBeGreaterThan(0);
    expect(handoffCatalog.service_counts.ipfs_accelerate_py).toBeGreaterThan(0);
    expect(handoffCatalog.service_counts.ipfs_kit_py).toBeGreaterThan(0);
  });
});

function buildHandoffPacketCatalog(
  idl: IdlCoverageCatalog,
  glasses: GlassesProjectionCatalog,
): HandoffPacketCatalog {
  const projectionByDescriptor = new Map(glasses.projections.map(projection => [projection.descriptor_id, projection]));
  const packets = idl.descriptors.map(descriptor => {
    const projection = projectionByDescriptor.get(descriptor.descriptor_id);
    if (!projection) throw new Error(`Missing glasses projection for ${descriptor.descriptor_id}`);
    if (projection.interface_cid !== descriptor.interface_cid) {
      throw new Error(`${descriptor.descriptor_id}: projection CID does not match IDL descriptor CID`);
    }
    return buildHandoffPacket(descriptor, projection);
  }).sort((left, right) => left.packet_id.localeCompare(right.packet_id));

  return {
    schema: 'swissknife.all-tools-glasses-handoff-packets.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [idl.catalog_id, glasses.catalog_id],
    packet_count: packets.length,
    descriptor_count: idl.descriptor_count,
    method_count: packets.reduce((total, packet) => total + packet.method_count, 0),
    app_count: new Set(packets.map(packet => packet.app_id)).size,
    service_counts: countBy(packets, packet => packet.service_id),
    behavior_counts: countBy(packets, packet => packet.behavior),
    adapter_required_packet_count: packets.filter(packet => packet.adapter_required).length,
    adapter_required_method_count: packets.reduce(
      (total, packet) => total + packet.method_refs.filter(ref => ref.adapter_required).length,
      0,
    ),
    replay_state_count: packets.reduce((total, packet) => total + packet.replay_state_refs.length, 0),
    packets,
  };
}

function buildHandoffPacket(
  descriptor: IdlDescriptorRecord,
  projection: GlassesProjectionRecord,
): HandoffPacket {
  const packetId = `handoff.${descriptor.descriptor_id}`;
  const methodRefs = descriptor.methods.map((method, index) => {
    const receiptRef = method.receipt_required ? `receipt:${method.tool_id}` : null;
    return {
      method: method.method,
      tool_id: method.tool_id,
      app_id: method.app_id,
      receipt_ref: receiptRef,
      event_dag_ref: `event-dag:${method.tool_id}`,
      adapter_required: method.adapter_required,
      ordinal: index,
    };
  });
  const receiptRefs = methodRefs
    .map(ref => ref.receipt_ref)
    .filter((ref): ref is string => Boolean(ref));

  return {
    packet_id: packetId,
    descriptor_id: descriptor.descriptor_id,
    app_id: projection.app_id || descriptor.generated_ui_profile?.app_id || descriptor.methods[0]?.app_id || 'unknown-app',
    service_id: descriptor.service,
    category: descriptor.category,
    interface_cid: descriptor.interface_cid,
    behavior: projection.behavior,
    fallback_target: projection.behavior,
    display_target: displayTargetFor(projection.behavior),
    adapter_required: projection.adapter_required || descriptor.methods.some(method => method.adapter_required),
    method_count: descriptor.method_count,
    tool_ids: descriptor.methods.map(method => method.tool_id),
    method_refs: methodRefs,
    policy_tags: policyTagsFor(descriptor, projection),
    receipt_refs: receiptRefs,
    event_dag_refs: methodRefs.map(ref => ref.event_dag_ref),
    replay_state_refs: projection.replay_states.map(state => ({
      state: state.state,
      valid: state.valid,
      fallback: state.fallback,
      ref: `${packetId}:${state.state}`,
    })),
  };
}

function policyTagsFor(
  descriptor: IdlDescriptorRecord,
  projection: GlassesProjectionRecord,
): string[] {
  const tags = new Set<string>([
    `service:${descriptor.service}`,
    `category:${descriptor.category}`,
    `glasses:${projection.behavior}`,
  ]);
  for (const method of descriptor.methods) {
    tags.add(`policy:${method.policy_class}`);
    if (method.receipt_required) tags.add('receipt:required');
    if (method.adapter_required) tags.add('adapter:required');
  }
  if (projection.adapter_required) tags.add('adapter:required');
  return [...tags].sort();
}

function displayTargetFor(behavior: HandoffBehavior): HandoffPacket['display_target'] {
  if (behavior === 'display-webapp') return 'display_webapp';
  if (behavior === 'mobile-card') return 'mobile_card';
  if (behavior === 'notification') return 'notification_tray';
  if (behavior === 'audio-summary') return 'audio_channel';
  if (behavior === 'desktop-only' || behavior === 'not-displayable') return 'desktop_handoff';
  return 'glasses_hud';
}

function countBy<T>(items: readonly T[], selector: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(actualFs.readFileSync(filePath, 'utf8')) as T;
}

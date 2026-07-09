/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';

const actualFs = jest.requireActual<typeof import('fs')>('fs');
const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const handoffPacketsPath = join(evidenceRoot, 'all-tools-glasses-handoff-packets.json');
const callEnvelopesPath = join(evidenceRoot, 'all-tools-call-envelope-fixtures.json');
const replayBundlesPath = join(evidenceRoot, 'all-tools-glasses-handoff-replay-bundles.json');

const META_PATHS = [
  'native-display',
  'display-webapp',
  'mobile-card',
  'notification',
  'audio-summary',
  'desktop-only',
  'not-displayable',
] as const;

type MetaPath = typeof META_PATHS[number];

interface HandoffPacket {
  packet_id: string;
  descriptor_id: string;
  app_id: string;
  service_id: string;
  category: string;
  interface_cid: string;
  behavior: MetaPath;
  fallback_target: MetaPath;
  display_target: string;
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
  schema: string;
  packet_count: number;
  method_count: number;
  replay_state_count: number;
  packets: HandoffPacket[];
}

interface CallEnvelope {
  envelope_id: string;
  tool_id: string;
  app_id: string;
  capability_id: string;
  receipt_refs: string[];
  event_dag_refs: string[];
  adapter_required: boolean;
}

interface CallEnvelopeCatalog {
  schema: string;
  envelope_count: number;
  envelopes: CallEnvelope[];
}

interface ReplayBundle {
  bundle_id: string;
  packet_id: string;
  descriptor_id: string;
  app_id: string;
  service_id: string;
  interface_cid: string;
  display_target: string;
  fallback_target: MetaPath;
  behavior: MetaPath;
  adapter_required: boolean;
  rollback_token: string;
  policy_tags: string[];
  method_refs: {
    method: string;
    tool_id: string;
    app_id: string;
    call_envelope_id: string;
    receipt_refs: string[];
    event_dag_refs: string[];
    adapter_required: boolean;
  }[];
  receipt_refs: string[];
  event_dag_refs: string[];
  replay_frames: {
    frame_id: string;
    state: string;
    display_target: string;
    fallback_target: MetaPath;
    valid: boolean;
    fallback: string | null;
    rollback_token: string;
  }[];
  path_matrix: Record<MetaPath, {
    supported: boolean;
    route: 'primary' | 'fallback' | 'not_displayable';
  }>;
}

interface ReplayBundleCatalog {
  schema: 'swissknife.all-tools-glasses-handoff-replay-bundles.v1';
  generated_at: string;
  generated_from: string[];
  bundle_count: number;
  method_ref_count: number;
  replay_frame_count: number;
  receipt_ref_count: number;
  event_dag_ref_count: number;
  adapter_required_bundle_count: number;
  behavior_counts: Record<string, number>;
  service_counts: Record<string, number>;
  bundles: ReplayBundle[];
}

let handoffCatalog: HandoffPacketCatalog;
let callCatalog: CallEnvelopeCatalog;
let replayCatalog: ReplayBundleCatalog;

describe('all MCP/MCP++ Meta glasses handoff replay bundles', () => {
  beforeAll(() => {
    handoffCatalog = readJson<HandoffPacketCatalog>(handoffPacketsPath);
    callCatalog = readJson<CallEnvelopeCatalog>(callEnvelopesPath);
    replayCatalog = buildReplayBundleCatalog(handoffCatalog, callCatalog);
    actualFs.mkdirSync(dirname(replayBundlesPath), { recursive: true });
    actualFs.writeFileSync(replayBundlesPath, `${JSON.stringify(replayCatalog, null, 2)}\n`);
  });

  it('writes one replay bundle for every handoff packet', () => {
    expect(replayCatalog.schema).toBe('swissknife.all-tools-glasses-handoff-replay-bundles.v1');
    expect(replayCatalog.bundle_count).toBe(handoffCatalog.packet_count);
    expect(replayCatalog.bundle_count).toBe(104);
    expect(replayCatalog.method_ref_count).toBe(handoffCatalog.method_count);
    expect(replayCatalog.replay_frame_count).toBe(handoffCatalog.replay_state_count);
    expect(new Set(replayCatalog.bundles.map(bundle => bundle.bundle_id)).size).toBe(replayCatalog.bundle_count);
    expect(actualFs.existsSync(replayBundlesPath)).toBe(true);
  });

  it('links every handoff method to a concrete MCP++ call envelope', () => {
    const envelopeIds = new Set(callCatalog.envelopes.map(envelope => envelope.envelope_id));

    for (const bundle of replayCatalog.bundles) {
      expect(bundle.interface_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(bundle.rollback_token).toBe(`rollback:${bundle.packet_id}`);
      expect(bundle.method_refs).toHaveLength(
        handoffCatalog.packets.find(packet => packet.packet_id === bundle.packet_id)?.method_count ?? -1,
      );
      for (const methodRef of bundle.method_refs) {
        expect(envelopeIds.has(methodRef.call_envelope_id)).toBe(true);
        expect(methodRef.receipt_refs.length).toBeGreaterThan(0);
        expect(methodRef.event_dag_refs.length).toBeGreaterThan(0);
      }
    }
  });

  it('preserves policy, receipt, event DAG, rollback, and replay-frame metadata', () => {
    for (const bundle of replayCatalog.bundles) {
      expect(bundle.policy_tags).toEqual(expect.arrayContaining([
        `service:${bundle.service_id}`,
        `glasses:${bundle.behavior}`,
      ]));
      expect(bundle.receipt_refs.length).toBeGreaterThan(0);
      expect(bundle.event_dag_refs.length).toBeGreaterThan(0);
      expect(bundle.replay_frames).toHaveLength(8);
      expect(bundle.replay_frames.every(frame => frame.rollback_token === bundle.rollback_token)).toBe(true);
      expect(bundle.replay_frames.every(frame => frame.valid || Boolean(frame.fallback))).toBe(true);
    }
    expect(replayCatalog.receipt_ref_count).toBe(627);
    expect(replayCatalog.event_dag_ref_count).toBe(627);
  });

  it('defines all Meta layer path outcomes for every bundle', () => {
    for (const bundle of replayCatalog.bundles) {
      expect(Object.keys(bundle.path_matrix).sort()).toEqual([...META_PATHS].sort());
      expect(bundle.path_matrix[bundle.behavior].route).toBe('primary');
      for (const path of META_PATHS) {
        const entry = bundle.path_matrix[path];
        expect(['primary', 'fallback', 'not_displayable']).toContain(entry.route);
        if (entry.route === 'primary') expect(entry.supported).toBe(true);
      }
    }
    expect(replayCatalog.behavior_counts).toEqual({
      'audio-summary': 35,
      'display-webapp': 62,
      'mobile-card': 7,
    });
  });
});

function buildReplayBundleCatalog(
  handoffs: HandoffPacketCatalog,
  calls: CallEnvelopeCatalog,
): ReplayBundleCatalog {
  const envelopeByTool = new Map(calls.envelopes.map(envelope => [envelope.tool_id, envelope]));
  const bundles = handoffs.packets.map(packet => buildReplayBundle(packet, envelopeByTool))
    .sort((left, right) => left.bundle_id.localeCompare(right.bundle_id));

  return {
    schema: 'swissknife.all-tools-glasses-handoff-replay-bundles.v1',
    generated_at: '2026-07-09T00:00:00.000Z',
    generated_from: [handoffs.schema, calls.schema],
    bundle_count: bundles.length,
    method_ref_count: bundles.reduce((total, bundle) => total + bundle.method_refs.length, 0),
    replay_frame_count: bundles.reduce((total, bundle) => total + bundle.replay_frames.length, 0),
    receipt_ref_count: countUnique(bundles.flatMap(bundle => bundle.receipt_refs)),
    event_dag_ref_count: countUnique(bundles.flatMap(bundle => bundle.event_dag_refs)),
    adapter_required_bundle_count: bundles.filter(bundle => bundle.adapter_required).length,
    behavior_counts: countBy(bundles, bundle => bundle.behavior),
    service_counts: countBy(bundles, bundle => bundle.service_id),
    bundles,
  };
}

function buildReplayBundle(
  packet: HandoffPacket,
  envelopeByTool: Map<string, CallEnvelope>,
): ReplayBundle {
  const rollbackToken = `rollback:${packet.packet_id}`;
  const methodRefs = packet.method_refs.map(methodRef => {
    const envelope = envelopeByTool.get(methodRef.tool_id);
    if (!envelope) throw new Error(`${packet.packet_id}: missing call envelope for ${methodRef.tool_id}`);
    return {
      method: methodRef.method,
      tool_id: methodRef.tool_id,
      app_id: methodRef.app_id,
      call_envelope_id: envelope.envelope_id,
      receipt_refs: envelope.receipt_refs,
      event_dag_refs: envelope.event_dag_refs,
      adapter_required: methodRef.adapter_required || envelope.adapter_required,
    };
  });
  const receiptRefs = unique(methodRefs.flatMap(ref => ref.receipt_refs));
  const eventDagRefs = unique(methodRefs.flatMap(ref => ref.event_dag_refs));

  return {
    bundle_id: `replay.${packet.packet_id}`,
    packet_id: packet.packet_id,
    descriptor_id: packet.descriptor_id,
    app_id: packet.app_id,
    service_id: packet.service_id,
    interface_cid: packet.interface_cid,
    display_target: packet.display_target,
    fallback_target: packet.fallback_target,
    behavior: packet.behavior,
    adapter_required: packet.adapter_required || methodRefs.some(ref => ref.adapter_required),
    rollback_token: rollbackToken,
    policy_tags: packet.policy_tags,
    method_refs: methodRefs,
    receipt_refs: receiptRefs,
    event_dag_refs: eventDagRefs,
    replay_frames: packet.replay_state_refs.map(ref => ({
      frame_id: ref.ref,
      state: ref.state,
      display_target: packet.display_target,
      fallback_target: packet.fallback_target,
      valid: ref.valid,
      fallback: ref.fallback,
      rollback_token: rollbackToken,
    })),
    path_matrix: pathMatrixFor(packet.behavior),
  };
}

function pathMatrixFor(primary: MetaPath): ReplayBundle['path_matrix'] {
  const matrix = {} as ReplayBundle['path_matrix'];
  for (const path of META_PATHS) {
    matrix[path] = {
      supported: path === primary,
      route: path === primary ? 'primary' : path === 'not-displayable' ? 'not_displayable' : 'fallback',
    };
  }
  return matrix;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function countUnique(values: readonly string[]): number {
  return new Set(values).size;
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

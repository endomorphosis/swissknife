/** @vitest-environment node */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createSupervisorDispatchArtifactStore,
  type SupervisorDispatchArtifactPolicy,
  type SupervisorDispatchHeliaAdapter,
} from '../../src/services/storage/supervisor-dispatch-artifact-store';

const evidencePath = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'supervisor-dispatch-artifact-store.json');
const createdAt = '2026-07-15T12:00:00.000Z';

class MemoryHelia implements SupervisorDispatchHeliaAdapter {
  readonly values = new Map<string, Uint8Array>();
  puts: Array<{ cid: string; pin: boolean }> = [];
  available = true;

  async put(bytes: Uint8Array, options: { cid: string; pin: boolean }): Promise<{ cid: string }> {
    if (!this.available) throw new Error('Helia unavailable');
    this.values.set(options.cid, bytes);
    this.puts.push({ cid: options.cid, pin: options.pin });
    return { cid: options.cid };
  }

  async get(cid: string): Promise<Uint8Array> {
    if (!this.available || !this.values.has(cid)) throw new Error('CID unavailable');
    return this.values.get(cid)!;
  }
}

const policy: SupervisorDispatchArtifactPolicy = {
  allow_persistence: true,
  allowed_kinds: ['goal', 'task', 'receipt', 'event_dag_checkpoint', 'dispatch_manifest'],
  retention: 'pinned',
  allow_pin: true,
  allow_cache_fallback: true,
  approved_peer_ids: ['kit-approved'],
  require_redaction: true,
  require_receipt: true,
  require_event_dag: true,
};

function dispatch() {
  return {
    dispatch_id: 'dispatch-svd-113',
    correlation_id: 'svd-113-correlation',
    policy_cid: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    policy_outcome: 'permit' as const,
    goal: { id: 'goal-7', title: 'Ship governed persistence', operator_token: 'do-not-persist' },
    task: { id: 'task-9', title: 'Store receipt and checkpoint', credentials: { api_key: 'also-not-persisted' } },
    receipt: { receipt_id: 'receipt-3', outcome: 'completed', authorization: 'never-in-artifact' },
    event_dag: {
      event_id: 'event-11',
      parents: ['sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
      compaction_certificate_cid: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      archive_cid: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      secret_note: 'must be redacted',
    },
  };
}

describe('SVD-113 supervisor dispatch artifact store', () => {
  it('persists canonical redacted goal, task, receipt, event-DAG, and manifest CIDs through browser Helia', async () => {
    const helia = new MemoryHelia();
    const store = createSupervisorDispatchArtifactStore({ helia, now: () => new Date(createdAt) });
    const persisted = await store.persist(dispatch(), policy);

    expect(persisted).toMatchObject({ state: 'stored', cache_fallback_used: false });
    expect(persisted.dispatch_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.keys(persisted.artifacts).sort()).toEqual([
      'dispatch_manifest', 'event_dag_checkpoint', 'goal', 'receipt', 'task',
    ]);
    expect(helia.puts).toHaveLength(5);
    expect(helia.puts.every(entry => entry.pin)).toBe(true);
    expect(persisted.artifacts.event_dag_checkpoint).toMatchObject({
      compaction_certificate_cid: dispatch().event_dag.compaction_certificate_cid,
      archive_cid: dispatch().event_dag.archive_cid,
      retention: 'pinned',
      redacted: true,
    });

    const goalBytes = helia.values.get(persisted.artifacts.goal!.cid)!;
    const goalText = new TextDecoder().decode(goalBytes);
    expect(goalText).not.toContain('do-not-persist');
    expect(goalText).not.toContain('also-not-persisted');
    expect(goalText).toContain('[REDACTED]');

    const restored = await store.retrieveDispatch(persisted.dispatch_cid!, policy);
    expect(restored).toMatchObject({
      state: 'found', backend: 'helia', verified: true, kind: 'dispatch_manifest',
    });
    const manifest = restored.value!.payload as { artifacts: Array<{ kind: string; cid: string }> };
    expect(manifest.artifacts.map(entry => entry.kind).sort()).toEqual([
      'event_dag_checkpoint', 'goal', 'receipt', 'task',
    ]);
  });

  it('retrieves a persisted artifact through approved kit and Kubo peers and never an unapproved peer', async () => {
    const producerHelia = new MemoryHelia();
    const producer = createSupervisorDispatchArtifactStore({ helia: producerHelia, now: () => new Date(createdAt) });
    const persisted = await producer.persist(dispatch(), policy);
    const consumerHelia = new MemoryHelia();
    const unapprovedCalls: string[] = [];
    const consumer = createSupervisorDispatchArtifactStore({
      helia: consumerHelia,
      peers: [
        { id: 'kubo-unapproved', kind: 'kubo', approved: false, get: async cid => { unapprovedCalls.push(cid); return producerHelia.get(cid); } },
        { id: 'kit-approved', kind: 'kit', approved: true, get: cid => producerHelia.get(cid) },
      ],
      now: () => new Date(createdAt),
    });
    const result = await consumer.retrieve(persisted.artifacts.receipt!.cid, policy);

    expect(result).toMatchObject({ state: 'found', backend: 'approved-peer', peer_id: 'kit-approved', verified: true });
    expect(unapprovedCalls).toEqual([]);

    const kuboConsumer = createSupervisorDispatchArtifactStore({
      helia: new MemoryHelia(),
      peers: [{ id: 'kubo-approved', kind: 'kubo', approved: true, get: cid => producerHelia.get(cid) }],
      now: () => new Date(createdAt),
    });
    const kubo = await kuboConsumer.retrieve(persisted.artifacts.receipt!.cid, {
      ...policy, approved_peer_ids: ['kit-approved', 'kubo-approved'],
    });
    expect(kubo).toMatchObject({ state: 'found', backend: 'approved-peer', peer_id: 'kubo-approved', verified: true });
  });

  it('uses only the redacted cache as a policy-enabled recovery path and exposes unavailable/denied states', async () => {
    const helia = new MemoryHelia();
    const store = createSupervisorDispatchArtifactStore({ helia, now: () => new Date(createdAt) });
    const persisted = await store.persist(dispatch(), policy);
    helia.available = false;
    const cached = await store.retrieve(persisted.artifacts.task!.cid, policy);
    expect(cached).toMatchObject({ state: 'found', backend: 'cache', verified: true });

    store.clearCache();
    const missing = await store.retrieve(persisted.artifacts.task!.cid, policy);
    expect(missing).toMatchObject({ state: 'unavailable', backend: 'none', verified: false });

    const noHelia = createSupervisorDispatchArtifactStore({ now: () => new Date(createdAt) });
    const unavailable = await noHelia.persist(dispatch(), { ...policy, allow_cache_fallback: false });
    expect(unavailable).toMatchObject({ state: 'unavailable', cache_fallback_used: false });
    const denied = await store.persist(dispatch(), { ...policy, allow_persistence: false });
    expect(denied).toMatchObject({ state: 'denied' });
  });

  it('redacts camelCase secrets and rejects non-canonical artifacts before any storage write', async () => {
    const helia = new MemoryHelia();
    const store = createSupervisorDispatchArtifactStore({ helia, now: () => new Date(createdAt) });
    const sensitive = dispatch();
    sensitive.goal = { accessToken: 'camel-case-secret', nested: { privateKey: 'never-store-this' } };
    const persisted = await store.persist(sensitive, policy);
    const encodedGoal = new TextDecoder().decode(helia.values.get(persisted.artifacts.goal!.cid)!);
    expect(encodedGoal).not.toContain('camel-case-secret');
    expect(encodedGoal).not.toContain('never-store-this');
    expect(encodedGoal.match(/\[REDACTED\]/g)).toHaveLength(2);

    const cyclic = dispatch();
    const cyclicGoal: Record<string, unknown> = {};
    cyclicGoal.self = cyclicGoal;
    cyclic.goal = cyclicGoal;
    const beforeInvalid = helia.puts.length;
    const invalid = await store.persist(cyclic, policy);
    expect(invalid).toMatchObject({ state: 'denied', artifacts: {} });
    expect(invalid.reason).toContain('acyclic JSON-compatible');
    expect(helia.puts).toHaveLength(beforeInvalid);

    const malformed = dispatch() as { event_dag: unknown };
    malformed.event_dag = null;
    const malformedResult = await store.persist(malformed as ReturnType<typeof dispatch>, policy);
    expect(malformedResult).toMatchObject({ state: 'denied', artifacts: {} });
    expect(malformedResult.reason).toContain('event-DAG checkpoint must be a JSON object');

    const nonJson = dispatch();
    nonJson.goal = new Date(createdAt);
    const nonJsonResult = await store.persist(nonJson, policy);
    expect(nonJsonResult).toMatchObject({ state: 'denied', artifacts: {} });
    expect(nonJsonResult.reason).toContain('acyclic JSON-compatible');
    expect(helia.puts).toHaveLength(beforeInvalid);
  });

  it('writes reproducible evidence covering policy, peer, compaction, retention, cache, and failure behavior', async () => {
    const helia = new MemoryHelia();
    const store = createSupervisorDispatchArtifactStore({ helia, now: () => new Date(createdAt) });
    const persisted = await store.persist(dispatch(), policy);
    const receiptCid = persisted.artifacts.receipt!.cid;
    const local = await store.retrieve(receiptCid, policy);
    const kit = await createSupervisorDispatchArtifactStore({
      helia: new MemoryHelia(),
      peers: [{ id: 'kit-approved', kind: 'kit', approved: true, get: cid => helia.get(cid) }],
    }).retrieve(receiptCid, policy);
    const kubo = await createSupervisorDispatchArtifactStore({
      helia: new MemoryHelia(),
      peers: [{ id: 'kubo-approved', kind: 'kubo', approved: true, get: cid => helia.get(cid) }],
    }).retrieve(receiptCid, { ...policy, approved_peer_ids: ['kit-approved', 'kubo-approved'] });
    helia.available = false;
    const cache = await store.retrieve(receiptCid, policy);
    store.clearCache();
    const unavailable = await store.retrieve(receiptCid, policy);
    const evidence = {
      schema: 'swissknife.supervisor-dispatch-artifact-store-evidence.v1',
      task_id: 'SVD-113',
      generated_at: createdAt,
      decision: 'GO',
      runtime_boundary: {
        browser_safe: true,
        direct_kubo_http: false,
        host_filesystem: false,
        helia: 'injected browser-safe adapter',
      },
      policy: {
        persistence: 'permit', retention: policy.retention, pinning: true,
        redaction_required: true, receipt_required: true, event_dag_required: true,
        approved_peer_ids: policy.approved_peer_ids,
      },
      persistence: {
        state: persisted.state, dispatch_cid: persisted.dispatch_cid,
        artifact_kinds: Object.keys(persisted.artifacts).sort(),
        compaction_certificate_cid: persisted.artifacts.event_dag_checkpoint?.compaction_certificate_cid,
        archive_cid: persisted.artifacts.event_dag_checkpoint?.archive_cid,
        cache_fallback_used: persisted.cache_fallback_used,
      },
      retrieval: {
        local: { backend: local.backend, verified: local.verified },
        kit: { backend: kit.backend, peer_id: kit.peer_id, verified: kit.verified },
        kubo: { backend: kubo.backend, peer_id: kubo.peer_id, verified: kubo.verified },
        peer_contract: 'approved kit/Kubo peers only; unapproved peers are skipped',
        cid_verification: 'sha256 canonical bytes',
      },
      fallback: {
        cache: { state: cache.state, backend: cache.backend, verified: cache.verified },
        exhausted: { state: unavailable.state, backend: unavailable.backend, verified: unavailable.verified },
      },
      unavailable_state: 'unavailable after Helia, approved peers, and permitted cache are exhausted',
      validation: { command: 'npm run test:run -- test/mcp-plus-plus/supervisor-dispatch-artifact-store.test.ts' },
    };
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    expect(JSON.parse(readFileSync(evidencePath, 'utf8'))).toEqual(evidence);
  });
});

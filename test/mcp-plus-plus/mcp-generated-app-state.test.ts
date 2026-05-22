import {
  GeneratedAppStateManager,
  MemoryGeneratedAppReplayStorage,
  replayGeneratedAppState,
  restoreGeneratedAppState,
} from '../../src/services/mcp-generated-app-state';
import type { ORBStreamEvent } from '../../src/services/mcp-orb-capability-router';

function streamEvent(overrides: Partial<ORBStreamEvent> = {}): ORBStreamEvent {
  return {
    correlation_id: 'corr-1',
    interface_cid: 'sha256:descriptor',
    operation: 'sync_status',
    event: { status: 'running', progress: 0.5 },
    generation_key: 'dataset_sync_generation',
    binding_handle: 'handle-1',
    binding_generation: 0,
    received_at: '2026-05-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('generated app event-sourced state', () => {
  it('persists command, stream, and projection replay logs per app instance', async () => {
    const storage = new MemoryGeneratedAppReplayStorage();
    const manager = new GeneratedAppStateManager({
      app_id: 'ipfs-datasets-workbench',
      app_instance_id: 'instance-1',
      storage,
      now: () => '2026-05-21T00:00:00.000Z',
    });

    await manager.dispatchCommand({
      operation: 'browse',
      input: { path: '/' },
      correlation_id: 'corr-1',
    });
    await manager.resolveCommand({
      correlation_id: 'corr-1',
      output: { entries: [] },
      receipt: {
        receipt_cid: 'sha256:receipt',
        correlation_id: 'corr-1',
        interface_cid: 'sha256:descriptor',
        descriptor_name: 'ipfs-datasets-workbench',
        descriptor_version: '0.1.0',
        service_id: 'datasets',
        operation: 'browse',
        transport: 'local',
        policy_decision: {
          outcome: 'permit',
          reasons: ['ok'],
          required_capabilities: [],
          granted_capabilities: [],
          decision_cid: 'sha256:decision',
        },
        output_refs: [],
        provenance_refs: [],
        parent_receipt_cids: [],
        lifecycle: [],
        issued_at: '2026-05-21T00:00:00.000Z',
      },
    });
    await manager.startStream({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      binding_handle: 'handle-1',
      binding_generation: 0,
      generation_key: 'dataset_sync_generation',
    });
    await manager.recordStreamEvent({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      event: streamEvent(),
    });
    await manager.updateProjection('dataset_browser', { rows: [] });

    const restored = await restoreGeneratedAppState({
      app_id: 'ipfs-datasets-workbench',
      app_instance_id: 'instance-1',
      storage,
    });
    const state = restored.getState();

    expect(state.replay_event_count).toBe(5);
    expect(state.commands['corr-1'].status).toBe('resolved');
    expect(state.commands['corr-1'].receipt_cid).toBe('sha256:receipt');
    expect(state.stream_events).toHaveLength(1);
    expect(state.projections.dataset_browser).toEqual({ rows: [] });
    expect(restored.getReplayLog().map(event => event.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('replays deterministically independent of input event order', async () => {
    const storage = new MemoryGeneratedAppReplayStorage();
    const manager = new GeneratedAppStateManager({
      app_id: 'ipfs-datasets-workbench',
      app_instance_id: 'instance-2',
      storage,
    });

    await manager.dispatchCommand({ operation: 'pin', input: { cid: 'bafy' }, correlation_id: 'corr-pin' });
    await manager.updateProjection('timeline', ['queued']);
    await manager.resolveCommand({ correlation_id: 'corr-pin', output: { status: 'queued' } });

    const log = manager.getReplayLog();
    const forward = replayGeneratedAppState('ipfs-datasets-workbench', 'instance-2', log);
    const reversed = replayGeneratedAppState('ipfs-datasets-workbench', 'instance-2', [...log].reverse());

    expect(reversed).toEqual(forward);
  });

  it('guards stream generations and records stale-handle rejections across reconnects', async () => {
    const manager = new GeneratedAppStateManager({
      app_id: 'ipfs-datasets-workbench',
      app_instance_id: 'instance-3',
    });

    await manager.startStream({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      binding_handle: 'handle-1',
      binding_generation: 0,
      generation_key: 'dataset_sync_generation',
    });
    await manager.recoverStream({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      binding_handle: 'handle-2',
      binding_generation: 1,
      generation_key: 'dataset_sync_generation',
    });
    const stale = await manager.recordStreamEvent({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      event: streamEvent({ binding_handle: 'handle-1', binding_generation: 0 }),
    });
    const fresh = await manager.recordStreamEvent({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      event: streamEvent({ binding_handle: 'handle-2', binding_generation: 1 }),
    });
    const state = manager.getState();

    expect(stale.accepted).toBe(false);
    expect(stale.reason).toContain('Stale stream handle');
    expect(fresh.accepted).toBe(true);
    expect(state.stream_events).toHaveLength(1);
    expect(state.stale_stream_events).toHaveLength(1);
  });
});

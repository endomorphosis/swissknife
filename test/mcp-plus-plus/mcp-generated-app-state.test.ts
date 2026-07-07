import {
  GeneratedAppStateManager,
  MemoryGeneratedAppReplayStorage,
  replayGeneratedAppState,
  restoreGeneratedAppState,
} from '../../src/services/mcp/mcp-generated-app-state';
import type { ORBStreamEvent } from '../../src/services/mcp/mcp-orb-capability-router';

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
      event: streamEvent({ event_cid: 'sha256:fresh-event', binding_handle: 'handle-2', binding_generation: 1 }),
    });
    const duplicate = await manager.recordStreamEvent({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      event: streamEvent({ event_cid: 'sha256:fresh-event', binding_handle: 'handle-2', binding_generation: 1 }),
    });
    const staleGeneration = await manager.recordStreamEvent({
      operation: 'sync_status',
      correlation_id: 'corr-1',
      event: streamEvent({ binding_handle: 'handle-2', binding_generation: 0 }),
    });
    const state = manager.getState();

    expect(stale.accepted).toBe(false);
    expect(stale.reason).toContain('Stale stream handle');
    expect(fresh.accepted).toBe(true);
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.reason).toContain('Duplicate stream event');
    expect(staleGeneration.accepted).toBe(false);
    expect(staleGeneration.reason).toContain('Stale stream generation');
    expect(state.stream_events).toHaveLength(1);
    expect(state.stale_stream_events).toHaveLength(3);
  });

  it('projects correlation audit lineage across receipts, streams, workflow steps, and replay', async () => {
    const storage = new MemoryGeneratedAppReplayStorage();
    const manager = new GeneratedAppStateManager({
      app_id: 'ipfs-dataset-inference-workflow',
      app_instance_id: 'instance-audit',
      storage,
      now: () => '2026-05-21T00:00:00.000Z',
    });
    const receipt = {
      receipt_cid: 'sha256:receipt-artifact',
      correlation_id: 'corr-audit',
      interface_cid: 'sha256:descriptor',
      descriptor_name: 'ipfs-dataset-inference-workflow',
      descriptor_version: '0.1.0',
      service_id: 'datasets',
      operation: 'publish_artifact',
      transport: 'local' as const,
      policy_decision: {
        outcome: 'permit' as const,
        reasons: ['ok'],
        required_capabilities: [],
        granted_capabilities: [],
        decision_cid: 'sha256:decision',
      },
      output_refs: ['bafybeigdyrzt5artifact'],
      provenance_refs: ['corr-audit', 'sha256:descriptor'],
      parent_receipt_cids: [],
      lifecycle: [],
      issued_at: '2026-05-21T00:00:00.000Z',
    };

    await manager.dispatchCommand({
      operation: 'publish_artifact',
      input: { artifact_cid: 'bafybeigdyrzt5artifact' },
      correlation_id: 'corr-audit',
    });
    await manager.resolveCommand({
      correlation_id: 'corr-audit',
      output: { publication_id: 'pub-1', artifact_cid: 'bafybeigdyrzt5artifact' },
      receipt,
    });
    await manager.startStream({
      operation: 'publish_artifact',
      correlation_id: 'corr-audit',
      binding_handle: 'handle-a',
      binding_generation: 0,
      generation_key: 'workflow_artifact_publish_generation',
    });
    await manager.recoverStream({
      operation: 'publish_artifact',
      correlation_id: 'corr-audit',
      binding_handle: 'handle-b',
      binding_generation: 1,
      generation_key: 'workflow_artifact_publish_generation',
    });
    await manager.recordStreamEvent({
      operation: 'publish_artifact',
      correlation_id: 'corr-audit',
      event: streamEvent({
        correlation_id: 'corr-audit',
        operation: 'publish_artifact',
        event: { artifact_cid: 'bafybeigdyrzt5artifact', status: 'completed' },
        generation_key: 'workflow_artifact_publish_generation',
        binding_handle: 'handle-b',
        binding_generation: 1,
      }),
    });
    await manager.recordWorkflowStep({
      workflow_id: 'dataset-inference-artifact-publish',
      step_id: 'publish_artifact',
      operation: 'publish_artifact',
      correlation_id: 'corr-audit',
      status: 'completed',
      output: { artifact_cid: 'bafybeigdyrzt5artifact' },
      receipt,
      shared_state_updates: {
        artifact_cid: 'bafybeigdyrzt5artifact',
        publication_id: 'pub-1',
      },
    });

    const restored = await restoreGeneratedAppState({
      app_id: 'ipfs-dataset-inference-workflow',
      app_instance_id: 'instance-audit',
      storage,
    });
    const audit = restored.getState().audit;

    expect(audit.by_correlation_id['corr-audit'].map(entry => entry.kind)).toEqual([
      'command',
      'receipt',
      'stream',
      'workflow_step',
    ]);
    expect(audit.artifact_lineage.bafybeigdyrzt5artifact).toEqual([
      'corr-audit',
      'corr-audit',
      'corr-audit',
    ]);
    expect(audit.entries.find(entry => entry.kind === 'workflow_step')?.receipt_cid).toBe('sha256:receipt-artifact');
    expect(restored.getState().workflows['dataset-inference-artifact-publish']).toMatchObject({
      step_order: ['publish_artifact'],
      shared_state: {
        artifact_cid: 'bafybeigdyrzt5artifact',
        publication_id: 'pub-1',
      },
    });
  });
});

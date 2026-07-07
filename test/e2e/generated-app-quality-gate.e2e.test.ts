import { runGeneratedAppQualityGate } from '../../src/services/mcp/mcp-generated-app-quality-gates';
import { IPFS_MCP_UI_PROFILE_DESCRIPTORS } from '../../src/services/mcp/mcp-ipfs-ui-descriptors';
import {
  createGeneratedAppState,
  renderGeneratedApp,
} from '../../web/js/generated-app-launcher.js';

describe('generated MCP++ app quality gate e2e', () => {
  it('launches a descriptor-driven app and verifies invocation, stream, recovery, and denial paths', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-datasets-workbench',
      invoke_operation: 'browse',
      stream_operation: 'sync_status',
    });

    expect(report.launch.template.kind).toBe('explorer');
    expect(report.invocation.denied).toBe(false);
    expect(report.denial.denied).toBe(true);
    expect(report.stream?.first_event.binding_generation).toBe(0);
    expect(report.stream?.binding_generation).toBe(1);
  });

  it('launches and executes the composed dataset-to-inference workflow without bespoke shell code', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-dataset-inference-workflow',
      invoke_operation: 'select_dataset',
      stream_operation: 'pin_dataset',
    });

    expect(report.launch.template.kind).toBe('graph-viewer');
    expect(report.workflow?.completed_steps).toEqual([
      'select_dataset',
      'pin_dataset',
      'run_inference',
      'collect_artifact',
      'publish_artifact',
    ]);
    expect(report.workflow?.recovery_paths.artifact_publish_retry).toBe(true);
  });

  it('renders policy-aware disabled, hidden, and sanitized generated controls', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-datasets-workbench',
      invoke_operation: 'browse',
      stream_operation: 'sync_status',
    });
    const html = renderGeneratedApp({
      descriptor: report.launch.descriptor,
      template: report.launch.template,
      interface_cid: report.descriptor_cid,
      trust: report.launch.trust,
    }, {
      capabilities: ['dataset/read'],
      policy_decisions: {
        pin: { outcome: 'deny', visibility: 'disabled', reasons: ['<pin denied>'] },
        publish: { outcome: 'unavailable', visibility: 'hidden', reasons: ['publish unavailable'] },
      },
    });

    expect(html).toContain('data-operation="pin"');
    expect(html).toContain('disabled');
    expect(html).toContain('&lt;pin denied&gt;');
    expect(html).not.toContain('data-operation="publish"');
  });

  it('restores generated app replay state with provenance audit lineage', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-dataset-inference-workflow',
      invoke_operation: 'select_dataset',
      stream_operation: 'pin_dataset',
    });
    const storage = new Map();
    const replayStorage = {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    };
    const app = {
      descriptor: report.launch.descriptor,
      template: report.launch.template,
      interface_cid: report.descriptor_cid,
    };
    const state = createGeneratedAppState(app, {
      app_instance_id: 'e2e-replay',
      replay_storage: replayStorage,
    });

    state.recordCommand('publish_artifact', { artifact_cid: 'bafybeigdyrzt5artifact' }, { correlation_id: 'corr-e2e' });
    state.resolveCommand('corr-e2e', { artifact_cid: 'bafybeigdyrzt5artifact' }, {
      receipt_cid: 'sha256:receipt-e2e',
      operation: 'publish_artifact',
      interface_cid: report.descriptor_cid,
      output_refs: ['bafybeigdyrzt5artifact'],
      provenance_refs: ['corr-e2e'],
    });
    state.recordWorkflowStep({
      workflow_id: 'dataset-inference-artifact-publish',
      step_id: 'publish_artifact',
      operation: 'publish_artifact',
      correlation_id: 'corr-e2e',
      status: 'completed',
      output: { artifact_cid: 'bafybeigdyrzt5artifact' },
      shared_state_updates: { artifact_cid: 'bafybeigdyrzt5artifact' },
    });

    const restored = createGeneratedAppState(app, {
      app_instance_id: 'e2e-replay',
      replay_storage: replayStorage,
    });
    const projection = restored.restore();

    expect(projection.replay_event_count).toBe(3);
    expect(projection.audit.artifact_lineage.bafybeigdyrzt5artifact).toEqual([
      'corr-e2e',
      'corr-e2e',
    ]);
    expect(projection.workflows['dataset-inference-artifact-publish'].shared_state.artifact_cid).toBe(
      'bafybeigdyrzt5artifact',
    );
  });
});

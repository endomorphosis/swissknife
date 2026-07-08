import {
  runGeneratedAppQualityGate,
  validateDescriptorSet,
<<<<<<< HEAD
} from '../../src/services/mcp/mcp-generated-app-quality-gates';
=======
} from '../../src/services/apps/mcp-generated-app-quality-gates';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
import {
  IPFS_MCP_UI_PROFILE_DESCRIPTORS,
  ipfsDatasetInferenceWorkflowDescriptor,
  ipfsDatasetsUIProfileDescriptor,
<<<<<<< HEAD
} from '../../src/services/mcp/mcp-ipfs-ui-descriptors';
=======
} from '../../src/services/ipfs/mcp-ipfs-ui-descriptors';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
import type { MCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';

describe('generated app quality gates', () => {
  it('launches a generated app, invokes an action, streams updates, recovers, and covers denial', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-datasets-workbench',
      invoke_operation: 'browse',
      stream_operation: 'sync_status',
    });

    expect(report.launch.descriptor.meta.app_id).toBe('ipfs-datasets-workbench');
    expect(report.generated_ui.commands.map(command => command.operation)).toContain('browse');
    expect(report.invocation.denied).toBe(false);
    expect(report.denial.denied).toBe(true);
    expect(report.stream?.first_event.operation).toBe('sync_status');
    expect(report.stream?.recovered).toBe(true);
    expect(report.stream?.binding_generation).toBe(1);
  });

  it('rejects non-conforming descriptors before generated app launch', async () => {
    const invalid = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)) as MCPUIProfileDescriptor;
    invalid.meta = undefined as unknown as MCPUIProfileDescriptor['meta'];

    expect(() => validateDescriptorSet([invalid])).toThrow(/Descriptor quality gate failed/);
    await expect(runGeneratedAppQualityGate({
      descriptors: [invalid],
      app_id: 'ipfs-datasets-workbench',
      invoke_operation: 'browse',
    })).rejects.toThrow(/Descriptor quality gate failed/);
  });

  it('executes the descriptor-only dataset-to-inference workflow with recovery paths', async () => {
    const report = await runGeneratedAppQualityGate({
      descriptors: IPFS_MCP_UI_PROFILE_DESCRIPTORS,
      app_id: 'ipfs-dataset-inference-workflow',
      invoke_operation: 'select_dataset',
      stream_operation: 'pin_dataset',
    });

    expect(report.launch.template.kind).toBe('graph-viewer');
    expect(report.generated_ui.workflow_graph?.steps).toHaveLength(5);
    expect(report.workflow?.completed_steps).toEqual([
      'select_dataset',
      'pin_dataset',
      'run_inference',
      'collect_artifact',
      'publish_artifact',
    ]);
    expect(report.workflow?.final_state).toMatchObject({
      workflow_correlation_id: 'quality-gate-workflow',
      selected_dataset_cid: 'bafybeigdyrzt5dataset',
      pinned_dataset_cid: 'bafybeigdyrzt5dataset',
      inference_job_id: 'quality-gate-inference-job',
      artifact_cid: 'bafybeigdyrzt5artifact',
      publication_id: 'quality-gate-publication',
    });
    expect(report.workflow?.recovery_paths).toEqual({
      failed_pin_retry: true,
      failed_inference_rollback: true,
      stream_reconnect: true,
      artifact_publish_retry: true,
    });
    expect(ipfsDatasetInferenceWorkflowDescriptor.workflow_graph?.steps[3].id).toBe('collect_artifact');
  });
});

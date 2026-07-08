import {
  inspectGeneratedAppReplayLog,
  inspectMCPUIProfileDescriptor,
} from '../../src/services/mcp/mcp-descriptor-inspector';
import {
  GeneratedAppStateManager,
  MemoryGeneratedAppReplayStorage,
<<<<<<< HEAD
} from '../../src/services/mcp/mcp-generated-app-state';
import {
  ipfsDatasetInferenceWorkflowDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/mcp/mcp-ipfs-ui-descriptors';
=======
} from '../../src/services/apps/mcp-generated-app-state';
import {
  ipfsDatasetInferenceWorkflowDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/ipfs/mcp-ipfs-ui-descriptors';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
import type { MCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';

describe('MCP++ descriptor inspector', () => {
  it('summarizes descriptor sections, operations, permissions, and state events', () => {
    const inspection = inspectMCPUIProfileDescriptor(ipfsDatasetsUIProfileDescriptor);

    expect(inspection.validation.conformant).toBe(true);
    expect(inspection.template.kind).toBe('explorer');
    expect(inspection.template.reason).toContain('primary_template');
    expect(inspection.services.map(service => service.id)).toContain('ipfs-datasets-py');
    expect(inspection.operations.map(operation => operation.method)).toContain('browse');
    expect(inspection.operations.find(operation => operation.method === 'browse')?.input_fields).toContain('root_cid');
    expect(inspection.permissions.operations.browse).toEqual(['dataset/read']);
    expect(inspection.state_model.events).toContain('dataset.pin.progress');
  });

  it('includes workflow graph details for composed descriptors', () => {
    const inspection = inspectMCPUIProfileDescriptor(ipfsDatasetInferenceWorkflowDescriptor);

    expect(inspection.template.kind).toBe('graph-viewer');
    expect(inspection.workflow_graph?.steps.map(step => step.id)).toEqual([
      'select_dataset',
      'pin_dataset',
      'run_inference',
      'collect_artifact',
      'publish_artifact',
    ]);
  });

  it('summarizes replay logs for restoration and debugging', async () => {
    const storage = new MemoryGeneratedAppReplayStorage();
    const manager = new GeneratedAppStateManager({
      app_id: 'ipfs-dataset-inference-workflow',
      app_instance_id: 'inspector-instance',
      descriptor_name: ipfsDatasetInferenceWorkflowDescriptor.name,
      descriptor_version: ipfsDatasetInferenceWorkflowDescriptor.version,
      interface_cid: 'sha256:descriptor',
      storage,
      now: () => '2026-05-21T00:00:00.000Z',
    });
    await manager.dispatchCommand({
      operation: 'publish_artifact',
      input: { artifact_cid: 'bafybeigdyrzt5artifact' },
      correlation_id: 'corr-inspector',
    });
    await manager.recordWorkflowStep({
      workflow_id: 'dataset-inference-artifact-publish',
      step_id: 'publish_artifact',
      operation: 'publish_artifact',
      correlation_id: 'corr-inspector',
      status: 'completed',
      output: { artifact_cid: 'bafybeigdyrzt5artifact' },
      shared_state_updates: { artifact_cid: 'bafybeigdyrzt5artifact' },
    });

    const log = manager.getReplayLog();
    const summary = inspectGeneratedAppReplayLog(log);
    const inspection = inspectMCPUIProfileDescriptor(ipfsDatasetInferenceWorkflowDescriptor, log);

    expect(log[0]).toMatchObject({
      descriptor_name: ipfsDatasetInferenceWorkflowDescriptor.name,
      descriptor_version: ipfsDatasetInferenceWorkflowDescriptor.version,
      interface_cid: 'sha256:descriptor',
    });
    expect(summary).toMatchObject({
      app_id: 'ipfs-dataset-inference-workflow',
      app_instance_id: 'inspector-instance',
      replay_event_count: 2,
      command_count: 1,
      workflow_ids: ['dataset-inference-artifact-publish'],
      artifact_cids: ['bafybeigdyrzt5artifact'],
    });
    expect(inspection.replay?.descriptor_name).toBe(ipfsDatasetInferenceWorkflowDescriptor.name);
  });

  it('shows policy decisions, missing capabilities, and generated UI mapping diagnostics', () => {
    const inspection = inspectMCPUIProfileDescriptor(ipfsDatasetsUIProfileDescriptor, {
      granted_capabilities: ['dataset/read'],
      policy_decisions: {
        pin: { outcome: 'deny', visibility: 'disabled', reasons: ['Missing dataset/pin grant'] },
        publish: { outcome: 'unavailable', visibility: 'hidden', reasons: ['Circuit breaker open'] },
      },
    });

    expect(inspection.policy_decisions.pin.outcome).toBe('deny');
    expect(inspection.ui_mapping?.commands.find(command => command.operation === 'browse')?.missing_capabilities).toEqual([]);
    expect(inspection.ui_mapping?.commands.find(command => command.operation === 'pin')).toMatchObject({
      hidden: false,
      disabled_reason: 'Missing dataset/pin grant',
      missing_capabilities: ['dataset/pin'],
    });
    expect(inspection.ui_mapping?.commands.find(command => command.operation === 'publish')?.hidden).toBe(true);
    expect(inspection.ui_mapping?.failures).toEqual([]);
  });

  it('highlights validation failures with actionable paths', () => {
    const invalid = JSON.parse(JSON.stringify(ipfsDatasetsUIProfileDescriptor)) as MCPUIProfileDescriptor;
    invalid.services[0].operations.push('missing_operation');

    const inspection = inspectMCPUIProfileDescriptor(invalid);

    expect(inspection.validation.conformant).toBe(false);
    expect(inspection.validation.errors.map(error => error.path)).toContain('services[0].operations');
    expect(inspection.template.reason).toContain('validation errors');
  });
});

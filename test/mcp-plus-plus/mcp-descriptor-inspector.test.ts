import { inspectMCPUIProfileDescriptor } from '../../src/services/mcp-descriptor-inspector';
import {
  ipfsDatasetInferenceWorkflowDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/mcp-ipfs-ui-descriptors';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp-ui-profile';

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
      'publish_artifact',
    ]);
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

import {
  runGeneratedAppQualityGate,
  validateDescriptorSet,
} from '../../src/services/mcp-generated-app-quality-gates';
import {
  IPFS_MCP_UI_PROFILE_DESCRIPTORS,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/mcp-ipfs-ui-descriptors';
import type { MCPUIProfileDescriptor } from '../../src/services/mcp-ui-profile';

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
});

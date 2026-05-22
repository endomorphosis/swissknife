import { runGeneratedAppQualityGate } from '../../src/services/mcp-generated-app-quality-gates';
import { IPFS_MCP_UI_PROFILE_DESCRIPTORS } from '../../src/services/mcp-ipfs-ui-descriptors';

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
});

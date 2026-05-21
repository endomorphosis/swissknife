import { InterfaceRepository } from '../../src/services/mcp-idl';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
} from '../../src/services/mcp-interface-registry';
import {
  IPFS_MCP_UI_PROFILE_DESCRIPTORS,
  getIPFSMCPUIProfileDescriptors,
  ipfsAccelerateUIProfileDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/mcp-ipfs-ui-descriptors';
import {
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
} from '../../src/services/mcp-ui-profile';

describe('IPFS MCP++ UI descriptor fixtures', () => {
  it('validates all static IPFS descriptors without live services', () => {
    for (const descriptor of IPFS_MCP_UI_PROFILE_DESCRIPTORS) {
      const result = validateMCPUIProfileDescriptor(descriptor);

      expect(result.conformant).toBe(true);
      expect(result.errors).toEqual([]);
    }
  });

  it('models ipfs_datasets_py dataset operations and progress streams', () => {
    const methods = new Set(ipfsDatasetsUIProfileDescriptor.methods.map(method => method.name));
    const streaming = ipfsDatasetsUIProfileDescriptor.data_contracts.operations
      .filter(operation => operation.stream?.kind === 'progress')
      .map(operation => operation.method);

    expect(methods).toEqual(new Set(['browse', 'get', 'index', 'pin', 'publish', 'sync_status']));
    expect(streaming).toEqual(['index', 'pin', 'publish', 'sync_status']);
    expect(selectTemplateForDescriptor(ipfsDatasetsUIProfileDescriptor).kind).toBe('explorer');
  });

  it('models ipfs_accelerate_py compute operations and telemetry streams', () => {
    const methods = new Set(ipfsAccelerateUIProfileDescriptor.methods.map(method => method.name));
    const streamKinds = ipfsAccelerateUIProfileDescriptor.data_contracts.operations
      .map(operation => operation.stream?.kind)
      .filter(Boolean);

    expect(methods).toEqual(new Set(['hardware_profile', 'run_inference_job', 'job_status', 'telemetry']));
    expect(streamKinds).toEqual(['job-status', 'job-status', 'telemetry']);
    expect(selectTemplateForDescriptor(ipfsAccelerateUIProfileDescriptor).kind).toBe('job-console');
  });

  it('can publish static descriptors and resolve them through MCP++ discovery', async () => {
    const backend = new LocalMCPInterfaceRegistryBackend(new InterfaceRepository());
    const registry = new MCPInterfaceDiscoveryRegistry(backend);

    for (const descriptor of getIPFSMCPUIProfileDescriptors()) {
      registry.publish(descriptor);
    }

    const datasetResolution = await registry.resolveForLaunch({
      app_id: 'ipfs-datasets-workbench',
      interface_type: 'dataset',
      required_methods: ['browse', 'pin', 'publish'],
    });
    const computeResolution = await registry.resolveForLaunch({
      app_id: 'ipfs-accelerate-console',
      interface_type: 'compute',
      required_methods: ['hardware_profile', 'run_inference_job', 'job_status'],
    });

    expect(datasetResolution?.template.kind).toBe('explorer');
    expect(computeResolution?.template.kind).toBe('job-console');
  });
});

import {
  IPFS_DATASETS_REQUIRED_SURFACES,
  getIPFSDatasetsDescriptorPack,
  getIPFSDatasetsDescriptorPackDescriptors,
  ipfsDatasetsDescriptorPack,
  validateIPFSDatasetsDescriptorPack,
} from '../../src/services/ipfs/mcp-ipfs-datasets-descriptor-pack';
import { generateSchemaDrivenUI } from '../../src/services/mcp/mcp-schema-ui-generator';
import { validateMCPUIProfileDescriptor } from '../../src/services/mcp/mcp-ui-profile';

describe('ipfs_datasets_py descriptor pack', () => {
  it('validates offline without a live ipfs_datasets_py service', () => {
    const result = validateIPFSDatasetsDescriptorPack();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('maps all required dataset and progress surfaces to backend MCP tools', () => {
    const surfaces = new Set(ipfsDatasetsDescriptorPack.backend_bindings.map(binding => binding.surface));

    for (const surface of IPFS_DATASETS_REQUIRED_SURFACES) {
      expect(surfaces.has(surface)).toBe(true);
    }

    expect(ipfsDatasetsDescriptorPack.backend_bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'browse',
          tool_function: 'load_dataset',
        }),
        expect.objectContaining({
          surface: 'get',
          tool_function: 'get_from_ipfs',
        }),
        expect.objectContaining({
          surface: 'pin',
          tool_function: 'pin_to_ipfs',
        }),
        expect.objectContaining({
          surface: 'publish',
          tool_function: 'save_dataset',
        }),
        expect.objectContaining({
          surface: 'sync',
          tool_function: 'check_task_status',
        }),
        expect.objectContaining({
          surface: 'progress',
          tool_function: 'get_task_status',
        }),
      ]),
    );
  });

  it('uses normalized progress event streams for long-running dataset operations', () => {
    const streamingBindings = ipfsDatasetsDescriptorPack.backend_bindings.filter(binding => binding.stream);

    expect(streamingBindings.map(binding => binding.operation)).toEqual(
      expect.arrayContaining(['index', 'pin', 'publish', 'sync_status']),
    );
    expect(streamingBindings.every(binding => binding.stream?.event_contract === 'progress_event')).toBe(true);
    expect(ipfsDatasetsDescriptorPack.normalized_contracts.progress_event.required).toEqual(
      ['correlation_id', 'operation', 'status', 'progress', 'timestamp'],
    );
  });

  it('exports descriptors that conform and generate desktop UI models', () => {
    const descriptors = getIPFSDatasetsDescriptorPackDescriptors();

    expect(descriptors).toHaveLength(1);
    expect(validateMCPUIProfileDescriptor(descriptors[0]).conformant).toBe(true);

    const generated = generateSchemaDrivenUI(descriptors[0]);
    expect(generated.template).toBe('explorer');
    expect(generated.commands.map(command => command.operation)).toEqual(
      expect.arrayContaining(['browse', 'get', 'index', 'pin', 'publish', 'sync_status']),
    );
    expect(generated.widgets.some(widget => widget.widget === 'progress-timeline')).toBe(true);
    expect(generated.widgets.some(widget => widget.widget === 'provenance-panel')).toBe(true);
  });

  it('returns a defensive copy for pack consumers', () => {
    const pack = getIPFSDatasetsDescriptorPack();
    pack.descriptors[0].name = 'mutated';

    expect(ipfsDatasetsDescriptorPack.descriptors[0].name).toBe('ipfs-datasets-workbench');
  });
});

import {
  IPFS_ACCELERATE_REQUIRED_SURFACES,
  getIPFSAccelerateDescriptorPack,
  getIPFSAccelerateDescriptorPackDescriptors,
  ipfsAccelerateDescriptorPack,
  validateIPFSAccelerateDescriptorPack,
} from '../../src/services/mcp/mcp-ipfs-accelerate-descriptor-pack';
import { generateSchemaDrivenUI } from '../../src/services/mcp-schema-ui-generator';
import { validateMCPUIProfileDescriptor } from '../../src/services/mcp-ui-profile';

describe('ipfs_accelerate_py descriptor pack', () => {
  it('validates offline without a live ipfs_accelerate_py service', () => {
    const result = validateIPFSAccelerateDescriptorPack();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('maps all required compute and telemetry surfaces to backend tools', () => {
    const surfaces = new Set(ipfsAccelerateDescriptorPack.backend_bindings.map(binding => binding.surface));

    for (const surface of IPFS_ACCELERATE_REQUIRED_SURFACES) {
      expect(surfaces.has(surface)).toBe(true);
    }

    expect(ipfsAccelerateDescriptorPack.backend_bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'hardware_profile',
          tool_function: 'HardwareDetector.get_available_hardware',
        }),
        expect.objectContaining({
          surface: 'run_inference_job',
          tool_function: 'submit_task',
        }),
        expect.objectContaining({
          surface: 'job_status',
          tool_function: 'get_task',
        }),
        expect.objectContaining({
          surface: 'telemetry',
          tool_function: 'PrometheusMetrics.generate_metrics',
        }),
      ]),
    );
  });

  it('uses normalized telemetry events and cross-service composition contracts', () => {
    const streamingBindings = ipfsAccelerateDescriptorPack.backend_bindings.filter(binding => binding.stream);

    expect(streamingBindings.map(binding => binding.operation)).toEqual(
      expect.arrayContaining(['run_inference_job', 'job_status', 'telemetry']),
    );
    expect(streamingBindings.every(binding => binding.stream?.event_contract === 'telemetry_event')).toBe(true);
    expect(ipfsAccelerateDescriptorPack.normalized_contracts.telemetry_event.required).toEqual(
      ['correlation_id', 'status', 'metrics', 'timestamp'],
    );
    expect(ipfsAccelerateDescriptorPack.normalized_contracts.dataset_ref).toBeDefined();
    expect(ipfsAccelerateDescriptorPack.normalized_contracts.artifact_ref).toBeDefined();
    expect(ipfsAccelerateDescriptorPack.normalized_contracts.provenance_ref).toBeDefined();
  });

  it('exports descriptors that conform and generate desktop UI models', () => {
    const descriptors = getIPFSAccelerateDescriptorPackDescriptors();

    expect(descriptors).toHaveLength(1);
    expect(validateMCPUIProfileDescriptor(descriptors[0]).conformant).toBe(true);

    const generated = generateSchemaDrivenUI(descriptors[0]);
    expect(generated.template).toBe('job-console');
    expect(generated.commands.map(command => command.operation)).toEqual(
      expect.arrayContaining(['hardware_profile', 'run_inference_job', 'job_status', 'telemetry']),
    );
    expect(generated.widgets.some(widget => widget.widget === 'status-badge')).toBe(true);
    expect(generated.widgets.some(widget => widget.widget === 'provenance-panel')).toBe(true);
  });

  it('returns a defensive copy for pack consumers', () => {
    const pack = getIPFSAccelerateDescriptorPack();
    pack.descriptors[0].name = 'mutated';

    expect(ipfsAccelerateDescriptorPack.descriptors[0].name).toBe('ipfs-accelerate-console');
  });
});

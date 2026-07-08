/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import * as actualFs from 'fs';
import {
  AppCapabilityGateway,
} from '../../src/services/apps/app-capability-gateway';
import {
  getIPFSAppCapabilitiesForApp,
  getIPFSAppCapabilityRegistry,
  validateIPFSAppCapabilityRegistry,
  type IPFSAppCapabilityRegistry,
} from '../../src/services/apps/ipfs-app-capability-registry';
import type { AppCapabilityDefinition } from '../../src/services/apps/app-capability-gateway';

const matrixPath = join(
  process.cwd(),
  'test-results/virtual-desktop-ipfs-mcp-orb/capability-matrix.json',
);

let registry: IPFSAppCapabilityRegistry;

describe('IPFS app capability registry', () => {
  beforeAll(() => {
    registry = getIPFSAppCapabilityRegistry();
    actualFs.mkdirSync(dirname(matrixPath), { recursive: true });
    actualFs.writeFileSync(
      matrixPath,
      `${JSON.stringify({
        registry_id: registry.registry_id,
        version: registry.version,
        generated_from: registry.generated_from,
        families: registry.families,
        matrix: registry.matrix,
      }, null, 2)}\n`,
    );
  });

  it('validates every descriptor-derived capability and writes the capability matrix', () => {
    const result = validateIPFSAppCapabilityRegistry(registry);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(registry.matrix.length).toBe(registry.capabilities.length);
    expect(registry.matrix.length).toBeGreaterThan(90);
  });

  it('covers all three IPFS service families from their descriptor packs', () => {
    expect(registry.families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service_family: 'ipfs_kit_py',
          descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
          operation_count: 28,
        }),
        expect.objectContaining({
          service_family: 'ipfs_datasets_py',
          descriptor_pack_id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
          operation_count: 6,
        }),
        expect.objectContaining({
          service_family: 'ipfs_accelerate_py',
          descriptor_pack_id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
          operation_count: 4,
        }),
      ]),
    );
  });

  it('maps broad manifest capabilities to descriptor-backed schemas and render hints', () => {
    const terminalStorage = capability('terminal', 'ipfs.kit.storage');
    const datasetsDiscovery = capability('datasets-browser', 'ipfs.datasets.discovery');
    const accelerateInference = capability('accelerate-panel', 'ipfs.accelerate.inference');

    expect(operationEnum(terminalStorage.input_schema)).toEqual(
      expect.arrayContaining(['ipfs_add', 'ipfs_cat', 'pin_add', 'block_get']),
    );
    expect(terminalStorage.policy_class).toBe('write');
    expect(terminalStorage.execution_modes).toEqual(
      expect.arrayContaining(['mock', 'direct_import', 'direct_cli', 'mcp_remote', 'mcp_plus_plus_remote']),
    );
    expect(terminalStorage.desktop_result_renderer).toContain('schema-ui');
    expect(terminalStorage.glasses_summary_renderer).toContain('terminal');
    expect(terminalStorage.fallback_strategy).toContain('descriptor-preview');

    expect(operationEnum(datasetsDiscovery.input_schema)).toEqual(
      expect.arrayContaining(['browse', 'get', 'sync_status']),
    );
    expect(datasetsDiscovery.result_schema?.properties).toBeDefined();
    expect(datasetsDiscovery.desktop_result_renderer).toContain('explorer');

    expect(operationEnum(accelerateInference.input_schema)).toEqual(
      expect.arrayContaining(['run_inference_job', 'job_status']),
    );
    expect(accelerateInference.policy_class).toBe('heavy_compute');
    expect(accelerateInference.desktop_result_renderer).toContain('job-console');
  });

  it('registers concrete ipfs_kit_py tool capabilities for Terminal and IPFS Explorer', () => {
    const terminalAdd = capability('terminal', 'ipfs.kit.tool.ipfs_add');
    const explorerDagPut = capability('ipfs-explorer', 'ipfs.kit.tool.dag_put');

    expect(terminalAdd.mcp_tool_name).toBe('ipfs_add');
    expect(terminalAdd.input_schema?.required).toEqual(['file_path']);
    expect(terminalAdd.policy_class).toBe('write');
    expect(terminalAdd.mcp_plus_plus_interface).toBe('ipfs_kit/ipfs_tools.ipfs_add');

    expect(explorerDagPut.mcp_tool_name).toBe('dag_put');
    expect(explorerDagPut.input_schema?.required).toEqual(['data']);
    expect(explorerDagPut.result_schema?.type).toBe('object');
  });

  it('registers generated dataset operations with policy, schemas, and summary hints', () => {
    const browserCapabilities = getIPFSAppCapabilitiesForApp('datasets-browser');
    const browse = capabilityFrom(browserCapabilities, 'ipfs.datasets.operation.browse');
    const index = capabilityFrom(browserCapabilities, 'ipfs.datasets.operation.index');
    const publish = capabilityFrom(browserCapabilities, 'ipfs.datasets.operation.publish');

    expect(browse.mcp_tool_name).toBe('load_dataset');
    expect(browse.policy_class).toBe('read');
    expect(browse.input_schema?.type).toBe('object');
    expect(browse.result_schema?.type).toBe('object');
    expect(browse.glasses_summary_renderer).toContain('ipfs_datasets_py');

    expect(index.mcp_tool_name).toBe('load_index');
    expect(index.policy_class).toBe('heavy_compute');
    expect(index.desktop_result_renderer).toContain('streams:progress');

    expect(publish.mcp_tool_name).toBe('save_dataset');
    expect(publish.policy_class).toBe('write');
    expect(publish.receipt_policy).toBe('required_for_side_effects');
  });

  it('registers generated accelerate operations for hardware, inference, jobs, and telemetry', () => {
    const hardware = capability('accelerate-panel', 'ipfs.accelerate.operation.hardware_profile');
    const inference = capability('accelerate-panel', 'ipfs.accelerate.operation.run_inference_job');
    const telemetry = capability('accelerate-panel', 'ipfs.accelerate.operation.telemetry');

    expect(hardware.policy_class).toBe('read');
    expect(hardware.mcp_tool_name).toBe('HardwareDetector.get_available_hardware');

    expect(inference.policy_class).toBe('heavy_compute');
    expect(inference.confirmation_policy).toBe('confirm');
    expect(inference.mcp_tool_name).toBe('submit_task');
    expect(inference.input_schema?.properties).toBeDefined();
    expect(inference.result_schema?.properties).toBeDefined();

    expect(telemetry.policy_class).toBe('read');
    expect(telemetry.desktop_result_renderer).toContain('streams:telemetry');
  });

  it('can be mounted into the app capability gateway and invoked with stable envelopes', async () => {
    const gateway = new AppCapabilityGateway({
      capabilities: registry.capabilities,
      idFactory: () => 'corr-ipfs-registry',
      now: fixedClock(),
    });

    const envelope = await gateway.invoke({
      app_id: 'accelerate-panel',
      capability_id: 'ipfs.accelerate.operation.run_inference_job',
      input: { prompt: 'summarize dataset', model_id: 'test-model' },
    });

    expect(envelope.status).toBe('degraded');
    expect(envelope.trace.correlation_id).toBe('corr-ipfs-registry');
    expect(envelope.trace.service_family).toBe('ipfs_accelerate_py');
    expect(envelope.trace.descriptor_pack_id).toBe('org.endomorphosis.ipfs_accelerate_py.compute-pack');
    expect(envelope.policy.policy_class).toBe('heavy_compute');
    expect(envelope.receipt_refs[0].capability_id).toBe('ipfs.accelerate.operation.run_inference_job');
  });
});

function capability(appId: string, capabilityId: string): AppCapabilityDefinition {
  return capabilityFrom(registry.capabilities, capabilityId, appId);
}

function capabilityFrom(
  capabilities: readonly AppCapabilityDefinition[],
  capabilityId: string,
  appId?: string,
): AppCapabilityDefinition {
  const found = capabilities.find(candidate => (
    candidate.capability_id === capabilityId && (!appId || candidate.app_id === appId)
  ));
  if (!found) {
    throw new Error(`Missing capability ${appId ? `${appId}::` : ''}${capabilityId}`);
  }
  return found;
}

function operationEnum(schema: Record<string, unknown> | undefined): string[] {
  const properties = schema?.properties as Record<string, unknown> | undefined;
  const operation = properties?.operation as Record<string, unknown> | undefined;
  return Array.isArray(operation?.enum)
    ? operation.enum.filter((value): value is string => typeof value === 'string')
    : [];
}

function fixedClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 7, 12, 0, tick++));
}

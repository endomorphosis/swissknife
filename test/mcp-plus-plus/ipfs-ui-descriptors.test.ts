import path from 'path';
import { InterfaceRepository } from '../../src/services/mcp-idl';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
} from '../../src/services/mcp-interface-registry';
import {
  IPFS_MCP_UI_PROFILE_DESCRIPTORS,
  getIPFSMCPUIProfileDescriptors,
  ipfsAccelerateUIProfileDescriptor,
  ipfsDatasetInferenceWorkflowDescriptor,
  ipfsDatasetsUIProfileDescriptor,
} from '../../src/services/mcp-ipfs-ui-descriptors';
import { generateSchemaDrivenUI } from '../../src/services/mcp-schema-ui-generator';
import {
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
} from '../../src/services/mcp-ui-profile';
import {
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
  buildSwissknifeMCPMediatedInvocationPlan,
  getSwissknifeMCPCapabilityRegistry,
  type HallucinateDashboardCapabilityCatalog,
} from '../../src/services/swissknife-mcp-capability-registry';

const HALLUCINATE_DASHBOARD_CATALOG_FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'hallucinate_app',
  'test',
  'e2e',
  'fixtures',
  'vai-512-mcp-dashboard-catalog.json',
);
const nodeFs = process.getBuiltinModule?.('fs') ?? require('fs');

function loadHallucinateDashboardCatalog(): HallucinateDashboardCapabilityCatalog {
  return JSON.parse(nodeFs.readFileSync(HALLUCINATE_DASHBOARD_CATALOG_FIXTURE, 'utf8'));
}

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

  it('models a composed dataset to inference to artifact publish workflow graph', () => {
    const workflow = ipfsDatasetInferenceWorkflowDescriptor.workflow_graph;
    const generated = generateSchemaDrivenUI(ipfsDatasetInferenceWorkflowDescriptor);

    expect(workflow?.steps.map(step => step.id)).toEqual([
      'select_dataset',
      'pin_dataset',
      'run_inference',
      'collect_artifact',
      'publish_artifact',
    ]);
    expect(workflow?.steps[1].depends_on).toEqual(['select_dataset']);
    expect(workflow?.steps[2].depends_on).toEqual(['pin_dataset']);
    expect(workflow?.steps[3].depends_on).toEqual(['run_inference']);
    expect(workflow?.steps[4].depends_on).toEqual(['collect_artifact']);
    expect(workflow?.steps[3].write_state_keys).toEqual(['artifact_cid']);
    expect(workflow?.steps.some(step => step.rollback || step.compensation)).toBe(true);
    expect(generated.template).toBe('graph-viewer');
    expect(generated.workflow_graph?.id).toBe('dataset-inference-artifact-publish');
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

  it('advertises supervised Python MCP server launch contracts through Swissknife capabilities', () => {
    const registry = getSwissknifeMCPCapabilityRegistry();

    expect(registry.map(entry => entry.server_package).sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py',
    ]);
    expect(Object.fromEntries(
      registry.map(entry => [entry.server_package, entry.launch_contract.daemon.startup_order]),
    )).toEqual({
      ipfs_accelerate_py: 30,
      ipfs_datasets_py: 20,
      ipfs_kit_py: 10,
    });
    expect(Object.fromEntries(
      registry.map(entry => [entry.server_package, entry.launch_contract.daemon.port]),
    )).toEqual({
      ipfs_accelerate_py: 3003,
      ipfs_datasets_py: 3002,
      ipfs_kit_py: 8014,
    });

    for (const entry of registry) {
      expect(entry.launch_contract.source).toBe('HAO-674');
      expect(entry.launch_contract.launch_owner).toBe('hallucinate_app.mcp_daemon_manager');
      expect(entry.launch_contract.mcp_plus_plus_advertisement.compatibility).toBe('MCP++');
      expect(entry.launch_contract.control_surface_route.before_invoke_hook).toContain(
        'ControlSurfaceInvocationGate.beforeInvoke',
      );
      expect(entry.launch_contract.control_surface_route.route).toEqual(
        expect.arrayContaining([
          'Hallucinate App interaction_envelope',
          'control_surface policy_decision',
          'mediation_receipt',
          'supervised MCP server transport',
        ]),
      );
    }

    const datasetPlan = buildSwissknifeMCPMediatedInvocationPlan('ipfs_datasets_py', 'dataset.browse');
    const kitPlan = buildSwissknifeMCPMediatedInvocationPlan('ipfs_kit_py', 'storage.pin_content');
    const acceleratePlan = buildSwissknifeMCPMediatedInvocationPlan('ipfs_accelerate_py', 'compute.run_inference');

    expect(datasetPlan?.tool_name).toBe('tools_dispatch');
    expect(kitPlan?.tool_name).toBe('ipfs_pin_add');
    expect(acceleratePlan?.tool_name).toBe('tools_dispatch');
    expect(datasetPlan?.required_receipt_fields).toContain('mediation_receipt_id');
  });

  it('consumes the Hallucinate MCP dashboard catalog without duplicate dashboard schemas or mocks', () => {
    const catalog = loadHallucinateDashboardCatalog();
    const plans = buildSwissknifeMCPDashboardConsumerPlans(catalog);

    expect(plans.map(plan => plan.server_package).sort()).toEqual([
      'ipfs_accelerate_py',
      'ipfs_datasets_py',
      'ipfs_kit_py',
    ]);
    expect(new Set(plans.map(plan => plan.catalog_schema))).toEqual(new Set([
      'hallucinate_app.mcp_dashboard_capability_catalog.v1',
    ]));
    expect(catalog.launch_objective_ids).toEqual(['VAIOS-G723', 'VAIOS-G724', 'VAIOS-G728']);
    expect(catalog.launch_validation_gate).toMatchObject({
      task_id: 'MGW-533',
      goal_id: 'VAIOS-G724',
      evidence_term: 'launch Playwright validation gate',
    });

    for (const plan of plans) {
      expect(plan.catalog_generated_by).toBe('hallucinate_app.node.mcp_daemon_manager.getDashboardCapabilityCatalog');
      expect(plan.dashboard_only_mock).toBe(false);
      expect(plan.receipt_schema).toBe('mcp_server_invocation_receipt_v1');
      expect(plan.control_surface_route).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'supervised MCP server transport',
      ]));
      expect(plan.required_receipt_fields).toEqual(expect.arrayContaining([
        'interaction_envelope',
        'policy_decision',
        'mediation_receipt',
        'mediation_receipt_id',
        'receipt_cid',
      ]));
      expect(plan.tools_list.operation).toBe('tools/list');
      expect(plan.tools_call.operation).toBe('tools/call');
      expect(plan.tools_call.safeProbe?.mutation).toBe(false);
    }

    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_kit_py', 'tools/list').url)
      .toBe('http://127.0.0.1:8014/mcp/tools/list');
    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_datasets_py', 'tools/call').safe_probe?.tool_name)
      .toBe('datasets_list');
    expect(buildSwissknifeMCPDashboardInvocationPlan(catalog, 'ipfs_accelerate_py', 'tools/call').safe_probe?.tool_name)
      .toBe('hardware_profile');
  });
});

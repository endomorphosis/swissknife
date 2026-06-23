import type { InterfaceType, MCPUIProfileDescriptor, TemplateKind } from './mcp-ui-profile.js';
import { ipfsAccelerateUIProfileDescriptor, ipfsDatasetsUIProfileDescriptor } from './mcp-ipfs-ui-descriptors.js';

export const SWISSKNIFE_MCP_CAPABILITY_REGISTRY_ID = 'org.hallucinate_app.swissknife.mcp-capability-registry';
export const SWISSKNIFE_MCP_CAPABILITY_REGISTRY_VERSION = '0.1.0';

export type SwissknifeMCPServerPackage =
  | 'ipfs_accelerate_py'
  | 'ipfs_datasets_py'
  | 'ipfs_kit_py';

export type SwissknifeMCPTransport = 'mcp-server' | 'http' | 'stdio' | 'websocket';

export interface SwissknifeMCPCommandIntent {
  intent: string;
  normalized_method: string;
  tool_name: string;
  tool_category?: string;
  upstream_function: string;
  payload_contracts: string[];
}

export interface SwissknifeMCPUIAffordance {
  template: TemplateKind;
  primary_region: string;
  surfaces: string[];
  stream?: 'progress' | 'telemetry' | 'job-status';
}

export interface SwissknifeMCPMediationReceiptAliases {
  receipt_schema: 'mcp_server_invocation_receipt_v1';
  service_alias: string;
  descriptor_alias: string;
  daemon_id: string;
  tool_aliases: Record<string, string>;
  required_fields: string[];
}

export interface SwissknifeMCPCapabilityDescriptor {
  server_package: SwissknifeMCPServerPackage;
  daemon_id: string;
  descriptor_id: string;
  app_id: string;
  title: string;
  interface_type: InterfaceType;
  transport: SwissknifeMCPTransport;
  endpoint: string;
  capability_descriptor: {
    source: 'HAO-443';
    operations: string[];
    permissions: Record<string, string[]>;
    ui_affordances: SwissknifeMCPUIAffordance[];
    command_intents: SwissknifeMCPCommandIntent[];
    mediation_receipt_aliases: SwissknifeMCPMediationReceiptAliases;
  };
}

const RECEIPT_REQUIRED_FIELDS = [
  'server_package',
  'daemon_id',
  'transport',
  'protocol',
  'rpc_path',
  'tool_name',
  'upstream_function',
  'swissknife_consumer',
  'interaction_envelope_id',
  'policy_decision_id',
  'policy_receipt_id',
  'mediation_receipt_id',
  'descriptor_id',
  'arguments_hash',
  'payload_contracts',
  'dispatch_allowed',
  'upstream_status',
  'receipt_cid',
];

function descriptorId(descriptor: MCPUIProfileDescriptor): string {
  return `${descriptor.namespace}.${descriptor.name}@${descriptor.version}`;
}

export const swissknifeMCPCapabilityRegistry: SwissknifeMCPCapabilityDescriptor[] = [
  {
    server_package: 'ipfs_datasets_py',
    daemon_id: 'ipfs-datasets',
    descriptor_id: descriptorId(ipfsDatasetsUIProfileDescriptor),
    app_id: ipfsDatasetsUIProfileDescriptor.meta.app_id,
    title: ipfsDatasetsUIProfileDescriptor.meta.title,
    interface_type: 'dataset',
    transport: 'mcp-server',
    endpoint: 'mcp://ipfs_datasets_py',
    capability_descriptor: {
      source: 'HAO-443',
      operations: ['browse', 'get', 'index', 'pin', 'publish', 'sync_status'],
      permissions: ipfsDatasetsUIProfileDescriptor.permissions.operations,
      ui_affordances: [
        { template: 'explorer', primary_region: 'dataset-browser', surfaces: ['browse', 'get', 'pin', 'publish'] },
        { template: 'job-console', primary_region: 'dataset-job-status', surfaces: ['index', 'pin', 'publish', 'sync_status'], stream: 'progress' },
      ],
      command_intents: [
        { intent: 'dataset.browse', normalized_method: 'browse', tool_name: 'tools_dispatch', tool_category: 'dataset_tools', upstream_function: 'load_dataset', payload_contracts: ['dataset_ref', 'provenance_ref'] },
        { intent: 'dataset.get_content', normalized_method: 'get', tool_name: 'tools_dispatch', tool_category: 'ipfs_tools', upstream_function: 'get_from_ipfs', payload_contracts: ['content_ref', 'provenance_ref'] },
        { intent: 'dataset.index', normalized_method: 'index', tool_name: 'tools_dispatch', tool_category: 'index_management_tools', upstream_function: 'load_index', payload_contracts: ['dataset_ref', 'job_ref', 'progress_event', 'artifact_ref'] },
        { intent: 'dataset.pin', normalized_method: 'pin', tool_name: 'tools_dispatch', tool_category: 'ipfs_tools', upstream_function: 'pin_to_ipfs', payload_contracts: ['content_ref', 'job_ref', 'progress_event'] },
        { intent: 'dataset.publish', normalized_method: 'publish', tool_name: 'tools_dispatch', tool_category: 'dataset_tools', upstream_function: 'save_dataset', payload_contracts: ['dataset_ref', 'artifact_ref', 'provenance_ref'] },
        { intent: 'dataset.progress', normalized_method: 'sync_status', tool_name: 'tools_dispatch', tool_category: 'background_task_tools', upstream_function: 'get_task_status', payload_contracts: ['job_ref', 'progress_event'] },
      ],
      mediation_receipt_aliases: {
        receipt_schema: 'mcp_server_invocation_receipt_v1',
        service_alias: 'swissknife.ipfs_datasets_py',
        descriptor_alias: 'ipfs-datasets-workbench',
        daemon_id: 'ipfs-datasets',
        tool_aliases: {
          browse: 'datasets.tools_dispatch.dataset_tools.load_dataset',
          get: 'datasets.tools_dispatch.ipfs_tools.get_from_ipfs',
          index: 'datasets.tools_dispatch.index_management_tools.load_index',
          pin: 'datasets.tools_dispatch.ipfs_tools.pin_to_ipfs',
          publish: 'datasets.tools_dispatch.dataset_tools.save_dataset',
          sync_status: 'datasets.tools_dispatch.background_task_tools.get_task_status',
        },
        required_fields: RECEIPT_REQUIRED_FIELDS,
      },
    },
  },
  {
    server_package: 'ipfs_accelerate_py',
    daemon_id: 'ipfs-accelerate',
    descriptor_id: descriptorId(ipfsAccelerateUIProfileDescriptor),
    app_id: ipfsAccelerateUIProfileDescriptor.meta.app_id,
    title: ipfsAccelerateUIProfileDescriptor.meta.title,
    interface_type: 'compute',
    transport: 'mcp-server',
    endpoint: 'mcp://ipfs_accelerate_py',
    capability_descriptor: {
      source: 'HAO-443',
      operations: ['hardware_profile', 'run_inference_job', 'job_status', 'telemetry'],
      permissions: ipfsAccelerateUIProfileDescriptor.permissions.operations,
      ui_affordances: [
        { template: 'job-console', primary_region: 'inference-form', surfaces: ['run_inference_job', 'job_status'], stream: 'job-status' },
        { template: 'dashboard', primary_region: 'hardware-summary', surfaces: ['hardware_profile', 'telemetry'], stream: 'telemetry' },
      ],
      command_intents: [
        { intent: 'compute.hardware_profile', normalized_method: 'hardware_profile', tool_name: 'tools_dispatch', tool_category: 'hardware', upstream_function: 'HardwareDetector.get_available_hardware', payload_contracts: ['hardware_profile_ref', 'provenance_ref'] },
        { intent: 'compute.run_inference', normalized_method: 'run_inference_job', tool_name: 'tools_dispatch', tool_category: 'workflow', upstream_function: 'llm_router.submit_task', payload_contracts: ['model_ref', 'dataset_ref', 'inference_input_ref', 'inference_job_ref'] },
        { intent: 'compute.job_status', normalized_method: 'job_status', tool_name: 'tools_dispatch', tool_category: 'background_task_tools', upstream_function: 'llm_router.get_task', payload_contracts: ['inference_job_ref', 'telemetry_event', 'artifact_ref'] },
        { intent: 'compute.telemetry', normalized_method: 'telemetry', tool_name: 'tools_runtime_metrics', upstream_function: 'PrometheusMetrics.generate_metrics', payload_contracts: ['hardware_profile_ref', 'telemetry_event'] },
      ],
      mediation_receipt_aliases: {
        receipt_schema: 'mcp_server_invocation_receipt_v1',
        service_alias: 'swissknife.ipfs_accelerate_py',
        descriptor_alias: 'ipfs-accelerate-console',
        daemon_id: 'ipfs-accelerate',
        tool_aliases: {
          hardware_profile: 'accelerate.tools_dispatch.hardware.HardwareDetector.get_available_hardware',
          run_inference_job: 'accelerate.tools_dispatch.workflow.llm_router.submit_task',
          job_status: 'accelerate.tools_dispatch.background_task_tools.llm_router.get_task',
          telemetry: 'accelerate.tools_runtime_metrics.PrometheusMetrics.generate_metrics',
        },
        required_fields: RECEIPT_REQUIRED_FIELDS,
      },
    },
  },
  {
    server_package: 'ipfs_kit_py',
    daemon_id: 'ipfs-kit',
    descriptor_id: 'org.endomorphosis.ipfs_kit_py.ipfs-kit-storage-console@0.1.0',
    app_id: 'ipfs-kit-storage-console',
    title: 'IPFS Kit Storage Console',
    interface_type: 'storage',
    transport: 'mcp-server',
    endpoint: 'mcp://ipfs_kit_py',
    capability_descriptor: {
      source: 'HAO-443',
      operations: ['add_content', 'get_content', 'pin_content', 'list_pins', 'backend_health'],
      permissions: {
        add_content: ['storage/write', 'ipfs/add'],
        get_content: ['storage/read', 'ipfs/cat'],
        pin_content: ['storage/pin', 'ipfs/pin'],
        list_pins: ['storage/read', 'ipfs/pin/read'],
        backend_health: ['storage/read', 'daemon/health'],
      },
      ui_affordances: [
        { template: 'explorer', primary_region: 'content-browser', surfaces: ['get_content', 'list_pins'] },
        { template: 'dashboard', primary_region: 'backend-health', surfaces: ['backend_health', 'list_pins'] },
        { template: 'form-wizard', primary_region: 'storage-command', surfaces: ['add_content', 'pin_content'] },
      ],
      command_intents: [
        { intent: 'storage.add_content', normalized_method: 'add_content', tool_name: 'ipfs_add', upstream_function: '/api/v0/ipfs/add', payload_contracts: ['content_ref', 'storage_backend_ref', 'provenance_ref'] },
        { intent: 'storage.get_content', normalized_method: 'get_content', tool_name: 'ipfs_cat', upstream_function: '/api/v0/ipfs/cat/{cid}', payload_contracts: ['content_ref', 'storage_backend_ref'] },
        { intent: 'storage.pin_content', normalized_method: 'pin_content', tool_name: 'ipfs_pin_add', upstream_function: '/api/v0/ipfs/pin/add', payload_contracts: ['content_ref', 'pin_ref', 'provenance_ref'] },
        { intent: 'storage.list_pins', normalized_method: 'list_pins', tool_name: 'list_pins', upstream_function: '/api/v0/ipfs/pin/ls', payload_contracts: ['pin_ref', 'pin_status_event'] },
        { intent: 'storage.backend_health', normalized_method: 'backend_health', tool_name: 'get_backend_status', upstream_function: '/api/v0/storage/backends', payload_contracts: ['storage_backend_ref', 'health_event'] },
      ],
      mediation_receipt_aliases: {
        receipt_schema: 'mcp_server_invocation_receipt_v1',
        service_alias: 'swissknife.ipfs_kit_py',
        descriptor_alias: 'ipfs-kit-storage-console',
        daemon_id: 'ipfs-kit',
        tool_aliases: {
          add_content: 'kit.ipfs_add./api/v0/ipfs/add',
          get_content: 'kit.ipfs_cat./api/v0/ipfs/cat',
          pin_content: 'kit.ipfs_pin_add./api/v0/ipfs/pin/add',
          list_pins: 'kit.list_pins./api/v0/ipfs/pin/ls',
          backend_health: 'kit.get_backend_status./api/v0/storage/backends',
        },
        required_fields: RECEIPT_REQUIRED_FIELDS,
      },
    },
  },
];

export function getSwissknifeMCPCapabilityRegistry(): SwissknifeMCPCapabilityDescriptor[] {
  return JSON.parse(JSON.stringify(swissknifeMCPCapabilityRegistry)) as SwissknifeMCPCapabilityDescriptor[];
}

export function getSwissknifeMCPCapabilityDescriptor(
  serverPackage: SwissknifeMCPServerPackage,
): SwissknifeMCPCapabilityDescriptor | undefined {
  return getSwissknifeMCPCapabilityRegistry()
    .find(descriptor => descriptor.server_package === serverPackage);
}

export function getSwissknifeMCPCommandIntent(
  serverPackage: SwissknifeMCPServerPackage,
  intent: string,
): SwissknifeMCPCommandIntent | undefined {
  return getSwissknifeMCPCapabilityDescriptor(serverPackage)
    ?.capability_descriptor.command_intents
    .find(commandIntent => commandIntent.intent === intent);
}

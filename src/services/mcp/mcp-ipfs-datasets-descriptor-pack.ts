import {
  ipfsDatasetsUIProfileDescriptor,
} from './mcp-ipfs-ui-descriptors.js';
import {
  validateMCPUIProfileDescriptor,
  type MCPUIProfileDescriptor,
  type StreamKind,
} from '../mcp/mcp-ui-profile.js';

export type IPFSDatasetsSurface =
  | 'browse'
  | 'get'
  | 'index'
  | 'pin'
  | 'publish'
  | 'sync'
  | 'progress';

export type IPFSDatasetsPayloadContract =
  | 'dataset_ref'
  | 'content_ref'
  | 'job_ref'
  | 'artifact_ref'
  | 'progress_event'
  | 'provenance_ref';

export interface IPFSDatasetsBackendToolBinding {
  surface: IPFSDatasetsSurface;
  operation: string;
  tool_module: string;
  tool_function: string;
  backend_contract: string;
  payload_contracts: IPFSDatasetsPayloadContract[];
  stream?: {
    kind: StreamKind;
    event_contract: IPFSDatasetsPayloadContract;
    correlation_id_field: string;
  };
  notes?: string;
}

export interface IPFSDatasetsDescriptorPackValidationIssue {
  path: string;
  message: string;
}

export interface IPFSDatasetsDescriptorPackValidationResult {
  valid: boolean;
  errors: IPFSDatasetsDescriptorPackValidationIssue[];
  warnings: IPFSDatasetsDescriptorPackValidationIssue[];
}

export interface IPFSDatasetsDescriptorPack {
  id: string;
  version: string;
  source_repository: string;
  descriptors: MCPUIProfileDescriptor[];
  required_surfaces: IPFSDatasetsSurface[];
  backend_bindings: IPFSDatasetsBackendToolBinding[];
  normalized_contracts: Record<IPFSDatasetsPayloadContract, Record<string, unknown>>;
}

const DATASET_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dataset_id: { type: 'string' },
    root_cid: { type: 'string' },
    path: { type: 'string' },
    format: { type: 'string' },
  },
};

const CONTENT_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cid: { type: 'string' },
    path: { type: 'string' },
    media_type: { type: 'string' },
    size_bytes: { type: 'number' },
  },
  required: ['cid'],
};

const JOB_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: { type: 'string' },
    job_id: { type: 'string' },
    status: { type: 'string' },
  },
  required: ['correlation_id'],
};

const ARTIFACT_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    artifact_cid: { type: 'string' },
    publication_id: { type: 'string' },
    destination: { type: 'string', enum: ['ipfs', 'ipns', 'car'] },
  },
  required: ['artifact_cid'],
};

const PROGRESS_EVENT_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: { type: 'string' },
    job_id: { type: 'string' },
    operation: { type: 'string', enum: ['index', 'pin', 'publish', 'sync'] },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    progress: { type: 'number', minimum: 0, maximum: 1 },
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['correlation_id', 'operation', 'status', 'progress', 'timestamp'],
};

const PROVENANCE_REF_CONTRACT = {
  type: 'object',
  additionalProperties: true,
  properties: {
    correlation_id: { type: 'string' },
    source_interface_cid: { type: 'string' },
    actor: { type: 'string' },
    operation: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const IPFS_DATASETS_REQUIRED_SURFACES: IPFSDatasetsSurface[] = [
  'browse',
  'get',
  'index',
  'pin',
  'publish',
  'sync',
  'progress',
];

export const ipfsDatasetsBackendBindings: IPFSDatasetsBackendToolBinding[] = [
  {
    surface: 'browse',
    operation: 'browse',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.dataset_tools.load_dataset',
    tool_function: 'load_dataset',
    backend_contract: 'load_dataset(source, format, options)',
    payload_contracts: ['dataset_ref', 'provenance_ref'],
    notes: 'Browse is normalized as loading or listing a dataset source by path, CID, or hub name.',
  },
  {
    surface: 'get',
    operation: 'get',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.ipfs_tools.get_from_ipfs',
    tool_function: 'get_from_ipfs',
    backend_contract: 'get_from_ipfs(cid, output_path, timeout_seconds, gateway)',
    payload_contracts: ['content_ref', 'provenance_ref'],
  },
  {
    surface: 'index',
    operation: 'index',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.index_management_tools.index_management_tools',
    tool_function: 'load_index',
    backend_contract: "load_index(action='create'|'status', dataset, knn_index, index_config)",
    payload_contracts: ['dataset_ref', 'job_ref', 'artifact_ref', 'progress_event', 'provenance_ref'],
    stream: {
      kind: 'progress',
      event_contract: 'progress_event',
      correlation_id_field: 'correlation_id',
    },
  },
  {
    surface: 'pin',
    operation: 'pin',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.ipfs_tools.pin_to_ipfs',
    tool_function: 'pin_to_ipfs',
    backend_contract: 'pin_to_ipfs(content_source, recursive, wrap_with_directory, hash_algo)',
    payload_contracts: ['content_ref', 'job_ref', 'progress_event', 'provenance_ref'],
    stream: {
      kind: 'progress',
      event_contract: 'progress_event',
      correlation_id_field: 'correlation_id',
    },
  },
  {
    surface: 'publish',
    operation: 'publish',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.dataset_tools.save_dataset',
    tool_function: 'save_dataset',
    backend_contract: 'save_dataset(dataset_data, destination, format, options)',
    payload_contracts: ['dataset_ref', 'artifact_ref', 'progress_event', 'provenance_ref'],
    stream: {
      kind: 'progress',
      event_contract: 'progress_event',
      correlation_id_field: 'correlation_id',
    },
    notes: 'Publication can compose save_dataset, pin_to_ipfs, and record_provenance.',
  },
  {
    surface: 'sync',
    operation: 'sync_status',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.background_task_tools.background_task_tools',
    tool_function: 'check_task_status',
    backend_contract: 'check_task_status(task_id, task_type, status_filter, limit)',
    payload_contracts: ['job_ref', 'progress_event'],
    stream: {
      kind: 'progress',
      event_contract: 'progress_event',
      correlation_id_field: 'correlation_id',
    },
  },
  {
    surface: 'progress',
    operation: 'sync_status',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.background_task_tools.enhanced_background_task_tools',
    tool_function: 'get_task_status',
    backend_contract: 'get_task_status(task_id, include_logs, include_system_status, include_queue_status)',
    payload_contracts: ['job_ref', 'progress_event'],
    stream: {
      kind: 'progress',
      event_contract: 'progress_event',
      correlation_id_field: 'correlation_id',
    },
  },
  {
    surface: 'publish',
    operation: 'publish',
    tool_module: 'ipfs_datasets_py.mcp_server.tools.provenance_tools.record_provenance',
    tool_function: 'record_provenance',
    backend_contract: 'record_provenance(dataset_id, operation, inputs, parameters, description, agent_id)',
    payload_contracts: ['artifact_ref', 'provenance_ref'],
    notes: 'Auxiliary binding used to persist publish lineage after artifact creation.',
  },
];

export const ipfsDatasetsDescriptorPack: IPFSDatasetsDescriptorPack = {
  id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
  version: '0.1.0',
  source_repository: 'https://github.com/endomorphosis/ipfs_datasets_py',
  descriptors: [ipfsDatasetsUIProfileDescriptor],
  required_surfaces: IPFS_DATASETS_REQUIRED_SURFACES,
  backend_bindings: ipfsDatasetsBackendBindings,
  normalized_contracts: {
    dataset_ref: DATASET_REF_CONTRACT,
    content_ref: CONTENT_REF_CONTRACT,
    job_ref: JOB_REF_CONTRACT,
    artifact_ref: ARTIFACT_REF_CONTRACT,
    progress_event: PROGRESS_EVENT_CONTRACT,
    provenance_ref: PROVENANCE_REF_CONTRACT,
  },
};

export function getIPFSDatasetsDescriptorPack(): IPFSDatasetsDescriptorPack {
  return JSON.parse(JSON.stringify(ipfsDatasetsDescriptorPack)) as IPFSDatasetsDescriptorPack;
}

export function getIPFSDatasetsDescriptorPackDescriptors(): MCPUIProfileDescriptor[] {
  return getIPFSDatasetsDescriptorPack().descriptors;
}

export function validateIPFSDatasetsDescriptorPack(
  pack: IPFSDatasetsDescriptorPack = ipfsDatasetsDescriptorPack,
): IPFSDatasetsDescriptorPackValidationResult {
  const errors: IPFSDatasetsDescriptorPackValidationIssue[] = [];
  const warnings: IPFSDatasetsDescriptorPackValidationIssue[] = [];

  pack.descriptors.forEach((descriptor, index) => {
    const conformance = validateMCPUIProfileDescriptor(descriptor);
    for (const error of conformance.errors) {
      errors.push({
        path: `descriptors[${index}].${error.path}`,
        message: error.message,
      });
    }
    for (const warning of conformance.warnings) {
      warnings.push({
        path: `descriptors[${index}].${warning.path}`,
        message: warning.message,
      });
    }
  });

  const descriptorOperations = new Set(pack.descriptors.flatMap(
    descriptor => descriptor.data_contracts.operations.map(operation => operation.method),
  ));
  for (const surface of pack.required_surfaces) {
    const bindings = pack.backend_bindings.filter(binding => binding.surface === surface);
    if (bindings.length === 0) {
      errors.push({
        path: `backend_bindings.${surface}`,
        message: `Required surface ${surface} has no backend binding.`,
      });
    }
  }

  for (const [index, binding] of pack.backend_bindings.entries()) {
    if (!binding.tool_module || !binding.tool_function) {
      errors.push({
        path: `backend_bindings[${index}]`,
        message: 'Backend binding must declare tool_module and tool_function.',
      });
    }
    if (!descriptorOperations.has(binding.operation)) {
      errors.push({
        path: `backend_bindings[${index}].operation`,
        message: `Backend binding references unknown descriptor operation: ${binding.operation}.`,
      });
    }
    for (const contract of binding.payload_contracts) {
      if (!pack.normalized_contracts[contract]) {
        errors.push({
          path: `backend_bindings[${index}].payload_contracts`,
          message: `Unknown normalized payload contract: ${contract}.`,
        });
      }
    }
    if (binding.stream && binding.stream.event_contract !== 'progress_event') {
      errors.push({
        path: `backend_bindings[${index}].stream.event_contract`,
        message: 'Dataset stream bindings must use the normalized progress_event contract.',
      });
    }
  }

  const streamingOperations = pack.descriptors.flatMap(descriptor => (
    descriptor.data_contracts.operations.filter(operation => operation.stream?.kind === 'progress')
  ));
  for (const operation of streamingOperations) {
    const eventSchema = operation.stream?.event_schema;
    if (!eventSchema || !hasRequiredProgressEventFields(eventSchema)) {
      errors.push({
        path: `operations.${operation.method}.stream.event_schema`,
        message: 'Progress stream event schema must include correlation_id, operation, status, progress, and timestamp.',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function hasRequiredProgressEventFields(schema: Record<string, unknown>): boolean {
  const required = Array.isArray(schema.required)
    ? schema.required
    : [];
  return ['correlation_id', 'operation', 'status', 'progress', 'timestamp']
    .every(field => required.includes(field));
}

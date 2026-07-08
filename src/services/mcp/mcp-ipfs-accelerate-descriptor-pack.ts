import {
  ipfsAccelerateUIProfileDescriptor,
} from './mcp-ipfs-ui-descriptors.js';
import {
  validateMCPUIProfileDescriptor,
  type MCPUIProfileDescriptor,
  type StreamKind,
} from './mcp-ui-profile.js';

export type IPFSAccelerateSurface =
  | 'hardware_profile'
  | 'run_inference_job'
  | 'job_status'
  | 'telemetry';

export type IPFSAcceleratePayloadContract =
  | 'hardware_profile_ref'
  | 'model_ref'
  | 'dataset_ref'
  | 'inference_input_ref'
  | 'inference_job_ref'
  | 'telemetry_event'
  | 'artifact_ref'
  | 'provenance_ref';

export interface IPFSAccelerateBackendToolBinding {
  surface: IPFSAccelerateSurface;
  operation: string;
  tool_module: string;
  tool_function: string;
  backend_contract: string;
  payload_contracts: IPFSAcceleratePayloadContract[];
  stream?: {
    kind: StreamKind;
    event_contract: IPFSAcceleratePayloadContract;
    correlation_id_field: string;
  };
  notes?: string;
}

export interface IPFSAccelerateDescriptorPackValidationIssue {
  path: string;
  message: string;
}

export interface IPFSAccelerateDescriptorPackValidationResult {
  valid: boolean;
  errors: IPFSAccelerateDescriptorPackValidationIssue[];
  warnings: IPFSAccelerateDescriptorPackValidationIssue[];
}

export interface IPFSAccelerateDescriptorPack {
  id: string;
  version: string;
  source_repository: string;
  descriptors: MCPUIProfileDescriptor[];
  required_surfaces: IPFSAccelerateSurface[];
  backend_bindings: IPFSAccelerateBackendToolBinding[];
  normalized_contracts: Record<IPFSAcceleratePayloadContract, Record<string, unknown>>;
}

const HARDWARE_PROFILE_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hardware_profile_id: { type: 'string' },
    accelerators: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['cpu', 'cuda', 'rocm', 'mps', 'openvino', 'qnn', 'webgpu', 'webnn'] },
          available: { type: 'boolean' },
          device_count: { type: 'integer', minimum: 0 },
          memory_total_mb: { type: 'number', minimum: 0 },
          memory_available_mb: { type: 'number', minimum: 0 },
          compute_capability: { type: 'string' },
        },
        required: ['id', 'kind', 'available'],
      },
    },
    selected_accelerator_id: { type: 'string' },
  },
  required: ['hardware_profile_id', 'accelerators'],
};

const MODEL_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    model_id: { type: 'string' },
    provider: { type: 'string' },
    task_type: { type: 'string' },
    revision: { type: 'string' },
  },
  required: ['model_id'],
};

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

const INFERENCE_INPUT_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cid: { type: 'string' },
    path: { type: 'string' },
    prompt: { type: 'string' },
    media_type: { type: 'string' },
    parameters: {
      type: 'object',
      additionalProperties: true,
    },
  },
};

const INFERENCE_JOB_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: { type: 'string' },
    job_id: { type: 'string' },
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    model_id: { type: 'string' },
    hardware_profile_id: { type: 'string' },
  },
  required: ['correlation_id', 'status'],
};

const TELEMETRY_EVENT_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: { type: 'string' },
    job_id: { type: 'string' },
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    hardware_profile_id: { type: 'string' },
    metrics: {
      type: 'object',
      additionalProperties: { type: ['number', 'string', 'boolean'] },
    },
    artifact_cid: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['correlation_id', 'status', 'metrics', 'timestamp'],
};

const ARTIFACT_REF_CONTRACT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    artifact_cid: { type: 'string' },
    source_dataset_cid: { type: 'string' },
    model_id: { type: 'string' },
    destination: { type: 'string', enum: ['ipfs', 'ipns', 'car', 'local'] },
    media_type: { type: 'string' },
  },
  required: ['artifact_cid'],
};

const PROVENANCE_REF_CONTRACT = {
  type: 'object',
  additionalProperties: true,
  properties: {
    correlation_id: { type: 'string' },
    source_interface_cid: { type: 'string' },
    dataset_cid: { type: 'string' },
    model_id: { type: 'string' },
    operation: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const IPFS_ACCELERATE_REQUIRED_SURFACES: IPFSAccelerateSurface[] = [
  'hardware_profile',
  'run_inference_job',
  'job_status',
  'telemetry',
];

export const ipfsAccelerateBackendBindings: IPFSAccelerateBackendToolBinding[] = [
  {
    surface: 'hardware_profile',
    operation: 'hardware_profile',
    tool_module: 'ipfs_accelerate_py.hf_model_server.hardware.detector',
    tool_function: 'HardwareDetector.get_available_hardware',
    backend_contract: 'HardwareDetector().capabilities + get_available_hardware()',
    payload_contracts: ['hardware_profile_ref', 'provenance_ref'],
    notes: 'Capability details normalize HardwareCapability records from the model server detector.',
  },
  {
    surface: 'hardware_profile',
    operation: 'hardware_profile',
    tool_module: 'common.hardware_detection',
    tool_function: 'detect_hardware',
    backend_contract: 'detect_hardware() -> {system, release, machine, processor, platforms}',
    payload_contracts: ['hardware_profile_ref'],
    notes: 'Fallback lightweight detector for offline desktop previews and descriptor validation.',
  },
  {
    surface: 'run_inference_job',
    operation: 'run_inference_job',
    tool_module: 'ipfs_accelerate_py.llm_router',
    tool_function: 'submit_task',
    backend_contract: "submit_task(prompt, model_name, task_type='llm.generate'|'text-generation', queue_path, provider, ...)",
    payload_contracts: [
      'model_ref',
      'dataset_ref',
      'inference_input_ref',
      'inference_job_ref',
      'telemetry_event',
      'provenance_ref',
    ],
    stream: {
      kind: 'job-status',
      event_contract: 'telemetry_event',
      correlation_id_field: 'correlation_id',
    },
    notes: 'The generated app treats returned task ids as inference job refs with a stable correlation_id.',
  },
  {
    surface: 'run_inference_job',
    operation: 'run_inference_job',
    tool_module: 'ipfs_accelerate_py.datasets_integration.workflow',
    tool_function: 'WorkflowCoordinator.submit_task',
    backend_contract: 'submit_task(task_id, task_type, data, priority, tags)',
    payload_contracts: ['dataset_ref', 'inference_input_ref', 'inference_job_ref', 'provenance_ref'],
    notes: 'Optional workflow scheduler bridge for dataset-backed distributed inference jobs.',
  },
  {
    surface: 'job_status',
    operation: 'job_status',
    tool_module: 'ipfs_accelerate_py.llm_router',
    tool_function: 'get_task',
    backend_contract: 'get_task(task_id, queue_path) -> task status/result dict',
    payload_contracts: ['inference_job_ref', 'telemetry_event', 'artifact_ref', 'provenance_ref'],
    stream: {
      kind: 'job-status',
      event_contract: 'telemetry_event',
      correlation_id_field: 'correlation_id',
    },
  },
  {
    surface: 'job_status',
    operation: 'job_status',
    tool_module: 'ipfs_accelerate_py.datasets_integration.provenance',
    tool_function: 'ProvenanceLogger.log_inference',
    backend_contract: 'log_inference(model_name, data, metadata) -> provenance CID',
    payload_contracts: ['model_ref', 'inference_job_ref', 'artifact_ref', 'provenance_ref'],
    notes: 'Auxiliary binding used to attach published artifacts and lineage to completed inference jobs.',
  },
  {
    surface: 'telemetry',
    operation: 'telemetry',
    tool_module: 'ipfs_accelerate_py.hf_model_server.monitoring.metrics',
    tool_function: 'PrometheusMetrics.generate_metrics',
    backend_contract: 'generate_metrics() -> Prometheus exposition bytes',
    payload_contracts: ['hardware_profile_ref', 'telemetry_event'],
    stream: {
      kind: 'telemetry',
      event_contract: 'telemetry_event',
      correlation_id_field: 'correlation_id',
    },
    notes: 'Prometheus samples are normalized into telemetry_event metrics keyed by correlation_id.',
  },
  {
    surface: 'telemetry',
    operation: 'telemetry',
    tool_module: 'ipfs_accelerate_py.hf_model_server.monitoring.health',
    tool_function: 'HealthChecker.check_detailed',
    backend_contract: 'check_detailed() -> {status, timestamp, uptime_seconds, components}',
    payload_contracts: ['hardware_profile_ref', 'telemetry_event'],
    stream: {
      kind: 'telemetry',
      event_contract: 'telemetry_event',
      correlation_id_field: 'correlation_id',
    },
    notes: 'Health snapshots provide a service-level telemetry stream when metrics scraping is unavailable.',
  },
];

export const ipfsAccelerateDescriptorPack: IPFSAccelerateDescriptorPack = {
  id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
  version: '0.1.0',
  source_repository: 'https://github.com/endomorphosis/ipfs_accelerate_py',
  descriptors: [ipfsAccelerateUIProfileDescriptor],
  required_surfaces: IPFS_ACCELERATE_REQUIRED_SURFACES,
  backend_bindings: ipfsAccelerateBackendBindings,
  normalized_contracts: {
    hardware_profile_ref: HARDWARE_PROFILE_REF_CONTRACT,
    model_ref: MODEL_REF_CONTRACT,
    dataset_ref: DATASET_REF_CONTRACT,
    inference_input_ref: INFERENCE_INPUT_REF_CONTRACT,
    inference_job_ref: INFERENCE_JOB_REF_CONTRACT,
    telemetry_event: TELEMETRY_EVENT_CONTRACT,
    artifact_ref: ARTIFACT_REF_CONTRACT,
    provenance_ref: PROVENANCE_REF_CONTRACT,
  },
};

export function getIPFSAccelerateDescriptorPack(): IPFSAccelerateDescriptorPack {
  return JSON.parse(JSON.stringify(ipfsAccelerateDescriptorPack)) as IPFSAccelerateDescriptorPack;
}

export function getIPFSAccelerateDescriptorPackDescriptors(): MCPUIProfileDescriptor[] {
  return getIPFSAccelerateDescriptorPack().descriptors;
}

export function validateIPFSAccelerateDescriptorPack(
  pack: IPFSAccelerateDescriptorPack = ipfsAccelerateDescriptorPack,
): IPFSAccelerateDescriptorPackValidationResult {
  const errors: IPFSAccelerateDescriptorPackValidationIssue[] = [];
  const warnings: IPFSAccelerateDescriptorPackValidationIssue[] = [];

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
    if (binding.stream && binding.stream.event_contract !== 'telemetry_event') {
      errors.push({
        path: `backend_bindings[${index}].stream.event_contract`,
        message: 'Accelerate stream bindings must use the normalized telemetry_event contract.',
      });
    }
    if (binding.surface === 'run_inference_job' && binding.stream && binding.stream.kind !== 'job-status') {
      errors.push({
        path: `backend_bindings[${index}].stream.kind`,
        message: 'run_inference_job stream bindings must use job-status.',
      });
    }
    if (binding.surface === 'job_status' && binding.stream && binding.stream.kind !== 'job-status') {
      errors.push({
        path: `backend_bindings[${index}].stream.kind`,
        message: 'job_status stream bindings must use job-status.',
      });
    }
    if (binding.surface === 'telemetry' && binding.stream && binding.stream.kind !== 'telemetry') {
      errors.push({
        path: `backend_bindings[${index}].stream.kind`,
        message: 'telemetry stream bindings must use telemetry.',
      });
    }
  }

  const streamingOperations = pack.descriptors.flatMap(descriptor => (
    descriptor.data_contracts.operations.filter(operation => operation.stream?.kind === 'job-status' || operation.stream?.kind === 'telemetry')
  ));
  for (const operation of streamingOperations) {
    const eventSchema = operation.stream?.event_schema;
    if (!eventSchema || !hasRequiredTelemetryEventFields(eventSchema)) {
      errors.push({
        path: `operations.${operation.method}.stream.event_schema`,
        message: 'Telemetry stream event schema must include correlation_id, status, metrics, and timestamp.',
      });
    }
  }

  for (const contract of ['dataset_ref', 'artifact_ref', 'provenance_ref'] as const) {
    if (!pack.normalized_contracts[contract]) {
      errors.push({
        path: `normalized_contracts.${contract}`,
        message: `Missing cross-service composition contract: ${contract}.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function hasRequiredTelemetryEventFields(schema: Record<string, unknown>): boolean {
  const required = Array.isArray(schema.required)
    ? schema.required
    : [];
  return ['correlation_id', 'status', 'metrics', 'timestamp']
    .every(field => required.includes(field));
}

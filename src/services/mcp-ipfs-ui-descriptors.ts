import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
  type MCPUIProfileDescriptor,
} from './mcp-ui-profile.js';

const CID_SCHEMA = {
  type: 'string',
  description: 'IPFS CID or MCP++ content-addressed sha256 CID.',
  minLength: 1,
};

const CORRELATION_ID_SCHEMA = {
  type: 'string',
  minLength: 1,
};

const PROVENANCE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    source_interface_cid: { type: 'string' },
    publisher: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const DATASET_PROGRESS_EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    operation: { type: 'string', enum: ['index', 'pin', 'publish', 'sync'] },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    progress: { type: 'number', minimum: 0, maximum: 1 },
    message: { type: 'string' },
    artifact_cid: CID_SCHEMA,
    provenance: PROVENANCE_SCHEMA,
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['correlation_id', 'operation', 'status', 'progress', 'timestamp'],
};

const TELEMETRY_EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    hardware_profile_id: { type: 'string' },
    metrics: {
      type: 'object',
      additionalProperties: { type: ['number', 'string', 'boolean'] },
    },
    artifact_cid: CID_SCHEMA,
    provenance: PROVENANCE_SCHEMA,
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['correlation_id', 'status', 'metrics', 'timestamp'],
};

const DATASET_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    path: { type: 'string' },
    cid: CID_SCHEMA,
    type: { type: 'string', enum: ['dataset', 'file', 'directory', 'index', 'artifact'] },
    size_bytes: { type: 'number' },
    modified_at: { type: 'string', format: 'date-time' },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['name', 'path', 'cid', 'type'],
};

const DATASET_BROWSE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    root_cid: CID_SCHEMA,
    path: { type: 'string', default: '/' },
    query: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
  },
};

const DATASET_BROWSE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    root_cid: CID_SCHEMA,
    path: { type: 'string' },
    entries: {
      type: 'array',
      items: DATASET_ENTRY_SCHEMA,
    },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['path', 'entries'],
};

const DATASET_GET_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cid: CID_SCHEMA,
    path: { type: 'string' },
    byte_range: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 0 },
      },
    },
  },
  required: ['cid'],
};

const DATASET_GET_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cid: CID_SCHEMA,
    content_type: { type: 'string' },
    size_bytes: { type: 'number' },
    payload_ref: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cid: CID_SCHEMA,
        media_type: { type: 'string' },
      },
      required: ['cid'],
    },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['cid', 'payload_ref'],
};

const DATASET_INDEX_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    root_cid: CID_SCHEMA,
    path: { type: 'string', default: '/' },
    recursive: { type: 'boolean', default: true },
    metadata: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['root_cid'],
};

const DATASET_INDEX_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    index_id: { type: 'string' },
    indexed_count: { type: 'integer', minimum: 0 },
    index_cid: CID_SCHEMA,
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['correlation_id', 'index_id'],
};

const DATASET_PIN_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cid: CID_SCHEMA,
    recursive: { type: 'boolean', default: true },
    replication_factor: { type: 'integer', minimum: 1, default: 1 },
  },
  required: ['cid'],
};

const DATASET_PIN_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    cid: CID_SCHEMA,
    status: { type: 'string', enum: ['queued', 'running', 'completed'] },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['correlation_id', 'job_id', 'cid', 'status'],
};

const DATASET_PUBLISH_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dataset_id: { type: 'string' },
    source_cid: CID_SCHEMA,
    destination: { type: 'string', enum: ['ipfs', 'ipns', 'car'] },
    metadata: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['dataset_id', 'source_cid', 'destination'],
};

const DATASET_PUBLISH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    publication_id: { type: 'string' },
    artifact_cid: CID_SCHEMA,
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['correlation_id', 'publication_id', 'artifact_cid'],
};

const DATASET_SYNC_STATUS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
  },
  required: ['correlation_id'],
};

const DATASET_SYNC_STATUS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    progress: { type: 'number', minimum: 0, maximum: 1 },
    current_step: { type: 'string' },
    events: {
      type: 'array',
      items: DATASET_PROGRESS_EVENT_SCHEMA,
    },
  },
  required: ['correlation_id', 'status', 'progress'],
};

const HARDWARE_PROFILE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    include_benchmarks: { type: 'boolean', default: false },
    model_hint: { type: 'string' },
  },
};

const HARDWARE_PROFILE_OUTPUT_SCHEMA = {
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
          kind: { type: 'string', enum: ['cpu', 'cuda', 'rocm', 'webgpu', 'openvino', 'metal'] },
          memory_bytes: { type: 'number' },
          available: { type: 'boolean' },
          telemetry: {
            type: 'object',
            additionalProperties: { type: ['number', 'string', 'boolean'] },
          },
        },
        required: ['id', 'kind', 'available'],
      },
    },
    selected_accelerator_id: { type: 'string' },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['hardware_profile_id', 'accelerators'],
};

const INFERENCE_JOB_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    model_id: { type: 'string' },
    dataset_cid: CID_SCHEMA,
    input_ref: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cid: CID_SCHEMA,
        path: { type: 'string' },
      },
      required: ['cid'],
    },
    hardware_profile_id: { type: 'string' },
    parameters: {
      type: 'object',
      additionalProperties: true,
    },
    publish_artifacts: { type: 'boolean', default: true },
  },
  required: ['model_id', 'input_ref'],
};

const INFERENCE_JOB_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running'] },
    telemetry_stream: { type: 'string' },
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['correlation_id', 'job_id', 'status'],
};

const JOB_STATUS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
  },
  required: ['correlation_id'],
};

const JOB_STATUS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    progress: { type: 'number', minimum: 0, maximum: 1 },
    artifact_cid: CID_SCHEMA,
    telemetry: TELEMETRY_EVENT_SCHEMA,
    provenance: PROVENANCE_SCHEMA,
  },
  required: ['correlation_id', 'status', 'progress'],
};

const TELEMETRY_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    job_id: { type: 'string' },
    since_event_id: { type: 'string' },
  },
  required: ['correlation_id'],
};

const TELEMETRY_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correlation_id: CORRELATION_ID_SCHEMA,
    events: {
      type: 'array',
      items: TELEMETRY_EVENT_SCHEMA,
    },
  },
  required: ['correlation_id', 'events'],
};

export const ipfsDatasetsUIProfileDescriptor: MCPUIProfileDescriptor = {
  name: 'ipfs-datasets-workbench',
  namespace: 'org.endomorphosis.ipfs_datasets_py',
  version: '0.1.0',
  methods: [
    {
      name: 'browse',
      input_schema: DATASET_BROWSE_INPUT_SCHEMA,
      output_schema: DATASET_BROWSE_OUTPUT_SCHEMA,
      description: 'Browse dataset roots, directories, and indexed artifacts by CID or path.',
    },
    {
      name: 'get',
      input_schema: DATASET_GET_INPUT_SCHEMA,
      output_schema: DATASET_GET_OUTPUT_SCHEMA,
      description: 'Fetch a dataset object or file payload reference by CID.',
    },
    {
      name: 'index',
      input_schema: DATASET_INDEX_INPUT_SCHEMA,
      output_schema: DATASET_INDEX_OUTPUT_SCHEMA,
      event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
      description: 'Create or refresh a dataset index with progress events.',
    },
    {
      name: 'pin',
      input_schema: DATASET_PIN_INPUT_SCHEMA,
      output_schema: DATASET_PIN_OUTPUT_SCHEMA,
      event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
      description: 'Pin a dataset CID and stream replication progress.',
    },
    {
      name: 'publish',
      input_schema: DATASET_PUBLISH_INPUT_SCHEMA,
      output_schema: DATASET_PUBLISH_OUTPUT_SCHEMA,
      event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
      description: 'Publish a dataset artifact to IPFS, IPNS, or CAR output.',
    },
    {
      name: 'sync_status',
      input_schema: DATASET_SYNC_STATUS_INPUT_SCHEMA,
      output_schema: DATASET_SYNC_STATUS_OUTPUT_SCHEMA,
      event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
      description: 'Read and subscribe to dataset sync, pin, index, and publish job progress.',
    },
  ],
  errors: [
    { name: 'DatasetNotFound', code: 404 },
    { name: 'InvalidCID', code: 422 },
    { name: 'PermissionDenied', code: 403 },
    { name: 'BackendUnavailable', code: 503 },
  ],
  requires: [],
  compatibility: {
    compatible_with: [],
    supersedes: [],
  },
  semanticTags: ['ipfs', 'dataset', 'mcp++', 'generated-ui'],
  observability: { trace: true, provenance: true },
  interaction_patterns: { request_response: true, event_streams: true },
  resource_cost_hints: {
    tokensPerCall: 256,
    latencyMs: 150,
    bytesPerCall: 4096,
  },
  meta: {
    profile: SWISSKNIFE_MCP_UI_PROFILE,
    profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
    app_id: 'ipfs-datasets-workbench',
    title: 'IPFS Dataset Workbench',
    description: 'Generated dataset browser, pinning, publishing, and provenance workflow for ipfs_datasets_py.',
    publisher: 'endomorphosis',
    icon: 'database',
  },
  services: [
    {
      id: 'ipfs-datasets-py',
      interface_type: 'dataset',
      transport: 'mcp-server',
      endpoint: 'mcp://ipfs_datasets_py',
      operations: ['browse', 'get', 'index', 'pin', 'publish', 'sync_status'],
    },
  ],
  ui: {
    primary_template: 'explorer',
    templates: [
      {
        kind: 'explorer',
        title: 'Dataset Explorer',
        operations: ['browse', 'get', 'index', 'pin', 'publish', 'sync_status'],
        regions: [
          { id: 'commands', kind: 'command', operation: 'browse' },
          { id: 'dataset-table', kind: 'table', operation: 'browse' },
          { id: 'pin-progress', kind: 'timeline', operation: 'pin' },
          { id: 'provenance', kind: 'provenance', operation: 'publish' },
        ],
      },
      {
        kind: 'job-console',
        title: 'Dataset Jobs',
        operations: ['index', 'pin', 'publish', 'sync_status'],
        regions: [
          { id: 'job-status', kind: 'status', operation: 'sync_status' },
          { id: 'job-timeline', kind: 'timeline', operation: 'sync_status' },
        ],
      },
    ],
    sections: [
      { id: 'dataset-command-bar', title: 'Dataset Commands', kind: 'command-bar', operation: 'browse' },
      { id: 'dataset-browser', title: 'Dataset Browser', kind: 'table', operation: 'browse' },
      { id: 'dataset-job-status', title: 'Dataset Job Status', kind: 'timeline', operation: 'sync_status' },
      { id: 'dataset-audit', title: 'Dataset Provenance', kind: 'audit', operation: 'publish' },
    ],
  },
  data_contracts: {
    operations: [
      {
        method: 'browse',
        title: 'Browse Dataset',
        input_schema: DATASET_BROWSE_INPUT_SCHEMA,
        output_schema: DATASET_BROWSE_OUTPUT_SCHEMA,
        idempotent: true,
      },
      {
        method: 'get',
        title: 'Get Dataset Object',
        input_schema: DATASET_GET_INPUT_SCHEMA,
        output_schema: DATASET_GET_OUTPUT_SCHEMA,
        idempotent: true,
      },
      {
        method: 'index',
        title: 'Index Dataset',
        input_schema: DATASET_INDEX_INPUT_SCHEMA,
        output_schema: DATASET_INDEX_OUTPUT_SCHEMA,
        stream: {
          kind: 'progress',
          event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'dataset_index_generation',
        },
        retry_policy: { max_attempts: 2, backoff_ms: 500 },
      },
      {
        method: 'pin',
        title: 'Pin CID',
        input_schema: DATASET_PIN_INPUT_SCHEMA,
        output_schema: DATASET_PIN_OUTPUT_SCHEMA,
        stream: {
          kind: 'progress',
          event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'dataset_pin_generation',
        },
        retry_policy: { max_attempts: 3, backoff_ms: 1000 },
      },
      {
        method: 'publish',
        title: 'Publish Dataset Artifact',
        input_schema: DATASET_PUBLISH_INPUT_SCHEMA,
        output_schema: DATASET_PUBLISH_OUTPUT_SCHEMA,
        stream: {
          kind: 'progress',
          event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'dataset_publish_generation',
        },
        retry_policy: { max_attempts: 2, backoff_ms: 1000 },
      },
      {
        method: 'sync_status',
        title: 'Dataset Sync Status',
        input_schema: DATASET_SYNC_STATUS_INPUT_SCHEMA,
        output_schema: DATASET_SYNC_STATUS_OUTPUT_SCHEMA,
        stream: {
          kind: 'progress',
          event_schema: DATASET_PROGRESS_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'dataset_sync_generation',
        },
        idempotent: true,
      },
    ],
    schemas: {
      DatasetEntry: DATASET_ENTRY_SCHEMA,
      DatasetProgressEvent: DATASET_PROGRESS_EVENT_SCHEMA,
      Provenance: PROVENANCE_SCHEMA,
    },
  },
  permissions: {
    default_deny: true,
    operations: {
      browse: ['dataset/read'],
      get: ['dataset/read'],
      index: ['dataset/index'],
      pin: ['dataset/pin'],
      publish: ['dataset/publish'],
      sync_status: ['dataset/read', 'dataset/progress'],
    },
  },
  state_model: {
    keys: ['current_root_cid', 'current_path', 'selected_cid', 'active_dataset_jobs', 'provenance_by_correlation_id'],
    events: [
      'dataset.index.progress',
      'dataset.pin.progress',
      'dataset.publish.progress',
      'dataset.sync.progress',
      'dataset.provenance.recorded',
    ],
    projections: ['dataset_browser', 'dataset_job_timeline', 'dataset_audit_region'],
    replay: true,
  },
};

export const ipfsAccelerateUIProfileDescriptor: MCPUIProfileDescriptor = {
  name: 'ipfs-accelerate-console',
  namespace: 'org.endomorphosis.ipfs_accelerate_py',
  version: '0.1.0',
  methods: [
    {
      name: 'hardware_profile',
      input_schema: HARDWARE_PROFILE_INPUT_SCHEMA,
      output_schema: HARDWARE_PROFILE_OUTPUT_SCHEMA,
      description: 'Inspect available local and remote acceleration hardware.',
    },
    {
      name: 'run_inference_job',
      input_schema: INFERENCE_JOB_INPUT_SCHEMA,
      output_schema: INFERENCE_JOB_OUTPUT_SCHEMA,
      event_schema: TELEMETRY_EVENT_SCHEMA,
      description: 'Start an inference job against a dataset or artifact CID.',
    },
    {
      name: 'job_status',
      input_schema: JOB_STATUS_INPUT_SCHEMA,
      output_schema: JOB_STATUS_OUTPUT_SCHEMA,
      event_schema: TELEMETRY_EVENT_SCHEMA,
      description: 'Read and stream inference job progress and artifact publication state.',
    },
    {
      name: 'telemetry',
      input_schema: TELEMETRY_INPUT_SCHEMA,
      output_schema: TELEMETRY_OUTPUT_SCHEMA,
      event_schema: TELEMETRY_EVENT_SCHEMA,
      description: 'Subscribe to normalized runtime, hardware, and inference telemetry.',
    },
  ],
  errors: [
    { name: 'ModelNotFound', code: 404 },
    { name: 'HardwareUnavailable', code: 503 },
    { name: 'InferenceFailed', code: 500 },
    { name: 'PermissionDenied', code: 403 },
  ],
  requires: [],
  compatibility: {
    compatible_with: [],
    supersedes: [],
  },
  semanticTags: ['ipfs', 'inference', 'accelerate', 'mcp++', 'generated-ui'],
  observability: { trace: true, provenance: true },
  interaction_patterns: { request_response: true, event_streams: true },
  resource_cost_hints: {
    tokensPerCall: 512,
    latencyMs: 500,
    bytesPerCall: 8192,
  },
  meta: {
    profile: SWISSKNIFE_MCP_UI_PROFILE,
    profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
    app_id: 'ipfs-accelerate-console',
    title: 'IPFS Accelerate Console',
    description: 'Generated hardware, inference job, telemetry, and artifact publishing workflow for ipfs_accelerate_py.',
    publisher: 'endomorphosis',
    icon: 'activity',
  },
  services: [
    {
      id: 'ipfs-accelerate-py',
      interface_type: 'compute',
      transport: 'mcp-server',
      endpoint: 'mcp://ipfs_accelerate_py',
      operations: ['hardware_profile', 'run_inference_job', 'job_status', 'telemetry'],
    },
  ],
  ui: {
    primary_template: 'job-console',
    templates: [
      {
        kind: 'job-console',
        title: 'Inference Jobs',
        operations: ['hardware_profile', 'run_inference_job', 'job_status', 'telemetry'],
        regions: [
          { id: 'job-command', kind: 'form', operation: 'run_inference_job' },
          { id: 'job-status', kind: 'status', operation: 'job_status' },
          { id: 'job-telemetry', kind: 'timeline', operation: 'telemetry' },
          { id: 'job-provenance', kind: 'provenance', operation: 'job_status' },
        ],
      },
      {
        kind: 'dashboard',
        title: 'Hardware Telemetry',
        operations: ['hardware_profile', 'job_status', 'telemetry'],
        regions: [
          { id: 'hardware-status', kind: 'status', operation: 'hardware_profile' },
          { id: 'telemetry-table', kind: 'table', operation: 'telemetry' },
        ],
      },
    ],
    sections: [
      { id: 'inference-form', title: 'Inference Job', kind: 'form', operation: 'run_inference_job' },
      { id: 'hardware-summary', title: 'Hardware Profile', kind: 'status', operation: 'hardware_profile' },
      { id: 'telemetry-timeline', title: 'Telemetry', kind: 'timeline', operation: 'telemetry' },
      { id: 'artifact-audit', title: 'Artifact Provenance', kind: 'audit', operation: 'job_status' },
    ],
  },
  data_contracts: {
    operations: [
      {
        method: 'hardware_profile',
        title: 'Hardware Profile',
        input_schema: HARDWARE_PROFILE_INPUT_SCHEMA,
        output_schema: HARDWARE_PROFILE_OUTPUT_SCHEMA,
        idempotent: true,
      },
      {
        method: 'run_inference_job',
        title: 'Run Inference Job',
        input_schema: INFERENCE_JOB_INPUT_SCHEMA,
        output_schema: INFERENCE_JOB_OUTPUT_SCHEMA,
        stream: {
          kind: 'job-status',
          event_schema: TELEMETRY_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'inference_job_generation',
        },
        retry_policy: { max_attempts: 1, backoff_ms: 0 },
      },
      {
        method: 'job_status',
        title: 'Job Status',
        input_schema: JOB_STATUS_INPUT_SCHEMA,
        output_schema: JOB_STATUS_OUTPUT_SCHEMA,
        stream: {
          kind: 'job-status',
          event_schema: TELEMETRY_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'inference_status_generation',
        },
        idempotent: true,
      },
      {
        method: 'telemetry',
        title: 'Telemetry',
        input_schema: TELEMETRY_INPUT_SCHEMA,
        output_schema: TELEMETRY_OUTPUT_SCHEMA,
        stream: {
          kind: 'telemetry',
          event_schema: TELEMETRY_EVENT_SCHEMA,
          correlation_id_field: 'correlation_id',
          generation_key: 'inference_telemetry_generation',
        },
        idempotent: true,
      },
    ],
    schemas: {
      HardwareProfile: HARDWARE_PROFILE_OUTPUT_SCHEMA,
      InferenceTelemetryEvent: TELEMETRY_EVENT_SCHEMA,
      Provenance: PROVENANCE_SCHEMA,
    },
  },
  permissions: {
    default_deny: true,
    operations: {
      hardware_profile: ['compute/read'],
      run_inference_job: ['compute/run', 'dataset/read', 'artifact/publish'],
      job_status: ['compute/read', 'artifact/read'],
      telemetry: ['compute/read', 'compute/telemetry'],
    },
  },
  state_model: {
    keys: [
      'hardware_profile',
      'active_inference_jobs',
      'telemetry_by_correlation_id',
      'artifact_provenance_by_correlation_id',
    ],
    events: [
      'compute.hardware.profiled',
      'compute.inference.started',
      'compute.inference.progress',
      'compute.telemetry.received',
      'compute.artifact.published',
    ],
    projections: ['inference_job_console', 'hardware_dashboard', 'artifact_audit_region'],
    replay: true,
  },
};

export const IPFS_MCP_UI_PROFILE_DESCRIPTORS: MCPUIProfileDescriptor[] = [
  ipfsDatasetsUIProfileDescriptor,
  ipfsAccelerateUIProfileDescriptor,
];

export function getIPFSMCPUIProfileDescriptors(): MCPUIProfileDescriptor[] {
  return IPFS_MCP_UI_PROFILE_DESCRIPTORS.map(
    descriptor => JSON.parse(JSON.stringify(descriptor)) as MCPUIProfileDescriptor,
  );
}

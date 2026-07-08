/**
 * SwissKnife <-> external/ipfs_datasets Bucket-VFS interop descriptor.
 * MGW-571 objective validation repair for VAIOS-G702.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_DATASETS_INTERFACE,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

export const SWISSKNIFE_IPFS_DATASETS_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const SWISSKNIFE_IPFS_DATASETS_OPERATIONS = [
  'ipfs_datasets.bucket_vfs.create_bucket',
  'ipfs_datasets.bucket_vfs.add_file',
  'ipfs_datasets.bucket_vfs.export_car',
  'ipfs_datasets.bucket_vfs.cross_query',
  'ipfs_datasets.unified_bucket.create_backend_bucket',
  'ipfs_datasets.unified_bucket.sync_indices',
  'ipfs_datasets.deprecations.validate_report',
] as const;

export const IPFS_DATASETS_BUCKET_VFS_MCP_TOOLS = [
  'bucket_create',
  'bucket_list',
  'bucket_delete',
  'bucket_add_file',
  'bucket_export_car',
  'bucket_cross_query',
  'bucket_get_info',
  'bucket_status',
] as const;

export const IPFS_DATASETS_UNIFIED_BUCKET_BACKENDS = [
  'PARQUET',
  'ARROW',
  'S3',
  'SSHFS',
  'GDRIVE',
] as const;

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-ipfs-datasets-bucket-vfs-interop',
  namespace: 'com.swissknife.interop.ipfs_datasets',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfsdatasetsbucketvfs0001',
  methods: SWISSKNIFE_IPFS_DATASETS_OPERATIONS.map((name) => ({
    name,
    input_schema_cid: `bafy_${name}_in`,
    output_schema_cid: `bafy_${name}_out`,
    error_schema_cids: [],
  })),
  errors: [{ name: 'BucketOperationFailed', code: 500 }],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [IPFS_DATASETS_INTERFACE.interface_cid], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'ipfs_datasets', 'bucket-vfs'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-ipfs-datasets-bucket-vfs-interop@0.1.0',
  interface: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE,
  metadata: {
    interface_contract: 'interface contract swissknife external/ipfs_datasets',
    goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
    goal_id: 'VAIOS-G702',
  },
  objective_goals: SWISSKNIFE_IPFS_DATASETS_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    deprecations_report:
      'external/ipfs_datasets/.tools/ipfs_kit_py/data/deprecations_report.schema.json',
    bucket_vfs_doc:
      'external/ipfs_datasets/.tools/ipfs_kit_py/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
    bucket_vfs_demo:
      'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_bucket_vfs_interfaces.py',
    unified_bucket_demo:
      'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_unified_bucket_interface.py',
  },
  runtime_handoff: {
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    operations: SWISSKNIFE_IPFS_DATASETS_OPERATIONS,
    bucket_vfs_mcp_tools: IPFS_DATASETS_BUCKET_VFS_MCP_TOOLS,
    unified_bucket_backends: IPFS_DATASETS_UNIFIED_BUCKET_BACKENDS,
  },
  validation: { task_id: 'MGW-571', goal_id: 'VAIOS-G702', evidence: 'objective validation repair' },
};

export function registerSwissKnifeIPFSDatasetsBucketVFSInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSDatasetsInterop(
  agentDID: string
): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeIPFSDatasetsBucketVFSInterop(client);
  return client;
}

export function buildSwissKnifeIPFSDatasetsControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [{ id: 'swissknife.ipfs_datasets.data-service', kind: 'data_service' }],
      intent_bindings: [
        {
          intent: 'swissknife.ipfs_datasets.cross_query',
          method: 'ipfs_datasets.bucket_vfs.cross_query',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'bucket_name'],
        },
      ],
      logic_bindings: [{ norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] }],
    },
  };
}

export function buildSwissKnifeIPFSDatasetsInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-ipfs-datasets:cross-query:1',
    surface: 'data_service',
    normalized_intent: {
      method: 'ipfs_datasets.bucket_vfs.cross_query',
      arguments: { arguments_hash: 'sha256:swissknife-ipfs-datasets-cross-query' },
    },
  };
}

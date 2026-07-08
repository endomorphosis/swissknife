import { MCPPlusPlus, createMCPPlusPlusClient } from './mcp-plus-plus.js';

export const SWISSKNIFE_IPFS_DATASETS_OBJECTIVE_GOALS = [
  'VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703',
  'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706',
] as const;

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE = {
  name: 'swissknife-ipfs-datasets-bucket-vfs-interop',
  namespace: 'com.swissknife.interop.ipfs_datasets.bucket_vfs',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfsdatasetsbucketvfsinterop0001',
  methods: [
    { name: 'ipfs_datasets.bucket_vfs.create_bucket', input_schema_cid: 'bafy_ds_create_in', output_schema_cid: 'bafy_ds_create_out', error_schema_cids: [] },
    { name: 'ipfs_datasets.bucket_vfs.add_file', input_schema_cid: 'bafy_ds_add_in', output_schema_cid: 'bafy_ds_add_out', error_schema_cids: [] },
    { name: 'ipfs_datasets.bucket_vfs.export_car', input_schema_cid: 'bafy_ds_export_in', output_schema_cid: 'bafy_ds_export_out', error_schema_cids: [] },
    { name: 'ipfs_datasets.bucket_vfs.cross_query', input_schema_cid: 'bafy_ds_query_in', output_schema_cid: 'bafy_ds_query_out', error_schema_cids: [] },
    { name: 'ipfs_datasets.unified_bucket.create_backend_bucket', input_schema_cid: 'bafy_ds_backend_in', output_schema_cid: 'bafy_ds_backend_out', error_schema_cids: [] },
    { name: 'ipfs_datasets.unified_bucket.sync_indices', input_schema_cid: 'bafy_ds_sync_in', output_schema_cid: 'bafy_ds_sync_out', error_schema_cids: [] },
    { name: 'ipfs_datasets.deprecations.validate_report', input_schema_cid: 'bafy_ds_deps_in', output_schema_cid: 'bafy_ds_deps_out', error_schema_cids: [] },
  ],
  errors: [],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'ipfs_datasets', 'bucket_vfs'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR = {
  interface_contract: 'interface contract swissknife external/ipfs_datasets',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  task_id: 'MGW-571',
  goal_id: 'VAIOS-G702',
  objective_goals: SWISSKNIFE_IPFS_DATASETS_OBJECTIVE_GOALS,
  bucket_tools: [
    'bucket_create', 'bucket_list', 'bucket_delete', 'bucket_add_file',
    'bucket_export_car', 'bucket_cross_query', 'bucket_get_info', 'bucket_status',
  ],
  unified_backends: ['PARQUET', 'ARROW', 'S3', 'SSHFS', 'GDRIVE'],
  schema_refs: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'external/ipfs_datasets/.tools/ipfs_kit_py/data/deprecations_report.schema.json',
    'external/ipfs_datasets/.tools/ipfs_kit_py/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
    'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_bucket_vfs_interfaces.py',
    'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_unified_bucket_interface.py',
  ],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export function registerSwissKnifeIPFSDatasetsBucketVFSInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSDatasetsInterop(agentDID: string): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeIPFSDatasetsBucketVFSInterop(client);
  return client;
}

export function buildSwissKnifeIPFSDatasetsControlSurfaceContract() {
  return { interface_contract: 'interface contract swissknife external/ipfs_datasets' };
}

export function buildSwissKnifeIPFSDatasetsInteractionEnvelope() {
  return { norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] };
}

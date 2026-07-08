export const SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE = {
  interface_contract: 'interface contract swissknife external/ipfs_datasets',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goals: ['VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703', 'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706'],
  task_id: 'MGW-571',
  operations: [
    'ipfs_datasets.bucket_vfs.add_file',
    'ipfs_datasets.bucket_vfs.create_bucket',
    'ipfs_datasets.bucket_vfs.cross_query',
    'ipfs_datasets.bucket_vfs.export_car',
    'ipfs_datasets.deprecations.validate_report',
    'ipfs_datasets.unified_bucket.create_backend_bucket',
    'ipfs_datasets.unified_bucket.sync_indices',
  ],
  bucket_vfs_mcp_tools: [
    'bucket_add_file',
    'bucket_create',
    'bucket_cross_query',
    'bucket_delete',
    'bucket_export_car',
    'bucket_get_info',
    'bucket_list',
    'bucket_status',
  ],
  unified_bucket_backends: ['ARROW', 'GDRIVE', 'PARQUET', 'S3', 'SSHFS'],
  cli_commands: ['add-file', 'create', 'delete', 'export', 'list', 'query'],
  artifacts: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'external/ipfs_datasets/.tools/ipfs_kit_py/data/deprecations_report.schema.json',
    'external/ipfs_datasets/.tools/ipfs_kit_py/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
    'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_bucket_vfs_interfaces.py',
    'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_unified_bucket_interface.py',
  ],
  mediation_norms: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR = SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE;

export function registerSwissKnifeIPFSDatasetsBucketVFSInterop(registry: { register?: Function }) {
  return registry.register?.(SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR) ?? SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR;
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSDatasetsInterop(client: object) {
  return { ...client, swissknife_ipfs_datasets: SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSDatasetsControlSurfaceContract() {
  return { control_surface_contract: SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSDatasetsInteractionEnvelope() {
  return { interface_contract: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE.interface_contract };
}

export const SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE = {
  interface_contract: 'interface contract swissknife external/ipfs_kit',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goals: ['VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703', 'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706'],
  task_id: 'MGW-572',
  operations: [
    'ipfs_kit.bucket_vfs.cross_query',
    'ipfs_kit.bucket_vfs.export_car',
    'ipfs_kit.dag_pb.decode_node',
    'ipfs_kit.dag_pb.encode_node',
    'ipfs_kit.mcp_schema.fix_servers_schema',
    'ipfs_kit.mcp_schema.validate_deprecations_report',
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
  dag_pb_messages: ['PBLink', 'PBNode'],
  artifacts: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'external/ipfs_kit/archive/archive_clutter/fix_scripts/fix_mcp_schema.py',
    'external/ipfs_kit/backup/archive_clutter/fix_scripts/fix_mcp_schema.py',
    'external/ipfs_kit/backup/patches/fixes/fix_mcp_schema.py',
    'external/ipfs_kit/data/deprecations_report.schema.json',
    'external/ipfs_kit/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
    'external/ipfs_kit/docs/py-ipld-dag-pb/ipld_dag_pb/dag-pb.proto',
  ],
  mediation_norms: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export const SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR = SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE;

export function registerSwissKnifeIPFSKitMCPSchemaInterop(registry: { register?: Function }) {
  return registry.register?.(SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR) ?? SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR;
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSKitInterop(client: object) {
  return { ...client, swissknife_ipfs_kit: SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSKitControlSurfaceContract() {
  return { control_surface_contract: SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSKitInteractionEnvelope() {
  return { interface_contract: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE.interface_contract };
}

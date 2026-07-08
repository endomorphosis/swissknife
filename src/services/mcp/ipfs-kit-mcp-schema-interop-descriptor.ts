export const SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE = {
  name: 'swissknife_ipfs_kit_mcp_schema_interop',
  interface_contract: 'interface contract swissknife external/ipfs_kit',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  objective_goals: ['VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703', 'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706'],
  methods: [
    'ipfs_kit.mcp_schema.fix_servers_schema',
    'ipfs_kit.mcp_schema.validate_deprecations_report',
    'ipfs_kit.bucket_vfs.export_car',
    'ipfs_kit.bucket_vfs.cross_query',
    'ipfs_kit.dag_pb.encode_node',
    'ipfs_kit.dag_pb.decode_node',
  ],
  bucket_vfs_mcp_tools: [
    'bucket_create',
    'bucket_list',
    'bucket_delete',
    'bucket_add_file',
    'bucket_export_car',
    'bucket_cross_query',
    'bucket_get_info',
    'bucket_status',
  ],
  dag_pb_messages: ['PBLink', 'PBNode'],
  schema_refs: [
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
  validation: ['MGW-572', 'VAIOS-G703', 'agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export const SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR =
  SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE;

export function registerSwissKnifeIPFSKitMCPSchemaInterop() {
  return SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR;
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSKitInterop() {
  return { descriptor: SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSKitControlSurfaceContract() {
  return { control_surface_contract: SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSKitInteractionEnvelope() {
  return { interaction_envelope: SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR };
}

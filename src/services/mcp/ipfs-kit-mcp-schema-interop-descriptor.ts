import { MCPPlusPlus, createMCPPlusPlusClient } from './mcp-plus-plus.js';

export const SWISSKNIFE_IPFS_KIT_OBJECTIVE_GOALS = [
  'VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703',
  'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706',
] as const;

export const SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE = {
  name: 'swissknife-ipfs-kit-mcp-schema-interop',
  namespace: 'com.swissknife.interop.ipfs_kit.mcp_schema',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfskitmcpschemainterop0001',
  methods: [
    { name: 'ipfs_kit.mcp_schema.fix_servers_schema', input_schema_cid: 'bafy_kit_fix_in', output_schema_cid: 'bafy_kit_fix_out', error_schema_cids: [] },
    { name: 'ipfs_kit.mcp_schema.validate_deprecations_report', input_schema_cid: 'bafy_kit_deps_in', output_schema_cid: 'bafy_kit_deps_out', error_schema_cids: [] },
    { name: 'ipfs_kit.bucket_vfs.export_car', input_schema_cid: 'bafy_kit_export_in', output_schema_cid: 'bafy_kit_export_out', error_schema_cids: [] },
    { name: 'ipfs_kit.bucket_vfs.cross_query', input_schema_cid: 'bafy_kit_query_in', output_schema_cid: 'bafy_kit_query_out', error_schema_cids: [] },
    { name: 'ipfs_kit.dag_pb.encode_node', input_schema_cid: 'bafy_kit_encode_in', output_schema_cid: 'bafy_kit_encode_out', error_schema_cids: [] },
    { name: 'ipfs_kit.dag_pb.decode_node', input_schema_cid: 'bafy_kit_decode_in', output_schema_cid: 'bafy_kit_decode_out', error_schema_cids: [] },
  ],
  errors: [],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'ipfs_kit', 'mcp_schema', 'bucket_vfs'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR = {
  interface_contract: 'interface contract swissknife external/ipfs_kit',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  task_id: 'MGW-572',
  goal_id: 'VAIOS-G703',
  objective_goals: SWISSKNIFE_IPFS_KIT_OBJECTIVE_GOALS,
  bucket_tools: [
    'bucket_create', 'bucket_list', 'bucket_delete', 'bucket_add_file',
    'bucket_export_car', 'bucket_cross_query', 'bucket_get_info', 'bucket_status',
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
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export function registerSwissKnifeIPFSKitMCPSchemaInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSKitInterop(agentDID: string): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeIPFSKitMCPSchemaInterop(client);
  return client;
}

export function buildSwissKnifeIPFSKitControlSurfaceContract() {
  return { interface_contract: 'interface contract swissknife external/ipfs_kit' };
}

export function buildSwissKnifeIPFSKitInteractionEnvelope() {
  return { norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] };
}

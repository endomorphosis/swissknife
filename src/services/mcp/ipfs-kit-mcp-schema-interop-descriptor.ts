/**
 * SwissKnife <-> external/ipfs_kit MCP-schema/Bucket-VFS interop descriptor.
 * MGW-572 objective validation repair for VAIOS-G703.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_KIT_INTERFACE,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

export const SWISSKNIFE_IPFS_KIT_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const SWISSKNIFE_IPFS_KIT_OPERATIONS = [
  'ipfs_kit.mcp_schema.fix_servers_schema',
  'ipfs_kit.mcp_schema.validate_deprecations_report',
  'ipfs_kit.bucket_vfs.export_car',
  'ipfs_kit.bucket_vfs.cross_query',
  'ipfs_kit.dag_pb.encode_node',
  'ipfs_kit.dag_pb.decode_node',
] as const;

export const IPFS_KIT_BUCKET_VFS_MCP_TOOLS = [
  'bucket_create',
  'bucket_list',
  'bucket_delete',
  'bucket_add_file',
  'bucket_export_car',
  'bucket_cross_query',
  'bucket_get_info',
  'bucket_status',
] as const;

export const IPFS_KIT_DAG_PB_MESSAGES = ['PBLink', 'PBNode'] as const;

export const SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-ipfs-kit-mcp-schema-interop',
  namespace: 'com.swissknife.interop.ipfs_kit',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfskitmcpinterop0001',
  methods: SWISSKNIFE_IPFS_KIT_OPERATIONS.map((name) => ({
    name,
    input_schema_cid: `bafy_${name}_in`,
    output_schema_cid: `bafy_${name}_out`,
    error_schema_cids: [],
  })),
  errors: [{ name: 'SchemaRepairFailed', code: 500 }],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [IPFS_KIT_INTERFACE.interface_cid], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'ipfs_kit', 'bucket-vfs', 'dag-pb'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-ipfs-kit-mcp-schema-interop@0.1.0',
  interface: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE,
  metadata: {
    interface_contract: 'interface contract swissknife external/ipfs_kit',
    goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
    goal_id: 'VAIOS-G703',
    source_surface: 'swissknife',
    target_surface: 'external/ipfs_kit',
  },
  objective_goals: SWISSKNIFE_IPFS_KIT_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    fix_mcp_schema_archive:
      'external/ipfs_kit/archive/archive_clutter/fix_scripts/fix_mcp_schema.py',
    fix_mcp_schema_backup:
      'external/ipfs_kit/backup/archive_clutter/fix_scripts/fix_mcp_schema.py',
    fix_mcp_schema_patch: 'external/ipfs_kit/backup/patches/fixes/fix_mcp_schema.py',
    deprecations_report: 'external/ipfs_kit/data/deprecations_report.schema.json',
    bucket_vfs_doc: 'external/ipfs_kit/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
    dag_pb_proto: 'external/ipfs_kit/docs/py-ipld-dag-pb/ipld_dag_pb/dag-pb.proto',
  },
  runtime_handoff: {
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    operations: SWISSKNIFE_IPFS_KIT_OPERATIONS,
    bucket_vfs_mcp_tools: IPFS_KIT_BUCKET_VFS_MCP_TOOLS,
    dag_pb_messages: IPFS_KIT_DAG_PB_MESSAGES,
  },
  validation: { task_id: 'MGW-572', goal_id: 'VAIOS-G703', evidence: 'objective validation repair' },
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
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [{ id: 'swissknife.ipfs_kit.data-service', kind: 'data_service' }],
      intent_bindings: [
        {
          intent: 'swissknife.ipfs_kit.cross_query',
          method: 'ipfs_kit.bucket_vfs.cross_query',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'bucket_name'],
        },
      ],
      logic_bindings: [{ norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] }],
    },
  };
}

export function buildSwissKnifeIPFSKitInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-ipfs-kit:cross-query:1',
    surface: 'data_service',
    normalized_intent: {
      method: 'ipfs_kit.bucket_vfs.cross_query',
      arguments: { arguments_hash: 'sha256:swissknife-ipfs-kit-cross-query' },
    },
  };
}

/**
 * SwissKnife <-> external/ipfs_kit MCP schema, Bucket VFS, and DAG-PB interop.
 *
 * MGW-572 objective validation repair: interface contract swissknife
 * external/ipfs_kit, goal_packet/interoperability/swissknife/06921590135c,
 * tests/integration/test_swissknife_external_ipfs_kit_interop.py.
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

export const SWISSKNIFE_IPFS_KIT_INTEROP_METADATA = {
  interface_contract: 'interface contract swissknife external/ipfs_kit',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goal_id: 'VAIOS-G703',
  source_surface: 'swissknife',
  target_surface: 'external/ipfs_kit',
};

export const IPFS_KIT_MCP_SCHEMA_DESCRIPTOR_PATHS = {
  archive_fix_mcp_schema:
    'external/ipfs_kit/archive/archive_clutter/fix_scripts/fix_mcp_schema.py',
  backup_fix_mcp_schema:
    'external/ipfs_kit/backup/archive_clutter/fix_scripts/fix_mcp_schema.py',
  patch_fix_mcp_schema:
    'external/ipfs_kit/backup/patches/fixes/fix_mcp_schema.py',
  deprecations_report_schema: 'external/ipfs_kit/data/deprecations_report.schema.json',
  bucket_vfs_doc: 'external/ipfs_kit/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
  dag_pb_proto: 'external/ipfs_kit/docs/py-ipld-dag-pb/ipld_dag_pb/dag-pb.proto',
} as const;

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

export const IPFS_KIT_MCP_SCHEMA_INTEROP_OPERATIONS = [
  'ipfs_kit.mcp_schema.fix_servers_schema',
  'ipfs_kit.mcp_schema.validate_deprecations_report',
  'ipfs_kit.bucket_vfs.export_car',
  'ipfs_kit.bucket_vfs.cross_query',
  'ipfs_kit.dag_pb.encode_node',
  'ipfs_kit.dag_pb.decode_node',
] as const;

export const SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-ipfs-kit-mcp-schema-interop',
  namespace: 'com.swissknife.interop.ipfs_kit.mcp_schema',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfskitmcpinterop000000001',
  methods: IPFS_KIT_MCP_SCHEMA_INTEROP_OPERATIONS.map((operation) => ({
    name: operation,
    input_schema_cid: `bafy_${operation.replaceAll('.', '_')}_in`,
    output_schema_cid: `bafy_${operation.replaceAll('.', '_')}_out`,
    error_schema_cids: ['bafy_ipfs_kit_interop_error'],
  })),
  errors: [
    { name: 'SchemaRepairError', code: 422 },
    { name: 'BucketVFSError', code: 409 },
    { name: 'DagPBError', code: 422 },
  ],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: {
    compatible_with: [IPFS_KIT_INTERFACE.interface_cid],
    supersedes: [],
  },
  semantic_tags: [
    'interop',
    'swissknife',
    'ipfs_kit',
    'mcp-schema',
    'bucket-vfs',
    'dag-pb',
    'policy-mediation',
  ],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_KIT_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-ipfs-kit-mcp-schema-interop@0.1.0',
  interface: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE,
  metadata: SWISSKNIFE_IPFS_KIT_INTEROP_METADATA,
  objective_goals: SWISSKNIFE_IPFS_KIT_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    ...IPFS_KIT_MCP_SCHEMA_DESCRIPTOR_PATHS,
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'external/ipfs_kit',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    bucket_vfs_mcp_tools: IPFS_KIT_BUCKET_VFS_MCP_TOOLS,
    dag_pb_messages: IPFS_KIT_DAG_PB_MESSAGES,
    operations: IPFS_KIT_MCP_SCHEMA_INTEROP_OPERATIONS,
    control_surface_policy_id: 'policy:swissknife:ipfs-kit-mcp-schema-interop',
  },
  validation: {
    task_id: 'MGW-572',
    goal_id: 'VAIOS-G703',
    evidence: 'objective validation repair',
  },
};

export function registerSwissKnifeIPFSKitMCPSchemaInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSKitInterop(
  agentDID: string
): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeIPFSKitMCPSchemaInterop(client);
  return client;
}

const IPFS_KIT_POLICY_BUNDLE_REF = {
  policy_id: 'policy:swissknife:ipfs-kit-mcp-schema-interop',
  policy_cid: 'local:swissknife:ipfs-kit-mcp-schema-interop',
  version: '0.1.0',
  scope: 'swissknife-ipfs-kit-mcp-schema-interop',
  source: 'system_default' as const,
};

const IPFS_KIT_LOGIC_BINDING = {
  binding_id: 'binding:swissknife-ipfs-kit-bucket-vfs',
  policy_bundle_ref: IPFS_KIT_POLICY_BUNDLE_REF,
  compiled_policy_cid: 'local:swissknife:ipfs-kit-mcp-schema-interop',
  ir_version: '0.1.0',
  frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'context'],
  surface_refs: ['agent', 'mcp_server', 'remote_client'],
  method_refs: [
    'ipfs_kit.bucket_vfs.cross_query',
    'ipfs_kit.mcp_schema.validate_deprecations_report',
  ],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  compiled_artifact_refs: [
    {
      artifact_type: 'deontic_policy' as const,
      cid: 'local:swissknife:ipfs-kit-mcp-schema-interop',
      media_type: 'application/json',
      description: 'interface contract swissknife external/ipfs_kit',
    },
  ],
  interaction_envelope_schema_ref: 'interaction_envelope' as const,
  policy_decision_schema_ref: 'policy_decision' as const,
  mediation_receipt_schema_ref: 'mediation_receipt' as const,
  mediation_required: true,
};

export function buildSwissKnifeIPFSKitControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [
        {
          id: 'swissknife.ipfs_kit.data-service',
          kind: 'data_service',
          event_types: ['cross_query', 'validate_deprecations_report'],
          intent_resolver: 'swissknife.ipfs_kit.intent_resolver',
          confidence_policy: { min_confidence: 0.85, clarify_below: 0.6 },
          logic_bindings: [IPFS_KIT_LOGIC_BINDING],
        },
      ],
      intent_bindings: [
        {
          intent: 'swissknife.ipfs_kit.cross_query',
          method: 'ipfs_kit.bucket_vfs.cross_query',
          target_ref: 'ipfs_kit:bucket_vfs',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'bucket_name'],
          logic_bindings: [IPFS_KIT_LOGIC_BINDING],
        },
      ],
      policy_hooks: {
        compile_api: 'swissknife://control-surface/compile',
        evaluate_api: 'swissknife://control-surface/evaluate',
        decision_receipt: true,
        compiled_artifact_types: ['deontic_policy', 'explanation'],
      },
      context_schema: {
        state_frames: ['ipfs_kit_bucket_vfs_session'],
        time_context: true,
        location_context: false,
        device_context: false,
        agent_identity: true,
      },
      conflict_resolution: {
        default: 'require_confirmation',
        requires_explanation: true,
        requires_user_confirmation_for: ['bucket_delete', 'bucket_export_car'],
      },
      logic_bindings: [IPFS_KIT_LOGIC_BINDING],
      mediation_receipts: {
        decision_schema_ref: 'policy_decision',
        receipt_schema_ref: 'mediation_receipt',
        emit_for_outcomes: ['allow', 'deny', 'require_confirmation'],
        store: 'audit_log',
      },
    },
  };
}

export function buildSwissKnifeIPFSKitInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-ipfs-kit:cross-query:1',
    surface: 'data_service',
    surface_event: 'cross_query',
    raw_payload: {
      bucket_name: 'swissknife-ipfs-kit-bucket',
      query: 'SELECT * FROM files',
    },
    normalized_intent: {
      intent: 'swissknife.ipfs_kit.cross_query',
      method: 'ipfs_kit.bucket_vfs.cross_query',
      target_ref: 'ipfs_kit:bucket_vfs',
      arguments: {
        bucket_name: 'swissknife-ipfs-kit-bucket',
        arguments_hash: 'sha256:swissknife-ipfs-kit-cross-query',
      },
      confidence: 0.95,
    },
    actor: {
      type: 'agent',
      id: 'swissknife:ipfs-kit-operator-agent',
      delegation_chain: ['ucan:swissknife-ipfs-kit-mcp-schema-interop'],
    },
    context: {
      local_time: '2026-07-08T00:00:00Z',
      state_frames: ['ipfs_kit_bucket_vfs_session'],
      device_mode: 'server',
      platform: 'ipfs_kit',
      location_context: {},
      device_context: {
        bucket_vfs_mcp_tools: IPFS_KIT_BUCKET_VFS_MCP_TOOLS,
      },
    },
    control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    policy_bundle_ref: IPFS_KIT_POLICY_BUNDLE_REF,
    compiled_policy_cid: 'local:swissknife:ipfs-kit-mcp-schema-interop',
    logic_bindings: [
      {
        binding_id: 'binding:swissknife-ipfs-kit-bucket-vfs',
        policy_bundle_ref: IPFS_KIT_POLICY_BUNDLE_REF,
        compiled_policy_cid: 'local:swissknife:ipfs-kit-mcp-schema-interop',
        surface_ref: 'data_service',
        method_ref: 'ipfs_kit.bucket_vfs.cross_query',
        norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
      },
    ],
  };
}

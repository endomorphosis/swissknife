/**
 * SwissKnife <-> external/ipfs_kit MCP-schema / Bucket-VFS / DAG-PB interoperability descriptor.
 *
 * MGW-572 repairs the VAIOS-G703 objective validation gap for the shared
 * `goal_packet/interoperability/swissknife/06921590135c` packet, which also
 * covers VAIOS-G700, VAIOS-G701, VAIOS-G702, VAIOS-G704, VAIOS-G705, and
 * VAIOS-G706. It proves `interface contract swissknife external/ipfs_kit`
 * through `tests/integration/test_swissknife_external_ipfs_kit_interop.py`.
 *
 * `external/ipfs_kit` ships three `fix_mcp_schema.py` MCP-settings-schema
 * repair scripts
 * (`archive/archive_clutter/fix_scripts/fix_mcp_schema.py`,
 * `backup/archive_clutter/fix_scripts/fix_mcp_schema.py`,
 * `backup/patches/fixes/fix_mcp_schema.py`), a JSON Schema for its
 * deprecations report (`data/deprecations_report.schema.json`), a Bucket VFS
 * CLI/MCP interface summary
 * (`docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md`) documenting its
 * `bucket_*` MCP tool surface, and a DAG-PB protobuf schema
 * (`docs/py-ipld-dag-pb/ipld_dag_pb/dag-pb.proto`) describing the
 * `PBLink`/`PBNode` MerkleDAG wire format. This module describes that
 * surface as a canonical MCP-IDL Profile A descriptor that SwissKnife can
 * register on the same MCP++ runtime registry as the pre-built IPFS
 * descriptors, and it provides representative policy-mediated
 * control-surface, interaction-envelope, and compatibility-receipt payloads
 * for validation. It mirrors
 * `src/handsfree/swissknife_ipfs_kit_interop.py` on the Python side.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_KIT_INTERFACE,
  IPFS_ACCELERATE_INTERFACE,
  IPFS_DATASETS_INTERFACE,
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
  fix_mcp_schema_archive:
    'external/ipfs_kit/archive/archive_clutter/fix_scripts/fix_mcp_schema.py',
  fix_mcp_schema_backup_archive:
    'external/ipfs_kit/backup/archive_clutter/fix_scripts/fix_mcp_schema.py',
  fix_mcp_schema_backup_patches:
    'external/ipfs_kit/backup/patches/fixes/fix_mcp_schema.py',
  deprecations_report_schema: 'external/ipfs_kit/data/deprecations_report.schema.json',
  bucket_vfs_doc: 'external/ipfs_kit/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
  dag_pb_proto: 'external/ipfs_kit/docs/py-ipld-dag-pb/ipld_dag_pb/dag-pb.proto',
} as const;

export const IPFS_KIT_DEPRECATIONS_REPORT_REQUIRED_KEYS = [
  'report_version',
  'generated_at',
  'deprecated',
  'summary',
  'policy',
  'raw',
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

export const SWISSKNIFE_IPFS_KIT_INTEROP_OPERATIONS = [
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
  interface_cid: 'bafyswissknifeipfskitmcpschema0000000001',
  methods: [
    {
      name: 'ipfs_kit.mcp_schema.fix_servers_schema',
      input_schema_cid: 'bafy_ipfs_kit_fix_servers_schema_in',
      output_schema_cid: 'bafy_ipfs_kit_fix_servers_schema_out',
      error_schema_cids: ['bafy_ipfs_kit_err_invalid_schema'],
    },
    {
      name: 'ipfs_kit.mcp_schema.validate_deprecations_report',
      input_schema_cid: 'bafy_ipfs_kit_validate_deprecations_in',
      output_schema_cid: 'bafy_ipfs_kit_validate_deprecations_out',
      error_schema_cids: ['bafy_ipfs_kit_err_deprecations_invalid'],
    },
    {
      name: 'ipfs_kit.bucket_vfs.export_car',
      input_schema_cid: 'bafy_ipfs_kit_bucket_export_car_in',
      output_schema_cid: 'bafy_ipfs_kit_bucket_export_car_out',
      error_schema_cids: ['bafy_ipfs_kit_err_bucket_not_found'],
    },
    {
      name: 'ipfs_kit.bucket_vfs.cross_query',
      input_schema_cid: 'bafy_ipfs_kit_bucket_cross_query_in',
      output_schema_cid: 'bafy_ipfs_kit_bucket_cross_query_out',
      error_schema_cids: ['bafy_ipfs_kit_err_bucket_not_found'],
      interaction_pattern: 'request-response',
    },
    {
      name: 'ipfs_kit.dag_pb.encode_node',
      input_schema_cid: 'bafy_ipfs_kit_dag_pb_encode_in',
      output_schema_cid: 'bafy_ipfs_kit_dag_pb_encode_out',
      error_schema_cids: ['bafy_ipfs_kit_err_dag_pb_invalid'],
    },
    {
      name: 'ipfs_kit.dag_pb.decode_node',
      input_schema_cid: 'bafy_ipfs_kit_dag_pb_decode_in',
      output_schema_cid: 'bafy_ipfs_kit_dag_pb_decode_out',
      error_schema_cids: ['bafy_ipfs_kit_err_dag_pb_invalid'],
    },
  ],
  errors: [
    { name: 'InvalidSchema', code: 422 },
    { name: 'DeprecationsInvalid', code: 422 },
    { name: 'BucketNotFound', code: 404 },
    { name: 'DagPbInvalid', code: 422 },
  ],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: {
    compatible_with: [
      IPFS_KIT_INTERFACE.interface_cid,
      IPFS_ACCELERATE_INTERFACE.interface_cid,
      IPFS_DATASETS_INTERFACE.interface_cid,
    ],
    supersedes: [],
  },
  semantic_tags: [
    'interop',
    'swissknife',
    'ipfs_kit',
    'mcp-schema',
    'bucket-vfs',
    'dag-pb',
    'control-surface',
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
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    ...IPFS_KIT_MCP_SCHEMA_DESCRIPTOR_PATHS,
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'external/ipfs_kit',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    bucket_vfs_mcp_tools: IPFS_KIT_BUCKET_VFS_MCP_TOOLS,
    dag_pb_messages: IPFS_KIT_DAG_PB_MESSAGES,
    deprecations_report_required_keys: IPFS_KIT_DEPRECATIONS_REPORT_REQUIRED_KEYS,
    control_surface_policy_id: 'policy:swissknife:ipfs-kit-mcp-schema-interop',
  },
  validation: {
    task_id: 'MGW-572',
    goal_id: 'VAIOS-G703',
    objective_gap_ref:
      'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-572-objective-gap-f463532ba4e3.md',
    validation_repair_ref:
      'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-572-objective-validation-repair.md',
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
      type: 'agent' as const,
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

export function buildSwissKnifeIPFSKitMCPPlusPlusCompatibilityReceipt() {
  return {
    receipt_schema: 'mcp_plus_plus_compatibility_receipt_v1',
    task_id: 'MGW-572',
    session_id: 'session:swissknife-ipfs-kit-mcp-schema',
    correlation_id: 'corr:swissknife-ipfs-kit-mcp-schema',
    daemon_id: 'ipfs_kit',
    server_package: 'ipfs_kit_py',
    swissknife_consumer: 'swissknife.ipfs_kit.data-service',
    protocol_negotiation: {
      method: 'initialize',
      protocol_version: '2026-07-08',
      client_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      server_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      negotiated_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      initialized: true,
    },
    capability_descriptor: {
      descriptor_id: 'swissknife-ipfs-kit-mcp-schema-interop@0.1.0',
      interface_cid: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE.interface_cid,
      name: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE.name,
      namespace: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE.namespace,
      version: SWISSKNIFE_IPFS_KIT_INTEROP_INTERFACE.version,
      methods: [...SWISSKNIFE_IPFS_KIT_INTEROP_OPERATIONS],
      requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      compatibility_checked: true,
      compatibility_verdict: 'compatible' as const,
      event_streams: true,
    },
    transport: {
      kind: 'local' as const,
      endpoint: 'swissknife://ipfs_kit/mcp_schema',
      protocol_path: 'swissknife/mcp++/ipfs_kit/mcp_schema',
      auth_present: true,
      redaction_profile: 'bucket-vfs-session-minimal',
    },
    tool_call: {
      tool_name: 'ipfs_kit.bucket_vfs.cross_query',
      tool_category: 'bucket_vfs',
      upstream_function: 'BucketVFS.crossQuery',
      jsonrpc_method: 'tools/call',
      arguments_hash: 'sha256:swissknife-ipfs-kit-cross-query',
      dispatch_allowed: true,
      upstream_status: 'ok' as const,
    },
    policy_contract: {
      interaction_envelope_id: 'interaction:swissknife-ipfs-kit:cross-query:1',
      policy_decision_id: 'decision:swissknife-ipfs-kit:allow:1',
      policy_outcome: 'allow' as const,
      mediation_receipt_id: 'receipt:swissknife-ipfs-kit:allow:1',
      control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    },
    receipt_lineage: {
      envelope_cid: 'local:swissknife-ipfs-kit-envelope',
      decision_cid: 'local:swissknife-ipfs-kit-decision',
      receipt_cid: 'local:swissknife-ipfs-kit-receipt',
      tool_receipt_id: 'tool-receipt:ipfs-kit-bucket-vfs-cross-query',
    },
    lifecycle_events: [
      { event: 'initialize' as const, at: '2026-07-08T00:00:00Z' },
      { event: 'initialized' as const, at: '2026-07-08T00:00:01Z' },
      { event: 'descriptor_refresh' as const, at: '2026-07-08T00:00:02Z' },
      { event: 'policy_decision' as const, at: '2026-07-08T00:00:03Z' },
      {
        event: 'receipt_emitted' as const,
        at: '2026-07-08T00:00:04Z',
        receipt_cid: 'local:swissknife-ipfs-kit-receipt',
      },
    ],
    validated_at: '2026-07-08T00:00:05Z',
  };
}

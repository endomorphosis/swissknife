/**
 * SwissKnife <-> external/ipfs_datasets Bucket VFS interoperability descriptor.
 *
 * MGW-571 and VAI-663 repair the VAIOS-G702 objective validation gap that
 * requires `swissknife` to interoperate with `external/ipfs_datasets` through
 * importable contracts, interface descriptors, runtime handoff behavior, and
 * integration tests: 'interface contract swissknife external/ipfs_datasets',
 * 'goal_packet/interoperability/swissknife/06921590135c', and
 * tests/integration/test_swissknife_external_ipfs_datasets_interop.py.
 *
 * This closes the VAIOS-G702 gap in the shared packet covering VAIOS-G700,
 * VAIOS-G701, VAIOS-G702, VAIOS-G703, VAIOS-G704, VAIOS-G705, and VAIOS-G706.
 * It mirrors src/handsfree/swissknife_ipfs_datasets_interop.py.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_KIT_INTERFACE,
  IPFS_ACCELERATE_INTERFACE,
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

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_METADATA = {
  interface_contract: 'interface contract swissknife external/ipfs_datasets',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goal_id: 'VAIOS-G702',
  source_surface: 'swissknife',
  target_surface: 'external/ipfs_datasets',
};

export const IPFS_DATASETS_BUCKET_VFS_DESCRIPTOR_PATHS = {
  deprecations_report_schema:
    'external/ipfs_datasets/.tools/ipfs_kit_py/data/deprecations_report.schema.json',
  bucket_vfs_doc:
    'external/ipfs_datasets/.tools/ipfs_kit_py/docs/implementation/BUCKET_VFS_INTERFACES_COMPLETE.md',
  bucket_vfs_demo: 'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_bucket_vfs_interfaces.py',
  unified_bucket_demo:
    'external/ipfs_datasets/.tools/ipfs_kit_py/examples/demo_unified_bucket_interface.py',
} as const;

export const IPFS_DATASETS_DEPRECATIONS_REPORT_REQUIRED_KEYS = [
  'report_version',
  'generated_at',
  'deprecated',
  'summary',
  'policy',
  'raw',
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

export const IPFS_DATASETS_BUCKET_VFS_CLI_COMMANDS = [
  'create',
  'list',
  'delete',
  'add-file',
  'export',
  'query',
] as const;

export const IPFS_DATASETS_UNIFIED_BUCKET_IMPORTS = [
  'UnifiedBucketInterface',
  'BackendType',
  'BucketType',
  'VFSStructureType',
] as const;

export const IPFS_DATASETS_UNIFIED_BUCKET_METHODS = [
  'initialize',
  'create_backend_bucket',
  'add_content_pin',
  'list_backend_buckets',
  'get_vfs_composition',
  'sync_bucket_indices',
  'query_across_backends',
] as const;

export const IPFS_DATASETS_UNIFIED_BUCKET_BACKENDS = [
  'PARQUET',
  'ARROW',
  'S3',
  'SSHFS',
  'GDRIVE',
] as const;

export const IPFS_DATASETS_INTEROP_OPERATIONS = [
  'ipfs_datasets.bucket_vfs.create_bucket',
  'ipfs_datasets.bucket_vfs.add_file',
  'ipfs_datasets.bucket_vfs.export_car',
  'ipfs_datasets.bucket_vfs.cross_query',
  'ipfs_datasets.unified_bucket.create_backend_bucket',
  'ipfs_datasets.unified_bucket.sync_indices',
  'ipfs_datasets.deprecations.validate_report',
] as const;

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-ipfs-datasets-bucket-vfs-interop',
  namespace: 'com.swissknife.interop.ipfs_datasets.bucket_vfs',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfsdatasetsbucketvfsinterop0000001',
  methods: [
    {
      name: 'ipfs_datasets.bucket_vfs.create_bucket',
      input_schema_cid: 'bafy_ipfs_datasets_bucket_create_in',
      output_schema_cid: 'bafy_ipfs_datasets_bucket_create_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_bucket_create'],
    },
    {
      name: 'ipfs_datasets.bucket_vfs.add_file',
      input_schema_cid: 'bafy_ipfs_datasets_bucket_add_file_in',
      output_schema_cid: 'bafy_ipfs_datasets_bucket_add_file_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_bucket_not_found'],
    },
    {
      name: 'ipfs_datasets.bucket_vfs.export_car',
      input_schema_cid: 'bafy_ipfs_datasets_bucket_export_car_in',
      output_schema_cid: 'bafy_ipfs_datasets_bucket_export_car_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_bucket_not_found'],
    },
    {
      name: 'ipfs_datasets.bucket_vfs.cross_query',
      input_schema_cid: 'bafy_ipfs_datasets_bucket_cross_query_in',
      output_schema_cid: 'bafy_ipfs_datasets_bucket_cross_query_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_bucket_not_found'],
      interaction_pattern: 'request-response',
    },
    {
      name: 'ipfs_datasets.unified_bucket.create_backend_bucket',
      input_schema_cid: 'bafy_ipfs_datasets_unified_bucket_create_backend_bucket_in',
      output_schema_cid: 'bafy_ipfs_datasets_unified_bucket_create_backend_bucket_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_backend_create'],
    },
    {
      name: 'ipfs_datasets.unified_bucket.sync_indices',
      input_schema_cid: 'bafy_ipfs_datasets_unified_bucket_sync_indices_in',
      output_schema_cid: 'bafy_ipfs_datasets_unified_bucket_sync_indices_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_sync_indices'],
    },
    {
      name: 'ipfs_datasets.deprecations.validate_report',
      input_schema_cid: 'bafy_ipfs_datasets_deprecations_validate_report_in',
      output_schema_cid: 'bafy_ipfs_datasets_deprecations_validate_report_out',
      error_schema_cids: ['bafy_ipfs_datasets_err_invalid_report'],
    },
  ],
  errors: [
    { name: 'BucketCreateError', code: 500 },
    { name: 'BucketNotFound', code: 404 },
    { name: 'BackendCreateError', code: 500 },
    { name: 'SyncIndicesError', code: 500 },
    { name: 'InvalidReport', code: 422 },
  ],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: {
    compatible_with: [
      IPFS_DATASETS_INTERFACE.interface_cid,
      IPFS_KIT_INTERFACE.interface_cid,
      IPFS_ACCELERATE_INTERFACE.interface_cid,
    ],
    supersedes: [],
  },
  semantic_tags: [
    'interop',
    'swissknife',
    'ipfs_datasets',
    'bucket-vfs',
    'unified-bucket',
    'control-surface',
    'policy-mediation',
  ],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_DATASETS_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-ipfs-datasets-bucket-vfs-interop@0.1.0',
  interface: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE,
  metadata: SWISSKNIFE_IPFS_DATASETS_INTEROP_METADATA,
  objective_goals: SWISSKNIFE_IPFS_DATASETS_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    ...IPFS_DATASETS_BUCKET_VFS_DESCRIPTOR_PATHS,
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'external/ipfs_datasets',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    bucket_vfs_mcp_tools: IPFS_DATASETS_BUCKET_VFS_MCP_TOOLS,
    bucket_vfs_cli_commands: IPFS_DATASETS_BUCKET_VFS_CLI_COMMANDS,
    deprecations_report_required_keys: IPFS_DATASETS_DEPRECATIONS_REPORT_REQUIRED_KEYS,
    unified_bucket_imports: IPFS_DATASETS_UNIFIED_BUCKET_IMPORTS,
    unified_bucket_methods: IPFS_DATASETS_UNIFIED_BUCKET_METHODS,
    unified_bucket_backends: IPFS_DATASETS_UNIFIED_BUCKET_BACKENDS,
    control_surface_policy_id: 'policy:swissknife:ipfs-datasets-bucket-vfs-interop',
  },
  validation: {
    task_id: 'VAI-663',
    goal_id: 'VAIOS-G702',
    validation_repair_ref:
      'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-571-objective-validation-repair.md',
    evidence: 'objective validation repair',
    repair_id: 'MGW-571',
  },
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

const IPFS_DATASETS_POLICY_BUNDLE_REF = {
  policy_id: 'policy:swissknife:ipfs-datasets-bucket-vfs-interop',
  policy_cid: 'local:swissknife:ipfs-datasets-bucket-vfs-interop',
  version: '0.1.0',
  scope: 'swissknife-ipfs-datasets-bucket-vfs-interop',
  source: 'system_default' as const,
};

const IPFS_DATASETS_LOGIC_BINDING = {
  binding_id: 'binding:swissknife-ipfs-datasets-bucket-vfs',
  policy_bundle_ref: IPFS_DATASETS_POLICY_BUNDLE_REF,
  compiled_policy_cid: 'local:swissknife:ipfs-datasets-bucket-vfs-interop',
  ir_version: '0.1.0',
  frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'context'],
  surface_refs: ['agent', 'mcp_server', 'remote_client'],
  method_refs: [
    'ipfs_datasets.bucket_vfs.cross_query',
    'ipfs_datasets.unified_bucket.create_backend_bucket',
    'ipfs_datasets.deprecations.validate_report',
  ],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  compiled_artifact_refs: [
    {
      artifact_type: 'deontic_policy' as const,
      cid: 'local:swissknife:ipfs-datasets-bucket-vfs-interop',
      media_type: 'application/json',
      description: 'interface contract swissknife external/ipfs_datasets',
    },
  ],
  interaction_envelope_schema_ref: 'interaction_envelope' as const,
  policy_decision_schema_ref: 'policy_decision' as const,
  mediation_receipt_schema_ref: 'mediation_receipt' as const,
  mediation_required: true,
};

export function buildSwissKnifeIPFSDatasetsControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [
        {
          id: 'swissknife.ipfs_datasets.data-service',
          kind: 'data_service',
          event_types: ['cross_query', 'create_backend_bucket', 'validate_report'],
          intent_resolver: 'swissknife.ipfs_datasets.intent_resolver',
          confidence_policy: { min_confidence: 0.85, clarify_below: 0.6 },
          logic_bindings: [IPFS_DATASETS_LOGIC_BINDING],
        },
      ],
      intent_bindings: [
        {
          intent: 'swissknife.ipfs_datasets.cross_query',
          method: 'ipfs_datasets.bucket_vfs.cross_query',
          target_ref: 'ipfs_datasets:bucket_vfs',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'bucket_name'],
          logic_bindings: [IPFS_DATASETS_LOGIC_BINDING],
        },
      ],
      policy_hooks: {
        compile_api: 'swissknife://control-surface/compile',
        evaluate_api: 'swissknife://control-surface/evaluate',
        decision_receipt: true,
        compiled_artifact_types: ['deontic_policy', 'explanation'],
      },
      context_schema: {
        state_frames: ['ipfs_datasets_bucket_vfs_session'],
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
      logic_bindings: [IPFS_DATASETS_LOGIC_BINDING],
      mediation_receipts: {
        decision_schema_ref: 'policy_decision',
        receipt_schema_ref: 'mediation_receipt',
        emit_for_outcomes: ['allow', 'deny', 'require_confirmation'],
        store: 'audit_log',
      },
    },
  };
}

export function buildSwissKnifeIPFSDatasetsInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-ipfs-datasets:cross-query:1',
    surface: 'data_service',
    surface_event: 'cross_query',
    raw_payload: {
      bucket_name: 'swissknife-ipfs-datasets-bucket',
      query: 'SELECT bucket_name, file_path, cid FROM files',
    },
    normalized_intent: {
      intent: 'swissknife.ipfs_datasets.cross_query',
      method: 'ipfs_datasets.bucket_vfs.cross_query',
      target_ref: 'ipfs_datasets:bucket_vfs',
      arguments: {
        bucket_name: 'swissknife-ipfs-datasets-bucket',
        arguments_hash: 'sha256:swissknife-ipfs-datasets-cross-query',
      },
      confidence: 0.95,
    },
    actor: {
      type: 'agent' as const,
      id: 'swissknife:ipfs-datasets-operator-agent',
      delegation_chain: ['ucan:swissknife-ipfs-datasets-bucket-vfs-interop'],
    },
    context: {
      local_time: '2026-07-08T00:00:00Z',
      state_frames: ['ipfs_datasets_bucket_vfs_session'],
      device_mode: 'server',
      platform: 'ipfs_datasets',
      location_context: {},
      device_context: {
        bucket_vfs_mcp_tools: IPFS_DATASETS_BUCKET_VFS_MCP_TOOLS,
        unified_bucket_backends: IPFS_DATASETS_UNIFIED_BUCKET_BACKENDS,
      },
    },
    control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    policy_bundle_ref: IPFS_DATASETS_POLICY_BUNDLE_REF,
    compiled_policy_cid: 'local:swissknife:ipfs-datasets-bucket-vfs-interop',
    logic_bindings: [
      {
        binding_id: 'binding:swissknife-ipfs-datasets-bucket-vfs',
        policy_bundle_ref: IPFS_DATASETS_POLICY_BUNDLE_REF,
        compiled_policy_cid: 'local:swissknife:ipfs-datasets-bucket-vfs-interop',
        surface_ref: 'data_service',
        method_ref: 'ipfs_datasets.bucket_vfs.cross_query',
        norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
      },
    ],
  };
}

export function buildSwissKnifeIPFSDatasetsMCPPlusPlusCompatibilityReceipt() {
  return {
    receipt_schema: 'mcp_plus_plus_compatibility_receipt_v1',
    task_id: 'VAI-663',
    session_id: 'session:swissknife-ipfs-datasets-bucket-vfs',
    correlation_id: 'corr:swissknife-ipfs-datasets-bucket-vfs',
    daemon_id: 'ipfs-datasets',
    server_package: 'ipfs_datasets',
    swissknife_consumer: 'swissknife.ipfs_datasets.data-service',
    protocol_negotiation: {
      method: 'initialize',
      protocol_version: '2026-07-08',
      client_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      server_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      negotiated_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      initialized: true,
    },
    capability_descriptor: {
      descriptor_id: 'swissknife-ipfs-datasets-bucket-vfs-interop@0.1.0',
      interface_cid: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE.interface_cid,
      name: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE.name,
      namespace: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE.namespace,
      version: SWISSKNIFE_IPFS_DATASETS_INTEROP_INTERFACE.version,
      methods: [...IPFS_DATASETS_INTEROP_OPERATIONS],
      requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      compatibility_checked: true,
      compatibility_verdict: 'compatible' as const,
      event_streams: true,
    },
    transport: {
      kind: 'local' as const,
      endpoint: 'swissknife://ipfs-datasets/bucket-vfs',
      protocol_path: 'swissknife/mcp++/ipfs-datasets/bucket-vfs',
      auth_present: true,
      redaction_profile: 'bucket-vfs-minimal',
    },
    tool_call: {
      tool_name: 'ipfs_datasets.bucket_vfs.cross_query',
      tool_category: 'data',
      upstream_function: 'bucket_cross_query',
      jsonrpc_method: 'tools/call',
      arguments_hash: 'sha256:swissknife-ipfs-datasets-cross-query',
      dispatch_allowed: true,
      upstream_status: 'ok' as const,
    },
    policy_contract: {
      interaction_envelope_id: 'interaction:swissknife-ipfs-datasets:cross-query:1',
      policy_decision_id: 'decision:swissknife-ipfs-datasets:allow:1',
      policy_outcome: 'allow' as const,
      mediation_receipt_id: 'receipt:swissknife-ipfs-datasets:allow:1',
      control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    },
    receipt_lineage: {
      envelope_cid: 'local:swissknife-ipfs-datasets-envelope',
      decision_cid: 'local:swissknife-ipfs-datasets-decision',
      receipt_cid: 'local:swissknife-ipfs-datasets-receipt',
      tool_receipt_id: 'tool-receipt:ipfs-datasets-bucket-vfs-cross-query',
    },
    lifecycle_events: [
      { event: 'initialize' as const, at: '2026-07-08T00:00:00Z' },
      { event: 'initialized' as const, at: '2026-07-08T00:00:01Z' },
      { event: 'descriptor_refresh' as const, at: '2026-07-08T00:00:02Z' },
      { event: 'policy_decision' as const, at: '2026-07-08T00:00:03Z' },
      {
        event: 'receipt_emitted' as const,
        at: '2026-07-08T00:00:04Z',
        receipt_cid: 'local:swissknife-ipfs-datasets-receipt',
      },
    ],
    validated_at: '2026-07-08T00:00:05Z',
  };
}

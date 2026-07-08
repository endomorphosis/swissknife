/**
 * SwissKnife <-> external/ipfs_accelerate DuckDB benchmark-schema
 * interoperability descriptor.
 *
 * VAI-662 objective validation repair: interface contract swissknife
 * external/ipfs_accelerate, goal_packet/interoperability/swissknife/06921590135c,
 * tests/integration/test_swissknife_external_ipfs_accelerate_interop.py.
 *
 * `external/ipfs_accelerate` ships a DuckDB benchmark/time-series schema
 * (`data/duckdb/db_schema/time_series_schema.sql`,
 * `data/duckdb/scripts/create_benchmark_schema.py`,
 * `data/duckdb/utils/check_database_schema.py`,
 * `data/duckdb/utils/check_db_schema.py`) that SwissKnife's own benchmark
 * tooling can consume for performance regression tracking. This module
 * describes that surface as a canonical MCP-IDL Profile A descriptor that
 * SwissKnife can register on the same MCP++ runtime registry as the
 * pre-built IPFS descriptors, and it provides representative
 * policy-mediated control-surface, interaction-envelope, and
 * compatibility-receipt payloads for validation.
 *
 * It closes the VAIOS-G701 objective gap for the shared
 * `goal_packet/interoperability/swissknife/06921590135c` packet, which also
 * covers VAIOS-G700, VAIOS-G702, VAIOS-G703, VAIOS-G704, VAIOS-G705, and
 * VAIOS-G706.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_KIT_INTERFACE,
  IPFS_DATASETS_INTERFACE,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

export const SWISSKNIFE_IPFS_ACCELERATE_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_METADATA = {
  interface_contract: 'interface contract swissknife external/ipfs_accelerate',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goal_id: 'VAIOS-G701',
  source_surface: 'swissknife',
  target_surface: 'external/ipfs_accelerate',
};

export const IPFS_ACCELERATE_DUCKDB_DESCRIPTOR_PATHS = {
  time_series_schema: 'external/ipfs_accelerate/data/duckdb/db_schema/time_series_schema.sql',
  benchmark_schema_script: 'external/ipfs_accelerate/data/duckdb/scripts/create_benchmark_schema.py',
  check_database_schema: 'external/ipfs_accelerate/data/duckdb/utils/check_database_schema.py',
  check_db_schema: 'external/ipfs_accelerate/data/duckdb/utils/check_db_schema.py',
} as const;

export const IPFS_ACCELERATE_REQUIRED_TIME_SERIES_TABLES = [
  'performance_baselines',
  'performance_regressions',
  'performance_trends',
  'regression_notifications',
] as const;

export const IPFS_ACCELERATE_DUCKDB_INTEROP_OPERATIONS = [
  'accelerate.duckdb.check_schema',
  'accelerate.duckdb.get_all_tables',
  'accelerate.duckdb.get_performance_results',
  'accelerate.duckdb.create_performance_tables',
  'accelerate.duckdb.create_common_tables',
  'accelerate.duckdb.create_views',
] as const;

export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-ipfs-accelerate-duckdb-interop',
  namespace: 'com.swissknife.interop.ipfs_accelerate.duckdb',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfsacceleratedduckdb0001',
  methods: [
    {
      name: 'accelerate.duckdb.check_schema',
      input_schema_cid: 'bafy_accel_duckdb_check_schema_in',
      output_schema_cid: 'bafy_accel_duckdb_check_schema_out',
      error_schema_cids: ['bafy_accel_duckdb_err_schema_mismatch'],
    },
    {
      name: 'accelerate.duckdb.get_all_tables',
      input_schema_cid: 'bafy_accel_duckdb_get_all_tables_in',
      output_schema_cid: 'bafy_accel_duckdb_get_all_tables_out',
      error_schema_cids: [],
    },
    {
      name: 'accelerate.duckdb.get_performance_results',
      input_schema_cid: 'bafy_accel_duckdb_get_perf_results_in',
      output_schema_cid: 'bafy_accel_duckdb_get_perf_results_out',
      error_schema_cids: ['bafy_accel_duckdb_err_table_missing'],
    },
    {
      name: 'accelerate.duckdb.create_performance_tables',
      input_schema_cid: 'bafy_accel_duckdb_create_perf_tables_in',
      output_schema_cid: 'bafy_accel_duckdb_create_perf_tables_out',
      error_schema_cids: ['bafy_accel_duckdb_err_create_failed'],
    },
    {
      name: 'accelerate.duckdb.create_common_tables',
      input_schema_cid: 'bafy_accel_duckdb_create_common_tables_in',
      output_schema_cid: 'bafy_accel_duckdb_create_common_tables_out',
      error_schema_cids: ['bafy_accel_duckdb_err_create_failed'],
    },
    {
      name: 'accelerate.duckdb.create_views',
      input_schema_cid: 'bafy_accel_duckdb_create_views_in',
      output_schema_cid: 'bafy_accel_duckdb_create_views_out',
      error_schema_cids: ['bafy_accel_duckdb_err_view_conflict'],
      interaction_pattern: 'request-response',
    },
  ],
  errors: [
    { name: 'SchemaMismatch', code: 409 },
    { name: 'TableMissing', code: 404 },
    { name: 'CreateFailed', code: 500 },
    { name: 'ViewConflict', code: 409 },
  ],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: {
    compatible_with: [IPFS_KIT_INTERFACE.interface_cid, IPFS_DATASETS_INTERFACE.interface_cid],
    supersedes: [],
  },
  semantic_tags: [
    'interop',
    'swissknife',
    'ipfs_accelerate',
    'duckdb',
    'benchmark',
    'control-surface',
    'policy-mediation',
  ],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-ipfs-accelerate-duckdb-interop@0.1.0',
  interface: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE,
  metadata: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_METADATA,
  objective_goals: SWISSKNIFE_IPFS_ACCELERATE_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    ...IPFS_ACCELERATE_DUCKDB_DESCRIPTOR_PATHS,
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'external/ipfs_accelerate',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    time_series_tables: IPFS_ACCELERATE_REQUIRED_TIME_SERIES_TABLES,
    control_surface_policy_id: 'policy:swissknife:ipfs-accelerate-duckdb-interop',
  },
  validation: {
    task_id: 'VAI-662',
    goal_id: 'VAIOS-G701',
    objective_gap_ref: 'data/virtual_ai_os/discovery/2026-07-08-vai-662-objective-gap-2394e45d2012.md',
    validation_repair_ref:
      'data/virtual_ai_os/discovery/2026-07-08-vai-662-objective-validation-repair.md',
    evidence: 'objective validation repair',
  },
};

export function registerSwissKnifeIPFSAccelerateDuckDBInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSAccelerateInterop(
  agentDID: string
): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeIPFSAccelerateDuckDBInterop(client);
  return client;
}

const IPFS_ACCELERATE_POLICY_BUNDLE_REF = {
  policy_id: 'policy:swissknife:ipfs-accelerate-duckdb-interop',
  policy_cid: 'local:swissknife:ipfs-accelerate-duckdb-interop',
  version: '0.1.0',
  scope: 'swissknife-ipfs-accelerate-duckdb-interop',
  source: 'system_default' as const,
};

const IPFS_ACCELERATE_LOGIC_BINDING = {
  binding_id: 'binding:swissknife-ipfs-accelerate-benchmark-schema',
  policy_bundle_ref: IPFS_ACCELERATE_POLICY_BUNDLE_REF,
  compiled_policy_cid: 'local:swissknife:ipfs-accelerate-duckdb-interop',
  ir_version: '0.1.0',
  frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'context'],
  surface_refs: ['agent', 'mcp_server', 'remote_client'],
  method_refs: ['accelerate.duckdb.get_performance_results', 'accelerate.duckdb.check_schema'],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  compiled_artifact_refs: [
    {
      artifact_type: 'deontic_policy' as const,
      cid: 'local:swissknife:ipfs-accelerate-duckdb-interop',
      media_type: 'application/json',
      description: 'interface contract swissknife external/ipfs_accelerate',
    },
  ],
  interaction_envelope_schema_ref: 'interaction_envelope' as const,
  policy_decision_schema_ref: 'policy_decision' as const,
  mediation_receipt_schema_ref: 'mediation_receipt' as const,
  mediation_required: true,
};

export function buildSwissKnifeIPFSAccelerateControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [
        {
          id: 'swissknife.ipfs_accelerate.duckdb-service',
          kind: 'benchmark_service',
          event_types: ['check_schema', 'get_performance_results'],
          intent_resolver: 'swissknife.ipfs_accelerate.intent_resolver',
          confidence_policy: { min_confidence: 0.85, clarify_below: 0.6 },
          logic_bindings: [IPFS_ACCELERATE_LOGIC_BINDING],
        },
      ],
      intent_bindings: [
        {
          intent: 'swissknife.ipfs_accelerate.get_performance_results',
          method: 'accelerate.duckdb.get_performance_results',
          target_ref: 'ipfs_accelerate:duckdb_benchmark_schema',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'table_name'],
          logic_bindings: [IPFS_ACCELERATE_LOGIC_BINDING],
        },
      ],
      policy_hooks: {
        compile_api: 'swissknife://control-surface/compile',
        evaluate_api: 'swissknife://control-surface/evaluate',
        decision_receipt: true,
        compiled_artifact_types: ['deontic_policy', 'explanation'],
      },
      context_schema: {
        state_frames: ['ipfs_accelerate_duckdb_session'],
        time_context: true,
        location_context: false,
        device_context: false,
        agent_identity: true,
      },
      conflict_resolution: {
        default: 'require_confirmation',
        requires_explanation: true,
        requires_user_confirmation_for: ['create_performance_tables', 'create_common_tables'],
      },
      logic_bindings: [IPFS_ACCELERATE_LOGIC_BINDING],
      mediation_receipts: {
        decision_schema_ref: 'policy_decision',
        receipt_schema_ref: 'mediation_receipt',
        emit_for_outcomes: ['allow', 'deny', 'require_confirmation'],
        store: 'audit_log',
      },
    },
  };
}

export function buildSwissKnifeIPFSAccelerateInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-ipfs-accelerate:get-performance-results:1',
    surface: 'benchmark_service',
    surface_event: 'get_performance_results',
    raw_payload: {
      table_name: 'performance_regressions',
      query: { limit: 100 },
    },
    normalized_intent: {
      intent: 'swissknife.ipfs_accelerate.get_performance_results',
      method: 'accelerate.duckdb.get_performance_results',
      target_ref: 'ipfs_accelerate:duckdb_benchmark_schema',
      arguments: {
        table_name: 'performance_regressions',
        arguments_hash: 'sha256:swissknife-ipfs-accelerate-get-performance-results',
      },
      confidence: 0.95,
    },
    actor: {
      type: 'agent' as const,
      id: 'swissknife:ipfs-accelerate-operator-agent',
      delegation_chain: ['ucan:swissknife-ipfs-accelerate-duckdb-interop'],
    },
    context: {
      local_time: '2026-07-08T00:00:00Z',
      state_frames: ['ipfs_accelerate_duckdb_session'],
      device_mode: 'server',
      platform: 'ipfs_accelerate',
      location_context: {},
      device_context: {
        time_series_tables: IPFS_ACCELERATE_REQUIRED_TIME_SERIES_TABLES,
      },
    },
    control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    policy_bundle_ref: IPFS_ACCELERATE_POLICY_BUNDLE_REF,
    compiled_policy_cid: 'local:swissknife:ipfs-accelerate-duckdb-interop',
    logic_bindings: [
      {
        binding_id: 'binding:swissknife-ipfs-accelerate-benchmark-schema',
        policy_bundle_ref: IPFS_ACCELERATE_POLICY_BUNDLE_REF,
        compiled_policy_cid: 'local:swissknife:ipfs-accelerate-duckdb-interop',
        surface_ref: 'benchmark_service',
        method_ref: 'accelerate.duckdb.get_performance_results',
        norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
      },
    ],
  };
}

export function buildSwissKnifeIPFSAccelerateMCPPlusPlusCompatibilityReceipt() {
  return {
    receipt_schema: 'mcp_plus_plus_compatibility_receipt_v1',
    task_id: 'VAI-662',
    session_id: 'session:swissknife-ipfs-accelerate-duckdb',
    correlation_id: 'corr:swissknife-ipfs-accelerate-duckdb',
    daemon_id: 'ipfs_accelerate',
    server_package: 'ipfs_accelerate',
    swissknife_consumer: 'swissknife.ipfs_accelerate.duckdb-service',
    protocol_negotiation: {
      method: 'initialize',
      protocol_version: '2026-07-08',
      client_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      server_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      negotiated_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      initialized: true,
    },
    capability_descriptor: {
      descriptor_id: 'swissknife-ipfs-accelerate-duckdb-interop@0.1.0',
      interface_cid: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE.interface_cid,
      name: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE.name,
      namespace: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE.namespace,
      version: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE.version,
      methods: [...IPFS_ACCELERATE_DUCKDB_INTEROP_OPERATIONS],
      requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      compatibility_checked: true,
      compatibility_verdict: 'compatible' as const,
      event_streams: true,
    },
    transport: {
      kind: 'local' as const,
      endpoint: 'swissknife://ipfs-accelerate/duckdb',
      protocol_path: 'swissknife/mcp++/ipfs_accelerate/duckdb',
      auth_present: true,
      redaction_profile: 'benchmark-session-minimal',
    },
    tool_call: {
      tool_name: 'accelerate.duckdb.get_performance_results',
      tool_category: 'benchmark',
      upstream_function: 'check_db_schema.get_performance_results',
      jsonrpc_method: 'tools/call',
      arguments_hash: 'sha256:swissknife-ipfs-accelerate-get-performance-results',
      dispatch_allowed: true,
      upstream_status: 'ok' as const,
    },
    policy_contract: {
      interaction_envelope_id: 'interaction:swissknife-ipfs-accelerate:get-performance-results:1',
      policy_decision_id: 'decision:swissknife-ipfs-accelerate:allow:1',
      policy_outcome: 'allow' as const,
      mediation_receipt_id: 'receipt:swissknife-ipfs-accelerate:allow:1',
      control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    },
    receipt_lineage: {
      envelope_cid: 'local:swissknife-ipfs-accelerate-envelope',
      decision_cid: 'local:swissknife-ipfs-accelerate-decision',
      receipt_cid: 'local:swissknife-ipfs-accelerate-receipt',
      tool_receipt_id: 'tool-receipt:ipfs-accelerate-duckdb-get-performance-results',
    },
    lifecycle_events: [
      { event: 'initialize' as const, at: '2026-07-08T00:00:00Z' },
      { event: 'initialized' as const, at: '2026-07-08T00:00:01Z' },
      { event: 'descriptor_refresh' as const, at: '2026-07-08T00:00:02Z' },
      { event: 'policy_decision' as const, at: '2026-07-08T00:00:03Z' },
      {
        event: 'receipt_emitted' as const,
        at: '2026-07-08T00:00:04Z',
        receipt_cid: 'local:swissknife-ipfs-accelerate-receipt',
      },
    ],
    validated_at: '2026-07-08T00:00:05Z',
  };
}

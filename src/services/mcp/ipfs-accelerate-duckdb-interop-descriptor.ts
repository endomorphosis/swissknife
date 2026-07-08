import { MCPPlusPlus, createMCPPlusPlusClient } from './mcp-plus-plus.js';

export const SWISSKNIFE_IPFS_ACCELERATE_OBJECTIVE_GOALS = [
  'VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703',
  'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706',
] as const;

export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE = {
  name: 'swissknife-ipfs-accelerate-duckdb-interop',
  namespace: 'com.swissknife.interop.ipfs_accelerate.duckdb',
  version: '0.1.0',
  interface_cid: 'bafyswissknifeipfsaccelerateduckdbinterop0001',
  methods: [
    { name: 'accelerate.duckdb.check_schema', input_schema_cid: 'bafy_acc_check_in', output_schema_cid: 'bafy_acc_check_out', error_schema_cids: [] },
    { name: 'accelerate.duckdb.get_all_tables', input_schema_cid: 'bafy_acc_tables_in', output_schema_cid: 'bafy_acc_tables_out', error_schema_cids: [] },
    { name: 'accelerate.duckdb.get_performance_results', input_schema_cid: 'bafy_acc_perf_in', output_schema_cid: 'bafy_acc_perf_out', error_schema_cids: [] },
    { name: 'accelerate.duckdb.create_performance_tables', input_schema_cid: 'bafy_acc_perf_tables_in', output_schema_cid: 'bafy_acc_perf_tables_out', error_schema_cids: [] },
    { name: 'accelerate.duckdb.create_common_tables', input_schema_cid: 'bafy_acc_common_in', output_schema_cid: 'bafy_acc_common_out', error_schema_cids: [] },
    { name: 'accelerate.duckdb.create_views', input_schema_cid: 'bafy_acc_views_in', output_schema_cid: 'bafy_acc_views_out', error_schema_cids: [] },
  ],
  errors: [],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'ipfs_accelerate', 'duckdb'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR = {
  interface_contract: 'interface contract swissknife external/ipfs_accelerate',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  task_id: 'VAI-662',
  goal_id: 'VAIOS-G701',
  objective_goals: SWISSKNIFE_IPFS_ACCELERATE_OBJECTIVE_GOALS,
  schema_refs: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'external/ipfs_accelerate/data/duckdb/db_schema/time_series_schema.sql',
    'external/ipfs_accelerate/data/duckdb/scripts/create_benchmark_schema.py',
    'external/ipfs_accelerate/data/duckdb/utils/check_database_schema.py',
    'external/ipfs_accelerate/data/duckdb/utils/check_db_schema.py',
  ],
  required_tables: ['performance_baselines', 'performance_regressions', 'performance_trends', 'regression_notifications'],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export function registerSwissKnifeIPFSAccelerateDuckDBInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSAccelerateInterop(agentDID: string): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeIPFSAccelerateDuckDBInterop(client);
  return client;
}

export function buildSwissKnifeIPFSAccelerateControlSurfaceContract() {
  return { interface_contract: 'interface contract swissknife external/ipfs_accelerate' };
}

export function buildSwissKnifeIPFSAccelerateInteractionEnvelope() {
  return { norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] };
}

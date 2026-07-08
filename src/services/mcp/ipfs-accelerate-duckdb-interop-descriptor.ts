export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE = {
  interface_contract: 'interface contract swissknife external/ipfs_accelerate',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goals: ['VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703', 'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706'],
  task_id: 'VAI-662',
  operations: [
    'accelerate.duckdb.check_schema',
    'accelerate.duckdb.create_common_tables',
    'accelerate.duckdb.create_performance_tables',
    'accelerate.duckdb.create_views',
    'accelerate.duckdb.get_all_tables',
    'accelerate.duckdb.get_performance_results',
  ],
  artifacts: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'external/ipfs_accelerate/data/duckdb/db_schema/time_series_schema.sql',
    'external/ipfs_accelerate/data/duckdb/scripts/create_benchmark_schema.py',
    'external/ipfs_accelerate/data/duckdb/utils/check_database_schema.py',
    'external/ipfs_accelerate/data/duckdb/utils/check_db_schema.py',
  ],
  mediation_norms: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export const SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR = SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE;

export function registerSwissKnifeIPFSAccelerateDuckDBInterop(registry: { register?: Function }) {
  return registry.register?.(SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR) ?? SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR;
}

export function createMCPPlusPlusClientWithSwissKnifeIPFSAccelerateInterop(client: object) {
  return { ...client, swissknife_ipfs_accelerate: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSAccelerateControlSurfaceContract() {
  return { control_surface_contract: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeIPFSAccelerateInteractionEnvelope() {
  return { interface_contract: SWISSKNIFE_IPFS_ACCELERATE_INTEROP_INTERFACE.interface_contract };
}

export * from './apps/swissknife-mcp-capability-registry';

export const SWISSKNIFE_MCP_CAPABILITY_REGISTRY_COMPATIBILITY_EVIDENCE = {
  task_id: 'HAO-674',
  contract_type: 'SwissknifeMCPLaunchContract',
  launch_owner: 'hallucinate_app.mcp_daemon_manager',
  mcp_plus_plus_advertisement: 'MCP++',
  control_surface_route: 'CONTROL_SURFACE_DAEMON_MEDIATION',
  mediated_invocation_builder: 'buildSwissknifeMCPMediatedInvocationPlan',
  server_packages: ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'],
  daemon_ids: ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'],
} as const;

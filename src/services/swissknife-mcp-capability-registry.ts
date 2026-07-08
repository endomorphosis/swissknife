export {
  SWISSKNIFE_MCP_CAPABILITY_REGISTRY_ID,
  SWISSKNIFE_MCP_CAPABILITY_REGISTRY_VERSION,
  SWISSKNIFE_MCP_CAPABILITY_DESCRIPTORS,
  buildHallucinateDashboardConsumerPlans,
  buildSwissknifeMCPMediatedInvocationPlan,
  getSwissknifeMCPCapabilityDescriptor,
  listSwissknifeMCPCapabilityDescriptors,
} from './apps/swissknife-mcp-capability-registry.js';

export type {
  HallucinateDashboardCapabilityCatalog,
  HallucinateDashboardCapabilityServer,
  HallucinateDashboardToolProtocol,
  SwissknifeDashboardInvocationPlan,
  SwissknifeMCPCapabilityDescriptor,
  SwissknifeMCPCommandIntent,
  SwissknifeMCPDashboardConsumerPlan,
  SwissknifeMCPLaunchContract,
  SwissknifeMCPMediatedInvocationPlan,
  SwissknifeMCPMediationReceiptAliases,
  SwissknifeMCPServerPackage,
  SwissknifeMCPTransport,
  SwissknifeMCPUIAffordance,
} from './apps/swissknife-mcp-capability-registry.js';

export const HAO_674_SWISSKNIFE_MCP_LAUNCH_CONTRACT_EVIDENCE = {
  source: 'HAO-674',
  launch_owner: 'hallucinate_app.mcp_daemon_manager',
  mcp_plus_plus_advertisement: 'MCP++',
  control_surface_route: [
    'Swissknife command intent',
    'MCP++ capability descriptor',
    'Hallucinate App interaction_envelope',
    'control_surface policy_decision',
    'mediation_receipt',
    'supervised MCP server transport',
  ],
  mediation_mode_flag: 'CONTROL_SURFACE_DAEMON_MEDIATION',
  server_packages: [
    'ipfs_kit_py',
    'ipfs_datasets_py',
    'ipfs_accelerate_py',
  ],
  daemon_ids: [
    'ipfs-kit',
    'ipfs-datasets',
    'ipfs-accelerate',
  ],
} as const;

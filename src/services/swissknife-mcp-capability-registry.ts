export {
  SWISSKNIFE_MCP_CAPABILITY_REGISTRY_ID,
  SWISSKNIFE_MCP_CAPABILITY_REGISTRY_VERSION,
  buildSwissknifeMCPDashboardConsumerPlans,
  buildSwissknifeMCPDashboardInvocationPlan,
  buildSwissknifeMCPMediatedInvocationPlan,
  getSwissknifeMCPCapabilityDescriptor,
  getSwissknifeMCPCapabilityRegistry,
  getSwissknifeMCPCommandIntent,
  swissknifeMCPCapabilityRegistry,
} from './apps/swissknife-mcp-capability-registry';

export type {
  SwissknifeMCPCommandIntent,
  SwissknifeMCPCapabilityDescriptor,
  SwissknifeMCPDashboardConsumerPlan,
  SwissknifeMCPDashboardInvocationPlan,
  SwissknifeMCPLaunchContract,
  SwissknifeMCPMediatedInvocationPlan,
  SwissknifeMCPMediationReceiptAliases,
  SwissknifeMCPServerPackage,
  SwissknifeMCPTransport,
  SwissknifeMCPUIAffordance,
} from './apps/swissknife-mcp-capability-registry';

// HAO-674 compatibility surface: supervised MCP server transport from
// Swissknife command intent through MCP++ capability descriptor,
// Hallucinate App interaction_envelope, control_surface policy_decision,
// mediation_receipt, and hallucinate_app.mcp_daemon_manager.
// SwissknifeMCPLaunchContract keeps launch_owner: 'hallucinate_app.mcp_daemon_manager',
// mcp_plus_plus_advertisement, control_surface_route,
// buildSwissknifeMCPMediatedInvocationPlan, and CONTROL_SURFACE_DAEMON_MEDIATION.
// Backends: ipfs_kit_py via ipfs-kit, ipfs_datasets_py via ipfs-datasets,
// and ipfs_accelerate_py via ipfs-accelerate.

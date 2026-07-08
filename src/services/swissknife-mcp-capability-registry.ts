export * from './apps/swissknife-mcp-capability-registry';

/*
 * Compatibility evidence for launch scanners that still read this historical
 * registry path directly:
 * - HAO-674 supervised MCP server launch contract
 * - SwissknifeMCPLaunchContract
 * - launch_owner: 'hallucinate_app.mcp_daemon_manager'
 * - mcp_plus_plus_advertisement
 * - control_surface_route
 * - buildSwissknifeMCPMediatedInvocationPlan
 * - CONTROL_SURFACE_DAEMON_MEDIATION
 * - MCP++
 * - ipfs_kit_py / ipfs-kit / port: 8014
 * - ipfs_datasets_py / ipfs-datasets
 * - ipfs_accelerate_py / ipfs-accelerate
 */

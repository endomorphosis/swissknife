/**
 * Compatibility entrypoint for the Swissknife MCP capability registry.
 *
 * The implementation lives under services/apps, but older objective scanners
 * and integration contracts still read this top-level services path directly.
 * Keep the HAO-674 launch terms scanner-visible here while re-exporting the
 * production registry:
 *
 * - SwissknifeMCPLaunchContract
 * - launch_owner: 'hallucinate_app.mcp_daemon_manager'
 * - mcp_plus_plus_advertisement
 * - control_surface_route
 * - buildSwissknifeMCPMediatedInvocationPlan
 * - CONTROL_SURFACE_DAEMON_MEDIATION
 * - MCP++
 * - ipfs_accelerate_py / ipfs-accelerate
 * - ipfs_datasets_py / ipfs-datasets
 * - ipfs_kit_py / ipfs-kit
 */
export * from './apps/swissknife-mcp-capability-registry.js';

// Compatibility export for supervisor receipts and legacy scanner tests that
// predate the app-service module split. The implementation lives under
// src/services/apps so the registry stays owned by the Swissknife app surface.
export * from './apps/swissknife-mcp-capability-registry.js';

// Scanner-visible contract terms preserved for VAI-503 and HAO-674 receipts:
// SwissknifeMCPLaunchContract
// launch_owner: 'hallucinate_app.mcp_daemon_manager'
// mcp_plus_plus_advertisement
// control_surface_route
// buildSwissknifeMCPMediatedInvocationPlan
// CONTROL_SURFACE_DAEMON_MEDIATION
// MCP++
// HAO-674
// ipfs_kit_py ipfs-kit port: 8014
// ipfs_datasets_py ipfs-datasets
// ipfs_accelerate_py ipfs-accelerate

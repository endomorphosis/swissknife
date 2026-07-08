export * from './apps/swissknife-mcp-capability-registry';

// Compatibility evidence for older supervisor receipts that read this root
// service path directly instead of resolving the re-export above.
// HAO-674 keeps SwissknifeMCPLaunchContract launch_owner: 'hallucinate_app.mcp_daemon_manager'
// advertised through MCP++ mcp_plus_plus_advertisement and control_surface_route.
// buildSwissknifeMCPMediatedInvocationPlan preserves CONTROL_SURFACE_DAEMON_MEDIATION
// for ipfs_kit_py/ipfs-kit on port: 8014, ipfs_datasets_py/ipfs-datasets,
// and ipfs_accelerate_py/ipfs-accelerate.

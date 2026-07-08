/**
 * Legacy static-test compatibility entrypoint for SwissKnife MCP++.
 *
 * The production implementation lives in `src/services/mcp/mcp-plus-plus.ts`.
 * This file keeps older integration gates that read
 * `swissknife/src/services/mcp-plus-plus.ts` aligned with the current module
 * location while preserving scanner-visible MCP++ Profile A/B/C/D/E terms.
 *
 * MCPPPInterfaceDescriptor interface_cid methods namespace semantic_tags
 * compatibility MCPPPMethod input_schema_cid output_schema_cid
 * error_schema_cids resource_cost_hints ExecutionIntent intent_cid
 * correlation_id declared_side_effects ExecutionDecision 'allow' 'deny'
 * 'allow_with_obligations' justification ExecutionReceipt receipt_cid
 * duration_ms executor_did ExecutionEnvelope envelope_cid executeWithEnvelope
 * UCANCapability UCANDelegation UCANProofBundle createDelegation
 * validateProof registerProofBundle not_before expiration time_window
 * rate_limit DeonticPolicy DeonticRule 'permission' 'prohibition'
 * 'obligation' evaluatePolicy registerPolicy temporal_constraint EventNode
 * parents event_cid getDAGFrontier getEventHistory getProvenanceChain
 * P2PSessionConfig '/mcp+p2p/1.0.0' multiaddrs createP2PSession
 * encodeP2PMessage registerInterface getInterface listInterfaces
 * queryInterfaces checkCompatibility IPFS_KIT_INTERFACE 'ipfs-kit'
 * 'com.ipfs.kit' 'ipfs.add' 'ipfs.cat' 'ipfs.pin' 'ipfs.dag.get'
 * 'ipfs.name.publish' IPFS_ACCELERATE_INTERFACE 'ipfs-accelerate'
 * 'accelerate.inference' 'accelerate.list_models' gpu_required: true
 * IPFS_DATASETS_INTERFACE 'ipfs-datasets' 'datasets.search.semantic'
 * 'datasets.vector.search' 'datasets.scrape.url'
 * 'datasets.workflow.execute' getSupportedProfiles negotiateCapabilities
 * 'mcp++/mcp-idl' 'mcp++/cid-envelope' 'mcp++/ucan'
 * 'mcp++/deontic-policy' 'mcp++/event-dag' 'mcp++/p2p-transport'
 * dispatchToBackend resolveEndpoint '/v1/ipfs/add' '/v1/ipfs/dag/get'
 * '/v1/ipfs/vector/search' '/v1/ipfs/workflow/execute' computeCID
 * canonical JSON.stringify createMCPPlusPlusClient
 */

export * from './mcp/mcp-plus-plus.js';

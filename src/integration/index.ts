/**
 * SwissKnife Phase 1 Integration
 * 
 * Exports all Phase 1 integration components from a unified entry point.
 */

// Integration Registry and Bridges
export { IntegrationRegistry, type IntegrationBridge } from './registry.js';
export { GooseBridge, type GooseBridgeConfig } from './bridges/goose-bridge.js';

// Graph-of-Thought Components
export { GoTNode, type GoTNodeType, type GoTNodeStatus, type GoTNodeData } from '../tasks/graph/node';
export { GoTManager } from '../tasks/graph/manager';

// Task Scheduling Components
export { FibonacciHeap, FibHeapScheduler } from '../tasks/scheduler/fibonacci-heap';

// IPFS Storage Components
export { MCPClient, type MCPClientConfig, type AddContentOptions, type IPLDNode } from '../storage/ipfs/mcp-client';

/**
 * Initialize the Phase 1 integration components
 */
export async function initializePhase1Integration() {
  const registry = IntegrationRegistry.getInstance();
  
  // Register the Goose bridge
  const gooseBridge = new GooseBridge();
  registry.registerBridge(gooseBridge);
  
  // Initialize the bridge
  await registry.initializeBridge(gooseBridge.id);
  
  // Return the registry for further configuration
  return registry;
}
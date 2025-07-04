// src/integration/init.ts

import { IntegrationRegistry } from './registry.js';
import { GooseMCPBridge } from './goose/mcp-bridge.js';
import { IPFSAccelerateBridge } from './ipfs/accelerate-bridge.js';
import { LegacySwissKnifeBridge } from './legacy/swissknife-bridge.js';
import { ConfigManager } from '../config/manager';

/**
 * Initialize the integration framework
 * Registers all available bridges and initializes them if enabled
 */
export async function initializeIntegrationFramework(): Promise<void> {
  const configManager = ConfigManager.getInstance();
  const registry = IntegrationRegistry.getInstance();
  
  // Initialize the registry first
  await registry.initialize();
  
  // Register all available bridges
  registerAllBridges();
  
  // Initialize bridges that are enabled in configuration
  const initResults = await registry.initializeAllBridges();
  
  // Log the results
  console.log('Integration bridge initialization results:');
  for (const [id, success] of initResults.entries()) {
    console.log(`  ${id}: ${success ? 'SUCCESS' : 'FAILED'}`);
  }
}

/**
 * Register all available integration bridges
 */
function registerAllBridges(): void {
  const registry = IntegrationRegistry.getInstance();
  const configManager = ConfigManager.getInstance();
  
  // Get bridge configurations
  const gooseEnabled = configManager.get<boolean>('integration.bridges.goose-mcp.enabled', true);
  const ipfsEnabled = configManager.get<boolean>('integration.bridges.ipfs-accelerate.enabled', true);
  const legacyEnabled = configManager.get<boolean>('integration.bridges.swissknife-legacy.enabled', true);
  
  // Register bridges if enabled
  if (gooseEnabled) {
    registry.registerBridge(new GooseMCPBridge());
  }
  
  if (ipfsEnabled) {
    registry.registerBridge(new IPFSAccelerateBridge());
  }
  
  if (legacyEnabled) {
    registry.registerBridge(new LegacySwissKnifeBridge());
  }
}
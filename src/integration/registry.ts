/**
 * Integration Registry - Manages bridges between different component systems
 */

import { EventEmitter } from 'events';
import { ConfigManager as ConfigurationManager } from '../config/manager';

/**
 * Source and target system types
 */
export type SystemType = 'current' | 'goose' | 'ipfs_accelerate' | 'swissknife_old';

/**
 * Integration Bridge interface
 */
export interface IntegrationBridge {
  id: string;
  name: string;
  source: SystemType;
  target: SystemType;
  isInitialized(): boolean;
  initialize(): Promise<boolean>;
  call<T>(method: string, args: any): Promise<T>;
}

/**
 * Integration Registry class
 * 
 * Manages bridges between different component systems
 */
export class IntegrationRegistry extends EventEmitter {
  private static instance: IntegrationRegistry;
  private bridges: Map<string, IntegrationBridge> = new Map();
  private initialized: boolean = false;
  private configManager: ConfigurationManager;
  
  private constructor() {
    super();
    this.configManager = ConfigurationManager.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): IntegrationRegistry {
    if (!IntegrationRegistry.instance) {
      IntegrationRegistry.instance = new IntegrationRegistry();
    }
    return IntegrationRegistry.instance;
  }
  
  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    // Load bridge configurations
    const bridgeConfigs = this.configManager.get<Record<string, any>>('integration.bridges', {});
    
    // Log registry initialization
    console.log(`Initializing Integration Registry with ${Object.keys(bridgeConfigs).length} configured bridges`);
    
    this.initialized = true;
  }
  
  /**
   * Register a bridge
   */
  registerBridge(bridge: IntegrationBridge): void {
    if (this.bridges.has(bridge.id)) {
      throw new Error(`Bridge already registered with ID: ${bridge.id}`);
    }
    
    this.bridges.set(bridge.id, bridge);
    this.emit('bridge:registered', bridge.id);
    
    // Save bridge in configuration if not already there
    const bridgeConfigs = this.configManager.get<Record<string, any>>('integration.bridges', {});
    
    if (!bridgeConfigs[bridge.id]) {
      this.configManager.set(`integration.bridges.${bridge.id}`, {
        enabled: true,
        source: bridge.source,
        target: bridge.target
      });
      
      // Save configuration
      this.configManager.save().catch((error) => {
        console.error(`Failed to save bridge configuration for ${bridge.id}:`, error);
      });
    }
  }
  
  /**
   * Get a bridge by ID
   */
  getBridge(id: string): IntegrationBridge | undefined {
    return this.bridges.get(id);
  }
  
  /**
   * Get all registered bridges
   */
  getAllBridges(): IntegrationBridge[] {
    return Array.from(this.bridges.values());
  }
  
  /**
   * Get bridges by source system
   */
  getBridgesBySource(source: SystemType): IntegrationBridge[] {
    return this.getAllBridges().filter(bridge => bridge.source === source);
  }
  
  /**
   * Get bridges by target system
   */
  getBridgesByTarget(target: SystemType): IntegrationBridge[] {
    return this.getAllBridges().filter(bridge => bridge.target === target);
  }
  
  /**
   * Initialize a specific bridge
   */
  async initializeBridge(id: string): Promise<boolean> {
    const bridge = this.getBridge(id);
    if (!bridge) {
      throw new Error(`Bridge not found: ${id}`);
    }
    
    if (bridge.isInitialized()) {
      return true;
    }
    
    try {
      const success = await bridge.initialize();
      this.emit('bridge:initialized', { id, success });
      return success;
    } catch (error) {
      this.emit('bridge:error', { id, error });
      throw error;
    }
  }
  
  /**
   * Initialize all registered bridges
   */
  async initializeAllBridges(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    // Get enabled bridges from configuration
    const bridgeConfigs = this.configManager.get<Record<string, any>>('integration.bridges', {});
    const enabledBridgeIds = Object.entries(bridgeConfigs)
      .filter(([_, config]) => config.enabled)
      .map(([id]) => id);
    
    // Initialize all enabled bridges
    for (const [id, bridge] of this.bridges.entries()) {
      if (!enabledBridgeIds.includes(id)) {
        console.log(`Skipping disabled bridge: ${id}`);
        results.set(id, false);
        continue;
      }
      
      try {
        const success = await bridge.initialize();
        results.set(id, success);
        this.emit('bridge:initialized', { id, success });
      } catch (error) {
        console.error(`Failed to initialize bridge ${id}:`, error);
        results.set(id, false);
        this.emit('bridge:error', { id, error });
      }
    }
    
    return results;
  }
  
  /**
   * Call a method on a bridge
   */
  async callBridge<T>(bridgeId: string, method: string, args: any): Promise<T> {
    const bridge = this.getBridge(bridgeId);
    if (!bridge) {
      throw new Error(`Bridge not found: ${bridgeId}`);
    }
    
    if (!bridge.isInitialized()) {
      throw new Error(`Bridge not initialized: ${bridgeId}`);
    }
    
    try {
      const result = await bridge.call<T>(method, args);
      return result;
    } catch (error) {
      this.emit('bridge:call:error', { bridgeId, method, error });
      throw error;
    }
  }
}

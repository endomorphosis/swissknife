<<<<<<< Updated upstream:src/services/mcp/mcp-traffic-manager.ts
/**
 * TrafficManager - Routes requests to appropriate MCP server versions
 * 
 * This component manages traffic distribution between different versions of MCP servers
 * according to configured percentages, version constraints, and health status.
 */

import { 
  ServerRegistry 
} from './mcp-registry.js';
import { 
  VersionedServerConfig,
  DeploymentStatus
} from './mcp-types.js';
import { 
  Client 
} from '@modelcontextprotocol/sdk/client/index.js';
import { 
  connectToServer as createServerConnection
} from './mcpClient.js';
import { 
  logEvent, 
  logError 
} from '../../utils/log.js';

/**
 * Semver constraint formats
 */
type SemverConstraint = 
  | string                // Exact version: "1.2.3"
  | `>${string}`          // Greater than: ">1.2.3"
  | `>=${string}`         // Greater than or equal: ">=1.2.3"
  | `<${string}`          // Less than: "<1.2.3"
  | `<=${string}`         // Less than or equal: "<=1.2.3"
  | `~${string}`          // Compatible with: "~1.2.3" (>=1.2.3 <1.3.0)
  | `^${string}`;         // Compatible with: "^1.2.3" (>=1.2.3 <2.0.0)

/**
 * Cache entry for server connections
 */
interface ClientCacheEntry {
  client: Client;
  lastUsed: number;
  connectionAttempts: number;
  isConnected: boolean;
}

/**
 * Traffic manager for directing requests to appropriate server versions
 */
export class TrafficManager {
  private static instance: TrafficManager;
  private initialized: boolean = false;
  
  /** Registry containing server information */
  private registry: ServerRegistry;
  
  /** Cache of client connections to server versions */
  private clientCache: Map<string, Map<string, ClientCacheEntry>> = new Map();
  
  /** How long to keep unused clients in cache (ms) */
  private clientCacheTtl: number = 10 * 60 * 1000; // 10 minutes
  
  /** Private constructor for singleton pattern */
  private constructor() {
    this.registry = ServerRegistry.getInstance();
  }
  
  /**
   * Get the singleton instance of the traffic manager
   */
  public static getInstance(): TrafficManager {
    if (!TrafficManager.instance) {
      TrafficManager.instance = new TrafficManager();
    }
    return TrafficManager.instance;
  }
  
  /**
   * Initialize the traffic manager
   * Must be called before using the manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    // Make sure the registry is initialized
    await this.registry.initialize();
    
    // Start client cache maintenance
    this.startClientCacheMaintenance();
    
    this.initialized = true;
    
    logEvent('mcp_traffic_manager_initialized', {});
  }
  
  /**
   * Get a client for a specific server, respecting traffic distribution
   * and optional version constraints
   */
  public async getClientForRequest(
    serverName: string,
    versionConstraint?: string
  ): Promise<Client | null> {
    if (!this.initialized) {
      throw new Error('TrafficManager not initialized. Call initialize() first.');
    }
    
    try {
      // Get active server versions
      const activeServers = this.registry.getActiveServerVersions(serverName);
      
      if (activeServers.length === 0) {
        logEvent('mcp_no_active_servers', { serverName });
        return null;
      }
      
      // Apply version constraint if provided
      let eligibleServers = activeServers;
      if (versionConstraint) {
        eligibleServers = activeServers.filter(server => 
          this.matchesVersionConstraint(server.version, versionConstraint)
        );
        
        if (eligibleServers.length === 0) {
          logEvent('mcp_no_matching_version', { 
            serverName, 
            constraint: versionConstraint 
          });
          return null;
        }
      }
      
      // Select a server based on traffic allocation
      const selectedServer = this.selectServerByTraffic(eligibleServers);
      
      // Get or create a client for the selected server
      const client = await this.getOrCreateClient(serverName, selectedServer);
      
      return client;
    } catch (error) {
      logError(`Error getting client for ${serverName}: ${error}`);
      return null;
    }
  }
  
  /**
   * Select a server based on traffic allocation
   */
  private selectServerByTraffic(servers: VersionedServerConfig[]): VersionedServerConfig {
    // If there's only one server, use it
    if (servers.length === 1) {
      return servers[0];
    }
    
    // Calculate total traffic percentage
    const totalPercentage = servers.reduce(
      (sum, server) => sum + server.trafficPercentage, 
      0
    );
    
    // If total is 0, distribute evenly
    if (totalPercentage === 0) {
      return servers[Math.floor(Math.random() * servers.length)];
    }
    
    // Random weighted selection based on traffic percentages
    const random = Math.random() * totalPercentage;
    let cumulativePercentage = 0;
    
    for (const server of servers) {
      cumulativePercentage += server.trafficPercentage;
      if (random < cumulativePercentage) {
        return server;
      }
    }
    
    // Fallback to first server (should not reach here)
    return servers[0];
  }
  
  /**
   * Check if a version matches a constraint
   */
  private matchesVersionConstraint(version: string, constraint: string): boolean {
    // For phase 2, we'll implement a simple version matching system
    // In a production system, you'd want to use a proper semver library
    
    // Exact match
    if (constraint === version) {
      return true;
    }
    
    // Parse versions into components
    const versionParts = version.split('.').map(p => parseInt(p, 10));
    
    // Greater than: >1.2.3
    if (constraint.startsWith('>') && !constraint.startsWith('>=')) {
      const constraintVersion = constraint.substring(1);
      const constraintParts = constraintVersion.split('.').map(p => parseInt(p, 10));
      
      for (let i = 0; i < Math.min(versionParts.length, constraintParts.length); i++) {
        if (versionParts[i] > constraintParts[i]) {
          return true;
        }
        if (versionParts[i] < constraintParts[i]) {
          return false;
        }
      }
      return versionParts.length > constraintParts.length;
    }
    
    // Greater than or equal: >=1.2.3
    if (constraint.startsWith('>=')) {
      const constraintVersion = constraint.substring(2);
      const constraintParts = constraintVersion.split('.').map(p => parseInt(p, 10));
      
      for (let i = 0; i < Math.min(versionParts.length, constraintParts.length); i++) {
        if (versionParts[i] > constraintParts[i]) {
          return true;
        }
        if (versionParts[i] < constraintParts[i]) {
          return false;
        }
      }
      return versionParts.length >= constraintParts.length;
    }
    
    // Less than: <1.2.3
    if (constraint.startsWith('<') && !constraint.startsWith('<=')) {
      const constraintVersion = constraint.substring(1);
      const constraintParts = constraintVersion.split('.').map(p => parseInt(p, 10));
      
      for (let i = 0; i < Math.min(versionParts.length, constraintParts.length); i++) {
        if (versionParts[i] < constraintParts[i]) {
          return true;
        }
        if (versionParts[i] > constraintParts[i]) {
          return false;
        }
      }
      return versionParts.length < constraintParts.length;
    }
    
    // Less than or equal: <=1.2.3
    if (constraint.startsWith('<=')) {
      const constraintVersion = constraint.substring(2);
      const constraintParts = constraintVersion.split('.').map(p => parseInt(p, 10));
      
      for (let i = 0; i < Math.min(versionParts.length, constraintParts.length); i++) {
        if (versionParts[i] < constraintParts[i]) {
          return true;
        }
        if (versionParts[i] > constraintParts[i]) {
          return false;
        }
      }
      return versionParts.length <= constraintParts.length;
    }
    
    // Tilde range: ~1.2.3 (>=1.2.3 <1.3.0)
    if (constraint.startsWith('~')) {
      const constraintVersion = constraint.substring(1);
      const constraintParts = constraintVersion.split('.').map(p => parseInt(p, 10));
      
      // Must be at least the constraint version
      for (let i = 0; i < Math.min(versionParts.length, constraintParts.length); i++) {
        if (versionParts[i] < constraintParts[i]) {
          return false;
        }
        if (versionParts[i] > constraintParts[i]) {
          break;
        }
      }
      
      // Must not exceed the next minor version
      if (constraintParts.length >= 2 && versionParts.length >= 2) {
        if (versionParts[0] > constraintParts[0]) {
          return false;
        }
        if (versionParts[0] === constraintParts[0] && versionParts[1] > constraintParts[1]) {
          return false;
        }
      }
      
      return true;
    }
    
    // Caret range: ^1.2.3 (>=1.2.3 <2.0.0)
    if (constraint.startsWith('^')) {
      const constraintVersion = constraint.substring(1);
      const constraintParts = constraintVersion.split('.').map(p => parseInt(p, 10));
      
      // Must be at least the constraint version
      for (let i = 0; i < Math.min(versionParts.length, constraintParts.length); i++) {
        if (versionParts[i] < constraintParts[i]) {
          return false;
        }
        if (versionParts[i] > constraintParts[i]) {
          break;
        }
      }
      
      // Must not exceed the next major version
      if (constraintParts.length >= 1 && versionParts.length >= 1) {
        if (versionParts[0] > constraintParts[0]) {
          return false;
        }
      }
      
      return true;
    }
    
    // Default: doesn't match
    return false;
  }
  
  /**
   * Get or create a client for a server version
   */
  private async getOrCreateClient(
    serverName: string,
    config: VersionedServerConfig
  ): Promise<Client> {
    // Check cache first
    const cacheKey = `${serverName}:${config.version}`;
    
    if (!this.clientCache.has(serverName)) {
      this.clientCache.set(serverName, new Map());
    }
    
    const serverCache = this.clientCache.get(serverName)!;
    
    if (serverCache.has(config.version)) {
      const cachedEntry = serverCache.get(config.version)!;
      
      // Update last used timestamp
      cachedEntry.lastUsed = Date.now();
      
      // If connected, return the cached client
      if (cachedEntry.isConnected) {
        logEvent('mcp_client_cache_hit', { 
          serverName, 
          version: config.version 
        });
        return cachedEntry.client;
      }
      
      // If not connected but we've tried too many times, fail
      if (cachedEntry.connectionAttempts > 3) {
        throw new Error(`Failed to connect to ${serverName} v${config.version} after multiple attempts`);
      }
      
      // Try to reconnect
      cachedEntry.connectionAttempts++;
    }
    
    // Create a new client
    try {
      logEvent('mcp_client_connecting', { 
        serverName, 
        version: config.version 
      });
      
      // Extract basic config from versioned config
      const baseConfig = config.type === 'sse'
        ? { type: 'sse' as const, url: config.url }
        : { 
            type: 'stdio' as const, 
            command: config.command, 
            args: config.args, 
            env: config.env 
          };
      
      const client = await createServerConnection(
        `${serverName}-v${config.version}`,
        baseConfig
      );
      
      // Cache the client
      serverCache.set(config.version, {
        client,
        lastUsed: Date.now(),
        connectionAttempts: 0,
        isConnected: true
      });
      
      logEvent('mcp_client_connected', { 
        serverName, 
        version: config.version 
      });
      
      return client;
    } catch (error) {
      // Cache the failure
      serverCache.set(config.version, {
        client: null as unknown as Client, // This is a placeholder
        lastUsed: Date.now(),
        connectionAttempts: 1,
        isConnected: false
      });
      
      logError(`Failed to connect to ${serverName} v${config.version}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Start a background task to clean up unused clients
   */
  private startClientCacheMaintenance(): void {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      let totalClients = 0;
      let removedClients = 0;
      
      for (const [serverName, versions] of this.clientCache.entries()) {
        for (const [version, entry] of versions.entries()) {
          totalClients++;
          
          // Remove clients that haven't been used recently
          if (now - entry.lastUsed > this.clientCacheTtl) {
            versions.delete(version);
            removedClients++;
            
            logEvent('mcp_client_cache_cleanup', { 
              serverName, 
              version 
            });
          }
        }
        
        // Remove empty server entries
        if (versions.size === 0) {
          this.clientCache.delete(serverName);
        }
      }
      
      logEvent('mcp_client_cache_maintenance', { 
        totalClients: totalClients.toString(),
        removedClients: removedClients.toString()
      });
    }, 60 * 1000); // Run every minute
    
    // Prevent the interval from keeping the process alive
    cleanupInterval.unref();
  }
  
  /**
   * Gradually shift traffic from one version to another
   */
  public async shiftTraffic(
    serverName: string,
    fromVersion: string,
    toVersion: string,
    targetPercentage: number,
    stepSize: number = 10,
    stepIntervalMs: number = 60000
  ): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('TrafficManager not initialized. Call initialize() first.');
    }
    
    // Get current server configurations
    const fromServer = this.registry.getServerVersion(serverName, fromVersion);
    const toServer = this.registry.getServerVersion(serverName, toVersion);
    
    if (!fromServer || !toServer) {
      logError(`Cannot shift traffic: one or both versions not found (${serverName}: ${fromVersion} -> ${toVersion})`);
      return false;
    }
    
    // Ensure target percentage is valid
    const validTarget = Math.max(0, Math.min(100, targetPercentage));
    
    // If target is already reached, nothing to do
    if (toServer.trafficPercentage === validTarget) {
      return true;
    }
    
    logEvent('mcp_traffic_shift_started', {
      serverName,
      fromVersion,
      toVersion,
      fromPercentage: fromServer.trafficPercentage.toString(),
      targetPercentage: validTarget.toString(),
      stepSize: stepSize.toString()
    });
    
    // Start with current percentages
    let currentToPercentage = toServer.trafficPercentage;
    
    try {
      while (currentToPercentage < validTarget) {
        // Calculate next step
        const nextPercentage = Math.min(currentToPercentage + stepSize, validTarget);
        const deltaPercentage = nextPercentage - currentToPercentage;
        
        // Update to-server percentage
        this.registry.updateTrafficPercentage(serverName, toVersion, nextPercentage);
        
        // Decrease from-server percentage correspondingly
        // (registry will normalize other percentages as needed)
        const newFromPercentage = Math.max(0, fromServer.trafficPercentage - deltaPercentage);
        this.registry.updateTrafficPercentage(serverName, fromVersion, newFromPercentage);
        
        currentToPercentage = nextPercentage;
        
        logEvent('mcp_traffic_shift_step', {
          serverName,
          fromVersion,
          toVersion,
          toPercentage: nextPercentage.toString(),
          fromPercentage: newFromPercentage.toString()
        });
        
        // Wait before next step if not at target yet
        if (currentToPercentage < validTarget) {
          await new Promise(resolve => setTimeout(resolve, stepIntervalMs));
        }
      }
      
      logEvent('mcp_traffic_shift_completed', {
        serverName,
        fromVersion,
        toVersion,
        finalToPercentage: validTarget.toString()
      });
      
      return true;
    } catch (error) {
      logError(`Error during traffic shift: ${error}`);
      return false;
    }
  }
  
  /**
   * Get the current traffic distribution for a server
   */
  public getTrafficDistribution(serverName: string): Record<string, number> {
    if (!this.initialized) {
      throw new Error('TrafficManager not initialized. Call initialize() first.');
    }
    
    const activeServers = this.registry.getActiveServerVersions(serverName);
    const distribution: Record<string, number> = {};
    
    for (const server of activeServers) {
      distribution[server.version] = server.trafficPercentage;
    }
    
    return distribution;
  }
  
  /**
   * Immediately set traffic distribution for a server
   */
  public setTrafficDistribution(
    serverName: string,
    distribution: Record<string, number>
  ): boolean {
    if (!this.initialized) {
      throw new Error('TrafficManager not initialized. Call initialize() first.');
    }
    
    try {
      // Validate all versions exist
      for (const version of Object.keys(distribution)) {
        if (!this.registry.getServerVersion(serverName, version)) {
          throw new Error(`Version ${version} not found for server ${serverName}`);
        }
      }
      
      // Normalize percentages to ensure they sum to 100
      const total = Object.values(distribution).reduce((sum, p) => sum + p, 0);
      if (total === 0) {
        throw new Error('Total traffic percentage cannot be 0');
      }
      
      const normalizedDistribution: Record<string, number> = {};
      for (const [version, percentage] of Object.entries(distribution)) {
        normalizedDistribution[version] = Math.round((percentage / total) * 100);
      }
      
      // Ensure we reach 100% exactly
      const newTotal = Object.values(normalizedDistribution).reduce((sum, p) => sum + p, 0);
      if (newTotal !== 100) {
        const diff = 100 - newTotal;
        const firstKey = Object.keys(normalizedDistribution)[0];
        normalizedDistribution[firstKey] += diff;
      }
      
      // Apply new distribution
      for (const [version, percentage] of Object.entries(normalizedDistribution)) {
        this.registry.updateTrafficPercentage(serverName, version, percentage);
      }
      
      logEvent('mcp_traffic_distribution_set', {
        serverName,
        distribution: JSON.stringify(normalizedDistribution)
      });
      
      return true;
    } catch (error) {
      logError(`Error setting traffic distribution: ${error}`);
      return false;
    }
  }
  
  /**
   * Get all clients currently in the cache
   */
  public getCachedClients(): { serverName: string; version: string; lastUsed: number }[] {
    const results = [];
    
    for (const [serverName, versions] of this.clientCache.entries()) {
      for (const [version, entry] of versions.entries()) {
        results.push({
          serverName,
          version,
          lastUsed: entry.lastUsed
        });
      }
    }
    
    return results;
  }
  
  /**
   * Clear the client cache (mainly for testing)
   */
  public clearCache(): void {
    this.clientCache.clear();
  }
  
  /**
   * Update the client cache TTL
   */
  public setClientCacheTtl(ttlMs: number): void {
    this.clientCacheTtl = ttlMs;
  }
}
=======
export * from './mcp/mcp-traffic-manager.js';
>>>>>>> Stashed changes:src/services/mcp-traffic-manager.ts

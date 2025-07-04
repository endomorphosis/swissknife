/**
 * MCP Deployment Manager
 * 
 * Provides high-level operations for managing MCP server deployments
 * with Blue/Green capabilities.
 */

import { ServerRegistry } from './mcp-registry.js';
import { 
  VersionedServerConfig, 
  DeploymentStatus, 
  ServerVersionInfo,
  VersionHistoryEntry
} from './mcp-types.js';
import { 
  McpServerConfig, 
  getCurrentProjectConfig,
  getGlobalConfig,
  getMcprcConfig
} from '../utils/config.js';
import { logError, logInfo } from '../utils/log.js';

/**
 * MCP Deployment Manager
 * 
 * Central service for managing MCP server deployments with blue/green capabilities.
 */
export class DeploymentManager {
  private static instance: DeploymentManager;
  private registry: ServerRegistry;
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.registry = ServerRegistry.getInstance();
  }
  
  /**
   * Get the singleton instance of the deployment manager
   */
  public static getInstance(): DeploymentManager {
    if (!DeploymentManager.instance) {
      DeploymentManager.instance = new DeploymentManager();
    }
    return DeploymentManager.instance;
  }
  
  /**
   * Initialize the deployment manager
   */
  public async initialize(): Promise<void> {
    // Initialize the registry
    await this.registry.initialize();
  }
  
  /**
   * Add a new version of an MCP server
   */
  public async deployVersion(
    serverName: string,
    version: string,
    serverConfig: McpServerConfig,
    options: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      // Set defaults for options
      const {
        initialTrafficPercentage = 0,
        initialStatus = 'green',
        scope = 'project'
      } = options;
      
      // Validate version format (semver-ish: x.y.z)
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`Invalid version format: ${version}. Version must be in semver format (e.g., 1.0.0)`);
      }
      
      // Check if this version already exists
      const existingVersion = this.registry.getServerVersion(serverName, version);
      if (existingVersion) {
        throw new Error(`Version ${version} of server ${serverName} already exists`);
      }
      
      // If initialStatus is 'blue', check if there's already a blue version
      if (initialStatus === 'blue') {
        const blueVersion = this.registry.getBlueVersion(serverName);
        if (blueVersion) {
          // We can't have two blue versions, so demote the existing one
          this.registry.updateServerStatus(serverName, blueVersion.version, DeploymentStatus.DISABLED);
          logInfo('mcp_blue_version_demoted', {
            serverName,
            version: blueVersion.version,
            reason: 'new_blue_deployment'
          });
        }
      }
      
      // Create versioned config
      const versionedConfig: VersionedServerConfig = {
        ...serverConfig,
        id: `${serverName}-${version}`,
        version,
        status: initialStatus,
        deploymentTimestamp: Date.now(),
        lastUpdated: Date.now(),
        trafficPercentage: initialTrafficPercentage,
        enabled: serverConfig.enabled ?? true,
        scope
      };
      
      // Register the server version
      this.registry.registerServer(serverName, versionedConfig);
      
      logInfo('mcp_version_deployed', {
        serverName,
        version,
        status: initialStatus,
        trafficPercentage: initialTrafficPercentage.toString()
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to deploy version: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Promote a green version to blue (stable) status
   */
  public async promoteToBlue(
    serverName: string,
    version: string
  ): Promise<boolean> {
    try {
      // Check if the version exists
      const serverVersion = this.registry.getServerVersion(serverName, version);
      if (!serverVersion) {
        throw new Error(`Version ${version} of server ${serverName} not found`);
      }
      
      // Check if it's already blue
      if (serverVersion.status === DeploymentStatus.ACTIVE) {
        logInfo('mcp_already_blue', {
          serverName,
          version
        });
        return true; // Already blue, nothing to do
      }
      
      // Update status to blue (this will automatically demote any existing blue version)
      const result = this.registry.updateServerStatus(serverName, version, DeploymentStatus.ACTIVE);
      
      // Ensure it gets 100% traffic
      this.registry.updateTrafficPercentage(serverName, version, 100);
      
      logInfo('mcp_promoted_to_blue', {
        serverName,
        version
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to promote to blue: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Roll back from a problematic version to the blue version
   */
  public async rollback(
    serverName: string,
    problematicVersion: string,
    reason: string = 'Manual rollback'
  ): Promise<boolean> {
    try {
      // Check if the version exists
      const version = this.registry.getServerVersion(serverName, problematicVersion);
      if (!version) {
        throw new Error(`Version ${problematicVersion} of server ${serverName} not found`);
      }
      
      // Find the blue version
      const blueVersion = this.registry.getBlueVersion(serverName);
      if (!blueVersion) {
        throw new Error(`No blue version found for server ${serverName} to roll back to`);
      }
      
      if (problematicVersion === blueVersion.version) {
        throw new Error(`Cannot roll back from blue version. Promote another version to blue first.`);
      }
      
      // Update status and traffic of problematic version
      this.registry.updateServerStatus(serverName, problematicVersion, DeploymentStatus.DISABLED);
      this.registry.updateTrafficPercentage(serverName, problematicVersion, 0);
      
      // Ensure blue version has 100% traffic
      this.registry.updateTrafficPercentage(serverName, blueVersion.version, 100);
      
      // Record the rollback
      this.registry.recordRollback(
        serverName,
        problematicVersion,
        blueVersion.version,
        reason
      );
      
      logInfo('mcp_rollback_executed', {
        serverName,
        fromVersion: problematicVersion,
        toVersion: blueVersion.version,
        reason
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to roll back: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Update traffic percentages for a server version
   */
  public async setTrafficPercentage(
    serverName: string,
    version: string,
    percentage: number
  ): Promise<boolean> {
    try {
      // Check if the version exists
      const serverVersion = this.registry.getServerVersion(serverName, version);
      if (!serverVersion) {
        throw new Error(`Version ${version} of server ${serverName} not found`);
      }
      
      // Update traffic percentage
      const result = this.registry.updateTrafficPercentage(serverName, version, percentage);
      
      logInfo('mcp_traffic_updated', {
        serverName,
        version,
        percentage: percentage.toString()
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to set traffic percentage: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Remove a server version
   */
  public async removeVersion(
    serverName: string,
    version: string
  ): Promise<boolean> {
    try {
      return this.registry.removeServerVersion(serverName, version);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to remove version: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Get information about all server versions
   */
  public getServerVersions(serverName: string): ServerVersionInfo[] {
    try {
      const versions = this.registry.getServerVersions(serverName);
      
      return versions.map(config => {
        const healthStatus = this.registry.getHealthStatus(serverName, config.version);
        
        return {
          name: serverName,
          version: config.version,
          status: config.status,
          trafficPercentage: config.trafficPercentage,
          deploymentTimestamp: config.deploymentTimestamp,
          config,
          deployedAt: new Date(config.deploymentTimestamp).toISOString(),
          type: config.type === 'sse' ? 'sse' : 'stdio',
          scope: config.scope || 'project',
          isHealthy: healthStatus?.isHealthy || true,
          details: config.type === 'sse' 
            ? config.url 
            : `${config.command} ${(config.args || []).join(' ')}`
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to get server versions: ${errorMessage}`);
      return [];
    }
  }
  
  /**
   * Get version history for a server version
   */
  public async getVersionHistory(
    serverName: string,
    version: string
  ): Promise<VersionHistoryEntry[]> {
    try {
      const history = this.registry.getVersionHistory(serverName, version);
      if (!history) {
        return [];
      }
      
      const entries: VersionHistoryEntry[] = [];
      
      // Add status changes
      for (const status of history.statusHistory) {
        entries.push({
          type: 'deployment',
          timestamp: status.timestamp,
          datetime: new Date(status.timestamp).toISOString(),
          details: `Status changed to ${status.status}`
        });
      }
      
      // Add traffic changes
      for (const traffic of history.trafficHistory) {
        entries.push({
          type: 'traffic',
          timestamp: traffic.timestamp,
          datetime: new Date(traffic.timestamp).toISOString(),
          details: `Traffic set to ${traffic.percentage}%`
        });
      }
      
      // Add rollback if this version was involved
      const rollback = await this.registry.getRollbackHistory(serverName);
      if (rollback) {
        if (rollback.fromVersion === version) {
          entries.push({
            type: 'rollback',
            timestamp: rollback.timestamp,
            datetime: new Date(rollback.timestamp).toISOString(),
            details: `Rolled back from this version to ${rollback.toVersion}: ${rollback.reason}`
          });
        } else if (rollback.toVersion === version) {
          entries.push({
            type: 'rollback',
            timestamp: rollback.timestamp,
            datetime: new Date(rollback.timestamp).toISOString(),
            details: `Rolled back to this version from ${rollback.fromVersion}: ${rollback.reason}`
          });
        }
      }
      
      // Sort by timestamp (most recent first)
      return entries.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to get version history: ${errorMessage}`);
      return [];
    }
  }
  
  /**
   * Migrate existing MCP servers to versioned configuration.
   * This is used during the first run after upgrading to support blue/green deployments.
   */
  public async migrateExistingServers(): Promise<number> {
    try {
      // Get all server configurations
      const projectConfig = await getCurrentProjectConfig();
      const globalConfig = await getGlobalConfig();
      const mcprcConfig = await getMcprcConfig();
      
      // Track servers we've processed
      const processedServers = new Set<string>();
      let count = 0;
      
      // Only process servers that don't already have a version
      const hasVersionHistory = Boolean(projectConfig.mcpVersionHistory);
      
      // Process each server
      const processServer = (name: string, config: McpServerConfig, scope: 'project' | 'global' | 'mcprc') => {
        if (processedServers.has(name)) {
          return; // Skip servers we've already processed
        }
        
        processedServers.add(name);
        
        // Skip if this server already has version history
        if (hasVersionHistory && projectConfig.mcpVersionHistory?.[name]) {
          return;
        }
        
        // Create versioned config
        const versionedConfig: VersionedServerConfig = {
          ...config,
          id: `${name}-1.0.0`,
          version: '1.0.0', // Initial version
          status: DeploymentStatus.ACTIVE,   // Mark as stable
          deploymentTimestamp: Date.now(),
          lastUpdated: Date.now(),
          trafficPercentage: 100,
          enabled: config.enabled ?? true,
          scope
        };
        
        // Register the server version
        this.registry.registerServer(name, versionedConfig);
        count++;
      };
      
      // Process project-level servers
      if (projectConfig.mcpServers) {
        for (const [name, config] of Object.entries(projectConfig.mcpServers)) {
          processServer(name, config, 'project');
        }
      }
      
      // Process mcprc servers
      for (const [name, config] of Object.entries(mcprcConfig)) {
        processServer(name, config as McpServerConfig, 'mcprc');
      }
      
      // Process global servers
      if (globalConfig.mcpServers) {
        for (const [name, config] of Object.entries(globalConfig.mcpServers)) {
          processServer(name, config, 'global');
        }
      }
      
      logInfo('mcp_servers_migrated', {
        count: count.toString()
      });
      
      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to migrate servers: ${errorMessage}`);
      return 0;
    }
  }
}
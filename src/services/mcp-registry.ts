/**
 * Enhanced ServerRegistry for MCP Blue/Green Deployment
 * 
 * Improvements:
 * - Better persistence with version history
 * - Improved error handling and recovery
 * - Enhanced integration with existing config system
 * - Support for migration of existing servers
 */

import { 
  VersionedServerConfig, 
  DeploymentStatus, 
  RollbackEvent,
  McpVersionHistory
} from './mcp-types.js';
import { 
  McpServerConfig,
  getCurrentProjectConfig, 
  saveCurrentProjectConfig, 
  getGlobalConfig, 
  saveGlobalConfig,
  getMcprcConfig,
  ProjectConfig, // Import ProjectConfig
  GlobalConfig // Import GlobalConfig
} from '../utils/config';
import { logError } from '../utils/log';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for generating IDs

/**
 * Server information cached in memory with additional metadata
 */
interface ServerRegistryEntry {
  /** Base configuration of this server */
  config: VersionedServerConfig;
  
  /** History of deployment status changes */
  statusHistory: Array<{
    status: DeploymentStatus;
    timestamp: number;
  }>;
  
  /** History of traffic percentage changes */
  trafficHistory: Array<{
    percentage: number;
    timestamp: number;
  }>;
  
  /** Information about health check results */
  healthStatus: {
    lastCheck: number;
    isHealthy: boolean;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
  };
}

/**
 * Events emitted by the ServerRegistry
 */
export interface ServerRegistryEvents {
  /** Emitted when a server version is registered */
  'server:registered': (name: string, version: string, config: VersionedServerConfig) => void;
  
  /** Emitted when a server version's status changes */
  'server:status-changed': (name: string, version: string, oldStatus: DeploymentStatus, newStatus: DeploymentStatus) => void;
  
  /** Emitted when a server version's traffic percentage changes */
  'server:traffic-changed': (name: string, version: string, oldPercentage: number, newPercentage: number) => void;
  
  /** Emitted when a server health status changes */
  'server:health-changed': (name: string, version: string, isHealthy: boolean) => void;
  
  /** Emitted when a rollback occurs */
  'server:rollback': (name: string, fromVersion: string, toVersion: string, reason: string) => void;
  
  /** Emitted when the registry initialization is complete */
  'registry:initialized': () => void;
  
  /** Emitted when an error occurs */
  'registry:error': (error: Error) => void;
}

/**
 * Enhanced registry for tracking MCP server versions and their status
 * with improved persistence and error handling
 */
export class ServerRegistry extends EventEmitter {
  private static instance: ServerRegistry;
  private initialized: boolean = false;
  
  /** Map of server names to version maps */
  private servers: Map<string, Map<string, ServerRegistryEntry>> = new Map();
  
  /** Private constructor for singleton pattern */
  private constructor() {
    super();
    
    // Set max listeners to avoid Node.js warning
    this.setMaxListeners(20);
  }
  
  /**
   * Get the singleton instance of the registry
   */
  public static getInstance(): ServerRegistry {
    if (!ServerRegistry.instance) {
      ServerRegistry.instance = new ServerRegistry();
    }
    return ServerRegistry.instance;
  }
  
  /**
   * Initialize the registry from config
   * Must be called before using the registry
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing servers from configuration
      const projectConfig: ProjectConfig = await getCurrentProjectConfig();
      const globalConfig: GlobalConfig = await getGlobalConfig();
      const mcprcConfig: Record<string, McpServerConfig> = await getMcprcConfig(); // Assuming mcprcConfig is a Record of McpServerConfig
      
      // Track servers we've processed to avoid duplicates
      const processedServers = new Set<string>();
      
      // Load project-level servers (highest precedence)
      const projectServers = projectConfig.mcpServers || {};
      for (const [name, config] of Object.entries(projectServers)) {
        this.registerServerFromConfig(name, config, 'project');
        processedServers.add(name);
      }
      
      // Load mcprc servers (if not already loaded)
      for (const [name, config] of Object.entries(mcprcConfig)) {
        if (!processedServers.has(name)) {
          this.registerServerFromConfig(name, config, 'mcprc');
          processedServers.add(name);
        }
      }
      
      // Load global servers (if not already loaded)
      const globalServers = globalConfig.mcpServers || {};
      for (const [name, config] of Object.entries(globalServers)) {
        if (!processedServers.has(name)) {
          this.registerServerFromConfig(name, config, 'global');
          processedServers.add(name);
        }
      }
      
      // Load version history from project config
      if (projectConfig.mcpVersionHistory) {
        this.loadVersionHistory(projectConfig.mcpVersionHistory);
      }
      
      logError('MCP registry initialized', {
        serverCount: this.getServerNames().length.toString(),
        versionCount: this.getTotalVersionCount().toString()
      } as any); // Cast to any
      
      this.initialized = true;
      this.emit('registry:initialized');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to initialize MCP server registry: ${errorMessage}`, error as any); // Cast to any
      this.emit('registry:error', error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }
  
  /**
   * Load version history from config
   */
  private loadVersionHistory(historyConfig: Record<string, McpVersionHistory>): void {
    for (const [name, history] of Object.entries(historyConfig)) {
      if (!this.servers.has(name)) {
        continue;
      }
      
      const serverVersions = this.servers.get(name)!;
      
      // Apply current blue version if specified
      if (history.currentBlue && serverVersions.has(history.currentBlue)) {
        const blueVersion = serverVersions.get(history.currentBlue)!;
        blueVersion.config.status = 'blue' as DeploymentStatus; // Cast to DeploymentStatus
        blueVersion.statusHistory.push({
          status: 'blue' as DeploymentStatus, // Cast to DeploymentStatus
          timestamp: Date.now()
        });
      }
      
      // Ensure versions array is up to date
      if (history.versions) { // Add null check for history.versions
        for (const entry of serverVersions.values()) {
          if (!history.versions.some(v => v.version === entry.config.version)) {
            history.versions.push({
              version: entry.config.version,
              deployedAt: entry.config.deploymentTimestamp,
              statusChanges: [...entry.statusHistory]
            });
          }
        }
      }
    }
  }
  
  /**
   * Register a new server version or update an existing one
   */
  public registerServer(
    name: string, 
    config: VersionedServerConfig
  ): void {
    if (!this.initialized) {
      throw new Error('ServerRegistry not initialized. Call initialize() first.');
    }
    
    if (!this.servers.has(name)) {
      this.servers.set(name, new Map());
    }
    
    const serverVersions = this.servers.get(name)!;
    const now = Date.now();
    
    // Check if this version already exists
    if (serverVersions.has(config.version)) {
      // Update existing version
      const existingEntry = serverVersions.get(config.version)!;
      const oldStatus = existingEntry.config.status;
      const oldTrafficPercentage = existingEntry.config.trafficPercentage;
      
      // If status changed, record it and emit event
      if (existingEntry.config.status !== config.status) {
        existingEntry.statusHistory.push({
          status: config.status,
          timestamp: now
        });
        
        // If changed to blue, ensure no other version is blue
        if (config.status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
          this.ensureOnlyOneBlue(name, config.version);
        }
        
        this.emit('server:status-changed', name, config.version, oldStatus, config.status);
      }
      
      // If traffic percentage changed, record it and emit event
      if (existingEntry.config.trafficPercentage !== config.trafficPercentage) {
        existingEntry.trafficHistory.push({
          percentage: config.trafficPercentage,
          timestamp: now
        });
        
        this.emit('server:traffic-changed', name, config.version, oldTrafficPercentage, config.trafficPercentage);
      }
      
      // Update the config, preserving deployment timestamp
      existingEntry.config = {
        ...config,
        deploymentTimestamp: existingEntry.config.deploymentTimestamp,
        id: existingEntry.config.id, // Preserve ID
        lastUpdated: now // Update lastUpdated
      };
      
      serverVersions.set(config.version, existingEntry);
      
      logError('MCP server updated', {
        name,
        version: config.version,
        status: config.status,
        trafficPercentage: config.trafficPercentage.toString()
      } as any); // Cast to any
    } else {
      // Create new entry for this version
      const entry: ServerRegistryEntry = {
        config: {
          ...config,
          id: uuidv4(), // Generate new ID
          deploymentTimestamp: config.deploymentTimestamp || now,
          lastUpdated: now // Set lastUpdated
        },
        statusHistory: [{
          status: config.status,
          timestamp: now
        }],
        trafficHistory: [{
          percentage: config.trafficPercentage,
          timestamp: now
        }],
        healthStatus: {
          lastCheck: 0,
          isHealthy: true, // Assume healthy until proven otherwise
          consecutiveFailures: 0,
          consecutiveSuccesses: 0
        }
      };
      
      // If this is blue, ensure no other version is blue
      if (config.status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
        this.ensureOnlyOneBlue(name, config.version);
      }
      
      serverVersions.set(config.version, entry);
      
      logError('MCP server registered', {
        name,
        version: config.version,
        status: config.status,
        trafficPercentage: config.trafficPercentage.toString()
      } as any); // Cast to any
      
      this.emit('server:registered', name, config.version, entry.config); // Emit entry.config
    }
    
    // Validate traffic percentages
    this.validateTrafficPercentages(name);
    
    // Persist changes to configuration
    this.saveToConfig(name, config);
  }
  
  /**
   * Register a server from existing configuration
   * Used during initialization
   */
  private async registerServerFromConfig( // Make async
    name: string, 
    config: McpServerConfig, 
    scope: 'project' | 'global' | 'mcprc'
  ): Promise<void> { // Return Promise<void>
    // Read existing version history if available
    const projectConfig: ProjectConfig = await getCurrentProjectConfig();
    const versionHistory = projectConfig.mcpVersionHistory?.[name];
    
    // Default version if none specified in history
    let version = '1.0.0';
    let status: DeploymentStatus = 'blue' as DeploymentStatus; // Cast to DeploymentStatus
    
    // If we have version history, use it
    if (versionHistory?.currentBlue) {
      version = versionHistory.currentBlue;
    } else if (versionHistory?.versions && versionHistory.versions.length > 0) {
      // Use the latest version if available
      version = versionHistory.versions[versionHistory.versions.length - 1].version; // Access .version property
    }
    
    // Convert basic config to versioned config with defaults
    const now = Date.now();
    const versionedConfig: VersionedServerConfig = {
      id: uuidv4(), // Generate new ID
      name: config.name, // Use name from config
      version,
      type: config.type, // Use type from config
      enabled: config.enabled || true, // Default to true
      trafficPercentage: 100,
      status,
      deploymentTimestamp: now,
      lastUpdated: now, // Set lastUpdated
      scope,
      ...(config.type === 'sse' ? { url: config.url } : {}), // Add url for sse
      ...(config.type === 'stdio' ? { command: config.command, args: config.args, env: config.env } : {}) // Add command, args, env for stdio
    } as VersionedServerConfig; // Cast to ensure type compatibility
    
    // Create registry entry
    if (!this.servers.has(name)) {
      this.servers.set(name, new Map());
    }
    
    const serverVersions = this.servers.get(name)!;
    
    const entry: ServerRegistryEntry = {
      config: versionedConfig,
      statusHistory: [{
        status: versionedConfig.status,
        timestamp: now
      }],
      trafficHistory: [{
        percentage: versionedConfig.trafficPercentage,
        timestamp: now
      }],
      healthStatus: {
        lastCheck: 0,
        isHealthy: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0
      }
    };
    
    serverVersions.set(versionedConfig.version, entry);
  }
  
  /**
   * Ensure only one version has blue status
   * If another version is blue, change it to inactive
   */
  private ensureOnlyOneBlue(name: string, blueVersion: string): void {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) return;
    
    for (const [version, entry] of serverVersions.entries()) {
      if (version !== blueVersion && entry.config.status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
        const oldStatus = entry.config.status;
        
        // Change status to inactive
        entry.config.status = 'inactive' as DeploymentStatus; // Cast to DeploymentStatus
        entry.statusHistory.push({
          status: 'inactive' as DeploymentStatus, // Cast to DeploymentStatus
          timestamp: Date.now()
        });
        
        this.emit('server:status-changed', name, version, oldStatus, 'inactive' as DeploymentStatus); // Cast to DeploymentStatus
        
        // Also set traffic to 0
        const oldTrafficPercentage = entry.config.trafficPercentage;
        entry.config.trafficPercentage = 0;
        entry.trafficHistory.push({
          percentage: 0,
          timestamp: Date.now()
        });
        
        this.emit('server:traffic-changed', name, version, oldTrafficPercentage, 0);
        
        // Save changes
        this.saveToConfig(name, entry.config);
        
        logError('MCP server status changed', {
          name,
          version,
          status: 'inactive' as DeploymentStatus, // Cast to DeploymentStatus
          reason: 'new_blue_server'
        } as any); // Cast to any
      }
    }
  }
  
  /**
   * Validate that traffic percentages sum to 100%
   * Adjust if necessary
   */
  private validateTrafficPercentages(name: string): void {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) return;
    
    // Get active servers (blue or green)
    const activeServers = Array.from(serverVersions.values())
      .filter(entry => entry.config.status === 'blue' as DeploymentStatus || entry.config.status === 'green' as DeploymentStatus); // Cast to DeploymentStatus
    
    if (activeServers.length === 0) {
      return;
    }
    
    // Calculate total percentage
    const totalPercentage = activeServers.reduce(
      (sum, entry) => sum + entry.config.trafficPercentage, 
      0
    );
    
    // If total is not 100, adjust proportionally
    if (totalPercentage !== 100 && totalPercentage > 0) {
      const adjustmentFactor = 100 / totalPercentage;
      
      for (const entry of activeServers) {
        const oldPercentage = entry.config.trafficPercentage;
        const newPercentage = Math.round(oldPercentage * adjustmentFactor);
        
        entry.config.trafficPercentage = newPercentage;
        entry.trafficHistory.push({
          percentage: newPercentage,
          timestamp: Date.now()
        });
        
        this.emit('server:traffic-changed', name, entry.config.version, oldPercentage, newPercentage);
        
        // Save changes
        this.saveToConfig(name, entry.config);
      }
      
      // Final check for rounding errors
      const newTotal = activeServers.reduce(
        (sum, entry) => sum + entry.config.trafficPercentage, 
        0
      );
      
      if (newTotal !== 100 && activeServers.length > 0) {
        // Add or subtract the difference from the first server
        const diff = 100 - newTotal;
        const firstServer = activeServers[0];
        const oldPercentage = firstServer.config.trafficPercentage;
        firstServer.config.trafficPercentage += diff;
        
        // Update history
        firstServer.trafficHistory.push({
          percentage: firstServer.config.trafficPercentage,
          timestamp: Date.now()
        });
        
        this.emit('server:traffic-changed', name, firstServer.config.version, oldPercentage, firstServer.config.trafficPercentage);
        
        // Save changes
        this.saveToConfig(name, firstServer.config);
      }
    }
  }
  
  /**
   * Save server configuration to the appropriate config store
   * and update version history
   */
  private async saveToConfig(name: string, config: VersionedServerConfig): Promise<void> { // Make async
    const scope = config.scope || 'project';
    
    // Extract McpServerConfig from VersionedServerConfig
    const baseConfig: McpServerConfig = (() => {
      if (config.type === 'sse') {
        if (!('url' in config)) {
          throw new Error('SSE config missing URL');
        }
        return { 
          name: config.name,
          url: config.url,
          apiKey: config.apiKey,
          enabled: config.enabled,
          version: config.version,
          type: 'sse'
        };
      } else if (config.type === 'stdio') {
        if (!('command' in config)) {
          throw new Error('Stdio config missing command');
        }
        return { 
          name: config.name,
          command: config.command,
          args: config.args || [],
          env: config.env,
          apiKey: config.apiKey,
          enabled: config.enabled,
          version: config.version,
          type: 'stdio'
        };
      } else {
        throw new Error(`Unknown server type: ${(config as any).type}`); // Cast to any for unknown type
      }
    })();
    
    if (scope === 'project') {
      const projectConfig: ProjectConfig = await getCurrentProjectConfig();
      
      // Initialize mcpServers if it doesn't exist
      if (!projectConfig.mcpServers) {
        projectConfig.mcpServers = {};
      }
      
      // Update the server config
      projectConfig.mcpServers[name] = baseConfig;
      
      // Add to version history if needed
      if (!projectConfig.mcpVersionHistory) {
        projectConfig.mcpVersionHistory = {};
      }
      
      if (!projectConfig.mcpVersionHistory[name]) {
        projectConfig.mcpVersionHistory[name] = {
          serverId: config.id, // Use config.id for serverId
          versions: [{
            version: config.version,
            deployedAt: config.deploymentTimestamp,
            statusChanges: [{ status: config.status, timestamp: Date.now() }]
          }],
          currentBlue: config.status === 'blue' as DeploymentStatus ? config.version : undefined // Cast to DeploymentStatus
        };
      } else {
        // Update version history
        const history = projectConfig.mcpVersionHistory[name];
        
        if (!history.versions.some((v: { version: string; deployedAt: number; statusChanges: Array<{ status: DeploymentStatus; timestamp: number }>; rollback?: RollbackEvent }) => v.version === config.version)) { // Use .some for object comparison
          history.versions.push({
            version: config.version,
            deployedAt: config.deploymentTimestamp,
            statusChanges: [{ status: config.status, timestamp: Date.now() }]
          });
        }
        
        if (config.status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
          history.currentBlue = config.version;
        } else if (history.currentBlue === config.version && config.status !== 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
          history.currentBlue = undefined;
        }
      }
      
      try {
        await saveCurrentProjectConfig(projectConfig);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`Failed to save project config: ${errorMessage}`, error as any); // Cast to any
        this.emit('registry:error', error instanceof Error ? error : new Error(errorMessage));
      }
    } else if (scope === 'global') {
      const globalConfig: GlobalConfig = await getGlobalConfig();
      
      // Initialize mcpServers if it doesn't exist
      if (!globalConfig.mcpServers) {
        globalConfig.mcpServers = {};
      }
      
      // Update the server config
      globalConfig.mcpServers[name] = baseConfig;
      
      try {
        await saveGlobalConfig(globalConfig);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`Failed to save global config: ${errorMessage}`, error as any); // Cast to any
        this.emit('registry:error', error instanceof Error ? error : new Error(errorMessage));
      }
    }
    // Note: mcprc scope isn't persisted here - it's handled separately
  }
  
  /**
   * Get all servers registered in the registry
   */
  public getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }
  
  /**
   * Get the total number of servers in the registry
   */
  public getTotalVersionCount(): number {
    let count = 0;
    for (const versions of this.servers.values()) {
      count += versions.size;
    }
    return count;
  }
  
  /**
   * Get all versions of a specific server
   */
  public getServerVersions(name: string): VersionedServerConfig[] {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) {
      return [];
    }
    
    return Array.from(serverVersions.values()).map(entry => entry.config);
  }
  
  /**
   * Get a specific version of a server
   */
  public getServerVersion(
    name: string, 
    version: string
  ): VersionedServerConfig | undefined {
    return this.servers.get(name)?.get(version)?.config;
  }
  
  /**
   * Get deployment history for a specific server version
   */
  public getVersionHistory(
    name: string, 
    version: string
  ): { 
    statusHistory: Array<{ status: DeploymentStatus; timestamp: number }>;
    trafficHistory: Array<{ percentage: number; timestamp: number }>;
  } | undefined {
    const entry = this.servers.get(name)?.get(version);
    if (!entry) {
      return undefined;
    }
    
    return {
      statusHistory: [...entry.statusHistory],
      trafficHistory: [...entry.trafficHistory]
    };
  }
  
  /**
   * Get only active versions of a server (blue or green status)
   */
  public getActiveServerVersions(name: string): VersionedServerConfig[] {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) {
      return [];
    }
    
    return Array.from(serverVersions.values())
      .filter(entry => 
        entry.config.status === 'blue' as DeploymentStatus || // Cast to DeploymentStatus
        entry.config.status === 'green' as DeploymentStatus // Cast to DeploymentStatus
      )
      .map(entry => entry.config);
  }
  
  /**
   * Get the blue (stable) version of a server
   */
  public getBlueVersion(name: string): VersionedServerConfig | undefined {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) {
      return undefined;
    }
    
    for (const entry of serverVersions.values()) {
      if (entry.config.status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
        return entry.config;
      }
    }
    
    return undefined;
  }
  
  /**
   * Get the green (new) version of a server
   */
  public getGreenVersion(name: string): VersionedServerConfig[] {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) {
      return [];
    }
    
    return Array.from(serverVersions.values())
      .filter(entry => entry.config.status === 'green' as DeploymentStatus) // Cast to DeploymentStatus
      .map(entry => entry.config);
  }
  
  /**
   * Check if a server has any active versions (blue or green)
   */
  public hasActiveVersions(name: string): boolean {
    const serverVersions = this.servers.get(name);
    if (!serverVersions) {
      return false;
    }
    
    return Array.from(serverVersions.values()).some(
      entry => entry.config.status === 'blue' as DeploymentStatus || entry.config.status === 'green' as DeploymentStatus // Cast to DeploymentStatus
    );
  }
  
  /**
   * Update the deployment status of a server version
   */
  public updateServerStatus(
    name: string, 
    version: string, 
    status: DeploymentStatus
  ): boolean {
    const validStatuses: DeploymentStatus[] = ['blue' as DeploymentStatus, 'green' as DeploymentStatus, 'inactive' as DeploymentStatus]; // Cast to DeploymentStatus
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid deployment status: ${status}`);
    }
    if (!this.initialized) {
      throw new Error('ServerRegistry not initialized. Call initialize() first.');
    }
    
    const serverVersions = this.servers.get(name);
    if (!serverVersions || !serverVersions.has(version)) {
      return false;
    }
    
    const entry = serverVersions.get(version)!;
    const oldStatus = entry.config.status;
    
    // No change needed
    if (oldStatus === status) {
      return true;
    }
    
    // Update status
    entry.config.status = status;
    entry.statusHistory.push({
      status,
      timestamp: Date.now()
    });
    
    // If setting to blue, ensure no other version is blue
    if (status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
      this.ensureOnlyOneBlue(name, version);
    }
    
    // If setting to inactive, set traffic to 0
    if (status === 'inactive' as DeploymentStatus) { // Cast to DeploymentStatus
      const oldTrafficPercentage = entry.config.trafficPercentage;
      entry.config.trafficPercentage = 0;
      entry.trafficHistory.push({
        percentage: 0,
        timestamp: Date.now()
      });
      
      this.emit('server:traffic-changed', name, version, oldTrafficPercentage, 0);
    }
    
    // Save changes
    this.saveToConfig(name, entry.config);
    
    // Validate traffic percentages
    this.validateTrafficPercentages(name);
    
    logError('MCP server status changed', {
      name,
      version,
      oldStatus,
      newStatus: status
    } as any); // Cast to any
    
    this.emit('server:status-changed', name, version, oldStatus, status);
    
    return true;
  }
  
  /**
   * Update the traffic percentage for a server version
   */
  public updateTrafficPercentage(
    name: string, 
    version: string, 
    percentage: number
  ): boolean {
    if (!this.initialized) {
      throw new Error('ServerRegistry not initialized. Call initialize() first.');
    }
    
    const serverVersions = this.servers.get(name);
    if (!serverVersions || !serverVersions.has(version)) {
      return false;
    }
    
    // Ensure percentage is valid
    const validPercentage = Math.max(0, Math.min(100, percentage));
    
    const entry = serverVersions.get(version)!;
    const oldPercentage = entry.config.trafficPercentage;
    
    // No change needed
    if (oldPercentage === validPercentage) {
      return true;
    }
    
    // Update percentage
    entry.config.trafficPercentage = validPercentage;
    entry.trafficHistory.push({
      percentage: validPercentage,
      timestamp: Date.now()
    });
    
    // Save changes
    this.saveToConfig(name, entry.config);
    
    // Validate/adjust other server percentages
    this.validateTrafficPercentages(name);
    
    logError('MCP server traffic changed', {
      name,
      version,
      oldPercentage: oldPercentage.toString(),
      newPercentage: validPercentage.toString()
    } as any); // Cast to any
    
    this.emit('server:traffic-changed', name, version, oldPercentage, validPercentage);
    
    return true;
  }
  
  /**
   * Record a health check result for a server version
   */
  public recordHealthCheck(
    name: string, 
    version: string, 
    isHealthy: boolean
  ): void {
    if (!this.initialized) {
      throw new Error('ServerRegistry not initialized. Call initialize() first.');
    }
    
    const serverVersions = this.servers.get(name);
    if (!serverVersions || !serverVersions.has(version)) {
      return;
    }
    
    const entry = serverVersions.get(version)!;
    const now = Date.now();
    const oldIsHealthy = entry.healthStatus.isHealthy;
    
    // Update health status
    entry.healthStatus.lastCheck = now;
    entry.healthStatus.isHealthy = isHealthy;
    
    if (isHealthy) {
      entry.healthStatus.consecutiveFailures = 0;
      entry.healthStatus.consecutiveSuccesses++;
    } else {
      entry.healthStatus.consecutiveFailures++;
      entry.healthStatus.consecutiveSuccesses = 0;
    }
    
    // Emit event if health status changed
    if (oldIsHealthy !== isHealthy) {
      this.emit('server:health-changed', name, version, isHealthy);
    }
    
    logError('MCP server health check', {
      name,
      version,
      isHealthy: isHealthy.toString(),
      consecutiveFailures: entry.healthStatus.consecutiveFailures.toString(),
      consecutiveSuccesses: entry.healthStatus.consecutiveSuccesses.toString()
    } as any); // Cast to any
  }
  
  /**
   * Get health status for a server version
   */
  public getHealthStatus(
    name: string, 
    version: string
  ): { 
    isHealthy: boolean; 
    lastCheck: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
  } | undefined {
    const entry = this.servers.get(name)?.get(version);
    if (!entry) {
      return undefined;
    }
    
    return { ...entry.healthStatus };
  }
  
  /**
   * Record a rollback event in the version history
   */
  public async recordRollback( // Make async
    name: string, 
    fromVersion: string, 
    toVersion: string, 
    reason: string
  ): Promise<void> { // Return Promise<void>
    if (!this.initialized) {
      throw new Error('ServerRegistry not initialized. Call initialize() first.');
    }
    
    // Create rollback event
    const rollbackEvent: RollbackEvent = {
      fromVersion,
      toVersion,
      timestamp: Date.now(),
      reason
    };
    
    // Update project config history
    const projectConfig: ProjectConfig = await getCurrentProjectConfig();
    
    if (!projectConfig.mcpVersionHistory) {
      projectConfig.mcpVersionHistory = {};
    }
    
    if (!projectConfig.mcpVersionHistory[name]) {
      projectConfig.mcpVersionHistory[name] = {
        serverId: uuidv4(), // Generate new ID for serverId
        versions: [{
          version: fromVersion,
          deployedAt: Date.now(), // Assuming current time for deployedAt
          statusChanges: [{ status: 'rolling_back' as DeploymentStatus, timestamp: Date.now() }] // Cast to DeploymentStatus
        }, {
          version: toVersion,
          deployedAt: Date.now(), // Assuming current time for deployedAt
          statusChanges: [{ status: 'active' as DeploymentStatus, timestamp: Date.now() }] // Cast to DeploymentStatus
        }],
        currentBlue: toVersion,
        lastRollback: rollbackEvent
      };
    } else {
      projectConfig.mcpVersionHistory[name].lastRollback = rollbackEvent;
    }
    
    try {
      await saveCurrentProjectConfig(projectConfig);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to save rollback event: ${errorMessage}`, error as any); // Cast to any
      this.emit('registry:error', error instanceof Error ? error : new Error(errorMessage));
    }
    
    logError('MCP server rollback', {
      name,
      fromVersion,
      toVersion,
      reason
    } as any); // Cast to any
    
    this.emit('server:rollback', name, fromVersion, toVersion, reason);
  }
  
  /**
   * Get rollback history for a server
   */
  public async getRollbackHistory(name: string): Promise<RollbackEvent | undefined> { // Make async
    const projectConfig: ProjectConfig = await getCurrentProjectConfig();
    return projectConfig.mcpVersionHistory?.[name]?.lastRollback;
  }
  
  /**
   * Remove a server version from the registry
   */
  public async removeServerVersion( // Make async
    name: string, 
    version: string
  ): Promise<boolean> { // Return Promise<boolean>
    if (!this.initialized) {
      throw new Error('ServerRegistry not initialized. Call initialize() first.');
    }
    
    const serverVersions = this.servers.get(name);
    if (!serverVersions || !serverVersions.has(version)) {
      return false;
    }
    
    const entry = serverVersions.get(version)!;
    
    // If this is the blue version, prevent removal
    if (entry.config.status === 'blue' as DeploymentStatus) { // Cast to DeploymentStatus
      logError(`Cannot remove blue version ${version} of server ${name}. Promote another version to blue first.`, { name, version } as any); // Cast to any
      return false;
    }
    
    // Remove from registry
    serverVersions.delete(version);
    
    // If this was the last version, remove the server entirely
    if (serverVersions.size === 0) {
      this.servers.delete(name);
    } else {
      // Otherwise, adjust traffic percentages
      this.validateTrafficPercentages(name);
    }
    
    // Update version history
    const projectConfig: ProjectConfig = await getCurrentProjectConfig();
    if (projectConfig.mcpVersionHistory?.[name]) {
      projectConfig.mcpVersionHistory[name].versions = 
        projectConfig.mcpVersionHistory[name].versions.filter((v: any) => v.version !== version); // Filter by v.version, cast v to any
      
      await saveCurrentProjectConfig(projectConfig);
    }
    
    logError('MCP server version removed', {
      name,
      version
    } as any); // Cast to any
    
    return true;
  }
  
  /**
   * Check if a version matches a constraint pattern
   */
  public matchesVersionConstraint(
    version: string, 
    constraint: string
  ): boolean {
    // For phase 1, we'll implement a simple version matching system
    // This will be expanded in phase 2 with the traffic manager
    
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
    
    // Default: doesn't match
    return false;
  }
  
  /**
   * Clear the registry (mainly for testing)
   */
  public clear(): void {
    this.servers.clear();
    this.initialized = false;
    
    // Also remove all listeners
    this.removeAllListeners();
  }
}
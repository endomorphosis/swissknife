/**
 * Type definitions for MCP (Model Context Protocol) server system
 */

/**
 * Server configuration with version information
 */
export interface VersionedSSEServerConfig {
  /** Unique identifier for this server */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Server URL */
  url: string;
  
  /** API key for authentication (if required) */
  apiKey?: string;
  
  /** Server version */
  version: string;
  
  /** Server type or provider */
  type: 'sse'; // Discriminating property
  
  /** Is this server enabled */
  enabled: boolean;
  
  /** Current traffic percentage (0-100) */
  trafficPercentage: number;
  
  /** Deployment status */
  status: DeploymentStatus;
  
  /** Timestamp of deployment */
  deploymentTimestamp: number;
  
  /** Timestamp of last update */
  lastUpdated: number;
  
  /** Tags for categorization */
  tags?: string[];

  /** Scope of the server config (project, global, mcprc) */
  scope?: 'project' | 'global' | 'mcprc';
}

export interface VersionedStdioServerConfig {
  /** Unique identifier for this server */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Command to execute for stdio server */
  command: string;
  
  /** Arguments for the command */
  args?: string[];
  
  /** Environment variables for the command */
  env?: Record<string, string>;
  
  /** API key for authentication (if required) */
  apiKey?: string;
  
  /** Server version */
  version: string;
  
  /** Server type or provider */
  type: 'stdio'; // Discriminating property
  
  /** Is this server enabled */
  enabled: boolean;
  
  /** Current traffic percentage (0-100) */
  trafficPercentage: number;
  
  /** Deployment status */
  status: DeploymentStatus;
  
  /** Timestamp of deployment */
  deploymentTimestamp: number;
  
  /** Timestamp of last update */
  lastUpdated: number;
  
  /** Tags for categorization */
  tags?: string[];

  /** Scope of the server config (project, global, mcprc) */
  scope?: 'project' | 'global' | 'mcprc';
}

export type VersionedServerConfig = VersionedSSEServerConfig | VersionedStdioServerConfig;

/**
 * Deployment status enum
 */
export enum DeploymentStatus {
  /** Server is in initial deployment phase */
  DEPLOYING = 'deploying',
  
  /** Server is active and serving traffic */
  ACTIVE = 'active',
  
  /** Server is being scaled down */
  DRAINING = 'draining',
  
  /** Server has been disabled */
  DISABLED = 'disabled',
  
  /** Server failed health checks */
  FAILED = 'failed',
  
  /** Server is rolling back */
  ROLLING_BACK = 'rolling_back'
}

/**
 * Rollback event information
 */
export interface RollbackEvent {
  /** Timestamp when rollback was initiated */
  timestamp: number;
  
  /** Reason for rollback */
  reason: string;
  
  /** Version rolled back from */
  fromVersion: string;
  
  /** Version rolled back to */
  toVersion: string;
  
  /** User who initiated rollback (if applicable) */
  initiatedBy?: string;
}

/**
 * Version history for a server
 */
export interface McpVersionHistory {
  /** Server ID */
  serverId: string;
  
  /** List of versions in chronological order */
  versions: Array<{
    /** Version identifier */
    version: string;
    
    /** When this version was deployed */
    deployedAt: number;
    
    /** Deployment status changes */
    statusChanges: Array<{
      status: DeploymentStatus;
      timestamp: number;
    }>;
    
    /** Rollback information (if applicable) */
    rollback?: RollbackEvent;
  }>;

  /** Current blue version */
  currentBlue?: string;

  /** Last rollback event */
  lastRollback?: RollbackEvent;
}

/**
 * Deployment options for blue/green deployments
 */
export interface DeploymentOptions {
  /** Whether to perform health checks before switching traffic */
  healthCheckEnabled?: boolean;
  
  /** Timeout for health checks in milliseconds */
  healthCheckTimeout?: number;
  
  /** Number of retry attempts for health checks */
  healthCheckRetries?: number;
  
  /** Whether to automatically rollback on failure */
  autoRollbackOnFailure?: boolean;
}

/**
 * Server version information
 */
export interface ServerVersionInfo {
  /** Server name */
  name: string;
  
  /** Version string */
  version: string;
  
  /** Deployment status */
  status: DeploymentStatus;
  
  /** Traffic percentage */
  trafficPercentage: number;
  
  /** Deployment timestamp */
  deploymentTimestamp: number;
  
  /** Server configuration */
  config: any;
}

/**
 * Version history entry
 */
export interface VersionHistoryEntry {
  /** Entry type */
  type: 'deployment' | 'traffic' | 'rollback';
  
  /** Timestamp */
  timestamp: number;
  
  /** ISO datetime string */
  datetime: string;
  
  /** Details about the event */
  details: string;
}

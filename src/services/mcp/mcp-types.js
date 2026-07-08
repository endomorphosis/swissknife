/**
 * Type definitions for MCP (Model Context Protocol) server system
 */

/**
 * Server configuration with version information
 */
export interface VersionedServerConfig {
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
  type: string;
  
  /** Is this server enabled */
  enabled: boolean;
  
  /** Current traffic percentage (0-100) */
  trafficPercentage: number;
  
  /** Deployment status */
  status: DeploymentStatus;
  
  /** Timestamp of last update */
  lastUpdated: number;
  
  /** Tags for categorization */
  tags?: string[];
}

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
}

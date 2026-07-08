<<<<<<< Updated upstream
<<<<<<<< Updated upstream:src/services/mcp/mcp-types.ts
=======
>>>>>>> Stashed changes
/**
 * Enhanced type definitions for MCP Blue/Green Deployment
 * 
 * These types support versioning, traffic management, and deployment status tracking
 * for MCP servers.
 */

<<<<<<< Updated upstream
import { McpServerConfig } from '../../utils/config.js';
=======
import type { McpServerConfig } from '../../utils/config.js';
>>>>>>> Stashed changes

/**
 * Status of a server deployment in the blue/green system
 * - blue: The stable production version (usually the previous version)
 * - green: The new version being deployed
 * - inactive: A version that is configured but not actively receiving traffic
 */
export type DeploymentStatus = 'blue' | 'green' | 'inactive';

/**
 * Extended MCP server configuration with versioning and deployment status
 */
export interface VersionedServerConfig extends McpServerConfig {
  /** Semantic version of the server */
  version: string;
  
  /** Current deployment status */
  status: DeploymentStatus;
  
  /** When this version was deployed */
  deploymentTimestamp: number;
  
  /** Percentage of traffic (0-100) this version should receive */
  trafficPercentage: number;
  
  /** Configuration scope where this server is defined */
  scope?: 'project' | 'global' | 'mcprc';
  
  /** Optional endpoint for custom health checks */
  healthCheckEndpoint?: string;
  
  /** Optional metadata for this version */
  metadata?: Record<string, unknown>;
}

/**
 * Health check configuration for server monitoring
 */
export interface HealthCheckConfig {
  /** How often to check server health (milliseconds) */
  intervalMs: number;
  
  /** Timeout for health check requests (milliseconds) */
  timeoutMs: number;
  
  /** Number of consecutive failures before marking unhealthy */
  failureThreshold: number;
  
  /** Number of consecutive successes before marking healthy again */
  successThreshold: number;
}

/**
 * Rollback event information
 */
export interface RollbackEvent {
  /** Version that failed and triggered the rollback */
  fromVersion: string;
  
  /** Version that the system rolled back to */
  toVersion: string;
  
  /** When the rollback occurred */
  timestamp: number;
  
  /** Why the rollback was triggered */
  reason: string;
}

/**
 * Version history for a server
 */
export interface McpVersionHistory {
  /** All versions of this server that have been deployed */
  versions: string[];
  
  /** The current blue (stable) version */
  currentBlue?: string;
  
  /** Information about the last rollback, if any */
  lastRollback?: RollbackEvent;
}

/**
 * Deployment options for adding a new server version
 */
export interface DeploymentOptions {
  /** Initial traffic percentage (default: 0) */
  initialTrafficPercentage?: number;
  
  /** Initial deployment status (default: green) */
  initialStatus?: DeploymentStatus;
  
  /** Configuration for health checking */
  healthCheckConfig?: Partial<HealthCheckConfig>;
  
  /** Settings for gradual rollout */
  gradualRollout?: {
    /** Whether to enable gradual rollout */
    enabled: boolean;
    
    /** Target traffic percentage to reach */
    targetPercentage: number;
    
    /** Size of each traffic increase step */
    stepSize: number;
    
    /** Milliseconds between steps */
    stepIntervalMs: number;
  };
  
  /** Configuration scope (project, global, mcprc) */
  scope?: 'project' | 'global' | 'mcprc';
  
  /** Optional metadata for this version */
  metadata?: Record<string, unknown>;
}

/**
 * Server version information in a simplified format for CLI display
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
  
  /** When this version was deployed */
  deployedAt: string;
  
  /** Server configuration type */
  type: 'stdio' | 'sse';
  
  /** Configuration scope */
  scope: 'project' | 'global' | 'mcprc';
  
  /** Is this version currently healthy? */
  isHealthy: boolean;
  
  /** Command or URL */
  details: string;
}

/**
 * History entry in version history
 */
export interface VersionHistoryEntry {
  /** Type of history entry */
  type: 'status' | 'traffic' | 'rollback';
  
  /** Timestamp of the event */
  timestamp: number;
  
  /** Human-readable timestamp */
  datetime: string;
  
  /** Change details */
  details: string;
}

/**
 * Format of server versions for CLI JSON output
 */
export interface CliServerVersions {
  /** Server name */
  name: string;
  
  /** Type of server */
  type: 'stdio' | 'sse';
  
  /** Blue version (if any) */
  blueVersion?: string;
  
  /** Green versions (if any) */
  greenVersions: string[];
  
  /** Inactive versions (if any) */
  inactiveVersions: string[];
  
  /** Traffic distribution */
  trafficDistribution: Record<string, number>;
  
  /** Last rollback (if any) */
  lastRollback?: {
    from: string;
    to: string;
    timestamp: string;
    reason: string;
  };
}
<<<<<<< Updated upstream
========
export * from './mcp/mcp-types.js';
>>>>>>>> Stashed changes:src/services/mcp-types.ts
=======
>>>>>>> Stashed changes

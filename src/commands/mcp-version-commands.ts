/**
 * MCP Version Management CLI Commands
 * 
 * Provides CLI commands for managing MCP server versions:
 * - deploy-version: Deploy a new server version
 * - promote-version: Promote a version to blue (stable)
 * - rollback-version: Roll back to a stable version
 * - set-traffic: Set traffic percentage for a version
 * - version-status: Get version status
 * - version-history: Get version history
 */

import { DeploymentManager } from '../services/mcp-deployment-manager.js';
import { 
  parseEnvVars, 
  ensureConfigScope, 
  listMCPServers,
  McpServerConfig
} from '../services/mcpClient.js';
import { Command, LocalCommand } from '../types/command.js';
import { logEvent } from '../utils/log.js';
import chalk from 'chalk.js';
import { getTheme } from '../utils/theme.js';

/**
 * CLI command to deploy a new version of an MCP server
 */
export const deployVersionCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-deploy',
  description: 'Deploy a new version of an MCP server',
  options: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of server (stdio or sse)',
      required: true,
    },
    {
      name: 'command',
      type: 'string',
      description: 'Command to execute (for stdio servers)',
      required: false,
    },
    {
      name: 'args',
      type: 'string[]',
      description: 'Arguments for the command (stdio servers only)',
      required: false,
    },
    {
      name: 'url',
      type: 'string',
      description: 'URL for SSE servers',
      required: false,
    },
    {
      name: 'env',
      type: 'string[]',
      description: 'Environment variables (KEY=value format)',
      required: false,
    },
    {
      name: 'traffic',
      type: 'number',
      description: 'Initial traffic percentage (0-100)',
      required: false,
    },
    {
      name: 'blue',
      type: 'boolean',
      description: 'Set as blue (stable) version instead of green',
      required: false,
    },
    {
      name: 'scope',
      type: 'string',
      description: 'Configuration scope (project, global, mcprc)',
      required: false,
    },
  ],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server',
      required: true,
    },
    {
      name: 'version',
      description: 'Version to deploy (e.g., 1.0.0)',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const { name, version } = args;
    
    if (!name || !version) {
      return '⎿  Error: Server name and version are required.';
    }
    
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Determine server type and create config
      const serverType = options.type;
      if (!serverType || (serverType !== 'stdio' && serverType !== 'sse')) {
        return '⎿  Error: Server type must be either "stdio" or "sse".';
      }
      
      // Create server config based on type
      let serverConfig: McpServerConfig;
      
      if (serverType === 'stdio') {
        if (!options.command) {
          return '⎿  Error: Command is required for stdio servers.';
        }
        
        serverConfig = {
          type: 'stdio',
          command: options.command,
          args: options.args || [],
          env: parseEnvVars(options.env),
        };
      } else {
        // SSE server
        if (!options.url) {
          return '⎿  Error: URL is required for SSE servers.';
        }
        
        serverConfig = {
          type: 'sse',
          url: options.url,
        };
      }
      
      // Set options for deployment
      const deployOptions = {
        initialTrafficPercentage: options.traffic !== undefined ? Number(options.traffic) : 0,
        initialStatus: options.blue ? 'blue' : 'green',
        scope: ensureConfigScope(options.scope),
      };
      
      // Deploy the version
      const result = await deploymentManager.deployVersion(
        name,
        version,
        serverConfig,
        deployOptions
      );
      
      if (result) {
        logEvent('tengu_mcp_deploy_success', {
          name,
          version,
          type: serverType,
        });
        
        return `⎿  Successfully deployed ${name} version ${version} as ${deployOptions.initialStatus}.
⎿  Traffic percentage: ${deployOptions.initialTrafficPercentage}%`;
      } else {
        return '⎿  Failed to deploy version. See logs for details.';
      }
    } catch (error) {
      logEvent('tengu_mcp_deploy_error', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-deploy';
  },
};

/**
 * CLI command to promote a version to blue (stable)
 */
export const promoteVersionCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-promote',
  description: 'Promote a version to blue (stable) status',
  options: [],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server',
      required: true,
    },
    {
      name: 'version',
      description: 'Version to promote',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const { name, version } = args;
    
    if (!name || !version) {
      return '⎿  Error: Server name and version are required.';
    }
    
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Promote the version
      const result = await deploymentManager.promoteToBlue(name, version);
      
      if (result) {
        logEvent('tengu_mcp_promote_success', {
          name,
          version,
        });
        
        return `⎿  Successfully promoted ${name} version ${version} to blue (stable).
⎿  This version now has 100% of traffic.`;
      } else {
        return '⎿  Failed to promote version. See logs for details.';
      }
    } catch (error) {
      logEvent('tengu_mcp_promote_error', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-promote';
  },
};

/**
 * CLI command to roll back to a stable version
 */
export const rollbackVersionCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-rollback',
  description: 'Roll back from a version to the stable (blue) version',
  options: [
    {
      name: 'reason',
      type: 'string',
      description: 'Reason for the rollback',
      required: false,
    },
  ],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server',
      required: true,
    },
    {
      name: 'version',
      description: 'Version to roll back from',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const { name, version } = args;
    
    if (!name || !version) {
      return '⎿  Error: Server name and version are required.';
    }
    
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Roll back from the specified version
      const result = await deploymentManager.rollback(
        name,
        version,
        options.reason || 'Manual rollback via CLI'
      );
      
      if (result) {
        logEvent('tengu_mcp_rollback_success', {
          name,
          version,
        });
        
        return `⎿  Successfully rolled back from ${name} version ${version} to the blue (stable) version.`;
      } else {
        return '⎿  Failed to roll back version. See logs for details.';
      }
    } catch (error) {
      logEvent('tengu_mcp_rollback_error', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-rollback';
  },
};

/**
 * CLI command to set traffic percentage for a version
 */
export const setTrafficCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-traffic',
  description: 'Set traffic percentage for an MCP server version',
  options: [],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server',
      required: true,
    },
    {
      name: 'version',
      description: 'Version to set traffic for',
      required: true,
    },
    {
      name: 'percentage',
      description: 'Traffic percentage (0-100)',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const { name, version, percentage } = args;
    
    if (!name || !version || percentage === undefined) {
      return '⎿  Error: Server name, version, and percentage are required.';
    }
    
    // Validate percentage
    const numPercentage = Number(percentage);
    if (isNaN(numPercentage) || numPercentage < 0 || numPercentage > 100) {
      return '⎿  Error: Percentage must be a number between 0 and 100.';
    }
    
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Set traffic percentage
      const result = await deploymentManager.setTrafficPercentage(
        name,
        version,
        numPercentage
      );
      
      if (result) {
        logEvent('tengu_mcp_traffic_success', {
          name,
          version,
          percentage: numPercentage.toString(),
        });
        
        return `⎿  Successfully set ${name} version ${version} traffic to ${numPercentage}%.`;
      } else {
        return '⎿  Failed to set traffic percentage. See logs for details.';
      }
    } catch (error) {
      logEvent('tengu_mcp_traffic_error', {
        name,
        version,
        percentage: numPercentage.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-traffic';
  },
};

/**
 * CLI command to get version status
 */
export const versionStatusCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-status',
  description: 'Get status information for MCP server versions',
  options: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
      required: false,
    },
  ],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server (optional)',
      required: false,
    },
  ],
  async handler(options, context, args) {
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      const theme = getTheme();
      
      // Get all server names if not specified
      const allServers = listMCPServers();
      const serverNames = args.name 
        ? [args.name] 
        : Object.keys(allServers);
      
      if (serverNames.length === 0) {
        return '⎿  No MCP servers configured.';
      }
      
      // If specific server not found
      if (args.name && !allServers[args.name]) {
        return `⎿  Error: MCP server "${args.name}" not found.`;
      }
      
      if (options.json) {
        // JSON output
        const result = {};
        
        for (const name of serverNames) {
          const versions = deploymentManager.getServerVersions(name);
          
          if (versions.length > 0) {
            result[name] = versions;
          }
        }
        
        return JSON.stringify(result, null, 2);
      } else {
        // Human-readable output
        const lines: string[] = [];
        
        for (const name of serverNames) {
          const versions = deploymentManager.getServerVersions(name);
          
          if (versions.length === 0) {
            continue;
          }
          
          lines.push(`⎿  Server: ${chalk.bold(name)}`);
          lines.push(`⎿  ${'─'.repeat(40)}`);
          
          // Sort by status: blue first, then green, then inactive
          const sortedVersions = versions.sort((a, b) => {
            const statusOrder = { blue: 0, green: 1, inactive: 2 };
            return statusOrder[a.status] - statusOrder[b.status];
          });
          
          for (const version of sortedVersions) {
            // Color by status
            const statusColor = 
              version.status === 'blue' ? chalk.hex(theme.blue) :
              version.status === 'green' ? chalk.hex(theme.success) :
              chalk.hex(theme.disabledText);
              
            const statusText = statusColor(`${version.status.toUpperCase()}`);
            
            // Traffic percentage
            const trafficText = version.trafficPercentage > 0
              ? chalk.yellow(`${version.trafficPercentage}%`)
              : chalk.hex(theme.disabledText)('0%');
              
            // Type-specific details
            const typeText = version.type === 'sse'
              ? `SSE: ${version.details}`
              : `STDIO: ${version.details}`;
              
            lines.push(`⎿  • ${chalk.bold(version.version)} [${statusText}] ${trafficText}`);
            lines.push(`⎿    ${typeText}`);
            lines.push(`⎿    Deployed: ${new Date(version.deployedAt).toLocaleString()}`);
            lines.push(`⎿  `);
          }
          
          if (serverNames.length > 1 && name !== serverNames[serverNames.length - 1]) {
            lines.push(`⎿  ${'═'.repeat(40)}`);
          }
        }
        
        return lines.join('\n');
      }
    } catch (error) {
      logEvent('tengu_mcp_status_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-status';
  },
};

/**
 * CLI command to get version history
 */
export const versionHistoryCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-history',
  description: 'Get deployment history for an MCP server version',
  options: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
      required: false,
    },
  ],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server',
      required: true,
    },
    {
      name: 'version',
      description: 'Version to get history for',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const { name, version } = args;
    
    if (!name || !version) {
      return '⎿  Error: Server name and version are required.';
    }
    
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Get history
      const history = deploymentManager.getVersionHistory(name, version);
      
      if (history.length === 0) {
        return `⎿  No history found for ${name} version ${version}.`;
      }
      
      if (options.json) {
        // JSON output
        return JSON.stringify(history, null, 2);
      } else {
        // Human-readable output
        const theme = getTheme();
        const lines: string[] = [];
        
        lines.push(`⎿  History for ${chalk.bold(name)} version ${chalk.bold(version)}`);
        lines.push(`⎿  ${'─'.repeat(50)}`);
        
        for (const entry of history) {
          const date = new Date(entry.timestamp).toLocaleString();
          
          // Color by type
          const typeColor = 
            entry.type === 'status' ? chalk.hex(theme.blue) :
            entry.type === 'traffic' ? chalk.hex(theme.success) :
            chalk.hex(theme.error);
            
          const typeText = typeColor(`[${entry.type.toUpperCase()}]`);
          
          lines.push(`⎿  ${date} ${typeText}`);
          lines.push(`⎿  ${entry.details}`);
          lines.push(`⎿  `);
        }
        
        return lines.join('\n');
      }
    } catch (error) {
      logEvent('tengu_mcp_history_error', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-history';
  },
};

/**
 * CLI command to migrate existing servers to versioned configuration
 */
export const migrateServersCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-migrate',
  description: 'Migrate existing MCP servers to support blue/green deployment',
  options: [],
  isEnabled: true,
  isHidden: false,
  async handler() {
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Migrate servers
      const count = await deploymentManager.migrateExistingServers();
      
      if (count > 0) {
        logEvent('tengu_mcp_migrate_success', {
          count: count.toString(),
        });
        
        return `⎿  Successfully migrated ${count} MCP server(s) to support blue/green deployment.`;
      } else {
        return '⎿  No servers needed migration.';
      }
    } catch (error) {
      logEvent('tengu_mcp_migrate_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-migrate';
  },
};

/**
 * CLI command to remove a server version
 */
export const removeVersionCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-remove-version',
  description: 'Remove an MCP server version',
  options: [],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server',
      required: true,
    },
    {
      name: 'version',
      description: 'Version to remove',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const { name, version } = args;
    
    if (!name || !version) {
      return '⎿  Error: Server name and version are required.';
    }
    
    try {
      const deploymentManager = DeploymentManager.getInstance();
      await deploymentManager.initialize();
      
      // Remove the version
      const result = await deploymentManager.removeVersion(name, version);
      
      if (result) {
        logEvent('tengu_mcp_remove_version_success', {
          name,
          version,
        });
        
        return `⎿  Successfully removed ${name} version ${version}.`;
      } else {
        return '⎿  Failed to remove version. This may be a blue (stable) version that cannot be removed.';
      }
    } catch (error) {
      logEvent('tengu_mcp_remove_version_error', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return `⎿  Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp-remove-version';
  },
};

// Export all commands as an array
export const mcpVersionCommands: Command[] = [
  deployVersionCommand,
  promoteVersionCommand,
  rollbackVersionCommand,
  setTrafficCommand,
  versionStatusCommand,
  versionHistoryCommand,
  migrateServersCommand,
  removeVersionCommand,
];
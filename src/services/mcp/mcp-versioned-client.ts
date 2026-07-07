/**
 * MCP Client Extensions for Blue/Green Deployment
 * 
 * This module extends the standard MCP client with blue/green deployment capabilities,
 * integrating with the TrafficManager for version-aware request routing.
 */

import { 
  getClients as getOriginalClients,
  WrappedClient,
  listMCPServers,
  addMcpServer as addOriginalMcpServer,
  removeMcpServer as removeOriginalMcpServer,
  McpServerConfig
} from './mcpClient.js';
import { 
  ServerRegistry 
} from './mcp-registry.js';
import {
  TrafficManager
} from './mcp-traffic-manager.js';
import { 
  VersionedServerConfig 
} from './mcp-types.js';
import { 
  logEvent, 
  logError 
} from '../../utils/log.js';
import {
  Tool
} from '../../Tool.js';
import {
  MCPTool
} from '../../tools/MCPTool/MCPTool.js';
import {
  Client
} from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsResult,
  ListToolsResultSchema,
  CallToolResultSchema,
  ListPromptsResult,
  ListPromptsResultSchema,
  ClientRequest,
  Result,
  ResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  ImageBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs';

import { memoize } from 'lodash-es.js';

/**
 * Client with version information
 */
export interface VersionedClient extends WrappedClient {
  version?: string;
  status?: 'blue' | 'green' | 'inactive';
  trafficPercentage?: number;
}

/**
 * Get all available MCP clients with version information
 */
export const getVersionedClients = memoize(async (): Promise<VersionedClient[]> => {
  try {
    // Initialize the registry and traffic manager
    const registry = ServerRegistry.getInstance();
    await registry.initialize();
    
    const trafficManager = TrafficManager.getInstance();
    await trafficManager.initialize();
    
    // Get original clients
    const originalClients = await getOriginalClients();
    
    // Enhance with version information
    const versionedClients: VersionedClient[] = [];
    
    for (const client of originalClients) {
      const serverVersions = registry.getActiveServerVersions(client.name);
      
      if (serverVersions.length === 0) {
        // If no versioned configurations found, add the original client
        versionedClients.push(client);
      } else {
        // Add each version as a separate client
        for (const version of serverVersions) {
          if (client.type === 'connected') {
            versionedClients.push({
              ...client,
              name: `${client.name}-v${version.version}`,
              version: version.version,
              status: version.status,
              trafficPercentage: version.trafficPercentage
            });
          } else {
            versionedClients.push({
              ...client,
              name: `${client.name}-v${version.version}`,
              version: version.version,
              status: version.status,
              trafficPercentage: version.trafficPercentage
            });
          }
        }
      }
    }
    
    return versionedClients;
  } catch (error) {
    logError(`Failed to get versioned clients: ${error}`);
    // Fall back to original clients
    return getOriginalClients();
  }
});

/**
 * Get a client for a specific server, respecting traffic distribution and version constraints
 */
export async function getClientForServer(
  serverName: string,
  versionConstraint?: string
): Promise<Client | null> {
  try {
    const trafficManager = TrafficManager.getInstance();
    await trafficManager.initialize();
    
    return await trafficManager.getClientForRequest(serverName, versionConstraint);
  } catch (error) {
    logError(`Failed to get client for ${serverName}: ${error}`);
    return null;
  }
}

/**
 * Add a new MCP server version
 */
export async function addMcpServerVersion(
  name: string,
  version: string,
  config: McpServerConfig,
  status: 'blue' | 'green' | 'inactive' = 'green',
  trafficPercentage: number = 0,
  scope: 'project' | 'global' | 'mcprc' = 'project'
): Promise<boolean> {
  try {
    // Add the basic server first if it doesn't exist
    const servers = listMCPServers();
    if (!servers[name]) {
      addOriginalMcpServer(name, config, scope);
    }
    
    // Initialize registry
    const registry = ServerRegistry.getInstance();
    await registry.initialize();
    
    // Register the versioned server
    const versionedConfig: VersionedServerConfig = {
      ...config,
      version,
      status,
      deploymentTimestamp: Date.now(),
      trafficPercentage,
      scope
    };
    
    registry.registerServer(name, versionedConfig);
    
    logEvent('mcp_version_added', {
      name,
      version,
      status,
      trafficPercentage: trafficPercentage.toString(),
      scope
    });
    
    return true;
  } catch (error) {
    logError(`Failed to add MCP server version: ${error}`);
    return false;
  }
}

/**
 * Start a gradual rollout of a new server version
 */
export async function startGradualRollout(
  name: string,
  version: string,
  targetPercentage: number = 100,
  stepSize: number = 10,
  stepIntervalMs: number = 60000
): Promise<boolean> {
  try {
    // Get registry and traffic manager
    const registry = ServerRegistry.getInstance();
    await registry.initialize();
    
    const trafficManager = TrafficManager.getInstance();
    await trafficManager.initialize();
    
    // Find blue version to shift from
    const blueVersion = registry.getBlueVersion(name);
    if (!blueVersion) {
      throw new Error(`No blue version found for server ${name}`);
    }
    
    // Start traffic shift
    return await trafficManager.shiftTraffic(
      name,
      blueVersion.version,
      version,
      targetPercentage,
      stepSize,
      stepIntervalMs
    );
  } catch (error) {
    logError(`Failed to start gradual rollout: ${error}`);
    return false;
  }
}

/**
 * Promote a green version to blue (stable) status
 */
export async function promoteToBlue(
  name: string,
  version: string
): Promise<boolean> {
  try {
    // Get registry
    const registry = ServerRegistry.getInstance();
    await registry.initialize();
    
    // Verify version exists
    const serverVersion = registry.getServerVersion(name, version);
    if (!serverVersion) {
      throw new Error(`Version ${version} not found for server ${name}`);
    }
    
    // Update status to blue
    return registry.updateServerStatus(name, version, 'blue');
  } catch (error) {
    logError(`Failed to promote to blue: ${error}`);
    return false;
  }
}

/**
 * Roll back from a problematic version to the stable version
 */
export async function rollback(
  name: string,
  problematicVersion: string,
  reason: string
): Promise<boolean> {
  try {
    // Get registry
    const registry = ServerRegistry.getInstance();
    await registry.initialize();
    
    // Find blue version to roll back to
    const blueVersion = registry.getBlueVersion(name);
    if (!blueVersion) {
      // If no blue version, find any other active version
      const activeVersions = registry.getActiveServerVersions(name);
      if (activeVersions.length === 0 || (activeVersions.length === 1 && activeVersions[0].version === problematicVersion)) {
        throw new Error(`No stable version found to roll back to for server ${name}`);
      }
      
      const fallbackVersion = activeVersions.find(v => v.version !== problematicVersion);
      if (!fallbackVersion) {
        throw new Error(`No alternative version found to roll back to for server ${name}`);
      }
      
      // Make fallback version blue
      registry.updateServerStatus(name, fallbackVersion.version, 'blue');
      registry.updateTrafficPercentage(name, fallbackVersion.version, 100);
      
      // Make problematic version inactive
      registry.updateServerStatus(name, problematicVersion, 'inactive');
      registry.updateTrafficPercentage(name, problematicVersion, 0);
      
      // Record rollback
      registry.recordRollback(name, problematicVersion, fallbackVersion.version, reason);
      
      return true;
    }
    
    // Make blue version take 100% traffic
    registry.updateTrafficPercentage(name, blueVersion.version, 100);
    
    // Make problematic version inactive
    registry.updateServerStatus(name, problematicVersion, 'inactive');
    registry.updateTrafficPercentage(name, problematicVersion, 0);
    
    // Record rollback
    registry.recordRollback(name, problematicVersion, blueVersion.version, reason);
    
    return true;
  } catch (error) {
    logError(`Failed to roll back: ${error}`);
    return false;
  }
}

/**
 * Get MCP tools with version awareness
 */
export const getVersionedMCPTools = memoize(async (): Promise<Tool[]> => {
  try {
    // Initialize registry and traffic manager
    const registry = ServerRegistry.getInstance();
    await registry.initialize();
    
    const trafficManager = TrafficManager.getInstance();
    await trafficManager.initialize();
    
    // Get all server names
    const serverNames = registry.getServerNames();
    const allTools: Tool[] = [];
    
    // For each server, get tools from each active version
    for (const serverName of serverNames) {
      const client = await trafficManager.getClientForRequest(serverName);
      
      if (!client) {
        continue;
      }
      
      try {
        // Get tools from this server
        const capabilities = await client.getServerCapabilities();
        
        if (capabilities?.tools) {
          const toolsResponse = await client.request(
            { method: 'tools/list' },
            ListToolsResultSchema
          ) as ListToolsResult;
          
          // Add each tool to the list
          for (const tool of toolsResponse.tools) {
            const toolName = `mcp__${serverName}__${tool.name}`;
            
            allTools.push({
              ...MCPTool,
              name: toolName,
              async description() {
                return tool.description ?? `${tool.name} MCP tool`;
              },
              async prompt() {
                return tool.description ?? `${tool.name} MCP tool`;
              },
              inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
              async *call(args: Record<string, unknown>) {
                // Get client respecting traffic distribution
                const client = await trafficManager.getClientForRequest(serverName);
                
                if (!client) {
                  throw new Error(`Failed to connect to MCP server ${serverName}`);
                }
                
                try {
                  // Call the tool on the server
                  const result = await client.callTool(
                    {
                      name: tool.name,
                      arguments: args,
                    },
                    CallToolResultSchema
                  );
                  
                  // Process the result
                  let data: ToolResultBlockParam['content'];
                  
                  if ('isError' in result && result.isError) {
                    throw new Error(result.error || 'Unknown error from MCP server');
                  }
                  
                  // Handle toolResult-type response
                  if ('toolResult' in result) {
                    data = String(result.toolResult);
                  }
                  // Handle content array response
                  else if ('content' in result && Array.isArray(result.content)) {
                    data = result.content.map(item => {
                      if (item.type === 'image') {
                        return {
                          type: 'image',
                          source: {
                            type: 'base64',
                            data: String(item.data),
                            media_type: item.mimeType as ImageBlockParam.Source['media_type'],
                          },
                        };
                      }
                      return item;
                    });
                  } else {
                    throw new Error(`Unexpected response format from tool ${tool.name}`);
                  }
                  
                  yield {
                    type: 'result' as const,
                    data,
                    resultForAssistant: data,
                  };
                } catch (error) {
                  logError(`Error calling tool ${toolName}: ${error}`);
                  throw error;
                }
              },
              userFacingName() {
                return `${serverName}:${tool.name} (MCP)`;
              },
            });
          }
        }
      } catch (error) {
        logError(`Failed to get tools from ${serverName}: ${error}`);
      }
    }
    
    return allTools;
  } catch (error) {
    logError(`Failed to get versioned MCP tools: ${error}`);
    return [];
  }
});

/**
 * Run a command respecting blue/green deployment traffic rules
 */
export async function runVersionedCommand(
  serverName: string,
  commandName: string,
  args: Record<string, string>,
  versionConstraint?: string
): Promise<any> {
  try {
    // Get client respecting traffic distribution
    const trafficManager = TrafficManager.getInstance();
    await trafficManager.initialize();
    
    const client = await trafficManager.getClientForRequest(serverName, versionConstraint);
    
    if (!client) {
      throw new Error(`Failed to connect to MCP server ${serverName}`);
    }
    
    // Run the command
    return await client.getPrompt({
      name: commandName,
      arguments: args
    });
  } catch (error) {
    logError(`Failed to run command ${commandName} on ${serverName}: ${error}`);
    throw error;
  }
}
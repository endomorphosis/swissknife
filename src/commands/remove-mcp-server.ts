/**
 * Command to remove an MCP server from the configuration
 */
import type { Command, LocalCommand } from '../types/command.js';
import { removeMcpServer, ensureConfigScope } from '../services/mcpClient.js';

const removeMcpServerCommand: LocalCommand = {
  type: 'local',
  name: 'remove-mcp-server',
  description: 'Remove a Model Context Protocol (MCP) server',
  options: [
    {
      name: 'scope',
      type: 'string',
      description: 'Scope for the server configuration (project, global, mcprc)',
      required: false,
    },
  ],
  isEnabled: true,
  isHidden: false,
  args: [
    {
      name: 'name',
      description: 'Name of the MCP server to remove',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const name = args.name;
    const configScope = ensureConfigScope(options.scope);

    if (!name) {
      throw new Error('Server name is required');
    }

    try {
      // Remove the server
      removeMcpServer(name, configScope);
      return `⎿  Removed MCP server "${name}" (scope: ${configScope})`;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to remove MCP server "${name}": ${String(error)}`);
    }
  },
  userFacingName() {
    return 'remove-mcp-server';
  },
};

export default removeMcpServerCommand;

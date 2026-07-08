/**
 * Command to add an MCP server to the configuration
 */
import type { Command, LocalCommand } from '../types/command.js';
import { addMcpServer, parseEnvVars, ensureConfigScope } from '../services/mcpClient.js';
import { McpServerConfig } from '../utils/config.js';

const addMcpServerCommand: LocalCommand = {
  type: 'local',
  name: 'add-mcp-server',
  description: 'Add a Model Context Protocol (MCP) server',
  options: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of server (stdio, sse)',
      required: true,
    },
    {
      name: 'command',
      type: 'string',
      description: 'Command to execute for stdio servers',
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
      description: 'Environment variables for the command (format: KEY=value, stdio servers only)',
      required: false,
    },
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
      description: 'Name of the MCP server',
      required: true,
    },
  ],
  async handler(options, context, args) {
    const name = args.name;
    const configScope = ensureConfigScope(options.scope);

    if (!name) {
      throw new Error('Server name is required');
    }

    if (options.type !== 'stdio' && options.type !== 'sse') {
      throw new Error('Server type must be either "stdio" or "sse"');
    }

    // Create server config based on type
    const serverConfig: McpServerConfig = options.type === 'stdio'
      ? {
          type: 'stdio',
          command: options.command || '',
          args: options.args || [],
          env: parseEnvVars(options.env),
        }
      : {
          type: 'sse',
          url: options.url || '',
        };

    // Validate required options based on type
    if (options.type === 'stdio' && !options.command) {
      throw new Error('Command is required for stdio servers');
    }

    if (options.type === 'sse' && !options.url) {
      throw new Error('URL is required for sse servers');
    }

    // Add the server
    addMcpServer(name, serverConfig, configScope);

    return `⎿  Added MCP server "${name}" with ${options.type} transport (scope: ${configScope})`;
  },
  userFacingName() {
    return 'add-mcp-server';
  },
};

export default addMcpServerCommand;

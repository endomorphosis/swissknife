import type { LocalCommand } from '../types/command.js';
import { listMCPServers, getClients } from '../services/mcpClient.js';
import { PRODUCT_COMMAND } from '../constants/product.js';
import chalk from 'chalk';
import { getTheme } from '../utils/theme.js';
import { logError } from '../utils/log.js';

const mcpCommand: LocalCommand = {
  type: 'local',
  name: 'mcp',
  description: 'Manage MCP server connections and show status',
  options: [
    {
      name: 'cwd',
      type: 'string',
      description: 'Working directory for the MCP server',
      required: false,
    }
  ],
  isEnabled: true,
  isHidden: false,
  async handler(args) {
    try {
      // If cwd is provided, start MCP server (handled separately in entrypoint)
      if (args.cwd) {
        // This is handled via the CLI entry point, so we just return a message
        return `⎿  Starting MCP server with working directory: ${args.cwd}`;
      }
      
      // Otherwise, show server status
      const servers = listMCPServers();
      const theme = getTheme();

      if (Object.keys(servers).length === 0) {
        return [
          `⎿  No MCP servers configured.`,
          `⎿  Use the following commands to manage MCP servers:`,
          `⎿  • ${PRODUCT_COMMAND} add-mcp-server <name> --type <type> --command <command> [--args <arg>...] [--env <key=value>...]`,
          `⎿  • ${PRODUCT_COMMAND} remove-mcp-server <name>`,
          `⎿  • ${PRODUCT_COMMAND} list-mcp-servers`,
        ].join('\n');
      }
      
      const clients = await getClients();

      // Sort servers by name and format status with colors
      const serverStatusLines = clients
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
        .map((client: any) => {
          const isConnected = client.type === 'connected';
          const status = isConnected ? 'connected' : 'disconnected';
          const coloredStatus = isConnected
            ? chalk.hex(theme.success)(status)
            : chalk.hex(theme.error)(status);
          
          let errorMessage = '';
          if (client.type === 'failed' && client.error) {
            errorMessage = ` (${client.error})`;
          }
          return `⎿  • ${client.name}: ${coloredStatus}${errorMessage}`;
        });

      // Add a header line explaining what to do if servers are disconnected
      let output = ['⎿  MCP Server Status:', ...serverStatusLines];
      
      // Add helpful information if any servers are disconnected
      if (clients.some((client: any) => client.type === 'failed')) {
        output.push('');
        output.push(`⎿  Note: Disconnected servers may need to be started manually.`);
        output.push(`⎿  Run \`${PRODUCT_COMMAND} list-mcp-servers\` to see server configurations.`);
      }

      return output.join('\n');
    } catch (error) {
      logError(error);
      return `⎿  Error getting MCP server status: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  userFacingName() {
    return 'mcp';
  },
};

export default mcpCommand;

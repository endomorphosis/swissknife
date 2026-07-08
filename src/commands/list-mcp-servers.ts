/**
 * Command to list configured MCP servers
 */
import type { Command, LocalCommand } from '../types/command.js';
import { listMCPServers } from '../services/mcpClient.js';
import chalk from 'chalk.js';
import { getTheme } from '../utils/theme.js';

const listMcpServersCommand: LocalCommand = {
  type: 'local',
  name: 'list-mcp-servers',
  description: 'List all configured Model Context Protocol (MCP) servers',
  options: [],
  isEnabled: true,
  isHidden: false,
  async handler() {
    const servers = listMCPServers();
    const theme = getTheme();
    
    if (Object.keys(servers).length === 0) {
      return '⎿  No MCP servers configured.';
    }
    
    // Format the output with details about each server
    const serverLines = Object.entries(servers).map(([name, config]) => {
      const details = config.type === 'stdio'
        ? `type: ${chalk.cyan('stdio')}, command: ${chalk.green(config.command)}, args: ${chalk.yellow(JSON.stringify(config.args))}`
        : `type: ${chalk.cyan('sse')}, url: ${chalk.blue(config.url)}`;
      
      return `⎿  • ${chalk.bold(name)}: ${details}`;
    });
    
    return ['⎿  Configured MCP Servers:', ...serverLines].join('\n');
  },
  userFacingName() {
    return 'list-mcp-servers';
  },
};

export default listMcpServersCommand;

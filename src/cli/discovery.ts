// src/cli/discovery.ts
export class CommandDiscovery {
  static discoverCommands(): CommandInfo[] {
    return [
      // AI Commands
      { category: 'ai', commands: ['sk-ai chat', 'sk-ai models', 'sk-ai status'] },
      // Task Commands  
      { category: 'tasks', commands: ['sk-task create', 'sk-task list', 'sk-task graph'] },
      // Tool Commands
      { category: 'tools', commands: ['sk-tools list', 'sk-tools execute', 'sk-tools info'] },
      // IPFS Commands
      { category: 'ipfs', commands: ['sk-ipfs add', 'sk-ipfs get', 'sk-ipfs status'] },
      // MCP Commands
      { category: 'mcp', commands: ['sk-mcp start', 'sk-mcp list', 'sk-mcp tools'] }
    ];
  }
}
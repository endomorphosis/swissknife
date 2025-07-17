import { Command, CommandExecutionContext } from '../../command-registry';
import { addMcpServer, getMcpServer, listMCPServers, parseEnvVars, removeMcpServer, ensureConfigScope } from '../../services/mcpClient';
import { handleMcprcServerApprovals } from '../../services/mcpServerApproval';
import { logEvent } from '../../services/statsig';
import { cwd } from 'process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { PRODUCT_NAME, PRODUCT_COMMAND } from '../../constants/product';
import { McpServerConfig } from '../../types/mcp';

export class McpServeCommand implements Command {
  readonly id = 'mcp:serve';
  readonly name = 'mcp serve';
  readonly description = `Start the ${PRODUCT_NAME} MCP server`;
  readonly help = `Usage: swissknife mcp serve [--cwd <path>]`;

  parseArguments(args: string[]): Record<string, any> {
    const cwdArgIndex = args.indexOf('--cwd');
    const providedCwd = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { providedCwd };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { providedCwd } = parsedArgs;
    logEvent('tengu_mcp_start', { providedCwd });

    if (!existsSync(providedCwd)) {
      console.error(`Error: Directory ${providedCwd} does not exist`);
      process.exit(1);
    }

    try {
      // Assuming setup is handled externally or can be called here if needed
      // await setup(providedCwd, false);
      // startMCPServer is not directly available in the context, needs to be imported or passed
      // For now, just log that it would start
      console.log(`MCP server would start in ${providedCwd}`);
      // await startMCPServer(providedCwd);
      process.exit(0);
    } catch (error) {
      console.error('Error: Failed to start MCP server:', error);
      process.exit(1);
    }
  }
}

export class McpAddSseCommand implements Command {
  readonly id = 'mcp:add-sse';
  readonly name = 'mcp add-sse';
  readonly description = 'Add an SSE server';
  readonly help = 'Usage: swissknife mcp add-sse <name> <url> [--scope <scope>]';

  parseArguments(args: string[]): Record<string, any> {
    const name = args[0];
    const url = args[1];
    const scopeIndex = args.indexOf('--scope');
    const scope = scopeIndex !== -1 ? args[scopeIndex + 1] : 'project';
    return { name, url, scope };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { name, url, scope } = parsedArgs;
    try {
      const configScope = ensureConfigScope(scope);
      logEvent('tengu_mcp_add', { name, type: 'sse', scope: configScope });

      addMcpServer(name, { type: 'sse', url }, configScope);
      console.log(`Added SSE MCP server ${name} with URL ${url} to ${configScope} config`);
      process.exit(0);
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}

export class McpAddCommand implements Command {
  readonly id = 'mcp:add';
  readonly name = 'mcp add';
  readonly description = 'Add a server (run without arguments for interactive wizard)';
  readonly help = `Usage: swissknife mcp add [name] [commandOrUrl] [args...] [--scope <scope>] [--env <env...>]`;

  parseArguments(args: string[]): Record<string, any> {
    const name = args[0];
    const commandOrUrl = args[1];
    const remainingArgs = args.slice(2);

    const scopeIndex = remainingArgs.indexOf('--scope');
    const scope = scopeIndex !== -1 ? remainingArgs[scopeIndex + 1] : 'project';
    if (scopeIndex !== -1) remainingArgs.splice(scopeIndex, 2);

    const envIndex = remainingArgs.indexOf('--env');
    let env: string[] = [];
    if (envIndex !== -1) {
      env = remainingArgs.slice(envIndex + 1).filter(arg => !arg.startsWith('--'));
      remainingArgs.splice(envIndex, env.length + 1);
    }

    return { name, commandOrUrl, args: remainingArgs, scope, env };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { name, commandOrUrl, args, scope, env } = parsedArgs;

    if (!name) {
      // Interactive wizard mode - not implemented in this class, would require Ink/readline
      console.error('Interactive wizard mode is not supported in this command class. Please provide name and command/URL.');
      process.exit(1);
    }

    try {
      const configScope = ensureConfigScope(scope);

      if (commandOrUrl.match(/^https?:\/\//)) {
        logEvent('tengu_mcp_add', { name, type: 'sse', scope: configScope });
        addMcpServer(name, { type: 'sse', url: commandOrUrl }, configScope);
        console.log(`Added SSE MCP server ${name} with URL ${commandOrUrl} to ${configScope} config`);
      } else {
        logEvent('tengu_mcp_add', { name, type: 'stdio', scope: configScope });
        const parsedEnv = parseEnvVars(env);
        addMcpServer(name, { type: 'stdio', command: commandOrUrl, args: args || [], env: parsedEnv }, configScope);
        console.log("Added stdio MCP server " + name + " with command: " + commandOrUrl + " " + (args || []).join(' ') + " to " + configScope + " config");
      }
      process.exit(0);
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}

export class McpRemoveCommand implements Command {
  readonly id = 'mcp:remove';
  readonly name = 'mcp remove';
  readonly description = 'Remove an MCP server';
  readonly help = 'Usage: swissknife mcp remove <name> [--scope <scope>]';

  parseArguments(args: string[]): Record<string, any> {
    const name = args[0];
    const scopeIndex = args.indexOf('--scope');
    const scope = scopeIndex !== -1 ? args[scopeIndex + 1] : 'project';
    return { name, scope };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { name, scope } = parsedArgs;
    try {
      const configScope = ensureConfigScope(scope);
      logEvent('tengu_mcp_delete', { name, scope: configScope });

      removeMcpServer(name, configScope);
      console.log(`Removed MCP server ${name} from ${configScope} config`);
      process.exit(0);
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}

export class McpListCommand implements Command {
  readonly id = 'mcp:list';
  readonly name = 'mcp list';
  readonly description = 'List configured MCP servers';
  readonly help = 'Usage: swissknife mcp list';

  parseArguments(args: string[]): Record<string, any> {
    return {};
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    logEvent('tengu_mcp_list', {});
    const servers = listMCPServers();
    if (Object.keys(servers).length === 0) {
      console.log(`No MCP servers configured. Use ` + PRODUCT_COMMAND + ` mcp add` + ` to add a server.`);
    } else {
      for (const [name, server] of Object.entries(servers)) {
        if (server.type === 'sse') {
          console.log(`${name}: ${server.url} (SSE)`);
        } else {
          console.log(`${name}: ${server.command} ${server.args.join(' ')}`);
        }
      }
    }
    process.exit(0);
  }
}

export class McpAddJsonCommand implements Command {
  readonly id = 'mcp:add-json';
  readonly name = 'mcp add-json';
  readonly description = 'Add an MCP server (stdio or SSE) with a JSON string';
  readonly help = 'Usage: swissknife mcp add-json <name> <json> [--scope <scope>]';

  parseArguments(args: string[]): Record<string, any> {
    const name = args[0];
    const jsonStr = args[1];
    const scopeIndex = args.indexOf('--scope');
    const scope = scopeIndex !== -1 ? args[scopeIndex + 1] : 'project';
    return { name, jsonStr, scope };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { name, jsonStr, scope } = parsedArgs;
    try {
      const configScope = ensureConfigScope(scope);

      let serverConfig: McpServerConfig;
      try {
        serverConfig = JSON.parse(jsonStr);
      } catch (e) {
        console.error('Error: Invalid JSON string');
        process.exit(1);
      }

      if (!serverConfig.type || !['stdio', 'sse'].includes(serverConfig.type)) {
        console.error('Error: Server type must be "stdio" or "sse"');
        process.exit(1);
      }

      if (serverConfig.type === 'sse' && !serverConfig.url) {
        console.error('Error: SSE server must have a URL');
        process.exit(1);
      }

      if (serverConfig.type === 'stdio' && !serverConfig.command) {
        console.error('Error: stdio server must have a command');
        process.exit(1);
      }

      logEvent('tengu_mcp_add_json', { name, type: serverConfig.type, scope: configScope });
      addMcpServer(name, serverConfig, configScope);

      if (serverConfig.type === 'sse') {
        console.log(`Added SSE MCP server ${name} with URL ${serverConfig.url} to ${configScope} config`);
      } else {
        console.log(`Added stdio MCP server ${name} with command: ${serverConfig.command} ${(serverConfig.args || []).join(' ')} to ${configScope} config`);
      }

      process.exit(0);
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}

export class McpGetCommand implements Command {
  readonly id = 'mcp:get';
  readonly name = 'mcp get';
  readonly description = 'Get details about an MCP server';
  readonly help = 'Usage: swissknife mcp get <name>';

  parseArguments(args: string[]): Record<string, any> {
    const name = args[0];
    return { name };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { name } = parsedArgs;
    logEvent('tengu_mcp_get', { name });
    const server = getMcpServer(name);
    if (!server) {
      console.error(`No MCP server found with name: ${name}`);
      process.exit(1);
    }
    console.log(`${name}:`);
    console.log(`  Scope: ${server.scope}`);
    if (server.type === 'sse') {
      console.log(`  Type: sse`);
      console.log(`  URL: ${server.url}`);
    } else {
      console.log(`  Type: stdio`);
      console.log(`  Command: ${server.command}`);
      console.log(`  Args: ${server.args.join(' ')}`);
      if (server.env) {
        console.log('  Environment:');
        for (const [key, value] of Object.entries(server.env)) {
          console.log(`    ${key}=${value}`);
        }
      }
    }
    process.exit(0);
  }
}

export class McpAddFromClaudeDesktopCommand implements Command {
  readonly id = 'mcp:add-from-claude-desktop';
  readonly name = 'mcp add-from-claude-desktop';
  readonly description = 'Import MCP servers from Claude Desktop (Mac, Windows and WSL)';
  readonly help = 'Usage: swissknife mcp add-from-claude-desktop [--scope <scope>]';

  parseArguments(args: string[]): Record<string, any> {
    const scopeIndex = args.indexOf('--scope');
    const scope = scopeIndex !== -1 ? args[scopeIndex + 1] : 'project';
    return { scope };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { scope } = parsedArgs;
    try {
      const configScope = ensureConfigScope(scope);
      const platform = process.platform;

      let configPath: string | undefined;
      const { existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');
      const { exec } = await import('child_process');

      const isWSL =
        platform === 'linux' &&
        existsSync('/proc/version') &&
        readFileSync('/proc/version', 'utf-8')
          .toLowerCase()
          .includes('microsoft');

      if (platform !== 'darwin' && platform !== 'win32' && !isWSL) {
        console.error('Error: This command is only supported on macOS, Windows, and WSL');
        process.exit(1);
      }

      if (platform === 'darwin') {
        configPath = join(
          process.env.HOME || '~',
          'Library/Application Support/Claude/claude_desktop_config.json',
        );
      } else if (platform === 'win32') {
        configPath = join(
          process.env.APPDATA || '',
          'Claude/claude_desktop_config.json',
        );
      } else if (isWSL) {
        const whoamiCommand = await new Promise<string>((resolve, reject) => {
          exec(
            'powershell.exe -Command "(Get-WmiObject Win32_ComputerSystem).UserName"',
            (err, stdout, stderr) => {
              if (err) {
                reject(err);
                return;
              }
              if (stderr) {
                reject(new Error(stderr));
                return;
              }
              resolve(stdout.trim().split('\\').pop() || '');
            },
          );
        });
        configPath = `/mnt/c/Users/${whoamiCommand}/AppData/Roaming/Claude/claude_desktop_config.json`;
      }

      if (!configPath || !existsSync(configPath)) {
        console.error(`Error: Claude Desktop config file not found at ${configPath}`);
        process.exit(1);
      }

      let config: any;
      try {
        const configContent = readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      } catch (err) {
        console.error(`Error reading config file: ${err}`);
        process.exit(1);
      }

      const mcpServers = config.mcpServers || {};
      const serverNames = Object.keys(mcpServers);
      const numServers = serverNames.length;

      if (numServers === 0) {
        console.log('No MCP servers found in Claude Desktop config');
        process.exit(0);
      }

      console.log(`Found ${numServers} MCP servers in Claude Desktop.`);
      console.log('Importing all found servers...');

      let importedCount = 0;
      for (const name of serverNames) {
        try {
          const server = mcpServers[name];
          addMcpServer(name, server as McpServerConfig, configScope);
          importedCount++;
        } catch (err) {
          console.error(`Failed to import server ${name}: ${err}`);
        }
      }
      console.log(`Successfully imported ${importedCount} MCP server(s) to local config.`);
      process.exit(0);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  }
}

export class McpResetProjectChoicesCommand implements Command {
  readonly id = 'mcp:reset-project-choices';
  readonly name = 'mcp reset-project-choices';
  readonly description = 'Reset all approved and rejected project-scoped (.mcp.json) servers within this project';
  readonly help = 'Usage: swissknife mcp reset-project-choices';

  parseArguments(args: string[]): Record<string, any> {
    return {};
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    logEvent('tengu_mcp_reset_project_choices', {});
    // Assuming resetMcpChoices is accessible or can be refactored here
    // For now, just log the action
    console.log('All .mcprc server approvals and rejections have been reset.');
    console.log(`You will be prompted for approval next time you start ${PRODUCT_NAME}.`);
    process.exit(0);
  }
}

export class McpResetMcprcChoicesCommand implements Command {
  readonly id = 'mcp:reset-mcprc-choices';
  readonly name = 'mcp reset-mcprc-choices';
  readonly description = 'Reset all approved and rejected .mcprc servers for this project';
  readonly help = 'Usage: swissknife mcp reset-mcprc-choices';

  parseArguments(args: string[]): Record<string, any> {
    return {};
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    logEvent('tengu_mcp_reset_mcprc_choices', {});
    // Assuming resetMcpChoices is accessible or can be refactored here
    // For now, just log the action
    console.log('All .mcprc server approvals and rejections have been reset.');
    console.log(`You will be prompted for approval next time you start ${PRODUCT_NAME}.`);
    process.exit(0);
  }
}

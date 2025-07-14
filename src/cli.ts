import React from 'react'; // Needed if using Ink components directly for rendering
import { render, Box, Text, RenderOptions } from 'ink'; // Example Ink components
import { CommandRegistry, CommandExecutionContext } from './command-registry';
import { ConfigManager } from './config/manager';
import { logger } from './utils/logger';
import { StorageFactory } from './storage/factory';
import { StorageProvider } from './types/storage'; 
import { TaskManager } from './tasks/manager'; 
import { Agent } from './ai/agent/agent'; // Import Agent
import { ModelRegistry } from './ai/models/registry'; // Import ModelRegistry
import { IModel, AgentOptions } from './types/ai'; // Import Model type
// Import command implementations
import { TaskCreateCommand } from './cli/commands/taskCreateCommand'; 
import { AiChatCommand } from './cli/commands/aiChatCommand'; 
import { StorageAddCommand } from './cli/commands/storageAddCommand'; 
import { TaskStatusCommand } from './cli/commands/taskStatusCommand'; 
import { TaskListCommand } from './cli/commands/taskListCommand'; 
import { ConfigGetCommand, ConfigSetCommand, ConfigRemoveCommand, ConfigListCommand } from './cli/commands/configCommands';
import { ApprovedToolsListCommand, ApprovedToolsRemoveCommand } from './cli/commands/approvedToolsCommands';
import { McpServeCommand, McpAddSseCommand, McpAddCommand, McpRemoveCommand, McpListCommand, McpAddJsonCommand, McpGetCommand, McpAddFromClaudeDesktopCommand, McpResetProjectChoicesCommand, McpResetMcprcChoicesCommand } from './cli/commands/mcpCommands';
import { StorachaClientCommand, StorachaUcnCommand, StorachaCapabilitiesCommand, StorachaAccessCommand } from './cli/commands/storachaCommands';
import { DoctorCommand } from './cli/commands/doctorCommand';
import { UpdateCommand } from './cli/commands/updateCommand';
import { LogCommand } from './cli/commands/logCommand';
import { ResumeCommand } from './cli/commands/resumeCommand';
import { ErrorCommand } from './cli/commands/errorCommand';
import { ContextGetCommand, ContextSetCommand, ContextListCommand, ContextRemoveCommand } from './cli/commands/contextCommands';

// Import Phase 5 commands
import { 
  registerPhase5Commands 
} from './cli/commands/index';
import { CLIUXEnhancer } from './ux/cli-ux-enhancer';

/**
 * Main CLI application class.
 * Orchestrates command parsing, execution, and output rendering.
 */
export class CLI {
  private commandRegistry: CommandRegistry;
  private configManager: ConfigManager;
  // Core services needed in the execution context
  private agent: Agent; 
  private taskManager: TaskManager;
  private storage: StorageProvider;
  private modelRegistry: ModelRegistry;
  private defaultModel: IModel; // Store the default model
  private program: any; // Commander program

  constructor() {
    logger.debug('Initializing CLI...');
    this.commandRegistry = new CommandRegistry();
    this.configManager = ConfigManager.getInstance(); 
    this.modelRegistry = ModelRegistry.getInstance(); 
    
    // Initialize core services
    this.storage = StorageFactory.createStorage(); 
    
    const model = this.modelRegistry.getDefaultModel();
    if (!model) {
        logger.error("No default AI model found or configured. Cannot initialize Agent.");
        throw new Error("CLI initialization failed: No default model available."); 
    }
    this.defaultModel = model; 

    this.taskManager = new TaskManager({ storage: this.storage });
    
    this.agent = new Agent({
        model: this.defaultModel, 
        // storage: this.storage, // Agent does not directly take storage
        // config: this.configManager, // Agent does not directly take config
        // TODO: Pass tools dynamically or from config later
        // tools: [new EchoTool()], 
        // TODO: Make useGraphOfThought configurable
        // useGraphOfThought: this.configManager.get('ai.useGoT') 
    } as AgentOptions); 

    this.registerCommands();
    logger.info('CLI initialized.');
  }

  /**
   * Register all available commands.
   */
  private registerCommands(): void {    logger.debug('Registering commands...');
    
    // Register core commands
    this.commandRegistry.register(new TaskCreateCommand());
    this.commandRegistry.register(new AiChatCommand());
    this.commandRegistry.register(new StorageAddCommand());
    this.commandRegistry.register(new TaskStatusCommand());
    this.commandRegistry.register(new TaskListCommand());
    this.commandRegistry.register(new ConfigGetCommand());
    this.commandRegistry.register(new ConfigSetCommand());
    this.commandRegistry.register(new ConfigRemoveCommand());
    this.commandRegistry.register(new ConfigListCommand());
    this.commandRegistry.register(new ApprovedToolsListCommand());
    this.commandRegistry.register(new ApprovedToolsRemoveCommand());
    this.commandRegistry.register(new McpServeCommand());
    this.commandRegistry.register(new McpAddSseCommand());
    this.commandRegistry.register(new McpAddCommand());
    this.commandRegistry.register(new McpRemoveCommand());
    this.commandRegistry.register(new McpListCommand());
    this.commandRegistry.register(new McpAddJsonCommand());
    this.commandRegistry.register(new McpGetCommand());
    this.commandRegistry.register(new McpAddFromClaudeDesktopCommand());
    this.commandRegistry.register(new McpResetProjectChoicesCommand());
    this.commandRegistry.register(new McpResetMcprcChoicesCommand());
    this.commandRegistry.register(new StorachaClientCommand());
    this.commandRegistry.register(new StorachaUcnCommand());
    this.commandRegistry.register(new StorachaCapabilitiesCommand());
    this.commandRegistry.register(new StorachaAccessCommand());
    this.commandRegistry.register(new DoctorCommand());
    this.commandRegistry.register(new UpdateCommand());
    this.commandRegistry.register(new LogCommand());
    this.commandRegistry.register(new ResumeCommand());
    this.commandRegistry.register(new ErrorCommand());
    this.commandRegistry.register(new ContextGetCommand());
    this.commandRegistry.register(new ContextSetCommand());
    this.commandRegistry.register(new ContextListCommand());
    this.commandRegistry.register(new ContextRemoveCommand());
    
    // Register Phase 5 commands via the helper function
    this.registerPhase5Commands();
  }
  
  /**
   * Register Phase 5 commands separately for organization
   */
  private registerPhase5Commands(): void {
    logger.debug('Registering Phase 5 commands...');
    
    // Use Commander to register commands with the program
    const { Command } = require('commander');
    const program = new Command();
    registerPhase5Commands(program);
    
    // Add the Commander program to our application
    // This approach allows us to mix our custom command registry with Commander's
    this.program = program;
  }

  /**
   * Creates an execution context for commands.
   * @returns The execution context with shared services.
   */
  private createExecutionContext(): CommandExecutionContext {
    return {
      config: this.configManager,
      taskManager: this.taskManager,
      agent: this.agent,
      getService: <T>(serviceName: string): T => {
        switch (serviceName) {
          case 'TaskManager':
            return this.taskManager as T;
          case 'Agent':
            return this.agent as T;
          case 'StorageProvider':
            return this.storage as T;
          default:            throw new Error(`Service not found: ${serviceName}`);
        }
      },
    };
  }

  /**
   * Runs the CLI with the given command-line arguments.
   */
  async run(argv: string[]): Promise<void> {
    logger.debug('CLI run started with args:', argv);
    if (argv.length === 0 || ['-h', '--help', '--h'].includes(argv[0])) { 
      this.renderHelp();
      return;
    }

    const commandName = argv[0];
    const commandArgs = argv.slice(1);

    if (commandArgs.includes('-h') || commandArgs.includes('--help')) {
       this.renderHelp(commandName);
       return;
    }

    const command = this.commandRegistry.getCommand(commandName);
    if (!command) {
      this.renderError(`Unknown command: ${commandName}`);
      this.renderHelp(); 
      process.exitCode = 1; 
      return;
    }

    // Prepare execution context
    const context: CommandExecutionContext = this.createExecutionContext();

    try {
      logger.debug(`Parsing arguments for command: ${commandName}`);
      const parsedArgs = command.parseArguments(commandArgs); 
      logger.debug(`Parsed arguments:`, parsedArgs);

      logger.info(`Executing command: ${commandName}`);
      const result = await command.execute(parsedArgs, context);
      logger.info(`Command ${commandName} executed successfully.`);

      this.renderResult(result);
      process.exitCode = 0; 

    } catch (error: any) {
      logger.error(`Error executing command ${commandName}:`, error);
      this.renderError(error.message || 'An unknown error occurred.');
      process.exitCode = 1; 
    }
  }

  /** Renders the command result to the console. */
  private renderResult(result: any): void {
    if (result !== undefined && result !== null) {
        // Basic pretty printing for arrays of objects (like task list)
        if (Array.isArray(result)) {
           console.table(result); // Use console.table for better array display
        } else {
           const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
           console.log(output); 
        }
    } else {
        console.log("Command completed successfully.");
    }
  }

  /** Renders an error message to the console. */
  private renderError(message: string): void {
     console.error(`Error: ${message}`);
  }

  /** Renders general help information or help for a specific command. */
  private renderHelp(commandName?: string): void {
     logger.info(`Rendering help${commandName ? ` for ${commandName}` : ''}...`);
     
     if (commandName) {
        const command = this.commandRegistry.getCommand(commandName);
        if (command) {
           let helpText = `Usage: swissknife ${command.name} [options]\n\n`;
           helpText += `${command.description}\n`;
           if (command.help) {
              helpText += `\n${command.help}\n`;
           }
           // TODO: Add details based on command.argumentParserOptions
           console.log(helpText);
           return;
        } else {
           this.renderError(`Command "${commandName}" not found.`);
        }
     }
     
     let helpText = "SwissKnife CLI - Unified Tool\n\nUsage: swissknife <command> [options]\n\nAvailable Commands:\n";
     const commands = this.commandRegistry.listCommands();
     if (commands.length === 0) {
        helpText += "  (No commands registered yet)\n";
     } else {
        // Basic formatting for alignment
        const maxNameLength = Math.max(...commands.map(cmd => cmd.name.length));
        commands.forEach(cmd => {
           const padding = ' '.repeat(maxNameLength - cmd.name.length + 4); // 4 spaces padding
           helpText += `  ${cmd.name}${padding}${cmd.description}\n`;
        });
     }
     helpText += "\nUse 'swissknife <command> --help' for more information on a specific command.";
     
     console.log(helpText);
  }

  /** Static factory method for creating and setting up the CLI instance. */
  static async create(): Promise<CLI> {
    const cli = new CLI();
    return cli;
  }
}

// src/cli.ts

import { parseCommandLine } from './commands/parser';
import { createExecutionContext } from './commands/context';
import { initializeIntegrationFramework } from './integration/init';

// Import core commands to ensure they're registered
import './commands/help';
import './commands/version';

/**
 * Main CLI entry point
 */
async function main(): Promise<number> {
  try {
    // Initialize configuration
    const configManager = ConfigManager.getInstance();
    await configManager.initialize();
    
    // Initialize integration framework (bridges to other components)
    await initializeIntegrationFramework();
    
    // Parse command line arguments
    const parsedCommand = parseCommandLine(process.argv);
    
    // If no command was provided, show help
    if (!parsedCommand) {
      const registry = new CommandRegistry();
      const helpCommand = registry.getCommand('help');
      
      if (helpCommand) {
        const context = createExecutionContext({});
return await helpCommand.execute({}, context);
      } else {
        console.error('No command specified. Run with --help for usage information.');
        return 1;
      }
    }
    
    // Execute the parsed command with its arguments
    const { command, args } = parsedCommand;
    const context = createExecutionContext(args);
    
    return await command.execute(args, context);
  } catch (error) {
    console.error('Error:', error);    return 1;
  }
}

// Run the CLI and exit with appropriate exit code
main().then(
  (exitCode) => process.exit(exitCode),
  (error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }
);
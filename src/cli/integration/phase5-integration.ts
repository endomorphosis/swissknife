// src/cli/integration/phase5-integration.ts
// This file integrates Phase 5 components with the existing CLI framework

import { CommandRegistry } from '../command-registry';
import { Command } from 'commander';
import { registerPhase5Commands } from '../commands/index';
import { logger } from '../utils/logger';
import { CLIUXEnhancer } from '../ux/cli-ux-enhancer';

/**
 * Adapter command that bridges between our custom command registry and 
 * the Commander-based Phase 5 commands.
 */
class Phase5CommandAdapter {
  private static commanderProgram: Command;
  
  /**
   * Initialize the adapter with Commander program instance
   */
  public static initialize(): void {
    logger.info('Initializing Phase 5 command adapter...');
    
    // Create a new Commander program for Phase 5 commands
    this.commanderProgram = new Command();
    
    // Register all Phase 5 commands with the Commander program
    registerPhase5Commands(this.commanderProgram);
    
    logger.info('Phase 5 commands registered with Commander');
  }
  
  /**
   * Register a bridge command in our custom registry for each Commander command
   * @param registry Our custom command registry
   */
  public static registerBridgeCommands(registry: CommandRegistry): void {
    if (!this.commanderProgram) {
      this.initialize();
    }
    
    // Access the Commander program's commands
    const commanderCommands = this.commanderProgram.commands;
    
    // Register each Commander command as a bridge command in our registry
    commanderCommands.forEach(cmdObj => {
      const cmdName = cmdObj.name();
      const cmdDesc = cmdObj.description();
      
      // Create a bridge command wrapper
      class BridgeCommand implements import('../../command-registry.js').Command {
        readonly name = cmdName;
        readonly description = cmdDesc;
        readonly argumentParserOptions = {};
        
        parseArguments(args: string[]): Record<string, any> {
          // Just pass through the args; Commander will handle parsing
          return { _: args };
        }
        
        async execute(parsedArgs: Record<string, any>, context: any): Promise<any> {
          try {
            // Prepare args for Commander
            const cmdArgs = ['node', 'swissknife', cmdName, ...(parsedArgs._ || [])];
            
            // Execute the command using Commander
            CLIUXEnhancer.formatInfo(`Executing Phase 5 command: ${cmdName}`);
            await Phase5CommandAdapter.commanderProgram.parseAsync(cmdArgs, { from: 'user' });
            
            return true;
          } catch (error) {
            CLIUXEnhancer.formatError(`Error executing Phase 5 command: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
          }
        }
      }
      
      // Register the bridge command
      registry.register(new BridgeCommand());
      logger.debug(`Registered bridge command for Phase 5 command: ${cmdName}`);
    });
    
    logger.info('Phase 5 bridge commands registered with custom registry');
  }
}

/**
 * Initialize and register all Phase 5 components with the existing CLI
 * @param registry The command registry to register commands with
 */
export function initializePhase5(registry?: CommandRegistry): void {
  try {
    logger.info('Initializing Phase 5 components...');
    
    // Initialize the adapter
    Phase5CommandAdapter.initialize();
    
    // Register bridge commands if registry is provided
    if (registry) {
      Phase5CommandAdapter.registerBridgeCommands(registry);
    }
    
    logger.info('Phase 5 components initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize Phase 5 components: ${error instanceof Error ? error.message : String(error)}`);
  }
}

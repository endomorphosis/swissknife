// src/commands/registry.ts
import { ExecutionContext } from './context.js';
import { LogManager } from '../utils/logging/manager';

import { Command, CommandOption, CommandExecutionContext } from '../types/command';

export interface LazyCommand {
  id: string;
  loader: () => Promise<Command>;
}

export class CommandRegistry {
  private static instance: CommandRegistry;
  private commands: Map<string, Command | LazyCommand> = new Map();
  private aliases: Map<string, string> = new Map();
  private logger = LogManager.getInstance();
  
  private constructor() {}
  
  static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry();
    }
    return CommandRegistry.instance;
  }
  
  registerCommand(command: Command | LazyCommand): void {
    // Validate command structure
    if ('id' in command && 'loader' in command) {
      // Lazy command
      this.commands.set(command.id, command);
      this.logger.debug(`Registered lazy command: ${command.id}`);
    } else if ('id' in command && 'handler' in command) {
      // Eager command
      this.commands.set(command.id, command as Command);
      this.logger.debug(`Registered command: ${command.id}`);
      
      // Register aliases if provided
      if ((command as Command).aliases) {
        for (const alias of (command as Command).aliases!) {
          this.aliases.set(alias, command.id);
          this.logger.debug(`Registered alias '${alias}' for command: ${command.id}`);
        }
      }
    } else {
      // Safely access command.id for the error message
      const commandId = (command as any).id || 'unknown';
      throw new Error(`Invalid command definition: ${commandId}`);
    }
  }
  
  async getCommand(id: string): Promise<Command | undefined> {
    const command = this.commands.get(id);
    
    if (!command) {
      // Check aliases
      const aliasedId = this.aliases.get(id);
      if (aliasedId) {
        return this.getCommand(aliasedId);
      }
      
      // Command not found
      return undefined;
    }
    
    if ('loader' in command) {
      // Lazy command, load it
      const loadedCommand = await command.loader();
      this.commands.set(id, loadedCommand);
      return loadedCommand;
    }
    
    return command as Command;
  }
  
  async getAllCommands(): Promise<Command[]> {
    const commands = Array.from(this.commands.values());
    return await Promise.all(commands.map(async (cmd) => {
      if ('loader' in cmd) {
        return await cmd.loader();
      }
      return cmd as Command;
    }));
  }
  
  async getCommandsByCategory(category: string): Promise<Command[]> {
    const allCommands = await this.getAllCommands();
    return allCommands.filter(cmd => cmd.category === category);
  }

  async getCategories(): Promise<string[]> {
    const allCommands = await this.getAllCommands();
    const categories = new Set<string>();
    
    allCommands.forEach(cmd => {
      if (cmd.category) {
        categories.add(cmd.category);
      }
    });
    
    return Array.from(categories).sort();
  }
  
  async executeCommand(id: string, args: any, context: ExecutionContext): Promise<number> {
    const command = await this.getCommand(id);
    if (!command) {
      this.logger.error(`Command not found: ${id}`);
      return 1; // Error exit code
    }
    
    try {
      // Execute command handler
      this.logger.debug(`Executing command: ${id}`);
      return await command.handler(args, context);
    } catch (error) {
      this.logger.error(`Error executing command ${id}:`, error);
      return 1; // Error exit code
    }
  }
}

// Helper function for registering commands
export function registerCommand(command: Command): void {
  CommandRegistry.getInstance().registerCommand(command);
}

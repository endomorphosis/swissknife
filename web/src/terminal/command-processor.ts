export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export interface CommandHandler {
  execute(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult>;
}

export class CommandProcessor {
  private commands: Map<string, CommandHandler> = new Map();
  private aliases: Map<string, string> = new Map();
  // private history: CommandHistory; // Assuming CommandHistory is a separate class
  
  register(commandName: string, handler: CommandHandler | ((args: string[], flags: Record<string, string | boolean>) => Promise<CommandResult>)): void {
    if (typeof handler === 'function') {
      this.commands.set(commandName, { execute: handler });
    } else {
      this.commands.set(commandName, handler);
    }
  }

  registerAlias(alias: string, commandName: string): void {
    this.aliases.set(alias, commandName);
  }

  async execute(input: string): Promise<CommandResult> {
    const parsed = this.parseCommand(input);
    const handler = this.resolveHandler(parsed.command);
    
    if (!handler) {
      return this.handleUnknownCommand(parsed.command);
    }
    
    try {
      const result = await handler.execute(parsed.args, parsed.flags);
      // this.history.add(input, result); // Add to history if CommandHistory is implemented
      return result;
    } catch (error: any) {
      return {
        success: false,
        output: `Error: ${error.message || error}`,
        exitCode: 1
      };
    }
  }
  
  private parseCommand(input: string): { command: string; args: string[]; flags: Record<string, string | boolean> } {
    const parts = input.split(/\s+/);
    const command = parts[0];
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('--')) {
        const [flagName, flagValue] = part.substring(2).split('=');
        flags[flagName] = flagValue || true; // Handle --flag or --flag=value
      } else if (part.startsWith('-')) {
        const flagName = part.substring(1);
        flags[flagName] = true;
      } else {
        args.push(part);
      }
    }
    return { command, args, flags };
  }

  private resolveHandler(command: string): CommandHandler | null {
    // Check aliases first
    const aliased = this.aliases.get(command);
    if (aliased) {
      command = aliased;
    }
    
    return this.commands.get(command) || null;
  }

  private handleUnknownCommand(command: string): CommandResult {
    return {
      success: false,
      output: `Unknown command: ${command}. Type 'help' for a list of commands.`,
      exitCode: 127 // Standard exit code for command not found
    };
  }
}

import { CommandRegistry, Command, CommandOption, CommandExecutionContext } from '@/command-registry';

/**
 * Represents the result of parsing a command line.
 */
export interface ParsedCommandLine {
  command: Command;
  args: Record<string, any>;
  subcommands: string[];
}

/**
 * Parses command-line arguments and identifies the corresponding command.
 */
export class CommandParser {
  private registry: CommandRegistry;

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  /**
   * Parses raw command-line arguments to find a matching command and its arguments.
   * @param argv The raw command-line arguments (e.g., process.argv).
   * @returns A ParsedCommandLine object if a command is found, otherwise null.
   */
  parseCommandLine(argv: string[]): ParsedCommandLine | null {
    // Remove 'node' and 'script.js' from argv
    const args = argv.slice(2);

    if (args.length === 0) {
      return null; // No command provided
    }

    let currentCommandName = '';
    let command: Command | undefined;
    const subcommands: string[] = [];
    let commandArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('-')) {
        // This is an option, so the command part is over
        commandArgs = args.slice(i);
        break;
      }

      // Try to find a command or subcommand
      const potentialCommandName = currentCommandName ? `${currentCommandName}:${arg}` : arg;
      const foundCommand = this.registry.getCommand(potentialCommandName);

      if (foundCommand) {
        command = foundCommand;
        currentCommandName = potentialCommandName;
        if (currentCommandName !== arg) {
          subcommands.push(arg);
        }
      } else if (command) {
        // If a command was already found, and the current arg is not a sub-command,
        // then it must be an argument for the found command.
        commandArgs = args.slice(i);
        break;
      } else {
        // No command found yet, and current arg is not an option.
        // This means the initial command is not registered.
        return null;
      }
    }

    if (!command) {
      return null; // No valid command found
    }

    // Parse arguments using the command's specific parser
    const parsedArgs = command.parseArguments(commandArgs);

    return {
      command,
      args: parsedArgs,
      subcommands,
    };
  }
}

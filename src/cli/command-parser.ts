import { CommandRegistry } from '../commands/registry';
import { Command } from '../types/command';

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
  async parseCommandLine(argv: string[]): Promise<ParsedCommandLine | null> {
    // Remove 'node' and 'script.js' from argv
    const args = argv.slice(2);

    if (args.length === 0) {
      return null; // No command provided
    }

    let commandPath: string[] = [];
    let command: Command | undefined;
    let remainingArgsIndex = 0;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('-')) {
        // This is an option, so the command part is over
        remainingArgsIndex = i;
        break;
      }

      const potentialCommandName = commandPath.length > 0 ? `${commandPath.join(':')}:${arg}` : arg;
      const foundCommand = await this.registry.getCommand(potentialCommandName);

      if (foundCommand) {
        command = foundCommand;
        commandPath.push(arg);
        remainingArgsIndex = i + 1;
      } else {
        // If the current arg is not part of a command path, then the command path is complete
        break;
      }
    }

    if (!command) {
      return null; // No valid command found
    }

    const commandArgs = args.slice(remainingArgsIndex);
    const parsedArgs = command.parseArguments ? command.parseArguments(commandArgs) : {};

    return {
      command,
      args: parsedArgs,
      subcommands: commandPath.slice(0, commandPath.length - 1),
    };
  }
}

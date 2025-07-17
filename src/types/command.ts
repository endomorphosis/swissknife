import { IConfigManager } from '../config/manager';
import { TaskManager } from '../tasks/manager';
import { Agent } from '../ai/agent/agent';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

/**
 * Interface defining the context passed to a command's execute method.
 * Contains shared resources and services needed by commands.
 */
export interface CommandExecutionContext {
  config: IConfigManager;
  taskManager: TaskManager;
  agent: Agent;

  /**
   * Retrieves a service by name.
   * @param serviceName The name of the service to retrieve.
   * @returns The requested service instance.
   */
  getService<T>(serviceName: string): T;
}

/**
 * Defines a single command-line option with its metadata.
 */
export interface CommandOption {
  /** Name of the option (e.g., "help", "output") */
  readonly name: string;
  /** Type of the option value (e.g., "boolean", "string") */
  readonly type: 'boolean' | 'string' | 'number' | 'array';
  /** Short alias for the option (e.g., "h" for "--help") */
  readonly alias?: string;
  /** Description shown in help text */
  readonly description: string;
  /** Default value if not provided */
  readonly default?: any;
  /** Whether the option is required */
  readonly required?: boolean;
}

/**
 * Interface defining the structure for CLI command definitions.
 */
export interface Command {
  /** Unique identifier for the command (e.g., "task:create") */
  readonly id: string;
  /** Name used to invoke the command (e.g., "create" for "task create") */
  readonly name: string;
  /** Short description shown in help */
  readonly description: string;
  /** Detailed help text (optional) */
  readonly help?: string;
  /** Definition of expected arguments/options (e.g., using yargs-parser options) */
  readonly argumentParserOptions?: any; // Define a stricter type if using a specific parser library
  /** Options for the command */
  readonly options?: CommandOption[];
  /** Optional nested commands */
  readonly subcommands?: Command[];
  /** Optional category for the command */
  readonly category?: string;
  /** Optional examples for the command */
  readonly examples?: string[];
  /** Optional aliases for the command */
  readonly aliases?: string[];

  /** 
   * Parses raw command-line arguments into a structured object.
   * @param args Raw string arguments (excluding command name).
   * @returns A structured object of parsed arguments/options.
   * @throws If arguments are invalid.
   */
  parseArguments?(args: string[]): Record<string, any>; // Return type depends on parser

  /**
   * Executes the command's logic.
   * @param parsedArgs The structured arguments object from parseArguments.
   * @param context Execution context providing access to shared resources.
   * @returns A promise resolving to the command's result (can be any type).
   */
  execute?(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any>;
  
  /**
   * Handler for the command. Used by the new CommandRegistry.
   * @param args Arguments for the command.
   * @param context Execution context.
   * @returns A promise resolving to a number (exit code).
   */
  handler?: (args: any, context: CommandExecutionContext) => Promise<number>;
}

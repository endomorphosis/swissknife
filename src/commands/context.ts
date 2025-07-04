// src/commands/context.ts

import { ConfigurationManager, IConfigManager } from '../config/manager';
import { LogManager } from '../utils/logging';

/**
 * Execution context provides shared resources and state during command execution
 */
export interface ExecutionContext {
  config: IConfigManager; // Use the implemented ConfigurationManager
  logger: LogManager; // Use the implemented LogManager
  models: any; // Will be replaced with ModelRegistry once implemented
  services: any; // Will be replaced with ServiceRegistry once implemented
  interactive: boolean;
  cwd: string;
  env: Record<string, string>;
  args: Record<string, any>;
}

/**
 * Creates a new execution context with default values
 * 
 * @param args - Command arguments
 * @param interactive - Whether the command is running in interactive mode
 * @returns A new execution context
 */
export function createExecutionContext(
  args: Record<string, any> = {},
  interactive = true
): ExecutionContext {
  return {
    config: ConfigurationManager.getInstance(), // Use singleton instance
    logger: LogManager.getInstance(), // Use singleton instance
    models: {}, // Placeholder until ModelRegistry is implemented
    services: {}, // Placeholder until ServiceRegistry is implemented
    interactive,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
    args
  };
}

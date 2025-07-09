import { Command, CommandExecutionContext } from '../../command-registry';
import { TaskManager } from '../../tasks/manager'; // Assuming TaskManager is available in context
import { logger } from '../../utils/logger';
// Use a library like yargs-parser for robust argument parsing
import parse from 'yargs-parser'; 

export class TaskCreateCommand implements Command {
  readonly name = 'task:create'; // Using ':' for potential namespacing
  readonly description = 'Creates a new task in the system.';
  
  // Define expected arguments using yargs-parser configuration
  readonly argumentParserOptions = {
    string: ['description', 'd'],
    number: ['priority', 'p'],
    alias: { description: 'd', priority: 'p' },
    default: { priority: 5 }
  };

  parseArguments(args: string[]): Record<string, any> {
    const parsed = parse(args, this.argumentParserOptions);
    // yargs-parser puts non-option args in '_' array
    if (!parsed.description && parsed._.length > 0) {
       // Allow description as the first positional argument
       parsed.description = parsed._[0];
    }
    if (!parsed.description || typeof parsed.description !== 'string') {
      throw new Error('Task description is required (use --description or provide as first argument).');
    }
    if (typeof parsed.priority !== 'number') {
       throw new Error('Priority must be a number (use --priority).');
    }
    return parsed;
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    // Type assertion or check needed because context is generic
    const taskManager = (context as any).taskManager as TaskManager; 
    if (!taskManager) {
        throw new Error('TaskManager is not available in the execution context.');
    }

    const description = parsedArgs.description as string;
    const priority = parsedArgs.priority as number;

    logger.info(`Executing ${this.name} command with description: "${description}", priority: ${priority}`);
    
    try {
      const taskId = await taskManager.createTask(description, priority);
      return {
        message: 'Task created successfully.',
        taskId: taskId,
      };
    } catch (error: any) {
      logger.error(`Error creating task:`, error);
      // Re-throw a user-friendly error or return an error object
      throw new Error(`Failed to create task: ${error.message}`);
    }
  }
}

import { Command, CommandExecutionContext } from '../command-registry';
import { TaskManager } from '../tasks/manager'; 
import { TaskID } from '../types/common';
import { logger } from '../utils/logger';
import parse from 'yargs-parser'; 

export class TaskStatusCommand implements Command {
  readonly name = 'task:status';
  readonly description = 'Checks the status of a specific task.';
  
  readonly argumentParserOptions = {
    // No specific options needed, taskId is positional
  };

  parseArguments(args: string[]): Record<string, any> {
    const parsed = parse(args, this.argumentParserOptions);
    if (parsed._.length !== 1) {
      throw new Error('Usage: task:status <task_id>');
    }
    const taskId = parsed._[0] as string;
    if (!taskId) {
       throw new Error('Task ID is required.');
    }
    return { taskId };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const taskManager = context.taskManager; 
    const taskId = parsedArgs.taskId as TaskID;

    logger.info(`Executing ${this.name} command for task ID: "${taskId}"`);
    
    try {
      const task = await taskManager.getTask(taskId);
      
      if (!task) {
        // Return a specific message instead of throwing an error for not found
        return { message: `Task with ID "${taskId}" not found.` };
      }
      
      // Return relevant task details
      return {
        id: task.id,
        description: task.description,
        status: task.status,
        priority: task.priority,
        createdAt: new Date(task.createdAt).toISOString(),
        updatedAt: new Date(task.updatedAt).toISOString(),
        // Conditionally include result if available?
        // result: task.result 
      };
    } catch (error: any) {
      logger.error(`Error getting task status for ${taskId}:`, error);
      throw new Error(`Failed to get task status: ${error.message}`);
    }
  }
}

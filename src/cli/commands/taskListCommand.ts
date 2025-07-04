import { Command, CommandExecutionContext } from '../command-registry';
import { TaskManager } from '../tasks/manager'; 
import { logger } from '../utils/logger';
import parse from 'yargs-parser'; 

export class TaskListCommand implements Command {
  readonly name = 'task:list';
  readonly description = 'Lists tasks known to the Task Manager.';
  
  readonly argumentParserOptions = {
    // Add options for filtering later (e.g., --status=pending)
    string: ['status', 's'],
    alias: { status: 's' },
  };

  parseArguments(args: string[]): Record<string, any> {
    // Basic parsing, no complex validation needed for list yet
    return parse(args, this.argumentParserOptions);
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const taskManager = context.taskManager; 
    const filterStatus = parsedArgs.status as string | undefined;

    logger.info(`Executing ${this.name} command` + (filterStatus ? ` with status filter: ${filterStatus}` : ''));
    
    try {
      // TODO: Implement filtering logic in TaskManager.listTasks
      // const tasks = await taskManager.listTasks({ status: filterStatus }); 
      
      // Placeholder: Get all tasks from internal map for now
      const tasks = Array.from((taskManager as any).tasks.values()); 
      logger.warn('TaskListCommand currently lists from memory, filtering not implemented.');

      if (tasks.length === 0) {
        return { message: 'No tasks found.' + (filterStatus ? ` matching status "${filterStatus}"` : '') };
      }
      
      // Format output (simple list for now)
      return tasks.map((task: any) => ({ // Use 'any' temporarily as Task type might evolve
         id: task.id,
         description: task.description.length > 50 ? task.description.substring(0, 47) + '...' : task.description,
         status: task.status,
         priority: task.priority,
         createdAt: new Date(task.createdAt).toISOString(),
      }));

    } catch (error: any) {
      logger.error(`Error listing tasks:`, error);
      throw new Error(`Failed to list tasks: ${error.message}`);
    }
  }
}

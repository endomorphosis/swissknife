import { Command, CommandExecutionContext } from '../command-registry';
import { TaskManager } from '../tasks/manager';
import { logger } from '../utils/logger';
import parse from 'yargs-parser';

export class TaskGraphCommand implements Command {
  readonly name = 'task:graph';
  readonly description = 'Manages Graph-of-Thought (GoT) tasks.';

  readonly argumentParserOptions = {
    string: ['action', 'taskId', 'format', 'output'],
    alias: { action: 'a', taskId: 't', format: 'f', output: 'o' },
    default: { format: 'dot' },
  };

  parseArguments(args: string[]): Record<string, any> {
    const parsed = parse(args, this.argumentParserOptions);
    if (!parsed.action) {
      throw new Error('Usage: task:graph --action <create|visualize|export> [options]');
    }
    return parsed;
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const taskManager = context.getService<TaskManager>('TaskManager');

    switch (parsedArgs.action) {
      case 'create':
        if (!parsedArgs.prompt) {
          throw new Error('Usage: task:graph --action create --prompt "<prompt>"');
        }
        const taskId = await taskManager.createTask('got:process', {
          prompt: parsedArgs.prompt,
          strategy: parsedArgs.strategy || 'bfs',
        });
        logger.info(`Graph-of-Thought task created with ID: ${taskId}`);
        break;

      case 'visualize':
        if (!parsedArgs.taskId) {
          throw new Error('Usage: task:graph --action visualize --taskId <task_id>');
        }
        const graphData = await taskManager.visualizeGraph(parsedArgs.taskId, parsedArgs.format);
        if (parsedArgs.output) {
          await context.getService('StorageOperations').writeFile(parsedArgs.output, graphData);
          logger.info(`Graph visualization saved to ${parsedArgs.output}`);
        } else {
          console.log(graphData);
        }
        break;

      case 'export':
        if (!parsedArgs.taskId) {
          throw new Error('Usage: task:graph --action export --taskId <task_id>');
        }
        const exportData = await taskManager.exportGraph(parsedArgs.taskId, parsedArgs.format);
        if (parsedArgs.output) {
          await context.getService('StorageOperations').writeFile(parsedArgs.output, exportData);
          logger.info(`Graph exported to ${parsedArgs.output}`);
        } else {
          console.log(exportData);
        }
        break;

      default:
        throw new Error(`Unknown action: ${parsedArgs.action}`);
    }
  }
}

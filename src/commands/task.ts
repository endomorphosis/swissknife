// src/commands/task.ts

import { Command } from './registry.js';
import { ExecutionContext } from './context.js';
import { TaskRegistry } from '../tasks/registry';
import { TaskManager, TaskStatus, TaskInstance } from '../tasks/manager';
import chalk from 'chalk';

// Get singletons
const taskRegistry = TaskRegistry.getInstance();
const taskManager = TaskManager.getInstance();

/**
 * Task command implementation
 * Allows users to manage tasks
 */
export const taskCommand: Command = {
  id: 'task',
  name: 'task',
  description: 'Manage tasks',
  options: [
    {
      name: 'list',
      type: 'boolean',
      description: 'List available task definitions',
      required: false,
      default: false
    },
    {
      name: 'list-instances',
      type: 'boolean',
      description: 'List task instances',
      required: false,
      default: false
    },
    {
      name: 'status',
      type: 'string',
      description: 'Filter task instances by status',
      required: false
    },
    {
      name: 'run',
      type: 'string',
      description: 'Run a task',
      required: false
    },
    {
      name: 'params',
      type: 'string',
      description: 'JSON string of parameters for task execution',
      required: false,
      default: '{}'
    },
    {
      name: 'cancel',
      type: 'string',
      description: 'Cancel a task by instance ID',
      required: false
    },
    {
      name: 'cleanup',
      type: 'boolean',
      description: 'Clean up old completed tasks',
      required: false,
      default: false
    },
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      required: false,
      default: false
    }
  ],
  category: 'tasks',
  examples: [
    'swissknife task --list',
    'swissknife task --list-instances',
    'swissknife task --list-instances --status=running',
    'swissknife task --run=generate-text --params=\'{"modelId":"gpt-4","prompt":"Hello"}\'',
    'swissknife task --cancel=abc123',
    'swissknife task --cleanup'
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    try {
      // Handle list operation
      if (args.list) {
        const tasks = taskRegistry.getAllTasks();
        
        if (args.json) {
          console.log(JSON.stringify(tasks, null, 2));
        } else {
          console.log(chalk.bold('\nAvailable Tasks:\n'));
          
          // Group tasks by category
          const tasksByCategory: Record<string, any[]> = {};
          
          tasks.forEach(task => {
            if (!tasksByCategory[task.category]) {
              tasksByCategory[task.category] = [];
            }
            tasksByCategory[task.category].push(task);
          });
          
          // Print tasks by category
          for (const [category, categoryTasks] of Object.entries(tasksByCategory)) {
            console.log(chalk.blue(`\n${category.toUpperCase()}:`));
            
            categoryTasks.forEach(task => {
              console.log(`  ${chalk.green(task.id)}: ${task.description}`);
              
              if (task.parameters.length > 0) {
                console.log('    Parameters:');
                task.parameters.forEach(param => {
                  const required = param.required ? chalk.red(' (required)') : '';
                  const defaultValue = param.default !== undefined ? 
                    chalk.gray(` (default: ${JSON.stringify(param.default)})`) : '';
                  console.log(`      - ${param.name} [${param.type}]${required}${defaultValue}: ${param.description}`);
                });
              }
              
              if (task.requiredBridges && task.requiredBridges.length > 0) {
                console.log(`    Required Bridges: ${task.requiredBridges.join(', ')}`);
              }
              
              if (task.examples && task.examples.length > 0) {
                console.log('    Examples:');
                task.examples.forEach(example => {
                  console.log(`      - ${example}`);
                });
              }
            });
          }
        }
        
        return 0;
      }
      
      // Handle list-instances operation
      if (args['list-instances']) {
        let tasks = taskManager.getAllTasks();
        
        // Filter by status if specified
        if (args.status) {
          const status = args.status.toUpperCase();
          if (!Object.values(TaskStatus).includes(status)) {
            console.error(`Invalid status: ${args.status}`);
            console.error(`Valid statuses: ${Object.values(TaskStatus).join(', ')}`);
            return 1;
          }
          
          tasks = taskManager.getTasksByStatus(status as TaskStatus);
        }
        
        if (args.json) {
          console.log(JSON.stringify(tasks, null, 2));
        } else {
          console.log(chalk.bold('\nTask Instances:\n'));
          
          if (tasks.length === 0) {
            console.log('No task instances found.');
            return 0;
          }
          
          tasks.forEach(task => {
            const statusColor = getStatusColor(task.status);
            console.log(`\nID: ${chalk.cyan(task.id)}`);
            console.log(`Task: ${chalk.green(task.taskId)}`);
            console.log(`Status: ${statusColor(task.status)}`);
            console.log(`Created: ${task.timing.createdAt.toISOString()}`);
            
            if (task.timing.startedAt) {
              console.log(`Started: ${task.timing.startedAt.toISOString()}`);
            }
            
            if (task.timing.completedAt) {
              console.log(`Completed: ${task.timing.completedAt.toISOString()}`);
              console.log(`Duration: ${task.timing.durationMs}ms`);
            }
            
            if (task.workerId) {
              console.log(`Worker: ${task.workerId}`);
            }
            
            console.log('Parameters:');
            console.log(JSON.stringify(task.params, null, 2));
            
            if (task.result) {
              console.log('Result:');
              console.log(JSON.stringify(task.result, null, 2));
            }
            
            if (task.error) {
              console.log(`Error: ${chalk.red(task.error.message || String(task.error))}`);
            }
          });
        }
        
        return 0;
      }
      
      // Handle run operation
      if (args.run) {
        const taskId = args.run;
        let params = {};
        
        try {
          params = JSON.parse(args.params);
        } catch (error) {
          console.error('Invalid JSON for parameters:', args.params);
          console.error('Error:', error);
          return 1;
        }
        
        console.log(`Running task: ${taskId}`);
        
        // Submit task
        const result = await taskManager.submitTask(
          taskId,
          params,
          {
            metadata: {
              source: 'cli',
              user: context.user?.id || 'anonymous'
            }
          }
        );
        
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green('Task completed successfully:'));
          console.log(JSON.stringify(result, null, 2));
        }
        
        return 0;
      }
      
      // Handle cancel operation
      if (args.cancel) {
        const taskId = args.cancel;
        const success = taskManager.cancelTask(taskId);
        
        if (args.json) {
          console.log(JSON.stringify({ success }));
        } else {
          if (success) {
            console.log(chalk.green(`Task ${taskId} cancelled.`));
          } else {
            console.log(chalk.yellow(`Could not cancel task ${taskId}. It may be completed already or not exist.`));
          }
        }
        
        return success ? 0 : 1;
      }
      
      // Handle cleanup operation
      if (args.cleanup) {
        const count = taskManager.cleanupOldTasks();
        
        if (args.json) {
          console.log(JSON.stringify({ count }));
        } else {
          console.log(chalk.green(`Cleaned up ${count} old tasks.`));
        }
        
        return 0;
      }
      
      // If no operation specified, show help
      console.log(chalk.yellow('Please specify an operation.'));
      console.log(`Run ${chalk.cyan('swissknife help task')} for usage information.`);
      return 1;
      
    } catch (error: any) {
      console.error('Error:', error.message || error);
      return 1;
    }
  }
};

/**
 * Get colored status string for task instance status
 */
function getStatusColor(status: TaskStatus): (text: string) => string {
  switch (status) {
    case TaskStatus.PENDING:
      return chalk.blue;
    case TaskStatus.RUNNING:
      return chalk.yellow;
    case TaskStatus.COMPLETED:
      return chalk.green;
    case TaskStatus.FAILED:
      return chalk.red;
    case TaskStatus.CANCELLED:
      return chalk.gray;
    case TaskStatus.TIMEOUT:
      return chalk.red;
    default:
      return chalk.white;
  }
}

// Register common tasks
import { registerTask } from '../tasks/registry';

// Register text generation task
registerTask({
  id: 'generate-text',
  name: 'Generate Text',
  description: 'Generate text using an AI model',
  category: 'ai',
  parameters: [
    {
      name: 'modelId',
      description: 'ID of the model to use',
      type: 'string',
      required: true
    },
    {
      name: 'prompt',
      description: 'Prompt to generate text from',
      type: 'string',
      required: true
    },
    {
      name: 'options',
      description: 'Additional options for the model',
      type: 'object',
      required: false,
      default: {}
    }
  ],
  examples: [
    'swissknife task --run=generate-text --params=\'{"modelId":"gpt-4","prompt":"Write a poem about swissknife"}\'',
    'swissknife task --run=generate-text --params=\'{"modelId":"claude-3-sonnet","prompt":"What are the benefits of distributed computing?"}\'',
  ]
});

// Register image analysis task
registerTask({
  id: 'analyze-image',
  name: 'Analyze Image',
  description: 'Analyze an image using an AI model',
  category: 'ai',
  parameters: [
    {
      name: 'modelId',
      description: 'ID of the model to use',
      type: 'string',
      required: true
    },
    {
      name: 'imageData',
      description: 'Base64 encoded image data',
      type: 'string',
      required: true
    },
    {
      name: 'options',
      description: 'Additional options for the model',
      type: 'object',
      required: false,
      default: {}
    }
  ],
  examples: [
    'swissknife task --run=analyze-image --params=\'{"modelId":"vision-model","imageData":"base64encodeddata..."}\'',
  ]
});

// Register Goose bridge call task
registerTask({
  id: 'goose-bridge-call',
  name: 'Goose Bridge Call',
  description: 'Call a method on the Goose bridge',
  category: 'integration',
  parameters: [
    {
      name: 'method',
      description: 'Method to call',
      type: 'string',
      required: true
    },
    {
      name: 'args',
      description: 'Arguments for the method',
      type: 'object',
      required: false,
      default: {}
    }
  ],
  requiredBridges: ['goose-mcp'],
  examples: [
    'swissknife task --run=goose-bridge-call --params=\'{"method":"getStatus","args":{}}\'',
  ]
});

// Register IPFS bridge call task
registerTask({
  id: 'ipfs-bridge-call',
  name: 'IPFS Bridge Call',
  description: 'Call a method on the IPFS bridge',
  category: 'integration',
  parameters: [
    {
      name: 'method',
      description: 'Method to call',
      type: 'string',
      required: true
    },
    {
      name: 'args',
      description: 'Arguments for the method',
      type: 'object',
      required: false,
      default: {}
    }
  ],
  requiredBridges: ['ipfs-accelerate'],
  examples: [
    'swissknife task --run=ipfs-bridge-call --params=\'{"method":"add","args":{"content":"Hello, IPFS!"}}\'',
  ]
});

// Register file cleanup task
registerTask({
  id: 'cleanup-files',
  name: 'Cleanup Files',
  description: 'Clean up old files in a directory',
  category: 'system',
  parameters: [
    {
      name: 'directory',
      description: 'Directory to clean up',
      type: 'string',
      required: true
    },
    {
      name: 'pattern',
      description: 'File pattern to match',
      type: 'string',
      required: false,
      default: '*'
    },
    {
      name: 'olderThan',
      description: 'Only clean up files older than this many days',
      type: 'number',
      required: false,
      default: 30
    }
  ],
  examples: [
    'swissknife task --run=cleanup-files --params=\'{"directory":"./temp","pattern":"*.tmp","olderThan":7}\'',
  ]
});

// Register the task command
import { registerCommand } from './registry.js';
registerCommand(taskCommand);
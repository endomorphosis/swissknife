// src/commands/worker.ts

import { Command } from './registry.js';
import { ExecutionContext } from './context.js';
import { WorkerPool, WorkerPoolOptions } from '../workers/worker-pool';
import chalk from 'chalk';

// Initialize the worker pool with default options
const workerPool = WorkerPool.getInstance({
  minWorkers: 1,
  maxWorkers: 10,
  maxIdleTime: 5 * 60 * 1000, // 5 minutes
  taskTimeout: 30 * 1000, // 30 seconds
});

/**
 * Worker command implementation
 * Allows users to manage worker threads
 */
export const workerCommand: Command = {
  id: 'worker',
  name: 'worker',
  description: 'Manage worker threads',
  options: [
    {
      name: 'start',
      type: 'boolean',
      description: 'Start the worker pool',
      required: false,
      default: false
    },
    {
      name: 'stop',
      type: 'boolean',
      description: 'Stop the worker pool',
      required: false,
      default: false
    },
    {
      name: 'status',
      type: 'boolean',
      description: 'Show worker pool status',
      required: false,
      default: false
    },
    {
      name: 'min-workers',
      type: 'string',
      description: 'Set minimum number of workers',
      required: false
    },
    {
      name: 'max-workers',
      type: 'string',
      description: 'Set maximum number of workers',
      required: false
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
  category: 'system',
  examples: [
    'swissknife worker --start',
    'swissknife worker --stop',
    'swissknife worker --status',
    'swissknife worker --min-workers=2 --max-workers=10'
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    try {
      // Handle start operation
      if (args.start) {
        workerPool.start();
        
        if (args.json) {
          console.log(JSON.stringify({
            status: 'started',
            workers: workerPool.getWorkerCount()
          }));
        } else {
          console.log(chalk.green(`Worker pool started with ${workerPool.getWorkerCount()} workers.`));
        }
        
        return 0;
      }
      
      // Handle stop operation
      if (args.stop) {
        workerPool.stop();
        
        if (args.json) {
          console.log(JSON.stringify({
            status: 'stopped'
          }));
        } else {
          console.log(chalk.yellow('Worker pool stopped.'));
        }
        
        return 0;
      }
      
      // Handle status operation
      if (args.status || (!args.start && !args.stop)) {
        const stats = workerPool.getStats();
        
        if (args.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          const statusColor = stats.running ? chalk.green : chalk.yellow;
          const status = stats.running ? 'Running' : 'Stopped';
          
          console.log(chalk.bold('\nWorker Pool Status:\n'));
          console.log(`Status: ${statusColor(status)}`);
          console.log(`Workers: ${stats.workers} (${stats.idleWorkers} idle)`);
          console.log(`Queue: ${stats.queueLength} tasks`);
          
          if (stats.workers > 0) {
            console.log(chalk.bold('\nWorker Details:'));
            
            for (const [workerId, workerStat] of Object.entries(stats.workerStats)) {
              const statusStr = getStatusString(workerStat.status);
              console.log(`\nWorker ${workerId.slice(0, 6)}: ${statusStr}`);
              console.log(`  Tasks: ${workerStat.stats.tasksProcessed} processed, ${workerStat.stats.tasksSucceeded} succeeded, ${workerStat.stats.tasksFailed} failed`);
              
              if (workerStat.currentTask) {
                console.log(`  Current Task: ${workerStat.currentTask.type} (${workerStat.currentTask.id.slice(0, 6)})`);
              }
            }
          }
        }
        
        return 0;
      }
      
      // Handle configuration updates
      let configChanged = false;
      
      if (args['min-workers']) {
        const minWorkers = parseInt(args['min-workers'], 10);
        if (isNaN(minWorkers) || minWorkers < 0) {
          console.error('Invalid value for min-workers. Must be a non-negative integer.');
          return 1;
        }
        
        // Update configuration in context
        context.config.set('workers.minWorkers', minWorkers);
        configChanged = true;
      }
      
      if (args['max-workers']) {
        const maxWorkers = parseInt(args['max-workers'], 10);
        if (isNaN(maxWorkers) || maxWorkers < 1) {
          console.error('Invalid value for max-workers. Must be a positive integer.');
          return 1;
        }
        
        // Update configuration in context
        context.config.set('workers.maxWorkers', maxWorkers);
        configChanged = true;
      }
      
      if (configChanged) {
        // Save configuration
        await context.config.save();
        
        if (args.json) {
          console.log(JSON.stringify({
            status: 'configured',
            config: {
              minWorkers: context.config.get('workers.minWorkers'),
              maxWorkers: context.config.get('workers.maxWorkers')
            }
          }));
        } else {
          console.log(chalk.green('Worker configuration updated.'));
          console.log('To apply changes, restart the worker pool with --stop followed by --start.');
        }
      }
      
      return 0;
      
    } catch (error: any) {
      console.error('Error:', error.message || error);
      return 1;
    }
  }
};

/**
 * Helper function to get a colored status string
 */
function getStatusString(status: string): string {
  switch (status) {
    case 'idle':
      return chalk.green('Idle');
    case 'busy':
      return chalk.yellow('Busy');
    case 'error':
      return chalk.red('Error');
    case 'terminated':
      return chalk.gray('Terminated');
    default:
      return status;
  }
}

// Register common task handlers for workers
import { ModelRegistry } from '../models/registry';
import { ModelExecutionService } from '../models/execution';

// Register model execution task handler
workerPool.registerTaskHandler('modelExecution', async (args) => {
  const { modelId, prompt, options } = args;
  const executionService = ModelExecutionService.getInstance();
  return executionService.executeModel(modelId, prompt, options);
});

// Register the worker command
import { registerCommand } from './registry.js';
registerCommand(workerCommand);
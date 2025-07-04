/**
 * Task Scheduler CLI Command
 * 
 * Provides CLI commands to interact with the Fibonacci Heap Scheduler
 * for priority-based task scheduling.
 */

import { Command } from 'commander';
import { FibonacciHeap } from '../tasks/scheduler/fibonacci-heap';
import { LogManager } from '../utils/logging/manager';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';

// Create a singleton scheduler instance
const scheduler = new FibonacciHeap<any>();
const logger = LogManager.getInstance();

// In-memory task storage for CLI demonstration
const scheduledTasks = new Map<string, any>();

export const taskScheduler = new Command('scheduler')
  .description('Interact with the Fibonacci Heap Task Scheduler')
  .addHelpText('after', `
Examples:
  $ swissknife scheduler add "Process file" 5         # Add a task with priority 5
  $ swissknife scheduler list                         # List all scheduled tasks
  $ swissknife scheduler next                         # Get the next highest priority task
  $ swissknife scheduler peek                         # View the next task without removing it
  $ swissknife scheduler count                        # Get the number of scheduled tasks
  `);

taskScheduler
  .command('add <description>')
  .description('Add a task to the scheduler')
  .option('-p, --priority <number>', 'Task priority (lower number = higher priority)', '5')
  .option('-d, --data <json>', 'JSON string of additional task data')
  .action(async (description, options) => {
    try {
      const priority = parseInt(options.priority, 10);
      
      if (isNaN(priority)) {
        throw new Error('Priority must be a number');
      }
      
      const taskId = uuidv4();
      const task = {
        id: taskId,
        description,
        createdAt: new Date().toISOString(),
        data: options.data ? JSON.parse(options.data) : {}
      };
      
      // Store task for reference
      scheduledTasks.set(taskId, task);
      
      // Add to scheduler
      scheduler.insert(priority, task);
      
      logger.info(`Added task to scheduler`, { taskId, priority });
      console.log(chalk.green(`✓ Added task to scheduler with ID: ${taskId}`));
      console.log(`Description: ${description}`);
      console.log(`Priority: ${priority}`);
      
    } catch (error: any) {
      console.error(chalk.red(`Error adding task: ${error.message}`));
    }
  });

taskScheduler
  .command('list')
  .description('List all scheduled tasks')
  .action(async () => {
    try {
      const count = scheduler.size();
      
      if (count === 0) {
        console.log(chalk.yellow('No tasks currently scheduled'));
        return;
      }
      
      console.log(chalk.green(`${count} task(s) currently scheduled:`));
      
      // This is a simplification since we can't list all tasks without removing them from the heap
      // In a real implementation, we might have a separate task registry
      for (const [id, task] of scheduledTasks.entries()) {
        console.log('───────────────────────────────────');
        console.log(`ID: ${chalk.bold(id)}`);
        console.log(`Description: ${task.description}`);
        console.log(`Created: ${task.createdAt}`);
        
        if (Object.keys(task.data).length > 0) {
          console.log(`Data: ${JSON.stringify(task.data, null, 2)}`);
        }
      }
      console.log('───────────────────────────────────');
      
    } catch (error: any) {
      console.error(chalk.red(`Error listing tasks: ${error.message}`));
    }
  });

taskScheduler
  .command('next')
  .description('Get and remove the next highest priority task')
  .action(async () => {
    try {
      if (scheduler.isEmpty()) {
        console.log(chalk.yellow('No tasks currently scheduled'));
        return;
      }
      
      const task = scheduler.extractMin();
      
      if (!task) {
        console.log(chalk.yellow('Failed to retrieve next task'));
        return;
      }
      
      // Remove from our reference map as it's now processed
      scheduledTasks.delete(task.id);
      
      console.log(chalk.green(`Retrieved next highest priority task:`));
      console.log('───────────────────────────────────');
      console.log(`ID: ${chalk.bold(task.id)}`);
      console.log(`Description: ${task.description}`);
      console.log(`Created: ${task.createdAt}`);
      
      if (Object.keys(task.data).length > 0) {
        console.log(`Data: ${JSON.stringify(task.data, null, 2)}`);
      }
      console.log('───────────────────────────────────');
      
      const remaining = scheduler.size();
      console.log(`${remaining} task(s) remaining in scheduler`);
      
    } catch (error: any) {
      console.error(chalk.red(`Error getting next task: ${error.message}`));
    }
  });

taskScheduler
  .command('peek')
  .description('View the next highest priority task without removing it')
  .action(async () => {
    try {
      if (scheduler.isEmpty()) {
        console.log(chalk.yellow('No tasks currently scheduled'));
        return;
      }
      
      const task = scheduler.findMin();
      
      if (!task) {
        console.log(chalk.yellow('Failed to peek at next task'));
        return;
      }
      
      console.log(chalk.green(`Next highest priority task (peek):`));
      console.log('───────────────────────────────────');
      console.log(`ID: ${chalk.bold(task.id)}`);
      console.log(`Description: ${task.description}`);
      console.log(`Created: ${task.createdAt}`);
      
      if (Object.keys(task.data).length > 0) {
        console.log(`Data: ${JSON.stringify(task.data, null, 2)}`);
      }
      console.log('───────────────────────────────────');
      console.log(chalk.yellow('Note: Task remains in the scheduler (peek only)'));
      
    } catch (error: any) {
      console.error(chalk.red(`Error peeking at next task: ${error.message}`));
    }
  });

taskScheduler
  .command('count')
  .description('Get the number of scheduled tasks')
  .action(async () => {
    try {
      const count = scheduler.size();
      console.log(`${count} task(s) currently scheduled`);
    } catch (error: any) {
      console.error(chalk.red(`Error getting task count: ${error.message}`));
    }
  });

taskScheduler
  .command('clear')
  .description('Clear all scheduled tasks')
  .action(async () => {
    try {
      // Since we don't have a direct clear method, we'll just extract all tasks
      let count = 0;
      while (!scheduler.isEmpty()) {
        scheduler.extractMin();
        count++;
      }
      
      // Clear our reference map
      scheduledTasks.clear();
      
      console.log(chalk.green(`✓ Cleared ${count} task(s) from the scheduler`));
    } catch (error: any) {
      console.error(chalk.red(`Error clearing tasks: ${error.message}`));
    }
  });

export default taskScheduler;
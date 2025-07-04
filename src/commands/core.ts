/**
 * Core Commands - Basic commands for the SwissKnife CLI
 */

import { CommandRegistry, Command, LazyCommand } from '../command-registry';
import pkg from '../packageon' assert { type: 'json' };
const { version } = pkg;
import { TaskManager } from '../tasks/manager';
import { WorkerPool } from '../workers/pool';

/**
 * Load core commands lazily
 */
export async function loadCoreCommands(): Promise<void> {
  const registry = CommandRegistry.getInstance();
  
  // Version command
  registry.registerCommand({
    id: 'version',
    loader: () => import('./version.js').then(m => m.versionCommand)
  } as LazyCommand);
  
  // Status command
  registry.registerCommand({
    id: 'status',
    loader: () => import('./status.js').then(m => m.statusCommand)
  } as LazyCommand);
  
  // Exit command
  registry.registerCommand({
    id: 'exit',
    loader: () => import('./exit.js').then(m => m.exitCommand)
  } as LazyCommand);
  
  // Clear command
  registry.registerCommand({
    id: 'clear',
    loader: () => import('./clear.js').then(m => m.clearCommand)
  } as LazyCommand);
}

/**
 * Version command
 */
export const versionCommand: Command = {
  id: 'version',
  name: 'version',
  description: 'Display SwissKnife version information',
  aliases: ['v', '--version'],
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output version information in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife version',
    'swissknife version --json'
  ],
  category: 'system' as const,
  handler: async (args: any, context: any) => {
    const { json } = args;
    
    if (json) {
      const versionInfo = {
        version,
        node: process.version,
        platform: process.platform,
        arch: process.arch
      };
      
      console.log(JSON.stringify(versionInfo, null, 2));
    } else {
      console.log(`SwissKnife v${version}`);
      console.log(`Node.js ${process.version}`);
      console.log(`Platform: ${process.platform} (${process.arch})`);
    }
    
    return 0;
  }
};

/**
 * Status command
 */
export const statusCommand: Command = {
  id: 'status',
  name: 'status',
  description: 'Display system status information',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output status information in JSON format',
      default: false
    },
    {
      name: 'detailed',
      alias: 'd',
      type: 'boolean',
      description: 'Show detailed status information',
      default: false
    }
  ],
  examples: [
    'swissknife status',
    'swissknife status --detailed',
    'swissknife status --json'
  ],
  category: 'system',
  handler: async (args: any, context: any) => {
    const { json, detailed } = args;
    const { services } = context;
    
    // Get task manager stats
    const taskManager = services.taskManager as TaskManager;
    const pendingTasks = (taskManager as any).getTasksByStatus('pending').length;
    const runningTasks = (taskManager as any).getTasksByStatus('running').length;
    const completedTasks = (taskManager as any).getTasksByStatus('completed').length;
    const failedTasks = (taskManager as any).getTasksByStatus('failed').length;
    
    // Get worker pool stats
    const workerPool = services.workerPool as WorkerPool;
    const workerStats = (workerPool as any).getStats();
    
    if (json) {
      const statusInfo = {
        version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        tasks: {
          pending: pendingTasks,
          running: runningTasks,
          completed: completedTasks,
          failed: failedTasks
        },
        workers: workerStats
      };
      
      console.log(JSON.stringify(statusInfo, null, 2));
    } else {
      console.log('SwissKnife Status');
      console.log('----------------');
      console.log(`Version: ${version}`);
      console.log(`Uptime: ${formatUptime(process.uptime())}`);
      console.log(`Memory Usage: ${formatMemory(process.memoryUsage().heapUsed)}`);
      console.log();
      
      console.log('Task System');
      console.log('----------');
      console.log(`Pending Tasks: ${pendingTasks}`);
      console.log(`Running Tasks: ${runningTasks}`);
      console.log(`Completed Tasks: ${completedTasks}`);
      console.log(`Failed Tasks: ${failedTasks}`);
      console.log();
      
      console.log('Worker System');
      console.log('-------------');
      console.log(`Total Workers: ${workerStats.totalWorkers}`);
      console.log(`Idle Workers: ${workerStats.idleWorkers}`);
      console.log(`Busy Workers: ${workerStats.busyWorkers}`);
      console.log(`Tasks Processed: ${workerStats.totalTasksProcessed}`);
      
      if (detailed) {
        // Add more detailed information if --detailed flag is provided
        console.log();
        console.log('Detailed Memory Usage');
        console.log('--------------------');
        const memUsage = process.memoryUsage();
        console.log(`RSS: ${formatMemory(memUsage.rss)}`);
        console.log(`Heap Total: ${formatMemory(memUsage.heapTotal)}`);
        console.log(`Heap Used: ${formatMemory(memUsage.heapUsed)}`);
        console.log(`External: ${formatMemory(memUsage.external)}`);
      }
    }
    
    return 0;
  }
};

/**
 * Exit command
 */
export const exitCommand: Command = {
  id: 'exit',
  name: 'exit',
  description: 'Exit the SwissKnife CLI',
  aliases: ['quit'],
  options: [
    {
      name: 'code',
      alias: 'c',
      type: 'number',
      description: 'Exit code to return',
      default: 0
    }
  ],
  examples: [
    'swissknife exit',
    'swissknife exit --code 1'
  ],
  category: 'system' as const,
  handler: async (args: any, context: any) => {
    const { code } = args;
    
    // Perform cleanup
    const { services } = context;
    const taskManager = services.taskManager as TaskManager;
    const workerPool = services.workerPool as WorkerPool;
    
    console.log('Shutting down SwissKnife...');
    
    // Shutdown task manager
    try {
      await (taskManager as any).shutdown();
    } catch (error) {
      console.error('Error shutting down task manager:', error);
    }
    
    // Shutdown worker pool
    try {
      await (workerPool as any).shutdown();
    } catch (error) {
      console.error('Error shutting down worker pool:', error);
    }
    
    console.log('Goodbye!');
    
    // Exit with specified code
    process.exit(code);
    
    return code;
  }
};

/**
 * Clear command
 */
export const clearCommand: Command = {
  id: 'clear',
  name: 'clear',
  description: 'Clear the terminal screen',
  aliases: ['cls'],
  examples: [
    'swissknife clear'
  ],
  category: 'system' as const,
  handler: async (args: any, context: any) => {
    // Check if in interactive mode
    if (context.interactive) {
      // Clear screen based on platform
      if (process.platform === 'win32') {
        // Windows
        process.stdout.write('\x1B[2J\x1B[0f');
      } else {
        // Unix-like
        process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
      }
    } else {
      console.log('Clear command only works in interactive mode');
    }
    
    return 0;
  }
};

/**
 * Helper function to format uptime in a human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  const parts = [];
  
  if (days > 0) {
    parts.push(`${days}d`);
  }
  
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  
  if (minutes > 0 || hours > 0 || days > 0) {
    parts.push(`${minutes}m`);
  }
  
  parts.push(`${remainingSeconds}s`);
  
  return parts.join(' ');
}

/**
 * Helper function to format memory in a human-readable format
 */
function formatMemory(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

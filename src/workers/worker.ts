/**
 * Worker Thread - Worker thread implementation for distributed task execution
 *
 * Host-only Node worker_threads entry script. Private implementation detail
 * per `src/module-ownership.json`; browser code must never import this
 * module. Use `src/workers/host.ts` instead.
 */

import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  WorkerInitMessage,
  WorkerTaskMessage,
  WorkerResponseMessage,
  WorkerStatusMessage
} from './thread.js';

// Worker thread implementation - only run this code when in a worker thread
if (!isMainThread) {
  // Worker state
  let workerId: string = workerData?.workerId || 'unknown-worker';
  let config: any = {};
  let initialized: boolean = false;
  let taskHandlers: Map<string, (data: any) => Promise<any>> = new Map();
  let currentTaskId: string | null = null;
  
  console.log(`Worker ${workerId} starting...`);
  
  // Register built-in task handlers
  registerTaskHandler('echo', async (data) => {
    // Simple echo handler for testing
    return data;
  });
  
  registerTaskHandler('sleep', async (data) => {
    // Sleep handler for testing
    const ms = typeof data === 'number' ? data : (data?.ms || 1000);
    await new Promise(resolve => setTimeout(resolve, ms));
    return { slept: ms };
  });
  
  // Register task handler
  function registerTaskHandler(taskType: string, handler: (data: any) => Promise<any>): void {
    taskHandlers.set(taskType, handler);
    console.log(`Worker ${workerId} registered handler for task type: ${taskType}`);
  }
  
  // Send status message to main thread
  function sendStatus(status: 'idle' | 'busy' | 'error', error?: string): void {
    if (!parentPort) return;
    
    parentPort.postMessage({
      type: 'status',
      workerId,
      status,
      error
    } as WorkerStatusMessage);
  }
  
  // Listen for messages from the main thread
  if (parentPort) {
    parentPort.on('message', async (message: WorkerInitMessage | WorkerTaskMessage) => {
      try {
        if (message.type === 'init') {
          // Initialize worker
          workerId = message.workerId;
          config = message.config;
          initialized = true;
          
          console.log(`Worker ${workerId} initialized`);
          
          // Send idle status
          sendStatus('idle');
        } else if (message.type === 'task') {
          // Execute task
          const { taskId, taskType, data } = message;
          
          // Store current task ID
          currentTaskId = taskId;
          
          // Send busy status
          sendStatus('busy');
          
          console.log(`Worker ${workerId} executing task ${taskId} of type ${taskType}`);
          
          // Find task handler
          const handler = taskHandlers.get(taskType);
          if (!handler) {
            throw new Error(`No handler registered for task type: ${taskType}`);
          }
          
          // Execute handler
          const result = await handler(data);
          
          // Send response
          if (parentPort) {
            parentPort.postMessage({
              type: 'response',
              taskId,
              result
            } as WorkerResponseMessage);
          }
          
          // Clear current task
          currentTaskId = null;
          
          // Send idle status
          sendStatus('idle');
        }
      } catch (error) {
        console.error(`Worker ${workerId} error:`, error);
        
        // Send error response
        if (message.type === 'task' && parentPort) {
          parentPort.postMessage({
            type: 'response',
            taskId: message.taskId,
            result: null,
            error: error.message || String(error)
          } as WorkerResponseMessage);
        }
        
        // Send error status
        sendStatus('error', error.message || String(error));
      }
    });
  }
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error(`Worker ${workerId} uncaught exception:`, error);
    
    // Send error status
    sendStatus('error', error.message || String(error));
    
    // Send error response for current task if any
    if (currentTaskId && parentPort) {
      parentPort.postMessage({
        type: 'response',
        taskId: currentTaskId,
        result: null,
        error: error.message || String(error)
      } as WorkerResponseMessage);
    }
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    console.error(`Worker ${workerId} unhandled rejection:`, error);
    
    // Send error status
    sendStatus('error', error.message || String(error));
    
    // Send error response for current task if any
    if (currentTaskId && parentPort) {
      parentPort.postMessage({
        type: 'response',
        taskId: currentTaskId,
        result: null,
        error: error.message || String(error)
      } as WorkerResponseMessage);
    }
  });
}

// Export nothing from this file as it's meant to be loaded directly by the worker pool
export {};
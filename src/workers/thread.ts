// src/workers/thread.ts
//
// Host-only Node worker_threads helper. Private implementation detail per
// `src/module-ownership.json`; browser code must never import this module.
// Use `src/workers/host.ts` instead.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as path from 'node:path';

export interface WorkerInitMessage {
  type: 'init';
  workerId: string;
  config: any;
}

export interface WorkerTaskMessage {
  type: 'task';
  taskId: string;
  taskType: string;
  data: any;
}

export interface WorkerResponseMessage {
  type: 'response';
  taskId: string;
  result: any;
  error?: string;
}

export interface WorkerStatusMessage {
  type: 'status';
  workerId: string;
  status: 'idle' | 'busy' | 'error';
  error?: string;
}

export function createWorker(workerId: string, config: any = {}): Worker {
 const worker = new Worker(path.resolve(__filename), {
 workerData: {
 workerId
 }
 });
  
 // Initialize worker
 worker.postMessage({
 type: 'init',
 workerId,
 config
 } as WorkerInitMessage);
  
 return worker;
}

// Worker thread implementation
if (!isMainThread) {
  let workerId: string;
  let config: any;
  let taskHandlers: Map<string, (data: any) => Promise<any>> = new Map();

  function registerTaskHandler(taskType: string, handler: (data: any) => Promise<any>): void {
    taskHandlers.set(taskType, handler);
  }

  parentPort?.on('message', async (message: WorkerInitMessage | WorkerTaskMessage) => {
    try {
      if (message.type === 'init') {
        workerId = message.workerId;
        config = message.config;

        parentPort?.postMessage({
          type: 'status',
          workerId,
          status: 'idle'
        } as WorkerStatusMessage);
      } else if (message.type === 'task') {
        const { taskId, taskType, data } = message;

        parentPort?.postMessage({
          type: 'status',
          workerId,
          status: 'busy'
        } as WorkerStatusMessage);

        const handler = taskHandlers.get(taskType);
        if (!handler) {
          throw new Error(`No handler registered for task type: ${taskType}`);
        }

        const result = await handler(data);

        parentPort?.postMessage({
          type: 'response',
          taskId,
          result
        } as WorkerResponseMessage);

        parentPort?.postMessage({
          type: 'status',
          workerId,
          status: 'idle'
        } as WorkerStatusMessage);
      }
    } catch (error) {
      if (message.type === 'task') {
        parentPort?.postMessage({
          type: 'response',
          taskId: message.taskId,
          result: null,
          error: error instanceof Error ? error.message : String(error)
        } as WorkerResponseMessage);
      }

      parentPort?.postMessage({
        type: 'status',
        workerId: workerId || 'unknown',
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      } as WorkerStatusMessage);
    }
  });

  registerTaskHandler('echo', async (data) => {
    return data;
  });
}

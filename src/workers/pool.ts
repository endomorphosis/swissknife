// src/workers/pool.ts
//
// Host-only Node worker_threads pool implementation. Private implementation
// detail per `src/module-ownership.json`; browser code must never import
// this module. Use `src/workers/host.ts` instead.
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { createWorker, WorkerResponseMessage, WorkerStatusMessage, WorkerTaskMessage } from './thread.js';
import { ConfigurationManager } from '../config/manager.js';

export interface WorkerPoolOptions {
  size?: number;
  maxConcurrent?: number;
  taskTimeout?: number;
}

export interface WorkerInfo {
  id: string;
  worker: Worker;
  status: 'idle' | 'busy' | 'error';
  lastTask?: string;
  error?: string;
  createdAt: number;
  taskCount: number;
}

export class WorkerPool extends EventEmitter {
  private static instance: WorkerPool;
  private workers: Map<string, WorkerInfo> = new Map();
  private taskQueue: Map<string, {
    taskType: string;
    data: any;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    submittedAt: number;
  }> = new Map();
  private size: number;
  private maxConcurrent: number;
  private taskTimeout: number;

  private constructor(options: WorkerPoolOptions = {}) {
    super();
    const config = ConfigurationManager.getInstance();
    
    // Ensure that config.get returns a number when a default number is provided.
    // Explicitly type the generic for get<T>
    const defaultPoolSize = 4;
    const defaultMaxConcurrent = 10;
    const defaultTaskTimeout = 60000;

    const configPoolSize = config.get<number>('worker.poolSize', defaultPoolSize);
    this.size = options.size ?? (configPoolSize === undefined ? defaultPoolSize : configPoolSize);

    const configMaxConcurrent = config.get<number>('worker.maxConcurrent', defaultMaxConcurrent);
    this.maxConcurrent = options.maxConcurrent ?? (configMaxConcurrent === undefined ? defaultMaxConcurrent : configMaxConcurrent);
    
    const configTaskTimeout = config.get<number>('worker.taskTimeout', defaultTaskTimeout);
    this.taskTimeout = options.taskTimeout ?? (configTaskTimeout === undefined ? defaultTaskTimeout : configTaskTimeout);
  }

  static getInstance(options?: WorkerPoolOptions): WorkerPool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool(options);
    }
    return WorkerPool.instance;
  }

  async initialize(): Promise<void> {
    for (let i = 0; i < this.size; i++) {
      await this.createWorker();
    }
  }

  private async createWorker(): Promise<void> {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const worker = createWorker(workerId);
    
    worker.on('message', (message: WorkerResponseMessage | WorkerStatusMessage) => {
      if (message.type === 'response') {
        const task = this.taskQueue.get(message.taskId);
        if (task) {
          task.resolve(message.result);
          this.taskQueue.delete(message.taskId);
        }
      } else if (message.type === 'status') {
        const workerInfo = this.workers.get(message.workerId);
        if (workerInfo) {
          workerInfo.status = message.status;
          if (message.error) {
            workerInfo.error = message.error;
          }
        }
      }
    });

    worker.on('error', (error) => {
      console.error(`Worker ${workerId} error:`, error);
    });

    this.workers.set(workerId, {
      id: workerId,
      worker,
      status: 'idle',
      createdAt: Date.now(),
      taskCount: 0
    });
  }

  async executeTask<T>(taskId: string, taskType: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.set(taskId, { taskType, data, resolve, reject, submittedAt: Date.now() });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    // Simple round-robin task distribution
    for (const [workerId, workerInfo] of this.workers) {
      if (workerInfo.status === 'idle' && this.taskQueue.size > 0) {
        const [taskId, task] = Array.from(this.taskQueue.entries())[0];
        this.taskQueue.delete(taskId);
        
        workerInfo.status = 'busy';
        workerInfo.lastTask = taskId;
        workerInfo.taskCount++;

        const taskMessage: WorkerTaskMessage = {
          type: 'task',
          taskId,
          taskType: task.taskType,
          data: task.data
        };

        workerInfo.worker.postMessage(taskMessage);
      }
    }
  }

  async shutdown(): Promise<void> {
    const terminationPromises = [];
    for (const workerInfo of this.workers.values()) {
      terminationPromises.push(new Promise<void>((resolve) => {
        workerInfo.worker.once('exit', () => resolve());
        workerInfo.worker.terminate();
      }));
    }
    await Promise.all(terminationPromises);
    this.workers.clear();
    this.taskQueue.clear();
  }
}

export function getWorkerPool(options?: WorkerPoolOptions): WorkerPool {
  return WorkerPool.getInstance(options);
}

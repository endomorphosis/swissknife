import { Worker } from 'worker_threads.js';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';

// Define the structure of messages sent to/from workers
export interface TaskPayload { 
  taskId: string; // Unique ID to correlate requests and responses
  type: string;   // Type of work to perform (e.g., 'compute', 'io')
  data: any;      // Input data for the task
}

export interface WorkerResult { 
  taskId: string; 
  error?: string; // Error message if execution failed
  result?: any;   // Result data if execution succeeded
}

interface QueuedTask {
  payload: TaskPayload;
  resolve: (value: WorkerResult) => void;
  reject: (reason?: any) => void;
}

/**
 * Manages a pool of worker threads for executing background tasks.
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: QueuedTask[] = [];
  private idleWorkers: Worker[] = [];
  private activeTasks = new Map<Worker, QueuedTask>(); // Track which task a worker is running
  private readonly workerScriptPath: string;

  /**
   * Creates a WorkerPool.
   * @param poolSize The number of worker threads to create (defaults to number of CPU cores).
   * @param scriptPath Optional path to the worker script (defaults based on current file location).
   */
  constructor(poolSize: number = os.cpus().length, scriptPath?: string) {
    logger.debug(`Initializing WorkerPool with size ${poolSize}...`);
    // Default worker script path assumes it's in ../execution/ relative to this file
    this.workerScriptPath = scriptPath || path.resolve(__dirname, '../execution/worker-script.js'); 
    
    logger.info(`Worker script path: ${this.workerScriptPath}`);

    for (let i = 0; i < poolSize; i++) {
      this.createWorker(i);
    }
    logger.info(`WorkerPool initialized with ${this.workers.length} workers.`);
  }

  private createWorker(index: number): void {
    try {
      const worker = new Worker(this.workerScriptPath, { workerData: { workerId: index } });
      logger.debug(`Created worker #${index}`);

      worker.on('message', (result: WorkerResult) => {
        logger.debug(`Received message from worker #${index}:`, result);
        const runningTask = this.activeTasks.get(worker);
        if (runningTask && runningTask.payload.taskId === result.taskId) {
          if (result.error) {
            runningTask.reject(new Error(result.error));
          } else {
            runningTask.resolve(result);
          }
          this.activeTasks.delete(worker);
        } else {
           logger.error(`Received result for unknown or mismatched task ID ${result.taskId} from worker #${index}`);
        }
        // Return worker to idle pool and process next task
        this.returnWorkerToPool(worker);
      });

      worker.on('error', (err) => {
        logger.error(`Worker #${index} error:`, err);
        const runningTask = this.activeTasks.get(worker);
        if (runningTask) {
           runningTask.reject(err); // Reject the task the worker was running
           this.activeTasks.delete(worker);
        }
        // Remove the failed worker and potentially replace it
        this.removeWorker(worker);
        // Consider adding logic to replace the worker: this.createWorker(index);
      });

      worker.on('exit', (code) => {
        logger.warn(`Worker #${index} exited with code ${code}`);
        const runningTask = this.activeTasks.get(worker);
         if (runningTask) {
           runningTask.reject(new Error(`Worker exited unexpectedly with code ${code}`)); 
           this.activeTasks.delete(worker);
        }
        // Remove the exited worker
        this.removeWorker(worker);
        // Consider replacing the worker
      });

      this.workers.push(worker);
      this.idleWorkers.push(worker);

    } catch (error) {
       logger.error(`Failed to create worker #${index}:`, error);
       // Handle worker creation failure (e.g., throw, log, try again?)
    }
  }
  
  private returnWorkerToPool(worker: Worker): void {
     logger.debug(`Returning worker to idle pool.`);
     this.idleWorkers.push(worker);
     this.processQueue(); // Check if there are pending tasks
  }

  private removeWorker(worker: Worker): void {
     const workerIndex = this.workers.indexOf(worker);
     if (workerIndex > -1) {
        this.workers.splice(workerIndex, 1);
     }
     const idleIndex = this.idleWorkers.indexOf(worker);
     if (idleIndex > -1) {
        this.idleWorkers.splice(idleIndex, 1);
     }
     this.activeTasks.delete(worker); // Ensure it's removed from active tasks
     logger.info(`Removed worker. Pool size now: ${this.workers.length}`);
  }

  /**
   * Submits a task payload to be executed by an available worker.
   * @param payload The task data including a unique taskId.
   * @returns A promise that resolves or rejects with the WorkerResult.
   */
  submitTask(payload: TaskPayload): Promise<WorkerResult> {
    logger.info(`Submitting task ${payload.taskId} (${payload.type}) to worker pool.`);
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ payload, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Assigns tasks from the queue to idle workers.
   */
  private processQueue(): void {
    if (this.taskQueue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop()!;
      const task = this.taskQueue.shift()!;
      
      logger.debug(`Assigning task ${task.payload.taskId} to worker.`);
      this.activeTasks.set(worker, task); // Track the active task for this worker
      
      worker.postMessage(task.payload);
    } else {
       logger.debug(`Queue empty (${this.taskQueue.length}) or no idle workers (${this.idleWorkers.length}). Waiting.`);
    }
  }

  /**
   * Gracefully shuts down all worker threads in the pool.
   * @returns A promise that resolves when all workers have terminated.
   */
  async shutdown(): Promise<void> {
    logger.info(`Shutting down WorkerPool (${this.workers.length} workers)...`);
    // Wait for all workers to terminate
    await Promise.all(this.workers.map(worker => worker.terminate()));
    this.workers = [];
    this.idleWorkers = [];
    this.taskQueue = []; // Clear queue on shutdown
    this.activeTasks.clear();
    logger.info('WorkerPool shut down complete.');
  }

  getPoolSize(): number {
    return this.workers.length;
  }

  getIdleWorkerCount(): number {
    return this.idleWorkers.length;
  }

  getQueueSize(): number {
    return this.taskQueue.length;
  }
}

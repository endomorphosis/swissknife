// src/workers/worker-pool.ts
//
// Host-only worker pool built on the in-process `WorkerThread` abstraction.
// Private implementation detail per `src/module-ownership.json`, re-exported
// from `src/workers/host.ts` as the recommended in-process worker pool
// engine.

import { EventEmitter } from 'node:events';
import { WorkerThread, WorkerTask, WorkerResult, WorkerTaskHandler } from './worker-thread.js';
import { nanoid } from 'nanoid';

/**
 * Options for the worker pool
 */
export interface WorkerPoolOptions {
  minWorkers?: number;
  maxWorkers?: number;
  maxIdleTime?: number; // Milliseconds before worker auto-termination when idle
  taskTimeout?: number; // Default milliseconds before task timeout
  taskHandlers?: Record<string, WorkerTaskHandler>;
}

/**
 * Worker pool for managing multiple worker threads
 */
export class WorkerPool extends EventEmitter {
  private static instance: WorkerPool;
  private workers: Map<string, WorkerThread> = new Map();
  private taskQueue: WorkerTask[] = [];
  private running: boolean = false;
  private minWorkers: number;
  private maxWorkers: number;
  private maxIdleTime: number;
  private taskTimeout: number;
  private taskHandlers: Record<string, WorkerTaskHandler> = {};
  private processingInterval: NodeJS.Timeout | null = null;
  
  private constructor(options: WorkerPoolOptions = {}) {
    super();
    this.minWorkers = options.minWorkers || 1;
    this.maxWorkers = options.maxWorkers || 5;
    this.maxIdleTime = options.maxIdleTime || 5 * 60 * 1000; // 5 minutes default
    this.taskTimeout = options.taskTimeout || 30 * 1000; // 30 seconds default
    this.taskHandlers = options.taskHandlers || {};
  }
  
  /**
   * Get the singleton instance
   */
  static getInstance(options: WorkerPoolOptions = {}): WorkerPool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool(options);
    }
    return WorkerPool.instance;
  }
  
  /**
   * Start the worker pool
   */
  start(): void {
    if (this.running) {
      return;
    }
    
    this.running = true;
    
    // Initialize minimum number of workers
    for (let i = 0; i < this.minWorkers; i++) {
      this.createWorker();
    }
    
    // Start processing queue
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 100); // Process queue every 100ms
    
    this.emit('started');
  }
  
  /**
   * Stop the worker pool
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    
    this.running = false;
    
    // Stop processing queue
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    // Terminate all workers
    for (const worker of this.workers.values()) {
      worker.terminate();
    }
    
    // Clear workers and queue
    this.workers.clear();
    this.taskQueue = [];
    
    this.emit('stopped');
  }
  
  /**
   * Submit a task to the worker pool
   * @param taskType Type of task to execute
   * @param args Arguments for the task
   * @param options Additional options for the task
   * @returns Promise that resolves with the task result
   */
  async submitTask(
    taskType: string,
    args: any = {},
    options: {
      priority?: number;
      timeout?: number;
    } = {}
  ): Promise<WorkerResult> {
    // Check if task type is supported
    if (!this.taskHandlers[taskType]) {
      throw new Error(`Task type not supported: ${taskType}`);
    }
    
    // Create task
    const task: WorkerTask = {
      id: nanoid(),
      type: taskType,
      args,
      priority: options.priority || 0,
      createdAt: new Date(),
      timeout: options.timeout || this.taskTimeout
    };
    
    // Add task to queue
    this.enqueueTask(task);
    
    // Start worker pool if not running
    if (!this.running) {
      this.start();
    }
    
    // Return promise that resolves when task is completed
    return new Promise((resolve, reject) => {
      const taskCompletedHandler = (event: any) => {
        if (event.result.taskId === task.id) {
          this.removeListener('taskCompleted', taskCompletedHandler);
          
          if (event.result.success) {
            resolve(event.result);
          } else {
            reject(event.result.error);
          }
        }
      };
      
      this.on('taskCompleted', taskCompletedHandler);
    });
  }
  
  /**
   * Add a task to the queue
   * @param task Task to add to the queue
   */
  private enqueueTask(task: WorkerTask): void {
    // Add task to queue
    this.taskQueue.push(task);
    
    // Sort queue by priority (higher priority first)
    this.taskQueue.sort((a, b) => {
      // First by priority
      if (a.priority !== b.priority) {
        return (b.priority || 0) - (a.priority || 0);
      }
      
      // Then by creation time (older first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    
    // Emit task queued event
    this.emit('taskQueued', { task });
    
    // Process queue immediately
    if (this.running) {
      this.processQueue();
    }
  }
  
  /**
   * Process the task queue
   */
  private processQueue(): void {
    // Skip if no tasks in queue
    if (this.taskQueue.length === 0) {
      return;
    }
    
    // Try to find an idle worker
    const idleWorker = this.findIdleWorker();
    
    if (idleWorker) {
      // Get next task
      const task = this.taskQueue.shift();
      
      if (!task) {
        return;
      }
      
      // Assign task to worker
      this.assignTaskToWorker(task, idleWorker);
    } else if (this.workers.size < this.maxWorkers) {
      // Create a new worker if below max capacity
      this.createWorker();
    }
  }
  
  /**
   * Find an idle worker
   * @returns Idle worker or undefined if none available
   */
  private findIdleWorker(): WorkerThread | undefined {
    for (const worker of this.workers.values()) {
      if (worker.isIdle()) {
        return worker;
      }
    }
    return undefined;
  }
  
  /**
   * Assign a task to a worker
   * @param task Task to assign
   * @param worker Worker to assign to
   */
  private assignTaskToWorker(task: WorkerTask, worker: WorkerThread): void {
    worker.executeTask(task).then(
      (_result) => {
        // Task completed successfully, handled by worker event
      },
      (error) => {
        // Task failed, emit error
        console.error(`Task ${task.id} failed:`, error);
        
        this.emit('taskError', {
          task,
          error
        });
      }
    );
  }
  
  /**
   * Create a new worker
   * @returns The created worker
   */
  private createWorker(): WorkerThread {
    const workerId = nanoid();
    
    // Create worker
    const worker = new WorkerThread({
      id: workerId,
      maxIdleTime: this.maxIdleTime,
      taskTimeout: this.taskTimeout,
      handlers: this.taskHandlers
    });
    
    // Register event handlers
    worker.on('taskStarted', (event) => {
      this.emit('taskStarted', event);
    });
    
    worker.on('taskCompleted', (event) => {
      this.emit('taskCompleted', event);
    });
    
    worker.on('terminated', (event) => {
      // Remove worker from pool
      this.workers.delete(event.workerId);
      
      // Create a new worker if below minimum capacity
      if (this.running && this.workers.size < this.minWorkers) {
        this.createWorker();
      }
      
      this.emit('workerTerminated', event);
    });
    
    // Register handlers on worker
    for (const [type, handler] of Object.entries(this.taskHandlers)) {
      worker.registerHandler(type, handler);
    }
    
    // Add worker to pool
    this.workers.set(workerId, worker);
    
    // Emit worker created event
    this.emit('workerCreated', {
      workerId,
      worker
    });
    
    return worker;
  }
  
  /**
   * Register a task handler
   * @param type Task type to handle
   * @param handler Function to handle the task
   */
  registerTaskHandler(type: string, handler: WorkerTaskHandler): void {
    // Register handler in pool
    this.taskHandlers[type] = handler;
    
    // Register handler on all workers
    for (const worker of this.workers.values()) {
      worker.registerHandler(type, handler);
    }
  }
  
  /**
   * Get the number of workers
   */
  getWorkerCount(): number {
    return this.workers.size;
  }
  
  /**
   * Get the number of idle workers
   */
  getIdleWorkerCount(): number {
    let count = 0;
    for (const worker of this.workers.values()) {
      if (worker.isIdle()) {
        count++;
      }
    }
    return count;
  }
  
  /**
   * Get the number of tasks in the queue
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }
  
  /**
   * Get stats for all workers
   */
  getStats(): any {
    const workerStats: any = {};
    
    for (const [workerId, worker] of this.workers.entries()) {
      workerStats[workerId] = {
        status: worker.getStatus(),
        stats: worker.getStats(),
        currentTask: worker.getCurrentTask()
      };
    }
    
    return {
      running: this.running,
      totalWorkers: this.workers.size,
      workers: this.workers.size,
      idleWorkers: this.getIdleWorkerCount(),
      queueLength: this.taskQueue.length,
      workerStats
    };
  }
  
  /**
   * Get workers map (for testing purposes)
   */
  getWorkers(): Map<string, WorkerThread> {
    return this.workers;
  }
}
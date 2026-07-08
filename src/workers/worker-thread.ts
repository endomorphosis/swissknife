// src/workers/worker-thread.ts
//
// Host-only worker abstraction (in-process task execution). Private
// implementation detail per `src/module-ownership.json`, re-exported from
// `src/workers/host.ts` as the recommended in-process worker pool engine.

import { EventEmitter } from 'node:events';

/**
 * Status of a worker thread
 */
export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  TERMINATED = 'terminated'
}

/**
 * Task to be executed by a worker thread
 */
export interface WorkerTask {
  id: string;
  type: string;
  args: any;
  priority?: number; // Higher number = higher priority
  createdAt: Date;
  timeout?: number; // Milliseconds before timeout
}

/**
 * Result of a worker task execution
 */
export interface WorkerResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: Error;
  timing: {
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  };
}

/**
 * Options for a worker thread
 */
export interface WorkerThreadOptions {
  id: string;
  name?: string;
  maxIdleTime?: number; // Milliseconds before auto-termination when idle
  taskTimeout?: number; // Default milliseconds before task timeout
  handlers?: Record<string, WorkerTaskHandler>;
}

/**
 * Type definition for a task handler function
 */
export type WorkerTaskHandler = (args: any) => Promise<any>;

/**
 * Worker thread for executing tasks
 * Uses an event-based architecture for communication
 */
export class WorkerThread extends EventEmitter {
  private id: string;
  private name: string;
  private status: WorkerStatus = WorkerStatus.IDLE;
  private maxIdleTime: number;
  private taskTimeout: number;
  private currentTask: WorkerTask | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private taskTimer: NodeJS.Timeout | null = null;
  private handlers: Map<string, WorkerTaskHandler> = new Map();
  private stats = {
    tasksProcessed: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    tasksTimedOut: 0,
    totalProcessingTimeMs: 0
  };
  
  constructor(options: WorkerThreadOptions) {
    super();
    this.id = options.id;
    this.name = options.name || `worker-${options.id}`;
    this.maxIdleTime = options.maxIdleTime || 5 * 60 * 1000; // 5 minutes default
    this.taskTimeout = options.taskTimeout || 30 * 1000; // 30 seconds default
    
    // Register handlers if provided
    if (options.handlers) {
      for (const [type, handler] of Object.entries(options.handlers)) {
        this.registerHandler(type, handler);
      }
    }
    
    // Start idle timer
    this.startIdleTimer();
  }
  
  /**
   * Get the worker ID
   */
  getId(): string {
    return this.id;
  }
  
  /**
   * Get the worker name
   */
  getName(): string {
    return this.name;
  }
  
  /**
   * Get the worker status
   */
  getStatus(): WorkerStatus {
    return this.status;
  }
  
  /**
   * Get the current task being executed
   */
  getCurrentTask(): WorkerTask | null {
    return this.currentTask;
  }
  
  /**
   * Get worker statistics
   */
  getStats(): any {
    return { ...this.stats };
  }
  
  /**
   * Check if the worker is idle
   */
  isIdle(): boolean {
    return this.status === WorkerStatus.IDLE;
  }
  
  /**
   * Register a task handler
   * @param type Task type to handle
   * @param handler Function to handle the task
   */
  registerHandler(type: string, handler: WorkerTaskHandler): void {
    this.handlers.set(type, handler);
  }
  
  /**
   * Check if the worker can handle a task type
   * @param type Task type to check
   */
  canHandle(type: string): boolean {
    return this.handlers.has(type);
  }
  
  /**
   * Execute a task
   * @param task Task to execute
   * @returns Promise that resolves with the task result
   */
  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    // Check if worker is available
    if (this.status !== WorkerStatus.IDLE) {
      throw new Error(`Worker ${this.id} is not idle (${this.status})`);
    }
    
    // Check if task type is supported
    if (!this.canHandle(task.type)) {
      throw new Error(`Worker ${this.id} cannot handle task type: ${task.type}`);
    }
    
    // Reset idle timer
    this.resetIdleTimer();
    
    // Set worker as busy
    this.status = WorkerStatus.BUSY;
    this.currentTask = task;
    
    // Prepare result object
    const startedAt = new Date();
    const result: WorkerResult = {
      taskId: task.id,
      success: false,
      timing: {
        startedAt,
        completedAt: startedAt, // Will be updated when complete
        durationMs: 0
      }
    };
    
    // Start task timeout timer
    const timeout = task.timeout || this.taskTimeout;
    this.taskTimer = setTimeout(() => {
      this.handleTaskTimeout(task);
    }, timeout);
    
    try {
      // Get handler for this task type
      const handler = this.handlers.get(task.type)!;
      
      // Emit task started event
      this.emit('taskStarted', {
        workerId: this.id,
        task
      });
      
      // Execute task
      const taskResult = await handler(task.args);
      
      // Update result
      result.success = true;
      result.result = taskResult;
      
      // Update stats
      this.stats.tasksProcessed++;
      this.stats.tasksSucceeded++;
      
      return this.completeTask(result);
    } catch (error: any) {
      // Update result
      result.success = false;
      result.error = error;
      
      // Update stats
      this.stats.tasksProcessed++;
      this.stats.tasksFailed++;
      
      // Set worker as error
      this.status = WorkerStatus.ERROR;
      
      return this.completeTask(result);
    }
  }
  
  /**
   * Complete a task and reset worker state
   * @param result Task result
   */
  private completeTask(result: WorkerResult): WorkerResult {
    // Clear task timeout timer
    if (this.taskTimer) {
      clearTimeout(this.taskTimer);
      this.taskTimer = null;
    }
    
    // Update timing
    result.timing.completedAt = new Date();
    result.timing.durationMs = result.timing.completedAt.getTime() - result.timing.startedAt.getTime();
    
    // Update stats
    this.stats.totalProcessingTimeMs += result.timing.durationMs;
    
    // Emit task completed event
    this.emit('taskCompleted', {
      workerId: this.id,
      result
    });
    
    // Reset state
    this.currentTask = null;
    this.status = WorkerStatus.IDLE;
    
    // Restart idle timer
    this.startIdleTimer();
    
    return result;
  }
  
  /**
   * Handle task timeout
   * @param task Task that timed out
   */
  private handleTaskTimeout(task: WorkerTask): void {
    // Update stats
    this.stats.tasksProcessed++;
    this.stats.tasksFailed++;
    this.stats.tasksTimedOut++;
    
    // Create result
    const result: WorkerResult = {
      taskId: task.id,
      success: false,
      error: new Error(`Task ${task.id} timed out after ${task.timeout || this.taskTimeout}ms`),
      timing: {
        startedAt: new Date(Date.now() - (task.timeout || this.taskTimeout)),
        completedAt: new Date(),
        durationMs: task.timeout || this.taskTimeout
      }
    };
    
    // Emit task completed event
    this.emit('taskCompleted', {
      workerId: this.id,
      result
    });
    
    // Reset state
    this.currentTask = null;
    this.status = WorkerStatus.IDLE;
    
    // Restart idle timer
    this.startIdleTimer();
  }
  
  /**
   * Start the idle timer
   */
  private startIdleTimer(): void {
    // Clear any existing idle timer
    this.resetIdleTimer();
    
    // Start new idle timer
    this.idleTimer = setTimeout(() => {
      this.terminate();
    }, this.maxIdleTime);
  }
  
  /**
   * Reset the idle timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
  
  /**
   * Terminate the worker
   */
  terminate(): void {
    // Clear timers
    this.resetIdleTimer();
    
    if (this.taskTimer) {
      clearTimeout(this.taskTimer);
      this.taskTimer = null;
    }
    
    // Set status
    this.status = WorkerStatus.TERMINATED;
    
    // Emit terminated event
    this.emit('terminated', {
      workerId: this.id
    });
    
    // Remove all listeners
    this.removeAllListeners();
  }
}
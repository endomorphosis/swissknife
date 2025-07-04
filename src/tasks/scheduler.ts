// src/tasks/scheduler.ts

import { TaskID } from '../types/common';
import { Task, TaskStatus } from '../types/task';
import { logger } from '../utils/logger';

/**
 * Options for the TaskScheduler
 */
export interface TaskSchedulerOptions {
  maxConcurrent?: number;
  pollIntervalMs?: number;
}

/**
 * A simple priority-based task scheduler
 * 
 * This is a basic implementation for Phase 2 that will be replaced
 * with a Fibonacci Heap implementation in Phase 3.
 */
export class TaskScheduler {
  private static instance: TaskScheduler;
  private taskQueue: Task[] = [];
  private processing: Set<TaskID> = new Set();
  private maxConcurrent: number;
  private pollIntervalMs: number;
  private intervalId?: NodeJS.Timeout;
  private onTaskReady?: (task: Task) => Promise<void>;

  /**
   * Creates a new TaskScheduler
   * @param options Scheduler options
   */
  private constructor(options: TaskSchedulerOptions = {}) {
    this.maxConcurrent = options.maxConcurrent || 10;
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    logger.info(`TaskScheduler initialized with maxConcurrent=${this.maxConcurrent}, pollInterval=${this.pollIntervalMs}ms`);
  }

  /**
   * Gets the singleton instance of the TaskScheduler
   * @param options Scheduler options
   * @returns The TaskScheduler instance
   */
  static getInstance(options: TaskSchedulerOptions = {}): TaskScheduler {
    if (!TaskScheduler.instance) {
      TaskScheduler.instance = new TaskScheduler(options);
    }
    return TaskScheduler.instance;
  }

  /**
   * Starts the scheduler
   * @param onTaskReady Callback function to execute when a task is ready
   */
  start(onTaskReady: (task: Task) => Promise<void>): void {
    if (this.intervalId) {
      logger.warn('TaskScheduler already started');
      return;
    }

    this.onTaskReady = onTaskReady;
    this.intervalId = setInterval(() => this.processQueue(), this.pollIntervalMs);
    logger.info('TaskScheduler started');
  }

  /**
   * Stops the scheduler
   */
  stop(): void {
    if (!this.intervalId) {
      logger.warn('TaskScheduler not running');
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = undefined;
    logger.info('TaskScheduler stopped');
  }

  /**
   * Schedules a task for execution
   * @param task The task to schedule
   */
  scheduleTask(task: Task): void {
    if (task.status !== TaskStatus.SCHEDULED) {
      logger.warn(`Task ${task.id} has incorrect status: ${task.status}, expected: ${TaskStatus.SCHEDULED}`);
    }

    // Add task to queue
    this.taskQueue.push(task);
    logger.debug(`Task ${task.id} added to queue, queue size: ${this.taskQueue.length}`);

    // If the queue was empty, we might need to process immediately
    if (this.taskQueue.length === 1 && this.processing.size < this.maxConcurrent) {
      this.processQueue();
    }
  }

  /**
   * Processes the task queue
   */
  private processQueue(): void {
    if (!this.onTaskReady) {
      logger.warn('TaskScheduler has no onTaskReady handler');
      return;
    }

    if (this.processing.size >= this.maxConcurrent) {
      logger.debug(`Already processing ${this.processing.size} tasks, max: ${this.maxConcurrent}`);
      return;
    }

    if (this.taskQueue.length === 0) {
      return;
    }

    // Sort by priority (higher number = higher priority)
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    // Process as many tasks as we can
    while (this.processing.size < this.maxConcurrent && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      this.processing.add(task.id);

      // Execute task asynchronously
      this.onTaskReady(task)
        .catch(error => {
          logger.error(`Error executing task ${task.id}:`, error);
        })
        .finally(() => {
          // Remove from processing set
          this.processing.delete(task.id);
          
          // Process more tasks if available
          if (this.taskQueue.length > 0 && this.processing.size < this.maxConcurrent) {
            this.processQueue();
          }
        });
    }
  }

  /**
   * Gets the current queue size
   * @returns Number of tasks in the queue
   */
  getQueueSize(): number {
    return this.taskQueue.length;
  }

  /**
   * Gets the number of tasks currently being processed
   * @returns Number of tasks being processed
   */
  getProcessingCount(): number {
    return this.processing.size;
  }

  /**
   * Clears the task queue
   */
  clearQueue(): void {
    const count = this.taskQueue.length;
    this.taskQueue = [];
    logger.info(`Cleared ${count} tasks from queue`);
  }

  /**
   * Checks if a task is currently being processed
   * @param taskId The ID of the task to check
   * @returns True if the task is being processed
   */
  isTaskProcessing(taskId: TaskID): boolean {
    return this.processing.has(taskId);
  }
}
/**
 * Worker Pool Implementation
 */
import { EventEmitter } from 'events';

/**
 * Worker information
 */
export class WorkerInfo {
  id;
  status;
  worker;
  
  constructor(id, worker) {
    this.id = id;
    this.status = 'initializing';
    this.worker = worker;
  }
}

/**
 * Worker Pool for managing worker threads
 */
export class WorkerPool extends EventEmitter {
  static instance;
  
  constructor(options = {}) {
    super();
    this.options = {
      size: options.size || 4,
      maxConcurrent: options.maxConcurrent || 8,
      taskTimeout: options.taskTimeout || 30000
    };
    this.workers = new Map();
    this.tasks = new Map();
  }
  
  static getInstance(options = {}) {
    if (!this.instance) {
      this.instance = new WorkerPool(options);
    }
    return this.instance;
  }
  
  async initialize() {
    // Create workers
    for (let i = 0; i < this.options.size; i++) {
      const workerId = i.toString();
      await this.createWorker(workerId);
    }
    return this;
  }
  
  async createWorker(id) {
    // Create a worker thread
    const { Worker } = require('worker_threads');
    const worker = new Worker('worker-script.js');
    
    // Set up worker
    const workerInfo = new WorkerInfo(id, worker);
    this.workers.set(id, workerInfo);
    
    // Set up event listeners
    worker.on('message', (message) => this.handleWorkerMessage(id, message));
    worker.on('error', (error) => this.handleWorkerError(id, error));
    worker.on('exit', (code) => this.handleWorkerExit(id, code));
    
    // Initialize the worker
    worker.postMessage({
      type: 'init',
      workerId: id,
      options: this.options
    });
    
    return workerInfo;
  }
  
  handleWorkerMessage(workerId, message) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;
    
    if (message.type === 'status') {
      workerInfo.status = message.status;
      this.emit('worker:status', { workerId, status: message.status });
    } else if (message.type === 'response') {
      const task = this.tasks.get(message.taskId);
      if (task) {
        task.resolve(message.result);
        this.tasks.delete(message.taskId);
      }
    }
  }
  
  handleWorkerError(workerId, error) {
    this.emit('worker:error', { workerId, error });
  }
  
  handleWorkerExit(workerId, code) {
    if (code !== 0) {
      this.createWorker(workerId);
    }
  }
  
  async executeTask(taskType, taskData) {
    // Generate a task ID
    const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    
    // Find an available worker
    let availableWorkerId = null;
    for (const [id, info] of this.workers.entries()) {
      if (info.status === 'idle') {
        availableWorkerId = id;
        break;
      }
    }
    
    if (!availableWorkerId) {
      // No idle workers - could implement queueing here
      throw new Error('No available workers');
    }
    
    // Create a promise for the task
    const taskPromise = new Promise((resolve, reject) => {
      this.tasks.set(taskId, { resolve, reject, taskType, taskData, startTime: Date.now() });
      
      // Set a timeout
      setTimeout(() => {
        if (this.tasks.has(taskId)) {
          const task = this.tasks.get(taskId);
          this.tasks.delete(taskId);
          this.emit('task:timeout', { taskId, taskType, taskData });
          task.reject(new Error(`Task ${taskId} timed out after ${this.options.taskTimeout}ms`));
        }
      }, this.options.taskTimeout);
    });
    
    // Send the task to the worker
    const worker = this.workers.get(availableWorkerId).worker;
    worker.postMessage({
      type: 'task',
      taskId,
      taskType,
      taskData
    });
    
    return taskPromise;
  }
  
  checkTimeouts() {
    const now = Date.now();
    for (const [taskId, task] of this.tasks.entries()) {
      if (now - task.startTime > this.options.taskTimeout) {
        this.tasks.delete(taskId);
        this.emit('task:timeout', { taskId, taskType: task.taskType, taskData: task.taskData });
        task.reject(new Error(`Task ${taskId} timed out after ${this.options.taskTimeout}ms`));
      }
    }
  }
  
  getStats() {
    const stats = {
      totalWorkers: this.workers.size,
      idleWorkers: 0,
      busyWorkers: 0,
      initializingWorkers: 0,
      pendingTasks: this.tasks.size
    };
    
    for (const workerInfo of this.workers.values()) {
      if (workerInfo.status === 'idle') {
        stats.idleWorkers++;
      } else if (workerInfo.status === 'busy') {
        stats.busyWorkers++;
      } else if (workerInfo.status === 'initializing') {
        stats.initializingWorkers++;
      }
    }
    
    return stats;
  }
  
  async shutdown() {
    // Terminate all workers
    for (const workerInfo of this.workers.values()) {
      await workerInfo.worker.terminate();
    }
    
    // Clear tasks and workers
    this.tasks.clear();
    this.workers.clear();
  }
}

// Message type definitions
export interface WorkerInitMessage {
  type: 'init';
  workerId: string;
  options: any;
}

export interface WorkerTaskMessage {
  type: 'task';
  taskId: string;
  taskType: string;
  taskData: any;
}

export interface WorkerResponseMessage {
  type: 'response';
  taskId: string;
  result: any;
}

export interface WorkerStatusMessage {
  type: 'status';
  workerId: string;
  status: 'initializing' | 'idle' | 'busy';
}

export default WorkerPool;

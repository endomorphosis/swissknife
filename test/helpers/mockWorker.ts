/**
 * Mock worker thread implementation for testing
 */

import { EventEmitter } from 'events';

export interface MockWorkerOptions {
  workerId?: string;
  autoRespond?: boolean;
  errorProbability?: number;
  responseDelay?: number;
  taskHandlers?: Record<string, (data: any) => Promise<any>>;
}

export interface MockWorkerMessage {
  type: string;
  [key: string]: any;
}

/**
 * Creates a mock worker implementation for testing
 */
export function createMockWorker(options: MockWorkerOptions = {}) {
  const {
    workerId = `worker-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    autoRespond = true,
    errorProbability = 0,
    responseDelay = 0,
    taskHandlers = {}
  } = options;
  
  const events = new EventEmitter();
  const messageHistory: MockWorkerMessage[] = [];
  let status: 'idle' | 'busy' | 'error' = 'idle';
  let currentTaskId: string | null = null;
  
  const worker = {
    workerId,
    status,
    messageHistory,
    events,
    
    postMessage(message: MockWorkerMessage) {
      messageHistory.push(message);
      events.emit('message', message);
      
      if (autoRespond && message.type === 'task') {
        // Set status to busy when task received
        status = 'busy';
        currentTaskId = message.taskId;
        
        // Send status update
        events.emit('status', {
          type: 'status',
          workerId,
          status: 'busy'
        });
        
        // Process task after delay
        setTimeout(async () => {
          try {
            // Randomly generate errors based on probability
            if (Math.random() < errorProbability) {
              throw new Error(`Random error in worker ${workerId} for task ${message.taskId}`);
            }
            
            // Execute task handler if available, otherwise return mock result
            let result;
            if (taskHandlers[message.taskType]) {
              result = await taskHandlers[message.taskType](message.data);
            } else {
              result = {
                message: `Mock result for task ${message.taskId} (${message.taskType})`,
                input: message.data
              };
            }
            
            // Send response
            events.emit('message', {
              type: 'response',
              taskId: message.taskId,
              result
            });
            
            // Set status back to idle
            status = 'idle';
            currentTaskId = null;
            
            // Send status update
            events.emit('status', {
              type: 'status',
              workerId,
              status: 'idle'
            });
          } catch (error) {
            // Send error response
            events.emit('message', {
              type: 'response',
              taskId: message.taskId,
              error: error.message || String(error)
            });
            
            // Set status to error
            status = 'error';
            currentTaskId = null;
            
            // Send status update
            events.emit('status', {
              type: 'status',
              workerId,
              status: 'error',
              error: error.message || String(error)
            });
          }
        }, responseDelay);
      }
    },
    
    on(event: string, listener: (...args: any[]) => void) {
      events.on(event, listener);
      return worker;
    },
    
    once(event: string, listener: (...args: any[]) => void) {
      events.once(event, listener);
      return worker;
    },
    
    off(event: string, listener: (...args: any[]) => void) {
      events.off(event, listener);
      return worker;
    },
    
    terminate() {
      events.emit('exit', 0);
      events.removeAllListeners();
      return Promise.resolve();
    },
    
    // Helper methods for testing
    setStatus(newStatus: 'idle' | 'busy' | 'error') {
      status = newStatus;
      events.emit('status', {
        type: 'status',
        workerId,
        status
      });
    },
    
    sendManualResponse(taskId: string, result: any) {
      events.emit('message', {
        type: 'response',
        taskId,
        result
      });
    },
    
    sendManualError(taskId: string, error: string) {
      events.emit('message', {
        type: 'response',
        taskId,
        error
      });
    }
  };
  
  return worker;
}

/**
 * Creates a mock worker pool for testing
 */
export function createMockWorkerPool(size = 2, options: Omit<MockWorkerOptions, 'workerId'> = {}) {
  const workers = new Map<string, ReturnType<typeof createMockWorker>>();
  const events = new EventEmitter();
  
  // Create workers
  for (let i = 0; i < size; i++) {
    const workerId = `worker-${i}`;
    const worker = createMockWorker({ ...options, workerId });
    workers.set(workerId, worker);
    
    // Forward worker events to pool
    worker.on('message', (message) => {
      events.emit('workerMessage', { workerId, message });
    });
    
    worker.on('status', (status) => {
      events.emit('workerStatus', { workerId, status });
    });
    
    worker.on('exit', (code) => {
      events.emit('workerExit', { workerId, code });
    });
  }
  
  return {
    workers,
    events,
    
    getWorker(workerId: string) {
      return workers.get(workerId);
    },
    
    getIdleWorker() {
      for (const [id, worker] of workers.entries()) {
        if (worker.status === 'idle') {
          return worker;
        }
      }
      return null;
    },
    
    getAllWorkers() {
      return Array.from(workers.values());
    },
    
    on(event: string, listener: (...args: any[]) => void) {
      events.on(event, listener);
      return this;
    },
    
    off(event: string, listener: (...args: any[]) => void) {
      events.off(event, listener);
      return this;
    },
    
    terminateAll() {
      const promises = [];
      for (const worker of workers.values()) {
        promises.push(worker.terminate());
      }
      return Promise.all(promises);
    }
  };
}
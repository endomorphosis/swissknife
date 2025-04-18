import { WorkerPool, WorkerInfo, WorkerInitMessage, WorkerTaskMessage, WorkerResponseMessage, WorkerStatusMessage } from '../../../src/workers/pool';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { EventEmitter } from 'events';

// Mock Worker implementation for testing
class MockWorker extends EventEmitter {
  postMessage: sinon.SinonStub;
  terminate: sinon.SinonStub;
  
  constructor() {
    super();
    this.postMessage = sinon.stub();
    this.terminate = sinon.stub().callsFake(() => {
      this.emit('exit', 0);
    });
  }
}

// Mock the worker_threads module
jest.mock('worker_threads', () => {
  return {
    Worker: function MockWorker() {
      return new (require('../mocks/worker').MockWorker)();
    },
    isMainThread: true
  };
});

describe('Worker Pool', () => {
  let workerPool: WorkerPool;
  
  beforeEach(() => {
    // Reset the singleton for testing
    (WorkerPool as any).instance = null;
    workerPool = WorkerPool.getInstance({
      size: 2,
      maxConcurrent: 4,
      taskTimeout: 1000
    });
  });
  
  afterEach(async () => {
    await workerPool.shutdown();
  });
  
  it('should initialize with the specified number of workers', async () => {
    await workerPool.initialize();
    
    const stats = workerPool.getStats();
    expect(stats.totalWorkers).to.equal(2);
  });
  
  it('should execute tasks on worker threads', async () => {
    // Create a spy for the worker.postMessage method
    const postMessageSpy = sinon.spy(MockWorker.prototype, 'postMessage');
    
    await workerPool.initialize();
    
    // Set up a mock response for a specific task
    const mockWorker = (workerPool as any).workers.values().next().value.worker as MockWorker;
    mockWorker.emit('message', {
      type: 'status',
      workerId: '0',
      status: 'idle'
    } as WorkerStatusMessage);
    
    // Execute a task
    const taskPromise = workerPool.executeTask('echo', { test: 'value' });
    
    // The first call should be the init message, the second call should be our task
    expect(postMessageSpy.callCount).to.be.at.least(2);
    
    // Find the task message
    const taskMessage = postMessageSpy.getCalls().find(call => {
      const message = call.args[0];
      return message.type === 'task' && message.taskType === 'echo';
    });
    
    expect(taskMessage).to.exist;
    
    // Simulate worker response
    const taskId = (taskMessage.args[0] as WorkerTaskMessage).taskId;
    mockWorker.emit('message', {
      type: 'response',
      taskId,
      result: { test: 'value' }
    } as WorkerResponseMessage);
    
    // Task should resolve with the result
    const result = await taskPromise;
    expect(result).to.deep.equal({ test: 'value' });
    
    // Restore the spy
    postMessageSpy.restore();
  });
  
  it('should handle worker errors', async () => {
    await workerPool.initialize();
    
    // Set up a mock worker
    const mockWorker = (workerPool as any).workers.values().next().value.worker as MockWorker;
    mockWorker.emit('message', {
      type: 'status',
      workerId: '0',
      status: 'idle'
    } as WorkerStatusMessage);
    
    // Set up an error listener
    const errorSpy = sinon.spy();
    workerPool.on('worker:error', errorSpy);
    
    // Trigger a worker error
    mockWorker.emit('error', new Error('Test error'));
    
    // Error event should be emitted
    expect(errorSpy.calledOnce).to.be.true;
    expect(errorSpy.firstCall.args[0].error.message).to.equal('Test error');
  });
  
  it('should handle task timeouts', async () => {
    // Use fake timers
    const clock = sinon.useFakeTimers();
    
    await workerPool.initialize();
    
    // Set up a mock worker
    const mockWorker = (workerPool as any).workers.values().next().value.worker as MockWorker;
    mockWorker.emit('message', {
      type: 'status',
      workerId: '0',
      status: 'idle'
    } as WorkerStatusMessage);
    
    // Set up a timeout listener
    const timeoutSpy = sinon.spy();
    workerPool.on('task:timeout', timeoutSpy);
    
    // Execute a task
    const taskPromise = workerPool.executeTask('echo', { test: 'value' });
    
    // Advance time past the timeout
    clock.tick(1500);
    
    // Force the timeout checker to run
    (workerPool as any).checkTimeouts();
    
    // Timeout event should be emitted
    expect(timeoutSpy.calledOnce).to.be.true;
    
    // Task should reject with timeout error
    try {
      await taskPromise;
      expect.fail('Should have timed out');
    } catch (error) {
      expect(error.message).to.include('timed out');
    }
    
    // Restore real timers
    clock.restore();
  });
  
  it('should track worker status changes', async () => {
    await workerPool.initialize();
    
    // Set up a status change listener
    const statusSpy = sinon.spy();
    workerPool.on('worker:status', statusSpy);
    
    // Get a mock worker
    const mockWorker = (workerPool as any).workers.values().next().value.worker as MockWorker;
    
    // Emit status changes
    mockWorker.emit('message', {
      type: 'status',
      workerId: '0',
      status: 'busy'
    } as WorkerStatusMessage);
    
    mockWorker.emit('message', {
      type: 'status',
      workerId: '0',
      status: 'idle'
    } as WorkerStatusMessage);
    
    // Status events should be emitted
    expect(statusSpy.callCount).to.equal(2);
    expect(statusSpy.firstCall.args[0].status).to.equal('busy');
    expect(statusSpy.secondCall.args[0].status).to.equal('idle');
  });
  
  it('should provide worker pool statistics', async () => {
    await workerPool.initialize();
    
    // Get initial stats
    const initialStats = workerPool.getStats();
    expect(initialStats.totalWorkers).to.equal(2);
    expect(initialStats.pendingTasks).to.equal(0);
    
    // Mock worker statuses
    const workers = Array.from((workerPool as any).workers.values());
    workers[0].status = 'idle';
    workers[1].status = 'busy';
    
    // Get updated stats
    const updatedStats = workerPool.getStats();
    expect(updatedStats.idleWorkers).to.equal(1);
    expect(updatedStats.busyWorkers).to.equal(1);
  });
  
  it('should handle worker replacement', async () => {
    const createWorkerSpy = sinon.spy((workerPool as any), 'createWorker');
    
    await workerPool.initialize();
    
    // Reset the spy count after initialization
    createWorkerSpy.resetHistory();
    
    // Get a mock worker
    const mockWorker = (workerPool as any).workers.values().next().value.worker as MockWorker;
    const workerId = (workerPool as any).workers.values().next().value.id;
    
    // Trigger worker exit with non-zero code
    mockWorker.emit('exit', 1);
    
    // A new worker should be created
    expect(createWorkerSpy.calledOnce).to.be.true;
    
    // Clean up
    createWorkerSpy.restore();
  });
});
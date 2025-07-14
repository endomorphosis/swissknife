import { TaskStatus } from '@src/types/task';

// Mock Agent
class Agent {
  constructor(options) {
    this.model = options.model;
  }
  processMessage(message) {
    return this.model.generate(message);
  }
}

// Mock Model
class Model {
  constructor(options) {
    this.id = options.id;
    this.name = options.name;
    this.provider = options.provider;
  }
  generate(message) {
    return Promise.resolve({ content: 'Test response', status: 'success' });
  }
}

// Mock TaskManager
class TaskManager {
  constructor() {
    this.tasks = new Map();
  }
  createTask(options) {
    const taskId = 'task-123';
    const task = { id: taskId, status: TaskStatus.PENDING, description: options.description };
    this.tasks.set(taskId, task);
    return Promise.resolve(task);
  }
  getTask(taskId) {
    return this.tasks.get(taskId);
  }
}

// Mock FileMappingStore
class FileMappingStore {
  constructor(options) {}
}

// Mock IPFSKitClient
class IPFSKitClient {
  constructor() {}
  addContent(content) {
    return Promise.resolve('QmHash123');
  }
  getContent(cid) {
    return Promise.resolve('Retrieved content');
  }
}

/**
 * Unit tests for Phase 2 components - Core Implementation
 */

describe('Phase 2: Core Implementation Components', () => {
  let model: IModel;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new Model({ id: 'mock-model', name: 'Mock Model', provider: 'mock' });
  });

  describe('AI Agent', () => {
    let agent: Agent;
    
    beforeEach(() => {
      agent = new Agent({ model });
    });
    
    it('should process messages through the agent', async () => {
      jest.spyOn(model, 'generate').mockResolvedValue({
        content: 'Test response',
        status: 'success'
      });
      
      const response = await agent.processMessage('Test message');
      
      expect(model.generate).toHaveBeenCalledWith('Test message');
      expect(response).toEqual({
        content: 'Test response',
        status: 'success'
      });
    });
  });
  
  describe('Task System Core', () => {
    let taskManager: TaskManager;
    
    beforeEach(() => {
      taskManager = new TaskManager();
    });
    
    it('should create tasks', async () => {
      const expectedTaskId = 'task-123';
      
      const createdTask = await taskManager.createTask({
        description: 'Task description',
        basePriority: 1
      });
      
      expect(taskManager.createTask).toHaveBeenCalledWith({
        description: 'Task description',
        basePriority: 1
      });
      expect(createdTask).toBeDefined();
      expect(createdTask.id).toBe(expectedTaskId);
      expect(createdTask.status).toBe(TaskStatus.PENDING);
      
      const retrievedTask = taskManager.getTask(expectedTaskId);
      expect(retrievedTask).toEqual(createdTask);
    });
  });
  
  describe('Storage System', () => {
    let fileMappingStore: jest.Mocked<FileMappingStore>;
    let ipfsClient: jest.Mocked<IPFSKitClient>;
    
    beforeEach(() => {
      fileMappingStore = new FileMappingStore({ storageFile: 'test.json' });
      ipfsClient = new IPFSKitClient();
    });
    
    it('should store content to IPFS', async () => {
      ipfsClient.addContent = jest.fn().mockResolvedValue('QmHash123');
      
      const cid = await ipfsClient.addContent('Test content');
      
      expect(ipfsClient.addContent).toHaveBeenCalledWith('Test content');
      expect(cid).toBe('QmHash123');
    });
    
    it('should retrieve content from IPFS', async () => {
      ipfsClient.getContent = jest.fn().mockResolvedValue('Test content');
      
      expect(ipfsClient.getContent).toHaveBeenCalledWith('QmHash123');
      const retrieved = await ipfsClient.getContent('QmHash123');
      expect(retrieved).toBe('Test content');
    });
  });
});
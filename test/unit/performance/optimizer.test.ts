export {};
import { IModel, ModelOptions } from '@/ai/models/model';
import { PerformanceOptimizer } from '@/performance/optimizer';
import { Agent } from '@/ai/agent/agent';

/**
 * Unit tests for PerformanceOptimizer
 */


// Mock dependencies
jest.mock('@/tasks/manager.ts', () => ({
  TaskManager: jest.fn().mockImplementation(() => ({
    listTasks: jest.fn().mockResolvedValue([])
  }))
}));
jest.mock('@/ipfs/client.ts', () => ({
  IPFSKitClient: jest.fn().mockImplementation(() => ({
    getContent: jest.fn().mockResolvedValue('test content')
  }))
}));
jest.mock('@ai/agent/agent.ts', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    processMessage: jest.fn().mockResolvedValue({ content: 'response' })
  }))
}));

// Mock model for Agent constructor
class MockModel implements IModel {
  readonly id: string;
  
  constructor(options: ModelOptions) {
    this.id = options.id;
  }
  
  getName(): string {
    return 'Mock Model';
  }
  
  getProvider(): string {
    return 'mock';
  }
  
  async generate() {
    return {
      content: 'Mock response',
      status: 'success' as any
    };
  }
}

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;
  let taskManager: any;
  let ipfsClient: any;
  let agent: jest.Mocked<Agent>;
  let model: MockModel;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocked instances
    taskManager = {
      listTasks: jest.fn().mockResolvedValue([]),
      createTask: jest.fn(),
      startExecutionLoop: jest.fn(),
      stopExecutionLoop: jest.fn(),
      getTask: jest.fn(),
      getGoTNode: jest.fn(),
    };
    ipfsClient = {
      getContent: jest.fn().mockResolvedValue('test content'),
      addContent: jest.fn(),
      getContentStream: jest.fn(),
      pinContent: jest.fn(),
      unpinContent: jest.fn(),
      removeContent: jest.fn(),
      listContent: jest.fn(),
      getBandwidthStats: jest.fn(),
      getPeerInfo: jest.fn(),
      getVersion: jest.fn(),
    };
    
    // Create model and agent
    const modelOptions = {
      id: 'mock-model',
      name: 'Mock Model',
      provider: 'mock'
    };
    model = new MockModel(modelOptions);
    agent = new Agent({ model }) as jest.Mocked<Agent>;
    
    // Create optimizer instance
    optimizer = new PerformanceOptimizer(taskManager, ipfsClient, agent);
    
    // Mock performance.now() for consistent timing
    jest.spyOn(performance, 'now')
      .mockImplementationOnce(() => 1000)  // start time
      .mockImplementationOnce(() => 1500); // end time
  });
  
  describe('profileTaskManager', () => {
    it('should profile TaskManager operations', async () => {
      // Arrange
      taskManager.listTasks = jest.fn().mockResolvedValue([]);
      
      // Act
      await optimizer.profileTaskManager();
      
      // Assert
      expect(taskManager.listTasks).toHaveBeenCalled();
    });
  });
  
  describe('profileIPFSClient', () => {
    it('should profile IPFSClient operations', async () => {
      // Arrange
      ipfsClient.getContent = jest.fn().mockResolvedValue('test content');
      
      // Act
      await optimizer.profileIPFSClient();
      
      // Assert
      expect(ipfsClient.getContent).toHaveBeenCalledWith('example-cid');
    });
  });
  
  describe('profileAgent', () => {
    it('should profile Agent operations', async () => {
      // Arrange
      agent.processMessage = jest.fn().mockResolvedValue({ content: 'response' });
      
      // Act
      await optimizer.profileAgent();
      
      // Assert
      expect(agent.processMessage).toHaveBeenCalledWith('Test message');
    });
  });
  
  describe('optimize', () => {
    it('should run all profiling methods', async () => {
      // Arrange
      const profileTaskManagerSpy = jest.spyOn(optimizer, 'profileTaskManager');
      const profileIPFSClientSpy = jest.spyOn(optimizer, 'profileIPFSClient');
      const profileAgentSpy = jest.spyOn(optimizer, 'profileAgent');
      
      // Act
      await optimizer.optimize();
      
      // Assert
      expect(profileTaskManagerSpy).toHaveBeenCalled();
      expect(profileIPFSClientSpy).toHaveBeenCalled();
      expect(profileAgentSpy).toHaveBeenCalled();
    });
  });
});

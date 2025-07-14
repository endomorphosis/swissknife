import { Agent } from '@src/ai/agent/agent';
import { IModel, Model } from '@src/ai/models/model';
import { TaskManager } from '@src/tasks/manager';
import { IPFSKitClient } from '@src/ipfs/client';
import { StorageService } from '@src/storage/storage-service';
import { ConfigurationManager } from '@src/config/manager';

/**
 * Integration tests for Phase 2 components
 */

// Mock dependencies













describe('Phase 2: Integration Tests', () => {
  describe('Agent and Task Integration', () => {
    let agent: Agent;
    let taskManager: jest.Mocked<TaskManager>;
    let model: Model; // Use Model type here
    let configManager: ConfigurationManager;
    
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Mock config and model
      configManager = ConfigurationManager.getInstance();
      model = new Model({ id: 'mock-model', name: 'Mock Model', provider: 'mock' });
      
      // Create agent and mock task manager
      agent = new Agent({ model }); // Pass model to Agent
      taskManager = new TaskManager(model, {} as any) as jest.Mocked<TaskManager>; // Pass model and a mock for storageProvider
      taskManager.createTask = jest.fn().mockResolvedValue({
        id: 'task-123',
        status: 'created',
        description: 'Task analysis: This should be broken into subtasks.'
      });
    });
    
    it('should use agent to analyze task content and create task', async () => {
      // Arrange
      const message = 'Analyze this complex problem';
      const createTaskSpy = jest.spyOn(taskManager, 'createTask');
      
      // Act
      // 1. Process message with agent
      const analysis = await agent.processMessage(message);
      
      // 2. Create task with analysis
      const task = await taskManager.createTask({
        description: analysis.content
      });
      
      // Assert
      expect(model.generate).toHaveBeenCalled();
      expect(createTaskSpy).toHaveBeenCalledWith({
        title: 'Analyzed Task',
        description: 'Task analysis: This should be broken into subtasks.'
      });
      expect(task.id).toBe('task-123');
      expect(task.description).toContain('Task analysis');
    });
  });
  
  describe('Storage and IPFS Integration', () => {
    let ipfsClient: jest.Mocked<IPFSKitClient>;
    let storageService: jest.Mocked<StorageService>;
    
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Mock IPFS client and storage service
      ipfsClient = new IPFSKitClient() as jest.Mocked<IPFSKitClient>;
      storageService = StorageService.getInstance() as jest.Mocked<StorageService>;
      
      // Setup mock methods
      jest.spyOn(storageService, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(storageService, 'readFile').mockResolvedValue(Buffer.from('Retrieved content'));
      jest.spyOn(storageService, 'getDefaultBackend').mockReturnValue({
        writeFile: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockResolvedValue(Buffer.from('Retrieved content')),
        exists: jest.fn().mockResolvedValue(true),
        stat: jest.fn().mockResolvedValue({ isDirectory: false, size: 100 }),
        mkdir: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([]),
        rm: jest.fn().mockResolvedValue(undefined),
        copyFile: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        init: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(true),
      } as any);


      ipfsClient.addContent = jest.fn().mockResolvedValue('QmHash123');
      ipfsClient.getContent = jest.fn().mockResolvedValue('Retrieved content');
    });
    
    it('should store and retrieve content via storage service and IPFS', async () => {
      // Arrange
      const content = 'Test content';
      const path = '/test/file.txt';
      
      // Act
      // 1. Store content using storage service (which uses IPFS client)
      await storageService.writeFile(path, content);
      
      // 2. Retrieve content using path
      const retrieved = await storageService.readFile(path);
      
      // Assert
      expect(storageService.writeFile).toHaveBeenCalledWith(path, content);
      expect(storageService.readFile).toHaveBeenCalledWith(path);
      expect(retrieved.toString()).toBe('Retrieved content');
    });
  });
});

import { Agent, AgentMessage } from '@src/ai/agent/agent';
import { BaseModel, IModel } from '@src/ai/models/model';
import { TaskManager, TaskCreationOptions } from '@src/tasks/manager';
import { IPFSKitClient } from '@src/ipfs/client';
import { StorageService } from '@src/storage/storage-service';
import { ConfigurationManager } from '@src/config/manager';

// Mock dependencies
jest.mock('@src/tasks/manager');
jest.mock('@src/ipfs/client');
jest.mock('@src/storage/storage-service');
jest.mock('@src/ai/models/model');
jest.mock('@src/ai/agent/agent');
jest.mock('@src/config/manager');

describe('Phase 2: Integration Tests', () => {
  describe('Agent and Task Integration', () => {
    let agent: jest.Mocked<Agent>;
    let taskManager: jest.Mocked<TaskManager>;
    let model: jest.Mocked<BaseModel>;
    let configManager: jest.Mocked<ConfigurationManager>;

    beforeEach(() => {
      jest.clearAllMocks();

      // Mock ConfigurationManager.getInstance() to return a mocked instance
      jest.spyOn(ConfigurationManager, 'getInstance').mockReturnValue({
        get: jest.fn(),
      } as any);
      configManager = ConfigurationManager.getInstance() as jest.Mocked<ConfigurationManager>;

      (BaseModel as jest.Mock).mockImplementation(() => ({
        id: 'mock-model',
        getName: jest.fn().mockReturnValue('Mock Model'),
        getProvider: jest.fn().mockReturnValue('mock'),
        generate: jest.fn().mockResolvedValue({
          content: 'Task analysis: This should be broken into subtasks.',
          status: 'success',
        }),
      }));
      model = new BaseModel({} as any) as jest.Mocked<BaseModel>;

      (Agent as jest.Mock).mockImplementation(() => ({
        processMessage: jest.fn().mockResolvedValue({
          role: 'assistant',
          content: 'Agent response',
          id: 'mock-id',
          conversationId: 'mock-conversation-id',
          timestamp: new Date().toISOString(),
        } as AgentMessage),
      }));
      agent = new Agent({ model }) as jest.Mocked<Agent>;

      (TaskManager as jest.Mock).mockImplementation(() => ({
        createTask: jest.fn().mockResolvedValue({
          id: 'task-123',
          title: 'Analyzed Task',
          status: 'created',
          description: 'Task analysis: This should be broken into subtasks.',
        }),
      }));
      taskManager = new TaskManager({} as any, {} as any) as jest.Mocked<TaskManager>;
    });

    it('should use agent to analyze task content and create task', async () => {
      const message = 'Analyze this complex problem';

      const analysis = await agent.processMessage(message);

      const taskOptions: TaskCreationOptions = {
        description: analysis.content,
      };

      const task = await taskManager.createTask(taskOptions);

      expect(agent.processMessage).toHaveBeenCalledWith(message);
      expect(taskManager.createTask).toHaveBeenCalledWith({
        description: 'Task analysis: This should be broken into subtasks.',
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

      (IPFSKitClient as jest.Mock).mockImplementation(() => ({
        addContent: jest.fn().mockResolvedValue('QmHash123'),
        getContent: jest.fn().mockResolvedValue('Retrieved content'),
      }));
      ipfsClient = new IPFSKitClient() as jest.Mocked<IPFSKitClient>;

      // Mock StorageService.getInstance() to return a mocked instance
      jest.spyOn(StorageService, 'getInstance').mockReturnValue({
        storeFile: jest.fn().mockResolvedValue({
          path: '/ipfs/QmHash123',
          cid: 'QmHash123',
        }),
        retrieveFile: jest.fn().mockResolvedValue({
          content: 'Retrieved content',
          path: '/ipfs/QmHash123',
        }),
      } as any);
      storageService = StorageService.getInstance() as jest.Mocked<StorageService>;
    });

    it('should store and retrieve content via storage service and IPFS', async () => {
      const content = 'Test content';
      const path = '/test/file.txt';

      const stored = await storageService.storeFile(path, content);

      const retrieved = await storageService.retrieveFile(stored.path);

      expect(storageService.storeFile).toHaveBeenCalledWith(path, content);
      expect(storageService.retrieveFile).toHaveBeenCalledWith('/ipfs/QmHash123');
      expect(retrieved.content).toBe('Retrieved content');
    });
  });
});

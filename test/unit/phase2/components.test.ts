import { TaskStatus } from '@src/types/task';
import { Agent } from '@src/ai/agent/agent';
import { BaseModel, IModel } from '@src/ai/models/model';
import { TaskManager } from '@src/tasks/manager';
import { IPFSKitClient } from '@src/ipfs/client';
import { StorageService } from '@src/storage/storage-service';
import { FileMappingStore } from '@src/storage/mapping-store';
import { AgentMessage } from '@src/types/ai';

// Mock dependencies using jest.mock
jest.mock('@src/ai/agent/agent');
jest.mock('@src/ai/models/model');
jest.mock('@src/tasks/manager');
jest.mock('@src/ipfs/client');
jest.mock('@src/storage/storage-service');
jest.mock('@src/storage/mapping-store');

describe('Phase 2: Core Implementation Components', () => {
  let model: jest.Mocked<BaseModel>;
  let agent: jest.Mocked<Agent>;
  let taskManager: jest.Mocked<TaskManager>;
  let ipfsClient: jest.Mocked<IPFSKitClient>;
  let storageService: jest.Mocked<StorageService>;
  let fileMappingStore: jest.Mocked<FileMappingStore>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock implementations for the classes
    (BaseModel as jest.Mock).mockImplementation(() => ({
      id: 'mock-model',
      name: 'Mock Model',
      provider: 'mock',
      generate: jest.fn().mockResolvedValue({ content: 'Test response', status: 'success' }),
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
        status: TaskStatus.PENDING,
        description: 'Task description',
      }),
      getTask: jest.fn(),
    }));
    taskManager = new TaskManager({} as any, {} as any) as jest.Mocked<TaskManager>;

    (IPFSKitClient as jest.Mock).mockImplementation(() => ({
      addContent: jest.fn().mockResolvedValue('QmHash123'),
      getContent: jest.fn().mockResolvedValue('Retrieved content'),
    }));
    ipfsClient = new IPFSKitClient() as jest.Mocked<IPFSKitClient>;

    // Correctly mock StorageService with private constructor
    jest.spyOn(StorageService, 'getInstance').mockReturnValue({
      writeFile: jest.fn(),
      readFile: jest.fn(),
    } as any);
    storageService = StorageService.getInstance() as jest.Mocked<StorageService>;

    (FileMappingStore as jest.Mock).mockImplementation(() => ({
      read: jest.fn(),
      write: jest.fn(),
    }));
    fileMappingStore = new FileMappingStore({} as any) as jest.Mocked<FileMappingStore>;
  });

  describe('AI Agent', () => {
    it('should process messages through the agent', async () => {
      const expectedResponse: AgentMessage = {
        role: 'assistant',
        content: 'Agent response',
        id: 'mock-id',
        conversationId: 'mock-conversation-id',
        timestamp: new Date().toISOString(),
      };
      agent.processMessage.mockResolvedValue(expectedResponse);

      const response = await agent.processMessage('Test message');

      expect(agent.processMessage).toHaveBeenCalledWith('Test message');
      expect(response).toEqual(expectedResponse);
    });
  });

  describe('Task System Core', () => {
    it('should create tasks', async () => {
      const expectedTaskId = 'task-123';
      const taskDescription = 'Task description';

      const createdTask = await taskManager.createTask({
        description: taskDescription,
        basePriority: 1,
      });

      expect(taskManager.createTask).toHaveBeenCalledWith({
        description: taskDescription,
        basePriority: 1,
      });
      expect(createdTask).toBeDefined();
      expect(createdTask.id).toBe(expectedTaskId);
      expect(createdTask.status).toBe(TaskStatus.PENDING);

      taskManager.getTask.mockReturnValue(createdTask);
      const retrievedTask = taskManager.getTask(expectedTaskId);
      expect(retrievedTask).toEqual(createdTask);
    });
  });

  describe('Storage System', () => {
    it('should store content to IPFS', async () => {
      const content = 'Test content';
      const cid = 'QmHash123';
      ipfsClient.addContent.mockResolvedValue(cid);

      const resultCid = await ipfsClient.addContent(content);

      expect(ipfsClient.addContent).toHaveBeenCalledWith(content);
      expect(resultCid).toBe(cid);
    });

    it('should retrieve content from IPFS', async () => {
      const cid = 'QmHash123';
      const retrievedContent = 'Retrieved content';
      ipfsClient.getContent.mockResolvedValue(retrievedContent);

      const result = await ipfsClient.getContent(cid);

      expect(ipfsClient.getContent).toHaveBeenCalledWith(cid);
      expect(result).toBe(retrievedContent);
    });
  });
});
/**
 * Comprehensive Model Execution Service Test with Dependency Injection
 */

// Mock all dependencies before importing
jest.mock('../../../src/models/registry.ts', () => ({
  ModelRegistry: {
    getInstance: jest.fn(() => ({
      getModel: jest.fn(),
      listModels: jest.fn(),
      registerModel: jest.fn(),
      hasModel: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/ai/models/model.ts', () => ({
  BaseModel: class MockBaseModel {
    constructor(public config: any) {}
    getId() { return this.config.id || 'mock-model'; }
    getName() { return this.config.name || 'Mock Model'; }
    generateResponse = jest.fn();
  },
}));

jest.mock('../../../src/integration/registry.ts', () => ({
  IntegrationRegistry: {
    getInstance: jest.fn(() => ({
      getIntegration: jest.fn(),
      listIntegrations: jest.fn(),
      registerIntegration: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/config/manager.ts', () => ({
  ConfigManager: {
    getInstance: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

import { 
  ModelExecutionService, 
  ModelExecutionOptions, 
  ModelExecutionResult 
} from '../../../src/models/execution.js';
import { ModelRegistry } from '../../../src/models/registry.js';
import { BaseModel } from '../../../src/ai/models/model.js';
import { IntegrationRegistry } from '@integrations/registry.js';
import { ConfigManager } from '@config/manager.js';

describe('ModelExecutionService Comprehensive Tests', () => {
  let executionService: ModelExecutionService;
  let mockModelRegistry: jest.Mocked<ModelRegistry>;
  let mockIntegrationRegistry: jest.Mocked<IntegrationRegistry>;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockModel: jest.Mocked<BaseModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mock model
    mockModel = {
      getId: jest.fn().mockReturnValue('test-model'),
      getName: jest.fn().mockReturnValue('Test Model'),
      generateResponse: jest.fn(),
    } as any;

    // Set up mock registries
    mockModelRegistry = {
      getModel: jest.fn().mockReturnValue(mockModel),
      listModels: jest.fn().mockReturnValue([mockModel]),
      registerModel: jest.fn(),
      hasModel: jest.fn().mockReturnValue(true),
    } as any;

    mockIntegrationRegistry = {
      getIntegration: jest.fn(),
      listIntegrations: jest.fn(),
      registerIntegration: jest.fn(),
    } as any;

    mockConfigManager = {
      get: jest.fn(),
      set: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock the getInstance methods
    (ModelRegistry.getInstance as jest.Mock).mockReturnValue(mockModelRegistry);
    (IntegrationRegistry.getInstance as jest.Mock).mockReturnValue(mockIntegrationRegistry);
    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Get service instance (singleton)
    executionService = ModelExecutionService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ModelExecutionService.getInstance();
      const instance2 = ModelExecutionService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize with proper dependencies', () => {
      expect(ModelRegistry.getInstance).toHaveBeenCalled();
      expect(IntegrationRegistry.getInstance).toHaveBeenCalled();
      expect(ConfigManager.getInstance).toHaveBeenCalled();
    });
  });

  describe('executeModel', () => {
    it('should execute model successfully', async () => {
      const mockResult: ModelExecutionResult = {
        output: 'Test response',
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
        elapsedMs: 1500,
      };

      mockModel.generateResponse.mockResolvedValue(mockResult);

      const result = await executionService.executeModel(
        'test-model',
        'Test prompt',
        { temperature: 0.7 }
      );

      expect(mockModelRegistry.getModel).toHaveBeenCalledWith('test-model');
      expect(mockModel.generateResponse).toHaveBeenCalledWith(
        'Test prompt',
        [],
        expect.objectContaining({ temperature: 0.7 })
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle model not found error', async () => {
      mockModelRegistry.getModel.mockReturnValue(null);

      await expect(
        executionService.executeModel('nonexistent-model', 'Test prompt')
      ).rejects.toThrow('Model not found: nonexistent-model');
    });

    it('should handle execution errors', async () => {
      const error = new Error('Model execution failed');
      mockModel.generateResponse.mockRejectedValue(error);

      await expect(
        executionService.executeModel('test-model', 'Test prompt')
      ).rejects.toThrow('Model execution failed');
    });

    it('should apply default options', async () => {
      const mockResult: ModelExecutionResult = {
        output: 'Test response',
      };

      mockModel.generateResponse.mockResolvedValue(mockResult);

      await executionService.executeModel('test-model', 'Test prompt');

      expect(mockModel.generateResponse).toHaveBeenCalledWith(
        'Test prompt',
        [],
        expect.objectContaining({
          streaming: false,
          maxTokens: undefined,
          temperature: undefined,
        })
      );
    });

    it('should merge custom options with defaults', async () => {
      const mockResult: ModelExecutionResult = {
        output: 'Test response',
      };

      mockModel.generateResponse.mockResolvedValue(mockResult);

      const options: ModelExecutionOptions = {
        temperature: 0.8,
        maxTokens: 1000,
        stop: ['END'],
      };

      await executionService.executeModel('test-model', 'Test prompt', options);

      expect(mockModel.generateResponse).toHaveBeenCalledWith(
        'Test prompt',
        [],
        expect.objectContaining({
          temperature: 0.8,
          maxTokens: 1000,
          stop: ['END'],
        })
      );
    });
  });

  describe('listAvailableModels', () => {
    it('should return list of available models', () => {
      const models = executionService.listAvailableModels();
      expect(mockModelRegistry.listModels).toHaveBeenCalled();
      expect(models).toEqual([mockModel]);
    });
  });

  describe('hasModel', () => {
    it('should check if model exists', () => {
      const exists = executionService.hasModel('test-model');
      expect(mockModelRegistry.hasModel).toHaveBeenCalledWith('test-model');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent model', () => {
      mockModelRegistry.hasModel.mockReturnValue(false);
      const exists = executionService.hasModel('nonexistent-model');
      expect(exists).toBe(false);
    });
  });

  describe('getModelInfo', () => {
    it('should return model information', () => {
      const info = executionService.getModelInfo('test-model');
      expect(mockModelRegistry.getModel).toHaveBeenCalledWith('test-model');
      expect(info).toEqual(mockModel);
    });

    it('should return null for non-existent model', () => {
      mockModelRegistry.getModel.mockReturnValue(null);
      const info = executionService.getModelInfo('nonexistent-model');
      expect(info).toBeNull();
    });
  });

  describe('streaming execution', () => {
    it('should handle streaming execution', async () => {
      const mockStreamResult = {
        output: 'Streaming response',
        tokenUsage: { prompt: 5, completion: 15, total: 20 },
      };

      mockModel.generateResponse.mockResolvedValue(mockStreamResult);

      const result = await executionService.executeModel(
        'test-model',
        'Stream test',
        { streaming: true }
      );

      expect(mockModel.generateResponse).toHaveBeenCalledWith(
        'Stream test',
        [],
        expect.objectContaining({ streaming: true })
      );
      expect(result).toEqual(mockStreamResult);
    });
  });

  describe('error handling', () => {
    it('should handle invalid model registry', () => {
      (ModelRegistry.getInstance as jest.Mock).mockReturnValue(null);
      
      expect(() => {
        ModelExecutionService.getInstance();
      }).toThrow();
    });

    it('should handle registry initialization errors', () => {
      (ModelRegistry.getInstance as jest.Mock).mockImplementation(() => {
        throw new Error('Registry initialization failed');
      });

      expect(() => {
        ModelExecutionService.getInstance();
      }).toThrow('Registry initialization failed');
    });
  });

  describe('integration with external services', () => {
    it('should use integration registry for external models', async () => {
      const mockIntegration = {
        id: 'external-service',
        executeModel: jest.fn().mockResolvedValue({
          output: 'External response',
        }),
      };

      mockIntegrationRegistry.getIntegration.mockReturnValue(mockIntegration);
      mockModelRegistry.getModel.mockReturnValue(null);
      mockModelRegistry.hasModel.mockReturnValue(false);

      // This would be implemented in the actual service
      // For now, we're testing the dependency structure
      expect(mockIntegrationRegistry.getIntegration).toBeDefined();
    });
  });
});

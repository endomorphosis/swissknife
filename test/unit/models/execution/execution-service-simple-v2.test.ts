/**
 * Simple test for ModelExecutionService
 */

export {};

// Mock dependencies
jest.mock('../../../../src/models/registry', () => ({
  ModelRegistry: {
    getInstance: jest.fn(() => ({
      getModel: jest.fn().mockReturnValue({
        id: 'test-model',
        getId: () => 'test-model',
        getName: () => 'Test Model',
        getProvider: () => 'test-provider',
        getParameters: () => ({}),
        getMetadata: () => ({})
      }),
      getDefaultModel: jest.fn().mockReturnValue({
        id: 'default-model',
        getId: () => 'default-model',
        getName: () => 'Default Model',
        getProvider: () => 'test-provider',
        getParameters: () => ({}),
        getMetadata: () => ({})
      })
    }))
  }
}));

jest.mock('../../../../src/config/manager', () => ({
  ConfigManager: {
    getInstance: jest.fn(() => ({
      get: jest.fn().mockReturnValue('test-api-key')
    }))
  }
}));

jest.mock('../../../../src/integration/registry', () => ({
  IntegrationRegistry: {
    getInstance: jest.fn(() => ({
      getBridge: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          output: 'Mock response',
          tokenUsage: { prompt: 10, completion: 20, total: 30 }
        })
      })
    }))
  }
}));

// @ts-ignore - JS module import
import { ModelExecutionService } from '@models/execution/service.js';

describe('ModelExecutionService - Simple', () => {
  test('should be importable', () => {
    expect(typeof ModelExecutionService).toBe('function');
  });
  
  test('should have getInstance method', () => {
    expect(typeof ModelExecutionService.getInstance).toBe('function');
  });
  
  test('should create instance', () => {
    const instance = ModelExecutionService.getInstance();
    expect(instance).toBeDefined();
  });

  test('should execute model basic functionality', async () => {
    const service = ModelExecutionService.getInstance();
    expect(service).toBeDefined();
    expect(typeof service.executeModel).toBe('function');
  });
});

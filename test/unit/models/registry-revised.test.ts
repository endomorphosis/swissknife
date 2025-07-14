/**
 * Unit Tests for ModelRegistry
 * These tests validate the functionality of the ModelRegistry class
 */

import { Model } from '../../../src/ai/models/model.js';
import { LazyModel, ModelRegistry } from '../../../src/ai/models/registry.js';
import { Status } from '@types/common.js';

// Create a mock model instance for testing
function createMockModel(id: string, name: string, provider: string) {
  return new Model({
    id,
    name,
    provider,
    parameters: { temperature: 0.7 },
    metadata: { version: '1.0' }
  });
}

// Create a mock lazy model loader for testing
function createMockLazyModel(id: string): LazyModel {
  return {
    id,
    loader: async () => createMockModel(id, `Lazy Model ${id}`, 'test-provider')
  };
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    // Reset the singleton before each test
    (ModelRegistry as any).instance = undefined;
    registry = ModelRegistry.getInstance();
  });

  it('should be a singleton', () => {
    const instance1 = ModelRegistry.getInstance();
    const instance2 = ModelRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should register and retrieve a model', async () => {
    const model1 = createMockModel('model-1', 'Model One', 'provider-a');
    registry.registerModel(model1);

    const retrievedModel = await registry.getModelAsync('model-1');
    expect(retrievedModel).toBeDefined();
    expect(retrievedModel?.getId()).toBe('model-1');
    expect(retrievedModel).toBe(model1);
  });

  it('should return undefined for a non-existent model ID', async () => {
    const retrievedModel = await registry.getModelAsync('non-existent-model');
    expect(retrievedModel).toBeUndefined();
  });

  it('should register multiple models and allow retrieving them individually', async () => {
    const model1 = createMockModel('model-1', 'Model One', 'provider-a');
    const model2 = createMockModel('model-2', 'Model Two', 'provider-b');
    registry.registerModel(model1);
    registry.registerModel(model2);

    expect(await registry.getModelAsync('model-1')).toBe(model1);
    expect(await registry.getModelAsync('model-2')).toBe(model2);
  });

  it('should set the first registered model as default', async () => {
    const model1 = createMockModel('model-1', 'Model One', 'provider-a');
    const model2 = createMockModel('model-2', 'Model Two', 'provider-b');

    registry.registerModel(model1);
    expect(await registry.getModelAsync('default')).toBe(model1);

    registry.registerModel(model2);
    // Default should remain the first one
    expect(await registry.getModelAsync('default')).toBe(model1);
  });

  it('should overwrite a model if registered with the same ID', async () => {
    const model1 = createMockModel('model-1', 'Model One', 'provider-a');
    const model1Overwrite = createMockModel('model-1', 'Model One Overwritten', 'provider-c');
    
    registry.registerModel(model1);
    registry.registerModel(model1Overwrite);
    
    const retrievedModel = await registry.getModelAsync('model-1');
    expect(retrievedModel).toBe(model1Overwrite);
    expect(retrievedModel?.getName()).toBe('Model One Overwritten');
  });

  it('should handle lazy-loaded models', async () => {
    const lazyModel = createMockLazyModel('lazy-model-1');
    registry.registerModel(lazyModel);
    
    const retrievedModel = await registry.getModelAsync('lazy-model-1');
    expect(retrievedModel).toBeDefined();
    expect(retrievedModel?.getId()).toBe('lazy-model-1');
    expect(retrievedModel?.getName()).toBe('Lazy Model lazy-model-1');
  });

  it('should properly cache loaded lazy models', async () => {
    const lazyModel = {
      id: 'lazy-model-2',
      loader: jest.fn().mockImplementation(async () => 
        createMockModel('lazy-model-2', 'Lazy Model 2', 'test-provider')
      )
    };
    
    registry.registerModel(lazyModel);
    
    // First call should invoke the loader
    const firstRetrieved = await registry.getModelAsync('lazy-model-2');
    expect(lazyModel.loader).toHaveBeenCalledTimes(1);
    
    // Second call should use the cached value
    const secondRetrieved = await registry.getModelAsync('lazy-model-2');
    expect(lazyModel.loader).toHaveBeenCalledTimes(1);
    
    // Both should return the same object
    expect(firstRetrieved).toBe(secondRetrieved);
  });

  it('should differentiate sync and async model getters', () => {
    const model = createMockModel('sync-model', 'Sync Model', 'provider-x');
    const lazyModel = createMockLazyModel('async-only-model');
    
    registry.registerModel(model);
    registry.registerModel(lazyModel);
    
    // Sync model should be retrievable via both methods
    expect(registry.getModel('sync-model')).toBe(model);
    
    // Lazy model should return undefined from sync getter with warning
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(registry.getModel('async-only-model')).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should support model generation through the registry', async () => {
    // Create model with mocked generate method
    const model = createMockModel('test-gen-model', 'Generator Model', 'test-provider');
    const generateSpy = jest.spyOn(model, 'generate').mockResolvedValue({
      content: 'Generated content',
      status: Status.COMPLETED,
      modelUsed: 'test-gen-model',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      }
    });
    
    registry.registerModel(model);
    
    const retrievedModel = await registry.getModelAsync('test-gen-model');
    const result = await retrievedModel!.generate({ prompt: 'Test prompt' });
    
    expect(result.content).toBe('Generated content');
    expect(result.status).toBe(Status.COMPLETED);
    expect(generateSpy).toHaveBeenCalledWith({ prompt: 'Test prompt' });
  });
});

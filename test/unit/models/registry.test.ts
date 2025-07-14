// Mock common dependencies
export {}; // Make this a module

jest.mock("chalk", () => ({ 
  default: (str: any) => str, 
  red: (str: any) => str, 
  green: (str: any) => str, 
  blue: (str: any) => str 
}));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() } }));

// Mock ConfigManager to avoid initialization errors
jest.mock('../../../src/config/manager', () => ({
  ConfigManager: {
    getInstance: jest.fn(() => ({
      get: jest.fn(() => undefined),
      set: jest.fn(),
      initialized: true
    }))
  }
}));

// Import required classes AFTER mocking
import { ModelRegistry } from '../../../src/models/registry.ts';
import { BaseModel } from '@ai/models/model.ts';

// Define a mock Model class extending BaseModel
class MockModel extends BaseModel {
    constructor(options: any) {
        super(options);
    }
    
    async generate(input: any): Promise<any> {
        return {
            output: `Mock response for ${input.prompt || 'test'}`,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
        };
    }
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    // Reset the singleton before each test
    (ModelRegistry as any).instance = undefined;
    registry = ModelRegistry.getInstance();
  });

  test('should be a singleton', async () => {
    const instance1 = ModelRegistry.getInstance();
    const instance2 = ModelRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should register and retrieve a model', () => {
    const model1 = new MockModel({ id: 'model-1', name: 'Model One', provider: 'provider-a' });
    registry.registerModel(model1);

    const retrievedModel = registry.getModelSync('model-1');
    expect(retrievedModel).toBeDefined();
    expect(retrievedModel?.id).toBe('model-1'); 
    expect(retrievedModel).toBe(model1); 
  });

  test('should return undefined for a non-existent model ID', () => {
    const retrievedModel = registry.getModelSync('non-existent-model');
    expect(retrievedModel).toBeUndefined();
  });

  test('should register multiple models and allow retrieving them individually', () => {
    const model1 = new MockModel({ id: 'model-1', name: 'Model One', provider: 'provider-a' });
    const model2 = new MockModel({ id: 'model-2', name: 'Model Two', provider: 'provider-b' });
    registry.registerModel(model1);
    registry.registerModel(model2);

    expect(registry.getModelSync('model-1')).toBe(model1);
    expect(registry.getModelSync('model-2')).toBe(model2);
  });

  test('should set the first registered model as default', () => {
    const model1 = new MockModel({ id: 'model-1', name: 'Model One', provider: 'provider-a' });
    const model2 = new MockModel({ id: 'model-2', name: 'Model Two', provider: 'provider-b' });

    registry.registerModel(model1);
    expect(registry.getModelSync('default')).toBe(model1);

    registry.registerModel(model2);
    expect(registry.getModelSync('default')).toBe(model1);
  });

  test('should overwrite a model if registered with the same ID', () => {
    const model1 = new MockModel({ id: 'model-1', name: 'Model One', provider: 'provider-a' });
    const model1Overwrite = new MockModel({ id: 'model-1', name: 'Model One Overwritten', provider: 'provider-c' });
    registry.registerModel(model1);
    registry.registerModel(model1Overwrite);

    const retrievedModel = registry.getModelSync('model-1');
    expect(retrievedModel).toBe(model1Overwrite);
    expect(registry.getModelSync('model-1')).not.toBe(model1);
  });

  test('should handle retrieving default when no models are registered', () => {
    expect(registry.getModelSync('default')).toBeUndefined();
  });
});

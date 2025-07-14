/**
 * Simple test for ModelRegistry
 */

// Mock dependencies
jest.mock("chalk", () => ({ 
  default: (str: any) => str, 
  red: (str: any) => str, 
  green: (str: any) => str, 
  blue: (str: any) => str 
}));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() } }));

// Mock ConfigManager
jest.mock('../../../src/config/manager', () => ({
  ConfigManager: {
    getInstance: jest.fn(() => ({
      get: jest.fn(() => undefined),
      set: jest.fn(),
      initialized: true
    }))
  }
}));

// Import required classes
import { ModelRegistry } from '../../../src/models/registry';
import { BaseModel } from '../../../src/ai/models/model';
import { Status } from '@types/common';

// Simple mock model class
class MockModel extends BaseModel {
  constructor(id: string, name: string) {
    super({ id, name, provider: 'test-provider' });
  }
  
  async generate(input: any) {
    return {
      content: `Mock response for ${input.prompt || 'test'}`,
      status: Status.COMPLETED,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    };
  }
}

// Helper function to create mock model
const createMockModel = (id: string, name: string): BaseModel => {
  return new MockModel(id, name);
};

describe('ModelRegistry - Simple', () => {
  test('can import ModelRegistry', () => {
    expect(ModelRegistry).toBeDefined();
  });

  test('getInstance returns instance', () => {
    const registry = ModelRegistry.getInstance();
    expect(registry).toBeDefined();
    expect(registry).toBeInstanceOf(ModelRegistry);
  });

  test('can register and retrieve model', () => {
    const registry = ModelRegistry.getInstance();
    const model = createMockModel('test-model', 'Test Model');
    
    registry.registerModel(model);
    const retrieved = registry.getModelSync('test-model');
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-model');
  });
});

export {};

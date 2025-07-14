import { ProviderDefinition, ModelProvider } from '@src/types/ai';
import openaiProviderDefinition from '@ai/models/definitions/openai';

describe('ProviderDefinition', () => {
  it('should have valid structure for openai provider', () => {
    expect(openaiProviderDefinition).toBeDefined();
    expect(openaiProviderDefinition.id).toBe(ModelProvider.OPENAI);
    expect(openaiProviderDefinition.name).toBe('OpenAI');
    expect(openaiProviderDefinition.baseURL).toBe('https://api.openai.com/v1');
    expect(openaiProviderDefinition.envVar).toBe('OPENAI_API_KEY');
    expect(openaiProviderDefinition.models).toBeDefined();
    expect(Array.isArray(openaiProviderDefinition.models)).toBe(true);
    expect(openaiProviderDefinition.models.length).toBeGreaterThan(0);
  });

  it('should have valid model definitions in openai provider', () => {
    const models = openaiProviderDefinition.models;
    
    models.forEach(model => {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(model.provider).toBe(ModelProvider.OPENAI);
      expect(model.parameters).toBeDefined();
      expect(model.metadata).toBeDefined();
    });
  });

  it('should have gpt-4 as default model for openai', () => {
    expect(openaiProviderDefinition.defaultModel).toBe('gpt-4');
    
    // Verify that the default model exists in the models list
    const defaultModelExists = openaiProviderDefinition.models.some(
      model => model.id === openaiProviderDefinition.defaultModel
    );
    expect(defaultModelExists).toBe(true);
  });

  it('should have required environment variable configuration', () => {
    expect(openaiProviderDefinition.envVar).toBeDefined();
    expect(typeof openaiProviderDefinition.envVar).toBe('string');
    expect(openaiProviderDefinition.envVar.length).toBeGreaterThan(0);
  });
});

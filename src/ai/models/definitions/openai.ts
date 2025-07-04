// src/ai/models/definitions/openai.ts
import { ProviderDefinition, ModelProvider } from '../types/ai';

const openaiProviderDefinition: ProviderDefinition = {
  id: ModelProvider.OPENAI, // Use enum value
  name: 'OpenAI',
  baseURL: 'https://api.openai.com/v1',
  envVar: 'OPENAI_API_KEY',
  defaultModel: 'gpt-4', // This ID should match one of the model IDs below
  models: [
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: ModelProvider.OPENAI, // Use enum value
      parameters: {
        maxTokens: 4096,
      },
      metadata: {
        capabilities: {
          streaming: true
        },
        source: 'current',
        contextWindow: 4096, // Example additional metadata
      }
    },
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: ModelProvider.OPENAI, // Use enum value
      parameters: {
        maxTokens: 8192,
      },
      metadata: {
        capabilities: {
          streaming: true
        },
        source: 'current',
        contextWindow: 8192, // Example additional metadata
      }
    }
  ]
};

export default openaiProviderDefinition;

// src/ai/models/definitions/goose.ts
import { ProviderDefinition, ModelProvider } from '../types/ai';

const gooseProviderDefinition: ProviderDefinition = {
  id: ModelProvider.GOOSE, // Use enum value
  name: 'Goose',
  baseURL: 'local:goose', // This indicates a custom local setup
  envVar: 'GOOSE_API_KEY', // Optional, if needed
  defaultModel: 'goose-default',
  models: [
    {
      id: 'goose-default',
      name: 'Goose Default',
      provider: ModelProvider.GOOSE, // Use enum value
      parameters: {
        maxTokens: 8192, // Example
      },
      metadata: {
        capabilities: {
          streaming: true // Example
        },
        source: 'goose', // Indicates the origin or type
        contextWindow: 8192, // Example
      }
    }
  ]
};

export default gooseProviderDefinition;

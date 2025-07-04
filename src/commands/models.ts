/**
 * Model Commands - Commands for interacting with AI models
 */

import { CommandRegistry, Command } from '../command-registry';
import { ModelRegistry, Model, Provider } from '../models/registry';
import { ModelExecutionService } from '../models/execution/service';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Load model commands
 */
export async function loadModelCommands(): Promise<void> {
  const registry = CommandRegistry.getInstance();
  
  // Register model commands
  registry.registerCommand(modelListCommand);
  registry.registerCommand(modelInfoCommand);
  registry.registerCommand(modelRunCommand);
  registry.registerCommand(modelImportCommand);
  registry.registerCommand(providerListCommand);
  registry.registerCommand(providerAddCommand);
  registry.registerCommand(providerInfoCommand);
}

/**
 * Model list command
 */
export const modelListCommand: Command = {
  id: 'model:list',
  name: 'model:list',
  description: 'List available models',
  options: [
    {
      name: 'provider',
      alias: 'p',
      type: 'string',
      description: 'Filter models by provider'
    },
    {
      name: 'capability',
      alias: 'c',
      type: 'string',
      description: 'Filter models by capability (e.g. streaming, images)'
    },
    {
      name: 'source',
      alias: 's',
      type: 'string',
      description: 'Filter models by source (current, goose, ipfs_accelerate, swissknife_old)'
    },
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife model:list',
    'swissknife model:list --provider openai',
    'swissknife model:list --capability streaming',
    'swissknife model:list --source goose'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { provider, capability, source, json } = args;
    const modelRegistry = context.models as ModelRegistry;
    
    let models: Model[] = modelRegistry.getAllModels();
    
    // Apply filters
    if (provider) {
      models = models.filter(model => model.provider === provider);
    }
    
    if (capability) {
      models = models.filter(model => model.capabilities[capability]);
    }
    
    if (source) {
      models = models.filter(model => model.source === source);
    }
    
    // Output results
    if (json) {
      console.log(JSON.stringify(models, null, 2));
    } else {
      if (models.length === 0) {
        console.log('No models found matching the criteria');
        return 0;
      }
      
      console.log('Available Models:');
      console.log('----------------');
      
      // Group by provider
      const modelsByProvider = new Map<string, Model[]>();
      for (const model of models) {
        if (!modelsByProvider.has(model.provider)) {
          modelsByProvider.set(model.provider, []);
        }
        modelsByProvider.get(model.provider)?.push(model);
      }
      
      for (const [providerId, providerModels] of modelsByProvider.entries()) {
        const provider = modelRegistry.getProvider(providerId);
        console.log(`\n${provider?.name || providerId}:`);
        
        for (const model of providerModels) {
          const capabilities = Object.entries(model.capabilities)
            .filter(([_, value]) => value)
            .map(([key, _]) => key)
            .join(', ');
          
          const defaultMarker = model.id === provider?.defaultModel ? ' (default)' : '';
          
          console.log(`  - ${model.id}${defaultMarker}: ${model.name}`);
          console.log(`    Source: ${model.source}, Capabilities: ${capabilities}`);
        }
      }
    }
    
    return 0;
  }
};

/**
 * Model info command
 */
export const modelInfoCommand: Command = {
  id: 'model:info',
  name: 'model:info',
  description: 'Show detailed information about a model',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife model:info gpt-4',
    'swissknife model:info goose-model --json'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { json, _ } = args;
    const modelRegistry = context.models as ModelRegistry;
    
    // Get model ID from positional argument
    const modelId = _[0];
    
    if (!modelId) {
      console.error('Error: Model ID is required');
      console.log('Usage: swissknife model:info <model-id>');
      return 1;
    }
    
    const model = modelRegistry.getModel(modelId);
    
    if (!model) {
      console.error(`Error: Model not found: ${modelId}`);
      return 1;
    }
    
    const provider = modelRegistry.getProvider(model.provider);
    
    if (json) {
      console.log(JSON.stringify({ ...model, provider }, null, 2));
    } else {
      console.log(`Model: ${model.name} (${model.id})`);
      console.log(`Provider: ${provider?.name || model.provider}`);
      console.log(`Source: ${model.source}`);
      
      if (model.description) {
        console.log(`Description: ${model.description}`);
      }
      
      if (model.maxTokens) {
        console.log(`Max Tokens: ${model.maxTokens}`);
      }
      
      if (model.contextWindow) {
        console.log(`Context Window: ${model.contextWindow}`);
      }
      
      if (model.pricePerToken) {
        console.log(`Price per Token: $${model.pricePerToken.toFixed(7)}`);
      }
      
      console.log('Capabilities:');
      for (const [capability, enabled] of Object.entries(model.capabilities)) {
        if (enabled) {
          console.log(`  - ${capability}`);
        }
      }
      
      if (provider && provider.defaultModel === model.id) {
        console.log('\nThis is the default model for its provider');
      }
    }
    
    return 0;
  }
};

/**
 * Model run command
 */
export const modelRunCommand: Command = {
  id: 'model:run',
  name: 'model:run',
  description: 'Execute a model with the given prompt',
  options: [
    {
      name: 'model',
      alias: 'm',
      type: 'string',
      description: 'Model ID to use',
      required: true
    },
    {
      name: 'prompt',
      alias: 'p',
      type: 'string',
      description: 'Prompt text to send to the model'
    },
    {
      name: 'file',
      alias: 'f',
      type: 'string',
      description: 'File containing the prompt'
    },
    {
      name: 'temperature',
      alias: 't',
      type: 'number',
      description: 'Temperature for sampling (0.0-2.0)',
      default: 0.7
    },
    {
      name: 'max-tokens',
      type: 'number',
      description: 'Maximum number of tokens to generate'
    },
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife model:run --model gpt-4 --prompt "Hello, world!"',
    'swissknife model:run --model goose-model --file prompt.txt',
    'swissknife model:run --model gpt-4 --prompt "Explain quantum computing" --temperature 0.5'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { model: modelId, prompt, file, temperature, maxTokens, json } = args;
    const modelRegistry = context.models as ModelRegistry;
    const modelExecution = context.services.modelExecution as ModelExecutionService;
    
    // Validate model
    const model = modelRegistry.getModel(modelId);
    if (!model) {
      console.error(`Error: Model not found: ${modelId}`);
      return 1;
    }
    
    // Get prompt from either --prompt or --file
    let promptText: string;
    
    if (prompt) {
      promptText = prompt;
    } else if (file) {
      try {
        promptText = await fs.readFile(file, 'utf-8');
      } catch (error) {
        console.error(`Error reading prompt file: ${error.message}`);
        return 1;
      }
    } else {
      console.error('Error: Either --prompt or --file must be provided');
      return 1;
    }
    
    // Prepare execution options
    const options = {
      temperature,
      maxTokens: maxTokens
    };
    
    try {
      // Execute model
      console.log(`Executing model ${modelId}...`);
      const result = await modelExecution.executeModel(modelId, promptText, options);
      
      // Output results
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\nResponse:');
        console.log('---------');
        console.log(result.response);
        console.log('\nStats:');
        console.log(`Prompt Tokens: ${result.usage?.promptTokens || 'N/A'}`);
        console.log(`Completion Tokens: ${result.usage?.completionTokens || 'N/A'}`);
        console.log(`Total Tokens: ${result.usage?.totalTokens || 'N/A'}`);
        console.log(`Time: ${result.timingMs ? (result.timingMs / 1000).toFixed(2) + 's' : 'N/A'}`);
      }
      
      return 0;
    } catch (error) {
      console.error(`Error executing model: ${error.message}`);
      return 1;
    }
  }
};

/**
 * Model import command
 */
export const modelImportCommand: Command = {
  id: 'model:import',
  name: 'model:import',
  description: 'Import models from a JSON file',
  options: [
    {
      name: 'file',
      alias: 'f',
      type: 'string',
      description: 'JSON file containing model definitions',
      required: true
    },
    {
      name: 'overwrite',
      alias: 'o',
      type: 'boolean',
      description: 'Overwrite existing models with the same ID',
      default: false
    }
  ],
  examples: [
    'swissknife model:import --file models.json',
    'swissknife model:import --file custom-models.json --overwrite'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { file, overwrite } = args;
    const modelRegistry = context.models as ModelRegistry;
    
    try {
      // Read and parse JSON file
      const fileData = await fs.readFile(file, 'utf-8');
      const fileContent = JSON.parse(fileData);
      
      // Check if file contains providers, models, or both
      const providers = fileContent.providers || [];
      const models = fileContent.models || [];
      
      // Import providers
      let providersAdded = 0;
      for (const provider of providers) {
        // Check if provider already exists
        const existingProvider = modelRegistry.getProvider(provider.id);
        
        if (existingProvider && !overwrite) {
          console.log(`Provider ${provider.id} already exists, skipping`);
          continue;
        }
        
        // Register provider
        try {
          modelRegistry.registerProvider(provider);
          providersAdded++;
        } catch (error) {
          console.error(`Error registering provider ${provider.id}: ${error.message}`);
        }
      }
      
      // Import models
      let modelsAdded = 0;
      for (const model of models) {
        // Check if model already exists
        const existingModel = modelRegistry.getModel(model.id);
        
        if (existingModel && !overwrite) {
          console.log(`Model ${model.id} already exists, skipping`);
          continue;
        }
        
        // Register model
        try {
          modelRegistry.registerModel(model);
          modelsAdded++;
        } catch (error) {
          console.error(`Error registering model ${model.id}: ${error.message}`);
        }
      }
      
      // Output results
      console.log(`Import completed: ${providersAdded} providers and ${modelsAdded} models added`);
      
      return 0;
    } catch (error) {
      console.error(`Error importing models: ${error.message}`);
      return 1;
    }
  }
};

/**
 * Provider list command
 */
export const providerListCommand: Command = {
  id: 'provider:list',
  name: 'provider:list',
  description: 'List available model providers',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife provider:list',
    'swissknife provider:list --json'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { json } = args;
    const modelRegistry = context.models as ModelRegistry;
    
    const providers = modelRegistry.getAllProviders();
    
    if (json) {
      console.log(JSON.stringify(providers, null, 2));
    } else {
      if (providers.length === 0) {
        console.log('No providers registered');
        return 0;
      }
      
      console.log('Available Providers:');
      console.log('-------------------');
      
      for (const provider of providers) {
        const modelCount = provider.models.length;
        const defaultModel = provider.defaultModel ? 
          modelRegistry.getModel(provider.defaultModel)?.name || provider.defaultModel :
          'None';
        
        console.log(`\n${provider.name} (${provider.id}):`);
        console.log(`  Models: ${modelCount}`);
        console.log(`  Default Model: ${defaultModel}`);
        
        if (provider.baseURL) {
          console.log(`  URL: ${provider.baseURL}`);
        }
        
        if (provider.description) {
          console.log(`  Description: ${provider.description}`);
        }
        
        if (provider.envVar) {
          const hasApiKey = modelRegistry.getApiKey(provider.id) ? 'Configured' : 'Not configured';
          console.log(`  API Key: ${hasApiKey} (${provider.envVar})`);
        }
      }
    }
    
    return 0;
  }
};

/**
 * Provider add command
 */
export const providerAddCommand: Command = {
  id: 'provider:add',
  name: 'provider:add',
  description: 'Add a new model provider',
  options: [
    {
      name: 'id',
      type: 'string',
      description: 'Provider ID (unique identifier)',
      required: true
    },
    {
      name: 'name',
      type: 'string',
      description: 'Display name for the provider',
      required: true
    },
    {
      name: 'url',
      type: 'string',
      description: 'Base URL for API requests'
    },
    {
      name: 'env-var',
      type: 'string',
      description: 'Environment variable for API key'
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description of the provider'
    },
    {
      name: 'auth-type',
      type: 'string',
      description: 'Authentication type (bearer, api-key, none)',
      default: 'bearer'
    }
  ],
  examples: [
    'swissknife provider:add --id custom-provider --name "Custom Provider" --url https://api.custom.com --env-var CUSTOM_API_KEY',
    'swissknife provider:add --id open-model --name "Open Model Provider" --auth-type none'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { id, name, url, envVar, description, authType } = args;
    const modelRegistry = context.models as ModelRegistry;
    
    // Check if provider already exists
    const existingProvider = modelRegistry.getProvider(id);
    if (existingProvider) {
      console.error(`Error: Provider with ID ${id} already exists`);
      return 1;
    }
    
    // Create provider definition
    const provider: Provider = {
      id,
      name,
      models: [],
      baseURL: url,
      envVar: envVar,
      authType: authType as any,
      description
    };
    
    // Register provider
    try {
      modelRegistry.registerProvider(provider);
      console.log(`Provider ${name} (${id}) added successfully`);
      return 0;
    } catch (error) {
      console.error(`Error adding provider: ${error.message}`);
      return 1;
    }
  }
};

/**
 * Provider info command
 */
export const providerInfoCommand: Command = {
  id: 'provider:info',
  name: 'provider:info',
  description: 'Show detailed information about a provider',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife provider:info openai',
    'swissknife provider:info custom-provider --json'
  ],
  category: 'models',
  handler: async (args, context) => {
    const { json, _ } = args;
    const modelRegistry = context.models as ModelRegistry;
    
    // Get provider ID from positional argument
    const providerId = _[0];
    
    if (!providerId) {
      console.error('Error: Provider ID is required');
      console.log('Usage: swissknife provider:info <provider-id>');
      return 1;
    }
    
    const provider = modelRegistry.getProvider(providerId);
    
    if (!provider) {
      console.error(`Error: Provider not found: ${providerId}`);
      return 1;
    }
    
    if (json) {
      console.log(JSON.stringify(provider, null, 2));
    } else {
      console.log(`Provider: ${provider.name} (${provider.id})`);
      
      if (provider.description) {
        console.log(`Description: ${provider.description}`);
      }
      
      if (provider.baseURL) {
        console.log(`Base URL: ${provider.baseURL}`);
      }
      
      if (provider.envVar) {
        const hasApiKey = modelRegistry.getApiKey(providerId) ? 'Configured' : 'Not configured';
        console.log(`API Key: ${hasApiKey} (${provider.envVar})`);
      }
      
      console.log(`Authentication Type: ${provider.authType || 'bearer'}`);
      
      if (provider.defaultModel) {
        const defaultModel = modelRegistry.getModel(provider.defaultModel);
        console.log(`Default Model: ${defaultModel?.name || provider.defaultModel} (${provider.defaultModel})`);
      }
      
      console.log(`\nModels (${provider.models.length}):`);
      if (provider.models.length === 0) {
        console.log('  No models registered');
      } else {
        for (const model of provider.models) {
          console.log(`  - ${model.name} (${model.id})`);
        }
      }
    }
    
    return 0;
  }
};
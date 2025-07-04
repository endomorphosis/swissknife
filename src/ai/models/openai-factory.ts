// src/ai/models/openai-factory.ts

import { BaseModel, ModelOptions, ModelCapabilities } from './model.js';
import { OpenAIModel, OpenAIModelOptions } from './openai-model.js';
import { ModelRegistry } from '../models/registry';
import { logger } from '../utils/logger';
import { ConfigManager } from '../config/manager'; // Import the class directly

/**
 * Types of OpenAI models available
 */
export enum OpenAIModelType {
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo',
}

/**
 * Factory for creating and registering OpenAI models
 */
export class OpenAIModelFactory {
  private registry: ModelRegistry;
  private config: ConfigManager; // Type as the instance
  
  constructor() {
    this.registry = ModelRegistry.getInstance();
    this.config = ConfigManager.getInstance(); // Use ConfigManager directly
  }
  
  /**
   * Registers all standard OpenAI models with the registry
   * @param options Options for OpenAI models
   */
  registerStandardModels(options: OpenAIModelOptions = {}): void {
    this.registerGpt35Turbo(options);
    this.registerGpt4(options);
    this.registerGpt4Turbo(options);
    
    logger.info('Registered standard OpenAI models');
  }
  
  /**
   * Registers GPT-3.5 Turbo model
   * @param options Options for the model
   * @returns The registered model
   */
  registerGpt35Turbo(options: OpenAIModelOptions = {}): OpenAIModel {
    const modelDef: ModelOptions = {
      id: OpenAIModelType.GPT_3_5_TURBO,
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      maxTokens: 4096,
      pricePerToken: 0.000002,
      source: 'current',
      capabilities: {
        streaming: true,
        tools: true,
        structuredOutput: true
      }
    };
    
    const model = new OpenAIModel(modelDef, options); // Pass modelDef as ModelOptions and options as OpenAIModelOptions
    this.registry.registerModel(model);
    return model;
  }
  
  /**
   * Registers GPT-4 model
   * @param options Options for the model
   * @returns The registered model
   */
  registerGpt4(options: OpenAIModelOptions = {}): OpenAIModel {
    const modelDef: ModelOptions = {
      id: OpenAIModelType.GPT_4,
      name: 'GPT-4',
      provider: 'openai',
      maxTokens: 8192,
      pricePerToken: 0.00003,
      source: 'current',
      capabilities: {
        streaming: true,
        tools: true,
        structuredOutput: true
      }
    };
    
    const model = new OpenAIModel(modelDef, options); // Pass modelDef as ModelOptions and options as OpenAIModelOptions
    this.registry.registerModel(model);
    return model;
  }
  
  /**
   * Registers GPT-4 Turbo model
   * @param options Options for the model
   * @returns The registered model
   */
  registerGpt4Turbo(options: OpenAIModelOptions = {}): OpenAIModel {
    const modelDef: ModelOptions = {
      id: OpenAIModelType.GPT_4_TURBO,
      name: 'GPT-4 Turbo',
      provider: 'openai',
      maxTokens: 16384,
      pricePerToken: 0.00002,
      source: 'current',
      capabilities: {
        streaming: true,
        tools: true,
        structuredOutput: true,
        images: true
      }
    };
    
    const model = new OpenAIModel(modelDef, options); // Pass modelDef as ModelOptions and options as OpenAIModelOptions
    this.registry.registerModel(model);
    return model;
  }
  
  /**
   * Registers a custom OpenAI-compatible model
   * @param id Model ID
   * @param name Model name
   * @param options Model options
   * @param capabilities Model capabilities
   * @returns The registered model
   */
  registerCustomModel(
    id: string, 
    name: string, 
    options: OpenAIModelOptions = {}, 
    capabilities: Partial<ModelCapabilities> = {}
  ): OpenAIModel {
    const modelDef: ModelOptions = {
      id,
      name,
      provider: 'openai',
      source: 'current',
      capabilities: {
        streaming: capabilities.streaming ?? true,
        tools: capabilities.tools ?? false,
        structuredOutput: capabilities.structuredOutput ?? false,
        ...capabilities
      }
    };
    
    const model = new OpenAIModel(modelDef, options); // Pass modelDef as ModelOptions and options as OpenAIModelOptions
    this.registry.registerModel(model);
    return model;
  }
}

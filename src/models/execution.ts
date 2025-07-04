// src/models/execution.ts

import { ModelRegistry } from './registry.js';
import { BaseModel } from '../ai/models/model';
import { IntegrationRegistry } from '../integration/registry';
import { ConfigManager as ConfigurationManager } from '../config/manager';

/**
 * Options for model execution
 */
export interface ModelExecutionOptions {
  streaming?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  [key: string]: any;
}

/**
 * Result of model execution
 */
export interface ModelExecutionResult {
  output: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  elapsedMs?: number;
}

/**
 * Service for executing models across different sources
 */
export class ModelExecutionService {
  private static instance: ModelExecutionService;
  private modelRegistry: ModelRegistry;
  private integrationRegistry: IntegrationRegistry;
  private configManager: ConfigurationManager;
  
  private constructor() {
    this.modelRegistry = ModelRegistry.getInstance();
    this.integrationRegistry = IntegrationRegistry.getInstance();
    this.configManager = ConfigurationManager.getInstance();
  }
  
  /**
   * Get the singleton instance
   */
  static getInstance(): ModelExecutionService {
    if (!ModelExecutionService.instance) {
      ModelExecutionService.instance = new ModelExecutionService();
    }
    return ModelExecutionService.instance;
  }
  
  /**
   * Execute a model with the given prompt and options
   * @param modelId The model ID to execute
   * @param prompt The prompt to send to the model
   * @param options Execution options
   * @returns Result of model execution
   */
  async executeModel(
    modelId: string,
    prompt: string,
    options: ModelExecutionOptions = {}
  ): Promise<ModelExecutionResult> {
    // Get model and provider
    const model = this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }
    
    const provider = this.modelRegistry.getProvider(model.provider);
    if (!provider) {
      throw new Error(`Provider not found for model ${modelId}: ${model.provider}`);
    }
    
    // Get API key
    const apiKey = this.getApiKey(provider);
    
    // Execute based on source
    switch (model.source) {
      case 'current':
        return this.executeCurrentModel(model, provider, prompt, apiKey, options);
      case 'goose':
        return this.executeGooseModel(model, provider, prompt, apiKey, options);
      case 'ipfs_accelerate':
        return this.executeIPFSModel(model, provider, prompt, apiKey, options);
      case 'swissknife_old':
        return this.executeLegacyModel(model, provider, prompt, apiKey, options);
      default:
        throw new Error(`Unsupported model source: ${model.source}`);
    }
  }
  
  /**
   * Execute a current (direct) model
   */
  private async executeCurrentModel(
    model: Model,
    provider: Provider,
    prompt: string,
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Implementation will depend on the provider
    // This is just a placeholder
    console.log(`Executing ${model.id} from provider ${provider.id} (current)`);
    
    // Simple mock implementation for Phase 1
    return {
      output: `Mock response from ${model.name}`,
      tokenUsage: {
        prompt: prompt.length / 4,
        completion: 100,
        total: prompt.length / 4 + 100
      },
      elapsedMs: 1000
    };
  }
  
  /**
   * Execute a model via the Goose MCP bridge
   */
  private async executeGooseModel(
    model: Model,
    provider: Provider,
    prompt: string,
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Execute with Goose MCP bridge
    const bridge = this.integrationRegistry.getBridge('goose-mcp');
    if (!bridge) {
      throw new Error('Goose MCP bridge not found');
    }
    
    // Initialize if needed
    if (!bridge.isInitialized()) {
      await bridge.initialize();
    }
    
    // Call the bridge
    const result = await bridge.call<any>('generate_completion', {
      model: model.id,
      prompt,
      api_key: apiKey,
      options
    });
    
    return {
      output: result.completion,
      tokenUsage: result.usage,
      elapsedMs: result.timing_ms
    };
  }
  
  /**
   * Execute a model via the IPFS Accelerate bridge
   */
  private async executeIPFSModel(
    model: Model,
    provider: Provider,
    prompt: string,
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Execute with IPFS Accelerate bridge
    const bridge = this.integrationRegistry.getBridge('ipfs-accelerate');
    if (!bridge) {
      throw new Error('IPFS Accelerate bridge not found');
    }
    
    // Initialize if needed
    if (!bridge.isInitialized()) {
      await bridge.initialize();
    }
    
    // Call the bridge
    const result = await bridge.call<any>('generate_completion', {
      model: model.id,
      prompt,
      api_key: apiKey,
      options
    });
    
    return {
      output: result.completion,
      tokenUsage: result.usage,
      elapsedMs: result.timing_ms
    };
  }
  
  /**
   * Execute a model via the Legacy SwissKnife bridge
   */
  private async executeLegacyModel(
    model: Model,
    provider: Provider,
    prompt: string,
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Execute with Legacy SwissKnife bridge
    const bridge = this.integrationRegistry.getBridge('swissknife-legacy');
    if (!bridge) {
      throw new Error('Legacy SwissKnife bridge not found');
    }
    
    // Initialize if needed
    if (!bridge.isInitialized()) {
      await bridge.initialize();
    }
    
    // Call the bridge
    const result = await bridge.call<any>('require_module', {
      modulePath: 'models',
      functionName: 'generateText',
      functionArgs: {
        model: model.id,
        prompt,
        apiKey,
        options
      }
    });
    
    return {
      output: result.text,
      tokenUsage: {
        prompt: result.usage?.tokens || 0,
        completion: 0,
        total: result.usage?.tokens || 0
      },
      elapsedMs: result.usage?.processingTime
    };
  }
  
  /**
   * Get API key for a provider
   */
  private getApiKey(provider: Provider): string {
    if (!provider.envVar) {
      throw new Error(`No environment variable defined for provider: ${provider.id}`);
    }
    
    // First check configuration
    const configItem = this.configManager.getConfig(`ai.models.providers.${provider.id}.apiKey`);
    if (configItem && configItem.value) {
      if (Array.isArray(configItem.value)) {
        return configItem.value[0]; // Use the first API key
      }
      return configItem.value as string;
    }
    
    // Then check environment variable
    const envKey = process.env[provider.envVar];
    if (envKey) {
      return envKey;
    }
    
    throw new Error(`No API key found for provider: ${provider.id}`);
  }
}

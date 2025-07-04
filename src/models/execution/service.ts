/**
 * Model Execution Service - Unified interface for executing model inferences
 */

import { EventEmitter } from 'events';
import { ModelRegistry, ModelProvider } from '../registry';
import { BaseModel as Model } from '../ai/models/model';
import { IntegrationRegistry } from '../integration/registry';
import { ConfigManager } from '../config/manager';

/**
 * Model execution options
 */
export interface ModelExecutionOptions {
  streaming?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  functions?: any[];
  functionCall?: 'auto' | 'none' | { name: string };
  [key: string]: any;
}

/**
 * Model execution result
 */
export interface ModelExecutionResult {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timingMs?: number;
  functionCalls?: any[];
}

/**
 * Model execution stats for tracking usage
 */
export interface ModelExecutionStats {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timingMs: number;
  cost?: number;
  timestamp: number;
}

/**
 * Model Execution Service class
 * 
 * Provides a unified interface for executing model inferences
 */
export class ModelExecutionService extends EventEmitter {
  private static instance: ModelExecutionService;
  private modelRegistry: ModelRegistry;
  private integrationRegistry: IntegrationRegistry;
  private configManager: ConfigManager;
  private executionStats: ModelExecutionStats[] = [];
  private maxStatsHistory: number = 100;
  
  private constructor() {
    super();
    this.modelRegistry = ModelRegistry.getInstance();
    this.integrationRegistry = IntegrationRegistry.getInstance();
    this.configManager = ConfigManager.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): ModelExecutionService {
    if (!ModelExecutionService.instance) {
      ModelExecutionService.instance = new ModelExecutionService();
    }
    return ModelExecutionService.instance;
  }
  
  /**
   * Execute a model with the given prompt and options
   */
  async executeModel(
    modelId: string,
    prompt: string | string[],
    options: ModelExecutionOptions = {}
  ): Promise<ModelExecutionResult> {
    // Get model and provider
    const model = await this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }
    
    // Get provider name from model
    const providerName = model.getProvider();
    
    // Get API key from config using provider name
    const apiKey = this.configManager.get<string>(`providers.${providerName}.apiKey`);
    
    // Create a simple provider object for the execution methods
    const provider: ModelProvider = {
      id: providerName,
      name: providerName,
      description: `Provider for ${providerName}`,
      isAvailable: async () => true,
      getModels: async () => [],
      getModelById: async () => null
    };
    
    // Emit event
    this.emit('model:execution:start', { modelId, provider: provider.id });
    
    try {
      // Execute based on model type - simplified to just use current execution
      const startTime = Date.now();
      let result: ModelExecutionResult;
      
      // For now, use executeCurrentModel for all models
      result = await this.executeCurrentModel(model, provider, prompt, apiKey || '', options);
      
      
      const endTime = Date.now();
      const timingMs = endTime - startTime;
      
      // Add timing if not provided
      if (!result.timingMs) {
        result.timingMs = timingMs;
      }
      
      // Track execution stats
      this.trackExecutionStats({
        provider: provider.id,
        model: model.getId(),
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
        timingMs,
        cost: this.calculateCost(model, result.usage),
        timestamp: endTime
      });
      
      // Emit completion event
      this.emit('model:execution:complete', {
        modelId,
        provider: provider.id,
        usage: result.usage,
        timingMs: result.timingMs
      });
      
      return result;
    } catch (error) {
      // Emit error event
      this.emit('model:execution:error', {
        modelId,
        provider: provider.id,
        error
      });
      
      throw error;
    }
  }
  
  /**
   * Track execution stats
   */
  private trackExecutionStats(stats: ModelExecutionStats): void {
    this.executionStats.unshift(stats);
    
    // Limit history size
    if (this.executionStats.length > this.maxStatsHistory) {
      this.executionStats = this.executionStats.slice(0, this.maxStatsHistory);
    }
    
    // Emit stats event
    this.emit('model:execution:stats', stats);
  }
  
  /**
   * Calculate cost for model execution
   */
  private calculateCost(model: Model, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }): number | undefined {
    if (!usage) {
      return undefined;
    }
    
    // Use a default pricing model since BaseModel doesn't have pricePerToken
    // This should be updated when proper pricing is implemented
    void model; // Will be used when model-specific pricing is implemented
    const defaultPricePerToken = 0.0001; // $0.0001 per token as a placeholder
    return defaultPricePerToken * usage.totalTokens;
  }
  
  /**
   * Get execution stats
   */
  getExecutionStats(): ModelExecutionStats[] {
    return [...this.executionStats];
  }
  
  /**
   * Execute model from current source
   */
  private async executeCurrentModel(
    model: Model,
    provider: ModelProvider,
    prompt: string | string[],
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // In Phase 1, we'll just implement a mock implementation
    // This will be replaced with actual implementation in later phases
    
    console.log(`Executing current model: ${model.getId()} with provider: ${provider.name}`);
    // Note: apiKey and options will be used in actual implementation
    void apiKey; void options;
    
    // Mock execution delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      response: `This is a mock response from ${model.getName()}. Prompt: ${Array.isArray(prompt) ? prompt.join('\\n') : prompt}`,
      usage: {
        promptTokens: typeof prompt === 'string' ? Math.ceil(prompt.length / 4) : Math.ceil(prompt.join('').length / 4),
        completionTokens: 50,
        totalTokens: (typeof prompt === 'string' ? Math.ceil(prompt.length / 4) : Math.ceil(prompt.join('').length / 4)) + 50
      },
      timingMs: 500
    };
  }
  
  /**
   * Execute model from Goose source
   */
  // @ts-ignore - Method will be used when multiple model sources are implemented
  private async executeGooseModel(
    model: Model,
    provider: ModelProvider,
    prompt: string | string[],
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Execute with Goose MCP bridge
    void provider; // Will be used when implementing proper provider handling
    const bridge = this.integrationRegistry.getBridge('goose-mcp');
    if (!bridge) {
      throw new Error('Goose MCP bridge not found');
    }
    
    // Initialize if needed
    if (!bridge.isInitialized()) {
      await bridge.initialize();
    }
    
    // Format prompt for Goose
    const formattedPrompt = Array.isArray(prompt) ? prompt.join('\\n') : prompt;
    
    // Call the bridge
    const result = await bridge.call<any>('generateCompletion', {
      model: model.getId(),
      prompt: formattedPrompt,
      api_key: apiKey,
      options
    });
    
    return {
      response: result.completion,
      usage: result.usage,
      timingMs: result.timing_ms,
      functionCalls: result.function_calls
    };
  }
  
  /**
   * Execute model from IPFS source
   */
  // @ts-ignore - Method will be used when multiple model sources are implemented
  private async executeIPFSModel(
    model: Model,
    provider: ModelProvider,
    prompt: string | string[],
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Execute with IPFS bridge
    void provider; // Will be used when implementing proper provider handling
    const bridge = this.integrationRegistry.getBridge('ipfs-accelerate');
    if (!bridge) {
      throw new Error('IPFS Accelerate bridge not found');
    }
    
    // Initialize if needed
    if (!bridge.isInitialized()) {
      await bridge.initialize();
    }
    
    // Format prompt for IPFS
    const formattedPrompt = Array.isArray(prompt) ? prompt.join('\\n') : prompt;
    
    // Call the bridge
    const result = await bridge.call<any>('modelInference', {
      model: model.getId(),
      prompt: formattedPrompt,
      apiKey,
      ...options
    });
    
    return {
      response: result.output,
      usage: {
        promptTokens: result.tokenUsage?.prompt || 0,
        completionTokens: result.tokenUsage?.completion || 0,
        totalTokens: result.tokenUsage?.total || 0
      },
      timingMs: result.elapsedMs
    };
  }
  
  /**
   * Execute model from SwissKnife Old source
   */
  // @ts-ignore - Method will be used when multiple model sources are implemented
  private async executeSwissKnifeOldModel(
    model: Model,
    provider: ModelProvider,
    prompt: string | string[],
    apiKey: string,
    options: ModelExecutionOptions
  ): Promise<ModelExecutionResult> {
    // Execute with SwissKnife Old bridge
    void provider; // Will be used when implementing proper provider handling
    const bridge = this.integrationRegistry.getBridge('swissknife-old');
    if (!bridge) {
      throw new Error('SwissKnife Old bridge not found');
    }
    
    // Initialize if needed
    if (!bridge.isInitialized()) {
      await bridge.initialize();
    }
    
    // Format prompt for SwissKnife Old
    const formattedPrompt = Array.isArray(prompt) ? prompt.join('\\n') : prompt;
    
    // Call the bridge
    const result = await bridge.call<any>('executeModel', {
      modelId: model.getId(),
      prompt: formattedPrompt,
      apiKey,
      options
    });
    
    return {
      response: result.text,
      usage: result.stats?.usage,
      timingMs: result.stats?.elapsedMs
    };
  }
}
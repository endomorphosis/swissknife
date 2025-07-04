// src/ai/service.ts

import { Agent } from './agent/agent.js';
import { ModelRegistry } from '../models/registry';
import { OpenAIModelFactory } from './models/openai-factory.js';
import { ConfigManager } from '../config/manager';
import { logger } from '../utils/logger';
import { Tool } from './tools/tool.js';
import { TaskManager } from '../tasks/manager';

/**
 * Options for configuring the AI service
 */
export interface AIServiceOptions {
  /** Whether to auto-register models on initialization */
  autoRegisterModels?: boolean;
  /** OpenAI API key */
  openaiApiKey?: string;
  /** Whether to auto-register default tools */
  autoRegisterTools?: boolean;
  /** Task manager instance */
  taskManager?: TaskManager;
}

/**
 * Service for managing AI capabilities
 */
export class AIService {
  private static instance: AIService;
  private initialized: boolean = false;
  private modelRegistry: ModelRegistry;
  private config: ConfigManager;
  private tools: Map<string, Tool> = new Map();
  private agents: Map<string, Agent> = new Map();
  private taskManager?: TaskManager;
  private activeAgent?: Agent;
  private options: AIServiceOptions;
  // Cache for recent responses to improve performance
  private responseCache: Map<string, {response: string, timestamp: number}> = new Map();
  // Cache statistics for performance monitoring
  private cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0
  };

 private constructor() {
 this.modelRegistry = ModelRegistry.getInstance();
    this.config = ConfigManager.getInstance();
    this.options = {};
    logger.info('AIService created');
  }

  public async initialize(options: AIServiceOptions = {}): Promise<void> {
    this.options = options;
    await this.lazyInitialize();
  }
  
  /**
   * Gets the singleton instance of the AIService
   */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }
  
  /**
   * Initializes the AI service
   * @param options Initialization options
   */
  private async lazyInitialize(): Promise<void> {
    if (this.initialized) return;
    
    logger.info('Initializing AIService');
    
    // Set up task manager if provided
    if (this.options.taskManager) {
      this.taskManager = this.options.taskManager;
      logger.debug('TaskManager connected to AIService');
    }
    
    // Register models if requested
    if (this.options.autoRegisterModels !== false) {
      await this.registerDefaultModels(this.options.openaiApiKey);
    }
    
    // Register tools if requested
    if (this.options.autoRegisterTools !== false) {
      this.registerDefaultTools();
    }
    
    this.initialized = true;
    logger.info('AIService initialized successfully');
  }

  public async createAgent(
    id: string,
    modelId: string = 'default',
    options: Partial<{
      tools: string[];
      temperature: number;
      maxTokens: number;
      priority: number;
      systemPrompt?: string;
    }> = {}
  ): Promise<Agent> {
    // Ensure we're initialized
    if (!this.initialized) {
      throw new Error('AIService must be initialized before creating agents');
    }
    
    // Get the model
    const model = await this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }
    
    // Get requested tools
    const agentTools: Tool[] = [];
    if (options.tools && options.tools.length > 0) {
      for (const toolName of options.tools) {
        const tool = this.tools.get(toolName);
        if (tool) {
          agentTools.push(tool);
        } else {
          logger.warn(`Tool not found: ${toolName}`);
        }
      }
    }
    
    // Create the agent
    const agent = new Agent({
      model,
      tools: agentTools,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      priority: options.priority,
      taskManager: this.taskManager
    });
    
    // Store the agent
    this.agents.set(id, agent);
    logger.debug(`Created agent ${id} with model ${model.id}`);
    
    return agent;
  }
  
  /**
   * Gets a previously created agent
   * @param id Agent ID
   */
  public getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }
  
  /**
   * Registers a tool with the service
   * @param tool Tool to register
   */
  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }
  
  /**
   * Gets a registered tool by name
   * @param name Tool name
   */
  public getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  /**
   * Gets all registered tools
   */
  public getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Registers default models with the registry
   * @private
   */
  private async registerDefaultModels(openaiApiKey?: string): Promise<void> {
    const modelFactory = new OpenAIModelFactory();
    
    // Register OpenAI models
    modelFactory.registerStandardModels({
      apiKey: openaiApiKey || this.config.get<string>('ai.openai.apiKey')
    });
    
    logger.info('Registered default AI models');
  }
  
  /**
   * Registers default tools
   * @private
   */
  private registerDefaultTools(): void {
    // Register web search tool
    // Commented out due to incompatible Tool interface 
    // this.registerTool(new WebSearchTool());
    
    // Register other default tools here
    // ...
    
    logger.info('Registered default AI tools');
  }

  /**
   * Initializes a chat session with the AI agent
   * @param modelId ID of the model to use
   * @param systemPrompt Custom system prompt
   * @param temperature Model temperature
   */
  public initSession(modelId: string, systemPrompt: string, temperature: number): void {
    this.createAgent('chat-session', modelId, { 
      temperature, 
      tools: [],
      systemPrompt: systemPrompt
    });
    this.activeAgent = this.getAgent('chat-session');
  }

  /**
   * Processes a user message in the current chat session
   * @param message User input message
   * @returns Agent response
   */
  public async processMessage(message: string): Promise<{content: string, usage?: any, cached?: boolean, error?: string, retryAfter?: number}> {
    if (!this.activeAgent) {
      throw new Error('No active chat session');
    }
    
    // Check if we have a recent cached response for this exact message
    // Only use cache for simple informational queries to improve performance
    const cacheKey = this.createCacheKey(message);
    const cachedResponse = this.responseCache.get(cacheKey);
    const cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // Track total requests for cache statistics
    this.cacheStats.totalRequests++;
    
    if (cachedResponse && (Date.now() - cachedResponse.timestamp) < cacheTTL) {
      // Cache hit
      this.cacheStats.hits++;
      logger.debug(`Using cached response (cache hit rate: ${Math.round((this.cacheStats.hits / this.cacheStats.totalRequests) * 100)}%)`);
      return {
        content: cachedResponse.response,
        cached: true
      };
    }
    
    // Cache miss
    this.cacheStats.misses++;
    
    try {
      // Ensure we're initialized before processing
      await this.lazyInitialize();
      
      // No cache hit, proceed with normal processing
      const response = await this.activeAgent.processMessage(message);
      
      // Cache the response if it's cacheable (simple informational queries)
      if (this.isCacheable(message)) {
        this.responseCache.set(cacheKey, {
          response: response.content,
          timestamp: Date.now()
        });
        
        // Limit cache size to prevent memory leaks
        if (this.responseCache.size > 100) {
          // Use a more sophisticated cache eviction strategy - remove oldest entries
          const cacheEntries = [...this.responseCache.entries()];
          
          // Sort by timestamp (oldest first)
          cacheEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);
          
          // Remove the oldest 10% of entries
          const entriesToRemove = Math.max(1, Math.floor(cacheEntries.length * 0.1));
          for (let i = 0; i < entriesToRemove; i++) {
            this.responseCache.delete(cacheEntries[i][0]);
          }
          
          // Update eviction statistics
          this.cacheStats.evictions += entriesToRemove;
          
          logger.debug(`Cache pruned, removed ${entriesToRemove} oldest entries (total evictions: ${this.cacheStats.evictions})`);
        }
      }
      
      // Return both content and usage metrics if available
      return {
        content: response.content,
        usage: response.usage || undefined,
        cached: false
      };
    } catch (error) {
      logger.error('Error processing message:', error);
      
      // Provide a more user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      let userFriendlyError = 'An error occurred while processing your message.';
      let retryAfter: number | undefined = undefined;
      
      // Detect common error types and provide better messages with recovery advice
      if (errorMessage.toLowerCase().includes('token') || errorMessage.toLowerCase().includes('context length')) {
        userFriendlyError = 'The model encountered a token limit error. To fix this:\n\n' +
                           '1. Try sending a shorter message\n' +
                           '2. Clear the conversation history with /clear\n' +
                           '3. Consider switching to a model with larger context using /model';
      } else if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
        userFriendlyError = 'The request timed out. This could be due to:\n\n' +
                           '1. High server load\n' +
                           '2. Network connectivity issues\n\n' +
                           'Try again in a few moments or use a shorter message.';
      } else if (errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('rate-limit') || 
                errorMessage.toLowerCase().includes('too many requests')) {
        // Extract retry-after value if available
        const retryMatch = errorMessage.match(/retry after (\d+)/i);
        if (retryMatch && retryMatch[1]) {
          retryAfter = parseInt(retryMatch[1], 10);
        }
        
        userFriendlyError = `Rate limit exceeded. ${retryAfter ? `Please wait ${retryAfter} seconds` : 'Please wait a moment'} before trying again.\n\n` +
                           'This happens when too many requests are sent in a short period.';
      } else if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
        userFriendlyError = 'There was an authentication error with the AI provider.\n\n' +
                           'This is likely an API configuration issue. Please check your API keys.';
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('connect') || 
                errorMessage.toLowerCase().includes('unreachable')) {
        userFriendlyError = 'A network error occurred while connecting to the AI provider.\n\n' + 
                           '1. Check your internet connection\n' +
                           '2. Verify that the AI service is operational\n' +
                           '3. Try again in a few moments';
      } else if (errorMessage.toLowerCase().includes('content policy') || errorMessage.toLowerCase().includes('content filter') || 
                errorMessage.toLowerCase().includes('moderation')) {
        userFriendlyError = 'Your message was flagged by content safety filters.\n\n' +
                           'The AI provider has policies against certain types of content. ' +
                           'Please revise your query to comply with content guidelines.';
      } else if (errorMessage.toLowerCase().includes('server error') || errorMessage.toLowerCase().includes('500') || 
                errorMessage.toLowerCase().includes('internal')) {
        userFriendlyError = 'The AI provider is experiencing internal server issues.\n\n' +
                           'This is likely a temporary problem. Please try again in a few minutes.';
      }
      
      return {
        content: userFriendlyError,
        error: errorMessage,
        cached: false,
        retryAfter
      };
    }
  }
  
  /**
   * Creates a cache key for a message
   * @param message The message to create a key for
   * @returns The cache key
   * @private
   */
  private createCacheKey(message: string): string {
    // Simple implementation, could be improved with normalization or hashing
    return message.trim().toLowerCase();
  }
  
  /**
   * Determines if a message is cacheable
   * @param message The message to check
   * @returns Whether the message is cacheable
   * @private
   */
  private isCacheable(message: string): boolean {
    // Simple implementation - only cache relatively short informational queries
    // Could be improved with more sophisticated heuristics
    const msg = message.trim().toLowerCase();
    const isCommand = msg.startsWith('/');
    const isTooLong = msg.length > 200;
    
    // Don't cache command inputs or long messages
    return !isCommand && !isTooLong;
  }

  /**
   * Sets the model for the current chat session
   * @param modelId ID of the model to use
   */
  public async setModel(modelId: string): Promise<void> {
    if (!this.activeAgent) {
      throw new Error('No active chat session');
    }
    
    const model = await this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }
    
    this.activeAgent.setModel(model);
    logger.info(`Chat model switched to: ${modelId}`);
  }

  /**
   * Sets the temperature for the current chat session
   * @param temperature New temperature value (0-2)
   */
  public setTemperature(temperature: number): void {
    if (!this.activeAgent) {
      throw new Error('No active chat session');
    }
    
    if (temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }
    
    this.activeAgent.setTemperature(temperature);
    logger.info(`Chat temperature set to: ${temperature}`);
  }
  
  /**
   * Gets cache statistics for performance monitoring
   * @returns Cache statistics including hits, misses, and hit rate
   */
  public getCacheStats(): {
    hits: number;
    misses: number;
    evictions: number;
    totalRequests: number;
    hitRate: number;
    cacheSize: number;
  } {
    return {
      ...this.cacheStats,
      hitRate: this.cacheStats.totalRequests > 0 
        ? this.cacheStats.hits / this.cacheStats.totalRequests 
        : 0,
      cacheSize: this.responseCache.size
    };
  }
  
  /**
   * Clears the response cache
   */
  public clearCache(): void {
    const previousSize = this.responseCache.size;
    this.responseCache.clear();
    logger.info(`Response cache cleared (${previousSize} entries removed)`);
  }
}

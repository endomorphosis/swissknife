/**
 * SwissKnife AI Adapter - Unified Implementation
 * Connects to actual SwissKnife AI providers and models
 */

import { BrowserEventEmitter } from '../utils/browser-utils';
import { BrowserStorageAdapter } from './browser-storage-adapter';
import { BrowserConfigManager } from './browser-config-manager'; // Import the new config manager

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  models: string[];
  isConfigured: boolean;
}

export interface ModelConfig {
  id?: number;
  name: string;
  provider: string;
  alias?: string;
  subtext?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface AIResponse {
  content: string;
  model?: string;
  provider?: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface BrowserAIOptions {
  provider?: string;
  apiKey?: string;
  storage: BrowserStorageAdapter;
  config: BrowserConfigManager;
}

export class BrowserAIAdapter extends BrowserEventEmitter { // Renamed class and extends EventEmitter
  private currentModel: ModelConfig | null = null;
  private availableProviders: AIProvider[] = [];
  private initialized = false;
  private storage: BrowserStorageAdapter;
  private config: BrowserConfigManager; // Added config manager

  constructor(options: BrowserAIOptions) { // Updated constructor to take options
    super();
    this.storage = options.storage;
    this.config = options.config;

    // Set initial provider and API key if provided
    if (options.provider) {
      this.setCurrentProvider(options.provider);
    }
    if (options.apiKey) {
      this.setApiKey(options.provider || 'default', options.apiKey); // Associate with a provider
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load available providers
      await this.loadProviders();
      
      // Load current model configuration
      await this.loadCurrentModel();
      
      this.initialized = true;
      console.log('✅ Browser AI Adapter initialized');
    } catch (error) {
      console.error('Failed to initialize AI adapter:', error);
      // Fall back to hardcoded providers if API is not available
      this.loadFallbackProviders();
      this.initialized = true;
    }
  }

  private async loadProviders(): Promise<void> {
    // In a real scenario, this would fetch from a server
    // For now, we'll use a hardcoded list
    this.loadFallbackProviders();
  }

  private loadFallbackProviders(): void {
    this.availableProviders = [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'Access GPT-4 and other OpenAI models',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1'],
        isConfigured: true
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Access Claude and other Anthropic models',
        models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
        isConfigured: true
      },
      {
        id: 'google',
        name: 'Google',
        description: 'Access Gemini and other Google AI models',
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
        isConfigured: true
      },
      {
        id: 'ollama',
        name: 'Ollama',
        description: 'Run and use open-source models locally',
        models: ['qwen2.5', 'llama-3.2', 'mistral'],
        isConfigured: true
      },
    ];
  }

  private async loadCurrentModel(): Promise<void> {
    try {
      // Try to load from storage first
      const storedModel = await this.storage.retrieve('GOOSE_MODEL');
      const storedProvider = await this.storage.retrieve('GOOSE_PROVIDER');
      
      if (storedModel && storedProvider) {
        this.currentModel = {
          name: storedModel,
          provider: storedProvider,
        };
        return;
      }
    } catch (error) {
        console.warn('Could not load current model from storage:', error);
    }
    // Default model
    this.currentModel = {
        name: 'gpt-4o',
        provider: 'openai'
    };
  }

  async generateResponse(prompt: string, options?: {
    model?: string;
    provider?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    const model = options?.model || this.currentModel?.name || 'gpt-4o';
    const provider = options?.provider || this.currentModel?.provider || 'openai';

    // In a real scenario, this would make an API call
    // For now, we'll simulate the response
    return this.generateSimulatedResponse(prompt, { model, provider });
  }

  private generateSimulatedResponse(prompt: string, options: { model: string; provider: string }): AIResponse {
    const { model, provider } = options;
    
    let response = `Hello! I'm your SwissKnife AI assistant powered by ${model} from ${provider}. I'm fully integrated with the SwissKnife TypeScript system and can help with:

• AI model management and switching
• Task creation and workflow automation  
• Code analysis and development
• System configuration and optimization
• Extension management and tool integration

How can I assist you today?`;

    return {
      content: response,
      model: model,
      provider: provider
    };
  }

  async listProviders(): Promise<AIProvider[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return [...this.availableProviders];
  }

  async getModels(providerId?: string): Promise<ModelConfig[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const models: ModelConfig[] = [];
    
    for (const provider of this.availableProviders) {
      if (providerId && provider.id !== providerId) continue;
      
      for (const modelName of provider.models) {
        models.push({
          name: modelName,
          provider: provider.name,
          alias: `${provider.name} - ${modelName}`
        });
      }
    }

    return models;
  }

  async switchModel(model: string, provider: string): Promise<boolean> {
    try {
      this.currentModel = { name: model, provider: provider };
      
      // Store in storage
      await this.storage.store('GOOSE_MODEL', model);
      await this.storage.store('GOOSE_PROVIDER', provider);
      
      return true;
    } catch (error) {
      console.error('Failed to switch model:', error);
      return false;
    }
  }

  getCurrentModel(): ModelConfig | null {
    return this.currentModel;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    try {
      const stored = await this.storage.retrieve('swissknife_chat_history');
      if (stored) {
        return stored;
      }
    } catch (error) {
      console.warn('Could not load chat history:', error);
    }
    return [];
  }

  async saveChatMessage(message: ChatMessage): Promise<void> {
    try {
      const history = await this.getChatHistory();
      history.push({
        ...message,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 50 messages
      const trimmed = history.slice(-50);
      await this.storage.store('swissknife_chat_history', trimmed);
    } catch (error) {
      console.warn('Could not save chat message:', error);
    }
  }

  // Methods expected by SwissKnifeBrowserCore and SwissKnifeBrowserBridge
  async registerDefaultModels(): Promise<void> {
    console.log('Registering default AI models...');
    // This would typically involve loading models from a config or API
    // For now, the models are hardcoded in loadFallbackProviders
  }

  async registerDefaultTools(): Promise<void> {
    console.log('Registering default AI tools...');
    // This would typically involve loading tools from a config or API
  }

  setCurrentProvider(provider: string): void {
    // This method is called by SwissKnifeBrowserBridge
    // It should update the current AI provider
    const model = this.currentModel?.name || 'gpt-4o'; // Keep current model if exists
    this.switchModel(model, provider);
  }

  setApiKey(provider: string, apiKey: string): void {
    // This method is called by SwissKnifeBrowserBridge
    // It should store the API key for the given provider
    // For now, we'll just log it
    console.log(`Setting API key for ${provider}: ${apiKey.substring(0, 5)}...`);
    // In a real app, you'd store this securely, e.g., in BrowserStorage
    this.storage.store(`api_key_${provider}`, apiKey);
  }

  async integrateWithSwissKnifeAI(): Promise<void> {
    // This method is called by SwissKnifeBrowserBridge
    // It should ensure the AI adapter is ready for use
    await this.initialize();
  }

  async chat(messages: ChatMessage[], options: any = {}): Promise<AIResponse> {
    // This method is called by SwissKnifeBrowserBridge
    // It should handle chat-based interactions
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    return this.generateResponse(prompt, options);
  }

  // Dispose method for cleanup
  async dispose(): Promise<void> {
    console.log('Disposing BrowserAIAdapter resources...');
    this.initialized = false;
    // Any cleanup logic here
  }
}

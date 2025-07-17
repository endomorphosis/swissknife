import { BrowserEventEmitter } from '../utils/browser-utils';

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

export class SwissKnifeAIAdapter extends BrowserEventEmitter {
  private initialized = false;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('Initializing SwissKnife AI Adapter (mock for web)...');
    this.initialized = true;
    console.log('✅ SwissKnife AI Adapter (mock) initialized');
  }

  async generateResponse(prompt: string, options?: {
    model?: string;
    provider?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIResponse> {
    console.warn(`Attempted to generate AI response in web environment: ${prompt}`);
    return { content: 'AI response generation not supported in web environment.' };
  }

  async listProviders(): Promise<any[]> {
    console.warn('Attempted to list AI providers in web environment.');
    return [];
  }

  async getModels(providerId?: string): Promise<ModelConfig[]> {
    console.warn('Attempted to get AI models in web environment.');
    return [];
  }

  async switchModel(model: string, provider: string): Promise<boolean> {
    console.warn(`Attempted to switch AI model to ${model} from ${provider} in web environment.`);
    return false;
  }

  getCurrentModel(): ModelConfig | null {
    console.warn('Attempted to get current AI model in web environment.');
    return null;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    console.warn('Attempted to get chat history in web environment.');
    return [];
  }

  async saveChatMessage(message: ChatMessage): Promise<void> {
    console.warn('Attempted to save chat message in web environment.', message);
  }

  async registerDefaultModels(): Promise<void> {
    console.warn('Attempted to register default AI models in web environment.');
  }

  async registerDefaultTools(): Promise<void> {
    console.warn('Attempted to register default AI tools in web environment.');
  }

  setCurrentProvider(provider: string): void {
    console.warn(`Attempted to set current AI provider to ${provider} in web environment.`);
  }

  setApiKey(provider: string, apiKey: string): void {
    console.warn(`Attempted to set API key for ${provider} in web environment.`);
  }

  async integrateWithSwissKnifeAI(): Promise<void> {
    console.warn('Attempted to integrate with SwissKnife AI in web environment.');
  }

  async chat(messages: ChatMessage[], options: any = {}): Promise<AIResponse> {
    console.warn(`Attempted to chat with AI in web environment: ${messages.map(m => m.content).join(' ')}`);
    return { content: 'AI chat not supported in web environment.' };
  }

  async dispose(): Promise<void> {
    console.log('Disposing SwissKnifeAIAdapter (mock) resources...');
    this.initialized = false;
  }
}
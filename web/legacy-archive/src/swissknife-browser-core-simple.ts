/**
 * SwissKnife Browser Core - Simplified version for browser compatibility
 */

import './adapters/browser-globals';
import { BrowserStorageAdapter } from './adapters/browser-storage-adapter';
import { BrowserAIAdapter } from './adapters/browser-ai-adapter';
import { BrowserCommandAdapter } from './adapters/browser-command-adapter';

export interface SwissKnifeBrowserConfig {
  aiProvider?: 'openai' | 'anthropic' | 'groq';
  apiKey?: string;
  storageType?: 'indexeddb' | 'localstorage';
  debug?: boolean;
}

export class SwissKnifeBrowserCore {
  private storageAdapter: BrowserStorageAdapter;
  private aiAdapter: BrowserAIAdapter;
  private commandAdapter: BrowserCommandAdapter;
  private config: SwissKnifeBrowserConfig;

  constructor(config: SwissKnifeBrowserConfig = {}) {
    this.config = {
      aiProvider: 'openai',
      storageType: 'indexeddb',
      debug: false,
      ...config
    };

    // Initialize adapters
    this.storageAdapter = new BrowserStorageAdapter(this.config.storageType);
    this.aiAdapter = new BrowserAIAdapter(this.config.aiProvider, this.config.apiKey);
    this.commandAdapter = new BrowserCommandAdapter();
  }

  async initialize(): Promise<void> {
    try {
      await this.storageAdapter.initialize();
      await this.aiAdapter.initialize();
      await this.commandAdapter.initialize();
      
      if (this.config.debug) {
        console.log('SwissKnife Browser Core initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize SwissKnife Browser Core:', error);
      throw error;
    }
  }

  // Storage methods
  async store(key: string, data: any): Promise<void> {
    return this.storageAdapter.store(key, data);
  }

  async retrieve(key: string): Promise<any> {
    return this.storageAdapter.retrieve(key);
  }

  async delete(key: string): Promise<void> {
    return this.storageAdapter.delete(key);
  }

  // AI methods
  async generateText(prompt: string, options: any = {}): Promise<string> {
    return this.aiAdapter.generateText(prompt, options);
  }

  async chat(messages: any[], options: any = {}): Promise<any> {
    return this.aiAdapter.chat(messages, options);
  }

  // Command methods
  async executeCommand(command: string, args: string[] = []): Promise<any> {
    return this.commandAdapter.execute(command, args);
  }

  async listCommands(): Promise<string[]> {
    return this.commandAdapter.listCommands();
  }

  // Utility methods
  getVersion(): string {
    return '1.0.0-browser';
  }

  getConfig(): SwissKnifeBrowserConfig {
    return { ...this.config };
  }

  isInitialized(): boolean {
    return this.storageAdapter.isReady() && 
           this.aiAdapter.isReady() && 
           this.commandAdapter.isReady();
  }
}

// Export singleton instance
export const swissknife = new SwissKnifeBrowserCore();

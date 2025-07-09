/**
 * SwissKnife Browser Integration Bridge
 * Connects the windowed interface to TypeScript functionality
 */

import { BrowserAIAdapter, AIResponse, ChatMessage } from '@/adapters/browser-ai-adapter';
import { SwissKnifeTaskAdapter, TaskConfig, WorkflowConfig } from './adapters/browser-task-adapter';
import { BrowserEventEmitter, getBrowserCapabilities } from './utils/browser-utils';
import { BrowserStorageAdapter, BrowserStorageOptions } from './adapters/browser-storage-adapter';
import { BrowserConfigManager } from './adapters/browser-config-manager';

export interface SwissKnifeConfig {
  aiProvider?: string;
  apiKeys?: Record<string, string>;
  enableTasks?: boolean;
  enableStorage?: boolean;
  debugMode?: boolean;
}

export class SwissKnifeBrowserBridge extends BrowserEventEmitter {
  private ai: BrowserAIAdapter;
  private tasks: SwissKnifeTaskAdapter;
  private storage: BrowserStorageAdapter;
  private config: SwissKnifeConfig;
  private initialized = false;
  private configManager: BrowserConfigManager;

  constructor(config: SwissKnifeConfig = {}) {
    super();
    
    this.config = {
      aiProvider: 'openai',
      enableTasks: true,
      enableStorage: true,
      debugMode: false,
      ...config
    };

    const storageOptions: BrowserStorageOptions = {
      type: 'indexeddb'
    };
    this.storage = new BrowserStorageAdapter(storageOptions);
    this.configManager = new BrowserConfigManager();
    this.ai = new BrowserAIAdapter({ storage: this.storage, config: this.configManager });
    this.tasks = new SwissKnifeTaskAdapter();
    
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize adapters first
      await this.storage.initialize();
      await this.ai.initialize();
      await this.tasks.initialize();

      // Load saved configuration after storage is initialized
      const savedConfig = await this.storage.retrieve('swissknife-config');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig as SwissKnifeConfig };
      }

      // Set up AI provider from config
      if (this.config.aiProvider) {
        this.ai.setCurrentProvider(this.config.aiProvider);
      }

      // Set API keys from config
      if (this.config.apiKeys) {
        Object.entries(this.config.apiKeys).forEach(([provider, key]) => {
          this.ai.setApiKey(provider, key);
        });
      }

      this.initialized = true;
      this.emit('initialized', {
        capabilities: getBrowserCapabilities(),
        config: this.config
      });

      if (this.config.debugMode) {
        console.log('🔪 SwissKnife Browser Bridge initialized with config:', this.config);
      }
    } catch (error) {
      this.emit('initializationError', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // AI Events
    this.ai.on('requestStarted', (data: any) => this.emit('ai:requestStarted', data));
    this.ai.on('requestCompleted', (data: any) => this.emit('ai:requestCompleted', data));
    this.ai.on('requestError', (data: any) => this.emit('ai:requestError', data));

    // Task Events  
    this.tasks.on('taskCreated', (task: any) => this.emit('task:created', task));
    this.tasks.on('taskUpdated', (task: any) => this.emit('task:updated', task));
    this.tasks.on('taskStarted', (task: any) => this.emit('task:started', task));
    this.tasks.on('taskExecutionCompleted', (data: any) => this.emit('task:completed', data));
    this.tasks.on('taskFailed', (data: any) => this.emit('task:failed', data));
  }

  // Configuration Management
  updateConfig(updates: Partial<SwissKnifeConfig>): void {
    this.config = { ...this.config, ...updates };
    this.storage.store('swissknife-config', this.config);
    this.emit('configUpdated', this.config);
  }

  getConfig(): SwissKnifeConfig {
    return { ...this.config };
  }

  // AI Integration Methods
  async generateAIResponse(prompt: string, options: any = {}): Promise<AIResponse> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.ai.generateResponse(prompt, options);
  }

  async chatWithAI(messages: ChatMessage[], options: any = {}): Promise<AIResponse> {
    if (!this.initialized) {
      await this.initialize();
    }
    // This is a placeholder for the actual chat implementation
    const response = await this.ai.generateResponse(messages.map(m => m.content).join('\n'), options);
    return response;
  }

  setAIProvider(provider: string): void {
    this.ai.switchModel(this.ai.getCurrentModel()?.name || 'gpt-4o', provider);
    this.updateConfig({ aiProvider: provider });
  }

  setAIApiKey(provider: string, apiKey: string): void {
    // This is a placeholder for the actual API key implementation
    console.log(`API key for ${provider} set`);
  }

  getAIProviders() {
    return this.ai.listProviders();
  }

  getCurrentAIProvider() {
    return this.ai.getCurrentModel()?.provider;
  }

  // Task Management Integration
  createTask(params: {
    title: string;
    description?: string;
    priority?: TaskConfig['priority'];
    dependencies?: string[];
    metadata?: Record<string, any>;
  }): Promise<TaskConfig> {
    return this.tasks.createTask(params);
  }

  getTask(id: string): Promise<TaskConfig | null> {
    return this.tasks.getTask(id);
  }

  updateTask(id: string, updates: Partial<TaskConfig>): Promise<TaskConfig | null> {
    return this.tasks.updateTask(id, updates);
  }

  deleteTask(id: string): Promise<boolean> {
    return this.tasks.deleteTask(id);
  }

  listTasks(filter?: { status?: TaskConfig['status']; priority?: TaskConfig['priority'] }): Promise<TaskConfig[]> {
    return this.tasks.listTasks(filter);
  }

  async executeTask(id: string): Promise<any> {
    return this.tasks.executeTask(id);
  }

  createTaskGraph(name: string, tasks: TaskConfig[] = []): Promise<WorkflowConfig> {
    // This is a placeholder for the actual graph creation implementation
    return this.tasks.createWorkflow({ name, steps: [] });
  }

  async executeTaskGraph(graphId: string): Promise<any> {
    // This is a placeholder for the actual graph execution implementation
    console.log(`Executing task graph ${graphId}`);
  }

  getTaskStatistics() {
    return this.tasks.getStats();
  }

  // Integration with windowed interface
  async openAIChat(): Promise<void> {
    this.emit('window:openRequested', {
      type: 'ai-chat',
      title: 'AI Chat',
      icon: '🤖',
      data: {
        providers: await this.getAIProviders(),
        currentProvider: this.getCurrentAIProvider()
      }
    });
  }

  async openTaskManager(): Promise<void> {
    this.emit('window:openRequested', {
      type: 'task-manager',
      title: 'Task Manager',
      icon: '📋',
      data: {
        tasks: await this.listTasks(),
        statistics: this.getTaskStatistics()
      }
    });
  }

  async openFileManager(): Promise<void> {
    this.emit('window:openRequested', {
      type: 'file-manager',
      title: 'File Manager',
      icon: '📁',
      data: {
        capabilities: getBrowserCapabilities()
      }
    });
  }

  // Advanced integrations for when actual SwissKnife modules are available
  async integrateWithFullSwissKnife(): Promise<void> {
    try {
      // These would import actual SwissKnife TypeScript modules through webpack
      // const { CoreSystem } = await import('../../src/core/system');
      // const { AIService } = await import('../../src/ai/service');
      // const { TaskManager } = await import('../../src/tasks/manager');
      // const { GraphOfThought } = await import('../../src/ai/thinking/graph');

      console.log('🚀 Ready to integrate with full SwissKnife TypeScript codebase');
      this.emit('fullIntegrationReady', {
        message: 'Browser bridge is ready for full TypeScript integration',
        adapters: ['ai', 'tasks', 'storage', 'commands'],
        nextSteps: [
          'Update webpack config to include main TypeScript modules',
          'Create browser-compatible entry points',
          'Implement progressive loading for large modules'
        ]
      });
    } catch (error) {
      console.warn('Full SwissKnife integration not yet available:', error);
    }
  }

  // Utility methods
  isInitialized(): boolean {
    return this.initialized;
  }

  getBrowserInfo() {
    return {
      capabilities: getBrowserCapabilities(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      platform: navigator.platform
    };
  }

  async exportData(): Promise<string> {
    const data = {
      config: this.config,
      tasks: await this.listTasks(),
      timestamp: Date.now(),
      version: '1.0.0'
    };
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.config) {
        this.updateConfig(data.config);
      }
      
      if (data.tasks) {
        // Import tasks
        data.tasks.forEach((taskData: any) => {
          this.createTask(taskData);
        });
      }
      
      this.emit('dataImported', { tasksCount: data.tasks?.length || 0 });
    } catch (error) {
      this.emit('importError', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const swissknifeBridge = new SwissKnifeBrowserBridge();

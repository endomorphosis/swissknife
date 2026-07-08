/**
 * SwissKnife Browser Integration Bridge
 * Connects the windowed interface to TypeScript functionality
 */

import { SwissKnifeAIAdapter, AIResponse, ChatMessage } from './adapters/ai-adapter';
import { SwissKnifeTaskAdapter, Task, TaskGraph } from './adapters/task-adapter';
import { BrowserEventEmitter, BrowserStorage, generateId, getBrowserCapabilities } from './utils/browser-utils';

export interface SwissKnifeConfig {
  aiProvider?: string;
  apiKeys?: Record<string, string>;
  enableTasks?: boolean;
  enableStorage?: boolean;
  debugMode?: boolean;
}

export class SwissKnifeBrowserBridge extends BrowserEventEmitter {
  private ai: SwissKnifeAIAdapter;
  private tasks: SwissKnifeTaskAdapter;
  private config: SwissKnifeConfig;
  private initialized = false;

  constructor(config: SwissKnifeConfig = {}) {
    super();
    
    this.config = {
      aiProvider: 'openai',
      enableTasks: true,
      enableStorage: true,
      debugMode: false,
      ...config
    };

    this.ai = new SwissKnifeAIAdapter();
    this.tasks = new SwissKnifeTaskAdapter();
    
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load saved configuration
      const savedConfig = BrowserStorage.get('swissknife-config');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }

      // Set up AI provider
      if (this.config.aiProvider) {
        this.ai.setCurrentProvider(this.config.aiProvider);
      }

      // Set API keys
      if (this.config.apiKeys) {
        Object.entries(this.config.apiKeys).forEach(([provider, key]) => {
          this.ai.setApiKey(provider, key);
        });
      }

      // Initialize adapters
      await this.ai.integrateWithSwissKnifeAI();
      await this.tasks.integrateWithSwissKnifeTasks();

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
    this.ai.on('requestStarted', (data) => this.emit('ai:requestStarted', data));
    this.ai.on('requestCompleted', (data) => this.emit('ai:requestCompleted', data));
    this.ai.on('requestError', (data) => this.emit('ai:requestError', data));

    // Task Events  
    this.tasks.on('taskCreated', (task) => this.emit('task:created', task));
    this.tasks.on('taskUpdated', (task) => this.emit('task:updated', task));
    this.tasks.on('taskStarted', (task) => this.emit('task:started', task));
    this.tasks.on('taskCompleted', (data) => this.emit('task:completed', data));
    this.tasks.on('taskFailed', (data) => this.emit('task:failed', data));
  }

  // Configuration Management
  updateConfig(updates: Partial<SwissKnifeConfig>): void {
    this.config = { ...this.config, ...updates };
    BrowserStorage.set('swissknife-config', this.config);
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
    return this.ai.generateText(prompt, options);
  }

  async chatWithAI(messages: ChatMessage[], options: any = {}): Promise<AIResponse> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.ai.chat(messages, options);
  }

  setAIProvider(provider: string): void {
    this.ai.setCurrentProvider(provider);
    this.updateConfig({ aiProvider: provider });
  }

  setAIApiKey(provider: string, apiKey: string): void {
    this.ai.setApiKey(provider, apiKey);
    const apiKeys = { ...this.config.apiKeys, [provider]: apiKey };
    this.updateConfig({ apiKeys });
  }

  getAIProviders() {
    return this.ai.getProviders();
  }

  getCurrentAIProvider() {
    return this.ai.getCurrentProvider();
  }

  // Task Management Integration
  createTask(params: {
    title: string;
    description?: string;
    priority?: Task['priority'];
    dependencies?: string[];
    metadata?: Record<string, any>;
  }): Task {
    return this.tasks.createTask(params);
  }

  getTask(id: string): Task | undefined {
    return this.tasks.getTask(id);
  }

  updateTask(id: string, updates: Partial<Task>): Task | undefined {
    return this.tasks.updateTask(id, updates);
  }

  deleteTask(id: string): boolean {
    return this.tasks.deleteTask(id);
  }

  listTasks(filter?: { status?: Task['status']; priority?: Task['priority'] }): Task[] {
    return this.tasks.listTasks(filter);
  }

  async executeTask(id: string): Promise<any> {
    return this.tasks.executeTask(id);
  }

  createTaskGraph(name: string, tasks: Task[] = []): TaskGraph {
    return this.tasks.createTaskGraph(name, tasks);
  }

  async executeTaskGraph(graphId: string): Promise<any> {
    return this.tasks.executeTaskGraph(graphId);
  }

  getTaskStatistics() {
    return this.tasks.getTaskStatistics();
  }

  // Integration with windowed interface
  async openAIChat(): Promise<void> {
    this.emit('window:openRequested', {
      type: 'ai-chat',
      title: 'AI Chat',
      icon: '🤖',
      data: {
        providers: this.getAIProviders(),
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
        tasks: this.listTasks(),
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

  // Advanced integrations stay behind a host boundary. Browser code advertises
  // readiness for a remote or platform adapter instead of importing host modules.
  async integrateWithFullSwissKnife(): Promise<void> {
    try {
      console.log('🚀 Ready to integrate with full SwissKnife TypeScript codebase');
      this.emit('fullIntegrationReady', {
        message: 'Browser bridge is ready for full TypeScript integration',
        adapters: ['ai', 'tasks', 'storage', 'commands'],
        nextSteps: [
          'Connect to a host service over HTTP, IPC, or MCP',
          'Use src/platform/browser.ts for in-browser behavior',
          'Keep process and filesystem capabilities behind src/platform/host.ts'
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
      tasks: this.listTasks(),
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

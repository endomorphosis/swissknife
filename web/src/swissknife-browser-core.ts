/**
 * Browser-only SwissKnife core.
 *
 * This entrypoint intentionally imports only browser platform code. Host CLI,
 * process, filesystem, terminal UI, and command execution modules stay behind
 * src/platform/host.ts and src/entrypoints/*.
 */

import './adapters/browser-globals';
import {
  BrowserAIManager,
  BrowserCommandRuntime,
  BrowserConfigManager,
  BrowserStorageRuntime,
  BrowserTaskRuntime,
  browserPlatform,
  type BrowserCommandResult,
  type BrowserPlatform,
  type BrowserSwissKnifeConfig,
  type BrowserTask,
} from '../../src/platform/browser';

export interface SwissKnifeBrowserOptions {
  config?: Partial<BrowserSwissKnifeConfig> & {
    storage?: string;
    debug?: boolean;
    ai?: Partial<BrowserSwissKnifeConfig['ai']> & {
      provider?: string;
      apiKey?: string;
      autoRegisterModels?: boolean;
      autoRegisterTools?: boolean;
    };
  };
  storage?: {
    type?: 'localstorage' | 'indexeddb' | 'memory';
    dbName?: string;
  };
  ai?: {
    autoRegisterModels?: boolean;
    autoRegisterTools?: boolean;
  };
  web?: boolean;
}

export interface SwissKnifeServices {
  ai: BrowserAIManager;
  tasks: BrowserTaskRuntime;
  storage: BrowserStorageRuntime;
  commands: BrowserCommandRuntime;
  config: BrowserConfigManager;
  platform: BrowserPlatform;
}

export class SwissKnifeBrowserCore {
  private initialized = false;
  private readonly options: SwissKnifeBrowserOptions;
  private readonly platform = browserPlatform;

  constructor(options: SwissKnifeBrowserOptions = {}) {
    this.options = {
      config: {
        debug: false,
        ...options.config,
      },
      storage: {
        type: 'indexeddb',
        dbName: 'swissknife-web',
        ...options.storage,
      },
      ai: {
        autoRegisterModels: true,
        autoRegisterTools: true,
        ...options.ai,
      },
      web: true,
      ...options,
    };
  }

  async initialize(): Promise<{ success: boolean; services?: SwissKnifeServices; error?: string }> {
    try {
      if (this.initialized) {
        return { success: true, services: this.getServices()! };
      }

      const aiConfig = this.options.config?.ai;
      if (aiConfig?.provider) {
        this.platform.aiManager.registerProvider(aiConfig.provider, {
          name: aiConfig.provider,
          models: aiConfig.defaultModel ? [aiConfig.defaultModel] : ['browser-simulated'],
          enabled: true,
        });
      }

      if (aiConfig?.apiKey && aiConfig.provider) {
        this.platform.configManager.updateComponentConfig('ai', {
          apiKeys: {
            ...this.platform.configManager.getComponentConfig('ai').apiKeys,
            [aiConfig.provider]: aiConfig.apiKey,
          },
        });
      }

      this.initialized = true;
      await this.platform.eventBus.emit('browser-core:initialized', {
        storage: this.options.storage,
        web: this.options.web,
      });

      return { success: true, services: this.getServices()! };
    } catch (error) {
      console.error('Failed to initialize SwissKnife Browser Core:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown initialization error',
      };
    }
  }

  getServices(): SwissKnifeServices | null {
    if (!this.initialized) {
      console.warn('SwissKnife Browser Core not initialized. Call initialize() first.');
      return null;
    }

    return {
      ai: this.platform.aiManager,
      tasks: this.platform.tasks,
      storage: this.platform.storage,
      commands: this.platform.commands,
      config: this.platform.configManager,
      platform: this.platform,
    };
  }

  async executeCommand(commandString: string): Promise<BrowserCommandResult> {
    await this.ensureInitialized();
    return this.platform.commands.execute(commandString);
  }

  async generateAI(prompt: string, options: { modelName?: string; provider?: string } = {}): Promise<{ content: string; model: string; provider: string }> {
    await this.ensureInitialized();
    const result = await this.platform.aiManager.inference({
      prompt,
      model: options.modelName,
      provider: options.provider,
    });
    return {
      content: result.response,
      model: result.model,
      provider: result.provider,
    };
  }

  async generateAIResponse(prompt: string, modelName?: string): Promise<{ content: string; model: string; provider: string }> {
    return this.generateAI(prompt, { modelName });
  }

  getAvailableModels(): string[] {
    return this.platform.aiManager.getProviders().flatMap(provider => provider.models ?? []);
  }

  async createTask(taskOptions: { title: string; description?: string; priority?: BrowserTask['priority']; metadata?: Record<string, unknown> }): Promise<BrowserTask> {
    await this.ensureInitialized();
    return this.platform.tasks.createTask(taskOptions);
  }

  async store(key: string, data: unknown): Promise<void> {
    await this.ensureInitialized();
    await this.platform.storage.store(key, data);
  }

  async retrieve<T = unknown>(key: string): Promise<T | null> {
    await this.ensureInitialized();
    return this.platform.storage.retrieve<T>(key);
  }

  getConfig<T = unknown>(key: string): T | undefined {
    return this.platform.configManager.get<T>(key);
  }

  setConfig(key: string, value: unknown): void {
    this.platform.configManager.set(key, value);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getVersion(): string {
    return '0.0.53-browser';
  }

  async dispose(): Promise<void> {
    await this.platform.eventBus.emit('browser-core:disposed');
    this.initialized = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      const result = await this.initialize();
      if (!result.success) {
        throw new Error(result.error ?? 'SwissKnife Browser Core failed to initialize');
      }
    }
  }
}

export const swissknifeBrowser = new SwissKnifeBrowserCore();

if (typeof window !== 'undefined') {
  (window as any).SwissKnife = {
    Core: SwissKnifeBrowserCore,
    instance: swissknifeBrowser,
    initialize: (options?: SwissKnifeBrowserOptions) => {
      if (options) {
        return new SwissKnifeBrowserCore(options).initialize();
      }
      return swissknifeBrowser.initialize();
    },
    getServices: () => swissknifeBrowser.getServices(),
    executeCommand: (cmd: string) => swissknifeBrowser.executeCommand(cmd),
    generateAI: (prompt: string, options?: { modelName?: string; provider?: string }) => swissknifeBrowser.generateAI(prompt, options),
    createTask: (options: { title: string; description?: string; priority?: BrowserTask['priority'] }) => swissknifeBrowser.createTask(options),
    store: (key: string, data: unknown) => swissknifeBrowser.store(key, data),
    retrieve: (key: string) => swissknifeBrowser.retrieve(key),
    getConfig: (key: string) => swissknifeBrowser.getConfig(key),
    setConfig: (key: string, value: unknown) => swissknifeBrowser.setConfig(key, value),
  };
}

export default swissknifeBrowser;

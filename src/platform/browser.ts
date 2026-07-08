export type BrowserRuntimeKind = 'browser';

export interface BrowserAIProviderConfig {
  name: string;
  apiUrl?: string;
  models?: string[];
  enabled?: boolean;
  [key: string]: unknown;
}

export interface BrowserSwissKnifeConfig {
  ai: {
    providers: Record<string, BrowserAIProviderConfig>;
    defaultModel: string;
    apiKeys: Record<string, string>;
  };
  web: {
    theme: string;
    layout: string;
    port: number;
  };
  ipfs: {
    gateway: string;
    accelerate: boolean;
    nodes: string[];
  };
  cli: {
    verbose: boolean;
    outputFormat: string;
    autoComplete: boolean;
  };
  [key: string]: unknown;
}

export interface BrowserCommandResult {
  success: boolean;
  output: string;
  exitCode: number;
  error?: string;
  data?: unknown;
}

export interface BrowserTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

const DEFAULT_CONFIG: BrowserSwissKnifeConfig = {
  ai: {
    providers: {},
    defaultModel: 'gpt-4o-mini',
    apiKeys: {},
  },
  web: {
    theme: 'day',
    layout: 'desktop',
    port: 3001,
  },
  ipfs: {
    gateway: 'https://ipfs.io/ipfs/',
    accelerate: true,
    nodes: ['localhost:5001'],
  },
  cli: {
    verbose: false,
    outputFormat: 'text',
    autoComplete: true,
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeRecord<T extends Record<string, unknown>>(base: T, updates: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(updates)) {
    const current = result[key];
    if (
      value &&
      current &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      result[key] = mergeRecord(current as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function hasLocalStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined';
}

export class BrowserEventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  private debug = false;

  on<T = unknown>(eventName: string, handler: EventHandler<T>): () => void {
    const handlers = this.listeners.get(eventName) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.listeners.set(eventName, handlers);
    return () => this.off(eventName, handler as EventHandler);
  }

  off(eventName: string, handler: EventHandler): void {
    this.listeners.get(eventName)?.delete(handler);
  }

  async emit<T = unknown>(eventName: string, payload?: T): Promise<void> {
    if (this.debug) {
      console.debug(`[BrowserEventBus] ${eventName}`, payload);
    }

    const handlers = Array.from(this.listeners.get(eventName) ?? []);
    await Promise.all(handlers.map(handler => Promise.resolve(handler(payload))));
  }

  setDebugMode(enabled: boolean): void {
    this.debug = enabled;
  }

  getActiveEvents(): string[] {
    return Array.from(this.listeners.keys()).sort();
  }

  getListenerCount(eventName: string): number {
    return this.listeners.get(eventName)?.size ?? 0;
  }
}

export class BrowserConfigManager {
  private config: BrowserSwissKnifeConfig;

  constructor(initialConfig: Partial<BrowserSwissKnifeConfig> = {}) {
    this.config = mergeRecord(clone(DEFAULT_CONFIG), initialConfig as Partial<BrowserSwissKnifeConfig>);
    this.load();
  }

  getConfig(): BrowserSwissKnifeConfig {
    return clone(this.config);
  }

  get<T = unknown>(key: string, fallback?: T): T {
    const value = key.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[segment];
    }, this.config);

    return (value === undefined ? fallback : value) as T;
  }

  set(key: string, value: unknown): void {
    const segments = key.split('.');
    let current = this.config as unknown as Record<string, unknown>;

    for (const segment of segments.slice(0, -1)) {
      const next = current[segment];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = value;
    this.save();
  }

  getComponentConfig<K extends keyof BrowserSwissKnifeConfig>(component: K): BrowserSwissKnifeConfig[K] {
    return clone(this.config[component]);
  }

  updateComponentConfig<K extends keyof BrowserSwissKnifeConfig>(
    component: K,
    updates: Partial<BrowserSwissKnifeConfig[K]>,
  ): void {
    const current = this.config[component];
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      this.config[component] = mergeRecord(current as Record<string, unknown>, updates as Record<string, unknown>) as BrowserSwissKnifeConfig[K];
    } else {
      this.config[component] = updates as BrowserSwissKnifeConfig[K];
    }
    this.save();
  }

  resetConfig(): void {
    this.config = clone(DEFAULT_CONFIG);
    this.save();
  }

  private load(): void {
    if (!hasLocalStorage()) return;

    try {
      const saved = globalThis.localStorage.getItem('swissknife-browser-config');
      if (saved) {
        this.config = mergeRecord(this.config, JSON.parse(saved));
      }
    } catch (error) {
      console.warn('[BrowserConfigManager] Failed to load config:', error);
    }
  }

  private save(): void {
    if (!hasLocalStorage()) return;

    try {
      globalThis.localStorage.setItem('swissknife-browser-config', JSON.stringify(this.config));
    } catch (error) {
      console.warn('[BrowserConfigManager] Failed to save config:', error);
    }
  }
}

export class BrowserStorageRuntime {
  private memory = new Map<string, unknown>();

  async store(key: string, value: unknown): Promise<void> {
    this.memory.set(key, value);
    if (!hasLocalStorage()) return;

    try {
      globalThis.localStorage.setItem(`swissknife:${key}`, JSON.stringify(value));
    } catch {
      // Memory storage remains authoritative when browser quota or privacy mode blocks localStorage.
    }
  }

  async retrieve<T = unknown>(key: string): Promise<T | null> {
    if (this.memory.has(key)) return this.memory.get(key) as T;
    if (!hasLocalStorage()) return null;

    try {
      const saved = globalThis.localStorage.getItem(`swissknife:${key}`);
      return saved ? JSON.parse(saved) as T : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    if (hasLocalStorage()) {
      globalThis.localStorage.removeItem(`swissknife:${key}`);
    }
  }

  async list(prefix = ''): Promise<string[]> {
    const keys = new Set(Array.from(this.memory.keys()));

    if (hasLocalStorage()) {
      for (let index = 0; index < globalThis.localStorage.length; index += 1) {
        const key = globalThis.localStorage.key(index);
        if (key?.startsWith('swissknife:')) {
          keys.add(key.slice('swissknife:'.length));
        }
      }
    }

    return Array.from(keys).filter(key => key.startsWith(prefix)).sort();
  }
}

export class BrowserAIManager {
  private providers = new Map<string, BrowserAIProviderConfig>();

  registerProvider(id: string, provider: BrowserAIProviderConfig): void {
    this.providers.set(id, { ...provider, name: provider.name || id });
  }

  getProviders(): BrowserAIProviderConfig[] {
    return Array.from(this.providers.values()).map(provider => ({ ...provider }));
  }

  getDefaultProvider(): BrowserAIProviderConfig | null {
    return this.getProviders().find(provider => provider.enabled !== false) ?? null;
  }

  async getAllModels(): Promise<Array<{ id: string; name: string; provider: string; available: boolean; local: boolean }>> {
    return Array.from(this.providers.entries()).flatMap(([providerId, provider]) => (
      provider.models ?? []
    ).map(model => ({
      id: `${providerId}:${model}`,
      name: model,
      provider: providerId,
      available: provider.enabled !== false,
      local: providerId === 'ollama' || providerId === 'local',
    })));
  }

  async inference(request: { prompt: string; model?: string; provider?: string }): Promise<{ response: string; model: string; provider: string }> {
    const provider = request.provider ?? this.getDefaultProvider()?.name ?? 'browser';
    const model = request.model ?? 'browser-simulated';
    return {
      response: `Browser runtime response for: ${request.prompt}`,
      model,
      provider,
    };
  }
}

export class BrowserTaskRuntime {
  private tasks = new Map<string, BrowserTask>();

  constructor(private readonly storage: BrowserStorageRuntime, private readonly events: BrowserEventBus) {}

  async createTask(options: Partial<BrowserTask> & { title: string }): Promise<BrowserTask> {
    const now = new Date().toISOString();
    const task: BrowserTask = {
      id: options.id ?? makeId('task'),
      title: options.title,
      description: options.description ?? '',
      status: options.status ?? 'pending',
      priority: options.priority ?? 'medium',
      createdAt: options.createdAt ?? now,
      updatedAt: now,
      metadata: options.metadata ?? {},
    };

    this.tasks.set(task.id, task);
    await this.persist();
    await this.events.emit('task:created', task);
    return task;
  }

  async listTasks(): Promise<BrowserTask[]> {
    await this.load();
    return Array.from(this.tasks.values()).map(task => ({ ...task, metadata: { ...task.metadata } }));
  }

  async updateTask(id: string, updates: Partial<BrowserTask>): Promise<BrowserTask | null> {
    await this.load();
    const existing = this.tasks.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    this.tasks.set(id, updated);
    await this.persist();
    await this.events.emit('task:updated', updated);
    return updated;
  }

  private async load(): Promise<void> {
    if (this.tasks.size > 0) return;
    const saved = await this.storage.retrieve<BrowserTask[]>('tasks');
    for (const task of saved ?? []) {
      this.tasks.set(task.id, task);
    }
  }

  private async persist(): Promise<void> {
    await this.storage.store('tasks', Array.from(this.tasks.values()));
  }
}

export class BrowserCommandRuntime {
  constructor(private readonly tasks: BrowserTaskRuntime, private readonly config: BrowserConfigManager) {}

  async execute(commandLine: string): Promise<BrowserCommandResult> {
    const [command, ...args] = commandLine.trim().split(/\s+/);

    switch (command) {
      case '':
        return { success: true, output: '', exitCode: 0 };
      case 'help':
      case 'sk':
        return {
          success: true,
          output: 'Browser commands: help, status, config, task-list, task-create, echo',
          exitCode: 0,
        };
      case 'status':
      case 'sk-status':
        return {
          success: true,
          output: 'SwissKnife browser runtime is active. Host CLI commands are available only through host entrypoints.',
          exitCode: 0,
        };
      case 'echo':
        return { success: true, output: args.join(' '), exitCode: 0 };
      case 'config':
      case 'sk-config':
        return {
          success: true,
          output: JSON.stringify(this.config.getConfig(), null, 2),
          exitCode: 0,
        };
      case 'task-list':
      case 'sk-tasks': {
        const tasks = await this.tasks.listTasks();
        return {
          success: true,
          output: tasks.length ? tasks.map(task => `${task.id}\t${task.status}\t${task.title}`).join('\n') : 'No browser tasks found.',
          exitCode: 0,
          data: tasks,
        };
      }
      case 'task-create':
      case 'sk-task': {
        const title = args.join(' ').trim();
        if (!title) {
          return { success: false, output: 'Usage: task-create <title>', exitCode: 1 };
        }
        const task = await this.tasks.createTask({ title });
        return { success: true, output: `Created ${task.id}: ${task.title}`, exitCode: 0, data: task };
      }
      default:
        return {
          success: false,
          output: `Command "${command}" is not available in the browser runtime.`,
          exitCode: 127,
        };
    }
  }
}

export interface BrowserPlatform {
  runtime: BrowserRuntimeKind;
  eventBus: BrowserEventBus;
  configManager: BrowserConfigManager;
  aiManager: BrowserAIManager;
  storage: BrowserStorageRuntime;
  tasks: BrowserTaskRuntime;
  commands: BrowserCommandRuntime;
  events: {
    cli: {
      executeCommand: (command: string, args?: string[], cwd?: string) => Promise<BrowserCommandResult>;
      onCommandResponse: (handler: EventHandler<BrowserCommandResult>) => () => void;
    };
    web: {
      launchApp: (appId: string, params?: Record<string, unknown>) => Promise<void>;
      closeApp: (appId: string) => Promise<void>;
    };
    ipfs: {
      uploadFile: (file: File, callback: (cid: string) => void) => Promise<void>;
    };
  };
}

export function createBrowserPlatform(config: Partial<BrowserSwissKnifeConfig> = {}): BrowserPlatform {
  const eventBus = new BrowserEventBus();
  const configManager = new BrowserConfigManager(config);
  const aiManager = new BrowserAIManager();
  const storage = new BrowserStorageRuntime();
  const tasks = new BrowserTaskRuntime(storage, eventBus);
  const commands = new BrowserCommandRuntime(tasks, configManager);

  return {
    runtime: 'browser',
    eventBus,
    configManager,
    aiManager,
    storage,
    tasks,
    commands,
    events: {
      cli: {
        executeCommand: async (command, args = [], cwd = '/') => {
          const result = await commands.execute([command, ...args].join(' '));
          await eventBus.emit('cli:command-response', { ...result, cwd });
          return result;
        },
        onCommandResponse: handler => eventBus.on('cli:command-response', handler),
      },
      web: {
        launchApp: async (appId, params = {}) => {
          await eventBus.emit('web:launch-app', { appId, params });
        },
        closeApp: async appId => {
          await eventBus.emit('web:close-app', { appId });
        },
      },
      ipfs: {
        uploadFile: async (file, callback) => {
          const cid = `browser-${makeId(file.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase())}`;
          callback(cid);
          await eventBus.emit('ipfs:file-uploaded', { cid, name: file.name, size: file.size });
        },
      },
    },
  };
}

export const browserPlatform = createBrowserPlatform();
export const eventBus = browserPlatform.eventBus;
export const configManager = browserPlatform.configManager;
export const aiManager = browserPlatform.aiManager;
export const events = browserPlatform.events;

export function initializeDefaultProviders(providers: Record<string, BrowserAIProviderConfig>): void {
  for (const [id, provider] of Object.entries(providers)) {
    aiManager.registerProvider(id, provider);
  }

  configManager.updateComponentConfig('ai', {
    providers: {
      ...configManager.getComponentConfig('ai').providers,
      ...providers,
    },
  });
}

export function getBrowserPlatform(): BrowserPlatform {
  return browserPlatform;
}

import {
  BrowserModelProvider,
  BrowserModelRegistry,
  createBrowserModelRegistry,
  standardBrowserModelProviders,
  type BrowserChatMessage,
  type BrowserFetchClient,
  type BrowserModelDefinition,
  type BrowserModelGenerateRequest,
  type BrowserModelGenerateResult,
  type BrowserModelProviderAdapter,
  type BrowserModelProviderAdapterOptions,
  type BrowserModelProviderDefinition,
  type BrowserModelRuntimeReport,
} from '../models/browser.js';

export type BrowserAIRuntime = 'browser';

export interface BrowserAIServiceOptions {
  registry?: BrowserModelRegistry;
  providers?: BrowserModelProviderDefinition[];
  adapters?: BrowserModelProviderAdapter[];
  defaultProviderId?: string;
  fetch?: BrowserFetchClient;
  apiKeys?: Record<string, string>;
  headers?: Record<string, Record<string, string>>;
}

export interface BrowserAIGenerateTextRequest extends BrowserModelGenerateRequest {
  providerId?: string;
}

export interface BrowserAIProviderStatus {
  id: string;
  name: string;
  models: BrowserModelDefinition[];
  adapterRegistered: boolean;
}

export interface BrowserAIRuntimeReport extends BrowserModelRuntimeReport {
  adapters: string[];
}

export class BrowserAIService {
  readonly runtime: BrowserAIRuntime = 'browser';
  private readonly registry: BrowserModelRegistry;
  private readonly fetchClient?: BrowserFetchClient;
  private readonly apiKeys: Record<string, string>;
  private readonly headers: Record<string, Record<string, string>>;
  private readonly adapters = new Map<string, BrowserModelProviderAdapter>();
  private defaultProviderId?: string;

  constructor(options: BrowserAIServiceOptions = {}) {
    this.registry = options.registry ?? createBrowserModelRegistry(options.providers ?? standardBrowserModelProviders);
    this.fetchClient = options.fetch;
    this.apiKeys = { ...(options.apiKeys ?? {}) };
    this.headers = { ...(options.headers ?? {}) };

    for (const adapter of options.adapters ?? []) {
      this.registerProviderAdapter(adapter);
    }

    this.defaultProviderId = options.defaultProviderId
      ?? this.registry.getDefaultProvider()?.id
      ?? options.adapters?.[0]?.id;
  }

  registerProviderDefinition(provider: BrowserModelProviderDefinition): void {
    this.registry.registerProvider(provider);
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.id;
    }
  }

  registerProviderAdapter(adapter: BrowserModelProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.registry.registerProvider(adapter.definition);
    if (!this.defaultProviderId) {
      this.defaultProviderId = adapter.id;
    }
  }

  configureApiKey(providerId: string, apiKey: string): void {
    this.apiKeys[providerId] = apiKey;
  }

  setDefaultProvider(providerId: string): void {
    if (!this.registry.getProvider(providerId) && !this.adapters.has(providerId)) {
      throw new Error(`Unknown browser AI provider: ${providerId}`);
    }
    this.defaultProviderId = providerId;
    if (this.registry.getProvider(providerId)) {
      this.registry.setDefaultProvider(providerId);
    }
  }

  getProvider(providerId: string): BrowserAIProviderStatus | undefined {
    const provider = this.registry.getProvider(providerId) ?? this.adapters.get(providerId)?.definition;
    if (!provider) return undefined;
    return {
      id: provider.id,
      name: provider.name,
      models: provider.models,
      adapterRegistered: this.adapters.has(provider.id),
    };
  }

  listProviders(): BrowserAIProviderStatus[] {
    return this.registry.listProviders().map(provider => ({
      id: provider.id,
      name: provider.name,
      models: provider.models,
      adapterRegistered: this.adapters.has(provider.id),
    }));
  }

  listModels(providerId?: string): BrowserModelDefinition[] {
    return this.registry.listModels(providerId);
  }

  async generateText(request: BrowserAIGenerateTextRequest): Promise<BrowserModelGenerateResult> {
    const providerId = request.providerId ?? this.defaultProviderId;
    if (!providerId) {
      throw new Error('No browser AI provider has been configured.');
    }

    const adapter = this.getOrCreateAdapter(providerId);
    return adapter.generateText({
      ...request,
      apiKey: request.apiKey ?? this.apiKeys[providerId],
      headers: {
        ...(this.headers[providerId] ?? {}),
        ...(request.headers ?? {}),
      },
    });
  }

  async chat(
    messages: BrowserChatMessage[],
    request: Omit<BrowserAIGenerateTextRequest, 'messages' | 'prompt'> = {},
  ): Promise<BrowserModelGenerateResult> {
    return this.generateText({
      ...request,
      messages,
    });
  }

  getRuntimeReport(): BrowserAIRuntimeReport {
    return {
      ...this.registry.getRuntimeReport(),
      adapters: Array.from(this.adapters.keys()).sort(),
    };
  }

  private getOrCreateAdapter(providerId: string): BrowserModelProviderAdapter {
    const existing = this.adapters.get(providerId);
    if (existing) return existing;

    const options: BrowserModelProviderAdapterOptions = {
      fetch: this.fetchClient,
      apiKey: this.apiKeys[providerId],
      headers: this.headers[providerId],
    };
    const adapter = this.registry.createProviderAdapter(providerId, options);
    this.adapters.set(providerId, adapter);
    return adapter;
  }
}

export class BrowserAIAgent {
  private readonly service: BrowserAIService;
  private readonly messages: BrowserChatMessage[] = [];

  constructor(service: BrowserAIService, systemPrompt?: string) {
    this.service = service;
    if (systemPrompt) {
      this.messages.push({ role: 'system', content: systemPrompt });
    }
  }

  getHistory(): BrowserChatMessage[] {
    return this.messages.map(message => ({ ...message }));
  }

  clearHistory(systemPrompt?: string): void {
    this.messages.length = 0;
    if (systemPrompt) {
      this.messages.push({ role: 'system', content: systemPrompt });
    }
  }

  async send(
    content: string,
    request: Omit<BrowserAIGenerateTextRequest, 'messages' | 'prompt'> = {},
  ): Promise<BrowserModelGenerateResult> {
    this.messages.push({ role: 'user', content });
    const result = await this.service.chat(this.messages, request);
    this.messages.push({ role: 'assistant', content: result.text });
    return result;
  }
}

export function createBrowserAIService(options: BrowserAIServiceOptions = {}): BrowserAIService {
  return new BrowserAIService(options);
}

export function createBrowserAIAgent(
  service: BrowserAIService = createBrowserAIService(),
  systemPrompt?: string,
): BrowserAIAgent {
  return new BrowserAIAgent(service, systemPrompt);
}

export {
  BrowserModelProvider,
  BrowserModelRegistry,
  createBrowserModelRegistry,
  standardBrowserModelProviders,
};

export type {
  BrowserChatMessage,
  BrowserFetchClient,
  BrowserModelDefinition,
  BrowserModelGenerateRequest,
  BrowserModelGenerateResult,
  BrowserModelProviderAdapter,
  BrowserModelProviderDefinition,
  BrowserModelRuntimeReport,
};

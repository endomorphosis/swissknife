export type BrowserModelRuntime = 'browser';

export type BrowserModelProviderKind =
  | 'openai-compatible'
  | 'anthropic-messages'
  | 'google-generative-language'
  | 'custom-fetch';

export type BrowserModelCapability =
  | 'text-generation'
  | 'text-embedding'
  | 'code-generation'
  | 'image-generation'
  | 'image-analysis'
  | 'streaming'
  | 'tool-calling'
  | 'structured-output';

export type HostOnlyModelCapability =
  | 'node-sdk'
  | 'bedrock-host-credentials'
  | 'vertex-host-credentials'
  | 'local-model-files'
  | 'subprocess-inference'
  | 'binary-addon-loader';

export type BrowserFetchClient = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BrowserModelDefinition {
  id: string;
  name: string;
  providerId: string;
  maxTokens?: number;
  contextSize?: number;
  capabilities: BrowserModelCapability[];
  source: 'remote-api' | 'user-injected';
}

export interface BrowserModelProviderDefinition {
  id: string;
  name: string;
  kind: BrowserModelProviderKind;
  baseURL?: string;
  defaultModel: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  models: BrowserModelDefinition[];
  hostOnlyCapabilities?: HostOnlyModelCapability[];
}

export interface BrowserChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BrowserModelRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  responseFormat?: Record<string, unknown>;
  tools?: unknown[];
  toolChoice?: unknown;
}

export interface BrowserModelGenerateRequest extends BrowserModelRequestOptions {
  model?: string;
  prompt?: string;
  messages?: BrowserChatMessage[];
  apiKey?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface BrowserModelGenerateResult {
  providerId: string;
  model: string;
  text: string;
  raw?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface BrowserModelProviderAdapter {
  readonly runtime: BrowserModelRuntime;
  readonly definition: BrowserModelProviderDefinition;
  readonly id: string;
  listModels(): BrowserModelDefinition[];
  getModel(modelId: string): BrowserModelDefinition | undefined;
  generateText(request: BrowserModelGenerateRequest): Promise<BrowserModelGenerateResult>;
}

export interface BrowserModelProviderAdapterOptions {
  fetch?: BrowserFetchClient;
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  request?: (
    provider: BrowserModelProviderDefinition,
    request: BrowserModelGenerateRequest,
    fetchClient: BrowserFetchClient,
  ) => Promise<BrowserModelGenerateResult>;
}

export interface BrowserModelCapabilityGap {
  capability: HostOnlyModelCapability;
  providerId?: string;
  reason: string;
}

export interface BrowserModelRuntimeReport {
  runtime: BrowserModelRuntime;
  browserSafe: true;
  providers: Array<{
    id: string;
    name: string;
    kind: BrowserModelProviderKind;
    models: number;
    hostOnlyCapabilities: HostOnlyModelCapability[];
  }>;
  gaps: BrowserModelCapabilityGap[];
}

const COMMON_TEXT_CAPABILITIES: BrowserModelCapability[] = [
  'text-generation',
  'code-generation',
  'streaming',
];

const DEFAULT_HOST_ONLY_GAPS: BrowserModelCapabilityGap[] = [
  {
    capability: 'node-sdk',
    reason: 'Node provider SDKs are available only through host model entrypoints.',
  },
  {
    capability: 'bedrock-host-credentials',
    reason: 'AWS Bedrock credential resolution requires host credentials and must not run in browser bundles.',
  },
  {
    capability: 'vertex-host-credentials',
    reason: 'Google Vertex host credential resolution requires server-side credentials.',
  },
  {
    capability: 'local-model-files',
    reason: 'Local model files require host filesystem access.',
  },
  {
    capability: 'subprocess-inference',
    reason: 'Subprocess inference requires a host process runtime.',
  },
  {
    capability: 'binary-addon-loader',
    reason: 'Binary addon loading belongs to host model entrypoints.',
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getFetchClient(fetchClient?: BrowserFetchClient): BrowserFetchClient {
  const selected = fetchClient ?? globalThis.fetch;
  if (typeof selected !== 'function') {
    throw new Error('Browser model adapters require a fetch-compatible client.');
  }
  return (input, init) => selected(input, init);
}

function requestMessages(request: BrowserModelGenerateRequest): BrowserChatMessage[] {
  if (request.messages?.length) return request.messages;
  if (request.prompt) return [{ role: 'user', content: request.prompt }];
  throw new Error('Browser model generation requires either messages or prompt.');
}

function authHeaders(
  definition: BrowserModelProviderDefinition,
  apiKey?: string,
): Record<string, string> {
  if (!apiKey) return {};
  const header = definition.apiKeyHeader ?? 'Authorization';
  const prefix = definition.apiKeyPrefix ?? 'Bearer ';
  return {
    [header]: header.toLowerCase() === 'authorization' ? `${prefix}${apiKey}` : apiKey,
  };
}

function mergeHeaders(
  definition: BrowserModelProviderDefinition,
  options: BrowserModelProviderAdapterOptions,
  request: BrowserModelGenerateRequest,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...authHeaders(definition, request.apiKey ?? options.apiKey),
    ...(options.headers ?? {}),
    ...(request.headers ?? {}),
  };
}

function modelId(definition: BrowserModelProviderDefinition, request: BrowserModelGenerateRequest): string {
  return request.model ?? definition.defaultModel;
}

function usageFromOpenAI(data: any): BrowserModelGenerateResult['usage'] {
  if (!data?.usage) return undefined;
  return {
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
  };
}

async function assertOk(response: Response, providerId: string): Promise<void> {
  if (response.ok) return;
  const body = await response.text();
  throw new Error(`${providerId} browser provider request failed: ${response.status} ${body}`);
}

async function callOpenAICompatible(
  definition: BrowserModelProviderDefinition,
  request: BrowserModelGenerateRequest,
  fetchClient: BrowserFetchClient,
  options: BrowserModelProviderAdapterOptions,
): Promise<BrowserModelGenerateResult> {
  const baseURL = trimTrailingSlash(options.baseURL ?? definition.baseURL ?? '');
  if (!baseURL) throw new Error(`${definition.id} browser provider requires a baseURL.`);

  const selectedModel = modelId(definition, request);
  const body: Record<string, unknown> = {
    model: selectedModel,
    messages: requestMessages(request),
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    top_p: request.topP,
    stop: request.stop,
    stream: request.stream,
    response_format: request.responseFormat,
    tools: request.tools,
    tool_choice: request.toolChoice,
  };

  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }

  const response = await fetchClient(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: mergeHeaders(definition, options, request),
    body: JSON.stringify(body),
    signal: request.signal,
  });
  await assertOk(response, definition.id);

  const data = await response.json() as any;
  return {
    providerId: definition.id,
    model: selectedModel,
    text: data.choices?.[0]?.message?.content ?? '',
    raw: data,
    usage: usageFromOpenAI(data),
  };
}

async function callAnthropicMessages(
  definition: BrowserModelProviderDefinition,
  request: BrowserModelGenerateRequest,
  fetchClient: BrowserFetchClient,
  options: BrowserModelProviderAdapterOptions,
): Promise<BrowserModelGenerateResult> {
  const baseURL = trimTrailingSlash(options.baseURL ?? definition.baseURL ?? '');
  if (!baseURL) throw new Error(`${definition.id} browser provider requires a baseURL.`);

  const selectedModel = modelId(definition, request);
  const messages = requestMessages(request);
  const system = messages.find(message => message.role === 'system')?.content;
  const body: Record<string, unknown> = {
    model: selectedModel,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature,
    top_p: request.topP,
    stop_sequences: request.stop,
    system,
    messages: messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })),
  };

  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }

  const response = await fetchClient(`${baseURL}/messages`, {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      ...mergeHeaders(definition, options, request),
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  await assertOk(response, definition.id);

  const data = await response.json() as any;
  const text = Array.isArray(data.content)
    ? data.content
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part.text ?? '')
      .join('')
    : '';

  return {
    providerId: definition.id,
    model: selectedModel,
    text,
    raw: data,
    usage: data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
    } : undefined,
  };
}

async function callGoogleGenerativeLanguage(
  definition: BrowserModelProviderDefinition,
  request: BrowserModelGenerateRequest,
  fetchClient: BrowserFetchClient,
  options: BrowserModelProviderAdapterOptions,
): Promise<BrowserModelGenerateResult> {
  const baseURL = trimTrailingSlash(options.baseURL ?? definition.baseURL ?? '');
  if (!baseURL) throw new Error(`${definition.id} browser provider requires a baseURL.`);

  const selectedModel = modelId(definition, request);
  const url = new URL(`${baseURL}/models/${encodeURIComponent(selectedModel)}:generateContent`);
  const apiKey = request.apiKey ?? options.apiKey;
  if (apiKey) url.searchParams.set('key', apiKey);

  const body = {
    contents: requestMessages(request)
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    generationConfig: {
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
      topP: request.topP,
      stopSequences: request.stop,
    },
    systemInstruction: request.messages?.find(message => message.role === 'system')
      ? { parts: [{ text: request.messages.find(message => message.role === 'system')?.content }] }
      : undefined,
  };

  const response = await fetchClient(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      ...(request.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  await assertOk(response, definition.id);

  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text ?? '')
    .join('') ?? '';

  return {
    providerId: definition.id,
    model: selectedModel,
    text,
    raw: data,
    usage: data.usageMetadata ? {
      promptTokens: data.usageMetadata.promptTokenCount,
      completionTokens: data.usageMetadata.candidatesTokenCount,
      totalTokens: data.usageMetadata.totalTokenCount,
    } : undefined,
  };
}

export const browserModelCapabilityGaps: BrowserModelCapabilityGap[] = clone(DEFAULT_HOST_ONLY_GAPS);

export const standardBrowserModelProviders: BrowserModelProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        providerId: 'openai',
        maxTokens: 128000,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'image-analysis', 'tool-calling', 'structured-output'],
        source: 'remote-api',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
        providerId: 'openai',
        maxTokens: 128000,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'image-analysis', 'tool-calling', 'structured-output'],
        source: 'remote-api',
      },
    ],
    hostOnlyCapabilities: ['node-sdk'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic-messages',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    apiKeyHeader: 'x-api-key',
    apiKeyPrefix: '',
    models: [
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        maxTokens: 200000,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'image-analysis', 'tool-calling'],
        source: 'remote-api',
      },
      {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku',
        providerId: 'anthropic',
        maxTokens: 200000,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'image-analysis', 'tool-calling'],
        source: 'remote-api',
      },
    ],
    hostOnlyCapabilities: ['node-sdk', 'bedrock-host-credentials', 'vertex-host-credentials'],
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    kind: 'google-generative-language',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        providerId: 'google',
        maxTokens: 1048576,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'image-analysis', 'structured-output'],
        source: 'remote-api',
      },
      {
        id: 'gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash Lite',
        providerId: 'google',
        maxTokens: 1048576,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'image-analysis', 'structured-output'],
        source: 'remote-api',
      },
    ],
    hostOnlyCapabilities: ['vertex-host-credentials'],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'openai-compatible',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    models: [
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large',
        providerId: 'mistral',
        maxTokens: 128000,
        capabilities: [...COMMON_TEXT_CAPABILITIES, 'tool-calling', 'structured-output'],
        source: 'remote-api',
      },
      {
        id: 'mistral-small-latest',
        name: 'Mistral Small',
        providerId: 'mistral',
        maxTokens: 32000,
        capabilities: COMMON_TEXT_CAPABILITIES,
        source: 'remote-api',
      },
    ],
    hostOnlyCapabilities: ['node-sdk'],
  },
];

export class BrowserModelProvider implements BrowserModelProviderAdapter {
  readonly runtime = 'browser';
  readonly id: string;
  readonly definition: BrowserModelProviderDefinition;
  private readonly fetchClient: BrowserFetchClient;
  private readonly options: BrowserModelProviderAdapterOptions;

  constructor(
    definition: BrowserModelProviderDefinition,
    options: BrowserModelProviderAdapterOptions = {},
  ) {
    this.definition = clone(definition);
    this.id = definition.id;
    this.fetchClient = getFetchClient(options.fetch);
    this.options = options;
  }

  listModels(): BrowserModelDefinition[] {
    return clone(this.definition.models);
  }

  getModel(modelId: string): BrowserModelDefinition | undefined {
    return this.definition.models.find(model => model.id === modelId);
  }

  async generateText(request: BrowserModelGenerateRequest): Promise<BrowserModelGenerateResult> {
    if (this.options.request) {
      return this.options.request(this.definition, request, this.fetchClient);
    }

    switch (this.definition.kind) {
      case 'openai-compatible':
        return callOpenAICompatible(this.definition, request, this.fetchClient, this.options);
      case 'anthropic-messages':
        return callAnthropicMessages(this.definition, request, this.fetchClient, this.options);
      case 'google-generative-language':
        return callGoogleGenerativeLanguage(this.definition, request, this.fetchClient, this.options);
      case 'custom-fetch':
        throw new Error(`Provider ${this.definition.id} requires an injected request implementation.`);
      default:
        throw new Error(`Unsupported browser provider kind: ${this.definition.kind}`);
    }
  }
}

export class BrowserModelRegistry {
  private providers = new Map<string, BrowserModelProviderDefinition>();
  private defaultProviderId?: string;

  constructor(providers: BrowserModelProviderDefinition[] = standardBrowserModelProviders) {
    for (const provider of providers) {
      this.registerProvider(provider);
    }
  }

  registerProvider(provider: BrowserModelProviderDefinition): void {
    this.providers.set(provider.id, clone(provider));
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.id;
    }
  }

  unregisterProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (this.defaultProviderId === providerId) {
      this.defaultProviderId = this.listProviders()[0]?.id;
    }
    return removed;
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Unknown browser model provider: ${providerId}`);
    }
    this.defaultProviderId = providerId;
  }

  getDefaultProvider(): BrowserModelProviderDefinition | undefined {
    return this.defaultProviderId ? this.getProvider(this.defaultProviderId) : undefined;
  }

  getProvider(providerId: string): BrowserModelProviderDefinition | undefined {
    const provider = this.providers.get(providerId);
    return provider ? clone(provider) : undefined;
  }

  listProviders(): BrowserModelProviderDefinition[] {
    return Array.from(this.providers.values()).map(provider => clone(provider));
  }

  listModels(providerId?: string): BrowserModelDefinition[] {
    if (providerId) {
      return this.getProvider(providerId)?.models ?? [];
    }
    return this.listProviders().flatMap(provider => provider.models);
  }

  getModel(modelId: string, providerId?: string): BrowserModelDefinition | undefined {
    return this.listModels(providerId).find(model => model.id === modelId);
  }

  createProviderAdapter(
    providerId: string,
    options: BrowserModelProviderAdapterOptions = {},
  ): BrowserModelProvider {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Unknown browser model provider: ${providerId}`);
    return new BrowserModelProvider(provider, options);
  }

  getRuntimeReport(): BrowserModelRuntimeReport {
    const providers = this.listProviders();
    return {
      runtime: 'browser',
      browserSafe: true,
      providers: providers.map(provider => ({
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        models: provider.models.length,
        hostOnlyCapabilities: provider.hostOnlyCapabilities ?? [],
      })),
      gaps: [
        ...browserModelCapabilityGaps,
        ...providers.flatMap(provider => (provider.hostOnlyCapabilities ?? []).map(capability => ({
          capability,
          providerId: provider.id,
          reason: `${provider.name} ${capability} support is available only through host model entrypoints.`,
        }))),
      ],
    };
  }
}

export function createBrowserModelRegistry(
  providers: BrowserModelProviderDefinition[] = standardBrowserModelProviders,
): BrowserModelRegistry {
  return new BrowserModelRegistry(providers);
}

export function createBrowserModelProvider(
  definition: BrowserModelProviderDefinition,
  options: BrowserModelProviderAdapterOptions = {},
): BrowserModelProvider {
  return new BrowserModelProvider(definition, options);
}

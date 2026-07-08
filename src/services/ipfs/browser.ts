<<<<<<< HEAD
export * from './ipfs-idl-descriptors.js';
export * from './ipfs-interface-registry.js';
export * from './ipfs-orb-profiles.js';
export * from './ipfs-proof-cache.js';
export * from './ipfs-ui-profiles.js';
export * from './ipld-logic-storage.js';
=======
import {
  buildBrowserLibp2pConfig,
  createBrowserLibp2pNode,
  summarizeBrowserLibp2pGaps,
  type BrowserLibp2pRuntimeOptions,
  type BrowserLibp2pRuntimeReport,
} from '../mcp/libp2p-browser-runtime.js';

export type BrowserIPFSCapabilityName =
  | 'gateway-read'
  | 'http-api-read'
  | 'http-api-write'
  | 'http-api-pin'
  | 'libp2p-runtime'
  | 'libp2p-content-routing'
  | 'libp2p-pubsub'
  | 'daemon'
  | 'filesystem'
  | 'python'
  | 'native-ipfs';

export type BrowserIPFSAdapterKind = 'gateway' | 'http-api' | 'libp2p' | 'host-only';

export interface BrowserIPFSCapabilityStatus {
  name: BrowserIPFSCapabilityName;
  adapter: BrowserIPFSAdapterKind;
  supported: boolean;
  enabled: boolean;
  endpoint?: string;
  reason?: string;
}

export interface BrowserIPFSCapabilityGap {
  name: BrowserIPFSCapabilityName;
  adapter: BrowserIPFSAdapterKind;
  reason: string;
}

export interface BrowserIPFSRuntimeReport {
  runtime: 'browser';
  browserSafe: true;
  capabilities: BrowserIPFSCapabilityStatus[];
  gaps: BrowserIPFSCapabilityGap[];
  hostOnly: BrowserIPFSCapabilityStatus[];
  libp2p?: BrowserLibp2pRuntimeReport;
}

export interface BrowserIPFSGatewayOptions {
  enabled?: boolean;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface BrowserIPFSHttpApiOptions {
  enabled?: boolean;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface BrowserIPFSTransportOptions {
  gateway?: BrowserIPFSGatewayOptions;
  httpApi?: BrowserIPFSHttpApiOptions;
  libp2p?: BrowserLibp2pRuntimeOptions & {
    enabled?: boolean;
    contentRouting?: boolean;
    pubsub?: boolean;
  };
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

export interface BrowserIPFSAddOptions {
  filename?: string;
  pin?: boolean;
  wrapWithDirectory?: boolean;
  cidVersion?: 0 | 1;
  hashAlg?: string;
}

export interface BrowserIPFSAddResult {
  cid: string;
  size: number;
  path?: string;
}

export interface BrowserIPFSPinStatus {
  cid: string;
  type: string;
}

export type BrowserIPFSContent =
  | string
  | Blob
  | ArrayBuffer
  | Uint8Array
  | FormData;

export interface BrowserIPFSCatOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface BrowserIPFSApiOptions extends BrowserIPFSCatOptions {
  headers?: Record<string, string>;
}

export interface BrowserIPFSTransport {
  readonly report: BrowserIPFSRuntimeReport;
  cat(cidOrPath: string, options?: BrowserIPFSCatOptions): Promise<Uint8Array>;
  catText(cidOrPath: string, options?: BrowserIPFSCatOptions): Promise<string>;
  add(content: BrowserIPFSContent, options?: BrowserIPFSAddOptions & BrowserIPFSApiOptions): Promise<BrowserIPFSAddResult>;
  pin(cid: string, options?: BrowserIPFSApiOptions & { recursive?: boolean }): Promise<boolean>;
  unpin(cid: string, options?: BrowserIPFSApiOptions & { recursive?: boolean }): Promise<boolean>;
  listPins(type?: string, options?: BrowserIPFSApiOptions): Promise<BrowserIPFSPinStatus[]>;
  id(options?: BrowserIPFSApiOptions): Promise<unknown>;
  version(options?: BrowserIPFSApiOptions): Promise<unknown>;
  getLibp2pConfig(): Promise<{ config: Record<string, unknown>; report: BrowserLibp2pRuntimeReport }>;
  createLibp2pNode(): Promise<{ node: unknown; config: Record<string, unknown>; report: BrowserLibp2pRuntimeReport }>;
}

const DEFAULT_GATEWAY_URL = 'https://ipfs.io';
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

function enabled(value: boolean | undefined): boolean {
  return value !== false;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeGatewayBaseUrl(baseUrl = DEFAULT_GATEWAY_URL): string {
  return trimTrailingSlashes(baseUrl);
}

function normalizeHttpApiBaseUrl(baseUrl: string): string {
  const trimmed = trimTrailingSlashes(baseUrl);
  return trimmed.endsWith('/api/v0') ? trimmed : `${trimmed}/api/v0`;
}

function stripIpfsScheme(cidOrPath: string): string {
  if (cidOrPath.startsWith('ipfs://')) return cidOrPath.slice('ipfs://'.length);
  if (cidOrPath.startsWith('ipns://')) return cidOrPath.slice('ipns://'.length);
  return cidOrPath.replace(/^\/+/, '');
}

function gatewayPath(cidOrPath: string): string {
  const normalized = stripIpfsScheme(cidOrPath);
  if (normalized.startsWith('ipfs/') || normalized.startsWith('ipns/')) {
    return normalized;
  }
  return `ipfs/${normalized}`;
}

function encodePath(pathValue: string): string {
  return pathValue
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function makeTimeoutSignal(timeoutMs: number, upstream?: AbortSignal): AbortSignal {
  if (upstream) return upstream;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function asFetch(candidate?: typeof globalThis.fetch): typeof globalThis.fetch {
  const selected = candidate ?? globalThis.fetch;
  if (typeof selected !== 'function') {
    throw new Error('Browser IPFS transport requires a fetch implementation');
  }
  return selected.bind(globalThis);
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

function appendOptionalParam(params: URLSearchParams, key: string, value: string | number | boolean | undefined): void {
  if (value !== undefined) params.append(key, String(value));
}

function parseAddResponseText(text: string): BrowserIPFSAddResult {
  const candidates = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const jsonText = candidates.length > 0 ? candidates[candidates.length - 1] : text;
  const data = JSON.parse(jsonText) as {
    Hash?: string;
    Name?: string;
    Size?: string | number;
    cid?: string;
    path?: string;
    size?: string | number;
  };
  const cid = data.Hash ?? data.cid;
  if (!cid) throw new Error('IPFS add response did not contain a CID');
  const rawSize = data.Size ?? data.size ?? 0;
  return {
    cid,
    size: typeof rawSize === 'number' ? rawSize : Number.parseInt(rawSize, 10) || 0,
    path: data.Name ?? data.path,
  };
}

function contentToFormData(content: BrowserIPFSContent, filename = 'file'): FormData {
  if (content instanceof FormData) return content;

  const form = new FormData();
  if (content instanceof Blob) {
    form.append('file', content, filename);
  } else if (typeof content === 'string') {
    form.append('file', new Blob([content]), filename);
  } else if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    form.append('file', new Blob([copy.buffer]), filename);
  } else {
    form.append('file', new Blob([content]), filename);
  }
  return form;
}

function makeReport(
  options: BrowserIPFSTransportOptions,
  libp2pReport?: BrowserLibp2pRuntimeReport,
): BrowserIPFSRuntimeReport {
  const gatewayBaseUrl = normalizeGatewayBaseUrl(options.gateway?.baseUrl);
  const httpApiBaseUrl = options.httpApi?.baseUrl
    ? normalizeHttpApiBaseUrl(options.httpApi.baseUrl)
    : undefined;
  const gatewayEnabled = enabled(options.gateway?.enabled);
  const httpEnabled = Boolean(httpApiBaseUrl) && enabled(options.httpApi?.enabled);
  const libp2pEnabled = enabled(options.libp2p?.enabled);

  const capabilities: BrowserIPFSCapabilityStatus[] = [
    {
      name: 'gateway-read',
      adapter: 'gateway',
      supported: true,
      enabled: gatewayEnabled,
      endpoint: gatewayBaseUrl,
    },
    {
      name: 'http-api-read',
      adapter: 'http-api',
      supported: true,
      enabled: httpEnabled,
      endpoint: httpApiBaseUrl,
      reason: httpApiBaseUrl ? undefined : 'No explicit browser-safe IPFS HTTP API endpoint configured',
    },
    {
      name: 'http-api-write',
      adapter: 'http-api',
      supported: true,
      enabled: httpEnabled,
      endpoint: httpApiBaseUrl,
      reason: httpApiBaseUrl ? undefined : 'No explicit browser-safe IPFS HTTP API endpoint configured',
    },
    {
      name: 'http-api-pin',
      adapter: 'http-api',
      supported: true,
      enabled: httpEnabled,
      endpoint: httpApiBaseUrl,
      reason: httpApiBaseUrl ? undefined : 'No explicit browser-safe IPFS HTTP API endpoint configured',
    },
    {
      name: 'libp2p-runtime',
      adapter: 'libp2p',
      supported: true,
      enabled: libp2pEnabled,
      reason: libp2pEnabled ? undefined : 'Browser libp2p runtime disabled by configuration',
    },
    {
      name: 'libp2p-content-routing',
      adapter: 'libp2p',
      supported: true,
      enabled: libp2pEnabled && options.libp2p?.contentRouting === true,
      reason: options.libp2p?.contentRouting === true
        ? undefined
        : 'Browser libp2p content routing requires an injected or configured libp2p router',
    },
    {
      name: 'libp2p-pubsub',
      adapter: 'libp2p',
      supported: true,
      enabled: libp2pEnabled && options.libp2p?.pubsub === true,
      reason: options.libp2p?.pubsub === true
        ? undefined
        : 'Browser libp2p pubsub is opt-in because GossipSub is optional',
    },
  ];

  const hostOnly: BrowserIPFSCapabilityStatus[] = [
    {
      name: 'daemon',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Local IPFS daemon lifecycle is available from services/ipfs/host only',
    },
    {
      name: 'filesystem',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Filesystem import/export is available from services/ipfs/host only',
    },
    {
      name: 'python',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Python-backed IPFS operations are available from services/ipfs/host only',
    },
    {
      name: 'native-ipfs',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Native IPFS CLI operations are available from services/ipfs/host only',
    },
  ];

  const gaps: BrowserIPFSCapabilityGap[] = [
    ...capabilities
      .filter(capability => !capability.enabled && capability.reason)
      .map(capability => ({
        name: capability.name,
        adapter: capability.adapter,
        reason: capability.reason as string,
      })),
    ...hostOnly.map(capability => ({
      name: capability.name,
      adapter: capability.adapter,
      reason: capability.reason as string,
    })),
    ...(libp2pReport?.gaps.map(gap => ({
      name: 'libp2p-runtime' as const,
      adapter: 'libp2p' as const,
      reason: `${gap.name} (${gap.packageName}): ${gap.reason}`,
    })) ?? []),
  ];

  return {
    runtime: 'browser',
    browserSafe: true,
    capabilities,
    gaps,
    hostOnly,
    libp2p: libp2pReport,
  };
}

export async function detectBrowserIPFSCapabilities(
  options: BrowserIPFSTransportOptions = {},
): Promise<BrowserIPFSRuntimeReport> {
  const libp2pReport = enabled(options.libp2p?.enabled)
    ? (await buildBrowserLibp2pConfig(options.libp2p)).report
    : undefined;
  return makeReport(options, libp2pReport);
}

export function createBrowserIPFSTransport(
  options: BrowserIPFSTransportOptions = {},
): BrowserIPFSTransport {
  const fetchImpl = asFetch(options.fetch);
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const gatewayBaseUrl = normalizeGatewayBaseUrl(options.gateway?.baseUrl);
  const httpApiBaseUrl = options.httpApi?.baseUrl
    ? normalizeHttpApiBaseUrl(options.httpApi.baseUrl)
    : undefined;
  const report = makeReport(options);

  async function gatewayFetch(cidOrPath: string, requestOptions: BrowserIPFSCatOptions = {}): Promise<Response> {
    if (!enabled(options.gateway?.enabled)) {
      throw new Error('Browser IPFS gateway adapter is disabled');
    }
    const url = `${gatewayBaseUrl}/${encodePath(gatewayPath(cidOrPath))}`;
    return fetchImpl(url, {
      method: 'GET',
      headers: options.gateway?.headers,
      signal: makeTimeoutSignal(requestOptions.timeoutMs ?? timeoutMs, requestOptions.signal),
    });
  }

  async function apiFetch(
    operation: string,
    params: URLSearchParams = new URLSearchParams(),
    init: RequestInit = {},
    requestOptions: BrowserIPFSApiOptions = {},
  ): Promise<Response> {
    if (!httpApiBaseUrl || options.httpApi?.enabled === false) {
      throw new Error('Browser IPFS HTTP API adapter requires an explicit endpoint');
    }
    const query = params.toString();
    const url = `${httpApiBaseUrl}/${operation}${query ? `?${query}` : ''}`;
    return fetchImpl(url, {
      ...init,
      method: init.method ?? 'POST',
      headers: {
        ...(options.httpApi?.headers ?? {}),
        ...(requestOptions.headers ?? {}),
        ...(init.headers as Record<string, string> | undefined ?? {}),
      },
      signal: makeTimeoutSignal(requestOptions.timeoutMs ?? timeoutMs, requestOptions.signal),
    });
  }

  async function assertOk(response: Response, operation: string): Promise<Response> {
    if (response.ok) return response;
    let detail = response.statusText;
    try {
      const text = await response.text();
      if (text) detail = text;
    } catch {
      // Preserve the status text when the body cannot be read.
    }
    throw new Error(`IPFS ${operation} failed: ${response.status} ${detail}`);
  }

  return {
    report,

    async cat(cidOrPath, requestOptions = {}) {
      if (httpApiBaseUrl && options.httpApi?.enabled !== false) {
        const params = new URLSearchParams({ arg: cidOrPath });
        const response = await assertOk(
          await apiFetch('cat', params, {}, requestOptions),
          'cat',
        );
        return responseBytes(response);
      }
      const response = await assertOk(await gatewayFetch(cidOrPath, requestOptions), 'gateway cat');
      return responseBytes(response);
    },

    async catText(cidOrPath, requestOptions = {}) {
      const bytes = await this.cat(cidOrPath, requestOptions);
      return new TextDecoder().decode(bytes);
    },

    async add(content, addOptions = {}) {
      const params = new URLSearchParams();
      appendOptionalParam(params, 'pin', addOptions.pin);
      appendOptionalParam(params, 'wrap-with-directory', addOptions.wrapWithDirectory);
      appendOptionalParam(params, 'cid-version', addOptions.cidVersion);
      appendOptionalParam(params, 'hash', addOptions.hashAlg);
      const response = await assertOk(
        await apiFetch(
          'add',
          params,
          { body: contentToFormData(content, addOptions.filename) },
          addOptions,
        ),
        'add',
      );
      return parseAddResponseText(await response.text());
    },

    async pin(cid, pinOptions = {}) {
      const params = new URLSearchParams({ arg: cid });
      appendOptionalParam(params, 'recursive', pinOptions.recursive ?? true);
      const response = await assertOk(await apiFetch('pin/add', params, {}, pinOptions), 'pin add');
      const data = await response.json() as { Pins?: string[] };
      return Array.isArray(data.Pins) ? data.Pins.includes(cid) : response.ok;
    },

    async unpin(cid, pinOptions = {}) {
      const params = new URLSearchParams({ arg: cid });
      appendOptionalParam(params, 'recursive', pinOptions.recursive ?? true);
      const response = await assertOk(await apiFetch('pin/rm', params, {}, pinOptions), 'pin rm');
      const data = await response.json() as { Pins?: string[] };
      return Array.isArray(data.Pins) ? data.Pins.includes(cid) : response.ok;
    },

    async listPins(type = 'all', requestOptions = {}) {
      const response = await assertOk(
        await apiFetch('pin/ls', new URLSearchParams({ type }), {}, requestOptions),
        'pin ls',
      );
      const data = await response.json() as { Keys?: Record<string, { Type?: string }> };
      return Object.entries(data.Keys ?? {}).map(([cid, info]) => ({
        cid,
        type: info.Type ?? 'unknown',
      }));
    },

    async id(requestOptions = {}) {
      const response = await assertOk(await apiFetch('id', new URLSearchParams(), {}, requestOptions), 'id');
      return response.json();
    },

    async version(requestOptions = {}) {
      const response = await assertOk(await apiFetch('version', new URLSearchParams(), {}, requestOptions), 'version');
      return response.json();
    },

    async getLibp2pConfig() {
      return buildBrowserLibp2pConfig(options.libp2p);
    },

    async createLibp2pNode() {
      return createBrowserLibp2pNode(options.libp2p);
    },
  };
}

export function summarizeBrowserIPFSCapabilityGaps(report: BrowserIPFSRuntimeReport): string[] {
  return [
    ...report.gaps.map(gap => `${gap.name} (${gap.adapter}): ${gap.reason}`),
    ...(report.libp2p ? summarizeBrowserLibp2pGaps(report.libp2p) : []),
  ];
}
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

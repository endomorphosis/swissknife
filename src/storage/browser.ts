// src/storage/browser.ts
//
// Explicit browser storage runtime for SwissKnife.
//
// Browser bundles must reach persistent storage only through this module.
// It is built exclusively on browser-safe Web platform APIs:
//   - IndexedDB (structured key/value storage)
//   - The Origin Private File System, OPFS (`navigator.storage.getDirectory()`)
//   - The Cache Storage API (`caches`)
//   - An explicitly injected IPFS transport (see `../services/ipfs/browser.js`)
//
// This module never imports Node's `fs`, `path`, `process`, or any other host
// runtime API. Those live behind `./host.ts`, which is host-only. See
// `src/module-ownership.json` for the enforced boundary.

import type { BrowserIPFSTransport } from '../services/ipfs/browser.js';

/**
 * Adapters this runtime can select between. `host-only` is used only inside
 * capability reports to describe the Node-side counterparts that are never
 * reachable from browser code.
 */
export type BrowserStorageAdapterKind = 'indexeddb' | 'opfs' | 'cache-storage' | 'ipfs';

export type BrowserStorageCapabilityName =
  | 'indexeddb'
  | 'opfs'
  | 'cache-storage'
  | 'ipfs-adapter'
  | 'filesystem'
  | 'path'
  | 'process';

export interface BrowserStorageCapabilityStatus {
  name: BrowserStorageCapabilityName;
  adapter: BrowserStorageAdapterKind | 'host-only';
  supported: boolean;
  enabled: boolean;
  reason?: string;
}

export interface BrowserStorageCapabilityGap {
  name: BrowserStorageCapabilityName;
  adapter: BrowserStorageAdapterKind | 'host-only';
  reason: string;
}

export interface BrowserStorageRuntimeReport {
  runtime: 'browser';
  browserSafe: true;
  /** The adapter actually selected by `createBrowserStorageProvider`, if any. */
  activeAdapter?: BrowserStorageAdapterKind;
  capabilities: BrowserStorageCapabilityStatus[];
  gaps: BrowserStorageCapabilityGap[];
  hostOnly: BrowserStorageCapabilityStatus[];
}

export interface BrowserStorageItemMetadata {
  /** Content-addressed key: `sha256-<hex>`, a hash fallback, or an IPFS CID. */
  key: string;
  size: number;
  contentType?: string;
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
  adapter: BrowserStorageAdapterKind;
}

export interface BrowserStorageListOptions {
  prefix?: string;
  limit?: number;
  offset?: number;
}

export interface BrowserStoragePutOptions {
  contentType?: string;
  tags?: string[];
  /** Explicit key override. Skips content hashing (e.g. for named config blobs). */
  key?: string;
}

export interface BrowserStoragePutResult {
  key: string;
  size: number;
  adapter: BrowserStorageAdapterKind;
}

export type BrowserStorageContent = string | Uint8Array | ArrayBuffer | Blob;

/**
 * Browser-safe content-addressed storage provider. Every adapter below
 * (IndexedDB, OPFS, Cache Storage, injected IPFS) implements this same shape
 * so calling code can be written once and remain portable across whichever
 * capability is available in the current browser.
 */
export interface BrowserStorageProvider {
  readonly kind: BrowserStorageAdapterKind;
  readonly report: BrowserStorageRuntimeReport;
  put(content: BrowserStorageContent, options?: BrowserStoragePutOptions): Promise<BrowserStoragePutResult>;
  get(key: string): Promise<Uint8Array>;
  getText(key: string): Promise<string>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(options?: BrowserStorageListOptions): Promise<BrowserStorageItemMetadata[]>;
  getMetadata(key: string): Promise<BrowserStorageItemMetadata | undefined>;
  clear(): Promise<void>;
}

export interface BrowserStorageIndexedDBOptions {
  enabled?: boolean;
  databaseName?: string;
  storeName?: string;
  version?: number;
}

export interface BrowserStorageOPFSOptions {
  enabled?: boolean;
  /** Sub-directory created under the OPFS root to namespace SwissKnife data. */
  directory?: string;
}

export interface BrowserStorageCacheOptions {
  enabled?: boolean;
  cacheName?: string;
  /** Synthetic origin used to build cache request URLs. Never fetched over the network. */
  origin?: string;
}

export interface BrowserStorageIPFSOptions {
  enabled?: boolean;
  /** Injected browser IPFS transport from `../services/ipfs/browser.js`. */
  transport?: BrowserIPFSTransport;
  /** Whether added content should be pinned. Defaults to `true`. */
  pin?: boolean;
}

export interface BrowserStorageProviderOptions {
  /** Adapter selection order. Defaults to indexeddb -> opfs -> cache-storage -> ipfs. */
  preferredAdapters?: BrowserStorageAdapterKind[];
  indexeddb?: BrowserStorageIndexedDBOptions;
  opfs?: BrowserStorageOPFSOptions;
  cacheStorage?: BrowserStorageCacheOptions;
  ipfs?: BrowserStorageIPFSOptions;
  /** Override the default content-hashing function (mainly for tests). */
  hash?: (data: Uint8Array) => Promise<string>;
}

const DEFAULT_DB_NAME = 'swissknife-storage';
const DEFAULT_STORE_NAME = 'blobs';
const DEFAULT_DB_VERSION = 1;
const DEFAULT_OPFS_DIR = 'swissknife-storage';
const DEFAULT_CACHE_NAME = 'swissknife-storage-v1';
const DEFAULT_CACHE_ORIGIN = 'https://swissknife.local';
const DEFAULT_ADAPTER_ORDER: BrowserStorageAdapterKind[] = ['indexeddb', 'opfs', 'cache-storage', 'ipfs'];
const OPFS_INDEX_FILE = '__index__.json';

function isEnabled(value: boolean | undefined): boolean {
  return value !== false;
}

/** True when the IndexedDB API is available in the current global scope. */
export function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/** True when the Origin Private File System is available (`navigator.storage.getDirectory`). */
export function hasOPFS(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

/** True when the Cache Storage API is available in the current global scope. */
export function hasCacheStorage(): boolean {
  return typeof caches !== 'undefined' && caches !== null;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const value of bytes) {
    hex += value.toString(16).padStart(2, '0');
  }
  return hex;
}

async function defaultHash(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const digest = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer);
    return `sha256-${bytesToHex(new Uint8Array(digest))}`;
  }
  // Fallback for insecure contexts without SubtleCrypto: FNV-1a 32-bit hash.
  // Not cryptographically strong, but stable, dependency-free, and sufficient
  // for content addressing within a single browser storage origin.
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function toUint8Array(content: BrowserStorageContent): Promise<Uint8Array> {
  if (content instanceof Uint8Array) return content;
  if (typeof content === 'string') return new TextEncoder().encode(content);
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof Blob !== 'undefined' && content instanceof Blob) {
    return new Uint8Array(await content.arrayBuffer());
  }
  throw new Error('Unsupported browser storage content type');
}

function applyListOptions<T extends { key: string }>(items: T[], options: BrowserStorageListOptions): T[] {
  let filtered = options.prefix ? items.filter(item => item.key.startsWith(options.prefix as string)) : items;
  if (options.offset) filtered = filtered.slice(options.offset);
  if (options.limit !== undefined) filtered = filtered.slice(0, options.limit);
  return filtered;
}

function buildReport(options: BrowserStorageProviderOptions): BrowserStorageRuntimeReport {
  const indexeddbSupported = hasIndexedDB();
  const opfsSupported = hasOPFS();
  const cacheSupported = hasCacheStorage();
  const ipfsInjected = Boolean(options.ipfs?.transport);

  const capabilities: BrowserStorageCapabilityStatus[] = [
    {
      name: 'indexeddb',
      adapter: 'indexeddb',
      supported: indexeddbSupported,
      enabled: indexeddbSupported && isEnabled(options.indexeddb?.enabled),
      reason: !indexeddbSupported
        ? 'IndexedDB is not available in this environment'
        : isEnabled(options.indexeddb?.enabled)
          ? undefined
          : 'IndexedDB adapter disabled by configuration',
    },
    {
      name: 'opfs',
      adapter: 'opfs',
      supported: opfsSupported,
      enabled: opfsSupported && isEnabled(options.opfs?.enabled),
      reason: !opfsSupported
        ? 'Origin Private File System is not available in this environment'
        : isEnabled(options.opfs?.enabled)
          ? undefined
          : 'OPFS adapter disabled by configuration',
    },
    {
      name: 'cache-storage',
      adapter: 'cache-storage',
      supported: cacheSupported,
      enabled: cacheSupported && isEnabled(options.cacheStorage?.enabled),
      reason: !cacheSupported
        ? 'Cache Storage API is not available in this environment'
        : isEnabled(options.cacheStorage?.enabled)
          ? undefined
          : 'Cache Storage adapter disabled by configuration',
    },
    {
      name: 'ipfs-adapter',
      adapter: 'ipfs',
      supported: ipfsInjected,
      enabled: ipfsInjected && isEnabled(options.ipfs?.enabled),
      reason: !ipfsInjected
        ? 'No IPFS transport was injected (see createBrowserIPFSTransport in ../services/ipfs/browser.js)'
        : isEnabled(options.ipfs?.enabled)
          ? undefined
          : 'Injected IPFS adapter disabled by configuration',
    },
  ];

  const hostOnly: BrowserStorageCapabilityStatus[] = [
    {
      name: 'filesystem',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Node filesystem storage is available from src/storage/host.ts only',
    },
    {
      name: 'path',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Node path resolution for storage backends is available from src/storage/host.ts only',
    },
    {
      name: 'process',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Node process/config-driven storage is available from src/storage/host.ts only',
    },
  ];

  const gaps: BrowserStorageCapabilityGap[] = [
    ...capabilities
      .filter(capability => !capability.enabled && capability.reason)
      .map(capability => ({ name: capability.name, adapter: capability.adapter, reason: capability.reason as string })),
    ...hostOnly.map(capability => ({
      name: capability.name,
      adapter: capability.adapter,
      reason: capability.reason as string,
    })),
  ];

  return {
    runtime: 'browser',
    browserSafe: true,
    capabilities,
    gaps,
    hostOnly,
  };
}

/** Inspect the current environment and report which browser storage adapters are usable. */
export function detectBrowserStorageCapabilities(
  options: BrowserStorageProviderOptions = {},
): BrowserStorageRuntimeReport {
  return buildReport(options);
}

/** Flatten a runtime report's gaps into human-readable summary lines. */
export function summarizeBrowserStorageCapabilityGaps(report: BrowserStorageRuntimeReport): string[] {
  return report.gaps.map(gap => `${gap.name} (${gap.adapter}): ${gap.reason}`);
}

function idbRequestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

interface IndexedDBRecord {
  key: string;
  data: Uint8Array;
  size: number;
  contentType?: string;
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
}

class IndexedDBStorageProvider implements BrowserStorageProvider {
  readonly kind: BrowserStorageAdapterKind = 'indexeddb';
  readonly report: BrowserStorageRuntimeReport;
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly version: number;
  private readonly hashFn: (data: Uint8Array) => Promise<string>;
  private dbPromise?: Promise<IDBDatabase>;

  constructor(options: BrowserStorageProviderOptions, report: BrowserStorageRuntimeReport) {
    this.databaseName = options.indexeddb?.databaseName ?? DEFAULT_DB_NAME;
    this.storeName = options.indexeddb?.storeName ?? DEFAULT_STORE_NAME;
    this.version = options.indexeddb?.version ?? DEFAULT_DB_VERSION;
    this.hashFn = options.hash ?? defaultHash;
    this.report = report;
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, this.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB database'));
      });
    }
    return this.dbPromise;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDb();
    const tx = db.transaction(this.storeName, mode);
    const store = tx.objectStore(this.storeName);
    return idbRequestToPromise(fn(store));
  }

  private getRecord(key: string): Promise<IndexedDBRecord | undefined> {
    return this.withStore('readonly', store => store.get(key));
  }

  private toMetadata(record: IndexedDBRecord): BrowserStorageItemMetadata {
    return {
      key: record.key,
      size: record.size,
      contentType: record.contentType,
      tags: record.tags,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      adapter: this.kind,
    };
  }

  async put(content: BrowserStorageContent, options: BrowserStoragePutOptions = {}): Promise<BrowserStoragePutResult> {
    const bytes = await toUint8Array(content);
    const key = options.key ?? (await this.hashFn(bytes));
    const existing = await this.getRecord(key);
    const now = Date.now();
    const record: IndexedDBRecord = {
      key,
      data: bytes,
      size: bytes.byteLength,
      contentType: options.contentType,
      tags: options.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
    };
    await this.withStore('readwrite', store => store.put(record));
    return { key, size: record.size, adapter: this.kind };
  }

  async get(key: string): Promise<Uint8Array> {
    const record = await this.getRecord(key);
    if (!record) throw new Error(`Browser storage key not found: ${key}`);
    return record.data;
  }

  async getText(key: string): Promise<string> {
    return new TextDecoder().decode(await this.get(key));
  }

  async has(key: string): Promise<boolean> {
    return (await this.getRecord(key)) !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    const existing = await this.getRecord(key);
    if (!existing) return false;
    await this.withStore('readwrite', store => store.delete(key));
    return true;
  }

  async list(options: BrowserStorageListOptions = {}): Promise<BrowserStorageItemMetadata[]> {
    const records = await this.withStore('readonly', store => store.getAll());
    return applyListOptions(records.map(record => this.toMetadata(record)), options);
  }

  async getMetadata(key: string): Promise<BrowserStorageItemMetadata | undefined> {
    const record = await this.getRecord(key);
    return record ? this.toMetadata(record) : undefined;
  }

  async clear(): Promise<void> {
    await this.withStore('readwrite', store => store.clear());
  }
}

interface OPFSMetadataRecord {
  size: number;
  contentType?: string;
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
}

type OPFSIndex = Record<string, OPFSMetadataRecord>;

class OPFSStorageProvider implements BrowserStorageProvider {
  readonly kind: BrowserStorageAdapterKind = 'opfs';
  readonly report: BrowserStorageRuntimeReport;
  private readonly directoryName: string;
  private readonly hashFn: (data: Uint8Array) => Promise<string>;
  private dirPromise?: Promise<FileSystemDirectoryHandle>;

  constructor(options: BrowserStorageProviderOptions, report: BrowserStorageRuntimeReport) {
    this.directoryName = options.opfs?.directory ?? DEFAULT_OPFS_DIR;
    this.hashFn = options.hash ?? defaultHash;
    this.report = report;
  }

  private async getRootDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!this.dirPromise) {
      this.dirPromise = (async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle(this.directoryName, { create: true });
      })();
    }
    return this.dirPromise;
  }

  private async readIndex(dir: FileSystemDirectoryHandle): Promise<OPFSIndex> {
    try {
      const handle = await dir.getFileHandle(OPFS_INDEX_FILE);
      const file = await handle.getFile();
      const text = await file.text();
      return text ? (JSON.parse(text) as OPFSIndex) : {};
    } catch {
      return {};
    }
  }

  private async writeIndex(dir: FileSystemDirectoryHandle, index: OPFSIndex): Promise<void> {
    const handle = await dir.getFileHandle(OPFS_INDEX_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(index));
    await writable.close();
  }

  private toMetadata(key: string, record: OPFSMetadataRecord): BrowserStorageItemMetadata {
    return {
      key,
      size: record.size,
      contentType: record.contentType,
      tags: record.tags,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      adapter: this.kind,
    };
  }

  async put(content: BrowserStorageContent, options: BrowserStoragePutOptions = {}): Promise<BrowserStoragePutResult> {
    const bytes = await toUint8Array(content);
    const key = options.key ?? (await this.hashFn(bytes));
    const dir = await this.getRootDirectory();
    const index = await this.readIndex(dir);
    const existing = index[key];
    const now = Date.now();
    const record: OPFSMetadataRecord = {
      size: bytes.byteLength,
      contentType: options.contentType,
      tags: options.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
    };

    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);

    const fileHandle = await dir.getFileHandle(key, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(body);
    await writable.close();

    index[key] = record;
    await this.writeIndex(dir, index);

    return { key, size: record.size, adapter: this.kind };
  }

  async get(key: string): Promise<Uint8Array> {
    const dir = await this.getRootDirectory();
    try {
      const handle = await dir.getFileHandle(key);
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      throw new Error(`Browser storage key not found: ${key}`);
    }
  }

  async getText(key: string): Promise<string> {
    return new TextDecoder().decode(await this.get(key));
  }

  async has(key: string): Promise<boolean> {
    const dir = await this.getRootDirectory();
    const index = await this.readIndex(dir);
    return key in index;
  }

  async delete(key: string): Promise<boolean> {
    const dir = await this.getRootDirectory();
    const index = await this.readIndex(dir);
    if (!(key in index)) return false;
    delete index[key];
    await dir.removeEntry(key).catch(() => undefined);
    await this.writeIndex(dir, index);
    return true;
  }

  async list(options: BrowserStorageListOptions = {}): Promise<BrowserStorageItemMetadata[]> {
    const dir = await this.getRootDirectory();
    const index = await this.readIndex(dir);
    const items = Object.entries(index).map(([key, record]) => this.toMetadata(key, record));
    return applyListOptions(items, options);
  }

  async getMetadata(key: string): Promise<BrowserStorageItemMetadata | undefined> {
    const dir = await this.getRootDirectory();
    const index = await this.readIndex(dir);
    const record = index[key];
    return record ? this.toMetadata(key, record) : undefined;
  }

  async clear(): Promise<void> {
    const dir = await this.getRootDirectory();
    const index = await this.readIndex(dir);
    for (const key of Object.keys(index)) {
      await dir.removeEntry(key).catch(() => undefined);
    }
    await dir.removeEntry(OPFS_INDEX_FILE).catch(() => undefined);
  }
}

class CacheStorageProvider implements BrowserStorageProvider {
  readonly kind: BrowserStorageAdapterKind = 'cache-storage';
  readonly report: BrowserStorageRuntimeReport;
  private readonly cacheName: string;
  private readonly origin: string;
  private readonly hashFn: (data: Uint8Array) => Promise<string>;
  private cachePromise?: Promise<Cache>;

  constructor(options: BrowserStorageProviderOptions, report: BrowserStorageRuntimeReport) {
    this.cacheName = options.cacheStorage?.cacheName ?? DEFAULT_CACHE_NAME;
    this.origin = (options.cacheStorage?.origin ?? DEFAULT_CACHE_ORIGIN).replace(/\/+$/, '');
    this.hashFn = options.hash ?? defaultHash;
    this.report = report;
  }

  private openCache(): Promise<Cache> {
    if (!this.cachePromise) {
      this.cachePromise = caches.open(this.cacheName);
    }
    return this.cachePromise;
  }

  private contentUrl(key: string): string {
    return `${this.origin}/storage/${encodeURIComponent(key)}`;
  }

  private metaUrl(key: string): string {
    return `${this.origin}/storage/${encodeURIComponent(key)}.meta.json`;
  }

  private async readMeta(cache: Cache, key: string): Promise<OPFSMetadataRecord | undefined> {
    const response = await cache.match(this.metaUrl(key));
    if (!response) return undefined;
    return (await response.json()) as OPFSMetadataRecord;
  }

  private toMetadata(key: string, record: OPFSMetadataRecord): BrowserStorageItemMetadata {
    return {
      key,
      size: record.size,
      contentType: record.contentType,
      tags: record.tags,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      adapter: this.kind,
    };
  }

  async put(content: BrowserStorageContent, options: BrowserStoragePutOptions = {}): Promise<BrowserStoragePutResult> {
    const bytes = await toUint8Array(content);
    const key = options.key ?? (await this.hashFn(bytes));
    const cache = await this.openCache();
    const existing = await this.readMeta(cache, key);
    const now = Date.now();
    const record: OPFSMetadataRecord = {
      size: bytes.byteLength,
      contentType: options.contentType,
      tags: options.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
    };

    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);

    await cache.put(
      this.contentUrl(key),
      new Response(body, {
        headers: options.contentType ? { 'content-type': options.contentType } : undefined,
      }),
    );
    await cache.put(
      this.metaUrl(key),
      new Response(JSON.stringify(record), { headers: { 'content-type': 'application/json' } }),
    );

    return { key, size: record.size, adapter: this.kind };
  }

  async get(key: string): Promise<Uint8Array> {
    const cache = await this.openCache();
    const response = await cache.match(this.contentUrl(key));
    if (!response) throw new Error(`Browser storage key not found: ${key}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async getText(key: string): Promise<string> {
    return new TextDecoder().decode(await this.get(key));
  }

  async has(key: string): Promise<boolean> {
    const cache = await this.openCache();
    return (await cache.match(this.contentUrl(key))) !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    const cache = await this.openCache();
    const deleted = await cache.delete(this.contentUrl(key));
    await cache.delete(this.metaUrl(key));
    return deleted;
  }

  async list(options: BrowserStorageListOptions = {}): Promise<BrowserStorageItemMetadata[]> {
    const cache = await this.openCache();
    const requests = await cache.keys();
    const prefix = `${this.origin}/storage/`;
    const keys = requests
      .map(request => request.url)
      .filter(url => url.startsWith(prefix) && !url.endsWith('.meta.json'))
      .map(url => decodeURIComponent(url.slice(prefix.length)));

    const items: BrowserStorageItemMetadata[] = [];
    for (const key of keys) {
      const meta = await this.readMeta(cache, key);
      items.push(this.toMetadata(key, meta ?? { size: 0, createdAt: 0 }));
    }
    return applyListOptions(items, options);
  }

  async getMetadata(key: string): Promise<BrowserStorageItemMetadata | undefined> {
    const cache = await this.openCache();
    const meta = await this.readMeta(cache, key);
    return meta ? this.toMetadata(key, meta) : undefined;
  }

  async clear(): Promise<void> {
    const cache = await this.openCache();
    const requests = await cache.keys();
    await Promise.all(requests.map(request => cache.delete(request)));
  }
}

/**
 * Wraps an injected browser IPFS transport (from `../services/ipfs/browser.js`)
 * so IPFS content-addressed storage can be used through the same
 * `BrowserStorageProvider` shape as the local adapters above. This adapter
 * never manages daemons, the filesystem, or subprocesses; it only calls the
 * transport that was handed to it.
 */
class IPFSAdapterStorageProvider implements BrowserStorageProvider {
  readonly kind: BrowserStorageAdapterKind = 'ipfs';
  readonly report: BrowserStorageRuntimeReport;
  private readonly transport: BrowserIPFSTransport;
  private readonly pin: boolean;
  private readonly seen = new Map<string, BrowserStorageItemMetadata>();

  constructor(options: BrowserStorageProviderOptions, report: BrowserStorageRuntimeReport) {
    if (!options.ipfs?.transport) {
      throw new Error('Browser storage IPFS adapter requires an injected IPFS transport');
    }
    this.transport = options.ipfs.transport;
    this.pin = options.ipfs.pin ?? true;
    this.report = report;
  }

  async put(content: BrowserStorageContent, options: BrowserStoragePutOptions = {}): Promise<BrowserStoragePutResult> {
    const bytes = await toUint8Array(content);
    const added = await this.transport.add(bytes, { pin: this.pin });
    const metadata: BrowserStorageItemMetadata = {
      key: added.cid,
      size: added.size || bytes.byteLength,
      contentType: options.contentType,
      tags: options.tags,
      createdAt: Date.now(),
      adapter: this.kind,
    };
    this.seen.set(added.cid, metadata);
    return { key: added.cid, size: metadata.size, adapter: this.kind };
  }

  get(key: string): Promise<Uint8Array> {
    return this.transport.cat(key);
  }

  getText(key: string): Promise<string> {
    return this.transport.catText(key);
  }

  async has(key: string): Promise<boolean> {
    try {
      await this.transport.cat(key);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    // Content-addressed storage has no real delete; unpinning is the closest analog.
    if (!this.pin) return false;
    try {
      const removed = await this.transport.unpin(key);
      this.seen.delete(key);
      return removed;
    } catch {
      return false;
    }
  }

  async list(options: BrowserStorageListOptions = {}): Promise<BrowserStorageItemMetadata[]> {
    return applyListOptions(Array.from(this.seen.values()), options);
  }

  async getMetadata(key: string): Promise<BrowserStorageItemMetadata | undefined> {
    return this.seen.get(key);
  }

  async clear(): Promise<void> {
    for (const key of Array.from(this.seen.keys())) {
      await this.delete(key);
    }
  }
}

/**
 * Select and construct the best available browser storage adapter.
 *
 * Adapters are tried in `preferredAdapters` order (default: IndexedDB, OPFS,
 * Cache Storage, then an injected IPFS transport). The first adapter that is
 * both supported by the current environment and not explicitly disabled is
 * returned. If none are available, an error is thrown describing every gap so
 * callers know exactly what capability is missing.
 */
export function createBrowserStorageProvider(options: BrowserStorageProviderOptions = {}): BrowserStorageProvider {
  const report = buildReport(options);
  const order = options.preferredAdapters ?? DEFAULT_ADAPTER_ORDER;

  for (const adapterKind of order) {
    if (adapterKind === 'indexeddb' && hasIndexedDB() && isEnabled(options.indexeddb?.enabled)) {
      report.activeAdapter = 'indexeddb';
      return new IndexedDBStorageProvider(options, report);
    }
    if (adapterKind === 'opfs' && hasOPFS() && isEnabled(options.opfs?.enabled)) {
      report.activeAdapter = 'opfs';
      return new OPFSStorageProvider(options, report);
    }
    if (adapterKind === 'cache-storage' && hasCacheStorage() && isEnabled(options.cacheStorage?.enabled)) {
      report.activeAdapter = 'cache-storage';
      return new CacheStorageProvider(options, report);
    }
    if (adapterKind === 'ipfs' && options.ipfs?.transport && isEnabled(options.ipfs?.enabled)) {
      report.activeAdapter = 'ipfs';
      return new IPFSAdapterStorageProvider(options, report);
    }
  }

  const gaps = summarizeBrowserStorageCapabilityGaps(report).join('; ') || 'no adapters reported';
  throw new Error(`No browser storage adapter is available for this environment. Gaps: ${gaps}`);
}

export type { BrowserIPFSTransport };

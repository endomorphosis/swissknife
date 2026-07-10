// src/storage/host.ts
//
// Explicit host storage runtime for SwissKnife.
//
// This module is the host-only counterpart to `./browser.ts`. Node's
// filesystem, `path`, and process/environment-driven storage belong here and
// must never be imported from browser bundles. Anything reachable from a
// browser entrypoint must go through `./browser.ts`'s IndexedDB, OPFS, Cache
// Storage, or injected IPFS adapters instead.
//
// Note: several legacy modules under `src/storage` (for example
// `registry.ts`, `service.ts`, `storage-service.ts`, and `backends/*`) are
// private implementation details per `src/module-ownership.json` and are not
// re-exported here. This entrypoint provides a self-contained, working host
// storage provider with the same content-addressed shape as the browser
// runtime so callers can pick an implementation based on `platform`'s runtime
// detection without depending on those private/legacy internals.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  HostStorageAdapterKind,
  HostStorageCapabilityGap,
  HostStorageCapabilityStatus,
  HostStorageItemMetadata,
  HostStorageListOptions,
  HostStoragePutOptions,
  HostStoragePutResult,
  HostStorageRuntimeReport,
} from '../shared/service-contracts/index.js';

export type {
  DirEntry,
  FileStat,
  ReadFileOptions,
  SpaceInfo,
  StorageBackend,
  WriteFileOptions,
} from './backend.js';
export { StorageError, StorageErrorType } from './backend.js';

export type {
  HostStorageAdapterKind,
  HostStorageCapabilityGap,
  HostStorageCapabilityName,
  HostStorageCapabilityStatus,
  HostStorageItemMetadata,
  HostStorageListOptions,
  HostStoragePutOptions,
  HostStoragePutResult,
  HostStorageRuntimeReport,
} from '../shared/service-contracts/index.js';

export type HostStorageContent = string | Uint8Array | Buffer;

export interface HostStorageProviderOptions {
  /** Base directory for content-addressed storage. Defaults under the user's home directory. */
  baseDir?: string;
  /** Override the default content-hashing function (mainly for tests). */
  hash?: (data: Buffer) => Promise<string>;
}

/**
 * Host-only content-addressed storage provider backed by the Node
 * filesystem. Mirrors `BrowserStorageProvider` from `./browser.ts` so calling
 * code can select an implementation by runtime without changing call sites.
 */
export interface HostStorageProvider {
  readonly kind: HostStorageAdapterKind;
  readonly report: HostStorageRuntimeReport;
  readonly baseDir: string;
  put(content: HostStorageContent, options?: HostStoragePutOptions): Promise<HostStoragePutResult>;
  get(key: string): Promise<Buffer>;
  getText(key: string): Promise<string>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  list(options?: HostStorageListOptions): Promise<HostStorageItemMetadata[]>;
  getMetadata(key: string): Promise<HostStorageItemMetadata | undefined>;
  clear(): Promise<void>;
  /** Absolute filesystem path for a stored key. Host-only convenience. */
  getPath(key: string): string;
}

const DEFAULT_BASE_DIR_SEGMENTS = ['.swissknife', 'storage', 'browser-parity'];
const META_SUFFIX = '.meta.json';

function defaultBaseDir(): string {
  return join(homedir(), ...DEFAULT_BASE_DIR_SEGMENTS);
}

async function defaultHash(data: Buffer): Promise<string> {
  return `sha256-${createHash('sha256').update(data).digest('hex')}`;
}

function toBuffer(content: HostStorageContent): Buffer {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
}

/** Build the host storage runtime report describing filesystem/path/process availability. */
export function detectHostStorageCapabilities(): HostStorageRuntimeReport {
  const capabilities: HostStorageCapabilityStatus[] = [
    { name: 'filesystem', adapter: 'filesystem', supported: true, enabled: true },
    { name: 'path', adapter: 'filesystem', supported: true, enabled: true },
    { name: 'process-env', adapter: 'filesystem', supported: true, enabled: true },
  ];

  const browserOnly: HostStorageCapabilityStatus[] = [
    {
      name: 'indexeddb',
      adapter: 'browser-only',
      supported: false,
      enabled: false,
      reason: 'IndexedDB storage is available from src/storage/browser.ts only',
    },
    {
      name: 'opfs',
      adapter: 'browser-only',
      supported: false,
      enabled: false,
      reason: 'Origin Private File System storage is available from src/storage/browser.ts only',
    },
    {
      name: 'cache-storage',
      adapter: 'browser-only',
      supported: false,
      enabled: false,
      reason: 'Cache Storage API storage is available from src/storage/browser.ts only',
    },
    {
      name: 'ipfs-adapter',
      adapter: 'browser-only',
      supported: false,
      enabled: false,
      reason: 'Injected browser IPFS transport storage is available from src/storage/browser.ts only',
    },
  ];

  const gaps: HostStorageCapabilityGap[] = browserOnly.map(capability => ({
    name: capability.name,
    adapter: capability.adapter,
    reason: capability.reason as string,
  }));

  return {
    runtime: 'host',
    browserSafe: false,
    activeAdapter: 'filesystem',
    capabilities,
    browserOnly,
    gaps,
  };
}

/** Flatten a host runtime report's gaps into human-readable summary lines. */
export function summarizeHostStorageCapabilityGaps(report: HostStorageRuntimeReport): string[] {
  return report.gaps.map(gap => `${gap.name} (${gap.adapter}): ${gap.reason}`);
}

class FilesystemStorageProvider implements HostStorageProvider {
  readonly kind: HostStorageAdapterKind = 'filesystem';
  readonly report: HostStorageRuntimeReport;
  readonly baseDir: string;
  private readonly hashFn: (data: Buffer) => Promise<string>;
  private readonly ready: Promise<void>;

  constructor(options: HostStorageProviderOptions = {}) {
    this.baseDir = options.baseDir ?? defaultBaseDir();
    this.hashFn = options.hash ?? defaultHash;
    this.report = detectHostStorageCapabilities();
    this.ready = mkdir(this.baseDir, { recursive: true }).then(() => undefined);
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  getPath(key: string): string {
    return join(this.baseDir, encodeURIComponent(key));
  }

  private metaPath(key: string): string {
    return `${this.getPath(key)}${META_SUFFIX}`;
  }

  private async readMeta(key: string): Promise<HostStorageItemMetadata | undefined> {
    try {
      const raw = await readFile(this.metaPath(key), 'utf8');
      return JSON.parse(raw) as HostStorageItemMetadata;
    } catch {
      return undefined;
    }
  }

  private async writeMeta(metadata: HostStorageItemMetadata): Promise<void> {
    await writeFile(this.metaPath(metadata.key), JSON.stringify(metadata), 'utf8');
  }

  async put(content: HostStorageContent, options: HostStoragePutOptions = {}): Promise<HostStoragePutResult> {
    await this.ensureReady();
    const buffer = toBuffer(content);
    const key = options.key ?? (await this.hashFn(buffer));
    const existing = await this.readMeta(key);
    const now = Date.now();
    const metadata: HostStorageItemMetadata = {
      key,
      size: buffer.byteLength,
      contentType: options.contentType,
      tags: options.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
      adapter: this.kind,
    };
    await writeFile(this.getPath(key), buffer);
    await this.writeMeta(metadata);
    return { key, size: metadata.size, adapter: this.kind };
  }

  async get(key: string): Promise<Buffer> {
    await this.ensureReady();
    try {
      return await readFile(this.getPath(key));
    } catch {
      throw new Error(`Host storage key not found: ${key}`);
    }
  }

  async getText(key: string): Promise<string> {
    return (await this.get(key)).toString('utf8');
  }

  async has(key: string): Promise<boolean> {
    await this.ensureReady();
    try {
      await stat(this.getPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureReady();
    const existed = await this.has(key);
    if (!existed) return false;
    await rm(this.getPath(key), { force: true });
    await rm(this.metaPath(key), { force: true });
    return true;
  }

  async list(options: HostStorageListOptions = {}): Promise<HostStorageItemMetadata[]> {
    await this.ensureReady();
    const entries = await readdir(this.baseDir);
    const keys = entries
      .filter(name => name.endsWith(META_SUFFIX))
      .map(name => decodeURIComponent(name.slice(0, -META_SUFFIX.length)));

    const items: HostStorageItemMetadata[] = [];
    for (const key of keys) {
      const meta = await this.readMeta(key);
      if (meta) items.push(meta);
    }

    let filtered = options.prefix ? items.filter(item => item.key.startsWith(options.prefix as string)) : items;
    if (options.offset) filtered = filtered.slice(options.offset);
    if (options.limit !== undefined) filtered = filtered.slice(0, options.limit);
    return filtered;
  }

  async getMetadata(key: string): Promise<HostStorageItemMetadata | undefined> {
    await this.ensureReady();
    return this.readMeta(key);
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    const items = await this.list();
    for (const item of items) {
      await this.delete(item.key);
    }
  }
}

/** Create a host-only, filesystem-backed content-addressed storage provider. */
export function createHostStorageProvider(options: HostStorageProviderOptions = {}): HostStorageProvider {
  return new FilesystemStorageProvider(options);
}

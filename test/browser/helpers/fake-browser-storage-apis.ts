// test/browser/helpers/fake-browser-storage-apis.ts
//
// Minimal, dependency-free fakes for the Web Storage APIs that
// `src/storage/browser.ts` targets (IndexedDB, OPFS, Cache Storage). These
// exist purely to exercise the real adapter code paths under Vitest's
// happy-dom environment, which does not implement `indexedDB`, OPFS, or
// `caches`. They are intentionally small: only the subset of each API used
// by `src/storage/browser.ts` is implemented.

import { vi } from 'vitest';

type Listener = () => void;

class FakeIDBRequest<T = unknown> {
  result: T = undefined as unknown as T;
  error: Error | null = null;
  onsuccess: Listener | null = null;
  onerror: Listener | null = null;

  succeed(result: T): void {
    this.result = result;
    Promise.resolve().then(() => this.onsuccess?.());
  }

  fail(error: Error): void {
    this.error = error;
    Promise.resolve().then(() => this.onerror?.());
  }
}

class FakeIDBObjectStore {
  constructor(
    private readonly records: Map<string, unknown>,
    private readonly keyPath: string,
  ) {}

  put(value: Record<string, unknown>): FakeIDBRequest {
    const request = new FakeIDBRequest();
    const key = value[this.keyPath] as string;
    this.records.set(key, value);
    request.succeed(key);
    return request;
  }

  get(key: string): FakeIDBRequest {
    const request = new FakeIDBRequest();
    request.succeed(this.records.get(key));
    return request;
  }

  delete(key: string): FakeIDBRequest {
    const request = new FakeIDBRequest();
    this.records.delete(key);
    request.succeed(undefined);
    return request;
  }

  getAll(): FakeIDBRequest {
    const request = new FakeIDBRequest();
    request.succeed(Array.from(this.records.values()));
    return request;
  }

  clear(): FakeIDBRequest {
    const request = new FakeIDBRequest();
    this.records.clear();
    request.succeed(undefined);
    return request;
  }
}

class FakeIDBTransaction {
  constructor(private readonly stores: Map<string, FakeIDBObjectStore>) {}

  objectStore(name: string): FakeIDBObjectStore {
    const store = this.stores.get(name);
    if (!store) throw new Error(`Fake IndexedDB: unknown object store "${name}"`);
    return store;
  }
}

class FakeIDBDatabase {
  readonly objectStoreNames = {
    contains: (name: string): boolean => this.storeRecords.has(name),
  };

  private readonly storeRecords = new Map<string, Map<string, unknown>>();
  private readonly stores = new Map<string, FakeIDBObjectStore>();

  createObjectStore(name: string, options: { keyPath: string }): FakeIDBObjectStore {
    const records = new Map<string, unknown>();
    this.storeRecords.set(name, records);
    const store = new FakeIDBObjectStore(records, options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(name: string): FakeIDBTransaction {
    void name;
    return new FakeIDBTransaction(this.stores);
  }
}

class FakeIDBOpenRequest extends FakeIDBRequest<FakeIDBDatabase> {
  onupgradeneeded: Listener | null = null;
}

class FakeIDBFactory {
  private readonly databases = new Map<string, FakeIDBDatabase>();

  open(name: string, _version?: number): FakeIDBOpenRequest {
    void _version;
    const request = new FakeIDBOpenRequest();
    const isNew = !this.databases.has(name);
    if (isNew) this.databases.set(name, new FakeIDBDatabase());
    const db = this.databases.get(name) as FakeIDBDatabase;

    Promise.resolve().then(() => {
      if (isNew) {
        request.result = db;
        request.onupgradeneeded?.();
      }
      request.succeed(db);
    });

    return request;
  }
}

/** Install a fresh fake `indexedDB` global for the duration of a test. */
export function installFakeIndexedDB(): void {
  vi.stubGlobal('indexedDB', new FakeIDBFactory());
}

interface FakeFileSystemEntry {
  kind: 'file' | 'directory';
}

class FakeFileSystemFileHandle implements FakeFileSystemEntry {
  readonly kind = 'file' as const;
  private content = new Uint8Array();

  constructor(public readonly name: string) {}

  async getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }> {
    const bytes = this.content;
    return {
      async arrayBuffer() {
        return bytes.slice().buffer;
      },
      async text() {
        return new TextDecoder().decode(bytes);
      },
    };
  }

  async createWritable(): Promise<{ write(data: Uint8Array | string): Promise<void>; close(): Promise<void> }> {
    const chunks: Uint8Array[] = [];
    const setContent = (content: Uint8Array) => {
      this.content = content;
    };
    return {
      async write(data: Uint8Array | string) {
        chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);
      },
      async close() {
        const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        setContent(merged);
      },
    };
  }
}

class FakeFileSystemDirectoryHandle implements FakeFileSystemEntry {
  readonly kind = 'directory' as const;
  private readonly entries = new Map<string, FakeFileSystemFileHandle | FakeFileSystemDirectoryHandle>();

  constructor(public readonly name: string) {}

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeFileSystemDirectoryHandle> {
    let entry = this.entries.get(name);
    if (!entry) {
      if (!options?.create) throw new Error(`NotFoundError: ${name}`);
      entry = new FakeFileSystemDirectoryHandle(name);
      this.entries.set(name, entry);
    }
    if (!(entry instanceof FakeFileSystemDirectoryHandle)) {
      throw new Error(`TypeMismatchError: ${name} is not a directory`);
    }
    return entry;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileSystemFileHandle> {
    let entry = this.entries.get(name);
    if (!entry) {
      if (!options?.create) throw new Error(`NotFoundError: ${name}`);
      entry = new FakeFileSystemFileHandle(name);
      this.entries.set(name, entry);
    }
    if (!(entry instanceof FakeFileSystemFileHandle)) {
      throw new Error(`TypeMismatchError: ${name} is not a file`);
    }
    return entry;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.has(name)) throw new Error(`NotFoundError: ${name}`);
    this.entries.delete(name);
  }
}

/** Install a fresh fake OPFS root (`navigator.storage.getDirectory()`) for a test. */
export function installFakeOPFS(): void {
  const root = new FakeFileSystemDirectoryHandle('');
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: async () => root,
    },
  });
}

class FakeCache {
  private readonly entries = new Map<string, Response>();

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const url = typeof request === 'string' ? request : (request as Request).url ?? String(request);
    this.entries.set(url, response.clone());
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const url = typeof request === 'string' ? request : (request as Request).url ?? String(request);
    const response = this.entries.get(url);
    return response ? response.clone() : undefined;
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    const url = typeof request === 'string' ? request : (request as Request).url ?? String(request);
    return this.entries.delete(url);
  }

  async keys(): Promise<Request[]> {
    return Array.from(this.entries.keys()).map(url => new Request(url));
  }
}

class FakeCacheStorage {
  private readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return cache;
  }
}

/** Install a fresh fake `caches` global (Cache Storage API) for a test. */
export function installFakeCacheStorage(): void {
  vi.stubGlobal('caches', new FakeCacheStorage());
}

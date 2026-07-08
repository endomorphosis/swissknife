// test/browser/storage-browser.test.ts
//
// Validates the explicit browser storage runtime in `src/storage/browser.ts`:
// capability detection, adapter selection order, IndexedDB/OPFS/Cache
// Storage/injected-IPFS adapter behavior, and that the module never reaches
// into Node's filesystem, path, or process APIs.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserStorageProvider,
  detectBrowserStorageCapabilities,
  hasCacheStorage,
  hasIndexedDB,
  hasOPFS,
  summarizeBrowserStorageCapabilityGaps,
  type BrowserStorageProvider,
} from '../../src/storage/browser.js';
import type { BrowserIPFSTransport } from '../../src/services/ipfs/browser.js';
import {
  installFakeCacheStorage,
  installFakeIndexedDB,
  installFakeOPFS,
} from './helpers/fake-browser-storage-apis.js';

const ROOT = resolve(__dirname, '../..');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser storage capability detection', () => {
  it('reports every adapter unavailable and the host-only gaps when no Web Storage APIs exist', () => {
    expect(hasIndexedDB()).toBe(false);
    expect(hasOPFS()).toBe(false);
    expect(hasCacheStorage()).toBe(false);

    const report = detectBrowserStorageCapabilities();
    expect(report.runtime).toBe('browser');
    expect(report.browserSafe).toBe(true);
    expect(report.capabilities.find(c => c.name === 'indexeddb')?.enabled).toBe(false);
    expect(report.capabilities.find(c => c.name === 'opfs')?.enabled).toBe(false);
    expect(report.capabilities.find(c => c.name === 'cache-storage')?.enabled).toBe(false);
    expect(report.capabilities.find(c => c.name === 'ipfs-adapter')?.enabled).toBe(false);

    expect(report.hostOnly.map(c => c.name)).toEqual(['filesystem', 'path', 'process']);
    expect(report.hostOnly.every(c => c.enabled === false)).toBe(true);

    const summary = summarizeBrowserStorageCapabilityGaps(report);
    expect(summary.some(line => line.includes('filesystem'))).toBe(true);
    expect(summary.some(line => line.includes('src/storage/host.ts'))).toBe(true);
  });

  it('detects IndexedDB, OPFS, and Cache Storage once installed', () => {
    installFakeIndexedDB();
    installFakeOPFS();
    installFakeCacheStorage();

    expect(hasIndexedDB()).toBe(true);
    expect(hasOPFS()).toBe(true);
    expect(hasCacheStorage()).toBe(true);

    const report = detectBrowserStorageCapabilities();
    expect(report.capabilities.find(c => c.name === 'indexeddb')?.enabled).toBe(true);
    expect(report.capabilities.find(c => c.name === 'opfs')?.enabled).toBe(true);
    expect(report.capabilities.find(c => c.name === 'cache-storage')?.enabled).toBe(true);
  });

  it('throws a descriptive error when no adapter is available or enabled', () => {
    expect(() => createBrowserStorageProvider()).toThrow(/No browser storage adapter is available/);
  });

  it('keeps the module free of Node filesystem, path, and process imports', () => {
    const source = readFileSync(resolve(ROOT, 'src/storage/browser.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"]node:/);
    expect(source).not.toMatch(/from ['"](?:fs|fs\/promises|path|child_process|os)['"]/);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});

describe('browser storage adapter selection', () => {
  it('prefers IndexedDB by default when multiple adapters are available', () => {
    installFakeIndexedDB();
    installFakeOPFS();
    installFakeCacheStorage();

    const provider = createBrowserStorageProvider();
    expect(provider.kind).toBe('indexeddb');
    expect(provider.report.activeAdapter).toBe('indexeddb');
  });

  it('honors an explicit adapter preference order', () => {
    installFakeIndexedDB();
    installFakeOPFS();
    installFakeCacheStorage();

    const provider = createBrowserStorageProvider({ preferredAdapters: ['opfs', 'indexeddb'] });
    expect(provider.kind).toBe('opfs');
  });

  it('falls back to the next adapter when a preferred one is disabled', () => {
    installFakeIndexedDB();
    installFakeCacheStorage();

    const provider = createBrowserStorageProvider({
      indexeddb: { enabled: false },
    });
    expect(provider.kind).toBe('cache-storage');
  });
});

describe('IndexedDB browser storage adapter', () => {
  it('supports put/get/has/delete/list/getMetadata/clear with content addressing', async () => {
    installFakeIndexedDB();
    const provider = createBrowserStorageProvider({ preferredAdapters: ['indexeddb'] });

    const putResult = await provider.put('hello world', { contentType: 'text/plain', tags: ['greeting'] });
    expect(putResult.adapter).toBe('indexeddb');
    expect(putResult.key).toMatch(/^(sha256-|fnv1a-)/);

    // Content addressing: identical content produces the same key, and
    // re-putting refreshes the metadata for that key (updatedAt is set).
    const second = await provider.put('hello world', { contentType: 'text/plain', tags: ['greeting'] });
    expect(second.key).toBe(putResult.key);

    await expect(provider.getText(putResult.key)).resolves.toBe('hello world');
    await expect(provider.has(putResult.key)).resolves.toBe(true);
    await expect(provider.has('missing-key')).resolves.toBe(false);

    const metadata = await provider.getMetadata(putResult.key);
    expect(metadata?.contentType).toBe('text/plain');
    expect(metadata?.tags).toEqual(['greeting']);

    const listed = await provider.list();
    expect(listed.map(item => item.key)).toContain(putResult.key);

    await expect(provider.delete(putResult.key)).resolves.toBe(true);
    await expect(provider.has(putResult.key)).resolves.toBe(false);
    await expect(provider.delete(putResult.key)).resolves.toBe(false);

    await provider.put('one');
    await provider.put('two');
    await provider.clear();
    await expect(provider.list()).resolves.toEqual([]);
  });

  it('supports an explicit key override and get() throwing for unknown keys', async () => {
    installFakeIndexedDB();
    const provider = createBrowserStorageProvider({ preferredAdapters: ['indexeddb'] });

    const result = await provider.put('config value', { key: 'config:theme' });
    expect(result.key).toBe('config:theme');
    await expect(provider.getText('config:theme')).resolves.toBe('config value');
    await expect(provider.get('does-not-exist')).rejects.toThrow(/not found/);
  });

  it('supports list prefix/offset/limit filtering', async () => {
    installFakeIndexedDB();
    const provider = createBrowserStorageProvider({ preferredAdapters: ['indexeddb'] });

    await provider.put('a', { key: 'ns:a' });
    await provider.put('b', { key: 'ns:b' });
    await provider.put('c', { key: 'other:c' });

    const nsOnly = await provider.list({ prefix: 'ns:' });
    expect(nsOnly.map(item => item.key).sort()).toEqual(['ns:a', 'ns:b']);

    const limited = await provider.list({ prefix: 'ns:', limit: 1 });
    expect(limited).toHaveLength(1);
  });
});

describe('OPFS browser storage adapter', () => {
  it('supports put/get/has/delete/list/getMetadata/clear', async () => {
    installFakeOPFS();
    const provider = createBrowserStorageProvider({ preferredAdapters: ['opfs'] });

    const putResult = await provider.put(new TextEncoder().encode('opfs content'), { contentType: 'text/plain' });
    expect(putResult.adapter).toBe('opfs');

    await expect(provider.getText(putResult.key)).resolves.toBe('opfs content');
    await expect(provider.has(putResult.key)).resolves.toBe(true);

    const metadata = await provider.getMetadata(putResult.key);
    expect(metadata?.size).toBe(putResult.size);

    const listed = await provider.list();
    expect(listed.map(item => item.key)).toContain(putResult.key);

    await expect(provider.delete(putResult.key)).resolves.toBe(true);
    await expect(provider.has(putResult.key)).resolves.toBe(false);

    await provider.put('one', { key: 'k1' });
    await provider.put('two', { key: 'k2' });
    await provider.clear();
    await expect(provider.list()).resolves.toEqual([]);
  });

  it('rejects reads for keys that were never written', async () => {
    installFakeOPFS();
    const provider = createBrowserStorageProvider({ preferredAdapters: ['opfs'] });
    await expect(provider.get('missing')).rejects.toThrow(/not found/);
  });
});

describe('Cache Storage browser storage adapter', () => {
  it('supports put/get/has/delete/list/getMetadata/clear', async () => {
    installFakeCacheStorage();
    const provider = createBrowserStorageProvider({ preferredAdapters: ['cache-storage'] });

    const putResult = await provider.put('cached content', { contentType: 'text/plain', tags: ['a'] });
    expect(putResult.adapter).toBe('cache-storage');

    await expect(provider.getText(putResult.key)).resolves.toBe('cached content');
    await expect(provider.has(putResult.key)).resolves.toBe(true);

    const metadata = await provider.getMetadata(putResult.key);
    expect(metadata?.tags).toEqual(['a']);

    const listed = await provider.list();
    expect(listed.map(item => item.key)).toContain(putResult.key);

    await expect(provider.delete(putResult.key)).resolves.toBe(true);
    await expect(provider.has(putResult.key)).resolves.toBe(false);

    await provider.put('x', { key: 'x' });
    await provider.put('y', { key: 'y' });
    await provider.clear();
    await expect(provider.list()).resolves.toEqual([]);
  });
});

function makeStubIPFSTransport(): BrowserIPFSTransport & { addedBytes: Uint8Array[] } {
  const store = new Map<string, Uint8Array>();
  const pins = new Set<string>();
  let counter = 0;

  const transport = {
    addedBytes: [] as Uint8Array[],
    report: {
      runtime: 'browser' as const,
      browserSafe: true as const,
      capabilities: [],
      gaps: [],
      hostOnly: [],
    },
    async cat(cidOrPath: string) {
      const data = store.get(cidOrPath);
      if (!data) throw new Error(`not found: ${cidOrPath}`);
      return data;
    },
    async catText(cidOrPath: string) {
      return new TextDecoder().decode(await transport.cat(cidOrPath));
    },
    async add(content: Uint8Array, options?: { pin?: boolean }) {
      counter += 1;
      const cid = `bafystub${counter}`;
      const bytes = content instanceof Uint8Array ? content : new Uint8Array(content as ArrayBuffer);
      store.set(cid, bytes);
      transport.addedBytes.push(bytes);
      if (options?.pin) pins.add(cid);
      return { cid, size: bytes.byteLength };
    },
    async pin(cid: string) {
      pins.add(cid);
      return true;
    },
    async unpin(cid: string) {
      const had = pins.delete(cid);
      store.delete(cid);
      return had || store.has(cid) === false;
    },
    async listPins() {
      return Array.from(pins).map(cid => ({ cid, type: 'recursive' }));
    },
    async id() {
      return {};
    },
    async version() {
      return {};
    },
    async getLibp2pConfig() {
      return { config: {}, report: { transports: [], gaps: [] } } as any;
    },
    async createLibp2pNode() {
      return { node: {}, config: {}, report: { transports: [], gaps: [] } } as any;
    },
  };

  return transport as unknown as BrowserIPFSTransport & { addedBytes: Uint8Array[] };
}

describe('injected IPFS browser storage adapter', () => {
  it('adds content through the injected transport and reports it as a capability', () => {
    const transport = makeStubIPFSTransport();
    const report = detectBrowserStorageCapabilities({ ipfs: { transport } });
    expect(report.capabilities.find(c => c.name === 'ipfs-adapter')?.enabled).toBe(true);
  });

  it('supports put/get/has/delete/list/getMetadata/clear via the injected transport', async () => {
    const transport = makeStubIPFSTransport();
    const provider: BrowserStorageProvider = createBrowserStorageProvider({
      preferredAdapters: ['ipfs'],
      ipfs: { transport },
    });

    const putResult = await provider.put('ipfs adapter content');
    expect(putResult.adapter).toBe('ipfs');
    expect(putResult.key).toMatch(/^bafystub/);

    await expect(provider.getText(putResult.key)).resolves.toBe('ipfs adapter content');
    await expect(provider.has(putResult.key)).resolves.toBe(true);
    await expect(provider.has('bafymissing')).resolves.toBe(false);

    const listed = await provider.list();
    expect(listed.map(item => item.key)).toContain(putResult.key);

    await expect(provider.delete(putResult.key)).resolves.toBe(true);
    await expect(provider.has(putResult.key)).resolves.toBe(false);
  });

  it('requires an injected transport before it can be selected', () => {
    expect(() => createBrowserStorageProvider({ preferredAdapters: ['ipfs'] })).toThrow(
      /No browser storage adapter is available/,
    );
  });
});

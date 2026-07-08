// test/browser/storage-host.test.ts
//
// Validates the explicit host storage runtime in `src/storage/host.ts`: it
// is filesystem-backed, reports itself as host-only/not browser-safe, and
// mirrors the same content-addressed CRUD shape as `src/storage/browser.ts`
// so callers can pick an implementation per runtime.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createHostStorageProvider,
  detectHostStorageCapabilities,
  summarizeHostStorageCapabilityGaps,
  type HostStorageProvider,
} from '../../src/storage/host.js';

let tempDir: string;
let provider: HostStorageProvider;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'swissknife-storage-host-'));
  provider = createHostStorageProvider({ baseDir: tempDir });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('host storage capability report', () => {
  it('reports itself as host-only and not browser-safe', () => {
    const report = detectHostStorageCapabilities();
    expect(report.runtime).toBe('host');
    expect(report.browserSafe).toBe(false);
    expect(report.activeAdapter).toBe('filesystem');
    expect(report.capabilities.every(c => c.enabled)).toBe(true);
  });

  it('lists IndexedDB, OPFS, and Cache Storage as browser-only gaps', () => {
    const report = detectHostStorageCapabilities();
    const names = report.browserOnly.map(c => c.name).sort();
    expect(names).toEqual(['cache-storage', 'indexeddb', 'ipfs-adapter', 'opfs']);
    expect(report.browserOnly.every(c => c.enabled === false)).toBe(true);

    const summary = summarizeHostStorageCapabilityGaps(report);
    expect(summary.some(line => line.includes('src/storage/browser.ts'))).toBe(true);
  });
});

describe('filesystem host storage provider', () => {
  it('supports put/get/has/delete/list/getMetadata/clear with content addressing', async () => {
    const putResult = await provider.put('hello host', { contentType: 'text/plain', tags: ['greeting'] });
    expect(putResult.adapter).toBe('filesystem');
    expect(putResult.key).toMatch(/^sha256-/);

    const second = await provider.put('hello host', { contentType: 'text/plain', tags: ['greeting'] });
    expect(second.key).toBe(putResult.key);

    await expect(provider.getText(putResult.key)).resolves.toBe('hello host');
    await expect(provider.has(putResult.key)).resolves.toBe(true);
    await expect(provider.has('missing')).resolves.toBe(false);

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

  it('supports an explicit key override, buffers, and unknown-key errors', async () => {
    const result = await provider.put(Buffer.from('config value'), { key: 'config:theme' });
    expect(result.key).toBe('config:theme');
    await expect(provider.getText('config:theme')).resolves.toBe('config value');
    await expect(provider.get('does-not-exist')).rejects.toThrow(/not found/);
  });

  it('resolves an absolute filesystem path for a key under the configured base directory', async () => {
    const result = await provider.put('path check', { key: 'path-check' });
    const path = provider.getPath(result.key);
    expect(path.startsWith(tempDir)).toBe(true);
    expect(path).toContain('path-check');
  });

  it('supports list prefix/offset/limit filtering', async () => {
    await provider.put('a', { key: 'ns:a' });
    await provider.put('b', { key: 'ns:b' });
    await provider.put('c', { key: 'other:c' });

    const nsOnly = await provider.list({ prefix: 'ns:' });
    expect(nsOnly.map(item => item.key).sort()).toEqual(['ns:a', 'ns:b']);

    const limited = await provider.list({ prefix: 'ns:', limit: 1 });
    expect(limited).toHaveLength(1);
  });
});

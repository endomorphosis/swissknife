// test/browser/workers-browser.test.ts
//
// Validates the explicit browser worker runtime in `src/workers/browser.ts`:
// capability detection, single-worker task execution, transferable object
// forwarding, pool round-robin/queueing behavior, error handling, and that
// the module never reaches into Node's worker_threads, child_process, fs, or
// path APIs.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserWorkerClient,
  BrowserWorkerPool,
  BROWSER_WORKER_SCRIPTS,
  assertBrowserWorkerRuntime,
  createBrowserWorkerPool,
  detectBrowserWorkerCapabilities,
  hasModuleWorkerSupport,
  hasSharedWorkerSupport,
  hasTransferableObjectSupport,
  hasWebWorkerSupport,
  summarizeBrowserWorkerCapabilityGaps,
} from '../../src/workers/browser.js';
import { installFakeWorker, uninstallFakeWorker } from './helpers/fake-browser-worker-apis.js';

const ROOT = resolve(__dirname, '../..');

afterEach(() => {
  uninstallFakeWorker();
  vi.unstubAllGlobals();
});

describe('browser worker capability detection', () => {
  it('reports every adapter unavailable and the host-only gaps when no Worker API exists', () => {
    expect(hasWebWorkerSupport()).toBe(false);
    expect(hasSharedWorkerSupport()).toBe(false);
    expect(hasModuleWorkerSupport()).toBe(false);

    const report = detectBrowserWorkerCapabilities();
    expect(report.runtime).toBe('browser');
    expect(report.browserSafe).toBe(true);
    expect(report.capabilities.find(c => c.name === 'worker')?.enabled).toBe(false);
    expect(report.capabilities.find(c => c.name === 'shared-worker')?.enabled).toBe(false);
    expect(report.capabilities.find(c => c.name === 'module-worker')?.enabled).toBe(false);

    expect(report.hostOnly.map(c => c.name)).toEqual(['worker-threads', 'child-process', 'filesystem']);
    expect(report.hostOnly.every(c => c.enabled === false)).toBe(true);

    const summary = summarizeBrowserWorkerCapabilityGaps(report);
    expect(summary.some(line => line.includes('worker'))).toBe(true);
    expect(summary.some(line => line.includes('src/workers/host.ts'))).toBe(true);
  });

  it('detects Worker and SharedWorker once installed', () => {
    installFakeWorker(() => ({ result: 'ok' }));
    vi.stubGlobal('SharedWorker', function SharedWorker() {} as unknown as typeof globalThis.SharedWorker);

    expect(hasWebWorkerSupport()).toBe(true);
    expect(hasSharedWorkerSupport()).toBe(true);

    const report = detectBrowserWorkerCapabilities();
    expect(report.capabilities.find(c => c.name === 'worker')?.enabled).toBe(true);
    expect(report.capabilities.find(c => c.name === 'shared-worker')?.enabled).toBe(true);
  });

  it('reports transferable object support based on ArrayBuffer/MessageChannel availability', () => {
    expect(typeof hasTransferableObjectSupport()).toBe('boolean');
  });

  it('throws a descriptive error from assertBrowserWorkerRuntime when Worker is unavailable', () => {
    expect(() => assertBrowserWorkerRuntime()).toThrow(/Web Worker API/);
  });

  it('keeps the module free of Node worker_threads, child_process, fs, and path imports', () => {
    const source = readFileSync(resolve(ROOT, 'src/workers/browser.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"]node:/);
    expect(source).not.toMatch(/from ['"](?:worker_threads|child_process|fs|fs\/promises|path|os)['"]/);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});

describe('BrowserWorkerClient', () => {
  it('executes a task and resolves with the worker result', async () => {
    installFakeWorker(message => ({ result: { echoed: message.data } }));

    const client = new BrowserWorkerClient({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute });
    expect(client.isIdle()).toBe(true);

    const result = await client.executeTask<{ echoed: unknown }>('echo', { value: 42 });
    expect(result).toEqual({ echoed: { value: 42 } });
    expect(client.isIdle()).toBe(true);

    client.terminate();
    expect(client.getStatus()).toBe('terminated');
  });

  it('rejects the task promise when the worker responds with an error', async () => {
    installFakeWorker(() => ({ error: 'boom' }));

    const client = new BrowserWorkerClient({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute });
    await expect(client.executeTask('fail', {})).rejects.toThrow('boom');
  });

  it('forwards a transfer list to postMessage', async () => {
    installFakeWorker(() => ({ result: 'ok' }));
    const client = new BrowserWorkerClient({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute });

    const buffer = new ArrayBuffer(8);
    await client.executeTask('transfer', { buffer }, { transfer: [buffer] });

    const instance = (await import('./helpers/fake-browser-worker-apis.js')).FakeWorker.instances[0];
    expect(instance.posted.length).toBe(1);
  });

  it('rejects pending tasks when the worker errors', async () => {
    installFakeWorker(() => new Promise(() => {})); // never resolves
    const client = new BrowserWorkerClient({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute });

    const pending = client.executeTask('slow', {});
    const instance = (await import('./helpers/fake-browser-worker-apis.js')).FakeWorker.instances[0];
    instance.simulateError('worker crashed');

    await expect(pending).rejects.toThrow('worker crashed');
    expect(client.getStatus()).toBe('error');
  });

  it('rejects a task after the configured timeout', async () => {
    installFakeWorker(() => new Promise(() => {}));
    const client = new BrowserWorkerClient({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute });

    await expect(client.executeTask('slow', {}, { timeoutMs: 5 })).rejects.toThrow(/timed out/);
  });

  it('rejects new tasks after termination', () => {
    installFakeWorker(() => ({ result: 'ok' }));
    const client = new BrowserWorkerClient({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute });
    client.terminate();
    expect(() => client.executeTask('echo', {})).rejects.toThrow(/terminated/);
  });
});

describe('BrowserWorkerPool', () => {
  it('creates the requested number of workers and reports pool stats', () => {
    installFakeWorker(() => ({ result: 'ok' }));
    const pool = createBrowserWorkerPool({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute, size: 3 });

    expect(pool.getWorkerCount()).toBe(3);
    expect(pool.getIdleWorkerCount()).toBe(3);
    expect(pool.getStats()).toEqual({ runtime: 'browser', totalWorkers: 3, idleWorkers: 3, queueLength: 0 });

    pool.terminate();
  });

  it('dispatches tasks to idle workers and queues overflow work', async () => {
    let inflight = 0;
    let maxInflight = 0;
    installFakeWorker(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inflight -= 1;
      return { result: 'done' };
    });

    const pool = new BrowserWorkerPool({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute, size: 2 });
    const results = await Promise.all([
      pool.executeTask('work', 1),
      pool.executeTask('work', 2),
      pool.executeTask('work', 3),
      pool.executeTask('work', 4),
    ]);

    expect(results).toEqual(['done', 'done', 'done', 'done']);
    expect(maxInflight).toBeLessThanOrEqual(2);

    pool.terminate();
  });

  it('rejects queued and future tasks once terminated', async () => {
    installFakeWorker(() => new Promise(() => {}));
    const pool = new BrowserWorkerPool({ scriptUrl: BROWSER_WORKER_SCRIPTS.compute, size: 1 });

    const queued = pool.executeTask('slow', {});
    pool.terminate();

    await expect(queued).rejects.toThrow(/terminated/);
    await expect(pool.executeTask('slow', {})).rejects.toThrow(/terminated/);
  });
});

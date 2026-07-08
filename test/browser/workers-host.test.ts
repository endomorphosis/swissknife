// test/browser/workers-host.test.ts
//
// Validates the explicit host worker runtime in `src/workers/host.ts`: it
// reports itself as host-only/not browser-safe, re-exports the supported
// in-process worker pool, and provides a node:child_process subprocess
// worker runtime that verifies its script exists on the host filesystem
// before forking.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HostSubprocessWorker,
  NodeThreadWorkerPool,
  NodeWorkerThreadRuntime,
  assertHostWorkerRuntime,
  assertSubprocessScriptExists,
  createHostSubprocessWorker,
  createHostWorkerPool,
  detectHostWorkerCapabilities,
  hasHostFilesystemSupport,
  hasSubprocessSupport,
  hasWorkerThreadsSupport,
  summarizeHostWorkerCapabilityGaps,
} from '../../src/workers/host.js';

describe('host worker capability report', () => {
  it('reports itself as host-only and not browser-safe', () => {
    const report = detectHostWorkerCapabilities();
    expect(report.runtime).toBe('host');
    expect(report.browserSafe).toBe(false);
    expect(report.capabilities.find(c => c.name === 'worker-threads')?.enabled).toBe(true);
    expect(report.capabilities.find(c => c.name === 'subprocess')?.enabled).toBe(true);
    expect(report.capabilities.find(c => c.name === 'filesystem')?.enabled).toBe(true);
  });

  it('lists worker and shared-worker as browser-only gaps', () => {
    const report = detectHostWorkerCapabilities();
    const names = report.browserOnly.map(c => c.name).sort();
    expect(names).toEqual(['shared-worker', 'worker']);
    expect(report.browserOnly.every(c => c.enabled === false)).toBe(true);

    const summary = summarizeHostWorkerCapabilityGaps(report);
    expect(summary.some(line => line.includes('src/workers/browser.ts'))).toBe(true);
  });

  it('confirms capability helper functions agree with the report', () => {
    expect(hasWorkerThreadsSupport()).toBe(true);
    expect(hasSubprocessSupport()).toBe(true);
    expect(hasHostFilesystemSupport()).toBe(true);
  });

  it('does not throw from assertHostWorkerRuntime under Node.js', () => {
    expect(() => assertHostWorkerRuntime()).not.toThrow();
  });
});

describe('in-process worker pool re-exports', () => {
  it('exposes the worker_threads-free pool and worker thread runtime', () => {
    expect(typeof NodeThreadWorkerPool).toBe('function');
    expect(typeof NodeWorkerThreadRuntime).toBe('function');
    expect(typeof createHostWorkerPool).toBe('function');

    const pool = createHostWorkerPool();
    expect(pool).toBeInstanceOf(NodeThreadWorkerPool);
  });
});

describe('HostSubprocessWorker', () => {
  let tempDir: string;
  let scriptPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'swissknife-workers-host-'));
    scriptPath = join(tempDir, 'echo-worker.cjs');
    await writeFile(
      scriptPath,
      `
      process.on('message', (message) => {
        if (!message || message.type !== 'task') return;
        if (message.taskType === 'fail') {
          process.send({ type: 'response', taskId: message.taskId, error: 'boom' });
          return;
        }
        process.send({ type: 'response', taskId: message.taskId, result: { echoed: message.data } });
      });
      `,
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('confirms the worker script exists on the host filesystem before forking', async () => {
    const absolutePath = await assertSubprocessScriptExists(scriptPath);
    expect(absolutePath).toContain('echo-worker.cjs');

    await expect(assertSubprocessScriptExists(join(tempDir, 'does-not-exist.cjs'))).rejects.toThrow();
  });

  it('forks a subprocess, executes a task, and returns the result', async () => {
    const worker = createHostSubprocessWorker({ modulePath: scriptPath, taskTimeoutMs: 10000 });
    expect(worker).toBeInstanceOf(HostSubprocessWorker);

    const result = await worker.executeTask<{ echoed: unknown }>('echo', { value: 7 });
    expect(result).toEqual({ echoed: { value: 7 } });
    expect(worker.getStatus()).toBe('idle');

    await worker.terminate();
    expect(worker.getStatus()).toBe('terminated');
  }, 20000);

  it('rejects the task promise when the subprocess reports an error', async () => {
    const worker = createHostSubprocessWorker({ modulePath: scriptPath, taskTimeoutMs: 10000 });
    await expect(worker.executeTask('fail', {})).rejects.toThrow('boom');
    await worker.terminate();
  }, 20000);

  it('rejects when the worker script does not exist', async () => {
    const worker = createHostSubprocessWorker({ modulePath: join(tempDir, 'missing.cjs') });
    await expect(worker.executeTask('echo', {})).rejects.toThrow();
  });
});

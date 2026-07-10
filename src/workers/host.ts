// src/workers/host.ts
//
// Explicit host worker runtime for SwissKnife.
//
// This module is the host-only counterpart to `./browser.ts`. Node's
// `worker_threads`, `child_process` subprocess execution, and filesystem
// access used to resolve worker scripts belong here and must never be
// imported from browser bundles. Anything reachable from a browser
// entrypoint must go through `./browser.ts`'s Web Worker-based pool instead.
//
// Note: several files under `src/workers` (`pool.ts`, `thread.ts`,
// `worker.ts`, `pool/worker-pool.ts`, `execution/worker-script.js`) are
// private, legacy implementation details per `src/module-ownership.json` and
// are not re-exported here. This entrypoint re-exports the supported
// in-process `worker_threads`-free pool (`worker-pool.ts` + `worker-thread.ts`,
// which actually run inside a `worker_threads.Worker`-free event loop) as the
// canonical in-process engine, and adds a new subprocess worker runtime built
// directly on `node:child_process` so isolated, crash-resilient task
// execution does not require sharing a process with the caller.

import { access, constants as fsConstants } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { Worker as NodeWorkerThread } from 'node:worker_threads';
import type {
  HostSubprocessInboundMessage,
  HostSubprocessTaskMessage,
  HostWorkerCapabilityGap,
  HostWorkerCapabilityStatus,
  HostWorkerRuntimeReport,
} from '../shared/service-contracts/index.js';

export {
  WorkerPool as NodeThreadWorkerPool,
  type WorkerPoolOptions as NodeThreadWorkerPoolOptions,
} from './worker-pool.js';
export {
  WorkerThread as NodeWorkerThreadRuntime,
  WorkerStatus as NodeWorkerThreadStatus,
  type WorkerTask as NodeWorkerThreadTask,
  type WorkerResult as NodeWorkerThreadResult,
  type WorkerThreadOptions as NodeWorkerThreadRuntimeOptions,
  type WorkerTaskHandler as NodeWorkerThreadTaskHandler,
} from './worker-thread.js';

import { WorkerPool as NodeThreadWorkerPoolClass, type WorkerPoolOptions as NodeThreadWorkerPoolOptionsType } from './worker-pool.js';

export type {
  HostSubprocessInboundMessage,
  HostSubprocessResponseMessage,
  HostSubprocessTaskMessage,
  HostWorkerAdapterKind,
  HostWorkerCapabilityGap,
  HostWorkerCapabilityName,
  HostWorkerCapabilityStatus,
  HostWorkerRuntimeReport,
} from '../shared/service-contracts/index.js';

/* -------------------------------------------------------------------------
 * Capability detection
 * ---------------------------------------------------------------------- */

export function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node';
}

export function hasWorkerThreadsSupport(): boolean {
  return isNodeRuntime() && typeof NodeWorkerThread === 'function';
}

export function hasSubprocessSupport(): boolean {
  return isNodeRuntime() && typeof fork === 'function';
}

export function hasHostFilesystemSupport(): boolean {
  return isNodeRuntime() && typeof access === 'function';
}

export function hasSharedArrayBufferSupport(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

export function detectHostWorkerCapabilities(): HostWorkerRuntimeReport {
  const workerThreadsSupported = hasWorkerThreadsSupport();
  const subprocessSupported = hasSubprocessSupport();
  const filesystemSupported = hasHostFilesystemSupport();
  const sharedArrayBufferSupported = hasSharedArrayBufferSupport();

  const capabilities: HostWorkerCapabilityStatus[] = [
    {
      name: 'worker-threads',
      adapter: 'worker-threads',
      supported: workerThreadsSupported,
      enabled: workerThreadsSupported,
      reason: workerThreadsSupported ? undefined : 'node:worker_threads is only available in a Node.js process.',
    },
    {
      name: 'subprocess',
      adapter: 'subprocess',
      supported: subprocessSupported,
      enabled: subprocessSupported,
      reason: subprocessSupported ? undefined : 'node:child_process.fork is only available in a Node.js process.',
    },
    {
      name: 'filesystem',
      adapter: 'subprocess',
      supported: filesystemSupported,
      enabled: filesystemSupported,
      reason: filesystemSupported ? undefined : 'node:fs/promises is only available in a Node.js process.',
    },
    {
      name: 'shared-array-buffer',
      adapter: 'worker-threads',
      supported: sharedArrayBufferSupported,
      enabled: sharedArrayBufferSupported,
      reason: sharedArrayBufferSupported ? undefined : 'SharedArrayBuffer is not available in this runtime.',
    },
  ];

  const browserOnly: HostWorkerCapabilityStatus[] = [
    {
      name: 'worker',
      adapter: 'browser-only',
      supported: false,
      enabled: false,
      reason: 'The Web Worker API is only available through src/workers/browser.ts in a browser context.',
    },
    {
      name: 'shared-worker',
      adapter: 'browser-only',
      supported: false,
      enabled: false,
      reason: 'SharedWorker is only available through src/workers/browser.ts in a browser context.',
    },
  ];

  const gaps: HostWorkerCapabilityGap[] = capabilities
    .filter(capability => !capability.enabled)
    .map(capability => ({
      name: capability.name,
      adapter: capability.adapter,
      reason: capability.reason ?? `${capability.name} capability is unavailable in this runtime.`,
    }));

  return {
    runtime: 'host',
    browserSafe: false,
    capabilities,
    gaps,
    browserOnly,
  };
}

export function summarizeHostWorkerCapabilityGaps(report: HostWorkerRuntimeReport): string[] {
  const lines = report.gaps.map(gap => `- ${gap.name}: ${gap.reason}`);
  if (report.browserOnly.length > 0) {
    lines.push('- worker/shared-worker: Web Worker execution is browser-only; see src/workers/browser.ts.');
  }
  return lines;
}

export function assertHostWorkerRuntime(): void {
  if (!isNodeRuntime()) {
    throw new Error('SwissKnife host worker APIs require a Node.js process runtime.');
  }
}

/* -------------------------------------------------------------------------
 * In-process worker_threads-free pool (recommended default)
 *
 * `NodeThreadWorkerPool` (re-exported above from `./worker-pool.js`) runs
 * tasks on an in-process `WorkerThread` abstraction. It does not spawn a
 * `node:worker_threads` OS thread per worker, which keeps the common case
 * cheap; use `HostSubprocessWorker` below when true process isolation (a
 * crash boundary, a separate memory space, or a distinct `node:worker_threads`
 * thread) is required.
 * ---------------------------------------------------------------------- */

export function createHostWorkerPool(options: NodeThreadWorkerPoolOptionsType = {}): NodeThreadWorkerPoolClass {
  return NodeThreadWorkerPoolClass.getInstance(options);
}

export function getHostWorkerPool(): NodeThreadWorkerPoolClass {
  return NodeThreadWorkerPoolClass.getInstance();
}

/* -------------------------------------------------------------------------
 * Subprocess worker runtime (node:child_process)
 *
 * Executes tasks in a fully isolated Node.js child process via
 * `child_process.fork`. Communication happens exclusively through the
 * process IPC channel (`process.send` / `child.send`), never shared memory,
 * so payloads must be structured-cloneable.
 * ---------------------------------------------------------------------- */

export interface HostSubprocessWorkerOptions {
  /** Path to the Node.js script executed via `child_process.fork`. Must exist on the host filesystem. */
  modulePath: string;
  args?: string[];
  execArgv?: string[];
  env?: NodeJS.ProcessEnv;
  /** Milliseconds before a task promise rejects with a timeout error. */
  taskTimeoutMs?: number;
}

interface PendingHostSubprocessTask {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Verifies the worker script exists on the host filesystem before forking a
 * subprocess. This is the "filesystem" capability referenced by
 * `detectHostWorkerCapabilities()`.
 */
export async function assertSubprocessScriptExists(modulePath: string): Promise<string> {
  assertHostWorkerRuntime();
  const absolutePath = resolvePath(modulePath);
  await access(absolutePath, fsConstants.F_OK);
  return absolutePath;
}

let subprocessTaskCounter = 0;
function generateSubprocessTaskId(): string {
  subprocessTaskCounter += 1;
  return `subprocess-task-${Date.now()}-${subprocessTaskCounter}`;
}

/**
 * Runs task-shaped work in an isolated Node.js child process. Prefer this
 * over `NodeThreadWorkerPool` when a task must not share the caller's
 * process (native addon isolation, crash containment, or CPU-heavy
 * synchronous work that would otherwise block the event loop of an
 * in-process worker).
 */
export class HostSubprocessWorker {
  private child?: ChildProcess;
  private readonly pending = new Map<string, PendingHostSubprocessTask>();
  private status: 'idle' | 'busy' | 'error' | 'terminated' = 'terminated';

  constructor(private readonly options: HostSubprocessWorkerOptions) {
    assertHostWorkerRuntime();
  }

  getStatus(): 'idle' | 'busy' | 'error' | 'terminated' {
    return this.status;
  }

  isRunning(): boolean {
    return this.child !== undefined && this.status !== 'terminated';
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;

    const absoluteModulePath = await assertSubprocessScriptExists(this.options.modulePath);

    const forkOptions: ForkOptions = {
      execArgv: this.options.execArgv,
      env: this.options.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    };

    this.child = fork(absoluteModulePath, this.options.args ?? [], forkOptions);
    this.status = 'idle';

    this.child.on('message', (message: HostSubprocessInboundMessage) => {
      if (!message || message.type !== 'response') return;
      const pending = this.pending.get(message.taskId);
      if (!pending) return;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      this.pending.delete(message.taskId);
      this.status = 'idle';
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.result);
      }
    });

    this.child.on('error', error => {
      this.status = 'error';
      this.rejectAllPending(error instanceof Error ? error : new Error(String(error)));
    });

    this.child.on('exit', code => {
      this.status = 'terminated';
      if (code !== 0 && code !== null) {
        this.rejectAllPending(new Error(`Subprocess worker exited unexpectedly with code ${code}`));
      }
      this.child = undefined;
    });
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async executeTask<T = unknown>(taskType: string, data: unknown, timeoutMs?: number): Promise<T> {
    if (!this.isRunning()) {
      await this.start();
    }
    if (!this.child) {
      throw new Error('Subprocess worker failed to start.');
    }

    const taskId = generateSubprocessTaskId();
    this.status = 'busy';
    const message: HostSubprocessTaskMessage = { type: 'task', taskId, taskType, data };
    const effectiveTimeoutMs = timeoutMs ?? this.options.taskTimeoutMs;

    const resultPromise = new Promise<T>((resolve, reject) => {
      const pending: PendingHostSubprocessTask = {
        resolve: resolve as (result: unknown) => void,
        reject,
      };
      if (effectiveTimeoutMs !== undefined) {
        pending.timer = setTimeout(() => {
          this.pending.delete(taskId);
          reject(new Error(`Subprocess worker task ${taskId} timed out after ${effectiveTimeoutMs}ms`));
        }, effectiveTimeoutMs);
      }
      this.pending.set(taskId, pending);
    });

    this.child.send(message);

    return resultPromise;
  }

  async terminate(): Promise<void> {
    if (!this.child) {
      this.status = 'terminated';
      return;
    }
    const child = this.child;
    await new Promise<void>(resolve => {
      child.once('exit', () => resolve());
      child.kill();
    });
    this.rejectAllPending(new Error('Subprocess worker terminated'));
    this.status = 'terminated';
    this.child = undefined;
  }
}

export function createHostSubprocessWorker(options: HostSubprocessWorkerOptions): HostSubprocessWorker {
  return new HostSubprocessWorker(options);
}

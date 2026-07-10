// src/workers/browser.ts
//
// Explicit browser worker runtime for SwissKnife.
//
// Browser bundles must reach worker execution only through this module. It is
// built exclusively on browser-safe Web Worker APIs:
//   - `Worker` / `SharedWorker` construction
//   - `postMessage()` / `onmessage` / `addEventListener('message', ...)`
//   - Transferable objects (e.g. `ArrayBuffer`) passed as a `postMessage`
//     transfer list, never Node's `worker_threads` `workerData`/SharedArrayBuffer
//     handshake
//
// This module never imports Node's `worker_threads`, `child_process`, `fs`, or
// `path`. Those live behind `./host.ts`, which is host-only. See
// `src/module-ownership.json` for the enforced boundary.
//
// Note: the legacy Node worker_threads implementations under `src/workers`
// (`pool.ts`, `pool.js`, `thread.ts`, `worker.ts`, `worker-pool.ts`,
// `worker-thread.ts`, `pool/worker-pool.ts`, `execution/worker-script.js`) are
// private host-only implementation details per `src/module-ownership.json`
// and are re-exported only from `./host.ts`. Browser code must never import
// them directly.
import type {
  BrowserWorkerAdapterKind,
  BrowserWorkerCapabilityGap,
  BrowserWorkerCapabilityStatus,
  BrowserWorkerInboundMessage,
  BrowserWorkerRuntimeReport,
  BrowserWorkerTaskMessage,
  BrowserWorkerTaskOptions,
} from '../shared/service-contracts/index.js';

export type {
  BrowserWorkerAdapterKind,
  BrowserWorkerCapabilityGap,
  BrowserWorkerCapabilityName,
  BrowserWorkerCapabilityStatus,
  BrowserWorkerInboundMessage,
  BrowserWorkerOutboundMessage,
  BrowserWorkerReadyMessage,
  BrowserWorkerResponseMessage,
  BrowserWorkerRuntimeReport,
  BrowserWorkerStatusMessage,
  BrowserWorkerTaskMessage,
  BrowserWorkerTaskOptions,
} from '../shared/service-contracts/index.js';

/* -------------------------------------------------------------------------
 * Capability detection
 * ---------------------------------------------------------------------- */

/** True when the Web Worker API (`globalThis.Worker`) is available. */
export function hasWebWorkerSupport(): boolean {
  return typeof Worker !== 'undefined';
}

/** True when `SharedWorker` is available (not supported in every browser, notably some mobile browsers). */
export function hasSharedWorkerSupport(): boolean {
  return typeof SharedWorker !== 'undefined';
}

/**
 * Feature-detects `{ type: 'module' }` worker support using the standard
 * "getter trick": construct a throwaway worker from a `data:` URL and observe
 * whether the browser reads the `type` option while parsing worker options.
 * Safe to call only when `hasWebWorkerSupport()` is true.
 */
export function hasModuleWorkerSupport(): boolean {
  if (!hasWebWorkerSupport()) return false;

  let detectedModuleSupport = false;
  const probeOptions: WorkerOptions = {
    get type(): WorkerType {
      detectedModuleSupport = true;
      return 'module';
    },
  };

  try {
    const probeWorker = new Worker('data:,', probeOptions);
    probeWorker.terminate();
  } catch {
    // Some environments throw constructing a `data:` worker; the getter is
    // still invoked before construction fails, so `detectedModuleSupport`
    // remains a valid signal.
  }

  return detectedModuleSupport;
}

/** True when `postMessage` transfer lists (transferable objects) are supported. */
export function hasTransferableObjectSupport(): boolean {
  return typeof ArrayBuffer !== 'undefined' && typeof MessageChannel !== 'undefined';
}

export function detectBrowserWorkerCapabilities(): BrowserWorkerRuntimeReport {
  const workerSupported = hasWebWorkerSupport();
  const sharedWorkerSupported = hasSharedWorkerSupport();
  const moduleWorkerSupported = hasModuleWorkerSupport();
  const transferableSupported = hasTransferableObjectSupport();

  const capabilities: BrowserWorkerCapabilityStatus[] = [
    {
      name: 'worker',
      adapter: 'dedicated-worker',
      supported: workerSupported,
      enabled: workerSupported,
      reason: workerSupported ? undefined : 'The Web Worker API (globalThis.Worker) is not available in this environment.',
    },
    {
      name: 'shared-worker',
      adapter: 'shared-worker',
      supported: sharedWorkerSupported,
      enabled: sharedWorkerSupported,
      reason: sharedWorkerSupported ? undefined : 'SharedWorker is not available in this browser context.',
    },
    {
      name: 'module-worker',
      adapter: 'dedicated-worker',
      supported: moduleWorkerSupported,
      enabled: moduleWorkerSupported,
      reason: moduleWorkerSupported
        ? undefined
        : 'This browser does not support { type: "module" } workers; classic worker scripts are used instead.',
    },
    {
      name: 'transferable-objects',
      adapter: 'dedicated-worker',
      supported: transferableSupported,
      enabled: transferableSupported,
      reason: transferableSupported ? undefined : 'Transferable objects (ArrayBuffer/MessageChannel) are not available.',
    },
  ];

  const hostOnly: BrowserWorkerCapabilityStatus[] = [
    {
      name: 'worker-threads',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Node worker_threads is only available through src/workers/host.ts in a Node.js process.',
    },
    {
      name: 'child-process',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Node child_process subprocess workers are only available through src/workers/host.ts.',
    },
    {
      name: 'filesystem',
      adapter: 'host-only',
      supported: false,
      enabled: false,
      reason: 'Node filesystem access for worker script resolution is only available through src/workers/host.ts.',
    },
  ];

  const gaps: BrowserWorkerCapabilityGap[] = capabilities
    .filter(capability => !capability.enabled)
    .map(capability => ({
      name: capability.name,
      adapter: capability.adapter,
      reason: capability.reason ?? `${capability.name} capability is unavailable in this environment.`,
    }));

  return {
    runtime: 'browser',
    browserSafe: true,
    capabilities,
    gaps,
    hostOnly,
  };
}

export function summarizeBrowserWorkerCapabilityGaps(report: BrowserWorkerRuntimeReport): string[] {
  const lines = report.gaps.map(gap => `- ${gap.name}: ${gap.reason}`);
  if (report.hostOnly.length > 0) {
    lines.push('- worker-threads/child-process/filesystem: Node worker execution is host-only; see src/workers/host.ts.');
  }
  return lines;
}

export function assertBrowserWorkerRuntime(): void {
  if (!hasWebWorkerSupport()) {
    throw new Error('SwissKnife browser worker APIs require the Web Worker API (globalThis.Worker).');
  }
}

/* -------------------------------------------------------------------------
 * Known static worker scripts
 *
 * These reference the plain, dependency-free Web Worker scripts shipped in
 * `public/workers/*.js`. They are loaded only by URL (`new Worker(url)`),
 * never statically imported, so they stay out of every JS bundle graph.
 * ---------------------------------------------------------------------- */

export const BROWSER_WORKER_SCRIPTS = {
  ai: '/workers/ai-worker.js',
  audio: '/workers/audio-worker.js',
  compute: '/workers/compute-worker.js',
  file: '/workers/file-worker.js',
  gpu: '/workers/gpu-worker.js',
} as const;

export type BrowserWorkerScriptName = keyof typeof BROWSER_WORKER_SCRIPTS;

/* -------------------------------------------------------------------------
 * Single worker client
 * ---------------------------------------------------------------------- */

export interface BrowserWorkerClientOptions {
  /** URL (or path) to the worker script, e.g. `BROWSER_WORKER_SCRIPTS.compute`. */
  scriptUrl: string | URL;
  /** Native `Worker` constructor options. Defaults to a classic worker to match `public/workers/*.js`. */
  workerOptions?: WorkerOptions;
  /** Factory override for constructing the underlying `Worker`; used by tests and alternate adapters. */
  createWorker?: (scriptUrl: string | URL, options?: WorkerOptions) => Worker;
  id?: string;
}

interface PendingBrowserWorkerTask {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

function generateBrowserWorkerId(prefix = 'browser-worker'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Wraps a single Web Worker with a task/response protocol compatible with
 * the scripts in `public/workers/*.js`. Uses only `postMessage`,
 * `addEventListener('message'|'error', ...)`, and `terminate()`.
 */
export class BrowserWorkerClient {
  readonly id: string;
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingBrowserWorkerTask>();
  private status: 'idle' | 'busy' | 'error' | 'terminated' = 'idle';

  constructor(options: BrowserWorkerClientOptions) {
    assertBrowserWorkerRuntime();
    this.id = options.id ?? generateBrowserWorkerId();
    const factory = options.createWorker ?? ((scriptUrl, workerOptions) => new Worker(scriptUrl, workerOptions));
    this.worker = factory(options.scriptUrl, options.workerOptions);
    this.worker.addEventListener('message', this.handleMessage as EventListener);
    this.worker.addEventListener('error', this.handleError as EventListener);
    this.worker.addEventListener('messageerror', this.handleMessageError as EventListener);
  }

  private handleMessage = (event: MessageEvent<BrowserWorkerInboundMessage>): void => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'response') {
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
    } else if (message.type === 'status') {
      this.status = message.status;
    }
  };

  private handleError = (event: ErrorEvent): void => {
    this.status = 'error';
    const error = new Error(event?.message || 'Browser worker error');
    for (const pending of this.pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  };

  private handleMessageError = (): void => {
    this.status = 'error';
    const error = new Error('Browser worker received an un-deserializable message');
    for (const pending of this.pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  };

  getStatus(): 'idle' | 'busy' | 'error' | 'terminated' {
    return this.status;
  }

  isIdle(): boolean {
    return this.status === 'idle';
  }

  async executeTask<T = unknown>(taskType: string, data: unknown, options: BrowserWorkerTaskOptions = {}): Promise<T> {
    if (this.status === 'terminated') {
      throw new Error(`Browser worker ${this.id} has been terminated.`);
    }

    const taskId = generateBrowserWorkerId('browser-task');
    this.status = 'busy';
    const message: BrowserWorkerTaskMessage = { type: 'task', taskId, taskType, data };

    const resultPromise = new Promise<T>((resolve, reject) => {
      const pending: PendingBrowserWorkerTask = {
        resolve: resolve as (result: unknown) => void,
        reject,
      };
      if (options.timeoutMs !== undefined) {
        pending.timer = setTimeout(() => {
          this.pending.delete(taskId);
          reject(new Error(`Browser worker task ${taskId} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs);
      }
      this.pending.set(taskId, pending);
    });

    if (options.transfer && options.transfer.length > 0) {
      this.worker.postMessage(message, options.transfer);
    } else {
      this.worker.postMessage(message);
    }

    return resultPromise;
  }

  terminate(): void {
    if (this.status === 'terminated') return;
    this.worker.removeEventListener('message', this.handleMessage as EventListener);
    this.worker.removeEventListener('error', this.handleError as EventListener);
    this.worker.removeEventListener('messageerror', this.handleMessageError as EventListener);
    this.worker.terminate();
    this.status = 'terminated';
    const error = new Error(`Browser worker ${this.id} terminated`);
    for (const pending of this.pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

/* -------------------------------------------------------------------------
 * Worker pool
 * ---------------------------------------------------------------------- */

export interface BrowserWorkerPoolOptions {
  /** URL (or path) to the worker script shared by every worker in the pool. */
  scriptUrl: string | URL;
  /** Number of Web Workers to create. Defaults to 1. */
  size?: number;
  workerOptions?: WorkerOptions;
  /** Default per-task timeout applied when a task does not specify its own. */
  taskTimeoutMs?: number;
  createWorker?: (scriptUrl: string | URL, options?: WorkerOptions) => Worker;
}

interface QueuedBrowserWorkerTask {
  taskType: string;
  data: unknown;
  options: BrowserWorkerTaskOptions;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface BrowserWorkerPoolStats {
  runtime: 'browser';
  totalWorkers: number;
  idleWorkers: number;
  queueLength: number;
}

/**
 * Manages a pool of `BrowserWorkerClient` instances backed by real Web
 * Workers. Round-robins tasks across idle workers and queues overflow work.
 */
export class BrowserWorkerPool {
  private clients: BrowserWorkerClient[] = [];
  private queue: QueuedBrowserWorkerTask[] = [];
  private readonly taskTimeoutMs?: number;
  private terminated = false;

  constructor(private readonly options: BrowserWorkerPoolOptions) {
    assertBrowserWorkerRuntime();
    const size = Math.max(1, options.size ?? 1);
    this.taskTimeoutMs = options.taskTimeoutMs;
    for (let i = 0; i < size; i += 1) {
      this.clients.push(
        new BrowserWorkerClient({
          scriptUrl: options.scriptUrl,
          workerOptions: options.workerOptions,
          createWorker: options.createWorker,
        }),
      );
    }
  }

  getWorkerCount(): number {
    return this.clients.length;
  }

  getIdleWorkerCount(): number {
    return this.clients.filter(client => client.isIdle()).length;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getStats(): BrowserWorkerPoolStats {
    return {
      runtime: 'browser',
      totalWorkers: this.getWorkerCount(),
      idleWorkers: this.getIdleWorkerCount(),
      queueLength: this.getQueueLength(),
    };
  }

  async executeTask<T = unknown>(taskType: string, data: unknown, options: BrowserWorkerTaskOptions = {}): Promise<T> {
    if (this.terminated) {
      throw new Error('Browser worker pool has been terminated.');
    }

    const mergedOptions: BrowserWorkerTaskOptions = {
      ...options,
      timeoutMs: options.timeoutMs ?? this.taskTimeoutMs,
    };

    const idleClient = this.clients.find(client => client.isIdle());
    if (idleClient) {
      return this.dispatchToClient<T>(idleClient, taskType, data, mergedOptions);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        taskType,
        data,
        options: mergedOptions,
        resolve: resolve as (result: unknown) => void,
        reject,
      });
      this.drainQueueSoon();
    });
  }

  private dispatchToClient<T>(
    client: BrowserWorkerClient,
    taskType: string,
    data: unknown,
    options: BrowserWorkerTaskOptions,
  ): Promise<T> {
    const taskPromise = client.executeTask<T>(taskType, data, options);
    // Whenever a dispatched task settles, a worker becomes idle again, so
    // re-check the queue for work that was waiting on capacity.
    taskPromise.then(
      () => this.drainQueueSoon(),
      () => this.drainQueueSoon(),
    );
    return taskPromise;
  }

  private drainQueueSoon(): void {
    Promise.resolve().then(() => this.drainQueue());
  }

  private drainQueue(): void {
    while (this.queue.length > 0) {
      const idleClient = this.clients.find(client => client.isIdle());
      if (!idleClient) return;
      const next = this.queue.shift();
      if (!next) return;
      this.dispatchToClient(idleClient, next.taskType, next.data, next.options).then(next.resolve, next.reject);
    }
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    for (const client of this.clients) client.terminate();
    this.clients = [];
    const error = new Error('Browser worker pool terminated');
    for (const queued of this.queue) queued.reject(error);
    this.queue = [];
  }
}

export function createBrowserWorkerPool(options: BrowserWorkerPoolOptions): BrowserWorkerPool {
  return new BrowserWorkerPool(options);
}

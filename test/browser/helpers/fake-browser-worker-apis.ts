// test/browser/helpers/fake-browser-worker-apis.ts
//
// Minimal, dependency-free fake for the Web Worker API that
// `src/workers/browser.ts` targets. Exists purely to exercise the real
// `BrowserWorkerClient`/`BrowserWorkerPool` code paths under Vitest's
// happy-dom environment, which does not implement `Worker`. Only the subset
// of the API used by `src/workers/browser.ts` is implemented:
// `postMessage`, `addEventListener`/`removeEventListener`, and `terminate`.

import { vi } from 'vitest';

type Listener = (event: any) => void;

export interface FakeWorkerTaskMessage {
  type: 'task';
  taskId: string;
  taskType: string;
  data: unknown;
}

/**
 * A fake `Worker` whose "script" is a synchronous handler function supplied
 * by the test. Responses are delivered asynchronously (via a microtask) to
 * mirror real `postMessage` semantics.
 */
export class FakeWorker implements Partial<Worker> {
  static instances: FakeWorker[] = [];

  readonly scriptUrl: string;
  readonly options: WorkerOptions | undefined;
  terminated = false;
  posted: unknown[] = [];

  private listeners = new Map<string, Set<Listener>>();
  private handler: (message: FakeWorkerTaskMessage) => Promise<{ result?: unknown; error?: string }> | { result?: unknown; error?: string };

  constructor(
    scriptUrl: string | URL,
    options: WorkerOptions | undefined,
    handler: FakeWorker['handler'],
  ) {
    this.scriptUrl = String(scriptUrl);
    this.options = options;
    this.handler = handler;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  postMessage(message: FakeWorkerTaskMessage, _transfer?: Transferable[]): void {
    this.posted.push(message);
    if (this.terminated) return;

    Promise.resolve()
      .then(() => this.handler(message))
      .then(outcome => {
        if (this.terminated) return;
        this.emit('message', {
          data: {
            type: 'response',
            taskId: message.taskId,
            result: outcome?.result,
            error: outcome?.error,
          },
        });
      })
      .catch(error => {
        if (this.terminated) return;
        this.emit('message', {
          data: {
            type: 'response',
            taskId: message.taskId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });
  }

  terminate(): void {
    this.terminated = true;
  }

  simulateError(message = 'Simulated worker error'): void {
    this.emit('error', { message });
  }
}

export type FakeWorkerHandler = FakeWorker['handler'];

/**
 * Installs a fake `globalThis.Worker` constructor backed by `FakeWorker`.
 * Every constructed worker uses the same `handler` to answer tasks unless a
 * per-script override is provided via `handlersByScript`.
 */
export function installFakeWorker(
  handler: FakeWorkerHandler,
  handlersByScript?: Record<string, FakeWorkerHandler>,
): void {
  FakeWorker.instances = [];
  const FakeWorkerConstructor = function (this: unknown, scriptUrl: string | URL, options?: WorkerOptions) {
    const scriptSpecificHandler = handlersByScript?.[String(scriptUrl)] ?? handler;
    return new FakeWorker(scriptUrl, options, scriptSpecificHandler);
  } as unknown as typeof Worker;

  vi.stubGlobal('Worker', FakeWorkerConstructor);
}

export function uninstallFakeWorker(): void {
  FakeWorker.instances = [];
}

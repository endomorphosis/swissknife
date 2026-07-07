/**
 * Minimal EventEmitter-compatible helper for browser-facing service modules.
 *
 * It intentionally implements only the small subset used by the services:
 * `on`, `once`, `off`, `emit`, `removeAllListeners`, and `setMaxListeners`.
 */

export type BrowserEventListener = (...args: unknown[]) => void;

export class BrowserEventEmitter {
  private readonly listeners = new Map<string, Set<BrowserEventListener>>();

  on(event: string, listener: BrowserEventListener): this {
    const bucket = this.listeners.get(event) ?? new Set<BrowserEventListener>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
    return this;
  }

  once(event: string, listener: BrowserEventListener): this {
    const wrapped: BrowserEventListener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: BrowserEventListener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  removeListener(event: string, listener: BrowserEventListener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string): this {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return false;
    for (const listener of [...bucket]) listener(...args);
    return true;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  setMaxListeners(_count: number): this {
    return this;
  }
}

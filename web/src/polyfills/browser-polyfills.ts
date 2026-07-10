/**
 * Browser polyfills for Node.js functionality
 */

// Global process polyfill
const browserGlobal = globalThis as unknown as {
  process?: any;
  Buffer?: any;
};

if (typeof window !== 'undefined' && !browserGlobal.process) {
  browserGlobal.process = {
    env: {},
    argv: [],
    cwd: () => '/',
    nextTick: (cb: Function) => setTimeout(cb, 0),
    platform: 'browser',
    version: 'browser',
    exit: () => {},
    stderr: { write: console.error },
    stdout: { write: console.log }
  };
}

// Buffer polyfill
if (typeof browserGlobal.Buffer === 'undefined') {
  browserGlobal.Buffer = {
    from: (data: any) => new Uint8Array(data),
    alloc: (size: number) => new Uint8Array(size),
    isBuffer: () => false
  };
}

// Console polyfills
if (typeof console === 'undefined') {
  (globalThis as any).console = {
    log: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {}
  };
}

// Export for TypeScript
export {};

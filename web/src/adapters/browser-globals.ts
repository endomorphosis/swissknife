/**
 * Browser globals and polyfills for Node.js-specific functionality
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
  } as any;
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

// Buffer polyfill (if not already available)
if (typeof browserGlobal.Buffer === 'undefined') {
  browserGlobal.Buffer = {
    from: (data: any) => new Uint8Array(data),
    alloc: (size: number) => new Uint8Array(size),
    isBuffer: () => false
  };
}

export {};

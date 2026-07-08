import { defineConfig } from 'vite';
import { resolve } from 'path';

// Browser worker build for SwissKnife.
//
// This config builds ONLY `src/workers/browser.ts`, the browser-safe Web
// Worker runtime (Web Worker APIs + transferable messages, no Node APIs).
// The Node worker_threads/child_process/filesystem runtime in
// `src/workers/host.ts` (and the legacy implementation files it wraps:
// `pool.ts`, `thread.ts`, `worker.ts`, `worker-pool.ts`, `worker-thread.ts`,
// `pool/worker-pool.ts`) is host-only and must never be an entry point here.
//
// `rollupOptions.external` additionally guards against any accidental
// transitive import of a Node built-in: if one sneaks in, the build fails
// loudly instead of silently shipping (or worse, breaking on) a
// `__vite-browser-external` stub in the browser bundle.
const HOST_ONLY_EXTERNALS = [
  'worker_threads',
  'node:worker_threads',
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'path',
  'node:path',
  'os',
  'node:os',
];

export default defineConfig({
  build: {
    outDir: 'dist/workers',
    lib: {
      entry: {
        browser: resolve(__dirname, '../../src/workers/browser.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external: HOST_ONLY_EXTERNALS,
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        manualChunks: undefined
      }
    },
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src'),
      '@workers': resolve(__dirname, '../../src/workers'),
      '@shared': resolve(__dirname, '../../src/shared')
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.VITE_MODE': JSON.stringify(process.env.VITE_MODE || 'workers')
  }
});
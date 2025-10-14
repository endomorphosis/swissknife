import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/workers',
    lib: {
      entry: {
        'worker': resolve(__dirname, '../../src/workers/worker.ts'),
        'worker-thread': resolve(__dirname, '../../src/workers/worker-thread.ts'),
        'worker-pool': resolve(__dirname, '../../src/workers/worker-pool.ts')
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external: [],
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
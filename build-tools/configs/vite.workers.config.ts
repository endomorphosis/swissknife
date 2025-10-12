import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/workers',
    lib: {
      entry: {
        'compute-worker': resolve(__dirname, '../../src/workers/compute-worker.ts'),
        'audio-worker': resolve(__dirname, '../../src/workers/audio-worker.ts'),
        'ai-worker': resolve(__dirname, '../../src/workers/ai-worker.ts'),
        'file-worker': resolve(__dirname, '../../src/workers/file-worker.ts'),
        'crypto-worker': resolve(__dirname, '../../src/workers/crypto-worker.ts'),
        'p2p-worker': resolve(__dirname, '../../src/workers/p2p-worker.ts'),
        'ipfs-worker': resolve(__dirname, '../../src/workers/ipfs-worker.ts')
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
import { defineConfig } from 'vite'
import { resolve } from 'path'

// IPFS Accelerate specific Vite configuration
export default defineConfig({
  root: './ipfs_accelerate_js',
  
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, '../../ipfs_accelerate_js/src/index.simple.ts'),
      name: 'IPFSAccelerate',
      fileName: (format) => `ipfs-accelerate.${format}.js`,
      formats: ['es', 'cjs', 'umd']
    },
    rollupOptions: {
      external: ['react'],
      output: {
        globals: {
          react: 'React'
        }
      }
    },
    target: 'es2020'
  },
  
  server: {
    port: 3002,
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  
  resolve: {
    alias: {
      '@ipfs': resolve(__dirname, '../../ipfs_accelerate_js/src'),
      '@': resolve(__dirname, '../../src'),
      // Browser polyfills for WebGPU testing
      'crypto': 'crypto-browserify',
      'stream': 'stream-browserify',
      'path': 'path-browserify',
      'os': 'os-browserify',
      'process': 'process/browser',
      'buffer': 'buffer',
      'util': 'util'
    }
  },
  
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.SWISSKNIFE_IPFS': '"true"'
  },
  
  optimizeDeps: {
    include: [
      'idb',
      'crypto-browserify',
      'buffer',
      'util'
    ]
  },
  
  // Enable WebGPU for development and testing
})
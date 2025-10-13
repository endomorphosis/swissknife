import { defineConfig } from 'vite'
import { resolve } from 'path'

// Web GUI specific Vite configuration
export default defineConfig({
  root: './web',
  base: './',
  
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: './web/index.html'
    },
    target: 'es2020'
  },
  
  server: {
    port: 3001,
    host: true
  },
  
  resolve: {
    alias: {
      '@web': resolve(__dirname, '../../web/src'),
      '@': resolve(__dirname, '../../src'),
      '@ipfs': resolve(__dirname, '../../ipfs_accelerate_js/src'),
      // Browser polyfills
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
    'process.env.SWISSKNIFE_WEB': '"true"'
  },
  
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@anthropic-ai/sdk',
      'openai',
      '@strudel/core',
      '@strudel/webaudio',
      'crypto-browserify',
      'stream-browserify',
      'path-browserify',
      'os-browserify',
      'process',
      'buffer',
      'util'
    ]
  }
})
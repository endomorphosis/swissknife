import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'node18',
    rollupOptions: {
      // Treat these as standard multi-entry inputs instead of library mode to
      // avoid path rewriting issues we observed (build-tools/configs prefixing).
      input: {
        cli: resolve(__dirname, 'src/entrypoints/cli.tsx'),
        web: resolve(__dirname, 'web/src/index.ts'),
        ipfs: resolve(__dirname, 'ipfs_accelerate_js/src/index.ts')
      },
      external: [
        'node:fs',
        'node:path',
        'node:url',
        'node:process',
        'react',
        'react-dom'
      ]
    }
  },

  // Development server configuration
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: ['..']
    }
  },

  // Module resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@web': resolve(__dirname, 'web/src'),
      '@ipfs': resolve(__dirname, 'ipfs_accelerate_js/src'),
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

  // Define global constants
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  },

  // Optimized dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@anthropic-ai/sdk',
      'openai',
      'crypto-browserify',
      'stream-browserify',
      'path-browserify',
      'os-browserify',
      'process',
      'buffer',
      'util'
    ]
  },

  // Environment variables
  envPrefix: 'SWISSKNIFE_',

  // Plugin configuration will be added based on specific needs
  plugins: []
})
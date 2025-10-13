import { defineConfig } from 'vite'
import { resolve } from 'path'

// CLI-specific Vite configuration
export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, '../../src/cli-simple.ts'),
      name: 'SwissKnifeCLI',
      fileName: 'cli',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        // Node.js built-ins
        'fs', 'path', 'os', 'crypto', 'stream', 'util', 'url',
        'child_process', 'readline', 'events', 'process',
        // CLI-specific externals
        'ink', 'react', 'commander'
      ]
    },
    target: 'node18',
    ssr: true
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src')
    }
  },
  
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.SWISSKNIFE_CLI': '"true"'
  }
})
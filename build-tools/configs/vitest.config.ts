import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // Test environment configuration
    environment: 'happy-dom', // Faster than jsdom for most cases
    
    // Global test setup
    globals: true,
    setupFiles: ['./test/setup.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        '**/*.config.*',
        '**/*.test.*',
        '**/*.spec.*'
      ]
    },
    
    // File patterns - simplified to work from root
    include: [
      'test/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'web/src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'ipfs_accelerate_js/test/**/*.{test,spec}.{js,ts,jsx,tsx}'
    ],
    
    // Test timeout
    testTimeout: 15000,
    
    // Browser testing configuration for AI inference testing
    browser: {
      enabled: false, // Disabled by default, can be enabled per test
      provider: 'playwright',
      name: 'chromium',
      headless: true
    }
  },
  
  // Resolve configuration (shared with main vite.config.ts)
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@web': resolve(__dirname, 'web/src'),
      '@ipfs': resolve(__dirname, 'ipfs_accelerate_js/src'),
      // Browser polyfills for testing
      'crypto': 'crypto-browserify',
      'stream': 'stream-browserify', 
      'path': 'path-browserify',
      'os': 'os-browserify',
      'process': 'process/browser',
      'buffer': 'buffer',
      'util': 'util'
    }
  },
  
  // Define global constants for tests
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"test"'
  }
})
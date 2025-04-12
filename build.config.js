/**
 * SwissKnife CLI Build Configuration
 * 
 * This configuration file defines how the SwissKnife CLI should be bundled,
 * addressing common build issues with terminal libraries and dynamic imports.
 */

export default {
  /**
   * External dependencies that should not be bundled
   * This prevents transformations that could break their APIs
   */
  external: [
    // Node.js built-in modules
    'fs', 'path', 'os', 'stream', 'crypto', 'util', 'events', 'child_process',
    'readline', 'tty', 'net', 'http', 'https', 'zlib', 'worker_threads',
    
    // Terminal UI and color libraries
    'chalk', 'kleur', 'ink', 'ansi-escapes', 'ansi-styles', 'supports-color',
    'figures', 'cli-cursor', 'has-flag', 'cli-highlight', 'wrap-ansi',
    
    // React-related (for Ink)
    'react', 'react-devtools-core',
    
    // Other problematic dependencies
    '@inkjs/ui', 'ink-link'
  ],
  
  /**
   * Output configuration
   */
  output: {
    format: 'esm',
    target: 'node18',
    banner: '#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --enable-source-maps',
  },
  
  /**
   * Build optimizations
   */
  optimizations: {
    // Disable tree-shaking for problematic dependencies
    treeShaking: {
      enabled: true,
      exclude: ['chalk', 'kleur', 'ink']
    },
    
    // Control minification
    minify: {
      enabled: true,
      keepNames: true, // Preserve function names for better error messages
      mangle: {
        keep: ['__', '$', 'default'] // Keep certain property names
      }
    }
  },
  
  /**
   * Special handling for dynamic imports
   */
  dynamicImports: {
    // Paths that should be allowed to use dynamic imports
    allowDynamicImportIn: [
      'src/utils/safe-colors.ts'
    ]
  },
  
  /**
   * Environment variables to define during build
   */
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  
  /**
   * esbuild-specific settings
   */
  esbuild: {
    // Keep these global names as is (don't mangle them)
    keepNames: true,
    
    // Additional esbuild plugins
    plugins: []
  },
  
  /**
   * Bun-specific settings
   */
  bun: {
    // Bun-specific external modules (if different from main list)
    external: []
  }
};

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import nodePolyfills from 'rollup-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  if (mode === 'cli') {
    return {
      plugins: [tsconfigPaths()], // No react plugin for CLI
      define: {
        'process.env.BUILD_TARGET': JSON.stringify('cli'),
      },
      build: {
        lib: {
          entry: resolve(__dirname, 'src/entrypoints/cli.tsx'), // Assuming your CLI entry point
          name: 'cli',
          fileName: (format) => `cli.${format}.js`,
          formats: ['es', 'cjs'],
        },
        outDir: resolve(__dirname, 'dist/cli'),
        emptyOutDir: true,
        rollupOptions: {
          external: ['fs', 'path', '@modelcontextprotocol/sdk', 'child_process'], // Mark Node.js built-ins and mcp sdk as external
        },
        target: 'node',
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, 'src'),
          '@modelcontextprotocol/sdk': resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk'),
          // Add any necessary aliases here for CLI
        },
      },
    };
  } else {
    // Default to desktop build
    return {
      plugins: [react(), tsconfigPaths()],
      define: {
        'process.env.BUILD_TARGET': JSON.stringify('web'),
      },
      root: resolve(__dirname, 'web'), // Set the root to the 'web' directory
      build: {
        outDir: resolve(__dirname, 'dist/web'), // Output to dist/web
        emptyOutDir: true,
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'web/src/unified-main.ts'),
            'desktop-core': resolve(__dirname, 'web/src/desktop-core.ts'),
          },
          output: {
            entryFileNames: `assets/[name].[hash].js`,
            chunkFileNames: `assets/[name].[hash].js`,
            assetFileNames: `assets/[name].[hash].[ext]`,
          },
          external: ['child_process', 'stubborn-fs', './src/integration/legacy/swissknife-bridge.ts'], // Externalize child_process, stubborn-fs, and legacy bridge
        },
      },
      resolve: {
        alias: {
          'conf': resolve(__dirname, 'web/src/mocks/conf.ts'),
          // Add any necessary aliases here, e.g., for Node.js polyfills
        },
      },
      server: {
        port: 8000,
        open: true,
      },
      optimizeDeps: {
        include: ['react-dom/client', 'xterm'],
      },
      publicDir: resolve(__dirname, 'web/public'), // Vite's public directory
    };
  }
});
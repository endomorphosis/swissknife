import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import nodePolyfills from 'rollup-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  if (mode === 'cli') {
    return {
      plugins: [tsconfigPaths()],
      define: {
        'process.env.BUILD_TARGET': JSON.stringify('cli'),
      },
      build: {
        lib: {
          entry: resolve(__dirname, 'src/entrypoints/cli.tsx'),
          name: 'cli',
          fileName: (format) => `cli.${format}.js`,
          formats: ['es', 'cjs'],
        },
        outDir: resolve(__dirname, 'dist/cli'),
        emptyOutDir: true,
        rollupOptions: {
          external: ['fs', 'path', '@modelcontextprotocol/sdk', 'child_process'],
        },
        target: 'node',
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, 'src'),
          '@modelcontextprotocol/sdk': resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk'),
        },
      },
    };
  } else {
    // Default to web build (desktop)
    return {
      plugins: [
        tsconfigPaths(),
        nodePolyfills({
            // To exclude specific polyfills, add them to this list.
            exclude: ['fs'],
        }),
        react({ jsxRuntime: 'classic' }),
      ],
      define: {
        'process.env.BUILD_TARGET': JSON.stringify('web'),
        'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
        global: 'window',
      },
      root: resolve(__dirname, 'web'),
      build: {
        outDir: resolve(__dirname, 'dist/web'),
        emptyOutDir: true,
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'web/index.html'),
          },
          output: {
            entryFileNames: `assets/[name].[hash].js`,
            chunkFileNames: `assets/[name].[hash].js`,
            assetFileNames: `assets/[name].[hash].[ext]`,
          },
           external: ['child_process', 'stubborn-fs', './src/integration/legacy/swissknife-bridge.ts'],
        },
      },
      resolve: {
        alias: {
          'conf': resolve(__dirname, 'web/src/mocks/conf.ts'),
          // Replicating webpack fallbacks
          'stream': 'stream-browserify',
          'crypto': resolve(__dirname, 'web/src/polyfills/crypto.ts'),
          'crypto-browserify': 'crypto-browserify',
          'path': 'path-browserify',
          'util': 'util',
          'buffer': 'buffer',
          'process': 'rollup-plugin-node-polyfills/polyfills/process-es6.js',
          'os': 'os-browserify/browser',
        },
      },
      server: {
        port: 8000,
        open: true,
        hot: true,
        liveReload: true,
        historyApiFallback: true,
        host: true, // This allows access from other devices on the network
        headers: {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-.methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
        },
      },
      optimizeDeps: {
        include: ['react-dom/client', 'xterm'],
      },
      publicDir: resolve(__dirname, 'web/public'),
    };
  }
});
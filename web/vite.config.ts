
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import nodePolyfills from 'rollup-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
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
    root: __dirname,
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          entryFileNames: `assets/[name].[hash].js`,
          chunkFileNames: `assets/[name].[hash].js`,
          assetFileNames: `assets/[name].[hash].[ext]`,
        },
      },
    },
    resolve: {
      alias: {
        'conf': resolve(__dirname, 'src/mocks/conf.ts'),
        // Replicating webpack fallbacks
        'stream': 'stream-browserify',
        'crypto': resolve(__dirname, 'src/polyfills/crypto.ts'),
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
    publicDir: resolve(__dirname, 'public'),
  };
});

const path = require('path');

module.exports = {
  mode: 'development',
  entry: './test-compilation.ts',
  
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'], // Prioritize .ts and .tsx
    modules: ['node_modules', path.resolve(__dirname, '../src')], // Add src to module resolution paths
    fallback: {
      "chalk": false, // Ignore chalk for browser
      "react": false, // Ignore react for browser (for now)
      // Node.js polyfills
      "buffer": require.resolve("buffer"),
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "process": require.resolve("process/browser"),
      "path": require.resolve("path-browserify"),
      "os": require.resolve("os-browserify"),
      "util": require.resolve("util"),
      "fs": false,
      "child_process": false,
      "worker_threads": false,
      "tty": false,
      "net": false,
      "http": false,
      "https": false,
      "url": false,
      "querystring": false,
      "zlib": false
    },
    alias: {
      // Direct imports from main codebase
      '@swissknife/utils': path.resolve(__dirname, '../src/utils'),
      '@swissknife/types': path.resolve(__dirname, '../src/types'),
      '@swissknife/constants': path.resolve(__dirname, '../src/constants'),
      '@swissknife/ai': path.resolve(__dirname, '../src/ai'),
      '@swissknife/config': path.resolve(__dirname, '../src/config'),
    }
  },
  
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.web.json'),
              transpileOnly: true,
              compilerOptions: {
                // Override for browser compatibility
                target: 'es2020',
                module: 'esnext',
                moduleResolution: 'node',
                allowSyntheticDefaultImports: true,
                esModuleInterop: true
              }
            }
          }
        ],
        include: [
          path.resolve(__dirname, './'), // Include web directory
          path.resolve(__dirname, '../src') // Include main src directory
        ],
        exclude: /node_modules/,
      }
    ]
  },
  
  output: {
    path: path.resolve(__dirname, 'test-dist'),
    filename: 'compilation-test.js'
  },
  
  plugins: [
    new (require('webpack')).ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ]
};

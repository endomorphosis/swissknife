const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      main: './src/browser-main.ts',
      'swissknife-core': './src/swissknife-browser-core.ts',
      desktop: './js/main-working.js' // Keep existing desktop manager
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].[contenthash].js',
      clean: true,
      publicPath: './',
      library: {
        type: 'module',
      },
    },
    
    experiments: {
      outputModule: true,
    },
    
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      
      // Direct aliases to main TypeScript source
      alias: {
        // Core SwissKnife modules
        '@swissknife/ai': path.resolve(__dirname, '../src/ai'),
        '@swissknife/tasks': path.resolve(__dirname, '../src/tasks'),
        '@swissknife/storage': path.resolve(__dirname, '../src/storage'),
        '@swissknife/commands': path.resolve(__dirname, '../src/commands'),
        '@swissknife/core': path.resolve(__dirname, '../src/core'),
        '@swissknife/utils': path.resolve(__dirname, '../src/utils'),
        '@swissknife/models': path.resolve(__dirname, '../src/models'),
        '@swissknife/types': path.resolve(__dirname, '../src/types'),
        '@swissknife/config': path.resolve(__dirname, '../src/config'),
        '@swissknife/cli': path.resolve(__dirname, '../src/cli'),
        '@swissknife/tools': path.resolve(__dirname, '../src/tools'),
        '@swissknife/ipfs': path.resolve(__dirname, '../src/ipfs'),
        '@swissknife/vector': path.resolve(__dirname, '../src/vector'),
        '@swissknife/ml': path.resolve(__dirname, '../src/ml'),
        '@swissknife/graph': path.resolve(__dirname, '../src/graph'),
        
        // Browser-specific overrides
        '@swissknife/storage/backends/fs': path.resolve(__dirname, 'src/adapters/browser-storage-backend.ts'),
        '@swissknife/cli/process': path.resolve(__dirname, 'src/adapters/browser-process.ts'),
        '@swissknife/tools/shell': path.resolve(__dirname, 'src/adapters/browser-shell.ts'),
      },
      
      fallback: {
        // Node.js core modules
        "buffer": require.resolve("buffer"),
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "process": require.resolve("process/browser"),
        "path": require.resolve("path-browserify"),
        "os": require.resolve("os-browserify"),
        "util": require.resolve("util"),
        "events": require.resolve("events"),
        "url": require.resolve("url"),
        "querystring": require.resolve("querystring-es3"),
        "assert": require.resolve("assert"),
        "constants": require.resolve("constants-browserify"),
        "timers": require.resolve("timers-browserify"),
        "string_decoder": require.resolve("string_decoder"),
        "punycode": require.resolve("punycode"),
        
        // Node.js modules not available in browser
        "fs": false,
        "child_process": false,
        "worker_threads": false,
        "tty": false,
        "net": false,
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "zlib": require.resolve("browserify-zlib"),
        "readline": false,
        "module": false,
        "cluster": false,
        "dgram": false,
        "dns": false,
        "http2": false,
        "perf_hooks": false,
        "inspector": false,
        "v8": false,
        "vm": false,
      },
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
                transpileOnly: false, // Enable type checking
                compilerOptions: {
                  target: 'ES2020',
                  module: 'ES2020',
                  moduleResolution: 'node',
                  allowSyntheticDefaultImports: true,
                  esModuleInterop: true,
                  skipLibCheck: true,
                  strict: true,
                  declaration: false,
                  sourceMap: !isProduction,
                }
              }
            }
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif|ico)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.worker\.js$/,
          use: { loader: 'worker-loader' },
        },
        {
          // Handle dynamic imports in SwissKnife modules
          test: /\.(ts|js)$/,
          include: path.resolve(__dirname, '../src'),
          use: [
            {
              loader: 'babel-loader',
              options: {
                presets: [
                  ['@babel/preset-env', {
                    targets: 'defaults',
                    modules: false
                  }]
                ],
                plugins: [
                  '@babel/plugin-proposal-dynamic-import',
                  '@babel/plugin-proposal-optional-chaining',
                  '@babel/plugin-proposal-nullish-coalescing-operator'
                ]
              }
            }
          ]
        }
      ],
    },
    
    plugins: [
      new HtmlWebpackPlugin({
        template: './template.html',
        filename: 'index.html',
        inject: 'body',
        chunks: ['main', 'desktop'],
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        } : false,
      }),
      
      new CopyWebpackPlugin({
        patterns: [
          { from: 'css', to: 'css' },
          { from: 'assets', to: 'assets', noErrorOnMissing: true },
          { from: 'favicon.ico', to: 'favicon.ico', noErrorOnMissing: true },
        ],
      }),
      
      // Provide global variables for Node.js compatibility
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser',
        global: 'global',
      }),
      
      // Define environment variables
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(argv.mode),
        'process.env.BROWSER': JSON.stringify(true),
        'global': 'globalThis',
        '__dirname': JSON.stringify('/'),
        '__filename': JSON.stringify('/index.js'),
      }),
      
      // Handle module replacement for browser compatibility
      new webpack.NormalModuleReplacementPlugin(
        /^fs$/,
        path.resolve(__dirname, 'src/adapters/browser-fs.ts')
      ),
      
      new webpack.NormalModuleReplacementPlugin(
        /^child_process$/,
        path.resolve(__dirname, 'src/adapters/browser-child-process.ts')
      ),
      
      // Replace Node.js specific modules with browser equivalents
      new webpack.NormalModuleReplacementPlugin(
        /readline/,
        path.resolve(__dirname, 'src/adapters/browser-readline.ts')
      ),
      
      // Ignore certain modules that can't be polyfilled
      new webpack.IgnorePlugin({
        resourceRegExp: /^(worker_threads|cluster)$/,
      }),
    ],
    
    optimization: isProduction ? {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: false, // Keep console for debugging
              drop_debugger: true,
            },
            format: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ],
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
          swissknife: {
            test: /[\\/]src[\\/]/,
            name: 'swissknife-core',
            chunks: 'all',
            priority: 20,
            enforce: true,
          },
          ai: {
            test: /[\\/]src[\\/]ai[\\/]/,
            name: 'swissknife-ai',
            chunks: 'all',
            priority: 30,
          },
          tasks: {
            test: /[\\/]src[\\/]tasks[\\/]/,
            name: 'swissknife-tasks',
            chunks: 'all',
            priority: 30,
          },
          storage: {
            test: /[\\/]src[\\/]storage[\\/]/,
            name: 'swissknife-storage',
            chunks: 'all',
            priority: 30,
          },
        },
      },
    } : {
      splitChunks: {
        chunks: 'all',
      },
    },
    
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
        watch: true,
      },
      compress: true,
      port: 8080,
      hot: true,
      liveReload: true,
      open: true,
      historyApiFallback: true,
      allowedHosts: 'all',
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
      },
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
        progress: true,
      },
    },
    
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    
    target: 'web',
    
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 5000000, // 5MB - larger due to TypeScript compilation
      maxAssetSize: 5000000, // 5MB
    },
    
    // Enable caching for faster rebuilds
    cache: {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
    },
  };
};

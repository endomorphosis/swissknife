const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const NodePolyfillWebpackPlugin = require('node-polyfill-webpack-plugin');



module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      // For the clean GUI version, we don't need webpack bundling
      // since index.html loads the scripts directly
      main: './src/unified-main.ts'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      clean: true,
      publicPath: './',
    },
    
    experiments: {
      asyncWebAssembly: true,
      topLevelAwait: true
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      fallback: {
        "assert": require.resolve("assert/"),
        "buffer": require.resolve("buffer/"),
        "crypto": require.resolve("crypto-browserify"),
        "events": require.resolve("events/"),
        "fs": false, // fs is not available in browser
        "os": require.resolve("os-browserify"),
        "path": require.resolve("path-browserify"),
        "process": require.resolve("process/browser"),
        "stream": require.resolve("stream-browserify"),
        "util": require.resolve("util/"),
        "url": require.resolve("url/"),
        "querystring": require.resolve("querystring-es3"),
        "zlib": require.resolve("browserify-zlib"),
        "child_process": false,
        "worker_threads": false,
        "tty": false,
        "net": false,
        "http": false,
        "https": false,
      },
      alias: {
        // Map source paths to web-compatible versions
        '@swissknife': path.resolve(__dirname, '../src'),
        '@legacy': path.resolve(__dirname, 'js'),
        '@': path.resolve(__dirname, 'src'),
        '@/adapters/ai-adapter': path.resolve(__dirname, 'src/adapters/browser-ai-adapter.ts'),
        '@swissknife/wasm': path.resolve(__dirname, 'src/wasm'),
        '@swissknife/core': path.resolve(__dirname, '../src'),
        "process": "process/browser", // Explicitly alias process to its browser polyfill
        'buffer': 'buffer/', // Explicitly alias buffer to its polyfill
        'globalThis': path.resolve(__dirname, './src/polyfills/globalThis.js'),
        'window': path.resolve(__dirname, './src/polyfills/globalThis.js'), // Alias window to globalThis polyfill
        'global': path.resolve(__dirname, './src/polyfills/globalThis.js'), // Alias global to globalThis polyfill
      },
      modules: [path.resolve(__dirname, 'src'), 'node_modules']
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.wasm$/,
          type: 'webassembly/async'
        }
      ]
    },
    
    
    
    
    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html', // Use existing index.html 
        filename: 'index.html',
        inject: 'body', // Don't inject scripts since index.html already has them
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
          // Legacy JS files for fallback/debugging - exclude broken files
          { 
            from: 'js', 
            to: 'js', 
            noErrorOnMissing: true,
            globOptions: {
              ignore: [
                '**/strudel-broken.js',
                '**/strudel-grandma-broken.js',
                '**/apps/strudel-broken.js',
                '**/apps/strudel-grandma-broken.js'
              ]
            }
          }
        ],
      }),
      new NodePolyfillWebpackPlugin(),
      
      // Provide global variables for Node.js compatibility
      new (require('webpack')).ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser',
        global: ['globalthis'],
        globalThis: ['globalthis']
      }),
      new (require('webpack')).NormalModuleReplacementPlugin(/globalThis/, function(resource) {
        resource.request = path.resolve(__dirname, './src/polyfills/globalThis.js');
      }),
      new (require('webpack')).NormalModuleReplacementPlugin(/window/, function(resource) {
        resource.request = path.resolve(__dirname, './src/polyfills/globalThis.js');
      }),
      new (require('webpack')).NormalModuleReplacementPlugin(/global/, function(resource) {
        resource.request = path.resolve(__dirname, './src/polyfills/globalThis.js');
      }),
      
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:assert$/, require.resolve('assert/')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:buffer$/, require.resolve('buffer/')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:crypto$/, require.resolve('crypto-browserify')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:events$/, require.resolve('events/')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:fs$/, false),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:os$/, require.resolve('os-browserify')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:path$/, require.resolve('path-browserify')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:process$/, require.resolve('process/browser')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:util$/, require.resolve('util/')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:url$/, require.resolve('url/')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:querystring$/, require.resolve('querystring-es3')),
      new (require('webpack')).NormalModuleReplacementPlugin(/^node:zlib$/, require.resolve('browserify-zlib')),

      new (require('webpack')).IgnorePlugin({
        resourceRegExp: /\.\/config\.js$/,
        contextRegExp: /libp2p\/dist\/src$/,
      }),

      // Define environment variables
      new (require('webpack')).IgnorePlugin({
        resourceRegExp: /conf/
      }),

      new (require('webpack')).DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(argv.mode),
        'process.env.BROWSER': JSON.stringify(true),
        'process.env.UNIFIED_BUILD': JSON.stringify(true),
        'global': 'window', // Use window for global in browser
      }),
    ],
    
    optimization: isProduction ? {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: false, // Keep console for stlite debugging
            },
          },
        }),
      ],
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          stlite: {
            test: /stlite/,
            name: 'stlite',
            chunks: 'all',
            priority: 20,
          },
          swissknife: {
            test: /[\\/]src[\\/]/,
            name: 'swissknife-core',
            chunks: 'all',
            priority: 10,
          },
        },
      },
    } : {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      },
    },
    
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
        watch: true,
      },
      watchFiles: ['js/**/*', 'css/**/*', 'assets/**/*', 'index.html'], // Explicitly watch only relevant files
      compress: true,
      port: 8080, // Changed to match unified system
      hot: true,   // Enable hot reload for development
      liveReload: true,
      open: true,  // Auto-open browser
      historyApiFallback: true,
      allowedHosts: 'all',
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
        logging: 'info',
      },
    },
    
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    
    target: 'web',
    
    node: {
      global: true,
    },

    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 3000000, // 3MB - increased for stlite
      maxAssetSize: 3000000, // 3MB
    },
  };
};

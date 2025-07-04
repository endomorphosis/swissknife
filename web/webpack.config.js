const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      // For the clean GUI version, we don't need webpack bundling
      // since index.html loads the scripts directly
      main: './js/main.js'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      clean: true,
      publicPath: './',
    },
    
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      fallback: {
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
        "url": require.resolve("url"),
        "querystring": false,
        "zlib": false
      },
      alias: {
        // Map source paths to web-compatible versions
        '@swissknife': path.resolve(__dirname, '../src'),
        '@legacy': path.resolve(__dirname, 'js'),
        '@': path.resolve(__dirname, 'src'),
        '@/adapters/ai-adapter': path.resolve(__dirname, 'src/adapters/browser-ai-adapter.ts')
      },
      modules: [path.resolve(__dirname, 'src'), 'node_modules']
    },
    
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: path.resolve(__dirname, 'tsconfig.json'),
                transpileOnly: !isProduction
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
      ],
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
      
      // Provide global variables for Node.js compatibility
      new (require('webpack')).ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser',
      }),
      
      // Define environment variables
      new (require('webpack')).DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(argv.mode),
        'process.env.BROWSER': JSON.stringify(true),
        'process.env.UNIFIED_BUILD': JSON.stringify(true),
        'global': 'globalThis',
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
      compress: true,
      port: 8000, // Changed to match unified system
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
    
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 3000000, // 3MB - increased for stlite
      maxAssetSize: 3000000, // 3MB
    },
  };
};
